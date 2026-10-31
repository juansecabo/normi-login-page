// Sonido corto ("pop") cuando Normi responde en "Pregúntale a Normi". Mismo
// sonido y método que el chat de anonimoslatam (lib/sonidoEnviado.js): Web Audio
// con el archivo pre-decodificado para que suene sin demora, volumen 0.28 y
// desbloqueo del audio al primer toque (iOS Safari no deja sonar sin eso).
// Revisado con earshot 2026-10-31: pop de burbuja de 0,17 s, pico -0,5 dBFS, sin recortes.

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let bufferPromise: Promise<AudioBuffer | null> | null = null;
let ganancia: GainNode | null = null;
let desbloqueado = false;
const VOLUMEN = 0.28;
const ARCHIVO = "/sonido-respuesta.mp3";

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    ganancia = ctx.createGain();
    ganancia.gain.value = VOLUMEN;
    ganancia.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function cargarBuffer(): Promise<AudioBuffer | null> {
  if (buffer) return Promise.resolve(buffer);
  if (bufferPromise) return bufferPromise;
  const c = getCtx();
  if (!c) return Promise.resolve(null);
  bufferPromise = (async () => {
    try {
      const res = await fetch(ARCHIVO);
      buffer = await c.decodeAudioData(await res.arrayBuffer());
      return buffer;
    } catch {
      bufferPromise = null;
      return null;
    }
  })();
  return bufferPromise;
}

function desbloquear() {
  if (desbloqueado) return;
  const c = getCtx();
  if (!c) return;
  desbloqueado = true;
  try {
    const silencio = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = silencio;
    src.connect(c.destination);
    src.start(0);
  } catch { /* noop */ }
}

/** Llamar al montar la pantalla: pre-carga el sonido y desbloquea el audio al primer toque. */
export function precargarSonidoRespuesta() {
  cargarBuffer();
  if (typeof window === "undefined" || desbloqueado) return;
  const handler = () => {
    desbloquear();
    window.removeEventListener("touchstart", handler);
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
  };
  window.addEventListener("touchstart", handler, { passive: true });
  window.addEventListener("pointerdown", handler, { passive: true });
  window.addEventListener("keydown", handler);
}

export function reproducirSonidoRespuesta() {
  const c = getCtx();
  if (!c || !ganancia) return;
  if (!buffer) { cargarBuffer(); return; }
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(ganancia);
  src.start(0);
}
