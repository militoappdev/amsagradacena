# Digitado

Añade la **digitación de válvulas** a un PDF de trombón (3 pistones) y genera **MIDI** y **audio** de la partitura. Todo ocurre en el navegador: el PDF no se sube a ningún servidor.

Es una PWA: se abre con un enlace, se puede instalar en el móvil o el ordenador y funciona sin conexión después de la primera visita.

## Qué hace

1. **Lee el PDF** de la partitura (exportaciones digitales de MuseScore, Sibelius, Finale o Dorico; no escaneos).
   Reconoce pentagramas, notas, figuras, barrados, puntillos, alteraciones, armadura, compases, repeticiones y casillas.
2. **Calcula la digitación**: para cada nota elige el armónico más grave que se puede tocar con el trombón de 3 pistones y, si hay varias opciones, la que usa menos pistones. Se escribe en Do (instrumento real).
3. **Escribe los números bajo cada nota** sin mover nada del original (`0` = aire, `1` `2` `3`, apilados si se combinan) y devuelve un PDF nuevo.
4. **Genera MIDI** (programa 56, trombón) y **audio** con una síntesis de trombón, respetando el tempo y, si quieres, las repeticiones y casillas.

## Cómo usarla

1. Abre la página.
2. Arrastra el PDF o pulsa **Elegir PDF**.
3. Pulsa **Añadir digitación al PDF** → tendrás el PDF con los números.
4. Pulsa **Generar audio** → se puede escuchar en la propia página y descargar en WAV; el MIDI se descarga también.

Ajustes disponibles: programa de origen (automático, Sibelius, MuseScore), instrumento (Do o Si♭), tempo y respetar repeticiones.

### Instalarla como aplicación

- **iPhone/iPad** (Safari): botón Compartir → *Añadir a pantalla de inicio*.
- **Android** (Chrome): menú → *Instalar aplicación*.
- **Ordenador** (Chrome/Edge): icono de instalar en la barra de direcciones.

## Publicarla en GitHub Pages

Sí, se puede: GitHub Pages sirve sitios estáticos por HTTPS, y la app es estática (HTML + JS + WASM). No necesita servidor, ni base de datos, ni claves.

1. Crea un repositorio y sube esta carpeta (`app/`).
2. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. El flujo incluido (`.github/workflows/pages.yml`) publica `public/` en cada `push` a `main`.
4. En un par de minutos estará en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`.

Notas para el despliegue:

- Todas las rutas son relativas (`./`), así que funciona igual en la raíz del dominio que en una subcarpeta de proyecto.
- HTTPS es obligatorio para el service worker (offline). Pages lo da por defecto.
- Los archivos pesan: ~10 MB de MuPDF (WASM) + 1,5 MB de pdf-lib. Están dentro del límite de Pages (100 MB por archivo, 1 GB por sitio).
- `node_modules/` no se sube: las librerías del navegador viven ya en `public/vendor/`.

## Uso local

```bash
npm install          # solo para las herramientas y las pruebas en Node
npm run vendor       # copia mupdf y pdf-lib a public/vendor (si actualizas versiones)
npm run serve        # http://localhost:8787
```

Prueba rápida del analizador en Node (sin navegador):

```bash
node tools/test-node.mjs "ruta/al/pdf" 36   # 36 = Do, 34 = Si♭
node tools/orden.mjs "ruta/al/pdf"          # repeticiones y casillas
```

## Estructura

```
public/
  index.html, styles.css, manifest.webmanifest, sw.js, iconos
  src/main.js              interfaz y flujo
  src/core/read.js         PDF → glifos, trazos y rasterizado (mupdf)
  src/core/staves.js       pentagramas, plicas y barrados
  src/core/profiles.js     diccionarios de glifos por programa
  src/core/analyze.js      ritmo, alturas, compases, ligaduras
  src/core/structure.js    repeticiones y casillas → orden de interpretación
  src/core/fingering.js    tabla de armónicos y pistones
  src/core/annotate.js     escritura de la digitación (pdf-lib)
  src/core/midi.js         escritura MIDI
  src/core/audio.js        síntesis de trombón y WAV
  vendor/                  mupdf (WASM) y pdf-lib
tools/                     pruebas y utilidades de desarrollo
```

## Límites conocidos

- Solo **PDF generados por programas** (texto y vectores), no escaneos ni fotos: no hay OMR.
- Se procesa **una página** por archivo (la primera).
- Reconoce los diccionarios de Sibelius y MuseScore incluidos; otras versiones o programas pueden necesitar ajustes.
- Las partituras con compases irregulares o cambios de compás avisan en pantalla: conviene revisar esos compases.
- El audio es sintetizado (no son muestras reales), con un solo timbre de trombón.

## Licencia y créditos

- [MuPDF.js](https://mupdf.com/) — **AGPL-3.0**: al distribuir la app hay que ofrecer el código fuente (este repositorio lo hace). Para uso comercial cerrado hace falta licencia de Artifex.
- [pdf-lib](https://pdf-lib.js.org/) — MIT.
- La tabla de digitación y el motor de análisis son propios.
