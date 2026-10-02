/**
 * PDFMaster - Compress PDF Modular Entry & Compatibility Loader
 * Automatically loads modular component scripts from /js/compress-pdf/
 * if they are not already loaded via script tags in the HTML.
 */
(function () {
  "use strict";

  if (window.PDFCompress) {
    return; // Already loaded via individual script tags
  }

  var scripts = [
    "/js/compress-pdf/state.js",
    "/js/compress-pdf/storage.js",
    "/js/compress-pdf/canvas-pool.js",
    "/js/compress-pdf/device-profiles/profile-2gb.js",
    "/js/compress-pdf/device-profiles/profile-4gb.js",
    "/js/compress-pdf/device-profiles/profile-8gb.js",
    "/js/compress-pdf/device-profiles/profile-16gb.js",
    "/js/compress-pdf/device-profiles/device-detector.js",
    "/js/compress-pdf/health-monitor.js",
    "/js/compress-pdf/preview.js",
    "/js/compress-pdf/ui.js",
    "/js/compress-pdf/pipeline.js",
    "/js/compress-pdf/main.js",
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
      console.error("Failed to load compress-pdf module:", scripts[index]);
    };
    document.head.appendChild(s);
  }

  loadNext(0);
})();
