/* ═══════════════════════════════════════════════════
   THEME TOGGLE
═══════════════════════════════════════════════════ */
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

(function () {
  const saved =
    localStorage.getItem("pdfmaster-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  applyTheme(saved);
})();

btn.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});
/* ═══════════════════════════════════════════════════
   HAMBURGER MENU & OPTIONS TOGGLE
═══════════════════════════════════════════════════ */
const hamburgerBtn = document.getElementById("hamburgerBtn");
const navDropdown = document.getElementById("navDropdown");
const navOverlay = document.getElementById("navOverlay");
if (hamburgerBtn && navDropdown && navOverlay) {
  const openMenu = () => {
    hamburgerBtn.classList.add("open");
    navDropdown.classList.add("open");
    navOverlay.classList.add("active");
    hamburgerBtn.setAttribute("aria-expanded", "true");
  };
  const closeMenu = () => {
    hamburgerBtn.classList.remove("open");
    navDropdown.classList.remove("open");
    navOverlay.classList.remove("active");
    hamburgerBtn.setAttribute("aria-expanded", "false");
  };
  hamburgerBtn.addEventListener("click", () =>
    hamburgerBtn.classList.contains("open") ? closeMenu() : openMenu(),
  );
  navOverlay.addEventListener("click", closeMenu);
  navDropdown
    .querySelectorAll("a")
    .forEach((a) => a.addEventListener("click", closeMenu));
}

const optionsToggleBtn = document.getElementById("optionsToggleBtn");
const optionsSection = document.getElementById("optionsSection");
if (optionsToggleBtn && optionsSection) {
  optionsToggleBtn.addEventListener("click", () => {
    optionsSection.classList.toggle("open");
  });
}

/* ═══════════════════════════════════════════════════
   MINI TOGGLES
═══════════════════════════════════════════════════ */
document.querySelectorAll(".mini-toggle").forEach((btn) => {
  btn.addEventListener("click", () => btn.classList.toggle("on"));
});


/* ═══════════════════════════════════════════════════
   TOAST NOTIFICATIONS
═══════════════════════════════════════════════════ */
function showToast(msg, type = "info", duration = 3500, onClick = null, actionText = null) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}${onClick ? " toast-clickable" : ""}`;
  
  const iconHtml = type === "success" 
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : type === "error"
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  const actionHtml = actionText
    ? `<button type="button" class="toast-btn">${actionText}</button>`
    : "";

  toast.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;flex-shrink:0;">${iconHtml}</span> <span style="flex:1;">${msg}</span> ${actionHtml}`;
  container.appendChild(toast);

  let isRemoved = false;
  const removeToast = () => {
    if (isRemoved) return;
    isRemoved = true;
    toast.style.animation = "toastOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  };

  const timer = setTimeout(removeToast, duration);

  if (typeof onClick === "function") {
    toast.addEventListener("click", (e) => {
      clearTimeout(timer);
      removeToast();
      onClick(e);
    });
  }
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
    this.dbPromise = null;
    this.saveTimer = null;
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
    const recoveryBtn = document.getElementById("recoveryBtn");

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

    if (recoveryBtn) {
      recoveryBtn.addEventListener("click", () => {
        this.loadSessionFromDB(true).then((success) => {
          if (!success) {
            showToast("No stored session found in recovery storage.", "error");
          }
        });
      });
    }

    /* Option inputs change auto-save */
    ["pdfName", "metaTitle", "metaAuthor", "metaSubject", "compressionLevel"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", () => this.scheduleDBSave());
    });

    const toggleBlank = document.getElementById("toggleBlankPage");
    if (toggleBlank) {
      toggleBlank.addEventListener("click", () => this.scheduleDBSave());
    }

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

    /* Event Delegation for File Actions */
    const fileListContainer = document.getElementById("fileListContainer");
    if (fileListContainer) {
      fileListContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".file-order-btn, .file-remove-btn");
        if (!btn || btn.disabled) return;

        const fileItem = btn.closest(".file-item");
        const id = btn.dataset.id || fileItem?.dataset?.id;
        if (!id) return;

        e.preventDefault();
        e.stopPropagation();

        if (btn.classList.contains("file-remove-btn") || btn.dataset.action === "remove") {
          this.removeFile(id);
        } else if (btn.classList.contains("move-up") || btn.dataset.action === "move-up") {
          this.moveUp(id);
        } else if (btn.classList.contains("move-down") || btn.dataset.action === "move-down") {
          this.moveDown(id);
        }
      });
    }

    // Check stored session on startup
    this.checkStoredSessionAvailable(true);
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

    const COMBINED_LOW_RAM_THRESHOLD = 50 * 1024 * 1024; // 50 MB combined threshold
    const currentTotalSize = this.files.reduce((sum, f) => sum + f.size, 0);
    const newBatchSize = pdfs.reduce((sum, f) => sum + f.size, 0);
    const combinedTotalSize = currentTotalSize + newBatchSize;
    const useLowRam = combinedTotalSize > COMBINED_LOW_RAM_THRESHOLD;

    // Show centered loading pop-up modal immediately
    this.showLoadingModal(
      true,
      "Loading PDF Files…",
      `Preparing ${pdfs.length} file${pdfs.length > 1 ? "s" : ""}…`,
      0,
      useLowRam
        ? `⚡ Low-RAM Mode (Combined: ${this.fmtSize(combinedTotalSize)} > 50MB)`
        : `🚀 In-Memory RAM Mode (Combined: ${this.fmtSize(combinedTotalSize)})`,
    );

    // If transitioning existing files to Low-RAM mode because combined total now exceeds 50MB:
    if (useLowRam && currentTotalSize > 0) {
      for (let j = 0; j < this.files.length; j++) {
        const existingFile = this.files[j];
        if (!existingFile.isOffloaded && existingFile.buf) {
          await this.saveSingleFileToDB({
            id: existingFile.id,
            name: existingFile.name,
            size: existingFile.size,
            pages: existingFile.pages,
            isOffloaded: true,
            buf: existingFile.buf,
            fromPage: existingFile.fromPage || "",
            toPage: existingFile.toPage || "",
            order: j,
          });
          existingFile.isOffloaded = true;
          existingFile.buf = null; // Free RAM immediately
        }
      }
    }

    for (let i = 0; i < pdfs.length; i++) {
      const file = pdfs[i];
      const currentPct = Math.round((i / pdfs.length) * 92);
      this.setLoadingProgress(currentPct);
      this.setLoadingText(
        `Reading file ${i + 1} of ${pdfs.length}: ${this.truncate(file.name, 26)} (${this.fmtSize(file.size)})…`,
      );

      // Yield execution to allow UI thread to paint the progress bar and update smooth animations
      await new Promise((resolve) => setTimeout(resolve, 20));

      try {
        let buf = await file.arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(buf, {
          ignoreEncryption: false,
        });
        const pageCount = doc.getPageCount();
        const fileId =
          "pdf_" +
          Date.now().toString(36) +
          "_" +
          Math.random().toString(36).substring(2, 9);

        if (useLowRam) {
          // Combined total > 50MB: save buffer directly to IndexedDB to keep RAM footprint minimal
          await this.saveSingleFileToDB({
            id: fileId,
            name: file.name,
            size: file.size,
            pages: pageCount,
            isOffloaded: true,
            buf: buf,
            fromPage: "",
            toPage: "",
            order: this.files.length,
          });

          // Dereference buffer so V8 GC immediately reclaims memory
          buf = null;

          this.files.push({
            id: fileId,
            name: file.name,
            size: file.size,
            pages: pageCount,
            isOffloaded: true,
            buf: null, // Zero RAM retention
            fromPage: "",
            toPage: "",
          });
        } else {
          // Combined total <= 50MB: hold in RAM for maximum speed
          this.files.push({
            id: fileId,
            name: file.name,
            size: file.size,
            pages: pageCount,
            isOffloaded: false,
            buf: buf, // Retained in RAM
            fromPage: "",
            toPage: "",
          });
        }
      } catch (err) {
        console.error(err);
        showToast(
          `Could not read "${file.name}". It may be encrypted or damaged.`,
          "error",
          5000,
        );
      }
    }

    this.setLoadingProgress(100);
    this.setLoadingText("All files loaded successfully!");
    await new Promise((resolve) => setTimeout(resolve, 300));

    this.showLoadingModal(false);
    this.render();
    this.updateButtons();
    this.updateStats();
    this.checkDuplicates();
    this.scheduleDBSave();
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

  getEmptyStateHtml() {
    return `
      <div class="empty-state show" id="emptyState">
        <div class="es-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <p>No PDF files added yet.<br />Upload two or more PDFs above to combine them.</p>
      </div>
    `;
  }

  render() {
    const container = document.getElementById("fileListContainer");
    if (!container) return;

    const title = document.getElementById("fileCountBadge");
    if (title) {
      title.textContent = this.files.length
        ? `(${this.files.length} file${this.files.length > 1 ? "s" : ""})`
        : "";
    }

    if (!this.files.length) {
      container.innerHTML = this.getEmptyStateHtml();
      if (this.sortable) {
        try {
          this.sortable.destroy();
        } catch (e) {}
        this.sortable = null;
      }
      return;
    }

    const html = this.files
      .map(
        (f, idx) => `
      <div class="file-item" data-id="${f.id}">
        <div class="drag-handle" title="Drag to reorder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
            <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
          </svg>
        </div>
        <div class="file-thumb">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="file-main">
          <div class="file-name-row">
            <div class="file-name" title="${f.name}">${this.truncate(f.name, 42)}</div>
          </div>
          <div class="file-meta">
            ${f.pages} page${f.pages !== 1 ? "s" : ""} · ${this.fmtSize(f.size)}${f.isOffloaded ? ` · <span class="badge-low-ram" style="display:inline-flex;align-items:center;gap:3px;padding:1px 5px;border-radius:4px;font-size:0.7rem;font-weight:600;background:rgba(16,185,129,0.12);color:#059669;border:1px solid rgba(16,185,129,0.25);" title="Low-RAM Mode: Stored in IndexedDB to preserve system RAM">⚡ Low-RAM Mode</span>` : ""}
          </div>
          <div class="page-range-row">
            <label>Pages:</label>
            <input type="number" class="page-from" data-id="${f.id}" min="1" max="${f.pages}" placeholder="1" value="${f.fromPage || ""}" title="From page" />
            <span class="page-range-sep">–</span>
            <input type="number" class="page-to" data-id="${f.id}" min="1" max="${f.pages}" placeholder="${f.pages}" value="${f.toPage || ""}" title="To page" />
            <span class="page-range-sep" style="color:var(--text3);font-size:0.75rem">of ${f.pages}</span>
          </div>
        </div>
        <div class="file-right">
          <div class="file-order-btns">
            <button type="button" class="file-order-btn move-up" data-action="move-up" data-id="${f.id}" title="Move up">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button type="button" class="file-order-btn move-down" data-action="move-down" data-id="${f.id}" title="Move down">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <button type="button" class="file-remove-btn" data-action="remove" data-id="${f.id}" title="Remove file">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    `,
      )
      .join("");

    container.innerHTML = html;

    /* Attach direct onclick handlers to buttons on every render */
    container.querySelectorAll(".file-order-btn.move-up").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        if (id) this.moveUp(id);
      };
    });

    container.querySelectorAll(".file-order-btn.move-down").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        if (id) this.moveDown(id);
      };
    });

    container.querySelectorAll(".file-remove-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        if (id) this.removeFile(id);
      };
    });

    /* Initialize Sortable */
    this.initSortable();

    /* Page range inputs live-update */
    container.querySelectorAll(".page-from").forEach((inp) => {
      inp.addEventListener("input", () => {
        const f = this.files.find((x) => String(x.id) === String(inp.dataset.id));
        if (f) {
          f.fromPage = inp.value;
          this.scheduleDBSave();
        }
      });
    });
    container.querySelectorAll(".page-to").forEach((inp) => {
      inp.addEventListener("input", () => {
        const f = this.files.find((x) => String(x.id) === String(inp.dataset.id));
        if (f) {
          f.toPage = inp.value;
          this.scheduleDBSave();
        }
      });
    });
  }

  initSortable() {
    const container = document.getElementById("fileListContainer");
    if (!container || !window.Sortable) return;
    if (this.sortable) {
      try {
        this.sortable.destroy();
      } catch (e) {}
      this.sortable = null;
    }
    this.sortable = Sortable.create(container, {
      handle: ".drag-handle",
      animation: 180,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      filter: ".empty-state, .file-order-btns, .file-order-btn, .file-remove-btn, input, button",
      preventOnFilter: false,
      onEnd: (evt) => {
        const oldIdx =
          evt.oldDraggableIndex !== undefined
            ? evt.oldDraggableIndex
            : evt.oldIndex;
        const newIdx =
          evt.newDraggableIndex !== undefined
            ? evt.newDraggableIndex
            : evt.newIndex;
        if (
          oldIdx !== undefined &&
          newIdx !== undefined &&
          oldIdx !== newIdx
        ) {
          const moved = this.files.splice(oldIdx, 1)[0];
          this.files.splice(newIdx, 0, moved);
          this.render();
          this.updateButtons();
          this.updateStats();
          this.scheduleDBSave();
        }
      },
    });
  }

  removeFile(id) {
    this.files = this.files.filter((f) => String(f.id) !== String(id));
    this.deleteFileFromDB(id);
    this.render();
    this.updateButtons();
    this.updateStats();
    this.checkDuplicates();
    this.scheduleDBSave();
  }

  moveUp(id) {
    if (this.files.length <= 1) {
      showToast("Add 2 or more PDF files to reorder.", "info", 2500);
      return;
    }
    const i = this.files.findIndex((f) => String(f.id) === String(id));
    if (i > 0) {
      const temp = this.files[i];
      this.files[i] = this.files[i - 1];
      this.files[i - 1] = temp;
    } else if (i === 0) {
      const item = this.files.shift();
      this.files.push(item);
    }
    this.render();
    this.updateButtons();
    this.updateStats();
    this.scheduleDBSave();
  }

  moveDown(id) {
    if (this.files.length <= 1) {
      showToast("Add 2 or more PDF files to reorder.", "info", 2500);
      return;
    }
    const i = this.files.findIndex((f) => String(f.id) === String(id));
    if (i >= 0 && i < this.files.length - 1) {
      const temp = this.files[i];
      this.files[i] = this.files[i + 1];
      this.files[i + 1] = temp;
    } else if (i === this.files.length - 1) {
      const item = this.files.pop();
      this.files.unshift(item);
    }
    this.render();
    this.updateButtons();
    this.updateStats();
    this.scheduleDBSave();
  }
  clearAll() {
    this.files = [];
    this.render();
    this.updateButtons();
    this.updateStats();
    this.checkDuplicates();
    this.clearSessionFromDB();
  }
  sort(by) {
    if (by === "name") this.files.sort((a, b) => a.name.localeCompare(b.name));
    if (by === "size") this.files.sort((a, b) => b.size - a.size);
    if (by === "pages") this.files.sort((a, b) => b.pages - a.pages);
    this.render();
    this.updateButtons();
    this.updateStats();
    this.scheduleDBSave();
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

  /* ═══════════════════════════════════════════════════
     INDEXEDDB SINGLE FILE & BUFFER HELPERS
  ═══════════════════════════════════════════════════ */
  async saveSingleFileToDB(record) {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readwrite");
        const store = tx.objectStore("files");
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("Failed to save single file to IndexedDB:", err);
    }
  }

  async deleteFileFromDB(id) {
    try {
      const db = await this.openDB();
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").delete(id);
    } catch (err) {
      console.warn("IndexedDB delete failed:", err);
    }
  }

  async getFileBuffer(fd) {
    // If small file loaded in RAM (< 50MB), return buffer directly
    if (!fd.isOffloaded && fd.buf) {
      return fd.buf;
    }

    // Offloaded file (>= 50MB): stream buffer on demand from IndexedDB
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readonly");
      const req = tx.objectStore("files").get(fd.id);
      req.onsuccess = () => {
        if (req.result && req.result.buf) {
          resolve(req.result.buf);
        } else {
          reject(
            new Error(
              `Buffer for file "${fd.name}" could not be retrieved from IndexedDB.`,
            ),
          );
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async merge() {
    if (this.files.length < 2) {
      showToast("Please add at least 2 PDF files to merge.", "error");
      return;
    }

    const totalCombinedSize = this.files.reduce((s, f) => s + f.size, 0);
    const useLowRam =
      totalCombinedSize > 50 * 1024 * 1024 ||
      this.files.some((f) => f.isOffloaded);

    this.showLoadingModal(
      true,
      "Merging & Compiling PDFs…",
      "Initializing merge engine…",
      0,
      useLowRam
        ? `⚡ Low-RAM Streaming Mode (Total: ${this.fmtSize(totalCombinedSize)})`
        : `🚀 In-Memory Mode (Total: ${this.fmtSize(totalCombinedSize)})`,
    );

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
        this.setLoadingProgress(Math.round((i / this.files.length) * 88));
        this.setLoadingText(
          `Merging file ${i + 1} of ${this.files.length}: ${this.truncate(fd.name, 28)}${fd.isOffloaded ? " [Streaming from IndexedDB]" : ""}…`,
        );

        // Yield to allow UI thread to paint the progress bar smoothly
        await new Promise((r) => setTimeout(r, 20));

        // Fetch buffer on demand (RAM if <50MB, IndexedDB if >=50MB)
        let fileBuffer = await this.getFileBuffer(fd);
        let srcDoc = await PDFLib.PDFDocument.load(fileBuffer);
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

        // If file was offloaded, dereference immediately so GC reclaims memory before next file
        if (fd.isOffloaded) {
          fileBuffer = null;
          srcDoc = null;
        }
      }

      /* Metadata */
      if (metaTitle) merged.setTitle(metaTitle);
      if (metaAuth) merged.setAuthor(metaAuth);
      if (metaSub) merged.setSubject(metaSub);
      merged.setProducer("PDFMaster – pdfmaster.co.in");
      merged.setCreator("PDFMaster");
      merged.setCreationDate(new Date());

      this.setLoadingProgress(92);
      this.setLoadingText("Finalising output & compression…");
      await new Promise((r) => setTimeout(r, 20));

      const useObjectCompression =
        document.getElementById("compressionLevel").value !== "none";
      const pdfBytes = await merged.save({
        useObjectStreams: useObjectCompression,
        addDefaultPage: false,
      });

      this.setLoadingProgress(100);
      this.setLoadingText("Merge complete! Preparing download…");
      await new Promise((r) => setTimeout(r, 300));
      this.showLoadingModal(false);

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

      showToast(`"${name}" downloaded successfully!`, "success", 5000);
    } catch (err) {
      console.error(err);
      this.showLoadingModal(false);
      showToast(
        "Merge failed. One or more files may be encrypted or corrupted.",
        "error",
        6000,
      );
    }
  }

  showLoadingModal(show, title = "Processing…", msg = "Please wait…", pct = 0, meta = null) {
    const modal = document.getElementById("loadingModal");
    const wrap = document.getElementById("loadingWrap");
    const titleEl = document.getElementById("modalLoadingTitle");
    const metaEl = document.getElementById("loadingMeta");

    if (modal) {
      modal.classList.toggle("show", show);
      if (titleEl) titleEl.textContent = title;
      if (metaEl) {
        if (meta) {
          metaEl.textContent = meta;
          metaEl.style.display = "inline-flex";
        } else {
          metaEl.style.display = "none";
        }
      }
    }
    if (wrap) {
      wrap.classList.toggle("show", show);
    }
    if (show) {
      this.setLoadingText(msg);
      this.setLoadingProgress(pct);
    }
    const mergeBtn = document.getElementById("mergePdfBtn");
    if (mergeBtn) {
      mergeBtn.disabled = show || this.files.length < 2;
    }
  }

  showLoading(show, txt = "Processing…") {
    this.showLoadingModal(show, "Processing PDFs…", txt, 0);
  }

  setLoadingText(txt) {
    const el = document.getElementById("loadingTxt");
    if (el) el.textContent = txt;
  }

  setLoadingProgress(pct) {
    const cleanPct = Math.min(100, Math.max(0, Math.round(pct)));
    const fill = document.getElementById("progressFill");
    const pctEl = document.getElementById("loadingPct");
    if (fill) fill.style.width = cleanPct + "%";
    if (pctEl) pctEl.textContent = cleanPct + "%";
  }

  updateProgress(pct) {
    this.setLoadingProgress(pct);
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

  /* ═══════════════════════════════════════════════════
     INDEXEDDB RECOVERY MODE LOGIC
  ═══════════════════════════════════════════════════ */
  openDB() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const DB_NAME = "pdfmaster_merge_db";
      const DB_VERSION = 1;
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files", { keyPath: "id" });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return this.dbPromise;
  }

  scheduleDBSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveSessionToDB(), 400);
  }

  async saveSessionToDB() {
    try {
      const db = await this.openDB();
      const tx = db.transaction(["settings", "files"], "readwrite");
      const settingsStore = tx.objectStore("settings");
      const filesStore = tx.objectStore("files");

      const sessionData = {
        timestamp: Date.now(),
        pdfName: document.getElementById("pdfName")?.value || "",
        addBlank:
          document
            .getElementById("toggleBlankPage")
            ?.classList.contains("on") || false,
        compressionLevel:
          document.getElementById("compressionLevel")?.value || "medium",
        metaTitle: document.getElementById("metaTitle")?.value || "",
        metaAuthor: document.getElementById("metaAuthor")?.value || "",
        metaSubject: document.getElementById("metaSubject")?.value || "",
      };
      settingsStore.put(sessionData, "session");

      // Synchronize files store without destroying offloaded buffers:
      const currentIds = new Set(this.files.map((f) => f.id));
      const allKeysReq = filesStore.getAllKeys();
      allKeysReq.onsuccess = () => {
        const storedKeys = allKeysReq.result || [];
        storedKeys.forEach((key) => {
          if (!currentIds.has(key)) {
            filesStore.delete(key);
          }
        });
      };

      for (let idx = 0; idx < this.files.length; idx++) {
        const f = this.files[idx];
        if (!f.isOffloaded && f.buf) {
          // Small file in RAM (< 50MB): save to IndexedDB as backup
          filesStore.put({
            id: f.id,
            name: f.name,
            size: f.size,
            pages: f.pages,
            isOffloaded: false,
            buf: f.buf,
            fromPage: f.fromPage || "",
            toPage: f.toPage || "",
            order: idx,
          });
        } else {
          // Offloaded file (>= 50MB): update metadata while preserving existing buffer in IndexedDB
          const getReq = filesStore.get(f.id);
          getReq.onsuccess = () => {
            const existing = getReq.result;
            if (existing) {
              existing.name = f.name;
              existing.pages = f.pages;
              existing.size = f.size;
              existing.fromPage = f.fromPage || "";
              existing.toPage = f.toPage || "";
              existing.order = idx;
              existing.isOffloaded = true;
              filesStore.put(existing);
            }
          };
        }
      }

      this.updateRecoveryBadge(this.files.length > 0);
    } catch (err) {
      console.warn("IndexedDB save failed:", err);
    }
  }

  async loadSessionFromDB(isManual = false) {
    try {
      const db = await this.openDB();
      const tx = db.transaction(["settings", "files"], "readonly");
      const sessionReq = tx.objectStore("settings").get("session");
      const filesReq = tx.objectStore("files").getAll();

      const [session, storedFiles] = await Promise.all([
        new Promise((res) => {
          sessionReq.onsuccess = () => res(sessionReq.result);
          sessionReq.onerror = () => res(null);
        }),
        new Promise((res) => {
          filesReq.onsuccess = () => res(filesReq.result);
          filesReq.onerror = () => res([]);
        }),
      ]);

      if (!storedFiles || !storedFiles.length) {
        this.updateRecoveryBadge(false);
        if (isManual) {
          showToast("No stored session found in recovery storage.", "error");
        }
        return false;
      }

      if (session) {
        if (
          document.getElementById("pdfName") &&
          session.pdfName !== undefined
        ) {
          document.getElementById("pdfName").value = session.pdfName;
        }
        if (document.getElementById("toggleBlankPage")) {
          document
            .getElementById("toggleBlankPage")
            .classList.toggle("on", !!session.addBlank);
        }
        if (
          document.getElementById("compressionLevel") &&
          session.compressionLevel
        ) {
          document.getElementById("compressionLevel").value =
            session.compressionLevel;
        }
        if (
          document.getElementById("metaTitle") &&
          session.metaTitle !== undefined
        ) {
          document.getElementById("metaTitle").value = session.metaTitle;
        }
        if (
          document.getElementById("metaAuthor") &&
          session.metaAuthor !== undefined
        ) {
          document.getElementById("metaAuthor").value = session.metaAuthor;
        }
        if (
          document.getElementById("metaSubject") &&
          session.metaSubject !== undefined
        ) {
          document.getElementById("metaSubject").value = session.metaSubject;
        }
      }

      storedFiles.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const COMBINED_LOW_RAM_THRESHOLD = 50 * 1024 * 1024;
      const totalStoredSize = storedFiles.reduce((s, f) => s + (f.size || 0), 0);
      const isSessionLowRam = totalStoredSize > COMBINED_LOW_RAM_THRESHOLD;

      this.files = storedFiles.map((sf, idx) => {
        const isOffloaded =
          isSessionLowRam || sf.isOffloaded || sf.size >= COMBINED_LOW_RAM_THRESHOLD;
        return {
          id: String(
            sf.id ||
              "pdf_" +
                Date.now().toString(36) +
                "_" +
                idx +
                "_" +
                Math.random().toString(36).substring(2, 7),
          ),
          name: sf.name,
          size: sf.size,
          pages: sf.pages,
          isOffloaded: isOffloaded,
          buf: isOffloaded ? null : sf.buf, // Loaded in RAM if combined <= 50MB; otherwise streamed from IndexedDB
          fromPage: sf.fromPage || "",
          toPage: sf.toPage || "",
        };
      });

      this.render();
      this.updateButtons();
      this.updateStats();
      this.checkDuplicates();
      this.updateRecoveryBadge(true);

      if (isManual) {
        showToast(
          `Recovered ${this.files.length} PDF file(s) and settings successfully!`,
          "success",
          4500,
        );
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

  async clearSessionFromDB() {
    try {
      const db = await this.openDB();
      const tx = db.transaction(["settings", "files"], "readwrite");
      tx.objectStore("settings").clear();
      tx.objectStore("files").clear();
      this.updateRecoveryBadge(false);
    } catch (err) {
      console.warn("IndexedDB clear failed:", err);
    }
  }

  async checkStoredSessionAvailable(notifyOnFound = false) {
    try {
      const db = await this.openDB();
      const tx = db.transaction(["files"], "readonly");
      const filesReq = tx.objectStore("files").getAll();
      const files = await new Promise((res) => {
        filesReq.onsuccess = () => res(filesReq.result);
        filesReq.onerror = () => res([]);
      });

      const hasFiles = files && files.length > 0;
      this.updateRecoveryBadge(hasFiles);

      if (hasFiles && notifyOnFound && this.files.length === 0) {
        showToast(
          `Last session (${files.length} file${files.length > 1 ? "s" : ""}) is available. Click to restore.`,
          "info",
          8000,
          () => {
            this.loadSessionFromDB(true);
          },
          "Restore",
        );
      }
      return hasFiles;
    } catch (err) {
      this.updateRecoveryBadge(false);
      return false;
    }
  }

  updateRecoveryBadge(hasData) {
    const badge = document.getElementById("recoveryBadge");
    if (badge) {
      badge.style.display = hasData ? "block" : "none";
    }
  }
}

const compiler = new PDFCompiler();
