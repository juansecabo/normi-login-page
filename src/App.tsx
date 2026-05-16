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
import ActividadesCalendario from "./pages/ActividadesCalendario";
import NormiExaminadora from "./pages/NormiExaminadora";
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
import UsoNormi from "./pages/rector/UsoNormi";
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
import RegistroNormi from "./pages/RegistroNormi";

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

// Rutas para Orientador(a) Escolar
import Casos from "./pages/orientador/Casos";
import CasoDetalle from "./pages/orientador/CasoDetalle";
import Citas from "./pages/orientador/Citas";
import RemitirOrientacion from "./pages/orientador/RemitirOrientacion";
import RemisionesOrientacion from "./pages/orientador/RemisionesOrientacion";

// Permisos y Excusas + Consultas + Registros
import PermisosExcusas from "./pages/PermisosExcusas";
import RetiroEstudiantes from "./pages/permisos/RetiroEstudiantes";
import RetiroEstudiantesStaff from "./pages/permisos/RetiroEstudiantesStaff";
import JustificacionInasistencia from "./pages/permisos/JustificacionInasistencia";
import JustificacionInasistenciaStaff from "./pages/permisos/JustificacionInasistenciaStaff";
import JustificacionUniforme from "./pages/permisos/JustificacionUniforme";
import JustificacionUniformeStaff from "./pages/permisos/JustificacionUniformeStaff";
import SolicitudEntrevistaStaff from "./pages/permisos/SolicitudEntrevistaStaff";
import SolicitudEntrevistaPadre from "./pages/permisos/SolicitudEntrevistaPadre";
import Consultas from "./pages/Consultas";
import ConsultaDetalle from "./pages/ConsultaDetalle";
import ConsultaPublica from "./pages/ConsultaPublica";
import MisConsultas from "./pages/padre/MisConsultas";
import MisConsultasEstudiante from "./pages/estudiante/MisConsultasEstudiante";
import RegistrosComportamiento from "./pages/RegistrosComportamiento";
import TablaNotasRouter from "./pages/TablaNotasRouter";

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
          <Route path="/tabla-notas" element={<TablaNotasRouter />} />
          <Route path="/actividades-calendario" element={<ActividadesCalendario />} />
          <Route path="/normi-examinadora" element={<NormiExaminadora />} />

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
          <Route path="/rector/uso-normi" element={<UsoNormi />} />

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
          <Route path="/registro-normi" element={<RegistroNormi />} />

          {/* Rutas compartidas */}
          <Route path="/enviar-comunicado" element={<EnviarComunicado />} />
          <Route path="/enviar-comunicado-admin" element={<EnviarComunicadoAdmin />} />
<Route path="/manual-convivencia" element={<ManualConvivencia />} />

          {/* Rutas para Orientador(a) Escolar */}
          <Route path="/orientador/casos" element={<Casos />} />
          <Route path="/orientador/casos/:id" element={<CasoDetalle />} />
          <Route path="/orientador/citas" element={<Citas />} />
          <Route path="/remitir-orientacion" element={<RemitirOrientacion />} />
          <Route path="/orientador/remisiones" element={<RemisionesOrientacion />} />

          {/* Permisos y Excusas */}
          <Route path="/permisos-excusas" element={<PermisosExcusas />} />
          <Route path="/permisos-excusas/retiro" element={<RetiroEstudiantes />} />
          <Route path="/permisos-excusas/retiro-staff" element={<RetiroEstudiantesStaff />} />
          <Route path="/permisos-excusas/inasistencia" element={<JustificacionInasistencia />} />
          <Route path="/permisos-excusas/inasistencia-staff" element={<JustificacionInasistenciaStaff />} />
          <Route path="/permisos-excusas/uniforme" element={<JustificacionUniforme />} />
          <Route path="/permisos-excusas/uniforme-staff" element={<JustificacionUniformeStaff />} />
          <Route path="/permisos-excusas/entrevista" element={<SolicitudEntrevistaPadre />} />
          <Route path="/permisos-excusas/entrevista-staff" element={<SolicitudEntrevistaStaff />} />

          {/* Consultas */}
          <Route path="/consultas" element={<Consultas />} />
          <Route path="/consultas/:id" element={<ConsultaDetalle />} />
          <Route path="/consulta/:id" element={<ConsultaPublica />} />
          <Route path="/padre/consultas" element={<MisConsultas />} />
          <Route path="/estudiante/consultas" element={<MisConsultasEstudiante />} />

          {/* Registros de Comportamiento */}
          <Route path="/registros-comportamiento" element={<RegistrosComportamiento />} />


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
