// Copia las librerias del navegador desde node_modules a public/vendor.
import fs from "node:fs";
import path from "node:path";

function cp(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log("->", to);
}

const nm = "node_modules";
cp(`${nm}/mupdf/dist/mupdf.js`, "public/vendor/mupdf/mupdf.js");
cp(`${nm}/mupdf/dist/mupdf-wasm.js`, "public/vendor/mupdf/mupdf-wasm.js");
cp(`${nm}/mupdf/dist/mupdf-wasm.wasm`, "public/vendor/mupdf/mupdf-wasm.wasm");
cp(`${nm}/pdf-lib/dist/pdf-lib.esm.js`, "public/vendor/pdf-lib/pdf-lib.esm.js");
