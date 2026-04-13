// ─────────────────────────────────────────
// Theme Toggle
// ─────────────────────────────────────────

const themeBtn = document.getElementById("themeBtn");
const root = document.documentElement;

const savedTheme = localStorage.getItem("pdfmaster-theme") || "light";
root.setAttribute("data-theme", savedTheme);

themeBtn.addEventListener("click", () => {
  const nextTheme =
    root.getAttribute("data-theme") === "dark" ? "light" : "dark";

  root.setAttribute("data-theme", nextTheme);
  localStorage.setItem("pdfmaster-theme", nextTheme);
});

// ─────────────────────────────────────────
// Contact Form (Formspree AJAX)
// ─────────────────────────────────────────

const form = document.getElementById("contactForm");
const success = document.getElementById("formSuccess");
const resetBtn = document.getElementById("resetBtn");

form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const data = new FormData(form);

  // Honeypot spam protection
  if (data.get("_gotcha")) {
    return;
  }

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: data,
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      form.style.display = "none";
      success.classList.add("show");
      form.reset();
    } else {
      alert("Submission failed. Please try again.");
    }
  } catch (error) {
    alert("Network error. Please try again.");
  }
});

resetBtn.addEventListener("click", () => {
  success.classList.remove("show");
  form.style.display = "block";
});

// ─────────────────────────────────────────
// FAQ Accordion
// ─────────────────────────────────────────

document.querySelectorAll(".faq-q").forEach((question) => {
  question.addEventListener("click", () => {
    const index = question.dataset.faq;
    const panel = document.getElementById(`faq-${index}`);

    const isOpen = question.classList.contains("open");

    document
      .querySelectorAll(".faq-q")
      .forEach((q) => q.classList.remove("open"));

    document
      .querySelectorAll(".faq-a")
      .forEach((a) => a.classList.remove("open"));

    if (!isOpen) {
      question.classList.add("open");
      panel.classList.add("open");
    }
  });
});

// ─────────────────────────────────────────
// Scroll Reveal Animation
// ─────────────────────────────────────────

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.1,
    rootMargin: "0px 0px -36px 0px",
  },
);

document.querySelectorAll(".rv").forEach((el) => {
  revealObserver.observe(el);
});

// ─────────────────────────────────────────
// Back To Top Button
// ─────────────────────────────────────────

const backToTop = document.getElementById("b2t");

window.addEventListener("scroll", () => {
  if (window.scrollY > 380) {
    backToTop.classList.add("show");
  } else {
    backToTop.classList.remove("show");
  }
});

backToTop.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

// ─────────────────────────────────────────
// Spinner Animation
// ─────────────────────────────────────────

const style = document.createElement("style");
style.textContent = `
        @keyframes spin {
        to { transform: rotate(360deg); }
        }
        `;
document.head.appendChild(style);

// ------------------------BOT Protection-----------------------------

let formLoadedTime = Date.now();

form.addEventListener("submit", function (e) {
  if (Date.now() - formLoadedTime < 2000) {
    e.preventDefault();
    return;
  }
});
