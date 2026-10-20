/**
 * PDFMaster - OCR PDF (Optical Character Recognition)
 * Module: studio.js
 * Interactive OCR Results Studio, bounding box inspector, live text synchronization,
 * and preview canvas rendering.
 */

(function () {
  "use strict";

  window.PDFMasterOCR = window.PDFMasterOCR || {};
  const OCR = window.PDFMasterOCR;
  const state = OCR.state;
  const DOM = OCR.DOM;

  /* ==========================================================================
     OCR RESULTS STUDIO & INSPECTOR
     ========================================================================== */
  function finishOcrStudio() {
    DOM.progressHud.style.display = "none";
    DOM.ocrStudio.style.display = "block";
    if (DOM.shieldIcon) DOM.shieldIcon.classList.remove("is-active-scan");
    if (DOM.shieldStatus) DOM.shieldStatus.textContent = "OCR Completed";

    // Summary Metrics
    const totalWords = state.pageResults.reduce(
      (acc, p) => acc + p.words.length,
      0,
    );
    const avgConfidence = Math.round(
      state.pageResults.reduce((acc, p) => acc + p.confidence, 0) /
        (state.pageResults.length || 1),
    );
    const elapsedTotal = ((performance.now() - state.startTime) / 1000).toFixed(
      1,
    );

    DOM.metricPages.textContent = state.pageResults.length;
    DOM.metricWords.textContent = totalWords.toLocaleString();
    DOM.metricConfidence.textContent = `${avgConfidence}%`;
    DOM.metricDuration.textContent = `${elapsedTotal}s`;

    // Initialize Editor Page Controls
    const totalResults = state.pageResults.length;
    if (totalResults <= 1) {
      if (DOM.editorPrevPageBtn) DOM.editorPrevPageBtn.disabled = true;
      if (DOM.editorNextPageBtn) DOM.editorNextPageBtn.disabled = true;
      if (DOM.editorAllPagesBtn) DOM.editorAllPagesBtn.style.display = "none";
      if (DOM.editorCurrentPageIndicator) DOM.editorCurrentPageIndicator.textContent = `Page 1 of 1`;
    } else {
      if (DOM.editorAllPagesBtn) DOM.editorAllPagesBtn.style.display = "inline-flex";
    }

    // Default to first page in preview
    state.activeStudioPage = 0;
    renderStudioPagePreview(0);
    switchStudioPage("all");
    initStudioInteractions();

    // Trigger Universal Popup Banner
    if (window.PDFMasterPopup && typeof window.PDFMasterPopup.show === "function") {
      const baseName = state.fileName.replace(/\.[^/.]+$/, "") || "document";
      const isPdfExport = state.options.generatePdf !== false;
      const downloadFileName = isPdfExport
        ? `${baseName}_searchable.pdf`
        : `${baseName}_text.txt`;
      const elapsedMs = Math.max(1, Math.round(performance.now() - (state.startTime || performance.now())));

      window.PDFMasterPopup.show({
        title: "Thank You for Using PDF<span>Master</span>!",
        desc: `Your scanned document was recognized privately on your device. Extracted <strong>${totalWords.toLocaleString()} words</strong> across <strong>${state.pageResults.length} page(s)</strong> with <strong>${avgConfidence}% confidence</strong>. Zero server uploads.`,
        fileName: downloadFileName,
        fileType: isPdfExport ? "pdf" : "txt",
        fileDetails: `${state.pageResults.length} page${state.pageResults.length > 1 ? "s" : ""} · ${totalWords.toLocaleString()} words · ${avgConfidence}% conf`,
        downloadText: isPdfExport ? "Download Searchable PDF" : "Download Extracted Text",
        secondaryText: "Inspect in Studio",
        showSecondary: true,
        toolName: "OCR PDF",
        verb: "Recognized",
        durationMs: elapsedMs,
        blob: state.generatedPdfBlob,
        onDownload: () => {
          if (OCR.triggerDownload) {
            return OCR.triggerDownload(isPdfExport ? "pdf" : "txt");
          }
        },
        onSecondary: () => {
          if (DOM.ocrStudio) {
            DOM.ocrStudio.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        },
      });
    }
  }

  function switchStudioPage(target) {
    const totalResults = state.pageResults.length;

    if (target === "all") {
      state.isAllPagesView = true;
      if (DOM.editorAllPagesBtn) DOM.editorAllPagesBtn.classList.add("is-active");
      if (DOM.editorCurrentPageIndicator) {
        DOM.editorCurrentPageIndicator.textContent = `All Pages (${totalResults})`;
      }
      if (DOM.editorPrevPageBtn) DOM.editorPrevPageBtn.disabled = false;
      if (DOM.editorNextPageBtn) DOM.editorNextPageBtn.disabled = false;

      let combined = "";
      state.pageResults.forEach((p) => {
        combined += `--- PAGE ${p.pageNum} ---\n` + p.text.trim() + "\n\n";
      });
      DOM.ocrTextArea.value = combined.trim();
    } else {
      state.isAllPagesView = false;
      if (DOM.editorAllPagesBtn) DOM.editorAllPagesBtn.classList.remove("is-active");
      const idx = typeof target === "number" ? target : 0;
      const p = state.pageResults[idx];
      if (p) {
        state.activeStudioPage = idx;
        if (DOM.editorCurrentPageIndicator) {
          DOM.editorCurrentPageIndicator.textContent = `Page ${p.pageNum} of ${state.totalPages}`;
        }
        if (DOM.editorPrevPageBtn) DOM.editorPrevPageBtn.disabled = idx === 0;
        if (DOM.editorNextPageBtn) DOM.editorNextPageBtn.disabled = idx === totalResults - 1;

        DOM.ocrTextArea.value = p.text.trim();
        renderStudioPagePreview(idx);
      }
    }

    updateTextCounts();
  }

  async function renderStudioPagePreview(pageIndex) {
    const pageData = state.pageResults[pageIndex];
    if (!pageData || !state.pdfDoc) return;

    state.activeStudioPage = pageIndex;
    const pageLabel = `Page ${pageData.pageNum} of ${state.totalPages}`;
    if (DOM.currentPageIndicator) DOM.currentPageIndicator.textContent = pageLabel;

    if (DOM.prevPageBtn) DOM.prevPageBtn.disabled = pageIndex === 0;
    if (DOM.nextPageBtn) DOM.nextPageBtn.disabled = pageIndex === state.pageResults.length - 1;

    if (!state.isAllPagesView) {
      if (DOM.editorCurrentPageIndicator) DOM.editorCurrentPageIndicator.textContent = pageLabel;
      if (DOM.editorPrevPageBtn) DOM.editorPrevPageBtn.disabled = pageIndex === 0;
      if (DOM.editorNextPageBtn) DOM.editorNextPageBtn.disabled = pageIndex === state.pageResults.length - 1;
    }

    try {
      const pdfPage = await state.pdfDoc.getPage(pageData.pageNum);
      const viewport = pdfPage.getViewport({ scale: 1.2 });

      DOM.previewCanvas.width = viewport.width;
      DOM.previewCanvas.height = viewport.height;
      const ctx = DOM.previewCanvas.getContext("2d");

      await pdfPage.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;

      // Draw bounding boxes layer
      renderBoundingBoxes(pageData, viewport.width, viewport.height);
    } catch (e) {
      console.warn("Error rendering preview canvas:", e);
    }
  }

  function renderBoundingBoxes(pageData, currentWidth, currentHeight) {
    DOM.bboxLayer.innerHTML = "";
    if (!DOM.toggleBboxCheck.checked) {
      DOM.bboxLayer.style.display = "none";
      return;
    }
    DOM.bboxLayer.style.display = "block";

    const scaleX = currentWidth / pageData.canvasWidth;
    const scaleY = currentHeight / pageData.canvasHeight;

    pageData.words.forEach((w) => {
      const box = document.createElement("div");
      box.className = "bbox-box";
      const left = w.bbox.x0 * scaleX;
      const top = w.bbox.y0 * scaleY;
      const width = (w.bbox.x1 - w.bbox.x0) * scaleX;
      const height = (w.bbox.y1 - w.bbox.y0) * scaleY;

      box.style.left = left + "px";
      box.style.top = top + "px";
      box.style.width = width + "px";
      box.style.height = height + "px";
      box.title = `"${w.text}" (${w.confidence}% conf)`;

      box.addEventListener("click", () => {
        // Highlight word in textarea
        const val = DOM.ocrTextArea.value;
        const idx = val.indexOf(w.text);
        if (idx !== -1) {
          DOM.ocrTextArea.focus();
          DOM.ocrTextArea.setSelectionRange(idx, idx + w.text.length);
        }
      });

      DOM.bboxLayer.appendChild(box);
    });
  }

  function updateTextCounts() {
    const text = DOM.ocrTextArea.value || "";
    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

    DOM.charCountBadge.textContent = `${charCount.toLocaleString()} chars`;
    DOM.wordCountBadge.textContent = `${wordCount.toLocaleString()} words`;
  }

  function initStudioInteractions() {
    // Left Page Inspector Pagination buttons
    DOM.prevPageBtn.onclick = () => {
      if (state.activeStudioPage > 0) {
        switchStudioPage(state.activeStudioPage - 1);
      }
    };

    DOM.nextPageBtn.onclick = () => {
      if (state.activeStudioPage < state.pageResults.length - 1) {
        switchStudioPage(state.activeStudioPage + 1);
      }
    };

    // Right Extracted Text Editor Page Toggle buttons
    if (DOM.editorPrevPageBtn) {
      DOM.editorPrevPageBtn.onclick = () => {
        if (state.isAllPagesView) {
          switchStudioPage(0);
        } else if (state.activeStudioPage > 0) {
          switchStudioPage(state.activeStudioPage - 1);
        }
      };
    }

    if (DOM.editorNextPageBtn) {
      DOM.editorNextPageBtn.onclick = () => {
        if (state.isAllPagesView) {
          switchStudioPage(0);
        } else if (state.activeStudioPage < state.pageResults.length - 1) {
          switchStudioPage(state.activeStudioPage + 1);
        }
      };
    }

    if (DOM.editorAllPagesBtn) {
      DOM.editorAllPagesBtn.onclick = () => {
        switchStudioPage("all");
      };
    }

    // Bounding box toggle
    DOM.toggleBboxCheck.onchange = () => {
      renderStudioPagePreview(state.activeStudioPage);
    };

    // Text editor changes
    DOM.ocrTextArea.oninput = updateTextCounts;

    // Font size controls
    let fontSize = 15;
    DOM.fontIncBtn.onclick = () => {
      if (fontSize < 24) {
        fontSize += 2;
        DOM.ocrTextArea.style.fontSize = fontSize + "px";
      }
    };
    DOM.fontDecBtn.onclick = () => {
      if (fontSize > 11) {
        fontSize -= 2;
        DOM.ocrTextArea.style.fontSize = fontSize + "px";
      }
    };

    // Copy Text (action bar)
    if (DOM.copyTextBtn) DOM.copyTextBtn.onclick = copyCurrentText;
    if (DOM.copyAllBtn) DOM.copyAllBtn.onclick = copyCurrentText;

    // Clear Text (if present)
    if (DOM.clearTextBtn) {
      DOM.clearTextBtn.onclick = () => {
        DOM.ocrTextArea.value = "";
        updateTextCounts();
      };
    }

    // Downloads
    DOM.downloadPdfBtn.onclick = () => {
      if (OCR.triggerDownload) OCR.triggerDownload("pdf");
    };
    DOM.downloadTxtBtn.onclick = () => {
      if (OCR.triggerDownload) OCR.triggerDownload("txt");
    };
  }

  async function copyCurrentText() {
    const text = DOM.ocrTextArea.value;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const originalText = DOM.copyTextBtn.innerHTML;
      DOM.copyTextBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg> Copied!
      `;
      DOM.copyAllBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg> Copied to Clipboard!
      `;
      setTimeout(() => {
        DOM.copyTextBtn.innerHTML = originalText;
        DOM.copyAllBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg> Copy All Text
        `;
      }, 2000);
    } catch (e) {
      console.warn("Clipboard copy failed, using fallback:", e);
      DOM.ocrTextArea.select();
      document.execCommand("copy");
    }
  }

  // Export to namespace
  OCR.finishOcrStudio = finishOcrStudio;
  OCR.switchStudioPage = switchStudioPage;
  OCR.renderStudioPagePreview = renderStudioPagePreview;
  OCR.renderBoundingBoxes = renderBoundingBoxes;
  OCR.updateTextCounts = updateTextCounts;
  OCR.initStudioInteractions = initStudioInteractions;
  OCR.copyCurrentText = copyCurrentText;
})();
