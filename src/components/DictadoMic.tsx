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
 * Quirks de Android Chrome cubiertos:
 *  - Los eventos re-emiten TODA la transcripción acumulada de la sesión →
 *    en onresult se reconstruye desde 0, nunca se acumula.
 *  - El reconocimiento se corta solo cada pocas palabras (onend frecuente) y
 *    REUSAR la misma instancia conserva los resultados viejos (los duplica) →
 *    en cada reinicio se consolida lo dicho y se crea una instancia NUEVA.
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
  const baseRef = useRef(""); // texto previo + sesiones ya consolidadas
  const sesionRef = useRef(""); // transcripción de la sesión ACTUAL del reconocedor
  const presionadoRef = useRef(false);
  const setValorRef = useRef(setValor);
  setValorRef.current = setValor;

  const pintar = () => {
    const cuerpo = capitalizar(sesionRef.current.trim());
    setValorRef.current((baseRef.current + cuerpo).replace(/\s+$/, ""));
  };

  const consolidarSesion = () => {
    const cuerpo = capitalizar(sesionRef.current.trim());
    if (cuerpo) baseRef.current = baseRef.current + cuerpo + " ";
    sesionRef.current = "";
  };

  // Arranca UNA sesión del reconocedor. Siempre con instancia NUEVA: reusar la
  // misma en Android hace que re-emita (y duplique) lo ya transcrito.
  const iniciarSesion = () => {
    const rec = crearReconocedor();
    if (!rec) return false;

    rec.onresult = (ev: any) => {
      if (recRef.current !== rec) return; // sesión vieja: ignorar
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
      if (recRef.current !== rec) return; // ya la reemplazó otra sesión
      recRef.current = null;
      consolidarSesion();
      if (presionadoRef.current) {
        // Corte por silencio con el dedo aún puesto: nueva sesión limpia.
        if (iniciarSesion()) return;
        presionadoRef.current = false;
        setEscuchando(false);
      }
      setValorRef.current(baseRef.current.replace(/\s+$/, ""));
    };

    try {
      rec.start();
      recRef.current = rec;
      return true;
    } catch {
      return false;
    }
  };

  const presionar = () => {
    if (presionadoRef.current) return;
    presionadoRef.current = true;
    baseRef.current = valor ? valor.replace(/\s+$/, "") + " " : "";
    sesionRef.current = "";
    if (iniciarSesion()) {
      setEscuchando(true);
    } else {
      presionadoRef.current = false;
    }
  };

  const soltar = () => {
    if (!presionadoRef.current) return;
    presionadoRef.current = false;
    setEscuchando(false);
    // stop() (no abort) deja llegar el resultado final pendiente antes del onend.
    try {
      recRef.current?.stop();
    } catch {
      /* ya detenido */
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
