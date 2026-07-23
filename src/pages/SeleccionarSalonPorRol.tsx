import { Navigate } from "react-router-dom";
import { isProfesor, puedeAccederDashboard } from "@/hooks/useSession";
import SeleccionarSalon from "./SeleccionarSalon";
import SeleccionarSalonRector from "./rector/SeleccionarSalonRector";

/**
 * Despachador por rol de /seleccionar-salon. Profesor edita (SeleccionarSalon);
 * directivos navegan en solo lectura (SeleccionarSalonRector). Mismo componente
 * que antes se servía en cada flujo → comportamiento idéntico.
 */
const SeleccionarSalonPorRol = () => {
  if (isProfesor()) return <SeleccionarSalon />;
  if (puedeAccederDashboard()) return <SeleccionarSalonRector />;
  return <Navigate to="/dashboard" replace />;
};

export default SeleccionarSalonPorRol;
