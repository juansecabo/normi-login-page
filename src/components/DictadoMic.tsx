import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botón de dictado por voz para los campos de mensaje (comunicados).
 *
 * MANTENER PRESIONADO para hablar (estilo nota de voz): mientras está
 * presionado transcribe EN VIVO con la Web Speech API del navegador (sin
 * costo de API); al soltar, se detiene. En navegadores sin soporte (p. ej.
 * Firefox) el botón no se renderiza.
 *
 * Contra el bug de Android Chrome (re-emite resultados acumulados y duplica
 * palabras): NO se acumula incrementalmente; en cada evento se reconstruye el
 * texto completo recorriendo ev.results desde 0. La "base" es lo que ya
 * estaba escrito antes de presionar (más lo consolidado si el navegador
 * reinicia la sesión por un silencio).
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

/** Mayúscula al inicio y después de . ! ? o salto de línea. */
function capitalizar(texto: string): string {
  return texto.replace(/(^|[.!?]\s+|\n\s*)([a-záéíóúüñ])/g, (_m, antes, letra) => antes + letra.toUpperCase());
}

const soportado =
  typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

const DictadoMic = ({ valor, setValor }: Props) => {
  const [escuchando, setEscuchando] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");
  const sesionRef = useRef(""); // lo transcrito en la sesión actual del reconocedor
  const presionadoRef = useRef(false);
  const setValorRef = useRef(setValor);
  setValorRef.current = setValor;

  const pintar = () => {
    const cuerpo = capitalizar(sesionRef.current.trim());
    setValorRef.current(baseRef.current + cuerpo);
  };

  const soltar = () => {
    presionadoRef.current = false;
    setEscuchando(false);
    // stop() (no abort) deja llegar el resultado final pendiente antes del onend.
    try {
      recRef.current?.stop();
    } catch {
      /* ya detenido */
    }
  };

  const presionar = () => {
    if (presionadoRef.current) return;
    const rec = crearReconocedor();
    if (!rec) return;
    presionadoRef.current = true;
    baseRef.current = valor ? valor.replace(/\s+$/, "") + " " : "";
    sesionRef.current = "";

    rec.onresult = (ev: any) => {
      // Reconstruir SIEMPRE desde 0: results es la lista completa de la sesión
      // (en Android los eventos repiten lo anterior; así no se duplica nada).
      let texto = "";
      for (let i = 0; i < ev.results.length; i++) {
        texto += String(ev.results[i][0]?.transcript || "");
      }
      sesionRef.current = texto;
      pintar();
    };

    rec.onerror = (ev: any) => {
      if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
        presionadoRef.current = false;
        setEscuchando(false);
        recRef.current = null;
        window.alert("No se pudo usar el micrófono. Revisa el permiso de micrófono del navegador.");
      }
    };

    rec.onend = () => {
      // Consolidar lo dicho en esta sesión dentro de la base.
      const cuerpo = capitalizar(sesionRef.current.trim());
      baseRef.current = cuerpo ? baseRef.current + cuerpo + " " : baseRef.current;
      sesionRef.current = "";
      if (presionadoRef.current) {
        // El navegador cortó por silencio pero el dedo sigue puesto: reanudar.
        try {
          rec.start();
          return;
        } catch {
          presionadoRef.current = false;
          setEscuchando(false);
        }
      }
      recRef.current = null;
      setValorRef.current(baseRef.current.replace(/\s+$/, ""));
    };

    recRef.current = rec;
    try {
      rec.start();
      setEscuchando(true);
    } catch {
      presionadoRef.current = false;
      recRef.current = null;
    }
  };

  // Al desmontar la página, soltar el micrófono.
  useEffect(
    () => () => {
      presionadoRef.current = false;
      try {
        recRef.current?.stop();
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
      title="Mantén presionado para dictar"
      aria-label="Mantén presionado para dictar"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        presionar();
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onPointerLeave={() => {
        if (presionadoRef.current) soltar();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`select-none touch-none ${
        escuchando ? "border-red-500 text-red-600 bg-red-50 hover:bg-red-100 animate-pulse" : ""
      }`}
    >
      <Mic className="h-4 w-4" />
    </Button>
  );
};

export default DictadoMic;
