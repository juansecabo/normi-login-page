// Genera src/guia/rutas.generated.ts: ruta → nombre de la ficha del tablero que
// lleva a esa ruta, leído de los Dashboard*.tsx. Corre en cada build (prebuild).
// Así "Normi te guía" dice y señala el nombre REAL de la ficha aunque se renombre,
// sin que nadie toque el catálogo (Juan 2026-09-08: "que aprenda y se adapte").
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = path.join(ROOT, "src", "pages");
const OUT = path.join(ROOT, "src", "guia", "rutas.generated.ts");

const rutas = new Map(); // ruta → Set(nombres)
for (const f of fs.readdirSync(PAGES).filter((n) => /^Dashboard[A-Za-z]*\.tsx$/.test(n))) {
  const s = fs.readFileSync(path.join(PAGES, f), "utf8");
  // Cada tarjeta: <button onClick={() => navigate("/ruta")} ...> ... <span className="font-semibold text-foreground ...">Nombre</span>
  for (const m of s.matchAll(/navigate\("(\/[^"]*)"\)[^]{0,700}?<span className="font-semibold text-foreground[^"]*">([^<{]+)<\/span>/g)) {
    const ruta = m[1];
    const nombre = m[2].replace(/\s+/g, " ").trim();
    if (!ruta || ruta === "/" || ruta === "/dashboard" || !nombre) continue;
    if (!rutas.has(ruta)) rutas.set(ruta, new Set());
    rutas.get(ruta).add(nombre);
  }
}

const lineas = [...rutas.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([ruta, nombres]) => {
    const lista = [...nombres];
    if (lista.length > 1) console.log(`[gen-guia-rutas] AVISO: la ruta ${ruta} tiene varios nombres de ficha: ${lista.join(" | ")} (se usa el primero)`);
    return `  ${JSON.stringify(ruta)}: ${JSON.stringify(lista[0])},`;
  });

const contenido = `// GENERADO por scripts/gen-guia-rutas.mjs en cada build. NO EDITAR A MANO.
// Ruta → nombre actual de la ficha del tablero que lleva a ella.
export const RUTAS_FICHAS: Record<string, string> = {
${lineas.join("\n")}
};
`;
const previo = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
if (previo !== contenido) fs.writeFileSync(OUT, contenido);
console.log(`[gen-guia-rutas] ${rutas.size} rutas con ficha${previo !== contenido ? " (archivo actualizado)" : ""}.`);
