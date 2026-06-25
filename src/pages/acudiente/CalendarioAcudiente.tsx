import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, X, Paperclip, Eye, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isPadreDeFamilia, AcudidoData } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { Calendar } from "@/components/ui/calendar";
import { es } from "date-fns/locale";
import { markLastSeen } from "@/utils/notificaciones";

interface ActividadCalendario {
  column_id: string;
  auto_id: number;
  Nombres: string;
  Apellidos: string;
  Asignatura: string;
  Descripción: string;
  fecha_de_presentacion: string;
  archivo_url: string | null;
}

interface ActividadConHijo extends ActividadCalendario {
  acudido: AcudidoData;
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

const CalendarioAcudiente = () => {
  const navigate = useNavigate();
  const [acudidos, setAcudidos] = useState<AcudidoData[]>([]);
  const [actividades, setActividades] = useState<ActividadConHijo[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesActual, setMesActual] = useState(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | undefined>(new Date());
  const [detalle, setDetalle] = useState<ActividadConHijo | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isPadreDeFamilia()) {
      navigate("/");
      return;
    }

    const acudidosData = session.acudidos || [];
    setAcudidos(acudidosData);

    const cargar = async () => {
      try {
        // Queries por acudido en paralelo — todas se piden al mismo tiempo.
        const resultados = await Promise.all(acudidosData.map(acudido =>
          supabase
            .from('Calendario Actividades')
            .select('*')
            .eq('Grado', acudido.grado)
            .eq('Salon', acudido.salon)
            .order('fecha_de_presentacion', { ascending: true })
            .then(res => ({ acudido, ...res }))
        ));

        const todasActividades: ActividadConHijo[] = [];
        for (const { acudido, data, error } of resultados) {
          if (!error && data) {
            // #25: solo las actividades para todo el salón o dirigidas a ESTE acudido.
            const mid = String(acudido.id);
            const propias = (data as any[]).filter((a) => {
              const e = a.estudiantes_ids as (number | string)[] | null;
              return !e || e.length === 0 || e.map(String).includes(mid);
            });
            propias.forEach((a: ActividadCalendario) => {
              todasActividades.push({ ...a, acudido });
            });
            const ids = propias.map((a: any) => Number(a.auto_id)).filter((id: number) => !isNaN(id) && id > 0);
            const maxId = ids.length > 0 ? Math.max(...ids) : 0;
            markLastSeen('actividades', acudido.id, maxId);
          }
        }

        setActividades(todasActividades);
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, [navigate]);

  // Mapear actividades por fecha
  const actividadesPorFecha: Record<string, ActividadConHijo[]> = {};
  actividades.forEach(a => {
    const fecha = parsearFecha(a.fecha_de_presentacion);
    if (fecha) {
      const key = fechaKey(fecha);
      if (!actividadesPorFecha[key]) actividadesPorFecha[key] = [];
      actividadesPorFecha[key].push(a);
    }
  });

  const diasConActividades = Object.keys(actividadesPorFecha).map(key => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  });

  // Actividades del día agrupadas por acudido
  const actividadesDelDia = diaSeleccionado
    ? actividadesPorFecha[fechaKey(diaSeleccionado)] || []
    : [];

  // Agrupar por acudido, manteniendo el orden de acudidos
  const actividadesPorAcudido: { acudido: AcudidoData; actividades: ActividadConHijo[] }[] = [];
  if (actividadesDelDia.length > 0) {
    for (const acudido of acudidos) {
      const delHijo = actividadesDelDia
        .filter(a => a.acudido.id === acudido.id)
        .sort((a, b) => a.Asignatura.localeCompare(b.Asignatura));
      if (delHijo.length > 0) {
        actividadesPorAcudido.push({ acudido, actividades: delHijo });
      }
    }
  }

  const totalActividades = actividadesDelDia.length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard-acudiente" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard-acudiente")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Actividades</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
            <ClipboardList className="h-5 w-5 text-primary" />
            Actividades Asignadas
          </h2>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              <div className="flex justify-center lg:sticky lg:top-4 shrink-0">
                <Calendar
                  mode="single"
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

              <div className="flex-1 min-w-0 lg:max-h-[500px] lg:overflow-y-auto">
                {diaSeleccionado && actividadesPorAcudido.length > 0 ? (
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
                      {totalActividades} actividad{totalActividades > 1 ? 'es' : ''}
                    </p>

                    <div className="space-y-6">
                      {actividadesPorAcudido.map(({ acudido, actividades: acts }) => (
                        <div key={acudido.id}>
                          <h4 className="text-lg font-bold text-primary mb-2">
                            Actividades de {acudido.nombre} {acudido.apellidos}
                            <span className="text-muted-foreground font-normal text-sm"> — {acudido.grado} {acudido.salon}</span>
                          </h4>
                          <div className="space-y-3">
                            {acts.map(actividad => (
                              <div
                                key={actividad.column_id}
                                onClick={() => setDetalle(actividad)}
                                className="border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
                              >
                                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full mb-2">
                                  {actividad.Asignatura}
                                </span>
                                <p className="text-foreground font-medium line-clamp-3">{actividad.Descripción}</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  Prof. {actividad.Nombres} {actividad.Apellidos}
                                </p>
                                {actividad.archivo_url && (
                                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Paperclip className="h-3 w-3 shrink-0" />
                                    <span>Archivo adjunto</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
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
                    <p>Selecciona un día para ver las actividades</p>
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

      <Dialog open={!!detalle} onOpenChange={(open) => !open && setDetalle(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle>Detalle de actividad</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm font-semibold text-primary">
                  {detalle.acudido.nombre} {detalle.acudido.apellidos} — {detalle.acudido.grado} {detalle.acudido.salon}
                </p>
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

export default CalendarioAcudiente;
