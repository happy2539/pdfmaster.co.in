// ── THEME TOGGLE ──
const html = document.documentElement;
const themeBtn = document.getElementById("themeToggle");
const THEME_KEY = "pdfmaster-theme";

function applyTheme(theme) {
  html.setAttribute("data-theme", theme);
  themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, theme);
}

const saved = localStorage.getItem(THEME_KEY);
const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches
  ? "dark"
  : "light";
applyTheme(saved || preferred);

themeBtn.addEventListener("click", () => {
  applyTheme(html.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

// ── HAMBURGER / DRAWER ──
const hamburger = document.getElementById("hamburger");
const drawer = document.getElementById("drawer");
const drawerOverlay = document.getElementById("drawerOverlay");
const drawerClose = document.getElementById("drawerClose");

function openDrawer() {
  hamburger.classList.add("open");
  drawer.classList.add("open");
  drawerOverlay.style.display = "block";
  requestAnimationFrame(() => drawerOverlay.classList.add("open"));
  hamburger.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}
function closeDrawer() {
  hamburger.classList.remove("open");
  drawer.classList.remove("open");
  drawerOverlay.classList.remove("open");
  setTimeout(() => {
    drawerOverlay.style.display = "";
  }, 300);
  hamburger.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

hamburger.addEventListener("click", openDrawer);
hamburger.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openDrawer();
  }
});
drawerClose.addEventListener("click", closeDrawer);
drawerClose.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    closeDrawer();
  }
});
drawerOverlay.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDrawer();
});

// ── FILTER TAGS ──
const filterBtns = document.querySelectorAll(".filter-tag");
const cards = document.querySelectorAll(".blog-card");
const visibleCount = document.getElementById("visibleCount");

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const filter = btn.dataset.filter;
    let count = 0;
    cards.forEach((card) => {
      const tags = card.dataset.tags || "";
      const show = filter === "all" || tags.includes(filter);
      card.style.display = show ? "" : "none";
      if (show) count++;
    });
    if (visibleCount) visibleCount.textContent = count;
  });
});

// ── SCROLL REVEAL ──
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
);

document.querySelectorAll(".rv").forEach((el) => observer.observe(el));

// ── BACK TO TOP ──
const backToTop = document.getElementById("backToTop");
if (backToTop) {
  window.addEventListener(
    "scroll",
    () => {
      backToTop.classList.toggle("visible", window.scrollY > 400);
    },
    { passive: true },
  );
  backToTop.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );
}
