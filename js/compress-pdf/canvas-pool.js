/**
 * PDFMaster - Canvas Slot Pool
 * Bounded offscreen canvas context pool for concurrent rendering without GPU texture churn.
 */
(function () {
  "use strict";

  const state = window.PDFCompressState;
  let trackedBytesInFlight = 0;
  const canvasSlotPool = [];

  function acquireCanvasSlot(width, height) {
    let slot;
    if (canvasSlotPool.length > 0) {
      slot = canvasSlotPool.pop();
    } else {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      slot = { canvas, ctx };
    }

    if (width && height) {
      // Check if dimension exceeds device profile limit to prevent huge GPU texture allocations
      let targetW = width;
      let targetH = height;
      const maxDim =
        (state.hardwareConfig && state.hardwareConfig.maxCanvasDimension) ||
        3200;

      if (targetW > maxDim || targetH > maxDim) {
        const scaleFactor = Math.min(maxDim / targetW, maxDim / targetH);
        targetW = Math.round(targetW * scaleFactor);
        targetH = Math.round(targetH * scaleFactor);
      }

      if (slot.canvas.width !== targetW || slot.canvas.height !== targetH) {
        slot.canvas.width = targetW;
        slot.canvas.height = targetH;
      }
    }
    return slot;
  }

  function releaseCanvasSlot(slot) {
    if (!slot) return;
    try {
      const maxCapacity =
        (state.hardwareConfig && state.hardwareConfig.maxPoolCapacity) || 8;
      if (canvasSlotPool.length < maxCapacity) {
        canvasSlotPool.push(slot);
      } else {
        // Free GPU texture memory
        slot.canvas.width = 1;
        slot.canvas.height = 1;
      }
    } catch (_) {}
  }

  function purgeCanvasSlotPool() {
    while (canvasSlotPool.length > 0) {
      const slot = canvasSlotPool.pop();
      if (slot && slot.canvas) {
        slot.canvas.width = 1;
        slot.canvas.height = 1;
      }
    }
  }

  function addTrackedBytes(bytes) {
    trackedBytesInFlight += bytes;
  }

  function removeTrackedBytes(bytes) {
    trackedBytesInFlight = Math.max(0, trackedBytesInFlight - bytes);
  }

  function getTrackedBytes() {
    return trackedBytesInFlight;
  }

  window.PDFCompressCanvasPool = {
    acquireCanvasSlot,
    releaseCanvasSlot,
    purgeCanvasSlotPool,
    addTrackedBytes,
    removeTrackedBytes,
    getTrackedBytes,
  };
})();
