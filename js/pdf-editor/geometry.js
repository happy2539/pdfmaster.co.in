/**
 * PDFMaster PDF Editor - Geometry & Math Helpers
 * Bounding boxes, center points, coordinate transformations, hit testing, handle geometry, and rotation math.
 */
"use strict";


function rotateAnnotationOnPage(ann, oldW, oldH, angleDeg) {
  if (!ann) return;
  if (angleDeg === 90) {
    if (ann.type === "path" || ann.type === "eraser") {
      if (ann.points) {
        ann.points.forEach(function (p) {
          var ox = p.x,
            oy = p.y;
          p.x = oldH - oy;
          p.y = ox;
        });
      }
    } else if (ann.type === "line" || ann.type === "arrow") {
      var ox1 = ann.x1,
        oy1 = ann.y1,
        ox2 = ann.x2,
        oy2 = ann.y2;
      ann.x1 = oldH - oy1;
      ann.y1 = ox1;
      ann.x2 = oldH - oy2;
      ann.y2 = ox2;
    } else if (ann.type === "rect" || ann.type === "image") {
      var center = getCenter(ann);
      var newCx = oldH - center.y;
      var newCy = center.x;
      ann.x = newCx - ann.width / 2;
      ann.y = newCy - ann.height / 2;
      ann.rotation = ((ann.rotation || 0) + 90) % 360;
    } else if (ann.type === "ellipse") {
      var ocx = ann.cx,
        ocy = ann.cy;
      ann.cx = oldH - ocy;
      ann.cy = ocx;
      ann.rotation = ((ann.rotation || 0) + 90) % 360;
    } else if (ann.type === "text") {
      var center = getCenter(ann);
      var b = getBounds(ann);
      var newCx = oldH - center.y;
      var newCy = center.x;
      ann.x = newCx - b.w / 2;
      ann.y = newCy - b.h / 2;
      ann.rotation = ((ann.rotation || 0) + 90) % 360;
    }
  }
}

function rotateCurrentPage(angleDeg) {
  if (!pdfDoc || !currentPageProxy) return;
  angleDeg = angleDeg || 90;

  var oldUserRot = (pageRotations[currentPage] || 0) % 360;
  var baseRot = (currentPageProxy.rotate || 0) % 360;
  var oldEffectiveRot = (((baseRot + oldUserRot) % 360) + 360) % 360;
  var oldVp = currentPageProxy.getViewport({
    scale: 1,
    rotation: oldEffectiveRot,
  });
  var oldW = oldVp.width;
  var oldH = oldVp.height;

  pushHistory();

  var newUserRot = (oldUserRot + angleDeg) % 360;
  pageRotations[currentPage] = newUserRot;

  var anns = annotationsByPage[currentPage] || [];
  if (anns.length > 0) {
    anns.forEach(function (ann) {
      rotateAnnotationOnPage(ann, oldW, oldH, angleDeg);
    });
  }

  selectedAnnotation = null;
  selectedGroup = null;
  hideToolOptionsPanel();

  delete pageDimsCache[currentPage];

  renderPage(currentPage);
  scheduleDBSave();

  if (window.showToast) {
    window.showToast(
      "Page " + currentPage + " rotated (" + newUserRot + "°)",
    );
  }
}

/* ---------- geometry helpers ---------- */
function measureTextWidth(text, fontSize) {
  if (!measCtx) {
    measCanvas = document.createElement("canvas");
    measCtx = measCanvas.getContext("2d");
  }
  measCtx.font = fontSize + "px 'DM Sans', sans-serif";
  return measCtx.measureText(text || " ").width;
}
function getBounds(ann) {
  switch (ann.type) {
    case "text": {
      var w = measureTextWidth(ann.text, ann.fontSize);
      return {
        x: ann.x,
        y: ann.y,
        w: Math.max(w, 10),
        h: ann.fontSize * 1.25,
      };
    }
    case "rect":
      return { x: ann.x, y: ann.y, w: ann.width, h: ann.height };
    case "ellipse":
      return {
        x: ann.cx - ann.rx,
        y: ann.cy - ann.ry,
        w: ann.rx * 2,
        h: ann.ry * 2,
      };
    case "line":
    case "arrow": {
      var x = Math.min(ann.x1, ann.x2),
        y = Math.min(ann.y1, ann.y2);
      return {
        x: x,
        y: y,
        w: Math.max(Math.abs(ann.x2 - ann.x1), 2),
        h: Math.max(Math.abs(ann.y2 - ann.y1), 2),
      };
    }
    case "path":
    case "eraser": {
      var minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      (ann.points || []).forEach(function (p) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
      var pad = (ann.size || ann.strokeWidth || 4) / 2;
      return {
        x: minX - pad,
        y: minY - pad,
        w: Math.max(maxX - minX + pad * 2, 2),
        h: Math.max(maxY - minY + pad * 2, 2),
      };
    }
    case "image":
      return { x: ann.x, y: ann.y, w: ann.width, h: ann.height };
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}
function getCenter(ann) {
  if (ann.type === "ellipse") {
    return { x: ann.cx, y: ann.cy };
  }
  if (ann.type === "line" || ann.type === "arrow") {
    return { x: (ann.x1 + ann.x2) / 2, y: (ann.y1 + ann.y2) / 2 };
  }
  var b = getBounds(ann);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}
function unrotatePoint(pt, center, angleDeg) {
  if (!angleDeg) return pt;
  var rad = (-angleDeg * Math.PI) / 180;
  var dx = pt.x - center.x;
  var dy = pt.y - center.y;
  var unrotX = center.x + (dx * Math.cos(rad) - dy * Math.sin(rad));
  var unrotY = center.y + (dx * Math.sin(rad) + dy * Math.cos(rad));

  var dcx = pt.cx - center.x * currentScale;
  var dcy = pt.cy - center.y * currentScale;
  var unrotCx =
    center.x * currentScale + (dcx * Math.cos(rad) - dcy * Math.sin(rad));
  var unrotCy =
    center.y * currentScale + (dcx * Math.sin(rad) + dcy * Math.cos(rad));

  return {
    x: unrotX,
    y: unrotY,
    cx: unrotCx,
    cy: unrotCy,
  };
}
function distToSegment(p, a, b) {
  var l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
  if (l2 === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  var t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  var projx = a.x + t * (b.x - a.x),
    projy = a.y + t * (b.y - a.y);
  return Math.hypot(p.x - projx, p.y - projy);
}
function findAnnotation(page, id) {
  return (annotationsByPage[page] || []).find(function (a) {
    return a.id === id;
  });
}
function isAnnotationEmpty(ann) {
  if (!ann) return true;
  if (ann.type === "eraser") return true;
  if (ann.type === "text") {
    return !ann.text || !ann.text.trim();
  }
  if (ann.type === "path") {
    return !ann.points || ann.points.length === 0;
  }
  if (ann.type === "rect") {
    return !ann.width || !ann.height || (ann.width <= 2 && ann.height <= 2);
  }
  if (ann.type === "ellipse") {
    return !ann.rx || !ann.ry || (ann.rx <= 1 && ann.ry <= 1);
  }
  if (ann.type === "line" || ann.type === "arrow") {
    return Math.hypot(ann.x2 - ann.x1, ann.y2 - ann.y1) < 2;
  }
  if (ann.type === "image") {
    return !ann.dataUrl || !ann.width || !ann.height;
  }
  return false;
}

function isPointInEraserStroke(p, eraserPoints, r) {
  if (!eraserPoints || eraserPoints.length === 0) return false;
  if (eraserPoints.length === 1) {
    return Math.hypot(p.x - eraserPoints[0].x, p.y - eraserPoints[0].y) <= r;
  }
  for (var i = 0; i < eraserPoints.length - 1; i++) {
    if (distToSegment(p, eraserPoints[i], eraserPoints[i + 1]) <= r) {
      return true;
    }
  }
  return false;
}

function segmentIntersectsEraser(p1, p2, eraserPoints, r) {
  var segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (segLen <= r) return false;
  var steps = Math.ceil(segLen / (r * 0.75));
  for (var s = 1; s < steps; s++) {
    var t = s / steps;
    var mid = {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };
    if (isPointInEraserStroke(mid, eraserPoints, r)) {
      return true;
    }
  }
  return false;
}

function applyPixelErasureToAnnotations(eraserPoints, eraserRadius, page) {
  if (!eraserPoints || eraserPoints.length === 0) return false;
  var list = annotationsByPage[page] || [];
  var modified = false;
  var r = eraserRadius;

  for (var i = list.length - 1; i >= 0; i--) {
    var ann = list[i];
    if (!ann || ann.type === "eraser") continue;

    if (ann.type === "path") {
      var pts = ann.points || [];
      if (pts.length === 0) {
        list.splice(i, 1);
        modified = true;
        continue;
      }

      var strokeTol = r + (ann.strokeWidth || 2) * 0.3;
      var erasedMap = new Array(pts.length);
      var anyErased = false;
      var allErased = true;

      for (var k = 0; k < pts.length; k++) {
        if (isPointInEraserStroke(pts[k], eraserPoints, strokeTol)) {
          erasedMap[k] = true;
          anyErased = true;
        } else {
          erasedMap[k] = false;
          allErased = false;
        }
      }

      if (!anyErased) {
        for (var k = 0; k < pts.length - 1; k++) {
          if (
            segmentIntersectsEraser(
              pts[k],
              pts[k + 1],
              eraserPoints,
              strokeTol,
            )
          ) {
            anyErased = true;
            break;
          }
        }
      }

      if (!anyErased) {
        continue;
      }

      modified = true;

      if (allErased) {
        list.splice(i, 1);
        if (selectedAnnotation && selectedAnnotation.id === ann.id) {
          selectedAnnotation = null;
        }
        continue;
      }

      var survivingRuns = [];
      var currentRun = [];

      for (var k = 0; k < pts.length; k++) {
        if (!erasedMap[k]) {
          if (currentRun.length > 0 && k > 0) {
            if (
              segmentIntersectsEraser(
                pts[k - 1],
                pts[k],
                eraserPoints,
                strokeTol,
              )
            ) {
              survivingRuns.push(currentRun);
              currentRun = [];
            }
          }
          currentRun.push(pts[k]);
        } else {
          if (currentRun.length > 0) {
            survivingRuns.push(currentRun);
            currentRun = [];
          }
        }
      }
      if (currentRun.length > 0) {
        survivingRuns.push(currentRun);
      }

      survivingRuns = survivingRuns.filter(function (run) {
        return run.length >= 1;
      });

      if (survivingRuns.length === 0) {
        list.splice(i, 1);
        if (selectedAnnotation && selectedAnnotation.id === ann.id) {
          selectedAnnotation = null;
        }
      } else {
        ann.points = survivingRuns[0];
        for (var m = 1; m < survivingRuns.length; m++) {
          var newPath = {
            id: nextId(),
            page: page,
            type: "path",
            points: survivingRuns[m],
            color: ann.color,
            strokeWidth: ann.strokeWidth,
            opacity: ann.opacity,
          };
          list.push(newPath);
        }
      }
    } else if (ann.type === "line" || ann.type === "arrow") {
      var p1 = { x: ann.x1, y: ann.y1 };
      var p2 = { x: ann.x2, y: ann.y2 };
      var strokeTol = r + (ann.strokeWidth || 2) * 0.5;
      if (
        isPointInEraserStroke(p1, eraserPoints, strokeTol) ||
        isPointInEraserStroke(p2, eraserPoints, strokeTol) ||
        segmentIntersectsEraser(p1, p2, eraserPoints, strokeTol)
      ) {
        list.splice(i, 1);
        if (selectedAnnotation && selectedAnnotation.id === ann.id) {
          selectedAnnotation = null;
        }
        modified = true;
      }
    } else {
      var b = getBounds(ann);
      var hit = false;
      for (var ep = 0; ep < eraserPoints.length; ep++) {
        var p = eraserPoints[ep];
        if (
          p.x >= b.x - r &&
          p.x <= b.x + b.w + r &&
          p.y >= b.y - r &&
          p.y <= b.y + b.h + r
        ) {
          hit = true;
          break;
        }
      }
      if (hit) {
        list.splice(i, 1);
        if (selectedAnnotation && selectedAnnotation.id === ann.id) {
          selectedAnnotation = null;
        }
        modified = true;
      }
    }
  }
  return modified;
}

function cleanPageAnnotations(page) {
  if (!annotationsByPage[page]) return;
  var list = annotationsByPage[page];
  var legacyErasers = list.filter(function (a) {
    return a && a.type === "eraser";
  });

  if (legacyErasers.length > 0) {
    legacyErasers.forEach(function (eraser) {
      if (eraser.points && eraser.points.length > 0) {
        applyPixelErasureToAnnotations(
          eraser.points,
          (eraser.size || 20) / 2,
          page,
        );
      }
    });
    annotationsByPage[page] = annotationsByPage[page].filter(function (a) {
      return a && a.type !== "eraser" && !isAnnotationEmpty(a);
    });
    scheduleDBSave();
  } else {
    annotationsByPage[page] = list.filter(function (a) {
      return a && a.type !== "eraser" && !isAnnotationEmpty(a);
    });
  }
}

function pointInPoly(p, poly) {
  var x = p.x,
    y = p.y;
  var inside = false;
  var n = poly.length;
  var j = n - 1;
  for (var i = 0; i < n; i++) {
    var xi = poly[i].x,
      yi = poly[i].y;
    var xj = poly[j].x,
      yj = poly[j].y;
    var intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
    j = i;
  }
  return inside;
}

function isAnnotationInPolygon(ann, poly) {
  if (!ann || isAnnotationEmpty(ann) || ann.type === "eraser") return false;
  var c = getCenter(ann);
  if (pointInPoly(c, poly)) return true;

  if (ann.type === "path" && ann.points) {
    for (var i = 0; i < ann.points.length; i++) {
      if (pointInPoly(ann.points[i], poly)) return true;
    }
    return false;
  }

  if (ann.type === "line" || ann.type === "arrow") {
    return (
      pointInPoly({ x: ann.x1, y: ann.y1 }, poly) ||
      pointInPoly({ x: ann.x2, y: ann.y2 }, poly)
    );
  }

  var b = getBounds(ann);
  return (
    pointInPoly({ x: b.x, y: b.y }, poly) ||
    pointInPoly({ x: b.x + b.w, y: b.y }, poly) ||
    pointInPoly({ x: b.x, y: b.y + b.h }, poly) ||
    pointInPoly({ x: b.x + b.w, y: b.y + b.h }, poly)
  );
}

function getGroupAnnotations() {
  if (!selectedGroup || selectedGroup.page !== currentPage) return [];
  var list = annotationsByPage[currentPage] || [];
  return list.filter(function (a) {
    return selectedGroup.ids.indexOf(a.id) !== -1 && !isAnnotationEmpty(a);
  });
}

function getGroupBounds(anns) {
  if (!anns || anns.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  var minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  anns.forEach(function (a) {
    var b = getBounds(a);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  });
  return {
    x: minX,
    y: minY,
    w: Math.max(maxX - minX, 4),
    h: Math.max(maxY - minY, 4),
  };
}

function getGroupSelectionHandles(anns, scale) {
  var b = getGroupBounds(anns);
  var pad = 10;
  var bx = b.x * scale - pad,
    by = b.y * scale - pad,
    bw = Math.max(b.w * scale + pad * 2, 24),
    bh = Math.max(b.h * scale + pad * 2, 24);
  var deleteBtn = { x: bx + bw + 10, y: by - 10, r: 12 };
  var rotateBtn = { x: bx + bw / 2, y: by - 28, r: 10 };

  return {
    box: { x: bx, y: by, w: bw, h: bh },
    deleteBtn: deleteBtn,
    rotateBtn: rotateBtn,
    // Corners
    tl: { x: bx, y: by, size: 9 },
    tr: { x: bx + bw, y: by, size: 9 },
    br: { x: bx + bw, y: by + bh, size: 9 },
    bl: { x: bx, y: by + bh, size: 9 },
    // Sides
    t: { x: bx + bw / 2, y: by, size: 9 },
    b: { x: bx + bw / 2, y: by + bh, size: 9 },
    l: { x: bx, y: by + bh / 2, size: 9 },
    r: { x: bx + bw, y: by + bh / 2, size: 9 },
  };
}

function drawGroupSelectionUI(ctx, anns, scale) {
  var handles = getGroupSelectionHandles(anns, scale);
  var b = handles.box;

  ctx.save();
  ctx.strokeStyle = "#2563eb";
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.8;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.setLineDash([]);

  // Stalk line to rotate handle
  ctx.beginPath();
  ctx.moveTo(b.x + b.w / 2, b.y);
  ctx.lineTo(handles.rotateBtn.x, handles.rotateBtn.y + handles.rotateBtn.r);
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Rotate handle circle
  ctx.beginPath();
  ctx.arc(
    handles.rotateBtn.x,
    handles.rotateBtn.y,
    handles.rotateBtn.r,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "#10b981";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Rotate icon inside circle
  ctx.beginPath();
  ctx.arc(
    handles.rotateBtn.x,
    handles.rotateBtn.y,
    4.5,
    0.2 * Math.PI,
    1.5 * Math.PI,
  );
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  var ahX = handles.rotateBtn.x + 4.5 * Math.cos(1.5 * Math.PI);
  var ahY = handles.rotateBtn.y + 4.5 * Math.sin(1.5 * Math.PI);
  ctx.beginPath();
  ctx.moveTo(ahX - 3, ahY - 1);
  ctx.lineTo(ahX, ahY);
  ctx.lineTo(ahX - 1, ahY + 3);
  ctx.stroke();

  // Delete button for group
  ctx.beginPath();
  ctx.arc(
    handles.deleteBtn.x,
    handles.deleteBtn.y,
    handles.deleteBtn.r,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "#e8372a";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(handles.deleteBtn.x - 4, handles.deleteBtn.y - 4);
  ctx.lineTo(handles.deleteBtn.x + 4, handles.deleteBtn.y + 4);
  ctx.moveTo(handles.deleteBtn.x + 4, handles.deleteBtn.y - 4);
  ctx.lineTo(handles.deleteBtn.x - 4, handles.deleteBtn.y + 4);
  ctx.stroke();

  // Resize handles
  var list = [
    handles.tl,
    handles.tr,
    handles.br,
    handles.bl,
    handles.t,
    handles.b,
    handles.l,
    handles.r,
  ];
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 1.6;
  list.forEach(function (h) {
    ctx.beginPath();
    ctx.rect(h.x - 5, h.y - 5, 10, 10);
    ctx.fill();
    ctx.stroke();
  });

  // Selection badge
  var badgeText = anns.length + " items";
  ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
  var textWidth = ctx.measureText(badgeText).width;
  var badgeW = textWidth + 12;
  var badgeH = 20;
  var badgeX = b.x;
  var badgeY = b.y - 28;
  ctx.fillStyle = "#2563eb";
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  } else {
    ctx.rect(badgeX, badgeY, badgeW, badgeH);
  }
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, badgeX + 6, badgeY + badgeH / 2);

  ctx.restore();
}

function hitTest(pt) {
  cleanPageAnnotations(currentPage);
  var list = annotationsByPage[currentPage] || [];
  var tol = 6 / currentScale;
  for (var i = list.length - 1; i >= 0; i--) {
    var ann = list[i];
    if (isAnnotationEmpty(ann)) {
      continue;
    }
    var center = getCenter(ann);
    var upt = unrotatePoint(pt, center, ann.rotation || 0);

    if (ann.type === "line" || ann.type === "arrow") {
      if (
        distToSegment(
          upt,
          { x: ann.x1, y: ann.y1 },
          { x: ann.x2, y: ann.y2 },
        ) <= Math.max(tol, ann.strokeWidth)
      ) {
        return ann;
      }
      continue;
    }
    if (ann.type === "path") {
      var hit = false;
      for (var k = 0; k < ann.points.length - 1; k++) {
        if (
          distToSegment(upt, ann.points[k], ann.points[k + 1]) <=
          Math.max(tol, ann.strokeWidth)
        ) {
          hit = true;
          break;
        }
      }
      if (hit) {
        return ann;
      }
      continue;
    }
    var b = getBounds(ann);
    if (
      upt.x >= b.x - tol &&
      upt.x <= b.x + b.w + tol &&
      upt.y >= b.y - tol &&
      upt.y <= b.y + b.h + tol
    ) {
      return ann;
    }
  }
  return null;
}
function getSelectionHandles(ann, scale) {
  var b = getBounds(ann);
  var pad = 10;
  var x = b.x * scale - pad,
    y = b.y * scale - pad,
    w = Math.max(b.w * scale + pad * 2, 24),
    h = Math.max(b.h * scale + pad * 2, 24);
  var deleteBtn = { x: x + w + 10, y: y - 10, r: 12 };
  var cropBtn = ann.type === "image" ? { x: x - 10, y: y - 10, r: 12 } : null;
  var rotateBtn = { x: x + w / 2, y: y - 28, r: 10 };

  return {
    box: { x: x, y: y, w: w, h: h },
    deleteBtn: deleteBtn,
    cropBtn: cropBtn,
    rotateBtn: rotateBtn,
    // Corners
    tl: { x: x, y: y, size: 9 },
    tr: { x: x + w, y: y, size: 9 },
    br: { x: x + w, y: y + h, size: 9 },
    bl: { x: x, y: y + h, size: 9 },
    // Sides
    t: { x: x + w / 2, y: y, size: 9 },
    b: { x: x + w / 2, y: y + h, size: 9 },
    l: { x: x, y: y + h / 2, size: 9 },
    r: { x: x + w, y: y + h / 2, size: 9 },
  };
}

function getElementAABB(ann, scale) {
  var handles = getSelectionHandles(ann, scale);
  var b = handles.box;
  var rot = (ann.rotation || 0) * (Math.PI / 180);
  if (!rot) return b;
  var center = getCenter(ann);
  var cx = center.x * scale;
  var cy = center.y * scale;
  var corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
  var cos = Math.cos(rot);
  var sin = Math.sin(rot);
  var minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (var i = 0; i < corners.length; i++) {
    var dx = corners[i].x - cx;
    var dy = corners[i].y - cy;
    var rx = cx + dx * cos - dy * sin;
    var ry = cy + dx * sin + dy * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function applyMove(ann, origin, dx, dy) {
  switch (ann.type) {
    case "text":
    case "rect":
    case "image":
      ann.x = origin.x + dx;
      ann.y = origin.y + dy;
      break;
    case "ellipse":
      ann.cx = origin.cx + dx;
      ann.cy = origin.cy + dy;
      break;
    case "line":
    case "arrow":
      ann.x1 = origin.x1 + dx;
      ann.y1 = origin.y1 + dy;
      ann.x2 = origin.x2 + dx;
      ann.y2 = origin.y2 + dy;
      break;
    case "path":
      ann.points = origin.points.map(function (p) {
        return { x: p.x + dx, y: p.y + dy };
      });
      break;
  }
}
function applyBoundsResize(ann, origin, newBox) {
  var originBounds = getBounds(origin);
  if (originBounds.w === 0 || originBounds.h === 0) return;

  var ratioX = newBox.w / originBounds.w;
  var ratioY = newBox.h / originBounds.h;

  switch (ann.type) {
    case "image":
    case "rect": {
      ann.x = newBox.x;
      ann.y = newBox.y;
      ann.width = newBox.w;
      ann.height = newBox.h;
      break;
    }
    case "ellipse": {
      ann.rx = newBox.w / 2;
      ann.ry = newBox.h / 2;
      ann.cx = newBox.x + ann.rx;
      ann.cy = newBox.y + ann.ry;
      break;
    }
    case "line":
    case "arrow": {
      var ox = originBounds.x;
      var oy = originBounds.y;
      ann.x1 = newBox.x + (origin.x1 - ox) * ratioX;
      ann.y1 = newBox.y + (origin.y1 - oy) * ratioY;
      ann.x2 = newBox.x + (origin.x2 - ox) * ratioX;
      ann.y2 = newBox.y + (origin.y2 - oy) * ratioY;
      break;
    }
    case "path": {
      var ox = originBounds.x;
      var oy = originBounds.y;
      ann.points = origin.points.map(function (p) {
        return {
          x: newBox.x + (p.x - ox) * ratioX,
          y: newBox.y + (p.y - oy) * ratioY,
        };
      });
      break;
    }
    case "text": {
      ann.x = newBox.x;
      ann.y = newBox.y;
      ann.fontSize = Math.max(6, Math.round(origin.fontSize * ratioX));
      break;
    }
  }
}

function applyGroupRotate(groupItems, center, deltaRad) {
  var cosA = Math.cos(deltaRad);
  var sinA = Math.sin(deltaRad);
  var deltaDeg = (deltaRad * 180) / Math.PI;

  groupItems.forEach(function (item) {
    var ann = findAnnotation(currentPage, item.id);
    if (!ann) return;
    var origin = item.origin;

    if (ann.type === "path") {
      ann.points = (origin.points || []).map(function (p) {
        var dx = p.x - center.x;
        var dy = p.y - center.y;
        return {
          x: center.x + dx * cosA - dy * sinA,
          y: center.y + dx * sinA + dy * cosA,
        };
      });
    } else if (ann.type === "line" || ann.type === "arrow") {
      var dx1 = origin.x1 - center.x;
      var dy1 = origin.y1 - center.y;
      ann.x1 = center.x + dx1 * cosA - dy1 * sinA;
      ann.y1 = center.y + dx1 * sinA + dy1 * cosA;

      var dx2 = origin.x2 - center.x;
      var dy2 = origin.y2 - center.y;
      ann.x2 = center.x + dx2 * cosA - dy2 * sinA;
      ann.y2 = center.y + dx2 * sinA + dy2 * cosA;
    } else if (ann.type === "ellipse") {
      var dx = origin.cx - center.x;
      var dy = origin.cy - center.y;
      ann.cx = center.x + dx * cosA - dy * sinA;
      ann.cy = center.y + dx * sinA + dy * cosA;
      ann.rotation = Math.round(((origin.rotation || 0) + deltaDeg) % 360);
    } else {
      var oc = getCenter(origin);
      var dx = oc.x - center.x;
      var dy = oc.y - center.y;
      var nc = {
        x: center.x + dx * cosA - dy * sinA,
        y: center.y + dx * sinA + dy * cosA,
      };
      var b = getBounds(origin);
      ann.x = nc.x - b.w / 2;
      ann.y = nc.y - b.h / 2;
      ann.rotation = Math.round(((origin.rotation || 0) + deltaDeg) % 360);
    }
  });
}

function applyGroupResize(groupItems, origBounds, newBox) {
  if (origBounds.w === 0 || origBounds.h === 0) return;
  var ratioX = newBox.w / origBounds.w;
  var ratioY = newBox.h / origBounds.h;

  groupItems.forEach(function (item) {
    var ann = findAnnotation(currentPage, item.id);
    if (!ann) return;
    var origin = item.origin;
    var b = getBounds(origin);

    var annNewBox = {
      x: newBox.x + (b.x - origBounds.x) * ratioX,
      y: newBox.y + (b.y - origBounds.y) * ratioY,
      w: Math.max(2, b.w * ratioX),
      h: Math.max(2, b.h * ratioY),
    };

    applyBoundsResize(ann, origin, annNewBox);
  });
}

