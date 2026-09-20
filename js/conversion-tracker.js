/**
 * PDFMaster - Universal Conversion Tracker Script
 * ------------------------------------------------------------------
 * Modular, lightweight, non-blocking telemetry script that captures:
 *  - Conversion duration (ms)
 *  - Input / Output file size (bytes)
 *  - Active tool name & file metadata
 *  - Client browser & device type
 *  - Sends the data asynchronously to the Cloudflare KV Worker endpoint.
 *
 * Designed to be 100% fail-safe and completely decoupled from core PDF logic.
 * Fails silently if offline or blocked, guaranteeing zero user disruption.
 */
(function () {
  "use strict";

  // Default Worker Endpoint (change this or set window.PDFMASTER_TRACKER_CONFIG.endpoint)
  const DEFAULT_WORKER_ENDPOINT =
    "https://tracking.guptamrhappy.workers.dev/api/record";

  // Configuration with local overrides support
  const localEndpoint =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("pdfmaster_tracker_endpoint")
      : null;

  const userConfig =
    (typeof window !== "undefined" && window.PDFMASTER_TRACKER_CONFIG) || {};

  const config = {
    endpoint: userConfig.endpoint || localEndpoint || DEFAULT_WORKER_ENDPOINT,
    enabled: userConfig.enabled !== false,
    debug: Boolean(userConfig.debug),
    sampleRate:
      typeof userConfig.sampleRate === "number" ? userConfig.sampleRate : 1.0,
  };

  // Cache for deduplication (prevents double-tracking within 4 seconds)
  const recentEventKeys = new Map();

  function log(...args) {
    if (config.debug && typeof console !== "undefined") {
      console.log("[PDFMaster Tracker]", ...args);
    }
  }

  /**
   * Device & Platform Detection
   */
  function getDeviceType() {
    const ua = navigator.userAgent || "";
    if (
      /ipad|tablet|playbook|silk/i.test(ua) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua))
    ) {
      return "Tablet";
    }
    if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) {
      return "Mobile";
    }
    return "Desktop";
  }

  function getBrowserName() {
    const ua = navigator.userAgent || "";
    if (ua.includes("Firefox/")) return "Firefox";
    if (ua.includes("Edg/")) return "Edge";
    if (ua.includes("Chrome/")) return "Chrome";
    if (ua.includes("Safari/")) return "Safari";
    if (ua.includes("Opera/") || ua.includes("OPR/")) return "Opera";
    return "Unknown Browser";
  }

  function getOperatingSystem() {
    const ua = navigator.userAgent || "";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Macintosh|Mac OS/i.test(ua)) return "macOS";
    if (/Android/i.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
    if (/Linux/i.test(ua)) return "Linux";
    return "Other";
  }

  /**
   * Extract or normalize tool name
   */
  function resolveToolName(explicitTool) {
    if (
      explicitTool &&
      typeof explicitTool === "string" &&
      explicitTool.trim()
    ) {
      return explicitTool.trim();
    }
    const path = (window.location.pathname || "").toLowerCase();
    if (path.includes("merge")) return "Merge PDF";
    if (path.includes("split")) return "Split PDF";
    if (path.includes("rotate")) return "Rotate PDF";
    if (path.includes("delete")) return "Delete PDF Pages";
    if (path.includes("reorder")) return "Reorder PDF";
    if (path.includes("watermark")) return "Watermark PDF";
    if (path.includes("metadata")) return "PDF Metadata";
    if (path.includes("pdf-editor")) return "PDF Editor";
    if (path.includes("photo-to-pdf")) return "Photo to PDF";
    if (path.includes("pdf-to-photo")) return "PDF to Photo";
    if (path.includes("viewer")) return "PDF Viewer";

    // Try document title
    const title = document.title || "";
    if (title.includes("Merge")) return "Merge PDF";
    if (title.includes("Split")) return "Split PDF";
    if (title.includes("Rotate")) return "Rotate PDF";
    if (title.includes("Delete")) return "Delete PDF Pages";
    if (title.includes("Editor")) return "PDF Editor";
    return "PDF Tool";
  }

  /**
   * Transmit tracking payload to the KV server
   */
  function sendPayload(payload) {
    if (!config.enabled) {
      log("Tracking is disabled, ignoring event:", payload);
      return;
    }

    if (Math.random() > config.sampleRate) {
      log("Event skipped due to sample rate:", config.sampleRate);
      return;
    }

    const json = JSON.stringify(payload);
    log("Dispatching conversion event to:", config.endpoint, payload);

    // Prefer modern fetch with keepalive: true and credentials: 'omit'
    // Non-blocking, survives tab close/navigation, and eliminates browser credential mismatch
    if (typeof fetch === "function") {
      try {
        fetch(config.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: json,
          keepalive: true,
          mode: "cors",
          credentials: "omit",
        }).catch((err) => {
          log("Fetch dispatch silent error:", err);
        });
        return;
      } catch (err) {
        log("Fetch execution error:", err);
      }
    }

    // Fallback: sendBeacon with text/plain (avoids CORS credentials requirement)
    if (typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([json], { type: "text/plain;charset=UTF-8" });
        navigator.sendBeacon(config.endpoint, blob);
      } catch (err) {
        log("sendBeacon fallback error:", err);
      }
    }
  }

  /**
   * Main Public Tracking Method
   */
  function trackConversion(data) {
    if (!data || typeof data !== "object") return;

    try {
      const durationMs =
        typeof data.durationMs === "number" && data.durationMs > 0
          ? Math.round(data.durationMs)
          : null;

      let fileSize =
        typeof data.fileSize === "number" && data.fileSize > 0
          ? Math.round(data.fileSize)
          : 0;

      if (!fileSize && data.blob && typeof data.blob.size === "number") {
        fileSize = data.blob.size;
      }

      const tool = resolveToolName(data.tool || data.toolName);
      const fileName = data.fileName || "document.pdf";
      const fileType =
        data.fileType || (fileName.split(".").pop() || "pdf").toLowerCase();

      // Deduplication check: prevent recording duplicate calls within 4000ms
      const now = Date.now();
      const dedupeKey = `${tool}:${fileName}:${fileSize}:${Math.floor(now / 4000)}`;

      if (recentEventKeys.has(dedupeKey)) {
        log("Duplicate conversion suppressed:", dedupeKey);
        return;
      }

      // Cleanup old dedupe keys
      for (const [k, time] of recentEventKeys.entries()) {
        if (now - time > 15000) recentEventKeys.delete(k);
      }
      recentEventKeys.set(dedupeKey, now);

      const eventId = `c_${now}_${Math.random().toString(36).slice(2, 8)}`;

      const payload = {
        eventId: eventId,
        timestamp: new Date().toISOString(),
        tool: tool,
        durationMs: durationMs,
        fileSize: fileSize,
        fileName: fileName,
        fileType: fileType,
        fileDetails: data.fileDetails || null,
        url: window.location.href,
        path: window.location.pathname,
        referrer: document.referrer || "",
        device: getDeviceType(),
        browser: getBrowserName(),
        os: getOperatingSystem(),
        screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
        language: navigator.language || "en",
      };

      sendPayload(payload);
      return eventId;
    } catch (err) {
      log("Error in trackConversion:", err);
    }
  }

  /**
   * Hook into Universal Popup Modal automatically
   */
  function hookUniversalPopup() {
    if (
      typeof window.PDFMasterPopup === "object" &&
      window.PDFMasterPopup.show
    ) {
      const originalShow = window.PDFMasterPopup.show;
      if (!originalShow.__isHookedByTracker) {
        const wrappedShow = function (options) {
          try {
            if (options && typeof options === "object") {
              const sz =
                options.fileSize ||
                (options.blob && typeof options.blob.size === "number"
                  ? options.blob.size
                  : 0);

              trackConversion({
                tool: options.toolName,
                durationMs: options.durationMs,
                fileSize: sz,
                fileName: options.fileName,
                fileType: options.fileType,
                fileDetails: options.fileDetails,
                blob: options.blob,
              });
            }
          } catch (hookErr) {
            log("Popup wrapper error:", hookErr);
          }
          return originalShow.apply(this, arguments);
        };
        wrappedShow.__isHookedByTracker = true;
        window.PDFMasterPopup.show = wrappedShow;
        log("Successfully hooked into window.PDFMasterPopup.show");
      }
    }
  }

  // Listen for custom conversion events
  window.addEventListener("pdfmaster:conversion-tracked", function (e) {
    if (e.detail) {
      trackConversion(e.detail);
    }
  });

  // Export public API
  const TrackerAPI = {
    trackConversion: trackConversion,
    setEndpoint: function (url) {
      if (url && typeof url === "string") {
        config.endpoint = url.trim();
        try {
          localStorage.setItem("pdfmaster_tracker_endpoint", config.endpoint);
        } catch (_) {}
        log("Tracker endpoint updated to:", config.endpoint);
      }
    },
    getEndpoint: function () {
      return config.endpoint;
    },
    getConfig: function () {
      return Object.assign({}, config);
    },
    setEnabled: function (val) {
      config.enabled = Boolean(val);
    },
    init: function () {
      hookUniversalPopup();
    },
  };

  window.PDFMasterTracker = TrackerAPI;

  // Initialize hooks on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hookUniversalPopup);
  } else {
    hookUniversalPopup();
  }

  // Second pass in case universal-popup.js was loaded deferred
  setTimeout(hookUniversalPopup, 500);
  setTimeout(hookUniversalPopup, 1500);
})();
