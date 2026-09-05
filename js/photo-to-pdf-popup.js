/**
 * PDFMaster - Photo to PDF Success & Download Modal
 * --------------------------------------------------
 * Separate JavaScript module linked with the Photo to PDF tool.
 * When the user converts photos, this module triggers a modal popup
 * featuring a prominent download button, file details, and a warm
 * thank-you message for using the platform.
 */

(function () {
  "use strict";

  if (window.PDFMasterPopup) {
    window.PhotoToPdfPopup = window.PDFMasterPopup;
    window.showPhotoToPdfSuccessModal = function (opts) {
      return window.PDFMasterPopup.show(opts);
    };
    return;
  }

  let modalEl = null;
  let currentFile = {
    pdfUrl: null,
    blob: null,
    fileName: "converted_document.pdf",
    pageCount: 1,
    isInApp: false,
  };

  /**
   * Helper to format file sizes nicely if blob is available
   */
  function formatSize(bytes) {
    if (!bytes || isNaN(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Ensure modal exists in DOM, or create dynamically
   */
  function ensureModal() {
    let el = document.getElementById("photoToPdfModal");
    if (!el) {
      el = document.createElement("div");
      el.id = "photoToPdfModal";
      el.className = "popup-modal-bg";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-labelledby", "popupModalTitle");
      el.hidden = true;

      el.innerHTML = `
        <div class="popup-modal-box">
          <button type="button" class="popup-modal-close" id="popupModalCloseBtn" aria-label="Close dialog">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div class="popup-icon-wrap" aria-hidden="true">
            <div class="popup-icon-glow"></div>
            <div class="popup-icon-badge">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
          </div>

          <h2 class="popup-title" id="popupModalTitle">Thank You for Using PDFMaster!</h2>

          <p class="popup-desc" id="popupModalDesc">
            Your images have been converted into a high-quality PDF.
            Everything was processed right on your device for <strong>100% privacy</strong>.
          </p>

          <div class="popup-file-card">
            <div class="popup-file-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </div>
            <div class="popup-file-meta">
              <span class="popup-file-name" id="popupFileName">document.pdf</span>
              <span class="popup-file-details" id="popupFileDetails">Ready to download • 100% Private</span>
            </div>
          </div>

          <div class="popup-modal-btns">
            <button type="button" class="btn-red popup-download-btn" id="popupDownloadBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span id="popupDownloadBtnText">Download PDF</span>
            </button>
            <button type="button" class="btn-outline popup-secondary-btn" id="popupConvertMoreBtn">
              Convert Another Image
            </button>
          </div>

          <p class="popup-footer-note">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:3px; color:var(--primary);">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Free & private client-side tool. No uploads. No accounts.
          </p>
        </div>
      `;
      document.body.appendChild(el);
    }
    modalEl = el;
    bindEvents(el);
    return el;
  }

  /**
   * Bind event listeners to modal elements
   */
  let eventsBound = false;
  function bindEvents(el) {
    if (eventsBound || !el) return;
    eventsBound = true;

    // Close button
    const closeBtn = el.querySelector("#popupModalCloseBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeModal);
    }

    // Download button
    const downloadBtn = el.querySelector("#popupDownloadBtn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", triggerDownload);
    }

    // Convert another button
    const convertMoreBtn = el.querySelector("#popupConvertMoreBtn");
    if (convertMoreBtn) {
      convertMoreBtn.addEventListener("click", () => {
        closeModal();
        const resetBtn = document.getElementById("resetBtn");
        if (resetBtn && !resetBtn.disabled) {
          resetBtn.click();
        } else if (resetBtn) {
          resetBtn.disabled = false;
          resetBtn.click();
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    // Click outside on backdrop
    el.addEventListener("click", (e) => {
      if (e.target === el) {
        closeModal();
      }
    });

    // Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.classList.contains("show")) {
        closeModal();
      }
    });
  }

  /**
   * Trigger the actual file download
   */
  function triggerDownload() {
    if (!currentFile.pdfUrl && !currentFile.blob) return;

    const fileName = currentFile.fileName || "converted_document.pdf";
    let objectUrl = null;

    try {
      if (currentFile.isInApp) {
        // In-app browsers often block synthetic download clicks
        if (currentFile.pdfUrl) {
          window.open(
            `data:application/pdf;base64,${currentFile.pdfUrl.split(",")[1]}`,
            "_system",
          );
        } else if (currentFile.blob) {
          objectUrl = URL.createObjectURL(currentFile.blob);
          window.open(objectUrl, "_system");
        }
      } else {
        // Standard browser download
        const a = document.createElement("a");
        if (currentFile.blob) {
          objectUrl = URL.createObjectURL(currentFile.blob);
          a.href = objectUrl;
        } else {
          a.href = currentFile.pdfUrl;
        }
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      // Update button state to give visual confirmation
      const btnText = document.getElementById("popupDownloadBtnText");
      const btn = document.getElementById("popupDownloadBtn");
      if (btnText && btn) {
        btnText.textContent = "Downloaded! (Click to Download Again)";
        btn.style.boxShadow = "0 4px 14px rgba(22, 163, 74, 0.4)";
      }

      // Sync the on-page legacy button if present
      const pageBtnText = document.getElementById("downloadReadyBtnText");
      if (pageBtnText) {
        pageBtnText.textContent = "Downloaded! (Download Again)";
      }

      // Show toast confirmation if showToast function exists
      if (typeof window.showToast === "function") {
        window.showToast(
          `"${fileName}" downloaded successfully!`,
          "success",
          4000,
        );
      }
    } catch (err) {
      console.error("Download failed:", err);
      // Fallback
      if (currentFile.pdfUrl) {
        window.open(currentFile.pdfUrl, "_blank");
      }
    } finally {
      if (objectUrl) {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      }
    }
  }

  /**
   * Open the popup modal with custom file details
   */
  function showModal(options = {}) {
    ensureModal();

    currentFile = {
      pdfUrl: options.pdfUrl || null,
      blob: options.blob || null,
      fileName: options.fileName || "converted_document.pdf",
      pageCount: options.pageCount || 1,
      isInApp: Boolean(options.isInApp),
    };

    // Update file name display
    const fileNameEl = document.getElementById("popupFileName");
    if (fileNameEl) {
      fileNameEl.textContent = currentFile.fileName;
    }

    // Update details display
    const fileDetailsEl = document.getElementById("popupFileDetails");
    if (fileDetailsEl) {
      const pageText = `${currentFile.pageCount} ${currentFile.pageCount === 1 ? "page" : "pages"}`;
      const sizeText = currentFile.blob
        ? ` • ${formatSize(currentFile.blob.size)}`
        : "";
      fileDetailsEl.textContent = `${pageText}${sizeText} • 100% Private`;
    }

    // Reset download button
    const btnText = document.getElementById("popupDownloadBtnText");
    const btn = document.getElementById("popupDownloadBtn");
    if (btnText) {
      btnText.textContent = "Download PDF";
    }
    if (btn) {
      btn.style.boxShadow = "";
    }

    // Show modal
    modalEl.hidden = false;
    // Trigger reflow for CSS animation
    void modalEl.offsetWidth;
    modalEl.classList.add("show");
    document.body.style.overflow = "hidden";

    // Focus on the download button for accessibility
    setTimeout(() => {
      const downloadBtn = document.getElementById("popupDownloadBtn");
      if (downloadBtn) downloadBtn.focus();
    }, 100);
  }

  /**
   * Close the popup modal
   */
  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove("show");
    document.body.style.overflow = "";
    setTimeout(() => {
      if (!modalEl.classList.contains("show")) {
        modalEl.hidden = true;
      }
    }, 280);
  }

  // Public API
  window.PhotoToPdfPopup = {
    show: showModal,
    close: closeModal,
    download: triggerDownload,
    init: ensureModal,
  };

  // Convenience global alias
  window.showPhotoToPdfSuccessModal = showModal;

  // Listen for custom events dispatched when conversion finishes
  window.addEventListener("pdfmaster:photo-to-pdf-complete", (e) => {
    if (e.detail) {
      showModal(e.detail);
    }
  });

  window.addEventListener("photoToPdf:complete", (e) => {
    if (e.detail) {
      showModal(e.detail);
    }
  });

  // Ensure elements are wired up on DOMContentLoaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureModal);
  } else {
    ensureModal();
  }
})();
