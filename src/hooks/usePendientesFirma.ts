import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { hasValidSession } from "@/hooks/useSession";

/**
 * Conteo de comunicados con firma PENDIENTES por firmar del usuario logueado.
 * Se usa para el badge rojo de la ficha "Comunicados con firma" en cada
 * dashboard (staff y estudiante/acudiente — todos pueden recibir y firmar).
 */
export function usePendientesFirma(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!hasValidSession()) return;
    let activo = true;
    apiRequest<{ pendientes: number }>("/api/comunicados-firma/pendientes-count")
      .then((r) => { if (activo) setCount(r.pendientes || 0); })
      .catch(() => { /* sin badge si falla */ });
    return () => { activo = false; };
  }, []);
  return count;
}
