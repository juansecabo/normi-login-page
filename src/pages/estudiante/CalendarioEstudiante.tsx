import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

interface ActividadCalendario {
  column_id: string;
  auto_id: number;
  permite_entregas?: boolean;
  fecha_limite_entrega?: string | null;
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


/** "vence hoy 11:59 pm", "vence mañana", "venció el 26 de ago" — plazo legible. */
const textoPlazo = (iso: string | null | undefined): { texto: string; vencido: boolean } => {
  if (!iso) return { texto: "sin plazo", vencido: false };
  const lim = new Date(iso);
  const ahora = new Date();
  const vencido = ahora > lim;
  const bog = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleString("es-CO", { ...opts, timeZone: "America/Bogota" });
  const hoyK = bog(ahora, { year: "numeric", month: "2-digit", day: "2-digit" });
  const limK = bog(lim, { year: "numeric", month: "2-digit", day: "2-digit" });
  const manana = new Date(ahora.getTime() + 86400000);
  const mananaK = bog(manana, { year: "numeric", month: "2-digit", day: "2-digit" });
  const hora = bog(lim, { hour: "numeric", minute: "2-digit", hour12: true });
  if (vencido) return { texto: `venció el ${bog(lim, { day: "numeric", month: "short" })}`, vencido: true };
  if (limK === hoyK) return { texto: `vence hoy ${hora}`, vencido: false };
  if (limK === mananaK) return { texto: `vence mañana ${hora}`, vencido: false };
  return { texto: `vence el ${bog(lim, { day: "numeric", month: "short" })} ${hora}`, vencido: false };
};

const CalendarioEstudiante = () => {
  const navigate = useNavigate();
  const [actividades, setActividades] = useState<ActividadCalendario[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesActual, setMesActual] = useState(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | undefined>(new Date());
  const [marcas, setMarcas] = useState<Record<number, 'hecho' | 'estudiar'>>({});
  // Entregas de trabajos: mis entregas por actividad + modal de entrega.
  const [entregas, setEntregas] = useState<Record<number, EntregaMia>>({});
  const [entregando, setEntregando] = useState<ActividadCalendario | null>(null);
  // "Entrega virtual" es una página propia (?v=entregas) con breadcrumb.
  const [searchParams, setSearchParams] = useSearchParams();
  const vistaEntregas = searchParams.get("v") === "entregas";
  const [filtroEntAsig, setFiltroEntAsig] = useState("todas");

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
        }
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    cargar();

    // Cargar marcas desde Supabase
    const cargarMarcas = async () => {
      try {
        const { data } = await supabase
          .from('Actividades_Marcas')
          .select('actividad_id, marca')
          .eq('estudiante_id', session.id);
        if (data) {
          const m: Record<number, 'hecho' | 'estudiar'> = {};
          data.forEach((r: any) => { m[r.actividad_id] = r.marca; });
          setMarcas(m);
        }
      } catch {}
    };
    cargarMarcas();
  }, [navigate]);

  const toggleMarca = async (columnId: number, tipo: 'hecho' | 'estudiar') => {
    const session = getSession();
    const id = session.id!;
    const yaEsta = marcas[columnId] === tipo;

    // Actualizar UI inmediatamente
    setMarcas(prev => {
      const next = { ...prev };
      if (yaEsta) {
        delete next[columnId];
      } else {
        next[columnId] = tipo;
      }
      return next;
    });

    // Persistir en Supabase
    try {
      if (yaEsta) {
        await supabase
          .from('Actividades_Marcas')
          .delete()
          .eq('estudiante_id', id)
          .eq('actividad_id', columnId);
      } else {
        await supabase
          .from('Actividades_Marcas')
          .upsert(
            { estudiante_id: id, actividad_id: columnId, marca: tipo, updated_at: new Date().toISOString() },
            { onConflict: 'estudiante_id,actividad_id' }
          );
      }
    } catch {}
  };

  // Mapear actividades por fecha
  const actividadesPorFecha: Record<string, ActividadCalendario[]> = {};
  actividades.forEach(a => {
    const fecha = parsearFecha(a.fecha_de_presentacion);
    if (fecha) {
      const key = fechaKey(fecha);
      if (!actividadesPorFecha[key]) actividadesPorFecha[key] = [];
      actividadesPorFecha[key].push(a);
    }
  });

  // Fechas con actividades para marcar en el calendario
  const diasConActividades = Object.keys(actividadesPorFecha).map(key => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
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
          <BreadcrumbDeslizable clave={vistaEntregas ? "entregas" : "actividades"}>
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            {vistaEntregas ? (
              <>
                <button onClick={() => setSearchParams({})} className="text-primary hover:underline">Actividades</button>
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground font-medium">Entrega virtual</span>
              </>
            ) : (
              <span className="text-foreground font-medium">Actividades</span>
            )}
          </BreadcrumbDeslizable>
        </div>

        {(() => {
          // "Actividades con entrega virtual": botón que lleva a su página
          // (?v=entregas). Pendientes primero, luego entregadas, por plazo.
          const conEntrega = actividades
            .filter((a) => a.permite_entregas)
            .sort((x, y) => {
              const px = entregas[x.auto_id] ? 1 : 0;
              const py = entregas[y.auto_id] ? 1 : 0;
              if (px !== py) return px - py;
              return (x.fecha_limite_entrega || "9999").localeCompare(y.fecha_limite_entrega || "9999");
            });
          if (loading || conEntrega.length === 0) return null;
          const pendientes = conEntrega.filter((a) => !entregas[a.auto_id]).length;
          if (!vistaEntregas) {
            return (
              <button
                onClick={() => setSearchParams({ v: "entregas" })}
                data-guia="entrega.franja"
                className="w-full rounded-lg bg-primary/10 border-l-4 border-primary px-4 py-3 mb-6 flex items-center justify-between gap-3 hover:bg-primary/20 transition-colors text-left"
              >
                <p className="font-bold text-foreground">Actividades con entrega virtual</p>
                {pendientes > 0 && (
                  <span className="shrink-0 min-w-7 h-7 px-2 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                    {pendientes}
                  </span>
                )}
              </button>
            );
          }
          const opcAsig = [...new Set(conEntrega.map((a) => a.Asignatura).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
          const filtradas = filtroEntAsig === "todas" ? conEntrega : conEntrega.filter((a) => a.Asignatura === filtroEntAsig);
          return (
            <div className="bg-card rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-5">
                <Paperclip className="h-5 w-5 text-primary" />
                Actividades con entrega virtual
              </h2>
              <div className="mb-4 max-w-xs">
                <select
                  value={filtroEntAsig}
                  onChange={(e) => setFiltroEntAsig(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="todas">Asignaturas</option>
                  {opcAsig.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                {filtradas.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No hay actividades de esa asignatura.</p>
                )}
                {filtradas.map((a) => {
                  const entrega = entregas[a.auto_id];
                  const plazo = textoPlazo(a.fecha_limite_entrega);
                  return (
                    <div key={a.auto_id} className="flex items-center justify-between gap-3 flex-wrap border border-border rounded-lg p-3">
                      <div className="min-w-0">
                        <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">{a.Asignatura}</span>
                        <p className="text-sm text-foreground mt-1 line-clamp-1">{a.Descripción}</p>
                        <p className={`text-xs mt-0.5 font-medium ${!entrega && plazo.vencido ? "text-amber-700" : "text-muted-foreground"}`}>
                          {plazo.texto}{!entrega && plazo.vencido ? " — te queda una sola oportunidad" : ""}
                        </p>
                      </div>
                      {entrega ? (
                        <button
                          onClick={() => setEntregando(a)}
                          className={`shrink-0 px-4 py-2 text-sm font-semibold rounded-full transition-colors ${entrega.tarde ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"}`}
                        >
                          {entrega.tarde ? "✓ Entregado tarde" : "✓ Entregado"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setEntregando(a)}
                          className="shrink-0 px-4 py-2 text-sm font-semibold rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          Entregar trabajo
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* En la página "Entrega virtual" el calendario se oculta (sigue montado
            para conservar el día seleccionado al volver). */}
        <div className={vistaEntregas ? "hidden" : "bg-card rounded-lg shadow-soft p-6"}>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
            <ClipboardList className="h-5 w-5 text-primary" />
            Actividades Asignadas
          </h2>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              {/* Calendario */}
              <div data-guia="act.dia_calendario" className="flex justify-center lg:sticky lg:top-4 shrink-0">
                <Calendar
                  mode="single"
                  classNames={{ day_today: "bg-red-600 text-white hover:bg-red-600 hover:text-white focus:bg-red-600 focus:text-white aria-selected:bg-red-600 aria-selected:text-white" }}
                  selected={diaSeleccionado}
                  onSelect={setDiaSeleccionado}
                  month={mesActual}
                  onMonthChange={setMesActual}
                  locale={es}
                  modifiers={{ conActividad: diasConActividades }}
                  modifiersClassNames={{ conActividad: "bg-orange-400 text-white hover:bg-orange-500 !h-8 !w-8" }}
                  className="rounded-md border shadow-sm"
                />
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
                        const marca = marcas[actividad.column_id];
                        return (
                          <div
                            key={actividad.column_id}
                            data-guia="act.card_actividad"
                            onClick={() => setDetalle(actividad)}
                            className={`border rounded-lg p-4 transition-colors cursor-pointer hover:bg-muted/30 ${marca === 'hecho' ? 'border-green-300 bg-green-50/50' : marca === 'estudiar' ? 'border-yellow-300 bg-yellow-50/50' : 'border-border hover:border-primary/50'}`}
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
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleMarca(actividad.column_id, 'hecho'); }}
                                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${marca === 'hecho' ? 'bg-green-500 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                                >
                                  Hecho
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleMarca(actividad.column_id, 'estudiar'); }}
                                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${marca === 'estudiar' ? 'bg-yellow-500 text-white' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'}`}
                                >
                                  Estudiar
                                </button>
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
                  Profesor(a): <span className="text-foreground font-medium">{detalle.Nombres} {detalle.Apellidos}</span>
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
