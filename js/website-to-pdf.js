/* 1. Theme init (also done inline above for anti-FOUC) */
(function () {
  var s = localStorage.getItem("pdfmaster-theme");
  var d =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme:dark)").matches;
  document.documentElement.setAttribute(
    "data-theme",
    s || (d ? "dark" : "light"),
  );
})();

document.addEventListener("DOMContentLoaded", function () {
  /* ── THEME TOGGLE ── */
  var themeBtn = document.getElementById("themeBtn");
  function syncTheme() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.innerHTML = dark
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    themeBtn.setAttribute(
      "aria-label",
      dark ? "Switch to light mode" : "Switch to dark mode",
    );
  }
  syncTheme();
  themeBtn.addEventListener("click", function () {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    var next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("pdfmaster-theme", next);
    syncTheme();
  });

  /* ── DRAWER ── */
  var hamBtn = document.getElementById("hamBtn");
  var drawer = document.getElementById("drawer");
  var overlay = document.getElementById("overlay");
  var drawerClose = document.getElementById("drawerClose");
  function openDrawer() {
    drawer.classList.add("open");
    overlay.classList.add("open");
    hamBtn.classList.add("ham-open");
    hamBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
    hamBtn.classList.remove("ham-open");
    hamBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  hamBtn.addEventListener("click", openDrawer);
  drawerClose.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", closeDrawer);
  document.querySelectorAll(".drawer-nav a").forEach(function (a) {
    a.addEventListener("click", closeDrawer);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });

  /* ── ADVANCED OPTIONS ── */
  var advToggle = document.getElementById("advToggle");
  var advPanel = document.getElementById("advPanel");
  advToggle.addEventListener("click", function () {
    var open = advPanel.classList.toggle("open");
    advToggle.classList.toggle("open", open);
    advToggle.setAttribute("aria-expanded", String(open));
    advPanel.setAttribute("aria-hidden", String(!open));
  });


  /* ── BACK TO TOP ── */
  var btt = document.getElementById("btt");
  window.addEventListener(
    "scroll",
    function () {
      btt.classList.toggle("show", window.scrollY > 380);
    },
    { passive: true },
  );
  btt.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ── FAQ ACCORDION ── */
  document.querySelectorAll(".faq-q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = this.closest(".faq-item");
      var open = item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach(function (el) {
        el.classList.remove("open");
        el.querySelector(".faq-q").setAttribute("aria-expanded", "false");
        el.querySelector(".faq-a").setAttribute("aria-hidden", "true");
      });
      if (!open) {
        item.classList.add("open");
        this.setAttribute("aria-expanded", "true");
        item.querySelector(".faq-a").setAttribute("aria-hidden", "false");
      }
    });
  });

  /* ══════════════════════════════════════════════════════
     CONVERSION ENGINE
  ══════════════════════════════════════════════════════ */

  var urlInput = document.getElementById("urlInput");
  var convertBtn = document.getElementById("convertBtn");
  var btnIco = document.getElementById("btnIco");
  var btnTxt = document.getElementById("btnTxt");
  var progBox = document.getElementById("progBox");
  var progLbl = document.getElementById("progLbl");
  var progPct = document.getElementById("progPct");
  var progFill = document.getElementById("progFill");
  var progBar = document.getElementById("progBar");
  var errBox = document.getElementById("errBox");
  var errTitle = document.getElementById("errTitle");
  var errDesc = document.getElementById("errDesc");
  var resBox = document.getElementById("resBox");
  var resFname = document.getElementById("resFname");
  var dlBtn = document.getElementById("dlBtn");
  var openBtn = document.getElementById("openBtn");
  var againBtn = document.getElementById("againBtn");

  var currentPdf = null;
  var currentFile = "";
  var currentBlob = null;
  var converting = false;

  var STEPS = ["fetch", "process", "render", "capture", "pdf"];

  /* ── helpers ── */
  function setStep(name) {
    var idx = STEPS.indexOf(name);
    STEPS.forEach(function (s, i) {
      var el = document.querySelector('[data-step="' + s + '"]');
      if (!el) return;
      el.className = "ps" + (i < idx ? " done" : i === idx ? " active" : "");
    });
  }

  function setProg(pct, label) {
    pct = Math.max(0, Math.min(100, pct));
    progFill.style.width = pct + "%";
    progPct.textContent = Math.round(pct) + "%";
    progLbl.textContent = label;
    progBar.setAttribute("aria-valuenow", Math.round(pct));
  }

  function showError(title, desc) {
    progBox.classList.remove("show");
    errBox.classList.add("show");
    resBox.classList.remove("show");
    errTitle.textContent = title;
    errDesc.textContent = desc;
    resetBtn();
  }

  function showResult(fname, pdfObj, blob) {
    progBox.classList.remove("show");
    errBox.classList.remove("show");
    resBox.classList.add("show");
    resFname.textContent = fname;
    currentPdf = pdfObj;
    currentFile = fname;
    currentBlob = blob || null;
    resetBtn();
  }

  function resetBtn() {
    converting = false;
    convertBtn.disabled = false;
    btnIco.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6"/><path d="M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>';
    btnTxt.textContent = "Convert to PDF";
  }

  function startUI() {
    converting = true;
    convertBtn.disabled = true;
    btnIco.innerHTML = '<span class="spin"></span>';
    btnTxt.textContent = "Converting…";
    progBox.classList.add("show");
    errBox.classList.remove("show");
    resBox.classList.remove("show");
    setProg(0, "Starting…");
  }

  /* ── URL helpers ── */
  function resolveUrl(rel, base) {
    if (!rel) return "";
    var s = rel.trim();
    if (
      !s ||
      s.startsWith("data:") ||
      s.startsWith("#") ||
      s.startsWith("javascript:")
    )
      return s;
    try {
      return new URL(s, base).href;
    } catch (e) {
      return s;
    }
  }

  function getProxyUrl(url, proxy) {
    if (!url) return "";
    var s = url.trim();
    if (
      !s ||
      s.startsWith("data:") ||
      s.startsWith("blob:") ||
      s.startsWith("javascript:") ||
      s.startsWith("#")
    ) {
      return s;
    }
    // Only proxy http/https URLs
    if (!s.match(/^https?:\/\//i)) {
      return s;
    }
    // Avoid proxying local addresses
    if (
      s.indexOf("localhost") > -1 ||
      s.indexOf("127.0.0.1") > -1 ||
      s.indexOf("192.168.") > -1 ||
      s.indexOf("10.") > -1
    ) {
      return s;
    }
    // If we have a successful proxy that returns raw content, use it.
    if (proxy && typeof proxy.url === "function") {
      if (
        !proxy.direct &&
        proxy.name !== "AllOrigins-get" &&
        proxy.name !== "HTMLDriven"
      ) {
        return proxy.url(s);
      }
    }
    // Fallback/default raw proxy
    return "https://corsproxy.io/?" + encodeURIComponent(s);
  }

  /* ── HTML processing ── */
  function processHtml(html, pageUrl, proxy) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, "text/html");

    // Process images (rewriting source to CORS proxy and adding crossorigin attribute)
    doc.querySelectorAll("img").forEach(function (el) {
      var src = el.getAttribute("src");
      if (src) {
        var abs = resolveUrl(src, pageUrl);
        el.setAttribute("src", getProxyUrl(abs, proxy));
      }
      el.setAttribute("crossorigin", "anonymous");
      el.removeAttribute("srcset");
      el.removeAttribute("loading");
      el.removeAttribute("decoding");
    });

    ["data-src", "data-lazy", "data-original", "data-lazy-src"].forEach(
      function (attr) {
        doc.querySelectorAll("img[" + attr + "]").forEach(function (el) {
          var v = el.getAttribute(attr);
          if (v && !el.getAttribute("src")) {
            var abs = resolveUrl(v, pageUrl);
            el.setAttribute("src", getProxyUrl(abs, proxy));
          }
          el.removeAttribute(attr);
        });
      },
    );

    doc.querySelectorAll("source").forEach(function (el) {
      el.remove();
    });

    // Process stylesheets (rewriting link to CORS proxy and adding crossorigin attribute)
    doc.querySelectorAll('link[rel="stylesheet"][href]').forEach(function (el) {
      var abs = resolveUrl(el.getAttribute("href"), pageUrl);
      el.setAttribute("href", getProxyUrl(abs, proxy));
      el.setAttribute("crossorigin", "anonymous");
    });

    // Process inline styles with background images
    doc.querySelectorAll("[style]").forEach(function (el) {
      var st = el.getAttribute("style") || "";
      el.setAttribute(
        "style",
        st.replace(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g, function (m, u) {
          var abs = resolveUrl(u, pageUrl);
          return "url('" + getProxyUrl(abs, proxy) + "')";
        }),
      );
    });

    // Remove dynamic/dangerous content but NOT canvas (keep canvas for charts)
    [
      "script",
      "noscript",
      "iframe",
      "video",
      "audio",
      "object",
      "embed",
    ].forEach(function (tag) {
      doc.querySelectorAll(tag).forEach(function (el) {
        el.remove();
      });
    });

    var hideSelectors =
      '[id*="cookie"],[id*="consent"],[id*="gdpr"],[id*="modal"],[id*="popup"],[class*="cookie"],[class*="consent"],[class*="overlay"],[class*="banner"]';
    doc.querySelectorAll(hideSelectors).forEach(function (el) {
      el.style.display = "none";
    });

    var style = doc.createElement("style");
    style.textContent =
      "*,*::before,*::after{box-sizing:border-box}body{margin:0!important;overflow:visible!important;height:auto!important}html{overflow:visible!important;height:auto!important}.sticky,.is-sticky{position:relative!important;top:auto!important}::-webkit-scrollbar{display:none} [style*='fixed'] {position:absolute!important;}" +
      /* Scroll-reveal libraries (AOS, WOW.js, custom IntersectionObserver
         patterns like this site's own .rv/.in) hide sections at opacity:0
         until JS adds a class on scroll-into-view. Scripts are stripped
         above, so that class never gets added and the section stays
         invisible forever — while still reserving its layout space, which
         is exactly what produces a blank gap of the right height instead
         of missing content. Force everything to its already-revealed
         state instead. We deliberately don't touch `visibility` or
         `transform` here: those are also used for legitimately-hidden UI
         (drawers, dropdowns) and for centering tricks, and overriding them
         broadly would trade one visual bug for another. */
      "*,*::before,*::after{opacity:1!important;animation:none!important;transition:none!important;animation-delay:0s!important;transition-delay:0s!important}";
    doc.head.appendChild(style);

    doc.querySelectorAll("base").forEach(function (el) {
      el.remove();
    });

    return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
  }

  /* ── waitForImages ── resolves once every <img> in the doc has either
     loaded or errored (or a safety ceiling is hit). Proxied images can take
     a while to arrive; capturing before they land is what produces missing
     elements, so this is real settle time, not a guess. */
  function waitForImages(iDoc, maxWaitMs, onProgress) {
    return new Promise(function (resolve) {
      var imgs;
      try {
        imgs = Array.prototype.slice.call(
          iDoc.images || iDoc.querySelectorAll("img"),
        );
      } catch (e) {
        imgs = [];
      }
      var total = imgs.length;
      if (!total) return resolve();

      var remaining = total;
      var settled = false;

      function report() {
        if (onProgress) onProgress(total - remaining, total);
      }

      function settle() {
        if (settled) return;
        settled = true;
        resolve();
      }

      function markDone() {
        remaining--;
        report();
        if (remaining <= 0) settle();
      }

      imgs.forEach(function (img) {
        if (img.complete) {
          markDone();
          return;
        }
        img.addEventListener("load", markDone, { once: true });
        img.addEventListener("error", markDone, { once: true });
      });

      report();
      setTimeout(settle, maxWaitMs); // never block conversion on one stalled image
    });
  }

  /* ── nextFrame ── waits for the browser to actually paint before we read
     layout (scrollHeight) or capture — one rAF is often not enough right
     after a resize/style change, so we wait two. */
  function nextFrame(win) {
    return new Promise(function (resolve) {
      var w = win && win.requestAnimationFrame ? win : window;
      w.requestAnimationFrame(function () {
        w.requestAnimationFrame(resolve);
      });
    });
  }

  /* ── renderIframe with live countdown ── */
  function renderIframe(html, delayMs, onTick, onImgWait) {
    return new Promise(function (resolve) {
      var blob = new Blob([html], { type: "text/html;charset=utf-8" });
      var blobUrl = URL.createObjectURL(blob);
      var frame = document.createElement("iframe");
      frame.style.cssText =
        "position:fixed;left:0;top:0;width:1280px;height:900px;border:none;z-index:-9999;pointer-events:none;opacity:0.01;background:#ffffff;";
      frame.setAttribute("sandbox", "allow-same-origin allow-scripts");
      frame._blobUrl = blobUrl;

      var done = false;
      var countId = null;
      var absId = null;
      var loadTriggered = false;

      function finish() {
        if (done) return;
        done = true;
        if (countId) clearInterval(countId);
        if (absId) clearTimeout(absId);
        resolve(frame);
      }

      function startCountdown() {
        var wait = Math.max(delayMs || 4000, 500);
        var t0 = Date.now();
        if (onTick) onTick(Math.ceil(wait / 1000), 0, wait);

        countId = setInterval(function () {
          var elapsed = Date.now() - t0;
          var left = Math.max(0, wait - elapsed);
          if (onTick) onTick(Math.ceil(left / 1000), elapsed, wait);
          if (elapsed >= wait) {
            clearInterval(countId);
            countId = null;
            finish();
          }
        }, 500);
      }

      function startTimer() {
        if (loadTriggered) return;
        loadTriggered = true;
        if (absId) clearTimeout(absId);

        // Wait for real network images (fetched through the CORS proxy)
        // BEFORE the user's Page Load Wait countdown starts, so that
        // countdown is genuine settle time instead of racing downloads.
        var iDoc;
        try {
          iDoc = frame.contentDocument || frame.contentWindow.document;
        } catch (e) {
          iDoc = null;
        }
        if (iDoc) {
          waitForImages(iDoc, 20000, onImgWait).then(startCountdown);
        } else {
          startCountdown();
        }
      }

      frame.addEventListener("load", function () {
        var isBlob = false;
        try {
          var href = frame.contentWindow.location.href;
          isBlob = href && href.indexOf("blob:") === 0;
        } catch (e) {
          isBlob = true; // Security error means sandboxed blob URL loaded
        }
        if (isBlob) {
          startTimer();
        }
      });

      document.body.appendChild(frame);
      frame.src = blobUrl;

      // Fallback: start timer if load event fails to fire after 6 seconds
      absId = setTimeout(startTimer, 6000);
    });
  }

  /* ── html2canvas CDN fallback loader ── */
  var H2C_CDNS = [
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js",
  ];

  function ensureH2c() {
    if (typeof window.html2canvas === "function") {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var idx = 0;
      function next() {
        if (typeof window.html2canvas === "function") {
          return resolve();
        }
        if (idx >= H2C_CDNS.length) {
          return reject(new Error("html2canvas failed to load from all CDNs"));
        }
        var url = H2C_CDNS[idx++];
        var s = document.createElement("script");
        s.src = url;
        s.async = true;
        s.onload = function () {
          if (typeof window.html2canvas === "function") resolve();
          else next();
        };
        s.onerror = next;
        document.head.appendChild(s);
      }
      next();
    });
  }

  /* ── captureViewport ── */
  function captureViewport(frame, yOff, height, opts) {
    return new Promise(function (resolve, reject) {
      var iDoc;
      try {
        iDoc = frame.contentDocument || frame.contentWindow.document;
      } catch (e) {
        return reject(
          new Error(
            "Cannot access iframe — security policy may be blocking it.",
          ),
        );
      }

      var scale = parseFloat(opts.scale || 1.5);
      var h2cOpts = {
        allowTaint: false,
        useCORS: true,
        scale: scale,
        width: 1280,
        height: height,
        windowWidth: 1280,
        windowHeight: height,
        scrollX: 0,
        scrollY: yOff,
        logging: false,
        backgroundColor: "#ffffff",
        foreignObjectRendering: false,
        imageTimeout: 8000,
        removeContainer: true,
      };

      function runCapture() {
        var h2c = window.html2canvas;
        if (!h2c) return reject(new Error("html2canvas not available."));
        h2c(iDoc.documentElement, h2cOpts)
          .then(function (canvas) {
            if (!canvas || canvas.width === 0)
              reject(new Error("Capture returned empty canvas."));
            else resolve(canvas);
          })
          .catch(reject);
      }

      ensureH2c().then(runCapture).catch(reject);
    });
  }

  /* ── CORS proxy waterfall ──────────────────────────────────
     Entry 0  : Direct fetch — works when the target site sends
                CORS headers (e.g. your own pdfmaster.co.in).
     Entry 1  : AllOrigins /raw — returns the raw page body;
                often succeeds when /get times-out (408).
     Entry 2  : AllOrigins /get — JSON wrapper, classic endpoint.
     Entries 3-6 : four more public relays as fallbacks.
     Each entry: { name, url(u), parse(response→Promise<string>) }
  ─────────────────────────────────────────────────────────── */
  var PROXIES = [
    {
      name: "Direct",
      url: function (u) {
        return u;
      },
      parse: function (r) {
        return r.text();
      },
      direct: true /* flag — skip if CORS will definitely fail */,
    },
    {
      name: "AllOrigins-raw",
      url: function (u) {
        return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u);
      },
      parse: function (r) {
        return r.text();
      },
    },
    {
      name: "AllOrigins-get",
      url: function (u) {
        return "https://api.allorigins.win/get?url=" + encodeURIComponent(u);
      },
      parse: function (r) {
        return r.json().then(function (j) {
          if (j && j.contents && j.contents.trim().length > 50)
            return j.contents;
          return Promise.reject(new Error("Empty contents"));
        });
      },
    },
    {
      name: "CORSProxy.io",
      url: function (u) {
        return "https://corsproxy.io/?" + encodeURIComponent(u);
      },
      parse: function (r) {
        return r.text();
      },
    },
    {
      name: "CodeTabs",
      url: function (u) {
        return (
          "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u)
        );
      },
      parse: function (r) {
        return r.text();
      },
    },
    {
      name: "ThingProxy",
      url: function (u) {
        return "https://thingproxy.freeboard.io/fetch/" + u;
      },
      parse: function (r) {
        return r.text();
      },
    },
    {
      name: "HTMLDriven",
      url: function (u) {
        return (
          "https://htmldriven.com/api/cors-proxy?url=" + encodeURIComponent(u)
        );
      },
      parse: function (r) {
        return r
          .json()
          .then(function (j) {
            /* HTMLDriven wraps in { content: "..." } */
            var c = j && (j.content || j.contents || j.body || j.html || "");
            if (c && c.trim().length > 50) return c;
            return Promise.reject(new Error("Empty"));
          })
          .catch(function () {
            return r.text && r.text();
          });
      },
    },
  ];

  /* fetchWithTimeout — uses AbortController (Android-safe).
     AbortSignal.timeout() is NOT used — unsupported on Android WebView. */
  function fetchWithTimeout(url, ms, extraOpts) {
    var ctrl = new AbortController();
    var tid = setTimeout(function () {
      ctrl.abort();
    }, ms);
    var opts = Object.assign({ signal: ctrl.signal }, extraOpts || {});
    return fetch(url, opts).finally(function () {
      clearTimeout(tid);
    });
  }

  /* ── MAIN CONVERT ── */
  async function convert() {
    if (converting) return;

    var raw = urlInput.value.trim();
    if (!raw) {
      urlInput.classList.add("err");
      urlInput.focus();
      setTimeout(function () {
        urlInput.classList.remove("err");
      }, 2000);
      return;
    }

    var pageUrl = raw.match(/^https?:\/\//i) ? raw : "https://" + raw;
    try {
      new URL(pageUrl);
    } catch (e) {
      showError(
        "Invalid URL",
        "Please enter a valid web address, e.g. https://example.com",
      );
      return;
    }

    var rawDelayVal = document.getElementById("inpDelay").value.trim();
    var rawDelay = rawDelayVal !== "" ? parseFloat(rawDelayVal) : 4;
    if (isNaN(rawDelay)) rawDelay = 4;

    var rawPreCapVal = document.getElementById("inpPreCap").value.trim();
    var rawPreCap = rawPreCapVal !== "" ? parseFloat(rawPreCapVal) : 1;
    if (isNaN(rawPreCap)) rawPreCap = 1;

    var delayMs = Math.min(Math.max(rawDelay, 1), 120) * 1000;
    var preCapMs = Math.min(Math.max(rawPreCap, 0), 30) * 1000;
    var opts = {
      size: document.getElementById("selSize").value,
      orient: document.getElementById("selOrient").value,
      quality: document.getElementById("selQuality").value,
      scale: document.getElementById("selScale").value,
      delay: delayMs,
      preCap: preCapMs,
    };

    startUI();
    var frame = null;
    var successfulProxy = null;

    try {
      /* STEP 1: FETCH — try direct then 6 CORS proxies */
      setStep("fetch");
      setProg(3, "Fetching page…");
      var html = null;
      var proxyErrors = [];

      for (var pi = 0; pi < PROXIES.length; pi++) {
        var proxy = PROXIES[pi];
        if (proxy.direct) {
          try {
            var targetHost = new URL(pageUrl).hostname;
            if (targetHost !== window.location.hostname) {
              continue; // Skip direct fetch for external domains due to CORS
            }
          } catch (e) {
            continue;
          }
        }
        setProg(3 + pi * 4, "Trying " + proxy.name + "…");
        /* Direct attempt: 12 s (fast fail); proxy attempts: 28 s */
        var tms = proxy.direct ? 12000 : 28000;
        try {
          var pr = await fetchWithTimeout(proxy.url(pageUrl), tms);
          if (!pr.ok) throw new Error("HTTP " + pr.status);
          var cand = await proxy.parse(pr);
          if (!cand || cand.trim().length < 100)
            throw new Error("Response too short");
          if (cand.indexOf("<") === -1) throw new Error("Not HTML");
          html = cand;
          setProg(26, "Fetched via " + proxy.name);
          console.log("[PDFMaster] Fetched via", proxy.name);
          successfulProxy = proxy;
          break;
        } catch (pe) {
          proxyErrors.push(proxy.name + ": " + pe.message);
          console.warn("[PDFMaster]", proxy.name, "→", pe.message);
        }
      }

      if (!html) {
        throw new Error(
          "All " +
            PROXIES.length +
            " fetch methods failed. " +
            "The site may use Cloudflare protection or require a login. " +
            "Try a different URL or open this tool from pdfmaster.co.in.\n\n" +
            proxyErrors.join(" | "),
        );
      }

      /* STEP 2: PROCESS */
      setStep("process");
      setProg(20, "Processing HTML…");
      await new Promise(function (r) {
        setTimeout(r, 60);
      });
      var processed = processHtml(html, pageUrl, successfulProxy);

      /* STEP 3: RENDER + COUNTDOWN */
      setStep("render");
      setProg(22, "Rendering layout…");
      frame = await renderIframe(
        processed,
        opts.delay,
        function (secLeft, elapsed, total) {
          var pct = 22 + (elapsed / total) * 32;
          var label =
            secLeft > 0
              ? "Waiting for page… " + secLeft + "s remaining"
              : "Page ready — preparing capture…";
          setProg(Math.min(pct, 53), label);
        },
        function (loaded, total) {
          setProg(21, "Loading images… " + loaded + "/" + total);
        },
      );

      /* STEP 4: CAPTURE & BUILD PDF
         Phase A scrolls page-by-page waiting Pre-Capture Wait at each
         section (warm-up only, no capture). Phase B takes one full-height
         capture once everything has settled, then slices it locally into
         PDF pages. */
      setStep("capture");

      var jsPDF = window.jspdf.jsPDF;
      var SIZES = {
        a4: { w: 210, h: 297 },
        letter: { w: 215.9, h: 279.4 },
        legal: { w: 215.9, h: 355.6 },
      };
      var size = SIZES[opts.size] || SIZES.a4;
      var pw = opts.orient === "landscape" ? size.h : size.w;
      var ph = opts.orient === "landscape" ? size.w : size.h;

      var pdf = new jsPDF({
        orientation: opts.orient,
        unit: "mm",
        format: opts.size,
      });

      var iWin = frame.contentWindow;
      var iDoc = frame.contentDocument || iWin.document;

      // Let the browser paint the fully-loaded document before measuring it.
      await nextFrame(iWin);

      var totalH = Math.max(
        iDoc.documentElement.scrollHeight,
        iDoc.body.scrollHeight,
        900,
      );

      var ratio = ph / pw;
      var pageHpx = Math.round(1280 * ratio);

      // Force body and html to keep their scrollable heights, preventing collapsing when iframe viewport is resized
      function lockHeight(h) {
        try {
          iDoc.documentElement.style.setProperty(
            "height",
            h + "px",
            "important",
          );
          iDoc.documentElement.style.setProperty(
            "min-height",
            h + "px",
            "important",
          );
          iDoc.body.style.setProperty("height", h + "px", "important");
          iDoc.body.style.setProperty("min-height", h + "px", "important");
        } catch (e) {}
      }
      lockHeight(totalH);

      // Set iframe height to pageHpx to make it behave as a viewport
      frame.style.setProperty("height", pageHpx + "px", "important");
      await nextFrame(iWin);

      var qual = { high: 0.94, standard: 0.85, low: 0.7 }[opts.quality] || 0.85;

      /* ── PHASE A — warm-up pass ──────────────────────────────────
         Scroll through every page section, waiting Pre-Capture Wait at
         each one. No capture happens here — this is purely to give
         images/layout time to settle at each section, the same way a
         real user scrolling down the page would trigger it. If content
         grows (late images finishing) we extend totalH so no page is
         missed. */
      var warmPages = Math.max(1, Math.ceil(totalH / pageHpx));
      var yOff = 0;
      var page = 0;
      while (yOff < totalH) {
        iWin.scrollTo(0, yOff);
        await nextFrame(iWin);

        if (opts.preCap > 0) {
          var preCapSeconds = Math.ceil(opts.preCap / 1000);
          for (var i = preCapSeconds; i > 0; i--) {
            var pctWarm = 54 + (yOff / totalH) * 20;
            setProg(
              Math.min(pctWarm, 74),
              "Page " +
                (page + 1) +
                "/" +
                warmPages +
                ": waiting " +
                i +
                "s for elements…",
            );
            await new Promise(function (r) {
              setTimeout(r, 1000);
            });
          }
        }

        var freshH = Math.max(
          iDoc.documentElement.scrollHeight,
          iDoc.body.scrollHeight,
          totalH,
        );
        if (freshH > totalH) {
          totalH = freshH;
          lockHeight(totalH);
          warmPages = Math.max(1, Math.ceil(totalH / pageHpx));
        }

        yOff += pageHpx;
        page++;
        if (page >= 100) break; // page limit safety
      }

      /* ── PHASE B — one authoritative capture, sliced locally ──────
         Repeated per-slice html2canvas calls (small windowHeight +
         scrollY offset) are a known html2canvas failure mode: it often
         only paints what fits the given window box instead of the true
         slice, which is what was producing blank/incomplete pages. A
         single full-height render is pixel-consistent, so we capture
         once here and cut it into PDF pages ourselves. */
      setProg(75, "Compositing full page…");
      iWin.scrollTo(0, 0);
      await nextFrame(iWin);
      lockHeight(totalH);
      await nextFrame(iWin);

      var masterCanvas = await captureViewport(frame, 0, totalH, opts);
      var pxPerCssPx = masterCanvas.height / totalH;

      yOff = 0;
      page = 0;
      while (yOff < totalH) {
        var sliceH = Math.min(pageHpx, totalH - yOff);
        var pct = 76 + (yOff / totalH) * 10;
        setProg(Math.min(pct, 86), "Building page " + (page + 1) + "…");

        var sy = Math.round(yOff * pxPerCssPx);
        var sh = Math.min(
          Math.round(sliceH * pxPerCssPx),
          masterCanvas.height - sy,
        );
        if (sh <= 0) break;

        var sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = masterCanvas.width;
        sliceCanvas.height = sh;
        var sctx = sliceCanvas.getContext("2d");
        sctx.fillStyle = "#ffffff";
        sctx.fillRect(0, 0, sliceCanvas.width, sh);
        sctx.drawImage(
          masterCanvas,
          0,
          sy,
          masterCanvas.width,
          sh,
          0,
          0,
          masterCanvas.width,
          sh,
        );

        if (page > 0) {
          pdf.addPage(opts.size, opts.orient);
        }

        var sliceHmm = (sliceH / pageHpx) * ph;
        pdf.addImage(
          sliceCanvas.toDataURL("image/jpeg", qual),
          "JPEG",
          0,
          0,
          pw,
          sliceHmm,
          "",
          "FAST",
        );

        yOff += pageHpx;
        page++;
        if (page >= 100) break; // page limit safety
      }

      setProg(88, "Capture complete…");

      /* STEP 5: BUILD PDF */
      setStep("pdf");
      setProg(92, "Finalizing PDF…");
      await new Promise(function (r) {
        setTimeout(r, 100);
      });

      /* Build blob for Open-in-Browser */
      var pdfBlob = null;
      try {
        pdfBlob = new Blob([pdf.output("arraybuffer")], {
          type: "application/pdf",
        });
      } catch (e) {}

      setProg(100, "Done!");

      var hostname = new URL(pageUrl).hostname.replace(/^www\./, "");
      var fname = hostname + "-" + Date.now() + ".pdf";
      pdf.save(fname);
      showResult(fname, pdf, pdfBlob);
    } catch (err) {
      console.error("[PDFMaster]", err);
      var msg =
        err && err.message
          ? err.message
          : "An unexpected error occurred. Please try again.";
      if (msg.length > 350) msg = msg.substring(0, 350) + "…";
      var tip = "";
      var ml = msg.toLowerCase();
      if (
        ml.indexOf("fetch") > -1 ||
        ml.indexOf("proxy") > -1 ||
        ml.indexOf("network") > -1
      )
        tip =
          " — Open from pdfmaster.co.in for reliable conversions, or check your internet.";
      else if (ml.indexOf("empty") > -1 || ml.indexOf("blank") > -1)
        tip = " — The page may require JavaScript to render. Try a static URL.";
      else if (ml.indexOf("canvas") > -1)
        tip = " — Try reducing Render Scale to 1× in Advanced Options.";
      showError("Conversion Failed", msg + (tip || ""));
    } finally {
      if (frame) {
        try {
          if (frame._blobUrl) URL.revokeObjectURL(frame._blobUrl);
          if (frame.parentNode) frame.parentNode.removeChild(frame);
        } catch (e) {}
      }
    }
  }

  /* ── EVENT WIRING ── */
  convertBtn.addEventListener("click", convert);
  urlInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") convert();
  });

  dlBtn.addEventListener("click", function () {
    if (currentPdf && currentFile) currentPdf.save(currentFile);
  });

  openBtn.addEventListener("click", function () {
    if (!currentBlob && currentPdf) {
      try {
        currentBlob = new Blob([currentPdf.output("arraybuffer")], {
          type: "application/pdf",
        });
      } catch (e) {
        alert("Cannot open PDF in browser on this device.");
        return;
      }
    }
    if (!currentBlob) return;
    var bUrl = URL.createObjectURL(currentBlob);
    var w = window.open(bUrl, "_blank");
    if (!w) alert("Popup blocked — please allow popups for this site.");
    setTimeout(function () {
      URL.revokeObjectURL(bUrl);
    }, 120000);
  });

  againBtn.addEventListener("click", function () {
    urlInput.value = "";
    urlInput.focus();
    resBox.classList.remove("show");
    errBox.classList.remove("show");
    progBox.classList.remove("show");
    currentPdf = null;
    currentFile = "";
    currentBlob = null;
  });

  /* ── LOCAL FILE WARNING ── */
  (function () {
    var proto = window.location.protocol;
    if (proto === "file:" || proto === "content:" || proto === "null:") {
      var note = document.createElement("div");
      note.style.cssText =
        "position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#b45309;color:#fff;text-align:center;font-family:sans-serif;font-size:13px;padding:10px 40px 10px 16px;line-height:1.5";
      note.textContent =
        "⚠️  For best results open this page from pdfmaster.co.in — some browsers block network requests when a file is opened locally.";
      var cls = document.createElement("button");
      cls.textContent = "✕";
      cls.style.cssText =
        "position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1";
      cls.onclick = function () {
        note.remove();
      };
      note.appendChild(cls);
      document.body.appendChild(note);
    }
  })();

  /* ── PRELOAD html2canvas in parent window as bridge ── */
  (function () {
    var idx = 0;
    function next() {
      if (typeof window.html2canvas === "function") return;
      if (idx >= H2C_CDNS.length) return;
      var s = document.createElement("script");
      s.src = H2C_CDNS[idx++];
      s.async = true;
      s.onload = function () {
        if (typeof window.html2canvas !== "function") next();
      };
      s.onerror = next;
      document.head.appendChild(s);
    }
    next();
  })();
});
