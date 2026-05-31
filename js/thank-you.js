// ===== THEME =====
const root = document.documentElement;
const themeBtn = document.getElementById("themeToggle");
const THEME_KEY = "pdfmaster-theme";
const sunSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
const moonSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
function applyTheme(t) {
  root.setAttribute("data-theme", t);
  localStorage.setItem(THEME_KEY, t);
  themeBtn.innerHTML = t === "dark" ? sunSVG : moonSVG;
  themeBtn.setAttribute(
    "aria-label",
    t === "dark" ? "Switch to light mode" : "Switch to dark mode",
  );
}
(function () {
  const saved = localStorage.getItem(THEME_KEY);
  const pref = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  applyTheme(saved || pref);
})();
themeBtn.addEventListener("click", () =>
  applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"),
);

// ===== HAMBURGER =====
const hamburger = document.getElementById("hamburger");
const mobileMenu = document.getElementById("mobileMenu");
hamburger.addEventListener("click", () => {
  const open = mobileMenu.classList.toggle("open");
  hamburger.classList.toggle("open", open);
  hamburger.setAttribute("aria-expanded", open);
});

// ===== SCROLL REVEAL =====
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1 },
);
document.querySelectorAll(".rv").forEach((el) => observer.observe(el));

// ===== BACK TO TOP =====
const btt = document.getElementById("btt");
window.addEventListener(
  "scroll",
  () => {
    btt.classList.toggle("show", window.scrollY > 400);
  },
  { passive: true },
);
btt.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);
