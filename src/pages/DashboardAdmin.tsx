import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBienvenida, getSession, isAdmin } from "@/hooks/useSession";
import { usePendientesFirma } from "@/hooks/usePendientesFirma";
import { ClipboardList, MessageCircleQuestion } from "lucide-react";
import iconNotas from "@/assets/icons/notas.webp";
import iconPerfil from "@/assets/icons/perfil.png";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconEnviarComunicado from "@/assets/icons/enviar-comunicado.webp";
import iconPanelControl from "@/assets/icons/panel-de-control.webp";
import iconRegistroAgente from "@/assets/icons/registro-agente.webp";
import iconUsoAgente from "@/assets/icons/uso-agente.webp";
import iconSugerencias from "@/assets/icons/sugerencias.webp";
import iconConversaciones from "@/assets/icons/conversaciones.webp";
import iconActividades from "@/assets/icons/actividades.webp";
import iconPermisos from "@/assets/icons/permisos-y-excusas.webp";
import iconEntrevista from "@/assets/icons/entrevista.webp";
import iconConsultas from "@/assets/icons/consultas.png";
import iconRegistros from "@/assets/icons/registros-comportamiento.png";
import iconAsistencia from "@/assets/icons/asistencia.webp";
import iconConfigurarInstitucion from "@/assets/icons/configurar-institucion.webp";
import iconBoletines from "@/assets/icons/boletines.webp";
import iconFormatos from "@/assets/icons/formatos.webp";
import iconObservador from "@/assets/icons/observador.webp";
import iconPorteria from "@/assets/icons/porteria.png";
import HeaderNormi from "@/components/HeaderNormi";
import EncabezadoColegio from "@/components/EncabezadoColegio";
import AvatarUploader from "@/components/AvatarUploader";
import ReordenableDashboard, { type ReordItem } from "@/components/ReordenableDashboard";
import { getAllLastSeen } from "@/utils/notificaciones";

const Badge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm z-10 animate-badge-pop">
      {count > 99 ? '99+' : count}
    </span>
  );
};

/** Una tarjeta del dashboard del admin. */
const Card = ({ bg, badge, icon, label, onClick }: { bg: string; badge?: number; icon: ReactNode; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`relative w-full h-full flex flex-col items-center justify-center gap-4 p-8 rounded-lg ${bg} transition-all duration-200 hover:shadow-md`}
  >
    {badge ? <Badge count={badge} /> : null}
    {icon}
    <span className="font-semibold text-foreground text-center">{label}</span>
  </button>
);

const DashboardAdmin = () => {
  const navigate = useNavigate();
  const saludo = useBienvenida();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [badges, setBadges] = useState({ retiro: 0, inasistencia: 0, uniforme: 0, entrevista: 0 });
  const pendFirma = usePendientesFirma();

  useEffect(() => {
    const session = getSession();

    if (!session.id) {
      navigate("/");
      return;
    }

    if (!isAdmin()) {
      navigate("/dashboard");
      return;
    }

    setNombres(session.nombres || "");
    setApellidos(session.apellidos || "");

    const fetchBadges = async () => {
      try {
        const lastSeen = await getAllLastSeen(session.id!);
        const [retiroRes, inasistenciaRes, uniformeRes, entrevistaRes] = await Promise.all([
          supabase.from('Autorizaciones_Retiro').select('*', { count: 'exact', head: true }).gt('id', lastSeen['retiro'] ?? 0),
          supabase.from('Justificaciones_Inasistencia').select('*', { count: 'exact', head: true }).gt('id', lastSeen['inasistencia'] ?? 0),
          supabase.from('Justificaciones_Uniforme').select('*', { count: 'exact', head: true }).gt('id', lastSeen['uniforme'] ?? 0),
          supabase.from('Solicitudes_Entrevista').select('*', { count: 'exact', head: true }).eq('creado_por', parseInt(session.id!)).eq('respuesta_vista', false),
        ]);
        setBadges({
          retiro: retiroRes.count ?? 0,
          inasistencia: inasistenciaRes.count ?? 0,
          uniforme: uniformeRes.count ?? 0,
          entrevista: entrevistaRes.count ?? 0,
        });
      } catch (err) {
        console.error('Error fetching badges:', err);
      }
    };
    fetchBadges();
  }, [navigate]);

  const permisosTotal = badges.retiro + badges.inasistencia + badges.uniforme;

  const items: ReordItem[] = [
    { id: 'notas', render: <Card bg="bg-emerald-100 hover:bg-emerald-200" icon={<img src={iconNotas} alt="" className="w-16 h-16 object-contain" />} label="Notas" onClick={() => navigate("/seleccionar-grado")} /> },
    { id: 'estadisticas', render: <Card bg="bg-green-100 hover:bg-green-200" icon={<img src={iconEstadisticas} alt="" className="w-16 h-16 object-contain" />} label="Estadísticas" onClick={() => navigate("/estadisticas")} /> },
    { id: 'boletines', render: <Card bg="bg-emerald-100 hover:bg-emerald-200" icon={<img src={iconBoletines} alt="" className="w-16 h-16 object-contain" />} label="Boletines" onClick={() => navigate("/boletines")} /> },
    { id: 'formatos', render: <Card bg="bg-orange-100 hover:bg-orange-200" icon={<img src={iconFormatos} alt="" className="w-16 h-16 object-contain" />} label="Formatos" onClick={() => navigate("/formatos")} /> },
    { id: 'enviar-comunicado', render: <Card bg="bg-teal-100 hover:bg-teal-200" icon={<img src={iconEnviarComunicado} alt="" className="w-16 h-16 object-contain" />} label="Enviar Comunicado" onClick={() => navigate("/enviar-comunicado-admin")} /> },
    { id: 'comunicados-firma', render: <Card bg="bg-violet-100 hover:bg-violet-200" badge={pendFirma} icon={<img src={iconEnviarComunicado} alt="" className="w-16 h-16 object-contain" />} label="Comunicados con firma" onClick={() => navigate("/comunicados-firma")} /> },
    { id: 'todas-actividades', render: <Card bg="bg-emerald-100 hover:bg-emerald-200" icon={<img src={iconActividades} alt="" className="w-16 h-16 object-contain" />} label="Todas las Actividades" onClick={() => navigate("/admin/todas-actividades")} /> },
    { id: 'panel-control', render: <Card bg="bg-purple-100 hover:bg-purple-200" icon={<img src={iconPanelControl} alt="" className="w-16 h-16 object-contain" />} label="Panel de Control" onClick={() => navigate("/panel-control")} /> },
    { id: 'construye-institucion', render: <Card bg="bg-teal-100 hover:bg-teal-200" icon={<img src={iconConfigurarInstitucion} alt="" className="w-16 h-16 object-contain" />} label="Configurar Institución" onClick={() => navigate("/construye-institucion")} /> },
    { id: 'sugerencias', render: <Card bg="bg-amber-100 hover:bg-amber-200" icon={<img src={iconSugerencias} alt="" className="w-16 h-16 object-contain" />} label="Sugerencias" onClick={() => navigate("/admin/sugerencias")} /> },
    { id: 'uso-normi', render: <Card bg="bg-orange-100 hover:bg-orange-200" icon={<img src={iconUsoAgente} alt="" className="w-16 h-16 object-contain" />} label="Uso de Normi" onClick={() => navigate("/uso-normi")} /> },
    { id: 'registro-normi', render: <Card bg="bg-cyan-100 hover:bg-cyan-200" icon={<img src={iconRegistroAgente} alt="" className="w-16 h-16 object-contain" />} label="Registro en Normi" onClick={() => navigate("/registro-normi")} /> },
    { id: 'conversaciones', render: <Card bg="bg-blue-100 hover:bg-blue-200" icon={<img src={iconConversaciones} alt="" className="w-16 h-16 object-contain" />} label="Conversaciones" onClick={() => window.open("https://chat.notasnormi.com", "_blank")} /> },
    { id: 'permisos-excusas', render: <Card bg="bg-rose-100 hover:bg-rose-200" badge={permisosTotal} icon={<img src={iconPermisos} alt="" className="w-16 h-16 object-contain" />} label="Permisos y Excusas" onClick={() => navigate("/permisos-excusas")} /> },
    { id: 'solicitud-entrevista', render: <Card bg="bg-indigo-100 hover:bg-indigo-200" badge={badges.entrevista} icon={<img src={iconEntrevista} alt="" className="w-16 h-16 object-contain" />} label="Solicitud de Entrevista" onClick={() => navigate("/solicitud-entrevista-staff")} /> },
    { id: 'consultas', render: <Card bg="bg-pink-100 hover:bg-pink-200" icon={<img src={iconConsultas} alt="" className="w-16 h-16 object-contain" />} label="Consultas" onClick={() => navigate("/consultas")} /> },
    { id: 'registros-comportamiento', render: <Card bg="bg-amber-100 hover:bg-amber-200" icon={<img src={iconRegistros} alt="" className="w-16 h-16 object-contain" />} label="Registros de Comportamiento" onClick={() => navigate("/registros-comportamiento")} /> },
    { id: 'observador', render: <Card bg="bg-sky-100 hover:bg-sky-200" icon={<img src={iconObservador} alt="" className="w-16 h-16 object-contain" />} label="Observador Estudiantil" onClick={() => navigate("/observador-estudiantil")} /> },
    { id: 'porteria', render: <Card bg="bg-orange-100 hover:bg-orange-200" icon={<img src={iconPorteria} alt="" className="w-16 h-16 object-contain" />} label="Portería" onClick={() => navigate("/porteria")} /> },
    { id: 'solicitudes-registro', render: <Card bg="bg-sky-100 hover:bg-sky-200" icon={<ClipboardList className="w-16 h-16 text-sky-700" strokeWidth={1.5} />} label="Solicitudes de Registro" onClick={() => navigate("/admin/correcciones-registro")} /> },
    { id: 'dudas-personal', render: <Card bg="bg-violet-100 hover:bg-violet-200" icon={<MessageCircleQuestion className="w-16 h-16 text-violet-700" strokeWidth={1.5} />} label="Dudas del Personal" onClick={() => navigate("/admin/dudas")} /> },
    { id: 'asistencia', render: <Card bg="bg-blue-100 hover:bg-blue-200" icon={<img src={iconAsistencia} alt="" className="w-16 h-16 object-contain" />} label="Asistencia" onClick={() => navigate("/asistencia")} /> },
    { id: 'perfil', render: <Card bg="bg-sky-100 hover:bg-sky-200" icon={<img src={iconPerfil} alt="" className="w-16 h-16 object-contain" />} label="Perfil" onClick={() => navigate("/perfil")} /> },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-8">
        <EncabezadoColegio />
        <div className="relative max-w-2xl mx-auto">
          <div className="bg-card rounded-lg shadow-soft p-8 text-center">
            <h2 className="text-xl font-bold text-foreground mb-4">
              {saludo}
            </h2>
            <p className="text-2xl text-primary font-semibold">
              {nombres} {apellidos}
            </p>
            <p className="text-muted-foreground mt-2">
              Administrador
            </p>
          </div>
          <div className="hidden xl:block absolute inset-y-0 left-full ml-10">
            <AvatarUploader fill />
          </div>
          <div className="xl:hidden flex justify-center mt-4">
            <AvatarUploader />
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-8 max-w-7xl mx-auto mt-8">
          <h3 className="text-xl font-bold text-foreground mb-1 text-center">
            ¿Qué deseas consultar?
          </h3>

          <ReordenableDashboard
            dashboardKey="admin"
            gridClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6"
            items={items}
          />
        </div>

        <div className="flex items-start justify-center gap-8 mt-8">
          <button
            onClick={() => navigate("/manual-convivencia")}
            className="flex flex-col items-center gap-2 transition-all duration-200 hover:scale-105"
          >
            <img
              src="/manual-de-convivencia.webp"
              alt="Manual de Convivencia"
              className="w-20 h-20 object-contain"
            />
            <span className="font-semibold text-foreground text-sm">
              Manual de Convivencia
            </span>
          </button>
        </div>
      </main>
    </div>
  );
};

export default DashboardAdmin;
