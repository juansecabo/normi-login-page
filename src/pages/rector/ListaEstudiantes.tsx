import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import HeaderNormy from "@/components/HeaderNormy";

interface Estudiante {
  id_estudiantil: string;
  apellidos_estudiante: string;
  nombre_estudiante: string;
}

const ListaEstudiantes = () => {
  const navigate = useNavigate();
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
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
    fetchEstudiantes(storedGrado, storedSalon);
  }, [navigate]);

  const fetchEstudiantes = async (grado: string, salon: string) => {
    try {
      const { data, error } = await supabase
        .from('Estudiantes')
        .select('id_estudiantil, apellidos_estudiante, nombre_estudiante')
        .eq('grado_estudiante', grado)
        .eq('salon_estudiante', salon)
        .order('apellidos_estudiante', { ascending: true })
        .order('nombre_estudiante', { ascending: true });

      if (error) {
        console.error('Error fetching estudiantes:', error);
        setLoading(false);
        return;
      }

      setEstudiantes(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEstudiante = (estudiante: Estudiante) => {
    localStorage.setItem("estudianteSeleccionado", JSON.stringify(estudiante));
    navigate("/rector/estudiante-consolidado");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard-rector" />

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
            <button 
              onClick={() => navigate("/rector/modo-visualizacion")}
              className="text-primary hover:underline"
            >
              {salonSeleccionado}
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Por Estudiante</span>
          </div>
        </div>

        {/* Lista de Estudiantes */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            Selecciona el estudiante:
          </h3>
          
          {loading ? (
            <div className="text-center text-muted-foreground">
              Cargando estudiantes...
            </div>
          ) : estudiantes.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No hay estudiantes en este salón
            </div>
          ) : (
            <div className="space-y-2">
              {estudiantes.map((estudiante) => (
                <button
                  key={estudiante.id_estudiantil}
                  onClick={() => handleSelectEstudiante(estudiante)}
                  className="w-full p-4 rounded-lg border-2 text-left transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/10 border-border bg-background flex items-center justify-between"
                >
                  <div className="flex-1">
                    <span className="font-medium text-foreground">
                      {estudiante.apellidos_estudiante} {estudiante.nombre_estudiante}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {estudiante.id_estudiantil}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ListaEstudiantes;
