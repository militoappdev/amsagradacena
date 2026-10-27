// Genera los iconos PNG de la PWA dibujando con pdf-lib y rasterizando con mupdf.
import fs from "node:fs";
import * as mupdf from "mupdf";
import { PDFDocument, rgb, degrees } from "pdf-lib";

const S = 512;
const marron = rgb(0.486, 0.176, 0.07);
const crema = rgb(0.973, 0.925, 0.86);
const laton = rgb(0.937, 0.663, 0.369);

/** Dibuja el icono; k < 1 deja margen (icono "maskable"). */
async function icono(k) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([S, S]);
  const cx = (x) => S / 2 + (x - S / 2) * k;
  const cy = (y) => S / 2 + (y - S / 2) * k;
  const esc = (v) => v * k;

  page.drawRectangle({ x: 0, y: 0, width: S, height: S, color: marron });
  for (const y of [168, 204, 240, 276, 312]) {
    page.drawRectangle({
      x: cx(86), y: S - cy(y) - esc(10), width: esc(340), height: esc(10), color: crema,
    });
  }
  for (const [x, y] of [[172, 240], [256, 276], [340, 204]]) {
    page.drawEllipse({ x: cx(x), y: S - cy(y), xScale: esc(33), yScale: esc(23), color: laton, rotate: degrees(18) });
  }
  for (const x of [172, 256, 340]) {
    page.drawCircle({ x: cx(x), y: S - cy(382), size: esc(17), color: crema });
  }
  return doc.save();
}

for (const [nombre, k] of [["icon-192.png", 1], ["icon-512.png", 1], ["icon-maskable-512.png", 0.78]]) {
  const bytes = await icono(k);
  const d = mupdf.Document.openDocument(bytes, "pdf");
  const tam = nombre.includes("192") ? 192 : 512;
  const pm = d.loadPage(0).toPixmap(mupdf.Matrix.scale(tam / S, tam / S), mupdf.ColorSpace.DeviceRGB, false);
  fs.writeFileSync(`public/${nombre}`, pm.asPNG());
  console.log(nombre, pm.getWidth() + "x" + pm.getHeight());
}
