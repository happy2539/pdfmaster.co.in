/**
 * PDFMaster - Device Profile: 2GB RAM / Low-Resource Devices
 * Tuned for mobile, battery saver, and low-memory Linux/Windows systems.
 */
(function () {
  "use strict";

  window.PDFCompressProfiles = window.PDFCompressProfiles || {};

  window.PDFCompressProfiles["2GB"] = {
    tier: "2GB",
    profileName: "Safe / Battery Saver",
    targetConcurrency: 2,
    maxPendingBuffer: 3,
    maxPoolCapacity: 3,
    // Downscale oversized scanned images to avoid memory blowout
    maxCanvasDimension: 1800,
    // Flush PDF.js Web Worker cache every 3 pages
    workerCleanupInterval: 3,
    interPageYieldDelayMs: 25,
    getBadgeText: function (cores) {
      return `⚡ 2GB RAM · Safe 2× Parallel Pipeline (${cores} Cores)`;
    },
    getDescription: function (cores) {
      return `2GB RAM Profile (2 Parallel Pages · ${cores} Cores)`;
    },
  };
})();
