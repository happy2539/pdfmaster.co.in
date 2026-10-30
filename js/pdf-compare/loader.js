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

  // =========================================================================
  //  SAMPLE DOCUMENT GENERATOR (PDF-Lib Instant Demo)
  // =========================================================================
  async function generateSampleDocuments() {
    if (!window.PDFLib) {
      utils.showToast("PDF generator library is still loading. Please wait a moment.", "info");
      return;
    }

    utils.showLoading(true, "Generating Sample Files", "Creating sample contracts with differences...");

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

      // Page A2 (Identical page for testing multi-page comparisons)
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

      // Page B2 (Identical to Page A2)
      const pageB2 = docB.addPage([595.28, 841.89]);
      pageB2.drawText("4. Termination & Signatures", { x: 50, y: 780, size: 13, font: timesBoldB, color: rgb(0.1, 0.1, 0.1) });
      pageB2.drawText("Either party may terminate this agreement upon thirty (30) days written notice.", { x: 50, y: 760, size: 10.5, font: timesRomanB });
      pageB2.drawText("Signed for Contractor: _______________________ Date: ________", { x: 50, y: 680, size: 10, font: timesRomanB });
      pageB2.drawText("Signed for Client:     _______________________ Date: ________", { x: 50, y: 630, size: 10, font: timesRomanB });

      const bytesB = await docB.save();

      await loadFileFromBuffer(bytesA.buffer, "Sample_Agreement_v1.0.pdf", "A");
      await loadFileFromBuffer(bytesB.buffer, "Sample_Agreement_v2.0_Revised.pdf", "B");

      utils.showLoading(false);
      utils.showToast("Loaded sample contracts! Click 'Compare Documents' to inspect changes.", "success");
      const runFn = (window.PDFCompare.main && window.PDFCompare.main.runComparison) || window.PDFCompare.runComparison;
      if (runFn) await runFn();
    } catch (err) {
      utils.showLoading(false);
      console.error(err);
      utils.showToast("Failed to generate sample documents.", "error");
    }
  }

  // Expose Loader API
  window.PDFCompare.loader = {
    handleFileSelected,
    loadFileFromBuffer,
    renderSlotLoaded,
    resetSlot,
    swapDocuments,
    checkCompareButtonState,
    generateSampleDocuments
  };

  // Top-level debugging shortcuts
  window.PDFCompare.loadFileFromBuffer = loadFileFromBuffer;
  window.PDFCompare.resetSlot = resetSlot;
  window.PDFCompare.swapDocuments = swapDocuments;
  window.PDFCompare.generateSampleDocuments = generateSampleDocuments;
})();
