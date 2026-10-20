/**
 * PDFMaster - OCR PDF (Optical Character Recognition)
 * Module: pipeline.js
 * Low-RAM streaming OCR pipeline, parallel WebAssembly execution,
 * and real-time progress / ETA telemetry.
 */

(function () {
  "use strict";

  window.PDFMasterOCR = window.PDFMasterOCR || {};
  const OCR = window.PDFMasterOCR;
  const state = OCR.state;
  const DOM = OCR.DOM;

  /* ==========================================================================
     LOW-RAM HIGH-SPEED STREAMING OCR PIPELINE (Hybrid Vector & Parallel SIMD)
     ========================================================================== */
  async function startOcrPipeline() {
    if (
      state.isProcessing ||
      !state.pdfDoc ||
      state.selectedPages.length === 0
    ) {
      return;
    }

    state.isProcessing = true;
    state.cancelRequested = false;
    state.pageResults = [];
    state.startTime = performance.now();

    // UI Updates
    DOM.actionBar.style.display = "none";
    DOM.progressHud.style.display = "block";
    DOM.ocrStudio.style.display = "none";
    DOM.cancelOcrBtn.disabled = false;
    if (DOM.shieldIcon) DOM.shieldIcon.classList.add("is-active-scan");
    if (DOM.shieldStatus)
      DOM.shieldStatus.textContent = "Recognizing Characters…";

    updateProgress(0, "Analyzing document text layers…", 0);

    try {
      const totalToProcess = state.selectedPages.length;

      // 1. Pre-flight check: identify which selected pages need raster OCR
      const pageClassification = [];
      let rasterCount = 0;

      for (let i = 0; i < totalToProcess; i++) {
        const pageNum = state.selectedPages[i];
        let status = state.pageTextStatus[pageNum];
        if (!status) {
          try {
            const pg = await state.pdfDoc.getPage(pageNum);
            const tc = await pg.getTextContent();
            let cCount = 0;
            if (tc && tc.items) {
              for (const it of tc.items) {
                if (it.str) cCount += it.str.trim().length;
              }
            }
            status = { hasText: cCount >= 4, charCount: cCount };
            state.pageTextStatus[pageNum] = status;
          } catch (_) {
            status = { hasText: false, charCount: 0 };
            state.pageTextStatus[pageNum] = status;
          }
        }
        if (!status.hasText) rasterCount++;
        pageClassification.push({ pageNum, index: i, hasText: status.hasText });
      }

      // 2. Initialize worker pool if raster pages exist
      // Use 2 parallel workers if multiple scanned pages exist to cut OCR time in half!
      const workerCount =
        rasterCount > 1
          ? Math.min(2, Math.max(1, (navigator.hardwareConcurrency || 2) - 1))
          : rasterCount === 1
            ? 1
            : 0;

      let workerPool = [];
      if (workerCount > 0) {
        updateProgress(
          5,
          `Readying SIMD neural workers (${workerCount} core${workerCount > 1 ? "s" : ""})…`,
          0,
        );
        workerPool = await OCR.ensureTesseractPool(
          state.options.lang,
          state.options.mode,
          workerCount,
        );
      }

      // Results container mapped by pageNum to guarantee order preservation
      const resultsMap = {};
      const availableWorkers = [...workerPool];
      let completedCount = 0;

      // Single page processor function
      async function processSinglePage(task) {
        if (state.cancelRequested) {
          throw new Error("OCR operation cancelled by user.");
        }

        const { pageNum, index, hasText } = task;
        const pdfPage = await state.pdfDoc.getPage(pageNum);
        const unscaledVp = pdfPage.getViewport({ scale: 1.0 });
        const scale = OCR.calculateOptimalResolutionScale(
          unscaledVp,
          state.options.mode,
        );
        const viewport = pdfPage.getViewport({ scale });

        let pageWords = [];
        let pageText = "";
        let pageConfidence = 0;
        let thumbUrl = null;
        const cWidth = Math.floor(viewport.width);
        const cHeight = Math.floor(viewport.height);

        // HYBRID PATH (Digital or Permission-Protected) -> Instant 100% extraction!
        if (hasText) {
          // Direct lightweight thumbnail render (140px wide) - saves ~95% render time!
          const thumbRatio = 140 / unscaledVp.width;
          const thumbVp = pdfPage.getViewport({ scale: thumbRatio });
          const thumbCanvas = document.createElement("canvas");
          thumbCanvas.width = 140;
          thumbCanvas.height = Math.floor(thumbVp.height);
          const thumbCtx = thumbCanvas.getContext("2d");
          await pdfPage.render({ canvasContext: thumbCtx, viewport: thumbVp })
            .promise;
          const thumbBlob = await new Promise((res) =>
            thumbCanvas.toBlob(res, "image/jpeg", 0.7),
          );
          thumbUrl = URL.createObjectURL(thumbBlob);
          thumbCanvas.width = 0;
          thumbCanvas.height = 0;

          // Authentic vector text extraction in viewport coordinates
          const digitalResult = await OCR.extractAuthenticDigitalText(
            pdfPage,
            viewport,
          );
          if (digitalResult && digitalResult.words.length > 0) {
            pageWords = digitalResult.words;
            pageText = digitalResult.text;
            pageConfidence = 100;
          }
        }

        // SCANNED RASTER PATH -> SIMD Neural OCR
        if (!pageText && !pageWords.length) {
          // Acquire an available worker from the pool
          while (availableWorkers.length === 0) {
            if (state.cancelRequested)
              throw new Error("OCR operation cancelled by user.");
            await new Promise((r) => setTimeout(r, 25));
          }
          const worker = availableWorkers.pop();

          const canvas = document.createElement("canvas");
          canvas.width = cWidth;
          canvas.height = cHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });

          try {
            await pdfPage.render({ canvasContext: ctx, viewport: viewport })
              .promise;

            // Generate thumbnail from rendered canvas
            const thumbCanvas = document.createElement("canvas");
            const thumbRatio = 140 / canvas.width;
            thumbCanvas.width = 140;
            thumbCanvas.height = Math.floor(canvas.height * thumbRatio);
            const thumbCtx = thumbCanvas.getContext("2d");
            thumbCtx.drawImage(
              canvas,
              0,
              0,
              thumbCanvas.width,
              thumbCanvas.height,
            );
            const thumbBlob = await new Promise((res) =>
              thumbCanvas.toBlob(res, "image/jpeg", 0.7),
            );
            thumbUrl = URL.createObjectURL(thumbBlob);
            thumbCanvas.width = 0;
            thumbCanvas.height = 0;

            // Apply 32-bit fast scan enhancement filter
            if (state.options.enhance && OCR.applyScanEnhancementFilter) {
              OCR.applyScanEnhancementFilter(ctx, canvas.width, canvas.height);
            }

            const ocrResult = await worker.recognize(
              canvas,
              {},
              { text: true, blocks: true, hocr: false, tsv: false },
            );

            if (ocrResult && ocrResult.data && ocrResult.data.words) {
              for (const w of ocrResult.data.words) {
                const wordTxt = w.text && w.text.trim();
                if (!wordTxt) continue;

                const bbox = {
                  x0: w.bbox.x0,
                  y0: w.bbox.y0,
                  x1: w.bbox.x1,
                  y1: w.bbox.y1,
                };

                const isDup = pageWords.some((prev) => {
                  if (prev.text.toLowerCase() !== wordTxt.toLowerCase())
                    return false;
                  const xOverlap = Math.max(
                    0,
                    Math.min(prev.bbox.x1, bbox.x1) -
                      Math.max(prev.bbox.x0, bbox.x0),
                  );
                  const yOverlap = Math.max(
                    0,
                    Math.min(prev.bbox.y1, bbox.y1) -
                      Math.max(prev.bbox.y0, bbox.y0),
                  );
                  const prevArea =
                    (prev.bbox.x1 - prev.bbox.x0) *
                    (prev.bbox.y1 - prev.bbox.y0);
                  return prevArea > 0 && xOverlap * yOverlap > prevArea * 0.6;
                });

                if (!isDup) {
                  pageWords.push({
                    text: wordTxt,
                    confidence: Math.round(w.confidence || 0),
                    bbox: bbox,
                  });
                }
              }
            }

            pageText = (ocrResult.data && ocrResult.data.text) || "";
            pageConfidence = Math.round(
              (ocrResult.data && ocrResult.data.confidence) || 0,
            );
          } finally {
            // CRITICAL LOW-RAM STEP: Immediately wipe and free canvas memory!
            canvas.width = 0;
            canvas.height = 0;
            ctx.clearRect(0, 0, 0, 0);
            availableWorkers.push(worker);
          }
        }

        resultsMap[pageNum] = {
          pageNum: pageNum,
          text: pageText,
          confidence: pageConfidence,
          words: pageWords,
          canvasWidth: cWidth,
          canvasHeight: cHeight,
          thumbUrl: thumbUrl,
        };

        completedCount++;
        const pct = Math.round((completedCount / totalToProcess) * 90);
        updateProgress(
          pct,
          `Processed Page ${pageNum} (${completedCount} of ${totalToProcess})…`,
          completedCount,
        );
      }

      // Execute all page tasks (digital tasks run immediately, raster tasks run via the 2-worker bounded pool)
      await Promise.all(
        pageClassification.map((task) => processSinglePage(task)),
      );

      // Assemble results in exact natural page order
      state.pageResults = state.selectedPages.map((p) => resultsMap[p]);

      // 3. Assemble Exports (Searchable PDF, Text)
      updateProgress(
        94,
        "Generating Searchable PDF & export formats…",
        totalToProcess,
      );
      if (OCR.generateAllExports) {
        await OCR.generateAllExports();
      }

      updateProgress(100, "OCR Recognition complete!", totalToProcess);

      // Display OCR Results Studio
      setTimeout(() => {
        if (OCR.finishOcrStudio) OCR.finishOcrStudio();
      }, 300);
    } catch (err) {
      console.error("OCR Pipeline error:", err);
      if (state.cancelRequested) {
        DOM.actionBarStatus.textContent = "OCR was cancelled.";
      } else {
        if (OCR.showErrorPopup)
          OCR.showErrorPopup("OCR recognition failed: " + err.message);
        DOM.actionBarStatus.textContent = "Error occurred during OCR.";
      }
      DOM.progressHud.style.display = "none";
      DOM.actionBar.style.display = "flex";
      if (DOM.shieldIcon) DOM.shieldIcon.classList.remove("is-active-scan");
      if (DOM.shieldStatus) DOM.shieldStatus.textContent = "OCR Ready";
    } finally {
      state.isProcessing = false;
    }
  }

  function updateProgress(percent, statusText, currentPageNum) {
    const clampedPct = Math.min(100, Math.max(0, Math.round(percent)));
    DOM.progressFill.style.width = clampedPct + "%";
    DOM.progressPct.textContent = clampedPct + "%";
    DOM.progressStatusTxt.textContent = statusText;

    if (currentPageNum > 0) {
      DOM.progressPageBadge.textContent = `Page ${currentPageNum} of ${state.selectedPages.length}`;
      DOM.progressPageBadge.style.display = "inline-flex";
    } else {
      DOM.progressPageBadge.style.display = "none";
    }

    // Benchmark elapsed time & estimated remaining
    if (state.startTime > 0) {
      const elapsedSec = ((performance.now() - state.startTime) / 1000).toFixed(
        1,
      );
      if (clampedPct > 5 && clampedPct < 100) {
        const estTotalSec = (elapsedSec / (clampedPct / 100)).toFixed(1);
        const estRemainingSec = Math.max(0, estTotalSec - elapsedSec).toFixed(
          1,
        );
        DOM.progressTimerTxt.textContent = `Elapsed: ${elapsedSec}s · Est. Remaining: ${estRemainingSec}s`;
      } else {
        DOM.progressTimerTxt.textContent = `Elapsed: ${elapsedSec}s`;
      }
    }
  }

  // Export to namespace
  OCR.startOcrPipeline = startOcrPipeline;
  OCR.updateProgress = updateProgress;
})();
