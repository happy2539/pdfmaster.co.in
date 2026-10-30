/**
 * PDFMaster - Compare PDF: Renderer Engine
 * Offscreen rendering, scale calculations, comparison view drawing, flicker mode, and highlight layers.
 */
(function () {
  "use strict";

  window.PDFCompare = window.PDFCompare || {};
  const state = window.PDFCompare.state;
  const PageCache = window.PDFCompare.PageCache;
  const DOM = window.PDFCompare.DOM;

  // =========================================================================
  //  SCALE & SIZING COMPUTATION (Fit Width, Fit Page, Actual Size)
  // =========================================================================
  function computePageScale(page, containerEl) {
    const unscaled = page.getViewport({ scale: 1.0 });
    const containerW = containerEl && containerEl.clientWidth > 100 ? containerEl.clientWidth : 500;
    const containerH = containerEl && containerEl.clientHeight > 100 ? containerEl.clientHeight : 600;
    // Account for 16px padding (8px left + 8px right) + 16px possible vertical scrollbar clearance
    const scrollbarAllowance = (containerEl && containerEl.scrollHeight > containerEl.clientHeight) ? 16 : 0;
    const availW = Math.max(200, containerW - 16 - scrollbarAllowance);
    const availH = Math.max(200, containerH - 16);

    let scale = 1.0;
    let label = "100%";

    if (state.zoomMode === "fitWidth") {
      scale = availW / unscaled.width;
      label = "Fit Width";
    } else if (state.zoomMode === "fitPage") {
      scale = Math.min(availW / unscaled.width, availH / unscaled.height);
      label = "Fit Page";
    } else {
      scale = state.customZoom;
      label = `${Math.round(scale * 100)}%`;
    }

    // High DPI scaling factor
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.round(unscaled.width * scale);
    const cssHeight = Math.round(unscaled.height * scale);

    return {
      scale,
      scaleKey: `${scale.toFixed(3)}_${dpr.toFixed(1)}`,
      cssWidth,
      cssHeight,
      dpr,
      pixelWidth: Math.round(cssWidth * dpr),
      pixelHeight: Math.round(cssHeight * dpr),
      label
    };
  }

  function updateZoomToolbarButtons() {
    if (DOM.btnFitWidth) DOM.btnFitWidth.classList.toggle("active", state.zoomMode === "fitWidth");
    if (DOM.btnFitPage) DOM.btnFitPage.classList.toggle("active", state.zoomMode === "fitPage");
    if (DOM.btnActualSize) DOM.btnActualSize.classList.toggle("active", state.zoomMode === "custom" && Math.abs(state.customZoom - 1.0) < 0.05);
  }

  function updateSubmodeButtons() {
    if (DOM.btnDiffHighlight) DOM.btnDiffHighlight.classList.toggle("active", state.visualDiffSubmode === "highlight");
    if (DOM.btnDiffMask) DOM.btnDiffMask.classList.toggle("active", state.visualDiffSubmode === "deltaMask");
    if (DOM.btnDiffFlicker) DOM.btnDiffFlicker.classList.toggle("active", state.visualDiffSubmode === "flicker");
  }

  // =========================================================================
  //  OFFSCREEN CANVAS RENDERING WITH WILLREADFREQUENTLY
  // =========================================================================
  async function renderPageToOffscreen(page, sizing) {
    if (!page) return null;
    const canvas = document.createElement("canvas");
    canvas.width = sizing.pixelWidth;
    canvas.height = sizing.pixelHeight;
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sizing.pixelWidth, sizing.pixelHeight);
    ctx.save();
    ctx.scale(sizing.dpr, sizing.dpr);
    const viewport = page.getViewport({ scale: sizing.scale });
    await page.render({ canvasContext: ctx, viewport }).promise;
    ctx.restore();
    return canvas;
  }

  // =========================================================================
  //  CANVAS RENDERING & SUDDEN DIFF SUBMODE DISPATCHER
  // =========================================================================
  function renderComparisonView(offCanvasA, offCanvasB, sizing, diffResult) {
    // 1. Canvas A (Document A Baseline)
    if (offCanvasA) {
      DOM.canvasA.width = sizing.pixelWidth;
      DOM.canvasA.height = sizing.pixelHeight;
      DOM.canvasA.style.width = sizing.cssWidth + "px";
      DOM.canvasA.style.height = sizing.cssHeight + "px";
      DOM.wrapA.style.width = sizing.cssWidth + "px";
      DOM.wrapA.style.height = sizing.cssHeight + "px";

      const ctxA = DOM.canvasA.getContext("2d", { alpha: false });
      ctxA.drawImage(offCanvasA, 0, 0);
      DOM.canvasA.style.display = "block";
    } else {
      DOM.canvasA.style.display = "none";
    }

    // 2. Canvas B (Document B: Highlight Clouds / Delta Mask / Flicker A/B)
    if (offCanvasB || offCanvasA) {
      DOM.canvasB.width = sizing.pixelWidth;
      DOM.canvasB.height = sizing.pixelHeight;
      DOM.canvasB.style.width = sizing.cssWidth + "px";
      DOM.canvasB.style.height = sizing.cssHeight + "px";
      DOM.wrapB.style.width = sizing.cssWidth + "px";
      DOM.wrapB.style.height = sizing.cssHeight + "px";
      DOM.canvasB.style.display = "block";

      const ctxB = DOM.canvasB.getContext("2d", { alpha: false });

      if (state.visualDiffSubmode === "deltaMask" && diffResult && diffResult.maskImageData) {
        // Delta Mask: High-contrast pixel comparison map
        ctxB.putImageData(diffResult.maskImageData, 0, 0);
        if (DOM.titlePaneB) DOM.titlePaneB.textContent = "Document B (Delta Mask)";
        if (DOM.pillPaneB) {
          DOM.pillPaneB.className = "doc-b-pill";
          DOM.pillPaneB.innerHTML = `<span style="color:#ef4444; font-weight:700;">🎭 Delta Mask Active</span>`;
        }
      } else if (state.visualDiffSubmode === "flicker" && offCanvasA && offCanvasB) {
        // Flicker A/B: Rapid document alternation
        startFlickerMode(ctxB, offCanvasA, offCanvasB);
      } else {
        // Highlight Clouds (Default): Clean Document B
        if (offCanvasB) {
          ctxB.drawImage(offCanvasB, 0, 0);
        } else if (offCanvasA) {
          ctxB.drawImage(offCanvasA, 0, 0);
        }
        if (DOM.titlePaneB) DOM.titlePaneB.textContent = "Document B (Modified)";
        if (DOM.pillPaneB) {
          DOM.pillPaneB.className = "doc-b-pill";
          DOM.pillPaneB.textContent = "Revision";
        }
      }
    } else {
      DOM.canvasB.style.display = "none";
    }

    // 3. Render Difference Highlight Boxes
    renderHighlightBoxes(diffResult, sizing);
  }

  function renderHighlightBoxes(diffResult, sizing) {
    if (DOM.highlightLayerA) DOM.highlightLayerA.innerHTML = "";
    if (DOM.highlightLayerB) DOM.highlightLayerB.innerHTML = "";
    if (!sizing) return;

    const p = state.currentPage;
    const diffInfo = state.differences[p];
    if (!diffInfo) return;

    // In Delta Mask or Flicker mode, clear Pane B highlights so pixel mask or rapid flicker is clean
    const showHighlightsB = state.visualDiffSubmode === "highlight";

    const ratioX = sizing.cssWidth / (diffInfo.baseWidth || sizing.cssWidth);
    const ratioY = sizing.cssHeight / (diffInfo.baseHeight || sizing.cssHeight);

    let htmlA = "";
    let htmlB = "";

    // 1. Text Deletions on Pane A
    if (diffInfo.diffBoxesA) {
      diffInfo.diffBoxesA.forEach((b) => {
        const left = Math.round(b.x * ratioX);
        const top = Math.round(b.y * ratioY);
        const width = Math.round(b.width * ratioX);
        const height = Math.round(b.height * ratioY);
        htmlA += `
          <div class="diff-highlight-box diff-box-${b.type}" style="left:${left}px; top:${top}px; width:${width}px; height:${height}px;">
            <span class="diff-box-tag">${b.type === "del" ? "Removed in Doc B" : "Modified"}</span>
          </div>
        `;
      });
    }

    // 2. Text Additions on Pane B (Only in Highlight Clouds mode)
    if (showHighlightsB && diffInfo.diffBoxesB) {
      diffInfo.diffBoxesB.forEach((b) => {
        const left = Math.round(b.x * ratioX);
        const top = Math.round(b.y * ratioY);
        const width = Math.round(b.width * ratioX);
        const height = Math.round(b.height * ratioY);
        htmlB += `
          <div class="diff-highlight-box diff-box-${b.type}" style="left:${left}px; top:${top}px; width:${width}px; height:${height}px;">
            <span class="diff-box-tag">${b.type === "add" ? "Added in Doc B" : "Modified"}</span>
          </div>
        `;
      });
    }

    // 3. Visual Graphic Differences
    if (diffResult && diffResult.diffBoxesVisual && diffResult.diffBoxesVisual.length > 0) {
      diffResult.diffBoxesVisual.forEach((b) => {
        if (b.type === "del" && !htmlA.includes(`left:${Math.round(b.x)}px`)) {
          htmlA += `
            <div class="diff-highlight-box diff-box-del" style="left:${Math.round(b.x)}px; top:${Math.round(b.y)}px; width:${Math.round(b.width)}px; height:${Math.round(b.height)}px;">
              <span class="diff-box-tag">Removed in Doc B</span>
            </div>
          `;
        }
        if (showHighlightsB && b.type === "add" && !htmlB.includes(`left:${Math.round(b.x)}px`)) {
          htmlB += `
            <div class="diff-highlight-box diff-box-add" style="left:${Math.round(b.x)}px; top:${Math.round(b.y)}px; width:${Math.round(b.width)}px; height:${Math.round(b.height)}px;">
              <span class="diff-box-tag">Added in Doc B</span>
            </div>
          `;
        }
      });
    }

    if (DOM.highlightLayerA) DOM.highlightLayerA.innerHTML = htmlA;
    if (DOM.highlightLayerB) DOM.highlightLayerB.innerHTML = htmlB;
  }

  // Instantaneous, sudden 0ms submode switching directly from cached bitmaps
  function switchDiffSubmode(submode) {
    state.visualDiffSubmode = submode;
    updateSubmodeButtons();

    // Clear existing flicker
    if (state.flickerTimer) {
      clearInterval(state.flickerTimer);
      state.flickerTimer = null;
    }

    const p = state.currentPage;

    // Lookup cached offscreen canvases and diffResult
    let offCanvasA = null;
    let offCanvasB = null;
    let diffResult = null;

    for (const [k, v] of PageCache.cache.entries()) {
      if (k.startsWith(`A_${p}_`)) offCanvasA = v;
      if (k.startsWith(`B_${p}_`)) offCanvasB = v;
      if (k.startsWith(`diff_${p}_`)) diffResult = v;
    }

    const sizing = {
      cssWidth: parseInt(DOM.wrapA.style.width) || parseInt(DOM.canvasA.style.width) || 500,
      cssHeight: parseInt(DOM.wrapA.style.height) || parseInt(DOM.canvasA.style.height) || 700,
      pixelWidth: DOM.canvasA.width || 500,
      pixelHeight: DOM.canvasA.height || 700
    };

    if (offCanvasA || offCanvasB) {
      renderComparisonView(offCanvasA, offCanvasB, sizing, diffResult);
    } else {
      renderCurrentPage();
    }
  }

  function startFlickerMode(targetCtx, canvasA, canvasB) {
    if (state.flickerTimer) clearInterval(state.flickerTimer);

    state.flickerStateA = true;
    targetCtx.drawImage(canvasA, 0, 0);
    updateFlickerTitle(true);

    state.flickerTimer = setInterval(() => {
      state.flickerStateA = !state.flickerStateA;
      targetCtx.drawImage(state.flickerStateA ? canvasA : canvasB, 0, 0);
      updateFlickerTitle(state.flickerStateA);
    }, 400);
  }

  function updateFlickerTitle(isDocA) {
    if (DOM.titlePaneB) DOM.titlePaneB.textContent = isDocA ? "Flicker: Document A (Baseline)" : "Flicker: Document B (Revision)";
    if (DOM.pillPaneB) {
      DOM.pillPaneB.className = "doc-b-pill";
      DOM.pillPaneB.innerHTML = isDocA
        ? `<span style="color:#3b82f6; font-weight:700;">⚡ Showing Doc A</span>`
        : `<span style="color:#10b981; font-weight:700;">⚡ Showing Doc B</span>`;
    }
  }

  // =========================================================================
  //  SPECULATIVE BACKGROUND PRE-RENDERING (Idle Frame Execution)
  // =========================================================================
  function prefetchAdjacentPages(currentPage, totalPages, sizing) {
    const doPrefetch = async () => {
      const nextP = currentPage + 1;
      if (nextP <= totalPages) {
        const kA = `A_${nextP}_${sizing.scaleKey}`;
        const kB = `B_${nextP}_${sizing.scaleKey}`;

        if (!PageCache.has(kA) && state.fileA && nextP <= state.fileA.pageCount) {
          try {
            const pageA = await state.fileA.pdfDoc.getPage(nextP);
            const offA = await renderPageToOffscreen(pageA, sizing);
            PageCache.set(kA, offA);
          } catch (e) {}
        }
        if (!PageCache.has(kB) && state.fileB && nextP <= state.fileB.pageCount) {
          try {
            const pageB = await state.fileB.pdfDoc.getPage(nextP);
            const offB = await renderPageToOffscreen(pageB, sizing);
            PageCache.set(kB, offB);
          } catch (e) {}
        }
      }
    };

    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => doPrefetch());
    } else {
      setTimeout(() => doPrefetch(), 160);
    }
  }

  // =========================================================================
  //  PAGE RENDERING DISPATCHER & SYNCHRONIZATION
  // =========================================================================
  async function renderCurrentPage(fastRediffOnly = false) {
    const currentToken = ++state.renderToken;
    const ui = window.PDFCompare.ui;
    if (ui && ui.updatePageIndicator) ui.updatePageIndicator();
    if (ui && ui.updateDiffNavButtons) ui.updateDiffNavButtons();
    updateZoomToolbarButtons();
    updateSubmodeButtons();

    // Clear flicker timers
    if (state.flickerTimer) {
      clearInterval(state.flickerTimer);
      state.flickerTimer = null;
    }

    const p = state.currentPage;
    let pageA = null;
    let pageB = null;

    if (p <= state.fileA.pageCount) pageA = await state.fileA.pdfDoc.getPage(p);
    if (p <= state.fileB.pageCount) pageB = await state.fileB.pdfDoc.getPage(p);

    const refPage = pageA || pageB;
    if (!refPage) return;

    // Use DOM.paneScrollA for accurate scale calculation
    const sizing = computePageScale(refPage, DOM.paneScrollA);
    if (DOM.zoomIndicator) DOM.zoomIndicator.textContent = sizing.label;

    // Check Cache for Offscreen Canvases
    const keyA = `A_${p}_${sizing.scaleKey}`;
    const keyB = `B_${p}_${sizing.scaleKey}`;

    let offCanvasA = PageCache.get(keyA);
    let offCanvasB = PageCache.get(keyB);

    if (!offCanvasA && pageA) {
      offCanvasA = await renderPageToOffscreen(pageA, sizing);
      PageCache.set(keyA, offCanvasA);
    }
    if (!offCanvasB && pageB) {
      offCanvasB = await renderPageToOffscreen(pageB, sizing);
      PageCache.set(keyB, offCanvasB);
    }

    if (currentToken !== state.renderToken) return;

    // Compute or retrieve 32-bit pixel diff
    const diffKey = `diff_${p}_${sizing.scaleKey}_${state.diffSensitivity}`;
    let diffResult = PageCache.get(diffKey);

    if (!diffResult && (offCanvasA || offCanvasB)) {
      const pixelDiffFn = (window.PDFCompare.diff && window.PDFCompare.diff.fastPixelDiff32) || window.PDFCompare.fastPixelDiff32;
      if (pixelDiffFn) {
        diffResult = pixelDiffFn(offCanvasA, offCanvasB, sizing, state.diffSensitivity);
        PageCache.set(diffKey, diffResult);

        if (state.differences[p]) {
          state.differences[p].diffPercent = diffResult.diffPercent || "0.0";
          if (diffResult.totalDiffPixels > 30 || (diffResult.diffBoxesVisual && diffResult.diffBoxesVisual.length > 0)) {
            state.differences[p].hasDiff = true;
          }
        }
      }
    }

    renderComparisonView(offCanvasA, offCanvasB, sizing, diffResult);
    if (ui && ui.updateDrawerActive) ui.updateDrawerActive();
    prefetchAdjacentPages(p, state.totalPages, sizing);
  }

  // Expose Renderer API
  window.PDFCompare.renderer = {
    computePageScale,
    updateZoomToolbarButtons,
    updateSubmodeButtons,
    renderPageToOffscreen,
    renderComparisonView,
    renderHighlightBoxes,
    switchDiffSubmode,
    startFlickerMode,
    updateFlickerTitle,
    prefetchAdjacentPages,
    renderCurrentPage
  };

  // Top-level debugging shortcuts
  window.PDFCompare.computePageScale = computePageScale;
  window.PDFCompare.renderCurrentPage = renderCurrentPage;
  window.PDFCompare.switchDiffSubmode = switchDiffSubmode;
})();
