import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { getSession } from "@/hooks/useSession";
import normiImg from "@/assets/normi-graficas.webp";

// Entrada a "Pregúntale a Normi" en el tablero (antes de "¿Qué deseas consultar?"),
// con el estilo de las fichas (fondo verde claro). Solo para los cargos con acceso.
export const ROLES_PREGUNTALE_NORMI = ["Rector", "Coordinador(a)", "Administrador"];

const TarjetaPreguntaleNormi = () => {
  const navigate = useNavigate();
  if (!ROLES_PREGUNTALE_NORMI.includes(getSession().cargo || "")) return null;
  return (
    <button
      type="button"
      data-guia="estadisticas.boton_preguntar"
      onClick={() => navigate("/preguntale-a-normi")}
      className="w-full max-w-2xl mx-auto mt-8 flex items-center gap-4 rounded-lg bg-emerald-100 hover:bg-emerald-200 hover:shadow-md p-4 md:p-5 text-left transition-all duration-200"
    >
      <img src={normiImg} alt="" className="w-16 h-16 md:w-20 md:h-20 object-contain shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-bold text-foreground text-lg md:text-xl">Pregúntale a Normi</div>
        <div className="text-sm text-foreground/70">Pregúntale lo que quieras sobre el colegio.</div>
      </div>
      <MessageCircle className="w-6 h-6 text-primary shrink-0" />
    </button>
  );
};

export default TarjetaPreguntaleNormi;
