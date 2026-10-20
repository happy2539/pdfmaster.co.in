/**
 * PDFMaster - OCR PDF (Optical Character Recognition)
 * Module: state.js
 * Core state management, DOM element cache, and utility helpers
 */

(function () {
  "use strict";

  window.PDFMasterOCR = window.PDFMasterOCR || {};
  const OCR = window.PDFMasterOCR;

  // Configure PDF.js worker
  const pdfjsLib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
  if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
  }

  // Application State
  const state = {
    file: null,
    fileName: "",
    fileSize: 0,
    pdfBytes: null,
    pdfDoc: null,
    totalPages: 0,
    selectedPages: [], // 1-indexed page numbers
    pageResults: [], // [{ pageNum, text, confidence, words: [], canvasWidth, canvasHeight, thumbUrl }]
    isProcessing: false,
    cancelRequested: false,
    tesseractPool: [], // Warm WebAssembly SIMD worker pool
    activeWorkerLang: null,
    activeWorkerModel: null, // 'fast' (quantized LSTM) or 'standard' (full precision)
    isPrewarming: false,
    get tesseractWorker() {
      return (this.tesseractPool && this.tesseractPool[0]) || null;
    },
    activeStudioPage: 1, // 1-indexed or 'all'
    startTime: 0,
    options: {
      lang: "eng",
      mode: "fast", // 'fast' (1.5x) or 'accurate' (2.0x)
      enhance: true,
      generatePdf: true, // option to create searchable PDF
      layerMode: "smart", // 'smart' (anti-duplication) or 'replace' (clean raster rebuild)
      showBbox: false,
    },
    pageTextStatus: {}, // pageNum -> { hasText: boolean, charCount: number }
    documentHasDigitalText: false,
    pageRangeMode: "all",
    pageRangeCustom: "",
    hasPersistedBlob: false,
    generatedBlobs: {
      pdf: null,
      txt: null,
    },
    generatedPdfBlob: null,
  };

  // DOM Elements Store (populated in initDOM)
  const DOM = {};

  function initDOM() {
    DOM.themeToggle = document.getElementById("themeToggle");
    DOM.sunIcon = document.getElementById("sunIcon");
    DOM.moonIcon = document.getElementById("moonIcon");
    DOM.hamburgerBtn = document.getElementById("hamburgerBtn");
    DOM.closeMenuBtn = document.getElementById("closeMenuBtn");
    DOM.sideMenu = document.getElementById("sideMenu");
    DOM.sideOverlay = document.getElementById("sideOverlay");

    DOM.uploadZone = document.getElementById("uploadZone");
    DOM.fileInput = document.getElementById("fileInput");
    DOM.browseBtn = document.getElementById("browseBtn");
    DOM.workspace = document.getElementById("workspace");

    DOM.fileName = document.getElementById("fileName");
    DOM.fileSize = document.getElementById("fileSize");
    DOM.pageCountBadge = document.getElementById("pageCountBadge");
    DOM.changeFileBtn = document.getElementById("changeFileBtn");

    DOM.ocrLangSelect = document.getElementById("ocrLangSelect");
    DOM.modeFast = document.getElementById("modeFast");
    DOM.modeAccurate = document.getElementById("modeAccurate");
    DOM.radioCardFast = document.getElementById("radioCardFast");
    DOM.radioCardAccurate = document.getElementById("radioCardAccurate");
    DOM.enhanceScanCheck = document.getElementById("enhanceScanCheck");
    DOM.generatePdfCheck = document.getElementById("generatePdfCheck");

    DOM.layerHandlingGroup = document.getElementById("layerHandlingGroup");
    DOM.layerModeSmart = document.getElementById("layerModeSmart");
    DOM.layerModeReplace = document.getElementById("layerModeReplace");
    DOM.radioCardSmartLayer = document.getElementById("radioCardSmartLayer");
    DOM.radioCardReplaceLayer = document.getElementById(
      "radioCardReplaceLayer",
    );

    DOM.rangeAllBtn = document.getElementById("rangeAllBtn");
    DOM.rangeFirstBtn = document.getElementById("rangeFirstBtn");
    DOM.rangeCustomBtn = document.getElementById("rangeCustomBtn");
    DOM.customRangeWrap = document.getElementById("customRangeWrap");
    DOM.customRangeInput = document.getElementById("customRangeInput");
    DOM.customRangeHint = document.getElementById("customRangeHint");

    DOM.actionBar = document.getElementById("actionBar");
    DOM.actionBarStatus = document.getElementById("actionBarStatus");
    DOM.startOcrBtn = document.getElementById("startOcrBtn");
    DOM.startOcrBtnText = document.getElementById("startOcrBtnText");

    DOM.progressHud = document.getElementById("progressHud");
    DOM.progressFill = document.getElementById("progressFill");
    DOM.progressPct = document.getElementById("progressPct");
    DOM.progressPageBadge = document.getElementById("progressPageBadge");
    DOM.progressStatusTxt = document.getElementById("progressStatusTxt");
    DOM.progressTimerTxt = document.getElementById("progressTimerTxt");
    DOM.cancelOcrBtn = document.getElementById("cancelOcrBtn");

    DOM.ocrStudio = document.getElementById("ocrStudio");
    DOM.metricPages = document.getElementById("metricPages");
    DOM.metricWords = document.getElementById("metricWords");
    DOM.metricConfidence = document.getElementById("metricConfidence");
    DOM.metricDuration = document.getElementById("metricDuration");

    DOM.previewCanvas = document.getElementById("previewCanvas");
    DOM.bboxLayer = document.getElementById("bboxLayer");
    DOM.prevPageBtn = document.getElementById("prevPageBtn");
    DOM.nextPageBtn = document.getElementById("nextPageBtn");
    DOM.currentPageIndicator = document.getElementById("currentPageIndicator");
    DOM.toggleBboxCheck = document.getElementById("toggleBboxCheck");

    DOM.editorTabsBar = document.getElementById("editorTabsBar");
    DOM.editorPrevPageBtn = document.getElementById("editorPrevPageBtn");
    DOM.editorNextPageBtn = document.getElementById("editorNextPageBtn");
    DOM.editorCurrentPageIndicator = document.getElementById("editorCurrentPageIndicator");
    DOM.editorAllPagesBtn = document.getElementById("editorAllPagesBtn");
    DOM.ocrTextArea = document.getElementById("ocrTextArea");
    DOM.wordCountBadge = document.getElementById("wordCountBadge");
    DOM.charCountBadge = document.getElementById("charCountBadge");
    DOM.fontDecBtn = document.getElementById("fontDecBtn");
    DOM.fontIncBtn = document.getElementById("fontIncBtn");

    DOM.downloadPdfBtn = document.getElementById("downloadPdfBtn");
    DOM.downloadTxtBtn = document.getElementById("downloadTxtBtn");
    DOM.copyAllBtn = document.getElementById("copyAllBtn");
    DOM.ocrAnotherBtn = document.getElementById("ocrAnotherBtn");

    DOM.recoveryBtn = document.getElementById("recoveryBtn");
    DOM.recoveryBadge = document.getElementById("recoveryBadge");
    DOM.toast = document.getElementById("toast");
    DOM.toastIcon = document.getElementById("toastIcon");
    DOM.toastMsg = document.getElementById("toastMsg");
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "0 KB";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function escapeHtml(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function truncateFilename(str, n = 22) {
    if (!str || str.length <= n) return str;
    const extIdx = str.lastIndexOf(".");
    const ext = extIdx > -1 ? str.slice(extIdx) : "";
    const base = extIdx > -1 ? str.slice(0, extIdx) : str;
    const keepLen = n - ext.length - 3;
    if (keepLen <= 2) return str.slice(0, n - 3) + "…";
    return base.slice(0, keepLen) + "…" + ext;
  }

  function revokeBlobUrls() {
    Object.values(state.generatedBlobs).forEach((blobUrl) => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    });
    state.generatedBlobs = { pdf: null, txt: null };
    state.generatedPdfBlob = null;

    state.pageResults.forEach((page) => {
      if (page.thumbUrl) URL.revokeObjectURL(page.thumbUrl);
    });
  }

  // Export to namespace
  OCR.state = state;
  OCR.DOM = DOM;
  OCR.initDOM = initDOM;
  OCR.formatFileSize = formatFileSize;
  OCR.escapeHtml = escapeHtml;
  OCR.truncateFilename = truncateFilename;
  OCR.revokeBlobUrls = revokeBlobUrls;
})();
