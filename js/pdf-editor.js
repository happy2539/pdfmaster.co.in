/**
 * PDFMaster - PDF Editor Entry / Compatibility Loader
 *
 * This file dynamically loads the modular components from js/pdf-editor/
 * if they are not already loaded via script tags in the HTML.
 */
(function () {
  "use strict";

  if (window.PDFEditor) {
    return; // Already loaded via individual script tags
  }

  var scripts = [
    "/js/pdf-editor/state.js",
    "/js/pdf-editor/utils.js",
    "/js/pdf-editor/loader.js",
    "/js/pdf-editor/geometry.js",
    "/js/pdf-editor/history.js",
    "/js/pdf-editor/renderer.js",
    "/js/pdf-editor/eraser.js",
    "/js/pdf-editor/crop-modal.js",
    "/js/pdf-editor/signature-modal.js",
    "/js/pdf-editor/text-tool.js",
    "/js/pdf-editor/tool-options.js",
    "/js/pdf-editor/pointer.js",
    "/js/pdf-editor/export.js",
    "/js/pdf-editor/storage.js",
    "/js/pdf-editor/ui.js",
    "/js/pdf-editor/main.js",
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
      console.error("Failed to load editor module:", scripts[index]);
    };
    document.head.appendChild(s);
  }

  loadNext(0);
})();
