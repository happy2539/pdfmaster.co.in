/**
 * PDFMaster - Device Profile: 16GB+ RAM / Extreme Workstation
 * Tuned for multi-core workstations and desktop power users (14 parallel pages).
 */
(function () {
  "use strict";

  window.PDFCompressProfiles = window.PDFCompressProfiles || {};

  window.PDFCompressProfiles["16GB"] = {
    tier: "16GB",
    targetConcurrency: 34,
    maxPendingBuffer: 36,
    maxPoolCapacity: 36,
    maxCanvasDimension: 4096,
    workerCleanupInterval: 12,
    interPageYieldDelayMs: 0,
  };
})();
