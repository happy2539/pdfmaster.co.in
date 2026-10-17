/**
 * PDFMaster - Sign PDF Tool
 * Module: main.js
 * Modal controllers, top toolbar bindings, global UI interactions, and app initialization
 */
(function () {
  "use strict";

  window.PDFSign = window.PDFSign || {};
  const PDFSign = window.PDFSign;
  const state = PDFSign.state;

  // DOM Elements - Studio Modal
  const sigStudioModal = document.getElementById("sigStudioModal");
  const closeStudioBtn = document.getElementById("closeStudioBtn");
  const studioModalTitle = document.getElementById("studioModalTitle");
  const studioTabs = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const saveForLaterCheckbox = document.getElementById("saveForLaterCheckbox");
  const cancelStudioBtn = document.getElementById("cancelStudioBtn");
  const applyStudioBtn = document.getElementById("applyStudioBtn");

  // DOM Elements - Top Toolbar & Inputs
  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const workspace = document.getElementById("workspace");
  const changeFileBtn = document.getElementById("changeFileBtn");
  const startOverBtn = document.getElementById("startOverBtn");
  const resultStartOverBtn = document.getElementById("resultStartOverBtn");
  const resultsCard = document.getElementById("resultsCard");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");

  // DOM Elements - Quick Action Buttons
  const addSigBtn = document.getElementById("addSigBtn");
  const addInitialsBtn = document.getElementById("addInitialsBtn");
  const addDateBtn = document.getElementById("addDateBtn");
  const addTextBtn = document.getElementById("addTextBtn");

  // DOM Elements - Recovery
  const recoveryBtn = document.getElementById("recoveryBtn");
  const restoreRecoveryBtn = document.getElementById("restoreRecoveryBtn");
  const dismissRecoveryBtn = document.getElementById("dismissRecoveryBtn");

  // DOM Elements - Global UI
  const themeToggle = document.getElementById("themeToggle");
  const sunIcon = document.getElementById("sunIcon");
  const moonIcon = document.getElementById("moonIcon");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sideMenu = document.getElementById("sideMenu");
  const sideOverlay = document.getElementById("sideOverlay");
  const closeMenuBtn = document.getElementById("closeMenuBtn");
  const backTop = document.getElementById("backTop");

  // =============================================
  //  SIGNATURE STUDIO MODAL CONTROLLER
  // =============================================
  PDFSign.openStudioModal = function (mode = "signature") {
    state.studio.mode = mode;
    if (studioModalTitle) {
      studioModalTitle.textContent =
        mode === "initials" ? "Add Your Initials" : "Create Signature";
    }

    if (sigStudioModal) {
      sigStudioModal.classList.add("active");
    }

    if (PDFSign.initDrawCanvas) PDFSign.initDrawCanvas();
    if (PDFSign.renderTypePreview) PDFSign.renderTypePreview();
  };

  PDFSign.closeStudioModal = function () {
    if (sigStudioModal) {
      sigStudioModal.classList.remove("active");
    }
  };

  studioTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      state.studio.activeTab = target;

      studioTabs.forEach((t) => t.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const pane = document.getElementById(`tabPane_${target}`);
      if (pane) pane.classList.add("active");

      if (target === "draw") {
        setTimeout(() => {
          if (PDFSign.initDrawCanvas) PDFSign.initDrawCanvas();
        }, 50);
      } else if (target === "type") {
        if (PDFSign.renderTypePreview) PDFSign.renderTypePreview();
      } else if (target === "saved") {
        if (PDFSign.renderSavedSignaturesGrid) {
          PDFSign.renderSavedSignaturesGrid();
        }
      }
    });
  });

  if (applyStudioBtn) {
    applyStudioBtn.addEventListener("click", () => {
      let res = null;
      const tab = state.studio.activeTab;

      if (tab === "draw") {
        res = PDFSign.getDrawCanvasTrimmedPng
          ? PDFSign.getDrawCanvasTrimmedPng()
          : null;
        if (!res) {
          PDFSign.showToast("Please draw a signature first.");
          return;
        }
      } else if (tab === "type") {
        res = PDFSign.getTypeCanvasTrimmedPng
          ? PDFSign.getTypeCanvasTrimmedPng()
          : null;
        if (!res) {
          PDFSign.showToast("Please enter text.");
          return;
        }
      } else if (tab === "upload") {
        res = PDFSign.getUploadedCanvasTrimmedPng
          ? PDFSign.getUploadedCanvasTrimmedPng()
          : null;
        if (!res) {
          PDFSign.showToast("Please upload an image first.");
          return;
        }
      }

      if (res && res.dataUrl) {
        if (saveForLaterCheckbox && saveForLaterCheckbox.checked) {
          PDFSign.saveSignatureToLibrary(res.dataUrl, state.studio.mode);
        }
        PDFSign.useSignatureData(
          res.dataUrl,
          state.studio.mode,
          res.aspectRatio,
        );
        PDFSign.closeStudioModal();
      }
    });
  }

  if (closeStudioBtn)
    closeStudioBtn.addEventListener("click", PDFSign.closeStudioModal);
  if (cancelStudioBtn)
    cancelStudioBtn.addEventListener("click", PDFSign.closeStudioModal);

  // =============================================
  //  TOOLBAR BINDINGS
  // =============================================
  if (browseBtn)
    browseBtn.addEventListener("click", () => fileInput && fileInput.click());

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        PDFSign.handleFileSelect(e.target.files[0]);
      }
    });
  }

  if (uploadZone) {
    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("drag-over");
    });
    uploadZone.addEventListener("dragleave", () => {
      uploadZone.classList.remove("drag-over");
    });
    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("drag-over");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        PDFSign.handleFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  if (changeFileBtn) {
    changeFileBtn.addEventListener("click", () => {
      if (fileInput) fileInput.click();
    });
  }

  if (startOverBtn || resultStartOverBtn) {
    const resetFn = () => {
      if (
        state.items.length > 0 &&
        !confirm(
          "Start over? Any unsaved signatures on this document will be lost.",
        )
      ) {
        return;
      }
      state.pdfJsDoc = null;
      state.currentBlob = null;
      state.arrayBuffer = null;
      state.items = [];
      PDFSign.clearRecoverySession();
      if (workspace) workspace.classList.remove("active");
      if (resultsCard) resultsCard.classList.remove("active");
      if (uploadZone) uploadZone.style.display = "block";
      PDFSign.showToast("Reset to start");
    };
    if (startOverBtn) startOverBtn.addEventListener("click", resetFn);
    if (resultStartOverBtn)
      resultStartOverBtn.addEventListener("click", resetFn);
  }

  if (undoBtn) undoBtn.addEventListener("click", PDFSign.undo);
  if (redoBtn) redoBtn.addEventListener("click", PDFSign.redo);

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      state.zoom = Math.min(2.5, state.zoom + 0.15);
      state.fitWidth = false;
      PDFSign.renderActivePage();
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      state.zoom = Math.max(0.5, state.zoom - 0.15);
      state.fitWidth = false;
      PDFSign.renderActivePage();
    });
  }

  if (prevPageBtn)
    prevPageBtn.addEventListener("click", () =>
      PDFSign.switchPage(state.currentPage - 1),
    );
  if (nextPageBtn)
    nextPageBtn.addEventListener("click", () =>
      PDFSign.switchPage(state.currentPage + 1),
    );

  if (addSigBtn)
    addSigBtn.addEventListener("click", () =>
      PDFSign.openStudioModal("signature"),
    );
  if (addInitialsBtn)
    addInitialsBtn.addEventListener("click", () =>
      PDFSign.openStudioModal("initials"),
    );
  if (addDateBtn)
    addDateBtn.addEventListener("click", () => {
      if (PDFSign.openDateStamp) PDFSign.openDateStamp();
    });
  if (addTextBtn)
    addTextBtn.addEventListener("click", () => {
      if (PDFSign.openTextStampPrompt) PDFSign.openTextStampPrompt();
    });

  if (restoreRecoveryBtn)
    restoreRecoveryBtn.addEventListener("click", PDFSign.restoreSession);
  if (dismissRecoveryBtn)
    dismissRecoveryBtn.addEventListener("click", PDFSign.clearRecoverySession);
  if (recoveryBtn) {
    recoveryBtn.addEventListener("click", () => {
      PDFSign.restoreSession();
    });
  }

  // =============================================
  //  THEME TOGGLE & GLOBAL UI
  // =============================================
  PDFSign.initTheme = function () {
    const saved = localStorage.getItem(PDFSign.THEME_KEY) || "light";
    document.documentElement.setAttribute("data-theme", saved);
    PDFSign.updateThemeIcons(saved);
  };

  PDFSign.toggleTheme = function () {
    const current =
      document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(PDFSign.THEME_KEY, next);
    PDFSign.updateThemeIcons(next);
  };

  PDFSign.updateThemeIcons = function (theme) {
    if (sunIcon && moonIcon) {
      if (theme === "dark") {
        sunIcon.style.display = "block";
        moonIcon.style.display = "none";
      } else {
        sunIcon.style.display = "none";
        moonIcon.style.display = "block";
      }
    }
  };

  if (themeToggle) {
    themeToggle.addEventListener("click", PDFSign.toggleTheme);
  }

  // Mobile Menu
  if (hamburgerBtn && sideMenu && sideOverlay) {
    hamburgerBtn.addEventListener("click", () => {
      sideMenu.classList.add("active");
      sideOverlay.classList.add("active");
    });

    const closeSide = () => {
      sideMenu.classList.remove("active");
      sideOverlay.classList.remove("active");
    };

    if (closeMenuBtn) closeMenuBtn.addEventListener("click", closeSide);
    sideOverlay.addEventListener("click", closeSide);
  }

  // Back to Top
  if (backTop) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 400) {
        backTop.classList.add("visible");
      } else {
        backTop.classList.remove("visible");
      }
    });

    backTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // FAQ Accordion
  document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const wasActive = item.classList.contains("active");
      document
        .querySelectorAll(".faq-item")
        .forEach((f) => f.classList.remove("active"));
      if (!wasActive) {
        item.classList.add("active");
      }
    });
  });

  // =============================================
  //  INIT ON DOM CONTENT LOADED
  // =============================================
  document.addEventListener("DOMContentLoaded", () => {
    PDFSign.initTheme();
    PDFSign.loadSavedSignatures();
    PDFSign.checkRecoverySession();
  });
})();
