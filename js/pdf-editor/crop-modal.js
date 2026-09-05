/**
 * PDFMaster PDF Editor - Image & Crop Modal
 * Image resizing/reading, image stamping, and interactive crop overlay modal.
 */
"use strict";

/* ---------- image / stamp placement ---------- */
function readFileAsDataURL(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () {
      resolve(r.result);
    };
    r.onerror = function () {
      reject(r.error);
    };
    r.readAsDataURL(file);
  });
}

function resizeImageIfTooLarge(file, maxDimension) {
  return new Promise(function (resolve, reject) {
    if (!file) {
      resolve(null);
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.width;
        var h = img.height;
        if (w <= maxDimension && h <= maxDimension) {
          resolve({ file: file, dataUrl: e.target.result });
          return;
        }
        if (w > h) {
          if (w > maxDimension) {
            h = Math.round((h * maxDimension) / w);
            w = maxDimension;
          }
        } else {
          if (h > maxDimension) {
            w = Math.round((w * maxDimension) / h);
            h = maxDimension;
          }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
        }
        canvas.toBlob(function (blob) {
          if (!blob) {
            resolve({ file: file, dataUrl: e.target.result });
            return;
          }
          var resizedFile = new File([blob], file.name, {
            type: file.type || "image/png",
            lastModified: Date.now(),
          });
          var dataUrl = canvas.toDataURL(file.type || "image/png");
          resolve({ file: resizedFile, dataUrl: dataUrl });
        }, file.type || "image/png");
      };
      img.onerror = function () {
        reject(new Error("Failed to load image for resizing"));
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      reject(new Error("Failed to read file for resizing"));
    };
    reader.readAsDataURL(file);
  });
}
function getImageDims(dataUrl) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = function () {
      reject(new Error("bad image"));
    };
    img.src = dataUrl;
  });
}
function placePendingAt(pt) {
  if (!pendingPlaceable) {
    return;
  }
  var w = pendingPlaceable.width,
    h = pendingPlaceable.height;
  var ann = {
    id: nextId(),
    type: "image",
    page: currentPage,
    x: pt.x - w / 2,
    y: pt.y - h / 2,
    width: w,
    height: h,
    dataUrl: pendingPlaceable.dataUrl,
  };
  addAnnotation(currentPage, ann);
  pendingPlaceable = null;
  selectedAnnotation = null;
  setActiveTool("select");
  redrawAnnotations();
}

/* ---------- cropping helpers ---------- */
function openCropModal(ann) {
  var img = new Image();
  img.onload = function () {
    cropState.img = img;
    cropState.ann = ann;
    cropState.cropRect = {
      x: 0,
      y: 0,
      w: img.naturalWidth,
      h: img.naturalHeight,
    };

    document.getElementById("crop-overlay").classList.add("is-open");
    var modal = document.getElementById("crop-modal");
    modal.style.opacity = "1";
    modal.style.pointerEvents = "auto";
    modal.style.transform = "translate(-50%,-50%) scale(1)";
    modal.setAttribute("aria-hidden", "false");

    setupCropInterface();
  };
  img.onerror = function () {
    window.showToast("Couldn't load image for cropping.");
  };
  img.src = ann.dataUrl;
}

function closeCropModal() {
  document.getElementById("crop-overlay").classList.remove("is-open");
  var modal = document.getElementById("crop-modal");
  modal.style.opacity = "0";
  modal.style.pointerEvents = "none";
  modal.style.transform = "translate(-50%,-50%) scale(.94)";
  modal.setAttribute("aria-hidden", "true");

  cropState.img = null;
  cropState.ann = null;
  cropState.cropRect = null;
  cropState.activeHandle = null;
}

function setupCropInterface() {
  var canvas = document.getElementById("crop-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var img = cropState.img;

  var maxW =
    Math.min(500, document.getElementById("crop-modal").clientWidth - 64) - 40; // 20px padding on left & right
  var maxH = 380 - 40; // 20px padding on top & bottom
  var scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  cropState.scale = scale;

  canvas.width = img.naturalWidth * scale + 40;
  canvas.height = img.naturalHeight * scale + 40;

  function drawCrop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw checkered background only inside the image boundaries (signatures have transparent backgrounds)
    var checkSize = 10;
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(20, 20, canvas.width - 40, canvas.height - 40);
    ctx.fillStyle = "#e5e7eb";
    for (var y = 20; y < canvas.height - 20; y += checkSize * 2) {
      for (var x = 20; x < canvas.width - 20; x += checkSize * 2) {
        ctx.fillRect(x, y, checkSize, checkSize);
        ctx.fillRect(x + checkSize, y + checkSize, checkSize, checkSize);
      }
    }

    ctx.drawImage(
      img,
      20,
      20,
      img.naturalWidth * scale,
      img.naturalHeight * scale,
    );

    // Draw image boundary outline
    ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, img.naturalWidth * scale, img.naturalHeight * scale);

    var rect = cropState.cropRect;
    var cx = 20 + rect.x * scale;
    var cy = 20 + rect.y * scale;
    var cw = rect.w * scale;
    var ch = rect.h * scale;

    // Draw overlay (outside cropRect but inside image bounds)
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    // Top overlay
    ctx.fillRect(20, 20, img.naturalWidth * scale, cy - 20);
    // Bottom overlay
    ctx.fillRect(
      20,
      cy + ch,
      img.naturalWidth * scale,
      20 + img.naturalHeight * scale - (cy + ch),
    );
    // Left overlay
    ctx.fillRect(20, cy, cx - 20, ch);
    // Right overlay
    ctx.fillRect(cx + cw, cy, 20 + img.naturalWidth * scale - (cx + cw), ch);

    // Draw crop rect border
    ctx.strokeStyle = "#e8372a";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.setLineDash([]);

    // Draw corner handles
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#e8372a";
    ctx.lineWidth = 2.5;
    var r = 9;
    var corners = [
      { x: cx, y: cy },
      { x: cx + cw, y: cy },
      { x: cx, y: cy + ch },
      { x: cx + cw, y: cy + ch },
    ];
    corners.forEach(function (c) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  cropState.drawCrop = drawCrop;
  drawCrop();
}

function applyCrop() {
  if (!cropState.img || !cropState.ann) return;
  var rect = cropState.cropRect;
  if (rect.w < 5 || rect.h < 5) {
    window.showToast("Crop area is too small.");
    return;
  }

  var tempCanvas = document.createElement("canvas");
  tempCanvas.width = rect.w;
  tempCanvas.height = rect.h;
  var tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) return;

  tempCtx.drawImage(
    cropState.img,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    0,
    0,
    rect.w,
    rect.h,
  );

  var croppedDataUrl = tempCanvas.toDataURL("image/png");

  pushHistory();

  var ann = cropState.ann;
  var origW = cropState.img.naturalWidth;
  var origH = cropState.img.naturalHeight;

  var relX = rect.x / origW;
  var relY = rect.y / origH;
  var relW = rect.w / origW;
  var relH = rect.h / origH;

  ann.x = ann.x + ann.width * relX;
  ann.y = ann.y + ann.height * relY;
  ann.width = ann.width * relW;
  ann.height = ann.height * relH;
  ann.dataUrl = croppedDataUrl;

  if (imageElCache[ann.id]) {
    delete imageElCache[ann.id];
  }

  redrawAnnotations();
  closeCropModal();
}

var CONFIGURABLE_TOOLS = [
  "pen",
  "highlighter",
  "rect",
  "ellipse",
  "line",
  "arrow",
  "text",
  "stroke-eraser",
  "pixel-eraser",
];

document.getElementById("image-input").addEventListener("change", function (e) {
  var file = e.target.files[0];
  e.target.value = "";
  if (!file) {
    setActiveTool("select");
    return;
  }
  readFileAsDataURL(file)
    .then(function (dataUrl) {
      return getImageDims(dataUrl).then(function (dims) {
        var maxW =
          (pageDimsCache[currentPage]
            ? pageDimsCache[currentPage].width
            : 400) * 0.4;
        var w = dims.width,
          h = dims.height;
        if (w > maxW) {
          h = h * (maxW / w);
          w = maxW;
        }
        pendingPlaceable = {
          type: "image",
          dataUrl: dataUrl,
          width: w,
          height: h,
        };
        window.showToast("Tap anywhere on the page to place the image.");
      });
    })
    .catch(function () {
      window.showToast("Couldn't load that image.");
      setActiveTool("select");
    });
});
// Crop Action events
var cropBtnEl = document.getElementById("crop-btn");
if (cropBtnEl) {
  cropBtnEl.addEventListener("click", function () {
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann && ann.type === "image") {
        openCropModal(ann);
      }
    }
  });
}
var cropCloseEl = document.getElementById("crop-close");
if (cropCloseEl) cropCloseEl.addEventListener("click", closeCropModal);
var cropOverlayEl = document.getElementById("crop-overlay");
if (cropOverlayEl) cropOverlayEl.addEventListener("click", closeCropModal);
var cropCancelEl = document.getElementById("crop-cancel");
if (cropCancelEl) cropCancelEl.addEventListener("click", closeCropModal);
var cropApplyEl = document.getElementById("crop-apply");
if (cropApplyEl) cropApplyEl.addEventListener("click", applyCrop);

// Crop Canvas interaction setup
(function () {
  var canvas = document.getElementById("crop-canvas");
  if (!canvas) return;

  canvas.addEventListener("pointerdown", function (e) {
    if (!cropState.img) return;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}

    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    var scale = cropState.scale;
    var img = cropState.img;
    var cropRect = cropState.cropRect;

    var handleSize = 16;
    var cx1 = 20 + cropRect.x * scale;
    var cy1 = 20 + cropRect.y * scale;
    var cx2 = cx1 + cropRect.w * scale;
    var cy2 = cy1 + cropRect.h * scale;

    if (Math.hypot(mx - cx1, my - cy1) < handleSize)
      cropState.activeHandle = "tl";
    else if (Math.hypot(mx - cx2, my - cy1) < handleSize)
      cropState.activeHandle = "tr";
    else if (Math.hypot(mx - cx1, my - cy2) < handleSize)
      cropState.activeHandle = "bl";
    else if (Math.hypot(mx - cx2, my - cy2) < handleSize)
      cropState.activeHandle = "br";
    else if (mx >= cx1 && mx <= cx2 && my >= cy1 && my <= cy2) {
      cropState.activeHandle = "move";
    } else {
      cropState.activeHandle = "draw";
      var clickX = Math.max(0, Math.min(img.naturalWidth, (mx - 20) / scale));
      var clickY = Math.max(0, Math.min(img.naturalHeight, (my - 20) / scale));
      cropState.cropRect = { x: clickX, y: clickY, w: 0, h: 0 };
    }

    cropState.dragStart = { x: mx, y: my };
    cropState.startCropRect = deepClone(cropState.cropRect);
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!cropState.img || !cropState.activeHandle) return;
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    var scale = cropState.scale;
    var img = cropState.img;
    var dx = (mx - cropState.dragStart.x) / scale;
    var dy = (my - cropState.dragStart.y) / scale;
    var start = cropState.startCropRect;

    if (cropState.activeHandle === "move") {
      var newX = start.x + dx;
      var newY = start.y + dy;
      newX = Math.max(0, Math.min(img.naturalWidth - start.w, newX));
      newY = Math.max(0, Math.min(img.naturalHeight - start.h, newY));
      cropState.cropRect.x = newX;
      cropState.cropRect.y = newY;
    } else if (cropState.activeHandle === "draw") {
      var curX = Math.max(0, Math.min(img.naturalWidth, (mx - 20) / scale));
      var curY = Math.max(0, Math.min(img.naturalHeight, (my - 20) / scale));
      cropState.cropRect = {
        x: Math.min(start.x, curX),
        y: Math.min(start.y, curY),
        w: Math.abs(start.x - curX),
        h: Math.abs(start.y - curY),
      };
    } else {
      var x1 = start.x;
      var y1 = start.y;
      var x2 = start.x + start.w;
      var y2 = start.y + start.h;

      if (cropState.activeHandle === "tl") {
        x1 = Math.max(0, Math.min(x2 - 10, x1 + dx));
        y1 = Math.max(0, Math.min(y2 - 10, y1 + dy));
      } else if (cropState.activeHandle === "tr") {
        x2 = Math.max(x1 + 10, Math.min(img.naturalWidth, x2 + dx));
        y1 = Math.max(0, Math.min(y2 - 10, y1 + dy));
      } else if (cropState.activeHandle === "bl") {
        x1 = Math.max(0, Math.min(x2 - 10, x1 + dx));
        y2 = Math.max(y1 + 10, Math.min(img.naturalHeight, y2 + dy));
      } else if (cropState.activeHandle === "br") {
        x2 = Math.max(x1 + 10, Math.min(img.naturalWidth, x2 + dx));
        y2 = Math.max(y1 + 10, Math.min(img.naturalHeight, y2 + dy));
      }
      cropState.cropRect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }

    if (cropState.drawCrop) cropState.drawCrop();
  });

  var up = function (e) {
    if (!cropState.img || !cropState.activeHandle) return;
    cropState.activeHandle = null;
    var img = cropState.img;
    if (cropState.cropRect.w < 5 || cropState.cropRect.h < 5) {
      cropState.cropRect = {
        x: 0,
        y: 0,
        w: img.naturalWidth,
        h: img.naturalHeight,
      };
      if (cropState.drawCrop) cropState.drawCrop();
    }
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
})();
