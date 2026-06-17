/* ════════════════════════ SCRIPTS ════════════════════════ */

/* ── Load jsPDF ── */
const jsPdfScript = document.createElement("script");
jsPdfScript.src = "assets/vendor/jspdf.umd.min.js";
document.head.appendChild(jsPdfScript);
let jsPdfReady = false;
jsPdfScript.onload = () => {
  jsPdfReady = true;
};

/* ── Theme — same localStorage key as homepage (pdfmaster-theme) ── */
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

/* ── Side Menu ── */
const hamburgerBtn = document.getElementById("hamburgerBtn");
const sideMenu = document.getElementById("sideMenu");
const sideOverlay = document.getElementById("sideOverlay");
const closeMenuBtn = document.getElementById("closeMenuBtn");
const openSideMenu = () => {
  sideMenu.classList.add("open");
  sideOverlay.classList.add("open");
};
const closeSideMenu = () => {
  sideMenu.classList.remove("open");
  sideOverlay.classList.remove("open");
};
hamburgerBtn.addEventListener("click", openSideMenu);
closeMenuBtn.addEventListener("click", closeSideMenu);
sideOverlay.addEventListener("click", closeSideMenu);
document
  .querySelectorAll(".side-nav a")
  .forEach((a) => a.addEventListener("click", closeSideMenu));

/* ── FAQ Accordion ── */
document.querySelectorAll(".faq-q").forEach((q) => {
  q.addEventListener("click", () => {
    const item = q.parentElement;
    const wasOpen = item.classList.contains("open");
    document
      .querySelectorAll(".faq-item.open")
      .forEach((i) => i.classList.remove("open"));
    if (!wasOpen) item.classList.add("open");
  });
});

/* ── Page Size Pills ── */
let selectedSize = "a4";
document.querySelectorAll(".spill").forEach((p) => {
  p.addEventListener("click", () => {
    document
      .querySelectorAll(".spill")
      .forEach((x) => x.classList.remove("active"));
    p.classList.add("active");
    selectedSize = p.dataset.size;
  });
});

/* ── Orientation ── */
let selectedOrient = "portrait";
document.querySelectorAll('input[name="orient"]').forEach((r) => {
  r.addEventListener("change", () => {
    selectedOrient = r.value;
  });
});

/* ── App State ── */
let imageFiles = [],
  imageOrder = [],
  generatedPdfUrl = null;
const isInApp =
  /wv|WebView/.test(navigator.userAgent) ||
  window.navigator.standalone ||
  window.matchMedia("(display-mode: standalone)").matches;

/* ── DOM Refs ── */
const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const convertBtn = document.getElementById("convertBtn");
const resetBtn = document.getElementById("resetBtn");
const loadingWrap = document.getElementById("loadingWrap");
const loadingTitle = document.getElementById("loadingTitle");
const progressFill = document.getElementById("progressFill");
const statusText = document.getElementById("statusText");
const previewSec = document.getElementById("previewSec");
const previewGrid = document.getElementById("previewGrid");
const pdfNameInput = document.getElementById("pdfName");
const downloadModal = document.getElementById("downloadModal");

/* ── Upload Events ── */
uploadZone.addEventListener("click", () => fileInput.click());
uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("dragover");
});
uploadZone.addEventListener("dragleave", () =>
  uploadZone.classList.remove("dragover"),
);
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFiles(fileInput.files);
});

function handleFiles(list) {
  const valid = Array.from(list).filter((f) => f.type.startsWith("image/"));
  if (!valid.length) {
    alert("Please select valid image files.");
    return;
  }
  valid.forEach((file) => {
    const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    imageFiles.push({ id, file });
    imageOrder.push(id);
  });
  refreshZone();
  renderPreviews();
  convertBtn.disabled = false;
  resetBtn.disabled = false;
}

function refreshZone() {
  const h2 = uploadZone.querySelector("h2");
  const p = uploadZone.querySelector("p");
  if (imageFiles.length) {
    const total = imageFiles.reduce((s, i) => s + i.file.size, 0);
    h2.textContent = `${imageFiles.length} image${imageFiles.length > 1 ? "s" : ""} selected`;
    p.textContent = `${fmtSize(total)} total · Click to add more`;
  } else {
    h2.textContent = "Drop images here or click to browse";
    p.textContent = "Select one or multiple image files to convert";
  }
}

function fmtSize(b) {
  if (!b) return "0 B";
  const k = 1024,
    u = ["B", "KB", "MB", "GB"],
    i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + u[i];
}

/* ── Preview Render ── */
function renderPreviews() {
  if (!imageFiles.length) {
    previewSec.style.display = "none";
    previewGrid.innerHTML = "";
    return;
  }
  previewSec.style.display = "block";
  previewGrid.innerHTML = "";
  imageOrder.forEach((id, idx) => {
    const item = imageFiles.find((f) => f.id === id);
    if (!item) return;
    const div = document.createElement("div");
    div.className = "thumb";
    div.dataset.id = id;
    div.setAttribute("draggable", "true");
    const url = URL.createObjectURL(item.file);
    div.innerHTML = `
        <img src="${url}" alt="Image ${idx + 1}" loading="lazy"/>
        <span class="thumb-num">#${idx + 1}</span>
        <button class="thumb-del" data-id="${id}" title="Remove"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        <div class="thumb-bar">↕ drag to reorder</div>`;
    previewGrid.appendChild(div);
  });
  document.querySelectorAll(".thumb-del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeImg(btn.dataset.id);
    });
  });
  setupDragDrop();
}

function removeImg(id) {
  imageFiles = imageFiles.filter((f) => f.id !== id);
  imageOrder = imageOrder.filter((i) => i !== id);
  refreshZone();
  renderPreviews();
  if (!imageFiles.length) {
    convertBtn.disabled = true;
    resetBtn.disabled = true;
  }
}

function setupDragDrop() {
  document.querySelectorAll(".thumb").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      el.classList.add("dragging");
      e.dataTransfer.setData("text/plain", el.dataset.id);
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      document
        .querySelectorAll(".thumb")
        .forEach((t) => t.classList.remove("ghost"));
    });
    el.addEventListener("dragover", (e) => e.preventDefault());
    el.addEventListener("dragenter", (e) => {
      e.preventDefault();
      el.classList.add("ghost");
    });
    el.addEventListener("dragleave", () => el.classList.remove("ghost"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("ghost");
      const fId = e.dataTransfer.getData("text/plain"),
        tId = el.dataset.id;
      if (fId !== tId) {
        const fi = imageOrder.indexOf(fId),
          ti = imageOrder.indexOf(tId);
        imageOrder.splice(fi, 1);
        imageOrder.splice(ti, 0, fId);
        renderPreviews();
      }
    });
  });
}

/* ── Reset ── */
resetBtn.addEventListener("click", () => {
  imageFiles = [];
  imageOrder = [];
  refreshZone();
  renderPreviews();
  convertBtn.disabled = true;
  resetBtn.disabled = true;
  loadingWrap.style.display = "none";
  progressFill.style.width = "0%";
  pdfNameInput.value = "converted_document";
});

/* ── Image Load Helper ── */
function loadImgData(file, compress) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (!compress) {
        resolve(e.target.result);
        return;
      }
      const img = new Image();
      img.onload = () => {
        let w = img.width,
          h = img.height,
          max = 1600;
        if (w > max || h > max) {
          if (w > h) {
            h = Math.round(h * (max / w));
            w = max;
          } else {
            w = Math.round(w * (max / h));
            h = max;
          }
        }
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", 0.88));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function getPageDims(size, orient) {
  let w, h;
  switch (size) {
    case "a4":
      w = 210;
      h = 297;
      break;
    case "letter":
      w = 215.9;
      h = 279.4;
      break;
    case "legal":
      w = 215.9;
      h = 355.6;
      break;
    default:
      w = 210;
      h = 297;
  }
  return orient === "landscape" ? { w: h, h: w } : { w, h };
}

/* ── Convert ── */
convertBtn.addEventListener("click", async () => {
  if (!imageFiles.length) return;
  if (!jsPdfReady) {
    alert("PDF library still loading — please wait a moment and try again.");
    return;
  }
  loadingWrap.style.display = "block";
  loadingTitle.textContent = "Creating your PDF…";
  convertBtn.disabled = true;
  resetBtn.disabled = true;
  try {
    const { jsPDF } = window.jspdf;
    const name = pdfNameInput.value.trim() || "converted_document";
    const compress = document.getElementById("chkCompress").checked;
    const onePage = document.getElementById("chkOnePage").checked;
    const total = imageOrder.length;
    let pdf = new jsPDF({
      orientation: selectedOrient === "auto" ? "portrait" : selectedOrient,
      unit: "mm",
      format: selectedSize === "fit" ? [210, 297] : selectedSize,
    });
    let page = 1;
    for (let i = 0; i < imageOrder.length; i++) {
      const item = imageFiles.find((f) => f.id === imageOrder[i]);
      if (!item) continue;
      progressFill.style.width = `${Math.round((i / total) * 90)}%`;
      statusText.textContent = `Processing image ${i + 1} of ${total}…`;
      const imgData = await loadImgData(item.file, compress);
      const img = new Image();
      await new Promise((r) => {
        img.onload = r;
        img.src = imgData;
      });
      if (i > 0 && onePage) {
        pdf.addPage();
        page++;
      }
      const orient =
        selectedOrient === "auto"
          ? img.width > img.height
            ? "landscape"
            : "portrait"
          : selectedOrient;
      if (selectedOrient === "auto" && onePage) {
        if (page === 1) {
          pdf = new jsPDF({
            orientation: orient,
            unit: "mm",
            format: selectedSize === "fit" ? [210, 297] : selectedSize,
          });
        } else {
          const d = getPageDims(selectedSize, orient);
          pdf.addPage([d.w, d.h]);
        }
      }
      const pw = pdf.internal.pageSize.getWidth(),
        ph = pdf.internal.pageSize.getHeight();
      const margin = selectedSize === "fit" ? 0 : 10,
        mw = pw - margin * 2,
        mh = ph - margin * 2;
      const ir = img.width / img.height;
      let iw, ih;
      if (ir > mw / mh) {
        iw = mw;
        ih = mw / ir;
      } else {
        ih = mh;
        iw = mh * ir;
      }
      const x = (pw - iw) / 2,
        y = (ph - ih) / 2;
      pdf.addImage(
        imgData,
        item.file.type === "image/png" ? "PNG" : "JPEG",
        x,
        y,
        iw,
        ih,
      );
      await new Promise((r) => setTimeout(r, 10));
    }
    progressFill.style.width = "100%";
    statusText.textContent = "Finalising PDF…";
    await new Promise((r) => setTimeout(r, 400));
    const out = pdf.output("datauristring");
    generatedPdfUrl = out;
    if (isInApp) {
      downloadModal.classList.add("show");
    } else {
      const a = document.createElement("a");
      a.href = out;
      a.download = `${name}.pdf`;
      a.click();
      statusText.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 5px; display: inline-block;"><polyline points="20 6 9 17 4 12"></polyline></svg>PDF downloaded successfully!`;
    }
  } catch (err) {
    console.error(err);
    statusText.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 5px; display: inline-block;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>Error creating PDF. Please try again.`;
  } finally {
    setTimeout(() => {
      convertBtn.disabled = false;
      resetBtn.disabled = false;
    }, 1200);
  }
});

/* ── Modal ── */
document.getElementById("openBrowserBtn").addEventListener("click", () => {
  if (generatedPdfUrl)
    window.open(
      `data:application/pdf;base64,${generatedPdfUrl.split(",")[1]}`,
      "_system",
    );
  downloadModal.classList.remove("show");
});
document
  .getElementById("cancelModalBtn")
  .addEventListener("click", () => downloadModal.classList.remove("show"));

/* ── Scroll Reveal — identical to homepage ── */
const ro = new IntersectionObserver(
  (es) => {
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        ro.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: "0px 0px -36px 0px" },
);
document.querySelectorAll(".rv").forEach((el) => ro.observe(el));

/* ── Back to top — identical to homepage ── */
const b2t = document.getElementById("b2t");
window.addEventListener("scroll", () =>
  b2t.classList.toggle("show", scrollY > 380),
);
b2t.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);

/* ── Smooth scroll ── */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const t = document.querySelector(a.getAttribute("href"));
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: "smooth" });
    }
  });
});
