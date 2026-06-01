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
 * Estudiantes (el RLS / proxy filtra por colegio del JWT), ordenados según
 * ORDEN_GRADOS. Así cada colegio ve solo sus grados: el Pestalozziano incluye
 * "Párvulo" y la Normal no.
 */
export async function gradosDelColegio(): Promise<string[]> {
  const { data } = await supabase.from("Estudiantes").select("grado");
  const existentes = new Set(
    (data as { grado: string | null }[] | null)?.map((r) => r.grado).filter(Boolean) as string[] || []
  );
  return (ORDEN_GRADOS as readonly string[]).filter((g) => existentes.has(g));
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
