(function () {
  "use strict";

  /* ============ PDF.js LOADING (self-hosted, with CDN fallback) ============ */
  var PDFJS_SOURCES = [
    {
      lib: "/assets/vendor/pdf-3.11.174.min.js",
      worker: "/assets/vendor/pdf.worker-3.11.174.min.js",
    },
    {
      lib: "/assets/vendor/pdf.min.js",
      worker: "/assets/vendor/pdf.worker.min.js",
    },
    {
      lib: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
      worker:
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    },
    {
      lib: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
      worker:
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
    },
    {
      lib: "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js",
      worker: "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
    },
  ];
  var CMAP_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/";

  var pdfjsLoadPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.head.appendChild(s);
    });
  }

  function tryLoadFromSources(index) {
    if (index >= PDFJS_SOURCES.length) {
      return Promise.reject(new Error("All PDF.js sources failed to load"));
    }
    var src = PDFJS_SOURCES[index];
    return loadScript(src.lib)
      .then(function () {
        var pdfjs = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
        if (!pdfjs || !pdfjs.getDocument) {
          throw new Error("pdfjsLib global not found after script load");
        }
        window.pdfjsLib = pdfjs;
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = src.worker;
        }
        return pdfjs;
      })
      .catch(function () {
        return tryLoadFromSources(index + 1);
      });
  }

  function ensurePdfJs() {
    if (window.pdfjsLib && window.pdfjsLib.getDocument) {
      return Promise.resolve(window.pdfjsLib);
    }
    if (!pdfjsLoadPromise) {
      pdfjsLoadPromise = tryLoadFromSources(0);
    }
    return pdfjsLoadPromise;
  }

  /* ============ DOM REFERENCES ============ */
  var $ = function (id) {
    return document.getElementById(id);
  };

  var heroSection = $("top");
  var viewerWrap = $("viewer-wrap");
  var dropZone = $("drop-zone");
  var fileInput = $("file-input");
  var chooseFileBtn = $("choose-file-btn");

  var navFilenameWrap = $("nav-filename-wrap");
  var viewerFilename = $("viewer-filename");

  var loadingPanel = $("loading-panel");
  var loadingText = $("loading-text");
  var canvasFrame = $("canvas-frame");
  var canvasStage = $("canvas-stage");
  var pdfCanvas = $("pdf-canvas");
  var textLayerEl = $("text-layer");

  var startOverBtn = $("start-over-btn");
  var recoveryBtn = $("recoveryBtn");
  var recoveryBadge = $("recoveryBadge");
  var prevPageBtn = $("prev-page");
  var nextPageBtn = $("next-page");
  var pageInput = $("page-input");
  var pageCountLabel = $("page-count-label");
  var zoomOutBtn = $("zoom-out");
  var zoomInBtn = $("zoom-in");
  var zoomLevelEl = $("zoom-level");
  var fitWidthBtn = $("fit-width-btn");
  var rotateBtn = $("rotate-btn");
  var fullscreenBtn = $("fullscreen-btn");
  var printBtn = $("print-btn");
  var downloadBtn = $("download-btn");
  var toggleToolbarPosBtn = $("toggle-toolbar-pos-btn");
  var viewerBody = $("viewer-body") || document.querySelector(".viewer-body");

  var searchToggleBtn = $("search-toggle-btn");
  var searchBar = $("search-bar");
  var searchInput = $("search-input");
  var searchCount = $("search-count");
  var searchPrevBtn = $("search-prev");
  var searchNextBtn = $("search-next");
  var searchCloseBtn = $("search-close");

  var passwordModal = $("password-modal");
  var passwordForm = $("password-form");
  var passwordInput = $("password-input");
  var passwordToggle = $("password-toggle");
  var passwordError = $("password-error");
  var passwordCancel = $("password-cancel");

  var viewerShell = $("viewer-shell");

  /* ============ STATE ============ */
  var pdfDoc = null;
  var currentFile = null;
  var currentFileUrl = null;
  var currentPage = 1;
  var totalPages = 0;
  var rotation = 0;
  var scale = 1;
  var isFitWidth = true;
  var renderToken = 0;
  var loadToken = 0;
  var pendingPasswordCallback = null;

  var textIndex = null; // [{pageNum, text}]
  var textIndexPromise = null;
  var searchQuery = "";
  var searchMatches = []; // [{pageNum}] - one entry per page containing a match
  var currentMatch = -1;
  var currentRenderTask = null;

  var printFrame = null;
  var printUrl = null;

  var MIN_SCALE = 0.25;
  var MAX_SCALE = 4;
  var ZOOM_STEP = 0.1;

  /* ============ HERO / VIEWER TOGGLE ============ */
  function showViewerUI() {
    heroSection.classList.add("hidden");
    viewerWrap.classList.remove("hidden");
    document.body.classList.add("viewer-active");
    if (navFilenameWrap) navFilenameWrap.style.display = "flex";
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function showHeroUI() {
    viewerWrap.classList.add("hidden");
    heroSection.classList.remove("hidden");
    document.body.classList.remove("viewer-active");
    if (navFilenameWrap) navFilenameWrap.style.display = "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetViewerState() {
    loadToken++;
    renderToken++;
    clearPageCache();
    if (currentRenderTask) {
      try {
        currentRenderTask.cancel();
      } catch (e) {}
      currentRenderTask = null;
    }
    if (currentFileUrl) {
      try {
        URL.revokeObjectURL(currentFileUrl);
      } catch (e) {}
      currentFileUrl = null;
    }
    if (pdfDoc) {
      try {
        if (pdfDoc.destroy) pdfDoc.destroy();
        else if (pdfDoc.cleanup) pdfDoc.cleanup();
      } catch (e) {}
      pdfDoc = null;
    }
    currentFile = null;
    currentPage = 1;
    totalPages = 0;
    rotation = 0;
    scale = 1;
    isFitWidth = true;
    textIndex = null;
    textIndexPromise = null;
    clearSearch();
    cleanupPrintFrame();
    canvasFrame.classList.add("hidden");
    loadingPanel.classList.remove("hidden");
    loadingText.textContent = "Loading PDF\u2026";
    textLayerEl.innerHTML = "";
    fileInput.value = "";
  }

  /* ============ FILE HANDLING ============ */
  function isPdfFile(file) {
    if (!file) return false;
    if (file.type === "application/pdf") return true;
    return /\.pdf$/i.test(file.name || "");
  }

  function handleFile(file) {
    if (!isPdfFile(file)) {
      window.showToast && window.showToast("Please choose a PDF file (.pdf).");
      return;
    }
    resetViewerState();
    currentFile = file;
    viewerFilename.textContent = file.name || "document.pdf";
    showViewerUI();

    var myLoadToken = loadToken;

    ensurePdfJs()
      .then(function (pdfjsLib) {
        if (myLoadToken !== loadToken) return null;
        saveSessionToDB();

        currentFileUrl = URL.createObjectURL(file);
        var loadingTask = pdfjsLib.getDocument({
          url: currentFileUrl,
          cMapUrl: CMAP_URL,
          cMapPacked: true,
          disableAutoFetch: true, // Prevents loading entire PDF into memory at once
          disableStream: false,
          disableRange: false,
          onPassword: function (callback, reason) {
            if (myLoadToken !== loadToken) return;
            pendingPasswordCallback = callback;
            openPasswordModal(reason === 2 /* INCORRECT_PASSWORD */);
          },
        });
        return loadingTask.promise;
      })
      .then(function (doc) {
        if (!doc || myLoadToken !== loadToken) return;
        pdfDoc = doc;
        totalPages = doc.numPages;
        currentPage = 1;
        pageCountLabel.textContent = "/ " + totalPages;
        pageInput.max = String(totalPages);
        closePasswordModal();
        saveSessionToDB();
        return renderPage(1);
      })
      .catch(function (err) {
        if (myLoadToken !== loadToken) return;
        console.error("PDF load error:", err);
        closePasswordModal();
        var msg = "That file couldn't be opened. It may be corrupted.";
        if (err && err.name === "PasswordException") {
          msg = "A password is required to open this PDF.";
        } else if (err && /InvalidPDFException/i.test(err.name || "")) {
          msg = "This doesn't look like a valid PDF file.";
        }
        window.showToast && window.showToast(msg);
        showHeroUI();
      });
  }

  /* ============ PASSWORD MODAL ============ */
  function openPasswordModal(isRetry) {
    passwordModal.classList.add("is-open");
    passwordError.classList.toggle("is-visible", !!isRetry);
    passwordInput.value = "";
    setTimeout(function () {
      passwordInput.focus();
    }, 50);
  }
  function closePasswordModal() {
    passwordModal.classList.remove("is-open");
    passwordError.classList.remove("is-visible");
    pendingPasswordCallback = null;
  }
  if (passwordForm) {
    passwordForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (pendingPasswordCallback) {
        var cb = pendingPasswordCallback;
        pendingPasswordCallback = null;
        cb(passwordInput.value);
      }
    });
  }
  if (passwordCancel) {
    passwordCancel.addEventListener("click", function () {
      closePasswordModal();
      loadToken++; // invalidate in-flight load
      showHeroUI();
      window.showToast && window.showToast("Cancelled — no password entered.");
    });
  }
  if (passwordToggle) {
    passwordToggle.addEventListener("click", function () {
      var isPw = passwordInput.type === "password";
      passwordInput.type = isPw ? "text" : "password";
    });
  }

  /* ============ LOW-RAM 3-PAGE SLIDING WINDOW CACHE ============ */
  var PREFETCH_WINDOW = 1; // 1 previous + 1 current + 1 next = 3 pages in active RAM
  var pageCache = new Map(); // pageNum -> { canvas, viewport, textContent, scale, rotation }
  var prefetchQueue = [];
  var isPrefetching = false;
  var prefetchToken = 0;

  function clearPageCache() {
    prefetchToken++;
    prefetchQueue = [];
    isPrefetching = false;
    pageCache.forEach(function (cached, pageNum) {
      if (cached.canvas) {
        cached.canvas.width = 0;
        cached.canvas.height = 0;
      }
      if (pdfDoc) {
        try {
          pdfDoc
            .getPage(pageNum)
            .then(function (p) {
              if (p && p.cleanup) p.cleanup();
            })
            .catch(function () {});
        } catch (e) {}
      }
    });
    pageCache.clear();
    if (pdfDoc && pdfDoc.cleanup) {
      try {
        pdfDoc.cleanup();
      } catch (e) {}
    }
  }

  function prunePageCache(activePage) {
    var minPage = Math.max(1, activePage - PREFETCH_WINDOW);
    var maxPage = Math.min(totalPages, activePage + PREFETCH_WINDOW);

    var toDelete = [];
    pageCache.forEach(function (cached, pageNum) {
      if (pageNum < minPage || pageNum > maxPage) {
        if (cached.canvas) {
          cached.canvas.width = 0;
          cached.canvas.height = 0;
        }
        if (pdfDoc) {
          try {
            pdfDoc
              .getPage(pageNum)
              .then(function (p) {
                if (p && p.cleanup) p.cleanup();
              })
              .catch(function () {});
          } catch (e) {}
        }
        toDelete.push(pageNum);
      }
    });

    toDelete.forEach(function (pageNum) {
      pageCache.delete(pageNum);
    });
  }

  function schedulePrefetch(activePage) {
    var myPrefetchToken = ++prefetchToken;
    prefetchQueue = [];

    // Prioritize adjacent pages: next page (+1) and previous page (-1)
    for (var offset = 1; offset <= PREFETCH_WINDOW; offset++) {
      var nextP = activePage + offset;
      var prevP = activePage - offset;
      if (nextP <= totalPages && !pageCache.has(nextP)) {
        prefetchQueue.push(nextP);
      }
      if (prevP >= 1 && !pageCache.has(prevP)) {
        prefetchQueue.push(prevP);
      }
    }

    if (!isPrefetching) {
      processNextPrefetch(myPrefetchToken);
    }
  }

  function processNextPrefetch(token) {
    if (token !== prefetchToken || !pdfDoc || prefetchQueue.length === 0) {
      isPrefetching = false;
      return;
    }

    isPrefetching = true;
    var targetPage = prefetchQueue.shift();

    // Verify targetPage is still inside the 3-page sliding window
    if (
      targetPage < currentPage - PREFETCH_WINDOW ||
      targetPage > currentPage + PREFETCH_WINDOW ||
      pageCache.has(targetPage)
    ) {
      setTimeout(function () {
        processNextPrefetch(token);
      }, 10);
      return;
    }

    pdfDoc
      .getPage(targetPage)
      .then(function (page) {
        if (token !== prefetchToken) return null;

        var naturalViewport = page.getViewport({
          scale: 1,
          rotation: rotation,
        });
        var targetScale = isFitWidth
          ? computeFitWidthScale(naturalViewport)
          : scale;
        var viewport = page.getViewport({
          scale: targetScale,
          rotation: rotation,
        });

        var outputScale = Math.min(window.devicePixelRatio || 1, 2);
        var offscreen = document.createElement("canvas");
        offscreen.width = Math.floor(viewport.width * outputScale);
        offscreen.height = Math.floor(viewport.height * outputScale);
        var ctx = offscreen.getContext("2d");
        var transform =
          outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        return page
          .render({
            canvasContext: ctx,
            viewport: viewport,
            transform: transform,
          })
          .promise.then(function () {
            if (token !== prefetchToken) return null;
            return page.getTextContent().then(function (textContent) {
              if (token !== prefetchToken) return null;
              pageCache.set(targetPage, {
                canvas: offscreen,
                viewport: viewport,
                textContent: textContent,
                scale: targetScale,
                rotation: rotation,
              });
            });
          });
      })
      .catch(function () {
        // Prefetch failed or superseded — continue cleanly
      })
      .finally(function () {
        if (token === prefetchToken) {
          setTimeout(function () {
            processNextPrefetch(token);
          }, 25);
        } else {
          isPrefetching = false;
        }
      });
  }

  /* ============ RENDERING ============ */
  function computeFitWidthScale(baseViewport) {
    var available = canvasStage.clientWidth - 32; // padding allowance
    if (available <= 0) available = baseViewport.width;
    var s = available / baseViewport.width;
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  }

  function renderPage(num) {
    if (!pdfDoc) return Promise.resolve();
    num = Math.max(1, Math.min(totalPages, num));
    currentPage = num;
    var myToken = ++renderToken;

    // Prune pages outside the 3-page RAM window
    prunePageCache(currentPage);

    var cached = pageCache.get(num);
    if (cached && cached.canvas && cached.rotation === rotation) {
      var scaleMatches = true;
      if (isFitWidth) {
        var currentFitScale = computeFitWidthScale(cached.viewport);
        if (Math.abs(cached.scale - currentFitScale) > 0.02) {
          scaleMatches = false;
        }
      } else {
        if (Math.abs(cached.scale - scale) > 0.01) {
          scaleMatches = false;
        }
      }

      if (scaleMatches) {
        scale = cached.scale;
        var viewport = cached.viewport;
        var outputScale = Math.min(window.devicePixelRatio || 1, 2);

        pdfCanvas.width = Math.floor(viewport.width * outputScale);
        pdfCanvas.height = Math.floor(viewport.height * outputScale);
        pdfCanvas.style.width = Math.floor(viewport.width) + "px";
        pdfCanvas.style.height = Math.floor(viewport.height) + "px";
        canvasFrame.style.width = Math.floor(viewport.width) + "px";
        canvasFrame.style.height = Math.floor(viewport.height) + "px";

        var ctx = pdfCanvas.getContext("2d");
        ctx.drawImage(cached.canvas, 0, 0);

        textLayerEl.innerHTML = "";
        textLayerEl.style.width = Math.floor(viewport.width) + "px";
        textLayerEl.style.height = Math.floor(viewport.height) + "px";
        textLayerEl.style.setProperty("--scale-factor", viewport.scale);

        if (currentRenderTask) {
          currentRenderTask.cancel();
          currentRenderTask = null;
        }

        return window.pdfjsLib
          .renderTextLayer({
            textContentSource: cached.textContent,
            container: textLayerEl,
            viewport: viewport,
          })
          .promise.then(function () {
            if (myToken !== renderToken) return;
            applySearchHighlightsToCurrentPage();
            loadingPanel.classList.add("hidden");
            canvasFrame.classList.remove("hidden");
            updateToolbarState();
            scheduleDBSave();
            schedulePrefetch(currentPage);
          });
      }
    }

    return pdfDoc
      .getPage(num)
      .then(function (page) {
        if (myToken !== renderToken) return;

        var naturalViewport = page.getViewport({
          scale: 1,
          rotation: rotation,
        });
        if (isFitWidth) {
          scale = computeFitWidthScale(naturalViewport);
        }
        var viewport = page.getViewport({ scale: scale, rotation: rotation });

        var outputScale = Math.min(window.devicePixelRatio || 1, 2);
        pdfCanvas.width = Math.floor(viewport.width * outputScale);
        pdfCanvas.height = Math.floor(viewport.height * outputScale);
        pdfCanvas.style.width = Math.floor(viewport.width) + "px";
        pdfCanvas.style.height = Math.floor(viewport.height) + "px";
        canvasFrame.style.width = Math.floor(viewport.width) + "px";
        canvasFrame.style.height = Math.floor(viewport.height) + "px";

        if (currentRenderTask) {
          currentRenderTask.cancel();
        }

        var ctx = pdfCanvas.getContext("2d");
        var transform =
          outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        var renderTask = page.render({
          canvasContext: ctx,
          viewport: viewport,
          transform: transform,
        });
        currentRenderTask = renderTask;

        return renderTask.promise.then(function () {
          if (myToken !== renderToken) return;
          currentRenderTask = null;
          return page.getTextContent().then(function (textContent) {
            if (myToken !== renderToken) return;

            // Cache rendered page into 3-page RAM cache
            var offscreen = document.createElement("canvas");
            offscreen.width = pdfCanvas.width;
            offscreen.height = pdfCanvas.height;
            var offCtx = offscreen.getContext("2d");
            offCtx.drawImage(pdfCanvas, 0, 0);

            pageCache.set(num, {
              canvas: offscreen,
              viewport: viewport,
              textContent: textContent,
              scale: scale,
              rotation: rotation,
            });

            textLayerEl.innerHTML = "";
            textLayerEl.style.width = Math.floor(viewport.width) + "px";
            textLayerEl.style.height = Math.floor(viewport.height) + "px";
            textLayerEl.style.setProperty("--scale-factor", viewport.scale);
            return window.pdfjsLib
              .renderTextLayer({
                textContentSource: textContent,
                container: textLayerEl,
                viewport: viewport,
              })
              .promise.then(function () {
                if (myToken !== renderToken) return;
                applySearchHighlightsToCurrentPage();
              });
          });
        });
      })
      .then(function () {
        if (myToken !== renderToken) return;
        loadingPanel.classList.add("hidden");
        canvasFrame.classList.remove("hidden");
        updateToolbarState();
        scheduleDBSave();
        schedulePrefetch(currentPage);
      })
      .catch(function (err) {
        if (err && err.name === "RenderingCancelledException") {
          return;
        }
        if (myToken !== renderToken) return;
        console.error("PDF render error:", err);
        window.showToast &&
          window.showToast("Something went wrong while rendering this page.");
      });
  }

  function updateToolbarState() {
    pageInput.value = String(currentPage);
    pageCountLabel.textContent = "/ " + totalPages;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    zoomLevelEl.textContent = Math.round(scale * 100) + "%";
  }

  /* ============ NAVIGATION ============ */
  function goToPage(num) {
    if (!pdfDoc) return;
    num = Math.max(1, Math.min(totalPages, Math.round(num) || 1));
    if (num === currentPage) return;
    var cached = pageCache.get(num);
    if (!cached || !cached.canvas || cached.rotation !== rotation) {
      loadingPanel.classList.remove("hidden");
      canvasFrame.classList.add("hidden");
    }
    renderPage(num);
  }
  prevPageBtn &&
    prevPageBtn.addEventListener("click", function () {
      goToPage(currentPage - 1);
    });
  nextPageBtn &&
    nextPageBtn.addEventListener("click", function () {
      goToPage(currentPage + 1);
    });
  pageInput &&
    pageInput.addEventListener("change", function () {
      goToPage(parseInt(pageInput.value, 10));
    });
  pageInput &&
    pageInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        goToPage(parseInt(pageInput.value, 10));
        pageInput.blur();
      }
    });

  /* ============ ZOOM / FIT / ROTATE ============ */
  function setScale(newScale) {
    isFitWidth = false;
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    clearPageCache();
    renderPage(currentPage);
  }
  zoomInBtn &&
    zoomInBtn.addEventListener("click", function () {
      setScale(scale + ZOOM_STEP);
    });
  zoomOutBtn &&
    zoomOutBtn.addEventListener("click", function () {
      setScale(scale - ZOOM_STEP);
    });
  fitWidthBtn &&
    fitWidthBtn.addEventListener("click", function () {
      isFitWidth = true;
      clearPageCache();
      renderPage(currentPage);
    });
  rotateBtn &&
    rotateBtn.addEventListener("click", function () {
      rotation = (rotation + 90) % 360;
      clearPageCache();
      renderPage(currentPage);
    });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (!pdfDoc || !isFitWidth) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      clearPageCache();
      renderPage(currentPage);
    }, 200);
  });

  /* ============ SEARCH ============ */
  function ensureTextIndex() {
    if (textIndexPromise) return textIndexPromise;
    textIndexPromise = (function () {
      var pages = [];
      var chain = Promise.resolve();
      function chainPage(pageNum) {
        chain = chain
          .then(function () {
            var cached = pageCache.get(pageNum);
            if (cached && cached.textContent) {
              return cached.textContent;
            }
            return pdfDoc.getPage(pageNum).then(function (page) {
              return page.getTextContent().then(function (tc) {
                if (page && page.cleanup && !pageCache.has(pageNum)) {
                  try {
                    page.cleanup();
                  } catch (e) {}
                }
                return tc;
              });
            });
          })
          .then(function (tc) {
            var text = tc.items
              .map(function (it) {
                return it.str;
              })
              .join(" ")
              .toLowerCase();
            pages.push({ pageNum: pageNum, text: text });
          });
      }
      for (var i = 1; i <= totalPages; i++) {
        chainPage(i);
      }
      return chain.then(function () {
        pages.sort(function (a, b) {
          return a.pageNum - b.pageNum;
        });
        textIndex = pages;
        return pages;
      });
    })();
    return textIndexPromise;
  }

  function runSearch(query) {
    var q = query.trim().toLowerCase();
    searchQuery = q;
    searchMatches = [];
    currentMatch = -1;
    clearHighlightsInDom();

    if (!q || !pdfDoc) {
      updateSearchCount();
      return;
    }

    searchCount.textContent = "Searching\u2026";
    ensureTextIndex().then(function (pages) {
      if (q !== searchQuery) return; // a newer search has since replaced this one
      searchMatches = pages
        .filter(function (p) {
          return p.text.indexOf(q) !== -1;
        })
        .map(function (p) {
          return { pageNum: p.pageNum };
        });
      if (searchMatches.length > 0) {
        currentMatch = 0;
        jumpToCurrentMatch();
      }
      updateSearchCount();
    });
  }

  function updateSearchCount() {
    searchPrevBtn.disabled = searchMatches.length === 0;
    searchNextBtn.disabled = searchMatches.length === 0;
    if (!searchQuery) {
      searchCount.textContent = "";
    } else if (searchMatches.length === 0) {
      searchCount.textContent = "No results";
    } else {
      searchCount.textContent =
        currentMatch + 1 + " of " + searchMatches.length;
    }
  }

  function jumpToCurrentMatch() {
    if (currentMatch < 0 || currentMatch >= searchMatches.length) return;
    var match = searchMatches[currentMatch];
    if (match.pageNum !== currentPage) {
      loadingPanel.classList.remove("hidden");
      canvasFrame.classList.add("hidden");
      renderPage(match.pageNum).then(function () {
        updateSearchCount();
        scrollCurrentHighlightIntoView();
      });
    } else {
      applySearchHighlightsToCurrentPage();
      updateSearchCount();
      scrollCurrentHighlightIntoView();
    }
  }

  function scrollCurrentHighlightIntoView() {
    var el = textLayerEl.querySelector(".search-match.is-current");
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function clearHighlightsInDom() {
    textLayerEl.querySelectorAll(".search-match").forEach(function (span) {
      span.classList.remove("search-match", "is-current");
    });
  }

  function applySearchHighlightsToCurrentPage() {
    clearHighlightsInDom();
    if (!searchQuery) return;
    var spans = textLayerEl.querySelectorAll("span");
    var matchSpansOnPage = [];
    spans.forEach(function (span) {
      var text = (span.textContent || "").toLowerCase();
      if (text.indexOf(searchQuery) !== -1) {
        span.classList.add("search-match");
        matchSpansOnPage.push(span);
      }
    });
    var landedHere =
      currentMatch >= 0 &&
      searchMatches[currentMatch] &&
      searchMatches[currentMatch].pageNum === currentPage;
    if (matchSpansOnPage.length && landedHere) {
      matchSpansOnPage[0].classList.add("is-current");
    }
  }

  function clearSearch() {
    searchQuery = "";
    searchMatches = [];
    currentMatch = -1;
    if (searchInput) searchInput.value = "";
    clearHighlightsInDom();
    updateSearchCount();
  }

  var searchDebounce = null;
  searchInput &&
    searchInput.addEventListener("input", function () {
      clearTimeout(searchDebounce);
      var q = searchInput.value;
      searchDebounce = setTimeout(function () {
        runSearch(q);
      }, 300);
    });
  searchInput &&
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          goToPrevMatch();
        } else if (searchMatches.length) {
          goToNextMatch();
        } else {
          clearTimeout(searchDebounce);
          runSearch(searchInput.value);
        }
      } else if (e.key === "Escape") {
        closeSearchBar();
      }
    });

  function goToNextMatch() {
    if (!searchMatches.length) return;
    currentMatch = (currentMatch + 1) % searchMatches.length;
    jumpToCurrentMatch();
  }
  function goToPrevMatch() {
    if (!searchMatches.length) return;
    currentMatch =
      (currentMatch - 1 + searchMatches.length) % searchMatches.length;
    jumpToCurrentMatch();
  }
  searchNextBtn && searchNextBtn.addEventListener("click", goToNextMatch);
  searchPrevBtn && searchPrevBtn.addEventListener("click", goToPrevMatch);

  function openSearchBar() {
    searchBar.classList.add("is-open");
    searchToggleBtn.setAttribute("aria-expanded", "true");
    searchToggleBtn.classList.add("is-active");
    setTimeout(function () {
      searchInput.focus();
    }, 50);
  }
  function closeSearchBar() {
    searchBar.classList.remove("is-open");
    searchToggleBtn.setAttribute("aria-expanded", "false");
    searchToggleBtn.classList.remove("is-active");
    clearSearch();
  }
  searchToggleBtn &&
    searchToggleBtn.addEventListener("click", function () {
      if (searchBar.classList.contains("is-open")) {
        closeSearchBar();
      } else {
        openSearchBar();
      }
    });
  searchCloseBtn && searchCloseBtn.addEventListener("click", closeSearchBar);

  /* ============ PRINT / DOWNLOAD / FULLSCREEN ============ */
  function cleanupPrintFrame() {
    if (printFrame && printFrame.parentNode) {
      printFrame.parentNode.removeChild(printFrame);
    }
    if (printUrl) {
      URL.revokeObjectURL(printUrl);
    }
    printFrame = null;
    printUrl = null;
  }

  printBtn &&
    printBtn.addEventListener("click", function () {
      if (!currentFile) return;
      cleanupPrintFrame();
      printUrl = URL.createObjectURL(currentFile);
      printFrame = document.createElement("iframe");
      printFrame.style.position = "fixed";
      printFrame.style.right = "0";
      printFrame.style.bottom = "0";
      printFrame.style.width = "0";
      printFrame.style.height = "0";
      printFrame.style.border = "0";
      printFrame.src = printUrl;
      printFrame.onload = function () {
        try {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
        } catch (e) {
          window.open(printUrl, "_blank");
        }
      };
      document.body.appendChild(printFrame);
    });

  downloadBtn &&
    downloadBtn.addEventListener("click", function () {
      if (!currentFile) return;
      var url = URL.createObjectURL(currentFile);
      var a = document.createElement("a");
      a.href = url;
      a.download = currentFile.name || "document.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    });

  fullscreenBtn &&
    fullscreenBtn.addEventListener("click", function () {
      if (!document.fullscreenElement) {
        var req =
          viewerShell.requestFullscreen || viewerShell.webkitRequestFullscreen;
        if (req) req.call(viewerShell);
      } else {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
      }
    });
  document.addEventListener("fullscreenchange", function () {
    fullscreenBtn.classList.toggle("is-active", !!document.fullscreenElement);
  });

  /* ============ TOOLBAR POSITION (UP / DOWN) ============ */
  function setToolbarPosition(pos) {
    var isBottom = pos === "bottom";
    if (viewerBody) {
      viewerBody.classList.toggle("toolbar-bottom", isBottom);
    }
    if (toggleToolbarPosBtn) {
      var title = isBottom ? "Move toolbar to top" : "Move toolbar to bottom";
      toggleToolbarPosBtn.title = title;
      toggleToolbarPosBtn.setAttribute("aria-label", title);
    }
    try {
      localStorage.setItem("pdfmaster-toolbar-pos", isBottom ? "bottom" : "top");
    } catch (e) {}
  }

  toggleToolbarPosBtn &&
    toggleToolbarPosBtn.addEventListener("click", function () {
      var isCurrentlyBottom =
        viewerBody && viewerBody.classList.contains("toolbar-bottom");
      setToolbarPosition(isCurrentlyBottom ? "top" : "bottom");
    });

  try {
    var savedToolbarPos = localStorage.getItem("pdfmaster-toolbar-pos");
    if (savedToolbarPos === "bottom") {
      setToolbarPosition("bottom");
    }
  } catch (e) {}

  /* ============ INDEXEDDB RECOVERY ENGINE ============ */
  var DB_NAME = "pdfmaster_viewer_db";
  var DB_VERSION = 1;
  var dbPromise = null;
  var dbSaveTimer = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        return reject(new Error("IndexedDB is not supported"));
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
        if (!db.objectStoreNames.contains("viewer_data")) {
          db.createObjectStore("viewer_data");
        }
      };
      req.onsuccess = function (e) {
        resolve(e.target.result);
      };
      req.onerror = function (e) {
        reject(e.target.error || new Error("Failed to open IndexedDB"));
      };
    });
    return dbPromise;
  }

  function scheduleDBSave() {
    if (dbSaveTimer) clearTimeout(dbSaveTimer);
    dbSaveTimer = setTimeout(function () {
      saveSessionToDB();
    }, 400);
  }

  function saveSessionToDB() {
    if (!currentFile) return Promise.resolve(false);
    var fileName =
      (currentFile && currentFile.name) ||
      (viewerFilename && viewerFilename.textContent) ||
      "document.pdf";

    return openDB()
      .then(function (db) {
        var tx = db.transaction(["settings", "viewer_data"], "readwrite");
        var settingsStore = tx.objectStore("settings");
        var dataStore = tx.objectStore("viewer_data");

        var sessionData = {
          timestamp: Date.now(),
          fileName: fileName,
          currentPage: currentPage || 1,
          totalPages: totalPages || 1,
          rotation: rotation || 0,
          scale: scale || 1,
          isFitWidth: isFitWidth !== false,
        };
        settingsStore.put(sessionData, "session");

        var fileData = {
          fileName: fileName,
          fileSize: currentFile.size || 0,
          file: currentFile, // Native Blob/File stored directly on disk via browser IndexedDB engine
          timestamp: Date.now(),
        };
        dataStore.put(fileData, "document");

        return new Promise(function (res, rej) {
          tx.oncomplete = function () {
            updateRecoveryBadge(true);
            res(true);
          };
          tx.onerror = function (e) {
            rej(e.target.error);
          };
          tx.onabort = function (e) {
            rej(e.target.error);
          };
        });
      })
      .catch(function (err) {
        console.warn("IndexedDB save failed:", err);
        return false;
      });
  }

  function loadSessionFromDB(isManual) {
    return openDB()
      .then(function (db) {
        var tx = db.transaction(["settings", "viewer_data"], "readonly");
        var settingsReq = tx.objectStore("settings").get("session");
        var dataReq = tx.objectStore("viewer_data").get("document");

        return Promise.all([
          new Promise(function (res) {
            settingsReq.onsuccess = function () {
              res(settingsReq.result);
            };
            settingsReq.onerror = function () {
              res(null);
            };
          }),
          new Promise(function (res) {
            dataReq.onsuccess = function () {
              res(dataReq.result);
            };
            dataReq.onerror = function () {
              res(null);
            };
          }),
        ]);
      })
      .then(function (results) {
        var session = results[0];
        var data = results[1];

        if (!data || (!data.file && !data.bytes)) {
          updateRecoveryBadge(false);
          if (isManual) {
            window.showToast &&
              window.showToast(
                "No stored session found in recovery storage.",
                "error",
              );
          }
          return false;
        }

        resetViewerState();

        var fileName = data.fileName || "document.pdf";
        var blob = data.file;
        if (!blob && data.bytes) {
          blob = new Blob([data.bytes], { type: "application/pdf" });
        }
        currentFile =
          blob instanceof File
            ? blob
            : new File([blob], fileName, { type: "application/pdf" });

        viewerFilename.textContent = fileName;
        showViewerUI();

        var myLoadToken = loadToken;

        var targetPage = (session && session.currentPage) || 1;
        var targetRotation = (session && session.rotation) || 0;
        var targetFitWidth =
          session && typeof session.isFitWidth === "boolean"
            ? session.isFitWidth
            : true;
        var targetScale = (session && session.scale) || 1;

        rotation = targetRotation;
        isFitWidth = targetFitWidth;
        scale = targetScale;

        return ensurePdfJs()
          .then(function (pdfjsLib) {
            if (myLoadToken !== loadToken) return null;
            currentFileUrl = URL.createObjectURL(currentFile);
            var loadingTask = pdfjsLib.getDocument({
              url: currentFileUrl,
              cMapUrl: CMAP_URL,
              cMapPacked: true,
              disableAutoFetch: true,
              disableStream: false,
              disableRange: false,
              onPassword: function (callback, reason) {
                if (myLoadToken !== loadToken) return;
                pendingPasswordCallback = callback;
                openPasswordModal(reason === 2 /* INCORRECT_PASSWORD */);
              },
            });
            return loadingTask.promise;
          })
          .then(function (doc) {
            if (!doc || myLoadToken !== loadToken) return;
            pdfDoc = doc;
            totalPages = doc.numPages;
            currentPage = Math.max(1, Math.min(totalPages, targetPage));
            pageCountLabel.textContent = "/ " + totalPages;
            pageInput.max = String(totalPages);
            closePasswordModal();
            updateRecoveryBadge(true);
            return renderPage(currentPage).then(function () {
              if (isManual) {
                window.showToast &&
                  window.showToast(
                    "Restored \"" +
                      fileName +
                      "\" (Page " +
                      currentPage +
                      " of " +
                      totalPages +
                      ")!",
                    "success",
                    4000,
                  );
              }
            });
          })
          .catch(function (err) {
            if (myLoadToken !== loadToken) return;
            console.error("PDF restore error:", err);
            closePasswordModal();
            var msg = "Could not restore the saved PDF file.";
            if (err && err.name === "PasswordException") {
              msg = "A password is required to restore this PDF.";
            }
            window.showToast && window.showToast(msg);
            showHeroUI();
          });
      })
      .catch(function (err) {
        console.warn("IndexedDB load failed:", err);
        if (isManual) {
          window.showToast &&
            window.showToast("Could not access recovery storage.", "error");
        }
        return false;
      });
  }

  function checkStoredSessionAvailable(notifyOnFound) {
    return openDB()
      .then(function (db) {
        var tx = db.transaction(["settings", "viewer_data"], "readonly");
        var settingsReq = tx.objectStore("settings").get("session");
        var dataReq = tx.objectStore("viewer_data").get("document");

        return Promise.all([
          new Promise(function (res) {
            settingsReq.onsuccess = function () {
              res(settingsReq.result);
            };
            settingsReq.onerror = function () {
              res(null);
            };
          }),
          new Promise(function (res) {
            dataReq.onsuccess = function () {
              res(dataReq.result);
            };
            dataReq.onerror = function () {
              res(null);
            };
          }),
        ]);
      })
      .then(function (results) {
        var session = results[0];
        var data = results[1];
        var hasData = !!(data && (data.file || data.bytes));
        updateRecoveryBadge(hasData);

        if (hasData && notifyOnFound && !pdfDoc) {
          var name =
            (data && data.fileName) ||
            (session && session.fileName) ||
            "document.pdf";
          var pageInfo =
            session && session.currentPage
              ? " · Page " + session.currentPage
              : "";
          window.showToast &&
            window.showToast(
              'Last session ("' +
                name +
                '"' +
                pageInfo +
                ") is available. Click to restore.",
              "Restore",
              function () {
                loadSessionFromDB(true);
              },
              7000,
            );
        }
        return hasData;
      })
      .catch(function (err) {
        console.warn("IndexedDB check failed:", err);
        updateRecoveryBadge(false);
        return false;
      });
  }

  function updateRecoveryBadge(hasData) {
    if (recoveryBadge) {
      recoveryBadge.style.display = hasData ? "block" : "none";
    }
  }

  function clearSessionFromDB() {
    return openDB()
      .then(function (db) {
        var tx = db.transaction(["settings", "viewer_data"], "readwrite");
        tx.objectStore("settings").clear();
        tx.objectStore("viewer_data").clear();
        updateRecoveryBadge(false);
      })
      .catch(function (err) {
        console.warn("IndexedDB clear failed:", err);
      });
  }

  /* ============ START OVER & RECOVERY BUTTONS ============ */
  startOverBtn &&
    startOverBtn.addEventListener("click", function () {
      resetViewerState();
      showHeroUI();
      checkStoredSessionAvailable(false);
    });

  if (recoveryBtn) {
    recoveryBtn.addEventListener("click", function () {
      loadSessionFromDB(true);
    });
  }

  /* ============ FILE INPUT / DRAG & DROP ============ */
  window.addEventListener("dragover", function (e) {
    e.preventDefault();
  });
  window.addEventListener("drop", function (e) {
    e.preventDefault();
  });

  chooseFileBtn &&
    chooseFileBtn.addEventListener("click", function () {
      fileInput.click();
    });
  fileInput &&
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) {
        handleFile(fileInput.files[0]);
      }
    });

  function wireDropTarget(el, useDragClass) {
    if (!el) return;
    ["dragenter", "dragover"].forEach(function (evt) {
      el.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (useDragClass) {
          el.classList.add("is-drag");
        } else {
          el.style.borderColor = "var(--accent)";
        }
      });
    });
    ["dragleave", "dragend"].forEach(function (evt) {
      el.addEventListener(evt, function (e) {
        e.preventDefault();
        if (useDragClass) {
          el.classList.remove("is-drag");
        } else {
          el.style.borderColor = "";
        }
      });
    });
    el.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (useDragClass) {
        el.classList.remove("is-drag");
      } else {
        el.style.borderColor = "";
      }
      var file =
        e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }
  wireDropTarget(dropZone, true);
  wireDropTarget(canvasStage, false);

  /* ============ KEYBOARD SHORTCUTS ============ */
  document.addEventListener("keydown", function (e) {
    if (!document.body.classList.contains("viewer-active")) return;
    var tag = (document.activeElement && document.activeElement.tagName) || "";
    var isTyping =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      document.activeElement.isContentEditable;

    if (e.key === "Escape") {
      if (searchBar.classList.contains("is-open")) {
        closeSearchBar();
      } else if (document.fullscreenElement) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
      }
      return;
    }
    if (isTyping) return;

    if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      goToPage(currentPage - 1);
    } else if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      goToPage(currentPage + 1);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setScale(scale + ZOOM_STEP);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setScale(scale - ZOOM_STEP);
    }
  });

  // Check stored session on startup
  checkStoredSessionAvailable(true);
})();
