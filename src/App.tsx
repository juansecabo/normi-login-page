import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import DashboardRector from "./pages/DashboardRector";
import DashboardEstudiante from "./pages/DashboardEstudiante";
import DashboardPadre from "./pages/DashboardPadre";
import DashboardAdmin from "./pages/DashboardAdmin";
import SeleccionarGrado from "./pages/SeleccionarGrado";
import SeleccionarSalon from "./pages/SeleccionarSalon";
import TablaNotas from "./pages/TablaNotas";
import ActividadesCalendario from "./pages/ActividadesCalendario";
import NormyExaminadora from "./pages/NormyExaminadora";
import NotFound from "./pages/NotFound";

// Rutas para Rector/Coordinador
import SeleccionarGradoRector from "./pages/rector/SeleccionarGradoRector";
import SeleccionarSalonRector from "./pages/rector/SeleccionarSalonRector";
import ModoVisualizacion from "./pages/rector/ModoVisualizacion";
import ListaAsignaturas from "./pages/rector/ListaAsignaturas";
import ListaEstudiantes from "./pages/rector/ListaEstudiantes";
import TablaNotasReadOnly from "./pages/rector/TablaNotasReadOnly";
import EstudianteConsolidado from "./pages/rector/EstudianteConsolidado";
import EstadisticasDashboard from "./pages/rector/EstadisticasDashboard";
import EstudiantesEnRiesgo from "./pages/rector/EstudiantesEnRiesgo";
import PanelControl from "./pages/rector/PanelControl";
import UsoNormy from "./pages/rector/UsoNormy";
import ComunicadosRecibidos from "./pages/rector/ComunicadosRecibidos";
import DocumentosRecibidos from "./pages/rector/DocumentosRecibidos";

// Rutas para Admin
import Sugerencias from "./pages/admin/Sugerencias";
import TodasActividades from "./pages/admin/TodasActividades";

// Rutas para Profesor
import EstadisticasProfesor from "./pages/profesor/EstadisticasProfesor";
import ProgramarActividad from "./pages/profesor/ProgramarActividad";
import ComunicadosProfesor from "./pages/profesor/ComunicadosProfesor";
import DocumentosProfesor from "./pages/profesor/DocumentosProfesor";

// Rutas compartidas (Profesor + Rector)
import RegistroNormy from "./pages/RegistroNormy";

// Rutas compartidas
import EnviarComunicado from "./pages/EnviarComunicado";
import EnviarComunicadoAdmin from "./pages/EnviarComunicadoAdmin";
import ManualConvivencia from "./pages/ManualConvivencia";

// Rutas para Estudiante
import NotasEstudiante from "./pages/estudiante/NotasEstudiante";
import CalendarioEstudiante from "./pages/estudiante/CalendarioEstudiante";
import EstadisticasEstudiante from "./pages/estudiante/EstadisticasEstudiante";
import ComunicadosEstudiante from "./pages/estudiante/ComunicadosEstudiante";
import DocumentosEstudiante from "./pages/estudiante/DocumentosEstudiante";

// Rutas para Padre
import NotasPadre from "./pages/padre/NotasPadre";
import CalendarioPadre from "./pages/padre/CalendarioPadre";
import EstadisticasPadre from "./pages/padre/EstadisticasPadre";
import ComunicadosPadre from "./pages/padre/ComunicadosPadre";
import DocumentosPadre from "./pages/padre/DocumentosPadre";

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard-rector" element={<DashboardRector />} />
          <Route path="/dashboard-estudiante" element={<DashboardEstudiante />} />
          <Route path="/dashboard-padre" element={<DashboardPadre />} />
          <Route path="/dashboard-admin" element={<DashboardAdmin />} />
          <Route path="/seleccionar-grado" element={<SeleccionarGrado />} />
          <Route path="/seleccionar-salon" element={<SeleccionarSalon />} />
          <Route path="/tabla-notas" element={<TablaNotas />} />
          <Route path="/actividades-calendario" element={<ActividadesCalendario />} />
          <Route path="/normy-examinadora" element={<NormyExaminadora />} />

          {/* Rutas para Rector/Coordinador */}
          <Route path="/rector/seleccionar-grado" element={<SeleccionarGradoRector />} />
          <Route path="/rector/seleccionar-salon" element={<SeleccionarSalonRector />} />
          <Route path="/rector/modo-visualizacion" element={<ModoVisualizacion />} />
          <Route path="/rector/lista-asignaturas" element={<ListaAsignaturas />} />
          <Route path="/rector/lista-estudiantes" element={<ListaEstudiantes />} />
          <Route path="/rector/tabla-notas" element={<TablaNotasReadOnly />} />
          <Route path="/rector/estudiante-consolidado" element={<EstudianteConsolidado />} />
          <Route path="/rector/estadisticas" element={<EstadisticasDashboard />} />
          <Route path="/rector/estudiantes-riesgo" element={<EstudiantesEnRiesgo />} />
          <Route path="/rector/panel-control" element={<PanelControl />} />
          <Route path="/rector/uso-normy" element={<UsoNormy />} />

          {/* Rutas para Admin */}
          <Route path="/admin/sugerencias" element={<Sugerencias />} />
          <Route path="/admin/todas-actividades" element={<TodasActividades />} />

          {/* Rutas para Profesor */}
          <Route path="/profesor/estadisticas" element={<EstadisticasProfesor />} />
          <Route path="/profesor/programar-actividad" element={<ProgramarActividad />} />
          <Route path="/profesor/comunicados" element={<ComunicadosProfesor />} />
          <Route path="/rector/comunicados-recibidos" element={<ComunicadosRecibidos />} />
          <Route path="/rector/documentos-recibidos" element={<DocumentosRecibidos />} />
          <Route path="/profesor/documentos" element={<DocumentosProfesor />} />
          <Route path="/registro-normy" element={<RegistroNormy />} />

          {/* Rutas compartidas */}
          <Route path="/enviar-comunicado" element={<EnviarComunicado />} />
          <Route path="/enviar-comunicado-admin" element={<EnviarComunicadoAdmin />} />
<Route path="/manual-convivencia" element={<ManualConvivencia />} />

          {/* Rutas para Estudiante */}
          <Route path="/estudiante/notas" element={<NotasEstudiante />} />
          <Route path="/estudiante/actividades" element={<CalendarioEstudiante />} />
          <Route path="/estudiante/estadisticas" element={<EstadisticasEstudiante />} />
          <Route path="/estudiante/comunicados" element={<ComunicadosEstudiante />} />
          <Route path="/estudiante/documentos" element={<DocumentosEstudiante />} />

          {/* Rutas para Padre */}
          <Route path="/padre/notas" element={<NotasPadre />} />
          <Route path="/padre/actividades" element={<CalendarioPadre />} />
          <Route path="/padre/estadisticas" element={<EstadisticasPadre />} />
          <Route path="/padre/comunicados" element={<ComunicadosPadre />} />
          <Route path="/padre/documentos" element={<DocumentosPadre />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
