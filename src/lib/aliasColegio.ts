// Nombres de fichas/secciones que cambian SOLO para un colegio (Juan 2026-09-10).
// Solo frontend: la ruta, la página y su funcionamiento son los mismos. Aplica al
// tablero, la miga de pan y a Normi te guía (catálogo y narraciones).
import { getSession } from "@/hooks/useSession";

const PESTALOZZIANO = "94c1414b-22d1-40dd-945a-5857b62e5f6c";

const ALIAS_POR_COLEGIO: Record<string, Record<string, string>> = {
  [PESTALOZZIANO]: {
    "Portería": "Reporte de asistencia",
  },
};

export function aliasColegio(): Record<string, string> {
  return ALIAS_POR_COLEGIO[getSession().colegio_id || ""] || {};
}

/** Nombre de una ficha para el colegio actual (o el original si no tiene alias). */
export function nombreFicha(nombre: string): string {
  return aliasColegio()[nombre] ?? nombre;
}

/** Reemplaza en un texto los nombres con alias del colegio actual. */
export function aliasTexto(texto: string): string {
  let t = texto;
  for (const [original, alias] of Object.entries(aliasColegio())) t = t.split(original).join(alias);
  return t;
}
