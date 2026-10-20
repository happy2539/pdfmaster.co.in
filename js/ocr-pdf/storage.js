/**
 * PDFMaster - OCR PDF (Optical Character Recognition)
 * Module: storage.js
 * Local IndexedDB session recovery, auto-clearing storage, and toast notifications
 */

(function () {
  "use strict";

  window.PDFMasterOCR = window.PDFMasterOCR || {};
  const OCR = window.PDFMasterOCR;
  const state = OCR.state;
  const DOM = OCR.DOM;

  /* ==========================================================================
     POPUP & TOAST NOTIFICATION SYSTEM
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

  // Persists the raw File/Blob into IndexedDB disk storage with ArrayBuffer fallback
  async function persistBlobToDB(blob, name) {
    try {
      const db = await openDB();
      try {
        // Primary path: Try direct Blob storage
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
      } catch (blobErr) {
        // Robust fallback: ArrayBuffer for sandboxed profiles or storage quotas
        const bytes = await blob.arrayBuffer();
        const tx2 = db.transaction(["ocr_data"], "readwrite");
        tx2.objectStore("ocr_data").put(
          {
            fileName: name,
            fileSize: blob.size,
            bytes: bytes,
            timestamp: Date.now(),
          },
          "file",
        );
        await new Promise((res, rej) => {
          tx2.oncomplete = () => res();
          tx2.onerror = () => rej(tx2.error);
          tx2.onabort = () => rej(tx2.error);
        });
      }
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
    if (!state.fileName || (!state.file && !state.hasPersistedBlob))
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
            if (OCR.setRangeTab) OCR.setRangeTab("first");
          } else if (session.pageRangeMode === "custom") {
            if (OCR.setRangeTab) OCR.setRangeTab("custom");
            if (DOM.customRangeInput)
              DOM.customRangeInput.value = session.pageRangeCustom || "";
            state.pageRangeCustom = session.pageRangeCustom || "";
            if (OCR.updateSelectedPages) OCR.updateSelectedPages();
          } else {
            if (OCR.setRangeTab) OCR.setRangeTab("all");
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

      if (OCR.handleFileSelected) {
        await OCR.handleFileSelected(fileObj, false); // false = do not re-persist blob unnecessarily
      }
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
          `Previous session ("${OCR.truncateFilename(name, 22)}") is available.`,
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

  // Export to namespace
  OCR.showErrorPopup = showErrorPopup;
  OCR.showToast = showToast;
  OCR.openDB = openDB;
  OCR.persistBlobToDB = persistBlobToDB;
  OCR.scheduleDBSave = scheduleDBSave;
  OCR.saveSessionToDB = saveSessionToDB;
  OCR.loadSessionFromDB = loadSessionFromDB;
  OCR.clearSessionFromDB = clearSessionFromDB;
  OCR.checkStoredSessionAvailable = checkStoredSessionAvailable;
  OCR.updateRecoveryBadge = updateRecoveryBadge;
  OCR.initRecovery = initRecovery;
})();
