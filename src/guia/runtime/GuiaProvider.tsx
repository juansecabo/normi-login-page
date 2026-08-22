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
import { guiaChat, resumenPantalla, type GuiaTurn } from "./api";
import { GuiaPanel } from "./GuiaPanel";
import { GuiaCursor } from "./GuiaCursor";
import { guiaLog } from "./logger";

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

/** Visible de verdad, incluso dentro de modales (position: fixed hace que
 *  offsetParent sea null, por eso NO sirve como chequeo de visibilidad). */
const esVisible = (el: HTMLElement): boolean =>
  el.isConnected && el.getClientRects().length > 0;

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
    (el) => el.offsetParent !== null && !el.closest("[data-guia-ui]"),
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

// Palabras de relleno que no sirven para ubicar la sección del paso.
const STOPWORDS = new Set([
  "elige", "selecciona", "ahora", "seleccionamos", "quieres", "puedes", "abrir",
  "trabajar", "escribe", "marca", "entramos", "vamos", "donde", "sobre", "cual",
]);

function palabrasClave(paso: Paso): string[] {
  const out: string[] = [];
  if (paso.campo) out.push(normTxt(paso.campo));
  for (const w of normTxt(paso.narracion || "").replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/)) {
    if (w.length >= 5 && !STOPWORDS.has(w) && !out.includes(w)) out.push(w);
  }
  return out;
}

/**
 * Cuando la elección es del usuario (no hay botón exacto que señalar), ubica la
 * SECCIÓN completa relacionada con el paso (ej. el cuadro "Elige tu asignatura")
 * buscando un título que contenga la palabra clave, y devuelve su contenedor.
 */
function localizarZona(paso: Paso): HTMLElement | null {
  const claves = palabrasClave(paso);
  if (!claves.length) return null;
  const titulos = Array.from(
    document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,legend,label,p,span"),
  ).filter(
    (el) =>
      el.offsetParent !== null &&
      (el.textContent || "").trim().length <= 60 &&
      // Ni el encabezado global (logo "Notas Normi") ni el globo de Normi
      // cuentan como sección señalable.
      !el.closest("header") &&
      !el.closest("[data-guia-ui]"),
  );
  for (const clave of claves) {
    // Palabra COMPLETA: "nota" no debe matchear "Notas Normi".
    const re = new RegExp(`(^|[^a-z0-9ñ])${clave}([^a-z0-9ñ]|$)`);
    const t = titulos.find((el) => re.test(normTxt(el.textContent || "")));
    if (t) {
      const cont =
        t.closest<HTMLElement>("section, [class*='card'], [class*='rounded']") || t.parentElement;
      return cont || t;
    }
  }
  return null;
}

// Campos que solo sirven para LLEGAR a la página (elegir aula), no para la acción.
const CAMPOS_LLEGADA = new Set(["asignatura", "grado", "salon"]);

/**
 * Si el usuario YA está en la página donde ocurre la acción, la guía no debe
 * devolverlo al inicio: salta los pasos de llegada (navegar, esperar, elegir
 * asignatura/grado/salón) y arranca en el primer paso propio de la acción.
 */
function pasoInicial(cap: Capacidad): number {
  if (window.location.pathname !== cap.ruta) return 0;
  let i = 0;
  while (i < cap.pasos.length - 1) {
    const p = cap.pasos[i];
    const esLlegada =
      p.accion === "navegar" ||
      p.accion === "esperar" ||
      (!!p.campo && CAMPOS_LLEGADA.has(normTxt(p.campo)));
    if (!esLlegada) break;
    i++;
  }
  return i;
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
  // Consulta automática cuando un paso no encuentra su objetivo (prerequisito
  // faltante): Normi mira la pantalla y lo explica en lenguaje natural.
  const atascoRef = useRef<() => void>(() => {});
  // Elemento actualmente señalado y bandera de "objetivo perdido" (vigilante).
  const senaladoRef = useRef<HTMLElement | null>(null);
  const perdidoRef = useRef(false);

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
      guiaLog("chat_usuario", { texto: t }, true);
      try {
        const resp = await guiaChat({
          message: t,
          history: nuevos.filter((m) => m !== SALUDO).slice(-8),
          capacidades: capacidadesLite(),
          pantalla: resumenPantalla(),
        });
        setMensajes((prev) => [...prev, { role: "assistant", content: resp.text }]);
        guiaLog("chat_normi", { texto: resp.text, guia: resp.guia?.capacidad_id || null });
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
          guiaLog("avance", { causa: "seleccion", valor: ahora });
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
        guiaLog("avance", { causa: "escritura" });
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
      guiaLog("avance", { causa: "click_objetivo" });
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
      senaladoRef.current = null;
      perdidoRef.current = false;
      setRespuesta(null);
      guiaLog("paso", { capacidad: cap.id, idx, accion: paso.accion, narracion: paso.narracion }, true);

      if (paso.accion === "navegar" && paso.ruta) {
        navigate(paso.ruta);
        const t = window.setTimeout(() => avanzarRef.current(), 600);
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
      // ¿Este paso puede tener un objetivo exacto? (ancla o etiqueta entre comillas)
      const puedeExacto = !!paso.ancla || !!etiquetaDe(paso.narracion || "");
      const senalarZona = (zona: HTMLElement) => {
        zona.scrollIntoView({ block: "center", behavior: "smooth" });
        window.setTimeout(() => {
          if (!vivo) return;
          setRect(zona.getBoundingClientRect());
          senaladoRef.current = zona;
        }, 150);
        guiaLog("senalado", { modo: "zona" });
        const onZonaClick = () => {
          zona.removeEventListener("click", onZonaClick);
          guiaLog("avance", { causa: "click_zona" });
          window.setTimeout(() => avanzarRef.current(), 250);
        };
        zona.addEventListener("click", onZonaClick);
        cleanupsRef.current.push(() => zona.removeEventListener("click", onZonaClick));
      };
      let intentos = 0;
      const buscar = () => {
        if (!vivo) return;
        const el = puedeExacto ? localizar(paso) : null;
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          window.setTimeout(() => {
            if (!vivo) return;
            setRect(el.getBoundingClientRect());
            senaladoRef.current = el;
            guiaLog("senalado", { modo: "exacto" });
            armarAvance(paso, el);
          }, 150);
          return;
        }
        // Sin botón exacto posible → la SECCIÓN completa se señala DE UNA (sin
        // esperas); si sí podría haber exacto, se le da ~1s antes de caer a zona.
        if (!puedeExacto || intentos >= 4) {
          const zona = localizarZona(paso);
          if (zona) {
            senalarZona(zona);
            return;
          }
        }
        if (++intentos < 14) {
          window.setTimeout(buscar, 250);
          return;
        }
        // Último respaldo: nada que señalar. Normi mira la pantalla y explica
        // en lenguaje natural qué falta (ej. "no tienes ninguna actividad");
        // mientras tanto la guía avanza con el siguiente click del usuario.
        guiaLog("senalado", { modo: "ninguno" });
        atascoRef.current();
        const onDocClick = (e: MouseEvent) => {
          if ((e.target as HTMLElement)?.closest?.("[data-guia-ui]")) return;
          document.removeEventListener("click", onDocClick, true);
          guiaLog("avance", { causa: "click_libre" });
          window.setTimeout(() => avanzarRef.current(), 250);
        };
        document.addEventListener("click", onDocClick, true);
        cleanupsRef.current.push(() => document.removeEventListener("click", onDocClick, true));
      };
      window.setTimeout(buscar, 120);
    },
    [navigate],
  );

  const terminar = useCallback(() => {
    guiaLog("guia_fin", { capacidad: capacidadRef.current?.id || null }, true);
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
    const inicio = pasoInicial(guiaPropuesta.capacidad);
    guiaLog("guia_inicio", { capacidad: guiaPropuesta.capacidad.id, inicio, parametros: guiaPropuesta.parametros }, true);
    pasoIdxRef.current = inicio;
    setEjecutando(true);
    setPasoIdx(inicio);
    setAbierto(false); // el chat se recoge; queda el globo de Normi
    entrarPaso(guiaPropuesta.capacidad, inicio);
  }, [guiaPropuesta, entrarPaso]);

  const detener = useCallback(() => {
    guiaLog("detener", { capacidad: capacidadRef.current?.id || null, idx: pasoIdxRef.current }, true);
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
      guiaLog("pregunta_en_guia", { texto: t }, true);
      try {
        // Contexto de la guía en curso: qué tarea acompaña y en qué paso va,
        // para que Normi entienda respuestas sueltas (un nombre, una fecha...).
        const cap = capacidadRef.current;
        const pasoActualGuia = cap?.pasos[pasoIdxRef.current];
        const resp = await guiaChat({
          message: t,
          history: mensajesRef.current.filter((m) => m !== SALUDO).slice(-8),
          capacidades: capacidadesLite(),
          pantalla: resumenPantalla(),
          guia_activa: cap
            ? { titulo: cap.titulo, paso: pasoActualGuia?.narracion || "" }
            : undefined,
        });
        setRespuesta(resp.text);
        setMensajes((prev) => [...prev, { role: "assistant", content: resp.text }]);
        // Si en pleno modo guía el usuario pide OTRA tarea, la guía cambia en
        // caliente a esa nueva capacidad (arranca sus pasos desde el inicio).
        if (resp.guia) {
          const nueva = capacidadPorId(resp.guia.capacidad_id);
          if (nueva && capacidadRef.current && nueva.id !== capacidadRef.current.id) {
            guiaLog("cambio_guia", { de: capacidadRef.current.id, a: nueva.id });
            limpiarPaso();
            capacidadRef.current = nueva;
            const inicio = pasoInicial(nueva);
            pasoIdxRef.current = inicio;
            setPasoIdx(inicio);
            entrarPaso(nueva, inicio);
          }
        }
      } catch {
        setRespuesta("Uy, algo falló. Inténtalo de nuevo.");
      } finally {
        setPreguntando(false);
      }
    },
    [preguntando, entrarPaso],
  );

  // Paso atascado (nada que señalar): Normi revisa la pantalla por su cuenta y
  // explica en lenguaje natural qué falta (ej. "veo que no tienes ninguna
  // actividad, eso es lo primero que debes agregar"); si corresponde otra
  // tarea, la propone y la guía cambia sola.
  const atasco = useCallback(async () => {
    const cap = capacidadRef.current;
    if (!cap || preguntando) return;
    const pasoA = cap.pasos[pasoIdxRef.current];
    setPreguntando(true);
    try {
      const resp = await guiaChat({
        message:
          "(sistema) No se encontró en la pantalla lo necesario para el paso actual. Observa la PANTALLA ACTUAL y explícale al usuario, en lenguaje natural y breve, qué falta y qué debe hacer primero (ej: 'Veo que no tienes ninguna actividad, eso es lo primero que debes agregar'). Si lo que falta corresponde a otra acción de tu lista, llama proponer_guia con su id.",
        history: mensajesRef.current.filter((m) => m !== SALUDO).slice(-6),
        capacidades: capacidadesLite(),
        pantalla: resumenPantalla(),
        guia_activa: { titulo: cap.titulo, paso: pasoA?.narracion || "" },
      });
      setRespuesta(resp.text);
      setMensajes((prev) => [...prev, { role: "assistant", content: resp.text }]);
      guiaLog("atasco_respuesta", { texto: resp.text, guia: resp.guia?.capacidad_id || null });
      if (resp.guia) {
        const nueva = capacidadPorId(resp.guia.capacidad_id);
        if (nueva && capacidadRef.current && nueva.id !== capacidadRef.current.id) {
          guiaLog("cambio_guia", { de: capacidadRef.current.id, a: nueva.id, causa: "atasco" });
          limpiarPaso();
          capacidadRef.current = nueva;
          const inicio = pasoInicial(nueva);
          pasoIdxRef.current = inicio;
          setPasoIdx(inicio);
          entrarPaso(nueva, inicio);
        }
      }
    } catch {
      // silencioso: el respaldo de click sigue activo
    } finally {
      setPreguntando(false);
    }
  }, [preguntando, entrarPaso]);

  useEffect(() => {
    atascoRef.current = atasco;
  }, [atasco]);

  // Telemetría: registra CADA click del usuario mientras la guía corre (qué
  // tocó, con su texto), para poder analizar el comportamiento real.
  useEffect(() => {
    if (!ejecutando) return;
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const accionable = el.closest<HTMLElement>("button, a, [role], input, textarea, select, label, td") || el;
      guiaLog("click_usuario", {
        el: (textoDe(accionable) || accionable.tagName || "").trim().replace(/\s+/g, " ").slice(0, 60),
        enGlobo: !!el.closest("[data-guia-ui]"),
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [ejecutando]);

  // Vigilante: mientras la guia corre, verifica que el objetivo señalado siga
  // existiendo. Si el usuario navego a otra pagina o el elemento desaparecio,
  // apaga el borde y re-evalua el paso en la pantalla actual (vuelve a señalar
  // lo correcto, o Normi explica el desvio via atasco).
  useEffect(() => {
    if (!ejecutando) return;
    let lastPath = window.location.pathname;
    const iv = window.setInterval(() => {
      const cap = capacidadRef.current;
      if (!cap) return;
      const pathNow = window.location.pathname;
      const el = senaladoRef.current;
      const vivoEl = !!el && el.isConnected && el.offsetParent !== null;
      if (pathNow !== lastPath) {
        lastPath = pathNow;
        guiaLog("desvio", { a: pathNow }, true);
        setRect(null);
        entrarPaso(cap, pasoIdxRef.current);
        return;
      }
      if (el && !vivoEl && !perdidoRef.current) {
        perdidoRef.current = true;
        guiaLog("objetivo_perdido", {}, true);
        setRect(null);
        entrarPaso(cap, pasoIdxRef.current);
      }
    }, 700);
    return () => window.clearInterval(iv);
  }, [ejecutando, entrarPaso]);

  // Reposiciona el borde de luz al hacer scroll/resize mientras se ejecuta.
  useEffect(() => {
    if (!ejecutando) return;
    const recompute = () => {
      const el = senaladoRef.current;
      if (el && el.isConnected && el.offsetParent !== null) {
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null); // el objetivo ya no esta a la vista: no dejar el borde flotando
      }
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
