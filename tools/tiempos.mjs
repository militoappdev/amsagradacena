import fs from "node:fs";
import { openDocument, readPage } from "../public/src/core/read.js";
import { analyzePage } from "../public/src/core/analyze.js";
import { playOrder } from "../public/src/core/structure.js";
import { buildMidi } from "../public/src/core/midi.js";
for (const [f, bpm] of [["/Users/emilio/Downloads/Alma de Dios Tromb2.pdf", 71], ["/Users/emilio/Downloads/EN EL NOMBRE DEL PADRE - TROMBON 2.pdf", 72]]) {
  const doc = openDocument(fs.readFileSync(f));
  const page = readPage(doc, 0);
  const r = analyzePage(page, {});
  const o = playOrder(r, page);
  const t1 = (r.totalBeats / bpm) * 60;
  const conRepes = (o.order.reduce((s, i) => s + (r.measures[i].grid ?? 4), 0) / bpm) * 60;
  const mm = Math.floor(t1 / 60), ss = Math.round(t1 % 60);
  const mm2 = Math.floor(conRepes / 60), ss2 = Math.round(conRepes % 60);
  console.log(`${f.split("/").pop()}: ${r.totalBeats} tiempos | sin repes ${mm}:${String(ss).padStart(2,"0")} | con repes ${mm2}:${String(ss2).padStart(2,"0")} (${o.order.length} compases)`);
}
