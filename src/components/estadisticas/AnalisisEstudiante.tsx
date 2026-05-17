import { useRef } from "react";
import { useEstadisticasEstudiante } from "@/hooks/useEstadisticasApi";
import { TarjetaResumen } from "./TarjetaResumen";
import { TablaEvolucion } from "./TablaEvolucion";
import { ListaComparativa } from "./ListaComparativa";
import BotonDescarga from "./BotonDescarga";
import { User, TrendingUp, Award, AlertTriangle, Medal, Star, ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";

interface AnalisisEstudianteProps { idEstudiante: string; periodo: number | "anual"; titulo?: string; }

// Umbral mínimo de porcentaje para evaluar riesgo (matchea historic logic)
const UMBRAL_PORCENTAJE_MINIMO = 40;
const UMBRAL_PORCENTAJE_ANUAL = 160;

export const AnalisisEstudiante = ({ idEstudiante, periodo, titulo }: AnalisisEstudianteProps) => {
  const contenidoRef = useRef<HTMLDivElement>(null);
  const { data, loading, error } = useEstadisticasEstudiante(idEstudiante, periodo);

  if (!idEstudiante) return <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">Selecciona un estudiante para ver su análisis</div>;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Espere, por favor...</span></div>;
  if (error || !data) return <div className="bg-card rounded-lg shadow-soft p-8 text-center text-red-600">Error: {error || "sin datos"}</div>;

  const estudiante = data;
  if (!estudiante.promedio) return <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">Este estudiante no tiene notas registradas</div>;

  const asignaturasEstudiante = Object.entries(estudiante.promediosPorAsignatura || {})
    .map(([asignatura, promedio]) => ({ asignatura, promedio }))
    .sort((a, b) => b.promedio - a.promedio);

  const tieneSuficientesAsignaturas = asignaturasEstudiante.length >= 2;
  const mejorAsignatura = tieneSuficientesAsignaturas ? asignaturasEstudiante[0] : null;
  const peorAsignatura = tieneSuficientesAsignaturas ? asignaturasEstudiante[asignaturasEstudiante.length - 1] : null;

  const fortalezas = asignaturasEstudiante.filter((m) => m.promedio >= 4.0).slice(0, 3);
  const debilidades = asignaturasEstudiante.filter((m) => m.promedio < 3.5).sort((a, b) => a.promedio - b.promedio).slice(0, 3);

  const umbral = periodo === "anual" ? UMBRAL_PORCENTAJE_ANUAL : UMBRAL_PORCENTAJE_MINIMO;
  const tieneDatosSuficientes = estudiante.sumaPorcentajes >= umbral;
  const estaEnRiesgo = tieneDatosSuficientes && estudiante.promedio < 3.0;

  const periodoHasta = periodo === "anual" ? 4 : periodo;
  const evolucionEstudiante = Object.entries(estudiante.promediosPorPeriodo || {})
    .map(([p, promedio]) => ({ periodo: `Período ${p}`, promedio }))
    .filter((e) => parseInt(e.periodo.replace("Período ", "")) <= periodoHasta)
    .sort((a, b) => parseInt(a.periodo.replace("Período ", "")) - parseInt(b.periodo.replace("Período ", "")));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <BotonDescarga contenidoRef={contenidoRef} nombreArchivo={titulo || estudiante.nombre_completo} />
      </div>

      <div ref={contenidoRef} className="space-y-6">
        {titulo && (
          <h2 className="text-xl md:text-2xl font-bold text-foreground text-center">{titulo}</h2>
        )}
        <div className="bg-card rounded-lg shadow-soft p-6 border border-border">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center"><User className="w-8 h-8 text-primary" /></div>
              <div>
                <h2 className="text-xl font-bold text-foreground">{estudiante.nombre_completo}</h2>
                <p className="text-muted-foreground">{estudiante.grado} {estudiante.salon}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base text-foreground font-bold">Puesto:</span>
                <div className="text-center px-4 py-2 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Salón</p><p className="text-lg font-bold text-foreground">#{estudiante.posicion_salon}/{estudiante.total_salon}</p></div>
                <div className="text-center px-4 py-2 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Grado</p><p className="text-lg font-bold text-foreground">#{estudiante.posicion_grado}/{estudiante.total_grado}</p></div>
                <div className="text-center px-4 py-2 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Institución</p><p className="text-lg font-bold text-foreground">#{estudiante.posicion_institucional}/{estudiante.total_institucional}</p></div>
              </div>
              <p className="text-[10px] text-muted-foreground">Solo se tienen en cuenta estudiantes con notas registradas</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TarjetaResumen titulo="Promedio General" valor={estudiante.promedio.toFixed(2)} subtitulo={periodo === "anual" ? "Acumulado anual" : `Período ${periodo}`} icono={Award} color={estudiante.promedio >= 4 ? "success" : estudiante.promedio >= 3 ? "warning" : "danger"} />
          <TarjetaResumen titulo="vs Salón" valor={`${(estudiante.promedio - estudiante.promedio_salon) >= 0 ? "+" : ""}${(estudiante.promedio - estudiante.promedio_salon).toFixed(2)}`} subtitulo={`Prom. salón: ${estudiante.promedio_salon.toFixed(2)}`} icono={TrendingUp} color={(estudiante.promedio - estudiante.promedio_salon) >= 0 ? "success" : "danger"} />
          {tieneSuficientesAsignaturas ? (
            <>
              <TarjetaResumen titulo="Mejor Asignatura" valor={mejorAsignatura?.promedio.toFixed(2) || "—"} subtitulo={mejorAsignatura?.asignatura || ""} icono={Star} color={mejorAsignatura && mejorAsignatura.promedio >= 4 ? "success" : mejorAsignatura && mejorAsignatura.promedio >= 3 ? "warning" : "danger"} />
              <TarjetaResumen titulo="Asignatura a Mejorar" valor={peorAsignatura?.promedio.toFixed(2) || "—"} subtitulo={peorAsignatura?.asignatura || ""} icono={AlertTriangle} color={peorAsignatura && peorAsignatura.promedio >= 4 ? "success" : peorAsignatura && peorAsignatura.promedio >= 3 ? "warning" : "danger"} />
            </>
          ) : (
            <TarjetaResumen titulo="Asignatura" valor={asignaturasEstudiante[0]?.promedio.toFixed(2) || "—"} subtitulo={asignaturasEstudiante[0]?.asignatura || "Sin asignaturas"} icono={Star} color={asignaturasEstudiante[0]?.promedio >= 3 ? "success" : "danger"} />
          )}
          <TarjetaResumen
            titulo="Estado Académico"
            valor={!tieneDatosSuficientes ? "—" : estaEnRiesgo ? "En Riesgo" : "Sin Riesgo"}
            subtitulo={!tieneDatosSuficientes ? "Se necesitan más datos" : estaEnRiesgo ? "Promedio < 3.0" : "Promedio ≥ 3.0"}
            icono={estaEnRiesgo ? ShieldAlert : ShieldCheck}
            color={!tieneDatosSuficientes ? "primary" : estaEnRiesgo ? "danger" : "success"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TablaEvolucion titulo="Evolución por Período" datos={evolucionEstudiante} />
          <ListaComparativa titulo="Rendimiento por Asignatura" items={asignaturasEstudiante.map((m) => ({ nombre: m.asignatura, valor: m.promedio }))} mostrarPosicion />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ListaComparativa titulo="Fortalezas" items={fortalezas.map((m) => ({ nombre: m.asignatura, valor: m.promedio }))} tipo="mejor" icono={<Medal className="w-5 h-5 text-green-500" />} />
          <ListaComparativa titulo="Áreas de Mejora" items={debilidades.map((m) => ({ nombre: m.asignatura, valor: m.promedio }))} tipo="peor" icono={<AlertTriangle className="w-5 h-5 text-amber-500" />} />
        </div>

        <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
          <h4 className="font-semibold text-foreground mb-4">Comparativa con Promedios de Referencia</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left p-2 font-medium text-muted-foreground">Referencia</th><th className="text-center p-2 font-medium text-muted-foreground">Promedio</th><th className="text-center p-2 font-medium text-muted-foreground">Diferencia</th></tr></thead>
              <tbody>
                <tr className="border-b hover:bg-muted/50"><td className="p-2 font-medium">{estudiante.nombre_completo}</td><td className="text-center p-2 font-bold text-primary">{estudiante.promedio.toFixed(2)}</td><td className="text-center p-2">—</td></tr>
                <tr className="border-b hover:bg-muted/50"><td className="p-2">Promedio Salón ({estudiante.salon})</td><td className="text-center p-2">{estudiante.promedio_salon.toFixed(2)}</td><td className={`text-center p-2 font-medium ${(estudiante.promedio - estudiante.promedio_salon) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(estudiante.promedio - estudiante.promedio_salon) >= 0 ? "+" : ""}{(estudiante.promedio - estudiante.promedio_salon).toFixed(2)}</td></tr>
                <tr className="border-b hover:bg-muted/50"><td className="p-2">Promedio Grado ({estudiante.grado})</td><td className="text-center p-2">{estudiante.promedio_grado.toFixed(2)}</td><td className={`text-center p-2 font-medium ${(estudiante.promedio - estudiante.promedio_grado) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(estudiante.promedio - estudiante.promedio_grado) >= 0 ? "+" : ""}{(estudiante.promedio - estudiante.promedio_grado).toFixed(2)}</td></tr>
                <tr className="hover:bg-muted/50"><td className="p-2">Promedio Institucional</td><td className="text-center p-2">{estudiante.promedio_institucional.toFixed(2)}</td><td className={`text-center p-2 font-medium ${(estudiante.promedio - estudiante.promedio_institucional) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(estudiante.promedio - estudiante.promedio_institucional) >= 0 ? "+" : ""}{(estudiante.promedio - estudiante.promedio_institucional).toFixed(2)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
