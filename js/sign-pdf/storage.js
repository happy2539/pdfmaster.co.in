/**
 * PDFMaster - Sign PDF Tool
 * Module: storage.js
 * IndexedDB session persistence, localStorage saved signatures, and undo/redo history
 */
(function () {
  "use strict";

  window.PDFSign = window.PDFSign || {};
  const PDFSign = window.PDFSign;
  const state = PDFSign.state;

  // =============================================
  //  HISTORY (UNDO / REDO)
  // =============================================
  PDFSign.pushHistory = function () {
    const snapshot = JSON.stringify(state.items);
    state.history.push(snapshot);
    if (state.history.length > PDFSign.MAX_HISTORY) {
      state.history.shift();
    }
    state.future = []; // clear redo
    PDFSign.updateUndoRedoBtns();
    PDFSign.autoSaveSession();
  };

  PDFSign.undo = function () {
    if (state.history.length === 0) return;
    const currentSnapshot = JSON.stringify(state.items);
    state.future.push(currentSnapshot);
    const prevSnapshot = state.history.pop();
    state.items = JSON.parse(prevSnapshot);
    state.selectedItemId = null;
    if (PDFSign.renderOverlayItems) PDFSign.renderOverlayItems();
    if (PDFSign.updateThumbnailBadges) PDFSign.updateThumbnailBadges();
    PDFSign.updateUndoRedoBtns();
    PDFSign.autoSaveSession();
    PDFSign.showToast("Undo");
  };

  PDFSign.redo = function () {
    if (state.future.length === 0) return;
    const currentSnapshot = JSON.stringify(state.items);
    state.history.push(currentSnapshot);
    const nextSnapshot = state.future.pop();
    state.items = JSON.parse(nextSnapshot);
    state.selectedItemId = null;
    if (PDFSign.renderOverlayItems) PDFSign.renderOverlayItems();
    if (PDFSign.updateThumbnailBadges) PDFSign.updateThumbnailBadges();
    PDFSign.updateUndoRedoBtns();
    PDFSign.autoSaveSession();
    PDFSign.showToast("Redo");
  };

  PDFSign.updateUndoRedoBtns = function () {
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");
    if (undoBtn) undoBtn.disabled = state.history.length === 0;
    if (redoBtn) redoBtn.disabled = state.future.length === 0;
  };

  // =============================================
  //  INDEXEDDB SESSION PERSISTENCE
  // =============================================
  PDFSign.getDB = function () {
    if (PDFSign.dbPromise) return PDFSign.dbPromise;
    PDFSign.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(PDFSign.DB_NAME, PDFSign.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("session")) {
          db.createObjectStore("session", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return PDFSign.dbPromise;
  };

  PDFSign.autoSaveSession = async function () {
    if (!state.currentBlob) return;
    try {
      const db = await PDFSign.getDB();
      const tx = db.transaction("session", "readwrite");
      const store = tx.objectStore("session");
      await store.put({
        id: "active_session",
        fileName: state.fileName,
        fileSize: state.fileSize,
        totalPages: state.totalPages,
        blob: state.currentBlob,
        items: state.items,
        timestamp: Date.now(),
      });
      const recoveryBadge = document.getElementById("recoveryBadge");
      if (recoveryBadge) recoveryBadge.style.display = "block";
    } catch (e) {
      console.warn("IndexedDB autosave failed:", e);
    }
  };

  PDFSign.checkRecoverySession = async function () {
    try {
      const db = await PDFSign.getDB();
      const tx = db.transaction("session", "readonly");
      const store = tx.objectStore("session");
      const req = store.get("active_session");
      req.onsuccess = () => {
        const data = req.result;
        const recoveryBadge = document.getElementById("recoveryBadge");
        const recoveryBanner = document.getElementById("recoveryBanner");
        if (data && data.blob) {
          if (recoveryBadge) recoveryBadge.style.display = "block";
          if (recoveryBanner && !state.pdfJsDoc) {
            recoveryBanner.style.display = "flex";
          }
        }
      };
    } catch (e) {
      console.warn("Recovery check failed:", e);
    }
  };

  PDFSign.restoreSession = async function () {
    try {
      PDFSign.showLoading(
        true,
        "Restoring Session",
        "Retrieving document & signatures…",
      );
      const db = await PDFSign.getDB();
      const tx = db.transaction("session", "readonly");
      const store = tx.objectStore("session");
      const req = store.get("active_session");
      req.onsuccess = async () => {
        const data = req.result;
        if (data && data.blob) {
          const recoveryBanner = document.getElementById("recoveryBanner");
          if (recoveryBanner) recoveryBanner.style.display = "none";
          if (PDFSign.loadPdfFile) {
            await PDFSign.loadPdfFile(data.blob, data.fileName);
          }
          if (Array.isArray(data.items)) {
            state.items = data.items;
            if (PDFSign.renderOverlayItems) PDFSign.renderOverlayItems();
            if (PDFSign.updateThumbnailBadges) PDFSign.updateThumbnailBadges();
          }
          PDFSign.showToast("Session successfully restored!");
        }
        PDFSign.showLoading(false);
      };
    } catch (e) {
      PDFSign.showLoading(false);
      PDFSign.showToast("Could not restore previous session.");
    }
  };

  PDFSign.clearRecoverySession = async function () {
    try {
      const db = await PDFSign.getDB();
      const tx = db.transaction("session", "readwrite");
      tx.objectStore("session").delete("active_session");
      const recoveryBadge = document.getElementById("recoveryBadge");
      const recoveryBanner = document.getElementById("recoveryBanner");
      if (recoveryBadge) recoveryBadge.style.display = "none";
      if (recoveryBanner) recoveryBanner.style.display = "none";
    } catch (e) {
      console.warn("Clear session error:", e);
    }
  };

  // =============================================
  //  SAVED SIGNATURES (LOCAL STORAGE)
  // =============================================
  PDFSign.loadSavedSignatures = function () {
    try {
      const raw = localStorage.getItem(PDFSign.SAVED_SIGS_KEY);
      state.savedSignatures = raw ? JSON.parse(raw) : [];
    } catch (e) {
      state.savedSignatures = [];
    }
    PDFSign.renderSavedSignaturesGrid();
  };

  PDFSign.saveSignatureToLibrary = function (dataUrl, type = "signature") {
    if (!dataUrl) return;
    const exists = state.savedSignatures.some((s) => s.dataUrl === dataUrl);
    if (!exists) {
      state.savedSignatures.unshift({
        id: "sig_save_" + Date.now(),
        type,
        dataUrl,
        date: new Date().toLocaleDateString(),
      });
      if (state.savedSignatures.length > 20) {
        state.savedSignatures.pop();
      }
      try {
        localStorage.setItem(
          PDFSign.SAVED_SIGS_KEY,
          JSON.stringify(state.savedSignatures),
        );
      } catch (e) {
        console.warn("LocalStorage error:", e);
      }
      PDFSign.renderSavedSignaturesGrid();
    }
  };

  PDFSign.deleteSavedSignature = function (id, e) {
    if (e) e.stopPropagation();
    state.savedSignatures = state.savedSignatures.filter((s) => s.id !== id);
    try {
      localStorage.setItem(
        PDFSign.SAVED_SIGS_KEY,
        JSON.stringify(state.savedSignatures),
      );
    } catch (err) {}
    PDFSign.renderSavedSignaturesGrid();
    PDFSign.showToast("Signature removed from library");
  };

  PDFSign.renderSavedSignaturesGrid = function () {
    const savedSigsGrid = document.getElementById("savedSigsGrid");
    const savedEmptyState = document.getElementById("savedEmptyState");
    if (!savedSigsGrid) return;

    savedSigsGrid.innerHTML = "";
    if (state.savedSignatures.length === 0) {
      if (savedEmptyState) savedEmptyState.style.display = "block";
      return;
    }
    if (savedEmptyState) savedEmptyState.style.display = "none";

    state.savedSignatures.forEach((item) => {
      const card = document.createElement("div");
      card.className = "saved-sig-card";
      card.title = "Click to use this signature";

      const img = document.createElement("img");
      img.src = item.dataUrl;
      img.alt = "Saved Signature";
      card.appendChild(img);

      const delBtn = document.createElement("button");
      delBtn.className = "saved-sig-del";
      delBtn.innerHTML = "&times;";
      delBtn.title = "Delete signature";
      delBtn.addEventListener("click", (e) =>
        PDFSign.deleteSavedSignature(item.id, e),
      );
      card.appendChild(delBtn);

      card.addEventListener("click", () => {
        if (PDFSign.useSignatureData) {
          PDFSign.useSignatureData(item.dataUrl, item.type);
        }
        if (PDFSign.closeStudioModal) {
          PDFSign.closeStudioModal();
        }
      });

      savedSigsGrid.appendChild(card);
    });
  };
})();
