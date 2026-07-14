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

  var PALETTE = [
    "#e8372a",
    "#16181d",
    "#2563eb",
    "#16a34a",
    "#f6c344",
    "#7c3aed",
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
    var resizeHandle = { x: x + w + 4, y: y + h + 4, size: 9 };
    var resizeRight = { x: x + w + 4, y: y + h / 2, size: 9 };
    var resizeBottom = { x: x + w / 2, y: y + h + 4, size: 9 };
    return {
      box: { x: x, y: y, w: w, h: h },
      deleteBtn: deleteBtn,
      resizeHandle: resizeHandle,
      resizeRight: resizeRight,
      resizeBottom: resizeBottom,
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
        ctx.font = ann.fontSize * scale + "px 'DM Sans', sans-serif";
        ctx.fillStyle = ann.color;
        ctx.textBaseline = "top";
        ctx.fillText(ann.text, ann.x * scale, ann.y * scale);
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

    var list = [handles.resizeHandle];
    if (ann.type !== "text") {
      list.push(handles.resizeRight);
      list.push(handles.resizeBottom);
    }

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#e8372a";
    ctx.lineWidth = 1.6;
    list.forEach(function (h) {
      ctx.beginPath();
      ctx.rect(h.x - 6, h.y - 6, 12, 12);
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
  function applyResize(ann, origin, dx, dy, type) {
    var originalBounds = getBounds(origin);
    if (originalBounds.w === 0 || originalBounds.h === 0) return;

    var ratioX = 1;
    var ratioY = 1;

    if (type === "width" || type === "both") {
      ratioX = (originalBounds.w + dx) / originalBounds.w;
      if (ratioX <= 0.1) ratioX = 0.1;
    }
    if (type === "height" || type === "both") {
      ratioY = (originalBounds.h + dy) / originalBounds.h;
      if (ratioY <= 0.1) ratioY = 0.1;
    }

    if (type === "both") {
      if (ann.type === "image" || ann.type === "path" || ann.type === "text") {
        ratioY = ratioX;
      }
    }

    switch (ann.type) {
      case "image":
      case "rect": {
        ann.width = originalBounds.w * ratioX;
        ann.height = originalBounds.h * ratioY;
        break;
      }
      case "ellipse": {
        ann.rx = origin.rx * ratioX;
        ann.ry = origin.ry * ratioY;
        ann.cx = origin.cx + origin.rx * (ratioX - 1);
        ann.cy = origin.cy + origin.ry * (ratioY - 1);
        break;
      }
      case "line":
      case "arrow": {
        var ox = originalBounds.x;
        var oy = originalBounds.y;
        ann.x1 = ox + (origin.x1 - ox) * ratioX;
        ann.y1 = oy + (origin.y1 - oy) * ratioY;
        ann.x2 = ox + (origin.x2 - ox) * ratioX;
        ann.y2 = oy + (origin.y2 - oy) * ratioY;
        break;
      }
      case "path": {
        var ox = originalBounds.x;
        var oy = originalBounds.y;
        ann.points = origin.points.map(function (p) {
          return {
            x: ox + (p.x - ox) * ratioX,
            y: oy + (p.y - oy) * ratioY,
          };
        });
        break;
      }
      case "text": {
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
    var pt = box._pagePoint;
    box.remove();
    if (window._activeTextBox === box) {
      window._activeTextBox = null;
    }
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
      };
      addAnnotation(currentPage, ann);
      selectedAnnotation = { page: currentPage, id: ann.id };
      setActiveTool("select");
      redrawAnnotations();
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
    var showColor =
      [
        "text",
        "pen",
        "highlighter",
        "rect",
        "ellipse",
        "line",
        "arrow",
      ].indexOf(tool) !== -1;
    var showWidth =
      ["pen", "highlighter", "rect", "ellipse", "line", "arrow"].indexOf(
        tool,
      ) !== -1;
    var showFont = tool === "text";
    panel.classList.toggle("is-open", showColor || showWidth || showFont);
    document.getElementById("opt-color").classList.toggle("hidden", !showColor);
    document.getElementById("opt-width").classList.toggle("hidden", !showWidth);
    document
      .getElementById("opt-fontsize")
      .classList.toggle("hidden", !showFont);
  }
  function syncOptionInputs() {
    document.getElementById("stroke-width").value = currentStrokeWidth;
    document.getElementById("stroke-width-val").textContent =
      currentStrokeWidth + "px";
    document.querySelectorAll(".swatch").forEach(function (s) {
      s.classList.toggle("is-active", s.dataset.color === currentColor);
    });
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
    if (tool === "select") {
      if (isManual) {
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
    setActiveTool("select");
    selectedAnnotation = { page: currentPage, id: ann.id };
    redrawAnnotations();
  }

  /* ---------- signature modal ---------- */
  function openSignatureModal() {
    document.getElementById("sig-overlay").classList.add("is-open");
    var modal = document.getElementById("sig-modal");
    modal.style.opacity = "1";
    modal.style.pointerEvents = "auto";
    modal.style.transform = "translate(-50%,-50%) scale(1)";
    modal.setAttribute("aria-hidden", "false");
    setupSignaturePad();
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
          var dDist = Math.hypot(
            pt.cx - handles.deleteBtn.x,
            pt.cy - handles.deleteBtn.y,
          );
          if (dDist <= handles.deleteBtn.r + 4) {
            deleteAnnotation(currentPage, ann.id);
            isPointerDown = false;
            return;
          }
          if (handles.resizeHandle) {
            var rDist = Math.hypot(
              pt.cx - handles.resizeHandle.x,
              pt.cy - handles.resizeHandle.y,
            );
            if (rDist <= handles.resizeHandle.size + 6) {
              dragMode = "resize-both";
              dragOrigin = JSON.parse(JSON.stringify(ann));
              dragStartPoint = pt;
              return;
            }
          }
          if (ann.type !== "text") {
            if (handles.resizeRight) {
              var rightDist = Math.hypot(
                pt.cx - handles.resizeRight.x,
                pt.cy - handles.resizeRight.y,
              );
              if (rightDist <= handles.resizeRight.size + 6) {
                dragMode = "resize-width";
                dragOrigin = JSON.parse(JSON.stringify(ann));
                dragStartPoint = pt;
                return;
              }
            }
            if (handles.resizeBottom) {
              var bottomDist = Math.hypot(
                pt.cx - handles.resizeBottom.x,
                pt.cy - handles.resizeBottom.y,
              );
              if (bottomDist <= handles.resizeBottom.size + 6) {
                dragMode = "resize-height";
                dragOrigin = JSON.parse(JSON.stringify(ann));
                dragStartPoint = pt;
                return;
              }
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
        redrawAnnotations();
      } else if (selectedAnnotation) {
        selectedAnnotation = null;
        if (lastActiveDrawingTool) {
          setActiveTool(lastActiveDrawingTool);
        } else {
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
      } else if (dragMode === "resize" || dragMode === "resize-both") {
        applyResize(ann, dragOrigin, dx, dy, "both");
      } else if (dragMode === "resize-width") {
        applyResize(ann, dragOrigin, dx, dy, "width");
      } else if (dragMode === "resize-height") {
        applyResize(ann, dragOrigin, dx, dy, "height");
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
  function drawAnnotationOnPdf(pdfLibDoc, page, ann, pageHeight, helv, rgb) {
    var rgbArr = hexToRgb01(ann.color);
    var color = rgb(rgbArr[0], rgbArr[1], rgbArr[2]);
    var p;
    switch (ann.type) {
      case "text":
        page.drawText(ann.text, {
          x: ann.x,
          y: pageHeight - (ann.y + ann.fontSize),
          size: ann.fontSize,
          font: helv,
          color: color,
        });
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
        for (var k = 0; k < ann.points.length - 1; k++) {
          page.drawLine({
            start: {
              x: ann.points[k].x,
              y: pageHeight - ann.points[k].y,
            },
            end: {
              x: ann.points[k + 1].x,
              y: pageHeight - ann.points[k + 1].y,
            },
            thickness: ann.strokeWidth,
            color: color,
            opacity: ann.opacity != null ? ann.opacity : 1,
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
            return pdfLibDoc
              .embedFont(PDFLibNS.StandardFonts.Helvetica)
              .then(function (helv) {
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
                        helv,
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
      document.getElementById("stroke-width-val").textContent =
        currentStrokeWidth + "px";
    });
  document.getElementById("font-size").addEventListener("change", function (e) {
    currentFontSize = parseInt(e.target.value, 10);
  });

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
    if (sigCtx) {
      var c = document.getElementById("sig-canvas");
      sigCtx.clearRect(0, 0, c.width, c.height);
    }
    sigHasDrawn = false;
  });
  document.getElementById("sig-insert").addEventListener("click", function () {
    if (!sigHasDrawn) {
      window.showToast("Draw a signature first.");
      return;
    }
    var canvas = document.getElementById("sig-canvas");
    var dataUrl = canvas.toDataURL("image/png");
    var aspect = canvas.height / canvas.width;
    var w = Math.min(
      220,
      (pageDimsCache[currentPage] ? pageDimsCache[currentPage].width : 400) *
        0.4,
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
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

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
