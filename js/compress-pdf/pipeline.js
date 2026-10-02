/**
 * PDFMaster - Core Compression Pipeline Engine
 * High-performance, memory-guarded compression engine supporting Mode A (Lossless Vector)
 * and Mode B (Hardware-Adaptive Multi-Page Downsampling with IndexedDB Streaming).
 */
(function () {
  "use strict";

  const state = window.PDFCompressState;
  const { fmtBytes, showToast } = window.PDFCompressUtils;
  const storage = window.PDFCompressStorage;
  const canvasPool = window.PDFCompressCanvasPool;
  const health = window.PDFCompressHealth;
  const ui = window.PDFCompressUI;
  const device = window.PDFCompressDevice;

  async function runCompression() {
    if (!state.currentBlob || !state.pdfJsDoc) return;

    const startTime = performance.now();
    const settings = ui.getEffectiveSettings();
    const allowedPages = ui.parsePageRange(state.pageRange, state.totalPages);

    const hwConfig =
      state.hardwareConfig ||
      (device && device.detectHardwareCapabilities
        ? device.detectHardwareCapabilities()
        : { targetConcurrency: 4, estimatedRamGb: 4, profileName: "Balanced" });
    state.hardwareConfig = hwConfig;

    ui.showLoadingModal(
      true,
      "Compressing PDF…",
      "Preparing document compression…",
      5,
    );

    try {
      let outBlob;

      // ==================================================
      //  MODE A: 100% LOSSLESS VECTOR & OBJECT COMPACT
      // ==================================================
      if (settings.isLossless) {
        ui.updateLoadingProgress(
          20,
          "Loading PDF catalog and stream dictionaries…",
        );
        const arrayBuf = await state.currentBlob.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuf, {
          ignoreEncryption: true,
        });

        ui.updateLoadingProgress(
          50,
          "Stripping redundant metadata and unpackaging…",
        );
        pdfDoc.setProducer("PDFMaster (pdfmaster.co.in)");
        pdfDoc.setCreator("PDFMaster Client Compressor");

        ui.updateLoadingProgress(
          80,
          "Re-encoding Flate object streams with compression…",
        );
        const compressedBytes = await pdfDoc.save({
          useObjectStreams: true,
          addDefaultPage: false,
        });

        outBlob = new Blob([compressedBytes], { type: "application/pdf" });
      } else {
        // ==================================================
        //  MODE B: MULTI-PAGE ADAPTIVE CONCURRENT DOWNSAMPLING PIPELINE
        // ==================================================
        if (storage && storage.clearRenderedPagesFromDB) {
          await storage.clearRenderedPagesFromDB();
        }

        const newDoc = await PDFLib.PDFDocument.create();
        const total = state.totalPages;
        const targetDpi = Math.max(50, settings.dpi || 144);
        const scale = targetDpi / 72;
        const quality = Math.max(0.15, Math.min(0.95, settings.quality));

        // Configure hardware-calibrated parallel concurrency pipeline
        const targetMaxConcurrency = hwConfig.targetConcurrency;
        let currentConcurrency = targetMaxConcurrency;

        let nextPageToRender = 1;
        let nextPageToEmbed = 1;
        let pagesProcessedCount = 0;
        let lastYieldTime = performance.now();

        const inFlightRenders = new Map(); // pageNum -> Promise
        const completedPageMap = new Map(); // pageNum -> { origViewport, storedInDb, fallbackBlob }

        // Individual Page Render Task
        const executePageRender = async (pageNum) => {
          let slot = null;
          let page = null;
          try {
            page = await state.pdfJsDoc.getPage(pageNum);
            const origViewport = page.getViewport({ scale: 1.0 });

            const isUnselected = allowedPages && !allowedPages.has(pageNum);
            const renderViewport = isUnselected
              ? page.getViewport({ scale: 1.5 })
              : page.getViewport({ scale });

            const targetWidth = Math.round(renderViewport.width);
            const targetHeight = Math.round(renderViewport.height);
            slot = canvasPool.acquireCanvasSlot(targetWidth, targetHeight);

            await page.render({
              canvasContext: slot.ctx,
              viewport: renderViewport,
            }).promise;

            // Fast 32-bit Grayscale conversion if requested
            if (settings.grayscale && !isUnselected) {
              const imgData = slot.ctx.getImageData(
                0,
                0,
                slot.canvas.width,
                slot.canvas.height,
              );
              const d32 = new Uint32Array(imgData.data.buffer);
              const len = d32.length;
              for (let i = 0; i < len; i++) {
                const px = d32[i];
                const r = px & 0xff;
                const g = (px >> 8) & 0xff;
                const b = (px >> 16) & 0xff;
                const a = px & 0xff000000;
                const gray = (r * 77 + g * 151 + b * 28) >> 8;
                d32[i] = a | (gray << 16) | (gray << 8) | gray;
              }
              slot.ctx.putImageData(imgData, 0, 0);
            }

            const jpegBlob = await new Promise((res) =>
              slot.canvas.toBlob(res, "image/jpeg", quality),
            );

            // Persist rendered page blob directly into IndexedDB disk storage to keep heap flat
            const pageData = {
              pageNum,
              width: origViewport.width,
              height: origViewport.height,
              jpegBlob,
            };
            const storedOk = storage
              ? await storage.storeRenderedPageInDB(pageNum, pageData)
              : false;
            canvasPool.addTrackedBytes(jpegBlob.size);

            return {
              pageNum,
              origViewport,
              storedInDb: storedOk,
              fallbackBlob: storedOk ? null : jpegBlob,
            };
          } finally {
            if (slot) canvasPool.releaseCanvasSlot(slot);
            if (page && typeof page.cleanup === "function") page.cleanup();
          }
        };

        // Sliding window pipeline execution
        while (nextPageToEmbed <= total) {
          // 1. Health check & adaptive governor (Memory Headroom)
          const metrics = health.sampleHealthMetrics();

          if (metrics.isCritical) {
            // Critical memory pressure (<20% free): drop to 1 to guarantee zero crashes
            currentConcurrency = 1;
            canvasPool.purgeCanvasSlotPool();
            await new Promise((r) => setTimeout(r, 40));
          } else if (metrics.isWarning) {
            // Moderate memory pressure (20% - 35% free): scale down safely (half capacity)
            currentConcurrency = Math.max(
              2,
              Math.floor(targetMaxConcurrency / 2),
            );
            await new Promise((r) => setTimeout(r, 15));
          } else {
            // Memory healthy: run at full hardware tier concurrency
            currentConcurrency = targetMaxConcurrency;
          }

          // Strict pending buffer limit to prevent RAM accumulation while feeding parallel workers
          const maxPendingBuffer = Math.min(
            hwConfig.maxPendingBuffer,
            Math.max(3, currentConcurrency + 2),
          );

          // 2. Dispatch tasks up to currentConcurrency while buffer is not full
          while (
            inFlightRenders.size < currentConcurrency &&
            nextPageToRender <= total &&
            completedPageMap.size < maxPendingBuffer
          ) {
            const p = nextPageToRender++;
            const pPromise = executePageRender(p)
              .then((res) => {
                inFlightRenders.delete(p);
                completedPageMap.set(p, res);
              })
              .catch((err) => {
                inFlightRenders.delete(p);
                throw err;
              });
            inFlightRenders.set(p, pPromise);
          }

          // 3. Sequentially embed ready pages in strict ascending order (1, 2, 3...)
          let didEmbedAny = false;
          while (completedPageMap.has(nextPageToEmbed)) {
            didEmbedAny = true;
            const item = completedPageMap.get(nextPageToEmbed);
            completedPageMap.delete(nextPageToEmbed);

            let pageRecord = null;
            if (item.storedInDb && storage) {
              pageRecord = await storage.getRenderedPageFromDB(nextPageToEmbed);
            }
            const blob = pageRecord ? pageRecord.jpegBlob : item.fallbackBlob;
            const jpegBytes = new Uint8Array(await blob.arrayBuffer());

            const embeddedImg = await newDoc.embedJpg(jpegBytes);
            const newPage = newDoc.addPage([
              item.origViewport.width,
              item.origViewport.height,
            ]);
            newPage.drawImage(embeddedImg, {
              x: 0,
              y: 0,
              width: item.origViewport.width,
              height: item.origViewport.height,
            });

            // Clean up DB entry for this page immediately to minimize storage footprint
            if (item.storedInDb && storage) {
              storage.deleteRenderedPageFromDB(nextPageToEmbed);
            }

            // Immediately dereference buffer so browser GC can reclaim memory
            if (blob) {
              canvasPool.removeTrackedBytes(blob.size);
            }
            pageRecord = null;
            item.fallbackBlob = null;

            pagesProcessedCount++;
            nextPageToEmbed++;

            const pct = Math.round(10 + (pagesProcessedCount / total) * 80);
            ui.updateLoadingProgress(
              pct,
              `Downsampling page ${pagesProcessedCount} of ${total} (${targetDpi} DPI)…`,
            );

            // Periodically flush PDF.js Web Worker cache to release decoded textures
            const flushInterval = hwConfig.workerCleanupInterval || 5;
            if (
              pagesProcessedCount % flushInterval === 0 &&
              state.pdfJsDoc &&
              typeof state.pdfJsDoc.cleanup === "function"
            ) {
              state.pdfJsDoc.cleanup();
            }

            // Yield if critical to allow GC sweep
            if (metrics.isCritical) {
              await new Promise((r) => setTimeout(r, 40));
            } else if (hwConfig.interPageYieldDelayMs > 0) {
              await new Promise((r) =>
                setTimeout(r, hwConfig.interPageYieldDelayMs),
              );
            }
          }


          // 5. Cooperative event-loop yielding to guarantee UI responsiveness
          const now = performance.now();
          if (now - lastYieldTime > 16) {
            await new Promise((r) => setTimeout(r, 0));
            lastYieldTime = performance.now();
          }

          // 6. Wait for the next page render to complete without artificial delays
          if (
            inFlightRenders.size > 0 &&
            !completedPageMap.has(nextPageToEmbed)
          ) {
            await Promise.race(inFlightRenders.values());
          } else if (!didEmbedAny && nextPageToEmbed <= total) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        ui.updateLoadingProgress(
          94,
          "Packing PDF object streams and cross-reference table…",
        );
        newDoc.setProducer("PDFMaster (pdfmaster.co.in)");
        newDoc.setCreator("PDFMaster Client Compressor");

        const pdfBytes = await newDoc.save({
          useObjectStreams: true,
          addDefaultPage: false,
        });

        outBlob = new Blob([pdfBytes], { type: "application/pdf" });
      }

      ui.updateLoadingProgress(100, "Compression complete! Preparing results…");

      state.lastCompressedBlob = outBlob;
      state.lastCompressedName = state.fileName.replace(
        /\.pdf$/i,
        "-compressed.pdf",
      );

      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      ui.showLoadingModal(false);

      // Present Results Card
      ui.renderResults(outBlob, durationMs);

      // Trigger Universal Popup
      if (
        window.PDFMasterPopup &&
        typeof window.PDFMasterPopup.show === "function"
      ) {
        const savedBytes = Math.max(0, state.fileSize - outBlob.size);
        const savedPct = Math.round((savedBytes / state.fileSize) * 100);

        window.PDFMasterPopup.show({
          title: "Thank You for Using PDF<span>Master</span>!",
          desc: `Your PDF was compressed from <strong>${fmtBytes(state.fileSize)}</strong> to <strong>${fmtBytes(outBlob.size)}</strong> (Saved ${savedPct}%). Zero server uploads.`,
          fileName: state.lastCompressedName,
          fileType: "pdf",
          fileDetails: `${state.totalPages} pages • ${fmtBytes(outBlob.size)} • Saved ${savedPct}% • 100% Private`,
          downloadText: "Download Compressed PDF",
          toolName: "Compress PDF",
          durationMs: durationMs,
          blob: outBlob,
          onSecondary: () => {
            const resultsCard = document.getElementById("resultsCard");
            if (resultsCard) {
              resultsCard.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          },
        });
      }
    } catch (err) {
      console.error("Compression failed:", err);
      ui.showLoadingModal(false);
      showToast(
        "Compression failed: " + (err.message || "Unknown error occurred"),
        "error",
      );
    } finally {
      canvasPool.purgeCanvasSlotPool();
      if (storage && storage.clearRenderedPagesFromDB) {
        await storage.clearRenderedPagesFromDB();
      }
    }
  }

  window.PDFCompressPipeline = {
    runCompression,
  };
})();
