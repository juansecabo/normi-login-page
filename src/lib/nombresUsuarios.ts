/**
 * Helpers para enriquecer rows de Estudiantes / Internos / Asignación Profesores
 * con los `nombres` y `apellidos` que ahora viven SOLO en `Usuarios` (Fase 10.E.19).
 *
 * Estrategia: dada una lista de rows con `id` numérico/cadena, hace UN solo
 * batch fetch a Usuarios y mergea los nombres por id. Si el caller necesita
 * orden alfabético, el sort se hace client-side después del merge.
 */
import { supabase } from "@/integrations/supabase/client";

export interface NombresUsuario {
  nombres: string;
  apellidos: string;
  // Vive en Usuarios (antes en Estudiantes). Null para quien no la tenga.
  fecha_de_nacimiento: string | null;
}

/**
 * Batch lookup de nombres en `Usuarios` por una lista de ids.
 * Devuelve un Map<string-id, {nombres, apellidos, fecha_de_nacimiento}>.
 */
export async function fetchNombresPorIds(ids: Array<string | number>): Promise<Map<string, NombresUsuario>> {
  const map = new Map<string, NombresUsuario>();
  const unique = [...new Set(ids.map((v) => String(v)).filter(Boolean))];
  if (unique.length === 0) return map;

  // Chunking para no pasar el límite de IN (~1000).
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const { data } = await supabase
      .from("Usuarios")
      .select("id, nombres, apellidos, fecha_de_nacimiento")
      .in("id", slice);
    for (const u of (data || []) as Array<{ id: string | number; nombres: string | null; apellidos: string | null; fecha_de_nacimiento: string | null }>) {
      map.set(String(u.id), {
        nombres: u.nombres || "",
        apellidos: u.apellidos || "",
        fecha_de_nacimiento: u.fecha_de_nacimiento ?? null,
      });
    }
  }
  return map;
}

/**
 * Toma una lista de rows con `id` y le añade `nombres`/`apellidos` desde
 * `Usuarios`. Si una fila no tiene match (huérfana), queda con strings
 * vacíos en lugar de undefined para no romper renders.
 */
export async function enrichWithNombres<T extends { id: number | string }>(
  rows: T[],
): Promise<Array<T & NombresUsuario>> {
  if (rows.length === 0) return [];
  const map = await fetchNombresPorIds(rows.map((r) => r.id));
  return rows.map((r) => {
    const u = map.get(String(r.id));
    return { ...r, nombres: u?.nombres || "", apellidos: u?.apellidos || "", fecha_de_nacimiento: u?.fecha_de_nacimiento ?? null };
  });
}

/**
 * Cliente-side sort por apellidos, luego nombres (locale español).
 * Útil porque el `.order("apellidos")` server-side ya no es posible cuando
 * esos campos no están en la tabla original.
 */
export function sortByApellidosNombres<T extends { nombres?: string | null; apellidos?: string | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const sa = `${a.apellidos || ""} ${a.nombres || ""}`.toLowerCase();
    const sb = `${b.apellidos || ""} ${b.nombres || ""}`.toLowerCase();
    return sa.localeCompare(sb, "es");
  });
}

/**
 * Búsqueda de candidate ids en Usuarios cuando el usuario filtra por nombre.
 * Devuelve los ids que matchean cada palabra del query en `nombres` o
 * `apellidos`. Útil para filtrar Estudiantes/Internos/Asigprof por nombre
 * cuando la columna ya no existe en la tabla original.
 */
export async function buscarIdsPorNombre(query: string, limit: number = 500): Promise<string[]> {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  let q = supabase.from("Usuarios").select("id");
  for (const word of words) {
    q = q.or(`nombres.ilike.%${word}%,apellidos.ilike.%${word}%`);
  }
  const { data } = await q.limit(limit);
  return (data || []).map((u: any) => String(u.id));
}
