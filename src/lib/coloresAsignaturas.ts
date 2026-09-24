import { useEffect, useState, type CSSProperties } from "react";
import { apiRequest } from "@/lib/apiClient";

/**
 * Color propio de cada asignatura (Juan 2026-09-24): un código exacto "#rrggbb" sacado al
 * azar del círculo de colores, distinto al de toda otra asignatura del colegio (lo sortea
 * y guarda el servidor; se cambia con el círculo en Configurar Institución → Asignaturas).
 * Se pinta con el color tal cual (Juan 2026-09-24: que no se aclare).
 */

/** Tono del círculo (HSV con brillo pleno) → "#rrggbb". */
export function hsvAHex(h: number, s: number): string {
  const f = (n: number) => { const k = (n + h / 60) % 6; return 1 - s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Color al azar del círculo que no esté en `usados`. */
export function colorAlAzar(usados: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const c = hsvAHex(Math.random() * 360, 0.45 + Math.random() * 0.55);
    if (!usados.has(c)) return c;
  }
  return hsvAHex(Math.random() * 360, 1);
}

/** Respaldo si una asignatura aún no tiene color guardado: un tono fijo según el nombre. */
const porNombre = (a: string) => { let h = 0; for (const ch of a) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return hsvAHex(h % 360, 0.7); };

/** Estilo de la tarjeta de una asignatura en el horario. */
export function estiloAsignatura(nombre: string, colores: Record<string, string>): { className: string; style: CSSProperties } {
  const c = colores[nombre];
  const hex = typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : porNombre(nombre);
  // La letra va blanca sobre colores oscuros y casi negra sobre claros, para leerse siempre.
  const n = parseInt(hex.slice(1), 16);
  const luz = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return { className: "", style: { backgroundColor: hex, borderColor: hex, color: luz < 0.6 ? "#ffffff" : "#111827" } };
}

/** Mapa nombre → "#rrggbb" del colegio (se pide una vez). */
export function useColoresAsignaturas(): Record<string, string> {
  const [colores, setColores] = useState<Record<string, string>>({});
  useEffect(() => {
    apiRequest<{ colores: Record<string, string> }>("/api/horario/colores").then((r) => setColores(r.colores || {})).catch(() => null);
  }, []);
  return colores;
}
