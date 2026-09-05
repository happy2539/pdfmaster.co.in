// ════════════════ SCRIPTS ════════════════

// ─── Load PDF.js ────────────────────────────────────────────────────────
let pdfjsReady = false;
(function loadPdfJs() {
  const s = document.createElement("script");
  s.src = "/assets/vendor/pdf-3.4.120.min.js";
  s.onload = function () {
    const w = document.createElement("script");
    w.src = "/assets/vendor/pdf.worker-3.4.120.min.js";
    w.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = w.src;
      pdfjsReady = true;
    };
    document.head.appendChild(w);
  };
  document.head.appendChild(s);
})();

// ─── Load JSZip ─────────────────────────────────────────────────────────
let jsZipReady = false;
(function loadJsZip() {
  const s = document.createElement("script");
  s.src = "/assets/vendor/jszip.min.js";
  s.onload = () => {
    jsZipReady = true;
  };
  document.head.appendChild(s);
})();

// ─── State ───────────────────────────────────────────────────────────────
let pdfFile = null,
  currentPdfBytes = null,
  pdfDoc = null,
  convertedImages = [],
  totalPages = 0;
let downloadFormat = "same"; // track export format override

// ─── DOM refs ────────────────────────────────────────────────────────────
const uploadZone = document.getElementById("uploadZone");
const pdfFileInput = document.getElementById("pdfFileInput");
const fileInfo = document.getElementById("fileInfo");
const fileNameEl = document.getElementById("fileName");
const filePagesEl = document.getElementById("filePages");
const convertBtn = document.getElementById("convertBtn");
const resetBtn = document.getElementById("resetBtn");
const progressBlock = document.getElementById("progressBlock");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const progressPct = document.getElementById("progressPct");
const resultsSection = document.getElementById("resultsSection");
const imagesGrid = document.getElementById("imagesGrid");
const resultsCount = document.getElementById("resultsCount");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const downloadSingleBtn = document.getElementById("downloadSingleBtn");
const outputFormat = document.getElementById("outputFormat");
const dpiSelect = document.getElementById("dpiSelect");
const qualitySlider = document.getElementById("qualitySlider");
const qualityVal = document.getElementById("qualityVal");
const qualityDisplay = document.getElementById("qualityDisplay");
const qualityGroup = document.getElementById("qualityGroup");
const radioAll = document.getElementById("radioAll");
const radioSpec = document.getElementById("radioSpec");
const radioAllLabel = document.getElementById("radioAllLabel");
const radioSpecLabel = document.getElementById("radioSpecLabel");
const pagesInput = document.getElementById("pagesInput");
const pagesText = document.getElementById("pagesText");
const fmtBtns = document.getElementById("fmtBtns");

// ─── Theme ───────────────────────────────────────────────────────────────
const btn = document.getElementById("themeBtn");
const sunIcon = document.getElementById("sunIcon");
const moonIcon = document.getElementById("moonIcon");
const root = document.documentElement;

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  localStorage.setItem("pdfmaster-theme", theme);
  if (theme === "dark") {
    sunIcon.style.display = "block";
    moonIcon.style.display = "none";
  } else {
    sunIcon.style.display = "none";
    moonIcon.style.display = "block";
  }
}

const saved = localStorage.getItem("pdfmaster-theme") || "light";
applyTheme(saved);

btn.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

// ─── Sidebar / Hamburger ─────────────────────────────────────────────────
const hamburger = document.getElementById("hamburgerBtn");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");
const sidebarClose = document.getElementById("sidebarClose");

function openSidebar() {
  sidebar.classList.add("open");
  overlay.classList.add("active");
  hamburger.classList.add("open");
  hamburger.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}
function closeSidebar() {
  sidebar.classList.remove("open");
  overlay.classList.remove("active");
  hamburger.classList.remove("open");
  hamburger.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}
hamburger.addEventListener("click", () =>
  sidebar.classList.contains("open") ? closeSidebar() : openSidebar(),
);
overlay.addEventListener("click", closeSidebar);
sidebarClose.addEventListener("click", closeSidebar);
document
  .querySelectorAll(".snav-link")
  .forEach((a) => a.addEventListener("click", closeSidebar));

// ─── Back to top ─────────────────────────────────────────────────────────
const b2t = document.getElementById("b2t");
window.addEventListener(
  "scroll",
  () => {
    b2t.classList.toggle("show", window.scrollY > 400);
  },
  { passive: true },
);
b2t.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);

// ─── Toast ───────────────────────────────────────────────────────────────
let toastTimer;
function showToast(
  msg,
  type = "",
  dur = 3200,
  onClick = null,
  actionText = null,
) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.innerHTML = "";

  const span = document.createElement("span");
  span.textContent = msg;
  t.appendChild(span);

  if (actionText && typeof onClick === "function") {
    const actBtn = document.createElement("button");
    actBtn.type = "button";
    actBtn.className = "toast-btn";
    actBtn.textContent = actionText;
    actBtn.onclick = (e) => {
      e.stopPropagation();
      t.className = "toast";
      onClick();
    };
    t.appendChild(actBtn);
    t.classList.add("toast-clickable");
  } else if (typeof onClick === "function") {
    t.classList.add("toast-clickable");
    t.onclick = () => {
      t.className = "toast";
      onClick();
    };
  } else {
    t.classList.remove("toast-clickable");
    t.onclick = null;
  }

  t.className = "toast show " + type + (onClick ? " toast-clickable" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = "toast";
  }, dur);
}

// ─── Quality slider ──────────────────────────────────────────────────────
qualitySlider.addEventListener("input", () => {
  qualityVal.textContent = qualitySlider.value;
  qualityDisplay.textContent = qualitySlider.value + "%";
  scheduleDBSave();
});

// Show/hide quality slider based on format
function updateQualityVisibility() {
  const fmt = outputFormat.value;
  qualityGroup.style.display = fmt === "png" || fmt === "bmp" ? "none" : "";
}
outputFormat.addEventListener("change", () => {
  updateQualityVisibility();
  scheduleDBSave();
});
updateQualityVisibility();

dpiSelect.addEventListener("change", scheduleDBSave);

// ─── Page selection ──────────────────────────────────────────────────────
radioAll.addEventListener("change", () => {
  pagesInput.classList.remove("visible");
  radioAllLabel.classList.add("selected");
  radioSpecLabel.classList.remove("selected");
  scheduleDBSave();
});
radioSpec.addEventListener("change", () => {
  pagesInput.classList.add("visible");
  radioSpecLabel.classList.add("selected");
  radioAllLabel.classList.remove("selected");
  scheduleDBSave();
});

pagesText.addEventListener("input", scheduleDBSave);

// ─── Export format buttons ────────────────────────────────────────────────
fmtBtns.querySelectorAll(".fmt-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    fmtBtns
      .querySelectorAll(".fmt-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    downloadFormat = btn.dataset.fmt;
    scheduleDBSave();
  });
});

// ─── Upload zone ─────────────────────────────────────────────────────────
uploadZone.addEventListener("click", () => pdfFileInput.click());
uploadZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") pdfFileInput.click();
});

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
  const f = e.dataTransfer.files[0];
  if (f && f.type === "application/pdf") handleFileSelect(f);
  else showToast("Please drop a PDF file.", "error");
});

pdfFileInput.addEventListener("change", () => {
  if (pdfFileInput.files[0]) handleFileSelect(pdfFileInput.files[0]);
});

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}

function handleFileSelect(file) {
  pdfFile = file;
  convertBtn.disabled = true;
  resetBtn.disabled = false;
  resultsSection.classList.remove("visible");
  convertedImages = [];

  uploadZone.classList.add("has-file");
  uploadZone.querySelector("h3").textContent = file.name;
  uploadZone.querySelector("p").textContent =
    fmtSize(file.size) + " — Loading…";

  fileNameEl.textContent = file.name + " · " + fmtSize(file.size);
  fileInfo.classList.add("show");

  const reader = new FileReader();
  reader.onload = (e) => {
    currentPdfBytes = new Uint8Array(e.target.result);
    loadPdf(currentPdfBytes);
  };
  reader.readAsArrayBuffer(file);
}

function loadPdf(data, isRestore = false) {
  function tryLoad() {
    if (!pdfjsReady || !window.pdfjsLib) {
      setTimeout(tryLoad, 150);
      return;
    }
    const clone = new Uint8Array(data.slice().buffer);
    pdfjsLib
      .getDocument({ data: clone })
      .promise.then((pdf) => {
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        uploadZone.querySelector("p").textContent =
          fmtSize(pdfFile.size) +
          " · " +
          totalPages +
          " page" +
          (totalPages !== 1 ? "s" : "");
        filePagesEl.textContent = totalPages + " pages";
        convertBtn.disabled = false;
        scheduleDBSave();
        if (!isRestore) {
          showToast("PDF loaded — " + totalPages + " pages", "success");
        }
      })
      .catch((err) => {
        showToast("Could not read PDF. Is it password-protected?", "error");
        console.error(err);
      });
  }
  tryLoad();
}

// ─── Parse page ranges ────────────────────────────────────────────────────
function parsePageRanges(input, total) {
  const pages = new Set();
  input.split(",").forEach((chunk) => {
    chunk = chunk.trim();
    if (chunk.includes("-")) {
      const [a, b] = chunk.split("-").map(Number);
      for (let i = Math.max(1, a); i <= Math.min(b, total); i++) pages.add(i);
    } else {
      const n = parseInt(chunk);
      if (n >= 1 && n <= total) pages.add(n);
    }
  });
  return Array.from(pages).sort((a, b) => a - b);
}

// ─── Get MIME type ────────────────────────────────────────────────────────
function getMime(fmt) {
  const map = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    bmp: "image/bmp",
  };
  return map[fmt] || "image/jpeg";
}
function getExt(fmt) {
  const map = { jpeg: "jpg", png: "png", webp: "webp", bmp: "bmp" };
  return map[fmt] || "jpg";
}

// ─── Convert ─────────────────────────────────────────────────────────────
async function startConversion() {
  if (!pdfDoc || !pdfjsReady) return;

  const pages = radioAll.checked
    ? Array.from({ length: totalPages }, (_, i) => i + 1)
    : parsePageRanges(pagesText.value, totalPages);

  if (pages.length === 0) {
    showToast("No valid pages selected.", "error");
    return;
  }

  const fmt = outputFormat.value;
  const scale = parseFloat(dpiSelect.value);
  const qual = parseInt(qualitySlider.value) / 100;

  convertedImages = [];
  convertBtn.disabled = true;
  progressBlock.classList.add("visible");
  resultsSection.classList.remove("visible");
  imagesGrid.innerHTML = "";

  for (let i = 0; i < pages.length; i++) {
    const pageNum = pages[i];
    const pct = Math.round((i / pages.length) * 100);

    progressText.textContent = `Rendering page ${pageNum} (${i + 1} of ${pages.length})…`;
    progressPct.textContent = pct + "%";
    progressFill.style.width = pct + "%";

    try {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const dataUrl = canvas.toDataURL("image/" + fmt, qual);
      convertedImages.push({ pageNum, dataUrl, fmt, canvas });
    } catch (err) {
      console.error("Page render error:", err);
    }

    await new Promise((r) => setTimeout(r, 0)); // yield to UI
  }

  progressPct.textContent = "100%";
  progressFill.style.width = "100%";
  progressText.textContent = "Done!";

  setTimeout(() => progressBlock.classList.remove("visible"), 1200);
  convertBtn.disabled = false;
  renderResults();
}

convertBtn.addEventListener("click", startConversion);

// ─── Render results ───────────────────────────────────────────────────────
function renderResults() {
  imagesGrid.innerHTML = "";
  resultsCount.textContent =
    convertedImages.length +
    " page" +
    (convertedImages.length !== 1 ? "s" : "");

  convertedImages.forEach(({ pageNum, dataUrl, fmt }) => {
    const item = document.createElement("div");
    item.className = "img-item";
    item.innerHTML = `
          <img src="${dataUrl}" alt="Page ${pageNum}" loading="lazy" />
          <div class="img-item-footer">
            <span class="img-page-label">Page ${pageNum}</span>
            <button class="img-dl-btn" data-page="${pageNum}" aria-label="Download page ${pageNum}">
              ↓ Save
            </button>
          </div>`;
    imagesGrid.appendChild(item);
  });

  // Per-image download
  imagesGrid.querySelectorAll(".img-dl-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pn = parseInt(btn.dataset.page);
      const img = convertedImages.find((x) => x.pageNum === pn);
      if (!img) return;
      const useFmt = downloadFormat === "same" ? img.fmt : downloadFormat;
      const qual = parseInt(qualitySlider.value) / 100;
      const url = img.canvas.toDataURL(
        "image/" + useFmt,
        qual,
      );
      const ext = getExt(useFmt);
      const fileName = `${baseName()}_page${pn}.${ext}`;
      triggerDownload(url, fileName);
      showToast(`Page ${pn} downloaded (${ext.toUpperCase()})!`, "success");
    });
  });

  if (convertedImages.length === 1) {
    downloadAllBtn.style.display = "none";
    downloadSingleBtn.style.display = "inline-flex";
  } else {
    downloadAllBtn.style.display = "inline-flex";
    downloadSingleBtn.style.display = "none";
  }

  resultsSection.classList.add("visible");
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(
    "Conversion complete! " + convertedImages.length + " image(s) ready.",
    "success",
  );
}

// Single-page shortcut
downloadSingleBtn.addEventListener("click", () => {
  if (convertedImages.length !== 1) return;
  const img = convertedImages[0];
  const useFmt = downloadFormat === "same" ? img.fmt : downloadFormat;
  const qual = parseInt(qualitySlider.value) / 100;
  const url = img.canvas.toDataURL(
    "image/" + useFmt,
    qual,
  );
  const fn = `${baseName()}_page${img.pageNum}.${getExt(useFmt)}`;
  triggerDownload(url, fn);
  showToast("Image downloaded!", "success");

  if (window.PDFMasterPopup) {
    window.PDFMasterPopup.show({
      fileType: "image",
      fileName: fn,
      fileSize: null,
      downloadText: "Download Image Again",
      toolName: "PDF to Photo",
      onDownload: () => {
        triggerDownload(url, fn);
      },
    });
  }
});

// ─── Download all as ZIP ──────────────────────────────────────────────────
downloadAllBtn.addEventListener("click", async () => {
  if (!jsZipReady) {
    showToast("Please wait, loading ZIP library…", "");
    return;
  }
  if (convertedImages.length === 0) return;

  downloadAllBtn.disabled = true;
  downloadAllBtn.textContent = "Zipping…";
  progressBlock.classList.add("visible");
  progressText.textContent = "Building ZIP…";

  try {
    const zip = new JSZip();
    const folder = zip.folder(baseName());
    const useFmt =
      downloadFormat === "same" ? convertedImages[0].fmt : downloadFormat;
    const qual = parseInt(qualitySlider.value) / 100;

    for (let i = 0; i < convertedImages.length; i++) {
      const img = convertedImages[i];
      const fmtUse = downloadFormat === "same" ? img.fmt : downloadFormat;
      const url = img.canvas.toDataURL("image/" + fmtUse, qual);
      const b64 = url.split(",")[1];
      folder.file(`page${img.pageNum}.${getExt(fmtUse)}`, b64, {
        base64: true,
      });
      const pct = Math.round(((i + 1) / convertedImages.length) * 70);
      progressFill.style.width = pct + "%";
      progressPct.textContent = pct + "%";
      await new Promise((r) => setTimeout(r, 0));
    }

    progressText.textContent = "Compressing ZIP…";
    const blob = await zip.generateAsync(
      {
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      },
      (meta) => {
        const p = 70 + Math.round(meta.percent * 0.3);
        progressFill.style.width = p + "%";
        progressPct.textContent = p + "%";
      },
    );

    progressFill.style.width = "100%";
    progressPct.textContent = "100%";
    progressText.textContent = "Done!";
    const zipName = `${baseName()}_images.zip`;
    triggerDownload(URL.createObjectURL(blob), zipName);
    showToast("ZIP downloaded!", "success");

    if (window.PDFMasterPopup) {
      window.PDFMasterPopup.show({
        fileType: "zip",
        fileName: zipName,
        fileSize: blob.size,
        downloadText: "Download ZIP Again",
        secondaryText: "Done",
        toolName: "PDF to Photo",
        blob: blob,
        onDownload: () => {
          triggerDownload(URL.createObjectURL(blob), zipName);
        },
      });
    }
  } catch (err) {
    showToast("ZIP creation failed: " + err.message, "error");
    console.error(err);
  } finally {
    setTimeout(() => progressBlock.classList.remove("visible"), 1200);
    downloadAllBtn.disabled = false;
    downloadAllBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 3v13M5 14l7 7 7-7"/><path d="M3 20h18"/></svg> Download All as ZIP`;
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function baseName() {
  return pdfFile ? pdfFile.name.replace(/\.pdf$/i, "") : "output";
}
function triggerDownload(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ─── Reset ───────────────────────────────────────────────────────────────
function resetForm() {
  pdfFile = null;
  currentPdfBytes = null;
  pdfDoc = null;
  convertedImages = [];
  totalPages = 0;
  pdfFileInput.value = "";
  uploadZone.classList.remove("has-file", "drag-over");
  uploadZone.querySelector("h3").textContent = "Drop your PDF here";
  uploadZone.querySelector("p").textContent = "or click to browse files";
  fileInfo.classList.remove("show");
  fileNameEl.textContent = "No file selected";
  filePagesEl.textContent = "";
  convertBtn.disabled = true;
  resetBtn.disabled = true;
  progressBlock.classList.remove("visible");
  resultsSection.classList.remove("visible");
  imagesGrid.innerHTML = "";
  progressFill.style.width = "0%";
  clearSessionFromDB();
}
resetBtn.addEventListener("click", resetForm);

// ─── FAQ accordion ────────────────────────────────────────────────────────
document.querySelectorAll(".faq-item").forEach((item) => {
  item.querySelector(".faq-q").addEventListener("click", () => {
    const open = item.classList.toggle("open");
    item.querySelector(".faq-icon").textContent = open ? "+" : "+";
  });
});

// ─── IndexedDB Recovery Engine ───────────────────────────────────────────
let dbPromise = null;
let saveTimer = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const DB_NAME = "pdfmaster_photo_db";
    const DB_VERSION = 1;
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

function scheduleDBSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveSessionToDB();
  }, 400);
}

async function saveSessionToDB() {
  if (!currentPdfBytes || !pdfFile) return false;
  try {
    const db = await openDB();
    const tx = db.transaction(["settings", "photo_data"], "readwrite");
    const settingsStore = tx.objectStore("settings");
    const dataStore = tx.objectStore("photo_data");

    const sessionData = {
      timestamp: Date.now(),
      fileName: pdfFile.name,
      fileSize: pdfFile.size,
      outputFormat: outputFormat.value,
      dpiSelect: dpiSelect.value,
      qualitySlider: qualitySlider.value,
      radioMode: radioAll.checked ? "all" : "spec",
      pagesText: pagesText.value,
      downloadFormat: downloadFormat,
    };
    settingsStore.put(sessionData, "session");

    const clonedBuffer = currentPdfBytes.slice().buffer;
    const fileData = {
      fileName: pdfFile.name,
      fileSize: pdfFile.size,
      bytes: clonedBuffer,
      timestamp: Date.now(),
    };
    dataStore.put(fileData, "file");

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
    const tx = db.transaction(["settings", "photo_data"], "readonly");
    const settingsReq = tx.objectStore("settings").get("session");
    const dataReq = tx.objectStore("photo_data").get("file");

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

    pdfFile = {
      name: data.fileName || "document.pdf",
      size: data.fileSize || data.bytes.byteLength,
    };
    const rawBytes =
      data.bytes instanceof Uint8Array ? data.bytes : new Uint8Array(data.bytes);
    currentPdfBytes = new Uint8Array(rawBytes.slice().buffer);

    convertBtn.disabled = true;
    resetBtn.disabled = false;
    resultsSection.classList.remove("visible");
    convertedImages = [];

    uploadZone.classList.add("has-file");
    uploadZone.querySelector("h3").textContent = pdfFile.name;
    uploadZone.querySelector("p").textContent =
      fmtSize(pdfFile.size) + " — Restoring…";

    fileNameEl.textContent = pdfFile.name + " · " + fmtSize(pdfFile.size);
    fileInfo.classList.add("show");

    if (session) {
      if (session.outputFormat && outputFormat) {
        outputFormat.value = session.outputFormat;
        updateQualityVisibility();
      }
      if (session.dpiSelect && dpiSelect) {
        dpiSelect.value = session.dpiSelect;
      }
      if (session.qualitySlider && qualitySlider) {
        qualitySlider.value = session.qualitySlider;
        qualityVal.textContent = session.qualitySlider;
        qualityDisplay.textContent = session.qualitySlider + "%";
      }
      if (session.radioMode === "spec" && radioSpec) {
        radioSpec.checked = true;
        radioAll.checked = false;
        pagesInput.classList.add("visible");
        radioSpecLabel.classList.add("selected");
        radioAllLabel.classList.remove("selected");
      } else if (radioAll) {
        radioAll.checked = true;
        radioSpec.checked = false;
        pagesInput.classList.remove("visible");
        radioAllLabel.classList.add("selected");
        radioSpecLabel.classList.remove("selected");
      }
      if (session.pagesText && pagesText) {
        pagesText.value = session.pagesText;
      }
      if (session.downloadFormat) {
        downloadFormat = session.downloadFormat;
        fmtBtns.querySelectorAll(".fmt-btn").forEach((b) => {
          b.classList.toggle("active", b.dataset.fmt === downloadFormat);
        });
      }
    }

    loadPdf(currentPdfBytes, true);
    updateRecoveryBadge(true);

    if (isManual) {
      showToast(
        `Restored '${pdfFile.name}' and conversion options!`,
        "success",
        4000,
      );
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
    const tx = db.transaction(["settings", "photo_data"], "readwrite");
    tx.objectStore("settings").clear();
    tx.objectStore("photo_data").clear();
    updateRecoveryBadge(false);
  } catch (err) {
    console.warn("IndexedDB clear failed:", err);
  }
}

async function checkStoredSessionAvailable(notifyOnFound = false) {
  try {
    const db = await openDB();
    const tx = db.transaction(["photo_data"], "readonly");
    const dataReq = tx.objectStore("photo_data").get("file");
    const data = await new Promise((res) => {
      dataReq.onsuccess = () => res(dataReq.result);
      dataReq.onerror = () => res(null);
    });

    const hasData = !!(data && data.bytes);
    updateRecoveryBadge(hasData);

    if (hasData && notifyOnFound && !currentPdfBytes) {
      const name = data.fileName ? `'${data.fileName}'` : "Previous PDF";
      showToast(
        `Last session (${name}) is available. Click to restore.`,
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
