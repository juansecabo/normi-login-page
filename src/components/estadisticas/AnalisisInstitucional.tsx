import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEstadisticasInstitucional, ordenGrados } from "@/hooks/useEstadisticasApi";
import { useCompletitud } from "@/hooks/useCompletitud";
import { useColegioConfig, colorBucket4 } from "@/hooks/useColegioConfig";
import { TarjetaResumen } from "./TarjetaResumen";
import { TablaRanking } from "./TablaRanking";
import { TablaDistribucion } from "./TablaDistribucion";
import { TablaEvolucion } from "./TablaEvolucion";
import { IndicadorCompletitud } from "./IndicadorCompletitud";
import BotonDescarga from "./BotonDescarga";
import { School, Users, Award, AlertTriangle, Loader2 } from "lucide-react";

interface AnalisisInstitucionalProps {
  periodo: number | "anual";
  titulo?: string;
}

export const AnalisisInstitucional = ({ periodo, titulo }: AnalisisInstitucionalProps) => {
  const contenidoRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data, loading, error } = useEstadisticasInstitucional(periodo);
  const { verificarCompletitud } = useCompletitud();
  const { config } = useColegioConfig();
  const aprobLabel = config.nota_aprobatoria.toFixed(config.decimales);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Espere, por favor...</span></div>;
  if (error || !data) return <div className="bg-card rounded-lg shadow-soft p-8 text-center text-red-600">Error cargando estadísticas: {error || "sin datos"}</div>;

  const promedioInstitucional = data.promedio_institucional;
  const topEstudiantes = data.top_estudiantes;
  const peoresEstudiantes = data.bottom_estudiantes;
  const topSalones = [...data.promedios_salones].sort((a, b) => b.promedio - a.promedio).slice(0, 10);
  const todosGrados = [...data.promedios_grados].sort((a, b) => b.promedio - a.promedio);
  const distribucion = data.distribucion;
  const estudiantesEnRiesgo = data.estudiantes_en_riesgo;
  const mostrarRiesgo = data.tiene_datos_riesgo;

  // Verificar completitud (sigue como estaba — hook separado que aún usa supabase directo)
  const { completo, detalles, resumen, resumenCompleto } = verificarCompletitud("institucion", periodo);

  // Evolución hasta el periodo seleccionado
  const periodoHasta = periodo === "anual" ? 4 : periodo;
  const evolucionPeriodos = data.evolucion.filter((e) => {
    const n = parseInt(e.periodo.replace("Período ", ""));
    return n <= periodoHasta;
  });

  // Datos para la tabla por grado, ordenados por currículo
  const todosGradosOrden = [...data.promedios_grados]
    .sort((a, b) => ordenGrados.indexOf(a.grado) - ordenGrados.indexOf(b.grado));

  const periodoTexto = periodo === "anual" ? "Acumulado Anual" : `Período ${periodo}`;

  const handleVerRiesgo = () => {
    const params = new URLSearchParams();
    params.set("nivel", "institucion");
    params.set("periodo", String(periodo));
    navigate(`/estudiantes-riesgo?${params.toString()}`);
  };

  if (data.estudiantes_evaluados === 0) {
    return (
      <div className="bg-card rounded-lg shadow-soft p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Aún no hay actividades con notas registradas</h3>
        <p className="text-muted-foreground">Las estadísticas estarán disponibles cuando se registren notas en el sistema.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-guia="estadisticas.resultado">
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
            nivel="Institución"
            periodo={periodoTexto}
          />
          <BotonDescarga contenidoRef={contenidoRef} nombreArchivo={titulo || `Institución - ${periodoTexto}`} />
        </div>
      </div>

      <div ref={contenidoRef} className="space-y-6">
        {titulo && (
          <h2 className="text-xl md:text-2xl font-bold text-foreground text-center">{titulo}</h2>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TarjetaResumen
            titulo="Promedio Institucional"
            valor={promedioInstitucional.toFixed(config.decimales)}
            subtitulo={`Basado en ${data.estudiantes_evaluados} estudiantes con notas`}
            icono={School}
            color={colorBucket4(promedioInstitucional, config)}
          />
          <TarjetaResumen
            titulo="Estudiantes con notas"
            valor={data.estudiantes_evaluados}
            subtitulo={`En ${data.promedios_salones.length} salones`}
            icono={Users}
            color="primary"
          />
          <TarjetaResumen
            titulo="Mejor Promedio"
            valor={topEstudiantes[0]?.promedio.toFixed(config.decimales) || "—"}
            subtitulo={topEstudiantes[0]?.nombre_completo || ""}
            icono={Award}
            color={topEstudiantes[0] ? colorBucket4(topEstudiantes[0].promedio, config) : "danger"}
          />
          {mostrarRiesgo ? (
            <div
              onClick={estudiantesEnRiesgo.length > 0 ? handleVerRiesgo : undefined}
              className={estudiantesEnRiesgo.length > 0 ? "cursor-pointer hover:scale-[1.02] transition-transform" : ""}
              data-guia="estadisticas.tarjeta_riesgo"
            >
              <TarjetaResumen
                titulo="En Riesgo Académico"
                valor={estudiantesEnRiesgo.length}
                subtitulo={estudiantesEnRiesgo.length > 0 ? "Click para ver detalles" : `Promedio menor a ${aprobLabel}`}
                icono={AlertTriangle}
                color={estudiantesEnRiesgo.length > 0 ? "danger" : "success"}
              />
            </div>
          ) : (
            <TarjetaResumen titulo="En Riesgo Académico" valor="—" subtitulo="Se necesitan más datos" icono={AlertTriangle} color="primary" />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TablaDistribucion titulo="Distribución por Niveles de Desempeño" distribucion={distribucion} />
          <TablaEvolucion titulo="Evolución del Rendimiento por Período" datos={evolucionPeriodos} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TablaRanking titulo="Rendimiento por Grado" datos={todosGrados} tipo="grado" mostrarTodosSinLimite={true} />
          <TablaRanking titulo="Top 10 Mejores Salones" datos={topSalones} tipo="salon" limite={10} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TablaRanking titulo="Top 10 Mejores Estudiantes" datos={topEstudiantes} tipo="estudiante" limite={10} />
          <TablaRanking titulo="Top 10 Estudiantes a Reforzar" datos={peoresEstudiantes} tipo="estudiante" limite={10} ocultarIconosDespuesDe={0} />
        </div>
      </div>
    </div>
  );
};
