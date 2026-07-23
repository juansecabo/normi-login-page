import { Navigate } from "react-router-dom";
import { isProfesor, puedeAccederDashboard } from "@/hooks/useSession";
import SeleccionarGrado from "./SeleccionarGrado";
import SeleccionarGradoRector from "./rector/SeleccionarGradoRector";

/**
 * Despachador por rol de /seleccionar-grado. La ruta es única para todos, pero
 * el profesor edita SUS asignaturas (SeleccionarGrado) y los directivos navegan
 * en solo lectura (SeleccionarGradoRector). Monta EXACTAMENTE el mismo componente
 * que antes se servía en /seleccionar-grado (profesor) y /dashboard/seleccionar-grado
 * (directivo), así el comportamiento por rol es idéntico.
 */
const SeleccionarGradoPorRol = () => {
  if (isProfesor()) return <SeleccionarGrado />;
  if (puedeAccederDashboard()) return <SeleccionarGradoRector />;
  return <Navigate to="/dashboard" replace />;
};

export default SeleccionarGradoPorRol;
