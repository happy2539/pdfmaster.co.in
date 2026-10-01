/**
 * PDFMaster - Device Profile: 16GB+ RAM / Extreme Workstation
 * Tuned for multi-core workstations and desktop power users (14 parallel pages).
 */
(function () {
  "use strict";

  window.PDFCompressProfiles = window.PDFCompressProfiles || {};

  window.PDFCompressProfiles["16GB"] = {
    tier: "16GB",
    profileName: "Extreme Workstation",
    targetConcurrency: 14,
    maxPendingBuffer: 18,
    maxPoolCapacity: 18,
    maxCanvasDimension: 4096,
    workerCleanupInterval: 12,
    interPageYieldDelayMs: 0,
    getBadgeText: function (cores) {
      return `🚀 16GB+ RAM · Turbo 14× Parallel Pipeline (${cores} Cores)`;
    },
    getDescription: function (cores) {
      return `16GB+ RAM Profile (14 Parallel Pages · ${cores} Cores)`;
    },
  };
})();
