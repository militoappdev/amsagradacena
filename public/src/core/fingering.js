// Digitacion de trombon de valvulas (3 pistones).
// El instrumento puede estar afinado en Do (base Do2 = 36) o en Sib (base 34).

const DESCENSO = { 0: 0, 2: -1, 1: -2, "1-2": -3, "2-3": -4, "1-3": -5, "1-2-3": -6 };
const ARMONICOS = [2, 3, 4, 5, 6, 8]; // se excluye el 7o (muy desafinado)
const ALTURA = { 2: 12, 3: 19, 4: 24, 5: 28, 6: 31, 8: 36 };

const cache = new Map();

export function buildTable(baseMidi) {
  if (cache.has(baseMidi)) return cache.get(baseMidi);
  const table = new Map();
  for (const [combo, desc] of Object.entries(DESCENSO)) {
    const fund = baseMidi + desc;
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
  cache.set(baseMidi, table);
  return table;
}

/** Devuelve los pistones como array de digitos (ej. ["1","2"]) o null. */
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
