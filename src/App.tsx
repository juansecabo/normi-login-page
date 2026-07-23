import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Index from "./pages/Index";
import DashboardHome from "./pages/DashboardHome";
import SeleccionarGrado from "./pages/SeleccionarGrado";
import SeleccionarSalon from "./pages/SeleccionarSalon";
import ActividadesCalendario from "./pages/ActividadesCalendario";
import NormiExaminadora from "./pages/NormiExaminadora";
import NotFound from "./pages/NotFound";
import NormiRecordatorioRecuperacion from "./components/NormiRecordatorioRecuperacion";
import RegistroAcudiente from "./pages/RegistroAcudiente";

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
import ConstruyeInstitucion from "./pages/rector/ConstruyeInstitucion";
import CrearInstitucion from "./pages/CrearInstitucion";
import UsoNormi from "./pages/rector/UsoNormi";
import AprendeNormi from "./pages/AprendeNormi";
import LogrosProfesor from "./pages/profesor/LogrosProfesor";
import Boletines from "./pages/rector/Boletines";
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
import ComunicadosFirma from "./pages/ComunicadosFirma";
import RegistrosComportamiento from "./pages/RegistrosComportamiento";
import MiGrupo from "./pages/MiGrupo";
import ConsolidadoGrupo from "./pages/ConsolidadoGrupo";
import DireccionGrupo from "./pages/DireccionGrupo";
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
        <NormiRecordatorioRecuperacion />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/registro-acudiente" element={<RegistroAcudiente />} />
          {/* Home ÚNICO: /dashboard despacha al dashboard segun el rol (DashboardHome). */}
          <Route path="/dashboard" element={<DashboardHome />} />
          {/* Rutas viejas → redirigen al home unico (compat con links/bookmarks). */}
          <Route path="/dashboard-plataforma" element={<Navigate to="/dashboard" replace />} />
          <Route path="/panel" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard-estudiante" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard-acudiente" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard-padre" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard-admin" element={<Navigate to="/dashboard" replace />} />
          <Route path="/seleccionar-grado" element={<SeleccionarGrado />} />
          <Route path="/seleccionar-salon" element={<SeleccionarSalon />} />
          <Route path="/tabla-notas" element={<TablaNotasRouter />} />
          <Route path="/actividades-calendario" element={<ActividadesCalendario />} />
          <Route path="/normi-examinadora" element={<NormiExaminadora />} />

          {/* Subpáginas de gestión (directivos): cuelgan del home /dashboard/*.
              Las viejas /rector/* se conservan como redirect (bookmarks/links). */}
          <Route path="/dashboard/seleccionar-grado" element={<SeleccionarGradoRector />} />
          <Route path="/dashboard/seleccionar-salon" element={<SeleccionarSalonRector />} />
          <Route path="/dashboard/modo-visualizacion" element={<ModoVisualizacion />} />
          <Route path="/dashboard/lista-asignaturas" element={<ListaAsignaturas />} />
          <Route path="/dashboard/lista-estudiantes" element={<ListaEstudiantes />} />
          <Route path="/dashboard/tabla-notas" element={<TablaNotasReadOnlyRouter />} />
          <Route path="/dashboard/estudiante-consolidado" element={<EstudianteConsolidado />} />
          <Route path="/dashboard/estadisticas" element={<EstadisticasDashboard />} />
          <Route path="/dashboard/boletines" element={<Boletines />} />
          <Route path="/dashboard/estudiantes-riesgo" element={<EstudiantesEnRiesgo />} />
          <Route path="/dashboard/panel-control" element={<PanelControl />} />
          <Route path="/dashboard/horarios-avisos" element={<HorariosAvisos />} />
          <Route path="/dashboard/uso-normi" element={<UsoNormi />} />
          <Route path="/dashboard/comunicados-recibidos" element={<ComunicadosRecibidos />} />
          <Route path="/dashboard/documentos-recibidos" element={<DocumentosRecibidos />} />
          {/* Redirects compat de las rutas viejas /rector/* → /dashboard/* */}
          <Route path="/rector/seleccionar-grado" element={<Navigate to="/dashboard/seleccionar-grado" replace />} />
          <Route path="/rector/seleccionar-salon" element={<Navigate to="/dashboard/seleccionar-salon" replace />} />
          <Route path="/rector/modo-visualizacion" element={<Navigate to="/dashboard/modo-visualizacion" replace />} />
          <Route path="/rector/lista-asignaturas" element={<Navigate to="/dashboard/lista-asignaturas" replace />} />
          <Route path="/rector/lista-estudiantes" element={<Navigate to="/dashboard/lista-estudiantes" replace />} />
          <Route path="/rector/tabla-notas" element={<Navigate to="/dashboard/tabla-notas" replace />} />
          <Route path="/rector/estudiante-consolidado" element={<Navigate to="/dashboard/estudiante-consolidado" replace />} />
          <Route path="/rector/estadisticas" element={<Navigate to="/dashboard/estadisticas" replace />} />
          <Route path="/rector/boletines" element={<Navigate to="/dashboard/boletines" replace />} />
          <Route path="/rector/estudiantes-riesgo" element={<Navigate to="/dashboard/estudiantes-riesgo" replace />} />
          <Route path="/rector/panel-control" element={<Navigate to="/dashboard/panel-control" replace />} />
          <Route path="/rector/horarios-avisos" element={<Navigate to="/dashboard/horarios-avisos" replace />} />
          <Route path="/rector/uso-normi" element={<Navigate to="/dashboard/uso-normi" replace />} />
          <Route path="/rector/comunicados-recibidos" element={<Navigate to="/dashboard/comunicados-recibidos" replace />} />
          <Route path="/rector/documentos-recibidos" element={<Navigate to="/dashboard/documentos-recibidos" replace />} />
          <Route path="/construye-institucion" element={<ConstruyeInstitucion />} />
          <Route path="/crear-institucion/:id" element={<CrearInstitucion />} />
          <Route path="/aprende-normi" element={<AprendeNormi />} />
          <Route path="/profesor/logros" element={<LogrosProfesor />} />

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

          {/* Comunicados con firma (envío staff + firma de cualquier rol) */}
          <Route path="/comunicados-firma" element={<ComunicadosFirma />} />

          {/* Registros de Comportamiento */}
          <Route path="/registros-comportamiento" element={<RegistrosComportamiento />} />
          <Route path="/direccion-grupo" element={<DireccionGrupo />} />
          <Route path="/mi-grupo" element={<MiGrupo />} />
          <Route path="/consolidado-grupo" element={<ConsolidadoGrupo />} />
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
