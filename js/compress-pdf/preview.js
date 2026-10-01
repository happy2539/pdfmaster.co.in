/**
 * PDFMaster - Live Quality Comparison & Preview Controller
 * Manages original vs compressed side-by-side rendering, zoom, panning, and fullscreen comparison.
 */
(function () {
  "use strict";

  const state = window.PDFCompressState;
  const { fmtBytes, showToast } = window.PDFCompressUtils;

  // DOM Elements
  const comparisonSection = document.getElementById("comparisonSection");
  const comparisonGrid = document.getElementById("comparisonGrid");
  const origCanvasWrap = document.getElementById("origCanvasWrap");
  const compCanvasWrap = document.getElementById("compCanvasWrap");
  const origMetricEl = document.getElementById("origMetric");
  const compMetricEl = document.getElementById("compMetric");
  const pageCounterEl = document.getElementById("pageCounter");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const fsPrevBtn = document.getElementById("fsPrevBtn");
  const fsNextBtn = document.getElementById("fsNextBtn");
  const zoomResetBtn = document.getElementById("zoomResetBtn");
  const fullscreenPreviewBtn = document.getElementById("fullscreenPreviewBtn");
  const fsViewTabs = document.getElementById("fsViewTabs");

  let isPanningOrig = false;
  let isPanningComp = false;
  let previewOrigBlob = null;
  let previewCompBlob = null;
  const compressedPageCache = new Map();

  function applyZoom(newLevel) {
    state.zoomLevel = Math.max(
      0.5,
      Math.min(3.0, Math.round(newLevel * 100) / 100),
    );
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${Math.round(state.zoomLevel * 100)}%`;
    }
    const isZoomed = state.zoomLevel > 1.0;
    [origCanvasWrap, compCanvasWrap].forEach((wrap) => {
      if (!wrap) return;
      wrap.classList.toggle("is-zoomed", isZoomed);
      const canvas = wrap.querySelector("canvas");
      if (canvas) {
        if (state.zoomLevel === 1.0) {
          canvas.style.transform = "none";
          canvas.style.margin = "0";
        } else {
          canvas.style.transform = `scale(${state.zoomLevel})`;
          canvas.style.transformOrigin = "center center";
          const marginV = Math.round((state.zoomLevel - 1) * 160);
          const marginH = Math.round((state.zoomLevel - 1) * 120);
          canvas.style.margin = `${marginV}px ${marginH}px`;
        }
      }
    });
  }

  function initPanAndZoom(wrap, isComp) {
    if (!wrap) return;
    let isDown = false;
    let startX = 0,
      startY = 0;
    let scrollLeft = 0,
      scrollTop = 0;

    wrap.addEventListener("mousedown", (e) => {
      if (state.zoomLevel <= 1.0) return;
      isDown = true;
      if (isComp) isPanningComp = false;
      else isPanningOrig = false;
      wrap.classList.add("is-panning");
      startX = e.pageX - wrap.offsetLeft;
      startY = e.pageY - wrap.offsetTop;
      scrollLeft = wrap.scrollLeft;
      scrollTop = wrap.scrollTop;
    });

    window.addEventListener("mouseup", () => {
      if (isDown) {
        isDown = false;
        wrap.classList.remove("is-panning");
        setTimeout(() => {
          if (isComp) isPanningComp = false;
          else isPanningOrig = false;
        }, 80);
      }
    });

    wrap.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - wrap.offsetLeft;
      const y = e.pageY - wrap.offsetTop;
      const walkX = x - startX;
      const walkY = y - startY;
      if (Math.abs(walkX) > 4 || Math.abs(walkY) > 4) {
        if (isComp) isPanningComp = true;
        else isPanningOrig = true;
      }
      wrap.scrollLeft = scrollLeft - walkX;
      wrap.scrollTop = scrollTop - walkY;
    });

    wrap.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          const step = e.deltaY < 0 ? 0.2 : -0.2;
          applyZoom(state.zoomLevel + step);
        }
      },
      { passive: false },
    );
  }

  function updatePageControlsUi() {
    const pageNum = state.previewPage || 1;
    const total = state.totalPages || 1;
    if (pageCounterEl) {
      pageCounterEl.textContent = `Page ${pageNum} of ${total}`;
    }
    const isFirst = pageNum <= 1;
    const isLast = pageNum >= total;
    if (prevPageBtn) prevPageBtn.disabled = isFirst;
    if (nextPageBtn) nextPageBtn.disabled = isLast;
    if (fsPrevBtn) fsPrevBtn.disabled = isFirst;
    if (fsNextBtn) fsNextBtn.disabled = isLast;
  }

  async function goToPage(targetPage) {
    if (!state.pdfJsDoc || state.totalPages <= 0) return;
    const pageNum = Math.min(Math.max(1, targetPage), state.totalPages);
    state.previewPage = pageNum;

    updatePageControlsUi();
    await renderOriginalPreview();

    // Check if compressed preview for this page is already cached
    if (compressedPageCache.has(pageNum)) {
      const cached = compressedPageCache.get(pageNum);
      previewCompBlob = cached.blob;
      if (compCanvasWrap) {
        compCanvasWrap.innerHTML = "";
        compCanvasWrap.appendChild(cached.canvas);
      }
      if (compMetricEl) {
        compMetricEl.textContent = cached.metricStr;
      }
    } else {
      const isCompOnlyFs =
        isFullscreenActive() &&
        comparisonGrid &&
        comparisonGrid.dataset.view === "comp";

      if (isCompOnlyFs) {
        await generateSinglePageCompressedPreview();
      } else {
        renderCompressedPlaceholder(pageNum);
      }
    }

    applyZoom(state.zoomLevel);
  }

  async function renderOriginalPreview() {
    if (!state.pdfJsDoc) return;
    try {
      const pageNum = Math.min(
        Math.max(1, state.previewPage || 1),
        state.totalPages,
      );
      updatePageControlsUi();

      const page = await state.pdfJsDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1.5 });
      const origCanvas = document.createElement("canvas");
      origCanvas.width = Math.round(baseViewport.width);
      origCanvas.height = Math.round(baseViewport.height);
      const origCtx = origCanvas.getContext("2d", { willReadFrequently: true });
      await page.render({ canvasContext: origCtx, viewport: baseViewport })
        .promise;

      // Estimate original page weight from canvas
      const origBlob = await new Promise((res) =>
        origCanvas.toBlob(res, "image/jpeg", 0.95),
      );
      previewOrigBlob = origBlob;

      origCanvas.title = "Click image to view full screen (or use Zoom)";
      origCanvas.addEventListener("click", () => {
        if (!isPanningOrig && !isFullscreenActive()) {
          toggleFullscreenPreview("orig");
        }
      });

      if (origCanvasWrap) {
        origCanvasWrap.innerHTML = "";
        origCanvasWrap.appendChild(origCanvas);
      }
      if (origMetricEl) {
        origMetricEl.textContent = `Original: ${Math.round(baseViewport.width)} × ${Math.round(baseViewport.height)}px · ~${fmtBytes(origBlob.size)}`;
      }

      applyZoom(state.zoomLevel);
      page.cleanup();
    } catch (err) {
      console.warn("Original preview render error:", err);
    }
  }

  function renderCompressedPlaceholder(pageNum) {
    previewCompBlob = null;
    if (!compCanvasWrap) return;

    const page = pageNum || state.previewPage || 1;
    compCanvasWrap.innerHTML = `
      <div class="preview-placeholder" id="compPlaceholder">
        <div class="placeholder-icon">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="4 14 10 14 10 20"></polyline>
            <polyline points="20 10 14 10 14 4"></polyline>
            <line x1="14" y1="10" x2="21" y2="3"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </div>
        <p class="placeholder-text" id="placeholderText">Preview compression for Page ${page}</p>
        <button type="button" class="btn-preview" id="generatePreviewBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Show Preview
        </button>
      </div>
    `;

    if (compMetricEl) {
      compMetricEl.textContent =
        'Click "Show Preview" to test settings on this page';
    }

    const newBtn = document.getElementById("generatePreviewBtn");
    if (newBtn) {
      newBtn.addEventListener("click", generateSinglePageCompressedPreview);
    }
  }

  function invalidateCompressedCache() {
    compressedPageCache.clear();
    previewCompBlob = null;
    renderCompressedPlaceholder(state.previewPage);
  }

  async function generateSinglePageCompressedPreview() {
    if (!state.pdfJsDoc || state.isUpdatingPreview) return;
    const btn = document.getElementById("generatePreviewBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner-xs"></div> Compressing Page ${state.previewPage || 1}…`;
    }
    state.isUpdatingPreview = true;

    try {
      const pageNum = Math.min(
        Math.max(1, state.previewPage || 1),
        state.totalPages,
      );
      const page = await state.pdfJsDoc.getPage(pageNum);
      const settings = window.PDFCompressUI
        ? window.PDFCompressUI.getEffectiveSettings()
        : {
            dpi: state.dpi,
            quality: state.quality,
            grayscale: state.grayscale,
            isLossless: state.isLossless,
          };

      const compCanvas = document.createElement("canvas");
      const compCtx = compCanvas.getContext("2d", { willReadFrequently: true });
      let compBlob;

      if (settings.isLossless) {
        const baseViewport = page.getViewport({ scale: 1.5 });
        compCanvas.width = Math.round(baseViewport.width);
        compCanvas.height = Math.round(baseViewport.height);
        await page.render({ canvasContext: compCtx, viewport: baseViewport })
          .promise;
        compBlob = await new Promise((res) =>
          compCanvas.toBlob(res, "image/jpeg", 0.9),
        );
      } else {
        const targetDpi = Math.max(50, settings.dpi || 144);
        const compScale = (targetDpi / 72) * 1.5;
        const compViewport = page.getViewport({ scale: compScale });
        compCanvas.width = Math.round(compViewport.width);
        compCanvas.height = Math.round(compViewport.height);

        await page.render({ canvasContext: compCtx, viewport: compViewport })
          .promise;

        // Apply Grayscale in-place if requested
        if (settings.grayscale) {
          const imgData = compCtx.getImageData(
            0,
            0,
            compCanvas.width,
            compCanvas.height,
          );
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const gray = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
            d[i] = gray;
            d[i + 1] = gray;
            d[i + 2] = gray;
          }
          compCtx.putImageData(imgData, 0, 0);
        }

        const compQuality = Math.max(0.15, Math.min(0.95, settings.quality));
        compBlob = await new Promise((res) =>
          compCanvas.toBlob(res, "image/jpeg", compQuality),
        );
      }

      previewCompBlob = compBlob;

      compCanvas.title = "Click image to view full screen (or use Zoom)";
      compCanvas.addEventListener("click", () => {
        if (!isPanningComp && !isFullscreenActive()) {
          toggleFullscreenPreview("comp");
        }
      });

      if (compCanvasWrap) {
        compCanvasWrap.innerHTML = "";
        compCanvasWrap.appendChild(compCanvas);
      }

      let metricStr = `Compressed: ${compCanvas.width} × ${compCanvas.height}px · ~${fmtBytes(compBlob.size)}`;
      if (previewOrigBlob && previewOrigBlob.size > 0) {
        const savedBytes = previewOrigBlob.size - compBlob.size;
        if (savedBytes > 0) {
          const savedPct = Math.round(
            (savedBytes / previewOrigBlob.size) * 100,
          );
          metricStr += ` (-${savedPct}% smaller)`;
        }
      }
      if (compMetricEl) {
        compMetricEl.textContent = metricStr;
      }

      compressedPageCache.set(pageNum, {
        canvas: compCanvas,
        blob: compBlob,
        metricStr: metricStr,
      });

      applyZoom(state.zoomLevel);
      page.cleanup();
    } catch (err) {
      console.error("Single page preview error:", err);
      showToast("Could not generate page preview: " + err.message, "error");
      renderCompressedPlaceholder(state.previewPage);
    } finally {
      state.isUpdatingPreview = false;
    }
  }

  function isFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      (comparisonSection &&
        comparisonSection.classList.contains("is-fullscreen"))
    );
  }

  function updateFullscreenBtnUi(isFs) {
    if (!fullscreenPreviewBtn) return;
    fullscreenPreviewBtn.classList.toggle("is-active", isFs);
    fullscreenPreviewBtn.title = isFs
      ? "Exit Full Screen (Esc)"
      : "Full Screen Preview";
    fullscreenPreviewBtn.setAttribute(
      "aria-label",
      isFs ? "Exit Full Screen" : "Full Screen Preview",
    );
    const fsOpen = fullscreenPreviewBtn.querySelector(".fs-open-icon");
    const fsExit = fullscreenPreviewBtn.querySelector(".fs-exit-icon");
    if (fsOpen) fsOpen.style.display = isFs ? "none" : "block";
    if (fsExit) fsExit.style.display = isFs ? "block" : "none";
    updatePageControlsUi();
  }

  function setComparisonView(viewMode) {
    if (!comparisonGrid) return;
    const mode = ["split", "orig", "comp"].includes(viewMode)
      ? viewMode
      : "split";
    comparisonGrid.dataset.view = mode;
    if (fsViewTabs) {
      fsViewTabs.querySelectorAll(".fs-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.view === mode);
      });
    }
  }

  async function enterFullscreen(targetView) {
    if (!comparisonSection) return;
    setComparisonView(targetView || "split");
    comparisonSection.classList.add("is-fullscreen");
    document.body.classList.add("comparison-fullscreen-active");
    updateFullscreenBtnUi(true);

    const req =
      comparisonSection.requestFullscreen ||
      comparisonSection.webkitRequestFullscreen;
    if (req && document.fullscreenEnabled !== false) {
      try {
        await req.call(comparisonSection);
      } catch (err) {}
    }
    applyZoom(state.zoomLevel);
  }

  async function exitFullscreen() {
    if (!comparisonSection) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        try {
          await exit.call(document);
        } catch (err) {}
      }
    }
    comparisonSection.classList.remove("is-fullscreen");
    document.body.classList.remove("comparison-fullscreen-active");
    updateFullscreenBtnUi(false);
    setComparisonView("split");
    applyZoom(state.zoomLevel);
  }

  async function toggleFullscreenPreview(targetView) {
    if (!comparisonSection) return;
    const isFs = isFullscreenActive();

    if (!isFs) {
      await enterFullscreen(targetView);
    } else {
      if (
        targetView &&
        comparisonGrid &&
        comparisonGrid.dataset.view !== targetView
      ) {
        setComparisonView(targetView);
        return;
      }
      await exitFullscreen();
    }
  }

  function handleFullscreenChange() {
    const isFs = !!(
      document.fullscreenElement || document.webkitFullscreenElement
    );
    if (isFs) {
      if (comparisonSection) comparisonSection.classList.add("is-fullscreen");
      document.body.classList.add("comparison-fullscreen-active");
      updateFullscreenBtnUi(true);
    } else {
      if (comparisonSection)
        comparisonSection.classList.remove("is-fullscreen");
      document.body.classList.remove("comparison-fullscreen-active");
      updateFullscreenBtnUi(false);
      setComparisonView("split");
    }
    applyZoom(state.zoomLevel);
  }

  window.PDFCompressPreview = {
    applyZoom,
    initPanAndZoom,
    updatePageControlsUi,
    goToPage,
    renderOriginalPreview,
    renderCompressedPlaceholder,
    invalidateCompressedCache,
    generateSinglePageCompressedPreview,
    isFullscreenActive,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreenPreview,
    setComparisonView,
    handleFullscreenChange,
  };
})();
