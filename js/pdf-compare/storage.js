/**
 * PDFMaster - Compare PDF: Storage Engine
 * IndexedDB session persistence & document recovery.
 */
(function () {
  "use strict";

  window.PDFCompare = window.PDFCompare || {};

  const { constants, state, DOM, utils } = window.PDFCompare;
  const DB_NAME = (constants && constants.DB_NAME) || "pdfmaster_compare_db";
  const DB_VERSION = (constants && constants.DB_VERSION) || 1;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("session")) {
          db.createObjectStore("session", { keyPath: "key" });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveSessionToDB() {
    if (!state.fileA || !state.fileB) return;
    try {
      const db = await openDatabase();
      const tx = db.transaction("session", "readwrite");
      const store = tx.objectStore("session");
      const data = {
        key: "current_comparison",
        timestamp: Date.now(),
        fileA: {
          name: state.fileA.name,
          size: state.fileA.size,
          buffer: state.fileA.buffer
        },
        fileB: {
          name: state.fileB.name,
          size: state.fileB.size,
          buffer: state.fileB.buffer
        },
        mode: state.currentMode,
        visualDiffSubmode: state.visualDiffSubmode,
        zoomMode: state.zoomMode,
        customZoom: state.customZoom,
        sensitivity: state.diffSensitivity
      };
      store.put(data);
      if (DOM.recoveryBadge) DOM.recoveryBadge.style.display = "block";
    } catch (err) {
      console.warn("Could not save comparison session to IndexedDB:", err);
    }
  }

  async function checkSavedSession() {
    try {
      const db = await openDatabase();
      const tx = db.transaction("session", "readonly");
      const store = tx.objectStore("session");
      const req = store.get("current_comparison");
      req.onsuccess = () => {
        if (req.result && DOM.recoveryBadge) {
          DOM.recoveryBadge.style.display = "block";
          if (DOM.recoveryBtn) {
            DOM.recoveryBtn.title = `Restore saved session: "${req.result.fileA.name}" vs "${req.result.fileB.name}"`;
          }
        }
      };
    } catch (e) {}
  }

  async function restoreSessionFromDB() {
    try {
      const db = await openDatabase();
      const tx = db.transaction("session", "readonly");
      const store = tx.objectStore("session");
      const req = store.get("current_comparison");
      req.onsuccess = async () => {
        const res = req.result;
        if (!res) {
          utils.showToast("No saved comparison session found in recovery storage.", "info");
          return;
        }

        utils.showLoading(true, "Restoring Session", "Restoring documents from local storage...");
        const loadFn = (window.PDFCompare.loader && window.PDFCompare.loader.loadFileFromBuffer) || window.PDFCompare.loadFileFromBuffer;
        if (loadFn) {
          await loadFn(res.fileA.buffer, res.fileA.name, "A");
          await loadFn(res.fileB.buffer, res.fileB.name, "B");
        }
        if (res.mode) state.currentMode = res.mode;
        if (res.visualDiffSubmode) state.visualDiffSubmode = res.visualDiffSubmode;
        if (res.zoomMode) state.zoomMode = res.zoomMode;
        if (res.customZoom) state.customZoom = res.customZoom;
        if (res.sensitivity) state.diffSensitivity = res.sensitivity;

        utils.showLoading(false);
        utils.showToast("Previous comparison session successfully restored!", "success");
        const runFn = (window.PDFCompare.main && window.PDFCompare.main.runComparison) || window.PDFCompare.runComparison;
        if (runFn) {
          await runFn();
        }
      };
    } catch (err) {
      utils.showToast("Failed to restore session.", "error");
    }
  }

  async function clearSessionFromDB() {
    try {
      const db = await openDatabase();
      const tx = db.transaction("session", "readwrite");
      tx.objectStore("session").clear();
      if (DOM.recoveryBadge) DOM.recoveryBadge.style.display = "none";
    } catch (e) {}
  }

  // Expose storage API
  window.PDFCompare.storage = {
    openDatabase,
    saveSessionToDB,
    checkSavedSession,
    restoreSessionFromDB,
    clearSessionFromDB
  };

  // Top-level debugging shortcuts
  window.PDFCompare.saveSessionToDB = saveSessionToDB;
  window.PDFCompare.checkSavedSession = checkSavedSession;
  window.PDFCompare.restoreSessionFromDB = restoreSessionFromDB;
  window.PDFCompare.clearSessionFromDB = clearSessionFromDB;
})();
