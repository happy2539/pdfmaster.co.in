/**
 * PDFMaster - OCR PDF (Optical Character Recognition)
 * Module: preprocess.js
 * Image preprocessing algorithms, dynamic grayscale contrast normalization,
 * and resolution clamping for maximum OCR accuracy and throughput.
 */

(function () {
  "use strict";

  window.PDFMasterOCR = window.PDFMasterOCR || {};
  const OCR = window.PDFMasterOCR;

  /* ==========================================================================
     IMAGE PREPROCESSING ALGORITHMS (Dynamic Grayscale Contrast Normalization)
     Industry Best Practice: Modern LSTM neural nets rely on anti-aliased subpixel
     gradients. Hard 1-bit thresholding destroys character curves. Dynamic histogram
     stretching whitens paper and darkens ink while preserving smooth anti-aliased edges.
     ========================================================================== */
  function applyScanEnhancementFilter(ctx, width, height) {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const len = d.length;

      // 1. Build a 256-bin luminance histogram with strided sampling for lightning speed
      const hist = new Uint32Array(256);
      const step = 16; // 4-pixel stride
      let sampled = 0;
      for (let i = 0; i < len; i += step) {
        const luma = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
        hist[luma]++;
        sampled++;
      }

      // 2. Find black cutoff (3rd percentile) and white paper level (96th percentile)
      let count = 0;
      let blackPoint = 0;
      let whitePoint = 255;
      const targetLow = Math.floor(sampled * 0.03);
      const targetHigh = Math.floor(sampled * 0.96);

      for (let i = 0; i < 256; i++) {
        count += hist[i];
        if (blackPoint === 0 && count >= targetLow) {
          blackPoint = i;
        }
        if (count >= targetHigh) {
          whitePoint = i;
          break;
        }
      }

      // Guard against blank or low-contrast pages
      if (whitePoint - blackPoint < 30) {
        blackPoint = Math.max(0, blackPoint - 20);
        whitePoint = Math.min(255, whitePoint + 20);
      }
      const range = Math.max(1, whitePoint - blackPoint);

      // Precompute 256-value lookup table (LUT) with gamma 0.90 for rich ink density
      const lut = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        if (i <= blackPoint) {
          lut[i] = 0;
        } else if (i >= whitePoint) {
          lut[i] = 255;
        } else {
          const normalized = (i - blackPoint) / range;
          const enhanced = Math.pow(normalized, 0.9) * 255;
          lut[i] = Math.min(255, Math.max(0, Math.round(enhanced)));
        }
      }

      // 3. Ultra-fast 32-bit single-pass application (4x fewer memory bus writes)
      const buf32 = new Uint32Array(imgData.data.buffer);
      const lut32 = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        const v = lut[i];
        lut32[i] = 0xff000000 | (v << 16) | (v << 8) | v;
      }

      const totalPx = buf32.length;
      for (let i = 0; i < totalPx; i++) {
        const px = buf32[i];
        const luma =
          ((px & 0xff) * 77 +
            ((px >> 8) & 0xff) * 150 +
            ((px >> 16) & 0xff) * 29) >>
          8;
        buf32[i] = lut32[luma];
      }

      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      console.warn("Scan enhancement contrast filter skipped:", e);
    }
  }

  function applyBinarizationFilter(ctx, width, height) {
    applyScanEnhancementFilter(ctx, width, height);
  }

  /* ==========================================================================
     DYNAMIC RESOLUTION CLAMPING
     Industry standard target DPI bounds preventing excessive memory consumption
     ========================================================================== */
  function calculateOptimalResolutionScale(unscaledVp, mode) {
    const maxDim = Math.max(unscaledVp.width, unscaledVp.height);
    // 300 DPI optimal: Standard A4/Letter height is ~800pt at 72dpi. Target max dimension is ~2400px.
    // Fast Mode: Target max dimension is ~1800px (~200 DPI).
    const targetMaxDim = mode === "accurate" ? 2400 : 1800;
    const computedScale = targetMaxDim / Math.max(1, maxDim);
    // Bound scale safely between 1.0 (if page is already a high-res scan) and 3.2
    return Math.min(3.2, Math.max(1.0, computedScale));
  }

  // Export to namespace
  OCR.applyScanEnhancementFilter = applyScanEnhancementFilter;
  OCR.applyBinarizationFilter = applyBinarizationFilter;
  OCR.calculateOptimalResolutionScale = calculateOptimalResolutionScale;
})();
