/**
 * PDFMaster - Device Profile: 4GB RAM / Balanced Turbo
 * Calibrated specifically for standard 4GB hardware (5 parallel pages, bounded canvas, worker flush).
 */
(function () {
  "use strict";

  window.PDFCompressProfiles = window.PDFCompressProfiles || {};

  window.PDFCompressProfiles["4GB"] = {
    tier: "4GB",
    profileName: "Balanced Turbo",
    targetConcurrency: 5,
    maxPendingBuffer: 6,
    maxPoolCapacity: 6,
    // Protect 4GB RAM tabs from giant scanned canvases
    maxCanvasDimension: 2200,
    // Flush PDF.js Web Worker cache every 5 pages
    workerCleanupInterval: 5,
    interPageYieldDelayMs: 10,
    getBadgeText: function (cores) {
      return `🚀 4GB RAM · Balanced 5× Parallel Pipeline (${cores} Cores)`;
    },
    getDescription: function (cores) {
      return `4GB RAM Profile (5 Parallel Pages · ${cores} Cores)`;
    },
  };
})();
