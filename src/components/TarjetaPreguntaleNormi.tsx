import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { getSession } from "@/hooks/useSession";
import normiImg from "@/assets/normi-guia.png";

// Entrada a "Pregúntale a Normi" en el tablero (antes de "¿Qué deseas consultar?").
// Solo para los cargos con acceso al chat de datos del colegio.
export const ROLES_PREGUNTALE_NORMI = ["Rector", "Coordinador(a)", "Administrador"];

const TarjetaPreguntaleNormi = () => {
  const navigate = useNavigate();
  if (!ROLES_PREGUNTALE_NORMI.includes(getSession().cargo || "")) return null;
  return (
    <button
      type="button"
      data-guia="estadisticas.boton_preguntar"
      onClick={() => navigate("/preguntale-a-normi")}
      className="w-full max-w-2xl mx-auto mt-8 flex items-center gap-4 rounded-lg bg-card shadow-soft p-4 md:p-5 text-left border-2 border-transparent hover:border-primary transition-colors"
    >
      <img src={normiImg} alt="" className="w-12 h-12 md:w-14 md:h-14 object-contain shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-bold text-foreground text-base md:text-lg">Pregúntale a Normi</div>
        <div className="text-sm text-muted-foreground">Cualquier pregunta sobre notas, asistencia o convivencia del colegio.</div>
      </div>
      <MessageCircle className="w-5 h-5 text-primary shrink-0" />
    </button>
  );
};

export default TarjetaPreguntaleNormi;
