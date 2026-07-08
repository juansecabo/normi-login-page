import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/apiClient";
import { CalendarDays, Check, Loader2, Plus, Trash2 } from "lucide-react";

/**
 * Ficha "Calendario" de Configurar Institución: periodos académicos del año y
 * días sin clases propios del colegio (semana de receso, jornadas pedagógicas…).
 * Normi usa estas fechas en su contexto (periodo actual, días sin clases) y los
 * avisos automáticos NO se envían en días marcados sin clases.
 */

interface Periodo { periodo: number; fecha_inicio: string; fecha_fin: string; ano_escolar?: number }
interface DiaNoLectivo { id: number; fecha_inicio: string; fecha_fin: string; motivo: string | null }

const fechaLinda = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
};

interface Props { colegioId?: string }

const CalendarioColegioEditor = ({ colegioId }: Props) => {
  const { toast } = useToast();
  const qCid = colegioId ? `?colegio_id=${colegioId}` : "";
  const withCid = (body: Record<string, unknown>) => (colegioId ? { ...body, colegio_id: colegioId } : body);

  const [cargando, setCargando] = useState(true);
  const [anoEscolar, setAnoEscolar] = useState<number>(new Date().getFullYear());
  const [periodos, setPeriodos] = useState<Record<number, { inicio: string; fin: string }>>({ 1: { inicio: "", fin: "" }, 2: { inicio: "", fin: "" }, 3: { inicio: "", fin: "" }, 4: { inicio: "", fin: "" } });
  const [dias, setDias] = useState<DiaNoLectivo[]>([]);
  const [festivos, setFestivos] = useState<string[]>([]);

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await apiRequest<{ periodos: Periodo[]; dias: DiaNoLectivo[]; festivos: string[]; ano_escolar: number }>(`/api/institucion/calendario${qCid}`);
      setAnoEscolar(r.ano_escolar);
      const base: Record<number, { inicio: string; fin: string }> = { 1: { inicio: "", fin: "" }, 2: { inicio: "", fin: "" }, 3: { inicio: "", fin: "" }, 4: { inicio: "", fin: "" } };
      for (const p of r.periodos || []) {
        if (p.ano_escolar === r.ano_escolar && p.periodo >= 1 && p.periodo <= 4) base[p.periodo] = { inicio: p.fecha_inicio, fin: p.fecha_fin };
      }
      setPeriodos(base);
      setDias(r.dias || []);
      setFestivos(r.festivos || []);
    } catch { /* la vista muestra vacío */ }
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [colegioId]);

  // ── Guardar periodos ──
  const [guardandoPer, setGuardandoPer] = useState(false);
  const guardarPeriodos = async () => {
    setGuardandoPer(true);
    try {
      await apiRequest("/api/institucion/calendario/periodos", {
        method: "PUT",
        body: JSON.stringify(withCid({
          ano_escolar: anoEscolar,
          periodos: [1, 2, 3, 4].map((n) => ({ periodo: n, fecha_inicio: periodos[n].inicio, fecha_fin: periodos[n].fin })),
        })),
      });
      await cargar();
    } catch (err: any) {
      toast({ title: "No se pudieron guardar los periodos", description: (err?.body as any)?.detail || err?.message, variant: "destructive" });
    } finally { setGuardandoPer(false); }
  };

  // ── Agregar / eliminar días sin clases ──
  const [nIni, setNIni] = useState("");
  const [nFin, setNFin] = useState("");
  const [nMotivo, setNMotivo] = useState("");
  const [agregando, setAgregando] = useState(false);
  const agregarDia = async () => {
    if (!nIni) { toast({ title: "Falta la fecha", description: "Elige al menos la fecha inicial.", variant: "destructive" }); return; }
    setAgregando(true);
    try {
      await apiRequest("/api/institucion/calendario/dias", {
        method: "POST",
        body: JSON.stringify(withCid({ fecha_inicio: nIni, fecha_fin: nFin || nIni, motivo: nMotivo.trim() })),
      });
      setNIni(""); setNFin(""); setNMotivo("");
      await cargar();
    } catch (err: any) {
      toast({ title: "No se pudo agregar", description: (err?.body as any)?.detail || err?.message, variant: "destructive" });
    } finally { setAgregando(false); }
  };

  const [confirmEliminar, setConfirmEliminar] = useState<DiaNoLectivo | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const eliminarDia = async () => {
    if (!confirmEliminar) return;
    setEliminando(true);
    try {
      await apiRequest(`/api/institucion/calendario/dias/${confirmEliminar.id}${qCid}`, { method: "DELETE" });
      setConfirmEliminar(null);
      await cargar();
    } catch (err: any) {
      toast({ title: "No se pudo eliminar", description: (err?.body as any)?.detail || err?.message, variant: "destructive" });
    } finally { setEliminando(false); }
  };

  if (cargando) return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const hoyISO = new Date().toISOString().slice(0, 10);
  const festivosProximos = festivos.filter((f) => f >= hoyISO).slice(0, 6);

  return (
    <div className="space-y-6">
      {/* ── Periodos académicos ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-primary" /> Periodos académicos {anoEscolar}</CardTitle>
          <p className="text-sm text-muted-foreground">Fechas de inicio y fin de cada periodo. Normi las usa para saber en qué periodo está el colegio y cuándo empieza el siguiente.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex flex-wrap items-end gap-3">
              <span className="w-24 text-sm font-medium pb-2">Periodo {n}</span>
              <div>
                <Label className="text-xs text-muted-foreground">Inicio</Label>
                <Input type="date" value={periodos[n].inicio} min={`${anoEscolar}-01-01`} max={`${anoEscolar}-12-31`} onChange={(e) => setPeriodos((p) => ({ ...p, [n]: { ...p[n], inicio: e.target.value } }))} className="w-44" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Fin</Label>
                <Input type="date" value={periodos[n].fin} min={periodos[n].inicio || `${anoEscolar}-01-01`} max={`${anoEscolar}-12-31`} onChange={(e) => setPeriodos((p) => ({ ...p, [n]: { ...p[n], fin: e.target.value } }))} className="w-44" />
              </div>
            </div>
          ))}
          <div className="pt-2">
            <Button onClick={guardarPeriodos} disabled={guardandoPer} className="gap-2">
              {guardandoPer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Guardar periodos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Días sin clases ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-primary" /> Días sin clases</CardTitle>
          <p className="text-sm text-muted-foreground">
            Semana de receso, jornadas pedagógicas, celebraciones internas… Los avisos automáticos NO se envían estos días y Normi sabrá que no hay clases.
            Los fines de semana y los festivos de Colombia ya se tienen en cuenta solos: no hace falta agregarlos.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={nIni} onChange={(e) => setNIni(e.target.value)} className="w-44" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Hasta (opcional)</Label>
              <Input type="date" value={nFin} min={nIni || undefined} onChange={(e) => setNFin(e.target.value)} className="w-44" />
            </div>
            <div className="flex-1 min-w-48">
              <Label className="text-xs text-muted-foreground">Motivo</Label>
              <Input value={nMotivo} onChange={(e) => setNMotivo(e.target.value)} placeholder="Semana de receso, jornada pedagógica…" maxLength={80} />
            </div>
            <Button onClick={agregarDia} disabled={agregando} className="gap-2">
              {agregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar
            </Button>
          </div>

          {dias.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4 text-center">No hay días sin clases configurados.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {dias.map((d) => (
                <div key={d.id} className={`flex items-center justify-between px-4 py-2 ${d.fecha_fin < hoyISO ? "opacity-50" : ""}`}>
                  <div>
                    <p className="text-sm font-medium">
                      {d.fecha_inicio === d.fecha_fin ? fechaLinda(d.fecha_inicio) : `${fechaLinda(d.fecha_inicio)} — ${fechaLinda(d.fecha_fin)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{d.motivo || "Sin motivo"}</p>
                  </div>
                  <button onClick={() => setConfirmEliminar(d)} className="text-muted-foreground hover:text-destructive cursor-pointer" title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {festivosProximos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Próximos festivos de Colombia (automáticos): {festivosProximos.map(fechaLinda).join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Confirmar eliminar */}
      <Dialog open={!!confirmEliminar} onOpenChange={(o) => { if (!o) setConfirmEliminar(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar día sin clases</DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              ¿Eliminar {confirmEliminar && (confirmEliminar.fecha_inicio === confirmEliminar.fecha_fin
                ? <strong>{fechaLinda(confirmEliminar.fecha_inicio)}</strong>
                : <strong>{fechaLinda(confirmEliminar.fecha_inicio)} — {fechaLinda(confirmEliminar.fecha_fin)}</strong>)}
              {confirmEliminar?.motivo ? ` (${confirmEliminar.motivo})` : ""}? Ese día volverá a contar como día de clases.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEliminar(null)} disabled={eliminando}>Cancelar</Button>
            <Button variant="destructive" onClick={eliminarDia} disabled={eliminando} className="gap-2">
              {eliminando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarioColegioEditor;
