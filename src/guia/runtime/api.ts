// "Normi te guía" — llamada al cerebro (server).
import { apiRequest } from "@/lib/apiClient";

export interface GuiaLite {
  id: string;
  titulo: string;
  descripcion?: string;
  requisitos?: { entidad: string; descripcion: string }[];
  sinonimos?: string[];
}

export interface GuiaTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GuiaChatResp {
  text: string;
  guia?: { capacidad_id: string; parametros: Record<string, string> };
}

export function guiaChat(body: {
  message: string;
  history: GuiaTurn[];
  capacidades: GuiaLite[];
}): Promise<GuiaChatResp> {
  return apiRequest<GuiaChatResp>("/api/guia/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
