import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/apiClient";
import { esquemasDelColegio, etiquetaCorte, type Esquema, type EsquemaNivel } from "@/utils/esquema";
import { CalendarDays, ChevronDown, ChevronRight, Eraser, Loader2, Trash2, Pencil } from "lucide-react";

/**
 * Ficha "Calendario" de Configurar Institución — calendario ANUAL visual:
 * los 12 meses del año escolar. Se elige una herramienta (Periodo 1–4 o Día
 * sin clases), se hace clic en el día inicial y luego en el final y el rango
 * queda pintado (los periodos se guardan solos; los días sin clases piden el
 * motivo). La goma quita periodos o días sin clases.
 *
 * Normi usa estas fechas (periodo actual, días sin clases) y los avisos
 * automáticos no se envían en días marcados sin clases.
 */

interface Periodo { periodo: number; fecha_inicio: string; fecha_fin: string; ano_escolar?: number; nivel?: string }
/** Alcance igual que un evento: niveles, grados y aulas vacíos = todo el colegio (`nivel` = columna vieja). */
interface DiaNoLectivo { id: number; fecha_inicio: string; fecha_fin: string; motivo: string | null; nivel?: string; niveles?: string[]; grados?: string[]; aulas?: string[] }
/** Alcance (Juan 2026-09-24): niveles, grados y aulas ("Grado|Salon") vacíos = todo el colegio. */
interface Evento { id: number; fecha_inicio: string; fecha_fin: string; nombre: string; nivel?: string; niveles?: string[]; grados?: string[]; aulas?: string[] }
interface Alcance { niveles: string[]; grados: string[]; aulas: string[] }
interface NivelEstructura { nivel: string; grados: Array<{ grado: string; salones: string[] }> }
const ALCANCE_TODO: Alcance = { niveles: [], grados: [], aulas: [] };
const alcanceDe = (e: Evento | DiaNoLectivo): Alcance => ({ niveles: [...new Set([...(e.niveles || []), ...(e.nivel ? [e.nivel] : [])])], grados: e.grados || [], aulas: e.aulas || [] });
/** "Secundaria, Décimo y Undécimo 2" (vacío = todo el colegio). */
const textoAlcance = (a: Alcance): string => {
  const partes = [...a.niveles, ...a.grados, ...a.aulas.map((x) => x.replace("|", " "))];
  return partes.length <= 1 ? (partes[0] || "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
};

/**
 * "Para quién es" un evento: todo el colegio, o los niveles, grados o salones que se marquen.
 * Marcar un nivel incluye todos sus grados; marcar un grado incluye todos sus salones.
 */
function SelectorAlcance({ estructura, valor, onChange, guia = "configurar_institucion.cal_evento_alcance" }: { estructura: NivelEstructura[]; valor: Alcance; onChange: (a: Alcance) => void; guia?: string }) {
  const [escoger, setEscoger] = useState(textoAlcance(valor) !== "");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const abrir = (k: string) => setAbiertos((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const alternar = (campo: keyof Alcance, v: string) => {
    const lista = valor[campo].includes(v) ? valor[campo].filter((x) => x !== v) : [...valor[campo], v];
    onChange({ ...valor, [campo]: lista });
  };
  return (
    <div className="space-y-2" data-guia={guia}>
      <p className="text-sm font-medium">Para quién es</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setEscoger(false); onChange(ALCANCE_TODO); }}
          className={`px-3 py-1 rounded-full border text-sm ${!escoger ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}>Todo el colegio</button>
        <button type="button" onClick={() => setEscoger(true)}
          className={`px-3 py-1 rounded-full border text-sm ${escoger ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}>Escoger niveles, grados o salones</button>
      </div>
      {escoger && (
        <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {estructura.map((n) => {
            const nivelMarcado = valor.niveles.includes(n.nivel);
            return (
              <div key={n.nivel} className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => abrir(n.nivel)} className="p-0.5 text-muted-foreground hover:text-foreground" aria-label={`Ver grados de ${n.nivel}`}>
                    {abiertos.has(n.nivel) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input type="checkbox" checked={nivelMarcado} onChange={() => alternar("niveles", n.nivel)} /> {n.nivel}
                  </label>
                </div>
                {abiertos.has(n.nivel) && (
                  <div className="pl-7 pt-1 space-y-1">
                    {n.grados.map((g) => {
                      const gradoMarcado = nivelMarcado || valor.grados.includes(g.grado);
                      const kg = `${n.nivel}|${g.grado}`;
                      return (
                        <div key={g.grado}>
                          <div className="flex items-center gap-2">
                            {g.salones.length > 0 ? (
                              <button type="button" onClick={() => abrir(kg)} className="p-0.5 text-muted-foreground hover:text-foreground" aria-label={`Ver salones de ${g.grado}`}>
                                {abiertos.has(kg) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            ) : <span className="w-[22px]" />}
                            <label className={`flex items-center gap-2 text-sm ${nivelMarcado ? "opacity-60" : "cursor-pointer"}`}>
                              <input type="checkbox" checked={gradoMarcado} disabled={nivelMarcado} onChange={() => alternar("grados", g.grado)} /> {g.grado}
                            </label>
                          </div>
                          {abiertos.has(kg) && (
                            <div className="pl-8 pt-1 flex flex-wrap gap-x-3 gap-y-1">
                              {g.salones.map((sa) => {
                                const ka = `${g.grado}|${sa}`;
                                return (
                                  <label key={ka} className={`flex items-center gap-1.5 text-sm ${gradoMarcado ? "opacity-60" : "cursor-pointer"}`}>
                                    <input type="checkbox" checked={gradoMarcado || valor.aulas.includes(ka)} disabled={gradoMarcado} onChange={() => alternar("aulas", ka)} /> {g.grado} {sa}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {escoger && <p className="text-xs text-muted-foreground">{textoAlcance(valor) ? `Solo para ${textoAlcance(valor)}.` : "Si no marcas nada, queda para todo el colegio."}</p>}
    </div>
  );
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fechaLinda = (fISO: string) => {
  const [y, m, d] = fISO.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
};

type Herramienta = `p${number}` | "sinclases" | "evento" | "quitar";

// Paleta por corte (hasta 6). El nombre depende del esquema del nivel: "Periodo n" o "Semestre n".
const PALETA: Array<{ fondo: string; chip: string }> = [
  { fondo: "", chip: "" },
  { fondo: "bg-emerald-200 hover:bg-emerald-300", chip: "bg-emerald-200 border-emerald-400" },
  { fondo: "bg-sky-200 hover:bg-sky-300", chip: "bg-sky-200 border-sky-400" },
  { fondo: "bg-amber-200 hover:bg-amber-300", chip: "bg-amber-200 border-amber-400" },
  { fondo: "bg-orange-300 hover:bg-orange-400", chip: "bg-orange-300 border-orange-400" },
  { fondo: "bg-rose-200 hover:bg-rose-300", chip: "bg-rose-200 border-rose-400" },
  { fondo: "bg-teal-200 hover:bg-teal-300", chip: "bg-teal-200 border-teal-400" },
];
const estiloPeriodo = (n: number, esquema: Esquema): { fondo: string; chip: string; nombre: string } => ({
  ...(PALETA[n] || PALETA[1]), nombre: etiquetaCorte(esquema, n),
});

interface Props {
  colegioId?: string;
  /** Solo visualización (ficha "Calendario" de todos los dashboards): sin
   *  herramientas, sin editar ni eliminar; el clic sobre un día solo informa. */
  soloLectura?: boolean;
}

const CalendarioColegioEditor = ({ colegioId, soloLectura = false }: Props) => {
  const { toast } = useToast();
  const qCid = colegioId ? `?colegio_id=${colegioId}` : "";
  const withCid = (body: Record<string, unknown>) => (colegioId ? { ...body, colegio_id: colegioId } : body);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [anoEscolar, setAnoEscolar] = useState<number>(new Date().getFullYear());
  const [dias, setDias] = useState<DiaNoLectivo[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [esquemas, setEsquemas] = useState<EsquemaNivel[]>([]);
  const [todosPeriodos, setTodosPeriodos] = useState<Periodo[]>([]);
  const [nivelesVe, setNivelesVe] = useState<string[] | null>(null);
  const [estructura, setEstructura] = useState<NivelEstructura[]>([]);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const navigate = useNavigate();
  // Un solo calendario (Juan 2026-09-24): los periodos son iguales para todos los niveles por
  // periodos y los semestres iguales para todos los niveles por semestres. Si el colegio tiene
  // niveles por semestres, un selector cambia entre ver (o editar) periodos y semestres.
  const nivelesSem = esquemas.filter((e) => e.esquema === "semestres").map((e) => e.nivel);
  const [verSemestres, setVerSemestres] = useState(false);
  const esqSel: Esquema = verSemestres ? "semestres" : "periodos";
  const cortes: number[] = verSemestres ? (esquemas.find((e) => e.nivel === nivelesSem[0])?.cortes || [1, 2]) : [1, 2, 3, 4];
  const periodos = verSemestres ? todosPeriodos.filter((p) => p.nivel === nivelesSem[0]) : todosPeriodos.filter((p) => !p.nivel);
  const periodosVista = periodos;
  const setPeriodos = (nuevos: Periodo[]) => setTodosPeriodos((prev) => (verSemestres
    ? [...prev.filter((p) => !nivelesSem.includes(p.nivel || "")), ...nivelesSem.flatMap((n) => nuevos.map((p) => ({ ...p, nivel: n })))]
    : [...prev.filter((p) => !!p.nivel), ...nuevos.map((p) => ({ ...p, nivel: "" }))]));
  // En solo lectura cada quien ve lo que le aplica: si solo le competen niveles por semestres, ve semestres.
  const semestresMios = nivelesVe ? nivelesSem.filter((n) => nivelesVe.includes(n)) : nivelesSem;
  const periodosMios = !nivelesVe || nivelesVe.length === 0 || nivelesVe.some((n) => !nivelesSem.includes(n));
  const mostrarSelectorEsquema = semestresMios.length > 0 && periodosMios;
  useEffect(() => { if (semestresMios.length > 0 && !periodosMios) setVerSemestres(true); }, [semestresMios.length, periodosMios]);
  /** Rector, administrador y coordinadores editan todo por igual (el servidor también lo valida). */
  const puedeTocar = () => !soloLectura;
  const diasVista = dias;
  const eventosVista = eventos;
  const [festivos, setFestivos] = useState<Map<string, string>>(new Map());

  const cargar = async () => {
    try {
      const r = await apiRequest<{ periodos: Periodo[]; dias: DiaNoLectivo[]; eventos?: Evento[]; festivos: Array<{ fecha: string; nombre: string } | string>; ano_escolar: number; niveles_ve?: string[] | null; estructura?: NivelEstructura[] }>(`/api/institucion/calendario${qCid}`);
      setNivelesVe(r.niveles_ve ?? null);
      setPuedeEditar(!!(r as any).puede_editar);
      setEstructura(r.estructura || []);
      setAnoEscolar(r.ano_escolar);
      setTodosPeriodos((r.periodos || []).filter((p) => p.ano_escolar === r.ano_escolar));
      esquemasDelColegio().then(setEsquemas).catch(() => setEsquemas([]));
      setDias(r.dias || []);
      setEventos(r.eventos || []);
      setFestivos(new Map((r.festivos || []).map((f) => (typeof f === "string" ? [f, "Festivo"] : [f.fecha, f.nombre]))));
    } catch { /* la vista muestra vacío */ }
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [colegioId]);

  // ── Herramienta y selección por ARRASTRE: mousedown fija el inicio, se
  //    arrastra para extender y al soltar (mouseup global) se aplica el rango.
  //    Un solo clic (down+up en el mismo día) marca únicamente ese día.
  //    Clic de nuevo sobre la herramienta activa la SUELTA: sin herramienta,
  //    el clic sobre un día pintado muestra su detalle (ver/editar). ──
  const [herramienta, setHerramienta] = useState<Herramienta | null>(null);
  const toggleHerramienta = (h: Herramienta, e?: React.MouseEvent<HTMLButtonElement>) => {
    // Soltar el foco del chip: si no, al desactivarlo queda la línea del outline de foco.
    e?.currentTarget?.blur();
    setArrastre2(null);
    setOcultos(new Set());   // con filtro puesto, lo que se pinte o se quite no se vería
    setHerramienta((prev) => (prev === h ? null : h));
  };
  const [arrastre, setArrastre] = useState<{ ini: string; fin: string } | null>(null);
  const arrastreRef = useRef<{ ini: string; fin: string } | null>(null);
  const setArrastre2 = (v: { ini: string; fin: string } | null) => { arrastreRef.current = v; setArrastre(v); };

  const err = (title: string, description?: string) => toast({ title, description, variant: "destructive" });

  const guardarPeriodos = async (nuevos: Periodo[]) => {
    setGuardando(true);
    try {
      await apiRequest("/api/institucion/calendario/periodos", {
        method: "PUT",
        body: JSON.stringify(withCid({
          ano_escolar: anoEscolar,
          esquema: esqSel,
          periodos: cortes.map((n) => {
            const p = nuevos.find((x) => x.periodo === n);
            return { periodo: n, fecha_inicio: p?.fecha_inicio || "", fecha_fin: p?.fecha_fin || "" };
          }),
        })),
      });
      setPeriodos(nuevos.sort((a, b) => a.periodo - b.periodo));
    } catch (e: any) {
      err("No se pudo guardar el periodo", (e?.body as any)?.detail || e?.message);
    } finally { setGuardando(false); }
  };

  // ── Día sin clases: el rango pide motivo en un dialog ──
  const [motivoDialog, setMotivoDialog] = useState<{ ini: string; fin: string } | null>(null);
  const [motivoTexto, setMotivoTexto] = useState("");
  const [diaAlcance, setDiaAlcance] = useState<Alcance>(ALCANCE_TODO);
  const crearDiaSinClases = async () => {
    if (!motivoDialog) return;
    setGuardando(true);
    try {
      await apiRequest("/api/institucion/calendario/dias", {
        method: "POST",
        body: JSON.stringify(withCid({ fecha_inicio: motivoDialog.ini, fecha_fin: motivoDialog.fin, motivo: motivoTexto.trim(), ...diaAlcance })),
      });
      setMotivoDialog(null); setMotivoTexto("");
      await cargar();
    } catch (e: any) {
      err("No se pudo marcar", (e?.body as any)?.detail || e?.message);
    } finally { setGuardando(false); }
  };

  // ── Evento (entrega de boletines, día deportivo…): pide nombre ──
  const [eventoDialog, setEventoDialog] = useState<{ ini: string; fin: string } | null>(null);
  const [eventoNombre, setEventoNombre] = useState("");
  const [eventoAlcance, setEventoAlcance] = useState<Alcance>(ALCANCE_TODO);
  const crearEvento = async () => {
    if (!eventoDialog || !eventoNombre.trim()) return;
    setGuardando(true);
    try {
      await apiRequest("/api/institucion/calendario/eventos", {
        method: "POST",
        body: JSON.stringify(withCid({ fecha_inicio: eventoDialog.ini, fecha_fin: eventoDialog.fin, nombre: eventoNombre.trim(), ...eventoAlcance })),
      });
      setEventoDialog(null); setEventoNombre("");
      await cargar();
    } catch (e: any) {
      err("No se pudo crear el evento", (e?.body as any)?.detail || e?.message);
    } finally { setGuardando(false); }
  };

  // ── Quitar (goma): confirmaciones ──
  const [confirmDia, setConfirmDia] = useState<DiaNoLectivo | null>(null);
  const [confirmPeriodo, setConfirmPeriodo] = useState<number | null>(null);
  const [confirmEvento, setConfirmEvento] = useState<Evento | null>(null);
  // Lista de eventos del día desde la que se pidió eliminar (para volver a ella).
  const [volverAEventos, setVolverAEventos] = useState<{ fecha: string; eventos: Evento[] } | null>(null);
  const eliminarEvento = async () => {
    if (!confirmEvento) return;
    setGuardando(true);
    try {
      await apiRequest(`/api/institucion/calendario/eventos/${confirmEvento.id}${qCid}`, { method: "DELETE" });
      const restantes = volverAEventos ? volverAEventos.eventos.filter((e) => e.id !== confirmEvento.id) : [];
      setConfirmEvento(null);
      setVolverAEventos(null);
      if (volverAEventos && restantes.length > 0) setDetalle({ tipo: "eventos", fecha: volverAEventos.fecha, eventos: restantes });
      await cargar();
    } catch (e: any) {
      err("No se pudo eliminar", (e?.body as any)?.detail || e?.message);
    } finally { setGuardando(false); }
  };
  const eliminarDia = async () => {
    if (!confirmDia) return;
    setGuardando(true);
    try {
      await apiRequest(`/api/institucion/calendario/dias/${confirmDia.id}${qCid}`, { method: "DELETE" });
      setConfirmDia(null);
      await cargar();
    } catch (e: any) {
      err("No se pudo eliminar", (e?.body as any)?.detail || e?.message);
    } finally { setGuardando(false); }
  };
  const quitarPeriodo = async () => {
    if (confirmPeriodo == null) return;
    await guardarPeriodos(periodos.filter((p) => p.periodo !== confirmPeriodo));
    setConfirmPeriodo(null);
  };

  // ── Detalle de un día (sin herramienta): ver/editar lo que hay ahí ──
  // Al tocar un día se ve también a qué periodo (o semestre) pertenece.
  const lineaPeriodo = (f: string) => {
    const per = periodosVista.find((p) => p.fecha_inicio <= f && f <= p.fecha_fin);
    return per ? <p className="text-xs font-medium text-primary">{estiloPeriodo(per.periodo, esqSel).nombre}: del {fechaLinda(per.fecha_inicio)} al {fechaLinda(per.fecha_fin)}</p> : null;
  };
  // Un evento con varias líneas (varias actividades el mismo día) se muestra en viñetas.
  const vinetasEvento = (nombre: string) => {
    const lineas = nombre.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    return lineas.length > 1
      ? <ul className="list-disc pl-5 space-y-1 text-sm text-foreground break-words">{lineas.map((l, i) => <li key={i}>{l}</li>)}</ul>
      : <p className="text-sm text-foreground whitespace-pre-wrap break-words">{nombre}</p>;
  };
  type Detalle =
    /** `eventos`: los que caen ese día (un evento puede existir en un día con o sin clases). */
    | { tipo: "dia"; dia: DiaNoLectivo; fecha: string; eventos: Evento[] }
    /** `desde`: lista de eventos del día de la que se abrió (para volver a ella). */
    | { tipo: "evento"; evento: Evento; desde?: { fecha: string; eventos: Evento[] } }
    /** Varios eventos caen en el mismo día: se listan para elegir cuál editar o quitar. */
    | { tipo: "eventos"; fecha: string; eventos: Evento[] }
    | { tipo: "festivo"; fecha: string; nombre: string }
    | { tipo: "periodo"; periodo: Periodo };
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [motivoEdit, setMotivoEdit] = useState("");
  const [eventoEdit, setEventoEdit] = useState("");
  const [alcanceEdit, setAlcanceEdit] = useState<Alcance>(ALCANCE_TODO);
  const [alcanceDiaEdit, setAlcanceDiaEdit] = useState<Alcance>(ALCANCE_TODO);
  // El detalle abre mostrando (texto plano). Solo al tocar "Editar" aparece el
  // cuadro de texto: así el clic sobre un día no salta a editar con el cursor
  // metido en el campo.
  const [editandoDetalle, setEditandoDetalle] = useState(false);
  const guardarNombreEvento = async () => {
    if (!detalle || detalle.tipo !== "evento" || !eventoEdit.trim()) return;
    setGuardando(true);
    try {
      await apiRequest(`/api/institucion/calendario/eventos/${detalle.evento.id}${qCid}`, {
        method: "PATCH",
        body: JSON.stringify(withCid({ nombre: eventoEdit.trim(), ...alcanceEdit })),
      });
      const nombreNuevo = eventoEdit.trim();
      const desde = detalle.desde;
      setDetalle(desde
        ? { tipo: "eventos", fecha: desde.fecha, eventos: desde.eventos.map((e) => (e.id === detalle.evento.id ? { ...e, nombre: nombreNuevo, ...alcanceEdit, nivel: "" } : e)) }
        : null);
      await cargar();
    } catch (e: any) {
      err("No se pudo guardar", (e?.body as any)?.detail || e?.message);
    } finally { setGuardando(false); }
  };
  const guardarMotivo = async () => {
    if (!detalle || detalle.tipo !== "dia") return;
    setGuardando(true);
    try {
      await apiRequest(`/api/institucion/calendario/dias/${detalle.dia.id}${qCid}`, {
        method: "PATCH",
        body: JSON.stringify(withCid({ motivo: motivoEdit.trim(), ...alcanceDiaEdit })),
      });
      setDetalle(null);
      await cargar();
    } catch (e: any) {
      err("No se pudo guardar", (e?.body as any)?.detail || e?.message);
    } finally { setGuardando(false); }
  };

  const bajarEnDia = (f: string) => {
    if (guardando) return;
    if (herramienta === "quitar") {
      const dia = esVisible("sin") ? diasVista.find((d) => d.fecha_inicio <= f && f <= d.fecha_fin) : undefined;
      if (dia) { setConfirmDia(dia); return; }
      const ev = esVisible("ev") ? eventosVista.find((e) => e.fecha_inicio <= f && f <= e.fecha_fin) : undefined;
      if (ev) { setConfirmEvento(ev); return; }
      const per = periodosVista.find((p) => p.fecha_inicio <= f && f <= p.fecha_fin && esVisible(`p${p.periodo}`));
      if (per) { setConfirmPeriodo(per.periodo); return; }
      return;
    }
    if (!herramienta) {
      // Modo inspección: mostrar qué hay en ese día (y permitir editarlo).
      const evs = esVisible("ev") ? eventosVista.filter((e) => e.fecha_inicio <= f && f <= e.fecha_fin) : [];
      const dia = esVisible("sin") ? diasVista.find((d) => d.fecha_inicio <= f && f <= d.fecha_fin) : undefined;
      if (dia) { setMotivoEdit(dia.motivo || ""); setAlcanceDiaEdit(alcanceDe(dia)); setEditandoDetalle(false); setDetalle({ tipo: "dia", dia, fecha: f, eventos: evs }); return; }
      if (evs.length > 1) { setDetalle({ tipo: "eventos", fecha: f, eventos: evs }); return; }
      const ev = evs[0];
      if (ev) { setEventoEdit(ev.nombre); setAlcanceEdit(alcanceDe(ev)); setEditandoDetalle(false); setDetalle({ tipo: "evento", evento: ev }); return; }
      const nombreFestivo = esVisible("fest") ? festivos.get(f) : undefined;
      if (nombreFestivo) { setDetalle({ tipo: "festivo", fecha: f, nombre: nombreFestivo }); return; }
      const per = periodosVista.find((p) => p.fecha_inicio <= f && f <= p.fecha_fin && esVisible(`p${p.periodo}`));
      if (per) { setDetalle({ tipo: "periodo", periodo: per }); return; }
      return;
    }
    setArrastre2({ ini: f, fin: f });
  };

  const extenderA = (f: string) => {
    if (arrastreRef.current) setArrastre2({ ...arrastreRef.current, fin: f });
  };

  // Al soltar el mouse EN CUALQUIER PARTE se aplica el rango arrastrado.
  useEffect(() => {
    const alSoltar = () => {
      const a = arrastreRef.current;
      if (!a) return;
      setArrastre2(null);
      const [ini, fin] = a.ini <= a.fin ? [a.ini, a.fin] : [a.fin, a.ini];
      if (herramienta === "sinclases") {
        setMotivoTexto("");
        setDiaAlcance(ALCANCE_TODO);
        setMotivoDialog({ ini, fin });
      } else if (herramienta === "evento") {
        setEventoNombre("");
        setEventoAlcance(ALCANCE_TODO);
        setEventoDialog({ ini, fin });
      } else if (herramienta && herramienta.startsWith("p")) {
        const n = Number(herramienta.slice(1));
        guardarPeriodos([...periodos.filter((p) => p.periodo !== n), { periodo: n, fecha_inicio: ini, fecha_fin: fin, ano_escolar: anoEscolar }]);
      }
    };
    window.addEventListener("mouseup", alSoltar);
    return () => window.removeEventListener("mouseup", alSoltar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [herramienta, periodos, anoEscolar]);

  // ── Clasificación visual de cada día ──
  const hoyISO = new Date().toISOString().slice(0, 10);
  const enSeleccion = (f: string): boolean => {
    if (!arrastre) return false;
    const [ini, fin] = arrastre.ini <= arrastre.fin ? [arrastre.ini, arrastre.fin] : [arrastre.fin, arrastre.ini];
    return ini <= f && f <= fin;
  };
  // Lista de eventos de un día con Editar / Eliminar (la usan el detalle
  // "eventos" y el detalle de un día sin clases que también tenga eventos).
  const listaEventosDia = (fecha: string, evs: Evento[]) => (
    <ul className="divide-y divide-border rounded-md border border-border">
      {evs.map((ev) => (
        <li key={ev.id} className="flex items-center gap-2 p-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium break-words whitespace-pre-line">{ev.nombre}</p>
            {textoAlcance(alcanceDe(ev)) && <p className="text-xs text-muted-foreground">Solo para {textoAlcance(alcanceDe(ev))}</p>}
            {ev.fecha_inicio !== ev.fecha_fin && (
              <p className="text-xs text-muted-foreground">{fechaLinda(ev.fecha_inicio)} — {fechaLinda(ev.fecha_fin)}</p>
            )}
          </div>
          {!soloLectura && (<>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => { setEventoEdit(ev.nombre); setAlcanceEdit(alcanceDe(ev)); setEditandoDetalle(true); setDetalle({ tipo: "evento", evento: ev, desde: { fecha, eventos: evs } }); }}>
              <Pencil className="w-3.5 h-3.5" /> Editar
            </Button>
            <Button variant="ghost" size="icon" title="Eliminar" onClick={() => { setVolverAEventos({ fecha, eventos: evs }); setDetalle(null); setConfirmEvento(ev); }}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </>)}
        </li>
      ))}
    </ul>
  );

  // Filtro "Ver" (Juan 2026-09-23): sin nada escogido se ve todo; al tocar un botón se ve
  // SOLO eso (y se pueden sumar varios); tocarlo otra vez lo quita, "Ver todo" limpia.
  const esVisible = (k: string) => ocultos.size === 0 || ocultos.has(k);
  const alternar = (k: string) => setOcultos((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  /** Franja de fondo del periodo que cubre el día (continua; redondeada donde empieza o termina). */
  const bandaDia = (f: string, dow: number, dia: number, totalDias: number): string => {
    const per = periodosVista.find((p) => p.fecha_inicio <= f && f <= p.fecha_fin && esVisible(`p${p.periodo}`));
    if (!per) return "";
    const color = estiloPeriodo(per.periodo, esqSel).fondo.split(" ")[0];
    const izq = f === per.fecha_inicio || dow === 0 || dia === 1 ? " rounded-l-md" : "";
    const der = f === per.fecha_fin || dow === 6 || dia === totalDias ? " rounded-r-md" : "";
    return `${color}${izq}${der}`;
  };
  const claseDia = (f: string, dow: number): { cls: string; title: string } => {
    const base = "cursor-pointer select-none";
    const perDia = periodosVista.find((p) => p.fecha_inicio <= f && f <= p.fecha_fin && esVisible(`p${p.periodo}`));
    const enPeriodo = perDia ? ` · ${estiloPeriodo(perDia.periodo, esqSel).nombre}` : "";
    if (enSeleccion(f)) return { cls: `${base} ring-2 ring-primary bg-primary/20`, title: "" };
    const dia = esVisible("sin") ? diasVista.find((d) => d.fecha_inicio <= f && f <= d.fecha_fin) : undefined;
    if (dia) {
      const evsDia = esVisible("ev") ? eventosVista.filter((e) => e.fecha_inicio <= f && f <= e.fecha_fin) : [];
      const conEventos = evsDia.length > 0 ? ` ring-2 ring-inset ring-red-600` : "";
      const titulo = [(dia.motivo || "Día sin clases") + (textoAlcance(alcanceDe(dia)) ? ` (solo ${textoAlcance(alcanceDe(dia))})` : ""), ...evsDia.map((e) => e.nombre + (textoAlcance(alcanceDe(e)) ? ` (solo ${textoAlcance(alcanceDe(e))})` : ""))].join(" · ");
      return { cls: `${base} bg-red-200 hover:bg-red-300 text-red-900${conEventos}`, title: titulo + enPeriodo };
    }
    const ev = esVisible("ev") ? eventosVista.find((e) => e.fecha_inicio <= f && f <= e.fecha_fin) : undefined;
    if (ev) return { cls: `${base} bg-red-400 hover:bg-red-500 text-black`, title: ev.nombre + (textoAlcance(alcanceDe(ev)) ? ` (solo ${textoAlcance(alcanceDe(ev))})` : "") + enPeriodo };
    const nombreFestivo = esVisible("fest") ? festivos.get(f) : undefined;
    if (nombreFestivo) return { cls: `${base} bg-fuchsia-300 text-fuchsia-900`, title: `${nombreFestivo} (festivo automático)${enPeriodo}` };
    // Solo periodo: el color lo pone la franja de fondo; el día queda transparente encima.
    if (perDia) return { cls: `${base} hover:bg-black/10${dow >= 5 ? " text-foreground/60" : ""}`, title: estiloPeriodo(perDia.periodo, esqSel).nombre };
    if (dow >= 5) return { cls: `${base} text-muted-foreground/50`, title: "" };
    return { cls: `${base} hover:bg-muted`, title: "" };
  };

  if (cargando) return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          {/* Título centrado y, debajo, el botón "Ir a configuración" (Juan 2026-09-24). */}
          <div className="flex flex-col items-center gap-3">
            <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-primary" /> Calendario {anoEscolar}</CardTitle>
            {/* Quien puede editar el calendario lo hace en Configurar Institución (Juan 2026-09-24). */}
            {soloLectura && puedeEditar && (
              <Button variant="outline" size="sm" onClick={() => navigate("/construye-institucion?vista=calendario")} data-guia="calendario.ir_configuracion">Ir a configuración</Button>
            )}
          </div>
          {soloLectura ? (
            <p className="text-sm text-muted-foreground text-center">
              Calendario del año escolar: periodos académicos, días sin clases, <strong>Eventos</strong> (entrega de boletines,
              día deportivo…) y festivos de Colombia. Haz clic sobre un día pintado para ver su detalle.
            </p>
          ) : (
          <p className="text-sm text-muted-foreground">
            Elige una herramienta y <strong>haz clic</strong> en un día para marcarlo, o <strong>mantén presionado y arrastra</strong> para
            pintar un rango. Clic de nuevo sobre la herramienta para soltarla: sin herramienta, el clic sobre un día pintado
            muestra qué es y permite editarlo. Los fines de semana y festivos de Colombia ya se tienen en cuenta solos.
            Los avisos automáticos no se envían los días sin clases, y Normi responde con estas fechas. Los <strong>Eventos</strong> (entrega de boletines, día deportivo…) son días CON clases donde además pasa algo — Normi también los informa.
          </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Herramientas (barra fija al hacer scroll: no hay que subir a
                marcar/desmarcar mientras se recorren los 12 meses). En solo
                lectura no hay herramientas. ── */}
          {mostrarSelectorEsquema && (
            <div className="flex flex-wrap items-center gap-2" data-guia="configurar_institucion.cal_nivel">
              <span className="text-sm text-muted-foreground">Ver:</span>
              {[{ v: false, t: "Periodos" }, { v: true, t: `Semestres (${semestresMios.join(", ")})` }].map(({ v, t }) => (
                <button key={t} type="button" onClick={() => { setVerSemestres(v); setHerramienta(null); setOcultos(new Set()); }}
                  className={`px-3 py-1 rounded-full border text-sm ${verSemestres === v ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
          {!soloLectura && (
          <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-md px-3 py-2 -mx-1">
            {cortes.map((n) => (
              <button key={n} data-guia="configurar_institucion.cal_herramienta_periodo" onClick={(e) => toggleHerramienta(`p${n}` as Herramienta, e)}
                className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer focus:outline-none ${estiloPeriodo(n, esqSel).chip} ${herramienta === `p${n}` ? "ring-2 ring-primary font-semibold" : "opacity-80 hover:opacity-100"}`}>
                {estiloPeriodo(n, esqSel).nombre}
              </button>
            ))}
            <button data-guia="configurar_institucion.cal_herramienta_evento" onClick={(e) => toggleHerramienta("evento", e)}
              className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer focus:outline-none bg-red-400 border-red-500 text-black ${herramienta === "evento" ? "ring-2 ring-primary font-semibold" : "opacity-80 hover:opacity-100"}`}>
              Evento
            </button>
            <button data-guia="configurar_institucion.cal_herramienta_sinclases" onClick={(e) => toggleHerramienta("sinclases", e)}
              className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer focus:outline-none bg-red-200 border-red-400 ${herramienta === "sinclases" ? "ring-2 ring-primary font-semibold" : "opacity-80 hover:opacity-100"}`}>
              Día sin clases
            </button>
            <button data-guia="configurar_institucion.cal_herramienta_quitar" onClick={(e) => toggleHerramienta("quitar", e)}
              className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer focus:outline-none bg-background inline-flex items-center gap-1 ${herramienta === "quitar" ? "ring-2 ring-primary font-semibold" : "opacity-80 hover:opacity-100"}`}>
              <Eraser className="w-3.5 h-3.5" /> Quitar
            </button>
            {guardando && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          )}
          {herramienta === "quitar" && (
            <p className="text-sm text-muted-foreground">Haz clic sobre un periodo, un día sin clases o un evento para quitarlo.</p>
          )}

          {/* ── Qué ver: cada botón muestra u oculta esa capa del calendario (hace de leyenda). ── */}
          {/* Celular: "Ver solo" arriba y 3 botones por fila; pantallas grandes: todo en una línea. */}
          <div className={`flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 text-xs border border-border rounded-lg px-3 py-2 ${soloLectura ? "sticky top-2 z-30 bg-card/95 backdrop-blur-sm shadow-md" : "bg-muted/40"}`} data-guia="configurar_institucion.cal_filtro">
            <div className="flex items-center justify-between sm:contents">
              <span className="text-muted-foreground mr-1">Ver solo:</span>
              {ocultos.size > 0 && <button type="button" onClick={() => setOcultos(new Set())} className="text-primary underline sm:hidden">Ver todo</button>}
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
            {[
              ...cortes.map((n) => ({ k: `p${n}`, chip: estiloPeriodo(n, esqSel).chip, nombre: estiloPeriodo(n, esqSel).nombre })),
              { k: "sin", chip: "bg-red-200 border border-red-400", nombre: "Sin clases" },
              { k: "ev", chip: "bg-red-400 border border-red-500", nombre: "Eventos" },
              { k: "fest", chip: "bg-fuchsia-300 border border-fuchsia-400", nombre: "Festivos" },
            ].map(({ k, chip, nombre }) => (
              <button key={k} type="button" onClick={() => alternar(k)} aria-pressed={ocultos.has(k)}
                className={`inline-flex items-center justify-center sm:justify-start gap-1.5 rounded-full border px-2 sm:px-2.5 py-1 whitespace-nowrap transition-colors ${ocultos.has(k) ? "bg-primary/10 border-primary text-foreground ring-1 ring-primary font-semibold" : ocultos.size > 0 ? "bg-background border-border text-muted-foreground opacity-60" : "bg-background border-border text-foreground"}`}>
                <span className={`w-3 h-3 rounded-sm ${chip}`} /> {nombre}
              </button>
            ))}
            </div>
            {ocultos.size > 0 && <button type="button" onClick={() => setOcultos(new Set())} className="ml-1 text-primary underline hidden sm:inline">Ver todo</button>}
          </div>

          {/* ── Los 12 meses ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5" data-guia="configurar_institucion.cal_dia">
            {MESES.map((mes, m) => {
              const primerDow = (new Date(anoEscolar, m, 1).getDay() + 6) % 7; // L=0…D=6
              const totalDias = new Date(anoEscolar, m + 1, 0).getDate();
              return (
                <div key={mes}>
                  <p className="text-sm font-semibold text-center mb-1">{mes}</p>
                  <div className="grid grid-cols-7 gap-y-1 text-center">
                    {DIAS_SEMANA.map((d, i) => <span key={i} className="text-[10px] text-muted-foreground pb-1">{d}</span>)}
                    {Array.from({ length: primerDow }).map((_, i) => <span key={`v${i}`} />)}
                    {Array.from({ length: totalDias }).map((_, i) => {
                      const f = iso(anoEscolar, m, i + 1);
                      const dow = (new Date(anoEscolar, m, i + 1).getDay() + 6) % 7;
                      const { cls, title } = claseDia(f, dow);
                      return (
                        <div key={f} className={`h-7 ${bandaDia(f, dow, i + 1, totalDias)}`}>
                          <button type="button" title={title} draggable={false}
                            onMouseDown={(e) => { e.preventDefault(); bajarEnDia(f); }}
                            onMouseEnter={() => extenderA(f)}
                            className={`h-7 w-full text-[11px] rounded-md flex items-center justify-center ${cls} ${f === hoyISO ? "font-bold underline" : ""}`}>
                            {i + 1}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Leyenda (abajo siempre) ── */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
            {cortes.map((n) => {
              const p = periodosVista.find((x) => x.periodo === n);
              return (
                <span key={n} className="inline-flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-sm ${estiloPeriodo(n, esqSel).chip}`} />
                  {estiloPeriodo(n, esqSel).nombre}{p ? `: ${fechaLinda(p.fecha_inicio)} — ${fechaLinda(p.fecha_fin)}` : " (sin configurar)"}
                </span>
              );
            })}
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-200 border border-red-400" /> Sin clases</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400 border border-red-500" /> Eventos</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-fuchsia-300 border border-fuchsia-400" /> Festivo (automático)</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Lista de días sin clases ── */}
      {diasVista.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Días sin clases configurados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border">
              {diasVista.map((d) => (
                <div key={d.id} className={`flex items-center justify-between px-4 py-2 ${d.fecha_fin < hoyISO ? "opacity-50" : ""}`}>
                  <div>
                    <p className="text-sm font-medium">
                      {d.fecha_inicio === d.fecha_fin ? fechaLinda(d.fecha_inicio) : `${fechaLinda(d.fecha_inicio)} — ${fechaLinda(d.fecha_fin)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{d.motivo || "Sin motivo"}{textoAlcance(alcanceDe(d)) ? <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-[10px]">solo {textoAlcance(alcanceDe(d))}</span> : null}</p>
                  </div>
                  {puedeTocar() && (
                  <button onClick={() => setConfirmDia(d)} className="text-muted-foreground hover:text-destructive cursor-pointer" title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Lista de eventos ── */}
      {eventosVista.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos configurados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border">
              {eventosVista.map((ev) => (
                <div key={ev.id} className={`flex items-center justify-between px-4 py-2 ${ev.fecha_fin < hoyISO ? "opacity-50" : ""}`}>
                  <div>
                    <p className="text-sm font-medium">
                      {ev.fecha_inicio === ev.fecha_fin ? fechaLinda(ev.fecha_inicio) : `${fechaLinda(ev.fecha_inicio)} — ${fechaLinda(ev.fecha_fin)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{ev.nombre}{textoAlcance(alcanceDe(ev)) ? <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-[10px]">solo {textoAlcance(alcanceDe(ev))}</span> : null}</p>
                  </div>
                  {puedeTocar() && (
                  <button onClick={() => setConfirmEvento(ev)} className="text-muted-foreground hover:text-destructive cursor-pointer" title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Motivo del día sin clases */}
      <Dialog open={!!motivoDialog} onOpenChange={(o) => { if (!o) setMotivoDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Día sin clases</DialogTitle>
            <DialogDescription>
              {motivoDialog && (motivoDialog.ini === motivoDialog.fin
                ? fechaLinda(motivoDialog.ini)
                : `${fechaLinda(motivoDialog.ini)} — ${fechaLinda(motivoDialog.fin)}`)}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Textarea data-guia="configurar_institucion.cal_dia_motivo" value={motivoTexto} onChange={(e) => setMotivoTexto(e.target.value)} placeholder="Motivo: semana de receso, jornada pedagógica…" maxLength={80} autoFocus rows={3} className="resize-none" />
          </div>
          <SelectorAlcance estructura={estructura} valor={diaAlcance} onChange={setDiaAlcance} guia="configurar_institucion.cal_dia_alcance" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMotivoDialog(null)} disabled={guardando}>Cancelar</Button>
            <Button data-guia="configurar_institucion.cal_dia_confirmar" onClick={crearDiaSinClases} disabled={guardando} className="gap-2">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Marcar sin clases
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nombre del evento nuevo */}
      <Dialog open={!!eventoDialog} onOpenChange={(o) => { if (!o) setEventoDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo evento</DialogTitle>
            <DialogDescription>
              {eventoDialog && (eventoDialog.ini === eventoDialog.fin
                ? fechaLinda(eventoDialog.ini)
                : `${fechaLinda(eventoDialog.ini)} — ${fechaLinda(eventoDialog.fin)}`)}.
            </DialogDescription>
          </DialogHeader>
          <div>
            {/* 889 = lo que cabe en la plantilla de WhatsApp del aviso diario fuera de ventana de 24h. */}
            <Textarea data-guia="configurar_institucion.cal_evento_nombre" value={eventoNombre} onChange={(e) => setEventoNombre(e.target.value)} placeholder="Nombre: entrega de boletines, día deportivo, izada de bandera…" maxLength={889} autoFocus rows={4} className="resize-none" />
            <p className="text-xs text-muted-foreground text-right mt-1.5">{eventoNombre.length}/889</p>
          </div>
          <SelectorAlcance estructura={estructura} valor={eventoAlcance} onChange={setEventoAlcance} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventoDialog(null)} disabled={guardando}>Cancelar</Button>
            <Button data-guia="configurar_institucion.cal_evento_confirmar" onClick={crearEvento} disabled={guardando || !eventoNombre.trim()} className="gap-2">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Crear evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalle de un día (modo inspección, sin herramienta) */}
      <Dialog open={!!detalle} onOpenChange={(o) => { if (!o) setDetalle(null); }}>
        <DialogContent className="max-w-md">
          {detalle?.tipo === "dia" && (<>
            <DialogHeader>
              <DialogTitle>Día sin clases</DialogTitle>
              <DialogDescription>
                {detalle.dia.fecha_inicio === detalle.dia.fecha_fin
                  ? fechaLinda(detalle.dia.fecha_inicio)
                  : `${fechaLinda(detalle.dia.fecha_inicio)} — ${fechaLinda(detalle.dia.fecha_fin)}`}
              </DialogDescription>
              {lineaPeriodo(detalle.fecha)}
            </DialogHeader>
            {detalle.eventos.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Eventos ese día</p>
                {listaEventosDia(detalle.fecha, detalle.eventos)}
              </div>
            )}
            {soloLectura || !editandoDetalle ? (<>
              <p className="text-sm text-foreground">{detalle.dia.motivo || <span className="text-muted-foreground">Sin motivo</span>}</p>
              <p className="text-xs text-muted-foreground">{textoAlcance(alcanceDe(detalle.dia)) ? `Solo para ${textoAlcance(alcanceDe(detalle.dia))}` : "Para todo el colegio"}</p>
            </>) : (<>
              <Textarea data-guia="configurar_institucion.cal_detalle_texto" value={motivoEdit} onChange={(e) => setMotivoEdit(e.target.value)} placeholder="Motivo: semana de receso, jornada pedagógica…" maxLength={80} rows={3} className="resize-none" />
              <SelectorAlcance estructura={estructura} valor={alcanceDiaEdit} onChange={setAlcanceDiaEdit} guia="configurar_institucion.cal_dia_alcance" />
            </>)}
            {!soloLectura && !editandoDetalle && (
              <DialogFooter>
                <Button variant="destructive" onClick={() => { const d = detalle.dia; setDetalle(null); setConfirmDia(d); }} disabled={guardando} className="gap-2">
                  <Trash2 className="w-4 h-4" /> Eliminar
                </Button>
                <Button data-guia="configurar_institucion.cal_detalle_editar" variant="outline" onClick={() => setEditandoDetalle(true)} className="gap-2">
                  <Pencil className="w-4 h-4" /> Editar
                </Button>
              </DialogFooter>
            )}
            {!soloLectura && editandoDetalle && (<>
            <DialogFooter>
              <Button variant="destructive" onClick={() => { const d = detalle.dia; setDetalle(null); setConfirmDia(d); }} disabled={guardando} className="gap-2">
                <Trash2 className="w-4 h-4" /> Eliminar
              </Button>
              <Button data-guia="configurar_institucion.cal_detalle_guardar" onClick={guardarMotivo} disabled={guardando} className="gap-2">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </Button>
            </DialogFooter>
            </>)}
          </>)}
          {detalle?.tipo === "evento" && (<>
            {detalle.desde && (
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <button type="button" onClick={() => { const d = detalle.desde!; setDetalle({ tipo: "eventos", fecha: d.fecha, eventos: d.eventos }); }} className="text-primary hover:underline">Eventos del día</button>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="text-foreground font-medium truncate max-w-[16rem]">{detalle.evento.nombre}</span>
              </div>
            )}
            <DialogHeader>
              <DialogTitle>Evento</DialogTitle>
              <DialogDescription>
                {detalle.evento.fecha_inicio === detalle.evento.fecha_fin
                  ? fechaLinda(detalle.evento.fecha_inicio)
                  : `${fechaLinda(detalle.evento.fecha_inicio)} — ${fechaLinda(detalle.evento.fecha_fin)}`}
              </DialogDescription>
              {lineaPeriodo(detalle.evento.fecha_inicio)}
            </DialogHeader>
            {soloLectura || !editandoDetalle ? (<>
              {vinetasEvento(detalle.evento.nombre)}
              <p className="text-xs text-muted-foreground">{textoAlcance(alcanceDe(detalle.evento)) ? `Solo para ${textoAlcance(alcanceDe(detalle.evento))}` : "Para todo el colegio"}</p>
            </>) : (<>
              <Textarea data-guia="configurar_institucion.cal_detalle_texto" value={eventoEdit} onChange={(e) => setEventoEdit(e.target.value)} placeholder="Nombre del evento" maxLength={889} rows={4} className="resize-none" />
              <p className="text-xs text-muted-foreground text-right -mt-2">{eventoEdit.length}/889</p>
              <SelectorAlcance estructura={estructura} valor={alcanceEdit} onChange={setAlcanceEdit} />
            </>)}
            {!soloLectura && !editandoDetalle && (
              <DialogFooter>
                <Button variant="destructive" onClick={() => { const ev = detalle.evento; setVolverAEventos(detalle.desde ?? null); setDetalle(null); setConfirmEvento(ev); }} disabled={guardando} className="gap-2">
                  <Trash2 className="w-4 h-4" /> Eliminar
                </Button>
                <Button data-guia="configurar_institucion.cal_detalle_editar" variant="outline" onClick={() => setEditandoDetalle(true)} className="gap-2">
                  <Pencil className="w-4 h-4" /> Editar
                </Button>
              </DialogFooter>
            )}
            {!soloLectura && editandoDetalle && (<>
            <DialogFooter>
              <Button variant="destructive" onClick={() => { const ev = detalle.evento; setVolverAEventos(detalle.desde ?? null); setDetalle(null); setConfirmEvento(ev); }} disabled={guardando} className="gap-2">
                <Trash2 className="w-4 h-4" /> Eliminar
              </Button>
              <Button data-guia="configurar_institucion.cal_detalle_guardar" onClick={guardarNombreEvento} disabled={guardando || !eventoEdit.trim()} className="gap-2">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </Button>
            </DialogFooter>
            </>)}
          </>)}
          {detalle?.tipo === "eventos" && (<>
            <DialogHeader>
              <DialogTitle>Eventos del día</DialogTitle>
              <DialogDescription>{fechaLinda(detalle.fecha)} · Elige cuál quieres ver.</DialogDescription>
              {lineaPeriodo(detalle.fecha)}
            </DialogHeader>
            {listaEventosDia(detalle.fecha, detalle.eventos)}
          </>)}
          {detalle?.tipo === "festivo" && (<>
            <DialogHeader>
              <DialogTitle>{detalle.nombre}</DialogTitle>
              <DialogDescription>{fechaLinda(detalle.fecha)}</DialogDescription>
              {lineaPeriodo(detalle.fecha)}
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Festivo nacional de Colombia.</p>
          </>)}
          {detalle?.tipo === "periodo" && (<>
            <DialogHeader>
              <DialogTitle>{estiloPeriodo(detalle.periodo.periodo, esqSel).nombre}</DialogTitle>
              <DialogDescription>
                Del {fechaLinda(detalle.periodo.fecha_inicio)} al {fechaLinda(detalle.periodo.fecha_fin)}
              </DialogDescription>
            </DialogHeader>
            {!soloLectura && (<>
            <DialogFooter>
              <Button variant="destructive" onClick={() => { const n = detalle.periodo.periodo; setDetalle(null); setConfirmPeriodo(n); }} disabled={guardando} className="gap-2">
                <Eraser className="w-4 h-4" /> {verSemestres ? "Quitar semestre" : "Quitar periodo"}
              </Button>
            </DialogFooter>
            </>)}
          </>)}
        </DialogContent>
      </Dialog>

      {/* Confirmar quitar evento */}
      <Dialog open={!!confirmEvento} onOpenChange={(o) => { if (!o) setConfirmEvento(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar evento</DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              ¿Eliminar el evento {confirmEvento && <strong>"{confirmEvento.nombre}"</strong>} del {confirmEvento && (confirmEvento.fecha_inicio === confirmEvento.fecha_fin
                ? fechaLinda(confirmEvento.fecha_inicio)
                : `${fechaLinda(confirmEvento.fecha_inicio)} — ${fechaLinda(confirmEvento.fecha_fin)}`)}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEvento(null)} disabled={guardando}>Cancelar</Button>
            <Button data-guia="configurar_institucion.cal_quitar_confirmar" variant="destructive" onClick={eliminarEvento} disabled={guardando} className="gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar quitar día sin clases */}
      <Dialog open={!!confirmDia} onOpenChange={(o) => { if (!o) setConfirmDia(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar día sin clases</DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              ¿Eliminar {confirmDia && (confirmDia.fecha_inicio === confirmDia.fecha_fin
                ? <strong>{fechaLinda(confirmDia.fecha_inicio)}</strong>
                : <strong>{fechaLinda(confirmDia.fecha_inicio)} — {fechaLinda(confirmDia.fecha_fin)}</strong>)}
              {confirmDia?.motivo ? ` (${confirmDia.motivo})` : ""}? Esos días volverán a contar como días de clases.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDia(null)} disabled={guardando}>Cancelar</Button>
            <Button data-guia="configurar_institucion.cal_quitar_confirmar" variant="destructive" onClick={eliminarDia} disabled={guardando} className="gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar quitar periodo */}
      <Dialog open={confirmPeriodo != null} onOpenChange={(o) => { if (!o) setConfirmPeriodo(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quitar {confirmPeriodo != null ? estiloPeriodo(confirmPeriodo, esqSel).nombre : ""}</DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              Se borran sus fechas del calendario (puedes volver a pintarlo cuando quieras).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPeriodo(null)} disabled={guardando}>Cancelar</Button>
            <Button data-guia="configurar_institucion.cal_quitar_confirmar" variant="destructive" onClick={quitarPeriodo} disabled={guardando} className="gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />} Quitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarioColegioEditor;
