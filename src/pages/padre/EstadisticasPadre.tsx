import { getPeriodoActual } from "@/utils/periodoActual";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isPadreDeFamilia, HijoData } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { useEstadisticas } from "@/hooks/useEstadisticas";
import { AnalisisEstudiante } from "@/components/estadisticas/AnalisisEstudiante";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, User } from "lucide-react";

const EstadisticasPadre = () => {
  const navigate = useNavigate();
  const { loading } = useEstadisticas();
  const [hijos, setHijos] = useState<HijoData[]>([]);
  const [hijo, setHijo] = useState<HijoData | null>(null);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState(String(getPeriodoActual()));

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isPadreDeFamilia()) {
      navigate("/");
      return;
    }

    const hijosData = session.hijos || [];
    setHijos(hijosData);

    if (hijosData.length === 1) {
      setHijo(hijosData[0]);
      localStorage.setItem("hijoSeleccionado", JSON.stringify(hijosData[0]));
    }
  }, [navigate]);

  // Handle browser back button to return to student selection
  useEffect(() => {
    const handlePopState = () => {
      if (hijo) {
        setHijo(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hijo]);

  const seleccionar = (h: HijoData) => {
    setHijo(h);
    window.history.pushState({ hijoSelected: true }, '');
    localStorage.setItem("hijoSeleccionado", JSON.stringify(h));
  };

  const periodoNumerico = periodoSeleccionado === "anual"
    ? ("anual" as const)
    : parseInt(periodoSeleccionado);

  const periodoTexto = periodoSeleccionado === "anual" ? "Acumulado Anual" : `Período ${periodoSeleccionado}`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard-padre" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard-padre")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">&rarr;</span>
            {hijo && hijos.length > 1 ? (
              <>
                <button onClick={() => setHijo(null)} className="text-primary hover:underline">
                  Escoger Estudiante
                </button>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="text-foreground font-medium">Estadísticas de {hijo.nombre}</span>
              </>
            ) : (
              <span className="text-foreground font-medium">Estadísticas{hijo ? ` de ${hijo.nombre}` : ''}</span>
            )}
          </div>
        </div>

        {!hijo && hijos.length > 1 && (
          <div className="bg-card rounded-lg shadow-soft p-6 mb-6">
            <h3 className="text-lg font-bold text-foreground mb-4 text-center">
              Selecciona un estudiante
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {hijos.map((h) => (
                <button
                  key={h.id}
                  onClick={() => seleccionar(h)}
                  className="flex items-center gap-3 p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-muted/50 transition-all duration-200 text-left"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{h.nombre} {h.apellidos}</p>
                    <p className="text-sm text-muted-foreground">{h.grado} - {h.salon}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {hijo && (
          <>
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Cargando datos...</span>
              </div>
            ) : (
              <>
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
                  idEstudiante={hijo.id}
                  periodo={periodoNumerico}
                  titulo={`${hijo.nombre} ${hijo.apellidos} - ${periodoTexto}`}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default EstadisticasPadre;
