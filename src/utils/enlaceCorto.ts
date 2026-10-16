import { apiRequest } from "@/lib/apiClient";

/**
 * Enlace corto con código al azar (mundonormi.com/e/K7P2Q) para el aviso de
 * WhatsApp de un registro recién creado. null si falla: el aviso usa el texto de antes.
 */
export async function enlaceCorto(tipo: "e" | "s" | "x" | "u" | "p", id: number | string | null | undefined): Promise<string | null> {
  if (!id) return null;
  try {
    const r = await apiRequest<{ url?: string | null }>("/api/enlace", { method: "POST", body: JSON.stringify({ tipo, id }) });
    return r?.url || null;
  } catch {
    return null;
  }
}
