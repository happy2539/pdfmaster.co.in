/**
 * PDFMaster PDF Editor - Eraser Logic
 * Segment intersection math, stroke eraser, and pixel eraser operations.
 */
"use strict";


/* ============ ERASER LOGIC ============ */
function eraseStrokeAtPoint(pt, radius) {
  var list = annotationsByPage[currentPage] || [];
  var tol = Math.max(6, radius);
  var removed = false;

  for (var i = list.length - 1; i >= 0; i--) {
    var ann = list[i];
    var center = getCenter(ann);
    var upt = unrotatePoint(pt, center, ann.rotation || 0);

    if (ann.type === "path" || ann.type === "eraser") {
      var hit = false;
      var pts = ann.points || [];
      var w = ann.type === "eraser" ? ann.size || 20 : ann.strokeWidth || 3;
      for (var k = 0; k < pts.length - 1; k++) {
        if (distToSegment(upt, pts[k], pts[k + 1]) <= tol + w / 2) {
          hit = true;
          break;
        }
      }
      if (hit) {
        list.splice(i, 1);
        if (selectedAnnotation && selectedAnnotation.id === ann.id) {
          selectedAnnotation = null;
        }
        removed = true;
        continue;
      }
    } else if (ann.type === "line" || ann.type === "arrow") {
      if (
        distToSegment(
          upt,
          { x: ann.x1, y: ann.y1 },
          { x: ann.x2, y: ann.y2 },
        ) <=
        tol + (ann.strokeWidth || 3) / 2
      ) {
        list.splice(i, 1);
        if (selectedAnnotation && selectedAnnotation.id === ann.id) {
          selectedAnnotation = null;
        }
        removed = true;
        continue;
      }
    } else {
      var b = getBounds(ann);
      if (
        upt.x >= b.x - tol &&
        upt.x <= b.x + b.w + tol &&
        upt.y >= b.y - tol &&
        upt.y <= b.y + b.h + tol
      ) {
        list.splice(i, 1);
        if (selectedAnnotation && selectedAnnotation.id === ann.id) {
          selectedAnnotation = null;
        }
        removed = true;
        continue;
      }
    }
  }
  return removed;
}

function eraseStrokeAlongSegment(p1, p2, radius) {
  var dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  var step = Math.max(4, radius / 2);
  var steps = Math.ceil(dist / step);
  var removed = false;
  for (var s = 0; s <= steps; s++) {
    var t = steps === 0 ? 1 : s / steps;
    var x = p1.x + (p2.x - p1.x) * t;
    var y = p1.y + (p2.y - p1.y) * t;
    if (eraseStrokeAtPoint({ x: x, y: y }, radius)) {
      removed = true;
    }
  }
  return removed;
}

function simplifyPoints(pts) {
  if (!pts || pts.length <= 2) return pts;
  var res = [pts[0]];
  var prev = pts[0];
  for (var i = 1; i < pts.length - 1; i++) {
    var d = Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y);
    if (d >= 2) {
      res.push(pts[i]);
      prev = pts[i];
    }
  }
  var last = pts[pts.length - 1];
  if (Math.hypot(last.x - prev.x, last.y - prev.y) >= 0.5) {
    res.push(last);
  } else if (res.length === 1) {
    res.push(last);
  }
  return res.length >= 2 ? res : pts;
}

function smoothStrokePoints(pts) {
  if (!pts || pts.length <= 2) return pts;
  var res = [pts[0]];
  for (var i = 0; i < pts.length - 1; i++) {
    var p0 = pts[i];
    var p1 = pts[i + 1];
    res.push({
      x: 0.78 * p0.x + 0.22 * p1.x,
      y: 0.78 * p0.y + 0.22 * p1.y,
    });
    res.push({
      x: 0.22 * p0.x + 0.78 * p1.x,
      y: 0.22 * p0.y + 0.78 * p1.y,
    });
  }
  res.push(pts[pts.length - 1]);
  return res;
}

