import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Index from "./pages/Index";
import EntrarDemo from "./pages/EntrarDemo";
import DashboardHome from "./pages/DashboardHome";
import SeleccionarGradoPorRol from "./pages/SeleccionarGradoPorRol";
import SeleccionarSalonPorRol from "./pages/SeleccionarSalonPorRol";
import ActividadesCalendario from "./pages/ActividadesCalendario";
import NormiExaminadora from "./pages/NormiExaminadora";
import NotFound from "./pages/NotFound";
import NormiRecordatorioRecuperacion from "./components/NormiRecordatorioRecuperacion";
import { GuiaProvider } from "@/guia/runtime/GuiaProvider";
import RegistroAcudiente from "./pages/RegistroAcudiente";

// Rutas para Rector/Coordinador
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
import CalendarioEscolar from "./pages/CalendarioEscolar";
import LogrosProfesor from "./pages/profesor/LogrosProfesor";
import Boletines from "./pages/rector/Boletines";
import Formatos from "./pages/rector/Formatos";
import PermisoDocente from "./pages/formatos/PermisoDocente";
import PermisosDocentesConsulta from "./pages/permisos/PermisosDocentesConsulta";
import NivelacionPlanilla from "./pages/formatos/NivelacionPlanilla";
import ApoyoPlanilla from "./pages/formatos/ApoyoPlanilla";
import PlanillasConsulta from "./pages/formatos/PlanillasConsulta";
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
import ObservadorEstudiantil from "./pages/ObservadorEstudiantil";
import PorteriaLlegadaTarde, { PorteriaHub, PorteriaRegistro } from "./pages/PorteriaLlegadaTarde";
import MiGrupo from "./pages/MiGrupo";
import ConsolidadoGrupo from "./pages/ConsolidadoGrupo";
import DireccionGrupo from "./pages/DireccionGrupo";
import Perfil from "./pages/Perfil";
import TablaNotasPorRol from "./pages/TablaNotasPorRol";

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
        <GuiaProvider>
        <ScrollToTop />
        <NormiRecordatorioRecuperacion />
        <Routes>
          <Route path="/" element={<Index />} />
          {/* /demo lo sirve nginx como HTML estático (deck de Claude Design en
              public/demo/). Aquí solo vive el aterrizaje de login de sus botones. */}
          <Route path="/entrar-demo" element={<EntrarDemo />} />
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
          {/* Notas: ruta ÚNICA por rol. El despachador monta el flujo del profesor
              (editable) o el de directivos (solo lectura) según el cargo. */}
          <Route path="/seleccionar-grado" element={<SeleccionarGradoPorRol />} />
          <Route path="/seleccionar-salon" element={<SeleccionarSalonPorRol />} />
          <Route path="/tabla-notas" element={<TablaNotasPorRol />} />
          <Route path="/actividades-calendario" element={<ActividadesCalendario />} />
          <Route path="/normi-examinadora" element={<NormiExaminadora />} />

          {/* Subpáginas de gestión (directivos) en la raíz — ya no cuelgan de /dashboard/. */}
          <Route path="/modo-visualizacion" element={<ModoVisualizacion />} />
          <Route path="/lista-asignaturas" element={<ListaAsignaturas />} />
          <Route path="/lista-estudiantes" element={<ListaEstudiantes />} />
          <Route path="/estudiante-consolidado" element={<EstudianteConsolidado />} />
          <Route path="/estadisticas" element={<EstadisticasDashboard />} />
          <Route path="/boletines" element={<Boletines />} />
          <Route path="/formatos" element={<Formatos />} />
          <Route path="/formatos/permiso-docente" element={<PermisoDocente />} />
          <Route path="/formatos/permisos-docentes" element={<PermisosDocentesConsulta />} />
          <Route path="/formatos/nivelacion" element={<NivelacionPlanilla />} />
          <Route path="/formatos/apoyo" element={<ApoyoPlanilla />} />
          <Route path="/formatos/planillas" element={<PlanillasConsulta />} />
          <Route path="/estudiantes-riesgo" element={<EstudiantesEnRiesgo />} />
          <Route path="/panel-control" element={<PanelControl />} />
          <Route path="/horarios-avisos" element={<HorariosAvisos />} />
          <Route path="/uso-normi" element={<UsoNormi />} />
          <Route path="/comunicados-recibidos" element={<ComunicadosRecibidos />} />
          <Route path="/documentos-recibidos" element={<DocumentosRecibidos />} />

          {/* Redirects compat: rutas viejas (/dashboard/* de la fase anterior y /rector/* histórica) → raíz. */}
          <Route path="/dashboard/seleccionar-grado" element={<Navigate to="/seleccionar-grado" replace />} />
          <Route path="/dashboard/seleccionar-salon" element={<Navigate to="/seleccionar-salon" replace />} />
          <Route path="/dashboard/modo-visualizacion" element={<Navigate to="/modo-visualizacion" replace />} />
          <Route path="/dashboard/lista-asignaturas" element={<Navigate to="/lista-asignaturas" replace />} />
          <Route path="/dashboard/lista-estudiantes" element={<Navigate to="/lista-estudiantes" replace />} />
          <Route path="/dashboard/tabla-notas" element={<Navigate to="/tabla-notas" replace />} />
          <Route path="/dashboard/estudiante-consolidado" element={<Navigate to="/estudiante-consolidado" replace />} />
          <Route path="/dashboard/estadisticas" element={<Navigate to="/estadisticas" replace />} />
          <Route path="/dashboard/boletines" element={<Navigate to="/boletines" replace />} />
          <Route path="/dashboard/estudiantes-riesgo" element={<Navigate to="/estudiantes-riesgo" replace />} />
          <Route path="/dashboard/panel-control" element={<Navigate to="/panel-control" replace />} />
          <Route path="/dashboard/horarios-avisos" element={<Navigate to="/horarios-avisos" replace />} />
          <Route path="/dashboard/uso-normi" element={<Navigate to="/uso-normi" replace />} />
          <Route path="/dashboard/comunicados-recibidos" element={<Navigate to="/comunicados-recibidos" replace />} />
          <Route path="/dashboard/documentos-recibidos" element={<Navigate to="/documentos-recibidos" replace />} />
          <Route path="/rector/seleccionar-grado" element={<Navigate to="/seleccionar-grado" replace />} />
          <Route path="/rector/seleccionar-salon" element={<Navigate to="/seleccionar-salon" replace />} />
          <Route path="/rector/modo-visualizacion" element={<Navigate to="/modo-visualizacion" replace />} />
          <Route path="/rector/lista-asignaturas" element={<Navigate to="/lista-asignaturas" replace />} />
          <Route path="/rector/lista-estudiantes" element={<Navigate to="/lista-estudiantes" replace />} />
          <Route path="/rector/tabla-notas" element={<Navigate to="/tabla-notas" replace />} />
          <Route path="/rector/estudiante-consolidado" element={<Navigate to="/estudiante-consolidado" replace />} />
          <Route path="/rector/estadisticas" element={<Navigate to="/estadisticas" replace />} />
          <Route path="/rector/boletines" element={<Navigate to="/boletines" replace />} />
          <Route path="/rector/estudiantes-riesgo" element={<Navigate to="/estudiantes-riesgo" replace />} />
          <Route path="/rector/panel-control" element={<Navigate to="/panel-control" replace />} />
          <Route path="/rector/horarios-avisos" element={<Navigate to="/horarios-avisos" replace />} />
          <Route path="/rector/uso-normi" element={<Navigate to="/uso-normi" replace />} />
          <Route path="/rector/comunicados-recibidos" element={<Navigate to="/comunicados-recibidos" replace />} />
          <Route path="/rector/documentos-recibidos" element={<Navigate to="/documentos-recibidos" replace />} />
          <Route path="/construye-institucion" element={<ConstruyeInstitucion />} />
          <Route path="/crear-institucion/:id" element={<CrearInstitucion />} />
          <Route path="/aprende-normi" element={<AprendeNormi />} />
          <Route path="/calendario-escolar" element={<CalendarioEscolar />} />
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
          <Route path="/observador-estudiantil" element={<ObservadorEstudiantil />} />
          {/* Portería: hub + reporte de llegada tarde (admin/rector/coordinador) */}
          <Route path="/porteria" element={<PorteriaHub />} />
          <Route path="/porteria/llegada-tarde" element={<PorteriaLlegadaTarde />} />
          <Route path="/porteria/registro" element={<PorteriaRegistro />} />
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
        </GuiaProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
