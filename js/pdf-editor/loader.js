/**
 * PDFMaster PDF Editor - Document & Library Loader
 * Handles dynamic script loading for pdf.js and pdf-lib, streaming document opening, and file events.
 */
"use strict";


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
      undoHistoryStack = [];
      redoHistoryStack = [];
      imageElCache = {};
      selectedAnnotation = null;
      currentPage = 1;
      zoomFactor = 1;
      pageDimsCache = {};
      pageRotations = {};
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

