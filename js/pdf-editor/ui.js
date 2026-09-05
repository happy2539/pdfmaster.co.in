/**
 * PDFMaster PDF Editor - UI Wiring & Event Listeners
 * Toolbar actions, keyboard shortcuts, context menu, fullscreen, and mobile adaptations.
 */
"use strict";


/* ---------- context menu ---------- */
function hideContextMenu() {
  var ctxMenu = document.getElementById("editor-context-menu");
  if (ctxMenu) {
    ctxMenu.classList.add("hidden");
  }
}

function showContextMenu(x, y) {
  var ctxMenu = document.getElementById("editor-context-menu");
  if (!ctxMenu || !selectedAnnotation) return;
  var ann = findAnnotation(currentPage, selectedAnnotation.id);
  if (!ann) return;

  var list = annotationsByPage[currentPage] || [];
  var idx = getAnnotationIndex(currentPage, selectedAnnotation.id);
  var isAtFront = idx === -1 || idx === list.length - 1;
  var isAtBack = idx === -1 || idx === 0;

  var ctxToFront = document.getElementById("ctx-to-front");
  var ctxForward = document.getElementById("ctx-forward");
  var ctxBackward = document.getElementById("ctx-backward");
  var ctxToBack = document.getElementById("ctx-to-back");

  if (ctxToFront) ctxToFront.disabled = isAtFront;
  if (ctxForward) ctxForward.disabled = isAtFront;
  if (ctxBackward) ctxBackward.disabled = isAtBack;
  if (ctxToBack) ctxToBack.disabled = isAtBack;

  ctxMenu.style.left = x + "px";
  ctxMenu.style.top = y + "px";
  ctxMenu.classList.remove("hidden");

  var rect = ctxMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth - 10) {
    ctxMenu.style.left = Math.max(10, x - rect.width) + "px";
  }
  if (rect.bottom > window.innerHeight - 10) {
    ctxMenu.style.top = Math.max(10, y - rect.height) + "px";
  }
}

function resetEditor() {
  finalizeAnyOpenTextBox();
  destroyCurrentDocument();
  currentFileBlob = null;
  fileBlobPersisted = false;
  fileName = "";
  annotationsByPage = {};
  pageRotations = {};
  undoHistoryStack = [];
  redoHistoryStack = [];
  imageElCache = {};
  selectedAnnotation = null;
  currentPage = 1;
  numPages = 1;
  zoomFactor = 1;
  pendingPlaceable = null;
  var rotBtn = document.getElementById("rotate-page-btn");
  if (rotBtn) rotBtn.disabled = true;
  document.getElementById("file-input").value = "";
  clearSessionFromDB();
  showHero();
}

/* ---------- wire up UI ---------- */
buildSwatches();
syncOptionInputs();
updateToolOptionsPanel("select");
setupToolGroups();

var eraserSizeInput = document.getElementById("eraser-size");
if (eraserSizeInput) {
  var handleEraserSizeChange = function (e) {
    eraserSize = parseInt(e.target.value, 10) || 20;
    rememberEraserSize(eraserSize);
    var valEl = document.getElementById("eraser-size-val");
    if (valEl) valEl.textContent = eraserSize + "px";
    updateSizePreviews();
    requestRedraw();
  };
  eraserSizeInput.addEventListener("input", handleEraserSizeChange);
  eraserSizeInput.addEventListener("change", handleEraserSizeChange);
}

document.querySelectorAll(".tool-btn[data-tool]").forEach(function (btn) {
  btn.addEventListener("click", function () {
    setActiveTool(btn.dataset.tool, true);
  });
});
document.getElementById("undo-btn").addEventListener("click", undo);
document.getElementById("redo-btn").addEventListener("click", redo);
document
  .getElementById("clear-btn")
  .addEventListener("click", clearCurrentPage);

var strokeWidthInput = document.getElementById("stroke-width");
if (strokeWidthInput) {
  var handleStrokeWidthChange = function (e) {
    currentStrokeWidth = parseInt(e.target.value, 10);
    rememberToolStrokeWidth(currentStrokeWidth);
    syncOptionInputs();
    requestRedraw();
  };
  strokeWidthInput.addEventListener("input", handleStrokeWidthChange);
  strokeWidthInput.addEventListener("change", handleStrokeWidthChange);
}

var fontSizeInput = document.getElementById("font-size");
if (fontSizeInput) {
  var handleFontSizeChange = function (e) {
    currentFontSize = parseInt(e.target.value, 10) || 18;
    rememberFontSize(currentFontSize);
    syncOptionInputs();
  };
  fontSizeInput.addEventListener("change", handleFontSizeChange);
  fontSizeInput.addEventListener("input", handleFontSizeChange);
}

// Rotation controls
var rotateCcwBtn = document.getElementById("rotate-ccw-btn");
var rotateCwBtn = document.getElementById("rotate-cw-btn");
var rotationInput = document.getElementById("rotation-val");

if (rotateCcwBtn) {
  rotateCcwBtn.addEventListener("click", function () {
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann) {
        pushHistory();
        var norm = Math.round(((ann.rotation || 0) - 90) % 360);
        while (norm > 180) norm -= 360;
        while (norm <= -180) norm += 360;
        ann.rotation = norm;
        if (rotationInput) rotationInput.value = norm;
        redrawAnnotations();
        positionToolOptionsPanel();
      }
    }
  });
}

if (rotateCwBtn) {
  rotateCwBtn.addEventListener("click", function () {
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann) {
        pushHistory();
        var norm = Math.round(((ann.rotation || 0) + 90) % 360);
        while (norm > 180) norm -= 360;
        while (norm <= -180) norm += 360;
        ann.rotation = norm;
        if (rotationInput) rotationInput.value = norm;
        redrawAnnotations();
        positionToolOptionsPanel();
      }
    }
  });
}

if (rotationInput) {
  var handleRotationChange = function (e) {
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann) {
        pushHistory();
        var val = parseInt(e.target.value, 10) || 0;
        while (val > 180) val -= 360;
        while (val <= -180) val += 360;
        ann.rotation = val;
        redrawAnnotations();
        positionToolOptionsPanel();
      }
    }
  };
  rotationInput.addEventListener("change", handleRotationChange);
  rotationInput.addEventListener("input", handleRotationChange);
}

// Layer controls
var layerToFrontBtn = document.getElementById("layer-to-front-btn");
if (layerToFrontBtn) {
  layerToFrontBtn.addEventListener("click", bringToFront);
}
var layerForwardBtn = document.getElementById("layer-forward-btn");
if (layerForwardBtn) {
  layerForwardBtn.addEventListener("click", bringForward);
}
var layerBackwardBtn = document.getElementById("layer-backward-btn");
if (layerBackwardBtn) {
  layerBackwardBtn.addEventListener("click", sendBackward);
}
var layerToBackBtn = document.getElementById("layer-to-back-btn");
if (layerToBackBtn) {
  layerToBackBtn.addEventListener("click", sendToBack);
}

// Context Menu listeners
var ctxToFront = document.getElementById("ctx-to-front");
if (ctxToFront) {
  ctxToFront.addEventListener("click", function () {
    bringToFront();
    hideContextMenu();
  });
}
var ctxForward = document.getElementById("ctx-forward");
if (ctxForward) {
  ctxForward.addEventListener("click", function () {
    bringForward();
    hideContextMenu();
  });
}
var ctxBackward = document.getElementById("ctx-backward");
if (ctxBackward) {
  ctxBackward.addEventListener("click", function () {
    sendBackward();
    hideContextMenu();
  });
}
var ctxToBack = document.getElementById("ctx-to-back");
if (ctxToBack) {
  ctxToBack.addEventListener("click", function () {
    sendToBack();
    hideContextMenu();
  });
}
var ctxDelete = document.getElementById("ctx-delete");
if (ctxDelete) {
  ctxDelete.addEventListener("click", function () {
    if (selectedAnnotation) {
      deleteAnnotation(currentPage, selectedAnnotation.id);
    }
    hideContextMenu();
  });
}

// Floating options card delete button
var optDeleteBtn = document.getElementById("opt-delete-btn");
if (optDeleteBtn) {
  optDeleteBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      deleteAnnotation(currentPage, selectedAnnotation.id);
      hideToolOptionsPanel();
    } else if (selectedGroup && selectedGroup.page === currentPage) {
      var groupAnns = getGroupAnnotations();
      if (groupAnns.length > 0) {
        pushHistory();
        var gIds = groupAnns.map(function (a) {
          return a.id;
        });
        annotationsByPage[currentPage] = (
          annotationsByPage[currentPage] || []
        ).filter(function (a) {
          return gIds.indexOf(a.id) === -1;
        });
        selectedGroup = null;
        redrawAnnotations();
        hideToolOptionsPanel();
      }
    }
  });
}

// Prevent interactions inside tool-options card from propagating to canvas
var toolOptionsEl = document.getElementById("tool-options");
if (toolOptionsEl) {
  ["pointerdown", "mousedown", "touchstart"].forEach(function (evtName) {
    toolOptionsEl.addEventListener(evtName, function (e) {
      e.stopPropagation();
    });
  });
}

document.addEventListener("click", function (e) {
  var ctxMenu = document.getElementById("editor-context-menu");
  if (ctxMenu && !ctxMenu.contains(e.target)) {
    hideContextMenu();
  }
});
document.addEventListener("scroll", hideContextMenu, true);

var annCanvasEl = document.getElementById("annotation-canvas");
if (annCanvasEl) {
  annCanvasEl.addEventListener("contextmenu", function (e) {
    var pt = getCanvasPagePoint(e);
    var ann = hitTest(pt);
    if (ann) {
      e.preventDefault();
      selectedAnnotation = { page: currentPage, id: ann.id };
      setActiveTool("select");
      redrawAnnotations();
      showContextMenu(e.pageX, e.pageY);
    } else {
      hideContextMenu();
    }
  });
}

// Custom Color Trigger
var customColorInput = document.getElementById("custom-color-input");
var customColorTrigger = document.getElementById("custom-color-trigger");
if (customColorTrigger && customColorInput) {
  customColorTrigger.addEventListener("click", function () {
    customColorInput.click();
  });
  customColorInput.addEventListener("input", function (e) {
    currentColor = e.target.value;
    rememberToolColor(currentColor);
    syncOptionInputs();
  });
  customColorInput.addEventListener("change", function (e) {
    currentColor = e.target.value;
    rememberToolColor(currentColor);
    syncOptionInputs();
  });
}

// Eyedropper API
var eyedropperBtn = document.getElementById("eyedropper-btn");
if (eyedropperBtn) {
  if (window.EyeDropper) {
    eyedropperBtn.addEventListener("click", function () {
      var eyeDropper = new window.EyeDropper();
      eyeDropper
        .open()
        .then(function (result) {
          currentColor = result.sRGBHex;
          rememberToolColor(currentColor);
          syncOptionInputs();
        })
        .catch(function (err) {
          console.log("Eyedropper cancelled or failed", err);
        });
    });
  } else {
    eyedropperBtn.style.display = "none";
  }
}

document
  .getElementById("select-file-btn")
  .addEventListener("click", function () {
    document.getElementById("file-input").click();
  });
document
  .getElementById("file-input")
  .addEventListener("change", function (e) {
    var f = e.target.files[0];
    handleFile(f);
    e.target.value = "";
  });

var uploadCardEl = document.getElementById("upload-card");
["dragenter", "dragover"].forEach(function (evt) {
  uploadCardEl.addEventListener(evt, function (e) {
    e.preventDefault();
    uploadCardEl.classList.add("is-drag");
  });
});
uploadCardEl.addEventListener("dragleave", function (e) {
  e.preventDefault();
  uploadCardEl.classList.remove("is-drag");
});
uploadCardEl.addEventListener("drop", function (e) {
  e.preventDefault();
  uploadCardEl.classList.remove("is-drag");
  var f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) {
    handleFile(f);
  }
});


document.getElementById("zoom-in").addEventListener("click", zoomIn);
document.getElementById("zoom-out").addEventListener("click", zoomOut);
var rotatePageBtn = document.getElementById("rotate-page-btn");
if (rotatePageBtn) {
  rotatePageBtn.addEventListener("click", function () {
    rotateCurrentPage(90);
  });
}
document.getElementById("prev-page").addEventListener("click", function () {
  if (currentPage > 1) {
    selectedAnnotation = null;
    selectedGroup = null;
    renderPage(currentPage - 1);
  }
});
document.getElementById("next-page").addEventListener("click", function () {
  if (currentPage < numPages) {
    selectedAnnotation = null;
    selectedGroup = null;
    renderPage(currentPage + 1);
  }
});
document.getElementById("download-btn").addEventListener("click", exportPdf);
document
  .getElementById("start-over-btn")
  .addEventListener("click", function () {
    if (window.confirm("Start over? Any edits you have made will be lost.")) {
      resetEditor();
    }
  });

/* ============ FULLSCREEN ============ */
var fullscreenBtn = document.getElementById("fullscreen-btn");
var editorShell =
  document.getElementById("editor-shell") ||
  document.getElementById("editor-wrap");
if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", function () {
    var target = editorShell || document.documentElement;
    if (!document.fullscreenElement) {
      var req = target.requestFullscreen || target.webkitRequestFullscreen;
      if (req) req.call(target);
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  });
  document.addEventListener("fullscreenchange", function () {
    fullscreenBtn.classList.toggle("is-active", !!document.fullscreenElement);
  });
}

/* ============ TOOLBAR POSITION (UP / DOWN) ============ */
var toggleToolbarPosBtn = document.getElementById("toggle-toolbar-pos-btn");
var editorBody =
  document.getElementById("editor-body") ||
  document.querySelector(".editor-body");

function setToolbarPosition(pos) {
  var isBottom = pos === "bottom";
  if (editorBody) {
    editorBody.classList.toggle("toolbar-bottom", isBottom);
  }
  if (toggleToolbarPosBtn) {
    var title = isBottom ? "Move toolbar to top" : "Move toolbar to bottom";
    toggleToolbarPosBtn.title = title;
    toggleToolbarPosBtn.setAttribute("aria-label", title);
  }
  try {
    localStorage.setItem(
      "pdfmaster-toolbar-pos",
      isBottom ? "bottom" : "top",
    );
  } catch (e) {}
  var optPanel = document.getElementById("tool-options");
  if (optPanel && optPanel.classList.contains("is-open")) {
    positionToolOptionsPanel();
  }
}

if (toggleToolbarPosBtn) {
  toggleToolbarPosBtn.addEventListener("click", function () {
    var isCurrentlyBottom =
      editorBody && editorBody.classList.contains("toolbar-bottom");
    setToolbarPosition(isCurrentlyBottom ? "top" : "bottom");
  });
}

try {
  var savedToolbarPos = localStorage.getItem("pdfmaster-toolbar-pos");
  if (savedToolbarPos === "bottom") {
    setToolbarPosition("bottom");
  }
} catch (e) {}
document.addEventListener("keydown", function (e) {
  var tag = document.activeElement && document.activeElement.tagName;
  var isInput =
    tag === "INPUT" || tag === "TEXTAREA" || !!window._activeTextBox;

  if (e.key === "Escape" && activeGroupMenu) {
    closeAllGroupMenus();
    return;
  }

  // Page rotation shortcut: Ctrl+Shift+R or Alt+R
  if (
    !isInput &&
    pdfDoc &&
    ((e.shiftKey &&
      (e.ctrlKey || e.metaKey) &&
      (e.key === "R" || e.key === "r")) ||
      (e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        (e.key === "R" || e.key === "r")))
  ) {
    e.preventDefault();
    rotateCurrentPage(90);
    return;
  }

  // Undo / Redo keyboard shortcuts
  if (!isInput && (e.ctrlKey || e.metaKey)) {
    if (e.shiftKey && (e.key === "Z" || e.key === "z")) {
      e.preventDefault();
      redo();
      return;
    } else if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      undo();
      return;
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      redo();
      return;
    }
  }

  if ((e.key === "Delete" || e.key === "Backspace") && !isInput) {
    if (selectedAnnotation) {
      e.preventDefault();
      deleteAnnotation(selectedAnnotation.page, selectedAnnotation.id);
    } else if (selectedGroup && selectedGroup.page === currentPage) {
      e.preventDefault();
      var groupAnns = getGroupAnnotations();
      if (groupAnns.length > 0) {
        pushHistory();
        groupAnns.forEach(function (a) {
          deleteAnnotation(currentPage, a.id);
        });
        selectedGroup = null;
        redrawAnnotations();
      }
    }
  }
  if (selectedGroup && !isInput && selectedGroup.page === currentPage) {
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.key) !==
        -1 &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      e.preventDefault();
      var groupAnns = getGroupAnnotations();
      if (groupAnns.length > 0) {
        pushHistory();
        var amount = e.shiftKey ? 10 : 1;
        var dx = 0,
          dy = 0;
        if (e.key === "ArrowUp") dy = -amount;
        else if (e.key === "ArrowDown") dy = amount;
        else if (e.key === "ArrowLeft") dx = -amount;
        else if (e.key === "ArrowRight") dx = amount;

        groupAnns.forEach(function (ann) {
          applyMove(ann, ann, dx, dy);
        });
        redrawAnnotations();
      }
    }
  }
  if (selectedAnnotation && !isInput) {
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.key) !==
        -1 &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      e.preventDefault();
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann) {
        pushHistory();
        var amount = e.shiftKey ? 10 : 1;
        var dx = 0,
          dy = 0;
        if (e.key === "ArrowUp") dy = -amount;
        else if (e.key === "ArrowDown") dy = amount;
        else if (e.key === "ArrowLeft") dx = -amount;
        else if (e.key === "ArrowRight") dx = amount;

        applyMove(ann, ann, dx, dy);
        redrawAnnotations();
      }
    } else if (e.key === "]" || e.key === "}") {
      e.preventDefault();
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        bringToFront();
      } else {
        bringForward();
      }
    } else if (e.key === "[" || e.key === "{") {
      e.preventDefault();
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        sendToBack();
      } else {
        sendBackward();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === "ArrowUp") {
      e.preventDefault();
      if (e.shiftKey) {
        bringToFront();
      } else {
        bringForward();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === "ArrowDown") {
      e.preventDefault();
      if (e.shiftKey) {
        sendToBack();
      } else {
        sendBackward();
      }
    }
  }
  if (e.key === "Escape") {
    hideContextMenu();
    closeCropModal();
    closeSignatureModal(true);
    hideToolOptionsPanel();
  }
});
window.addEventListener("resize", function () {
  if (!pdfDoc) {
    return;
  }
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    renderPage(currentPage);
    checkMobileWarning();
  }, 200);
});

// Close mobile warning banner
var closeWarningBtn = document.getElementById("close-mobile-warning");
if (closeWarningBtn) {
  closeWarningBtn.addEventListener("click", function () {
    mobileWarningDismissed = true;
    var banner = document.getElementById("mobile-warning-banner");
    if (banner) banner.style.display = "none";
  });
}

var recoveryBtn = document.getElementById("recoveryBtn");
if (recoveryBtn) {
  recoveryBtn.addEventListener("click", function () {
    loadSessionFromDB(true);
  });
}

