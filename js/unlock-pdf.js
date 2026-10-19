/**
 * PDFMaster - Unlock PDF (PDF Password Remover & Restrictions Unlocker)
 * Production Grade · Military-Grade AES-256 & RC4 Decryption · WebAssembly QPDF Engine · 100% In-Browser & Private
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
  const fileStatusBadge = document.getElementById("fileStatusBadge");

  // Diagnostic Matrix Elements
  const diagAlgo = document.getElementById("diagAlgo");
  const diagLockType = document.getElementById("diagLockType");
  const diagStandard = document.getElementById("diagStandard");
  const permPrint = document.getElementById("permPrint");
  const permCopy = document.getElementById("permCopy");
  const permModify = document.getElementById("permModify");

  // Panels & Notices
  const userPasswordCard = document.getElementById("userPasswordCard");
  const ownerNoticeCard = document.getElementById("ownerNoticeCard");
  const unencryptedNoticeCard = document.getElementById(
    "unencryptedNoticeCard",
  );

  // Password Input & Eye Toggle
  const unlockPasswordInput = document.getElementById("unlockPassword");
  const togglePassBtn = document.getElementById("togglePassBtn");
  const passErrorHint = document.getElementById("passErrorHint");

  // Shield Elements
  const shieldIcon = document.getElementById("shieldIcon");
  const shieldStatus = document.getElementById("shieldStatus");
  const specAlgo = document.getElementById("specAlgo");
  const specLock = document.getElementById("specLock");
  const specPrint = document.getElementById("specPrint");
  const specCopy = document.getElementById("specCopy");
  const specEngine = document.getElementById("specEngine");

  // Action Bar
  const actionBarStatus = document.getElementById("actionBarStatus");
  const unlockBtn = document.getElementById("unlockBtn");
  const unlockBtnText = document.getElementById("unlockBtnText");

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
    rawBytes: null,
    preDecryptedBytes: null,
    pdfDoc: null,
    pageCount: 0,
    lockStatus: "unknown", // "user_locked" | "owner_restricted" | "unencrypted"
    algorithm: "Standard AES-256",
    revision: 6,
    version: 5,
    unlockedBlob: null,
    unlockedFileName: "",
    isProcessing: false,
  };

  /**
   * Safely returns a fresh, cloned Uint8Array of the document bytes.
   * If a Web Worker previously detached the buffer, it automatically
   * re-reads a fresh buffer from the File object.
   */
  async function getDocumentBytes() {
    try {
      if (
        state.rawBytes &&
        state.rawBytes.buffer &&
        state.rawBytes.buffer.byteLength > 0
      ) {
        return state.rawBytes.slice();
      }
    } catch (e) {}

    if (state.file) {
      const buffer = await state.file.arrayBuffer();
      state.rawBytes = new Uint8Array(buffer);
      return state.rawBytes.slice();
    }
    return null;
  }

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
    const savedTheme = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(savedTheme);
    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        const currentTheme =
          document.documentElement.getAttribute("data-theme") || "light";
        applyTheme(currentTheme === "dark" ? "light" : "dark");
      });
    }
  }

  // =============================================
  //  TOAST UTILITY
  // =============================================
  function showToast(message, type = "normal") {
    if (!toastEl || !toastMsg) return;
    if (toastTimer) clearTimeout(toastTimer);

    toastMsg.textContent = message;
    toastEl.className = "toast show";
    if (type === "error") toastEl.classList.add("toast-error");
    if (type === "success") toastEl.classList.add("toast-success");

    toastTimer = setTimeout(() => {
      toastEl.className = "toast";
    }, 3800);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // =============================================
  //  QPDF WASM ENGINE (SINGLETON)
  // =============================================
  let qpdfInstancePromise = null;

  async function getQPDF() {
    if (!qpdfInstancePromise) {
      qpdfInstancePromise = (async () => {
        const createModule = window.createQPDFModule || window.Module;
        if (!createModule) {
          throw new Error(
            "QPDF WebAssembly module is not available on the window.",
          );
        }
        return await createModule({
          locateFile: (path) => {
            if (path.endsWith(".wasm")) {
              return "/assets/vendor/qpdf.wasm";
            }
            return path;
          },
          noInitialRun: true,
        });
      })();
    }
    return await qpdfInstancePromise;
  }

  // Preload QPDF WASM silently on page load for zero-lag decryption
  function prewarmQPDF() {
    getQPDF().catch((err) => {
      console.warn("Silent QPDF prewarm:", err);
    });
  }

  // =============================================
  //  PDF ENCRYPTION INSPECTION & DIAGNOSTICS
  // =============================================
  function parsePdfEncryptDictionary(bytes) {
    try {
      const latin1 =
        new TextDecoder("latin1").decode(
          bytes.subarray(0, Math.min(bytes.length, 12000)),
        ) +
        new TextDecoder("latin1").decode(
          bytes.subarray(Math.max(0, bytes.length - 12000)),
        );

      const hasEncryptMatch = latin1.match(/\/Encrypt\s+(\d+)\s+(\d+)\s+R/);
      if (!hasEncryptMatch) {
        if (latin1.includes("/Encrypt")) {
          return {
            isEncrypted: true,
            algorithm: "Standard PDF Encryption",
            r: 4,
            v: 4,
          };
        }
        return { isEncrypted: false, algorithm: "None", r: 0, v: 0 };
      }

      const objNum = hasEncryptMatch[1];
      const genNum = hasEncryptMatch[2];
      const objRegex = new RegExp(
        objNum + "\\s+" + genNum + "\\s+obj([\\s\\S]*?)endobj",
      );
      const objMatch = latin1.match(objRegex);
      const dict = objMatch ? objMatch[1] : latin1;

      let r = 4;
      let v = 4;
      const rMatch = dict.match(/\/R\s+(\d+)/);
      const vMatch = dict.match(/\/V\s+(\d+)/);
      if (rMatch) r = parseInt(rMatch[1], 10);
      if (vMatch) v = parseInt(vMatch[1], 10);

      let algorithm = "Standard AES-128";
      if (
        r === 6 ||
        r === 5 ||
        dict.includes("AESV3") ||
        dict.includes("/AES-256")
      ) {
        algorithm = "Military-Grade AES-256 (ISO 32000-2)";
      } else if (r === 4 || dict.includes("AESV2") || dict.includes("/AES")) {
        algorithm = "AES-128 Standard";
      } else if (r <= 3) {
        algorithm = "Standard RC4 128-Bit";
      }

      return { isEncrypted: true, algorithm, r, v };
    } catch (e) {
      console.warn("Encrypt dict inspection:", e);
      return { isEncrypted: false, algorithm: "Unknown", r: 0, v: 0 };
    }
  }

  // =============================================
  //  FILE SELECTION & ANALYSIS
  // =============================================
  async function handleFileSelection(file) {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Please select a valid PDF file.", "error");
      return;
    }

    state.file = file;
    state.rawBytes = null;
    state.preDecryptedBytes = null;
    fileNameEl.textContent = file.name;
    fileSizeEl.innerHTML = `<span>${formatBytes(file.size)}</span>`;

    // Show workspace, hide upload dropzone
    uploadZone.style.display = "none";
    workspace.style.display = "block";
    actionBarStatus.textContent = "Analyzing encryption and document security…";
    unlockBtn.disabled = true;

    try {
      const rawBytes = await getDocumentBytes();
      if (!rawBytes) {
        showToast("Failed to read PDF file.", "error");
        return;
      }

      // Parse Encryption Dictionary
      const encInfo = parsePdfEncryptDictionary(rawBytes);
      state.algorithm = encInfo.algorithm;
      state.revision = encInfo.r;
      state.version = encInfo.v;

      // Initialize QPDF WASM to probe lock type
      const qpdf = await getQPDF();

      if (!encInfo.isEncrypted) {
        // Document has NO /Encrypt key
        setupUnencryptedState();
      } else {
        // Check if openable with blank user password (Owner Restrictions Only)
        const probeInput = "/probe_in_" + Date.now() + ".pdf";
        const probeOutput = "/probe_out_" + Date.now() + ".pdf";
        qpdf.FS.writeFile(probeInput, rawBytes);

        // Attempt decrypt with empty password ''
        const exitCode = qpdf.callMain([
          "--allow-weak-crypto",
          "--password=",
          probeInput,
          "--decrypt",
          probeOutput,
        ]);

        let decryptedWithEmptyPass = false;
        try {
          qpdf.FS.stat(probeOutput);
          decryptedWithEmptyPass = true;
          // Pre-save the successfully decrypted bytes for instant unlock
          state.preDecryptedBytes = qpdf.FS.readFile(probeOutput);
          qpdf.FS.unlink(probeOutput);
        } catch (e) {}
        try {
          qpdf.FS.unlink(probeInput);
        } catch (e) {}

        if (exitCode === 0 && decryptedWithEmptyPass) {
          setupOwnerRestrictedState();
        } else {
          setupUserLockedState();
        }
      }

      // Try loading with PDF.js for page count if owner-restricted or unencrypted
      if (state.lockStatus !== "user_locked") {
        try {
          // Pass a separate cloned slice so worker transfer NEVER detaches state.rawBytes
          const bytesForViewer = await getDocumentBytes();
          const loadingTask = window.pdfjsLib.getDocument({
            data: bytesForViewer,
          });
          const pdfDoc = await loadingTask.promise;
          state.pageCount = pdfDoc.numPages;
          if (totalCountEl) totalCountEl.textContent = state.pageCount;
        } catch (e) {
          // If error loading preview, ignore
        }
      }
    } catch (err) {
      console.error("Document analysis error:", err);
      showToast("Error inspecting document: " + err.message, "error");
    }
  }

  // =============================================
  //  UI STATE CONFIGURATORS
  // =============================================
  function setupUserLockedState() {
    state.lockStatus = "user_locked";

    // File info badge
    if (fileStatusBadge) {
      fileStatusBadge.className = "status-badge is-locked";
      fileStatusBadge.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span>Password Locked</span>
      `;
    }

    // Diagnostics Matrix
    diagAlgo.textContent = state.algorithm;
    diagLockType.textContent = "Open Password Required";
    diagStandard.textContent = `Revision ${state.revision} (V${state.version})`;
    permPrint.className = "permission-pill is-restricted";
    permPrint.innerHTML = `<span>✕</span> Printing: Locked`;
    permCopy.className = "permission-pill is-restricted";
    permCopy.innerHTML = `<span>✕</span> Text Copy: Locked`;
    permModify.className = "permission-pill is-restricted";
    permModify.innerHTML = `<span>✕</span> Editing: Locked`;

    // Cards Visibility
    userPasswordCard.style.display = "block";
    ownerNoticeCard.style.display = "none";
    unencryptedNoticeCard.style.display = "none";

    // Shield
    shieldIcon.className = "shield-icon";
    shieldStatus.className = "shield-status";
    shieldStatus.textContent = "Locked Document";
    specAlgo.textContent = state.algorithm;
    specLock.textContent = "User Open Password";
    specPrint.textContent = "Restricted";
    specCopy.textContent = "Restricted";
    specEngine.textContent = "WebAssembly QPDF";

    // Action Bar
    unlockBtn.disabled = false;
    unlockBtnText.textContent = "Unlock & Download PDF";
    actionBarStatus.textContent =
      "Enter the document password above to decrypt and unlock";
    actionBarStatus.style.color = "var(--text-2)";

    unlockPasswordInput.value = "";
    unlockPasswordInput.focus();
  }

  function setupOwnerRestrictedState() {
    state.lockStatus = "owner_restricted";

    // File info badge
    if (fileStatusBadge) {
      fileStatusBadge.className = "status-badge is-owner-restricted";
      fileStatusBadge.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
        <span>Permissions Locked</span>
      `;
    }

    // Diagnostics Matrix
    diagAlgo.textContent = state.algorithm;
    diagLockType.textContent = "Owner Restrictions Only";
    diagStandard.textContent = "No Open Password Needed";
    permPrint.className = "permission-pill is-restricted";
    permPrint.innerHTML = `<span>✕</span> Printing: Restricted`;
    permCopy.className = "permission-pill is-restricted";
    permCopy.innerHTML = `<span>✕</span> Text Copy: Restricted`;
    permModify.className = "permission-pill is-restricted";
    permModify.innerHTML = `<span>✕</span> Editing: Restricted`;

    // Cards Visibility
    userPasswordCard.style.display = "none";
    ownerNoticeCard.style.display = "block";
    unencryptedNoticeCard.style.display = "none";

    // Shield
    shieldIcon.className = "shield-icon";
    shieldStatus.className = "shield-status is-owner";
    shieldStatus.textContent = "Permissions Locked";
    specAlgo.textContent = state.algorithm;
    specLock.textContent = "Owner Restrictions Only (No Password Needed)";
    specPrint.textContent = "Restricted";
    specCopy.textContent = "Restricted";
    specEngine.textContent = "1-Click WebAssembly Decrypt";

    // Action Bar
    unlockBtn.disabled = false;
    unlockBtnText.textContent = "Strip Restrictions & Download PDF";
    actionBarStatus.textContent =
      "No password required! Click below to permanently strip all restrictions.";
    actionBarStatus.style.color = "var(--shield-green)";
  }

  function setupUnencryptedState() {
    state.lockStatus = "unencrypted";

    // File info badge
    if (fileStatusBadge) {
      fileStatusBadge.className = "status-badge is-unencrypted";
      fileStatusBadge.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0"></path>
        </svg>
        <span>Completely Unlocked</span>
      `;
    }

    // Diagnostics Matrix
    diagAlgo.textContent = "None (Plain PDF)";
    diagLockType.textContent = "Unrestricted";
    diagStandard.textContent = "Standard PDF";
    permPrint.className = "permission-pill is-allowed";
    permPrint.innerHTML = `<span>✓</span> Printing: Allowed`;
    permCopy.className = "permission-pill is-allowed";
    permCopy.innerHTML = `<span>✓</span> Text Copy: Allowed`;
    permModify.className = "permission-pill is-allowed";
    permModify.innerHTML = `<span>✓</span> Editing: Allowed`;

    // Cards Visibility
    userPasswordCard.style.display = "none";
    ownerNoticeCard.style.display = "none";
    unencryptedNoticeCard.style.display = "block";

    // Shield
    shieldIcon.className = "shield-icon is-unlocked";
    shieldStatus.className = "shield-status is-ready";
    shieldStatus.textContent = "Completely Unlocked";
    specAlgo.textContent = "None (Unencrypted)";
    specLock.textContent = "No Passwords Active";
    specPrint.textContent = "Allowed";
    specCopy.textContent = "Allowed";
    specEngine.textContent = "Already Unlocked";

    // Action Bar
    unlockBtn.disabled = true;
    unlockBtnText.textContent = "Document is Already Unlocked";
    actionBarStatus.textContent =
      "This file is not protected with a password. It's already completely open!";
    actionBarStatus.style.color = "var(--shield-green)";
  }

  // =============================================
  //  DECRYPTION ENGINE (QPDF WASM)
  // =============================================
  async function unlockDocument() {
    if (state.isProcessing) return;

    if (state.lockStatus === "unencrypted") {
      showToast("This document is already unencrypted!", "normal");
      return;
    }

    const password = unlockPasswordInput.value;
    if (state.lockStatus === "user_locked" && !password) {
      showToast("Please enter the document password", "error");
      unlockPasswordInput.focus();
      return;
    }

    const rawBytes = await getDocumentBytes();
    if (!rawBytes || rawBytes.length === 0) {
      showToast("No document loaded", "error");
      return;
    }

    const unlockStartTime = performance.now();
    state.isProcessing = true;
    unlockBtn.disabled = true;
    unlockBtn.innerHTML = `
      <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
      <span>Decrypting Document…</span>
    `;

    if (passErrorHint) passErrorHint.style.display = "none";
    showToast("Decrypting and stripping restrictions locally in browser…");

    try {
      let success = false;
      let unlockedBytes = null;

      // If owner-restricted and we already pre-decrypted in the probe step, use it immediately!
      if (state.lockStatus === "owner_restricted" && state.preDecryptedBytes) {
        unlockedBytes = state.preDecryptedBytes;
        success = true;
      } else {
        const qpdf = await getQPDF();
        const timestamp = Date.now();
        const inputPath = `/input_${timestamp}.pdf`;
        const outputPath = `/output_${timestamp}.pdf`;

        // Write protected PDF to WASM memory virtual file system
        qpdf.FS.writeFile(inputPath, rawBytes);

        // Construct arguments
        const args = ["--allow-weak-crypto"];
        if (state.lockStatus === "user_locked") {
          args.push(`--password=${password}`);
        } else {
          // Owner restricted only
          args.push("--password=");
        }
        args.push(inputPath, "--decrypt", outputPath);

        // Execute QPDF native WASM binary
        const exitCode = qpdf.callMain(args);

        try {
          qpdf.FS.stat(outputPath);
          unlockedBytes = qpdf.FS.readFile(outputPath);
          success = true;
        } catch (e) {
          success = false;
        }

        // Memory cleanup: instantly unlink files from MEMFS to preserve low-RAM architecture
        try {
          qpdf.FS.unlink(inputPath);
        } catch (e) {}
        try {
          if (success) qpdf.FS.unlink(outputPath);
        } catch (e) {}

        if (exitCode !== 0 || !success || !unlockedBytes) {
          // Decryption failed (typically invalid password)
          console.warn("QPDF decryption failed with exitCode:", exitCode);
          if (passErrorHint) {
            passErrorHint.style.display = "block";
            passErrorHint.textContent =
              "Incorrect password. Please verify and try again.";
          }
          showToast(
            "Incorrect password. Please verify and try again.",
            "error",
          );
          unlockPasswordInput.focus();
          unlockPasswordInput.select();
          return;
        }
      }

      // Decryption succeeded!
      const durationMs = Math.max(
        1,
        Math.round(performance.now() - unlockStartTime),
      );

      const baseName = state.file.name.replace(/\.[^/.]+$/, "");
      const outputName = `${baseName}_unlocked.pdf`;

      const blob = new Blob([unlockedBytes], { type: "application/pdf" });
      state.unlockedBlob = blob;
      state.unlockedFileName = outputName;

      // Update Shield UI to fully unlocked state
      shieldIcon.className = "shield-icon is-unlocked";
      shieldIcon.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
          <polyline points="9 16 12 19 16 14"></polyline>
        </svg>
      `;
      shieldStatus.className = "shield-status is-ready";
      shieldStatus.textContent = "Decrypted & Unlocked";
      specLock.textContent = "Permanently Removed";
      specPrint.textContent = "Allowed";
      specCopy.textContent = "Allowed";

      // Count pages if not already known
      if (state.pageCount === 0 && window.pdfjsLib) {
        try {
          const doc = await window.pdfjsLib.getDocument({
            data: unlockedBytes,
          }).promise;
          state.pageCount = doc.numPages;
        } catch (e) {}
      }

      // Trigger Universal Popup
      if (
        window.PDFMasterPopup &&
        typeof window.PDFMasterPopup.show === "function"
      ) {
        window.PDFMasterPopup.show({
          title: "Thank You for Using PDF<span>Master</span>!",
          desc: `Your PDF document has been decrypted and completely unlocked. Passwords and all printing/copying restrictions have been permanently stripped. Processed 100% locally with <strong>zero server uploads</strong>.`,
          fileName: outputName,
          fileType: "pdf",
          fileDetails: `${state.pageCount > 0 ? state.pageCount + " pages • " : ""}${formatBytes(blob.size)} • 100% Private`,
          downloadText: "Download Unlocked PDF",
          toolName: "Unlock PDF",
          verb: "Unlocked",
          durationMs: durationMs,
          blob: blob,
          showSecondary: true,
          secondaryText: "Unlock Another File",
          onSecondary: () => {
            resetWorkspace();
          },
        });
      } else {
        downloadUnlockedFile();
        showToast("PDF unlocked & downloaded successfully!", "success");
      }
    } catch (err) {
      console.error("Decryption fatal error:", err);
      showToast("Decryption error: " + err.message, "error");
    } finally {
      state.isProcessing = false;
      unlockBtn.disabled = false;
      unlockBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
        </svg>
        <span id="unlockBtnText">${state.lockStatus === "owner_restricted" ? "Strip Restrictions & Download PDF" : "Unlock & Download PDF"}</span>
      `;
    }
  }

  function downloadUnlockedFile() {
    if (!state.unlockedBlob) return;
    const url = URL.createObjectURL(state.unlockedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = state.unlockedFileName || "document_unlocked.pdf";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 150);
  }

  // =============================================
  //  WORKSPACE RESET
  // =============================================
  function resetWorkspace() {
    state.file = null;
    state.rawBytes = null;
    state.preDecryptedBytes = null;
    state.pdfDoc = null;
    state.pageCount = 0;
    state.lockStatus = "unknown";
    state.unlockedBlob = null;
    state.unlockedFileName = "";
    state.isProcessing = false;

    if (unlockPasswordInput) unlockPasswordInput.value = "";
    if (fileInput) fileInput.value = "";
    if (passErrorHint) passErrorHint.style.display = "none";

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
  //  UI INTERACTION HELPERS
  // =============================================
  function toggleVisibility(input, btn) {
    const showIcon = btn.querySelector(".eye-icon-show");
    const hideIcon = btn.querySelector(".eye-icon-hide");
    if (input.type === "password") {
      input.type = "text";
      if (showIcon) showIcon.style.display = "none";
      if (hideIcon) hideIcon.style.display = "block";
    } else {
      input.type = "password";
      if (showIcon) showIcon.style.display = "block";
      if (hideIcon) hideIcon.style.display = "none";
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
        const isPastThreshold = window.scrollY > 400;
        backTop.classList.toggle("active", isPastThreshold);
        backTop.classList.toggle("visible", isPastThreshold);
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

    // Eye toggle
    if (togglePassBtn && unlockPasswordInput) {
      togglePassBtn.addEventListener("click", () =>
        toggleVisibility(unlockPasswordInput, togglePassBtn),
      );
    }

    // Enter key inside password input
    if (unlockPasswordInput) {
      unlockPasswordInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          unlockDocument();
        }
      });
      unlockPasswordInput.addEventListener("input", () => {
        if (passErrorHint) passErrorHint.style.display = "none";
      });
    }

    // Action button
    unlockBtn.addEventListener("click", unlockDocument);
  }

  // =============================================
  //  ENTRY POINT
  // =============================================
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initEvents();
    prewarmQPDF();
  });
})();
