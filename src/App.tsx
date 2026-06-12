import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import DashboardRector from "./pages/DashboardRector";
import DashboardEstudiante from "./pages/DashboardEstudiante";
import DashboardAcudiente from "./pages/DashboardAcudiente";
import DashboardAdmin from "./pages/DashboardAdmin";
import DashboardPlataforma from "./pages/DashboardPlataforma";
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
import EstudianteConsolidado from "./pages/rector/EstudianteConsolidado";
import EstadisticasDashboard from "./pages/rector/EstadisticasDashboard";
import EstudiantesEnRiesgo from "./pages/rector/EstudiantesEnRiesgo";
import PanelControl from "./pages/rector/PanelControl";
import HorariosAvisos from "./pages/rector/HorariosAvisos";
import UsoNormi from "./pages/rector/UsoNormi";
import ComunicadosRecibidos from "./pages/rector/ComunicadosRecibidos";
import DocumentosRecibidos from "./pages/rector/DocumentosRecibidos";

// Rutas para Admin
import Sugerencias from "./pages/admin/Sugerencias";
import TodasActividades from "./pages/admin/TodasActividades";
import RegistroCorrecciones from "./pages/RegistroCorrecciones";
import Dudas from "./pages/Dudas";
import CorreccionesRegistroAdmin from "./pages/admin/CorreccionesRegistroAdmin";
import DudasAdmin from "./pages/admin/DudasAdmin";

// Rutas para Profesor
import EstadisticasProfesor from "./pages/profesor/EstadisticasProfesor";
import ProgramarActividad from "./pages/profesor/ProgramarActividad";
import Asistencia from "./pages/profesor/Asistencia";
import AsistenciaMenu from "./pages/profesor/AsistenciaMenu";
import ConsultaAsistencia from "./pages/ConsultaAsistencia";
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
import SolicitudEntrevistaAcudiente from "./pages/permisos/SolicitudEntrevistaAcudiente";
import Consultas from "./pages/Consultas";
import ConsultaDetalle from "./pages/ConsultaDetalle";
import ConsultaPublica from "./pages/ConsultaPublica";
import MisConsultas from "./pages/acudiente/MisConsultas";
import MisConsultasEstudiante from "./pages/estudiante/MisConsultasEstudiante";
import RegistrosComportamiento from "./pages/RegistrosComportamiento";
import Perfil from "./pages/Perfil";
import TablaNotasRouter from "./pages/TablaNotasRouter";
import TablaNotasReadOnlyRouter from "./pages/TablaNotasReadOnlyRouter";

// Rutas para Padre
import NotasAcudiente from "./pages/acudiente/NotasAcudiente";
import CalendarioAcudiente from "./pages/acudiente/CalendarioAcudiente";
import EstadisticasAcudiente from "./pages/acudiente/EstadisticasAcudiente";
import ComunicadosAcudiente from "./pages/acudiente/ComunicadosAcudiente";
import DocumentosAcudiente from "./pages/acudiente/DocumentosAcudiente";

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
          <Route path="/dashboard-plataforma" element={<DashboardPlataforma />} />
          <Route path="/dashboard-rector" element={<DashboardRector />} />
          <Route path="/dashboard-estudiante" element={<DashboardEstudiante />} />
          <Route path="/dashboard-acudiente" element={<DashboardAcudiente />} />
          {/* Redirect compat para bookmarks/links viejos. */}
          <Route path="/dashboard-padre" element={<Navigate to="/dashboard-acudiente" replace />} />
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
          <Route path="/rector/tabla-notas" element={<TablaNotasReadOnlyRouter />} />
          <Route path="/rector/estudiante-consolidado" element={<EstudianteConsolidado />} />
          <Route path="/rector/estadisticas" element={<EstadisticasDashboard />} />
          <Route path="/rector/estudiantes-riesgo" element={<EstudiantesEnRiesgo />} />
          <Route path="/rector/panel-control" element={<PanelControl />} />
          <Route path="/rector/horarios-avisos" element={<HorariosAvisos />} />
          <Route path="/rector/uso-normi" element={<UsoNormi />} />

          {/* Rutas para Admin */}
          <Route path="/admin/sugerencias" element={<Sugerencias />} />
          <Route path="/admin/todas-actividades" element={<TodasActividades />} />

          {/* Rutas para Profesor */}
          <Route path="/profesor/estadisticas" element={<EstadisticasProfesor />} />
          <Route path="/profesor/programar-actividad" element={<ProgramarActividad />} />
          <Route path="/profesor/asistencia" element={<AsistenciaMenu />} />
          <Route path="/profesor/asistencia/tomar" element={<Asistencia />} />
          <Route path="/asistencia" element={<ConsultaAsistencia />} />
          <Route path="/profesor/comunicados" element={<ComunicadosProfesor />} />
          <Route path="/rector/comunicados-recibidos" element={<ComunicadosRecibidos />} />
          <Route path="/rector/documentos-recibidos" element={<DocumentosRecibidos />} />
          <Route path="/profesor/documentos" element={<DocumentosProfesor />} />
          <Route path="/registro-normi" element={<RegistroNormi />} />
          <Route path="/registro" element={<RegistroCorrecciones />} />
          <Route path="/dudas" element={<Dudas />} />
          <Route path="/admin/correcciones-registro" element={<CorreccionesRegistroAdmin />} />
          <Route path="/admin/dudas" element={<DudasAdmin />} />

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
          {/* Solicitud de Entrevista — ficha propia del dashboard. Las rutas
              /permisos-excusas/entrevista* se conservan como alias (links viejos). */}
          <Route path="/solicitud-entrevista" element={<SolicitudEntrevistaAcudiente />} />
          <Route path="/solicitud-entrevista-staff" element={<SolicitudEntrevistaStaff />} />
          <Route path="/permisos-excusas/entrevista" element={<SolicitudEntrevistaAcudiente />} />
          <Route path="/permisos-excusas/entrevista-staff" element={<SolicitudEntrevistaStaff />} />

          {/* Consultas */}
          <Route path="/consultas" element={<Consultas />} />
          <Route path="/consultas/:id" element={<ConsultaDetalle />} />
          <Route path="/consulta/:id" element={<ConsultaPublica />} />
          <Route path="/acudiente/consultas" element={<MisConsultas />} />
          <Route path="/padre/consultas" element={<Navigate to="/acudiente/consultas" replace />} />
          <Route path="/estudiante/consultas" element={<MisConsultasEstudiante />} />

          {/* Registros de Comportamiento */}
          <Route path="/registros-comportamiento" element={<RegistrosComportamiento />} />
          <Route path="/perfil" element={<Perfil />} />


          {/* Rutas para Estudiante */}
          <Route path="/estudiante/notas" element={<NotasEstudiante />} />
          <Route path="/estudiante/actividades" element={<CalendarioEstudiante />} />
          <Route path="/estudiante/estadisticas" element={<EstadisticasEstudiante />} />
          <Route path="/estudiante/comunicados" element={<ComunicadosEstudiante />} />
          <Route path="/estudiante/documentos" element={<DocumentosEstudiante />} />

          {/* Rutas para Acudiente */}
          <Route path="/acudiente/notas" element={<NotasAcudiente />} />
          <Route path="/acudiente/actividades" element={<CalendarioAcudiente />} />
          <Route path="/acudiente/estadisticas" element={<EstadisticasAcudiente />} />
          <Route path="/acudiente/comunicados" element={<ComunicadosAcudiente />} />
          <Route path="/acudiente/documentos" element={<DocumentosAcudiente />} />
          {/* Redirects compat para bookmarks/links viejos. */}
          <Route path="/padre/notas" element={<Navigate to="/acudiente/notas" replace />} />
          <Route path="/padre/actividades" element={<Navigate to="/acudiente/actividades" replace />} />
          <Route path="/padre/estadisticas" element={<Navigate to="/acudiente/estadisticas" replace />} />
          <Route path="/padre/comunicados" element={<Navigate to="/acudiente/comunicados" replace />} />
          <Route path="/padre/documentos" element={<Navigate to="/acudiente/documentos" replace />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
