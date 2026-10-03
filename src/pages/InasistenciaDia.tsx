import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2, UserX, ChevronDown, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import { apiRequest } from "@/lib/apiClient";
import { useNivelesCoordina } from "@/hooks/useNivelesCoordina";
import { useNivelDeGrado } from "@/utils/esquema";
import { useEstructuraOrden } from "@/utils/estructuraOrden";
import { ListaEstudiantes, type Estudiante } from "./permisos/RetiroRegistroInterno";

/**
 * Inasistencia del día (Juan 2026-10-03, por ahora solo la Normal): coordinación o
 * rectoría reportan que un estudiante no vino hoy. Al acudiente le llega un solo aviso;
 * en cada clase del día el estudiante aparece Ausente "por coordinación/rectoría" y el
 * profesor lo puede cambiar. Aquí mismo se elimina el reporte.
 */
export const ROLES_INASISTENCIA_DIA = ["Rector", "Coordinador(a)"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type Reporte = {
  id: number; estudiante_id: number; estudiante_nombre: string; estudiante_apellidos: string;
  estudiante_grado: string; estudiante_salon: string; reportado_por_nombre: string; reportado_por_cargo: string;
  marcado_presente_en: string[];
};

const InasistenciaDia = () => {
  const navigate = useNavigate();
  const session = getSession();
  const { nivelesCoordina, cargadoNiveles } = useNivelesCoordina();
  const { nivelDe, ready: nivelesListos } = useNivelDeGrado();
  const { gradoRank } = useEstructuraOrden();

  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [seleccionados, setSeleccionados] = useState<Record<number, Estudiante>>({});
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [cargandoReportes, setCargandoReportes] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [eliminando, setEliminando] = useState<Reporte | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargarReportes = async () => {
    try {
      const r = await apiRequest<{ reportes: Reporte[] }>("/api/asistencia/dia");
      setReportes(r.reportes);
    } catch { /* la lista queda vacía; el reporte sigue funcionando */ }
    setCargandoReportes(false);
  };

  useEffect(() => {
    if (!session.id) { navigate("/"); return; }
    if (!ROLES_INASISTENCIA_DIA.includes(session.cargo || "")) { navigate("/asistencia"); return; }
    cargarReportes();
    (async () => {
      try {
        const { data, error } = await supabase.from("Estudiantes").select("id, grado, salon").fetchAll();
        if (error) throw error;
        const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
        const todos = sortByApellidosNombres(await enrichWithNombres((data || []) as any));
        setEstudiantes(todos.map((e: any) => ({ id: Number(e.id), nombres: e.nombres, apellidos: e.apellidos, grado: e.grado, salon: String(e.salon ?? "") })));
      } catch (err: any) {
        setResultado({ ok: false, texto: `No se pudo cargar la lista de estudiantes: ${err?.message || err}. Recarga la página.` });
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coordinador(a): solo los estudiantes de sus niveles. Los ya reportados hoy no salen.
  const yaReportados = useMemo(() => new Set(reportes.map((r) => r.estudiante_id)), [reportes]);
  const permitidos = useMemo(() => estudiantes.filter((e) => !yaReportados.has(e.id) && (!nivelesCoordina || nivelesCoordina.includes(nivelDe(e.grado)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [estudiantes, nivelesCoordina, nivelesListos, yaReportados]);
  const gradosUnicos = useMemo(() => [...new Set(permitidos.map((e) => e.grado).filter(Boolean))]
    .sort((a, b) => gradoRank(a) - gradoRank(b) || a.localeCompare(b, "es")), [permitidos, gradoRank]);
  const salonesUnicos = useMemo(() => [...new Set(permitidos.filter((e) => !filtroGrado || e.grado === filtroGrado).map((e) => e.salon).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [permitidos, filtroGrado]);
  const filtrados = useMemo(() => {
    const tokens = norm(busqueda.trim()).split(/\s+/).filter(Boolean);
    return permitidos.filter((e) => {
      if (filtroGrado && e.grado !== filtroGrado) return false;
      if (filtroSalon && e.salon !== filtroSalon) return false;
      if (tokens.length && !tokens.every((t) => norm(`${e.nombres} ${e.apellidos}`).includes(t))) return false;
      return true;
    });
  }, [permitidos, filtroGrado, filtroSalon, busqueda]);

  const selArr = Object.values(seleccionados);
  const toggleSel = (e: Estudiante) => setSeleccionados((p) => { const n = { ...p }; if (n[e.id]) delete n[e.id]; else n[e.id] = e; return n; });
  const quitarSel = (id: number) => setSeleccionados((p) => { const n = { ...p }; delete n[id]; return n; });

  const reportar = async () => {
    if (!selArr.length) return;
    setSaving(true);
    try {
      await apiRequest("/api/asistencia/dia", { method: "POST", body: JSON.stringify({ estudiantes: selArr.map((e) => String(e.id)) }) });
      setResultado({ ok: true, texto: `Quedó reportada la inasistencia de hoy de ${selArr.length} estudiante${selArr.length === 1 ? "" : "s"} y se avisó a sus acudientes.` });
      setSeleccionados({});
      await cargarReportes();
    } catch (err: any) {
      setResultado({ ok: false, texto: `No se pudo reportar: ${err?.body?.detail || err?.message || err}` });
    }
    setSaving(false);
    setShowConfirm(false);
  };

  const eliminar = async () => {
    if (!eliminando) return;
    setBorrando(true);
    try {
      await apiRequest(`/api/asistencia/dia/${eliminando.id}`, { method: "DELETE" });
      setReportes((p) => p.filter((r) => r.id !== eliminando.id));
      setEliminando(null);
    } catch (err: any) {
      setEliminando(null);
      setResultado({ ok: false, texto: `No se pudo eliminar: ${err?.body?.detail || err?.message || err}` });
    }
    setBorrando(false);
  };

  const selectorCls = "w-full min-w-0 pl-2 pr-1 sm:px-3 py-2 border border-input rounded-md text-[13px] sm:text-sm bg-card cursor-pointer";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8 pb-24 lg:pb-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/asistencia")} className="text-primary hover:underline">Asistencia</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Inasistencia del día</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 space-y-5 max-w-3xl mx-auto" data-guia="inasistencia_dia.formulario">
          <h2 className="text-xl font-bold text-foreground flex items-center justify-center gap-2"><UserX className="w-6 h-6 text-primary" /> Inasistencia del día</h2>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{selArr.length > 1 ? "Estudiantes que no vinieron hoy" : "Estudiante que no vino hoy"}</label>
            <button type="button" data-guia="inasistencia_dia.seleccionar" onClick={() => setSelectorAbierto(true)}
              className="w-full flex items-center justify-between px-3 py-2 border border-input rounded-md text-sm bg-background hover:bg-accent cursor-pointer">
              <span className={selArr.length ? "text-foreground" : "text-muted-foreground"}>
                {selArr.length === 0 ? "Seleccionar estudiantes" : selArr.length === 1 ? `${selArr[0].apellidos} ${selArr[0].nombres} (${selArr[0].grado} ${selArr[0].salon})` : `${selArr.length} estudiantes`}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
            {selArr.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selArr.map((e) => (
                  <span key={e.id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full pl-2.5 pr-1 py-1">
                    {e.apellidos} {e.nombres} · {e.grado} {e.salon}
                    <button type="button" onClick={() => quitarSel(e.id)} className="hover:text-destructive" title="Quitar"><X className="w-3.5 h-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <Button data-guia="inasistencia_dia.reportar" onClick={() => setShowConfirm(true)} disabled={!selArr.length || saving} className="w-full py-3 text-base font-bold">
            Reportar inasistencia{selArr.length > 1 ? ` (${selArr.length} estudiantes)` : ""}
          </Button>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 mt-6 max-w-3xl mx-auto" data-guia="inasistencia_dia.lista">
          <h3 className="text-lg font-bold text-foreground mb-3">Reportados hoy{reportes.length ? ` (${reportes.length})` : ""}</h3>
          {cargandoReportes ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : reportes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hoy no se ha reportado ninguna inasistencia.</p>
          ) : (
            <div className="space-y-2">
              {reportes.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{r.estudiante_apellidos} {r.estudiante_nombre} <span className="text-muted-foreground font-normal">· {r.estudiante_grado} {r.estudiante_salon}</span></div>
                    <div className="text-xs text-muted-foreground">Reportado por {r.reportado_por_cargo} {r.reportado_por_nombre}</div>
                    {r.marcado_presente_en.length > 0 && (
                      <div className="text-xs text-amber-700 mt-0.5">Marcado presente en: {r.marcado_presente_en.join(", ")}</div>
                    )}
                  </div>
                  <button onClick={() => setEliminando(r)} data-guia="inasistencia_dia.eliminar" title="Eliminar"
                    className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={selectorAbierto} onOpenChange={setSelectorAbierto}>
        <DialogContent className="max-w-2xl rounded-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Seleccionar estudiantes</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select value={filtroGrado} onChange={(e) => { setFiltroGrado(e.target.value); setFiltroSalon(""); }} className={selectorCls}>
                <option value="">Todos los grados</option>
                {gradosUnicos.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={filtroSalon} onChange={(e) => setFiltroSalon(e.target.value)} className={selectorCls}>
                <option value="">Todos los salones</option>
                {salonesUnicos.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar estudiante por nombre..."
                className="w-full pl-9 pr-9 py-2 border border-input rounded-md text-sm bg-card" />
              {busqueda && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBusqueda("")} title="Limpiar" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <ListaEstudiantes cargando={loading || !cargadoNiveles} filtrados={filtrados} seleccionados={seleccionados} onToggle={toggleSel} />
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-2">
            <span className="text-sm text-muted-foreground">{selArr.length} seleccionado{selArr.length === 1 ? "" : "s"}{selArr.length > 0 && <> · <button type="button" onClick={() => setSeleccionados({})} className="underline hover:text-destructive">Quitar todos</button></>}</span>
            <Button onClick={() => setSelectorAbierto(false)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={(o) => !saving && setShowConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reportar la inasistencia de hoy?</AlertDialogTitle>
            <AlertDialogDescription>
              {selArr.length === 1 ? `Para ${selArr[0].nombres} ${selArr[0].apellidos}.` : `Para ${selArr.length} estudiantes.`} Se avisará a sus acudientes por WhatsApp y los profesores los verán como ausentes en sus clases de hoy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); reportar(); }} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reportar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!eliminando} onOpenChange={(o) => !borrando && !o && setEliminando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la inasistencia?</AlertDialogTitle>
            <AlertDialogDescription>
              {eliminando && `${eliminando.estudiante_nombre} ${eliminando.estudiante_apellidos}`} ya no aparecerá ausente en las clases de hoy y se avisará a sus acudientes que la inasistencia fue anulada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); eliminar(); }} disabled={borrando}>
              {borrando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!resultado} onOpenChange={(o) => !o && setResultado(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{resultado?.ok ? "Inasistencia reportada" : "No se pudo completar"}</AlertDialogTitle>
            <AlertDialogDescription>{resultado?.texto}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setResultado(null)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InasistenciaDia;
