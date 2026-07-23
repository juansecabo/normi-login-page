import { Navigate } from "react-router-dom";
import { isProfesor, puedeAccederDashboard } from "@/hooks/useSession";
import TablaNotasRouter from "./TablaNotasRouter";
import TablaNotasReadOnlyRouter from "./TablaNotasReadOnlyRouter";

/**
 * Despachador por rol de /tabla-notas. Profesor edita (TablaNotasRouter);
 * directivos ven en solo lectura (TablaNotasReadOnlyRouter). Cada router ya
 * decide internamente preescolar vs normal → comportamiento idéntico al de antes
 * (/tabla-notas para profesor, /dashboard/tabla-notas para directivo).
 */
const TablaNotasPorRol = () => {
  if (isProfesor()) return <TablaNotasRouter />;
  if (puedeAccederDashboard()) return <TablaNotasReadOnlyRouter />;
  return <Navigate to="/dashboard" replace />;
};

export default TablaNotasPorRol;
