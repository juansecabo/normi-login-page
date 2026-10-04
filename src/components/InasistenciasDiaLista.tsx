import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Search, X, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { coincideBusqueda } from "@/utils/busqueda";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ReporteInasistenciaDia } from "@/pages/permisos/InasistenciaDiaRegistro";

/**
 * Inasistencias reportadas por coordinación o rectoría, agrupadas por estudiante con
 * cuántas lleva cada uno (Justificación por Inasistencia → Inasistencias reportadas,
 * igual que Faltas de uniforme). No van en el calendario: ese es solo de excusas.
 */
const fmtFecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

interface Props {
  /** Filtro extra del lado del cliente (p. ej. niveles del coordinador). */
  filtro?: (r: ReporteInasistenciaDia) => boolean;
  gradoRank?: (g: string) => number;
}

const InasistenciasDiaLista = ({ filtro, gradoRank }: Props) => {
  const [reportes, setReportes] = useState<ReporteInasistenciaDia[]>([]);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [eliminando, setEliminando] = useState<ReporteInasistenciaDia | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ reportes: ReporteInasistenciaDia[]; puede_gestionar: boolean }>("/api/asistencia/dia")
      .then((r) => { setReportes(r.reportes || []); setPuedeGestionar(!!r.puede_gestionar); })
      .catch((e: any) => setError(e?.body?.detail || e?.message || "No se pudieron cargar las inasistencias."))
      .finally(() => setCargando(false));
  }, []);

  const visibles = useMemo(() => reportes.filter((r) => !filtro || filtro(r)), [reportes, filtro]);
  const grados = useMemo(() => [...new Set(visibles.map((r) => r.estudiante_grado))]
    .sort((a, b) => (gradoRank ? gradoRank(a) - gradoRank(b) : 0) || a.localeCompare(b, "es")), [visibles, gradoRank]);
  const salones = useMemo(() => [...new Set(visibles.filter((r) => !filtroGrado || r.estudiante_grado === filtroGrado).map((r) => r.estudiante_salon))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [visibles, filtroGrado]);

  // Una tarjeta por estudiante, los que más inasistencias tienen primero.
  const porEstudiante = useMemo(() => {
    const m = new Map<number, ReporteInasistenciaDia[]>();
    for (const r of visibles) {
      if (filtroGrado && r.estudiante_grado !== filtroGrado) continue;
      if (filtroSalon && r.estudiante_salon !== filtroSalon) continue;
      if (!coincideBusqueda(busqueda, r.estudiante_nombre, r.estudiante_apellidos, String(r.estudiante_id))) continue;
      m.set(r.estudiante_id, [...(m.get(r.estudiante_id) || []), r]);
    }
    return [...m.values()].sort((a, b) => b.length - a.length
      || `${a[0].estudiante_apellidos} ${a[0].estudiante_nombre}`.localeCompare(`${b[0].estudiante_apellidos} ${b[0].estudiante_nombre}`, "es"));
  }, [visibles, filtroGrado, filtroSalon, busqueda]);

  const toggle = (id: number) => setAbiertos((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const eliminar = async () => {
    if (!eliminando) return;
    setBorrando(true);
    try {
      await apiRequest(`/api/asistencia/dia/${eliminando.id}`, { method: "DELETE" });
      setReportes((p) => p.filter((r) => r.id !== eliminando.id));
    } catch (err: any) {
      setErrorEliminar(`No se pudo eliminar: ${err?.body?.detail || err?.message || err}`);
    }
    setEliminando(null);
    setBorrando(false);
  };

  if (cargando) return <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  if (error) return <p className="text-center py-8 text-destructive">{error}</p>;

  return (
    <div className="space-y-4" data-guia="inasistencia_staff.lista_reportes">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o identificación…"
            className="w-full pl-9 pr-8 py-2 border border-input rounded-md text-sm bg-background" />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Borrar búsqueda"><X className="w-4 h-4" /></button>
          )}
        </div>
        <select value={filtroGrado} onChange={(e) => { setFiltroGrado(e.target.value); setFiltroSalon(""); }} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
          <option value="">Todos los grados</option>
          {grados.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filtroSalon} onChange={(e) => setFiltroSalon(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
          <option value="">Todos los salones</option>
          {salones.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {porEstudiante.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No hay inasistencias reportadas.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{porEstudiante.length} {porEstudiante.length === 1 ? "estudiante" : "estudiantes"} con inasistencias reportadas</p>
          {porEstudiante.map((lista) => {
            const e = lista[0];
            const abierto = abiertos.has(e.estudiante_id);
            return (
              <div key={e.estudiante_id} className="bg-primary/10 border border-primary/20 rounded-lg p-1.5">
                <div className="bg-card rounded-md overflow-hidden">
                  <button onClick={() => toggle(e.estudiante_id)} className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full mb-0.5">{e.estudiante_grado} {e.estudiante_salon}</span>
                      <p className="font-semibold text-foreground text-sm">{e.estudiante_apellidos} {e.estudiante_nombre}</p>
                      <p className="text-xs text-muted-foreground">Última: {fmtFecha(lista[0].fecha)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">{lista.length} {lista.length === 1 ? "inasistencia" : "inasistencias"}</span>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {abierto && (
                    <div className="border-t border-border divide-y divide-border">
                      {lista.map((r) => (
                        <div key={r.id} className="p-4 text-sm flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium text-foreground first-letter:uppercase">{fmtFecha(r.fecha)}</p>
                            <p className="text-xs text-muted-foreground">Reportada por {r.reportado_por_cargo} {r.reportado_por_nombre} · {new Date(r.created_at).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}</p>
                            {r.marcado_presente_en.length > 0 && (
                              <p className="text-xs text-amber-700">Marcado presente en: {r.marcado_presente_en.join(", ")}</p>
                            )}
                          </div>
                          {puedeGestionar && (
                            <button data-guia="inasistencia_staff.eliminar_dia" onClick={() => setEliminando(r)} title="Eliminar"
                              className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!eliminando} onOpenChange={(o) => !borrando && !o && setEliminando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la inasistencia?</AlertDialogTitle>
            <AlertDialogDescription>
              {eliminando && `${eliminando.estudiante_nombre} ${eliminando.estudiante_apellidos}`} ya no aparecerá ausente en las clases de ese día y se avisará a sus acudientes que la inasistencia fue anulada.
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

      <AlertDialog open={!!errorEliminar} onOpenChange={(o) => !o && setErrorEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No se pudo completar</AlertDialogTitle>
            <AlertDialogDescription>{errorEliminar}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogAction onClick={() => setErrorEliminar(null)}>Entendido</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InasistenciasDiaLista;
