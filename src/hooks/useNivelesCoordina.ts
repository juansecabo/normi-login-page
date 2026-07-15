import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";

/**
 * Niveles que coordina el usuario cuando su sesión es de Coordinador(a)
 * (Internos.niveles_coordina). Devuelve null cuando NO hay restricción:
 * otros cargos, o coordinador sin niveles configurados (ve todo, igual que
 * antes). Lo usan las vistas de staff de Permisos y Excusas para mostrarle
 * al coordinador solo los estudiantes de su(s) nivel(es).
 */
export function useNivelesCoordina(): { nivelesCoordina: string[] | null; cargadoNiveles: boolean } {
  const [niveles, setNiveles] = useState<string[] | null>(null);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s.cargo !== "Coordinador(a)" || !s.id) { setCargado(true); return; }
    supabase.from("Internos").select("niveles_coordina").eq("id", parseInt(s.id)).maybeSingle()
      .then(({ data }) => {
        const n = (data as { niveles_coordina?: string[] } | null)?.niveles_coordina;
        setNiveles(Array.isArray(n) && n.length > 0 ? n.map(String) : null);
      })
      .then(() => setCargado(true), () => setCargado(true));
  }, []);

  return { nivelesCoordina: niveles, cargadoNiveles: cargado };
}
