// "Normi te guía" — telemetría de sesión (solo Cailico, el server lo filtra).
// Guarda en Guia_Logs cada interacción: chat, pasos, cómo se señaló, qué causó
// cada avance, clicks del usuario, atascos y la foto textual de la pantalla.
// Sirve para analizar el comportamiento real y afinar el motor/los prompts.
import { apiRequest } from "@/lib/apiClient";
import { resumenPantalla } from "./api";

const sesion: string =
  (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
  `s${Date.now()}${Math.floor(Math.random() * 1e6)}`;

interface Evento {
  evento: string;
  datos: Record<string, unknown> | null;
  pantalla?: string;
  t: number;
}

let buffer: Evento[] = [];
let timer: number | null = null;

function flush() {
  timer = null;
  if (!buffer.length) return;
  const eventos = buffer.splice(0, 50);
  apiRequest("/api/guia/log", {
    method: "POST",
    body: JSON.stringify({ sesion, eventos }),
  }).catch(() => {});
}

/** Registra un evento; con conPantalla=true adjunta la foto textual actual. */
export function guiaLog(
  evento: string,
  datos?: Record<string, unknown>,
  conPantalla = false,
) {
  try {
    buffer.push({
      evento,
      datos: datos ?? null,
      pantalla: conPantalla ? resumenPantalla() : undefined,
      t: Date.now(),
    });
    if (buffer.length >= 10) flush();
    else if (timer == null) timer = window.setTimeout(flush, 3000);
  } catch {
    // la telemetría nunca debe romper la guía
  }
}
