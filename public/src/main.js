// Interfaz: PDF -> analisis -> PDF digitado + MIDI + audio.
import { openDocument, readPage } from "./core/read.js";
import { analyzePage } from "./core/analyze.js";
import { annotatePdf } from "./core/annotate.js";
import { buildMidi, eventsFromResult, eventsWithOrder } from "./core/midi.js";
import { playOrder } from "./core/structure.js";
import { renderBuffer, wavFromBuffer, eventsDuration, Player } from "./core/audio.js";
import { INSTRUMENTOS, INSTRUMENTO_POR_DEFECTO, instrumento, digitacionDe } from "./core/fingering.js";
import * as mupdf from "mupdf";

const $ = (id) => document.getElementById(id);
const state = {
  nombre: "partitura",
  bytes: null,
  doc: null,
  page: null,
  result: null,
  order: null,
  anotado: null,
  eventos: [],
};
const player = new Player();
const repro = { eventos: [], bpm: 72, dur: 0, timer: null };

// ----- instrumentos --------------------------------------------------------

function llenarInstrumentos() {
  const sel = $("instrumento");
  let grupo = null;
  for (const i of INSTRUMENTOS) {
    if (i.grupo !== grupo) {
      grupo = i.grupo;
      const og = document.createElement("optgroup");
      og.label = grupo;
      sel.appendChild(og);
    }
    const op = document.createElement("option");
    op.value = i.id;
    op.textContent = i.nombre;
    sel.lastElementChild.appendChild(op);
  }
  const guardado = localStorage.getItem("digitado.instrumento");
  sel.value = INSTRUMENTOS.some((i) => i.id === guardado) ? guardado : INSTRUMENTO_POR_DEFECTO;
}

function actual() {
  return instrumento($("instrumento").value);
}

function pintarNotaInstrumento() {
  const i = actual();
  const trans = i.transp
    ? `suena ${Math.abs(i.transp)} semitonos más grave de lo escrito (parte en ${i.clave === "treble" ? "clave de Sol" : "clave de Fa"}), así que el audio y el MIDI van transportados`
    : "la parte se lee tal cual suena (instrumento en Do)";
  $("nota-instrumento").textContent = `${i.nombre}: ${trans}. Registro aproximado: ${i.registro}.`;
}

const fmt = (s) => {
  const t = Math.max(0, Math.round(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

function estado(txt, error = false) {
  $("estado").textContent = txt;
  $("estado").style.color = error ? "#b91c1c" : "";
}

function cargando(on, txt = "Procesando…") {
  $("cargando").hidden = !on;
  $("cargando-txt").textContent = txt;
}

function descargar(blob, nombre) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}

/** Dibuja el PDF (original o digitado) en la vista previa. */
function vista(bytes) {
  const doc = openDocument(bytes);
  const page = doc.loadPage(0);
  const b = page.getBounds();
  const zoom = Math.min(2.6, 1100 / (b[2] - b[0]));
  const pm = page.toPixmap(mupdf.Matrix.scale(zoom, zoom), mupdf.ColorSpace.DeviceRGB, false);
  const url = URL.createObjectURL(new Blob([pm.asPNG()], { type: "image/png" }));
  const img = $("preview");
  if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
  img.src = url;
}

function ajustes() {
  return {
    inst: actual(),
    clave: $("clave").value,
    bpm: Math.max(30, Math.min(200, Number($("tempo").value) || 72)),
    repes: $("repes").checked,
  };
}

// ----- reproduccion --------------------------------------------------------

function pintarPlay(sonando) {
  $("play").querySelector("path").setAttribute("d", sonando ? "M6 5h4v14H6zm8 0h4v14h-4z" : "M8 5v14l11-7z");
  $("play").setAttribute("aria-label", sonando ? "Pausar" : "Reproducir");
}

function pararReloj() {
  if (repro.timer) clearInterval(repro.timer);
  repro.timer = null;
}

function detenerSonido() {
  player.stop();
  pararReloj();
  pintarPlay(false);
  $("progreso").style.width = "0%";
  $("tiempo").textContent = fmt(repro.dur);
}

function iniciarReloj() {
  pararReloj();
  repro.timer = setInterval(() => {
    if (!player.playing) {
      pararReloj();
      pintarPlay(false);
      return;
    }
    const pos = player.position;
    if (repro.dur && pos >= repro.dur) {
      detenerSonido();
      return;
    }
    $("progreso").style.width = repro.dur ? `${Math.min(100, (pos / repro.dur) * 100)}%` : "0%";
    $("tiempo").textContent = fmt(pos);
  }, 250);
}

function alternar() {
  if (!repro.eventos.length) return;
  if (player.playing) {
    player.pause();
    pararReloj();
    pintarPlay(false);
    return;
  }
  const desde = player.position >= repro.dur - 0.15 ? 0 : player.position;
  player.seek(desde);
  player.play(repro.eventos, { bpm: repro.bpm, from: desde, timbre: actual().timbre });
  pintarPlay(true);
  iniciarReloj();
}

// ----- flujo de trabajo ----------------------------------------------------

function analizar() {
  const perfil = $("origen").value || undefined;
  const { inst, clave } = ajustes();
  const opts = { clefDefault: inst.clave };
  if (perfil) opts.profileId = perfil;
  if (clave) opts.clef = clave; // eleccion manual: manda sobre la deteccion
  const r = analyzePage(state.page, opts);
  state.result = r;
  state.order = playOrder(r, state.page);
  state.anotado = null;
  detenerSonido();
  player.stop();

  const { bpm, repes } = ajustes();
  const durAprox = (r.totalBeats * 60) / bpm;
  const conRepes = (state.order.order.reduce((s, i) => s + (r.measures[i].grid ?? 4), 0) * 60) / bpm;

  $("resumen").innerHTML = "";
  const datos = [
    `${r.notes.length} notas`,
    `${r.measures.length} compases`,
    `${fmt(repes ? conRepes : durAprox)} aprox.`,
    r.profile.label,
  ];
  for (const d of datos) {
    const li = document.createElement("li");
    li.textContent = d;
    $("resumen").appendChild(li);
  }

  const fuera = r.notes.filter((n) => !digitacionDe(n.midi, inst)).length;
  $("avisos").innerHTML = "";
  if (fuera) {
    const li = document.createElement("li");
    li.textContent = `${fuera} nota(s) fuera del registro de ${inst.corto}: no llevan digitación.`;
    $("avisos").appendChild(li);
  }
  for (const w of r.warnings.slice(0, 5)) {
    const li = document.createElement("li");
    li.textContent = w;
    $("avisos").appendChild(li);
  }

  $("dl-pdf").hidden = true;
  $("dl-midi").hidden = true;
  $("dl-wav").hidden = true;
  $("descargas").hidden = true;
  $("reproductor").hidden = true;
  $("btn-digitar").disabled = false;
  $("btn-audio").disabled = false;
  $("btn-audio").textContent = "Escuchar la partitura";
  $("resultado").hidden = false;
  $("tiempo").textContent = "0:00";
  estado("");
}

async function abrir(file) {
  if (!file) return;
  if (!/pdf$/i.test(file.name) && file.type !== "application/pdf") {
    estado("Ese archivo no es un PDF.", true);
    return;
  }
  try {
    cargando(true, "Leyendo el PDF…");
    await new Promise((r) => setTimeout(r, 30));
    detenerSonido();
    state.nombre = file.name.replace(/\.pdf$/i, "");
    state.bytes = new Uint8Array(await file.arrayBuffer());
    state.doc = openDocument(state.bytes);
    if (state.doc.countPages() < 1) throw new Error("El PDF no tiene páginas.");
    state.page = readPage(state.doc, 0);
    vista(state.bytes);
    analizar();
    if (state.doc.countPages() > 1) estado("El PDF tiene varias páginas: se procesa la primera.");
  } catch (err) {
    console.error(err);
    estado(err.message || "No he podido leer el PDF.", true);
  } finally {
    cargando(false);
  }
}

async function digitar() {
  if (!state.result) return;
  try {
    cargando(true, "Escribiendo la digitación…");
    $("btn-digitar").disabled = true;
    await new Promise((r) => setTimeout(r, 30));
    const { inst } = ajustes();
    const { bytes } = await annotatePdf(state.bytes, state.result, state.page, { instrumento: inst.id });
    state.anotado = bytes;
    vista(bytes);
    const a = $("dl-pdf");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    a.download = `${state.nombre} - digitado.pdf`;
    a.hidden = false;
    $("descargas").hidden = false;
    estado("PDF listo: puedes abrirlo desde la vista previa o descargarlo.");
  } catch (err) {
    console.error(err);
    estado(err.message || "No he podido escribir la digitación.", true);
  } finally {
    cargando(false);
    $("btn-digitar").disabled = false;
  }
}

/** Prepara las notas (con o sin repeticiones), el MIDI y el reproductor. */
function prepararAudio() {
  const { bpm, repes, inst } = ajustes();
  const opciones = { transpose: inst.transp };
  const eventos = repes
    ? eventsWithOrder(state.result, state.order.order, opciones)
    : eventsFromResult(state.result, opciones);
  if (!eventos.length) {
    estado("No he encontrado notas que suenen.", true);
    return;
  }
  state.eventos = eventos;
  repro.eventos = eventos;
  repro.bpm = bpm;
  repro.dur = eventsDuration(eventos, bpm);

  const midi = buildMidi(eventos, { bpm, program: inst.programa, name: inst.nombre });
  const a = $("dl-midi");
  a.href = URL.createObjectURL(new Blob([midi], { type: "audio/midi" }));
  a.download = `${state.nombre}.mid`;
  a.hidden = false;

  $("dl-wav").hidden = false;
  $("descargas").hidden = false;
  $("reproductor").hidden = false;
  $("tiempo").textContent = "0:00";
  $("btn-audio").textContent = "Escuchar de nuevo";
  estado(`${eventos.length} notas · ${fmt(repro.dur)} de música.`);
}

async function generarAudio() {
  if (!state.result) return;
  player.ensure(); // dentro del gesto del usuario
  try {
    prepararAudio();
    player.seek(0);
    player.play(repro.eventos, { bpm: repro.bpm, from: 0, timbre: actual().timbre });
    pintarPlay(true);
    iniciarReloj();
  } catch (err) {
    console.error(err);
    estado(err.message || "No he podido reproducir el audio.", true);
  }
}

async function descargarWav(ev) {
  ev.preventDefault();
  if (!repro.eventos.length) return;
  try {
    cargando(true, "Preparando el WAV… (unos segundos)");
    await new Promise((r) => setTimeout(r, 30));
    const buf = await renderBuffer(repro.eventos, {
      bpm: repro.bpm, sampleRate: 24000, channels: 1, tail: 2.2, timbre: actual().timbre,
    });
    const wav = wavFromBuffer(buf);
    descargar(new Blob([wav], { type: "audio/wav" }), `${state.nombre}.wav`);
    estado(`WAV descargado (${fmt(buf.duration)}).`);
  } catch (err) {
    console.error(err);
    estado(err.message || "No he podido generar el WAV.", true);
  } finally {
    cargando(false);
  }
}

// ----- eventos de interfaz -------------------------------------------------

$("elegir").addEventListener("click", () => $("archivo").click());
$("archivo").addEventListener("change", (e) => abrir(e.target.files[0]));

const zona = $("zona");
for (const ev of ["dragenter", "dragover"]) {
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("encima"); });
}
for (const ev of ["dragleave", "drop"]) {
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("encima"); });
}
zona.addEventListener("drop", (e) => abrir(e.dataTransfer.files[0]));

$("btn-digitar").addEventListener("click", digitar);
$("btn-audio").addEventListener("click", generarAudio);
$("play").addEventListener("click", alternar);
$("dl-wav").addEventListener("click", descargarWav);
$("origen").addEventListener("change", () => { if (state.page) { try { analizar(); } catch (e) { estado(e.message, true); } } });
$("clave").addEventListener("change", () => { guardarAjustes(); if (state.page) { try { analizar(); } catch (e) { estado(e.message, true); } } });
$("repes").addEventListener("change", () => { guardarAjustes(); if (state.result) analizar(); });
$("instrumento").addEventListener("change", () => {
  const inst = actual();
  localStorage.setItem("digitado.instrumento", inst.id);
  guardarAjustes();
  pintarNotaInstrumento();
  if (!state.result) return;
  state.anotado = null;
  $("dl-pdf").hidden = true;
  analizar();
});
$("tempo").addEventListener("change", () => { guardarAjustes(); if (state.result) { detenerSonido(); prepararAudio(); } });

// recordar los ajustes entre visitas
function guardarAjustes() {
  try {
    localStorage.setItem("digitado.ajustes", JSON.stringify({
      clave: $("clave").value,
      origen: $("origen").value,
      tempo: $("tempo").value,
      repes: $("repes").checked,
    }));
  } catch { /* modo privado */ }
}

function recuperarAjustes() {
  try {
    const a = JSON.parse(localStorage.getItem("digitado.ajustes") || "{}");
    if (a.clave !== undefined) $("clave").value = a.clave;
    if (a.origen) $("origen").value = a.origen;
    if (a.tempo) $("tempo").value = a.tempo;
    if (a.repes !== undefined) $("repes").checked = !!a.repes;
  } catch { /* sin ajustes guardados */ }
}

llenarInstrumentos();
recuperarAjustes();
pintarNotaInstrumento();

// ----- formulario de contacto / fallos / sugerencias ------------------------
const formContacto = $("form-contacto");
if (formContacto) {
  formContacto.addEventListener("submit", (e) => {
    e.preventDefault();
    const estado = $("estado-contacto");
    const btn = formContacto.querySelector('button[type="submit"]');
    const fd = new FormData(formContacto);
    const email = String(fd.get("email") || "").trim();
    const mensaje = String(fd.get("mensaje") || "").trim();
    const asunto = String(fd.get("asunto") || "Contacto");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      estado.textContent = "Introduce un email válido para poder contestarte.";
      estado.className = "estado-contacto error";
      return;
    }
    if (!mensaje) {
      estado.textContent = "Escribe un mensaje.";
      estado.className = "estado-contacto error";
      return;
    }
    btn.disabled = true;
    const asuntoFinal = `Agrupación Musical Sagrada Cena · ${asunto}`;
    const cuerpo = `Email del remitente: ${email}\nAsunto: ${asunto}\n\n${mensaje}`;
    const mailto = `mailto:militoappdev@gmail.com?subject=${encodeURIComponent(asuntoFinal)}&body=${encodeURIComponent(cuerpo)}`;
    window.location.href = mailto;
    estado.textContent = "Se ha abierto tu cliente de correo con el mensaje preparado: pulsa Enviar para completarlo.";
    estado.className = "estado-contacto ok";
    btn.disabled = false;

  });
}

// PWA: cache para funcionar sin conexion
if ("serviceWorker" in navigator) {
  const registrar = () => navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("sw:", e));
  if (document.readyState === "complete") registrar();
  else window.addEventListener("load", registrar, { once: true });
}

// gancho de pruebas (no afecta al uso normal)
window.digitado = { abrir, digitar, generarAudio, prepararAudio, analizar, state, ajustes, repro, player };
