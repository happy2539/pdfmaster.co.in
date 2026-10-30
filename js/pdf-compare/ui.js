/**
 * PDFMaster - Compare PDF: UI Controls & Events
 * Page indicator, difference quick navigation, drawer list, synchronized scrolling, and UI events.
 */
(function () {
  "use strict";

  window.PDFCompare = window.PDFCompare || {};
  const state = window.PDFCompare.state;
  const DOM = window.PDFCompare.DOM;
  const utils = window.PDFCompare.utils;
  const PageCache = window.PDFCompare.PageCache;

  // =========================================================================
  //  TOOLBAR & CONTROLS INTERACTION
  // =========================================================================
  function updatePageIndicator() {
    if (DOM.pageIndicator) {
      DOM.pageIndicator.textContent = `Page ${state.currentPage} of ${state.totalPages}`;
    }
    if (DOM.btnPrevPage) DOM.btnPrevPage.disabled = state.currentPage <= 1;
    if (DOM.btnNextPage) DOM.btnNextPage.disabled = state.currentPage >= state.totalPages;
  }

  function updateDiffNavButtons() {
    const hasPrev = state.differences.some((d) => d && d.hasDiff && d.pageNum < state.currentPage);
    const hasNext = state.differences.some((d) => d && d.hasDiff && d.pageNum > state.currentPage);

    if (DOM.btnPrevDiff) DOM.btnPrevDiff.disabled = !hasPrev;
    if (DOM.btnNextDiff) DOM.btnNextDiff.disabled = !hasNext;
  }

  function goToNextDifference() {
    const nextDiff = state.differences.find((d) => d && d.hasDiff && d.pageNum > state.currentPage);
    if (nextDiff) {
      state.currentPage = nextDiff.pageNum;
      const renderFn = (window.PDFCompare.renderer && window.PDFCompare.renderer.renderCurrentPage) || window.PDFCompare.renderCurrentPage;
      if (renderFn) renderFn();
      utils.showToast(`Jumped to Next Difference on Page ${state.currentPage}`, "info", 2000);
    } else {
      utils.showToast("No further differences ahead in document.", "info", 2000);
    }
  }

  function goToPrevDifference() {
    let prevDiff = null;
    for (let p = state.currentPage - 1; p >= 1; p--) {
      if (state.differences[p] && state.differences[p].hasDiff) {
        prevDiff = state.differences[p];
        break;
      }
    }
    if (prevDiff) {
      state.currentPage = prevDiff.pageNum;
      const renderFn = (window.PDFCompare.renderer && window.PDFCompare.renderer.renderCurrentPage) || window.PDFCompare.renderCurrentPage;
      if (renderFn) renderFn();
      utils.showToast(`Jumped to Previous Difference on Page ${state.currentPage}`, "info", 2000);
    } else {
      utils.showToast("At first difference in document.", "info", 2000);
    }
  }

  function updateToolbarSummary() {
    const countFn = (window.PDFCompare.diff && window.PDFCompare.diff.getTotalDiffCount) || window.PDFCompare.getTotalDiffCount || (() => 0);
    const changedCount = countFn();
    if (DOM.exportMeta && state.fileA && state.fileB) {
      DOM.exportMeta.textContent = `Comparing "${state.fileA.name}" vs "${state.fileB.name}" · ${state.totalPages} page${state.totalPages === 1 ? "" : "s"} · ${changedCount} modified page${changedCount === 1 ? "" : "s"}`;
    }
  }

  function renderDrawerList() {
    if (!DOM.drawerList) return;
    DOM.drawerCount.textContent = `${state.totalPages} Pages`;
    let html = "";
    for (let p = 1; p <= state.totalPages; p++) {
      const diff = state.differences[p];
      const isChanged = diff && diff.hasDiff;
      let badgeLabel = "Identical ✨";
      let badgeClass = "badge-identical";

      if (diff) {
        if (diff.status === "addedPage") {
          badgeLabel = "Added Page (+)";
          badgeClass = "badge-changed";
        } else if (diff.status === "deletedPage") {
          badgeLabel = "Deleted Page (-)";
          badgeClass = "badge-changed";
        } else if (isChanged) {
          badgeLabel = `Change (+${diff.addedWords || 0}/-${diff.deletedWords || 0})`;
          badgeClass = "badge-changed";
        }
      }

      html += `
        <div class="drawer-item ${p === state.currentPage ? "active" : ""}" data-page="${p}">
          <span class="drawer-page-num">Page ${p}</span>
          <span class="drawer-badge ${badgeClass}">
            ${badgeLabel}
          </span>
        </div>
      `;
    }
    DOM.drawerList.innerHTML = html;

    DOM.drawerList.querySelectorAll(".drawer-item").forEach((item) => {
      item.addEventListener("click", () => {
        const p = parseInt(item.dataset.page, 10);
        if (p && p !== state.currentPage) {
          state.currentPage = p;
          const renderFn = (window.PDFCompare.renderer && window.PDFCompare.renderer.renderCurrentPage) || window.PDFCompare.renderCurrentPage;
          if (renderFn) renderFn();
        }
      });
    });
  }

  function updateDrawerActive() {
    if (!DOM.drawerList) return;
    DOM.drawerList.querySelectorAll(".drawer-item").forEach((item) => {
      item.classList.toggle("active", parseInt(item.dataset.page, 10) === state.currentPage);
    });
  }

  // =========================================================================
  //  EVENT LISTENERS & BINDINGS
  // =========================================================================
  function initEvents() {
    const loader = window.PDFCompare.loader || {};
    const renderer = window.PDFCompare.renderer || {};
    const exporter = window.PDFCompare.export || {};
    const storage = window.PDFCompare.storage || {};
    const main = window.PDFCompare.main || {};

    const handleFile = loader.handleFileSelected || window.PDFCompare.handleFileSelected;
    const swapDocs = loader.swapDocuments || window.PDFCompare.swapDocuments;
    const compareDocs = main.runComparison || window.PDFCompare.runComparison;
    const resetDocSlot = loader.resetSlot || window.PDFCompare.resetSlot;
    const clearStorage = storage.clearSessionFromDB || window.PDFCompare.clearSessionFromDB;
    const restoreStorage = storage.restoreSessionFromDB || window.PDFCompare.restoreSessionFromDB;
    const switchSubmode = renderer.switchDiffSubmode || window.PDFCompare.switchDiffSubmode;
    const renderPage = renderer.renderCurrentPage || window.PDFCompare.renderCurrentPage;

    // Dropzone A
    DOM.slotA.addEventListener("click", () => DOM.fileInputA.click());
    DOM.slotA.addEventListener("dragover", (e) => { e.preventDefault(); DOM.slotA.classList.add("dragover"); });
    DOM.slotA.addEventListener("dragleave", () => DOM.slotA.classList.remove("dragover"));
    DOM.slotA.addEventListener("drop", (e) => {
      e.preventDefault();
      DOM.slotA.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0] && handleFile) {
        handleFile(e.dataTransfer.files[0], "A");
      }
    });
    DOM.fileInputA.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0] && handleFile) handleFile(e.target.files[0], "A");
    });

    // Dropzone B
    DOM.slotB.addEventListener("click", () => DOM.fileInputB.click());
    DOM.slotB.addEventListener("dragover", (e) => { e.preventDefault(); DOM.slotB.classList.add("dragover"); });
    DOM.slotB.addEventListener("dragleave", () => DOM.slotB.classList.remove("dragover"));
    DOM.slotB.addEventListener("drop", (e) => {
      e.preventDefault();
      DOM.slotB.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0] && handleFile) {
        handleFile(e.dataTransfer.files[0], "B");
      }
    });
    DOM.fileInputB.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0] && handleFile) handleFile(e.target.files[0], "B");
    });

    // Swap, Compare, Reset
    if (DOM.btnSwap && swapDocs) DOM.btnSwap.addEventListener("click", swapDocs);
    if (DOM.btnCompare && compareDocs) DOM.btnCompare.addEventListener("click", compareDocs);
    if (DOM.btnReset) {
      DOM.btnReset.addEventListener("click", () => {
        if (resetDocSlot) {
          resetDocSlot("A");
          resetDocSlot("B");
        }
        if (DOM.studio) DOM.studio.classList.remove("active");
        if (clearStorage) clearStorage();
        utils.showToast("Workspace reset.", "info");
      });
    }

    // Visual Diff Submode Buttons (Instant 0ms Sudden Switching on Above Canvas)
    if (DOM.btnDiffHighlight && switchSubmode) {
      DOM.btnDiffHighlight.addEventListener("click", () => switchSubmode("highlight"));
    }
    if (DOM.btnDiffMask && switchSubmode) {
      DOM.btnDiffMask.addEventListener("click", () => switchSubmode("deltaMask"));
    }
    if (DOM.btnDiffFlicker && switchSubmode) {
      DOM.btnDiffFlicker.addEventListener("click", () => switchSubmode("flicker"));
    }

    // Page Navigation
    if (DOM.btnPrevPage) {
      DOM.btnPrevPage.addEventListener("click", () => {
        if (state.currentPage > 1) {
          state.currentPage--;
          if (renderPage) renderPage();
        }
      });
    }
    if (DOM.btnNextPage) {
      DOM.btnNextPage.addEventListener("click", () => {
        if (state.currentPage < state.totalPages) {
          state.currentPage++;
          if (renderPage) renderPage();
        }
      });
    }

    // Difference Quick Navigation
    if (DOM.btnPrevDiff) {
      DOM.btnPrevDiff.addEventListener("click", goToPrevDifference);
    }
    if (DOM.btnNextDiff) {
      DOM.btnNextDiff.addEventListener("click", goToNextDifference);
    }

    // Zoom Controls
    if (DOM.btnFitWidth) {
      DOM.btnFitWidth.addEventListener("click", () => {
        state.zoomMode = "fitWidth";
        if (renderPage) renderPage();
      });
    }
    if (DOM.btnFitPage) {
      DOM.btnFitPage.addEventListener("click", () => {
        state.zoomMode = "fitPage";
        if (renderPage) renderPage();
      });
    }
    if (DOM.btnActualSize) {
      DOM.btnActualSize.addEventListener("click", () => {
        state.zoomMode = "custom";
        state.customZoom = 1.0;
        if (renderPage) renderPage();
      });
    }
    if (DOM.btnZoomIn) {
      DOM.btnZoomIn.addEventListener("click", () => {
        state.zoomMode = "custom";
        state.customZoom = Math.min(3.0, Math.round((state.customZoom + 0.15) * 100) / 100);
        if (renderPage) renderPage();
      });
    }
    if (DOM.btnZoomOut) {
      DOM.btnZoomOut.addEventListener("click", () => {
        state.zoomMode = "custom";
        state.customZoom = Math.max(0.4, Math.round((state.customZoom - 0.15) * 100) / 100);
        if (renderPage) renderPage();
      });
    }

    // Debounced window resize handler
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      if (DOM.studio && DOM.studio.classList.contains("active") && (state.zoomMode === "fitWidth" || state.zoomMode === "fitPage")) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (renderPage) renderPage();
        }, 120);
      }
    });

    // Synchronized Scrolling
    if (DOM.syncScrollCheck) {
      DOM.syncScrollCheck.addEventListener("change", (e) => {
        state.syncScroll = e.target.checked;
      });
    }

    let isSyncingA = false;
    let isSyncingB = false;

    if (DOM.paneScrollA) {
      DOM.paneScrollA.addEventListener("scroll", () => {
        if (!state.syncScroll || isSyncingA || !DOM.paneScrollB) return;
        isSyncingB = true;
        DOM.paneScrollB.scrollTop = DOM.paneScrollA.scrollTop;
        DOM.paneScrollB.scrollLeft = DOM.paneScrollA.scrollLeft;
        requestAnimationFrame(() => { isSyncingB = false; });
      });
    }

    if (DOM.paneScrollB) {
      DOM.paneScrollB.addEventListener("scroll", () => {
        if (!state.syncScroll || isSyncingB || !DOM.paneScrollA) return;
        isSyncingA = true;
        DOM.paneScrollA.scrollTop = DOM.paneScrollB.scrollTop;
        DOM.paneScrollA.scrollLeft = DOM.paneScrollB.scrollLeft;
        requestAnimationFrame(() => { isSyncingA = false; });
      });
    }

    // Real-Time 60fps Debounced Sensitivity Slider via requestAnimationFrame
    let sensitivityRaf = null;
    if (DOM.sensitivitySlider) {
      DOM.sensitivitySlider.addEventListener("input", (e) => {
        state.diffSensitivity = parseInt(e.target.value, 10);
        if (DOM.sensitivityVal) DOM.sensitivityVal.textContent = state.diffSensitivity;

        if (sensitivityRaf) cancelAnimationFrame(sensitivityRaf);
        sensitivityRaf = requestAnimationFrame(() => {
          PageCache.invalidateDiff(state.currentPage);
          if (renderPage) renderPage(true);
        });
      });
    }

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (!DOM.studio || !DOM.studio.classList.contains("active")) return;

      if (e.key === "[" || (e.altKey && e.key === "ArrowLeft")) {
        e.preventDefault();
        goToPrevDifference();
      } else if (e.key === "]" || (e.altKey && e.key === "ArrowRight")) {
        e.preventDefault();
        goToNextDifference();
      } else if (e.key === "ArrowLeft" && !e.altKey && !e.shiftKey) {
        if (state.currentPage > 1) {
          state.currentPage--;
          if (renderPage) renderPage();
        }
      } else if (e.key === "ArrowRight" && !e.altKey && !e.shiftKey) {
        if (state.currentPage < state.totalPages) {
          state.currentPage++;
          if (renderPage) renderPage();
        }
      }
    });

    // Exports
    if (DOM.btnExportPdf) {
      const exportReport = exporter.exportAuditReport || window.PDFCompare.exportAuditReport;
      if (exportReport) DOM.btnExportPdf.addEventListener("click", exportReport);
    }
    if (DOM.btnExportPng) {
      const exportPng = exporter.exportDiffPng || window.PDFCompare.exportDiffPng;
      if (exportPng) DOM.btnExportPng.addEventListener("click", exportPng);
    }
    if (DOM.btnPrint) DOM.btnPrint.addEventListener("click", () => window.print());

    // Recovery Session
    if (DOM.recoveryBtn && restoreStorage) {
      DOM.recoveryBtn.addEventListener("click", restoreStorage);
    }

    // FAQ Accordion
    document.querySelectorAll(".faq-q").forEach((q) => {
      q.addEventListener("click", () => {
        const item = q.parentElement;
        item.classList.toggle("open");
      });
    });

    // Mobile Hamburger Menu
    if (DOM.hamburgerBtn && DOM.sideMenu && DOM.sideOverlay && DOM.closeMenuBtn) {
      DOM.hamburgerBtn.addEventListener("click", () => {
        DOM.sideMenu.classList.add("active");
        DOM.sideOverlay.classList.add("active");
      });
      DOM.closeMenuBtn.addEventListener("click", () => {
        DOM.sideMenu.classList.remove("active");
        DOM.sideOverlay.classList.remove("active");
      });
      DOM.sideOverlay.addEventListener("click", () => {
        DOM.sideMenu.classList.remove("active");
        DOM.sideOverlay.classList.remove("active");
      });
    }

    // Back to top
    if (DOM.b2t) {
      window.addEventListener("scroll", () => {
        DOM.b2t.classList.toggle("visible", window.scrollY > 400);
      });
      DOM.b2t.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    // Theme toggle
    if (DOM.themeToggle) {
      const THEME_KEY = (window.PDFCompare.constants && window.PDFCompare.constants.THEME_KEY) || "pdfmaster-theme";
      DOM.themeToggle.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem(THEME_KEY, newTheme);
        sessionStorage.setItem("pdfmaster_user_toggled_theme", "true");
        if (utils.updateThemeIcons) utils.updateThemeIcons(newTheme);
      });
    }
  }

  // Expose UI API
  window.PDFCompare.ui = {
    updatePageIndicator,
    updateDiffNavButtons,
    goToNextDifference,
    goToPrevDifference,
    updateToolbarSummary,
    renderDrawerList,
    updateDrawerActive,
    initEvents
  };

  // Top-level debugging shortcuts
  window.PDFCompare.updatePageIndicator = updatePageIndicator;
  window.PDFCompare.updateDiffNavButtons = updateDiffNavButtons;
  window.PDFCompare.goToNextDifference = goToNextDifference;
  window.PDFCompare.goToPrevDifference = goToPrevDifference;
  window.PDFCompare.renderDrawerList = renderDrawerList;
  window.PDFCompare.updateToolbarSummary = updateToolbarSummary;
})();
