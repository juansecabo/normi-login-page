import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Orden canónico de grados. Incluye "Párvulo" (existe en el Pestalozziano, no en
 * la Normal). Sirve SOLO para ordenar; la lista real de grados de cada colegio
 * se deriva con gradosDelColegio() / useGradosColegio().
 */
export const ORDEN_GRADOS = [
  "Párvulo", "Prejardín", "Jardín", "Transición",
  "Primero", "Segundo", "Tercero", "Cuarto", "Quinto",
  "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo", "Undécimo",
] as const;

/** Posición canónica de un grado (para ordenar). Desconocidos al final. */
export const rankGrado = (g: string): number => {
  const i = (ORDEN_GRADOS as readonly string[]).indexOf(g);
  return i < 0 ? 999 : i;
};

/** Nivel al que pertenece cada grado (para agrupar/filtrar por nivel). */
export const NIVEL_DE_GRADO: Record<string, string> = {
  "Párvulo": "Preescolar", "Prejardín": "Preescolar", "Jardín": "Preescolar", "Transición": "Preescolar",
  "Primero": "Primaria", "Segundo": "Primaria", "Tercero": "Primaria", "Cuarto": "Primaria", "Quinto": "Primaria",
  "Sexto": "Secundaria", "Séptimo": "Secundaria", "Octavo": "Secundaria", "Noveno": "Secundaria",
  "Décimo": "Media", "Undécimo": "Media",
};

/**
 * Grados REALMENTE existentes en el colegio actual, derivados de la tabla
 * Estudiantes (el RLS / proxy filtra por colegio del JWT). Se ORDENAN por el
 * orden configurado en "Jornadas, grados y salones" (Grados_Colegio.orden); si
 * un grado no tiene orden configurado, cae al orden canónico (rankGrado). Se
 * incluyen TODOS los grados existentes.
 */
export async function gradosDelColegio(): Promise<string[]> {
  const [{ data: est }, { data: gc }] = await Promise.all([
    supabase.from("Estudiantes").select("grado"),
    supabase.from("Grados_Colegio").select("grado, orden"),
  ]);
  const existentes = [...new Set(
    ((est as { grado: string | null }[] | null) || []).map((r) => r.grado).filter(Boolean) as string[]
  )];
  const ordenMap = new Map<string, number>();
  for (const g of ((gc as { grado: string; orden: number | null }[] | null) || [])) {
    if (g.orden != null) ordenMap.set(g.grado, g.orden);
  }
  return existentes.sort((a, b) => (ordenMap.get(a) ?? rankGrado(a)) - (ordenMap.get(b) ?? rankGrado(b)));
}

/** Hook React: { grados, loading } con los grados del colegio actual. */
export function useGradosColegio(): { grados: string[]; loading: boolean } {
  const [grados, setGrados] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    gradosDelColegio()
      .then((g) => { if (!cancel) setGrados(g); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);
  return { grados, loading };
}
