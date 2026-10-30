/**
 * PDFMaster - Compare PDF: Export & Report Generator
 * Client-side Executive Comparison Audit Report Generator via jsPDF & Universal Popup.
 */
(function () {
  "use strict";

  window.PDFCompare = window.PDFCompare || {};
  const state = window.PDFCompare.state;
  const DOM = window.PDFCompare.DOM;
  const utils = window.PDFCompare.utils;

  // =========================================================================
  //  EXPORT & REPORT BUILDER (PDF Audit via jsPDF & Universal Popup)
  // =========================================================================
  async function exportAuditReport() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      utils.showToast("PDF generator module not available.", "error");
      return;
    }

    utils.showLoading(true, "Exporting Audit Report", "Compiling comparison summary report...");

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
      doc.text(`Report Type: Client-Side Difference Audit (100% Private, On-Device)`, 40, 85);

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
      doc.text(`${state.fileA.name} (${utils.formatBytes(state.fileA.size)} · ${state.fileA.pageCount} pages)`, 210, 128);
      doc.text(`${state.fileB.name} (${utils.formatBytes(state.fileB.size)} · ${state.fileB.pageCount} pages)`, 210, 152);

      // Executive Metrics
      const countFn = (window.PDFCompare.diff && window.PDFCompare.diff.getTotalDiffCount) || window.PDFCompare.getTotalDiffCount || (() => 0);
      const changedCount = countFn();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Executive Summary", 40, 215);

      doc.setFillColor(changedCount === 0 ? 230 : 255, changedCount === 0 ? 245 : 243, changedCount === 0 ? 235 : 240);
      doc.roundedRect(40, 225, 515, 45, 6, 6, "FD");

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Total Pages Analyzed: ${state.totalPages}`, 60, 245);
      doc.text(`Modified Pages: ${changedCount}`, 240, 245);
      doc.text(`Status: ${changedCount === 0 ? "100% Identical" : "Modifications Detected"}`, 400, 245);

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
        doc.text(`+${diff ? diff.addedWords || 0 : 0}`, 240, y);
        doc.text(`-${diff ? diff.deletedWords || 0 : 0}`, 360, y);
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
      utils.showLoading(false);

      // Universal Popup Integration
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

      utils.showToast("Comparison report generated successfully!", "success");
    } catch (err) {
      utils.showLoading(false);
      console.error(err);
      utils.showToast("Failed to export report.", "error");
    }
  }

  // Expose Export API
  window.PDFCompare.export = {
    exportAuditReport
  };

  // Top-level debugging shortcuts
  window.PDFCompare.exportAuditReport = exportAuditReport;
})();
