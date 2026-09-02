import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, X, Paperclip, Eye, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isEstudiante } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { Calendar } from "@/components/ui/calendar";
import { es } from "date-fns/locale";
import { markLastSeen } from "@/utils/notificaciones";
import { apiRequest } from "@/lib/apiClient";
import { EntregarTrabajoModal, type EntregaMia } from "@/components/EntregarTrabajoModal";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import ResponsiveSelect from "@/components/ResponsiveSelect";
import { fetchNombresPorIds } from "@/lib/nombresUsuarios";
import { cargoSegunGenero } from "@/lib/entrevistadores";

interface ActividadCalendario {
  column_id: string;
  auto_id: number;
  permite_entregas?: boolean;
  fecha_limite_entrega?: string | null;
  id_profesor?: string | null;
  Nombres: string;
  Apellidos: string;
  Asignatura: string;
  Descripción: string;
  fecha_de_presentacion: string;
  archivo_url: string | null;
}

const parsearFecha = (fechaStr: string): Date | null => {
  // ISO format: YYYY-MM-DD
  const matchISO = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchISO) {
    const [, year, month, day] = matchISO;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  // DD/MM/YYYY format (legacy)
  const match = fechaStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  return null;
};

const fechaKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const getCleanFilename = (url: string) =>
  decodeURIComponent((url.split('/').pop() || '').replace(/^\d+-[a-z0-9]+-/, ''));

const getFileExt = (url: string) =>
  (url.split('.').pop() || '').toLowerCase().split('?')[0];

const handleVerArchivo = (url: string) => {
  const ext = getFileExt(url);
  const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
  if (officeExts.includes(ext)) {
    window.open(`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`, '_blank');
  } else {
    window.open(url, '_blank');
  }
};

const handleDescargarArchivo = async (url: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = getCleanFilename(url);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, '_blank');
  }
};



const CalendarioEstudiante = () => {
  const navigate = useNavigate();
  const [actividades, setActividades] = useState<ActividadCalendario[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesActual, setMesActual] = useState(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | undefined>(new Date());
  // Entregas de trabajos: mis entregas por actividad + modal de entrega.
  const [entregas, setEntregas] = useState<Record<number, EntregaMia>>({});
  const [entregando, setEntregando] = useState<ActividadCalendario | null>(null);
  // Filtros del calendario de actividades.
  const [filtroAsig, setFiltroAsig] = useState("todas");
  const [soloConEntrega, setSoloConEntrega] = useState(false);

  const cargarEntregas = async () => {
    try {
      const r = await apiRequest('/api/entregas/mias') as { entregas: EntregaMia[] };
      const map: Record<number, EntregaMia> = {};
      for (const e of r.entregas || []) map[e.actividad_id] = e;
      setEntregas(map);
    } catch { /* sin entregas no bloquea la pagina */ }
  };
  useEffect(() => { cargarEntregas(); }, []);
  const [detalle, setDetalle] = useState<ActividadCalendario | null>(null);
  // Género del profesor por cédula (Usuarios.genero) para "Profesor:"/"Profesora:".
  const [generoProfes, setGeneroProfes] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isEstudiante()) {
      navigate("/");
      return;
    }

    const cargar = async () => {
      try {
        const { data, error } = await supabase
          .from('Calendario Actividades')
          .select('*')
          .eq('Grado', session.grado)
          .eq('Salon', session.salon)
          .order('fecha_de_presentacion', { ascending: true });

        if (!error && data) {
          // #25: ocultar actividades dirigidas a otros estudiantes del salón.
          const mid = String(session.id);
          const propias = (data as any[]).filter((a) => {
            const e = a.estudiantes_ids as (number | string)[] | null;
            return !e || e.length === 0 || e.map(String).includes(mid);
          });
          setActividades(propias);
          const ids = propias.map((a: any) => Number(a.auto_id)).filter((id: number) => !isNaN(id) && id > 0);
          const maxId = ids.length > 0 ? Math.max(...ids) : 0;
          markLastSeen('actividades', session.id!, maxId);
          const mapG = await fetchNombresPorIds(propias.map((a: any) => a.id_profesor || "").filter(Boolean));
          const g: Record<string, string | null> = {};
          mapG.forEach((u, id) => { g[id] = u.genero; });
          setGeneroProfes(g);
        }
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, [navigate]);

  // Opciones del filtro por asignatura (todas las asignaturas con actividades).
  const opcionesAsignaturas = [...new Set(actividades.map((a) => a.Asignatura).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));

  // Mapear actividades por fecha (respetando los filtros)
  const actividadesPorFecha: Record<string, ActividadCalendario[]> = {};
  actividades.forEach(a => {
    if (filtroAsig !== "todas" && a.Asignatura !== filtroAsig) return;
    if (soloConEntrega && !a.permite_entregas) return;
    const fecha = parsearFecha(a.fecha_de_presentacion);
    if (fecha) {
      const key = fechaKey(fecha);
      if (!actividadesPorFecha[key]) actividadesPorFecha[key] = [];
      actividadesPorFecha[key].push(a);
    }
  });

  // Fechas con actividades: pasadas (gris) y próximas (verde), como el
  // calendario del profesor.
  const hoyKey = fechaKey(new Date());
  const diasPasados: Date[] = [];
  const diasProximos: Date[] = [];
  Object.keys(actividadesPorFecha).forEach(key => {
    const [y, m, d] = key.split('-').map(Number);
    (key < hoyKey ? diasPasados : diasProximos).push(new Date(y, m - 1, d));
  });

  // Actividades del día seleccionado (ordenadas por asignatura)
  const actividadesDelDia = diaSeleccionado
    ? (actividadesPorFecha[fechaKey(diaSeleccionado)] || []).slice().sort((a, b) => a.Asignatura.localeCompare(b.Asignatura))
    : [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable clave="actividades">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Actividades</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-4">
            <ClipboardList className="h-5 w-5 text-primary" />
            Actividades Asignadas
          </h2>

          {/* Filtros: afectan los días marcados y la lista del día. */}
          {!loading && opcionesAsignaturas.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3" data-guia="entrega.franja">
              <div className="w-full max-w-[180px]">
                <ResponsiveSelect
                  sinOpcionPlaceholder
                  value={filtroAsig}
                  onValueChange={setFiltroAsig}
                  placeholder="Asignaturas"
                  options={[{ value: "todas", label: "Asignaturas" }, ...opcionesAsignaturas.map((a) => ({ value: a, label: a }))]}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary shrink-0"
                  checked={soloConEntrega}
                  onChange={(e) => setSoloConEntrega(e.target.checked)}
                />
                <span className="text-sm text-foreground">Con entrega en plataforma</span>
              </label>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              {/* Calendario */}
              <div data-guia="act.dia_calendario" className="flex flex-col items-center lg:sticky lg:top-4 shrink-0">
                <Calendar
                  mode="single"
                  classNames={{ day_selected: "!bg-red-600 !text-white hover:!bg-red-600 focus:!bg-red-600" }}
                  selected={diaSeleccionado}
                  onSelect={setDiaSeleccionado}
                  month={mesActual}
                  onMonthChange={setMesActual}
                  locale={es}
                  modifiers={{ pasada: diasPasados, proxima: diasProximos }}
                  modifiersClassNames={{
                    pasada: "bg-slate-300 text-slate-700 hover:bg-slate-400 !h-8 !w-8",
                    proxima: "bg-emerald-500 text-white hover:bg-emerald-600 !h-8 !w-8",
                  }}
                  className="rounded-md border shadow-sm"
                />
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Próximas</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-300 inline-block" /> Ya pasaron</span>
                </div>
              </div>

              {/* Detalle del día seleccionado */}
              <div className="flex-1 min-w-0 lg:max-h-[420px] lg:overflow-y-auto">
                {diaSeleccionado && actividadesDelDia.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-foreground">
                        {diaSeleccionado.toLocaleDateString("es-CO", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </h3>
                      <button
                        onClick={() => setDiaSeleccionado(undefined)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      {actividadesDelDia.length} actividad{actividadesDelDia.length > 1 ? 'es' : ''}
                    </p>
                    <div className="space-y-3">
                      {actividadesDelDia.map(actividad => {
                        return (
                          <div
                            key={actividad.column_id}
                            data-guia="act.card_actividad"
                            onClick={() => setDetalle(actividad)}
                            className="border rounded-lg p-4 transition-colors cursor-pointer hover:bg-muted/30 border-border hover:border-primary/50"
                          >
                            <div>
                              <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full mb-2">
                                {actividad.Asignatura}
                              </span>
                              <p className="font-medium text-foreground">{actividad.Descripción}</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                Prof. {actividad.Nombres} {actividad.Apellidos}
                              </p>
                              {actividad.archivo_url && actividad.archivo_url.split('\n').filter(Boolean).map((url, i) => (
                                <div key={i} className="mt-2 space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm text-foreground truncate">{getCleanFilename(url)}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => handleVerArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5">
                                      <Eye className="h-4 w-4" /> Ver
                                    </button>
                                    <button onClick={() => handleDescargarArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1.5">
                                      <Download className="h-4 w-4" /> Descargar
                                    </button>
                                  </div>
                                </div>
                              ))}
                              <div className="flex gap-2 mt-3">
                                {actividad.permite_entregas && (() => {
                                  const ent = entregas[actividad.auto_id];
                                  return (
                                    <button
                                      data-guia="entrega.abrir"
                                      onClick={(e) => { e.stopPropagation(); setEntregando(actividad); }}
                                      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${ent ? (ent.tarde ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white') : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                    >
                                      {ent ? (ent.tarde ? '✓ Entregado tarde' : '✓ Entregado') : 'Entregar trabajo'}
                                    </button>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : diaSeleccionado ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                    <ClipboardList className="h-10 w-10 mb-2 opacity-50" />
                    <p>No hay actividades para este día</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                    <ClipboardList className="h-10 w-10 mb-2 opacity-50" />
                    <p>Selecciona un día para ver sus actividades</p>
                    {actividades.length === 0 && (
                      <p className="text-sm mt-1">No hay actividades asignadas aún</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <EntregarTrabajoModal
        actividad={entregando ? { auto_id: entregando.auto_id, Asignatura: entregando.Asignatura, fecha_limite_entrega: entregando.fecha_limite_entrega } : null}
        entrega={entregando ? (entregas[entregando.auto_id] || null) : null}
        open={!!entregando}
        onOpenChange={(v) => { if (!v) setEntregando(null); }}
        onEntregada={cargarEntregas}
      />

      <Dialog open={!!detalle} onOpenChange={(open) => !open && setDetalle(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle>Detalle de actividad</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                  {detalle.Asignatura}
                </span>
                <p className="text-sm text-muted-foreground">
                  📅 {detalle.fecha_de_presentacion && parsearFecha(detalle.fecha_de_presentacion)?.toLocaleDateString("es-CO", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {cargoSegunGenero("Profesor(a)", generoProfes[String(detalle.id_profesor || "")])}: <span className="text-foreground font-medium">{detalle.Nombres} {detalle.Apellidos}</span>
                </p>
                <div className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                  {detalle.Descripción}
                </div>
                {detalle.archivo_url && detalle.archivo_url.split('\n').filter(Boolean).map((url, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground truncate">{getCleanFilename(url)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleVerArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5">
                        <Eye className="h-4 w-4" /> Ver
                      </button>
                      <button onClick={() => handleDescargarArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1.5">
                        <Download className="h-4 w-4" /> Descargar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarioEstudiante;
