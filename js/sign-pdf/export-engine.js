/**
 * PDFMaster - Sign PDF Tool
 * Module: export-engine.js
 * PDF-lib lossless stamping, coordinate transformations, export generation & downloads
 */
(function () {
  "use strict";

  window.PDFSign = window.PDFSign || {};
  const PDFSign = window.PDFSign;
  const state = PDFSign.state;

  // DOM Elements
  const signPdfPrimaryBtn = document.getElementById("signPdfPrimaryBtn");
  const downloadResultBtn = document.getElementById("downloadResultBtn");
  const modifyMoreBtn = document.getElementById("modifyMoreBtn");
  const resultsCard = document.getElementById("resultsCard");
  const resOrigPages = document.getElementById("resOrigPages");
  const resTotalSigs = document.getElementById("resTotalSigs");
  const resFileSize = document.getElementById("resFileSize");
  const workspace = document.getElementById("workspace");

  PDFSign.getPDFLib = function () {
    return (
      window.PDFLib ||
      window["pdf-lib"] ||
      (typeof PDFLib !== "undefined" ? PDFLib : null)
    );
  };

  PDFSign.rasterizeToPngDataUrl = function (dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const w = Math.max(1, img.naturalWidth || img.width || 400);
          const h = Math.max(1, img.naturalHeight || img.height || 200);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () =>
        reject(new Error("Unable to decode signature image stream"));
      img.src = dataUrl;
    });
  };

  PDFSign.embedImageSafely = async function (pdfDoc, dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") {
      throw new Error("Invalid signature image data");
    }

    if (
      dataUrl.startsWith("data:image/jpeg") ||
      dataUrl.startsWith("data:image/jpg")
    ) {
      try {
        return await pdfDoc.embedJpg(dataUrl);
      } catch (e) {}
    }

    if (dataUrl.startsWith("data:image/png")) {
      try {
        return await pdfDoc.embedPng(dataUrl);
      } catch (e) {}
    }

    const cleanPngDataUrl = await PDFSign.rasterizeToPngDataUrl(dataUrl);
    return await pdfDoc.embedPng(cleanPngDataUrl);
  };

  PDFSign.getItemDataUrl = async function (item) {
    if (item.dataUrl) return item.dataUrl;
    if (item.text && PDFSign.renderTextToPng) {
      return new Promise((resolve) => {
        PDFSign.renderTextToPng(item.text, (res) =>
          resolve(res ? res.dataUrl : null),
        );
      });
    }
    return null;
  };

  PDFSign.downloadBlob = function (blob, filename) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1200);
  };

  PDFSign.generateSignedPdf = async function () {
    if (
      !state.currentBlob &&
      (!state.arrayBuffer || state.arrayBuffer.byteLength === 0)
    ) {
      PDFSign.showToast("Please upload a PDF document first.");
      return;
    }

    const PDFLib = PDFSign.getPDFLib();
    if (!PDFLib || !PDFLib.PDFDocument) {
      PDFSign.showToast(
        "PDF processor is still loading. Please try again in a moment.",
      );
      return;
    }

    if (!Array.isArray(state.items) || state.items.length === 0) {
      PDFSign.showToast(
        "Please place at least one signature before downloading.",
      );
      return;
    }

    const startTime = performance.now();
    try {
      PDFSign.showLoading(
        true,
        "Signing PDF",
        "Embedding signatures and stamps…",
      );
      const { PDFDocument, degrees } = PDFLib;

      PDFSign.updateLoading(
        15,
        "Loading PDF Structure",
        "Initializing lossless AST…",
      );

      let arrayBuffer;
      if (
        state.currentBlob &&
        typeof state.currentBlob.arrayBuffer === "function"
      ) {
        arrayBuffer = await state.currentBlob.arrayBuffer();
      } else if (state.arrayBuffer && state.arrayBuffer.byteLength > 0) {
        arrayBuffer = state.arrayBuffer.slice(0);
      } else {
        throw new Error(
          "PDF document data is unavailable. Please reload the document.",
        );
      }

      const pdfDoc = await PDFDocument.load(arrayBuffer, {
        ignoreEncryption: true,
      });

      const pages = pdfDoc.getPages();
      const totalDocPages = pages.length;

      const itemsByPage = new Map();
      state.items.forEach((item) => {
        const pNum = Number(item.pageNum) || 1;
        const list = itemsByPage.get(pNum) || [];
        list.push(item);
        itemsByPage.set(pNum, list);
      });

      let processedCount = 0;
      const totalItems = state.items.length;

      for (const [pageNum, pageItems] of itemsByPage.entries()) {
        if (pageNum < 1 || pageNum > totalDocPages) continue;
        const page = pages[pageNum - 1];
        const pageW = page.getWidth();
        const pageH = page.getHeight();
        const rotAngle = ((page.getRotation().angle % 360) + 360) % 360;

        const isRotatedQuarter = rotAngle === 90 || rotAngle === 270;
        const visW = isRotatedQuarter ? pageH : pageW;
        const visH = isRotatedQuarter ? pageW : pageH;

        for (const item of pageItems) {
          const dataUrl = await PDFSign.getItemDataUrl(item);
          if (!dataUrl) continue;

          const embeddedImg = await PDFSign.embedImageSafely(pdfDoc, dataUrl);

          const itemVisW = Math.max(
            1,
            (Number(item.widthPercent) || 0.24) * visW,
          );
          const aspect =
            Number(item.aspectRatio) ||
            (item.heightPercent ? item.widthPercent / item.heightPercent : 2.5);
          const itemVisH = Math.max(
            1,
            (Number(item.heightPercent) || item.widthPercent / aspect) * visH,
          );
          const vx = (Number(item.xPercent) || 0) * visW;
          const vy = visH - ((Number(item.yPercent) || 0) * visH + itemVisH);

          let stampX = vx;
          let stampY = vy;
          let baseAngle = 0;

          if (rotAngle === 90) {
            stampX = pageW - vy;
            stampY = vx;
            baseAngle = 90;
          } else if (rotAngle === 180) {
            stampX = pageW - vx;
            stampY = pageH - vy;
            baseAngle = 180;
          } else if (rotAngle === 270) {
            stampX = vy;
            stampY = pageH - vx;
            baseAngle = 270;
          }

          const stampAngle =
            (((baseAngle - (Number(item.rotation) || 0)) % 360) + 360) % 360;

          page.drawImage(embeddedImg, {
            x: Math.round(stampX * 100) / 100,
            y: Math.round(stampY * 100) / 100,
            width: Math.round(itemVisW * 100) / 100,
            height: Math.round(itemVisH * 100) / 100,
            rotate: degrees(stampAngle),
          });

          processedCount++;
          const progress =
            20 + Math.round((processedCount / Math.max(1, totalItems)) * 65);
          PDFSign.updateLoading(
            progress,
            "Signing PDF",
            `Stamped signature ${processedCount} of ${totalItems}…`,
          );
        }
      }

      PDFSign.updateLoading(
        88,
        "Saving Document",
        "Generating clean, lossless PDF stream…",
      );
      const outBytes = await pdfDoc.save();
      const outBlob = new Blob([outBytes], { type: "application/pdf" });

      PDFSign.lastGeneratedBlob = outBlob;
      const baseName = (state.fileName || "document").replace(/\.[^/.]+$/, "");
      PDFSign.lastGeneratedName = `${baseName}_signed.pdf`;

      PDFSign.updateLoading(100, "Signed Successfully!", "Your file is ready.");
      PDFSign.showLoading(false);

      PDFSign.downloadBlob(outBlob, PDFSign.lastGeneratedName);

      if (resultsCard) {
        resultsCard.classList.add("active");
        if (resOrigPages)
          resOrigPages.textContent = `${state.totalPages} pages`;
        if (resTotalSigs)
          resTotalSigs.textContent = `${state.items.length} stamps`;
        if (resFileSize)
          resFileSize.textContent = PDFSign.fmtBytes(outBlob.size);
        resultsCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      const signedPages = Array.from(itemsByPage.keys()).sort((a, b) => a - b);
      const signedPageCount = itemsByPage.size;
      const totalPages = state.totalPages || 1;
      const totalSignatures = state.items.length;

      // Extract sanitized settings (strictly non-sensitive operational telemetry)
      const modesSet = new Set();
      const fontsSet = new Set();
      const colorsSet = new Set();
      let hasBgRemoved = false;
      let wasAppliedToAll = false;

      for (const item of state.items) {
        if (item.source) modesSet.add(item.source);
        else if (item.type) modesSet.add(item.type);
        if (item.font) fontsSet.add(item.font);
        if (item.color) colorsSet.add(item.color);
        if (item.removeBg) hasBgRemoved = true;
        if (item.appliedToAllPages) wasAppliedToAll = true;
      }

      if (totalPages > 1 && signedPageCount === totalPages) {
        wasAppliedToAll = true;
      }

      const signSettings = {
        signedPageCount: signedPageCount,
        totalPages: totalPages,
        signedPages: signedPages,
        totalSignatures: totalSignatures,
        modes: Array.from(modesSet),
        fonts: Array.from(fontsSet),
        colors: Array.from(colorsSet),
        bgRemoved: hasBgRemoved,
        appliedToAllPages: wasAppliedToAll,
      };

      const signDetails = `${totalPages} pages (${signedPageCount} signed) • ${totalSignatures} signature(s) • ${PDFSign.fmtBytes(outBlob.size)} • 100% Private`;

      // Universal Popup Integration
      if (
        window.PDFMasterPopup &&
        typeof window.PDFMasterPopup.show === "function"
      ) {
        window.PDFMasterPopup.show({
          title: "Thank You for Using PDF<span>Master</span>!",
          desc: `Your PDF was signed privately on your device. Stamped <strong>${totalSignatures} signature(s)</strong> across <strong>${signedPageCount} page(s)</strong> with zero data leakage.`,
          fileName: PDFSign.lastGeneratedName,
          fileType: "pdf",
          fileDetails: signDetails,
          downloadText: "Download Signed PDF",
          toolName: "Sign PDF",
          durationMs: Math.max(1, Math.round(performance.now() - startTime)),
          blob: outBlob,
          pageCount: totalPages,
          signedPageCount: signedPageCount,
          settings: signSettings,
        });
      }

      // Conversion Tracker
      if (
        window.PDFMasterTracker &&
        (typeof window.PDFMasterTracker.trackConversion === "function" ||
          typeof window.PDFMasterTracker.recordConversion === "function")
      ) {
        const trackerFn =
          window.PDFMasterTracker.trackConversion ||
          window.PDFMasterTracker.recordConversion;
        trackerFn({
          tool: "Sign PDF",
          toolName: "Sign PDF",
          inputFileSize: state.fileSize,
          fileSize: outBlob.size,
          durationMs: Math.round(performance.now() - startTime),
          pageCount: totalPages,
          signedPageCount: signedPageCount,
          settings: signSettings,
          fileDetails: signDetails,
          blob: outBlob,
        });
      }

      PDFSign.showToast("PDF signed and saved successfully!");
    } catch (e) {
      console.error("Signing failed:", e);
      PDFSign.showLoading(false);
      PDFSign.showToast(
        "An error occurred while stamping the PDF: " +
          (e.message || "Please try again."),
      );
    }
  };

  if (signPdfPrimaryBtn) {
    signPdfPrimaryBtn.addEventListener("click", PDFSign.generateSignedPdf);
  }

  if (downloadResultBtn) {
    downloadResultBtn.addEventListener("click", () => {
      if (PDFSign.lastGeneratedBlob && PDFSign.lastGeneratedName) {
        PDFSign.downloadBlob(
          PDFSign.lastGeneratedBlob,
          PDFSign.lastGeneratedName,
        );
      } else {
        PDFSign.generateSignedPdf();
      }
    });
  }

  if (modifyMoreBtn) {
    modifyMoreBtn.addEventListener("click", () => {
      if (workspace) {
        workspace.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }
})();
