// Escritor de MIDI (SMF formato 0) sin dependencias.

function varint(n) {
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    out.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return out;
}

/**
 * events: [{ beat, dur, midi, vel }] en tiempos (negras).
 */
export function buildMidi(events, { bpm = 72, ppq = 480, program = 56, channel = 0, name = "Trombon" } = {}) {
  const ticks = (b) => Math.round(b * ppq);
  const list = [];
  for (const e of events) {
    if (e.midi == null) continue;
    const len = e.dur * (e.dur <= 1 ? 0.95 : 0.98);
    list.push({ t: ticks(e.beat), on: true, midi: e.midi, vel: e.vel ?? 96 });
    list.push({ t: ticks(e.beat + len), on: false, midi: e.midi, vel: 0 });
  }
  list.sort((a, b) => a.t - b.t || (a.on === b.on ? 0 : a.on ? -1 : 1));

  const bytes = [];
  const push = (...xs) => bytes.push(...xs);
  const str = (s) => push(...[...s].map((c) => c.charCodeAt(0)));

  const track = [];
  const tpush = (...xs) => track.push(...xs);
  const meta = (type, data) => {
    tpush(0xff, type, ...varint(data.length), ...data);
  };
  const tempo = Math.round(60000000 / bpm);
  meta(0x03, [...name].map((c) => c.charCodeAt(0)));
  meta(0x51, [(tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff]);
  meta(0x58, [4, 2, 24, 8]); // 4/4
  tpush(0x00, 0xc0 | channel, program);

  let last = 0;
  for (const ev of list) {
    const dt = ev.t - last;
    last = ev.t;
    tpush(...varint(dt));
    if (ev.on) tpush(0x90 | channel, ev.midi & 0x7f, ev.vel & 0x7f);
    else tpush(0x80 | channel, ev.midi & 0x7f, 0x40);
  }
  tpush(0x00, 0xff, 0x2f, 0x00);

  str("MThd");
  push(0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 0xff, ppq & 0xff);
  str("MTrk");
  const len = track.length;
  push((len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
  push(...track);
  return new Uint8Array(bytes);
}

/** Eventos de audio a partir del analisis (sin repeticiones). */
export function eventsFromResult(result, { bpm = 72, transpose = 0 } = {}) {
  const out = [];
  for (const n of result.notes) {
    if (n.tied) continue;
    if (n.midi == null) continue;
    out.push({ beat: n.t0, dur: n.dur, midi: n.midi + transpose, vel: n.vel ?? 96 });
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}

/** Eventos siguiendo un orden de compases (repeticiones y casillas). */
export function eventsWithOrder(result, order, { transpose = 0 } = {}) {
  const out = [];
  let t = 0;
  for (const mi of order) {
    const m = result.measures[mi];
    if (!m) continue;
    const evs = m.events.slice().sort((a, b) => a.x - b.x);
    for (const e of evs) {
      if (e.kind !== "note" || e.tied) continue;
      if (e.midi == null) continue;
      out.push({ beat: t + (e.t0 - m.t0), dur: e.dur, midi: e.midi + transpose, vel: e.vel ?? 96 });
    }
    t += m.grid ?? m.played ?? 4;
  }
  return out;
}
