/**
 * PDFMaster - Compare PDF: State, Constants & Core Utilities
 * Central reactive state store, LRU page/bitmap cache, DOM elements cache, and toast helpers.
 */
(function () {
  "use strict";

  window.PDFCompare = window.PDFCompare || {};

  // Configure PDF.js Worker
  if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
  }

  // Database & Theme Constants
  const DB_NAME = "pdfmaster_compare_db";
  const DB_VERSION = 1;
  const THEME_KEY = "pdfmaster-theme";

  // Application State
  const state = {
    fileA: null, // { file, buffer, name, size, pdfDoc, pageCount, pageWords: [] }
    fileB: null, // { file, buffer, name, size, pdfDoc, pageCount, pageWords: [] }
    currentPage: 1,
    totalPages: 1,
    currentMode: "sideBySide", // 'sideBySide' | 'visualDiff'
    visualDiffSubmode: "highlight", // 'highlight' | 'deltaMask' | 'flicker'
    zoomMode: "fitWidth", // 'fitWidth' | 'fitPage' | 'custom'
    customZoom: 1.0,
    syncScroll: true,
    diffSensitivity: 35,
    differences: [], // [{ pageNum, hasDiff, diffPercent, addedWords, deletedWords, diffBoxesA, diffBoxesB, diffBoxesVisual, baseWidth, baseHeight, status }]
    isComparing: false,
    flickerTimer: null,
    flickerStateA: true,
    renderToken: 0
  };

  // =========================================================================
  //  LRU PAGE & BITMAP CACHE (Industry Standard Zero-Latency Paging)
  // =========================================================================
  const PageCache = {
    cache: new Map(),
    maxEntries: 20,

    get(key) {
      if (this.cache.has(key)) {
        const item = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, item);
        return item;
      }
      return null;
    },

    set(key, value) {
      if (this.cache.size >= this.maxEntries) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }
      this.cache.set(key, value);
    },

    has(key) {
      return this.cache.has(key);
    },

    invalidateDiff(pageNum) {
      for (const k of Array.from(this.cache.keys())) {
        if (k.startsWith(`diff_${pageNum}_`)) {
          this.cache.delete(k);
        }
      }
    },

    clear() {
      this.cache.clear();
    }
  };

  // DOM Elements Cache
  const DOM = {};

  function initDOM() {
    DOM.slotA = document.getElementById("slotA");
    DOM.slotB = document.getElementById("slotB");
    DOM.fileInputA = document.getElementById("fileInputA");
    DOM.fileInputB = document.getElementById("fileInputB");
    DOM.btnBrowseA = document.getElementById("btnBrowseA");
    DOM.btnBrowseB = document.getElementById("btnBrowseB");
    DOM.btnSwap = document.getElementById("btnSwap");
    DOM.btnSample = document.getElementById("btnSample");
    DOM.btnCompare = document.getElementById("btnCompare");
    DOM.btnReset = document.getElementById("btnReset");

    // Studio Elements
    DOM.studio = document.getElementById("compareStudio");
    DOM.modeTabs = document.querySelectorAll(".mode-tab");
    DOM.viewportPanels = document.querySelectorAll(".viewport-content");
    DOM.btnPrevPage = document.getElementById("btnPrevPage");
    DOM.btnNextPage = document.getElementById("btnNextPage");
    DOM.pageIndicator = document.getElementById("pageIndicator");

    // Difference Quick Navigation
    DOM.btnPrevDiff = document.getElementById("btnPrevDiff");
    DOM.btnNextDiff = document.getElementById("btnNextDiff");

    // Zoom Controls
    DOM.btnZoomIn = document.getElementById("btnZoomIn");
    DOM.btnZoomOut = document.getElementById("btnZoomOut");
    DOM.btnFitWidth = document.getElementById("btnFitWidth");
    DOM.btnFitPage = document.getElementById("btnFitPage");
    DOM.btnActualSize = document.getElementById("btnActualSize");
    DOM.zoomIndicator = document.getElementById("zoomIndicator");

    DOM.syncScrollCheck = document.getElementById("syncScrollCheck");
    DOM.sensitivitySlider = document.getElementById("sensitivitySlider");
    DOM.sensitivityVal = document.getElementById("sensitivityVal");

    // Canvases
    DOM.paneScrollA = document.getElementById("paneScrollA");
    DOM.paneScrollB = document.getElementById("paneScrollB");
    DOM.wrapA = document.getElementById("wrapA");
    DOM.wrapB = document.getElementById("wrapB");
    DOM.canvasA = document.getElementById("canvasA");
    DOM.canvasB = document.getElementById("canvasB");
    DOM.highlightLayerA = document.getElementById("highlightLayerA");
    DOM.highlightLayerB = document.getElementById("highlightLayerB");
    DOM.titlePaneB = document.getElementById("titlePaneB");
    DOM.pillPaneB = document.getElementById("pillPaneB");

    // Visual Diff Controls (Sudden Submode Switching on Above Canvas)
    DOM.btnDiffHighlight = document.getElementById("btnDiffHighlight");
    DOM.btnDiffMask = document.getElementById("btnDiffMask");
    DOM.btnDiffFlicker = document.getElementById("btnDiffFlicker");

    // Drawer
    DOM.drawerList = document.getElementById("drawerList");
    DOM.drawerCount = document.getElementById("drawerCount");

    // Exports
    DOM.btnExportPdf = document.getElementById("btnExportPdf");
    DOM.btnExportPng = document.getElementById("btnExportPng");
    DOM.btnPrint = document.getElementById("btnPrint");
    DOM.exportMeta = document.getElementById("exportMeta");

    // Loading Modal
    DOM.loadingModal = document.getElementById("loadingModalOverlay");
    DOM.loadingTitle = document.getElementById("loadingModalTitle");
    DOM.loadingSub = document.getElementById("loadingModalSub");
    DOM.progressFill = document.getElementById("progressFill");
    DOM.loadingPct = document.getElementById("loadingPct");

    // Navbar & System
    DOM.themeToggle = document.getElementById("themeToggle") || document.getElementById("themeBtn");
    DOM.sunIcon = document.getElementById("sunIcon");
    DOM.moonIcon = document.getElementById("moonIcon");
    DOM.hamburgerBtn = document.getElementById("hamburgerBtn");
    DOM.sideMenu = document.getElementById("sideMenu");
    DOM.sideOverlay = document.getElementById("sideOverlay");
    DOM.closeMenuBtn = document.getElementById("closeMenuBtn");
    DOM.recoveryBtn = document.getElementById("recoveryBtn");
    DOM.recoveryBadge = document.getElementById("recoveryBadge");
    DOM.b2t = document.getElementById("b2t");
    DOM.toastContainer = document.getElementById("toastContainer");
  }

  // =========================================================================
  //  TOAST & NOTIFICATIONS
  // =========================================================================
  function showToast(message, type = "info", duration = 3500) {
    if (!DOM.toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type}`;

    let iconSvg = "";
    if (type === "success") {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === "error") {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      toast.style.transition = "all 0.25s ease";
      setTimeout(() => toast.remove(), 260);
    }, duration);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m]);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const dm = 1;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  // =========================================================================
  //  LOADING PROGRESS MODAL
  // =========================================================================
  function showLoading(show, title = "Processing PDFs", sub = "Analyzing documents...") {
    if (!DOM.loadingModal) return;
    if (show) {
      DOM.loadingTitle.textContent = title;
      DOM.loadingSub.textContent = sub;
      DOM.progressFill.style.width = "0%";
      DOM.loadingPct.textContent = "0%";
      DOM.loadingModal.classList.add("active");
    } else {
      DOM.loadingModal.classList.remove("active");
    }
  }

  function updateLoadingProgress(pct, subText) {
    if (DOM.progressFill) DOM.progressFill.style.width = `${pct}%`;
    if (DOM.loadingPct) DOM.loadingPct.textContent = `${Math.round(pct)}%`;
    if (subText && DOM.loadingSub) DOM.loadingSub.textContent = subText;
  }

  function updateThemeIcons(theme) {
    if (DOM.sunIcon && DOM.moonIcon) {
      DOM.sunIcon.style.display = theme === "dark" ? "none" : "block";
      DOM.moonIcon.style.display = theme === "dark" ? "block" : "none";
    }
  }

  // Expose on PDFCompare Namespace
  window.PDFCompare.constants = {
    DB_NAME,
    DB_VERSION,
    THEME_KEY
  };
  window.PDFCompare.state = state;
  window.PDFCompare.PageCache = PageCache;
  window.PDFCompare.DOM = DOM;
  window.PDFCompare.initDOM = initDOM;
  window.PDFCompare.utils = {
    showToast,
    escapeHtml,
    formatBytes,
    showLoading,
    updateLoadingProgress,
    updateThemeIcons
  };

  // Top-level shortcuts for convenience and debugging
  window.PDFCompare.showToast = showToast;
  window.PDFCompare.showLoading = showLoading;
  window.PDFCompare.updateLoadingProgress = updateLoadingProgress;
})();
