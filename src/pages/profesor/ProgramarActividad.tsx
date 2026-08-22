import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { subirArchivo } from "@/lib/storage";
import { apiRequest } from "@/lib/apiClient";
import { getSession, isProfesor, isEstudiante, isPadreDeFamilia } from "@/hooks/useSession";
import { rankGrado, useGradosColegio } from "@/utils/grados";
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
import { Input } from "@/components/ui/input";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { es } from "date-fns/locale";
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
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Calendar, Paperclip, FileText, X, Loader2, Pencil, Trash2, Eye, Download, RotateCcw, Search } from "lucide-react";

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

  // #22: los internos que NO son profesores programan actividades GENERALES
  // (sin asignatura, eligen grado/salón de toda la estructura del colegio).
  const modoGeneral = !isProfesor();
  const { grados: gradosColegio } = useGradosColegio();

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
  const [salonesSeleccionados, setSalonesSeleccionados] = useState<string[]>([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState("");
  // #25: dirigir la actividad a estudiantes específicos del salón (en vez de todo el salón).
  const [destinoEspecifico, setDestinoEspecifico] = useState(false);
  const [estudiantesAula, setEstudiantesAula] = useState<{ id: string; nombre: string; salon: string }[]>([]);
  const [estudiantesDestino, setEstudiantesDestino] = useState<string[]>([]);
  const [busquedaEst, setBusquedaEst] = useState("");

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

  // Calendario: TODAS las actividades que ha dejado este profesor (pendientes + pasadas)
  const [misActividades, setMisActividades] = useState<ActividadCalendario[]>([]);
  const [loadingMias, setLoadingMias] = useState(false);
  const [mesCal, setMesCal] = useState<Date>(new Date());
  const [diaSelCal, setDiaSelCal] = useState<Date | undefined>(new Date());
  // Vista actual en la URL (?v=programar|actividades) para que sobreviva al refrescar.
  const [searchParams, setSearchParams] = useSearchParams();
  const vista: "menu" | "programar" | "actividades" =
    searchParams.get("v") === "programar" ? "programar"
    : searchParams.get("v") === "actividades" ? "actividades"
    : "menu";
  const irA = (v: "menu" | "programar" | "actividades") => setSearchParams(v === "menu" ? {} : { v });
  // Filtros del calendario de actividades del profesor.
  const [filtroAsig, setFiltroAsig] = useState("todas");
  const [filtroGrado, setFiltroGrado] = useState("todos");
  const [filtroSalon, setFiltroSalon] = useState("todos");
  const [busquedaAct, setBusquedaAct] = useState("");

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

  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [dupSalones, setDupSalones] = useState<string[]>([]);

  // Load profesor data and asignaciones
  useEffect(() => {
    const inicializar = async () => {
      const session = getSession();

      // Estudiantes/acudientes no entran. Profesores y demás internos sí.
      if (!session.id || isEstudiante() || isPadreDeFamilia()) {
        navigate("/");
        return;
      }

      setProfesorNombres(session.nombres || "");
      setProfesorApellidos(session.apellidos || "");
      setProfesorCargo(session.cargo || "Profesor(a)");

      try {
        // id_profesor de Calendario Actividades = la CÉDULA del profesor (Usuarios.id),
        // igual que Notas/Grupos/Logros. Consultamos solo para validar que existe.
        const { data: profesor, error: profesorError } = await supabase
          .from('Usuarios')
          .select('id')
          .eq('id', String(session.id))
          .single();

        if (profesorError || !profesor) {
          toast({ title: "Error", description: "No se pudo obtener tu información", variant: "destructive" });
          navigate('/dashboard');
          return;
        }

        setProfesorIdReal(String(profesor.id));

        // Modo general (no-profesor): sin asignación; la asignatura es fija "General".
        if (modoGeneral) {
          setAsignaturaSeleccionada("General");
          setLoadingAsignaciones(false);
          return;
        }

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

  // Carga TODAS las actividades que ha dejado este profesor (para el calendario).
  const cargarMisActividades = async () => {
    if (!profesorIdReal) return;
    setLoadingMias(true);
    try {
      const { data } = await supabase
        .from('Calendario Actividades')
        .select('*')
        .eq('id_profesor', profesorIdReal)
        .order('fecha_de_presentacion', { ascending: true });
      setMisActividades((data || []) as ActividadCalendario[]);
    } catch (e) {
      console.error('Error cargando mis actividades:', e);
    } finally {
      setLoadingMias(false);
    }
  };

  useEffect(() => {
    if (profesorIdReal) cargarMisActividades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesorIdReal]);

  // ===== Programar tab: cascade grados/salones =====
  useEffect(() => {
    // Modo general: los grados salen de la estructura del colegio (no de asignación).
    if (modoGeneral) { setGrados([...gradosColegio].sort((a, b) => rankGrado(a) - rankGrado(b))); return; }
    if (!asignaturaSeleccionada) { setGrados([]); return; }
    const filtradas = asignaciones.filter(a => ((a['Asignatura(s)'] || []).flat() as string[]).includes(asignaturaSeleccionada));
    const todos = filtradas.flatMap(a => a['Grado(s)'] || []).flat() as string[];
    setGrados([...new Set(todos)].sort((a, b) => rankGrado(a) - rankGrado(b)));
  }, [asignaturaSeleccionada, asignaciones, modoGeneral, gradosColegio]);

  useEffect(() => {
    // Modo general: salones reales del grado, desde Estudiantes del colegio.
    if (modoGeneral) {
      if (!gradoSeleccionado) { setSalones([]); return; }
      (async () => {
        const { data } = await supabase.from('Estudiantes').select('salon').eq('grado', gradoSeleccionado);
        const set = new Set<string>();
        for (const r of (data || []) as { salon: string | null }[]) if (r.salon) set.add(String(r.salon));
        setSalones([...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })));
      })();
      return;
    }
    if (!asignaturaSeleccionada || !gradoSeleccionado) { setSalones([]); return; }
    const filtradas = asignaciones.filter(a => {
      const asigs = (a['Asignatura(s)'] || []).flat() as string[];
      const grads = (a['Grado(s)'] || []).flat() as string[];
      return asigs.includes(asignaturaSeleccionada) && grads.includes(gradoSeleccionado);
    });
    const todos = filtradas.flatMap(a => a['Salon(es)'] || []).flat() as string[];
    setSalones([...new Set(todos)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })));
  }, [gradoSeleccionado, asignaturaSeleccionada, asignaciones, modoGeneral]);

  // #25: cargar estudiantes de los salones seleccionados cuando se dirige a específicos.
  useEffect(() => {
    if (!destinoEspecifico || !gradoSeleccionado || salonesSeleccionados.length === 0) { setEstudiantesAula([]); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase.from("Estudiantes").select("id, salon").eq("grado", gradoSeleccionado).in("salon", salonesSeleccionados);
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const en = sortByApellidosNombres(await enrichWithNombres((data || []) as any));
      if (cancel) return;
      setEstudiantesAula(en.map((e: any) => ({ id: String(e.id), nombre: `${e.apellidos || ""} ${e.nombres || ""}`.trim(), salon: String(e.salon) })));
    })();
    return () => { cancel = true; };
  }, [destinoEspecifico, gradoSeleccionado, salonesSeleccionados]);

  // ===== Actividades tab: cascade grados/salones =====
  useEffect(() => {
    if (!actAsignatura) { setActGrados([]); return; }
    const filtradas = asignaciones.filter(a => ((a['Asignatura(s)'] || []).flat() as string[]).includes(actAsignatura));
    const todos = filtradas.flatMap(a => a['Grado(s)'] || []).flat() as string[];
    setActGrados([...new Set(todos)].sort((a, b) => rankGrado(a) - rankGrado(b)));
  }, [actAsignatura, asignaciones]);

  useEffect(() => {
    if (!actAsignatura || !actGrado) { setActSalones([]); return; }
    const filtradas = asignaciones.filter(a => {
      const asigs = (a['Asignatura(s)'] || []).flat() as string[];
      const grads = (a['Grado(s)'] || []).flat() as string[];
      return asigs.includes(actAsignatura) && grads.includes(actGrado);
    });
    const todos = filtradas.flatMap(a => a['Salon(es)'] || []).flat() as string[];
    setActSalones([...new Set(todos)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })));
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
    setSalonesSeleccionados([]);
    setTipoSeleccionado("");
    setDescripcion("");
    setFechaSeleccionada(undefined);
    setArchivosSeleccionados([]);
  };

  const handleGradoChange = (value: string) => {
    setGradoSeleccionado(value);
    setSalonesSeleccionados([]);
    setTipoSeleccionado("");
    setDescripcion("");
    setFechaSeleccionada(undefined);
    setArchivosSeleccionados([]);
  };

  // Marcar/desmarcar un salón (multi-selección). Cambiar los salones NO resetea
  // tipo/descripcion/archivos/fecha.
  const toggleSalon = (value: string) => {
    setSalonesSeleccionados((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
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

  const limpiarFormulario = () => {
    setAsignaturaSeleccionada("");
    setGradoSeleccionado("");
    setSalonesSeleccionados([]);
    setTipoSeleccionado("");
    setDescripcion("");
    setFechaSeleccionada(undefined);
    setArchivosSeleccionados([]);
    setDestinoEspecifico(false);
    setEstudiantesDestino([]);
    setEstudiantesAula([]);
  };

  const handleProgramar = async () => {
    if (salonesSeleccionados.length === 0) {
      toast({ title: "Error", description: "Selecciona al menos un salón", variant: "destructive" });
      return;
    }
    if (destinoEspecifico && estudiantesDestino.length === 0) {
      toast({ title: "Error", description: "Selecciona al menos un estudiante, o elige \"Todo el salón\".", variant: "destructive" });
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

    // Antiduplicado: si YA existe una actividad EXACTAMENTE igual (mismo
    // profesor, asignatura, grado, salón, fecha y descripción letra por letra;
    // los adjuntos NO cuentan), avisamos antes de reenviarla a todo el salón.
    const descripcionCmp = (tipoSeleccionado && tipoSeleccionado !== "Otro")
      ? `${tipoSeleccionado}: ${descripcion.trim()}`
      : descripcion.trim();
    const fechaCmp = formatearFecha(fechaSeleccionada!);

    setGuardando(true);
    try {
      const salonesConDuplicado: string[] = [];
      for (const salon of salonesSeleccionados) {
        // Mismo criterio de omisión que el envío real (#25).
        const idsEsteSalon = destinoEspecifico
          ? estudiantesDestino.filter(id => estudiantesAula.find(e => e.id === id)?.salon === salon)
          : [];
        if (destinoEspecifico && idsEsteSalon.length === 0) continue;

        const { data: existentes } = await supabase
          .from('Calendario Actividades')
          .select('estudiantes_ids')
          .eq('id_profesor', profesorIdReal)
          .eq('Asignatura', asignaturaSeleccionada)
          .eq('Grado', gradoSeleccionado)
          .eq('Salon', salon)
          .eq('Descripción', descripcionCmp)
          .eq('fecha_de_presentacion', fechaCmp);

        // El destino (todo el salón vs. estudiantes puntuales) también debe ser
        // idéntico para considerarla "la misma actividad".
        const idsDestino = destinoEspecifico ? idsEsteSalon.map(Number).sort((a, b) => a - b) : null;
        const hayIgual = (existentes || []).some((row: { estudiantes_ids: number[] | null }) => {
          const rowIds = row.estudiantes_ids;
          if (idsDestino === null) return rowIds == null; // ambos = todo el salón
          if (!Array.isArray(rowIds)) return false;
          const a = rowIds.map(Number).sort((x, y) => x - y);
          return a.length === idsDestino.length && a.every((v, i) => v === idsDestino[i]);
        });
        if (hayIgual) salonesConDuplicado.push(salon);
      }

      if (salonesConDuplicado.length > 0) {
        setDupSalones(salonesConDuplicado);
        setDupDialogOpen(true);
        return; // esperamos la decisión del profesor en el aviso
      }
    } catch (e) {
      // Si la verificación falla, NO bloqueamos: se programa normalmente.
      console.warn('No se pudo verificar duplicados:', e);
    } finally {
      setGuardando(false);
    }

    await ejecutarProgramacion();
  };

  /**
   * Ejecuta la programación real (subir archivos + crear en cada salón +
   * notificar a estudiantes y acudientes). Se llama directo cuando no hay
   * duplicado, o desde el aviso cuando el profesor confirma "Programar de nuevo".
   */
  const ejecutarProgramacion = async () => {
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

      // Programar la MISMA actividad en CADA salón seleccionado y notificar a
      // estudiantes y padres de cada uno (los archivos ya se subieron una vez).
      const salonesAProgramar = [...salonesSeleccionados];
      const exitosos: string[] = [];
      const fallidos: string[] = [];

      for (const salon of salonesAProgramar) {
        // #25: si va a estudiantes específicos, solo los de ESTE salón.
        const idsEsteSalon = destinoEspecifico
          ? estudiantesDestino.filter(id => estudiantesAula.find(e => e.id === id)?.salon === salon)
          : [];
        // Salón marcado pero sin estudiantes elegidos en modo específico: se omite.
        if (destinoEspecifico && idsEsteSalon.length === 0) continue;

        const insertData: Record<string, unknown> = {
          id_profesor: profesorIdReal,
          Nombres: profesorNombres,
          Apellidos: profesorApellidos,
          Asignatura: asignaturaSeleccionada,
          Grado: gradoSeleccionado,
          Salon: salon,
          Descripción: descripcionFinal,
          fecha_de_presentacion: fechaFormateada,
          estudiantes_ids: destinoEspecifico ? idsEsteSalon.map(Number) : null,
        };
        if (archivoUrlFinal) {
          insertData.archivo_url = archivoUrlFinal;
        }

        const { error } = await supabase
          .from('Calendario Actividades')
          .insert(insertData);

        if (error) {
          console.error(`Error creando actividad (salón ${salon}):`, error);
          fallidos.push(salon);
          continue;
        }
        exitosos.push(salon);

        // Notificación a estudiantes y padres de ESE salón.
        try {
          await apiRequest('/api/notificaciones/actividad-programada', {
            method: 'POST',
            body: JSON.stringify({
              profesor_nombre: `${profesorNombres} ${profesorApellidos}`.trim(),
              profesor_cargo: profesorCargo,
              grado: gradoSeleccionado,
              salon,
              asignatura: asignaturaSeleccionada,
              descripcion: descripcionFinal,
              fecha: mostrarFecha(fechaFormateada),
              ...(archivoUrlFinal ? { archivo_url: archivoUrlFinal } : {}),
              ...(destinoEspecifico ? { estudiantes_ids: idsEsteSalon } : {}),
            }),
          });
        } catch (err) {
          console.error(`Error enviando notificación (salón ${salon}):`, err);
        }
      }

      // Incrementar el contador por cada actividad creada con éxito.
      if (exitosos.length > 0) {
        try {
          const { data: uso } = await supabase
            .from('Uso_Profesores')
            .select('actividades_programadas')
            .eq('profesor_id', profesorIdReal)
            .maybeSingle();

          if (uso) {
            await supabase.from('Uso_Profesores')
              .update({ actividades_programadas: (uso.actividades_programadas || 0) + exitosos.length })
              .eq('profesor_id', profesorIdReal);
          } else {
            await supabase.from('Uso_Profesores')
              .insert({ profesor_id: profesorIdReal, actividades_programadas: exitosos.length });
          }
        } catch (e) {
          console.error('Error incrementando contador:', e);
        }
      }

      // Refrescar la lista de actividades programadas.
      try {
        await cargarActividades();
      await cargarMisActividades();
      } catch (e) {
        console.warn('No se pudo refrescar la lista de actividades:', e);
      }

      if (exitosos.length === 0) {
        toast({ title: "Error", description: "No se pudo programar la actividad en ningún salón.", variant: "destructive" });
      } else if (fallidos.length === 0) {
        toast({
          variant: "success" as any,
          title: "Actividad programada",
          description: exitosos.length === 1
            ? "La actividad quedó programada y se está notificando a estudiantes y acudientes."
            : `La actividad quedó programada en ${exitosos.length} salones (${exitosos.join(', ')}) y se está notificando a estudiantes y acudientes.`,
        });
      } else {
        toast({
          title: "Programada parcialmente",
          description: `Se programó en: ${exitosos.join(', ')}. Falló en: ${fallidos.join(', ')}. Intenta de nuevo esos.`,
          variant: "destructive",
        });
      }
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
      await cargarMisActividades();
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
      await cargarMisActividades();
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
      salon: salonesSeleccionados[0] || "",
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
      salon: salonesSeleccionados[0] || "",
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
            {vista === "menu" ? (
              <span className="text-foreground font-medium">Programar Actividad</span>
            ) : (
              <>
                <button onClick={() => irA("menu")} className="text-primary hover:underline">Programar Actividad</button>
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground font-medium">{vista === "programar" ? "Nueva actividad" : "Actividades Programadas"}</span>
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl mx-auto mb-6 text-center">Programa las tareas, evaluaciones, exposiciones y demás actividades académicas de tus estudiantes.</p>

        <div className="max-w-5xl mx-auto">
          {/* Menú de entrada: dos botones grandes (los profes no veían la pestaña). */}
          {vista === "menu" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
              <button
                onClick={() => irA("programar")}
                data-guia="actividades.menu_nueva"
                className="bg-card rounded-lg shadow-soft p-8 flex flex-col items-center justify-center gap-3 text-center transition-all hover:shadow-md hover:bg-cyan-50 border-2 border-transparent hover:border-cyan-200"
              >
                <Pencil className="h-10 w-10 text-cyan-600" />
                <span className="text-lg font-bold text-foreground">Nueva actividad</span>
                <span className="text-sm text-muted-foreground">Crea una nueva tarea, evaluación, taller…</span>
              </button>
              <button
                onClick={() => irA("actividades")}
                className="bg-card rounded-lg shadow-soft p-8 flex flex-col items-center justify-center gap-3 text-center transition-all hover:shadow-md hover:bg-emerald-50 border-2 border-transparent hover:border-emerald-200"
              >
                <Calendar className="h-10 w-10 text-emerald-600" />
                <span className="text-lg font-bold text-foreground">Actividades Programadas</span>
                <span className="text-sm text-muted-foreground">Mira el calendario de lo que ya dejaste</span>
              </button>
            </div>
          )}

          {/* ===== Programar Actividad ===== */}
          {vista === "programar" && (
            <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 space-y-5 max-w-3xl mx-auto">
              {loadingAsignaciones ? (
                <div className="text-center text-muted-foreground py-8">Cargando...</div>
              ) : (!modoGeneral && asignaturas.length === 0) ? (
                <div className="text-center text-muted-foreground py-8">No tienes asignaturas asignadas</div>
              ) : (
                <>
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={limpiarFormulario}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-input bg-background rounded-md hover:bg-muted transition-colors"
                      title="Limpiar todos los campos"
                    >
                      <RotateCcw className="w-4 h-4" /> Limpiar
                    </button>
                  </div>

                  {/* 1. Asignatura — solo profesores; los demás internos programan actividad General */}
                  {!modoGeneral && (
                    <div className="space-y-2">
                      <Label>Asignatura</Label>
                      <ResponsiveSelect
                        value={asignaturaSeleccionada}
                        onValueChange={handleAsignaturaChange}
                        placeholder="Seleccionar asignatura"
                        dataGuia="actividades.select_asignatura"
                        options={asignaturas.map((a) => ({ value: a, label: a }))}
                      />
                    </div>
                  )}
                  {modoGeneral && (
                    <p className="text-sm text-muted-foreground">Actividad <span className="font-semibold text-foreground">General</span> (institucional). Elige el grado y salón(es).</p>
                  )}

                  {/* 2. Grado */}
                  {asignaturaSeleccionada && (
                    <div className="space-y-2">
                      <Label>Grado</Label>
                      <ResponsiveSelect
                        value={gradoSeleccionado}
                        onValueChange={handleGradoChange}
                        placeholder="Seleccionar grado"
                        dataGuia="actividades.select_grado"
                        options={grados.map((g) => ({ value: g, label: g }))}
                      />
                    </div>
                  )}

                  {/* All remaining fields appear once grado is selected */}
                  {gradoSeleccionado && (
                    <>
                      {/* 3. Salón(es) — multi-selección con casillas para programar
                          la misma actividad en varios salones a la vez. */}
                      <div className="space-y-2">
                        <Label data-guia="actividades.check_salon">Salón(es)</Label>
                        <div className="flex flex-wrap gap-2">
                          {salones.map((s) => {
                            const marcado = salonesSeleccionados.includes(s);
                            return (
                              <label
                                key={s}
                                className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer select-none transition-colors ${
                                  marcado
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border bg-background hover:bg-muted/40 text-muted-foreground"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={marcado}
                                  onChange={() => toggleSalon(s)}
                                  className="w-4 h-4 accent-green-500 cursor-pointer"
                                />
                                <span className="text-sm">{s}</span>
                              </label>
                            );
                          })}
                        </div>
                        {salonesSeleccionados.length > 1 && (
                          <p className="text-xs text-muted-foreground">
                            Se programará en {salonesSeleccionados.length} salones: {salonesSeleccionados.join(", ")}.
                          </p>
                        )}
                      </div>

                      {/* #25: ¿Para todo el salón o estudiantes específicos? */}
                      {salonesSeleccionados.length > 0 && (
                        <div className="space-y-2">
                          <Label>¿Para quién?</Label>
                          <div className="flex gap-2 flex-wrap">
                            <button type="button" onClick={() => { setDestinoEspecifico(false); setEstudiantesDestino([]); }}
                              className={`px-3 py-2 rounded-md border text-sm cursor-pointer ${!destinoEspecifico ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted/40"}`}>
                              Todo el salón
                            </button>
                            <button type="button" onClick={() => setDestinoEspecifico(true)}
                              className={`px-3 py-2 rounded-md border text-sm cursor-pointer ${destinoEspecifico ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted/40"}`}>
                              Estudiantes específicos
                            </button>
                          </div>
                          {destinoEspecifico && (
                            <div className="border border-border rounded-md overflow-hidden">
                              <div className="relative border-b border-border bg-background">
                                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  value={busquedaEst}
                                  onChange={(e) => setBusquedaEst(e.target.value)}
                                  placeholder="Buscar estudiante…"
                                  className="w-full pl-8 pr-3 py-2 text-sm bg-background outline-none"
                                />
                              </div>
                              <div className="p-2 max-h-56 overflow-y-auto space-y-1">
                                {estudiantesAula.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Cargando estudiantes…</p>
                                ) : (() => {
                                  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
                                  const q = norm(busquedaEst.trim());
                                  const lista = q ? estudiantesAula.filter(e => norm(e.nombre).includes(q)) : estudiantesAula;
                                  if (lista.length === 0) return <p className="text-xs text-muted-foreground px-2 py-1">Sin coincidencias.</p>;
                                  return lista.map((e) => {
                                    const marcado = estudiantesDestino.includes(e.id);
                                    return (
                                      <label key={e.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer text-sm">
                                        <input type="checkbox" checked={marcado}
                                          onChange={() => setEstudiantesDestino(prev => marcado ? prev.filter(x => x !== e.id) : [...prev, e.id])}
                                          className="w-4 h-4 accent-green-500 cursor-pointer" />
                                        <span>{e.nombre}{salonesSeleccionados.length > 1 ? ` · Salón ${e.salon}` : ""}</span>
                                      </label>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}
                          {destinoEspecifico && estudiantesDestino.length > 0 && (
                            <p className="text-xs text-muted-foreground">Solo le aparecerá a {estudiantesDestino.length} estudiante(s) y sus acudientes.</p>
                          )}
                        </div>
                      )}

                      {/* 4. Tipo (opcional) — solo profesores; los internos no eligen tipo */}
                      {!modoGeneral && (
                        <div className="space-y-2">
                          <Label>Tipo de actividad (opcional)</Label>
                          <ResponsiveSelect
                            value={tipoSeleccionado}
                            onValueChange={setTipoSeleccionado}
                            placeholder="Sin tipo específico"
                            dataGuia="actividades.select_tipo"
                            options={TIPOS_ACTIVIDAD.map((t) => ({ value: t, label: t }))}
                          />
                        </div>
                      )}

                      {/* 5. Descripción */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="descripcion">Descripción</Label>
                          <CharCircle value={usedChars} max={personalMax} />
                        </div>
                        <Textarea
                          id="descripcion"
                          data-guia="actividades.input_descripcion"
                          placeholder="Ej: Resolver ejercicios de la página 45"
                          value={descripcion}
                          onChange={(e) => setDescripcion(e.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>

                      {/* 6. Archivos adjuntos */}
                      <div className="space-y-2">
                        <Label data-guia="actividades.input_archivo">Archivos adjuntos (opcional)</Label>
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
                            <Button data-guia="actividades.select_fecha" variant="outline" className={cn("w-full justify-start text-left font-normal", !fechaSeleccionada && "text-muted-foreground")}>
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
                        data-guia="actividades.btn_programar"
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
                        disabled={guardando || salonesSeleccionados.length === 0 || !descripcion.trim() || !fechaSeleccionada}
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
          )}

          {/* ===== Actividades Programadas ===== */}
          {vista === "actividades" && (
            <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 space-y-5">
              {loadingAsignaciones ? (
                <div className="text-center text-muted-foreground py-8">Cargando...</div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">Tu calendario de actividades: toca un día para ver lo que dejaste. Incluye las pendientes y el historial de las que ya pasaron.</p>
                  {(() => {
                    // Opciones de filtro derivadas de TODAS las actividades del profe.
                    const opcAsig = [...new Set(misActividades.map((a) => a.Asignatura).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
                    const opcGrado = [...new Set(misActividades.map((a) => a.Grado).filter(Boolean))].sort((a, b) => rankGrado(a) - rankGrado(b));
                    const opcSalon = [...new Set(misActividades.map((a) => a.Salon).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                        <ResponsiveSelect value={filtroAsig} onValueChange={setFiltroAsig} placeholder="Asignatura" options={[{ value: "todas", label: "Todas las asignaturas" }, ...opcAsig.map((a) => ({ value: a, label: a }))]} />
                        <ResponsiveSelect value={filtroGrado} onValueChange={setFiltroGrado} placeholder="Grado" options={[{ value: "todos", label: "Todos los grados" }, ...opcGrado.map((g) => ({ value: g, label: g }))]} />
                        <ResponsiveSelect value={filtroSalon} onValueChange={setFiltroSalon} placeholder="Salón" options={[{ value: "todos", label: "Todos los salones" }, ...opcSalon.map((s) => ({ value: s, label: `Salón ${s}` }))]} />
                        <Input value={busquedaAct} onChange={(e) => setBusquedaAct(e.target.value)} placeholder="Buscar por descripción…" />
                      </div>
                    );
                  })()}
                  {(() => {
                    const fechaKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
                    const q = norm(busquedaAct.trim());
                    const actividadesFiltradas = misActividades.filter((a) =>
                      (filtroAsig === "todas" || a.Asignatura === filtroAsig) &&
                      (filtroGrado === "todos" || a.Grado === filtroGrado) &&
                      (filtroSalon === "todos" || a.Salon === filtroSalon) &&
                      (!q || norm(a.Descripción).includes(q))
                    );
                    const porFecha: Record<string, ActividadCalendario[]> = {};
                    for (const a of actividadesFiltradas) {
                      const f = parsearFecha(a.fecha_de_presentacion);
                      if (!f) continue;
                      const k = fechaKey(f);
                      (porFecha[k] ||= []).push(a);
                    }
                    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
                    const diasPasados: Date[] = [];
                    const diasProximos: Date[] = [];
                    for (const k of Object.keys(porFecha)) {
                      const [yy, mm, dd] = k.split("-").map(Number);
                      const d = new Date(yy, mm - 1, dd);
                      (d < hoy ? diasPasados : diasProximos).push(d);
                    }
                    const delDia = diaSelCal ? (porFecha[fechaKey(diaSelCal)] || []).slice().sort((a, b) => a.Asignatura.localeCompare(b.Asignatura, 'es') || rankGrado(a.Grado) - rankGrado(b.Grado) || Number(a.Salon) - Number(b.Salon)) : [];
                    const pasado = diaSelCal ? new Date(diaSelCal.getFullYear(), diaSelCal.getMonth(), diaSelCal.getDate()) < hoy : false;
                    return (
                      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                        <div className="flex flex-col items-center lg:sticky lg:top-4 shrink-0">
                          <CalendarComponent
                            mode="single"
                            selected={diaSelCal}
                            onSelect={setDiaSelCal}
                            month={mesCal}
                            onMonthChange={setMesCal}
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
                        <div className="flex-1 min-w-0 lg:max-h-[420px] lg:overflow-y-auto">
                          {diaSelCal && delDia.length > 0 ? (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 flex-wrap">
                                  {diaSelCal.toLocaleDateString("es-CO", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${pasado ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-700"}`}>{pasado ? "Ya pasó" : "Pendiente"}</span>
                                </h3>
                                <button onClick={() => setDiaSelCal(undefined)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                              </div>
                              <p className="text-sm text-muted-foreground mb-4">{delDia.length} actividad{delDia.length > 1 ? 'es' : ''}</p>
                              <div className="space-y-3">
                                {delDia.map((actividad) => (
                                  <div key={actividad.column_id} className="border border-border rounded-lg p-4">
                                    <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full mb-2">{actividad.Asignatura} · {actividad.Grado} {actividad.Salon}</span>
                                    <p className="font-medium text-foreground">{actividad.Descripción}</p>
                                    {actividad.archivo_url && actividad.archivo_url.split('\n').filter(Boolean).map((url, i) => (
                                      <div key={i} className="mt-2 space-y-1">
                                        <div className="flex items-center gap-1.5">
                                          <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                                          <span className="text-sm text-foreground truncate">{getCleanFilename(url)}</span>
                                        </div>
                                        <div className="flex gap-2">
                                          <button onClick={() => handleVerArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5"><Eye className="h-4 w-4" /> Ver</button>
                                          <button onClick={() => handleDescargarArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1.5"><Download className="h-4 w-4" /> Descargar</button>
                                        </div>
                                      </div>
                                    ))}
                                    <div className="flex gap-2 mt-3">
                                      <Button variant="outline" size="sm" onClick={() => handleAbrirEditar(actividad)} className="gap-1"><Pencil className="h-4 w-4" /> Editar</Button>
                                      <Button variant="destructive" size="sm" onClick={() => handleConfirmarEliminar(actividad)} className="gap-1"><Trash2 className="h-4 w-4" /> Eliminar</Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : diaSelCal ? (
                            <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground"><Calendar className="h-10 w-10 mb-2 opacity-50" /><p>No dejaste actividades este día</p></div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground"><Calendar className="h-10 w-10 mb-2 opacity-50" /><p>Selecciona un día para ver tus actividades</p>{misActividades.length === 0 && <p className="text-sm mt-1">Aún no has programado actividades</p>}</div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </div>
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

      {/* Aviso: ya existe una actividad EXACTAMENTE igual programada */}
      <AlertDialog open={dupDialogOpen} onOpenChange={setDupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Actividad duplicada</AlertDialogTitle>
            <AlertDialogDescription>
              Ya tienes programada esta misma actividad (misma descripción, asignatura, grado, salón y fecha)
              {dupSalones.length === 1
                ? ` en ${gradoSeleccionado} ${dupSalones[0]}`
                : ` en ${gradoSeleccionado}: salones ${dupSalones.join(', ')}`}.
              <br />
              Si continúas, se enviará otra vez la notificación a los estudiantes y acudientes. ¿Deseas programarla de nuevo de todos modos?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDupDialogOpen(false); ejecutarProgramacion(); }}>
              Programar de nuevo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProgramarActividad;
