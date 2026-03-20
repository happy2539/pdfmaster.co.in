/* ═══════════════════════════════════════════════════
   THEME TOGGLE
═══════════════════════════════════════════════════ */
const html = document.documentElement;
const themeBtn = document.getElementById("themeBtn");
function applyTheme(theme) {
  html.setAttribute("data-theme", theme);
  localStorage.setItem("pmTheme", theme);
}
(function () {
  const saved = localStorage.getItem("pmTheme");
  if (saved) {
    applyTheme(saved);
    return;
  }
  applyTheme(
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );
})();
document.getElementById("themeToggle").addEventListener("click", () => {
  applyTheme(html.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

/* ═══════════════════════════════════════════════════
   HAMBURGER MENU
═══════════════════════════════════════════════════ */
const hamburgerBtn = document.getElementById("hamburgerBtn");
const navDropdown = document.getElementById("navDropdown");
const navOverlay = document.getElementById("navOverlay");

function openMenu() {
  hamburgerBtn.classList.add("open");
  navDropdown.classList.add("open");
  navOverlay.classList.add("open");
  hamburgerBtn.setAttribute("aria-expanded", "true");
}
function closeMenu() {
  hamburgerBtn.classList.remove("open");
  navDropdown.classList.remove("open");
  navOverlay.classList.remove("open");
  hamburgerBtn.setAttribute("aria-expanded", "false");
}
hamburgerBtn.addEventListener("click", () =>
  navDropdown.classList.contains("open") ? closeMenu() : openMenu(),
);
navOverlay.addEventListener("click", closeMenu);
navDropdown
  .querySelectorAll("a")
  .forEach((a) => a.addEventListener("click", closeMenu));
document.addEventListener("keydown", (e) => e.key === "Escape" && closeMenu());

/* ═══════════════════════════════════════════════════
   MINI TOGGLES
═══════════════════════════════════════════════════ */
document.querySelectorAll(".mini-toggle").forEach((btn) => {
  btn.addEventListener("click", () => btn.classList.toggle("on"));
});

/* ═══════════════════════════════════════════════════
   TOAST NOTIFICATIONS
═══════════════════════════════════════════════════ */
function showToast(msg, type = "info", duration = 3500) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️"}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toastOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ═══════════════════════════════════════════════════
   FAQ ACCORDION
═══════════════════════════════════════════════════ */
document.querySelectorAll(".faq-item").forEach((item) => {
  item.querySelector(".faq-question").addEventListener("click", () => {
    const isOpen = item.classList.contains("open");
    document
      .querySelectorAll(".faq-item.open")
      .forEach((i) => i.classList.remove("open"));
    if (!isOpen) item.classList.add("open");
  });
});

/* ═══════════════════════════════════════════════════
   BACK TO TOP
═══════════════════════════════════════════════════ */
const b2tBtn = document.getElementById("b2t");
window.addEventListener("scroll", () => {
  b2tBtn.classList.toggle("show", window.scrollY > 400);
});
b2tBtn.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);

/* ═══════════════════════════════════════════════════
   PDF MERGER CLASS
═══════════════════════════════════════════════════ */
class PDFCompiler {
  constructor() {
    this.files = [];
    this.sortable = null;
    this.init();
  }

  init() {
    /* Upload area events */
    const uploadArea = document.getElementById("uploadArea");
    const fileInput = document.getElementById("fileInput");
    const browseBtn = document.getElementById("browseBtn");
    const addMoreBtn = document.getElementById("addMoreBtn");
    const addMoreInput = document.getElementById("addMoreInput");
    const mergeBtn = document.getElementById("mergePdfBtn");
    const clearBtn = document.getElementById("clearAllBtn");
    const sortName = document.getElementById("sortByName");
    const sortSize = document.getElementById("sortBySize");
    const sortPages = document.getElementById("sortByPages");

    uploadArea.addEventListener("click", (e) => {
      if (e.target !== browseBtn) fileInput.click();
    });
    browseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
    fileInput.addEventListener("change", (e) =>
      this.handleFiles(e.target.files),
    );
    addMoreBtn.addEventListener("click", () => addMoreInput.click());
    addMoreInput.addEventListener("change", (e) =>
      this.handleFiles(e.target.files),
    );
    mergeBtn.addEventListener("click", () => this.merge());
    clearBtn.addEventListener("click", () => this.clearAll());
    sortName.addEventListener("click", () => this.sort("name"));
    sortSize.addEventListener("click", () => this.sort("size"));
    sortPages.addEventListener("click", () => this.sort("pages"));

    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.classList.add("dragover");
    });
    uploadArea.addEventListener("dragleave", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
    });
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      this.handleFiles(e.dataTransfer.files);
    });

    /* Sortable */
    this.sortable = Sortable.create(
      document.getElementById("fileListContainer"),
      {
        handle: ".drag-handle",
        animation: 180,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        filter: ".empty-state",
        onEnd: (evt) => {
          const moved = this.files.splice(evt.oldDraggableIndex, 1)[0];
          this.files.splice(evt.newDraggableIndex, 0, moved);
          this.updateStats();
        },
      },
    );
  }

  async handleFiles(fileList) {
    const pdfs = Array.from(fileList).filter((f) => {
      if (
        f.type !== "application/pdf" &&
        !f.name.toLowerCase().endsWith(".pdf")
      ) {
        showToast(`"${f.name}" is not a PDF file.`, "error");
        return false;
      }
      return true;
    });
    if (!pdfs.length) return;

    this.showLoading(true, "Reading PDF files…");

    for (let i = 0; i < pdfs.length; i++) {
      const file = pdfs[i];
      try {
        const buf = await file.arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(buf, {
          ignoreEncryption: false,
        });
        this.files.push({
          id: crypto.randomUUID
            ? crypto.randomUUID()
            : (Date.now() + Math.random()).toString(36),
          name: file.name,
          size: file.size,
          pages: doc.getPageCount(),
          buf: buf,
          fromPage: "",
          toPage: "",
        });
        this.updateProgress(((i + 1) / pdfs.length) * 100);
      } catch (err) {
        showToast(
          `Could not read "${file.name}". It may be encrypted or damaged.`,
          "error",
          5000,
        );
      }
    }

    this.showLoading(false);
    this.render();
    this.updateButtons();
    this.updateStats();
    this.checkDuplicates();
    // Reset inputs so same file can be re-added
    document.getElementById("fileInput").value = "";
    document.getElementById("addMoreInput").value = "";
  }

  checkDuplicates() {
    const names = this.files.map((f) => f.name);
    const dups = names.filter((n, i) => names.indexOf(n) !== i);
    const warn = document.getElementById("dupWarn");
    const txt = document.getElementById("dupWarnText");
    if (dups.length) {
      txt.textContent = `Duplicate file(s) detected: ${[...new Set(dups)].join(", ")}`;
      warn.classList.add("show");
    } else {
      warn.classList.remove("show");
    }
  }

  render() {
    const container = document.getElementById("fileListContainer");
    const empty = document.getElementById("emptyState");
    const title = document.getElementById("fileCountBadge");

    title.textContent = this.files.length
      ? `(${this.files.length} file${this.files.length > 1 ? "s" : ""})`
      : "";

    if (!this.files.length) {
      container.innerHTML = "";
      empty.classList.add("show");
      container.appendChild(empty);
      return;
    }
    empty.classList.remove("show");

    const html = this.files
      .map(
        (f, idx) => `
      <div class="file-item" data-id="${f.id}">
        <div class="drag-handle" title="Drag to reorder">⠿</div>
        <div class="file-thumb">PDF</div>
        <div class="file-main">
          <div class="file-name-row">
            <div class="file-name" title="${f.name}">${this.truncate(f.name, 42)}</div>
          </div>
          <div class="file-meta">${f.pages} page${f.pages !== 1 ? "s" : ""} · ${this.fmtSize(f.size)}</div>
          <div class="page-range-row">
            <label>Pages:</label>
            <input type="number" class="page-from" data-id="${f.id}" min="1" max="${f.pages}" placeholder="1" value="${f.fromPage}" title="From page" />
            <span class="page-range-sep">–</span>
            <input type="number" class="page-to" data-id="${f.id}" min="1" max="${f.pages}" placeholder="${f.pages}" value="${f.toPage}" title="To page" />
            <span class="page-range-sep" style="color:var(--text3);font-size:0.75rem">of ${f.pages}</span>
          </div>
        </div>
        <div class="file-right">
          <div class="file-order-btns">
            <button class="file-order-btn" onclick="compiler.moveUp('${f.id}')" title="Move up" ${idx === 0 ? "disabled" : ""}>▲</button>
            <button class="file-order-btn" onclick="compiler.moveDown('${f.id}')" title="Move down" ${idx === this.files.length - 1 ? "disabled" : ""}>▼</button>
          </div>
          <button class="file-remove-btn" onclick="compiler.removeFile('${f.id}')" title="Remove file">✕</button>
        </div>
      </div>
    `,
      )
      .join("");

    container.innerHTML = html;

    /* Re-attach sortable to new DOM nodes */
    if (this.sortable) {
      Sortable.get(container) && Sortable.get(container).destroy();
    }
    this.sortable = Sortable.create(container, {
      handle: ".drag-handle",
      animation: 180,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onEnd: (evt) => {
        const moved = this.files.splice(evt.oldDraggableIndex, 1)[0];
        this.files.splice(evt.newDraggableIndex, 0, moved);
        this.updateStats();
      },
    });

    /* Page range inputs live-update */
    container.querySelectorAll(".page-from").forEach((inp) => {
      inp.addEventListener("change", () => {
        const f = this.files.find((x) => x.id === inp.dataset.id);
        if (f) f.fromPage = inp.value;
      });
    });
    container.querySelectorAll(".page-to").forEach((inp) => {
      inp.addEventListener("change", () => {
        const f = this.files.find((x) => x.id === inp.dataset.id);
        if (f) f.toPage = inp.value;
      });
    });
  }

  removeFile(id) {
    this.files = this.files.filter((f) => f.id !== id);
    this.render();
    this.updateButtons();
    this.updateStats();
    this.checkDuplicates();
  }
  moveUp(id) {
    const i = this.files.findIndex((f) => f.id === id);
    if (i > 0) {
      [this.files[i - 1], this.files[i]] = [this.files[i], this.files[i - 1]];
      this.render();
      this.updateStats();
    }
  }
  moveDown(id) {
    const i = this.files.findIndex((f) => f.id === id);
    if (i < this.files.length - 1) {
      [this.files[i], this.files[i + 1]] = [this.files[i + 1], this.files[i]];
      this.render();
      this.updateStats();
    }
  }
  clearAll() {
    this.files = [];
    this.render();
    this.updateButtons();
    this.updateStats();
    this.checkDuplicates();
  }
  sort(by) {
    if (by === "name") this.files.sort((a, b) => a.name.localeCompare(b.name));
    if (by === "size") this.files.sort((a, b) => b.size - a.size);
    if (by === "pages") this.files.sort((a, b) => b.pages - a.pages);
    this.render();
    this.updateStats();
  }
  updateButtons() {
    const mergeBtn = document.getElementById("mergePdfBtn");
    const clearBtn = document.getElementById("clearAllBtn");
    clearBtn.disabled = this.files.length === 0;
    mergeBtn.disabled = this.files.length < 2;
    mergeBtn.innerHTML =
      this.files.length < 2
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Need 2+ PDFs to Merge'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Merge &amp; Compile PDF';
  }
  updateStats() {
    const row = document.getElementById("statsRow");
    if (!this.files.length) {
      row.classList.remove("show");
      return;
    }
    row.classList.add("show");
    document.getElementById("statFiles").textContent = this.files.length;
    document.getElementById("statPages").textContent = this.files.reduce(
      (s, f) => s + f.pages,
      0,
    );
    document.getElementById("statSize").textContent = this.fmtSize(
      this.files.reduce((s, f) => s + f.size, 0),
    );
  }

  async merge() {
    if (this.files.length < 2) {
      showToast("Please add at least 2 PDF files to merge.", "error");
      return;
    }
    this.showLoading(true, "Merging PDF files…");

    try {
      const merged = await PDFLib.PDFDocument.create();
      const addBlank = document
        .getElementById("toggleBlankPage")
        .classList.contains("on");
      const metaTitle = document.getElementById("metaTitle").value.trim();
      const metaAuth = document.getElementById("metaAuthor").value.trim();
      const metaSub = document.getElementById("metaSubject").value.trim();

      for (let i = 0; i < this.files.length; i++) {
        const fd = this.files[i];
        this.updateProgress((i / this.files.length) * 90);
        this.setLoadingText(
          `Merging file ${i + 1} of ${this.files.length}: ${this.truncate(fd.name, 30)}…`,
        );

        const srcDoc = await PDFLib.PDFDocument.load(fd.buf);
        const total = srcDoc.getPageCount();
        const from = fd.fromPage ? Math.max(1, parseInt(fd.fromPage)) : 1;
        const to = fd.toPage ? Math.min(total, parseInt(fd.toPage)) : total;
        const indices = [];
        for (let p = from - 1; p < to; p++) indices.push(p);

        const pages = await merged.copyPages(srcDoc, indices);
        pages.forEach((p) => merged.addPage(p));

        /* Blank separator */
        if (addBlank && i < this.files.length - 1) {
          const [w, h] = [pages[0].getWidth(), pages[0].getHeight()];
          merged.addPage([w, h]);
        }
      }

      /* Metadata */
      if (metaTitle) merged.setTitle(metaTitle);
      if (metaAuth) merged.setAuthor(metaAuth);
      if (metaSub) merged.setSubject(metaSub);
      merged.setProducer("PDFMaster – pdfmaster.co.in");
      merged.setCreator("PDFMaster");
      merged.setCreationDate(new Date());

      this.updateProgress(95);
      this.setLoadingText("Finalising output…");

      const useObjectCompression =
        document.getElementById("compressionLevel").value !== "none";
      const pdfBytes = await merged.save({
        useObjectStreams: useObjectCompression,
        addDefaultPage: false,
      });

      this.updateProgress(100);
      this.showLoading(false);

      const name =
        (
          document.getElementById("pdfName").value.trim() || "merged_document"
        ).replace(/\.pdf$/i, "") + ".pdf";
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      showToast(`✨ "${name}" downloaded successfully!`, "success", 5000);
    } catch (err) {
      console.error(err);
      this.showLoading(false);
      showToast(
        "Merge failed. One or more files may be encrypted or corrupted.",
        "error",
        6000,
      );
    }
  }

  showLoading(show, txt = "Processing…") {
    const wrap = document.getElementById("loadingWrap");
    wrap.classList.toggle("show", show);
    if (show) {
      this.setLoadingText(txt);
      this.updateProgress(0);
    }
    document.getElementById("mergePdfBtn").disabled =
      show || this.files.length < 2;
  }
  setLoadingText(txt) {
    document.getElementById("loadingTxt").textContent = txt;
  }
  updateProgress(pct) {
    document.getElementById("progressFill").style.width = pct + "%";
  }

  truncate(str, max) {
    return str.length <= max ? str : str.slice(0, max - 1) + "…";
  }
  fmtSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024,
      sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  }
}

const compiler = new PDFCompiler();
