/**
 * PDFMaster - Sign PDF Tool
 * Module: pdf-engine.js
 * PDF.js document loading, low-RAM thumbnail generation, and main stage rendering
 */
(function () {
  "use strict";

  window.PDFSign = window.PDFSign || {};
  const PDFSign = window.PDFSign;
  const state = PDFSign.state;

  // Configure PDF.js Worker
  const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
  if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdf.worker.min.js";
  }

  // =============================================
  //  PDF FILE LOADING
  // =============================================
  PDFSign.handleFileSelect = async function (file) {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      PDFSign.showToast("Please choose a valid PDF file.");
      return;
    }
    await PDFSign.loadPdfFile(file, file.name);
  };

  PDFSign.loadPdfFile = async function (blob, name) {
    try {
      PDFSign.showLoading(
        true,
        "Opening PDF Document",
        "Parsing structure locally…",
      );
      state.fileName = name || "document.pdf";
      state.fileSize = blob.size;
      state.currentBlob = blob;
      state.items = [];
      state.history = [];
      state.future = [];
      state.currentPage = 1;
      PDFSign.updateUndoRedoBtns();

      // Read array buffer safely
      const buffer = await blob.arrayBuffer();
      state.arrayBuffer = buffer.slice(0);

      // Initialize PDF.js document with a separate copy so worker transfer doesn't neuter state.arrayBuffer
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer.slice(0)),
        cMapUrl: "/assets/vendor/cmaps/",
        cMapPacked: true,
      });

      loadingTask.onProgress = (p) => {
        if (p.total > 0) {
          const pct = Math.round((p.loaded / p.total) * 60);
          PDFSign.updateLoading(
            pct,
            "Opening PDF Document",
            "Loading pages into memory…",
          );
        }
      };

      state.pdfJsDoc = await loadingTask.promise;
      state.totalPages = state.pdfJsDoc.numPages;

      // Update workspace header details
      const fileNameText = document.getElementById("fileNameText");
      const sidebarPageCount = document.getElementById("sidebarPageCount");
      const uploadZone = document.getElementById("uploadZone");
      const resultsCard = document.getElementById("resultsCard");
      const workspace = document.getElementById("workspace");

      if (fileNameText) fileNameText.textContent = state.fileName;
      if (sidebarPageCount)
        sidebarPageCount.textContent = `${state.totalPages} Pages`;

      // Switch views
      if (uploadZone) uploadZone.style.display = "none";
      if (resultsCard) resultsCard.classList.remove("active");
      if (workspace) workspace.classList.add("active");

      // Setup Thumbnails & Render Active Page
      PDFSign.setupThumbnailsList();
      await PDFSign.renderActivePage();

      PDFSign.showLoading(false);
      PDFSign.autoSaveSession();
      PDFSign.showToast("Document loaded successfully!");
    } catch (err) {
      console.error("PDF Load Error:", err);
      PDFSign.showLoading(false);
      PDFSign.showToast(
        "Failed to load PDF. File may be encrypted or corrupted.",
      );
    }
  };

  // =============================================
  //  THUMBNAILS (INTERSECTION OBSERVER)
  // =============================================
  PDFSign.setupThumbnailsList = function () {
    const thumbnailsList = document.getElementById("thumbnailsList");
    if (!thumbnailsList) return;
    thumbnailsList.innerHTML = "";

    if (PDFSign.thumbnailObserver) {
      PDFSign.thumbnailObserver.disconnect();
    }

    PDFSign.thumbnailObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(
              entry.target.getAttribute("data-page"),
              10,
            );
            PDFSign.renderThumbnail(pageNum, entry.target);
          }
        });
      },
      { root: thumbnailsList, rootMargin: "100px" },
    );

    for (let i = 1; i <= state.totalPages; i++) {
      const card = document.createElement("div");
      card.className = `thumb-card ${i === state.currentPage ? "active" : ""}`;
      card.setAttribute("data-page", i);
      card.id = `thumbCard_${i}`;

      const canvasWrap = document.createElement("div");
      canvasWrap.className = "thumb-canvas-wrap";
      canvasWrap.id = `thumbCanvasWrap_${i}`;
      canvasWrap.innerHTML = `<span class="thumb-placeholder">P. ${i}</span>`;
      card.appendChild(canvasWrap);

      const meta = document.createElement("div");
      meta.className = "thumb-meta";
      meta.innerHTML = `<span>Page ${i}</span><span class="thumb-signed-badge" id="thumbSignedBadge_${i}" style="display:none">✍️ 0</span>`;
      card.appendChild(meta);

      card.addEventListener("click", () => {
        PDFSign.switchPage(i);
      });

      thumbnailsList.appendChild(card);
      PDFSign.thumbnailObserver.observe(card);
    }

    PDFSign.updateThumbnailBadges();
  };

  PDFSign.renderThumbnail = async function (pageNum, cardEl) {
    if (!state.pdfJsDoc || !cardEl) return;
    const wrap = cardEl.querySelector(".thumb-canvas-wrap");
    if (!wrap || wrap.querySelector("canvas")) return; // already rendered

    try {
      const page = await state.pdfJsDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.25 });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d", { alpha: false });

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      PDFSign.activeThumbnailTasks.set(pageNum, renderTask);

      await renderTask.promise;
      PDFSign.activeThumbnailTasks.delete(pageNum);

      wrap.innerHTML = "";
      wrap.appendChild(canvas);
    } catch (e) {
      if (e && e.name !== "RenderingCancelledException") {
        console.warn(`Thumb ${pageNum} render cancelled:`, e);
      }
    }
  };

  PDFSign.updateThumbnailBadges = function () {
    for (let i = 1; i <= state.totalPages; i++) {
      const count = state.items.filter((item) => item.pageNum === i).length;
      const badge = document.getElementById(`thumbSignedBadge_${i}`);
      if (badge) {
        if (count > 0) {
          badge.style.display = "inline-flex";
          badge.textContent = `✍️ ${count}`;
        } else {
          badge.style.display = "none";
        }
      }
    }
  };

  // =============================================
  //  ACTIVE PAGE RENDERING & SWITCHING
  // =============================================
  PDFSign.renderActivePage = async function () {
    if (!state.pdfJsDoc) return;
    const pageNum = state.currentPage;

    const pageIndicator = document.getElementById("pageIndicator");
    const prevPageBtn = document.getElementById("prevPageBtn");
    const nextPageBtn = document.getElementById("nextPageBtn");
    const editorViewerWrap = document.getElementById("editorViewerWrap");
    const pageRenderCanvas = document.getElementById("pageRenderCanvas");
    const pageStageContainer = document.getElementById("pageStageContainer");
    const zoomLevelText = document.getElementById("zoomLevelText");

    // Update navigation indicators
    if (pageIndicator)
      pageIndicator.textContent = `Page ${pageNum} of ${state.totalPages}`;
    if (prevPageBtn) prevPageBtn.disabled = pageNum <= 1;
    if (nextPageBtn) nextPageBtn.disabled = pageNum >= state.totalPages;

    // Update active thumb card styling
    document.querySelectorAll(".thumb-card").forEach((c) => {
      const p = parseInt(c.getAttribute("data-page"), 10);
      if (p === pageNum) {
        c.classList.add("active");
        c.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        c.classList.remove("active");
      }
    });

    // Cancel any previous active render
    if (PDFSign.activePageRenderTask) {
      PDFSign.activePageRenderTask.cancel();
      PDFSign.activePageRenderTask = null;
    }

    try {
      const page = await state.pdfJsDoc.getPage(pageNum);
      const initialViewport = page.getViewport({ scale: 1.0 });

      // Determine viewer scale based on available container width & zoom
      const containerW =
        (editorViewerWrap ? editorViewerWrap.clientWidth : 800) - 64;
      let targetScale = state.zoom;
      if (state.fitWidth && containerW > 0) {
        targetScale = (containerW / initialViewport.width) * state.zoom;
      }

      // Restrict scale bounds
      targetScale = Math.min(Math.max(targetScale, 0.4), 3.0);
      if (zoomLevelText) {
        zoomLevelText.textContent = `${Math.round(state.zoom * 100)}%`;
      }

      const viewport = page.getViewport({ scale: targetScale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (pageRenderCanvas && pageStageContainer) {
        pageRenderCanvas.width = viewport.width * dpr;
        pageRenderCanvas.height = viewport.height * dpr;
        pageRenderCanvas.style.width = `${viewport.width}px`;
        pageRenderCanvas.style.height = `${viewport.height}px`;

        pageStageContainer.style.width = `${viewport.width}px`;
        pageStageContainer.style.height = `${viewport.height}px`;

        const ctx = pageRenderCanvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        PDFSign.activePageRenderTask = page.render(renderContext);
        await PDFSign.activePageRenderTask.promise;
        PDFSign.activePageRenderTask = null;
      }

      // Render placed items overlay on this page
      if (PDFSign.renderOverlayItems) {
        PDFSign.renderOverlayItems();
      }
    } catch (e) {
      if (e && e.name !== "RenderingCancelledException") {
        console.error("Page render error:", e);
      }
    }
  };

  PDFSign.switchPage = function (newPage) {
    if (newPage < 1 || newPage > state.totalPages) return;
    state.currentPage = newPage;
    state.selectedItemId = null;
    PDFSign.renderActivePage();
  };
})();
