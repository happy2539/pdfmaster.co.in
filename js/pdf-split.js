(function () {
        "use strict";

        /* ─────────── THEME ─────────── */
        const root = document.documentElement;
        const themeKey = "pdfmaster-theme";
        const themeBtn = document.getElementById("themeToggle");
        const sunIcon = document.getElementById("sunIcon");
        const moonIcon = document.getElementById("moonIcon");

        function applyTheme(t) {
          root.setAttribute("data-theme", t);
          localStorage.setItem(themeKey, t);
          sunIcon.style.display = t === "dark" ? "none" : "block";
          moonIcon.style.display = t === "dark" ? "block" : "none";
        }
        applyTheme(localStorage.getItem(themeKey) || "light");
        themeBtn.addEventListener("click", () => {
          applyTheme(
            root.getAttribute("data-theme") === "dark" ? "light" : "dark",
          );
        });

        /* ─────────── SIDE MENU ─────────── */
        const hamburgerBtn =
          document.getElementById("hamburgerBtn") ||
          document.getElementById("menuBtn");
        const sideMenu =
          document.getElementById("sideMenu") ||
          document.getElementById("drawer");
        const sideOverlay =
          document.getElementById("sideOverlay") ||
          document.getElementById("drawerOverlay");
        const closeMenuBtn =
          document.getElementById("closeMenuBtn") ||
          document.getElementById("drawerClose");

        function openSideMenu() {
          if (sideMenu) sideMenu.classList.add("open");
          if (sideOverlay) sideOverlay.classList.add("open");
          document.body.style.overflow = "hidden";
        }
        function closeSideMenu() {
          if (sideMenu) sideMenu.classList.remove("open");
          if (sideOverlay) sideOverlay.classList.remove("open");
          document.body.style.overflow = "";
        }
        if (hamburgerBtn) hamburgerBtn.addEventListener("click", openSideMenu);
        if (closeMenuBtn) closeMenuBtn.addEventListener("click", closeSideMenu);
        if (sideOverlay) sideOverlay.addEventListener("click", closeSideMenu);
        if (sideMenu) {
          sideMenu
            .querySelectorAll("a")
            .forEach((a) => a.addEventListener("click", closeSideMenu));
        }

        /* ─────────── BACK TO TOP ─────────── */
        const backTop = document.getElementById("backTop");
        window.addEventListener(
          "scroll",
          () => {
            backTop.classList.toggle("visible", window.scrollY > 400);
          },
          { passive: true },
        );
        backTop.addEventListener("click", () =>
          window.scrollTo({ top: 0, behavior: "smooth" }),
        );



        /* ─────────── FAQ ─────────── */
        document.querySelectorAll(".faq-q").forEach((q) => {
          q.addEventListener("click", () => {
            const item = q.parentElement;
            const isOpen = item.classList.contains("open");
            document.querySelectorAll(".faq-item.open").forEach((i) => {
              i.classList.remove("open");
              i.querySelector(".faq-q").setAttribute("aria-expanded", "false");
            });
            if (!isOpen) {
              item.classList.add("open");
              q.setAttribute("aria-expanded", "true");
            }
          });
          q.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              q.click();
            }
          });
        });

        /* ─────────── TOAST ─────────── */
        const toastEl = document.getElementById("toast");
        const toastMsg = document.getElementById("toastMsg");
        const toastIcon = document.getElementById("toastIcon");
        let toastTimer;
        function showToast(
          msg,
          type = "success",
          dur = 3500,
          onClick = null,
          actionText = null,
        ) {
          clearTimeout(toastTimer);
          toastMsg.textContent = msg;
          toastIcon.innerHTML =
            type === "success"
              ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
              : type === "info"
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

          const existingBtn = toastEl.querySelector(".toast-btn");
          if (existingBtn) existingBtn.remove();

          if (actionText && typeof onClick === "function") {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "toast-btn";
            btn.textContent = actionText;
            btn.onclick = (e) => {
              e.stopPropagation();
              toastEl.classList.remove("show");
              onClick();
            };
            toastEl.appendChild(btn);
            toastEl.classList.add("toast-clickable");
          } else if (typeof onClick === "function") {
            toastEl.classList.add("toast-clickable");
            toastEl.onclick = () => {
              toastEl.classList.remove("show");
              onClick();
            };
          } else {
            toastEl.classList.remove("toast-clickable");
            toastEl.onclick = null;
          }

          toastEl.className = `toast ${type}${onClick ? " toast-clickable" : ""}`;
          void toastEl.offsetWidth;
          toastEl.classList.add("show");
          toastTimer = setTimeout(() => toastEl.classList.remove("show"), dur);
        }

        /* ─────────── PDF.js setup ─────────── */
        if (window.pdfjsLib) {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            "/assets/vendor/pdf.worker.min.js";
        }

        /* ─────────── STATE ─────────── */
        let pdfFile = null;
        let pdfjsDoc = null; // pdf.js doc (streaming on demand)
        let currentBlobUrl = null;
        let isOffloaded = false;
        let totalPages = 0;
        let selectedPages = new Set();
        let currentMode = "range";
        let outputFormat = "zip";
        let splitResults = [];
        let splitStartTime = null;
        let lastSplitDurationMs = null;

        const LOW_RAM_THRESHOLD = 25 * 1024 * 1024; // 25 MB threshold for low-RAM streaming

        /* ─────────── ELEMENTS ─────────── */
        const uploadZone = document.getElementById("uploadZone");
        const fileInput = document.getElementById("fileInput");
        const browseBtn = document.getElementById("browseBtn");
        const workspace = document.getElementById("workspace");
        const fileName = document.getElementById("fileName");
        const fileSize = document.getElementById("fileSize");
        const pageCount = document.getElementById("pageCount");
        const changeFileBtn = document.getElementById("changeFileBtn");
        const modeTabs = document.querySelectorAll(".mode-tab");
        const configModes = document.querySelectorAll(".config-panel__mode");
        const rangeInput = document.getElementById("rangeInput");
        const nInput = document.getElementById("nInput");
        const stepDown = document.getElementById("stepDown");
        const stepUp = document.getElementById("stepUp");
        const pagesGrid = document.getElementById("pagesGrid");
        const selectedCount = document.getElementById("selectedCount");
        const splitBtn = document.getElementById("splitBtn");
        const splitSummary = document.getElementById("splitSummary");
        const progressWrap = document.getElementById("progressWrap");
        const progressFill = document.getElementById("progressFill");
        const progressText = document.getElementById("progressText");
        const resultsSection = document.getElementById("resultsSection");
        const resultCount = document.getElementById("resultCount");
        const resultsGrid = document.getElementById("resultsGrid");
        const downloadAllBtn = document.getElementById("downloadAllBtn");
        const splitAgainBtn = document.getElementById("splitAgainBtn");
        const toggleOpts = document.querySelectorAll(".toggle-opt");

        /* ─────────── UPLOAD ─────────── */
        uploadZone.addEventListener("click", (e) => {
          if (e.target !== browseBtn) fileInput.click();
        });
        uploadZone.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") fileInput.click();
        });
        browseBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          fileInput.click();
        });
        fileInput.addEventListener("change", () => {
          if (fileInput.files[0]) loadFile(fileInput.files[0]);
          fileInput.value = "";
        });

        uploadZone.addEventListener("dragover", (e) => {
          e.preventDefault();
          uploadZone.classList.add("drag-over");
        });
        uploadZone.addEventListener("dragleave", () =>
          uploadZone.classList.remove("drag-over"),
        );
        uploadZone.addEventListener("drop", (e) => {
          e.preventDefault();
          uploadZone.classList.remove("drag-over");
          const f = e.dataTransfer.files[0];
          if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) loadFile(f);
          else showToast("Please drop a valid PDF file.", "error");
        });

        changeFileBtn.addEventListener("click", () => {
          fileInput.value = "";
          fileInput.click();
        });

        function cleanupCurrentDoc() {
          if (currentBlobUrl) {
            try {
              URL.revokeObjectURL(currentBlobUrl);
            } catch (e) {}
            currentBlobUrl = null;
          }
          if (pdfjsDoc) {
            try {
              pdfjsDoc.destroy();
            } catch (e) {}
            pdfjsDoc = null;
          }
          if (thumbnailObserver) {
            thumbnailObserver.disconnect();
            thumbnailObserver = null;
          }
          renderQueue = [];
          activeRenders = 0;
        }

        async function loadFile(file) {
          if (!file) return;
          cleanupCurrentDoc();

          pdfFile = file;
          isOffloaded = file.size > LOW_RAM_THRESHOLD;

          try {
            currentBlobUrl = URL.createObjectURL(file);

            // PDF.js configured for low RAM streaming — NEVER load all pages into memory at once!
            const loadingTask = pdfjsLib.getDocument({
              url: currentBlobUrl,
              disableAutoFetch: true, // Prevents reading whole document into memory!
              disableStream: false, // Stream range chunks on demand
              rangeChunkSize: 65536, // 64 KB chunks
              maxImageSize: 2 * 1024 * 1024,
              cMapPacked: true,
            });

            pdfjsDoc = await loadingTask.promise;
            totalPages = pdfjsDoc.numPages;

            if (totalPages <= 0) {
              throw new Error("This PDF contains 0 pages or is damaged.");
            }

            fileName.textContent = file.name;
            const kb = (file.size / 1024).toFixed(0);
            const mb = (file.size / (1024 * 1024)).toFixed(1);
            pageCount.textContent = totalPages;
            fileSize.textContent = `${file.size > 1024 * 1024 ? mb + " MB" : kb + " KB"} · ${totalPages} pages`;

            const lowRamBadge = document.getElementById("lowRamBadge");
            if (lowRamBadge) {
              lowRamBadge.style.display = isOffloaded ? "inline-flex" : "none";
            }

            selectedPages.clear();
            resultsSection.classList.remove("active");
            splitResults = [];
            splitStartTime = null;
            lastSplitDurationMs = null;
            progressWrap.classList.remove("active");

            uploadZone.style.display = "none";
            workspace.classList.add("active");

            if (currentMode === "select") renderThumbnails();
            updateSummary();
            showToast(`Loaded "${file.name}" — ${totalPages} pages`);
            scheduleDBSave();
          } catch (err) {
            cleanupCurrentDoc();
            pdfFile = null;
            totalPages = 0;
            showToast(
              "Could not read PDF. Make sure it's a valid, non-encrypted file.",
              "error",
            );
            console.error(err);
          }
        }

        /* ─────────── MODE TABS ─────────── */
        modeTabs.forEach((tab) => {
          tab.addEventListener("click", () => {
            currentMode = tab.dataset.mode;
            modeTabs.forEach((t) => {
              t.classList.remove("active");
              t.setAttribute("aria-selected", "false");
            });
            tab.classList.add("active");
            tab.setAttribute("aria-selected", "true");
            configModes.forEach((m) => m.classList.remove("active"));
            document
              .getElementById(`mode-${currentMode}`)
              .classList.add("active");
            if (currentMode === "select" && pdfjsDoc) renderThumbnails();
            updateSummary();
            scheduleDBSave();
          });
        });

        /* ─────────── STEPPER & INPUTS ─────────── */
        stepDown.addEventListener("click", () => {
          const v = parseInt(nInput.value) || 1;
          if (v > 1) nInput.value = v - 1;
          updateSummary();
          scheduleDBSave();
        });
        stepUp.addEventListener("click", () => {
          nInput.value = (parseInt(nInput.value) || 1) + 1;
          updateSummary();
          scheduleDBSave();
        });
        nInput.addEventListener("input", () => {
          updateSummary();
          scheduleDBSave();
        });
        rangeInput.addEventListener("input", () => {
          updateSummary();
          scheduleDBSave();
        });

        /* ─────────── OUTPUT FORMAT ─────────── */
        toggleOpts.forEach((opt) => {
          opt.addEventListener("click", () => {
            toggleOpts.forEach((o) => o.classList.remove("active"));
            opt.classList.add("active");
            outputFormat = opt.dataset.out;
            scheduleDBSave();
          });
        });

        /* ─────────── THUMBNAILS (VIRTUALIZED LAZY OBSERVER) ─────────── */
        let thumbnailObserver = null;
        let renderQueue = [];
        let activeRenders = 0;
        const MAX_CONCURRENT_RENDERS = 2;

        function renderThumbnails() {
          if (!pdfjsDoc || !pagesGrid) return;
          pagesGrid.innerHTML = "";
          renderQueue = [];

          if (thumbnailObserver) {
            thumbnailObserver.disconnect();
            thumbnailObserver = null;
          }

          thumbnailObserver = new IntersectionObserver(
            (entries, observer) => {
              let hasNew = false;
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  const card = entry.target;
                  if (card.dataset.rendered === "true") {
                    observer.unobserve(card);
                    return;
                  }
                  const pageNum = parseInt(card.dataset.page, 10);
                  observer.unobserve(card);
                  if (!renderQueue.some((item) => item.pageNum === pageNum)) {
                    renderQueue.push({ pageNum, cardEl: card });
                    hasNew = true;
                  }
                }
              });
              if (hasNew) {
                processThumbnailQueue();
              }
            },
            {
              root: pagesGrid,
              rootMargin: "150px 0px",
              threshold: 0.01,
            },
          );

          for (let i = 1; i <= totalPages; i++) {
            const card = document.createElement("div");
            card.className =
              "page-card" + (selectedPages.has(i) ? " selected" : "");
            card.setAttribute("role", "listitem");
            card.setAttribute("aria-label", `Page ${i}`);
            card.dataset.page = i;
            card.dataset.rendered = "false";
            card.innerHTML = `
        <div class="page-loading"><div class="spinner"></div><span>p.${i}</span></div>
        <div class="page-card__check" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="page-card__num">p.${i}</div>`;
            card.addEventListener("click", () => togglePage(i, card));
            pagesGrid.appendChild(card);
            thumbnailObserver.observe(card);
          }
          updateSelectedCount();
        }

        async function processThumbnailQueue() {
          if (!pdfjsDoc || activeRenders >= MAX_CONCURRENT_RENDERS || renderQueue.length === 0) {
            return;
          }

          while (activeRenders < MAX_CONCURRENT_RENDERS && renderQueue.length > 0) {
            const task = renderQueue.shift();
            if (!task) break;
            const { pageNum, cardEl } = task;
            if (cardEl.dataset.rendered === "true") continue;

            activeRenders++;
            (async () => {
              try {
                if (!pdfjsDoc) return;
                const page = await pdfjsDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 0.35 });
                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.className = "page-card__canvas";
                const ctx = canvas.getContext("2d", { alpha: false });
                await page.render({ canvasContext: ctx, viewport }).promise;

                if (cardEl.parentNode) {
                  const loader = cardEl.querySelector(".page-loading");
                  if (loader) loader.replaceWith(canvas);
                  cardEl.dataset.rendered = "true";
                }
                page.cleanup?.();
              } catch (e) {
                /* ignore render errors */
              } finally {
                activeRenders--;
                processThumbnailQueue();
              }
            })();
          }
        }

        function togglePage(num, card) {
          if (selectedPages.has(num)) {
            selectedPages.delete(num);
            card.classList.remove("selected");
          } else {
            selectedPages.add(num);
            card.classList.add("selected");
          }
          updateSelectedCount();
          updateSummary();
          scheduleDBSave();
        }

        function updateSelectedCount() {
          selectedCount.textContent = selectedPages.size;
        }

        document
          .getElementById("selectAllBtn")
          .addEventListener("click", () => {
            for (let i = 1; i <= totalPages; i++) selectedPages.add(i);
            pagesGrid
              .querySelectorAll(".page-card")
              .forEach((c) => c.classList.add("selected"));
            updateSelectedCount();
            updateSummary();
            scheduleDBSave();
          });
        document.getElementById("clearAllBtn").addEventListener("click", () => {
          selectedPages.clear();
          pagesGrid
            .querySelectorAll(".page-card")
            .forEach((c) => c.classList.remove("selected"));
          updateSelectedCount();
          updateSummary();
          scheduleDBSave();
        });
        document.getElementById("invertBtn").addEventListener("click", () => {
          for (let i = 1; i <= totalPages; i++) {
            const card = pagesGrid.querySelector(`[data-page="${i}"]`);
            if (selectedPages.has(i)) {
              selectedPages.delete(i);
              card?.classList.remove("selected");
            } else {
              selectedPages.add(i);
              card?.classList.add("selected");
            }
          }
          updateSelectedCount();
          updateSummary();
          scheduleDBSave();
        });
        document
          .getElementById("selectOddBtn")
          .addEventListener("click", () => {
            selectedPages.clear();
            pagesGrid.querySelectorAll(".page-card").forEach((c) => {
              const n = parseInt(c.dataset.page);
              if (n % 2 !== 0) {
                selectedPages.add(n);
                c.classList.add("selected");
              } else c.classList.remove("selected");
            });
            updateSelectedCount();
            updateSummary();
            scheduleDBSave();
          });
        document
          .getElementById("selectEvenBtn")
          .addEventListener("click", () => {
            selectedPages.clear();
            pagesGrid.querySelectorAll(".page-card").forEach((c) => {
              const n = parseInt(c.dataset.page);
              if (n % 2 === 0) {
                selectedPages.add(n);
                c.classList.add("selected");
              } else c.classList.remove("selected");
            });
            updateSelectedCount();
            updateSummary();
            scheduleDBSave();
          });

        /* ─────────── PARSE RANGES ─────────── */
        function parseRangeString(str, max) {
          const groups = [];
          const parts = str
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          for (const part of parts) {
            if (part.includes("-")) {
              const [a, b] = part.split("-").map((n) => parseInt(n.trim()));
              if (!isNaN(a) && !isNaN(b) && a >= 1 && b <= max && a <= b) {
                groups.push({
                  label: `pages-${a}-to-${b}`,
                  pages: range(a, b),
                });
              } else return null;
            } else {
              const n = parseInt(part);
              if (!isNaN(n) && n >= 1 && n <= max) {
                groups.push({ label: `page-${n}`, pages: [n] });
              } else return null;
            }
          }
          return groups.length > 0 ? groups : null;
        }

        function range(a, b) {
          const r = [];
          for (let i = a; i <= b; i++) r.push(i);
          return r;
        }

        /* ─────────── SUMMARY ─────────── */
        function updateSummary() {
          if (!pdfFile || totalPages === 0) return;
          let text = "";
          if (currentMode === "range") {
            const r = parseRangeString(rangeInput.value, totalPages);
            text = r
              ? `Will create <strong>${r.length}</strong> PDF file(s)`
              : "Enter a valid range above";
          } else if (currentMode === "select") {
            text =
              selectedPages.size > 0
                ? `<strong>${selectedPages.size}</strong> pages selected → 1 PDF file`
                : "Select at least 1 page";
          } else if (currentMode === "every") {
            const n = Math.max(1, parseInt(nInput.value) || 1);
            const chunks = Math.ceil(totalPages / n);
            text = `Will create <strong>${chunks}</strong> PDF file(s) of ${n} page(s) each`;
          } else if (currentMode === "all") {
            text = `Will create <strong>${totalPages}</strong> individual PDF files`;
          }
          splitSummary.innerHTML = text;
        }

        /* ─────────── SPLIT ─────────── */
        splitBtn.addEventListener("click", doSplit);

        async function doSplit() {
          if (!pdfFile || totalPages === 0) return;
          splitStartTime = performance.now();

          let groups = [];

          if (currentMode === "range") {
            const parsed = parseRangeString(rangeInput.value, totalPages);
            if (!parsed) {
              showToast("Invalid range. Use format: 1-3, 5, 7-9", "error");
              return;
            }
            groups = parsed;
          } else if (currentMode === "select") {
            if (selectedPages.size === 0) {
              showToast("Please select at least one page.", "error");
              return;
            }
            const sorted = [...selectedPages].sort((a, b) => a - b);
            groups = [{ label: `selected-pages`, pages: sorted }];
          } else if (currentMode === "every") {
            const n = Math.max(1, parseInt(nInput.value) || 1);
            for (let i = 1; i <= totalPages; i += n) {
              const end = Math.min(i + n - 1, totalPages);
              groups.push({
                label: `pages-${i}-to-${end}`,
                pages: range(i, end),
              });
            }
          } else if (currentMode === "all") {
            for (let i = 1; i <= totalPages; i++) {
              groups.push({ label: `page-${i}`, pages: [i] });
            }
          }

          if (groups.length === 0) {
            showToast("Nothing to split.", "error");
            return;
          }

          splitBtn.disabled = true;
          progressWrap.classList.add("active");
          resultsSection.classList.remove("active");
          splitResults = [];
          progressFill.style.width = "0%";
          progressText.textContent = isOffloaded
            ? "⚡ Low-RAM: Preparing memory buffer…"
            : "Reading PDF…";

          let pdfDoc = null;
          try {
            await new Promise((r) => setTimeout(r, 40));

            progressText.textContent = isOffloaded
              ? "⚡ Low-RAM: Parsing document catalog…"
              : "Loading PDF catalog…";
            progressFill.style.width = "10%";
            await new Promise((r) => setTimeout(r, 20));

            let srcBuffer = await pdfFile.arrayBuffer();

            pdfDoc = await PDFLib.PDFDocument.load(srcBuffer, {
              ignoreEncryption: true,
              parseSpeed: Infinity,
              updateMetadata: false,
            });

            // CRITICAL LOW-RAM STEP: Free original ArrayBuffer immediately!
            srcBuffer = null;

            const baseName = (pdfFile.name || "document").replace(/\.pdf$/i, "");

            for (let gi = 0; gi < groups.length; gi++) {
              const { label, pages } = groups[gi];
              const progressPct = 10 + Math.round(((gi + 1) / groups.length) * 80);
              progressText.textContent = `Creating file ${gi + 1} of ${groups.length}…`;
              progressFill.style.width = `${progressPct}%`;

              const newDoc = await PDFLib.PDFDocument.create();
              const indices = pages.map((p) => p - 1);
              const copied = await newDoc.copyPages(pdfDoc, indices);
              copied.forEach((pg) => newDoc.addPage(pg));

              const bytes = await newDoc.save({
                useObjectStreams: false,
                addDefaultPage: false,
              });

              const blob = new Blob([bytes], { type: "application/pdf" });
              const outName = `${baseName}_${label}.pdf`;
              splitResults.push({ name: outName, blob, size: blob.size });

              await new Promise((r) => setTimeout(r, 0)); // yield
            }

            progressFill.style.width = "100%";
            progressText.textContent = `Done! Created ${groups.length} file(s).`;

            await new Promise((r) => setTimeout(r, 300));
            progressWrap.classList.remove("active");

            renderResults();
            showToast(`Split complete — ${groups.length} file(s) ready!`);

            if (outputFormat === "zip" && splitResults.length > 1) {
              // Results ready
            } else if (splitResults.length === 1) {
              triggerDownloadBlob(splitResults[0].blob, splitResults[0].name);
            }
          } catch (err) {
            showToast("Split failed. Please try again.", "error");
            console.error(err);
          } finally {
            pdfDoc = null; // Always release pdfDoc from memory!
            splitBtn.disabled = false;
          }
        }

        function renderResults() {
          resultsSection.classList.add("active");
          resultCount.textContent = splitResults.length;
          resultsGrid.innerHTML = "";
          splitResults.forEach((r, idx) => {
            const card = document.createElement("div");
            card.className = "result-card";
            const kb = (r.size / 1024).toFixed(0);
            card.innerHTML = `
        <div class="result-card__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="result-card__meta">
          <div class="result-card__name" title="${r.name}">${r.name}</div>
          <div class="result-card__size">${kb} KB</div>
        </div>
        <button class="result-card__dl" aria-label="Download ${r.name}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>`;
            card
              .querySelector(".result-card__dl")
              .addEventListener("click", () => {
                triggerDownloadBlob(
                  splitResults[idx].blob,
                  splitResults[idx].name,
                );
              });
            resultsGrid.appendChild(card);
          });

          downloadAllBtn.style.display =
            splitResults.length > 1 ? "flex" : "none";
          resultsSection.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });

          if (window.PDFMasterPopup && splitResults.length > 0) {
            const durationMs = splitStartTime
              ? Math.max(1, Math.round(performance.now() - splitStartTime))
              : (lastSplitDurationMs || null);
            if (durationMs) lastSplitDurationMs = durationMs;

            if (splitResults.length === 1) {
              const single = splitResults[0];
              window.PDFMasterPopup.show({
                fileType: "pdf",
                fileName: single.name,
                fileSize: single.size,
                downloadText: "Download PDF",
                toolName: "Split PDF",
                durationMs: durationMs,
                blob: single.blob,
                onDownload: () => {
                  triggerDownloadBlob(single.blob, single.name);
                },
              });
            } else {
              const baseName = (pdfFile ? pdfFile.name : "document").replace(/\.pdf$/i, "");
              const totalSize = splitResults.reduce((acc, r) => acc + (r.size || 0), 0);
              window.PDFMasterPopup.show({
                fileType: "zip",
                fileName: `${baseName}_split.zip`,
                fileSize: totalSize,
                downloadText: `Download All as ZIP (${splitResults.length} files)`,
                toolName: "Split PDF",
                durationMs: durationMs,
                onDownload: () => {
                  downloadAllBtn.click();
                },
              });
            }
          }
        }

        downloadAllBtn.addEventListener("click", async () => {
          if (splitResults.length === 0) return;
          if (window.JSZip) {
            downloadAllBtn.textContent = "Creating ZIP...";
            downloadAllBtn.disabled = true;
            try {
              const zip = new JSZip();
              splitResults.forEach((r) => zip.file(r.name, r.blob));
              const zipBlob = await zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: { level: 3 },
              });
              const baseName = (pdfFile ? pdfFile.name : "document").replace(/\.pdf$/i, "");
              triggerDownloadBlob(zipBlob, `${baseName}_split.zip`);
              showToast("ZIP download started!");
            } catch (e) {
              showToast("ZIP creation failed.", "error");
            } finally {
              downloadAllBtn.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download All (ZIP)';
              downloadAllBtn.disabled = false;
            }
          } else {
            splitResults.forEach((r, i) =>
              setTimeout(() => triggerDownloadBlob(r.blob, r.name), i * 300),
            );
          }
        });

        splitAgainBtn.addEventListener("click", () => {
          resultsSection.classList.remove("active");
          splitResults = [];
          splitStartTime = null;
          lastSplitDurationMs = null;
          rangeInput.value = "";
          selectedPages.clear();
          pagesGrid
            .querySelectorAll(".page-card")
            .forEach((c) => c.classList.remove("selected"));
          updateSelectedCount();
          updateSummary();
          showToast("Ready for another split!");
          workspace.scrollIntoView({ behavior: "smooth", block: "start" });
        });

        function triggerDownloadBlob(blob, name) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }

        /* ═══════════════════════════════════════════════════
           INDEXEDDB RECOVERY ENGINE
        ═══════════════════════════════════════════════════ */
        let dbPromise = null;
        let dbSaveTimer = null;

        function openDB() {
          if (dbPromise) return dbPromise;
          dbPromise = new Promise((resolve, reject) => {
            const DB_NAME = "pdfmaster_split_db";
            const DB_VERSION = 1;
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings");
              }
              if (!db.objectStoreNames.contains("split_data")) {
                db.createObjectStore("split_data");
              }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
          });
          return dbPromise;
        }

        function scheduleDBSave() {
          if (dbSaveTimer) clearTimeout(dbSaveTimer);
          dbSaveTimer = setTimeout(() => {
            saveSessionToDB();
          }, 400);
        }

        async function saveSessionToDB() {
          if (!pdfFile) return false;
          try {
            const sessionData = {
              timestamp: Date.now(),
              fileName: pdfFile.name,
              fileSize: pdfFile.size,
              totalPages: totalPages,
              currentMode: currentMode,
              rangeValue: rangeInput ? rangeInput.value : "",
              nValue: nInput ? nInput.value : "1",
              selectedPages: Array.from(selectedPages),
              outputFormat: outputFormat,
              isOffloaded: isOffloaded,
            };

            const fileData = {
              fileName: pdfFile.name,
              fileSize: pdfFile.size,
              file: pdfFile instanceof Blob ? pdfFile : null,
              timestamp: Date.now(),
            };

            const db = await openDB();
            const tx = db.transaction(["settings", "split_data"], "readwrite");
            const settingsStore = tx.objectStore("settings");
            const dataStore = tx.objectStore("split_data");

            settingsStore.put(sessionData, "session");
            dataStore.put(fileData, "file");

            await new Promise((res, rej) => {
              tx.oncomplete = () => res();
              tx.onerror = (e) => rej(e.target.error);
              tx.onabort = (e) => rej(e.target.error);
            });

            updateRecoveryBadge(true);
            return true;
          } catch (err) {
            console.warn("IndexedDB save failed:", err);
            return false;
          }
        }

        async function loadSessionFromDB(isManual = false) {
          try {
            const db = await openDB();
            const tx = db.transaction(["settings", "split_data"], "readonly");
            const settingsReq = tx.objectStore("settings").get("session");
            const dataReq = tx.objectStore("split_data").get("file");

            const [session, data] = await Promise.all([
              new Promise((res) => {
                settingsReq.onsuccess = () => res(settingsReq.result);
                settingsReq.onerror = () => res(null);
              }),
              new Promise((res) => {
                dataReq.onsuccess = () => res(dataReq.result);
                dataReq.onerror = () => res(null);
              }),
            ]);

            if (!data || (!data.file && !data.bytes)) {
              updateRecoveryBadge(false);
              if (isManual) {
                showToast("No stored session found in recovery storage.", "error");
              }
              return false;
            }

            const fileNameVal = data.fileName || "document.pdf";
            const storedBlob = data.file instanceof Blob
              ? data.file
              : (data.bytes ? new Blob([data.bytes], { type: "application/pdf" }) : null);

            if (!storedBlob) return false;

            const restoredFile = storedBlob instanceof File
              ? storedBlob
              : new File([storedBlob], fileNameVal, { type: "application/pdf" });

            await loadFile(restoredFile);

            if (session) {
              if (session.currentMode) {
                currentMode = session.currentMode;
                modeTabs.forEach((t) => {
                  const isAct = t.dataset.mode === currentMode;
                  t.classList.toggle("active", isAct);
                  t.setAttribute("aria-selected", isAct ? "true" : "false");
                });
                configModes.forEach((m) => m.classList.remove("active"));
                const targetModePanel = document.getElementById(
                  `mode-${currentMode}`,
                );
                if (targetModePanel) targetModePanel.classList.add("active");
              }
              if (session.rangeValue !== undefined && rangeInput) {
                rangeInput.value = session.rangeValue;
              }
              if (session.nValue !== undefined && nInput) {
                nInput.value = session.nValue;
              }
              if (
                session.selectedPages &&
                Array.isArray(session.selectedPages)
              ) {
                session.selectedPages.forEach((p) => selectedPages.add(p));
              }
              if (session.outputFormat) {
                outputFormat = session.outputFormat;
                toggleOpts.forEach((o) => {
                  o.classList.toggle("active", o.dataset.out === outputFormat);
                });
              }
            }

            if (currentMode === "select" && pdfjsDoc) {
              renderThumbnails();
            }
            updateSummary();
            updateRecoveryBadge(true);

            if (isManual) {
              showToast(
                `Restored "${restoredFile.name}" and split configuration!`,
                "success",
              );
            }
            return true;
          } catch (err) {
            console.warn("IndexedDB load failed:", err);
            if (isManual) {
              showToast(
                "Could not access recovery storage: " + err.message,
                "error",
              );
            }
            return false;
          }
        }

        async function clearSessionFromDB() {
          try {
            const db = await openDB();
            const tx = db.transaction(["settings", "split_data"], "readwrite");
            tx.objectStore("settings").clear();
            tx.objectStore("split_data").clear();
            updateRecoveryBadge(false);
          } catch (err) {
            console.warn("IndexedDB clear failed:", err);
          }
        }

        async function checkStoredSessionAvailable(notifyOnFound = false) {
          try {
            const db = await openDB();
            const tx = db.transaction(["split_data"], "readonly");
            const dataReq = tx.objectStore("split_data").get("file");
            const data = await new Promise((res) => {
              dataReq.onsuccess = () => res(dataReq.result);
              dataReq.onerror = () => res(null);
            });

            const hasData = !!(data && (data.file || data.bytes));
            updateRecoveryBadge(hasData);

            if (hasData && notifyOnFound && !pdfFile) {
              const name = data.fileName || "PDF document";
              showToast(
                `Previous session ("${name}") is available. Click to restore.`,
                "info",
                8000,
                () => loadSessionFromDB(true),
                "Restore",
              );
            }
            return hasData;
          } catch {
            updateRecoveryBadge(false);
            return false;
          }
        }

        function updateRecoveryBadge(hasData) {
          const badge = document.getElementById("recoveryBadge");
          if (badge) {
            badge.style.display = hasData ? "block" : "none";
          }
        }

        // Wire recovery button
        const recoveryBtn = document.getElementById("recoveryBtn");
        if (recoveryBtn) {
          recoveryBtn.addEventListener("click", () => {
            loadSessionFromDB(true);
          });
        }

        // Check stored session on startup
        checkStoredSessionAvailable(true);
      })();
