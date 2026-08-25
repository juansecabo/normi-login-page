// "Normi te guía" — provider global del MODO GUÍA.
//
// Al elegir "Normi te guía" en el menú, aparece Normi de una (imagen + globo),
// ya en modo guía: NO hay chat aparte ni botón de "entrar". El usuario escribe
// en un cuadro flotante separado del globo; Normi decide sola cuándo empezar a
// señalar (borde de luz), cuándo seguir y cuándo preguntar. El usuario hace
// todos los clicks; la guía avanza sola al detectar la acción. Único botón:
// Cancelar (sale del modo). Historial efímero (solo memoria del navegador).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Capacidad, Paso } from "../tipos";
import { capacidadesLite, capacidadPorId, guiaDisponible, prefetchDirectorGrupo } from "../lite";
import { guiaChat, guiaObjetivo, resumenPantalla, type GuiaTurn } from "./api";
import { GuiaCursor } from "./GuiaCursor";
import { guiaLog } from "./logger";

interface GuiaContextValue {
  disponible: boolean;
  /** El modo guía está abierto (Normi visible). */
  activo: boolean;
  abrir: () => void;
  /** Sale del modo guía por completo. */
  cancelar: () => void;
  /** El usuario le escribe a Normi (pedidos, respuestas, dudas). */
  enviar: (texto: string) => void;
  /** Normi está pensando (llamada al modelo en curso). */
  pensando: boolean;
  /** Hay una guía de pasos corriendo. */
  guiando: boolean;
  /** Instrucción del paso actual (si hay guía corriendo). */
  narracion: string;
  /** Último mensaje conversacional de Normi. */
  respuesta: string | null;
  rect: DOMRect | null;
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
    (el) => esVisible(el) && !el.closest("[data-guia-ui]"),
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
    const els = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-guia="${paso.ancla}"]`),
    );
    // Siempre el VISIBLE (los ResponsiveSelect duplican el ancla en un select
    // oculto de celular; señalarlo causaba bucles de "objetivo perdido").
    const el = els.find(esVisible);
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
 * Es el RESPALDO cuando el cerebro (guiaObjetivo) no está disponible.
 */
function localizarZona(paso: Paso): HTMLElement | null {
  const claves = palabrasClave(paso);
  if (!claves.length) return null;
  const titulos = Array.from(
    document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,legend,label,p,span"),
  ).filter(
    (el) =>
      esVisible(el) &&
      (el.textContent || "").trim().length <= 60 &&
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

/** Elementos accionables visibles (para que el CEREBRO elija cuál señalar). */
function candidatosVisibles(): { el: HTMLElement; txt: string }[] {
  const sel =
    'button, [role="menuitem"], [role="tab"], a[href], [role="button"], input, textarea, select, label';
  const out: { el: HTMLElement; txt: string }[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
    if (!esVisible(el) || el.closest("[data-guia-ui]") || el.closest("header")) continue;
    const txt = (textoDe(el) || "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (!txt) continue;
    out.push({ el, txt });
    if (out.length >= 80) break;
  }
  return out;
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

const SALUDO =
  "Hola, soy Normi. Dime qué quieres hacer en la plataforma y te voy guiando paso a paso.";

// "Ya lo hice / ya está / listo": confirmación del usuario para avanzar el paso.
const RE_CONFIRMA =
  /\b(ya (lo|la|los|las)? ?(hice|puse|marque|seleccione|elegi|escribi)|ya esta|ya estan|listo|hecho)\b/;

export function GuiaProvider({ children }: { children: ReactNode }) {
  const [activo, setActivo] = useState(false);
  const [guiando, setGuiando] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [pasoIdx, setPasoIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [respuesta, setRespuesta] = useState<string | null>(null);

  // Historial efímero (contexto para el cerebro; no se muestra como chat).
  const [mensajes, setMensajes] = useState<GuiaTurn[]>([]);
  const mensajesRef = useRef<GuiaTurn[]>(mensajes);
  mensajesRef.current = mensajes;

  const capacidadRef = useRef<Capacidad | null>(null);
  const pasoIdxRef = useRef(0);
  // Limpiadores del paso actual (listeners, timeouts, polls).
  const cleanupsRef = useRef<Array<() => void>>([]);
  const avanzarRef = useRef<() => void>(() => {});
  const atascoRef = useRef<() => void>(() => {});
  // Elemento actualmente señalado y bandera de "objetivo perdido" (vigilante).
  const senaladoRef = useRef<HTMLElement | null>(null);
  const perdidoRef = useRef(false);

  // ¿Está disponible la guía? OJO: NO se puede calcular una sola vez en el
  // render. Este provider envuelve toda la app, así que se monta ANTES del
  // login; cuando el usuario entra, la sesión se escribe en localStorage y la
  // SPA navega sin recargar, de modo que el provider no vuelve a renderizar y
  // el ítem "Normi te guía" quedaba oculto hasta refrescar la página (el resto
  // del menú sí aparecía porque el header se monta después del login).
  // Solución: estado reactivo que se revisa al enfocar la ventana, al cambiar
  // el almacenamiento en otra pestaña y en un chequeo periódico barato
  // (setState con el mismo booleano no provoca re-render).
  const [disponible, setDisponible] = useState<boolean>(() => guiaDisponible());
  useEffect(() => {
    const recalcular = () => setDisponible(guiaDisponible());
    recalcular();
    window.addEventListener("storage", recalcular);
    window.addEventListener("focus", recalcular);
    const iv = window.setInterval(recalcular, 1500);
    return () => {
      window.removeEventListener("storage", recalcular);
      window.removeEventListener("focus", recalcular);
      window.clearInterval(iv);
    };
  }, []);

  const limpiarPaso = () => {
    for (const fn of cleanupsRef.current) fn();
    cleanupsRef.current = [];
  };

  const abrir = useCallback(() => {
    setActivo(true);
    // Resuelve (y cachea) si el profesor es director de grupo, para que sus
    // guías de dirección de grupo entren al catálogo de la sesión.
    void prefetchDirectorGrupo();
    setRespuesta(SALUDO);
    setMensajes([{ role: "assistant", content: SALUDO }]);
    guiaLog("modo_inicio", {}, true);
  }, []);

  const cancelar = useCallback(() => {
    guiaLog("cancelar", { capacidad: capacidadRef.current?.id || null, idx: pasoIdxRef.current }, true);
    limpiarPaso();
    capacidadRef.current = null;
    senaladoRef.current = null;
    setGuiando(false);
    setActivo(false);
    setRect(null);
    setRespuesta(null);
    setMensajes([]);
  }, []);

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
    // Si el objetivo no es un control (ej. el Label de un campo con casillas),
    // se escucha su CONTENEDOR: marcar la casilla de al lado también avanza.
    const interactivo = el.matches(
      "button, a, input, select, textarea, [role='button'], [role='tab'], [role='menuitem'], [role='option']",
    );
    const escucha: HTMLElement = interactivo ? el : el.parentElement || el;
    const onClick = () => {
      quitar();
      guiaLog("avance", { causa: "click_objetivo" });
      window.setTimeout(() => avanzarRef.current(), 200);
    };
    const quitar = () => escucha.removeEventListener("click", onClick);
    escucha.addEventListener("click", onClick);
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

      let vivo = true;
      cleanupsRef.current.push(() => {
        vivo = false;
      });

      // Señala un elemento (con scroll para que quede a la vista) y arma la
      // detección de avance. Normi SOLO señala: jamás hace click ni navega.
      const senalarEl = (el: HTMLElement, modo: string, extra?: Record<string, unknown>) => {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        window.setTimeout(() => {
          if (!vivo) return;
          setRect(el.getBoundingClientRect());
          senaladoRef.current = el;
          guiaLog("senalado", { modo, ...(extra || {}) });
          armarAvance(paso, el);
        }, 150);
      };
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
      // Respaldo: la guía avanza con el siguiente click del usuario (fuera del globo).
      const armarClickLibre = () => {
        const onDocClick = (e: MouseEvent) => {
          if ((e.target as HTMLElement)?.closest?.("[data-guia-ui]")) return;
          document.removeEventListener("click", onDocClick, true);
          guiaLog("avance", { causa: "click_libre" });
          window.setTimeout(() => avanzarRef.current(), 250);
        };
        document.addEventListener("click", onDocClick, true);
        cleanupsRef.current.push(() => document.removeEventListener("click", onDocClick, true));
      };
      // El CEREBRO mira los elementos visibles y elige cuál señalar.
      const elegirConCerebro = (descripcion: string) => {
        const cands = candidatosVisibles();
        const titulo = document.querySelector<HTMLElement>("h1, h2")?.textContent?.trim() || "";
        guiaObjetivo({
          tarea: cap.titulo,
          paso: descripcion,
          elementos: cands.map((c) => c.txt),
          contexto: `ruta ${window.location.pathname}${titulo ? `, título "${titulo}"` : ""}`,
        })
          .then((r) => {
            if (!vivo) return;
            if (r.indice != null && cands[r.indice] && esVisible(cands[r.indice].el)) {
              senalarEl(cands[r.indice].el, "modelo", { el: cands[r.indice].txt });
              return;
            }
            guiaLog("senalado", { modo: "ninguno_modelo", nota: r.nota || null });
            if (r.nota) {
              setRespuesta(r.nota);
              setMensajes((prev) => [...prev, { role: "assistant", content: r.nota! }]);
            } else {
              atascoRef.current();
            }
            armarClickLibre();
            // La página pudo terminar de cargar después: si el objetivo exacto
            // aparece, se señala (corrige el "no estás en esa pantalla" falso).
            const iv = window.setInterval(() => {
              const tardio = localizar(paso);
              if (tardio) {
                window.clearInterval(iv);
                senalarEl(tardio, "exacto_tardio");
              }
            }, 600);
            cleanupsRef.current.push(() => window.clearInterval(iv));
          })
          .catch(() => {
            if (!vivo) return;
            const zona = localizarZona(paso);
            if (zona) senalarZona(zona);
            else {
              guiaLog("senalado", { modo: "ninguno" });
              atascoRef.current();
              armarClickLibre();
            }
          });
      };

      if (paso.accion === "navegar" && paso.ruta) {
        // Normi NO navega: si ya estamos en la página, sigue; si no, SEÑALA el
        // enlace/tarjeta que lleva allá y espera el click del USUARIO.
        if (window.location.pathname === paso.ruta) {
          const t = window.setTimeout(() => avanzarRef.current(), 300);
          cleanupsRef.current.push(() => window.clearTimeout(t));
          return;
        }
        const buscarNav = () => {
          if (!vivo) return;
          const link = Array.from(
            document.querySelectorAll<HTMLElement>(`a[href="${paso.ruta}"]`),
          ).find((el) => esVisible(el) && !el.closest("[data-guia-ui]"));
          if (link) {
            senalarEl(link, "enlace");
            return;
          }
          elegirConCerebro(
            `El usuario debe tocar la opción o tarjeta que lo lleva a: ${paso.narracion || paso.ruta}`,
          );
        };
        window.setTimeout(buscarNav, 120);
        return;
      }
      if (paso.accion === "explicar" || paso.accion === "esperar") {
        // Solo narración: se lee y sigue solo.
        const t = window.setTimeout(() => avanzarRef.current(), 3500);
        cleanupsRef.current.push(() => window.clearTimeout(t));
        return;
      }

      // ¿Este paso puede tener un objetivo exacto? (ancla o etiqueta entre comillas)
      const puedeExacto = !!paso.ancla || !!etiquetaDe(paso.narracion || "");
      let intentos = 0;
      const buscar = () => {
        if (!vivo) return;
        const el = puedeExacto ? localizar(paso) : null;
        if (el) {
          senalarEl(el, "exacto");
          return;
        }
        if (!puedeExacto) {
          elegirConCerebro(paso.narracion || "");
          return;
        }
        if (++intentos < 14) {
          window.setTimeout(buscar, 250);
          return;
        }
        // Reintentos exactos agotados: ahora sí decide el cerebro.
        elegirConCerebro(paso.narracion || "");
      };
      window.setTimeout(buscar, 120);
    },
    [],
  );

  const iniciar = useCallback(
    (cap: Capacidad) => {
      capacidadRef.current = cap;
      const inicio = pasoInicial(cap);
      pasoIdxRef.current = inicio;
      setPasoIdx(inicio);
      setGuiando(true);
      guiaLog("guia_inicio", { capacidad: cap.id, inicio }, true);
      entrarPaso(cap, inicio);
    },
    [entrarPaso],
  );

  const terminar = useCallback(() => {
    guiaLog("guia_fin", { capacidad: capacidadRef.current?.id || null }, true);
    limpiarPaso();
    capacidadRef.current = null;
    senaladoRef.current = null;
    setGuiando(false);
    setRect(null);
    const msg = "Listo, terminamos esta guía. ¿Te ayudo con algo más?";
    setRespuesta(msg);
    setMensajes((prev) => [...prev, { role: "assistant", content: msg }]);
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

  /**
   * El usuario le escribe a Normi. Normi decide sola: conversar, empezar a
   * señalar (arranca la guía de una, sin botón), cambiarla, o avanzar si el
   * usuario confirma que ya hizo el paso.
   */
  const enviar = useCallback(
    async (texto: string) => {
      const t = texto.trim();
      if (!t || pensando) return;
      // Confirmación del paso actual → avanzar sin gastar modelo.
      if (capacidadRef.current && RE_CONFIRMA.test(normTxt(t))) {
        guiaLog("avance", { causa: "usuario_confirmo", texto: t });
        setMensajes((prev) => [
          ...prev,
          { role: "user", content: t },
          { role: "assistant", content: "Perfecto, sigamos." },
        ]);
        setRespuesta("Perfecto, sigamos.");
        avanzarRef.current();
        return;
      }
      setPensando(true);
      setMensajes((prev) => [...prev, { role: "user", content: t }]);
      guiaLog(capacidadRef.current ? "pregunta_en_guia" : "chat_usuario", { texto: t }, true);
      try {
        const cap = capacidadRef.current;
        const pasoA = cap?.pasos[pasoIdxRef.current];
        const resp = await guiaChat({
          message: t,
          history: mensajesRef.current.slice(-8),
          capacidades: capacidadesLite(),
          pantalla: resumenPantalla(),
          guia_activa: cap
            ? { titulo: cap.titulo, paso: pasoA?.narracion || "" }
            : undefined,
        });
        setMensajes((prev) => [...prev, { role: "assistant", content: resp.text }]);
        setRespuesta(resp.text);
        guiaLog("chat_normi", { texto: resp.text, guia: resp.guia?.capacidad_id || null });
        if (resp.guia) {
          const nueva = capacidadPorId(resp.guia.capacidad_id);
          if (nueva) {
            if (!capacidadRef.current) {
              // Normi decide empezar a señalar: arranca de una, sin botón.
              iniciar(nueva);
            } else if (nueva.id !== capacidadRef.current.id) {
              guiaLog("cambio_guia", { de: capacidadRef.current.id, a: nueva.id });
              limpiarPaso();
              iniciar(nueva);
            }
          }
        }
      } catch {
        setRespuesta("Uy, algo falló. ¿Lo intentamos de nuevo?");
      } finally {
        setPensando(false);
      }
    },
    [pensando, iniciar],
  );

  // Paso atascado (nada que señalar): Normi revisa la pantalla por su cuenta y
  // explica en lenguaje natural qué falta; si corresponde otra tarea, cambia sola.
  const atasco = useCallback(async () => {
    const cap = capacidadRef.current;
    if (!cap || pensando) return;
    const pasoA = cap.pasos[pasoIdxRef.current];
    setPensando(true);
    try {
      const resp = await guiaChat({
        message:
          "(sistema) No se encontró en la pantalla lo necesario para el paso actual. Observa la PANTALLA ACTUAL y explícale al usuario, en lenguaje natural y breve, qué falta y qué debe hacer primero (ej: 'Veo que no tienes ninguna actividad, eso es lo primero que debes agregar'). Si lo que falta corresponde a otra acción de tu lista, llama proponer_guia con su id.",
        history: mensajesRef.current.slice(-6),
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
          iniciar(nueva);
        }
      }
    } catch {
      // silencioso: el respaldo de click sigue activo
    } finally {
      setPensando(false);
    }
  }, [pensando, iniciar]);

  useEffect(() => {
    atascoRef.current = atasco;
  }, [atasco]);

  // Telemetría: registra CADA click del usuario mientras la guía corre.
  useEffect(() => {
    if (!guiando) return;
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
  }, [guiando]);

  // Vigilante: si el usuario navegó a otra página o el objetivo desapareció,
  // apaga el borde y re-evalúa (o Normi explica el desvío).
  useEffect(() => {
    if (!guiando) return;
    let lastPath = window.location.pathname;
    const iv = window.setInterval(() => {
      const cap = capacidadRef.current;
      if (!cap) return;
      const pathNow = window.location.pathname;
      const el = senaladoRef.current;
      const vivoEl = !!el && esVisible(el);
      if (pathNow !== lastPath) {
        lastPath = pathNow;
        guiaLog("desvio", { a: pathNow }, true);
        setRect(null);
        senaladoRef.current = null;
        // Re-evaluar el paso en la nueva página: si corresponde, el cerebro
        // señala; si no, responde con una nota natural (sin señalar por parecido).
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
  }, [guiando, entrarPaso]);

  // Reposiciona el borde de luz al hacer scroll/resize mientras se ejecuta.
  useEffect(() => {
    if (!guiando) return;
    const recompute = () => {
      const el = senaladoRef.current;
      if (el && esVisible(el)) {
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null); // el objetivo no está a la vista: no dejar el borde flotando
      }
    };
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [guiando]);

  const cap = capacidadRef.current;
  const pasoActual = cap && guiando ? cap.pasos[pasoIdx] ?? null : null;

  const value: GuiaContextValue = {
    disponible,
    activo,
    abrir,
    cancelar,
    enviar,
    pensando,
    guiando,
    narracion: pasoActual?.narracion || "",
    respuesta,
    rect,
  };

  return (
    <GuiaContext.Provider value={value}>
      {children}
      {disponible && activo && <GuiaCursor />}
    </GuiaContext.Provider>
  );
}
