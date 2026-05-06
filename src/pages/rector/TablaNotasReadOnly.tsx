import { getPeriodoActual } from "@/utils/periodoActual";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import HeaderNormy from "@/components/HeaderNormy";
import ComentarioModalReadOnly from "@/components/notas/ComentarioModalReadOnly";
import { MessageSquare } from "lucide-react";

interface Estudiante {
  id_estudiantil: string;
  apellidos_estudiante: string;
  nombre_estudiante: string;
}

interface Actividad {
  id: string;
  periodo: number;
  nombre: string;
  porcentaje: number | null;
}

type NotasEstudiantes = {
  [idEstudiantil: string]: {
    [periodo: number]: {
      [actividadId: string]: number;
    };
  };
};

type ComentariosEstudiantes = {
  [idEstudiantil: string]: {
    [periodo: number]: {
      [actividadId: string]: string | null;
    };
  };
};

const TablaNotasReadOnly = () => {
  const navigate = useNavigate();
  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState("");
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [notas, setNotas] = useState<NotasEstudiantes>({});
  const [comentarios, setComentarios] = useState<ComentariosEstudiantes>({});
  const [periodoActivo, setPeriodoActivo] = useState<number>(getPeriodoActual());
  const [nombreProfesor, setNombreProfesor] = useState<string>("");

  // Modal de comentarios
  const [comentarioModalOpen, setComentarioModalOpen] = useState(false);
  const [comentarioModalData, setComentarioModalData] = useState<{
    nombreEstudiante: string;
    nombreActividad: string;
    comentario: string | null;
    nombreProfesor: string;
  } | null>(null);

  useEffect(() => {
    const inicializar = async () => {
      const session = getSession();

      if (!session.id) {
        navigate('/');
        return;
      }

      if (!isRectorOrCoordinador()) {
        navigate('/dashboard');
        return;
      }

      const storedAsignatura = localStorage.getItem("asignaturaSeleccionada");
      const storedGrado = localStorage.getItem("gradoSeleccionado");
      const storedSalon = localStorage.getItem("salonSeleccionado");

      if (!storedAsignatura || !storedGrado || !storedSalon) {
        navigate("/rector/seleccionar-grado");
        return;
      }

      setAsignaturaSeleccionada(storedAsignatura);
      setGradoSeleccionado(storedGrado);
      setSalonSeleccionado(storedSalon);

      try {
        // Buscar el profesor que da esta asignatura en este grado/salón
        const { data: asignaciones } = await supabase
          .from('Asignación Profesores')
          .select('id, "Asignatura(s)", "Grado(s)", "Salon(es)"');

        if (asignaciones) {
          // Encontrar la asignación que coincide
          const asignacionCorrecta = asignaciones.find((asig) => {
            const asignaturas = asig['Asignatura(s)'] || [];
            const grados = asig['Grado(s)'] || [];
            const salones = asig['Salon(es)'] || [];
            return asignaturas.includes(storedAsignatura) &&
                   grados.includes(storedGrado) &&
                   salones.includes(storedSalon);
          });

          if (asignacionCorrecta && asignacionCorrecta.id) {
            // Buscar el nombre del profesor en la tabla Internos usando id
            const { data: profesorData } = await supabase
              .from('Internos')
              .select('nombres, apellidos')
              .eq('id', asignacionCorrecta.id)
              .maybeSingle();

            if (profesorData) {
              setNombreProfesor(`${profesorData.nombres} ${profesorData.apellidos}`);
            }
          }
        }

        // Fetch estudiantes
        const { data: estudiantesData, error: estudiantesError } = await supabase
          .from('Estudiantes')
          .select('id_estudiantil, apellidos_estudiante, nombre_estudiante')
          .eq('grado_estudiante', storedGrado)
          .eq('salon_estudiante', storedSalon)
          .order('apellidos_estudiante', { ascending: true })
          .order('nombre_estudiante', { ascending: true });

        if (estudiantesError) {
          console.error('Error fetching estudiantes:', estudiantesError);
          setLoading(false);
          return;
        }

        setEstudiantes(estudiantesData || []);

        // Cargar actividades desde "Nombre de Actividades"
        const { data: actividadesData, error: actividadesError } = await supabase
          .from('Nombre de Actividades')
          .select('*')
          .eq('asignatura', storedAsignatura)
          .eq('grado', storedGrado)
          .eq('salon', storedSalon)
          .order('fecha_creacion', { ascending: true });

        if (!actividadesError && actividadesData) {
          const actividadesCargadas: Actividad[] = actividadesData.map(act => ({
            id: `${act.periodo}-${act.nombre_actividad}`,
            periodo: act.periodo,
            nombre: act.nombre_actividad,
            porcentaje: act.porcentaje,
          }));
          setActividades(actividadesCargadas);
        }

        // Fetch notas y comentarios existentes
        const { data: notasData, error: notasError } = await supabase
          .from('Notas')
          .select('*')
          .eq('asignatura', storedAsignatura)
          .eq('grado', storedGrado)
          .eq('salon', storedSalon);

        if (!notasError && notasData) {
          const notasFormateadas: NotasEstudiantes = {};
          const comentariosFormateados: ComentariosEstudiantes = {};

          notasData.forEach((nota) => {
            const { id_estudiantil, periodo, nombre_actividad, nota: valorNota, comentario } = nota;

            if (nombre_actividad === "Definitiva Anual" || nombre_actividad === "Definitiva Periodo") {
              return;
            }

            const actividadId = `${periodo}-${nombre_actividad}`;

            // Notas
            if (!notasFormateadas[id_estudiantil]) {
              notasFormateadas[id_estudiantil] = {};
            }
            if (!notasFormateadas[id_estudiantil][periodo]) {
              notasFormateadas[id_estudiantil][periodo] = {};
            }
            notasFormateadas[id_estudiantil][periodo][actividadId] = valorNota;

            // Comentarios
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
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
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

  const esFinalDefinitiva = periodoActivo === 0;

  const getActividadesPorPeriodo = (periodo: number) => {
    return actividades.filter(a => a.periodo === periodo);
  };

  const getPorcentajeUsado = (periodo: number) => {
    return actividades
      .filter(a => a.periodo === periodo && a.porcentaje !== null)
      .reduce((sum, a) => sum + (a.porcentaje || 0), 0);
  };

  const getPorcentajePromedioAnual = () => {
    const porcentajes = [1, 2, 3, 4].map(p => getPorcentajeUsado(p));
    const suma = porcentajes.reduce((acc, val) => acc + val, 0);
    const promedio = suma / 4;
    return Math.round(promedio * 100) / 100;
  };

  const calcularFinalPeriodo = (idEstudiantil: string, periodo: number): number | null => {
    const actividadesDelPeriodo = getActividadesPorPeriodo(periodo);
    const actividadesConPorcentaje = actividadesDelPeriodo.filter(a => a.porcentaje !== null && a.porcentaje > 0);

    if (actividadesConPorcentaje.length === 0) return null;

    let suma = 0;
    let porcentajeCalificado = 0;

    actividadesConPorcentaje.forEach((actividad) => {
      const nota = notas[idEstudiantil]?.[periodo]?.[actividad.id];
      if (nota !== undefined) {
        suma += nota * ((actividad.porcentaje || 0) / 100);
        porcentajeCalificado += actividad.porcentaje || 0;
      }
    });

    if (porcentajeCalificado === 0) return null;

    return Math.round((suma / (porcentajeCalificado / 100)) * 10) / 10;
  };

  const calcularFinalDefinitiva = (idEstudiantil: string): number | null => {
    let suma = 0;
    let periodosConNota = 0;

    for (let periodo = 1; periodo <= 4; periodo++) {
      const finalPeriodo = calcularFinalPeriodo(idEstudiantil, periodo);
      if (finalPeriodo !== null) {
        suma += finalPeriodo;
        periodosConNota++;
      }
    }

    if (periodosConNota === 0) return null;

    return Math.round((suma / periodosConNota) * 10) / 10;
  };

  return (
    <div className="min-h-screen md:h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard-rector" />

      {/* Main Content */}
      <main className="flex-1 min-w-0 md:flex md:flex-col md:overflow-hidden container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={() => navigate("/dashboard-rector")}
              className="text-primary hover:underline"
            >
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/rector/seleccionar-grado")}
              className="text-primary hover:underline"
            >
              Notas
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/rector/seleccionar-salon")}
              className="text-primary hover:underline"
            >
              {gradoSeleccionado}
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/rector/modo-visualizacion")}
              className="text-primary hover:underline"
            >
              {salonSeleccionado}
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/rector/lista-asignaturas")}
              className="text-primary hover:underline"
            >
              Por Asignatura
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">{asignaturaSeleccionada}</span>
          </div>
        </div>

        {/* Info del profesor */}
        {nombreProfesor && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Docente:</span>
            <span className="text-sm font-medium text-foreground">{nombreProfesor}</span>
          </div>
        )}

        {/* Pestañas de Períodos */}
        <div className="bg-card rounded-lg shadow-soft md:flex-1 md:flex md:flex-col md:min-h-0 md:overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-border">
            {periodos.map((periodo) => {
              const porcentajeUsado = getPorcentajeUsado(periodo.numero);
              const isActive = periodoActivo === periodo.numero;
              return (
                <button
                  key={periodo.numero}
                  onClick={() => setPeriodoActivo(periodo.numero)}
                  className={`flex-1 px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium transition-colors relative
                    ${isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                >
                  <span className="md:hidden">
                    {periodo.numero}° ({porcentajeUsado}%)
                  </span>
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
            <div className="overflow-x-auto md:overflow-auto md:flex-1 md:min-h-0 border-l border-t border-border">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    <th className="md:sticky md:left-0 z-20 bg-primary border-r border-b border-border/30 w-[80px] md:w-[100px] min-w-[80px] md:min-w-[100px] p-2 md:p-3 text-left font-semibold text-xs md:text-sm">
                      ID
                    </th>
                    <th className="md:sticky md:left-[100px] z-20 bg-primary border-r border-b border-border/30 w-[120px] md:w-[180px] min-w-[120px] md:min-w-[180px] p-2 md:p-3 text-left font-semibold text-xs md:text-sm">
                      Apellidos
                    </th>
                    <th className="md:sticky md:left-[280px] z-20 bg-primary border-r border-b border-border/30 w-[100px] md:w-[150px] min-w-[100px] md:min-w-[150px] p-2 md:p-3 text-left font-semibold text-xs md:text-sm">
                      Nombre
                    </th>

                        {getActividadesPorPeriodo(periodoActivo).map((actividad) => (
                          <th
                            key={actividad.id}
                            className="border-r border-b border-border/30 p-2 text-center text-xs font-medium min-w-[120px] bg-primary/90"
                          >
                            <div className="flex flex-col items-center">
                              <div className="truncate" title={actividad.nombre}>
                                {actividad.nombre}
                              </div>
                              {actividad.porcentaje !== null && (
                                <div className="text-primary-foreground/70 text-xs">
                                  ({actividad.porcentaje}%)
                                </div>
                              )}
                            </div>
                          </th>
                        ))}
                        <th className="border-r border-b border-border/30 p-2 text-center text-xs font-medium min-w-[130px] bg-primary">
                          <div className="flex flex-col items-center">
                            <span>Definitiva Periodo</span>
                            <span className="text-xs text-primary-foreground/70">
                              ({getPorcentajeUsado(periodoActivo)}/100%)
                            </span>
                          </div>
                        </th>
                  </tr>
                </thead>
                <tbody>
                  {estudiantes.map((estudiante, studentIndex) => {
                    const rowBg = studentIndex % 2 === 0 ? 'bg-background' : 'bg-muted/30';

                    return (
                      <tr key={estudiante.id_estudiantil} className={rowBg}>
                        <td className={`md:sticky md:left-0 z-10 border-r border-b border-border p-2 md:p-3 text-xs md:text-sm ${studentIndex % 2 === 0 ? 'bg-background' : 'bg-muted'}`}>
                          {estudiante.id_estudiantil}
                        </td>
                        <td className={`md:sticky md:left-[100px] z-10 border-r border-b border-border p-2 md:p-3 text-xs md:text-sm font-medium ${studentIndex % 2 === 0 ? 'bg-background' : 'bg-muted'}`}>
                          {estudiante.apellidos_estudiante}
                        </td>
                        <td className={`md:sticky md:left-[280px] z-10 border-r border-b border-border p-2 md:p-3 text-xs md:text-sm ${studentIndex % 2 === 0 ? 'bg-background' : 'bg-muted'}`}>
                          {estudiante.nombre_estudiante}
                        </td>

                            {getActividadesPorPeriodo(periodoActivo).map((actividad) => {
                              const nota = notas[estudiante.id_estudiantil]?.[periodoActivo]?.[actividad.id];
                              const comentario = comentarios[estudiante.id_estudiantil]?.[periodoActivo]?.[actividad.id];
                              const tieneComentario = !!comentario;

                              return (
                                <td
                                  key={actividad.id}
                                  className="border-r border-b border-border p-2 text-center text-sm relative"
                                >
                                  <div className="flex items-center justify-center gap-1">
                                    <span>{nota !== undefined ? nota.toFixed(2) : '—'}</span>
                                    {tieneComentario && (
                                      <button
                                        onClick={() => {
                                          setComentarioModalData({
                                            nombreEstudiante: `${estudiante.apellidos_estudiante} ${estudiante.nombre_estudiante}`,
                                            nombreActividad: actividad.nombre,
                                            comentario: comentario,
                                            nombreProfesor: nombreProfesor,
                                          });
                                          setComentarioModalOpen(true);
                                        }}
                                        className="text-amber-500 hover:text-amber-600 transition-colors"
                                        title="Ver comentario del profesor"
                                      >
                                        <MessageSquare className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="border-r border-b border-border p-2 text-center text-sm font-semibold bg-primary/5">
                              {calcularFinalPeriodo(estudiante.id_estudiantil, periodoActivo)?.toFixed(1) || '—'}
                            </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal para ver comentarios */}
      {comentarioModalData && (
        <ComentarioModalReadOnly
          open={comentarioModalOpen}
          onOpenChange={setComentarioModalOpen}
          nombreEstudiante={comentarioModalData.nombreEstudiante}
          nombreActividad={comentarioModalData.nombreActividad}
          comentario={comentarioModalData.comentario}
          nombreProfesor={comentarioModalData.nombreProfesor}
        />
      )}
    </div>
  );
};

export default TablaNotasReadOnly;
