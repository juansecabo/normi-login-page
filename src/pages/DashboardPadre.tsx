import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isPadreDeFamilia, HijoData } from "@/hooks/useSession";
import iconNotas from "@/assets/icons/notas.webp";
import iconActividades from "@/assets/icons/actividades.webp";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconComunicados from "@/assets/icons/comunicados.webp";
import iconDocumentos from "@/assets/icons/documentos.webp";
import HeaderNormy from "@/components/HeaderNormy";
import BuzonSugerencias from "@/components/BuzonSugerencias";
import { supabase } from "@/integrations/supabase/client";
import { getAllLastSeen } from "@/utils/notificaciones";

const Badge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm animate-badge-pop">
      {count > 99 ? '99+' : count}
    </span>
  );
};

const DashboardPadre = () => {
  const navigate = useNavigate();
  const [nombres, setNombres] = useState("");
  const [hijos, setHijos] = useState<HijoData[]>([]);
  const [badges, setBadges] = useState({ notas: 0, actividades: 0, comunicados: 0, documentos: 0 });

  useEffect(() => {
    const session = getSession();

    if (!session.codigo) {
      navigate("/");
      return;
    }

    if (!isPadreDeFamilia()) {
      navigate("/");
      return;
    }

    setNombres(session.nombres || "");
    setHijos(session.hijos || []);

    // Si solo tiene un hijo, auto-seleccionar en localStorage para las páginas internas
    if (session.hijos && session.hijos.length === 1) {
      localStorage.setItem("hijoSeleccionado", JSON.stringify(session.hijos[0]));
    }

    const fetchBadges = async () => {
      const codigo = session.codigo!;
      const hijosData = session.hijos || [];
      const b = { notas: 0, actividades: 0, comunicados: 0, documentos: 0 };

      try {
        // Paso 1: lastSeen del padre y de cada hijo, en paralelo.
        const [lastSeenPadre, ...lastSeenHijos] = await Promise.all([
          getAllLastSeen(codigo),
          ...hijosData.map(h => getAllLastSeen(h.codigo)),
        ]);

        // Paso 2: queries de datos en paralelo (count puro o filas nuevas via .gt).
        const minComLastSeen = Math.min(lastSeenPadre['comunicados'] ?? 0, lastSeenPadre['documentos'] ?? 0);
        const [msgRes, ...hijosResults] = await Promise.all([
          supabase
            .from('Comunicados')
            .select('id, nivel, grado, salon, codigo_estudiantil, archivo_url')
            .in('perfil', ['Padres de familia', 'Estudiantes y Padres de familia'])
            .gt('id', minComLastSeen),
          ...hijosData.flatMap((hijo, i) => {
            const lastNotasIso = lastSeenHijos[i]['notas']
              ? new Date((lastSeenHijos[i]['notas'] as number) * 1000).toISOString()
              : new Date(0).toISOString();
            return [
              supabase
                .from('Calendario Actividades')
                .select('*', { count: 'exact', head: true })
                .eq('Grado', hijo.grado)
                .eq('Salon', hijo.salon)
                .gt('auto_id', lastSeenHijos[i]['actividades'] ?? 0),
              supabase
                .from('Notas')
                .select('*', { count: 'exact', head: true })
                .eq('codigo_estudiantil', hijo.codigo)
                .eq('grado', hijo.grado)
                .eq('salon', hijo.salon)
                .not('nombre_actividad', 'in', '("Definitiva Periodo","Definitiva Anual")')
                .gt('fecha_modificacion', lastNotasIso),
            ];
          }),
        ]);

        if (msgRes.data) {
          const filtrados = msgRes.data.filter((c: any) => {
            if (c.codigo_estudiantil) {
              return hijosData.some(h => h.codigo === c.codigo_estudiantil);
            }
            if (!c.nivel && !c.grado && !c.salon) return true;
            return hijosData.some(h => {
              if (c.nivel && c.nivel !== h.nivel) return false;
              if (c.grado && c.grado !== h.grado) return false;
              if (c.salon && c.salon !== h.salon) return false;
              return true;
            });
          });
          b.comunicados = filtrados.filter((c: any) => c.id > (lastSeenPadre['comunicados'] ?? 0)).length;
          b.documentos = filtrados.filter((c: any) => c.archivo_url && c.id > (lastSeenPadre['documentos'] ?? 0)).length;
        }

        // Cada hijo aportó 2 entradas: actResult, notasResult.
        for (let i = 0; i < hijosData.length; i++) {
          const actResult = hijosResults[i * 2] as any;
          const notasResult = hijosResults[i * 2 + 1] as any;
          b.actividades += actResult.count ?? 0;
          b.notas += notasResult.count ?? 0;
        }
      } catch (err) {
        console.error('Error fetching badges:', err);
      }

      setBadges(b);
    };

    fetchBadges();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard-padre" />

      <main className="flex-1 container mx-auto p-8">
        <div className="bg-card rounded-lg shadow-soft p-5 max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-foreground mb-1">
            Bienvenido(a)
          </h2>
          <p className="text-lg text-primary font-semibold">
            {nombres}
          </p>
          <p className="text-sm text-muted-foreground mt-1 mb-1">
            Padre de familia de
          </p>
          <div className="space-y-0.5">
            {hijos.map(h => (
              <p key={h.codigo} className="text-sm text-foreground">
                {h.nombre} {h.apellidos} <span className="text-muted-foreground">({h.grado} {h.salon})</span>
              </p>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto mt-8">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            ¿Qué deseas consultar?
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 max-w-4xl mx-auto">
            <button
              onClick={() => navigate("/padre/notas")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-emerald-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-emerald-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-emerald-200"
            >
              <Badge count={badges.notas} />
              <img src={iconNotas} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground">Notas</span>
            </button>

            <button
              onClick={() => navigate("/padre/actividades")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-green-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-green-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-green-200"
            >
              <Badge count={badges.actividades} />
              <img src={iconActividades} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Actividades</span>
            </button>

            <button
              onClick={() => navigate("/padre/estadisticas")}
              className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-teal-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-teal-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-teal-200"
            >
              <img src={iconEstadisticas} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Estadísticas</span>
            </button>

            <button
              onClick={() => navigate("/padre/comunicados")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-lime-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-lime-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-lime-200"
            >
              <Badge count={badges.comunicados} />
              <img src={iconComunicados} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Comunicados</span>
            </button>

            <button
              onClick={() => navigate("/padre/documentos")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-cyan-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-cyan-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-cyan-200"
            >
              <Badge count={badges.documentos} />
              <img src={iconDocumentos} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Documentos</span>
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

export default DashboardPadre;
