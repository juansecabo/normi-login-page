import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import { getPeriodoActual } from "@/utils/periodoActual";
import HeaderNormi from "@/components/HeaderNormi";

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
  asignatura: string;
}

type NotasEstudiante = {
  [asignatura: string]: {
    [periodo: number]: {
      [actividadId: string]: number;
    };
  };
};

type ActividadesPorAsignatura = {
  [asignatura: string]: Actividad[];
};

// Estado de periodo activo por asignatura
type PeriodosActivos = {
  [asignatura: string]: number;
};

const EstudianteConsolidado = () => {
  const navigate = useNavigate();
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [estudiante, setEstudiante] = useState<Estudiante | null>(null);
  const [asignaturas, setAsignaturas] = useState<string[]>([]);
  const [actividadesPorAsignatura, setActividadesPorAsignatura] = useState<ActividadesPorAsignatura>({});
  const [notas, setNotas] = useState<NotasEstudiante>({});
  const [periodosActivos, setPeriodosActivos] = useState<PeriodosActivos>({});
  const [loading, setLoading] = useState(true);

  const periodos = [
    { numero: 1, nombre: "1°" },
    { numero: 2, nombre: "2°" },
    { numero: 3, nombre: "3°" },
    { numero: 4, nombre: "4°" },
  ];

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

      const storedGrado = localStorage.getItem("gradoSeleccionado");
      const storedSalon = localStorage.getItem("salonSeleccionado");
      const storedEstudiante = localStorage.getItem("estudianteSeleccionado");

      if (!storedGrado || !storedSalon) {
        navigate("/rector/seleccionar-grado");
        return;
      }

      if (!storedEstudiante) {
        navigate("/rector/lista-estudiantes");
        return;
      }

      const estudianteData = JSON.parse(storedEstudiante) as Estudiante;
      setGradoSeleccionado(storedGrado);
      setSalonSeleccionado(storedSalon);
      setEstudiante(estudianteData);

      try {
        // Obtener asignaturas del grado/salón
        const { data: asignaciones, error: asignacionesError } = await supabase
          .from('Asignación Profesores')
          .select('"Asignatura(s)", "Grado(s)", "Salon(es)"');

        if (asignacionesError) {
          console.error('Error fetching asignaciones:', asignacionesError);
          setLoading(false);
          return;
        }

        // Filtrar asignaturas para este grado y salón
        const asignaturasDelGrado: string[] = [];
        asignaciones?.forEach((asignacion) => {
          const grados = asignacion['Grado(s)'] || [];
          const salones = asignacion['Salon(es)'] || [];
          const asignaturasAsig = asignacion['Asignatura(s)'] || [];

          if (grados.includes(storedGrado) && salones.includes(storedSalon)) {
            asignaturasAsig.forEach((asignatura: string) => {
              if (!asignaturasDelGrado.includes(asignatura)) {
                asignaturasDelGrado.push(asignatura);
              }
            });
          }
        });

        asignaturasDelGrado.sort((a, b) => a.localeCompare(b, 'es'));
        setAsignaturas(asignaturasDelGrado);

        // Inicializar periodos activos (todos en periodo 1)
        const periodosIniciales: PeriodosActivos = {};
        asignaturasDelGrado.forEach(asignatura => {
          periodosIniciales[asignatura] = getPeriodoActual();
        });
        setPeriodosActivos(periodosIniciales);

        // Obtener actividades de todas las asignaturas
        const { data: actividadesData, error: actividadesError } = await supabase
          .from('Nombre de Actividades')
          .select('*')
          .eq('grado', storedGrado)
          .eq('salon', storedSalon)
          .in('asignatura', asignaturasDelGrado)
          .order('fecha_creacion', { ascending: true });

        if (!actividadesError && actividadesData) {
          const actividadesPorAsig: ActividadesPorAsignatura = {};

          actividadesData.forEach((act) => {
            if (!actividadesPorAsig[act.asignatura]) {
              actividadesPorAsig[act.asignatura] = [];
            }
            actividadesPorAsig[act.asignatura].push({
              id: `${act.periodo}-${act.nombre_actividad}`,
              periodo: act.periodo,
              nombre: act.nombre_actividad,
              porcentaje: act.porcentaje,
              asignatura: act.asignatura,
            });
          });

          setActividadesPorAsignatura(actividadesPorAsig);
        }

        // Obtener notas del estudiante
        const { data: notasData, error: notasError } = await supabase
          .from('Notas')
          .select('*')
          .eq('id_estudiantil', estudianteData.id)
          .eq('grado', storedGrado)
          .eq('salon', storedSalon)
          .in('asignatura', asignaturasDelGrado);

        if (!notasError && notasData) {
          const notasFormateadas: NotasEstudiante = {};

          notasData.forEach((nota) => {
            const { asignatura, periodo, nombre_actividad, nota: valorNota } = nota;

            if (nombre_actividad === "Definitiva Anual" || nombre_actividad === "Definitiva Periodo") {
              return;
            }

            const actividadId = `${periodo}-${nombre_actividad}`;

            if (!notasFormateadas[asignatura]) {
              notasFormateadas[asignatura] = {};
            }
            if (!notasFormateadas[asignatura][periodo]) {
              notasFormateadas[asignatura][periodo] = {};
            }
            notasFormateadas[asignatura][periodo][actividadId] = valorNota;
          });

          setNotas(notasFormateadas);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    inicializar();
  }, [navigate]);

  const getActividadesPorPeriodo = (asignatura: string, periodo: number) => {
    return (actividadesPorAsignatura[asignatura] || []).filter(a => a.periodo === periodo);
  };

  const getPorcentajeUsado = (asignatura: string, periodo: number) => {
    return (actividadesPorAsignatura[asignatura] || [])
      .filter(a => a.periodo === periodo && a.porcentaje !== null)
      .reduce((sum, a) => sum + (a.porcentaje || 0), 0);
  };

  const calcularFinalPeriodo = (asignatura: string, periodo: number): number | null => {
    const actividadesDelPeriodo = getActividadesPorPeriodo(asignatura, periodo);
    const actividadesConPorcentaje = actividadesDelPeriodo.filter(a => a.porcentaje !== null && a.porcentaje > 0);

    if (actividadesConPorcentaje.length === 0) return null;

    let suma = 0;
    let porcentajeCalificado = 0;

    actividadesConPorcentaje.forEach((actividad) => {
      const nota = notas[asignatura]?.[periodo]?.[actividad.id];
      if (nota !== undefined) {
        suma += nota * ((actividad.porcentaje || 0) / 100);
        porcentajeCalificado += actividad.porcentaje || 0;
      }
    });

    if (porcentajeCalificado === 0) return null;

    return Math.round((suma / (porcentajeCalificado / 100)) * 10) / 10;
  };

  const calcularFinalDefinitiva = (asignatura: string): number | null => {
    let suma = 0;
    let periodosConNota = 0;

    for (let periodo = 1; periodo <= 4; periodo++) {
      const finalPeriodo = calcularFinalPeriodo(asignatura, periodo);
      if (finalPeriodo !== null) {
        suma += finalPeriodo;
        periodosConNota++;
      }
    }

    if (periodosConNota === 0) return null;

    return Math.round((suma / periodosConNota) * 10) / 10;
  };

  const handleChangePeriodo = (asignatura: string, periodo: number) => {
    setPeriodosActivos(prev => ({
      ...prev,
      [asignatura]: periodo,
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard-rector" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-4 md:p-8">
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
              onClick={() => navigate("/rector/lista-estudiantes")}
              className="text-primary hover:underline"
            >
              Por Estudiante
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">
              {estudiante?.apellidos} {estudiante?.nombres}
            </span>
          </div>
        </div>

        {/* Información del estudiante */}
        <div className="bg-card rounded-lg shadow-soft p-6 mb-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">
              {estudiante?.apellidos} {estudiante?.nombres}
            </h2>
            <p className="text-muted-foreground">
              ID: {estudiante?.id} | {gradoSeleccionado} - {salonSeleccionado}
            </p>
          </div>
        </div>

        {/* Tabla por cada asignatura */}
        <div className="space-y-6">
          {asignaturas.map((asignatura) => {
            const periodoActivo = periodosActivos[asignatura] || getPeriodoActual();
            const actividadesDelPeriodo = getActividadesPorPeriodo(asignatura, periodoActivo);
            const finalDefinitiva = calcularFinalDefinitiva(asignatura);

            return (
              <div key={asignatura} className="bg-card rounded-lg shadow-soft overflow-hidden">
                {/* Header de la asignatura */}
                <div className="bg-primary/10 p-4 border-b border-border">
                  <h3 className="text-lg font-bold text-foreground">{asignatura}</h3>
                </div>

                {/* Tabs de períodos */}
                <div className="flex border-b border-border">
                  {periodos.map((periodo) => {
                    const isActive = periodoActivo === periodo.numero;
                    const porcentaje = getPorcentajeUsado(asignatura, periodo.numero);
                    return (
                      <button
                        key={periodo.numero}
                        onClick={() => handleChangePeriodo(asignatura, periodo.numero)}
                        className={`flex-1 px-2 py-2 text-xs font-medium transition-colors relative
                          ${isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                      >
                        {periodo.nombre} ({porcentaje}%)
                        {isActive && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Contenido del período */}
                <div className="overflow-x-auto">
                  {actividadesDelPeriodo.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No hay actividades registradas en este período
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/50">
                          {actividadesDelPeriodo.map((actividad) => (
                            <th
                              key={actividad.id}
                              className="p-2 text-center text-xs font-medium border-r border-b border-border min-w-[100px]"
                            >
                              <div className="truncate" title={actividad.nombre}>
                                {actividad.nombre}
                              </div>
                              {actividad.porcentaje !== null && (
                                <div className="text-muted-foreground text-xs">
                                  ({actividad.porcentaje}%)
                                </div>
                              )}
                            </th>
                          ))}
                          <th className="p-2 text-center text-xs font-semibold border-b border-border min-w-[100px] bg-primary/10">
                            Definitiva Periodo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {actividadesDelPeriodo.map((actividad) => {
                            const nota = notas[asignatura]?.[periodoActivo]?.[actividad.id];
                            return (
                              <td
                                key={actividad.id}
                                className="p-2 text-center text-sm border-r border-b border-border"
                              >
                                {nota !== undefined ? nota.toFixed(2) : '—'}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center text-sm font-semibold border-b border-border bg-primary/5">
                            {calcularFinalPeriodo(asignatura, periodoActivo)?.toFixed(1) || '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}

          {asignaturas.length === 0 && (
            <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
              No hay asignaturas asignadas para este grado y salón
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default EstudianteConsolidado;
