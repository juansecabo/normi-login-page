import { useEffect, useState, type CSSProperties } from "react";
import { apiRequest } from "@/lib/apiClient";

/**
 * Colores de las asignaturas (Juan 2026-09-24). Cada asignatura tiene un tono de la paleta
 * (índice guardado en Asignaturas.color, lo reparte el servidor para que no se repita entre
 * materias del mismo salón) o un color exacto escogido con el círculo ("#rrggbb"). El color
 * libre se aclara al pintarlo para que el texto se siga leyendo.
 */
export const PALETA_ASIGNATURAS: Array<{ tarjeta: string; muestra: string; hex: string }> = [
  { tarjeta: "bg-sky-100 border-sky-200", muestra: "bg-sky-200", hex: "#e0f2fe" },
  { tarjeta: "bg-emerald-100 border-emerald-200", muestra: "bg-emerald-200", hex: "#d1fae5" },
  { tarjeta: "bg-amber-100 border-amber-200", muestra: "bg-amber-200", hex: "#fef3c7" },
  { tarjeta: "bg-rose-100 border-rose-200", muestra: "bg-rose-200", hex: "#ffe4e6" },
  { tarjeta: "bg-violet-100 border-violet-200", muestra: "bg-violet-200", hex: "#ede9fe" },
  { tarjeta: "bg-lime-100 border-lime-200", muestra: "bg-lime-200", hex: "#ecfccb" },
  { tarjeta: "bg-orange-100 border-orange-200", muestra: "bg-orange-200", hex: "#ffedd5" },
  { tarjeta: "bg-teal-100 border-teal-200", muestra: "bg-teal-200", hex: "#ccfbf1" },
  { tarjeta: "bg-fuchsia-100 border-fuchsia-200", muestra: "bg-fuchsia-200", hex: "#fae8ff" },
  { tarjeta: "bg-indigo-100 border-indigo-200", muestra: "bg-indigo-200", hex: "#e0e7ff" },
  { tarjeta: "bg-red-200 border-red-300", muestra: "bg-red-300", hex: "#fecaca" },
  { tarjeta: "bg-yellow-200 border-yellow-300", muestra: "bg-yellow-300", hex: "#fef08a" },
  { tarjeta: "bg-cyan-200 border-cyan-300", muestra: "bg-cyan-300", hex: "#a5f3fc" },
  { tarjeta: "bg-pink-200 border-pink-300", muestra: "bg-pink-300", hex: "#fbcfe8" },
  { tarjeta: "bg-blue-200 border-blue-300", muestra: "bg-blue-300", hex: "#bfdbfe" },
  { tarjeta: "bg-green-200 border-green-300", muestra: "bg-green-300", hex: "#bbf7d0" },
  { tarjeta: "bg-purple-200 border-purple-300", muestra: "bg-purple-300", hex: "#e9d5ff" },
  { tarjeta: "bg-stone-200 border-stone-300", muestra: "bg-stone-300", hex: "#e7e5e4" },
  { tarjeta: "bg-slate-200 border-slate-300", muestra: "bg-slate-300", hex: "#e2e8f0" },
  { tarjeta: "bg-orange-200 border-orange-300", muestra: "bg-orange-300", hex: "#fed7aa" },
];

/** Índice de la paleta o código exacto "#rrggbb". */
export type ColorAsignatura = number | string;

/** Mezcla un color con blanco (0 = el color, 1 = blanco). */
export function aclarar(hex: string, cuanto: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * cuanto));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Respaldo si una asignatura aún no tiene color guardado: uno fijo según el nombre. */
const porNombre = (a: string) => { let h = 0; for (const ch of a) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % PALETA_ASIGNATURAS.length; };

/** Clase y estilo de la tarjeta de una asignatura (el color libre va en `style`). */
export function estiloAsignatura(nombre: string, colores: Record<string, ColorAsignatura>): { className: string; style?: CSSProperties } {
  const c = colores[nombre];
  if (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)) return { className: "", style: { backgroundColor: aclarar(c, 0.72), borderColor: aclarar(c, 0.45) } };
  const i = typeof c === "number" && c >= 0 && c < PALETA_ASIGNATURAS.length ? c : porNombre(nombre);
  return { className: PALETA_ASIGNATURAS[i].tarjeta };
}

/** Mapa nombre → color del colegio (se pide una vez). */
export function useColoresAsignaturas(): Record<string, ColorAsignatura> {
  const [colores, setColores] = useState<Record<string, ColorAsignatura>>({});
  useEffect(() => {
    apiRequest<{ colores: Record<string, ColorAsignatura> }>("/api/horario/colores").then((r) => setColores(r.colores || {})).catch(() => null);
  }, []);
  return colores;
}
