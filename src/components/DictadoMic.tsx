import { useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";

/**
 * Botón de dictado por voz para los campos de mensaje (comunicados).
 *
 * MANTENER PRESIONADO para hablar (estilo nota de voz): mientras está
 * presionado GRABA con MediaRecorder; al soltar, el audio se transcribe en el
 * server con Whisper (POST /api/transcribir) y el texto se agrega al campo.
 *
 * Se abandonó la Web Speech API del navegador: en Android Chrome duplicaba
 * palabras sin remedio y no existirá en una app nativa. Whisper es consistente
 * en todos los dispositivos, puntúa y capitaliza solo, y cuesta ~US$0.006 por
 * minuto de audio.
 */

type Props = {
  valor: string;
  setValor: (v: string) => void;
};

const soportado = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

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

const DictadoMic = ({ valor, setValor }: Props) => {
  const [grabando, setGrabando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const presionadoRef = useRef(false);
  const valorRef = useRef(valor);
  valorRef.current = valor;
  const setValorRef = useRef(setValor);
  setValorRef.current = setValor;

  const limpiarStream = () => {
    try {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* nada */
    }
    recorderRef.current = null;
  };

  const transcribir = async (blob: Blob, mime: string) => {
    if (blob.size < 1500) return; // toque accidental: no hay audio real
    setTranscribiendo(true);
    try {
      const buf = await blob.arrayBuffer();
      // Buffer → base64 por tramos (evita desbordar la pila con audios largos).
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

  const presionar = async () => {
    if (presionadoRef.current || transcribiendo) return;
    presionadoRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Si soltó mientras salía el permiso, no arrancar.
      if (!presionadoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
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
        limpiarStream();
        void transcribir(blob, tipo);
      };
      recorderRef.current = rec;
      rec.start();
      setGrabando(true);
    } catch {
      presionadoRef.current = false;
      setGrabando(false);
      window.alert("No se pudo usar el micrófono. Revisa el permiso de micrófono del navegador.");
    }
  };

  const soltar = () => {
    if (!presionadoRef.current) return;
    presionadoRef.current = false;
    setGrabando(false);
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      } else {
        limpiarStream();
      }
    } catch {
      limpiarStream();
    }
  };

  // Al desmontar la página, soltar el micrófono.
  useEffect(
    () => () => {
      presionadoRef.current = false;
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      } catch {
        /* nada */
      }
    },
    [],
  );

  if (!soportado) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={transcribiendo}
      title={transcribiendo ? "Transcribiendo..." : "Mantén presionado para dictar"}
      aria-label={transcribiendo ? "Transcribiendo" : "Mantén presionado para dictar"}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        void presionar();
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onPointerLeave={() => {
        if (presionadoRef.current) soltar();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`select-none touch-none ${
        grabando ? "border-red-500 text-red-600 bg-red-50 hover:bg-red-100 animate-pulse" : ""
      }`}
    >
      {transcribiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
};

export default DictadoMic;
