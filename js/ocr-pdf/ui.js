/**
 * PDFMaster - OCR PDF (Optical Character Recognition)
 * Module: ui.js
 * Theme initialization, mobile navigation, file drag-and-drop ingestion,
 * document structure parsing, and OCR control handlers.
 */

(function () {
  "use strict";

  window.PDFMasterOCR = window.PDFMasterOCR || {};
  const OCR = window.PDFMasterOCR;
  const state = OCR.state;
  const DOM = OCR.DOM;

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
      DOM.browseBtn.addEventListener("click", () => {
        // Clear value to guarantee 'change' event fires even if selecting the same file
        DOM.fileInput.value = "";
      });
    }

    // Dropzone Click
    DOM.uploadZone.addEventListener("click", (e) => {
      if (
        DOM.browseBtn &&
        (e.target === DOM.browseBtn || DOM.browseBtn.contains(e.target))
      ) {
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
      DOM.changeFileBtn.addEventListener("click", () => resetSession(true));
    }

    if (DOM.ocrAnotherBtn) {
      DOM.ocrAnotherBtn.addEventListener("click", () => resetSession(true));
    }
  }

  async function handleFileSelected(file, shouldPersist = true) {
    if (!file) return;

    const isPdf =
      (file.name && file.name.toLowerCase().endsWith(".pdf")) ||
      (file.type && file.type.toLowerCase().includes("pdf"));

    if (!isPdf) {
      if (OCR.showErrorPopup)
        OCR.showErrorPopup("Please upload a valid PDF document (.pdf).");
      return;
    }

    // Speculative zero-latency pre-warming of SIMD OCR engine while user reviews document
    if (OCR.prewarmTesseractEngine) {
      OCR.prewarmTesseractEngine(state.options.lang, state.options.mode);
    }

    state.file = file;
    state.fileName = file.name || "document.pdf";
    state.fileSize = file.size || 0;

    DOM.fileName.textContent = state.fileName;
    DOM.fileSize.textContent = OCR.formatFileSize(state.fileSize);

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

      if (
        pdfEngine.GlobalWorkerOptions &&
        !pdfEngine.GlobalWorkerOptions.workerSrc
      ) {
        pdfEngine.GlobalWorkerOptions.workerSrc =
          "/assets/vendor/pdf.worker.min.js";
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
            (loadErr.message &&
              loadErr.message.toLowerCase().includes("password")))
        ) {
          if (OCR.showErrorPopup) {
            OCR.showErrorPopup(
              "This PDF is password-protected. Please unlock it using our Unlock PDF tool before performing OCR.",
              () => {
                window.location.href = "/unlock-pdf";
              },
              "Go to Unlock PDF",
            );
          }
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
        DOM.specDocType.textContent =
          digitalPagesFound === 0
            ? "Pure Image Scan"
            : digitalPagesFound === checkLimit
              ? "Digital Document"
              : `Mixed (${digitalPagesFound} Digital)`;
      }

      if (DOM.specTextLayer) {
        DOM.specTextLayer.textContent =
          digitalPagesFound === 0
            ? "None (Needs OCR)"
            : "Pre-existing (Protected)";
        DOM.specTextLayer.style.color =
          digitalPagesFound === 0 ? "var(--shield-green)" : "#3b82f6";
      }

      updateSelectedPages();
      DOM.actionBarStatus.textContent = "Ready to recognize text from document";
      DOM.startOcrBtn.disabled = false;

      if (shouldPersist && OCR.persistBlobToDB && OCR.scheduleDBSave) {
        OCR.persistBlobToDB(file, state.fileName);
        OCR.scheduleDBSave();
      }
    } catch (err) {
      console.error("PDF loading error:", err);
      if (OCR.showErrorPopup) {
        OCR.showErrorPopup(
          "Could not read the PDF file. It may be corrupt or encrypted. Details: " +
            err.message,
        );
      }
      resetSession();
    }
  }

  function resetSession(clearDB = true) {
    if (state.isProcessing) {
      state.cancelRequested = true;
    }

    if (OCR.revokeBlobUrls) OCR.revokeBlobUrls();

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

    if (clearDB && OCR.clearSessionFromDB) {
      OCR.clearSessionFromDB();
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
        if (OCR.prewarmTesseractEngine)
          OCR.prewarmTesseractEngine(state.options.lang, state.options.mode);
        if (OCR.scheduleDBSave) OCR.scheduleDBSave();
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
        if (OCR.prewarmTesseractEngine)
          OCR.prewarmTesseractEngine(state.options.lang, "fast");
        if (OCR.scheduleDBSave) OCR.scheduleDBSave();
      });

      DOM.modeAccurate.addEventListener("change", () => {
        state.options.mode = "accurate";
        DOM.radioCardFast.classList.remove("is-active");
        DOM.radioCardAccurate.classList.add("is-active");
        if (DOM.specMode)
          DOM.specMode.textContent = "High Definition (300 DPI)";
        if (DOM.specRam) DOM.specRam.textContent = "< 50 MB (Single-buffer)";
        if (OCR.prewarmTesseractEngine)
          OCR.prewarmTesseractEngine(state.options.lang, "accurate");
        if (OCR.scheduleDBSave) OCR.scheduleDBSave();
      });
    }

    // Enhance checkbox
    if (DOM.enhanceScanCheck) {
      DOM.enhanceScanCheck.addEventListener("change", (e) => {
        state.options.enhance = e.target.checked;
        if (OCR.scheduleDBSave) OCR.scheduleDBSave();
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
        if (OCR.scheduleDBSave) OCR.scheduleDBSave();
      });
    }

    // Layer mode radio cards
    if (DOM.layerModeSmart && DOM.layerModeReplace) {
      DOM.layerModeSmart.addEventListener("change", () => {
        state.options.layerMode = "smart";
        if (DOM.radioCardSmartLayer)
          DOM.radioCardSmartLayer.classList.add("is-active");
        if (DOM.radioCardReplaceLayer)
          DOM.radioCardReplaceLayer.classList.remove("is-active");
        if (OCR.scheduleDBSave) OCR.scheduleDBSave();
      });

      DOM.layerModeReplace.addEventListener("change", () => {
        state.options.layerMode = "replace";
        if (DOM.radioCardReplaceLayer)
          DOM.radioCardReplaceLayer.classList.add("is-active");
        if (DOM.radioCardSmartLayer)
          DOM.radioCardSmartLayer.classList.remove("is-active");
        if (OCR.scheduleDBSave) OCR.scheduleDBSave();
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
        if (OCR.scheduleDBSave) OCR.scheduleDBSave();
      });
    }

    // Start OCR Button
    if (DOM.startOcrBtn) {
      DOM.startOcrBtn.addEventListener("click", () => {
        if (OCR.startOcrPipeline) OCR.startOcrPipeline();
      });
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
    if (OCR.scheduleDBSave) OCR.scheduleDBSave();
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

  // Export to namespace
  OCR.initTheme = initTheme;
  OCR.updateThemeIcon = updateThemeIcon;
  OCR.initMobileMenu = initMobileMenu;
  OCR.initUploadHandlers = initUploadHandlers;
  OCR.handleFileSelected = handleFileSelected;
  OCR.resetSession = resetSession;
  OCR.initControlHandlers = initControlHandlers;
  OCR.setRangeTab = setRangeTab;
  OCR.parsePageRange = parsePageRange;
  OCR.updateSelectedPages = updateSelectedPages;
})();
