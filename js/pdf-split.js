(function () {
  "use strict";

  /* ─────────── THEME ─────────── */
  const root = document.documentElement;
  const themeKey = "pdfmaster-theme";
  const themeBtn = document.getElementById("themeToggle");
  const sunIcon = document.getElementById("sunIcon");
  const moonIcon = document.getElementById("moonIcon");

  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    localStorage.setItem(themeKey, t);
    if (sunIcon && moonIcon) {
      sunIcon.style.display = t === "dark" ? "none" : "block";
      moonIcon.style.display = t === "dark" ? "block" : "none";
    }
  }

  const savedTheme = localStorage.getItem(themeKey);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (systemDark ? "dark" : "light"));

  themeBtn.addEventListener("click", () => {
    applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  /* ─────────── DRAWER ─────────── */
  const menuBtn = document.getElementById("menuBtn");
  const drawer = document.getElementById("drawer");
  const drawerOverlay = document.getElementById("drawerOverlay");
  const drawerClose = document.getElementById("drawerClose");

  function openDrawer() {
    drawer.classList.add("open");
    drawerOverlay.classList.add("open");
    menuBtn.setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    drawerOverlay.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  }
  menuBtn.addEventListener("click", () => {
    if (drawer.classList.contains("open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });
  drawerClose.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);
  drawer
    .querySelectorAll("a")
    .forEach((a) => a.addEventListener("click", closeDrawer));

  /* ─────────── BACK TO TOP ─────────── */
  const backTop = document.getElementById("backTop");
  window.addEventListener(
    "scroll",
    () => {
      backTop.classList.toggle("visible", window.scrollY > 400);
    },
    { passive: true },
  );
  backTop.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );

  /* ─────────── SCROLL REVEAL ─────────── */
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("revealed");
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
  );
  document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));

  /* ─────────── FAQ ─────────── */
  document.querySelectorAll(".faq-q").forEach((q) => {
    q.addEventListener("click", () => {
      const item = q.parentElement;
      const isOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach((i) => {
        i.classList.remove("open");
        i.querySelector(".faq-q").setAttribute("aria-expanded", "false");
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

  /* ─────────── TOAST ─────────── */
  const toastEl = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  const toastIcon = document.getElementById("toastIcon");
  let toastTimer;
  function showToast(msg, type = "success") {
    clearTimeout(toastTimer);
    toastMsg.textContent = msg;
    toastIcon.innerHTML = type === "success"
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    toastEl.className = `toast ${type}`;
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3500);
  }

  /* ─────────── PDF.js setup ─────────── */
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  /* ─────────── STATE ─────────── */
  let pdfFile = null;
  let pdfArrayBuffer = null;
  let pdfDoc = null; // pdf-lib doc
  let pdfjsDoc = null; // pdf.js doc
  let totalPages = 0;
  let selectedPages = new Set();
  let currentMode = "range";
  let outputFormat = "zip";
  let splitResults = [];

  /* ─────────── ELEMENTS ─────────── */
  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const workspace = document.getElementById("workspace");
  const fileName = document.getElementById("fileName");
  const fileSize = document.getElementById("fileSize");
  const pageCount = document.getElementById("pageCount");
  const changeFileBtn = document.getElementById("changeFileBtn");
  const modeTabs = document.querySelectorAll(".mode-tab");
  const configModes = document.querySelectorAll(".config-panel__mode");
  const rangeInput = document.getElementById("rangeInput");
  const nInput = document.getElementById("nInput");
  const stepDown = document.getElementById("stepDown");
  const stepUp = document.getElementById("stepUp");
  const pagesGrid = document.getElementById("pagesGrid");
  const selectedCount = document.getElementById("selectedCount");
  const splitBtn = document.getElementById("splitBtn");
  const splitSummary = document.getElementById("splitSummary");
  const progressWrap = document.getElementById("progressWrap");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const resultsSection = document.getElementById("resultsSection");
  const resultCount = document.getElementById("resultCount");
  const resultsGrid = document.getElementById("resultsGrid");
  const downloadAllBtn = document.getElementById("downloadAllBtn");
  const splitAgainBtn = document.getElementById("splitAgainBtn");
  const toggleOpts = document.querySelectorAll(".toggle-opt");

  /* ─────────── UPLOAD ─────────── */
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
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = "";
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
    if (f && f.type === "application/pdf") loadFile(f);
    else showToast("Please drop a valid PDF file.", "error");
  });

  changeFileBtn.addEventListener("click", () => {
    fileInput.click();
  });

  async function loadFile(file) {
    pdfFile = file;
    try {
      pdfArrayBuffer = await file.arrayBuffer();
      pdfDoc = await PDFLib.PDFDocument.load(pdfArrayBuffer);
      totalPages = pdfDoc.getPageCount();

      if (window.pdfjsLib) {
        pdfjsDoc = await pdfjsLib.getDocument({
          data: pdfArrayBuffer.slice(0),
        }).promise;
      }

      fileName.textContent = file.name;
      const kb = (file.size / 1024).toFixed(0);
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      pageCount.textContent = totalPages;
      fileSize.textContent = `${file.size > 1024 * 1024 ? mb + " MB" : kb + " KB"} · ${totalPages} pages`;

      selectedPages.clear();
      resultsSection.classList.remove("active");
      splitResults = [];
      progressWrap.classList.remove("active");

      uploadZone.style.display = "none";
      workspace.classList.add("active");

      if (currentMode === "select") renderThumbnails();
      updateSummary();
      showToast(`Loaded "${file.name}" — ${totalPages} pages`);
    } catch (err) {
      showToast(
        "Could not read PDF. Make sure it's a valid, non-encrypted file.",
        "error",
      );
      console.error(err);
    }
  }

  /* ─────────── MODE TABS ─────────── */
  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      currentMode = tab.dataset.mode;
      modeTabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      configModes.forEach((m) => m.classList.remove("active"));
      document.getElementById(`mode-${currentMode}`).classList.add("active");
      if (currentMode === "select" && pdfjsDoc) renderThumbnails();
      updateSummary();
    });
  });

  /* ─────────── STEPPER ─────────── */
  stepDown.addEventListener("click", () => {
    const v = parseInt(nInput.value) || 1;
    if (v > 1) nInput.value = v - 1;
    updateSummary();
  });
  stepUp.addEventListener("click", () => {
    nInput.value = (parseInt(nInput.value) || 1) + 1;
    updateSummary();
  });
  nInput.addEventListener("input", updateSummary);
  rangeInput.addEventListener("input", updateSummary);

  /* ─────────── OUTPUT FORMAT ─────────── */
  toggleOpts.forEach((opt) => {
    opt.addEventListener("click", () => {
      toggleOpts.forEach((o) => o.classList.remove("active"));
      opt.classList.add("active");
      outputFormat = opt.dataset.out;
    });
  });

  /* ─────────── THUMBNAILS ─────────── */
  async function renderThumbnails() {
    if (!pdfjsDoc) return;
    pagesGrid.innerHTML = "";
    for (let i = 1; i <= totalPages; i++) {
      const card = document.createElement("div");
      card.className = "page-card" + (selectedPages.has(i) ? " selected" : "");
      card.setAttribute("role", "listitem");
      card.setAttribute("aria-label", `Page ${i}`);
      card.dataset.page = i;
      card.innerHTML = `
        <div class="page-loading"><div class="spinner"></div><span>p.${i}</span></div>
        <div class="page-card__check" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="page-card__num">p.${i}</div>`;
      card.addEventListener("click", () => togglePage(i, card));
      pagesGrid.appendChild(card);

      // async thumbnail render
      (async (pageNum, cardEl) => {
        try {
          const page = await pdfjsDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "page-card__canvas";
          const ctx = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport }).promise;
          const loader = cardEl.querySelector(".page-loading");
          if (loader) loader.replaceWith(canvas);
        } catch (e) {
          /* ignore render errors */
        }
      })(i, card);
    }
    updateSelectedCount();
  }

  function togglePage(num, card) {
    if (selectedPages.has(num)) {
      selectedPages.delete(num);
      card.classList.remove("selected");
    } else {
      selectedPages.add(num);
      card.classList.add("selected");
    }
    updateSelectedCount();
    updateSummary();
  }

  function updateSelectedCount() {
    selectedCount.textContent = selectedPages.size;
  }

  document.getElementById("selectAllBtn").addEventListener("click", () => {
    for (let i = 1; i <= totalPages; i++) selectedPages.add(i);
    pagesGrid
      .querySelectorAll(".page-card")
      .forEach((c) => c.classList.add("selected"));
    updateSelectedCount();
    updateSummary();
  });
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    selectedPages.clear();
    pagesGrid
      .querySelectorAll(".page-card")
      .forEach((c) => c.classList.remove("selected"));
    updateSelectedCount();
    updateSummary();
  });
  document.getElementById("invertBtn").addEventListener("click", () => {
    for (let i = 1; i <= totalPages; i++) {
      const card = pagesGrid.querySelector(`[data-page="${i}"]`);
      if (selectedPages.has(i)) {
        selectedPages.delete(i);
        card?.classList.remove("selected");
      } else {
        selectedPages.add(i);
        card?.classList.add("selected");
      }
    }
    updateSelectedCount();
    updateSummary();
  });
  document.getElementById("selectOddBtn").addEventListener("click", () => {
    selectedPages.clear();
    pagesGrid.querySelectorAll(".page-card").forEach((c) => {
      const n = parseInt(c.dataset.page);
      if (n % 2 !== 0) {
        selectedPages.add(n);
        c.classList.add("selected");
      } else c.classList.remove("selected");
    });
    updateSelectedCount();
    updateSummary();
  });
  document.getElementById("selectEvenBtn").addEventListener("click", () => {
    selectedPages.clear();
    pagesGrid.querySelectorAll(".page-card").forEach((c) => {
      const n = parseInt(c.dataset.page);
      if (n % 2 === 0) {
        selectedPages.add(n);
        c.classList.add("selected");
      } else c.classList.remove("selected");
    });
    updateSelectedCount();
    updateSummary();
  });

  /* ─────────── PARSE RANGES ─────────── */
  function parseRangeString(str, max) {
    const groups = [];
    const parts = str
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (part.includes("-")) {
        const [a, b] = part.split("-").map((n) => parseInt(n.trim()));
        if (!isNaN(a) && !isNaN(b) && a >= 1 && b <= max && a <= b) {
          groups.push({
            label: `pages-${a}-to-${b}`,
            pages: range(a, b),
          });
        } else return null;
      } else {
        const n = parseInt(part);
        if (!isNaN(n) && n >= 1 && n <= max) {
          groups.push({ label: `page-${n}`, pages: [n] });
        } else return null;
      }
    }
    return groups.length > 0 ? groups : null;
  }

  function range(a, b) {
    const r = [];
    for (let i = a; i <= b; i++) r.push(i);
    return r;
  }

  /* ─────────── SUMMARY ─────────── */
  function updateSummary() {
    if (!pdfDoc) return;
    let text = "";
    if (currentMode === "range") {
      const r = parseRangeString(rangeInput.value, totalPages);
      text = r
        ? `Will create <strong>${r.length}</strong> PDF file(s)`
        : "Enter a valid range above";
    } else if (currentMode === "select") {
      text =
        selectedPages.size > 0
          ? `<strong>${selectedPages.size}</strong> pages selected → 1 PDF file`
          : "Select at least 1 page";
    } else if (currentMode === "every") {
      const n = Math.max(1, parseInt(nInput.value) || 1);
      const chunks = Math.ceil(totalPages / n);
      text = `Will create <strong>${chunks}</strong> PDF file(s) of ${n} page(s) each`;
    } else if (currentMode === "all") {
      text = `Will create <strong>${totalPages}</strong> individual PDF files`;
    }
    splitSummary.innerHTML = text;
  }

  /* ─────────── SPLIT ─────────── */
  splitBtn.addEventListener("click", doSplit);

  async function doSplit() {
    if (!pdfDoc) return;

    let groups = [];

    if (currentMode === "range") {
      const parsed = parseRangeString(rangeInput.value, totalPages);
      if (!parsed) {
        showToast("Invalid range. Use format: 1-3, 5, 7-9", "error");
        return;
      }
      groups = parsed;
    } else if (currentMode === "select") {
      if (selectedPages.size === 0) {
        showToast("Please select at least one page.", "error");
        return;
      }
      const sorted = [...selectedPages].sort((a, b) => a - b);
      groups = [{ label: `selected-pages`, pages: sorted }];
    } else if (currentMode === "every") {
      const n = Math.max(1, parseInt(nInput.value) || 1);
      for (let i = 1; i <= totalPages; i += n) {
        const end = Math.min(i + n - 1, totalPages);
        groups.push({
          label: `pages-${i}-to-${end}`,
          pages: range(i, end),
        });
      }
    } else if (currentMode === "all") {
      for (let i = 1; i <= totalPages; i++) {
        groups.push({ label: `page-${i}`, pages: [i] });
      }
    }

    if (groups.length === 0) {
      showToast("Nothing to split.", "error");
      return;
    }

    splitBtn.disabled = true;
    progressWrap.classList.add("active");
    resultsSection.classList.remove("active");
    splitResults = [];
    progressFill.style.width = "0%";
    progressText.textContent = "Starting...";

    try {
      const baseName = pdfFile.name.replace(/\.pdf$/i, "");

      for (let gi = 0; gi < groups.length; gi++) {
        const { label, pages } = groups[gi];
        progressText.textContent = `Creating file ${gi + 1} of ${groups.length}...`;
        progressFill.style.width = `${((gi + 1) / groups.length) * 90}%`;

        const newDoc = await PDFLib.PDFDocument.create();
        const indices = pages.map((p) => p - 1);
        const copied = await newDoc.copyPages(pdfDoc, indices);
        copied.forEach((pg) => newDoc.addPage(pg));
        const bytes = await newDoc.save();
        const outName = `${baseName}_${label}.pdf`;
        splitResults.push({ name: outName, bytes, size: bytes.length });

        await new Promise((r) => setTimeout(r, 0)); // yield
      }

      progressFill.style.width = "100%";
      progressText.textContent = `Done! Created ${groups.length} file(s).`;

      await new Promise((r) => setTimeout(r, 400));
      progressWrap.classList.remove("active");

      renderResults();
      showToast(`Split complete — ${groups.length} file(s) ready!`);

      // Auto ZIP download if only one file or user prefers individual
      if (outputFormat === "zip" && splitResults.length > 1) {
        // show results, user clicks Download All
      } else if (splitResults.length === 1) {
        triggerDownload(splitResults[0].bytes, splitResults[0].name);
      }
    } catch (err) {
      showToast("Split failed. Please try again.", "error");
      console.error(err);
    } finally {
      splitBtn.disabled = false;
    }
  }

  function renderResults() {
    resultsSection.classList.add("active");
    resultCount.textContent = splitResults.length;
    resultsGrid.innerHTML = "";
    splitResults.forEach((r, idx) => {
      const card = document.createElement("div");
      card.className = "result-card";
      const kb = (r.size / 1024).toFixed(0);
      card.innerHTML = `
        <div class="result-card__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="result-card__meta">
          <div class="result-card__name" title="${r.name}">${r.name}</div>
          <div class="result-card__size">${kb} KB</div>
        </div>
        <button class="result-card__dl" aria-label="Download ${r.name}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>`;
      card.querySelector(".result-card__dl").addEventListener("click", () => {
        triggerDownload(splitResults[idx].bytes, splitResults[idx].name);
      });
      resultsGrid.appendChild(card);
    });

    downloadAllBtn.style.display = splitResults.length > 1 ? "flex" : "none";
    resultsSection.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  downloadAllBtn.addEventListener("click", async () => {
    if (splitResults.length === 0) return;
    if (window.JSZip) {
      downloadAllBtn.textContent = "Creating ZIP...";
      downloadAllBtn.disabled = true;
      try {
        const zip = new JSZip();
        splitResults.forEach((r) => zip.file(r.name, r.bytes));
        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 3 },
        });
        const baseName = pdfFile.name.replace(/\.pdf$/i, "");
        triggerDownloadBlob(zipBlob, `${baseName}_split.zip`);
        showToast("ZIP download started!");
      } catch (e) {
        showToast("ZIP creation failed.", "error");
      } finally {
        downloadAllBtn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download All (ZIP)';
        downloadAllBtn.disabled = false;
      }
    } else {
      splitResults.forEach((r, i) =>
        setTimeout(() => triggerDownload(r.bytes, r.name), i * 300),
      );
    }
  });

  splitAgainBtn.addEventListener("click", () => {
    resultsSection.classList.remove("active");
    splitResults = [];
    rangeInput.value = "";
    selectedPages.clear();
    pagesGrid
      .querySelectorAll(".page-card")
      .forEach((c) => c.classList.remove("selected"));
    updateSelectedCount();
    updateSummary();
    showToast("Ready for another split!");
    workspace.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function triggerDownload(bytes, name) {
    const blob = new Blob([bytes], { type: "application/pdf" });
    triggerDownloadBlob(blob, name);
  }
  function triggerDownloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
})();
