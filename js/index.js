// ── Theme ──────────────────────────────────────────
const btn = document.getElementById("themeBtn");
const sunIcon = document.getElementById("sunIcon");
const moonIcon = document.getElementById("moonIcon");
const root = document.documentElement;

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  localStorage.setItem("pdfmaster-theme", theme);
  if (theme === "dark") {
    if (sunIcon) sunIcon.style.display = "block";
    if (moonIcon) moonIcon.style.display = "none";
  } else {
    if (sunIcon) sunIcon.style.display = "none";
    if (moonIcon) moonIcon.style.display = "block";
  }
}

// Expose globally so festival engine can sync when KV response arrives
window.PDFMasterApplyTheme = applyTheme;

// Determine initial theme:
// Prioritize admin's forced initial theme only when a festival is actively running
let initialTheme = "light";
try {
  const festRaw = localStorage.getItem("pdfmaster_festival_theme");
  const fest = festRaw ? JSON.parse(festRaw) : null;
  const userToggled = sessionStorage.getItem("pdfmaster_user_toggled_theme");

  const isScheduleActive = (f) => {
    if (!f || !f.active || !f.theme || f.theme === "none") return false;
    const now = Date.now();
    if (f.startDate) {
      const s = new Date(f.startDate).getTime();
      if (!isNaN(s) && s > now) return false;
    }
    if (f.endDate) {
      const e = new Date(f.endDate).getTime();
      if (!isNaN(e) && e < now) return false;
    }
    return true;
  };

  const isFestActive = isScheduleActive(fest);

  if (!isFestActive) {
    root.removeAttribute("data-festival");
  }

  if (!userToggled && isFestActive && (fest.initialThemeMode === "dark" || fest.initialThemeMode === "light")) {
    initialTheme = fest.initialThemeMode;
  } else {
    initialTheme = localStorage.getItem("pdfmaster-theme") || "light";
  }
} catch (_) {
  initialTheme = localStorage.getItem("pdfmaster-theme") || "light";
}

applyTheme(initialTheme);

btn?.addEventListener("click", () => {
  sessionStorage.setItem("pdfmaster_user_toggled_theme", "true");
  const current = root.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
});

// ── Filter tabs ────────────────────────────────────
document.querySelectorAll(".ftab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".ftab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const f = tab.dataset.filter;
    document.querySelectorAll(".tcard").forEach((c) => {
      c.style.display = f === "all" || c.dataset.cat === f ? "flex" : "none";
    });
  });
});

// ── Smooth scroll ──────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const t = document.querySelector(a.getAttribute("href"));
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: "smooth" });
    }
  });
});


// ── Back to top ────────────────────────────────────
const b2t = document.getElementById("b2t");
window.addEventListener("scroll", () =>
  b2t.classList.toggle("show", scrollY > 380),
);
b2t.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);
