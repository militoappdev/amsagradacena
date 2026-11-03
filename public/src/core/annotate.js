// Anotacion del PDF con la digitacion (pdf-lib).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { digitacionDe, instrumento } from "./fingering.js";

const FS = 6.4;
const LEAD = 6.3;
const BANDA = 12.0; // linea base del primer digito, medida desde la linea inferior
const ANCHO_DIG = 3.7;
const TOPE_VIGA = 6; // descenso maximo extra para esquivar vigas
const MARGEN = 1.4;

const intersects = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Bounding box real de la tinta de un glifo, calculado sobre el raster de la
 * pagina. Devuelve null si no hay tinta o si probablemente cogio una linea del
 * pentagrama (ancho excesivo).
 */
function tintaGlifo(g, page) {
  const s = page.dpi / 72;
  const pad = g.size * 0.7;
  const x0 = Math.max(0, Math.floor((g.x - pad) * s));
  const x1 = Math.min(page.pixelWidth - 1, Math.ceil((g.x + pad) * s));
  const y0 = Math.max(0, Math.floor((g.y - g.size * 0.9) * s));
  const y1 = Math.min(page.pixelHeight - 1, Math.ceil((g.y + g.size * 0.4) * s));
  const px = page.pixels;
  const stride = page.stride;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, cnt = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (px[y * stride + x] < 128) { cnt++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  if (cnt < 5) return null;
  const w = (maxX - minX + 1) / s;
  if (w > pad * 2 * 0.95) return null; // linea del pentagrama u otro trazo largo
  return { x0: minX / s, x1: (maxX + 1) / s, y0: minY / s, y1: (maxY + 1) / s };
}

/**
 * Desnivel extra por sistema para que los digitos no queden tapados por las
 * vigas (barras de corcheas) que cuelgan por debajo del pentagrama.
 */
function desnivelPorVigas(systems, page) {
  const extra = systems.map(() => 0);
  for (const f of page.fills || []) {
    const b = f.box;
    if (!b) continue;
    const alto = b.y1 - b.y0;
    if (alto < 1.6 || alto > 22) continue; // solo trazos gruesos (vigas, barras)
    const i = systems.findIndex((s) => b.y0 >= s.bottom - 1 && b.y1 <= s.bottom + 18);
    if (i < 0) continue;
    const tope = systems[i].bottom + BANDA - FS * 0.8;
    if (b.y1 > tope - 1) extra[i] = Math.max(extra[i], Math.min(TOPE_VIGA, b.y1 + MARGEN - tope));
  }
  return extra;
}

/** Calcula la posicion de cada etiqueta (sin dibujar). */
export function layoutLabels(result, page, { instrumento: inst = "trombon-do" } = {}) {
  const ins = typeof inst === "string" ? instrumento(inst) : inst;
  const font = { widthOfTextAtSize: (t, s) => s * 0.56 }; // aproximacion Helvetica-Bold
  const obstacles = [];
  const musicFonts = new Set(page.glyphs.filter((g) => result.profile.heads[g.uni] !== undefined).map((g) => g.font));
  for (const g of page.glyphs) {
    if (musicFonts.has(g.font)) continue;
    if (g.size < 4) continue;
    const ink = tintaGlifo(g, page);
    const box = ink || { x0: g.x - 0.8, x1: g.x + g.size * 0.5, y0: g.y - g.size * 0.8, y1: g.y + g.size * 0.3 };
    obstacles.push({ x0: box.x0, x1: box.x1, y0: box.y0, y1: box.y1, texto: true });
  }
  // Las vigas bajas (notas graves) tambien pueden tapar los digitos.
  for (const f of page.fills || []) {
    const b = f.box;
    if (!b) continue;
    const alto = b.y1 - b.y0;
    if (alto < 1.5 || alto > 22 || b.x1 - b.x0 < 2) continue;
    obstacles.push({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, texto: false });
  }

  const labels = [];
  const systems = result.systems;
  const extra = desnivelPorVigas(systems, page);
  for (const n of result.notes) {
    const f = digitacionDe(n.midi, ins);
    if (!f) continue;
    const sys = systems[n.sys];
    const baseY = sys.bottom + BANDA + (extra[n.sys] || 0);
    const ancho = ANCHO_DIG;
    const alto = f.length * LEAD;
    let r = {
      x0: n.x - ancho / 2 - 0.4, x1: n.x + ancho / 2 + 0.4,
      y0: baseY - FS * 0.8, y1: baseY + alto,
    };
    const next = systems[n.sys + 1];
    const limite = next ? next.top - 4 : page.height - 14;
    for (let k = 0; k < 6; k++) {
      const hit = obstacles.filter((o) => intersects(r, o));
      if (!hit.length) break;
      // Un caracter suelto (matiz, tresillo, cifra) se esquiva a un lado; una
      // viga o un bloque ancho, bajando la etiqueta.
      if (hit.every((o) => o.texto)) {
        const der = Math.max(...hit.map((o) => o.x1 + 1.2 - r.x0));
        const izq = Math.min(...hit.map((o) => o.x0 - 1.2 - r.x1));
        const libres = [der, izq].filter(
          (d) => Math.abs(d) <= 9 && r.x0 + d >= 2 && r.x1 + d <= page.width - 4
        );
        if (libres.length) {
          const dx = libres.sort((a, b) => Math.abs(a) - Math.abs(b))[0];
          r = { x0: r.x0 + dx, x1: r.x1 + dx, y0: r.y0, y1: r.y1 };
          continue;
        }
      }
      const dy = Math.max(...hit.map((o) => o.y1 + 1 - r.y0));
      if (r.y1 + dy > limite) break;
      r = { x0: r.x0, x1: r.x1, y0: r.y0 + dy, y1: r.y1 + dy };
    }
    for (let k = 0; k < 6; k++) {
      const hit = labels.filter((l) => l.sys === n.sys && intersects(l.rect, r));
      if (!hit.length) break;
      if (r.y1 + 3.2 > limite) break;
      r = { x0: r.x0, x1: r.x1, y0: r.y0 + 3.2, y1: r.y1 + 3.2 };
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
