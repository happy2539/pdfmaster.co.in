"use strict";

// ── pdf.js worker setup ──────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "/assets/vendor/pdf.worker.min.js";

// ── State ─────────────────────────────────────────────
let currentFile = null;
let currentFileObj = null;
let currentPdfBytes = null;
let currentBlobUrl = null;
let currentMeta = null;
let cleanPdfBytes = null;
let isOffloaded = false;

const LOW_RAM_THRESHOLD = 50 * 1024 * 1024; // 50 MB threshold for Low-RAM mode

// ── Theme ─────────────────────────────────────────────
const btn = document.getElementById("themeBtn");
const sunIcon = document.getElementById("sunIcon");
const moonIcon = document.getElementById("moonIcon");
const root = document.documentElement;

const applyTheme = (t) => {
  root.setAttribute("data-theme", t);
  localStorage.setItem("pdfm-theme", t);
  if (t === "dark") {
    sunIcon.style.display = "block";
    moonIcon.style.display = "none";
  } else {
    sunIcon.style.display = "none";
    moonIcon.style.display = "block";
  }
};
applyTheme(localStorage.getItem("pdfm-theme") || "light");
btn.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

// ── Hamburger & Drawer ────────────────────────────────
const hamburgerBtn = document.getElementById("hamburgerBtn");
const drawerOverlay = document.getElementById("drawerOverlay");
const navDrawer = document.getElementById("navDrawer");
const drawerClose = document.getElementById("drawerClose");

const openDrawer = () => {
  navDrawer.classList.add("open");
  drawerOverlay.classList.add("open");
  hamburgerBtn.classList.add("active");
  hamburgerBtn.setAttribute("aria-expanded", "true");
};
const closeDrawer = () => {
  navDrawer.classList.remove("open");
  drawerOverlay.classList.remove("open");
  hamburgerBtn.classList.remove("active");
  hamburgerBtn.setAttribute("aria-expanded", "false");
};
hamburgerBtn.addEventListener("click", openDrawer);
drawerClose.addEventListener("click", closeDrawer);
drawerOverlay.addEventListener("click", closeDrawer);

function navTo(id) {
  closeDrawer();
  setTimeout(
    () =>
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    200,
  );
}

// ── Tabs ──────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => {
      x.classList.remove("active");
      x.setAttribute("aria-selected", "false");
    });
    t.classList.add("active");
    t.setAttribute("aria-selected", "true");
    const name = t.dataset.tab;
    ["view", "security", "remove", "raw"].forEach((n) => {
      const el = document.getElementById("tab-" + n);
      el?.classList.toggle("hidden", n !== name);
    });
  });
});

// ── FAQ accordion ─────────────────────────────────────
function toggleFaq(el) {
  const item = el.parentElement;
  item.classList.toggle("open");
  el.setAttribute("aria-expanded", item.classList.contains("open"));
}
document.querySelectorAll(".faq-q").forEach((q) => {
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleFaq(q);
    }
  });
});

// ── Back to top ───────────────────────────────────────
const b2t = document.getElementById("b2t");
window.addEventListener(
  "scroll",
  () => b2t.classList.toggle("visible", window.scrollY > 400),
  { passive: true },
);
b2t.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);

// ── Toast ─────────────────────────────────────────────
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
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, dur);
}

// ── Upload / Drop zone ────────────────────────────────
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () =>
  dropZone.classList.remove("drag-over"),
);
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const f = e.dataTransfer.files[0];
  if (f && f.type === "application/pdf") loadFile(f);
  else showToast("Please drop a valid PDF file.", "error");
});
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

// ── Reset ─────────────────────────────────────────────
function resetTool() {
  if (currentBlobUrl) {
    try {
      URL.revokeObjectURL(currentBlobUrl);
    } catch (e) {}
    currentBlobUrl = null;
  }
  currentFile = currentFileObj = currentPdfBytes = currentMeta = cleanPdfBytes = null;
  isOffloaded = false;
  const lowRamBadge = document.getElementById("lowRamBadge");
  if (lowRamBadge) {
    lowRamBadge.style.display = "none";
  }
  fileInput.value = "";
  document.getElementById("toolArea").classList.add("hidden");
  document.getElementById("resultCard").classList.remove("visible");
  document.getElementById("removeBtn").disabled = false;
  document.getElementById("progressWrap").classList.remove("visible");
  document.getElementById("progressFill").style.width = "0%";
  clearSessionFromDB();
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast("Ready for a new file.", "info");
}

// ── Load file ─────────────────────────────────────────
async function loadFile(file) {
  currentFile = file;
  currentFileObj = file;
  cleanPdfBytes = null;

  if (currentBlobUrl) {
    try {
      URL.revokeObjectURL(currentBlobUrl);
    } catch (e) {}
    currentBlobUrl = null;
  }

  isOffloaded = file.size > LOW_RAM_THRESHOLD;
  const lowRamBadge = document.getElementById("lowRamBadge");
  if (lowRamBadge) {
    lowRamBadge.style.display = isOffloaded ? "inline-flex" : "none";
  }

  document.getElementById("fileName").textContent = file.name;
  document.getElementById("fileSize").textContent = formatBytes(file.size);
  document.getElementById("statSize").textContent = formatBytes(file.size);

  document.getElementById("toolArea").classList.remove("hidden");
  // Reset remove tab
  document.getElementById("resultCard").classList.remove("visible");
  document.getElementById("removeBtn").disabled = false;
  document.getElementById("progressWrap").classList.remove("visible");
  document.getElementById("progressFill").style.width = "0%";

  if (isOffloaded) {
    showToast(
      `⚡ Low-RAM Mode: Large PDF (${formatBytes(file.size)} > 50MB) stored in IndexedDB disk cache to preserve system RAM.`,
      "info",
      4000,
    );
    currentPdfBytes = null; // Reclaim RAM immediately!
    currentBlobUrl = URL.createObjectURL(file);
    await extractAndRender(currentBlobUrl, file, true);
    await saveSessionToDB();
  } else {
    showToast("Reading PDF…", "info", 2000);
    const arrBuf = await file.arrayBuffer();
    currentPdfBytes = new Uint8Array(arrBuf);
    await extractAndRender(currentPdfBytes, file, false);
    await saveSessionToDB();
  }

  document
    .getElementById("toolArea")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Helpers ───────────────────────────────────────────
function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}

function parseDate(raw) {
  try {
    if (!raw || !raw.startsWith("D:")) return "";
    const m = raw.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
    return "";
  } catch {
    return "";
  }
}

function calcRisk(info, xmp, custom) {
  let s = 0;
  if (info.Author) s += 3;
  if (info.Creator) s += 2;
  if (info.Producer) s += 1;
  if (info["Creation Date"]) s += 2;
  if (info["Modification Date"]) s += 2;
  if (Object.keys(xmp).length) s += 3;
  if (Object.keys(custom).length) s += 2;
  if (s >= 8) return { level: "High", color: "var(--danger)", code: "high" };
  if (s >= 4) return { level: "Med", color: "var(--warning)", code: "med" };
  return { level: "Low", color: "var(--success)", code: "low" };
}

// ── Extract & render metadata ─────────────────────────
async function extractAndRender(source, file, isUrl = false) {
  let pdf = null;
  try {
    const loadingTask = isUrl
      ? pdfjsLib.getDocument({
          url: source,
          cMapUrl: "/assets/vendor/cmaps/",
          cMapPacked: true,
          disableAutoFetch: true,
        })
      : pdfjsLib.getDocument({
          data: source instanceof Uint8Array ? source.slice(0) : source,
          cMapUrl: "/assets/vendor/cmaps/",
          cMapPacked: true,
          disableAutoFetch: true,
        });

    pdf = await loadingTask.promise;
    const meta = await pdf.getMetadata();
    const info = meta.info || {};
    const pages = pdf.numPages;

    const docInfo = {
      Title: info.Title || "",
      Author: info.Author || "",
      Subject: info.Subject || "",
      Keywords: info.Keywords || "",
      Creator: info.Creator || "",
      Producer: info.Producer || "",
      "Creation Date": parseDate(info.CreationDate),
      "Modification Date": parseDate(info.ModDate),
      "PDF Version": info.PDFFormatVersion || "",
      Language: info.Language || "",
    };

    const docProps = {
      "Page Count": pages,
      "File Name": file.name,
      "File Size": formatBytes(file.size),
      Encrypted: info.IsAcroFormPresent ? "Yes" : "No",
      Linearized: info.IsLinearized ? "Yes" : "No",
      "Tagged PDF": info.IsTaggedPDF ? "Yes" : "No",
      "AcroForm Present": info.IsAcroFormPresent ? "Yes" : "No",
      "XFA Present": info.IsXFAPresent ? "Yes" : "No",
      "Signatures Present": info.HasSignature ? "Yes" : "No",
    };

    let xmpFields = {};
    if (meta.metadata?.getAll) Object.assign(xmpFields, meta.metadata.getAll());

    const stdKeys = new Set([
      "Title",
      "Author",
      "Subject",
      "Keywords",
      "Creator",
      "Producer",
      "CreationDate",
      "ModDate",
      "PDFFormatVersion",
      "Language",
      "IsAcroFormPresent",
      "IsLinearized",
      "IsTaggedPDF",
      "IsXFAPresent",
      "HasSignature",
    ]);
    const customFields = {};
    Object.entries(info).forEach(([k, v]) => {
      if (!stdKeys.has(k)) customFields[k] = v;
    });

    currentMeta = { docInfo, docProps, xmpFields, customFields, pages };

    const allFieldCount =
      Object.values(docInfo).filter(Boolean).length +
      Object.keys(xmpFields).length +
      Object.keys(customFields).length;
    document.getElementById("statFields").textContent = allFieldCount;
    document.getElementById("statPages").textContent = pages;

    const risk = calcRisk(docInfo, xmpFields, customFields);
    const riskEl = document.getElementById("statRisk");
    riskEl.textContent = risk.level;
    riskEl.style.color = risk.color;

    renderMetaView(docInfo, docProps, xmpFields, customFields);
    renderSecurity(docInfo, xmpFields, customFields, risk);
    renderRaw(docInfo, docProps, xmpFields, customFields);
    showToast("PDF loaded — metadata scanned successfully.", "success");
  } catch (e) {
    console.error(e);
    document.getElementById("metaContainer").innerHTML =
      `<div style="padding:20px;color:var(--danger);background:var(--danger-bg);border-radius:8px;display:flex;align-items:center;gap:8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>Could not read metadata: ${e.message}</div>`;
    showToast(
      "Failed to read PDF. The file may be encrypted or corrupted.",
      "error",
    );
  } finally {
    if (pdf) {
      try {
        if (pdf.destroy) pdf.destroy();
        else if (pdf.cleanup) pdf.cleanup();
      } catch (e) {}
    }
  }
}

// ── Render metadata view ──────────────────────────────
function renderMetaView(docInfo, docProps, xmpFields, customFields) {
  const c = document.getElementById("metaContainer");
  c.innerHTML = "";
  c.appendChild(buildSection('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>Document Information', docInfo));
  c.appendChild(buildSection('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>Document Properties', docProps));
  if (Object.keys(xmpFields).length)
    c.appendChild(buildSection('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>XMP Metadata', xmpFields));
  if (Object.keys(customFields).length)
    c.appendChild(buildSection('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>Custom Fields', customFields));
}

function buildSection(title, fields) {
  const wrap = document.createElement("div");
  wrap.className = "meta-section";
  const head = document.createElement("div");
  head.className = "meta-section-head";
  head.innerHTML = title;
  wrap.appendChild(head);
  Object.entries(fields).forEach(([k, v]) => {
    const row = document.createElement("div");
    row.className = "meta-row";
    row.dataset.key = k.toLowerCase();
    row.dataset.val = String(v).toLowerCase();
    const key = document.createElement("div");
    key.className = "meta-key";
    key.textContent = k;
    const val = document.createElement("div");
    if (!v || v === "") {
      val.className = "meta-val empty";
      val.textContent = "— not set —";
    } else if (String(v) === "Yes" || String(v) === "No") {
      val.className = "meta-val";
      const badge = document.createElement("span");
      badge.className =
        "meta-badge " + (v === "Yes" ? "badge-yes" : "badge-no");
      badge.textContent = v;
      val.appendChild(badge);
    } else {
      val.className = "meta-val";
      val.textContent = v;
    }
    row.appendChild(key);
    row.appendChild(val);
    wrap.appendChild(row);
  });
  return wrap;
}

function filterMeta() {
  const q = document.getElementById("metaSearch").value.toLowerCase();
  document.querySelectorAll(".meta-row").forEach((row) => {
    const match = row.dataset.key.includes(q) || row.dataset.val.includes(q);
    row.style.display = q && !match ? "none" : "";
  });
  // Show/hide section heads if all rows hidden
  document.querySelectorAll(".meta-section").forEach((sec) => {
    const rows = sec.querySelectorAll(".meta-row");
    const anyVisible = Array.from(rows).some((r) => r.style.display !== "none");
    sec.style.display = q && !anyVisible ? "none" : "";
  });
}

// ── Render security tab ───────────────────────────────
function renderSecurity(docInfo, xmpFields, customFields, risk) {
  const c = document.getElementById("securityContainer");
  c.innerHTML = "";
  const findings = [];
  if (docInfo.Author)
    findings.push({
      level: "high",
      title: "Author Identity Exposed",
      desc: `The "Author" field contains: "${docInfo.Author}". This can directly identify who created the document.`,
    });
  if (docInfo.Creator)
    findings.push({
      level: "med",
      title: "Creator Application Visible",
      desc: `Created with: "${docInfo.Creator}". Reveals your software stack and version fingerprint.`,
    });
  if (docInfo.Producer)
    findings.push({
      level: "med",
      title: "Producer Tool Visible",
      desc: `Produced by: "${docInfo.Producer}". May reveal PDF workflow tools and versions used.`,
    });
  if (docInfo["Creation Date"])
    findings.push({
      level: "med",
      title: "Creation Date Present",
      desc: `Document created on: ${docInfo["Creation Date"]}. Reveals exact creation time, timezone, and work schedule.`,
    });
  if (docInfo["Modification Date"])
    findings.push({
      level: "med",
      title: "Modification Date Present",
      desc: `Last modified: ${docInfo["Modification Date"]}. Exposes your edit history timeline.`,
    });
  if (docInfo.Title)
    findings.push({
      level: "med",
      title: "Document Title Embedded",
      desc: `Title: "${docInfo.Title}". Internal document names can reveal confidential project or case names.`,
    });
  if (Object.keys(xmpFields).length > 0)
    findings.push({
      level: "high",
      title: "XMP Metadata Stream Detected",
      desc: `Contains ${Object.keys(xmpFields).length} XMP field(s). XMP can hold company names, document IDs, revision history, and more.`,
    });
  if (Object.keys(customFields).length > 0)
    findings.push({
      level: "med",
      title: "Non-Standard Fields Found",
      desc: `${Object.keys(customFields).length} custom field(s) detected. May contain application-specific private data.`,
    });
  if (!findings.length)
    findings.push({
      level: "low",
      title: "Minimal Privacy Exposure",
      desc: "No significant privacy-sensitive metadata was found in this PDF.",
    });

  // Summary card
  const riskBg =
    risk.code === "high"
      ? "var(--danger-bg)"
      : risk.code === "med"
        ? "var(--warning-bg)"
        : "var(--success-bg)";
  const sumCard = document.createElement("div");
  sumCard.className = "sec-card";
  sumCard.style.marginBottom = "20px";
  sumCard.innerHTML = `
    <div class="sec-card-head" style="background:${riskBg}">
      <span class="sec-dot dot-${risk.code}"></span>
      <h4>Overall Privacy Risk: ${risk.level}</h4>
      <span class="sec-tag sec-tag-${risk.code === "high" ? "high" : risk.code === "med" ? "med" : "low"}">${findings.length} finding(s)</span>
    </div>
    <div class="sec-card-body" style="display:flex;gap:10px;align-items:flex-start;">
      <span style="display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">${
        risk.code === "high"
          ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
          : risk.code === "med"
            ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
            : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14 9 11"></polyline></svg>`
      }</span>
      <span>${
        risk.code === "high"
          ? "This PDF contains sensitive metadata that could identify you or your organisation. Remove it before sharing externally."
          : risk.code === "med"
            ? "Some metadata fields may reveal information about the creator or workflow. Consider stripping before distributing."
            : "This PDF appears to have minimal sensitive metadata. You may still want to verify individual fields below."
      }</span>
    </div>`;
  c.appendChild(sumCard);

  findings.forEach((f) => {
    const card = document.createElement("div");
    card.className = "sec-card";
    card.innerHTML = `
      <div class="sec-card-head">
        <span class="sec-dot dot-${f.level === "high" ? "high" : f.level === "med" ? "med" : "low"}"></span>
        <h4>${f.title}</h4>
        <span class="sec-tag sec-tag-${f.level === "high" ? "high" : f.level === "med" ? "med" : "low"}">${f.level.toUpperCase()}</span>
      </div>
      <div class="sec-card-body">${f.desc}</div>`;
    c.appendChild(card);
  });
}

// ── Render raw JSON ───────────────────────────────────
function renderRaw(docInfo, docProps, xmpFields, customFields) {
  const obj = {
    documentInfo: docInfo,
    documentProperties: docProps,
    xmpMetadata: xmpFields,
    customFields,
  };
  document.getElementById("rawJson").textContent = JSON.stringify(obj, null, 2);
}

function copyRaw() {
  navigator.clipboard
    .writeText(document.getElementById("rawJson").textContent)
    .then(() => showToast("Copied to clipboard!", "success"))
    .catch(() =>
      showToast("Copy failed — please select and copy manually.", "error"),
    );
}

// ── Download metadata exports ─────────────────────────
function downloadMetaJson() {
  if (!currentMeta) return;
  const { docInfo, docProps, xmpFields, customFields } = currentMeta;
  const obj = {
    documentInfo: docInfo,
    documentProperties: docProps,
    xmpMetadata: xmpFields,
    customFields,
  };
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  dl(
    blob,
    (currentFile?.name.replace(/\.pdf$/i, "") || "metadata") + "_metadata.json",
  );
  showToast("Metadata JSON downloaded.", "success");
}

function downloadMetaTxt() {
  if (!currentMeta) return;
  const { docInfo, docProps, xmpFields, customFields } = currentMeta;
  const lines = [
    "PDF METADATA REPORT",
    "===================",
    `File: ${currentFile?.name}`,
    `Generated: ${new Date().toLocaleString()}`,
    `Tool: PDFMaster (pdfmaster.co.in)`,
    "",
  ];
  const sec = (title, fields) => {
    lines.push(title, "-".repeat(title.length));
    Object.entries(fields).forEach(([k, v]) => lines.push(`${k}: ${v || "—"}`));
    lines.push("");
  };
  sec("Document Information", docInfo);
  sec("Document Properties", docProps);
  if (Object.keys(xmpFields).length) sec("XMP Metadata", xmpFields);
  if (Object.keys(customFields).length) sec("Custom Fields", customFields);
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  dl(
    blob,
    (currentFile?.name.replace(/\.pdf$/i, "") || "metadata") + "_metadata.txt",
  );
  showToast("Metadata TXT report downloaded.", "success");
}

function dl(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── Remove Metadata ───────────────────────────────────
// Uses the deep deletion approach: directly removes keys from the raw PDF
// Info Dictionary via pdf-lib's context API, rather than setting empty strings.
// In Low-RAM mode, reads from IndexedDB/Blob sequentially and frees memory immediately.

async function getFileBytesForProcessing() {
  if (currentPdfBytes) {
    return currentPdfBytes;
  }
  if (currentFileObj instanceof Blob) {
    const ab = await currentFileObj.arrayBuffer();
    return new Uint8Array(ab);
  }
  const db = await openDB();
  const tx = db.transaction(["metadata_data"], "readonly");
  const dataReq = tx.objectStore("metadata_data").get("file");
  const data = await new Promise((res) => {
    dataReq.onsuccess = () => res(dataReq.result);
    dataReq.onerror = () => res(null);
  });
  if (data) {
    if (data.file instanceof Blob) {
      const ab = await data.file.arrayBuffer();
      return new Uint8Array(ab);
    }
    if (data.bytes) {
      return new Uint8Array(data.bytes);
    }
  }
  throw new Error("PDF file buffer unavailable in local storage");
}

async function removeAll() {
  ["rmAuthor", "rmDates", "rmTitle", "rmApp", "rmXmp", "rmCustom"].forEach(
    (id) => {
      document.getElementById(id).checked = true;
    },
  );
  await removeMetadata();
}

async function removeMetadata() {
  if (!currentFile) {
    showToast("Please upload a PDF first.", "error");
    return;
  }

  const removeBtn = document.getElementById("removeBtn");
  const progressWrap = document.getElementById("progressWrap");
  const progressFill = document.getElementById("progressFill");
  const progressLabel = document.getElementById("progressLabel");
  const resultCard = document.getElementById("resultCard");

  const rmAuthor = document.getElementById("rmAuthor").checked;
  const rmDates = document.getElementById("rmDates").checked;
  const rmTitle = document.getElementById("rmTitle").checked;
  const rmApp = document.getElementById("rmApp").checked;
  const rmXmp = document.getElementById("rmXmp").checked;
  const rmCustom = document.getElementById("rmCustom").checked;

  removeBtn.disabled = true;
  progressWrap.classList.add("visible");
  resultCard.classList.remove("visible");

  const setProgress = (p, label) => {
    progressFill.style.width = `${p}%`;
    progressLabel.textContent = label;
  };

  try {
    if (isOffloaded) {
      setProgress(10, "⚡ Low-RAM Streaming: Reading from disk cache…");
    } else {
      setProgress(10, "Loading PDF…");
    }
    await new Promise((r) => setTimeout(r, 30));

    let bytes = await getFileBytesForProcessing();

    const { PDFDocument, PDFName } = PDFLib;
    const pdfDoc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
    });

    if (isOffloaded) {
      bytes = null; // Reclaim intermediate raw buffer immediately
    }

    setProgress(35, "Stripping info dictionary fields…");
    await new Promise((r) => setTimeout(r, 20));

    // ── Step 1: Delete keys directly from the Info Dictionary ──
    const infoRef = pdfDoc.context.trailerInfo?.Info;
    if (infoRef) {
      const infoDict = pdfDoc.context.lookup(infoRef);
      if (infoDict && typeof infoDict.delete === "function") {
        const toDelete = [];
        if (rmTitle) toDelete.push("Title", "Subject", "Keywords");
        if (rmAuthor) toDelete.push("Author");
        if (rmDates) toDelete.push("CreationDate", "ModDate");
        if (rmApp)
          toDelete.push(
            "Creator",
            "Producer",
            "Trapped",
            "GTS_PDFXVersion",
            "GTS_PDFXConformance",
          );

        toDelete.forEach((k) => {
          try {
            infoDict.delete(PDFName.of(k));
          } catch {}
        });

        // Remove all custom / non-standard fields
        if (rmCustom) {
          const stdSet = new Set([
            "Title",
            "Author",
            "Subject",
            "Keywords",
            "Creator",
            "Producer",
            "CreationDate",
            "ModDate",
            "Trapped",
            "GTS_PDFXVersion",
            "GTS_PDFXConformance",
          ]);
          try {
            const entries = Array.from(infoDict.entries());
            entries.forEach(([k]) => {
              try {
                const kName = k.decodeText?.() ?? String(k);
                if (!stdSet.has(kName)) infoDict.delete(k);
              } catch {}
            });
          } catch {}
        }
      }
    }

    setProgress(60, "Removing XMP metadata stream…");
    await new Promise((r) => setTimeout(r, 20));

    // ── Step 2: Remove XMP stream and PieceInfo from catalog ──
    if (rmXmp) {
      try {
        pdfDoc.catalog.delete(PDFName.of("Metadata"));
      } catch {}
      try {
        pdfDoc.catalog.delete(PDFName.of("PieceInfo"));
      } catch {}
    }

    if (isOffloaded) {
      setProgress(80, "⚡ Low-RAM: Rebuilding clean PDF…");
    } else {
      setProgress(80, "Rebuilding clean PDF…");
    }
    await new Promise((r) => setTimeout(r, 20));

    // ── Step 3: Save — no metadata update, no extra pages ──
    cleanPdfBytes = await pdfDoc.save({
      addDefaultPage: false,
      updateFieldAppearances: false,
    });

    setProgress(100, "Done!");

    const base = currentFile?.name.replace(/\.pdf$/i, "") || "document";
    const fname = `${base}_clean.pdf`;

    // Trigger download
    const blob = new Blob([cleanPdfBytes], { type: "application/pdf" });
    dl(blob, fname);

    // Update result card
    document.getElementById("resultSub").textContent = `Saved as: ${fname}`;
    resultCard.classList.add("visible");

    // Wire up "Download Again" button
    document.getElementById("dlAgainBtn").onclick = () => {
      if (cleanPdfBytes) {
        const b2 = new Blob([cleanPdfBytes], { type: "application/pdf" });
        dl(b2, fname);
        showToast("Downloaded again: " + fname, "success");
      }
    };

    showToast("Metadata removed and clean PDF downloaded!", "success", 4000);

    if (window.PDFMasterPopup) {
      window.PDFMasterPopup.show({
        fileType: "pdf",
        fileName: fname,
        fileSize: blob.size,
        downloadText: "Download Clean PDF",
        toolName: "PDF Metadata Remover",
        blob: blob,
        onDownload: () => {
          dl(blob, fname);
        },
      });
    }
  } catch (err) {
    console.error(err);
    showToast("Failed to process PDF. Please try again.", "error");
    removeBtn.disabled = false;
  } finally {
    setTimeout(() => {
      progressWrap.classList.remove("visible");
      progressFill.style.width = "0%";
      removeBtn.disabled = false;
    }, 1200);
  }
}

// ── IndexedDB Recovery Mode ──────────────────────────
let dbPromise = null;
let saveTimer = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const DB_NAME = "pdfmaster_metadata_db";
    const DB_VERSION = 1;
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
      if (!db.objectStoreNames.contains("metadata_data")) {
        db.createObjectStore("metadata_data");
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
  if (!currentFile) return false;
  try {
    const db = await openDB();
    const tx = db.transaction(["settings", "metadata_data"], "readwrite");
    const settingsStore = tx.objectStore("settings");
    const dataStore = tx.objectStore("metadata_data");

    const sessionData = {
      timestamp: Date.now(),
      fileName: currentFile.name,
      fileSize: currentFile.size,
      isOffloaded: isOffloaded,
      rmAuthor: document.getElementById("rmAuthor")?.checked ?? true,
      rmDates: document.getElementById("rmDates")?.checked ?? true,
      rmTitle: document.getElementById("rmTitle")?.checked ?? true,
      rmApp: document.getElementById("rmApp")?.checked ?? true,
      rmXmp: document.getElementById("rmXmp")?.checked ?? true,
      rmCustom: document.getElementById("rmCustom")?.checked ?? true,
    };
    settingsStore.put(sessionData, "session");

    const fileData = {
      fileName: currentFile.name,
      fileSize: currentFile.size,
      isOffloaded: isOffloaded,
      file: currentFileObj || currentFile, // Stored natively on disk in IndexedDB without JS ArrayBuffers
      bytes: !isOffloaded && currentPdfBytes ? (currentPdfBytes.buffer || currentPdfBytes) : null,
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
    const tx = db.transaction(["settings", "metadata_data"], "readonly");
    const settingsReq = tx.objectStore("settings").get("session");
    const dataReq = tx.objectStore("metadata_data").get("file");

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

    if (!data || (!data.file && !data.bytes)) {
      updateRecoveryBadge(false);
      if (isManual) {
        showToast("No stored session found in recovery storage.", "error");
      }
      return false;
    }

    const fileName = data.fileName || "document.pdf";
    const fileSize = data.fileSize || (data.bytes ? data.bytes.byteLength : 0);
    const storedBlob = data.file || (data.bytes ? new Blob([data.bytes], { type: "application/pdf" }) : null);

    currentFile = storedBlob instanceof File ? storedBlob : new File([storedBlob], fileName, { type: "application/pdf" });
    currentFileObj = currentFile;
    cleanPdfBytes = null;

    if (currentBlobUrl) {
      try {
        URL.revokeObjectURL(currentBlobUrl);
      } catch (e) {}
      currentBlobUrl = null;
    }

    isOffloaded = fileSize > LOW_RAM_THRESHOLD || !!(session && session.isOffloaded);
    const lowRamBadge = document.getElementById("lowRamBadge");
    if (lowRamBadge) {
      lowRamBadge.style.display = isOffloaded ? "inline-flex" : "none";
    }

    document.getElementById("fileName").textContent = currentFile.name;
    document.getElementById("fileSize").textContent = formatBytes(currentFile.size);
    document.getElementById("statSize").textContent = formatBytes(currentFile.size);

    document.getElementById("toolArea").classList.remove("hidden");
    document.getElementById("resultCard").classList.remove("visible");
    document.getElementById("removeBtn").disabled = false;
    document.getElementById("progressWrap").classList.remove("visible");
    document.getElementById("progressFill").style.width = "0%";

    if (session) {
      if (document.getElementById("rmAuthor"))
        document.getElementById("rmAuthor").checked = session.rmAuthor !== false;
      if (document.getElementById("rmDates"))
        document.getElementById("rmDates").checked = session.rmDates !== false;
      if (document.getElementById("rmTitle"))
        document.getElementById("rmTitle").checked = session.rmTitle !== false;
      if (document.getElementById("rmApp"))
        document.getElementById("rmApp").checked = session.rmApp !== false;
      if (document.getElementById("rmXmp"))
        document.getElementById("rmXmp").checked = session.rmXmp !== false;
      if (document.getElementById("rmCustom"))
        document.getElementById("rmCustom").checked = session.rmCustom !== false;
    }

    if (isOffloaded) {
      currentPdfBytes = null;
      currentBlobUrl = URL.createObjectURL(currentFile);
      await extractAndRender(currentBlobUrl, currentFile, true);
    } else {
      if (data.bytes) {
        currentPdfBytes = new Uint8Array(data.bytes);
      } else {
        const ab = await currentFile.arrayBuffer();
        currentPdfBytes = new Uint8Array(ab);
      }
      await extractAndRender(currentPdfBytes, currentFile, false);
    }

    updateRecoveryBadge(true);

    document
      .getElementById("toolArea")
      .scrollIntoView({ behavior: "smooth", block: "start" });

    if (isManual) {
      showToast(`Restored '${currentFile.name}' and metadata inspection!`, "success", 4000);
    }
    return true;
  } catch (err) {
    console.warn("IndexedDB load failed:", err);
    if (isManual) {
      showToast("Could not access recovery storage.", "error");
    }
    return false;
  }
}

async function clearSessionFromDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(["settings", "metadata_data"], "readwrite");
    tx.objectStore("settings").clear();
    tx.objectStore("metadata_data").clear();
    updateRecoveryBadge(false);
  } catch (err) {
    console.warn("IndexedDB clear failed:", err);
  }
}

async function checkStoredSessionAvailable(notifyOnFound = false) {
  try {
    const db = await openDB();
    const tx = db.transaction(["metadata_data"], "readonly");
    const dataReq = tx.objectStore("metadata_data").get("file");
    const data = await new Promise((res) => {
      dataReq.onsuccess = () => res(dataReq.result);
      dataReq.onerror = () => res(null);
    });

    const hasData = !!(data && (data.file || data.bytes));
    updateRecoveryBadge(hasData);

    if (hasData && notifyOnFound && !currentFile) {
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

// Wire remove option checkboxes to schedule auto-save
["rmAuthor", "rmDates", "rmTitle", "rmApp", "rmXmp", "rmCustom"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("change", scheduleDBSave);
  }
});

// Wire recovery button
const recoveryBtn = document.getElementById("recoveryBtn");
if (recoveryBtn) {
  recoveryBtn.addEventListener("click", () => {
    loadSessionFromDB(true);
  });
}

// Check stored session on startup
checkStoredSessionAvailable(true);
