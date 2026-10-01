/**
 * PDFMaster - Application State, Presets & Core Utilities
 * Central state store, compression presets, theme controller, and UI toast helpers.
 */
(function () {
  "use strict";

  // PDF.js Worker Configuration
  const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
  if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
  }

  // Database & Cache Constants
  const DB_NAME = "pdfmaster_compress_db";
  const DB_VERSION = 2;
  const THEME_KEY = "pdfmaster-theme";

  // Presets Configuration
  const PRESETS = {
    recommended: {
      name: "Recommended",
      dpi: 144,
      quality: 0.72,
      grayscale: false,
      isLossless: false,
      desc: "Good quality, good compression. Ideal for everyday sharing, email, and web.",
      badge: "Best Value",
    },
    extreme: {
      name: "Extreme",
      dpi: 96,
      quality: 0.45,
      grayscale: false,
      isLossless: false,
      desc: "Maximum compression, lower quality. Perfect for strict upload caps or storage limits.",
      badge: "Smallest Size",
    },
    low: {
      name: "Low Compression",
      dpi: 200,
      quality: 0.85,
      grayscale: false,
      isLossless: false,
      desc: "High quality, minimal compression. Best for presentation decks and archival.",
      badge: "High Quality",
    },
    custom: {
      name: "Custom",
      dpi: 144,
      quality: 0.75,
      grayscale: false,
      isLossless: false,
      desc: "Manually adjust resolution, JPEG quality, or grayscale to target exact size.",
      badge: "Manual",
    },
    lossless: {
      name: "Lossless (Structure Only)",
      dpi: 0,
      quality: 1.0,
      grayscale: false,
      isLossless: true,
      desc: "100% preservation of images and vectors. Cleans metadata, optimizes object streams.",
      badge: "No Quality Loss",
    },
  };

  // Central Application State
  const state = {
    file: null,
    fileName: "document.pdf",
    fileSize: 0,
    totalPages: 0,
    currentBlob: null,
    currentBlobUrl: null,
    pdfJsDoc: null,
    activePreset: "recommended",
    dpi: 144,
    quality: 0.72,
    grayscale: false,
    isLossless: false,
    targetSizeBytes: null,
    pageRange: "all",
    zoomLevel: 1.0,
    previewPageNum: 1,
    isUpdatingPreview: false,
    lastCompressedBlob: null,
    lastCompressedName: "",
    hardwareConfig: null,
  };

  // Byte Formatting Helper
  function fmtBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  // Toast Notification Helper
  function showToast(msg, type = "info", dur = 4000) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove("show");
    }, dur);
  }

  // Theme Controller
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const themeToggle = document.getElementById("themeToggle");
    if (themeToggle) {
      themeToggle.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
      );
    }
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved);
    } else {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      applyTheme(prefersDark ? "dark" : "light");
    }
  }

  // Expose namespace
  window.PDFCompressState = state;
  window.PDFCompressConstants = {
    DB_NAME,
    DB_VERSION,
    THEME_KEY,
    PRESETS,
  };
  window.PDFCompressUtils = {
    fmtBytes,
    showToast,
    applyTheme,
    initTheme,
  };
})();
