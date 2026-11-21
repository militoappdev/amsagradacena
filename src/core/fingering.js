// Digitacion de instrumentos de viento-metal con 3 pistones (trombon, trompeta,
// corneta, tuba).
//
// Modelo fisico: el instrumento "abierto" (sin pistones) suena la serie armonica
// de su fundamental. Cada combinacion de pistones alarga el tubo y baja esa
// fundamental 1..6 semitonos. Son tocables los armonicos 2..8 de cada serie
// (se excluye el 7o, muy desafinado). Para cada nota se elige el armonico mas
// grave y, a igualdad, la combinacion con menos pistones.

const DESCENSO = { 0: 0, 2: -1, 1: -2, "1-2": -3, "2-3": -4, "1-3": -5, "1-2-3": -6 };
const ARMONICOS = [2, 3, 4, 5, 6, 8, 9, 10, 12];
const ALTURA = { 2: 12, 3: 19, 4: 24, 5: 28, 6: 31, 8: 36, 9: 38, 10: 40, 12: 43 };

const cache = new Map();

/**
 * Tabla de digitaciones para una fundamental (en nota real / concierto).
 * base: MIDI de la fundamental del instrumento abierto.
 */
export function buildTable(base) {
  if (cache.has(base)) return cache.get(base);
  const table = new Map();
  for (const [combo, desc] of Object.entries(DESCENSO)) {
    const fund = base + desc;
    for (const h of ARMONICOS) {
      const midi = fund + ALTURA[h];
      if (!table.has(midi)) table.set(midi, []);
      table.get(midi).push({ h, combo });
    }
  }
  for (const list of table.values()) {
    // el armonico mas bajo; a igualdad, menos pistones
    list.sort((a, b) => a.h - b.h || a.combo.replace(/-/g, "").length - b.combo.replace(/-/g, "").length);
  }
  cache.set(base, table);
  return table;
}

/** Pistones como array de digitos (["1","2"]) o null si la nota no existe. */
export function fingeringFor(midi, { base = 36 } = {}) {
  const t = buildTable(base);
  const best = t.get(midi);
  if (!best || !best.length) return null;
  return String(best[0].combo).split("-");
}

export function fingeringLabel(midi, opts) {
  const f = fingeringFor(midi, opts);
  return f ? f.join("-") : "—";
}

// ---------------------------------------------------------------------------
// Instrumentos
//
// base   : fundamental en nota real (concierto)
// transp : semitonos que hay que sumar a la nota escrita para obtener la real
//          (la trompeta en Sib suena una 2a mayor mas grave de lo escrito)
// clave  : clave habitual de su parte
// programa: programa General MIDI (0-127)
// ---------------------------------------------------------------------------

export const INSTRUMENTOS = [
  {
    id: "trombon-do",
    nombre: "Trombón de válvulas en Do",
    corto: "trombón en Do",
    grupo: "Trombón de válvulas",
    base: 36,
    transp: 0,
    clave: "bass",
    programa: 56,
    timbre: "trombon",
    registro: "Fa♯2 – Do5",
  },
  {
    id: "trombon-sib",
    nombre: "Trombón de válvulas en Si♭",
    corto: "trombón en Si♭",
    grupo: "Trombón de válvulas",
    base: 34,
    transp: 0,
    clave: "bass",
    programa: 56,
    timbre: "trombon",
    registro: "Fa2 – Si♭4",
  },
  {
    id: "trompeta-sib",
    nombre: "Trompeta en Si♭",
    corto: "trompeta en Si♭",
    grupo: "Trompeta",
    base: 46,
    transp: -2,
    clave: "treble",
    programa: 55,
    timbre: "trompeta",
    registro: "Fa♯3 – Do6 (escrito)",
  },
  {
    id: "trompeta-do",
    nombre: "Trompeta en Do",
    corto: "trompeta en Do",
    grupo: "Trompeta",
    base: 48,
    transp: 0,
    clave: "treble",
    programa: 55,
    timbre: "trompeta",
    registro: "Fa♯3 – Do6",
  },
  {
    id: "corneta-sib",
    nombre: "Corneta en Si♭",
    corto: "corneta en Si♭",
    grupo: "Corneta",
    base: 46,
    transp: -2,
    clave: "treble",
    programa: 55,
    timbre: "corneta",
    registro: "Fa♯3 – Do6 (escrito)",
  },
  {
    id: "tuba-do",
    nombre: "Tuba en Do",
    corto: "tuba en Do",
    grupo: "Tuba",
    base: 24,
    transp: 0,
    clave: "bass",
    programa: 57,
    timbre: "tuba",
    registro: "Fa♯1 – Sol4",
  },
  {
    id: "tuba-sib",
    nombre: "Tuba en Si♭",
    corto: "tuba en Si♭",
    grupo: "Tuba",
    base: 22,
    transp: 0,
    clave: "bass",
    programa: 57,
    timbre: "tuba",
    registro: "Fa1 – Fa4",
  },
];

export const INSTRUMENTO_POR_DEFECTO = "trombon-do";

export function instrumento(id) {
  return INSTRUMENTOS.find((i) => i.id === id) || INSTRUMENTOS[0];
}

/**
 * Digitacion de una nota ESCRITA en la partitura.
 * @param {number} escrito MIDI tal como suena al leer la clave (sin transponer)
 */
export function digitacionDe(escrito, inst) {
  if (escrito == null) return null;
  const real = escrito + (inst.transp || 0);
  return fingeringFor(real, { base: inst.base });
}

/** Nota que suena (MIDI real) para una nota escrita. */
export function notaReal(escrito, inst) {
  return escrito + (inst.transp || 0);
}

/** Texto de la digitacion: "0", "1", "2-3"... */
export function etiqueta(escrito, inst) {
  const f = digitacionDe(escrito, inst);
  return f ? f.join("-") : "—";
}
