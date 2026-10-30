/**
 * PDFMaster - Compare PDF: Main Entry & Pipeline Orchestrator
 * High-performance parallel analysis pipeline, studio bootstrap, and lifecycle management.
 */
(function () {
  "use strict";

  window.PDFCompare = window.PDFCompare || {};
  const state = window.PDFCompare.state;
  const DOM = window.PDFCompare.DOM;
  const utils = window.PDFCompare.utils;
  const PageCache = window.PDFCompare.PageCache;

  // =========================================================================
  //  DIFF ANALYSIS ENGINE (Parallel Batch Ingestion Pipeline)
  // =========================================================================
  async function runComparison() {
    if (!state.fileA || !state.fileB) return;
    state.isComparing = true;
    utils.showLoading(true, "Comparing Documents", "Extracting text and analyzing changes...");

    PageCache.clear();
    state.totalPages = Math.max(state.fileA.pageCount, state.fileB.pageCount);
    state.currentPage = 1;
    state.differences = [];

    const analyzePage = (window.PDFCompare.diff && window.PDFCompare.diff.analyzePageDiff) || window.PDFCompare.analyzePageDiff;
    const saveSession = (window.PDFCompare.storage && window.PDFCompare.storage.saveSessionToDB) || window.PDFCompare.saveSessionToDB;
    const renderDrawer = (window.PDFCompare.ui && window.PDFCompare.ui.renderDrawerList) || window.PDFCompare.renderDrawerList;
    const updateSummary = (window.PDFCompare.ui && window.PDFCompare.ui.updateToolbarSummary) || window.PDFCompare.updateToolbarSummary;
    const renderPage = (window.PDFCompare.renderer && window.PDFCompare.renderer.renderCurrentPage) || window.PDFCompare.renderCurrentPage;
    const getCount = (window.PDFCompare.diff && window.PDFCompare.diff.getTotalDiffCount) || window.PDFCompare.getTotalDiffCount || (() => 0);

    // Parallel extraction in concurrent chunks of 4 pages
    const BATCH_SIZE = 4;
    for (let startP = 1; startP <= state.totalPages; startP += BATCH_SIZE) {
      const batchPromises = [];
      const endP = Math.min(startP + BATCH_SIZE - 1, state.totalPages);

      for (let p = startP; p <= endP; p++) {
        if (analyzePage) batchPromises.push(analyzePage(p));
      }

      await Promise.all(batchPromises);
      utils.updateLoadingProgress((endP / state.totalPages) * 75, `Analyzed pages 1 to ${endP} of ${state.totalPages}...`);
    }

    utils.updateLoadingProgress(90, "Rendering studio views...");
    if (saveSession) saveSession();

    // Render Studio
    if (DOM.studio) {
      DOM.studio.classList.add("active");
      DOM.studio.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (renderDrawer) renderDrawer();
    if (updateSummary) updateSummary();
    if (renderPage) await renderPage();

    utils.showLoading(false);
    state.isComparing = false;

    const diffCount = getCount();
    utils.showToast(`Comparison complete. ${diffCount} modified page${diffCount === 1 ? "" : "s"} detected.`, "success");
  }

  // =========================================================================
  //  INIT & BOOTSTRAP
  // =========================================================================
  function initApp() {
    if (window.PDFCompare.initDOM) window.PDFCompare.initDOM();
    if (window.PDFCompare.ui && window.PDFCompare.ui.initEvents) window.PDFCompare.ui.initEvents();

    if (window.PDFCompare.storage && window.PDFCompare.storage.checkSavedSession) {
      window.PDFCompare.storage.checkSavedSession();
    }

    const THEME_KEY = (window.PDFCompare.constants && window.PDFCompare.constants.THEME_KEY) || "pdfmaster-theme";
    const savedTheme = localStorage.getItem(THEME_KEY) || "light";
    if (utils.updateThemeIcons) utils.updateThemeIcons(savedTheme);

    window.pdfMasterCompareReady = true;
  }

  // Expose Main API
  window.PDFCompare.main = {
    runComparison,
    initApp
  };

  // Top-level debugging shortcuts
  window.PDFCompare.runComparison = runComparison;
  window.PDFCompare.initApp = initApp;
  window.PDFCompare.initialized = true;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
