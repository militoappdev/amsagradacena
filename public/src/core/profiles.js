// Perfiles de fuentes musicales: que glifo es cada cosa.
// Los codigos son Unicode (estables entre documentos), no indices de glifo.

export const PROFILES = {
  sibelius: {
    id: "sibelius",
    label: "Sibelius (Opus)",
    fonts: [/^Opus/],
    heads: { 0x0153: 1, 0x02d9: 2, 0x0077: 4 }, // negra, blanca, redonda
    rests: { 0x2030: 0.5, 0x0152: 1.0, 0x2013: 2.0 }, // corchea, negra, blanca
    dots: [0x2122],
    dotFonts: [/OpusSpecial/],
    dotDy: 0.62,
    stemMethod: "stroke",
    flags: { 0x004a: 1, 0x0052: 2 },
    accidentals: { 0x0062: "b", 0x0023: "#", 0x006e: "n" },
    clefs: { 0x003f: "bass", 0x0026: "treble" }, // ? = Fa, & = Sol
    barlines: [],
    barlineMinWidth: 3.5,
    beamMethod: "polygon",
  },
  musescore: {
    id: "musescore",
    label: "MuseScore",
    fonts: [/^CIDFont/, /MScore/i],
    heads: { 0xf0cf: 1, 0xf0f6: 1, 0xf0fa: 2, 0xf077: 4 },
    rests: { 0xf0b7: 4, 0xf0ee: 2, 0xf0ce: 1, 0xf0e4: 0.5, 0xf0c5: 0.5 },
    dots: [0xf02e],
    dotFonts: [],
    dotDy: 0.42,
    flags: { 0xf04a: 1, 0xf06a: 1 },
    accidentals: { 0xf062: "b", 0xf06e: "n", 0xf063: "#" },
    clefs: { 0xf03f: "bass" },
    barlines: [0xf06c],
    beamMethod: "rects",
  },
};

/** Elige el perfil mirando las fuentes del documento. */
export function pickProfile(page) {
  const fonts = new Set(page.glyphs.map((g) => g.font));
  for (const p of Object.values(PROFILES)) {
    for (const re of p.fonts) {
      for (const f of fonts) if (re.test(f)) return p.id;
    }
  }
  return null;
}

export const NAMES = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];
export const SEMI = [0, 2, 4, 5, 7, 9, 11];

export function pitchName(idx, alter) {
  const n = NAMES[((idx % 7) + 7) % 7];
  const oct = Math.floor(idx / 7);
  const acc = alter === -1 ? "b" : alter === 1 ? "#" : "";
  return `${n}${acc}${oct}`;
}

export function midiOf(idx, alter) {
  const n = ((idx % 7) + 7) % 7;
  const oct = Math.floor(idx / 7);
  return 12 * (oct + 1) + SEMI[n] + (alter || 0);
}
