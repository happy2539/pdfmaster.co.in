/**
 * PDFMaster - Sign PDF Modular Entry & Compatibility Loader
 * Automatically loads modular component scripts from /js/sign-pdf/
 * if they are not already loaded via script tags in the HTML.
 */
(function () {
  "use strict";

  if (window.PDFSign && window.PDFSign.state) {
    return; // Already loaded via individual script tags
  }

  var scripts = [
    "/js/sign-pdf/state.js",
    "/js/sign-pdf/storage.js",
    "/js/sign-pdf/pdf-engine.js",
    "/js/sign-pdf/studio-draw.js",
    "/js/sign-pdf/studio-type.js",
    "/js/sign-pdf/studio-upload.js",
    "/js/sign-pdf/studio-crop.js",
    "/js/sign-pdf/overlay-manager.js",
    "/js/sign-pdf/export-engine.js",
    "/js/sign-pdf/main.js",
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
      console.error("Failed to load sign-pdf module:", scripts[index]);
    };
    document.head.appendChild(s);
  }

  loadNext(0);
})();
