import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ConsolidadoNotas from "@/components/ConsolidadoNotas";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import { getPeriodoActual } from "@/utils/periodoActual";
import { anoEscolarActual } from "@/utils/anoEscolar";
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

const PERIODO_LABEL = ["", "1er Periodo", "2do Periodo", "3er Periodo", "4to Periodo"];

const EstudianteConsolidado = () => {
  const navigate = useNavigate();
  // Periodo elegido vive en la URL (?periodo=1..4) → persiste al refrescar y se
  // ve en el breadcrumb. Sin periodo válido se muestra "Elige el periodo".
  const [searchParams, setSearchParams] = useSearchParams();
  const periodoParam = searchParams.get("periodo");
  const periodoElegido = periodoParam && /^[1-4]$/.test(periodoParam) ? Number(periodoParam) : null;
  const setPeriodo = (n: number) => {
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set("periodo", String(n)); return p; });
  };
  const limpiarPeriodo = () => {
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete("periodo"); return p; });
  };
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
        navigate("/dashboard/seleccionar-grado");
        return;
      }

      if (!storedEstudiante) {
        navigate("/dashboard/lista-estudiantes");
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
          .eq('ano_escolar', anoEscolarActual())
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
          .eq('ano_escolar', anoEscolarActual())
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

  const handleChangePeriodo = (_asignatura: string, periodo: number) => {
    // Periodo compartido (en la URL): cambiarlo aplica a todas las asignaturas.
    setPeriodo(periodo);
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
      <HeaderNormi backLink="/panel" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={() => navigate("/panel")}
              className="text-primary hover:underline"
            >
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/dashboard/seleccionar-grado")}
              className="text-primary hover:underline"
            >
              Notas
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/dashboard/seleccionar-salon")}
              className="text-primary hover:underline"
            >
              {gradoSeleccionado}
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/dashboard/modo-visualizacion")}
              className="text-primary hover:underline"
            >
              {salonSeleccionado}
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/dashboard/lista-estudiantes")}
              className="text-primary hover:underline"
            >
              Por Estudiante
            </button>
            <span className="text-muted-foreground">→</span>
            {periodoElegido ? (
              <>
                <button onClick={limpiarPeriodo} className="text-primary hover:underline">
                  {estudiante?.apellidos} {estudiante?.nombres}
                </button>
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground font-medium">{PERIODO_LABEL[periodoElegido]}</span>
              </>
            ) : (
              <span className="text-foreground font-medium">{estudiante?.apellidos} {estudiante?.nombres}</span>
            )}
          </div>
        </div>

        {/* Notas: mismo diseño que ve el estudiante/acudiente (vertical, grupos,
            acordeón, selector de periodo arriba). Solo los profesores marcan
            periodos como completos, así que aquí es de solo lectura. */}
        {estudiante && (
          <ConsolidadoNotas
            idEstudiante={String(estudiante.id)}
            nombreEstudiante={estudiante.nombres}
            apellidosEstudiante={estudiante.apellidos}
            grado={gradoSeleccionado}
            salon={salonSeleccionado}
          />
        )}
      </main>
    </div>
  );
};

export default EstudianteConsolidado;
