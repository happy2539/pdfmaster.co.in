/**
 * PDFMaster PDF Editor - Canvas Renderer
 * PDF page rasterization, annotation drawing, zoom controls, and selection UI rendering.
 */
"use strict";


/* ---------- rendering ---------- */
function renderPage(pageNum) {
  currentPage = pageNum;
  var myToken = ++renderToken;
  return pdfDoc.getPage(pageNum).then(function (page) {
    if (myToken !== renderToken) return; // superseded by a newer page request
    if (currentPageProxy && currentPageProxy !== page) {
      try {
        currentPageProxy.cleanup();
      } catch (e) {}
    }
    currentPageProxy = page;
    var userRot = (pageRotations[pageNum] || 0) % 360;
    var effectiveRot = ((((page.rotate || 0) + userRot) % 360) + 360) % 360;
    if (!pageDimsCache[pageNum]) {
      var vp1 = page.getViewport({ scale: 1, rotation: effectiveRot });
      pageDimsCache[pageNum] = { width: vp1.width, height: vp1.height };
    }
    var dims = pageDimsCache[pageNum];
    var stage = document.getElementById("canvas-stage");
    var availWidth = Math.max(240, stage.clientWidth - 60);
    baseScale = Math.max(0.25, Math.min(availWidth / dims.width, 2.2));
    currentScale = baseScale * zoomFactor;
    var viewport = page.getViewport({
      scale: currentScale,
      rotation: effectiveRot,
    });
    var pdfCanvas = document.getElementById("pdf-canvas");
    var annCanvas = document.getElementById("annotation-canvas");
    var frame = document.getElementById("canvas-frame");
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;
    annCanvas.width = viewport.width;
    annCanvas.height = viewport.height;
    frame.style.width = viewport.width + "px";
    frame.style.height = viewport.height + "px";
    var ctx = pdfCanvas.getContext("2d");
    return page
      .render({ canvasContext: ctx, viewport: viewport })
      .promise.then(function () {
        if (myToken !== renderToken) return; // a newer page render won the race
        redrawAnnotations();
        if (selectedAnnotation || selectedGroup) {
          positionToolOptionsPanel();
        }
        document.getElementById("page-indicator").textContent =
          "Page " + currentPage + " of " + numPages;
        document.getElementById("prev-page").disabled = currentPage <= 1;
        document.getElementById("next-page").disabled =
          currentPage >= numPages;
        var rotBtn = document.getElementById("rotate-page-btn");
        if (rotBtn) rotBtn.disabled = false;
        document.getElementById("zoom-level").textContent =
          Math.round(zoomFactor * 100) + "%";
        document.getElementById("loading-panel").classList.add("hidden");
        document.getElementById("canvas-frame").classList.remove("hidden");
        scheduleDBSave();
        prefetchAdjacentPage(pageNum);
      });
  });
}
function prefetchAdjacentPage(pageNum) {
  if (!pdfDoc) return;
  var next = pageNum + 1;
  if (next > numPages) return;
  // Warms pdf.js's internal page cache for the likely-next page so forward
  // navigation feels instant. Doesn't render anything, so it stays cheap even
  // on huge documents — just fetches that one page's byte range in the background.
  pdfDoc.getPage(next).catch(function () {});
}
function zoomIn() {
  var i = ZOOM_STEPS.findIndex(function (z) {
    return z > zoomFactor + 0.001;
  });
  if (i !== -1) {
    zoomFactor = ZOOM_STEPS[i];
    renderPage(currentPage);
  }
}
function zoomOut() {
  var rev = ZOOM_STEPS.slice().reverse();
  var i = rev.findIndex(function (z) {
    return z < zoomFactor - 0.001;
  });
  if (i !== -1) {
    zoomFactor = rev[i];
    renderPage(currentPage);
  }
}

/* ---------- drawing ---------- */
function drawArrowOnCanvas(ctx, ann, scale) {
  var x1 = ann.x1 * scale,
    y1 = ann.y1 * scale,
    x2 = ann.x2 * scale,
    y2 = ann.y2 * scale;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  var angle = Math.atan2(y2 - y1, x2 - x1);
  var headLen = Math.max(10, ann.strokeWidth * scale * 3.2);
  var spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - spread),
    y2 - headLen * Math.sin(angle - spread),
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + spread),
    y2 - headLen * Math.sin(angle + spread),
  );
  ctx.stroke();
}
function drawAnnotation(ctx, ann, scale) {
  ctx.save();
  var rot = ann.rotation || 0;
  if (rot !== 0) {
    var center = getCenter(ann);
    ctx.translate(center.x * scale, center.y * scale);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-center.x * scale, -center.y * scale);
  }
  switch (ann.type) {
    case "text": {
      if (ann.isEditing) break;
      var style = "";
      if (ann.isItalic) style += "italic ";
      if (ann.isBold) style += "bold ";
      ctx.font = style + ann.fontSize * scale + "px 'DM Sans', sans-serif";
      ctx.fillStyle = ann.color;
      ctx.textBaseline = "top";
      ctx.fillText(ann.text, ann.x * scale, ann.y * scale);

      if (ann.isUnderline) {
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = Math.max(1, ann.fontSize * scale * 0.08);
        var textWidth = ctx.measureText(ann.text).width;
        var underlineY = ann.y * scale + ann.fontSize * scale * 0.95;
        ctx.beginPath();
        ctx.moveTo(ann.x * scale, underlineY);
        ctx.lineTo(ann.x * scale + textWidth, underlineY);
        ctx.stroke();
      }
      break;
    }
    case "rect": {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = Math.max(1, ann.strokeWidth * scale);
      ctx.strokeRect(
        ann.x * scale,
        ann.y * scale,
        ann.width * scale,
        ann.height * scale,
      );
      break;
    }
    case "ellipse": {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = Math.max(1, ann.strokeWidth * scale);
      ctx.beginPath();
      ctx.ellipse(
        ann.cx * scale,
        ann.cy * scale,
        Math.max(ann.rx * scale, 0.01),
        Math.max(ann.ry * scale, 0.01),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      break;
    }
    case "line": {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = Math.max(1, ann.strokeWidth * scale);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ann.x1 * scale, ann.y1 * scale);
      ctx.lineTo(ann.x2 * scale, ann.y2 * scale);
      ctx.stroke();
      break;
    }
    case "arrow": {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = Math.max(1, ann.strokeWidth * scale);
      ctx.lineCap = "round";
      drawArrowOnCanvas(ctx, ann, scale);
      break;
    }
    case "path": {
      if (ann.points && ann.points.length > 0) {
        ctx.globalAlpha = ann.opacity != null ? ann.opacity : 1;
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = Math.max(1, ann.strokeWidth * scale);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        var pts = ann.points;
        ctx.beginPath();
        if (pts.length === 1) {
          ctx.arc(
            pts[0].x * scale,
            pts[0].y * scale,
            Math.max(1, ann.strokeWidth * scale) / 2,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = ann.color;
          ctx.fill();
        } else if (pts.length === 2) {
          ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
          ctx.lineTo(pts[1].x * scale, pts[1].y * scale);
          ctx.stroke();
        } else {
          ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
          for (var i = 1; i < pts.length - 1; i++) {
            var midX = (pts[i].x + pts[i + 1].x) / 2;
            var midY = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(
              pts[i].x * scale,
              pts[i].y * scale,
              midX * scale,
              midY * scale,
            );
          }
          ctx.lineTo(
            pts[pts.length - 1].x * scale,
            pts[pts.length - 1].y * scale,
          );
          ctx.stroke();
        }
      }
      break;
    }
    case "eraser": {
      if (ann.points && ann.points.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = Math.max(1, ann.size * scale);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.fillStyle = "rgba(0,0,0,1)";
        if (ann.points.length === 1) {
          ctx.beginPath();
          ctx.arc(
            ann.points[0].x * scale,
            ann.points[0].y * scale,
            (ann.size / 2) * scale,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(ann.points[0].x * scale, ann.points[0].y * scale);
          for (var i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x * scale, ann.points[i].y * scale);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }
    case "image": {
      var img = imageElCache[ann.id];
      if (!img) {
        img = new Image();
        img.onload = (function (a) {
          return function () {
            if (a.page === currentPage) {
              redrawAnnotations();
            }
          };
        })(ann);
        img.src = ann.dataUrl;
        imageElCache[ann.id] = img;
      }
      if (img.complete && img.naturalWidth) {
        ctx.drawImage(
          img,
          ann.x * scale,
          ann.y * scale,
          ann.width * scale,
          ann.height * scale,
        );
      }
      break;
    }
  }
  ctx.restore();
}
function drawSelectionUI(ctx, ann, scale) {
  if (!ann || isAnnotationEmpty(ann)) {
    selectedAnnotation = null;
    return;
  }
  var handles = getSelectionHandles(ann, scale);
  var b = handles.box;
  ctx.save();
  var rot = ann.rotation || 0;
  if (rot !== 0) {
    var center = getCenter(ann);
    ctx.translate(center.x * scale, center.y * scale);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-center.x * scale, -center.y * scale);
  }
  ctx.strokeStyle = "#e8372a";
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.setLineDash([]);

  // Stalk line to rotate handle
  ctx.beginPath();
  ctx.moveTo(b.x + b.w / 2, b.y);
  ctx.lineTo(handles.rotateBtn.x, handles.rotateBtn.y + handles.rotateBtn.r);
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Rotate handle circle
  ctx.beginPath();
  ctx.arc(
    handles.rotateBtn.x,
    handles.rotateBtn.y,
    handles.rotateBtn.r,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "#10b981";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Rotate icon inside circle
  ctx.beginPath();
  ctx.arc(
    handles.rotateBtn.x,
    handles.rotateBtn.y,
    4.5,
    0.2 * Math.PI,
    1.5 * Math.PI,
  );
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  var ahX = handles.rotateBtn.x + 4.5 * Math.cos(1.5 * Math.PI);
  var ahY = handles.rotateBtn.y + 4.5 * Math.sin(1.5 * Math.PI);
  ctx.beginPath();
  ctx.moveTo(ahX - 3, ahY - 1);
  ctx.lineTo(ahX, ahY);
  ctx.lineTo(ahX - 1, ahY + 3);
  ctx.stroke();

  // Delete button
  ctx.beginPath();
  ctx.arc(
    handles.deleteBtn.x,
    handles.deleteBtn.y,
    handles.deleteBtn.r,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "#e8372a";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(handles.deleteBtn.x - 4, handles.deleteBtn.y - 4);
  ctx.lineTo(handles.deleteBtn.x + 4, handles.deleteBtn.y + 4);
  ctx.moveTo(handles.deleteBtn.x + 4, handles.deleteBtn.y - 4);
  ctx.lineTo(handles.deleteBtn.x - 4, handles.deleteBtn.y + 4);
  ctx.stroke();

  // Crop button handle if available
  if (handles.cropBtn) {
    ctx.beginPath();
    ctx.arc(
      handles.cropBtn.x,
      handles.cropBtn.y,
      handles.cropBtn.r,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "#2563eb";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    var cx = handles.cropBtn.x;
    var cy = handles.cropBtn.y;
    ctx.moveTo(cx - 4, cy - 1);
    ctx.lineTo(cx + 1, cy - 1);
    ctx.lineTo(cx + 1, cy + 4);
    ctx.moveTo(cx - 1, cy - 4);
    ctx.lineTo(cx - 1, cy + 1);
    ctx.lineTo(cx + 4, cy + 1);
    ctx.stroke();
  }

  var list = [
    handles.tl,
    handles.tr,
    handles.br,
    handles.bl,
    handles.t,
    handles.b,
    handles.l,
    handles.r,
  ];

  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#e8372a";
  ctx.lineWidth = 1.6;
  list.forEach(function (h) {
    ctx.beginPath();
    ctx.rect(h.x - 5, h.y - 5, 10, 10);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}
function requestRedraw() {
  if (redrawScheduled) return;
  redrawScheduled = true;
  requestAnimationFrame(function () {
    redrawScheduled = false;
    redrawAnnotations();
  });
}
function redrawAnnotations() {
  var canvas = document.getElementById("annotation-canvas");
  var ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  cleanPageAnnotations(currentPage);
  var list = annotationsByPage[currentPage] || [];
  for (var i = 0; i < list.length; i++) {
    drawAnnotation(ctx, list[i], currentScale);
  }
  if (livePath) {
    drawAnnotation(
      ctx,
      {
        type: "path",
        points: livePath.points,
        color: livePath.style.color,
        strokeWidth: livePath.style.strokeWidth,
        opacity: livePath.style.opacity,
      },
      currentScale,
    );
  }
  if (liveShape) {
    drawAnnotation(ctx, liveShape, currentScale);
  }
  if (liveEraser) {
    drawAnnotation(
      ctx,
      {
        type: "eraser",
        points: liveEraser.points,
        size: liveEraser.size,
      },
      currentScale,
    );
  }
  if (selectedAnnotation && selectedAnnotation.page === currentPage) {
    var ann = findAnnotation(currentPage, selectedAnnotation.id);
    if (ann && !isAnnotationEmpty(ann)) {
      drawSelectionUI(ctx, ann, currentScale);
    } else {
      selectedAnnotation = null;
    }
  }
  if (selectedGroup && selectedGroup.page === currentPage) {
    var groupAnns = getGroupAnnotations();
    if (groupAnns.length > 1) {
      drawGroupSelectionUI(ctx, groupAnns, currentScale);
    } else if (groupAnns.length === 1) {
      selectedAnnotation = { page: currentPage, id: groupAnns[0].id };
      selectedGroup = null;
      drawSelectionUI(ctx, groupAnns[0], currentScale);
    } else {
      selectedGroup = null;
    }
  }
  if (liveLasso && liveLasso.length > 1) {
    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
    ctx.beginPath();
    ctx.moveTo(liveLasso[0].x * currentScale, liveLasso[0].y * currentScale);
    for (var li = 1; li < liveLasso.length; li++) {
      ctx.lineTo(
        liveLasso[li].x * currentScale,
        liveLasso[li].y * currentScale,
      );
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (
    (currentTool === "pen" || currentTool === "highlighter") &&
    strokePreviewPoint &&
    !isPointerDown
  ) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    var sRad = Math.max(1.5, (currentStrokeWidth / 2) * currentScale);
    ctx.arc(
      strokePreviewPoint.x * currentScale,
      strokePreviewPoint.y * currentScale,
      sRad,
      0,
      Math.PI * 2,
    );
    if (currentTool === "highlighter") {
      ctx.fillStyle = currentColor;
      ctx.globalAlpha = 0.45;
      ctx.fill();
      ctx.strokeStyle = currentColor;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = currentColor;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  }
  if (
    (currentTool === "stroke-eraser" || currentTool === "pixel-eraser") &&
    eraserPreviewPoint
  ) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    var rad = (eraserSize / 2) * currentScale;
    ctx.arc(
      eraserPreviewPoint.x * currentScale,
      eraserPreviewPoint.y * currentScale,
      rad,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle =
      currentTool === "stroke-eraser"
        ? "rgba(232, 55, 42, 0.14)"
        : "rgba(37, 99, 235, 0.14)";
    ctx.strokeStyle = currentTool === "stroke-eraser" ? "#e8372a" : "#2563eb";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  scheduleDBSave();
}

