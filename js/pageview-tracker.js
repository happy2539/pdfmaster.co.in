/**
 * PDFMaster - Heartbeat Page View & Session Duration Telemetry
 * --------------------------------------------------------------------------
 * Lightweight, non-blocking telemetry script that tracks:
 *  - Unique session ID per browser tab (persisted via sessionStorage)
 *  - 5-second heartbeats indicating the visitor session is alive
 *    (continues even when tab is left in background)
 *  - Matches session ID when user returns to tab without creating duplicate sessions
 *  - Session close on tab exit / close (calculating final time spent in KV)
 *
 * Persists telemetry into Cloudflare KV (ANALYTICS_TEST).
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Prevent multiple instances on the same page
  if (window.__PDFMasterPageviewTrackerInitialized) return;
  window.__PDFMasterPageviewTrackerInitialized = true;

  // Configuration
  var DEFAULT_ENDPOINT =
    "https://tracking.guptamrhappy.workers.dev/api/heartbeat";
  var HEARTBEAT_INTERVAL_MS = 5000; // 5-second heartbeat ping

  var userConfig =
    (window.PDFMASTER_TRACKER_CONFIG &&
      window.PDFMASTER_TRACKER_CONFIG.heartbeat) ||
    window.PDFMASTER_PAGEVIEW_CONFIG ||
    {};

  var endpoint = userConfig.endpoint || DEFAULT_ENDPOINT;
  var isEnabled = userConfig.enabled !== false;
  var isDebug = Boolean(userConfig.debug);

  if (!isEnabled) {
    if (isDebug) console.log("[PDFMaster Pageview] Tracking disabled by config.");
    return;
  }

  // Bot & Crawler Detection: Skip telemetry for automated headless environments
  function isBotEnvironment() {
    try {
      if (typeof navigator !== "undefined") {
        if (navigator.webdriver) return true;
        var ua = (navigator.userAgent || "").toLowerCase();
        if (/bot|crawler|spider|headless|phantom|puppeteer|selenium|preview/i.test(ua)) {
          return true;
        }
      }
      if (typeof window !== "undefined") {
        if (window.__nightmare || window._phantom || window.callPhantom) return true;
        if (window.navigator && window.navigator.userAgent === "") return true;
      }
    } catch (_) {}
    return false;
  }

  var isBot = isBotEnvironment();
  if (isBot && !userConfig.trackBots) {
    if (isDebug) console.log("[PDFMaster Pageview] Automated bot/crawler detected. Skipping heartbeat telemetry.");
    return;
  }

  function log() {
    if (isDebug && typeof console !== "undefined") {
      console.log.apply(
        console,
        ["[PDFMaster Pageview]"].concat(Array.prototype.slice.call(arguments)),
      );
    }
  }

  // Device & Client Detection
  function getDeviceType() {
    var ua = navigator.userAgent || "";
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
    var ua = navigator.userAgent || "";
    if (ua.indexOf("Firefox/") !== -1) return "Firefox";
    if (ua.indexOf("Edg/") !== -1) return "Edge";
    if (ua.indexOf("Chrome/") !== -1) return "Chrome";
    if (ua.indexOf("Safari/") !== -1) return "Safari";
    if (ua.indexOf("Opera/") !== -1 || ua.indexOf("OPR/") !== -1) return "Opera";
    return "Unknown Browser";
  }

  function getOperatingSystem() {
    var ua = navigator.userAgent || "";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Macintosh|Mac OS/i.test(ua)) return "macOS";
    if (/Android/i.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
    if (/Linux/i.test(ua)) return "Linux";
    return "Other";
  }

  // Tab-scoped Session Management using sessionStorage.
  // sessionStorage is strictly isolated per browser tab:
  // - Opening a new tab creates a fresh, empty sessionStorage -> brand new session ID.
  // - Navigating or reloading within the same tab preserves sessionStorage -> reuses same session ID.
  // - Closing the tab destroys the tab's sessionStorage.
  var TAB_SESSION_KEY = "pdfmaster_tab_session_id";
  var TAB_START_KEY = "pdfmaster_tab_session_start";

  var sessionId = null;
  var startTime = null;

  try {
    sessionId = sessionStorage.getItem(TAB_SESSION_KEY);
    var storedStart = sessionStorage.getItem(TAB_START_KEY);
    if (storedStart) startTime = parseInt(storedStart, 10);
  } catch (_) {}

  var isFirstVisitForTab = false;
  if (!sessionId || !startTime || isNaN(startTime)) {
    isFirstVisitForTab = true;
    startTime = Date.now();
    sessionId = "pv_" + startTime + "_" + Math.random().toString(36).slice(2, 9);
    try {
      sessionStorage.setItem(TAB_SESSION_KEY, sessionId);
      sessionStorage.setItem(TAB_START_KEY, startTime.toString());
    } catch (_) {}
  }

  var heartbeatTimer = null;
  var isClosed = false;

  function buildPayload(action) {
    return {
      action: action, // "start" | "heartbeat" | "close"
      sessionId: sessionId,
      page: window.location.pathname || "/",
      url: window.location.href,
      title: document.title || "",
      referrer: document.referrer || "",
      startTime: startTime,
      device: getDeviceType(),
      browser: getBrowserName(),
      os: getOperatingSystem(),
      screen: window.screen
        ? window.screen.width + "x" + window.screen.height
        : "",
      language: navigator.language || "en",
      isBot: isBot,
    };
  }

  function dispatchPayload(payload, isClosing) {
    var json = JSON.stringify(payload);
    log("Dispatching", payload.action, "event for session:", sessionId);

    // If closing on tab exit, prioritize navigator.sendBeacon
    if (isClosing && typeof navigator.sendBeacon === "function") {
      try {
        var blob = new Blob([json], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(endpoint, blob)) {
          log("Sent close beacon successfully.");
          return;
        }
      } catch (e) {
        log("Beacon fallback:", e);
      }
    }

    // Modern keepalive fetch
    if (typeof fetch === "function") {
      try {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: json,
          keepalive: true,
          mode: "cors",
          credentials: "omit",
        }).catch(function (err) {
          log("Fetch error (silent):", err);
        });
      } catch (err) {
        log("Fetch dispatch exception:", err);
      }
    }
  }

  // Send Alive Heartbeat
  function sendHeartbeat() {
    if (isClosed) return;
    dispatchPayload(buildPayload("heartbeat"), false);
  }

  // Send Session Close (when tab is closed)
  function closeSession() {
    if (isClosed) return;
    isClosed = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    dispatchPayload(buildPayload("close"), true);
    try {
      sessionStorage.removeItem(TAB_SESSION_KEY);
      sessionStorage.removeItem(TAB_START_KEY);
    } catch (_) {}
  }

  // 1. Initial Visit (or resume if navigating inside same tab)
  if (isFirstVisitForTab) {
    var startPayload = buildPayload("start");
    startPayload.isFirst = true;
    dispatchPayload(startPayload, false);
  } else {
    // Navigated to another page in same tab or reloaded: send heartbeat with same sessionId
    sendHeartbeat();
  }

  // 2. Continuous 5-second Heartbeat Loop
  // Keeps making requests every 5s even when user leaves the tab (in background)
  function startHeartbeatLoop() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(function () {
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  startHeartbeatLoop();

  // 3. Tab Visibility & Focus Management
  // When user switches tabs or returns to the tab:
  // - Send keepalive heartbeat immediately
  // - NEVER generate a new session ID when user returns; matches the exact same tab sessionId!
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      // User switched away to another tab: send immediate heartbeat keepalive ping
      sendHeartbeat();
    } else if (document.visibilityState === "visible") {
      // User came back to the tab: match SAME session ID and resume heartbeats immediately
      isClosed = false;
      sendHeartbeat();
      startHeartbeatLoop();
    }
  });

  window.addEventListener("focus", function () {
    if (!isClosed) sendHeartbeat();
  });

  // 4. Tab Close / Exit Navigation -> Close session
  window.addEventListener("pagehide", function () {
    closeSession();
  });

  window.addEventListener("beforeunload", function () {
    closeSession();
  });

  // Public API
  window.PDFMasterPageviewTracker = {
    getSessionId: function () {
      return sessionId;
    },
    getStartTime: function () {
      return startTime;
    },
    getCurrentDurationMs: function () {
      return Math.max(0, Date.now() - startTime);
    },
    getCurrentDurationSec: function () {
      return Math.round(Math.max(0, Date.now() - startTime) / 1000);
    },
    sendHeartbeat: sendHeartbeat,
    closeSession: closeSession,
    setEndpoint: function (newUrl) {
      if (newUrl && typeof newUrl === "string") {
        endpoint = newUrl.trim();
      }
    },
    getEndpoint: function () {
      return endpoint;
    },
  };
})();
