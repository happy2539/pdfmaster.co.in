/**
 * PDFMaster - OCR PDF Modular Entry & Compatibility Loader
 * Automatically loads modular component scripts from /js/ocr-pdf/
 * if they are not already loaded via script tags in the HTML.
 */
(function () {
  "use strict";

  if (window.PDFMasterOCR && window.PDFMasterOCR.state && window.PDFMasterOCR.booted) {
    return; // Already loaded via individual script tags
  }

  var scripts = [
    "/js/ocr-pdf/state.js?v=2.1",
    "/js/ocr-pdf/storage.js?v=2.1",
    "/js/ocr-pdf/preprocess.js?v=2.1",
    "/js/ocr-pdf/engine.js?v=2.1",
    "/js/ocr-pdf/pdf-builder.js?v=2.1",
    "/js/ocr-pdf/studio.js?v=2.1",
    "/js/ocr-pdf/pipeline.js?v=2.1",
    "/js/ocr-pdf/ui.js?v=2.1",
    "/js/ocr-pdf/main.js?v=2.1",
  ];

  function loadNext(index) {
    if (index >= scripts.length) return;
    var s = document.createElement("script");
    s.src = scripts[index];
    s.async = false;
    s.onload = function () {
      loadNext(index + 1);
    };
    s.onerror = function () {
      console.error("Failed to load ocr-pdf module:", scripts[index]);
    };
    document.head.appendChild(s);
  }

  loadNext(0);
})();
