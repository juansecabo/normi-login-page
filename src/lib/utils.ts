import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Remitente tal como debe verse en pantalla. Los avisos automáticos se guardan
 * con la etiqueta interna "Sistema Normi (X)" (X deriva el título y el
 * interruptor de notificaciones); para las personas el remitente es "Normi".
 */
export function remitenteVisible(remitente?: string | null): string {
  const r = (remitente || "").trim();
  return r.startsWith("Sistema Normi") ? "Normi" : r;
}
