/* ── Theme Toggle ── */
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

/* ── Hamburger ── */
const hamburgerBtn = document.getElementById("hamburgerBtn");
const mobileNav = document.getElementById("mobileNav");

hamburgerBtn.addEventListener("click", () => {
  mobileNav.classList.toggle("open");
});
mobileNav.querySelectorAll("a").forEach((a) => {
  a.addEventListener("click", () => mobileNav.classList.remove("open"));
});

/* ── Back to top ── */
const b2t = document.getElementById("b2t");
window.addEventListener("scroll", () => {
  b2t.classList.toggle("show", window.scrollY > 400);
});
b2t.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);
