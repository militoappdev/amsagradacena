// Deteccion de pentagramas y utilidades de pixeles (plicas, barrados).

/** Filas de pixeles muy oscuras -> lineas del pentagrama -> sistemas. */
export function detectStaves(page) {
  const { pixels, stride, pixelWidth: w, pixelHeight: h, scale } = page;
  const rows = [];
  const limit = w * 0.45;
  for (let y = 0; y < h; y++) {
    const base = y * stride;
    let dark = 0;
    for (let x = 0; x < w; x++) if (pixels[base + x] < 200) dark++;
    if (dark > limit) rows.push(y);
  }
  // agrupar filas contiguas
  const groups = [];
  for (const y of rows) {
    const g = groups[groups.length - 1];
    if (g && y - g[g.length - 1] <= 2) g.push(y);
    else groups.push([y]);
  }
  let centers = groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length / scale);

  // rellenar lineas que falten (una linea tapada por otra cosa)
  if (centers.length > 6) {
    const gaps = [];
    for (let i = 1; i < centers.length; i++) gaps.push(centers[i] - centers[i - 1]);
    const small = gaps.filter((d) => d < 7).sort((a, b) => a - b);
    const d0 = small.length ? small[Math.floor(small.length / 2)] : 0;
    if (d0 > 2) {
      const filled = [centers[0]];
      for (let i = 1; i < centers.length; i++) {
        const d = centers[i] - centers[i - 1];
        const n = Math.round(d / d0);
        if (n >= 2 && n <= 3 && Math.abs(d / n - d0) < 0.35) {
          for (let k = 1; k < n; k++) filled.push(centers[i - 1] + (d * k) / n);
        }
        filled.push(centers[i]);
      }
      centers = filled;
    }
  }

  const staves = [];
  for (let i = 0; i + 4 < centers.length; ) {
    const c = centers.slice(i, i + 5);
    const ds = [];
    for (let k = 1; k < 5; k++) ds.push(c[k] - c[k - 1]);
    const avg = ds.reduce((a, b) => a + b, 0) / 4;
    const ok = avg > 2.5 && avg < 8 && ds.every((d) => Math.abs(d - avg) < avg * 0.2);
    if (ok) {
      // extremos horizontales del pentagrama (la linea central es la mas fiable)
      const row = Math.round(c[2] * scale);
      let xa = -1;
      let xb = -1;
      if (row >= 0 && row < h) {
        const base = row * stride;
        for (let x = 0; x < w; x++) if (pixels[base + x] < 200) { xa = x; break; }
        for (let x = w - 1; x >= 0; x--) if (pixels[base + x] < 200) { xb = x; break; }
      }
      staves.push({
        top: c[0], bottom: c[4], space: avg, lines: c, index: staves.length,
        x0: xa >= 0 ? xa / scale : 0,
        x1: xb >= 0 ? xb / scale : w / scale,
      });
      i += 5;
    } else {
      i += 1;
    }
  }
  return staves;
}

/** Bandas oscuras verticales en la columna x, entre y0 e y1 (coordenadas de pagina). */
export function bandsAt(page, x, y0, y1, thresh = 110, join = 0) {
  const { pixels, stride, pixelWidth: w, pixelHeight: h, scale } = page;
  const px = Math.round(x * scale);
  if (px < 0 || px >= w) return [];
  let a = Math.round(y0 * scale);
  let b = Math.round(y1 * scale);
  a = Math.max(0, a);
  b = Math.min(h - 1, b);
  const out = [];
  let start = -1;
  let prev = -2;
  for (let y = a; y <= b; y++) {
    const dark = pixels[y * stride + px] < thresh;
    if (dark) {
      if (start < 0) start = y;
      prev = y;
    } else if (start >= 0) {
      out.push([start / scale, prev / scale]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start / scale, prev / scale]);
  if (join <= 0) return out;
  const merged = [];
  for (const band of out) {
    const last = merged[merged.length - 1];
    if (last && band[0] - last[1] <= join) last[1] = band[1];
    else merged.push([...band]);
  }
  return merged;
}

/**
 * Plica de una nota: columna cercana a la cabeza con un tramo vertical continuo
 * que la atraviesa. Devuelve {x, end, dir} o null.
 */
export function stemOf(page, note, staff) {
  const esp = staff.space;
  let best = null;
  for (let dx = -5; dx <= 5.01; dx += 0.5) {
    const x = note.x + dx;
    for (const [a, b] of bandsAt(page, x, note.y - 4.8 * esp, note.y + 4.8 * esp, 110, 0.6)) {
      const len = b - a;
      if (len < 1.9 * esp || len > 3.95 * esp) continue;
      if (!(a - 0.5 * esp <= note.y && note.y <= b + 0.5 * esp)) continue;
      const end = note.y - a > b - note.y ? a : b;
      const score = len;
      if (!best || score > best.score) best = { x, end, dir: Math.sign(end - note.y), score };
    }
  }
  return best;
}

/** Numero de barrados por pixeles junto al extremo de la plica (port de barrados.py). */
export function pixelBeamLevels(page, staff, x, noteY, stemEnd) {
  const esp = staff.space;
  const lines = [0, 1, 2, 3, 4].map((i) => staff.bottom - i * esp);
  const yRef = stemEnd ?? noteY;
  const down = stemEnd == null || stemEnd > noteY;
  const lo = down ? yRef - esp * 0.48 : yRef - esp * 1.1;
  const hi = down ? yRef + esp * 1.1 : yRef + esp * 0.48;
  let best = 0;
  for (const dx of [-3.6, -3.1, 3.1, 3.6]) {
    let n = 0;
    for (const [a, b] of bandsAt(page, x + dx, staff.top - 22, staff.bottom + 26)) {
      const g = b - a;
      if (g < esp * 0.24 || g > esp * 0.72) continue;
      const c = (a + b) / 2;
      if (c < lo || c > hi) continue;
      if (lines.some((l) => Math.abs(c - l) < esp * 0.24 && g < esp * 0.36)) continue;
      n++;
    }
    best = Math.max(best, n);
  }
  return best;
}

/** Barrados como poligonos rellenos que cruzan la plica (port de ritmo1.nivel_barrado). */
export function polygonBeamLevels(fills, x, stemEnd, noteY, esp) {
  const down = stemEnd >= noteY;
  const lo = down ? stemEnd - 2.3 * esp : stemEnd - 0.6 * esp;
  const hi = down ? stemEnd + 0.6 * esp : stemEnd + 2.3 * esp;
  let n = 0;
  for (const f of fills) {
    const r = f.box;
    if (f.curve || r.h > 7.5 || r.w < 3.5) continue;
    if (!(r.x0 - 1.6 <= x && x <= r.x1 + 1.6)) continue;
    const xc = Math.min(Math.max(x, r.x0), r.x1);
    const ys = [];
    const pts = f.pts;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if (Math.abs(x2 - x1) > 1e-6 && (x1 - xc) * (x2 - xc) <= 0) {
        ys.push(y1 + ((xc - x1) / (x2 - x1)) * (y2 - y1));
      }
    }
    if (!ys.length) continue;
    const c = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (c >= lo && c <= hi) n++;
  }
  return n;
}

/** Barrados como rectangulos rellenos que cruzan la columna x (metodo MuseScore). */
export function rectBeamLevels(fills, x, noteY, esp) {
  const ys = new Set();
  for (const f of fills) {
    if (f.curve) continue;
    const b = f.box;
    if (b.h < esp * 0.22 || b.h > esp * 1.15) continue;
    if (b.w < esp * 1.2) continue;
    if (!(b.x0 - 2.4 <= x && x <= b.x1 + 2.4)) continue;
    if (Math.abs(b.y0 - noteY) > esp * 9) continue;
    ys.add(Math.round(b.y0 * 4) / 4);
  }
  return ys.size;
}

/** Plica dibujada como trazo vertical (Sibelius y otros). */
export function strokeStem(page, note) {
  let best = null;
  for (const st of page.strokes) {
    const b = st.box;
    if (b.w > 1.2 || b.h < 8 || b.h > 34) continue;
    if (!(b.x0 >= note.x - 1.5 && b.x0 <= note.x + 9.5)) continue;
    if (!(b.y0 - 1.5 <= note.y && note.y <= b.y1 + 1.5)) continue;
    const dist = Math.abs(b.x0 - (note.x + 0.2));
    if (!best || dist < best.dist) {
      best = {
        x: b.x0,
        end: Math.abs(b.y0 - note.y) > Math.abs(b.y1 - note.y) ? b.y0 : b.y1,
        dir: b.y1 - b.y0 > 0 ? 1 : -1,
        dist,
      };
    }
  }
  if (!best) return null;
  best.dir = Math.sign(best.end - note.y) || 1;
  return best;
}
