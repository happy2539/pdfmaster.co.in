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

/* ── NEWSLETTER ──────────────────────────────────────────────────────────── */
document.getElementById("emailForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const emailForm = document.getElementById("emailForm");
  const submitBtn = emailForm.querySelector(".nl-btn");

  const firstName = document.getElementById("firstNameInput").value.trim();
  const lastName = document.getElementById("lastNameInput").value.trim();
  const email = document.getElementById("emailInput").value.trim();
  const mobile = document.getElementById("mobileInput").value.trim();

  const tokenEl = document.querySelector('[name="cf-turnstile-response"]');
  const token = tokenEl ? tokenEl.value : null;

  // Client-side validation
  if (!firstName || !lastName) {
    showModal(
      "warn",
      "Name required",
      "Please enter your first and last name.",
    );
    return;
  }
  if (mobile && !/^\+?[0-9\s\-]{7,15}$/.test(mobile)) {
    showModal(
      "warn",
      "Invalid number",
      "Please enter a valid mobile number or leave it blank.",
    );
    return;
  }
  if (!token) {
    showModal(
      "warn",
      "One more step",
      "Please complete the CAPTCHA verification first.",
    );
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  try {
    const res = await fetch(
      "https://email-collector.gamingwithhappy39.workers.dev/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, mobile, token }),
      },
    );

    let data = {};
    try {
      data = await res.json();
    } catch {
      /* non-JSON fallback */
    }

    if (res.ok && data.success) {
      showModal(
        "success",
        "You're in! 🎉",
        "Thanks for subscribing. Expect PDF tips and tool updates monthly — no spam, ever.",
      );
      emailForm.reset();
      if (window.turnstile) window.turnstile.reset();
    } else if (res.status === 429) {
      showModal(
        "warn",
        "Too many attempts",
        "You've hit the limit. Please wait an hour and try again.",
      );
    } else if (res.status === 403) {
      showModal(
        "error",
        "Verification failed",
        "CAPTCHA check failed or request was blocked. Please refresh and try again.",
      );
    } else if (res.status === 400) {
      showModal(
        "warn",
        "Invalid input",
        data.error ?? "Please check your details and try again.",
      );
    } else if (res.status === 409) {
      showModal(
        "success",
        "Already subscribed",
        "This email is already on the list — you're good!",
      );
    } else {
      showModal(
        "error",
        "Something went wrong",
        data.error ?? "An unexpected error occurred. Please try again.",
      );
    }
  } catch (err) {
    showModal(
      "error",
      "Network error",
      "Could not reach the server. Please check your connection and try again.",
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Subscribe Free →";
  }
});

/* ── SCROLL REVEAL ───────────────────────────────────────────────────────── */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.07 },
);
document.querySelectorAll(".rev").forEach((el, i) => {
  el.style.transitionDelay = (i % 6) * 0.07 + "s";
  io.observe(el);
});

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
