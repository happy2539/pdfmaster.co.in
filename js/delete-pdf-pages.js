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
  const DB_NAME = "pdfmaster_delete_db";
  const DB_VERSION = 1;
  const THEME_KEY = "pdfmaster-theme";

  // =============================================
  //  APPLICATION STATE
  // =============================================
  const state = {
    fileName: "document.pdf",
    fileSize: 0,
    totalPages: 0,
    currentBlob: null, // Active File or Blob (zero-heap descriptor)
    currentBlobUrl: null, // Object URL for streaming range requests
    hasPersistedBlob: false,
    deletedPages: new Set(), // 1-based page numbers marked for deletion
    history: [], // Undo stack
    future: [], // Redo stack
    currentFilter: "all", // "all" | "keep" | "delete"
    gridSize: "md", // "sm" | "md" | "lg"
    pdfJsDoc: null,
    inspectingPage: 1,
    isDedicatedRendering: false, // True when full CPU & RAM are dedicated to active PDF rendering
  };

  let dbPromise = null;
  let dbSaveTimer = null;
  let toastTimer = null;
  let thumbnailObserver = null;
  const renderQueue = [];
  let isRenderingQueue = false;
  let currentInspectPageProxy = null;
  let currentInspectRenderTask = null;
  const inspectCache = new Map(); // Fast LRU preview cache: pageNum -> dataUrl

  // High-Speed Scrolling & Viewport Buffering State
  let scrollSettleTimer = null;
  let isHighSpeedScrolling = false;
  let lastScrollY = typeof window !== "undefined" ? window.scrollY : 0;
  let lastScrollTime = performance.now();
  const HIGH_SPEED_SCROLL_THRESHOLD = 0.5; // px / ms velocity threshold
  const SCROLL_BUFFER_MS = 200; // 200ms buffer for high-speed scrolling

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

  // Controls & Inputs
  const rangeInput = document.getElementById("rangeInput");
  const applyRangeBtn = document.getElementById("applyRangeBtn");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const keepAllBtn = document.getElementById("keepAllBtn");
  const invertBtn = document.getElementById("invertBtn");
  const oddPagesBtn = document.getElementById("oddPagesBtn");
  const evenPagesBtn = document.getElementById("evenPagesBtn");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const filterTabs = document.querySelectorAll(".filter-tab");
  const gridSmBtn = document.getElementById("gridSmBtn");
  const gridMdBtn = document.getElementById("gridMdBtn");
  const gridLgBtn = document.getElementById("gridLgBtn");

  // Summary Banner
  const summaryBanner = document.getElementById("summaryBanner");
  const deletedCountEl = document.getElementById("deletedCount");
  const keptCountEl = document.getElementById("keptCount");
  const totalCountEl = document.getElementById("totalCount");

  // Grid & Action Bar
  const pagesGrid = document.getElementById("pagesGrid");
  const deletePdfBtn = document.getElementById("deletePdfBtn");
  const actionSummaryText = document.getElementById("actionSummaryText");

  // Modal: Loading Progress
  const loadingModalOverlay = document.getElementById("loadingModalOverlay");
  const loadingModalTitle = document.getElementById("loadingModalTitle");
  const loadingModalSub = document.getElementById("loadingModalSub");
  const loadingBarFill = document.getElementById("loadingBarFill");
  const loadingStatusText = document.getElementById("loadingStatusText");
  const loadingPct = document.getElementById("loadingPct");
  const loadingModeTag = document.getElementById("loadingModeTag");

  // Modal: Page Inspector
  const inspectModalOverlay = document.getElementById("inspectModalOverlay");
  const inspectModalTitle = document.getElementById("inspectModalTitle");
  const inspectModalBody = document.getElementById("inspectModalBody");
  const inspectCloseBtn = document.getElementById("inspectCloseBtn");
  const inspectPrevBtn = document.getElementById("inspectPrevBtn");
  const inspectNextBtn = document.getElementById("inspectNextBtn");
  const inspectToggleBtn = document.getElementById("inspectToggleBtn");

  // Results Section
  const resultsCard = document.getElementById("resultsCard");
  const origPagesStat = document.getElementById("origPagesStat");
  const newPagesStat = document.getElementById("newPagesStat");
  const newSizeStat = document.getElementById("newSizeStat");
  const downloadResultBtn = document.getElementById("downloadResultBtn");
  const deleteMoreBtn = document.getElementById("deleteMoreBtn");
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

  let lastGeneratedBlob = null;
  let lastGeneratedName = "";

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
  //  MOBILE SIDE MENU
  // =============================================
  function openSideMenu() {
    if (sideMenu) sideMenu.classList.add("open");
    if (sideOverlay) sideOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeSideMenu() {
    if (sideMenu) sideMenu.classList.remove("open");
    if (sideOverlay) sideOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  if (hamburgerBtn) hamburgerBtn.addEventListener("click", openSideMenu);
  if (closeMenuBtn) closeMenuBtn.addEventListener("click", closeSideMenu);
  if (sideOverlay) sideOverlay.addEventListener("click", closeSideMenu);
  if (sideMenu) {
    sideMenu
      .querySelectorAll("a")
      .forEach((a) => a.addEventListener("click", closeSideMenu));
  }

  // =============================================
  //  BACK TO TOP
  // =============================================
  if (backTop) {
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

  // =============================================
  //  FAQ ACCORDION
  // =============================================
  document.querySelectorAll(".faq-q").forEach((q) => {
    q.addEventListener("click", () => {
      const item = q.parentElement;
      const isOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach((i) => {
        i.classList.remove("open");
        const headerBtn = i.querySelector(".faq-q");
        if (headerBtn) headerBtn.setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        item.classList.add("open");
        q.setAttribute("aria-expanded", "true");
      }
    });
    q.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        q.click();
      }
    });
  });

  // =============================================
  //  TOAST SYSTEM
  // =============================================
  function showToast(
    msg,
    type = "info",
    dur = 3500,
    onClick = null,
    actionText = null,
  ) {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastMsg.textContent = msg;

    if (toastIcon) {
      if (type === "success") {
        toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      } else if (type === "error") {
        toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
      } else if (type === "warning") {
        toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      } else {
        toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      }
    }

    const existingBtn = toastEl.querySelector(".toast-btn");
    if (existingBtn) existingBtn.remove();

    if (actionText && typeof onClick === "function") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toast-btn";
      btn.textContent = actionText;
      btn.onclick = (e) => {
        e.stopPropagation();
        toastEl.classList.remove("show");
        onClick();
      };
      toastEl.appendChild(btn);
    }

    toastEl.className = `toast ${type}`;
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), dur);
  }

  // =============================================
  //  INDEXEDDB RECOVERY & LOW-RAM STORAGE
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
        if (!db.objectStoreNames.contains("delete_data")) {
          db.createObjectStore("delete_data");
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  // Persists the raw File/Blob ONCE. IndexedDB stores Blobs natively on disk without holding them in JS heap.
  async function persistBlobToDB(blob, name) {
    try {
      const db = await openDB();
      const tx = db.transaction(["delete_data"], "readwrite");
      tx.objectStore("delete_data").put(
        {
          fileName: name,
          fileSize: blob.size,
          blob: blob, // Natively stored as disk-backed Blob!
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
      return true;
    } catch (err) {
      console.warn("Blob persist error:", err);
      return false;
    }
  }

  function scheduleDBSave() {
    if (dbSaveTimer) clearTimeout(dbSaveTimer);
    dbSaveTimer = setTimeout(() => {
      saveSessionToDB();
    }, 300);
  }

  // Only saves lightweight metadata (deleted page numbers) on every action — NO HEAVY BLOB REWRITING!
  async function saveSessionToDB() {
    if (!state.fileName || (!state.currentBlob && !state.hasPersistedBlob))
      return false;
    try {
      const db = await openDB();
      const tx = db.transaction(["settings"], "readwrite");
      const settingsStore = tx.objectStore("settings");

      const sessionData = {
        timestamp: Date.now(),
        fileName: state.fileName,
        fileSize: state.fileSize,
        totalPages: state.totalPages,
        deletedPages: Array.from(state.deletedPages),
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
      const tx = db.transaction(["settings", "delete_data"], "readonly");
      const settingsReq = tx.objectStore("settings").get("session");
      const dataReq = tx.objectStore("delete_data").get("file");

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

      // Reconstruct Blob reference (handles both native Blob and legacy ArrayBuffer if any)
      const blob =
        data.blob ||
        (data.bytes
          ? new Blob([data.bytes], { type: "application/pdf" })
          : null);
      if (!blob) return false;

      const delPages =
        session && Array.isArray(session.deletedPages)
          ? session.deletedPages
          : [];

      await loadPdfFromBlob(blob, data.fileName || "document.pdf", delPages);

      if (isManual) {
        showToast(
          `Restored "${state.fileName}" with ${state.deletedPages.size} page(s) marked for deletion!`,
          "success",
        );
      }
      return true;
    } catch (err) {
      showLoadingModal(false);
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
      const tx = db.transaction(["settings", "delete_data"], "readwrite");
      tx.objectStore("settings").clear();
      tx.objectStore("delete_data").clear();
      updateRecoveryBadge(false);
    } catch (err) {
      console.warn("IndexedDB clear failed:", err);
    }
  }

  async function checkStoredSessionAvailable(notifyOnFound = false) {
    try {
      const db = await openDB();
      const tx = db.transaction(["delete_data"], "readonly");
      const req = tx.objectStore("delete_data").get("file");
      const data = await new Promise((res) => {
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });

      const hasData = !!(data && (data.blob || data.bytes));
      updateRecoveryBadge(hasData);

      if (hasData && notifyOnFound && !state.pdfJsDoc) {
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
    if (recoveryBadge) {
      recoveryBadge.style.display = hasData ? "block" : "none";
    }
  }

  if (recoveryBtn) {
    recoveryBtn.addEventListener("click", () => {
      loadSessionFromDB(true);
    });
  }

  // =============================================
  //  LOADING PROGRESS POPUP
  // =============================================
  function showLoadingModal(
    show,
    title = "Processing…",
    sub = "",
    pct = 0,
    modeText = "",
  ) {
    if (!loadingModalOverlay) return;
    if (show) {
      if (loadingModalTitle) loadingModalTitle.textContent = title;
      if (loadingModalSub) loadingModalSub.textContent = sub;
      if (loadingPct) loadingPct.textContent = `${Math.round(pct)}%`;
      if (loadingBarFill) loadingBarFill.style.width = `${Math.round(pct)}%`;
      if (loadingModeTag) {
        if (modeText) {
          loadingModeTag.textContent = modeText;
          loadingModeTag.style.display = "inline-block";
        } else {
          loadingModeTag.style.display = "none";
        }
      }
      loadingModalOverlay.classList.add("open");
    } else {
      loadingModalOverlay.classList.remove("open");
    }
  }

  function updateLoadingProgress(pct, statusText = "") {
    if (loadingPct) loadingPct.textContent = `${Math.round(pct)}%`;
    if (loadingBarFill) loadingBarFill.style.width = `${Math.round(pct)}%`;
    if (loadingStatusText && statusText)
      loadingStatusText.textContent = statusText;
  }

  // =============================================
  //  DOCUMENT CLEANUP & LIFECYCLE
  // =============================================
  function destroyCurrentDoc() {
    if (scrollSettleTimer) {
      clearTimeout(scrollSettleTimer);
      scrollSettleTimer = null;
    }
    isHighSpeedScrolling = false;

    if (thumbnailObserver) {
      thumbnailObserver.disconnect();
      thumbnailObserver = null;
    }
    renderQueue.length = 0;
    isRenderingQueue = false;

    if (currentInspectRenderTask) {
      try {
        currentInspectRenderTask.cancel();
      } catch (e) {}
      currentInspectRenderTask = null;
    }

    if (currentInspectPageProxy) {
      try {
        currentInspectPageProxy.cleanup();
      } catch (e) {}
      currentInspectPageProxy = null;
    }
    inspectCache.clear();

    if (state.pdfJsDoc) {
      try {
        state.pdfJsDoc.destroy();
      } catch (e) {}
      state.pdfJsDoc = null;
    }

    if (state.currentBlobUrl) {
      URL.revokeObjectURL(state.currentBlobUrl);
      state.currentBlobUrl = null;
    }

    state.currentBlob = null;
    state.hasPersistedBlob = false;
  }

  // =============================================
  //  DEDICATED RESOURCE CONTROL (MINIMAL BACKGROUND TASKS)
  // =============================================
  function enterDedicatedRenderMode() {
    state.isDedicatedRendering = true;
    document.body.classList.add("rendering-mode");

    // 1. Immediately disconnect and halt thumbnail observer & rendering queue
    if (thumbnailObserver) {
      thumbnailObserver.disconnect();
    }
    renderQueue.length = 0;
    isRenderingQueue = false;

    // 2. Immediately stop any preview / inspector tasks & clear cache
    if (currentInspectRenderTask) {
      try {
        currentInspectRenderTask.cancel();
      } catch (e) {}
      currentInspectRenderTask = null;
    }
    if (currentInspectPageProxy) {
      try {
        currentInspectPageProxy.cleanup();
      } catch (e) {}
      currentInspectPageProxy = null;
    }
    if (inspectModalOverlay && inspectModalOverlay.classList.contains("open")) {
      closeInspector();
    }
    inspectCache.clear();

    // 3. Halt background persistence & scroll timers
    if (dbSaveTimer) {
      clearTimeout(dbSaveTimer);
      dbSaveTimer = null;
    }
    if (scrollSettleTimer) {
      clearTimeout(scrollSettleTimer);
      scrollSettleTimer = null;
    }
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    // 4. Instruct PDF.js to release all cached glyphs, images, and fonts
    if (state.pdfJsDoc) {
      try {
        state.pdfJsDoc.cleanup();
      } catch (e) {}
    }
  }

  function exitDedicatedRenderMode() {
    state.isDedicatedRendering = false;
    document.body.classList.remove("rendering-mode");

    // Re-initialize lazy thumbnail grid if user is still in active workspace
    if (state.pdfJsDoc && workspace && workspace.classList.contains("active")) {
      initLazyThumbnailGrid();
    }
  }

  // =============================================
  //  ZERO-RAM FILE UPLOAD & STREAMING PIPELINE
  // =============================================
  uploadZone.addEventListener("click", (e) => {
    if (e.target !== browseBtn) fileInput.click();
  });

  uploadZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput.click();
  });

  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = "";
  });

  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });

  uploadZone.addEventListener("dragleave", () => {
    uploadZone.classList.remove("drag-over");
  });

  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  async function handleFile(file) {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      showToast("Please select a valid PDF file.", "error");
      return;
    }

    // Load PDF first so all CPU/RAM resources are dedicated to parsing and rendering pages
    await loadPdfFromBlob(file, file.name);

    // Persist File/Blob to IndexedDB only when system is completely idle
    const idlePersist = () => {
      if (!state.hasPersistedBlob && state.currentBlob) {
        persistBlobToDB(state.currentBlob, state.fileName);
      }
    };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(idlePersist, { timeout: 4000 });
    } else {
      setTimeout(idlePersist, 2000);
    }
  }

  // Core Zero-RAM Streaming Loader
  async function loadPdfFromBlob(blob, fileName, initialDeletedPages = []) {
    destroyCurrentDoc();

    state.fileName = fileName;
    state.fileSize = blob.size;
    state.currentBlob = blob;
    state.deletedPages = new Set(initialDeletedPages);
    state.history = [];
    state.future = [];

    showLoadingModal(
      true,
      "Opening PDF Document…",
      `Reading "${truncateFilename(fileName, 28)}" (${fmtBytes(blob.size)})…`,
      25,
      "⚡ Low-RAM Streaming Mode Active",
    );

    try {
      // Create a blob URL for PDF.js to stream chunks via native range requests
      state.currentBlobUrl = URL.createObjectURL(blob);

      // PDF.js configured for low RAM streaming — NEVER load all pages into memory at once!
      const loadingTask = pdfjsLib.getDocument({
        url: state.currentBlobUrl,
        disableAutoFetch: true, // Prevents reading whole document into memory!
        disableStream: false, // Stream range chunks on demand
        rangeChunkSize: 65536, // 64 KB chunks
        maxImageSize: 2 * 1024 * 1024,
        cMapPacked: true,
      });

      state.pdfJsDoc = await loadingTask.promise;
      state.totalPages = state.pdfJsDoc.numPages;

      if (state.totalPages === 0) {
        throw new Error("This PDF contains 0 pages or is damaged.");
      }

      updateLoadingProgress(80, "Building document workspace…");
      await new Promise((r) => setTimeout(r, 20));

      updateFileInfo();
      uploadZone.style.display = "none";
      workspace.classList.add("active");
      if (resultsCard) resultsCard.classList.remove("active");

      showLoadingModal(false);

      // Initialize virtualized lazy thumbnail grid with IntersectionObserver
      initLazyThumbnailGrid();
      updateSummary();
      updateHistoryButtons();
      scheduleDBSave();

      showToast(`Loaded "${fileName}" (${state.totalPages} pages)`);
    } catch (err) {
      showLoadingModal(false);
      console.error(err);
      showToast(
        "Could not open PDF: " + (err.message || "Encrypted or corrupted file"),
        "error",
        5000,
      );
    }
  }

  function updateFileInfo() {
    if (fileNameEl) fileNameEl.textContent = state.fileName;
    if (fileSizeEl) {
      fileSizeEl.innerHTML = `<span>${fmtBytes(state.fileSize)}</span> · <span id="totalCount">${state.totalPages}</span> total pages`;
    }
    if (ramBadgeEl) {
      ramBadgeEl.className = "badge-low-ram";
      ramBadgeEl.textContent = "⚡ Low-RAM Active";
      ramBadgeEl.title =
        "Low-RAM Architecture Active: Blob streaming & virtualized on-demand thumbnail rendering.";
    }
  }

  // =============================================
  //  VIEWPORT DETECTION & DYNAMIC PRIORITY QUEUE
  // =============================================
  function isElementInViewport(el) {
    if (!el || !el.isConnected || el.classList.contains("filter-hidden")) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    return (
      rect.bottom > 0 &&
      rect.top < vh &&
      rect.right > 0 &&
      rect.left < vw
    );
  }

  function getCardViewportPriority(el) {
    if (!el || !el.isConnected || el.classList.contains("filter-hidden")) {
      return { tier: 3, dist: Infinity };
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return { tier: 3, dist: Infinity };
    }
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;

    const inViewport = (
      rect.bottom > 0 &&
      rect.top < vh &&
      rect.right > 0 &&
      rect.left < vw
    );

    if (inViewport) {
      // Tier 0: Directly on the user's screen right now!
      // Priority sorted by distance to the vertical center of the viewport
      const elCenter = rect.top + rect.height / 2;
      const screenCenter = vh / 2;
      const dist = Math.abs(elCenter - screenCenter);
      return { tier: 0, dist };
    }

    // Tier 1: Near screen (within 400px margin above or below the viewport)
    const isNear = rect.bottom >= -400 && rect.top <= vh + 400;
    if (isNear) {
      const dist = rect.top >= vh ? (rect.top - vh) : Math.abs(rect.bottom);
      return { tier: 1, dist };
    }

    // Tier 2: Far outside viewport (scrolled past or far ahead)
    const dist = rect.top >= vh ? (rect.top - vh) : Math.abs(rect.bottom);
    return { tier: 2, dist };
  }

  function sortQueueByViewportPriority() {
    if (renderQueue.length <= 1) return;

    renderQueue.sort((a, b) => {
      const prioA = getCardViewportPriority(a.cardEl);
      const prioB = getCardViewportPriority(b.cardEl);

      if (prioA.tier !== prioB.tier) {
        return prioA.tier - prioB.tier;
      }
      return prioA.dist - prioB.dist;
    });
  }

  // =============================================
  //  HIGH-SPEED SCROLL BUFFER (200MS DEBOUNCE)
  // =============================================
  function onScrollSettled() {
    isHighSpeedScrolling = false;
    if (!pagesGrid || !state.pdfJsDoc || state.isDedicatedRendering) return;

    // 1. Ensure any cards CURRENTLY on the user's screen are queued
    const cards = pagesGrid.querySelectorAll(".page-card:not([data-rendered='true'])");
    cards.forEach((card) => {
      if (isElementInViewport(card)) {
        const pageNum = parseInt(card.dataset.page, 10);
        if (!renderQueue.some((item) => item.pageNum === pageNum)) {
          if (thumbnailObserver) thumbnailObserver.unobserve(card);
          renderQueue.push({ pageNum, cardEl: card });
        }
      }
    });

    // 2. Prune far off-screen cards (> 500px) that were skipped during fast scroll
    if (thumbnailObserver) {
      for (let i = renderQueue.length - 1; i >= 0; i--) {
        const item = renderQueue[i];
        const prio = getCardViewportPriority(item.cardEl);
        if (prio.tier === 2) {
          thumbnailObserver.observe(item.cardEl);
          renderQueue.splice(i, 1);
        }
      }
    }

    // 3. Sort so that visible screen cards are at the head of the queue
    sortQueueByViewportPriority();

    // 4. Start rendering
    processThumbnailQueue();
  }

  function handleWindowScroll() {
    if (!state.pdfJsDoc || !pagesGrid) return;

    const now = performance.now();
    const dt = Math.max(1, now - lastScrollTime);
    const currentScrollY = window.scrollY;
    const deltaY = Math.abs(currentScrollY - lastScrollY);
    const velocity = deltaY / dt;

    if (velocity >= HIGH_SPEED_SCROLL_THRESHOLD || deltaY >= 80) {
      isHighSpeedScrolling = true;
    }

    lastScrollY = currentScrollY;
    lastScrollTime = now;

    // 200ms buffer in case of high-speed scrolling
    clearTimeout(scrollSettleTimer);
    scrollSettleTimer = setTimeout(() => {
      onScrollSettled();
    }, SCROLL_BUFFER_MS);
  }

  window.addEventListener("scroll", handleWindowScroll, { passive: true });
  window.addEventListener(
    "resize",
    () => {
      if (!state.pdfJsDoc || !pagesGrid) return;
      clearTimeout(scrollSettleTimer);
      scrollSettleTimer = setTimeout(onScrollSettled, 150);
    },
    { passive: true },
  );

  // =============================================
  //  LAZY THUMBNAIL GRID (INTERSECTION OBSERVER)
  // =============================================
  function initLazyThumbnailGrid() {
    if (!pagesGrid || !state.pdfJsDoc) return;
    pagesGrid.innerHTML = "";

    if (thumbnailObserver) {
      thumbnailObserver.disconnect();
    }

    // IntersectionObserver ensures thumbnails ONLY render when scrolled into view!
    thumbnailObserver = new IntersectionObserver(
      (entries, observer) => {
        let hasNewCards = false;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const card = entry.target;
            if (card.dataset.rendered === "true") {
              observer.unobserve(card);
              return;
            }
            const pageNum = parseInt(card.dataset.page, 10);
            observer.unobserve(card);
            if (!renderQueue.some((item) => item.pageNum === pageNum)) {
              renderQueue.push({ pageNum, cardEl: card });
              hasNewCards = true;
            }
          }
        });

        if (hasNewCards) {
          sortQueueByViewportPriority();
          if (!isHighSpeedScrolling) {
            processThumbnailQueue();
          }
        }
      },
      {
        root: null, // Viewport
        rootMargin: "300px 0px", // Pre-render 300px before scrolling into view
        threshold: 0.01,
      },
    );

    // Create lightweight card shells (Takes ~5ms even for 1,000 pages!)
    const fragment = document.createDocumentFragment();
    for (let p = 1; p <= state.totalPages; p++) {
      const card = createPageCard(p);
      fragment.appendChild(card);
      thumbnailObserver.observe(card);
    }
    pagesGrid.appendChild(fragment);

    applyViewFilter();

    // Immediately queue and render visible on-screen cards first
    onScrollSettled();
  }

  function createPageCard(pageNum) {
    const isDeleted = state.deletedPages.has(pageNum);
    const card = document.createElement("div");
    card.className = `page-card${isDeleted ? " deleted" : ""}`;
    card.setAttribute("role", "listitem");
    card.setAttribute("tabindex", "0");
    card.setAttribute(
      "aria-label",
      `Page ${pageNum} ${isDeleted ? "marked for deletion" : "preserved"}`,
    );
    card.dataset.page = String(pageNum);
    card.dataset.rendered = "false";

    card.innerHTML = `
      <div class="page-card__head">
        <span class="page-card__num">Page ${pageNum}</span>
        <button type="button" class="page-card__inspect" title="Zoom / Inspect Page ${pageNum}" aria-label="Zoom page ${pageNum}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="11" y1="8" x2="11" y2="14"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
      </div>
      <div class="page-card__body">
        <div class="page-loading">
          <div class="spinner"></div>
          <span>Page ${pageNum}</span>
        </div>
        <div class="page-card__del-overlay" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
          <span>TO BE DELETED</span>
        </div>
      </div>
      <div class="page-card__footer">
        <button type="button" class="page-action-btn" aria-label="${isDeleted ? "Restore page " + pageNum : "Delete page " + pageNum}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            ${
              isDeleted
                ? `<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>`
                : `<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>`
            }
          </svg>
          <span>${isDeleted ? "Restore Page" : "Delete Page"}</span>
        </button>
      </div>
    `;

    card.querySelector(".page-card__body").addEventListener("click", () => {
      togglePageDeletion(pageNum);
    });

    card.querySelector(".page-action-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      togglePageDeletion(pageNum);
    });

    card.querySelector(".page-card__inspect").addEventListener("click", (e) => {
      e.stopPropagation();
      openInspector(pageNum);
    });

    card.addEventListener("keydown", (e) => {
      if (e.target === card && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        togglePageDeletion(pageNum);
      }
    });

    return card;
  }

  function renderCardThumbnail(pageNum, cardEl) {
    if (!cardEl || cardEl.dataset.rendered === "true") return;
    if (renderQueue.some((item) => item.pageNum === pageNum)) return;

    renderQueue.push({ pageNum, cardEl });
    sortQueueByViewportPriority();

    if (isHighSpeedScrolling) return;
    processThumbnailQueue();
  }

  // Dynamic priority thumbnail processing with instant canvas backing store deallocation
  async function processThumbnailQueue() {
    if (
      isRenderingQueue ||
      renderQueue.length === 0 ||
      !state.pdfJsDoc ||
      state.isDedicatedRendering ||
      (inspectModalOverlay && inspectModalOverlay.classList.contains("open"))
    )
      return;
    isRenderingQueue = true;

    while (renderQueue.length > 0) {
      // Yield immediately if dedicated rendering or preview loading is active
      if (
        isHighSpeedScrolling ||
        state.isDedicatedRendering ||
        (inspectModalOverlay && inspectModalOverlay.classList.contains("open"))
      ) {
        isRenderingQueue = false;
        return;
      }

      // Dynamic viewport prioritization:
      // Always select the page CURRENTLY visible on screen first!
      let bestIdx = 0;
      let bestPrio = getCardViewportPriority(renderQueue[0].cardEl);

      for (let i = 1; i < renderQueue.length; i++) {
        const prio = getCardViewportPriority(renderQueue[i].cardEl);
        if (
          prio.tier < bestPrio.tier ||
          (prio.tier === bestPrio.tier && prio.dist < bestPrio.dist)
        ) {
          bestIdx = i;
          bestPrio = prio;
        }
      }

      const item = renderQueue.splice(bestIdx, 1)[0];
      if (!item || !item.cardEl || !item.cardEl.isConnected) continue;

      if (item.cardEl.dataset.rendered === "true") continue;

      // If user scrolled far away (> 500px) and observer is available, re-observe to save RAM/CPU
      if (bestPrio.tier === 2 && thumbnailObserver) {
        thumbnailObserver.observe(item.cardEl);
        continue;
      }

      try {
        const page = await state.pdfJsDoc.getPage(item.pageNum);
        const unscaledViewport = page.getViewport({ scale: 1.0 });

        // Calculate compact thumbnail scale
        const targetWidth =
          state.gridSize === "sm" ? 130 : state.gridSize === "lg" ? 220 : 170;
        const scale = targetWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        // Render on canvas
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext("2d", { alpha: false }); // alpha:false saves memory

        await page.render({
          canvasContext: ctx,
          viewport: viewport,
          intent: "display",
        }).promise;

        // CRITICAL LOW-RAM STEP: Convert canvas to low-memory JPEG and zero canvas dimensions immediately!
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        canvas.width = 0;
        canvas.height = 0; // Deallocates backing store from GPU/VRAM immediately!

        const img = document.createElement("img");
        img.className = "page-canvas";
        img.src = dataUrl;
        img.alt = `Page ${item.pageNum}`;
        img.loading = "lazy";

        const body = item.cardEl.querySelector(".page-card__body");
        if (body) {
          const loader = body.querySelector(".page-loading");
          if (loader) loader.remove();
          body.insertBefore(img, body.firstChild);
        }

        item.cardEl.dataset.rendered = "true";

        // Clean up PDF.js page proxy and font caches
        page.cleanup();
        state.pdfJsDoc.cleanup();
      } catch (err) {
        console.warn("Could not render page", item.pageNum, err);
        const body = item.cardEl.querySelector(".page-card__body");
        if (body) {
          const loader = body.querySelector(".page-loading");
          if (loader) {
            loader.innerHTML = `<span style="color:var(--text-3);font-size:0.8rem;">Page ${item.pageNum}</span>`;
          }
        }
      }

      // Micro-yield to allow browser compositor to breathe
      await new Promise((resolve) => setTimeout(resolve, 8));
    }

    isRenderingQueue = false;
  }

  // =============================================
  //  DELETION TOGGLING & STATE SYNC
  // =============================================
  function pushHistory() {
    state.history.push(new Set(state.deletedPages));
    if (state.history.length > 30) state.history.shift();
    state.future = []; // Clear redo stack on new action
    updateHistoryButtons();
  }

  function togglePageDeletion(pageNum) {
    pushHistory();
    if (state.deletedPages.has(pageNum)) {
      state.deletedPages.delete(pageNum);
    } else {
      state.deletedPages.add(pageNum);
    }
    updateCardVisual(pageNum);
    updateSummary();
    applyViewFilter();
    scheduleDBSave();
  }

  function updateCardVisual(pageNum) {
    const card = pagesGrid.querySelector(`.page-card[data-page="${pageNum}"]`);
    if (!card) return;

    const isDeleted = state.deletedPages.has(pageNum);
    card.classList.toggle("deleted", isDeleted);
    card.setAttribute(
      "aria-label",
      `Page ${pageNum} ${isDeleted ? "marked for deletion" : "preserved"}`,
    );

    const btn = card.querySelector(".page-action-btn");
    if (btn) {
      btn.setAttribute(
        "aria-label",
        isDeleted ? "Restore page " + pageNum : "Delete page " + pageNum,
      );
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${
            isDeleted
              ? `<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>`
              : `<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>`
          }
        </svg>
        <span>${isDeleted ? "Restore Page" : "Delete Page"}</span>
      `;
    }
  }

  function updateAllCardVisuals() {
    for (let p = 1; p <= state.totalPages; p++) {
      updateCardVisual(p);
    }
    updateSummary();
    applyViewFilter();
  }

  let summaryRAF = null;
  function updateSummary() {
    if (state.isDedicatedRendering) return;
    if (summaryRAF) cancelAnimationFrame(summaryRAF);
    summaryRAF = requestAnimationFrame(() => {
      const delCount = state.deletedPages.size;
      const keepCount = state.totalPages - delCount;

      if (deletedCountEl) deletedCountEl.textContent = delCount;
      if (keptCountEl) keptCountEl.textContent = keepCount;

      const tabAll = document.querySelector('.filter-tab[data-filter="all"]');
      const tabKeep = document.querySelector('.filter-tab[data-filter="keep"]');
      const tabDelete = document.querySelector(
        '.filter-tab[data-filter="delete"]',
      );
      if (tabAll) tabAll.textContent = `All Pages (${state.totalPages})`;
      if (tabKeep) tabKeep.textContent = `To Keep (${keepCount})`;
      if (tabDelete) tabDelete.textContent = `To Delete (${delCount})`;

      if (summaryBanner) {
        summaryBanner.classList.toggle("has-deletions", delCount > 0);
        summaryBanner.classList.toggle("all-deleted", keepCount === 0);
      }

      if (actionSummaryText) {
        if (keepCount === 0) {
          actionSummaryText.innerHTML = `<span style="color:var(--delete-red);font-weight:700;">⚠️ Cannot delete all pages. Please keep at least 1 page.</span>`;
        } else if (delCount === 0) {
          actionSummaryText.textContent =
            "Select pages above to delete them from your PDF";
        } else {
          actionSummaryText.innerHTML = `Ready — <strong class="summary-badge-del">${delCount} page${delCount !== 1 ? "s" : ""}</strong> will be removed, <strong class="summary-badge-keep">${keepCount} page${keepCount !== 1 ? "s" : ""}</strong> preserved`;
        }
      }

      if (deletePdfBtn) {
        deletePdfBtn.disabled = delCount === 0 || keepCount === 0;
      }
    });
  }

  // =============================================
  //  VIEW FILTERS (All / Keep / Delete)
  // =============================================
  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      filterTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.currentFilter = tab.dataset.filter;
      applyViewFilter();
    });
  });

  function applyViewFilter() {
    if (!pagesGrid) return;
    const cards = pagesGrid.querySelectorAll(".page-card");
    cards.forEach((card) => {
      const pageNum = parseInt(card.dataset.page, 10);
      const isDeleted = state.deletedPages.has(pageNum);

      if (state.currentFilter === "keep") {
        card.classList.toggle("filter-hidden", isDeleted);
      } else if (state.currentFilter === "delete") {
        card.classList.toggle("filter-hidden", !isDeleted);
      } else {
        card.classList.remove("filter-hidden");
      }
    });

    onScrollSettled();
  }

  // =============================================
  //  GRID DISPLAY SIZES (sm, md, lg)
  // =============================================
  function setGridSize(size) {
    state.gridSize = size;
    [gridSmBtn, gridMdBtn, gridLgBtn].forEach(
      (btn) => btn && btn.classList.remove("active"),
    );
    pagesGrid.classList.remove("grid-sm", "grid-lg");

    if (size === "sm") {
      pagesGrid.classList.add("grid-sm");
      if (gridSmBtn) gridSmBtn.classList.add("active");
    } else if (size === "lg") {
      pagesGrid.classList.add("grid-lg");
      if (gridLgBtn) gridLgBtn.classList.add("active");
    } else {
      if (gridMdBtn) gridMdBtn.classList.add("active");
    }

    onScrollSettled();
  }

  if (gridSmBtn) gridSmBtn.addEventListener("click", () => setGridSize("sm"));
  if (gridMdBtn) gridMdBtn.addEventListener("click", () => setGridSize("md"));
  if (gridLgBtn) gridLgBtn.addEventListener("click", () => setGridSize("lg"));

  // =============================================
  //  UNDO & REDO
  // =============================================
  function updateHistoryButtons() {
    if (undoBtn) undoBtn.disabled = state.history.length === 0;
    if (redoBtn) redoBtn.disabled = state.future.length === 0;
  }

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (!state.history.length) return;
      state.future.push(new Set(state.deletedPages));
      state.deletedPages = state.history.pop();
      updateAllCardVisuals();
      updateHistoryButtons();
      scheduleDBSave();
      showToast("Undone last deletion change.", "info");
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      if (!state.future.length) return;
      state.history.push(new Set(state.deletedPages));
      state.deletedPages = state.future.pop();
      updateAllCardVisuals();
      updateHistoryButtons();
      scheduleDBSave();
      showToast("Redone deletion change.", "info");
    });
  }

  // Keyboard shortcuts Ctrl+Z and Ctrl+Y
  document.addEventListener("keydown", (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === "z" &&
      !e.shiftKey
    ) {
      if (undoBtn && !undoBtn.disabled) {
        e.preventDefault();
        undoBtn.click();
      }
    } else if (
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
    ) {
      if (redoBtn && !redoBtn.disabled) {
        e.preventDefault();
        redoBtn.click();
      }
    }
  });

  // =============================================
  //  BATCH SELECTION CONTROLS
  // =============================================
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      pushHistory();
      for (let p = 1; p <= state.totalPages; p++) {
        state.deletedPages.add(p);
      }
      updateAllCardVisuals();
      scheduleDBSave();
      showToast(
        `Marked all ${state.totalPages} pages for deletion. (Keep at least 1 to download)`,
        "warning",
      );
    });
  }

  if (keepAllBtn) {
    keepAllBtn.addEventListener("click", () => {
      if (state.deletedPages.size === 0) return;
      pushHistory();
      state.deletedPages.clear();
      updateAllCardVisuals();
      scheduleDBSave();
      showToast("Reset all pages to kept state.", "success");
    });
  }

  if (invertBtn) {
    invertBtn.addEventListener("click", () => {
      pushHistory();
      const newDel = new Set();
      for (let p = 1; p <= state.totalPages; p++) {
        if (!state.deletedPages.has(p)) newDel.add(p);
      }
      state.deletedPages = newDel;
      updateAllCardVisuals();
      scheduleDBSave();
      showToast("Inverted page selection.", "info");
    });
  }

  if (oddPagesBtn) {
    oddPagesBtn.addEventListener("click", () => {
      pushHistory();
      for (let p = 1; p <= state.totalPages; p++) {
        if (p % 2 !== 0) state.deletedPages.add(p);
      }
      updateAllCardVisuals();
      scheduleDBSave();
      showToast("Marked odd pages for deletion.", "info");
    });
  }

  if (evenPagesBtn) {
    evenPagesBtn.addEventListener("click", () => {
      pushHistory();
      for (let p = 1; p <= state.totalPages; p++) {
        if (p % 2 === 0) state.deletedPages.add(p);
      }
      updateAllCardVisuals();
      scheduleDBSave();
      showToast("Marked even pages for deletion.", "info");
    });
  }

  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", () => {
      if (state.deletedPages.size === 0) {
        showToast("No deletions to reset.", "info");
        return;
      }
      pushHistory();
      state.deletedPages.clear();
      updateAllCardVisuals();
      scheduleDBSave();
      showToast("Reset all page deletions.", "success");
    });
  }

  // =============================================
  //  PAGE RANGE INPUT PARSER
  // =============================================
  if (applyRangeBtn && rangeInput) {
    applyRangeBtn.addEventListener("click", () => applyRangeInput());
    rangeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyRangeInput();
    });
  }

  function applyRangeInput() {
    const raw = rangeInput.value.trim();
    if (!raw) {
      showToast(
        "Please enter page numbers or ranges (e.g. 1, 3-5, 8).",
        "warning",
      );
      return;
    }

    const matchedPages = parseRangeString(raw, state.totalPages);
    if (!matchedPages.length) {
      showToast("No valid page numbers found in the range.", "error");
      return;
    }

    pushHistory();
    let newlyMarked = 0;
    matchedPages.forEach((p) => {
      if (!state.deletedPages.has(p)) {
        state.deletedPages.add(p);
        newlyMarked++;
      }
    });

    updateAllCardVisuals();
    scheduleDBSave();
    rangeInput.value = "";
    showToast(
      `Marked ${matchedPages.length} page(s) for deletion. (${newlyMarked} newly added)`,
      "success",
    );
  }

  function parseRangeString(str, maxPages) {
    const pages = new Set();
    const parts = str.split(",");

    parts.forEach((part) => {
      const clean = part.trim();
      if (!clean) return;

      if (clean.includes("-")) {
        const [startStr, endStr] = clean.split("-").map((s) => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const from = Math.max(1, Math.min(start, end));
          const to = Math.min(maxPages, Math.max(start, end));
          for (let i = from; i <= to; i++) {
            pages.add(i);
          }
        }
      } else {
        const p = parseInt(clean, 10);
        if (!isNaN(p) && p >= 1 && p <= maxPages) {
          pages.add(p);
        }
      }
    });

    return Array.from(pages).sort((a, b) => a - b);
  }

  // =============================================
  //  PAGE INSPECTOR MODAL
  // =============================================
  async function openInspector(pageNum) {
    if (!state.pdfJsDoc || !inspectModalOverlay || state.isDedicatedRendering) return;

    // Halt background thumbnail rendering immediately so 100% resources are dedicated to preview!
    isRenderingQueue = false;

    state.inspectingPage = pageNum;
    inspectModalOverlay.classList.add("open");

    if (inspectModalTitle) {
      inspectModalTitle.textContent = `Page ${pageNum} of ${state.totalPages}`;
    }

    updateInspectorToggleBtn();
    renderInspectorPage(pageNum);
  }

  function closeInspector() {
    if (inspectModalOverlay) inspectModalOverlay.classList.remove("open");
    if (currentInspectRenderTask) {
      try {
        currentInspectRenderTask.cancel();
      } catch (e) {}
      currentInspectRenderTask = null;
    }
    if (currentInspectPageProxy) {
      try {
        currentInspectPageProxy.cleanup();
      } catch (e) {}
      currentInspectPageProxy = null;
    }
    if (inspectModalBody) inspectModalBody.innerHTML = "";
    if (state.pdfJsDoc) {
      try {
        state.pdfJsDoc.cleanup();
      } catch (e) {}
    }

    // Resume thumbnail rendering if not in dedicated export mode and items are queued
    if (!state.isDedicatedRendering && renderQueue.length > 0) {
      processThumbnailQueue();
    }
  }

  function updateInspectorToggleBtn() {
    if (!inspectToggleBtn) return;
    const isDel = state.deletedPages.has(state.inspectingPage);
    inspectToggleBtn.className = isDel
      ? "btn-secondary"
      : "btn-primary btn-danger";
    inspectToggleBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${
          isDel
            ? `<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>`
            : `<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>`
        }
      </svg>
      <span>${isDel ? "Restore This Page" : "Mark Page for Deletion"}</span>
    `;
  }

  async function renderInspectorPage(pageNum) {
    if (!inspectModalBody || !state.pdfJsDoc) return;

    // 1. Instantly cancel previous in-flight inspector render task
    if (currentInspectRenderTask) {
      try {
        currentInspectRenderTask.cancel();
      } catch (e) {}
      currentInspectRenderTask = null;
    }

    if (currentInspectPageProxy) {
      try {
        currentInspectPageProxy.cleanup();
      } catch (e) {}
      currentInspectPageProxy = null;
    }

    if (inspectPrevBtn) inspectPrevBtn.disabled = pageNum <= 1;
    if (inspectNextBtn) inspectNextBtn.disabled = pageNum >= state.totalPages;

    // 2. CHECK PREVIEW CACHE (0ms Instant Load!)
    if (inspectCache.has(pageNum)) {
      const cachedDataUrl = inspectCache.get(pageNum);
      inspectModalBody.innerHTML = "";
      const img = document.createElement("img");
      img.className = "inspect-canvas";
      img.src = cachedDataUrl;
      img.alt = `Page ${pageNum} Preview`;
      inspectModalBody.appendChild(img);
      return;
    }

    // 3. INSTANT THUMBNAIL BRIDGE: Display existing grid thumbnail immediately so user sees content in 0ms!
    const gridCard = pagesGrid
      ? pagesGrid.querySelector(`.page-card[data-page="${pageNum}"]`)
      : null;
    const existingThumb = gridCard
      ? gridCard.querySelector("img.page-canvas")
      : null;

    if (existingThumb && existingThumb.src) {
      inspectModalBody.innerHTML = `
        <div class="inspect-container" style="position:relative;display:flex;justify-content:center;align-items:center;width:100%;">
          <img class="inspect-canvas inspect-thumb-bridge" src="${existingThumb.src}" alt="Page ${pageNum}" style="filter:blur(0.5px);opacity:0.92;transition:filter 0.2s,opacity 0.2s;" />
          <div class="inspect-badge" style="position:absolute;bottom:12px;right:12px;background:rgba(20,24,33,0.75);color:#fff;font-size:0.75rem;padding:4px 10px;border-radius:20px;backdrop-filter:blur(4px);pointer-events:none;display:flex;align-items:center;gap:6px;">
            <div class="spinner" style="width:10px;height:10px;border-width:1.5px;border-top-color:#fff;"></div>
            <span>Optimizing preview…</span>
          </div>
        </div>
      `;
    } else {
      inspectModalBody.innerHTML = `
        <div class="page-loading">
          <div class="spinner"></div>
          <span>Loading Page ${pageNum}…</span>
        </div>
      `;
    }

    try {
      const page = await state.pdfJsDoc.getPage(pageNum);
      // Ensure user hasn't switched away while page metadata was fetching
      if (state.inspectingPage !== pageNum) {
        page.cleanup();
        return;
      }
      currentInspectPageProxy = page;

      // 4. ADAPTIVE SCALE: Calculate exact container fit without over-rendering oversized canvases
      const unscaled = page.getViewport({ scale: 1.0 });
      const modalW = inspectModalBody.clientWidth || 640;
      const modalH = inspectModalBody.clientHeight || 500;
      const targetW = Math.max(300, Math.min(modalW - 40, 720));
      const targetH = Math.max(300, Math.min(modalH - 40, 650));
      const scaleW = targetW / unscaled.width;
      const scaleH = targetH / unscaled.height;
      const fitScale = Math.min(scaleW, scaleH);
      // Optimal sharpness scale (capped at 1.4 to keep RAM and render time tiny)
      const optimalScale = Math.min(
        Math.max(fitScale * (window.devicePixelRatio > 1 ? 1.25 : 1.0), 0.75),
        1.4,
      );

      const viewport = page.getViewport({ scale: optimalScale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d", { alpha: false });

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        intent: "display",
      });
      currentInspectRenderTask = renderTask;

      await renderTask.promise;
      currentInspectRenderTask = null;

      // Verify user has not flipped pages during canvas rasterization
      if (state.inspectingPage !== pageNum) {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
        return;
      }

      const highResDataUrl = canvas.toDataURL("image/jpeg", 0.85);
      canvas.width = 0;
      canvas.height = 0; // Release VRAM immediately!

      // Cache the result (LRU max 12 items)
      if (inspectCache.size >= 12) {
        const firstKey = inspectCache.keys().next().value;
        inspectCache.delete(firstKey);
      }
      inspectCache.set(pageNum, highResDataUrl);

      // Render crisp image in modal
      const finalImg = document.createElement("img");
      finalImg.className = "inspect-canvas";
      finalImg.src = highResDataUrl;
      finalImg.alt = `Page ${pageNum} Preview`;

      inspectModalBody.innerHTML = "";
      inspectModalBody.appendChild(finalImg);

      page.cleanup();
      state.pdfJsDoc.cleanup();
    } catch (err) {
      if (err && err.name === "RenderingCancelledException") {
        // Expected cancellation when user quickly clicks Next/Prev
        return;
      }
      console.warn("Inspector render error:", err);
      if (state.inspectingPage === pageNum) {
        inspectModalBody.innerHTML = `<p style="color:var(--delete-red);">Failed to render preview: ${err.message || err}</p>`;
      }
    }
  }

  if (inspectCloseBtn) inspectCloseBtn.addEventListener("click", closeInspector);
  if (inspectModalOverlay) {
    inspectModalOverlay.addEventListener("click", (e) => {
      if (e.target === inspectModalOverlay) closeInspector();
    });
  }

  if (inspectPrevBtn) {
    inspectPrevBtn.addEventListener("click", () => {
      if (state.inspectingPage > 1) {
        state.inspectingPage--;
        if (inspectModalTitle) {
          inspectModalTitle.textContent = `Page ${state.inspectingPage} of ${state.totalPages}`;
        }
        updateInspectorToggleBtn();
        renderInspectorPage(state.inspectingPage);
      }
    });
  }

  if (inspectNextBtn) {
    inspectNextBtn.addEventListener("click", () => {
      if (state.inspectingPage < state.totalPages) {
        state.inspectingPage++;
        if (inspectModalTitle) {
          inspectModalTitle.textContent = `Page ${state.inspectingPage} of ${state.totalPages}`;
        }
        updateInspectorToggleBtn();
        renderInspectorPage(state.inspectingPage);
      }
    });
  }

  if (inspectToggleBtn) {
    inspectToggleBtn.addEventListener("click", () => {
      togglePageDeletion(state.inspectingPage);
      updateInspectorToggleBtn();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (inspectModalOverlay && inspectModalOverlay.classList.contains("open")) {
      if (e.key === "Escape") closeInspector();
      if (e.key === "ArrowLeft" && inspectPrevBtn && !inspectPrevBtn.disabled)
        inspectPrevBtn.click();
      if (e.key === "ArrowRight" && inspectNextBtn && !inspectNextBtn.disabled)
        inspectNextBtn.click();
    }
  });

  // =============================================
  //  PDF MODIFICATION & DOWNLOAD ENGINE (IN-PLACE UNLINKING)
  // =============================================
  if (deletePdfBtn) {
    deletePdfBtn.addEventListener("click", () => generateModifiedPdf());
  }

  async function generateModifiedPdf() {
    const delCount = state.deletedPages.size;
    const keepCount = state.totalPages - delCount;

    if (delCount === 0) {
      showToast(
        "No pages are marked for deletion. Please select pages to remove.",
        "warning",
      );
      return;
    }

    if (keepCount === 0) {
      showToast(
        "You cannot delete all pages. At least 1 page must remain in the document.",
        "error",
      );
      return;
    }

    // ENTER DEDICATED RENDER MODE: Halt all background previews, thumbnails, timers & animations!
    enterDedicatedRenderMode();

    showLoadingModal(
      true,
      "Deleting Pages & Generating PDF…",
      "Dedicated render mode active: background tasks paused for maximum speed…",
      15,
      "⚡ 100% Dedicated Render Mode",
    );

    try {
      // 1. Retrieve Blob
      let blob = state.currentBlob;
      if (!blob) {
        updateLoadingProgress(20, "Retrieving document from local storage…");
        const db = await openDB();
        const tx = db.transaction(["delete_data"], "readonly");
        const req = tx.objectStore("delete_data").get("file");
        const record = await new Promise((res, rej) => {
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        });
        if (record && record.blob) {
          blob = record.blob;
        } else if (record && record.bytes) {
          blob = new Blob([record.bytes], { type: "application/pdf" });
        } else {
          throw new Error("Could not retrieve document from local storage.");
        }
      }

      updateLoadingProgress(30, "Preparing dedicated memory buffer…");
      // Yield to let browser garbage collector run before reading buffer
      await new Promise((r) => setTimeout(r, 60));

      // Read buffer on-demand ONLY during export
      let srcBuffer = await blob.arrayBuffer();

      updateLoadingProgress(45, "Loading PDF catalog…");
      await new Promise((r) => setTimeout(r, 20));

      // In-place load with fast parsing and zero metadata bloat
      let pdfDoc = await PDFLib.PDFDocument.load(srcBuffer, {
        ignoreEncryption: true,
        parseSpeed: Infinity,
        updateMetadata: false,
      });

      // CRITICAL LOW-RAM STEP: Free original ArrayBuffer immediately from JS heap!
      srcBuffer = null;

      // 2. Compute 0-based page indices to delete in DESCENDING order
      // Descending order guarantees that removing index K does not shift indices < K!
      const toDeleteDesc = Array.from(state.deletedPages)
        .map((p) => p - 1)
        .sort((a, b) => b - a);

      const totalToDelete = toDeleteDesc.length;
      updateLoadingProgress(
        60,
        `Unlinking ${totalToDelete} page nodes from document catalog…`,
      );
      await new Promise((r) => setTimeout(r, 10));

      // 3. In-place catalog leaf-node unlinking (Zero copying! Zero object cloning!)
      for (let i = 0; i < totalToDelete; i++) {
        pdfDoc.removePage(toDeleteDesc[i]);
        if (i % 25 === 0) {
          const pct = 60 + Math.round((i / totalToDelete) * 20);
          updateLoadingProgress(
            pct,
            `Deleted ${i + 1} of ${totalToDelete} pages…`,
          );
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      // 4. Serialize in-place without object stream compression spikes
      updateLoadingProgress(85, "Finalizing and serializing PDF structure…");
      await new Promise((r) => setTimeout(r, 15));

      let outputBytes = await pdfDoc.save({
        useObjectStreams: false, // Prevents massive compression buffer allocation in JS heap!
        objectsPerTick: 150, // Micro-yields to keep browser responsive
      });

      // Release PDFDocument AST from memory immediately!
      pdfDoc = null;

      updateLoadingProgress(98, "Preparing download file…");
      await new Promise((r) => setTimeout(r, 20));

      // Create download blob and immediately release outputBytes reference
      const outBlob = new Blob([outputBytes], { type: "application/pdf" });
      outputBytes = null;
      lastGeneratedBlob = outBlob;

      const baseName = state.fileName.replace(/\.[^/.]+$/, "");
      lastGeneratedName = `${baseName}-pages-removed.pdf`;

      // Trigger instant download
      downloadBlob(outBlob, lastGeneratedName);

      updateLoadingProgress(100, "Done! Ready for download.");
      await new Promise((r) => setTimeout(r, 150));

      showLoadingModal(false);

      // Show results card
      if (resultsCard) {
        resultsCard.classList.add("active");
        if (origPagesStat)
          origPagesStat.textContent = `${state.totalPages} pages`;
        if (newPagesStat)
          newPagesStat.textContent = `${keepCount} pages (${delCount} removed)`;
        if (newSizeStat) newSizeStat.textContent = fmtBytes(outBlob.size);
        resultsCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      showToast(
        `Success! Deleted ${delCount} page(s) and downloaded "${lastGeneratedName}"`,
        "success",
        5000,
      );
    } catch (err) {
      showLoadingModal(false);
      console.error("PDF modification error:", err);
      showToast(
        "Failed to generate modified PDF: " + (err.message || err),
        "error",
        5000,
      );
    } finally {
      // EXIT DEDICATED RENDER MODE
      exitDedicatedRenderMode();
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
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  if (downloadResultBtn) {
    downloadResultBtn.addEventListener("click", () => {
      if (lastGeneratedBlob && lastGeneratedName) {
        downloadBlob(lastGeneratedBlob, lastGeneratedName);
        showToast(`Downloading "${lastGeneratedName}"…`, "info");
      }
    });
  }

  if (deleteMoreBtn) {
    deleteMoreBtn.addEventListener("click", () => {
      if (resultsCard) resultsCard.classList.remove("active");
      if (workspace) workspace.scrollIntoView({ behavior: "smooth" });
    });
  }

  if (startOverBtn || changeFileBtn) {
    const handler = () => {
      uploadZone.style.display = "";
      workspace.classList.remove("active");
      if (resultsCard) resultsCard.classList.remove("active");

      destroyCurrentDoc();

      state.totalPages = 0;
      state.deletedPages.clear();
      state.history = [];
      state.future = [];
      pagesGrid.innerHTML = "";

      fileInput.value = "";
      clearSessionFromDB();
      showToast("Reset workspace for a new file.", "info");
    };

    if (startOverBtn) startOverBtn.addEventListener("click", handler);
    if (changeFileBtn) changeFileBtn.addEventListener("click", handler);
  }

  // =============================================
  //  UTILITY FUNCTIONS
  // =============================================
  function fmtBytes(bytes) {
    if (!bytes || bytes === 0) return "0 KB";
    const k = 1024;
    if (bytes < k * k) {
      return (bytes / k).toFixed(0) + " KB";
    }
    return (bytes / (k * k)).toFixed(1) + " MB";
  }

  function truncateFilename(name, max = 28) {
    if (!name || name.length <= max) return name;
    const dotIdx = name.lastIndexOf(".");
    const ext = dotIdx !== -1 ? name.slice(dotIdx) : "";
    const nameWithout = dotIdx !== -1 ? name.slice(0, dotIdx) : name;
    const avail = max - ext.length - 3;
    if (avail <= 4) return name.slice(0, max - 3) + "…";
    return nameWithout.slice(0, avail) + "…" + ext;
  }

  // Check stored session on startup
  checkStoredSessionAvailable(true);
})();
