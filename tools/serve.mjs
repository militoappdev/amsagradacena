// Servidor estatico minimo para probar la PWA en local (sin cache del navegador).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("public");
const port = Number(process.argv[2] || 8787);
const tipos = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
};

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(root, url);
  if (url.endsWith("/")) file = path.join(file, "index.html");
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end("no encontrado"); return; }
    res.writeHead(200, {
      "Content-Type": tipos[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}).listen(port, () => console.log(`http://localhost:${port}`));
