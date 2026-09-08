// Chequeo automático de "Normi te guía" contra la interfaz (Juan 2026-09-08).
// Corre en cada build (prebuild). FALLA si el catálogo señala algo que ya no existe;
// AVISA de anclas de la interfaz que ninguna capacidad usa (función sin guía).
//
//   node scripts/check-guia.mjs            → falla con errores
//   node scripts/check-guia.mjs --solo-avisar
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
};
const leer = (p) => fs.readFileSync(p, "utf8");
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Un ancla es "modulo.elemento" en minúsculas; se descartan rutas, dominios y métodos JS.
const IGNORAR = new Set(["lovable.app", "rango.includes"]);
const esAncla = (a) => /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(a) && !/\.(tsx?|jsx?|css|png|webp|svg|json|mp3|wav|ts|com|co|org|net|io)$/.test(a) && !a.includes("..") && !a.endsWith(".") && !IGNORAR.has(a);

// ── 1) Interfaz (todo menos el catálogo de la guía)
const archivosUi = walk(SRC).filter((p) => !p.includes(`${path.sep}guia${path.sep}modulos${path.sep}`));
let ui = "";
for (const p of archivosUi) ui += leer(p) + "\n";
// Cualquier literal con forma de ancla ("modulo.elemento") cuenta, venga como atributo
// (data-guia, dataGuia, dataGuiaVerTodas...), en una expresión condicional o en una variable.
const anclasUi = new Set([...ui.matchAll(/["'`]([a-z][a-z0-9_]*\.[a-z0-9_.]+)["'`]/g)].map((m) => m[1]).filter(esAncla));
// Anclas con sufijo dinámico: data-guia={`x.algo_${...}`} → se aceptan por prefijo.
const prefijosDinamicos = [...ui.matchAll(/`([a-z][a-z0-9_]*\.[a-z0-9_.]*)\$\{/g)].map((m) => m[1]);
const uiNorm = norm(ui);

// Fichas del tablero: los <span> de título de cada tarjeta en los Dashboard*.tsx.
const fichas = new Set();
for (const p of archivosUi.filter((f) => /Dashboard[A-Za-z]*\.tsx$/.test(f))) {
  for (const m of leer(p).matchAll(/<span className="font-semibold text-foreground[^"]*">([^<{]+)<\/span>/g)) fichas.add(m[1].trim());
}

// ── 2) Catálogo de la guía
const modulos = walk(path.join(SRC, "guia", "modulos"));
const errores = [];
const avisos = [];
const anclasUsadas = new Set();
for (const p of modulos) {
  const s = leer(p);
  const nombre = path.basename(p);
  for (const m of s.matchAll(/ancla:\s*["']([^"']+)["']/g)) {
    const a = m[1];
    anclasUsadas.add(a);
    if (!anclasUi.has(a) && !prefijosDinamicos.some((pre) => a.startsWith(pre))) errores.push(`${nombre}: el ancla "${a}" no existe en la interfaz`);
  }
  // "Entramos a X." solo se juzga cuando X parece el nombre de una ficha (palabras con
  // mayúscula unidas por a/de/y/del), no en frases descriptivas.
  for (const m of s.matchAll(/Entramos a ([^.\n"]+)\./g)) {
    const f = m[1].trim().replace(/^(los|las|la|el|tu|tus|mis) /i, "");
    const palabras = f.split(/\s+/);
    const pareceFicha = palabras.length <= 4 && palabras.every((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w) || ["a", "de", "y", "del", "e"].includes(w.toLowerCase()));
    if (pareceFicha && ![...fichas].some((x) => norm(x) === norm(f)) && !uiNorm.includes(norm(f))) {
      errores.push(`${nombre}: "Entramos a ${f}" pero ninguna ficha ni pantalla se llama así`);
    }
  }
  // Etiquetas entre comillas simples en las narraciones: deberían existir literalmente en la interfaz.
  for (const m of s.matchAll(/narracion:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)) {
    for (const q of m[1].matchAll(/'([^']{3,60})'/g)) {
      const etiqueta = q[1];
      if (/^[A-ZÁÉÍÓÚÑ0-9]/.test(etiqueta) && !uiNorm.includes(norm(etiqueta))) avisos.push(`${nombre}: la etiqueta '${etiqueta}' no aparece literal en la interfaz`);
    }
  }
}

// ── 3) Anclas de la interfaz sin ninguna capacidad que las señale (función sin guía)
const sinGuia = [...anclasUi].filter((a) => !anclasUsadas.has(a) && !/^(guia|dashboard\.ficha)/.test(a)).sort();

const soloAvisar = process.argv.includes("--solo-avisar");
console.log(`[check-guia] anclas en la interfaz: ${anclasUi.size} · usadas por la guía: ${anclasUsadas.size} · fichas del tablero: ${fichas.size}`);
if (sinGuia.length) console.log(`[check-guia] AVISO · ${sinGuia.length} ancla(s) sin ninguna capacidad que las señale:\n  - ${sinGuia.join("\n  - ")}`);
const avisosU = [...new Set(avisos)];
if (avisosU.length) console.log(`[check-guia] AVISO · ${avisosU.length} etiqueta(s) citadas que no aparecen literal en la interfaz:\n  - ${avisosU.join("\n  - ")}`);
const erroresU = [...new Set(errores)];
if (erroresU.length) {
  console.error(`[check-guia] ERROR · ${erroresU.length} problema(s):\n  - ${erroresU.join("\n  - ")}`);
  if (!soloAvisar) process.exit(1);
} else {
  console.log("[check-guia] OK: todas las anclas y fichas que señala la guía existen.");
}
