// "Normi te guía" — provider global: estado del chat + motor de la guía.
//
// Modelo: el USUARIO hace todos los clicks. Normi solo SEÑALA (borde de luz)
// dónde tocar y narra. No hay sombreado del resto de la pantalla ni cursor
// falso ni botón Continúa: la guía avanza sola cuando el usuario hace lo que
// Normi señaló (click en el elemento, elegir en la lista, escribir y salir del
// campo). Solo existe Detener, y un campo para escribirle a Normi en el camino.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { Capacidad, Paso } from "../tipos";
import { capacidadesLite, capacidadPorId, guiaDisponible } from "../lite";
import { guiaChat, type GuiaTurn } from "./api";
import { GuiaPanel } from "./GuiaPanel";
import { GuiaCursor } from "./GuiaCursor";

interface GuiaPropuesta {
  capacidad: Capacidad;
  parametros: Record<string, string>;
}

interface GuiaContextValue {
  disponible: boolean;
  abierto: boolean;
  abrir: () => void;
  cerrar: () => void;
  mensajes: GuiaTurn[];
  enviando: boolean;
  enviar: (texto: string) => void;
  guiaPropuesta: GuiaPropuesta | null;
  iniciarGuia: () => void;
  // Guía en ejecución
  ejecutando: boolean;
  pasoIdx: number;
  totalPasos: number;
  narracion: string;
  rect: DOMRect | null;
  detener: () => void;
  /** Pregunta libre a Normi durante la guía. */
  preguntar: (texto: string) => void;
  /** Última respuesta de Normi dentro de la guía (se muestra en el globo). */
  respuesta: string | null;
  preguntando: boolean;
}

const GuiaContext = createContext<GuiaContextValue | null>(null);

export function useGuia(): GuiaContextValue {
  const ctx = useContext(GuiaContext);
  if (!ctx) throw new Error("useGuia fuera de GuiaProvider");
  return ctx;
}

const normTxt = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Etiqueta entre comillas de la narración (ej: toca 'Agregar actividad'). */
function etiquetaDe(narracion: string): string | null {
  const m = narracion.match(/['"“”‘’]([^'"“”‘’]{2,})['"“”‘’]/);
  return m ? m[1] : null;
}

const textoDe = (el: HTMLElement): string =>
  el.textContent ||
  el.getAttribute("aria-label") ||
  el.getAttribute("title") ||
  (el as HTMLInputElement).placeholder ||
  "";

/** Busca un elemento clickeable visible por su texto (tildes/mayúsculas flexible). */
function buscarPorTexto(label: string): HTMLElement | null {
  const objetivo = normTxt(label);
  if (!objetivo) return null;
  const sel =
    'button, [role="menuitem"], [role="tab"], a[href], [role="button"], [role="option"], label';
  const cands = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(
    (el) => el.offsetParent !== null,
  );
  return (
    cands.find((el) => normTxt(textoDe(el)) === objetivo) ||
    cands.find((el) => normTxt(textoDe(el)).includes(objetivo)) ||
    null
  );
}

/** Localiza el objetivo de un paso: por ancla (data-guia) o por su texto. */
function localizar(paso: Paso): HTMLElement | null {
  if (paso.ancla) {
    const el = document.querySelector<HTMLElement>(`[data-guia="${paso.ancla}"]`);
    if (el) return el;
  }
  const label = etiquetaDe(paso.narracion || "");
  if (label) return buscarPorTexto(label);
  return null;
}

const SALUDO: GuiaTurn = {
  role: "assistant",
  content:
    "Hola, soy Normi. Dime qué quieres hacer en la plataforma y te voy guiando paso a paso.",
};

export function GuiaProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<GuiaTurn[]>([SALUDO]);
  const [enviando, setEnviando] = useState(false);
  const [guiaPropuesta, setGuiaPropuesta] = useState<GuiaPropuesta | null>(null);

  const [ejecutando, setEjecutando] = useState(false);
  const [pasoIdx, setPasoIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [preguntando, setPreguntando] = useState(false);

  const capacidadRef = useRef<Capacidad | null>(null);
  const pasoIdxRef = useRef(0);
  const mensajesRef = useRef<GuiaTurn[]>(mensajes);
  mensajesRef.current = mensajes;
  // Limpiadores del paso actual (listeners, timeouts, polls).
  const cleanupsRef = useRef<Array<() => void>>([]);
  const avanzarRef = useRef<() => void>(() => {});

  const disponible = guiaDisponible();

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);

  const limpiarPaso = () => {
    for (const fn of cleanupsRef.current) fn();
    cleanupsRef.current = [];
  };

  const enviar = useCallback(
    async (texto: string) => {
      const t = texto.trim();
      if (!t || enviando) return;
      const nuevos: GuiaTurn[] = [...mensajes, { role: "user", content: t }];
      setMensajes(nuevos);
      setEnviando(true);
      setGuiaPropuesta(null);
      try {
        const resp = await guiaChat({
          message: t,
          history: nuevos.filter((m) => m !== SALUDO).slice(-8),
          capacidades: capacidadesLite(),
        });
        setMensajes((prev) => [...prev, { role: "assistant", content: resp.text }]);
        if (resp.guia) {
          const cap = capacidadPorId(resp.guia.capacidad_id);
          if (cap) setGuiaPropuesta({ capacidad: cap, parametros: resp.guia.parametros || {} });
        }
      } catch {
        setMensajes((prev) => [
          ...prev,
          { role: "assistant", content: "Uy, algo falló. ¿Lo intentamos de nuevo?" },
        ]);
      } finally {
        setEnviando(false);
      }
    },
    [mensajes, enviando],
  );

  /** Detecta que el usuario ya hizo lo del paso, y avanza solo. */
  const armarAvance = (paso: Paso, el: HTMLElement) => {
    if (paso.accion === "seleccionar") {
      // Avanza cuando el valor mostrado cambia (sirve para select nativo y Radix).
      const leer = () =>
        normTxt(
          el instanceof HTMLSelectElement ? el.options[el.selectedIndex]?.text || "" : el.textContent || "",
        );
      const inicial = leer();
      const iv = window.setInterval(() => {
        const ahora = leer();
        if (ahora && ahora !== inicial) {
          window.clearInterval(iv);
          window.setTimeout(() => avanzarRef.current(), 250);
        }
      }, 300);
      cleanupsRef.current.push(() => window.clearInterval(iv));
      return;
    }
    if (paso.accion === "escribir") {
      const input = el as HTMLInputElement | HTMLTextAreaElement;
      const listo = () => {
        if (!input.value.trim()) return;
        quitar();
        window.setTimeout(() => avanzarRef.current(), 150);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) listo();
      };
      const onBlur = () => listo();
      const quitar = () => {
        input.removeEventListener("keydown", onKey);
        input.removeEventListener("blur", onBlur);
      };
      input.addEventListener("keydown", onKey);
      input.addEventListener("blur", onBlur);
      cleanupsRef.current.push(quitar);
      return;
    }
    // click (y cualquier otro accionable): avanza al hacer click en el objetivo.
    const onClick = () => {
      quitar();
      window.setTimeout(() => avanzarRef.current(), 200);
    };
    const quitar = () => el.removeEventListener("click", onClick);
    el.addEventListener("click", onClick);
    cleanupsRef.current.push(quitar);
  };

  const entrarPaso = useCallback(
    (cap: Capacidad, idx: number) => {
      const paso = cap.pasos[idx];
      if (!paso) return;
      limpiarPaso();
      setRect(null);
      setRespuesta(null);

      if (paso.accion === "navegar" && paso.ruta) {
        navigate(paso.ruta);
        const t = window.setTimeout(() => avanzarRef.current(), 900);
        cleanupsRef.current.push(() => window.clearTimeout(t));
        return;
      }
      if (paso.accion === "explicar" || paso.accion === "esperar") {
        // Solo narración: se lee y sigue solo.
        const t = window.setTimeout(() => avanzarRef.current(), 3500);
        cleanupsRef.current.push(() => window.clearTimeout(t));
        return;
      }

      // Localiza el objetivo con reintentos (páginas/menús que cargan async).
      let vivo = true;
      cleanupsRef.current.push(() => {
        vivo = false;
      });
      let intentos = 0;
      const buscar = () => {
        if (!vivo) return;
        const el = localizar(paso);
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          window.setTimeout(() => {
            if (!vivo) return;
            setRect(el.getBoundingClientRect());
            armarAvance(paso, el);
          }, 250);
          return;
        }
        if (++intentos < 14) {
          window.setTimeout(buscar, 300);
          return;
        }
        // Respaldo: no se encontró qué señalar (ej. "elige el periodo", donde
        // la opción depende del usuario). Se narra igual y la guía avanza con
        // el siguiente click del usuario, asumiendo que siguió la instrucción.
        const onDocClick = (e: MouseEvent) => {
          // Los clicks dentro del globo de Normi (escribirle, Detener) no cuentan.
          if ((e.target as HTMLElement)?.closest?.("[data-guia-ui]")) return;
          document.removeEventListener("click", onDocClick, true);
          window.setTimeout(() => avanzarRef.current(), 250);
        };
        document.addEventListener("click", onDocClick, true);
        cleanupsRef.current.push(() => document.removeEventListener("click", onDocClick, true));
      };
      window.setTimeout(buscar, 300);
    },
    [navigate],
  );

  const terminar = useCallback(() => {
    limpiarPaso();
    setEjecutando(false);
    setRect(null);
    capacidadRef.current = null;
    setMensajes((prev) => [
      ...prev,
      { role: "assistant", content: "Listo, terminamos esta guía. ¿Te ayudo con algo más?" },
    ]);
    setAbierto(true);
  }, []);

  const avanzar = useCallback(() => {
    const cap = capacidadRef.current;
    if (!cap) return;
    const sig = pasoIdxRef.current + 1;
    if (sig >= cap.pasos.length) {
      terminar();
      return;
    }
    pasoIdxRef.current = sig;
    setPasoIdx(sig);
    entrarPaso(cap, sig);
  }, [entrarPaso, terminar]);

  useEffect(() => {
    avanzarRef.current = avanzar;
  }, [avanzar]);

  const iniciarGuia = useCallback(() => {
    if (!guiaPropuesta) return;
    capacidadRef.current = guiaPropuesta.capacidad;
    pasoIdxRef.current = 0;
    setEjecutando(true);
    setPasoIdx(0);
    setAbierto(false); // el chat se recoge; queda el globo de Normi
    entrarPaso(guiaPropuesta.capacidad, 0);
  }, [guiaPropuesta, entrarPaso]);

  const detener = useCallback(() => {
    limpiarPaso();
    setEjecutando(false);
    setRect(null);
    capacidadRef.current = null;
    setMensajes((prev) => [
      ...prev,
      { role: "assistant", content: "Detuvimos la guía. Aquí sigo si quieres intentar otra cosa." },
    ]);
    setAbierto(true);
  }, []);

  /** Pregunta libre a Normi durante la guía (sin salir del modo guía). */
  const preguntar = useCallback(
    async (texto: string) => {
      const t = texto.trim();
      if (!t || preguntando) return;
      setPreguntando(true);
      setMensajes((prev) => [...prev, { role: "user", content: t }]);
      try {
        const resp = await guiaChat({
          message: t,
          history: mensajesRef.current.filter((m) => m !== SALUDO).slice(-8),
          capacidades: capacidadesLite(),
        });
        setRespuesta(resp.text);
        setMensajes((prev) => [...prev, { role: "assistant", content: resp.text }]);
      } catch {
        setRespuesta("Uy, algo falló. Inténtalo de nuevo.");
      } finally {
        setPreguntando(false);
      }
    },
    [preguntando],
  );

  // Reposiciona el borde de luz al hacer scroll/resize mientras se ejecuta.
  useEffect(() => {
    if (!ejecutando) return;
    const recompute = () => {
      const cap = capacidadRef.current;
      const paso = cap?.pasos[pasoIdxRef.current];
      if (!paso) return;
      const el = localizar(paso);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [ejecutando]);

  const cap = capacidadRef.current;
  const pasoActual = cap && ejecutando ? cap.pasos[pasoIdx] ?? null : null;

  const value: GuiaContextValue = {
    disponible,
    abierto,
    abrir,
    cerrar,
    mensajes,
    enviando,
    enviar,
    guiaPropuesta,
    iniciarGuia,
    ejecutando,
    pasoIdx,
    totalPasos: cap ? cap.pasos.length : 0,
    narracion: pasoActual?.narracion || "",
    rect,
    detener,
    preguntar,
    respuesta,
    preguntando,
  };

  return (
    <GuiaContext.Provider value={value}>
      {children}
      {disponible && <GuiaPanel />}
      {disponible && <GuiaCursor />}
    </GuiaContext.Provider>
  );
}
