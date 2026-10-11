/**
 * PDFMaster - Active Engagement & Page Timing Telemetry Engine
 * --------------------------------------------------------------------------
 * Industry-standard client telemetry modeled after Google Analytics 4 (GA4),
 * Plausible Analytics, and W3C Page Lifecycle standards:
 *
 *  1. Active Engagement Tracking:
 *     - Distinguishes true active user attention from idle or background tabs.
 *     - Tracks active engaged time (mouse, keyboard, scroll, touch, focus).
 *     - Pauses engagement counter when user is idle (>15s inactivity) or tab is backgrounded.
 *
 *  2. W3C Page Visibility & Lifecycle Beaconing:
 *     - Listens to document.visibilityState and window.pagehide.
 *     - Reliable, non-blocking telemetry flush via navigator.sendBeacon and fetch keepalive.
 *     - Completely eliminates deprecated, blocking unload event handlers.
 *
 *  3. Adaptive Milestone Pulses (Replaces crude 5s heartbeat spam):
 *     - Eliminates 5-second interval spam that wastes mobile battery & KV write quotas.
 *     - Sends smart engagement pulses at progressive milestones (10s, 30s, 60s, 120s,
 *       and every 45s thereafter ONLY while the visitor is actively interacting).
 *
 *  4. Real User Monitoring (W3C Navigation Timing API):
 *     - Collects TTFB (Time to First Byte), DNS lookup, DOM Ready, and Page Load time.
 *
 *  5. Scroll Depth Tracking:
 *     - Records maximum scroll depth reached on page (0-100%).
 *
 *  6. Tab-scoped Session Persistence & Funnel Attribution:
 *     - Maintains seamless integration with PDFMaster conversion-tracker.js.
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Prevent multiple instances on the same page
  if (window.__PDFMasterPageviewTrackerInitialized) return;
  window.__PDFMasterPageviewTrackerInitialized = true;

  // Configuration
  var currentScript = document.currentScript;
  var scriptUrl =
    currentScript && currentScript.src ? new URL(currentScript.src) : null;
  var DEFAULT_ENDPOINT = scriptUrl
    ? scriptUrl.origin + "/api/heartbeat"
    : "https://tracking.guptamrhappy.workers.dev/api/heartbeat";

  var userConfig =
    (window.PDFMASTER_TRACKER_CONFIG &&
      (window.PDFMASTER_TRACKER_CONFIG.engagement ||
        window.PDFMASTER_TRACKER_CONFIG.heartbeat)) ||
    window.PDFMASTER_PAGEVIEW_CONFIG ||
    {};

  var endpoint = userConfig.endpoint || DEFAULT_ENDPOINT;
  var isEnabled = userConfig.enabled !== false;
  var isDebug = Boolean(userConfig.debug);

  if (!isEnabled) {
    if (isDebug)
      console.log("[PDFMaster Analytics] Telemetry disabled by configuration.");
    return;
  }

  // Bot & Crawler Detection: Skip telemetry for automated headless environments
  function isBotEnvironment() {
    try {
      if (typeof navigator !== "undefined") {
        if (navigator.webdriver) return true;
        var ua = (navigator.userAgent || "").toLowerCase();
        if (
          /bot|crawler|spider|headless|phantom|puppeteer|selenium|preview|lighthouse/i.test(
            ua,
          )
        ) {
          return true;
        }
      }
      if (typeof window !== "undefined") {
        if (window.__nightmare || window._phantom || window.callPhantom)
          return true;
        if (window.navigator && window.navigator.userAgent === "") return true;
      }
    } catch (_) {}
    return false;
  }

  var isBot = isBotEnvironment();
  if (isBot && !userConfig.trackBots) {
    if (isDebug)
      console.log(
        "[PDFMaster Analytics] Automated bot/crawler detected. Skipping telemetry.",
      );
    return;
  }

  function log() {
    if (isDebug && typeof console !== "undefined") {
      console.log.apply(
        console,
        ["[PDFMaster Analytics]"].concat(Array.prototype.slice.call(arguments)),
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
    if (ua.indexOf("Opera/") !== -1 || ua.indexOf("OPR/") !== -1)
      return "Opera";
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

  // W3C Real User Monitoring (Navigation Timing API)
  function getNavigationTimings() {
    try {
      if (typeof performance === "undefined") return null;
      var navEntries =
        performance.getEntriesByType &&
        performance.getEntriesByType("navigation");
      if (navEntries && navEntries.length > 0) {
        var nav = navEntries[0];
        return {
          dns: Math.max(
            0,
            Math.round(
              (nav.domainLookupEnd || 0) - (nav.domainLookupStart || 0),
            ),
          ),
          tcp: Math.max(
            0,
            Math.round((nav.connectEnd || 0) - (nav.connectStart || 0)),
          ),
          ttfb: Math.max(
            0,
            Math.round((nav.responseStart || 0) - (nav.requestStart || 0)),
          ),
          domReady: Math.max(
            0,
            Math.round(
              (nav.domContentLoadedEventEnd || 0) - (nav.startTime || 0),
            ),
          ),
          pageLoad: Math.max(
            0,
            Math.round((nav.loadEventEnd || 0) - (nav.startTime || 0)),
          ),
        };
      }
      if (performance.timing) {
        var t = performance.timing;
        var start = t.navigationStart;
        if (start > 0) {
          return {
            dns: Math.max(0, t.domainLookupEnd - t.domainLookupStart),
            tcp: Math.max(0, t.connectEnd - t.connectStart),
            ttfb: Math.max(0, t.responseStart - t.requestStart),
            domReady: Math.max(0, t.domContentLoadedEventEnd - start),
            pageLoad: Math.max(0, (t.loadEventEnd || Date.now()) - start),
          };
        }
      }
    } catch (_) {}
    return null;
  }

  // Scroll Depth Tracking (GA4 Enhanced Measurement)
  var maxScrollDepth = 0;
  function updateScrollDepth() {
    try {
      var doc = document.documentElement || document.body;
      var winHeight = window.innerHeight || doc.clientHeight || 0;
      var scrollHeight = doc.scrollHeight || 0;
      var scrollTop =
        window.pageYOffset || doc.scrollTop || document.body.scrollTop || 0;

      if (scrollHeight <= winHeight) {
        maxScrollDepth = 100;
        return;
      }
      var pct = Math.round(((scrollTop + winHeight) / scrollHeight) * 100);
      if (pct > maxScrollDepth) {
        maxScrollDepth = Math.min(100, Math.max(0, pct));
      }
    } catch (_) {}
  }

  // Tab-scoped Session Management using sessionStorage
  var TAB_SESSION_KEY = "pdfmaster_tab_session_id";
  var TAB_START_KEY = "pdfmaster_tab_session_start";
  var TAB_ENGAGED_KEY = "pdfmaster_tab_session_engaged";

  var sessionId = null;
  var startTime = null;
  var accumulatedEngagementMs = 0;

  try {
    sessionId = sessionStorage.getItem(TAB_SESSION_KEY);
    var storedStart = sessionStorage.getItem(TAB_START_KEY);
    if (storedStart) startTime = parseInt(storedStart, 10);
    var storedEngaged = sessionStorage.getItem(TAB_ENGAGED_KEY);
    if (storedEngaged)
      accumulatedEngagementMs = parseInt(storedEngaged, 10) || 0;
  } catch (_) {}

  var isFirstVisitForTab = false;
  var pageviewId =
    "pv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

  if (!sessionId || !startTime || isNaN(startTime)) {
    isFirstVisitForTab = true;
    startTime = Date.now();
    sessionId =
      "sess_" + startTime + "_" + Math.random().toString(36).slice(2, 9);
    accumulatedEngagementMs = 0;
    try {
      sessionStorage.setItem(TAB_SESSION_KEY, sessionId);
      sessionStorage.setItem(TAB_START_KEY, startTime.toString());
      sessionStorage.setItem(TAB_ENGAGED_KEY, "0");
    } catch (_) {}
  }

  // Active Engagement Engine State
  var IDLE_TIMEOUT_MS = 15000; // 15s without interaction -> idle
  var lastUserActivityTime = Date.now();
  var isUserActive = true;
  var isTabVisible = document.visibilityState !== "hidden";
  var engagementWindowStart = Date.now();
  var isClosed = false;

  function calculateActiveEngagementMs() {
    var now = Date.now();
    var currentSegment = 0;
    if (isTabVisible && isUserActive) {
      currentSegment = Math.max(0, now - engagementWindowStart);
    }
    return accumulatedEngagementMs + currentSegment;
  }

  function commitEngagementWindow() {
    var now = Date.now();
    if (isTabVisible && isUserActive) {
      accumulatedEngagementMs += Math.max(0, now - engagementWindowStart);
    }
    engagementWindowStart = now;
    try {
      sessionStorage.setItem(
        TAB_ENGAGED_KEY,
        accumulatedEngagementMs.toString(),
      );
    } catch (_) {}
  }

  function onUserInteraction() {
    var now = Date.now();
    lastUserActivityTime = now;
    if (!isUserActive) {
      // User was idle, now resumed activity
      isUserActive = true;
      if (isTabVisible) {
        engagementWindowStart = now;
      }
    }
  }

  // Check idle state periodically (every 3 seconds)
  var idleCheckTimer = setInterval(function () {
    if (isClosed) return;
    var now = Date.now();
    if (isUserActive && now - lastUserActivityTime >= IDLE_TIMEOUT_MS) {
      // Transition from active -> idle
      commitEngagementWindow();
      isUserActive = false;
    }
  }, 3000);

  // Attach passive interaction listeners for activity & scroll tracking
  var interactionEvents = [
    "mousemove",
    "keydown",
    "click",
    "touchstart",
    "wheel",
  ];
  var throttledActivity = false;
  function handleActivityEvent() {
    if (throttledActivity) return;
    throttledActivity = true;
    onUserInteraction();
    setTimeout(function () {
      throttledActivity = false;
    }, 1000);
  }

  interactionEvents.forEach(function (evt) {
    window.addEventListener(evt, handleActivityEvent, { passive: true });
  });

  window.addEventListener(
    "scroll",
    function () {
      handleActivityEvent();
      updateScrollDepth();
    },
    { passive: true },
  );

  // Payload Builder
  function buildPayload(action, extra) {
    commitEngagementWindow();
    updateScrollDepth();

    var now = Date.now();
    var totalDurationMs = Math.max(0, now - startTime);
    var activeEngagementMs = calculateActiveEngagementMs();

    var payload = {
      action: action, // "start" | "engagement" | "pulse" | "close"
      sessionId: sessionId,
      pageviewId: pageviewId,
      page: window.location.pathname || "/",
      url: window.location.href,
      title: document.title || "",
      referrer: document.referrer || "",
      startTime: startTime,
      serverTime: now,
      totalDurationMs: totalDurationMs,
      durationMs: totalDurationMs,
      activeEngagementMs: activeEngagementMs,
      scrollDepth: maxScrollDepth,
      isIdle: !isUserActive,
      device: getDeviceType(),
      browser: getBrowserName(),
      os: getOperatingSystem(),
      screen: window.screen
        ? window.screen.width + "x" + window.screen.height
        : "",
      language: navigator.language || "en",
      isBot: isBot,
    };

    if (action === "start" || action === "pageview") {
      payload.perf = getNavigationTimings();
    }

    if (extra && typeof extra === "object") {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) {
          payload[k] = extra[k];
        }
      }
    }

    return payload;
  }

  // Non-blocking Network Dispatcher
  function dispatchPayload(payload, isClosing) {
    var json = JSON.stringify(payload);
    log("Dispatching", payload.action, "event for session:", sessionId);

    // 1. Prioritize navigator.sendBeacon for reliable delivery during page teardown
    if (isClosing && typeof navigator.sendBeacon === "function") {
      try {
        var blob = new Blob([json], { type: "application/json" });
        if (navigator.sendBeacon(endpoint, blob)) {
          log("Sent beacon successfully.");
          return;
        }
      } catch (e) {
        log("Beacon fallback:", e);
      }
    }

    // 2. Modern keepalive fetch
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

  // 1. Initial Page View Tracking
  if (isFirstVisitForTab) {
    var startPayload = buildPayload("start");
    startPayload.isFirst = true;
    dispatchPayload(startPayload, false);
  } else {
    // Navigated to a new page within same tab: dispatch start with same session ID
    var resumePayload = buildPayload("start");
    resumePayload.isTabResume = true;
    dispatchPayload(resumePayload, false);
  }

  // 2. Adaptive Engagement Milestone Pulses
  // Progressive milestones: 10s, 30s, 60s, 120s, then every 45s only if actively engaged.
  var MILESTONES = [10000, 30000, 60000, 120000];
  var milestoneIndex = 0;
  var pulseTimer = null;
  var PERIODIC_PULSE_INTERVAL_MS = 45000;

  function sendEngagementPulse() {
    if (isClosed) return;
    // Only send pulse if tab is visible and visitor is active (saves KV writes and bandwidth)
    if (isTabVisible && isUserActive) {
      dispatchPayload(buildPayload("pulse"), false);
    }
    scheduleNextPulse();
  }

  function scheduleNextPulse() {
    if (isClosed) return;
    if (pulseTimer) clearTimeout(pulseTimer);

    var delay = PERIODIC_PULSE_INTERVAL_MS;
    if (milestoneIndex < MILESTONES.length) {
      delay = MILESTONES[milestoneIndex];
      milestoneIndex++;
    }

    pulseTimer = setTimeout(function () {
      sendEngagementPulse();
    }, delay);
  }

  scheduleNextPulse();

  // 3. W3C Page Lifecycle & Visibility Event Handlers
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      // Tab hidden / minimized: commit engagement time and flush beacon
      isTabVisible = false;
      commitEngagementWindow();
      dispatchPayload(
        buildPayload("pulse", { eventType: "visibility_hidden" }),
        true,
      );
    } else if (document.visibilityState === "visible") {
      // Tab visible again: resume engagement timer
      isTabVisible = true;
      isClosed = false;
      lastUserActivityTime = Date.now();
      isUserActive = true;
      engagementWindowStart = Date.now();
      dispatchPayload(
        buildPayload("pulse", { eventType: "visibility_visible" }),
        false,
      );
      scheduleNextPulse();
    }
  });

  window.addEventListener("focus", function () {
    if (!isClosed && !isTabVisible) {
      isTabVisible = true;
      engagementWindowStart = Date.now();
    }
    onUserInteraction();
  });

  // 4. Session Teardown on Page Exit (W3C pagehide & beforeunload)
  function closeSession(reason) {
    if (isClosed) return;
    isClosed = true;

    if (pulseTimer) {
      clearTimeout(pulseTimer);
      pulseTimer = null;
    }
    if (idleCheckTimer) {
      clearInterval(idleCheckTimer);
      idleCheckTimer = null;
    }

    commitEngagementWindow();
    dispatchPayload(
      buildPayload("close", {
        closedReason: reason || "pagehide",
      }),
      true,
    );

    try {
      sessionStorage.removeItem(TAB_SESSION_KEY);
      sessionStorage.removeItem(TAB_START_KEY);
      sessionStorage.removeItem(TAB_ENGAGED_KEY);
    } catch (_) {}
  }

  window.addEventListener("pagehide", function () {
    closeSession("pagehide");
  });

  window.addEventListener("beforeunload", function () {
    closeSession("beforeunload");
  });

  // Public API (Maintains full backward compatibility with conversion-tracker.js)
  window.PDFMasterPageviewTracker = {
    getSessionId: function () {
      return sessionId;
    },
    getPageviewId: function () {
      return pageviewId;
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
    getActiveEngagementMs: function () {
      return calculateActiveEngagementMs();
    },
    getActiveEngagementSec: function () {
      return Math.round(calculateActiveEngagementMs() / 1000);
    },
    getScrollDepth: function () {
      updateScrollDepth();
      return maxScrollDepth;
    },
    getPerformanceTiming: function () {
      return getNavigationTimings();
    },
    isUserActive: function () {
      return isUserActive && isTabVisible;
    },
    // Backwards compatibility alias for older scripts
    sendHeartbeat: function () {
      sendEngagementPulse();
    },
    sendPulse: function () {
      sendEngagementPulse();
    },
    flushEngagement: function () {
      commitEngagementWindow();
      dispatchPayload(buildPayload("pulse"), false);
    },
    closeSession: function () {
      closeSession("api_close");
    },
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
