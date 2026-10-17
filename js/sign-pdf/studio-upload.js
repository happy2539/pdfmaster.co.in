/**
 * PDFMaster - Sign PDF Tool
 * Module: studio-upload.js
 * Signature Studio - Tab 3: Upload Signature Photo, Paper Background Removal & Color Mapping
 */
(function () {
  "use strict";

  window.PDFSign = window.PDFSign || {};
  const PDFSign = window.PDFSign;
  const state = PDFSign.state;

  // DOM Elements
  const uploadSigDropzone = document.getElementById("uploadSigDropzone");
  const uploadSigInput = document.getElementById("uploadSigInput");
  const uploadSigPreviewWrap = document.getElementById("uploadSigPreviewWrap");
  const uploadPreviewCanvas = document.getElementById("uploadPreviewCanvas");
  const removeBgToggle = document.getElementById("removeBgToggle");
  const bgThresholdSlider = document.getElementById("bgThresholdSlider");
  const thresholdValText = document.getElementById("thresholdValText");
  const inkColorSelect = document.getElementById("inkColorSelect");
  const changeUploadedSigBtn = document.getElementById("changeUploadedSigBtn");
  const resetCropBtn = document.getElementById("resetCropBtn");

  if (uploadSigDropzone) {
    uploadSigDropzone.addEventListener("click", () => {
      if (uploadSigInput) uploadSigInput.click();
    });

    uploadSigDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadSigDropzone.classList.add("drag-over");
    });

    uploadSigDropzone.addEventListener("dragleave", () => {
      uploadSigDropzone.classList.remove("drag-over");
    });

    uploadSigDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadSigDropzone.classList.remove("drag-over");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        PDFSign.processUploadedSigFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (uploadSigInput) {
    uploadSigInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        PDFSign.processUploadedSigFile(e.target.files[0]);
      }
    });
  }

  if (changeUploadedSigBtn) {
    changeUploadedSigBtn.addEventListener("click", () => {
      if (uploadSigInput) uploadSigInput.click();
    });
  }

  PDFSign.processUploadedSigFile = async function (file) {
    if (!file.type.startsWith("image/")) {
      PDFSign.showToast("Please select an image file (PNG, JPG, WebP)");
      return;
    }

    try {
      let imgSource = null;
      if (typeof window !== "undefined" && window.createImageBitmap) {
        try {
          imgSource = await createImageBitmap(file);
        } catch (eBmp) {
          imgSource = null;
        }
      }

      if (!imgSource) {
        const reader = new FileReader();
        await new Promise((resolve, reject) => {
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              imgSource = img;
              resolve();
            };
            img.onerror = reject;
            img.src = e.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      state.studio.rawUploadedImg = imgSource;
      state.studio.uploadedImg = imgSource;
      state.studio.isCropped = false;
      if (resetCropBtn) resetCropBtn.style.display = "none";
      if (
        PDFSign.cropState &&
        PDFSign.cropState.active &&
        PDFSign.closeCropMode
      ) {
        PDFSign.closeCropMode();
      }
      if (uploadSigDropzone) uploadSigDropzone.style.display = "none";
      if (uploadSigPreviewWrap) uploadSigPreviewWrap.classList.add("active");
      PDFSign.renderProcessedUploadPreview();
    } catch (err) {
      console.error("Signature file load error:", err);
      PDFSign.showToast("Failed to load image. Please try again.");
    }
  };

  PDFSign.renderProcessedUploadPreview = function () {
    if (PDFSign.cropState && PDFSign.cropState.active) return;
    const img = state.studio.uploadedImg;
    if (!img || !uploadPreviewCanvas) return;

    const maxDim = 1000;
    let w = img.width;
    let h = img.height;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    uploadPreviewCanvas.width = w;
    uploadPreviewCanvas.height = h;
    const ctx = uploadPreviewCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    if (state.studio.removeBg) {
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const sensitivity = state.studio.bgThreshold || 65; // 10..95
      const inkMode = state.studio.inkColor || "black";

      // 1. Grayscale buffer & preserve existing transparency
      const totalPixels = w * h;
      const gray = new Float32Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) {
        const p = i * 4;
        if (data[p + 3] === 0) {
          gray[i] = 255;
        } else {
          gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        }
      }

      // 2. Block-based background illumination map (12-32px blocks)
      const blockSize = Math.max(
        12,
        Math.min(32, Math.floor(Math.min(w, h) / 12)),
      );
      const gw = Math.ceil(w / blockSize);
      const gh = Math.ceil(h / blockSize);
      const bgGrid = new Float32Array(gw * gh);

      for (let gy = 0; gy < gh; gy++) {
        const y0 = gy * blockSize;
        const y1 = Math.min(h, y0 + blockSize);
        for (let gx = 0; gx < gw; gx++) {
          const x0 = gx * blockSize;
          const x1 = Math.min(w, x0 + blockSize);
          let maxVal = 0;
          for (let y = y0; y < y1; y++) {
            const rowOffset = y * w;
            for (let x = x0; x < x1; x++) {
              const val = gray[rowOffset + x];
              if (val > maxVal) maxVal = val;
            }
          }
          bgGrid[gy * gw + gx] = maxVal;
        }
      }

      // 3. Contrast thresholding with smooth Hermite anti-aliasing
      const noiseFloor = 0.04 + ((100 - sensitivity) / 100) * 0.18;
      const solidFloor = noiseFloor + 0.16;

      for (let y = 0; y < h; y++) {
        const fy = y / blockSize - 0.5;
        const gy0 = Math.max(0, Math.min(gh - 1, Math.floor(fy)));
        const gy1 = Math.max(0, Math.min(gh - 1, gy0 + 1));
        const ty = Math.max(0, Math.min(1, fy - gy0));
        const rowOffset = y * w;

        for (let x = 0; x < w; x++) {
          const p = (rowOffset + x) * 4;
          if (data[p + 3] === 0) continue; // preserve existing alpha

          // Bilinear interpolation of local paper brightness
          const fx = x / blockSize - 0.5;
          const gx0 = Math.max(0, Math.min(gw - 1, Math.floor(fx)));
          const gx1 = Math.max(0, Math.min(gw - 1, gx0 + 1));
          const tx = Math.max(0, Math.min(1, fx - gx0));

          const top =
            bgGrid[gy0 * gw + gx0] * (1 - tx) + bgGrid[gy0 * gw + gx1] * tx;
          const bot =
            bgGrid[gy1 * gw + gx0] * (1 - tx) + bgGrid[gy1 * gw + gx1] * tx;
          const localBg = Math.max(35, top * (1 - ty) + bot * ty);

          const pixelGray = gray[rowOffset + x];
          const contrast = (localBg - pixelGray) / localBg;

          if (contrast <= noiseFloor) {
            data[p + 3] = 0; // Pure paper -> 100% transparent
          } else {
            let alpha = 255;
            if (contrast < solidFloor) {
              const t = (contrast - noiseFloor) / (solidFloor - noiseFloor);
              alpha = Math.round(t * t * (3 - 2 * t) * 255);
            }
            data[p + 3] = alpha;

            if (inkMode === "black") {
              data[p] = 17;
              data[p + 1] = 24;
              data[p + 2] = 39;
            } else if (inkMode === "navy") {
              data[p] = 20;
              data[p + 1] = 40;
              data[p + 2] = 110;
            } else if (inkMode === "blue") {
              data[p] = 30;
              data[p + 1] = 80;
              data[p + 2] = 220;
            } else if (inkMode === "green") {
              data[p] = 4;
              data[p + 1] = 120;
              data[p + 2] = 87;
            } else if (inkMode === "red") {
              data[p] = 220;
              data[p + 1] = 38;
              data[p + 2] = 38;
            } else if (inkMode === "original") {
              const factor = Math.min(1, Math.max(0.15, 1 - contrast * 0.35));
              data[p] = Math.max(0, Math.round(data[p] * factor));
              data[p + 1] = Math.max(0, Math.round(data[p + 1] * factor));
              data[p + 2] = Math.max(0, Math.round(data[p + 2] * factor));
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
    }
  };

  if (removeBgToggle) {
    removeBgToggle.addEventListener("change", (e) => {
      state.studio.removeBg = e.target.checked;
      PDFSign.renderProcessedUploadPreview();
    });
  }

  if (bgThresholdSlider) {
    bgThresholdSlider.addEventListener("input", (e) => {
      state.studio.bgThreshold = parseInt(e.target.value, 10);
      if (thresholdValText)
        thresholdValText.textContent = state.studio.bgThreshold + "%";
      PDFSign.renderProcessedUploadPreview();
    });
  }

  if (inkColorSelect) {
    inkColorSelect.addEventListener("change", (e) => {
      state.studio.inkColor = e.target.value;
      PDFSign.renderProcessedUploadPreview();
    });
  }

  PDFSign.getUploadedCanvasTrimmedPng = function () {
    if (!uploadPreviewCanvas || !state.studio.uploadedImg) return null;
    const trimmed = PDFSign.trimCanvasTransparent(uploadPreviewCanvas);
    if (!trimmed) return null;

    return {
      dataUrl: trimmed.canvas.toDataURL("image/png"),
      aspectRatio: trimmed.width / trimmed.height,
    };
  };
})();
