import type { AsistenciaEstado } from "@/lib/apiClient";

/** Config visual única para los estados de asistencia (matriz, calendario, Excel). */
export const ESTADO_UI: Record<AsistenciaEstado, {
  label: string; corto: string; chip: string; cell: string; dot: string; excel: string;
}> = {
  presente: { label: "Presente", corto: "P", chip: "bg-emerald-100 text-emerald-700", cell: "bg-emerald-500", dot: "bg-emerald-500", excel: "FF16A34A" },
  ausente:  { label: "Ausente",  corto: "A", chip: "bg-rose-100 text-rose-700",       cell: "bg-rose-500",    dot: "bg-rose-500",    excel: "FFDC2626" },
  excusa:   { label: "Con excusa", corto: "E", chip: "bg-amber-100 text-amber-700",   cell: "bg-amber-400",   dot: "bg-amber-400",   excel: "FFF59E0B" },
};

export const ESTADOS_LISTA: AsistenciaEstado[] = ["presente", "ausente", "excusa"];

/** % de asistencia (presentes / total marcado) + desglose. */
export function resumen(regs: { estado: AsistenciaEstado }[]): { pct: number; p: number; a: number; e: number; total: number } {
  let p = 0, a = 0, e = 0;
  for (const r of regs) { if (r.estado === "presente") p++; else if (r.estado === "ausente") a++; else e++; }
  const total = p + a + e;
  return { pct: total ? Math.round((p / total) * 100) : 0, p, a, e, total };
}

/** Hoy en Bogotá, YYYY-MM-DD. */
export const hoyBogota = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Primer y último día (YYYY-MM-DD) del mes que contiene `fecha` (Date). */
export function rangoMes(d: Date): { desde: string; hasta: string } {
  const y = d.getFullYear(), m = d.getMonth();
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { desde: fmt(new Date(y, m, 1)), hasta: fmt(new Date(y, m + 1, 0)) };
}

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
