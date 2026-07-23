import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { gradosDelColegio } from "@/utils/grados";

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

    gradosDelColegio().then((g) => { setGrados(g); setLoading(false); });
  }, [navigate]);

  const handleSelectGrado = (grado: string) => {
    localStorage.setItem("gradoSeleccionado", grado);
    navigate("/seleccionar-salon");
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
      <HeaderNormi backLink="/dashboard" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button 
              onClick={() => navigate("/dashboard")}
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
