// Genera src/guia/mapa.generated.ts: el MAPA DE NAVEGACIÓN de toda la plataforma para
// "Normi te guía": por cada pantalla (ruta), qué botón lleva a qué otra pantalla. Se arma
// leyendo las rutas de App.tsx y los navigate("/ruta") de cada página (los Dashboard*.tsx
// cuentan como "/dashboard", con las fichas de TODOS los roles). Corre en cada build.
// Con este mapa el cursor calcula el camino más corto desde donde está el usuario hasta el
// destino de un paso, en vez de adivinar (Juan 2026-10-13).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(SRC, "guia", "mapa.generated.ts");

const app = fs.readFileSync(path.join(SRC, "App.tsx"), "utf8");

// Componente → archivo (imports estáticos y lazy de App.tsx).
const archivoDe = new Map();
for (const m of app.matchAll(/import\s+(\w+)\s+from\s+"\.\/(pages\/[^"]+)"/g)) archivoDe.set(m[1], m[2]);
for (const m of app.matchAll(/const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\("\.\/(pages\/[^"]+)"\)/g)) archivoDe.set(m[1], m[2]);

// Archivo → rutas estáticas que lo muestran.
const rutasDe = new Map();
for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)) {
  const [, ruta, comp] = m;
  if (ruta.includes(":") || ruta.includes("*") || comp === "Navigate") continue;
  const rel = archivoDe.get(comp);
  if (!rel) continue;
  if (!rutasDe.has(rel)) rutasDe.set(rel, new Set());
  rutasDe.get(rel).add(ruta);
}

const resolver = (rel) => {
  for (const ext of [".tsx", ".ts", "/index.tsx"]) {
    const p = path.join(SRC, rel + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

// Texto visible del botón que hace el navigate: desde la llamada hasta el cierre del elemento.
function etiquetaCerca(s, pos) {
  // Componente tarjeta con label="..." ANTES del onClick (p. ej. <Card label="Notas" onClick=...>).
  const antes = s.slice(Math.max(0, pos - 700), pos);
  const tarjeta = antes.lastIndexOf("<Card");
  // (misma ficha: entre "<Card" y el navigate no empieza otra ficha)
  if (tarjeta !== -1 && !antes.slice(tarjeta).includes("render:")) {
    const lab = /\blabel="([^"]{2,60})"/.exec(antes.slice(tarjeta));
    if (lab) return lab[1];
  }
  const ventana = s.slice(pos, pos + 1200);
  const fin = ventana.search(/<\/(button|a|Button|Link)>/);
  if (fin === -1) return null;
  let cuerpo = ventana.slice(0, fin);
  const abre = cuerpo.indexOf(">");
  if (abre === -1) return null;
  cuerpo = cuerpo.slice(abre + 1).replace(/\{nombreFicha\("([^"]+)"\)\}/g, "$1");
  // El TÍTULO del botón (no su descripción): el span en negrita si lo hay; si no, el primer texto.
  const titulo = /<span[^>]*font-(?:semibold|bold)[^>]*>([^<{]+)</.exec(cuerpo)?.[1];
  const textos = cuerpo.split(/<[^>]*>/).map((t) => t.replace(/\{[^{}]*\}/g, " ").replace(/\s+/g, " ").trim());
  const texto = (titulo || textos.find((t) => /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(t)) || "").replace(/\s+/g, " ").trim();
  return texto && texto.length <= 60 && /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(texto) ? texto : null;
}

const mapa = new Map(); // origen → Map(destino → botón)
const agregar = (origen, destino, boton) => {
  if (!destino || destino === origen || destino === "/" ) return;
  if (!mapa.has(origen)) mapa.set(origen, new Map());
  if (!mapa.get(origen).has(destino)) mapa.get(origen).set(destino, boton);
};

const paginas = [...rutasDe.keys()];
for (const f of fs.readdirSync(path.join(SRC, "pages")).filter((n) => /^Dashboard[A-Za-z]*\.tsx$/.test(n))) {
  const rel = `pages/${f.replace(/\.tsx$/, "")}`;
  if (!rutasDe.has(rel)) rutasDe.set(rel, new Set());
  rutasDe.get(rel).add("/dashboard");
  if (!paginas.includes(rel)) paginas.push(rel);
}

for (const rel of paginas) {
  const archivo = resolver(rel);
  if (!archivo) continue;
  const s = fs.readFileSync(archivo, "utf8");
  // navigate("/ruta") y también navigate(cond ? "/a" : "/b") (destino según el rol).
  for (const m of s.matchAll(/navigate\(((?:[^()]|\([^()]*\)){0,200}?)\)/g)) {
    const destinos = [...m[1].matchAll(/"(\/[^"]*)"|`(\/[^`$]*)`/g)].map((d) => (d[1] || d[2] || "").split("?")[0].replace(/\/$/, ""));
    if (!destinos.length) continue;
    const boton = etiquetaCerca(s, m.index);
    if (!boton) continue;
    for (const destino of destinos) for (const origen of rutasDe.get(rel)) agregar(origen, destino, boton);
  }
}

const orden = [...mapa.keys()].sort();
const cuerpo = orden
  .map((o) => {
    const ds = [...mapa.get(o).entries()].sort(([a], [b]) => a.localeCompare(b));
    return `  ${JSON.stringify(o)}: {\n${ds.map(([d, b]) => `    ${JSON.stringify(d)}: ${JSON.stringify(b)},`).join("\n")}\n  },`;
  })
  .join("\n");
const contenido = `// GENERADO por scripts/gen-guia-mapa.mjs en cada build. NO EDITAR A MANO.
// Pantalla de origen → { pantalla destino: texto del botón que lleva allá }.
export const MAPA_NAV: Record<string, Record<string, string>> = {
${cuerpo}
};
`;
const previo = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
if (previo !== contenido) fs.writeFileSync(OUT, contenido);
const enlaces = [...mapa.values()].reduce((n, m) => n + m.size, 0);
console.log(`[gen-guia-mapa] ${mapa.size} pantallas, ${enlaces} botones de navegación${previo !== contenido ? " (archivo actualizado)" : ""}.`);
