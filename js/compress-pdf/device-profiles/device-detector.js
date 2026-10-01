/**
 * PDFMaster - Device Hardware Detector & Capability Profiler
 * Intelligently analyzes system RAM, CPU cores, and heap limit to select the matching hardware profile.
 */
(function () {
  "use strict";

  window.PDFCompressDevice = window.PDFCompressDevice || {};

  function detectHardwareCapabilities() {
    const rawDevMem = navigator.deviceMemory; // in GB (e.g. 0.5, 1, 2, 4, 8)
    const rawCores = navigator.hardwareConcurrency || 4;
    let heapLimitMb = 0;

    if (window.performance && window.performance.memory) {
      heapLimitMb = Math.round(
        window.performance.memory.jsHeapSizeLimit / 1048576,
      );
    }

    // Determine estimated system RAM in GB
    let estimatedRamGb = 4; // default baseline

    if (typeof rawDevMem === "number" && rawDevMem > 0) {
      estimatedRamGb = rawDevMem;
      // Chromium caps navigator.deviceMemory at 8GB to mitigate fingerprinting.
      // If deviceMemory reports 8GB, but heap limit > 3.5GB and CPU cores >= 12, it is a 16GB+ workstation.
      if (rawDevMem >= 8 && (heapLimitMb > 3500 || rawCores >= 12)) {
        estimatedRamGb = 16;
      }
    } else {
      // Heuristic fallbacks for Firefox / Safari where navigator.deviceMemory is omitted
      if (heapLimitMb > 3500 || rawCores >= 12) {
        estimatedRamGb = 16;
      } else if (heapLimitMb > 2000 || rawCores >= 8) {
        estimatedRamGb = 8;
      } else if (heapLimitMb > 1000 || rawCores >= 4) {
        estimatedRamGb = 4;
      } else {
        estimatedRamGb = 2;
      }
    }

    // Match profile from registered profiles
    const profiles = window.PDFCompressProfiles || {};
    let matchedProfile = null;

    if (estimatedRamGb >= 16 && profiles["16GB"]) {
      matchedProfile = profiles["16GB"];
    } else if (estimatedRamGb >= 8 && profiles["8GB"]) {
      matchedProfile = profiles["8GB"];
    } else if (estimatedRamGb >= 4 && profiles["4GB"]) {
      matchedProfile = profiles["4GB"];
    } else if (profiles["2GB"]) {
      matchedProfile = profiles["2GB"];
    } else {
      // Fallback default
      matchedProfile = {
        tier: "4GB",
        profileName: "Balanced Turbo",
        targetConcurrency: 5,
        maxPendingBuffer: 6,
        maxPoolCapacity: 6,
        maxCanvasDimension: 2200,
        workerCleanupInterval: 5,
        interPageYieldDelayMs: 10,
        getBadgeText: (c) =>
          `🚀 4GB RAM · Balanced 5× Parallel Pipeline (${c} Cores)`,
        getDescription: (c) =>
          `4GB RAM Profile (5 Parallel Pages · ${c} Cores)`,
      };
    }

    return {
      estimatedRamGb,
      rawCores,
      heapLimitMb,
      tier: matchedProfile.tier,
      profileName: matchedProfile.profileName,
      targetConcurrency: matchedProfile.targetConcurrency,
      maxPendingBuffer: matchedProfile.maxPendingBuffer,
      maxPoolCapacity: matchedProfile.maxPoolCapacity,
      maxCanvasDimension: matchedProfile.maxCanvasDimension || 2400,
      workerCleanupInterval: matchedProfile.workerCleanupInterval || 5,
      interPageYieldDelayMs: matchedProfile.interPageYieldDelayMs || 0,
      badgeText: matchedProfile.getBadgeText(rawCores),
      tierDescription: matchedProfile.getDescription(rawCores),
    };
  }

  window.PDFCompressDevice.detectHardwareCapabilities =
    detectHardwareCapabilities;
})();
