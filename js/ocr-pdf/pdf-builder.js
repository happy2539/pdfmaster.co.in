/**
 * PDFMaster - OCR PDF (Optical Character Recognition)
 * Module: pdf-builder.js
 * Searchable sandwich PDF compilation, invisible text coordinate alignment,
 * TXT plain-text export, and download management.
 */

(function () {
  "use strict";

  window.PDFMasterOCR = window.PDFMasterOCR || {};
  const OCR = window.PDFMasterOCR;
  const state = OCR.state;
  const DOM = OCR.DOM;

  /* ==========================================================================
     EXPORTS GENERATOR (Searchable PDF, Plain Text TXT)
     ========================================================================== */
  async function generateAllExports() {
    if (OCR.revokeBlobUrls) OCR.revokeBlobUrls();

    // 1. Plain Text (.txt)
    let fullText = "";
    state.pageResults.forEach((page) => {
      fullText += `================================================================================\n`;
      fullText += `PAGE ${page.pageNum} OF ${state.totalPages}  (Confidence: ${page.confidence}%)\n`;
      fullText += `================================================================================\n\n`;
      fullText += page.text.trim() + "\n\n";
    });

    const txtBlob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    state.generatedBlobs.txt = URL.createObjectURL(txtBlob);

    // 2. Searchable PDF (Sandwich / Invisible Selectable Text Layer)
    if (state.options.generatePdf) {
      await generateSearchablePdfBlob();
    }
  }

  async function generateSearchablePdfBlob() {
    if (state.generatedBlobs.pdf) {
      return state.generatedBlobs.pdf;
    }

    if (!window.PDFLib || !state.pdfBytes || state.pageResults.length === 0) {
      return null;
    }

    try {
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

      let pdfDoc;

      if (state.options.layerMode === "replace") {
        // REPLACE MODE: Re-create pristine PDF with fresh rendered background images + single clean OCR layer
        pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const pageRes of state.pageResults) {
          const pdfPageSrc = await state.pdfDoc.getPage(pageRes.pageNum);
          const origVp = pdfPageSrc.getViewport({ scale: 1.0 });

          // Render high-res JPEG image for crisp text clarity
          const vp = pdfPageSrc.getViewport({ scale: 1.5 });
          const cvs = document.createElement("canvas");
          cvs.width = Math.floor(vp.width);
          cvs.height = Math.floor(vp.height);
          const ctx = cvs.getContext("2d");
          await pdfPageSrc.render({ canvasContext: ctx, viewport: vp }).promise;

          const jpgBlob = await new Promise((r) =>
            cvs.toBlob(r, "image/jpeg", 0.88),
          );
          const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
          cvs.width = 0;
          cvs.height = 0;

          const embeddedImg = await pdfDoc.embedJpg(jpgBytes);
          const newPage = pdfDoc.addPage([origVp.width, origVp.height]);
          newPage.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: origVp.width,
            height: origVp.height,
          });

          // Overlay fresh single OCR text layer
          const scaleX = origVp.width / pageRes.canvasWidth;
          const scaleY = origVp.height / pageRes.canvasHeight;
          for (const word of pageRes.words) {
            drawInvisibleWord(
              newPage,
              word,
              origVp.height,
              scaleX,
              scaleY,
              font,
              rgb,
            );
          }
        }
      } else {
        // SMART MODE (DEFAULT): Preserve original document structure, only overlay on pages that lack digital text!
        pdfDoc = await PDFDocument.load(state.pdfBytes, {
          ignoreEncryption: true,
        });
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const pageRes of state.pageResults) {
          const status = state.pageTextStatus[pageRes.pageNum];
          const pageAlreadyHasText = status && status.hasText;

          // INDUSTRY-STANDARD SMART RULE:
          // If the page already has a digital text layer, DO NOT add a duplicate invisible text layer!
          // This guarantees Ctrl+F matches each word EXACTLY ONCE with 0 duplicates!
          if (pageAlreadyHasText) {
            console.log(
              `[PDFMaster OCR] Page ${pageRes.pageNum} already has pre-existing digital text. Preserving original layer to prevent duplicate Ctrl+F matches.`,
            );
            continue;
          }

          const pdfPage = pdfDoc.getPage(pageRes.pageNum - 1);
          const pdfWidth = pdfPage.getWidth();
          const pdfHeight = pdfPage.getHeight();

          const scaleX = pdfWidth / pageRes.canvasWidth;
          const scaleY = pdfHeight / pageRes.canvasHeight;

          for (const word of pageRes.words) {
            drawInvisibleWord(
              pdfPage,
              word,
              pdfHeight,
              scaleX,
              scaleY,
              font,
              rgb,
            );
          }
        }
      }

      const searchablePdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([searchablePdfBytes], {
        type: "application/pdf",
      });
      state.generatedBlobs.pdf = URL.createObjectURL(pdfBlob);
      state.generatedPdfBlob = pdfBlob;
      return state.generatedBlobs.pdf;
    } catch (pdfErr) {
      console.warn("Could not compile searchable PDF layer:", pdfErr);
      return null;
    }
  }

  function drawInvisibleWord(
    page,
    word,
    pageHeight,
    scaleX,
    scaleY,
    font,
    rgb,
  ) {
    if (!word || !word.text) return;

    // 1. Target bounding box dimensions in PDF points
    const targetLeft = word.bbox.x0 * scaleX;
    const targetWidth = Math.max(1, (word.bbox.x1 - word.bbox.x0) * scaleX);
    const targetHeight = Math.max(1, (word.bbox.y1 - word.bbox.y0) * scaleY);
    const boxBottom = pageHeight - word.bbox.y1 * scaleY;

    // 2. Compute proportional font size fitting both width and height
    let cleanText = word.text;
    let unitWidth = 0;
    try {
      unitWidth = font.widthOfTextAtSize(cleanText, 1.0);
    } catch (_) {
      cleanText = word.text.replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
      if (cleanText) {
        try {
          unitWidth = font.widthOfTextAtSize(cleanText, 1.0);
        } catch (_) {}
      }
    }

    if (!cleanText || unitWidth <= 0) return;

    // Font size that spans the word's bounding box width
    const widthBasedSize = targetWidth / unitWidth;
    // Standard font size based on bounding box height
    const heightBasedSize = targetHeight * 0.85;

    // Clamp font size to maintain natural aspect ratio
    const fontSize = Math.max(
      4,
      Math.min(48, Math.min(widthBasedSize, heightBasedSize * 1.25)),
    );

    // 3. Compute exact horizontal placement (center within box if slightly narrower)
    const renderedWidth = font.widthOfTextAtSize(cleanText, fontSize);
    const xOffset = Math.max(0, (targetWidth - renderedWidth) / 2);
    const x = targetLeft + xOffset;

    // 4. Compute true font baseline placement
    // In Helvetica, descenders extend down ~22% below the baseline.
    // Placing baseline at (boxBottom + 0.22 * fontSize) ensures glyphs and selection
    // highlight rectangles align perfectly from boxBottom to boxTop!
    const y = boxBottom + fontSize * 0.22;

    try {
      page.drawText(cleanText, {
        x: x,
        y: y,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
        opacity: 0, // INVISIBLE TEXT LAYER: selectable and searchable in Acrobat & Chrome!
      });
    } catch (_) {}
  }

  async function triggerDownload(format) {
    const baseName = state.fileName.replace(/\.[^/.]+$/, "") || "document";
    let blobUrl = state.generatedBlobs[format];

    if (format === "pdf" && !blobUrl) {
      DOM.downloadPdfBtn.disabled = true;
      const originalHtml = DOM.downloadPdfBtn.innerHTML;
      DOM.downloadPdfBtn.innerHTML = `
        <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg> Compiling Searchable PDF…
      `;
      try {
        blobUrl = await generateSearchablePdfBlob();
      } finally {
        DOM.downloadPdfBtn.disabled = false;
        DOM.downloadPdfBtn.innerHTML = originalHtml;
      }
    } else if (format === "txt") {
      const currentText = DOM.ocrTextArea.value;
      const blob = new Blob([currentText], {
        type: "text/plain;charset=utf-8",
      });
      blobUrl = URL.createObjectURL(blob);
    }

    if (!blobUrl) {
      if (OCR.showErrorPopup) {
        OCR.showErrorPopup(
          `The ${format.toUpperCase()} export is not available for this document.`,
        );
      }
      return;
    }

    const downloadFileName =
      format === "pdf" ? `${baseName}_searchable.pdf` : `${baseName}_text.txt`;

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = downloadFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Delete the file and session from local recovery immediately after file download!
    if (OCR.clearSessionFromDB) {
      await OCR.clearSessionFromDB();
    }
    if (OCR.showToast) {
      OCR.showToast(`Downloaded ${downloadFileName}.`, "success", 4000);
    }

    // Track conversion event if tracking script loaded
    if (window.trackConversion) {
      window.trackConversion("ocr_pdf_download", { format });
    }
  }

  // Export to namespace
  OCR.drawInvisibleWord = drawInvisibleWord;
  OCR.generateSearchablePdfBlob = generateSearchablePdfBlob;
  OCR.generateAllExports = generateAllExports;
  OCR.triggerDownload = triggerDownload;
})();
