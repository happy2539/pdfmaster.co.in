/**
 * PDFMaster - Device Profile: 8GB RAM / High Performance
 * Calibrated specifically for 8GB hardware (10 parallel pages, high throughput).
 */
(function () {
  "use strict";

  window.PDFCompressProfiles = window.PDFCompressProfiles || {};

  window.PDFCompressProfiles["8GB"] = {
    tier: "8GB",
    targetConcurrency: 20,
    maxPendingBuffer: 22,
    maxPoolCapacity: 22,
    maxCanvasDimension: 3200,
    workerCleanupInterval: 8,
    interPageYieldDelayMs: 0,
  };
})();
