(function () {
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
  var history = [],
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
    if (target === "select") {
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
            target = first.opacity && first.opacity < 0.6 ? "highlighter" : "pen";
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
    if (target === "select") {
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
            target = first.opacity && first.opacity < 0.6 ? "highlighter" : "pen";
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

  /* ---------- fast structural clone (replaces JSON.parse(JSON.stringify)) ----------
     Semantically equivalent to a JSON round-trip (undefined/function props dropped from
     objects, undefined array entries become null) but skips text serialization, and
     primitives (including large base64 dataUrl strings) are copied by value/reference
     instead of being re-parsed into brand-new string instances every time. This keeps
     the undo/redo stack cheap even when annotations embed large images. */
  function deepClone(value) {
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      var arr = new Array(value.length);
      for (var i = 0; i < value.length; i++) {
        var item = value[i];
        arr[i] = item === undefined ? null : deepClone(item);
      }
      return arr;
    }
    var out = {};
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        var v = value[key];
        if (v === undefined || typeof v === "function") continue;
        out[key] = deepClone(v);
      }
    }
    return out;
  }

  /* ---------- library loading ---------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.head.appendChild(s);
    });
  }
  function loadPdfJs() {
    var pdfjs = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
    if (pdfjs) {
      window.pdfjsLib = pdfjs;
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "/assets/vendor/pdf.worker-3.11.174.min.js";
      }
      return Promise.resolve();
    }
    var i = 0;
    function attempt() {
      if (i >= PDFJS_SOURCES.length) {
        return Promise.reject(new Error("pdf.js failed to load"));
      }
      var src = PDFJS_SOURCES[i];
      i += 1;
      return loadScript(src.lib).then(
        function () {
          var p = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
          if (p) {
            window.pdfjsLib = p;
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = src.worker;
            return;
          }
          return attempt();
        },
        function () {
          return attempt();
        },
      );
    }
    return attempt();
  }
  function loadPdfLibScript() {
    var pdflib = window.PDFLib || window["pdf-lib"];
    if (pdflib) {
      window.PDFLib = pdflib;
      return Promise.resolve();
    }
    var i = 0;
    function attempt() {
      if (i >= PDFLIB_SOURCES.length) {
        return Promise.reject(new Error("pdf-lib failed to load"));
      }
      var src = PDFLIB_SOURCES[i];
      i += 1;
      return loadScript(src).then(
        function () {
          var pl = window.PDFLib || window["pdf-lib"];
          if (pl) {
            window.PDFLib = pl;
            return;
          }
          return attempt();
        },
        function () {
          return attempt();
        },
      );
    }
    return attempt();
  }
  function ensureLibraries() {
    var pdfjs = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
    var pdflib = window.PDFLib || window["pdf-lib"];
    if (pdfjs && pdflib) {
      window.pdfjsLib = pdfjs;
      window.PDFLib = pdflib;
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "/assets/vendor/pdf.worker-3.11.174.min.js";
      }
      librariesLoaded = true;
      return Promise.resolve();
    }
    if (librariesLoaded) {
      return Promise.resolve();
    }
    if (!librariesLoading) {
      librariesLoading = Promise.all([loadPdfJs(), loadPdfLibScript()]).then(
        function () {
          librariesLoaded = true;
        },
      );
    }
    return librariesLoading;
  }

  /* ---------- low-RAM streaming document loader ----------
     Instead of reading the whole file into an ArrayBuffer and handing pdf.js the full
     buffer (which forces it to hold the entire document in memory even though only one
     page is ever on screen), we hand it a blob: URL and let it issue byte-range fetches
     for exactly the pages it's asked to render. Blob URLs support the Range header
     natively in modern browsers, so this costs nothing extra locally — it just avoids
     ever materializing bytes the user hasn't actually looked at. */
  function destroyCurrentDocument() {
    if (currentPageProxy) {
      try {
        currentPageProxy.cleanup();
      } catch (e) {}
      currentPageProxy = null;
    }
    if (pdfDoc) {
      try {
        pdfDoc.destroy();
      } catch (e) {}
    }
    pdfDoc = null;
    if (currentPdfObjectUrl) {
      URL.revokeObjectURL(currentPdfObjectUrl);
      currentPdfObjectUrl = null;
    }
  }
  function openPdfFromBlob(blob) {
    destroyCurrentDocument();
    var pdfjs = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
    currentPdfObjectUrl = URL.createObjectURL(blob);
    var task = pdfjs.getDocument({
      url: currentPdfObjectUrl,
      disableAutoFetch: true,
      disableStream: false,
      rangeChunkSize: 1048576,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
      cMapPacked: true,
    });
    return task.promise;
  }

  /* ---------- view helpers ---------- */
  function showEditor() {
    document.getElementById("top").classList.add("hidden");
    document.getElementById("editor-wrap").classList.remove("hidden");
    document.getElementById("loading-panel").classList.remove("hidden");
    document.getElementById("canvas-frame").classList.add("hidden");
    document.body.classList.add("editor-active");
    var navWrap = document.getElementById("nav-filename-wrap");
    if (navWrap) navWrap.style.display = "flex";
    window.scrollTo({ top: 0, behavior: "instant" });
    checkMobileWarning();
  }
  var mobileWarningDismissed = false;
  function checkMobileWarning() {
    var banner = document.getElementById("mobile-warning-banner");
    if (!banner) return;
    if (window.innerWidth < 768 && !mobileWarningDismissed) {
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }
  function showHero() {
    document.getElementById("editor-wrap").classList.add("hidden");
    document.getElementById("top").classList.remove("hidden");
    document.body.classList.remove("editor-active");
    var navWrap = document.getElementById("nav-filename-wrap");
    if (navWrap) navWrap.style.display = "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- file handling ---------- */
  function handleFile(file) {
    if (!file) return;
    var isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      window.showToast("Please choose a PDF file.");
      return;
    }
    showEditor();
    ensureLibraries()
      .then(function () {
        currentFileBlob = file;
        fileBlobPersisted = false;
        return openPdfFromBlob(file);
      })
      .then(function (doc) {
        pdfDoc = doc;
        numPages = doc.numPages;
        fileName = file.name;
        annotationsByPage = {};
        history = [];
        redoHistoryStack = [];
        imageElCache = {};
        selectedAnnotation = null;
        currentPage = 1;
        zoomFactor = 1;
        pageDimsCache = {};
        document.getElementById("editor-filename").textContent = fileName;
        updateUndoRedoButtons();
        setActiveTool("select");
        // Best-effort background write for crash recovery — doesn't block the
        // first render, and doesn't need to hold the file in JS memory to do it.
        persistFileBlobToDB(file, fileName);
        return renderPage(1);
      })
      .catch(function (err) {
        console.error("Failed to open PDF:", err);
        var msg = "Couldn't open that PDF. It may be corrupted.";
        if (err && err.name === "PasswordException") {
          msg =
            "This PDF is password-protected. Remove the password and try again.";
        }
        window.showToast(msg);
        showHero();
      });
  }

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
      if (!pageDimsCache[pageNum]) {
        var vp1 = page.getViewport({ scale: 1 });
        pageDimsCache[pageNum] = { width: vp1.width, height: vp1.height };
      }
      var dims = pageDimsCache[pageNum];
      var stage = document.getElementById("canvas-stage");
      var availWidth = Math.max(240, stage.clientWidth - 60);
      baseScale = Math.max(0.25, Math.min(availWidth / dims.width, 2.2));
      currentScale = baseScale * zoomFactor;
      var viewport = page.getViewport({ scale: currentScale });
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

  /* ---------- geometry helpers ---------- */
  function measureTextWidth(text, fontSize) {
    if (!measCtx) {
      measCanvas = document.createElement("canvas");
      measCtx = measCanvas.getContext("2d");
    }
    measCtx.font = fontSize + "px 'DM Sans', sans-serif";
    return measCtx.measureText(text || " ").width;
  }
  function getBounds(ann) {
    switch (ann.type) {
      case "text": {
        var w = measureTextWidth(ann.text, ann.fontSize);
        return {
          x: ann.x,
          y: ann.y,
          w: Math.max(w, 10),
          h: ann.fontSize * 1.25,
        };
      }
      case "rect":
        return { x: ann.x, y: ann.y, w: ann.width, h: ann.height };
      case "ellipse":
        return {
          x: ann.cx - ann.rx,
          y: ann.cy - ann.ry,
          w: ann.rx * 2,
          h: ann.ry * 2,
        };
      case "line":
      case "arrow": {
        var x = Math.min(ann.x1, ann.x2),
          y = Math.min(ann.y1, ann.y2);
        return {
          x: x,
          y: y,
          w: Math.max(Math.abs(ann.x2 - ann.x1), 2),
          h: Math.max(Math.abs(ann.y2 - ann.y1), 2),
        };
      }
      case "path":
      case "eraser": {
        var minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        (ann.points || []).forEach(function (p) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
        var pad = (ann.size || ann.strokeWidth || 4) / 2;
        return {
          x: minX - pad,
          y: minY - pad,
          w: Math.max(maxX - minX + pad * 2, 2),
          h: Math.max(maxY - minY + pad * 2, 2),
        };
      }
      case "image":
        return { x: ann.x, y: ann.y, w: ann.width, h: ann.height };
      default:
        return { x: 0, y: 0, w: 0, h: 0 };
    }
  }
  function getCenter(ann) {
    if (ann.type === "ellipse") {
      return { x: ann.cx, y: ann.cy };
    }
    if (ann.type === "line" || ann.type === "arrow") {
      return { x: (ann.x1 + ann.x2) / 2, y: (ann.y1 + ann.y2) / 2 };
    }
    var b = getBounds(ann);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  function unrotatePoint(pt, center, angleDeg) {
    if (!angleDeg) return pt;
    var rad = (-angleDeg * Math.PI) / 180;
    var dx = pt.x - center.x;
    var dy = pt.y - center.y;
    var unrotX = center.x + (dx * Math.cos(rad) - dy * Math.sin(rad));
    var unrotY = center.y + (dx * Math.sin(rad) + dy * Math.cos(rad));

    var dcx = pt.cx - center.x * currentScale;
    var dcy = pt.cy - center.y * currentScale;
    var unrotCx =
      center.x * currentScale + (dcx * Math.cos(rad) - dcy * Math.sin(rad));
    var unrotCy =
      center.y * currentScale + (dcx * Math.sin(rad) + dcy * Math.cos(rad));

    return {
      x: unrotX,
      y: unrotY,
      cx: unrotCx,
      cy: unrotCy,
    };
  }
  function distToSegment(p, a, b) {
    var l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
    if (l2 === 0) {
      return Math.hypot(p.x - a.x, p.y - a.y);
    }
    var t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    var projx = a.x + t * (b.x - a.x),
      projy = a.y + t * (b.y - a.y);
    return Math.hypot(p.x - projx, p.y - projy);
  }
  function findAnnotation(page, id) {
    return (annotationsByPage[page] || []).find(function (a) {
      return a.id === id;
    });
  }
  function isAnnotationEmpty(ann) {
    if (!ann) return true;
    if (ann.type === "eraser") return true;
    if (ann.type === "text") {
      return !ann.text || !ann.text.trim();
    }
    if (ann.type === "path") {
      return !ann.points || ann.points.length === 0;
    }
    if (ann.type === "rect") {
      return !ann.width || !ann.height || (ann.width <= 2 && ann.height <= 2);
    }
    if (ann.type === "ellipse") {
      return !ann.rx || !ann.ry || (ann.rx <= 1 && ann.ry <= 1);
    }
    if (ann.type === "line" || ann.type === "arrow") {
      return Math.hypot(ann.x2 - ann.x1, ann.y2 - ann.y1) < 2;
    }
    if (ann.type === "image") {
      return !ann.dataUrl || !ann.width || !ann.height;
    }
    return false;
  }

  function isPointInEraserStroke(p, eraserPoints, r) {
    if (!eraserPoints || eraserPoints.length === 0) return false;
    if (eraserPoints.length === 1) {
      return Math.hypot(p.x - eraserPoints[0].x, p.y - eraserPoints[0].y) <= r;
    }
    for (var i = 0; i < eraserPoints.length - 1; i++) {
      if (distToSegment(p, eraserPoints[i], eraserPoints[i + 1]) <= r) {
        return true;
      }
    }
    return false;
  }

  function segmentIntersectsEraser(p1, p2, eraserPoints, r) {
    var segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (segLen <= r) return false;
    var steps = Math.ceil(segLen / (r * 0.75));
    for (var s = 1; s < steps; s++) {
      var t = s / steps;
      var mid = {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      };
      if (isPointInEraserStroke(mid, eraserPoints, r)) {
        return true;
      }
    }
    return false;
  }

  function applyPixelErasureToAnnotations(eraserPoints, eraserRadius, page) {
    if (!eraserPoints || eraserPoints.length === 0) return false;
    var list = annotationsByPage[page] || [];
    var modified = false;
    var r = eraserRadius;

    for (var i = list.length - 1; i >= 0; i--) {
      var ann = list[i];
      if (!ann || ann.type === "eraser") continue;

      if (ann.type === "path") {
        var pts = ann.points || [];
        if (pts.length === 0) {
          list.splice(i, 1);
          modified = true;
          continue;
        }

        var strokeTol = r + (ann.strokeWidth || 2) * 0.3;
        var erasedMap = new Array(pts.length);
        var anyErased = false;
        var allErased = true;

        for (var k = 0; k < pts.length; k++) {
          if (isPointInEraserStroke(pts[k], eraserPoints, strokeTol)) {
            erasedMap[k] = true;
            anyErased = true;
          } else {
            erasedMap[k] = false;
            allErased = false;
          }
        }

        if (!anyErased) {
          for (var k = 0; k < pts.length - 1; k++) {
            if (
              segmentIntersectsEraser(pts[k], pts[k + 1], eraserPoints, strokeTol)
            ) {
              anyErased = true;
              break;
            }
          }
        }

        if (!anyErased) {
          continue;
        }

        modified = true;

        if (allErased) {
          list.splice(i, 1);
          if (selectedAnnotation && selectedAnnotation.id === ann.id) {
            selectedAnnotation = null;
          }
          continue;
        }

        var survivingRuns = [];
        var currentRun = [];

        for (var k = 0; k < pts.length; k++) {
          if (!erasedMap[k]) {
            if (currentRun.length > 0 && k > 0) {
              if (
                segmentIntersectsEraser(pts[k - 1], pts[k], eraserPoints, strokeTol)
              ) {
                survivingRuns.push(currentRun);
                currentRun = [];
              }
            }
            currentRun.push(pts[k]);
          } else {
            if (currentRun.length > 0) {
              survivingRuns.push(currentRun);
              currentRun = [];
            }
          }
        }
        if (currentRun.length > 0) {
          survivingRuns.push(currentRun);
        }

        survivingRuns = survivingRuns.filter(function (run) {
          return run.length >= 1;
        });

        if (survivingRuns.length === 0) {
          list.splice(i, 1);
          if (selectedAnnotation && selectedAnnotation.id === ann.id) {
            selectedAnnotation = null;
          }
        } else {
          ann.points = survivingRuns[0];
          for (var m = 1; m < survivingRuns.length; m++) {
            var newPath = {
              id: nextId(),
              page: page,
              type: "path",
              points: survivingRuns[m],
              color: ann.color,
              strokeWidth: ann.strokeWidth,
              opacity: ann.opacity,
            };
            list.push(newPath);
          }
        }
      } else if (ann.type === "line" || ann.type === "arrow") {
        var p1 = { x: ann.x1, y: ann.y1 };
        var p2 = { x: ann.x2, y: ann.y2 };
        var strokeTol = r + (ann.strokeWidth || 2) * 0.5;
        if (
          isPointInEraserStroke(p1, eraserPoints, strokeTol) ||
          isPointInEraserStroke(p2, eraserPoints, strokeTol) ||
          segmentIntersectsEraser(p1, p2, eraserPoints, strokeTol)
        ) {
          list.splice(i, 1);
          if (selectedAnnotation && selectedAnnotation.id === ann.id) {
            selectedAnnotation = null;
          }
          modified = true;
        }
      } else {
        var b = getBounds(ann);
        var hit = false;
        for (var ep = 0; ep < eraserPoints.length; ep++) {
          var p = eraserPoints[ep];
          if (
            p.x >= b.x - r &&
            p.x <= b.x + b.w + r &&
            p.y >= b.y - r &&
            p.y <= b.y + b.h + r
          ) {
            hit = true;
            break;
          }
        }
        if (hit) {
          list.splice(i, 1);
          if (selectedAnnotation && selectedAnnotation.id === ann.id) {
            selectedAnnotation = null;
          }
          modified = true;
        }
      }
    }
    return modified;
  }

  function cleanPageAnnotations(page) {
    if (!annotationsByPage[page]) return;
    var list = annotationsByPage[page];
    var legacyErasers = list.filter(function (a) {
      return a && a.type === "eraser";
    });

    if (legacyErasers.length > 0) {
      legacyErasers.forEach(function (eraser) {
        if (eraser.points && eraser.points.length > 0) {
          applyPixelErasureToAnnotations(
            eraser.points,
            (eraser.size || 20) / 2,
            page,
          );
        }
      });
      annotationsByPage[page] = annotationsByPage[page].filter(function (a) {
        return a && a.type !== "eraser" && !isAnnotationEmpty(a);
      });
      scheduleDBSave();
    } else {
      annotationsByPage[page] = list.filter(function (a) {
        return a && a.type !== "eraser" && !isAnnotationEmpty(a);
      });
    }
  }

  function pointInPoly(p, poly) {
    var x = p.x,
      y = p.y;
    var inside = false;
    var n = poly.length;
    var j = n - 1;
    for (var i = 0; i < n; i++) {
      var xi = poly[i].x,
        yi = poly[i].y;
      var xj = poly[j].x,
        yj = poly[j].y;
      var intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
      j = i;
    }
    return inside;
  }

  function isAnnotationInPolygon(ann, poly) {
    if (!ann || isAnnotationEmpty(ann) || ann.type === "eraser") return false;
    var c = getCenter(ann);
    if (pointInPoly(c, poly)) return true;

    if (ann.type === "path" && ann.points) {
      for (var i = 0; i < ann.points.length; i++) {
        if (pointInPoly(ann.points[i], poly)) return true;
      }
      return false;
    }

    if (ann.type === "line" || ann.type === "arrow") {
      return (
        pointInPoly({ x: ann.x1, y: ann.y1 }, poly) ||
        pointInPoly({ x: ann.x2, y: ann.y2 }, poly)
      );
    }

    var b = getBounds(ann);
    return (
      pointInPoly({ x: b.x, y: b.y }, poly) ||
      pointInPoly({ x: b.x + b.w, y: b.y }, poly) ||
      pointInPoly({ x: b.x, y: b.y + b.h }, poly) ||
      pointInPoly({ x: b.x + b.w, y: b.y + b.h }, poly)
    );
  }

  function getGroupAnnotations() {
    if (!selectedGroup || selectedGroup.page !== currentPage) return [];
    var list = annotationsByPage[currentPage] || [];
    return list.filter(function (a) {
      return selectedGroup.ids.indexOf(a.id) !== -1 && !isAnnotationEmpty(a);
    });
  }

  function getGroupBounds(anns) {
    if (!anns || anns.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    var minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    anns.forEach(function (a) {
      var b = getBounds(a);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    });
    return {
      x: minX,
      y: minY,
      w: Math.max(maxX - minX, 4),
      h: Math.max(maxY - minY, 4),
    };
  }

  function getGroupSelectionHandles(anns, scale) {
    var b = getGroupBounds(anns);
    var pad = 10;
    var bx = b.x * scale - pad,
      by = b.y * scale - pad,
      bw = Math.max(b.w * scale + pad * 2, 24),
      bh = Math.max(b.h * scale + pad * 2, 24);
    var deleteBtn = { x: bx + bw + 10, y: by - 10, r: 12 };
    var rotateBtn = { x: bx + bw / 2, y: by - 28, r: 10 };

    return {
      box: { x: bx, y: by, w: bw, h: bh },
      deleteBtn: deleteBtn,
      rotateBtn: rotateBtn,
      // Corners
      tl: { x: bx, y: by, size: 9 },
      tr: { x: bx + bw, y: by, size: 9 },
      br: { x: bx + bw, y: by + bh, size: 9 },
      bl: { x: bx, y: by + bh, size: 9 },
      // Sides
      t: { x: bx + bw / 2, y: by, size: 9 },
      b: { x: bx + bw / 2, y: by + bh, size: 9 },
      l: { x: bx, y: by + bh / 2, size: 9 },
      r: { x: bx + bw, y: by + bh / 2, size: 9 },
    };
  }

  function drawGroupSelectionUI(ctx, anns, scale) {
    var handles = getGroupSelectionHandles(anns, scale);
    var b = handles.box;

    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.8;
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

    // Delete button for group
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

    // Resize handles
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
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1.6;
    list.forEach(function (h) {
      ctx.beginPath();
      ctx.rect(h.x - 5, h.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    });

    // Selection badge
    var badgeText = anns.length + " items";
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
    var textWidth = ctx.measureText(badgeText).width;
    var badgeW = textWidth + 12;
    var badgeH = 20;
    var badgeX = b.x;
    var badgeY = b.y - 28;
    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
    } else {
      ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, badgeX + 6, badgeY + badgeH / 2);

    ctx.restore();
  }

  function hitTest(pt) {
    cleanPageAnnotations(currentPage);
    var list = annotationsByPage[currentPage] || [];
    var tol = 6 / currentScale;
    for (var i = list.length - 1; i >= 0; i--) {
      var ann = list[i];
      if (isAnnotationEmpty(ann)) {
        continue;
      }
      var center = getCenter(ann);
      var upt = unrotatePoint(pt, center, ann.rotation || 0);

      if (ann.type === "line" || ann.type === "arrow") {
        if (
          distToSegment(
            upt,
            { x: ann.x1, y: ann.y1 },
            { x: ann.x2, y: ann.y2 },
          ) <= Math.max(tol, ann.strokeWidth)
        ) {
          return ann;
        }
        continue;
      }
      if (ann.type === "path") {
        var hit = false;
        for (var k = 0; k < ann.points.length - 1; k++) {
          if (
            distToSegment(upt, ann.points[k], ann.points[k + 1]) <=
            Math.max(tol, ann.strokeWidth)
          ) {
            hit = true;
            break;
          }
        }
        if (hit) {
          return ann;
        }
        continue;
      }
      var b = getBounds(ann);
      if (
        upt.x >= b.x - tol &&
        upt.x <= b.x + b.w + tol &&
        upt.y >= b.y - tol &&
        upt.y <= b.y + b.h + tol
      ) {
        return ann;
      }
    }
    return null;
  }
  function getSelectionHandles(ann, scale) {
    var b = getBounds(ann);
    var pad = 10;
    var x = b.x * scale - pad,
      y = b.y * scale - pad,
      w = Math.max(b.w * scale + pad * 2, 24),
      h = Math.max(b.h * scale + pad * 2, 24);
    var deleteBtn = { x: x + w + 10, y: y - 10, r: 12 };
    var cropBtn = ann.type === "image" ? { x: x - 10, y: y - 10, r: 12 } : null;
    var rotateBtn = { x: x + w / 2, y: y - 28, r: 10 };

    return {
      box: { x: x, y: y, w: w, h: h },
      deleteBtn: deleteBtn,
      cropBtn: cropBtn,
      rotateBtn: rotateBtn,
      // Corners
      tl: { x: x, y: y, size: 9 },
      tr: { x: x + w, y: y, size: 9 },
      br: { x: x + w, y: y + h, size: 9 },
      bl: { x: x, y: y + h, size: 9 },
      // Sides
      t: { x: x + w / 2, y: y, size: 9 },
      b: { x: x + w / 2, y: y + h, size: 9 },
      l: { x: x, y: y + h / 2, size: 9 },
      r: { x: x + w, y: y + h / 2, size: 9 },
    };
  }

  function getElementAABB(ann, scale) {
    var handles = getSelectionHandles(ann, scale);
    var b = handles.box;
    var rot = (ann.rotation || 0) * (Math.PI / 180);
    if (!rot) return b;
    var center = getCenter(ann);
    var cx = center.x * scale;
    var cy = center.y * scale;
    var corners = [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
      { x: b.x, y: b.y + b.h },
    ];
    var cos = Math.cos(rot);
    var sin = Math.sin(rot);
    var minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (var i = 0; i < corners.length; i++) {
      var dx = corners[i].x - cx;
      var dy = corners[i].y - cy;
      var rx = cx + dx * cos - dy * sin;
      var ry = cy + dx * sin + dy * cos;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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

  function pushHistory() {
    history.push(deepClone(annotationsByPage));
    if (history.length > 40) {
      history.shift();
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
    if (history.length === 0) {
      return;
    }
    redoHistoryStack.push(deepClone(annotationsByPage));
    annotationsByPage = history.pop();
    selectedAnnotation = null;
    redrawAnnotations();
    updateUndoRedoButtons();
  }
  function redo() {
    if (redoHistoryStack.length === 0) {
      return;
    }
    history.push(deepClone(annotationsByPage));
    annotationsByPage = redoHistoryStack.pop();
    selectedAnnotation = null;
    redrawAnnotations();
    updateUndoRedoButtons();
  }
  function updateUndoRedoButtons() {
    document.getElementById("undo-btn").disabled = history.length === 0;
    document.getElementById("redo-btn").disabled =
      redoHistoryStack.length === 0;
  }
  function applyMove(ann, origin, dx, dy) {
    switch (ann.type) {
      case "text":
      case "rect":
      case "image":
        ann.x = origin.x + dx;
        ann.y = origin.y + dy;
        break;
      case "ellipse":
        ann.cx = origin.cx + dx;
        ann.cy = origin.cy + dy;
        break;
      case "line":
      case "arrow":
        ann.x1 = origin.x1 + dx;
        ann.y1 = origin.y1 + dy;
        ann.x2 = origin.x2 + dx;
        ann.y2 = origin.y2 + dy;
        break;
      case "path":
        ann.points = origin.points.map(function (p) {
          return { x: p.x + dx, y: p.y + dy };
        });
        break;
    }
  }
  function applyBoundsResize(ann, origin, newBox) {
    var originBounds = getBounds(origin);
    if (originBounds.w === 0 || originBounds.h === 0) return;

    var ratioX = newBox.w / originBounds.w;
    var ratioY = newBox.h / originBounds.h;

    switch (ann.type) {
      case "image":
      case "rect": {
        ann.x = newBox.x;
        ann.y = newBox.y;
        ann.width = newBox.w;
        ann.height = newBox.h;
        break;
      }
      case "ellipse": {
        ann.rx = newBox.w / 2;
        ann.ry = newBox.h / 2;
        ann.cx = newBox.x + ann.rx;
        ann.cy = newBox.y + ann.ry;
        break;
      }
      case "line":
      case "arrow": {
        var ox = originBounds.x;
        var oy = originBounds.y;
        ann.x1 = newBox.x + (origin.x1 - ox) * ratioX;
        ann.y1 = newBox.y + (origin.y1 - oy) * ratioY;
        ann.x2 = newBox.x + (origin.x2 - ox) * ratioX;
        ann.y2 = newBox.y + (origin.y2 - oy) * ratioY;
        break;
      }
      case "path": {
        var ox = originBounds.x;
        var oy = originBounds.y;
        ann.points = origin.points.map(function (p) {
          return {
            x: newBox.x + (p.x - ox) * ratioX,
            y: newBox.y + (p.y - oy) * ratioY,
          };
        });
        break;
      }
      case "text": {
        ann.x = newBox.x;
        ann.y = newBox.y;
        ann.fontSize = Math.max(6, Math.round(origin.fontSize * ratioX));
        break;
      }
    }
  }

  function applyGroupRotate(groupItems, center, deltaRad) {
    var cosA = Math.cos(deltaRad);
    var sinA = Math.sin(deltaRad);
    var deltaDeg = (deltaRad * 180) / Math.PI;

    groupItems.forEach(function (item) {
      var ann = findAnnotation(currentPage, item.id);
      if (!ann) return;
      var origin = item.origin;

      if (ann.type === "path") {
        ann.points = (origin.points || []).map(function (p) {
          var dx = p.x - center.x;
          var dy = p.y - center.y;
          return {
            x: center.x + dx * cosA - dy * sinA,
            y: center.y + dx * sinA + dy * cosA,
          };
        });
      } else if (ann.type === "line" || ann.type === "arrow") {
        var dx1 = origin.x1 - center.x;
        var dy1 = origin.y1 - center.y;
        ann.x1 = center.x + dx1 * cosA - dy1 * sinA;
        ann.y1 = center.y + dx1 * sinA + dy1 * cosA;

        var dx2 = origin.x2 - center.x;
        var dy2 = origin.y2 - center.y;
        ann.x2 = center.x + dx2 * cosA - dy2 * sinA;
        ann.y2 = center.y + dx2 * sinA + dy2 * cosA;
      } else if (ann.type === "ellipse") {
        var dx = origin.cx - center.x;
        var dy = origin.cy - center.y;
        ann.cx = center.x + dx * cosA - dy * sinA;
        ann.cy = center.y + dx * sinA + dy * cosA;
        ann.rotation = Math.round(((origin.rotation || 0) + deltaDeg) % 360);
      } else {
        var oc = getCenter(origin);
        var dx = oc.x - center.x;
        var dy = oc.y - center.y;
        var nc = {
          x: center.x + dx * cosA - dy * sinA,
          y: center.y + dx * sinA + dy * cosA,
        };
        var b = getBounds(origin);
        ann.x = nc.x - b.w / 2;
        ann.y = nc.y - b.h / 2;
        ann.rotation = Math.round(((origin.rotation || 0) + deltaDeg) % 360);
      }
    });
  }

  function applyGroupResize(groupItems, origBounds, newBox) {
    if (origBounds.w === 0 || origBounds.h === 0) return;
    var ratioX = newBox.w / origBounds.w;
    var ratioY = newBox.h / origBounds.h;

    groupItems.forEach(function (item) {
      var ann = findAnnotation(currentPage, item.id);
      if (!ann) return;
      var origin = item.origin;
      var b = getBounds(origin);

      var annNewBox = {
        x: newBox.x + (b.x - origBounds.x) * ratioX,
        y: newBox.y + (b.y - origBounds.y) * ratioY,
        w: Math.max(2, b.w * ratioX),
        h: Math.max(2, b.h * ratioY),
      };

      applyBoundsResize(ann, origin, annNewBox);
    });
  }

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
        if (currentTool === "select") {
          selectedAnnotation = { page: currentPage, id: ann.id };
          updateToolOptionsPanel("select");
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
    if (currentTool === "lasso") {
      canvas.style.cursor = "crosshair";
      return;
    }
    if (isPointerDown || currentTool !== "select") return;
    if (!e) {
      canvas.style.cursor = "default";
      return;
    }

    var pt = getCanvasPagePoint(e);
    if (selectedGroup && selectedGroup.page === currentPage) {
      var groupAnns = getGroupAnnotations();
      if (groupAnns.length > 0) {
        var handles = getGroupSelectionHandles(groupAnns, currentScale);

        if (
          Math.hypot(pt.cx - handles.deleteBtn.x, pt.cy - handles.deleteBtn.y) <=
          handles.deleteBtn.r + 4
        ) {
          canvas.style.cursor = "pointer";
          return;
        }

        if (
          Math.hypot(pt.cx - handles.rotateBtn.x, pt.cy - handles.rotateBtn.y) <=
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
    if (tool !== "select") {
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

  /* ---------- signature modal ---------- */
  var sigActiveTab = "type";
  var sigFontName = "Pacifico";
  var sigUploadedDataUrl = null;
  var sigOriginalFile = null;
  var sigOriginalDataUrl = null;
  var sigProcessedDataUrl = null;

  function setSigTab(tab) {
    sigActiveTab = tab;
    document.querySelectorAll(".sig-tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".sig-tab-content").forEach(function (content) {
      content.classList.toggle("hidden", content.id !== "sig-tab-" + tab);
    });
    if (tab === "draw") {
      setupSignaturePad();
    }
  }

  function generateTypedSignature(text, font) {
    var canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 150;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "italic 52px " + font + ", cursive";
    ctx.fillStyle = "#16181d";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var metrics = ctx.measureText(text);
    if (metrics.width > canvas.width - 40) {
      var size = Math.floor(52 * ((canvas.width - 40) / metrics.width));
      ctx.font = "italic " + size + "px " + font + ", cursive";
    }
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL("image/png");
  }

  function openSignatureModal() {
    document.getElementById("sig-overlay").classList.add("is-open");
    var modal = document.getElementById("sig-modal");
    modal.style.opacity = "1";
    modal.style.pointerEvents = "auto";
    modal.style.transform = "translate(-50%,-50%) scale(1)";
    modal.setAttribute("aria-hidden", "false");
    setSigTab("type");
    var input = document.getElementById("sig-type-input");
    if (input) {
      input.value = "";
      input.dispatchEvent(new Event("input"));
    }
    sigUploadedDataUrl = null;
    sigOriginalFile = null;
    sigOriginalDataUrl = null;
    sigProcessedDataUrl = null;
    var uploadInput = document.getElementById("sig-upload-input");
    if (uploadInput) uploadInput.value = "";
    var chk = document.getElementById("sig-bg-remove-chk");
    if (chk) chk.checked = false;
    var chkWrap = document.getElementById("sig-bg-remove-wrap");
    if (chkWrap) chkWrap.classList.add("hidden");
    var dropZone = document.getElementById("sig-drop-zone");
    if (dropZone) dropZone.classList.remove("hidden");
    var previewContainer = document.getElementById(
      "sig-upload-preview-container",
    );
    if (previewContainer) previewContainer.classList.add("hidden");
  }
  function closeSignatureModal(revertTool) {
    document.getElementById("sig-overlay").classList.remove("is-open");
    var modal = document.getElementById("sig-modal");
    modal.style.opacity = "0";
    modal.style.pointerEvents = "none";
    modal.style.transform = "translate(-50%,-50%) scale(.94)";
    modal.setAttribute("aria-hidden", "true");
    if (revertTool && !pendingPlaceable) {
      setActiveTool("select");
    }
  }
  function setupSignaturePad() {
    var canvas = document.getElementById("sig-canvas");
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    sigCtx = canvas.getContext("2d");
    sigCtx.clearRect(0, 0, canvas.width, canvas.height);
    sigHasDrawn = false;
    sigCtx.strokeStyle = "#16181d";
    sigCtx.lineWidth = 2.6;
    sigCtx.lineCap = "round";
    sigCtx.lineJoin = "round";
    if (!canvas._wired) {
      canvas._wired = true;
      var lastSigPt = null;
      canvas.addEventListener("pointerdown", function (e) {
        sigDrawing = true;
        var r = canvas.getBoundingClientRect();
        lastSigPt = { x: e.clientX - r.left, y: e.clientY - r.top };
        sigCtx.beginPath();
        sigCtx.arc(lastSigPt.x, lastSigPt.y, 1.3, 0, Math.PI * 2);
        sigCtx.fillStyle = "#16181d";
        sigCtx.fill();
        sigHasDrawn = true;
      });
      canvas.addEventListener("pointermove", function (e) {
        if (!sigDrawing || !lastSigPt) {
          return;
        }
        var r = canvas.getBoundingClientRect();
        var curPt = { x: e.clientX - r.left, y: e.clientY - r.top };
        var dist = Math.hypot(curPt.x - lastSigPt.x, curPt.y - lastSigPt.y);
        if (dist >= 1.2) {
          var midX = (lastSigPt.x + curPt.x) / 2;
          var midY = (lastSigPt.y + curPt.y) / 2;
          sigCtx.beginPath();
          sigCtx.moveTo(lastSigPt.x, lastSigPt.y);
          sigCtx.quadraticCurveTo(lastSigPt.x, lastSigPt.y, midX, midY);
          sigCtx.stroke();
          lastSigPt = curPt;
          sigHasDrawn = true;
        }
      });
      window.addEventListener("pointerup", function () {
        sigDrawing = false;
        lastSigPt = null;
      });
    }
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
      Math.min(500, document.getElementById("crop-modal").clientWidth - 64) -
      40; // 20px padding on left & right
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
      ctx.strokeRect(
        20,
        20,
        img.naturalWidth * scale,
        img.naturalHeight * scale,
      );

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
      var stageRect = canvasStage ? canvasStage.getBoundingClientRect() : bodyRect;
      var visibleTop = Math.max(bodyRect.top, stageRect.top) - bodyRect.top + 8;
      var visibleBottom = Math.min(bodyRect.bottom, stageRect.bottom) - bodyRect.top - 8;

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
          '.toolbar .tool-btn[data-tool="' + targetTool + '"]'
        );
      }

      if (!anchorEl) {
        var toolItem = document.querySelector(
          '.toolbar [data-tool="' + targetTool + '"]'
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
    } else if (activeTool === "stroke-eraser" || activeTool === "pixel-eraser") {
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

  /* ============ ERASER LOGIC ============ */
  function eraseStrokeAtPoint(pt, radius) {
    var list = annotationsByPage[currentPage] || [];
    var tol = Math.max(6, radius);
    var removed = false;

    for (var i = list.length - 1; i >= 0; i--) {
      var ann = list[i];
      var center = getCenter(ann);
      var upt = unrotatePoint(pt, center, ann.rotation || 0);

      if (ann.type === "path" || ann.type === "eraser") {
        var hit = false;
        var pts = ann.points || [];
        var w = ann.type === "eraser" ? ann.size || 20 : ann.strokeWidth || 3;
        for (var k = 0; k < pts.length - 1; k++) {
          if (distToSegment(upt, pts[k], pts[k + 1]) <= tol + w / 2) {
            hit = true;
            break;
          }
        }
        if (hit) {
          list.splice(i, 1);
          if (selectedAnnotation && selectedAnnotation.id === ann.id) {
            selectedAnnotation = null;
          }
          removed = true;
          continue;
        }
      } else if (ann.type === "line" || ann.type === "arrow") {
        if (
          distToSegment(
            upt,
            { x: ann.x1, y: ann.y1 },
            { x: ann.x2, y: ann.y2 },
          ) <=
          tol + (ann.strokeWidth || 3) / 2
        ) {
          list.splice(i, 1);
          if (selectedAnnotation && selectedAnnotation.id === ann.id) {
            selectedAnnotation = null;
          }
          removed = true;
          continue;
        }
      } else {
        var b = getBounds(ann);
        if (
          upt.x >= b.x - tol &&
          upt.x <= b.x + b.w + tol &&
          upt.y >= b.y - tol &&
          upt.y <= b.y + b.h + tol
        ) {
          list.splice(i, 1);
          if (selectedAnnotation && selectedAnnotation.id === ann.id) {
            selectedAnnotation = null;
          }
          removed = true;
          continue;
        }
      }
    }
    return removed;
  }

  function eraseStrokeAlongSegment(p1, p2, radius) {
    var dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    var step = Math.max(4, radius / 2);
    var steps = Math.ceil(dist / step);
    var removed = false;
    for (var s = 0; s <= steps; s++) {
      var t = steps === 0 ? 1 : s / steps;
      var x = p1.x + (p2.x - p1.x) * t;
      var y = p1.y + (p2.y - p1.y) * t;
      if (eraseStrokeAtPoint({ x: x, y: y }, radius)) {
        removed = true;
      }
    }
    return removed;
  }

  function simplifyPoints(pts) {
    if (!pts || pts.length <= 2) return pts;
    var res = [pts[0]];
    var prev = pts[0];
    for (var i = 1; i < pts.length - 1; i++) {
      var d = Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y);
      if (d >= 2) {
        res.push(pts[i]);
        prev = pts[i];
      }
    }
    var last = pts[pts.length - 1];
    if (Math.hypot(last.x - prev.x, last.y - prev.y) >= 0.5) {
      res.push(last);
    } else if (res.length === 1) {
      res.push(last);
    }
    return res.length >= 2 ? res : pts;
  }

  function smoothStrokePoints(pts) {
    if (!pts || pts.length <= 2) return pts;
    var res = [pts[0]];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i];
      var p1 = pts[i + 1];
      res.push({
        x: 0.78 * p0.x + 0.22 * p1.x,
        y: 0.78 * p0.y + 0.22 * p1.y,
      });
      res.push({
        x: 0.22 * p0.x + 0.78 * p1.x,
        y: 0.22 * p0.y + 0.78 * p1.y,
      });
    }
    res.push(pts[pts.length - 1]);
    return res;
  }

  /* ---------- pointer interaction on the page ---------- */
  function getCanvasPagePoint(evt) {
    var canvas = document.getElementById("annotation-canvas");
    var rect = canvas.getBoundingClientRect();
    var cx = evt.clientX - rect.left,
      cy = evt.clientY - rect.top;
    return { x: cx / currentScale, y: cy / currentScale, cx: cx, cy: cy };
  }

  function onPointerDown(e) {
    if (!pdfDoc) {
      return;
    }
    var canvas = document.getElementById("annotation-canvas");
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
    var pt = getCanvasPagePoint(e);
    isPointerDown = true;

    if (currentTool === "select") {
      if (selectedGroup && selectedGroup.page === currentPage) {
        var groupAnns = getGroupAnnotations();
        if (groupAnns.length > 0) {
          var handles = getGroupSelectionHandles(groupAnns, currentScale);
          var isTouch = e.pointerType === "touch";
          var tolerance = isTouch ? 16 : 6;

          // Delete button
          if (
            Math.hypot(pt.cx - handles.deleteBtn.x, pt.cy - handles.deleteBtn.y) <=
            handles.deleteBtn.r + (isTouch ? 12 : 4)
          ) {
            pushHistory();
            groupAnns.forEach(function (a) {
              deleteAnnotation(currentPage, a.id);
            });
            selectedGroup = null;
            isPointerDown = false;
            hideToolOptionsPanel();
            redrawAnnotations();
            return;
          }

          // Rotate button
          if (
            Math.hypot(pt.cx - handles.rotateBtn.x, pt.cy - handles.rotateBtn.y) <=
            handles.rotateBtn.r + (isTouch ? 12 : 4)
          ) {
            pushHistory();
            dragMode = "group-rotate";
            groupDragOrigins = groupAnns.map(function (a) {
              return { id: a.id, origin: deepClone(a) };
            });
            groupOrigBounds = getGroupBounds(groupAnns);
            dragCenter = {
              x: groupOrigBounds.x + groupOrigBounds.w / 2,
              y: groupOrigBounds.y + groupOrigBounds.h / 2,
            };
            var cScreenX = dragCenter.x * currentScale;
            var cScreenY = dragCenter.y * currentScale;
            dragStartAngle = Math.atan2(pt.cy - cScreenY, pt.cx - cScreenX);
            hideToolOptionsPanel();
            return;
          }

          // Corner Resizers Click Detection
          var cornerNames = ["tl", "tr", "br", "bl"];
          for (var i = 0; i < cornerNames.length; i++) {
            var name = cornerNames[i];
            var h = handles[name];
            var dist = Math.hypot(pt.cx - h.x, pt.cy - h.y);
            if (dist <= h.size + tolerance) {
              pushHistory();
              dragMode = "group-resize-" + name;
              groupDragOrigins = groupAnns.map(function (a) {
                return { id: a.id, origin: deepClone(a) };
              });
              groupOrigBounds = getGroupBounds(groupAnns);
              dragStartPoint = pt;
              hideToolOptionsPanel();
              return;
            }
          }

          // Side Resizers Click Detection
          var sideNames = ["t", "b", "l", "r"];
          for (var i = 0; i < sideNames.length; i++) {
            var name = sideNames[i];
            var h = handles[name];
            var dist = Math.hypot(pt.cx - h.x, pt.cy - h.y);
            if (dist <= h.size + tolerance) {
              pushHistory();
              dragMode = "group-resize-" + name;
              groupDragOrigins = groupAnns.map(function (a) {
                return { id: a.id, origin: deepClone(a) };
              });
              groupOrigBounds = getGroupBounds(groupAnns);
              dragStartPoint = pt;
              hideToolOptionsPanel();
              return;
            }
          }

          // Inside box for moving
          var b = handles.box;
          if (
            pt.cx >= b.x &&
            pt.cx <= b.x + b.w &&
            pt.cy >= b.y &&
            pt.cy <= b.y + b.h
          ) {
            pushHistory();
            dragMode = "group-move";
            groupDragOrigins = groupAnns.map(function (a) {
              return { id: a.id, origin: deepClone(a) };
            });
            dragStartPoint = pt;
            hideToolOptionsPanel();
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
          var isTouch = e.pointerType === "touch";

          var dDist = Math.hypot(
            upt.cx - handles.deleteBtn.x,
            upt.cy - handles.deleteBtn.y,
          );
          if (dDist <= handles.deleteBtn.r + (isTouch ? 12 : 4)) {
            deleteAnnotation(currentPage, ann.id);
            isPointerDown = false;
            hideToolOptionsPanel();
            return;
          }
          if (handles.cropBtn) {
            var cDist = Math.hypot(
              upt.cx - handles.cropBtn.x,
              upt.cy - handles.cropBtn.y,
            );
            if (cDist <= handles.cropBtn.r + (isTouch ? 12 : 4)) {
              hideToolOptionsPanel();
              openCropModal(ann);
              isPointerDown = false;
              return;
            }
          }
          if (handles.rotateBtn) {
            var rDist = Math.hypot(
              upt.cx - handles.rotateBtn.x,
              upt.cy - handles.rotateBtn.y,
            );
            if (rDist <= handles.rotateBtn.r + (isTouch ? 12 : 4)) {
              dragMode = "rotate";
              dragOrigin = deepClone(ann);
              dragCenter = getCenter(ann);
              var cScreenX = dragCenter.x * currentScale;
              var cScreenY = dragCenter.y * currentScale;
              dragStartAngle = Math.atan2(pt.cy - cScreenY, pt.cx - cScreenX);
              hideToolOptionsPanel();
              return;
            }
          }

          // Corner Resizers Click Detection
          var tolerance = isTouch ? 16 : 6;
          var cornerNames = ["tl", "tr", "br", "bl"];
          for (var i = 0; i < cornerNames.length; i++) {
            var name = cornerNames[i];
            var h = handles[name];
            var dist = Math.hypot(upt.cx - h.x, upt.cy - h.y);
            if (dist <= h.size + tolerance) {
              dragMode = "resize-" + name;
              dragOrigin = deepClone(ann);
              dragStartPoint = pt;
              hideToolOptionsPanel();
              return;
            }
          }
          // Side Resizers Click Detection
          var sideNames = ["t", "b", "l", "r"];
          for (var i = 0; i < sideNames.length; i++) {
            var name = sideNames[i];
            var h = handles[name];
            var dist = Math.hypot(upt.cx - h.x, upt.cy - h.y);
            if (dist <= h.size + tolerance) {
              dragMode = "resize-" + name;
              dragOrigin = deepClone(ann);
              dragStartPoint = pt;
              hideToolOptionsPanel();
              return;
            }
          }
          // Allow dragging by clicking inside the selected element's bounding box
          var b = handles.box;
          if (
            upt.cx >= b.x &&
            upt.cx <= b.x + b.w &&
            upt.cy >= b.y &&
            upt.cy <= b.y + b.h
          ) {
            dragMode = "move";
            dragOrigin = deepClone(ann);
            dragStartPoint = pt;
            if (ann.fontSize !== undefined) {
              currentFontSize = ann.fontSize;
            }
            if (ann.color !== undefined) {
              currentColor = ann.color;
            }
            if (ann.strokeWidth !== undefined) {
              currentStrokeWidth = ann.strokeWidth;
            }
            hideToolOptionsPanel();
            syncOptionInputs();
            return;
          }
        } else {
          selectedAnnotation = null;
        }
      }
      var hit = hitTest(pt);
      if (hit) {
        selectedGroup = null;
        selectedAnnotation = { page: currentPage, id: hit.id };
        dragMode = "move";
        dragOrigin = deepClone(hit);
        dragStartPoint = pt;
        if (hit.color !== undefined) {
          currentColor = hit.color;
        }
        if (hit.strokeWidth !== undefined) {
          currentStrokeWidth = hit.strokeWidth;
        }
        if (hit.fontSize !== undefined) {
          currentFontSize = hit.fontSize;
          var fsInput = document.getElementById("font-size");
          if (fsInput) fsInput.value = currentFontSize;
        }
        if (hit.type === "text") {
          currentIsBold = !!hit.isBold;
          currentIsItalic = !!hit.isItalic;
          currentIsUnderline = !!hit.isUnderline;
        } else {
          currentIsBold = false;
          currentIsItalic = false;
          currentIsUnderline = false;
        }
        hideToolOptionsPanel();
        syncOptionInputs();
        redrawAnnotations();
      } else {
        selectedAnnotation = null;
        selectedGroup = null;
        hideToolOptionsPanel();
        redrawAnnotations();
      }
      return;
    }

    hideToolOptionsPanel();
    strokePreviewPoint = null;
    eraserPreviewPoint = null;

    if (currentTool === "lasso") {
      liveLasso = [{ x: pt.x, y: pt.y }];
      selectedAnnotation = null;
      selectedGroup = null;
      redrawAnnotations();
      return;
    }

    if (currentTool === "text") {
      e.preventDefault();
      startTextEditing(pt);
      return;
    }

    if (currentTool === "pen" || currentTool === "highlighter") {
      livePath = {
        points: [{ x: pt.x, y: pt.y }],
        style: {
          color: currentColor,
          strokeWidth: currentStrokeWidth,
          opacity: currentTool === "highlighter" ? 0.38 : 1,
        },
      };
      return;
    }

    if (["rect", "ellipse", "line", "arrow"].indexOf(currentTool) !== -1) {
      dragStartPoint = pt;
      liveShape = shapeFromDrag(currentTool, pt, pt);
      return;
    }

    if (
      (currentTool === "image" || currentTool === "signature") &&
      pendingPlaceable
    ) {
      placePendingAt(pt);
      return;
    }

    if (currentTool === "stroke-eraser") {
      isErasing = true;
      erasedAny = false;
      pushHistory();
      lastErasePoint = pt;
      if (eraseStrokeAtPoint(pt, eraserSize / 2)) {
        erasedAny = true;
      }
      redrawAnnotations();
      return;
    }

    if (currentTool === "pixel-eraser") {
      isErasing = true;
      liveEraser = {
        points: [{ x: pt.x, y: pt.y }],
        size: eraserSize,
      };
      redrawAnnotations();
      return;
    }
  }

  function onPointerMove(e) {
    var pt = getCanvasPagePoint(e);
    if (!isPointerDown) {
      if (currentTool === "stroke-eraser" || currentTool === "pixel-eraser") {
        eraserPreviewPoint = pt;
        if (strokePreviewPoint) strokePreviewPoint = null;
        requestRedraw();
      } else if (currentTool === "pen" || currentTool === "highlighter") {
        strokePreviewPoint = pt;
        if (eraserPreviewPoint) eraserPreviewPoint = null;
        requestRedraw();
      } else {
        if (eraserPreviewPoint || strokePreviewPoint) {
          eraserPreviewPoint = null;
          strokePreviewPoint = null;
          requestRedraw();
        }
      }
      updateCursorStyle(e);
      return;
    }
    if (currentTool === "stroke-eraser" || currentTool === "pixel-eraser") {
      eraserPreviewPoint = pt;
      if (isErasing) {
        if (currentTool === "stroke-eraser") {
          if (
            eraseStrokeAlongSegment(lastErasePoint || pt, pt, eraserSize / 2)
          ) {
            erasedAny = true;
          }
          lastErasePoint = pt;
          requestRedraw();
        } else if (currentTool === "pixel-eraser" && liveEraser) {
          liveEraser.points.push({ x: pt.x, y: pt.y });
          requestRedraw();
        }
      }
      return;
    }
    if (currentTool === "lasso" && liveLasso) {
      liveLasso.push({ x: pt.x, y: pt.y });
      requestRedraw();
      return;
    }
    if (
      currentTool === "select" &&
      dragMode === "group-move" &&
      groupDragOrigins
    ) {
      var dx = pt.x - dragStartPoint.x;
      var dy = pt.y - dragStartPoint.y;
      groupDragOrigins.forEach(function (item) {
        var a = findAnnotation(currentPage, item.id);
        if (a) {
          applyMove(a, item.origin, dx, dy);
        }
      });
      requestRedraw();
      return;
    }
    if (
      currentTool === "select" &&
      dragMode === "group-rotate" &&
      groupDragOrigins &&
      dragCenter
    ) {
      var cScreenX = dragCenter.x * currentScale;
      var cScreenY = dragCenter.y * currentScale;
      var currentAngle = Math.atan2(pt.cy - cScreenY, pt.cx - cScreenX);
      var deltaRad = currentAngle - dragStartAngle;
      if (e.shiftKey) {
        var deg = (deltaRad * 180) / Math.PI;
        deg = Math.round(deg / 15) * 15;
        deltaRad = (deg * Math.PI) / 180;
      }
      applyGroupRotate(groupDragOrigins, dragCenter, deltaRad);
      requestRedraw();
      return;
    }
    if (
      currentTool === "select" &&
      dragMode &&
      dragMode.indexOf("group-resize-") === 0 &&
      groupDragOrigins &&
      groupOrigBounds
    ) {
      var direction = dragMode.substring(13);
      var ox = groupOrigBounds.x;
      var oy = groupOrigBounds.y;
      var ow = groupOrigBounds.w;
      var oh = groupOrigBounds.h;
      var dx = pt.x - dragStartPoint.x;
      var dy = pt.y - dragStartPoint.y;

      var newX = ox;
      var newY = oy;
      var newW = ow;
      var newH = oh;

      if (direction.indexOf("l") !== -1) {
        newX = ox + dx;
        newW = ow - dx;
      }
      if (direction.indexOf("r") !== -1) {
        newW = ow + dx;
      }
      if (direction.indexOf("t") !== -1) {
        newY = oy + dy;
        newH = oh - dy;
      }
      if (direction.indexOf("b") !== -1) {
        newH = oh + dy;
      }

      var minW = 10;
      var minH = 10;
      if (newW < minW) {
        if (direction.indexOf("l") !== -1) newX = ox + ow - minW;
        newW = minW;
      }
      if (newH < minH) {
        if (direction.indexOf("t") !== -1) newY = oy + oh - minH;
        newH = minH;
      }

      if (direction === "t" || direction === "b") {
        var s = newH / oh;
        newW = Math.max(minW, ow * s);
        newX = ox + (ow - newW) / 2;
      } else if (direction === "l" || direction === "r") {
        var s = newW / ow;
        newH = Math.max(minH, oh * s);
        newY = oy + (oh - newH) / 2;
      } else {
        var s = newW / ow;
        newH = Math.max(minH, oh * s);
        if (direction === "tl") {
          newX = ox + ow - newW;
          newY = oy + oh - newH;
        } else if (direction === "tr") {
          newX = ox;
          newY = oy + oh - newH;
        } else if (direction === "bl") {
          newX = ox + ow - newW;
          newY = oy;
        } else if (direction === "br") {
          newX = ox;
          newY = oy;
        }
      }

      applyGroupResize(groupDragOrigins, groupOrigBounds, {
        x: newX,
        y: newY,
        w: newW,
        h: newH,
      });
      requestRedraw();
      return;
    }
    if (currentTool === "select" && dragMode) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (!ann) {
        return;
      }
      if (dragMode === "rotate") {
        var cScreenX = dragCenter.x * currentScale;
        var cScreenY = dragCenter.y * currentScale;
        var currentAngle = Math.atan2(pt.cy - cScreenY, pt.cx - cScreenX);
        var deltaRad = currentAngle - dragStartAngle;
        var deltaDeg = (deltaRad * 180) / Math.PI;
        var rawRot = (dragOrigin.rotation || 0) + deltaDeg;
        if (e.shiftKey) {
          rawRot = Math.round(rawRot / 15) * 15;
        }
        var norm = Math.round(rawRot);
        while (norm > 180) norm -= 360;
        while (norm <= -180) norm += 360;

        ann.rotation = norm;
        var rotInput = document.getElementById("rotation-val");
        if (rotInput) rotInput.value = norm;
        requestRedraw();
        return;
      }

      var dx = pt.x - dragStartPoint.x,
        dy = pt.y - dragStartPoint.y;

      if (dragMode === "move") {
        applyMove(ann, dragOrigin, dx, dy);
      } else if (dragMode.indexOf("resize-") === 0) {
        var direction = dragMode.substring(7);
        var origBounds = getBounds(dragOrigin);
        var ox = origBounds.x,
          oy = origBounds.y,
          ow = origBounds.w,
          oh = origBounds.h;

        var newX = ox,
          newY = oy,
          newW = ow,
          newH = oh;

        if (direction.indexOf("l") !== -1) {
          newX = ox + dx;
          newW = ow - dx;
        }
        if (direction.indexOf("r") !== -1) {
          newW = ow + dx;
        }
        if (direction.indexOf("t") !== -1) {
          newY = oy + dy;
          newH = oh - dy;
        }
        if (direction.indexOf("b") !== -1) {
          newH = oh + dy;
        }

        var minW = 10;
        var minH = 10;

        if (newW < minW) {
          if (direction.indexOf("l") !== -1) newX = ox + ow - minW;
          newW = minW;
        }
        if (newH < minH) {
          if (direction.indexOf("t") !== -1) newY = oy + oh - minH;
          newH = minH;
        }

        if (
          ann.type === "image" ||
          ann.type === "path" ||
          ann.type === "text"
        ) {
          var ratio = oh / ow;

          if (direction === "t" || direction === "b") {
            var s = newH / oh;
            newW = ow * s;
            if (newW < minW) {
              newW = minW;
              newH = minW * ratio;
              if (direction === "t") newY = oy + oh - newH;
            }
            newX = ox;
          } else if (direction === "l" || direction === "r") {
            var s = newW / ow;
            newH = oh * s;
            if (newH < minH) {
              newH = minH;
              newW = minH / ratio;
              if (direction === "l") newX = ox + ow - newW;
            }
            newY = oy;
          } else {
            var s = newW / ow;
            newH = oh * s;
            if (newH < minH) {
              newH = minH;
              newW = minH / ratio;
            }
            if (direction === "tl") {
              newX = ox + ow - newW;
              newY = oy + oh - newH;
            } else if (direction === "tr") {
              newX = ox;
              newY = oy + oh - newH;
            } else if (direction === "bl") {
              newX = ox + ow - newW;
              newY = oy;
            } else if (direction === "br") {
              newX = ox;
              newY = oy;
            }
          }
        }

        applyBoundsResize(ann, dragOrigin, {
          x: newX,
          y: newY,
          w: newW,
          h: newH,
        });

        if (ann.type === "text" && ann.fontSize !== undefined) {
          currentFontSize = ann.fontSize;
          var fsInput = document.getElementById("font-size");
          if (fsInput) fsInput.value = currentFontSize;
        }
      }
      requestRedraw();
      return;
    }
    if (livePath) {
      var lastPt = livePath.points[livePath.points.length - 1];
      var dist = Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y);
      if (dist >= 1.0) {
        var weight = Math.min(0.88, Math.max(0.48, dist / 10));
        var smoothedPt = {
          x: lastPt.x + (pt.x - lastPt.x) * weight,
          y: lastPt.y + (pt.y - lastPt.y) * weight,
        };
        livePath.points.push(smoothedPt);
        requestRedraw();
      }
      return;
    }
    if (liveShape && dragStartPoint) {
      liveShape = shapeFromDrag(currentTool, dragStartPoint, pt);
      requestRedraw();
      return;
    }
  }

  function onPointerUp(e) {
    if (!isPointerDown) {
      return;
    }
    isPointerDown = false;
    var pt = e ? getCanvasPagePoint(e) : null;
    if (currentTool === "stroke-eraser") {
      if (isErasing) {
        isErasing = false;
        lastErasePoint = null;
        if (!erasedAny) {
          history.pop();
        } else {
          scheduleDBSave();
        }
        redrawAnnotations();
      }
      return;
    }
    if (currentTool === "pixel-eraser") {
      if (liveEraser) {
        if (liveEraser.points.length > 0) {
          pushHistory();
          var modified = applyPixelErasureToAnnotations(
            liveEraser.points,
            (liveEraser.size || 20) / 2,
            currentPage,
          );
          if (modified) {
            scheduleDBSave();
          } else {
            history.pop();
          }
        }
        liveEraser = null;
        isErasing = false;
        redrawAnnotations();
      }
      return;
    }
    if (currentTool === "lasso") {
      if (liveLasso && liveLasso.length > 2) {
        cleanPageAnnotations(currentPage);
        var pageAnns = annotationsByPage[currentPage] || [];
        var captured = pageAnns.filter(function (a) {
          return isAnnotationInPolygon(a, liveLasso);
        });

        if (captured.length === 0) {
          selectedAnnotation = null;
          selectedGroup = null;
          if (window.showToast) {
            window.showToast("No elements captured by lasso");
          }
        } else if (captured.length === 1) {
          selectedAnnotation = { page: currentPage, id: captured[0].id };
          selectedGroup = null;
          setActiveTool("select", true);
        } else {
          selectedGroup = {
            page: currentPage,
            ids: captured.map(function (a) {
              return a.id;
            }),
          };
          selectedAnnotation = null;
          setActiveTool("select", true);
        }
      }
      liveLasso = null;
      redrawAnnotations();
      return;
    }
    if (currentTool === "select") {
      if (dragMode && dragMode.indexOf("group-") === 0) {
        scheduleDBSave();
      }
      dragMode = null;
      dragOrigin = null;
      dragCenter = null;
      dragStartAngle = 0;
      groupDragOrigins = null;
      groupOrigBounds = null;

      if (selectedAnnotation || selectedGroup) {
        updateToolOptionsPanel("select");
      } else {
        hideToolOptionsPanel();
      }
      return;
    }
    if (livePath) {
      if (livePath.points.length >= 1) {
        if (pt) {
          var last = livePath.points[livePath.points.length - 1];
          if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 0.5) {
            livePath.points.push({ x: pt.x, y: pt.y });
          }
        }
        var smoothedPoints =
          livePath.points.length > 2
            ? smoothStrokePoints(livePath.points)
            : livePath.points;
        var pathAnn = {
          id: nextId(),
          type: "path",
          page: currentPage,
          points: smoothedPoints,
          color: livePath.style.color,
          strokeWidth: livePath.style.strokeWidth,
          opacity: livePath.style.opacity,
        };
        addAnnotation(currentPage, pathAnn);
      }
      livePath = null;
      redrawAnnotations();
      return;
    }
    if (liveShape) {
      var b = getBounds(liveShape);
      if (b.w > 3 || b.h > 3) {
        var shapeAnn = Object.assign(
          { id: nextId(), page: currentPage },
          liveShape,
        );
        addAnnotation(currentPage, shapeAnn);
      }
      liveShape = null;
      dragStartPoint = null;
      redrawAnnotations();
      return;
    }
  }

  /* ---------- export ---------- */
  function hexToRgb01(hex) {
    var h = (hex || "#000000").replace("#", "");
    return [
      parseInt(h.substring(0, 2), 16) / 255,
      parseInt(h.substring(2, 4), 16) / 255,
      parseInt(h.substring(4, 6), 16) / 255,
    ];
  }
  function dataUrlToBytes(dataUrl) {
    var base64 = dataUrl.split(",")[1];
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  function drawArrowOnPdf(page, ann, pageHeight, color) {
    var y1 = pageHeight - ann.y1,
      y2 = pageHeight - ann.y2;
    page.drawLine({
      start: { x: ann.x1, y: y1 },
      end: { x: ann.x2, y: y2 },
      thickness: ann.strokeWidth,
      color: color,
    });
    var angle = Math.atan2(y2 - y1, ann.x2 - ann.x1);
    var headLen = Math.max(10, ann.strokeWidth * 3.2);
    var spread = Math.PI / 7;
    var hx1 = ann.x2 - headLen * Math.cos(angle - spread),
      hy1 = y2 - headLen * Math.sin(angle - spread);
    var hx2 = ann.x2 - headLen * Math.cos(angle + spread),
      hy2 = y2 - headLen * Math.sin(angle + spread);
    page.drawLine({
      start: { x: ann.x2, y: y2 },
      end: { x: hx1, y: hy1 },
      thickness: ann.strokeWidth,
      color: color,
    });
    page.drawLine({
      start: { x: ann.x2, y: y2 },
      end: { x: hx2, y: hy2 },
      thickness: ann.strokeWidth,
      color: color,
    });
  }
  function drawAnnotationOnPdf(
    pdfLibDoc,
    page,
    ann,
    pageHeight,
    fonts,
    rgb,
    imageCache,
  ) {
    var rgbArr = hexToRgb01(ann.color);
    var color = rgb(rgbArr[0], rgbArr[1], rgbArr[2]);
    var rotDeg = ann.rotation || 0;
    var pdfRot =
      window.PDFLib && window.PDFLib.degrees
        ? window.PDFLib.degrees(-rotDeg)
        : null;
    var pdfRad = (-rotDeg * Math.PI) / 180;
    var p;

    switch (ann.type) {
      case "text": {
        var fontToUse = fonts.regular;
        if (ann.isBold && ann.isItalic) {
          fontToUse = fonts.boldItalic;
        } else if (ann.isBold) {
          fontToUse = fonts.bold;
        } else if (ann.isItalic) {
          fontToUse = fonts.italic;
        }

        var textWidth = fontToUse.widthOfTextAtSize(ann.text, ann.fontSize);
        var textHeight = ann.fontSize;
        var cx_pdf = ann.x + textWidth / 2;
        var cy_pdf = pageHeight - (ann.y + textHeight / 2);

        var rx =
          cx_pdf -
          ((textWidth / 2) * Math.cos(pdfRad) -
            (textHeight / 2) * Math.sin(pdfRad));
        var ry =
          cy_pdf -
          ((textWidth / 2) * Math.sin(pdfRad) +
            (textHeight / 2) * Math.cos(pdfRad));

        var drawOpts = {
          x: rx,
          y: ry,
          size: ann.fontSize,
          font: fontToUse,
          color: color,
        };
        if (rotDeg !== 0 && pdfRot) drawOpts.rotate = pdfRot;

        page.drawText(ann.text, drawOpts);

        // Underline support on PDF
        if (ann.isUnderline) {
          var underlineY_rel = -(ann.fontSize * 0.1);
          var u_start_x =
            cx_pdf -
            ((textWidth / 2) * Math.cos(pdfRad) -
              underlineY_rel * Math.sin(pdfRad));
          var u_start_y =
            cy_pdf -
            ((textWidth / 2) * Math.sin(pdfRad) +
              underlineY_rel * Math.cos(pdfRad));
          var u_end_x =
            cx_pdf -
            ((-textWidth / 2) * Math.cos(pdfRad) -
              underlineY_rel * Math.sin(pdfRad));
          var u_end_y =
            cy_pdf -
            ((-textWidth / 2) * Math.sin(pdfRad) +
              underlineY_rel * Math.cos(pdfRad));

          page.drawLine({
            start: { x: u_start_x, y: u_start_y },
            end: { x: u_end_x, y: u_end_y },
            thickness: Math.max(1, ann.fontSize * 0.08),
            color: color,
          });
        }
        return Promise.resolve();
      }
      case "rect": {
        var w = ann.width,
          h = ann.height;
        var cx_pdf = ann.x + w / 2;
        var cy_pdf = pageHeight - (ann.y + h / 2);

        var rx =
          cx_pdf - ((w / 2) * Math.cos(pdfRad) - (h / 2) * Math.sin(pdfRad));
        var ry =
          cy_pdf - ((w / 2) * Math.sin(pdfRad) + (h / 2) * Math.cos(pdfRad));

        var drawOpts = {
          x: rx,
          y: ry,
          width: w,
          height: h,
          borderColor: color,
          borderWidth: ann.strokeWidth,
        };
        if (rotDeg !== 0 && pdfRot) drawOpts.rotate = pdfRot;

        page.drawRectangle(drawOpts);
        return Promise.resolve();
      }
      case "ellipse": {
        var drawOpts = {
          x: ann.cx,
          y: pageHeight - ann.cy,
          xScale: ann.rx,
          yScale: ann.ry,
          borderColor: color,
          borderWidth: ann.strokeWidth,
        };
        if (rotDeg !== 0 && pdfRot) drawOpts.rotate = pdfRot;
        page.drawEllipse(drawOpts);
        return Promise.resolve();
      }
      case "line": {
        if (rotDeg !== 0) {
          var cx = (ann.x1 + ann.x2) / 2,
            cy = (ann.y1 + ann.y2) / 2;
          var rad = (rotDeg * Math.PI) / 180;
          var p1 = {
            x:
              cx +
              (ann.x1 - cx) * Math.cos(rad) -
              (ann.y1 - cy) * Math.sin(rad),
            y:
              cy +
              (ann.x1 - cx) * Math.sin(rad) +
              (ann.y1 - cy) * Math.cos(rad),
          };
          var p2 = {
            x:
              cx +
              (ann.x2 - cx) * Math.cos(rad) -
              (ann.y2 - cy) * Math.sin(rad),
            y:
              cy +
              (ann.x2 - cx) * Math.sin(rad) +
              (ann.y2 - cy) * Math.cos(rad),
          };
          page.drawLine({
            start: { x: p1.x, y: pageHeight - p1.y },
            end: { x: p2.x, y: pageHeight - p2.y },
            thickness: ann.strokeWidth,
            color: color,
          });
        } else {
          page.drawLine({
            start: { x: ann.x1, y: pageHeight - ann.y1 },
            end: { x: ann.x2, y: pageHeight - ann.y2 },
            thickness: ann.strokeWidth,
            color: color,
          });
        }
        return Promise.resolve();
      }
      case "arrow": {
        if (rotDeg !== 0) {
          var cx = (ann.x1 + ann.x2) / 2,
            cy = (ann.y1 + ann.y2) / 2;
          var rad = (rotDeg * Math.PI) / 180;
          var rotAnn = Object.assign({}, ann, {
            x1:
              cx +
              (ann.x1 - cx) * Math.cos(rad) -
              (ann.y1 - cy) * Math.sin(rad),
            y1:
              cy +
              (ann.x1 - cx) * Math.sin(rad) +
              (ann.y1 - cy) * Math.cos(rad),
            x2:
              cx +
              (ann.x2 - cx) * Math.cos(rad) -
              (ann.y2 - cy) * Math.sin(rad),
            y2:
              cy +
              (ann.x2 - cx) * Math.sin(rad) +
              (ann.y2 - cy) * Math.cos(rad),
          });
          drawArrowOnPdf(page, rotAnn, pageHeight, color);
        } else {
          drawArrowOnPdf(page, ann, pageHeight, color);
        }
        return Promise.resolve();
      }
      case "path": {
        if (ann.points && ann.points.length > 0) {
          var pts = ann.points;
          if (rotDeg !== 0) {
            var b = getBounds(ann);
            var cx = b.x + b.w / 2,
              cy = b.y + b.h / 2;
            var rad = (rotDeg * Math.PI) / 180;
            pts = ann.points.map(function (p) {
              return {
                x: cx + (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad),
                y: cy + (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad),
              };
            });
          }
          var svgPathString = "";
          if (pts.length === 1) {
            svgPathString =
              "M " +
              pts[0].x +
              "," +
              pts[0].y +
              " L " +
              (pts[0].x + 0.1) +
              "," +
              pts[0].y;
          } else if (pts.length === 2) {
            svgPathString =
              "M " +
              pts[0].x +
              "," +
              pts[0].y +
              " L " +
              pts[1].x +
              "," +
              pts[1].y;
          } else {
            svgPathString = "M " + pts[0].x + "," + pts[0].y;
            for (var k = 1; k < pts.length - 1; k++) {
              var midX = (pts[k].x + pts[k + 1].x) / 2;
              var midY = (pts[k].y + pts[k + 1].y) / 2;
              svgPathString +=
                " Q " +
                pts[k].x.toFixed(2) +
                "," +
                pts[k].y.toFixed(2) +
                " " +
                midX.toFixed(2) +
                "," +
                midY.toFixed(2);
            }
            svgPathString +=
              " L " +
              pts[pts.length - 1].x.toFixed(2) +
              "," +
              pts[pts.length - 1].y.toFixed(2);
          }
          page.drawSvgPath(svgPathString, {
            x: 0,
            y: pageHeight,
            borderColor: color,
            borderWidth: ann.strokeWidth,
            borderOpacity: ann.opacity != null ? ann.opacity : 1,
            borderLineCap:
              window.PDFLib &&
              window.PDFLib.LineCapStyle &&
              window.PDFLib.LineCapStyle.Round !== undefined
                ? window.PDFLib.LineCapStyle.Round
                : 1,
          });
        }
        return Promise.resolve();
      }
      case "image": {
        if (imageCache && imageCache[ann.dataUrl]) {
          p = imageCache[ann.dataUrl];
        } else {
          p =
            ann.dataUrl.indexOf("image/png") !== -1
              ? pdfLibDoc.embedPng(dataUrlToBytes(ann.dataUrl))
              : pdfLibDoc.embedJpg(dataUrlToBytes(ann.dataUrl));
          if (imageCache) {
            imageCache[ann.dataUrl] = p;
          }
        }
        return p.then(function (embedded) {
          var w = ann.width,
            h = ann.height;
          var cx_pdf = ann.x + w / 2;
          var cy_pdf = pageHeight - (ann.y + h / 2);

          var rx =
            cx_pdf - ((w / 2) * Math.cos(pdfRad) - (h / 2) * Math.sin(pdfRad));
          var ry =
            cy_pdf - ((w / 2) * Math.sin(pdfRad) + (h / 2) * Math.cos(pdfRad));

          var drawOpts = {
            x: rx,
            y: ry,
            width: w,
            height: h,
          };
          if (rotDeg !== 0 && pdfRot) drawOpts.rotate = pdfRot;

          page.drawImage(embedded, drawOpts);
        });
      }
      default:
        return Promise.resolve();
    }
  }
  function exportPdf() {
    if (!currentFileBlob) {
      return;
    }
    var btn = document.getElementById("download-btn");
    var oldLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing your file…";
    ensureLibraries()
      .then(function () {
        return currentFileBlob.arrayBuffer();
      })
      .then(function (sourceBytes) {
        var PDFLibNS = window.PDFLib;
        return PDFLibNS.PDFDocument.load(sourceBytes).then(
          function (pdfLibDoc) {
            var embedHelvetica = pdfLibDoc.embedFont(
              PDFLibNS.StandardFonts.Helvetica,
            );
            var embedHelveticaBold = pdfLibDoc.embedFont(
              PDFLibNS.StandardFonts.HelveticaBold,
            );
            var embedHelveticaOblique = pdfLibDoc.embedFont(
              PDFLibNS.StandardFonts.HelveticaOblique,
            );
            var embedHelveticaBoldOblique = pdfLibDoc.embedFont(
              PDFLibNS.StandardFonts.HelveticaBoldOblique,
            );

            return Promise.all([
              embedHelvetica,
              embedHelveticaBold,
              embedHelveticaOblique,
              embedHelveticaBoldOblique,
            ]).then(function (fonts) {
              var helv = fonts[0];
              var helvBold = fonts[1];
              var helvOblique = fonts[2];
              var helvBoldOblique = fonts[3];

              var fontMap = {
                regular: helv,
                bold: helvBold,
                italic: helvOblique,
                boldItalic: helvBoldOblique,
              };
              // Shared for the whole export: a signature or logo stamped on many
              // pages gets embedded as a PDF image object once and reused, instead
              // of once per occurrence.
              var embeddedImageCache = {};

              var pages = pdfLibDoc.getPages();
              var chain = Promise.resolve();
              pages.forEach(function (page, i) {
                var pageNum = i + 1;
                var pageHeight = page.getHeight();
                var pageWidth = page.getWidth();
                var anns = annotationsByPage[pageNum] || [];
                var hasEraser = anns.some(function (a) {
                  return a.type === "eraser";
                });

                if (hasEraser) {
                  chain = chain.then(function () {
                    var exportScale = 2;
                    var offscreen = document.createElement("canvas");
                    offscreen.width = Math.round(pageWidth * exportScale);
                    offscreen.height = Math.round(pageHeight * exportScale);
                    var octx = offscreen.getContext("2d");
                    octx.clearRect(0, 0, offscreen.width, offscreen.height);

                    anns.forEach(function (ann) {
                      drawAnnotation(octx, ann, exportScale);
                    });

                    var dataUrl = offscreen.toDataURL("image/png");
                    return pdfLibDoc
                      .embedPng(dataUrlToBytes(dataUrl))
                      .then(function (embeddedPng) {
                        page.drawImage(embeddedPng, {
                          x: 0,
                          y: 0,
                          width: pageWidth,
                          height: pageHeight,
                        });
                      });
                  });
                } else {
                  anns.forEach(function (ann) {
                    chain = chain.then(function () {
                      return drawAnnotationOnPdf(
                        pdfLibDoc,
                        page,
                        ann,
                        pageHeight,
                        fontMap,
                        PDFLibNS.rgb,
                        embeddedImageCache,
                      );
                    });
                  });
                }
              });
              return chain.then(function () {
                return pdfLibDoc.save();
              });
            });
          },
        );
      })
      .then(function (bytes) {
        var blob = new Blob([bytes], { type: "application/pdf" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        var base = (fileName || "document.pdf").replace(/\.pdf$/i, "");
        a.href = url;
        a.download = base + "-edited.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 4000);
        window.showToast("Your edited PDF is downloading.");
      })
      .catch(function (err) {
        console.error(err);
        var msg = ((err && err.message) || "").toLowerCase();
        window.showToast(
          msg.indexOf("encrypt") !== -1
            ? "This PDF is encrypted and can't be saved with new edits."
            : "Something went wrong while saving. Please try again.",
        );
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = oldLabel;
      });
  }
  function resetEditor() {
    finalizeAnyOpenTextBox();
    destroyCurrentDocument();
    currentFileBlob = null;
    fileBlobPersisted = false;
    fileName = "";
    annotationsByPage = {};
    history = [];
    redoHistoryStack = [];
    imageElCache = {};
    selectedAnnotation = null;
    currentPage = 1;
    numPages = 1;
    zoomFactor = 1;
    pendingPlaceable = null;
    document.getElementById("file-input").value = "";
    clearSessionFromDB();
    showHero();
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

  document
    .getElementById("image-input")
    .addEventListener("change", function (e) {
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

  document.getElementById("sig-close").addEventListener("click", function () {
    closeSignatureModal(true);
  });
  document.getElementById("sig-overlay").addEventListener("click", function () {
    closeSignatureModal(true);
  });
  document.getElementById("sig-clear").addEventListener("click", function () {
    if (sigActiveTab === "type") {
      var input = document.getElementById("sig-type-input");
      if (input) {
        input.value = "";
        input.dispatchEvent(new Event("input"));
      }
    } else if (sigActiveTab === "draw") {
      if (sigCtx) {
        var c = document.getElementById("sig-canvas");
        sigCtx.clearRect(0, 0, c.width, c.height);
      }
      sigHasDrawn = false;
    } else if (sigActiveTab === "upload") {
      sigUploadedDataUrl = null;
      sigOriginalFile = null;
      sigOriginalDataUrl = null;
      sigProcessedDataUrl = null;
      var fileInput = document.getElementById("sig-upload-input");
      if (fileInput) fileInput.value = "";
      var chk = document.getElementById("sig-bg-remove-chk");
      if (chk) chk.checked = false;
      var chkWrap = document.getElementById("sig-bg-remove-wrap");
      if (chkWrap) chkWrap.classList.add("hidden");
      var dropZone = document.getElementById("sig-drop-zone");
      if (dropZone) dropZone.classList.remove("hidden");
      var previewContainer = document.getElementById(
        "sig-upload-preview-container",
      );
      if (previewContainer) previewContainer.classList.add("hidden");
    }
  });

  document.getElementById("sig-insert").addEventListener("click", function () {
    var dataUrl = null;
    var aspect = 0.3; // Default for typed signature

    if (sigActiveTab === "type") {
      var text = document.getElementById("sig-type-input").value.trim();
      if (!text) {
        window.showToast("Please type your name first.");
        return;
      }
      dataUrl = generateTypedSignature(text, sigFontName);
      aspect = 150 / 600; // 0.25
    } else if (sigActiveTab === "draw") {
      if (!sigHasDrawn) {
        window.showToast("Please draw a signature first.");
        return;
      }
      var canvas = document.getElementById("sig-canvas");
      dataUrl = canvas.toDataURL("image/png");
      aspect = canvas.height / canvas.width;
    } else if (sigActiveTab === "upload") {
      if (!sigUploadedDataUrl) {
        window.showToast("Please upload a signature image first.");
        return;
      }
      dataUrl = sigUploadedDataUrl;
      var imgEl = document.getElementById("sig-upload-preview-img");
      if (imgEl && imgEl.naturalWidth) {
        aspect = imgEl.naturalHeight / imgEl.naturalWidth;
      } else {
        aspect = 0.5; // fallback
      }
    }

    if (!dataUrl) return;

    var w = Math.min(
      220,
      (pageDimsCache[currentPage] ? pageDimsCache[currentPage].width : 400) *
        0.45,
    );

    pendingPlaceable = {
      type: "image",
      dataUrl: dataUrl,
      width: w,
      height: w * aspect,
    };

    closeSignatureModal(false);
    window.showToast("Tap anywhere on the page to place your signature.");
  });

  // Cursive Tab Switchers
  document.querySelectorAll(".sig-tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setSigTab(btn.dataset.tab);
    });
  });

  // Type Signature Input listener
  var sigTypeInput = document.getElementById("sig-type-input");
  if (sigTypeInput) {
    sigTypeInput.addEventListener("input", function (e) {
      var val = e.target.value.trim() || "Signature";
      document
        .querySelectorAll(".sig-type-preview-card")
        .forEach(function (card) {
          card.textContent = val;
        });
    });
  }

  // Type Font Preview selector card click listener
  document.querySelectorAll(".sig-type-preview-card").forEach(function (card) {
    card.addEventListener("click", function () {
      document.querySelectorAll(".sig-type-preview-card").forEach(function (c) {
        c.classList.remove("active");
      });
      card.classList.add("active");
      sigFontName = card.dataset.font;
    });
  });

  // Signature Image Upload Handlers
  var sigDropZone = document.getElementById("sig-drop-zone");
  var sigUploadInput = document.getElementById("sig-upload-input");

  if (sigDropZone && sigUploadInput) {
    sigDropZone.addEventListener("click", function () {
      sigUploadInput.click();
    });

    sigUploadInput.addEventListener("change", function (e) {
      handleSigUploadFile(e.target.files[0]);
    });

    sigDropZone.addEventListener("dragover", function (e) {
      e.preventDefault();
      sigDropZone.style.borderColor = "var(--accent)";
      sigDropZone.style.background = "var(--accent-soft)";
    });

    sigDropZone.addEventListener("dragleave", function (e) {
      e.preventDefault();
      sigDropZone.style.borderColor = "var(--border)";
      sigDropZone.style.background = "var(--surface-2)";
    });

    sigDropZone.addEventListener("drop", function (e) {
      e.preventDefault();
      sigDropZone.style.borderColor = "var(--border)";
      sigDropZone.style.background = "var(--surface-2)";
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        handleSigUploadFile(file);
      }
    });
  }

  function handleSigUploadFile(file) {
    if (!file) return;
    if (!file.type.match("image.*")) {
      window.showToast("Please upload an image file.");
      return;
    }

    // Downscale the image to a max dimension of 1024px to prevent WASM out-of-memory crashes on low-end devices
    resizeImageIfTooLarge(file, 1024)
      .then(function (result) {
        sigOriginalFile = result.file;
        var dataUrl = result.dataUrl;

        sigOriginalDataUrl = dataUrl;
        sigUploadedDataUrl = dataUrl;
        sigProcessedDataUrl = null;

        var chk = document.getElementById("sig-bg-remove-chk");
        if (chk) chk.checked = false;

        var imgEl = document.getElementById("sig-upload-preview-img");
        imgEl.src = dataUrl;

        // Hide drop zone and show preview
        document.getElementById("sig-drop-zone").classList.add("hidden");
        document
          .getElementById("sig-upload-preview-container")
          .classList.remove("hidden");
        document
          .getElementById("sig-bg-remove-wrap")
          .classList.remove("hidden");
      })
      .catch(function (err) {
        console.error("Resizing image failed:", err);
        window.showToast("Could not process image.");
      });
  }

  // Remove uploaded image button
  var sigUploadRemove = document.getElementById("sig-upload-remove");
  if (sigUploadRemove) {
    sigUploadRemove.addEventListener("click", function (e) {
      e.stopPropagation();
      sigUploadedDataUrl = null;
      sigOriginalFile = null;
      sigOriginalDataUrl = null;
      sigProcessedDataUrl = null;
      var fileInput = document.getElementById("sig-upload-input");
      if (fileInput) fileInput.value = "";
      var chk = document.getElementById("sig-bg-remove-chk");
      if (chk) chk.checked = false;
      var chkWrap = document.getElementById("sig-bg-remove-wrap");
      if (chkWrap) chkWrap.classList.add("hidden");
      document.getElementById("sig-drop-zone").classList.remove("hidden");
      document
        .getElementById("sig-upload-preview-container")
        .classList.add("hidden");
    });
  }

  // WASM Background Removal Trigger
  var bgRemoveChk = document.getElementById("sig-bg-remove-chk");
  if (bgRemoveChk) {
    bgRemoveChk.addEventListener("change", function () {
      var isChecked = bgRemoveChk.checked;
      var imgEl = document.getElementById("sig-upload-preview-img");
      var loader = document.getElementById("sig-upload-loading-overlay");

      if (isChecked) {
        if (sigProcessedDataUrl) {
          sigUploadedDataUrl = sigProcessedDataUrl;
          imgEl.src = sigProcessedDataUrl;
        } else {
          if (!sigOriginalFile) return;
          loader.classList.remove("hidden");

          // Reset progress bar elements
          var progressContainer = document.getElementById(
            "sig-upload-progress-container",
          );
          var progressBar = document.getElementById("sig-upload-progress-bar");
          var progressText = document.getElementById(
            "sig-upload-progress-text",
          );
          var loadingStatus = document.getElementById(
            "sig-upload-loading-status",
          );

          if (progressBar) progressBar.style.width = "0%";
          if (progressText) progressText.textContent = "0%";
          if (loadingStatus) loadingStatus.textContent = "Loading WASM AI...";
          if (progressContainer) progressContainer.classList.remove("hidden");

          import("./assets/vendor/background-removal-1.5.6.esm.js")
            .catch(function () {
              return import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.6/+esm");
            })
            .then(function (module) {
              return module.removeBackground(sigOriginalFile, {
                publicPath:
                  "https://staticimgly.com/@imgly/background-removal-data/1.5.6/dist/",
                model: "isnet_quint8",
                progress: function (key, current, total) {
                  if (total && total > 0) {
                    var percentage = Math.round((current / total) * 100);
                    if (progressBar) progressBar.style.width = percentage + "%";
                    if (progressText)
                      progressText.textContent = percentage + "%";
                    if (loadingStatus) {
                      var cleanKey = key;
                      if (key.indexOf("fetch:") === 0) {
                        cleanKey =
                          "Downloading " +
                          key.substring(key.lastIndexOf("/") + 1);
                      } else if (key.indexOf("compute:") === 0) {
                        cleanKey = "Removing background...";
                      }
                      loadingStatus.textContent = cleanKey;
                    }
                  } else {
                    if (loadingStatus)
                      loadingStatus.textContent = "Removing background...";
                  }
                },
              });
            })
            .then(function (blob) {
              if (progressContainer) progressContainer.classList.add("hidden");
              return readFileAsDataURL(blob);
            })
            .then(function (dataUrl) {
              sigProcessedDataUrl = dataUrl;
              sigUploadedDataUrl = dataUrl;
              imgEl.src = dataUrl;
              loader.classList.add("hidden");
            })
            .catch(function (err) {
              console.error("WASM background removal failed:", err);
              window.showToast("Background removal failed.");
              bgRemoveChk.checked = false;
              loader.classList.add("hidden");
              if (progressContainer) progressContainer.classList.add("hidden");
            });
        }
      } else {
        sigUploadedDataUrl = sigOriginalDataUrl;
        imgEl.src = sigOriginalDataUrl;
      }
    });
  }

  document.getElementById("zoom-in").addEventListener("click", zoomIn);
  document.getElementById("zoom-out").addEventListener("click", zoomOut);
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

  var annCanvasEl = document.getElementById("annotation-canvas");
  annCanvasEl.addEventListener("pointerdown", onPointerDown);
  annCanvasEl.addEventListener("pointermove", onPointerMove);
  annCanvasEl.addEventListener("pointerleave", function () {
    if (eraserPreviewPoint || strokePreviewPoint) {
      eraserPreviewPoint = null;
      strokePreviewPoint = null;
      requestRedraw();
    }
  });
  annCanvasEl.addEventListener("dblclick", function (e) {
    if (currentTool !== "select" || !pdfDoc) return;
    var pt = getCanvasPagePoint(e);
    var hit = hitTest(pt);
    if (hit && hit.type === "text") {
      startTextEditingOf(hit);
    }
  });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

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
        var clickY = Math.max(
          0,
          Math.min(img.naturalHeight, (my - 20) / scale),
        );
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

  // Formatting Button Click Listeners
  var boldBtn = document.getElementById("format-bold");
  if (boldBtn) {
    boldBtn.addEventListener("click", function () {
      currentIsBold = !currentIsBold;
      rememberTextFormatting(currentIsBold, currentIsItalic, currentIsUnderline);
      syncOptionInputs();
      redrawAnnotations();
    });
  }
  var italicBtn = document.getElementById("format-italic");
  if (italicBtn) {
    italicBtn.addEventListener("click", function () {
      currentIsItalic = !currentIsItalic;
      rememberTextFormatting(currentIsBold, currentIsItalic, currentIsUnderline);
      syncOptionInputs();
      redrawAnnotations();
    });
  }
  var underlineBtn = document.getElementById("format-underline");
  if (underlineBtn) {
    underlineBtn.addEventListener("click", function () {
      currentIsUnderline = !currentIsUnderline;
      rememberTextFormatting(currentIsBold, currentIsItalic, currentIsUnderline);
      syncOptionInputs();
      redrawAnnotations();
    });
  }

  document.addEventListener("keydown", function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    var isInput =
      tag === "INPUT" || tag === "TEXTAREA" || !!window._activeTextBox;

    if (e.key === "Escape" && activeGroupMenu) {
      closeAllGroupMenus();
      return;
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

  /* ═══════════════════════════════════════════════════
     INDEXEDDB RECOVERY MODE LOGIC
  ═══════════════════════════════════════════════════ */
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var DB_NAME = "pdfmaster_editor_db";
      var DB_VERSION = 2;
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
        if (!db.objectStoreNames.contains("editor_data")) {
          db.createObjectStore("editor_data");
        }
        // v2: raw file bytes now live here, as a Blob, separate from annotations.
        // Written once per document instead of on every autosave.
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files");
        }
      };
      req.onsuccess = function (e) {
        resolve(e.target.result);
      };
      req.onerror = function (e) {
        reject(e.target.error);
      };
    });
    return dbPromise;
  }

  function scheduleDBSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveSessionMetaToDB();
      // Retries the (larger, one-time) file write if it hasn't succeeded yet —
      // e.g. it was still in flight or failed transiently on load.
      if (currentFileBlob && !fileBlobPersisted) {
        persistFileBlobToDB(currentFileBlob, fileName);
      }
    }, 400);
  }

  // Writes the raw PDF once as a Blob. IndexedDB stores Blobs without requiring
  // the browser to hold the whole thing in JS heap, so this is cheap even for a
  // huge file — and unlike the old approach, it never gets rewritten just because
  // the user added an annotation.
  function persistFileBlobToDB(blob, name) {
    return openDB()
      .then(function (db) {
        return new Promise(function (resolve) {
          var tx;
          try {
            tx = db.transaction(["files"], "readwrite");
          } catch (e) {
            resolve(false);
            return;
          }
          tx.objectStore("files").put(
            {
              fileName: name,
              blob: blob,
              size: blob.size,
              timestamp: Date.now(),
            },
            "current",
          );
          tx.oncomplete = function () {
            fileBlobPersisted = true;
            resolve(true);
          };
          tx.onerror = function () {
            resolve(false);
          };
          tx.onabort = function () {
            resolve(false);
          };
        });
      })
      .catch(function (err) {
        // Most likely a storage-quota error on a very large file. Editing keeps
        // working from the in-memory Blob reference either way — this only
        // affects whether the session can be recovered after a reload/crash.
        console.warn("Could not persist file to IndexedDB:", err);
        return false;
      });
  }

  // Cheap, frequent autosave: annotations + small session settings only.
  function saveSessionMetaToDB() {
    if (!currentFileBlob || !fileName) return Promise.resolve(false);
    return openDB()
      .then(function (db) {
        var tx = db.transaction(["settings", "editor_data"], "readwrite");
        var settingsStore = tx.objectStore("settings");
        var dataStore = tx.objectStore("editor_data");

        settingsStore.put(
          {
            timestamp: Date.now(),
            fileName: fileName,
            numPages: numPages,
            currentPage: currentPage,
            zoomFactor: zoomFactor,
          },
          "session",
        );

        dataStore.put(
          {
            fileName: fileName,
            annotationsByPage: annotationsByPage,
            timestamp: Date.now(),
          },
          "document",
        );

        updateRecoveryBadge(true);
        return true;
      })
      .catch(function (err) {
        console.warn("IndexedDB save failed:", err);
        return false;
      });
  }

  function loadSessionFromDB(isManual) {
    return openDB()
      .then(function (db) {
        var tx = db.transaction(
          ["settings", "editor_data", "files"],
          "readonly",
        );
        var sessionReq = tx.objectStore("settings").get("session");
        var dataReq = tx.objectStore("editor_data").get("document");
        var filesReq = tx.objectStore("files").get("current");

        return Promise.all([
          new Promise(function (res) {
            sessionReq.onsuccess = function () {
              res(sessionReq.result);
            };
            sessionReq.onerror = function () {
              res(null);
            };
          }),
          new Promise(function (res) {
            dataReq.onsuccess = function () {
              res(dataReq.result);
            };
            dataReq.onerror = function () {
              res(null);
            };
          }),
          new Promise(function (res) {
            filesReq.onsuccess = function () {
              res(filesReq.result);
            };
            filesReq.onerror = function () {
              res(null);
            };
          }),
        ]);
      })
      .then(function (results) {
        var session = results[0];
        var data = results[1];
        var filesRecord = results[2];

        // New (v2) sessions keep the blob in "files". Older (v1) sessions kept
        // the whole file as an ArrayBuffer inline in "editor_data" — read that
        // as a one-time fallback and migrate it into the new store below.
        var blob = null;
        var name = null;
        var alreadyInNewStore = false;
        if (filesRecord && filesRecord.blob) {
          blob = filesRecord.blob;
          name = filesRecord.fileName;
          alreadyInNewStore = true;
        } else if (data && data.bytes) {
          blob = new Blob([data.bytes], { type: "application/pdf" });
          name = data.fileName;
        }

        if (!blob) {
          updateRecoveryBadge(false);
          if (isManual) {
            window.showToast(
              "No stored session found in recovery storage.",
              "error",
            );
          }
          return false;
        }

        showEditor();
        return ensureLibraries()
          .then(function () {
            currentFileBlob = blob;
            fileBlobPersisted = alreadyInNewStore;
            return openPdfFromBlob(blob);
          })
          .then(function (doc) {
            pdfDoc = doc;
            numPages = doc.numPages;
            fileName = name || (data && data.fileName) || "document.pdf";
            annotationsByPage = (data && data.annotationsByPage) || {};
            Object.keys(annotationsByPage).forEach(function (p) {
              cleanPageAnnotations(p);
            });
            history = [];
            redoHistoryStack = [];
            imageElCache = {};
            selectedAnnotation = null;
            currentPage = (session && session.currentPage) || 1;
            zoomFactor = (session && session.zoomFactor) || 1;
            pageDimsCache = {};
            document.getElementById("editor-filename").textContent = fileName;
            updateUndoRedoButtons();
            setActiveTool("select");
            updateRecoveryBadge(true);
            if (!alreadyInNewStore) {
              persistFileBlobToDB(blob, fileName);
            }
            return renderPage(currentPage);
          })
          .then(function () {
            if (isManual) {
              window.showToast(
                "Restored '" +
                  fileName +
                  "' and your annotations successfully!",
                "success",
                4500,
              );
            }
            return true;
          });
      })
      .catch(function (err) {
        console.warn("IndexedDB load failed:", err);
        if (isManual) {
          window.showToast("Could not access recovery storage.", "error");
        }
        return false;
      });
  }

  function clearSessionFromDB() {
    return openDB()
      .then(function (db) {
        var tx = db.transaction(
          ["settings", "editor_data", "files"],
          "readwrite",
        );
        tx.objectStore("settings").clear();
        tx.objectStore("editor_data").clear();
        tx.objectStore("files").clear();
        updateRecoveryBadge(false);
      })
      .catch(function (err) {
        console.warn("IndexedDB clear failed:", err);
      });
  }

  function checkStoredSessionAvailable(notifyOnFound) {
    return openDB()
      .then(function (db) {
        var tx = db.transaction(["editor_data", "files"], "readonly");
        var dataReq = tx.objectStore("editor_data").get("document");
        var filesReq = tx.objectStore("files").get("current");
        return Promise.all([
          new Promise(function (res) {
            dataReq.onsuccess = function () {
              res(dataReq.result);
            };
            dataReq.onerror = function () {
              res(null);
            };
          }),
          new Promise(function (res) {
            filesReq.onsuccess = function () {
              res(filesReq.result);
            };
            filesReq.onerror = function () {
              res(null);
            };
          }),
        ]);
      })
      .then(function (results) {
        var data = results[0];
        var filesRecord = results[1];
        var hasData = !!(
          (filesRecord && filesRecord.blob) ||
          (data && data.bytes)
        );
        updateRecoveryBadge(hasData);
        if (hasData && notifyOnFound && !currentFileBlob) {
          var storedName =
            (filesRecord && filesRecord.fileName) || (data && data.fileName);
          var name = storedName ? "'" + storedName + "'" : "Previous document";
          window.showToast(
            "Last session (" + name + ") is available. Click to restore.",
            "info",
            8000,
            function () {
              loadSessionFromDB(true);
            },
            "Restore",
          );
        }
        return hasData;
      })
      .catch(function () {
        updateRecoveryBadge(false);
        return false;
      });
  }

  function updateRecoveryBadge(hasData) {
    var badge = document.getElementById("recoveryBadge");
    if (badge) {
      badge.style.display = hasData ? "block" : "none";
    }
  }

  var recoveryBtn = document.getElementById("recoveryBtn");
  if (recoveryBtn) {
    recoveryBtn.addEventListener("click", function () {
      loadSessionFromDB(true);
    });
  }

  // Check stored session on startup
  checkStoredSessionAvailable(true);
})();
