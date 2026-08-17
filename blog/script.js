/* ── THEME ───────────────────────────────────────────────────────────────── */
(function () {
  const t = localStorage.getItem("pdfmaster-theme") || "light";
  document.documentElement.setAttribute("data-theme", t);
})();
document.getElementById("themeBtn").addEventListener("click", () => {
  const c = document.documentElement.getAttribute("data-theme");
  const n = c === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", n);
  localStorage.setItem("pdfmaster-theme", n);
});

/* ── HAMBURGER ───────────────────────────────────────────────────────────── */
const ham = document.getElementById("hamburger");
const drw = document.getElementById("drawer");
ham.addEventListener("click", () => {
  const open = ham.classList.toggle("open");
  drw.classList.toggle("open", open);
  ham.setAttribute("aria-expanded", open);
  drw.setAttribute("aria-hidden", !open);
  document.body.style.overflow = open ? "hidden" : "";
});
drw.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    ham.classList.remove("open");
    drw.classList.remove("open");
    ham.setAttribute("aria-expanded", "false");
    drw.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }),
);

/* ── HERO TABS ───────────────────────────────────────────────────────────── */
document.getElementById("heroTabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".hero-tab");
  if (!btn) return;
  document.querySelectorAll(".hero-tab").forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  btn.classList.add("active");
  btn.setAttribute("aria-selected", "true");
  const target = document.getElementById("sec-" + btn.dataset.section);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ── CUSTOM MODAL ────────────────────────────────────────────────────────── */
const ICONS = {
  success: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
  error: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  warn: `<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

function showModal(type, title, message) {
  const overlay = document.getElementById("pmOverlay");
  const iconWrap = document.getElementById("pmIconWrap");
  const titleEl = document.getElementById("pmTitle");
  const msgEl = document.getElementById("pmMsg");
  const btn = document.getElementById("pmBtn");

  iconWrap.className = `pm-icon-wrap pm-${type}`;
  iconWrap.innerHTML = ICONS[type] ?? ICONS.error;
  titleEl.textContent = title;
  msgEl.textContent = message;

  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("pm-visible"));

  function close() {
    overlay.classList.remove("pm-visible");
    overlay.addEventListener(
      "transitionend",
      () => {
        overlay.hidden = true;
      },
      { once: true },
    );
  }

  btn.onclick = close;
  overlay.addEventListener(
    "click",
    (e) => {
      if (e.target === overlay) close();
    },
    { once: true },
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") close();
    },
    { once: true },
  );
}

/* ── BACK TO TOP ─────────────────────────────────────────────────────────── */
const btt = document.getElementById("btt");
window.addEventListener(
  "scroll",
  () => btt.classList.toggle("show", scrollY > 380),
  { passive: true },
);
btt.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);
