import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";

/**
 * Botón de dictado por voz para los campos de mensaje (comunicados).
 *
 * Un toque inicia la grabación (MediaRecorder) y muestra, estilo WhatsApp,
 * las ondas de sonido en vivo y el tiempo transcurrido; otro toque detiene y
 * el audio se transcribe en el server con Whisper (POST /api/transcribir),
 * agregando el texto al campo. Whisper puntúa y capitaliza solo y cuesta
 * ~US$0.006 por minuto; funciona igual en todos los navegadores y servirá
 * tal cual en una app nativa (la transcripción vive en el server).
 */

type Props = {
  valor: string;
  setValor: (v: string) => void;
};

const soportado =
  typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

function mejorMime(): string {
  const candidatos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const c of candidatos) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* seguir */
    }
  }
  return "";
}

/** Mayúscula al inicio y después de . ! ? o salto de línea (por si Whisper no lo hace). */
function capitalizar(texto: string): string {
  return texto.replace(/(^|[.!?]\s+|\n\s*)([a-záéíóúüñ])/g, (_m, antes, letra) => antes + letra.toUpperCase());
}

function colorPrimario(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    if (v) return `hsl(${v})`;
  } catch {
    /* fallback */
  }
  return "#16a34a";
}

function formatearTiempo(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const DictadoMic = ({ valor, setValor }: Props) => {
  const [grabando, setGrabando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const valorRef = useRef(valor);
  valorRef.current = valor;
  const setValorRef = useRef(setValor);
  setValorRef.current = setValor;

  const limpiarAudio = () => {
    cancelAnimationFrame(rafRef.current);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* nada */
    }
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* nada */
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
  };

  // Ondas estilo WhatsApp: barras delgadas que se desplazan con calma (una
  // barra nueva cada TICK_MS con el PICO de volumen de ese tramo, no 60/seg).
  const dibujarOndas = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Lienzo nítido al ancho REAL del contenedor (pantallas de alta densidad).
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(60, rect.width);
    const H = Math.max(20, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);

    const ANCHO_BARRA = 3;
    const HUECO = 2;
    const PASO = ANCHO_BARRA + HUECO;
    const barras = Math.floor(W / PASO);
    const TICK_MS = 120; // velocidad de avance de la onda
    const MIN_H = 3;

    const datos = new Uint8Array(analyser.frequencyBinCount);
    // Una barra de mas: es la que va entrando por la derecha mientras desliza.
    const historial: number[] = new Array(barras + 1).fill(MIN_H);
    const color = colorPrimario();
    let pico = 0;
    let ultimoTick = performance.now();

    const frame = (ahora: number) => {
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(datos);
      let suma = 0;
      for (let i = 0; i < datos.length; i++) {
        const d = (datos[i] - 128) / 128;
        suma += d * d;
      }
      const rms = Math.sqrt(suma / datos.length);
      if (rms > pico) pico = rms;

      if (ahora - ultimoTick >= TICK_MS) {
        ultimoTick = ahora;
        historial.push(Math.max(MIN_H, Math.min(1, pico * 5) * (H - 4)));
        while (historial.length > barras + 1) historial.shift();
        pico = 0;
      }

      // Deslizamiento continuo: entre tick y tick, todo se corre a la
      // izquierda una fraccion del paso (asi la onda fluye, no salta).
      const t = Math.min(1, (ahora - ultimoTick) / TICK_MS);
      const offset = PASO * t;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;
      for (let i = 0; i < historial.length; i++) {
        const h = historial[i];
        const x = i * PASO - offset;
        if (x + ANCHO_BARRA < 0 || x > W) continue;
        const y = (H - h) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, ANCHO_BARRA, h, 1.5);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  const transcribir = async (blob: Blob, mime: string) => {
    if (blob.size < 1500) return; // toque accidental sin audio real
    setTranscribiendo(true);
    try {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      const TRAMO = 0x8000;
      for (let i = 0; i < bytes.length; i += TRAMO) {
        bin += String.fromCharCode(...bytes.subarray(i, i + TRAMO));
      }
      const resp = await apiRequest<{ ok: boolean; texto: string }>("/api/transcribir", {
        method: "POST",
        body: JSON.stringify({ audio_base64: btoa(bin), mime }),
      });
      const texto = capitalizar((resp?.texto || "").trim());
      if (texto) {
        const base = valorRef.current ? valorRef.current.replace(/\s+$/, "") + " " : "";
        setValorRef.current(base + texto);
      }
    } catch (e) {
      console.error("[dictado] fallo transcripción:", e);
      window.alert("No se pudo transcribir el audio. Inténtalo de nuevo.");
    } finally {
      setTranscribiendo(false);
    }
  };

  const iniciar = async () => {
    if (grabando || transcribiendo) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = mejorMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const tipo = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: tipo });
        chunksRef.current = [];
        limpiarAudio();
        void transcribir(blob, tipo);
      };
      recorderRef.current = rec;

      // Analizador para las ondas.
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        const audioCtx: AudioContext = new AC();
        const fuente = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        fuente.connect(analyser);
        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;
      }

      rec.start();
      setSegundos(0);
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
      setGrabando(true);
      // El canvas se monta con el render de "grabando": dibujar en el próximo tick.
      setTimeout(dibujarOndas, 50);
    } catch {
      limpiarAudio();
      window.alert("No se pudo usar el micrófono. Revisa el permiso de micrófono del navegador.");
    }
  };

  const detener = () => {
    setGrabando(false);
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop(); // onstop limpia y transcribe
      } else {
        limpiarAudio();
      }
    } catch {
      limpiarAudio();
    }
  };

  // Al desmontar la página, soltar el micrófono.
  useEffect(
    () => () => {
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      } catch {
        /* nada */
      }
      limpiarAudio();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!soportado) return null;

  if (grabando) {
    return (
      <div className="flex w-full items-center gap-3 rounded-full border border-primary/30 bg-primary/10 py-1 pl-4 pr-1">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary animate-pulse" />
        <span className="shrink-0 text-sm font-medium tabular-nums text-primary">{formatearTiempo(segundos)}</span>
        <canvas ref={canvasRef} className="h-8 min-w-0 flex-1" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Detener y transcribir"
          aria-label="Detener y transcribir"
          onClick={detener}
          className="shrink-0 rounded-full border-primary text-primary bg-white hover:bg-primary/10"
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={transcribiendo}
      title={transcribiendo ? "Transcribiendo..." : "Dictar por voz"}
      aria-label={transcribiendo ? "Transcribiendo" : "Dictar por voz"}
      onClick={() => void iniciar()}
    >
      {transcribiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
};

export default DictadoMic;
