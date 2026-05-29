import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { getSession } from "@/hooks/useSession";

export interface RangoDesempeno {
  label: string;
  min: number;
  max: number;
  color?: string;
}

export interface ColegioConfig {
  escala_min: number;
  escala_max: number;
  nota_aprobatoria: number;
  decimales: number;
  rangos_desempeno: RangoDesempeno[];
  [k: string]: unknown;
}

const DEFAULT_CONFIG: ColegioConfig = {
  escala_min: 0,
  escala_max: 5,
  nota_aprobatoria: 3,
  decimales: 1,
  rangos_desempeno: [
    { label: "Excelente", min: 4.5, max: 5.0001, color: "#16a34a" },
    { label: "Sobresaliente", min: 4.0, max: 4.5, color: "#22c55e" },
    { label: "Aceptable", min: 3.0, max: 4.0, color: "#eab308" },
    { label: "Insuficiente", min: 2.0, max: 3.0, color: "#f97316" },
    { label: "Deficiente", min: 0.0, max: 2.0, color: "#dc2626" },
  ],
};

let cached: { nombre: string; logoUrl: string | null; config: ColegioConfig; expiresAt: number; colegioId: string | null } | null = null;
const TTL_MS = 60_000;

const colegioActualId = (): string | null => {
  try { return getSession().colegio_id || null; } catch { return null; }
};
// Cache válido solo si no expiró Y es del colegio activo. Así, al "Cambiar perfil"
// a otro colegio, el escudo/nombre/escala se refrescan en vez de quedarse pegados.
const cacheValido = (): boolean =>
  !!cached && cached.expiresAt > Date.now() && cached.colegioId === colegioActualId();

/**
 * Config del colegio actual: nombre, escala, nota aprobatoria, rangos de desempeño, etc.
 * Se carga desde Supabase (RLS hace el filtrado por colegio) y se cachea 60s.
 *
 * Todos los componentes que muestran notas o rangos deben usar esto en lugar
 * de constantes hardcodeadas (3.0, 4.5, etc).
 */
export function useColegioConfig() {
  const [nombre, setNombre] = useState<string>(() => (cacheValido() ? cached!.nombre : ""));
  const [logoUrl, setLogoUrl] = useState<string | null>(() => (cacheValido() ? cached!.logoUrl : null));
  const [config, setConfig] = useState<ColegioConfig>(() => (cacheValido() ? cached!.config : DEFAULT_CONFIG));
  const [loading, setLoading] = useState(!cacheValido());

  // Reacciona al colegio de la sesión: al cambiar de perfil (otro colegio) se re-pide.
  const sesionColegioId = colegioActualId();

  useEffect(() => {
    if (cacheValido()) {
      setNombre(cached!.nombre);
      setLogoUrl(cached!.logoUrl);
      setConfig(cached!.config);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancel = false;
    (async () => {
      try {
        const res = await apiRequest<{ nombre: string; logo_url: string | null; config: Partial<ColegioConfig> | null }>(
          "/api/colegio/config",
        );
        if (cancel) return;
        const cfg: ColegioConfig = res.config
          ? { ...DEFAULT_CONFIG, ...res.config } as ColegioConfig
          : DEFAULT_CONFIG;
        if (!Array.isArray(cfg.rangos_desempeno) || cfg.rangos_desempeno.length === 0) {
          cfg.rangos_desempeno = DEFAULT_CONFIG.rangos_desempeno;
        }
        const nom = res.nombre || "";
        const lu = res.logo_url || null;
        cached = { nombre: nom, logoUrl: lu, config: cfg, expiresAt: Date.now() + TTL_MS, colegioId: colegioActualId() };
        setNombre(nom);
        setLogoUrl(lu);
        setConfig(cfg);
        setLoading(false);
      } catch {
        if (cancel) return;
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [sesionColegioId]);

  return { nombre, logoUrl, config, loading };
}

/** Invalida la cache (úsalo cuando el rector modifica la config). */
export function invalidarColegioConfigCache() {
  cached = null;
}

/** Banda de desempeño para una nota dada según la config del colegio. */
export function bandaDesempeno(nota: number, rangos: RangoDesempeno[]): RangoDesempeno | null {
  for (const r of rangos) {
    if (nota >= r.min && nota < r.max) return r;
  }
  return null;
}

/** Color hex de la banda donde cae la nota; gris si no encaja. */
export function colorDeNota(nota: number, rangos: RangoDesempeno[]): string {
  const b = bandaDesempeno(nota, rangos);
  return b?.color || "#94a3b8";
}

/** Formatea "4.5/5" o "8.7/10" según los decimales y escala_max del colegio. */
export function formatNota(nota: number | null | undefined, cfg: ColegioConfig): string {
  if (nota === null || nota === undefined || Number.isNaN(nota)) return "—";
  return `${nota.toFixed(cfg.decimales)}/${cfg.escala_max}`;
}

/** ¿La nota aprueba según el umbral del colegio? */
export function aprobado(nota: number, cfg: ColegioConfig): boolean {
  return nota >= cfg.nota_aprobatoria;
}

/**
 * Devuelve "success" | "blue" | "warning" | "danger" para una nota.
 * Esquema 4-cubetas: banda más alta → success, segunda → blue,
 * resto aprobado → warning, reprobado → danger.
 * Pensado para TarjetaResumen / colores de KPI.
 */
export function colorBucket4(nota: number, cfg: ColegioConfig): "success" | "blue" | "warning" | "danger" {
  if (nota < cfg.nota_aprobatoria) return "danger";
  const rangos = cfg.rangos_desempeno;
  const top = rangos[0];
  const second = rangos[1];
  if (top && nota >= top.min) return "success";
  if (second && nota >= second.min) return "blue";
  return "warning";
}

/**
 * Esquema 3-cubetas: banda más alta → success, resto aprobado → warning, reprobado → danger.
 */
export function colorBucket3(nota: number, cfg: ColegioConfig): "success" | "warning" | "danger" {
  if (nota < cfg.nota_aprobatoria) return "danger";
  const top = cfg.rangos_desempeno[0];
  if (top && nota >= top.min) return "success";
  return "warning";
}

/**
 * Devuelve clase Tailwind para texto coloreado según la nota.
 * Usa los tonos default tailwind alineados con los buckets.
 */
export function textClassPorNota(nota: number, cfg: ColegioConfig): string {
  const b = colorBucket4(nota, cfg);
  if (b === "success") return "text-green-600";
  if (b === "blue") return "text-blue-600";
  if (b === "warning") return "text-amber-600";
  return "text-red-600";
}

/** Igual que textClassPorNota pero devuelve la clase background. */
export function bgClassPorNota(nota: number, cfg: ColegioConfig): string {
  const b = colorBucket4(nota, cfg);
  if (b === "success") return "bg-green-50";
  if (b === "blue") return "bg-blue-50";
  if (b === "warning") return "bg-amber-50";
  return "bg-red-50";
}

/** Texto + fondo combinados (para badges). */
export function badgeClassPorNota(nota: number, cfg: ColegioConfig): string {
  const b = colorBucket4(nota, cfg);
  if (b === "success") return "text-green-600 bg-green-50";
  if (b === "blue") return "text-blue-600 bg-blue-50";
  if (b === "warning") return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}

/** Color hex (para graficos recharts) alineado con los buckets. */
export function hexPorNota(nota: number, cfg: ColegioConfig): string {
  const b = colorBucket4(nota, cfg);
  if (b === "success") return "#10B981";
  if (b === "blue") return "#3B82F6";
  if (b === "warning") return "#F59E0B";
  return "#EF4444";
}
