
      (function () {
        "use strict";

        /* ============================================================
     Theme toggle
     ============================================================ */
        var themeToggle = document.getElementById("themeToggle");
        themeToggle.addEventListener("click", function () {
          var current =
            document.documentElement.getAttribute("data-theme") || "light";
          var next = current === "dark" ? "light" : "dark";
          document.documentElement.setAttribute("data-theme", next);
          try {
            localStorage.setItem("pdfmaster-theme", next);
          } catch (e) {
            /* storage unavailable; theme still applies for this session */
          }
        });

        /* ============================================================
     Hamburger drawer
     ============================================================ */
        var hamburgerBtn = document.getElementById("hamburgerBtn");
        var navDrawer = document.getElementById("navDrawer");
        var navOverlay = document.getElementById("navOverlay");
        var drawerClose = document.getElementById("drawerClose");

        function openDrawer() {
          navDrawer.classList.add("is-open");
          navOverlay.classList.add("is-open");
          hamburgerBtn.setAttribute("aria-expanded", "true");
          document.body.style.overflow = "hidden";
        }
        function closeDrawer() {
          navDrawer.classList.remove("is-open");
          navOverlay.classList.remove("is-open");
          hamburgerBtn.setAttribute("aria-expanded", "false");
          document.body.style.overflow = "";
        }
        hamburgerBtn.addEventListener("click", function () {
          if (navDrawer.classList.contains("is-open")) closeDrawer();
          else openDrawer();
        });
        drawerClose.addEventListener("click", closeDrawer);
        navOverlay.addEventListener("click", closeDrawer);
        Array.prototype.forEach.call(
          navDrawer.querySelectorAll("a"),
          function (a) {
            a.addEventListener("click", closeDrawer);
          },
        );
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape") closeDrawer();
        });

        /* ============================================================
     CDN loader with fallback chains
     ============================================================ */
        var CDN = {
          pdfLib: [
            "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
            "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js",
          ],
          fontkit: [
            "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js",
            "https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js",
          ],
          regeneratorRuntime: [
            "https://cdn.jsdelivr.net/npm/regenerator-runtime@0.14.1/runtime.js",
            "https://unpkg.com/regenerator-runtime@0.14.1/runtime.js",
          ],
          pdfjs: [
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
            "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
          ],
          pdfjsWorker: [
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
            "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
          ],
          jszip: [
            "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
            "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
          ],
        };

        var loadedScripts = {};
        function loadScript(urls) {
          var key = urls[0];
          if (loadedScripts[key]) return loadedScripts[key];
          loadedScripts[key] = new Promise(function (resolve, reject) {
            var i = 0;
            function tryNext() {
              if (i >= urls.length) {
                reject(new Error("All sources failed for " + urls[0]));
                return;
              }
              var url = urls[i++];
              var s = document.createElement("script");
              s.src = url;
              s.async = true;
              s.onload = function () {
                resolve();
              };
              s.onerror = function () {
                s.remove();
                tryNext();
              };
              document.head.appendChild(s);
            }
            tryNext();
          });
          return loadedScripts[key];
        }

        var libsReadyPromise = null;
        function ensureCoreLibs() {
          if (!libsReadyPromise)
            libsReadyPromise = Promise.all([
              loadScript(CDN.pdfLib),
              loadScript(CDN.jszip),
            ]);
          return libsReadyPromise;
        }

        var unicodeLibsPromise = null;
        function ensureUnicodeLibs() {
          // fontkit references a global `regeneratorRuntime` that plain browser
          // execution doesn't provide (only bundler-injected builds do), so the
          // polyfill must load first or embedding throws "regeneratorRuntime is
          // not defined".
          if (!unicodeLibsPromise) {
            unicodeLibsPromise = loadScript(CDN.regeneratorRuntime).then(
              function () {
                return loadScript(CDN.fontkit);
              },
            );
          }
          return unicodeLibsPromise;
        }

        var pdfjsReadyPromise = null;
        function ensurePdfJs() {
          if (!pdfjsReadyPromise) {
            pdfjsReadyPromise = loadScript(CDN.pdfjs).then(function () {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                CDN.pdfjsWorker[0];
            });
          }
          return pdfjsReadyPromise;
        }

        /* ============================================================
     Standard font UI value -> pdf-lib StandardFonts enum key.
     Not a simple string transform: TimesRomanBold's PDF name is
     "Times-Bold" (not "Times-Roman-Bold"), so this is spelled out
     explicitly rather than derived.
     ============================================================ */
        var FONT_KEY_MAP = {
          Helvetica: "Helvetica",
          "Helvetica-Bold": "HelveticaBold",
          "Times-Roman": "TimesRoman",
          "Times-Bold": "TimesRomanBold",
          Courier: "Courier",
        };

        /* ============================================================
     Script (Unicode) detection for watermark text
     ============================================================ */
        var SCRIPT_FONTS = {
          devanagari: {
            regex: /[\u0900-\u097F]/,
            urls: [
              "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf",
              "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf",
            ],
          },
          arabic: {
            regex: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/,
            urls: [
              "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf",
              "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf",
            ],
          },
        };
        // Basic Latin + Latin-1/Extended covers English and most accented European
        // text, which the standard PDF fonts already render correctly.
        var BASIC_LATIN_RE = /^[\u0000-\u024F\s]*$/;

        var fontBytesCache = {};
        function fetchFontBytes(urls) {
          var key = urls[0];
          if (fontBytesCache[key]) return fontBytesCache[key];
          fontBytesCache[key] = (function attempt(i) {
            if (i >= urls.length)
              return Promise.reject(
                new Error(
                  "Could not download the font needed for this script.",
                ),
              );
            return fetch(urls[i])
              .then(function (res) {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.arrayBuffer();
              })
              .catch(function () {
                return attempt(i + 1);
              });
          })(0);
          return fontBytesCache[key];
        }

        function detectScript(text) {
          if (SCRIPT_FONTS.devanagari.regex.test(text)) return "devanagari";
          if (SCRIPT_FONTS.arabic.regex.test(text)) return "arabic";
          if (!BASIC_LATIN_RE.test(text)) return "unsupported";
          return "latin";
        }

        /* ============================================================
     Page range parser: "", "all", "odd", "even", or "1-3,5,8-10"
     ============================================================ */
        function parsePageRange(input, pageCount) {
          var s = (input || "").trim().toLowerCase();
          var seen = {};
          var out = [];
          function add(n) {
            if (!seen[n]) {
              seen[n] = true;
              out.push(n);
            }
          }

          if (s === "" || s === "all") {
            for (var i = 1; i <= pageCount; i++) add(i);
            return { indices: out, error: null };
          }
          if (s === "odd") {
            for (var i2 = 1; i2 <= pageCount; i2 += 2) add(i2);
            return { indices: out, error: null };
          }
          if (s === "even") {
            for (var i3 = 2; i3 <= pageCount; i3 += 2) add(i3);
            return { indices: out, error: null };
          }

          var parts = s
            .split(",")
            .map(function (p) {
              return p.trim();
            })
            .filter(Boolean);
          if (parts.length === 0)
            return {
              indices: [],
              error: "Enter a page range, or choose All Pages.",
            };
          for (var p = 0; p < parts.length; p++) {
            var part = parts[p];
            var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
            if (m) {
              var a = parseInt(m[1], 10),
                b = parseInt(m[2], 10);
              if (a > b) {
                var t = a;
                a = b;
                b = t;
              }
              for (var n = a; n <= b; n++) {
                if (n >= 1 && n <= pageCount) add(n);
              }
            } else if (/^\d+$/.test(part)) {
              var num = parseInt(part, 10);
              if (num < 1 || num > pageCount)
                return {
                  indices: [],
                  error:
                    "Page " + num + " is out of range (1-" + pageCount + ").",
                };
              add(num);
            } else {
              return {
                indices: [],
                error:
                  'Could not understand "' +
                  part +
                  '". Use numbers, ranges (1-3), or commas.',
              };
            }
          }
          out.sort(function (x, y) {
            return x - y;
          });
          return { indices: out, error: null };
        }

        /* ============================================================
     Position mapping: 9-point grid -> proportional target point,
     shared by both the live CSS preview and the real pdf-lib export.
     ============================================================ */
        var PAGE_MARGIN = 50;

        function targetPoint(width, height) {
          var fx = (state.posX !== undefined ? state.posX : 50) / 100;
          var fy = (state.posY !== undefined ? state.posY : 50) / 100;
          var usableW = Math.max(width - 2 * PAGE_MARGIN, 0);
          var usableH = Math.max(height - 2 * PAGE_MARGIN, 0);
          return {
            x: PAGE_MARGIN + fx * usableW,
            y: PAGE_MARGIN + fy * usableH,
          };
        }

        // Solve for the draw origin (x,y) such that the content's own unrotated
        // visual center lands exactly on `target` once pdf-lib rotates it
        // counter-clockwise about that same (x,y) origin. Verified against
        // rendered output for text and images at multiple rotations.
        function rotatedOrigin(target, halfW, halfH, rotationDeg) {
          var rad = (rotationDeg * Math.PI) / 180;
          return {
            x: target.x - (halfW * Math.cos(rad) - halfH * Math.sin(rad)),
            y: target.y - (halfW * Math.sin(rad) + halfH * Math.cos(rad)),
          };
        }

        /* ============================================================
     App state
     ============================================================ */
        var state = {
          files: [],
          previewPage: 1,
          watermarkType: "text",
          text: "CONFIDENTIAL",
          font: "Helvetica-Bold",
          color: "#d1301f",
          size: 48,
          opacity: 30,
          rotation: 45,
          posX: 50,
          posY: 50,
          tile: false,
          behind: false,
          pageRangeMode: "all",
          pageRangeCustom: "",
          imageFile: null,
          imageDataUrl: null,
          imageAspect: 1.77,
          resultBlobs: [],
        };
        var idCounter = 0;

        /* ============================================================
     DOM references
     ============================================================ */
        var dropzoneView = document.getElementById("dropzoneView");
        var workspaceView = document.getElementById("workspaceView");
        var dropzone = document.getElementById("dropzone");
        var fileInput = document.getElementById("fileInput");
        var browseBtn = document.getElementById("browseBtn");
        var addMoreBtn = document.getElementById("addMoreBtn");
        var fileQueueEl = document.getElementById("fileQueue");

        var tabText = document.getElementById("tabText");
        var tabImage = document.getElementById("tabImage");
        var textPanel = document.getElementById("textPanel");
        var imagePanel = document.getElementById("imagePanel");

        var wmText = document.getElementById("wmText");
        var presetChips = document.getElementById("presetChips");
        var scriptHint = document.getElementById("scriptHint");
        var wmFont = document.getElementById("wmFont");
        var wmColor = document.getElementById("wmColor");
        var wmColorHex = document.getElementById("wmColorHex");

        var wmImageBtn = document.getElementById("wmImageBtn");
        var wmImageInput = document.getElementById("wmImageInput");
        var wmImageName = document.getElementById("wmImageName");

        var wmSize = document.getElementById("wmSize");
        var wmSizeVal = document.getElementById("wmSizeVal");
        var wmOpacity = document.getElementById("wmOpacity");
        var wmOpacityVal = document.getElementById("wmOpacityVal");
        var wmRotation = document.getElementById("wmRotation");
        var wmRotationVal = document.getElementById("wmRotationVal");

        var posPad = document.getElementById("posPad");
        var posHandle = document.getElementById("posHandle");
        var posCrosshair = document.getElementById("posCrosshair");
        var posReadoutX = document.getElementById("posReadoutX");
        var posReadoutY = document.getElementById("posReadoutY");
        var posChips = document.getElementById("posChips");
        var tileToggle = document.getElementById("tileToggle");
        var behindToggle = document.getElementById("behindToggle");
        var behindNote = document.getElementById("behindNote");

        var pageRangeChips = document.querySelectorAll("[data-range]");
        var pageRangeInput = document.getElementById("pageRange");

        var statusLine = document.getElementById("statusLine");
        var progressBar = document.getElementById("progressBar");
        var applyBtn = document.getElementById("applyBtn");
        var resultPanel = document.getElementById("resultPanel");
        var resultTitle = document.getElementById("resultTitle");
        var resultSub = document.getElementById("resultSub");
        var downloadBtn = document.getElementById("downloadBtn");
        var resetBtn = document.getElementById("resetBtn");

        var previewStage = document.getElementById("previewStage");
        var previewPageNum = document.getElementById("previewPageNum");
        var previewPageTotal = document.getElementById("previewPageTotal");
        var prevPageBtn = document.getElementById("prevPageBtn");
        var nextPageBtn = document.getElementById("nextPageBtn");

        var recoveryBtn = document.getElementById("recoveryBtn");
        var recoveryBadge = document.getElementById("recoveryBadge");

        /* ============================================================
     Utility
     ============================================================ */
        function formatBytes(bytes) {
          if (bytes < 1024) return bytes + " B";
          if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
          return (bytes / (1024 * 1024)).toFixed(1) + " MB";
        }
        function setStatus(msg, kind) {
          statusLine.classList.toggle("is-error", kind === "error");
          var icon =
            kind === "error"
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>'
              : kind === "busy"
                ? '<span class="spinner" aria-hidden="true"></span>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
          statusLine.innerHTML = icon + "<span>" + msg + "</span>";
        }

        function showToast(msg, kind, duration) {
          var container = document.getElementById("toastContainer");
          if (!container) return;
          kind = kind || "info";
          duration = duration || 3500;

          var toast = document.createElement("div");
          toast.className = "toast toast-" + kind;

          var iconHtml =
            kind === "error"
              ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>'
              : kind === "success"
                ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>'
                : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent-solid)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

          toast.innerHTML = iconHtml + "<span>" + msg + "</span>";
          container.appendChild(toast);

          setTimeout(function () {
            toast.classList.add("toast-leaving");
            setTimeout(function () {
              toast.remove();
            }, 280);
          }, duration);
        }
        function hexToRgb01(hex) {
          var h = hex.replace("#", "");
          if (h.length === 3)
            h = h
              .split("")
              .map(function (c) {
                return c + c;
              })
              .join("");
          return {
            r: parseInt(h.substring(0, 2), 16) / 255,
            g: parseInt(h.substring(2, 4), 16) / 255,
            b: parseInt(h.substring(4, 6), 16) / 255,
          };
        }

        function getFileBytes(fileObj) {
          if (!fileObj)
            return Promise.reject(new Error("No file object provided"));
          if (fileObj.arrayBuffer) {
            return fileObj.arrayBuffer().then(function (buf) {
              return new Uint8Array(buf);
            });
          }
          return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
              resolve(new Uint8Array(reader.result));
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(fileObj);
          });
        }

        /* ============================================================
     File queue
     ============================================================ */
        function renderFileQueue() {
          fileQueueEl.innerHTML = "";
          state.files.forEach(function (f) {
            var row = document.createElement("div");
            row.className = "file-row";
            var statusColor =
              f.status === "error"
                ? "#b91c1c"
                : f.status === "done"
                  ? "var(--success)"
                  : "var(--text-muted)";
            row.innerHTML =
              '<div class="f-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>' +
              '<div class="f-info"><div class="f-name"></div><div class="f-meta"></div></div>' +
              '<span class="f-status" style="color:' +
              statusColor +
              '"></span>' +
              '<button type="button" class="f-remove" aria-label="Remove file"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
            row.querySelector(".f-name").textContent = f.file.name;
            row.querySelector(".f-meta").textContent =
              formatBytes(f.file.size) +
              (f.pageCount
                ? " \u00b7 " +
                  f.pageCount +
                  " page" +
                  (f.pageCount === 1 ? "" : "s")
                : " \u00b7 reading\u2026");
            row.querySelector(".f-status").textContent =
              f.status === "error"
                ? f.error || "Error"
                : f.status === "done"
                  ? "Ready"
                  : "";
            row
              .querySelector(".f-remove")
              .addEventListener("click", function () {
                state.files = state.files.filter(function (x) {
                  return x.id !== f.id;
                });
                renderFileQueue();
                if (state.files.length === 0) {
                  showDropzone();
                  checkStoredSessionAvailable();
                } else {
                  updatePreview();
                  scheduleDBSave();
                }
                updateApplyState();
              });
            fileQueueEl.appendChild(row);
          });
        }

        function showWorkspace() {
          dropzoneView.style.display = "none";
          workspaceView.style.display = "block";
        }
        function showDropzone() {
          dropzoneView.style.display = "block";
          workspaceView.style.display = "none";
          resultPanel.style.display = "none";
        }

        function addFiles(fileList) {
          var incoming = Array.prototype.filter.call(fileList, function (f) {
            return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
          });
          if (incoming.length === 0) {
            setStatus("Please choose PDF files only.", "error");
            return;
          }
          var lastFile = incoming[incoming.length - 1];

          clearPreviewCache();
          state.files = [];
          state.previewPage = 1;
          state.resultBlobs = [];
          if (resultPanel) resultPanel.style.display = "none";

          showWorkspace();
          var entry = {
            id: ++idCounter,
            file: lastFile,
            pageCount: null,
            status: "reading",
            error: null,
          };
          state.files = [entry];
          renderFileQueue();

          getFileBytes(lastFile)
            .then(function (bytes) {
              return ensureCoreLibs().then(function () {
                return window.PDFLib.PDFDocument.load(bytes);
              });
            })
            .then(function (doc) {
              entry.pageCount = doc.getPageCount();
              entry.status = "done";
              renderFileQueue();
              updateApplyState();
              updatePreview();
              scheduleDBSave();
            })
            .catch(function (err) {
              entry.status = "error";
              entry.error = /encrypted/i.test((err && err.message) || "")
                ? "Password-protected"
                : "Could not read file";
              renderFileQueue();
              updateApplyState();
            });
        }

        dropzone.addEventListener("click", function () {
          fileInput.click();
        });
        dropzone.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInput.click();
          }
        });
        browseBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          fileInput.click();
        });
        addMoreBtn.addEventListener("click", function () {
          fileInput.click();
        });
        fileInput.addEventListener("change", function () {
          if (fileInput.files.length) addFiles(fileInput.files);
          fileInput.value = "";
        });
        ["dragenter", "dragover"].forEach(function (evt) {
          dropzone.addEventListener(evt, function (e) {
            e.preventDefault();
            dropzone.classList.add("is-dragover");
          });
        });
        ["dragleave", "drop"].forEach(function (evt) {
          dropzone.addEventListener(evt, function (e) {
            e.preventDefault();
            dropzone.classList.remove("is-dragover");
          });
        });
        dropzone.addEventListener("drop", function (e) {
          if (e.dataTransfer && e.dataTransfer.files.length)
            addFiles(e.dataTransfer.files);
        });

        /* ============================================================
     Watermark type tabs
     ============================================================ */
        function setWatermarkType(type) {
          state.watermarkType = type;
          var isText = type === "text";
          tabText.classList.toggle("is-active", isText);
          tabImage.classList.toggle("is-active", !isText);
          tabText.setAttribute("aria-selected", String(isText));
          tabImage.setAttribute("aria-selected", String(!isText));
          textPanel.style.display = isText ? "block" : "none";
          imagePanel.style.display = isText ? "none" : "block";
          updatePreview();
          scheduleDBSave();
        }
        tabText.addEventListener("click", function () {
          setWatermarkType("text");
        });
        tabImage.addEventListener("click", function () {
          setWatermarkType("image");
        });

        /* ============================================================
     Text controls
     ============================================================ */
        wmText.addEventListener("input", function () {
          state.text = wmText.value;
          Array.prototype.forEach.call(
            presetChips.querySelectorAll(".chip"),
            function (c) {
              c.classList.toggle("is-active", c.dataset.text === state.text);
            },
          );
          updateScriptHint();
          updatePreview();
          scheduleDBSave();
        });
        presetChips.addEventListener("click", function (e) {
          var chip = e.target.closest(".chip");
          if (!chip) return;
          wmText.value = chip.dataset.text;
          state.text = chip.dataset.text;
          Array.prototype.forEach.call(
            presetChips.querySelectorAll(".chip"),
            function (c) {
              c.classList.remove("is-active");
            },
          );
          chip.classList.add("is-active");
          updateScriptHint();
          updatePreview();
          scheduleDBSave();
        });
        function updateScriptHint() {
          var script = detectScript(state.text);
          if (script === "devanagari")
            scriptHint.textContent =
              "Hindi text detected \u2014 a matching Unicode font will be embedded automatically.";
          else if (script === "arabic")
            scriptHint.textContent =
              "Arabic text detected \u2014 a matching Unicode font will be embedded automatically.";
          else if (script === "unsupported")
            scriptHint.textContent =
              "\u26a0 This script may not render correctly. Fully supported: Latin, Hindi (Devanagari), and Arabic.";
          else scriptHint.textContent = "";
        }
        wmFont.addEventListener("change", function () {
          state.font = wmFont.value;
          updatePreview();
          scheduleDBSave();
        });
        wmColor.addEventListener("input", function () {
          state.color = wmColor.value;
          wmColorHex.value = wmColor.value;
          updatePreview();
          scheduleDBSave();
        });
        wmColorHex.addEventListener("input", function () {
          if (/^#[0-9a-fA-F]{6}$/.test(wmColorHex.value)) {
            state.color = wmColorHex.value;
            wmColor.value = wmColorHex.value;
            updatePreview();
            scheduleDBSave();
          }
        });

        /* ============================================================
     Image watermark controls
     ============================================================ */
        wmImageBtn.addEventListener("click", function () {
          wmImageInput.click();
        });
        wmImageInput.addEventListener("change", function () {
          var file = wmImageInput.files[0];
          if (!file) return;
          state.imageFile = file;
          wmImageName.textContent = file.name;
          var reader = new FileReader();
          reader.onload = function () {
            state.imageDataUrl = reader.result;
            var img = new Image();
            img.onload = function () {
              if (img.naturalWidth && img.naturalHeight) {
                state.imageAspect = img.naturalWidth / img.naturalHeight;
              }
              updatePreview();
              scheduleDBSave();
            };
            img.src = reader.result;
          };
          reader.readAsDataURL(file);
        });

        /* ============================================================
     Sliders
     ============================================================ */
        wmSize.addEventListener("input", function () {
          state.size = +wmSize.value;
          wmSizeVal.textContent = state.size + "px";
          updatePreview();
          scheduleDBSave();
        });
        wmOpacity.addEventListener("input", function () {
          state.opacity = +wmOpacity.value;
          wmOpacityVal.textContent = state.opacity + "%";
          updatePreview();
          scheduleDBSave();
        });
        wmRotation.addEventListener("input", function () {
          state.rotation = +wmRotation.value;
          wmRotationVal.textContent = state.rotation + "\u00b0";
          updatePreview();
          scheduleDBSave();
        });

        /* ============================================================
     2D Page-Ratio Position Controller & Handle Dragging
     ============================================================ */
        var isDraggingPad = false;

        function updatePadHandlePosition(posX, posY, skipPreview) {
          state.posX = Math.max(0, Math.min(100, posX));
          state.posY = Math.max(0, Math.min(100, posY));

          var px = state.posX;
          var py = 100 - state.posY;

          if (posHandle) {
            posHandle.style.left = px + "%";
            posHandle.style.top = py + "%";
          }
          if (posCrosshair) {
            posCrosshair.style.setProperty("--cross-x", px + "%");
            posCrosshair.style.setProperty("--cross-y", py + "%");
          }
          if (posReadoutX)
            posReadoutX.textContent = Math.round(state.posX) + "%";
          if (posReadoutY)
            posReadoutY.textContent = Math.round(state.posY) + "%";

          updatePosChips();
          if (!skipPreview) updatePreview();
        }

        function handlePadPointer(e) {
          if (!posPad) return;
          var rect = posPad.getBoundingClientRect();
          var clientX = e.clientX;
          var clientY = e.clientY;
          if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
          }

          var relX = clientX - rect.left;
          var relY = clientY - rect.top;

          var pctX = (relX / rect.width) * 100;
          var pctY = 100 - (relY / rect.height) * 100;

          updatePadHandlePosition(pctX, pctY);
          scheduleDBSave();
        }

        if (posPad) {
          posPad.addEventListener("pointerdown", function (e) {
            e.preventDefault();
            isDraggingPad = true;
            posPad.classList.add("is-dragging");
            if (posHandle) posHandle.classList.add("is-grabbing");
            try {
              posPad.setPointerCapture(e.pointerId);
            } catch (err) {}
            handlePadPointer(e);
          });

          posPad.addEventListener("pointermove", function (e) {
            if (!isDraggingPad) return;
            handlePadPointer(e);
          });

          posPad.addEventListener("pointerup", function (e) {
            if (isDraggingPad) {
              isDraggingPad = false;
              posPad.classList.remove("is-dragging");
              if (posHandle) posHandle.classList.remove("is-grabbing");
              try {
                posPad.releasePointerCapture(e.pointerId);
              } catch (err) {}
            }
          });

          posPad.addEventListener("pointercancel", function (e) {
            if (isDraggingPad) {
              isDraggingPad = false;
              posPad.classList.remove("is-dragging");
              if (posHandle) posHandle.classList.remove("is-grabbing");
            }
          });
        }

        if (posChips) {
          posChips.addEventListener("click", function (e) {
            var chip = e.target.closest(".chip");
            if (!chip) return;
            var px = +chip.dataset.posX;
            var py = +chip.dataset.posY;
            updatePadHandlePosition(px, py);
            scheduleDBSave();
          });
        }

        function updatePosChips() {
          if (!posChips) return;
          Array.prototype.forEach.call(
            posChips.querySelectorAll(".chip"),
            function (c) {
              var match =
                Math.round(+c.dataset.posX) === Math.round(state.posX) &&
                Math.round(+c.dataset.posY) === Math.round(state.posY);
              c.classList.toggle("is-active", match);
            },
          );
        }
        tileToggle.addEventListener("change", function () {
          state.tile = tileToggle.checked;
          updatePreview();
          scheduleDBSave();
        });
        behindToggle.addEventListener("change", function () {
          state.behind = behindToggle.checked;
          behindNote.style.display = state.behind ? "flex" : "none";
          updatePreview();
          scheduleDBSave();
        });

        /* ============================================================
     Page range
     ============================================================ */
        pageRangeChips.forEach(function (chip) {
          chip.addEventListener("click", function () {
            pageRangeChips.forEach(function (c) {
              c.classList.remove("is-active");
            });
            chip.classList.add("is-active");
            state.pageRangeMode = chip.dataset.range;
            pageRangeInput.style.display =
              state.pageRangeMode === "custom" ? "block" : "none";
            if (state.pageRangeMode === "custom") pageRangeInput.focus();
            scheduleDBSave();
          });
        });
        pageRangeInput.addEventListener("input", function () {
          state.pageRangeCustom = pageRangeInput.value;
          scheduleDBSave();
        });
        function effectivePageRangeString() {
          return state.pageRangeMode === "custom"
            ? state.pageRangeCustom
            : state.pageRangeMode;
        }

        /* ============================================================
     Apply-button gating
     ============================================================ */
        function updateApplyState() {
          var ready =
            state.files.length > 0 &&
            state.files.every(function (f) {
              return f.status === "done";
            });
          applyBtn.disabled = !ready;
          if (state.files.length === 0)
            setStatus(
              "Ready \u2014 add a PDF above, adjust your watermark, then apply.",
            );
          else if (!ready)
            setStatus(
              "Reading file" + (state.files.length > 1 ? "s" : "") + "\u2026",
              "busy",
            );
          else
            setStatus(
              state.files.length +
                " file" +
                (state.files.length > 1 ? "s" : "") +
                " ready \u2014 configure options above, then apply.",
            );
        }

        /* ============================================================
     Live preview (PDF.js render + CSS overlay watermark)
     ============================================================ */
        var previewDoc = null,
          previewRendering = false,
          previewQueued = false;

        function clearPreviewCache() {
          if (previewDoc) {
            try {
              if (previewDoc.destroy) previewDoc.destroy();
            } catch (e) {}
            previewDoc = null;
          }
        }

        function updatePreview() {
          if (previewRendering) {
            previewQueued = true;
            return;
          }
          var first = state.files[0];
          if (!first || !first.file || first.status !== "done") return;

          var totalPages = first.pageCount || 1;
          var targetPage = Math.min(
            Math.max(1, state.previewPage || 1),
            totalPages,
          );
          state.previewPage = targetPage;

          if (previewPageNum) previewPageNum.textContent = String(targetPage);
          if (previewPageTotal)
            previewPageTotal.textContent = String(totalPages);
          if (prevPageBtn) prevPageBtn.disabled = targetPage <= 1;
          if (nextPageBtn) nextPageBtn.disabled = targetPage >= totalPages;

          previewRendering = true;
          ensurePdfJs()
            .then(function () {
              if (previewDoc && previewDoc.__sourceId === first.id)
                return previewDoc;
              clearPreviewCache();
              return getFileBytes(first.file).then(function (bytes) {
                return window.pdfjsLib
                  .getDocument({ data: bytes })
                  .promise.then(function (doc) {
                    doc.__sourceId = first.id;
                    previewDoc = doc;
                    return doc;
                  });
              });
            })
            .then(function (doc) {
              return doc.getPage(targetPage);
            })
            .then(function (page) {
              var viewport = page.getViewport({ scale: 1 });
              var scale = Math.min(420 / viewport.width, 1.4);
              var sv = page.getViewport({ scale: scale });
              var canvas = document.createElement("canvas");
              canvas.width = sv.width;
              canvas.height = sv.height;
              var ctx = canvas.getContext("2d");
              return page
                .render({ canvasContext: ctx, viewport: sv })
                .promise.then(function () {
                  return {
                    canvas: canvas,
                    width: sv.width,
                    height: sv.height,
                    pdfWidth: viewport.width,
                    pdfHeight: viewport.height,
                  };
                });
            })
            .then(function (result) {
              renderPreviewStage(result);
            })
            .catch(function () {
              previewStage.innerHTML =
                '<div class="preview-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><span>Preview unavailable for this file</span></div>';
            })
            .finally(function () {
              previewRendering = false;
              if (previewQueued) {
                previewQueued = false;
                updatePreview();
              }
            });
        }

        function renderPreviewStage(result) {
          previewStage.innerHTML = "";
          previewStage.style.width = result.width + "px";
          previewStage.style.height = result.height + "px";
          previewStage.style.position = "relative";

          var canvasEl = result.canvas;
          canvasEl.style.position = "relative";
          canvasEl.style.zIndex = state.behind ? "2" : "1";
          previewStage.appendChild(canvasEl);

          var overlay = document.createElement("div");
          overlay.className = "preview-overlay";
          overlay.style.zIndex = state.behind ? "1" : "2";
          var sx = result.width / result.pdfWidth,
            sy = result.height / result.pdfHeight;

          buildWatermarkPlacements(result.pdfWidth, result.pdfHeight).forEach(
            function (wmk) {
              var el = document.createElement("div");
              el.style.position = "absolute";
              el.style.left = wmk.x * sx + "px";
              el.style.top = (result.pdfHeight - wmk.y) * sy + "px";
              el.style.transform =
                "translate(0,-100%) rotate(" + -wmk.rotation + "deg)";
              el.style.transformOrigin = "0 100%";
              el.style.opacity = String(state.opacity / 100);
              el.style.whiteSpace = "nowrap";
              if (state.watermarkType === "text") {
                el.style.fontFamily = /Times/.test(state.font)
                  ? "Georgia, serif"
                  : /Courier/.test(state.font)
                    ? "monospace"
                    : "Arial, sans-serif";
                el.style.fontWeight = /Bold/.test(state.font) ? "700" : "400";
                el.style.fontSize = state.size * sx + "px";
                el.style.lineHeight = "1";
                el.style.height = state.size * 0.8 * sx + "px";
                el.style.color = state.color;
                el.textContent = state.text || " ";
              } else if (state.imageDataUrl) {
                var img = document.createElement("img");
                img.src = state.imageDataUrl;
                img.style.width = wmk.imgW * sx + "px";
                img.style.height = wmk.imgH * sy + "px";
                img.style.display = "block";
                el.appendChild(img);
              }
              overlay.appendChild(el);
            },
          );
          previewStage.appendChild(overlay);
          if (posPad && result.pdfWidth && result.pdfHeight) {
            posPad.style.aspectRatio = String(
              (result.pdfWidth / result.pdfHeight).toFixed(3),
            );
          }
        }

        var measureCanvas = document.createElement("canvas");
        var measureCtx = measureCanvas.getContext("2d");

        function getTextDimensions(text, size, font) {
          var fontFamily = /Times/.test(font)
            ? "Georgia, serif"
            : /Courier/.test(font)
              ? "monospace"
              : "Arial, sans-serif";
          var fontWeight = /Bold/.test(font) ? "700" : "400";
          measureCtx.font = fontWeight + " " + size + "px " + fontFamily;
          var width = measureCtx.measureText(text || " ").width;
          var height = size * 0.8;
          return { width: Math.max(width, 4), height: height };
        }

        // Same placement math as the real export (see targetPoint/rotatedOrigin),
        // so the live preview always matches the downloaded file.
        function buildWatermarkPlacements(pageWidth, pageHeight) {
          var placements = [];
          if (state.watermarkType === "text") {
            var dims = getTextDimensions(state.text, state.size, state.font);
            addPlacements(
              placements,
              pageWidth,
              pageHeight,
              dims.width,
              dims.height,
              null,
              null,
            );
          } else {
            var aspect = state.imageAspect || 1.77;
            var targetW = (state.size / 48) * (pageWidth * 0.35);
            var targetH = targetW / aspect;
            if (targetW > pageWidth * 0.8 || targetH > pageHeight * 0.8) {
              var maxScale = Math.min(
                (pageWidth * 0.8) / targetW,
                (pageHeight * 0.8) / targetH,
              );
              targetW *= maxScale;
              targetH *= maxScale;
            }
            addPlacements(
              placements,
              pageWidth,
              pageHeight,
              targetW,
              targetH,
              targetW,
              targetH,
            );
          }
          return placements;
        }
        function addPlacements(
          placements,
          pageWidth,
          pageHeight,
          basisW,
          basisH,
          imgW,
          imgH,
        ) {
          var halfW = basisW / 2,
            halfH = basisH / 2;
          if (state.tile) {
            var anchor = targetPoint(pageWidth, pageHeight);
            var stepX = Math.max(basisW * 0.95, 130);
            var stepY = Math.max(
              (state.watermarkType === "text" ? state.size : basisH) * 1.6,
              110,
            );
            var offsetX = ((anchor.x % stepX) + stepX) % stepX;
            var offsetY = ((anchor.y % stepY) + stepY) % stepY;
            var startX = offsetX - stepX * 2;
            var startY = offsetY - stepY * 2;

            for (var ty = startY; ty < pageHeight + stepY * 2; ty += stepY) {
              for (var tx = startX; tx < pageWidth + stepX * 2; tx += stepX) {
                var o = rotatedOrigin(
                  { x: tx, y: ty },
                  halfW,
                  halfH,
                  state.rotation,
                );
                placements.push({
                  x: o.x,
                  y: o.y,
                  rotation: state.rotation,
                  imgW: imgW,
                  imgH: imgH,
                });
              }
            }
          } else {
            var target = targetPoint(pageWidth, pageHeight);
            var o2 = rotatedOrigin(target, halfW, halfH, state.rotation);
            placements.push({
              x: o2.x,
              y: o2.y,
              rotation: state.rotation,
              imgW: imgW,
              imgH: imgH,
            });
          }
        }

        /* ============================================================
     Apply watermark (real pdf-lib export)
     ============================================================ */
        applyBtn.addEventListener("click", function () {
          applyWatermark().catch(function () {});
        });

        async function applyWatermark() {
          var maxPages = Math.max.apply(
            null,
            state.files.map(function (f) {
              return f.pageCount || 1;
            }),
          );
          var rangeCheck = parsePageRange(effectivePageRangeString(), maxPages);
          if (rangeCheck.error) {
            setStatus(rangeCheck.error, "error");
            return;
          }
          if (state.watermarkType === "text" && !state.text.trim()) {
            setStatus("Enter watermark text first.", "error");
            return;
          }
          if (state.watermarkType === "image" && !state.imageFile) {
            setStatus("Choose an image first.", "error");
            return;
          }

          applyBtn.disabled = true;
          progressBar.style.display = "block";
          progressBar.firstElementChild.style.width = "0%";
          setStatus("Applying watermark\u2026", "busy");
          state.resultBlobs = [];

          try {
            await ensureCoreLibs();
            for (var i = 0; i < state.files.length; i++) {
              var entry = state.files[i];
              progressBar.firstElementChild.style.width =
                Math.round((i / state.files.length) * 100) + "%";
              try {
                var blob = await processOneFile(entry);
                state.resultBlobs.push({
                  name: withSuffix(entry.file.name),
                  blob: blob,
                });
              } catch (err) {
                var msg = /encrypted/i.test((err && err.message) || "")
                  ? entry.file.name +
                    " is password-protected. Remove the password first, then try again."
                  : entry.file.name + ": could not be processed.";
                throw new Error(msg);
              }
            }
            progressBar.firstElementChild.style.width = "100%";
            progressBar.style.display = "none";
            showResult();
          } catch (err) {
            progressBar.style.display = "none";
            applyBtn.disabled = false;
            setStatus(
              (err && err.message) || "Something went wrong. Please try again.",
              "error",
            );
          }
        }

        function withSuffix(name) {
          return name.replace(/\.pdf$/i, "") + "-watermarked.pdf";
        }

        async function getEmbeddedImageResource(doc, file, dataUrl) {
          var isJpg = /\.jpe?g$/i.test(file.name) || file.type === "image/jpeg";
          var isPng = /\.png$/i.test(file.name) || file.type === "image/png";
          if (isJpg) {
            try {
              var imgBuf = await file.arrayBuffer();
              return await doc.embedJpg(imgBuf);
            } catch (e) {}
          }
          if (isPng) {
            try {
              var imgBuf2 = await file.arrayBuffer();
              return await doc.embedPng(imgBuf2);
            } catch (e) {}
          }
          return new Promise(function (resolve, reject) {
            var img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = async function () {
              try {
                var canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth || 300;
                canvas.height = img.naturalHeight || 150;
                var ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(async function (blob) {
                  if (!blob) {
                    reject(new Error("Could not process image file."));
                    return;
                  }
                  try {
                    var buf = await blob.arrayBuffer();
                    var res = await doc.embedPng(buf);
                    resolve(res);
                  } catch (err) {
                    reject(err);
                  }
                }, "image/png");
              } catch (err2) {
                reject(err2);
              }
            };
            img.onerror = function () {
              reject(new Error("Could not load image file."));
            };
            img.src = dataUrl || URL.createObjectURL(file);
          });
        }

        async function processOneFile(entry) {
          var PDFLib = window.PDFLib;
          var bytes = await getFileBytes(entry.file);
          var doc = await PDFLib.PDFDocument.load(bytes);
          var pageCount = doc.getPageCount();
          var range = parsePageRange(effectivePageRangeString(), pageCount);
          if (range.error) throw new Error(range.error);

          var resource;
          if (state.watermarkType === "text") {
            var script = detectScript(state.text);
            if (script === "devanagari" || script === "arabic") {
              await ensureUnicodeLibs();
              doc.registerFontkit(window.fontkit);
              var fontBytes = await fetchFontBytes(SCRIPT_FONTS[script].urls);
              resource = await doc.embedFont(fontBytes, { subset: true });
            } else {
              var key = FONT_KEY_MAP[state.font] || "Helvetica";
              resource = await doc.embedFont(PDFLib.StandardFonts[key]);
            }
          } else {
            resource = await getEmbeddedImageResource(
              doc,
              state.imageFile,
              state.imageDataUrl,
            );
          }

          var color01 = hexToRgb01(state.color);
          var rgbColor = PDFLib.rgb(color01.r, color01.g, color01.b);
          var opacity = state.opacity / 100;

          for (var k = 0; k < range.indices.length; k++) {
            var idx = range.indices[k] - 1;
            if (state.behind) {
              await stampBehind(PDFLib, doc, idx, resource, rgbColor, opacity);
            } else {
              paintWatermark(
                PDFLib,
                doc.getPages()[idx],
                resource,
                rgbColor,
                opacity,
              );
            }
          }

          var bytes = await doc.save();
          return new Blob([bytes], { type: "application/pdf" });
        }

        // Places the watermark UNDER the page's existing content: embed the
        // current page as a reusable XObject, replace it with a blank page of the
        // same size, paint the watermark first, then stamp the embedded original
        // on top. Order matters -- embedPages() must run before removePage(),
        // while the original page is still attached to the document tree.
        async function stampBehind(
          PDFLib,
          doc,
          idx,
          resource,
          rgbColor,
          opacity,
        ) {
          var original = doc.getPages()[idx];
          var size = [original.getWidth(), original.getHeight()];
          var embeddedList = await doc.embedPages([original]);
          var embedded = embeddedList[0];
          doc.removePage(idx);
          var newPage = doc.insertPage(idx, size);
          paintWatermark(PDFLib, newPage, resource, rgbColor, opacity);
          newPage.drawPage(embedded);
        }

        function paintWatermark(PDFLib, page, resource, rgbColor, opacity) {
          var degrees = PDFLib.degrees;
          var mediaBox = page.getMediaBox();
          var xMin = mediaBox.x || 0;
          var yMin = mediaBox.y || 0;
          var width = page.getWidth();
          var height = page.getHeight();
          var rotAngle = (page.getRotation().angle || 0) % 360;

          var isText = state.watermarkType === "text";
          var halfW, halfH, imgDims;

          var vW = rotAngle === 90 || rotAngle === 270 ? height : width;
          var vH = rotAngle === 90 || rotAngle === 270 ? width : height;

          if (isText) {
            halfW =
              resource.widthOfTextAtSize(state.text || " ", state.size) / 2;
            halfH = resource.heightAtSize(state.size) / 2;
          } else {
            var aspect = resource.width / resource.height;
            var targetW = (state.size / 48) * (vW * 0.35);
            var targetH = targetW / aspect;
            if (targetW > vW * 0.8 || targetH > vH * 0.8) {
              var maxScale = Math.min(
                (vW * 0.8) / targetW,
                (vH * 0.8) / targetH,
              );
              targetW *= maxScale;
              targetH *= maxScale;
            }
            imgDims = {
              width: targetW,
              height: targetH,
            };
            halfW = imgDims.width / 2;
            halfH = imgDims.height / 2;
          }

          function paintAt(target) {
            var vx = target.x,
              vy = target.y;
            var pdfTargetX, pdfTargetY;
            if (rotAngle === 90) {
              pdfTargetX = xMin + (width - vy);
              pdfTargetY = yMin + vx;
            } else if (rotAngle === 180) {
              pdfTargetX = xMin + (width - vx);
              pdfTargetY = yMin + (height - vy);
            } else if (rotAngle === 270) {
              pdfTargetX = xMin + vy;
              pdfTargetY = yMin + (height - vx);
            } else {
              pdfTargetX = xMin + vx;
              pdfTargetY = yMin + vy;
            }

            var totalRotation = (state.rotation - rotAngle + 360) % 360;
            var origin = rotatedOrigin(
              { x: pdfTargetX, y: pdfTargetY },
              halfW,
              halfH,
              totalRotation,
            );

            if (isText) {
              page.drawText(state.text || " ", {
                x: origin.x,
                y: origin.y,
                size: state.size,
                font: resource,
                color: rgbColor,
                opacity: opacity,
                rotate: degrees(totalRotation),
              });
            } else {
              page.drawImage(resource, {
                x: origin.x,
                y: origin.y,
                width: imgDims.width,
                height: imgDims.height,
                opacity: opacity,
                rotate: degrees(totalRotation),
              });
            }
          }

          if (state.tile) {
            var anchor = targetPoint(vW, vH);
            var stepX = Math.max(halfW * 2 * 0.95, 130);
            var stepY = Math.max((isText ? state.size : halfH * 2) * 1.6, 110);
            var offsetX = ((anchor.x % stepX) + stepX) % stepX;
            var offsetY = ((anchor.y % stepY) + stepY) % stepY;
            var startX = offsetX - stepX * 2;
            var startY = offsetY - stepY * 2;

            for (var ty = startY; ty < vH + stepY * 2; ty += stepY) {
              for (var tx = startX; tx < vW + stepX * 2; tx += stepX) {
                paintAt({ x: tx, y: ty });
              }
            }
          } else {
            paintAt(targetPoint(vW, vH));
          }
        }

        /* ============================================================
     Result panel + downloads
     ============================================================ */
        function showResult() {
          resultPanel.style.display = "block";
          if (state.resultBlobs.length === 1) {
            resultTitle.textContent = "Watermark Applied";
            resultSub.textContent = "Your file is ready to download.";
          } else {
            resultTitle.textContent =
              "Watermark Applied to " + state.resultBlobs.length + " Files";
            resultSub.textContent =
              "Download each file, or get them all as one ZIP.";
          }
          applyBtn.disabled = false;
          setStatus("Done.");
          scheduleDBSave();
        }

        downloadBtn.addEventListener("click", function () {
          if (state.resultBlobs.length === 1) {
            downloadBlob(state.resultBlobs[0].blob, state.resultBlobs[0].name);
            return;
          }
          ensureCoreLibs()
            .then(function () {
              var zip = new window.JSZip();
              state.resultBlobs.forEach(function (r) {
                zip.file(r.name, r.blob);
              });
              return zip.generateAsync({ type: "blob" });
            })
            .then(function (content) {
              downloadBlob(content, "pdfmaster-watermarked.zip");
            });
        });

        function downloadBlob(blob, name) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () {
            URL.revokeObjectURL(url);
          }, 4000);
        }

        resetBtn.addEventListener("click", function () {
          state.files = [];
          state.resultBlobs = [];
          fileQueueEl.innerHTML = "";
          showDropzone();
          setStatus(
            "Ready \u2014 add a PDF above, adjust your watermark, then apply.",
          );
          checkStoredSessionAvailable();
        });

        /* ============================================================
     IndexedDB Recovery Mode Logic
     ============================================================ */
        var DB_NAME = "pdfmaster_watermark_db";
        var DB_VERSION = 1;
        var dbPromise = null;

        function openDB() {
          if (dbPromise) return dbPromise;
          dbPromise = new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function (e) {
              var db = e.target.result;
              if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings");
              }
              if (!db.objectStoreNames.contains("files")) {
                db.createObjectStore("files", { keyPath: "id" });
              }
              if (!db.objectStoreNames.contains("results")) {
                db.createObjectStore("results", { keyPath: "name" });
              }
            };
            req.onsuccess = function (e) {
              resolve(e.target.result);
            };
            req.onerror = function (e) {
              reject(e.target.error);
            };
          });
          return dbPromise;
        }

        var saveTimer = null;
        function scheduleDBSave() {
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(saveSessionToDB, 400);
        }

        function saveSessionToDB() {
          openDB()
            .then(function (db) {
              var tx = db.transaction(
                ["settings", "files", "results"],
                "readwrite",
              );

              var sessionData = {
                timestamp: Date.now(),
                watermarkType: state.watermarkType,
                text: state.text,
                font: state.font,
                color: state.color,
                size: state.size,
                opacity: state.opacity,
                rotation: state.rotation,
                posX: state.posX,
                posY: state.posY,
                tile: state.tile,
                behind: state.behind,
                pageRangeMode: state.pageRangeMode,
                pageRangeCustom: state.pageRangeCustom,
                imageDataUrl: state.imageDataUrl,
                imageAspect: state.imageAspect,
                imageName: state.imageFile ? state.imageFile.name : null,
              };
              tx.objectStore("settings").put(sessionData, "session");

              var filesStore = tx.objectStore("files");
              filesStore.clear();
              state.files.forEach(function (f) {
                if (f.file && f.status === "done") {
                  filesStore.put({
                    id: f.id,
                    name: f.file.name,
                    size: f.file.size,
                    type: f.file.type || "application/pdf",
                    lastModified: f.file.lastModified || Date.now(),
                    file: f.file,
                    pageCount: f.pageCount,
                    status: f.status,
                  });
                }
              });

              var resultsStore = tx.objectStore("results");
              resultsStore.clear();
              state.resultBlobs.forEach(function (r) {
                resultsStore.put({
                  name: r.name,
                  blob: r.blob,
                });
              });

              updateRecoveryBadge(state.files.length > 0);
            })
            .catch(function (err) {
              console.warn("IndexedDB save failed:", err);
            });
        }

        function syncUIWithState(savedImageName) {
          setWatermarkType(state.watermarkType);
          wmText.value = state.text;
          wmFont.value = state.font;
          wmColor.value = state.color;
          wmColorHex.value = state.color;
          wmSize.value = state.size;
          wmSizeVal.textContent = state.size + "px";
          wmOpacity.value = state.opacity;
          wmOpacityVal.textContent = state.opacity + "%";
          wmRotation.value = state.rotation;
          wmRotationVal.textContent = state.rotation + "\u00b0";
          updatePadHandlePosition(
            state.posX !== undefined ? state.posX : 50,
            state.posY !== undefined ? state.posY : 50,
            true,
          );
          pageRangeChips.forEach(function (c) {
            c.classList.toggle(
              "is-active",
              c.dataset.range === state.pageRangeMode,
            );
          });
          pageRangeInput.style.display =
            state.pageRangeMode === "custom" ? "block" : "none";
          pageRangeInput.value = state.pageRangeCustom || "";

          if (savedImageName) {
            wmImageName.textContent = savedImageName;
          }
          updateScriptHint();
        }

        function loadSessionFromDB(isManual) {
          return openDB()
            .then(function (db) {
              var tx = db.transaction(
                ["settings", "files", "results"],
                "readonly",
              );
              var sessionReq = tx.objectStore("settings").get("session");
              var filesReq = tx.objectStore("files").getAll();
              var resultsReq = tx.objectStore("results").getAll();

              return Promise.all([
                new Promise(function (res) {
                  sessionReq.onsuccess = function () {
                    res(sessionReq.result);
                  };
                }),
                new Promise(function (res) {
                  filesReq.onsuccess = function () {
                    res(filesReq.result);
                  };
                }),
                new Promise(function (res) {
                  resultsReq.onsuccess = function () {
                    res(resultsReq.result);
                  };
                }),
              ]);
            })
            .then(function (args) {
              var session = args[0];
              var storedFiles = args[1];
              var storedResults = args[2];

              if (!storedFiles || storedFiles.length === 0) {
                updateRecoveryBadge(false);
                if (isManual) {
                  setStatus(
                    "No stored file found in recovery storage.",
                    "error",
                  );
                }
                return false;
              }

              clearPreviewCache();

              state.watermarkType = session.watermarkType || "text";
              state.text =
                session.text !== undefined ? session.text : "CONFIDENTIAL";
              state.font = session.font || "Helvetica-Bold";
              state.color = session.color || "#d1301f";
              state.size = session.size !== undefined ? session.size : 48;
              state.opacity =
                session.opacity !== undefined ? session.opacity : 30;
              state.rotation =
                session.rotation !== undefined ? session.rotation : 45;
              state.posX = session.posX !== undefined ? session.posX : 50;
              state.posY = session.posY !== undefined ? session.posY : 50;
              state.tile = !!session.tile;
              state.behind = !!session.behind;
              state.pageRangeMode = session.pageRangeMode || "all";
              state.pageRangeCustom = session.pageRangeCustom || "";
              state.imageDataUrl = session.imageDataUrl || null;
              state.imageAspect = session.imageAspect || 1.77;

              syncUIWithState(session.imageName);

              var lastItem = storedFiles[storedFiles.length - 1];
              var fileObj = lastItem.file;
              if (!fileObj && lastItem.bytes) {
                var blob = new Blob([lastItem.bytes], {
                  type: lastItem.type || "application/pdf",
                });
                fileObj = new File([blob], lastItem.name, {
                  type: lastItem.type || "application/pdf",
                  lastModified: lastItem.lastModified || Date.now(),
                });
              }

              state.files = [
                {
                  id: lastItem.id,
                  file: fileObj,
                  pageCount: lastItem.pageCount,
                  status: lastItem.status || "done",
                  error: null,
                },
              ];

              if (storedResults && storedResults.length > 0) {
                state.resultBlobs = storedResults;
                showResult();
              }

              showWorkspace();
              renderFileQueue();
              updatePreview();
              updateApplyState();
              updateRecoveryBadge(true);

              if (isManual) {
                showToast(
                  "Document (" + fileObj.name + ") recovered successfully!",
                  "success",
                );
              }
              setStatus(
                "Recovered document (" +
                  fileObj.name +
                  ") & settings from storage.",
              );
              return true;
            })
            .catch(function (err) {
              console.warn("IndexedDB load failed:", err);
              if (isManual)
                setStatus("Could not access IndexedDB recovery.", "error");
              return false;
            });
        }

        function clearSessionFromDB() {
          openDB()
            .then(function (db) {
              var tx = db.transaction(
                ["settings", "files", "results"],
                "readwrite",
              );
              tx.objectStore("settings").clear();
              tx.objectStore("files").clear();
              tx.objectStore("results").clear();
              updateRecoveryBadge(false);
            })
            .catch(function () {});
        }

        function checkStoredSessionAvailable() {
          return openDB()
            .then(function (db) {
              var tx = db.transaction(["files"], "readonly");
              var filesReq = tx.objectStore("files").getAll();
              return new Promise(function (res) {
                filesReq.onsuccess = function () {
                  var files = filesReq.result;
                  var hasFiles = files && files.length > 0;
                  updateRecoveryBadge(hasFiles);
                  res(hasFiles);
                };
                filesReq.onerror = function () {
                  updateRecoveryBadge(false);
                  res(false);
                };
              });
            })
            .catch(function () {
              updateRecoveryBadge(false);
              return false;
            });
        }

        function updateRecoveryBadge(hasData) {
          if (recoveryBadge)
            recoveryBadge.style.display = hasData ? "block" : "none";
        }

        if (recoveryBtn) {
          recoveryBtn.addEventListener("click", function () {
            loadSessionFromDB(true).then(function (success) {
              if (!success) {
                showToast("No stored file found in recovery storage.", "error");
              }
            });
          });
        }

        if (prevPageBtn) {
          prevPageBtn.addEventListener("click", function () {
            var first = state.files[0];
            if (!first || !first.pageCount) return;
            if (state.previewPage > 1) {
              state.previewPage--;
              updatePreview();
            }
          });
        }
        if (nextPageBtn) {
          nextPageBtn.addEventListener("click", function () {
            var first = state.files[0];
            if (!first || !first.pageCount) return;
            if (state.previewPage < first.pageCount) {
              state.previewPage++;
              updatePreview();
            }
          });
        }

        /* ============================================================
     Init
     ============================================================ */
        updateScriptHint();
        updateApplyState();
        showDropzone();
        checkStoredSessionAvailable();
      })();
    