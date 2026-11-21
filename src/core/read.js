// Lectura de un PDF de partitura: glifos, trazados y rasterizado.
// Funciona igual en Node (para pruebas) y en el navegador (mupdf-wasm).
import * as mupdf from "mupdf";

const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function openDocument(bytes) {
  return mupdf.Document.openDocument(bytes, "pdf");
}

/**
 * Extrae de una pagina: tamano, glifos con posicion, rellenos y trazos,
 * y una imagen en gris (para pentagramas y barrados).
 */
export function readPage(doc, index = 0, { dpi = 300 } = {}) {
  const page = doc.loadPage(index);
  const bounds = page.getBounds();
  const pw = bounds[2] - bounds[0];
  const ph = bounds[3] - bounds[1];

  const s = dpi / 72;
  const pm = page.toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceGray, false);
  const pixelWidth = pm.getWidth();
  const pixelHeight = pm.getHeight();
  const stride = pm.getStride();
  const pixels = new Uint8Array(pm.getPixels()); // copia: la vista de wasm se invalida

  const glyphs = [];
  const fills = [];
  const strokes = [];

  const addGlyphs = (text, ctm) => {
    text.walk({
      showGlyph(font, trm, gid, uni) {
        const [x, y] = apply(ctm, trm[4], trm[5]);
        const size = Math.hypot(trm[0], trm[1]) * Math.hypot(ctm[0], ctm[1]);
        glyphs.push({ font: font.getName(), gid, uni, x, y, size });
      },
    });
  };

  const dev = new mupdf.Device({
    fillText: addGlyphs,
    strokeText: addGlyphs,
    fillPath(path, evenOdd, ctm) {
      const pts = [];
      let curve = false;
      path.walk({
        moveTo(x, y) { pts.push(apply(ctm, x, y)); },
        lineTo(x, y) { pts.push(apply(ctm, x, y)); },
        curveTo(x1, y1, x2, y2, x3, y3) { curve = true; pts.push(apply(ctm, x3, y3)); },
        closePath() {},
      });
      if (pts.length > 1) fills.push({ pts, curve, box: bbox(pts) });
    },
    strokePath(path, stroke, ctm) {
      const pts = [];
      let curve = false;
      path.walk({
        moveTo(x, y) { pts.push(apply(ctm, x, y)); },
        lineTo(x, y) { pts.push(apply(ctm, x, y)); },
        curveTo(x1, y1, x2, y2, x3, y3) { curve = true; pts.push(apply(ctm, x3, y3)); },
        closePath() {},
      });
      if (pts.length > 1) {
        strokes.push({ pts, curve, width: stroke.getLineWidth(), box: bbox(pts) });
      }
    },
  });
  page.toDisplayList().run(dev, mupdf.Matrix.identity);

  return {
    index, width: pw, height: ph,
    dpi, scale: s,
    pixels, pixelWidth, pixelHeight, stride,
    glyphs, fills, strokes,
  };
}

/** Valor de gris (0-255) en un punto de la pagina, con muestreo de vecindad. */
export function grayAt(page, x, y) {
  const px = Math.round(x * page.scale);
  const py = Math.round(y * page.scale);
  if (px < 0 || py < 0 || px >= page.pixelWidth || py >= page.pixelHeight) return 255;
  return page.pixels[py * page.stride + px];
}
