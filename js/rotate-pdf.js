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
  const DB_NAME = "pdfmaster_rotate_db";
  const DB_VERSION = 1;
  const THEME_KEY = "pdfmaster-theme";

  // =============================================
  //  APPLICATION STATE
  // =============================================
  const state = {
    fileName: "document.pdf",
    fileSize: 0,
    totalPages: 0,
    currentBlob: null, // Active File or Blob
    currentBlobUrl: null, // Object URL for streaming range requests
    hasPersistedBlob: false,
    rotations: new Map(), // pageNum (1-based) -> deltaAngle (90, 180, 270). If 0, omitted.
    pageMeta: new Map(), // pageNum -> { origAngle: number, width: number, height: number, isLandscape: boolean, aspect: number }
    history: [], // Undo stack (Array of Map snapshots)
    future: [], // Redo stack (Array of Map snapshots)
    currentFilter: "all", // "all" | "rotated" | "unchanged"
    gridSize: "md", // "sm" | "md" | "lg"
    pdfJsDoc: null,
    inspectingPage: 1,
    isDedicatedRendering: false,
  };

  let dbPromise = null;
  let dbSaveTimer = null;
  let toastTimer = null;
  let thumbnailObserver = null;
  const renderQueue = [];
  let isRenderingQueue = false;
  let currentInspectPageProxy = null;
  let currentInspectRenderTask = null;
  const inspectCache = new Map(); // Fast LRU preview cache: `${pageNum}_${angle}` -> dataUrl

  // Optimized Offscreen Thumbnail Cache & 200ms Scroll Debouncer
  const thumbnailCache = new Map(); // pageNum -> { dataUrl, isLandscape, aspect, origAngle, width, height }
  let scrollDebounceTimer = null;
  let isScrolling = false;
  let lastScrollY = 0;
  let scrollDirection = "down"; // "down" | "up"
  const SCROLL_DEBOUNCE_MS = 200;

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

  // Global Quick Rotate Controls
  const rotateAllRightBtn = document.getElementById("rotateAllRightBtn");
  const rotateAllLeftBtn = document.getElementById("rotateAllLeftBtn");
  const flipAllBtn = document.getElementById("flipAllBtn");
  const makeAllPortraitBtn = document.getElementById("makeAllPortraitBtn");
  const makeAllLandscapeBtn = document.getElementById("makeAllLandscapeBtn");

  // Range and Batch Controls
  const rangeInput = document.getElementById("rangeInput");
  const rotateRangeRightBtn = document.getElementById("rotateRangeRightBtn");
  const rotateRangeLeftBtn = document.getElementById("rotateRangeLeftBtn");
  const flipRangeBtn = document.getElementById("flipRangeBtn");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const oddPagesBtn = document.getElementById("oddPagesBtn");
  const evenPagesBtn = document.getElementById("evenPagesBtn");
  const portraitPagesBtn = document.getElementById("portraitPagesBtn");
  const landscapePagesBtn = document.getElementById("landscapePagesBtn");

  // History & Display Controls
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const filterTabs = document.querySelectorAll(".filter-tab");
  const gridSmBtn = document.getElementById("gridSmBtn");
  const gridMdBtn = document.getElementById("gridMdBtn");
  const gridLgBtn = document.getElementById("gridLgBtn");

  // Summary Banner
  const summaryBanner = document.getElementById("summaryBanner");
  const rotatedCountEl = document.getElementById("rotatedCount");
  const unchangedCountEl = document.getElementById("unchangedCount");
  const totalCountEl = document.getElementById("totalCount");

  // Grid & Action Bar
  const pagesGrid = document.getElementById("pagesGrid");
  const rotatePdfBtn = document.getElementById("rotatePdfBtn");
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
  const inspectRotateLeftBtn = document.getElementById("inspectRotateLeftBtn");
  const inspectRotateRightBtn = document.getElementById(
    "inspectRotateRightBtn",
  );
  const inspectFlipBtn = document.getElementById("inspectFlipBtn");
  const inspectResetBtn = document.getElementById("inspectResetBtn");

  // Results Section
  const resultsCard = document.getElementById("resultsCard");
  const origPagesStat = document.getElementById("origPagesStat");
  const rotatedPagesStat = document.getElementById("rotatedPagesStat");
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
        toastIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;
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
        if (!db.objectStoreNames.contains("rotate_data")) {
          db.createObjectStore("rotate_data");
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  // Persists the raw File/Blob ONCE into IndexedDB disk cache
  async function persistBlobToDB(blob, name) {
    try {
      const db = await openDB();
      const tx = db.transaction(["rotate_data"], "readwrite");
      tx.objectStore("rotate_data").put(
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

  // Saves lightweight session metadata without touching large files
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
        rotations: Array.from(state.rotations.entries()),
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
      const tx = db.transaction(["settings", "rotate_data"], "readonly");
      const settingsReq = tx.objectStore("settings").get("session");
      const dataReq = tx.objectStore("rotate_data").get("file");

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

      const initialRotations =
        session && Array.isArray(session.rotations)
          ? new Map(session.rotations)
          : new Map();

      await loadPdfFromBlob(
        blob,
        data.fileName || "document.pdf",
        initialRotations,
      );

      if (isManual) {
        showToast(
          `Restored "${state.fileName}" with ${state.rotations.size} page rotation(s)!`,
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
      const tx = db.transaction(["settings", "rotate_data"], "readwrite");
      tx.objectStore("settings").clear();
      tx.objectStore("rotate_data").clear();
      updateRecoveryBadge(false);
    } catch (err) {
      console.warn("IndexedDB clear failed:", err);
    }
  }

  async function checkStoredSessionAvailable(notifyOnFound = false) {
    try {
      const db = await openDB();
      const tx = db.transaction(["rotate_data"], "readonly");
      const req = tx.objectStore("rotate_data").get("file");
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
    if (scrollDebounceTimer) {
      clearTimeout(scrollDebounceTimer);
      scrollDebounceTimer = null;
    }
    isScrolling = false;
    lastScrollY = 0;
    scrollDirection = "down";

    if (thumbnailObserver) {
      thumbnailObserver.disconnect();
      thumbnailObserver = null;
    }
    renderQueue.length = 0;
    isRenderingQueue = false;

    for (const [pageNum, item] of thumbnailCache.entries()) {
      if (item && item.dataUrl && item.dataUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(item.dataUrl);
        } catch (e) {}
      }
    }
    thumbnailCache.clear();

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
    state.pageMeta.clear();
  }

  // =============================================
  //  DEDICATED RESOURCE CONTROL
  // =============================================
  function enterDedicatedRenderMode() {
    state.isDedicatedRendering = true;
    document.body.classList.add("rendering-mode");

    if (thumbnailObserver) {
      thumbnailObserver.disconnect();
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
    if (inspectModalOverlay && inspectModalOverlay.classList.contains("open")) {
      closeInspector();
    }
    inspectCache.clear();

    if (dbSaveTimer) {
      clearTimeout(dbSaveTimer);
      dbSaveTimer = null;
    }
    if (scrollDebounceTimer) {
      clearTimeout(scrollDebounceTimer);
      scrollDebounceTimer = null;
    }
    isScrolling = false;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    if (state.pdfJsDoc) {
      try {
        state.pdfJsDoc.cleanup();
      } catch (e) {}
    }
  }

  function exitDedicatedRenderMode() {
    state.isDedicatedRendering = false;
    document.body.classList.remove("rendering-mode");

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

    await loadPdfFromBlob(file, file.name);

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
  async function loadPdfFromBlob(blob, fileName, initialRotations = new Map()) {
    destroyCurrentDoc();

    state.fileName = fileName;
    state.fileSize = blob.size;
    state.currentBlob = blob;
    state.rotations = new Map(initialRotations);
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
      state.currentBlobUrl = URL.createObjectURL(blob);

      const loadingTask = pdfjsLib.getDocument({
        url: state.currentBlobUrl,
        disableAutoFetch: true,
        disableStream: false,
        rangeChunkSize: 65536,
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
  //  VIEWPORT DETECTION & DEBOUNCED LOOKAHEAD / LOOKBEHIND QUEUE
  // =============================================
  function isElementInViewport(el) {
    if (!el || !el.isConnected || el.classList.contains("filter-hidden")) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    return rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
  }

  function applyCachedThumbnail(card, pageNum) {
    if (!thumbnailCache.has(pageNum)) return false;
    const cached = thumbnailCache.get(pageNum);
    if (!cached || !cached.dataUrl) return false;

    const orientTag = card.querySelector(`#orientTag_${pageNum}`);
    if (orientTag) {
      orientTag.textContent = cached.isLandscape ? "L" : "P";
      orientTag.title = cached.isLandscape
        ? "Landscape Orientation"
        : "Portrait Orientation";
    }

    const container = card.querySelector(`#thumbContainer_${pageNum}`);
    if (container) {
      container.innerHTML = "";
      const img = document.createElement("img");
      img.className = "page-canvas";
      img.src = cached.dataUrl;
      img.alt = `Page ${pageNum}`;
      img.loading = "lazy";
      container.appendChild(img);
    }

    card.dataset.rendered = "true";

    if (!state.pageMeta.has(pageNum)) {
      state.pageMeta.set(pageNum, {
        origAngle: cached.origAngle || 0,
        width: cached.width || 600,
        height: cached.height || 800,
        isLandscape: cached.isLandscape,
        aspect: cached.aspect || 0.707,
      });
    }

    updateCardTransform(pageNum);
    return true;
  }

  // Off-page rendering utilizing PDF.js Web Worker and OffscreenCanvas
  async function renderPageOffscreen(pageNum) {
    if (thumbnailCache.has(pageNum)) {
      return thumbnailCache.get(pageNum);
    }

    const page = await state.pdfJsDoc.getPage(pageNum);
    const unscaled = page.getViewport({ scale: 1.0 });

    const isLandscape = unscaled.width > unscaled.height;
    const aspect = unscaled.width / unscaled.height;

    state.pageMeta.set(pageNum, {
      origAngle: page.rotate || 0,
      width: unscaled.width,
      height: unscaled.height,
      isLandscape,
      aspect,
    });

    const targetWidth =
      state.gridSize === "sm" ? 140 : state.gridSize === "lg" ? 240 : 190;
    const scale = targetWidth / unscaled.width;
    const viewport = page.getViewport({ scale });
    const canvasWidth = Math.max(1, Math.floor(viewport.width));
    const canvasHeight = Math.max(1, Math.floor(viewport.height));

    let canvas = null;
    let isOffscreen = false;

    if (typeof OffscreenCanvas !== "undefined") {
      try {
        canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
        isOffscreen = true;
      } catch (e) {
        canvas = null;
      }
    }
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    const ctx = canvas.getContext("2d", { alpha: false });

    // Render via PDF.js worker
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
      intent: "display",
    }).promise;

    let dataUrl;
    if (isOffscreen && canvas.convertToBlob) {
      const blob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: 0.8,
      });
      dataUrl = URL.createObjectURL(blob);
    } else if (canvas.toBlob) {
      const blob = await new Promise((res) =>
        canvas.toBlob(res, "image/jpeg", 0.8),
      );
      dataUrl = blob
        ? URL.createObjectURL(blob)
        : canvas.toDataURL("image/jpeg", 0.8);
    } else {
      dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    }

    if (canvas.width !== undefined) {
      canvas.width = 0;
      canvas.height = 0;
    }

    const entry = {
      dataUrl,
      isLandscape,
      aspect,
      origAngle: page.rotate || 0,
      width: unscaled.width,
      height: unscaled.height,
    };

    thumbnailCache.set(pageNum, entry);
    page.cleanup();

    return entry;
  }

  // Prioritized Queue: On-Screen first, then Upcoming Next Pages, then only 2 Tabs Up
  function buildPrioritizedQueueAndProcess() {
    if (
      !pagesGrid ||
      !state.pdfJsDoc ||
      state.isDedicatedRendering ||
      isScrolling
    ) {
      return;
    }

    const allCards = Array.from(
      pagesGrid.querySelectorAll(".page-card:not(.filter-hidden)"),
    );
    if (allCards.length === 0) return;

    // 1. Immediately apply any thumbnails already present in cache
    allCards.forEach((card) => {
      const pageNum = parseInt(card.dataset.page, 10);
      if (card.dataset.rendered !== "true" && thumbnailCache.has(pageNum)) {
        applyCachedThumbnail(card, pageNum);
      }
    });

    // 2. Identify visible viewport boundaries
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;

    const visibleUnrendered = [];
    let minVisiblePage = Infinity;
    let maxVisiblePage = -Infinity;

    allCards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const inView =
        rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
      if (inView) {
        const pageNum = parseInt(card.dataset.page, 10);
        if (pageNum < minVisiblePage) minVisiblePage = pageNum;
        if (pageNum > maxVisiblePage) maxVisiblePage = pageNum;
        if (card.dataset.rendered !== "true") {
          visibleUnrendered.push({ card, pageNum, rect });
        }
      }
    });

    if (!Number.isFinite(minVisiblePage)) {
      minVisiblePage = 1;
      maxVisiblePage = Math.min(state.totalPages, 6);
    }

    // Sort visible on-screen cards in natural order so user sees them fill progressively
    if (scrollDirection === "up") {
      visibleUnrendered.sort((a, b) => b.pageNum - a.pageNum);
    } else {
      visibleUnrendered.sort((a, b) => a.pageNum - b.pageNum);
    }

    const onScreenQueue = visibleUnrendered.map((item) => ({
      pageNum: item.pageNum,
      cardEl: item.card,
    }));

    // Group 2: Upcoming Next Pages (Forward Lookahead in scroll direction)
    const upcomingQueue = [];
    // Group 3: Upper Pages (Lookbehind strictly capped at max 2 tabs/pages behind)
    const upperQueue = [];

    if (scrollDirection === "up") {
      // User scrolling UP: forward lookahead is towards earlier pages
      const LOOKAHEAD_UP_COUNT = 8;
      for (
        let p = minVisiblePage - 1;
        p >= Math.max(1, minVisiblePage - LOOKAHEAD_UP_COUNT);
        p--
      ) {
        const card = pagesGrid.querySelector(
          `.page-card[data-page="${p}"]:not(.filter-hidden)`,
        );
        if (card && card.dataset.rendered !== "true") {
          upcomingQueue.push({ pageNum: p, cardEl: card });
        }
      }

      // Max 2 tabs down behind viewport
      for (
        let p = maxVisiblePage + 1;
        p <= Math.min(state.totalPages, maxVisiblePage + 2);
        p++
      ) {
        const card = pagesGrid.querySelector(
          `.page-card[data-page="${p}"]:not(.filter-hidden)`,
        );
        if (card && card.dataset.rendered !== "true") {
          upperQueue.push({ pageNum: p, cardEl: card });
        }
      }
    } else {
      // User scrolling DOWN or stationary (default): forward lookahead is towards next pages
      const LOOKAHEAD_DOWN_COUNT = 8;
      for (
        let p = maxVisiblePage + 1;
        p <= Math.min(state.totalPages, maxVisiblePage + LOOKAHEAD_DOWN_COUNT);
        p++
      ) {
        const card = pagesGrid.querySelector(
          `.page-card[data-page="${p}"]:not(.filter-hidden)`,
        );
        if (card && card.dataset.rendered !== "true") {
          upcomingQueue.push({ pageNum: p, cardEl: card });
        }
      }

      // Strictly ONLY 2 tabs/pages up above viewport
      const LOOKBEHIND_COUNT = 2;
      for (
        let p = minVisiblePage - 1;
        p >= Math.max(1, minVisiblePage - LOOKBEHIND_COUNT);
        p--
      ) {
        const card = pagesGrid.querySelector(
          `.page-card[data-page="${p}"]:not(.filter-hidden)`,
        );
        if (card && card.dataset.rendered !== "true") {
          upperQueue.push({ pageNum: p, cardEl: card });
        }
      }
    }

    // Strict priority hierarchy:
    // 1. All on-screen visible pages first (fills what user is looking at right now)
    // 2. Upcoming next pages (preheats what the user will scroll to next)
    // 3. Maximum 2 tabs behind (just enough to absorb immediate reverse scrolls)
    renderQueue.length = 0;
    renderQueue.push(...onScreenQueue, ...upcomingQueue, ...upperQueue);

    processRenderQueue();
  }

  // 200ms Scroll Debounce Listener with direction tracking
  window.addEventListener(
    "scroll",
    () => {
      if (!pagesGrid || !state.pdfJsDoc || state.isDedicatedRendering) return;

      const currentScrollY = window.scrollY || 0;
      if (currentScrollY > lastScrollY + 4) {
        scrollDirection = "down";
      } else if (currentScrollY < lastScrollY - 4) {
        scrollDirection = "up";
      }
      lastScrollY = currentScrollY;

      isScrolling = true;

      if (scrollDebounceTimer) {
        clearTimeout(scrollDebounceTimer);
      }

      scrollDebounceTimer = setTimeout(() => {
        isScrolling = false;
        buildPrioritizedQueueAndProcess();
      }, SCROLL_DEBOUNCE_MS);
    },
    { passive: true },
  );

  window.addEventListener(
    "resize",
    () => {
      if (!pagesGrid || !state.pdfJsDoc || state.isDedicatedRendering) return;
      if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
      scrollDebounceTimer = setTimeout(() => {
        isScrolling = false;
        buildPrioritizedQueueAndProcess();
      }, 150);
    },
    { passive: true },
  );

  // =============================================
  //  VIRTUALIZED THUMBNAIL GRID BUILDER
  // =============================================
  function initLazyThumbnailGrid() {
    if (!pagesGrid) return;
    pagesGrid.innerHTML = "";

    const frag = document.createDocumentFragment();

    for (let p = 1; p <= state.totalPages; p++) {
      const card = createPageCard(p);
      frag.appendChild(card);
    }

    pagesGrid.appendChild(frag);

    requestAnimationFrame(() => {
      buildPrioritizedQueueAndProcess();
    });
  }

  // =============================================
  //  PAGE CARD CREATION
  // =============================================
  function createPageCard(pageNum) {
    const card = document.createElement("div");
    card.className = "page-card";
    card.dataset.page = pageNum;
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", `Page ${pageNum}`);

    const delta = state.rotations.get(pageNum) || 0;
    if (delta !== 0) {
      card.classList.add("rotated");
    }

    // Check thumbnail cache for instant zero-latency presentation
    const cached = thumbnailCache.get(pageNum);
    const isRendered = !!(cached && cached.dataUrl);
    card.dataset.rendered = isRendered ? "true" : "false";

    if (cached && !state.pageMeta.has(pageNum)) {
      state.pageMeta.set(pageNum, {
        origAngle: cached.origAngle || 0,
        width: cached.width || 600,
        height: cached.height || 800,
        isLandscape: cached.isLandscape,
        aspect: cached.aspect || 0.707,
      });
    }

    const isLandscape = cached ? cached.isLandscape : false;
    const orientChar = isLandscape ? "L" : "P";
    const orientTitle = isLandscape
      ? "Landscape Orientation"
      : "Portrait Orientation";

    let initialTransform = "";
    if (delta !== 0) {
      const meta = state.pageMeta.get(pageNum);
      const aspect =
        meta && meta.aspect ? meta.aspect : cached ? cached.aspect : 0.707;
      let scale = 1.0;
      if (delta % 180 !== 0) {
        scale = aspect < 1 ? aspect : 1 / aspect;
        scale = Math.min(1.0, Math.max(0.72, scale));
      }
      initialTransform = `style="transform: rotate(${delta}deg) scale(${scale});"`;
    }

    const thumbHtml = isRendered
      ? `<img class="page-canvas" src="${cached.dataUrl}" alt="Page ${pageNum}" loading="lazy" />`
      : `<div class="page-loading"><div class="spinner"></div><span>Page ${pageNum}</span></div>`;

    card.innerHTML = `
      <div class="page-card__head">
        <div class="page-card__num">
          <span>Page ${pageNum}</span>
          <span class="page-orient-tag" id="orientTag_${pageNum}" title="${orientTitle}">${orientChar}</span>
        </div>
        <div class="page-card__actions-head">
          <button type="button" class="page-card__inspect" title="High-resolution preview (Page ${pageNum})" aria-label="Inspect page ${pageNum}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="page-card__body">
        <span class="page-angle-badge" id="angleBadge_${pageNum}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          <span>+${delta}°</span>
        </span>
        <div class="page-thumb-container" id="thumbContainer_${pageNum}" ${initialTransform}>
          ${thumbHtml}
        </div>
        <div class="page-card__overlay">
          <button type="button" class="overlay-btn overlay-btn-left" title="Rotate 90° Left" aria-label="Rotate left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
          </button>
          <button type="button" class="overlay-btn overlay-btn-flip" title="Flip 180°" aria-label="Flip 180 degrees">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/>
            </svg>
          </button>
          <button type="button" class="overlay-btn overlay-btn-right" title="Rotate 90° Right" aria-label="Rotate right">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="page-card__footer">
        <button type="button" class="page-rotate-left-btn" title="Rotate page ${pageNum} 90° Left (-90°)" aria-label="Rotate page ${pageNum} left">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
        </button>
        <button type="button" class="page-rotate-btn" title="Rotate page ${pageNum} 90° Right (+90°)" aria-label="Rotate page ${pageNum} right">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          <span id="footerText_${pageNum}">${delta === 0 ? "Rotate 90°" : `Rotated ${delta}°`}</span>
        </button>
        <button type="button" class="page-reset-btn" title="Reset page rotation to 0°" aria-label="Reset page rotation" style="${delta === 0 ? "display:none;" : ""}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    // Event Bindings
    const inspectBtn = card.querySelector(".page-card__inspect");
    if (inspectBtn) {
      inspectBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openInspector(pageNum);
      });
    }

    const overlay = card.querySelector(".page-card__overlay");
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          e.stopPropagation();
        }
      });
    }

    const btnLeft = card.querySelector(".overlay-btn-left");
    if (btnLeft) {
      btnLeft.addEventListener("click", (e) => {
        e.stopPropagation();
        rotatePage(pageNum, -90);
      });
    }

    const btnFlip = card.querySelector(".overlay-btn-flip");
    if (btnFlip) {
      btnFlip.addEventListener("click", (e) => {
        e.stopPropagation();
        rotatePage(pageNum, 180);
      });
    }

    const btnRight = card.querySelector(".overlay-btn-right");
    if (btnRight) {
      btnRight.addEventListener("click", (e) => {
        e.stopPropagation();
        rotatePage(pageNum, 90);
      });
    }

    const footerRotateLeftBtn = card.querySelector(".page-rotate-left-btn");
    if (footerRotateLeftBtn) {
      footerRotateLeftBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rotatePage(pageNum, -90);
      });
    }

    const footerRotateBtn = card.querySelector(".page-rotate-btn");
    if (footerRotateBtn) {
      footerRotateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rotatePage(pageNum, 90);
      });
    }

    const footerResetBtn = card.querySelector(".page-reset-btn");
    if (footerResetBtn) {
      footerResetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        resetPage(pageNum);
      });
    }

    return card;
  }

  // =============================================
  //  LOW-RAM PAGE THUMBNAIL RENDERER
  // =============================================
  async function processRenderQueue() {
    if (
      isRenderingQueue ||
      renderQueue.length === 0 ||
      state.isDedicatedRendering
    )
      return;
    isRenderingQueue = true;

    while (renderQueue.length > 0) {
      if (state.isDedicatedRendering) {
        renderQueue.length = 0;
        break;
      }

      if (isScrolling) {
        // Pauses rendering during active scrolling; resumes 200ms after user settles
        break;
      }

      const item = renderQueue.shift();
      if (!item || !item.cardEl || !item.cardEl.isConnected) continue;

      if (item.cardEl.dataset.rendered === "true") continue;

      try {
        if (thumbnailCache.has(item.pageNum)) {
          applyCachedThumbnail(item.cardEl, item.pageNum);
        } else {
          await renderPageOffscreen(item.pageNum);
          if (item.cardEl.isConnected) {
            applyCachedThumbnail(item.cardEl, item.pageNum);
          }
        }
      } catch (err) {
        console.warn("Could not render page", item.pageNum, err);
        const container = item.cardEl.querySelector(
          `#thumbContainer_${item.pageNum}`,
        );
        if (container) {
          container.innerHTML = `<span style="color:var(--text-3);font-size:0.8rem;">Page ${item.pageNum}</span>`;
        }
      }

      // Micro-yield to keep the UI smooth and responsive
      await new Promise((resolve) => setTimeout(resolve, 8));
    }

    isRenderingQueue = false;

    // Continue pumping if more tasks were enqueued during micro-yields
    if (!isScrolling && renderQueue.length > 0 && !state.isDedicatedRendering) {
      processRenderQueue();
    }
  }

  // =============================================
  //  ROTATION STATE & SMOOTH VISUAL TRANSFORMS
  // =============================================
  function pushHistory() {
    state.history.push(new Map(state.rotations));
    if (state.history.length > 30) state.history.shift();
    state.future = [];
    updateHistoryButtons();
  }

  function rotatePage(pageNum, deltaAngle, recordHistory = true) {
    if (recordHistory) pushHistory();

    const currentDelta = state.rotations.get(pageNum) || 0;
    let newDelta = (currentDelta + deltaAngle) % 360;
    if (newDelta < 0) newDelta += 360;

    if (newDelta === 0) {
      state.rotations.delete(pageNum);
    } else {
      state.rotations.set(pageNum, newDelta);
    }

    updateCardVisual(pageNum);
    updateSummary();
    applyViewFilter();
    scheduleDBSave();
  }

  function resetPage(pageNum, recordHistory = true) {
    if (!state.rotations.has(pageNum)) return;
    if (recordHistory) pushHistory();

    state.rotations.delete(pageNum);
    updateCardVisual(pageNum);
    updateSummary();
    applyViewFilter();
    scheduleDBSave();
  }

  function rotateBatch(pages, deltaAngle) {
    if (!pages || pages.length === 0) return;
    pushHistory();

    pages.forEach((p) => {
      const cur = state.rotations.get(p) || 0;
      let next = (cur + deltaAngle) % 360;
      if (next < 0) next += 360;
      if (next === 0) {
        state.rotations.delete(p);
      } else {
        state.rotations.set(p, next);
      }
      updateCardVisual(p);
    });

    updateSummary();
    applyViewFilter();
    scheduleDBSave();
  }

  function rotateAll(deltaAngle) {
    pushHistory();
    for (let p = 1; p <= state.totalPages; p++) {
      const cur = state.rotations.get(p) || 0;
      let next = (cur + deltaAngle) % 360;
      if (next < 0) next += 360;
      if (next === 0) {
        state.rotations.delete(p);
      } else {
        state.rotations.set(p, next);
      }
      updateCardVisual(p);
    }
    updateSummary();
    applyViewFilter();
    scheduleDBSave();
    showToast(
      `Rotated all ${state.totalPages} pages ${deltaAngle > 0 ? `+${deltaAngle}°` : `${deltaAngle}°`}.`,
      "info",
    );
  }

  function resetAllRotations() {
    if (state.rotations.size === 0) {
      showToast("No rotations to reset.", "info");
      return;
    }
    pushHistory();
    state.rotations.clear();
    for (let p = 1; p <= state.totalPages; p++) {
      updateCardVisual(p);
    }
    updateSummary();
    applyViewFilter();
    scheduleDBSave();
    showToast("Reset all page rotations to original orientation.", "info");
  }

  // Smart Fix: Make All Portrait
  function makeAllPortrait() {
    pushHistory();
    let adjusted = 0;
    for (let p = 1; p <= state.totalPages; p++) {
      const meta = state.pageMeta.get(p);
      const isOriginallyLandscape = meta ? meta.isLandscape : false;
      const delta = state.rotations.get(p) || 0;
      const isCurrentlyLandscape =
        (isOriginallyLandscape && delta % 180 === 0) ||
        (!isOriginallyLandscape && delta % 180 !== 0);
      if (isCurrentlyLandscape) {
        let next = (delta + 90) % 360;
        if (next === 0) {
          state.rotations.delete(p);
        } else {
          state.rotations.set(p, next);
        }
        updateCardVisual(p);
        adjusted++;
      }
    }
    updateSummary();
    applyViewFilter();
    scheduleDBSave();
    showToast(
      `Smart Fix: Adjusted ${adjusted} page(s) to Portrait orientation.`,
      "success",
    );
  }

  // Smart Fix: Make All Landscape
  function makeAllLandscape() {
    pushHistory();
    let adjusted = 0;
    for (let p = 1; p <= state.totalPages; p++) {
      const meta = state.pageMeta.get(p);
      const isOriginallyLandscape = meta ? meta.isLandscape : false;
      const delta = state.rotations.get(p) || 0;
      const isCurrentlyPortrait =
        (!isOriginallyLandscape && delta % 180 === 0) ||
        (isOriginallyLandscape && delta % 180 !== 0);
      if (isCurrentlyPortrait) {
        let next = (delta + 90) % 360;
        if (next === 0) {
          state.rotations.delete(p);
        } else {
          state.rotations.set(p, next);
        }
        updateCardVisual(p);
        adjusted++;
      }
    }
    updateSummary();
    applyViewFilter();
    scheduleDBSave();
    showToast(
      `Smart Fix: Adjusted ${adjusted} page(s) to Landscape orientation.`,
      "success",
    );
  }

  // Update card transform and badges
  function updateCardTransform(pageNum) {
    const container = document.getElementById(`thumbContainer_${pageNum}`);
    if (!container) return;

    const delta = state.rotations.get(pageNum) || 0;
    const meta = state.pageMeta.get(pageNum);
    const aspect = meta && meta.aspect ? meta.aspect : 0.707;

    let scale = 1.0;
    if (delta % 180 !== 0) {
      scale = aspect < 1 ? aspect : 1 / aspect;
      scale = Math.min(1.0, Math.max(0.72, scale));
    }

    container.style.transform = `rotate(${delta}deg) scale(${scale})`;
  }

  function updateCardVisual(pageNum) {
    const card = pagesGrid.querySelector(`.page-card[data-page="${pageNum}"]`);
    if (!card) return;

    const delta = state.rotations.get(pageNum) || 0;
    const isRotated = delta !== 0;

    card.classList.toggle("rotated", isRotated);

    const angleBadge = card.querySelector(`#angleBadge_${pageNum}`);
    if (angleBadge) {
      const span = angleBadge.querySelector("span");
      if (span) span.textContent = `+${delta}°`;
    }

    const footerText = card.querySelector(`#footerText_${pageNum}`);
    if (footerText) {
      footerText.textContent = isRotated ? `Rotated ${delta}°` : "Rotate 90°";
    }

    const resetBtn = card.querySelector(".page-reset-btn");
    if (resetBtn) {
      resetBtn.style.display = isRotated ? "inline-flex" : "none";
    }

    updateCardTransform(pageNum);
  }

  let summaryRAF = null;
  function updateSummary() {
    if (state.isDedicatedRendering) return;
    if (summaryRAF) cancelAnimationFrame(summaryRAF);
    summaryRAF = requestAnimationFrame(() => {
      const rotCount = state.rotations.size;
      const unchangedCount = state.totalPages - rotCount;

      if (rotatedCountEl) rotatedCountEl.textContent = rotCount;
      if (unchangedCountEl) unchangedCountEl.textContent = unchangedCount;
      if (totalCountEl) totalCountEl.textContent = state.totalPages;

      const tabAll = document.querySelector('.filter-tab[data-filter="all"]');
      const tabRot = document.querySelector(
        '.filter-tab[data-filter="rotated"]',
      );
      const tabUnch = document.querySelector(
        '.filter-tab[data-filter="unchanged"]',
      );
      if (tabAll) tabAll.textContent = `All Pages (${state.totalPages})`;
      if (tabRot) tabRot.textContent = `Rotated (${rotCount})`;
      if (tabUnch) tabUnch.textContent = `Unchanged (${unchangedCount})`;

      if (summaryBanner) {
        summaryBanner.classList.toggle("has-rotations", rotCount > 0);
      }

      if (actionSummaryText) {
        if (rotCount === 0) {
          actionSummaryText.textContent =
            "Rotate any page above, or click 'Rotate All' to rotate the entire document";
        } else {
          actionSummaryText.innerHTML = `Ready — <strong class="summary-badge-rot">${rotCount} page${rotCount !== 1 ? "s" : ""}</strong> rotated, <strong class="summary-badge-orig">${unchangedCount} page${unchangedCount !== 1 ? "s" : ""}</strong> preserved in original orientation`;
        }
      }

      if (rotatePdfBtn) {
        rotatePdfBtn.disabled = rotCount === 0;
      }
    });
  }

  // =============================================
  //  VIEW FILTERS (All / Rotated / Unchanged)
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
      const isRotated = state.rotations.has(pageNum);

      if (state.currentFilter === "rotated") {
        card.classList.toggle("filter-hidden", !isRotated);
      } else if (state.currentFilter === "unchanged") {
        card.classList.toggle("filter-hidden", isRotated);
      } else {
        card.classList.remove("filter-hidden");
      }
    });

    buildPrioritizedQueueAndProcess();
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

    buildPrioritizedQueueAndProcess();
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
      state.future.push(new Map(state.rotations));
      state.rotations = state.history.pop();
      for (let p = 1; p <= state.totalPages; p++) {
        updateCardVisual(p);
      }
      updateHistoryButtons();
      updateSummary();
      applyViewFilter();
      scheduleDBSave();
      showToast("Undone last rotation change.", "info");
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      if (!state.future.length) return;
      state.history.push(new Map(state.rotations));
      state.rotations = state.future.pop();
      for (let p = 1; p <= state.totalPages; p++) {
        updateCardVisual(p);
      }
      updateHistoryButtons();
      updateSummary();
      applyViewFilter();
      scheduleDBSave();
      showToast("Redone rotation change.", "info");
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
  //  TOOLBAR ACTION HANDLERS
  // =============================================
  if (rotateAllRightBtn) {
    rotateAllRightBtn.addEventListener("click", () => rotateAll(90));
  }
  if (rotateAllLeftBtn) {
    rotateAllLeftBtn.addEventListener("click", () => rotateAll(-90));
  }
  if (flipAllBtn) {
    flipAllBtn.addEventListener("click", () => rotateAll(180));
  }
  if (makeAllPortraitBtn) {
    makeAllPortraitBtn.addEventListener("click", makeAllPortrait);
  }
  if (makeAllLandscapeBtn) {
    makeAllLandscapeBtn.addEventListener("click", makeAllLandscape);
  }
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", resetAllRotations);
  }

  // Range parser helper
  function parseRangeString(str, maxPages) {
    const pages = new Set();
    const parts = str.split(/[,;\s]+/).filter(Boolean);

    for (const part of parts) {
      if (part.includes("-")) {
        const [startStr, endStr] = part.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let p = Math.max(1, start); p <= Math.min(maxPages, end); p++) {
            pages.add(p);
          }
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= maxPages) {
          pages.add(num);
        }
      }
    }
    return Array.from(pages);
  }

  function applyRangeRotation(deltaAngle) {
    const val = rangeInput ? rangeInput.value.trim() : "";
    if (!val) {
      showToast(
        "Please enter page numbers or ranges (e.g. 1, 3-5, 8).",
        "warning",
      );
      if (rangeInput) rangeInput.focus();
      return;
    }
    const targetPages = parseRangeString(val, state.totalPages);
    if (targetPages.length === 0) {
      showToast("No valid page numbers found in the entered range.", "warning");
      return;
    }
    rotateBatch(targetPages, deltaAngle);
    showToast(
      `Rotated ${targetPages.length} page(s) ${deltaAngle > 0 ? `+${deltaAngle}°` : `${deltaAngle}°`}.`,
      "success",
    );
  }

  if (rotateRangeRightBtn) {
    rotateRangeRightBtn.addEventListener("click", () => applyRangeRotation(90));
  }
  if (rotateRangeLeftBtn) {
    rotateRangeLeftBtn.addEventListener("click", () => applyRangeRotation(-90));
  }
  if (flipRangeBtn) {
    flipRangeBtn.addEventListener("click", () => applyRangeRotation(180));
  }

  // Selection Presets
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      const all = [];
      for (let i = 1; i <= state.totalPages; i++) all.push(i);
      if (rangeInput) rangeInput.value = `1-${state.totalPages}`;
      showToast(`Selected all ${state.totalPages} pages.`, "info");
    });
  }

  if (oddPagesBtn) {
    oddPagesBtn.addEventListener("click", () => {
      const odd = [];
      for (let i = 1; i <= state.totalPages; i += 2) odd.push(i);
      if (rangeInput) rangeInput.value = odd.join(", ");
      showToast(`Selected ${odd.length} odd pages.`, "info");
    });
  }

  if (evenPagesBtn) {
    evenPagesBtn.addEventListener("click", () => {
      const even = [];
      for (let i = 2; i <= state.totalPages; i += 2) even.push(i);
      if (rangeInput) rangeInput.value = even.join(", ");
      showToast(`Selected ${even.length} even pages.`, "info");
    });
  }

  if (portraitPagesBtn) {
    portraitPagesBtn.addEventListener("click", () => {
      const portrait = [];
      for (let i = 1; i <= state.totalPages; i++) {
        const meta = state.pageMeta.get(i);
        if (meta && !meta.isLandscape) portrait.push(i);
      }
      if (portrait.length > 0) {
        if (rangeInput) rangeInput.value = portrait.join(", ");
        showToast(`Selected ${portrait.length} portrait pages.`, "info");
      } else {
        showToast("No portrait pages detected.", "info");
      }
    });
  }

  if (landscapePagesBtn) {
    landscapePagesBtn.addEventListener("click", () => {
      const landscape = [];
      for (let i = 1; i <= state.totalPages; i++) {
        const meta = state.pageMeta.get(i);
        if (meta && meta.isLandscape) landscape.push(i);
      }
      if (landscape.length > 0) {
        if (rangeInput) rangeInput.value = landscape.join(", ");
        showToast(`Selected ${landscape.length} landscape pages.`, "info");
      } else {
        showToast("No landscape pages detected.", "info");
      }
    });
  }

  // =============================================
  //  HIGH-RES PAGE INSPECTOR MODAL
  // =============================================
  function openInspector(pageNum) {
    state.inspectingPage = pageNum;
    if (inspectModalOverlay) {
      inspectModalOverlay.classList.add("open");
      document.body.style.overflow = "hidden";
    }
    if (inspectModalTitle) {
      const delta = state.rotations.get(pageNum) || 0;
      inspectModalTitle.textContent = `Page ${pageNum} of ${state.totalPages} ${delta !== 0 ? `(+${delta}°)` : ""}`;
    }
    renderInspectorPage(pageNum);
  }

  function closeInspector() {
    if (inspectModalOverlay) {
      inspectModalOverlay.classList.remove("open");
      document.body.style.overflow = "";
    }
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
  }

  async function renderInspectorPage(pageNum) {
    if (!state.pdfJsDoc || !inspectModalBody) return;

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

    const delta = state.rotations.get(pageNum) || 0;
    const cacheKey = `${pageNum}_${delta}`;
    if (inspectCache.has(cacheKey)) {
      const cachedUrl = inspectCache.get(cacheKey);
      inspectModalBody.innerHTML = `
        <div class="inspect-thumb-wrapper" style="transform: rotate(${delta}deg);">
          <img class="inspect-canvas" src="${cachedUrl}" alt="Page ${pageNum} Preview" />
        </div>
      `;
      return;
    }

    // Instant progressive preview from thumbnail cache while crisp 2x finishes
    const quickThumb = thumbnailCache.get(pageNum);
    if (quickThumb && quickThumb.dataUrl) {
      inspectModalBody.innerHTML = `
        <div class="inspect-thumb-wrapper" style="transform: rotate(${delta}deg); position: relative;">
          <img class="inspect-canvas" src="${quickThumb.dataUrl}" alt="Page ${pageNum} Quick Preview" style="filter: blur(1px); opacity: 0.88;" />
          <div style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.72); color: #ffffff; padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; display: inline-flex; align-items: center; gap: 8px; backdrop-filter: blur(6px); pointer-events: none; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <div class="spinner" style="width: 13px; height: 13px; border-width: 2px;"></div>
            <span>Refining crisp 2x details…</span>
          </div>
        </div>
      `;
    } else {
      inspectModalBody.innerHTML = `
        <div class="page-loading" style="min-height:260px;">
          <div class="spinner"></div>
          <span>Rendering high-resolution preview for Page ${pageNum}…</span>
        </div>
      `;
    }

    try {
      const page = await state.pdfJsDoc.getPage(pageNum);
      currentInspectPageProxy = page;

      const unscaled = page.getViewport({ scale: 1.0 });
      const scale = Math.min(2.0, 900 / unscaled.width);
      const viewport = page.getViewport({ scale });

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

      if (state.inspectingPage !== pageNum) {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
        return;
      }

      const highResDataUrl = canvas.toDataURL("image/jpeg", 0.85);
      canvas.width = 0;
      canvas.height = 0;

      if (inspectCache.size >= 12) {
        const firstKey = inspectCache.keys().next().value;
        inspectCache.delete(firstKey);
      }
      inspectCache.set(cacheKey, highResDataUrl);

      inspectModalBody.innerHTML = `
        <div class="inspect-thumb-wrapper" style="transform: rotate(${delta}deg);">
          <img class="inspect-canvas" src="${highResDataUrl}" alt="Page ${pageNum} Preview" />
        </div>
      `;

      page.cleanup();
      state.pdfJsDoc.cleanup();
    } catch (err) {
      if (err && err.name === "RenderingCancelledException") return;
      console.warn("Inspector render error:", err);
      if (state.inspectingPage === pageNum) {
        inspectModalBody.innerHTML = `<p style="color:var(--accent);">Failed to render preview: ${err.message || err}</p>`;
      }
    }
  }

  if (inspectCloseBtn)
    inspectCloseBtn.addEventListener("click", closeInspector);
  if (inspectModalOverlay) {
    inspectModalOverlay.addEventListener("click", (e) => {
      if (e.target === inspectModalOverlay) closeInspector();
    });
  }

  if (inspectPrevBtn) {
    inspectPrevBtn.addEventListener("click", () => {
      if (state.inspectingPage > 1) {
        state.inspectingPage--;
        openInspector(state.inspectingPage);
      }
    });
  }

  if (inspectNextBtn) {
    inspectNextBtn.addEventListener("click", () => {
      if (state.inspectingPage < state.totalPages) {
        state.inspectingPage++;
        openInspector(state.inspectingPage);
      }
    });
  }

  if (inspectRotateLeftBtn) {
    inspectRotateLeftBtn.addEventListener("click", () => {
      rotatePage(state.inspectingPage, -90);
      openInspector(state.inspectingPage);
    });
  }

  if (inspectRotateRightBtn) {
    inspectRotateRightBtn.addEventListener("click", () => {
      rotatePage(state.inspectingPage, 90);
      openInspector(state.inspectingPage);
    });
  }

  if (inspectFlipBtn) {
    inspectFlipBtn.addEventListener("click", () => {
      rotatePage(state.inspectingPage, 180);
      openInspector(state.inspectingPage);
    });
  }

  if (inspectResetBtn) {
    inspectResetBtn.addEventListener("click", () => {
      resetPage(state.inspectingPage);
      openInspector(state.inspectingPage);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (inspectModalOverlay && inspectModalOverlay.classList.contains("open")) {
      if (e.key === "Escape") closeInspector();
      if (e.key === "ArrowLeft" && inspectPrevBtn) inspectPrevBtn.click();
      if (e.key === "ArrowRight" && inspectNextBtn) inspectNextBtn.click();
    }
  });

  // =============================================
  //  PDF ROTATION ENGINE & UNIVERSAL POPUP EXPORT
  // =============================================
  if (rotatePdfBtn) {
    rotatePdfBtn.addEventListener("click", () => generateRotatedPdf());
  }

  async function generateRotatedPdf() {
    const rotCount = state.rotations.size;

    if (rotCount === 0) {
      showToast(
        "No pages have been rotated. Please rotate at least one page before downloading.",
        "warning",
      );
      return;
    }

    const rotateStartTime = performance.now();
    enterDedicatedRenderMode();

    showLoadingModal(
      true,
      "Applying Page Rotations…",
      "Dedicated render mode active: updating PDF document catalog losslessly…",
      15,
      "⚡ 100% Dedicated Render Mode",
    );

    try {
      let blob = state.currentBlob;
      if (!blob) {
        updateLoadingProgress(20, "Retrieving document from local storage…");
        const db = await openDB();
        const tx = db.transaction(["rotate_data"], "readonly");
        const req = tx.objectStore("rotate_data").get("file");
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
      await new Promise((r) => setTimeout(r, 60));

      let srcBuffer = await blob.arrayBuffer();

      updateLoadingProgress(45, "Loading PDF catalog…");
      await new Promise((r) => setTimeout(r, 20));

      let pdfDoc = await PDFLib.PDFDocument.load(srcBuffer, {
        ignoreEncryption: true,
        parseSpeed: Infinity,
        updateMetadata: false,
      });

      srcBuffer = null;

      updateLoadingProgress(
        60,
        `Applying orientation transforms to ${rotCount} page(s)…`,
      );
      await new Promise((r) => setTimeout(r, 10));

      const totalPages = pdfDoc.getPageCount();
      for (let i = 0; i < totalPages; i++) {
        const pageNum = i + 1;
        const delta = state.rotations.get(pageNum) || 0;
        if (delta !== 0) {
          const page = pdfDoc.getPage(i);
          const origAngle = page.getRotation().angle || 0;
          let finalAngle = (origAngle + delta) % 360;
          if (finalAngle < 0) finalAngle += 360;
          page.setRotation(PDFLib.degrees(finalAngle));
        }
      }

      updateLoadingProgress(85, "Finalizing and serializing PDF structure…");
      await new Promise((r) => setTimeout(r, 15));

      let outputBytes = await pdfDoc.save({
        useObjectStreams: false,
        objectsPerTick: 150,
      });

      pdfDoc = null;

      updateLoadingProgress(98, "Preparing download file…");
      await new Promise((r) => setTimeout(r, 20));

      const outBlob = new Blob([outputBytes], { type: "application/pdf" });
      outputBytes = null;
      lastGeneratedBlob = outBlob;

      const baseName = state.fileName.replace(/\.[^/.]+$/, "");
      lastGeneratedName = `${baseName}-rotated.pdf`;

      updateLoadingProgress(100, "Done! Ready for download.");
      await new Promise((r) => setTimeout(r, 150));

      showLoadingModal(false);

      // Update Results Card
      if (resultsCard) {
        resultsCard.classList.add("active");
        if (origPagesStat)
          origPagesStat.textContent = `${state.totalPages} pages`;
        if (rotatedPagesStat)
          rotatedPagesStat.textContent = `${rotCount} pages rotated`;
        if (newSizeStat) newSizeStat.textContent = fmtBytes(outBlob.size);
        resultsCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      // Trigger Universal Popup
      if (
        window.PDFMasterPopup &&
        typeof window.PDFMasterPopup.show === "function"
      ) {
        window.PDFMasterPopup.show({
          title: "Thank You for Using PDF<span>Master</span>!",
          desc: `Your document's pages have been rotated permanently and losslessly. Everything was processed on your device for <strong>100% privacy</strong>.`,
          fileName: lastGeneratedName,
          fileType: "pdf",
          fileDetails: `${state.totalPages} pages (${rotCount} rotated) • ${fmtBytes(outBlob.size)} • 100% Private`,
          downloadText: "Download Rotated PDF",
          toolName: "Rotate PDF",
          durationMs: Math.max(
            1,
            Math.round(performance.now() - rotateStartTime),
          ),
          blob: outBlob,
          onSecondary: () => {
            if (resultsCard)
              resultsCard.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
          },
        });
      } else {
        downloadBlob(outBlob, lastGeneratedName);
        showToast(
          `Success! Rotated ${rotCount} page(s) and downloaded "${lastGeneratedName}"`,
          "success",
          5000,
        );
      }
    } catch (err) {
      showLoadingModal(false);
      console.error("PDF rotation error:", err);
      showToast(
        "Failed to generate rotated PDF: " + (err.message || err),
        "error",
        5000,
      );
    } finally {
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

  if (modifyMoreBtn) {
    modifyMoreBtn.addEventListener("click", () => {
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
      state.rotations.clear();
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
