import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { rankGrado } from "@/utils/grados";

/**
 * Orden configurado por el colegio para niveles y grados (campo `orden` de las
 * tablas Niveles_Colegio / Grados_Colegio, editable en Configurar Institución).
 * Los selectores (Consultas, Enviar Comunicado, etc.) ordenan por ESTO, no por
 * una lista fija: así el rector decide el orden y vale para grados/niveles
 * personalizados. Respaldo canónico para lo que aún no tenga `orden`.
 */
const NIVEL_ORDEN = ["Preescolar", "Primaria", "Secundaria", "Media"];
const nivelCanon = (n: string): number => {
  const i = NIVEL_ORDEN.indexOf(n);
  return i < 0 ? 900 : i;
};

interface EstructuraResp {
  grados: { grado: string; orden: number | null }[];
  niveles: { nombre: string; orden: number | null }[];
}

export interface OrdenColegio {
  ready: boolean;
  nivelRank: (n: string) => number;
  gradoRank: (g: string) => number;
}

export function useEstructuraOrden(): OrdenColegio {
  const [nivelOrden, setNivelOrden] = useState<Record<string, number>>({});
  const [gradoOrden, setGradoOrden] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await apiRequest<EstructuraResp>("/api/institucion/estructura");
        if (cancel) return;
        const no: Record<string, number> = {};
        for (const n of r.niveles || []) if (n.orden != null) no[n.nombre] = n.orden;
        const go: Record<string, number> = {};
        for (const g of r.grados || []) if (g.orden != null) go[g.grado] = g.orden;
        setNivelOrden(no);
        setGradoOrden(go);
      } catch { /* sin config → respaldo canónico */ }
      finally { if (!cancel) setReady(true); }
    })();
    return () => { cancel = true; };
  }, []);

  const nivelRank = useCallback((n: string) => nivelOrden[n] ?? nivelCanon(n), [nivelOrden]);
  const gradoRank = useCallback((g: string) => gradoOrden[g] ?? rankGrado(g), [gradoOrden]);

  return { ready, nivelRank, gradoRank };
}
