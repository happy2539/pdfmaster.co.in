/**
 * PDFMaster - Sign PDF Tool
 * Module: studio-draw.js
 * Signature Studio - Tab 1: Freehand Drawing Canvas with Bézier smoothing
 */
(function () {
  "use strict";

  window.PDFSign = window.PDFSign || {};
  const PDFSign = window.PDFSign;
  const state = PDFSign.state;

  // Drawing runtime variables
  PDFSign.draw = {
    isDrawing: false,
    drawPoints: [],
    drawStrokes: [],
    drawRedoStack: [],
  };

  const drawState = PDFSign.draw;

  // DOM Elements
  const drawCanvas = document.getElementById("drawCanvas");
  const drawPlaceholder = document.getElementById("drawPlaceholder");
  const clearDrawBtn = document.getElementById("clearDrawBtn");
  const undoDrawBtn = document.getElementById("undoDrawBtn");
  const redoDrawBtn = document.getElementById("redoDrawBtn");
  const colorSwatches = document.querySelectorAll(
    "#tabPane_draw .color-swatch",
  );
  const customColorPicker = document.getElementById("customColorPicker");
  const strokeButtons = document.querySelectorAll(".stroke-btn");

  PDFSign.updateDrawUndoRedoBtns = function () {
    if (undoDrawBtn) undoDrawBtn.disabled = drawState.drawStrokes.length === 0;
    if (redoDrawBtn)
      redoDrawBtn.disabled = drawState.drawRedoStack.length === 0;
  };

  PDFSign.initDrawCanvas = function () {
    if (!drawCanvas) return;
    const rect = drawCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    drawCanvas.width = rect.width * dpr;
    drawCanvas.height = rect.height * dpr;

    const ctx = drawCanvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    PDFSign.redrawDrawStrokes();
    PDFSign.updateDrawUndoRedoBtns();
  };

  PDFSign.redrawDrawStrokes = function () {
    if (!drawCanvas) return;
    const ctx = drawCanvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.clearRect(0, 0, drawCanvas.width / dpr, drawCanvas.height / dpr);

    if (drawState.drawStrokes.length === 0) {
      if (drawPlaceholder) drawPlaceholder.style.display = "block";
      PDFSign.updateDrawUndoRedoBtns();
      return;
    }
    if (drawPlaceholder) drawPlaceholder.style.display = "none";

    drawState.drawStrokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;

      const pts = stroke.points;
      ctx.moveTo(pts[0].x, pts[0].y);

      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    });

    PDFSign.updateDrawUndoRedoBtns();
  };

  if (drawCanvas) {
    drawCanvas.addEventListener("pointerdown", (e) => {
      drawState.isDrawing = true;
      drawCanvas.setPointerCapture(e.pointerId);
      const rect = drawCanvas.getBoundingClientRect();
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      drawState.drawPoints = [pt];
      if (drawPlaceholder) drawPlaceholder.style.display = "none";
    });

    drawCanvas.addEventListener("pointermove", (e) => {
      if (!drawState.isDrawing) return;
      const rect = drawCanvas.getBoundingClientRect();
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      drawState.drawPoints.push(pt);

      const ctx = drawCanvas.getContext("2d");
      ctx.strokeStyle = state.studio.penColor;
      ctx.lineWidth = state.studio.penStrokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (drawState.drawPoints.length >= 2) {
        const p1 = drawState.drawPoints[drawState.drawPoints.length - 2];
        const p2 = drawState.drawPoints[drawState.drawPoints.length - 1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    });

    const endDraw = () => {
      if (!drawState.isDrawing) return;
      drawState.isDrawing = false;
      if (drawState.drawPoints.length > 1) {
        drawState.drawStrokes.push({
          points: drawState.drawPoints,
          color: state.studio.penColor,
          width: state.studio.penStrokeWidth,
        });
        drawState.drawRedoStack = [];
      }
      drawState.drawPoints = [];
      PDFSign.redrawDrawStrokes();
      PDFSign.updateDrawUndoRedoBtns();
    };

    drawCanvas.addEventListener("pointerup", endDraw);
    drawCanvas.addEventListener("pointercancel", endDraw);
  }

  if (clearDrawBtn) {
    clearDrawBtn.addEventListener("click", () => {
      if (drawState.drawStrokes.length > 0) {
        drawState.drawRedoStack = [...drawState.drawStrokes];
        drawState.drawStrokes = [];
        PDFSign.redrawDrawStrokes();
        PDFSign.updateDrawUndoRedoBtns();
      }
    });
  }

  if (undoDrawBtn) {
    undoDrawBtn.addEventListener("click", () => {
      if (drawState.drawStrokes.length > 0) {
        drawState.drawRedoStack.push(drawState.drawStrokes.pop());
        PDFSign.redrawDrawStrokes();
        PDFSign.updateDrawUndoRedoBtns();
      }
    });
  }

  if (redoDrawBtn) {
    redoDrawBtn.addEventListener("click", () => {
      if (drawState.drawRedoStack.length > 0) {
        drawState.drawStrokes.push(drawState.drawRedoStack.pop());
        PDFSign.redrawDrawStrokes();
        PDFSign.updateDrawUndoRedoBtns();
      }
    });
  }

  // Draw Pen Color Swatches
  colorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const color = swatch.getAttribute("data-color");
      state.studio.penColor = color;
      colorSwatches.forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      if (customColorPicker) {
        customColorPicker.value = color;
        customColorPicker.classList.remove("active");
      }
    });
  });

  if (customColorPicker) {
    customColorPicker.addEventListener("input", (e) => {
      state.studio.penColor = e.target.value;
      colorSwatches.forEach((s) => s.classList.remove("active"));
      customColorPicker.classList.add("active");
    });
  }

  // Stroke Width Buttons
  strokeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = parseFloat(btn.getAttribute("data-width"));
      state.studio.penStrokeWidth = w;
      strokeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Export trimmed PNG from Drawing Canvas
  PDFSign.getDrawCanvasTrimmedPng = function () {
    if (drawState.drawStrokes.length === 0) return null;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    drawState.drawStrokes.forEach((stroke) => {
      stroke.points.forEach((p) => {
        minX = Math.min(minX, p.x - stroke.width);
        minY = Math.min(minY, p.y - stroke.width);
        maxX = Math.max(maxX, p.x + stroke.width);
        maxY = Math.max(maxY, p.y + stroke.width);
      });
    });

    const padding = 12;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(drawCanvas.width, maxX + padding);
    maxY = Math.min(drawCanvas.height, maxY + padding);

    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return null;

    // High resolution offscreen canvas
    const off = document.createElement("canvas");
    const dpr = 2; // retina export
    off.width = w * dpr;
    off.height = h * dpr;
    const ctx = off.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawState.drawStrokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;

      const pts = stroke.points;
      ctx.moveTo(pts[0].x - minX, pts[0].y - minY);

      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2 - minX;
        const yc = (pts[i].y + pts[i + 1].y) / 2 - minY;
        ctx.quadraticCurveTo(pts[i].x - minX, pts[i].y - minY, xc, yc);
      }
      ctx.lineTo(pts[pts.length - 1].x - minX, pts[pts.length - 1].y - minY);
      ctx.stroke();
    });

    return {
      dataUrl: off.toDataURL("image/png"),
      aspectRatio: w / h,
    };
  };
})();
