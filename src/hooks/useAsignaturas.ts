import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Asignatura {
  id: number;
  nombre: string;
  activa: boolean;
  orden: number | null;
}

/**
 * Catálogo de asignaturas del colegio actual (vía RLS / dbProxy).
 *
 * Devuelve por separado las activas (para selects/checkboxes de profesores)
 * y todas (para la pantalla de administración).
 */
export function useAsignaturas() {
  const [todas, setTodas] = useState<Asignatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("Asignaturas")
      .select("id, nombre, activa, orden")
      .order("orden", { ascending: true, nullsFirst: false })
      .order("nombre", { ascending: true });
    if (error) {
      setError(error.message);
      setTodas([]);
    } else {
      setError(null);
      setTodas((data || []) as Asignatura[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const activas = todas.filter((a) => a.activa);

  return { todas, activas, loading, error, refrescar };
}
