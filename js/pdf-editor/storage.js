/**
 * PDFMaster PDF Editor - IndexedDB Storage & Auto-Recovery
 * Persistent session storage, autosave debouncing, document recovery, and badge status.
 */
"use strict";


/* ═══════════════════════════════════════════════════
   INDEXEDDB RECOVERY MODE LOGIC
═══════════════════════════════════════════════════ */
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function (resolve, reject) {
    var DB_NAME = "pdfmaster_editor_db";
    var DB_VERSION = 2;
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
      if (!db.objectStoreNames.contains("editor_data")) {
        db.createObjectStore("editor_data");
      }
      // v2: raw file bytes now live here, as a Blob, separate from annotations.
      // Written once per document instead of on every autosave.
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files");
      }
    };
    req.onsuccess = function (e) {
      resolve(e.target.result);
    };
    req.onerror = function (e) {
      reject(e.target.error);
    };
  });
  return dbPromise;
}

function scheduleDBSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    saveSessionMetaToDB();
    // Retries the (larger, one-time) file write if it hasn't succeeded yet —
    // e.g. it was still in flight or failed transiently on load.
    if (currentFileBlob && !fileBlobPersisted) {
      persistFileBlobToDB(currentFileBlob, fileName);
    }
  }, 400);
}

// Writes the raw PDF once as a Blob. IndexedDB stores Blobs without requiring
// the browser to hold the whole thing in JS heap, so this is cheap even for a
// huge file — and unlike the old approach, it never gets rewritten just because
// the user added an annotation.
function persistFileBlobToDB(blob, name) {
  return openDB()
    .then(function (db) {
      return new Promise(function (resolve) {
        var tx;
        try {
          tx = db.transaction(["files"], "readwrite");
        } catch (e) {
          resolve(false);
          return;
        }
        tx.objectStore("files").put(
          {
            fileName: name,
            blob: blob,
            size: blob.size,
            timestamp: Date.now(),
          },
          "current",
        );
        tx.oncomplete = function () {
          fileBlobPersisted = true;
          resolve(true);
        };
        tx.onerror = function () {
          resolve(false);
        };
        tx.onabort = function () {
          resolve(false);
        };
      });
    })
    .catch(function (err) {
      // Most likely a storage-quota error on a very large file. Editing keeps
      // working from the in-memory Blob reference either way — this only
      // affects whether the session can be recovered after a reload/crash.
      console.warn("Could not persist file to IndexedDB:", err);
      return false;
    });
}

// Cheap, frequent autosave: annotations + small session settings only.
function saveSessionMetaToDB() {
  if (!currentFileBlob || !fileName) return Promise.resolve(false);
  return openDB()
    .then(function (db) {
      var tx = db.transaction(["settings", "editor_data"], "readwrite");
      var settingsStore = tx.objectStore("settings");
      var dataStore = tx.objectStore("editor_data");

      settingsStore.put(
        {
          timestamp: Date.now(),
          fileName: fileName,
          numPages: numPages,
          currentPage: currentPage,
          zoomFactor: zoomFactor,
        },
        "session",
      );

      dataStore.put(
        {
          fileName: fileName,
          annotationsByPage: annotationsByPage,
          pageRotations: pageRotations,
          timestamp: Date.now(),
        },
        "document",
      );

      updateRecoveryBadge(true);
      return true;
    })
    .catch(function (err) {
      console.warn("IndexedDB save failed:", err);
      return false;
    });
}

function loadSessionFromDB(isManual) {
  return openDB()
    .then(function (db) {
      var tx = db.transaction(
        ["settings", "editor_data", "files"],
        "readonly",
      );
      var sessionReq = tx.objectStore("settings").get("session");
      var dataReq = tx.objectStore("editor_data").get("document");
      var filesReq = tx.objectStore("files").get("current");

      return Promise.all([
        new Promise(function (res) {
          sessionReq.onsuccess = function () {
            res(sessionReq.result);
          };
          sessionReq.onerror = function () {
            res(null);
          };
        }),
        new Promise(function (res) {
          dataReq.onsuccess = function () {
            res(dataReq.result);
          };
          dataReq.onerror = function () {
            res(null);
          };
        }),
        new Promise(function (res) {
          filesReq.onsuccess = function () {
            res(filesReq.result);
          };
          filesReq.onerror = function () {
            res(null);
          };
        }),
      ]);
    })
    .then(function (results) {
      var session = results[0];
      var data = results[1];
      var filesRecord = results[2];

      // New (v2) sessions keep the blob in "files". Older (v1) sessions kept
      // the whole file as an ArrayBuffer inline in "editor_data" — read that
      // as a one-time fallback and migrate it into the new store below.
      var blob = null;
      var name = null;
      var alreadyInNewStore = false;
      if (filesRecord && filesRecord.blob) {
        blob = filesRecord.blob;
        name = filesRecord.fileName;
        alreadyInNewStore = true;
      } else if (data && data.bytes) {
        blob = new Blob([data.bytes], { type: "application/pdf" });
        name = data.fileName;
      }

      if (!blob) {
        updateRecoveryBadge(false);
        if (isManual) {
          window.showToast(
            "No stored session found in recovery storage.",
            "error",
          );
        }
        return false;
      }

      showEditor();
      return ensureLibraries()
        .then(function () {
          currentFileBlob = blob;
          fileBlobPersisted = alreadyInNewStore;
          return openPdfFromBlob(blob);
        })
        .then(function (doc) {
          pdfDoc = doc;
          numPages = doc.numPages;
          fileName = name || (data && data.fileName) || "document.pdf";
          annotationsByPage = (data && data.annotationsByPage) || {};
          pageRotations = (data && data.pageRotations) || {};
          Object.keys(annotationsByPage).forEach(function (p) {
            cleanPageAnnotations(p);
          });
          undoHistoryStack = [];
          redoHistoryStack = [];
          imageElCache = {};
          selectedAnnotation = null;
          currentPage = (session && session.currentPage) || 1;
          zoomFactor = (session && session.zoomFactor) || 1;
          pageDimsCache = {};
          document.getElementById("editor-filename").textContent = fileName;
          updateUndoRedoButtons();
          setActiveTool("select");
          updateRecoveryBadge(true);
          if (!alreadyInNewStore) {
            persistFileBlobToDB(blob, fileName);
          }
          return renderPage(currentPage);
        })
        .then(function () {
          if (isManual) {
            window.showToast(
              "Restored '" +
                fileName +
                "' and your annotations successfully!",
              "success",
              4500,
            );
          }
          return true;
        });
    })
    .catch(function (err) {
      console.warn("IndexedDB load failed:", err);
      if (isManual) {
        window.showToast("Could not access recovery storage.", "error");
      }
      return false;
    });
}

function clearSessionFromDB() {
  return openDB()
    .then(function (db) {
      var tx = db.transaction(
        ["settings", "editor_data", "files"],
        "readwrite",
      );
      tx.objectStore("settings").clear();
      tx.objectStore("editor_data").clear();
      tx.objectStore("files").clear();
      updateRecoveryBadge(false);
    })
    .catch(function (err) {
      console.warn("IndexedDB clear failed:", err);
    });
}

function checkStoredSessionAvailable(notifyOnFound) {
  return openDB()
    .then(function (db) {
      var tx = db.transaction(["editor_data", "files"], "readonly");
      var dataReq = tx.objectStore("editor_data").get("document");
      var filesReq = tx.objectStore("files").get("current");
      return Promise.all([
        new Promise(function (res) {
          dataReq.onsuccess = function () {
            res(dataReq.result);
          };
          dataReq.onerror = function () {
            res(null);
          };
        }),
        new Promise(function (res) {
          filesReq.onsuccess = function () {
            res(filesReq.result);
          };
          filesReq.onerror = function () {
            res(null);
          };
        }),
      ]);
    })
    .then(function (results) {
      var data = results[0];
      var filesRecord = results[1];
      var hasData = !!(
        (filesRecord && filesRecord.blob) ||
        (data && data.bytes)
      );
      updateRecoveryBadge(hasData);
      if (hasData && notifyOnFound && !currentFileBlob) {
        var storedName =
          (filesRecord && filesRecord.fileName) || (data && data.fileName);
        var name = storedName ? "'" + storedName + "'" : "Previous document";
        window.showToast(
          "Last session (" + name + ") is available. Click to restore.",
          "info",
          8000,
          function () {
            loadSessionFromDB(true);
          },
          "Restore",
        );
      }
      return hasData;
    })
    .catch(function () {
      updateRecoveryBadge(false);
      return false;
    });
}

function updateRecoveryBadge(hasData) {
  var badge = document.getElementById("recoveryBadge");
  if (badge) {
    badge.style.display = hasData ? "block" : "none";
  }
}

