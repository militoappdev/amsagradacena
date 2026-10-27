import fs from "node:fs";
import { openDocument, readPage } from "../public/src/core/read.js";
import { analyzePage } from "../public/src/core/analyze.js";
import { playOrder } from "../public/src/core/structure.js";
const doc = openDocument(fs.readFileSync(process.argv[2]));
const page = readPage(doc, 0);
const r = analyzePage(page, {});
const o = playOrder(r, page);
console.log("compases escritos:", r.measures.length, "| tocados:", o.order.length, "| repeticiones:", o.repeats);
console.log("voltas:", o.voltas.map(v=>`${v.from+1}-${v.to+1}(n${v.n})`).join(" ") || "ninguna");
console.log("grupos:", o.groups.map(g=>`${g.from+1}..${g.to+1}x${g.n}`).join(" "));
const compact = [];
let prev = null;
for (const i of o.order) { if (prev !== null && i === prev + 1 && compact.length) { const last = compact[compact.length-1]; last.to = i+1; } else compact.push({from: i+1, to: i+1}); prev = i; }
console.log("orden:", compact.map(c=>c.from===c.to?`${c.from}`:`${c.from}-${c.to}`).join(" "));
