// Analisis de una pagina de partitura: notas, duraciones, compases y alturas.
import { detectStaves, stemOf, strokeStem, pixelBeamLevels, polygonBeamLevels, rectBeamLevels } from "./staves.js";
import { PROFILES, pickProfile, pitchName, midiOf, NAMES } from "./profiles.js";

const ALT = { b: -1, "#": 1, n: 0 };

export function analyzePage(page, opts = {}) {
  const profileId = opts.profileId || pickProfile(page);
  const profile = PROFILES[profileId];
  if (!profile) throw new Error("No reconozco la fuente musical de este PDF (prueba a elegir el programa de origen).");

  const warnings = [];
  const systems = detectStaves(page);
  if (!systems.length) throw new Error("No se han encontrado pentagramas en el PDF.");

  const systemOfY = (y) => {
    let bi = -1;
    let bd = Infinity;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      const d = y < s.top ? s.top - y : y > s.bottom ? y - s.bottom : 0;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi >= 0 && bd <= systems[bi].space * 6.5 ? bi : -1;
  };

  // ----- barras de compas -------------------------------------------------
  for (const s of systems) {
    const raw = [];
    for (const st of page.strokes) {
      const b = st.box;
      if (b.w > 2.6) continue;
      if (st.width < (profile.barlineMinWidth ?? 0)) continue;
      if (b.h < s.space * 3.85) continue;
      if (b.y0 > s.top + s.space * 0.9 || b.y1 < s.bottom - s.space * 0.9) continue;
      raw.push({ x: b.x0, w: st.width });
    }
    if (profile.barlines.length) {
      for (const g of page.glyphs) {
        if (!profile.barlines.includes(g.uni)) continue;
        if (Math.abs(g.y - s.bottom) > s.space * 1.5) continue;
        raw.push({ x: g.x, w: 0 });
      }
    }
    raw.sort((a, b) => a.x - b.x);
    const merged = [];
    for (const it of raw) {
      if (!merged.length || it.x - merged[merged.length - 1] >= 9) merged.push(it.x);
    }
    const bars = merged;
    // los extremos del pentagrama tambien son barras (la inicial suele no dibujarse)
    if (!merged.length || Math.abs(merged[0] - s.x0) > 15) merged.unshift(s.x0);
    if (!merged.length || Math.abs(merged[merged.length - 1] - s.x1) > 15) merged.push(s.x1);
    s.bars = merged;
    s.rawBars = raw;
  }

  // ----- glifos -----------------------------------------------------------
  const events = [];
  const flags = [];
  const dots = [];
  const accidentals = [];
  const heads = [];

  for (const g of page.glyphs) {
    const uni = g.uni;
    if (profile.heads[uni] !== undefined) {
      const e = { kind: "note", x: g.x, y: g.y, sys: systemOfY(g.y), dur: profile.heads[uni], glyph: uni };
      events.push(e);
      heads.push(g);
    } else if (profile.rests[uni] !== undefined) {
      events.push({ kind: "rest", x: g.x, y: g.y, sys: systemOfY(g.y), dur: profile.rests[uni], glyph: uni });
    } else if (profile.flags[uni] !== undefined) {
      flags.push({ x: g.x, y: g.y, sys: systemOfY(g.y), levels: profile.flags[uni] });
    } else if (
      profile.dots.includes(uni) &&
      (!profile.dotFonts.length || profile.dotFonts.some((re) => re.test(g.font)))
    ) {
      dots.push({ x: g.x, y: g.y, sys: systemOfY(g.y) });
    } else if (profile.accidentals[uni] && profile.fonts.some((re) => re.test(g.font))) {
      accidentals.push({ x: g.x, y: g.y, sys: systemOfY(g.y), type: profile.accidentals[uni] });
    }
  }

  const musicFonts = new Set(heads.map((g) => g.font));

  // ----- pentagrama y altura ---------------------------------------------
  const clefBase = systems.map(() => 18); // linea inferior = Sol2 (clave de Fa)
  for (const g of page.glyphs) {
    const c = profile.clefs[g.uni];
    if (!c) continue;
    const si = systemOfY(g.y);
    if (si < 0) continue;
    if (c === "treble") clefBase[si] = 30;
    else if (c === "alto") clefBase[si] = 24;
  }

  for (const e of events) {
    if (e.sys < 0) continue;
    const s = systems[e.sys];
    e.idx = clefBase[e.sys] + Math.round((s.bottom - e.y) / (s.space / 2));
  }

  // ----- figura y barrados ------------------------------------------------
  const beamMethod = opts.beamMethod || profile.beamMethod;
  for (const e of events) {
    if (e.kind !== "note" || e.sys < 0) continue;
    const s = systems[e.sys];
    if (e.dur >= 2) continue;
    const stem = profile.stemMethod === "stroke" ? strokeStem(page, e) ?? stemOf(page, e, s) : stemOf(page, e, s);
    let levels = 0;
    if (beamMethod === "polygon" && stem) {
      levels = polygonBeamLevels(page.fills, stem.x, stem.end, e.y, s.space);
    } else if (beamMethod === "rects") {
      levels = rectBeamLevels(page.fills, stem ? stem.x : e.x, e.y, s.space);
    } else if (stem) {
      levels = pixelBeamLevels(page, s, stem.x, e.y, stem.end);
    } else {
      levels = pixelBeamLevels(page, s, e.x, e.y, null);
    }
    const fx = stem ? stem.x : e.x;
    for (const f of flags) {
      if (f.sys !== e.sys) continue;
      if (Math.abs(f.x - fx) < s.space * 1.3 && Math.abs(f.y - e.y) < s.space * 4.5) {
        levels = Math.max(levels, f.levels);
      }
    }
    if (levels > 0) {
      e.dur *= 0.5 ** Math.min(levels, 3);
      e.levels = levels;
    }
    e.stem = stem;
  }

  // ----- puntillos --------------------------------------------------------
  for (const e of events) {
    if (e.kind !== "note" || e.sys < 0) continue;
    const s = systems[e.sys];
    let n = 0;
    const dyMax = s.space * (profile.dotDy ?? 0.45);
    for (const d of dots) {
      if (d.sys !== e.sys) continue;
      const dx = d.x - e.x;
      if (dx > s.space * 0.45 && dx < s.space * 3.3 && Math.abs(d.y - e.y) < dyMax) n++;
    }
    if (n > 0) {
      n = Math.min(n, 2);
      e.dur *= 1 + 0.5 + (n === 2 ? 0.25 : 0);
      e.dots = n;
    }
  }

  // ----- tresillos --------------------------------------------------------
  const tupletDigits = page.glyphs.filter(
    (g) => [0x33, 0x35, 0x36, 0x37].includes(g.uni) && g.size < 12 && !musicFonts.has(g.font),
  );
  for (const d of tupletDigits) {
    const si = systemOfY(d.y);
    if (si < 0) continue;
    const s = systems[si];
    if (d.x < s.bars[0] + 20) continue; // numeros de compas al principio
    const dist = d.y < s.top ? s.top - d.y : d.y > s.bottom ? d.y - s.bottom : 0;
    if (dist > s.space * 7) continue;
    // los numeros de compas van casi pegados por encima; los tresillos, mas lejos
    if (d.y < s.top && dist < s.space * 1.2) continue;
    const near = events.filter(
      (e) => e.kind === "note" && e.sys === si && Math.abs(e.x - d.x) < s.space * 4.5 && e.dur <= 0.6,
    );
    if (near.length < 2) continue;
    const ratio = d.uni === 0x33 ? 2 / 3 : d.uni === 0x35 ? 4 / 5 : d.uni === 0x36 ? 2 / 3 : 4 / 7;
    for (const e of near) {
      e.dur *= ratio;
      e.tuplet = d.uni - 0x30;
    }
  }

  // ----- armadura ---------------------------------------------------------
  const keys = systems.map(() => ({ type: null, letters: new Set() }));
  const firstX = systems.map((_, i) => {
    const xs = events.filter((e) => e.sys === i).map((e) => e.x);
    return xs.length ? Math.min(...xs) : Infinity;
  });
  for (const a of accidentals) {
    if (a.sys < 0) continue;
    const s = systems[a.sys];
    if (!(a.x < firstX[a.sys] - 4)) continue;
    if (a.y < s.top - 2 || a.y > s.bottom + 2) continue;
    const idx = clefBase[a.sys] + Math.round((s.bottom - a.y) / (s.space / 2));
    keys[a.sys].letters.add(NAMES[((idx % 7) + 7) % 7]);
    keys[a.sys].type = a.type;
  }

  for (const a of accidentals) {
    if (a.sys < 0) continue;
    a.inKey = a.x < firstX[a.sys] - 4;
    if (a.inKey) continue;
    const cand = events
      .filter((e) => e.kind === "note" && e.sys === a.sys && Math.abs(e.y - a.y) < 1.0 && e.x - a.x > 1 && e.x - a.x < 8)
      .sort((p, q) => p.x - q.x);
    if (!cand.length) {
      warnings.push(`Alteracion sin nota en x=${a.x.toFixed(1)}`);
      continue;
    }
    cand[0].acc = a.type;
  }

  // ----- compases ---------------------------------------------------------
  systems.forEach((s, si) => {
    s.measures = [];
    const n = Math.max(1, s.bars.length - 1);
    for (let m = 0; m < n; m++) {
      s.measures.push({
        system: si, local: m, index: -1,
        x0: s.bars[m], x1: s.bars[m + 1] ?? Infinity, events: [],
      });
    }
  });

  const measureOf = (e) => {
    const s = systems[e.sys];
    let m = 0;
    for (let i = 0; i < s.measures.length; i++) if (e.x - 0.6 >= s.measures[i].x0) m = i;
    return s.measures[m];
  };

  for (const e of events) {
    if (e.sys < 0) continue;
    const mm = measureOf(e);
    e.measureRef = mm;
    mm.events.push(e);
    // alteracion efectiva
    const keyAlt = keys[e.sys].letters.has(NAMES[((e.idx % 7) + 7) % 7]) ? (keys[e.sys].type === "#" ? 1 : -1) : 0;
    e.alter = e.acc !== undefined ? ALT[e.acc] ?? 0 : keyAlt;
  }

  // fuera compases vacios en los extremos de cada sistema (margenes, barras de repeticion)
  for (const s of systems) {
    while (s.measures.length && !s.measures[0].events.length) s.measures.shift();
    while (s.measures.length && !s.measures[s.measures.length - 1].events.length) s.measures.pop();
  }
  const measures = [];
  for (const s of systems) {
    for (const [i, m] of s.measures.entries()) {
      m.local = i;
      m.index = measures.length;
      measures.push(m);
    }
  }
  for (const e of events) if (e.measureRef) e.measure = e.measureRef.index;

  // arrastre del accidental dentro del compas
  for (const mm of measures) {
    const fixed = new Map();
    for (const e of mm.events.slice().sort((a, b) => a.x - b.x)) {
      if (e.kind !== "note") continue;
      if (e.acc !== undefined) fixed.set(e.idx, ALT[e.acc] ?? 0);
      else if (fixed.has(e.idx)) e.alter = fixed.get(e.idx);
    }
  }

  // nombre y MIDI
  for (const e of events) {
    if (e.kind !== "note" || e.sys < 0) continue;
    e.name = pitchName(e.idx, e.alter);
    e.midi = midiOf(e.idx, e.alter);
  }

  // ----- ajuste de silencios y validacion ---------------------------------
  const beats = opts.beats ?? 4;
  for (const mm of measures) {
    const evs = mm.events;
    const notesDur = evs.filter((e) => e.kind === "note").reduce((a, e) => a + e.dur, 0);
    const rests = evs.filter((e) => e.kind === "rest");
    const restDur = rests.reduce((a, e) => a + e.dur, 0);
    const total = notesDur + restDur;
    if (Math.abs(total - beats) < 1e-6) continue;
    if (rests.length && restDur > 0) {
      const f = (beats - notesDur) / restDur;
      for (const r of rests) r.dur *= f;
    } else if (!rests.length) {
      warnings.push(`Compas ${mm.index + 1}: suma ${total.toFixed(2)} tiempos (sin silencios)`);
    }
    mm.adjusted = true;
  }
  for (const mm of measures) mm.total = mm.events.reduce((a, e) => a + e.dur, 0);

  for (const e of events) e.slot = e.dur;

  // ----- ligaduras --------------------------------------------------------
  // una ligadura de union es corta (una slur melodica ocupa mas y une notas distintas)
  const curves = [...page.fills, ...page.strokes].filter(
    (p) => p.curve && p.box.w > 6 && p.box.w < 45 && p.box.h < 11,
  );
  const notes = events.filter((e) => e.kind === "note" && e.sys >= 0);
  let ties = 0;
  for (const c of curves) {
    const b = c.box;
    const sysC = systemOfY((b.y0 + b.y1) / 2) >= 0 ? systemOfY((b.y0 + b.y1) / 2) : systemOfY(b.y1 + 2);
    const esp = sysC >= 0 ? systems[sysC].space : 4.5;
    const tol = esp * 1.35;
    const near = (x, y) =>
      notes
        .filter((e) => e.sys === sysC && Math.abs(e.x - x) < 7 && e.y > y - tol && e.y < y + tol)
        .sort((p, q) => Math.abs(p.x - x) - Math.abs(q.x - x))[0];
    const left = near(b.x0, (b.y0 + b.y1) / 2);
    const right = near(b.x1, (b.y0 + b.y1) / 2);
    if (!left || !right || left === right) continue;
    if (left.idx !== right.idx || right.x <= left.x) continue;
    if (right.tied) continue;
    // la ligadura de union repite la misma altura
    if (left.midi != null && right.midi != null && left.midi !== right.midi) continue;
    left.dur += right.dur;
    right.tied = true;
    ties++;
  }

  // ----- linea de tiempo --------------------------------------------------
  let t = 0;
  for (let k = 0; k < measures.length; k++) {
    const mm = measures[k];
    mm.t0 = t;
    const evs = mm.events.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    let local = 0;
    let i = 0;
    while (i < evs.length) {
      let j = i;
      while (j + 1 < evs.length && Math.abs(evs[j + 1].x - evs[i].x) < 0.6) j++;
      const group = evs.slice(i, j + 1);
      const step = Math.max(...group.map((e) => e.slot));
      for (const e of group) { e.t0 = t + local; e.chord = group; }
      local += step;
      i = j + 1;
    }
    mm.played = local;
    // si un compas no cuadra (lectura dudosa) no arrastramos el desfase al resto:
    // el reloj avanza el pulso esperado. El primero (anacrusa) y el ultimo se respetan.
    const borde = k === 0 || k === measures.length - 1;
    mm.grid = borde || Math.abs(local - beats) > 2 ? local : beats;
    t += mm.grid;
  }

  const badMeasures = measures.filter((m) => Math.abs(m.played - beats) > 1e-6);
  if (badMeasures.length) {
    warnings.push(`${badMeasures.length} compas(es) no suman ${beats} tiempos: ${badMeasures.slice(0, 8).map((m) => m.index + 1).join(", ")}`);
  }

  return {
    profileId,
    profile,
    systems,
    measures,
    events,
    notes,
    ties,
    keys,
    totalBeats: t,
    warnings,
  };
}

export { pitchName, midiOf };
