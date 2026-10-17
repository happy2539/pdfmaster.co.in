/**
 * PDFMaster - Sign PDF Tool
 * Module: state.js
 * Core state, constants, and global helper utilities
 */
(function () {
  "use strict";

  window.PDFSign = window.PDFSign || {};
  const PDFSign = window.PDFSign;

  // =============================================
  //  CONSTANTS & CONFIG
  // =============================================
  PDFSign.DB_NAME = "pdfmaster_sign_pdf_db";
  PDFSign.DB_VERSION = 1;
  PDFSign.THEME_KEY = "pdfmaster-theme";
  PDFSign.SAVED_SIGS_KEY = "pdfmaster_saved_signatures";
  PDFSign.MAX_HISTORY = 30;

  // =============================================
  //  APPLICATION STATE
  // =============================================
  PDFSign.state = {
    fileName: "document.pdf",
    fileSize: 0,
    totalPages: 0,
    currentBlob: null,
    arrayBuffer: null,
    pdfJsDoc: null,
    currentPage: 1,
    zoom: 1.0,
    fitWidth: true,

    // Placed stamps/signatures on pages
    items: [],
    selectedItemId: null,

    // History for Undo/Redo
    history: [],
    future: [],

    // Saved signature stamps library
    savedSignatures: [],

    // Active Studio Drawer State
    studio: {
      mode: "signature", // 'signature' | 'initials' | 'date' | 'text'
      activeTab: "draw", // 'draw' | 'type' | 'upload' | 'saved'
      penColor: "#111827",
      penStrokeWidth: 2.5,
      typedText: "John Doe",
      selectedFont: "Caveat",
      typeColor: "#111827",
      uploadedImg: null,
      rawUploadedImg: null,
      isCropped: false,
      uploadedTrimmedUrl: null,
      removeBg: true,
      bgThreshold: 65, // sensitivity percent: 10 to 95
      inkColor: "black", // 'black' | 'navy' | 'blue' | 'green' | 'red' | 'original'
      saveForFuture: true,
    },
  };

  // State runtime variables
  PDFSign.dbPromise = null;
  PDFSign.toastTimer = null;
  PDFSign.activePageRenderTask = null;
  PDFSign.thumbnailObserver = null;
  PDFSign.activeThumbnailTasks = new Map();
  PDFSign.lastGeneratedBlob = null;
  PDFSign.lastGeneratedName = "";

  // Unique ID generator
  let idCounter = 0;
  PDFSign.getUniqueId = function (prefix) {
    return (prefix || "item") + "_" + Date.now() + "_" + ++idCounter;
  };

  // Toast Notification
  PDFSign.showToast = function (msg, duration = 3000) {
    const toastEl = document.getElementById("toast");
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(PDFSign.toastTimer);
    PDFSign.toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, duration);
  };

  // Format Bytes to human readable string
  PDFSign.fmtBytes = function (bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const dm = 1;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Loading Modal Updates
  PDFSign.updateLoading = function (pct, text, desc) {
    const loadingBarFill = document.getElementById("loadingBarFill");
    const loadingPctText = document.getElementById("loadingPctText");
    const loadingTitle = document.getElementById("loadingTitle");
    const loadingDesc = document.getElementById("loadingDesc");

    if (loadingBarFill) loadingBarFill.style.width = pct + "%";
    if (loadingPctText) loadingPctText.textContent = pct + "%";
    if (text && loadingTitle) loadingTitle.textContent = text;
    if (desc && loadingDesc) loadingDesc.textContent = desc;
  };

  PDFSign.showLoading = function (show, title, desc) {
    const loadingModal = document.getElementById("loadingModal");
    const loadingTitle = document.getElementById("loadingTitle");
    const loadingDesc = document.getElementById("loadingDesc");
    if (!loadingModal) return;

    if (show) {
      if (title && loadingTitle) loadingTitle.textContent = title;
      if (desc && loadingDesc) loadingDesc.textContent = desc;
      PDFSign.updateLoading(5, title, desc);
      loadingModal.classList.add("active");
    } else {
      loadingModal.classList.remove("active");
    }
  };

  // Auto-crop whitespace / transparent borders on offscreen canvas
  PDFSign.trimCanvasTransparent = function (canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;
    let found = false;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const alpha = data[i + 3];
        if (alpha > 10) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!found) {
      return { canvas, width: w, height: h };
    }

    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w, maxX + pad);
    maxY = Math.min(h, maxY + pad);

    const tw = maxX - minX;
    const th = maxY - minY;
    if (tw <= 0 || th <= 0) {
      return { canvas, width: w, height: h };
    }

    const trimmedCanvas = document.createElement("canvas");
    trimmedCanvas.width = tw;
    trimmedCanvas.height = th;
    const tctx = trimmedCanvas.getContext("2d");
    tctx.drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);

    return {
      canvas: trimmedCanvas,
      width: tw,
      height: th,
    };
  };
})();
