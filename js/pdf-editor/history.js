/**
 * PDFMaster PDF Editor - Undo/Redo & History Stack
 * History state management, layer ordering, and annotation additions/deletions.
 */
"use strict";


/* ---------- annotation mutation + undo/redo ---------- */
function getAnnotationIndex(page, id) {
  var list = annotationsByPage[page] || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return i;
  }
  return -1;
}

/* ---------- layer ordering ---------- */
function bringToFront() {
  if (!selectedAnnotation || selectedAnnotation.page !== currentPage) return;
  var list = annotationsByPage[currentPage] || [];
  var idx = getAnnotationIndex(currentPage, selectedAnnotation.id);
  if (idx === -1 || idx === list.length - 1) return;

  pushHistory();
  var ann = list.splice(idx, 1)[0];
  list.push(ann);
  redrawAnnotations();
  updateToolOptionsPanel("select");
}

function bringForward() {
  if (!selectedAnnotation || selectedAnnotation.page !== currentPage) return;
  var list = annotationsByPage[currentPage] || [];
  var idx = getAnnotationIndex(currentPage, selectedAnnotation.id);
  if (idx === -1 || idx === list.length - 1) return;

  pushHistory();
  var temp = list[idx];
  list[idx] = list[idx + 1];
  list[idx + 1] = temp;
  redrawAnnotations();
  updateToolOptionsPanel("select");
}

function sendBackward() {
  if (!selectedAnnotation || selectedAnnotation.page !== currentPage) return;
  var list = annotationsByPage[currentPage] || [];
  var idx = getAnnotationIndex(currentPage, selectedAnnotation.id);
  if (idx === -1 || idx <= 0) return;

  pushHistory();
  var temp = list[idx];
  list[idx] = list[idx - 1];
  list[idx - 1] = temp;
  redrawAnnotations();
  updateToolOptionsPanel("select");
}

function sendToBack() {
  if (!selectedAnnotation || selectedAnnotation.page !== currentPage) return;
  var list = annotationsByPage[currentPage] || [];
  var idx = getAnnotationIndex(currentPage, selectedAnnotation.id);
  if (idx === -1 || idx <= 0) return;

  pushHistory();
  var ann = list.splice(idx, 1)[0];
  list.unshift(ann);
  redrawAnnotations();
  updateToolOptionsPanel("select");
}

function pushHistory() {
  if (typeof window._invalidateEditorExport === "function") {
    window._invalidateEditorExport();
  }
  undoHistoryStack.push({
    annotations: deepClone(annotationsByPage),
    rotations: Object.assign({}, pageRotations),
  });
  if (undoHistoryStack.length > 40) {
    undoHistoryStack.shift();
  }
  redoHistoryStack = [];
  updateUndoRedoButtons();
}
function addAnnotation(page, ann) {
  pushHistory();
  if (!annotationsByPage[page]) {
    annotationsByPage[page] = [];
  }
  annotationsByPage[page].push(ann);
}
function deleteAnnotation(page, id) {
  hideContextMenu();
  pushHistory();
  annotationsByPage[page] = (annotationsByPage[page] || []).filter(
    function (a) {
      return a.id !== id;
    },
  );
  if (selectedAnnotation && selectedAnnotation.id === id) {
    selectedAnnotation = null;
    updateToolOptionsPanel(currentTool);
  }
  redrawAnnotations();
}
function clearCurrentPage() {
  if (
    !annotationsByPage[currentPage] ||
    annotationsByPage[currentPage].length === 0
  ) {
    window.showToast("This page is already empty.");
    return;
  }
  pushHistory();
  annotationsByPage[currentPage] = [];
  selectedAnnotation = null;
  redrawAnnotations();
}
function undo() {
  if (undoHistoryStack.length === 0) {
    return;
  }
  redoHistoryStack.push({
    annotations: deepClone(annotationsByPage),
    rotations: Object.assign({}, pageRotations),
  });
  var state = undoHistoryStack.pop();
  var oldPageRot = (pageRotations[currentPage] || 0) % 360;
  if (state && state.annotations) {
    annotationsByPage = state.annotations;
    pageRotations = state.rotations || {};
  } else {
    annotationsByPage = state || {};
  }
  var newPageRot = (pageRotations[currentPage] || 0) % 360;
  selectedAnnotation = null;
  selectedGroup = null;
  if (oldPageRot !== newPageRot) {
    delete pageDimsCache[currentPage];
    renderPage(currentPage);
  } else {
    redrawAnnotations();
  }
  updateUndoRedoButtons();
  scheduleDBSave();
}
function redo() {
  if (redoHistoryStack.length === 0) {
    return;
  }
  undoHistoryStack.push({
    annotations: deepClone(annotationsByPage),
    rotations: Object.assign({}, pageRotations),
  });
  var state = redoHistoryStack.pop();
  var oldPageRot = (pageRotations[currentPage] || 0) % 360;
  if (state && state.annotations) {
    annotationsByPage = state.annotations;
    pageRotations = state.rotations || {};
  } else {
    annotationsByPage = state || {};
  }
  var newPageRot = (pageRotations[currentPage] || 0) % 360;
  selectedAnnotation = null;
  selectedGroup = null;
  if (oldPageRot !== newPageRot) {
    delete pageDimsCache[currentPage];
    renderPage(currentPage);
  } else {
    redrawAnnotations();
  }
  updateUndoRedoButtons();
  scheduleDBSave();
}
function updateUndoRedoButtons() {
  document.getElementById("undo-btn").disabled = undoHistoryStack.length === 0;
  document.getElementById("redo-btn").disabled =
    redoHistoryStack.length === 0;
}
