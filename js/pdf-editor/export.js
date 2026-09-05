/**
 * PDFMaster PDF Editor - PDF Export Engine
 * Vector and rasterized PDF generation, rotated page transformations, and file download via PDF-Lib.
 */
"use strict";

function drawArrowOnPdf(page, ann, pageHeight, color) {
  var y1 = pageHeight - ann.y1,
    y2 = pageHeight - ann.y2;
  page.drawLine({
    start: { x: ann.x1, y: y1 },
    end: { x: ann.x2, y: y2 },
    thickness: ann.strokeWidth,
    color: color,
  });
  var angle = Math.atan2(y2 - y1, ann.x2 - ann.x1);
  var headLen = Math.max(10, ann.strokeWidth * 3.2);
  var spread = Math.PI / 7;
  var hx1 = ann.x2 - headLen * Math.cos(angle - spread),
    hy1 = y2 - headLen * Math.sin(angle - spread);
  var hx2 = ann.x2 - headLen * Math.cos(angle + spread),
    hy2 = y2 - headLen * Math.sin(angle + spread);
  page.drawLine({
    start: { x: ann.x2, y: y2 },
    end: { x: hx1, y: hy1 },
    thickness: ann.strokeWidth,
    color: color,
  });
  page.drawLine({
    start: { x: ann.x2, y: y2 },
    end: { x: hx2, y: hy2 },
    thickness: ann.strokeWidth,
    color: color,
  });
}
function drawAnnotationOnPdf(
  pdfLibDoc,
  page,
  ann,
  pageHeight,
  fonts,
  rgb,
  imageCache,
) {
  var rgbArr = hexToRgb01(ann.color);
  var color = rgb(rgbArr[0], rgbArr[1], rgbArr[2]);
  var rotDeg = ann.rotation || 0;
  var pdfRot =
    window.PDFLib && window.PDFLib.degrees
      ? window.PDFLib.degrees(-rotDeg)
      : null;
  var pdfRad = (-rotDeg * Math.PI) / 180;
  var p;

  switch (ann.type) {
    case "text": {
      var fontToUse = fonts.regular;
      if (ann.isBold && ann.isItalic) {
        fontToUse = fonts.boldItalic;
      } else if (ann.isBold) {
        fontToUse = fonts.bold;
      } else if (ann.isItalic) {
        fontToUse = fonts.italic;
      }

      var textWidth = fontToUse.widthOfTextAtSize(ann.text, ann.fontSize);
      var textHeight = ann.fontSize;
      var cx_pdf = ann.x + textWidth / 2;
      var cy_pdf = pageHeight - (ann.y + textHeight / 2);

      var rx =
        cx_pdf -
        ((textWidth / 2) * Math.cos(pdfRad) -
          (textHeight / 2) * Math.sin(pdfRad));
      var ry =
        cy_pdf -
        ((textWidth / 2) * Math.sin(pdfRad) +
          (textHeight / 2) * Math.cos(pdfRad));

      var drawOpts = {
        x: rx,
        y: ry,
        size: ann.fontSize,
        font: fontToUse,
        color: color,
      };
      if (rotDeg !== 0 && pdfRot) drawOpts.rotate = pdfRot;

      page.drawText(ann.text, drawOpts);

      // Underline support on PDF
      if (ann.isUnderline) {
        var underlineY_rel = -(ann.fontSize * 0.1);
        var u_start_x =
          cx_pdf -
          ((textWidth / 2) * Math.cos(pdfRad) -
            underlineY_rel * Math.sin(pdfRad));
        var u_start_y =
          cy_pdf -
          ((textWidth / 2) * Math.sin(pdfRad) +
            underlineY_rel * Math.cos(pdfRad));
        var u_end_x =
          cx_pdf -
          ((-textWidth / 2) * Math.cos(pdfRad) -
            underlineY_rel * Math.sin(pdfRad));
        var u_end_y =
          cy_pdf -
          ((-textWidth / 2) * Math.sin(pdfRad) +
            underlineY_rel * Math.cos(pdfRad));

        page.drawLine({
          start: { x: u_start_x, y: u_start_y },
          end: { x: u_end_x, y: u_end_y },
          thickness: Math.max(1, ann.fontSize * 0.08),
          color: color,
        });
      }
      return Promise.resolve();
    }
    case "rect": {
      var w = ann.width,
        h = ann.height;
      var cx_pdf = ann.x + w / 2;
      var cy_pdf = pageHeight - (ann.y + h / 2);

      var rx =
        cx_pdf - ((w / 2) * Math.cos(pdfRad) - (h / 2) * Math.sin(pdfRad));
      var ry =
        cy_pdf - ((w / 2) * Math.sin(pdfRad) + (h / 2) * Math.cos(pdfRad));

      var drawOpts = {
        x: rx,
        y: ry,
        width: w,
        height: h,
        borderColor: color,
        borderWidth: ann.strokeWidth,
      };
      if (rotDeg !== 0 && pdfRot) drawOpts.rotate = pdfRot;

      page.drawRectangle(drawOpts);
      return Promise.resolve();
    }
    case "ellipse": {
      var drawOpts = {
        x: ann.cx,
        y: pageHeight - ann.cy,
        xScale: ann.rx,
        yScale: ann.ry,
        borderColor: color,
        borderWidth: ann.strokeWidth,
      };
      if (rotDeg !== 0 && pdfRot) drawOpts.rotate = pdfRot;
      page.drawEllipse(drawOpts);
      return Promise.resolve();
    }
    case "line": {
      if (rotDeg !== 0) {
        var cx = (ann.x1 + ann.x2) / 2,
          cy = (ann.y1 + ann.y2) / 2;
        var rad = (rotDeg * Math.PI) / 180;
        var p1 = {
          x: cx + (ann.x1 - cx) * Math.cos(rad) - (ann.y1 - cy) * Math.sin(rad),
          y: cy + (ann.x1 - cx) * Math.sin(rad) + (ann.y1 - cy) * Math.cos(rad),
        };
        var p2 = {
          x: cx + (ann.x2 - cx) * Math.cos(rad) - (ann.y2 - cy) * Math.sin(rad),
          y: cy + (ann.x2 - cx) * Math.sin(rad) + (ann.y2 - cy) * Math.cos(rad),
        };
        page.drawLine({
          start: { x: p1.x, y: pageHeight - p1.y },
          end: { x: p2.x, y: pageHeight - p2.y },
          thickness: ann.strokeWidth,
          color: color,
        });
      } else {
        page.drawLine({
          start: { x: ann.x1, y: pageHeight - ann.y1 },
          end: { x: ann.x2, y: pageHeight - ann.y2 },
          thickness: ann.strokeWidth,
          color: color,
        });
      }
      return Promise.resolve();
    }
    case "arrow": {
      if (rotDeg !== 0) {
        var cx = (ann.x1 + ann.x2) / 2,
          cy = (ann.y1 + ann.y2) / 2;
        var rad = (rotDeg * Math.PI) / 180;
        var rotAnn = Object.assign({}, ann, {
          x1:
            cx + (ann.x1 - cx) * Math.cos(rad) - (ann.y1 - cy) * Math.sin(rad),
          y1:
            cy + (ann.x1 - cx) * Math.sin(rad) + (ann.y1 - cy) * Math.cos(rad),
          x2:
            cx + (ann.x2 - cx) * Math.cos(rad) - (ann.y2 - cy) * Math.sin(rad),
          y2:
            cy + (ann.x2 - cx) * Math.sin(rad) + (ann.y2 - cy) * Math.cos(rad),
        });
        drawArrowOnPdf(page, rotAnn, pageHeight, color);
      } else {
        drawArrowOnPdf(page, ann, pageHeight, color);
      }
      return Promise.resolve();
    }
    case "path": {
      if (ann.points && ann.points.length > 0) {
        var pts = ann.points;
        if (rotDeg !== 0) {
          var b = getBounds(ann);
          var cx = b.x + b.w / 2,
            cy = b.y + b.h / 2;
          var rad = (rotDeg * Math.PI) / 180;
          pts = ann.points.map(function (p) {
            return {
              x: cx + (p.x - cx) * Math.cos(rad) - (p.y - cy) * Math.sin(rad),
              y: cy + (p.x - cx) * Math.sin(rad) + (p.y - cy) * Math.cos(rad),
            };
          });
        }
        var svgPathString = "";
        if (pts.length === 1) {
          svgPathString =
            "M " +
            pts[0].x +
            "," +
            pts[0].y +
            " L " +
            (pts[0].x + 0.1) +
            "," +
            pts[0].y;
        } else if (pts.length === 2) {
          svgPathString =
            "M " +
            pts[0].x +
            "," +
            pts[0].y +
            " L " +
            pts[1].x +
            "," +
            pts[1].y;
        } else {
          svgPathString = "M " + pts[0].x + "," + pts[0].y;
          for (var k = 1; k < pts.length - 1; k++) {
            var midX = (pts[k].x + pts[k + 1].x) / 2;
            var midY = (pts[k].y + pts[k + 1].y) / 2;
            svgPathString +=
              " Q " +
              pts[k].x.toFixed(2) +
              "," +
              pts[k].y.toFixed(2) +
              " " +
              midX.toFixed(2) +
              "," +
              midY.toFixed(2);
          }
          svgPathString +=
            " L " +
            pts[pts.length - 1].x.toFixed(2) +
            "," +
            pts[pts.length - 1].y.toFixed(2);
        }
        page.drawSvgPath(svgPathString, {
          x: 0,
          y: pageHeight,
          borderColor: color,
          borderWidth: ann.strokeWidth,
          borderOpacity: ann.opacity != null ? ann.opacity : 1,
          borderLineCap:
            window.PDFLib &&
            window.PDFLib.LineCapStyle &&
            window.PDFLib.LineCapStyle.Round !== undefined
              ? window.PDFLib.LineCapStyle.Round
              : 1,
        });
      }
      return Promise.resolve();
    }
    case "image": {
      if (imageCache && imageCache[ann.dataUrl]) {
        p = imageCache[ann.dataUrl];
      } else {
        p =
          ann.dataUrl.indexOf("image/png") !== -1
            ? pdfLibDoc.embedPng(dataUrlToBytes(ann.dataUrl))
            : pdfLibDoc.embedJpg(dataUrlToBytes(ann.dataUrl));
        if (imageCache) {
          imageCache[ann.dataUrl] = p;
        }
      }
      return p.then(function (embedded) {
        var w = ann.width,
          h = ann.height;
        var cx_pdf = ann.x + w / 2;
        var cy_pdf = pageHeight - (ann.y + h / 2);

        var rx =
          cx_pdf - ((w / 2) * Math.cos(pdfRad) - (h / 2) * Math.sin(pdfRad));
        var ry =
          cy_pdf - ((w / 2) * Math.sin(pdfRad) + (h / 2) * Math.cos(pdfRad));

        var drawOpts = {
          x: rx,
          y: ry,
          width: w,
          height: h,
        };
        if (rotDeg !== 0 && pdfRot) drawOpts.rotate = pdfRot;

        page.drawImage(embedded, drawOpts);
      });
    }
    default:
      return Promise.resolve();
  }
}
function exportPdf() {
  if (!currentFileBlob) {
    return;
  }
  var btn = document.getElementById("download-btn");
  var oldLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparing your file…";
  ensureLibraries()
    .then(function () {
      return currentFileBlob.arrayBuffer();
    })
    .then(function (sourceBytes) {
      var PDFLibNS = window.PDFLib;
      return PDFLibNS.PDFDocument.load(sourceBytes).then(function (pdfLibDoc) {
        var embedHelvetica = pdfLibDoc.embedFont(
          PDFLibNS.StandardFonts.Helvetica,
        );
        var embedHelveticaBold = pdfLibDoc.embedFont(
          PDFLibNS.StandardFonts.HelveticaBold,
        );
        var embedHelveticaOblique = pdfLibDoc.embedFont(
          PDFLibNS.StandardFonts.HelveticaOblique,
        );
        var embedHelveticaBoldOblique = pdfLibDoc.embedFont(
          PDFLibNS.StandardFonts.HelveticaBoldOblique,
        );

        return Promise.all([
          embedHelvetica,
          embedHelveticaBold,
          embedHelveticaOblique,
          embedHelveticaBoldOblique,
        ]).then(function (fonts) {
          var helv = fonts[0];
          var helvBold = fonts[1];
          var helvOblique = fonts[2];
          var helvBoldOblique = fonts[3];

          var fontMap = {
            regular: helv,
            bold: helvBold,
            italic: helvOblique,
            boldItalic: helvBoldOblique,
          };
          // Shared for the whole export: a signature or logo stamped on many
          // pages gets embedded as a PDF image object once and reused, instead
          // of once per occurrence.
          var embeddedImageCache = {};

          var pages = pdfLibDoc.getPages();
          var chain = Promise.resolve();
          pages.forEach(function (page, i) {
            var pageNum = i + 1;
            var userRot = (pageRotations[pageNum] || 0) % 360;
            var origRot = (page.getRotation().angle || 0) % 360;
            var effectiveRot = (((origRot + userRot) % 360) + 360) % 360;
            if (userRot !== 0) {
              page.setRotation(PDFLibNS.degrees(effectiveRot));
            }

            var pageHeight = page.getHeight();
            var pageWidth = page.getWidth();
            var anns = annotationsByPage[pageNum] || [];
            var hasEraser = anns.some(function (a) {
              return a.type === "eraser";
            });

            if (anns.length === 0) {
              return;
            }

            if (hasEraser || effectiveRot !== 0) {
              chain = chain.then(function () {
                var exportScale = 2.5;
                var isSideways = effectiveRot === 90 || effectiveRot === 270;
                var canvasW = Math.round(
                  (isSideways ? pageHeight : pageWidth) * exportScale,
                );
                var canvasH = Math.round(
                  (isSideways ? pageWidth : pageHeight) * exportScale,
                );

                var offscreen = document.createElement("canvas");
                offscreen.width = canvasW;
                offscreen.height = canvasH;
                var octx = offscreen.getContext("2d");
                octx.clearRect(0, 0, offscreen.width, offscreen.height);

                anns.forEach(function (ann) {
                  drawAnnotation(octx, ann, exportScale);
                });

                var dataUrl = offscreen.toDataURL("image/png");
                return pdfLibDoc
                  .embedPng(dataUrlToBytes(dataUrl))
                  .then(function (embeddedPng) {
                    var drawOpts;
                    if (effectiveRot === 90) {
                      drawOpts = {
                        x: pageWidth,
                        y: 0,
                        width: pageHeight,
                        height: pageWidth,
                        rotate: PDFLibNS.degrees(90),
                      };
                    } else if (effectiveRot === 180) {
                      drawOpts = {
                        x: pageWidth,
                        y: pageHeight,
                        width: pageWidth,
                        height: pageHeight,
                        rotate: PDFLibNS.degrees(180),
                      };
                    } else if (effectiveRot === 270) {
                      drawOpts = {
                        x: 0,
                        y: pageHeight,
                        width: pageHeight,
                        height: pageWidth,
                        rotate: PDFLibNS.degrees(270),
                      };
                    } else {
                      drawOpts = {
                        x: 0,
                        y: 0,
                        width: pageWidth,
                        height: pageHeight,
                      };
                    }
                    page.drawImage(embeddedPng, drawOpts);
                  });
              });
            } else {
              anns.forEach(function (ann) {
                chain = chain.then(function () {
                  return drawAnnotationOnPdf(
                    pdfLibDoc,
                    page,
                    ann,
                    pageHeight,
                    fontMap,
                    PDFLibNS.rgb,
                    embeddedImageCache,
                  );
                });
              });
            }
          });
          return chain.then(function () {
            return pdfLibDoc.save();
          });
        });
      });
    })
    .then(function (bytes) {
      var blob = new Blob([bytes], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var base = (fileName || "document.pdf").replace(/\.pdf$/i, "");
      a.href = url;
      a.download = base + "-edited.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 4000);
      window.showToast("Your edited PDF is downloading.");
    })
    .catch(function (err) {
      console.error(err);
      var msg = ((err && err.message) || "").toLowerCase();
      window.showToast(
        msg.indexOf("encrypt") !== -1
          ? "This PDF is encrypted and can't be saved with new edits."
          : "Something went wrong while saving. Please try again.",
      );
    })
    .then(function () {
      btn.disabled = false;
      btn.textContent = oldLabel;
    });
}
