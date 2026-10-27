// Anotacion del PDF con la digitacion (pdf-lib).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { digitacionDe, instrumento } from "./fingering.js";

const FS = 6.4;
const LEAD = 6.3;
const BANDA = 7.8;
const ANCHO_DIG = 3.7;
const HUECO = 2.8;

const intersects = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Calcula la posicion de cada etiqueta (sin dibujar). */
export function layoutLabels(result, page, { instrumento: inst = "trombon-do" } = {}) {
  const ins = typeof inst === "string" ? instrumento(inst) : inst;
  const font = { widthOfTextAtSize: (t, s) => s * 0.56 }; // aproximacion Helvetica-Bold
  const obstacles = [];
  const musicFonts = new Set(page.glyphs.filter((g) => result.profile.heads[g.uni] !== undefined).map((g) => g.font));
  for (const g of page.glyphs) {
    if (musicFonts.has(g.font)) continue;
    if (g.size < 4) continue;
    obstacles.push({
      x0: g.x - 1, x1: g.x + g.size * 0.65,
      y0: g.y - g.size * 0.8, y1: g.y + g.size * 0.3,
    });
  }

  const labels = [];
  const systems = result.systems;
  for (const n of result.notes) {
    const f = digitacionDe(n.midi, ins);
    if (!f) continue;
    const sys = systems[n.sys];
    const baseY = sys.bottom + BANDA;
    const ancho = ANCHO_DIG;
    const alto = f.length * LEAD;
    let r = {
      x0: n.x - ancho / 2 - 0.4, x1: n.x + ancho / 2 + 0.4,
      y0: baseY - FS * 0.8, y1: baseY + alto,
    };
    const next = systems[n.sys + 1];
    const limite = next ? next.top - 4 : sys.bottom + 26;
    for (let k = 0; k < 4; k++) {
      const hit = obstacles.filter((o) => intersects(r, o));
      if (!hit.length) break;
      const dy = Math.max(...hit.map((o) => o.y1 + 1 - r.y0));
      if (r.y1 + dy <= limite) {
        r = { x0: r.x0, x1: r.x1, y0: r.y0 + dy, y1: r.y1 + dy };
        continue;
      }
      let dx = Math.max(...hit.map((o) => o.x1 + 1.2 - r.x0));
      if (r.x1 + dx > 800) dx = Math.min(...hit.map((o) => o.x0 - 1.2 - r.x1));
      r = { x0: r.x0 + dx, x1: r.x1 + dx, y0: r.y0, y1: r.y1 };
    }
    for (let k = 0; k < 6; k++) {
      const hit = labels.filter((l) => l.sys === n.sys && intersects(l.rect, r));
      if (!hit.length) break;
      r = { x0: r.x0, x1: r.x1, y0: r.y0 + 2.6, y1: r.y1 + 2.6 };
    }
    labels.push({ sys: n.sys, rect: r, digits: f, note: n });
  }
  return labels;
}

/** Devuelve los bytes del PDF anotado. */
export async function annotatePdf(pdfBytes, result, page, opts = {}) {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageObj = doc.getPage(0);
  const h = pageObj.getHeight();
  const labels = layoutLabels(result, page, opts);

  for (const l of labels) {
    const r = l.rect;
    const baseY = r.y0 + FS * 0.8; // linea base del primer digito (coordenadas top-left)
    l.digits.forEach((d, j) => {
      const w = font.widthOfTextAtSize(d, FS);
      pageObj.drawText(d, {
        x: r.x0 + 0.4 + (ANCHO_DIG - w) / 2,
        y: h - (baseY + j * LEAD),
        size: FS,
        font,
        color: rgb(0, 0, 0),
      });
    });
  }
  return { bytes: await doc.save(), labels };
}
