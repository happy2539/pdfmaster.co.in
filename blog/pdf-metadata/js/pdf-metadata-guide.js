// ── Theme ──────────────────────────────────────
const root = document.documentElement;
const savedTheme = localStorage.getItem("pdfmaster-theme") || "light";
root.setAttribute("data-theme", savedTheme);

document.getElementById("themeToggle").addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
  root.setAttribute("data-theme", next);
  localStorage.setItem("pdfmaster-theme", next);
});

// ── Mobile Drawer ──────────────────────────────
const menuToggle = document.getElementById("menuToggle");
const drawer = document.getElementById("mobileDrawer");
const overlay = document.getElementById("drawerOverlay");
const drawerClose = document.getElementById("drawerClose");

function openDrawer() {
  drawer.classList.add("open");
  overlay.classList.add("open");
  menuToggle.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}
function closeDrawer() {
  drawer.classList.remove("open");
  overlay.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}
menuToggle.addEventListener("click", openDrawer);
drawerClose.addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);
drawer
  .querySelectorAll("a")
  .forEach((a) => a.addEventListener("click", closeDrawer));

// ── Back to Top ────────────────────────────────
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

// ── FAQ Accordion ──────────────────────────────
document.querySelectorAll(".faq-q").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".faq-item");
    const isOpen = item.classList.contains("open");
    // close all
    document.querySelectorAll(".faq-item.open").forEach((el) => {
      el.classList.remove("open");
      el.querySelector(".faq-q").setAttribute("aria-expanded", "false");
    });
    if (!isOpen) {
      item.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
    }
  });
});

// ── Active TOC highlight ───────────────────────
const sections = document.querySelectorAll("section[id]");
const tocLinks = document.querySelectorAll(".toc-list a");
const tocObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        tocLinks.forEach((a) => a.classList.remove("active"));
        const active = document.querySelector(
          `.toc-list a[href="#${e.target.id}"]`,
        );
        if (active) active.classList.add("active");
      }
    });
  },
  { rootMargin: `-${68 + 30}px 0px -60% 0px` },
);
sections.forEach((s) => tocObs.observe(s));
