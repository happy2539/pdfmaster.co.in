/**
 * PDFMaster - Device Profile: 4GB RAM / High-Speed Parallel
 * Calibrated for 4GB hardware with 10 parallel pages processing.
 */
(function () {
  "use strict";

  window.PDFCompressProfiles = window.PDFCompressProfiles || {};

  window.PDFCompressProfiles["4GB"] = {
    tier: "4GB",
    targetConcurrency: 10,
    maxPendingBuffer: 12,
    maxPoolCapacity: 12,
    // Protect 4GB RAM tabs from giant scanned canvases
    maxCanvasDimension: 2200,
    // Flush PDF.js Web Worker cache every 5 pages
    workerCleanupInterval: 5,
    interPageYieldDelayMs: 5,
  };
})();
