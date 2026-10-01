/**
 * PDFMaster - Device Profile: 4GB RAM / High-Speed Parallel
 * Calibrated for 4GB hardware with 10 parallel pages processing.
 */
(function () {
  "use strict";

  window.PDFCompressProfiles = window.PDFCompressProfiles || {};

  window.PDFCompressProfiles["4GB"] = {
    tier: "4GB",
    profileName: "Fast Parallel",
    targetConcurrency: 10,
    maxPendingBuffer: 12,
    maxPoolCapacity: 12,
    // Protect 4GB RAM tabs from giant scanned canvases
    maxCanvasDimension: 2200,
    // Flush PDF.js Web Worker cache every 5 pages
    workerCleanupInterval: 5,
    interPageYieldDelayMs: 5,
    getBadgeText: function (cores) {
      return `🚀 4GB RAM · Fast 10× Parallel Pipeline (${cores} Cores)`;
    },
    getDescription: function (cores) {
      return `4GB RAM Profile (10 Parallel Pages · ${cores} Cores)`;
    },
  };
})();
