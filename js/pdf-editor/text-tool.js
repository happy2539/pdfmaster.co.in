/**
 * PDFMaster PDF Editor - Text Tool
 * Inline double-click text editing and dynamic input management.
 */
"use strict";


/* ---------- text tool ---------- */
function finalizeTextBox(box) {
  if (!box.parentNode) {
    return;
  }
  var value = box.value.trim();
  box.remove();
  if (window._activeTextBox === box) {
    window._activeTextBox = null;
  }

  if (box._editingAnnotation) {
    var ann = box._editingAnnotation;
    ann.isEditing = false;
    if (value) {
      if (ann.text !== value) {
        pushHistory();
        ann.text = value;
      }
      if (currentTool === "select" || currentTool === "lasso") {
        selectedAnnotation = { page: currentPage, id: ann.id };
        updateToolOptionsPanel(currentTool);
      } else {
        selectedAnnotation = null;
        hideToolOptionsPanel();
      }
    } else {
      pushHistory();
      deleteAnnotation(currentPage, ann.id);
      hideToolOptionsPanel();
    }
    redrawAnnotations();
  } else {
    var pt = box._pagePoint;
    if (value) {
      var ann = {
        id: nextId(),
        type: "text",
        page: currentPage,
        x: pt.x,
        y: pt.y,
        text: value,
        fontSize: currentFontSize,
        color: currentColor,
        isBold: currentIsBold,
        isItalic: currentIsItalic,
        isUnderline: currentIsUnderline,
      };
      addAnnotation(currentPage, ann);
      selectedAnnotation = null;
      hideToolOptionsPanel();
      redrawAnnotations();
    }
  }
}

function startTextEditingOf(ann) {
  finalizeAnyOpenTextBox();
  hideToolOptionsPanel();
  var frame = document.getElementById("canvas-frame");
  var box = document.createElement("textarea");
  box.className = "text-edit-box";

  box.style.left = ann.x * currentScale + "px";
  box.style.top = ann.y * currentScale + "px";
  box.style.fontSize = ann.fontSize * currentScale + "px";
  box.style.color = ann.color;
  box.style.fontWeight = ann.isBold ? "bold" : "normal";
  box.style.fontStyle = ann.isItalic ? "italic" : "normal";
  box.style.textDecoration = ann.isUnderline ? "underline" : "none";
  box.value = ann.text;
  box.rows = 1;
  box.spellcheck = false;

  frame.appendChild(box);
  box.focus();

  box.style.width = Math.max(60, box.scrollWidth + 6) + "px";
  box.style.height = Math.max(24, box.scrollHeight) + "px";
  box.setSelectionRange(ann.text.length, ann.text.length);

  ann.isEditing = true;
  selectedAnnotation = null;
  hideToolOptionsPanel();
  redrawAnnotations();

  window._activeTextBox = box;
  box._editingAnnotation = ann;

  box.addEventListener("input", function () {
    box.style.width = Math.max(60, box.scrollWidth + 6) + "px";
    box.style.height = Math.max(24, box.scrollHeight) + "px";
  });

  box.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      box.value = ann.text;
      finalizeTextBox(box);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      finalizeTextBox(box);
    }
  });

  box.addEventListener("blur", function () {
    finalizeTextBox(box);
  });
}

function updateCursorStyle(e) {
  var canvas = document.getElementById("annotation-canvas");
  if (!canvas || !pdfDoc) return;
  if (isPointerDown || (currentTool !== "select" && currentTool !== "lasso"))
    return;
  if (!e) {
    canvas.style.cursor = currentTool === "lasso" ? "crosshair" : "default";
    return;
  }

  var pt = getCanvasPagePoint(e);
  if (selectedGroup && selectedGroup.page === currentPage) {
    var groupAnns = getGroupAnnotations();
    if (groupAnns.length > 0) {
      var handles = getGroupSelectionHandles(groupAnns, currentScale);

      if (
        Math.hypot(
          pt.cx - handles.deleteBtn.x,
          pt.cy - handles.deleteBtn.y,
        ) <=
        handles.deleteBtn.r + 4
      ) {
        canvas.style.cursor = "pointer";
        return;
      }

      if (
        Math.hypot(
          pt.cx - handles.rotateBtn.x,
          pt.cy - handles.rotateBtn.y,
        ) <=
        handles.rotateBtn.r + 4
      ) {
        canvas.style.cursor = "grab";
        return;
      }

      if (
        Math.hypot(pt.cx - handles.tl.x, pt.cy - handles.tl.y) <=
          handles.tl.size + 4 ||
        Math.hypot(pt.cx - handles.br.x, pt.cy - handles.br.y) <=
          handles.br.size + 4
      ) {
        canvas.style.cursor = "nwse-resize";
        return;
      }
      if (
        Math.hypot(pt.cx - handles.tr.x, pt.cy - handles.tr.y) <=
          handles.tr.size + 4 ||
        Math.hypot(pt.cx - handles.bl.x, pt.cy - handles.bl.y) <=
          handles.bl.size + 4
      ) {
        canvas.style.cursor = "nesw-resize";
        return;
      }
      if (
        Math.hypot(pt.cx - handles.t.x, pt.cy - handles.t.y) <=
          handles.t.size + 4 ||
        Math.hypot(pt.cx - handles.b.x, pt.cy - handles.b.y) <=
          handles.b.size + 4
      ) {
        canvas.style.cursor = "ns-resize";
        return;
      }
      if (
        Math.hypot(pt.cx - handles.l.x, pt.cy - handles.l.y) <=
          handles.l.size + 4 ||
        Math.hypot(pt.cx - handles.r.x, pt.cy - handles.r.y) <=
          handles.r.size + 4
      ) {
        canvas.style.cursor = "ew-resize";
        return;
      }

      var b = handles.box;
      if (
        pt.cx >= b.x &&
        pt.cx <= b.x + b.w &&
        pt.cy >= b.y &&
        pt.cy <= b.y + b.h
      ) {
        canvas.style.cursor = "move";
        return;
      }
    }
  }
  if (selectedAnnotation && selectedAnnotation.page === currentPage) {
    var ann = findAnnotation(currentPage, selectedAnnotation.id);
    if (ann && !isAnnotationEmpty(ann)) {
      var center = getCenter(ann);
      var upt = unrotatePoint(pt, center, ann.rotation || 0);
      var handles = getSelectionHandles(ann, currentScale);

      if (
        Math.hypot(
          upt.cx - handles.deleteBtn.x,
          upt.cy - handles.deleteBtn.y,
        ) <=
        handles.deleteBtn.r + 4
      ) {
        canvas.style.cursor = "pointer";
        return;
      }

      if (
        handles.cropBtn &&
        Math.hypot(upt.cx - handles.cropBtn.x, upt.cy - handles.cropBtn.y) <=
          handles.cropBtn.r + 4
      ) {
        canvas.style.cursor = "pointer";
        return;
      }

      if (
        handles.rotateBtn &&
        Math.hypot(
          upt.cx - handles.rotateBtn.x,
          upt.cy - handles.rotateBtn.y,
        ) <=
          handles.rotateBtn.r + 4
      ) {
        canvas.style.cursor = "grab";
        return;
      }

      if (
        Math.hypot(upt.cx - handles.tl.x, upt.cy - handles.tl.y) <=
        handles.tl.size + 4
      ) {
        canvas.style.cursor = "nwse-resize";
        return;
      }
      if (
        Math.hypot(upt.cx - handles.br.x, upt.cy - handles.br.y) <=
        handles.br.size + 4
      ) {
        canvas.style.cursor = "nwse-resize";
        return;
      }
      if (
        Math.hypot(upt.cx - handles.tr.x, upt.cy - handles.tr.y) <=
        handles.tr.size + 4
      ) {
        canvas.style.cursor = "nesw-resize";
        return;
      }
      if (
        Math.hypot(upt.cx - handles.bl.x, upt.cy - handles.bl.y) <=
        handles.bl.size + 4
      ) {
        canvas.style.cursor = "nesw-resize";
        return;
      }

      if (
        Math.hypot(upt.cx - handles.t.x, upt.cy - handles.t.y) <=
        handles.t.size + 4
      ) {
        canvas.style.cursor = "ns-resize";
        return;
      }
      if (
        Math.hypot(upt.cx - handles.b.x, upt.cy - handles.b.y) <=
        handles.b.size + 4
      ) {
        canvas.style.cursor = "ns-resize";
        return;
      }
      if (
        Math.hypot(upt.cx - handles.l.x, upt.cy - handles.l.y) <=
        handles.l.size + 4
      ) {
        canvas.style.cursor = "ew-resize";
        return;
      }
      if (
        Math.hypot(upt.cx - handles.r.x, upt.cy - handles.r.y) <=
        handles.r.size + 4
      ) {
        canvas.style.cursor = "ew-resize";
        return;
      }

      var b = handles.box;
      if (
        upt.cx >= b.x &&
        upt.cx <= b.x + b.w &&
        upt.cy >= b.y &&
        upt.cy <= b.y + b.h
      ) {
        canvas.style.cursor = "move";
        return;
      }
    }
  }

  if (currentTool === "lasso") {
    canvas.style.cursor = "crosshair";
    return;
  }

  var hit = hitTest(pt);
  if (hit) {
    canvas.style.cursor = "pointer";
  } else {
    canvas.style.cursor = "default";
  }
}
function finalizeAnyOpenTextBox() {
  if (window._activeTextBox) {
    var b = window._activeTextBox;
    window._activeTextBox = null;
    finalizeTextBox(b);
  }
}
function startTextEditing(pt) {
  finalizeAnyOpenTextBox();
  hideToolOptionsPanel();
  var frame = document.getElementById("canvas-frame");
  var box = document.createElement("textarea");
  box.className = "text-edit-box";
  box.style.left = pt.cx + "px";
  box.style.top = pt.cy + "px";
  box.style.fontSize = currentFontSize * currentScale + "px";
  box.style.color = currentColor;
  box.style.fontWeight = currentIsBold ? "bold" : "normal";
  box.style.fontStyle = currentIsItalic ? "italic" : "normal";
  box.style.textDecoration = currentIsUnderline ? "underline" : "none";
  box.rows = 1;
  box.spellcheck = false;
  frame.appendChild(box);
  box.focus();
  box._pagePoint = pt;
  box.addEventListener("input", function () {
    box.style.width = Math.max(60, box.scrollWidth + 6) + "px";
    box.style.height = Math.max(24, box.scrollHeight) + "px";
  });
  box.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      box.value = "";
      box.blur();
    }
  });
  box.addEventListener("blur", function () {
    finalizeTextBox(box);
  });
  window._activeTextBox = box;
}

