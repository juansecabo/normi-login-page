import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { subirArchivo } from "@/lib/storage";
import { apiRequest } from "@/lib/apiClient";
import { getSession, isProfesor } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import CharCircle from "@/components/CharCircle";
import {
  buildActividadBodyPreview,
  MAX_WA_TEMPLATE_BODY,
  WA_TEMPLATE_OVERHEAD,
} from "@/lib/wapBody";
import { Button } from "@/components/ui/button";
import ResponsiveSelect from "@/components/ResponsiveSelect";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Calendar, Paperclip, FileText, X, Loader2, Pencil, Trash2, Eye, Download } from "lucide-react";
import { es } from "date-fns/locale";

const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const formatearFecha = (date: Date): string => {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const mostrarFecha = (fechaStr: string): string => {
  const matchISO = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matchISO) return fechaStr;
  const [, year, month, day] = matchISO;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const dia = diasSemana[date.getDay()];
  return `${day}/${month}/${year} (${dia})`;
};

const parsearFecha = (fechaStr: string): Date | null => {
  const matchISO = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchISO) {
    const [, year, month, day] = matchISO;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  return null;
};

const TIPOS_ACTIVIDAD = ["Tarea", "Evaluación", "Taller", "Quiz", "Otro"] as const;

interface AsignacionRow {
  'Asignatura(s)': string[] | string[][];
  'Grado(s)': string[] | string[][];
  'Salon(es)': string[] | string[][];
}

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

const ProgramarActividad = () => {
  const navigate = useNavigate();

  // Profesor info
  const [profesorIdReal, setProfesorIdReal] = useState("");
  const [profesorNombres, setProfesorNombres] = useState("");
  const [profesorApellidos, setProfesorApellidos] = useState("");
  const [profesorCargo, setProfesorCargo] = useState("");

  // Asignaciones raw data
  const [asignaciones, setAsignaciones] = useState<AsignacionRow[]>([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(true);

  // Cascade selectors (shared between tabs)
  const [asignaturas, setAsignaturas] = useState<string[]>([]);
  const [grados, setGrados] = useState<string[]>([]);
  const [salones, setSalones] = useState<string[]>([]);

  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState("");
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [tipoSeleccionado, setTipoSeleccionado] = useState("");

  // Programar form fields
  const [descripcion, setDescripcion] = useState("");
  const [fechaSeleccionada, setFechaSeleccionada] = useState<Date | undefined>(undefined);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [archivosSeleccionados, setArchivosSeleccionados] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Actividades Programadas tab
  const [actAsignatura, setActAsignatura] = useState("");
  const [actGrado, setActGrado] = useState("");
  const [actSalon, setActSalon] = useState("");
  const [actGrados, setActGrados] = useState<string[]>([]);
  const [actSalones, setActSalones] = useState<string[]>([]);
  const [actividades, setActividades] = useState<ActividadCalendario[]>([]);
  const [loadingActividades, setLoadingActividades] = useState(false);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editActividad, setEditActividad] = useState<ActividadCalendario | null>(null);
  const [editDescripcion, setEditDescripcion] = useState("");
  const [editFecha, setEditFecha] = useState<Date | undefined>(undefined);
  const [editPopoverOpen, setEditPopoverOpen] = useState(false);
  const [editArchivos, setEditArchivos] = useState<File[]>([]);
  const [editUrlsExistentes, setEditUrlsExistentes] = useState<string[]>([]);
  const [editGuardando, setEditGuardando] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actividadAEliminar, setActividadAEliminar] = useState<ActividadCalendario | null>(null);

  // Load profesor data and asignaciones
  useEffect(() => {
    const inicializar = async () => {
      const session = getSession();

      if (!session.id || !isProfesor()) {
        navigate("/");
        return;
      }

      setProfesorNombres(session.nombres || "");
      setProfesorApellidos(session.apellidos || "");
      setProfesorCargo(session.cargo || "Profesor(a)");

      try {
        // Get numero_de_telefono for Calendario Actividades (id_profesor) (Fase 10.E.15: vive en Usuarios)
        const { data: profesor, error: profesorError } = await supabase
          .from('Usuarios')
          .select('numero_de_telefono')
          .eq('id', String(session.id))
          .single();

        if (profesorError || !profesor) {
          toast({ title: "Error", description: "No se pudo obtener la información del profesor", variant: "destructive" });
          navigate('/dashboard');
          return;
        }

        setProfesorIdReal(profesor.numero_de_telefono);

        // Get assignments directly by id
        const { data: asignacionesData, error: asignacionError } = await supabase
          .from('Asignación Profesores')
          .select('"Asignatura(s)", "Grado(s)", "Salon(es)"')
          .eq('id', parseInt(session.id!));

        if (asignacionError || !asignacionesData) {
          setLoadingAsignaciones(false);
          return;
        }

        setAsignaciones(asignacionesData as AsignacionRow[]);

        const todasAsignaturas = asignacionesData
          .flatMap(a => (a as AsignacionRow)['Asignatura(s)'] || [])
          .flat() as string[];
        const asignaturasUnicas = [...new Set(todasAsignaturas)].sort((a, b) => a.localeCompare(b, 'es'));
        setAsignaturas(asignaturasUnicas);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoadingAsignaciones(false);
      }
    };

    inicializar();
  }, [navigate]);

  // ===== Programar tab: cascade grados/salones =====
  useEffect(() => {
    if (!asignaturaSeleccionada) { setGrados([]); return; }
    const filtradas = asignaciones.filter(a => ((a['Asignatura(s)'] || []).flat() as string[]).includes(asignaturaSeleccionada));
    const todos = filtradas.flatMap(a => a['Grado(s)'] || []).flat() as string[];
    setGrados([...new Set(todos)]);
  }, [asignaturaSeleccionada, asignaciones]);

  useEffect(() => {
    if (!asignaturaSeleccionada || !gradoSeleccionado) { setSalones([]); return; }
    const filtradas = asignaciones.filter(a => {
      const asigs = (a['Asignatura(s)'] || []).flat() as string[];
      const grads = (a['Grado(s)'] || []).flat() as string[];
      return asigs.includes(asignaturaSeleccionada) && grads.includes(gradoSeleccionado);
    });
    const todos = filtradas.flatMap(a => a['Salon(es)'] || []).flat() as string[];
    setSalones([...new Set(todos)]);
  }, [gradoSeleccionado, asignaturaSeleccionada, asignaciones]);

  // ===== Actividades tab: cascade grados/salones =====
  useEffect(() => {
    if (!actAsignatura) { setActGrados([]); return; }
    const filtradas = asignaciones.filter(a => ((a['Asignatura(s)'] || []).flat() as string[]).includes(actAsignatura));
    const todos = filtradas.flatMap(a => a['Grado(s)'] || []).flat() as string[];
    setActGrados([...new Set(todos)]);
  }, [actAsignatura, asignaciones]);

  useEffect(() => {
    if (!actAsignatura || !actGrado) { setActSalones([]); return; }
    const filtradas = asignaciones.filter(a => {
      const asigs = (a['Asignatura(s)'] || []).flat() as string[];
      const grads = (a['Grado(s)'] || []).flat() as string[];
      return asigs.includes(actAsignatura) && grads.includes(actGrado);
    });
    const todos = filtradas.flatMap(a => a['Salon(es)'] || []).flat() as string[];
    setActSalones([...new Set(todos)]);
  }, [actGrado, actAsignatura, asignaciones]);

  // Load actividades when all 3 selectors are set
  useEffect(() => {
    if (!actAsignatura || !actGrado || !actSalon || !profesorIdReal) {
      setActividades([]);
      return;
    }
    cargarActividades();
  }, [actAsignatura, actGrado, actSalon, profesorIdReal]);

  const cargarActividades = async () => {
    setLoadingActividades(true);
    try {
      // Aula compartida: ver actividades programadas por cualquier profesor.
      const { data, error } = await supabase
        .from('Calendario Actividades')
        .select('*')
        .eq('Asignatura', actAsignatura)
        .eq('Grado', actGrado)
        .eq('Salon', actSalon)
        .order('fecha_de_presentacion', { ascending: true });

      if (error) {
        console.error('Error cargando actividades:', error);
        toast({ title: "Error", description: "No se pudieron cargar las actividades", variant: "destructive" });
      } else {
        setActividades(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoadingActividades(false);
    }
  };

  // ===== Programar tab: cascade reset handlers =====
  const handleAsignaturaChange = (value: string) => {
    setAsignaturaSeleccionada(value);
    setGradoSeleccionado("");
    setSalonSeleccionado("");
    setTipoSeleccionado("");
    setDescripcion("");
    setFechaSeleccionada(undefined);
    setArchivosSeleccionados([]);
  };

  const handleGradoChange = (value: string) => {
    setGradoSeleccionado(value);
    setSalonSeleccionado("");
    setTipoSeleccionado("");
    setDescripcion("");
    setFechaSeleccionada(undefined);
    setArchivosSeleccionados([]);
  };

  // Salón change does NOT reset tipo/descripcion/archivos/fecha
  const handleSalonChange = (value: string) => {
    setSalonSeleccionado(value);
  };

  // ===== Actividades tab: cascade reset handlers =====
  const handleActAsignaturaChange = (value: string) => {
    setActAsignatura(value);
    setActGrado("");
    setActSalon("");
  };

  const handleActGradoChange = (value: string) => {
    setActGrado(value);
    setActSalon("");
  };

  const handleProgramar = async () => {
    if (!salonSeleccionado) {
      toast({ title: "Error", description: "Selecciona un salón", variant: "destructive" });
      return;
    }
    if (!descripcion.trim()) {
      toast({ title: "Error", description: "La descripción es requerida", variant: "destructive" });
      return;
    }
    if (!fechaSeleccionada) {
      toast({ title: "Error", description: "La fecha de presentación es requerida", variant: "destructive" });
      return;
    }
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaNorm = new Date(fechaSeleccionada);
    fechaNorm.setHours(0, 0, 0, 0);
    if (fechaNorm < hoy) {
      toast({ title: "Fecha inválida", description: "No se puede programar actividades en fechas pasadas.", variant: "destructive" });
      return;
    }
    setGuardando(true);

    try {
      let archivoUrlFinal: string | null = null;
      if (archivosSeleccionados.length > 0) {
        const urls: string[] = [];
        for (const file of archivosSeleccionados) {
          const resultado = await subirArchivo(file);
          urls.push(resultado.url);
        }
        archivoUrlFinal = urls.join('\n');
      }

      // Type prefix: only if tipo is set and not "Otro"
      let descripcionFinal = descripcion.trim();
      if (tipoSeleccionado && tipoSeleccionado !== "Otro") {
        descripcionFinal = `${tipoSeleccionado}: ${descripcionFinal}`;
      }

      const fechaFormateada = formatearFecha(fechaSeleccionada!);

      const insertData: Record<string, unknown> = {
        id_profesor: profesorIdReal,
        Nombres: profesorNombres,
        Apellidos: profesorApellidos,
        Asignatura: asignaturaSeleccionada,
        Grado: gradoSeleccionado,
        Salon: salonSeleccionado,
        Descripción: descripcionFinal,
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
        toast({ title: "Error", description: "No se pudo programar la actividad", variant: "destructive" });
        setGuardando(false);
        return;
      }

      // Increment persistent activity counter
      try {
        const { data: uso } = await supabase
          .from('Uso_Profesores')
          .select('actividades_programadas')
          .eq('profesor_id', profesorIdReal)
          .maybeSingle();

        if (uso) {
          await supabase.from('Uso_Profesores')
            .update({ actividades_programadas: (uso.actividades_programadas || 0) + 1 })
            .eq('profesor_id', profesorIdReal);
        } else {
          await supabase.from('Uso_Profesores')
            .insert({ profesor_id: profesorIdReal, actividades_programadas: 1 });
        }
      } catch (e) {
        console.error('Error incrementando contador:', e);
      }

      // Notificación al server (multi-tenant via JWT). Reemplaza el webhook
      // viejo n8n /webhook/notificar-actividades.
      try {
        await apiRequest('/api/notificaciones/actividad-programada', {
          method: 'POST',
          body: JSON.stringify({
            profesor_nombre: `${profesorNombres} ${profesorApellidos}`.trim(),
            profesor_cargo: profesorCargo,
            grado: gradoSeleccionado,
            salon: salonSeleccionado,
            asignatura: asignaturaSeleccionada,
            descripcion: descripcionFinal,
            fecha: mostrarFecha(fechaFormateada),
            ...(archivoUrlFinal ? { archivo_url: archivoUrlFinal } : {}),
          }),
        });
      } catch (err) {
        console.error('Error enviando notificación:', err);
      }

      toast({
        title: "Actividad programada",
        description: "La actividad se ha programado correctamente y se notificó a estudiantes y padres",
      });
    } catch (error: any) {
      console.error('Error:', error);
      toast({ title: "Error", description: error.message || "Error de conexión", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  // ===== Edit activity =====
  const handleAbrirEditar = (actividad: ActividadCalendario) => {
    setEditActividad(actividad);
    setEditDescripcion(actividad.Descripción);
    const fecha = parsearFecha(actividad.fecha_de_presentacion);
    setEditFecha(fecha || undefined);
    setEditArchivos([]);
    setEditUrlsExistentes(actividad.archivo_url ? actividad.archivo_url.split('\n').filter(Boolean) : []);
    setEditModalOpen(true);
  };

  const handleGuardarEdicion = async () => {
    if (!editDescripcion.trim()) {
      toast({ title: "Error", description: "La descripción es requerida", variant: "destructive" });
      return;
    }
    if (!editFecha) {
      toast({ title: "Error", description: "La fecha es requerida", variant: "destructive" });
      return;
    }

    setEditGuardando(true);
    try {
      const nuevasUrls: string[] = [];
      if (editArchivos.length > 0) {
        for (const file of editArchivos) {
          const resultado = await subirArchivo(file);
          nuevasUrls.push(resultado.url);
        }
      }

      const todasUrls = [...editUrlsExistentes, ...nuevasUrls];
      const archivoUrlFinal = todasUrls.length > 0 ? todasUrls.join('\n') : null;

      const { error } = await supabase
        .from('Calendario Actividades')
        .update({
          Descripción: editDescripcion.trim(),
          fecha_de_presentacion: formatearFecha(editFecha),
          archivo_url: archivoUrlFinal,
        })
        .eq('column_id', editActividad!.column_id);

      if (error) {
        console.error('Error editando actividad:', error);
        toast({ title: "Error", description: "No se pudo editar la actividad", variant: "destructive" });
        return;
      }

      toast({ title: "Actividad actualizada", description: "La actividad se ha actualizado correctamente" });
      setEditModalOpen(false);
      await cargarActividades();
    } catch (error: any) {
      console.error('Error:', error);
      toast({ title: "Error", description: error.message || "Error de conexión", variant: "destructive" });
    } finally {
      setEditGuardando(false);
    }
  };

  // ===== Delete activity =====
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
        toast({ title: "Error", description: "No se pudo eliminar la actividad", variant: "destructive" });
        return;
      }

      toast({ title: "Actividad eliminada", description: "La actividad se ha eliminado correctamente" });
      setDeleteDialogOpen(false);
      setActividadAEliminar(null);
      await cargarActividades();
    } catch (error) {
      console.error('Error:', error);
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    }
  };

  // Contador de caracteres del body del WhatsApp (mismo que Enviar Comunicado).
  // Calculado en tiempo real con la descripción + prefijo de tipo + fecha mostrada +
  // archivos seleccionados, todo dentro de la plantilla REPORTE DE ACTIVIDAD.
  const descripcionConTipo =
    tipoSeleccionado && tipoSeleccionado !== "Otro"
      ? `${tipoSeleccionado}: ${descripcion.trim()}`
      : descripcion.trim();
  const fechaTextoActual = fechaSeleccionada
    ? mostrarFecha(formatearFecha(fechaSeleccionada))
    : "";
  const profesorNombre = `${profesorNombres} ${profesorApellidos}`.trim();
  const templateBodyLength =
    buildActividadBodyPreview({
      profesorCargo,
      profesorNombre,
      grado: gradoSeleccionado,
      salon: salonSeleccionado,
      asignatura: asignaturaSeleccionada,
      descripcion: descripcionConTipo,
      fecha: fechaTextoActual,
      archivos: archivosSeleccionados,
    }).length + WA_TEMPLATE_OVERHEAD;
  const baselineLength =
    buildActividadBodyPreview({
      profesorCargo,
      profesorNombre,
      grado: gradoSeleccionado,
      salon: salonSeleccionado,
      asignatura: asignaturaSeleccionada,
      descripcion: "",
      fecha: fechaTextoActual,
      archivos: [],
    }).length + WA_TEMPLATE_OVERHEAD;
  const personalMax = Math.max(0, MAX_WA_TEMPLATE_BODY - baselineLength);
  const usedChars = Math.max(0, templateBodyLength - baselineLength);
  const bodyOverLimit = templateBodyLength > MAX_WA_TEMPLATE_BODY;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 max-w-3xl mx-auto mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Programar Actividad</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl mx-auto mb-6 text-center">Programa las tareas, evaluaciones, exposiciones y demás actividades académicas de tus estudiantes.</p>

        <Tabs defaultValue="programar" className="max-w-3xl mx-auto">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="programar">Programar Actividad</TabsTrigger>
            <TabsTrigger value="actividades">Actividades Programadas</TabsTrigger>
          </TabsList>

          {/* ===== TAB: Programar Actividad ===== */}
          <TabsContent value="programar">
            <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 space-y-5">
              {loadingAsignaciones ? (
                <div className="text-center text-muted-foreground py-8">Cargando asignaturas...</div>
              ) : asignaturas.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">No tienes asignaturas asignadas</div>
              ) : (
                <>
                  {/* 1. Asignatura */}
                  <div className="space-y-2">
                    <Label>Asignatura</Label>
                    <ResponsiveSelect
                      value={asignaturaSeleccionada}
                      onValueChange={handleAsignaturaChange}
                      placeholder="Seleccionar asignatura"
                      options={asignaturas.map((a) => ({ value: a, label: a }))}
                    />
                  </div>

                  {/* 2. Grado */}
                  {asignaturaSeleccionada && (
                    <div className="space-y-2">
                      <Label>Grado</Label>
                      <ResponsiveSelect
                        value={gradoSeleccionado}
                        onValueChange={handleGradoChange}
                        placeholder="Seleccionar grado"
                        options={grados.map((g) => ({ value: g, label: g }))}
                      />
                    </div>
                  )}

                  {/* All remaining fields appear once grado is selected */}
                  {gradoSeleccionado && (
                    <>
                      {/* 3. Salón */}
                      <div className="space-y-2">
                        <Label>Salón</Label>
                        <ResponsiveSelect
                          value={salonSeleccionado}
                          onValueChange={handleSalonChange}
                          placeholder="Seleccionar salón"
                          options={salones.map((s) => ({ value: s, label: s }))}
                        />
                      </div>

                      {/* 4. Tipo (opcional) */}
                      <div className="space-y-2">
                        <Label>Tipo de actividad (opcional)</Label>
                        <ResponsiveSelect
                          value={tipoSeleccionado}
                          onValueChange={setTipoSeleccionado}
                          placeholder="Sin tipo específico"
                          options={TIPOS_ACTIVIDAD.map((t) => ({ value: t, label: t }))}
                        />
                      </div>

                      {/* 5. Descripción */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="descripcion">Descripción</Label>
                          <CharCircle value={usedChars} max={personalMax} />
                        </div>
                        <Textarea
                          id="descripcion"
                          placeholder="Ej: Resolver ejercicios de la página 45"
                          value={descripcion}
                          onChange={(e) => setDescripcion(e.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>

                      {/* 6. Archivos adjuntos */}
                      <div className="space-y-2">
                        <Label>Archivos adjuntos (opcional)</Label>
                        {archivosSeleccionados.map((file, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm min-w-0">
                            <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="truncate flex-1 min-w-0">{file.name}</span>
                            <button type="button" onClick={() => setArchivosSeleccionados(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" title="Quitar archivo">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <label className="flex items-center gap-2 p-3 border-2 border-dashed border-muted-foreground/30 rounded-md cursor-pointer hover:border-primary/50 transition-colors">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {archivosSeleccionados.length > 0 ? 'Agregar otro archivo' : 'Seleccionar archivo'}
                          </span>
                          <input type="file" className="hidden" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png" onChange={(e) => { const files = e.target.files; if (files && files.length > 0) setArchivosSeleccionados(prev => [...prev, ...Array.from(files)]); e.target.value = ''; }} />
                        </label>
                      </div>

                      {/* 7. Fecha de presentación */}
                      <div className="space-y-2">
                        <Label>Fecha de presentación</Label>
                        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !fechaSeleccionada && "text-muted-foreground")}>
                              <Calendar className="mr-2 h-4 w-4" />
                              {fechaSeleccionada ? mostrarFecha(formatearFecha(fechaSeleccionada)) : "Seleccionar fecha"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={fechaSeleccionada}
                              onSelect={(date) => { setFechaSeleccionada(date); setPopoverOpen(false); }}
                              disabled={(date) => { const hoy = new Date(); hoy.setHours(0, 0, 0, 0); return date < hoy; }}
                              initialFocus
                              locale={es}
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* 8. Botón Programar */}
                      <Button
                        onClick={() => {
                          if (bodyOverLimit) {
                            toast({
                              title: "Reporte demasiado largo",
                              description: `El contenido total (${templateBodyLength} caracteres) supera el límite de ${MAX_WA_TEMPLATE_BODY} caracteres de WhatsApp. Reduce la descripción.`,
                              variant: "destructive",
                            });
                            return;
                          }
                          handleProgramar();
                        }}
                        disabled={guardando || !salonSeleccionado || !descripcion.trim() || !fechaSeleccionada}
                        className={`w-full mt-4 ${bodyOverLimit ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
                        size="lg"
                      >
                        {guardando ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Programando...</>
                        ) : (
                          "Programar"
                        )}
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ===== TAB: Actividades Programadas ===== */}
          <TabsContent value="actividades">
            <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 space-y-5">
              {loadingAsignaciones ? (
                <div className="text-center text-muted-foreground py-8">Cargando...</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Asignatura</Label>
                      <ResponsiveSelect
                        value={actAsignatura}
                        onValueChange={handleActAsignaturaChange}
                        placeholder="Seleccionar"
                        options={asignaturas.map((a) => ({ value: a, label: a }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Grado</Label>
                      <ResponsiveSelect
                        value={actGrado}
                        onValueChange={handleActGradoChange}
                        placeholder="Seleccionar"
                        options={actGrados.map((g) => ({ value: g, label: g }))}
                        disabled={!actAsignatura}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Salón</Label>
                      <ResponsiveSelect
                        value={actSalon}
                        onValueChange={setActSalon}
                        placeholder="Seleccionar"
                        options={actSalones.map((s) => ({ value: s, label: s }))}
                        disabled={!actGrado}
                      />
                    </div>
                  </div>

                  {/* Activity list */}
                  {actAsignatura && actGrado && actSalon && (
                    <div className="mt-4">
                      {loadingActividades ? (
                        <div className="text-center py-8 text-muted-foreground">Cargando actividades...</div>
                      ) : actividades.length === 0 ? (
                        <div className="text-center py-8">
                          <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                          <p className="text-muted-foreground">No hay actividades programadas</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {actividades.map((actividad) => (
                            <div key={actividad.column_id} className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
                              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                <div className="flex-1">
                                  <p className="text-foreground font-medium">{actividad.Descripción}</p>
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
                                  <Button variant="outline" size="sm" onClick={() => handleAbrirEditar(actividad)} className="gap-1">
                                    <Pencil className="h-4 w-4" /> Editar
                                  </Button>
                                  <Button variant="destructive" size="sm" onClick={() => handleConfirmarEliminar(actividad)} className="gap-1">
                                    <Trash2 className="h-4 w-4" /> Eliminar
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Edit activity modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Actividad</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-descripcion">Descripción de la actividad</Label>
              <Textarea
                id="edit-descripcion"
                value={editDescripcion}
                onChange={(e) => setEditDescripcion(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Archivos adjuntos (opcional)</Label>
              {editUrlsExistentes.map((url, i) => (
                <div key={`existing-${i}`} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate flex-1">{decodeURIComponent((url.split('/').pop() || '').replace(/^\d+-[a-z0-9]+-/, ''))}</a>
                  <button type="button" onClick={() => setEditUrlsExistentes(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" title="Quitar archivo">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {editArchivos.map((file, i) => (
                <div key={`new-${i}`} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm min-w-0">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="truncate flex-1 min-w-0">{file.name}</span>
                  <button type="button" onClick={() => setEditArchivos(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" title="Quitar archivo">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <label className="flex items-center gap-2 p-3 border-2 border-dashed border-muted-foreground/30 rounded-md cursor-pointer hover:border-primary/50 transition-colors">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {(editUrlsExistentes.length + editArchivos.length) > 0 ? 'Agregar otro archivo' : 'Seleccionar archivo'}
                </span>
                <input type="file" className="hidden" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png" onChange={(e) => { const files = e.target.files; if (files && files.length > 0) setEditArchivos(prev => [...prev, ...Array.from(files)]); e.target.value = ''; }} />
              </label>
            </div>

            <div className="space-y-2">
              <Label>Fecha de presentación</Label>
              <Popover open={editPopoverOpen} onOpenChange={setEditPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editFecha && "text-muted-foreground")}>
                    <Calendar className="mr-2 h-4 w-4" />
                    {editFecha ? mostrarFecha(formatearFecha(editFecha)) : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={editFecha}
                    onSelect={(date) => { setEditFecha(date); setEditPopoverOpen(false); }}
                    disabled={(date) => { const hoy = new Date(); hoy.setHours(0, 0, 0, 0); return date < hoy; }}
                    initialFocus
                    locale={es}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleGuardarEdicion} disabled={editGuardando}>
              {editGuardando ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar actividad</AlertDialogTitle>
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
            <AlertDialogAction onClick={handleEliminarActividad} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProgramarActividad;
