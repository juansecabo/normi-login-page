import { getPeriodoActual } from "@/utils/periodoActual";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isEstudiante } from "@/hooks/useSession";
import HeaderNormy from "@/components/HeaderNormy";
import { useEstadisticas } from "@/hooks/useEstadisticas";
import { AnalisisEstudiante } from "@/components/estadisticas/AnalisisEstudiante";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const EstadisticasEstudiantePage = () => {
  const navigate = useNavigate();
  const { loading } = useEstadisticas();
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState(String(getPeriodoActual()));

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isEstudiante()) {
      navigate("/");
    }
  }, [navigate]);

  const session = getSession();
  if (!session.id || !isEstudiante()) return null;

  const periodoNumerico = periodoSeleccionado === "anual"
    ? ("anual" as const)
    : parseInt(periodoSeleccionado);

  const periodoTexto = periodoSeleccionado === "anual" ? "Acumulado Anual" : `Período ${periodoSeleccionado}`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard-estudiante" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard-estudiante")} className="text-primary hover:underline">
              Inicio
            </button>
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
            {/* Selector de período */}
            <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
              <div className="flex items-center gap-4">
                <label className="text-sm text-muted-foreground">Período</label>
                <Select value={periodoSeleccionado} onValueChange={setPeriodoSeleccionado}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Período 1</SelectItem>
                    <SelectItem value="2">Período 2</SelectItem>
                    <SelectItem value="3">Período 3</SelectItem>
                    <SelectItem value="4">Período 4</SelectItem>
                    <SelectItem value="anual">Acumulado Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <AnalisisEstudiante
              idEstudiante={session.id}
              periodo={periodoNumerico}
              titulo={`${session.nombres} ${session.apellidos} - ${periodoTexto}`}
            />
          </>
        )}
      </main>
    </div>
  );
};

export default EstadisticasEstudiantePage;
