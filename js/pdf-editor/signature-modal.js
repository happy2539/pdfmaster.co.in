/**
 * PDFMaster PDF Editor - Signature Modal
 * Signature pad drawing, typography generator, image upload, and WASM background removal AI.
 */
"use strict";


/* ---------- signature modal ---------- */
var sigActiveTab = "type";
var sigFontName = "Pacifico";
var sigUploadedDataUrl = null;
var sigOriginalFile = null;
var sigOriginalDataUrl = null;
var sigProcessedDataUrl = null;

function setSigTab(tab) {
  sigActiveTab = tab;
  document.querySelectorAll(".sig-tab-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".sig-tab-content").forEach(function (content) {
    content.classList.toggle("hidden", content.id !== "sig-tab-" + tab);
  });
  if (tab === "draw") {
    setupSignaturePad();
  }
}

function generateTypedSignature(text, font) {
  var canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 150;
  var ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "italic 52px " + font + ", cursive";
  ctx.fillStyle = "#16181d";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  var metrics = ctx.measureText(text);
  if (metrics.width > canvas.width - 40) {
    var size = Math.floor(52 * ((canvas.width - 40) / metrics.width));
    ctx.font = "italic " + size + "px " + font + ", cursive";
  }
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

function openSignatureModal() {
  document.getElementById("sig-overlay").classList.add("is-open");
  var modal = document.getElementById("sig-modal");
  modal.style.opacity = "1";
  modal.style.pointerEvents = "auto";
  modal.style.transform = "translate(-50%,-50%) scale(1)";
  modal.setAttribute("aria-hidden", "false");
  setSigTab("type");
  var input = document.getElementById("sig-type-input");
  if (input) {
    input.value = "";
    input.dispatchEvent(new Event("input"));
  }
  sigUploadedDataUrl = null;
  sigOriginalFile = null;
  sigOriginalDataUrl = null;
  sigProcessedDataUrl = null;
  var uploadInput = document.getElementById("sig-upload-input");
  if (uploadInput) uploadInput.value = "";
  var chk = document.getElementById("sig-bg-remove-chk");
  if (chk) chk.checked = false;
  var chkWrap = document.getElementById("sig-bg-remove-wrap");
  if (chkWrap) chkWrap.classList.add("hidden");
  var dropZone = document.getElementById("sig-drop-zone");
  if (dropZone) dropZone.classList.remove("hidden");
  var previewContainer = document.getElementById(
    "sig-upload-preview-container",
  );
  if (previewContainer) previewContainer.classList.add("hidden");
}
function closeSignatureModal(revertTool) {
  document.getElementById("sig-overlay").classList.remove("is-open");
  var modal = document.getElementById("sig-modal");
  modal.style.opacity = "0";
  modal.style.pointerEvents = "none";
  modal.style.transform = "translate(-50%,-50%) scale(.94)";
  modal.setAttribute("aria-hidden", "true");
  if (revertTool && !pendingPlaceable) {
    setActiveTool("select");
  }
}
function setupSignaturePad() {
  var canvas = document.getElementById("sig-canvas");
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  sigCtx = canvas.getContext("2d");
  sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  sigHasDrawn = false;
  sigCtx.strokeStyle = "#16181d";
  sigCtx.lineWidth = 2.6;
  sigCtx.lineCap = "round";
  sigCtx.lineJoin = "round";
  if (!canvas._wired) {
    canvas._wired = true;
    var lastSigPt = null;
    canvas.addEventListener("pointerdown", function (e) {
      sigDrawing = true;
      var r = canvas.getBoundingClientRect();
      lastSigPt = { x: e.clientX - r.left, y: e.clientY - r.top };
      sigCtx.beginPath();
      sigCtx.arc(lastSigPt.x, lastSigPt.y, 1.3, 0, Math.PI * 2);
      sigCtx.fillStyle = "#16181d";
      sigCtx.fill();
      sigHasDrawn = true;
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!sigDrawing || !lastSigPt) {
        return;
      }
      var r = canvas.getBoundingClientRect();
      var curPt = { x: e.clientX - r.left, y: e.clientY - r.top };
      var dist = Math.hypot(curPt.x - lastSigPt.x, curPt.y - lastSigPt.y);
      if (dist >= 1.2) {
        var midX = (lastSigPt.x + curPt.x) / 2;
        var midY = (lastSigPt.y + curPt.y) / 2;
        sigCtx.beginPath();
        sigCtx.moveTo(lastSigPt.x, lastSigPt.y);
        sigCtx.quadraticCurveTo(lastSigPt.x, lastSigPt.y, midX, midY);
        sigCtx.stroke();
        lastSigPt = curPt;
        sigHasDrawn = true;
      }
    });
    window.addEventListener("pointerup", function () {
      sigDrawing = false;
      lastSigPt = null;
    });
  }
}


document.getElementById("sig-close").addEventListener("click", function () {
  closeSignatureModal(true);
});
document.getElementById("sig-overlay").addEventListener("click", function () {
  closeSignatureModal(true);
});
document.getElementById("sig-clear").addEventListener("click", function () {
  if (sigActiveTab === "type") {
    var input = document.getElementById("sig-type-input");
    if (input) {
      input.value = "";
      input.dispatchEvent(new Event("input"));
    }
  } else if (sigActiveTab === "draw") {
    if (sigCtx) {
      var c = document.getElementById("sig-canvas");
      sigCtx.clearRect(0, 0, c.width, c.height);
    }
    sigHasDrawn = false;
  } else if (sigActiveTab === "upload") {
    sigUploadedDataUrl = null;
    sigOriginalFile = null;
    sigOriginalDataUrl = null;
    sigProcessedDataUrl = null;
    var fileInput = document.getElementById("sig-upload-input");
    if (fileInput) fileInput.value = "";
    var chk = document.getElementById("sig-bg-remove-chk");
    if (chk) chk.checked = false;
    var chkWrap = document.getElementById("sig-bg-remove-wrap");
    if (chkWrap) chkWrap.classList.add("hidden");
    var dropZone = document.getElementById("sig-drop-zone");
    if (dropZone) dropZone.classList.remove("hidden");
    var previewContainer = document.getElementById(
      "sig-upload-preview-container",
    );
    if (previewContainer) previewContainer.classList.add("hidden");
  }
});

document.getElementById("sig-insert").addEventListener("click", function () {
  var dataUrl = null;
  var aspect = 0.3; // Default for typed signature

  if (sigActiveTab === "type") {
    var text = document.getElementById("sig-type-input").value.trim();
    if (!text) {
      window.showToast("Please type your name first.");
      return;
    }
    dataUrl = generateTypedSignature(text, sigFontName);
    aspect = 150 / 600; // 0.25
  } else if (sigActiveTab === "draw") {
    if (!sigHasDrawn) {
      window.showToast("Please draw a signature first.");
      return;
    }
    var canvas = document.getElementById("sig-canvas");
    dataUrl = canvas.toDataURL("image/png");
    aspect = canvas.height / canvas.width;
  } else if (sigActiveTab === "upload") {
    if (!sigUploadedDataUrl) {
      window.showToast("Please upload a signature image first.");
      return;
    }
    dataUrl = sigUploadedDataUrl;
    var imgEl = document.getElementById("sig-upload-preview-img");
    if (imgEl && imgEl.naturalWidth) {
      aspect = imgEl.naturalHeight / imgEl.naturalWidth;
    } else {
      aspect = 0.5; // fallback
    }
  }

  if (!dataUrl) return;

  var w = Math.min(
    220,
    (pageDimsCache[currentPage] ? pageDimsCache[currentPage].width : 400) *
      0.45,
  );

  pendingPlaceable = {
    type: "image",
    dataUrl: dataUrl,
    width: w,
    height: w * aspect,
  };

  closeSignatureModal(false);
  window.showToast("Tap anywhere on the page to place your signature.");
});

// Cursive Tab Switchers
document.querySelectorAll(".sig-tab-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    setSigTab(btn.dataset.tab);
  });
});

// Type Signature Input listener
var sigTypeInput = document.getElementById("sig-type-input");
if (sigTypeInput) {
  sigTypeInput.addEventListener("input", function (e) {
    var val = e.target.value.trim() || "Signature";
    document
      .querySelectorAll(".sig-type-preview-card")
      .forEach(function (card) {
        card.textContent = val;
      });
  });
}

// Type Font Preview selector card click listener
document.querySelectorAll(".sig-type-preview-card").forEach(function (card) {
  card.addEventListener("click", function () {
    document.querySelectorAll(".sig-type-preview-card").forEach(function (c) {
      c.classList.remove("active");
    });
    card.classList.add("active");
    sigFontName = card.dataset.font;
  });
});

// Signature Image Upload Handlers
var sigDropZone = document.getElementById("sig-drop-zone");
var sigUploadInput = document.getElementById("sig-upload-input");

if (sigDropZone && sigUploadInput) {
  sigDropZone.addEventListener("click", function () {
    sigUploadInput.click();
  });

  sigUploadInput.addEventListener("change", function (e) {
    handleSigUploadFile(e.target.files[0]);
  });

  sigDropZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    sigDropZone.style.borderColor = "var(--accent)";
    sigDropZone.style.background = "var(--accent-soft)";
  });

  sigDropZone.addEventListener("dragleave", function (e) {
    e.preventDefault();
    sigDropZone.style.borderColor = "var(--border)";
    sigDropZone.style.background = "var(--surface-2)";
  });

  sigDropZone.addEventListener("drop", function (e) {
    e.preventDefault();
    sigDropZone.style.borderColor = "var(--border)";
    sigDropZone.style.background = "var(--surface-2)";
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      handleSigUploadFile(file);
    }
  });
}

function handleSigUploadFile(file) {
  if (!file) return;
  if (!file.type.match("image.*")) {
    window.showToast("Please upload an image file.");
    return;
  }

  // Downscale the image to a max dimension of 1024px to prevent WASM out-of-memory crashes on low-end devices
  resizeImageIfTooLarge(file, 1024)
    .then(function (result) {
      sigOriginalFile = result.file;
      var dataUrl = result.dataUrl;

      sigOriginalDataUrl = dataUrl;
      sigUploadedDataUrl = dataUrl;
      sigProcessedDataUrl = null;

      var chk = document.getElementById("sig-bg-remove-chk");
      if (chk) chk.checked = false;

      var imgEl = document.getElementById("sig-upload-preview-img");
      imgEl.src = dataUrl;

      // Hide drop zone and show preview
      document.getElementById("sig-drop-zone").classList.add("hidden");
      document
        .getElementById("sig-upload-preview-container")
        .classList.remove("hidden");
      document
        .getElementById("sig-bg-remove-wrap")
        .classList.remove("hidden");
    })
    .catch(function (err) {
      console.error("Resizing image failed:", err);
      window.showToast("Could not process image.");
    });
}

// Remove uploaded image button
var sigUploadRemove = document.getElementById("sig-upload-remove");
if (sigUploadRemove) {
  sigUploadRemove.addEventListener("click", function (e) {
    e.stopPropagation();
    sigUploadedDataUrl = null;
    sigOriginalFile = null;
    sigOriginalDataUrl = null;
    sigProcessedDataUrl = null;
    var fileInput = document.getElementById("sig-upload-input");
    if (fileInput) fileInput.value = "";
    var chk = document.getElementById("sig-bg-remove-chk");
    if (chk) chk.checked = false;
    var chkWrap = document.getElementById("sig-bg-remove-wrap");
    if (chkWrap) chkWrap.classList.add("hidden");
    document.getElementById("sig-drop-zone").classList.remove("hidden");
    document
      .getElementById("sig-upload-preview-container")
      .classList.add("hidden");
  });
}

// WASM Background Removal Trigger
var bgRemoveChk = document.getElementById("sig-bg-remove-chk");
if (bgRemoveChk) {
  bgRemoveChk.addEventListener("change", function () {
    var isChecked = bgRemoveChk.checked;
    var imgEl = document.getElementById("sig-upload-preview-img");
    var loader = document.getElementById("sig-upload-loading-overlay");

    if (isChecked) {
      if (sigProcessedDataUrl) {
        sigUploadedDataUrl = sigProcessedDataUrl;
        imgEl.src = sigProcessedDataUrl;
      } else {
        if (!sigOriginalFile) return;
        loader.classList.remove("hidden");

        // Reset progress bar elements
        var progressContainer = document.getElementById(
          "sig-upload-progress-container",
        );
        var progressBar = document.getElementById("sig-upload-progress-bar");
        var progressText = document.getElementById(
          "sig-upload-progress-text",
        );
        var loadingStatus = document.getElementById(
          "sig-upload-loading-status",
        );

        if (progressBar) progressBar.style.width = "0%";
        if (progressText) progressText.textContent = "0%";
        if (loadingStatus) loadingStatus.textContent = "Loading WASM AI...";
        if (progressContainer) progressContainer.classList.remove("hidden");

        import("./assets/vendor/background-removal-1.5.6.esm.js")
          .catch(function () {
            return import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.6/+esm");
          })
          .then(function (module) {
            return module.removeBackground(sigOriginalFile, {
              publicPath:
                "https://staticimgly.com/@imgly/background-removal-data/1.5.6/dist/",
              model: "isnet_quint8",
              progress: function (key, current, total) {
                if (total && total > 0) {
                  var percentage = Math.round((current / total) * 100);
                  if (progressBar) progressBar.style.width = percentage + "%";
                  if (progressText)
                    progressText.textContent = percentage + "%";
                  if (loadingStatus) {
                    var cleanKey = key;
                    if (key.indexOf("fetch:") === 0) {
                      cleanKey =
                        "Downloading " +
                        key.substring(key.lastIndexOf("/") + 1);
                    } else if (key.indexOf("compute:") === 0) {
                      cleanKey = "Removing background...";
                    }
                    loadingStatus.textContent = cleanKey;
                  }
                } else {
                  if (loadingStatus)
                    loadingStatus.textContent = "Removing background...";
                }
              },
            });
          })
          .then(function (blob) {
            if (progressContainer) progressContainer.classList.add("hidden");
            return readFileAsDataURL(blob);
          })
          .then(function (dataUrl) {
            sigProcessedDataUrl = dataUrl;
            sigUploadedDataUrl = dataUrl;
            imgEl.src = dataUrl;
            loader.classList.add("hidden");
          })
          .catch(function (err) {
            console.error("WASM background removal failed:", err);
            window.showToast("Background removal failed.");
            bgRemoveChk.checked = false;
            loader.classList.add("hidden");
            if (progressContainer) progressContainer.classList.add("hidden");
          });
      }
    } else {
      sigUploadedDataUrl = sigOriginalDataUrl;
      imgEl.src = sigOriginalDataUrl;
    }
  });
}
