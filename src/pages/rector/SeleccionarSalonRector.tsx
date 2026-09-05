import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";

import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
const SeleccionarSalonRector = () => {
  const navigate = useNavigate();
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salones, setSalones] = useState<string[]>([]);
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
    if (!storedGrado) {
      navigate("/seleccionar-grado");
      return;
    }

    setGradoSeleccionado(storedGrado);
    fetchSalones(storedGrado);
  }, [navigate]);

  const fetchSalones = async (grado: string) => {
    try {
      // Obtener salones únicos de la tabla Estudiantes para el grado seleccionado
      const { data, error } = await supabase
        .from('Estudiantes')
        .select('salon')
        .eq('grado', grado);

      if (error) {
        console.error('Error fetching salones:', error);
        setLoading(false);
        return;
      }

      // Obtener salones únicos
      const salonesUnicos = [...new Set(data?.map(e => e.salon) || [])].sort();
      setSalones(salonesUnicos);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSalon = (salon: string) => {
    localStorage.setItem("salonSeleccionado", salon);
    navigate("/modo-visualizacion");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button 
              onClick={() => navigate("/dashboard")}
              className="text-primary hover:underline"
            >
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <button 
              onClick={() => navigate("/seleccionar-grado")}
              className="text-primary hover:underline"
            >
              Notas
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">{gradoSeleccionado}</span>
          </BreadcrumbDeslizable>
        </div>

        {/* Selector de Salón */}
        <div data-guia="notas.selector_salon" className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            Selecciona el salón:
          </h3>
          
          {loading ? (
            <div className="text-center text-muted-foreground">
              Cargando salones...
            </div>
          ) : salones.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No hay salones disponibles para este grado
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-guia="estadisticas.select_salon_item">
              {salones.map((salon) => (
                <button
                  key={salon}
                  onClick={() => handleSelectSalon(salon)}
                  className="p-4 rounded-lg border-2 text-center transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/10 border-border bg-background"
                >
                  <span className="font-medium text-foreground">{salon}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SeleccionarSalonRector;
