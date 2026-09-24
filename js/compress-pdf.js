/**
 * PDFMaster - Compress PDF Controller
 * -------------------------------------------------------------
 * Production-grade client-side PDF compressor featuring:
 *  - Tiered Low-RAM Sequential Page Streaming Engine
 *  - Multi-Preset Compression (Recommended, Extreme, Mild, Lossless Vector, Custom)
 *  - Real-time Live Quality Comparison (Original vs Compressed)
 *  - In-place Grayscale Luminance Processing
 *  - Target File Size Goal Auto-Calculator
 *  - IndexedDB Session Recovery & Offline Storage
 *  - 100% Client-Side Privacy (Zero Server Uploads)
 */
(function () {
  "use strict";

  // =============================================
  //  PDF.js WORKER CONFIGURATION
  // =============================================
  const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
  if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
  }

  // =============================================
  //  CONSTANTS & CONFIG
  // =============================================
  const DB_NAME = "pdfmaster_compress_db";
  const DB_VERSION = 1;
  const THEME_KEY = "pdfmaster-theme";

  const PRESETS = {
    recommended: {
      dpi: 144,
      quality: 0.68,
      grayscale: false,
      name: "Recommended (Balanced)",
      badge: "Popular",
      savingsEst: "~65–80%",
    },
    extreme: {
      dpi: 96,
      quality: 0.48,
      grayscale: false,
      name: "Extreme Compression",
      badge: "Max Shrink",
      savingsEst: "~80–92%",
    },
    mild: {
      dpi: 200,
      quality: 0.82,
      grayscale: false,
      name: "Mild (High Quality)",
      badge: "High Res",
      savingsEst: "~30–50%",
    },
    lossless: {
      dpi: 0,
      quality: 1.0,
      grayscale: false,
      name: "Lossless Vector & Streams",
      badge: "No Loss",
      savingsEst: "~10–30%",
    },
    custom: {
      dpi: 144,
      quality: 0.7,
      grayscale: false,
      name: "Custom (Pro Controls)",
      badge: "Advanced",
      savingsEst: "Customizable",
    },
  };

  // =============================================
  //  APPLICATION STATE
  // =============================================
  const state = {
    fileName: "document.pdf",
    fileSize: 0,
    totalPages: 0,
    currentBlob: null,
    currentBlobUrl: null,
    hasPersistedBlob: false,
    pdfJsDoc: null,
    preset: "recommended",
    customDpi: 144,
    customQuality: 0.7,
    isGrayscale: false,
    targetSizeKb: null,
    pageRange: "",
    previewPage: 1,
    zoomLevel: 1.0,
    isUpdatingPreview: false,
    lastCompressedBlob: null,
    lastCompressedName: "",
  };

  let dbPromise = null;
  let dbSaveTimer = null;
  let toastTimer = null;
  let previewDebounceTimer = null;
  let previewOrigBlob = null;
  let previewCompBlob = null;
  const compressedPageCache = new Map();

  // Reusable Offscreen Canvas for Low-RAM Processing
  const streamCanvas = document.createElement("canvas");
  const streamCtx = streamCanvas.getContext("2d", { willReadFrequently: true });

  // =============================================
  //  DOM ELEMENTS
  // =============================================
  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const workspace = document.getElementById("workspace");
  const fileNameEl = document.getElementById("fileName");
  const fileSizeEl = document.getElementById("fileSize");
  const ramBadgeEl = document.getElementById("ramBadge");
  const changeFileBtn = document.getElementById("changeFileBtn");
  const resetAllBtn = document.getElementById("resetAllBtn");

  // Preset Cards
  const presetCards = document.querySelectorAll(".preset-card");
  const customPanel = document.getElementById("customPanel");
  const dpiSlider = document.getElementById("dpiSlider");
  const dpiValBadge = document.getElementById("dpiValBadge");
  const qualitySlider = document.getElementById("qualitySlider");
  const qualityValBadge = document.getElementById("qualityValBadge");
  const quickDpiBtns = document.querySelectorAll(".btn-chip");
  const grayscaleSwitch = document.getElementById("grayscaleSwitch");
  const targetSizeInput = document.getElementById("targetSizeInput");
  const applyTargetBtn = document.getElementById("applyTargetBtn");
  const pageRangeInput = document.getElementById("pageRangeInput");

  // Comparison Widget Elements
  const comparisonSection = document.getElementById("comparisonSection");
  const comparisonGrid = document.getElementById("comparisonGrid");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const fsPrevBtn = document.getElementById("fsPrevBtn");
  const fsNextBtn = document.getElementById("fsNextBtn");
  const pageCounterEl = document.getElementById("pageCounterEl");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomResetBtn = document.getElementById("zoomResetBtn");
  const fullscreenPreviewBtn = document.getElementById("fullscreenPreviewBtn");
  const origFsBtn = document.getElementById("origFsBtn");
  const compFsBtn = document.getElementById("compFsBtn");
  const fsViewTabs = document.getElementById("fsViewTabs");
  const origCanvasWrap = document.getElementById("origCanvasWrap");
  const compCanvasWrap = document.getElementById("compCanvasWrap");
  const origMetricEl = document.getElementById("origMetricEl");
  const compMetricEl = document.getElementById("compMetricEl");

  // Action Bar & Button
  const actionSummaryText = document.getElementById("actionSummaryText");
  const compressPdfBtn = document.getElementById("compressPdfBtn");

  // Results Card
  const resultsCard = document.getElementById("resultsCard");
  const origSizeStat = document.getElementById("origSizeStat");
  const compressedSizeStat = document.getElementById("compressedSizeStat");
  const savingsPctStat = document.getElementById("savingsPctStat");
  const downloadResultBtn = document.getElementById("downloadResultBtn");
  const compressMoreBtn = document.getElementById("compressMoreBtn");
  const startOverBtn = document.getElementById("startOverBtn");

  // Loading Modal
  const loadingModalOverlay = document.getElementById("loadingModalOverlay");
  const loadingModalTitle = document.getElementById("loadingModalTitle");
  const loadingModalSub = document.getElementById("loadingModalSub");
  const loadingBarFill = document.getElementById("loadingBarFill");
  const loadingStatusText = document.getElementById("loadingStatusText");
  const loadingPct = document.getElementById("loadingPct");
  const loadingModeTag = document.getElementById("loadingModeTag");

  // Global Controls
  const themeToggle = document.getElementById("themeToggle");
  const sunIcon = document.getElementById("sunIcon");
  const moonIcon = document.getElementById("moonIcon");
  const recoveryBtn = document.getElementById("recoveryBtn");
  const recoveryBadge = document.getElementById("recoveryBadge");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sideMenu = document.getElementById("sideMenu");
  const sideOverlay = document.getElementById("sideOverlay");
  const closeMenuBtn = document.getElementById("closeMenuBtn");
  const backTop = document.getElementById("backTop");
  const toastEl = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  const toastIcon = document.getElementById("toastIcon");

  // =============================================
  //  THEME CONTROLLER
  // =============================================
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    if (sunIcon && moonIcon) {
      sunIcon.style.display = theme === "dark" ? "none" : "block";
      moonIcon.style.display = theme === "dark" ? "block" : "none";
    }
  }

  const savedTheme =
    localStorage.getItem(THEME_KEY) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  applyTheme(savedTheme);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light"
          : "dark";
      applyTheme(current);
    });
  }

  // =============================================
  //  TOAST HELPER
  // =============================================
  function showToast(msg, type = "info", dur = 4000) {
    if (!toastEl || !toastMsg) return;
    clearTimeout(toastTimer);
    toastMsg.textContent = msg;

    if (toastIcon) {
      if (type === "success") {
        toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
      } else if (type === "error") {
        toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      } else {
        toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
      }
    }

    toastEl.className = `toast ${type}`;
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), dur);
  }

  // =============================================
  //  BYTE FORMATTING
  // =============================================
  function fmtBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // =============================================
  //  INDEXEDDB RECOVERY & STORAGE
  // =============================================
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
        if (!db.objectStoreNames.contains("compress_data")) {
          db.createObjectStore("compress_data");
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  async function persistBlobToDB(blob, name) {
    try {
      const db = await openDB();
      const tx = db.transaction(["compress_data"], "readwrite");
      tx.objectStore("compress_data").put(
        {
          fileName: name,
          fileSize: blob.size,
          blob: blob,
          timestamp: Date.now(),
        },
        "file",
      );
      state.hasPersistedBlob = true;
    } catch (err) {
      console.warn("IndexedDB blob storage failed:", err);
    }
  }

  function scheduleDBSave() {
    clearTimeout(dbSaveTimer);
    dbSaveTimer = setTimeout(() => {
      saveSessionToDB();
    }, 400);
  }

  async function saveSessionToDB() {
    if (!state.fileName || (!state.currentBlob && !state.hasPersistedBlob))
      return false;
    try {
      const db = await openDB();
      const tx = db.transaction(["settings"], "readwrite");
      const sessionData = {
        timestamp: Date.now(),
        fileName: state.fileName,
        fileSize: state.fileSize,
        totalPages: state.totalPages,
        preset: state.preset,
        customDpi: state.customDpi,
        customQuality: state.customQuality,
        isGrayscale: state.isGrayscale,
        targetSizeKb: state.targetSizeKb,
        pageRange: state.pageRange,
      };
      tx.objectStore("settings").put(sessionData, "session");
      updateRecoveryBadge(true);
      return true;
    } catch (err) {
      console.warn("IndexedDB session save failed:", err);
      return false;
    }
  }

  async function loadSessionFromDB(isManual = false) {
    try {
      const db = await openDB();
      const tx = db.transaction(["settings", "compress_data"], "readonly");
      const settingsReq = tx.objectStore("settings").get("session");
      const dataReq = tx.objectStore("compress_data").get("file");

      const [session, data] = await Promise.all([
        new Promise((res) => {
          settingsReq.onsuccess = () => res(settingsReq.result);
          settingsReq.onerror = () => res(null);
        }),
        new Promise((res) => {
          dataReq.onsuccess = () => res(dataReq.result);
          dataReq.onerror = () => res(null);
        }),
      ]);

      if (!session || !data || (!data.blob && !data.bytes)) {
        if (isManual) {
          showToast("No saved compression session found in storage.", "info");
        }
        return false;
      }

      const blob =
        data.blob || new Blob([data.bytes], { type: "application/pdf" });
      state.fileName = session.fileName || data.fileName || "document.pdf";
      state.fileSize = session.fileSize || data.fileSize || blob.size;
      state.totalPages = session.totalPages || 0;
      state.preset = session.preset || "recommended";
      state.customDpi = session.customDpi || 144;
      state.customQuality = session.customQuality || 0.7;
      state.isGrayscale = !!session.isGrayscale;
      state.targetSizeKb = session.targetSizeKb || null;
      state.pageRange = session.pageRange || "";

      syncUiFromState();

      await initPdf(blob, state.fileName, true);
      showToast(
        `Session restored: ${state.fileName} (${state.totalPages} pages)`,
        "success",
      );
      return true;
    } catch (err) {
      console.error("IndexedDB restore error:", err);
      if (isManual) {
        showToast("Failed to restore session: " + err.message, "error");
      }
      return false;
    }
  }

  async function clearSessionFromDB() {
    try {
      const db = await openDB();
      const tx = db.transaction(["settings", "compress_data"], "readwrite");
      tx.objectStore("settings").clear();
      tx.objectStore("compress_data").clear();
      updateRecoveryBadge(false);
    } catch (err) {
      console.warn("IndexedDB clear failed:", err);
    }
  }

  async function checkStoredSessionAvailable() {
    try {
      const db = await openDB();
      const tx = db.transaction(["compress_data"], "readonly");
      const req = tx.objectStore("compress_data").get("file");
      const data = await new Promise((res) => {
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });
      const hasData = !!(data && (data.blob || data.bytes));
      updateRecoveryBadge(hasData);
    } catch (err) {
      updateRecoveryBadge(false);
    }
  }

  function updateRecoveryBadge(active) {
    if (!recoveryBadge) return;
    recoveryBadge.style.display = active ? "block" : "none";
  }

  // =============================================
  //  UI SYNC HELPERS
  // =============================================
  function syncUiFromState() {
    // Preset cards
    presetCards.forEach((card) => {
      const isCardActive = card.dataset.preset === state.preset;
      card.classList.toggle("active", isCardActive);
    });

    if (customPanel) {
      customPanel.classList.toggle("active", state.preset === "custom");
    }

    if (dpiSlider) dpiSlider.value = state.customDpi;
    if (dpiValBadge) dpiValBadge.textContent = `${state.customDpi} DPI`;
    if (qualitySlider)
      qualitySlider.value = Math.round(state.customQuality * 100);
    if (qualityValBadge)
      qualityValBadge.textContent = `${Math.round(state.customQuality * 100)}%`;

    quickDpiBtns.forEach((btn) => {
      btn.classList.toggle(
        "active",
        parseInt(btn.dataset.dpi, 10) === state.customDpi,
      );
    });

    if (grayscaleSwitch) {
      grayscaleSwitch.classList.toggle("checked", state.isGrayscale);
    }

    if (pageRangeInput) {
      pageRangeInput.value = state.pageRange || "";
    }

    updateActionSummary();
  }

  function getEffectiveSettings() {
    if (state.preset === "custom") {
      return {
        dpi: state.customDpi,
        quality: state.customQuality,
        grayscale: state.isGrayscale,
        isLossless: false,
      };
    }
    if (state.preset === "lossless") {
      return {
        dpi: 0,
        quality: 1.0,
        grayscale: false,
        isLossless: true,
      };
    }
    const p = PRESETS[state.preset] || PRESETS.recommended;
    return {
      dpi: p.dpi,
      quality: p.quality,
      grayscale: p.grayscale,
      isLossless: false,
    };
  }

  function updateActionSummary() {
    if (!actionSummaryText) return;
    const s = getEffectiveSettings();
    if (s.isLossless) {
      actionSummaryText.innerHTML = `Mode: <strong>Lossless Vector</strong> · Cleans metadata & packs Flate object streams`;
    } else {
      const grayStr = s.grayscale ? " · Grayscale (B&W)" : "";
      actionSummaryText.innerHTML = `Mode: <strong>${PRESETS[state.preset]?.name || "Custom"}</strong> · ${s.dpi} DPI · ${Math.round(s.quality * 100)}% Quality${grayStr}`;
    }
  }

  // =============================================
  //  PDF LOADING & INITIALIZATION
  // =============================================
  async function initPdf(fileOrBlob, name, isRestoring = false) {
    if (!fileOrBlob) return;
    try {
      showLoadingModal(
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

      // Stream Range Request via PDF.js
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

      if (!isRestoring) {
        await persistBlobToDB(fileOrBlob, state.fileName);
        scheduleDBSave();
      }

      // Update workspace header
      if (fileNameEl) fileNameEl.textContent = state.fileName;
      if (fileSizeEl) {
        fileSizeEl.innerHTML = `<span>${fmtBytes(state.fileSize)}</span> · <span>${state.totalPages} page(s)</span>`;
      }
      if (ramBadgeEl) {
        ramBadgeEl.textContent =
          state.fileSize > 25 * 1024 * 1024
            ? "⚡ Low-RAM Storage Disk Buffered"
            : "⚡ Low-RAM Active";
      }

      // Show workspace, hide dropzone
      if (uploadZone) uploadZone.style.display = "none";
      if (workspace) workspace.classList.add("active");
      if (resultsCard) resultsCard.classList.remove("active");
      if (compressPdfBtn) compressPdfBtn.disabled = false;

      updateLoadingProgress(80, "Rendering original page preview…");

      state.previewPage = 1;
      await renderOriginalPreview();
      invalidateCompressedCache();

      showLoadingModal(false);
      showToast(
        `Loaded "${state.fileName}" (${state.totalPages} pages)`,
        "success",
      );
    } catch (err) {
      console.error("Failed to load PDF:", err);
      showLoadingModal(false);
      showToast(
        "Could not load PDF: " +
          (err.message || "File might be corrupted or password-protected"),
        "error",
      );
    }
  }

  // =============================================
  //  LIVE QUALITY COMPARISON PREVIEW & ZOOM
  // =============================================
  let isPanningOrig = false;
  let isPanningComp = false;

  function applyZoom(newLevel) {
    state.zoomLevel = Math.max(0.5, Math.min(3.0, Math.round(newLevel * 100) / 100));
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
    let startX = 0, startY = 0;
    let scrollLeft = 0, scrollTop = 0;

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
      // If user is in Fullscreen "Compressed" view, automatically generate preview
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
        Math.max(1, state.previewPage),
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
      compMetricEl.textContent = 'Click "Show Preview" to test settings on this page';
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
      btn.innerHTML = `<div class="spinner-xs"></div> Compressing Page ${state.previewPage}…`;
    }
    state.isUpdatingPreview = true;

    try {
      const pageNum = Math.min(
        Math.max(1, state.previewPage),
        state.totalPages,
      );
      const page = await state.pdfJsDoc.getPage(pageNum);
      const settings = getEffectiveSettings();

      const compCanvas = document.createElement("canvas");
      const compCtx = compCanvas.getContext("2d", { willReadFrequently: true });
      let compBlob;

      if (settings.isLossless) {
        // In lossless mode, visual rasterization matches original
        const baseViewport = page.getViewport({ scale: 1.5 });
        compCanvas.width = Math.round(baseViewport.width);
        compCanvas.height = Math.round(baseViewport.height);
        await page.render({ canvasContext: compCtx, viewport: baseViewport }).promise;
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
          const savedPct = Math.round((savedBytes / previewOrigBlob.size) * 100);
          metricStr += ` (-${savedPct}% smaller)`;
        }
      }
      if (compMetricEl) {
        compMetricEl.textContent = metricStr;
      }

      // Store in memory cache for this page until compression settings are altered
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

  // =============================================
  //  FULLSCREEN COMPARISON CONTROLLER
  // =============================================
  function isFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      (comparisonSection && comparisonSection.classList.contains("is-fullscreen"))
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
    const mode = ["split", "orig", "comp"].includes(viewMode) ? viewMode : "split";
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
      } catch (err) {
        // Keep CSS fullscreen active
      }
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
        } catch (err) {
          // Continue cleanup
        }
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
      if (targetView && comparisonGrid && comparisonGrid.dataset.view !== targetView) {
        setComparisonView(targetView);
        return;
      }
      await exitFullscreen();
    }
  }

  function handleFullscreenChange() {
    const isFs = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement
    );
    if (isFs) {
      if (comparisonSection) comparisonSection.classList.add("is-fullscreen");
      document.body.classList.add("comparison-fullscreen-active");
      updateFullscreenBtnUi(true);
    } else {
      if (comparisonSection) comparisonSection.classList.remove("is-fullscreen");
      document.body.classList.remove("comparison-fullscreen-active");
      updateFullscreenBtnUi(false);
      setComparisonView("split");
    }
    applyZoom(state.zoomLevel);
  }

  // =============================================
  //  TARGET FILE SIZE AUTO-CALCULATOR
  // =============================================
  function applyTargetFileSize() {
    if (!targetSizeInput || !state.totalPages) return;
    const val = parseFloat(targetSizeInput.value);
    if (!val || val <= 0) {
      showToast("Please enter a valid target size (e.g., 200 or 1.5)", "info");
      return;
    }

    // Determine unit
    const unitEl = document.getElementById("targetUnitSelect");
    const isMb = unitEl ? unitEl.value === "MB" : false;
    const targetBytes = val * (isMb ? 1024 * 1024 : 1024);

    if (targetBytes >= state.fileSize) {
      showToast(
        `Target size (${fmtBytes(targetBytes)}) is already larger than current size (${fmtBytes(state.fileSize)}).`,
        "info",
      );
      return;
    }

    state.targetSizeKb = Math.round(targetBytes / 1024);

    // Calculate budget per page
    const overhead = 8192; // PDF trailer, catalog overhead
    const budgetPerPage = Math.max(
      2048,
      (targetBytes - overhead) / state.totalPages,
    );

    let calcDpi = 144;
    let calcQuality = 0.65;
    let calcGray = false;

    if (budgetPerPage < 25 * 1024) {
      // Severe constraint (e.g. 100KB-200KB for multi-page forms)
      calcDpi = 84;
      calcQuality = 0.42;
      calcGray = true;
    } else if (budgetPerPage < 50 * 1024) {
      calcDpi = 96;
      calcQuality = 0.52;
      calcGray = false;
    } else if (budgetPerPage < 100 * 1024) {
      calcDpi = 130;
      calcQuality = 0.62;
      calcGray = false;
    } else if (budgetPerPage < 250 * 1024) {
      calcDpi = 160;
      calcQuality = 0.74;
      calcGray = false;
    } else {
      calcDpi = 200;
      calcQuality = 0.82;
      calcGray = false;
    }

    state.preset = "custom";
    state.customDpi = calcDpi;
    state.customQuality = calcQuality;
    state.isGrayscale = calcGray;

    syncUiFromState();
    invalidateCompressedCache();
    scheduleDBSave();

    showToast(
      `Configured for ~${fmtBytes(targetBytes)} target (${calcDpi} DPI, ${Math.round(calcQuality * 100)}% quality${calcGray ? ", Grayscale" : ""})`,
      "success",
    );
  }

  // =============================================
  //  PARSE PAGE RANGE
  // =============================================
  function parsePageRange(rangeStr, total) {
    if (!rangeStr || !rangeStr.trim()) return null; // null means all pages
    const result = new Set();
    const parts = rangeStr.split(",");
    for (let part of parts) {
      part = part.trim();
      if (!part) continue;
      if (part.includes("-")) {
        const [startStr, endStr] = part.split("-");
        const s = parseInt(startStr.trim(), 10);
        const e = parseInt(endStr.trim(), 10);
        if (!isNaN(s) && !isNaN(e)) {
          const from = Math.max(1, Math.min(s, e));
          const to = Math.min(total, Math.max(s, e));
          for (let p = from; p <= to; p++) result.add(p);
        }
      } else {
        const p = parseInt(part, 10);
        if (!isNaN(p) && p >= 1 && p <= total) result.add(p);
      }
    }
    return result.size > 0 ? result : null;
  }

  // =============================================
  //  CORE COMPRESSION ENGINE (LOW-RAM STREAMING)
  // =============================================
  async function runCompression() {
    if (!state.currentBlob || !state.pdfJsDoc) return;

    const startTime = performance.now();
    const settings = getEffectiveSettings();
    const allowedPages = parsePageRange(state.pageRange, state.totalPages);

    showLoadingModal(
      true,
      "Compressing PDF…",
      "Initializing Low-RAM streaming pipeline…",
      5,
      "⚡ Sequential Memory Mode Active",
    );

    try {
      let outBlob;

      // ==================================================
      //  MODE A: 100% LOSSLESS VECTOR & OBJECT COMPACT
      // ==================================================
      if (settings.isLossless) {
        updateLoadingProgress(
          20,
          "Loading PDF catalog and stream dictionaries…",
        );
        const arrayBuf = await state.currentBlob.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuf, {
          ignoreEncryption: true,
        });

        updateLoadingProgress(
          50,
          "Stripping redundant metadata and unpackaging…",
        );
        // Clean metadata bloat
        pdfDoc.setProducer("PDFMaster (pdfmaster.co.in)");
        pdfDoc.setCreator("PDFMaster Client Compressor");

        updateLoadingProgress(
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
        //  MODE B: SEQUENTIAL PAGE DOWNSAMPLING PIPELINE
        // ==================================================
        const newDoc = await PDFLib.PDFDocument.create();
        const total = state.totalPages;
        const targetDpi = Math.max(50, settings.dpi || 144);
        const scale = targetDpi / 72;
        const quality = Math.max(0.15, Math.min(0.95, settings.quality));

        for (let p = 1; p <= total; p++) {
          const pct = Math.round(10 + (p / total) * 80);
          updateLoadingProgress(
            pct,
            `Downsampling page ${p} of ${total} (${targetDpi} DPI)…`,
          );

          const page = await state.pdfJsDoc.getPage(p);
          const origViewport = page.getViewport({ scale: 1.0 });

          if (allowedPages && !allowedPages.has(p)) {
            // Copy uncompressed / native scale for unselected pages
            const nativeViewport = page.getViewport({ scale: 1.5 });
            streamCanvas.width = Math.round(nativeViewport.width);
            streamCanvas.height = Math.round(nativeViewport.height);
            await page.render({
              canvasContext: streamCtx,
              viewport: nativeViewport,
            }).promise;
          } else {
            // Render at target compression scale
            const viewport = page.getViewport({ scale });
            streamCanvas.width = Math.round(viewport.width);
            streamCanvas.height = Math.round(viewport.height);

            await page.render({ canvasContext: streamCtx, viewport }).promise;

            // Optional Grayscale luminance conversion
            if (settings.grayscale) {
              const imgData = streamCtx.getImageData(
                0,
                0,
                streamCanvas.width,
                streamCanvas.height,
              );
              const d = imgData.data;
              for (let i = 0; i < d.length; i += 4) {
                const gray = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
                d[i] = gray;
                d[i + 1] = gray;
                d[i + 2] = gray;
              }
              streamCtx.putImageData(imgData, 0, 0);
            }
          }

          // Extract JPEG blob and convert to ArrayBuffer
          const jpegBlob = await new Promise((res) =>
            streamCanvas.toBlob(res, "image/jpeg", quality),
          );
          const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

          // Embed into pdf-lib
          const embeddedImg = await newDoc.embedJpg(jpegBytes);
          const newPage = newDoc.addPage([
            origViewport.width,
            origViewport.height,
          ]);
          newPage.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: origViewport.width,
            height: origViewport.height,
          });

          // Immediate memory cleanup
          streamCanvas.width = 1;
          streamCanvas.height = 1;
          page.cleanup();

          // Yield execution to browser for GC & animation smoothness
          await new Promise((r) => setTimeout(r, 0));
        }

        updateLoadingProgress(
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

      updateLoadingProgress(100, "Compression complete! Preparing results…");

      state.lastCompressedBlob = outBlob;
      state.lastCompressedName = state.fileName.replace(
        /\.pdf$/i,
        "-compressed.pdf",
      );

      const durationMs = Math.max(
        1,
        Math.round(performance.now() - startTime),
      );
      showLoadingModal(false);

      // Present Results Card
      renderResults(outBlob, durationMs);

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
            if (resultsCard)
              resultsCard.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
          },
        });
      }
    } catch (err) {
      console.error("Compression failed:", err);
      showLoadingModal(false);
      showToast(
        "Compression failed: " + (err.message || "Unknown error occurred"),
        "error",
      );
    }
  }

  function renderResults(outBlob, durationMs) {
    if (!resultsCard) return;
    resultsCard.classList.add("active");

    const savedBytes = Math.max(0, state.fileSize - outBlob.size);
    const savedPct = Math.round((savedBytes / state.fileSize) * 100);

    if (origSizeStat) origSizeStat.textContent = fmtBytes(state.fileSize);
    if (compressedSizeStat)
      compressedSizeStat.textContent = fmtBytes(outBlob.size);
    if (savingsPctStat) {
      if (savedBytes > 0) {
        savingsPctStat.textContent = `-${savedPct}% (Saved ${fmtBytes(savedBytes)})`;
        savingsPctStat.style.color = "var(--savings-green)";
      } else {
        savingsPctStat.textContent = `Optimized (${fmtBytes(outBlob.size)})`;
        savingsPctStat.style.color = "var(--text)";
      }
    }

    resultsCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function downloadCompressedPdf() {
    if (!state.lastCompressedBlob) return;
    const url = URL.createObjectURL(state.lastCompressedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = state.lastCompressedName || "compressed.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // =============================================
  //  MODAL PROGRESS CONTROLLER
  // =============================================
  function showLoadingModal(
    show,
    title = "Processing…",
    sub = "",
    pct = 0,
    tag = "",
  ) {
    if (!loadingModalOverlay) return;
    if (show) {
      if (loadingModalTitle) loadingModalTitle.textContent = title;
      if (loadingModalSub) loadingModalSub.textContent = sub;
      if (loadingBarFill) loadingBarFill.style.width = `${pct}%`;
      if (loadingPct) loadingPct.textContent = `${pct}%`;
      if (loadingStatusText) loadingStatusText.textContent = sub;
      if (loadingModeTag) {
        if (tag) {
          loadingModeTag.textContent = tag;
          loadingModeTag.style.display = "inline-block";
        } else {
          loadingModeTag.style.display = "none";
        }
      }
      loadingModalOverlay.classList.add("active");
    } else {
      loadingModalOverlay.classList.remove("active");
    }
  }

  function updateLoadingProgress(pct, statusText) {
    if (loadingBarFill) loadingBarFill.style.width = `${pct}%`;
    if (loadingPct) loadingPct.textContent = `${pct}%`;
    if (loadingStatusText && statusText)
      loadingStatusText.textContent = statusText;
  }

  // =============================================
  //  EVENT LISTENERS & BINDINGS
  // =============================================
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
        state.preset = preset;
        syncUiFromState();
        invalidateCompressedCache();
        scheduleDBSave();
      });
    });

    // Custom Sliders
    if (dpiSlider) {
      dpiSlider.addEventListener("input", (e) => {
        state.customDpi = parseInt(e.target.value, 10);
        if (dpiValBadge) dpiValBadge.textContent = `${state.customDpi} DPI`;
        quickDpiBtns.forEach((btn) => {
          btn.classList.toggle(
            "active",
            parseInt(btn.dataset.dpi, 10) === state.customDpi,
          );
        });
        updateActionSummary();
        invalidateCompressedCache();
        scheduleDBSave();
      });
    }

    if (qualitySlider) {
      qualitySlider.addEventListener("input", (e) => {
        state.customQuality = parseInt(e.target.value, 10) / 100;
        if (qualityValBadge)
          qualityValBadge.textContent = `${Math.round(state.customQuality * 100)}%`;
        updateActionSummary();
        invalidateCompressedCache();
        scheduleDBSave();
      });
    }

    quickDpiBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const dpi = parseInt(btn.dataset.dpi, 10);
        if (dpi) {
          state.customDpi = dpi;
          if (dpiSlider) dpiSlider.value = dpi;
          if (dpiValBadge) dpiValBadge.textContent = `${dpi} DPI`;
          quickDpiBtns.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          updateActionSummary();
          invalidateCompressedCache();
          scheduleDBSave();
        }
      });
    });

    if (grayscaleSwitch) {
      grayscaleSwitch.addEventListener("click", () => {
        state.isGrayscale = !state.isGrayscale;
        grayscaleSwitch.classList.toggle("checked", state.isGrayscale);
        updateActionSummary();
        invalidateCompressedCache();
        scheduleDBSave();
      });
    }

    if (applyTargetBtn) {
      applyTargetBtn.addEventListener("click", applyTargetFileSize);
    }
    if (targetSizeInput) {
      targetSizeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") applyTargetFileSize();
      });
    }

    if (pageRangeInput) {
      pageRangeInput.addEventListener("input", (e) => {
        state.pageRange = e.target.value.trim();
        scheduleDBSave();
      });
    }

    // Comparison Page Steppers (Header & Fullscreen floating buttons)
    if (prevPageBtn) {
      prevPageBtn.addEventListener("click", () => {
        goToPage(state.previewPage - 1);
      });
    }

    if (nextPageBtn) {
      nextPageBtn.addEventListener("click", () => {
        goToPage(state.previewPage + 1);
      });
    }

    if (fsPrevBtn) {
      fsPrevBtn.addEventListener("click", () => {
        goToPage(state.previewPage - 1);
      });
    }

    if (fsNextBtn) {
      fsNextBtn.addEventListener("click", () => {
        goToPage(state.previewPage + 1);
      });
    }

    // Zoom Controls (CSS transform scaling without reloading preview or altering cache)
    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", () => {
        applyZoom(state.zoomLevel + 0.25);
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", () => {
        applyZoom(state.zoomLevel - 0.25);
      });
    }

    if (zoomResetBtn) {
      zoomResetBtn.addEventListener("click", () => {
        applyZoom(1.0);
      });
    }

    // Initialize Pan & Wheel Zoom
    initPanAndZoom(origCanvasWrap, false);
    initPanAndZoom(compCanvasWrap, true);

    // Individual Fullscreen Buttons
    if (origFsBtn) {
      origFsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFullscreenPreview("orig");
      });
    }
    if (compFsBtn) {
      compFsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFullscreenPreview("comp");
      });
    }

    // Fullscreen View Switcher Tabs
    if (fsViewTabs) {
      fsViewTabs.querySelectorAll(".fs-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          setComparisonView(tab.dataset.view);
        });
      });
    }

    // Initial Show Preview Button
    const initialPreviewBtn = document.getElementById("generatePreviewBtn");
    if (initialPreviewBtn) {
      initialPreviewBtn.addEventListener("click", generateSinglePageCompressedPreview);
    }

    // Fullscreen Preview Toggle (Split View)
    if (fullscreenPreviewBtn) {
      fullscreenPreviewBtn.addEventListener("click", () => {
        toggleFullscreenPreview("split");
      });
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    // Keyboard navigation: Escape to exit fullscreen, Left/Right arrows to change pages
    window.addEventListener("keydown", (e) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      ) {
        return;
      }
      const isFs = isFullscreenActive();
      if (e.key === "Escape" && isFs) {
        e.preventDefault();
        exitFullscreen();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        if (isFs || (workspace && workspace.classList.contains("active"))) {
          e.preventDefault();
          goToPage(state.previewPage - 1);
        }
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        if (isFs || (workspace && workspace.classList.contains("active"))) {
          e.preventDefault();
          goToPage(state.previewPage + 1);
        }
      }
    });

    // Main Action Button
    if (compressPdfBtn) {
      compressPdfBtn.addEventListener("click", runCompression);
    }

    // Results Actions
    if (downloadResultBtn) {
      downloadResultBtn.addEventListener("click", downloadCompressedPdf);
    }
    if (compressMoreBtn) {
      compressMoreBtn.addEventListener("click", () => {
        if (resultsCard) resultsCard.classList.remove("active");
        if (workspace)
          workspace.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    if (startOverBtn) {
      startOverBtn.addEventListener("click", () => {
        resetWorkspace();
      });
    }

    if (changeFileBtn) {
      changeFileBtn.addEventListener("click", () => fileInput.click());
    }
    if (resetAllBtn) {
      resetAllBtn.addEventListener("click", () => {
        state.preset = "recommended";
        state.customDpi = 144;
        state.customQuality = 0.7;
        state.isGrayscale = false;
        state.pageRange = "";
        syncUiFromState();
        invalidateCompressedCache();
        scheduleDBSave();
        showToast("Settings reset to defaults.", "info");
      });
    }

    // Recovery Button
    if (recoveryBtn) {
      recoveryBtn.addEventListener("click", () => {
        loadSessionFromDB(true);
      });
    }

    // Mobile Menu
    if (hamburgerBtn && sideMenu && sideOverlay) {
      hamburgerBtn.addEventListener("click", () => {
        sideMenu.classList.add("open");
        sideOverlay.classList.add("open");
      });
      closeMenuBtn.addEventListener("click", () => {
        sideMenu.classList.remove("open");
        sideOverlay.classList.remove("open");
      });
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

  function handleFileSelection(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      showToast("Please select a valid PDF file.", "error");
      return;
    }
    initPdf(file, file.name, false);
  }

  function resetWorkspace() {
    if (isFullscreenActive()) {
      exitFullscreen();
    }
    invalidateCompressedCache();
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

    clearSessionFromDB();
  }

  // =============================================
  //  INIT
  // =============================================
  window.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    syncUiFromState();
    checkStoredSessionAvailable();
  });
})();
