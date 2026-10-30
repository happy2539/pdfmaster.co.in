/**
 * PDFMaster - Compare PDF Tool (Visual & Text PDF Comparison Engine)
 * ------------------------------------------------------------------
 * 100% Client-Side In-Browser Comparison
 * Features:
 *   - Dual Document Ingestion with Drag & Drop & Swap
 *   - Instant Sample PDF Generator using PDF-Lib
 *   - Side-by-Side Synchronized Scroll & Zoom (Fit Width, Fit Page, 100%)
 *   - Pixel-by-Pixel Visual Diff Engine with Bounding Highlight Clouds & Delta Mask
 *   - Flicker A/B Mode for spotting subtle alignment / layout shifts
 *   - Change Inspector Drawer with Page Jump & Difference Badges
 *   - Export Comparison Audit Report (PDF via jsPDF) & Diff PNG
 *   - Universal Thank You & Download Popup Modal integration
 *   - IndexedDB Session Recovery
 */

(function () {
  "use strict";

  // Configure PDF.js Worker
  if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
  }

  // Database Constants
  const DB_NAME = "pdfmaster_compare_db";
  const DB_VERSION = 1;
  const THEME_KEY = "pdfmaster-theme";

  // State
  const state = {
    fileA: null, // { file, buffer, name, size, pdfDoc, pageCount, textPages: [] }
    fileB: null, // { file, buffer, name, size, pdfDoc, pageCount, textPages: [] }
    currentPage: 1,
    totalPages: 1,
    currentMode: "sideBySide", // 'sideBySide' | 'visualDiff'
    visualDiffSubmode: "highlight", // 'highlight' | 'deltaMask' | 'flicker'
    zoomMode: "fitWidth", // 'fitWidth' | 'fitPage' | 'custom'
    customZoom: 1.0,
    syncScroll: true,
    diffSensitivity: 35,
    differences: [], // [{ pageNum, hasDiff, diffPercent, addedWords, deletedWords, diffBoxes: [], status }]
    ignoreCase: false,
    ignoreWhitespace: true,
    isComparing: false,
    flickerTimer: null,
    flickerStateA: true
  };

  // DOM Elements Cache
  const DOM = {};

  function initDOM() {
    DOM.slotA = document.getElementById("slotA");
    DOM.slotB = document.getElementById("slotB");
    DOM.fileInputA = document.getElementById("fileInputA");
    DOM.fileInputB = document.getElementById("fileInputB");
    DOM.btnBrowseA = document.getElementById("btnBrowseA");
    DOM.btnBrowseB = document.getElementById("btnBrowseB");
    DOM.btnSwap = document.getElementById("btnSwap");
    DOM.btnSample = document.getElementById("btnSample");
    DOM.btnCompare = document.getElementById("btnCompare");
    DOM.btnReset = document.getElementById("btnReset");

    // Studio Elements
    DOM.studio = document.getElementById("compareStudio");
    DOM.modeTabs = document.querySelectorAll(".mode-tab");
    DOM.viewportPanels = document.querySelectorAll(".viewport-content");
    DOM.btnPrevPage = document.getElementById("btnPrevPage");
    DOM.btnNextPage = document.getElementById("btnNextPage");
    DOM.pageIndicator = document.getElementById("pageIndicator");

    // Zoom Controls
    DOM.btnZoomIn = document.getElementById("btnZoomIn");
    DOM.btnZoomOut = document.getElementById("btnZoomOut");
    DOM.btnFitWidth = document.getElementById("btnFitWidth");
    DOM.btnFitPage = document.getElementById("btnFitPage");
    DOM.btnActualSize = document.getElementById("btnActualSize");
    DOM.zoomIndicator = document.getElementById("zoomIndicator");

    DOM.syncScrollCheck = document.getElementById("syncScrollCheck");
    DOM.sensitivitySlider = document.getElementById("sensitivitySlider");
    DOM.sensitivityVal = document.getElementById("sensitivityVal");

    // Canvases
    DOM.paneScrollA = document.getElementById("paneScrollA");
    DOM.paneScrollB = document.getElementById("paneScrollB");
    DOM.wrapA = document.getElementById("wrapA");
    DOM.wrapB = document.getElementById("wrapB");
    DOM.canvasA = document.getElementById("canvasA");
    DOM.canvasB = document.getElementById("canvasB");
    DOM.highlightLayerA = document.getElementById("highlightLayerA");
    DOM.highlightLayerB = document.getElementById("highlightLayerB");

    // Visual Diff Elements
    DOM.visualDiffScroll = document.getElementById("visualDiffScroll");
    DOM.wrapDiff = document.getElementById("wrapDiff");
    DOM.diffOverlayCanvas = document.getElementById("diffOverlayCanvas");
    DOM.diffHighlightLayer = document.getElementById("diffHighlightLayer");
    DOM.diffPageBanner = document.getElementById("diffPageBanner");
    DOM.btnDiffHighlight = document.getElementById("btnDiffHighlight");
    DOM.btnDiffMask = document.getElementById("btnDiffMask");
    DOM.btnDiffFlicker = document.getElementById("btnDiffFlicker");

    // Drawer
    DOM.drawerList = document.getElementById("drawerList");
    DOM.drawerCount = document.getElementById("drawerCount");

    // Exports
    DOM.btnExportPdf = document.getElementById("btnExportPdf");
    DOM.btnExportPng = document.getElementById("btnExportPng");
    DOM.btnPrint = document.getElementById("btnPrint");
    DOM.exportMeta = document.getElementById("exportMeta");

    // Loading Modal
    DOM.loadingModal = document.getElementById("loadingModalOverlay");
    DOM.loadingTitle = document.getElementById("loadingModalTitle");
    DOM.loadingSub = document.getElementById("loadingModalSub");
    DOM.progressFill = document.getElementById("progressFill");
    DOM.loadingPct = document.getElementById("loadingPct");

    // Navbar & System
    DOM.themeToggle = document.getElementById("themeToggle") || document.getElementById("themeBtn");
    DOM.sunIcon = document.getElementById("sunIcon");
    DOM.moonIcon = document.getElementById("moonIcon");
    DOM.hamburgerBtn = document.getElementById("hamburgerBtn");
    DOM.sideMenu = document.getElementById("sideMenu");
    DOM.sideOverlay = document.getElementById("sideOverlay");
    DOM.closeMenuBtn = document.getElementById("closeMenuBtn");
    DOM.recoveryBtn = document.getElementById("recoveryBtn");
    DOM.recoveryBadge = document.getElementById("recoveryBadge");
    DOM.b2t = document.getElementById("b2t");
    DOM.toastContainer = document.getElementById("toastContainer");
  }

  // =========================================================================
  //  TOAST & NOTIFICATIONS
  // =========================================================================
  function showToast(message, type = "info", duration = 3500) {
    if (!DOM.toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type}`;

    let iconSvg = "";
    if (type === "success") {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === "error") {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      toast.style.transition = "all 0.25s ease";
      setTimeout(() => toast.remove(), 260);
    }, duration);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m]);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const dm = 1;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  // =========================================================================
  //  LOADING PROGRESS MODAL
  // =========================================================================
  function showLoading(show, title = "Processing PDFs", sub = "Analyzing documents...") {
    if (!DOM.loadingModal) return;
    if (show) {
      DOM.loadingTitle.textContent = title;
      DOM.loadingSub.textContent = sub;
      DOM.progressFill.style.width = "0%";
      DOM.loadingPct.textContent = "0%";
      DOM.loadingModal.classList.add("active");
    } else {
      DOM.loadingModal.classList.remove("active");
    }
  }

  function updateLoadingProgress(pct, subText) {
    if (DOM.progressFill) DOM.progressFill.style.width = `${pct}%`;
    if (DOM.loadingPct) DOM.loadingPct.textContent = `${Math.round(pct)}%`;
    if (subText && DOM.loadingSub) DOM.loadingSub.textContent = subText;
  }

  // =========================================================================
  //  INDEXEDDB SESSION RECOVERY
  // =========================================================================
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("session")) {
          db.createObjectStore("session", { keyPath: "key" });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveSessionToDB() {
    if (!state.fileA || !state.fileB) return;
    try {
      const db = await openDatabase();
      const tx = db.transaction("session", "readwrite");
      const store = tx.objectStore("session");
      const data = {
        key: "current_comparison",
        timestamp: Date.now(),
        fileA: {
          name: state.fileA.name,
          size: state.fileA.size,
          buffer: state.fileA.buffer
        },
        fileB: {
          name: state.fileB.name,
          size: state.fileB.size,
          buffer: state.fileB.buffer
        },
        mode: state.currentMode,
        zoomMode: state.zoomMode,
        customZoom: state.customZoom,
        sensitivity: state.diffSensitivity
      };
      store.put(data);
      if (DOM.recoveryBadge) DOM.recoveryBadge.style.display = "block";
    } catch (err) {
      console.warn("Could not save comparison session to IndexedDB:", err);
    }
  }

  async function checkSavedSession() {
    try {
      const db = await openDatabase();
      const tx = db.transaction("session", "readonly");
      const store = tx.objectStore("session");
      const req = store.get("current_comparison");
      req.onsuccess = () => {
        if (req.result && DOM.recoveryBadge) {
          DOM.recoveryBadge.style.display = "block";
          if (DOM.recoveryBtn) {
            DOM.recoveryBtn.title = `Restore saved session: "${req.result.fileA.name}" vs "${req.result.fileB.name}"`;
          }
        }
      };
    } catch (e) {}
  }

  async function restoreSessionFromDB() {
    try {
      const db = await openDatabase();
      const tx = db.transaction("session", "readonly");
      const store = tx.objectStore("session");
      const req = store.get("current_comparison");
      req.onsuccess = async () => {
        const res = req.result;
        if (!res) {
          showToast("No saved comparison session found in recovery storage.", "info");
          return;
        }

        showLoading(true, "Restoring Session", "Restoring documents from local storage...");
        await loadFileFromBuffer(res.fileA.buffer, res.fileA.name, "A");
        await loadFileFromBuffer(res.fileB.buffer, res.fileB.name, "B");
        if (res.mode) state.currentMode = res.mode;
        if (res.zoomMode) state.zoomMode = res.zoomMode;
        if (res.customZoom) state.customZoom = res.customZoom;
        if (res.sensitivity) state.diffSensitivity = res.sensitivity;

        showLoading(false);
        showToast("Previous comparison session successfully restored!", "success");
        await runComparison();
      };
    } catch (err) {
      showToast("Failed to restore session.", "error");
    }
  }

  async function clearSessionFromDB() {
    try {
      const db = await openDatabase();
      const tx = db.transaction("session", "readwrite");
      tx.objectStore("session").clear();
      if (DOM.recoveryBadge) DOM.recoveryBadge.style.display = "none";
    } catch (e) {}
  }

  // =========================================================================
  //  DOCUMENT LOADING & THUMBNAILS
  // =========================================================================
  async function handleFileSelected(file, slot) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Please select a valid PDF file.", "error");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      await loadFileFromBuffer(buffer, file.name, slot, file);
    } catch (err) {
      console.error(err);
      showToast(`Error reading file: ${err.message}`, "error");
    }
  }

  async function loadFileFromBuffer(buffer, fileName, slot, originalFile = null) {
    let pdfDoc = null;
    try {
      const loadingTask = window.pdfjsLib.getDocument({
        data: buffer.slice(0),
        cMapUrl: "/assets/vendor/cmaps/",
        cMapPacked: true
      });
      pdfDoc = await loadingTask.promise;
    } catch (err) {
      if (err.name === "PasswordException") {
        const pwd = prompt(`"${fileName}" is password protected. Enter password:`);
        if (pwd) {
          const loadingTask = window.pdfjsLib.getDocument({
            data: buffer.slice(0),
            password: pwd
          });
          pdfDoc = await loadingTask.promise;
        } else {
          showToast("Password required to open this PDF.", "error");
          return;
        }
      } else {
        throw err;
      }
    }

    const docData = {
      file: originalFile,
      buffer: buffer,
      name: fileName,
      size: buffer.byteLength,
      pdfDoc: pdfDoc,
      pageCount: pdfDoc.numPages,
      textPages: []
    };

    if (slot === "A") {
      state.fileA = docData;
      renderSlotLoaded(DOM.slotA, docData, "A");
    } else {
      state.fileB = docData;
      renderSlotLoaded(DOM.slotB, docData, "B");
    }

    checkCompareButtonState();
  }

  async function renderSlotLoaded(slotEl, docData, slotKey) {
    slotEl.classList.add("has-file");
    slotEl.innerHTML = `
      <div class="slot-badge">${slotKey === "A" ? "Document A (Original)" : "Document B (Modified)"}</div>
      <div class="slot-file-card">
        <div class="slot-thumb-wrap" id="thumbWrap_${slotKey}">
          <canvas id="thumbCanvas_${slotKey}"></canvas>
        </div>
        <div class="slot-file-name" title="${escapeHtml(docData.name)}">${escapeHtml(docData.name)}</div>
        <div class="slot-file-meta">${formatBytes(docData.size)} · ${docData.pageCount} page${docData.pageCount === 1 ? "" : "s"}</div>
        <div class="slot-actions">
          <button type="button" class="btn-slot-replace" id="btnReplace_${slotKey}">Change File</button>
        </div>
      </div>
    `;

    // Render Page 1 thumbnail
    try {
      const page = await docData.pdfDoc.getPage(1);
      const thumbCanvas = document.getElementById(`thumbCanvas_${slotKey}`);
      if (thumbCanvas) {
        const viewport = page.getViewport({ scale: 0.25 });
        thumbCanvas.width = viewport.width;
        thumbCanvas.height = viewport.height;
        const ctx = thumbCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
      }
    } catch (e) {
      console.warn("Thumbnail render skipped", e);
    }

    // Reattach change file event
    const btnReplace = document.getElementById(`btnReplace_${slotKey}`);
    if (btnReplace) {
      btnReplace.addEventListener("click", (e) => {
        e.stopPropagation();
        if (slotKey === "A") DOM.fileInputA.click();
        else DOM.fileInputB.click();
      });
    }
  }

  function resetSlot(slotKey) {
    if (slotKey === "A") {
      state.fileA = null;
      DOM.slotA.classList.remove("has-file");
      DOM.slotA.innerHTML = `
        <div class="slot-badge">Document A (Original)</div>
        <div class="slot-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="slot-title">Original PDF</div>
        <div class="slot-subtitle">Drag & drop baseline file, or</div>
        <button type="button" class="btn-browse" id="btnBrowseA">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Browse Document A
        </button>
      `;
      document.getElementById("btnBrowseA").addEventListener("click", (e) => {
        e.stopPropagation();
        DOM.fileInputA.click();
      });
    } else {
      state.fileB = null;
      DOM.slotB.classList.remove("has-file");
      DOM.slotB.innerHTML = `
        <div class="slot-badge">Document B (Modified)</div>
        <div class="slot-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="slot-title">Modified PDF</div>
        <div class="slot-subtitle">Drag & drop revised file, or</div>
        <button type="button" class="btn-browse" id="btnBrowseB">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Browse Document B
        </button>
      `;
      document.getElementById("btnBrowseB").addEventListener("click", (e) => {
        e.stopPropagation();
        DOM.fileInputB.click();
      });
    }
    checkCompareButtonState();
  }

  function swapDocuments() {
    if (!state.fileA && !state.fileB) return;
    const temp = state.fileA;
    state.fileA = state.fileB;
    state.fileB = temp;

    if (state.fileA) renderSlotLoaded(DOM.slotA, state.fileA, "A");
    else resetSlot("A");

    if (state.fileB) renderSlotLoaded(DOM.slotB, state.fileB, "B");
    else resetSlot("B");

    checkCompareButtonState();
    showToast("Swapped Document A and Document B.", "info");

    if (DOM.studio.classList.contains("active")) {
      runComparison();
    }
  }

  function checkCompareButtonState() {
    if (DOM.btnCompare) {
      DOM.btnCompare.disabled = !(state.fileA && state.fileB);
    }
  }

  // =========================================================================
  //  SAMPLE DOCUMENT GENERATOR (PDF-Lib Instant Demo)
  // =========================================================================
  async function generateSampleDocuments() {
    if (!window.PDFLib) {
      showToast("PDF generator library is still loading. Please wait a moment.", "info");
      return;
    }

    showLoading(true, "Generating Sample Files", "Creating sample contracts with differences...");

    try {
      const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

      // Sample 1: Baseline Agreement v1.0
      const docA = await PDFDocument.create();
      const timesRoman = await docA.embedFont(StandardFonts.TimesRoman);
      const timesBold = await docA.embedFont(StandardFonts.TimesRomanBold);

      const pageA1 = docA.addPage([595.28, 841.89]); // A4
      pageA1.drawText("MASTER SERVICE AGREEMENT", { x: 50, y: 780, size: 20, font: timesBold, color: rgb(0.1, 0.1, 0.1) });
      pageA1.drawText("Document Version: 1.0 (Initial Draft)", { x: 50, y: 755, size: 10, font: timesRoman, color: rgb(0.4, 0.4, 0.4) });
      pageA1.drawText("Date: October 1, 2026", { x: 50, y: 740, size: 10, font: timesRoman, color: rgb(0.4, 0.4, 0.4) });

      pageA1.drawText("1. Scope of Services", { x: 50, y: 700, size: 13, font: timesBold, color: rgb(0.1, 0.1, 0.1) });
      pageA1.drawText("The Contractor agrees to provide cloud infrastructure architecture, database optimization,", { x: 50, y: 680, size: 10.5, font: timesRoman });
      pageA1.drawText("and continuous client-side security audits for the Client during the Term of 12 months.", { x: 50, y: 665, size: 10.5, font: timesRoman });

      pageA1.drawText("2. Payment Terms", { x: 50, y: 625, size: 13, font: timesBold, color: rgb(0.1, 0.1, 0.1) });
      pageA1.drawText("Invoices shall be submitted monthly and paid within thirty (30) calendar days from receipt.", { x: 50, y: 605, size: 10.5, font: timesRoman });
      pageA1.drawText("Late payments shall accrue interest at 1.5% per month.", { x: 50, y: 590, size: 10.5, font: timesRoman });

      pageA1.drawText("3. Limitation of Liability", { x: 50, y: 550, size: 13, font: timesBold, color: rgb(0.1, 0.1, 0.1) });
      pageA1.drawText("In no event shall either party's aggregate liability exceed the total amount of $10,000 USD", { x: 50, y: 530, size: 10.5, font: timesRoman });
      pageA1.drawText("actually paid by Client to Contractor under this Agreement.", { x: 50, y: 515, size: 10.5, font: timesRoman });

      // Page A2
      const pageA2 = docA.addPage([595.28, 841.89]);
      pageA2.drawText("4. Termination & Signatures", { x: 50, y: 780, size: 13, font: timesBold, color: rgb(0.1, 0.1, 0.1) });
      pageA2.drawText("Either party may terminate this agreement upon thirty (30) days written notice.", { x: 50, y: 760, size: 10.5, font: timesRoman });
      pageA2.drawText("Signed for Contractor: _______________________ Date: ________", { x: 50, y: 680, size: 10, font: timesRoman });
      pageA2.drawText("Signed for Client:     _______________________ Date: ________", { x: 50, y: 630, size: 10, font: timesRoman });

      const bytesA = await docA.save();

      // Sample 2: Revised Agreement v2.0 (Contains modifications)
      const docB = await PDFDocument.create();
      const timesRomanB = await docB.embedFont(StandardFonts.TimesRoman);
      const timesBoldB = await docB.embedFont(StandardFonts.TimesRomanBold);

      const pageB1 = docB.addPage([595.28, 841.89]);
      pageB1.drawText("MASTER SERVICE AGREEMENT", { x: 50, y: 780, size: 20, font: timesBoldB, color: rgb(0.1, 0.1, 0.1) });
      pageB1.drawText("Document Version: 2.0 (Final Revised)", { x: 50, y: 755, size: 10, font: timesBoldB, color: rgb(0.8, 0.2, 0.1) }); // CHANGED
      pageB1.drawText("Date: October 25, 2026", { x: 50, y: 740, size: 10, font: timesRomanB, color: rgb(0.4, 0.4, 0.4) }); // CHANGED

      pageB1.drawText("1. Scope of Services", { x: 50, y: 700, size: 13, font: timesBoldB, color: rgb(0.1, 0.1, 0.1) });
      pageB1.drawText("The Contractor agrees to provide cloud infrastructure architecture, database optimization,", { x: 50, y: 680, size: 10.5, font: timesRomanB });
      pageB1.drawText("and continuous client-side security audits for the Client during the Term of 24 months.", { x: 50, y: 665, size: 10.5, font: timesRomanB }); // CHANGED (24 months)

      pageB1.drawText("2. Payment Terms", { x: 50, y: 625, size: 13, font: timesBoldB, color: rgb(0.1, 0.1, 0.1) });
      pageB1.drawText("Invoices shall be submitted bi-weekly and paid within fifteen (15) calendar days.", { x: 50, y: 605, size: 10.5, font: timesRomanB }); // CHANGED (15 days)
      pageB1.drawText("Late payments shall accrue interest at 2.0% per month.", { x: 50, y: 590, size: 10.5, font: timesRomanB }); // CHANGED (2.0%)

      pageB1.drawText("3. Limitation of Liability", { x: 50, y: 550, size: 13, font: timesBoldB, color: rgb(0.1, 0.1, 0.1) });
      pageB1.drawText("In no event shall either party's aggregate liability exceed the total amount of $50,000 USD", { x: 50, y: 530, size: 10.5, font: timesRomanB }); // CHANGED ($50,000)
      pageB1.drawText("actually paid by Client to Contractor under this Agreement.", { x: 50, y: 515, size: 10.5, font: timesRomanB });

      // ADDED CLAUSE in Doc B
      pageB1.drawText("3.1 Confidentiality & IP Rights", { x: 50, y: 475, size: 12, font: timesBoldB, color: rgb(0.1, 0.5, 0.2) });
      pageB1.drawText("All proprietary algorithms and patents remain the exclusive property of Contractor.", { x: 50, y: 455, size: 10.5, font: timesRomanB });

      // Page B2
      const pageB2 = docB.addPage([595.28, 841.89]);
      pageB2.drawText("4. Termination & Signatures", { x: 50, y: 780, size: 13, font: timesBoldB, color: rgb(0.1, 0.1, 0.1) });
      pageB2.drawText("Either party may terminate this agreement upon thirty (30) days written notice.", { x: 50, y: 760, size: 10.5, font: timesRomanB });
      pageB2.drawText("Signed for Contractor: _______________________ Date: ________", { x: 50, y: 680, size: 10, font: timesRomanB });
      pageB2.drawText("Signed for Client:     _______________________ Date: ________", { x: 50, y: 630, size: 10, font: timesRomanB });

      const bytesB = await docB.save();

      await loadFileFromBuffer(bytesA.buffer, "Sample_Agreement_v1.0.pdf", "A");
      await loadFileFromBuffer(bytesB.buffer, "Sample_Agreement_v2.0_Revised.pdf", "B");

      showLoading(false);
      showToast("Loaded sample contracts! Click 'Compare Documents' to inspect changes.", "success");
      await runComparison();
    } catch (err) {
      showLoading(false);
      console.error(err);
      showToast("Failed to generate sample documents.", "error");
    }
  }

  // =========================================================================
  //  DIFF ANALYSIS ENGINE
  // =========================================================================
  async function runComparison() {
    if (!state.fileA || !state.fileB) return;
    state.isComparing = true;
    showLoading(true, "Comparing Documents", "Extracting text and analyzing changes...");

    state.totalPages = Math.max(state.fileA.pageCount, state.fileB.pageCount);
    state.currentPage = 1;
    state.differences = [];

    // Extract text from both files
    for (let p = 1; p <= state.totalPages; p++) {
      updateLoadingProgress((p / state.totalPages) * 60, `Analyzing page ${p} of ${state.totalPages}...`);

      let textA = "";
      if (p <= state.fileA.pageCount) {
        try {
          const page = await state.fileA.pdfDoc.getPage(p);
          const content = await page.getTextContent();
          textA = content.items.map((i) => i.str).join(" ");
        } catch (e) {}
      }
      state.fileA.textPages[p] = textA;

      let textB = "";
      if (p <= state.fileB.pageCount) {
        try {
          const page = await state.fileB.pdfDoc.getPage(p);
          const content = await page.getTextContent();
          textB = content.items.map((i) => i.str).join(" ");
        } catch (e) {}
      }
      state.fileB.textPages[p] = textB;

      // Compute word diff metrics
      const diffData = computeWordDiff(textA, textB);
      state.differences[p] = {
        pageNum: p,
        hasDiff: diffData.addedCount > 0 || diffData.deletedCount > 0 || p > state.fileA.pageCount || p > state.fileB.pageCount,
        addedWords: diffData.addedCount,
        deletedWords: diffData.deletedCount,
        diffTokens: diffData.tokens,
        diffBoxes: [],
        status: (diffData.addedCount === 0 && diffData.deletedCount === 0) ? "identical" : "changed"
      };
    }

    updateLoadingProgress(85, "Rendering comparison views...");
    saveSessionToDB();

    // Render Studio
    DOM.studio.classList.add("active");
    DOM.studio.scrollIntoView({ behavior: "smooth", block: "start" });

    renderDrawerList();
    updateToolbarSummary();
    await renderCurrentPage();

    showLoading(false);
    state.isComparing = false;
    showToast(`Comparison complete. ${getTotalDiffCount()} changed pages detected.`, "success");
  }

  function getTotalDiffCount() {
    return state.differences.filter((d) => d && d.hasDiff).length;
  }

  // =========================================================================
  //  WORD & LINE TEXT DIFF ALGORITHM
  // =========================================================================
  function computeWordDiff(strA, strB) {
    const wordsA = strA.trim() ? strA.trim().split(/\s+/) : [];
    const wordsB = strB.trim() ? strB.trim().split(/\s+/) : [];

    // Simple LCS / Myers diff for word tokens
    const n = wordsA.length;
    const m = wordsB.length;
    const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        if (wordsA[i] === wordsB[j]) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    // Backtrack to build tokens
    let i = n;
    let j = m;
    const tokens = [];
    let addedCount = 0;
    let deletedCount = 0;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
        tokens.unshift({ type: "equal", value: wordsA[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        tokens.unshift({ type: "insert", value: wordsB[j - 1] });
        addedCount++;
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        tokens.unshift({ type: "delete", value: wordsA[i - 1] });
        deletedCount++;
        i--;
      }
    }

    return { tokens, addedCount, deletedCount };
  }

  // =========================================================================
  //  SCALE & SIZING COMPUTATION (FIT WIDTH, FIT PAGE, ACTUAL SIZE)
  // =========================================================================
  function computePageScale(page, containerEl) {
    const unscaled = page.getViewport({ scale: 1.0 });
    const containerW = containerEl && containerEl.clientWidth > 100 ? containerEl.clientWidth : 500;
    const containerH = containerEl && containerEl.clientHeight > 100 ? containerEl.clientHeight : 600;
    const availW = Math.max(260, containerW - 48); // 24px padding on each side
    const availH = Math.max(280, containerH - 48);

    let scale = 1.0;
    let label = "100%";

    if (state.zoomMode === "fitWidth") {
      scale = availW / unscaled.width;
      label = "Fit Width";
    } else if (state.zoomMode === "fitPage") {
      scale = Math.min(availW / unscaled.width, availH / unscaled.height);
      label = "Fit Page";
    } else {
      scale = state.customZoom;
      label = `${Math.round(scale * 100)}%`;
    }

    // High DPI scaling factor
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.round(unscaled.width * scale);
    const cssHeight = Math.round(unscaled.height * scale);

    return {
      scale,
      cssWidth,
      cssHeight,
      dpr,
      pixelWidth: Math.round(cssWidth * dpr),
      pixelHeight: Math.round(cssHeight * dpr),
      label
    };
  }

  function updateZoomToolbarButtons() {
    if (DOM.btnFitWidth) DOM.btnFitWidth.classList.toggle("active", state.zoomMode === "fitWidth");
    if (DOM.btnFitPage) DOM.btnFitPage.classList.toggle("active", state.zoomMode === "fitPage");
    if (DOM.btnActualSize) DOM.btnActualSize.classList.toggle("active", state.zoomMode === "custom" && Math.abs(state.customZoom - 1.0) < 0.05);
  }

  // =========================================================================
  //  PAGE RENDERING DISPATCHER
  // =========================================================================
  async function renderCurrentPage() {
    updatePageIndicator();
    updateZoomToolbarButtons();

    // Clear any active flicker timers
    if (state.flickerTimer) {
      clearInterval(state.flickerTimer);
      state.flickerTimer = null;
    }

    if (state.currentMode === "sideBySide") {
      await renderSideBySide();
    } else if (state.currentMode === "visualDiff") {
      await renderVisualDiff();
    }

    updateDrawerActive();
  }

  // 1. Side-by-Side Rendering
  async function renderSideBySide() {
    const p = state.currentPage;

    // Clear highlight layers
    if (DOM.highlightLayerA) DOM.highlightLayerA.innerHTML = "";
    if (DOM.highlightLayerB) DOM.highlightLayerB.innerHTML = "";

    let pageA = null;
    let pageB = null;

    if (p <= state.fileA.pageCount) {
      pageA = await state.fileA.pdfDoc.getPage(p);
    }
    if (p <= state.fileB.pageCount) {
      pageB = await state.fileB.pdfDoc.getPage(p);
    }

    const refPage = pageA || pageB;
    if (!refPage) return;

    const sizing = computePageScale(refPage, DOM.paneScrollA);
    DOM.zoomIndicator.textContent = sizing.label;

    // Render Canvas A
    if (pageA) {
      DOM.canvasA.width = sizing.pixelWidth;
      DOM.canvasA.height = sizing.pixelHeight;
      DOM.canvasA.style.width = sizing.cssWidth + "px";
      DOM.canvasA.style.height = sizing.cssHeight + "px";
      DOM.wrapA.style.width = sizing.cssWidth + "px";
      DOM.wrapA.style.height = sizing.cssHeight + "px";

      const ctxA = DOM.canvasA.getContext("2d");
      ctxA.fillStyle = "#ffffff";
      ctxA.fillRect(0, 0, sizing.pixelWidth, sizing.pixelHeight);
      ctxA.save();
      ctxA.scale(sizing.dpr, sizing.dpr);

      const viewportA = pageA.getViewport({ scale: sizing.scale });
      await pageA.render({ canvasContext: ctxA, viewport: viewportA }).promise;
      ctxA.restore();
      DOM.canvasA.style.display = "block";
    } else {
      DOM.canvasA.style.display = "none";
    }

    // Render Canvas B
    if (pageB) {
      DOM.canvasB.width = sizing.pixelWidth;
      DOM.canvasB.height = sizing.pixelHeight;
      DOM.canvasB.style.width = sizing.cssWidth + "px";
      DOM.canvasB.style.height = sizing.cssHeight + "px";
      DOM.wrapB.style.width = sizing.cssWidth + "px";
      DOM.wrapB.style.height = sizing.cssHeight + "px";

      const ctxB = DOM.canvasB.getContext("2d");
      ctxB.fillStyle = "#ffffff";
      ctxB.fillRect(0, 0, sizing.pixelWidth, sizing.pixelHeight);
      ctxB.save();
      ctxB.scale(sizing.dpr, sizing.dpr);

      const viewportB = pageB.getViewport({ scale: sizing.scale });
      await pageB.render({ canvasContext: ctxB, viewport: viewportB }).promise;
      ctxB.restore();
      DOM.canvasB.style.display = "block";
    } else {
      DOM.canvasB.style.display = "none";
    }

    // Render side-by-side highlights if difference boxes exist
    const diffInfo = state.differences[p];
    if (diffInfo && diffInfo.diffBoxes && diffInfo.diffBoxes.length > 0) {
      renderSideBySideHighlightBoxes(diffInfo.diffBoxes, sizing);
    }
  }

  function renderSideBySideHighlightBoxes(boxes, sizing) {
    if (!boxes || !sizing) return;
    const ratioX = sizing.cssWidth / (boxes.baseWidth || sizing.cssWidth);
    const ratioY = sizing.cssHeight / (boxes.baseHeight || sizing.cssHeight);

    let htmlA = "";
    let htmlB = "";

    boxes.forEach((b) => {
      const left = Math.round(b.x * ratioX);
      const top = Math.round(b.y * ratioY);
      const width = Math.round(b.width * ratioX);
      const height = Math.round(b.height * ratioY);

      if (b.type === "del" || b.type === "mod") {
        htmlA += `
          <div class="diff-highlight-box diff-box-${b.type}" style="left:${left}px; top:${top}px; width:${width}px; height:${height}px;">
            <span class="diff-box-tag">${b.type === "del" ? "Removed in Doc B" : "Modified"}</span>
          </div>
        `;
      }

      if (b.type === "add" || b.type === "mod") {
        htmlB += `
          <div class="diff-highlight-box diff-box-${b.type}" style="left:${left}px; top:${top}px; width:${width}px; height:${height}px;">
            <span class="diff-box-tag">${b.type === "add" ? "Added in Doc B" : "Modified"}</span>
          </div>
        `;
      }
    });

    if (DOM.highlightLayerA) DOM.highlightLayerA.innerHTML = htmlA;
    if (DOM.highlightLayerB) DOM.highlightLayerB.innerHTML = htmlB;
  }

  // 2. Visual Diff (Pixel Overlay Engine with Highlight Clouds & Delta Mask)
  async function renderVisualDiff() {
    const p = state.currentPage;

    if (DOM.diffHighlightLayer) DOM.diffHighlightLayer.innerHTML = "";

    let pageA = null;
    let pageB = null;

    if (p <= state.fileA.pageCount) pageA = await state.fileA.pdfDoc.getPage(p);
    if (p <= state.fileB.pageCount) pageB = await state.fileB.pdfDoc.getPage(p);

    const refPage = pageA || pageB;
    if (!refPage) return;

    const sizing = computePageScale(refPage, DOM.visualDiffScroll);
    DOM.zoomIndicator.textContent = sizing.label;

    const W = sizing.pixelWidth;
    const H = sizing.pixelHeight;

    // Render Page A offscreen on crisp white background
    const offCanvasA = document.createElement("canvas");
    offCanvasA.width = W;
    offCanvasA.height = H;
    const offCtxA = offCanvasA.getContext("2d");
    offCtxA.fillStyle = "#ffffff";
    offCtxA.fillRect(0, 0, W, H);
    if (pageA) {
      offCtxA.save();
      offCtxA.scale(sizing.dpr, sizing.dpr);
      await pageA.render({ canvasContext: offCtxA, viewport: pageA.getViewport({ scale: sizing.scale }) }).promise;
      offCtxA.restore();
    }

    // Render Page B offscreen on crisp white background
    const offCanvasB = document.createElement("canvas");
    offCanvasB.width = W;
    offCanvasB.height = H;
    const offCtxB = offCanvasB.getContext("2d");
    offCtxB.fillStyle = "#ffffff";
    offCtxB.fillRect(0, 0, W, H);
    if (pageB) {
      offCtxB.save();
      offCtxB.scale(sizing.dpr, sizing.dpr);
      await pageB.render({ canvasContext: offCtxB, viewport: pageB.getViewport({ scale: sizing.scale }) }).promise;
      offCtxB.restore();
    }

    // Prepare main diff canvas
    DOM.diffOverlayCanvas.width = W;
    DOM.diffOverlayCanvas.height = H;
    DOM.diffOverlayCanvas.style.width = sizing.cssWidth + "px";
    DOM.diffOverlayCanvas.style.height = sizing.cssHeight + "px";
    DOM.wrapDiff.style.width = sizing.cssWidth + "px";
    DOM.wrapDiff.style.height = sizing.cssHeight + "px";

    const diffCtx = DOM.diffOverlayCanvas.getContext("2d");

    // Handle single-sided document edge cases
    if (!pageA && pageB) {
      diffCtx.drawImage(offCanvasB, 0, 0);
      renderVisualDiffBanner(p, 0, 1, 0, true);
      return;
    }
    if (pageA && !pageB) {
      diffCtx.drawImage(offCanvasA, 0, 0);
      renderVisualDiffBanner(p, 1, 0, 0, true);
      return;
    }

    // Perform Pixel Delta Comparison
    const imgA = offCtxA.getImageData(0, 0, W, H);
    const imgB = offCtxB.getImageData(0, 0, W, H);
    const diffImg = diffCtx.createImageData(W, H);

    const dataA = imgA.data;
    const dataB = imgB.data;
    const out = diffImg.data;
    const threshold = state.diffSensitivity;

    // Grid clustering for highlight boxes (16px cells in device pixels)
    const cellSize = Math.max(16, Math.round(16 * sizing.dpr));
    const gridCols = Math.ceil(W / cellSize);
    const gridRows = Math.ceil(H / cellSize);
    const grid = new Uint8Array(gridCols * gridRows);
    const cellDiffCount = new Uint16Array(gridCols * gridRows);

    let totalDiffPixels = 0;
    let deletedCount = 0;
    let addedCount = 0;

    for (let y = 0; y < H; y++) {
      const rowOffset = y * W * 4;
      const gy = Math.floor(y / cellSize);
      for (let x = 0; x < W; x++) {
        const i = rowOffset + x * 4;
        const rA = dataA[i], gA = dataA[i + 1], bA = dataA[i + 2];
        const rB = dataB[i], gB = dataB[i + 1], bB = dataB[i + 2];

        const delta = Math.abs(rA - rB) + Math.abs(gA - gB) + Math.abs(bA - bB);

        if (delta <= threshold) {
          // Unchanged pixel: Keep original readable page content!
          if (state.visualDiffSubmode === "deltaMask") {
            // In deltaMask mode: plain white for identical pixels
            out[i] = 255;
            out[i + 1] = 255;
            out[i + 2] = 255;
            out[i + 3] = 255;
          } else {
            // In highlight mode: render document clearly with full sharpness
            out[i] = rB;
            out[i + 1] = gB;
            out[i + 2] = bB;
            out[i + 3] = 255;
          }
        } else {
          totalDiffPixels++;
          const lumA = 0.299 * rA + 0.587 * gA + 0.114 * bA;
          const lumB = 0.299 * rB + 0.587 * gB + 0.114 * bB;

          const gx = Math.floor(x / cellSize);
          const gIdx = gy * gridCols + gx;
          cellDiffCount[gIdx]++;

          if (lumA < lumB - 12) {
            // Darker in A, lighter in B -> DELETED in Document B (Vibrant Red)
            deletedCount++;
            out[i] = 239;
            out[i + 1] = 68;
            out[i + 2] = 68;
            out[i + 3] = 255;
            if (grid[gIdx] === 0 || grid[gIdx] === 1) grid[gIdx] = 1; // del
            else grid[gIdx] = 3; // mod
          } else if (lumB < lumA - 12) {
            // Darker in B, lighter in A -> ADDED in Document B (Vibrant Green)
            addedCount++;
            out[i] = 16;
            out[i + 1] = 185;
            out[i + 2] = 129;
            out[i + 3] = 255;
            if (grid[gIdx] === 0 || grid[gIdx] === 2) grid[gIdx] = 2; // add
            else grid[gIdx] = 3; // mod
          } else {
            // Shifted or modified (Amber)
            out[i] = 245;
            out[i + 1] = 158;
            out[i + 2] = 11;
            out[i + 3] = 255;
            grid[gIdx] = 3; // mod
          }
        }
      }
    }

    diffCtx.putImageData(diffImg, 0, 0);

    // Filter significant grid cells and cluster into bounding highlight boxes
    for (let c = 0; c < grid.length; c++) {
      if (cellDiffCount[c] < 6) grid[c] = 0; // Filter random anti-aliasing noise
    }

    const diffBoxes = clusterDiffBoxes(grid, gridCols, gridRows, cellSize);
    diffBoxes.baseWidth = sizing.cssWidth;
    diffBoxes.baseHeight = sizing.cssHeight;

    if (state.differences[p]) {
      state.differences[p].diffBoxes = diffBoxes;
      state.differences[p].diffPercent = ((totalDiffPixels / (W * H)) * 100).toFixed(2);
      state.differences[p].hasDiff = totalDiffPixels > 30 || diffBoxes.length > 0;
    }

    // Render Banner
    renderVisualDiffBanner(p, deletedCount, addedCount, diffBoxes.length, false);

    // Render Highlight Clouds on diffHighlightLayer if in 'highlight' mode
    if (state.visualDiffSubmode === "highlight" && diffBoxes.length > 0) {
      renderDiffHighlightClouds(diffBoxes, sizing.dpr);
    }

    // Support Flicker A/B Mode
    if (state.visualDiffSubmode === "flicker") {
      startFlickerMode(diffCtx, offCanvasA, offCanvasB);
    }
  }

  function startFlickerMode(targetCtx, canvasA, canvasB) {
    state.flickerStateA = true;
    targetCtx.drawImage(canvasA, 0, 0);
    state.flickerTimer = setInterval(() => {
      state.flickerStateA = !state.flickerStateA;
      targetCtx.drawImage(state.flickerStateA ? canvasA : canvasB, 0, 0);
    }, 550);
  }

  function renderVisualDiffBanner(pageNum, deletedCount, addedCount, boxCount, isPageMissing) {
    if (!DOM.diffPageBanner) return;

    if (isPageMissing) {
      DOM.diffPageBanner.className = "diff-page-banner banner-changed";
      DOM.diffPageBanner.innerHTML = `
        <div class="banner-content">
          <span>⚠️</span>
          <span>Page ${pageNum} exists in one document only (Added or Missing Page).</span>
        </div>
      `;
      return;
    }

    if (boxCount === 0 && deletedCount === 0 && addedCount === 0) {
      // 100% Identical Page!
      DOM.diffPageBanner.className = "diff-page-banner banner-success";
      const nextDiffPage = state.differences.find((d) => d && d.hasDiff && d.pageNum > pageNum);
      const prevDiffPage = state.differences.find((d) => d && d.hasDiff && d.pageNum < pageNum);
      const totalChanges = getTotalDiffCount();

      let jumpHtml = "";
      if (nextDiffPage) {
        jumpHtml = `<button type="button" class="btn-banner-jump" id="btnBannerNext">Next Change on Page ${nextDiffPage.pageNum} →</button>`;
      } else if (prevDiffPage) {
        jumpHtml = `<button type="button" class="btn-banner-jump" id="btnBannerPrev">← Prev Change on Page ${prevDiffPage.pageNum}</button>`;
      }

      DOM.diffPageBanner.innerHTML = `
        <div class="banner-content">
          <span>✨</span>
          <span><strong>Page ${pageNum} is 100% Identical!</strong> Zero visual or textual differences found on this page.</span>
        </div>
        <div class="banner-actions">${jumpHtml}</div>
      `;

      const btnNext = document.getElementById("btnBannerNext");
      if (btnNext) btnNext.addEventListener("click", () => { state.currentPage = nextDiffPage.pageNum; renderCurrentPage(); });
      const btnPrev = document.getElementById("btnBannerPrev");
      if (btnPrev) btnPrev.addEventListener("click", () => { state.currentPage = prevDiffPage.pageNum; renderCurrentPage(); });
    } else {
      // Differences Detected!
      DOM.diffPageBanner.className = "diff-page-banner banner-changed";
      DOM.diffPageBanner.innerHTML = `
        <div class="banner-content">
          <span>⚠️</span>
          <span><strong>Differences Detected on Page ${pageNum}:</strong> Found ${boxCount} changed region${boxCount === 1 ? "" : "s"} (${deletedCount > 0 ? "Red: Deletions" : ""} ${deletedCount > 0 && addedCount > 0 ? "·" : ""} ${addedCount > 0 ? "Green: Additions" : ""}).</span>
        </div>
      `;
    }
  }

  function renderDiffHighlightClouds(boxes, dpr) {
    if (!DOM.diffHighlightLayer) return;
    let html = "";
    boxes.forEach((b) => {
      const left = Math.round(b.x / dpr);
      const top = Math.round(b.y / dpr);
      const width = Math.round(b.width / dpr);
      const height = Math.round(b.height / dpr);

      let tag = "Modified";
      if (b.type === "del") tag = "Removed in Doc B";
      else if (b.type === "add") tag = "Added in Doc B";

      html += `
        <div class="diff-highlight-box diff-box-${b.type}" style="left:${left}px; top:${top}px; width:${width}px; height:${height}px;">
          <span class="diff-box-tag">${tag}</span>
        </div>
      `;
    });
    DOM.diffHighlightLayer.innerHTML = html;
  }

  function clusterDiffBoxes(grid, cols, rows, cellSize) {
    const visited = new Uint8Array(cols * rows);
    const boxes = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const type = grid[idx];
        if (type !== 0 && !visited[idx]) {
          let minC = c, maxC = c, minR = r, maxR = r;
          const queue = [idx];
          visited[idx] = 1;

          while (queue.length > 0) {
            const curr = queue.pop();
            const cr = Math.floor(curr / cols);
            const cc = curr % cols;
            minC = Math.min(minC, cc);
            maxC = Math.max(maxC, cc);
            minR = Math.min(minR, cr);
            maxR = Math.max(maxR, cr);

            // Connect adjacent neighbors (including slight 2-cell gap for word spacing)
            const neighbors = [
              cr > 0 ? (cr - 1) * cols + cc : -1,
              cr < rows - 1 ? (cr + 1) * cols + cc : -1,
              cc > 0 ? cr * cols + (cc - 1) : -1,
              cc < cols - 1 ? cr * cols + (cc + 1) : -1,
              (cr > 0 && cc < cols - 1) ? (cr - 1) * cols + (cc + 1) : -1,
              (cr < rows - 1 && cc < cols - 1) ? (cr + 1) * cols + (cc + 1) : -1,
              (cr < rows - 1 && cc > 0) ? (cr + 1) * cols + (cc - 1) : -1,
              // Word gap jumper (2 cells right)
              cc < cols - 2 ? cr * cols + (cc + 2) : -1
            ];

            for (const n of neighbors) {
              if (n >= 0 && !visited[n] && grid[n] !== 0) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }

          boxes.push({
            x: Math.max(0, minC * cellSize - 4),
            y: Math.max(0, minR * cellSize - 4),
            width: (maxC - minC + 1) * cellSize + 8,
            height: (maxR - minR + 1) * cellSize + 8,
            type: type === 1 ? "del" : (type === 2 ? "add" : "mod")
          });
        }
      }
    }
    return boxes;
  }

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

  function updateToolbarSummary() {
    const changedCount = getTotalDiffCount();
    if (DOM.exportMeta) {
      DOM.exportMeta.textContent = `Comparing "${state.fileA.name}" vs "${state.fileB.name}" · ${state.totalPages} page${state.totalPages === 1 ? "" : "s"} · ${changedCount} change${changedCount === 1 ? "" : "s"}`;
    }
  }

  function renderDrawerList() {
    if (!DOM.drawerList) return;
    DOM.drawerCount.textContent = `${state.totalPages} Pages`;
    let html = "";
    for (let p = 1; p <= state.totalPages; p++) {
      const diff = state.differences[p];
      const isChanged = diff && diff.hasDiff;
      html += `
        <div class="drawer-item ${p === state.currentPage ? "active" : ""}" data-page="${p}">
          <span class="drawer-page-num">Page ${p}</span>
          <span class="drawer-badge ${isChanged ? "badge-changed" : "badge-identical"}">
            ${isChanged ? `Change (+${diff.addedWords}/-${diff.deletedWords})` : "Identical ✨"}
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
          renderCurrentPage();
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
  //  EXPORT & REPORT BUILDER
  // =========================================================================
  async function exportAuditReport() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast("PDF generator module not available.", "error");
      return;
    }

    showLoading(true, "Exporting Audit Report", "Compiling comparison summary report...");

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });

      // Title & Branding
      doc.setFillColor(232, 55, 42);
      doc.rect(0, 0, 595.28, 48, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("PDFMaster - Document Comparison Audit Report", 40, 30);

      doc.setTextColor(30, 30, 30);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 40, 70);
      doc.text(`Report Type: Client-Side Difference Audit (100% Private)`, 40, 85);

      // Comparison Metadata Box
      doc.setDrawColor(220, 220, 220);
      doc.setFillColor(248, 247, 245);
      doc.roundedRect(40, 105, 515, 80, 6, 6, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Document Baseline (Doc A):", 55, 128);
      doc.text("Document Revised  (Doc B):", 55, 152);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`${state.fileA.name} (${formatBytes(state.fileA.size)} · ${state.fileA.pageCount} pages)`, 210, 128);
      doc.text(`${state.fileB.name} (${formatBytes(state.fileB.size)} · ${state.fileB.pageCount} pages)`, 210, 152);

      // Executive Metrics
      const changedCount = getTotalDiffCount();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Executive Summary", 40, 215);

      doc.setFillColor(changedCount === 0 ? 230 : 255, changedCount === 0 ? 245 : 243, changedCount === 0 ? 235 : 240);
      doc.roundedRect(40, 225, 515, 45, 6, 6, "FD");

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Total Pages Analyzed: ${state.totalPages}`, 60, 245);
      doc.text(`Changed Pages: ${changedCount}`, 240, 245);
      doc.text(`Match Status: ${changedCount === 0 ? "100% Identical" : "Modifications Detected"}`, 400, 245);

      // Page-by-Page Table
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Page-by-Page Difference Breakdown", 40, 300);

      let y = 320;
      doc.setFillColor(235, 235, 235);
      doc.rect(40, y, 515, 20, "F");
      doc.setFontSize(9);
      doc.text("Page", 50, y + 14);
      doc.text("Status", 120, y + 14);
      doc.text("Words Added", 240, y + 14);
      doc.text("Words Removed", 360, y + 14);
      doc.text("Visual Variance", 460, y + 14);
      y += 24;

      doc.setFont("helvetica", "normal");
      for (let p = 1; p <= state.totalPages; p++) {
        if (y > 760) {
          doc.addPage();
          y = 50;
        }
        const diff = state.differences[p];
        const isChanged = diff && diff.hasDiff;

        doc.text(`Page ${p}`, 50, y);
        doc.text(isChanged ? "Modified" : "Identical", 120, y);
        doc.text(`+${diff ? diff.addedWords : 0}`, 240, y);
        doc.text(`-${diff ? diff.deletedWords : 0}`, 360, y);
        doc.text(diff && diff.diffPercent ? `${diff.diffPercent}%` : "0%", 460, y);

        doc.setDrawColor(240, 240, 240);
        doc.line(40, y + 4, 555, y + 4);
        y += 18;
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("Generated securely on-device with PDFMaster Compare PDF (https://pdfmaster.co.in/compare-pdf)", 40, 815);

      const blob = doc.output("blob");
      showLoading(false);

      // Trigger Universal Popup
      const fileName = `PDFMaster_Compare_${state.fileA.name.replace(/\.[^/.]+$/, "")}_vs_${state.fileB.name.replace(/\.[^/.]+$/, "")}.pdf`;
      if (window.PDFMasterPopup && typeof window.PDFMasterPopup.show === "function") {
        window.PDFMasterPopup.show({
          title: "Comparison Audit Report Ready!",
          fileName: fileName,
          fileSize: blob.size,
          blob: blob,
          fileType: "pdf",
          downloadName: fileName
        });
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
      }

      showToast("Comparison report generated successfully!", "success");
    } catch (err) {
      showLoading(false);
      console.error(err);
      showToast("Failed to export report.", "error");
    }
  }

  function exportDiffPng() {
    const canvas = state.currentMode === "visualDiff" ? DOM.diffOverlayCanvas : DOM.canvasA;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const fileName = `PDF_Diff_Page_${state.currentPage}.png`;
      if (window.PDFMasterPopup && typeof window.PDFMasterPopup.show === "function") {
        window.PDFMasterPopup.show({
          title: `Diff Image (Page ${state.currentPage}) Ready!`,
          fileName: fileName,
          fileSize: blob.size,
          blob: blob,
          fileType: "image",
          downloadName: fileName
        });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
      }
    }, "image/png");
  }

  // =========================================================================
  //  EVENT LISTENERS & BINDINGS
  // =========================================================================
  function initEvents() {
    // Dropzone A
    DOM.slotA.addEventListener("click", () => DOM.fileInputA.click());
    DOM.slotA.addEventListener("dragover", (e) => { e.preventDefault(); DOM.slotA.classList.add("dragover"); });
    DOM.slotA.addEventListener("dragleave", () => DOM.slotA.classList.remove("dragover"));
    DOM.slotA.addEventListener("drop", (e) => {
      e.preventDefault();
      DOM.slotA.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelected(e.dataTransfer.files[0], "A");
      }
    });
    DOM.fileInputA.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) handleFileSelected(e.target.files[0], "A");
    });

    // Dropzone B
    DOM.slotB.addEventListener("click", () => DOM.fileInputB.click());
    DOM.slotB.addEventListener("dragover", (e) => { e.preventDefault(); DOM.slotB.classList.add("dragover"); });
    DOM.slotB.addEventListener("dragleave", () => DOM.slotB.classList.remove("dragover"));
    DOM.slotB.addEventListener("drop", (e) => {
      e.preventDefault();
      DOM.slotB.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelected(e.dataTransfer.files[0], "B");
      }
    });
    DOM.fileInputB.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) handleFileSelected(e.target.files[0], "B");
    });

    // Swap, Sample, Compare, Reset
    DOM.btnSwap.addEventListener("click", swapDocuments);
    DOM.btnSample.addEventListener("click", generateSampleDocuments);
    DOM.btnCompare.addEventListener("click", runComparison);
    DOM.btnReset.addEventListener("click", () => {
      resetSlot("A");
      resetSlot("B");
      DOM.studio.classList.remove("active");
      clearSessionFromDB();
      showToast("Workspace reset.", "info");
    });

    // Mode Switcher Tabs
    DOM.modeTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        DOM.modeTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        state.currentMode = tab.dataset.mode;

        DOM.viewportPanels.forEach((p) => p.classList.remove("active"));
        const targetPanel = document.getElementById(`panel_${state.currentMode}`);
        if (targetPanel) targetPanel.classList.add("active");

        renderCurrentPage();
      });
    });

    // Visual Diff Submode Buttons
    if (DOM.btnDiffHighlight) {
      DOM.btnDiffHighlight.addEventListener("click", () => {
        state.visualDiffSubmode = "highlight";
        DOM.btnDiffHighlight.classList.add("active");
        DOM.btnDiffMask.classList.remove("active");
        DOM.btnDiffFlicker.classList.remove("active");
        renderCurrentPage();
      });
    }
    if (DOM.btnDiffMask) {
      DOM.btnDiffMask.addEventListener("click", () => {
        state.visualDiffSubmode = "deltaMask";
        DOM.btnDiffMask.classList.add("active");
        DOM.btnDiffHighlight.classList.remove("active");
        DOM.btnDiffFlicker.classList.remove("active");
        renderCurrentPage();
      });
    }
    if (DOM.btnDiffFlicker) {
      DOM.btnDiffFlicker.addEventListener("click", () => {
        state.visualDiffSubmode = "flicker";
        DOM.btnDiffFlicker.classList.add("active");
        DOM.btnDiffHighlight.classList.remove("active");
        DOM.btnDiffMask.classList.remove("active");
        renderCurrentPage();
      });
    }

    // Page Navigation
    DOM.btnPrevPage.addEventListener("click", () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderCurrentPage();
      }
    });
    DOM.btnNextPage.addEventListener("click", () => {
      if (state.currentPage < state.totalPages) {
        state.currentPage++;
        renderCurrentPage();
      }
    });

    // Zoom Controls
    DOM.btnFitWidth.addEventListener("click", () => {
      state.zoomMode = "fitWidth";
      renderCurrentPage();
    });
    DOM.btnFitPage.addEventListener("click", () => {
      state.zoomMode = "fitPage";
      renderCurrentPage();
    });
    DOM.btnActualSize.addEventListener("click", () => {
      state.zoomMode = "custom";
      state.customZoom = 1.0;
      renderCurrentPage();
    });
    DOM.btnZoomIn.addEventListener("click", () => {
      state.zoomMode = "custom";
      state.customZoom = Math.min(3.0, Math.round((state.customZoom + 0.15) * 100) / 100);
      renderCurrentPage();
    });
    DOM.btnZoomOut.addEventListener("click", () => {
      state.zoomMode = "custom";
      state.customZoom = Math.max(0.4, Math.round((state.customZoom - 0.15) * 100) / 100);
      renderCurrentPage();
    });

    // Window resize auto-adjust for Fit Width
    window.addEventListener("resize", () => {
      if (DOM.studio && DOM.studio.classList.contains("active") && (state.zoomMode === "fitWidth" || state.zoomMode === "fitPage")) {
        renderCurrentPage();
      }
    });

    // Synchronized Scrolling: Syncs BOTH Top and Left smoothly
    DOM.syncScrollCheck.addEventListener("change", (e) => {
      state.syncScroll = e.target.checked;
    });

    let isSyncingA = false;
    let isSyncingB = false;

    DOM.paneScrollA.addEventListener("scroll", () => {
      if (!state.syncScroll || isSyncingA) return;
      isSyncingB = true;
      DOM.paneScrollB.scrollTop = DOM.paneScrollA.scrollTop;
      DOM.paneScrollB.scrollLeft = DOM.paneScrollA.scrollLeft;
      requestAnimationFrame(() => { isSyncingB = false; });
    });

    DOM.paneScrollB.addEventListener("scroll", () => {
      if (!state.syncScroll || isSyncingB) return;
      isSyncingA = true;
      DOM.paneScrollA.scrollTop = DOM.paneScrollB.scrollTop;
      DOM.paneScrollA.scrollLeft = DOM.paneScrollB.scrollLeft;
      requestAnimationFrame(() => { isSyncingA = false; });
    });

    // Sensitivity Slider
    DOM.sensitivitySlider.addEventListener("input", (e) => {
      state.diffSensitivity = parseInt(e.target.value, 10);
      DOM.sensitivityVal.textContent = state.diffSensitivity;
      if (state.currentMode === "visualDiff") {
        renderVisualDiff();
      }
    });

    // Exports
    DOM.btnExportPdf.addEventListener("click", exportAuditReport);
    DOM.btnExportPng.addEventListener("click", exportDiffPng);
    DOM.btnPrint.addEventListener("click", () => window.print());

    // Recovery Session
    if (DOM.recoveryBtn) {
      DOM.recoveryBtn.addEventListener("click", restoreSessionFromDB);
    }

    // FAQ Accordion
    document.querySelectorAll(".faq-q").forEach((q) => {
      q.addEventListener("click", () => {
        const item = q.parentElement;
        item.classList.toggle("open");
      });
    });

    // Mobile Hamburger
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
      DOM.themeToggle.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem(THEME_KEY, newTheme);
        sessionStorage.setItem("pdfmaster_user_toggled_theme", "true");
        updateThemeIcons(newTheme);
      });
    }
  }

  function updateThemeIcons(theme) {
    if (DOM.sunIcon && DOM.moonIcon) {
      DOM.sunIcon.style.display = theme === "dark" ? "none" : "block";
      DOM.moonIcon.style.display = theme === "dark" ? "block" : "none";
    }
  }

  // =========================================================================
  //  INIT
  // =========================================================================
  document.addEventListener("DOMContentLoaded", () => {
    initDOM();
    initEvents();
    checkSavedSession();
    const savedTheme = localStorage.getItem(THEME_KEY) || "light";
    updateThemeIcons(savedTheme);
  });
})();
