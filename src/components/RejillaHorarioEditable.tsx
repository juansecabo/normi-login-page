import { useRef, useState, type CSSProperties } from "react";
import {
  DndContext, DragOverlay, MeasuringStrategy, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";

/**
 * Rejilla del horario en modo edición (Juan 2026-09-24): tocar una casilla escoge la materia;
 * mantener presionada una ficha la deja mover (como las fichas del dashboard, sin temblar).
 *  - En el mismo día, las demás fichas se corren mientras se arrastra.
 *  - A otro día solo se puede soltar en una casilla vacía (si el día está lleno, no hay dónde).
 *  - Si al soltar un profesor queda cruzado con otro salón, no se mueve y se avisa (onCruce).
 */
export interface ClaseEdit { dia: number; hora: number | null; asignatura: string; hora_inicio?: string | null; hora_fin?: string | null; profesores?: { id: string; nombre: string }[]; inicio?: string | null; fin?: string | null; [k: string]: any }
type Pos = { dia: number; hora: number };
const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Mueve la ficha (todas las clases de esa casilla) de `de` a `a`. null = no se puede. */
export function moverFicha<T extends ClaseEdit>(clases: T[], de: Pos, a: Pos, horas: number): T[] | null {
  if (de.dia === a.dia && de.hora === a.hora) return clases;
  const enCasilla = (c: T, p: Pos) => c.dia === p.dia && c.hora === p.hora;
  if (!clases.some((c) => enCasilla(c, de))) return null;
  // Al cambiar de hora, las horas de reloj propias se quitan: rige la franja de la nueva hora.
  const reubicar = (c: T, dia: number, hora: number): T => (c.dia === dia && c.hora === hora ? c : { ...c, dia, hora, hora_inicio: null, hora_fin: null });
  if (de.dia !== a.dia) {
    if (clases.some((c) => enCasilla(c, a))) return null; // otro día: solo en casilla vacía
    return clases.map((c) => (enCasilla(c, de) ? reubicar(c, a.dia, a.hora) : c));
  }
  // Mismo día: se saca la ficha y se inserta en la nueva hora; las de en medio se corren.
  const columna: T[][] = Array.from({ length: horas }, (_, i) => clases.filter((c) => c.dia === de.dia && c.hora === i + 1));
  const [ficha] = columna.splice(de.hora - 1, 1);
  columna.splice(a.hora - 1, 0, ficha);
  const nuevaPos = new Map<T, number>();
  columna.forEach((grupo, i) => grupo.forEach((c) => nuevaPos.set(c, i + 1)));
  return clases.map((c) => (nuevaPos.has(c) ? reubicar(c, de.dia, nuevaPos.get(c)!) : c));
}

function Contenido({ cs, franja, sinProfesorTexto }: { cs: ClaseEdit[]; franja: boolean; sinProfesorTexto?: string }) {
  return (
    <>
      {cs.map((c, k) => (
        <div key={k}>
          <div className="font-semibold text-foreground leading-tight">{c.asignatura}</div>
          <div className="text-[11px] text-muted-foreground leading-tight">{(c.profesores || []).map((p) => p.nombre).join(", ") || sinProfesorTexto}</div>
          {(c.inicio || c.fin) && !franja && <div className="text-[11px] text-muted-foreground">{c.inicio}{c.fin ? ` a ${c.fin}` : ""}</div>}
        </div>
      ))}
    </>
  );
}

function Casilla({ pos, cs, franja, arrastrandoEsta, onCelda, estilo, clase, bloqueado }: {
  pos: Pos; cs: ClaseEdit[]; franja: boolean; arrastrandoEsta: boolean; onCelda: () => void;
  estilo?: CSSProperties; clase: string; bloqueado: boolean;
}) {
  const id = `${pos.dia}|${pos.hora}`;
  const vacia = cs.length === 0;
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `c:${id}`, disabled: bloqueado });
  const { setNodeRef: dragRef, attributes, listeners } = useDraggable({ id: `f:${id}`, disabled: vacia });
  return (
    <div ref={dropRef} className="h-full">
      <button
        ref={dragRef}
        type="button"
        {...(vacia ? {} : attributes)}
        {...(vacia ? {} : listeners)}
        onClick={onCelda}
        className={`w-full min-h-[64px] rounded-lg border p-2 text-left transition-colors touch-manipulation select-none ${vacia ? "border-dashed border-border bg-muted/30" : clase} hover:ring-2 hover:ring-primary/40 cursor-pointer ${isOver && !bloqueado ? "ring-2 ring-primary" : ""} ${arrastrandoEsta ? "opacity-40" : ""}`}
        style={vacia ? undefined : estilo}
      >
        {vacia ? <span className="text-xs text-muted-foreground">+ Agregar</span> : <Contenido cs={cs} franja={franja} />}
      </button>
    </div>
  );
}

export default function RejillaHorarioEditable({ clases, dias, horas, franjas, onCelda, onCambiar, cruces, onCruce, colorDe, estiloDe, guia }: {
  clases: ClaseEdit[]; dias: number[]; horas: number; franjas?: { hora: number; hora_inicio: string; hora_fin: string }[];
  onCelda: (dia: number, hora: number) => void;
  onCambiar: (nuevas: ClaseEdit[]) => void;
  /** Motivos de cruce si esa materia quedara en ese día y hora (vacío = sin cruce). */
  cruces: (asignatura: string, dia: number, hora: number) => string[];
  onCruce: (motivos: string[]) => void;
  colorDe: (a: string) => string; estiloDe: (a: string) => CSSProperties | undefined; guia?: string;
}) {
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
  );
  const [de, setDe] = useState<Pos | null>(null);
  const [vista, setVista] = useState<ClaseEdit[] | null>(null);
  const recienSoltado = useRef(false);
  const aPos = (id: string | number | undefined): Pos | null => {
    const m = /^[cf]:(\d+)\|(\d+)$/.exec(String(id ?? ""));
    return m ? { dia: Number(m[1]), hora: Number(m[2]) } : null;
  };
  const franja = (h: number) => franjas?.find((f) => f.hora === h);

  const alEmpezar = (e: DragStartEvent) => { setDe(aPos(e.active.id)); setVista(null); };
  const alPasar = (e: DragOverEvent) => {
    if (!de) return;
    const a = aPos(e.over?.id);
    setVista(a ? moverFicha(clases, de, a, horas) : null);
  };
  const alSoltar = (e: DragEndEvent) => {
    const origen = de;
    setDe(null); setVista(null);
    recienSoltado.current = true; setTimeout(() => { recienSoltado.current = false; }, 0);
    const a = aPos(e.over?.id);
    if (!origen || !a) return;
    const nuevas = moverFicha(clases, origen, a, horas);
    if (!nuevas || nuevas === clases) return;
    // Cruces de profesores: se revisan todas las fichas que cambiaron de día u hora.
    const motivos: string[] = [];
    nuevas.forEach((c, i) => {
      const antes = clases[i];
      if (c.hora != null && (c.dia !== antes.dia || c.hora !== antes.hora)) {
        for (const m of cruces(c.asignatura, c.dia, c.hora)) motivos.push(`${c.asignatura} el ${DIAS[c.dia].toLowerCase()} a la ${c.hora}.ª hora: ${m}`);
      }
    });
    if (motivos.length) { onCruce([...new Set(motivos)]); return; }
    onCambiar(nuevas);
  };

  const mostrar = vista || clases;
  // Mientras se arrastra, la ficha se ve en su nuevo lugar (tenue); la que sigue al cursor va aparte.
  const fichaArrastrada = de ? clases.filter((c) => c.dia === de.dia && c.hora === de.hora) : [];
  const posFicha = (() => {
    if (!de || !vista) return de;
    const i = clases.findIndex((c) => c.dia === de.dia && c.hora === de.hora);
    const c = vista[i];
    return c && c.hora != null ? { dia: c.dia, hora: c.hora } : de;
  })();

  return (
    <DndContext sensors={sensores} collisionDetection={pointerWithin} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={alEmpezar} onDragOver={alPasar} onDragEnd={alSoltar} onDragCancel={() => { setDe(null); setVista(null); }}>
      <div className="overflow-x-auto -mx-2 px-2" data-guia={guia}>
        <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1 text-sm">
          <colgroup><col className="w-20" />{dias.map((d) => <col key={d} />)}</colgroup>
          <thead>
            <tr>
              <th className="w-20 text-xs font-medium text-muted-foreground">Hora</th>
              {dias.map((d) => <th key={d} className="font-semibold text-foreground py-1">{DIAS[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: horas }, (_, i) => i + 1).map((h) => {
              const fr = franja(h);
              return (
                <tr key={h}>
                  <td className="text-center align-middle">
                    <div className="font-semibold text-foreground">{h}.ª</div>
                    {fr && <div className="text-[11px] text-muted-foreground leading-tight">{fr.hora_inicio}<br />{fr.hora_fin}</div>}
                  </td>
                  {dias.map((d) => {
                    const cs = mostrar.filter((c) => c.dia === d && c.hora === h);
                    // A otro día solo se suelta en casilla vacía: las ocupadas de otros días no reciben.
                    const bloqueado = !!de && d !== de.dia && clases.some((c) => c.dia === d && c.hora === h);
                    return (
                      <td key={d} className="align-top">
                        <Casilla
                          pos={{ dia: d, hora: h }} cs={cs} franja={!!fr} bloqueado={bloqueado}
                          arrastrandoEsta={!!posFicha && posFicha.dia === d && posFicha.hora === h}
                          onCelda={() => { if (!recienSoltado.current) onCelda(d, h); }}
                          clase={cs.length ? colorDe(cs[0].asignatura) : ""} estilo={cs.length ? estiloDe(cs[0].asignatura) : undefined}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {dias.some((d) => mostrar.some((c) => c.dia === d && c.hora == null)) && (
              <tr>
                <td className="text-center text-xs text-muted-foreground align-middle">Sin hora</td>
                {dias.map((d) => (
                  <td key={d} className="align-top">
                    <div className="flex flex-col gap-1">
                      {mostrar.filter((c) => c.dia === d && c.hora == null).map((c, k) => (
                        <div key={k} className={`rounded-lg border p-2 ${colorDe(c.asignatura)}`} style={estiloDe(c.asignatura)}><Contenido cs={[c]} franja /></div>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DragOverlay dropAnimation={null}>
        {fichaArrastrada.length > 0 && (
          <div className={`min-h-[64px] rounded-lg border p-2 text-left shadow-xl cursor-grabbing text-sm ${colorDe(fichaArrastrada[0].asignatura)}`} style={estiloDe(fichaArrastrada[0].asignatura)}>
            <Contenido cs={fichaArrastrada} franja />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
