/**
 * PDFMaster PDF Editor - Main Entry & Bootstrap
 * Initializes session recovery, tool settings, and exposes window.PDFEditor for debugging.
 */
"use strict";


// Check stored session on startup
checkStoredSessionAvailable(true);


/* =========================================================================
   DEBUGGING INTERFACE
   Exposes PDFEditor on window for easy developer inspection in the console.
   ========================================================================= */
window.PDFEditor = {
  // State getters
  state: {
    get pdfDoc() { return pdfDoc; },
    get currentFileBlob() { return currentFileBlob; },
    get currentPageProxy() { return currentPageProxy; },
    get fileName() { return fileName; },
    get currentPage() { return currentPage; },
    get numPages() { return numPages; },
    get currentScale() { return currentScale; },
    get zoomFactor() { return zoomFactor; },
    get currentTool() { return currentTool; },
    get currentColor() { return currentColor; },
    get currentStrokeWidth() { return currentStrokeWidth; },
    get currentFontSize() { return currentFontSize; },
    get annotationsByPage() { return annotationsByPage; },
    get pageRotations() { return pageRotations; },
    get selectedAnnotation() { return selectedAnnotation; },
    get selectedGroup() { return selectedGroup; },
    get history() { return undoHistoryStack; },
    get redoHistoryStack() { return redoHistoryStack; },
    get toolPreferences() { return toolPreferences; },
  },

  // Key methods
  renderPage: renderPage,
  redrawAnnotations: redrawAnnotations,
  requestRedraw: requestRedraw,
  rotateCurrentPage: rotateCurrentPage,
  rotateAnnotationOnPage: rotateAnnotationOnPage,
  zoomIn: zoomIn,
  zoomOut: zoomOut,
  setActiveTool: setActiveTool,
  pushHistory: pushHistory,
  undo: undo,
  redo: redo,
  exportPdf: exportPdf,
  resetEditor: resetEditor,
  openDB: openDB,
  saveSessionMetaToDB: saveSessionMetaToDB,
  loadSessionFromDB: loadSessionFromDB,
  clearSessionFromDB: clearSessionFromDB,
};
