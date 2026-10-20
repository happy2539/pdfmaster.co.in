/**
 * PDFMaster - OCR PDF (Optical Character Recognition)
 * Module: main.js
 * Application lifecycle bootstrap, DOMContentLoaded listener,
 * and testing/diagnostic API exposure.
 */

(function () {
  "use strict";

  window.PDFMasterOCR = window.PDFMasterOCR || {};
  const OCR = window.PDFMasterOCR;

  function initBackToTop() {
    const backTop = document.getElementById("backTop");
    if (!backTop) return;
    window.addEventListener(
      "scroll",
      () => {
        backTop.classList.toggle("visible", window.scrollY > 400);
      },
      { passive: true },
    );
    backTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function boot() {
    if (OCR.initDOM) OCR.initDOM();
    if (OCR.initTheme) OCR.initTheme();
    if (OCR.initMobileMenu) OCR.initMobileMenu();
    if (OCR.initUploadHandlers) OCR.initUploadHandlers();
    if (OCR.initControlHandlers) OCR.initControlHandlers();
    initBackToTop();
    if (OCR.initRecovery) OCR.initRecovery();
    OCR.booted = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Expose for testing & diagnostic verification
  OCR.booted = true;
  OCR.triggerDownload = OCR.triggerDownload;
  OCR.generateSearchablePdfBlob = OCR.generateSearchablePdfBlob;
  OCR.loadSessionFromDB = OCR.loadSessionFromDB;
  OCR.clearSessionFromDB = OCR.clearSessionFromDB;
  OCR.checkStoredSessionAvailable = OCR.checkStoredSessionAvailable;
  OCR.saveSessionToDB = OCR.saveSessionToDB;
  OCR.startOcrPipeline = OCR.startOcrPipeline;
  OCR.resetSession = OCR.resetSession;
})();
