import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isPadreDeFamilia, isProfesor, puedeAccederDashboard, isAdmin } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import iconRetiro from "@/assets/icons/retiro-estudiantes.webp";
import iconInasistencia from "@/assets/icons/inasistencia.webp";
import iconUniforme from "@/assets/icons/uniforme.webp";
import { getAllLastSeen } from "@/utils/notificaciones";

const Badge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm z-10 animate-badge-pop">
      {count > 99 ? '99+' : count}
    </span>
  );
};

const PermisosExcusas = () => {
  const navigate = useNavigate();
  const [badges, setBadges] = useState({ retiro: 0, inasistencia: 0, uniforme: 0 });
  const esStaff = isProfesor() || puedeAccederDashboard() || isAdmin();

  useEffect(() => {
    const session = getSession();
    if (!session.id) {
      navigate("/");
      return;
    }
    if (!isPadreDeFamilia() && !isProfesor() && !puedeAccederDashboard() && !isAdmin()) {
      navigate("/");
      return;
    }

    if (!esStaff) return;

    const fetchBadges = async () => {
      try {
        const lastSeen = await getAllLastSeen(session.id!);
        // Cuento en el servidor: solo viaja un numero por tabla, no toda la lista de IDs.
        const [retiroRes, inasistenciaRes, uniformeRes] = await Promise.all([
          supabase.from('Autorizaciones_Retiro').select('*', { count: 'exact', head: true }).gt('id', lastSeen['retiro'] ?? 0),
          supabase.from('Justificaciones_Inasistencia').select('*', { count: 'exact', head: true }).gt('id', lastSeen['inasistencia'] ?? 0),
          supabase.from('Justificaciones_Uniforme').select('*', { count: 'exact', head: true }).gt('id', lastSeen['uniforme'] ?? 0),
        ]);
        setBadges({
          retiro: retiroRes.count ?? 0,
          inasistencia: inasistenciaRes.count ?? 0,
          uniforme: uniformeRes.count ?? 0,
        });
      } catch (err) {
        console.error('Error fetching badges:', err);
      }
    };
    fetchBadges();
  }, [navigate, esStaff]);

  const backLink = isAdmin()
    ? "/dashboard-admin"
    : puedeAccederDashboard()
    ? "/dashboard-rector"
    : isPadreDeFamilia()
    ? "/dashboard-acudiente"
    : "/dashboard";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Permisos y Excusas</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-8 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground text-center mb-2">
            Permisos y Excusas
          </h2>
          <p className="text-muted-foreground text-center mb-8">
            Selecciona el tipo de solicitud
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={() => navigate(isPadreDeFamilia() ? "/permisos-excusas/retiro" : "/permisos-excusas/retiro-staff")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-red-50 border-2 border-red-200 transition-all duration-200 hover:shadow-md hover:bg-red-100 hover:scale-[1.02] cursor-pointer"
            >
              <Badge count={badges.retiro} />
              <img src={iconRetiro} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-foreground text-center">
                Retiro de Estudiantes
              </span>
            </button>

            <button
              onClick={() => navigate(isPadreDeFamilia() ? "/permisos-excusas/inasistencia" : "/permisos-excusas/inasistencia-staff")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-amber-50 border-2 border-amber-200 transition-all duration-200 hover:shadow-md hover:bg-amber-100 hover:scale-[1.02] cursor-pointer"
            >
              <Badge count={badges.inasistencia} />
              <img src={iconInasistencia} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-foreground text-center">
                Justificación por Inasistencia
              </span>
            </button>

            <button
              onClick={() => navigate(isPadreDeFamilia() ? "/permisos-excusas/uniforme" : "/permisos-excusas/uniforme-staff")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-orange-50 border-2 border-orange-200 transition-all duration-200 hover:shadow-md hover:bg-orange-100 hover:scale-[1.02] cursor-pointer"
            >
              <Badge count={badges.uniforme} />
              <img src={iconUniforme} alt="" className="w-16 h-16 object-contain" />
              <span className="font-semibold text-foreground text-center">
                Justificación por Uniforme
              </span>
            </button>

          </div>
        </div>
      </main>
    </div>
  );
};

export default PermisosExcusas;
