/**
 * PDFMaster - Sign PDF Tool
 * Module: overlay-manager.js
 * Placed signature items on the active PDF page, drag/resize/rotate transforms, mini-toolbar & shortcuts
 */
(function () {
  "use strict";

  window.PDFSign = window.PDFSign || {};
  const PDFSign = window.PDFSign;
  const state = PDFSign.state;

  // DOM Elements
  const signatureOverlay = document.getElementById("signatureOverlay");
  const pageStageContainer = document.getElementById("pageStageContainer");
  const editorViewerWrap = document.getElementById("editorViewerWrap");
  const sigStudioModal = document.getElementById("sigStudioModal");
  const undoDrawBtn = document.getElementById("undoDrawBtn");
  const redoDrawBtn = document.getElementById("redoDrawBtn");

  // Transform / Drag variables on page stage
  let activeInteraction = null;

  // =============================================
  //  OVERLAY RENDERING
  // =============================================
  PDFSign.renderOverlayItems = function () {
    if (!signatureOverlay) return;
    signatureOverlay.innerHTML = "";

    const curPageItems = state.items.filter(
      (item) => item.pageNum === state.currentPage,
    );

    curPageItems.forEach((item) => {
      const el = PDFSign.createSignatureElement(item);
      signatureOverlay.appendChild(el);
    });
  };

  PDFSign.createSignatureElement = function (item) {
    const el = document.createElement("div");
    el.className = `sig-element ${item.id === state.selectedItemId ? "selected" : ""}`;
    el.id = `sigEl_${item.id}`;

    // Apply percentage position & dimensions
    el.style.left = `${item.xPercent * 100}%`;
    el.style.top = `${item.yPercent * 100}%`;
    el.style.width = `${item.widthPercent * 100}%`;
    el.style.height = `${item.heightPercent * 100}%`;
    el.style.transform = `rotate(${item.rotation || 0}deg)`;

    // Content Wrapper
    const content = document.createElement("div");
    content.className = "sig-element-content";

    if (item.dataUrl) {
      const img = document.createElement("img");
      img.src = item.dataUrl;
      img.alt = item.type;
      content.appendChild(img);
    } else if (item.text) {
      const txt = document.createElement("div");
      txt.className = "sig-text-node";
      txt.textContent = item.text;
      txt.style.color = item.color || "#111827";
      content.appendChild(txt);
    }
    el.appendChild(content);

    // Transform Handles
    const handles = ["nw", "ne", "sw", "se", "rotate"];
    handles.forEach((h) => {
      const hEl = document.createElement("div");
      hEl.className = `sig-handle handle-${h}`;
      hEl.setAttribute("data-handle", h);
      el.appendChild(hEl);
    });

    // Floating Contextual Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "sig-mini-toolbar";
    toolbar.innerHTML = `
      <button class="mini-btn mini-btn-dup" title="Duplicate on this page"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
      <button class="mini-btn mini-btn-all" title="Apply to All Pages"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a2 2 0 0 1 2 2v1"></path><path d="M4 6h14a2 2 0 0 1 2 2v1"></path><rect x="2" y="9" width="20" height="13" rx="2"></rect><text x="12" y="16" font-size="7.5" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none" letter-spacing="0.5">ALL</text></svg></button>
      <button class="mini-btn mini-btn-del" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
    `;

    toolbar.querySelector(".mini-btn-dup").addEventListener("click", (e) => {
      e.stopPropagation();
      PDFSign.duplicateItem(item);
    });

    toolbar.querySelector(".mini-btn-all").addEventListener("click", (e) => {
      e.stopPropagation();
      PDFSign.applyItemToAllPages(item);
    });

    toolbar.querySelector(".mini-btn-del").addEventListener("click", (e) => {
      e.stopPropagation();
      PDFSign.deleteItem(item.id);
    });

    el.appendChild(toolbar);

    // Pointer Events for Dragging, Resizing & Rotating
    el.addEventListener("pointerdown", (e) => onElementPointerDown(e, item));

    return el;
  };

  PDFSign.selectItem = function (id) {
    state.selectedItemId = id;
    document.querySelectorAll(".sig-element").forEach((el) => {
      if (el.id === `sigEl_${id}`) {
        el.classList.add("selected");
      } else {
        el.classList.remove("selected");
      }
    });
  };

  PDFSign.deselectAll = function () {
    state.selectedItemId = null;
    document.querySelectorAll(".sig-element").forEach((el) => {
      el.classList.remove("selected");
    });
  };

  // =============================================
  //  POINTER INTERACTIONS (DRAG / RESIZE / ROTATE)
  // =============================================
  function onElementPointerDown(e, item) {
    if (e.target.closest(".sig-mini-toolbar")) return;
    e.stopPropagation();
    PDFSign.selectItem(item.id);

    const handle = e.target.getAttribute("data-handle");
    const stageRect = pageStageContainer
      ? pageStageContainer.getBoundingClientRect()
      : { width: 800, height: 1100 };

    activeInteraction = {
      type: handle ? (handle === "rotate" ? "rotate" : "resize") : "drag",
      handle: handle,
      item: item,
      startX: e.clientX,
      startY: e.clientY,
      initialItem: { ...item },
      stageW: stageRect.width,
      stageH: stageRect.height,
    };

    window.addEventListener("pointermove", onElementPointerMove);
    window.addEventListener("pointerup", onElementPointerUp);
    window.addEventListener("pointercancel", onElementPointerUp);
  }

  function onElementPointerMove(e) {
    if (!activeInteraction) return;
    const { type, handle, item, startX, startY, initialItem, stageW, stageH } =
      activeInteraction;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (type === "drag") {
      let newXPercent = initialItem.xPercent + dx / stageW;
      let newYPercent = initialItem.yPercent + dy / stageH;

      newXPercent = Math.max(
        0,
        Math.min(newXPercent, 1 - initialItem.widthPercent),
      );
      newYPercent = Math.max(
        0,
        Math.min(newYPercent, 1 - initialItem.heightPercent),
      );

      item.xPercent = newXPercent;
      item.yPercent = newYPercent;

      const el = document.getElementById(`sigEl_${item.id}`);
      if (el) {
        el.style.left = `${item.xPercent * 100}%`;
        el.style.top = `${item.yPercent * 100}%`;
      }
    } else if (type === "resize") {
      const aspect = initialItem.aspectRatio || 2.5;
      let newW = initialItem.widthPercent * stageW;
      let newH = initialItem.heightPercent * stageH;

      if (handle === "se") {
        newW = Math.max(40, initialItem.widthPercent * stageW + dx);
        newH = newW / aspect;
      } else if (handle === "sw") {
        newW = Math.max(40, initialItem.widthPercent * stageW - dx);
        newH = newW / aspect;
        item.xPercent =
          initialItem.xPercent + (initialItem.widthPercent - newW / stageW);
      } else if (handle === "ne") {
        newW = Math.max(40, initialItem.widthPercent * stageW + dx);
        newH = newW / aspect;
        item.yPercent =
          initialItem.yPercent + (initialItem.heightPercent - newH / stageH);
      } else if (handle === "nw") {
        newW = Math.max(40, initialItem.widthPercent * stageW - dx);
        newH = newW / aspect;
        item.xPercent =
          initialItem.xPercent + (initialItem.widthPercent - newW / stageW);
        item.yPercent =
          initialItem.yPercent + (initialItem.heightPercent - newH / stageH);
      }

      item.widthPercent = newW / stageW;
      item.heightPercent = newH / stageH;

      const el = document.getElementById(`sigEl_${item.id}`);
      if (el) {
        el.style.left = `${item.xPercent * 100}%`;
        el.style.top = `${item.yPercent * 100}%`;
        el.style.width = `${item.widthPercent * 100}%`;
        el.style.height = `${item.heightPercent * 100}%`;
      }
    } else if (type === "rotate") {
      const el = document.getElementById(`sigEl_${item.id}`);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const rad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      let deg = Math.round(rad * (180 / Math.PI)) + 90;
      deg = (deg + 360) % 360;

      // Snap to 0, 90, 180, 270 if close
      if (Math.abs(deg - 0) < 4 || Math.abs(deg - 360) < 4) deg = 0;
      if (Math.abs(deg - 90) < 4) deg = 90;
      if (Math.abs(deg - 180) < 4) deg = 180;
      if (Math.abs(deg - 270) < 4) deg = 270;

      item.rotation = deg;
      el.style.transform = `rotate(${deg}deg)`;
    }
  }

  function onElementPointerUp() {
    if (activeInteraction) {
      window.removeEventListener("pointermove", onElementPointerMove);
      window.removeEventListener("pointerup", onElementPointerUp);
      window.removeEventListener("pointercancel", onElementPointerUp);
      activeInteraction = null;
      PDFSign.pushHistory();
    }
  }

  // Click outside to deselect
  if (editorViewerWrap) {
    editorViewerWrap.addEventListener("pointerdown", (e) => {
      if (
        !e.target.closest(".sig-element") &&
        !e.target.closest(".sig-mini-toolbar")
      ) {
        PDFSign.deselectAll();
      }
    });
  } else if (signatureOverlay) {
    signatureOverlay.addEventListener("pointerdown", (e) => {
      if (e.target === signatureOverlay) {
        PDFSign.deselectAll();
      }
    });
  }

  // =============================================
  //  TOOLBAR BUTTON ACTIONS (ITEM LEVEL)
  // =============================================
  PDFSign.duplicateItem = function (item) {
    const newItem = {
      ...item,
      id: PDFSign.getUniqueId(item.type),
      xPercent: Math.min(0.7, item.xPercent + 0.04),
      yPercent: Math.min(0.7, item.yPercent + 0.04),
    };
    state.items.push(newItem);
    state.selectedItemId = newItem.id;
    PDFSign.pushHistory();
    PDFSign.renderOverlayItems();
    PDFSign.updateThumbnailBadges();
    PDFSign.showToast("Item duplicated");
  };

  PDFSign.applyItemToAllPages = function (item) {
    item.appliedToAllPages = true;
    const origPage = item.pageNum;
    let addedCount = 0;
    for (let p = 1; p <= state.totalPages; p++) {
      if (p !== origPage) {
        state.items.push({
          ...item,
          id: PDFSign.getUniqueId(item.type),
          pageNum: p,
          appliedToAllPages: true,
        });
        addedCount++;
      }
    }
    PDFSign.pushHistory();
    PDFSign.updateThumbnailBadges();
    PDFSign.showToast(
      `Signature applied across all ${state.totalPages} pages!`,
    );
  };

  PDFSign.deleteItem = function (id) {
    state.items = state.items.filter((i) => i.id !== id);
    if (state.selectedItemId === id) {
      state.selectedItemId = null;
    }
    PDFSign.pushHistory();
    PDFSign.renderOverlayItems();
    PDFSign.updateThumbnailBadges();
    PDFSign.showToast("Signature removed");
  };

  PDFSign.placeNewItem = function (options) {
    const aspect = options.aspectRatio || 2.5;
    const widthPct = options.widthPercent || 0.24;
    const heightPct = widthPct / aspect;

    const newItem = {
      id: PDFSign.getUniqueId(options.type || "sig"),
      pageNum: state.currentPage,
      type: options.type || "signature",
      source: options.source || state.studio.activeTab || "draw",
      font: options.font || null,
      inkColor: options.inkColor || null,
      removeBg: options.removeBg !== undefined ? options.removeBg : false,
      dataUrl: options.dataUrl || null,
      text: options.text || "",
      color: options.color || "#111827",
      xPercent: 0.5 - widthPct / 2, // centered
      yPercent: 0.65, // lower-half signing area
      widthPercent: widthPct,
      heightPercent: heightPct,
      rotation: 0,
      aspectRatio: aspect,
    };

    state.items.push(newItem);
    state.selectedItemId = newItem.id;
    PDFSign.pushHistory();
    PDFSign.renderOverlayItems();
    PDFSign.updateThumbnailBadges();

    PDFSign.showToast("Signature placed on page! Drag or resize as needed.");
  };

  PDFSign.useSignatureData = function (
    dataUrl,
    type = "signature",
    aspectRatio = 2.5,
    meta = {},
  ) {
    PDFSign.placeNewItem({
      type,
      dataUrl,
      aspectRatio,
      widthPercent: type === "initials" ? 0.12 : 0.24,
      source: meta.source || state.studio.activeTab || "draw",
      font: meta.font || (state.studio.activeTab === "type" ? state.studio.selectedFont : null),
      inkColor: meta.inkColor || state.studio.inkColor || null,
      removeBg: meta.removeBg !== undefined ? meta.removeBg : Boolean(state.studio.removeBg),
      color: meta.color || state.studio.penColor || "#111827",
    });
  };

  // =============================================
  //  KEYBOARD SHORTCUTS
  // =============================================
  window.addEventListener("keydown", (e) => {
    // Only if not in an input, textarea, select, or editable element
    if (
      document.activeElement &&
      (document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA" ||
        document.activeElement.tagName === "SELECT" ||
        document.activeElement.isContentEditable)
    ) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (
        sigStudioModal &&
        sigStudioModal.classList.contains("active") &&
        state.studio.activeTab === "draw"
      ) {
        if (e.shiftKey) {
          if (redoDrawBtn) redoDrawBtn.click();
        } else {
          if (undoDrawBtn) undoDrawBtn.click();
        }
        return;
      }
      if (e.shiftKey) {
        PDFSign.redo();
      } else {
        PDFSign.undo();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      if (
        sigStudioModal &&
        sigStudioModal.classList.contains("active") &&
        state.studio.activeTab === "draw"
      ) {
        if (redoDrawBtn) redoDrawBtn.click();
        return;
      }
      PDFSign.redo();
      return;
    }

    if (e.key === "Escape") {
      PDFSign.deselectAll();
      if (PDFSign.closeStudioModal) PDFSign.closeStudioModal();
      return;
    }

    // Modal guard: do not switch pages in background if studio modal is open
    if (sigStudioModal && sigStudioModal.classList.contains("active")) {
      return;
    }

    // Page navigation shortcuts (Left/Right Arrow, PageUp/PageDown, Ctrl+Home/End)
    if (state.pdfJsDoc && state.totalPages > 1) {
      if (
        e.key === "PageUp" ||
        (e.key === "ArrowLeft" &&
          (!state.selectedItemId || e.altKey || e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
        PDFSign.switchPage(state.currentPage - 1);
        return;
      }

      if (
        e.key === "PageDown" ||
        (e.key === "ArrowRight" &&
          (!state.selectedItemId || e.altKey || e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
        PDFSign.switchPage(state.currentPage + 1);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "Home") {
        e.preventDefault();
        PDFSign.switchPage(1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "End") {
        e.preventDefault();
        PDFSign.switchPage(state.totalPages);
        return;
      }
    }

    // When an element is selected: Arrow keys nudge position, Delete/Backspace removes it
    if (state.selectedItemId) {
      const item = state.items.find((i) => i.id === state.selectedItemId);
      if (!item) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        PDFSign.deleteItem(item.id);
        return;
      }

      const step = e.shiftKey ? 0.02 : 0.005;
      let moved = false;
      if (e.key === "ArrowLeft") {
        item.xPercent = Math.max(0, item.xPercent - step);
        moved = true;
      } else if (e.key === "ArrowRight") {
        item.xPercent = Math.min(1 - item.widthPercent, item.xPercent + step);
        moved = true;
      } else if (e.key === "ArrowUp") {
        item.yPercent = Math.max(0, item.yPercent - step);
        moved = true;
      } else if (e.key === "ArrowDown") {
        item.yPercent = Math.min(1 - item.heightPercent, item.yPercent + step);
        moved = true;
      }

      if (moved) {
        e.preventDefault();
        const el = document.getElementById(`sigEl_${item.id}`);
        if (el) {
          el.style.left = `${item.xPercent * 100}%`;
          el.style.top = `${item.yPercent * 100}%`;
        }
        PDFSign.pushHistory();
      }
    }
  });
})();
