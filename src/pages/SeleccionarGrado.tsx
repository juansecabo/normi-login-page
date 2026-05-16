import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";

const SeleccionarGrado = () => {
  const navigate = useNavigate();
  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState("");
  const [grados, setGrados] = useState<string[]>([]);
  const [selectedGrado, setSelectedGrado] = useState<string | null>(null);
  const [loadingGrados, setLoadingGrados] = useState(true);

  useEffect(() => {
    const session = getSession();
    const storedAsignatura = localStorage.getItem("asignaturaSeleccionada");

    if (!session.id) {
      navigate("/");
      return;
    }

    if (!storedAsignatura) {
      navigate("/dashboard");
      return;
    }

    setAsignaturaSeleccionada(storedAsignatura);

    const fetchGrados = async () => {
      try {
        // Buscar asignaciones que contengan la asignatura seleccionada directamente por id
        const { data: asignaciones, error: asignacionError } = await supabase
          .from('Asignación Profesores')
          .select('"Asignatura(s)", "Grado(s)"')
          .eq('id', parseInt(session.id!));

        if (asignacionError || !asignaciones) {
          setLoadingGrados(false);
          return;
        }

        // Filtrar solo las asignaciones que contienen la asignatura seleccionada
        const asignacionesFiltradas = asignaciones.filter(a => {
          const asignaturas = (a['Asignatura(s)'] || []).flat();
          return asignaturas.includes(storedAsignatura);
        });

        console.log("Grados antes de aplanar:", asignacionesFiltradas?.map(a => a['Grado(s)']));

        // Extraer todos los grados y eliminar duplicados
        const todosGrados = asignacionesFiltradas
          ?.flatMap(a => a['Grado(s)'] || [])
          .flat() || [];
        const ordenGrados = [
          'Prejardín', 'Jardín', 'Transición',
          'Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto',
          'Sexto', 'Séptimo', 'Octavo', 'Noveno',
          'Décimo', 'Undécimo'
        ];
        const gradosUnicos = [...new Set(todosGrados)];
        gradosUnicos.sort((a, b) => ordenGrados.indexOf(a) - ordenGrados.indexOf(b));
        setGrados(gradosUnicos);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoadingGrados(false);
      }
    };

    fetchGrados();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-8">
        {/* Breadcrumb / Asignatura seleccionada */}
        <div className="bg-card rounded-lg shadow-soft p-4 max-w-4xl mx-auto mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => navigate("/dashboard")}
              className="text-primary hover:underline"
            >
              Asignaturas
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">{asignaturaSeleccionada}</span>
          </div>
        </div>

        {/* Sección de Grados */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            Elige tu grado:
          </h3>
          
          {loadingGrados ? (
            <div className="text-center text-muted-foreground">
              Cargando grados...
            </div>
          ) : grados.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No hay grados asignados para esta asignatura
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {grados.map((grado, index) => {
                const isSelected = selectedGrado === grado;
                
                return (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedGrado(grado);
                      localStorage.setItem("gradoSeleccionado", grado);
                      navigate("/seleccionar-salon");
                    }}
                    className={`
                      p-6 rounded-lg border-2 text-center transition-all duration-200
                      hover:shadow-md hover:border-primary hover:bg-primary/10
                      ${isSelected 
                        ? 'border-primary bg-primary/20 shadow-md ring-2 ring-primary/30' 
                        : 'border-border bg-background'
                      }
                    `}
                  >
                    <span className="font-medium text-foreground">{grado}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SeleccionarGrado;
