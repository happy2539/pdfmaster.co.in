/**
 * PDFMaster - Universal Thank You & Download Popup Modal
 * -------------------------------------------------------
 * Universal JavaScript module for all PDFMaster tools.
 * When processing completes on any tool page, this module provides
 * an elegant modal featuring a prominent download button, file details,
 * and a thank-you message for using the platform.
 *
 * Public API (unchanged — safe drop-in replacement):
 *   window.PDFMasterPopup = { show, close, download, init,
 *                              startTimer, getDurationMs, formatDuration }
 *   window.PhotoToPdfPopup                  (alias of the above)
 *   window.showPhotoToPdfSuccessModal(opts) (alias of .show)
 *   window.showPDFMasterSuccessModal(opts)  (alias of .show)
 *   window.dispatchEvent(new CustomEvent("pdfmaster:success-popup", { detail: opts }))
 */
(function () {
  "use strict";

  let modalOverlay = null;
  let currentOptions = {};
  let currentObjectUrl = null;
  let activeTimerStart = null;
  let lastMeasuredDuration = null;

  const ICONS = {
    pdf: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
    zip: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
    image: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
  };

  /**
   * Speed marketing copy, bucketed by measured seconds. Every line leans
   * on the one claim PDFMaster can always make honestly: nothing was
   * uploaded. A random line per tier keeps repeat visitors seeing
   * something new instead of the same badge every time.
   */
  const SPEED_TIERS = [
    {
      max: 0.6,
      tag: "⚡ Instant",
      lines: [
        "Most sites are still opening your upload dialog.",
        "That's the speed of skipping the upload entirely.",
        "Quicker than this popup finished animating in.",
      ],
    },
    {
      max: 2,
      tag: "🚀 Fast",
      lines: [
        "No upload, no queue, no server — just done.",
        "While others wait on a server, you're already downloading.",
        "That's what zero uploads feels like.",
      ],
    },
    {
      max: 6,
      tag: "🔥 Fast",
      lines: [
        "Still 100% on your device — not a single byte left it.",
        "A bigger job, handled without ever leaving your browser.",
        "No server touched that file. Your device just did.",
      ],
    },
    {
      max: Infinity,
      tag: "🛡️ Private",
      lines: [
        "Big file, zero uploads — every second of that stayed private.",
        "That's real work, done without a server in sight.",
        "Took a moment, but nothing ever left this device.",
      ],
    },
  ];

  function pickSpeedTier(seconds) {
    return (
      SPEED_TIERS.find((tier) => seconds < tier.max) ||
      SPEED_TIERS[SPEED_TIERS.length - 1]
    );
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * Start conversion timer
   */
  function startTimer() {
    activeTimerStart = performance.now();
    lastMeasuredDuration = null;
    return activeTimerStart;
  }

  /**
   * Get duration in milliseconds from start time
   */
  function getDurationMs(start) {
    const s = start || activeTimerStart;
    if (!s) return null;
    const diff = Math.round(performance.now() - s);
    if (diff < 0 || diff > 600000) return null; // Ignore stale timers (> 10 minutes)
    return Math.max(1, diff);
  }

  /**
   * Helper to format duration nicely
   */
  function formatDuration(ms) {
    if (!ms || ms <= 0) return null;
    const seconds = ms / 1000;
    if (seconds < 0.1) {
      return "< 0.1s";
    } else if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else {
      const mins = Math.floor(seconds / 60);
      const remSecs = Math.round(seconds % 60);
      return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
    }
  }

  /**
   * Work out the past-tense verb for "___ in 0.8s" (Merged / Split / etc.),
   * preferring an explicit override, then toolName, then downloadText,
   * then the page URL. Same priority order and fallbacks as before, just
   * consolidated into one function instead of three separate branches.
   */
  function resolveVerb() {
    if (currentOptions.verb) return currentOptions.verb;

    if (currentOptions.toolName) {
      const tn = currentOptions.toolName.toLowerCase();
      if (tn.includes("merge") || tn.includes("compiler")) return "Merged";
      if (tn.includes("split")) return "Split";
      if (tn.includes("delete") || tn.includes("remove pages"))
        return "Processed";
      if (tn.includes("reorder")) return "Reordered";
      if (tn.includes("watermark")) return "Watermarked";
      if (tn.includes("metadata")) return "Cleaned";
      if (tn.includes("editor")) return "Exported";
      if (tn.includes("photo") || tn.includes("image")) return "Converted";
      return "Processed";
    }

    if (currentOptions.downloadText) {
      const dt = currentOptions.downloadText.toLowerCase();
      if (dt.includes("merge")) return "Merged";
      if (dt.includes("split")) return "Split";
      if (dt.includes("clean")) return "Cleaned";
      if (dt.includes("reorder")) return "Reordered";
      if (dt.includes("watermark")) return "Watermarked";
      if (dt.includes("edit")) return "Exported";
    }

    const path = (window.location.pathname || "").toLowerCase();
    if (path.includes("merge")) return "Merged";
    if (path.includes("split")) return "Split";
    if (path.includes("delete")) return "Processed";
    if (path.includes("reorder")) return "Reordered";
    if (path.includes("watermark")) return "Watermarked";
    if (path.includes("metadata")) return "Cleaned";
    if (path.includes("editor")) return "Exported";
    if (path.includes("photo")) return "Converted";
    return "Converted";
  }

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
          const w = document.querySelector(
            "#pdfmUniversalModal .trustpilot-widget",
          );
          if (w) window.Trustpilot.loadFromElement(w, true);
        }
      };
      document.head.appendChild(s);
    } else if (window.Trustpilot) {
      const w = document.querySelector(
        "#pdfmUniversalModal .trustpilot-widget",
      );
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

          <div class="pdfm-results-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>

          <h3 class="pdfm-results-title" id="pdfmPopupTitle">PDF Processed Successfully!</h3>

          <p class="pdfm-results-sub" id="pdfmPopupDesc">
            Your document has been processed permanently and losslessly on your device for <strong>complete privacy</strong>.
          </p>

          <div class="pdfm-results-stats" id="pdfmPopupStats">
            <div class="pdfm-stat-item">
              <span class="pdfm-stat-label">File:</span>
              <span class="pdfm-stat-val" id="pdfmPopupFileName" title="document.pdf">document.pdf</span>
            </div>
            <div class="pdfm-results-stat-divider"></div>
            <div class="pdfm-stat-item">
              <span class="pdfm-stat-label">Speed:</span>
              <span class="pdfm-stat-val pdfm-stat-speed" id="pdfmSpeedVal">⚡ Instant</span>
            </div>
            <div class="pdfm-results-stat-divider"></div>
            <div class="pdfm-stat-item">
              <span class="pdfm-stat-label" id="pdfmStatDetailsLabel">Size:</span>
              <span class="pdfm-stat-val" id="pdfmPopupFileDetails">0 KB</span>
              <span id="pdfmPopupFileSize" style="display:none;"></span>
            </div>
          </div>

          <div class="pdfm-results-actions" id="pdfmPopupBtns">
            <button type="button" class="pdfm-btn-primary" id="pdfmPopupDownloadBtn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span id="pdfmPopupDownloadBtnText">Download File</span>
            </button>
            <button type="button" class="pdfm-btn-secondary" id="pdfmPopupSecondaryBtn">
              Done
            </button>
          </div>

          <div class="pdfm-bookmark-row">
            <button type="button" class="pdfm-bookmark-btn" id="pdfmBookmarkBtn" aria-label="Bookmark PDFMaster">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
              <span id="pdfmBookmarkBtnText">Bookmark PDFMaster (Ctrl+D)</span>
            </button>
          </div>

          <div class="pdfm-privacy-guarantee">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>100% Private · Client-Side Only · Zero Server Uploads</span>
          </div>

          <div class="pdfm-popup-trustpilot" id="pdfmPopupTrustpilot">
            <div class="trustpilot-widget" data-locale="en-US" data-template-id="56278e9abfbbba0bdcd568bc" data-businessunit-id="6a9c668c9888d1e2a1ab5719" data-style-height="44px" data-style-width="100%" data-token="19a1dd93-f14d-4877-959e-6df0e8ca8ef0">
              <a href="https://www.trustpilot.com/review/pdfmaster.co.in" target="_blank" rel="noopener">Trustpilot</a>
            </div>
          </div>
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

    // Bookmark / Save Link button
    const bookmarkBtn = overlay.querySelector("#pdfmBookmarkBtn");
    if (bookmarkBtn) {
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent || "",
        ) ||
        (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

      const isMac = /Mac|iPod|iPhone|iPad/i.test(
        (navigator.userAgentData && navigator.userAgentData.platform) ||
          navigator.platform ||
          navigator.userAgent ||
          "",
      );

      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
      const shortcut = isMac ? "⌘+D" : "Ctrl+D";
      const btnText = overlay.querySelector("#pdfmBookmarkBtnText");

      if (btnText) {
        btnText.textContent = isMobile
          ? "Bookmark / Save PDFMaster"
          : `Bookmark PDFMaster (${shortcut})`;
      }

      bookmarkBtn.addEventListener("click", async () => {
        const siteUrl = "https://pdfmaster.co.in";
        const shareData = {
          title: "PDFMaster — Free Online PDF Tools",
          text: "100% private, client-side PDF tools with zero uploads.",
          url: siteUrl,
        };

        // 1. On mobile devices with Web Share API, open native bookmark/share sheet
        if (isMobile && typeof navigator.share === "function") {
          try {
            await navigator.share(shareData);
            if (btnText) btnText.textContent = "✓ PDFMaster Saved!";
            if (typeof window.showToast === "function") {
              window.showToast(
                "PDFMaster saved! Tap 'Add Bookmark' or 'Add to Home Screen' in your browser.",
                "success",
                4500,
              );
            }
            setTimeout(() => {
              if (btnText) btnText.textContent = "Bookmark / Save PDFMaster";
            }, 3500);
            return;
          } catch (err) {
            // User dismissed or aborted the native share sheet
            if (
              err &&
              (err.name === "AbortError" ||
                (err.message && err.message.includes("abort")))
            ) {
              return;
            }
            // If share API errored, fall through to clipboard
          }
        }

        // 2. Clipboard copy fallback
        let copied = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(siteUrl);
            copied = true;
          } catch (_) {
            copied = false;
          }
        }

        if (isMobile) {
          if (btnText) btnText.textContent = "✓ Link Copied to Bookmark!";
          if (typeof window.showToast === "function") {
            if (isIOS) {
              window.showToast(
                "Link copied! In Safari, tap Share ⎙ > 'Add Bookmark' or 'Add to Home Screen'.",
                "info",
                5000,
              );
            } else {
              window.showToast(
                "Link copied! Tap browser menu ⋮ > ★ Star to bookmark PDFMaster.",
                "info",
                5000,
              );
            }
          }
          setTimeout(() => {
            if (btnText) btnText.textContent = "Bookmark / Save PDFMaster";
          }, 3500);
        } else {
          if (btnText) btnText.textContent = `✓ Link Copied! (${shortcut})`;
          if (typeof window.showToast === "function") {
            window.showToast(
              `pdfmaster.co.in copied! Press ${shortcut} to bookmark PDFMaster.`,
              "success",
              4000,
            );
          }
          setTimeout(() => {
            if (btnText)
              btnText.textContent = `Bookmark PDFMaster (${shortcut})`;
          }, 3500);
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
    if (
      !currentOptions.blob &&
      !currentOptions.url &&
      typeof currentOptions.onDownload !== "function"
    ) {
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
      /FBAN|FBAV|Instagram|Line|WhatsApp|MicroMessenger|Snapchat|Twitter|ByteDance|TikTok/i.test(
        navigator.userAgent,
      ),
    );

    try {
      if (isInApp) {
        if (currentOptions.url && currentOptions.url.startsWith("data:")) {
          window.open(
            `data:application/pdf;base64,${currentOptions.url.split(",")[1]}`,
            "_system",
          );
        } else if (currentOptions.blob) {
          if (!currentObjectUrl)
            currentObjectUrl = URL.createObjectURL(currentOptions.blob);
          window.open(currentObjectUrl, "_system");
        } else if (currentOptions.url) {
          window.open(currentOptions.url, "_system");
        }
      } else {
        const a = document.createElement("a");
        if (currentOptions.blob) {
          if (!currentObjectUrl)
            currentObjectUrl = URL.createObjectURL(currentOptions.blob);
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
        window.showToast(
          `"${fileName}" downloaded successfully!`,
          "success",
          4000,
        );
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
    if (btn) btn.classList.add("is-downloaded");

    // Sync any on-page download button
    if (currentOptions.syncButtonTextEl) {
      const el =
        typeof currentOptions.syncButtonTextEl === "string"
          ? document.getElementById(currentOptions.syncButtonTextEl)
          : currentOptions.syncButtonTextEl;
      if (el) el.textContent = "Downloaded! (Download Again)";
    }
    const legacyReadyText = document.getElementById("downloadReadyBtnText");
    if (legacyReadyText)
      legacyReadyText.textContent = "Downloaded! (Download Again)";
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

    currentOptions = Object.assign(
      {
        title: "PDF Processed Successfully!",
        desc: "Your document has been processed permanently and losslessly on your device for <strong>complete privacy</strong>.",
        fileName: "document.pdf",
        fileType: "pdf",
        fileDetails: null,
        fileSize: null,
        downloadText: "Download File",
        secondaryText: "Done",
        showSecondary: true,
        blob: null,
        url: null,
        isInApp: false,
      },
      options,
    );

    // Title
    const titleEl = document.getElementById("pdfmPopupTitle");
    if (titleEl) {
      const rawTitle =
        currentOptions.title || "PDF Processed Successfully!";
      titleEl.innerHTML = rawTitle.includes("<span")
        ? rawTitle
        : rawTitle.replace(/PDFMaster/g, "PDF<span>Master</span>");
    }

    // Desc
    const descEl = document.getElementById("pdfmPopupDesc");
    if (descEl) {
      descEl.innerHTML =
        currentOptions.desc ||
        "Your document has been processed permanently and losslessly on your device for <strong>complete privacy</strong>.";
    }

    // File name
    const fileNameEl = document.getElementById("pdfmPopupFileName");
    if (fileNameEl) {
      const fn = currentOptions.fileName || "document.pdf";
      fileNameEl.textContent = fn;
      fileNameEl.title = fn;
    }

    // Conversion time -> speed pill
    let elapsedMs = null;
    if (
      typeof currentOptions.durationMs === "number" &&
      currentOptions.durationMs > 0
    ) {
      elapsedMs = currentOptions.durationMs;
    } else if (currentOptions.startTime) {
      elapsedMs = getDurationMs(currentOptions.startTime);
    } else if (activeTimerStart) {
      elapsedMs = getDurationMs(activeTimerStart);
    } else if (lastMeasuredDuration) {
      elapsedMs = lastMeasuredDuration;
    }

    if (elapsedMs) {
      lastMeasuredDuration = elapsedMs;
    }
    activeTimerStart = null;

    const speedValEl = document.getElementById("pdfmSpeedVal");
    if (speedValEl) {
      if (elapsedMs) {
        const formatted = formatDuration(elapsedMs);
        const tier = pickSpeedTier(elapsedMs / 1000);
        speedValEl.textContent = `${formatted} · ${tier.tag}`;
        speedValEl.title = pickRandom(tier.lines);
      } else {
        speedValEl.textContent = "⚡ Instant";
        speedValEl.title = "Processed 100% locally on your device";
      }
    }

    // File Size & Details
    const sz =
      currentOptions.fileSize ||
      (currentOptions.blob ? currentOptions.blob.size : 0);
    const formattedSize = sz ? formatBytes(sz) : "";

    let detailsText = "";
    let labelText = "Size:";

    if (currentOptions.fileDetails) {
      let cleaned = currentOptions.fileDetails
        .replace(/•\s*100%\s*Private/gi, "")
        .replace(/Ready to download\s*•?/gi, "")
        .replace(/\s*•\s*/g, " · ")
        .replace(/rotated/gi, "rot")
        .replace(/remaining/gi, "left")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[·•]\s*|[·•]\s*$/g, "")
        .trim();

      if (cleaned) {
        detailsText = cleaned;
        if (/page|file|photo|item/i.test(cleaned)) {
          labelText = "Details:";
        }
      }
    }

    if (!detailsText && formattedSize) {
      detailsText = formattedSize;
      labelText = "Size:";
    } else if (!detailsText) {
      detailsText = "Ready";
      labelText = "Status:";
    }

    const labelEl = document.getElementById("pdfmStatDetailsLabel");
    if (labelEl) labelEl.textContent = labelText;

    const detailsEl = document.getElementById("pdfmPopupFileDetails");
    if (detailsEl) {
      detailsEl.textContent = detailsText;
      detailsEl.title = currentOptions.fileDetails || detailsText;
    }

    const sizeEl = document.getElementById("pdfmPopupFileSize");
    if (sizeEl) {
      sizeEl.textContent = formattedSize || detailsText;
    }

    // Download Button Text
    const dlBtnText = document.getElementById("pdfmPopupDownloadBtnText");
    if (dlBtnText) dlBtnText.textContent = currentOptions.downloadText;

    const dlBtn = document.getElementById("pdfmPopupDownloadBtn");
    if (dlBtn) dlBtn.classList.remove("is-downloaded");

    // Secondary Button
    const secBtn = document.getElementById("pdfmPopupSecondaryBtn");
    if (secBtn) {
      secBtn.textContent = currentOptions.secondaryText;
      secBtn.style.display = currentOptions.showSecondary
        ? "inline-flex"
        : "none";
    }

    // Show modal
    modalOverlay.hidden = false;
    void modalOverlay.offsetWidth; // force reflow
    modalOverlay.classList.add("show");
    document.body.style.overflow = "hidden";
    ensureTrustpilot();

    // Notify Universal Conversion Tracker
    try {
      const conversionPayload = {
        tool: currentOptions.toolName || resolveVerb(),
        durationMs: elapsedMs,
        fileSize: sz,
        fileName: currentOptions.fileName || "document.pdf",
        fileType: currentOptions.fileType || "pdf",
        fileDetails: currentOptions.fileDetails || null,
        blob: currentOptions.blob || null,
      };

      if (
        window.PDFMasterTracker &&
        typeof window.PDFMasterTracker.trackConversion === "function"
      ) {
        window.PDFMasterTracker.trackConversion(conversionPayload);
      }

      window.dispatchEvent(
        new CustomEvent("pdfmaster:conversion-tracked", {
          detail: conversionPayload,
        }),
      );
    } catch (_) {}

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
    startTimer: startTimer,
    getDurationMs: getDurationMs,
    formatDuration: formatDuration,
  };

  window.PDFMasterPopup = API;
  // Aliases for compatibility
  window.PhotoToPdfPopup = API;
  window.showPhotoToPdfSuccessModal = showModal;

  // Global automatic timer trigger on conversion/action button clicks
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest(
        "#convertBtn, #mergePdfBtn, #deletePdfBtn, #deleteBtn, #splitBtn, #downloadBtn, #downloadAllBtn, #downloadSingleBtn, #removeBtn, #applyBtn, #download-btn, .btn-convert, .btn-download",
      );
      if (
        btn &&
        !btn.closest("#pdfmUniversalModal") &&
        !btn.closest("#photoToPdfModal")
      ) {
        startTimer();
      }
    },
    true,
  );
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
