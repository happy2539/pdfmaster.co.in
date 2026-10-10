/**
 * PDFMaster - Protect PDF (PDF Locker) Controller
 * Production Grade · Military-Grade AES-256 Encryption · Low-RAM Architecture · 100% Client-Side
 */

(function () {
  "use strict";

  // Configure PDF.js Worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "/assets/vendor/pdf.worker.min.js";
  }

  // =============================================
  //  DOM ELEMENTS
  // =============================================
  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const workspace = document.getElementById("workspace");
  const changeFileBtn = document.getElementById("changeFileBtn");

  const fileNameEl = document.getElementById("fileName");
  const fileSizeEl = document.getElementById("fileSize");
  const totalCountEl = document.getElementById("totalCount");

  // Passwords & Controls
  const userPasswordInput = document.getElementById("userPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const toggleUserPassBtn = document.getElementById("toggleUserPassBtn");
  const toggleConfirmPassBtn = document.getElementById("toggleConfirmPassBtn");
  const genPassBtn = document.getElementById("genPassBtn");

  // Strength Meter Elements
  const strengthValEl = document.getElementById("strengthVal");
  const entropyValEl = document.getElementById("entropyVal");
  const strengthBarsEl = document.getElementById("strengthBars");
  const crackTimeValEl = document.getElementById("crackTimeVal");
  const matchTagEl = document.getElementById("matchTag");

  // Algorithms
  const algoAesCard = document.getElementById("algoAesCard");
  const algoRc4Card = document.getElementById("algoRc4Card");

  // Shield Specs
  const shieldIcon = document.querySelector(".shield-icon");
  const shieldStatus = document.getElementById("shieldStatus");
  const specAlgo = document.getElementById("specAlgo");
  const specOpen = document.getElementById("specOpen");
  const specSecurityMode = document.getElementById("specSecurityMode");
  const specPrint = document.getElementById("specPrint");
  const specCopy = document.getElementById("specCopy");
  const specModify = document.getElementById("specModify");

  // Action Bar
  const actionBarStatus = document.getElementById("actionBarStatus");
  const encryptBtn = document.getElementById("encryptBtn");

  // Global & Navbar UI
  const themeToggle = document.getElementById("themeToggle");
  const sunIcon = document.getElementById("sunIcon");
  const moonIcon = document.getElementById("moonIcon");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sideMenu = document.getElementById("sideMenu");
  const sideOverlay = document.getElementById("sideOverlay");
  const closeMenuBtn = document.getElementById("closeMenuBtn");
  const backTop = document.getElementById("backTop");
  const toastEl = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  let toastTimer = null;

  // =============================================
  //  STATE MANAGEMENT
  // =============================================
  const state = {
    file: null,
    arrayBuffer: null,
    pdfDoc: null,
    pageCount: 0,
    encryptedBlob: null,
    encryptedFileName: "",
    algorithm: "AES-256",
    isEncrypted: false,
  };

  // =============================================
  //  THEME CONTROLLER
  // =============================================
  const THEME_KEY = "pdfmaster-theme";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    if (sunIcon && moonIcon) {
      sunIcon.style.display = theme === "dark" ? "none" : "block";
      moonIcon.style.display = theme === "dark" ? "block" : "none";
    }
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved);
    } else {
      const prefersDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(prefersDark ? "dark" : "light");
    }

    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        const cur =
          document.documentElement.getAttribute("data-theme") || "light";
        applyTheme(cur === "dark" ? "light" : "dark");
      });
    }
  }

  // =============================================
  //  TOAST NOTIFICATIONS
  // =============================================
  function showToast(msg, duration = 3000) {
    if (toastEl && toastMsg) {
      toastMsg.textContent = msg;
      toastEl.classList.add("active");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastEl.classList.remove("active");
      }, duration);
      return;
    }

    const existing = document.querySelector(".toast-msg");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "toast-msg";
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(20px)";
      setTimeout(() => toast.remove(), 320);
    }, duration);
  }

  // =============================================
  //  FILE SELECTION & VALIDATION
  // =============================================
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  async function handleFileSelection(file) {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Please select a valid PDF file");
      return;
    }

    try {
      showToast("Loading and inspecting document…");
      const buffer = await file.arrayBuffer();

      // 1. Check if file is already encrypted using pdfjsLib
      let pdfDoc = null;
      try {
        const loadingTask = window.pdfjsLib.getDocument({
          data: new Uint8Array(buffer.slice(0)),
        });
        pdfDoc = await loadingTask.promise;
      } catch (err) {
        if (
          err.name === "PasswordException" ||
          (err.message && err.message.toLowerCase().includes("password"))
        ) {
          alert(
            "⚠️ This PDF is already locked with a password!\n\nPlease unlock or decrypt the document first before adding new protection.",
          );
          return;
        }
        throw err;
      }

      state.file = file;
      state.arrayBuffer = buffer;
      state.pdfDoc = pdfDoc;
      state.pageCount = pdfDoc.numPages;

      // Update File Info
      fileNameEl.textContent = file.name;
      fileSizeEl.innerHTML = `<span>${formatBytes(file.size)}</span> · <span id="totalCount">${state.pageCount}</span> page(s)`;

      // Show workspace, hide upload zone
      uploadZone.style.display = "none";
      workspace.style.display = "block";

      // Reset Passwords & Form state
      userPasswordInput.value = "";
      confirmPasswordInput.value = "";
      evaluatePasswordStrength();
      updateShieldSummary();
      showToast(`Loaded ${file.name} (${state.pageCount} pages)`);
    } catch (err) {
      console.error("Error reading PDF:", err);
      showToast("Could not read this PDF. The file may be corrupted.");
    }
  }

  // =============================================
  //  PASSWORD STRENGTH & ENTROPY ALGORITHM
  // =============================================
  function calculateEntropy(pass) {
    if (!pass) return 0;
    let poolSize = 0;
    if (/[a-z]/.test(pass)) poolSize += 26;
    if (/[A-Z]/.test(pass)) poolSize += 26;
    if (/[0-9]/.test(pass)) poolSize += 10;
    if (/[^a-zA-Z0-9]/.test(pass)) poolSize += 33;
    if (poolSize === 0) poolSize = 1;

    return Math.round(pass.length * (Math.log(poolSize) / Math.log(2)));
  }

  function getCrackTime(entropy) {
    // Assuming a modern cluster capable of 100 Billion guesses per second (1e11 guesses/sec)
    if (entropy <= 0) return "—";
    const guesses = Math.pow(2, entropy - 1);
    const seconds = guesses / 1e11;

    if (seconds < 1) return "Instant (under 1 second)";
    if (seconds < 60) return `${Math.round(seconds)} seconds`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
    if (seconds < 31536000) return `${Math.round(seconds / 86400)} days`;
    if (seconds < 3153600000) return `${Math.round(seconds / 31536000)} years`;
    if (seconds < 3153600000000)
      return `${(seconds / 31536000).toLocaleString(undefined, { maximumFractionDigits: 0 })} years`;
    return "Centuries (Unbreakable by supercomputers)";
  }

  function evaluatePasswordStrength() {
    const password = userPasswordInput.value;
    const confirm = confirmPasswordInput.value;
    const entropy = calculateEntropy(password);

    // Update Entropy Display
    entropyValEl.textContent = `${entropy} bits`;
    crackTimeValEl.textContent = getCrackTime(entropy);

    // Bars & Rating
    const bars = strengthBarsEl.children;
    for (let i = 0; i < bars.length; i++) {
      bars[i].className = "strength-bar";
    }

    strengthValEl.className = "strength-val";

    if (!password) {
      strengthValEl.textContent = "None";
      strengthValEl.classList.add("strength-none");
    } else if (entropy < 30 || password.length < 5) {
      strengthValEl.textContent = "Weak";
      strengthValEl.classList.add("strength-weak");
      bars[0].classList.add("fill-weak");
    } else if (entropy < 48 || password.length < 8) {
      strengthValEl.textContent = "Fair";
      strengthValEl.classList.add("strength-fair");
      bars[0].classList.add("fill-fair");
      bars[1].classList.add("fill-fair");
    } else if (entropy < 65 || password.length < 10) {
      strengthValEl.textContent = "Good";
      strengthValEl.classList.add("strength-good");
      bars[0].classList.add("fill-good");
      bars[1].classList.add("fill-good");
      bars[2].classList.add("fill-good");
    } else if (entropy < 90) {
      strengthValEl.textContent = "Strong";
      strengthValEl.classList.add("strength-strong");
      for (let i = 0; i < 4; i++) bars[i].classList.add("fill-strong");
    } else {
      strengthValEl.textContent = "Invulnerable";
      strengthValEl.classList.add("strength-invulnerable");
      for (let i = 0; i < 4; i++) bars[i].classList.add("fill-invulnerable");
    }

    // Match validation
    if (!confirm) {
      matchTagEl.textContent = "";
      matchTagEl.className = "match-tag";
    } else if (password === confirm) {
      matchTagEl.textContent = "✓ Passwords Match";
      matchTagEl.className = "match-tag is-match";
    } else {
      matchTagEl.textContent = "✗ Passwords Do Not Match";
      matchTagEl.className = "match-tag is-mismatch";
    }

    updateShieldSummary();
  }

  // 1-Click Cryptographically Strong Password Generator
  function generateStrongPassword() {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*()_+~|}{[]:;?><=";
    const array = new Uint32Array(16);
    window.crypto.getRandomValues(array);
    let generated = "";
    for (let i = 0; i < 16; i++) {
      generated += chars[array[i] % chars.length];
    }

    userPasswordInput.value = generated;
    confirmPasswordInput.value = generated;

    // Show passwords temporarily so user sees what was generated
    userPasswordInput.type = "text";
    confirmPasswordInput.type = "text";
    updateEyeIcons(toggleUserPassBtn, true);
    updateEyeIcons(toggleConfirmPassBtn, true);

    evaluatePasswordStrength();

    // Copy to clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText(generated).then(
        () => showToast("Strong password generated & copied to clipboard!"),
        () => showToast("Strong password generated!"),
      );
    } else {
      showToast("Strong password generated!");
    }
  }

  // =============================================
  //  SHIELD STATUS & VALIDATION
  // =============================================
  function updateShieldSummary() {
    const password = userPasswordInput.value;
    const confirm = confirmPasswordInput.value;
    const isMatching = password && password === confirm;

    // Algorithm
    specAlgo.textContent =
      state.algorithm === "AES-256" ? "AES-256 Bit" : "RC4 128-Bit";

    // Open Protection
    if (!password) {
      specOpen.textContent = "Pending Password";
      specOpen.style.color = "var(--text-3)";
      shieldStatus.textContent = "Password Not Set";
      shieldStatus.className = "shield-status";
      shieldIcon.classList.remove("is-secure");
    } else if (!isMatching) {
      specOpen.textContent = "Passwords Mismatch";
      specOpen.style.color = "var(--danger-red)";
      shieldStatus.textContent = "Passwords Mismatch";
      shieldStatus.className = "shield-status";
      shieldIcon.classList.remove("is-secure");
    } else {
      specOpen.textContent = "🔒 Password Protected";
      specOpen.style.color = "var(--shield-green)";
      shieldStatus.textContent = "Ready to Encrypt";
      shieldStatus.className = "shield-status is-ready";
      shieldIcon.classList.add("is-secure");
    }

    // Fully Secured Mode Defaults
    if (specSecurityMode) {
      specSecurityMode.textContent = "Fully Secured 🛡️";
      specSecurityMode.style.color = "var(--shield-green)";
    }
    if (specPrint) {
      specPrint.textContent = "Blocked 🚫";
      specPrint.style.color = "var(--danger-red)";
    }
    if (specCopy) {
      specCopy.textContent = "Blocked 🚫";
      specCopy.style.color = "var(--danger-red)";
    }
    if (specModify) {
      specModify.textContent = "Blocked 🚫";
      specModify.style.color = "var(--danger-red)";
    }

    // Update Action Bar button
    if (isMatching) {
      encryptBtn.disabled = false;
      actionBarStatus.textContent = `Ready to encrypt ${state.file ? state.file.name : "document"} with ${state.algorithm}`;
      actionBarStatus.style.color = "var(--shield-green)";
    } else if (password && !isMatching) {
      encryptBtn.disabled = true;
      actionBarStatus.textContent =
        "Passwords do not match. Please re-enter confirm password.";
      actionBarStatus.style.color = "var(--danger-red)";
    } else {
      encryptBtn.disabled = true;
      actionBarStatus.textContent =
        "Enter a password above to encrypt your PDF";
      actionBarStatus.style.color = "var(--text-2)";
    }
  }

  // =============================================
  //  ENCRYPTION ENGINE
  // =============================================
  async function encryptDocument() {
    const password = userPasswordInput.value;
    const confirm = confirmPasswordInput.value;

    if (!state.arrayBuffer) {
      showToast("No document loaded");
      return;
    }

    if (!password) {
      showToast("Please enter an open password");
      userPasswordInput.focus();
      return;
    }

    if (password !== confirm) {
      showToast("Passwords do not match");
      confirmPasswordInput.focus();
      return;
    }

    if (!window.PDFEncrypt || !window.PDFEncrypt.encryptPDF) {
      alert(
        "Encryption engine is still loading. Please try again in a moment.",
      );
      return;
    }

    const encryptStartTime = performance.now();

    try {
      encryptBtn.disabled = true;
      encryptBtn.innerHTML = `
        <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        <span>Encrypting Document…</span>
      `;

      showToast("Applying military-grade AES-256 encryption…");

      const rawBytes = new Uint8Array(state.arrayBuffer);

      // Fully Secured Mode: All permissions strictly locked down
      const encryptOptions = {
        algorithm: state.algorithm || "AES-256",
        ownerPassword: password,
        allowPrinting: false,
        allowCopying: false,
        allowModifying: false,
        allowAnnotating: false,
        allowFillingForms: false,
      };

      // Perform client-side encryption
      const encryptedBytes = await window.PDFEncrypt.encryptPDF(
        rawBytes,
        password,
        encryptOptions,
      );

      const durationMs = Math.max(
        1,
        Math.round(performance.now() - encryptStartTime),
      );

      const baseName = state.file.name.replace(/\.[^/.]+$/, "");
      const outputName = `${baseName}_locked.pdf`;

      const blob = new Blob([encryptedBytes], { type: "application/pdf" });
      state.encryptedBlob = blob;
      state.encryptedFileName = outputName;

      // Trigger Universal Legacy Popup (with conversion timer, Important Notice, Trustpilot, Bookmark)
      if (
        window.PDFMasterPopup &&
        typeof window.PDFMasterPopup.show === "function"
      ) {
        window.PDFMasterPopup.show({
          title: "Thank You for Using PDF<span>Master</span>!",
          desc: `Your document has been locked and secured with military-grade <strong>${state.algorithm}</strong> encryption in <strong>Fully Secured Mode</strong>. Processed 100% locally with <strong>zero server uploads</strong>.`,
          fileName: outputName,
          fileType: "pdf",
          fileDetails: `${state.pageCount} pages • ${formatBytes(blob.size)} • 100% Private`,
          downloadText: "Download Locked PDF",
          toolName: "Protect PDF",
          verb: "Locked",
          durationMs: durationMs,
          blob: blob,
          notice: `⚠️ <strong>Important Notice:</strong> PDFMaster processes encryption entirely in your browser and never stores your passwords on any server. If you lose or forget this password, the encrypted PDF cannot be unlocked or recovered! Please save your password securely.`,
          showSecondary: true,
          secondaryText: "Protect Another File",
          onSecondary: () => {
            resetWorkspace();
          },
        });
      } else {
        downloadEncryptedFile();
        showToast("PDF encrypted & downloaded successfully!");
      }
    } catch (err) {
      console.error("Encryption failed:", err);
      if (err.name === "AlreadyEncryptedError") {
        alert(
          "This PDF is already encrypted with a password and cannot be encrypted again.",
        );
      } else {
        alert("An error occurred during encryption: " + err.message);
      }
    } finally {
      encryptBtn.disabled = false;
      encryptBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span>Encrypt &amp; Download PDF</span>
      `;
    }
  }

  function downloadEncryptedFile() {
    if (!state.encryptedBlob) return;
    const url = URL.createObjectURL(state.encryptedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = state.encryptedFileName || "document_locked.pdf";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 150);
  }

  // =============================================
  //  UI INTERACTION HELPERS
  // =============================================
  function updateEyeIcons(btn, isVisible) {
    const showIcon = btn.querySelector(".eye-icon-show");
    const hideIcon = btn.querySelector(".eye-icon-hide");
    if (showIcon && hideIcon) {
      showIcon.style.display = isVisible ? "none" : "block";
      hideIcon.style.display = isVisible ? "block" : "none";
    }
  }

  function toggleVisibility(input, btn) {
    if (input.type === "password") {
      input.type = "text";
      updateEyeIcons(btn, true);
    } else {
      input.type = "password";
      updateEyeIcons(btn, false);
    }
  }

  function resetWorkspace() {
    state.file = null;
    state.arrayBuffer = null;
    state.pdfDoc = null;
    state.pageCount = 0;
    state.encryptedBlob = null;
    state.encryptedFileName = "";
    userPasswordInput.value = "";
    confirmPasswordInput.value = "";
    fileInput.value = "";
    workspace.style.display = "none";
    uploadZone.style.display = "block";
    if (
      window.PDFMasterPopup &&
      typeof window.PDFMasterPopup.close === "function"
    ) {
      window.PDFMasterPopup.close();
    }
  }

  // =============================================
  //  EVENT LISTENERS INITIALIZATION
  // =============================================
  function initEvents() {
    // Mobile Hamburger & Side Menu
    if (hamburgerBtn && sideMenu && sideOverlay && closeMenuBtn) {
      hamburgerBtn.addEventListener("click", () => {
        sideMenu.classList.add("active");
        sideOverlay.classList.add("active");
      });
      closeMenuBtn.addEventListener("click", () => {
        sideMenu.classList.remove("active");
        sideOverlay.classList.remove("active");
      });
      sideOverlay.addEventListener("click", () => {
        sideMenu.classList.remove("active");
        sideOverlay.classList.remove("active");
      });
    }

    // Back to top
    if (backTop) {
      window.addEventListener("scroll", () => {
        if (window.scrollY > 400) backTop.classList.add("active");
        else backTop.classList.remove("active");
      });
      backTop.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    // Dropzone Click
    uploadZone.addEventListener("click", () => fileInput.click());
    browseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    // File Input Change
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelection(e.target.files[0]);
      }
    });

    // Drag and Drop
    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("is-dragover");
    });
    uploadZone.addEventListener("dragleave", () => {
      uploadZone.classList.remove("is-dragover");
    });
    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("is-dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelection(e.dataTransfer.files[0]);
      }
    });

    // Change File Button
    changeFileBtn.addEventListener("click", resetWorkspace);

    // Password Inputs
    userPasswordInput.addEventListener("input", () => {
      evaluatePasswordStrength();
    });
    confirmPasswordInput.addEventListener("input", () => {
      evaluatePasswordStrength();
    });

    // Eye toggles
    toggleUserPassBtn.addEventListener("click", () =>
      toggleVisibility(userPasswordInput, toggleUserPassBtn),
    );
    toggleConfirmPassBtn.addEventListener("click", () =>
      toggleVisibility(confirmPasswordInput, toggleConfirmPassBtn),
    );

    // Generator
    genPassBtn.addEventListener("click", () => {
      generateStrongPassword();
    });

    // Algorithm Selector
    algoAesCard.addEventListener("click", () => {
      state.algorithm = "AES-256";
      algoAesCard.classList.add("is-active");
      algoRc4Card.classList.remove("is-active");
      algoAesCard.querySelector("input").checked = true;
      updateShieldSummary();
    });

    algoRc4Card.addEventListener("click", () => {
      state.algorithm = "RC4";
      algoRc4Card.classList.add("is-active");
      algoAesCard.classList.remove("is-active");
      algoRc4Card.querySelector("input").checked = true;
      updateShieldSummary();
    });

    // Action button
    encryptBtn.addEventListener("click", encryptDocument);
  }

  // =============================================
  //  ENTRY POINT
  // =============================================
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initEvents();
  });
})();
