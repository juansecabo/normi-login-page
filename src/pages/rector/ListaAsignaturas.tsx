import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";

const ListaAsignaturas = () => {
  const navigate = useNavigate();
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [asignaturas, setAsignaturas] = useState<string[]>([]);
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
      navigate("/dashboard/seleccionar-grado");
      return;
    }

    if (!storedSalon) {
      navigate("/dashboard/seleccionar-salon");
      return;
    }

    setGradoSeleccionado(storedGrado);
    setSalonSeleccionado(storedSalon);
    fetchAsignaturas(storedGrado, storedSalon);
  }, [navigate]);

  const fetchAsignaturas = async (grado: string, salon: string) => {
    try {
      // Obtener todas las asignaciones para este grado y salón
      const { data, error } = await supabase
        .from('Asignación Profesores')
        .select('"Asignatura(s)", "Grado(s)", "Salon(es)"');

      if (error) {
        console.error('Error fetching asignaturas:', error);
        setLoading(false);
        return;
      }

      // Filtrar por grado y salón
      const asignaturasDelGrado: string[] = [];

      data?.forEach((asignacion) => {
        const grados = asignacion['Grado(s)'] || [];
        const salones = asignacion['Salon(es)'] || [];
        const asignaturasAsig = asignacion['Asignatura(s)'] || [];

        // Verificar si el grado y salón están en esta asignación
        if (grados.includes(grado) && salones.includes(salon)) {
          asignaturasAsig.forEach((asignatura: string) => {
            if (!asignaturasDelGrado.includes(asignatura)) {
              asignaturasDelGrado.push(asignatura);
            }
          });
        }
      });

      // Ordenar alfabéticamente
      asignaturasDelGrado.sort((a, b) => a.localeCompare(b, 'es'));
      setAsignaturas(asignaturasDelGrado);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAsignatura = (asignatura: string) => {
    localStorage.setItem("asignaturaSeleccionada", asignatura);
    navigate("/dashboard/tabla-notas");
  };

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
            <button
              onClick={() => navigate("/dashboard/seleccionar-grado")}
              className="text-primary hover:underline"
            >
              Notas
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/dashboard/seleccionar-salon")}
              className="text-primary hover:underline"
            >
              {gradoSeleccionado}
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/dashboard/modo-visualizacion")}
              className="text-primary hover:underline"
            >
              {salonSeleccionado}
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Por Asignatura</span>
          </div>
        </div>

        {/* Lista de Asignaturas */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            Selecciona la asignatura:
          </h3>

          {loading ? (
            <div className="text-center text-muted-foreground">
              Cargando asignaturas...
            </div>
          ) : asignaturas.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No hay asignaturas asignadas para este grado y salón
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {asignaturas.map((asignatura) => (
                <button
                  key={asignatura}
                  onClick={() => handleSelectAsignatura(asignatura)}
                  className="p-6 rounded-lg border-2 text-center transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/10 border-border bg-background"
                >
                  <span className="font-medium text-foreground">{asignatura}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ListaAsignaturas;
