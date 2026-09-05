/**
 * PDFMaster PDF Editor - Utility Functions
 * Structural cloning, color conversions, and byte helpers.
 */
"use strict";


/* ---------- fast structural clone (replaces JSON.parse(JSON.stringify)) ----------
   Semantically equivalent to a JSON round-trip (undefined/function props dropped from
   objects, undefined array entries become null) but skips text serialization, and
   primitives (including large base64 dataUrl strings) are copied by value/reference
   instead of being re-parsed into brand-new string instances every time. This keeps
   the undo/redo stack cheap even when annotations embed large images. */
function deepClone(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    var arr = new Array(value.length);
    for (var i = 0; i < value.length; i++) {
      var item = value[i];
      arr[i] = item === undefined ? null : deepClone(item);
    }
    return arr;
  }
  var out = {};
  for (var key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      var v = value[key];
      if (v === undefined || typeof v === "function") continue;
      out[key] = deepClone(v);
    }
  }
  return out;
}

function hexToRgb01(hex) {
  var h = (hex || "#000000").replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}
function dataUrlToBytes(dataUrl) {
  var base64 = dataUrl.split(",")[1];
  var binary = atob(base64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
