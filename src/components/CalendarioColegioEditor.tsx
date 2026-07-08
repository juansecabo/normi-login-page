import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/apiClient";
import { CalendarDays, Eraser, Loader2, Trash2 } from "lucide-react";

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

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fechaLinda = (fISO: string) => {
  const [y, m, d] = fISO.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
};

type Herramienta = "p1" | "p2" | "p3" | "p4" | "sinclases" | "quitar";

const PERIODO_ESTILO: Record<number, { fondo: string; chip: string; nombre: string }> = {
  1: { fondo: "bg-emerald-200 hover:bg-emerald-300", chip: "bg-emerald-200 border-emerald-400", nombre: "Periodo 1" },
  2: { fondo: "bg-sky-200 hover:bg-sky-300", chip: "bg-sky-200 border-sky-400", nombre: "Periodo 2" },
  3: { fondo: "bg-amber-200 hover:bg-amber-300", chip: "bg-amber-200 border-amber-400", nombre: "Periodo 3" },
  4: { fondo: "bg-violet-200 hover:bg-violet-300", chip: "bg-violet-200 border-violet-400", nombre: "Periodo 4" },
};

interface Props { colegioId?: string }

const CalendarioColegioEditor = ({ colegioId }: Props) => {
  const { toast } = useToast();
  const qCid = colegioId ? `?colegio_id=${colegioId}` : "";
  const withCid = (body: Record<string, unknown>) => (colegioId ? { ...body, colegio_id: colegioId } : body);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [anoEscolar, setAnoEscolar] = useState<number>(new Date().getFullYear());
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [dias, setDias] = useState<DiaNoLectivo[]>([]);
  const [festivos, setFestivos] = useState<Set<string>>(new Set());

  const cargar = async () => {
    try {
      const r = await apiRequest<{ periodos: Periodo[]; dias: DiaNoLectivo[]; festivos: string[]; ano_escolar: number }>(`/api/institucion/calendario${qCid}`);
      setAnoEscolar(r.ano_escolar);
      setPeriodos((r.periodos || []).filter((p) => p.ano_escolar === r.ano_escolar));
      setDias(r.dias || []);
      setFestivos(new Set(r.festivos || []));
    } catch { /* la vista muestra vacío */ }
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [colegioId]);

  // ── Herramienta y selección por ARRASTRE: mousedown fija el inicio, se
  //    arrastra para extender y al soltar (mouseup global) se aplica el rango.
  //    Un solo clic (down+up en el mismo día) marca únicamente ese día. ──
  const [herramienta, setHerramienta] = useState<Herramienta>("p1");
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

  // ── Quitar (goma): confirmaciones ──
  const [confirmDia, setConfirmDia] = useState<DiaNoLectivo | null>(null);
  const [confirmPeriodo, setConfirmPeriodo] = useState<number | null>(null);
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

  const bajarEnDia = (f: string) => {
    if (guardando) return;
    if (herramienta === "quitar") {
      const dia = dias.find((d) => d.fecha_inicio <= f && f <= d.fecha_fin);
      if (dia) { setConfirmDia(dia); return; }
      const per = periodos.find((p) => p.fecha_inicio <= f && f <= p.fecha_fin);
      if (per) { setConfirmPeriodo(per.periodo); return; }
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
      } else if (herramienta.startsWith("p")) {
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
  const claseDia = (f: string, dow: number): { cls: string; title: string } => {
    const base = "cursor-pointer select-none";
    if (enSeleccion(f)) return { cls: `${base} ring-2 ring-primary bg-primary/20`, title: "" };
    const dia = dias.find((d) => d.fecha_inicio <= f && f <= d.fecha_fin);
    if (dia) return { cls: `${base} bg-red-200 hover:bg-red-300 text-red-900`, title: dia.motivo || "Día sin clases" };
    if (festivos.has(f)) return { cls: `${base} bg-stone-300 text-stone-600`, title: "Festivo (automático)" };
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
          <p className="text-sm text-muted-foreground">
            Elige una herramienta y <strong>haz clic</strong> en un día para marcarlo, o <strong>mantén presionado y arrastra</strong> para
            pintar un rango. Los fines de semana y festivos de Colombia ya se tienen en cuenta solos.
            Los avisos automáticos no se envían los días sin clases, y Normi responde con estas fechas.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Herramientas ── */}
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} onClick={() => { setHerramienta(`p${n}` as Herramienta); setArrastre2(null); }}
                className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer ${PERIODO_ESTILO[n].chip} ${herramienta === `p${n}` ? "ring-2 ring-primary font-semibold" : "opacity-80 hover:opacity-100"}`}>
                {PERIODO_ESTILO[n].nombre}
              </button>
            ))}
            <button onClick={() => { setHerramienta("sinclases"); setArrastre2(null); }}
              className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer bg-red-200 border-red-400 ${herramienta === "sinclases" ? "ring-2 ring-primary font-semibold" : "opacity-80 hover:opacity-100"}`}>
              Día sin clases
            </button>
            <button onClick={() => { setHerramienta("quitar"); setArrastre2(null); }}
              className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer bg-background inline-flex items-center gap-1 ${herramienta === "quitar" ? "ring-2 ring-primary font-semibold" : "opacity-80 hover:opacity-100"}`}>
              <Eraser className="w-3.5 h-3.5" /> Quitar
            </button>
            {guardando && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {herramienta === "quitar" && (
            <p className="text-sm text-muted-foreground">Haz clic sobre un periodo o un día sin clases para quitarlo.</p>
          )}

          {/* ── Los 12 meses ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
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

          {/* ── Leyenda ── */}
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
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-stone-300" /> Festivo (automático)</span>
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
                  <button onClick={() => setConfirmDia(d)} className="text-muted-foreground hover:text-destructive cursor-pointer" title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
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
            <Input value={motivoTexto} onChange={(e) => setMotivoTexto(e.target.value)} placeholder="Motivo: semana de receso, jornada pedagógica…" maxLength={80} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") crearDiaSinClases(); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMotivoDialog(null)} disabled={guardando}>Cancelar</Button>
            <Button onClick={crearDiaSinClases} disabled={guardando} className="gap-2">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Marcar sin clases
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
            <Button variant="destructive" onClick={eliminarDia} disabled={guardando} className="gap-2">
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
            <Button variant="destructive" onClick={quitarPeriodo} disabled={guardando} className="gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />} Quitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarioColegioEditor;
