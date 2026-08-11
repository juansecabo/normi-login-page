import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import CalendarioColegioEditor from "@/components/CalendarioColegioEditor";

/**
 * Ficha "Calendario" de TODOS los perfiles — solo visualización del calendario
 * escolar (periodos, días sin clases, eventos y festivos). La edición vive
 * únicamente en Configurar Institución (roles autorizados).
 */
const CalendarioEscolar = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-5xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Calendario</span>
          </div>
        </div>
        <CalendarioColegioEditor soloLectura />
      </main>
    </div>
  );
};

export default CalendarioEscolar;
