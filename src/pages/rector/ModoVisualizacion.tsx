import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { BookOpen, Users } from "lucide-react";

const ModoVisualizacion = () => {
  const navigate = useNavigate();
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [loading, setLoading] = useState(true);

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

    const storedGrado = localStorage.getItem("gradoSeleccionado");
    const storedSalon = localStorage.getItem("salonSeleccionado");

    if (!storedGrado) {
      navigate("/rector/seleccionar-grado");
      return;
    }

    if (!storedSalon) {
      navigate("/rector/seleccionar-salon");
      return;
    }

    setGradoSeleccionado(storedGrado);
    setSalonSeleccionado(storedSalon);
    setLoading(false);
  }, [navigate]);

  const handleSelectModo = (modo: "asignatura" | "estudiante") => {
    localStorage.setItem("modoVisualizacion", modo);
    if (modo === "asignatura") {
      navigate("/rector/lista-asignaturas");
    } else {
      navigate("/rector/lista-estudiantes");
    }
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
      <HeaderNormi backLink="/panel" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={() => navigate("/panel")}
              className="text-primary hover:underline"
            >
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/rector/seleccionar-grado")}
              className="text-primary hover:underline"
            >
              Notas
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/rector/seleccionar-salon")}
              className="text-primary hover:underline"
            >
              {gradoSeleccionado}
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">{salonSeleccionado}</span>
          </div>
        </div>

        {/* Selector de Modo */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            ¿Cómo deseas ver las notas?
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl mx-auto">
            <button
              onClick={() => handleSelectModo("asignatura")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg border-2 border-border bg-background transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/10"
            >
              <BookOpen className="w-16 h-16 text-primary" />
              <span className="font-semibold text-lg text-foreground">Por Asignatura</span>
              <span className="text-sm text-muted-foreground text-center">
                Ver todas las asignaturas y seleccionar una
              </span>
            </button>

            <button
              onClick={() => handleSelectModo("estudiante")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg border-2 border-border bg-background transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/10"
            >
              <Users className="w-16 h-16 text-primary" />
              <span className="font-semibold text-lg text-foreground">Por Estudiante</span>
              <span className="text-sm text-muted-foreground text-center">
                Ver la situación académica de cada estudiante
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ModoVisualizacion;
