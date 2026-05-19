// ── Theme ───────────────────────────────────────────────────
const THEME_KEY = "pdfmaster-theme";
const html = document.documentElement;
const sunIcon = document.getElementById("sunIcon");
const moonIcon = document.getElementById("moonIcon");

function applyTheme(theme) {
  html.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  if (sunIcon && moonIcon) {
    if (theme === "dark") {
      sunIcon.style.display = "block";
      moonIcon.style.display = "none";
    } else {
      sunIcon.style.display = "none";
      moonIcon.style.display = "block";
    }
  }
}

const savedTheme = localStorage.getItem(THEME_KEY) || "light";
applyTheme(savedTheme);

document.getElementById("themeToggle").addEventListener("click", () => {
  const current = html.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
});

// ── Hamburger / Drawer ──────────────────────────────────────
const hamburger = document.getElementById("hamburger");
const navDrawer = document.getElementById("navDrawer");
hamburger.addEventListener("click", () => {
  const isOpen = hamburger.classList.toggle("open");
  hamburger.setAttribute("aria-expanded", isOpen);
  navDrawer.classList.toggle("open", isOpen);
});

// ── Navbar Scroll Shadow ────────────────────────────────────
const navbar = document.getElementById("navbar");
window.addEventListener(
  "scroll",
  () => {
    navbar.classList.toggle("scrolled", window.scrollY > 20);
  },
  { passive: true },
);

// ── Back to Top ─────────────────────────────────────────────
const btt = document.getElementById("backToTop");
window.addEventListener(
  "scroll",
  () => {
    btt.classList.toggle("visible", window.scrollY > 400);
  },
  { passive: true },
);
btt.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);

// ── Scroll Reveal ───────────────────────────────────────────
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

// ── FAQ Accordion ────────────────────────────────────────────
document.querySelectorAll(".faq-question").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.faq;
    const answer = document.getElementById("faq-" + id);
    const isOpen = answer.classList.contains("open");

    // Close all
    document.querySelectorAll(".faq-answer").forEach((a) => {
      a.classList.remove("open");
    });
    document.querySelectorAll(".faq-question").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-expanded", "false");
    });

    // Open clicked if it was closed
    if (!isOpen) {
      answer.classList.add("open");
      btn.classList.add("active");
      btn.setAttribute("aria-expanded", "true");
    }
  });
});
