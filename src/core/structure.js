// Estructura: repeticiones y casillas (1., 2.) -> orden de interpretacion.

/** Marca en cada compas si empieza/termina una repeticion. */
function markRepeats(result, page) {
  const systems = result.systems;
  // barras gruesas = signos de repeticion
  for (const s of systems) {
    s.repStart = new Set();
    s.repEnd = new Set();
    const raw = s.rawBars ?? [];
    let k = 0;
    while (k < raw.length) {
      let j = k;
      while (j + 1 < raw.length && raw[j + 1].x - raw[j].x < 9) j++;
      const group = raw.slice(k, j + 1);
      k = j + 1;
      const thick = group.filter((b) => (b.w ?? 0) >= 10);
      if (!thick.length) continue;
      const minX = Math.min(...group.map((b) => b.x));
      const t0 = thick[0].x;
      const t1 = thick[thick.length - 1].x;
      const thinRight = group.some((b) => (b.w ?? 0) < 10 && b.x > t1 + 1);
      const thinLeft = group.some((b) => (b.w ?? 0) < 10 && b.x < t0 - 1);
      // ||: (grueso a la izquierda) y :|| (grueso a la derecha); ambos = :||:
      if (thinRight) s.repStart.add(+minX.toFixed(1));
      if (thinLeft) s.repEnd.add(+minX.toFixed(1));
    }
  }

  // pasar a los compases
  const marks = result.measures.map(() => ({ start: false, end: false }));
  for (const m of result.measures) {
    const s = systems[m.system];
    const x0 = +m.x0.toFixed(1);
    const x1 = +m.x1.toFixed(1);
    if (s.repStart.has(x0)) marks[m.index].start = true;
    if (s.repEnd.has(x1)) marks[m.index].end = true;
  }
  // la ultima barra del final no es repeticion
  const last = marks[marks.length - 1];
  if (last) last.end = false;
  return marks;
}

/** Casillas (voltas): trazos horizontales encima del pentagrama. */
function findVoltas(result, page) {
  const out = [];
  for (const st of page.strokes) {
    const b = st.box;
    if (st.curve) continue;
    if (b.h > 1.6 || b.w < 15 || b.w > 400) continue;
    let si = -1;
    for (let i = 0; i < result.systems.length; i++) {
      const s = result.systems[i];
      const alto = s.top - b.y0;
      if (alto > s.space * 0.7 && alto < s.space * 6) { si = i; break; }
    }
    if (si < 0) continue;
    const s = result.systems[si];
    const centro = (b.x0 + b.x1) / 2;
    const dentro = result.measures.filter(
      (m) => m.system === si && m.x0 <= centro && m.x1 >= centro,
    );
    if (!dentro.length) continue;
    out.push({ sys: si, from: dentro[0].index, to: dentro[dentro.length - 1].index, x: b.x0 });
  }
  out.sort((a, b) => a.from - b.from);

  // agrupar casillas consecutivas
  const groups = [];
  for (const v of out) {
    const g = groups[groups.length - 1];
    if (g && v.from <= g.to + 1 && v.sys <= g.sys + 1) {
      g.n += 1;
      g.to = v.to;
      g.sys = Math.max(g.sys, v.sys);
      v.group = groups.length - 1;
      v.n = g.n;
    } else {
      groups.push({ from: v.from, to: v.to, n: 1, sys: v.sys, items: [] });
      v.group = groups.length - 1;
      v.n = 1;
    }
    groups[v.group].items.push({ from: v.from, to: v.to, n: v.n });
  }
  return { voltas: out, groups };
}

/** Orden de compases a tocar (0-based). */
export function playOrder(result, page) {
  const marks = markRepeats(result, page);
  const { voltas, groups } = findVoltas(result, page);
  const n = result.measures.length;
  const voltaAt = new Map();
  for (const v of voltas) {
    for (let m = v.from; m <= v.to; m++) {
      voltaAt.set(m, { n: v.n, group: v.group, end: groups[v.group].to });
    }
  }

  // a que compas vuelve cada repeticion
  const backTo = new Map();
  let lastStart = 0;
  for (let i = 0; i < n; i++) {
    if (marks[i].start) lastStart = i;
    if (marks[i].end) backTo.set(i, lastStart);
  }

  const order = [];
  const used = new Set();
  const jumps = new Set();
  let i = 0;
  let guard = 0;
  while (i < n && guard++ < n * 4) {
    const v = voltaAt.get(i);
    if (v) {
      const g = groups[v.group];
      if (v.n === 1 && used.has(v.group)) {
        const next = (g.items || []).find((it) => it.n === 2);
        i = next ? next.from : g.to + 1;
        continue;
      }
      if (v.n > 1 && !used.has(v.group)) { i = g.to + 1; continue; }
    }
    order.push(i);
    if (backTo.has(i) && !jumps.has(i)) {
      jumps.add(i);
      if (v) used.add(v.group);
      i = backTo.get(i);
      continue;
    }
    i += 1;
  }
  return { order, marks, voltas, groups, repeats: backTo.size };
}
