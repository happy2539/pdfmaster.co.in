"use strict";

// =============================================
//  CONSTANTS & STATE
// =============================================
const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
}

const state = {
  pdfBytes: null, // Original ArrayBuffer
  pdfJsDoc: null, // PDF.js document
  pageOrder: [], // current order: indices (0-based) into original PDF
  totalPages: 0,
  fileName: "document.pdf",
  sortableInstance: null,
};

// =============================================
//  DOM REFS
// =============================================
const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const reorderWorkspace = document.getElementById("reorderWorkspace");
const statusMsg = document.getElementById("statusMsg");
const statusText = document.getElementById("statusText");
const toolToolbar = document.getElementById("toolToolbar");
const hintBar = document.getElementById("hintBar");
const pagesGrid = document.getElementById("pagesGrid");
const emptyState = document.getElementById("emptyState");
const fileNameEl = document.getElementById("fileName");
const pageCountEl = document.getElementById("pageCount");
const downloadBtn = document.getElementById("downloadBtn");
const changeFileBtn = document.getElementById("changeFileBtn");
const resetOrderBtn = document.getElementById("resetOrderBtn");
const reverseBtn = document.getElementById("reverseBtn");

// =============================================
//  THEME
// =============================================
const themeToggle = document.getElementById("themeToggle");
const html = document.documentElement;

function applyTheme(theme) {
  html.setAttribute("data-theme", theme);
  localStorage.setItem("pdfmaster-theme", theme);
}

(function initTheme() {
  const saved = localStorage.getItem("pdfmaster-theme");
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  applyTheme(saved || preferred);
})();

themeToggle.addEventListener("click", () => {
  applyTheme(html.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

// =============================================
//  HAMBURGER / DRAWER
// =============================================
const hamburgerBtn = document.getElementById("hamburgerBtn");
const navDrawer = document.getElementById("navDrawer");
const drawerOverlay = document.getElementById("drawerOverlay");

function openDrawer() {
  hamburgerBtn.classList.add("open");
  navDrawer.classList.add("open");
  drawerOverlay.classList.add("open");
  hamburgerBtn.setAttribute("aria-expanded", "true");
  drawerOverlay.removeAttribute("aria-hidden");
}

function closeDrawer() {
  hamburgerBtn.classList.remove("open");
  navDrawer.classList.remove("open");
  drawerOverlay.classList.remove("open");
  hamburgerBtn.setAttribute("aria-expanded", "false");
  drawerOverlay.setAttribute("aria-hidden", "true");
}

hamburgerBtn.addEventListener("click", () => {
  navDrawer.classList.contains("open") ? closeDrawer() : openDrawer();
});

drawerOverlay.addEventListener("click", closeDrawer);

document.querySelectorAll("[data-close-drawer]").forEach((el) => {
  el.addEventListener("click", closeDrawer);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDrawer();
});

// =============================================
//  BACK TO TOP
// =============================================
const backToTop = document.getElementById("backToTop");
window.addEventListener(
  "scroll",
  () => {
    backToTop.classList.toggle("show", window.scrollY > 400);
  },
  { passive: true },
);
backToTop.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);

// Scroll Reveal Observer Removed for SEO Integrity

// =============================================
//  FAQ ACCORDION
// =============================================
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-faq]");
  if (!btn) return;
  const item = btn.closest(".faq-item");
  const isOpen = item.classList.contains("open");
  document.querySelectorAll(".faq-item.open").forEach((i) => {
    i.classList.remove("open");
    i.querySelector("[data-faq]").setAttribute("aria-expanded", "false");
  });
  if (!isOpen) {
    item.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
  }
});

// =============================================
//  FOOTER YEAR
// =============================================
document.getElementById("year").textContent = new Date().getFullYear();

// =============================================
//  STATUS HELPERS
// =============================================
function showStatus(type, text) {
  statusMsg.className = `status-msg ${type} show`;
  statusText.textContent = text;
  if (type !== "loading") {
    statusMsg.querySelector(".spinner") &&
      statusMsg.querySelector(".spinner").remove();
    if (!statusMsg.querySelector(".spinner") && type === "loading") {
      const sp = document.createElement("div");
      sp.className = "spinner";
      statusMsg.prepend(sp);
    }
  }
}

function hideStatus() {
  statusMsg.classList.remove("show");
}

function setLoading(text) {
  // rebuild spinner if needed
  statusMsg.innerHTML = `<div class="spinner" aria-hidden="true"></div><span id="statusText">${text}</span>`;
  statusMsg.className = "status-msg loading show";
}

// =============================================
//  DRAG & DROP ON UPLOAD ZONE
// =============================================
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
  const file = e.dataTransfer.files[0];
  if (file && file.type === "application/pdf") loadFile(file);
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) loadFile(file);
  fileInput.value = "";
});

uploadZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});

// =============================================
//  LOAD FILE
// =============================================
async function loadFile(file) {
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    alert("Please select a valid PDF file.");
    return;
  }

  state.fileName = file.name;

  // Show workspace
  uploadZone.style.display = "none";
  reorderWorkspace.classList.add("active");
  setLoading("Loading your PDF…");
  toolToolbar.style.display = "none";
  hintBar.style.display = "none";
  pagesGrid.innerHTML = "";
  emptyState.classList.remove("show");

  const arrayBuffer = await file.arrayBuffer();
  state.pdfBytes = new Uint8Array(arrayBuffer);

  // Load with PDF.js for rendering - pass a fresh clone so worker transfer cannot detach state.pdfBytes
  try {
    const renderData = new Uint8Array(state.pdfBytes.slice().buffer);
    state.pdfJsDoc = await pdfjsLib.getDocument({ data: renderData }).promise;
    state.totalPages = state.pdfJsDoc.numPages;
    state.pageOrder = Array.from({ length: state.totalPages }, (_, i) => i);

    fileNameEl.textContent = truncateFilename(file.name, 36);
    pageCountEl.textContent = state.totalPages;

    hideStatus();
    toolToolbar.style.display = "";
    hintBar.style.display = "";

    await renderAllThumbs();
    initSortable();
    scheduleDBSave();
  } catch (err) {
    console.error(err);
    statusMsg.innerHTML = `<span>⚠️ Failed to load PDF: ${err.message}</span>`;
    statusMsg.className = "status-msg error show";
  }
}

function truncateFilename(name, max) {
  if (name.length <= max) return name;
  const ext = name.slice(name.lastIndexOf("."));
  return name.slice(0, max - ext.length - 3) + "…" + ext;
}

// =============================================
//  RENDER THUMBNAILS
// =============================================
async function renderAllThumbs() {
  pagesGrid.innerHTML = "";

  for (let i = 0; i < state.pageOrder.length; i++) {
    const origIdx = state.pageOrder[i];
    const thumb = createThumbEl(i + 1, origIdx);
    pagesGrid.appendChild(thumb);

    // Render canvas async
    renderThumbCanvas(origIdx, thumb.querySelector("canvas"));
  }
}

function createThumbEl(displayNum, origIdx) {
  const div = document.createElement("div");
  div.className = "page-thumb";
  div.setAttribute("data-orig-idx", origIdx);
  div.setAttribute("role", "listitem");
  div.setAttribute("aria-label", `Page ${displayNum}`);

  div.innerHTML = `
        <div class="drag-handle" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
        </div>
        <div class="page-canvas-wrapper">
          <canvas></canvas>
        </div>
        <div class="page-footer">
          <span class="page-num">Page ${displayNum}</span>
          <button class="page-delete-btn" data-action="delete" aria-label="Delete page ${displayNum}" title="Delete this page">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
  return div;
}

async function renderThumbCanvas(origPageIdx, canvas) {
  try {
    const page = await state.pdfJsDoc.getPage(origPageIdx + 1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = 200 / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport: scaledViewport,
    }).promise;
  } catch (err) {
    console.warn("Failed to render page", origPageIdx + 1, err);
    const wrapper = canvas.closest(".page-canvas-wrapper");
    if (wrapper) {
      wrapper.innerHTML = `<span class="page-canvas-placeholder">📄</span>`;
    }
  }
}

// =============================================
//  SORTABLE
// =============================================
function initSortable() {
  if (state.sortableInstance) {
    state.sortableInstance.destroy();
  }
  state.sortableInstance = new Sortable(pagesGrid, {
    animation: 200,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    handle: ".page-thumb",
    delay: 200, // Hold down for 200ms on touch devices to start dragging
    delayOnTouchOnly: true, // Instantly drag with mouse, delay only on touch
    touchStartThreshold: 5, // Allows page scroll if finger drifts slightly before delay ends
    scroll: window,            // Force scrolling of window directly to bypass parent overflow:hidden
    scrollSensitivity: 120,    // Starts scrolling 120px from viewport edge
    scrollSpeed: 50,           // Fast, highly responsive scroll speed (px per interval)
    bubble: true,              // Enables parent container autoscrolling
    forceFallback: true, // Uses fallback element for cross-browser smoothness
    fallbackTolerance: 3, // Prevents accidental drags on small taps
    onEnd() {
      rebuildPageOrder();
    },
  });
}

function rebuildPageOrder() {
  const thumbs = pagesGrid.querySelectorAll(".page-thumb");
  state.pageOrder = Array.from(thumbs).map((t) =>
    parseInt(t.getAttribute("data-orig-idx"), 10),
  );
  // Update display numbers
  thumbs.forEach((t, i) => {
    const numEl = t.querySelector(".page-num");
    if (numEl) numEl.textContent = `Page ${i + 1}`;
    const delBtn = t.querySelector(".page-delete-btn");
    if (delBtn) delBtn.setAttribute("aria-label", `Delete page ${i + 1}`);
  });
  pageCountEl.textContent = state.pageOrder.length;
  scheduleDBSave();
}

// =============================================
//  EVENT DELEGATION (delete)
// =============================================
pagesGrid.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="delete"]')) {
    const thumb = e.target.closest(".page-thumb");
    if (!thumb) return;
    thumb.remove();
    rebuildPageOrder();
    if (state.pageOrder.length === 0) {
      emptyState.classList.add("show");
      toolToolbar.style.display = "none";
      hintBar.style.display = "none";
    }
  }
});

// =============================================
//  TOOLBAR BUTTONS
// =============================================
changeFileBtn.addEventListener("click", () => {
  // Reset everything
  uploadZone.style.display = "";
  reorderWorkspace.classList.remove("active");
  pagesGrid.innerHTML = "";
  emptyState.classList.remove("show");
  state.pdfBytes = null;
  state.pdfJsDoc = null;
  state.pageOrder = [];
  fileInput.value = "";
  if (state.sortableInstance) {
    state.sortableInstance.destroy();
    state.sortableInstance = null;
  }
  clearSessionFromDB();
});

resetOrderBtn.addEventListener("click", async () => {
  if (!state.pdfJsDoc) return;
  state.pageOrder = Array.from({ length: state.totalPages }, (_, i) => i);
  await renderAllThumbs();
  initSortable();
  pageCountEl.textContent = state.totalPages;
  emptyState.classList.remove("show");
  toolToolbar.style.display = "";
  hintBar.style.display = "";
  scheduleDBSave();
});

reverseBtn.addEventListener("click", () => {
  const thumbs = Array.from(pagesGrid.querySelectorAll(".page-thumb"));
  thumbs.reverse().forEach((t) => pagesGrid.appendChild(t));
  rebuildPageOrder();
});

// =============================================
//  DOWNLOAD (build reordered PDF via pdf-lib)
// =============================================
downloadBtn.addEventListener("click", async () => {
  if (!state.pdfBytes || state.pageOrder.length === 0) return;

  downloadBtn.disabled = true;
  downloadBtn.textContent = "Building PDF…";

  try {
    const { PDFDocument } = PDFLib;

    // Load original - pass a fresh clone so buffer is never mutated/detached
    const srcBytes = new Uint8Array(state.pdfBytes.slice().buffer);
    const srcDoc = await PDFDocument.load(srcBytes, {
      ignoreEncryption: true,
    });

    // Create new doc
    const newDoc = await PDFDocument.create();

    // Copy pages in current order
    const pagesToCopy = state.pageOrder;
    const copiedPages = await newDoc.copyPages(srcDoc, pagesToCopy);
    copiedPages.forEach((page) => newDoc.addPage(page));

    const outBytes = await newDoc.save();
    const blob = new Blob([outBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    const nameWithout = state.fileName.replace(/\.pdf$/i, "");
    a.download = `${nameWithout}-reordered.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast("PDF downloaded successfully!", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to generate PDF: " + err.message, "error", 5000);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download PDF`;
  }
});

// =============================================
//  TOAST NOTIFICATIONS
// =============================================
function showToast(msg, type = "info", dur = 3500, onClick = null, actionText = null) {
  const tc = document.getElementById("toastContainer");
  if (!tc) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const span = document.createElement("span");
  span.textContent = msg;
  toast.appendChild(span);

  if (actionText && typeof onClick === "function") {
    const actBtn = document.createElement("button");
    actBtn.type = "button";
    actBtn.className = "toast-btn";
    actBtn.textContent = actionText;
    actBtn.onclick = (e) => {
      e.stopPropagation();
      toast.remove();
      onClick();
    };
    toast.appendChild(actBtn);
    toast.classList.add("toast-clickable");
  } else if (typeof onClick === "function") {
    toast.classList.add("toast-clickable");
    toast.onclick = () => {
      toast.remove();
      onClick();
    };
  }

  tc.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px)";
    setTimeout(() => toast.remove(), 300);
  }, dur);
}

// =============================================
//  INDEXEDDB RECOVERY MODE
// =============================================
let dbPromise = null;
let saveTimer = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const DB_NAME = "pdfmaster_reorder_db";
    const DB_VERSION = 1;
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
      if (!db.objectStoreNames.contains("reorder_data")) {
        db.createObjectStore("reorder_data");
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function scheduleDBSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveSessionToDB();
  }, 400);
}

async function saveSessionToDB() {
  if (!state.pdfBytes || !state.fileName) return false;
  try {
    const db = await openDB();
    const tx = db.transaction(["settings", "reorder_data"], "readwrite");
    const settingsStore = tx.objectStore("settings");
    const dataStore = tx.objectStore("reorder_data");

    const sessionData = {
      timestamp: Date.now(),
      fileName: state.fileName,
      totalPages: state.totalPages,
      pageOrder: state.pageOrder,
    };
    settingsStore.put(sessionData, "session");

    const clonedBuffer = state.pdfBytes.slice().buffer;
    const docData = {
      fileName: state.fileName,
      bytes: clonedBuffer,
      pageOrder: state.pageOrder,
      totalPages: state.totalPages,
      timestamp: Date.now(),
    };
    dataStore.put(docData, "document");

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
    const tx = db.transaction(["settings", "reorder_data"], "readonly");
    const settingsReq = tx.objectStore("settings").get("session");
    const dataReq = tx.objectStore("reorder_data").get("document");

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

    if (!data || !data.bytes) {
      updateRecoveryBadge(false);
      if (isManual) {
        showToast("No stored session found in recovery storage.", "error");
      }
      return false;
    }

    state.fileName = data.fileName || "document.pdf";
    const rawBytes = data.bytes instanceof Uint8Array ? data.bytes : new Uint8Array(data.bytes);
    state.pdfBytes = new Uint8Array(rawBytes.slice().buffer);
    state.pageOrder = (session && Array.isArray(session.pageOrder) && session.pageOrder.length > 0)
      ? session.pageOrder
      : (data.pageOrder || []);

    // Show workspace
    uploadZone.style.display = "none";
    reorderWorkspace.classList.add("active");
    setLoading("Restoring your PDF session…");
    toolToolbar.style.display = "none";
    hintBar.style.display = "none";
    pagesGrid.innerHTML = "";
    emptyState.classList.remove("show");

    // Pass a cloned buffer to PDF.js so web worker transfer cannot detach state.pdfBytes
    const renderData = new Uint8Array(state.pdfBytes.slice().buffer);
    state.pdfJsDoc = await pdfjsLib.getDocument({ data: renderData }).promise;
    state.totalPages = state.pdfJsDoc.numPages;

    if (!state.pageOrder || state.pageOrder.length === 0) {
      state.pageOrder = Array.from({ length: state.totalPages }, (_, i) => i);
    }

    fileNameEl.textContent = truncateFilename(state.fileName, 36);
    pageCountEl.textContent = state.pageOrder.length;

    hideStatus();
    toolToolbar.style.display = "";
    hintBar.style.display = "";

    await renderAllThumbs();
    initSortable();
    updateRecoveryBadge(true);

    if (isManual) {
      showToast(`Restored '${state.fileName}' and your custom page order!`, "success", 4000);
    }
    return true;
  } catch (err) {
    console.warn("IndexedDB load failed:", err);
    if (isManual) {
      showToast("Could not access recovery storage: " + err.message, "error");
    }
    return false;
  }
}

async function clearSessionFromDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(["settings", "reorder_data"], "readwrite");
    tx.objectStore("settings").clear();
    tx.objectStore("reorder_data").clear();
    updateRecoveryBadge(false);
  } catch (err) {
    console.warn("IndexedDB clear failed:", err);
  }
}

async function checkStoredSessionAvailable(notifyOnFound = false) {
  try {
    const db = await openDB();
    const tx = db.transaction(["reorder_data"], "readonly");
    const dataReq = tx.objectStore("reorder_data").get("document");
    const data = await new Promise((res) => {
      dataReq.onsuccess = () => res(dataReq.result);
      dataReq.onerror = () => res(null);
    });

    const hasData = !!(data && data.bytes);
    updateRecoveryBadge(hasData);

    if (hasData && notifyOnFound && !state.pdfBytes) {
      const name = data.fileName ? `'${data.fileName}'` : "Previous document";
      showToast(
        `Last session (${name}) is available. Click to restore.`,
        "info",
        8000,
        () => loadSessionFromDB(true),
        "Restore"
      );
    }
    return hasData;
  } catch {
    updateRecoveryBadge(false);
    return false;
  }
}

function updateRecoveryBadge(hasData) {
  const badge = document.getElementById("recoveryBadge");
  if (badge) {
    badge.style.display = hasData ? "block" : "none";
  }
}

// Wire recovery button
const recoveryBtn = document.getElementById("recoveryBtn");
if (recoveryBtn) {
  recoveryBtn.addEventListener("click", () => {
    loadSessionFromDB(true);
  });
}

// Check stored session on startup
checkStoredSessionAvailable(true);
