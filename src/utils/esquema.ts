// Esquema de evaluación POR NIVEL (Juan 2026-09-12): un nivel se califica por
// PERIODOS (4 cortes, definitiva anual = promedio) o por SEMESTRES (2 cortes,
// cada semestre cierra con su propia definitiva). Ej.: Formación Complementaria
// va por semestres; Preescolar a Media siguen por periodos.
//
// Fuente: /api/institucion/esquemas (Niveles_Colegio: esquema, cortes, definitiva;
// Grados_Colegio: grado → nivel). Las notas siguen guardando `periodo` (número de
// corte) y `ano_escolar`; lo que cambia es cuántos cortes hay y cómo se llaman.
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { NIVEL_DE_GRADO } from "@/utils/grados";
import { getSession } from "@/hooks/useSession";

export type Esquema = "periodos" | "semestres";
export interface EsquemaNivel {
  nivel: string;
  esquema: Esquema;
  /** Números de corte: [1,2,3,4] o [1,2]. */
  cortes: number[];
  /** true = cada corte cierra con su propia definitiva (no hay "Definitiva Anual"). */
  definitivaPorCorte: boolean;
}

export const ESQUEMA_DEFAULT: EsquemaNivel = { nivel: "", esquema: "periodos", cortes: [1, 2, 3, 4], definitivaPorCorte: false };

// Respuesta de /api/institucion/esquemas (todos los roles): niveles con esquema y grado → nivel.
interface EstructuraResp {
  grados?: Array<{ grado: string; nivel?: string | null }>;
  niveles?: Array<{ nivel: string; esquema?: string | null; cortes?: number | null; definitiva?: string | null }>;
}

// La caché va ligada al colegio de la sesión: al cambiar de perfil/colegio sin recargar la
// página no se reutiliza el esquema del colegio anterior (bug visto por Juan 2026-09-13).
let cache: { colegio: string; at: number; esquemas: Map<string, EsquemaNivel>; nivelDeGrado: Map<string, string> } | null = null;
let enCurso: Promise<typeof cache> | null = null;
const TTL = 5 * 60 * 1000;

function colegioActual(): string {
  try { return String(getSession().colegio_id || ""); } catch { return ""; }
}

async function cargar() {
  const colegio = colegioActual();
  if (cache && cache.colegio === colegio && Date.now() - cache.at < TTL) return cache;
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const esquemas = new Map<string, EsquemaNivel>();
    const nivelDeGrado = new Map<string, string>();
    try {
      const r = await apiRequest<EstructuraResp>("/api/institucion/esquemas");
      for (const n of r.niveles || []) {
        const esquema: Esquema = n.esquema === "semestres" ? "semestres" : "periodos";
        const nCortes = Number(n.cortes) || (esquema === "semestres" ? 2 : 4);
        esquemas.set(n.nivel, {
          nivel: n.nivel,
          esquema,
          cortes: Array.from({ length: nCortes }, (_, i) => i + 1),
          definitivaPorCorte: n.definitiva === "por_corte",
        });
      }
      for (const g of r.grados || []) if (g.grado && g.nivel) nivelDeGrado.set(g.grado, g.nivel);
    } catch {
      /* sin estructura: todo por periodos */
    }
    cache = { colegio, at: Date.now(), esquemas, nivelDeGrado };
    enCurso = null;
    return cache;
  })();
  return enCurso;
}

export function invalidarEsquemaCache() { cache = null; }

/** Esquema del nivel indicado (o el default). */
export async function esquemaDeNivel(nivel: string | null | undefined): Promise<EsquemaNivel> {
  if (!nivel) return ESQUEMA_DEFAULT;
  const c = await cargar();
  return c?.esquemas.get(nivel) || { ...ESQUEMA_DEFAULT, nivel };
}

/** Esquema que aplica a un grado (vía su nivel configurado; cae al mapa estándar). */
export async function esquemaDeGrado(grado: string | null | undefined): Promise<EsquemaNivel> {
  if (!grado) return ESQUEMA_DEFAULT;
  const c = await cargar();
  const nivel = c?.nivelDeGrado.get(grado) || NIVEL_DE_GRADO[grado] || null;
  return esquemaDeNivel(nivel);
}

/** Todos los esquemas del colegio (para editores de configuración). */
export async function esquemasDelColegio(): Promise<EsquemaNivel[]> {
  const c = await cargar();
  return c ? [...c.esquemas.values()] : [];
}

/** "Periodo 3" / "Semestre 2". */
export function etiquetaCorte(esq: EsquemaNivel | Esquema, n: number): string {
  const e = typeof esq === "string" ? esq : esq.esquema;
  return `${e === "semestres" ? "Semestre" : "Periodo"} ${n}`;
}

const ORD = ["", "Primer", "Segundo", "Tercer", "Cuarto", "Quinto", "Sexto"];
const ORD_FEM = ["", "1er", "2do", "3er", "4to", "5to", "6to"];
/** "Tercer periodo" / "Segundo semestre". */
export function etiquetaCorteOrdinal(esq: EsquemaNivel | Esquema, n: number): string {
  const e = typeof esq === "string" ? esq : esq.esquema;
  return `${ORD[n] || `${n}º`} ${e === "semestres" ? "semestre" : "periodo"}`;
}
/** "3er Periodo" / "2do Semestre" (estilo de las tablas de notas). */
export function etiquetaCorteCorta(esq: EsquemaNivel | Esquema, n: number): string {
  const e = typeof esq === "string" ? esq : esq.esquema;
  return `${ORD_FEM[n] || `${n}º`} ${e === "semestres" ? "Semestre" : "Periodo"}`;
}
/** "Período" / "Semestre" (con tilde, como lo escriben las pantallas de estadísticas). */
export function unidadCorte(esq: EsquemaNivel | Esquema): "Período" | "Semestre" {
  const e = typeof esq === "string" ? esq : esq.esquema;
  return e === "semestres" ? "Semestre" : "Período";
}
/** grado → esquema, para cálculos que recorren muchas aulas (completitud). */
export async function mapaEsquemaPorGrado(): Promise<Map<string, EsquemaNivel>> {
  const c = await cargar();
  const m = new Map<string, EsquemaNivel>();
  if (!c) return m;
  for (const [g, nivel] of c.nivelDeGrado.entries()) m.set(g, c.esquemas.get(nivel) || { ...ESQUEMA_DEFAULT, nivel });
  return m;
}
/** Nombre de la pestaña/columna final: "Definitiva Anual" (periodos) o "Definitiva" (por corte). */
export function etiquetaDefinitiva(esq: EsquemaNivel): string {
  return esq.definitivaPorCorte ? "Definitiva" : "Definitiva Anual";
}

/** Hook: esquema del grado (default hasta que carga). */
export function useEsquemaGrado(grado: string | null | undefined): EsquemaNivel & { ready: boolean } {
  const [esq, setEsq] = useState<EsquemaNivel>(ESQUEMA_DEFAULT);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let vivo = true;
    setReady(false);
    esquemaDeGrado(grado).then((e) => { if (vivo) { setEsq(e); setReady(true); } });
    return () => { vivo = false; };
  }, [grado]);
  return { ...esq, ready };
}
