import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";

/**
 * Aulas ("Grado|Salon") donde el usuario dicta ALGUNA asignatura, cuando su
 * sesión es de Profesor(a) — derivadas de su carga en "Asignación Profesores"
 * (producto Grado(s) × Salon(es) de cada fila). Devuelve null cuando NO hay
 * restricción (otros cargos). Un profesor sin carga → Set vacío (no ve nada).
 * Lo usan las vistas de staff de Permisos y Excusas: el profesor (director o
 * no) solo ve lo de los estudiantes a los que les da clase.
 */
export function useAulasProfesor(): { aulasProfesor: Set<string> | null; cargadoAulas: boolean } {
  const [aulas, setAulas] = useState<Set<string> | null>(null);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s.cargo !== "Profesor(a)" || !s.id) { setCargado(true); return; }
    supabase.from("Asignación Profesores").select('"Grado(s)", "Salon(es)"').eq("id", parseInt(s.id))
      .then(({ data }) => {
        const set = new Set<string>();
        for (const r of (data || []) as any[]) {
          for (const g of (r["Grado(s)"] || []) as string[]) {
            for (const sal of (r["Salon(es)"] || []) as string[]) {
              set.add(`${g}|${String(sal)}`);
            }
          }
        }
        setAulas(set);
      })
      .then(() => setCargado(true), () => setCargado(true));
  }, []);

  return { aulasProfesor: aulas, cargadoAulas: cargado };
}
