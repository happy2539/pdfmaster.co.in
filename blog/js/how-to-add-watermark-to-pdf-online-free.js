/**
 * PDFMaster Blog - How to Add a Watermark to a PDF Online for Free
 * Interactive behaviors: Theme toggle, Mobile Drawer, FAQ Accordion, Copy Email, Reading Progress & Back to Top
 */
(function () {
  "use strict";

  // ── Theme Toggle ──
  var themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var root = document.documentElement;
      var current = root.getAttribute("data-theme") || "light";
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("pdfmaster-theme", next);
      } catch (e) {}
    });
  }

  // ── Mobile Hamburger Drawer ──
  var hamburger = document.getElementById("hamburger-btn");
  if (hamburger) {
    hamburger.addEventListener("click", function () {
      var isOpen = document.body.classList.toggle("nav-open");
      hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }
  document.querySelectorAll(".mobile-panel a").forEach(function (a) {
    a.addEventListener("click", function () {
      document.body.classList.remove("nav-open");
      if (hamburger) hamburger.setAttribute("aria-expanded", "false");
    });
  });

  // ── FAQ Accordion (Founder Page Design) ──
  document.querySelectorAll(".faq-q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".faq-item");
      if (!item) return;
      var isOpen = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  });

  // ── Copy Email with Toast ──
  var toast = document.getElementById("toast");
  var toastTimer = null;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 2400);
  }

  var copyEmailBtn = document.getElementById("copy-email-btn");
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener("click", function () {
      var email = "support@pdfmaster.co.in";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(email)
          .then(function () {
            showToast("Email address copied to clipboard!");
          })
          .catch(function () {
            showToast("Could not copy — please email support@pdfmaster.co.in");
          });
      } else {
        showToast("Could not copy — please email support@pdfmaster.co.in");
      }
    });
  }

  // ── Reading Progress Bar ──
  var progressBar = document.getElementById("reading-progress");
  if (progressBar) {
    window.addEventListener(
      "scroll",
      function () {
        var h = document.documentElement;
        var b = document.body;
        var st = h.scrollTop || b.scrollTop;
        var sh = h.scrollHeight || b.scrollHeight;
        var percent = (st / (sh - h.clientHeight)) * 100;
        progressBar.style.width = Math.min(100, Math.max(0, percent)) + "%";
      },
      { passive: true }
    );
  }

  // ── Back to Top Button ──
  var backToTop = document.getElementById("back-to-top");
  if (backToTop) {
    window.addEventListener(
      "scroll",
      function () {
        if (window.scrollY > 400) {
          backToTop.classList.add("show");
        } else {
          backToTop.classList.remove("show");
        }
      },
      { passive: true }
    );
    backToTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
})();
