import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

/**
 * Colores de las asignaturas (Juan 2026-09-24). El índice se guarda en Asignaturas.color
 * (lo reparte el servidor para que no se repita entre materias del mismo salón; el
 * colegio puede cambiarlo en Configurar Institución → Asignaturas). 20 tonos suaves.
 */
export const PALETA_ASIGNATURAS: Array<{ tarjeta: string; muestra: string }> = [
  { tarjeta: "bg-sky-100 border-sky-200", muestra: "bg-sky-200" },
  { tarjeta: "bg-emerald-100 border-emerald-200", muestra: "bg-emerald-200" },
  { tarjeta: "bg-amber-100 border-amber-200", muestra: "bg-amber-200" },
  { tarjeta: "bg-rose-100 border-rose-200", muestra: "bg-rose-200" },
  { tarjeta: "bg-violet-100 border-violet-200", muestra: "bg-violet-200" },
  { tarjeta: "bg-lime-100 border-lime-200", muestra: "bg-lime-200" },
  { tarjeta: "bg-orange-100 border-orange-200", muestra: "bg-orange-200" },
  { tarjeta: "bg-teal-100 border-teal-200", muestra: "bg-teal-200" },
  { tarjeta: "bg-fuchsia-100 border-fuchsia-200", muestra: "bg-fuchsia-200" },
  { tarjeta: "bg-indigo-100 border-indigo-200", muestra: "bg-indigo-200" },
  { tarjeta: "bg-red-200 border-red-300", muestra: "bg-red-300" },
  { tarjeta: "bg-yellow-200 border-yellow-300", muestra: "bg-yellow-300" },
  { tarjeta: "bg-cyan-200 border-cyan-300", muestra: "bg-cyan-300" },
  { tarjeta: "bg-pink-200 border-pink-300", muestra: "bg-pink-300" },
  { tarjeta: "bg-blue-200 border-blue-300", muestra: "bg-blue-300" },
  { tarjeta: "bg-green-200 border-green-300", muestra: "bg-green-300" },
  { tarjeta: "bg-purple-200 border-purple-300", muestra: "bg-purple-300" },
  { tarjeta: "bg-stone-200 border-stone-300", muestra: "bg-stone-300" },
  { tarjeta: "bg-slate-200 border-slate-300", muestra: "bg-slate-300" },
  { tarjeta: "bg-orange-200 border-orange-300", muestra: "bg-orange-300" },
];

/** Respaldo si una asignatura aún no tiene color guardado: uno fijo según el nombre. */
const porNombre = (a: string) => { let h = 0; for (const ch of a) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % PALETA_ASIGNATURAS.length; };

export function claseColorAsignatura(nombre: string, colores: Record<string, number>): string {
  const i = colores[nombre];
  return PALETA_ASIGNATURAS[i != null && i >= 0 && i < PALETA_ASIGNATURAS.length ? i : porNombre(nombre)].tarjeta;
}

/** Mapa nombre → índice de color del colegio (se pide una vez). */
export function useColoresAsignaturas(): Record<string, number> {
  const [colores, setColores] = useState<Record<string, number>>({});
  useEffect(() => {
    apiRequest<{ colores: Record<string, number> }>("/api/horario/colores").then((r) => setColores(r.colores || {})).catch(() => null);
  }, []);
  return colores;
}
