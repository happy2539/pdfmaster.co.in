/* ═══════════ Inline fallback script (identical logic to privacy-policy.js) ═══════════ */

/* Theme */
const html = document.documentElement;
const themeBtn = document.getElementById("themeBtn");
const savedTheme = localStorage.getItem("pdfmaster-theme");
if (savedTheme) html.setAttribute("data-theme", savedTheme);
themeBtn.addEventListener("click", () => {
  const isDark = html.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  html.setAttribute("data-theme", next);
  localStorage.setItem("pdfmaster-theme", next);
});

/* Hamburger dropdown */
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

/* Back to top */
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

/* Scroll reveal */
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

/* TOC active state on scroll */
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

/* Smooth scroll for anchor links */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const t = document.querySelector(a.getAttribute("href"));
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: "smooth" });
    }
  });
});
