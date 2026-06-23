import { useNavigate } from "react-router-dom";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import EncabezadoColegio from "@/components/EncabezadoColegio";
import { Camera, BarChart3 } from "lucide-react";

/**
 * "Dirección de grupo": menú del director de grupo. Agrupa sus dos herramientas
 * — Fotos de mi grupo (/mi-grupo) y Consolidado de mi grupo (/consolidado-grupo).
 * La ficha del dashboard solo se muestra a quienes son directores de grupo.
 */
const DireccionGrupo = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={computeBackLinkFromSession()} />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <EncabezadoColegio />
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Dirección de grupo</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8">
          <h2 className="text-xl font-bold text-foreground mb-6 text-center">Dirección de grupo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            <button
              onClick={() => navigate("/mi-grupo")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg border-2 border-border bg-background transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/5"
            >
              <Camera className="w-12 h-12 text-lime-700" />
              <span className="font-semibold text-foreground text-center">Fotos de mi grupo</span>
              <span className="text-xs text-muted-foreground text-center">Agrega o edita la foto de tus estudiantes.</span>
            </button>
            <button
              onClick={() => navigate("/consolidado-grupo")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg border-2 border-border bg-background transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/5"
            >
              <BarChart3 className="w-12 h-12 text-orange-600" />
              <span className="font-semibold text-foreground text-center">Consolidado de mi grupo</span>
              <span className="text-xs text-muted-foreground text-center">Notas de todos tus estudiantes en todas las asignaturas.</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DireccionGrupo;
