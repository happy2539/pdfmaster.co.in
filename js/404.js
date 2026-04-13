/* ══════════════════════════════════════
         THEME TOGGLE
         ══════════════════════════════════════ */
const html = document.documentElement;
const themeBtn = document.getElementById("themeBtn");
const STORAGE_KEY = "pdfmaster-theme";

// Restore saved preference or default to light
(function () {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) html.setAttribute("data-theme", saved);
})();

function toggleTheme() {
  const next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
  html.setAttribute("data-theme", next);
  localStorage.setItem(STORAGE_KEY, next);
}

themeBtn.addEventListener("click", toggleTheme);

// Allow toggling via keyboard on the wrapper
document.querySelector(".toggle-wrap").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleTheme();
  }
});

/* ══════════════════════════════════════
         BACK TO TOP
         ══════════════════════════════════════ */
const b2t = document.getElementById("b2t");
window.addEventListener(
  "scroll",
  () => {
    b2t.classList.toggle("visible", window.scrollY > 320);
  },
  { passive: true },
);
b2t.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);

/* ══════════════════════════════════════
         SEARCH — route to homepage with query
         ══════════════════════════════════════ */
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

// Instant tool map for client-side suggestions
const toolMap = [
  {
    kw: ["photo", "jpg", "jpeg", "image", "picture"],
    url: "/photo-to-pdf",
    label: "Photo to PDF",
  },
  {
    kw: ["pdf photo", "pdf image", "pdf picture", "pdf to jpg"],
    url: "/pdf-to-photo",
    label: "PDF to Photo",
  },
  {
    kw: ["merge", "combine", "compiler", "join", "pdf compiler"],
    url: "/pdf-compiler",
    label: "PDF Compiler",
  },
  { kw: ["png"], url: "/png-to-pdf", label: "PNG to PDF" },
  {
    kw: ["compress", "reduce", "shrink", "smaller"],
    url: "/pdf-compressor",
    label: "PDF Compressor",
  },
  {
    kw: ["split", "separate", "divide", "extract page"],
    url: "/pdf-splitter",
    label: "PDF Splitter",
  },
  {
    kw: ["contact", "help", "support"],
    url: "/contact",
    label: "Contact",
  },
  { kw: ["faq", "question", "frequently"], url: "/faq", label: "FAQ" },
  { kw: ["about", "team", "us"], url: "/about", label: "About" },
  {
    kw: ["privacy", "policy", "data"],
    url: "/privacy",
    label: "Privacy Policy",
  },
  {
    kw: ["terms", "tos", "conditions"],
    url: "/terms",
    label: "Terms of Service",
  },
];

function doSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return;

  // Try to match a tool
  for (const tool of toolMap) {
    if (tool.kw.some((k) => q.includes(k))) {
      window.location.href = tool.url;
      return;
    }
  }

  // Fallback: homepage with hash
  window.location.href = "/#tools";
}

searchBtn.addEventListener("click", doSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

/* ══════════════════════════════════════
         ACCESSIBILITY — focus ring on keyboard nav
         ══════════════════════════════════════ */
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab") document.body.classList.add("keyboard-nav");
});
document.addEventListener("mousedown", () => {
  document.body.classList.remove("keyboard-nav");
});
