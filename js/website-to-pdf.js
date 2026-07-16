/* ══════════════════════════════════════════════════════
   ALL JAVASCRIPT — single clean block, no unclosed comments
══════════════════════════════════════════════════════ */

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
    themeBtn.textContent = dark ? "☀️" : "🌙";
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

  /* ── SCROLL REVEAL ── */
  var ro = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          ro.unobserve(e.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -36px 0px" },
  );
  document.querySelectorAll(".rv").forEach(function (el) {
    ro.observe(el);
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
    btnIco.innerHTML = "🔄";
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
    setProg(0, "🔄 Starting…");
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
      if (!proxy.direct && proxy.name !== "AllOrigins-get" && proxy.name !== "HTMLDriven") {
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
      "*,*::before,*::after{box-sizing:border-box}body{margin:0!important;overflow:visible!important;height:auto!important}html{overflow:visible!important;height:auto!important}.sticky,.is-sticky{position:relative!important;top:auto!important}::-webkit-scrollbar{display:none} [style*='fixed'] {position:absolute!important;}";
    doc.head.appendChild(style);

    doc.querySelectorAll("base").forEach(function (el) {
      el.remove();
    });

    return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
  }

  /* ── renderIframe with live countdown ── */
  function renderIframe(html, delayMs, onTick) {
    return new Promise(function (resolve) {
      var blob = new Blob([html], { type: "text/html;charset=utf-8" });
      var blobUrl = URL.createObjectURL(blob);
      var frame = document.createElement("iframe");
      frame.style.cssText =
        "position:fixed;left:-100vw;top:0;width:1280px;height:900px;border:none;visibility:hidden;z-index:-9999;pointer-events:none";
      frame.setAttribute("sandbox", "allow-same-origin allow-scripts");
      document.body.appendChild(frame);

      var done = false;
      var countId = null;
      var absId = null;
      frame._blobUrl = blobUrl;

      function finish() {
        if (done) return;
        done = true;
        if (countId) clearInterval(countId);
        if (absId) clearTimeout(absId);
        resolve(frame);
      }

      frame.addEventListener("load", function () {
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
      });

      absId = setTimeout(finish, (delayMs || 4000) + 15000);
      frame.src = blobUrl;
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

  /* ── captureFrame ── */
  function captureFrame(frame, opts) {
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

      var fullH = Math.max(
        iDoc.documentElement ? iDoc.documentElement.scrollHeight : 0,
        iDoc.body ? iDoc.body.scrollHeight : 0,
        900,
      );
      frame.style.height = Math.min(fullH, 26000) + "px";

      var preCapDelay = typeof opts.preCap === "number" ? opts.preCap : 1000;
      setTimeout(function () {
        var scale = parseFloat(opts.scale || 1.5);
        var captureH = Math.min(
          iDoc.documentElement ? iDoc.documentElement.scrollHeight : fullH,
          24000,
        );
        var h2cOpts = {
          allowTaint: false,
          useCORS: true,
          scale: scale,
          width: 1280,
          height: captureH,
          windowWidth: 1280,
          windowHeight: captureH,
          scrollX: 0,
          scrollY: 0,
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

        ensureH2c()
          .then(runCapture)
          .catch(reject);
      }, preCapDelay);
    });
  }

  /* ── canvas → PDF ── */
  function canvasToPdf(canvas, opts) {
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
    var pxPerMm = canvas.width / pw;
    var pageHpx = ph * pxPerMm;
    var qual = { high: 0.94, standard: 0.85, low: 0.7 }[opts.quality] || 0.85;
    var yOff = 0,
      page = 0;
    while (yOff < canvas.height) {
      if (page > 0)
        pdf.addPage(opts.size, opts.orient);
      var sliceH = Math.min(pageHpx, canvas.height - yOff);
      var slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.ceil(sliceH);
      var ctx = slice.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(
        canvas,
        0,
        yOff,
        canvas.width,
        sliceH,
        0,
        0,
        canvas.width,
        sliceH,
      );
      var sliceHmm = sliceH / pxPerMm;
      pdf.addImage(
        slice.toDataURL("image/jpeg", qual),
        "JPEG",
        0,
        0,
        pw,
        sliceHmm,
        "",
        "FAST",
      );
      yOff += sliceH;
      page++;
      if (page > 120) break;
    }
    return pdf;
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

    var rawDelay = parseFloat(document.getElementById("inpDelay").value) || 4;
    var rawPreCap = parseFloat(document.getElementById("inpPreCap").value) || 1;
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

    try {
      /* STEP 1: FETCH — try direct then 6 CORS proxies */
      setStep("fetch");
      setProg(3, "🌐 Fetching page…");
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
        setProg(3 + pi * 4, "🌐 Trying " + proxy.name + "…");
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
          setProg(26, "✅ Fetched via " + proxy.name);
          console.log("[PDFMaster] Fetched via", proxy.name);
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
      setProg(20, "⚙️ Processing HTML…");
      await new Promise(function (r) {
        setTimeout(r, 60);
      });
      var processed = processHtml(html, pageUrl, successfulProxy);

      /* STEP 3: RENDER + COUNTDOWN */
      setStep("render");
      setProg(22, "🖥️ Rendering layout…");
      frame = await renderIframe(
        processed,
        opts.delay,
        function (secLeft, elapsed, total) {
          var pct = 22 + (elapsed / total) * 32;
          var label =
            secLeft > 0
              ? "⏳ Waiting for page… " + secLeft + "s remaining"
              : "🖥️ Page ready — preparing capture…";
          setProg(Math.min(pct, 53), label);
        },
      );

      /* STEP 4: CAPTURE */
      setStep("capture");
      setProg(54, "📸 Capturing full page…");
      var canvas = await captureFrame(frame, opts);
      if (!canvas || canvas.width === 0)
        throw new Error(
          "Capture produced an empty canvas. Try increasing Page Load Wait.",
        );
      setProg(82, "📸 Capture complete…");

      /* STEP 5: BUILD PDF */
      setStep("pdf");
      setProg(84, "📄 Building PDF…");
      await new Promise(function (r) {
        setTimeout(r, 60);
      });
      var pdf = canvasToPdf(canvas, opts);

      /* Build blob for Open-in-Browser */
      var pdfBlob = null;
      try {
        pdfBlob = new Blob([pdf.output("arraybuffer")], {
          type: "application/pdf",
        });
      } catch (e) {}

      setProg(100, "✅ Done!");

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
}); /* end DOMContentLoaded */
