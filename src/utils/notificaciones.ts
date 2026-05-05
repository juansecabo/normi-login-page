import { supabase } from "@/integrations/supabase/client";

// Obtener el último ID visto para una sección
export const getLastSeenId = async (seccion: string, id: string): Promise<number> => {
  try {
    const { data } = await supabase
      .from('Notificaciones_Vistas')
      .select('ultimo_id_visto')
      .eq('usuario_id', id)
      .eq('seccion', seccion)
      .single();

    if (data?.ultimo_id_visto !== null && data?.ultimo_id_visto !== undefined) {
      return data.ultimo_id_visto;
    }
  } catch {}
  return 0;
};

// Guardar el último ID visto (se llama al entrar a una sección)
export const markLastSeen = async (seccion: string, id: string, maxId: number) => {
  if (!maxId || maxId <= 0 || !Number.isFinite(maxId)) return;
  try {
    await supabase
      .from('Notificaciones_Vistas')
      .upsert(
        {
          usuario_id: id,
          seccion: seccion,
          ultimo_id_visto: maxId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'usuario_id,seccion' }
      );
  } catch {}
};

// Obtener todos los últimos IDs vistos de un usuario de una vez (para el dashboard)
export const getAllLastSeen = async (id: string): Promise<Record<string, number>> => {
  const result: Record<string, number> = {};
  try {
    const { data } = await supabase
      .from('Notificaciones_Vistas')
      .select('seccion, ultimo_id_visto')
      .eq('usuario_id', id);

    data?.forEach((row: any) => {
      if (row.ultimo_id_visto !== null && row.ultimo_id_visto !== undefined) {
        result[row.seccion] = row.ultimo_id_visto;
      }
    });
  } catch {}
  return result;
};

// Contar cuántos IDs son mayores que el último visto
export const countNewItems = (currentIds: (number | string)[], lastSeenId: number | undefined): number => {
  const threshold = lastSeenId ?? 0;
  return currentIds.filter(raw => {
    const id = typeof raw === 'string' ? Number(raw) : raw;
    return typeof id === 'number' && !isNaN(id) && id > threshold;
  }).length;
};
