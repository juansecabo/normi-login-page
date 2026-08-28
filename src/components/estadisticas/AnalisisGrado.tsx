import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEstadisticasGrado } from "@/hooks/useEstadisticasApi";
import { useCompletitud } from "@/hooks/useCompletitud";
import { useColegioConfig, colorBucket4 } from "@/hooks/useColegioConfig";
import { TarjetaResumen } from "./TarjetaResumen";
import { TablaRanking } from "./TablaRanking";
import { TablaDistribucion } from "./TablaDistribucion";
import { TablaEvolucion } from "./TablaEvolucion";
import { ListaComparativa } from "./ListaComparativa";
import { IndicadorCompletitud } from "./IndicadorCompletitud";
import BotonDescarga from "./BotonDescarga";
import { GraduationCap, Users, Award, AlertTriangle, Loader2 } from "lucide-react";

interface AnalisisGradoProps {
  grado: string;
  periodo: number | "anual";
  titulo?: string;
}

export const AnalisisGrado = ({ grado, periodo, titulo }: AnalisisGradoProps) => {
  const contenidoRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data, loading, error } = useEstadisticasGrado(grado, periodo);
  const { verificarCompletitud } = useCompletitud();
  const { config } = useColegioConfig();
  const aprobLabel = config.nota_aprobatoria.toFixed(config.decimales);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Espere, por favor...</span></div>;
  if (!grado) return <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">Selecciona un grado para ver el análisis</div>;
  if (error || !data) return <div className="bg-card rounded-lg shadow-soft p-8 text-center text-red-600">Error cargando estadísticas: {error || "sin datos"}</div>;

  const promedioGrado = data.promedio_grado;
  const promedioInstitucional = data.promedio_institucional;
  const topEstudiantes = data.top_estudiantes;
  const peoresEstudiantes = data.bottom_estudiantes;
  const salones = [...data.promedios_salones].sort((a, b) => b.promedio - a.promedio);
  const asignaturas = data.promedios_asignaturas;
  const distribucion = data.distribucion;
  const estudiantesEnRiesgo = data.estudiantes_en_riesgo;
  const mostrarRiesgo = data.tiene_datos_riesgo;
  const diferenciaConInst = promedioGrado - promedioInstitucional;

  // Verificar completitud (sigue como estaba)
  const { completo, detalles, resumen, resumenCompleto } = verificarCompletitud("grado", periodo, grado);

  // Filtrar evolución hasta el período seleccionado
  const periodoHasta = periodo === "anual" ? 4 : periodo;
  const evolucionPeriodos = data.evolucion.filter((e) => {
    const n = parseInt(e.periodo.replace("Período ", ""));
    return n <= periodoHasta;
  });

  // Cantidad de salones únicos con datos
  const salonesUnicos = [...new Set(salones.map((s) => s.salon))];

  const periodoTexto = periodo === "anual" ? "Acumulado Anual" : `Período ${periodo}`;

  const handleVerRiesgo = () => {
    const params = new URLSearchParams();
    params.set("nivel", "grado");
    params.set("periodo", String(periodo));
    params.set("grado", grado);
    navigate(`/estudiantes-riesgo?${params.toString()}`);
  };

  if (data.estudiantes_evaluados === 0) {
    return (
      <div className="bg-card rounded-lg shadow-soft p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Aún no hay actividades con notas registradas para {grado}</h3>
        <p className="text-muted-foreground">Las estadísticas estarán disponibles cuando se registren notas.</p>
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
            nivel={grado}
            periodo={periodoTexto}
          />
          <BotonDescarga contenidoRef={contenidoRef} nombreArchivo={titulo || `${grado} - ${periodoTexto}`} />
        </div>
      </div>

      <div ref={contenidoRef} className="space-y-6">
        {titulo && (
          <h2 className="text-xl md:text-2xl font-bold text-foreground text-center">{titulo}</h2>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TarjetaResumen titulo={`Promedio ${grado}`} valor={promedioGrado.toFixed(config.decimales)} subtitulo={`${diferenciaConInst >= 0 ? "+" : ""}${diferenciaConInst.toFixed(config.decimales)} vs institución`} icono={GraduationCap} color={colorBucket4(promedioGrado, config)} />
          <TarjetaResumen titulo="Estudiantes con notas" valor={data.estudiantes_evaluados} subtitulo={`En ${salonesUnicos.length} salones`} icono={Users} color="primary" />
          <TarjetaResumen titulo="Mejor Estudiante" valor={topEstudiantes[0]?.promedio.toFixed(config.decimales) || "—"} subtitulo={topEstudiantes[0]?.nombre_completo || ""} icono={Award} color={topEstudiantes[0] ? colorBucket4(topEstudiantes[0].promedio, config) : "danger"} />
          {mostrarRiesgo ? (
            <div
              onClick={estudiantesEnRiesgo.length > 0 ? handleVerRiesgo : undefined}
              className={estudiantesEnRiesgo.length > 0 ? "cursor-pointer hover:scale-[1.02] transition-transform" : ""}
              data-guia="estadisticas.tarjeta_riesgo"
            >
              <TarjetaResumen titulo="En Riesgo" valor={estudiantesEnRiesgo.length} subtitulo={estudiantesEnRiesgo.length > 0 ? "Click para ver detalles" : `Promedio menor a ${aprobLabel}`} icono={AlertTriangle} color={estudiantesEnRiesgo.length > 0 ? "danger" : "success"} />
            </div>
          ) : (
            <TarjetaResumen titulo="En Riesgo" valor="—" subtitulo="Se necesitan más datos" icono={AlertTriangle} color="primary" />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TablaDistribucion titulo={`Distribución por Desempeño - ${grado}`} distribucion={distribucion} />
          <TablaEvolucion titulo={`Evolución de ${grado} por Período`} datos={evolucionPeriodos} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ListaComparativa titulo={`Rendimiento por Salón - ${grado}`} items={salones.map((s) => ({ nombre: `${grado} ${s.salon}`, valor: s.promedio, extra: `${s.cantidadEstudiantes} estudiantes` }))} mostrarPosicion />
          <ListaComparativa titulo={`Rendimiento por Asignatura - ${grado}`} items={asignaturas.map((m) => ({ nombre: m.asignatura, valor: m.promedio }))} mostrarPosicion />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TablaRanking titulo={`Top 10 Mejores Estudiantes - ${grado}`} datos={topEstudiantes} tipo="estudiante" limite={10} />
          <TablaRanking titulo={`Top 10 Estudiantes a Reforzar - ${grado}`} datos={peoresEstudiantes} tipo="estudiante" limite={10} ocultarIconosDespuesDe={0} />
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
                  <td className="py-2 px-3 font-medium text-foreground">{grado}</td>
                  <td className="py-2 px-3 text-center font-bold text-foreground">{promedioGrado.toFixed(config.decimales)}</td>
                  <td className="py-2 px-3 text-center text-muted-foreground">—</td>
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
