(function () {
  "use strict";

  /* ---------- state ---------- */
  var pdfDoc = null,
    originalBytes = null,
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
  var selectedAnnotation = null;
  var currentTool = "select",
    lastActiveDrawingTool = null,
    currentColor = "#e8372a",
    currentStrokeWidth = 3,
    currentFontSize = 18;
  var currentIsBold = false,
    currentIsItalic = false,
    currentIsUnderline = false;
  var isPointerDown = false,
    dragMode = null,
    dragOrigin = null,
    dragStartPoint = null;
  var livePath = null,
    liveShape = null,
    pendingPlaceable = null;
  var librariesLoaded = false,
    librariesLoading = null;
  var sigDrawing = false,
    sigHasDrawn = false,
    sigCtx = null;
  var measCanvas = null,
    measCtx = null;
  var resizeTimer = null;

  /* ---------- cropping state ---------- */
  var cropState = {
    img: null,
    ann: null,
    cropRect: null,
    scale: 1,
    activeHandle: null,
    dragStart: { x: 0, y: 0 },
    startCropRect: null,
    drawCrop: null
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
  var TOOL_DEFAULTS = {
    pen: { width: 3 },
    highlighter: { width: 14, color: "#f6c344" },
    rect: { width: 3 },
    ellipse: { width: 3 },
    line: { width: 3 },
    arrow: { width: 3 },
  };
  var ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];
  var PDFJS_SOURCES = [
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
    {
      lib: "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js",
      worker: "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
    },
  ];
  var PDFLIB_SOURCES = [
    "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
    "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  ];

  function nextId() {
    idCounter += 1;
    return "a" + idCounter + "_" + Date.now().toString(36);
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
    var i = 0;
    function attempt() {
      if (i >= PDFJS_SOURCES.length) {
        return Promise.reject(new Error("pdf.js failed to load"));
      }
      var src = PDFJS_SOURCES[i];
      i += 1;
      return loadScript(src.lib).then(
        function () {
          if (window.pdfjsLib) {
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
    var i = 0;
    function attempt() {
      if (i >= PDFLIB_SOURCES.length) {
        return Promise.reject(new Error("pdf-lib failed to load"));
      }
      var src = PDFLIB_SOURCES[i];
      i += 1;
      return loadScript(src).then(
        function () {
          if (window.PDFLib) {
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
        return file.arrayBuffer();
      })
      .then(function (buf) {
        originalBytes = buf;
        var task = window.pdfjsLib.getDocument({ data: buf.slice(0) });
        return task.promise;
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
        return renderPage(1);
      })
      .catch(function (err) {
        console.error(err);
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
    return pdfDoc.getPage(pageNum).then(function (page) {
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
          redrawAnnotations();
          document.getElementById("page-indicator").textContent =
            "Page " + currentPage + " of " + numPages;
          document.getElementById("prev-page").disabled = currentPage <= 1;
          document.getElementById("next-page").disabled =
            currentPage >= numPages;
          document.getElementById("zoom-level").textContent =
            Math.round(zoomFactor * 100) + "%";
          document.getElementById("loading-panel").classList.add("hidden");
          document.getElementById("canvas-frame").classList.remove("hidden");
        });
    });
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
      case "path": {
        var minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        ann.points.forEach(function (p) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
        return {
          x: minX,
          y: minY,
          w: Math.max(maxX - minX, 2),
          h: Math.max(maxY - minY, 2),
        };
      }
      case "image":
        return { x: ann.x, y: ann.y, w: ann.width, h: ann.height };
      default:
        return { x: 0, y: 0, w: 0, h: 0 };
    }
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
  function hitTest(pt) {
    var list = annotationsByPage[currentPage] || [];
    var tol = 6 / currentScale;
    for (var i = list.length - 1; i >= 0; i--) {
      var ann = list[i];
      if (ann.type === "line" || ann.type === "arrow") {
        if (
          distToSegment(
            pt,
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
            distToSegment(pt, ann.points[k], ann.points[k + 1]) <=
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
        pt.x >= b.x - tol &&
        pt.x <= b.x + b.w + tol &&
        pt.y >= b.y - tol &&
        pt.y <= b.y + b.h + tol
      ) {
        return ann;
      }
    }
    return null;
  }
  function getSelectionHandles(ann, scale) {
    var b = getBounds(ann);
    var x = b.x * scale,
      y = b.y * scale,
      w = b.w * scale,
      h = b.h * scale;
    var deleteBtn = { x: x + w + 8, y: y - 8, r: 11 };
    var cropBtn = (ann.type === "image") ? { x: x - 8, y: y - 8, r: 11 } : null;

    return {
      box: { x: x, y: y, w: w, h: h },
      deleteBtn: deleteBtn,
      cropBtn: cropBtn,
      // Corners
      tl: { x: x, y: y, size: 8 },
      tr: { x: x + w, y: y, size: 8 },
      br: { x: x + w, y: y + h, size: 8 },
      bl: { x: x, y: y + h, size: 8 },
      // Sides
      t: { x: x + w / 2, y: y, size: 8 },
      b: { x: x + w / 2, y: y + h, size: 8 },
      l: { x: x, y: y + h / 2, size: 8 },
      r: { x: x + w, y: y + h / 2, size: 8 }
    };
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
    switch (ann.type) {
      case "text": {
        if (ann.isEditing) break;
        var style = "";
        if (ann.isItalic) style += "italic ";
        if (ann.isBold) style += "bold ";
        ctx.font = style + (ann.fontSize * scale) + "px 'DM Sans', sans-serif";
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
        if (ann.points && ann.points.length > 1) {
          ctx.globalAlpha = ann.opacity != null ? ann.opacity : 1;
          ctx.strokeStyle = ann.color;
          ctx.lineWidth = Math.max(1, ann.strokeWidth * scale);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(ann.points[0].x * scale, ann.points[0].y * scale);
          for (var i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x * scale, ann.points[i].y * scale);
          }
          ctx.stroke();
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
    var handles = getSelectionHandles(ann, scale);
    var b = handles.box;
    ctx.save();
    ctx.strokeStyle = "#e8372a";
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    ctx.setLineDash([]);
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

    // Draw crop button handle if available
    if (handles.cropBtn) {
      ctx.beginPath();
      ctx.arc(
        handles.cropBtn.x,
        handles.cropBtn.y,
        handles.cropBtn.r,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = "#2563eb"; // Sleek accent blue color for crop
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      // Draw a tiny crop icon
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
      handles.tl, handles.tr, handles.br, handles.bl,
      handles.t, handles.b, handles.l, handles.r
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
  function redrawAnnotations() {
    var canvas = document.getElementById("annotation-canvas");
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann) {
        drawSelectionUI(ctx, ann, currentScale);
      }
    }
  }

  /* ---------- annotation mutation + undo/redo ---------- */
  function pushHistory() {
    history.push(JSON.parse(JSON.stringify(annotationsByPage)));
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
    pushHistory();
    annotationsByPage[page] = (annotationsByPage[page] || []).filter(
      function (a) {
        return a.id !== id;
      },
    );
    if (selectedAnnotation && selectedAnnotation.id === id) {
      selectedAnnotation = null;
      if (lastActiveDrawingTool) {
        setActiveTool(lastActiveDrawingTool);
      } else {
        updateToolOptionsPanel("select");
      }
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
    redoHistoryStack.push(JSON.parse(JSON.stringify(annotationsByPage)));
    annotationsByPage = history.pop();
    selectedAnnotation = null;
    redrawAnnotations();
    updateUndoRedoButtons();
  }
  function redo() {
    if (redoHistoryStack.length === 0) {
      return;
    }
    history.push(JSON.parse(JSON.stringify(annotationsByPage)));
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
        selectedAnnotation = { page: currentPage, id: ann.id };
      } else {
        pushHistory();
        deleteAnnotation(currentPage, ann.id);
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
          isUnderline: currentIsUnderline
        };
        addAnnotation(currentPage, ann);
        selectedAnnotation = { page: currentPage, id: ann.id };
        setActiveTool("select");
        redrawAnnotations();
      }
    }
  }

  function startTextEditingOf(ann) {
    finalizeAnyOpenTextBox();
    var frame = document.getElementById("canvas-frame");
    var box = document.createElement("textarea");
    box.className = "text-edit-box";
    
    box.style.left = (ann.x * currentScale) + "px";
    box.style.top = (ann.y * currentScale) + "px";
    box.style.fontSize = (ann.fontSize * currentScale) + "px";
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
    if (isPointerDown || currentTool !== "select" || !pdfDoc) return;
    var canvas = document.getElementById("annotation-canvas");
    if (!canvas) return;

    var pt = getCanvasPagePoint(e);
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann) {
        var handles = getSelectionHandles(ann, currentScale);
        
        if (Math.hypot(pt.cx - handles.deleteBtn.x, pt.cy - handles.deleteBtn.y) <= handles.deleteBtn.r + 4) {
          canvas.style.cursor = "pointer";
          return;
        }
        
        if (handles.cropBtn && Math.hypot(pt.cx - handles.cropBtn.x, pt.cy - handles.cropBtn.y) <= handles.cropBtn.r + 4) {
          canvas.style.cursor = "pointer";
          return;
        }

        if (Math.hypot(pt.cx - handles.tl.x, pt.cy - handles.tl.y) <= handles.tl.size + 4) {
          canvas.style.cursor = "nwse-resize";
          return;
        }
        if (Math.hypot(pt.cx - handles.br.x, pt.cy - handles.br.y) <= handles.br.size + 4) {
          canvas.style.cursor = "nwse-resize";
          return;
        }
        if (Math.hypot(pt.cx - handles.tr.x, pt.cy - handles.tr.y) <= handles.tr.size + 4) {
          canvas.style.cursor = "nesw-resize";
          return;
        }
        if (Math.hypot(pt.cx - handles.bl.x, pt.cy - handles.bl.y) <= handles.bl.size + 4) {
          canvas.style.cursor = "nesw-resize";
          return;
        }

        if (Math.hypot(pt.cx - handles.t.x, pt.cy - handles.t.y) <= handles.t.size + 4) {
          canvas.style.cursor = "ns-resize";
          return;
        }
        if (Math.hypot(pt.cx - handles.b.x, pt.cy - handles.b.y) <= handles.b.size + 4) {
          canvas.style.cursor = "ns-resize";
          return;
        }
        if (Math.hypot(pt.cx - handles.l.x, pt.cy - handles.l.y) <= handles.l.size + 4) {
          canvas.style.cursor = "ew-resize";
          return;
        }
        if (Math.hypot(pt.cx - handles.r.x, pt.cy - handles.r.y) <= handles.r.size + 4) {
          canvas.style.cursor = "ew-resize";
          return;
        }

        var b = getBounds(ann);
        var tol = 6 / currentScale;
        if (
          pt.x >= b.x - tol &&
          pt.x <= b.x + b.w + tol &&
          pt.y >= b.y - tol &&
          pt.y <= b.y + b.h + tol
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
    var base = { color: currentColor, strokeWidth: currentStrokeWidth };
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

  /* ---------- tool switching ---------- */
  function updateToolOptionsPanel(tool) {
    var panel = document.getElementById("tool-options");
    var showColor = false;
    var showWidth = false;
    var showFont = false;
    var showCrop = false;

    if (tool === "select") {
      if (selectedAnnotation && selectedAnnotation.page === currentPage) {
        var ann = findAnnotation(currentPage, selectedAnnotation.id);
        if (ann) {
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
    } else {
      showColor =
        [
          "text",
          "pen",
          "highlighter",
          "rect",
          "ellipse",
          "line",
          "arrow",
        ].indexOf(tool) !== -1;
      showWidth =
        ["pen", "highlighter", "rect", "ellipse", "line", "arrow"].indexOf(
          tool,
        ) !== -1;
      showFont = tool === "text";
    }

    panel.classList.toggle("is-open", showColor || showWidth || showFont || showCrop);
    document.getElementById("opt-color").classList.toggle("hidden", !showColor);
    document.getElementById("opt-width").classList.toggle("hidden", !showWidth);
    document
      .getElementById("opt-fontsize")
      .classList.toggle("hidden", !showFont);

    var formattingOpt = document.getElementById("opt-formatting");
    if (formattingOpt) {
      formattingOpt.classList.toggle("hidden", !showFont);
    }

    var cropOpt = document.getElementById("opt-crop");
    if (cropOpt) {
      cropOpt.classList.toggle("hidden", !showCrop);
    }
  }
  function syncOptionInputs() {
    document.getElementById("stroke-width").value = currentStrokeWidth;
    document.getElementById("stroke-width-val").textContent =
      currentStrokeWidth + "px";

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
      boldBtn.style.background = currentIsBold ? "var(--accent)" : "var(--surface)";
      boldBtn.style.color = currentIsBold ? "#fff" : "var(--text)";
      boldBtn.style.borderColor = currentIsBold ? "var(--accent)" : "var(--border)";
    }
    var italicBtn = document.getElementById("format-italic");
    if (italicBtn) {
      italicBtn.style.background = currentIsItalic ? "var(--accent)" : "var(--surface)";
      italicBtn.style.color = currentIsItalic ? "#fff" : "var(--text)";
      italicBtn.style.borderColor = currentIsItalic ? "var(--accent)" : "var(--border)";
    }
    var underlineBtn = document.getElementById("format-underline");
    if (underlineBtn) {
      underlineBtn.style.background = currentIsUnderline ? "var(--accent)" : "var(--surface)";
      underlineBtn.style.color = currentIsUnderline ? "#fff" : "var(--text)";
      underlineBtn.style.borderColor = currentIsUnderline ? "var(--accent)" : "var(--border)";
    }

    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann) {
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
        }
      }
    }
  }
  function setActiveTool(tool, isManual) {
    finalizeAnyOpenTextBox();
    livePath = null;
    liveShape = null;
    dragMode = null;
    dragOrigin = null;
    if (tool !== "image" && tool !== "signature") {
      pendingPlaceable = null;
    }
    if (tool === "select" || tool === "image" || tool === "signature") {
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
    if (TOOL_DEFAULTS[tool]) {
      currentStrokeWidth = TOOL_DEFAULTS[tool].width;
      if (TOOL_DEFAULTS[tool].color) {
        currentColor = TOOL_DEFAULTS[tool].color;
      }
      syncOptionInputs();
    }
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
  function buildSwatches() {
    var wrap = document.getElementById("color-swatches");
    wrap.innerHTML = "";
    PALETTE.forEach(function (color) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.style.background = color;
      b.dataset.color = color;
      b.setAttribute("aria-label", "Color " + color);
      if (color === currentColor) {
        b.classList.add("is-active");
      }
      b.addEventListener("click", function () {
        currentColor = color;
        syncOptionInputs();
      });
      wrap.appendChild(b);
    });
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
              lastModified: Date.now()
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
    selectedAnnotation = { page: currentPage, id: ann.id };
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
      canvas.addEventListener("pointerdown", function (e) {
        sigDrawing = true;
        var r = canvas.getBoundingClientRect();
        sigCtx.beginPath();
        sigCtx.moveTo(e.clientX - r.left, e.clientY - r.top);
      });
      canvas.addEventListener("pointermove", function (e) {
        if (!sigDrawing) {
          return;
        }
        var r = canvas.getBoundingClientRect();
        sigCtx.lineTo(e.clientX - r.left, e.clientY - r.top);
        sigCtx.stroke();
        sigHasDrawn = true;
      });
      window.addEventListener("pointerup", function () {
        sigDrawing = false;
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
        h: img.naturalHeight
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

    var maxW = Math.min(500, document.getElementById("crop-modal").clientWidth - 64) - 40; // 20px padding on left & right
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

      ctx.drawImage(img, 20, 20, img.naturalWidth * scale, img.naturalHeight * scale);

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
      ctx.fillRect(20, cy + ch, img.naturalWidth * scale, (20 + img.naturalHeight * scale) - (cy + ch));
      // Left overlay
      ctx.fillRect(20, cy, cx - 20, ch);
      // Right overlay
      ctx.fillRect(cx + cw, cy, (20 + img.naturalWidth * scale) - (cx + cw), ch);

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
        { x: cx + cw, y: cy + ch }
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
      rect.h
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
    window.showToast("Cropped successfully.");
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
      if (selectedAnnotation && selectedAnnotation.page === currentPage) {
        var ann = findAnnotation(currentPage, selectedAnnotation.id);
        if (ann) {
          var handles = getSelectionHandles(ann, currentScale);
          var isTouch = e.pointerType === "touch";
          var dDist = Math.hypot(
            pt.cx - handles.deleteBtn.x,
            pt.cy - handles.deleteBtn.y,
          );
          if (dDist <= handles.deleteBtn.r + (isTouch ? 12 : 4)) {
            deleteAnnotation(currentPage, ann.id);
            isPointerDown = false;
            return;
          }
          if (handles.cropBtn) {
            var cDist = Math.hypot(
              pt.cx - handles.cropBtn.x,
              pt.cy - handles.cropBtn.y,
            );
            if (cDist <= handles.cropBtn.r + (isTouch ? 12 : 4)) {
              openCropModal(ann);
              isPointerDown = false;
              return;
            }
          }
          // Corner Resizers Click Detection (with touch adaptation)
          var tolerance = isTouch ? 16 : 6;
          var cornerNames = ["tl", "tr", "br", "bl"];
          for (var i = 0; i < cornerNames.length; i++) {
            var name = cornerNames[i];
            var h = handles[name];
            var dist = Math.hypot(pt.cx - h.x, pt.cy - h.y);
            if (dist <= h.size + tolerance) {
              dragMode = "resize-" + name;
              dragOrigin = JSON.parse(JSON.stringify(ann));
              dragStartPoint = pt;
              return;
            }
          }
          // Side Resizers Click Detection (with touch adaptation)
          var sideNames = ["t", "b", "l", "r"];
          for (var i = 0; i < sideNames.length; i++) {
            var name = sideNames[i];
            var h = handles[name];
            var dist = Math.hypot(pt.cx - h.x, pt.cy - h.y);
            if (dist <= h.size + tolerance) {
              dragMode = "resize-" + name;
              dragOrigin = JSON.parse(JSON.stringify(ann));
              dragStartPoint = pt;
              return;
            }
          }
          // Allow dragging by clicking anywhere inside the selected element's bounding box
          var b = getBounds(ann);
          var tol = 6 / currentScale;
          if (
            pt.x >= b.x - tol &&
            pt.x <= b.x + b.w + tol &&
            pt.y >= b.y - tol &&
            pt.y <= b.y + b.h + tol
          ) {
            dragMode = "move";
            dragOrigin = JSON.parse(JSON.stringify(ann));
            dragStartPoint = pt;
            updateToolOptionsPanel("select");
            syncOptionInputs();
            return;
          }
        }
      }
      var hit = hitTest(pt);
      if (hit) {
        selectedAnnotation = { page: currentPage, id: hit.id };
        dragMode = "move";
        dragOrigin = JSON.parse(JSON.stringify(hit));
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
        updateToolOptionsPanel("select");
        syncOptionInputs();
        redrawAnnotations();
      } else if (selectedAnnotation) {
        selectedAnnotation = null;
        if (lastActiveDrawingTool) {
          setActiveTool(lastActiveDrawingTool);
        } else {
          updateToolOptionsPanel("select");
          redrawAnnotations();
        }
      }
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
  }
  function onPointerMove(e) {
    if (!isPointerDown) {
      updateCursorStyle(e);
      return;
    }
    var pt = getCanvasPagePoint(e);
    if (currentTool === "select" && dragMode) {
      var dx = pt.x - dragStartPoint.x,
        dy = pt.y - dragStartPoint.y;
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (!ann) {
        return;
      }
      if (dragMode === "move") {
        applyMove(ann, dragOrigin, dx, dy);
      } else if (dragMode.indexOf("resize-") === 0) {
        var direction = dragMode.substring(7); // "tl", "tr", "br", "bl", "t", "b", "l", "r"
        var origBounds = getBounds(dragOrigin);
        var ox = origBounds.x,
          oy = origBounds.y,
          ow = origBounds.w,
          oh = origBounds.h;

        var newX = ox, newY = oy, newW = ow, newH = oh;

        // Apply dx and dy based on direction
        if (direction.indexOf("l") !== -1) { // tl, bl, l
          newX = ox + dx;
          newW = ow - dx;
        }
        if (direction.indexOf("r") !== -1) { // tr, br, r
          newW = ow + dx;
        }
        if (direction.indexOf("t") !== -1) { // tl, tr, t
          newY = oy + dy;
          newH = oh - dy;
        }
        if (direction.indexOf("b") !== -1) { // bl, br, b
          newH = oh + dy;
        }

        // Constrain min dimensions
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

        // Proportional constraint (images, path, text)
        if (ann.type === "image" || ann.type === "path" || ann.type === "text") {
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

        applyBoundsResize(ann, dragOrigin, { x: newX, y: newY, w: newW, h: newH });
      }
      redrawAnnotations();
      return;
    }
    if (livePath) {
      livePath.points.push({ x: pt.x, y: pt.y });
      redrawAnnotations();
      return;
    }
    if (liveShape && dragStartPoint) {
      liveShape = shapeFromDrag(currentTool, dragStartPoint, pt);
      redrawAnnotations();
      return;
    }
  }
  function onPointerUp() {
    if (!isPointerDown) {
      return;
    }
    isPointerDown = false;
    if (currentTool === "select") {
      dragMode = null;
      dragOrigin = null;
      return;
    }
    if (livePath) {
      if (livePath.points.length > 1) {
        var pathAnn = {
          id: nextId(),
          type: "path",
          page: currentPage,
          points: livePath.points,
          color: livePath.style.color,
          strokeWidth: livePath.style.strokeWidth,
          opacity: livePath.style.opacity,
        };
        addAnnotation(currentPage, pathAnn);
        selectedAnnotation = { page: currentPage, id: pathAnn.id };
        setActiveTool("select");
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
        selectedAnnotation = { page: currentPage, id: shapeAnn.id };
        setActiveTool("select");
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
  function drawAnnotationOnPdf(pdfLibDoc, page, ann, pageHeight, fonts, rgb) {
    var rgbArr = hexToRgb01(ann.color);
    var color = rgb(rgbArr[0], rgbArr[1], rgbArr[2]);
    var p;
    switch (ann.type) {
      case "text":
        var fontToUse = fonts.regular;
        if (ann.isBold && ann.isItalic) {
          fontToUse = fonts.boldItalic;
        } else if (ann.isBold) {
          fontToUse = fonts.bold;
        } else if (ann.isItalic) {
          fontToUse = fonts.italic;
        }

        page.drawText(ann.text, {
          x: ann.x,
          y: pageHeight - (ann.y + ann.fontSize),
          size: ann.fontSize,
          font: fontToUse,
          color: color,
        });

        // Underline support on PDF
        if (ann.isUnderline) {
          var textWidth = fontToUse.widthOfTextAtSize(ann.text, ann.fontSize);
          var underlineY = pageHeight - (ann.y + ann.fontSize) - (ann.fontSize * 0.1);
          page.drawLine({
            start: { x: ann.x, y: underlineY },
            end: { x: ann.x + textWidth, y: underlineY },
            thickness: Math.max(1, ann.fontSize * 0.08),
            color: color
          });
        }
        return Promise.resolve();
      case "rect":
        page.drawRectangle({
          x: ann.x,
          y: pageHeight - (ann.y + ann.height),
          width: ann.width,
          height: ann.height,
          borderColor: color,
          borderWidth: ann.strokeWidth,
        });
        return Promise.resolve();
      case "ellipse":
        page.drawEllipse({
          x: ann.cx,
          y: pageHeight - ann.cy,
          xScale: ann.rx,
          yScale: ann.ry,
          borderColor: color,
          borderWidth: ann.strokeWidth,
        });
        return Promise.resolve();
      case "line":
        page.drawLine({
          start: { x: ann.x1, y: pageHeight - ann.y1 },
          end: { x: ann.x2, y: pageHeight - ann.y2 },
          thickness: ann.strokeWidth,
          color: color,
        });
        return Promise.resolve();
      case "arrow":
        drawArrowOnPdf(page, ann, pageHeight, color);
        return Promise.resolve();
      case "path":
        if (ann.points && ann.points.length > 0) {
          var svgPathString = "M " + ann.points[0].x + "," + ann.points[0].y;
          for (var k = 1; k < ann.points.length; k++) {
            svgPathString += " L " + ann.points[k].x + "," + ann.points[k].y;
          }
          page.drawSvgPath(svgPathString, {
            x: 0,
            y: pageHeight,
            borderColor: color,
            borderWidth: ann.strokeWidth,
            borderOpacity: ann.opacity != null ? ann.opacity : 1,
            borderLineCap: (window.PDFLib && window.PDFLib.LineCapStyle && window.PDFLib.LineCapStyle.Round !== undefined) ? window.PDFLib.LineCapStyle.Round : 1
          });
        }
        return Promise.resolve();
      case "image":
        p =
          ann.dataUrl.indexOf("image/png") !== -1
            ? pdfLibDoc.embedPng(dataUrlToBytes(ann.dataUrl))
            : pdfLibDoc.embedJpg(dataUrlToBytes(ann.dataUrl));
        return p.then(function (embedded) {
          page.drawImage(embedded, {
            x: ann.x,
            y: pageHeight - (ann.y + ann.height),
            width: ann.width,
            height: ann.height,
          });
        });
      default:
        return Promise.resolve();
    }
  }
  function exportPdf() {
    if (!originalBytes) {
      return;
    }
    var btn = document.getElementById("download-btn");
    var oldLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing your file…";
    ensureLibraries()
      .then(function () {
        var PDFLibNS = window.PDFLib;
        return PDFLibNS.PDFDocument.load(originalBytes.slice(0)).then(
          function (pdfLibDoc) {
            var embedHelvetica = pdfLibDoc.embedFont(PDFLibNS.StandardFonts.Helvetica);
            var embedHelveticaBold = pdfLibDoc.embedFont(PDFLibNS.StandardFonts.HelveticaBold);
            var embedHelveticaOblique = pdfLibDoc.embedFont(PDFLibNS.StandardFonts.HelveticaOblique);
            var embedHelveticaBoldOblique = pdfLibDoc.embedFont(PDFLibNS.StandardFonts.HelveticaBoldOblique);

            return Promise.all([
              embedHelvetica,
              embedHelveticaBold,
              embedHelveticaOblique,
              embedHelveticaBoldOblique
            ]).then(function (fonts) {
              var helv = fonts[0];
              var helvBold = fonts[1];
              var helvOblique = fonts[2];
              var helvBoldOblique = fonts[3];

              var fontMap = {
                regular: helv,
                bold: helvBold,
                italic: helvOblique,
                boldItalic: helvBoldOblique
              };

              var pages = pdfLibDoc.getPages();
              var chain = Promise.resolve();
              pages.forEach(function (page, i) {
                var pageNum = i + 1;
                var pageHeight = page.getHeight();
                var anns = annotationsByPage[pageNum] || [];
                anns.forEach(function (ann) {
                  chain = chain.then(function () {
                    return drawAnnotationOnPdf(
                      pdfLibDoc,
                      page,
                      ann,
                      pageHeight,
                      fontMap,
                      PDFLibNS.rgb,
                    );
                  });
                });
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
    pdfDoc = null;
    originalBytes = null;
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
    lastActiveDrawingTool = null;
    document.getElementById("file-input").value = "";
    showHero();
  }

  /* ---------- wire up UI ---------- */
  buildSwatches();
  updateToolOptionsPanel("select");

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
  document
    .getElementById("stroke-width")
    .addEventListener("input", function (e) {
      currentStrokeWidth = parseInt(e.target.value, 10);
      syncOptionInputs();
    });
  var fontSizeInput = document.getElementById("font-size");
  if (fontSizeInput) {
    var handleFontSizeChange = function (e) {
      currentFontSize = parseInt(e.target.value, 10) || 18;
      syncOptionInputs();
    };
    fontSizeInput.addEventListener("change", handleFontSizeChange);
    fontSizeInput.addEventListener("input", handleFontSizeChange);
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
      syncOptionInputs();
    });
    customColorInput.addEventListener("change", function (e) {
      currentColor = e.target.value;
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
          var progressContainer = document.getElementById("sig-upload-progress-container");
          var progressBar = document.getElementById("sig-upload-progress-bar");
          var progressText = document.getElementById("sig-upload-progress-text");
          var loadingStatus = document.getElementById("sig-upload-loading-status");

          if (progressBar) progressBar.style.width = "0%";
          if (progressText) progressText.textContent = "0%";
          if (loadingStatus) loadingStatus.textContent = "Loading WASM AI...";
          if (progressContainer) progressContainer.classList.remove("hidden");

          import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.6/+esm")
            .then(function (module) {
              return module.removeBackground(sigOriginalFile, {
                publicPath:
                  "https://staticimgly.com/@imgly/background-removal-data/1.5.6/dist/",
                model: "isnet_quint8",
                progress: function (key, current, total) {
                  if (total && total > 0) {
                    var percentage = Math.round((current / total) * 100);
                    if (progressBar) progressBar.style.width = percentage + "%";
                    if (progressText) progressText.textContent = percentage + "%";
                    if (loadingStatus) {
                      var cleanKey = key;
                      if (key.indexOf("fetch:") === 0) {
                        cleanKey = "Downloading " + key.substring(key.lastIndexOf("/") + 1);
                      } else if (key.indexOf("compute:") === 0) {
                        cleanKey = "Removing background...";
                      }
                      loadingStatus.textContent = cleanKey;
                    }
                  } else {
                    if (loadingStatus) loadingStatus.textContent = "Removing background...";
                  }
                }
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
      if (lastActiveDrawingTool) {
        setActiveTool(lastActiveDrawingTool);
      }
      renderPage(currentPage - 1);
    }
  });
  document.getElementById("next-page").addEventListener("click", function () {
    if (currentPage < numPages) {
      selectedAnnotation = null;
      if (lastActiveDrawingTool) {
        setActiveTool(lastActiveDrawingTool);
      }
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

  var annCanvasEl = document.getElementById("annotation-canvas");
  annCanvasEl.addEventListener("pointerdown", onPointerDown);
  annCanvasEl.addEventListener("pointermove", onPointerMove);
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

      if (Math.hypot(mx - cx1, my - cy1) < handleSize) cropState.activeHandle = "tl";
      else if (Math.hypot(mx - cx2, my - cy1) < handleSize) cropState.activeHandle = "tr";
      else if (Math.hypot(mx - cx1, my - cy2) < handleSize) cropState.activeHandle = "bl";
      else if (Math.hypot(mx - cx2, my - cy2) < handleSize) cropState.activeHandle = "br";
      else if (mx >= cx1 && mx <= cx2 && my >= cy1 && my <= cy2) {
        cropState.activeHandle = "move";
      } else {
        cropState.activeHandle = "draw";
        var clickX = Math.max(0, Math.min(img.naturalWidth, (mx - 20) / scale));
        var clickY = Math.max(0, Math.min(img.naturalHeight, (my - 20) / scale));
        cropState.cropRect = { x: clickX, y: clickY, w: 0, h: 0 };
      }

      cropState.dragStart = { x: mx, y: my };
      cropState.startCropRect = JSON.parse(JSON.stringify(cropState.cropRect));
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
          h: Math.abs(start.y - curY)
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
          h: img.naturalHeight
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
      syncOptionInputs();
      redrawAnnotations();
    });
  }
  var italicBtn = document.getElementById("format-italic");
  if (italicBtn) {
    italicBtn.addEventListener("click", function () {
      currentIsItalic = !currentIsItalic;
      syncOptionInputs();
      redrawAnnotations();
    });
  }
  var underlineBtn = document.getElementById("format-underline");
  if (underlineBtn) {
    underlineBtn.addEventListener("click", function () {
      currentIsUnderline = !currentIsUnderline;
      syncOptionInputs();
      redrawAnnotations();
    });
  }

  document.addEventListener("keydown", function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      selectedAnnotation &&
      tag !== "INPUT" &&
      tag !== "TEXTAREA"
    ) {
      e.preventDefault();
      deleteAnnotation(selectedAnnotation.page, selectedAnnotation.id);
    }
    if (
      selectedAnnotation &&
      tag !== "INPUT" &&
      tag !== "TEXTAREA" &&
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.key) !== -1
    ) {
      e.preventDefault();
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann) {
        pushHistory();
        var amount = e.shiftKey ? 10 : 1;
        var dx = 0, dy = 0;
        if (e.key === "ArrowUp") dy = -amount;
        else if (e.key === "ArrowDown") dy = amount;
        else if (e.key === "ArrowLeft") dx = -amount;
        else if (e.key === "ArrowRight") dx = amount;
        
        applyMove(ann, ann, dx, dy);
        redrawAnnotations();
      }
    }
    if (e.key === "Escape") {
      closeCropModal();
      closeSignatureModal(true);
    }
  });
  window.addEventListener("resize", function () {
    if (!pdfDoc) {
      return;
    }
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      renderPage(currentPage);
    }, 200);
  });
})();
