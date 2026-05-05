import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import HeaderNormy from "@/components/HeaderNormy";
import { useEstadisticas } from "@/hooks/useEstadisticas";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EstudiantesEnRiesgo = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loading, getEstudiantesEnRiesgo } = useEstadisticas();

  const periodoParam = searchParams.get("periodo");
  const gradoParam = searchParams.get("grado");
  const salonParam = searchParams.get("salon");
  const nivelParam = searchParams.get("nivel");
  const asignaturaParam = searchParams.get("asignatura");

  const periodo = periodoParam === "anual" ? "anual" : parseInt(periodoParam || "1");

  // Construir URL para volver a estadísticas con los mismos filtros
  const buildVolverUrl = () => {
    const params = new URLSearchParams();
    if (nivelParam) params.set("nivel", nivelParam);
    if (periodoParam) params.set("periodo", periodoParam);
    if (gradoParam) params.set("grado", gradoParam);
    if (salonParam) params.set("salon", salonParam);
    if (asignaturaParam) params.set("asignatura", asignaturaParam);
    return `/rector/estadisticas?${params.toString()}`;
  };

  useEffect(() => {
    const session = getSession();
    if (!session.id) {
      navigate("/");
      return;
    }
    if (!isRectorOrCoordinador()) {
      navigate("/dashboard");
      return;
    }
  }, [navigate]);

  // Pasar asignatura al cálculo de riesgo si está presente
  const estudiantesEnRiesgo = getEstudiantesEnRiesgo(
    periodo,
    gradoParam || undefined,
    salonParam || undefined,
    asignaturaParam || undefined
  );

  // Construir label del filtro
  let filtroLabel = "Todos los estudiantes";
  if (gradoParam && salonParam) {
    filtroLabel = `${gradoParam} - Salón ${salonParam}`;
  } else if (gradoParam) {
    filtroLabel = `Grado ${gradoParam}`;
  }

  const periodoLabel = periodo === "anual" ? "Acumulado Anual" : `Período ${periodo}`;

  const getColorPorPromedio = (promedio: number) => {
    if (promedio < 2.0) return "text-red-600 font-bold";
    if (promedio < 2.5) return "text-red-500 font-semibold";
    return "text-amber-600";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard-rector" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard-rector")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <button onClick={() => navigate(buildVolverUrl())} className="text-primary hover:underline">Estadísticas</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Estudiantes en Riesgo</span>
          </div>
        </div>

        {/* Header de la página */}
        <div className="bg-card rounded-lg shadow-soft p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-red-100">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-foreground">Estudiantes en Riesgo Académico</h1>
                <p className="text-muted-foreground text-sm">Promedio menor a 3.0</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(buildVolverUrl())}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a Estadísticas
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-muted rounded-full text-sm">{filtroLabel}</span>
            <span className="px-3 py-1 bg-muted rounded-full text-sm">{periodoLabel}</span>
            {asignaturaParam && (
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">{asignaturaParam}</span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Cargando datos...</span>
          </div>
        ) : estudiantesEnRiesgo.length === 0 ? (
          <div className="bg-card rounded-lg shadow-soft p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">¡Excelente!</h3>
            <p className="text-muted-foreground">No hay estudiantes en riesgo académico con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="bg-card rounded-lg shadow-soft overflow-hidden">
            <div className="p-4 border-b border-border">
              <p className="text-sm text-muted-foreground">
                Se encontraron <span className="font-bold text-red-600">{estudiantesEnRiesgo.length}</span> estudiante(s) con promedio menor a 3.0
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Nombre Completo</TableHead>
                  <TableHead>Grado</TableHead>
                  <TableHead>Salón</TableHead>
                  <TableHead className="text-right">Promedio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estudiantesEnRiesgo
                  .sort((a, b) => a.promedio - b.promedio)
                  .map((est, idx) => (
                    <TableRow key={est.id_estudiantil}>
                      <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{est.nombre_completo}</TableCell>
                      <TableCell>{est.grado}</TableCell>
                      <TableCell>{est.salon}</TableCell>
                      <TableCell className={`text-right ${getColorPorPromedio(est.promedio)}`}>
                        {est.promedio.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
};

export default EstudiantesEnRiesgo;