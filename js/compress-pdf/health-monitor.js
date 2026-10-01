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

  function updateHeapHudUi(
    metrics,
    activeWorkers,
    speedPps,
    completedPages,
    totalPages,
  ) {
    const loadingHeapHud = document.getElementById("loadingHeapHud");
    if (!loadingHeapHud) return;
    loadingHeapHud.style.display = "block";

    const loadingHeapHudSpeed = document.getElementById("loadingHeapHudSpeed");
    if (loadingHeapHudSpeed) {
      loadingHeapHudSpeed.textContent = `${speedPps} p/s (${activeWorkers}× Concurrent)`;
    }

    const loadingHeapHudFill = document.getElementById("loadingHeapHudFill");
    if (loadingHeapHudFill) {
      const usedPct = Math.min(100, Math.max(5, 100 - metrics.remainingPct));
      loadingHeapHudFill.style.width = `${usedPct}%`;
      loadingHeapHudFill.classList.toggle("is-critical", metrics.isCritical);
      loadingHeapHudFill.classList.toggle("is-warning", metrics.isWarning);
    }

    const loadingHeapHudMemory = document.getElementById(
      "loadingHeapHudMemory",
    );
    if (loadingHeapHudMemory) {
      if (metrics.hasPerformanceMemory) {
        loadingHeapHudMemory.textContent = `RAM: ${metrics.usedMb}MB / ${metrics.limitMb}MB (${metrics.remainingPct}% Free) · DB Disk Backed`;
      } else {
        loadingHeapHudMemory.textContent = `Health: ~${metrics.remainingPct}% Free · DB Disk Backed`;
      }
    }

    const loadingHeapHudTitle = document.getElementById("loadingHeapHudTitle");
    if (loadingHeapHudTitle) {
      const cfg = state.hardwareConfig;
      loadingHeapHudTitle.textContent = cfg
        ? `🟢 ${cfg.profileName} (${cfg.estimatedRamGb}GB RAM)`
        : "🟢 Hardware Adaptive Pipeline";
    }

    const loadingHeapHudStatus = document.getElementById(
      "loadingHeapHudStatus",
    );
    if (loadingHeapHudStatus) {
      const cfg = state.hardwareConfig || {
        estimatedRamGb: 4,
        profileName: "Fast Parallel",
      };

      if (metrics.isCritical) {
        loadingHeapHudStatus.textContent = `⚠️ Memory Guard: Scaled to 1× Safe Mode`;
        loadingHeapHudStatus.style.color = "#ef4444";
      } else if (metrics.isWarning) {
        loadingHeapHudStatus.textContent = `🟡 Adaptive Guard: ${activeWorkers}× Concurrency (RAM Caution)`;
        loadingHeapHudStatus.style.color = "#f59e0b";
      } else {
        loadingHeapHudStatus.textContent = `🟢 Health Optimal: ${activeWorkers}× Parallel (${cfg.estimatedRamGb}GB Profile)`;
        loadingHeapHudStatus.style.color = "var(--savings-green-dark, #059669)";
      }
    }

    const loadingModeTag = document.getElementById("loadingModeTag");
    if (loadingModeTag) {
      loadingModeTag.style.display = "inline-block";
      if (metrics.isCritical) {
        loadingModeTag.textContent = `🛡️ Auto Memory Guard Active (Throttled to 1×)`;
      } else {
        const cfg = state.hardwareConfig;
        const ramTag = cfg ? ` · ${cfg.estimatedRamGb}GB RAM` : "";
        loadingModeTag.textContent = `⚡ Parallel Pipeline (${activeWorkers}× Concurrent Pages${ramTag})`;
      }
    }
  }

  window.PDFCompressHealth = {
    sampleHealthMetrics,
    updateHeapHudUi,
  };
})();
