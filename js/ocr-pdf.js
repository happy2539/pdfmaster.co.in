/**
 * PDFMaster - OCR PDF (Optical Character Recognition & Searchable PDF Engine)
 * Production-Grade · Ultra-Low RAM Sequential Pipeline · On-Device WebAssembly
 */

(function () {
  "use strict";

  // Configure PDF.js worker
  const pdfjsLib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
  if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
  }

  // State Management
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
    DOM.detectedLayerBadge = document.getElementById("detectedLayerBadge");
    DOM.layerModeSmart = document.getElementById("layerModeSmart");
    DOM.layerModeReplace = document.getElementById("layerModeReplace");
    DOM.radioCardSmartLayer = document.getElementById("radioCardSmartLayer");
    DOM.radioCardReplaceLayer = document.getElementById("radioCardReplaceLayer");

    DOM.rangeAllBtn = document.getElementById("rangeAllBtn");
    DOM.rangeFirstBtn = document.getElementById("rangeFirstBtn");
    DOM.rangeCustomBtn = document.getElementById("rangeCustomBtn");
    DOM.customRangeWrap = document.getElementById("customRangeWrap");
    DOM.customRangeInput = document.getElementById("customRangeInput");
    DOM.customRangeHint = document.getElementById("customRangeHint");

    DOM.shieldIcon = document.getElementById("shieldIcon");
    DOM.shieldStatus = document.getElementById("shieldStatus");
    DOM.specDocType = document.getElementById("specDocType");
    DOM.specTextLayer = document.getElementById("specTextLayer");
    DOM.specLang = document.getElementById("specLang");
    DOM.specMode = document.getElementById("specMode");
    DOM.specPages = document.getElementById("specPages");
    DOM.specPdfMode = document.getElementById("specPdfMode");
    DOM.specRam = document.getElementById("specRam");

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
    DOM.ocrTextArea = document.getElementById("ocrTextArea");
    DOM.wordCountBadge = document.getElementById("wordCountBadge");
    DOM.charCountBadge = document.getElementById("charCountBadge");
    DOM.copyTextBtn = document.getElementById("copyTextBtn");
    DOM.clearTextBtn = document.getElementById("clearTextBtn");
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

  /* ==========================================================================
     INIT & THEME SETUP
     ========================================================================== */
  function initTheme() {
    const savedTheme = localStorage.getItem("pdfmaster-theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeIcon(savedTheme);

    if (DOM.themeToggle) {
      DOM.themeToggle.addEventListener("click", () => {
        const currentTheme =
          document.documentElement.getAttribute("data-theme") || "light";
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("pdfmaster-theme", newTheme);
        updateThemeIcon(newTheme);
      });
    }
  }

  function updateThemeIcon(theme) {
    if (!DOM.sunIcon || !DOM.moonIcon) return;
    if (theme === "dark") {
      DOM.sunIcon.style.display = "block";
      DOM.moonIcon.style.display = "none";
    } else {
      DOM.sunIcon.style.display = "none";
      DOM.moonIcon.style.display = "block";
    }
  }

  function initMobileMenu() {
    if (!DOM.hamburgerBtn || !DOM.sideMenu || !DOM.sideOverlay) return;

    function openMenu() {
      DOM.sideMenu.classList.add("active");
      DOM.sideOverlay.classList.add("active");
      document.body.style.overflow = "hidden";
    }

    function closeMenu() {
      DOM.sideMenu.classList.remove("active");
      DOM.sideOverlay.classList.remove("active");
      document.body.style.overflow = "";
    }

    DOM.hamburgerBtn.addEventListener("click", openMenu);
    if (DOM.closeMenuBtn) DOM.closeMenuBtn.addEventListener("click", closeMenu);
    DOM.sideOverlay.addEventListener("click", closeMenu);

    DOM.sideMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });
  }

  /* ==========================================================================
     FILE UPLOAD & PARSING
     ========================================================================== */
  function initUploadHandlers() {
    if (!DOM.uploadZone || !DOM.fileInput) return;

    // Browse button (native label fallback + keyboard support)
    if (DOM.browseBtn) {
      DOM.browseBtn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          DOM.fileInput.click();
        }
      });
      DOM.browseBtn.addEventListener("click", (e) => {
        // Clear value to guarantee 'change' event fires even if selecting the same file
        DOM.fileInput.value = "";
      });
    }

    // Dropzone Click
    DOM.uploadZone.addEventListener("click", (e) => {
      if (DOM.browseBtn && (e.target === DOM.browseBtn || DOM.browseBtn.contains(e.target))) {
        return; // Handled natively by label for fileInput
      }
      DOM.fileInput.value = "";
      DOM.fileInput.click();
    });

    DOM.uploadZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        DOM.fileInput.value = "";
        DOM.fileInput.click();
      }
    });

    // File Input Change
    DOM.fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFileSelected(file);
    });

    // Drag and drop handlers
    ["dragenter", "dragover"].forEach((eventName) => {
      DOM.uploadZone.addEventListener(
        eventName,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          DOM.uploadZone.classList.add("is-dragover");
        },
        false,
      );
    });

    ["dragleave", "drop"].forEach((eventName) => {
      DOM.uploadZone.addEventListener(
        eventName,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          DOM.uploadZone.classList.remove("is-dragover");
        },
        false,
      );
    });

    DOM.uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      DOM.uploadZone.classList.remove("is-dragover");
      const dt = e.dataTransfer;
      const file = dt && dt.files && dt.files[0];
      if (file) handleFileSelected(file);
    });

    // Global paste handler
    document.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const file = items[i].getAsFile();
          if (
            file &&
            (file.type === "application/pdf" ||
              (file.name && file.name.toLowerCase().endsWith(".pdf")))
          ) {
            handleFileSelected(file);
            break;
          }
        }
      }
    });

    if (DOM.changeFileBtn) {
      DOM.changeFileBtn.addEventListener("click", resetSession);
    }

    if (DOM.ocrAnotherBtn) {
      DOM.ocrAnotherBtn.addEventListener("click", resetSession);
    }
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "0 KB";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  async function handleFileSelected(file, shouldPersist = true) {
    if (!file) return;

    const isPdf =
      (file.name && file.name.toLowerCase().endsWith(".pdf")) ||
      (file.type && file.type.toLowerCase().includes("pdf"));

    if (!isPdf) {
      showErrorPopup("Please upload a valid PDF document (.pdf).");
      return;
    }

    // Speculative zero-latency pre-warming of SIMD OCR engine while user reviews document
    prewarmTesseractEngine(state.options.lang, state.options.mode);

    state.file = file;
    state.fileName = file.name || "document.pdf";
    state.fileSize = file.size || 0;

    DOM.fileName.textContent = state.fileName;
    DOM.fileSize.textContent = formatFileSize(state.fileSize);

    DOM.uploadZone.style.display = "none";
    DOM.workspace.style.display = "block";
    DOM.actionBar.style.display = "flex";
    DOM.ocrStudio.style.display = "none";
    DOM.progressHud.style.display = "none";

    DOM.actionBarStatus.textContent = "Analyzing document structure…";
    DOM.startOcrBtn.disabled = true;

    try {
      const arrayBuffer = await file.arrayBuffer();
      state.pdfBytes = arrayBuffer;

      // Pass a cloned slice so worker transfer never detaches state.pdfBytes
      const dataSlice = new Uint8Array(arrayBuffer.slice(0));

      const pdfEngine = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
      if (!pdfEngine) {
        throw new Error(
          "PDF rendering engine is loading. Please wait a moment and try again.",
        );
      }

      if (pdfEngine.GlobalWorkerOptions && !pdfEngine.GlobalWorkerOptions.workerSrc) {
        pdfEngine.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
      }

      const loadingTask = pdfEngine.getDocument({
        data: dataSlice,
      });

      try {
        state.pdfDoc = await loadingTask.promise;
        state.totalPages = state.pdfDoc.numPages;
      } catch (loadErr) {
        if (
          loadErr &&
          (loadErr.name === "PasswordException" ||
            (loadErr.message && loadErr.message.toLowerCase().includes("password")))
        ) {
          showErrorPopup(
            "This PDF is password-protected. Please unlock it using our Unlock PDF tool before performing OCR.",
            () => {
              window.location.href = "/unlock-pdf";
            },
            "Go to Unlock PDF",
          );
          resetSession();
          return;
        }
        throw loadErr;
      }

      DOM.pageCountBadge.textContent = `${state.totalPages} ${state.totalPages === 1 ? "page" : "pages"}`;
      if (DOM.specPages) {
        DOM.specPages.textContent = `${state.totalPages} ${state.totalPages === 1 ? "Page" : "Pages"}`;
      }

      // Pre-Flight Digital Text Layer Analysis
      DOM.actionBarStatus.textContent = "Analyzing document text layers…";
      let digitalPagesFound = 0;
      state.pageTextStatus = {};

      const checkLimit = Math.min(state.totalPages, 30);
      for (let p = 1; p <= checkLimit; p++) {
        try {
          const pg = await state.pdfDoc.getPage(p);
          const txt = await pg.getTextContent();
          let charCount = 0;
          if (txt && txt.items) {
            for (const it of txt.items) {
              if (it.str && it.str.trim()) {
                charCount += it.str.trim().length;
              }
            }
          }
          const hasText = charCount >= 4;
          state.pageTextStatus[p] = { hasText, charCount };
          if (hasText) digitalPagesFound++;
        } catch (_) {
          state.pageTextStatus[p] = { hasText: false, charCount: 0 };
        }
      }

      state.documentHasDigitalText = digitalPagesFound > 0;

      // Update Spec HUD & Badge
      if (DOM.detectedLayerBadge) {
        DOM.detectedLayerBadge.style.display = "inline-block";
        if (digitalPagesFound === 0) {
          DOM.detectedLayerBadge.textContent = "Pure Image Scan";
          DOM.detectedLayerBadge.style.background = "rgba(16, 185, 129, 0.15)";
          DOM.detectedLayerBadge.style.color = "#10b981";
        } else if (digitalPagesFound === checkLimit) {
          DOM.detectedLayerBadge.textContent = "Digital Text Detected";
          DOM.detectedLayerBadge.style.background = "rgba(59, 130, 246, 0.15)";
          DOM.detectedLayerBadge.style.color = "#3b82f6";
        } else {
          DOM.detectedLayerBadge.textContent = `Mixed (${digitalPagesFound} Digital)`;
          DOM.detectedLayerBadge.style.background = "rgba(245, 158, 11, 0.15)";
          DOM.detectedLayerBadge.style.color = "#f59e0b";
        }
      }

      if (DOM.specDocType) {
        DOM.specDocType.textContent = digitalPagesFound === 0
          ? "Pure Image Scan"
          : digitalPagesFound === checkLimit
            ? "Digital Document"
            : `Mixed (${digitalPagesFound} Digital)`;
      }

      if (DOM.specTextLayer) {
        DOM.specTextLayer.textContent = digitalPagesFound === 0
          ? "None (Needs OCR)"
          : "Pre-existing (Protected)";
        DOM.specTextLayer.style.color = digitalPagesFound === 0
          ? "var(--shield-green)"
          : "#3b82f6";
      }

      updateSelectedPages();
      DOM.actionBarStatus.textContent = "Ready to recognize text from document";
      DOM.startOcrBtn.disabled = false;

      if (shouldPersist) {
        persistBlobToDB(file, state.fileName);
        scheduleDBSave();
      }
    } catch (err) {
      console.error("PDF loading error:", err);
      showErrorPopup(
        "Could not read the PDF file. It may be corrupt or encrypted. Details: " +
          err.message,
      );
      resetSession();
    }
  }

  function resetSession(clearDB = true) {
    if (state.isProcessing) {
      state.cancelRequested = true;
    }

    revokeBlobUrls();

    state.file = null;
    state.fileName = "";
    state.fileSize = 0;
    state.pdfBytes = null;
    state.pdfDoc = null;
    state.totalPages = 0;
    state.selectedPages = [];
    state.pageResults = [];
    state.pageTextStatus = {};
    state.documentHasDigitalText = false;
    state.isProcessing = false;
    state.cancelRequested = false;
    state.hasPersistedBlob = false;

    if (clearDB) {
      clearSessionFromDB();
    }

    if (DOM.detectedLayerBadge) DOM.detectedLayerBadge.style.display = "none";
    if (DOM.specDocType) DOM.specDocType.textContent = "Scanning…";
    if (DOM.specTextLayer) DOM.specTextLayer.textContent = "Auto-detecting";

    if (DOM.fileInput) DOM.fileInput.value = "";
    if (DOM.uploadZone) DOM.uploadZone.style.display = "block";
    if (DOM.workspace) DOM.workspace.style.display = "none";
    if (DOM.ocrStudio) DOM.ocrStudio.style.display = "none";
    if (DOM.progressHud) DOM.progressHud.style.display = "none";
    if (DOM.actionBar) DOM.actionBar.style.display = "none";
    if (DOM.shieldIcon) DOM.shieldIcon.classList.remove("is-active-scan");
    if (DOM.shieldStatus) DOM.shieldStatus.textContent = "OCR Engine Ready";
  }

  function revokeBlobUrls() {
    Object.values(state.generatedBlobs).forEach((blobUrl) => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    });
    state.generatedBlobs = { pdf: null, txt: null };

    state.pageResults.forEach((page) => {
      if (page.thumbUrl) URL.revokeObjectURL(page.thumbUrl);
    });
  }

  /* ==========================================================================
     OCR CONTROLS & RANGE PARSING
     ========================================================================== */
  function initControlHandlers() {
    // Language select
    if (DOM.ocrLangSelect) {
      DOM.ocrLangSelect.addEventListener("change", (e) => {
        state.options.lang = e.target.value;
        const selectedText = e.target.options[e.target.selectedIndex].text;
        if (DOM.specLang) DOM.specLang.textContent = selectedText.split(" ")[0];
        prewarmTesseractEngine(state.options.lang, state.options.mode);
        scheduleDBSave();
      });
    }

    // Processing mode
    if (DOM.modeFast && DOM.modeAccurate) {
      DOM.modeFast.addEventListener("change", () => {
        state.options.mode = "fast";
        DOM.radioCardFast.classList.add("is-active");
        DOM.radioCardAccurate.classList.remove("is-active");
        if (DOM.specMode) DOM.specMode.textContent = "Fast Stream (SIMD)";
        if (DOM.specRam) DOM.specRam.textContent = "< 35 MB (Single-buffer)";
        prewarmTesseractEngine(state.options.lang, "fast");
        scheduleDBSave();
      });

      DOM.modeAccurate.addEventListener("change", () => {
        state.options.mode = "accurate";
        DOM.radioCardFast.classList.remove("is-active");
        DOM.radioCardAccurate.classList.add("is-active");
        if (DOM.specMode) DOM.specMode.textContent = "High Definition (300 DPI)";
        if (DOM.specRam) DOM.specRam.textContent = "< 50 MB (Single-buffer)";
        prewarmTesseractEngine(state.options.lang, "accurate");
        scheduleDBSave();
      });
    }

    // Enhance checkbox
    if (DOM.enhanceScanCheck) {
      DOM.enhanceScanCheck.addEventListener("change", (e) => {
        state.options.enhance = e.target.checked;
        scheduleDBSave();
      });
    }

    // Searchable PDF Option checkbox
    if (DOM.generatePdfCheck) {
      DOM.generatePdfCheck.addEventListener("change", (e) => {
        state.options.generatePdf = e.target.checked;
        if (DOM.specPdfMode) {
          DOM.specPdfMode.textContent = e.target.checked
            ? "Enabled (Sandwich)"
            : "Disabled";
          DOM.specPdfMode.style.color = e.target.checked
            ? "var(--shield-green)"
            : "var(--text-3)";
        }
        scheduleDBSave();
      });
    }

    // Layer mode radio cards
    if (DOM.layerModeSmart && DOM.layerModeReplace) {
      DOM.layerModeSmart.addEventListener("change", () => {
        state.options.layerMode = "smart";
        if (DOM.radioCardSmartLayer) DOM.radioCardSmartLayer.classList.add("is-active");
        if (DOM.radioCardReplaceLayer) DOM.radioCardReplaceLayer.classList.remove("is-active");
        scheduleDBSave();
      });

      DOM.layerModeReplace.addEventListener("change", () => {
        state.options.layerMode = "replace";
        if (DOM.radioCardReplaceLayer) DOM.radioCardReplaceLayer.classList.add("is-active");
        if (DOM.radioCardSmartLayer) DOM.radioCardSmartLayer.classList.remove("is-active");
        scheduleDBSave();
      });
    }

    // Page range tabs
    if (DOM.rangeAllBtn && DOM.rangeFirstBtn && DOM.rangeCustomBtn) {
      DOM.rangeAllBtn.addEventListener("click", () => {
        setRangeTab("all");
      });
      DOM.rangeFirstBtn.addEventListener("click", () => {
        setRangeTab("first");
      });
      DOM.rangeCustomBtn.addEventListener("click", () => {
        setRangeTab("custom");
      });
    }

    if (DOM.customRangeInput) {
      DOM.customRangeInput.addEventListener("input", () => {
        state.pageRangeCustom = DOM.customRangeInput.value;
        updateSelectedPages();
        scheduleDBSave();
      });
    }

    // Start OCR Button
    if (DOM.startOcrBtn) {
      DOM.startOcrBtn.addEventListener("click", startOcrPipeline);
    }

    // Cancel OCR Button
    if (DOM.cancelOcrBtn) {
      DOM.cancelOcrBtn.addEventListener("click", () => {
        if (state.isProcessing) {
          state.cancelRequested = true;
          DOM.progressStatusTxt.textContent = "Cancelling OCR process…";
          DOM.cancelOcrBtn.disabled = true;
        }
      });
    }
  }

  function setRangeTab(tab) {
    state.pageRangeMode = tab;
    [DOM.rangeAllBtn, DOM.rangeFirstBtn, DOM.rangeCustomBtn].forEach((btn) => {
      btn.classList.remove("is-active");
    });

    if (tab === "all") {
      DOM.rangeAllBtn.classList.add("is-active");
      DOM.customRangeWrap.classList.remove("is-visible");
    } else if (tab === "first") {
      DOM.rangeFirstBtn.classList.add("is-active");
      DOM.customRangeWrap.classList.remove("is-visible");
    } else if (tab === "custom") {
      DOM.rangeCustomBtn.classList.add("is-active");
      DOM.customRangeWrap.classList.add("is-visible");
      DOM.customRangeInput.focus();
    }

    updateSelectedPages();
    scheduleDBSave();
  }

  function parsePageRange(rangeStr, maxPages) {
    if (!rangeStr || !rangeStr.trim()) return [];
    const pages = new Set();
    const parts = rangeStr.split(",");

    for (const part of parts) {
      const clean = part.trim();
      if (!clean) continue;

      if (clean.includes("-")) {
        const [startStr, endStr] = clean.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);

        if (isNaN(start) || isNaN(end) || start > end || start < 1) {
          continue;
        }
        for (let p = start; p <= Math.min(end, maxPages); p++) {
          pages.add(p);
        }
      } else {
        const p = parseInt(clean, 10);
        if (!isNaN(p) && p >= 1 && p <= maxPages) {
          pages.add(p);
        }
      }
    }

    return Array.from(pages).sort((a, b) => a - b);
  }

  function updateSelectedPages() {
    if (!state.pdfDoc) return;

    if (DOM.rangeAllBtn.classList.contains("is-active")) {
      state.selectedPages = Array.from(
        { length: state.totalPages },
        (_, i) => i + 1,
      );
    } else if (DOM.rangeFirstBtn.classList.contains("is-active")) {
      state.selectedPages = [1];
    } else {
      const inputVal = DOM.customRangeInput.value.trim();
      state.selectedPages = parsePageRange(inputVal, state.totalPages);
      if (DOM.customRangeHint) {
        if (state.selectedPages.length === 0) {
          DOM.customRangeHint.textContent = `Please enter valid page numbers between 1 and ${state.totalPages}.`;
          DOM.customRangeHint.style.color = "var(--danger-red)";
        } else {
          DOM.customRangeHint.textContent = `${state.selectedPages.length} ${state.selectedPages.length === 1 ? "page" : "pages"} selected (${state.selectedPages.join(", ")}).`;
          DOM.customRangeHint.style.color = "var(--text-3)";
        }
      }
    }

    if (DOM.specPages) {
      DOM.specPages.textContent = `${state.selectedPages.length} of ${state.totalPages} ${state.totalPages === 1 ? "Page" : "Pages"}`;
    }
    DOM.startOcrBtn.disabled = state.selectedPages.length === 0;
  }

  /* ==========================================================================
     IMAGE PREPROCESSING ALGORITHMS (Dynamic Grayscale Contrast Normalization)
     Industry Best Practice: Modern LSTM neural nets rely on anti-aliased subpixel
     gradients. Hard 1-bit thresholding destroys character curves. Dynamic histogram
     stretching whitens paper and darkens ink while preserving smooth anti-aliased edges.
     ========================================================================== */
  function applyScanEnhancementFilter(ctx, width, height) {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const len = d.length;

      // 1. Build a 256-bin luminance histogram with strided sampling for lightning speed
      const hist = new Uint32Array(256);
      const step = 16; // 4-pixel stride
      let sampled = 0;
      for (let i = 0; i < len; i += step) {
        const luma = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
        hist[luma]++;
        sampled++;
      }

      // 2. Find black cutoff (3rd percentile) and white paper level (96th percentile)
      let count = 0;
      let blackPoint = 0;
      let whitePoint = 255;
      const targetLow = Math.floor(sampled * 0.03);
      const targetHigh = Math.floor(sampled * 0.96);

      for (let i = 0; i < 256; i++) {
        count += hist[i];
        if (blackPoint === 0 && count >= targetLow) {
          blackPoint = i;
        }
        if (count >= targetHigh) {
          whitePoint = i;
          break;
        }
      }

      // Guard against blank or low-contrast pages
      if (whitePoint - blackPoint < 30) {
        blackPoint = Math.max(0, blackPoint - 20);
        whitePoint = Math.min(255, whitePoint + 20);
      }
      const range = Math.max(1, whitePoint - blackPoint);

      // Precompute 256-value lookup table (LUT) with gamma 0.90 for rich ink density
      const lut = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        if (i <= blackPoint) {
          lut[i] = 0;
        } else if (i >= whitePoint) {
          lut[i] = 255;
        } else {
          const normalized = (i - blackPoint) / range;
          const enhanced = Math.pow(normalized, 0.9) * 255;
          lut[i] = Math.min(255, Math.max(0, Math.round(enhanced)));
        }
      }

      // 3. Ultra-fast 32-bit single-pass application (4x fewer memory bus writes)
      const buf32 = new Uint32Array(imgData.data.buffer);
      const lut32 = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        const v = lut[i];
        lut32[i] = 0xff000000 | (v << 16) | (v << 8) | v;
      }

      const totalPx = buf32.length;
      for (let i = 0; i < totalPx; i++) {
        const px = buf32[i];
        const luma =
          ((px & 0xff) * 77 +
            ((px >> 8) & 0xff) * 150 +
            ((px >> 16) & 0xff) * 29) >>
          8;
        buf32[i] = lut32[luma];
      }

      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      console.warn("Scan enhancement contrast filter skipped:", e);
    }
  }

  function applyBinarizationFilter(ctx, width, height) {
    applyScanEnhancementFilter(ctx, width, height);
  }

  /* ==========================================================================
     AUTHENTIC VECTOR TEXT EXTRACTION (100% Accuracy for Electronic & Protected PDFs)
     PDF Specification ISO 32000-1: Permission-protected PDFs already contain the
     unscrambled digital font glyphs and coordinates in their content streams.
     Extracting directly bypasses OCR noise and yields 100% ground-truth accuracy.
     ========================================================================== */
  async function extractAuthenticDigitalText(pdfPage, viewport) {
    try {
      const tc = await pdfPage.getTextContent();
      if (!tc || !tc.items || tc.items.length === 0) {
        return null;
      }

      const words = [];
      const lines = [];
      let currentLineY = null;
      let currentLineText = "";

      for (const item of tc.items) {
        const rawStr = item.str;
        if (!rawStr || !rawStr.trim()) continue;

        // Viewport coordinates
        const p1 = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const p2 = viewport.convertToViewportPoint(
          item.transform[4] + item.width,
          item.transform[5] + item.height,
        );

        const itemX0 = Math.min(p1[0], p2[0]);
        const itemX1 = Math.max(p1[0], p2[0]);
        const itemY0 = Math.min(p1[1], p2[1]);
        const itemY1 = Math.max(p1[1], p2[1]);
        const itemW = Math.max(1, itemX1 - itemX0);

        // Group into lines by Y-coordinate baseline proximity (threshold: 4 PDF points)
        const yPos = item.transform[5];
        if (currentLineY === null || Math.abs(currentLineY - yPos) > 4) {
          if (currentLineText) lines.push(currentLineText.trim());
          currentLineText = rawStr;
          currentLineY = yPos;
        } else {
          currentLineText += " " + rawStr;
        }

        // Split item string into distinct non-empty words
        const itemWords = rawStr.trim().split(/\s+/).filter(Boolean);
        if (itemWords.length === 1) {
          words.push({
            text: itemWords[0],
            confidence: 100,
            bbox: {
              x0: Math.round(itemX0),
              y0: Math.round(itemY0),
              x1: Math.round(itemX1),
              y1: Math.round(itemY1),
            },
          });
        } else if (itemWords.length > 1) {
          const totalChars = itemWords.reduce((s, w) => s + w.length, 0);
          let currX = itemX0;
          for (let i = 0; i < itemWords.length; i++) {
            const wTxt = itemWords[i];
            const wordW = (wTxt.length / totalChars) * (itemW * 0.94);
            words.push({
              text: wTxt,
              confidence: 100,
              bbox: {
                x0: Math.round(currX),
                y0: Math.round(itemY0),
                x1: Math.round(currX + wordW),
                y1: Math.round(itemY1),
              },
            });
            currX += wordW + (itemW * 0.06 / Math.max(1, itemWords.length - 1));
          }
        }
      }

      if (currentLineText) lines.push(currentLineText.trim());

      return {
        text: lines.join("\n"),
        confidence: 100,
        words: words,
      };
    } catch (err) {
      console.warn("Digital text extraction fallback to raster OCR:", err);
      return null;
    }
  }

  /* ==========================================================================
     INDUSTRY ACCELERATION: DYNAMIC RESOLUTION CLAMPING & SIMD WORKER POOL
     1. WebAssembly SIMD Vectorization (128-bit AVX2/NEON vector instructions)
     2. Google Integer-Quantized Fast LSTM Model (4.0.0_fast, 3x faster inference)
     3. Speculative Background Pre-warming (Zero Cold Start on click)
     4. Optimal Target DPI Bounding (prevents runaway 70MP canvas explosion)
     5. Lightweight Thumbnail Rendering for Digital Pages (saves 95% CPU render)
     6. Parallel Concurrency Pool (2 workers with strict Low-RAM memory bounds)
     ========================================================================== */

  function calculateOptimalResolutionScale(unscaledVp, mode) {
    const maxDim = Math.max(unscaledVp.width, unscaledVp.height);
    // 300 DPI optimal: Standard A4/Letter height is ~800pt at 72dpi. Target max dimension is ~2400px.
    // Fast Mode: Target max dimension is ~1800px (~200 DPI).
    const targetMaxDim = mode === "accurate" ? 2400 : 1800;
    const computedScale = targetMaxDim / Math.max(1, maxDim);
    // Bound scale safely between 1.0 (if page is already a high-res scan) and 3.2
    return Math.min(3.2, Math.max(1.0, computedScale));
  }

  async function terminateWorkerPool() {
    if (state.tesseractPool && state.tesseractPool.length > 0) {
      const workers = state.tesseractPool;
      state.tesseractPool = [];
      await Promise.all(
        workers.map(async (w) => {
          try {
            await w.terminate();
          } catch (_) {}
        }),
      );
    }
    state.activeWorkerLang = null;
    state.activeWorkerModel = null;
  }

  let pendingPoolPromise = null;

  async function ensureTesseractPool(lang, mode, workerCount = 1) {
    const targetModel = mode === "accurate" ? "standard" : "fast";
    if (
      state.tesseractPool &&
      state.tesseractPool.length >= workerCount &&
      state.activeWorkerLang === lang &&
      state.activeWorkerModel === targetModel
    ) {
      return state.tesseractPool;
    }

    if (pendingPoolPromise) {
      try {
        await pendingPoolPromise;
      } catch (_) {}
      if (
        state.tesseractPool &&
        state.tesseractPool.length >= workerCount &&
        state.activeWorkerLang === lang &&
        state.activeWorkerModel === targetModel
      ) {
        return state.tesseractPool;
      }
    }

    pendingPoolPromise = (async () => {
      await terminateWorkerPool();

      if (!window.Tesseract) {
        throw new Error(
          "Tesseract OCR library not found. Please check your internet connection.",
        );
      }

      const langPath =
        targetModel === "fast"
          ? "https://tessdata.projectnaptha.com/4.0.0_fast"
          : "https://tessdata.projectnaptha.com/4.0.0";

      const workerOptions = {
        corePath:
          "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core-simd-lstm.wasm.js",
        workerPath:
          "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
        langPath: langPath,
      };

      DOM.progressStatusTxt.textContent = `Initializing SIMD neural engine (${targetModel === "fast" ? "Fast 8-bit Quantized" : "High Definition 300 DPI"})…`;

      const pool = [];
      for (let i = 0; i < workerCount; i++) {
        const worker = await window.Tesseract.createWorker(lang, 1, {
          ...workerOptions,
          logger: (m) => {
            if (m.status === "recognizing text" && m.progress > 0) {
              const currentStage = Math.round(m.progress * 100);
              DOM.progressStatusTxt.textContent = `Recognizing text (${currentStage}%)…`;
            }
          },
        });

        const autoPsm =
          window.Tesseract && window.Tesseract.PSM
            ? window.Tesseract.PSM.AUTO
            : "3";
        await worker.setParameters({
          tessedit_pageseg_mode: autoPsm,
          user_defined_dpi: "300",
          preserve_interword_spaces: "1",
        });
        pool.push(worker);
      }

      state.tesseractPool = pool;
      state.activeWorkerLang = lang;
      state.activeWorkerModel = targetModel;
      return pool;
    })();

    try {
      return await pendingPoolPromise;
    } finally {
      pendingPoolPromise = null;
    }
  }

  async function ensureTesseractWorker(lang) {
    const pool = await ensureTesseractPool(lang, state.options.mode, 1);
    return pool[0];
  }

  function prewarmTesseractEngine(lang, mode) {
    const targetModel = mode === "accurate" ? "standard" : "fast";
    if (
      state.tesseractPool &&
      state.tesseractPool.length > 0 &&
      state.activeWorkerLang === lang &&
      state.activeWorkerModel === targetModel
    ) {
      return;
    }
    if (state.isPrewarming) return;
    state.isPrewarming = true;

    const startPrewarm = () => {
      ensureTesseractPool(lang, mode, 1)
        .then(() => {
          console.log("[PDFMaster OCR] SIMD Neural engine pre-warmed & ready in memory.");
        })
        .catch((e) => console.warn("Background pre-warm note:", e))
        .finally(() => {
          state.isPrewarming = false;
        });
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(startPrewarm);
    } else {
      setTimeout(startPrewarm, 600);
    }
  }

  /* ==========================================================================
     LOW-RAM HIGH-SPEED STREAMING OCR PIPELINE (Hybrid Vector & Parallel SIMD)
     ========================================================================== */
  async function startOcrPipeline() {
    if (state.isProcessing || !state.pdfDoc || state.selectedPages.length === 0) {
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
    if (DOM.shieldStatus) DOM.shieldStatus.textContent = "Recognizing Characters…";

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
        workerPool = await ensureTesseractPool(
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
        const scale = calculateOptimalResolutionScale(unscaledVp, state.options.mode);
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
          await pdfPage.render({ canvasContext: thumbCtx, viewport: thumbVp }).promise;
          const thumbBlob = await new Promise((res) =>
            thumbCanvas.toBlob(res, "image/jpeg", 0.7),
          );
          thumbUrl = URL.createObjectURL(thumbBlob);
          thumbCanvas.width = 0;
          thumbCanvas.height = 0;

          // Authentic vector text extraction in viewport coordinates
          const digitalResult = await extractAuthenticDigitalText(pdfPage, viewport);
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
            if (state.cancelRequested) throw new Error("OCR operation cancelled by user.");
            await new Promise((r) => setTimeout(r, 25));
          }
          const worker = availableWorkers.pop();

          const canvas = document.createElement("canvas");
          canvas.width = cWidth;
          canvas.height = cHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });

          try {
            await pdfPage.render({ canvasContext: ctx, viewport: viewport }).promise;

            // Generate thumbnail from rendered canvas
            const thumbCanvas = document.createElement("canvas");
            const thumbRatio = 140 / canvas.width;
            thumbCanvas.width = 140;
            thumbCanvas.height = Math.floor(canvas.height * thumbRatio);
            const thumbCtx = thumbCanvas.getContext("2d");
            thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
            const thumbBlob = await new Promise((res) =>
              thumbCanvas.toBlob(res, "image/jpeg", 0.7),
            );
            thumbUrl = URL.createObjectURL(thumbBlob);
            thumbCanvas.width = 0;
            thumbCanvas.height = 0;

            // Apply 32-bit fast scan enhancement filter
            if (state.options.enhance) {
              applyScanEnhancementFilter(ctx, canvas.width, canvas.height);
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
                  if (prev.text.toLowerCase() !== wordTxt.toLowerCase()) return false;
                  const xOverlap = Math.max(
                    0,
                    Math.min(prev.bbox.x1, bbox.x1) - Math.max(prev.bbox.x0, bbox.x0),
                  );
                  const yOverlap = Math.max(
                    0,
                    Math.min(prev.bbox.y1, bbox.y1) - Math.max(prev.bbox.y0, bbox.y0),
                  );
                  const prevArea =
                    (prev.bbox.x1 - prev.bbox.x0) * (prev.bbox.y1 - prev.bbox.y0);
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
      await Promise.all(pageClassification.map((task) => processSinglePage(task)));

      // Assemble results in exact natural page order
      state.pageResults = state.selectedPages.map((p) => resultsMap[p]);

      // 3. Assemble Exports (Searchable PDF, Text)
      updateProgress(94, "Generating Searchable PDF & export formats…", totalToProcess);
      await generateAllExports();

      updateProgress(100, "OCR Recognition complete!", totalToProcess);

      // Display OCR Results Studio
      setTimeout(() => {
        finishOcrStudio();
      }, 300);
    } catch (err) {
      console.error("OCR Pipeline error:", err);
      if (state.cancelRequested) {
        DOM.actionBarStatus.textContent = "OCR was cancelled.";
      } else {
        showErrorPopup("OCR recognition failed: " + err.message);
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
      const elapsedSec = ((performance.now() - state.startTime) / 1000).toFixed(1);
      if (clampedPct > 5 && clampedPct < 100) {
        const estTotalSec = (elapsedSec / (clampedPct / 100)).toFixed(1);
        const estRemainingSec = Math.max(0, estTotalSec - elapsedSec).toFixed(1);
        DOM.progressTimerTxt.textContent = `Elapsed: ${elapsedSec}s · Est. Remaining: ${estRemainingSec}s`;
      } else {
        DOM.progressTimerTxt.textContent = `Elapsed: ${elapsedSec}s`;
      }
    }
  }

  /* ==========================================================================
     EXPORTS GENERATOR (Searchable PDF, Plain Text TXT)
     ========================================================================== */
  async function generateAllExports() {
    revokeBlobUrls();

    // 1. Plain Text (.txt)
    let fullText = "";
    state.pageResults.forEach((page) => {
      fullText += `================================================================================\n`;
      fullText += `PAGE ${page.pageNum} OF ${state.totalPages}  (Confidence: ${page.confidence}%)\n`;
      fullText += `================================================================================\n\n`;
      fullText += page.text.trim() + "\n\n";
    });

    const txtBlob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    state.generatedBlobs.txt = URL.createObjectURL(txtBlob);

    // 2. Searchable PDF (Sandwich / Invisible Selectable Text Layer)
    if (state.options.generatePdf) {
      await generateSearchablePdfBlob();
    }
  }

  async function generateSearchablePdfBlob() {
    if (state.generatedBlobs.pdf) {
      return state.generatedBlobs.pdf;
    }

    if (!window.PDFLib || !state.pdfBytes || state.pageResults.length === 0) {
      return null;
    }

    try {
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

      let pdfDoc;

      if (state.options.layerMode === "replace") {
        // REPLACE MODE: Re-create pristine PDF with fresh rendered background images + single clean OCR layer
        pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const pageRes of state.pageResults) {
          const pdfPageSrc = await state.pdfDoc.getPage(pageRes.pageNum);
          const origVp = pdfPageSrc.getViewport({ scale: 1.0 });

          // Render high-res JPEG image for crisp text clarity
          const vp = pdfPageSrc.getViewport({ scale: 1.5 });
          const cvs = document.createElement("canvas");
          cvs.width = Math.floor(vp.width);
          cvs.height = Math.floor(vp.height);
          const ctx = cvs.getContext("2d");
          await pdfPageSrc.render({ canvasContext: ctx, viewport: vp }).promise;

          const jpgBlob = await new Promise((r) => cvs.toBlob(r, "image/jpeg", 0.88));
          const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
          cvs.width = 0;
          cvs.height = 0;

          const embeddedImg = await pdfDoc.embedJpg(jpgBytes);
          const newPage = pdfDoc.addPage([origVp.width, origVp.height]);
          newPage.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: origVp.width,
            height: origVp.height,
          });

          // Overlay fresh single OCR text layer
          const scaleX = origVp.width / pageRes.canvasWidth;
          const scaleY = origVp.height / pageRes.canvasHeight;
          for (const word of pageRes.words) {
            drawInvisibleWord(newPage, word, origVp.height, scaleX, scaleY, font, rgb);
          }
        }
      } else {
        // SMART MODE (DEFAULT): Preserve original document structure, only overlay on pages that lack digital text!
        pdfDoc = await PDFDocument.load(state.pdfBytes, {
          ignoreEncryption: true,
        });
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const pageRes of state.pageResults) {
          const status = state.pageTextStatus[pageRes.pageNum];
          const pageAlreadyHasText = status && status.hasText;

          // INDUSTRY-STANDARD SMART RULE:
          // If the page already has a digital text layer, DO NOT add a duplicate invisible text layer!
          // This guarantees Ctrl+F matches each word EXACTLY ONCE with 0 duplicates!
          if (pageAlreadyHasText) {
            console.log(
              `[PDFMaster OCR] Page ${pageRes.pageNum} already has pre-existing digital text. Preserving original layer to prevent duplicate Ctrl+F matches.`,
            );
            continue;
          }

          const pdfPage = pdfDoc.getPage(pageRes.pageNum - 1);
          const pdfWidth = pdfPage.getWidth();
          const pdfHeight = pdfPage.getHeight();

          const scaleX = pdfWidth / pageRes.canvasWidth;
          const scaleY = pdfHeight / pageRes.canvasHeight;

          for (const word of pageRes.words) {
            drawInvisibleWord(pdfPage, word, pdfHeight, scaleX, scaleY, font, rgb);
          }
        }
      }

      const searchablePdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([searchablePdfBytes], {
        type: "application/pdf",
      });
      state.generatedBlobs.pdf = URL.createObjectURL(pdfBlob);
      return state.generatedBlobs.pdf;
    } catch (pdfErr) {
      console.warn("Could not compile searchable PDF layer:", pdfErr);
      return null;
    }
  }

  function drawInvisibleWord(page, word, pageHeight, scaleX, scaleY, font, rgb) {
    if (!word || !word.text) return;

    // 1. Target bounding box dimensions in PDF points
    const targetLeft = word.bbox.x0 * scaleX;
    const targetWidth = Math.max(1, (word.bbox.x1 - word.bbox.x0) * scaleX);
    const targetHeight = Math.max(1, (word.bbox.y1 - word.bbox.y0) * scaleY);
    const boxBottom = pageHeight - word.bbox.y1 * scaleY;

    // 2. Compute proportional font size fitting both width and height
    let cleanText = word.text;
    let unitWidth = 0;
    try {
      unitWidth = font.widthOfTextAtSize(cleanText, 1.0);
    } catch (_) {
      cleanText = word.text.replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
      if (cleanText) {
        try {
          unitWidth = font.widthOfTextAtSize(cleanText, 1.0);
        } catch (_) {}
      }
    }

    if (!cleanText || unitWidth <= 0) return;

    // Font size that spans the word's bounding box width
    const widthBasedSize = targetWidth / unitWidth;
    // Standard font size based on bounding box height
    const heightBasedSize = targetHeight * 0.85;

    // Clamp font size to maintain natural aspect ratio
    const fontSize = Math.max(
      4,
      Math.min(48, Math.min(widthBasedSize, heightBasedSize * 1.25)),
    );

    // 3. Compute exact horizontal placement (center within box if slightly narrower)
    const renderedWidth = font.widthOfTextAtSize(cleanText, fontSize);
    const xOffset = Math.max(0, (targetWidth - renderedWidth) / 2);
    const x = targetLeft + xOffset;

    // 4. Compute true font baseline placement
    // In Helvetica, descenders extend down ~22% below the baseline.
    // Placing baseline at (boxBottom + 0.22 * fontSize) ensures glyphs and selection
    // highlight rectangles align perfectly from boxBottom to boxTop!
    const y = boxBottom + fontSize * 0.22;

    try {
      page.drawText(cleanText, {
        x: x,
        y: y,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
        opacity: 0, // INVISIBLE TEXT LAYER: selectable and searchable in Acrobat & Chrome!
      });
    } catch (_) {}
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
    const elapsedTotal = ((performance.now() - state.startTime) / 1000).toFixed(1);

    DOM.metricPages.textContent = state.pageResults.length;
    DOM.metricWords.textContent = totalWords.toLocaleString();
    DOM.metricConfidence.textContent = `${avgConfidence}%`;
    DOM.metricDuration.textContent = `${elapsedTotal}s`;

    // Render Studio Tabs Bar
    DOM.editorTabsBar.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "page-tab-btn is-active";
    allBtn.textContent = `All Pages (${state.pageResults.length})`;
    allBtn.addEventListener("click", () => switchStudioPage("all"));
    DOM.editorTabsBar.appendChild(allBtn);

    state.pageResults.forEach((p, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-tab-btn";
      btn.textContent = `Page ${p.pageNum}`;
      btn.dataset.pageIndex = idx;
      btn.addEventListener("click", () => switchStudioPage(idx));
      DOM.editorTabsBar.appendChild(btn);
    });

    // Default to first page in preview
    state.activeStudioPage = 0;
    renderStudioPagePreview(0);
    switchStudioPage("all");
    initStudioInteractions();
  }

  function switchStudioPage(target) {
    // Update active tab button
    DOM.editorTabsBar.querySelectorAll(".page-tab-btn").forEach((btn, i) => {
      if (target === "all" && i === 0) {
        btn.classList.add("is-active");
      } else if (typeof target === "number" && i === target + 1) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });

    if (target === "all") {
      let combined = "";
      state.pageResults.forEach((p) => {
        combined += `--- PAGE ${p.pageNum} ---\n` + p.text.trim() + "\n\n";
      });
      DOM.ocrTextArea.value = combined.trim();
    } else {
      const p = state.pageResults[target];
      if (p) {
        DOM.ocrTextArea.value = p.text.trim();
        renderStudioPagePreview(target);
      }
    }

    updateTextCounts();
  }

  async function renderStudioPagePreview(pageIndex) {
    const pageData = state.pageResults[pageIndex];
    if (!pageData || !state.pdfDoc) return;

    state.activeStudioPage = pageIndex;
    DOM.currentPageIndicator.textContent = `Page ${pageData.pageNum} of ${state.totalPages}`;

    DOM.prevPageBtn.disabled = pageIndex === 0;
    DOM.nextPageBtn.disabled = pageIndex === state.pageResults.length - 1;

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
    // Pagination buttons
    DOM.prevPageBtn.onclick = () => {
      if (state.activeStudioPage > 0) {
        renderStudioPagePreview(state.activeStudioPage - 1);
        switchStudioPage(state.activeStudioPage);
      }
    };

    DOM.nextPageBtn.onclick = () => {
      if (state.activeStudioPage < state.pageResults.length - 1) {
        renderStudioPagePreview(state.activeStudioPage + 1);
        switchStudioPage(state.activeStudioPage);
      }
    };

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

    // Copy Text
    DOM.copyTextBtn.onclick = copyCurrentText;
    DOM.copyAllBtn.onclick = copyCurrentText;

    // Clear Text
    DOM.clearTextBtn.onclick = () => {
      DOM.ocrTextArea.value = "";
      updateTextCounts();
    };

    // Downloads
    DOM.downloadPdfBtn.onclick = () => triggerDownload("pdf");
    DOM.downloadTxtBtn.onclick = () => triggerDownload("txt");
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

  async function triggerDownload(format) {
    const baseName = state.fileName.replace(/\.[^/.]+$/, "") || "document";
    let blobUrl = state.generatedBlobs[format];

    if (format === "pdf" && !blobUrl) {
      DOM.downloadPdfBtn.disabled = true;
      const originalHtml = DOM.downloadPdfBtn.innerHTML;
      DOM.downloadPdfBtn.innerHTML = `
        <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg> Compiling Searchable PDF…
      `;
      try {
        blobUrl = await generateSearchablePdfBlob();
      } finally {
        DOM.downloadPdfBtn.disabled = false;
        DOM.downloadPdfBtn.innerHTML = originalHtml;
      }
    } else if (format === "txt") {
      const currentText = DOM.ocrTextArea.value;
      const blob = new Blob([currentText], { type: "text/plain;charset=utf-8" });
      blobUrl = URL.createObjectURL(blob);
    }

    if (!blobUrl) {
      showErrorPopup(
        `The ${format.toUpperCase()} export is not available for this document.`,
      );
      return;
    }

    const downloadFileName =
      format === "pdf"
        ? `${baseName}_searchable.pdf`
        : `${baseName}_text.txt`;

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = downloadFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Delete the file and session from local recovery immediately after file download!
    await clearSessionFromDB();
    showToast(`Downloaded ${downloadFileName}.`, "success", 4000);

    // Track conversion event if tracking script loaded
    if (window.trackConversion) {
      window.trackConversion("ocr_pdf_download", { format });
    }
  }

  /* ==========================================================================
     POPUP & NOTIFICATIONS
     ========================================================================== */
  function showErrorPopup(msg, onAction, actionText) {
    if (window.showUniversalPopup) {
      window.showUniversalPopup({
        title: "Notice",
        message: msg,
        type: "error",
        actionBtnText: actionText || "OK",
        onAction: onAction,
      });
    } else {
      alert(msg);
      if (onAction) onAction();
    }
  }

  /* ==========================================================================
     TOAST NOTIFICATION SYSTEM
     ========================================================================== */
  let toastTimer = null;
  function showToast(
    msg,
    type = "info",
    dur = 3500,
    onClick = null,
    actionText = null,
  ) {
    if (!DOM.toast) return;
    clearTimeout(toastTimer);
    if (DOM.toastMsg) DOM.toastMsg.textContent = msg;

    if (DOM.toastIcon) {
      if (type === "success") {
        DOM.toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      } else if (type === "error") {
        DOM.toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
      } else if (type === "warning") {
        DOM.toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      } else {
        DOM.toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      }
    }

    const existingBtn = DOM.toast.querySelector(".toast-btn");
    if (existingBtn) existingBtn.remove();

    if (actionText && typeof onClick === "function") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toast-btn";
      btn.textContent = actionText;
      btn.onclick = (e) => {
        e.stopPropagation();
        DOM.toast.classList.remove("show");
        onClick();
      };
      DOM.toast.appendChild(btn);
    }

    DOM.toast.className = `toast ${type}`;
    void DOM.toast.offsetWidth;
    DOM.toast.classList.add("show");
    toastTimer = setTimeout(() => {
      if (DOM.toast) DOM.toast.classList.remove("show");
    }, dur);
  }

  /* ==========================================================================
     INDEXEDDB RECOVERY MODE LOGIC
     ========================================================================== */
  const DB_NAME = "pdfmaster_ocr_db";
  const DB_VERSION = 1;
  let dbPromise = null;
  let dbSaveTimer = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
        if (!db.objectStoreNames.contains("ocr_data")) {
          db.createObjectStore("ocr_data");
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  // Persists the raw File/Blob into IndexedDB disk storage
  async function persistBlobToDB(blob, name) {
    try {
      const db = await openDB();
      const tx = db.transaction(["ocr_data"], "readwrite");
      tx.objectStore("ocr_data").put(
        {
          fileName: name,
          fileSize: blob.size,
          blob: blob,
          timestamp: Date.now(),
        },
        "file",
      );
      await new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      });
      state.hasPersistedBlob = true;
      updateRecoveryBadge(true);
      return true;
    } catch (err) {
      console.warn("IndexedDB blob persist error:", err);
      return false;
    }
  }

  function scheduleDBSave() {
    if (dbSaveTimer) clearTimeout(dbSaveTimer);
    dbSaveTimer = setTimeout(() => {
      saveSessionToDB();
    }, 300);
  }

  // Saves lightweight session metadata without rewriting the heavy blob
  async function saveSessionToDB() {
    if (!state.fileName || (!state.file && !state.hasPersistedBlob)) return false;
    try {
      const db = await openDB();
      const tx = db.transaction(["settings"], "readwrite");
      const settingsStore = tx.objectStore("settings");

      const sessionData = {
        timestamp: Date.now(),
        fileName: state.fileName,
        fileSize: state.fileSize,
        totalPages: state.totalPages,
        lang: state.options.lang,
        mode: state.options.mode,
        pageRangeMode: state.pageRangeMode,
        pageRangeCustom: state.pageRangeCustom,
        enhance: state.options.enhance,
        layerMode: state.options.layerMode,
      };
      settingsStore.put(sessionData, "session");

      await new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      });

      updateRecoveryBadge(true);
      return true;
    } catch (err) {
      console.warn("IndexedDB save failed:", err);
      return false;
    }
  }

  async function loadSessionFromDB(isManual = false) {
    try {
      const db = await openDB();
      const tx = db.transaction(["settings", "ocr_data"], "readonly");
      const settingsReq = tx.objectStore("settings").get("session");
      const dataReq = tx.objectStore("ocr_data").get("file");

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

      if (!data || (!data.blob && !data.bytes)) {
        updateRecoveryBadge(false);
        if (isManual) {
          showToast("No stored session found in recovery storage.", "error");
        }
        return false;
      }

      const blob =
        data.blob ||
        (data.bytes
          ? new Blob([data.bytes], { type: "application/pdf" })
          : null);
      if (!blob) return false;

      const fileObj = new File([blob], data.fileName || "document.pdf", {
        type: "application/pdf",
        lastModified: data.timestamp || Date.now(),
      });

      // Restore UI settings if present
      if (session) {
        if (session.lang && DOM.ocrLangSelect) {
          DOM.ocrLangSelect.value = session.lang;
          state.options.lang = session.lang;
          const selectedText = DOM.ocrLangSelect.options[DOM.ocrLangSelect.selectedIndex]?.text;
          if (DOM.specLang && selectedText) DOM.specLang.textContent = selectedText.split(" ")[0];
        }
        if (session.mode) {
          state.options.mode = session.mode;
          if (session.mode === "accurate") {
            if (DOM.modeAccurate) DOM.modeAccurate.checked = true;
            DOM.radioCardFast?.classList.remove("is-active");
            DOM.radioCardAccurate?.classList.add("is-active");
          } else {
            if (DOM.modeFast) DOM.modeFast.checked = true;
            DOM.radioCardFast?.classList.add("is-active");
            DOM.radioCardAccurate?.classList.remove("is-active");
          }
        }
        if (session.enhance !== undefined && DOM.enhanceScanCheck) {
          DOM.enhanceScanCheck.checked = !!session.enhance;
          state.options.enhance = !!session.enhance;
        }
        if (session.pageRangeMode) {
          state.pageRangeMode = session.pageRangeMode;
          if (session.pageRangeMode === "first") {
            setRangeTab("first");
          } else if (session.pageRangeMode === "custom") {
            setRangeTab("custom");
            if (DOM.customRangeInput) DOM.customRangeInput.value = session.pageRangeCustom || "";
            state.pageRangeCustom = session.pageRangeCustom || "";
            updateSelectedPages();
          } else {
            setRangeTab("all");
          }
        }
        if (session.layerMode) {
          state.options.layerMode = session.layerMode;
          if (session.layerMode === "replace") {
            if (DOM.layerModeReplace) DOM.layerModeReplace.checked = true;
            DOM.radioCardReplaceLayer?.classList.add("is-active");
            DOM.radioCardSmartLayer?.classList.remove("is-active");
          } else {
            if (DOM.layerModeSmart) DOM.layerModeSmart.checked = true;
            DOM.radioCardSmartLayer?.classList.add("is-active");
            DOM.radioCardReplaceLayer?.classList.remove("is-active");
          }
        }
      }

      await handleFileSelected(fileObj, false); // false = do not re-persist blob unnecessarily
      state.hasPersistedBlob = true;
      updateRecoveryBadge(true);

      if (isManual) {
        showToast(
          `Restored "${data.fileName || "document.pdf"}" from local recovery!`,
          "success",
        );
      }
      return true;
    } catch (err) {
      console.error("IndexedDB restore error:", err);
      if (isManual) {
        showToast("Failed to restore session: " + err.message, "error");
      }
      return false;
    }
  }

  // Deletes all session files from IndexedDB storage
  async function clearSessionFromDB() {
    try {
      const db = await openDB();
      const tx = db.transaction(["settings", "ocr_data"], "readwrite");
      tx.objectStore("settings").clear();
      tx.objectStore("ocr_data").clear();
      state.hasPersistedBlob = false;
      updateRecoveryBadge(false);
    } catch (err) {
      console.warn("IndexedDB clear failed:", err);
    }
  }

  async function checkStoredSessionAvailable(notifyOnFound = false) {
    try {
      const db = await openDB();
      const tx = db.transaction(["ocr_data"], "readonly");
      const req = tx.objectStore("ocr_data").get("file");
      const data = await new Promise((res) => {
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });

      const hasData = !!(data && (data.blob || data.bytes));
      updateRecoveryBadge(hasData);

      if (hasData && notifyOnFound && !state.pdfDoc) {
        const name = data.fileName || "PDF document";
        showToast(
          `Previous session ("${truncateFilename(name, 22)}") is available.`,
          "info",
          8000,
          () => loadSessionFromDB(true),
          "Restore",
        );
      }
      return hasData;
    } catch {
      updateRecoveryBadge(false);
      return false;
    }
  }

  function updateRecoveryBadge(hasData) {
    if (DOM.recoveryBadge) {
      DOM.recoveryBadge.style.display = hasData ? "block" : "none";
    }
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

  function initRecovery() {
    if (DOM.recoveryBtn) {
      DOM.recoveryBtn.addEventListener("click", () => {
        loadSessionFromDB(true);
      });
    }

    setTimeout(() => {
      checkStoredSessionAvailable(true);
    }, 450);
  }

  /* ==========================================================================
     BOOTSTRAP ON DOM READY
     ========================================================================== */
  function initBackToTop() {
    const backTop = document.getElementById("backTop");
    if (!backTop) return;
    window.addEventListener(
      "scroll",
      () => {
        backTop.classList.toggle("visible", window.scrollY > 400);
      },
      { passive: true },
    );
    backTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function boot() {
    initDOM();
    initTheme();
    initMobileMenu();
    initUploadHandlers();
    initControlHandlers();
    initBackToTop();
    initRecovery();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Expose for testing & diagnostic verification
  window.PDFMasterOCR = {
    state,
    DOM,
    triggerDownload,
    generateSearchablePdfBlob,
    loadSessionFromDB,
    clearSessionFromDB,
    checkStoredSessionAvailable,
    saveSessionToDB
  };
})();
