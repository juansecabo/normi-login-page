import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getSession } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";
import { Search, Check, X, Clock, Send, Trash2, Loader2, RefreshCw, Calendar, ChevronDown, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import CalendarioFiltroDia, { keyDeDate } from "@/components/CalendarioFiltroDia";

/**
 * Portería → Llegada tarde. Dos pantallas:
 *  - Reportar (PorteriaLlegadaTarde): selecciona estudiantes y notifica a los
 *    acudientes por WhatsApp con la hora de entrada.
 *  - Registro (PorteriaRegistro): consulta el histórico por día o por estudiante
 *    (cuántas veces ha llegado tarde cada uno) y permite corregir un reporte.
 */

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo": 0, "Pre-Jardín": 1, "Prejardín": 1, "Jardín": 2, "Transición": 3,
  "Primero": 4, "Segundo": 5, "Tercero": 6, "Cuarto": 7, "Quinto": 8,
  "Sexto": 9, "Séptimo": 10, "Octavo": 11, "Noveno": 12, "Décimo": 13, "Undécimo": 14,
};
const ROLES_OK = ["Administrador", "Rector", "Coordinador(a)", "Portero"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "07:15" → "7:15 a. m." */
const horaBonita = (h24?: string | null): string => {
  if (!h24) return "";
  const [h, m] = h24.split(":").map(Number);
  if (Number.isNaN(h)) return h24;
  const ampm = h < 12 ? "a. m." : "p. m.";
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
};
/** "2026-07-30" → "30/07/2026" (sin líos de zona horaria). */
const fmtFecha = (ymd?: string | null): string => {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return d && m && y ? `${d}/${m}/${y}` : ymd;
};
interface Estudiante { id: number; nombres: string; apellidos: string; grado: string; salon: string; }
interface Registro {
  id: number; estudiante_id: string; estudiante_nombre: string | null; grado: string | null; salon: string | null;
  fecha: string | null; hora_entrada: string | null; reportado_por_nombre: string | null; acudientes_notificados: number;
}
interface ResumenItem {
  estudiante_id: string; estudiante_nombre: string | null; grado: string | null; salon: string | null;
  total: number; ultima_fecha: string | null;
}

// ════════════════════════ REPORTAR ════════════════════════
const PorteriaLlegadaTarde = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [seleccionados, setSeleccionados] = useState<Record<number, Estudiante>>({});
  const [enviando, setEnviando] = useState(false);

  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!session.id) { navigate("/"); return; }
    if (!ROLES_OK.includes(session.cargo || "")) { navigate("/dashboard"); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase.from("Estudiantes").select("id, grado, salon");
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const todos = sortByApellidosNombres(await enrichWithNombres((data || []) as any));
      setEstudiantes(todos.map((e: any) => ({
        id: Number(e.id), nombres: e.nombres, apellidos: e.apellidos, grado: e.grado, salon: e.salon,
      })));
      setLoading(false);
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gradosUnicos = useMemo(() => [...new Set(estudiantes.map(e => e.grado).filter(Boolean))]
    .sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99) || a.localeCompare(b, "es")), [estudiantes]);
  const salonesUnicos = useMemo(() => [...new Set(
    estudiantes.filter(e => !filtroGrado || e.grado === filtroGrado).map(e => e.salon).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [estudiantes, filtroGrado]);

  const estudiantesFiltrados = useMemo(() => {
    const tokens = norm(busqueda.trim()).split(/\s+/).filter(Boolean);
    return estudiantes.filter(e => {
      if (filtroGrado && e.grado !== filtroGrado) return false;
      if (filtroSalon && e.salon !== filtroSalon) return false;
      if (tokens.length) {
        const full = norm(`${e.nombres} ${e.apellidos}`);
        if (!tokens.every(t => full.includes(t))) return false;
      }
      return true;
    });
  }, [estudiantes, filtroGrado, filtroSalon, busqueda]);

  const seleccionadosArr = Object.values(seleccionados);
  const toggleSel = (e: Estudiante) => setSeleccionados(prev => {
    const next = { ...prev };
    if (next[e.id]) delete next[e.id]; else next[e.id] = e;
    return next;
  });
  const quitarSel = (id: number) => setSeleccionados(prev => { const n = { ...prev }; delete n[id]; return n; });

  const enviarReporte = async () => {
    const lista = seleccionadosArr;
    if (lista.length === 0) return;
    setEnviando(true);
    try {
      const r = await apiRequest<{ reportados: number; notificados: number; sin_acudiente: string[] }>(
        "/api/porteria/reportar-tarde",
        { method: "POST", body: JSON.stringify({ estudiante_ids: lista.map(e => e.id) }) },
      );
      const sin = r.sin_acudiente?.length ? ` Sin acudiente registrado: ${r.sin_acudiente.join(", ")}.` : "";
      toast({
        title: `Reporte enviado (${r.reportados} estudiante${r.reportados === 1 ? "" : "s"})`,
        description: `Se notificó a ${r.notificados} acudiente${r.notificados === 1 ? "" : "s"}.${sin}`,
        variant: "success" as any,
      });
      setSeleccionados({});
    } catch (e) {
      const detail = e instanceof ApiError ? ((e.body as any)?.detail || (e.body as any)?.error) : null;
      toast({ title: "No se pudo enviar el reporte", description: detail || "Intenta de nuevo.", variant: "destructive" });
    }
    setEnviando(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/porteria" />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <button onClick={() => navigate("/porteria")} className="text-primary hover:underline">Portería</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Reportar llegada tarde</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Clock className="w-6 h-6 text-orange-500" /> Reportar llegada tarde
            </h2>
            <button onClick={() => navigate("/porteria/registro")} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              <ClipboardList className="w-4 h-4" /> Ver registro
            </button>
          </div>
          <p className="text-sm text-muted-foreground -mt-2">
            Selecciona los estudiantes que llegaron tarde y envía el reporte. Se notificará por WhatsApp
            a sus acudientes con la <strong>hora de entrada</strong> (la de este momento).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar estudiante por nombre..."
                className="w-full pl-9 pr-9 py-2 border border-input rounded-md text-sm bg-background" />
              {busqueda && (
                <button type="button" onClick={() => setBusqueda("")} title="Limpiar"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <select value={filtroGrado} onChange={e => { setFiltroGrado(e.target.value); setFiltroSalon(""); }}
              className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
              <option value="">Todos los grados</option>
              {gradosUnicos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={filtroSalon} onChange={e => setFiltroSalon(e.target.value)}
              className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
              <option value="">Todos los salones</option>
              {salonesUnicos.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-2">
              {loading ? (
                <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
              ) : estudiantesFiltrados.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground">No hay estudiantes con esos filtros.</p>
              ) : (
                estudiantesFiltrados.map(e => {
                  const marcado = !!seleccionados[e.id];
                  return (
                    <label key={e.id} className={`w-full flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition-colors ${marcado ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${marcado ? "bg-primary border-primary" : "border-border"}`}>
                        {marcado && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                      </div>
                      <input type="checkbox" className="sr-only" checked={marcado} onChange={() => toggleSel(e)} />
                      <div>
                        <p className="font-semibold text-foreground text-sm">{e.apellidos} {e.nombres}</p>
                        <p className="text-xs text-muted-foreground">{e.grado} {e.salon}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <aside className="hidden lg:block lg:col-span-1">
              <div className="lg:sticky lg:top-4 border border-border rounded-lg p-3 bg-muted/10">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">Seleccionados ({seleccionadosArr.length})</p>
                  {seleccionadosArr.length > 0 && (
                    <button onClick={() => setSeleccionados({})} className="text-xs text-muted-foreground hover:text-destructive">Quitar todos</button>
                  )}
                </div>
                {seleccionadosArr.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Marca los estudiantes que llegaron tarde y aparecerán aquí.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
                    {seleccionadosArr.map(e => (
                      <div key={e.id} className="flex items-center justify-between gap-2 text-sm bg-background border border-border rounded-md px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{e.apellidos} {e.nombres}</p>
                          <p className="text-[11px] text-muted-foreground">{e.grado} {e.salon}</p>
                        </div>
                        <button onClick={() => quitarSel(e.id)} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <Button onClick={enviarReporte} disabled={seleccionadosArr.length === 0 || enviando} className="w-full mt-3 gap-2">
                  {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar reporte{seleccionadosArr.length > 0 ? ` (${seleccionadosArr.length})` : ""}
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {seleccionadosArr.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border p-3 shadow-lg flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{seleccionadosArr.length} seleccionado{seleccionadosArr.length === 1 ? "" : "s"}</span>
          <Button onClick={enviarReporte} disabled={enviando} className="gap-2">
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar reporte
          </Button>
        </div>
      )}
    </div>
  );
};

export default PorteriaLlegadaTarde;

// ════════════════════════ REGISTRO ════════════════════════
export const PorteriaRegistro = () => {
  const navigate = useNavigate();
  const session = getSession();

  const [sub, setSub] = useState<"dia" | "estudiante">("dia");
  const [eliminarReg, setEliminarReg] = useState<Registro | null>(null);
  const [eliminando, setEliminando] = useState(false);

  // Por día (calendario tipo Permisos y Excusas)
  const [dia, setDia] = useState<Date | undefined>(new Date());
  const [diasMarcados, setDiasMarcados] = useState<string[]>([]);
  const [regsDia, setRegsDia] = useState<Registro[]>([]);
  const [cargandoDia, setCargandoDia] = useState(true);

  // Por estudiante
  const [resumen, setResumen] = useState<ResumenItem[]>([]);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [regsEst, setRegsEst] = useState<Registro[]>([]);
  const [cargandoEst, setCargandoEst] = useState(false);

  useEffect(() => {
    if (!session.id) { navigate("/"); return; }
    if (!ROLES_OK.includes(session.cargo || "")) { navigate("/dashboard"); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarDia = async (d: Date | undefined) => {
    setCargandoDia(true);
    try {
      const url = d ? `/api/porteria/historial?fecha=${encodeURIComponent(keyDeDate(d))}` : "/api/porteria/historial";
      const r = await apiRequest<{ items: Registro[] }>(url);
      setRegsDia(r.items || []);
    } catch { setRegsDia([]); }
    setCargandoDia(false);
  };
  const cargarDias = async () => {
    try {
      const r = await apiRequest<{ dias: { fecha: string }[] }>("/api/porteria/dias");
      setDiasMarcados((r.dias || []).map(x => x.fecha));
    } catch { setDiasMarcados([]); }
  };
  const cargarResumen = async () => {
    setCargandoResumen(true);
    try {
      const r = await apiRequest<{ items: ResumenItem[] }>("/api/porteria/resumen");
      setResumen(r.items || []);
    } catch { setResumen([]); }
    setCargandoResumen(false);
  };
  const abrirEstudiante = async (estId: string) => {
    if (expandido === estId) { setExpandido(null); return; }
    setExpandido(estId);
    setCargandoEst(true);
    try {
      const r = await apiRequest<{ items: Registro[] }>(`/api/porteria/historial?estudiante_id=${encodeURIComponent(estId)}`);
      setRegsEst(r.items || []);
    } catch { setRegsEst([]); }
    setCargandoEst(false);
  };

  useEffect(() => { cargarDia(dia); /* eslint-disable-next-line */ }, [dia]);
  useEffect(() => { cargarDias(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (sub === "estudiante" && resumen.length === 0) cargarResumen(); /* eslint-disable-next-line */ }, [sub]);

  const confirmarEliminar = async () => {
    if (!eliminarReg) return;
    setEliminando(true);
    try {
      await apiRequest(`/api/porteria/historial/${eliminarReg.id}`, { method: "DELETE" });
      setEliminarReg(null);
      // Refresca lo que esté visible.
      await cargarDia(dia);
      await cargarDias();
      if (sub === "estudiante") {
        await cargarResumen();
        if (expandido) {
          const r = await apiRequest<{ items: Registro[] }>(`/api/porteria/historial?estudiante_id=${encodeURIComponent(expandido)}`);
          setRegsEst(r.items || []);
        }
      }
    } catch (e) {
      const detail = e instanceof ApiError ? ((e.body as any)?.detail || (e.body as any)?.error) : null;
      toast({ title: "No se pudo eliminar", description: detail || "Intenta de nuevo.", variant: "destructive" });
    }
    setEliminando(false);
  };

  const resumenFiltrado = useMemo(() => {
    const tokens = norm(buscar.trim()).split(/\s+/).filter(Boolean);
    if (!tokens.length) return resumen;
    return resumen.filter(r => {
      const full = norm(`${r.estudiante_nombre || ""} ${r.grado || ""} ${r.salon || ""}`);
      return tokens.every(t => full.includes(t));
    });
  }, [resumen, buscar]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/porteria" />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <button onClick={() => navigate("/porteria")} className="text-primary hover:underline">Portería</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Registro de llegada tarde</span>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setSub("dia")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${sub === "dia" ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted/50 border border-border"}`}>
            Por día
          </button>
          <button onClick={() => setSub("estudiante")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${sub === "estudiante" ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted/50 border border-border"}`}>
            Por estudiante
          </button>
        </div>

        {/* ── POR DÍA ── */}
        {sub === "dia" && (
          <div className="bg-card rounded-lg shadow-soft p-6">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-primary" />
              {dia ? `Llegadas tarde del ${fmtFecha(keyDeDate(dia))}` : "Todas las llegadas tarde"}
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
              <CalendarioFiltroDia diasMarcados={diasMarcados} dia={dia} onDia={setDia} />
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  {dia ? fmtFecha(keyDeDate(dia)) : "Histórico completo"} · {regsDia.length} reporte{regsDia.length === 1 ? "" : "s"}
                </p>
                {cargandoDia ? (
                  <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
                ) : regsDia.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">No hay reportes de llegada tarde en esta fecha.</p>
                ) : (
                  <div className="space-y-2">
                    {regsDia.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-3 border border-border rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{r.estudiante_nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.grado} {r.salon} · {horaBonita(r.hora_entrada)}
                            {!dia && r.fecha ? ` · ${fmtFecha(r.fecha)}` : ""}
                            {" · "}{r.acudientes_notificados} acudiente{r.acudientes_notificados === 1 ? "" : "s"} notificado{r.acudientes_notificados === 1 ? "" : "s"}
                          </p>
                        </div>
                        <button onClick={() => setEliminarReg(r)} className="text-muted-foreground hover:text-destructive shrink-0 p-1" title="Corregir / eliminar reporte">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── POR ESTUDIANTE ── */}
        {sub === "estudiante" && (
          <div className="bg-card rounded-lg shadow-soft p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" /> Cuántas veces ha llegado tarde cada estudiante
              </h3>
              <button onClick={cargarResumen} className="text-muted-foreground hover:text-primary p-1" title="Actualizar"><RefreshCw className="w-4 h-4" /></button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={buscar} onChange={e => setBuscar(e.target.value)}
                placeholder="Buscar estudiante..."
                className="w-full pl-9 pr-9 py-2 border border-input rounded-md text-sm bg-background" />
              {buscar && (
                <button type="button" onClick={() => setBuscar("")} title="Limpiar"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {cargandoResumen ? (
              <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
            ) : resumenFiltrado.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Aún no hay estudiantes con reportes de llegada tarde.</p>
            ) : (
              <div className="space-y-2">
                {resumenFiltrado.map(r => (
                  <div key={r.estudiante_id} className="border border-border rounded-lg">
                    <button onClick={() => abrirEstudiante(r.estudiante_id)} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30 transition-colors rounded-lg">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{r.estudiante_nombre}</p>
                        <p className="text-xs text-muted-foreground">{r.grado} {r.salon} · última: {fmtFecha(r.ultima_fecha)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-full bg-orange-100 text-orange-700 text-sm font-bold">{r.total}</span>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandido === r.estudiante_id ? "rotate-180" : ""}`} />
                      </div>
                    </button>
                    {expandido === r.estudiante_id && (
                      <div className="border-t border-border px-3 py-2 bg-muted/10">
                        {cargandoEst ? (
                          <div className="text-center py-3 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
                        ) : (
                          <ul className="space-y-1">
                            {regsEst.map(x => (
                              <li key={x.id} className="flex items-center justify-between gap-2 text-sm">
                                <span className="text-foreground">{fmtFecha(x.fecha)} · {horaBonita(x.hora_entrada)}</span>
                                <button onClick={() => setEliminarReg(x)} className="text-muted-foreground hover:text-destructive p-1" title="Corregir / eliminar">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <Dialog open={!!eliminarReg} onOpenChange={(o) => { if (!o) setEliminarReg(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Corregir reporte</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            Se eliminará el reporte de llegada tarde de <strong>{eliminarReg?.estudiante_nombre}</strong>
            {eliminarReg?.fecha ? ` (${fmtFecha(eliminarReg.fecha)})` : ""} del registro.
            <br /><br />
            Ten en cuenta que si el mensaje de WhatsApp al acudiente <strong>ya se envió, no se puede deshacer</strong>;
            esto solo corrige el registro.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEliminarReg(null)} disabled={eliminando}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarEliminar} disabled={eliminando} className="gap-2">
              {eliminando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Eliminar del registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ════════════════════════ HUB ════════════════════════
export const PorteriaHub = () => {
  const navigate = useNavigate();
  const session = getSession();
  useEffect(() => {
    if (!session.id) { navigate("/"); return; }
    if (!ROLES_OK.includes(session.cargo || "")) { navigate("/dashboard"); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Portería</span>
          </div>
        </div>
        <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button onClick={() => navigate("/porteria/llegada-tarde")}
            className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-orange-100 hover:bg-orange-200 transition-all duration-200 hover:shadow-md">
            <Clock className="w-14 h-14 text-orange-600" strokeWidth={1.5} />
            <span className="font-semibold text-foreground text-center">Reportar llegada tarde</span>
          </button>
          <button onClick={() => navigate("/porteria/registro")}
            className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-sky-100 hover:bg-sky-200 transition-all duration-200 hover:shadow-md">
            <ClipboardList className="w-14 h-14 text-sky-600" strokeWidth={1.5} />
            <span className="font-semibold text-foreground text-center">Registro de llegada tarde</span>
          </button>
        </div>
      </main>
    </div>
  );
};
