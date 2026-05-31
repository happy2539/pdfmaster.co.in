// ===== THEME =====
const root = document.documentElement;
const themeBtn = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const THEME_KEY = "pdfmaster-theme";

const sunSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
const moonSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  themeBtn.innerHTML = theme === "dark" ? sunSVG : moonSVG;
  themeBtn.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
  );
}

(function () {
  const saved = localStorage.getItem(THEME_KEY);
  const pref = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  applyTheme(saved || pref);
})();

themeBtn.addEventListener("click", () => {
  applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

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

// ===== FORM SUBMISSION =====
const WORKER_URL =
  "https://email-collector.gamingwithhappy39.workers.dev/subscribe";

function showAlert(msg) {
  const el = document.getElementById("formAlert");
  document.getElementById("formAlertMsg").textContent = msg;
  el.classList.add("show");
}
function hideAlert() {
  document.getElementById("formAlert").classList.remove("show");
}

function setError(fieldId, errId, show) {
  document.getElementById(fieldId).classList.toggle("error", show);
  document.getElementById(errId).classList.toggle("show", show);
}

function validateEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

document.getElementById("submitBtn").addEventListener("click", async () => {
  hideAlert();

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();
  const mobile = document.getElementById("mobile").value.trim();
  const useCase = document.getElementById("useCase").value;

  let valid = true;

  if (!firstName) {
    setError("firstName", "firstNameErr", true);
    valid = false;
  } else {
    setError("firstName", "firstNameErr", false);
  }
  if (!email || !validateEmail(email)) {
    setError("email", "emailErr", true);
    valid = false;
  } else {
    setError("email", "emailErr", false);
  }

  if (!valid) return;

  const btn = document.getElementById("submitBtn");
  btn.classList.add("loading");
  btn.disabled = true;

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        mobile,
        useCase,
      }),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      window.location.href = "/thank-you";
    } else if (res.status === 429) {
      showAlert(
        data.message || "Too many submissions. Please try again later.",
      );
    } else if (res.status === 409) {
      showAlert("This email is already subscribed. Thank you!");
    } else {
      showAlert(data.message || "Something went wrong. Please try again.");
    }
  } catch (err) {
    showAlert("Network error. Please check your connection and try again.");
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
});

// Clear errors on input
["firstName", "email"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    document.getElementById(id).classList.remove("error");
    const errId = id === "firstName" ? "firstNameErr" : "emailErr";
    document.getElementById(errId).classList.remove("show");
    hideAlert();
  });
});
