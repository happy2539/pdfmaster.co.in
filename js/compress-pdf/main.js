/**
 * PDFMaster - Application Bootstrap & Event Orchestrator
 * Connects file handling, workspace reset, UI bindings, and developer debugging interface.
 */
(function () {
  "use strict";

  const state = window.PDFCompressState;
  const { fmtBytes, showToast, initTheme } = window.PDFCompressUtils;
  const storage = window.PDFCompressStorage;
  const canvasPool = window.PDFCompressCanvasPool;
  const preview = window.PDFCompressPreview;
  const ui = window.PDFCompressUI;
  const pipeline = window.PDFCompressPipeline;
  const device = window.PDFCompressDevice;

  // DOM Elements
  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const workspace = document.getElementById("workspace");
  const fileNameEl = document.getElementById("fileName");
  const fileSizeEl = document.getElementById("fileSize");
  const ramBadgeEl = document.getElementById("ramBadge");
  const compressPdfBtn = document.getElementById("compressPdfBtn");
  const resultsCard = document.getElementById("resultsCard");
  const downloadResultBtn = document.getElementById("downloadResultBtn");
  const compressMoreBtn = document.getElementById("compressMoreBtn");
  const startOverBtn = document.getElementById("startOverBtn");
  const changeFileBtn = document.getElementById("changeFileBtn");
  const resetAllBtn = document.getElementById("resetAllBtn");
  const recoveryBtn = document.getElementById("recoveryBtn");
  const presetCards = document.querySelectorAll(".preset-card");
  const dpiSlider = document.getElementById("dpiSlider");
  const dpiValBadge = document.getElementById("dpiValBadge");
  const qualitySlider = document.getElementById("qualitySlider");
  const qualityValBadge = document.getElementById("qualityValBadge");
  const quickDpiBtns = document.querySelectorAll(".quick-dpi-btn");
  const grayscaleSwitch = document.getElementById("grayscaleSwitch");
  const pageRangeInput = document.getElementById("pageRangeInput");
  const applyTargetBtn = document.getElementById("applyTargetBtn");
  const targetSizeInput = document.getElementById("targetSizeInput");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const fsPrevBtn = document.getElementById("fsPrevBtn");
  const fsNextBtn = document.getElementById("fsNextBtn");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomResetBtn = document.getElementById("zoomResetBtn");
  const origFsBtn = document.getElementById("origFsBtn");
  const compFsBtn = document.getElementById("compFsBtn");
  const fullscreenPreviewBtn = document.getElementById("fullscreenPreviewBtn");
  const fsViewTabs = document.getElementById("fsViewTabs");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sideMenu = document.getElementById("sideMenu");
  const sideOverlay = document.getElementById("sideOverlay");
  const closeMenuBtn = document.getElementById("closeMenuBtn");
  const backTop = document.getElementById("backTop");
  const themeToggle = document.getElementById("themeToggle");

  async function initPdf(fileOrBlob, name, isRestoring = false) {
    if (!fileOrBlob) return;
    try {
      ui.showLoadingModal(
        true,
        "Analyzing PDF Document…",
        "Inspecting pages, embedded streams, and structural dictionary…",
        15,
        "⚡ Low-RAM Architecture Active",
      );

      state.fileName = name || fileOrBlob.name || "document.pdf";
      state.fileSize = fileOrBlob.size;
      state.currentBlob = fileOrBlob;

      if (state.currentBlobUrl) {
        URL.revokeObjectURL(state.currentBlobUrl);
      }
      state.currentBlobUrl = URL.createObjectURL(fileOrBlob);

      const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
      const loadingTask = pdfjsLib.getDocument({
        url: state.currentBlobUrl,
        cMapUrl: "/assets/vendor/cmaps/",
        cMapPacked: true,
        enableXfa: false,
        disableAutoFetch: true,
        disableStream: false,
      });

      state.pdfJsDoc = await loadingTask.promise;
      state.totalPages = state.pdfJsDoc.numPages;

      if (!isRestoring && storage) {
        await storage.persistBlobToDB(fileOrBlob, state.fileName);
        storage.scheduleDBSave();
      }

      // Update workspace header
      if (fileNameEl) fileNameEl.textContent = state.fileName;
      if (fileSizeEl) {
        fileSizeEl.innerHTML = `<span>${fmtBytes(state.fileSize)}</span> · <span>${state.totalPages} page(s)</span>`;
      }

      state.hardwareConfig = device.detectHardwareCapabilities();
      if (ramBadgeEl) {
        ramBadgeEl.textContent = state.hardwareConfig.badgeText;
      }

      // Show workspace, hide dropzone
      if (uploadZone) uploadZone.style.display = "none";
      if (workspace) workspace.classList.add("active");
      if (resultsCard) resultsCard.classList.remove("active");
      if (compressPdfBtn) compressPdfBtn.disabled = false;

      ui.updateLoadingProgress(80, "Rendering original page preview…");

      state.previewPage = 1;
      await preview.renderOriginalPreview();
      preview.invalidateCompressedCache();

      ui.showLoadingModal(false);
      showToast(
        `Loaded "${state.fileName}" (${state.totalPages} pages)`,
        "success",
      );
    } catch (err) {
      console.error("Failed to load PDF:", err);
      ui.showLoadingModal(false);
      showToast(
        "Could not load PDF: " +
          (err.message || "File might be corrupted or password-protected"),
        "error",
      );
    }
  }

  function handleFileSelection(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      showToast("Please select a valid PDF file.", "error");
      return;
    }
    initPdf(file, file.name, false);
  }

  function resetWorkspace() {
    if (preview && preview.isFullscreenActive && preview.isFullscreenActive()) {
      preview.exitFullscreen();
    }
    if (canvasPool) canvasPool.purgeCanvasSlotPool();
    if (preview) preview.invalidateCompressedCache();
    if (state.currentBlobUrl) {
      URL.revokeObjectURL(state.currentBlobUrl);
      state.currentBlobUrl = null;
    }
    state.currentBlob = null;
    state.pdfJsDoc = null;
    state.totalPages = 0;
    state.fileSize = 0;
    state.fileName = "document.pdf";
    state.lastCompressedBlob = null;

    if (workspace) workspace.classList.remove("active");
    if (resultsCard) resultsCard.classList.remove("active");
    if (uploadZone) uploadZone.style.display = "block";
    if (fileInput) fileInput.value = "";

    if (storage) {
      storage.clearSessionFromDB();
      storage.clearRenderedPagesFromDB();
    }
  }

  function bindEvents() {
    // Browse & Dropzone
    if (browseBtn) {
      browseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    if (uploadZone) {
      uploadZone.addEventListener("click", () => fileInput.click());

      uploadZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadZone.classList.add("dragover");
      });

      uploadZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        uploadZone.classList.remove("dragover");
      });

      uploadZone.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadZone.classList.remove("dragover");
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          handleFileSelection(files[0]);
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelection(file);
      });
    }

    // Paste file from clipboard
    window.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let item of items) {
        if (item.kind === "file" && item.type === "application/pdf") {
          const file = item.getAsFile();
          if (file) {
            handleFileSelection(file);
            showToast("PDF pasted from clipboard!", "success");
            break;
          }
        }
      }
    });

    // Preset Selection Cards
    presetCards.forEach((card) => {
      card.addEventListener("click", () => {
        const preset = card.dataset.preset;
        if (!preset) return;
        state.activePreset = preset;
        ui.syncUiFromState();
        preview.invalidateCompressedCache();
        if (storage) storage.scheduleDBSave();
      });
    });

    // Custom Sliders
    if (dpiSlider) {
      dpiSlider.addEventListener("input", (e) => {
        state.dpi = parseInt(e.target.value, 10);
        if (dpiValBadge) dpiValBadge.textContent = `${state.dpi} DPI`;
        quickDpiBtns.forEach((btn) => {
          btn.classList.toggle(
            "active",
            parseInt(btn.dataset.dpi, 10) === state.dpi,
          );
        });
        ui.updateActionSummary();
        preview.invalidateCompressedCache();
        if (storage) storage.scheduleDBSave();
      });
    }

    if (qualitySlider) {
      qualitySlider.addEventListener("input", (e) => {
        state.quality = parseInt(e.target.value, 10) / 100;
        if (qualityValBadge)
          qualityValBadge.textContent = `${Math.round(state.quality * 100)}%`;
        ui.updateActionSummary();
        preview.invalidateCompressedCache();
        if (storage) storage.scheduleDBSave();
      });
    }

    quickDpiBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const dpi = parseInt(btn.dataset.dpi, 10);
        if (dpi) {
          state.dpi = dpi;
          if (dpiSlider) dpiSlider.value = dpi;
          if (dpiValBadge) dpiValBadge.textContent = `${dpi} DPI`;
          quickDpiBtns.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          ui.updateActionSummary();
          preview.invalidateCompressedCache();
          if (storage) storage.scheduleDBSave();
        }
      });
    });

    if (grayscaleSwitch) {
      grayscaleSwitch.addEventListener("click", () => {
        state.grayscale = !state.grayscale;
        grayscaleSwitch.classList.toggle("checked", state.grayscale);
        ui.updateActionSummary();
        preview.invalidateCompressedCache();
        if (storage) storage.scheduleDBSave();
      });
    }

    if (applyTargetBtn) {
      applyTargetBtn.addEventListener("click", ui.applyTargetFileSize);
    }
    if (targetSizeInput) {
      targetSizeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") ui.applyTargetFileSize();
      });
    }

    if (pageRangeInput) {
      pageRangeInput.addEventListener("input", (e) => {
        state.pageRange = e.target.value.trim();
        if (storage) storage.scheduleDBSave();
      });
    }

    // Comparison Page Steppers
    if (prevPageBtn) {
      prevPageBtn.addEventListener("click", () => {
        preview.goToPage((state.previewPage || 1) - 1);
      });
    }
    if (nextPageBtn) {
      nextPageBtn.addEventListener("click", () => {
        preview.goToPage((state.previewPage || 1) + 1);
      });
    }
    if (fsPrevBtn) {
      fsPrevBtn.addEventListener("click", () => {
        preview.goToPage((state.previewPage || 1) - 1);
      });
    }
    if (fsNextBtn) {
      fsNextBtn.addEventListener("click", () => {
        preview.goToPage((state.previewPage || 1) + 1);
      });
    }

    // Zoom Controls
    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", () => {
        preview.applyZoom(state.zoomLevel + 0.25);
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", () => {
        preview.applyZoom(state.zoomLevel - 0.25);
      });
    }
    if (zoomResetBtn) {
      zoomResetBtn.addEventListener("click", () => {
        preview.applyZoom(1.0);
      });
    }

    // Initialize Pan & Wheel Zoom
    const origCanvasWrap = document.getElementById("origCanvasWrap");
    const compCanvasWrap = document.getElementById("compCanvasWrap");
    preview.initPanAndZoom(origCanvasWrap, false);
    preview.initPanAndZoom(compCanvasWrap, true);

    // Fullscreen Controls
    if (origFsBtn) {
      origFsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        preview.toggleFullscreenPreview("orig");
      });
    }
    if (compFsBtn) {
      compFsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        preview.toggleFullscreenPreview("comp");
      });
    }
    if (fsViewTabs) {
      fsViewTabs.querySelectorAll(".fs-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          preview.setComparisonView(tab.dataset.view);
        });
      });
    }

    const initialPreviewBtn = document.getElementById("generatePreviewBtn");
    if (initialPreviewBtn) {
      initialPreviewBtn.addEventListener(
        "click",
        preview.generateSinglePageCompressedPreview,
      );
    }

    if (fullscreenPreviewBtn) {
      fullscreenPreviewBtn.addEventListener("click", () => {
        preview.toggleFullscreenPreview("split");
      });
    }
    document.addEventListener(
      "fullscreenchange",
      preview.handleFullscreenChange,
    );
    document.addEventListener(
      "webkitfullscreenchange",
      preview.handleFullscreenChange,
    );

    // Keyboard navigation
    window.addEventListener("keydown", (e) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      ) {
        return;
      }
      const isFs = preview.isFullscreenActive();
      if (e.key === "Escape" && isFs) {
        e.preventDefault();
        preview.exitFullscreen();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        if (isFs || (workspace && workspace.classList.contains("active"))) {
          e.preventDefault();
          preview.goToPage((state.previewPage || 1) - 1);
        }
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        if (isFs || (workspace && workspace.classList.contains("active"))) {
          e.preventDefault();
          preview.goToPage((state.previewPage || 1) + 1);
        }
      }
    });

    // Main Action Button
    if (compressPdfBtn) {
      compressPdfBtn.addEventListener("click", pipeline.runCompression);
    }

    // Results Actions
    if (downloadResultBtn) {
      downloadResultBtn.addEventListener("click", ui.downloadCompressedPdf);
    }
    if (compressMoreBtn) {
      compressMoreBtn.addEventListener("click", () => {
        if (resultsCard) resultsCard.classList.remove("active");
        if (workspace)
          workspace.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    if (startOverBtn) {
      startOverBtn.addEventListener("click", resetWorkspace);
    }
    if (changeFileBtn) {
      changeFileBtn.addEventListener("click", () => fileInput.click());
    }
    if (resetAllBtn) {
      resetAllBtn.addEventListener("click", () => {
        state.activePreset = "recommended";
        state.dpi = 144;
        state.quality = 0.72;
        state.grayscale = false;
        state.pageRange = "all";
        ui.syncUiFromState();
        preview.invalidateCompressedCache();
        if (storage) storage.scheduleDBSave();
        showToast("Settings reset to defaults.", "info");
      });
    }

    // Recovery Button
    if (recoveryBtn) {
      recoveryBtn.addEventListener("click", () => {
        if (storage) storage.loadSessionFromDB(true);
      });
    }

    // Theme Toggle
    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        const cur =
          document.documentElement.getAttribute("data-theme") || "light";
        const next = cur === "dark" ? "light" : "dark";
        localStorage.setItem(window.PDFCompressConstants.THEME_KEY, next);
        window.PDFCompressUtils.applyTheme(next);
      });
    }

    // Mobile Menu
    if (hamburgerBtn && sideMenu && sideOverlay) {
      hamburgerBtn.addEventListener("click", () => {
        sideMenu.classList.add("open");
        sideOverlay.classList.add("open");
      });
      if (closeMenuBtn) {
        closeMenuBtn.addEventListener("click", () => {
          sideMenu.classList.remove("open");
          sideOverlay.classList.remove("open");
        });
      }
      sideOverlay.addEventListener("click", () => {
        sideMenu.classList.remove("open");
        sideOverlay.classList.remove("open");
      });
    }

    // Back to top
    if (backTop) {
      window.addEventListener("scroll", () => {
        if (window.scrollY > 400) {
          backTop.classList.add("show");
        } else {
          backTop.classList.remove("show");
        }
      });
      backTop.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    // FAQ Accordion
    document.querySelectorAll(".faq-item").forEach((item) => {
      const q = item.querySelector(".faq-question");
      if (q) {
        q.addEventListener("click", () => {
          const isActive = item.classList.contains("active");
          document
            .querySelectorAll(".faq-item")
            .forEach((i) => i.classList.remove("active"));
          if (!isActive) item.classList.add("active");
        });
      }
    });
  }

  // Developer & Console Debugging Interface
  window.PDFCompress = {
    state,
    storage,
    canvasPool,
    preview,
    ui,
    pipeline,
    device,
    initPdf,
    resetWorkspace,
    runCompression: pipeline.runCompression,
  };
  window.PDFCompressMain = {
    initPdf,
    resetWorkspace,
    bindEvents,
  };

  // Bootstrap on DOMContentLoaded
  window.addEventListener("DOMContentLoaded", () => {
    initTheme();
    bindEvents();
    ui.syncUiFromState();
    if (storage) storage.checkStoredSessionAvailable();
  });
})();
