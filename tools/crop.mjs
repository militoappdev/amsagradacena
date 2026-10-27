// Recorta una zona de la pagina 1 (puntos, y desde arriba) a PNG usando mupdf + sips.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { openDocument } from "../public/src/core/read.js";
import * as mupdf from "mupdf";

const [, , src, out, x0, y0, x1, y1, zoomArg] = process.argv;
const [X0, Y0, X1, Y1] = [x0, y0, x1, y1].map(Number);
const zoom = Number(zoomArg || 5);
const doc = openDocument(fs.readFileSync(src));
const page = doc.loadPage(0);
const full = "/tmp/_full.png";
fs.writeFileSync(full, page.toPixmap(mupdf.Matrix.scale(zoom, zoom), mupdf.ColorSpace.DeviceRGB, false).asPNG());
const w = Math.round((X1 - X0) * zoom);
const h = Math.round((Y1 - Y0) * zoom);
execFileSync("sips", ["-c", String(h), String(w), "--cropOffset", String(Math.round(Y0 * zoom)), String(Math.round(X0 * zoom)), full, "--out", out], { stdio: "ignore" });
console.log(out, w + "x" + h);
