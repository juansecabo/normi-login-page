import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botón de dictado por voz para los campos de mensaje (comunicados).
 *
 * Usa la Web Speech API del navegador (SpeechRecognition): transcribe EN VIVO
 * mientras la persona habla, sin costo de API (el reconocimiento lo hace el
 * propio navegador). En navegadores sin soporte (p. ej. Firefox) el botón no
 * se renderiza.
 *
 * Cómo escribe: al iniciar toma el texto que ya había como "base" y va
 * poniendo base + frases confirmadas + frase provisional; así el usuario ve
 * la transcripción aparecer mientras habla y puede corregir después a mano.
 */

type Props = {
  valor: string;
  setValor: (v: string) => void;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: any) => void) | null;
};

function crearReconocedor(): SpeechRecognitionLike | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec: SpeechRecognitionLike = new Ctor();
  rec.lang = "es-CO";
  rec.continuous = true;
  rec.interimResults = true;
  return rec;
}

const soportado = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

const DictadoMic = ({ valor, setValor }: Props) => {
  const [escuchando, setEscuchando] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");
  const finalesRef = useRef("");
  const activoRef = useRef(false);
  // setValor puede cambiar de identidad entre renders; usar siempre el último.
  const setValorRef = useRef(setValor);
  setValorRef.current = setValor;

  const detener = () => {
    activoRef.current = false;
    setEscuchando(false);
    try {
      recRef.current?.stop();
    } catch {
      /* ya detenido */
    }
    recRef.current = null;
  };

  const iniciar = () => {
    const rec = crearReconocedor();
    if (!rec) return;
    // Base = lo que ya estaba escrito (con separador si hace falta).
    baseRef.current = valor ? valor.replace(/\s+$/, "") + " " : "";
    finalesRef.current = "";
    activoRef.current = true;

    rec.onresult = (ev: any) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const txt = String(r[0]?.transcript || "");
        if (r.isFinal) {
          const limpio = txt.trim();
          if (limpio) finalesRef.current += (finalesRef.current ? " " : "") + limpio;
        } else {
          interim += txt;
        }
      }
      const cuerpo = [finalesRef.current, interim.trim()].filter(Boolean).join(" ");
      setValorRef.current(baseRef.current + cuerpo);
    };

    rec.onerror = (ev: any) => {
      // Sin permiso de micrófono o servicio no disponible: apagar en voz baja.
      if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
        detener();
        window.alert("No se pudo usar el micrófono. Revisa el permiso de micrófono del navegador.");
      }
    };

    rec.onend = () => {
      // El navegador corta solo tras silencios largos: si el usuario no ha
      // detenido, reanudar para que el dictado sea continuo.
      if (activoRef.current) {
        // Consolidar lo dicho hasta ahora como nueva base.
        baseRef.current = baseRef.current + (finalesRef.current ? finalesRef.current + " " : "");
        finalesRef.current = "";
        try {
          rec.start();
        } catch {
          detener();
        }
      }
    };

    recRef.current = rec;
    try {
      rec.start();
      setEscuchando(true);
    } catch {
      recRef.current = null;
    }
  };

  // Al desmontar la página, soltar el micrófono.
  useEffect(() => () => detener(), []);

  if (!soportado) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      title={escuchando ? "Detener dictado" : "Dictar por voz"}
      aria-label={escuchando ? "Detener dictado" : "Dictar por voz"}
      onClick={() => (escuchando ? detener() : iniciar())}
      className={escuchando ? "border-red-500 text-red-600 bg-red-50 hover:bg-red-100 animate-pulse" : ""}
    >
      {escuchando ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
};

export default DictadoMic;
