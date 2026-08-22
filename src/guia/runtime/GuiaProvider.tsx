// "Normi te guía" — provider global: estado del chat + motor del cursor.
// Se monta una sola vez (en App, dentro del Router) y expone todo por contexto.
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
  // Motor del cursor
  ejecutando: boolean;
  pasoIdx: number;
  totalPasos: number;
  pasoActual: Paso | null;
  narracion: string;
  rect: DOMRect | null;
  continuar: () => void;
  detener: () => void;
  aviso: boolean;
  mostrarAviso: () => void;
  ocultarAviso: () => void;
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

/** Busca un elemento clickeable visible por su texto (tildes/mayúsculas flexible). */
function buscarPorTexto(label: string): HTMLElement | null {
  const objetivo = normTxt(label);
  if (!objetivo) return null;
  const sel = 'button, [role="menuitem"], [role="tab"], a[href], [role="button"], label';
  const cands = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(
    (el) => el.offsetParent !== null,
  );
  return (
    cands.find((el) => normTxt(el.textContent || "") === objetivo) ||
    cands.find((el) => normTxt(el.textContent || "").includes(objetivo)) ||
    null
  );
}

/** Localiza el objetivo de un paso: por ancla (data-guia) o, si no, por su texto. */
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
  const [aviso, setAviso] = useState(false);

  const capacidadRef = useRef<Capacidad | null>(null);
  const paramsRef = useRef<Record<string, string>>({});

  const disponible = guiaDisponible();

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);

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
          // historial sin el saludo inicial
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

  // Localiza el ancla del paso y ejecuta la navegación si aplica.
  const entrarPaso = useCallback(
    (cap: Capacidad, idx: number) => {
      const paso = cap.pasos[idx];
      if (!paso) return;
      if (paso.accion === "navegar" && paso.ruta) {
        navigate(paso.ruta);
        setRect(null);
        return;
      }
      // Deja que el DOM se asiente antes de buscar el objetivo.
      setRect(null);
      window.setTimeout(() => {
        const el = localizar(paso);
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          window.setTimeout(() => setRect(el.getBoundingClientRect()), 300);
        } else {
          setRect(null); // no encontrado: solo narramos
        }
      }, 350);
    },
    [navigate],
  );

  const iniciarGuia = useCallback(() => {
    if (!guiaPropuesta) return;
    capacidadRef.current = guiaPropuesta.capacidad;
    paramsRef.current = guiaPropuesta.parametros || {};
    setEjecutando(true);
    setPasoIdx(0);
    entrarPaso(guiaPropuesta.capacidad, 0);
  }, [guiaPropuesta, entrarPaso]);

  const detener = useCallback(() => {
    setEjecutando(false);
    setRect(null);
    setAviso(false);
    capacidadRef.current = null;
    setMensajes((prev) => [
      ...prev,
      { role: "assistant", content: "Detuvimos la guía. Aquí sigo si quieres intentar otra cosa." },
    ]);
  }, []);

  const continuar = useCallback(() => {
    const cap = capacidadRef.current;
    if (!cap) return;
    const paso = cap.pasos[pasoIdx];
    // Ejecuta la acción del paso actual (si se encuentra el objetivo).
    if (paso) {
      const el = localizar(paso);
      if (el) {
        if (paso.accion === "click") {
          el.click();
        } else if (paso.accion === "escribir" && paso.campo && paramsRef.current[paso.campo]) {
          const input = el as HTMLInputElement;
          input.focus();
          input.value = paramsRef.current[paso.campo];
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    }
    const siguiente = pasoIdx + 1;
    if (siguiente >= cap.pasos.length) {
      setEjecutando(false);
      setRect(null);
      setMensajes((prev) => [
        ...prev,
        { role: "assistant", content: "Listo, terminamos esta guía. ¿Te ayudo con algo más?" },
      ]);
      capacidadRef.current = null;
      return;
    }
    setPasoIdx(siguiente);
    entrarPaso(cap, siguiente);
  }, [pasoIdx, entrarPaso]);

  // Reposiciona el foco al hacer scroll/resize mientras se ejecuta.
  useEffect(() => {
    if (!ejecutando) return;
    const recompute = () => {
      const cap = capacidadRef.current;
      const paso = cap?.pasos[pasoIdx];
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
  }, [ejecutando, pasoIdx]);

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
    pasoActual,
    narracion: pasoActual?.narracion || "",
    rect,
    continuar,
    detener,
    aviso,
    mostrarAviso: () => setAviso(true),
    ocultarAviso: () => setAviso(false),
  };

  return (
    <GuiaContext.Provider value={value}>
      {children}
      {disponible && <GuiaPanel />}
      {disponible && <GuiaCursor />}
    </GuiaContext.Provider>
  );
}
