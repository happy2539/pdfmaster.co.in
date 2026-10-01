/**
 * PDFMaster - System Health & Heap Memory Monitor
 * Tracks real-time JavaScript heap memory headroom and system health metrics to prevent browser tab crashes.
 */
(function () {
  "use strict";

  const state = window.PDFCompressState;
  const canvasPool = window.PDFCompressCanvasPool;

  function sampleHealthMetrics() {
    let usedMb = 0;
    let limitMb = 0;
    let headroomFraction = 1.0;
    let hasPerformanceMemory = false;

    if (window.performance && window.performance.memory) {
      hasPerformanceMemory = true;
      usedMb = Math.round(window.performance.memory.usedJSHeapSize / 1048576);
      limitMb = Math.round(window.performance.memory.jsHeapSizeLimit / 1048576);
      if (limitMb > 0) {
        headroomFraction = Math.max(0, 1 - usedMb / limitMb);
      }
    } else {
      // Fallback for browsers without performance.memory (Firefox/Safari)
      const devMemGb = navigator.deviceMemory || 4;
      limitMb = Math.round(devMemGb * 512);
      const trackedBytes = canvasPool ? canvasPool.getTrackedBytes() : 0;
      usedMb = Math.round(trackedBytes / 1048576) + 40;
      headroomFraction = Math.max(0.1, 1 - usedMb / limitMb);
    }

    const remainingPct = Math.round(headroomFraction * 100);
    const isCritical = headroomFraction <= 0.2; // <= 20% free RAM
    const isWarning = headroomFraction <= 0.35 && !isCritical; // 20% - 35% free RAM

    return {
      usedMb,
      limitMb,
      headroomFraction,
      remainingPct,
      isCritical,
      isWarning,
      hasPerformanceMemory,
    };
  }

  function updateHeapHudUi() {
    // HUD and technical tags removed per UI feedback; background memory headroom governor remains active
  }

  window.PDFCompressHealth = {
    sampleHealthMetrics,
    updateHeapHudUi,
  };
})();
