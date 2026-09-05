/**
 * PDFMaster - Universal Thank You & Download Popup Modal
 * -------------------------------------------------------
 * Universal JavaScript module for all PDFMaster tools.
 * When processing completes on any tool page, this module provides
 * an elegant modal featuring a prominent download button, file details,
 * and a thank-you message for using the platform.
 */

(function () {
  "use strict";

  let modalOverlay = null;
  let currentOptions = {};
  let currentObjectUrl = null;

  const ICONS = {
    pdf: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
    zip: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
    image: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`
  };

  /**
   * Auto-inject stylesheet if not already present
   */
  function ensureStyles() {
    if (document.getElementById("pdfm-universal-popup-styles")) return;
    const link = document.createElement("link");
    link.id = "pdfm-universal-popup-styles";
    link.rel = "stylesheet";
    link.href = "/css/universal-popup.css";
    document.head.appendChild(link);
  }

  /**
   * Helper to format file sizes
   */
  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Load Trustpilot script and initialize widget
   */
  function ensureTrustpilot() {
    if (!document.getElementById("trustpilot-widget-script")) {
      const s = document.createElement("script");
      s.id = "trustpilot-widget-script";
      s.type = "text/javascript";
      s.src = "//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";
      s.async = true;
      s.onload = () => {
        if (window.Trustpilot) {
          const w = document.querySelector("#pdfmUniversalModal .trustpilot-widget");
          if (w) window.Trustpilot.loadFromElement(w, true);
        }
      };
      document.head.appendChild(s);
    } else if (window.Trustpilot) {
      const w = document.querySelector("#pdfmUniversalModal .trustpilot-widget");
      if (w) window.Trustpilot.loadFromElement(w, true);
    }
  }

  /**
   * Ensure modal element exists in DOM
   */
  function ensureModal() {
    ensureStyles();
    ensureTrustpilot();

    let overlay = document.getElementById("pdfmUniversalModal");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "pdfmUniversalModal";
      overlay.className = "pdfm-popup-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "pdfmPopupTitle");
      overlay.hidden = true;

      overlay.innerHTML = `
        <div class="pdfm-popup-box">
          <button type="button" class="pdfm-popup-close" id="pdfmPopupCloseBtn" aria-label="Close dialog">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div class="pdfm-popup-icon-wrap" aria-hidden="true">
            <div class="pdfm-popup-icon-glow"></div>
            <div class="pdfm-popup-icon-badge">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
          </div>

          <h2 class="pdfm-popup-title" id="pdfmPopupTitle">Thank You for Using PDFMaster!</h2>

          <p class="pdfm-popup-desc" id="pdfmPopupDesc">
            Your file has been processed successfully. Everything was processed right on your device for <strong>100% privacy</strong>.
          </p>

          <div class="pdfm-popup-file-card" id="pdfmPopupFileCard">
            <div class="pdfm-popup-file-icon" id="pdfmPopupFileIcon" aria-hidden="true">
              ${ICONS.pdf}
            </div>
            <div class="pdfm-popup-file-meta">
              <span class="pdfm-popup-file-name" id="pdfmPopupFileName">document.pdf</span>
              <span class="pdfm-popup-file-details" id="pdfmPopupFileDetails">Ready to download • 100% Private</span>
            </div>
          </div>

          <div class="pdfm-popup-btns">
            <button type="button" class="pdfm-popup-download-btn" id="pdfmPopupDownloadBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span id="pdfmPopupDownloadBtnText">Download File</span>
            </button>
            <button type="button" class="pdfm-popup-secondary-btn" id="pdfmPopupSecondaryBtn">
              Done
            </button>
          </div>

          <!-- TrustBox widget - Review Collector -->
          <div class="pdfm-popup-trustpilot">
            <div class="trustpilot-widget" data-locale="en-US" data-template-id="56278e9abfbbba0bdcd568bc" data-businessunit-id="6a9c668c9888d1e2a1ab5719" data-style-height="52px" data-style-width="100%" data-token="19a1dd93-f14d-4877-959e-6df0e8ca8ef0">
              <a href="https://www.trustpilot.com/review/pdfmaster.co.in" target="_blank" rel="noopener">Trustpilot</a>
            </div>
          </div>
          <!-- End TrustBox widget -->

          <p class="pdfm-popup-footer-note">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:3px; color:var(--primary, #e63946);">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Free & private client-side tool. No uploads. No accounts.
          </p>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    modalOverlay = overlay;
    bindEvents(overlay);
    return overlay;
  }

  let eventsBound = false;
  function bindEvents(overlay) {
    if (eventsBound || !overlay) return;
    eventsBound = true;

    // Close button
    const closeBtn = overlay.querySelector("#pdfmPopupCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    // Download button
    const dlBtn = overlay.querySelector("#pdfmPopupDownloadBtn");
    if (dlBtn) dlBtn.addEventListener("click", triggerDownload);

    // Secondary button
    const secBtn = overlay.querySelector("#pdfmPopupSecondaryBtn");
    if (secBtn) {
      secBtn.addEventListener("click", () => {
        closeModal();
        if (typeof currentOptions.onSecondary === "function") {
          currentOptions.onSecondary();
        }
      });
    }

    // Backdrop click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    // Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("show")) {
        closeModal();
      }
    });
  }

  /**
   * Trigger download of the active file
   */
  function triggerDownload() {
    if (!currentOptions.blob && !currentOptions.url && typeof currentOptions.onDownload !== "function") {
      return;
    }

    if (typeof currentOptions.onDownload === "function") {
      currentOptions.onDownload();
      updateDownloadSuccessState();
      return;
    }

    const fileName = currentOptions.fileName || "download";
    const isInApp = Boolean(
      currentOptions.isInApp ||
      /FBAN|FBAV|Instagram|Line|WhatsApp|MicroMessenger|Snapchat|Twitter|ByteDance|TikTok/i.test(navigator.userAgent)
    );

    try {
      if (isInApp) {
        if (currentOptions.url && currentOptions.url.startsWith("data:")) {
          window.open(`data:application/pdf;base64,${currentOptions.url.split(",")[1]}`, "_system");
        } else if (currentOptions.blob) {
          if (!currentObjectUrl) currentObjectUrl = URL.createObjectURL(currentOptions.blob);
          window.open(currentObjectUrl, "_system");
        } else if (currentOptions.url) {
          window.open(currentOptions.url, "_system");
        }
      } else {
        const a = document.createElement("a");
        if (currentOptions.blob) {
          if (!currentObjectUrl) currentObjectUrl = URL.createObjectURL(currentOptions.blob);
          a.href = currentObjectUrl;
        } else {
          a.href = currentOptions.url;
        }
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      updateDownloadSuccessState();

      // Toast notification if present
      if (typeof window.showToast === "function") {
        window.showToast(`"${fileName}" downloaded successfully!`, "success", 4000);
      }
    } catch (err) {
      console.error("PDFMasterPopup download failed:", err);
      if (currentOptions.url) window.open(currentOptions.url, "_blank");
    }
  }

  function updateDownloadSuccessState() {
    const btnText = document.getElementById("pdfmPopupDownloadBtnText");
    const btn = document.getElementById("pdfmPopupDownloadBtn");
    if (btnText) btnText.textContent = "Downloaded! (Click to Download Again)";
    if (btn) btn.style.boxShadow = "0 4px 14px rgba(22, 163, 74, 0.45)";

    // Sync any on-page download button
    if (currentOptions.syncButtonTextEl) {
      const el = typeof currentOptions.syncButtonTextEl === "string"
        ? document.getElementById(currentOptions.syncButtonTextEl)
        : currentOptions.syncButtonTextEl;
      if (el) el.textContent = "Downloaded! (Download Again)";
    }
    const legacyReadyText = document.getElementById("downloadReadyBtnText");
    if (legacyReadyText) legacyReadyText.textContent = "Downloaded! (Download Again)";
  }

  /**
   * Open the universal popup modal
   */
  function showModal(options = {}) {
    ensureModal();

    // Revoke previous URL if any
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }

    currentOptions = Object.assign({
      title: "Thank You for Using PDFMaster!",
      desc: "Your file has been processed successfully. Everything was processed right on your device for <strong>100% privacy</strong>.",
      fileName: "document.pdf",
      fileType: "pdf",
      fileDetails: null,
      downloadText: "Download PDF",
      secondaryText: "Done",
      showSecondary: true,
      blob: null,
      url: null,
      isInApp: false
    }, options);

    // Title
    const titleEl = document.getElementById("pdfmPopupTitle");
    if (titleEl) titleEl.textContent = currentOptions.title;

    // Desc
    const descEl = document.getElementById("pdfmPopupDesc");
    if (descEl) descEl.innerHTML = currentOptions.desc;

    // File name
    const fileNameEl = document.getElementById("pdfmPopupFileName");
    if (fileNameEl) fileNameEl.textContent = currentOptions.fileName;

    // File Icon
    const iconEl = document.getElementById("pdfmPopupFileIcon");
    if (iconEl) {
      const type = (currentOptions.fileType || "pdf").toLowerCase();
      iconEl.innerHTML = ICONS[type] || ICONS.pdf;
    }

    // File Details
    const detailsEl = document.getElementById("pdfmPopupFileDetails");
    if (detailsEl) {
      if (currentOptions.fileDetails) {
        detailsEl.textContent = currentOptions.fileDetails;
      } else {
        const sz = currentOptions.fileSize || (currentOptions.blob ? currentOptions.blob.size : 0);
        const sizeStr = sz ? ` • ${formatBytes(sz)}` : "";
        detailsEl.textContent = `Ready to download${sizeStr} • 100% Private`;
      }
    }

    // Download Button Text
    const dlBtnText = document.getElementById("pdfmPopupDownloadBtnText");
    if (dlBtnText) dlBtnText.textContent = currentOptions.downloadText;

    const dlBtn = document.getElementById("pdfmPopupDownloadBtn");
    if (dlBtn) dlBtn.style.boxShadow = "";

    // Secondary Button
    const secBtn = document.getElementById("pdfmPopupSecondaryBtn");
    if (secBtn) {
      secBtn.textContent = currentOptions.secondaryText;
      secBtn.style.display = currentOptions.showSecondary ? "inline-flex" : "none";
    }

    // Show modal
    modalOverlay.hidden = false;
    void modalOverlay.offsetWidth; // force reflow
    modalOverlay.classList.add("show");
    document.body.style.overflow = "hidden";
    ensureTrustpilot();

    // Focus download button
    setTimeout(() => {
      const btn = document.getElementById("pdfmPopupDownloadBtn");
      if (btn) btn.focus();
    }, 80);
  }

  /**
   * Close the universal popup modal
   */
  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove("show");
    document.body.style.overflow = "";
    setTimeout(() => {
      if (!modalOverlay.classList.contains("show")) {
        modalOverlay.hidden = true;
      }
    }, 280);

    if (typeof currentOptions.onClose === "function") {
      currentOptions.onClose();
    }
  }

  // Public API
  const API = {
    show: showModal,
    close: closeModal,
    download: triggerDownload,
    init: ensureModal,
  };

  window.PDFMasterPopup = API;
  // Aliases for compatibility
  window.PhotoToPdfPopup = API;
  window.showPhotoToPdfSuccessModal = showModal;
  window.showPDFMasterSuccessModal = showModal;

  // Event listener support
  window.addEventListener("pdfmaster:success-popup", (e) => {
    if (e.detail) showModal(e.detail);
  });

  // Ready handler
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureModal);
  } else {
    ensureModal();
  }
})();
