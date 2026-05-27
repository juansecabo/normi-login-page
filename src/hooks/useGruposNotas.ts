import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import type { GrupoCalc } from "@/lib/gradeCalculator";

export interface GrupoNotas extends GrupoCalc {
  nombre: string;
  orden: number;
  id_profesor: number;
  asignatura: string;
  grado: string;
  salon: string;
  periodo: number;
  ano_escolar: number;
}

interface Aula {
  asignatura: string;
  grado: string;
  salon: string;
  periodo: number;
  ano_escolar: number;
}

/**
 * Carga los Grupos_Notas del aula actual. Si no hay grupos → modo plano.
 * Devuelve los grupos como vienen (sin construir árbol acá — eso lo hace el
 * editor visualmente). El cálculo recursivo (gradeCalculator) ya sabe leer
 * la lista plana con parent_id.
 */
export function useGruposNotas(aula: Aula | null) {
  const [grupos, setGrupos] = useState<GrupoNotas[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!aula) { setGrupos([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        asignatura: aula.asignatura,
        grado: aula.grado,
        salon: aula.salon,
        periodo: String(aula.periodo),
        ano_escolar: String(aula.ano_escolar),
      });
      const res = await apiClient.gruposNotas.list(params.toString());
      setGrupos((res.grupos || []) as GrupoNotas[]);
    } catch {
      setGrupos([]);
    } finally {
      setLoading(false);
    }
  }, [aula?.asignatura, aula?.grado, aula?.salon, aula?.periodo, aula?.ano_escolar]);

  useEffect(() => { reload(); }, [reload]);

  return { grupos, loading, reload, setGrupos };
}
