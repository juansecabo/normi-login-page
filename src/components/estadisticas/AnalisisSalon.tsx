import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEstadisticasSalon } from "@/hooks/useEstadisticasApi";
import { useCompletitud } from "@/hooks/useCompletitud";
import { useColegioConfig, colorBucket4 } from "@/hooks/useColegioConfig";
import { TarjetaResumen } from "./TarjetaResumen";
import { TablaRanking } from "./TablaRanking";
import { TablaDistribucion } from "./TablaDistribucion";
import { TablaEvolucion } from "./TablaEvolucion";
import { ListaComparativa } from "./ListaComparativa";
import { IndicadorCompletitud } from "./IndicadorCompletitud";
import BotonDescarga from "./BotonDescarga";
import { Home, Users, AlertTriangle, Award, Loader2 } from "lucide-react";

interface AnalisisSalonProps {
  grado: string;
  salon: string;
  periodo: number | "anual";
  titulo?: string;
}

export const AnalisisSalon = ({ grado, salon, periodo, titulo }: AnalisisSalonProps) => {
  const contenidoRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data, loading, error } = useEstadisticasSalon(grado, salon, periodo);
  const { verificarCompletitud } = useCompletitud();
  const { config } = useColegioConfig();
  const aprobLabel = config.nota_aprobatoria.toFixed(config.decimales);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Espere, por favor...</span></div>;
  if (!grado || !salon) return <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">Selecciona un grado y un salón para ver el análisis</div>;
  if (error || !data) return <div className="bg-card rounded-lg shadow-soft p-8 text-center text-red-600">Error cargando estadísticas: {error || "sin datos"}</div>;

  const promedioSalon = data.promedio_salon;
  const promedioGrado = data.promedio_grado;
  const promedioInstitucional = data.promedio_institucional;
  const estudiantesSalon = data.estudiantes;
  const topEstudiantes = data.top_estudiantes;
  const asignaturas = data.promedios_asignaturas;
  const distribucion = data.distribucion;
  const estudiantesEnRiesgo = data.estudiantes_en_riesgo;
  const mostrarRiesgo = data.tiene_datos_riesgo;
  const posicionEnGrado = data.posicion_grado;
  const totalSalones = data.total_salones_grado;
  const diferenciaConGrado = promedioSalon - promedioGrado;
  const diferenciaConInst = promedioSalon - promedioInstitucional;

  const { completo, detalles, resumen, resumenCompleto } = verificarCompletitud("salon", periodo, grado, salon);

  const periodoHasta = periodo === "anual" ? 4 : periodo;
  const evolucionPeriodos = data.evolucion.filter((e) => {
    const n = parseInt(e.periodo.replace("Período ", ""));
    return n <= periodoHasta;
  });

  const periodoTexto = periodo === "anual" ? "Acumulado Anual" : `Período ${periodo}`;

  const handleVerRiesgo = () => {
    const params = new URLSearchParams();
    params.set("nivel", "salon");
    params.set("periodo", String(periodo));
    params.set("grado", grado);
    params.set("salon", salon);
    navigate(`/rector/estudiantes-riesgo?${params.toString()}`);
  };

  if (data.estudiantes_evaluados === 0) {
    return (
      <div className="bg-card rounded-lg shadow-soft p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Aún no hay actividades con notas registradas para {grado} {salon}</h3>
        <p className="text-muted-foreground">Las estadísticas estarán disponibles cuando se registren notas.</p>
      </div>
    );
  }

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
            nivel={`${grado} ${salon}`}
            periodo={periodoTexto}
          />
          <BotonDescarga contenidoRef={contenidoRef} nombreArchivo={titulo || `${grado} ${salon} - ${periodoTexto}`} />
        </div>
      </div>

      <div ref={contenidoRef} className="space-y-6">
        {titulo && (
          <h2 className="text-xl md:text-2xl font-bold text-foreground text-center">{titulo}</h2>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TarjetaResumen titulo={`Promedio ${grado} ${salon}`} valor={promedioSalon.toFixed(config.decimales)} subtitulo={`#${posicionEnGrado} de ${totalSalones} en ${grado}`} icono={Home} color={colorBucket4(promedioSalon, config)} />
          <TarjetaResumen titulo="Estudiantes con notas" valor={data.estudiantes_evaluados} subtitulo="En este salón" icono={Users} color="primary" />
          <TarjetaResumen titulo="Mejor Estudiante" valor={topEstudiantes[0]?.promedio.toFixed(config.decimales) || "—"} subtitulo={topEstudiantes[0]?.nombre_completo || ""} icono={Award} color={topEstudiantes[0] ? colorBucket4(topEstudiantes[0].promedio, config) : "danger"} />
          <TarjetaResumen
            titulo="En Riesgo Académico"
            valor={mostrarRiesgo ? estudiantesEnRiesgo.length : "—"}
            subtitulo={mostrarRiesgo ? (estudiantesEnRiesgo.length > 0 ? "Click para ver detalles" : `Promedio menor a ${aprobLabel}`) : "Se necesitan más datos"}
            icono={AlertTriangle}
            color={estudiantesEnRiesgo.length > 0 ? "danger" : "success"}
            onClick={mostrarRiesgo && estudiantesEnRiesgo.length > 0 ? handleVerRiesgo : undefined}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TablaDistribucion titulo={`Distribución por Desempeño - ${grado} ${salon}`} distribucion={distribucion} />
          <TablaEvolucion titulo={`Evolución de ${grado} ${salon} por Período`} datos={evolucionPeriodos} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TablaRanking
            titulo={`Ranking de Estudiantes - ${grado} ${salon}`}
            datos={estudiantesSalon}
            tipo="estudiante"
            mostrarTodosSinLimite={true}
            ocultarIconosDespuesDe={3}
          />
          <ListaComparativa titulo={`Rendimiento por Asignatura - ${grado} ${salon}`} items={asignaturas.map((m) => ({ nombre: m.asignatura, valor: m.promedio }))} mostrarPosicion />
        </div>

        <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
          <h4 className="font-semibold text-foreground mb-4">Comparativa con Promedios de Referencia</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Referencia</th>
                  <th className="text-center py-2 px-3 text-muted-foreground font-medium">Promedio</th>
                  <th className="text-center py-2 px-3 text-muted-foreground font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3 font-medium text-foreground">{grado} {salon}</td>
                  <td className="py-2 px-3 text-center font-bold text-foreground">{promedioSalon.toFixed(config.decimales)}</td>
                  <td className="py-2 px-3 text-center text-muted-foreground">—</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3 text-foreground">Promedio {grado}</td>
                  <td className="py-2 px-3 text-center text-foreground">{promedioGrado.toFixed(config.decimales)}</td>
                  <td className={`py-2 px-3 text-center font-medium ${diferenciaConGrado >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {diferenciaConGrado >= 0 ? "+" : ""}{diferenciaConGrado.toFixed(config.decimales)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 text-foreground">Promedio Institucional</td>
                  <td className="py-2 px-3 text-center text-foreground">{promedioInstitucional.toFixed(config.decimales)}</td>
                  <td className={`py-2 px-3 text-center font-medium ${diferenciaConInst >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {diferenciaConInst >= 0 ? "+" : ""}{diferenciaConInst.toFixed(config.decimales)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
