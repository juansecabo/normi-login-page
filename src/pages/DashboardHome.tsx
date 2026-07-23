import { Navigate } from "react-router-dom";
import {
  getSession, isAdmin, isProfesor, isEstudiante, isPadreDeFamilia, puedeAccederDashboard,
} from "@/hooks/useSession";
import Dashboard from "./Dashboard";
import DashboardRector from "./DashboardRector";
import DashboardEstudiante from "./DashboardEstudiante";
import DashboardAcudiente from "./DashboardAcudiente";
import DashboardAdmin from "./DashboardAdmin";
import DashboardPlataforma from "./DashboardPlataforma";

/**
 * Home ÚNICO para todos los roles. La URL es siempre /dashboard; este despachador
 * lee el rol de la sesión y monta el dashboard que corresponde. La URL ya no revela
 * el cargo (antes había /panel, /dashboard-estudiante, /dashboard-admin, etc.).
 * Cada dashboard mantiene su propia lógica interna (permisos, redirecciones).
 */
const DashboardHome = () => {
  const { id, cargo } = getSession();
  if (!id) return <Navigate to="/" replace />;
  if (cargo === "SuperAdmin") return <DashboardPlataforma />;
  if (isEstudiante()) return <DashboardEstudiante />;
  if (isPadreDeFamilia()) return <DashboardAcudiente />;
  if (isAdmin()) return <DashboardAdmin />;
  if (isProfesor()) return <Dashboard />;
  if (puedeAccederDashboard()) return <DashboardRector />; // rector/coordinador/secretaría/administrativo/orientador
  return <Navigate to="/" replace />;
};

export default DashboardHome;
