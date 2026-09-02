import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/apiClient";
import { CalendarDays, Eraser, Loader2, Trash2, Pencil } from "lucide-react";

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

interface Periodo { periodo: number; fecha_inicio: string; fecha_fin: string; ano_escolar?: number }
interface DiaNoLectivo { id: number; fecha_inicio: string; fecha_fin: string; motivo: string | null }
interface Evento { id: number; fecha_inicio: string; fecha_fin: string; nombre: string }

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fechaLinda = (fISO: string) => {
  const [y, m, d] = fISO.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
};

type Herramienta = "p1" | "p2" | "p3" | "p4" | "sinclases" | "evento" | "quitar";

const PERIODO_ESTILO: Record<number, { fondo: string; chip: string; nombre: string }> = {
  1: { fondo: "bg-emerald-200 hover:bg-emerald-300", chip: "bg-emerald-200 border-emerald-400", nombre: "Periodo 1" },
  2: { fondo: "bg-sky-200 hover:bg-sky-300", chip: "bg-sky-200 border-sky-400", nombre: "Periodo 2" },
  3: { fondo: "bg-amber-200 hover:bg-amber-300", chip: "bg-amber-200 border-amber-400", nombre: "Periodo 3" },
  4: { fondo: "bg-violet-200 hover:bg-violet-300", chip: "bg-violet-200 border-violet-400", nombre: "Periodo 4" },
};

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
  const [anoEscolar, setAnoEscolar] = useState<number>(new Date().getFullYear());
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [dias, setDias] = useState<DiaNoLectivo[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [festivos, setFestivos] = useState<Map<string, string>>(new Map());

  const cargar = async () => {
    try {
      const r = await apiRequest<{ periodos: Periodo[]; dias: DiaNoLectivo[]; eventos?: Evento[]; festivos: Array<{ fecha: string; nombre: string } | string>; ano_escolar: number }>(`/api/institucion/calendario${qCid}`);
      setAnoEscolar(r.ano_escolar);
      setPeriodos((r.periodos || []).filter((p) => p.ano_escolar === r.ano_escolar));
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
          periodos: [1, 2, 3, 4].map((n) => {
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
  const crearDiaSinClases = async () => {
    if (!motivoDialog) return;
    setGuardando(true);
    try {
      await apiRequest("/api/institucion/calendario/dias", {
        method: "POST",
        body: JSON.stringify(withCid({ fecha_inicio: motivoDialog.ini, fecha_fin: motivoDialog.fin, motivo: motivoTexto.trim() })),
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
  const crearEvento = async () => {
    if (!eventoDialog || !eventoNombre.trim()) return;
    setGuardando(true);
    try {
      await apiRequest("/api/institucion/calendario/eventos", {
        method: "POST",
        body: JSON.stringify(withCid({ fecha_inicio: eventoDialog.ini, fecha_fin: eventoDialog.fin, nombre: eventoNombre.trim() })),
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
        body: JSON.stringify(withCid({ nombre: eventoEdit.trim() })),
      });
      const nombreNuevo = eventoEdit.trim();
      const desde = detalle.desde;
      setDetalle(desde
        ? { tipo: "eventos", fecha: desde.fecha, eventos: desde.eventos.map((e) => (e.id === detalle.evento.id ? { ...e, nombre: nombreNuevo } : e)) }
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
        body: JSON.stringify(withCid({ motivo: motivoEdit.trim() })),
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
      const dia = dias.find((d) => d.fecha_inicio <= f && f <= d.fecha_fin);
      if (dia) { setConfirmDia(dia); return; }
      const ev = eventos.find((e) => e.fecha_inicio <= f && f <= e.fecha_fin);
      if (ev) { setConfirmEvento(ev); return; }
      const per = periodos.find((p) => p.fecha_inicio <= f && f <= p.fecha_fin);
      if (per) { setConfirmPeriodo(per.periodo); return; }
      return;
    }
    if (!herramienta) {
      // Modo inspección: mostrar qué hay en ese día (y permitir editarlo).
      const evs = eventos.filter((e) => e.fecha_inicio <= f && f <= e.fecha_fin);
      const dia = dias.find((d) => d.fecha_inicio <= f && f <= d.fecha_fin);
      if (dia) { setMotivoEdit(dia.motivo || ""); setEditandoDetalle(false); setDetalle({ tipo: "dia", dia, fecha: f, eventos: evs }); return; }
      if (evs.length > 1) { setDetalle({ tipo: "eventos", fecha: f, eventos: evs }); return; }
      const ev = evs[0];
      if (ev) { setEventoEdit(ev.nombre); setEditandoDetalle(false); setDetalle({ tipo: "evento", evento: ev }); return; }
      const nombreFestivo = festivos.get(f);
      if (nombreFestivo) { setDetalle({ tipo: "festivo", fecha: f, nombre: nombreFestivo }); return; }
      const per = periodos.find((p) => p.fecha_inicio <= f && f <= p.fecha_fin);
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
        setMotivoDialog({ ini, fin });
      } else if (herramienta === "evento") {
        setEventoNombre("");
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
            <p className="text-sm font-medium break-words">{ev.nombre}</p>
            {ev.fecha_inicio !== ev.fecha_fin && (
              <p className="text-xs text-muted-foreground">{fechaLinda(ev.fecha_inicio)} — {fechaLinda(ev.fecha_fin)}</p>
            )}
          </div>
          {!soloLectura && (<>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => { setEventoEdit(ev.nombre); setEditandoDetalle(true); setDetalle({ tipo: "evento", evento: ev, desde: { fecha, eventos: evs } }); }}>
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

  const claseDia = (f: string, dow: number): { cls: string; title: string } => {
    const base = "cursor-pointer select-none";
    if (enSeleccion(f)) return { cls: `${base} ring-2 ring-primary bg-primary/20`, title: "" };
    const dia = dias.find((d) => d.fecha_inicio <= f && f <= d.fecha_fin);
    if (dia) {
      const evsDia = eventos.filter((e) => e.fecha_inicio <= f && f <= e.fecha_fin);
      const conEventos = evsDia.length > 0 ? ` ring-2 ring-inset ring-indigo-400` : "";
      const titulo = [dia.motivo || "Día sin clases", ...evsDia.map((e) => e.nombre)].join(" · ");
      return { cls: `${base} bg-red-200 hover:bg-red-300 text-red-900${conEventos}`, title: titulo };
    }
    const ev = eventos.find((e) => e.fecha_inicio <= f && f <= e.fecha_fin);
    if (ev) return { cls: `${base} bg-indigo-200 hover:bg-indigo-300 text-indigo-900`, title: ev.nombre };
    const nombreFestivo = festivos.get(f);
    if (nombreFestivo) return { cls: `${base} bg-fuchsia-300 text-fuchsia-900`, title: `${nombreFestivo} (festivo automático)` };
    const per = periodos.find((p) => p.fecha_inicio <= f && f <= p.fecha_fin);
    if (per) return { cls: `${base} ${PERIODO_ESTILO[per.periodo].fondo}`, title: PERIODO_ESTILO[per.periodo].nombre };
    if (dow >= 5) return { cls: `${base} text-muted-foreground/50`, title: "" };
    return { cls: `${base} hover:bg-muted`, title: "" };
  };

  if (cargando) return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-primary" /> Calendario {anoEscolar}</CardTitle>
          {soloLectura ? (
            <p className="text-sm text-muted-foreground">
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
          {!soloLectura && (
          <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-md px-3 py-2 -mx-1">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} data-guia="configurar_institucion.cal_herramienta_periodo" onClick={(e) => toggleHerramienta(`p${n}` as Herramienta, e)}
                className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer focus:outline-none ${PERIODO_ESTILO[n].chip} ${herramienta === `p${n}` ? "ring-2 ring-primary font-semibold" : "opacity-80 hover:opacity-100"}`}>
                {PERIODO_ESTILO[n].nombre}
              </button>
            ))}
            <button data-guia="configurar_institucion.cal_herramienta_evento" onClick={(e) => toggleHerramienta("evento", e)}
              className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer focus:outline-none bg-indigo-200 border-indigo-400 ${herramienta === "evento" ? "ring-2 ring-primary font-semibold" : "opacity-80 hover:opacity-100"}`}>
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

          {/* ── Leyenda arriba (solo lectura: que se vea sin hacer scroll) ── */}
          {soloLectura && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border border-border rounded-lg px-3 py-2 bg-muted/40">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className="inline-flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm ${PERIODO_ESTILO[n].chip}`} /> {PERIODO_ESTILO[n].nombre}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-200 border border-red-400" /> Sin clases</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-200 border border-indigo-400" /> Evento</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-fuchsia-300 border border-fuchsia-400" /> Festivo (automático)</span>
          </div>
          )}

          {/* ── Los 12 meses ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5" data-guia="configurar_institucion.cal_dia">
            {MESES.map((mes, m) => {
              const primerDow = (new Date(anoEscolar, m, 1).getDay() + 6) % 7; // L=0…D=6
              const totalDias = new Date(anoEscolar, m + 1, 0).getDate();
              return (
                <div key={mes}>
                  <p className="text-sm font-semibold text-center mb-1">{mes}</p>
                  <div className="grid grid-cols-7 text-center">
                    {DIAS_SEMANA.map((d, i) => <span key={i} className="text-[10px] text-muted-foreground pb-1">{d}</span>)}
                    {Array.from({ length: primerDow }).map((_, i) => <span key={`v${i}`} />)}
                    {Array.from({ length: totalDias }).map((_, i) => {
                      const f = iso(anoEscolar, m, i + 1);
                      const dow = (new Date(anoEscolar, m, i + 1).getDay() + 6) % 7;
                      const { cls, title } = claseDia(f, dow);
                      return (
                        <button key={f} type="button" title={title} draggable={false}
                          onMouseDown={(e) => { e.preventDefault(); bajarEnDia(f); }}
                          onMouseEnter={() => extenderA(f)}
                          className={`h-7 w-full text-[11px] rounded-sm flex items-center justify-center ${cls} ${f === hoyISO ? "font-bold underline" : ""}`}>
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Leyenda (abajo siempre) ── */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
            {[1, 2, 3, 4].map((n) => {
              const p = periodos.find((x) => x.periodo === n);
              return (
                <span key={n} className="inline-flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-sm ${PERIODO_ESTILO[n].chip}`} />
                  {PERIODO_ESTILO[n].nombre}{p ? `: ${fechaLinda(p.fecha_inicio)} — ${fechaLinda(p.fecha_fin)}` : " (sin configurar)"}
                </span>
              );
            })}
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-200 border border-red-400" /> Sin clases</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-200 border border-indigo-400" /> Evento</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-fuchsia-300 border border-fuchsia-400" /> Festivo (automático)</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Lista de días sin clases ── */}
      {dias.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Días sin clases configurados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border">
              {dias.map((d) => (
                <div key={d.id} className={`flex items-center justify-between px-4 py-2 ${d.fecha_fin < hoyISO ? "opacity-50" : ""}`}>
                  <div>
                    <p className="text-sm font-medium">
                      {d.fecha_inicio === d.fecha_fin ? fechaLinda(d.fecha_inicio) : `${fechaLinda(d.fecha_inicio)} — ${fechaLinda(d.fecha_fin)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{d.motivo || "Sin motivo"}</p>
                  </div>
                  {!soloLectura && (
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
      {eventos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos configurados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border">
              {eventos.map((ev) => (
                <div key={ev.id} className={`flex items-center justify-between px-4 py-2 ${ev.fecha_fin < hoyISO ? "opacity-50" : ""}`}>
                  <div>
                    <p className="text-sm font-medium">
                      {ev.fecha_inicio === ev.fecha_fin ? fechaLinda(ev.fecha_inicio) : `${fechaLinda(ev.fecha_inicio)} — ${fechaLinda(ev.fecha_fin)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{ev.nombre}</p>
                  </div>
                  {!soloLectura && (
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
            <p className="text-xs text-muted-foreground text-right">{eventoNombre.length}/889</p>
          </div>
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
            </DialogHeader>
            {detalle.eventos.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Eventos ese día</p>
                {listaEventosDia(detalle.fecha, detalle.eventos)}
              </div>
            )}
            {soloLectura || !editandoDetalle ? (
              <p className="text-sm text-foreground">{detalle.dia.motivo || <span className="text-muted-foreground">Sin motivo</span>}</p>
            ) : (
              <Textarea data-guia="configurar_institucion.cal_detalle_texto" value={motivoEdit} onChange={(e) => setMotivoEdit(e.target.value)} placeholder="Motivo: semana de receso, jornada pedagógica…" maxLength={80} rows={3} className="resize-none" />
            )}
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
            </DialogHeader>
            {soloLectura || !editandoDetalle ? (
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{detalle.evento.nombre}</p>
            ) : (<>
              <Textarea data-guia="configurar_institucion.cal_detalle_texto" value={eventoEdit} onChange={(e) => setEventoEdit(e.target.value)} placeholder="Nombre del evento" maxLength={889} rows={4} className="resize-none" />
              <p className="text-xs text-muted-foreground text-right">{eventoEdit.length}/889</p>
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
            </DialogHeader>
            {listaEventosDia(detalle.fecha, detalle.eventos)}
          </>)}
          {detalle?.tipo === "festivo" && (<>
            <DialogHeader>
              <DialogTitle>{detalle.nombre}</DialogTitle>
              <DialogDescription>{fechaLinda(detalle.fecha)}</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Festivo nacional de Colombia. Se aplica automáticamente en todos los colegios y no se puede editar.</p>
          </>)}
          {detalle?.tipo === "periodo" && (<>
            <DialogHeader>
              <DialogTitle>{PERIODO_ESTILO[detalle.periodo.periodo].nombre}</DialogTitle>
              <DialogDescription>
                Del {fechaLinda(detalle.periodo.fecha_inicio)} al {fechaLinda(detalle.periodo.fecha_fin)}
              </DialogDescription>
            </DialogHeader>
            {!soloLectura && (<>
            <p className="text-sm text-muted-foreground">Para cambiar sus fechas, elige la herramienta "{PERIODO_ESTILO[detalle.periodo.periodo].nombre}" y pinta el nuevo rango.</p>
            <DialogFooter>
              <Button variant="destructive" onClick={() => { const n = detalle.periodo.periodo; setDetalle(null); setConfirmPeriodo(n); }} disabled={guardando} className="gap-2">
                <Eraser className="w-4 h-4" /> Quitar periodo
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
            <DialogTitle>Quitar {confirmPeriodo != null ? PERIODO_ESTILO[confirmPeriodo].nombre : ""}</DialogTitle>
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
