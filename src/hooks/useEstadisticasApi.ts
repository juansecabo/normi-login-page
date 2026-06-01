import { useEffect, useState } from "react";
import {
  apiClient,
  ApiInstitucional,
  ApiGrado,
  ApiSalon,
  ApiEstudianteStats,
  ApiAsignatura,
  ApiRiesgo,
  ApiMeta,
} from "@/lib/apiClient";

/**
 * Hooks que consumen los endpoints server-side de estadísticas.
 * Una sola llamada HTTP por vista — el server calcula todo y devuelve
 * ~10-30KB en vez de descargar 50k notas al browser.
 *
 * Para multi-tenant: el JWT del browser ya carga colegio_id, así que el
 * server filtra automáticamente al colegio del usuario.
 */

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const ordenGrados = [
  "Párvulo", "Prejardín", "Jardín", "Transición",
  "Primero", "Segundo", "Tercero", "Cuarto", "Quinto",
  "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo", "Undécimo",
];

export { ordenGrados };

function ord<T>(arr: T[], get: (x: T) => string): T[] {
  return [...arr].sort((a, b) => {
    const ia = ordenGrados.indexOf(get(a));
    const ib = ordenGrados.indexOf(get(b));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || get(a).localeCompare(get(b));
  });
}

function useApiCall<T>(fetcher: () => Promise<T>, deps: React.DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetcher()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err?.message || "Error" });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useEstadisticasMeta() {
  const s = useApiCall<ApiMeta>(() => apiClient.estadisticas.meta(), []);
  const grados = s.data ? ord(s.data.grados, (g) => g) : [];
  return { ...s, grados, salones: s.data?.salones || [], asignaturas: s.data?.asignaturas || [], asignaciones: s.data?.asignaciones_expandidas || [] };
}

export function useEstadisticasInstitucional(periodo: number | "anual") {
  return useApiCall<ApiInstitucional>(
    () => apiClient.estadisticas.institucional(periodo),
    [periodo],
  );
}

export function useEstadisticasGrado(grado: string | null, periodo: number | "anual") {
  return useApiCall<ApiGrado>(
    () => {
      if (!grado) return Promise.reject(new Error("Falta grado"));
      return apiClient.estadisticas.grado(grado, periodo);
    },
    [grado, periodo],
  );
}

export function useEstadisticasSalon(grado: string | null, salon: string | null, periodo: number | "anual") {
  return useApiCall<ApiSalon>(
    () => {
      if (!grado || !salon) return Promise.reject(new Error("Falta grado o salon"));
      return apiClient.estadisticas.salon(grado, salon, periodo);
    },
    [grado, salon, periodo],
  );
}

export function useEstadisticasEstudiante(id: string | null, periodo: number | "anual") {
  return useApiCall<ApiEstudianteStats>(
    () => {
      if (!id) return Promise.reject(new Error("Falta id"));
      return apiClient.estadisticas.estudiante(id, periodo);
    },
    [id, periodo],
  );
}

export function useEstadisticasAsignatura(
  asignatura: string | null,
  periodo: number | "anual",
  grado?: string,
  salon?: string,
) {
  const gradoEf = grado && grado !== "all" ? grado : undefined;
  const salonEf = salon && salon !== "all" ? salon : undefined;
  return useApiCall<ApiAsignatura>(
    () => {
      if (!asignatura) return Promise.reject(new Error("Falta asignatura"));
      return apiClient.estadisticas.asignatura(asignatura, periodo, gradoEf, salonEf);
    },
    [asignatura, periodo, gradoEf, salonEf],
  );
}

export function useEstadisticasRiesgo(
  periodo: number | "anual",
  grado?: string,
  salon?: string,
  asignatura?: string,
  umbral?: number,
) {
  const gradoEf = grado && grado !== "all" ? grado : undefined;
  const salonEf = salon && salon !== "all" ? salon : undefined;
  const asigEf = asignatura && asignatura !== "all" ? asignatura : undefined;
  return useApiCall<ApiRiesgo>(
    () => apiClient.estadisticas.riesgo(periodo, umbral, gradoEf, salonEf, asigEf),
    [periodo, gradoEf, salonEf, asigEf, umbral],
  );
}
