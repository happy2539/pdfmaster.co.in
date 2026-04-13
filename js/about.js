/* ── Theme Toggle ── */
const themeBtn = document.getElementById("themeBtn");
const html = document.documentElement;

const saved = localStorage.getItem("pdfmaster-theme") || "light";
html.setAttribute("data-theme", saved);

themeBtn.addEventListener("click", () => {
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  localStorage.setItem("pdfmaster-theme", next);
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
