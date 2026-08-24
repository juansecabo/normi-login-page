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

  // Ondas estilo WhatsApp: barras verticales según el volumen del micrófono.
  const dibujarOndas = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const datos = new Uint8Array(analyser.frequencyBinCount);
    const barras = 24;
    const historial: number[] = new Array(barras).fill(4);

    const frame = () => {
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(datos);
      // Volumen RMS del tramo actual → altura de la barra nueva.
      let suma = 0;
      for (let i = 0; i < datos.length; i++) {
        const d = (datos[i] - 128) / 128;
        suma += d * d;
      }
      const rms = Math.sqrt(suma / datos.length);
      historial.push(Math.max(4, Math.min(1, rms * 6) * canvas.height));
      if (historial.length > barras) historial.shift();

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#dc2626";
      const ancho = canvas.width / barras;
      for (let i = 0; i < historial.length; i++) {
        const h = historial[i];
        const x = i * ancho;
        const y = (canvas.height - h) / 2;
        ctx.beginPath();
        ctx.roundRect(x + 1, y, ancho - 2, h, 2);
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
      <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-2 py-1">
        <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
        <span className="text-sm font-medium tabular-nums text-red-700">{formatearTiempo(segundos)}</span>
        <canvas ref={canvasRef} width={120} height={28} className="h-7 w-[120px]" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Detener y transcribir"
          aria-label="Detener y transcribir"
          onClick={detener}
          className="border-red-500 text-red-600 bg-white hover:bg-red-100"
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
