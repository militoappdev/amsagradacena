// Service worker: siempre intenta la red y guarda copia; sin conexion usa la cache.
const CACHE = "digitado-v8";
const SHELL = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest", "./icon.svg",
  "./icon-192.png", "./icon-512.png",
  "./src/main.js",
  "./src/core/read.js", "./src/core/staves.js", "./src/core/profiles.js",
  "./src/core/analyze.js", "./src/core/fingering.js", "./src/core/annotate.js",
  "./src/core/midi.js", "./src/core/structure.js", "./src/core/audio.js",
  "./vendor/mupdf/mupdf.js", "./vendor/mupdf/mupdf-wasm.js",
  "./vendor/pdf-lib/pdf-lib.esm.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // las librerias grandes casi nunca cambian: primero la cache
  if (url.pathname.includes("/vendor/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })));
    return;
  }

  // el resto: primero la red, con la cache como respaldo sin conexion
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html"))),
  );
});
