/**
 * PDFMaster PDF Editor - State & Preferences
 * Manages core editor state variables, tool preferences, constants, and ID generation.
 */
"use strict";


/* ---------- state ---------- */
var pdfDoc = null,
  currentFileBlob = null,
  currentPdfObjectUrl = null,
  currentPageProxy = null,
  fileBlobPersisted = false,
  renderToken = 0,
  redrawScheduled = false,
  fileName = "",
  numPages = 1,
  currentPage = 1;
var baseScale = 1,
  zoomFactor = 1,
  currentScale = 1;
var pageDimsCache = {};
var annotationsByPage = {};
var pageRotations = {};
var undoHistoryStack = [],
  redoHistoryStack = [];
var imageElCache = {};
var idCounter = 0;
/* ============ PERSISTENT TOOL PREFERENCES ============ */
var DEFAULT_TOOL_SETTINGS = {
  pen: { width: 3, color: "#e8372a" },
  highlighter: { width: 14, color: "#f6c344" },
  shapes: { width: 3, color: "#e8372a" },
  rect: { width: 3, color: "#e8372a" },
  ellipse: { width: 3, color: "#e8372a" },
  line: { width: 3, color: "#e8372a" },
  arrow: { width: 3, color: "#e8372a" },
  text: {
    fontSize: 18,
    color: "#16181d",
    isBold: false,
    isItalic: false,
    isUnderline: false,
  },
  eraser: { size: 20 },
  "stroke-eraser": { size: 20 },
  "pixel-eraser": { size: 20 },
};

function loadToolPreferences() {
  var base = JSON.parse(JSON.stringify(DEFAULT_TOOL_SETTINGS));
  try {
    var saved = localStorage.getItem("pdfmaster-tool-settings");
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        Object.keys(parsed).forEach(function (k) {
          if (
            base[k] &&
            typeof base[k] === "object" &&
            typeof parsed[k] === "object"
          ) {
            Object.assign(base[k], parsed[k]);
          } else {
            base[k] = parsed[k];
          }
        });
      }
    }
  } catch (e) {
    console.warn("Could not load tool preferences:", e);
  }
  return base;
}

var toolPreferences = loadToolPreferences();

function saveToolPreferences() {
  try {
    localStorage.setItem(
      "pdfmaster-tool-settings",
      JSON.stringify(toolPreferences),
    );
  } catch (e) {
    console.warn("Could not save tool preferences:", e);
  }
}

function rememberToolStrokeWidth(w) {
  if (!w || isNaN(w)) return;
  w = Math.max(1, parseInt(w, 10));
  var target = currentTool;
  if (target === "select" || target === "lasso") {
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann) {
        if (ann.type === "path") {
          target = ann.opacity && ann.opacity < 0.6 ? "highlighter" : "pen";
        } else if (
          ["rect", "ellipse", "line", "arrow"].indexOf(ann.type) !== -1
        ) {
          target = "shapes";
        }
      }
    } else if (selectedGroup && selectedGroup.page === currentPage) {
      var groupAnns = getGroupAnnotations();
      if (groupAnns.length > 0) {
        var first = groupAnns[0];
        if (first.type === "path") {
          target =
            first.opacity && first.opacity < 0.6 ? "highlighter" : "pen";
        } else {
          target = "shapes";
        }
      }
    } else if (lastActiveDrawingTool) {
      target = lastActiveDrawingTool;
    }
  }

  if (target === "pen") {
    toolPreferences.pen.width = w;
  } else if (target === "highlighter") {
    toolPreferences.highlighter.width = w;
  } else if (
    ["rect", "ellipse", "line", "arrow", "shapes"].indexOf(target) !== -1
  ) {
    toolPreferences.shapes.width = w;
    toolPreferences.rect.width = w;
    toolPreferences.ellipse.width = w;
    toolPreferences.line.width = w;
    toolPreferences.arrow.width = w;
  }
  saveToolPreferences();
}

function rememberToolColor(c) {
  if (!c) return;
  var target = currentTool;
  if (target === "select" || target === "lasso") {
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann) {
        if (ann.type === "path") {
          target = ann.opacity && ann.opacity < 0.6 ? "highlighter" : "pen";
        } else if (
          ["rect", "ellipse", "line", "arrow"].indexOf(ann.type) !== -1
        ) {
          target = "shapes";
        } else if (ann.type === "text") {
          target = "text";
        }
      }
    } else if (selectedGroup && selectedGroup.page === currentPage) {
      var groupAnns = getGroupAnnotations();
      if (groupAnns.length > 0) {
        var first = groupAnns[0];
        if (first.type === "path") {
          target =
            first.opacity && first.opacity < 0.6 ? "highlighter" : "pen";
        } else if (first.type === "text") {
          target = "text";
        } else {
          target = "shapes";
        }
      }
    } else if (lastActiveDrawingTool) {
      target = lastActiveDrawingTool;
    }
  }

  if (target === "pen") {
    toolPreferences.pen.color = c;
  } else if (target === "highlighter") {
    toolPreferences.highlighter.color = c;
  } else if (
    ["rect", "ellipse", "line", "arrow", "shapes"].indexOf(target) !== -1
  ) {
    toolPreferences.shapes.color = c;
    toolPreferences.rect.color = c;
    toolPreferences.ellipse.color = c;
    toolPreferences.line.color = c;
    toolPreferences.arrow.color = c;
  } else if (target === "text") {
    toolPreferences.text.color = c;
  }
  saveToolPreferences();
}

function rememberEraserSize(sz) {
  if (!sz || isNaN(sz)) return;
  sz = Math.max(6, Math.min(60, parseInt(sz, 10)));
  toolPreferences.eraser.size = sz;
  toolPreferences["stroke-eraser"].size = sz;
  toolPreferences["pixel-eraser"].size = sz;
  saveToolPreferences();
}

function rememberFontSize(sz) {
  if (!sz || isNaN(sz)) return;
  sz = Math.max(8, Math.min(120, parseInt(sz, 10)));
  toolPreferences.text.fontSize = sz;
  saveToolPreferences();
}

function rememberTextFormatting(bold, italic, underline) {
  if (bold !== undefined) toolPreferences.text.isBold = !!bold;
  if (italic !== undefined) toolPreferences.text.isItalic = !!italic;
  if (underline !== undefined) toolPreferences.text.isUnderline = !!underline;
  saveToolPreferences();
}

function applyToolPreferences(tool) {
  if (
    !tool ||
    tool === "select" ||
    tool === "lasso" ||
    tool === "image" ||
    tool === "signature"
  ) {
    return;
  }
  var key = tool;
  if (tool === "stroke-eraser" || tool === "pixel-eraser") {
    key = "eraser";
  } else if (["rect", "ellipse", "line", "arrow"].indexOf(tool) !== -1) {
    key = "shapes";
  }

  var prefs = toolPreferences[tool] || toolPreferences[key];
  if (prefs) {
    if (prefs.width !== undefined) {
      currentStrokeWidth = prefs.width;
    }
    if (prefs.color !== undefined) {
      currentColor = prefs.color;
    }
    if (prefs.size !== undefined) {
      eraserSize = prefs.size;
    }
    if (prefs.fontSize !== undefined) {
      currentFontSize = prefs.fontSize;
    }
    if (prefs.isBold !== undefined) {
      currentIsBold = !!prefs.isBold;
    }
    if (prefs.isItalic !== undefined) {
      currentIsItalic = !!prefs.isItalic;
    }
    if (prefs.isUnderline !== undefined) {
      currentIsUnderline = !!prefs.isUnderline;
    }
    syncOptionInputs();
  }
}

var selectedAnnotation = null;
var currentTool = "select",
  lastActiveDrawingTool = null,
  currentColor =
    (toolPreferences.pen && toolPreferences.pen.color) || "#e8372a",
  currentStrokeWidth =
    (toolPreferences.pen && toolPreferences.pen.width) || 3,
  currentFontSize =
    (toolPreferences.text && toolPreferences.text.fontSize) || 18;
var currentIsBold =
    (toolPreferences.text && toolPreferences.text.isBold) || false,
  currentIsItalic =
    (toolPreferences.text && toolPreferences.text.isItalic) || false,
  currentIsUnderline =
    (toolPreferences.text && toolPreferences.text.isUnderline) || false;
var isPointerDown = false,
  dragMode = null,
  dragOrigin = null,
  dragStartPoint = null,
  dragCenter = null,
  dragStartAngle = 0;
var livePath = null,
  liveShape = null,
  liveEraser = null,
  liveLasso = null,
  pendingPlaceable = null;
var selectedGroup = null,
  groupDragOrigins = null,
  groupOrigBounds = null,
  lastSelectTool = "select";
var librariesLoaded = false,
  librariesLoading = null;
var sigDrawing = false,
  sigHasDrawn = false,
  sigCtx = null;
var measCanvas = null,
  measCtx = null;
var resizeTimer = null;
var dbPromise = null,
  saveTimer = null;

/* ---------- cropping state ---------- */
var cropState = {
  img: null,
  ann: null,
  cropRect: null,
  scale: 1,
  activeHandle: null,
  dragStart: { x: 0, y: 0 },
  startCropRect: null,
  drawCrop: null,
};

var PALETTE = [
  "#e8372a",
  "#ea580c",
  "#f59e0b",
  "#16a34a",
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#16181d",
  "#ffffff",
];
var TOOL_DEFAULTS = DEFAULT_TOOL_SETTINGS;
var ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];
var PDFJS_SOURCES = [
  {
    lib: "/assets/vendor/pdf-3.11.174.min.js",
    worker: "/assets/vendor/pdf.worker-3.11.174.min.js",
  },
  {
    lib: "/assets/vendor/pdf.min.js",
    worker: "/assets/vendor/pdf.worker.min.js",
  },
  {
    lib: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    worker:
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  },
  {
    lib: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
    worker:
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
  },
];
var PDFLIB_SOURCES = [
  "/assets/vendor/pdf-lib-1.17.1.min.js",
  "/assets/vendor/pdf-lib.min.js",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
  "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js",
];

function nextId() {
  idCounter += 1;
  return "a" + idCounter + "_" + Date.now().toString(36);
}

