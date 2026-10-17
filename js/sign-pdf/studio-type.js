/**
 * PDFMaster - Sign PDF Tool
 * Module: studio-type.js
 * Signature Studio - Tab 2: Typed Cursive Calligraphy, Date & Text Prompt Stamps
 */
(function () {
  "use strict";

  window.PDFSign = window.PDFSign || {};
  const PDFSign = window.PDFSign;
  const state = PDFSign.state;

  // DOM Elements - Type Tab
  const typeTextInput = document.getElementById("typeTextInput");
  const fontStyleCards = document.querySelectorAll(".font-style-card");
  const typeColorSwatches = document.querySelectorAll(".type-color-swatch");
  const typeCustomColorPicker = document.getElementById(
    "typeCustomColorPicker",
  );

  // DOM Elements - Quick Prompt Modal (Text / Date)
  const quickPromptModal = document.getElementById("quickPromptModal");
  const quickPromptTitle = document.getElementById("quickPromptTitle");
  const quickPromptInput = document.getElementById("quickPromptInput");
  const cancelPromptBtn = document.getElementById("cancelPromptBtn");
  const submitPromptBtn = document.getElementById("submitPromptBtn");

  PDFSign.renderTypePreview = function () {
    const text = typeTextInput
      ? typeTextInput.value || "Your Name"
      : "Your Name";
    state.studio.typedText = text;

    fontStyleCards.forEach((card) => {
      const previewTextEl = card.querySelector(".font-preview-text");
      if (previewTextEl) {
        previewTextEl.textContent = text;
        previewTextEl.style.color = state.studio.typeColor;
      }
    });
  };

  if (typeTextInput) {
    typeTextInput.addEventListener("input", PDFSign.renderTypePreview);
  }

  fontStyleCards.forEach((card) => {
    card.addEventListener("click", () => {
      const font = card.getAttribute("data-font");
      state.studio.selectedFont = font;
      fontStyleCards.forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
    });
  });

  typeColorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const color = swatch.getAttribute("data-color");
      state.studio.typeColor = color;
      typeColorSwatches.forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      if (typeCustomColorPicker) {
        typeCustomColorPicker.value = color;
        typeCustomColorPicker.classList.remove("active");
      }
      PDFSign.renderTypePreview();
    });
  });

  if (typeCustomColorPicker) {
    typeCustomColorPicker.addEventListener("input", (e) => {
      state.studio.typeColor = e.target.value;
      typeColorSwatches.forEach((s) => s.classList.remove("active"));
      typeCustomColorPicker.classList.add("active");
      PDFSign.renderTypePreview();
    });
  }

  PDFSign.getTypeCanvasTrimmedPng = function () {
    const text = state.studio.typedText || "Signature";
    const font = state.studio.selectedFont || "Caveat";
    const color = state.studio.typeColor || "#111827";

    const off = document.createElement("canvas");
    off.width = 1200;
    off.height = 400;
    const ctx = off.getContext("2d");

    ctx.font = `italic 110px "${font}", cursive, sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, 600, 200);

    const trimmed = PDFSign.trimCanvasTransparent(off);
    if (!trimmed) return null;

    return {
      dataUrl: trimmed.canvas.toDataURL("image/png"),
      aspectRatio: trimmed.width / trimmed.height,
    };
  };

  // =============================================
  //  DATE & TEXT STAMPS QUICK PROMPTS
  // =============================================
  PDFSign.openDateStamp = function () {
    const today = new Date();
    const formatted = today.toISOString().split("T")[0]; // YYYY-MM-DD
    PDFSign.renderTextToPng(formatted, (res) => {
      if (PDFSign.placeNewItem) {
        PDFSign.placeNewItem({
          type: "date",
          dataUrl: res.dataUrl,
          aspectRatio: res.aspectRatio,
          widthPercent: 0.18,
        });
      }
    });
  };

  PDFSign.openTextStampPrompt = function () {
    if (!quickPromptModal) return;
    if (quickPromptTitle)
      quickPromptTitle.textContent = "Add Custom Text / Name";
    if (quickPromptInput) quickPromptInput.value = "";
    quickPromptModal.classList.add("active");
    if (quickPromptInput) quickPromptInput.focus();
  };

  if (cancelPromptBtn) {
    cancelPromptBtn.addEventListener("click", () => {
      if (quickPromptModal) quickPromptModal.classList.remove("active");
    });
  }

  if (submitPromptBtn) {
    submitPromptBtn.addEventListener("click", () => {
      const val = quickPromptInput ? quickPromptInput.value.trim() : "";
      if (!val) {
        PDFSign.showToast("Please enter some text.");
        return;
      }
      if (quickPromptModal) quickPromptModal.classList.remove("active");
      PDFSign.renderTextToPng(val, (res) => {
        if (PDFSign.placeNewItem) {
          PDFSign.placeNewItem({
            type: "text",
            dataUrl: res.dataUrl,
            aspectRatio: res.aspectRatio,
            widthPercent: 0.22,
          });
        }
      });
    });
  }

  PDFSign.renderTextToPng = function (text, callback) {
    const off = document.createElement("canvas");
    off.width = 800;
    off.height = 200;
    const ctx = off.getContext("2d");
    ctx.font = '600 48px "DM Sans", -apple-system, sans-serif';
    ctx.fillStyle = "#111827";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, 400, 100);

    const trimmed = PDFSign.trimCanvasTransparent(off);
    if (trimmed && callback) {
      callback({
        dataUrl: trimmed.canvas.toDataURL("image/png"),
        aspectRatio: trimmed.width / trimmed.height,
      });
    }
  };
})();
