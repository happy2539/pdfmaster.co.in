/**
 * PDFMaster - IndexedDB Storage Engine
 * Manages temporary disk storage for rendered pages, session metadata, and recovery blobs.
 */
(function () {
  "use strict";

  const { DB_NAME, DB_VERSION } = window.PDFCompressConstants;
  const state = window.PDFCompressState;
  const { showToast } = window.PDFCompressUtils;

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
        if (!db.objectStoreNames.contains("compress_data")) {
          db.createObjectStore("compress_data");
        }
        if (!db.objectStoreNames.contains("rendered_pages")) {
          db.createObjectStore("rendered_pages");
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  async function storeRenderedPageInDB(pageNum, pageData) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["rendered_pages"], "readwrite");
        const store = tx.objectStore("rendered_pages");
        const req = store.put(pageData, pageNum);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`IndexedDB store page ${pageNum} fallback:`, err);
      return false;
    }
  }

  async function getRenderedPageFromDB(pageNum) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["rendered_pages"], "readonly");
        const store = tx.objectStore("rendered_pages");
        const req = store.get(pageNum);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`IndexedDB read page ${pageNum} failed:`, err);
      return null;
    }
  }

  async function clearRenderedPagesFromDB() {
    try {
      const db = await openDB();
      if (!db.objectStoreNames.contains("rendered_pages")) return;
      const tx = db.transaction(["rendered_pages"], "readwrite");
      tx.objectStore("rendered_pages").clear();
    } catch (err) {
      console.warn("IndexedDB clear rendered_pages failed:", err);
    }
  }

  async function deleteRenderedPageFromDB(pageNum) {
    try {
      const db = await openDB();
      if (!db.objectStoreNames.contains("rendered_pages")) return;
      const tx = db.transaction(["rendered_pages"], "readwrite");
      tx.objectStore("rendered_pages").delete(pageNum);
    } catch (_) {}
  }

  async function persistBlobToDB(blob, name) {
    try {
      const db = await openDB();
      const tx = db.transaction(["compress_data"], "readwrite");
      tx.objectStore("compress_data").put(
        {
          fileName: name,
          fileSize: blob.size,
          blob: blob,
          timestamp: Date.now(),
        },
        "file",
      );
      state.hasPersistedBlob = true;
    } catch (err) {
      console.warn("IndexedDB blob storage failed:", err);
    }
  }

  function scheduleDBSave() {
    clearTimeout(dbSaveTimer);
    dbSaveTimer = setTimeout(() => {
      saveSessionToDB();
    }, 400);
  }

  async function saveSessionToDB() {
    if (!state.fileName || (!state.currentBlob && !state.hasPersistedBlob))
      return false;
    try {
      const db = await openDB();
      const tx = db.transaction(["settings"], "readwrite");
      const sessionData = {
        timestamp: Date.now(),
        fileName: state.fileName,
        fileSize: state.fileSize,
        totalPages: state.totalPages,
        activePreset: state.activePreset,
        dpi: state.dpi,
        quality: state.quality,
        grayscale: state.grayscale,
        targetSizeBytes: state.targetSizeBytes,
        pageRange: state.pageRange,
      };
      tx.objectStore("settings").put(sessionData, "session");
      if (window.PDFCompressUI && window.PDFCompressUI.updateRecoveryBadge) {
        window.PDFCompressUI.updateRecoveryBadge(true);
      }
      return true;
    } catch (err) {
      console.warn("IndexedDB session save failed:", err);
      return false;
    }
  }

  async function loadSessionFromDB(isManual = false) {
    try {
      const db = await openDB();
      const tx = db.transaction(["settings", "compress_data"], "readonly");
      const settingsReq = tx.objectStore("settings").get("session");
      const dataReq = tx.objectStore("compress_data").get("file");

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

      if (!session || !data || (!data.blob && !data.bytes)) {
        if (isManual) {
          showToast("No saved compression session found in storage.", "info");
        }
        return false;
      }

      const blob =
        data.blob || new Blob([data.bytes], { type: "application/pdf" });
      state.fileName = session.fileName || data.fileName || "document.pdf";
      state.fileSize = session.fileSize || data.fileSize || blob.size;
      state.totalPages = session.totalPages || 0;
      state.activePreset =
        session.activePreset || session.preset || "recommended";
      state.dpi = session.dpi || session.customDpi || 144;
      state.quality = session.quality || session.customQuality || 0.72;
      state.grayscale = !!(session.grayscale || session.isGrayscale);
      state.targetSizeBytes =
        session.targetSizeBytes ||
        (session.targetSizeKb ? session.targetSizeKb * 1024 : null);
      state.pageRange = session.pageRange || "all";

      if (window.PDFCompressUI && window.PDFCompressUI.syncUiFromState) {
        window.PDFCompressUI.syncUiFromState();
      }

      if (window.PDFCompressMain && window.PDFCompressMain.initPdf) {
        await window.PDFCompressMain.initPdf(blob, state.fileName, true);
      }
      showToast(
        `Session restored: ${state.fileName} (${state.totalPages} pages)`,
        "success",
      );
      return true;
    } catch (err) {
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
      const stores = ["settings", "compress_data"];
      if (db.objectStoreNames.contains("rendered_pages")) {
        stores.push("rendered_pages");
      }
      const tx = db.transaction(stores, "readwrite");
      stores.forEach((s) => tx.objectStore(s).clear());
      if (window.PDFCompressUI && window.PDFCompressUI.updateRecoveryBadge) {
        window.PDFCompressUI.updateRecoveryBadge(false);
      }
    } catch (err) {
      console.warn("IndexedDB clear failed:", err);
    }
  }

  async function checkStoredSessionAvailable() {
    try {
      const db = await openDB();
      const tx = db.transaction(["compress_data"], "readonly");
      const req = tx.objectStore("compress_data").get("file");
      const data = await new Promise((res) => {
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });
      const hasData = !!(data && (data.blob || data.bytes));
      if (window.PDFCompressUI && window.PDFCompressUI.updateRecoveryBadge) {
        window.PDFCompressUI.updateRecoveryBadge(hasData);
      }
    } catch (err) {
      if (window.PDFCompressUI && window.PDFCompressUI.updateRecoveryBadge) {
        window.PDFCompressUI.updateRecoveryBadge(false);
      }
    }
  }

  window.PDFCompressStorage = {
    openDB,
    storeRenderedPageInDB,
    getRenderedPageFromDB,
    deleteRenderedPageFromDB,
    clearRenderedPagesFromDB,
    persistBlobToDB,
    scheduleDBSave,
    saveSessionToDB,
    loadSessionFromDB,
    clearSessionFromDB,
    checkStoredSessionAvailable,
  };
})();
