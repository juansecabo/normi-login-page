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
  fecha_creacion?: string;
}

interface Aula {
  asignatura: string;
  grado: string;
  salon: string;
  /** Si se pasa, filtra solo grupos de ese periodo. Si se omite, trae todos. */
  periodo?: number;
  ano_escolar: number;
}

/**
 * Carga los Grupos_Notas del aula actual. Si no hay grupos → modo plano.
 * Por defecto trae los 4 periodos (el calculador puede necesitar cualquiera);
 * el editor visual filtra por periodo al renderizar.
 */
export function useGruposNotas(aula: Aula | null) {
  const [grupos, setGrupos] = useState<GrupoNotas[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!aula) { setGrupos([]); return; }
    setLoading(true);
    try {
      // Si no se especifica periodo, traemos los 4 periodos haciendo 4 calls
      // en paralelo. El endpoint hoy exige el periodo en la query.
      const periodos = aula.periodo ? [aula.periodo] : [1, 2, 3, 4];
      const todos: GrupoNotas[] = [];
      await Promise.all(periodos.map(async (p) => {
        const params = new URLSearchParams({
          asignatura: aula.asignatura,
          grado: aula.grado,
          salon: aula.salon,
          periodo: String(p),
          ano_escolar: String(aula.ano_escolar),
        });
        const res = await apiClient.gruposNotas.list(params.toString());
        todos.push(...((res.grupos || []) as GrupoNotas[]));
      }));
      setGrupos(todos);
    } catch {
      setGrupos([]);
    } finally {
      setLoading(false);
    }
  }, [aula?.asignatura, aula?.grado, aula?.salon, aula?.periodo, aula?.ano_escolar]);

  useEffect(() => { reload(); }, [reload]);

  return { grupos, loading, reload, setGrupos };
}
