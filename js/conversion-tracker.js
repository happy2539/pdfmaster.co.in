/**
 * PDFMaster - Universal Conversion & PDF Load Telemetry Tracker Script
 * ------------------------------------------------------------------
 * Modular, lightweight, non-blocking telemetry engine that captures:
 *  - Persistent User Identity (userId)
 *  - PDF Selection & Loading Duration (ms) recorded immediately in DB
 *  - Human Dwell Time (ms between loading PDF and clicking convert)
 *  - Conversion Duration (ms) sent to DB on processing completion
 *  - Anti-Spam Fraud Evaluation (correlating userId, load time & conversion time)
 *  - Input / Output file size (bytes) & page counts
 *  - Active tool name & non-sensitive settings
 *  - Client browser, hardware & device specifications
 *
 * Designed to be 100% fail-safe and completely decoupled from core PDF logic.
 * Automatically hooks all 19 tools across PDFMaster with zero configuration.
 */
(function () {
  "use strict";

  // Default Worker Endpoints
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
    fileLoadEndpoint:
      userConfig.fileLoadEndpoint ||
      (userConfig.endpoint || localEndpoint || DEFAULT_WORKER_ENDPOINT).replace(
        /\/api\/(record|conversion)/,
        "/api/file-load",
      ),
    enabled: userConfig.enabled !== false,
    debug: Boolean(userConfig.debug),
    sampleRate:
      typeof userConfig.sampleRate === "number" ? userConfig.sampleRate : 1.0,
  };

  // Cache for deduplication (prevents double-tracking within 25 seconds)
  const recentEventKeys = new Map();

  // Track theme toggle interactions during this browser session
  let hasUserToggledThemeInSession = false;
  try {
    if (typeof document !== "undefined") {
      document.addEventListener(
        "click",
        (e) => {
          const t = e.target;
          if (
            t &&
            (t.closest("#themeToggle") ||
              t.closest("#themeBtn") ||
              t.closest(".theme-toggle-btn") ||
              t.closest(".theme-btn") ||
              t.closest('[aria-label*="theme" i]') ||
              t.closest('[title*="theme" i]'))
          ) {
            hasUserToggledThemeInSession = true;
          }
        },
        true,
      );
    }
  } catch (_) {}

  function log(...args) {
    if (config.debug && typeof console !== "undefined") {
      console.log("[PDFMaster Tracker]", ...args);
    }
  }

  /**
   * Cryptographically Secure Pseudo-Random Number Generator (CSPRNG)
   * Resolves GitHub CodeQL security alert 'js/insecure-randomness' using industry-standard
   * Web Cryptography API (crypto.getRandomValues / crypto.randomUUID).
   *
   * @param {number} [byteLength=16] Number of cryptographically secure random bytes
   * @returns {string} Hexadecimal string of cryptographically secure entropy
   */
  function generateSecureToken(byteLength = 16) {
    try {
      const cryptoObj =
        (typeof window !== "undefined" && (window.crypto || window.msCrypto)) ||
        (typeof crypto !== "undefined" ? crypto : null);

      if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
        const buffer = new Uint8Array(byteLength);
        cryptoObj.getRandomValues(buffer);
        let hex = "";
        for (let i = 0; i < buffer.length; i++) {
          const b = buffer[i].toString(16);
          hex += b.length === 1 ? "0" + b : b;
        }
        return hex;
      }

      if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
        return cryptoObj.randomUUID().replace(/-/g, "").slice(0, byteLength * 2);
      }
    } catch (_) {}

    // Deterministic entropy fallback for non-crypto environments:
    const ts = Date.now().toString(16);
    const perf =
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? Math.floor(performance.now() * 1000).toString(16)
        : "0";
    const seed = (ts + perf + "4f8a2b1c9e3d70562e84").repeat(4);
    return seed.slice(0, byteLength * 2);
  }

  /**
   * Persistent Anonymous User Identifier (Shared across tab reloads & tools)
   */
  const USER_ID_KEY = "pdfmaster_user_id";

  function getUserId() {
    try {
      if (typeof localStorage !== "undefined") {
        let uid = localStorage.getItem(USER_ID_KEY);
        if (!uid || uid.length < 10) {
          const rand = generateSecureToken(16);
          uid = "usr_" + Date.now().toString(36) + "_" + rand;
          localStorage.setItem(USER_ID_KEY, uid);
        }
        return uid;
      }
    } catch (_) {}

    // Fallback if localStorage is disabled in strict privacy modes
    if (typeof window !== "undefined") {
      if (!window.__pdfmasterFallbackUid) {
        window.__pdfmasterFallbackUid =
          "usr_guest_" +
          Date.now().toString(36) +
          "_" +
          generateSecureToken(8);
      }
      return window.__pdfmasterFallbackUid;
    }
    return "usr_guest_anonymous";
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

  // Cached storage estimate (non-blocking query)
  let cachedStorageEstimate = null;
  function updateStorageEstimate() {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage &&
      typeof navigator.storage.estimate === "function"
    ) {
      navigator.storage
        .estimate()
        .then((est) => {
          if (est) {
            const quota = typeof est.quota === "number" ? est.quota : 0;
            const usage = typeof est.usage === "number" ? est.usage : 0;
            cachedStorageEstimate = {
              quotaBytes: quota,
              usageBytes: usage,
              freeBytes: Math.max(0, quota - usage),
            };
          }
        })
        .catch(() => {});
    }
  }

  try {
    updateStorageEstimate();
  } catch (_) {}

  /**
   * Hardware & Memory Telemetry (RAM, CPU Cores, Active Heap Memory, Storage)
   */
  function getHardwareInfo() {
    const hw = {
      deviceMemory: null,
      cpuCores: null,
      memoryUsedBytes: null,
      storageQuotaBytes: null,
      storageFreeBytes: null,
    };

    try {
      if (typeof navigator !== "undefined") {
        if (
          typeof navigator.deviceMemory === "number" &&
          navigator.deviceMemory > 0
        ) {
          hw.deviceMemory = navigator.deviceMemory;
        }
        if (
          typeof navigator.hardwareConcurrency === "number" &&
          navigator.hardwareConcurrency > 0
        ) {
          hw.cpuCores = navigator.hardwareConcurrency;
        }
      }

      if (
        typeof window !== "undefined" &&
        window.performance &&
        window.performance.memory &&
        typeof window.performance.memory.usedJSHeapSize === "number"
      ) {
        hw.memoryUsedBytes = Math.round(
          window.performance.memory.usedJSHeapSize,
        );
      }

      if (cachedStorageEstimate) {
        hw.storageQuotaBytes = cachedStorageEstimate.quotaBytes;
        hw.storageFreeBytes = cachedStorageEstimate.freeBytes;
      }
    } catch (_) {}

    return hw;
  }

  /**
   * Extract or normalize tool name across all 19 tools
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
    if (path.includes("compare-pdf")) return "Compare PDF";
    if (path.includes("compress-pdf")) return "Compress PDF";
    if (path.includes("delete-pdf-pages")) return "Delete PDF Pages";
    if (path.includes("extract-photos-from-pdf")) return "Extract Photos from PDF";
    if (path.includes("insert-blank-page-pdf")) return "Insert Blank Page PDF";
    if (path.includes("merge-pdf")) return "Merge PDF";
    if (path.includes("ocr-pdf")) return "OCR PDF";
    if (path.includes("page-number-pdf")) return "Page Number PDF";
    if (path.includes("pdf-editor")) return "PDF Editor";
    if (path.includes("pdf-metadata")) return "PDF Metadata";
    if (path.includes("pdf-reorder")) return "PDF Reorder";
    if (path.includes("pdf-to-photo")) return "PDF to Photo";
    if (path.includes("photo-to-pdf")) return "Photo to PDF";
    if (path.includes("protect-pdf")) return "Protect PDF";
    if (path.includes("rotate-pdf")) return "Rotate PDF";
    if (path.includes("sign-pdf")) return "Sign PDF";
    if (path.includes("split-pdf")) return "Split PDF";
    if (path.includes("unlock-pdf")) return "Unlock PDF";
    if (path.includes("watermark-pdf-add")) return "Watermark PDF";

    // Fallbacks via document title
    const title = document.title || "";
    if (title.includes("Compare")) return "Compare PDF";
    if (title.includes("Compress")) return "Compress PDF";
    if (title.includes("Delete")) return "Delete PDF Pages";
    if (title.includes("Blank Page")) return "Insert Blank Page PDF";
    if (title.includes("Merge")) return "Merge PDF";
    if (title.includes("OCR")) return "OCR PDF";
    if (title.includes("Number")) return "Page Number PDF";
    if (title.includes("Sign")) return "Sign PDF";
    if (title.includes("Split")) return "Split PDF";
    if (title.includes("Rotate")) return "Rotate PDF";
    if (title.includes("Reorder")) return "PDF Reorder";
    if (title.includes("Watermark")) return "Watermark PDF";
    if (title.includes("Metadata")) return "PDF Metadata";
    if (title.includes("Extract")) return "Extract Photos from PDF";
    if (title.includes("Protect")) return "Protect PDF";
    if (title.includes("Unlock")) return "Unlock PDF";
    if (title.includes("Editor")) return "PDF Editor";
    return "PDF Tool";
  }

  /**
   * Transmit tracking payload to the worker endpoint
   */
  function sendPayload(payload, customEndpoint) {
    if (!config.enabled) {
      log("Tracking is disabled, ignoring event:", payload);
      return;
    }

    if (Math.random() > config.sampleRate) {
      log("Event skipped due to sample rate:", config.sampleRate);
      return;
    }

    const endpointUrl = customEndpoint || config.endpoint;
    const json = JSON.stringify(payload);
    log("Dispatching telemetry event to:", endpointUrl, payload);

    // Prefer modern fetch with keepalive: true and credentials: 'omit'
    if (typeof fetch === "function") {
      try {
        fetch(endpointUrl, {
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

    // Fallback: sendBeacon with text/plain (avoids CORS preflight)
    if (typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([json], { type: "text/plain;charset=UTF-8" });
        navigator.sendBeacon(endpointUrl, blob);
      } catch (err) {
        log("sendBeacon fallback error:", err);
      }
    }
  }

  /**
   * PDF Load Tracking State
   */
  let activeFileLoad = null;

  /**
   * Record PDF Selection & Loading Telemetry in Database
   */
  function trackPdfLoad(data) {
    if (!data || typeof data !== "object") return;
    if (!config.enabled) return;

    try {
      const now = Date.now();
      const loadId =
        data.loadId ||
        `load_${now}_${generateSecureToken(8)}`;

      const loadDurationMs =
        typeof data.loadDurationMs === "number" && data.loadDurationMs >= 0
          ? Math.round(data.loadDurationMs)
          : typeof data.durationMs === "number" && data.durationMs >= 0
            ? Math.round(data.durationMs)
            : 0;

      const fileSize =
        typeof data.fileSize === "number" && data.fileSize >= 0
          ? Math.round(data.fileSize)
          : 0;

      const tool = resolveToolName(data.tool || data.toolName);
      const rawExt =
        data.fileExtension ||
        data.fileType ||
        (data.fileName ? data.fileName.split(".").pop() : "pdf");
      const fileExtension =
        String(rawExt || "pdf")
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase() || "PDF";
      const fileType = fileExtension.toLowerCase();

      let pageCount =
        typeof data.pageCount === "number" && data.pageCount > 0
          ? Math.round(data.pageCount)
          : null;

      // Extract sessionId if pageview tracker is active
      let pageviewSessionId = null;
      try {
        if (
          window.PDFMasterPageviewTracker &&
          typeof window.PDFMasterPageviewTracker.getSessionId === "function"
        ) {
          pageviewSessionId = window.PDFMasterPageviewTracker.getSessionId();
        } else if (typeof sessionStorage !== "undefined") {
          pageviewSessionId = sessionStorage.getItem(
            "pdfmaster_tab_session_id",
          );
        }
      } catch (_) {}

      const userId = getUserId();

      const payload = {
        type: "file_load",
        action: "file_load",
        id: loadId,
        loadId: loadId,
        userId: userId,
        sessionId: pageviewSessionId,
        tool: tool,
        loadDurationMs: loadDurationMs,
        durationMs: loadDurationMs,
        fileSize: fileSize,
        fileExtension: fileExtension,
        fileType: fileType,
        pageCount: pageCount,
        timestamp: data.timestamp || new Date(now).toISOString(),
        path: window.location.pathname,
        url: window.location.href,
        referrer: document.referrer || "",
        device: getDeviceType(),
        browser: getBrowserName(),
        os: getOperatingSystem(),
        screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
        language: navigator.language || "en",
      };

      activeFileLoad = {
        loadId: loadId,
        loadDurationMs: loadDurationMs,
        timestamp: payload.timestamp,
        fileSize: fileSize,
        tool: tool,
        pageCount: pageCount,
      };

      // Dispatched to dedicated file-load endpoint (with fallback to /api/record)
      sendPayload(payload, config.fileLoadEndpoint);

      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(
            new CustomEvent("pdfmaster:pdf-loaded", { detail: activeFileLoad }),
          );
        } catch (_) {}
      }

      return loadId;
    } catch (err) {
      log("Error in trackPdfLoad:", err);
    }
  }

  /**
   * Universal PDF Selection Listener (Applicable to all 19 tools)
   * Captures the exact moment the user selects a file and calculates load time.
   */
  let lastHandledFileKey = "";
  let lastHandledTime = 0;

  function handleFileSelectionEvent(files, sourceDesc) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;

    // Deduplication check: prevent multiple triggers for the same file within 3 seconds
    const fileKey = `${file.name}:${file.size}:${file.lastModified || 0}`;
    const now = Date.now();
    if (fileKey === lastHandledFileKey && now - lastHandledTime < 3000) {
      return;
    }
    lastHandledFileKey = fileKey;
    lastHandledTime = now;

    const selectionStartTime = performance.now();
    const isPdf =
      file.name.toLowerCase().endsWith(".pdf") ||
      file.type === "application/pdf";

    // Non-blocking asynchronous load timer measurement
    const measureLoad = () => {
      // Benchmark client disk-to-memory I/O by reading a chunk or full file
      const sliceSize = Math.min(file.size, 2 * 1024 * 1024);
      const reader = new FileReader();

      reader.onload = function (e) {
        const ioDurationMs = Math.max(
          1,
          Math.round(performance.now() - selectionStartTime),
        );
        let pageCount = null;

        // Try extracting page count quickly from PDF binary header/cross-reference table
        if (isPdf && e.target && e.target.result) {
          try {
            const bytes = new Uint8Array(e.target.result);
            const textChunk = new TextDecoder("latin1").decode(
              bytes.subarray(0, Math.min(bytes.length, 131072)),
            );
            const countMatch = textChunk.match(/\/Count\s+(\d+)/);
            if (countMatch) {
              pageCount = parseInt(countMatch[1], 10);
            }
          } catch (_) {}
        }

        const loadRecord = {
          tool: resolveToolName(),
          fileName: file.name,
          fileSize: file.size,
          fileExtension: (file.name.split(".").pop() || "pdf").toUpperCase(),
          loadDurationMs: ioDurationMs,
          pageCount: pageCount,
          timestamp: new Date().toISOString(),
        };

        log(
          "PDF selected via",
          sourceDesc,
          "- load time:",
          ioDurationMs,
          "ms",
          loadRecord,
        );
        trackPdfLoad(loadRecord);
      };

      reader.onerror = function () {
        const fallbackDuration = Math.max(
          1,
          Math.round(performance.now() - selectionStartTime),
        );
        trackPdfLoad({
          tool: resolveToolName(),
          fileName: file.name,
          fileSize: file.size,
          loadDurationMs: fallbackDuration,
          timestamp: new Date().toISOString(),
        });
      };

      try {
        reader.readAsArrayBuffer(file.slice(0, sliceSize));
      } catch (_) {
        trackPdfLoad({
          tool: resolveToolName(),
          fileName: file.name,
          fileSize: file.size,
          loadDurationMs: Math.max(
            1,
            Math.round(performance.now() - selectionStartTime),
          ),
          timestamp: new Date().toISOString(),
        });
      }
    };

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(measureLoad, { timeout: 300 });
    } else {
      setTimeout(measureLoad, 10);
    }
  }

  function setupUniversalFileSelectionListeners() {
    // 1. Capture change events on file inputs across the entire document
    document.addEventListener(
      "change",
      function (e) {
        try {
          const target = e.target;
          if (
            target &&
            target.tagName === "INPUT" &&
            target.type === "file" &&
            target.files &&
            target.files.length > 0
          ) {
            handleFileSelectionEvent(target.files, "input[type='file']");
          }
        } catch (_) {}
      },
      true, // Capturing phase ensures reception even if child stopPropagation() is called
    );

    // 2. Capture drop events across document / dropzones
    document.addEventListener(
      "drop",
      function (e) {
        try {
          if (
            e.dataTransfer &&
            e.dataTransfer.files &&
            e.dataTransfer.files.length > 0
          ) {
            handleFileSelectionEvent(e.dataTransfer.files, "drag-and-drop");
          }
        } catch (_) {}
      },
      true,
    );
  }

  /**
   * Detect device and site theme preferences and whether user customized it
   */
  function getDeviceTheme() {
    try {
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        return "dark";
      }
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
      ) {
        return "light";
      }
    } catch (_) {}
    return "light";
  }

  function getSiteTheme() {
    try {
      const htmlTheme = document.documentElement.getAttribute("data-theme");
      if (htmlTheme) return htmlTheme.toLowerCase();
      const bodyTheme = document.body?.getAttribute("data-theme");
      if (bodyTheme) return bodyTheme.toLowerCase();
      if (document.documentElement.classList.contains("dark")) return "dark";
      const stored =
        localStorage.getItem("pdfmaster-theme") ||
        localStorage.getItem("pdfmaster_theme") ||
        localStorage.getItem("theme");
      if (stored) return stored.toLowerCase();
    } catch (_) {}
    return "light";
  }

  function getThemeTelemetry() {
    const deviceTheme = getDeviceTheme();
    const siteTheme = getSiteTheme();

    let userPref = null;
    try {
      userPref =
        localStorage.getItem("pdfmaster-theme") ||
        localStorage.getItem("pdfmaster_theme") ||
        localStorage.getItem("theme");
    } catch (_) {}

    // Theme changed check:
    // 1. User clicked a theme toggle button during this browser session
    // 2. OR user has an explicit saved preference in localStorage
    // 3. OR the site theme currently differs from the device OS theme
    const themeExplicitlySet = userPref !== null && userPref !== "";
    const themeDiffersFromDevice = siteTheme !== deviceTheme;
    const themeChanged = Boolean(
      hasUserToggledThemeInSession ||
        themeExplicitlySet ||
        themeDiffersFromDevice,
    );

    return {
      deviceTheme: deviceTheme, // "dark" or "light" (Device OS preference)
      siteTheme: siteTheme, // "dark" or "light" (Active site theme)
      themeChanged: themeChanged, // boolean: true if user changed/customized theme
      userPreference: userPref ? userPref.toLowerCase() : "system", // "dark", "light", or "system"
    };
  }

  /**
   * Safely harvest non-sensitive configuration settings from the active tool UI
   */
  function harvestToolSettings(toolName, explicitSettings) {
    const harvested = {};
    const norm = String(
      toolName || (typeof window !== "undefined" ? window.location.pathname : "") || "",
    ).toLowerCase();

    // 1. Copy explicit settings if provided (sanitizing any sensitive/raw data)
    if (explicitSettings && typeof explicitSettings === "object") {
      for (const [k, v] of Object.entries(explicitSettings)) {
        if (v === null || typeof v === "undefined") continue;
        if (
          /dataurl|imagedata|strokes|rawpassword|^password$|^name$|^filename$/i.test(
            k,
          )
        ) {
          continue;
        }
        if (
          k === "typedText" ||
          (k === "text" && typeof v === "string" && v.length > 80)
        ) {
          continue;
        }
        harvested[k] = v;
      }
    }

    // 2. Dynamic DOM harvesting per tool type
    if (typeof document === "undefined") return harvested;
    try {
      // Compress PDF
      if (norm.includes("compress")) {
        const dpiSlider = document.getElementById("dpiSlider");
        if (dpiSlider && dpiSlider.value) {
          harvested.dpi = parseInt(dpiSlider.value, 10);
        }
        const qualitySlider = document.getElementById("qualitySlider");
        if (qualitySlider && qualitySlider.value) {
          harvested.quality = parseInt(qualitySlider.value, 10);
        }
        const grayscaleSwitch = document.getElementById("grayscaleSwitch");
        if (grayscaleSwitch) {
          harvested.grayscale = Boolean(grayscaleSwitch.checked);
        }
        const activeLevel = document.querySelector(
          ".level-card.active, .compression-option.active",
        );
        if (activeLevel) {
          const lvlText = activeLevel
            .querySelector("h3, h4, .level-title")
            ?.textContent?.trim();
          if (lvlText) harvested.level = lvlText;
        }
      }

      // Rotate PDF
      if (norm.includes("rotate")) {
        const activeAngle = document.querySelector(
          ".angle-btn.active, [data-angle].active",
        );
        if (activeAngle) {
          harvested.angle =
            activeAngle.getAttribute("data-angle") ||
            activeAngle.textContent.trim();
        }
      }

      // Split PDF
      if (norm.includes("split")) {
        const checkedMode = document.querySelector(
          'input[name="splitMode"]:checked, input[name="split-mode"]:checked',
        );
        if (checkedMode) harvested.splitMode = checkedMode.value;
        const pageRange =
          document.getElementById("pageRangeInput") ||
          document.getElementById("rangeInput");
        if (pageRange && pageRange.value) {
          harvested.pageRange = pageRange.value.trim().slice(0, 50);
        }
      }

      // Photo to PDF
      if (norm.includes("photo") && norm.includes("pdf")) {
        const chkCompress = document.getElementById("chkCompress");
        if (chkCompress) harvested.compress = Boolean(chkCompress.checked);
        const chkOnePage = document.getElementById("chkOnePage");
        if (chkOnePage) harvested.oneImagePerPage = Boolean(chkOnePage.checked);
        const orientation =
          document.getElementById("pageOrientation") ||
          document.querySelector('input[name="orientation"]:checked');
        if (orientation) {
          harvested.orientation =
            orientation.value || orientation.textContent?.trim();
        }
        const pageSize =
          document.getElementById("pageSize") ||
          document.querySelector('input[name="pageSize"]:checked');
        if (pageSize) {
          harvested.pageSize = pageSize.value || pageSize.textContent?.trim();
        }
      }

      // PDF to Photo
      if (norm.includes("photo") || norm.includes("image")) {
        const fmtSelect =
          document.getElementById("formatSelect") ||
          document.getElementById("imageFormat");
        if (fmtSelect && fmtSelect.value) harvested.format = fmtSelect.value;
        const dpiSelect = document.getElementById("dpiSelect");
        if (dpiSelect && dpiSelect.value) harvested.dpi = dpiSelect.value;
      }

      // Watermark PDF
      if (norm.includes("watermark")) {
        const wmType = document.querySelector(
          'input[name="wmType"]:checked, .wm-tab.active',
        );
        if (wmType) {
          harvested.watermarkType =
            wmType.value || wmType.getAttribute("data-type") || "text";
        }
        const wmPosition =
          document.getElementById("wmPosition") ||
          document.querySelector(".pos-grid-cell.active");
        if (wmPosition) {
          harvested.position =
            wmPosition.value || wmPosition.getAttribute("data-pos") || "center";
        }
        const wmOpacity =
          document.getElementById("wmOpacity") ||
          document.getElementById("opacitySlider");
        if (wmOpacity && wmOpacity.value) {
          harvested.opacity = parseFloat(wmOpacity.value);
        }
      }

      // Page Number PDF
      if (norm.includes("number")) {
        const pos = document.querySelector(
          ".pos-btn.active, [data-position].active",
        );
        if (pos) {
          harvested.position =
            pos.getAttribute("data-position") || pos.value;
        }
        const fmt =
          document.getElementById("formatSelect") ||
          document.querySelector(".format-chip.active");
        if (fmt) {
          harvested.format = fmt.value || fmt.getAttribute("data-format");
        }
        const startNum = document.getElementById("startNumberInput");
        if (startNum && startNum.value) {
          harvested.startNumber = parseInt(startNum.value, 10);
        }
      }

      // Protect PDF (Zero plain-text password leakage)
      if (norm.includes("protect") || norm.includes("encrypt")) {
        const passInput =
          document.getElementById("userPassword") ||
          document.querySelector('input[type="password"]');
        if (passInput) {
          harvested.hasPassword = Boolean(
            passInput.value && passInput.value.length > 0,
          );
          harvested.passwordLength = passInput.value
            ? passInput.value.length
            : 0;
          harvested.algorithm = "AES-256";
        }
      }

      // Unlock PDF
      if (norm.includes("unlock")) {
        harvested.unlocked = true;
      }

      // Delete PDF Pages
      if (norm.includes("delete")) {
        const delStat =
          document.getElementById("deletedCount") ||
          document.getElementById("deleteCount");
        if (delStat)
          harvested.pagesDeleted = parseInt(delStat.textContent, 10) || 1;
      }

      // Insert Blank Page
      if (norm.includes("blank")) {
        const pos =
          document.getElementById("insertPosition") ||
          document.getElementById("blankPosition");
        if (pos) harvested.position = pos.value;
      }

      // OCR PDF
      if (norm.includes("ocr")) {
        const lang =
          document.getElementById("ocrLanguage") ||
          document.getElementById("langSelect");
        if (lang) harvested.language = lang.value;
      }
    } catch (_) {}

    return harvested;
  }

  /**
   * Main Public Tracking Method: trackConversion
   * Correlates userId, PDF load duration, and conversion duration for anti-spam calculation
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

      // Extract file extension strictly for user privacy (e.g. PDF, JPG, PNG, DOCX, ZIP)
      const rawExt =
        data.fileExtension ||
        data.fileType ||
        (data.fileName ? data.fileName.split(".").pop() : "pdf");
      const fileExtension =
        String(rawExt || "pdf")
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase() || "PDF";
      const fileType = fileExtension.toLowerCase();

      // Resolve page count and photo count
      let pageCount =
        typeof data.pageCount === "number" && data.pageCount > 0
          ? Math.round(data.pageCount)
          : typeof data.totalPages === "number" && data.totalPages > 0
            ? Math.round(data.totalPages)
            : typeof data.numPages === "number" && data.numPages > 0
              ? Math.round(data.numPages)
              : (activeFileLoad ? activeFileLoad.pageCount : null);

      let photoCount =
        typeof data.photoCount === "number" && data.photoCount > 0
          ? Math.round(data.photoCount)
          : typeof data.imageCount === "number" && data.imageCount > 0
            ? Math.round(data.imageCount)
            : typeof data.images === "number" && data.images > 0
              ? Math.round(data.images)
              : null;

      if (data.fileDetails && typeof data.fileDetails === "string") {
        if (photoCount === null) {
          const phMatch = data.fileDetails.match(
            /(\d+)\s*(?:photo|image|picture)s?/i,
          );
          if (phMatch) photoCount = parseInt(phMatch[1], 10);
        }
        if (pageCount === null) {
          const pMatch = data.fileDetails.match(/(\d+)\s*page/i);
          if (pMatch) pageCount = parseInt(pMatch[1], 10);
        }
      }

      const tLower = (tool || "").toLowerCase();
      if (
        tLower.includes("photo to pdf") &&
        photoCount === null &&
        pageCount !== null
      ) {
        photoCount = pageCount;
      } else if (
        tLower.includes("pdf to photo") &&
        pageCount === null &&
        photoCount !== null
      ) {
        pageCount = photoCount;
      }

      let signedPageCount =
        typeof data.signedPageCount === "number" && data.signedPageCount > 0
          ? Math.round(data.signedPageCount)
          : null;

      if (
        signedPageCount === null &&
        data.fileDetails &&
        typeof data.fileDetails === "string"
      ) {
        const signMatch = data.fileDetails.match(/(\d+)\s*signed/i);
        if (signMatch) signedPageCount = parseInt(signMatch[1], 10);
      }

      // Collect structured theme telemetry and tool-specific settings
      const themeData = getThemeTelemetry();
      const toolSettings = harvestToolSettings(tool, data.settings);

      // Clean, structured settings object:
      // Stores theme telemetry, tool settings, and top-level aliases for clean inspection
      const settings = {
        theme: themeData,
        tool: toolSettings,
        ...toolSettings,
      };

      // Deduplication check: prevent recording duplicate calls within cooldown (25s)
      const now = Date.now();
      const normTool = (tool || "pdf-tool")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const dedupeKey = `${normTool}:${fileExtension}:${fileSize}`;

      if (recentEventKeys.has(dedupeKey)) {
        const lastTime = recentEventKeys.get(dedupeKey);
        if (now - lastTime < 25000) {
          log(
            "Duplicate conversion suppressed (cooldown active):",
            dedupeKey,
            `${now - lastTime}ms ago`,
          );
          return;
        }
      }

      for (const [k, time] of recentEventKeys.entries()) {
        if (now - time > 60000) recentEventKeys.delete(k);
      }
      recentEventKeys.set(dedupeKey, now);

      // Resolve hardware & memory metrics
      const hw = getHardwareInfo();
      const deviceMemory =
        typeof data.deviceMemory === "number" && data.deviceMemory > 0
          ? data.deviceMemory
          : hw.deviceMemory;

      const cpuCores =
        typeof data.cpuCores === "number" && data.cpuCores > 0
          ? Math.round(data.cpuCores)
          : hw.cpuCores;

      const memoryUsedBytes =
        typeof data.memoryUsedBytes === "number" && data.memoryUsedBytes > 0
          ? Math.round(data.memoryUsedBytes)
          : typeof data.memoryDeltaBytes === "number" &&
              data.memoryDeltaBytes > 0
            ? Math.round(data.memoryDeltaBytes)
            : typeof data.heapUsed === "number" && data.heapUsed > 0
              ? Math.round(data.heapUsed)
              : hw.memoryUsedBytes;

      const storageQuotaBytes =
        typeof data.storageQuotaBytes === "number" && data.storageQuotaBytes > 0
          ? Math.round(data.storageQuotaBytes)
          : hw.storageQuotaBytes;

      const storageFreeBytes =
        typeof data.storageFreeBytes === "number" && data.storageFreeBytes > 0
          ? Math.round(data.storageFreeBytes)
          : hw.storageFreeBytes;

      // Bot & Automation Detection
      const isBot = Boolean(
        (typeof navigator !== "undefined" && navigator.webdriver) ||
          (typeof window !== "undefined" &&
            (window.__nightmare || window._phantom || window.callPhantom)),
      );
      if (isBot) {
        log("Automated bot/crawler detected. Conversion telemetry suppressed.");
        return null;
      }

      // Funnel Attribution: Link conversion event to the active tab pageview session
      let pageviewSessionId = null;
      let sessionDurationBeforeConversionMs = null;
      try {
        if (
          window.PDFMasterPageviewTracker &&
          typeof window.PDFMasterPageviewTracker.getSessionId === "function"
        ) {
          pageviewSessionId = window.PDFMasterPageviewTracker.getSessionId();
          if (
            typeof window.PDFMasterPageviewTracker.getCurrentDurationMs ===
            "function"
          ) {
            sessionDurationBeforeConversionMs =
              window.PDFMasterPageviewTracker.getCurrentDurationMs();
          }
        } else if (typeof sessionStorage !== "undefined") {
          pageviewSessionId = sessionStorage.getItem(
            "pdfmaster_tab_session_id",
          );
          const storedStart = sessionStorage.getItem(
            "pdfmaster_tab_session_start",
          );
          if (storedStart) {
            sessionDurationBeforeConversionMs = Math.max(
              0,
              Date.now() - parseInt(storedStart, 10),
            );
          }
        }
      } catch (_) {}

      // Calculate Human Dwell Time (time from PDF load finish to clicking convert)
      let dwellTimeMs = null;
      let loadDurationMs = 0;
      let loadId = null;

      if (activeFileLoad) {
        loadId = activeFileLoad.loadId;
        loadDurationMs = activeFileLoad.loadDurationMs || 0;
        if (activeFileLoad.timestamp) {
          const loadTimestamp = new Date(activeFileLoad.timestamp).getTime();
          dwellTimeMs = Math.max(0, now - loadTimestamp);
        }
      } else if (typeof data.loadDurationMs === "number") {
        loadDurationMs = data.loadDurationMs;
      }

      const eventId = `c_${now}_${generateSecureToken(8)}`;
      const userId = getUserId();

      const payload = {
        eventId: eventId,
        userId: userId,
        sessionId: pageviewSessionId,
        loadId: loadId,
        loadDurationMs: loadDurationMs,
        dwellTimeMs: dwellTimeMs,
        sessionDurationMs: sessionDurationBeforeConversionMs,
        timestamp: new Date().toISOString(),
        tool: tool,
        durationMs: durationMs,
        fileSize: fileSize,
        fileExtension: fileExtension,
        fileType: fileType,
        pageCount: pageCount,
        photoCount: photoCount,
        signedPageCount: signedPageCount,
        settings: settings,
        deviceMemory: deviceMemory,
        cpuCores: cpuCores,
        memoryUsedBytes: memoryUsedBytes,
        storageQuotaBytes: storageQuotaBytes,
        storageFreeBytes: storageFreeBytes,
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
   * Hook into Universal Popup Modal automatically (all 19 tools route through here)
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
              const isReDownload =
                options.skipTracking === true ||
                (options.downloadText && /again/i.test(options.downloadText)) ||
                (options.title && /again/i.test(options.title));

              if (!isReDownload && !options.__trackedByTracker) {
                options.__trackedByTracker = true;
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
                  fileExtension: options.fileExtension,
                  pageCount:
                    options.pageCount ||
                    options.totalPages ||
                    options.numPages ||
                    null,
                  signedPageCount: options.signedPageCount || null,
                  settings: options.settings || null,
                  photoCount:
                    options.photoCount ||
                    options.imageCount ||
                    options.images ||
                    null,
                  deviceMemory: options.deviceMemory || null,
                  cpuCores: options.cpuCores || null,
                  memoryUsedBytes:
                    options.memoryUsedBytes || options.heapUsed || null,
                  storageQuotaBytes: options.storageQuotaBytes || null,
                  storageFreeBytes: options.storageFreeBytes || null,
                  fileDetails: options.fileDetails,
                  blob: options.blob,
                });
              }
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

  // Reset dedupe cache on conversion button click to allow deliberate re-conversions
  function setupConversionButtonListeners() {
    try {
      const selectors = [
        "#convertBtn",
        ".btn-convert",
        "#mergeBtn",
        "#mergePdfBtn",
        "#splitBtn",
        "#rotateBtn",
        "#rotatePdfPrimaryBtn",
        "#signPdfPrimaryBtn",
        "#applyWatermarkBtn",
        "#cleanMetaBtn",
        "#compressPdfBtn",
        "#deletePagesBtn",
        "#insertBlankPageBtn",
        "#reorderPagesBtn",
        "#protectPdfBtn",
        "#unlockPdfBtn",
        "#comparePdfBtn",
        "#extractPhotosBtn",
        "#ocrPdfBtn",
        "#pageNumberBtn",
        "[data-action='convert']",
        "[data-action='process']",
      ];
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          if (!el.__trackerListenerBound) {
            el.__trackerListenerBound = true;
            el.addEventListener("click", () => {
              recentEventKeys.clear();
              log("Conversion button clicked, dedupe cooldown reset.");
            });
          }
        });
      });
    } catch (_) {}
  }

  // Listen for custom conversion events
  window.addEventListener("pdfmaster:conversion-tracked", function (e) {
    if (e.detail && !e.detail.__alreadyHandledByDirectCall) {
      trackConversion(e.detail);
    }
  });

  // Export public API
  const TrackerAPI = {
    getUserId: getUserId,
    trackPdfLoad: trackPdfLoad,
    recordFileLoad: trackPdfLoad,
    getLastLoad: function () {
      return activeFileLoad ? { ...activeFileLoad } : null;
    },
    startLoadTimer: function () {
      return performance.now();
    },
    endLoadTimer: function (startMark, meta) {
      const dur = Math.max(
        1,
        Math.round(performance.now() - (startMark || 0)),
      );
      trackPdfLoad({
        ...(meta || {}),
        loadDurationMs: dur,
      });
      return dur;
    },
    trackConversion: trackConversion,
    recordConversion: trackConversion,
    setEndpoint: function (url) {
      if (url && typeof url === "string") {
        config.endpoint = url.trim();
        config.fileLoadEndpoint = config.endpoint.replace(
          /\/api\/(record|conversion)/,
          "/api/file-load",
        );
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
    clearDedupeCache: function () {
      recentEventKeys.clear();
      log("Dedupe cache manually cleared.");
    },
    init: function () {
      hookUniversalPopup();
      setupConversionButtonListeners();
      setupUniversalFileSelectionListeners();
    },
  };

  window.PDFMasterTracker = TrackerAPI;

  function initTracker() {
    hookUniversalPopup();
    setupConversionButtonListeners();
    setupUniversalFileSelectionListeners();
  }

  // Initialize hooks on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTracker);
  } else {
    initTracker();
  }

  // Second & third pass in case universal-popup.js was loaded deferred
  setTimeout(initTracker, 500);
  setTimeout(initTracker, 1500);

  // Automatic Heartbeat Pageview Telemetry loader
  function initHeartbeatTracking() {
    if (
      typeof window !== "undefined" &&
      !window.__PDFMasterPageviewTrackerInitialized
    ) {
      if (document.querySelector('script[src*="pageview-tracker.js"]')) return;
      var s = document.createElement("script");
      s.src = "/js/pageview-tracker.js";
      s.defer = true;
      document.head.appendChild(s);
    }
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initHeartbeatTracking);
    } else {
      initHeartbeatTracking();
    }
  } catch (_) {}
})();
