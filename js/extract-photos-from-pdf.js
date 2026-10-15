/**
 * PDFMaster - Extract Photos from PDF Controller
 * Production Grade · Dual-Engine Lossless Extraction · Low-RAM Architecture · 100% Client-Side
 */

(function () {
  "use strict";

  // Configure PDF.js Worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "/assets/vendor/pdf.worker.min.js";
  }

  // =============================================
  //  DOM ELEMENTS
  // =============================================
  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const workspace = document.getElementById("workspace");
  const changeFileBtn = document.getElementById("changeFileBtn");

  const fileNameEl = document.getElementById("fileName");
  const fileSizeEl = document.getElementById("fileSize");
  const totalCountEl = document.getElementById("totalCount");

  // Configuration & Range Card
  const configCard = document.getElementById("configCard");
  const rangeModeAll = document.getElementById("rangeModeAll");
  const rangeModeCustom = document.getElementById("rangeModeCustom");
  const labelRangeAll = document.getElementById("labelRangeAll");
  const labelRangeCustom = document.getElementById("labelRangeCustom");
  const rangeAllCount = document.getElementById("rangeAllCount");
  const customRangeWrap = document.getElementById("customRangeWrap");
  const pageRangeInput = document.getElementById("pageRangeInput");
  const rangeStatusPill = document.getElementById("rangeStatusPill");
  const presetAllBtn = document.getElementById("presetAllBtn");
  const presetFirst5Btn = document.getElementById("presetFirst5Btn");
  const presetOddBtn = document.getElementById("presetOddBtn");
  const presetEvenBtn = document.getElementById("presetEvenBtn");
  const configSizeSelect = document.getElementById("configSizeSelect");
  const configGroupDupesCheck = document.getElementById("configGroupDupesCheck");
  const startExtractBtn = document.getElementById("startExtractBtn");
  const extractBtnCountText = document.getElementById("extractBtnCountText");
  const reconfigBtn = document.getElementById("reconfigBtn");

  // Stats Strip
  const statsStrip = document.getElementById("statsStrip");
  const statsTotalEl = document.getElementById("statsTotal");
  const statsDctEl = document.getElementById("statsDct");
  const statsPngEl = document.getElementById("statsPng");
  const statsSizeEl = document.getElementById("statsSize");
  const statsDuration = document.getElementById("statsDuration");
  const statsTimeItem = document.getElementById("statsTimeItem");

  // Progress UI
  const progressCard = document.getElementById("progressCard");
  const progressTitle = document.getElementById("progressTitle");
  const progressPct = document.getElementById("progressPct");
  const progressBar = document.getElementById("progressBar");
  const progressSub = document.getElementById("progressSub");

  // Toolbar & Filters
  const gallerySection = document.getElementById("gallerySection");
  const filterSizeSelect = document.getElementById("filterSizeSelect");
  const filterFormatSelect = document.getElementById("filterFormatSelect");
  const filterSortSelect = document.getElementById("filterSortSelect");
  const groupDupesCheck = document.getElementById("groupDupesCheck");
  const selectAllCheck = document.getElementById("selectAllCheck");
  const downloadSelectedBtn = document.getElementById("downloadSelectedBtn");
  const timerModalBtn = document.getElementById("timerModalBtn");
  const downloadZipBtn = document.getElementById("downloadZipBtn");

  // Gallery
  const galleryGrid = document.getElementById("galleryGrid");
  const emptyGallery = document.getElementById("emptyGallery");

  // Lightbox Modal
  const lightboxModal = document.getElementById("lightboxModal");
  const lightboxCloseBtn = document.getElementById("lightboxCloseBtn");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const lightboxRes = document.getElementById("lightboxRes");
  const lightboxMp = document.getElementById("lightboxMp");
  const lightboxSize = document.getElementById("lightboxSize");
  const lightboxFormat = document.getElementById("lightboxFormat");
  const lightboxPages = document.getElementById("lightboxPages");
  const lightboxSource = document.getElementById("lightboxSource");
  const lightboxDownloadBtn = document.getElementById("lightboxDownloadBtn");

  // Session Recovery UI
  const recoveryBtn = document.getElementById("recoveryBtn");
  const recoveryBadge = document.getElementById("recoveryBadge");
  const recoveryBanner = document.getElementById("recoveryBanner");
  const recoveryFileName = document.getElementById("recoveryFileName");
  const recoveryFileSize = document.getElementById("recoveryFileSize");
  const restoreSessionBtn = document.getElementById("restoreSessionBtn");
  const discardSessionBtn = document.getElementById("discardSessionBtn");
  const recoveryCloseBtn = document.getElementById("recoveryCloseBtn");

  // Theme & Navigation
  const themeToggle = document.getElementById("themeToggle");
  const sunIcon = document.getElementById("sunIcon");
  const moonIcon = document.getElementById("moonIcon");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sideMenu = document.getElementById("sideMenu");
  const sideOverlay = document.getElementById("sideOverlay");
  const closeMenuBtn = document.getElementById("closeMenuBtn");
  const backTop = document.getElementById("backTop");
  const toastEl = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  let toastTimer = null;

  // =============================================
  //  STATE MANAGEMENT
  // =============================================
  const state = {
    file: null,
    baseName: "document",
    pdfDoc: null,
    rawBytes: null,
    targetPages: [],
    images: [], // array of raw image candidate objects
    groupedImages: [], // array of processed & deduplicated display items
    stats: {
      rawDct: 0,
      rawJpx: 0,
      decodedPng: 0,
      totalBytes: 0,
      duration: "0.00",
    },
    selectedIds: new Set(),
    lightboxItem: null,
  };

  // =============================================
  //  THEME CONTROLLER
  // =============================================
  const THEME_KEY = "pdfmaster-theme";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    if (sunIcon && moonIcon) {
      sunIcon.style.display = theme === "dark" ? "none" : "block";
      moonIcon.style.display = theme === "dark" ? "block" : "none";
    }
  }

  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(savedTheme);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  // =============================================
  //  MOBILE SIDE MENU
  // =============================================
  if (hamburgerBtn && sideMenu && sideOverlay && closeMenuBtn) {
    hamburgerBtn.addEventListener("click", () => {
      sideMenu.classList.add("active");
      sideOverlay.classList.add("active");
      document.body.style.overflow = "hidden";
    });

    const closeNav = () => {
      sideMenu.classList.remove("active");
      sideOverlay.classList.remove("active");
      document.body.style.overflow = "";
    };

    closeMenuBtn.addEventListener("click", closeNav);
    sideOverlay.addEventListener("click", closeNav);
    sideMenu.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeNav));
  }

  // =============================================
  //  TOAST & UTILITIES
  // =============================================
  function showToast(msg) {
    if (!toastEl || !toastMsg) return;
    toastMsg.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 3200);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  async function computeHash(dataOrBlob) {
    try {
      let buffer;
      if (dataOrBlob instanceof Uint8Array) {
        buffer = dataOrBlob.buffer;
      } else if (dataOrBlob instanceof Blob) {
        buffer = await dataOrBlob.arrayBuffer();
      } else {
        return Math.random().toString(36).substring(2);
      }

      // Fast sampling for large buffers (> 2MB)
      let target = buffer;
      if (buffer.byteLength > 2 * 1024 * 1024) {
        const sample = new Uint8Array(65536 * 3);
        const src = new Uint8Array(buffer);
        sample.set(src.subarray(0, 65536), 0);
        const mid = Math.floor(src.length / 2);
        sample.set(src.subarray(mid, mid + 65536), 65536);
        sample.set(src.subarray(src.length - 65536), 65536 * 2);
        target = sample.buffer;
      }

      const hashBuf = await crypto.subtle.digest("SHA-256", target);
      const hashArr = Array.from(new Uint8Array(hashBuf));
      return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (_) {
      return Math.random().toString(36).substring(2);
    }
  }

  function parseJpgDimensions(bytes) {
    let i = 2; // skip SOI (0xFF, 0xD8)
    while (i < bytes.length - 8) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      // SOF markers: C0, C1, C2, C3, C5, C6, C7, C9, CA, CB, CD, CE, CF
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        return { width, height };
      }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len <= 0) break;
      i += 2 + len;
    }
    return null;
  }

  function canvasToBlob(canvas, type = "image/png", quality = 0.95) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  // =============================================
  //  INDEXEDDB SESSION RECOVERY & PERSISTENCE
  // =============================================
  const DB_NAME = "pdfmaster_photo_extract_db";
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
        if (!db.objectStoreNames.contains("photo_data")) {
          db.createObjectStore("photo_data");
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  async function persistBlobToDB(blob, name) {
    try {
      const db = await openDB();
      const tx = db.transaction(["photo_data"], "readwrite");
      tx.objectStore("photo_data").put(
        {
          fileName: name,
          fileSize: blob.size,
          blob: blob,
          timestamp: Date.now(),
        },
        "file"
      );
      await new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      });
      return true;
    } catch (err) {
      console.warn("Blob persist error:", err);
      return false;
    }
  }

  async function saveSessionToDB() {
    if (!state.file) return false;
    try {
      const db = await openDB();
      const tx = db.transaction(["settings"], "readwrite");
      tx.objectStore("settings").put(
        {
          fileName: state.file.name,
          fileSize: state.file.size,
          timestamp: Date.now(),
        },
        "session"
      );
      await new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      });
      if (recoveryBadge) recoveryBadge.style.display = "block";
      return true;
    } catch (err) {
      console.warn("IndexedDB save failed:", err);
      return false;
    }
  }

  let recoveryAutoHideTimer = null;

  function stopRecoveryAutoHide() {
    if (recoveryAutoHideTimer) {
      clearTimeout(recoveryAutoHideTimer);
      recoveryAutoHideTimer = null;
    }
  }

  function startRecoveryAutoHide(delayMs = 7500) {
    stopRecoveryAutoHide();
    recoveryAutoHideTimer = setTimeout(() => {
      dismissRecoveryToaster(true);
    }, delayMs);
  }

  function dismissRecoveryToaster(dismissOnly = true) {
    stopRecoveryAutoHide();
    if (!recoveryBanner) return;
    recoveryBanner.classList.add("hiding");
    setTimeout(() => {
      recoveryBanner.style.display = "none";
      recoveryBanner.classList.remove("hiding");
    }, 280);

    if (!dismissOnly) {
      if (recoveryBadge) recoveryBadge.style.display = "none";
      openDB().then((db) => {
        const tx = db.transaction(["settings", "photo_data"], "readwrite");
        tx.objectStore("settings").delete("session");
        tx.objectStore("photo_data").delete("file");
      }).catch(() => {});
    }
  }

  async function checkSessionRecovery() {
    try {
      const db = await openDB();
      const tx = db.transaction(["settings", "photo_data"], "readonly");
      const settingsReq = tx.objectStore("settings").get("session");
      const dataReq = tx.objectStore("photo_data").get("file");

      const [session, data] = await Promise.all([
        new Promise((res) => { settingsReq.onsuccess = () => res(settingsReq.result); settingsReq.onerror = () => res(null); }),
        new Promise((res) => { dataReq.onsuccess = () => res(dataReq.result); dataReq.onerror = () => res(null); }),
      ]);

      if (data && data.blob) {
        const hoursAgo = (Date.now() - (data.timestamp || 0)) / (1000 * 60 * 60);
        if (hoursAgo < 48) {
          if (recoveryBadge) recoveryBadge.style.display = "block";
          if (recoveryBanner && !state.file) {
            if (recoveryFileName) recoveryFileName.textContent = data.fileName || "document.pdf";
            if (recoveryFileSize) recoveryFileSize.textContent = formatBytes(data.fileSize || data.blob.size);
            recoveryBanner.classList.remove("hiding");
            recoveryBanner.style.display = "flex";
            startRecoveryAutoHide(7500);
          }
        }
      }
    } catch (e) {
      console.warn("Session check skipped:", e);
    }
  }

  async function restoreSession() {
    try {
      stopRecoveryAutoHide();
      showToast("Restoring previous session...");
      const db = await openDB();
      const tx = db.transaction(["photo_data"], "readonly");
      const dataReq = tx.objectStore("photo_data").get("file");

      const data = await new Promise((res) => {
        dataReq.onsuccess = () => res(dataReq.result);
        dataReq.onerror = () => res(null);
      });

      if (!data || !data.blob) {
        showToast("No saved session available.");
        if (recoveryBadge) recoveryBadge.style.display = "none";
        dismissRecoveryToaster(true);
        return;
      }

      dismissRecoveryToaster(true);
      const recoveredFile = new File([data.blob], data.fileName || "recovered.pdf", {
        type: "application/pdf",
      });
      await handleFileSelect(recoveredFile);
      showToast(`Session restored: ${data.fileName}`);
    } catch (e) {
      console.error(e);
      showToast("Unable to restore session.");
    }
  }

  async function clearSavedSession(dismissOnly = false) {
    dismissRecoveryToaster(dismissOnly);
  }

  // =============================================
  //  DRAG & DROP / FILE SELECTION
  // =============================================
  if (uploadZone && fileInput) {
    uploadZone.addEventListener("click", () => fileInput.click());
    if (browseBtn) browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });

    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("is-dragover");
    });

    ["dragleave", "dragend"].forEach((evt) => {
      uploadZone.addEventListener(evt, () => uploadZone.classList.remove("is-dragover"));
    });

    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("is-dragover");
      if (e.dataTransfer?.files?.length) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files?.length) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  if (changeFileBtn) {
    changeFileBtn.addEventListener("click", () => {
      clearWorkspace();
      uploadZone.style.display = "block";
      workspace.style.display = "none";
      fileInput.value = "";
      checkSessionRecovery();
    });
  }

  function clearWorkspace() {
    state.images.forEach((img) => {
      if (img.url) URL.revokeObjectURL(img.url);
    });
    state.images = [];
    state.groupedImages = [];
    state.selectedIds.clear();
    state.targetPages = [];
    state.stats = { rawDct: 0, rawJpx: 0, decodedPng: 0, totalBytes: 0, duration: "0.00" };
    if (state.pdfDoc) {
      try {
        state.pdfDoc.destroy();
      } catch (_) {}
      state.pdfDoc = null;
    }
    state.rawBytes = null;
    if (galleryGrid) galleryGrid.innerHTML = "";
    if (emptyGallery) emptyGallery.style.display = "none";
    if (gallerySection) gallerySection.style.display = "none";
    if (configCard) configCard.style.display = "block";
    hideProgress();
    updateStatsDisplay();
  }

  async function handleFileSelect(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Please upload a valid PDF file.");
      return;
    }

    clearWorkspace();
    state.file = file;
    state.baseName = file.name.replace(/\.[^/.]+$/, "");

    if (recoveryBanner) recoveryBanner.style.display = "none";
    persistBlobToDB(file, file.name);
    saveSessionToDB();

    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatBytes(file.size);

    uploadZone.style.display = "none";
    workspace.style.display = "block";
    showProgress("Reading PDF document...", 20, "Loading document metadata & page catalog");

    try {
      state.rawBytes = new Uint8Array(await file.arrayBuffer());
      state.pdfDoc = await window.pdfjsLib.getDocument({
        data: state.rawBytes,
        useWorkerFetch: true,
        isEvalSupported: false,
        enableXfa: true,
      }).promise;

      const numPages = state.pdfDoc.numPages;
      totalCountEl.textContent = numPages;
      if (rangeAllCount) rangeAllCount.textContent = numPages;

      if (pageRangeInput) {
        pageRangeInput.value = `1-${numPages}`;
        pageRangeInput.placeholder = `e.g. 1-${Math.min(5, numPages)}, ${Math.min(8, numPages)}`;
      }

      if (rangeModeAll) rangeModeAll.checked = true;
      if (labelRangeAll) labelRangeAll.classList.add("active");
      if (labelRangeCustom) labelRangeCustom.classList.remove("active");
      if (customRangeWrap) customRangeWrap.style.display = "none";

      updateRangeValidation();
      hideProgress();
      if (configCard) configCard.style.display = "block";

      showToast(`Loaded ${numPages} page(s). Set your extraction range and click Extract Photos!`);
    } catch (err) {
      console.error(err);
      hideProgress();
      showToast("Failed to parse PDF: " + err.message);
    }
  }

  function showProgress(title, pct, sub = "") {
    if (!progressCard) return;
    progressCard.style.display = "block";
    progressTitle.textContent = title;
    progressPct.textContent = `${Math.round(pct)}%`;
    progressBar.style.width = `${pct}%`;
    progressSub.textContent = sub;
  }

  function hideProgress() {
    if (progressCard) progressCard.style.display = "none";
  }

  // =============================================
  //  ENGINE 1: RAW STREAM JPEG/JPX EXTRACTOR
  // =============================================
  async function extractRawStreams(bytes) {
    const rawImages = [];
    const latin = new TextDecoder("latin1").decode(bytes);
    let pos = 0;

    while ((pos = latin.indexOf("/Filter", pos)) >= 0) {
      const chunk = latin.slice(pos, pos + 240);
      const isDct = chunk.includes("DCTDecode");
      const isJpx = chunk.includes("JPXDecode");

      if (isDct || isJpx) {
        const streamIdx = latin.indexOf("stream", pos);
        if (streamIdx !== -1 && streamIdx - pos < 500) {
          let ds = streamIdx + 6;
          if (bytes[ds] === 13 && bytes[ds + 1] === 10) ds += 2;
          else if (bytes[ds] === 10) ds += 1;

          if (isDct) {
            // Verify JPEG SOI marker 0xFF, 0xD8
            if (bytes[ds] === 0xff && bytes[ds + 1] === 0xd8) {
              const endstreamIdx = latin.indexOf("endstream", ds);
              if (endstreamIdx !== -1) {
                let de = endstreamIdx;
                while (de > ds && (bytes[de - 1] === 10 || bytes[de - 1] === 13)) de--;

                const body = bytes.slice(ds, de);
                const dims = parseJpgDimensions(body);
                if (dims && dims.width > 0 && dims.height > 0) {
                  const blob = new Blob([body], { type: "image/jpeg" });
                  const hash = await computeHash(body);
                  rawImages.push({
                    blob,
                    width: dims.width,
                    height: dims.height,
                    format: "jpg",
                    mimeType: "image/jpeg",
                    source: "Raw Lossless JPEG stream",
                    hash,
                    sizeBytes: blob.size,
                    pages: [],
                  });
                  state.stats.rawDct++;
                }
              }
            }
          } else if (isJpx) {
            // JPEG 2000
            const endstreamIdx = latin.indexOf("endstream", ds);
            if (endstreamIdx !== -1) {
              let de = endstreamIdx;
              while (de > ds && (bytes[de - 1] === 10 || bytes[de - 1] === 13)) de--;
              const body = bytes.slice(ds, de);
              const blob = new Blob([body], { type: "image/jp2" });
              const hash = await computeHash(body);
              rawImages.push({
                blob,
                width: 0,
                height: 0,
                format: "other",
                mimeType: "image/jp2",
                source: "Raw JPX stream",
                hash,
                sizeBytes: blob.size,
                pages: [],
              });
              state.stats.rawJpx++;
            }
          }
        }
      }
      pos += 7;
    }
    return rawImages;
  }

  // =============================================
  //  ENGINE 2: PDF.JS COMPREHENSIVE OBJECT SCANNER
  // =============================================
  async function resolveImageObject(page, name) {
    if (!name || typeof name !== "string") return null;
    try {
      if (page.objs?.has && page.objs.has(name)) {
        return page.objs.get(name);
      }
      if (page.commonObjs?.has && page.commonObjs.has(name)) {
        return page.commonObjs.get(name);
      }
    } catch (_) {}

    return new Promise((resolve) => {
      let settled = false;
      const finish = (obj) => {
        if (!settled) {
          settled = true;
          resolve(obj || null);
        }
      };

      try {
        page.objs?.get(name, finish);
      } catch (_) {}

      try {
        page.commonObjs?.get(name, finish);
      } catch (_) {}

      setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            if (page.objs?.has && page.objs.has(name)) return resolve(page.objs.get(name));
          } catch (_) {}
          try {
            if (page.commonObjs?.has && page.commonObjs.has(name)) return resolve(page.commonObjs.get(name));
          } catch (_) {}
          resolve(null);
        }
      }, 500);
    });
  }

  function imageObjToCanvas(img) {
    if (!img || !img.width || !img.height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");

    if (img.bitmap) {
      ctx.drawImage(img.bitmap, 0, 0, img.width, img.height);
      return canvas;
    }

    const d = img.data;
    if (!d) return null;

    // RGBA 32BPP
    if (img.kind === 3 || d.length === img.width * img.height * 4) {
      const clamped = d instanceof Uint8ClampedArray ? d : new Uint8ClampedArray(d);
      ctx.putImageData(new ImageData(clamped, img.width, img.height), 0, 0);
      return canvas;
    }

    // RGB 24BPP
    if (img.kind === 2 || d.length === img.width * img.height * 3) {
      const rgba = new Uint8ClampedArray(img.width * img.height * 4);
      for (let i = 0, j = 0; i < d.length; i += 3, j += 4) {
        rgba[j] = d[i];
        rgba[j + 1] = d[i + 1];
        rgba[j + 2] = d[i + 2];
        rgba[j + 3] = 255;
      }
      ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
      return canvas;
    }

    // GRAYSCALE 1BPP (Monochrome scanned text/lineart)
    if (img.kind === 1 || d.length === Math.ceil(img.width / 8) * img.height) {
      const rgba = new Uint8ClampedArray(img.width * img.height * 4);
      const rowBytes = Math.ceil(img.width / 8);
      let dest = 0;
      for (let y = 0; y < img.height; y++) {
        const rowOffset = y * rowBytes;
        for (let x = 0; x < img.width; x++) {
          const byteVal = d[rowOffset + (x >> 3)];
          const bit = (byteVal >> (7 - (x & 7))) & 1;
          const val = bit ? 255 : 0;
          rgba[dest++] = val;
          rgba[dest++] = val;
          rgba[dest++] = val;
          rgba[dest++] = 255;
        }
      }
      ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
      return canvas;
    }

    // 8-bit Grayscale
    if (d.length === img.width * img.height) {
      const rgba = new Uint8ClampedArray(img.width * img.height * 4);
      let dest = 0;
      for (let i = 0; i < d.length; i++) {
        const val = d[i];
        rgba[dest++] = val;
        rgba[dest++] = val;
        rgba[dest++] = val;
        rgba[dest++] = 255;
      }
      ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
      return canvas;
    }

    return null;
  }

  // =============================================
  //  HYBRID DUAL-ENGINE EXTRACTION PIPELINE
  // =============================================
  async function runDualEngineExtraction(targetPages) {
    if (!targetPages || !targetPages.length) {
      targetPages = Array.from({ length: state.pdfDoc.numPages }, (_, i) => i + 1);
    }
    state.targetPages = targetPages;

    // Clear previous candidate images
    state.images.forEach((img) => {
      if (img.url) URL.revokeObjectURL(img.url);
    });
    state.images = [];
    state.groupedImages = [];
    state.selectedIds.clear();
    state.stats.rawDct = 0;
    state.stats.rawJpx = 0;
    state.stats.decodedPng = 0;
    state.stats.totalBytes = 0;

    showProgress("Pass 1: Direct Raw JPEG Stream Engine...", 10, "Extracting bit-exact camera sensor streams");

    // Pass 1: Scan raw binary streams for original camera JPEGs
    const rawStreams = await extractRawStreams(state.rawBytes);
    showProgress("Pass 1 Complete. Preparing PDF.js object scanner...", 25, `Found ${rawStreams.length} stream candidate(s)`);

    // Pass 2: Page-by-page operator inspection on targetPages
    const imageOpIds = new Set([
      window.pdfjsLib.OPS.paintImageXObject,
      window.pdfjsLib.OPS.paintImageMaskXObject,
      window.pdfjsLib.OPS.paintInlineImageXObject,
      window.pdfjsLib.OPS.paintImageXObjectRepeat,
      window.pdfjsLib.OPS.paintImageMaskXObjectRepeat,
    ].filter(Boolean));

    const totalTarget = targetPages.length;
    const isAllPages = targetPages.length === state.pdfDoc.numPages;

    for (let idx = 0; idx < totalTarget; idx++) {
      const p = targetPages[idx];
      const pct = 25 + Math.round(((idx + 1) / totalTarget) * 65);
      showProgress(
        `Pass 2: Scanning Page ${p} (${idx + 1} of ${totalTarget})...`,
        pct,
        `Extracted ${state.images.length} candidate photo(s)`
      );

      const page = await state.pdfDoc.getPage(p);
      const ops = await page.getOperatorList();
      const pageImageNames = new Set();
      const inlineImages = [];

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i];

        if (imageOpIds.has(fn)) {
          if (fn === window.pdfjsLib.OPS.paintInlineImageXObject) {
            if (args?.[0]) inlineImages.push(args[0]);
          } else if (typeof args?.[0] === "string") {
            pageImageNames.add(args[0]);
          }
        }
      }

      // Process named images on page p
      for (const name of pageImageNames) {
        const imgObj = await resolveImageObject(page, name);
        if (!imgObj || !imgObj.width || !imgObj.height) continue;

        // Check if already captured in Pass 1 (lossless raw JPEG)
        const matchedRaw = rawStreams.find(
          (cand) =>
            cand.format === "jpg" &&
            cand.width === imgObj.width &&
            cand.height === imgObj.height
        );

        if (matchedRaw) {
          if (!matchedRaw.pages.includes(p)) matchedRaw.pages.push(p);
          if (!state.images.includes(matchedRaw)) {
            state.images.push(matchedRaw);
            state.stats.rawDct++;
          }
        } else {
          // Decode to PNG with full alpha/SMask support
          const canvas = imageObjToCanvas(imgObj);
          if (canvas) {
            const blob = await canvasToBlob(canvas, "image/png");
            // Low-RAM: immediately release canvas buffer
            canvas.width = 0;
            canvas.height = 0;

            if (blob) {
              const hash = await computeHash(blob);
              state.images.push({
                blob,
                width: imgObj.width,
                height: imgObj.height,
                format: "png",
                mimeType: "image/png",
                source: "Decoded PNG (Alpha SMask Preserved)",
                hash,
                sizeBytes: blob.size,
                pages: [p],
              });
              state.stats.decodedPng++;
            }
          }
        }
      }

      // Process inline images on page p
      for (const inlineImg of inlineImages) {
        const canvas = imageObjToCanvas(inlineImg);
        if (canvas) {
          const blob = await canvasToBlob(canvas, "image/png");
          canvas.width = 0;
          canvas.height = 0;
          if (blob) {
            const hash = await computeHash(blob);
            state.images.push({
              blob,
              width: inlineImg.width,
              height: inlineImg.height,
              format: "png",
              mimeType: "image/png",
              source: "Inline PDF Image",
              hash,
              sizeBytes: blob.size,
              pages: [p],
            });
            state.stats.decodedPng++;
          }
        }
      }

      page.cleanup();
      // Low-RAM: Yield to event loop to allow garbage collector to reclaim memory
      await new Promise((r) => setTimeout(r, 0));
    }

    // If All Pages mode was selected, include any raw streams that may have been missed by operator lists
    if (isAllPages) {
      for (const raw of rawStreams) {
        if (!state.images.includes(raw)) {
          if (!raw.pages.length) raw.pages.push(1);
          state.images.push(raw);
          state.stats.rawDct++;
        }
      }
    }

    // Assign URLs and default pages
    state.images.forEach((img) => {
      if (!img.pages.length) img.pages.push(targetPages[0] || 1);
      if (!img.url) img.url = URL.createObjectURL(img.blob);
    });

    showProgress("Finalizing gallery...", 98);
    updateStatsDisplay();
    renderGallery();
  }

  function updateStatsDisplay() {
    let totalBytes = 0;
    state.images.forEach((img) => (totalBytes += img.sizeBytes || 0));
    state.stats.totalBytes = totalBytes;

    if (statsTotalEl) statsTotalEl.textContent = state.images.length;
    if (statsDctEl) statsDctEl.textContent = state.stats.rawDct;
    if (statsPngEl) statsPngEl.textContent = state.stats.decodedPng;
    if (statsSizeEl) statsSizeEl.textContent = formatBytes(totalBytes);
    if (statsDuration) statsDuration.textContent = `${state.stats.duration || "0.00"}s`;
  }

  // =============================================
  //  GALLERY RENDERING & DEDUPLICATION
  // =============================================
  function filterAndSortImages() {
    let list = state.images.slice();

    // Size filter
    const sizeMode = filterSizeSelect ? filterSizeSelect.value : "photos";
    if (sizeMode === "photos") {
      // Filter out tiny icons, bullets, spacers < 100px
      list = list.filter((x) => x.width >= 80 && x.height >= 80);
    } else if (sizeMode === "large") {
      list = list.filter((x) => x.width >= 500 || x.height >= 500);
    }

    // Format filter
    const fmtMode = filterFormatSelect ? filterFormatSelect.value : "all";
    if (fmtMode !== "all") {
      list = list.filter((x) => x.format === fmtMode);
    }

    // Deduplication grouping
    const groupDupes = groupDupesCheck ? groupDupesCheck.checked : true;
    if (groupDupes) {
      const map = new Map();
      list.forEach((img) => {
        const key = img.hash || `${img.width}x${img.height}_${img.sizeBytes}`;
        if (map.has(key)) {
          const existing = map.get(key);
          img.pages.forEach((p) => {
            if (!existing.pages.includes(p)) existing.pages.push(p);
          });
          existing.count = (existing.count || 1) + 1;
        } else {
          map.set(key, { ...img, count: 1 });
        }
      });
      list = Array.from(map.values());
    }

    // Sort
    const sortMode = filterSortSelect ? filterSortSelect.value : "page";
    if (sortMode === "page") {
      list.sort((a, b) => (a.pages[0] || 0) - (b.pages[0] || 0));
    } else if (sortMode === "res") {
      list.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    } else if (sortMode === "size") {
      list.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
    }

    return list;
  }

  function renderGallery() {
    if (!galleryGrid) return;
    galleryGrid.innerHTML = "";
    const items = filterAndSortImages();
    state.groupedImages = items;

    if (!items.length) {
      emptyGallery.style.display = "block";
      downloadZipBtn.disabled = true;
      downloadSelectedBtn.disabled = true;
      return;
    }

    emptyGallery.style.display = "none";
    downloadZipBtn.disabled = false;

    items.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "photo-card";
      card.dataset.id = item.hash || idx;

      const mp = ((item.width * item.height) / 1000000).toFixed(1);
      const isSelected = state.selectedIds.has(card.dataset.id);

      const pageStr =
        item.pages.length > 1
          ? `Pages ${item.pages.sort((a, b) => a - b).join(", ")} (${item.pages.length}×)`
          : `Page ${item.pages[0] || 1}`;

      card.innerHTML = `
        <div class="photo-thumb-wrap" title="Click to view full preview">
          <div class="photo-badges">
            <span class="photo-badge ${item.format}">${item.format.toUpperCase()}</span>
          </div>
          <div class="photo-check-wrap">
            <input type="checkbox" class="photo-check" data-id="${card.dataset.id}" ${isSelected ? "checked" : ""}>
          </div>
          <img class="photo-thumb-img" src="${item.url}" alt="Extracted Photo ${idx + 1}" loading="lazy">
        </div>
        <div class="photo-meta">
          <div class="photo-dimensions">${item.width} × ${item.height} px</div>
          <div class="photo-details-row">
            <span>${mp} MP · ${formatBytes(item.sizeBytes)}</span>
            <span><strong>${pageStr}</strong></span>
          </div>
          <div class="photo-source-tag" title="${item.source}">${item.source}</div>
          <div class="photo-actions">
            <button type="button" class="btn-primary btn-sm photo-dl-btn" data-idx="${idx}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download
            </button>
            <button type="button" class="photo-inspect-btn" data-idx="${idx}" title="Inspect full image">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
          </div>
        </div>
      `;

      // Card Events
      const thumbWrap = card.querySelector(".photo-thumb-wrap");
      const inspectBtn = card.querySelector(".photo-inspect-btn");
      const dlBtn = card.querySelector(".photo-dl-btn");
      const checkbox = card.querySelector(".photo-check");

      thumbWrap.addEventListener("click", (e) => {
        if (e.target === checkbox) return;
        openLightbox(item);
      });

      inspectBtn.addEventListener("click", () => openLightbox(item));

      dlBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        downloadSingleImage(item, idx);
      });

      checkbox.addEventListener("change", (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          state.selectedIds.add(card.dataset.id);
        } else {
          state.selectedIds.delete(card.dataset.id);
        }
        updateSelectionState();
      });

      galleryGrid.appendChild(card);
    });

    updateSelectionState();
  }

  function updateSelectionState() {
    const totalVisible = state.groupedImages.length;
    const selectedCount = state.selectedIds.size;

    if (downloadSelectedBtn) {
      downloadSelectedBtn.disabled = selectedCount === 0;
      downloadSelectedBtn.textContent = `Download Selected (${selectedCount})`;
    }

    if (selectAllCheck) {
      selectAllCheck.checked = totalVisible > 0 && selectedCount === totalVisible;
      selectAllCheck.indeterminate = selectedCount > 0 && selectedCount < totalVisible;
    }
  }

  // Filter & Toolbar Event Listeners
  if (filterSizeSelect) filterSizeSelect.addEventListener("change", renderGallery);
  if (filterFormatSelect) filterFormatSelect.addEventListener("change", renderGallery);
  if (filterSortSelect) filterSortSelect.addEventListener("change", renderGallery);
  if (groupDupesCheck) groupDupesCheck.addEventListener("change", renderGallery);

  if (selectAllCheck) {
    selectAllCheck.addEventListener("change", () => {
      if (selectAllCheck.checked) {
        state.groupedImages.forEach((img, idx) => {
          state.selectedIds.add(img.hash || idx);
        });
      } else {
        state.selectedIds.clear();
      }
      renderGallery();
    });
  }

  // =============================================
  //  DOWNLOADING (SINGLE & BATCH ZIP)
  // =============================================
  function downloadSingleImage(item, idx) {
    const ext = item.format === "jpg" ? "jpg" : item.format === "png" ? "png" : "jp2";
    const p = item.pages[0] || 1;
    const cleanFilename = `${state.baseName}_p${p}_photo-${String(idx + 1).padStart(3, "0")}.${ext}`;

    const a = document.createElement("a");
    a.href = item.url;
    a.download = cleanFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloading ${cleanFilename}`);
  }

  async function generateZip(itemsToZip, zipName) {
    if (!itemsToZip.length || !window.JSZip) {
      showToast("JSZip not ready or no images selected.");
      return;
    }

    downloadZipBtn.disabled = true;
    showProgress("Building ZIP archive...", 5);

    try {
      const zip = new window.JSZip();
      const folder = zip.folder("extracted-photos");

      for (let i = 0; i < itemsToZip.length; i++) {
        const item = itemsToZip[i];
        const ext = item.format === "jpg" ? "jpg" : item.format === "png" ? "png" : "jp2";
        const pageNum = item.pages[0] || 1;
        const filename = `${state.baseName}_p${pageNum}_photo-${String(i + 1).padStart(3, "0")}.${ext}`;

        folder.file(filename, item.blob);
        const pct = 5 + Math.round((i / itemsToZip.length) * 75);
        showProgress(`Adding photo ${i + 1} of ${itemsToZip.length}...`, pct);
      }

      showProgress("Compressing ZIP archive...", 85);
      const zipBlob = await zip.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
        (meta) => {
          showProgress(`Compressing: ${Math.round(meta.percent)}%`, 85 + meta.percent * 0.14);
        }
      );

      hideProgress();
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 2000);

      showToast(`ZIP ready! Downloaded ${itemsToZip.length} photo(s).`);
    } catch (err) {
      console.error(err);
      hideProgress();
      showToast("Failed to create ZIP: " + err.message);
    } finally {
      downloadZipBtn.disabled = false;
    }
  }

  // =============================================
  //  UNIVERSAL TIMER POP-UP MODAL
  // =============================================
  function showExtractionSuccessPopup(durationMs, targetPages = []) {
    if (!window.PDFMasterPopup || state.images.length === 0) return;

    const count = state.images.length;
    let totalBytes = 0;
    state.images.forEach((img) => (totalBytes += img.sizeBytes || 0));

    const zipName = `${state.baseName}_extracted-photos.zip`;
    const numPagesScanned =
      (targetPages && targetPages.length) ||
      (state.targetPages && state.targetPages.length) ||
      (state.pdfDoc ? state.pdfDoc.numPages : 1);

    const safeDuration = durationMs || state.stats.durationMs || 300;

    if (count === 1) {
      const single = state.images[0];
      const ext = single.format === "jpg" ? "jpg" : single.format === "png" ? "png" : "jp2";
      const fn = `${state.baseName}_photo.${ext}`;

      window.PDFMasterPopup.show({
        title: "Thank You for Using PDF<span>Master</span>!",
        desc: `Extracted <strong>1 standalone photo</strong> in original lossless resolution. Processed 100% on your device with <strong>zero server uploads</strong>.`,
        fileName: fn,
        fileType: "image",
        fileSize: single.sizeBytes,
        fileDetails: `${single.width}×${single.height} px • 1 photo • 100% Private`,
        downloadText: "Download Extracted Photo",
        secondaryText: "View in Gallery",
        toolName: "Photo from PDF Extractor",
        verb: "Extracted",
        durationMs: safeDuration,
        blob: single.blob,
        onSecondary: () => {
          if (gallerySection) {
            gallerySection.style.display = "block";
            gallerySection.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        },
      });
    } else {
      window.PDFMasterPopup.show({
        title: "Thank You for Using PDF<span>Master</span>!",
        desc: `Recovered <strong>${count} high-resolution photos</strong> across <strong>${numPagesScanned} scanned page(s)</strong>. Processed 100% locally on your device with <strong>zero server uploads</strong>.`,
        fileName: zipName,
        fileType: "zip",
        fileSize: totalBytes,
        fileDetails: `${count} photos • ${numPagesScanned} pages scanned • 100% Private`,
        downloadText: `Download All as ZIP (${count} photos)`,
        secondaryText: "View Gallery",
        toolName: "Photo from PDF Extractor",
        verb: "Extracted",
        durationMs: safeDuration,
        onDownload: () => {
          const visible = state.groupedImages.length ? state.groupedImages : state.images;
          return generateZip(visible, zipName);
        },
        onSecondary: () => {
          if (gallerySection) {
            gallerySection.style.display = "block";
            gallerySection.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        },
      });
    }
  }

  // Gallery Download All ZIP action
  if (downloadZipBtn) {
    downloadZipBtn.addEventListener("click", () => {
      const visible = state.groupedImages.length ? state.groupedImages : state.images;
      const zipName = `${state.baseName}_extracted-photos.zip`;
      generateZip(visible, zipName);
    });
  }

  // Open Timer & Summary Benchmark Modal
  if (timerModalBtn) {
    timerModalBtn.addEventListener("click", () => {
      if (state.images.length > 0) {
        showExtractionSuccessPopup(state.stats.durationMs || 300, state.targetPages);
      } else {
        showToast("Please extract photos first to view timer benchmark.");
      }
    });
  }

  // Interactive Stats Strip Duration Pill
  if (statsTimeItem) {
    statsTimeItem.addEventListener("click", () => {
      if (state.images.length > 0) {
        showExtractionSuccessPopup(state.stats.durationMs || 300, state.targetPages);
      } else {
        showToast("Please extract photos first to view timer benchmark.");
      }
    });
    statsTimeItem.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        statsTimeItem.click();
      }
    });
  }

  if (downloadSelectedBtn) {
    downloadSelectedBtn.addEventListener("click", () => {
      const selected = state.groupedImages.filter((img, idx) =>
        state.selectedIds.has(img.hash || idx)
      );
      if (!selected.length) return;
      const selZipName = `${state.baseName}_selected-photos.zip`;
      let selBytes = 0;
      selected.forEach((img) => (selBytes += img.sizeBytes || 0));

      if (window.PDFMasterPopup) {
        window.PDFMasterPopup.show({
          title: "Thank You for Using PDF<span>Master</span>!",
          desc: `Ready to download <strong>${selected.length} selected photos</strong>. Processed 100% locally on your device with <strong>zero server uploads</strong>.`,
          fileName: selZipName,
          fileType: "zip",
          fileSize: selBytes,
          fileDetails: `${selected.length} selected photos • 100% Private`,
          downloadText: `Download Selected ZIP (${selected.length} photos)`,
          secondaryText: "Done",
          toolName: "Photo from PDF Extractor",
          verb: "Extracted",
          durationMs: state.stats.durationMs || 300,
          onDownload: () => generateZip(selected, selZipName),
        });
      } else {
        generateZip(selected, selZipName);
      }
    });
  }

  // =============================================
  //  LIGHTBOX / INSPECTOR MODAL
  // =============================================
  function openLightbox(item) {
    state.lightboxItem = item;
    lightboxImg.src = item.url;
    lightboxTitle.textContent = `${item.width} × ${item.height} px`;
    lightboxRes.textContent = `${item.width} × ${item.height} pixels`;
    lightboxMp.textContent = `${((item.width * item.height) / 1000000).toFixed(2)} MP`;
    lightboxSize.textContent = formatBytes(item.sizeBytes);
    lightboxFormat.textContent = item.mimeType;
    lightboxPages.textContent = item.pages.join(", ");
    lightboxSource.textContent = item.source;

    lightboxModal.classList.add("active");
  }

  function closeLightbox() {
    lightboxModal.classList.remove("active");
    state.lightboxItem = null;
  }

  if (lightboxCloseBtn) lightboxCloseBtn.addEventListener("click", closeLightbox);
  if (lightboxModal) {
    lightboxModal.addEventListener("click", (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightboxModal.classList.contains("active")) {
      closeLightbox();
    }
  });

  if (lightboxDownloadBtn) {
    lightboxDownloadBtn.addEventListener("click", () => {
      if (state.lightboxItem) {
        downloadSingleImage(state.lightboxItem, 0);
      }
    });
  }

  // =============================================
  //  PAGE RANGE INPUT PARSER & CONTROLS
  // =============================================
  function parseRangeString(str, maxPages) {
    if (!str || !maxPages) return [];
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

  function updateRangeValidation() {
    if (!state.pdfDoc) return;
    const total = state.pdfDoc.numPages;

    if (rangeModeAll && rangeModeAll.checked) {
      if (extractBtnCountText) extractBtnCountText.textContent = `All ${total} Pages`;
      if (labelRangeAll) labelRangeAll.classList.add("active");
      if (labelRangeCustom) labelRangeCustom.classList.remove("active");
      if (customRangeWrap) customRangeWrap.style.display = "none";
      return;
    }

    if (labelRangeAll) labelRangeAll.classList.remove("active");
    if (labelRangeCustom) labelRangeCustom.classList.add("active");
    if (customRangeWrap) customRangeWrap.style.display = "flex";

    const val = pageRangeInput ? pageRangeInput.value.trim() : "";
    const parsed = parseRangeString(val, total);

    if (rangeStatusPill) {
      if (parsed.length === 0) {
        rangeStatusPill.textContent = "0 pages";
        rangeStatusPill.style.color = "var(--danger-red, #ef4444)";
      } else {
        rangeStatusPill.textContent = `${parsed.length} page${parsed.length > 1 ? "s" : ""}`;
        rangeStatusPill.style.color = "var(--text-2)";
      }
    }

    if (extractBtnCountText) {
      extractBtnCountText.textContent = `${parsed.length} Page${parsed.length === 1 ? "" : "s"}`;
    }
  }

  if (rangeModeAll && rangeModeCustom) {
    rangeModeAll.addEventListener("change", updateRangeValidation);
    rangeModeCustom.addEventListener("change", () => {
      updateRangeValidation();
      if (pageRangeInput) pageRangeInput.focus();
    });
  }

  if (pageRangeInput) {
    pageRangeInput.addEventListener("input", updateRangeValidation);
  }

  // Presets
  if (presetAllBtn) {
    presetAllBtn.addEventListener("click", () => {
      if (!state.pdfDoc) return;
      pageRangeInput.value = `1-${state.pdfDoc.numPages}`;
      updateRangeValidation();
    });
  }

  if (presetFirst5Btn) {
    presetFirst5Btn.addEventListener("click", () => {
      if (!state.pdfDoc) return;
      const count = Math.min(5, state.pdfDoc.numPages);
      pageRangeInput.value = `1-${count}`;
      updateRangeValidation();
    });
  }

  if (presetOddBtn) {
    presetOddBtn.addEventListener("click", () => {
      if (!state.pdfDoc) return;
      const odds = [];
      for (let i = 1; i <= state.pdfDoc.numPages; i += 2) odds.push(i);
      pageRangeInput.value = odds.join(", ");
      updateRangeValidation();
    });
  }

  if (presetEvenBtn) {
    presetEvenBtn.addEventListener("click", () => {
      if (!state.pdfDoc) return;
      const evens = [];
      for (let i = 2; i <= state.pdfDoc.numPages; i += 2) evens.push(i);
      pageRangeInput.value = evens.join(", ");
      updateRangeValidation();
    });
  }

  // Trigger Extraction
  if (startExtractBtn) {
    startExtractBtn.addEventListener("click", async () => {
      if (!state.pdfDoc) return;
      const total = state.pdfDoc.numPages;
      let targetPages = [];

      if (rangeModeAll && rangeModeAll.checked) {
        targetPages = Array.from({ length: total }, (_, i) => i + 1);
      } else {
        targetPages = parseRangeString(pageRangeInput ? pageRangeInput.value : "", total);
      }

      if (!targetPages.length) {
        showToast("Please enter at least one valid page number.");
        if (pageRangeInput) pageRangeInput.focus();
        return;
      }

      startExtractBtn.disabled = true;
      const originalHtml = startExtractBtn.innerHTML;
      startExtractBtn.innerHTML = `
        <span class="btn-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:6px;"></span>
        Extracting Photos...
      `;

      const startTime = performance.now();

      try {
        if (filterSizeSelect && configSizeSelect) {
          filterSizeSelect.value = configSizeSelect.value;
        }
        if (groupDupesCheck && configGroupDupesCheck) {
          groupDupesCheck.checked = configGroupDupesCheck.checked;
        }

        await runDualEngineExtraction(targetPages);

        const durationMs = Math.max(1, Math.round(performance.now() - startTime));
        const durationSec = (durationMs / 1000).toFixed(2);
        state.stats.duration = durationSec;
        state.stats.durationMs = durationMs;
        state.targetPages = targetPages;

        if (statsDuration) statsDuration.textContent = `${durationSec}s`;

        if (progressTitle) {
          progressTitle.textContent = `✓ Extracted ${state.images.length} photo(s) in ${durationSec}s`;
        }
        if (progressPct) progressPct.textContent = "100%";
        if (progressBar) progressBar.style.width = "100%";
        if (progressSub) {
          progressSub.textContent = `Scanned ${targetPages.length} page(s) in ${durationSec} seconds with Dual-Engine precision.`;
        }

        showToast(`⚡ Extracted ${state.images.length} photo(s) in ${durationSec}s!`);

        if (gallerySection) {
          gallerySection.style.display = "block";
          gallerySection.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        // Automatically trigger the signature PDFMaster Universal Timer Pop-up
        if (state.images.length > 0) {
          setTimeout(() => {
            showExtractionSuccessPopup(durationMs, targetPages);
          }, 350);
        }
      } catch (err) {
        console.error("Extraction error:", err);
        showToast("Extraction error: " + err.message);
      } finally {
        startExtractBtn.disabled = false;
        startExtractBtn.innerHTML = originalHtml;
        updateRangeValidation();
      }
    });
  }

  // Reconfigure Range
  if (reconfigBtn && configCard) {
    reconfigBtn.addEventListener("click", () => {
      configCard.scrollIntoView({ behavior: "smooth", block: "start" });
      configCard.classList.add("highlight-pulse");
      setTimeout(() => configCard.classList.remove("highlight-pulse"), 1600);
    });
  }

  // Back to Top button
  if (backTop) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 300) {
        backTop.classList.add("show");
      } else {
        backTop.classList.remove("show");
      }
    });

    backTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Session Recovery listeners
  if (recoveryBtn) recoveryBtn.addEventListener("click", restoreSession);
  if (restoreSessionBtn) restoreSessionBtn.addEventListener("click", restoreSession);
  if (discardSessionBtn) discardSessionBtn.addEventListener("click", () => clearSavedSession(true));
  if (recoveryCloseBtn) recoveryCloseBtn.addEventListener("click", () => clearSavedSession(true));

  if (recoveryBanner) {
    recoveryBanner.addEventListener("mouseenter", stopRecoveryAutoHide);
    recoveryBanner.addEventListener("mouseleave", () => startRecoveryAutoHide(3500));
    recoveryBanner.addEventListener("focusin", stopRecoveryAutoHide);
    recoveryBanner.addEventListener("focusout", () => startRecoveryAutoHide(3500));
  }

  // Initialize Session Recovery check on load
  checkSessionRecovery();
})();

