import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import normiExaminadoraImg from "@/assets/normi-examinadora.webp";
import iconActividades from "@/assets/icons/actividades.webp";
import iconPerfil from "@/assets/icons/perfil.png";
import iconEnviarComunicado from "@/assets/icons/enviar-comunicado.webp";
import iconComunicadosRecibidos from "@/assets/icons/comunicados-recibidos.webp";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconRegistroAgente from "@/assets/icons/registro-agente.webp";
import iconEntrevista from "@/assets/icons/entrevista.webp";
import iconDocumentos from "@/assets/icons/documentos.webp";
import iconPermisos from "@/assets/icons/permisos-y-excusas.webp";
import iconConsultas from "@/assets/icons/consultas.png";
import iconRegistros from "@/assets/icons/registros-comportamiento.png";
import iconAsistencia from "@/assets/icons/asistencia.webp";
import iconFotosGrupo from "@/assets/icons/fotos-grupo.webp";
import { Users } from "lucide-react";
import { useBienvenida, getSession, isProfesor, isAdmin, isRectorOrCoordinador, isEstudiante, isPadreDeFamilia } from "@/hooks/useSession";
import { usePendientesFirma } from "@/hooks/usePendientesFirma";
import HeaderNormi from "@/components/HeaderNormi";
import EncabezadoColegio from "@/components/EncabezadoColegio";
import AvatarUploader from "@/components/AvatarUploader";
import BuzonSugerencias from "@/components/BuzonSugerencias";
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

const Dashboard = () => {
  const navigate = useNavigate();
  const saludo = useBienvenida();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [asignaturas, setAsignaturas] = useState<string[]>([]);
  const [badges, setBadges] = useState({ comunicados: 0, documentos: 0, retiro: 0, inasistencia: 0, uniforme: 0, entrevista: 0 });
  const pendFirma = usePendientesFirma();
  const [selectedAsignatura, setSelectedAsignatura] = useState<string | null>(null);
  const [loadingAsignaturas, setLoadingAsignaturas] = useState(true);
  const [esDirectorGrupo, setEsDirectorGrupo] = useState(false);

  useEffect(() => {
    const session = getSession();

    if (!session.id) {
      navigate("/");
      return;
    }

    // Redirigir al dashboard correcto si no es profesor
    if (!isProfesor()) {
      if (isAdmin()) navigate("/dashboard-admin", { replace: true });
      else if (isRectorOrCoordinador()) navigate("/dashboard-rector", { replace: true });
      else if (isEstudiante()) navigate("/dashboard-estudiante", { replace: true });
      else if (isPadreDeFamilia()) navigate("/dashboard-acudiente", { replace: true });
      else navigate("/", { replace: true });
      return;
    }

    setNombres(session.nombres || "");
    setApellidos(session.apellidos || "");

    // ¿Es director de grupo? (para mostrar la ficha "Fotos de mi grupo")
    supabase.from("Internos").select("direccion_de_grupo").eq("id", parseInt(session.id!)).maybeSingle()
      .then(({ data }) => setEsDirectorGrupo(!!((data as { direccion_de_grupo?: string } | null)?.direccion_de_grupo || "").trim()))
      .catch(() => { /* no crítico */ });

    // Fetch badges — los Comunicados deben usar la MISMA logica de filtro que
    // ComunicadosProfesor / DocumentosProfesor (que considera asignaciones del
    // profesor), si no el dashboard sobre-cuenta y el badge no se borra al entrar.
    const fetchBadges = async () => {
      try {
        const lastSeen = await getAllLastSeen(session.id!);
        const minComLastSeen = Math.min(lastSeen['comunicados'] ?? 0, lastSeen['documentos'] ?? 0);
        const [asignacionesRes, msgRes, retiroRes, inasistenciaRes, uniformeRes, entrevistaRes] = await Promise.all([
          supabase.from('Asignación Profesores').select('"Grado(s)", "Salon(es)"').eq('id', parseInt(session.id!)),
          supabase.from('Comunicados')
            .select('id, nivel, grado, salon, grados, salones, id_destinatarios, archivo_url')
            .overlaps('perfil', ['Profesores'])
            .gt('id', minComLastSeen),
          supabase.from('Autorizaciones_Retiro').select('*', { count: 'exact', head: true }).gt('id', lastSeen['retiro'] ?? 0),
          supabase.from('Justificaciones_Inasistencia').select('*', { count: 'exact', head: true }).gt('id', lastSeen['inasistencia'] ?? 0),
          supabase.from('Justificaciones_Uniforme').select('*', { count: 'exact', head: true }).gt('id', lastSeen['uniforme'] ?? 0),
          supabase.from('Solicitudes_Entrevista').select('*', { count: 'exact', head: true }).eq('creado_por', parseInt(session.id!)).eq('respuesta_vista', false),
        ]);

        const NIVELES_GRADOS: Record<string, string[]> = {
          Preescolar: ["Párvulo", "Prejardín", "Jardín", "Transición"],
          Primaria: ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto"],
          Secundaria: ["Sexto", "Séptimo", "Octavo", "Noveno"],
          Media: ["Décimo", "Undécimo"],
        };
        const rows = (asignacionesRes.data || []).map((row: any) => ({
          grados: ((row["Grado(s)"] as string[] | null) || []),
          salones: ((row["Salon(es)"] as string[] | null) || []),
        }));

        const b = { comunicados: 0, documentos: 0, retiro: 0, inasistencia: 0, uniforme: 0, entrevista: 0 };
        if (msgRes.data) {
          const filtrados = msgRes.data.filter((c: any) => {
            if (c.id_destinatarios && c.id_destinatarios.length > 0) {
              return c.id_destinatarios.includes(String(session.id));
            }
            if (c.id && c.id !== session.id) return false;
            const grados = c.grados ?? (c.grado ? [c.grado] : null);
            const salones = c.salones ?? (c.salon ? [c.salon] : null);
            if (grados || salones || c.nivel) {
              const algunaFilaMatch = rows.some(r => {
                if (grados && !grados.some((g: string) => r.grados.includes(g))) return false;
                if (salones && !salones.some((s: string) => r.salones.includes(s))) return false;
                if (c.nivel) {
                  const gradosDelNivel = NIVELES_GRADOS[c.nivel] || [];
                  if (!r.grados.some(g => gradosDelNivel.includes(g))) return false;
                }
                return true;
              });
              if (!algunaFilaMatch) return false;
            }
            return true;
          });
          // Dedup por grupo_comunicado_id antes de contar badges
          const seen = new Set<number>();
          const dedup = filtrados.filter((c: any) => {
            const key = c.grupo_comunicado_id ?? c.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          b.comunicados = dedup.filter((c: any) => c.id > (lastSeen['comunicados'] ?? 0)).length;
          b.documentos = dedup.filter((c: any) => c.archivo_url && c.id > (lastSeen['documentos'] ?? 0)).length;
        }
        b.retiro = retiroRes.count ?? 0;
        b.inasistencia = inasistenciaRes.count ?? 0;
        b.uniforme = uniformeRes.count ?? 0;
        b.entrevista = entrevistaRes.count ?? 0;

        setBadges(b);
      } catch {}
    };
    fetchBadges();

    // Fetch asignaturas del profesor
    const fetchAsignaturas = async () => {
      try {
        // Buscar las asignaturas en Asignación Profesores directamente por id
        const { data: asignaciones, error: asignacionError } = await supabase
          .from('Asignación Profesores')
          .select('"Asignatura(s)", "Grado(s)"')
          .eq('id', parseInt(session.id!));

        if (asignacionError || !asignaciones) {
          setLoadingAsignaturas(false);
          return;
        }

        // Combinar todas las asignaturas de todos los registros sin duplicados
        console.log("Asignaturas antes de aplanar:", asignaciones?.map(a => a['Asignatura(s)']));

        const todasAsignaturas = asignaciones
          ?.flatMap(a => a['Asignatura(s)'] || [])
          .flat() || [];
        const asignaturasUnicas = [...new Set(todasAsignaturas)].sort((a, b) => a.localeCompare(b, 'es'));
        setAsignaturas(asignaturasUnicas);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoadingAsignaturas(false);
      }
    };

    fetchAsignaturas();
  }, [navigate]);

  const items: ReordItem[] = [
    { id: 'programar-actividad', render: (
      <button onClick={() => navigate("/profesor/programar-actividad")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-cyan-100 transition-all duration-200 hover:shadow-md hover:bg-cyan-200">
        <img src={iconActividades} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Programar Actividad</span>
      </button>
    ) },
    { id: 'enviar-comunicado', render: (
      <button onClick={() => navigate("/enviar-comunicado")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-teal-100 transition-all duration-200 hover:shadow-md hover:bg-teal-200">
        <img src={iconEnviarComunicado} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Enviar Comunicado</span>
      </button>
    ) },
    { id: 'comunicados-firma', render: (
      <button onClick={() => navigate("/comunicados-firma")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-violet-100 transition-all duration-200 hover:shadow-md hover:bg-violet-200">
        <Badge count={pendFirma} />
        <img src={iconEnviarComunicado} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Comunicados con firma</span>
      </button>
    ) },
    { id: 'comunicados-recibidos', render: (
      <button onClick={() => navigate("/profesor/comunicados")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-indigo-100 transition-all duration-200 hover:shadow-md hover:bg-indigo-200">
        <Badge count={badges.comunicados} />
        <img src={iconComunicadosRecibidos} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Comunicados Recibidos</span>
      </button>
    ) },
    { id: 'documentos-recibidos', render: (
      <button onClick={() => navigate("/profesor/documentos")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200">
        <Badge count={badges.documentos} />
        <img src={iconDocumentos} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Documentos Recibidos</span>
      </button>
    ) },
    { id: 'normi-examinadora', render: (
      <button onClick={() => navigate("/normi-examinadora")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-green-100 transition-all duration-200 hover:shadow-md hover:bg-green-200">
        <img src={normiExaminadoraImg} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Normi Examinadora</span>
      </button>
    ) },
    { id: 'estadisticas', render: (
      <button onClick={() => navigate("/profesor/estadisticas")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-orange-100 transition-all duration-200 hover:shadow-md hover:bg-orange-200">
        <img src={iconEstadisticas} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Estadísticas</span>
      </button>
    ) },
    { id: 'registro-normi', render: (
      <button onClick={() => navigate("/registro-normi")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-cyan-100 transition-all duration-200 hover:shadow-md hover:bg-cyan-200">
        <img src={iconRegistroAgente} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Registro en Normi</span>
      </button>
    ) },
    { id: 'remitir-orientacion', render: (
      <button onClick={() => navigate("/remitir-orientacion")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-sky-100 transition-all duration-200 hover:shadow-md hover:bg-sky-200">
        <img src={iconEntrevista} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Remitir a Orientación</span>
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
    { id: 'consultas', render: (
      <button onClick={() => navigate("/consultas")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-pink-100 transition-all duration-200 hover:shadow-md hover:bg-pink-200">
        <img src={iconConsultas} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Consultas</span>
      </button>
    ) },
    { id: 'registros-comportamiento', render: (
      <button onClick={() => navigate("/registros-comportamiento")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200">
        <img src={iconRegistros} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Registros de Comportamiento</span>
      </button>
    ) },
    { id: 'asistencia', render: (
      <button onClick={() => navigate("/profesor/asistencia")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-blue-100 transition-all duration-200 hover:shadow-md hover:bg-blue-200">
        <img src={iconAsistencia} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Asistencia</span>
      </button>
    ) },
    ...(esDirectorGrupo ? [{ id: 'direccion-grupo', render: (
      <button onClick={() => navigate("/direccion-grupo")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-lime-100 transition-all duration-200 hover:shadow-md hover:bg-lime-200">
        <Users className="w-12 h-12 text-lime-700" />
        <span className="font-semibold text-foreground text-center">Dirección de grupo</span>
      </button>
    ) }] : []),
    { id: 'perfil', render: (
      <button onClick={() => navigate("/perfil")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-sky-100 transition-all duration-200 hover:shadow-md hover:bg-sky-200">
        <img src={iconPerfil} alt="" className="w-12 h-12 object-contain" />
        <span className="font-semibold text-foreground text-center">Perfil</span>
      </button>
    ) },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      {/* Main Content */}
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
              Sistema de gestión de calificaciones
            </p>
          </div>
          <div className="hidden xl:block absolute inset-y-0 left-full ml-10">
            <AvatarUploader fill />
          </div>
          <div className="xl:hidden flex justify-center mt-4">
            <AvatarUploader />
          </div>
        </div>

        {/* Sección de Asignaturas */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto mt-8">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            Elige tu asignatura:
          </h3>

          {loadingAsignaturas ? (
            <div className="text-center text-muted-foreground">
              Cargando asignaturas...
            </div>
          ) : asignaturas.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No tienes asignaturas asignadas
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {asignaturas.map((asignatura, index) => {
                const isSelected = selectedAsignatura === asignatura;

                return (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedAsignatura(asignatura);
                      localStorage.setItem("asignaturaSeleccionada", asignatura);
                      navigate("/seleccionar-grado");
                    }}
                    className={`
                      p-6 rounded-lg border-2 text-center transition-all duration-200
                      hover:shadow-md hover:border-primary hover:bg-primary/10
                      ${isSelected
                        ? 'border-primary bg-primary/20 shadow-md ring-2 ring-primary/30'
                        : 'border-border bg-background'
                      }
                    `}
                  >
                    <span className="font-medium text-foreground">{asignatura}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Botones de acciones */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-5xl mx-auto mt-8">
          <h3 className="text-xl font-bold text-foreground mb-1 text-center">
            ¿Qué deseas hacer?
          </h3>

          <ReordenableDashboard
            dashboardKey="profesor"
            gridClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 max-w-5xl mx-auto"
            items={items}
          />
        </div>

        <div className="flex items-start justify-center gap-8 mt-8">
          <BuzonSugerencias />
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

export default Dashboard;
