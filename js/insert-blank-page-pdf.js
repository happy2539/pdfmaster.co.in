/**
 * PDFMaster - PDF Blank Page Inserter Tool Script
 * Production Grade · Low-RAM Architecture · In-Place Zero-Heap Insertion · 100% Client-Side
 */
(function () {
  "use strict";

  // =============================================
  //  PDF.js CONFIGURATION
  // =============================================
  const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
  if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
  }

  // =============================================
  //  CONSTANTS & CONFIG
  // =============================================
  const DB_NAME = "pdfmaster_blank_insert_db";
  const DB_VERSION = 1;
  const THEME_KEY = "pdfmaster-theme";
  const MAX_HISTORY = 25;

  // Standard Page Dimensions in Points (72 pt = 1 inch)
  const PAGE_SIZES = {
    a4: { name: "A4", w: 595.28, h: 841.89 },
    letter: { name: "US Letter", w: 612.0, h: 792.0 },
    legal: { name: "US Legal", w: 612.0, h: 1008.0 },
    a3: { name: "A3", w: 841.89, h: 1190.55 },
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
    pdfJsDoc: null,

    // Array of page descriptors in visual document order:
    // { type: 'original', pageNumber: 1, width: 595, height: 842, rotation: 0 }
    // { type: 'blank', id: 'b_xxx', sizePreset: 'match', width: 595, height: 842, orientation: 'portrait', style: 'plain' }
    items: [],

    // History for Undo/Redo
    history: [],
    future: [],

    // Grid sizing
    gridSize: "md", // "sm" | "md" | "lg"

    // Default settings for new blank pages
    defaultSettings: {
      sizePreset: "match", // "match" | "a4" | "letter" | "legal" | "a3" | "custom"
      style: "plain", // "plain" | "lined" | "dotgrid" | "graph"
      orientation: "auto", // "auto" | "portrait" | "landscape"
    },

    // Inspector
    inspectingIndex: 0,
  };

  let dbPromise = null;
  let dbSaveTimer = null;
  let toastTimer = null;
  let thumbnailObserver = null;
  const activeRenderTasks = new Map(); // cardId -> renderTask

  // Scroll throttling
  let scrollSettleTimer = null;
  let isHighSpeedScrolling = false;
  let lastScrollY = typeof window !== "undefined" ? window.scrollY : 0;
  let lastScrollTime = performance.now();
  const HIGH_SPEED_SCROLL_THRESHOLD = 0.5; // px / ms

  // Results State
  let lastGeneratedBlob = null;
  let lastGeneratedName = "";

  // Unique ID generator for blank pages
  let blankCounter = 0;
  function getUniqueBlankId() {
    return "b_" + Date.now() + "_" + ++blankCounter;
  }

  // =============================================
  //  DOM ELEMENTS
  // =============================================
  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const workspace = document.getElementById("workspace");
  const fileNameEl = document.getElementById("fileName");
  const fileSizeEl = document.getElementById("fileSize");
  const changeFileBtn = document.getElementById("changeFileBtn");
  const resetAllBtn = document.getElementById("resetAllBtn");

  // Toolbar & Controls
  const insertAtStartBtn = document.getElementById("insertAtStartBtn");
  const insertAtEndBtn = document.getElementById("insertAtEndBtn");
  const insertOddBtn = document.getElementById("insertOddBtn");
  const insertEvenBtn = document.getElementById("insertEvenBtn");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const gridSmBtn = document.getElementById("gridSmBtn");
  const gridMdBtn = document.getElementById("gridMdBtn");
  const gridLgBtn = document.getElementById("gridLgBtn");
  const defaultStyleSelect = document.getElementById("defaultStyleSelect");
  const intervalInput = document.getElementById("intervalInput");
  const applyIntervalBtn = document.getElementById("applyIntervalBtn");

  // Summary Banner & Grid
  const origSummaryCount = document.getElementById("origSummaryCount");
  const blankSummaryCount = document.getElementById("blankSummaryCount");
  const totalSummaryCount = document.getElementById("totalSummaryCount");
  const summaryBanner = document.getElementById("summaryBanner");
  const pagesGrid = document.getElementById("pagesGrid");

  // Sticky Action Bar
  const actionBarStats = document.getElementById("actionBarStats");
  const insertPdfBtn = document.getElementById("insertPdfBtn");

  // Modals
  const loadingModalOverlay = document.getElementById("loadingModalOverlay");
  const loadingModalTitle = document.getElementById("loadingModalTitle");
  const loadingBarFill = document.getElementById("loadingBarFill");
  const loadingStatusText = document.getElementById("loadingStatusText");
  const loadingPct = document.getElementById("loadingPct");

  const inspectModalOverlay = document.getElementById("inspectModalOverlay");
  const inspectModalTitle = document.getElementById("inspectModalTitle");
  const inspectCanvasWrapper = document.getElementById("inspectCanvasWrapper");
  const inspectCloseBtn = document.getElementById("inspectCloseBtn");
  const inspectPrevBtn = document.getElementById("inspectPrevBtn");
  const inspectNextBtn = document.getElementById("inspectNextBtn");

  // Results
  const resultsCard = document.getElementById("resultsCard");
  const statOrigPages = document.getElementById("statOrigPages");
  const statBlankAdded = document.getElementById("statBlankAdded");
  const statFinalPages = document.getElementById("statFinalPages");
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

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved);
    } else {
      const prefersDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(prefersDark ? "dark" : "light");
    }
    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme") || "light";
        applyTheme(cur === "dark" ? "light" : "dark");
      });
    }
  }

  // =============================================
  //  TOAST & FEEDBACK
  // =============================================
  function showToast(msg, duration = 3000) {
    if (!toastEl || !toastMsg) return;
    toastMsg.textContent = msg;
    toastEl.classList.add("active");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("active");
    }, duration);
  }

  function fmtBytes(bytes) {
    if (!bytes || bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  // =============================================
  //  INDEXEDDB SESSION RECOVERY
  // =============================================
  function getDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("sessions")) {
            db.createObjectStore("sessions", { keyPath: "id" });
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
      });
    }
    return dbPromise;
  }

  async function saveSessionToDB() {
    clearTimeout(dbSaveTimer);
    dbSaveTimer = setTimeout(async () => {
      if (!state.currentBlob || state.items.length === 0) return;
      try {
        const db = await getDB();
        const tx = db.transaction("sessions", "readwrite");
        const store = tx.objectStore("sessions");

        // Serialize items without DOM nodes
        const serializedItems = state.items.map((item) => {
          if (item.type === "original") {
            return {
              type: "original",
              pageNumber: item.pageNumber,
              width: item.width,
              height: item.height,
              rotation: item.rotation,
            };
          } else {
            return {
              type: "blank",
              id: item.id,
              sizePreset: item.sizePreset,
              width: item.width,
              height: item.height,
              orientation: item.orientation,
              style: item.style,
            };
          }
        });

        await store.put({
          id: "last_session",
          fileName: state.fileName,
          fileSize: state.fileSize,
          totalPages: state.totalPages,
          blob: state.currentBlob,
          items: serializedItems,
          timestamp: Date.now(),
        });
        if (recoveryBadge) recoveryBadge.style.display = "block";
      } catch (err) {
        console.warn("Failed to save session to IndexedDB:", err);
      }
    }, 600);
  }

  async function checkSessionRecovery() {
    try {
      const db = await getDB();
      const tx = db.transaction("sessions", "readonly");
      const store = tx.objectStore("sessions");
      const req = store.get("last_session");
      req.onsuccess = () => {
        const data = req.result;
        if (data && data.blob) {
          const hoursAgo = (Date.now() - data.timestamp) / (1000 * 60 * 60);
          if (hoursAgo < 48) {
            if (recoveryBadge) recoveryBadge.style.display = "block";
          }
        }
      };
    } catch (e) {
      console.warn("Session check skipped:", e);
    }
  }

  async function restoreSession() {
    try {
      const db = await getDB();
      const tx = db.transaction("sessions", "readonly");
      const store = tx.objectStore("sessions");
      const req = store.get("last_session");
      req.onsuccess = async () => {
        const data = req.result;
        if (!data || !data.blob) {
          showToast("No saved session found");
          return;
        }

        showToast("Restoring previous session…");
        await loadPdfFile(data.blob, data.fileName, data.items);
      };
    } catch (e) {
      showToast("Unable to restore session");
    }
  }

  // =============================================
  //  UNDO & REDO HISTORY STACK
  // =============================================
  function pushHistory() {
    // Clone minimal state of items
    const snapshot = JSON.stringify(state.items);
    state.history.push(snapshot);
    if (state.history.length > MAX_HISTORY) {
      state.history.shift();
    }
    state.future = [];
    updateHistoryButtons();
    saveSessionToDB();
  }

  function undo() {
    if (state.history.length === 0) return;
    const currentSnapshot = JSON.stringify(state.items);
    state.future.push(currentSnapshot);
    const prevSnapshot = state.history.pop();
    state.items = JSON.parse(prevSnapshot);
    updateHistoryButtons();
    renderGrid();
    updateSummary();
    saveSessionToDB();
    showToast("Action undone (Ctrl+Z)");
  }

  function redo() {
    if (state.future.length === 0) return;
    const currentSnapshot = JSON.stringify(state.items);
    state.history.push(currentSnapshot);
    const nextSnapshot = state.future.pop();
    state.items = JSON.parse(nextSnapshot);
    updateHistoryButtons();
    renderGrid();
    updateSummary();
    saveSessionToDB();
    showToast("Action redone (Ctrl+Y)");
  }

  function updateHistoryButtons() {
    if (undoBtn) undoBtn.disabled = state.history.length === 0;
    if (redoBtn) redoBtn.disabled = state.future.length === 0;
  }

  // =============================================
  //  SMART DIMENSION & ITEM FACTORY
  // =============================================
  function createBlankPageItem(targetIndex) {
    const preset = state.defaultSettings.sizePreset;
    const style = state.defaultSettings.style;
    const orientation = state.defaultSettings.orientation;

    let width = PAGE_SIZES.a4.w;
    let height = PAGE_SIZES.a4.h;

    if (preset === "match") {
      // Find nearest neighbor to copy dimensions
      let ref = null;
      if (targetIndex > 0 && state.items[targetIndex - 1]) {
        ref = state.items[targetIndex - 1];
      } else if (state.items[targetIndex]) {
        ref = state.items[targetIndex];
      }

      if (ref) {
        width = ref.width;
        height = ref.height;
      }
    } else if (PAGE_SIZES[preset]) {
      width = PAGE_SIZES[preset].w;
      height = PAGE_SIZES[preset].h;
    }

    // Apply explicit orientation if selected
    if (orientation === "landscape" && width < height) {
      const temp = width;
      width = height;
      height = temp;
    } else if (orientation === "portrait" && width > height) {
      const temp = width;
      width = height;
      height = temp;
    }

    return {
      type: "blank",
      id: getUniqueBlankId(),
      sizePreset: preset,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      orientation: width > height ? "landscape" : "portrait",
      style: style,
    };
  }

  function insertBlankPageAt(index) {
    pushHistory();
    const newItem = createBlankPageItem(index);
    state.items.splice(index, 0, newItem);
    renderGrid();
    updateSummary();
    showToast(`Blank page inserted at page ${index + 1}`);
  }

  function removeBlankPageById(id) {
    const idx = state.items.findIndex((item) => item.id === id);
    if (idx !== -1) {
      pushHistory();
      state.items.splice(idx, 1);
      renderGrid();
      updateSummary();
      showToast("Blank page removed");
    }
  }

  function duplicateBlankPage(id) {
    const idx = state.items.findIndex((item) => item.id === id);
    if (idx !== -1) {
      pushHistory();
      const orig = state.items[idx];
      const clone = {
        ...orig,
        id: getUniqueBlankId(),
      };
      state.items.splice(idx + 1, 0, clone);
      renderGrid();
      updateSummary();
      showToast("Blank page duplicated");
    }
  }

  // =============================================
  //  BATCH INSERTION ACTIONS
  // =============================================
  function insertAtStart() {
    insertBlankPageAt(0);
  }

  function insertAtEnd() {
    insertBlankPageAt(state.items.length);
  }

  function insertAfterOddPages() {
    if (!state.items.length) {
      showToast("No document loaded");
      return;
    }
    pushHistory();
    let origCount = 0;
    let insertions = 0;
    const newItems = [];

    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      newItems.push(item);

      if (item.type === "original") {
        origCount++;
        if (origCount % 2 !== 0) {
          const blank = {
            type: "blank",
            id: getUniqueBlankId(),
            sizePreset: "match",
            width: item.width,
            height: item.height,
            orientation: item.width > item.height ? "landscape" : "portrait",
            style: state.defaultSettings.style,
          };
          newItems.push(blank);
          insertions++;
        }
      }
    }

    state.items = newItems;
    renderGrid();
    updateSummary();
    saveSessionToDB();
    showToast(
      insertions > 0
        ? `Inserted ${insertions} blank page(s) after odd pages`
        : "No odd pages found",
    );
  }

  function insertAfterEvenPages() {
    if (!state.items.length) {
      showToast("No document loaded");
      return;
    }
    pushHistory();
    let origCount = 0;
    let insertions = 0;
    const newItems = [];

    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      newItems.push(item);

      if (item.type === "original") {
        origCount++;
        if (origCount % 2 === 0) {
          const blank = {
            type: "blank",
            id: getUniqueBlankId(),
            sizePreset: "match",
            width: item.width,
            height: item.height,
            orientation: item.width > item.height ? "landscape" : "portrait",
            style: state.defaultSettings.style,
          };
          newItems.push(blank);
          insertions++;
        }
      }
    }

    state.items = newItems;
    renderGrid();
    updateSummary();
    saveSessionToDB();
    showToast(
      insertions > 0
        ? `Inserted ${insertions} blank page(s) after even pages`
        : "No even pages found",
    );
  }

  function applyIntervalInsertion() {
    const interval = parseInt(intervalInput.value, 10);
    if (!interval || interval < 1) {
      showToast("Please enter a valid interval of 1 or more");
      return;
    }

    pushHistory();
    let origCount = 0;
    let insertions = 0;

    // Create a new array preserving order and inserting every N original pages
    const newItems = [];
    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      newItems.push(item);

      if (item.type === "original") {
        origCount++;
        if (origCount % interval === 0) {
          // Create blank item matching this original page
          const blank = {
            type: "blank",
            id: getUniqueBlankId(),
            sizePreset: "match",
            width: item.width,
            height: item.height,
            orientation: item.width > item.height ? "landscape" : "portrait",
            style: state.defaultSettings.style,
          };
          newItems.push(blank);
          insertions++;
        }
      }
    }

    state.items = newItems;
    renderGrid();
    updateSummary();
    saveSessionToDB();
    showToast(`Inserted ${insertions} blank page(s) after every ${interval} page(s)`);
  }

  function clearAllBlankPages() {
    const hasBlanks = state.items.some((item) => item.type === "blank");
    if (!hasBlanks) {
      showToast("No blank pages to remove");
      return;
    }

    pushHistory();
    state.items = state.items.filter((item) => item.type === "original");
    renderGrid();
    updateSummary();
    saveSessionToDB();
    showToast("All inserted blank pages removed");
  }

  // =============================================
  //  INTERACTIVE GRID RENDERING & THUMBNAILS
  // =============================================
  function updateSummary() {
    let origCount = 0;
    let blankCount = 0;

    state.items.forEach((item) => {
      if (item.type === "original") origCount++;
      else blankCount++;
    });

    const total = origCount + blankCount;

    if (origSummaryCount) origSummaryCount.textContent = origCount;
    if (blankSummaryCount) blankSummaryCount.textContent = "+" + blankCount;
    if (totalSummaryCount) totalSummaryCount.textContent = total;

    if (summaryBanner) {
      if (blankCount > 0) summaryBanner.classList.add("has-blank");
      else summaryBanner.classList.remove("has-blank");
    }

    if (actionBarStats) {
      actionBarStats.innerHTML = `<span>${blankCount}</span> blank page(s) added · Output: <span>${total}</span> pages`;
    }
  }

  function createInsertionSlotElement(index) {
    const slot = document.createElement("div");
    slot.className = "insertion-slot";
    slot.setAttribute("data-slot-index", index);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "insertion-slot-btn";
    btn.title = `Insert blank page at position ${index + 1}`;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      Insert Blank Page Here
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      insertBlankPageAt(index);
    });

    slot.appendChild(btn);
    return slot;
  }

  function renderGrid() {
    if (!pagesGrid) return;
    pagesGrid.innerHTML = "";

    // Cancel all running render tasks
    activeRenderTasks.forEach((task) => task && task.cancel && task.cancel());
    activeRenderTasks.clear();

    let outputPageCounter = 1;

    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      const pageIndex = i;

      // Card element
      const card = document.createElement("div");
      card.className =
        item.type === "blank" ? "page-card page-card--blank" : "page-card";
      card.setAttribute("data-item-index", pageIndex);

      if (item.type === "original") {
        // ORIGINAL PAGE CARD
        const isShifted = item.pageNumber !== outputPageCounter;
        const head = document.createElement("div");
        head.className = "page-card__head";
        head.innerHTML = `
          <div class="page-card__num">
            <span>Pg ${item.pageNumber}</span>
            <span class="page-card__now ${isShifted ? "is-shifted" : ""}">Now: Page ${outputPageCounter}</span>
          </div>
          <div class="page-card__actions">
            <button type="button" class="page-card__btn inspect-btn" title="Inspect full page" aria-label="Inspect page">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </div>
        `;

        const body = document.createElement("div");
        body.className = "page-card__body";
        body.innerHTML = `
          <div class="page-loading"><div class="page-loading-spinner"></div></div>
          <canvas class="page-canvas sr-hidden" width="200" height="280"></canvas>
        `;

        const foot = document.createElement("div");
        foot.className = "page-card__foot";
        foot.innerHTML = `
          <span>Now: Page ${outputPageCounter}</span>
          <div class="page-card__quick-add">
            <button type="button" class="btn-card-add add-before-btn" title="Insert blank before this page">+ Before</button>
            <button type="button" class="btn-card-add add-after-btn" title="Insert blank after this page">+ After</button>
          </div>
        `;

        // Card events
        body.addEventListener("click", () => openInspector(pageIndex));
        head.querySelector(".inspect-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          openInspector(pageIndex);
        });
        foot.querySelector(".add-before-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          insertBlankPageAt(pageIndex);
        });
        foot.querySelector(".add-after-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          insertBlankPageAt(pageIndex + 1);
        });

        card.appendChild(head);
        card.appendChild(body);
        card.appendChild(foot);

        // Register card with Low-RAM IntersectionObserver
        if (thumbnailObserver) {
          thumbnailObserver.observe(card);
        }
      } else {
        // BLANK PAGE CARD
        const head = document.createElement("div");
        head.className = "page-card__head";
        head.innerHTML = `
          <div class="page-card__num">
            <span>✨ Blank</span>
            <span class="page-card__now is-blank-now">Now: Page ${outputPageCounter}</span>
          </div>
          <div class="page-card__actions">
            <button type="button" class="btn-card-clone clone-blank-btn" title="Duplicate blank page" aria-label="Duplicate">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button type="button" class="btn-card-del del-blank-btn" title="Remove blank page" aria-label="Remove">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        `;

        const body = document.createElement("div");
        body.className = "page-card__body";

        // Render preview styling for template
        let previewClass = "blank-preview-plain";
        let labelText = "Blank Sheet";
        if (item.style === "lined") {
          previewClass = "blank-preview-lined";
          labelText = "Lined Notes";
        } else if (item.style === "dotgrid") {
          previewClass = "blank-preview-dotgrid";
          labelText = "Dot Grid";
        } else if (item.style === "graph") {
          previewClass = "blank-preview-graph";
          labelText = "Graph Paper";
        }

        body.innerHTML = `
          <div class="blank-preview-stage ${previewClass}">
            <svg class="blank-watermark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
              <line x1="9" y1="12" x2="15" y2="12"></line>
            </svg>
            <span class="blank-watermark-label">${labelText}</span>
          </div>
        `;

        const controls = document.createElement("div");
        controls.className = "blank-card-controls";
        controls.innerHTML = `
          <div class="blank-card-row">
            <select class="blank-select style-picker" aria-label="Template style">
              <option value="plain" ${item.style === "plain" ? "selected" : ""}>Plain Blank</option>
              <option value="lined" ${item.style === "lined" ? "selected" : ""}>Lined Notes</option>
              <option value="dotgrid" ${item.style === "dotgrid" ? "selected" : ""}>Dot Grid</option>
              <option value="graph" ${item.style === "graph" ? "selected" : ""}>Graph Paper</option>
            </select>
          </div>
          <div class="blank-card-row" style="font-size: 0.72rem; color: var(--text-3); justify-content: space-between;">
            <span>Now: Pg ${outputPageCounter}</span>
            <span>${Math.round(item.width)} × ${Math.round(item.height)} pt</span>
          </div>
        `;

        // Blank card events
        head.querySelector(".clone-blank-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          duplicateBlankPage(item.id);
        });
        head.querySelector(".del-blank-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          removeBlankPageById(item.id);
        });
        body.addEventListener("click", () => openInspector(pageIndex));

        const stylePicker = controls.querySelector(".style-picker");
        stylePicker.addEventListener("change", (e) => {
          pushHistory();
          item.style = e.target.value;
          renderGrid();
          saveSessionToDB();
        });

        card.appendChild(head);
        card.appendChild(body);
        card.appendChild(controls);
      }

      pagesGrid.appendChild(card);
      outputPageCounter++;
    }
  }

  // =============================================
  //  LOW-RAM THUMBNAIL RENDER ENGINE
  // =============================================
  function initThumbnailObserver() {
    if (typeof IntersectionObserver === "undefined") return;

    thumbnailObserver = new IntersectionObserver(
      (entries) => {
        if (isHighSpeedScrolling) return;

        entries.forEach((entry) => {
          const card = entry.target;
          const index = parseInt(card.getAttribute("data-item-index"), 10);
          if (isNaN(index)) return;

          const item = state.items[index];
          if (!item || item.type !== "original") return;

          if (entry.isIntersecting) {
            renderCardThumbnail(card, item);
          } else {
            // Free GPU texture RAM when scrolled far out of view
            const canvas = card.querySelector("canvas");
            if (canvas && canvas.getAttribute("data-rendered") === "true") {
              const ctx = canvas.getContext("2d");
              if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
              canvas.removeAttribute("data-rendered");
              const loading = card.querySelector(".page-loading");
              if (loading) loading.style.display = "flex";
            }
          }
        });
      },
      {
        rootMargin: "300px 0px",
        threshold: 0.05,
      },
    );
  }

  async function renderCardThumbnail(card, item) {
    const canvas = card.querySelector("canvas");
    const loading = card.querySelector(".page-loading");
    if (!canvas || !state.pdfJsDoc) return;
    if (canvas.getAttribute("data-rendered") === "true") return;

    try {
      const page = await state.pdfJsDoc.getPage(item.pageNumber);
      const viewport = page.getViewport({ scale: 0.6 });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d", { alpha: false });

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: viewport,
      });

      activeRenderTasks.set(item.pageNumber, renderTask);
      await renderTask.promise;
      activeRenderTasks.delete(item.pageNumber);

      canvas.setAttribute("data-rendered", "true");
      if (loading) loading.style.display = "none";
    } catch (err) {
      if (err && err.name !== "RenderingCancelledException") {
        console.warn("Thumbnail render error:", err);
      }
    }
  }

  // Velocity scroll throttle
  function initScrollThrottling() {
    window.addEventListener(
      "scroll",
      () => {
        const now = performance.now();
        const deltaT = now - lastScrollTime;
        const deltaY = Math.abs(window.scrollY - lastScrollY);

        if (deltaT > 0) {
          const speed = deltaY / deltaT;
          if (speed > HIGH_SPEED_SCROLL_THRESHOLD) {
            isHighSpeedScrolling = true;
          }
        }

        lastScrollY = window.scrollY;
        lastScrollTime = now;

        clearTimeout(scrollSettleTimer);
        scrollSettleTimer = setTimeout(() => {
          isHighSpeedScrolling = false;
          // Re-trigger viewport cards
          if (pagesGrid) {
            const cards = pagesGrid.querySelectorAll(".page-card");
            cards.forEach((card) => {
              const rect = card.getBoundingClientRect();
              if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
                const idx = parseInt(card.getAttribute("data-item-index"), 10);
                const item = state.items[idx];
                if (item && item.type === "original") {
                  renderCardThumbnail(card, item);
                }
              }
            });
          }
        }, 150);
      },
      { passive: true },
    );
  }

  // =============================================
  //  SINGLE PAGE INSPECTOR MODAL
  // =============================================
  async function openInspector(index) {
    if (index < 0 || index >= state.items.length) return;
    state.inspectingIndex = index;

    if (!inspectModalOverlay || !inspectCanvasWrapper) return;
    inspectModalOverlay.classList.add("active");

    const item = state.items[index];
    if (inspectModalTitle) {
      inspectModalTitle.textContent =
        item.type === "original"
          ? `Inspecting Original Page ${item.pageNumber}`
          : `Inspecting Blank Page (${item.style.toUpperCase()})`;
    }

    inspectCanvasWrapper.innerHTML = "";

    if (item.type === "original") {
      const canvas = document.createElement("canvas");
      canvas.className = "inspect-canvas";
      inspectCanvasWrapper.appendChild(canvas);

      try {
        const page = await state.pdfJsDoc.getPage(item.pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        inspectCanvasWrapper.innerHTML = "<p>Error loading full preview</p>";
      }
    } else {
      // Large vector styling preview for blank page
      const div = document.createElement("div");
      div.style.width = "400px";
      div.style.aspectRatio = `${item.width} / ${item.height}`;
      div.style.position = "relative";
      div.style.borderRadius = "8px";
      div.style.border = "1px solid var(--border)";
      div.style.overflow = "hidden";

      let previewClass = "blank-preview-plain";
      if (item.style === "lined") previewClass = "blank-preview-lined";
      else if (item.style === "dotgrid") previewClass = "blank-preview-dotgrid";
      else if (item.style === "graph") previewClass = "blank-preview-graph";

      div.innerHTML = `
        <div class="blank-preview-stage ${previewClass}">
          <span class="blank-watermark-label" style="font-size: 0.9rem;">${item.style.toUpperCase()} (${Math.round(item.width)} × ${Math.round(item.height)} pt)</span>
        </div>
      `;
      inspectCanvasWrapper.appendChild(div);
    }
  }

  function closeInspector() {
    if (inspectModalOverlay) inspectModalOverlay.classList.remove("active");
  }

  // =============================================
  //  PDF LOADING & INITIALIZATION
  // =============================================
  async function loadPdfFile(fileOrBlob, fileName, savedItems = null) {
    try {
      showLoadingProgress(10, "Reading document bytes locally…");
      state.fileName = fileName || fileOrBlob.name || "document.pdf";
      state.fileSize = fileOrBlob.size || 0;
      state.currentBlob = fileOrBlob;

      if (state.currentBlobUrl) URL.revokeObjectURL(state.currentBlobUrl);
      state.currentBlobUrl = URL.createObjectURL(fileOrBlob);

      showLoadingProgress(30, "Parsing PDF catalog…");
      const loadingTask = pdfjsLib.getDocument({
        url: state.currentBlobUrl,
        disableRange: false,
        disableStream: false,
      });

      state.pdfJsDoc = await loadingTask.promise;
      state.totalPages = state.pdfJsDoc.numPages;

      if (fileNameEl) fileNameEl.textContent = state.fileName;
      if (fileSizeEl) {
        fileSizeEl.innerHTML = `<span>${fmtBytes(state.fileSize)}</span> · <span id="totalCount">${state.totalPages}</span> pages`;
      }

      showLoadingProgress(60, "Measuring page geometry…");

      if (savedItems && Array.isArray(savedItems) && savedItems.length > 0) {
        // Restore saved items sequence
        state.items = savedItems;
      } else {
        // Initialize 1-to-1 items from original pages
        state.items = [];
        for (let i = 1; i <= state.totalPages; i++) {
          const page = await state.pdfJsDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          state.items.push({
            type: "original",
            pageNumber: i,
            width: viewport.width,
            height: viewport.height,
            rotation: page.rotate || 0,
          });
        }
      }

      state.history = [];
      state.future = [];
      updateHistoryButtons();

      showLoadingProgress(90, "Building interactive workspace…");
      renderGrid();
      updateSummary();

      // Reveal workspace
      if (uploadZone) uploadZone.style.display = "none";
      if (workspace) workspace.classList.add("active");
      if (resultsCard) resultsCard.classList.remove("active");

      showLoadingProgress(100, "Done!");
      hideLoadingProgress();
      saveSessionToDB();
    } catch (err) {
      console.error("PDF load error:", err);
      hideLoadingProgress();
      showToast("Error reading PDF. The file may be password-protected or corrupt.");
    }
  }

  function showLoadingProgress(pct, status) {
    if (loadingModalOverlay) loadingModalOverlay.classList.add("active");
    if (loadingBarFill) loadingBarFill.style.width = pct + "%";
    if (loadingPct) loadingPct.textContent = pct + "%";
    if (loadingStatusText) loadingStatusText.textContent = status;
  }

  function hideLoadingProgress() {
    setTimeout(() => {
      if (loadingModalOverlay) loadingModalOverlay.classList.remove("active");
    }, 200);
  }

  // =============================================
  //  LOSSLESS IN-PLACE PDF GENERATION & SAVE
  // =============================================
  function drawVectorTemplate(page, item) {
    const { rgb } = window.PDFLib;
    const w = item.width;
    const h = item.height;
    const style = item.style;

    const left = 54;
    const right = 54;
    const top = 72;
    const bottom = 54;

    if (style === "lined") {
      // College-ruled lined notes
      const lineSpacing = 26;
      const lineColor = rgb(0.82, 0.86, 0.9);
      const headerColor = rgb(0.92, 0.55, 0.55);

      // Top margin accent line
      page.drawLine({
        start: { x: left, y: h - top },
        end: { x: w - right, y: h - top },
        thickness: 1.5,
        color: headerColor,
      });

      for (let y = h - top - lineSpacing; y >= bottom; y -= lineSpacing) {
        page.drawLine({
          start: { x: left, y },
          end: { x: w - right, y },
          thickness: 0.65,
          color: lineColor,
        });
      }
    } else if (style === "dotgrid") {
      // Bullet journal dot grid
      const dotSpacing = 20;
      const dotColor = rgb(0.7, 0.74, 0.8);

      for (let x = left; x <= w - right; x += dotSpacing) {
        for (let y = bottom; y <= h - top; y += dotSpacing) {
          page.drawCircle({
            x,
            y,
            size: 0.8,
            color: dotColor,
          });
        }
      }
    } else if (style === "graph") {
      // Grid paper
      const gridSpacing = 18;
      const gridColor = rgb(0.85, 0.88, 0.92);

      for (let x = left; x <= w - right; x += gridSpacing) {
        page.drawLine({
          start: { x, y: bottom },
          end: { x, y: h - top },
          thickness: 0.5,
          color: gridColor,
        });
      }
      for (let y = bottom; y <= h - top; y += gridSpacing) {
        page.drawLine({
          start: { x: left, y },
          end: { x: w - right, y },
          thickness: 0.5,
          color: gridColor,
        });
      }
    }
  }

  async function generateAndDownloadPdf() {
    if (!state.currentBlob || state.items.length === 0) return;

    const startTime = performance.now();
    showLoadingProgress(10, "Reading original document buffer…");

    try {
      let srcBuffer = await state.currentBlob.arrayBuffer();

      showLoadingProgress(35, "Loading PDF catalog…");
      await new Promise((r) => setTimeout(r, 20));

      const PDFDocument = window.PDFLib.PDFDocument;
      let pdfDoc = await PDFDocument.load(srcBuffer, {
        ignoreEncryption: true,
        parseSpeed: Infinity,
        updateMetadata: false,
      });

      // FREE ORIGINAL BUFFER FROM MEMORY IMMEDIATELY!
      srcBuffer = null;

      showLoadingProgress(55, "Inserting blank pages in-place…");
      await new Promise((r) => setTimeout(r, 10));

      // In-place ascending insertion
      let blankInsertedCount = 0;
      for (let i = 0; i < state.items.length; i++) {
        const item = state.items[i];
        if (item.type === "blank") {
          const newPage = pdfDoc.insertPage(i, [item.width, item.height]);
          if (item.style !== "plain") {
            drawVectorTemplate(newPage, item);
          }
          blankInsertedCount++;

          if (blankInsertedCount % 5 === 0) {
            const pct = 55 + Math.round((i / state.items.length) * 25);
            showLoadingProgress(pct, `Inserted ${blankInsertedCount} blank pages…`);
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      }

      showLoadingProgress(85, "Serializing PDF structure losslessly…");
      await new Promise((r) => setTimeout(r, 15));

      let outputBytes = await pdfDoc.save({
        useObjectStreams: false,
        objectsPerTick: 150,
      });

      // Free PDFDocument AST from heap
      pdfDoc = null;

      showLoadingProgress(98, "Preparing download…");
      await new Promise((r) => setTimeout(r, 15));

      const outBlob = new Blob([outputBytes], { type: "application/pdf" });
      outputBytes = null;
      lastGeneratedBlob = outBlob;

      const baseName = state.fileName.replace(/\.[^/.]+$/, "");
      lastGeneratedName = `${baseName}-blank-pages-inserted.pdf`;

      showLoadingProgress(100, "Done!");
      hideLoadingProgress();

      // Update Results Card
      if (statOrigPages) statOrigPages.textContent = state.totalPages;
      if (statBlankAdded) statBlankAdded.textContent = blankInsertedCount;
      if (statFinalPages) statFinalPages.textContent = state.items.length;

      if (resultsCard) {
        resultsCard.classList.add("active");
        resultsCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      // Universal Thank You Modal & Conversion Tracker
      if (
        window.PDFMasterPopup &&
        typeof window.PDFMasterPopup.show === "function"
      ) {
        window.PDFMasterPopup.show({
          title: "Thank You for Using PDF<span>Master</span>!",
          desc: `Inserted <strong>${blankInsertedCount} blank page(s)</strong> into your document. Processed 100% locally with <strong>zero server uploads</strong>.`,
          fileName: lastGeneratedName,
          fileType: "pdf",
          fileDetails: `${state.items.length} pages total • ${fmtBytes(outBlob.size)} • 100% Private`,
          downloadText: "Download Modified PDF",
          toolName: "Insert Blank Page into PDF",
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
      }
    } catch (err) {
      console.error("PDF generation failed:", err);
      hideLoadingProgress();
      showToast("Error generating output PDF. Please try again.");
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // =============================================
  //  EVENT LISTENERS & BINDINGS
  // =============================================
  function initEventListeners() {
    // File inputs & drag/drop
    if (browseBtn) browseBtn.addEventListener("click", () => fileInput.click());
    if (uploadZone) {
      uploadZone.addEventListener("click", () => fileInput.click());
      uploadZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadZone.classList.add("drag-over");
      });
      uploadZone.addEventListener("dragleave", () =>
        uploadZone.classList.remove("drag-over"),
      );
      uploadZone.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadZone.classList.remove("drag-over");
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
            loadPdfFile(file);
          } else {
            showToast("Please select a valid PDF file");
          }
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files.length > 0) {
          loadPdfFile(e.target.files[0]);
        }
      });
    }

    if (changeFileBtn) {
      changeFileBtn.addEventListener("click", () => {
        if (fileInput) fileInput.click();
      });
    }

    if (resetAllBtn) resetAllBtn.addEventListener("click", clearAllBlankPages);

    // Toolbar buttons
    if (insertAtStartBtn) insertAtStartBtn.addEventListener("click", insertAtStart);
    if (insertAtEndBtn) insertAtEndBtn.addEventListener("click", insertAtEnd);
    if (insertOddBtn) insertOddBtn.addEventListener("click", insertAfterOddPages);
    if (insertEvenBtn) insertEvenBtn.addEventListener("click", insertAfterEvenPages);
    if (applyIntervalBtn) applyIntervalBtn.addEventListener("click", applyIntervalInsertion);

    // Settings
    if (defaultStyleSelect) {
      defaultStyleSelect.addEventListener("change", (e) => {
        state.defaultSettings.style = e.target.value;
      });
    }

    // History controls
    if (undoBtn) undoBtn.addEventListener("click", undo);
    if (redoBtn) redoBtn.addEventListener("click", redo);

    // Sizing
    if (gridSmBtn && gridMdBtn && gridLgBtn) {
      gridSmBtn.addEventListener("click", () => setGridSize("sm"));
      gridMdBtn.addEventListener("click", () => setGridSize("md"));
      gridLgBtn.addEventListener("click", () => setGridSize("lg"));
    }

    // Action button
    if (insertPdfBtn) {
      insertPdfBtn.addEventListener("click", generateAndDownloadPdf);
    }

    if (downloadResultBtn) {
      downloadResultBtn.addEventListener("click", () => {
        if (lastGeneratedBlob) {
          downloadBlob(lastGeneratedBlob, lastGeneratedName);
        }
      });
    }

    if (modifyMoreBtn) {
      modifyMoreBtn.addEventListener("click", () => {
        if (workspace) {
          workspace.scrollIntoView({ behavior: "smooth" });
        }
      });
    }

    if (startOverBtn) {
      startOverBtn.addEventListener("click", () => {
        if (workspace) workspace.classList.remove("active");
        if (resultsCard) resultsCard.classList.remove("active");
        if (uploadZone) uploadZone.style.display = "block";
        if (fileInput) fileInput.value = "";
        state.items = [];
      });
    }

    // Inspector
    if (inspectCloseBtn) inspectCloseBtn.addEventListener("click", closeInspector);
    if (inspectModalOverlay) {
      inspectModalOverlay.addEventListener("click", (e) => {
        if (e.target === inspectModalOverlay) closeInspector();
      });
    }
    if (inspectPrevBtn) {
      inspectPrevBtn.addEventListener("click", () => {
        if (state.inspectingIndex > 0) openInspector(state.inspectingIndex - 1);
      });
    }
    if (inspectNextBtn) {
      inspectNextBtn.addEventListener("click", () => {
        if (state.inspectingIndex < state.items.length - 1) {
          openInspector(state.inspectingIndex + 1);
        }
      });
    }

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        closeInspector();
      }
    });

    // Session recovery
    if (recoveryBtn) recoveryBtn.addEventListener("click", restoreSession);

    // Mobile Hamburger
    if (hamburgerBtn && sideMenu && sideOverlay && closeMenuBtn) {
      hamburgerBtn.addEventListener("click", () => {
        sideMenu.classList.add("active");
        sideOverlay.classList.add("active");
      });
      closeMenuBtn.addEventListener("click", () => {
        sideMenu.classList.remove("active");
        sideOverlay.classList.remove("active");
      });
      sideOverlay.addEventListener("click", () => {
        sideMenu.classList.remove("active");
        sideOverlay.classList.remove("active");
      });
    }

    // Back to top
    if (backTop) {
      window.addEventListener("scroll", () => {
        if (window.scrollY > 400) backTop.classList.add("active");
        else backTop.classList.remove("active");
      });
      backTop.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    // FAQ Accordion
    const faqItems = document.querySelectorAll(".faq-item");
    faqItems.forEach((item) => {
      const btn = item.querySelector(".faq-btn");
      if (btn) {
        btn.addEventListener("click", () => {
          const isActive = item.classList.contains("active");
          faqItems.forEach((f) => {
            f.classList.remove("active");
            const b = f.querySelector(".faq-btn");
            if (b) b.setAttribute("aria-expanded", "false");
          });
          if (!isActive) {
            item.classList.add("active");
            btn.setAttribute("aria-expanded", "true");
          }
        });
      }
    });
  }

  function setGridSize(size) {
    state.gridSize = size;
    [gridSmBtn, gridMdBtn, gridLgBtn].forEach((b) => b && b.classList.remove("active"));
    if (size === "sm" && gridSmBtn) gridSmBtn.classList.add("active");
    if (size === "md" && gridMdBtn) gridMdBtn.classList.add("active");
    if (size === "lg" && gridLgBtn) gridLgBtn.classList.add("active");

    if (pagesGrid) {
      pagesGrid.className = `pages-grid grid-${size}`;
    }
  }

  // =============================================
  //  INIT
  // =============================================
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initThumbnailObserver();
    initScrollThrottling();
    initEventListeners();
    checkSessionRecovery();
  });
})();
