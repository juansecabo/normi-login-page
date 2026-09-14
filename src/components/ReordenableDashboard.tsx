import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import {
  DndContext,
  closestCenter,
  type CollisionDetection,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Pencil } from "lucide-react";

export interface ReordItem {
  /** Identificador estable de la tarjeta (se guarda en el orden). */
  id: string;
  /** Contenido de la tarjeta (su <button> tal cual, con su estilo propio). */
  render: ReactNode;
  /** Notificaciones pendientes de la ficha (la burbuja roja). El grupo muestra la suma de las suyas. */
  badge?: number;
}

/**
 * Grupo de fichas (Juan 2026-09-14): como el grupo de apps del celular. Desde afuera se
 * ven en miniatura las fichas que tiene adentro; al tocarlo se abre con las fichas grandes
 * y el nombre editable. Se guarda dentro del mismo `orden` de Preferencias_Dashboard,
 * mezclado con los ids sueltos:
 *   ["notas", { tipo: "grupo", id: "g_…", nombre: "Académico", items: ["actividades", "calendario"] }, "perfil"]
 * Un grupo sin fichas desaparece solo.
 */
export interface GrupoFichas { tipo: "grupo"; id: string; nombre: string; items: string[] }
type OrdenEntry = string | GrupoFichas;
const esGrupo = (e: OrdenEntry): e is GrupoFichas => typeof e === "object" && e !== null && (e as GrupoFichas).tipo === "grupo";

// Piloto: los grupos solo están activos en el colegio de prueba (Cailico). En los demás
// colegios todo sigue exactamente igual (reordenar sin agrupar).
const COLEGIOS_CON_GRUPOS = new Set(["2f96f076-83df-4b84-8bbc-9c1df79a372b"]);
/** Tiempo que hay que sostener una ficha encima de otra (o de un grupo) para agrupar (ms). */
const HOLD_AGRUPAR_MS = 150;

type Entrada =
  | { tipo: "ficha"; item: ReordItem }
  | { tipo: "grupo"; grupo: GrupoFichas; items: ReordItem[] };

/** Una tarjeta arrastrable. El arrastre se activa con long-press (~0.5s); mientras
 *  `jiggling` está activo TODAS vibran menos la que se arrastra. La vibración va en
 *  un div interno para NO chocar con el transform de dnd-kit (que acomoda/mueve). */
function SortableCard({ id, jiggling, index, destinoAgrupar, children }: { id: string; jiggling: boolean; index: number; destinoAgrupar: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const vibra = jiggling && !isDragging;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={`normi-card touch-manipulation relative ${isDragging ? "scale-105" : ""} ${destinoAgrupar ? "rounded-lg ring-4 ring-primary scale-105" : ""}`}
      {...attributes}
      {...listeners}
    >
      <div
        className={`h-full ${vibra && !destinoAgrupar ? "normi-jiggle" : ""}`}
        style={vibra && !destinoAgrupar ? { animationDelay: index % 2 === 0 ? "0s" : "-0.13s" } : undefined}
      >
        {children}
      </div>
      {destinoAgrupar && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center z-10">
          <span className="rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 shadow">Suelta para agrupar</span>
        </div>
      )}
    </div>
  );
}

/** Ficha del grupo en el tablero: miniaturas de sus fichas (hasta 4, luego "+N") y el nombre debajo. */
function GrupoCard({ grupo, items, onAbrir }: { grupo: GrupoFichas; items: ReordItem[]; onAbrir: () => void }) {
  const minis = items.slice(0, 4);
  const extra = items.length - minis.length;
  const notificaciones = items.reduce((s, it) => s + (it.badge || 0), 0);
  return (
    <button
      type="button"
      onClick={onAbrir}
      data-guia="dashboard.grupo_fichas"
      className="relative w-full h-full flex flex-col items-center justify-center gap-2 p-3 rounded-lg bg-card border-2 border-border shadow-soft transition-all duration-200 hover:shadow-md hover:border-primary cursor-pointer"
      title={grupo.nombre || "Grupo"}
    >
      {notificaciones > 0 && (
        <span data-guia="dashboard.grupo_notificaciones" className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm z-10 animate-badge-pop">{notificaciones}</span>
      )}
      <div className="grid grid-cols-2 gap-1.5 w-full flex-1 min-h-[96px] rounded-xl bg-muted/70 p-2 overflow-hidden">
        {minis.map((it, i) => (
          <div key={it.id} className="relative overflow-hidden rounded-md bg-background/80 pointer-events-none aspect-square">
            {/* Miniatura: la ficha real escalada; no recibe clics. Su burbuja se oculta (la muestra el grupo, sumada). */}
            <div className="absolute inset-0 origin-top-left [&_.animate-badge-pop]:hidden" style={{ transform: "scale(0.36)", width: "278%", height: "278%" }}>
              {it.render}
            </div>
            {extra > 0 && i === minis.length - 1 && (
              <div className="absolute inset-0 bg-foreground/60 text-background text-sm font-bold flex items-center justify-center">+{extra + 1}</div>
            )}
          </div>
        ))}
        {minis.length < 4 && Array.from({ length: 4 - minis.length }).map((_, i) => <div key={`v${i}`} className="rounded-md bg-background/30 aspect-square" />)}
      </div>
      <span className="font-semibold text-foreground text-center text-sm leading-tight">{grupo.nombre || "Grupo"}</span>
    </button>
  );
}

/**
 * Grilla de tarjetas reordenable estilo iPhone para cualquier dashboard.
 *
 * - Mantener presionada una tarjeta (~0.5s, el punto donde el celular da su vibración
 *   nativa) entra al "modo vibrar"; ahí se arrastra y al soltar se guarda — aunque
 *   quede en el mismo lugar. Un toque/clic normal navega.
 * - GRUPOS (colegios en COLEGIOS_CON_GRUPOS): mientras arrastras, sostener una ficha
 *   ~0.65s encima de otra la resalta ("Suelta para agrupar") y al soltar se forma un grupo
 *   (pide nombre). Sostener encima de un grupo mete la ficha en él. Desde afuera el grupo
 *   muestra en miniatura lo que tiene; un toque lo abre: ahí se navega a cada ficha, se
 *   cambia el nombre y se sacan fichas con la equis. Al sacar la última, el grupo desaparece.
 * - El orden se persiste por (user_id + colegio_id + dashboard) en Preferencias_Dashboard,
 *   así sigue a la persona entre dispositivos y NO se pisa con sus otros perfiles del
 *   mismo colegio (cada dashboard guarda con su propia `dashboardKey`).
 */
export default function ReordenableDashboard({ dashboardKey, items, gridClassName }: {
  dashboardKey: string;
  items: ReordItem[];
  gridClassName: string;
}) {
  const colegioConGrupos = COLEGIOS_CON_GRUPOS.has(String(getSession().colegio_id || ""));
  // Interruptor por usuario (apagado por defecto): con él apagado el arrastre es EXACTAMENTE el
  // de siempre; los grupos que ya existan se siguen mostrando y usando.
  // Juan 2026-09-14: el interruptor NO se guarda; por defecto se reordena y, al recargar o
  // navegar, vuelve a apagado. Encendido = SOLO agrupar (nada se reordena) para no confundir.
  const [modoGrupos, setModoGrupos] = useState<boolean>(false);
  const cambiarModo = (v: boolean) => setModoGrupos(v);
  const gruposHabilitados = colegioConGrupos; // mostrar/abrir grupos existentes
  const agruparActivo = colegioConGrupos && modoGrupos; // gesto de agrupar
  /** Lado por el que el centro de la ficha arrastrada ENTRÓ en cada ficha (modelo Atlassian). */
  const entradaPor = useRef<Map<string, "inicio" | "fin">>(new Map());
  /** Último resultado de reordenar: en zona de combinar se CONGELA el acomodo (no se deshace), como react-beautiful-dnd. */
  const ultimoReordenar = useRef<ReturnType<CollisionDetection> | null>(null);

  // Clave de caché local por usuario + colegio + dashboard (no se mezcla entre
  // perfiles ni colegios de la misma persona).
  const cacheKey = () => {
    const s = getSession();
    return `dash_orden:${s.id ?? ''}:${s.colegio_id ?? ''}:${dashboardKey}`;
  };

  const normalizar = (raw: unknown): OrdenEntry[] => {
    if (!Array.isArray(raw)) return [];
    return raw.filter((e) => typeof e === "string" || esGrupo(e as OrdenEntry)) as OrdenEntry[];
  };

  // Estado inicial SINCRÓNICO desde localStorage → el primer pintado ya sale en el
  // orden del usuario (sin esperar la red), así no se ve el orden por defecto un
  // instante. La base se consulta igual abajo y manda como fuente de verdad.
  const [orden, setOrden] = useState<OrdenEntry[]>(() => {
    try {
      const raw = localStorage.getItem(`dash_orden:${getSession().id ?? ''}:${getSession().colegio_id ?? ''}:${dashboardKey}`);
      return normalizar(raw ? JSON.parse(raw) : null);
    } catch { return []; }
  });
  const [jiggling, setJiggling] = useState(false);
  const [destinoAgrupar, setDestinoAgrupar] = useState<string | null>(null);
  /** Ficha (o grupo) sobre cuyo tercio CENTRAL está el centro de la ficha arrastrada (lo fija la colisión). */
  const centroSobre = useRef<string | null>(null);
  const holdCandidato = useRef<string | null>(null);
  const holdTimer = useRef<number | null>(null);
  const inputNombreRef = useRef<HTMLInputElement>(null);
  const abiertoNombreEn = useRef(0);
  /** Grilla del grupo abierto y si el centro de la ficha arrastrada quedó FUERA de ella (= sacarla). */
  const gridGrupoRef = useRef<HTMLDivElement>(null);
  const fueraDelGrupo = useRef(false);
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);
  const [nombrando, setNombrando] = useState<string | null>(null); // id del grupo recién creado
  const [nombreTemp, setNombreTemp] = useState("");
  const [editandoNombre, setEditandoNombre] = useState(false);
  useEffect(() => {
    if (!nombrando) return;
    abiertoNombreEn.current = Date.now();
    // Con mouse real el campo puede quedar "activo" pero sin cursor (el navegador termina la
    // secuencia de soltar después del focus). Soltar y retomar el foco sí lo arregla; un focus()
    // sobre un campo que ya figura activo no hace nada.
    const enfocar = () => {
      const el = inputNombreRef.current; if (!el) return;
      if (document.activeElement === el) el.blur();
      el.focus({ preventScroll: true });
      try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* ignore */ }
    };
    const t1 = window.setTimeout(enfocar, 120);
    const t2 = window.setTimeout(enfocar, 350);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [nombrando]);

  useEffect(() => {
    const session = getSession();
    if (!session.id) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('Preferencias_Dashboard')
          .select('orden')
          .eq('user_id', String(session.id))
          .eq('dashboard', dashboardKey)
          .maybeSingle();
        // La base es la verdad: reconcilia la caché (cubre cambios hechos en otro
        // dispositivo). Si no hay fila guardada → orden por defecto ([]).
        const dbOrden = normalizar(data?.orden);
        setOrden(dbOrden);
        try { localStorage.setItem(cacheKey(), JSON.stringify(dbOrden)); } catch { /* ignore */ }
      } catch { /* ignore — se queda con la caché local */ }
    })();
  }, [dashboardKey]);

  const guardar = (nuevo: OrdenEntry[]) => {
    setOrden(nuevo);
    // Actualizar la caché local YA (mismo momento del cambio) → la próxima carga
    // pinta el orden nuevo al instante, sin parpadeo ni quedarse con el viejo.
    try { localStorage.setItem(cacheKey(), JSON.stringify(nuevo)); } catch { /* ignore */ }
    // Guardar (el proxy inyecta colegio_id; el frontend manda user_id + dashboard).
    (async () => {
      try {
        const { error } = await supabase
          .from('Preferencias_Dashboard')
          .upsert(
            { user_id: String(getSession().id), dashboard: dashboardKey, orden: nuevo },
            { onConflict: 'user_id,colegio_id,dashboard' },
          );
        if (error) console.error('Error guardando el orden del dashboard:', error);
      } catch (e) {
        console.error('Error guardando el orden del dashboard:', e);
      }
    })();
  };

  // ── Orden efectivo ──────────────────────────────────────────────────────────
  // Primero lo guardado (ids sueltos y grupos, sin ids ya inexistentes; grupos vacíos se
  // eliminan), luego las fichas nuevas (no guardadas aún) al final.
  const byId = new Map(items.map((c) => [c.id, c]));
  const usados = new Set<string>();
  const entradas: Entrada[] = [];
  for (const e of orden) {
    if (esGrupo(e)) {
      if (!gruposHabilitados) { // colegio sin grupos: se aplanan
        for (const id of e.items) { const it = byId.get(id); if (it && !usados.has(id)) { usados.add(id); entradas.push({ tipo: "ficha", item: it }); } }
        continue;
      }
      const its = e.items.map((id) => byId.get(id)).filter((c): c is ReordItem => Boolean(c) && !usados.has(c!.id));
      its.forEach((c) => usados.add(c.id));
      if (its.length > 0) entradas.push({ tipo: "grupo", grupo: { ...e, items: its.map((c) => c.id) }, items: its });
    } else {
      const it = byId.get(e);
      if (it && !usados.has(e)) { usados.add(e); entradas.push({ tipo: "ficha", item: it }); }
    }
  }
  for (const it of items) if (!usados.has(it.id)) entradas.push({ tipo: "ficha", item: it });
  const idDe = (en: Entrada) => (en.tipo === "ficha" ? en.item.id : en.grupo.id);
  const idsTop = entradas.map(idDe);
  const serializar = (lista: Entrada[]): OrdenEntry[] => lista.map((en) => (en.tipo === "ficha" ? en.item.id : { tipo: "grupo", id: en.grupo.id, nombre: en.grupo.nombre, items: en.grupo.items }));

  // Long-press ~0.5s para mover (evita arrastres accidentales con un toque).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
  );

  const limpiarHold = () => { if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; } };

  const handleDragStart = () => {
    setJiggling(true);
    setDestinoAgrupar(null);
    holdCandidato.current = null;
    centroSobre.current = null;
    entradaPor.current.clear();
    ultimoReordenar.current = null;
    // Vibración (haptic) al entrar al modo edición — Android (iOS ya vibra solo).
    try { navigator.vibrate?.(15); } catch { /* ignore */ }
  };

  // Colisión (modelo de react-beautiful-dnd + pausa de iOS). Con el interruptor apagado es
  // EXACTAMENTE closestCenter, la de siempre (en reposo el destino es la propia ficha y nada
  // se corre). Encendido: se mira dónde cae el CENTRO de la ficha arrastrada. Si entra en otra
  // ficha por un lado, los primeros 2/3 desde ese lado son zona de COMBINAR: la de abajo no se
  // corre y, sosteniendo medio segundo, se agrupa. El tercio lejano es zona de REORDENAR, como
  // siempre. Así no oscila al entrar ni salir.
  const colisionTercios: CollisionDetection = (args) => {
    const { active, collisionRect, droppableContainers } = args;
    centroSobre.current = null;
    const activeId = active.id as string;
    if (abierto?.grupo.items.includes(activeId)) {
      // Dentro del grupo abierto: solo sus fichas son destino (así la arrastrada sí sigue al
      // puntero) y se anota si el centro salió de la grilla del grupo (= sacarla al soltar).
      const g = gridGrupoRef.current?.getBoundingClientRect();
      if (collisionRect && g) {
        const cx = collisionRect.left + collisionRect.width / 2, cy = collisionRect.top + collisionRect.height / 2;
        fueraDelGrupo.current = cx < g.left || cx > g.right || cy < g.top || cy > g.bottom;
      }
      return closestCenter({ ...args, droppableContainers: droppableContainers.filter((c) => abierto.grupo.items.includes(c.id as string)) });
    }
    if (!agruparActivo || !collisionRect) return closestCenter(args);
    // Modo agrupar: nada se reordena. El destino es la ficha (o grupo) bajo el CENTRO de la
    // ficha arrastrada; el "over" se reporta como la propia ficha para que nada se corra.
    if (entradas.find((en) => idDe(en) === activeId)?.tipo === "ficha") {
      const cx = collisionRect.left + collisionRect.width / 2;
      const cy = collisionRect.top + collisionRect.height / 2;
      for (const c of droppableContainers) {
        const id = c.id as string;
        if (id === activeId || !idsTop.includes(id)) continue;
        const r = c.rect.current;
        if (r && cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height) { centroSobre.current = id; break; }
      }
    }
    return [{ id: active.id }];
  };

  // Cada movimiento: si el centro está sobre el tercio central de otra ficha, arranca (o
  // sigue) el temporizador para agrupar; si sale, se cancela.
  const handleDragMove = (_e: DragMoveEvent) => {
    const candidato = centroSobre.current;
    if (candidato && candidato !== holdCandidato.current) {
      limpiarHold();
      holdCandidato.current = candidato;
      holdTimer.current = window.setTimeout(() => {
        setDestinoAgrupar(candidato);
        try { navigator.vibrate?.(10); } catch { /* ignore */ }
      }, HOLD_AGRUPAR_MS);
    } else if (!candidato && holdCandidato.current) {
      limpiarHold(); holdCandidato.current = null; setDestinoAgrupar(null);
    }
  };

  /** El clic que el navegador dispara justo después de soltar cae sobre lo que quedó bajo el
   *  puntero (p. ej. el grupo recién creado): abría el grupo y cerraba el cuadro del nombre,
   *  dejándolo sin foco y con el nombre "Grupo". Se bloquea ese clic durante 400 ms. */
  const bloquearClickTrasSoltar = () => {
    const bloquear = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    // También el mousedown sintético que algunos dispositivos (pantalla táctil) emiten tras soltar: ese sí mueve el foco.
    window.addEventListener("click", bloquear, true);
    window.addEventListener("mousedown", bloquear, true);
    window.setTimeout(() => { window.removeEventListener("click", bloquear, true); window.removeEventListener("mousedown", bloquear, true); }, 400);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    bloquearClickTrasSoltar();
    setJiggling(false); // soltar SIEMPRE apaga la vibración (aunque no se mueva)
    limpiarHold(); holdCandidato.current = null;
    const destino = destinoAgrupar && destinoAgrupar === centroSobre.current ? destinoAgrupar : null;
    const sobreSinSostener = !destino ? centroSobre.current : null;
    centroSobre.current = null;
    entradaPor.current.clear();
    ultimoReordenar.current = null;
    setDestinoAgrupar(null);
    const { active, over } = e;
    const activeId = active.id as string;

    // ── Dentro del grupo abierto: soltar sobre otra ficha del grupo la reordena; soltar en
    //    cualquier otro lado (fuera del grupo) la SACA al tablero. ──
    if (abierto && abierto.grupo.items.includes(activeId)) {
      const overId = over?.id as string | undefined;
      const fuera = fueraDelGrupo.current; fueraDelGrupo.current = false;
      if (fuera) { sacarDelGrupo(abierto.grupo.id, activeId); return; }
      if (overId && overId !== activeId && abierto.grupo.items.includes(overId)) {
        const ids = arrayMove(abierto.grupo.items, abierto.grupo.items.indexOf(activeId), abierto.grupo.items.indexOf(overId));
        guardar(serializar(entradas.map((en) => (en.tipo === "grupo" && en.grupo.id === abierto.grupo.id
          ? { ...en, grupo: { ...en.grupo, items: ids }, items: ids.map((id) => byId.get(id)!).filter(Boolean) }
          : en))));
      }
      return;
    }

    // ── Agrupar (se sostuvo el tiempo con el centro sobre el tercio central del destino) ──
    if (gruposHabilitados && destino) {
      const overId = destino;
      const lista = [...entradas];
      const iActiva = lista.findIndex((en) => idDe(en) === activeId);
      const iDestino = lista.findIndex((en) => idDe(en) === overId);
      if (iActiva === -1 || iDestino === -1) return;
      const activa = lista[iActiva];
      if (activa.tipo !== "ficha") return;
      const dest = lista[iDestino];
      if (dest.tipo === "grupo") {
        // Meter la ficha al grupo existente.
        lista[iDestino] = { tipo: "grupo", grupo: { ...dest.grupo, items: [...dest.grupo.items, activa.item.id] }, items: [...dest.items, activa.item] };
        lista.splice(iActiva, 1);
        guardar(serializar(lista));
      } else {
        // Formar un grupo nuevo en el lugar de la ficha destino y pedir nombre.
        const nuevo: GrupoFichas = { tipo: "grupo", id: `g_${Date.now()}`, nombre: "", items: [dest.item.id, activa.item.id] };
        lista[iDestino] = { tipo: "grupo", grupo: nuevo, items: [dest.item, activa.item] };
        lista.splice(iActiva, 1);
        guardar(serializar(lista));
        setNombreTemp("");
        // Se abre cuando ya terminó la secuencia pointerup/mouseup/click del soltar (con mouse
        // real, abrirlo dentro de esa secuencia dejaba el campo enfocado pero sin cursor).
        window.setTimeout(() => setNombrando(nuevo.id), 80);
      }
      return;
    }

    // ── Modo agrupar sin destino: no se reordena nada ──
    if (agruparActivo) return;
    // ── Reordenar (como siempre) ──
    const overId = sobreSinSostener ?? (over && over.id !== activeId ? (over.id as string) : "");
    if (!overId || activeId === overId) return;
    const desde = idsTop.indexOf(activeId), hasta = idsTop.indexOf(overId);
    if (desde === -1 || hasta === -1) return;
    guardar(serializar(arrayMove(entradas, desde, hasta)));
  };

  // ── Acciones sobre grupos ──
  const grupoDe = (id: string | null) => (id ? (entradas.find((en) => en.tipo === "grupo" && en.grupo.id === id) as Extract<Entrada, { tipo: "grupo" }> | undefined) : undefined);
  const abierto = grupoDe(grupoAbierto);
  const renombrar = (grupoId: string, nombre: string) => {
    guardar(serializar(entradas.map((en) => (en.tipo === "grupo" && en.grupo.id === grupoId ? { ...en, grupo: { ...en.grupo, nombre: nombre.trim() || "Grupo" } } : en))));
  };
  const sacarDelGrupo = (grupoId: string, fichaId: string) => {
    const lista: Entrada[] = [];
    for (const en of entradas) {
      if (en.tipo === "grupo" && en.grupo.id === grupoId) {
        const restantes = en.items.filter((it) => it.id !== fichaId);
        if (restantes.length > 0) lista.push({ tipo: "grupo", grupo: { ...en.grupo, items: restantes.map((it) => it.id) }, items: restantes });
        // La ficha sacada queda justo después del grupo (o en su lugar si el grupo se disolvió).
        const ficha = byId.get(fichaId);
        if (ficha) lista.push({ tipo: "ficha", item: ficha });
        if (restantes.length === 0) setGrupoAbierto(null);
      } else lista.push(en);
    }
    guardar(serializar(lista));
  };

  return (
    <>
      {colegioConGrupos ? (
        /* Colegio con grupos: solo el interruptor, sin textos. */
        <div className="flex items-center justify-center gap-2 mb-6" data-guia="dashboard.grupos_interruptor">
          <Switch id="agrupar-fichas" checked={modoGrupos} onCheckedChange={cambiarModo} />
          <label htmlFor="agrupar-fichas" className="text-sm text-foreground cursor-pointer select-none">Agrupar fichas</label>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-6 text-center">
          Mantén presionada una tarjeta para cambiar su posición.
        </p>
      )}

      <style>{`@keyframes normiJiggle{0%{transform:rotate(-1.4deg)}50%{transform:rotate(1.4deg)}100%{transform:rotate(-1.4deg)}}.normi-jiggle{animation:normiJiggle .22s ease-in-out infinite;transform-origin:center}`}</style>

      <DndContext sensors={sensors} autoScroll={!abierto} collisionDetection={colisionTercios} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={() => { setJiggling(false); limpiarHold(); holdCandidato.current = null; centroSobre.current = null; setDestinoAgrupar(null); }}>
        <SortableContext items={idsTop} strategy={rectSortingStrategy}>
          <div className={gridClassName}>
            {entradas.map((en, idx) => (
              <SortableCard key={idDe(en)} id={idDe(en)} jiggling={jiggling} index={idx} destinoAgrupar={destinoAgrupar === idDe(en)}>
                {en.tipo === "ficha"
                  ? en.item.render
                  : <GrupoCard grupo={en.grupo} items={en.items} onAbrir={() => { if (!jiggling) setGrupoAbierto(en.grupo.id); }} />}
              </SortableCard>
            ))}
          </div>
        </SortableContext>

      {/* Nombre del grupo recién formado */}
      <Dialog open={!!nombrando} onOpenChange={(o) => { if (!o) { if (nombrando) renombrar(nombrando, nombreTemp); setNombrando(null); } }}>
        <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => { e.preventDefault(); inputNombreRef.current?.focus(); }} onFocusOutside={(e) => e.preventDefault()} onInteractOutside={(e) => { if (Date.now() - abiertoNombreEn.current < 600) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Nombre del grupo</DialogTitle>
          </DialogHeader>
          <Input ref={inputNombreRef} data-guia="dashboard.grupo_nombre" autoFocus value={nombreTemp} onChange={(e) => setNombreTemp(e.target.value)} placeholder="Ej.: Académico, Comunicación, Mis herramientas" maxLength={30}
            onBlur={(e) => {
              // Si algo le quita el foco al cuadro en los primeros 2 s (sin que sea un botón del propio cuadro), se recupera.
              const dentro = e.relatedTarget instanceof Element && e.currentTarget.closest("[role=dialog]")?.contains(e.relatedTarget);
              if (!dentro && Date.now() - abiertoNombreEn.current < 2000) requestAnimationFrame(() => inputNombreRef.current?.focus());
            }}
            onKeyDown={(e) => { if (e.key === "Enter" && nombrando) { renombrar(nombrando, nombreTemp); setNombrando(null); } }} />
          <div className="flex justify-end">
            <Button data-guia="dashboard.grupo_nombre_guardar" onClick={() => { if (nombrando) renombrar(nombrando, nombreTemp); setNombrando(null); }}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Grupo abierto: sus fichas grandes, nombre editable y sacar */}
      <Dialog open={!!abierto} onOpenChange={(o) => { if (!o) { setGrupoAbierto(null); setEditandoNombre(false); } }}>
        <DialogContent className="max-w-3xl overflow-visible" data-guia="dashboard.grupo_abierto">
          {abierto && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-center gap-2 text-2xl">
                {editandoNombre ? (
                  <Input autoFocus value={nombreTemp} maxLength={30} onChange={(e) => setNombreTemp(e.target.value)} className="h-9 max-w-xs text-center text-lg"
                    onBlur={() => { renombrar(abierto.grupo.id, nombreTemp); setEditandoNombre(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { renombrar(abierto.grupo.id, nombreTemp); setEditandoNombre(false); } if (e.key === "Escape") setEditandoNombre(false); }} />
                ) : (
                  <>
                    <span>{abierto.grupo.nombre || "Grupo"}</span>
                    <button type="button" data-guia="dashboard.grupo_renombrar" title="Editar nombre" className="text-muted-foreground hover:text-primary" onClick={() => { setNombreTemp(abierto.grupo.nombre); setEditandoNombre(true); }}>
                      <Pencil className="w-5 h-5" />
                    </button>
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            {/* Sostener una ficha y arrastrarla fuera del recuadro la saca del grupo; entre fichas, las reordena. */}
            <SortableContext items={abierto.grupo.items} strategy={rectSortingStrategy}>
              <div ref={gridGrupoRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 pt-2 px-2" data-guia="dashboard.grupo_sacar">
                {abierto.items.map((it, j) => (
                  <SortableCard key={it.id} id={it.id} jiggling={jiggling} index={j} destinoAgrupar={false}>
                    {it.render}
                  </SortableCard>
                ))}
              </div>
            </SortableContext>
          </>)}
        </DialogContent>
      </Dialog>
      </DndContext>
    </>
  );
}
