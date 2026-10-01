/**
 * PDFMaster - UI Synchronization & Interaction Controller
 * Manages preset selection, custom panel inputs, target file size calculator, progress modals, and results card.
 */
(function () {
  "use strict";

  const state = window.PDFCompressState;
  const { PRESETS } = window.PDFCompressConstants;
  const { fmtBytes, showToast } = window.PDFCompressUtils;

  // DOM Elements
  const presetCards = document.querySelectorAll(".preset-card");
  const customPanel = document.getElementById("customPanel");
  const dpiSlider = document.getElementById("dpiSlider");
  const dpiValBadge = document.getElementById("dpiValBadge");
  const qualitySlider = document.getElementById("qualitySlider");
  const qualityValBadge = document.getElementById("qualityValBadge");
  const quickDpiBtns = document.querySelectorAll(".quick-dpi-btn");
  const grayscaleSwitch = document.getElementById("grayscaleSwitch");
  const pageRangeInput = document.getElementById("pageRangeInput");
  const targetSizeInput = document.getElementById("targetSizeInput");
  const actionSummaryText = document.getElementById("actionSummaryText");
  const recoveryBadge = document.getElementById("recoveryBadge");
  const resultsCard = document.getElementById("resultsCard");
  const origSizeStat = document.getElementById("origSizeStat");
  const compressedSizeStat = document.getElementById("compressedSizeStat");
  const savingsPctStat = document.getElementById("savingsPctStat");
  const loadingModalOverlay = document.getElementById("loadingModalOverlay");
  const loadingModalTitle = document.getElementById("loadingModalTitle");
  const loadingModalSub = document.getElementById("loadingModalSub");
  const loadingBarFill = document.getElementById("loadingBarFill");
  const loadingStatusText = document.getElementById("loadingStatusText");
  const loadingPct = document.getElementById("loadingPct");
  const loadingModeTag = document.getElementById("loadingModeTag");
  const loadingHeapHud = document.getElementById("loadingHeapHud");

  function syncUiFromState() {
    // Preset cards
    presetCards.forEach((card) => {
      const isCardActive = card.dataset.preset === state.activePreset;
      card.classList.toggle("active", isCardActive);
    });

    if (customPanel) {
      customPanel.classList.toggle("active", state.activePreset === "custom");
    }

    if (dpiSlider) dpiSlider.value = state.dpi;
    if (dpiValBadge) dpiValBadge.textContent = `${state.dpi} DPI`;
    if (qualitySlider) qualitySlider.value = Math.round(state.quality * 100);
    if (qualityValBadge)
      qualityValBadge.textContent = `${Math.round(state.quality * 100)}%`;

    quickDpiBtns.forEach((btn) => {
      btn.classList.toggle(
        "active",
        parseInt(btn.dataset.dpi, 10) === state.dpi,
      );
    });

    if (grayscaleSwitch) {
      grayscaleSwitch.classList.toggle("checked", state.grayscale);
    }

    if (pageRangeInput) {
      pageRangeInput.value = state.pageRange || "";
    }

    updateActionSummary();
  }

  function getEffectiveSettings() {
    if (state.activePreset === "custom") {
      return {
        dpi: state.dpi,
        quality: state.quality,
        grayscale: state.grayscale,
        isLossless: false,
      };
    }
    if (state.activePreset === "lossless") {
      return {
        dpi: 0,
        quality: 1.0,
        grayscale: false,
        isLossless: true,
      };
    }
    const p = PRESETS[state.activePreset] || PRESETS.recommended;
    return {
      dpi: p.dpi,
      quality: p.quality,
      grayscale: p.grayscale,
      isLossless: false,
    };
  }

  function updateActionSummary() {
    if (!actionSummaryText) return;
    const s = getEffectiveSettings();
    if (s.isLossless) {
      actionSummaryText.innerHTML = `Mode: <strong>Lossless Vector</strong> · Cleans metadata & packs Flate object streams`;
    } else {
      const grayStr = s.grayscale ? " · Grayscale (B&W)" : "";
      actionSummaryText.innerHTML = `Mode: <strong>${PRESETS[state.activePreset]?.name || "Custom"}</strong> · ${s.dpi} DPI · ${Math.round(s.quality * 100)}% Quality${grayStr}`;
    }
  }

  function updateRecoveryBadge(hasData) {
    if (!recoveryBadge) return;
    recoveryBadge.style.display = hasData ? "inline-flex" : "none";
  }

  function applyTargetFileSize() {
    if (!targetSizeInput || !state.totalPages) return;
    const val = parseFloat(targetSizeInput.value);
    if (!val || val <= 0) {
      showToast("Please enter a valid target size (e.g., 200 or 1.5)", "info");
      return;
    }

    // Determine unit
    const unitEl = document.getElementById("targetUnitSelect");
    const isMb = unitEl ? unitEl.value === "MB" : false;
    const targetBytes = val * (isMb ? 1024 * 1024 : 1024);

    if (targetBytes >= state.fileSize) {
      showToast(
        `Target size (${fmtBytes(targetBytes)}) is already larger than current size (${fmtBytes(state.fileSize)}).`,
        "info",
      );
      return;
    }

    state.targetSizeBytes = targetBytes;

    // Calculate budget per page
    const overhead = 8192; // PDF trailer, catalog overhead
    const budgetPerPage = Math.max(
      2048,
      (targetBytes - overhead) / state.totalPages,
    );

    let calcDpi = 144;
    let calcQuality = 0.65;
    let calcGray = false;

    if (budgetPerPage < 25 * 1024) {
      calcDpi = 84;
      calcQuality = 0.42;
      calcGray = true;
    } else if (budgetPerPage < 50 * 1024) {
      calcDpi = 96;
      calcQuality = 0.52;
      calcGray = false;
    } else if (budgetPerPage < 100 * 1024) {
      calcDpi = 130;
      calcQuality = 0.62;
      calcGray = false;
    } else if (budgetPerPage < 250 * 1024) {
      calcDpi = 160;
      calcQuality = 0.74;
      calcGray = false;
    } else {
      calcDpi = 200;
      calcQuality = 0.82;
      calcGray = false;
    }

    state.activePreset = "custom";
    state.dpi = calcDpi;
    state.quality = calcQuality;
    state.grayscale = calcGray;

    syncUiFromState();
    if (
      window.PDFCompressPreview &&
      window.PDFCompressPreview.invalidateCompressedCache
    ) {
      window.PDFCompressPreview.invalidateCompressedCache();
    }
    if (window.PDFCompressStorage && window.PDFCompressStorage.scheduleDBSave) {
      window.PDFCompressStorage.scheduleDBSave();
    }

    showToast(
      `Configured for ~${fmtBytes(targetBytes)} target (${calcDpi} DPI, ${Math.round(calcQuality * 100)}% quality${calcGray ? ", Grayscale" : ""})`,
      "success",
    );
  }

  function parsePageRange(rangeStr, total) {
    if (
      !rangeStr ||
      !rangeStr.trim() ||
      rangeStr.trim().toLowerCase() === "all"
    )
      return null;
    const result = new Set();
    const parts = rangeStr.split(",");
    for (let part of parts) {
      part = part.trim();
      if (!part) continue;
      if (part.includes("-")) {
        const [startStr, endStr] = part.split("-");
        const s = parseInt(startStr.trim(), 10);
        const e = parseInt(endStr.trim(), 10);
        if (!isNaN(s) && !isNaN(e)) {
          const from = Math.max(1, Math.min(s, e));
          const to = Math.min(total, Math.max(s, e));
          for (let p = from; p <= to; p++) result.add(p);
        }
      } else {
        const p = parseInt(part, 10);
        if (!isNaN(p) && p >= 1 && p <= total) result.add(p);
      }
    }
    return result.size > 0 ? result : null;
  }

  function showLoadingModal(
    show,
    title = "Processing…",
    sub = "",
    pct = 0,
    tag = "",
  ) {
    if (!loadingModalOverlay) return;
    if (show) {
      if (loadingModalTitle) loadingModalTitle.textContent = title;
      if (loadingModalSub) loadingModalSub.textContent = sub;
      if (loadingBarFill) loadingBarFill.style.width = `${pct}%`;
      if (loadingPct) loadingPct.textContent = `${pct}%`;
      if (loadingStatusText) loadingStatusText.textContent = sub;
      if (loadingModeTag) {
        if (tag) {
          loadingModeTag.textContent = tag;
          loadingModeTag.style.display = "inline-block";
        } else {
          loadingModeTag.style.display = "none";
        }
      }
      if (loadingHeapHud) loadingHeapHud.style.display = "none";
      loadingModalOverlay.classList.add("active");
    } else {
      loadingModalOverlay.classList.remove("active");
      if (loadingHeapHud) loadingHeapHud.style.display = "none";
    }
  }

  function updateLoadingProgress(pct, statusText) {
    if (loadingBarFill) loadingBarFill.style.width = `${pct}%`;
    if (loadingPct) loadingPct.textContent = `${pct}%`;
    if (loadingStatusText && statusText)
      loadingStatusText.textContent = statusText;
  }

  function renderResults(outBlob, durationMs) {
    if (!resultsCard) return;
    resultsCard.classList.add("active");

    const savedBytes = Math.max(0, state.fileSize - outBlob.size);
    const savedPct = Math.round((savedBytes / state.fileSize) * 100);

    if (origSizeStat) origSizeStat.textContent = fmtBytes(state.fileSize);
    if (compressedSizeStat)
      compressedSizeStat.textContent = fmtBytes(outBlob.size);
    if (savingsPctStat) {
      if (savedBytes > 0) {
        savingsPctStat.textContent = `-${savedPct}% (Saved ${fmtBytes(savedBytes)})`;
        savingsPctStat.style.color = "var(--savings-green)";
      } else {
        savingsPctStat.textContent = `Optimized (${fmtBytes(outBlob.size)})`;
        savingsPctStat.style.color = "var(--text)";
      }
    }

    resultsCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function downloadCompressedPdf() {
    if (!state.lastCompressedBlob) return;
    const url = URL.createObjectURL(state.lastCompressedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = state.lastCompressedName || "compressed.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.PDFCompressUI = {
    syncUiFromState,
    getEffectiveSettings,
    updateActionSummary,
    updateRecoveryBadge,
    applyTargetFileSize,
    parsePageRange,
    showLoadingModal,
    updateLoadingProgress,
    renderResults,
    downloadCompressedPdf,
  };
})();
