/**
 * PDFMaster PDF Editor - Pointer Interaction Engine
 * Canvas pointerdown, pointermove, pointerup, lasso selection, transformation dragging, and hover cursors.
 */
"use strict";


/* ---------- pointer interaction on the page ---------- */
function getCanvasPagePoint(evt) {
  var canvas = document.getElementById("annotation-canvas");
  var rect = canvas.getBoundingClientRect();
  var cx = evt.clientX - rect.left,
    cy = evt.clientY - rect.top;
  return { x: cx / currentScale, y: cy / currentScale, cx: cx, cy: cy };
}

function onPointerDown(e) {
  if (!pdfDoc) {
    return;
  }
  var canvas = document.getElementById("annotation-canvas");
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {}
  var pt = getCanvasPagePoint(e);
  isPointerDown = true;

  if (currentTool === "select" || currentTool === "lasso") {
    if (selectedGroup && selectedGroup.page === currentPage) {
      var groupAnns = getGroupAnnotations();
      if (groupAnns.length > 0) {
        var handles = getGroupSelectionHandles(groupAnns, currentScale);
        var isTouch = e.pointerType === "touch";
        var tolerance = isTouch ? 16 : 6;

        // Delete button
        if (
          Math.hypot(
            pt.cx - handles.deleteBtn.x,
            pt.cy - handles.deleteBtn.y,
          ) <=
          handles.deleteBtn.r + (isTouch ? 12 : 4)
        ) {
          pushHistory();
          groupAnns.forEach(function (a) {
            deleteAnnotation(currentPage, a.id);
          });
          selectedGroup = null;
          isPointerDown = false;
          hideToolOptionsPanel();
          redrawAnnotations();
          return;
        }

        // Rotate button
        if (
          Math.hypot(
            pt.cx - handles.rotateBtn.x,
            pt.cy - handles.rotateBtn.y,
          ) <=
          handles.rotateBtn.r + (isTouch ? 12 : 4)
        ) {
          pushHistory();
          dragMode = "group-rotate";
          groupDragOrigins = groupAnns.map(function (a) {
            return { id: a.id, origin: deepClone(a) };
          });
          groupOrigBounds = getGroupBounds(groupAnns);
          dragCenter = {
            x: groupOrigBounds.x + groupOrigBounds.w / 2,
            y: groupOrigBounds.y + groupOrigBounds.h / 2,
          };
          var cScreenX = dragCenter.x * currentScale;
          var cScreenY = dragCenter.y * currentScale;
          dragStartAngle = Math.atan2(pt.cy - cScreenY, pt.cx - cScreenX);
          hideToolOptionsPanel();
          return;
        }

        // Corner Resizers Click Detection
        var cornerNames = ["tl", "tr", "br", "bl"];
        for (var i = 0; i < cornerNames.length; i++) {
          var name = cornerNames[i];
          var h = handles[name];
          var dist = Math.hypot(pt.cx - h.x, pt.cy - h.y);
          if (dist <= h.size + tolerance) {
            pushHistory();
            dragMode = "group-resize-" + name;
            groupDragOrigins = groupAnns.map(function (a) {
              return { id: a.id, origin: deepClone(a) };
            });
            groupOrigBounds = getGroupBounds(groupAnns);
            dragStartPoint = pt;
            hideToolOptionsPanel();
            return;
          }
        }

        // Side Resizers Click Detection
        var sideNames = ["t", "b", "l", "r"];
        for (var i = 0; i < sideNames.length; i++) {
          var name = sideNames[i];
          var h = handles[name];
          var dist = Math.hypot(pt.cx - h.x, pt.cy - h.y);
          if (dist <= h.size + tolerance) {
            pushHistory();
            dragMode = "group-resize-" + name;
            groupDragOrigins = groupAnns.map(function (a) {
              return { id: a.id, origin: deepClone(a) };
            });
            groupOrigBounds = getGroupBounds(groupAnns);
            dragStartPoint = pt;
            hideToolOptionsPanel();
            return;
          }
        }

        // Inside box for moving
        var b = handles.box;
        if (
          pt.cx >= b.x &&
          pt.cx <= b.x + b.w &&
          pt.cy >= b.y &&
          pt.cy <= b.y + b.h
        ) {
          pushHistory();
          dragMode = "group-move";
          groupDragOrigins = groupAnns.map(function (a) {
            return { id: a.id, origin: deepClone(a) };
          });
          dragStartPoint = pt;
          hideToolOptionsPanel();
          return;
        }
      }
    }
    if (selectedAnnotation && selectedAnnotation.page === currentPage) {
      var ann = findAnnotation(currentPage, selectedAnnotation.id);
      if (ann && !isAnnotationEmpty(ann)) {
        var center = getCenter(ann);
        var upt = unrotatePoint(pt, center, ann.rotation || 0);
        var handles = getSelectionHandles(ann, currentScale);
        var isTouch = e.pointerType === "touch";

        var dDist = Math.hypot(
          upt.cx - handles.deleteBtn.x,
          upt.cy - handles.deleteBtn.y,
        );
        if (dDist <= handles.deleteBtn.r + (isTouch ? 12 : 4)) {
          deleteAnnotation(currentPage, ann.id);
          isPointerDown = false;
          hideToolOptionsPanel();
          return;
        }
        if (handles.cropBtn) {
          var cDist = Math.hypot(
            upt.cx - handles.cropBtn.x,
            upt.cy - handles.cropBtn.y,
          );
          if (cDist <= handles.cropBtn.r + (isTouch ? 12 : 4)) {
            hideToolOptionsPanel();
            openCropModal(ann);
            isPointerDown = false;
            return;
          }
        }
        if (handles.rotateBtn) {
          var rDist = Math.hypot(
            upt.cx - handles.rotateBtn.x,
            upt.cy - handles.rotateBtn.y,
          );
          if (rDist <= handles.rotateBtn.r + (isTouch ? 12 : 4)) {
            dragMode = "rotate";
            dragOrigin = deepClone(ann);
            dragCenter = getCenter(ann);
            var cScreenX = dragCenter.x * currentScale;
            var cScreenY = dragCenter.y * currentScale;
            dragStartAngle = Math.atan2(pt.cy - cScreenY, pt.cx - cScreenX);
            hideToolOptionsPanel();
            return;
          }
        }

        // Corner Resizers Click Detection
        var tolerance = isTouch ? 16 : 6;
        var cornerNames = ["tl", "tr", "br", "bl"];
        for (var i = 0; i < cornerNames.length; i++) {
          var name = cornerNames[i];
          var h = handles[name];
          var dist = Math.hypot(upt.cx - h.x, upt.cy - h.y);
          if (dist <= h.size + tolerance) {
            dragMode = "resize-" + name;
            dragOrigin = deepClone(ann);
            dragStartPoint = pt;
            hideToolOptionsPanel();
            return;
          }
        }
        // Side Resizers Click Detection
        var sideNames = ["t", "b", "l", "r"];
        for (var i = 0; i < sideNames.length; i++) {
          var name = sideNames[i];
          var h = handles[name];
          var dist = Math.hypot(upt.cx - h.x, upt.cy - h.y);
          if (dist <= h.size + tolerance) {
            dragMode = "resize-" + name;
            dragOrigin = deepClone(ann);
            dragStartPoint = pt;
            hideToolOptionsPanel();
            return;
          }
        }
        // Allow dragging by clicking inside the selected element's bounding box
        var b = handles.box;
        if (
          upt.cx >= b.x &&
          upt.cx <= b.x + b.w &&
          upt.cy >= b.y &&
          upt.cy <= b.y + b.h
        ) {
          dragMode = "move";
          dragOrigin = deepClone(ann);
          dragStartPoint = pt;
          if (ann.fontSize !== undefined) {
            currentFontSize = ann.fontSize;
          }
          if (ann.color !== undefined) {
            currentColor = ann.color;
          }
          if (ann.strokeWidth !== undefined) {
            currentStrokeWidth = ann.strokeWidth;
          }
          hideToolOptionsPanel();
          syncOptionInputs();
          return;
        }
      } else {
        selectedAnnotation = null;
      }
    }

    if (currentTool === "lasso") {
      selectedAnnotation = null;
      selectedGroup = null;
      hideToolOptionsPanel();
      liveLasso = [{ x: pt.x, y: pt.y }];
      redrawAnnotations();
      return;
    }

    var hit = hitTest(pt);
    if (hit) {
      selectedGroup = null;
      selectedAnnotation = { page: currentPage, id: hit.id };
      dragMode = "move";
      dragOrigin = deepClone(hit);
      dragStartPoint = pt;
      if (hit.color !== undefined) {
        currentColor = hit.color;
      }
      if (hit.strokeWidth !== undefined) {
        currentStrokeWidth = hit.strokeWidth;
      }
      if (hit.fontSize !== undefined) {
        currentFontSize = hit.fontSize;
        var fsInput = document.getElementById("font-size");
        if (fsInput) fsInput.value = currentFontSize;
      }
      if (hit.type === "text") {
        currentIsBold = !!hit.isBold;
        currentIsItalic = !!hit.isItalic;
        currentIsUnderline = !!hit.isUnderline;
      } else {
        currentIsBold = false;
        currentIsItalic = false;
        currentIsUnderline = false;
      }
      hideToolOptionsPanel();
      syncOptionInputs();
      redrawAnnotations();
    } else {
      selectedAnnotation = null;
      selectedGroup = null;
      hideToolOptionsPanel();
      redrawAnnotations();
    }
    return;
  }

  hideToolOptionsPanel();
  strokePreviewPoint = null;
  eraserPreviewPoint = null;

  if (currentTool === "text") {
    e.preventDefault();
    startTextEditing(pt);
    return;
  }

  if (currentTool === "pen" || currentTool === "highlighter") {
    livePath = {
      points: [{ x: pt.x, y: pt.y }],
      style: {
        color: currentColor,
        strokeWidth: currentStrokeWidth,
        opacity: currentTool === "highlighter" ? 0.38 : 1,
      },
    };
    return;
  }

  if (["rect", "ellipse", "line", "arrow"].indexOf(currentTool) !== -1) {
    dragStartPoint = pt;
    liveShape = shapeFromDrag(currentTool, pt, pt);
    return;
  }

  if (
    (currentTool === "image" || currentTool === "signature") &&
    pendingPlaceable
  ) {
    placePendingAt(pt);
    return;
  }

  if (currentTool === "stroke-eraser") {
    isErasing = true;
    erasedAny = false;
    pushHistory();
    lastErasePoint = pt;
    if (eraseStrokeAtPoint(pt, eraserSize / 2)) {
      erasedAny = true;
    }
    redrawAnnotations();
    return;
  }

  if (currentTool === "pixel-eraser") {
    isErasing = true;
    liveEraser = {
      points: [{ x: pt.x, y: pt.y }],
      size: eraserSize,
    };
    redrawAnnotations();
    return;
  }
}

function onPointerMove(e) {
  var pt = getCanvasPagePoint(e);
  if (!isPointerDown) {
    if (currentTool === "stroke-eraser" || currentTool === "pixel-eraser") {
      eraserPreviewPoint = pt;
      if (strokePreviewPoint) strokePreviewPoint = null;
      requestRedraw();
    } else if (currentTool === "pen" || currentTool === "highlighter") {
      strokePreviewPoint = pt;
      if (eraserPreviewPoint) eraserPreviewPoint = null;
      requestRedraw();
    } else {
      if (eraserPreviewPoint || strokePreviewPoint) {
        eraserPreviewPoint = null;
        strokePreviewPoint = null;
        requestRedraw();
      }
    }
    updateCursorStyle(e);
    return;
  }
  if (currentTool === "stroke-eraser" || currentTool === "pixel-eraser") {
    eraserPreviewPoint = pt;
    if (isErasing) {
      if (currentTool === "stroke-eraser") {
        if (
          eraseStrokeAlongSegment(lastErasePoint || pt, pt, eraserSize / 2)
        ) {
          erasedAny = true;
        }
        lastErasePoint = pt;
        requestRedraw();
      } else if (currentTool === "pixel-eraser" && liveEraser) {
        liveEraser.points.push({ x: pt.x, y: pt.y });
        requestRedraw();
      }
    }
    return;
  }
  if (currentTool === "lasso" && liveLasso) {
    liveLasso.push({ x: pt.x, y: pt.y });
    requestRedraw();
    return;
  }
  if (
    (currentTool === "select" || currentTool === "lasso") &&
    dragMode === "group-move" &&
    groupDragOrigins
  ) {
    var dx = pt.x - dragStartPoint.x;
    var dy = pt.y - dragStartPoint.y;
    groupDragOrigins.forEach(function (item) {
      var a = findAnnotation(currentPage, item.id);
      if (a) {
        applyMove(a, item.origin, dx, dy);
      }
    });
    requestRedraw();
    return;
  }
  if (
    (currentTool === "select" || currentTool === "lasso") &&
    dragMode === "group-rotate" &&
    groupDragOrigins &&
    dragCenter
  ) {
    var cScreenX = dragCenter.x * currentScale;
    var cScreenY = dragCenter.y * currentScale;
    var currentAngle = Math.atan2(pt.cy - cScreenY, pt.cx - cScreenX);
    var deltaRad = currentAngle - dragStartAngle;
    if (e.shiftKey) {
      var deg = (deltaRad * 180) / Math.PI;
      deg = Math.round(deg / 15) * 15;
      deltaRad = (deg * Math.PI) / 180;
    }
    applyGroupRotate(groupDragOrigins, dragCenter, deltaRad);
    requestRedraw();
    return;
  }
  if (
    (currentTool === "select" || currentTool === "lasso") &&
    dragMode &&
    dragMode.indexOf("group-resize-") === 0 &&
    groupDragOrigins &&
    groupOrigBounds
  ) {
    var direction = dragMode.substring(13);
    var ox = groupOrigBounds.x;
    var oy = groupOrigBounds.y;
    var ow = groupOrigBounds.w;
    var oh = groupOrigBounds.h;
    var dx = pt.x - dragStartPoint.x;
    var dy = pt.y - dragStartPoint.y;

    var newX = ox;
    var newY = oy;
    var newW = ow;
    var newH = oh;

    if (direction.indexOf("l") !== -1) {
      newX = ox + dx;
      newW = ow - dx;
    }
    if (direction.indexOf("r") !== -1) {
      newW = ow + dx;
    }
    if (direction.indexOf("t") !== -1) {
      newY = oy + dy;
      newH = oh - dy;
    }
    if (direction.indexOf("b") !== -1) {
      newH = oh + dy;
    }

    var minW = 10;
    var minH = 10;
    if (newW < minW) {
      if (direction.indexOf("l") !== -1) newX = ox + ow - minW;
      newW = minW;
    }
    if (newH < minH) {
      if (direction.indexOf("t") !== -1) newY = oy + oh - minH;
      newH = minH;
    }

    if (direction === "t" || direction === "b") {
      var s = newH / oh;
      newW = Math.max(minW, ow * s);
      newX = ox + (ow - newW) / 2;
    } else if (direction === "l" || direction === "r") {
      var s = newW / ow;
      newH = Math.max(minH, oh * s);
      newY = oy + (oh - newH) / 2;
    } else {
      var s = newW / ow;
      newH = Math.max(minH, oh * s);
      if (direction === "tl") {
        newX = ox + ow - newW;
        newY = oy + oh - newH;
      } else if (direction === "tr") {
        newX = ox;
        newY = oy + oh - newH;
      } else if (direction === "bl") {
        newX = ox + ow - newW;
        newY = oy;
      } else if (direction === "br") {
        newX = ox;
        newY = oy;
      }
    }

    applyGroupResize(groupDragOrigins, groupOrigBounds, {
      x: newX,
      y: newY,
      w: newW,
      h: newH,
    });
    requestRedraw();
    return;
  }
  if ((currentTool === "select" || currentTool === "lasso") && dragMode) {
    var ann = findAnnotation(currentPage, selectedAnnotation.id);
    if (!ann) {
      return;
    }
    if (dragMode === "rotate") {
      var cScreenX = dragCenter.x * currentScale;
      var cScreenY = dragCenter.y * currentScale;
      var currentAngle = Math.atan2(pt.cy - cScreenY, pt.cx - cScreenX);
      var deltaRad = currentAngle - dragStartAngle;
      var deltaDeg = (deltaRad * 180) / Math.PI;
      var rawRot = (dragOrigin.rotation || 0) + deltaDeg;
      if (e.shiftKey) {
        rawRot = Math.round(rawRot / 15) * 15;
      }
      var norm = Math.round(rawRot);
      while (norm > 180) norm -= 360;
      while (norm <= -180) norm += 360;

      ann.rotation = norm;
      var rotInput = document.getElementById("rotation-val");
      if (rotInput) rotInput.value = norm;
      requestRedraw();
      return;
    }

    var dx = pt.x - dragStartPoint.x,
      dy = pt.y - dragStartPoint.y;

    if (dragMode === "move") {
      applyMove(ann, dragOrigin, dx, dy);
    } else if (dragMode.indexOf("resize-") === 0) {
      var direction = dragMode.substring(7);
      var origBounds = getBounds(dragOrigin);
      var ox = origBounds.x,
        oy = origBounds.y,
        ow = origBounds.w,
        oh = origBounds.h;

      var newX = ox,
        newY = oy,
        newW = ow,
        newH = oh;

      if (direction.indexOf("l") !== -1) {
        newX = ox + dx;
        newW = ow - dx;
      }
      if (direction.indexOf("r") !== -1) {
        newW = ow + dx;
      }
      if (direction.indexOf("t") !== -1) {
        newY = oy + dy;
        newH = oh - dy;
      }
      if (direction.indexOf("b") !== -1) {
        newH = oh + dy;
      }

      var minW = 10;
      var minH = 10;

      if (newW < minW) {
        if (direction.indexOf("l") !== -1) newX = ox + ow - minW;
        newW = minW;
      }
      if (newH < minH) {
        if (direction.indexOf("t") !== -1) newY = oy + oh - minH;
        newH = minH;
      }

      if (
        ann.type === "image" ||
        ann.type === "path" ||
        ann.type === "text"
      ) {
        var ratio = oh / ow;

        if (direction === "t" || direction === "b") {
          var s = newH / oh;
          newW = ow * s;
          if (newW < minW) {
            newW = minW;
            newH = minW * ratio;
            if (direction === "t") newY = oy + oh - newH;
          }
          newX = ox;
        } else if (direction === "l" || direction === "r") {
          var s = newW / ow;
          newH = oh * s;
          if (newH < minH) {
            newH = minH;
            newW = minH / ratio;
            if (direction === "l") newX = ox + ow - newW;
          }
          newY = oy;
        } else {
          var s = newW / ow;
          newH = oh * s;
          if (newH < minH) {
            newH = minH;
            newW = minH / ratio;
          }
          if (direction === "tl") {
            newX = ox + ow - newW;
            newY = oy + oh - newH;
          } else if (direction === "tr") {
            newX = ox;
            newY = oy + oh - newH;
          } else if (direction === "bl") {
            newX = ox + ow - newW;
            newY = oy;
          } else if (direction === "br") {
            newX = ox;
            newY = oy;
          }
        }
      }

      applyBoundsResize(ann, dragOrigin, {
        x: newX,
        y: newY,
        w: newW,
        h: newH,
      });

      if (ann.type === "text" && ann.fontSize !== undefined) {
        currentFontSize = ann.fontSize;
        var fsInput = document.getElementById("font-size");
        if (fsInput) fsInput.value = currentFontSize;
      }
    }
    requestRedraw();
    return;
  }
  if (livePath) {
    var lastPt = livePath.points[livePath.points.length - 1];
    var dist = Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y);
    if (dist >= 1.0) {
      var weight = Math.min(0.88, Math.max(0.48, dist / 10));
      var smoothedPt = {
        x: lastPt.x + (pt.x - lastPt.x) * weight,
        y: lastPt.y + (pt.y - lastPt.y) * weight,
      };
      livePath.points.push(smoothedPt);
      requestRedraw();
    }
    return;
  }
  if (liveShape && dragStartPoint) {
    liveShape = shapeFromDrag(currentTool, dragStartPoint, pt);
    requestRedraw();
    return;
  }
}

function onPointerUp(e) {
  if (!isPointerDown) {
    return;
  }
  isPointerDown = false;
  var pt = e ? getCanvasPagePoint(e) : null;
  if (currentTool === "stroke-eraser") {
    if (isErasing) {
      isErasing = false;
      lastErasePoint = null;
      if (!erasedAny) {
        undoHistoryStack.pop();
      } else {
        scheduleDBSave();
      }
      redrawAnnotations();
    }
    return;
  }
  if (currentTool === "pixel-eraser") {
    if (liveEraser) {
      if (liveEraser.points.length > 0) {
        pushHistory();
        var modified = applyPixelErasureToAnnotations(
          liveEraser.points,
          (liveEraser.size || 20) / 2,
          currentPage,
        );
        if (modified) {
          scheduleDBSave();
        } else {
          undoHistoryStack.pop();
        }
      }
      liveEraser = null;
      isErasing = false;
      redrawAnnotations();
    }
    return;
  }
  if (currentTool === "select" || currentTool === "lasso") {
    if (dragMode && dragMode.indexOf("group-") === 0) {
      scheduleDBSave();
    }
    dragMode = null;
    dragOrigin = null;
    dragCenter = null;
    dragStartAngle = 0;
    groupDragOrigins = null;
    groupOrigBounds = null;

    if (currentTool === "lasso" && liveLasso) {
      if (liveLasso.length > 2) {
        cleanPageAnnotations(currentPage);
        var pageAnns = annotationsByPage[currentPage] || [];
        var captured = pageAnns.filter(function (a) {
          return isAnnotationInPolygon(a, liveLasso);
        });

        if (captured.length === 0) {
          selectedAnnotation = null;
          selectedGroup = null;
          hideToolOptionsPanel();
          if (window.showToast) {
            window.showToast("No elements captured by lasso");
          }
        } else if (captured.length === 1) {
          selectedAnnotation = { page: currentPage, id: captured[0].id };
          selectedGroup = null;
          updateToolOptionsPanel("lasso");
        } else {
          selectedGroup = {
            page: currentPage,
            ids: captured.map(function (a) {
              return a.id;
            }),
          };
          selectedAnnotation = null;
          updateToolOptionsPanel("lasso");
        }
      } else {
        selectedAnnotation = null;
        selectedGroup = null;
        hideToolOptionsPanel();
      }
      liveLasso = null;
      redrawAnnotations();
      return;
    }

    if (selectedAnnotation || selectedGroup) {
      updateToolOptionsPanel(currentTool);
    } else {
      hideToolOptionsPanel();
    }
    redrawAnnotations();
    return;
  }
  if (livePath) {
    if (livePath.points.length >= 1) {
      if (pt) {
        var last = livePath.points[livePath.points.length - 1];
        if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 0.5) {
          livePath.points.push({ x: pt.x, y: pt.y });
        }
      }
      var smoothedPoints =
        livePath.points.length > 2
          ? smoothStrokePoints(livePath.points)
          : livePath.points;
      var pathAnn = {
        id: nextId(),
        type: "path",
        page: currentPage,
        points: smoothedPoints,
        color: livePath.style.color,
        strokeWidth: livePath.style.strokeWidth,
        opacity: livePath.style.opacity,
      };
      addAnnotation(currentPage, pathAnn);
    }
    livePath = null;
    redrawAnnotations();
    return;
  }
  if (liveShape) {
    var b = getBounds(liveShape);
    if (b.w > 3 || b.h > 3) {
      var shapeAnn = Object.assign(
        { id: nextId(), page: currentPage },
        liveShape,
      );
      addAnnotation(currentPage, shapeAnn);
    }
    liveShape = null;
    dragStartPoint = null;
    redrawAnnotations();
    return;
  }
}

/* ---------- export ---------- */

var annCanvasEl = document.getElementById("annotation-canvas");
annCanvasEl.addEventListener("pointerdown", onPointerDown);
annCanvasEl.addEventListener("pointermove", onPointerMove);
annCanvasEl.addEventListener("pointerleave", function () {
  if (eraserPreviewPoint || strokePreviewPoint) {
    eraserPreviewPoint = null;
    strokePreviewPoint = null;
    requestRedraw();
  }
});
annCanvasEl.addEventListener("dblclick", function (e) {
  if ((currentTool !== "select" && currentTool !== "lasso") || !pdfDoc)
    return;
  var pt = getCanvasPagePoint(e);
  var hit = hitTest(pt);
  if (hit && hit.type === "text") {
    startTextEditingOf(hit);
  }
});
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);

