/**
 * PDFMaster PDF Editor - Tool Options & Tool Groups
 * Floating/docked tool options panel, style synchronization, and tool grouping menus.
 */
"use strict";


/* ---------- shape helpers ---------- */
function shapeFromDrag(tool, start, end) {
  var base = {
    color: currentColor,
    strokeWidth: currentStrokeWidth,
    rotation: 0,
  };
  if (tool === "rect") {
    return Object.assign(base, {
      type: "rect",
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    });
  }
  if (tool === "ellipse") {
    return Object.assign(base, {
      type: "ellipse",
      cx: (start.x + end.x) / 2,
      cy: (start.y + end.y) / 2,
      rx: Math.abs(end.x - start.x) / 2,
      ry: Math.abs(end.y - start.y) / 2,
    });
  }
  return Object.assign(base, {
    type: tool,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  });
}

/* ============ TOOL GROUPS (SELECT, DRAW, SHAPES, ERASER) ============ */
var TOOL_ICONS = {
  select:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 4 7 17 2.3-6.7L20 12Z" /></svg>',
  lasso:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 22a5 5 0 0 1-2-4c0-3.8 3.3-6.5 7-8 3.5-1.5 6-3 6-5.5a3.5 3.5 0 1 0-7 0c0 3.5 3.5 4.5 6 5.5s5 3 5 5.5c0 3-2.5 5.5-6.5 5.5-3 0-5.5-1.5-6.5-3.5" /><circle cx="12" cy="19" r="1.5" /></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 20 1-4L17 4l3 3L8 19l-4 1Z" /></svg>',
  highlighter:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11 4 4M5 19l1.5-4L15 6.5a2.1 2.1 0 0 1 3 3L9.5 18Z" /></svg>',
  rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="12" rx="1.5" /></svg>',
  ellipse:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="8" ry="6" /></svg>',
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5" /></svg>',
  arrow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M19 5h-6M19 5v6" /></svg>',
  "stroke-eraser":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>',
  "pixel-eraser":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 14 4-4-5-5-4 4" /><path d="m14.5 17.5 4.5-4.5" /><path d="M2 22h20" /><path d="m3.5 15.5 8-8 4.5 4.5-8 8H3.5v-4.5Z" /></svg>',
};

var TOOL_LABELS = {
  select: "Select",
  lasso: "Lasso",
  pen: "Pen",
  highlighter: "Highlight",
  rect: "Rect",
  ellipse: "Oval",
  line: "Line",
  arrow: "Arrow",
  "stroke-eraser": "Stroke",
  "pixel-eraser": "Pixel",
};

var lastDrawTool = "pen";
var lastShapeTool = "rect";
var lastEraserTool = "stroke-eraser";
var activeGroupMenu = null;

var eraserSize =
  (toolPreferences.eraser && toolPreferences.eraser.size) || 20;
var isErasing = false;
var erasedAny = false;
var lastErasePoint = null;
var eraserPreviewPoint = null;
var strokePreviewPoint = null;

function updateGroupButtons(tool) {
  var selectGroupBtn = document.getElementById("select-group-btn");
  var drawGroupBtn = document.getElementById("draw-group-btn");
  var shapesGroupBtn = document.getElementById("shapes-group-btn");
  var eraserGroupBtn = document.getElementById("eraser-group-btn");

  if (tool === "select" || tool === "lasso") {
    lastSelectTool = tool;
    if (selectGroupBtn) selectGroupBtn.classList.add("is-active");
    if (drawGroupBtn) drawGroupBtn.classList.remove("is-active");
    if (shapesGroupBtn) shapesGroupBtn.classList.remove("is-active");
    if (eraserGroupBtn) eraserGroupBtn.classList.remove("is-active");
    var selectIconEl = document.getElementById("select-group-icon");
    var selectTextEl = document.getElementById("select-group-text");
    if (selectIconEl && TOOL_ICONS[tool])
      selectIconEl.innerHTML = TOOL_ICONS[tool];
    if (selectTextEl && TOOL_LABELS[tool])
      selectTextEl.textContent = TOOL_LABELS[tool];
  } else if (tool === "pen" || tool === "highlighter") {
    lastDrawTool = tool;
    if (drawGroupBtn) drawGroupBtn.classList.add("is-active");
    if (selectGroupBtn) selectGroupBtn.classList.remove("is-active");
    if (shapesGroupBtn) shapesGroupBtn.classList.remove("is-active");
    if (eraserGroupBtn) eraserGroupBtn.classList.remove("is-active");
    var drawIconEl = document.getElementById("draw-group-icon");
    var drawTextEl = document.getElementById("draw-group-text");
    if (drawIconEl && TOOL_ICONS[tool])
      drawIconEl.innerHTML = TOOL_ICONS[tool];
    if (drawTextEl && TOOL_LABELS[tool])
      drawTextEl.textContent = TOOL_LABELS[tool];
  } else if (["rect", "ellipse", "line", "arrow"].indexOf(tool) !== -1) {
    lastShapeTool = tool;
    if (shapesGroupBtn) shapesGroupBtn.classList.add("is-active");
    if (selectGroupBtn) selectGroupBtn.classList.remove("is-active");
    if (drawGroupBtn) drawGroupBtn.classList.remove("is-active");
    if (eraserGroupBtn) eraserGroupBtn.classList.remove("is-active");
    var shapesIconEl = document.getElementById("shapes-group-icon");
    var shapesTextEl = document.getElementById("shapes-group-text");
    if (shapesIconEl && TOOL_ICONS[tool])
      shapesIconEl.innerHTML = TOOL_ICONS[tool];
    if (shapesTextEl && TOOL_LABELS[tool])
      shapesTextEl.textContent = TOOL_LABELS[tool];
  } else if (tool === "stroke-eraser" || tool === "pixel-eraser") {
    lastEraserTool = tool;
    if (eraserGroupBtn) eraserGroupBtn.classList.add("is-active");
    if (selectGroupBtn) selectGroupBtn.classList.remove("is-active");
    if (drawGroupBtn) drawGroupBtn.classList.remove("is-active");
    if (shapesGroupBtn) shapesGroupBtn.classList.remove("is-active");
    var eraserIconEl = document.getElementById("eraser-group-icon");
    var eraserTextEl = document.getElementById("eraser-group-text");
    if (eraserIconEl && TOOL_ICONS[tool])
      eraserIconEl.innerHTML = TOOL_ICONS[tool];
    if (eraserTextEl && TOOL_LABELS[tool])
      eraserTextEl.textContent = TOOL_LABELS[tool];
  } else {
    if (selectGroupBtn) selectGroupBtn.classList.remove("is-active");
    if (drawGroupBtn) drawGroupBtn.classList.remove("is-active");
    if (shapesGroupBtn) shapesGroupBtn.classList.remove("is-active");
    if (eraserGroupBtn) eraserGroupBtn.classList.remove("is-active");
  }

  document
    .querySelectorAll(".tool-group-item[data-tool]")
    .forEach(function (el) {
      el.classList.toggle("is-active", el.dataset.tool === tool);
    });
}

function setActiveTool(tool, isManual) {
  finalizeAnyOpenTextBox();
  livePath = null;
  liveShape = null;
  liveEraser = null;
  liveLasso = null;
  dragMode = null;
  dragOrigin = null;
  dragCenter = null;
  dragStartAngle = 0;
  groupDragOrigins = null;
  if (tool !== "select" && tool !== "lasso") {
    selectedAnnotation = null;
    selectedGroup = null;
  }
  if (tool !== "image" && tool !== "signature") {
    pendingPlaceable = null;
  }
  if (
    tool === "select" ||
    tool === "lasso" ||
    tool === "image" ||
    tool === "signature"
  ) {
    if (isManual || tool === "image" || tool === "signature") {
      lastActiveDrawingTool = null;
    }
  } else {
    lastActiveDrawingTool = tool;
  }
  currentTool = tool;
  document.querySelectorAll(".tool-btn[data-tool]").forEach(function (b) {
    b.classList.toggle("is-active", b.dataset.tool === tool);
  });
  updateGroupButtons(tool);
  applyToolPreferences(tool);
  updateToolOptionsPanel(tool);
  var canvas = document.getElementById("annotation-canvas");
  canvas.style.cursor =
    tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";
  if (tool === "image") {
    document.getElementById("image-input").click();
  }
  if (tool === "signature") {
    openSignatureModal();
  }
  redrawAnnotations();
}

/* ---------- tool options panel lifecycle ---------- */
function hideToolOptionsPanel() {
  var panel = document.getElementById("tool-options");
  if (panel) {
    panel.classList.remove("is-open");
  }
}

function positionToolOptionsPanel(mode, tool) {
  var panel = document.getElementById("tool-options");
  var editorBody =
    document.getElementById("editor-body") ||
    document.querySelector(".editor-body");
  if (!panel || !editorBody) return;

  if (!mode) {
    if (
      (selectedAnnotation && selectedAnnotation.page === currentPage) ||
      (selectedGroup && selectedGroup.page === currentPage)
    ) {
      mode = "element";
    } else if (CONFIGURABLE_TOOLS.indexOf(currentTool) !== -1) {
      mode = "tool";
      tool = currentTool;
    } else {
      hideToolOptionsPanel();
      return;
    }
  }

  var bodyRect = editorBody.getBoundingClientRect();

  if (mode === "element") {
    var b = null;
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann && !isAnnotationEmpty(ann)) {
        b = getElementAABB(ann, currentScale);
      }
    } else if (selectedGroup && selectedGroup.page === currentPage) {
      var groupAnns = getGroupAnnotations();
      if (groupAnns.length > 0) {
        var handles = getGroupSelectionHandles(groupAnns, currentScale);
        b = handles.box;
      }
    }

    if (!b) {
      hideToolOptionsPanel();
      return;
    }

    var canvasEl = document.getElementById("annotation-canvas");
    if (!canvasEl) {
      hideToolOptionsPanel();
      return;
    }

    var canvasRect = canvasEl.getBoundingClientRect();
    var elemX = canvasRect.left - bodyRect.left + b.x;
    var elemY = canvasRect.top - bodyRect.top + b.y;

    var canvasStage = document.getElementById("canvas-stage");
    var stageRect = canvasStage
      ? canvasStage.getBoundingClientRect()
      : bodyRect;
    var visibleTop = Math.max(bodyRect.top, stageRect.top) - bodyRect.top + 8;
    var visibleBottom =
      Math.min(bodyRect.bottom, stageRect.bottom) - bodyRect.top - 8;

    // If element is scrolled out of stage view, hide panel
    if (elemY + b.h < visibleTop - 20 || elemY > visibleBottom + 20) {
      panel.style.visibility = "hidden";
      return;
    }

    panel.style.visibility = "hidden";
    panel.classList.add("is-open");
    var panelW = panel.offsetWidth || 292;
    var panelH = panel.offsetHeight || 190;
    panel.style.visibility = "";

    // Center horizontally relative to element
    var left = elemX + b.w / 2 - panelW / 2;
    left = Math.max(10, Math.min(bodyRect.width - panelW - 10, left));

    // Place below element (with 14px gap for selection handles)
    var gap = 14;
    var top = elemY + b.h + gap;

    // If overflows bottom of visible canvas stage, flip above
    if (top + panelH > visibleBottom) {
      var topAbove = elemY - panelH - gap;
      if (topAbove >= visibleTop) {
        top = topAbove;
      } else {
        top = Math.max(visibleTop, visibleBottom - panelH);
      }
    }

    panel.style.left = Math.round(left) + "px";
    panel.style.top = Math.round(top) + "px";
  } else if (mode === "tool") {
    var targetTool = tool || currentTool;
    var anchorEl = null;

    if (targetTool === "pen" || targetTool === "highlighter") {
      anchorEl =
        document.getElementById("draw-group-btn") ||
        document.getElementById("draw-group-wrap");
    } else if (
      ["rect", "ellipse", "line", "arrow"].indexOf(targetTool) !== -1
    ) {
      anchorEl =
        document.getElementById("shapes-group-btn") ||
        document.getElementById("shapes-group-wrap");
    } else if (
      targetTool === "stroke-eraser" ||
      targetTool === "pixel-eraser"
    ) {
      anchorEl =
        document.getElementById("eraser-group-btn") ||
        document.getElementById("eraser-group-wrap");
    } else if (targetTool === "select" || targetTool === "lasso") {
      anchorEl =
        document.getElementById("select-group-btn") ||
        document.getElementById("select-group-wrap");
    } else {
      anchorEl = document.querySelector(
        '.toolbar .tool-btn[data-tool="' + targetTool + '"]',
      );
    }

    if (!anchorEl) {
      var toolItem = document.querySelector(
        '.toolbar [data-tool="' + targetTool + '"]',
      );
      anchorEl =
        (toolItem && toolItem.closest(".tool-group-wrap")) || toolItem;
    }

    if (!anchorEl) {
      hideToolOptionsPanel();
      return;
    }

    panel.style.visibility = "hidden";
    panel.classList.add("is-open");
    var panelW = panel.offsetWidth || 292;
    var panelH = panel.offsetHeight || 190;
    panel.style.visibility = "";

    var anchorRect = anchorEl.getBoundingClientRect();
    var isToolbarBottom =
      editorBody.classList.contains("toolbar-bottom") ||
      anchorRect.top > bodyRect.top + bodyRect.height / 2;

    var left =
      anchorRect.left + anchorRect.width / 2 - bodyRect.left - panelW / 2;
    left = Math.max(10, Math.min(bodyRect.width - panelW - 10, left));

    var top;
    if (isToolbarBottom) {
      top = anchorRect.top - bodyRect.top - panelH - 8;
      if (top < 10) top = 10;
    } else {
      top = anchorRect.bottom - bodyRect.top + 8;
      if (top + panelH > bodyRect.height - 10) {
        top = Math.max(10, bodyRect.height - panelH - 10);
      }
    }

    panel.style.left = Math.round(left) + "px";
    panel.style.top = Math.round(top) + "px";
  }
}

function updateToolOptionsPanel(tool) {
  var panel = document.getElementById("tool-options");
  if (!panel) return;

  var activeTool = tool || currentTool;
  var showColor = false;
  var showWidth = false;
  var showFont = false;
  var showCrop = false;
  var showRotation = false;
  var showLayer = false;
  var showEraser = false;
  var hasSelection = false;

  if (
    (selectedGroup && selectedGroup.page === currentPage) ||
    (selectedAnnotation && selectedAnnotation.page === currentPage)
  ) {
    if (selectedGroup && selectedGroup.page === currentPage) {
      var groupAnns = getGroupAnnotations();
      if (groupAnns.length > 0) {
        hasSelection = true;
        showColor = true;
        showWidth = true;
        showRotation = false;
        showLayer = false;
      }
    } else if (
      selectedAnnotation &&
      selectedAnnotation.page === currentPage
    ) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann && !isAnnotationEmpty(ann)) {
        hasSelection = true;
        showRotation = true;
        showLayer = true;
        if (ann.type === "text") {
          showColor = true;
          showFont = true;
        } else if (ann.type === "image") {
          showCrop = true;
        } else {
          showColor = true;
          showWidth = true;
        }
      }
    }
  }

  if (hasSelection) {
    // Element selected: show options anchored below the element
    var colorOpt = document.getElementById("opt-color");
    if (colorOpt) colorOpt.classList.toggle("hidden", !showColor);

    var widthOpt = document.getElementById("opt-width");
    if (widthOpt) widthOpt.classList.toggle("hidden", !showWidth);

    var textControls = document.getElementById("opt-text-controls");
    if (textControls) textControls.classList.toggle("hidden", !showFont);

    var fontSizeOpt = document.getElementById("opt-fontsize");
    if (fontSizeOpt) fontSizeOpt.classList.toggle("hidden", !showFont);

    var formattingOpt = document.getElementById("opt-formatting");
    if (formattingOpt) formattingOpt.classList.toggle("hidden", !showFont);

    var cropOpt = document.getElementById("opt-crop");
    if (cropOpt) cropOpt.classList.toggle("hidden", !showCrop);

    var eraserOpt = document.getElementById("opt-eraser");
    if (eraserOpt) eraserOpt.classList.add("hidden");

    var actionsRow = document.querySelector(".opt-actions-row");
    var showActions = showRotation || showLayer || hasSelection;
    if (actionsRow) actionsRow.classList.toggle("hidden", !showActions);

    var rotationOpt = document.getElementById("opt-rotation");
    if (rotationOpt) {
      rotationOpt.classList.toggle("hidden", !showRotation);
      if (showRotation && selectedAnnotation) {
        var selAnn = findAnnotation(currentPage, selectedAnnotation.id);
        if (selAnn) {
          var rotInput = document.getElementById("rotation-val");
          if (rotInput) rotInput.value = Math.round(selAnn.rotation || 0);
        }
      }
    }

    var layerOpt = document.getElementById("opt-layer");
    if (layerOpt) {
      layerOpt.classList.toggle("hidden", !showLayer);
      if (showLayer && selectedAnnotation) {
        var list = annotationsByPage[currentPage] || [];
        var idx = getAnnotationIndex(currentPage, selectedAnnotation.id);
        var isAtFront = idx === -1 || idx === list.length - 1;
        var isAtBack = idx === -1 || idx === 0;

        var toFrontBtn = document.getElementById("layer-to-front-btn");
        var fwdBtn = document.getElementById("layer-forward-btn");
        var bwdBtn = document.getElementById("layer-backward-btn");
        var toBackBtn = document.getElementById("layer-to-back-btn");

        if (toFrontBtn) toFrontBtn.disabled = isAtFront;
        if (fwdBtn) fwdBtn.disabled = isAtFront;
        if (bwdBtn) bwdBtn.disabled = isAtBack;
        if (toBackBtn) toBackBtn.disabled = isAtBack;
      }
    }

    positionToolOptionsPanel("element");
    return;
  }

  // No element selection: check if a configurable drawing/editing tool is selected
  if (CONFIGURABLE_TOOLS.indexOf(activeTool) === -1) {
    hideToolOptionsPanel();
    return;
  }

  // Configure tool options
  if (
    activeTool === "pen" ||
    activeTool === "highlighter" ||
    ["rect", "ellipse", "line", "arrow"].indexOf(activeTool) !== -1
  ) {
    showColor = true;
    showWidth = true;
  } else if (activeTool === "text") {
    showColor = true;
    showFont = true;
  } else if (
    activeTool === "stroke-eraser" ||
    activeTool === "pixel-eraser"
  ) {
    showEraser = true;
  }

  var colorOpt = document.getElementById("opt-color");
  if (colorOpt) colorOpt.classList.toggle("hidden", !showColor);

  var widthOpt = document.getElementById("opt-width");
  if (widthOpt) widthOpt.classList.toggle("hidden", !showWidth);

  var textControls = document.getElementById("opt-text-controls");
  if (textControls) textControls.classList.toggle("hidden", !showFont);

  var fontSizeOpt = document.getElementById("opt-fontsize");
  if (fontSizeOpt) fontSizeOpt.classList.toggle("hidden", !showFont);

  var formattingOpt = document.getElementById("opt-formatting");
  if (formattingOpt) formattingOpt.classList.toggle("hidden", !showFont);

  var cropOpt = document.getElementById("opt-crop");
  if (cropOpt) cropOpt.classList.add("hidden");

  var eraserOpt = document.getElementById("opt-eraser");
  if (eraserOpt) eraserOpt.classList.toggle("hidden", !showEraser);

  // Hide element-specific actions when configuring a tool
  var actionsRow = document.querySelector(".opt-actions-row");
  if (actionsRow) actionsRow.classList.add("hidden");

  updateSizePreviews();
  positionToolOptionsPanel("tool", activeTool);
}

function updateSizePreviews() {
  var strokeCircle = document.getElementById("stroke-preview-circle");
  if (strokeCircle) {
    var w = Math.max(1, currentStrokeWidth);
    strokeCircle.style.width = w + "px";
    strokeCircle.style.height = w + "px";
    strokeCircle.style.background = currentColor;
    strokeCircle.style.opacity = currentTool === "highlighter" ? "0.45" : "1";
  }

  var eraserCircle = document.getElementById("eraser-preview-circle");
  if (eraserCircle) {
    var sz = Math.max(6, Math.min(60, eraserSize));
    eraserCircle.style.width = sz + "px";
    eraserCircle.style.height = sz + "px";
    var isPixel = currentTool === "pixel-eraser";
    eraserCircle.classList.toggle("is-pixel", isPixel);
    var badge = document.getElementById("eraser-preview-badge");
    if (badge) {
      badge.textContent = sz + "px";
    }
  }
}

function syncOptionInputs() {
  document.getElementById("stroke-width").value = currentStrokeWidth;
  document.getElementById("stroke-width-val").textContent =
    currentStrokeWidth + "px";

  var eraserInput = document.getElementById("eraser-size");
  if (eraserInput) {
    eraserInput.value = eraserSize;
  }
  var eraserVal = document.getElementById("eraser-size-val");
  if (eraserVal) {
    eraserVal.textContent = eraserSize + "px";
  }

  updateSizePreviews();

  var fsInput = document.getElementById("font-size");
  if (fsInput) {
    fsInput.value = currentFontSize;
  }

  var isCustom = PALETTE.indexOf(currentColor) === -1;
  var customTrigger = document.getElementById("custom-color-trigger");
  if (customTrigger) {
    customTrigger.classList.toggle("is-active", isCustom);
    if (isCustom) {
      customTrigger.style.background = currentColor;
    } else {
      customTrigger.style.background =
        "linear-gradient(135deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)";
    }
  }
  var customInput = document.getElementById("custom-color-input");
  if (customInput) {
    customInput.value = currentColor;
  }

  document.querySelectorAll(".swatch").forEach(function (s) {
    s.classList.toggle("is-active", s.dataset.color === currentColor);
  });

  var boldBtn = document.getElementById("format-bold");
  if (boldBtn) {
    boldBtn.style.background = currentIsBold
      ? "var(--accent)"
      : "var(--surface)";
    boldBtn.style.color = currentIsBold ? "#fff" : "var(--text)";
    boldBtn.style.borderColor = currentIsBold
      ? "var(--accent)"
      : "var(--border)";
  }
  var italicBtn = document.getElementById("format-italic");
  if (italicBtn) {
    italicBtn.style.background = currentIsItalic
      ? "var(--accent)"
      : "var(--surface)";
    italicBtn.style.color = currentIsItalic ? "#fff" : "var(--text)";
    italicBtn.style.borderColor = currentIsItalic
      ? "var(--accent)"
      : "var(--border)";
  }
  var underlineBtn = document.getElementById("format-underline");
  if (underlineBtn) {
    underlineBtn.style.background = currentIsUnderline
      ? "var(--accent)"
      : "var(--surface)";
    underlineBtn.style.color = currentIsUnderline ? "#fff" : "var(--text)";
    underlineBtn.style.borderColor = currentIsUnderline
      ? "var(--accent)"
      : "var(--border)";
  }

  if (selectedAnnotation && selectedAnnotation.page === currentPage) {
    var ann = findAnnotation(currentPage, selectedAnnotation.id);
    if (ann && !isAnnotationEmpty(ann)) {
      var changed = false;
      if (ann.color !== undefined && ann.color !== currentColor) {
        pushHistory();
        ann.color = currentColor;
        changed = true;
      }
      if (
        ann.strokeWidth !== undefined &&
        ann.strokeWidth !== currentStrokeWidth
      ) {
        if (!changed) pushHistory();
        ann.strokeWidth = currentStrokeWidth;
        changed = true;
      }
      if (ann.fontSize !== undefined && ann.fontSize !== currentFontSize) {
        if (!changed) pushHistory();
        ann.fontSize = currentFontSize;
        changed = true;
      }
      if (ann.type === "text") {
        if (ann.isBold !== currentIsBold) {
          if (!changed) pushHistory();
          ann.isBold = currentIsBold;
          changed = true;
        }
        if (ann.isItalic !== currentIsItalic) {
          if (!changed) pushHistory();
          ann.isItalic = currentIsItalic;
          changed = true;
        }
        if (ann.isUnderline !== currentIsUnderline) {
          if (!changed) pushHistory();
          ann.isUnderline = currentIsUnderline;
          changed = true;
        }
      }
      if (changed) {
        redrawAnnotations();
        positionToolOptionsPanel();
      }
    }
  } else if (selectedGroup && selectedGroup.page === currentPage) {
    var groupAnns = getGroupAnnotations();
    if (groupAnns.length > 0) {
      var groupChanged = false;
      groupAnns.forEach(function (gAnn) {
        if (gAnn.color !== undefined && gAnn.color !== currentColor) {
          if (!groupChanged) pushHistory();
          gAnn.color = currentColor;
          groupChanged = true;
        }
        if (
          gAnn.strokeWidth !== undefined &&
          gAnn.strokeWidth !== currentStrokeWidth
        ) {
          if (!groupChanged) pushHistory();
          gAnn.strokeWidth = currentStrokeWidth;
          groupChanged = true;
        }
      });
      if (groupChanged) {
        redrawAnnotations();
        positionToolOptionsPanel();
      }
    }
  }
}

function buildSwatches() {
  var container = document.getElementById("color-swatches");
  if (!container) return;
  container.innerHTML = "";
  PALETTE.forEach(function (color) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (color === currentColor ? " is-active" : "");
    btn.style.backgroundColor = color;
    btn.dataset.color = color;
    btn.title = color;
    btn.addEventListener("click", function () {
      currentColor = color;
      rememberToolColor(currentColor);
      syncOptionInputs();
    });
    container.appendChild(btn);
  });
}

function closeAllGroupMenus() {
  var selectMenu = document.getElementById("select-group-menu");
  var selectWrap = document.getElementById("select-group-wrap");
  var selectBtn = document.getElementById("select-group-btn");

  var drawMenu = document.getElementById("draw-group-menu");
  var drawWrap = document.getElementById("draw-group-wrap");
  var drawBtn = document.getElementById("draw-group-btn");
  var shapesMenu = document.getElementById("shapes-group-menu");
  var shapesWrap = document.getElementById("shapes-group-wrap");
  var shapesBtn = document.getElementById("shapes-group-btn");

  var eraserMenu = document.getElementById("eraser-group-menu");
  var eraserWrap = document.getElementById("eraser-group-wrap");
  var eraserBtn = document.getElementById("eraser-group-btn");

  if (selectMenu) selectMenu.classList.remove("is-open");
  if (selectWrap) selectWrap.classList.remove("is-open");
  if (selectBtn) selectBtn.setAttribute("aria-expanded", "false");

  if (drawMenu) drawMenu.classList.remove("is-open");
  if (drawWrap) drawWrap.classList.remove("is-open");
  if (drawBtn) drawBtn.setAttribute("aria-expanded", "false");

  if (shapesMenu) shapesMenu.classList.remove("is-open");
  if (shapesWrap) shapesWrap.classList.remove("is-open");
  if (shapesBtn) shapesBtn.setAttribute("aria-expanded", "false");

  if (eraserMenu) eraserMenu.classList.remove("is-open");
  if (eraserWrap) eraserWrap.classList.remove("is-open");
  if (eraserBtn) eraserBtn.setAttribute("aria-expanded", "false");

  activeGroupMenu = null;
}

function positionGroupMenu(btn, menu) {
  if (!btn || !menu) return;
  var rect = btn.getBoundingClientRect();
  var editorBodyEl =
    document.getElementById("editor-body") ||
    document.querySelector(".editor-body");
  var isBottom =
    editorBodyEl && editorBodyEl.classList.contains("toolbar-bottom");

  menu.style.position = "fixed";
  menu.style.zIndex = "1200";

  if (isBottom) {
    menu.style.top = "auto";
    menu.style.bottom = Math.max(8, window.innerHeight - rect.top + 6) + "px";
  } else {
    menu.style.bottom = "auto";
    menu.style.top = rect.bottom + 6 + "px";
  }

  var left = rect.left;
  var menuWidth = 140;
  if (left + menuWidth > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - menuWidth - 8);
  }
  menu.style.left = left + "px";
}

function toggleGroupMenu(btn, wrap, menu, groupName) {
  if (!btn || !menu || !wrap) return;
  var isOpen = menu.classList.contains("is-open");
  closeAllGroupMenus();

  if (!isOpen) {
    hideToolOptionsPanel();
    if (groupName === "select") {
      if (currentTool !== "select" && currentTool !== "lasso") {
        setActiveTool(lastSelectTool || "select", true);
      }
    } else if (groupName === "draw") {
      if (currentTool !== "pen" && currentTool !== "highlighter") {
        setActiveTool(lastDrawTool || "pen", true);
      }
    } else if (groupName === "shapes") {
      if (["rect", "ellipse", "line", "arrow"].indexOf(currentTool) === -1) {
        setActiveTool(lastShapeTool || "rect", true);
      }
    } else if (groupName === "eraser") {
      if (currentTool !== "stroke-eraser" && currentTool !== "pixel-eraser") {
        setActiveTool(lastEraserTool || "stroke-eraser", true);
      }
    }
    hideToolOptionsPanel();
    positionGroupMenu(btn, menu);
    menu.classList.add("is-open");
    wrap.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    activeGroupMenu = menu;
  } else {
    if (CONFIGURABLE_TOOLS.indexOf(currentTool) !== -1) {
      updateToolOptionsPanel(currentTool);
    }
  }
}

function setupToolGroups() {
  var selectGroupBtn = document.getElementById("select-group-btn");
  var selectGroupWrap = document.getElementById("select-group-wrap");
  var selectGroupMenu = document.getElementById("select-group-menu");

  var drawGroupBtn = document.getElementById("draw-group-btn");
  var drawGroupWrap = document.getElementById("draw-group-wrap");
  var drawGroupMenu = document.getElementById("draw-group-menu");

  var shapesGroupBtn = document.getElementById("shapes-group-btn");
  var shapesGroupWrap = document.getElementById("shapes-group-wrap");
  var shapesGroupMenu = document.getElementById("shapes-group-menu");

  var eraserGroupBtn = document.getElementById("eraser-group-btn");
  var eraserGroupWrap = document.getElementById("eraser-group-wrap");
  var eraserGroupMenu = document.getElementById("eraser-group-menu");

  if (selectGroupBtn) {
    selectGroupBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleGroupMenu(
        selectGroupBtn,
        selectGroupWrap,
        selectGroupMenu,
        "select",
      );
    });
  }

  if (drawGroupBtn) {
    drawGroupBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleGroupMenu(drawGroupBtn, drawGroupWrap, drawGroupMenu, "draw");
    });
  }

  if (shapesGroupBtn) {
    shapesGroupBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleGroupMenu(
        shapesGroupBtn,
        shapesGroupWrap,
        shapesGroupMenu,
        "shapes",
      );
    });
  }

  if (eraserGroupBtn) {
    eraserGroupBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleGroupMenu(
        eraserGroupBtn,
        eraserGroupWrap,
        eraserGroupMenu,
        "eraser",
      );
    });
  }

  document
    .querySelectorAll(".tool-group-item[data-tool]")
    .forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        var tool = item.dataset.tool;
        if (tool === "select" || tool === "lasso") {
          lastSelectTool = tool;
        } else if (tool === "pen" || tool === "highlighter") {
          lastDrawTool = tool;
        } else if (
          ["rect", "ellipse", "line", "arrow"].indexOf(tool) !== -1
        ) {
          lastShapeTool = tool;
        } else if (tool === "stroke-eraser" || tool === "pixel-eraser") {
          lastEraserTool = tool;
        }
        closeAllGroupMenus();
        setActiveTool(tool, true);
      });
    });

  document.addEventListener("click", function (e) {
    if (
      !e.target.closest("#select-group-wrap") &&
      !e.target.closest("#draw-group-wrap") &&
      !e.target.closest("#shapes-group-wrap") &&
      !e.target.closest("#eraser-group-wrap") &&
      !e.target.closest(".tool-group-menu")
    ) {
      closeAllGroupMenus();
    }
  });

  var toolbarEl = document.getElementById("toolbar");
  if (toolbarEl) {
    toolbarEl.addEventListener("scroll", function () {
      closeAllGroupMenus();
      if (
        !selectedAnnotation &&
        !selectedGroup &&
        document.getElementById("tool-options") &&
        document.getElementById("tool-options").classList.contains("is-open")
      ) {
        positionToolOptionsPanel("tool", currentTool);
      }
    });
  }
  window.addEventListener("resize", function () {
    closeAllGroupMenus();
    if (selectedAnnotation || selectedGroup) {
      positionToolOptionsPanel("element");
    } else if (
      CONFIGURABLE_TOOLS.indexOf(currentTool) !== -1 &&
      document.getElementById("tool-options") &&
      document.getElementById("tool-options").classList.contains("is-open")
    ) {
      positionToolOptionsPanel("tool", currentTool);
    }
  });

  var canvasStageEl = document.getElementById("canvas-stage");
  if (canvasStageEl) {
    canvasStageEl.addEventListener("scroll", function () {
      if (selectedAnnotation || selectedGroup) {
        positionToolOptionsPanel("element");
      }
    });
  }
}

// Formatting Button Click Listeners
var boldBtn = document.getElementById("format-bold");
if (boldBtn) {
  boldBtn.addEventListener("click", function () {
    currentIsBold = !currentIsBold;
    rememberTextFormatting(
      currentIsBold,
      currentIsItalic,
      currentIsUnderline,
    );
    syncOptionInputs();
    redrawAnnotations();
  });
}
var italicBtn = document.getElementById("format-italic");
if (italicBtn) {
  italicBtn.addEventListener("click", function () {
    currentIsItalic = !currentIsItalic;
    rememberTextFormatting(
      currentIsBold,
      currentIsItalic,
      currentIsUnderline,
    );
    syncOptionInputs();
    redrawAnnotations();
  });
}
var underlineBtn = document.getElementById("format-underline");
if (underlineBtn) {
  underlineBtn.addEventListener("click", function () {
    currentIsUnderline = !currentIsUnderline;
    rememberTextFormatting(
      currentIsBold,
      currentIsItalic,
      currentIsUnderline,
    );
    syncOptionInputs();
    redrawAnnotations();
  });
}

