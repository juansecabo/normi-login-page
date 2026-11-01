import { useNavigate } from "react-router-dom";
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
      className="w-full max-w-lg mx-auto mt-8 flex items-center gap-4 rounded-lg border-2 border-emerald-300 bg-emerald-100 hover:bg-emerald-200 hover:shadow-md pl-5 pr-3 py-3 text-left transition-all duration-200"
    >
      {/* Normi a la derecha: mira hacia la izquierda, hacia el texto. */}
      <div className="min-w-0 flex-1">
        <div className="font-bold text-foreground text-lg md:text-xl">Pregúntale a Normi</div>
        <div className="text-sm text-foreground/70">Pregúntale lo que quieras sobre el colegio.</div>
      </div>
      <img src={normiImg} alt="" className="w-16 h-16 md:w-20 md:h-20 object-contain shrink-0" />
    </button>
  );
};

export default TarjetaPreguntaleNormi;
