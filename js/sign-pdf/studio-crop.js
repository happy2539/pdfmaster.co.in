/**
 * PDFMaster - Sign PDF Tool
 * Module: studio-crop.js
 * Signature Studio - Interactive signature cropping, handle transforms, rotation, and reset
 */
(function () {
  "use strict";

  window.PDFSign = window.PDFSign || {};
  const PDFSign = window.PDFSign;
  const state = PDFSign.state;

  PDFSign.cropState = {
    active: false,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    overlayW: 0,
    overlayH: 0,
    activeHandle: null,
    dragStartX: 0,
    dragStartY: 0,
    drawStartX: 0,
    drawStartY: 0,
    startRect: null,
  };

  const cropState = PDFSign.cropState;

  // DOM Elements
  const uploadPreviewCanvas = document.getElementById("uploadPreviewCanvas");
  const cropSigBtn = document.getElementById("cropSigBtn");
  const rotateSigBtn = document.getElementById("rotateSigBtn");
  const resetCropBtn = document.getElementById("resetCropBtn");
  const sigPreviewBox = document.getElementById("sigPreviewBox");
  const cropInteractiveOverlay = document.getElementById(
    "cropInteractiveOverlay",
  );
  const cropBox = document.getElementById("cropBox");
  const cropDimTop = document.getElementById("cropDimTop");
  const cropDimBottom = document.getElementById("cropDimBottom");
  const cropDimLeft = document.getElementById("cropDimLeft");
  const cropDimRight = document.getElementById("cropDimRight");
  const cropActionBar = document.getElementById("cropActionBar");
  const cancelCropBtn = document.getElementById("cancelCropBtn");
  const applyCropBtn = document.getElementById("applyCropBtn");

  PDFSign.openCropMode = function () {
    if (!state.studio.uploadedImg || !uploadPreviewCanvas) return;
    cropState.active = true;
    if (sigPreviewBox) sigPreviewBox.classList.add("crop-mode");
    if (cropInteractiveOverlay) cropInteractiveOverlay.style.display = "block";
    if (cropActionBar) cropActionBar.style.display = "flex";

    PDFSign.renderCropSourceCanvas();

    requestAnimationFrame(() => {
      PDFSign.syncCropOverlaySize();
      const cw = cropState.overlayW;
      const ch = cropState.overlayH;
      cropState.x = Math.round(cw * 0.08);
      cropState.y = Math.round(ch * 0.08);
      cropState.w = Math.max(30, Math.round(cw * 0.84));
      cropState.h = Math.max(30, Math.round(ch * 0.84));
      PDFSign.updateCropBoxDom();
    });
  };

  PDFSign.closeCropMode = function () {
    cropState.active = false;
    cropState.activeHandle = null;
    if (sigPreviewBox) sigPreviewBox.classList.remove("crop-mode");
    if (cropInteractiveOverlay) cropInteractiveOverlay.style.display = "none";
    if (cropActionBar) cropActionBar.style.display = "none";
  };

  PDFSign.syncCropOverlaySize = function () {
    if (!uploadPreviewCanvas || !cropInteractiveOverlay) return;
    const cw = uploadPreviewCanvas.offsetWidth;
    const ch = uploadPreviewCanvas.offsetHeight;
    const cl = uploadPreviewCanvas.offsetLeft;
    const ct = uploadPreviewCanvas.offsetTop;

    cropInteractiveOverlay.style.left = cl + "px";
    cropInteractiveOverlay.style.top = ct + "px";
    cropInteractiveOverlay.style.width = cw + "px";
    cropInteractiveOverlay.style.height = ch + "px";

    cropState.overlayW = cw;
    cropState.overlayH = ch;
  };

  PDFSign.renderCropSourceCanvas = function () {
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
    const ctx = uploadPreviewCanvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
  };

  PDFSign.updateCropBoxDom = function () {
    if (!cropBox || cropState.overlayW <= 0 || cropState.overlayH <= 0) return;
    const ow = cropState.overlayW;
    const oh = cropState.overlayH;
    const minSize = 24;

    let x = Math.max(0, Math.min(ow - minSize, cropState.x));
    let y = Math.max(0, Math.min(oh - minSize, cropState.y));
    let w = Math.max(minSize, Math.min(ow - x, cropState.w));
    let h = Math.max(minSize, Math.min(oh - y, cropState.h));

    cropState.x = x;
    cropState.y = y;
    cropState.w = w;
    cropState.h = h;

    cropBox.style.left = x + "px";
    cropBox.style.top = y + "px";
    cropBox.style.width = w + "px";
    cropBox.style.height = h + "px";

    if (cropDimTop) {
      cropDimTop.style.left = "0px";
      cropDimTop.style.top = "0px";
      cropDimTop.style.width = "100%";
      cropDimTop.style.height = y + "px";
    }
    if (cropDimBottom) {
      cropDimBottom.style.left = "0px";
      cropDimBottom.style.top = y + h + "px";
      cropDimBottom.style.width = "100%";
      cropDimBottom.style.height = Math.max(0, oh - (y + h)) + "px";
    }
    if (cropDimLeft) {
      cropDimLeft.style.left = "0px";
      cropDimLeft.style.top = y + "px";
      cropDimLeft.style.width = x + "px";
      cropDimLeft.style.height = h + "px";
    }
    if (cropDimRight) {
      cropDimRight.style.left = x + w + "px";
      cropDimRight.style.top = y + "px";
      cropDimRight.style.width = Math.max(0, ow - (x + w)) + "px";
      cropDimRight.style.height = h + "px";
    }
  };

  PDFSign.applyCrop = function () {
    const src = state.studio.uploadedImg;
    if (!src || cropState.overlayW <= 0 || cropState.overlayH <= 0) return;

    const scaleX = src.width / cropState.overlayW;
    const scaleY = src.height / cropState.overlayH;

    const sx = Math.max(0, Math.round(cropState.x * scaleX));
    const sy = Math.max(0, Math.round(cropState.y * scaleY));
    const sw = Math.min(
      src.width - sx,
      Math.max(10, Math.round(cropState.w * scaleX)),
    );
    const sh = Math.min(
      src.height - sy,
      Math.max(10, Math.round(cropState.h * scaleY)),
    );

    const off = document.createElement("canvas");
    off.width = sw;
    off.height = sh;
    const ctx = off.getContext("2d");
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);

    state.studio.uploadedImg = off;
    state.studio.isCropped = true;
    if (resetCropBtn) resetCropBtn.style.display = "inline-flex";

    PDFSign.closeCropMode();
    if (PDFSign.renderProcessedUploadPreview) {
      PDFSign.renderProcessedUploadPreview();
    }
    PDFSign.showToast("Signature cropped successfully!");
  };

  PDFSign.cancelCrop = function () {
    PDFSign.closeCropMode();
    if (PDFSign.renderProcessedUploadPreview) {
      PDFSign.renderProcessedUploadPreview();
    }
  };

  PDFSign.resetCrop = function () {
    if (state.studio.rawUploadedImg) {
      state.studio.uploadedImg = state.studio.rawUploadedImg;
      state.studio.isCropped = false;
      if (resetCropBtn) resetCropBtn.style.display = "none";
      if (cropState.active) {
        PDFSign.closeCropMode();
      }
      if (PDFSign.renderProcessedUploadPreview) {
        PDFSign.renderProcessedUploadPreview();
      }
      PDFSign.showToast("Reset to original full photo");
    }
  };

  PDFSign.rotateUploadedSig = function () {
    const src = state.studio.uploadedImg;
    if (!src) return;
    const off = document.createElement("canvas");
    off.width = src.height;
    off.height = src.width;
    const ctx = off.getContext("2d");
    ctx.translate(off.width / 2, off.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);

    state.studio.uploadedImg = off;
    if (!state.studio.isCropped) {
      state.studio.rawUploadedImg = off;
    }
    if (cropState.active) {
      PDFSign.renderCropSourceCanvas();
      PDFSign.syncCropOverlaySize();
      PDFSign.updateCropBoxDom();
    } else if (PDFSign.renderProcessedUploadPreview) {
      PDFSign.renderProcessedUploadPreview();
    }
    PDFSign.showToast("Photo rotated 90°");
  };

  // Pointer interactions on crop overlay
  if (cropInteractiveOverlay) {
    cropInteractiveOverlay.addEventListener("pointerdown", (e) => {
      const handleEl = e.target.closest(".crop-handle");
      if (handleEl) {
        cropState.activeHandle = handleEl.getAttribute("data-handle");
      } else if (e.target.closest(".crop-box")) {
        cropState.activeHandle = "move";
      } else {
        const rect = cropInteractiveOverlay.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        cropState.activeHandle = "draw";
        cropState.drawStartX = clickX;
        cropState.drawStartY = clickY;
        cropState.x = clickX;
        cropState.y = clickY;
        cropState.w = 4;
        cropState.h = 4;
        PDFSign.updateCropBoxDom();
      }

      cropInteractiveOverlay.setPointerCapture(e.pointerId);
      cropState.dragStartX = e.clientX;
      cropState.dragStartY = e.clientY;
      cropState.startRect = {
        x: cropState.x,
        y: cropState.y,
        w: cropState.w,
        h: cropState.h,
      };
      e.stopPropagation();
      e.preventDefault();
    });

    cropInteractiveOverlay.addEventListener("pointermove", (e) => {
      if (!cropState.activeHandle) return;
      const dx = e.clientX - cropState.dragStartX;
      const dy = e.clientY - cropState.dragStartY;
      const start = cropState.startRect;
      const minSize = 24;

      if (cropState.activeHandle === "move") {
        cropState.x = start.x + dx;
        cropState.y = start.y + dy;
      } else if (cropState.activeHandle === "draw") {
        const rect = cropInteractiveOverlay.getBoundingClientRect();
        const curX = Math.max(
          0,
          Math.min(cropState.overlayW, e.clientX - rect.left),
        );
        const curY = Math.max(
          0,
          Math.min(cropState.overlayH, e.clientY - rect.top),
        );
        cropState.x = Math.min(cropState.drawStartX, curX);
        cropState.y = Math.min(cropState.drawStartY, curY);
        cropState.w = Math.abs(curX - cropState.drawStartX);
        cropState.h = Math.abs(curY - cropState.drawStartY);
      } else if (cropState.activeHandle === "se") {
        cropState.w = Math.max(minSize, start.w + dx);
        cropState.h = Math.max(minSize, start.h + dy);
      } else if (cropState.activeHandle === "sw") {
        const newW = Math.max(minSize, start.w - dx);
        cropState.x = start.x + (start.w - newW);
        cropState.w = newW;
        cropState.h = Math.max(minSize, start.h + dy);
      } else if (cropState.activeHandle === "ne") {
        const newH = Math.max(minSize, start.h - dy);
        cropState.y = start.y + (start.h - newH);
        cropState.w = Math.max(minSize, start.w + dx);
        cropState.h = newH;
      } else if (cropState.activeHandle === "nw") {
        const newW = Math.max(minSize, start.w - dx);
        const newH = Math.max(minSize, start.h - dy);
        cropState.x = start.x + (start.w - newW);
        cropState.y = start.y + (start.h - newH);
        cropState.w = newW;
        cropState.h = newH;
      } else if (cropState.activeHandle === "n") {
        const newH = Math.max(minSize, start.h - dy);
        cropState.y = start.y + (start.h - newH);
        cropState.h = newH;
      } else if (cropState.activeHandle === "s") {
        cropState.h = Math.max(minSize, start.h + dy);
      } else if (cropState.activeHandle === "w") {
        const newW = Math.max(minSize, start.w - dx);
        cropState.x = start.x + (start.w - newW);
        cropState.w = newW;
      } else if (cropState.activeHandle === "e") {
        cropState.w = Math.max(minSize, start.w + dx);
      }

      PDFSign.updateCropBoxDom();
    });

    const endCropPointer = () => {
      cropState.activeHandle = null;
    };

    cropInteractiveOverlay.addEventListener("pointerup", endCropPointer);
    cropInteractiveOverlay.addEventListener("pointercancel", endCropPointer);
  }

  if (cropSigBtn) cropSigBtn.addEventListener("click", PDFSign.openCropMode);
  if (rotateSigBtn)
    rotateSigBtn.addEventListener("click", PDFSign.rotateUploadedSig);
  if (resetCropBtn) resetCropBtn.addEventListener("click", PDFSign.resetCrop);
  if (cancelCropBtn)
    cancelCropBtn.addEventListener("click", PDFSign.cancelCrop);
  if (applyCropBtn) applyCropBtn.addEventListener("click", PDFSign.applyCrop);

  window.addEventListener("resize", () => {
    if (cropState.active) {
      PDFSign.syncCropOverlaySize();
      PDFSign.updateCropBoxDom();
    }
  });
})();
