import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, ArrowLeft, Calendar, Paperclip, FileText, X, Eye, Download } from "lucide-react";
import { subirArchivo } from "@/lib/storage";
import { apiRequest } from "@/lib/apiClient";
import { getSession } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ActividadCalendario {
  column_id: number;
  id_profesor: string;
  Nombres: string;
  Apellidos: string;
  Asignatura: string;
  Grado: string;
  Salon: string;
  Descripción: string;
  fecha_de_presentacion: string;
  archivo_url: string | null;
}

const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// For DB storage — YYYY-MM-DD (ISO format, enables correct Supabase .gte/.lte queries)
const formatearFecha = (date: Date): string => {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// For UI display — "DD/MM/YYYY (día)"
const mostrarFecha = (fechaStr: string): string => {
  const date = parsearFecha(fechaStr);
  if (!date) return fechaStr;
  const dia = diasSemana[date.getDay()];
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} (${dia})`;
};

// Parses both YYYY-MM-DD and DD/MM/YYYY (día) formats
const parsearFecha = (fechaStr: string): Date | null => {
  const matchISO = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchISO) {
    const [, year, month, day] = matchISO;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  const match = fechaStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  return null;
};

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

const ActividadesCalendario = () => {
  const navigate = useNavigate();
  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState(() => localStorage.getItem("asignaturaSeleccionada") || "");
  const [gradoSeleccionado, setGradoSeleccionado] = useState(() => localStorage.getItem("gradoSeleccionado") || "");
  const [salonSeleccionado, setSalonSeleccionado] = useState(() => localStorage.getItem("salonSeleccionado") || "");
  const [profesorCodigo, setProfesorCodigo] = useState("");
  const [profesorIdReal, setProfesorIdReal] = useState(""); // numero_de_telefono del profesor
  const [profesorNombres, setProfesorNombres] = useState("");
  const [profesorApellidos, setProfesorApellidos] = useState("");
  const [actividades, setActividades] = useState<ActividadCalendario[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [fechaSeleccionada, setFechaSeleccionada] = useState<Date | undefined>(undefined);
  const [actividadEditando, setActividadEditando] = useState<ActividadCalendario | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // File attachment state (multiple files)
  const [archivosSeleccionados, setArchivosSeleccionados] = useState<File[]>([]);
  const [urlsExistentes, setUrlsExistentes] = useState<string[]>([]);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actividadAEliminar, setActividadAEliminar] = useState<ActividadCalendario | null>(null);

  useEffect(() => {
    const inicializar = async () => {
      const session = getSession();
      
      if (!session.id) {
        navigate('/');
        return;
      }

      setProfesorCodigo(session.id);
      setProfesorNombres(session.nombres);
      setProfesorApellidos(session.apellidos);

      // Buscar el numero_de_telefono del profesor desde Usuarios (Fase 10.E.15).
      const { data: profesorData, error: profesorError } = await supabase
        .from('Usuarios')
        .select('numero_de_telefono')
        .eq('id', String(session.id))
        .single();

      if (profesorError || !profesorData) {
        console.error('Error obteniendo numero_de_telefono del profesor:', profesorError);
        toast({
          title: "Error",
          description: "No se pudo obtener la información del profesor",
          variant: "destructive",
        });
        navigate('/');
        return;
      }

      const idProfesor = profesorData.numero_de_telefono;
      setProfesorIdReal(idProfesor);

      const storedAsignatura = localStorage.getItem("asignaturaSeleccionada");
      const storedGrado = localStorage.getItem("gradoSeleccionado");
      const storedSalon = localStorage.getItem("salonSeleccionado");

      if (!storedAsignatura || !storedGrado || !storedSalon) {
        navigate('/dashboard');
        return;
      }

      setAsignaturaSeleccionada(storedAsignatura);
      setGradoSeleccionado(storedGrado);
      setSalonSeleccionado(storedSalon);

      await cargarActividades(idProfesor, storedAsignatura, storedGrado, storedSalon);
    };

    inicializar();
  }, [navigate]);

  const cargarActividades = async (
    profIdReal: string,
    asignatura: string,
    grado: string,
    salon: string
  ) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Calendario Actividades')
        .select('*')
        .eq('id_profesor', profIdReal)
        .eq('Asignatura', asignatura)
        .eq('Grado', grado)
        .eq('Salon', salon)
        .order('fecha_de_presentacion', { ascending: true });

      if (error) {
        console.error('Error cargando actividades:', error);
        toast({
          title: "Error",
          description: "No se pudieron cargar las actividades",
          variant: "destructive",
        });
      } else {
        setActividades(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAbrirModalCrear = () => {
    setDescripcion("");
    setFechaSeleccionada(undefined);
    setActividadEditando(null);
    setArchivosSeleccionados([]);
    setUrlsExistentes([]);
    setModalOpen(true);
  };

  const handleAbrirModalEditar = (actividad: ActividadCalendario) => {
    setDescripcion(actividad.Descripción);
    const fecha = parsearFecha(actividad.fecha_de_presentacion);
    setFechaSeleccionada(fecha || undefined);
    setActividadEditando(actividad);
    setArchivosSeleccionados([]);
    setUrlsExistentes(actividad.archivo_url ? actividad.archivo_url.split('\n').filter(Boolean) : []);
    setModalOpen(true);
  };

  const handleGuardarActividad = async () => {
    if (!descripcion.trim()) {
      toast({
        title: "Error",
        description: "La descripción es requerida",
        variant: "destructive",
      });
      return;
    }

    if (!fechaSeleccionada) {
      toast({
        title: "Error",
        description: "La fecha de presentación es requerida",
        variant: "destructive",
      });
      return;
    }

    // Validar que la fecha no sea pasada
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaSeleccionadaNormalizada = new Date(fechaSeleccionada);
    fechaSeleccionadaNormalizada.setHours(0, 0, 0, 0);

    if (fechaSeleccionadaNormalizada < hoy) {
      toast({
        title: "Fecha inválida",
        description: "No se puede asignar actividades en fechas pasadas. Por favor selecciona una fecha actual o futura.",
        variant: "destructive",
      });
      return;
    }

    const fechaFormateada = formatearFecha(fechaSeleccionada);

    try {
      // Upload new files if any
      const nuevasUrls: string[] = [];
      if (archivosSeleccionados.length > 0) {
        setSubiendoArchivo(true);
        try {
          for (const file of archivosSeleccionados) {
            const resultado = await subirArchivo(file);
            nuevasUrls.push(resultado.url);
          }
        } catch (err: any) {
          toast({
            title: "Error al subir archivo",
            description: err.message || "No se pudo subir el archivo",
            variant: "destructive",
          });
          setSubiendoArchivo(false);
          return;
        }
        setSubiendoArchivo(false);
      }

      // Combine existing URLs (that weren't removed) + newly uploaded
      const todasUrls = [...urlsExistentes, ...nuevasUrls];
      const archivoUrlFinal = todasUrls.length > 0 ? todasUrls.join('\n') : null;

      if (actividadEditando) {
        // Editar actividad existente
        const updateData: Record<string, unknown> = {
          Descripción: descripcion.trim(),
          fecha_de_presentacion: fechaFormateada,
          archivo_url: archivoUrlFinal,
        };

        const { error } = await supabase
          .from('Calendario Actividades')
          .update(updateData)
          .eq('column_id', actividadEditando.column_id);

        if (error) {
          console.error('Error editando actividad:', error);
          toast({
            title: "Error",
            description: "No se pudo editar la actividad",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Actividad actualizada",
          description: "La actividad se ha actualizado correctamente",
        });
      } else {
        // Crear nueva actividad
        const insertData: Record<string, unknown> = {
          id_profesor: profesorIdReal,
          Nombres: profesorNombres,
          Apellidos: profesorApellidos,
          Asignatura: asignaturaSeleccionada,
          Grado: gradoSeleccionado,
          Salon: salonSeleccionado,
          Descripción: descripcion.trim(),
          fecha_de_presentacion: fechaFormateada,
        };
        if (archivoUrlFinal) {
          insertData.archivo_url = archivoUrlFinal;
        }

        const { error } = await supabase
          .from('Calendario Actividades')
          .insert(insertData);

        if (error) {
          console.error('Error creando actividad:', error);
          toast({
            title: "Error",
            description: "No se pudo crear la actividad",
            variant: "destructive",
          });
          return;
        }

        // Notificar automáticamente a estudiantes y padres
        const session = getSession();
        const cargo = session.cargo || 'Profesor(a)';
        try {
          await apiRequest('/api/notificaciones/actividad-programada', {
            method: 'POST',
            body: JSON.stringify({
              profesor_nombre: `${profesorNombres} ${profesorApellidos}`.trim(),
              profesor_cargo: cargo,
              grado: gradoSeleccionado,
              salon: salonSeleccionado,
              asignatura: asignaturaSeleccionada,
              descripcion: descripcion.trim(),
              fecha: mostrarFecha(fechaFormateada),
              ...(archivoUrlFinal ? { archivo_url: archivoUrlFinal } : {}),
            }),
          });
        } catch (err) {
          console.error('Error enviando notificación:', err);
        }

        toast({
          title: "Actividad creada",
          description: "La actividad se ha creado correctamente y se notificó a estudiantes y padres",
        });
      }

      setModalOpen(false);
      await cargarActividades(profesorIdReal, asignaturaSeleccionada, gradoSeleccionado, salonSeleccionado);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Error de conexión",
        variant: "destructive",
      });
    }
  };

  const handleConfirmarEliminar = (actividad: ActividadCalendario) => {
    setActividadAEliminar(actividad);
    setDeleteDialogOpen(true);
  };

  const handleEliminarActividad = async () => {
    if (!actividadAEliminar) return;

    try {
      const { error } = await supabase
        .from('Calendario Actividades')
        .delete()
        .eq('column_id', actividadAEliminar.column_id);

      if (error) {
        console.error('Error eliminando actividad:', error);
        toast({
          title: "Error",
          description: "No se pudo eliminar la actividad",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Actividad eliminada",
        description: "La actividad se ha eliminado correctamente",
      });

      setDeleteDialogOpen(false);
      setActividadAEliminar(null);
      await cargarActividades(profesorIdReal, asignaturaSeleccionada, gradoSeleccionado, salonSeleccionado);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Error de conexión",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb + Actions */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                onClick={() => navigate("/dashboard")}
                className="text-primary hover:underline"
              >
                Asignaturas
              </button>
              <span className="text-muted-foreground">→</span>
              <button
                onClick={() => navigate("/seleccionar-grado")}
                className="text-primary hover:underline"
              >
                {asignaturaSeleccionada}
              </button>
              <span className="text-muted-foreground">→</span>
              <button
                onClick={() => navigate("/seleccionar-salon")}
                className="text-primary hover:underline"
              >
                {gradoSeleccionado}
              </button>
              <span className="text-muted-foreground">→</span>
              <button
                onClick={() => navigate("/tabla-notas")}
                className="text-primary hover:underline"
              >
                {salonSeleccionado}
              </button>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground font-medium">Actividades Asignadas</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/tabla-notas")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a Notas
              </Button>
              <Button
                onClick={handleAbrirModalCrear}
                size="sm"
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Agregar Actividad
              </Button>
            </div>
          </div>
        </div>

        {/* Lista de actividades */}
        <div className="bg-card rounded-lg shadow-soft p-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Cargando actividades...
            </div>
          ) : actividades.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No hay actividades asignadas</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Haz clic en "Agregar Actividad" para crear una nueva
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {actividades.map((actividad) => (
                <div
                  key={actividad.column_id}
                  className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-foreground font-medium">
                        {actividad.Descripción}
                      </p>
                      <p className="text-sm text-primary mt-1 flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {mostrarFecha(actividad.fecha_de_presentacion)}
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
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAbrirModalEditar(actividad)}
                        className="gap-1"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleConfirmarEliminar(actividad)}
                        className="gap-1"
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal Crear/Editar Actividad */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {actividadEditando ? "Editar Actividad" : "Agregar Actividad"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción de la actividad</Label>
              <Textarea
                id="descripcion"
                placeholder="Ej: Entrega de taller sobre fracciones"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value.slice(0, 500))}
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground text-right">
                {descripcion.length}/500 caracteres
              </p>
            </div>

            <div className="space-y-2">
              <Label>Archivos adjuntos (opcional)</Label>
              {/* Show existing URLs */}
              {urlsExistentes.map((url, i) => (
                <div key={`existing-${i}`} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm overflow-hidden">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate"
                  >
                    Archivo {i + 1}
                  </a>
                  <button
                    type="button"
                    onClick={() => setUrlsExistentes(prev => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    title="Quitar archivo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {/* Show selected new files */}
              {archivosSeleccionados.map((file, i) => (
                <div key={`new-${i}`} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm overflow-hidden">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setArchivosSeleccionados(prev => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    title="Quitar archivo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {/* File input — always available to add more */}
              <label className="flex items-center gap-2 p-3 border-2 border-dashed border-muted-foreground/30 rounded-md cursor-pointer hover:border-primary/50 transition-colors">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {(urlsExistentes.length + archivosSeleccionados.length) > 0 ? 'Agregar otro archivo' : 'Seleccionar archivo'}
                </span>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      setArchivosSeleccionados(prev => [...prev, ...Array.from(files)]);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <div className="space-y-2">
              <Label>Fecha de presentación</Label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fechaSeleccionada && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {fechaSeleccionada ? mostrarFecha(formatearFecha(fechaSeleccionada)) : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={fechaSeleccionada}
                    onSelect={(date) => {
                      setFechaSeleccionada(date);
                      setPopoverOpen(false);
                    }}
                    disabled={(date) => {
                      const hoy = new Date();
                      hoy.setHours(0, 0, 0, 0);
                      return date < hoy;
                    }}
                    initialFocus
                    locale={es}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGuardarActividad} disabled={subiendoArchivo}>
              {subiendoArchivo ? "Subiendo archivo..." : "Guardar Actividad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar actividad?</AlertDialogTitle>
            <AlertDialogDescription>
              {actividadAEliminar && (
                <>
                  ¿Estás seguro de que deseas eliminar la actividad "{actividadAEliminar.Descripción}"?
                  <br />
                  Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEliminarActividad}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ActividadesCalendario;
