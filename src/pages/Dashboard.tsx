import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import normyExaminadoraImg from "@/assets/normy-examinadora.webp";
import iconActividades from "@/assets/icons/actividades.webp";
import iconComunicados from "@/assets/icons/comunicados.webp";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconRegistroAgente from "@/assets/icons/registro-agente.webp";
import iconDocumentos from "@/assets/icons/documentos.webp";
import { getSession, isProfesor, isAdmin, isRectorOrCoordinador, isEstudiante, isPadreDeFamilia } from "@/hooks/useSession";
import HeaderNormy from "@/components/HeaderNormy";
import BuzonSugerencias from "@/components/BuzonSugerencias";
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
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [asignaturas, setAsignaturas] = useState<string[]>([]);
  const [badges, setBadges] = useState({ comunicados: 0, documentos: 0 });
  const [selectedAsignatura, setSelectedAsignatura] = useState<string | null>(null);
  const [loadingAsignaturas, setLoadingAsignaturas] = useState(true);

  useEffect(() => {
    const session = getSession();

    if (!session.codigo) {
      navigate("/");
      return;
    }

    // Redirigir al dashboard correcto si no es profesor
    if (!isProfesor()) {
      if (isAdmin()) navigate("/dashboard-admin", { replace: true });
      else if (isRectorOrCoordinador()) navigate("/dashboard-rector", { replace: true });
      else if (isEstudiante()) navigate("/dashboard-estudiante", { replace: true });
      else if (isPadreDeFamilia()) navigate("/dashboard-padre", { replace: true });
      else navigate("/", { replace: true });
      return;
    }

    setNombres(session.nombres || "");
    setApellidos(session.apellidos || "");

    // Fetch badges — count en el servidor, viaja un solo numero por query.
    const fetchBadges = async () => {
      try {
        const lastSeen = await getAllLastSeen(session.id!);
        const perfiles = ['Profesores', 'Coordinadores', 'Todo el personal interno', 'Toda la comunidad'];
        const [comunicadosRes, documentosRes] = await Promise.all([
          supabase.from('Comunicados').select('*', { count: 'exact', head: true })
            .in('perfil', perfiles)
            .gt('id', lastSeen['comunicados'] ?? 0),
          supabase.from('Comunicados').select('*', { count: 'exact', head: true })
            .in('perfil', perfiles)
            .not('archivo_url', 'is', null)
            .gt('id', lastSeen['documentos'] ?? 0),
        ]);
        setBadges({
          comunicados: comunicadosRes.count ?? 0,
          documentos: documentosRes.count ?? 0,
        });
      } catch {}
    };
    fetchBadges();

    // Fetch asignaturas del profesor
    const fetchAsignaturas = async () => {
      try {
        // Buscar las asignaturas en Asignación Profesores directamente por codigo
        const { data: asignaciones, error: asignacionError } = await supabase
          .from('Asignación Profesores')
          .select('"Asignatura(s)", "Grado(s)"')
          .eq('codigo', parseInt(session.codigo!));

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard" />

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
            Sistema de gestión de calificaciones
          </p>
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
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            ¿Qué deseas hacer?
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <button
              onClick={() => navigate("/profesor/programar-actividad")}
              className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-cyan-100 transition-all duration-200 hover:shadow-md hover:bg-cyan-200"
            >
              <img src={iconActividades} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Programar Actividad</span>
            </button>

            <button
              onClick={() => navigate("/enviar-comunicado")}
              className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-teal-100 transition-all duration-200 hover:shadow-md hover:bg-teal-200"
            >
              <img src={iconComunicados} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Enviar Comunicado</span>
            </button>

            <button
              onClick={() => navigate("/profesor/comunicados")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-indigo-100 transition-all duration-200 hover:shadow-md hover:bg-indigo-200"
            >
              <Badge count={badges.comunicados} />
              <img src={iconComunicados} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Comunicados Recibidos</span>
            </button>

            <button
              onClick={() => navigate("/normy-examinadora")}
              className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-green-100 transition-all duration-200 hover:shadow-md hover:bg-green-200"
            >
              <img src={normyExaminadoraImg} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Normy Examinadora</span>
            </button>

            <button
              onClick={() => navigate("/profesor/estadisticas")}
              className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-orange-100 transition-all duration-200 hover:shadow-md hover:bg-orange-200"
            >
              <img src={iconEstadisticas} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Estadísticas</span>
            </button>

            <button
              onClick={() => navigate("/registro-normy")}
              className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-cyan-100 transition-all duration-200 hover:shadow-md hover:bg-cyan-200"
            >
              <img src={iconRegistroAgente} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Registro en Normy</span>
            </button>

            <button
              onClick={() => navigate("/profesor/documentos")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-amber-100 transition-all duration-200 hover:shadow-md hover:bg-amber-200"
            >
              <Badge count={badges.documentos} />
              <img src={iconDocumentos} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Documentos Recibidos</span>
            </button>
          </div>
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
