/**
 * PDFMaster - Compare PDF Modular Entry & Compatibility Loader
 * Automatically loads modular component scripts from /js/pdf-compare/
 * if they are not already loaded via individual script tags in the HTML.
 */
(function () {
  "use strict";

  if (window.PDFCompare && window.PDFCompare.initialized) {
    return; // Already loaded via individual script tags
  }

  var scripts = [
    "/js/pdf-compare/state.js",
    "/js/pdf-compare/storage.js",
    "/js/pdf-compare/diff-engine.js",
    "/js/pdf-compare/renderer.js",
    "/js/pdf-compare/loader.js",
    "/js/pdf-compare/export.js",
    "/js/pdf-compare/ui.js",
    "/js/pdf-compare/main.js"
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
      console.error("Failed to load pdf-compare module:", scripts[index]);
    };
    document.head.appendChild(s);
  }

  loadNext(0);
})();
