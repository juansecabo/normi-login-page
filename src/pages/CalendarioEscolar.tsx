import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
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
        <button onClick={() => navigate("/dashboard")} className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <CalendarioColegioEditor soloLectura />
      </main>
    </div>
  );
};

export default CalendarioEscolar;
