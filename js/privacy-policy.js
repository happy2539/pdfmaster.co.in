/* ═══════════ Theme Toggle ═══════════ */
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

/* ═══════════ Hamburger Menu ═══════════ */
const hamburgerBtn = document.getElementById("hamburgerBtn");
const navDropdown = document.getElementById("navDropdown");
const navOverlay = document.getElementById("navOverlay");

function openMenu() {
  hamburgerBtn.classList.add("open");
  navDropdown.classList.add("open");
  navOverlay.classList.add("active");
  hamburgerBtn.setAttribute("aria-expanded", "true");
}
function closeMenu() {
  hamburgerBtn.classList.remove("open");
  navDropdown.classList.remove("open");
  navOverlay.classList.remove("active");
  hamburgerBtn.setAttribute("aria-expanded", "false");
}
hamburgerBtn.addEventListener("click", () => {
  hamburgerBtn.classList.contains("open") ? closeMenu() : openMenu();
});
navOverlay.addEventListener("click", closeMenu);
navDropdown
  .querySelectorAll("a")
  .forEach((a) => a.addEventListener("click", closeMenu));

/* ═══════════ Back to Top ═══════════ */
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

/* ═══════════ Reveal on Scroll ═══════════ */
const rvEls = document.querySelectorAll(".rv");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.07 },
);
rvEls.forEach((el) => observer.observe(el));

/* ═══════════ TOC Active State ═══════════ */
const sections = document.querySelectorAll(".policy-section[id]");
const tocLinks = document.querySelectorAll(".toc-list a");
const tocObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        tocLinks.forEach((link) => link.classList.remove("active"));
        const active = document.querySelector(
          `.toc-list a[href="#${entry.target.id}"]`,
        );
        if (active) active.classList.add("active");
      }
    });
  },
  { rootMargin: "-30% 0px -60% 0px" },
);
sections.forEach((s) => tocObserver.observe(s));
