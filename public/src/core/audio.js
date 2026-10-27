// Sintesis de trombon con WebAudio (sin muestras externas) y exportacion a WAV.

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Respuesta al impulso para la reverberacion (ruido que se apaga). */
function impulse(ctx, seconds = 1.7, decay = 2.4) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 40 ? i / 40 : 1);
  }
  return buf;
}

/** Espectro de trombon (onda periodica cacheada por contexto). */
const WAVES = new WeakMap();
function brassWave(ctx) {
  let w = WAVES.get(ctx);
  if (w) return w;
  const N = 26;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    let a = 1 / Math.pow(n, 1.12);
    if (n >= 4 && n <= 9) a *= 1.3; // formante de la campana
    if (n % 2 === 0) a *= 0.82;
    imag[n] = a;
  }
  w = ctx.createPeriodicWave(real, imag);
  WAVES.set(ctx, w);
  return w;
}

const RUIDOS = new WeakMap();
function noiseBuffer(ctx) {
  let b = RUIDOS.get(ctx);
  if (b) return b;
  const len = Math.floor(ctx.sampleRate * 0.05);
  b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
  }
  RUIDOS.set(ctx, b);
  return b;
}

/** Una nota de trombon: onda armonica + sierra desafinada, filtro con envolvente, ataque de lengua. */
function tromboneNote(ctx, out, t, dur, midi, vel, reg) {
  const f = midiToFreq(midi);
  const v = Math.max(0.05, Math.min(1, (vel ?? 96) / 127));
  const peak = 0.26 * (0.45 + v * 0.75);
  const atk = 0.026 + 0.02 * (1 - v);
  const rel = 0.075;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + atk);
  gain.gain.linearRampToValueAtTime(peak * 0.78, t + atk + 0.1);
  const sus = Math.max(t + atk + 0.12, t + dur - rel);
  gain.gain.setValueAtTime(peak * 0.74, sus);
  gain.gain.linearRampToValueAtTime(0.0001, t + dur + rel);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 1.05;
  const brillo = 620 + 2500 * v;
  lp.frequency.setValueAtTime(brillo * 0.4, t);
  lp.frequency.linearRampToValueAtTime(brillo, t + 0.07);
  lp.frequency.linearRampToValueAtTime(brillo * 0.62, t + Math.max(0.1, dur * 0.8));

  const forma = ctx.createBiquadFilter();
  forma.type = "peaking";
  forma.frequency.value = 1150;
  forma.Q.value = 1.2;
  forma.gain.value = 4.5;

  const onda = brassWave(ctx);
  const oscs = [];
  for (const [det, g] of [[0, 1], [8, 0.42]]) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(onda);
    o.frequency.value = f;
    o.detune.value = det;
    const gg = ctx.createGain();
    gg.gain.value = g;
    o.connect(gg).connect(lp);
    o.start(t);
    o.stop(t + dur + rel + 0.02);
    oscs.push(o);
    reg?.push(o);
  }

  // vibrato suave en notas largas
  if (dur > 0.55) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.1;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(5, t + Math.min(0.45, dur * 0.5));
    lfo.connect(lg);
    for (const o of oscs) lg.connect(o.detune);
    lfo.start(t);
    lfo.stop(t + dur);
    reg?.push(lfo);
  }

  // ataque de lengua
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = Math.min(6000, Math.max(900, f * 4));
  bp.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.value = 0.055 * (0.5 + v * 0.6);
  src.connect(bp).connect(ng).connect(gain);
  src.start(t);
  src.stop(t + 0.06);
  reg?.push(src);

  lp.connect(forma).connect(gain).connect(out);
}

/** Conecta la salida de las notas a destino + reverb. */
function busGraph(ctx, { reverb = 0.16 } = {}) {
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = reverb;
  conv.connect(wet).connect(master);

  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(master);
  bus.connect(conv);
  return bus;
}

/** Duracion en segundos de una lista de eventos. */
export function eventsDuration(events, bpm) {
  return (events.reduce((m, e) => Math.max(m, e.beat + e.dur), 0) * 60) / bpm;
}

/** Renderiza a un AudioBuffer (offline) para exportar el WAV. */
export async function renderBuffer(events, { bpm = 72, sampleRate = 24000, channels = 1, tail = 2.2, reverb = 0.16 } = {}) {
  const seconds = eventsDuration(events, bpm) + tail;
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(channels, Math.ceil(seconds * sampleRate), sampleRate);
  const bus = busGraph(ctx, { reverb });
  const spb = 60 / bpm;
  for (const e of events) {
    if (e.midi == null) continue;
    tromboneNote(ctx, bus, e.beat * spb, Math.max(0.06, e.dur * spb), e.midi, e.vel);
  }
  return ctx.startRendering();
}

/** WAV 16 bits a partir de un AudioBuffer. */
export function wavFromBuffer(buf) {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const sr = buf.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  data.setUint32(4, 36 + len * ch * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, sr, true);
  data.setUint32(28, sr * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  str(36, "data");
  data.setUint32(40, len * ch * 2, true);
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(data.buffer);
}

/** Reproductor en vivo: suena al instante, sin renderizar el WAV. */
export class Player {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.verb = null;
    this.bus = null;
    this.reg = [];
    this.offset = 0;
    this.startedAt = 0;
  }

  /** Crea el contexto (llamalo dentro de un gesto del usuario). */
  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.verb = this.ctx.createConvolver();
      this.verb.buffer = impulse(this.ctx, 1.5, 2.6);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.16;
      this.verb.connect(wet).connect(this.master);
    }
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  get playing() {
    return !!this.bus;
  }

  /** Posicion actual en segundos. */
  get position() {
    if (!this.bus) return this.offset;
    return this.offset + Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  play(events, { bpm = 72, from = 0 } = {}) {
    const ctx = this.ensure();
    this.halt();
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(this.master);
    bus.connect(this.verb);
    this.bus = bus;
    this.offset = from;
    const t0 = ctx.currentTime + 0.09;
    this.startedAt = t0;
    const spb = 60 / bpm;
    const reg = [];
    for (const e of events) {
      if (e.midi == null || e.beat + e.dur <= from) continue;
      tromboneNote(ctx, bus, t0 + Math.max(0, e.beat - from) * spb, Math.max(0.06, e.dur * spb), e.midi, e.vel, reg);
    }
    this.reg = reg;
  }

  /** Corta el sonido conservando la posicion. */
  halt() {
    if (this.bus) this.offset = this.position;
    for (const n of this.reg) {
      try { n.stop(0); } catch { /* ya parado */ }
    }
    this.reg = [];
    if (this.bus) {
      try { this.bus.disconnect(); } catch { /* ya desconectado */ }
      this.bus = null;
    }
  }

  pause() {
    this.halt();
  }

  stop() {
    this.halt();
    this.offset = 0;
  }

  seek(sec) {
    this.offset = Math.max(0, sec);
  }
}
