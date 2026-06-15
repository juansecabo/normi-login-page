import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isAdmin, puedeAccederDashboard, isAdministrativo } from "@/hooks/useSession";
import iconNotas from "@/assets/icons/notas.webp";
import iconPerfil from "@/assets/icons/perfil.png";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconEnviarComunicado from "@/assets/icons/enviar-comunicado.webp";
import iconComunicadosRecibidos from "@/assets/icons/comunicados-recibidos.webp";
import iconDocumentos from "@/assets/icons/documentos.webp";
import iconPanelControl from "@/assets/icons/panel-de-control.webp";
import iconRegistroAgente from "@/assets/icons/registro-agente.webp";
import iconUsoAgente from "@/assets/icons/uso-agente.webp";
import iconConversaciones from "@/assets/icons/conversaciones.webp";
import iconCasos from "@/assets/icons/casos.png";
import iconCitas from "@/assets/icons/citas.png";
import iconEntrevista from "@/assets/icons/entrevista.webp";
import iconPermisos from "@/assets/icons/permisos-y-excusas.webp";
import iconConsultas from "@/assets/icons/consultas.png";
import iconRegistros from "@/assets/icons/registros-comportamiento.png";
import iconAsistencia from "@/assets/icons/asistencia.webp";
import HeaderNormi from "@/components/HeaderNormi";
import EncabezadoColegio from "@/components/EncabezadoColegio";
import AvatarUploader from "@/components/AvatarUploader";
import ReordenableDashboard, { type ReordItem } from "@/components/ReordenableDashboard";
import { getAllLastSeen } from "@/utils/notificaciones";

const perfilesDelCargo = (cargo: string | undefined): string[] => {
  switch (cargo) {
    case 'Rector': return ['Rector'];
    case 'Coordinador(a)': return ['Coordinadores'];
    case 'Administrativo(a)': return ['Administrativos'];
    case 'Secretaria General': return ['Secretaria General'];
    case 'Orientador(a) Escolar': return ['Orientador(a) Escolar', 'Orientadores'];
    default: return [];
  }
};

const Badge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm z-10 animate-badge-pop">
      {count > 99 ? '99+' : count}
    </span>
  );
};

const DashboardRector = () => {
  const navigate = useNavigate();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [cargo, setCargo] = useState("");
  const [badges, setBadges] = useState({ comunicados: 0, documentos: 0, remisiones: 0, retiro: 0, inasistencia: 0, uniforme: 0, entrevista: 0 });
  const esAdministrativo = isAdministrativo();

  useEffect(() => {
    const session = getSession();

    if (!session.id) {
      navigate("/");
      return;
    }

    // Redirigir admin a su propio dashboard
    if (isAdmin()) {
      navigate("/dashboard-admin", { replace: true });
      return;
    }

    // Verificar que tiene acceso al dashboard (Rector, Coordinador, Administrativo)
    if (!puedeAccederDashboard()) {
      navigate("/dashboard");
      return;
    }

    setNombres(session.nombres || "");
    setApellidos(session.apellidos || "");
    setCargo(session.cargo || "");

    const fetchBadges = async () => {
      try {
        const perfiles = perfilesDelCargo(session.cargo);
        if (perfiles.length === 0) return;

        const lastSeen = await getAllLastSeen(session.id!);
        // Comunicados: filtro JS por destinatarios pero limito a filas nuevas (.gt id).
        const minComLastSeen = Math.min(lastSeen['comunicados'] ?? 0, lastSeen['documentos'] ?? 0);
        const { data: msgData } = await supabase
          .from('Comunicados')
          .select('id, archivo_url, id_destinatarios')
          .overlaps('perfil', perfiles)
          .gt('id', minComLastSeen);

        const esOrientador = session.cargo === 'Orientador(a) Escolar';
        const [remisionesRes, retiroRes, inasistenciaRes, uniformeRes, entrevistaRes] = await Promise.all([
          esOrientador
            ? supabase.from('Remisiones_Orientacion').select('*', { count: 'exact', head: true }).gt('id', lastSeen['remisiones'] ?? 0)
            : Promise.resolve({ count: 0 } as any),
          supabase.from('Autorizaciones_Retiro').select('*', { count: 'exact', head: true }).gt('id', lastSeen['retiro'] ?? 0),
          supabase.from('Justificaciones_Inasistencia').select('*', { count: 'exact', head: true }).gt('id', lastSeen['inasistencia'] ?? 0),
          supabase.from('Justificaciones_Uniforme').select('*', { count: 'exact', head: true }).gt('id', lastSeen['uniforme'] ?? 0),
          supabase.from('Solicitudes_Entrevista').select('*', { count: 'exact', head: true }).eq('creado_por', parseInt(session.id!)).eq('respuesta_vista', false),
        ]);

        if (msgData) {
          const filtrados = msgData.filter((c: any) => {
            if (c.id_destinatarios && c.id_destinatarios.length > 0) {
              return c.id_destinatarios.includes(String(session.id));
            }
            return true;
          });
          setBadges({
            comunicados: filtrados.filter((c: any) => c.id > (lastSeen['comunicados'] ?? 0)).length,
            documentos: filtrados.filter((c: any) => c.archivo_url && c.id > (lastSeen['documentos'] ?? 0)).length,
            remisiones: (remisionesRes as any).count ?? 0,
            retiro: (retiroRes as any).count ?? 0,
            inasistencia: (inasistenciaRes as any).count ?? 0,
            uniforme: (uniformeRes as any).count ?? 0,
            entrevista: (entrevistaRes as any).count ?? 0,
          });
        }
      } catch (err) {
        console.error('Error fetching badges:', err);
      }
    };
    fetchBadges();
  }, [navigate]);

  // Las tarjetas dependen del cargo. Se arman en orden y el componente aplica el
  // orden personalizado guardado encima.
  const items: ReordItem[] = [];
  if (cargo === 'Orientador(a) Escolar') {
    items.push(
      { id: 'casos', render: (
        <button onClick={() => navigate("/orientador/casos")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200">
          <img src={iconCasos} alt="" className="w-12 h-12 object-contain" />
          <span className="font-semibold text-foreground text-center">Casos de Seguimiento</span>
        </button>
      ) },
      { id: 'citas', render: (
        <button onClick={() => navigate("/orientador/citas")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-violet-100 transition-all duration-200 hover:shadow-md hover:bg-violet-200">
          <img src={iconCitas} alt="" className="w-12 h-12 object-contain" />
          <span className="font-semibold text-foreground text-center">Citas y Atención</span>
        </button>
      ) },
      { id: 'remisiones', render: (
        <button onClick={() => navigate("/orientador/remisiones")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-yellow-100 transition-all duration-200 hover:shadow-md hover:bg-yellow-200">
          <Badge count={badges.remisiones} />
          <img src={iconCasos} alt="" className="w-12 h-12 object-contain" />
          <span className="font-semibold text-foreground text-center">Remisiones Recibidas</span>
        </button>
      ) },
    );
  }
  if (!esAdministrativo) {
    items.push({ id: 'notas', render: (
      <button onClick={() => navigate("/rector/seleccionar-grado")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-emerald-100 transition-all duration-200 hover:shadow-md hover:bg-emerald-200">
        <img src={iconNotas} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground">Notas</span>
      </button>
    ) });
  }
  items.push(
    { id: 'enviar-comunicado', render: (
      <button onClick={() => navigate("/enviar-comunicado")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-teal-100 transition-all duration-200 hover:shadow-md hover:bg-teal-200">
        <img src={iconEnviarComunicado} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Enviar Comunicado</span>
      </button>
    ) },
    { id: 'comunicados-recibidos', render: (
      <button onClick={() => navigate("/rector/comunicados-recibidos")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-teal-100 transition-all duration-200 hover:shadow-md hover:bg-teal-200">
        <Badge count={badges.comunicados} />
        <img src={iconComunicadosRecibidos} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Comunicados Recibidos</span>
      </button>
    ) },
    { id: 'documentos-recibidos', render: (
      <button onClick={() => navigate("/rector/documentos-recibidos")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200">
        <Badge count={badges.documentos} />
        <img src={iconDocumentos} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Documentos Recibidos</span>
      </button>
    ) },
    { id: 'permisos-excusas', render: (
      <button onClick={() => navigate("/permisos-excusas")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-rose-100 transition-all duration-200 hover:shadow-md hover:bg-rose-200">
        <Badge count={badges.retiro + badges.inasistencia + badges.uniforme} />
        <img src={iconPermisos} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Permisos y Excusas</span>
      </button>
    ) },
    { id: 'solicitud-entrevista', render: (
      <button onClick={() => navigate("/solicitud-entrevista-staff")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-indigo-100 transition-all duration-200 hover:shadow-md hover:bg-indigo-200">
        <Badge count={badges.entrevista} />
        <img src={iconEntrevista} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Solicitud de Entrevista</span>
      </button>
    ) },
    { id: 'estadisticas', render: (
      <button onClick={() => navigate("/rector/estadisticas")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-green-100 transition-all duration-200 hover:shadow-md hover:bg-green-200">
        <img src={iconEstadisticas} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground">Estadísticas</span>
      </button>
    ) },
    { id: 'consultas', render: (
      <button onClick={() => navigate("/consultas")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-pink-100 transition-all duration-200 hover:shadow-md hover:bg-pink-200">
        <img src={iconConsultas} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Consultas</span>
      </button>
    ) },
  );
  if (cargo === 'Coordinador(a)') {
    items.push({ id: 'conversaciones', render: (
      <button onClick={() => window.open("https://chat.notasnormi.com", "_blank")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-blue-100 transition-all duration-200 hover:shadow-md hover:bg-blue-200">
        <img src={iconConversaciones} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Conversaciones</span>
      </button>
    ) });
  }
  items.push(
    { id: 'registros-comportamiento', render: (
      <button onClick={() => navigate("/registros-comportamiento")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200">
        <img src={iconRegistros} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Registros de Comportamiento</span>
      </button>
    ) },
    { id: 'remitir-orientacion', render: (
      <button onClick={() => navigate("/remitir-orientacion")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-sky-100 transition-all duration-200 hover:shadow-md hover:bg-sky-200">
        <img src={iconEntrevista} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Remitir a Orientación</span>
      </button>
    ) },
  );
  if (cargo === 'Rector') {
    items.push({ id: 'conversaciones', render: (
      <button onClick={() => window.open("https://chat.notasnormi.com", "_blank")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-blue-100 transition-all duration-200 hover:shadow-md hover:bg-blue-200">
        <img src={iconConversaciones} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Conversaciones</span>
      </button>
    ) });
  }
  items.push(
    { id: 'panel-control', render: (
      <button onClick={() => navigate("/rector/panel-control")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-purple-100 transition-all duration-200 hover:shadow-md hover:bg-purple-200">
        <img src={iconPanelControl} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Panel de Control</span>
      </button>
    ) },
    ...(cargo === "Rector" || cargo === "Administrador" ? [{ id: 'construye-institucion', render: (
      <button onClick={() => navigate("/construye-institucion")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-teal-100 transition-all duration-200 hover:shadow-md hover:bg-teal-200">
        <Building2 className="w-12 h-12 text-teal-700" strokeWidth={1.5} />
        <span className="font-semibold text-foreground text-center">Configurar Institución</span>
      </button>
    ) }] : []),
    { id: 'uso-normi', render: (
      <button onClick={() => navigate("/rector/uso-normi")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-orange-100 transition-all duration-200 hover:shadow-md hover:bg-orange-200">
        <img src={iconUsoAgente} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Uso de Normi</span>
      </button>
    ) },
    { id: 'registro-normi', render: (
      <button onClick={() => navigate("/registro-normi")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-cyan-100 transition-all duration-200 hover:shadow-md hover:bg-cyan-200">
        <img src={iconRegistroAgente} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Registro en Normi</span>
      </button>
    ) },
    { id: 'asistencia', render: (
      <button onClick={() => navigate("/asistencia")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-blue-100 transition-all duration-200 hover:shadow-md hover:bg-blue-200">
        <img src={iconAsistencia} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Asistencia</span>
      </button>
    ) },
    { id: 'perfil', render: (
      <button onClick={() => navigate("/perfil")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-sky-100 transition-all duration-200 hover:shadow-md hover:bg-sky-200">
        <img src={iconPerfil} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Perfil</span>
      </button>
    ) },
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard-rector" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-8">
        <EncabezadoColegio />
        <div className="relative max-w-2xl mx-auto">
          <div className="bg-card rounded-lg shadow-soft p-8 text-center">
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-4">
              Bienvenido(a)
            </h2>
            <p className="text-xl text-primary font-semibold">
              {nombres} {apellidos}
            </p>
            <p className="text-muted-foreground mt-2">
              {cargo}
            </p>
          </div>
          <div className="hidden xl:block absolute top-1/2 -translate-y-1/2 left-full ml-10">
            <AvatarUploader />
          </div>
          <div className="xl:hidden flex justify-center mt-4">
            <AvatarUploader />
          </div>
        </div>

        {/* Botones principales */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto mt-8">
          <h3 className="text-xl font-bold text-foreground mb-1 text-center">
            ¿Qué deseas consultar?
          </h3>

          <ReordenableDashboard
            dashboardKey="rector"
            gridClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 max-w-5xl mx-auto"
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

export default DashboardRector;
