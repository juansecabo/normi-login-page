import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";

// Orden canónico de referencia. La lista REAL de grados se deriva por colegio
// desde la tabla Estudiantes (RLS filtra por colegio), para que cada colegio
// vea solo los grados que tiene: "Párvulo" existe en el Pestalozziano y no en
// la Normal. Esto solo fija el ORDEN de presentación.
const ORDEN_GRADOS = [
  "Párvulo", "Prejardín", "Jardín", "Transición",
  "Primero", "Segundo", "Tercero", "Cuarto", "Quinto",
  "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo", "Undécimo",
];

const SeleccionarGradoRector = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [grados, setGrados] = useState<string[]>([]);

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

    (async () => {
      const { data } = await supabase.from("Estudiantes").select("grado");
      const existentes = new Set(
        (data as { grado: string | null }[] | null)?.map(r => r.grado).filter(Boolean) || []
      );
      setGrados(ORDEN_GRADOS.filter(g => existentes.has(g)));
      setLoading(false);
    })();
  }, [navigate]);

  const handleSelectGrado = (grado: string) => {
    localStorage.setItem("gradoSeleccionado", grado);
    navigate("/rector/seleccionar-salon");
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
      <HeaderNormi backLink="/dashboard-rector" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button 
              onClick={() => navigate("/dashboard-rector")}
              className="text-primary hover:underline"
            >
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Notas</span>
          </div>
        </div>

        {/* Selector de Grado */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            Selecciona el grado:
          </h3>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {grados.map((grado) => (
              <button
                key={grado}
                onClick={() => handleSelectGrado(grado)}
                className="p-4 rounded-lg border-2 text-center transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/10 border-border bg-background"
              >
                <span className="font-medium text-foreground">{grado}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SeleccionarGradoRector;
