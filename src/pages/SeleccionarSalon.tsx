import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import HeaderNormy from "@/components/HeaderNormy";

const SeleccionarSalon = () => {
  const navigate = useNavigate();
  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState("");
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salones, setSalones] = useState<string[]>([]);
  const [selectedSalon, setSelectedSalon] = useState<string | null>(null);
  const [loadingSalones, setLoadingSalones] = useState(true);

  useEffect(() => {
    const session = getSession();
    const storedAsignatura = localStorage.getItem("asignaturaSeleccionada");
    const storedGrado = localStorage.getItem("gradoSeleccionado");

    if (!session.id) {
      navigate("/");
      return;
    }

    if (!storedAsignatura) {
      navigate("/dashboard");
      return;
    }

    if (!storedGrado) {
      navigate("/seleccionar-grado");
      return;
    }

    setAsignaturaSeleccionada(storedAsignatura);
    setGradoSeleccionado(storedGrado);

    const fetchSalones = async () => {
      try {
        // Buscar asignaciones que contengan la asignatura y grado seleccionados directamente por id
        const { data: asignaciones, error: asignacionError } = await supabase
          .from('Asignación Profesores')
          .select('"Asignatura(s)", "Grado(s)", "Salon(es)"')
          .eq('id', parseInt(session.id!));

        if (asignacionError || !asignaciones) {
          setLoadingSalones(false);
          return;
        }

        // Filtrar solo las asignaciones que contienen la asignatura y grado seleccionados
        const asignacionesFiltradas = asignaciones.filter(a => {
          const asignaturas = (a['Asignatura(s)'] || []).flat();
          const grados = (a['Grado(s)'] || []).flat();
          return asignaturas.includes(storedAsignatura) && grados.includes(storedGrado);
        });

        console.log("Salones antes de aplanar:", asignacionesFiltradas?.map(a => a['Salon(es)']));

        // Extraer todos los salones y eliminar duplicados
        const todosSalones = asignacionesFiltradas
          ?.flatMap(a => a['Salon(es)'] || [])
          .flat() || [];
        const salonesUnicos = [...new Set(todosSalones)];
        setSalones(salonesUnicos);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoadingSalones(false);
      }
    };

    fetchSalones();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 max-w-4xl mx-auto mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={() => navigate("/dashboard")}
              className="text-primary hover:underline"
            >
              Asignaturas
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/seleccionar-grado")}
              className="text-primary hover:underline"
            >
              {asignaturaSeleccionada}
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">{gradoSeleccionado}</span>
          </div>
        </div>

        {/* Sección de Salones */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            Elige tu salón:
          </h3>
          
          {loadingSalones ? (
            <div className="text-center text-muted-foreground">
              Cargando salones...
            </div>
          ) : salones.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No hay salones asignados para este grado
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {salones.map((salon, index) => {
                const isSelected = selectedSalon === salon;
                
                return (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedSalon(salon);
                      localStorage.setItem("salonSeleccionado", salon);
                      navigate("/tabla-notas");
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
                    <span className="font-medium text-foreground">{salon}</span>
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

export default SeleccionarSalon;
