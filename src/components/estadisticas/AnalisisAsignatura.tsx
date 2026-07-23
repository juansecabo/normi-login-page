import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEstadisticasAsignatura } from "@/hooks/useEstadisticasApi";
import { useCompletitud } from "@/hooks/useCompletitud";
import { useColegioConfig, colorBucket3 } from "@/hooks/useColegioConfig";
import { TarjetaResumen } from "./TarjetaResumen";
import { TablaRanking } from "./TablaRanking";
import { TablaEvolucion } from "./TablaEvolucion";
import { ListaComparativa } from "./ListaComparativa";
import { TablaDistribucion } from "./TablaDistribucion";
import { IndicadorCompletitud } from "./IndicadorCompletitud";
import BotonDescarga from "./BotonDescarga";
import { BookOpen, Users, Award, AlertTriangle, Loader2 } from "lucide-react";

interface AnalisisAsignaturaProps {
  asignatura: string;
  periodo: number | "anual";
  grado?: string;
  salon?: string;
  titulo?: string;
}

export const AnalisisAsignatura = ({ asignatura, periodo, grado, salon, titulo }: AnalisisAsignaturaProps) => {
  const contenidoRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data, loading, error } = useEstadisticasAsignatura(asignatura, periodo, grado, salon);
  const { verificarCompletitud } = useCompletitud();
  const { config } = useColegioConfig();

  if (!asignatura) return <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">Selecciona una asignatura para ver su análisis</div>;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Espere, por favor...</span></div>;
  if (error || !data) return <div className="bg-card rounded-lg shadow-soft p-8 text-center text-red-600">Error: {error || "sin datos"}</div>;

  const gradoEfectivo = grado && grado !== "all" ? grado : undefined;
  const salonEfectivo = salon && salon !== "all" ? salon : undefined;

  if (data.promedio_asignatura === 0) {
    return (
      <div className="bg-card rounded-lg shadow-soft p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Aún no hay notas registradas para {asignatura}</h3>
        <p className="text-muted-foreground">Las estadísticas estarán disponibles cuando se registren notas.</p>
      </div>
    );
  }

  const getContextoLabel = () => {
    if (salonEfectivo) return `${gradoEfectivo} ${salonEfectivo}`;
    if (gradoEfectivo) return gradoEfectivo;
    return "Institucional";
  };

  const rendimientoPorGrado = data.rendimiento_por_grado
    .sort((a, b) => b.promedio - a.promedio)
    .map((g) => ({ nombre: g.grado, valor: g.promedio }));
  const cantidadGrados = rendimientoPorGrado.length;

  const rendimientoPorSalon = data.rendimiento_por_salon;

  // Estudiantes en riesgo (filtrados por asignatura ya viene del API)
  const estudiantesReprobados = data.estudiantes_en_riesgo.length;
  const cantidadEstudiantes = data.estudiantes_evaluados;
  const estudiantesAprobados = data.estudiantes_aprobados;
  const tasaAprobacion = data.tasa_aprobacion;

  // Top y bottom desde el API
  const topEstudiantes = data.top_estudiantes;
  const peoresEstudiantes = !salonEfectivo ? data.bottom_estudiantes : [];

  const evolucionAsignatura = data.evolucion;

  const getTituloRanking = () => {
    if (salonEfectivo) return `Ranking de Estudiantes - ${gradoEfectivo} ${salonEfectivo} - ${asignatura}`;
    if (gradoEfectivo) return `Top 10 Mejores Estudiantes - ${gradoEfectivo} - ${asignatura}`;
    return `Top 10 Mejores Estudiantes - ${asignatura}`;
  };

  const getTituloPeores = () => {
    if (gradoEfectivo) return `Top 10 Estudiantes a Reforzar - ${gradoEfectivo} - ${asignatura}`;
    return `Top 10 Estudiantes a Reforzar - ${asignatura}`;
  };

  const getTituloEvolucion = () => {
    if (salonEfectivo) return `Evolución de ${asignatura} - ${gradoEfectivo} ${salonEfectivo}`;
    if (gradoEfectivo) return `Evolución de ${asignatura} - ${gradoEfectivo}`;
    return `Evolución de ${asignatura} - Institucional`;
  };

  const getTituloDistribucion = () => {
    if (salonEfectivo) return `Distribución por Desempeño - ${gradoEfectivo} ${salonEfectivo} - ${asignatura}`;
    if (gradoEfectivo) return `Distribución por Desempeño - ${gradoEfectivo} - ${asignatura}`;
    return `Distribución por Desempeño - ${asignatura}`;
  };

  // Verificar completitud
  const { completo, detalles, resumen, resumenCompleto } = verificarCompletitud("asignatura", periodo, gradoEfectivo, salonEfectivo, asignatura);

  const periodoTexto = periodo === "anual" ? "Acumulado Anual" : `Período ${periodo}`;

  const handleRiesgoClick = () => {
    const params = new URLSearchParams();
    params.set("nivel", "asignatura");
    params.set("periodo", periodo.toString());
    params.set("asignatura", asignatura);
    if (gradoEfectivo) params.set("grado", gradoEfectivo);
    if (salonEfectivo) params.set("salon", salonEfectivo);
    navigate(`/dashboard/estudiantes-riesgo?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-blue-700">
          <span className="font-medium">ℹ️</span>
          <span>Estadísticas basadas únicamente en estudiantes con notas registradas.</span>
        </div>
        <div className="flex items-center gap-2">
          <IndicadorCompletitud
            completo={completo}
            detalles={detalles}
            resumen={resumen}
            resumenCompleto={resumenCompleto}
            nivel={asignatura}
            periodo={periodoTexto}
          />
          <BotonDescarga contenidoRef={contenidoRef} nombreArchivo={titulo || `${asignatura} - ${getContextoLabel()} - ${periodoTexto}`} />
        </div>
      </div>

      <div ref={contenidoRef} className="space-y-6">
        {titulo && (
          <h2 className="text-xl md:text-2xl font-bold text-foreground text-center">{titulo}</h2>
        )}

        <div className="bg-card rounded-lg shadow-soft p-6 border border-border">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center"><BookOpen className="w-8 h-8 text-primary" /></div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{asignatura}</h2>
              <p className="text-muted-foreground">
                {salonEfectivo ? `${gradoEfectivo} ${salonEfectivo}` : gradoEfectivo ? `Grado: ${gradoEfectivo}` : "Análisis institucional"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TarjetaResumen titulo="Promedio de la Asignatura" valor={data.promedio_asignatura.toFixed(config.decimales)} subtitulo={periodo === "anual" ? "Acumulado anual" : `Período ${periodo}`} icono={BookOpen} color={colorBucket3(data.promedio_asignatura, config)} />
          <TarjetaResumen titulo="Estudiantes con notas" valor={cantidadEstudiantes} subtitulo="Con calificaciones" icono={Users} color="primary" />
          <TarjetaResumen titulo="Tasa de Aprobación" valor={`${tasaAprobacion}%`} subtitulo={`${estudiantesAprobados} aprobados`} icono={Award} color={tasaAprobacion >= 80 ? "success" : tasaAprobacion >= 60 ? "warning" : "danger"} />
          <TarjetaResumen
            titulo="En Riesgo"
            valor={estudiantesReprobados}
            subtitulo={`Promedio < ${config.nota_aprobatoria.toFixed(config.decimales)}`}
            icono={AlertTriangle}
            color={estudiantesReprobados > 0 ? "danger" : "success"}
            onClick={estudiantesReprobados > 0 ? handleRiesgoClick : undefined}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TablaDistribucion titulo={getTituloDistribucion()} distribucion={data.distribucion} />
          <TablaEvolucion titulo={getTituloEvolucion()} datos={evolucionAsignatura} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {!gradoEfectivo && cantidadGrados > 1 && (
            <ListaComparativa titulo={`Rendimiento por Grado - ${asignatura}`} items={rendimientoPorGrado} mostrarPosicion />
          )}
          {gradoEfectivo && !salonEfectivo && rendimientoPorSalon.length > 0 && (
            <ListaComparativa titulo={`Rendimiento por Salón - ${gradoEfectivo} - ${asignatura}`} items={rendimientoPorSalon.map((s) => ({ nombre: s.salon, valor: s.promedio, extra: `${s.cantidadEstudiantes} estudiantes` }))} mostrarPosicion />
          )}
        </div>

        {salonEfectivo && (
          <TablaRanking titulo={getTituloRanking()} datos={data.estudiantes} tipo="estudiante" mostrarTodosSinLimite />
        )}

        {!salonEfectivo && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TablaRanking titulo={getTituloRanking()} datos={topEstudiantes} tipo="estudiante" limite={10} />
            {peoresEstudiantes.length > 0 && (
              <TablaRanking titulo={getTituloPeores()} datos={peoresEstudiantes} tipo="estudiante" limite={10} ocultarIconosDespuesDe={0} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
