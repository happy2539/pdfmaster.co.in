/**
 * PDFMaster - Device Profile: 8GB RAM / High Performance
 * Calibrated specifically for 8GB hardware (10 parallel pages, high throughput).
 */
(function () {
  "use strict";

  window.PDFCompressProfiles = window.PDFCompressProfiles || {};

  window.PDFCompressProfiles["8GB"] = {
    tier: "8GB",
    profileName: "High Performance",
    targetConcurrency: 10,
    maxPendingBuffer: 12,
    maxPoolCapacity: 12,
    maxCanvasDimension: 3200,
    workerCleanupInterval: 8,
    interPageYieldDelayMs: 0,
    getBadgeText: function (cores) {
      return `🚀 8GB RAM · Fast 10× Parallel Pipeline (${cores} Cores)`;
    },
    getDescription: function (cores) {
      return `8GB RAM Profile (10 Parallel Pages · ${cores} Cores)`;
    },
  };
})();
