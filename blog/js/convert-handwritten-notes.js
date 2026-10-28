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

const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = html.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}

// ── Side Menu (Matching Tool Pages) ─────────────────────────
const hamburgerBtn = document.getElementById("hamburgerBtn");
const sideMenu = document.getElementById("sideMenu");
const sideOverlay = document.getElementById("sideOverlay");
const closeMenuBtn = document.getElementById("closeMenuBtn");

if (hamburgerBtn && sideMenu && sideOverlay) {
  hamburgerBtn.addEventListener("click", () => {
    sideMenu.classList.add("active");
    sideOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
  });

  const closeSide = () => {
    sideMenu.classList.remove("active");
    sideOverlay.classList.remove("active");
    document.body.style.overflow = "";
  };

  if (closeMenuBtn) closeMenuBtn.addEventListener("click", closeSide);
  sideOverlay.addEventListener("click", closeSide);
}

// ── Back to Top ─────────────────────────────────────────────
const btt = document.getElementById("backToTop");
if (btt) {
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
}

// ── FAQ Accordion ────────────────────────────────────────────
document.querySelectorAll(".faq-question").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.faq;
    const answer = document.getElementById("faq-" + id);
    if (!answer) return;
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
