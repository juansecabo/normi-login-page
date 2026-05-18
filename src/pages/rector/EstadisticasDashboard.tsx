import { getPeriodoActual } from "@/utils/periodoActual";
import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, puedeAccederDashboard } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { useEstadisticasMeta } from "@/hooks/useEstadisticasApi";
import { supabase } from "@/integrations/supabase/client";
import { FiltrosEstadisticas } from "@/components/estadisticas/FiltrosEstadisticas";
import { AnalisisInstitucional } from "@/components/estadisticas/AnalisisInstitucional";
import { AnalisisGrado } from "@/components/estadisticas/AnalisisGrado";
import { AnalisisSalon } from "@/components/estadisticas/AnalisisSalon";
import { AnalisisEstudiante } from "@/components/estadisticas/AnalisisEstudiante";
import { AnalisisAsignatura } from "@/components/estadisticas/AnalisisAsignatura";
import { Loader2 } from "lucide-react";

const EstadisticasDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loading, grados, salones, asignaturas, asignaciones } = useEstadisticasMeta();

  // Reemplazo local de getAsignaturasFiltradas — opera sobre el array de asignaciones del hook nuevo
  const normalize = (str: string | null | undefined): string =>
    String(str || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const getAsignaturasFiltradas = (grado?: string, salon?: string): string[] => {
    let filtradas = asignaciones;
    if (grado && grado !== "all") {
      const g = normalize(grado);
      filtradas = filtradas.filter((a) => normalize(a.grado) === g);
    }
    if (salon && salon !== "all") {
      const s = normalize(salon);
      filtradas = filtradas.filter((a) => normalize(a.salon) === s);
    }
    return [...new Set(filtradas.map((a) => a.asignatura))].sort();
  };
  
  // Leer filtros desde URL params (para restaurar estado al volver)
  const [nivelAnalisis, setNivelAnalisis] = useState(() => searchParams.get("nivel") || "institucion");
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState(() => searchParams.get("periodo") || String(getPeriodoActual()));
  const [gradoSeleccionado, setGradoSeleccionado] = useState(() => searchParams.get("grado") || "");
  const [salonSeleccionado, setSalonSeleccionado] = useState(() => searchParams.get("salon") || "");
  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState(() => searchParams.get("asignatura") || "");
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState(() => searchParams.get("estudiante") || "");

  useEffect(() => {
    const session = getSession();
    if (!session.id) {
      navigate("/");
      return;
    }
    if (!puedeAccederDashboard()) {
      navigate("/dashboard");
      return;
    }
  }, [navigate]);

  // Obtener asignaturas filtradas según grado y salón seleccionados
  const asignaturasFiltradas = useMemo(() => {
    // Si no hay grado seleccionado o es "all", mostrar todas las asignaturas
    if (!gradoSeleccionado || gradoSeleccionado === "all") {
      return asignaturas;
    }
    // Si hay grado pero no salón o es "all", filtrar solo por grado
    if (!salonSeleccionado || salonSeleccionado === "all") {
      return getAsignaturasFiltradas(gradoSeleccionado);
    }
    // Si hay grado y salón, filtrar por ambos
    return getAsignaturasFiltradas(gradoSeleccionado, salonSeleccionado);
  }, [gradoSeleccionado, salonSeleccionado, asignaturas, asignaciones]);

  // Obtener lista de estudiantes del salón seleccionado (query directa a Supabase)
  const [estudiantesDelSalon, setEstudiantesDelSalon] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    if (!gradoSeleccionado || !salonSeleccionado) {
      setEstudiantesDelSalon([]);
      return;
    }
    const fetchEstudiantes = async () => {
      const { data } = await supabase
        .from('Estudiantes')
        .select('id_estudiantil, apellidos, nombres')
        .eq('grado_estudiante', gradoSeleccionado)
        .eq('salon_estudiante', salonSeleccionado)
        .order('apellidos')
        .order('nombres');
      setEstudiantesDelSalon(
        (data || []).map(e => ({
          id: String(e.id_estudiantil),
          nombre: `${e.apellidos} ${e.nombres}`
        }))
      );
    };
    fetchEstudiantes();
  }, [gradoSeleccionado, salonSeleccionado]);

  const periodoNumerico = periodoSeleccionado === "anual" 
    ? "anual" as const
    : parseInt(periodoSeleccionado);

  // Verificar si todos los filtros necesarios están seleccionados
  const filtrosCompletos = () => {
    if (nivelAnalisis === "institucion") return true;
    if (nivelAnalisis === "grado") return gradoSeleccionado && gradoSeleccionado !== "";
    if (nivelAnalisis === "salon") return gradoSeleccionado && salonSeleccionado && salonSeleccionado !== "";
    if (nivelAnalisis === "estudiante") return gradoSeleccionado && salonSeleccionado && estudianteSeleccionado;
    if (nivelAnalisis === "asignatura") return asignaturaSeleccionada && asignaturaSeleccionada !== "";
    return false;
  };

  // Generar título dinámico basado en filtros
  const getTituloDinamico = () => {
    const periodoTexto = periodoSeleccionado === "anual" 
      ? "Acumulado Anual" 
      : `Período ${periodoSeleccionado}`;
    
    if (nivelAnalisis === "institucion") {
      return `Institución - ${periodoTexto}`;
    }
    
    if (nivelAnalisis === "grado") {
      const nombreGrado = gradoSeleccionado && gradoSeleccionado !== "all" 
        ? gradoSeleccionado 
        : "Todos los Grados";
      return `${nombreGrado} - ${periodoTexto}`;
    }
    
    if (nivelAnalisis === "salon") {
      const nombreGrado = gradoSeleccionado || "";
      const nombreSalon = salonSeleccionado && salonSeleccionado !== "all" 
        ? salonSeleccionado 
        : "";
      const salonCompleto = nombreSalon ? `${nombreGrado} ${nombreSalon}` : nombreGrado;
      return `${salonCompleto} - ${periodoTexto}`;
    }
    
    if (nivelAnalisis === "estudiante") {
      const estudiante = estudiantesDelSalon.find(e => e.id === estudianteSeleccionado);
      const nombreEstudiante = estudiante?.nombre || "Estudiante";
      return `${nombreEstudiante} - ${periodoTexto}`;
    }
    
    if (nivelAnalisis === "asignatura") {
      const nombreAsignatura = asignaturaSeleccionada || "Asignatura";
      const partes = [nombreAsignatura];
      
      if (gradoSeleccionado && gradoSeleccionado !== "all") {
        if (salonSeleccionado && salonSeleccionado !== "all") {
          partes.push(`${gradoSeleccionado} ${salonSeleccionado}`);
        } else {
          partes.push(gradoSeleccionado);
        }
      }
      
      partes.push(periodoTexto);
      return partes.join(" - ");
    }
    
    return periodoTexto;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard-rector" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard-rector")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Estadísticas</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Cargando datos...</span>
          </div>
        ) : (
          <>
            <FiltrosEstadisticas
              nivelAnalisis={nivelAnalisis}
              setNivelAnalisis={setNivelAnalisis}
              periodoSeleccionado={periodoSeleccionado}
              setPeriodoSeleccionado={setPeriodoSeleccionado}
              gradoSeleccionado={gradoSeleccionado}
              setGradoSeleccionado={setGradoSeleccionado}
              salonSeleccionado={salonSeleccionado}
              setSalonSeleccionado={setSalonSeleccionado}
              asignaturaSeleccionada={asignaturaSeleccionada}
              setAsignaturaSeleccionada={setAsignaturaSeleccionada}
              estudianteSeleccionado={estudianteSeleccionado}
              setEstudianteSeleccionado={setEstudianteSeleccionado}
              grados={grados}
              salones={salones}
              asignaturas={asignaturasFiltradas}
              estudiantes={estudiantesDelSalon}
            />

            {nivelAnalisis === "institucion" && (
              <AnalisisInstitucional periodo={periodoNumerico} titulo={getTituloDinamico()} />
            )}
            {nivelAnalisis === "grado" && gradoSeleccionado && (
              <AnalisisGrado grado={gradoSeleccionado} periodo={periodoNumerico} titulo={getTituloDinamico()} />
            )}
            {nivelAnalisis === "salon" && gradoSeleccionado && salonSeleccionado && (
              <AnalisisSalon grado={gradoSeleccionado} salon={salonSeleccionado} periodo={periodoNumerico} titulo={getTituloDinamico()} />
            )}
            {nivelAnalisis === "estudiante" && estudianteSeleccionado && (
              <AnalisisEstudiante 
                idEstudiante={estudianteSeleccionado} 
                periodo={periodoNumerico}
                titulo={getTituloDinamico()}
              />
            )}
            {nivelAnalisis === "asignatura" && asignaturaSeleccionada && (
              <AnalisisAsignatura
                asignatura={asignaturaSeleccionada}
                periodo={periodoNumerico}
                grado={gradoSeleccionado}
                salon={salonSeleccionado}
                titulo={getTituloDinamico()}
              />
            )}
            {nivelAnalisis === "grado" && !gradoSeleccionado && (
              <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
                Selecciona un grado para ver el análisis
              </div>
            )}
            {nivelAnalisis === "salon" && (!gradoSeleccionado || !salonSeleccionado) && (
              <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
                Selecciona un grado y salón para ver el análisis
              </div>
            )}
            {nivelAnalisis === "estudiante" && !estudianteSeleccionado && (
              <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
                Selecciona un estudiante para ver el análisis
              </div>
            )}
            {nivelAnalisis === "asignatura" && !asignaturaSeleccionada && (
              <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
                Selecciona una asignatura para ver su análisis
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default EstadisticasDashboard;
