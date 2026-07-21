(function () {
  "use strict";

  // Theme toggle
  var themeBtn = document.getElementById("theme-toggle");
  themeBtn.addEventListener("click", function () {
    var root = document.documentElement;
    var current = root.getAttribute("data-theme");
    var next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("pdfmaster-theme", next);
    } catch (e) {}
  });

  // Mobile hamburger
  var hamburger = document.getElementById("hamburger-btn");
  hamburger.addEventListener("click", function () {
    var isOpen = document.body.classList.toggle("nav-open");
    hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
  document.querySelectorAll(".mobile-panel a").forEach(function (a) {
    a.addEventListener("click", function () {
      document.body.classList.remove("nav-open");
      hamburger.setAttribute("aria-expanded", "false");
    });
  });

  // FAQ accordion
  document.querySelectorAll(".faq-q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".faq-item");
      var isOpen = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  });

  // Copy email
  var copyBtn = document.getElementById("copy-email");
  var toast = document.getElementById("toast");
  var toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 2200);
  }
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var email = document.getElementById("email-value").textContent.trim();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(email)
          .then(function () {
            showToast("Email copied to clipboard");
          })
          .catch(function () {
            showToast("Could not copy — please copy manually");
          });
      } else {
        showToast("Could not copy — please copy manually");
      }
    });
  }

  // Back to top
  var backToTop = document.getElementById("back-to-top");
  window.addEventListener(
    "scroll",
    function () {
      if (window.scrollY > 500) {
        backToTop.classList.add("show");
      } else {
        backToTop.classList.remove("show");
      }
    },
    { passive: true },
  );
  backToTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();
