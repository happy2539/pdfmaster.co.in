/**
 * PDFMaster - Compare PDF: Document Loader & Slot Manager
 * PDF parsing, thumbnail generation, drag & drop slot rendering, document swapping, and sample creation.
 */
(function () {
  "use strict";

  window.PDFCompare = window.PDFCompare || {};
  const state = window.PDFCompare.state;
  const PageCache = window.PDFCompare.PageCache;
  const DOM = window.PDFCompare.DOM;
  const utils = window.PDFCompare.utils;

  // =========================================================================
  //  DOCUMENT LOADING & THUMBNAILS
  // =========================================================================
  async function handleFileSelected(file, slot) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      utils.showToast("Please select a valid PDF file.", "error");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      await loadFileFromBuffer(buffer, file.name, slot, file);
    } catch (err) {
      console.error(err);
      utils.showToast(`Error reading file: ${err.message}`, "error");
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
          utils.showToast("Password required to open this PDF.", "error");
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
      pageWords: []
    };

    PageCache.clear();

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
        <div class="slot-file-name" title="${utils.escapeHtml(docData.name)}">${utils.escapeHtml(docData.name)}</div>
        <div class="slot-file-meta">${utils.formatBytes(docData.size)} · ${docData.pageCount} page${docData.pageCount === 1 ? "" : "s"}</div>
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
    PageCache.clear();
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
      const btnA = document.getElementById("btnBrowseA");
      if (btnA) {
        btnA.addEventListener("click", (e) => {
          e.stopPropagation();
          DOM.fileInputA.click();
        });
      }
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
      const btnB = document.getElementById("btnBrowseB");
      if (btnB) {
        btnB.addEventListener("click", (e) => {
          e.stopPropagation();
          DOM.fileInputB.click();
        });
      }
    }
    checkCompareButtonState();
  }

  function swapDocuments() {
    if (!state.fileA && !state.fileB) return;
    PageCache.clear();
    const temp = state.fileA;
    state.fileA = state.fileB;
    state.fileB = temp;

    if (state.fileA) renderSlotLoaded(DOM.slotA, state.fileA, "A");
    else resetSlot("A");

    if (state.fileB) renderSlotLoaded(DOM.slotB, state.fileB, "B");
    else resetSlot("B");

    checkCompareButtonState();
    utils.showToast("Swapped Document A and Document B.", "info");

    if (DOM.studio && DOM.studio.classList.contains("active")) {
      const runFn = (window.PDFCompare.main && window.PDFCompare.main.runComparison) || window.PDFCompare.runComparison;
      if (runFn) runFn();
    }
  }

  function checkCompareButtonState() {
    if (DOM.btnCompare) {
      DOM.btnCompare.disabled = !(state.fileA && state.fileB);
    }
  }

  // Expose Loader API
  window.PDFCompare.loader = {
    handleFileSelected,
    loadFileFromBuffer,
    renderSlotLoaded,
    resetSlot,
    swapDocuments,
    checkCompareButtonState
  };

  // Top-level debugging shortcuts
  window.PDFCompare.loadFileFromBuffer = loadFileFromBuffer;
  window.PDFCompare.resetSlot = resetSlot;
  window.PDFCompare.swapDocuments = swapDocuments;
})();
