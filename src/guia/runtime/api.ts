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
  /** Resumen de lo que el usuario VE en pantalla (ruta, títulos, botones). */
  pantalla?: string;
  /** Contexto de la guía activa (tarea que acompaña + paso actual). */
  guia_activa?: { titulo: string; paso: string };
}): Promise<GuiaChatResp> {
  return apiRequest<GuiaChatResp>("/api/guia/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Foto textual de la pantalla actual: Normi la usa como "ojos". */
export function resumenPantalla(): string {
  const partes: string[] = ["Ruta: " + window.location.pathname];
  const visibles = (sel: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((v) => v.offsetParent !== null);
  const titulos = visibles("h1,h2,h3")
    .map((v) => (v.textContent || "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 6);
  if (titulos.length) partes.push("Títulos: " + titulos.join(" | "));
  const botones = visibles('button, [role="tab"], a[href]')
    .map((v) => (v.textContent || "").trim().replace(/\s+/g, " "))
    .filter((t) => t && t.length <= 40);
  const unicos = [...new Set(botones)].slice(0, 50);
  if (unicos.length) partes.push("Botones visibles: " + unicos.join(" · "));
  return partes.join("\n").slice(0, 1500);
}
