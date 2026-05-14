import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isAdmin, puedeAccederDashboard, isAdministrativo } from "@/hooks/useSession";
import iconNotas from "@/assets/icons/notas.webp";
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
import iconRestringir from "@/assets/icons/restringir-agente.webp";
import HeaderNormy from "@/components/HeaderNormy";
import { getAllLastSeen } from "@/utils/notificaciones";

const perfilesDelCargo = (cargo: string | undefined): string[] => {
  switch (cargo) {
    case 'Rector': return ['Rector'];
    case 'Coordinador(a)': return ['Coordinadores'];
    case 'Administrativo(a)': return ['Administrativos'];
    case 'Secretaria General': return ['Secretaria General'];
    case 'Orientador(a) Escolar': return ['Administrativos'];
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
  const [badges, setBadges] = useState({ comunicados: 0, documentos: 0, remisiones: 0, retiro: 0, inasistencia: 0, uniforme: 0 });
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
        const [remisionesRes, retiroRes, inasistenciaRes, uniformeRes] = await Promise.all([
          esOrientador
            ? supabase.from('Remisiones_Orientacion').select('*', { count: 'exact', head: true }).gt('id', lastSeen['remisiones'] ?? 0)
            : Promise.resolve({ count: 0 } as any),
          supabase.from('Autorizaciones_Retiro').select('*', { count: 'exact', head: true }).gt('id', lastSeen['retiro'] ?? 0),
          supabase.from('Justificaciones_Inasistencia').select('*', { count: 'exact', head: true }).gt('id', lastSeen['inasistencia'] ?? 0),
          supabase.from('Justificaciones_Uniforme').select('*', { count: 'exact', head: true }).gt('id', lastSeen['uniforme'] ?? 0),
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
          });
        }
      } catch (err) {
        console.error('Error fetching badges:', err);
      }
    };
    fetchBadges();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard-rector" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-8">
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-2xl mx-auto text-center">
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

        {/* Botones principales */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto mt-8">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            ¿Qué deseas consultar?
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {!esAdministrativo && (
              <button
                onClick={() => navigate("/rector/seleccionar-grado")}
                className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-emerald-100 transition-all duration-200 hover:shadow-md hover:bg-emerald-200"
              >
                <img src={iconNotas} alt="" className="w-16 h-16 object-contain" />
                <span className="font-semibold text-lg text-foreground">Notas</span>
              </button>
            )}

            <button
              onClick={() => navigate("/enviar-comunicado")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-teal-100 transition-all duration-200 hover:shadow-md hover:bg-teal-200"
            >
              <img src={iconEnviarComunicado} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Enviar Comunicado</span>
            </button>

            <button
              onClick={() => navigate("/rector/comunicados-recibidos")}
              className="relative flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-teal-100 transition-all duration-200 hover:shadow-md hover:bg-teal-200"
            >
              <Badge count={badges.comunicados} />
              <img src={iconComunicadosRecibidos} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Comunicados Recibidos</span>
            </button>

            <button
              onClick={() => navigate("/rector/documentos-recibidos")}
              className="relative flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200"
            >
              <Badge count={badges.documentos} />
              <img src={iconDocumentos} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Documentos Recibidos</span>
            </button>

            <button
              onClick={() => navigate("/rector/estadisticas")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-green-100 transition-all duration-200 hover:shadow-md hover:bg-green-200"
            >
              <img src={iconEstadisticas} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground">Estadísticas</span>
            </button>

            {cargo === 'Orientador(a) Escolar' && (
              <>
                <button
                  onClick={() => navigate("/orientador/casos")}
                  className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200"
                >
                  <img src={iconCasos} alt="" className="w-16 h-16 object-contain" />
                  <span className="font-semibold text-lg text-foreground text-center">Casos de Seguimiento</span>
                </button>

                <button
                  onClick={() => navigate("/orientador/citas")}
                  className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-violet-100 transition-all duration-200 hover:shadow-md hover:bg-violet-200"
                >
                  <img src={iconCitas} alt="" className="w-16 h-16 object-contain" />
                  <span className="font-semibold text-lg text-foreground text-center">Citas y Atención</span>
                </button>

                <button
                  onClick={() => navigate("/orientador/remisiones")}
                  className="relative flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-yellow-100 transition-all duration-200 hover:shadow-md hover:bg-yellow-200"
                >
                  <Badge count={badges.remisiones} />
                  <img src={iconCasos} alt="" className="w-16 h-16 object-contain" />
                  <span className="font-semibold text-lg text-foreground text-center">Remisiones Recibidas</span>
                </button>
              </>
            )}

            <button
              onClick={() => navigate("/remitir-orientacion")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-sky-100 transition-all duration-200 hover:shadow-md hover:bg-sky-200"
            >
              <img src={iconEntrevista} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Remitir a Orientación</span>
            </button>

            <button
              onClick={() => navigate("/permisos-excusas")}
              className="relative flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-rose-100 transition-all duration-200 hover:shadow-md hover:bg-rose-200"
            >
              <Badge count={badges.retiro + badges.inasistencia + badges.uniforme} />
              <img src={iconPermisos} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Permisos y Excusas</span>
            </button>

            <button
              onClick={() => navigate("/consultas")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-pink-100 transition-all duration-200 hover:shadow-md hover:bg-pink-200"
            >
              <img src={iconConsultas} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Consultas</span>
            </button>

            {cargo === 'Coordinador(a)' && (
              <button
                onClick={() => window.open("https://chat.notasnormy.com", "_blank")}
                className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-blue-100 transition-all duration-200 hover:shadow-md hover:bg-blue-200"
              >
                <img src={iconConversaciones} alt="" className="w-16 h-16 object-contain" />
                <span className="font-semibold text-lg text-foreground text-center">Conversaciones</span>
              </button>
            )}

            <button
              onClick={() => navigate("/registros-comportamiento")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200"
            >
              <img src={iconRegistros} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Registros de Comportamiento</span>
            </button>

            {cargo === 'Rector' && (
              <button
                onClick={() => navigate("/rector/restringir-normy")}
                className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-red-100 transition-all duration-200 hover:shadow-md hover:bg-red-200"
              >
                <img src={iconRestringir} alt="" className="w-16 h-16 object-contain" />
                <span className="font-semibold text-lg text-foreground text-center">Restringir Normy</span>
              </button>
            )}

            {cargo === 'Rector' && (
              <button
                onClick={() => window.open("https://chat.notasnormy.com", "_blank")}
                className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-blue-100 transition-all duration-200 hover:shadow-md hover:bg-blue-200"
              >
                <img src={iconConversaciones} alt="" className="w-16 h-16 object-contain" />
                <span className="font-semibold text-lg text-foreground text-center">Conversaciones</span>
              </button>
            )}

            <button
              onClick={() => navigate("/rector/panel-control")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-purple-100 transition-all duration-200 hover:shadow-md hover:bg-purple-200"
            >
              <img src={iconPanelControl} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Panel de Control</span>
            </button>

            <button
              onClick={() => navigate("/rector/uso-normy")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-orange-100 transition-all duration-200 hover:shadow-md hover:bg-orange-200"
            >
              <img src={iconUsoAgente} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Uso de Normy</span>
            </button>

            <button
              onClick={() => navigate("/registro-normy")}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-cyan-100 transition-all duration-200 hover:shadow-md hover:bg-cyan-200"
            >
              <img src={iconRegistroAgente} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-lg text-foreground text-center">Registro en Normy</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardRector;
