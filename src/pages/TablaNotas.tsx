import { getPeriodoActual } from "@/utils/periodoActual";
import { anoEscolarActual } from "@/utils/anoEscolar";
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Plus, MoreVertical, Pencil, Trash2, Send, Calendar, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { getSession, isAdmin } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { useGruposNotas, type GrupoNotas } from "@/hooks/useGruposNotas";
import { promedioGeneral, esPeriodoCompleto, promedioDeGrupo, type NotaCalc, type GrupoCalc } from "@/lib/gradeCalculator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
// El escudo y nombre del colegio se obtienen dinámicamente desde la sesión
// (colegio_logo_url / colegio_nombre) para que cada colegio muestre el suyo
// en PDFs/Excels exportados.
import NotaCelda from "@/components/notas/NotaCelda";
import FinalPeriodoCelda from "@/components/notas/FinalPeriodoCelda";
import ComentarioModal from "@/components/notas/ComentarioModal";
import NotificacionModal, { TipoNotificacion } from "@/components/notas/NotificacionModal";
import { apiRequest, apiClient } from "@/lib/apiClient";
import { useColegioConfig } from "@/hooks/useColegioConfig";

// Notificación de notas migrada al server (multi-tenant via JWT).
// Antes apuntaba a https://n8n.notasnormi.com/webhook/notificar-notas.

interface Estudiante {
  id: string;
  apellidos: string;
  nombres: string;
}

interface Actividad {
  id: string;
  periodo: number;
  nombre: string;
  porcentaje: number | null;
  grupo_id?: string | null;
}

// Estructura: { [id_estudiantil]: { [periodo]: { [actividad_id]: nota } } }
type NotasEstudiantes = {
  [idEstudiantil: string]: {
    [periodo: number]: {
      [actividadId: string]: number;
    };
  };
};

// Estructura para comentarios: { [id_estudiantil]: { [periodo]: { [actividad_id]: comentario } } }
type ComentariosEstudiantes = {
  [idEstudiantil: string]: {
    [periodo: number]: {
      [actividadId: string]: string | null;
    };
  };
};

interface CeldaEditando {
  idEstudiantil: string;
  actividadId: string;
  periodo: number;
}

interface ComentarioEditando {
  idEstudiantil: string;
  nombreEstudiante: string;
  actividadId: string;
  nombreActividad: string;
  periodo: number;
}

/**
 * Botón "+ Agregar" con comportamiento dual:
 *  - Click rápido (release antes de HOLD_MS) → ejecuta `onActividad`.
 *  - Mantener presionado >= HOLD_MS         → ejecuta `onGrupo`.
 * Muestra una barra de progreso mientras se está presionando.
 */
const BotonAgregarConLongPress = ({
  onActividad,
  onGrupo,
  disabled,
  label,
  compact,
  title,
}: {
  onActividad: () => void;
  onGrupo: () => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
  title?: string;
}) => {
  const HOLD_MS = 1200;
  const [pressing, setPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const triggeredGrupoRef = useRef(false);

  const cleanup = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPressing(false);
    setProgress(0);
  };

  const start = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    triggeredGrupoRef.current = false;
    setPressing(true);
    setProgress(0);
    const startTime = Date.now();
    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const p = Math.min(100, (elapsed / HOLD_MS) * 100);
      setProgress(p);
      if (p >= 100 && !triggeredGrupoRef.current) {
        triggeredGrupoRef.current = true;
        cleanup();
        onGrupo();
      }
    }, 30);
  };

  const end = () => {
    if (!triggeredGrupoRef.current && intervalRef.current) {
      cleanup();
      onActividad();
    } else {
      cleanup();
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={cleanup}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative ${compact ? 'h-6 px-1.5 text-[10px]' : 'h-8 px-2 text-xs'} rounded-md bg-green-100 hover:bg-green-200 text-green-800 border border-green-300 inline-flex items-center justify-center gap-1 overflow-hidden select-none w-full transition-colors disabled:opacity-50`}
      title={title || 'Click rápido: nueva actividad. Mantener presionado: nuevo grupo'}
    >
      {pressing && (
        <span
          className="absolute inset-y-0 left-0 bg-emerald-500/40 transition-[width]"
          style={{ width: `${progress}%` }}
        />
      )}
      <Plus className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} relative shrink-0`} />
      {/* Durante el long-press el texto cambia a "Creando grupo…" pero se
          encoge un poco (text-[10px]) para que quepa dentro del ancho actual
          del botón sin ensancharlo. Cuando el botón ya es grande (porque hay
          muchas columnas) el cambio es imperceptible. */}
      <span
        className={`relative font-medium whitespace-nowrap ${
          pressing && progress > 25 ? 'text-[10px]' : ''
        }`}
      >
        {pressing && progress > 25 ? 'Creando grupo…' : (label || 'Agregar')}
      </span>
    </button>
  );
};

const TablaNotas = ({ soloLectura = false }: { soloLectura?: boolean } = {}) => {
  const navigate = useNavigate();
  const { config: colegioConfig } = useColegioConfig();
  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState("");
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [notas, setNotas] = useState<NotasEstudiantes>({});
  const [comentarios, setComentarios] = useState<ComentariosEstudiantes>({});
  // Nombres de TODOS los profesores que dan esta asignatura+grado+salon
  // (formato: "Nombre1 Apellidos1, Nombre2 Apellidos2", orden alfabético).
  // Se usa en el header del PDF descargado.
  const [nombresProfesores, setNombresProfesores] = useState<string>("");
  
  // Estado para período activo (pestañas)
  const [periodoActivo, setPeriodoActivo] = useState<number>(getPeriodoActual());
  // Flujo nuevo: tras elegir el salón, el usuario escoge un periodo (?periodo=N
  // en la URL). Si no hay `periodo` en la URL → se muestra el SELECTOR de
  // periodos. El periodo elegido se refleja en el breadcrumb. Las pestañas
  // siguen disponibles para saltar rápido entre periodos (cambian el ?periodo).
  const [searchParams, setSearchParams] = useSearchParams();
  const periodoParam = searchParams.get('periodo');
  const hayPeriodoElegido = periodoParam !== null && periodoParam !== '';
  useEffect(() => {
    if (!hayPeriodoElegido) return;
    const n = Number(periodoParam);
    if (!Number.isNaN(n) && n >= 0 && n <= 4) setPeriodoActivo(n);
  }, [periodoParam, hayPeriodoElegido]);
  const irAPeriodo = (n: number) => {
    const sp = new URLSearchParams(searchParams);
    sp.set('periodo', String(n));
    setSearchParams(sp);
  };
  const volverASelectorPeriodo = () => {
    const sp = new URLSearchParams(searchParams);
    sp.delete('periodo');
    setSearchParams(sp);
  };
  
  // Modal state para crear/editar actividad
  const [modalOpen, setModalOpen] = useState(false);
  const [periodoActual, setPeriodoActual] = useState<number>(getPeriodoActual());
  const [nombreActividad, setNombreActividad] = useState("");
  const [porcentajeActividad, setPorcentajeActividad] = useState("");
  const [actividadEditando, setActividadEditando] = useState<Actividad | null>(null);

  // Sistema jerárquico (Grupos_Notas).
  const [confirmarVolverPlano, setConfirmarVolverPlano] = useState(false);
  // Tick para forzar re-render cuando cambia el flag local de "periodo completo".
  const [modoIntentTick, setModoIntentTick] = useState(0);
  // Marca "periodo completo" por periodo (persistida en BD: tabla Periodos_Completos).
  const [periodosCompletos, setPeriodosCompletos] = useState<Record<number, boolean>>({});
  // Modal "+ Agregar" tiene dos tipos cuando el periodo está en modo Grupos
  const [tipoNuevoItem, setTipoNuevoItem] = useState<'actividad' | 'grupo'>('actividad');
  const [grupoPadrePara, setGrupoPadrePara] = useState<string | null>(null); // si se crea subgrupo
  // Replicación al crear un grupo top: a otros periodos y/o a otros salones del profe
  const [replicarGrupoOtrosPeriodos, setReplicarGrupoOtrosPeriodos] = useState(false);
  const [replicarGrupoOtrosSalones, setReplicarGrupoOtrosSalones] = useState(false);
  const aulaSalon = (asignaturaSeleccionada && gradoSeleccionado && salonSeleccionado)
    ? { asignatura: asignaturaSeleccionada, grado: gradoSeleccionado, salon: salonSeleccionado, ano_escolar: anoEscolarActual() }
    : null;
  const { grupos: gruposNotas, reload: reloadGrupos } = useGruposNotas(aulaSalon);
  // Aula con periodo actual (para pasar al editor; se replica solo este periodo
  // como base cuando el profesor crea grupos nuevos, y permite "replicar a otros").
  const aulaActual = aulaSalon ? { ...aulaSalon, periodo: periodoActual } : null;
  // Grupos del periodo activo (para mostrar en el editor y en el contador del botón)
  const gruposPeriodoActual = gruposNotas.filter(g => g.periodo === periodoActual);
  // Modo "ver promedios": agrega una columna "Prom" por cada grupo/subgrupo con el
  // promedio simple de sus actividades, por estudiante (para transcribir a otra plataforma).
  const [verPromedios, setVerPromedios] = useState(false);
  // Modal de "notificar actividades pendientes" (sin nota). actividad=null → todas.
  const [pendientesModal, setPendientesModal] = useState<null | { actividad: string | null; periodo: number; descripcion: string }>(null);
  // Grupo asignado a la actividad que se está creando/editando (null = modo plano).
  const [grupoActividadId, setGrupoActividadId] = useState<string | null>(null);
  // true cuando la actividad se crea desde el "+ Actividad" de un grupo
  // específico (el grupo destino ya está fijo, no se muestra selector).
  const [grupoActividadFijo, setGrupoActividadFijo] = useState(false);

  // Estado para crear actividad en múltiples salones
  const [otrosSalones, setOtrosSalones] = useState<string[]>([]);
  const [crearParaTodosSalones, setCrearParaTodosSalones] = useState(false);
  const [guardandoMultiple, setGuardandoMultiple] = useState(false);
  const [eliminarEnTodosSalones, setEliminarEnTodosSalones] = useState(false);
  const [salonesConActividad, setSalonesConActividad] = useState<string[]>([]);

  // Estado para descargas
  const [descargandoPDF, setDescargandoPDF] = useState(false);
  const [descargandoExcel, setDescargandoExcel] = useState(false);
  // Modal state para confirmar eliminación
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actividadAEliminar, setActividadAEliminar] = useState<Actividad | null>(null);
  
  // Modal state para comentarios
  const [comentarioModalOpen, setComentarioModalOpen] = useState(false);
  const [comentarioEditando, setComentarioEditando] = useState<ComentarioEditando | null>(null);
  
  // Modal state para notificaciones
  const [notificacionModalOpen, setNotificacionModalOpen] = useState(false);
  const [notificacionPendiente, setNotificacionPendiente] = useState<{
    tipo: TipoNotificacion;
    descripcion: string;
    nombreEstudiante?: string;
    datos: any[];
  } | null>(null);
  
  // Estado para celda en edición
  const [celdaEditando, setCeldaEditando] = useState<CeldaEditando | null>(null);
  const [valorEditando, setValorEditando] = useState("");
  
  // Ref para almacenar las celdas y flag para evitar doble guardado
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const isNavigating = useRef(false);
  const celdaEditandoRef = useRef<CeldaEditando | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // useEffect UNIFICADO: Verificar sesión y cargar datos
  useEffect(() => {
    const inicializar = async () => {
      // 1. Verificar sesión
      const session = getSession();
      
      console.log('🔐 Verificando sesión en TablaNotas:', {
        id: session.id,
        nombres: session.nombres
      });
      
      if (!session.id) {
        console.log('❌ No hay sesión, redirigiendo a login');
        navigate('/');
        return;
      }
      
      console.log('✅ Sesión válida');
      
      // 2. Verificar datos de navegación
      const storedAsignatura = localStorage.getItem("asignaturaSeleccionada");
      const storedGrado = localStorage.getItem("gradoSeleccionado");
      const storedSalon = localStorage.getItem("salonSeleccionado");

      if (!storedAsignatura) {
        navigate("/dashboard");
        return;
      }

      if (!storedGrado) {
        navigate("/seleccionar-grado");
        return;
      }

      if (!storedSalon) {
        navigate("/seleccionar-salon");
        return;
      }

      setAsignaturaSeleccionada(storedAsignatura);
      setGradoSeleccionado(storedGrado);
      setSalonSeleccionado(storedSalon);

      // 3. Cargar datos
      const idProfesor = session.id;
      
      try {
        console.log("=== DEBUG FILTRO ESTUDIANTES ===");
        console.log("Grado desde localStorage:", storedGrado);
        console.log("Salón desde localStorage:", storedSalon);

        // Fetch estudiantes
        // Fase 10.E.19: nombres/apellidos viven en Usuarios.
        const { data: estudiantesRaw, error: estudiantesError } = await supabase
          .from('Estudiantes')
          .select('id')
          .eq('grado', storedGrado)
          .eq('salon', storedSalon);
        const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
        const estudiantesData = estudiantesError ? estudiantesRaw : sortByApellidosNombres(await enrichWithNombres((estudiantesRaw || []) as any));

        console.log("Estudiantes encontrados:", estudiantesData?.length || 0);

        if (estudiantesError) {
          console.error('Error fetching estudiantes:', estudiantesError);
          setLoading(false);
          return;
        }

        setEstudiantes(estudiantesData || []);

        // PRIMERO: Cargar actividades desde "Nombre de Actividades"
        console.log("=== CARGANDO ACTIVIDADES DESDE NOMBRE DE ACTIVIDADES ===");
        // Compartido entre profesores del mismo aula (asignatura+grado+salon):
        // sin filtro por id_profesor, todos ven y editan la misma tabla.
        const { data: actividadesData, error: actividadesError } = await supabase
          .from('Nombre de Actividades')
          .select('*')
          .eq('ano_escolar', anoEscolarActual())
          .eq('asignatura', storedAsignatura)
          .eq('grado', storedGrado)
          .eq('salon', storedSalon)
          .order('fecha_creacion', { ascending: true });

        if (actividadesError) {
          console.error('Error fetching actividades:', actividadesError);
        } else if (actividadesData && actividadesData.length > 0) {
          console.log("Actividades encontradas:", actividadesData.length);
          const actividadesCargadas: Actividad[] = actividadesData.map(act => ({
            id: `${act.periodo}-${act.nombre_actividad}`,
            periodo: act.periodo,
            nombre: act.nombre_actividad,
            porcentaje: act.porcentaje,
            grupo_id: act.grupo_id ?? null,
          }));
          setActividades(actividadesCargadas);
          console.log("Actividades cargadas:", actividadesCargadas);
        }

        // LUEGO: Fetch notas existentes
        console.log("=== CARGANDO NOTAS EXISTENTES ===");
        const { data: notasData, error: notasError } = await supabase
          .from('Notas')
          .select('*')
          .eq('ano_escolar', anoEscolarActual())
          .eq('asignatura', storedAsignatura)
          .eq('grado', storedGrado)
          .eq('salon', storedSalon);

        if (notasError) {
          console.error('Error fetching notas:', notasError);
        } else if (notasData && notasData.length > 0) {
          console.log("Notas encontradas:", notasData.length);
          
          // Convertir notas de Supabase al formato local
          const notasFormateadas: NotasEstudiantes = {};
          const comentariosFormateados: ComentariosEstudiantes = {};
          
          notasData.forEach((nota) => {
            const { id_estudiantil, periodo, nombre_actividad, nota: valorNota, comentario } = nota;
            
            // Cargar comentarios de Definitiva Anual(periodo = 0)
            if (nombre_actividad === "Definitiva Anual" && periodo === 0) {
              if (comentario) {
                const actividadId = '0-Definitiva Anual';
                if (!comentariosFormateados[id_estudiantil]) {
                  comentariosFormateados[id_estudiantil] = {};
                }
                if (!comentariosFormateados[id_estudiantil][0]) {
                  comentariosFormateados[id_estudiantil][0] = {};
                }
                comentariosFormateados[id_estudiantil][0][actividadId] = comentario;
              }
              return;
            }
            
            // Ignorar las notas de "Definitiva Periodo" para las actividades
            if (nombre_actividad === "Definitiva Periodo") {
              // Solo cargar el comentario si existe
              if (comentario) {
                const actividadId = `${periodo}-Definitiva Periodo`;
                if (!comentariosFormateados[id_estudiantil]) {
                  comentariosFormateados[id_estudiantil] = {};
                }
                if (!comentariosFormateados[id_estudiantil][periodo]) {
                  comentariosFormateados[id_estudiantil][periodo] = {};
                }
                comentariosFormateados[id_estudiantil][periodo][actividadId] = comentario;
              }
              return;
            }
            
            // Crear ID único para la actividad basado en periodo y nombre
            const actividadId = `${periodo}-${nombre_actividad}`;
            
            // Agregar nota al estado
            if (!notasFormateadas[id_estudiantil]) {
              notasFormateadas[id_estudiantil] = {};
            }
            if (!notasFormateadas[id_estudiantil][periodo]) {
              notasFormateadas[id_estudiantil][periodo] = {};
            }
            notasFormateadas[id_estudiantil][periodo][actividadId] = valorNota;
            
            // Agregar comentario al estado si existe
            if (comentario) {
              if (!comentariosFormateados[id_estudiantil]) {
                comentariosFormateados[id_estudiantil] = {};
              }
              if (!comentariosFormateados[id_estudiantil][periodo]) {
                comentariosFormateados[id_estudiantil][periodo] = {};
              }
              comentariosFormateados[id_estudiantil][periodo][actividadId] = comentario;
            }
          });
          
          setNotas(notasFormateadas);
          setComentarios(comentariosFormateados);
          console.log("Notas cargadas:", notasFormateadas);
          console.log("Comentarios cargados:", comentariosFormateados);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }

      // Cargar otros salones en background (no bloquea la UI)
      try {
        const { data: asignaciones } = await supabase
          .from('Asignación Profesores')
          .select('"Asignatura(s)", "Grado(s)", "Salon(es)"')
          .eq('id', parseInt(session.id!));

        if (asignaciones) {
            const asignacionesFiltradas = asignaciones.filter(a => {
              const asignaturas = (a['Asignatura(s)'] || []).flat();
              const grados = (a['Grado(s)'] || []).flat();
              return asignaturas.includes(storedAsignatura) && grados.includes(storedGrado);
            });

            const todosSalones = asignacionesFiltradas
              .flatMap(a => a['Salon(es)'] || [])
              .flat();
            const salonesUnicos = [...new Set(todosSalones)].filter(s => s !== storedSalon);
            setOtrosSalones(salonesUnicos);
        }
      } catch (error) {
        console.error('Error obteniendo otros salones:', error);
      }

      // Cargar nombres de TODOS los profesores que dan esta asignatura+grado+salon.
      // Si hay 2 o más profesores compartiendo el aula, todos aparecen separados
      // por coma en el PDF, en orden alfabético por apellidos.
      try {
        const { data: asigAula } = await supabase
          .from('Asignación Profesores')
          .select('id, "Asignatura(s)", "Grado(s)", "Salon(es)"');
        const idsProfes = new Set<number>();
        for (const a of asigAula || []) {
          const asigs = (a['Asignatura(s)'] || []).flat();
          const grds = (a['Grado(s)'] || []).flat();
          const slns = (a['Salon(es)'] || []).flat();
          if (asigs.includes(storedAsignatura) && grds.includes(storedGrado) && slns.includes(storedSalon)) {
            if (a.id != null) idsProfes.add(Number(a.id));
          }
        }
        if (idsProfes.size > 0) {
          const { data: usrs } = await supabase
            .from('Usuarios')
            .select('id, nombres, apellidos')
            .in('id', [...idsProfes].map(String));
          const ordenados = (usrs || [])
            .map((u: any) => ({
              nombres: (u.nombres || '').trim(),
              apellidos: (u.apellidos || '').trim(),
            }))
            .sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es'));
          const formateados = ordenados
            .map((u) => `${u.nombres} ${u.apellidos}`.trim())
            .filter(Boolean)
            .join(', ');
          setNombresProfesores(formateados);
        }
      } catch (error) {
        console.error('Error obteniendo nombres de profesores del aula:', error);
      }
    };

    inicializar();
  }, [navigate]);

  const periodos = [
    { numero: 1, nombre: "1er Periodo" },
    { numero: 2, nombre: "2do Periodo" },
    { numero: 3, nombre: "3er Periodo" },
    { numero: 4, nombre: "4to Periodo" },
  ];
  
  // Verificar si estamos en la pestaña Definitiva Anual
  const esFinalDefinitiva = periodoActivo === 0;

  /**
   * Devuelve las actividades de un período EN EL ORDEN del agrupamiento
   * jerárquico, para que la fila inferior del thead y los <td> del tbody
   * estén alineados con los <th> superiores.
   *
   * Orden:
   *   1. Actividades sin grupo (legacy / flat)
   *   2. Por cada grupo top (orden por .orden):
   *        - Si tiene subgrupos: actividades de cada subgrupo (en orden)
   *        - Si no tiene subgrupos: actividades del grupo directamente
   */
  const getActividadesPorPeriodo = (periodo: number) => {
    const acts = actividades.filter(a => a.periodo === periodo);
    const gruposPeriodo = gruposNotas.filter(g => g.periodo === periodo);
    if (gruposPeriodo.length === 0) return acts;

    const tops = gruposPeriodo.filter(g => !g.parent_id).sort((a, b) => a.orden - b.orden);
    const subs = (parentId: string) =>
      gruposPeriodo.filter(g => g.parent_id === parentId).sort((a, b) => a.orden - b.orden);

    const ordenadas: Actividad[] = [];
    // 1. Recorrido jerárquico (los grupos van primero, en su orden)
    for (const top of tops) {
      const hijos = subs(top.id);
      if (hijos.length === 0) {
        ordenadas.push(...acts.filter(a => a.grupo_id === top.id));
      } else {
        for (const h of hijos) {
          ordenadas.push(...acts.filter(a => a.grupo_id === h.id));
        }
      }
    }
    // 2. Actividades sueltas al final (a la derecha de todos los grupos)
    ordenadas.push(...acts.filter(a => !a.grupo_id));
    return ordenadas;
  };

  /**
   * Estructura para renderizar el encabezado jerárquico de la tabla.
   * Devuelve secciones (sin grupo + cada grupo top) con sus subgrupos.
   * El componente decide colSpan / rowSpan según haya o no subgrupos.
   */
  const getEstructuraThead = (periodo: number) => {
    const acts = actividades.filter(a => a.periodo === periodo);
    const gruposPeriodo = gruposNotas.filter(g => g.periodo === periodo);
    const hayJerarquia = gruposPeriodo.length > 0;
    if (!hayJerarquia) return { hayJerarquia: false as const, secciones: [] as any[], necesitaFila2: false };

    const tops = gruposPeriodo.filter(g => !g.parent_id).sort((a, b) => a.orden - b.orden);
    const subs = (parentId: string) =>
      gruposPeriodo.filter(g => g.parent_id === parentId).sort((a, b) => a.orden - b.orden);

    // grupo === null indica un "sub virtual" que agrupa actividades directas
    // del grupo padre, cuando coexisten subgrupos reales + actividades sueltas
    // (caso mixto).
    type Sub = { grupo: typeof gruposPeriodo[number] | null; actividades: Actividad[]; colSpan: number };
    type Seccion =
      | { tipo: 'sin-grupo'; actividades: Actividad[]; colSpan: number }
      | { tipo: 'grupo-hoja'; grupo: typeof gruposPeriodo[number]; actividades: Actividad[]; colSpan: number }
      | { tipo: 'grupo-con-sub'; grupo: typeof gruposPeriodo[number]; subgrupos: Sub[]; colSpan: number };

    const secciones: Seccion[] = [];
    let necesitaFila2 = false;
    for (const top of tops) {
      const hijos = subs(top.id);
      if (hijos.length === 0) {
        // Grupo hoja: colSpan = max(1, actividades). Si está vacío reservamos
        // 1 columna placeholder para que el grupo se vea en la cabecera.
        const aDirectas = acts.filter(a => a.grupo_id === top.id);
        const colSpan = Math.max(1, aDirectas.length) + (verPromedios ? 1 : 0);
        secciones.push({ tipo: 'grupo-hoja', grupo: top, actividades: aDirectas, colSpan });
      } else {
        necesitaFila2 = true;
        const subgrupos: Sub[] = hijos.map(h => {
          const aH = acts.filter(a => a.grupo_id === h.id);
          return { grupo: h, actividades: aH, colSpan: Math.max(1, aH.length) + (verPromedios ? 1 : 0) };
        });
        // Caso mixto: el padre también tiene actividades directas → se
        // agregan como un "sub virtual" al inicio para que sigan visibles.
        const actsDirectas = acts.filter(a => a.grupo_id === top.id);
        if (actsDirectas.length > 0) {
          subgrupos.unshift({ grupo: null, actividades: actsDirectas, colSpan: actsDirectas.length });
        }
        const total = subgrupos.reduce((s, x) => s + x.colSpan, 0);
        secciones.push({ tipo: 'grupo-con-sub', grupo: top, subgrupos, colSpan: total });
      }
    }
    // Actividades sueltas al final (a la derecha de todos los grupos)
    const sinGrupo = acts.filter(a => !a.grupo_id);
    if (sinGrupo.length > 0) {
      secciones.push({ tipo: 'sin-grupo', actividades: sinGrupo, colSpan: sinGrupo.length });
    }
    return { hayJerarquia: secciones.some(s => s.tipo !== 'sin-grupo'), secciones, necesitaFila2 };
  };

  /**
   * Devuelve la lista lineal de celdas para la fila de datos del tbody/tfoot,
   * alineada con la fila inferior del thead jerárquico. Cada celda es una
   * actividad real o un placeholder (grupo vacío).
   */
  type CeldaFila =
    | { tipo: 'actividad'; actividad: Actividad }
    | { tipo: 'placeholder'; grupoId: string }
    | { tipo: 'promedio'; grupoId: string };

  const getCeldasFila = (periodo: number): CeldaFila[] => {
    const estructura = getEstructuraThead(periodo);
    if (!estructura.hayJerarquia) {
      return getActividadesPorPeriodo(periodo).map(a => ({ tipo: 'actividad' as const, actividad: a }));
    }
    const out: CeldaFila[] = [];
    for (const sec of estructura.secciones) {
      if (sec.tipo === 'sin-grupo') {
        for (const a of sec.actividades) out.push({ tipo: 'actividad', actividad: a });
      } else if (sec.tipo === 'grupo-hoja') {
        if (sec.actividades.length === 0) {
          out.push({ tipo: 'placeholder', grupoId: sec.grupo.id });
        } else {
          for (const a of sec.actividades) out.push({ tipo: 'actividad', actividad: a });
        }
        if (verPromedios) out.push({ tipo: 'promedio', grupoId: sec.grupo.id });
      } else {
        for (const sub of sec.subgrupos) {
          if (sub.actividades.length === 0) {
            // Solo subs reales pueden tener placeholder (un grupo virtual nunca
            // entra acá porque solo se crea cuando tiene actividades).
            if (sub.grupo) out.push({ tipo: 'placeholder', grupoId: sub.grupo.id });
          } else {
            for (const a of sub.actividades) out.push({ tipo: 'actividad', actividad: a });
          }
          // Columna Prom por subgrupo real (el sub virtual no lleva promedio).
          if (verPromedios && sub.grupo) out.push({ tipo: 'promedio', grupoId: sub.grupo.id });
        }
      }
    }
    return out;
  };

  // ¿La actividad tiene al menos UNA nota puesta (de cualquier estudiante) en el periodo?
  const actividadTieneNota = (actId: string | number, periodo: number): boolean =>
    Object.values(notas).some((porPeriodo: any) => porPeriodo?.[periodo]?.[actId] !== undefined);

  // Porcentaje "usado"/cobertura del periodo.
  //  - Modo plano (Normal, sin grupos): suma el % de las actividades sueltas
  //    definidas (comportamiento histórico — NO se toca).
  //  - Modo grupos (Pestalozziano): el peso lo aportan SOLO los portadores que
  //    tengan ≥1 actividad CON NOTA. Cada grupo-hoja con al menos una actividad
  //    calificada suma su %, y las actividades sueltas con ≥1 nota suman su %.
  //    El % de grupos/subgrupos es solo el TOPE; una actividad dentro de grupo
  //    no lleva % propio y un grupo sin notas no aporta nada.
  const getPorcentajeUsado = (periodo: number) => {
    const gruposPeriodo = gruposNotas.filter(g => g.periodo === periodo);
    const acts = actividades.filter(a => a.periodo === periodo);
    if (gruposPeriodo.length === 0) {
      return acts
        .filter(a => a.porcentaje !== null)
        .reduce((sum, a) => sum + (a.porcentaje || 0), 0);
    }
    let total = 0;
    // Actividades sueltas (fuera de grupos) con al menos una nota.
    for (const a of acts) {
      if ((a.grupo_id ?? null) === null && a.porcentaje !== null && actividadTieneNota(a.id, periodo)) {
        total += a.porcentaje;
      }
    }
    // Grupos-hoja (sin subgrupos) con al menos una actividad calificada.
    for (const g of gruposPeriodo) {
      const esHoja = !gruposPeriodo.some(s => s.parent_id === g.id);
      if (!esHoja) continue;
      const tieneCalificada = acts.some(a => (a.grupo_id ?? null) === g.id && actividadTieneNota(a.id, periodo));
      if (tieneCalificada) total += Number(g.porcentaje || 0);
    }
    return Math.round(total * 100) / 100;
  };

  // Calcular porcentaje promedio anual (promedio de los 4 períodos)
  const getPorcentajePromedioAnual = () => {
    const porcentajes = [1, 2, 3, 4].map(p => getPorcentajeUsado(p));
    const suma = porcentajes.reduce((acc, val) => acc + val, 0);
    const promedio = suma / 4;
    // Redondear a 2 decimales
    return Math.round(promedio * 100) / 100;
  };

  // Verificar si al menos un período tiene porcentaje completo (100%) Y el estudiante tiene TODAS las notas
  const tieneAlMenosUnPeriodoCompletoConTodasNotas = (idEstudiantil: string): boolean => {
    for (let periodo = 1; periodo <= 4; periodo++) {
      // 1. Verificar que el período esté al 100%
      const porcentajeUsado = getPorcentajeUsado(periodo);
      if (porcentajeUsado !== 100) continue;
      
      // 2. Verificar que el estudiante tenga Definitiva Periodo calculado
      const finalPeriodo = calcularFinalPeriodo(idEstudiantil, periodo);
      if (finalPeriodo === null) continue;
      
      // 3. Verificar que el estudiante tenga TODAS las actividades con porcentaje calificadas
      const actividadesDelPeriodo = getActividadesPorPeriodo(periodo);
      const actividadesConPorcentaje = actividadesDelPeriodo.filter(a => a.porcentaje !== null && a.porcentaje > 0);
      
      const todasCalificadas = actividadesConPorcentaje.every(actividad => {
        const nota = notas[idEstudiantil]?.[periodo]?.[actividad.id];
        return nota !== undefined;
      });
      
      // Si este período cumple TODAS las condiciones, retornar true
      if (todasCalificadas) {
        return true;
      }
    }
    
    // Ningún período cumple todas las condiciones
    return false;
  };

  /**
   * Abre el modal de creación con un tipo específico.
   * - tipo='actividad' → modal nueva actividad
   * - tipo='grupo'     → modal nuevo grupo (con padre opcional pre-seleccionado)
   * - tipo='subgrupo'  → nuevo grupo cuyo padre es `parentId`
   *
   * El usuario lo dispara con el botón "+": click rápido = actividad,
   * long-press (>= 1.2s) = grupo.
   */
  const handleAbrirModal = (periodo: number, tipo: 'actividad' | 'grupo' = 'actividad', parentId: string | null = null) => {
    if (soloLectura) return;
    setPeriodoActual(periodo);
    setNombreActividad("");
    setPorcentajeActividad("");
    setActividadEditando(null);
    setCrearParaTodosSalones(false);
    setGrupoPadrePara(parentId);
    setReplicarGrupoOtrosPeriodos(false);
    setReplicarGrupoOtrosSalones(false);

    const gruposDelPeriodo = gruposNotas.filter(g => g.periodo === periodo);

    // Si pidieron actividad pero todavía no hay grupos, fuerza tipo a 'actividad'
    // (modo plano puro). Si pidieron actividad y SÍ hay grupos, también, pero
    // pre-seleccionamos el primer grupo hoja.
    if (tipo === 'grupo') {
      setTipoNuevoItem('grupo');
    } else {
      // Si hay grupos, la nueva actividad debe ir dentro de uno (la jerarquía
      // ya está activa); si no, modo plano libre.
      setTipoNuevoItem('actividad');
    }

    // Si la actividad viene de un grupo específico (parentId pasado), fijamos
    // ese grupo y NO mostramos selector. Si viene del "+ Agregar" general,
    // arrancamos en "sin grupo" (suelta) para que el profe vea el % disponible
    // del periodo. Puede cambiar al grupo que quiera desde el desplegable.
    if (tipo === 'actividad' && parentId) {
      setGrupoActividadId(parentId);
      setGrupoActividadFijo(true);
    } else {
      setGrupoActividadId(null);
      setGrupoActividadFijo(false);
    }
    setModalOpen(true);
  };

  const buscarSalonesConActividad = async (nombreAct: string, periodo: number) => {
    // Aula compartida: buscar entre todos los profesores del mismo aula.
    const { data } = await supabase
      .from('Nombre de Actividades')
      .select('salon')
      .eq('ano_escolar', anoEscolarActual())
      .eq('asignatura', asignaturaSeleccionada)
      .eq('grado', gradoSeleccionado)
      .eq('periodo', periodo)
      .eq('nombre_actividad', nombreAct)
      .neq('salon', salonSeleccionado);
    setSalonesConActividad(data?.map(r => r.salon) || []);
  };

  const handleAbrirModalEditar = async (actividad: Actividad) => {
    if (soloLectura) return;
    setPeriodoActual(actividad.periodo);
    setNombreActividad(actividad.nombre);
    setPorcentajeActividad(actividad.porcentaje?.toString() || "");
    setActividadEditando(actividad);
    setCrearParaTodosSalones(false);
    // Si la actividad ya tiene grupo, lo respetamos. Si no tiene grupo pero
    // el periodo ya tiene jerarquía definida, pre-seleccionamos la primera
    // hoja para forzar consistencia con la jerarquía.
    const grupoOriginal = (actividad as any).grupo_id as string | null | undefined;
    if (grupoOriginal) {
      setGrupoActividadId(grupoOriginal);
    } else {
      const gruposDelPeriodo = gruposNotas.filter(g => g.periodo === actividad.periodo);
      const grupoHojaPredet = gruposDelPeriodo.find(
        g => !gruposDelPeriodo.some(h => h.parent_id === g.id)
      );
      setGrupoActividadId(grupoHojaPredet ? grupoHojaPredet.id : null);
    }
    await buscarSalonesConActividad(actividad.nombre, actividad.periodo);
    setModalOpen(true);
  };

  const handleGuardarActividad = async () => {
    if (soloLectura) return;
    // Validar nombre
    if (!nombreActividad.trim()) {
      toast({
        title: "Error",
        description: tipoNuevoItem === 'grupo' && !actividadEditando
          ? "El nombre del grupo es requerido"
          : "El nombre de la actividad es requerido",
        variant: "destructive",
      });
      return;
    }

    if (nombreActividad.length > 100) {
      toast({
        title: "Error",
        description: "El nombre no puede superar 100 caracteres",
        variant: "destructive",
      });
      return;
    }

    // Si estoy CREANDO un grupo, ramifico al endpoint de Grupos_Notas y salgo.
    if (!actividadEditando && tipoNuevoItem === 'grupo') {
      // % es opcional: si está vacío mandamos null y el grupo queda sin %
      // (el profe lo asigna después). Si lo dieron, validamos rango.
      let pct: number | null = null;
      if (porcentajeActividad.trim() !== '') {
        const n = parseFloat(porcentajeActividad);
        if (!Number.isFinite(n) || n <= 0 || n > 100) {
          toast({
            title: "Error",
            description: "El porcentaje debe estar entre 0.01 y 100, o vacío.",
            variant: "destructive",
          });
          return;
        }
        pct = n;
      }
      setGuardandoMultiple(true);
      try {
        const body: any = {
          nombre: nombreActividad.trim(),
          porcentaje: pct,
          parent_id: grupoPadrePara || null,
          asignatura: asignaturaSeleccionada,
          grado: gradoSeleccionado,
          salon: salonSeleccionado,
          periodo: periodoActual,
          ano_escolar: anoEscolarActual(),
        };
        // Replicación solo para grupos top
        if (!grupoPadrePara) {
          if (replicarGrupoOtrosPeriodos) {
            body.replicar_periodos = [1, 2, 3, 4].filter(p => p !== periodoActual);
          }
          if (replicarGrupoOtrosSalones && otrosSalones.length > 0) {
            body.replicar_salones = otrosSalones;
          }
        }
        await apiClient.gruposNotas.crear(body);
        await reloadGrupos();
        setModalOpen(false);
        setGuardandoMultiple(false);
        return;
      } catch (e: any) {
        setGuardandoMultiple(false);
        const body = e?.body || {};
        const detail = body.detail || e?.message || "No se pudo crear el grupo.";
        toast({ title: "No se pudo crear el grupo", description: detail, variant: "destructive" });
        return;
      }
    }

    // Regla de no-mezcla: si la actividad va a un grupo, ese grupo no debe
    // tener subgrupos (un grupo con subgrupos no acepta actividades directas).
    if (grupoActividadId) {
      const tieneSubgrupos = gruposNotas.some(g => g.parent_id === grupoActividadId);
      if (tieneSubgrupos) {
        const grupoSel = gruposNotas.find(g => g.id === grupoActividadId);
        toast({
          title: "No se puede crear aquí",
          description: `El grupo "${grupoSel?.nombre || ''}" ya tiene subgrupos. Las actividades deben ir dentro de un subgrupo, no del grupo padre.`,
          variant: "destructive",
        });
        return;
      }
    }

    // Si la actividad pertenece a un grupo, NO debe llevar porcentaje
    // individual: el peso lo da el grupo (igual reparto entre actividades).
    // Validar porcentaje si existe (sólo en modo plano sin grupo)
    let porcentaje: number | null = null;
    if (!grupoActividadId && porcentajeActividad.trim()) {
      porcentaje = parseFloat(porcentajeActividad);
      if (isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
        toast({
          title: "Error",
          description: "El porcentaje debe estar entre 0 y 100",
          variant: "destructive",
        });
        return;
      }

      // Porcentaje usado del periodo = grupos top + actividades sueltas
      // (excluyendo la que se edita). Misma cuenta que muestra el modal en
      // "Disponible", para que la validación al guardar sea coherente: una
      // actividad suelta NO puede sumar por encima de lo que ya aportan los
      // grupos. (Antes solo contaba sueltas e ignoraba los grupos → permitía
      // pasar de 100%, p.ej. 100% en grupos + 10% suelta = 110%.)
      const porcentajeUsado = getPorcentajeUsadoParaModal();

      if (porcentajeUsado + porcentaje > 100) {
        const disponible = Math.max(0, 100 - porcentajeUsado);
        toast({
          title: "Error",
          description: `El porcentaje total del período no puede superar 100%. Disponible: ${disponible}%`,
          variant: "destructive",
        });
        return;
      }
    }

    if (actividadEditando) {
      // EDITAR actividad existente
      const nombreAntiguo = actividadEditando.nombre;
      const nombreNuevo = nombreActividad.trim();
      const session = getSession();

      // Re-query salones con actividad al momento de guardar (por robustez)
      let salonesOtros = salonesConActividad;
      if (crearParaTodosSalones && salonesConActividad.length === 0) {
        const { data: freshData } = await supabase
          .from('Nombre de Actividades')
          .select('salon')
          .eq('ano_escolar', anoEscolarActual())
          .eq('asignatura', asignaturaSeleccionada)
          .eq('grado', gradoSeleccionado)
          .eq('periodo', actividadEditando.periodo)
          .eq('nombre_actividad', nombreAntiguo)
          .neq('salon', salonSeleccionado);
        salonesOtros = freshData?.map(r => r.salon) || [];
      }

      const salonesAEditar = crearParaTodosSalones && salonesOtros.length > 0
        ? [salonSeleccionado, ...salonesOtros]
        : [salonSeleccionado];
      try {
        // Aula compartida: cualquier profesor del aula puede editar la actividad.
        const { error } = await supabase
          .from('Nombre de Actividades')
          .update({
            nombre_actividad: nombreNuevo,
            porcentaje: porcentaje,
            grupo_id: grupoActividadId,
          })
          .eq('ano_escolar', anoEscolarActual())
          .eq('asignatura', asignaturaSeleccionada)
          .eq('grado', gradoSeleccionado)
          .in('salon', salonesAEditar)
          .eq('periodo', actividadEditando.periodo)
          .eq('nombre_actividad', nombreAntiguo);

        if (error) {
          console.error('Error actualizando actividad en Nombre de Actividades:', error);
          toast({
            title: "Error",
            description: "No se pudo actualizar la actividad",
            variant: "destructive",
          });
          return;
        }
        console.log('✅ Actividad actualizada en Nombre de Actividades');
      } catch (error) {
        console.error('Error:', error);
        toast({
          title: "Error",
          description: "Error de conexión al actualizar",
          variant: "destructive",
        });
        return;
      }

      // Si cambió el porcentaje, actualizar todas las notas en Supabase
      if (actividadEditando.porcentaje !== porcentaje) {
        try {
          const { error } = await supabase
            .from('Notas')
            .update({ porcentaje: porcentaje })
            .eq('ano_escolar', anoEscolarActual())
            .eq('nombre_actividad', nombreNuevo)
            .eq('asignatura', asignaturaSeleccionada)
            .eq('grado', gradoSeleccionado)
            .in('salon', salonesAEditar)
            .eq('periodo', actividadEditando.periodo);

          if (error) {
            console.error('Error actualizando porcentaje:', error);
            // No es crítico, continuar
          }
        } catch (error) {
          console.error('Error:', error);
        }
      }

      // Actualizar en el estado local - crear nuevo ID si cambió el nombre
      const nuevoId = nombreAntiguo !== nombreNuevo
        ? `${actividadEditando.periodo}-${nombreNuevo}`
        : actividadEditando.id;

      setActividades(prev => prev.map(a =>
        a.id === actividadEditando.id
          ? { ...a, id: nuevoId, nombre: nombreNuevo, porcentaje }
          : a
      ));

      // Actualizar las notas locales si cambió el nombre
      if (nombreAntiguo !== nombreNuevo) {
        setNotas(prev => {
          const nuevasNotas = { ...prev };
          Object.keys(nuevasNotas).forEach(id => {
            if (nuevasNotas[id]?.[actividadEditando.periodo]?.[actividadEditando.id] !== undefined) {
              const valorNota = nuevasNotas[id][actividadEditando.periodo][actividadEditando.id];
              delete nuevasNotas[id][actividadEditando.periodo][actividadEditando.id];
              nuevasNotas[id][actividadEditando.periodo][nuevoId] = valorNota;
            }
          });
          return nuevasNotas;
        });
      }

      setModalOpen(false);
      // Sin popup: el cambio se refleja al instante en la tabla.
    } else {
      // CREAR nueva actividad
      const nombreTrimmed = nombreActividad.trim();
      const actividadId = `${periodoActual}-${nombreTrimmed}`;

      const session = getSession();
      const salonesParaCrear = crearParaTodosSalones && otrosSalones.length > 0
        ? [salonSeleccionado, ...otrosSalones]
        : [salonSeleccionado];

      // Validar porcentaje en otros salones si aplica
      if (crearParaTodosSalones && otrosSalones.length > 0 && porcentaje !== null) {
        setGuardandoMultiple(true);
        try {
          const { data: actividadesOtros, error: errorOtros } = await supabase
            .from('Nombre de Actividades')
            .select('salon, porcentaje')
            .eq('ano_escolar', anoEscolarActual())
            .eq('asignatura', asignaturaSeleccionada)
            .eq('grado', gradoSeleccionado)
            .in('salon', otrosSalones)
            .eq('periodo', periodoActual)
            .not('porcentaje', 'is', null);

          if (errorOtros) {
            console.error('Error verificando porcentajes:', errorOtros);
            setGuardandoMultiple(false);
            toast({ title: "Error", description: "No se pudo verificar los porcentajes de otros salones", variant: "destructive" });
            return;
          }

          // Calcular porcentaje usado por salón = actividades sueltas + grupos top
          const porcentajePorSalon: { [salon: string]: number } = {};
          (actividadesOtros || []).forEach(a => {
            porcentajePorSalon[a.salon] = (porcentajePorSalon[a.salon] || 0) + (a.porcentaje || 0);
          });

          // Sumar también el % de los grupos de primer nivel de cada salón
          // (sin esto, replicar una actividad suelta podía pasar de 100% en un
          // salón que ya tuviera la jerarquía completa en grupos).
          const { data: gruposOtros } = await supabase
            .from('Grupos_Notas')
            .select('salon, porcentaje')
            .eq('ano_escolar', anoEscolarActual())
            .eq('asignatura', asignaturaSeleccionada)
            .eq('grado', gradoSeleccionado)
            .in('salon', otrosSalones)
            .eq('periodo', periodoActual)
            .is('parent_id', null)
            .not('porcentaje', 'is', null);
          (gruposOtros || []).forEach(g => {
            porcentajePorSalon[g.salon] = (porcentajePorSalon[g.salon] || 0) + Number(g.porcentaje || 0);
          });

          const salonesExcedidos = otrosSalones.filter(s => {
            const usado = porcentajePorSalon[s] || 0;
            return usado + porcentaje > 100;
          });

          if (salonesExcedidos.length > 0) {
            setGuardandoMultiple(false);
            toast({
              title: "Error de porcentaje",
              description: `El porcentaje superaría 100% en: ${salonesExcedidos.join(', ')}`,
              variant: "destructive",
            });
            return;
          }
        } catch (error) {
          console.error('Error:', error);
          setGuardandoMultiple(false);
          toast({ title: "Error", description: "Error de conexión al verificar porcentajes", variant: "destructive" });
          return;
        }
      }

      // Excluir salones donde la actividad con este nombre YA existe en el
      // periodo. El insert de varias filas es atómico: si una choca con el
      // UNIQUE (p.ej. al "También crear en" un salón donde ya estaba), fallaba
      // TODO y no se creaba en ninguno. Ahora se crea solo donde falta.
      let salonesFinal = salonesParaCrear;
      try {
        const { data: yaExisten } = await supabase
          .from('Nombre de Actividades')
          .select('salon')
          .eq('ano_escolar', anoEscolarActual())
          .eq('asignatura', asignaturaSeleccionada)
          .eq('grado', gradoSeleccionado)
          .eq('periodo', periodoActual)
          .eq('nombre_actividad', nombreTrimmed)
          .in('salon', salonesParaCrear);
        const conflicto = new Set((yaExisten || []).map((r: any) => r.salon));
        if (conflicto.size > 0) {
          salonesFinal = salonesParaCrear.filter(s => !conflicto.has(s));
          if (salonesFinal.length === 0) {
            setGuardandoMultiple(false);
            toast({
              title: "Ya existe",
              description: `La actividad "${nombreTrimmed}" ya existe en ${[...conflicto].join(', ')} para este periodo.`,
              variant: "destructive",
            });
            return;
          }
        }
      } catch (e) {
        console.error('Error verificando duplicados por salón:', e);
      }

      // Mapear el grupo al EQUIVALENTE de cada salón destino. grupoActividadId
      // es el grupo de ESTE salón; en otro salón el mismo grupo (p.ej.
      // "Evaluaciones") tiene OTRO id, o no existe (salón en modelo plano). Sin
      // re-mapear, la actividad quedaría colgada de un grupo de otro salón y NO
      // se vería en el destino. Se omiten los salones que no tengan el grupo.
      const grupoIdPorSalon: Record<string, string | null> = {};
      if (grupoActividadId) {
        const gOrigen = gruposNotas.find(g => g.id === grupoActividadId);
        const nombreGrupo = gOrigen?.nombre;
        const nombrePadre = gOrigen?.parent_id
          ? (gruposNotas.find(g => g.id === gOrigen.parent_id)?.nombre ?? null)
          : null;
        let gruposDestino: Array<{ id: string; nombre: string; salon: string; parent_id: string | null }> = [];
        try {
          const { data } = await supabase
            .from('Grupos_Notas')
            .select('id, nombre, salon, parent_id')
            .eq('asignatura', asignaturaSeleccionada)
            .eq('grado', gradoSeleccionado)
            .eq('periodo', periodoActual)
            .in('salon', salonesFinal);
          gruposDestino = (data as any) || [];
        } catch (e) {
          console.error('Error cargando grupos de salones destino:', e);
        }
        const sinGrupo: string[] = [];
        for (const salon of salonesFinal) {
          const delSalon = gruposDestino.filter(g => String(g.salon) === String(salon));
          const match = nombrePadre
            ? delSalon.find(g => g.nombre === nombreGrupo && g.parent_id &&
                delSalon.some(p => p.id === g.parent_id && p.nombre === nombrePadre))
            : delSalon.find(g => g.nombre === nombreGrupo && !g.parent_id);
          if (match) grupoIdPorSalon[salon] = match.id;
          else sinGrupo.push(salon);
        }
        if (sinGrupo.length > 0) {
          salonesFinal = salonesFinal.filter(s => !sinGrupo.includes(s));
          toast({
            title: "Algunos salones no tienen ese grupo",
            description: `No se creó en ${sinGrupo.join(', ')} porque ahí no existe el grupo "${nombreGrupo}". Créalo en ese salón primero si lo necesitas.`,
          });
          if (salonesFinal.length === 0) { setGuardandoMultiple(false); return; }
        }
      }

      // Construir filas para insertar (cada salón con SU grupo equivalente)
      const filasParaInsertar = salonesFinal.map(salon => ({
        id_profesor: session.id,
        ano_escolar: anoEscolarActual(),
        asignatura: asignaturaSeleccionada,
        grado: gradoSeleccionado,
        salon: salon,
        periodo: periodoActual,
        nombre_actividad: nombreTrimmed,
        porcentaje: porcentaje,
        grupo_id: grupoActividadId ? (grupoIdPorSalon[salon] ?? null) : null,
      }));

      try {
        const { error } = await supabase
          .from('Nombre de Actividades')
          .insert(filasParaInsertar);

        if (error) {
          console.error('Error guardando actividad:', error);
          const raw = (error.message || error.details || error.hint || '').toLowerCase();
          let msg: string;
          if (raw.includes('unique') || raw.includes('duplicate')) {
            msg = `Ya existe una actividad llamada "${nombreTrimmed}" en este periodo`;
          } else if (raw.includes('foreign key') || raw.includes('grupo_id')) {
            msg = 'El grupo seleccionado ya no existe. Recarga la página y vuelve a intentar.';
          } else if (raw) {
            msg = `No se pudo guardar la actividad: ${raw}`;
          } else {
            msg = 'No se pudo guardar la actividad. Revisa que el nombre no esté repetido en este periodo.';
          }
          toast({
            title: "Error",
            description: msg,
            variant: "destructive",
          });
          setGuardandoMultiple(false);
          return;
        }

        console.log(`✅ Actividad guardada en ${salonesFinal.length} salón(es)`);
      } catch (error) {
        console.error('Error:', error);
        toast({
          title: "Error",
          description: "Error de conexión al guardar la actividad",
          variant: "destructive",
        });
        setGuardandoMultiple(false);
        return;
      }

      const nuevaActividad: Actividad = {
        id: actividadId,
        periodo: periodoActual,
        nombre: nombreTrimmed,
        porcentaje,
        grupo_id: grupoActividadId,
      };

      // Reflejar la columna en la tabla del salón actual solo si de verdad se
      // creó ahí (si se omitió por ya existir, no duplicarla visualmente).
      if (salonesFinal.includes(salonSeleccionado)) {
        setActividades([...actividades, nuevaActividad]);
      }
      setModalOpen(false);
      setGuardandoMultiple(false);
      // Sin popup: la nueva columna aparece al instante en la tabla.
    }
  };

  const handleConfirmarEliminar = async (actividad: Actividad) => {
    if (soloLectura) return;
    setActividadAEliminar(actividad);
    setEliminarEnTodosSalones(false);
    await buscarSalonesConActividad(actividad.nombre, actividad.periodo);
    setDeleteDialogOpen(true);
  };

  const handleEliminarActividad = async () => {
    if (soloLectura) return;
    if (!actividadAEliminar) return;

    const session = getSession();
    
    const salonesAEliminar = eliminarEnTodosSalones && salonesConActividad.length > 0
      ? [salonSeleccionado, ...salonesConActividad]
      : [salonSeleccionado];

    try {
      // PRIMERO: Eliminar de "Nombre de Actividades"
      console.log('Eliminando actividad:', {
        id_profesor: session.id,
        asignatura: asignaturaSeleccionada,
        grado: gradoSeleccionado,
        salones: salonesAEliminar,
        periodo: actividadAEliminar.periodo,
        nombre_actividad: actividadAEliminar.nombre,
      });
      // Aula compartida: cualquier profesor del aula puede borrar.
      const { data: deletedRows, error: errorActividad } = await supabase
        .from('Nombre de Actividades')
        .delete()
        .eq('ano_escolar', anoEscolarActual())
        .eq('asignatura', asignaturaSeleccionada)
        .eq('grado', gradoSeleccionado)
        .in('salon', salonesAEliminar)
        .eq('periodo', actividadAEliminar.periodo)
        .eq('nombre_actividad', actividadAEliminar.nombre)
        .select();

      console.log('Resultado delete:', { deletedRows, errorActividad });

      if (errorActividad) {
        console.error('Error eliminando de Nombre de Actividades:', errorActividad);
        toast({
          title: "Error",
          description: `No se pudo eliminar la actividad: ${errorActividad.message}`,
          variant: "destructive",
        });
        return;
      }

      if (!deletedRows || deletedRows.length === 0) {
        console.error('No se eliminó ninguna fila. Posible problema de RLS o filtros no coinciden.');
        toast({
          title: "Error",
          description: "No se pudo eliminar la actividad de la base de datos. Verifica los permisos en Supabase.",
          variant: "destructive",
        });
        return;
      }

      // LUEGO: Eliminar todas las notas de esta actividad de Supabase
      const { error } = await supabase
        .from('Notas')
        .delete()
        .eq('ano_escolar', anoEscolarActual())
        .eq('nombre_actividad', actividadAEliminar.nombre)
        .eq('asignatura', asignaturaSeleccionada)
        .eq('grado', gradoSeleccionado)
        .in('salon', salonesAEliminar)
        .eq('periodo', actividadAEliminar.periodo);

      if (error) {
        console.error('Error eliminando notas:', error);
        toast({
          title: "Error",
          description: "No se pudieron eliminar las notas de la actividad",
          variant: "destructive",
        });
        return;
      }

      // Eliminar del estado local de actividades
      const nuevasActividades = actividades.filter(a => a.id !== actividadAEliminar.id);
      setActividades(nuevasActividades);

      // Eliminar del estado local de notas y obtener nuevas notas
      const nuevasNotas = { ...notas };
      Object.keys(nuevasNotas).forEach(id => {
        if (nuevasNotas[id]?.[actividadAEliminar.periodo]) {
          delete nuevasNotas[id][actividadAEliminar.periodo][actividadAEliminar.id];
        }
      });
      setNotas(nuevasNotas);

      setDeleteDialogOpen(false);
      const periodoEliminado = actividadAEliminar.periodo;
      setActividadAEliminar(null);
      // Sin popup post-eliminación: la confirmación previa del AlertDialog
      // ya deja claro que la actividad se borra.


      // Recalcular y guardar Definitiva Periodo y Definitiva Anualpara todos los estudiantes afectados
      setTimeout(async () => {
        console.log('=== RECALCULANDO FINALES DESPUÉS DE ELIMINAR ACTIVIDAD ===');
        for (const est of estudiantes) {
          // Calcular Definitiva Periodo con las nuevas actividades
          const actividadesDelPeriodo = nuevasActividades.filter(a => a.periodo === periodoEliminado);
          const actividadesConPorcentaje = actividadesDelPeriodo.filter(a => a.porcentaje !== null && a.porcentaje > 0);
          const notasEstudiante = nuevasNotas[est.id]?.[periodoEliminado] || {};
          
          let notaFinal: number | null = null;
          if (actividadesConPorcentaje.length > 0) {
            const actividadesConNotaYPorcentaje = actividadesConPorcentaje.filter(a => notasEstudiante[a.id] !== undefined);
            if (actividadesConNotaYPorcentaje.length > 0) {
              let sumaPonderada = 0;
              actividadesConNotaYPorcentaje.forEach(act => {
                const notaValue = notasEstudiante[act.id];
                if (notaValue !== undefined && act.porcentaje) {
                  sumaPonderada += notaValue * (act.porcentaje / 100);
                }
              });
              notaFinal = Math.round(sumaPonderada * 10) / 10;
            }
          }

          await guardarFinalPeriodo(est.id, periodoEliminado, notaFinal);
          
          // Recalcular Definitiva Anual
          let suma = 0;
          let tieneAlgunaNota = false;
          for (let p = 1; p <= 4; p++) {
            // Usar nuevas actividades para calcular
            const actsPeriodo = nuevasActividades.filter(a => a.periodo === p);
            const actsConPorc = actsPeriodo.filter(a => a.porcentaje !== null && a.porcentaje > 0);
            const notasEst = nuevasNotas[est.id]?.[p] || {};
            
            let fp: number | null = null;
            if (actsConPorc.length > 0) {
              const actsConNotaYPorc = actsConPorc.filter(a => notasEst[a.id] !== undefined);
              if (actsConNotaYPorc.length > 0) {
                let sumPond = 0;
                actsConNotaYPorc.forEach(act => {
                  const nv = notasEst[act.id];
                  if (nv !== undefined && act.porcentaje) {
                    sumPond += nv * (act.porcentaje / 100);
                  }
                });
                fp = Math.round(sumPond * 10) / 10;
              }
            }

            if (fp !== null) {
              suma += fp;
              tieneAlgunaNota = true;
            }
          }

          if (tieneAlgunaNota) {
            const finalDef = Math.round((suma / 4) * 10) / 10;
            await guardarFinalDefinitiva(est.id, finalDef);
          } else {
            await guardarFinalDefinitiva(est.id, null);
          }
        }
        console.log('✅ Finales recalculados después de eliminar actividad');
      }, 100);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Error de conexión al eliminar",
        variant: "destructive",
      });
    }
  };

  // Calcular porcentaje usado en el periodo excluyendo la actividad en edición.
  // Incluye actividades sueltas (sin grupo) + grupos top (con %).
  // Las actividades dentro de grupo NO suman al total — su peso lo aporta el grupo.
  const getPorcentajeUsadoParaModal = () => {
    const actsSueltas = actividades
      .filter(a => a.periodo === periodoActual && !a.grupo_id && a.porcentaje !== null && a.id !== actividadEditando?.id)
      .reduce((sum, a) => sum + (a.porcentaje || 0), 0);
    const gruposTop = gruposNotas
      .filter(g => g.periodo === periodoActual && !g.parent_id && g.porcentaje !== null)
      .reduce((sum, g) => sum + Number(g.porcentaje || 0), 0);
    return actsSueltas + gruposTop;
  };

  // Calcular el ancho mínimo de cada período basado en sus actividades (+ columna Final)
  const getAnchoMinimoPeriodo = (periodo: number) => {
    const actividadesDelPeriodo = getActividadesPorPeriodo(periodo);
    // Mínimo 200px para el botón + 100px para Final, más 120px por cada actividad
    return Math.max(300, 180 + (actividadesDelPeriodo.length * 120));
  };

  // Calcular nota final del periodo para un estudiante (usando notas proporcionadas o estado)
  // Usa promedioGeneral del módulo gradeCalculator: retrocompatible para
  // modo plano (todas las actividades con grupo_id=null) y soporta jerárquico
  // y mixto cuando hay Grupos_Notas configurados para este aula+periodo.
  const calcularFinalPeriodoConNotas = useCallback((notasParam: NotasEstudiantes, idEstudiantil: string, periodo: number): number | null => {
    const actividadesDelPeriodo = getActividadesPorPeriodo(periodo);
    if (actividadesDelPeriodo.length === 0) return null;

    const notasEstudiante = notasParam[idEstudiantil]?.[periodo] || {};

    // Construir lista de NotaCalc con el porcentaje de la actividad y la nota del estudiante.
    // Si la actividad no tiene nota para este estudiante, se omite (no se cuenta como 0).
    // Cuenta una actividad calificada si: pertenece a un grupo (el % lo aporta el
    // grupo, la actividad no necesita % propio) O tiene su propio % > 0 (modo plano).
    const notasCalc: NotaCalc[] = actividadesDelPeriodo
      .filter(a => notasEstudiante[a.id] !== undefined && ((a.grupo_id ?? null) !== null || (a.porcentaje !== null && a.porcentaje > 0)))
      .map(a => ({
        porcentaje: a.porcentaje,
        nota: notasEstudiante[a.id] as number,
        grupo_id: a.grupo_id ?? null,
      }));

    if (notasCalc.length === 0) return null;

    // Filtrar grupos del periodo actual (gruposNotas viene del hook y ya está
    // filtrado por aula+ano_escolar, pero puede contener periodos distintos).
    const gruposDelPeriodo: GrupoCalc[] = gruposNotas
      .filter(g => g.periodo === periodo)
      .map(g => ({ id: g.id, porcentaje: g.porcentaje, parent_id: g.parent_id }));

    const res = promedioGeneral(notasCalc, gruposDelPeriodo);
    return res.promedio;
  }, [actividades, gruposNotas]);

  // Promedio (recursivo) de UN grupo/subgrupo para un estudiante en un periodo.
  // Grupo hoja = promedio simple de sus actividades calificadas; grupo con
  // subgrupos = combinación por % (igual que la definitiva). Solo visual.
  const promedioGrupoEstudiante = useCallback((grupoId: string, idEstudiantil: string, periodo: number): number | null => {
    const notasEst = notas[idEstudiantil]?.[periodo] || {};
    const notasCalc: NotaCalc[] = getActividadesPorPeriodo(periodo)
      .filter(a => notasEst[a.id] !== undefined)
      .map(a => ({ porcentaje: a.porcentaje, nota: notasEst[a.id] as number, grupo_id: a.grupo_id ?? null }));
    const gruposDelPeriodo: GrupoCalc[] = gruposNotas
      .filter(g => g.periodo === periodo)
      .map(g => ({ id: g.id, porcentaje: g.porcentaje, parent_id: g.parent_id }));
    return promedioDeGrupo(grupoId, notasCalc, gruposDelPeriodo);
  }, [actividades, gruposNotas, notas]);

  // Versión que usa el estado actual
  const calcularFinalPeriodo = useCallback((idEstudiantil: string, periodo: number): number | null => {
    return calcularFinalPeriodoConNotas(notas, idEstudiantil, periodo);
  }, [calcularFinalPeriodoConNotas, notas]);

  // ¿El periodo está objetivamente completo para este estudiante? (vs provisional)
  // Construye TODAS las actividades del periodo (con nota null si falta) para
  // detectar las no calificadas, y delega en esPeriodoCompleto (mismo criterio
  // que el backend/agente). No depende del checkbox del profe (ese solo gatea
  // las notificaciones).
  // Promedio de la CLASE para un grupo/subgrupo en un periodo (visual): media de
  // los promedios de cada estudiante en ese grupo. (En la tabla del profe/rector,
  // que es multi-estudiante, mostramos el promedio del curso por grupo.)
  const periodoCompletoParaEst = useCallback((idEstudiantil: string, periodo: number): boolean => {
    const acts = getActividadesPorPeriodo(periodo);
    if (acts.length === 0) return false;
    const notasEst = notas[idEstudiantil]?.[periodo] || {};
    const notasCalc: NotaCalc[] = acts.map((a) => ({
      porcentaje: a.porcentaje,
      nota: notasEst[a.id] !== undefined ? (notasEst[a.id] as number) : null,
      grupo_id: a.grupo_id ?? null,
    }));
    const gruposDelPeriodo: GrupoCalc[] = gruposNotas
      .filter((g) => g.periodo === periodo)
      .map((g) => ({ id: g.id, porcentaje: g.porcentaje, parent_id: g.parent_id }));
    return esPeriodoCompleto(notasCalc, gruposDelPeriodo);
  }, [actividades, gruposNotas, notas]);

  // Calcular Definitiva Anual (promedio de las notas relativas de los períodos que tienen datos)
  const calcularFinalDefinitiva = useCallback((idEstudiantil: string): number | null => {
    let suma = 0;
    let periodosConNota = 0;

    for (let p = 1; p <= 4; p++) {
      const finalPeriodo = calcularFinalPeriodo(idEstudiantil, p);
      if (finalPeriodo !== null) {
        suma += finalPeriodo;
        periodosConNota++;
      }
    }

    if (periodosConNota === 0) return null;

    const promedio = suma / periodosConNota;

    // Redondear a 1 decimal (redondeo matemático estándar)
    return Math.round(promedio * 10) / 10;
  }, [calcularFinalPeriodo]);

  // Verificar si un estudiante tiene AL MENOS UNA NOTA registrada en un período
  // Independientemente de si la actividad tiene porcentaje asignado o no
  const tieneAlgunaNotaEnPeriodo = useCallback((idEstudiantil: string, periodo: number): boolean => {
    const notasEstudiante = notas[idEstudiantil]?.[periodo];
    if (!notasEstudiante) return false;
    
    // Verificar si hay al menos una nota definida (diferente de undefined)
    return Object.values(notasEstudiante).some(nota => nota !== undefined);
  }, [notas]);

  // Verificar si un estudiante tiene AL MENOS UNA NOTA en CUALQUIER período del año
  const tieneAlgunaNotaEnAnio = useCallback((idEstudiantil: string): boolean => {
    return [1, 2, 3, 4].some(periodo => tieneAlgunaNotaEnPeriodo(idEstudiantil, periodo));
  }, [tieneAlgunaNotaEnPeriodo]);

  // === Funciones de descarga ===

  const getNombreArchivo = () => {
    const periodoNombre = esFinalDefinitiva
      ? "Definitiva Anual"
      : periodos[periodoActivo - 1].nombre;
    return `${asignaturaSeleccionada} - ${gradoSeleccionado} ${salonSeleccionado} - ${periodoNombre}`;
  };

  const descargarExcel = async () => {
    setDescargandoExcel(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = await import("file-saver");

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Notas");

      const headers: string[] = ["ID", "Apellidos", "Nombre"];
      const rows: (string | number | null)[][] = [];

      if (esFinalDefinitiva) {
        periodos.forEach(p => headers.push(p.nombre));
        headers.push("Definitiva Anual");

        estudiantes.forEach(est => {
          const fila: (string | number | null)[] = [
            est.id,
            est.apellidos,
            est.nombres,
          ];
          periodos.forEach(p => {
            const fp = calcularFinalPeriodo(est.id, p.numero);
            fila.push(fp !== null ? fp : null);
          });
          const fd = calcularFinalDefinitiva(est.id);
          fila.push(fd !== null ? fd : null);
          rows.push(fila);
        });
      } else {
        const actividadesPeriodo = getActividadesPorPeriodo(periodoActivo);
        actividadesPeriodo.forEach(a => {
          headers.push(a.porcentaje !== null ? `${a.nombre} (${a.porcentaje}%)` : a.nombre);
        });
        headers.push("Definitiva Periodo");

        estudiantes.forEach(est => {
          const fila: (string | number | null)[] = [
            est.id,
            est.apellidos,
            est.nombres,
          ];
          actividadesPeriodo.forEach(a => {
            const nota = notas[est.id]?.[periodoActivo]?.[a.id];
            fila.push(nota !== undefined ? nota : null);
          });
          const fp = calcularFinalPeriodo(est.id, periodoActivo);
          fila.push(fp !== null ? fp : null);
          rows.push(fila);
        });
      }

      // Header row con estilo verde
      const headerRow = ws.addRow(headers);
      headerRow.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" }, bottom: { style: "thin" },
          left: { style: "thin" }, right: { style: "thin" },
        };
      });
      headerRow.height = 22;

      // Data rows
      rows.forEach(row => {
        const dataRow = ws.addRow(row);
        dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFD0D0D0" } },
            bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
            left: { style: "thin", color: { argb: "FFD0D0D0" } },
            right: { style: "thin", color: { argb: "FFD0D0D0" } },
          };
          if (colNumber >= 4) {
            cell.alignment = { horizontal: "center" };
          }
        });
      });

      // Auto-fit column widths
      ws.columns.forEach((col, idx) => {
        let maxLen = headers[idx]?.length || 10;
        rows.forEach(row => {
          const val = row[idx];
          if (val !== null && val !== undefined) {
            maxLen = Math.max(maxLen, val.toString().length);
          }
        });
        col.width = Math.min(maxLen + 4, 40);
      });

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `${getNombreArchivo()}.xlsx`);
    } catch (error) {
      console.error("Error al generar Excel:", error);
    } finally {
      setDescargandoExcel(false);
    }
  };

  const descargarPDF = async () => {
    setDescargandoPDF(true);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      // Construir datos (sin Código en el PDF para ahorrar espacio)
      const headers: string[] = ["Apellidos", "Nombre"];
      const rows: string[][] = [];

      if (esFinalDefinitiva) {
        periodos.forEach(p => headers.push(p.nombre));
        headers.push("Definitiva Anual");

        estudiantes.forEach(est => {
          const fila: string[] = [
            est.apellidos,
            est.nombres,
          ];
          periodos.forEach(p => {
            const fp = calcularFinalPeriodo(est.id, p.numero);
            fila.push(fp !== null ? fp.toString() : "—");
          });
          const fd = calcularFinalDefinitiva(est.id);
          fila.push(fd !== null ? fd.toString() : "—");
          rows.push(fila);
        });
      } else {
        const actividadesPeriodo = getActividadesPorPeriodo(periodoActivo);
        actividadesPeriodo.forEach(a => {
          headers.push(a.porcentaje !== null ? `${a.nombre} (${a.porcentaje}%)` : a.nombre);
        });
        headers.push("Definitiva Periodo");

        estudiantes.forEach(est => {
          const fila: string[] = [
            est.apellidos,
            est.nombres,
          ];
          actividadesPeriodo.forEach(a => {
            const nota = notas[est.id]?.[periodoActivo]?.[a.id];
            fila.push(nota !== undefined ? nota.toString() : "—");
          });
          const fp = calcularFinalPeriodo(est.id, periodoActivo);
          fila.push(fp !== null ? fp.toString() : "—");
          rows.push(fila);
        });
      }

      // Función helper para construir tabla HTML
      const session = getSession();
      const nombreProfesor = `${session.nombres || ""} ${session.apellidos || ""}`.trim();

      const buildTableHTML = (dataRows: string[], showTitle: boolean) => {
        const container = document.createElement("div");
        container.style.cssText = "position:absolute;left:-9999px;top:0;background:white;padding:24px;font-family:'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;";

        if (showTitle) {
          // Encabezado institucional: escudo + nombre — dinámico desde sesión
          const sess = getSession();
          const colegioNombre = sess.colegio_nombre || "Colegio";
          const colegioLogoUrl = sess.colegio_logo_url || "";

          const headerDiv = document.createElement("div");
          headerDiv.style.cssText = "display:flex;align-items:center;gap:12px;margin-bottom:8px;";

          if (colegioLogoUrl) {
            const img = document.createElement("img");
            img.src = colegioLogoUrl;
            img.style.cssText = "width:48px;height:48px;object-fit:contain;";
            // Si la imagen no carga, no rompemos el render
            img.onerror = () => { img.style.display = "none"; };
            headerDiv.appendChild(img);
          }

          const instName = document.createElement("div");
          instName.style.cssText = "font-size:18px;font-weight:700;color:#1a1a1a;";
          instName.textContent = colegioNombre;
          headerDiv.appendChild(instName);

          container.appendChild(headerDiv);

          // Profesor(es) — si hay más de uno compartiendo el aula, salen todos
          // separados por coma. Si el query falló, fallback al profesor logueado.
          const nombresHeader = nombresProfesores || nombreProfesor;
          if (nombresHeader) {
            const profDiv = document.createElement("div");
            profDiv.style.cssText = "font-size:13px;color:#444;margin-bottom:4px;font-weight:500;";
            const etiqueta = nombresHeader.includes(",") ? "Profesores(as)" : "Profesor(a)";
            profDiv.textContent = `${etiqueta}: ${nombresHeader}`;
            container.appendChild(profDiv);
          }

          // Título de la tabla (asignatura - grado - periodo)
          const titulo = document.createElement("div");
          titulo.style.cssText = "margin:0 0 12px 0;font-size:15px;color:#333;font-weight:600;";
          titulo.textContent = getNombreArchivo();
          container.appendChild(titulo);
        }

        const table = document.createElement("table");
        table.style.cssText = "border-collapse:collapse;width:100%;font-size:13px;";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        headers.forEach(h => {
          const th = document.createElement("th");
          th.style.cssText = "background:#16a34a;color:white;padding:6px 4px;border:1px solid #0d8a35;text-align:center;font-weight:700;font-size:11px;word-break:break-word;";
          if (h === "Apellidos" || h === "Nombre") th.style.textAlign = "left";
          th.textContent = h;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        dataRows.forEach((rowStr, rowIdx) => {
          const row = JSON.parse(rowStr) as string[];
          const tr = document.createElement("tr");
          tr.style.backgroundColor = rowIdx % 2 === 0 ? "#ffffff" : "#f0fdf4";
          row.forEach((cell, colIdx) => {
            const td = document.createElement("td");
            td.style.cssText = "padding:4px 3px;border:1px solid #d0d0d0;font-size:11px;font-weight:500;color:#1a1a1a;white-space:nowrap;";
            if (colIdx >= 2) td.style.textAlign = "center";
            if (colIdx === row.length - 1 && cell !== "—") td.style.fontWeight = "700";
            td.textContent = cell;
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        container.appendChild(table);

        // Ancho fijo que cabe en landscape A4 (~1100px) para que las columnas se compriman
        const anchoBase = 1100;
        container.style.width = `${anchoBase}px`;
        table.style.tableLayout = "auto";
        return { container, anchoBase };
      };

      // Renderizar tabla completa para medir altura de filas
      const serializedRows = rows.map(r => JSON.stringify(r));
      const { container: measureContainer, anchoBase } = buildTableHTML(serializedRows, true);
      document.body.appendChild(measureContainer);

      // Medir alturas individuales
      const tableEl = measureContainer.querySelector("table")!;
      const theadEl = tableEl.querySelector("thead")!;
      const tbodyEl = tableEl.querySelector("tbody")!;
      // Medir todo lo que va antes de la tabla (escudo, profesor, título)
      const tableTop = tableEl.offsetTop;
      const containerPadding = 48; // 24px top + 24px bottom
      const titleHeight = tableTop; // todo el espacio antes de la tabla
      const headerHeight = theadEl.offsetHeight;
      const rowHeights: number[] = [];
      const tbodyRows = tbodyEl.querySelectorAll("tr");
      tbodyRows.forEach(tr => rowHeights.push((tr as HTMLElement).offsetHeight));

      document.body.removeChild(measureContainer);

      // Calcular páginas sin cortar filas
      const pdf = new jsPDF("l", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidthMM = pdfWidth - margin * 2;
      const pxPerMM = anchoBase / contentWidthMM;
      const pageContentHeightPx = (pdfHeight - margin * 2) * pxPerMM - containerPadding;

      const pages: { rowStart: number; rowEnd: number; isFirst: boolean }[] = [];
      let currentRow = 0;

      while (currentRow < rows.length) {
        const isFirst = currentRow === 0;
        let availableHeight = pageContentHeightPx - headerHeight;
        if (isFirst) availableHeight -= titleHeight;

        let rowEnd = currentRow;
        let usedHeight = 0;
        while (rowEnd < rows.length) {
          const rh = rowHeights[rowEnd] || 30;
          if (usedHeight + rh > availableHeight) break;
          usedHeight += rh;
          rowEnd++;
        }
        if (rowEnd === currentRow) rowEnd = currentRow + 1; // al menos 1 fila

        pages.push({ rowStart: currentRow, rowEnd, isFirst });
        currentRow = rowEnd;
      }

      // Renderizar y agregar cada página al PDF
      for (let p = 0; p < pages.length; p++) {
        const page = pages[p];
        const pageRows = serializedRows.slice(page.rowStart, page.rowEnd);
        const { container: pageContainer, anchoBase: pageAncho } = buildTableHTML(pageRows, page.isFirst);
        document.body.appendChild(pageContainer);

        const canvas = await html2canvas(pageContainer, {
          scale: 3,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: pageAncho,
        });

        document.body.removeChild(pageContainer);

        if (p > 0) pdf.addPage();

        const imgData = canvas.toDataURL("image/png");
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = contentWidthMM / imgWidth;
        const destHeight = imgHeight * ratio;

        pdf.addImage(imgData, "PNG", margin, margin, contentWidthMM, destHeight);
      }

      pdf.save(`${getNombreArchivo()}.pdf`);
    } catch (error) {
      console.error("Error al generar PDF:", error);
    } finally {
      setDescargandoPDF(false);
    }
  };

  // Guardar nota final en Supabase
  const guardarFinalPeriodo = async (idEstudiantil: string, periodo: number, notaFinal: number | null) => {
    console.log('=== INICIANDO guardarFinalPeriodo ===');
    console.log('Parámetros:', { idEstudiantil, periodo, notaFinal });
    
    // Primero verificar si existe alguna nota para este estudiante en este periodo
    const { data: notasExistentes } = await supabase
      .from('Notas')
      .select('id')
      .eq('ano_escolar', anoEscolarActual())
      .eq('id_estudiantil', idEstudiantil)
      .eq('asignatura', asignaturaSeleccionada)
      .eq('grado', gradoSeleccionado)
      .eq('salon', salonSeleccionado)
      .eq('periodo', periodo)
      .not('nombre_actividad', 'in', '("Definitiva Periodo","Definitiva Anual")')
      .limit(1);
    
    const tieneNotas = notasExistentes && notasExistentes.length > 0;
    
    if (!tieneNotas) {
      // Solo eliminar si NO hay ninguna nota en el periodo
      const { error } = await supabase
        .from('Notas')
        .delete()
        .eq('ano_escolar', anoEscolarActual())
        .eq('id_estudiantil', idEstudiantil)
        .eq('asignatura', asignaturaSeleccionada)
        .eq('grado', gradoSeleccionado)
        .eq('salon', salonSeleccionado)
        .eq('periodo', periodo)
        .eq('nombre_actividad', 'Definitiva Periodo');
      
      console.log('Definitiva Periodo eliminado para:', idEstudiantil, 'Error:', error);
    } else {
      // Hay notas, hacer upsert (con nota NULL o con valor)
      const { data: existente } = await supabase
        .from('Notas')
        .select('comentario')
        .eq('ano_escolar', anoEscolarActual())
        .eq('id_estudiantil', idEstudiantil)
        .eq('asignatura', asignaturaSeleccionada)
        .eq('grado', gradoSeleccionado)
        .eq('salon', salonSeleccionado)
        .eq('periodo', periodo)
        .eq('nombre_actividad', 'Definitiva Periodo')
        .maybeSingle();
      
      const comentarioExistente = existente?.comentario || null;
      
      const { data, error } = await supabase
        .from('Notas')
        .upsert({
          id_estudiantil: idEstudiantil,
          ano_escolar: anoEscolarActual(),
          asignatura: asignaturaSeleccionada,
          grado: gradoSeleccionado,
          salon: salonSeleccionado,
          periodo,
          nombre_actividad: 'Definitiva Periodo',
          porcentaje: null,
          nota: notaFinal,  // Puede ser null, eso está bien
          comentario: comentarioExistente,
          notificado: false,
        }, {
          onConflict: 'id_estudiantil,ano_escolar,asignatura,grado,salon,periodo,nombre_actividad'
        })
        .select();
      
      if (error) {
        console.error('ERROR guardando Definitiva Periodo:', error);
      } else {
        console.log('✅ Definitiva Periodo guardado en Supabase:', idEstudiantil, periodo, notaFinal);
      }
    }
  };

  // Guardar Definitiva Anualen Supabase (preservando comentario existente)
  const guardarFinalDefinitiva = async (idEstudiantil: string, notaFinal: number | null) => {
    console.log('=== INICIANDO guardarFinalDefinitiva ===');
    console.log('Parámetros:', { idEstudiantil, notaFinal, asignatura: asignaturaSeleccionada, grado: gradoSeleccionado, salon: salonSeleccionado });
    
    // Verificar si existe algún Definitiva Periodo para este estudiante
    const { data: finalesPeriodo } = await supabase
      .from('Notas')
      .select('id')
      .eq('ano_escolar', anoEscolarActual())
      .eq('id_estudiantil', idEstudiantil)
      .eq('asignatura', asignaturaSeleccionada)
      .eq('grado', gradoSeleccionado)
      .eq('salon', salonSeleccionado)
      .eq('nombre_actividad', 'Definitiva Periodo')
      .limit(1);
    
    const tienePeriodos = finalesPeriodo && finalesPeriodo.length > 0;
    
    if (!tienePeriodos) {
      // Solo eliminar si NO hay ningún Definitiva Periodo
      const { error } = await supabase
        .from('Notas')
        .delete()
        .eq('ano_escolar', anoEscolarActual())
        .eq('id_estudiantil', idEstudiantil)
        .eq('asignatura', asignaturaSeleccionada)
        .eq('grado', gradoSeleccionado)
        .eq('salon', salonSeleccionado)
        .eq('periodo', 0)
        .eq('nombre_actividad', 'Definitiva Anual');
      console.log('Definitiva Anualeliminada para:', idEstudiantil, 'Error:', error);
    } else {
      // Hay períodos, hacer upsert (con nota NULL o con valor)
      const { data: existente, error: errorConsulta } = await supabase
        .from('Notas')
        .select('comentario')
        .eq('ano_escolar', anoEscolarActual())
        .eq('id_estudiantil', idEstudiantil)
        .eq('asignatura', asignaturaSeleccionada)
        .eq('grado', gradoSeleccionado)
        .eq('salon', salonSeleccionado)
        .eq('periodo', 0)
        .eq('nombre_actividad', 'Definitiva Anual')
        .maybeSingle();
      
      console.log('Consulta comentario existente:', { existente, errorConsulta });
      
      const comentarioExistente = existente?.comentario || null;
      
      const datosUpsert = {
        id_estudiantil: idEstudiantil,
        ano_escolar: anoEscolarActual(),
        asignatura: asignaturaSeleccionada,
        grado: gradoSeleccionado,
        salon: salonSeleccionado,
        periodo: 0,
        nombre_actividad: 'Definitiva Anual',
        porcentaje: null,
        nota: notaFinal,  // Puede ser null, eso está bien
        comentario: comentarioExistente,
        notificado: false,
      };

      console.log('Datos para UPSERT:', datosUpsert);

      const { data, error } = await supabase
        .from('Notas')
        .upsert(datosUpsert, {
          onConflict: 'id_estudiantil,ano_escolar,asignatura,grado,salon,periodo,nombre_actividad'
        })
        .select();
      
      console.log('=== RESULTADO UPSERT Definitiva Anual===');
      console.log('Data:', data);
      console.log('Error:', error);
      
      if (error) {
        console.error('ERROR guardando Definitiva Anual:', error);
      } else {
        console.log('✅ Definitiva Anualguardada exitosamente:', idEstudiantil, notaFinal);
      }
    }
  };

  // Abrir modal de comentario
  const handleAbrirComentario = (
    idEstudiantil: string,
    nombreEstudiante: string,
    actividadId: string,
    nombreActividad: string,
    periodo: number
  ) => {
    if (soloLectura) return;
    setComentarioEditando({
      idEstudiantil,
      nombreEstudiante,
      actividadId,
      nombreActividad,
      periodo,
    });
    setComentarioModalOpen(true);
  };

  // Guardar comentario en Supabase
  const handleGuardarComentario = async (nuevoComentario: string | null) => {
    if (soloLectura) return;
    if (!comentarioEditando) return;
    
    const { idEstudiantil, actividadId, periodo, nombreActividad } = comentarioEditando;
    
    console.log('=== GUARDANDO COMENTARIO ===');
    console.log('Datos:', { idEstudiantil, periodo, nombreActividad, nuevoComentario });
    
    try {
      // Para Definitiva Anual(periodo = 0), verificar si existe el registro
      if (periodo === 0 && nombreActividad === 'Definitiva Anual') {
        const { data: existe } = await supabase
          .from('Notas')
          .select('id, nota')
          .eq('ano_escolar', anoEscolarActual())
          .eq('id_estudiantil', idEstudiantil)
          .eq('asignatura', asignaturaSeleccionada)
          .eq('grado', gradoSeleccionado)
          .eq('salon', salonSeleccionado)
          .eq('periodo', 0)
          .eq('nombre_actividad', 'Definitiva Anual')
          .maybeSingle();
        
        console.log('Registro Definitiva Anualexiste:', existe);
        
        if (!existe) {
          // Calcular la nota actual y crear el registro
          const finalDef = calcularFinalDefinitiva(idEstudiantil);
          console.log('Creando registro Definitiva Anualcon nota:', finalDef);
          
          const { data, error } = await supabase
            .from('Notas')
            .insert({
              id_estudiantil: idEstudiantil,
              ano_escolar: anoEscolarActual(),
              asignatura: asignaturaSeleccionada,
              grado: gradoSeleccionado,
              salon: salonSeleccionado,
              periodo: 0,
              nombre_actividad: 'Definitiva Anual',
              porcentaje: null,
              nota: finalDef,
              comentario: nuevoComentario,
              notificado: false,
            })
            .select();
          
          console.log('Resultado INSERT Definitiva Anual:', { data, error });
          
          if (error) {
            console.error('Error creando Definitiva Anual:', error);
            toast({
              title: "Error",
              description: "No se pudo guardar el comentario",
              variant: "destructive",
            });
            return;
          }
        } else {
          // Actualizar solo el comentario
          const { data, error } = await supabase
            .from('Notas')
            .update({ comentario: nuevoComentario })
            .eq('ano_escolar', anoEscolarActual())
            .eq('id_estudiantil', idEstudiantil)
            .eq('asignatura', asignaturaSeleccionada)
            .eq('grado', gradoSeleccionado)
            .eq('salon', salonSeleccionado)
            .eq('periodo', 0)
            .eq('nombre_actividad', 'Definitiva Anual')
            .select();
          
          console.log('Resultado UPDATE comentario Definitiva Anual:', { data, error });
          
          if (error) {
            console.error('Error actualizando comentario:', error);
            toast({
              title: "Error",
              description: "No se pudo guardar el comentario",
              variant: "destructive",
            });
            return;
          }
        }
      } else {
        // Para otras notas, actualizar normalmente
        const { error } = await supabase
          .from('Notas')
          .update({ comentario: nuevoComentario })
          .eq('ano_escolar', anoEscolarActual())
          .eq('id_estudiantil', idEstudiantil)
          .eq('asignatura', asignaturaSeleccionada)
          .eq('grado', gradoSeleccionado)
          .eq('salon', salonSeleccionado)
          .eq('periodo', periodo)
          .eq('nombre_actividad', nombreActividad);
        
        if (error) {
          console.error('Error guardando comentario:', error);
          toast({
            title: "Error",
            description: "No se pudo guardar el comentario",
            variant: "destructive",
          });
          return;
        }
      }
      
      // Actualizar estado local
      setComentarios(prev => ({
        ...prev,
        [idEstudiantil]: {
          ...prev[idEstudiantil],
          [periodo]: {
            ...prev[idEstudiantil]?.[periodo],
            [actividadId]: nuevoComentario,
          },
        },
      }));
      
      console.log('✅ Comentario guardado exitosamente');
      toast({
        title: nuevoComentario ? "Comentario guardado" : "Comentario eliminado",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Error de conexión",
        variant: "destructive",
      });
    }
  };

  // Eliminar comentario
  const handleEliminarComentario = async (
    idEstudiantil: string,
    actividadId: string,
    nombreActividad: string,
    periodo: number
  ) => {
    try {
      const { error } = await supabase
        .from('Notas')
        .update({ comentario: null })
        .eq('ano_escolar', anoEscolarActual())
        .eq('id_estudiantil', idEstudiantil)
        .eq('asignatura', asignaturaSeleccionada)
        .eq('grado', gradoSeleccionado)
        .eq('salon', salonSeleccionado)
        .eq('periodo', periodo)
        .eq('nombre_actividad', nombreActividad);
      
      if (error) {
        console.error('Error eliminando comentario:', error);
        toast({
          title: "Error",
          description: "No se pudo eliminar el comentario",
          variant: "destructive",
        });
        return;
      }
      
      // Actualizar estado local
      setComentarios(prev => {
        const nuevosComentarios = { ...prev };
        if (nuevosComentarios[idEstudiantil]?.[periodo]) {
          delete nuevosComentarios[idEstudiantil][periodo][actividadId];
        }
        return nuevosComentarios;
      });
      
      toast({
        title: "Comentario eliminado",
      });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // ========== FUNCIONES DE NOTIFICACIÓN ==========
  
  // Obtener datos del profesor desde la sesión
  const getProfesorData = () => {
    const session = getSession();
    return {
      id: session.id,
      nombres: session.nombres,
      apellidos: session.apellidos,
    };
  };

  // Preparar notificación para una nota individual
  const handleNotificarNotaIndividual = (
    estudiante: Estudiante,
    actividad: Actividad,
    nota: number,
    periodo: number
  ) => {
    const datos = [{
      estudiante: {
        id: estudiante.id,
        nombres: estudiante.nombres,
        apellidos: estudiante.apellidos,
      },
      actividad: actividad.nombre,
      nota,
      porcentaje: actividad.porcentaje,
      comentario: comentarios[estudiante.id]?.[periodo]?.[actividad.id] || null,
      notificado: false,
    }];

    setNotificacionPendiente({
      tipo: "nota_individual",
      descripcion: actividad.nombre,
      nombreEstudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
      datos,
    });
    setNotificacionModalOpen(true);
  };

  // Preparar notificación para Definitiva Periodo individual
  const handleNotificarFinalPeriodoIndividual = (
    estudiante: Estudiante,
    periodo: number,
    notaFinal: number
  ) => {
    // "Completo" (REPORTE FINAL): en grupos lo decide el checkbox "Periodo
    // completo"; en plano, la cobertura 100%. Si no, NO se bloquea: va PARCIAL.
    // Cierre = casilla "Periodo completo" en AMBOS modos (plano ya no cierra solo).
    const esCompleto = getPeriodoCompleto(periodo);
    const actividadesDelPeriodo = getActividadesPorPeriodo(periodo);
    const actividadesConPorcentaje = actividadesDelPeriodo.filter(a => a.porcentaje !== null && a.porcentaje > 0);
    
    // Verificar si este estudiante tiene todas las notas de actividades con porcentaje
    const estudianteTieneTodasNotas = actividadesConPorcentaje.every(act => 
      notas[estudiante.id]?.[periodo]?.[act.id] !== undefined
    );
    
    const nombrePeriodo = periodos.find(p => p.numero === periodo)?.nombre;
    const nombreCompleto = `${estudiante.nombres} ${estudiante.apellidos}`;
    
    // Determinar tipo de reporte y mensaje
    let tipoReporte: "completo" | "parcial";
    let razonParcial: "periodo_incompleto" | "notas_faltantes" | null = null;
    let descripcion = "";
    
    if (esCompleto && estudianteTieneTodasNotas) {
      tipoReporte = "completo";
      descripcion = `El período está COMPLETO (100%). Se enviará REPORTE FINAL al/los padre(s) de ${nombreCompleto} sobre:\nFinal ${nombrePeriodo}`;
    } else if (esCompleto && !estudianteTieneTodasNotas) {
      tipoReporte = "parcial";
      razonParcial = "notas_faltantes";
      descripcion = `El período está completo (100%) pero ${nombreCompleto} tiene notas no registradas. Se enviará REPORTE PARCIAL al/los padre(s) sobre:\nFinal ${nombrePeriodo}`;
    } else {
      tipoReporte = "parcial";
      razonParcial = "periodo_incompleto";
      const motivo = `El período aún no se ha cerrado (el profesor no ha marcado "Periodo completo").`;
      descripcion = `${motivo} Se enviará REPORTE PARCIAL con las notas individuales al/los padre(s) de ${nombreCompleto} sobre:\nlo que va del ${nombrePeriodo}`;
    }
    
    // Obtener detalle de actividades si es parcial
    const notasActividades = actividadesDelPeriodo
      .filter(act => notas[estudiante.id]?.[periodo]?.[act.id] !== undefined)
      .map(act => ({
        nombre: act.nombre,
        nota: notas[estudiante.id][periodo][act.id],
        porcentaje: act.porcentaje,
      }));
    
    const datos = [{
      estudiante: {
        id: estudiante.id,
        nombres: estudiante.nombres,
        apellidos: estudiante.apellidos,
      },
      actividad: `Final ${nombrePeriodo}`,
      nota: notaFinal,
      porcentaje: null,
      comentario: comentarios[estudiante.id]?.[periodo]?.[`${periodo}-Definitiva Periodo`] || null,
      notificado: false,
      detalleActividades: notasActividades,
      tipo_reporte_estudiante: tipoReporte,
      razon_parcial: razonParcial,
    }];

    setNotificacionPendiente({
      tipo: esCompleto && estudianteTieneTodasNotas ? "periodo_completo_definitivo" : "periodo_parcial",
      descripcion,
      nombreEstudiante: nombreCompleto,
      datos,
    });
    setNotificacionModalOpen(true);
  };

  // Preparar notificación para Definitiva Anualindividual
  const handleNotificarFinalDefinitivaIndividual = (
    estudiante: Estudiante,
    notaFinal: number
  ) => {
    // Verificar completitud de todos los períodos
    const completitudPeriodos = periodos.map(p => ({
      periodo: p.numero,
      porcentaje: getPorcentajeUsado(p.numero)
    }));
    const todosCompletos = completitudPeriodos.every(p => p.porcentaje === 100);
    const promedioCompletitud = Math.round((completitudPeriodos.reduce((sum, p) => sum + p.porcentaje, 0) / 4) * 100) / 100;
    
    // Verificar si este estudiante tiene notas en todos los períodos
    const estudianteTieneTodasNotas = todosCompletos && periodos.every(p => 
      calcularFinalPeriodo(estudiante.id, p.numero) !== null
    );
    
    const nombreCompleto = `${estudiante.nombres} ${estudiante.apellidos}`;
    
    // Determinar tipo de reporte y mensaje
    let tipoReporte: "completo" | "parcial";
    let razonParcial: "periodo_incompleto" | "notas_faltantes" | null = null;
    let descripcion = "";
    
    if (todosCompletos && estudianteTieneTodasNotas) {
      tipoReporte = "completo";
      descripcion = `Todos los períodos están COMPLETOS (100%). Se enviará REPORTE FINAL ANUAL al/los padre(s) de ${nombreCompleto} sobre:\nDefinitiva Anual`;
    } else if (todosCompletos && !estudianteTieneTodasNotas) {
      tipoReporte = "parcial";
      razonParcial = "notas_faltantes";
      descripcion = `Todos los períodos están completos (100%) pero ${nombreCompleto} tiene notas no registradas. Se enviará REPORTE PARCIAL ANUAL al/los padre(s) sobre:\nDefinitiva Anual`;
    } else {
      tipoReporte = "parcial";
      razonParcial = "periodo_incompleto";
      descripcion = `Los períodos NO están completos (${promedioCompletitud}/100%). Se enviará REPORTE PARCIAL ANUAL con las notas de cada período al/los padre(s) de ${nombreCompleto} sobre:\nDefinitiva Anual`;
    }
    
    // Obtener detalle de períodos
    const finalesPeriodos = periodos.map(p => ({
      periodo: p.nombre,
      nota: calcularFinalPeriodo(estudiante.id, p.numero),
    }));
    
    const datos = [{
      estudiante: {
        id: estudiante.id,
        nombres: estudiante.nombres,
        apellidos: estudiante.apellidos,
      },
      actividad: "Definitiva Anual",
      nota: notaFinal,
      porcentaje: null,
      comentario: comentarios[estudiante.id]?.[0]?.['0-Definitiva Anual'] || null,
      notificado: false,
      detallePeriodos: finalesPeriodos,
      tipo_reporte_estudiante: tipoReporte,
      razon_parcial: razonParcial,
    }];

    setNotificacionPendiente({
      tipo: todosCompletos && estudianteTieneTodasNotas ? "definitiva_completa" : "definitiva_parcial",
      descripcion,
      nombreEstudiante: nombreCompleto,
      datos,
    });
    setNotificacionModalOpen(true);
  };

  // Preparar notificación masiva para una actividad
  const handleNotificarActividad = (actividad: Actividad) => {
    if (soloLectura) return;
    // Contar estudiantes con y sin nota
    const estudiantesConNota = estudiantes.filter(est => 
      notas[est.id]?.[actividad.periodo]?.[actividad.id] !== undefined
    );
    const estudiantesSinNota = estudiantes.length - estudiantesConNota.length;
    
    const datos = estudiantesConNota.map(est => ({
      estudiante: {
        id: est.id,
        nombres: est.nombres,
        apellidos: est.apellidos,
      },
      actividad: actividad.nombre,
      nota: notas[est.id][actividad.periodo][actividad.id],
      porcentaje: actividad.porcentaje,
      comentario: comentarios[est.id]?.[actividad.periodo]?.[actividad.id] || null,
      notificado: false,
      tipo_reporte_estudiante: "completo",
      razon_parcial: null,
    }));

    if (datos.length === 0) {
      toast({
        title: "Sin notas",
        description: "No hay notas registradas para esta actividad",
        variant: "destructive",
      });
      return;
    }

    // Construir mensaje según completitud
    let descripcion = "";
    if (estudiantesSinNota === 0) {
      descripcion = `Se enviará notificación a todos los acudientes sobre:\n${actividad.nombre}`;
    } else {
      descripcion = `Hay ${estudiantesSinNota} estudiante(s) sin nota registrada en esta actividad. Solo se enviará notificación a los acudientes de los ${estudiantesConNota.length} estudiantes que SÍ tienen nota sobre:\n${actividad.nombre}`;
    }

    setNotificacionPendiente({
      tipo: "actividad_individual",
      descripcion,
      datos,
    });
    setNotificacionModalOpen(true);
  };

  // Preparar notificación masiva para período completo
  const handleNotificarPeriodoCompleto = (periodo: number) => {
    if (soloLectura) return;
    // "Completo" (REPORTE FINAL) en modo grupos lo decide el checkbox "Periodo
    // completo"; en modo plano, que la cobertura llegue al 100%. Si NO está
    // completo ya NO se bloquea: se envía REPORTE PARCIAL (provisional), igual
    // que en plano cuando las actividades no suman 100%.
    // Cierre = casilla "Periodo completo" en AMBOS modos (plano ya no cierra solo).
    const esCompleto = getPeriodoCompleto(periodo);
    const actividadesDelPeriodo = getActividadesPorPeriodo(periodo);
    const actividadesConPorcentaje = actividadesDelPeriodo.filter(a => a.porcentaje !== null && a.porcentaje > 0);

    // Para Definitiva Periodo, SOLO verificar que tenga Definitiva Periodo calculado
    // NO importa si tiene todas las notas o no (unos tendrán reporte completo, otros parcial)
    const estudiantesElegibles = estudiantes.filter(est => {
      const finalPeriodo = calcularFinalPeriodo(est.id, periodo);
      return finalPeriodo !== null;
    });
    
    // Calcular estudiantes excluidos (sin ninguna nota)
    const estudiantesExcluidos = estudiantes.length - estudiantesElegibles.length;
    
    // Contar estudiantes con TODAS las actividades completadas (para el mensaje)
    const estudiantesCompletos = estudiantesElegibles.filter(est => {
      return actividadesConPorcentaje.every(act => 
        notas[est.id]?.[periodo]?.[act.id] !== undefined
      );
    });
    
    const estudiantesParciales = estudiantesElegibles.length - estudiantesCompletos.length;
    
    const datos = estudiantesElegibles.map(est => {
      const notasActividades = actividadesDelPeriodo
        .filter(act => notas[est.id]?.[periodo]?.[act.id] !== undefined)
        .map(act => ({
          nombre: act.nombre,
          nota: notas[est.id][periodo][act.id],
          porcentaje: act.porcentaje,
        }));
      
      const esteEstudianteCompleto = actividadesConPorcentaje.every(act => 
        notas[est.id]?.[periodo]?.[act.id] !== undefined
      );

      return {
        estudiante: {
          id: est.id,
          nombres: est.nombres,
          apellidos: est.apellidos,
        },
        actividad: `Final ${periodos.find(p => p.numero === periodo)?.nombre}`,
        nota: calcularFinalPeriodo(est.id, periodo),
        porcentaje: null,
        comentario: comentarios[est.id]?.[periodo]?.[`${periodo}-Definitiva Periodo`] || null,
        notificado: false,
        detalleActividades: notasActividades,
        tipo_reporte_estudiante: (esCompleto && esteEstudianteCompleto) ? "completo" : "parcial",
        razon_parcial: !esCompleto ? "periodo_incompleto" : (!esteEstudianteCompleto ? "notas_faltantes" : null),
      };
    });

    if (datos.length === 0) {
      toast({
        title: "Sin notas",
        description: "No hay notas finales de período calculadas",
        variant: "destructive",
      });
      return;
    }

    // Construir mensaje detallado según completitud
    const nombrePeriodo = periodos.find(p => p.numero === periodo)?.nombre;
    let descripcion = "";
    
    if (esCompleto) {
      if (estudiantesCompletos.length === estudiantesElegibles.length) {
        // Todos tienen todas las notas
        descripcion = `El período está COMPLETO (100%).\n\nSe enviará REPORTE FINAL a los acudientes de ${estudiantesElegibles.length} estudiante(s) sobre:\nFinal ${nombrePeriodo}`;
      } else if (estudiantesParciales === estudiantesElegibles.length) {
        // Todos tienen notas parciales
        descripcion = `El período está completo (100%).\n\nSe enviará REPORTE PARCIAL a los acudientes de ${estudiantesParciales} estudiante(s) sobre:\nFinal ${nombrePeriodo} (tienen notas pendientes)`;
      } else {
        // Mezcla de completos y parciales
        descripcion = `El período está completo (100%).\n\nSe enviará notificación a los acudientes de ${estudiantesElegibles.length} estudiante(s):\n• ${estudiantesCompletos.length} recibirá REPORTE FINAL (todas las notas registradas)\n• ${estudiantesParciales} recibirá REPORTE PARCIAL (notas pendientes)`;
      }

      // Agregar info de excluidos si hay
      if (estudiantesExcluidos > 0) {
        descripcion += `\n\n⚠️ Se excluirá ${estudiantesExcluidos} estudiante(s) sin ninguna nota registrada.`;
      }

      // Agregar sobre qué es la notificación (solo si no es mezcla, porque ya lo tiene)
      if (estudiantesCompletos.length === estudiantesElegibles.length || estudiantesParciales === estudiantesElegibles.length) {
        // Ya tiene el "sobre" incluido en el mensaje
      } else {
        descripcion += `\n\nSobre: Final ${nombrePeriodo}`;
      }
    } else {
      // No "completo": en grupos = checkbox "Periodo completo" sin marcar;
      // en plano = cobertura < 100%. En ambos casos va REPORTE PARCIAL.
      const motivo = `El período aún no se ha cerrado (el profesor no ha marcado "Periodo completo").`;
      descripcion = `${motivo}\n\nSe enviará REPORTE PARCIAL a los acudientes de ${estudiantesElegibles.length} estudiante(s) sobre:\nlo que va del ${nombrePeriodo}`;

      // Agregar info de excluidos si hay
      if (estudiantesExcluidos > 0) {
        descripcion += `\n\n⚠️ Se excluirá ${estudiantesExcluidos} estudiante(s) sin ninguna nota registrada.`;
      }
    }

    setNotificacionPendiente({
      tipo: esCompleto ? "periodo_completo_definitivo" : "periodo_parcial",
      descripcion,
      datos,
    });
    setNotificacionModalOpen(true);
  };

  // Preparar notificación masiva para Definitiva Anual
  const handleNotificarDefinitivaMasiva = () => {
    // Verificar completitud de todos los períodos (actividades asignadas)
    const completitudPeriodos = periodos.map(p => ({
      periodo: p.numero,
      porcentaje: getPorcentajeUsado(p.numero)
    }));
    const todosConActividadesCompletas = completitudPeriodos.every(p => p.porcentaje === 100);
    
    // Filtrar SOLO estudiantes que cumplen los requisitos:
    // 1. Tienen Definitiva Anualcalculada
    // 2. Tienen al menos un período completo (100%) con TODAS las notas
    const estudiantesElegibles = estudiantes.filter(est => {
      const finalDef = calcularFinalDefinitiva(est.id);
      if (finalDef === null) return false;
      
      // Verificar que tenga al menos un período completo con todas las notas
      return tieneAlMenosUnPeriodoCompletoConTodasNotas(est.id);
    });
    
    if (estudiantesElegibles.length === 0) {
      toast({
        title: "Sin estudiantes elegibles",
        description: "Ningún estudiante tiene al menos un período completo (100% con todas las notas registradas)",
        variant: "destructive",
      });
      return;
    }
    
    // Contar estudiantes excluidos (total menos elegibles)
    const estudiantesExcluidos = estudiantes.length - estudiantesElegibles.length;
    
    // Clasificar estudiantes por tipo de reporte:
    // Completo = tiene los 4 períodos al 100% con TODAS las notas en cada uno
    const estudiantesCompletos = estudiantesElegibles.filter(est => {
      for (let p = 1; p <= 4; p++) {
        const porcentaje = getPorcentajeUsado(p);
        if (porcentaje !== 100) return false;
        
        const finalPeriodo = calcularFinalPeriodo(est.id, p);
        if (finalPeriodo === null) return false;
        
        const actividadesDelPeriodo = getActividadesPorPeriodo(p);
        const actividadesConPorcentaje = actividadesDelPeriodo.filter(a => a.porcentaje !== null && a.porcentaje > 0);
        const todasCalificadas = actividadesConPorcentaje.every(act => 
          notas[est.id]?.[p]?.[act.id] !== undefined
        );
        
        if (!todasCalificadas) return false;
      }
      return true;
    });
    
    const estudiantesParciales = estudiantesElegibles.length - estudiantesCompletos.length;
    
    const datos = estudiantesElegibles.map(est => {
      const finalesPeriodos = periodos.map(p => ({
        periodo: p.nombre,
        nota: calcularFinalPeriodo(est.id, p.numero),
      }));
      
      // Verificar si este estudiante tiene todos los períodos completos con notas
      const esteEstudianteCompleto = (() => {
        for (let p = 1; p <= 4; p++) {
          const porcentaje = getPorcentajeUsado(p);
          if (porcentaje !== 100) return false;
          
          const finalPeriodo = calcularFinalPeriodo(est.id, p);
          if (finalPeriodo === null) return false;
          
          const actividadesDelPeriodo = getActividadesPorPeriodo(p);
          const actividadesConPorcentaje = actividadesDelPeriodo.filter(a => a.porcentaje !== null && a.porcentaje > 0);
          const todasCalificadas = actividadesConPorcentaje.every(act => 
            notas[est.id]?.[p]?.[act.id] !== undefined
          );
          
          if (!todasCalificadas) return false;
        }
        return true;
      })();

      return {
        estudiante: {
          id: est.id,
          nombres: est.nombres,
          apellidos: est.apellidos,
        },
        actividad: "Definitiva Anual",
        nota: calcularFinalDefinitiva(est.id),
        porcentaje: null,
        comentario: comentarios[est.id]?.[0]?.['0-Definitiva Anual'] || null,
        notificado: false,
        detallePeriodos: finalesPeriodos,
        tipo_reporte_estudiante: esteEstudianteCompleto ? "completo" : "parcial",
        razon_parcial: !esteEstudianteCompleto ? "notas_faltantes_periodo" : null,
      };
    });

    // Construir mensaje detallado según completitud
    let descripcion = "";
    
    if (todosConActividadesCompletas) {
      descripcion = "Todos los períodos tienen actividades asignadas al 100%.\n\n";
      
      if (estudiantesCompletos.length > 0 && estudiantesParciales === 0) {
        // Todos recibirán reporte completo
        descripcion += `Se enviará REPORTE FINAL COMPLETO a ${estudiantesCompletos.length} estudiante(s) sobre:\nDefinitiva Anual(4 períodos completados)`;
      } else if (estudiantesCompletos.length > 0 && estudiantesParciales > 0) {
        // Mezcla de completos y parciales
        descripcion += `Se enviará notificación a ${estudiantesElegibles.length} estudiante(s):\n`;
        descripcion += `• ${estudiantesCompletos.length} recibirá(n) REPORTE FINAL COMPLETO (4 períodos)\n`;
        descripcion += `• ${estudiantesParciales} recibirá(n) REPORTE PARCIAL (períodos completados individualmente)`;
      } else {
        // Solo parciales
        descripcion += `Se enviará REPORTE PARCIAL a ${estudiantesParciales} estudiante(s) sobre:\nDefinitiva Anual(períodos completados individualmente)`;
      }
      
      if (estudiantesExcluidos > 0) {
        descripcion += `\n\n⚠️ Se excluirá(n) ${estudiantesExcluidos} estudiante(s) que no tiene(n) ningún período completado al 100%.`;
      }
    } else {
      // No todos los períodos tienen actividades al 100%
      const promedioCompletitud = Math.round((completitudPeriodos.reduce((sum, p) => sum + p.porcentaje, 0) / 4));
      
      descripcion = `Los períodos NO tienen todas las actividades asignadas (promedio: ${promedioCompletitud}%).\n\n`;
      descripcion += `Se enviará REPORTE PARCIAL a ${estudiantesElegibles.length} estudiante(s) sobre:\nDefinitiva Anual(períodos con actividades completadas)`;
      
      if (estudiantesExcluidos > 0) {
        descripcion += `\n\n⚠️ Se excluirá(n) ${estudiantesExcluidos} estudiante(s) sin períodos elegibles.`;
      }
    }

    setNotificacionPendiente({
      tipo: todosConActividadesCompletas && estudiantesCompletos.length === estudiantesElegibles.length 
        ? "definitiva_completa" 
        : "definitiva_parcial",
      descripcion,
      datos,
    });
    setNotificacionModalOpen(true);
  };

  // Función para enviar datos al server (multi-tenant via JWT).
  const enviarNotificacionN8n = async (payload: any) => {
    try {
      const data = await apiRequest('/api/notificaciones/notas-actualizadas', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return { success: true, data };
    } catch (error) {
      console.error('Notificación notas error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  };

  // Enviar notificación simplificada a n8n
  const handleEnviarNotificacion = async () => {
    if (!notificacionPendiente) return;

    const session = getSession();
    if (!session.id) {
      toast({
        title: "Error",
        description: "ID del profesor no encontrado",
        variant: "destructive",
      });
      return;
    }

    const esDefinitiva = notificacionPendiente.tipo === "definitiva_completa" || notificacionPendiente.tipo === "definitiva_parcial";
    
    // Determinar tipo_boton basado en el tipo de notificación y cantidad de estudiantes
    const esIndividual = notificacionPendiente.datos.length === 1;
    let tipoBoton = "";
    
    if (notificacionPendiente.tipo === "actividad_individual" || notificacionPendiente.tipo === "nota_individual") {
      tipoBoton = esIndividual ? "actividad_individual" : "actividad_masiva";
    } else if (notificacionPendiente.tipo === "periodo_completo_definitivo" || notificacionPendiente.tipo === "periodo_parcial") {
      tipoBoton = esIndividual ? "periodo_individual" : "periodo_masivo";
    } else if (notificacionPendiente.tipo === "definitiva_completa" || notificacionPendiente.tipo === "definitiva_parcial") {
      tipoBoton = esIndividual ? "definitiva_individual" : "definitiva_masivo";
    }

    // Extraer nombre de actividad si aplica
    const nombreActividad = notificacionPendiente.datos[0]?.actividad || null;
    const esActividadFinal = nombreActividad?.includes("Final");

    // Detectar el período real desde el nombre de la actividad
    let periodoReal = periodoActivo;
    if (esDefinitiva) {
      periodoReal = 0;
    } else if (esActividadFinal && nombreActividad) {
      if (nombreActividad.includes("1er")) periodoReal = 1;
      else if (nombreActividad.includes("2do")) periodoReal = 2;
      else if (nombreActividad.includes("3er")) periodoReal = 3;
      else if (nombreActividad.includes("4to")) periodoReal = 4;
      else if (nombreActividad.includes("Definitiva Anual")) periodoReal = 0;
    }

    // Preparar payload SIMPLE para n8n
    const payload = {
      tipo_boton: tipoBoton,
      profesor: {
        id: session.id,
        nombres: session.nombres,
        apellidos: session.apellidos,
      },
      contexto: {
        asignatura: asignaturaSeleccionada,
        grado: gradoSeleccionado,
        salon: salonSeleccionado,
        periodo: periodoReal
      },
      actividad: esActividadFinal ? null : nombreActividad,
      estudiantes_ids: notificacionPendiente.datos.map((d: any) => d.estudiante.id)
    };

    // Cerrar modal
    setNotificacionModalOpen(false);

    // Mostrar loading
    const toastId = sonnerToast.loading(
      `Enviando notificaciones a acudientes de ${payload.estudiantes_ids.length} estudiante(s)...`
    );

    // Enviar a n8n
    const resultado = await enviarNotificacionN8n(payload);

    // Quitar loading
    sonnerToast.dismiss(toastId);

    // Mostrar resultado
    if (resultado.success) {
      sonnerToast.success(
        `✅ Notificaciones enviadas a acudientes de ${payload.estudiantes_ids.length} estudiante(s)`,
        { duration: 5000 }
      );
      
      // Marcar como notificado en Supabase
      try {
        for (const dato of notificacionPendiente.datos) {
          const actividadNombre = dato.actividad;
          
          let periodoReal = periodoActivo;
          if (esDefinitiva) {
            periodoReal = 0;
          } else if (actividadNombre?.includes("Final")) {
            const match = actividadNombre.match(/(\d)/);
            if (match) {
              periodoReal = parseInt(match[1]);
            }
          }

          await supabase
            .from('Notas')
            .update({ notificado: true })
            .eq('ano_escolar', anoEscolarActual())
            .eq('id_estudiantil', dato.estudiante.id)
            .eq('asignatura', asignaturaSeleccionada)
            .eq('grado', gradoSeleccionado)
            .eq('salon', salonSeleccionado)
            .eq('periodo', periodoReal)
            .eq('nombre_actividad', actividadNombre === "Definitiva Anual" ? "Definitiva Anual" :
              actividadNombre?.includes("Final") ? "Definitiva Periodo" : actividadNombre);
        }
      } catch (error) {
        console.error('Error marcando como notificado:', error);
      }
    } else {
      sonnerToast.error(
        `❌ Error: ${resultado.error}`,
        { duration: 7000 }
      );
    }

    setNotificacionPendiente(null);
  };

  // Verificar si una actividad tiene al menos una nota
  const actividadTieneNotas = (actividad: Actividad): boolean => {
    return estudiantes.some(est => 
      notas[est.id]?.[actividad.periodo]?.[actividad.id] !== undefined
    );
  };

  // Verificar si un período tiene al menos un Final calculado
  const periodoTieneFinal = (periodo: number): boolean => {
    return estudiantes.some(est => calcularFinalPeriodo(est.id, periodo) !== null);
  };

  // Verificar si hay al menos un estudiante que pueda recibir notificación de Definitiva Anual
  // (debe tener al menos un período completo al 100%)
  const hayFinalDefinitiva = (): boolean => {
    return estudiantes.some(est => tieneAlMenosUnPeriodoCompletoConTodasNotas(est.id));
  };

  // ========== FIN FUNCIONES DE NOTIFICACIÓN ==========

  // Función para enfocar la siguiente celda (abajo)
  const focusCeldaAbajo = useCallback((currentStudentIndex: number, actividadId: string, periodo: number) => {
    const nextStudentIndex = currentStudentIndex + 1;

    // Si no hay más estudiantes, no hacer nada
    if (nextStudentIndex >= estudiantes.length) return;

    const nextStudent = estudiantes[nextStudentIndex];
    const nota = notas[nextStudent.id]?.[periodo]?.[actividadId];

    // Activar edición en la siguiente celda
    const celda = { idEstudiantil: nextStudent.id, actividadId, periodo };
    setCeldaEditando(celda);
    celdaEditandoRef.current = celda;
    setValorEditando(nota !== undefined ? nota.toString() : "");
  }, [estudiantes, notas]);

  // Handlers para edición de notas
  const handleClickCelda = (idEstudiantil: string, actividadId: string, periodo: number, notaActual: number | undefined) => {
    const celda = { idEstudiantil, actividadId, periodo };
    setCeldaEditando(celda);
    celdaEditandoRef.current = celda;
    setValorEditando(notaActual !== undefined ? notaActual.toString() : "");
  };

  const handleCambioNota = (valor: string) => {
    // Convertir coma a punto
    const valorNormalizado = valor.replace(",", ".");
    
    // Permitir vacío, números y un punto decimal
    if (valorNormalizado === "" || /^\d*\.?\d{0,2}$/.test(valorNormalizado)) {
      setValorEditando(valorNormalizado);
    }
  };

  const handleGuardarNota = async () => {
    if (soloLectura) return;
    if (!celdaEditando) return;

    const { idEstudiantil, actividadId, periodo } = celdaEditando;
    
    // Encontrar la actividad para obtener nombre y porcentaje
    const actividad = actividades.find(a => a.id === actividadId);
    if (!actividad) {
      console.error("Actividad no encontrada:", actividadId);
      setCeldaEditando(null);
      celdaEditandoRef.current = null;
      setValorEditando("");
      return;
    }

    if (valorEditando.trim() === "") {
      // Si está vacío, eliminar la nota de Supabase
      try {
        console.log("=== ELIMINANDO NOTA ===");
        const { error } = await supabase
          .from('Notas')
          .delete()
          .eq('ano_escolar', anoEscolarActual())
          .eq('id_estudiantil', idEstudiantil)
          .eq('asignatura', asignaturaSeleccionada)
          .eq('grado', gradoSeleccionado)
          .eq('salon', salonSeleccionado)
          .eq('periodo', periodo)
          .eq('nombre_actividad', actividad.nombre);

        if (error) {
          console.error('Error eliminando nota:', error);
          toast({
            title: "Error",
            description: "No se pudo eliminar la nota",
            variant: "destructive",
          });
        } else {
          // Actualizar estado local de notas
          let nuevasNotas = { ...notas };
          if (nuevasNotas[idEstudiantil]?.[periodo]?.[actividadId] !== undefined) {
            delete nuevasNotas[idEstudiantil][periodo][actividadId];
          }
          setNotas(nuevasNotas);
          
          // IMPORTANTE: Eliminar comentario del estado local para quitar indicador naranja
          setComentarios(prev => {
            const nuevosComentarios = { ...prev };
            if (nuevosComentarios[idEstudiantil]?.[periodo]?.[actividadId] !== undefined) {
              delete nuevosComentarios[idEstudiantil][periodo][actividadId];
            }
            return nuevosComentarios;
          });
          
          console.log("Nota eliminada correctamente");
          
          // Recalcular y guardar Definitiva Periodo y Definitiva Anual
          setTimeout(async () => {
            const notaFinal = calcularFinalPeriodoConNotas(nuevasNotas, idEstudiantil, periodo);
            await guardarFinalPeriodo(idEstudiantil, periodo, notaFinal);
            
            // Si ya no hay nota final, eliminar el comentario del Definitiva Periodo del estado local
            if (notaFinal === null) {
              setComentarios(prev => {
                const nuevosComentarios = { ...prev };
                const finalPeriodoId = `${periodo}-Definitiva Periodo`;
                if (nuevosComentarios[idEstudiantil]?.[periodo]?.[finalPeriodoId] !== undefined) {
                  delete nuevosComentarios[idEstudiantil][periodo][finalPeriodoId];
                }
                return nuevosComentarios;
              });
            }
            
            // Recalcular y guardar Definitiva Anual
            let suma = 0;
            let tieneAlgunaNota = false;
            for (let p = 1; p <= 4; p++) {
              const fp = calcularFinalPeriodoConNotas(nuevasNotas, idEstudiantil, p);
              if (fp !== null) {
                suma += fp;
                tieneAlgunaNota = true;
              }
            }
            if (tieneAlgunaNota) {
              const finalDef = Math.round((suma / 4) * 10) / 10;
              await guardarFinalDefinitiva(idEstudiantil, finalDef);
            } else {
              await guardarFinalDefinitiva(idEstudiantil, null);
              // Eliminar comentario del Definitiva Anualdel estado local
              setComentarios(prev => {
                const nuevosComentarios = { ...prev };
                const finalDefId = '0-Definitiva Anual';
                if (nuevosComentarios[idEstudiantil]?.[0]?.[finalDefId] !== undefined) {
                  delete nuevosComentarios[idEstudiantil][0][finalDefId];
                }
                return nuevosComentarios;
              });
            }
          }, 0);
        }
      } catch (error) {
        console.error('Error:', error);
        toast({
          title: "Error",
          description: "Error de conexión al eliminar la nota",
          variant: "destructive",
        });
      }
    } else {
      const nota = parseFloat(valorEditando);
      
      // Validar rango según la escala del colegio (0-5, 0-10, etc.)
      if (isNaN(nota) || nota < colegioConfig.escala_min || nota > colegioConfig.escala_max) {
        toast({
          title: "Error",
          description: `La nota debe estar entre ${colegioConfig.escala_min} y ${colegioConfig.escala_max}`,
          variant: "destructive",
        });
        setCeldaEditando(null);
        celdaEditandoRef.current = null;
        setValorEditando("");
        return;
      }

      const notaRedondeada = Math.round(nota * 100) / 100;

      // Guardar en Supabase con UPSERT
      try {
        console.log("=== GUARDANDO NOTA ===");
        console.log("Datos:", {
          id_estudiantil: idEstudiantil,
          asignatura: asignaturaSeleccionada,
          grado: gradoSeleccionado,
          salon: salonSeleccionado,
          periodo,
          nombre_actividad: actividad.nombre,
          porcentaje: actividad.porcentaje,
          nota: notaRedondeada,
        });

        const { error } = await supabase
          .from('Notas')
          .upsert({
            id_estudiantil: idEstudiantil,
            ano_escolar: anoEscolarActual(),
            asignatura: asignaturaSeleccionada,
            grado: gradoSeleccionado,
            salon: salonSeleccionado,
            periodo,
            nombre_actividad: actividad.nombre,
            porcentaje: actividad.porcentaje,
            nota: notaRedondeada,
            comentario: comentarios[idEstudiantil]?.[periodo]?.[actividadId] || null,
            notificado: false,
          }, {
            onConflict: 'id_estudiantil,ano_escolar,asignatura,grado,salon,periodo,nombre_actividad'
          });

        if (error) {
          console.error('Error guardando nota:', error);
          toast({
            title: "Error",
            description: "No se pudo guardar la nota",
            variant: "destructive",
          });
        } else {
          // Actualizar estado local
          const nuevasNotas = {
            ...notas,
            [idEstudiantil]: {
              ...notas[idEstudiantil],
              [periodo]: {
                ...notas[idEstudiantil]?.[periodo],
                [actividadId]: notaRedondeada,
              },
            },
          };
          setNotas(nuevasNotas);
          console.log("Nota guardada correctamente:", notaRedondeada);
          
          // Calcular y guardar Definitiva Periodo y Definitiva Anualdespués de actualizar el estado
          setTimeout(async () => {
            const notaFinal = calcularFinalPeriodoConNotas(nuevasNotas, idEstudiantil, periodo);
            await guardarFinalPeriodo(idEstudiantil, periodo, notaFinal);
            
            // Recalcular y guardar Definitiva Anual(siempre divide entre 4)
            let suma = 0;
            let tieneAlgunaNota = false;
            for (let p = 1; p <= 4; p++) {
              const fp = calcularFinalPeriodoConNotas(nuevasNotas, idEstudiantil, p);
              if (fp !== null) {
                suma += fp;
                tieneAlgunaNota = true;
              }
              // Si es null, cuenta como 0
            }
            if (tieneAlgunaNota) {
              const finalDef = Math.round((suma / 4) * 10) / 10;
              await guardarFinalDefinitiva(idEstudiantil, finalDef);
            } else {
              await guardarFinalDefinitiva(idEstudiantil, null);
            }
          }, 0);
        }
      } catch (error) {
        console.error('Error:', error);
        toast({
          title: "Error",
          description: "Error de conexión al guardar la nota",
          variant: "destructive",
        });
      }
    }

    // Solo limpiar si no se seleccionó otra celda durante el guardado async
    const current = celdaEditandoRef.current;
    if (!current || (current.idEstudiantil === idEstudiantil && current.actividadId === actividadId)) {
      setCeldaEditando(null);
      celdaEditandoRef.current = null;
      setValorEditando("");
    }
  };

  // "Completar hacia abajo" (estilo Excel): copia el valor de una celda a todas
  // las casillas VACÍAS de abajo en esa misma actividad, deteniéndose en la
  // primera que YA tenga nota (esa nota es el tope). Nunca sobreescribe.
  const handleCompletarAbajo = async (actividad: Actividad, periodo: number, studentIndex: number, valor: number) => {
    if (soloLectura) return;
    const objetivos: string[] = [];
    for (let i = studentIndex + 1; i < estudiantes.length; i++) {
      const est = estudiantes[i];
      if (notas[est.id]?.[periodo]?.[actividad.id] !== undefined) break; // tope: una nota detiene el llenado
      objetivos.push(est.id);
    }
    if (objetivos.length === 0) {
      toast({ title: "Nada que completar", description: "La casilla de abajo ya tiene nota (o es la última)." });
      return;
    }
    try {
      const filas = objetivos.map((id) => ({
        id_estudiantil: id,
        ano_escolar: anoEscolarActual(),
        asignatura: asignaturaSeleccionada,
        grado: gradoSeleccionado,
        salon: salonSeleccionado,
        periodo,
        nombre_actividad: actividad.nombre,
        porcentaje: actividad.porcentaje,
        nota: valor,
        comentario: null,
        notificado: false,
      }));
      const { error } = await supabase
        .from('Notas')
        .upsert(filas, { onConflict: 'id_estudiantil,ano_escolar,asignatura,grado,salon,periodo,nombre_actividad' });
      if (error) {
        toast({ title: "Error", description: "No se pudo completar hacia abajo.", variant: "destructive" });
        return;
      }
      // Estado local + recálculo de definitivas con las notas nuevas.
      const nuevasNotas: NotasEstudiantes = { ...notas };
      for (const id of objetivos) {
        nuevasNotas[id] = {
          ...nuevasNotas[id],
          [periodo]: { ...(nuevasNotas[id]?.[periodo] || {}), [actividad.id]: valor },
        };
      }
      setNotas(nuevasNotas);
      for (const id of objetivos) {
        const nf = calcularFinalPeriodoConNotas(nuevasNotas, id, periodo);
        await guardarFinalPeriodo(id, periodo, nf);
        let suma = 0, tieneAlguna = false;
        for (let p = 1; p <= 4; p++) {
          const fp = calcularFinalPeriodoConNotas(nuevasNotas, id, p);
          if (fp !== null) { suma += fp; tieneAlguna = true; }
        }
        await guardarFinalDefinitiva(id, tieneAlguna ? Math.round((suma / 4) * 10) / 10 : null);
      }
      toast({ title: "Listo", description: `Se completaron ${objetivos.length} casilla(s) con ${valor}.` });
    } catch {
      toast({ title: "Error", description: "Error de conexión al completar.", variant: "destructive" });
    }
  };

  // Resumen de actividades pendientes (sin nota) en un periodo. Solo cuenta
  // actividades YA aplicadas (con ≥1 nota en el aula). Si se pasa actividadId,
  // restringe a esa actividad.
  const resumenPendientes = (periodo: number, actividadId?: string) => {
    const aplicadas = getActividadesPorPeriodo(periodo).filter((a) => actividadTieneNota(a.id, periodo));
    const objetivo = actividadId ? aplicadas.filter((a) => String(a.id) === actividadId) : aplicadas;
    let estudiantesAfectados = 0;
    let totalCasillas = 0;
    for (const est of estudiantes) {
      const faltan = objetivo.filter((a) => notas[est.id]?.[periodo]?.[a.id] === undefined).length;
      if (faltan > 0) { estudiantesAfectados++; totalCasillas += faltan; }
    }
    return { estudiantesAfectados, totalCasillas };
  };

  // Abre el modal de confirmación de "notificar pendientes" (global o por actividad).
  const abrirPendientes = (periodo: number, actividad: Actividad | null) => {
    const { estudiantesAfectados, totalCasillas } = resumenPendientes(periodo, actividad ? String(actividad.id) : undefined);
    if (totalCasillas === 0) {
      toast({ title: "Sin pendientes", description: actividad ? `Todos tienen nota en «${actividad.nombre}».` : "No hay actividades aplicadas sin nota en este periodo." });
      return;
    }
    const descripcion = actividad
      ? `Se notificará a ${estudiantesAfectados} estudiante(s) y a sus acudientes que les falta presentar «${actividad.nombre}».`
      : `Se notificará a ${estudiantesAfectados} estudiante(s) y a sus acudientes sobre ${totalCasillas} actividad(es) sin presentar de este periodo.`;
    setPendientesModal({ actividad: actividad ? actividad.nombre : null, periodo, descripcion });
  };

  // Envía la notificación de pendientes al confirmar el modal.
  const handleEnviarPendientes = async () => {
    if (!pendientesModal) return;
    try {
      const res = await apiRequest('/api/notificaciones/actividades-pendientes', {
        method: 'POST',
        body: JSON.stringify({
          asignatura: asignaturaSeleccionada,
          grado: gradoSeleccionado,
          salon: salonSeleccionado,
          periodo: pendientesModal.periodo,
          actividad: pendientesModal.actividad,
        }),
      }) as { estudiantes_procesados?: number };
      toast({ title: "Notificación enviada", description: `Se notificó a ${res?.estudiantes_procesados ?? 0} estudiante(s) y sus acudientes.` });
    } catch {
      toast({ title: "Error", description: "No se pudo enviar la notificación.", variant: "destructive" });
    }
  };

  // Handler para cuando se presiona Enter (navegar a celda de abajo)
  const handleKeyDownNota = async (e: React.KeyboardEvent<HTMLInputElement>, studentIndex: number, actividadId: string, periodo: number) => {
    if (soloLectura) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      // Marcar que estamos navegando (evita doble guardado con onBlur)
      isNavigating.current = true;
      // Primero guardar la nota (esperar a que termine)
      await handleGuardarNota();
      // Luego mover a la siguiente celda
      focusCeldaAbajo(studentIndex, actividadId, periodo);
      // Resetear el flag después de un pequeño delay
      setTimeout(() => {
        isNavigating.current = false;
      }, 100);
    } else if (e.key === 'Escape') {
      setCeldaEditando(null);
      celdaEditandoRef.current = null;
      setValorEditando("");
    }
  };

  // Efecto para enfocar el input cuando cambia la celda editando
  useEffect(() => {
    if (celdaEditando) {
      const key = `${celdaEditando.idEstudiantil}-${celdaEditando.actividadId}`;
      // Pequeño delay para asegurar que el input se ha renderizado
      setTimeout(() => {
        const input = inputRefs.current[key];
        if (input) {
          input.focus();
          input.select();
        }
      }, 10);
    }
  }, [celdaEditando]);

  /**
   * Modo del periodo: derivado de la existencia de grupos creados.
   * Sin grupos → plana. Con grupos → jerárquica.
   * El usuario alterna entre uno y otro creando o eliminando grupos con
   * el botón "+" (long-press para crear grupo).
   */
  const modoEfectivo = (): 'plana' | 'grupos' => {
    return gruposPeriodoActual.length > 0 ? 'grupos' : 'plana';
  };

  /**
   * "Periodo completo": el profesor lo marca y se PERSISTE en la BD
   * (tabla Periodos_Completos), para que internos, estudiantes, padres y el
   * agente vean si el periodo está cerrado. Antes vivía en localStorage (solo
   * el navegador del profe lo veía).
   */
  const cargarPeriodosCompletos = useCallback(async () => {
    if (!asignaturaSeleccionada || !gradoSeleccionado || !salonSeleccionado) return;
    const { data } = await supabase
      .from('Periodos_Completos')
      .select('periodo, completo')
      .eq('asignatura', asignaturaSeleccionada)
      .eq('grado', gradoSeleccionado)
      .eq('salon', salonSeleccionado)
      .eq('ano_escolar', anoEscolarActual());
    const map: Record<number, boolean> = {};
    (data || []).forEach((pc: any) => { map[pc.periodo] = !!pc.completo; });
    setPeriodosCompletos(map);
  }, [asignaturaSeleccionada, gradoSeleccionado, salonSeleccionado]);

  useEffect(() => { cargarPeriodosCompletos(); }, [cargarPeriodosCompletos]);

  const getPeriodoCompleto = (periodo: number): boolean => periodosCompletos[periodo] === true;

  // Fila base para upsert de un periodo.
  const filaPeriodoCompleto = (p: number, completo: boolean) => ({
    asignatura: asignaturaSeleccionada,
    grado: gradoSeleccionado,
    salon: salonSeleccionado,
    periodo: p,
    ano_escolar: anoEscolarActual(),
    completo,
    fecha_marcado: new Date().toISOString(),
  });

  // Cascada de "Periodo completo":
  //  - MARCAR un periodo marca automáticamente TODOS los anteriores (no se
  //    puede cerrar el 3ro sin que el 1ro y 2do estén cerrados).
  //  - DESMARCAR se BLOQUEA si hay un periodo POSTERIOR marcado completo; primero
  //    hay que desmarcar los posteriores (pop-up explicativo).
  const setPeriodoCompleto = async (periodo: number, valor: boolean) => {
    if (soloLectura) return;

    if (valor) {
      // La casilla solo aparece en periodos calificables (al 100%), así que un
      // periodo sin 100% NUNCA se marca directamente. PERO al cerrar un periodo
      // posterior que sí está al 100%, la cascada marca también TODOS los
      // anteriores (estén o no al 100%). Caso real: el Pestalozziano empezó a
      // usar Normi en el 2do periodo; el 1ro nunca se subirá → se da por
      // cerrado al cerrar el 2do, sin pedir el 100% del 1ro.
      const aMarcar: number[] = [];
      for (let p = 1; p <= periodo; p++) if (!getPeriodoCompleto(p)) aMarcar.push(p);
      if (aMarcar.length === 0) return;
      setPeriodosCompletos(prev => {
        const next = { ...prev };
        for (const p of aMarcar) next[p] = true;
        return next;
      });
      setModoIntentTick(t => t + 1);
      const { error } = await supabase
        .from('Periodos_Completos')
        .upsert(aMarcar.map(p => filaPeriodoCompleto(p, true)), { onConflict: 'colegio_id,asignatura,grado,salon,periodo,ano_escolar' });
      if (error) {
        setPeriodosCompletos(prev => {
          const next = { ...prev };
          for (const p of aMarcar) next[p] = false;
          return next;
        });
        toast({ title: 'No se pudo guardar', description: 'No se pudo marcar el periodo como completo.', variant: 'destructive' });
      }
      return;
    }

    // Desmarcar: bloquear si hay un periodo POSTERIOR marcado completo.
    const posteriorCompleto: number | null =
      [periodo + 1, periodo + 2, periodo + 3, periodo + 4].find(p => p <= 4 && getPeriodoCompleto(p)) ?? null;
    if (posteriorCompleto !== null) {
      toast({
        title: 'Hay un periodo posterior completo',
        description: `El ${posteriorCompleto}° periodo está marcado como completo, por lo que este también debe estarlo. Para desmarcar este periodo, primero desmarca los periodos posteriores.`,
        variant: 'destructive',
      });
      // Forzar re-render para que el checkbox (controlado) vuelva a verse marcado.
      setModoIntentTick(t => t + 1);
      return;
    }
    setPeriodosCompletos(prev => ({ ...prev, [periodo]: false }));
    setModoIntentTick(t => t + 1);
    const { error } = await supabase
      .from('Periodos_Completos')
      .upsert(filaPeriodoCompleto(periodo, false), { onConflict: 'colegio_id,asignatura,grado,salon,periodo,ano_escolar' });
    if (error) {
      setPeriodosCompletos(prev => ({ ...prev, [periodo]: true }));
      toast({ title: 'No se pudo guardar', description: 'No se pudo desmarcar el periodo.', variant: 'destructive' });
    }
  };
  /**
   * Verifica si el periodo es "calificable" — habilita el checkbox
   * "¿Periodo completo?". Soporta:
   *  - Modo plano puro: actividades sin grupo, sus % suman 100.
   *  - Modo grupos puro: grupos top con %, suman 100; cada hoja tiene
   *    al menos una actividad; todos los grupos tienen % asignado.
   *  - Modo mixto: actividades sueltas (%) + grupos top (%) suman 100.
   */
  const periodoEsCalificable = (periodo: number): boolean => {
    const gruposPeriodo = gruposNotas.filter(g => g.periodo === periodo);
    const actsPeriodo = actividades.filter(a => a.periodo === periodo);
    if (actsPeriodo.length === 0) return false;
    const actsSueltas = actsPeriodo.filter(a => !a.grupo_id && a.porcentaje !== null);
    const sumaSueltas = actsSueltas.reduce((s, a) => s + Number(a.porcentaje || 0), 0);

    // Modo plano puro (sin grupos): las actividades sueltas con % deben sumar 100.
    // El checkbox aparece apenas la ESTRUCTURA llega a 100% — NO se exige que el
    // profe haya puesto notas (los reportes salen parciales si faltan).
    if (gruposPeriodo.length === 0) {
      return Math.abs(sumaSueltas - 100) <= 0.01;
    }

    // Modo grupos / mixto: todos los grupos con %, y la suma (% grupos top +
    // % actividades sueltas) = 100, y cada hoja con al menos 1 actividad definida.
    if (gruposPeriodo.some(g => g.porcentaje === null)) return false;
    const tops = gruposPeriodo.filter(g => !g.parent_id);
    const sumaTops = tops.reduce((s, g) => s + Number(g.porcentaje || 0), 0);
    if (Math.abs(sumaTops + sumaSueltas - 100) > 0.01) return false;
    const hojas = gruposPeriodo.filter(g => !gruposPeriodo.some(h => h.parent_id === g.id));
    if (!hojas.every(h => actsPeriodo.some(a => a.grupo_id === h.id))) return false;
    return true;
  };


  /** Estado para confirmar eliminación de un grupo individual desde el menú "..." */
  const [grupoAEliminar, setGrupoAEliminar] = useState<GrupoNotas | null>(null);

  /** Edición de un grupo (cambiar nombre y/o %) desde el menú "..." */
  const [grupoAEditar, setGrupoAEditar] = useState<GrupoNotas | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editPorcentaje, setEditPorcentaje] = useState("");
  const [editReplicarPeriodos, setEditReplicarPeriodos] = useState(false);
  const [editReplicarSalones, setEditReplicarSalones] = useState(false);
  const handleAbrirEditarGrupo = (g: GrupoNotas) => {
    if (soloLectura) return;
    setGrupoAEditar(g);
    setEditNombre(g.nombre || "");
    setEditPorcentaje(g.porcentaje !== null && g.porcentaje !== undefined ? String(g.porcentaje) : "");
    setEditReplicarPeriodos(false);
    setEditReplicarSalones(false);
  };
  const handleGuardarEdicionGrupo = async () => {
    if (soloLectura) return;
    if (!grupoAEditar) return;
    const nombreLimpio = editNombre.trim();
    if (!nombreLimpio) {
      toast({ title: "Error", description: "El nombre del grupo no puede estar vacío.", variant: "destructive" });
      return;
    }
    // % opcional: vacío → null. Si lo da, debe estar entre 0.01 y 100.
    let pct: number | null = null;
    if (editPorcentaje.trim() !== '') {
      const n = parseFloat(editPorcentaje);
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        toast({ title: "Error", description: "El porcentaje debe estar entre 0.01 y 100, o vacío.", variant: "destructive" });
        return;
      }
      pct = n;
    }
    try {
      const body: any = { nombre: nombreLimpio, porcentaje: pct };
      if (editReplicarPeriodos) {
        body.replicar_periodos = [1, 2, 3, 4].filter(p => p !== periodoActual);
      }
      if (editReplicarSalones && otrosSalones.length > 0) {
        body.replicar_salones = otrosSalones;
      }
      await apiClient.gruposNotas.editar(grupoAEditar.id, body);
      await reloadGrupos();
      setGrupoAEditar(null);
    } catch (e: any) {
      const body = e?.body || {};
      toast({ title: "No se pudo guardar", description: body.detail || e?.message || 'Error', variant: 'destructive' });
    }
  };
  const handleEliminarGrupo = async () => {
    if (soloLectura) return;
    if (!grupoAEliminar) return;
    try {
      await apiClient.gruposNotas.eliminar(grupoAEliminar.id);
      await reloadGrupos();
    } catch (e: any) {
      const body = (e?.body || {}) as any;
      toast({ title: "No se pudo eliminar", description: body.detail || e?.message || 'Error', variant: 'destructive' });
    } finally {
      setGrupoAEliminar(null);
    }
  };

  /**
   * Elimina TODOS los grupos del periodo activo y vuelve a modo plano.
   * Las actividades que estuvieran dentro de grupos quedan con grupo_id=NULL
   * (el endpoint DELETE de cada grupo ya se encarga de convertir sus
   * actividades a plano calculando su pct_efectivo).
   */
  const handleConfirmarVolverPlano = async () => {
    if (soloLectura) return;
    try {
      for (const g of gruposPeriodoActual) {
        await apiClient.gruposNotas.eliminar(g.id);
      }
      await reloadGrupos();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "No se pudieron eliminar los grupos." });
    } finally {
      setConfirmarVolverPlano(false);
    }
  };

  // SELECTOR DE PERIODO: tras elegir el salón, si aún no se eligió periodo
  // (no hay ?periodo= en la URL), se muestran los 4 periodos + Definitiva Anual.
  // Al entrar a uno se ve su tabla (con las pestañas para saltar entre periodos).
  if (!soloLectura && !hayPeriodoElegido) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <HeaderNormi backLink="/dashboard" />
        <main className="flex-1 container mx-auto p-4 md:p-8">
          <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Asignaturas</button>
              <span className="text-muted-foreground">→</span>
              <button onClick={() => navigate("/seleccionar-grado")} className="text-primary hover:underline">{asignaturaSeleccionada}</button>
              <span className="text-muted-foreground">→</span>
              <button onClick={() => navigate("/seleccionar-salon")} className="text-primary hover:underline">{gradoSeleccionado}</button>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground font-medium">{salonSeleccionado}</span>
            </div>
          </div>
          <div className="bg-card rounded-lg shadow-soft p-6 md:p-8">
            <h2 className="text-xl font-bold text-foreground mb-6 text-center">Elige tu periodo:</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {periodos.map((p) => {
                const pct = getPorcentajeUsado(p.numero);
                const completo = getPeriodoCompleto(p.numero);
                const calificable = periodoEsCalificable(p.numero);
                return (
                  <div
                    key={p.numero}
                    onClick={() => irAPeriodo(p.numero)}
                    className="p-6 rounded-lg border-2 border-border bg-background text-center transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/10 cursor-pointer flex flex-col items-center gap-3"
                  >
                    <span className="font-medium text-foreground">{p.nombre}</span>
                    {/* Casilla si el periodo es calificable (100%) O si ya está marcado
                        completo por cascada (ej. 1er periodo sin notas cerrado al cerrar el 2do). */}
                    {(calificable || completo) ? (
                      <label
                        onClick={(e) => e.stopPropagation()}
                        title="Marcar/desmarcar periodo completo"
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap ${completo ? 'bg-green-600 text-white' : 'bg-muted text-foreground'}`}
                      >
                        <input
                          type="checkbox"
                          checked={completo}
                          onChange={(e) => setPeriodoCompleto(p.numero, e.target.checked)}
                          className="w-3.5 h-3.5 accent-green-600 cursor-pointer"
                        />
                        <span>Completo</span>
                      </label>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">{pct}%</span>
                    )}
                  </div>
                );
              })}
              {(() => {
                const pct = getPorcentajePromedioAnual();
                const completo = pct === 100;
                return (
                  <div
                    onClick={() => irAPeriodo(0)}
                    className="p-6 rounded-lg border-2 border-border bg-background text-center transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/10 cursor-pointer flex flex-col items-center gap-3"
                  >
                    <span className="font-medium text-foreground">Definitiva Anual</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${completo ? 'bg-green-600 text-white font-semibold' : 'bg-muted text-foreground'}`}>{pct}/100%</span>
                  </div>
                );
              })()}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen md:h-screen bg-background flex flex-col">
      <HeaderNormi backLink={soloLectura ? (isAdmin() ? "/dashboard-admin" : "/dashboard-rector") : "/dashboard"} />

      {/* Main Content */}
      <main className="flex-1 min-w-0 md:flex md:flex-col md:overflow-hidden container mx-auto p-4 md:p-8">
        {/* Breadcrumb — el orden y los enlaces dependen del flujo de entrada:
            profesor entra por Asignaturas; admin/rector (soloLectura) entra por
            Notas → grado → salón → Por Asignatura, con la asignatura al final. */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {soloLectura ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button onClick={() => navigate(isAdmin() ? "/dashboard-admin" : "/dashboard-rector")} className="text-primary hover:underline">Inicio</button>
                <span className="text-muted-foreground">→</span>
                <button onClick={() => navigate("/rector/seleccionar-grado")} className="text-primary hover:underline">Notas</button>
                <span className="text-muted-foreground">→</span>
                <button onClick={() => navigate("/rector/seleccionar-salon")} className="text-primary hover:underline">{gradoSeleccionado}</button>
                <span className="text-muted-foreground">→</span>
                <button onClick={() => navigate("/rector/modo-visualizacion")} className="text-primary hover:underline">{salonSeleccionado}</button>
                <span className="text-muted-foreground">→</span>
                <button onClick={() => navigate("/rector/lista-asignaturas")} className="text-primary hover:underline">Por Asignatura</button>
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground font-medium">{asignaturaSeleccionada}</span>
              </div>
            ) : (
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
              <button onClick={volverASelectorPeriodo} className="text-primary hover:underline">
                {salonSeleccionado}
              </button>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground font-medium">
                {periodoActivo === 0 ? 'Definitiva Anual' : (periodos[periodoActivo - 1]?.nombre || `Periodo ${periodoActivo}`)}
              </span>
            </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/actividades-calendario")}
                className="gap-2"
              >
                <Calendar className="h-4 w-4" />
                Ver Actividades Asignadas
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={descargarExcel}
                disabled={descargandoExcel}
                className="gap-2"
              >
                {descargandoExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {descargandoExcel ? "Generando..." : "Descargar Excel"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={descargarPDF}
                disabled={descargandoPDF}
                className="gap-2"
              >
                {descargandoPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {descargandoPDF ? "Generando..." : "Descargar PDF"}
              </Button>
            </div>
          </div>
        </div>

        {/* Barra de info: profesor(es) del aula + estado del periodo (visible para todos) */}
        <div className="bg-card rounded-lg shadow-soft px-4 py-2.5 mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-foreground">
            {nombresProfesores ? (
              <span>
                <span className="font-semibold">{nombresProfesores.includes(',') ? 'Profesores(as): ' : 'Profesor(a): '}</span>
                {nombresProfesores}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin profesor asignado</span>
            )}
          </div>
          {periodoActivo >= 1 && (
            // Ambos modos: "completo" solo si el profe marcó la casilla
            // "Periodo completo" (ya no se cierra solo por %-suma en plano).
            (getPeriodoCompleto(periodoActivo)) ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
                ✓ Periodo completo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                Periodo no completo
              </span>
            )
          )}
        </div>

        {/* Pestañas de Períodos */}
        <div className="bg-card rounded-lg shadow-soft md:flex-1 md:flex md:flex-col md:min-h-0 md:overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-border rounded-t-lg overflow-hidden">
            {periodos.map((periodo) => {
              const porcentajeUsado = getPorcentajeUsado(periodo.numero);
              const isActive = periodoActivo === periodo.numero;
              return (
                <button
                  key={periodo.numero}
                  onClick={() => irAPeriodo(periodo.numero)}
                  className={`flex-1 px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium transition-colors relative
                    ${isActive 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                >
                  {/* Mobile: solo número y porcentaje */}
                  <span className="md:hidden">
                    {periodo.numero}° ({porcentajeUsado}%)
                  </span>
                  {/* Desktop: texto completo */}
                  <span className="hidden md:inline">
                    {periodo.nombre}
                    <span className={`ml-2 text-xs ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                      ({porcentajeUsado}%)
                    </span>
                  </span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-foreground" />
                  )}
                </button>
              );
            })}
            {/* Pestaña Definitiva Anual*/}
            {(() => {
              const porcentajePromedio = getPorcentajePromedioAnual();
              const estaCompleto = porcentajePromedio === 100;
              return (
                <button
                  onClick={() => irAPeriodo(0)}
                  className={`flex-1 px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium transition-colors relative
                    ${esFinalDefinitiva 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                >
                  {/* Mobile: abreviado */}
                  <span className="md:hidden flex items-center justify-center gap-1">
                    Final ({porcentajePromedio}%)
                    {estaCompleto && <span>✓</span>}
                  </span>
                  {/* Desktop: texto completo */}
                  <span className="hidden md:flex items-center justify-center gap-1">
                    Definitiva Anual
                    <span className={estaCompleto ? 'text-green-300' : ''}>
                      ({porcentajePromedio}/100%)
                    </span>
                    {estaCompleto && <span>✓</span>}
                  </span>
                  {esFinalDefinitiva && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-foreground" />
                  )}
                </button>
              );
            })()}
          </div>

          {/* Tabla de Notas */}
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              Cargando estudiantes...
            </div>
          ) : estudiantes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No hay estudiantes en este salón
            </div>
          ) : (
            <>
            {!soloLectura && !esFinalDefinitiva && getActividadesPorPeriodo(periodoActivo).length > 0 && (
              <div className="flex items-center justify-end gap-4 px-3 py-2 border-l border-t border-border bg-muted/20 flex-wrap">
                <button
                  onClick={() => abrirPendientes(periodoActivo, null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-semibold transition-colors"
                  title="Avisar a estudiantes y acudientes las actividades sin nota"
                >
                  📭 Notificar pendientes
                </button>
                {getEstructuraThead(periodoActivo).hayJerarquia && (
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={verPromedios}
                      onChange={(e) => setVerPromedios(e.target.checked)}
                      className="w-4 h-4 accent-primary cursor-pointer"
                    />
                    Ver promedios por grupo
                  </label>
                )}
              </div>
            )}
            <div ref={tableContainerRef} className="overflow-x-auto md:overflow-auto md:flex-1 md:min-h-0 border-l border-t border-border">
              {soloLectura && (
                <style>{`.ro-notas thead button{display:none!important;}`}</style>
              )}
              <table className={`w-full border-separate border-spacing-0${soloLectura ? ' ro-notas' : ''}`}>
                <thead>
                  {(() => {
                    const estructura = !esFinalDefinitiva ? getEstructuraThead(periodoActivo) : null;
                    const usarJerarquia = !!estructura && estructura.hayJerarquia;
                    const filasThead = usarJerarquia ? (estructura.necesitaFila2 ? 3 : 2) : 1;
                    return (
                      <>
                        {/* Fila 1: cabecera principal (IDs + grupos top + Definitiva) */}
                        <tr className="bg-primary text-primary-foreground">
                          <th rowSpan={filasThead} className="md:sticky md:left-0 z-20 bg-primary border-r border-b border-border/30 w-[80px] md:w-[100px] min-w-[80px] md:min-w-[100px] p-2 md:p-3 text-left font-semibold text-xs md:text-sm">
                            ID
                          </th>
                          <th rowSpan={filasThead} className="md:sticky md:left-[100px] z-20 bg-primary border-r border-b border-border/30 w-[120px] md:w-[180px] min-w-[120px] md:min-w-[180px] p-2 md:p-3 text-left font-semibold text-xs md:text-sm">
                            Apellidos
                          </th>
                          <th rowSpan={filasThead} className="md:sticky md:left-[280px] z-20 bg-primary border-r border-b border-border/30 w-[100px] md:w-[150px] min-w-[100px] md:min-w-[150px] p-2 md:p-3 text-left font-semibold text-xs md:text-sm">
                            Nombre
                          </th>

                          {esFinalDefinitiva ? (
                            <>
                              {periodos.map((periodo) => (
                                <th
                                  key={periodo.numero}
                                  className="border-r border-b border-border/30 p-2 text-center text-xs font-medium min-w-[120px] bg-primary/80"
                                >
                                  {periodo.nombre}
                                </th>
                              ))}
                              <th className="border-r border-b border-border/30 p-2 text-center text-xs font-semibold min-w-[130px] bg-primary" id="col-final-definitiva">
                                Definitiva Anual
                              </th>
                            </>
                          ) : usarJerarquia ? (
                            <>
                              {/* Bloques de grupos top (con colSpan / rowSpan según jerarquía) */}
                              {estructura.secciones.map((sec, i) => {
                                if (sec.tipo === 'sin-grupo') {
                                  // Cada actividad sin grupo va como th individual, ocupando todas las filas.
                                  // Color de actividad (verde claro estilo Pati), no de grupo.
                                  return sec.actividades.map((actividad) => (
                                    <th
                                      key={`th-sg-${actividad.id}`}
                                      rowSpan={filasThead}
                                      className="border-r border-b border-border/30 p-2 text-center text-xs font-medium min-w-[120px] bg-emerald-300 text-emerald-950"
                                    >
                                      <div className="flex items-center justify-center gap-1">
                                        <div className="flex-1 min-w-0">
                                          <div className="whitespace-nowrap" title={actividad.nombre}>
                                            {actividad.nombre}
                                          </div>
                                          {actividad.porcentaje !== null && (
                                            <div className="text-emerald-900/70 text-xs">
                                              ({actividad.porcentaje}%)
                                            </div>
                                          )}
                                        </div>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button className="p-1 hover:bg-emerald-200 rounded transition-colors">
                                              <MoreVertical className="w-3 h-3" />
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="bg-background z-50">
                                            <DropdownMenuItem onClick={() => handleAbrirModalEditar(actividad)}>
                                              <Pencil className="w-4 h-4 mr-2" />
                                              Editar actividad
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              onClick={() => handleConfirmarEliminar(actividad)}
                                              className="text-destructive focus:text-destructive"
                                            >
                                              <Trash2 className="w-4 h-4 mr-2" />
                                              Eliminar actividad
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </th>
                                  ));
                                }
                                if (sec.tipo === 'grupo-hoja') {
                                  // Grupo sin subgrupos: ocupa fila 1 (y fila 2 si necesitaFila2)
                                  return (
                                    <th
                                      key={`th-gh-${sec.grupo.id}`}
                                      colSpan={sec.colSpan}
                                      rowSpan={estructura.necesitaFila2 ? 2 : 1}
                                      className="border-r border-b border-border/30 p-2 text-center text-xs font-semibold bg-emerald-800 text-white relative"
                                    >
                                      <div className="flex flex-col items-center">
                                        <span>{sec.grupo.nombre}</span>
                                        {sec.grupo.porcentaje !== null && (
                                          <span className="text-white/70 text-[10px]">({sec.grupo.porcentaje}%)</span>
                                        )}                                      </div>
                                      {!soloLectura && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button className="absolute top-1 right-1 p-1 rounded hover:bg-white/20" title="Más opciones">
                                            <MoreVertical className="w-3 h-3 text-white" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-background z-50">
                                          <DropdownMenuItem onClick={() => handleAbrirModal(periodoActivo, 'actividad', sec.grupo.id)}>
                                            <Plus className="w-4 h-4 mr-2" /> Agregar actividad
                                          </DropdownMenuItem>
                                          {/* Solo permitir crear subgrupo si el grupo está vacío
                                              (no tiene actividades directas), para evitar mezcla. */}
                                          {sec.actividades.length === 0 && (
                                            <DropdownMenuItem onClick={() => handleAbrirModal(periodoActivo, 'grupo', sec.grupo.id)}>
                                              <Plus className="w-4 h-4 mr-2" /> Agregar subgrupo
                                            </DropdownMenuItem>
                                          )}
                                          <DropdownMenuItem onClick={() => handleAbrirEditarGrupo(sec.grupo as any)}>
                                            <Pencil className="w-4 h-4 mr-2" /> Editar grupo
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => setGrupoAEliminar(sec.grupo as any)} className="text-destructive focus:text-destructive">
                                            <Trash2 className="w-4 h-4 mr-2" /> Eliminar grupo
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                      )}
                                    </th>
                                  );
                                }
                                // grupo-con-sub: en fila 1 solo el padre con colSpan total
                                return (
                                  <th
                                    key={`th-gp-${sec.grupo.id}`}
                                    colSpan={sec.colSpan}
                                    className="border-r border-b border-border/30 p-2 text-center text-xs font-semibold bg-emerald-800 text-white relative"
                                  >
                                    <div className="flex flex-col items-center">
                                      <span>{sec.grupo.nombre}</span>
                                      {sec.grupo.porcentaje !== null && (
                                        <span className="text-white/70 text-[10px]">({sec.grupo.porcentaje}%)</span>
                                      )}
                                    </div>
                                    {!soloLectura && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button className="absolute top-1 right-1 p-1 rounded hover:bg-white/20" title="Más opciones">
                                          <MoreVertical className="w-3 h-3 text-white" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="bg-background z-50">
                                        {/* Este grupo ya tiene subgrupos → no aceptar actividades directas.
                                            Solo se puede agregar otro subgrupo. */}
                                        <DropdownMenuItem onClick={() => handleAbrirModal(periodoActivo, 'grupo', sec.grupo.id)}>
                                          <Plus className="w-4 h-4 mr-2" /> Agregar subgrupo
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleAbrirEditarGrupo(sec.grupo as any)}>
                                          <Pencil className="w-4 h-4 mr-2" /> Editar grupo
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setGrupoAEliminar(sec.grupo as any)} className="text-destructive focus:text-destructive">
                                          <Trash2 className="w-4 h-4 mr-2" /> Eliminar grupo
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    )}
                                  </th>
                                );
                              })}
                              {!soloLectura && (
                              <th rowSpan={filasThead} className="border-r border-b border-border/30 p-2 text-center min-w-[110px] bg-primary/90">
                                <BotonAgregarConLongPress
                                  onActividad={() => handleAbrirModal(periodoActivo, 'actividad')}
                                  onGrupo={() => handleAbrirModal(periodoActivo, 'grupo')}
                                  disabled={!aulaActual}
                                />
                              </th>
                              )}
                              {(() => {
                                // Modo Grupos: checkbox "¿Periodo completo?" cuando es calificable
                                const calificable = periodoEsCalificable(periodoActivo);
                                const marcado = getPeriodoCompleto(periodoActivo);
                                return (
                                  <th rowSpan={filasThead} className="border-r border-b border-border/30 p-2 text-center text-xs font-semibold min-w-[150px] bg-primary">
                                    <div className="flex flex-col items-center gap-1">
                                      <span>Definitiva Periodo</span>
                                      {!soloLectura && ((calificable || marcado) ? (
                                        <label className="flex items-center gap-1 cursor-pointer text-xs text-primary-foreground/90 hover:text-primary-foreground">
                                          <span>(¿Periodo completo?)</span>
                                          <input
                                            type="checkbox"
                                            checked={marcado}
                                            onChange={(e) => setPeriodoCompleto(periodoActivo, e.target.checked)}
                                            className="w-4 h-4 rounded border-white/50 accent-green-400 cursor-pointer"
                                          />
                                        </label>
                                      ) : (
                                        <span className="text-[10px] text-primary-foreground/60">
                                          (faltan actividades)
                                        </span>
                                      ))}
                                    </div>
                                  </th>
                                );
                              })()}
                            </>
                          ) : (
                            <>
                              {/* Modo plano (sin grupos): una columna por actividad */}
                              {getActividadesPorPeriodo(periodoActivo).map((actividad) => (
                                <th
                                  key={actividad.id}
                                  className="border-r border-b border-border/30 p-2 text-center text-xs font-medium min-w-[120px] bg-primary/90"
                                >
                                  <div className="flex items-center justify-center gap-1">
                                    <div className="flex-1 min-w-0">
                                      <div className="whitespace-nowrap" title={actividad.nombre}>
                                        {actividad.nombre}
                                      </div>
                                      {actividad.porcentaje !== null && (
                                        <div className="text-primary-foreground/70 text-xs">
                                          ({actividad.porcentaje}%)
                                        </div>
                                      )}
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button className="p-1 hover:bg-primary-foreground/20 rounded transition-colors">
                                          <MoreVertical className="w-3 h-3" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="bg-background z-50">
                                        <DropdownMenuItem onClick={() => handleAbrirModalEditar(actividad)}>
                                          <Pencil className="w-4 h-4 mr-2" />
                                          Editar actividad
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleConfirmarEliminar(actividad)}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <Trash2 className="w-4 h-4 mr-2" />
                                          Eliminar actividad
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </th>
                              ))}
                              {!soloLectura && (
                              <th className="border-r border-b border-border/30 p-2 text-center min-w-[110px] bg-primary/90">
                                <BotonAgregarConLongPress
                                  onActividad={() => handleAbrirModal(periodoActivo, 'actividad')}
                                  onGrupo={() => handleAbrirModal(periodoActivo, 'grupo')}
                                  disabled={!aulaActual}
                                />
                              </th>
                              )}
                              {(() => {
                                const porcentajeUsado = getPorcentajeUsado(periodoActivo);
                                const isComplete = porcentajeUsado === 100;
                                // Plano: al llegar a 100% aparece la casilla "Periodo completo"
                                // y el profesor la marca (no se cierra solo). Igual que en grupos.
                                const calificable = periodoEsCalificable(periodoActivo);
                                const marcado = getPeriodoCompleto(periodoActivo);
                                return (
                                  <th className="border-r border-b border-border/30 p-2 text-center text-xs font-medium min-w-[130px] bg-primary">
                                    <div className="flex flex-col items-center gap-1">
                                      <span>Definitiva Periodo</span>
                                      {!soloLectura && (calificable || marcado) ? (
                                        <label className="flex items-center gap-1 cursor-pointer text-xs text-primary-foreground/90 hover:text-primary-foreground">
                                          <span>(¿Periodo completo?)</span>
                                          <input
                                            type="checkbox"
                                            checked={marcado}
                                            onChange={(e) => setPeriodoCompleto(periodoActivo, e.target.checked)}
                                            className="w-4 h-4 rounded border-white/50 accent-green-400 cursor-pointer"
                                          />
                                        </label>
                                      ) : (
                                        <span className={`text-xs ${isComplete ? 'text-green-300' : 'text-primary-foreground/70'}`}>
                                          ({porcentajeUsado}/100%)
                                          {isComplete && ' ✓'}
                                        </span>
                                      )}
                                    </div>
                                  </th>
                                );
                              })()}
                            </>
                          )}
                        </tr>

                        {/* Fila 2 (modo jerárquico): subgrupos. Los grupos hoja ya usaron rowSpan.
                            Las actividades directas de un grupo padre (sub virtual) se renderizan
                            como TH de actividad con rowSpan=2, así ocupan ambas filas y se ven
                            centradas al lado de los subgrupos reales — sin etiqueta extra. */}
                        {usarJerarquia && estructura.necesitaFila2 && (
                          <tr className="bg-primary text-primary-foreground">
                            {estructura.secciones.flatMap((sec) => {
                              if (sec.tipo !== 'grupo-con-sub') return [];
                              return sec.subgrupos.map((sub, idx) => {
                                // Sub virtual: render directo de las actividades con rowSpan=2.
                                if (sub.grupo === null) {
                                  return sub.actividades.map((actividad) => (
                                    <th
                                      key={`th-act-virt-${actividad.id}`}
                                      rowSpan={2}
                                      className="border-r border-b border-border/30 p-2 text-center text-xs font-medium min-w-[120px] bg-emerald-300 text-emerald-950"
                                    >
                                      <div className="flex items-center justify-center gap-1">
                                        <div className="flex-1 min-w-0">
                                          <div className="whitespace-nowrap" title={actividad.nombre}>
                                            {actividad.nombre}
                                          </div>
                                        </div>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button className="p-1 hover:bg-emerald-200 rounded transition-colors">
                                              <MoreVertical className="w-3 h-3" />
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="bg-background z-50">
                                            <DropdownMenuItem onClick={() => handleAbrirModalEditar(actividad)}>
                                              <Pencil className="w-4 h-4 mr-2" /> Editar actividad
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              onClick={() => handleConfirmarEliminar(actividad)}
                                              className="text-destructive focus:text-destructive"
                                            >
                                              <Trash2 className="w-4 h-4 mr-2" /> Eliminar actividad
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </th>
                                  ));
                                }
                                return (
                                  <th
                                    key={`th-sub-${sub.grupo.id}`}
                                    colSpan={sub.colSpan}
                                    className="border-r border-b border-border/30 p-2 text-center text-xs font-semibold bg-emerald-600 text-white relative"
                                  >
                                    <div className="flex flex-col items-center">
                                      <span>{sub.grupo.nombre}</span>
                                      {sub.grupo.porcentaje !== null && (
                                        <span className="text-white/70 text-[10px]">({sub.grupo.porcentaje}%)</span>
                                      )}                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button className="absolute top-1 right-1 p-1 rounded hover:bg-white/20" title="Más opciones">
                                          <MoreVertical className="w-3 h-3 text-white" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="bg-background z-50">
                                        <DropdownMenuItem onClick={() => handleAbrirModal(periodoActivo, 'actividad', sub.grupo!.id)}>
                                          <Plus className="w-4 h-4 mr-2" /> Agregar actividad
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleAbrirEditarGrupo(sub.grupo as any)}>
                                          <Pencil className="w-4 h-4 mr-2" /> Editar subgrupo
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setGrupoAEliminar(sub.grupo as any)} className="text-destructive focus:text-destructive">
                                          <Trash2 className="w-4 h-4 mr-2" /> Eliminar subgrupo
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </th>
                                );
                              });
                            })}
                          </tr>
                        )}

                        {/* Fila inferior (modo jerárquico): actividades individuales */}
                        {usarJerarquia && (
                          <tr className="bg-primary text-primary-foreground">
                            {estructura.secciones.flatMap((sec, secIdx) => {
                              if (sec.tipo === 'sin-grupo') return []; // ya consumidas con rowSpan
                              // Construye lista de items en orden (actividades o placeholders)
                              type Item = { tipo: 'act'; act: Actividad } | { tipo: 'ph'; key: string } | { tipo: 'prom'; grupoId: string };
                              let items: Item[] = [];
                              if (sec.tipo === 'grupo-hoja') {
                                if (sec.actividades.length === 0) {
                                  items.push({ tipo: 'ph', key: `ph-h-${sec.grupo.id}` });
                                } else {
                                  items.push(...sec.actividades.map(a => ({ tipo: 'act' as const, act: a })));
                                }
                                if (verPromedios) items.push({ tipo: 'prom', grupoId: sec.grupo.id });
                              } else {
                                for (const sub of sec.subgrupos) {
                                  // Sub virtual ya se pintó con rowSpan=2 en fila 2 → no
                                  // renderizar nada acá.
                                  if (sub.grupo === null) continue;
                                  if (sub.actividades.length === 0) {
                                    items.push({ tipo: 'ph', key: `ph-s-${sub.grupo.id}` });
                                  } else {
                                    items.push(...sub.actividades.map(a => ({ tipo: 'act' as const, act: a })));
                                  }
                                  if (verPromedios) items.push({ tipo: 'prom', grupoId: sub.grupo.id });
                                }
                              }
                              return items.map((it) => {
                                if (it.tipo === 'prom') {
                                  return (
                                    <th key={`th-prom-${it.grupoId}`} className="border-r border-b border-border/30 p-2 text-center text-xs font-bold bg-emerald-500 text-white min-w-[80px]">
                                      Prom
                                    </th>
                                  );
                                }
                                if (it.tipo === 'ph') {
                                  return (
                                    <th key={it.key} className="border-r border-b border-border/30 p-2 text-center text-xs font-medium bg-emerald-200 text-emerald-700 min-w-[120px]">
                                      —
                                    </th>
                                  );
                                }
                                const actividad = it.act;
                                return (
                                <th
                                  key={`th-act-${actividad.id}`}
                                  className="border-r border-b border-border/30 p-2 text-center text-xs font-medium min-w-[120px] bg-emerald-300 text-emerald-950"
                                >
                                  <div className="flex items-center justify-center gap-1">
                                    <div className="flex-1 min-w-0">
                                      <div className="whitespace-nowrap" title={actividad.nombre}>
                                        {actividad.nombre}
                                      </div>
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button className="p-1 hover:bg-emerald-200 rounded transition-colors">
                                          <MoreVertical className="w-3 h-3" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="bg-background z-50">
                                        <DropdownMenuItem onClick={() => handleAbrirModalEditar(actividad)}>
                                          <Pencil className="w-4 h-4 mr-2" />
                                          Editar actividad
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleConfirmarEliminar(actividad)}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <Trash2 className="w-4 h-4 mr-2" />
                                          Eliminar actividad
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </th>
                              );
                            });
                          })}
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </thead>
                <tbody>
                  {estudiantes.map((estudiante, studentIndex) => {
                    const rowBg = studentIndex % 2 === 0 ? 'bg-background' : 'bg-muted/30';
                    
                    return (
                      <tr 
                        key={estudiante.id}
                        className={rowBg}
                      >
                        {/* Fixed columns on desktop, normal on mobile - with solid background */}
                        <td className={`md:sticky md:left-0 z-10 border-r border-b border-border p-2 md:p-3 text-xs md:text-sm ${studentIndex % 2 === 0 ? 'bg-background' : 'bg-muted'}`}>
                          {estudiante.id}
                        </td>
                        <td className={`md:sticky md:left-[100px] z-10 border-r border-b border-border p-2 md:p-3 text-xs md:text-sm font-medium ${studentIndex % 2 === 0 ? 'bg-background' : 'bg-muted'}`}>
                          {estudiante.apellidos}
                        </td>
                        <td className={`md:sticky md:left-[280px] z-10 border-r border-b border-border p-2 md:p-3 text-xs md:text-sm ${studentIndex % 2 === 0 ? 'bg-background' : 'bg-muted'}`}>
                          {estudiante.nombres}
                        </td>
                        
                        {/* Vista Definitiva Anual*/}
                        {esFinalDefinitiva ? (
                          <>
                            {periodos.map((periodo) => {
                              const finalPeriodo = calcularFinalPeriodo(estudiante.id, periodo.numero);
                              const comentario = comentarios[estudiante.id]?.[periodo.numero]?.[`${periodo.numero}-Definitiva Periodo`] || null;
                              const tieneNotas = tieneAlgunaNotaEnPeriodo(estudiante.id, periodo.numero);
                              return (
                                <FinalPeriodoCelda
                                  key={periodo.numero}
                                  notaFinal={finalPeriodo}
                                  comentario={comentario}
                                  tieneAlgunaNota={tieneNotas}
                                  onAbrirComentario={() => handleAbrirComentario(
                                    estudiante.id,
                                    `${estudiante.nombres} ${estudiante.apellidos}`,
                                    `${periodo.numero}-Definitiva Periodo`,
                                    `Final ${periodo.nombre}`,
                                    periodo.numero
                                  )}
                                  onEliminarComentario={() => handleEliminarComentario(
                                    estudiante.id,
                                    `${periodo.numero}-Definitiva Periodo`,
                                    'Definitiva Periodo',
                                    periodo.numero
                                  )}
                                  onNotificarPadre={tieneNotas ? () => handleNotificarFinalPeriodoIndividual(estudiante, periodo.numero, finalPeriodo) : undefined}
                                />
                              );
                            })}
                            {/* Celda Definitiva Anual*/}
                            {(() => {
                              const finalDef = calcularFinalDefinitiva(estudiante.id);
                              const comentario = comentarios[estudiante.id]?.[0]?.['0-Definitiva Anual'] || null;
                              const tieneNotas = tieneAlgunaNotaEnAnio(estudiante.id);
                              return (
                                <td className="border-r border-b border-border p-1 text-center text-sm min-w-[130px] bg-primary/20 font-bold relative group">
                                  <div className="relative flex items-center justify-center h-8">
                                    <span className={finalDef !== null ? "" : "text-muted-foreground"}>
                                      {finalDef !== null ? finalDef.toFixed(1) : "—"}
                                    </span>
                                    {comentario && (
                                      <div className="absolute top-0 right-6 w-2 h-2 bg-amber-500 rounded-full" title={comentario} />
                                    )}
                                    {/* Menú solo visible si tiene al menos una nota en cualquier período (always visible on mobile) */}
                                    {tieneNotas && (
                                      <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button className="p-1 hover:bg-muted rounded transition-colors">
                                              <MoreVertical className="w-3 h-3 text-muted-foreground" />
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="bg-background z-50">
                                            <DropdownMenuItem onClick={() => handleAbrirComentario(
                                              estudiante.id,
                                              `${estudiante.nombres} ${estudiante.apellidos}`,
                                              '0-Definitiva Anual',
                                              'Definitiva Anual',
                                              0
                                            )}>
                                              {comentario ? "Editar comentario" : "Agregar comentario"}
                                            </DropdownMenuItem>
                                            {comentario && (
                                              <DropdownMenuItem 
                                                onClick={() => handleEliminarComentario(
                                                  estudiante.id,
                                                  '0-Definitiva Anual',
                                                  'Definitiva Anual',
                                                  0
                                                )}
                                                className="text-destructive focus:text-destructive"
                                              >
                                                Eliminar comentario
                                              </DropdownMenuItem>
                                            )}
                                            {tieneAlMenosUnPeriodoCompletoConTodasNotas(estudiante.id) && (
                                              <DropdownMenuItem onClick={() => handleNotificarFinalDefinitivaIndividual(estudiante, finalDef)}>
                                                <Send className="w-4 h-4 mr-2" />
                                                Notificar a padre(s)
                                              </DropdownMenuItem>
                                            )}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            })()}
                          </>
                        ) : (
                          <>
                            {/* Celdas alineadas con la cabecera (actividades reales o placeholders de grupos vacíos) */}
                            {getCeldasFila(periodoActivo).map((celda, idx) => {
                              if (celda.tipo === 'placeholder') {
                                return (
                                  <td
                                    key={`ph-${celda.grupoId}-${idx}`}
                                    className="border-r border-b border-border p-3 text-center text-sm text-muted-foreground/50 min-w-[120px] bg-emerald-50"
                                  >
                                    —
                                  </td>
                                );
                              }
                              if (celda.tipo === 'promedio') {
                                const prom = promedioGrupoEstudiante(celda.grupoId, estudiante.id, periodoActivo);
                                return (
                                  <td
                                    key={`prom-${celda.grupoId}-${idx}`}
                                    className="border-r border-b border-border p-3 text-center text-sm font-bold min-w-[80px] bg-emerald-50 text-emerald-900"
                                  >
                                    {prom !== null ? prom.toFixed(colegioConfig.decimales) : '—'}
                                  </td>
                                );
                              }
                              const actividad = celda.actividad;
                              const nota = notas[estudiante.id]?.[periodoActivo]?.[actividad.id];
                              const estaEditando = celdaEditando?.idEstudiantil === estudiante.id
                                && celdaEditando?.actividadId === actividad.id;
                              const inputKey = `${estudiante.id}-${actividad.id}`;

                              return (
                                <NotaCelda
                                  key={inputKey}
                                  soloLectura={soloLectura}
                                  placeholder={`${colegioConfig.escala_min}-${colegioConfig.escala_max}`}
                                  nombreEstudiante={`${estudiante.apellidos} ${estudiante.nombres}`}
                                  nota={nota}
                                  comentario={comentarios[estudiante.id]?.[periodoActivo]?.[actividad.id] || null}
                                  estaEditando={estaEditando}
                                  valorEditando={valorEditando}
                                  inputRef={(el) => { inputRefs.current[inputKey] = el; }}
                                  onCambioNota={handleCambioNota}
                                  onBlur={() => {
                                    if (!isNavigating.current) {
                                      handleGuardarNota();
                                    }
                                  }}
                                  onKeyDown={(e) => handleKeyDownNota(e, studentIndex, actividad.id, periodoActivo)}
                                  onClick={() => handleClickCelda(estudiante.id, actividad.id, periodoActivo, nota)}
                                  onAbrirComentario={() => handleAbrirComentario(
                                    estudiante.id,
                                    `${estudiante.nombres} ${estudiante.apellidos}`,
                                    actividad.id,
                                    actividad.nombre,
                                    periodoActivo
                                  )}
                                  onEliminarComentario={() => handleEliminarComentario(
                                    estudiante.id,
                                    actividad.id,
                                    actividad.nombre,
                                    periodoActivo
                                  )}
                                  onNotificarPadre={nota !== undefined ? () => handleNotificarNotaIndividual(estudiante, actividad, nota, periodoActivo) : undefined}
                                  onCompletarAbajo={nota !== undefined ? () => handleCompletarAbajo(actividad, periodoActivo, studentIndex, nota) : undefined}
                                />
                              );
                            })}
                            {/* Celda vacía bajo botón Agregar (oculta en solo-lectura) */}
                            {!soloLectura && (
                            <td className="border-r border-b border-border p-3 text-center text-sm text-muted-foreground/50 min-w-[100px]">

                            </td>
                            )}
                            {/* Celda Definitiva Periodo */}
                            {(() => {
                              const notaFinal = calcularFinalPeriodo(estudiante.id, periodoActivo);
                              const tieneNotas = tieneAlgunaNotaEnPeriodo(estudiante.id, periodoActivo);
                              // La definitiva se muestra SIEMPRE (en vivo), pero es FINAL solo
                              // cuando el periodo está "cerrado":
                              //   - Modo grupos: el profe marcó el checkbox "Periodo completo".
                              //   - Modo plano (Normal): los % de las actividades suman 100.
                              // Si no, sale "provisional". (Igual criterio que el agente.)
                              // Completo PARA ESTE estudiante = el profe cerró el periodo
                              // (casilla) Y este estudiante tiene todas sus notas.
                              const completo = getPeriodoCompleto(periodoActivo)
                                && periodoCompletoParaEst(estudiante.id, periodoActivo);
                              // Siempre se puede notificar si hay notas: si el periodo no
                              // está cerrado, el handler envía REPORTE PARCIAL (provisional).
                              const puedeNotificar = true;
                              return (
                                <FinalPeriodoCelda
                                  notaFinal={notaFinal}
                                  provisional={!completo}
                                  soloLectura={soloLectura}
                                  comentario={comentarios[estudiante.id]?.[periodoActivo]?.[`${periodoActivo}-Definitiva Periodo`] || null}
                                  tieneAlgunaNota={tieneNotas}
                                  onAbrirComentario={() => handleAbrirComentario(
                                    estudiante.id,
                                    `${estudiante.nombres} ${estudiante.apellidos}`,
                                    `${periodoActivo}-Definitiva Periodo`,
                                    'Definitiva Periodo',
                                    periodoActivo
                                  )}
                                  onEliminarComentario={() => handleEliminarComentario(
                                    estudiante.id,
                                    `${periodoActivo}-Definitiva Periodo`,
                                    'Definitiva Periodo',
                                    periodoActivo
                                  )}
                                  onNotificarPadre={(tieneNotas && puedeNotificar) ? () => handleNotificarFinalPeriodoIndividual(estudiante, periodoActivo, notaFinal) : undefined}
                                />
                              );
                            })()}
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {/* Fila de botones de notificación integrados en la tabla (oculta en solo-lectura) */}
                {!soloLectura && (
                <tfoot>
                  <tr className="bg-muted">
                    {/* Celdas fijas vacías - sticky solo en desktop con fondo sólido */}
                    <td className="md:sticky md:left-0 z-10 bg-muted border-r border-b border-border p-1"></td>
                    <td className="md:sticky md:left-[100px] z-10 bg-muted border-r border-b border-border p-1"></td>
                    <td className="md:sticky md:left-[280px] z-10 bg-muted border-r border-b border-border p-1"></td>
                    
                    {esFinalDefinitiva ? (
                      <>
                        {/* Botones Notificar para cada período */}
                        {periodos.map((periodo) => (
                          <td key={periodo.numero} className="border-r border-b border-border p-1 text-center">
                            {periodoTieneFinal(periodo.numero) && (
                              <button
                                onClick={() => handleNotificarPeriodoCompleto(periodo.numero)}
                                className="w-full px-1 py-1 text-xs rounded-md bg-green-100 hover:bg-green-200 text-green-800 transition-colors flex flex-col items-center justify-center h-10"
                              >
                                <span className="text-[10px]">📱 Notificar</span>
                                <span className="font-semibold text-[10px] leading-tight">Definitiva Periodo</span>
                              </button>
                            )}
                          </td>
                        ))}
                        {/* Botón Definitiva Anual*/}
                        <td className="border-r border-b border-border p-1 text-center">
                          {hayFinalDefinitiva() && (
                            <button
                              onClick={handleNotificarDefinitivaMasiva}
                              className="w-full px-1 py-1 text-xs rounded-md bg-green-100 hover:bg-green-200 text-green-800 transition-colors flex flex-col items-center justify-center h-10"
                            >
                              <span className="text-[10px]">📱 Notificar</span>
                              <span className="font-semibold text-[10px] leading-tight">Definitiva Anual</span>
                            </button>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Botones para cada celda (actividad o placeholder de grupo vacío) */}
                        {getCeldasFila(periodoActivo).map((celda, idx) => {
                          if (celda.tipo === 'placeholder') {
                            return <td key={`pf-${celda.grupoId}-${idx}`} className="border-r border-b border-border p-1 min-w-[120px]"></td>;
                          }
                          if (celda.tipo === 'promedio') {
                            return <td key={`pf-prom-${celda.grupoId}-${idx}`} className="border-r border-b border-border p-1 min-w-[80px]"></td>;
                          }
                          const actividad = celda.actividad;
                          const pendActividad = resumenPendientes(periodoActivo, String(actividad.id)).estudiantesAfectados;
                          return (
                            <td key={actividad.id} className="border-r border-b border-border p-1 text-center align-top">
                              {actividadTieneNotas(actividad) && (
                                <button
                                  onClick={() => handleNotificarActividad(actividad)}
                                  className="w-full px-1 py-1 text-xs rounded-md bg-green-100 hover:bg-green-200 text-green-800 transition-colors flex flex-col items-center justify-center h-10"
                                  title={`Notificar ${actividad.nombre}`}
                                >
                                  <span className="text-[10px]">📱 Notificar</span>
                                  <span className="font-semibold text-[10px] leading-tight truncate max-w-full">{actividad.nombre}</span>
                                </button>
                              )}
                              {pendActividad > 0 && (
                                <button
                                  onClick={() => abrirPendientes(periodoActivo, actividad)}
                                  className="w-full mt-1 px-1 py-1 text-xs rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors flex flex-col items-center justify-center"
                                  title="Notificar a quienes no han presentado esta actividad"
                                >
                                  <span className="text-[10px]">📭 Pendientes</span>
                                  <span className="font-semibold text-[10px] leading-tight">{pendActividad} sin nota</span>
                                </button>
                              )}
                            </td>
                          );
                        })}
                        {/* Celda vacía bajo botón Agregar */}
                        <td className="border-r border-b border-border p-1 min-w-[100px]"></td>
                        {/* Botón Definitiva Periodo */}
                        <td className="border-r border-b border-border p-1 text-center">
                          {periodoTieneFinal(periodoActivo) && (
                            <button
                              onClick={() => handleNotificarPeriodoCompleto(periodoActivo)}
                              className="w-full px-1 py-1 text-xs rounded-md bg-green-100 hover:bg-green-200 text-green-800 transition-colors flex flex-col items-center justify-center h-10"
                            >
                              <span className="text-[10px]">📱 Notificar</span>
                              <span className="font-semibold text-[10px] leading-tight">Definitiva Periodo</span>
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
                )}
              </table>
            </div>
            </>
          )}
        </div>
      </main>

      {/* Modal para crear/editar actividad o grupo */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {actividadEditando
                ? `Editar Actividad - ${periodos[periodoActual - 1]?.nombre}`
                : tipoNuevoItem === 'grupo'
                  ? `Nuevo Grupo - ${periodos[periodoActual - 1]?.nombre}`
                  : `Nueva Actividad - ${periodos[periodoActual - 1]?.nombre}`}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Breadcrumb: muestra el path del destino (Grupo → Subgrupo →) para
                que el profe vea siempre dónde está creando/editando. */}
            {(() => {
              let pathPartes: string[] = [];
              if (actividadEditando) {
                const gid = (actividadEditando as any).grupo_id;
                if (gid) {
                  const g = gruposPeriodoActual.find(x => x.id === gid);
                  if (g) {
                    if (g.parent_id) {
                      const padre = gruposPeriodoActual.find(x => x.id === g.parent_id);
                      if (padre) pathPartes.push(padre.nombre);
                    }
                    pathPartes.push(g.nombre);
                  }
                }
              } else if (tipoNuevoItem === 'grupo') {
                if (grupoPadrePara) {
                  const padre = gruposPeriodoActual.find(x => x.id === grupoPadrePara);
                  if (padre) pathPartes.push(padre.nombre);
                }
              } else if (grupoActividadId) {
                const g = gruposPeriodoActual.find(x => x.id === grupoActividadId);
                if (g) {
                  if (g.parent_id) {
                    const padre = gruposPeriodoActual.find(x => x.id === g.parent_id);
                    if (padre) pathPartes.push(padre.nombre);
                  }
                  pathPartes.push(g.nombre);
                }
              }
              if (pathPartes.length === 0) return null;
              return (
                <div className="flex items-center gap-2 text-sm text-primary font-medium">
                  {pathPartes.map((parte, i) => (
                    <span key={i} className="flex items-center gap-2">
                      {i > 0 && <span className="text-muted-foreground">→</span>}
                      {parte}
                    </span>
                  ))}
                </div>
              );
            })()}
            <div className="grid gap-2">
              <Label htmlFor="nombre">
                {tipoNuevoItem === 'grupo' && !actividadEditando ? 'Nombre del grupo *' : 'Nombre de la actividad *'}
              </Label>
              <Input
                id="nombre"
                placeholder={tipoNuevoItem === 'grupo' && !actividadEditando
                  ? 'Ej: Cognitivo, Praxeológico, Actitudinal'
                  : 'Ej: Evaluación 1, Taller, Exposición'}
                value={nombreActividad}
                onChange={(e) => setNombreActividad(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground text-right">
                {nombreActividad.length}/100 caracteres
              </p>
            </div>
            {/* Modo Grupo: campos para crear un grupo */}
            {!actividadEditando && tipoNuevoItem === 'grupo' && (() => {
              // Cálculo de máximo permitido para el % del grupo
              const padre = grupoPadrePara
                ? gruposPeriodoActual.find(g => g.id === grupoPadrePara)
                : null;
              const padrePct = padre && padre.porcentaje !== null ? Number(padre.porcentaje) : 100;
              const padreSinPct = !!padre && padre.porcentaje === null;
              const hermanos = grupoPadrePara
                ? gruposPeriodoActual.filter(g => g.parent_id === grupoPadrePara)
                : gruposPeriodoActual.filter(g => !g.parent_id);
              let sumaHermanos = hermanos
                .filter(h => h.porcentaje !== null)
                .reduce((s, h) => s + Number(h.porcentaje), 0);
              // Si es grupo TOP, también suma % de actividades sueltas del periodo
              if (!grupoPadrePara) {
                const actsSueltas = actividades
                  .filter(a => a.periodo === periodoActual && !a.grupo_id && a.porcentaje !== null)
                  .reduce((s, a) => s + Number(a.porcentaje || 0), 0);
                sumaHermanos += actsSueltas;
              }
              const disponible = Math.max(0, padrePct - sumaHermanos);
              return (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="porcentajeGrupo">Porcentaje (opcional)</Label>
                  <Input
                    id="porcentajeGrupo"
                    type="number"
                    placeholder={`Ej: ${Math.min(60, disponible || 60)}`}
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={porcentajeActividad}
                    onChange={(e) => setPorcentajeActividad(e.target.value)}
                    disabled={padreSinPct}
                  />
                  {padreSinPct ? (
                    <p className="text-xs text-amber-700">
                      Primero asígnale porcentaje al grupo padre.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Puedes dejarlo en blanco y ponerlo después. {grupoPadrePara
                        ? <>Disponible dentro de <strong>"{padre?.nombre}"</strong>: <strong>{disponible}%</strong></>
                        : <>Disponible en el periodo: <strong>{disponible}%</strong> de 100%</>}
                    </p>
                  )}
                </div>
                {grupoPadrePara && (() => {
                  const p = gruposPeriodoActual.find(g => g.id === grupoPadrePara);
                  return p ? (
                    <div className="text-xs text-muted-foreground bg-muted/30 border border-border px-3 py-2 rounded">
                      Este subgrupo va dentro de <strong>"{p.nombre}"</strong>{p.porcentaje !== null ? ` (${p.porcentaje}%)` : ''}.
                    </div>
                  ) : null;
                })()}
              </>
              );
            })()}

            {/* Regla: una actividad nace en un lugar y se queda ahí (suelta o
                dentro de un grupo específico). No se permite cambiarla de
                ubicación al editar — para moverla, se crea de nuevo en el
                destino y se vuelven a calificar las notas. Por eso no hay
                selector de grupo en este modal. */}
            {(actividadEditando || tipoNuevoItem === 'actividad') && (() => {
              const grupoSel = grupoActividadId
                ? gruposPeriodoActual.find((g) => g.id === grupoActividadId)
                : null;
              const tieneSubgrupos = grupoSel
                ? gruposPeriodoActual.some((g) => g.parent_id === grupoSel.id)
                : false;

              if (grupoSel && tieneSubgrupos) {
                return (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
                    El grupo <strong>"{grupoSel.nombre}"</strong> tiene subgrupos. Selecciona uno de los subgrupos en el desplegable, no el grupo padre.
                  </div>
                );
              }

              if (grupoSel) {
                return (
                  <div className="text-xs text-muted-foreground bg-muted/30 border border-border px-3 py-2 rounded">
                    Esta actividad va dentro de <strong>"{grupoSel.nombre}"</strong>{grupoSel.porcentaje !== null ? ` (${grupoSel.porcentaje}%)` : ''}. Todas las actividades del grupo se promedian con el mismo peso — no necesita porcentaje individual.
                  </div>
                );
              }

              const usado = getPorcentajeUsadoParaModal();
              const disponible = Math.max(0, 100 - usado);
              return (
                <div className="grid gap-2">
                  <Label htmlFor="porcentaje">Porcentaje (opcional)</Label>
                  <Input
                    id="porcentaje"
                    type="number"
                    placeholder={`Ej: ${Math.min(25, disponible || 25)}`}
                    min={0}
                    max={100}
                    value={porcentajeActividad}
                    onChange={(e) => setPorcentajeActividad(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Disponible en el periodo: <strong>{disponible}%</strong> de 100%
                  </p>
                </div>
              );
            })()}
            {((actividadEditando || tipoNuevoItem === 'actividad') && (actividadEditando ? (salonesConActividad.length > 0 || otrosSalones.length > 0) : otrosSalones.length > 0)) && (
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="crearParaTodos"
                  checked={crearParaTodosSalones}
                  onCheckedChange={(checked) => setCrearParaTodosSalones(checked === true)}
                />
                <div className="grid gap-1">
                  <Label htmlFor="crearParaTodos" className="text-sm font-normal cursor-pointer">
                    {actividadEditando ? "Aplicar cambios en todos los salones de este grado" : "Crear en todos los salones de este grado"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {actividadEditando
                      ? salonesConActividad.length > 0
                        ? "También se modificará en: " + salonesConActividad.join(', ')
                        : "Se modificará en los demás salones donde exista esta actividad"
                      : "También se creará en: " + otrosSalones.join(', ')}
                  </p>
                </div>
              </div>
            )}
            {/* Replicar grupo a otros periodos / salones */}
            {!actividadEditando && tipoNuevoItem === 'grupo' && !grupoPadrePara && (
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs text-muted-foreground">Aplicar también a:</Label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={replicarGrupoOtrosPeriodos}
                    onCheckedChange={(c) => setReplicarGrupoOtrosPeriodos(c === true)}
                  />
                  Los demás periodos de este salón
                </label>
                {otrosSalones.length > 0 && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={replicarGrupoOtrosSalones}
                      onCheckedChange={(c) => setReplicarGrupoOtrosSalones(c === true)}
                    />
                    Los otros salones donde dicto ({otrosSalones.join(', ')})
                  </label>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={guardandoMultiple}>
              Cancelar
            </Button>
            <Button
              onClick={handleGuardarActividad}
              className="bg-primary hover:bg-primary/90"
              disabled={guardandoMultiple || (!actividadEditando && tipoNuevoItem === 'actividad' && modoEfectivo() === 'grupos' && gruposPeriodoActual.length === 0)}
            >
              {guardandoMultiple
                ? "Creando..."
                : actividadEditando
                  ? "Guardar cambios"
                  : tipoNuevoItem === 'grupo'
                    ? "Crear Grupo"
                    : "Crear Actividad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmación para eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar actividad?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar "{actividadAEliminar?.nombre}"? Se borrarán todas las notas de esta actividad. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {salonesConActividad.length > 0 && (
            <div className="flex items-start space-x-2 py-2">
              <Checkbox
                id="eliminarEnTodos"
                checked={eliminarEnTodosSalones}
                onCheckedChange={(checked) => setEliminarEnTodosSalones(checked === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="eliminarEnTodos" className="text-sm font-normal cursor-pointer">
                  Eliminar también en los otros salones de este grado
                </Label>
                <p className="text-xs text-muted-foreground">
                  También se eliminará en: {salonesConActividad.join(', ')}
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEliminarActividad}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edición de un grupo o subgrupo (cambiar nombre / porcentaje) */}
      <Dialog open={!!grupoAEditar} onOpenChange={(o) => !o && setGrupoAEditar(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{grupoAEditar?.parent_id ? 'Editar subgrupo' : 'Editar grupo'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="editNombreGrupo">Nombre *</Label>
              <Input
                id="editNombreGrupo"
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editPctGrupo">Porcentaje (opcional)</Label>
              <Input
                id="editPctGrupo"
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                placeholder="Ej: 60"
                value={editPorcentaje}
                onChange={(e) => setEditPorcentaje(e.target.value)}
              />
              {(() => {
                if (!grupoAEditar) return null;
                // Disponible = % límite (100 si es top, % del padre si es sub)
                //              menos % de hermanos (excluyendo el grupo en edición)
                //              menos % de actividades sueltas (solo si es top)
                let limite = 100;
                if (grupoAEditar.parent_id) {
                  const padre = gruposPeriodoActual.find(g => g.id === grupoAEditar.parent_id);
                  if (padre && padre.porcentaje !== null) limite = Number(padre.porcentaje);
                  else if (padre && padre.porcentaje === null) {
                    return (
                      <p className="text-xs text-amber-700">
                        El grupo padre aún no tiene porcentaje. Asígnaselo primero.
                      </p>
                    );
                  }
                }
                const hermanos = grupoAEditar.parent_id
                  ? gruposPeriodoActual.filter(g => g.parent_id === grupoAEditar.parent_id && g.id !== grupoAEditar.id)
                  : gruposPeriodoActual.filter(g => !g.parent_id && g.id !== grupoAEditar.id);
                let sumaHermanos = hermanos
                  .filter(h => h.porcentaje !== null)
                  .reduce((s, h) => s + Number(h.porcentaje), 0);
                if (!grupoAEditar.parent_id) {
                  // Grupo top: también sumar % de actividades sueltas
                  const actsSueltas = actividades
                    .filter(a => a.periodo === grupoAEditar.periodo && !a.grupo_id && a.porcentaje !== null)
                    .reduce((s, a) => s + Number(a.porcentaje || 0), 0);
                  sumaHermanos += actsSueltas;
                }
                const disponible = Math.max(0, limite - sumaHermanos);
                return (
                  <p className="text-xs text-muted-foreground">
                    Disponible: <strong>{disponible}%</strong>
                  </p>
                );
              })()}
            </div>
            {/* Replicación al editar: aplicar el mismo cambio a grupos equivalentes
                (mismo nombre + posición) en otros periodos / salones. */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs text-muted-foreground">Aplicar también a:</Label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={editReplicarPeriodos}
                  onCheckedChange={(c) => setEditReplicarPeriodos(c === true)}
                />
                Los demás periodos de este salón
              </label>
              {otrosSalones.length > 0 && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={editReplicarSalones}
                    onCheckedChange={(c) => setEditReplicarSalones(c === true)}
                  />
                  Los otros salones donde dicto ({otrosSalones.join(', ')})
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrupoAEditar(null)}>Cancelar</Button>
            <Button onClick={handleGuardarEdicionGrupo} className="bg-primary hover:bg-primary/90">Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminar un grupo individual desde el menú "..." */}
      <AlertDialog open={!!grupoAEliminar} onOpenChange={(o) => !o && setGrupoAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminar {grupoAEliminar?.parent_id ? 'subgrupo' : 'grupo'} "{grupoAEliminar?.nombre}"
            </AlertDialogTitle>
            <AlertDialogDescription>
              {grupoAEliminar?.parent_id
                ? 'Se elimina el subgrupo. Las actividades que estuvieran dentro pasan a modo plano con su porcentaje efectivo (la nota final del estudiante no cambia).'
                : 'Se elimina el grupo y sus subgrupos. Las actividades que estuvieran dentro pasan a modo plano con su porcentaje efectivo (la nota final del estudiante no cambia).'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEliminarGrupo} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación cambio Grupos → Plana */}
      <AlertDialog open={confirmarVolverPlano} onOpenChange={setConfirmarVolverPlano}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar a calificación plana</AlertDialogTitle>
            <AlertDialogDescription>
              Se van a eliminar los <strong>{gruposPeriodoActual.length}</strong> grupos del {periodos[periodoActual - 1]?.nombre}. Las actividades que estuvieran dentro de grupos pasan a modo plano con su porcentaje efectivo del periodo (la nota final del estudiante no cambia). ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarVolverPlano} className="bg-destructive hover:bg-destructive/90">
              Eliminar grupos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal para comentarios */}
      <ComentarioModal
        open={comentarioModalOpen}
        onOpenChange={setComentarioModalOpen}
        nombreEstudiante={comentarioEditando?.nombreEstudiante || ""}
        nombreActividad={comentarioEditando?.nombreActividad || ""}
        comentarioActual={comentarioEditando ? (comentarios[comentarioEditando.idEstudiantil]?.[comentarioEditando.periodo]?.[comentarioEditando.actividadId] || null) : null}
        onGuardar={handleGuardarComentario}
      />

      {/* Modal para notificaciones */}
      <NotificacionModal
        open={notificacionModalOpen}
        onOpenChange={setNotificacionModalOpen}
        tipoNotificacion={notificacionPendiente?.tipo || "nota_individual"}
        descripcion={notificacionPendiente?.descripcion || ""}
        nombreEstudiante={notificacionPendiente?.nombreEstudiante}
        onConfirmar={handleEnviarNotificacion}
      />

      {pendientesModal && (
        <NotificacionModal
          open={!!pendientesModal}
          onOpenChange={(o) => { if (!o) setPendientesModal(null); }}
          tipoNotificacion="pendientes"
          descripcion={pendientesModal.descripcion}
          onConfirmar={handleEnviarPendientes}
        />
      )}

    </div>
  );
};

export default TablaNotas;