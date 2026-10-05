/**
 * PDFMaster - PDF Page Numbering Tool Script
 * Production Grade · Single Page WYSIWYG Preview · Zero-Heap Engine · 100% Client-Side
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
  const DB_NAME = "pdfmaster_number_db";
  const DB_VERSION = 1;
  const THEME_KEY = "pdfmaster-theme";
  const FIXED_MARGIN_PT = 36; // 0.5 inch standard PDF margin

  // =============================================
  //  APPLICATION STATE
  // =============================================
  const state = {
    fileName: "document.pdf",
    fileSize: 0,
    totalPages: 0,
    currentBlob: null,
    currentBlobUrl: null,
    pdfJsDoc: null,

    // Active single preview page (1-based)
    currentPreviewPage: 1,

    // Excluded 1-based page numbers
    excludedPages: new Set(),

    // Numbering Configuration Settings
    settings: {
      position: "bottom-center", // "top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"
      facingPages: false, // Alternate left/right margins for duplex / book binding
      format: "page-n-total", // "n", "page-n", "page-n-total", "n-slash-total", "dash-n-dash", "custom"
      customFormat: "Page {n} of {total}",
      numeralStyle: "arabic", // "arabic", "roman-upper", "roman-lower", "alpha-upper", "alpha-lower"
      startNumber: 1, // First number to start with
      scope: "all", // "all", "skip-cover", "skip-first-n", "odd", "even", "custom"
      skipFirstN: 1,
      rangeStr: "",
      fontSize: 11,
      fontColor: "#1e293b",
    },

    // History for Undo/Redo
    history: [],
    future: [],
  };

  let dbPromise = null;
  let dbSaveTimer = null;
  let toastTimer = null;
  let currentPreviewRenderTask = null;
  let activePageMetrics = null; // { width, height, pdfW, pdfH }
  let resizeDebounceTimer = null;

  // Results State
  let lastGeneratedBlob = null;
  let lastGeneratedName = "";

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

  // Position Picker
  const posBtns = document.querySelectorAll(".pos-btn");
  const facingPagesCheckbox = document.getElementById("facingPagesCheckbox");

  // Format & Numerals
  const formatSelect = document.getElementById("formatSelect");
  const customFormatGroup = document.getElementById("customFormatGroup");
  const customFormatInput = document.getElementById("customFormatInput");
  const formatChips = document.querySelectorAll(".chip-btn");
  const numeralSelect = document.getElementById("numeralSelect");
  const startNumberInput = document.getElementById("startNumberInput");

  // Scope
  const scopeBtns = document.querySelectorAll(".scope-btn");
  const skipCountGroup = document.getElementById("skipCountGroup");
  const skipFirstNInput = document.getElementById("skipFirstNInput");
  const customRangeGroup = document.getElementById("customRangeGroup");
  const customRangeInput = document.getElementById("customRangeInput");

  // Typography & Styling
  const fontSizeSlider = document.getElementById("fontSizeSlider");
  const fontSizeBox = document.getElementById("fontSizeBox");
  const colorSwatches = document.querySelectorAll(".color-swatch");
  const customColorPicker = document.getElementById("customColorPicker");

  // History & Actions
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const resetSettingsBtn = document.getElementById("resetSettingsBtn");

  // Single Page Preview Controls
  const previewPrevBtn = document.getElementById("previewPrevBtn");
  const previewNextBtn = document.getElementById("previewNextBtn");
  const previewPageInput = document.getElementById("previewPageInput");
  const previewTotalPages = document.getElementById("previewTotalPages");
  const previewTogglePageBtn = document.getElementById("previewTogglePageBtn");
  const previewToggleIcon = document.getElementById("previewToggleIcon");
  const previewToggleText = document.getElementById("previewToggleText");

  // Summary Banner
  const summaryBanner = document.getElementById("summaryBanner");
  const numberedCountEl = document.getElementById("numberedCount");
  const excludedCountEl = document.getElementById("excludedCount");
  const formatPreviewSample = document.getElementById("formatPreviewSample");

  // Single Page Stage
  const singlePageStage = document.getElementById("singlePageStage");
  const singlePageCanvas = document.getElementById("singlePageCanvas");
  const singlePageStampOverlay = document.getElementById(
    "singlePageStampOverlay",
  );
  const singlePageExcludedOverlay = document.getElementById(
    "singlePageExcludedOverlay",
  );
  const singlePageLoader = document.getElementById("singlePageLoader");

  // Bottom Action Bar & Sidebar Action
  const actionSummaryText = document.getElementById("actionSummaryText");
  const numberPdfBtn = document.getElementById("numberPdfBtn");
  const sidebarNumberPdfBtn = document.getElementById("sidebarNumberPdfBtn");

  // Loading Progress Modal
  const loadingModalOverlay = document.getElementById("loadingModalOverlay");
  const loadingModalTitle = document.getElementById("loadingModalTitle");
  const loadingModalSub = document.getElementById("loadingModalSub");
  const loadingBarFill = document.getElementById("loadingBarFill");
  const loadingStatusText = document.getElementById("loadingStatusText");
  const loadingPct = document.getElementById("loadingPct");

  // Results Card
  const resultsCard = document.getElementById("resultsCard");
  const origPagesStat = document.getElementById("origPagesStat");
  const numberedPagesStat = document.getElementById("numberedPagesStat");
  const newSizeStat = document.getElementById("newSizeStat");
  const downloadResultBtn = document.getElementById("downloadResultBtn");
  const modifyMoreBtn = document.getElementById("modifyMoreBtn");
  const startOverBtn = document.getElementById("startOverBtn");

  // Global UI
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
      const cur =
        document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(cur === "dark" ? "light" : "dark");
    });
  }

  // =============================================
  //  MOBILE SIDEBAR MENU
  // =============================================
  function openSideMenu() {
    if (sideMenu) sideMenu.classList.add("active");
    if (sideOverlay) sideOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeSideMenu() {
    if (sideMenu) sideMenu.classList.remove("active");
    if (sideOverlay) sideOverlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  if (hamburgerBtn) hamburgerBtn.addEventListener("click", openSideMenu);
  if (closeMenuBtn) closeMenuBtn.addEventListener("click", closeSideMenu);
  if (sideOverlay) sideOverlay.addEventListener("click", closeSideMenu);

  document.querySelectorAll(".side-nav a").forEach((a) => {
    a.addEventListener("click", closeSideMenu);
  });

  // =============================================
  //  BACK TO TOP BUTTON
  // =============================================
  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
      if (backTop) backTop.classList.add("show");
    } else {
      if (backTop) backTop.classList.remove("show");
    }
  });

  if (backTop) {
    backTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // =============================================
  //  FAQ ACCORDION
  // =============================================
  document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const isOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach((el) => {
        if (el !== item) el.classList.remove("open");
      });
      item.classList.toggle("open", !isOpen);
    });
  });

  // =============================================
  //  TOAST NOTIFICATIONS
  // =============================================
  function showToast(message, type = "info", duration = 3400) {
    if (!toastEl || !toastMsg) return;
    clearTimeout(toastTimer);

    toastMsg.textContent = message;
    toastEl.className = `toast toast-${type} show`;

    let iconSvg = "";
    if (type === "success") {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === "error") {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8372a" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else if (type === "warning") {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8372a" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    if (toastIcon) toastIcon.innerHTML = iconSvg;

    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, duration);
  }

  // =============================================
  //  NUMERAL FORMATTERS (Arabic, Roman, Alpha)
  // =============================================
  function toRoman(num, uppercase = true) {
    if (num <= 0) return num.toString();
    const romanLookup = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];
    let result = "";
    let val = num;
    for (const [v, roman] of romanLookup) {
      while (val >= v) {
        result += roman;
        val -= v;
      }
    }
    return uppercase ? result : result.toLowerCase();
  }

  function toAlpha(num, uppercase = true) {
    if (num <= 0) return num.toString();
    let result = "";
    let n = num;
    while (n > 0) {
      const rem = (n - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      n = Math.floor((n - 1) / 26);
    }
    return uppercase ? result : result.toLowerCase();
  }

  function formatNumberVal(val, style) {
    if (style === "roman-upper") return toRoman(val, true);
    if (style === "roman-lower") return toRoman(val, false);
    if (style === "alpha-upper") return toAlpha(val, true);
    if (style === "alpha-lower") return toAlpha(val, false);
    return val.toString();
  }

  function getPageLabelString(pageSeqNum, totalCount, settings) {
    const formattedN = formatNumberVal(pageSeqNum, settings.numeralStyle);
    const formattedTotal = formatNumberVal(
      totalCount,
      settings.numeralStyle === "arabic" ? "arabic" : settings.numeralStyle,
    );

    if (settings.format === "n") {
      return formattedN;
    }
    if (settings.format === "page-n") {
      return `Page ${formattedN}`;
    }
    if (settings.format === "page-n-total") {
      return `Page ${formattedN} of ${formattedTotal}`;
    }
    if (settings.format === "n-slash-total") {
      return `${formattedN} / ${formattedTotal}`;
    }
    if (settings.format === "dash-n-dash") {
      return `- ${formattedN} -`;
    }
    if (settings.format === "custom") {
      const tmpl = settings.customFormat || "Page {n} of {total}";
      return tmpl
        .replace(/{n}/g, formattedN)
        .replace(/{total}/g, formattedTotal);
    }
    return formattedN;
  }

  // =============================================
  //  INDEXEDDB SESSION PERSISTENCE
  // =============================================
  function getDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("sessions")) {
            db.createObjectStore("sessions");
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
      });
    }
    return dbPromise;
  }

  async function checkSavedSession() {
    try {
      const db = await getDb();
      const tx = db.transaction("sessions", "readonly");
      const store = tx.objectStore("sessions");
      const req = store.get("active_session");

      req.onsuccess = () => {
        const val = req.result;
        if (val && val.blob) {
          if (recoveryBadge) recoveryBadge.style.display = "block";
          if (recoveryBtn) {
            recoveryBtn.title = `Restore saved session: "${val.fileName}" (${val.totalPages} pages)`;
          }
        } else {
          if (recoveryBadge) recoveryBadge.style.display = "none";
        }
      };
    } catch (_) {}
  }

  async function saveSessionToDb() {
    if (!state.currentBlob) return;
    try {
      const db = await getDb();
      const tx = db.transaction("sessions", "readwrite");
      const store = tx.objectStore("sessions");
      store.put(
        {
          blob: state.currentBlob,
          fileName: state.fileName,
          fileSize: state.fileSize,
          totalPages: state.totalPages,
          excludedPages: Array.from(state.excludedPages),
          currentPreviewPage: state.currentPreviewPage,
          settings: { ...state.settings },
          savedAt: Date.now(),
        },
        "active_session",
      );
      if (recoveryBadge) recoveryBadge.style.display = "block";
    } catch (err) {
      console.warn("Could not save session to IndexedDB:", err);
    }
  }

  function scheduleSessionSave() {
    clearTimeout(dbSaveTimer);
    dbSaveTimer = setTimeout(saveSessionToDb, 600);
  }

  async function clearSessionFromDb() {
    try {
      const db = await getDb();
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").delete("active_session");
      if (recoveryBadge) recoveryBadge.style.display = "none";
    } catch (_) {}
  }

  async function restoreSession() {
    try {
      const db = await getDb();
      const tx = db.transaction("sessions", "readonly");
      const store = tx.objectStore("sessions");
      const req = store.get("active_session");

      req.onsuccess = async () => {
        const val = req.result;
        if (!val || !val.blob) {
          showToast("No saved session found to restore.", "warning");
          return;
        }

        showLoadingModal(
          true,
          "Restoring Saved Session",
          "Loading cached document & configuration…",
        );

        try {
          state.settings = { ...state.settings, ...(val.settings || {}) };
          state.excludedPages = new Set(val.excludedPages || []);
          state.currentPreviewPage = val.currentPreviewPage || 1;

          syncControlsFromState();

          await loadPdfFile(val.blob, val.fileName, true);
          showToast(
            `Restored session "${val.fileName}" successfully!`,
            "success",
          );
        } catch (e) {
          console.error("Restoration error:", e);
          showToast("Failed to restore session: " + e.message, "error");
        } finally {
          showLoadingModal(false);
        }
      };
    } catch (e) {
      showToast("Storage error during restoration: " + e.message, "error");
    }
  }

  if (recoveryBtn) {
    recoveryBtn.addEventListener("click", () => {
      restoreSession();
    });
  }

  // =============================================
  //  UNDO & REDO HISTORY
  // =============================================
  function pushStateToHistory() {
    const snap = {
      excludedPages: Array.from(state.excludedPages),
      currentPreviewPage: state.currentPreviewPage,
      settings: JSON.parse(JSON.stringify(state.settings)),
    };
    state.history.push(snap);
    if (state.history.length > 50) state.history.shift();
    state.future = []; // Clear redo stack on new action
    updateHistoryButtons();
    scheduleSessionSave();
  }

  function undo() {
    if (state.history.length === 0) return;
    const currentSnap = {
      excludedPages: Array.from(state.excludedPages),
      currentPreviewPage: state.currentPreviewPage,
      settings: JSON.parse(JSON.stringify(state.settings)),
    };
    state.future.push(currentSnap);

    const prev = state.history.pop();
    state.excludedPages = new Set(prev.excludedPages);
    state.settings = { ...prev.settings };
    state.currentPreviewPage = prev.currentPreviewPage || 1;

    syncControlsFromState();
    updateSummaryStats();
    renderCurrentPage(state.currentPreviewPage);
    updateHistoryButtons();
    scheduleSessionSave();
    showToast("Undone last configuration change", "info", 1800);
  }

  function redo() {
    if (state.future.length === 0) return;
    const currentSnap = {
      excludedPages: Array.from(state.excludedPages),
      currentPreviewPage: state.currentPreviewPage,
      settings: JSON.parse(JSON.stringify(state.settings)),
    };
    state.history.push(currentSnap);

    const next = state.future.pop();
    state.excludedPages = new Set(next.excludedPages);
    state.settings = { ...next.settings };
    state.currentPreviewPage = next.currentPreviewPage || 1;

    syncControlsFromState();
    updateSummaryStats();
    renderCurrentPage(state.currentPreviewPage);
    updateHistoryButtons();
    scheduleSessionSave();
    showToast("Redone configuration change", "info", 1800);
  }

  function updateHistoryButtons() {
    if (undoBtn) undoBtn.disabled = state.history.length === 0;
    if (redoBtn) redoBtn.disabled = state.future.length === 0;
  }

  if (undoBtn) undoBtn.addEventListener("click", undo);
  if (redoBtn) redoBtn.addEventListener("click", redo);

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (
      e.target &&
      ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)
    ) {
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      if (e.shiftKey) {
        e.preventDefault();
        redo();
      } else {
        e.preventDefault();
        undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      redo();
    } else if (e.key === "ArrowLeft") {
      if (state.totalPages > 0 && state.currentPreviewPage > 1) {
        e.preventDefault();
        renderCurrentPage(state.currentPreviewPage - 1);
      }
    } else if (e.key === "ArrowRight") {
      if (state.totalPages > 0 && state.currentPreviewPage < state.totalPages) {
        e.preventDefault();
        renderCurrentPage(state.currentPreviewPage + 1);
      }
    }
  });

  // =============================================
  //  SYNC UI CONTROLS <-> STATE
  // =============================================
  function syncControlsFromState() {
    // Position Buttons
    posBtns.forEach((btn) => {
      if (btn.getAttribute("data-pos") === state.settings.position) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    if (facingPagesCheckbox) {
      facingPagesCheckbox.checked = Boolean(state.settings.facingPages);
    }

    // Format
    if (formatSelect) formatSelect.value = state.settings.format;
    if (customFormatGroup) {
      customFormatGroup.style.display =
        state.settings.format === "custom" ? "flex" : "none";
    }
    if (customFormatInput) {
      customFormatInput.value = state.settings.customFormat;
    }
    formatChips.forEach((chip) => {
      chip.classList.toggle(
        "active",
        chip.getAttribute("data-format") === state.settings.format,
      );
    });

    // Numeral & Start Number
    if (numeralSelect) numeralSelect.value = state.settings.numeralStyle;
    if (startNumberInput) startNumberInput.value = state.settings.startNumber;

    // Scope Chips
    scopeBtns.forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-scope") === state.settings.scope,
      );
    });
    if (skipCountGroup) {
      skipCountGroup.style.display =
        state.settings.scope === "skip-first-n" ? "flex" : "none";
    }
    if (skipFirstNInput) skipFirstNInput.value = state.settings.skipFirstN;
    if (customRangeGroup) {
      customRangeGroup.style.display =
        state.settings.scope === "custom" ? "flex" : "none";
    }
    if (customRangeInput) customRangeInput.value = state.settings.rangeStr;

    // Font Size & Color
    if (fontSizeSlider) fontSizeSlider.value = state.settings.fontSize;
    if (fontSizeBox) fontSizeBox.value = state.settings.fontSize;

    colorSwatches.forEach((swatch) => {
      swatch.classList.toggle(
        "active",
        swatch.getAttribute("data-color").toLowerCase() ===
          state.settings.fontColor.toLowerCase(),
      );
    });
    if (customColorPicker) customColorPicker.value = state.settings.fontColor;
  }

  // =============================================
  //  RANGE PARSER (e.g. "1, 3-5, 8")
  // =============================================
  function parsePageRangeString(str, maxPages) {
    if (!str || !str.trim()) return new Set();
    const result = new Set();
    const chunks = str.split(",");
    for (const rawChunk of chunks) {
      const chunk = rawChunk.trim();
      if (!chunk) continue;
      if (chunk.includes("-")) {
        const parts = chunk.split("-");
        const a = parseInt(parts[0], 10);
        const b = parseInt(parts[1], 10);
        if (!isNaN(a) && !isNaN(b)) {
          const start = Math.max(1, Math.min(a, b));
          const end = Math.min(maxPages, Math.max(a, b));
          for (let p = start; p <= end; p++) result.add(p);
        }
      } else {
        const val = parseInt(chunk, 10);
        if (!isNaN(val) && val >= 1 && val <= maxPages) {
          result.add(val);
        }
      }
    }
    return result;
  }

  function applyScopeRule() {
    if (!state.totalPages) return;
    const scope = state.settings.scope;
    const newExcluded = new Set();

    if (scope === "all") {
      // Exclude none
    } else if (scope === "skip-cover") {
      newExcluded.add(1);
    } else if (scope === "skip-first-n") {
      const n = Math.max(1, parseInt(state.settings.skipFirstN, 10) || 1);
      for (let p = 1; p <= Math.min(n, state.totalPages); p++) {
        newExcluded.add(p);
      }
    } else if (scope === "odd") {
      // Keep only odd pages -> exclude evens
      for (let p = 1; p <= state.totalPages; p++) {
        if (p % 2 === 0) newExcluded.add(p);
      }
    } else if (scope === "even") {
      // Keep only even pages -> exclude odds
      for (let p = 1; p <= state.totalPages; p++) {
        if (p % 2 !== 0) newExcluded.add(p);
      }
    } else if (scope === "custom") {
      const targetedPages = parsePageRangeString(
        state.settings.rangeStr,
        state.totalPages,
      );
      // All pages NOT in targetedPages are excluded
      for (let p = 1; p <= state.totalPages; p++) {
        if (!targetedPages.has(p)) newExcluded.add(p);
      }
    }

    state.excludedPages = newExcluded;
  }

  // =============================================
  //  CONTROL EVENT LISTENERS
  // =============================================
  // Position Selector
  posBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      pushStateToHistory();
      const pos = btn.getAttribute("data-pos");
      state.settings.position = pos;
      posBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      updateCurrentStampOverlayOnly();
      updateSummaryStats();
    });
  });

  if (facingPagesCheckbox) {
    facingPagesCheckbox.addEventListener("change", (e) => {
      pushStateToHistory();
      state.settings.facingPages = e.target.checked;
      updateCurrentStampOverlayOnly();
      updateSummaryStats();
    });
  }

  // Format Select
  if (formatSelect) {
    formatSelect.addEventListener("change", (e) => {
      pushStateToHistory();
      state.settings.format = e.target.value;
      if (customFormatGroup) {
        customFormatGroup.style.display =
          state.settings.format === "custom" ? "flex" : "none";
      }
      formatChips.forEach((chip) => {
        chip.classList.toggle(
          "active",
          chip.getAttribute("data-format") === state.settings.format,
        );
      });
      updateCurrentStampOverlayOnly();
      updateSummaryStats();
    });
  }

  formatChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      pushStateToHistory();
      const fmt = chip.getAttribute("data-format");
      state.settings.format = fmt;
      if (formatSelect) formatSelect.value = fmt;
      if (customFormatGroup) {
        customFormatGroup.style.display = fmt === "custom" ? "flex" : "none";
      }
      formatChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      updateCurrentStampOverlayOnly();
      updateSummaryStats();
    });
  });

  if (customFormatInput) {
    customFormatInput.addEventListener("input", (e) => {
      state.settings.customFormat = e.target.value;
      updateCurrentStampOverlayOnly();
      updateSummaryStats();
      scheduleSessionSave();
    });
  }

  // Numeral & Start Number
  if (numeralSelect) {
    numeralSelect.addEventListener("change", (e) => {
      pushStateToHistory();
      state.settings.numeralStyle = e.target.value;
      updateCurrentStampOverlayOnly();
      updateSummaryStats();
    });
  }

  if (startNumberInput) {
    startNumberInput.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      state.settings.startNumber = isNaN(val) ? 1 : Math.max(0, val);
      updateCurrentStampOverlayOnly();
      updateSummaryStats();
      scheduleSessionSave();
    });
  }

  // Scope Buttons
  scopeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      pushStateToHistory();
      const sc = btn.getAttribute("data-scope");
      state.settings.scope = sc;
      scopeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (skipCountGroup) {
        skipCountGroup.style.display = sc === "skip-first-n" ? "flex" : "none";
      }
      if (customRangeGroup) {
        customRangeGroup.style.display = sc === "custom" ? "flex" : "none";
      }

      applyScopeRule();
      updateSummaryStats();
      renderCurrentPage(state.currentPreviewPage);
    });
  });

  if (skipFirstNInput) {
    skipFirstNInput.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      state.settings.skipFirstN = isNaN(val) ? 1 : Math.max(1, val);
      applyScopeRule();
      updateSummaryStats();
      renderCurrentPage(state.currentPreviewPage);
      scheduleSessionSave();
    });
  }

  if (customRangeInput) {
    customRangeInput.addEventListener("input", (e) => {
      state.settings.rangeStr = e.target.value;
      applyScopeRule();
      updateSummaryStats();
      renderCurrentPage(state.currentPreviewPage);
      scheduleSessionSave();
    });
  }

  // Font Size & Color
  if (fontSizeSlider && fontSizeBox) {
    fontSizeSlider.addEventListener("input", (e) => {
      fontSizeBox.value = e.target.value;
      state.settings.fontSize = parseInt(e.target.value, 10);
      updateCurrentStampOverlayOnly();
      scheduleSessionSave();
    });
    fontSizeBox.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 8 && val <= 36) {
        fontSizeSlider.value = val;
        state.settings.fontSize = val;
        updateCurrentStampOverlayOnly();
        scheduleSessionSave();
      }
    });
  }

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      pushStateToHistory();
      const col = swatch.getAttribute("data-color");
      state.settings.fontColor = col;
      colorSwatches.forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      if (customColorPicker) customColorPicker.value = col;
      updateCurrentStampOverlayOnly();
    });
  });

  if (customColorPicker) {
    customColorPicker.addEventListener("input", (e) => {
      state.settings.fontColor = e.target.value;
      colorSwatches.forEach((s) => s.classList.remove("active"));
      updateCurrentStampOverlayOnly();
      scheduleSessionSave();
    });
  }

  // Reset Settings
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener("click", () => {
      pushStateToHistory();
      state.settings = {
        position: "bottom-center",
        facingPages: false,
        format: "page-n-total",
        customFormat: "Page {n} of {total}",
        numeralStyle: "arabic",
        startNumber: 1,
        scope: "all",
        skipFirstN: 1,
        rangeStr: "",
        fontSize: 11,
        fontColor: "#1e293b",
      };
      state.excludedPages.clear();
      syncControlsFromState();
      updateSummaryStats();
      renderCurrentPage(state.currentPreviewPage);
      showToast("Reset all numbering settings to default.", "info");
    });
  }

  // Reset All Document Pages to Numbered
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", () => {
      pushStateToHistory();
      state.excludedPages.clear();
      state.settings.scope = "all";
      syncControlsFromState();
      updateSummaryStats();
      renderCurrentPage(state.currentPreviewPage);
      showToast("Reset document pages to all numbered.", "info");
    });
  }

  // =============================================
  //  SINGLE PAGE PREVIEW NAVIGATION CONTROLS
  // =============================================
  if (previewPrevBtn) {
    previewPrevBtn.addEventListener("click", () => {
      if (state.currentPreviewPage > 1) {
        renderCurrentPage(state.currentPreviewPage - 1);
      }
    });
  }

  if (previewNextBtn) {
    previewNextBtn.addEventListener("click", () => {
      if (state.currentPreviewPage < state.totalPages) {
        renderCurrentPage(state.currentPreviewPage + 1);
      }
    });
  }

  if (previewPageInput) {
    previewPageInput.addEventListener("change", (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val)) {
        renderCurrentPage(val);
      } else {
        previewPageInput.value = state.currentPreviewPage;
      }
    });
    previewPageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        previewPageInput.blur();
      }
    });
  }

  if (previewTogglePageBtn) {
    previewTogglePageBtn.addEventListener("click", () => {
      togglePageExclusion(state.currentPreviewPage);
    });
  }

  // Sidebar primary action button
  if (sidebarNumberPdfBtn) {
    sidebarNumberPdfBtn.addEventListener("click", () => {
      if (numberPdfBtn && !numberPdfBtn.disabled) {
        numberPdfBtn.click();
      }
    });
  }

  // Prevent mousewheel on number inputs from hijacking page scrolling
  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener(
      "wheel",
      () => {
        input.blur();
      },
      { passive: true },
    );
  });

  function togglePageExclusion(pageNum) {
    pushStateToHistory();
    if (state.excludedPages.has(pageNum)) {
      state.excludedPages.delete(pageNum);
      showToast(`Page ${pageNum} included in numbering.`, "info", 1400);
    } else {
      state.excludedPages.add(pageNum);
      showToast(`Page ${pageNum} excluded from numbering.`, "info", 1400);
    }
    updateSummaryStats();
    renderCurrentPage(pageNum);
  }

  // =============================================
  //  DYNAMIC NUMBERING SEQUENCE COMPUTATION
  // =============================================
  function computeNumberingSequence() {
    const totalPages = state.totalPages;
    let numberedCount = 0;
    for (let p = 1; p <= totalPages; p++) {
      if (!state.excludedPages.has(p)) numberedCount++;
    }

    // Standard total count: total pages of the document
    const totalToUse = totalPages;

    let seqCounter = state.settings.startNumber;
    const pageToLabelMap = new Map();

    for (let p = 1; p <= totalPages; p++) {
      if (state.excludedPages.has(p)) {
        pageToLabelMap.set(p, null);
      } else {
        const label = getPageLabelString(
          seqCounter,
          totalToUse,
          state.settings,
        );
        pageToLabelMap.set(p, label);
        seqCounter++;
      }
    }

    return { pageToLabelMap, numberedCount, totalToUse };
  }

  function getEffectivePosition(basePos, isFacing, pageNum) {
    if (!isFacing) return basePos;
    // Facing pages / duplex: on odd pages, outside is right; on even pages, outside is left
    const isOdd = pageNum % 2 !== 0;
    if (basePos.startsWith("bottom-")) {
      if (basePos === "bottom-center") return "bottom-center";
      return isOdd ? "bottom-right" : "bottom-left";
    }
    if (basePos.startsWith("top-")) {
      if (basePos === "top-center") return "top-center";
      return isOdd ? "top-right" : "top-left";
    }
    return basePos;
  }

  function updateSummaryStats() {
    if (!state.totalPages) return;
    const { numberedCount, totalToUse } = computeNumberingSequence();

    // Summary Banner Counters
    if (numberedCountEl) numberedCountEl.textContent = numberedCount;
    if (excludedCountEl)
      excludedCountEl.textContent = state.totalPages - numberedCount;
    if (formatPreviewSample) {
      formatPreviewSample.textContent = getPageLabelString(
        state.settings.startNumber,
        totalToUse,
        state.settings,
      );
    }

    // Action Bar Summary Text
    if (actionSummaryText) {
      if (numberedCount === 0) {
        actionSummaryText.textContent =
          "No pages selected for numbering. Click 'Page Numbered' to include pages.";
        if (numberPdfBtn) numberPdfBtn.disabled = true;
        if (sidebarNumberPdfBtn) sidebarNumberPdfBtn.disabled = true;
      } else {
        actionSummaryText.textContent = `Ready to stamp ${numberedCount} of ${state.totalPages} page(s) starting from #${state.settings.startNumber} • ${state.settings.position.replace("-", " ")}`;
        if (numberPdfBtn) numberPdfBtn.disabled = false;
        if (sidebarNumberPdfBtn) sidebarNumberPdfBtn.disabled = false;
      }
    }
  }

  // =============================================
  //  SINGLE PAGE RENDERING & WYSIWYG STAMP
  // =============================================
  async function renderCurrentPage(pageNum) {
    if (!state.pdfJsDoc || !singlePageCanvas) return;

    // Clamp page number
    const clampedPage = Math.max(1, Math.min(pageNum, state.totalPages));
    state.currentPreviewPage = clampedPage;

    // Update navigation indicator and button states
    if (previewPageInput) previewPageInput.value = clampedPage;
    if (previewTotalPages) previewTotalPages.textContent = state.totalPages;
    if (previewPrevBtn) previewPrevBtn.disabled = clampedPage <= 1;
    if (previewNextBtn)
      previewNextBtn.disabled = clampedPage >= state.totalPages;

    // Update current page inclusion toggle button
    const isExcluded = state.excludedPages.has(clampedPage);
    if (previewTogglePageBtn) {
      previewTogglePageBtn.classList.toggle("is-excluded", isExcluded);
      if (previewToggleIcon) {
        previewToggleIcon.textContent = isExcluded ? "✕" : "✓";
      }
      if (previewToggleText) {
        previewToggleText.textContent = isExcluded
          ? `Page ${clampedPage} Excluded`
          : `Page ${clampedPage} Numbered`;
      }
      previewTogglePageBtn.title = isExcluded
        ? "Click to include this page in numbering"
        : "Click to exclude this page from numbering";
    }

    // Update Excluded Watermark Overlay on Preview Stage
    if (singlePageExcludedOverlay) {
      singlePageExcludedOverlay.style.display = isExcluded ? "flex" : "none";
    }

    // Cancel previous in-flight render task if user switched pages quickly
    if (currentPreviewRenderTask) {
      try {
        currentPreviewRenderTask.cancel();
      } catch (_) {}
      currentPreviewRenderTask = null;
    }

    if (singlePageLoader) singlePageLoader.style.display = "flex";

    try {
      const page = await state.pdfJsDoc.getPage(clampedPage);

      // Compute display viewport scale to fit stage cleanly
      const stageContainer = document.getElementById(
        "singlePageStageContainer",
      );
      const containerW =
        stageContainer && stageContainer.clientWidth > 100
          ? stageContainer.clientWidth
          : 600;
      const availableWidth = Math.max(260, Math.min(containerW - 48, 620));

      const unscaledViewport = page.getViewport({ scale: 1 });
      const targetScale = Math.max(
        0.35,
        Math.min(availableWidth / unscaledViewport.width, 1.4),
      );

      const viewport = page.getViewport({ scale: targetScale });
      const cssWidth = Math.floor(viewport.width);
      const cssHeight = Math.floor(viewport.height);

      singlePageCanvas.width = cssWidth;
      singlePageCanvas.height = cssHeight;
      singlePageCanvas.style.width = `${cssWidth}px`;
      singlePageCanvas.style.height = `${cssHeight}px`;

      if (singlePageStage) {
        singlePageStage.style.width = `${cssWidth}px`;
        singlePageStage.style.height = `${cssHeight}px`;
      }

      const ctx = singlePageCanvas.getContext("2d");
      currentPreviewRenderTask = page.render({
        canvasContext: ctx,
        viewport: viewport,
      });

      await currentPreviewRenderTask.promise;

      // Cache metrics for instant overlay adjustments without canvas re-rendering
      activePageMetrics = {
        cssWidth,
        cssHeight,
        pdfWidth: unscaledViewport.width,
        pdfHeight: unscaledViewport.height,
        scale: targetScale,
      };

      updateCurrentStampOverlayOnly();
    } catch (err) {
      if (err.name !== "RenderingCancelledException") {
        console.error("Preview render error:", err);
      }
    } finally {
      if (singlePageLoader) singlePageLoader.style.display = "none";
    }
  }

  /**
   * Instantly repositions and styles the live stamp overlay
   * without re-rendering the heavy PDF canvas.
   */
  function updateCurrentStampOverlayOnly() {
    if (!singlePageStampOverlay) return;

    const pageNum = state.currentPreviewPage;
    const isExcluded = state.excludedPages.has(pageNum);

    if (isExcluded) {
      singlePageStampOverlay.style.display = "none";
      return;
    }

    const { pageToLabelMap } = computeNumberingSequence();
    const label = pageToLabelMap.get(pageNum);
    if (!label) {
      singlePageStampOverlay.style.display = "none";
      return;
    }

    singlePageStampOverlay.style.display = "block";
    singlePageStampOverlay.textContent = label;

    // Calculate scale factor from PDF points (72dpi) to CSS pixels on the preview canvas
    const S = activePageMetrics
      ? activePageMetrics.cssWidth / activePageMetrics.pdfWidth
      : 1;

    // Standard margin is 36pt (0.5 in). Scaled margin matches PDF output position accurately.
    const marginPx = Math.max(8, Math.round(FIXED_MARGIN_PT * S));
    const fontSizePx = Math.max(9, Math.round(state.settings.fontSize * S));

    singlePageStampOverlay.style.fontSize = `${fontSizePx}px`;
    singlePageStampOverlay.style.color = state.settings.fontColor;

    // Calculate effective position with Duplex/Facing Pages awareness
    const effPos = getEffectivePosition(
      state.settings.position,
      state.settings.facingPages,
      pageNum,
    );

    // Reset layout styles
    singlePageStampOverlay.style.top = "";
    singlePageStampOverlay.style.bottom = "";
    singlePageStampOverlay.style.left = "";
    singlePageStampOverlay.style.right = "";
    singlePageStampOverlay.style.transform = "";

    if (effPos === "top-left") {
      singlePageStampOverlay.style.top = `${marginPx}px`;
      singlePageStampOverlay.style.left = `${marginPx}px`;
    } else if (effPos === "top-center") {
      singlePageStampOverlay.style.top = `${marginPx}px`;
      singlePageStampOverlay.style.left = "50%";
      singlePageStampOverlay.style.transform = "translateX(-50%)";
    } else if (effPos === "top-right") {
      singlePageStampOverlay.style.top = `${marginPx}px`;
      singlePageStampOverlay.style.right = `${marginPx}px`;
    } else if (effPos === "bottom-left") {
      singlePageStampOverlay.style.bottom = `${marginPx}px`;
      singlePageStampOverlay.style.left = `${marginPx}px`;
    } else if (effPos === "bottom-center") {
      singlePageStampOverlay.style.bottom = `${marginPx}px`;
      singlePageStampOverlay.style.left = "50%";
      singlePageStampOverlay.style.transform = "translateX(-50%)";
    } else if (effPos === "bottom-right") {
      singlePageStampOverlay.style.bottom = `${marginPx}px`;
      singlePageStampOverlay.style.right = `${marginPx}px`;
    }
  }

  // Handle window resize dynamically to keep preview crisp & responsive
  window.addEventListener("resize", () => {
    if (!state.pdfJsDoc || !workspace.classList.contains("active")) return;
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      renderCurrentPage(state.currentPreviewPage);
    }, 180);
  });

  // =============================================
  //  PDF LOADING PIPELINE
  // =============================================
  async function loadPdfFile(fileOrBlob, fileName, isRestoring = false) {
    if (!fileOrBlob) return;

    if (state.currentBlobUrl) {
      URL.revokeObjectURL(state.currentBlobUrl);
      state.currentBlobUrl = null;
    }
    if (state.pdfJsDoc) {
      try {
        state.pdfJsDoc.destroy();
      } catch (_) {}
      state.pdfJsDoc = null;
    }

    state.currentBlob = fileOrBlob;
    state.fileName = fileName || fileOrBlob.name || "document.pdf";
    state.fileSize = fileOrBlob.size || 0;
    state.currentBlobUrl = URL.createObjectURL(fileOrBlob);

    if (!isRestoring) {
      state.excludedPages.clear();
      state.currentPreviewPage = 1;
      state.history = [];
      state.future = [];
      updateHistoryButtons();
    }

    // Update File Info Bar
    if (fileNameEl) fileNameEl.textContent = state.fileName;
    if (fileSizeEl) {
      fileSizeEl.innerHTML = `<span>${fmtBytes(state.fileSize)}</span> · <span id="totalCount">…</span> pages`;
    }

    // Low-RAM badge
    if (ramBadgeEl) {
      if (state.fileSize > 25 * 1024 * 1024) {
        ramBadgeEl.textContent = "⚡ Low-RAM Active (>25MB)";
      } else {
        ramBadgeEl.textContent = "⚡ Low-RAM Active";
      }
    }

    showLoadingModal(
      true,
      "Loading Document",
      "Initializing streaming engine & page layout…",
    );

    try {
      const loadingTask = pdfjsLib.getDocument({
        url: state.currentBlobUrl,
        cMapUrl: "/assets/vendor/cmaps/",
        cMapPacked: true,
        disableAutoFetch: true,
        disableStream: false,
      });

      state.pdfJsDoc = await loadingTask.promise;
      state.totalPages = state.pdfJsDoc.numPages;

      const totalCountSpan = document.getElementById("totalCount");
      if (totalCountSpan) totalCountSpan.textContent = state.totalPages;
      if (previewTotalPages) previewTotalPages.textContent = state.totalPages;
      if (previewPageInput) {
        previewPageInput.max = state.totalPages;
        previewPageInput.min = 1;
        previewPageInput.value = state.currentPreviewPage || 1;
      }

      // Switch view from upload zone to workspace
      if (uploadZone) uploadZone.style.display = "none";
      if (workspace) workspace.classList.add("active");
      if (resultsCard) resultsCard.classList.remove("active");

      updateSummaryStats();
      await renderCurrentPage(state.currentPreviewPage || 1);
      scheduleSessionSave();

      showToast(`Loaded ${state.totalPages} page(s) successfully!`, "success");
    } catch (err) {
      console.error("PDF load error:", err);
      showToast("Failed to load PDF: " + (err.message || err), "error", 5000);
      if (uploadZone) uploadZone.style.display = "block";
      if (workspace) workspace.classList.remove("active");
    } finally {
      showLoadingModal(false);
    }
  }

  // =============================================
  //  LOADING PROGRESS MODAL
  // =============================================
  function showLoadingModal(show, title = "Processing PDF…", sub = "") {
    if (!loadingModalOverlay) return;
    if (show) {
      if (loadingModalTitle) loadingModalTitle.textContent = title;
      if (loadingModalSub) loadingModalSub.textContent = sub;
      loadingModalOverlay.classList.add("active");
      updateLoadingProgress(0, "Starting…");
    } else {
      loadingModalOverlay.classList.remove("active");
    }
  }

  function updateLoadingProgress(pct, status) {
    if (loadingBarFill) loadingBarFill.style.width = `${pct}%`;
    if (loadingPct) loadingPct.textContent = `${Math.round(pct)}%`;
    if (loadingStatusText && status) loadingStatusText.textContent = status;
  }

  // =============================================
  //  PDF GENERATION & NUMBER STAMPING PIPELINE
  // =============================================
  async function generateNumberedPdf() {
    if (!state.currentBlob || !state.totalPages) {
      showToast("No active PDF to number.", "error");
      return;
    }

    const { pageToLabelMap, numberedCount } = computeNumberingSequence();
    if (numberedCount === 0) {
      showToast("No pages have been selected for numbering.", "warning");
      return;
    }

    const startTime = performance.now();
    showLoadingModal(
      true,
      "Adding Page Numbers",
      "Stamping crisp vector numerals into PDF catalog losslessly…",
    );

    try {
      updateLoadingProgress(5, "Reading document bytes…");
      const arrayBuffer = await state.currentBlob.arrayBuffer();

      updateLoadingProgress(20, "Loading PDFDocument parser…");
      const PDFDocument = PDFLib.PDFDocument;
      const rgb = PDFLib.rgb;
      const degrees = PDFLib.degrees;
      const StandardFonts = PDFLib.StandardFonts;

      const pdfDoc = await PDFDocument.load(arrayBuffer, {
        ignoreEncryption: true,
      });

      // Embed Clean Universal Helvetica Font (0-byte overhead, standard Type 1)
      updateLoadingProgress(25, "Embedding standard Helvetica typography…");
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const fontSize = state.settings.fontSize;
      const marginX = FIXED_MARGIN_PT;
      const marginY = FIXED_MARGIN_PT;

      // Color parsing: hex string to rgb(r, g, b)
      const hexColor = state.settings.fontColor || "#1e293b";
      const r = parseInt(hexColor.slice(1, 3), 16) / 255;
      const g = parseInt(hexColor.slice(3, 5), 16) / 255;
      const b = parseInt(hexColor.slice(5, 7), 16) / 255;
      const textColor = rgb(
        isNaN(r) ? 0.1 : r,
        isNaN(g) ? 0.1 : g,
        isNaN(b) ? 0.2 : b,
      );

      const pages = pdfDoc.getPages();
      const totalDocPages = pages.length;

      // Stamp included pages with yield intervals
      for (let i = 0; i < totalDocPages; i++) {
        const pageNum = i + 1;
        const label = pageToLabelMap.get(pageNum);

        if (label) {
          const page = pages[i];
          const pageW = page.getWidth();
          const pageH = page.getHeight();
          const rotAngle = ((page.getRotation().angle % 360) + 360) % 360;

          // Visual dimensions accounting for page rotation
          const isRotatedQuarter = rotAngle === 90 || rotAngle === 270;
          const visW = isRotatedQuarter ? pageH : pageW;
          const visH = isRotatedQuarter ? pageW : pageH;

          // Text measurement
          const textWidth = font.widthOfTextAtSize(label, fontSize);
          const textHeight = font.heightAtSize(fontSize);

          // Position calculation in visual space (0,0 = visual bottom-left)
          const effPos = getEffectivePosition(
            state.settings.position,
            state.settings.facingPages,
            pageNum,
          );

          let vx = 0;
          let vy = 0;

          if (effPos === "top-left") {
            vx = marginX;
            vy = visH - marginY - textHeight;
          } else if (effPos === "top-center") {
            vx = (visW - textWidth) / 2;
            vy = visH - marginY - textHeight;
          } else if (effPos === "top-right") {
            vx = visW - marginX - textWidth;
            vy = visH - marginY - textHeight;
          } else if (effPos === "bottom-left") {
            vx = marginX;
            vy = marginY;
          } else if (effPos === "bottom-center") {
            vx = (visW - textWidth) / 2;
            vy = marginY;
          } else if (effPos === "bottom-right") {
            vx = visW - marginX - textWidth;
            vy = marginY;
          }

          // Transform visual coordinates (vx, vy) to PDF page coordinates based on rotAngle
          const { textX, textY, textAngle } = calcPageDrawCoords(
            pageW,
            pageH,
            rotAngle,
            vx,
            vy,
            textWidth,
            textHeight,
          );

          // Draw genuine vector text into PDF stream
          page.drawText(label, {
            x: textX,
            y: textY,
            size: fontSize,
            font: font,
            color: textColor,
            rotate: degrees(textAngle),
          });
        }

        // Update progress smoothly
        const progressPct = 25 + Math.round(((i + 1) / totalDocPages) * 65);
        if (i % 5 === 0 || i === totalDocPages - 1) {
          updateLoadingProgress(
            progressPct,
            `Numbering page ${i + 1} of ${totalDocPages}…`,
          );
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      updateLoadingProgress(92, "Serializing output PDF…");
      const outBytes = await pdfDoc.save();
      const outBlob = new Blob([outBytes], { type: "application/pdf" });

      lastGeneratedBlob = outBlob;
      const baseName = state.fileName.replace(/\.[^/.]+$/, "");
      lastGeneratedName = `${baseName}_numbered.pdf`;

      updateLoadingProgress(100, "Done! Ready for download.");
      showLoadingModal(false);

      // Update Results Card
      if (resultsCard) {
        resultsCard.classList.add("active");
        if (origPagesStat)
          origPagesStat.textContent = `${state.totalPages} pages`;
        if (numberedPagesStat)
          numberedPagesStat.textContent = `${numberedCount} numbered`;
        if (newSizeStat) newSizeStat.textContent = fmtBytes(outBlob.size);
        resultsCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      // Universal Popup & Conversion Tracker Integration
      if (
        window.PDFMasterPopup &&
        typeof window.PDFMasterPopup.show === "function"
      ) {
        window.PDFMasterPopup.show({
          title: "Thank You for Using PDF<span>Master</span>!",
          desc: `Your page numbers have been stamped cleanly onto <strong>${numberedCount} page(s)</strong>. Processed locally on your device with <strong>100% privacy</strong>.`,
          fileName: lastGeneratedName,
          fileType: "pdf",
          fileDetails: `${state.totalPages} pages (${numberedCount} numbered) • ${fmtBytes(outBlob.size)} • 100% Private`,
          downloadText: "Download Numbered PDF",
          toolName: "Page Number PDF",
          durationMs: Math.max(1, Math.round(performance.now() - startTime)),
          blob: outBlob,
          onSecondary: () => {
            if (resultsCard) {
              resultsCard.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          },
        });
      } else {
        downloadBlob(outBlob, lastGeneratedName);
        showToast(
          `Success! Numbered ${numberedCount} page(s) and downloaded "${lastGeneratedName}"`,
          "success",
          5000,
        );
      }
    } catch (err) {
      showLoadingModal(false);
      console.error("PDF page numbering error:", err);
      showToast(
        "Failed to add page numbers: " + (err.message || err),
        "error",
        6000,
      );
    }
  }

  /**
   * Transforms visual coordinate space to unrotated PDF page coordinates
   * for 0, 90, 180, and 270 degree rotated pages.
   */
  function calcPageDrawCoords(W, H, rot, vx, vy, textWidth, textHeight) {
    let textX, textY, textAngle;

    if (rot === 0) {
      textX = vx;
      textY = vy;
      textAngle = 0;
    } else if (rot === 90) {
      // Page is rotated 90° CW by viewer
      textX = W - vy;
      textY = vx;
      textAngle = 90;
    } else if (rot === 180) {
      // Page is rotated 180° by viewer
      textX = W - vx;
      textY = H - vy;
      textAngle = 180;
    } else if (rot === 270) {
      // Page is rotated 270° CW by viewer
      textX = vy;
      textY = H - vx;
      textAngle = 270;
    }

    return { textX, textY, textAngle };
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  }

  if (numberPdfBtn) {
    numberPdfBtn.addEventListener("click", generateNumberedPdf);
  }

  if (downloadResultBtn) {
    downloadResultBtn.addEventListener("click", () => {
      if (lastGeneratedBlob && lastGeneratedName) {
        downloadBlob(lastGeneratedBlob, lastGeneratedName);
      }
    });
  }

  if (modifyMoreBtn) {
    modifyMoreBtn.addEventListener("click", () => {
      if (workspace) {
        workspace.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  if (startOverBtn) {
    startOverBtn.addEventListener("click", () => {
      clearSessionFromDb();
      window.location.reload();
    });
  }

  // =============================================
  //  UPLOAD HANDLING & DROPZONE
  // =============================================
  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", () => fileInput.click());
  }
  if (changeFileBtn && fileInput) {
    changeFileBtn.addEventListener("click", () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        if (
          !file.name.toLowerCase().endsWith(".pdf") &&
          file.type !== "application/pdf"
        ) {
          showToast("Please select a valid PDF file.", "error");
          return;
        }
        loadPdfFile(file, file.name);
      }
    });
  }

  if (uploadZone) {
    uploadZone.addEventListener("click", (e) => {
      if (e.target !== browseBtn && !browseBtn.contains(e.target)) {
        fileInput.click();
      }
    });

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
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        if (
          !file.name.toLowerCase().endsWith(".pdf") &&
          file.type !== "application/pdf"
        ) {
          showToast("Please drop a valid PDF document.", "error");
          return;
        }
        loadPdfFile(file, file.name);
      }
    });
  }

  // Paste support
  window.addEventListener("paste", (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (
          file &&
          (file.type === "application/pdf" || file.name.endsWith(".pdf"))
        ) {
          loadPdfFile(file, file.name || "pasted_document.pdf");
          break;
        }
      }
    }
  });

  // =============================================
  //  HELPERS
  // =============================================
  function fmtBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 KB";
    const k = 1024;
    const dm = 1;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  // Check on load if an existing session can be recovered
  checkSavedSession();
})();
