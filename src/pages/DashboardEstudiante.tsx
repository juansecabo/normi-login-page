import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isEstudiante } from "@/hooks/useSession";
import iconNotas from "@/assets/icons/notas.webp";
import iconActividades from "@/assets/icons/actividades.webp";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconComunicados from "@/assets/icons/comunicados.webp";
import iconDocumentos from "@/assets/icons/documentos.webp";
import HeaderNormy from "@/components/HeaderNormy";
import BuzonSugerencias from "@/components/BuzonSugerencias";
import { supabase } from "@/integrations/supabase/client";
import { getAllLastSeen, countNewItems } from "@/utils/notificaciones";

const Badge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm animate-badge-pop">
      {count > 99 ? '99+' : count}
    </span>
  );
};

const DashboardEstudiante = () => {
  const navigate = useNavigate();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [badges, setBadges] = useState({ notas: 0, actividades: 0, comunicados: 0, documentos: 0 });

  useEffect(() => {
    const session = getSession();

    if (!session.codigo) {
      navigate("/");
      return;
    }

    if (!isEstudiante()) {
      navigate("/");
      return;
    }

    setNombres(session.nombres || "");
    setApellidos(session.apellidos || "");
    setGrado(session.grado || "");
    setSalon(session.salon || "");

    const fetchBadges = async () => {
      const codigo = session.codigo!;
      const b = { notas: 0, actividades: 0, comunicados: 0, documentos: 0 };

      try {
        const lastSeen = await getAllLastSeen(codigo);
        const minComLastSeen = Math.min(lastSeen['comunicados'] ?? 0, lastSeen['documentos'] ?? 0);

        // Notas: NO se puede usar count en servidor con .gt('fecha_modificacion', isoString)
        // porque Notas.fecha_modificacion no tiene timezone y JS guarda el epoch usando
        // hora local del navegador. SQL lo trataria como UTC y daria offset incorrecto.
        // Mantengo fetch+JS para que la comparacion use la misma logica de timezone.
        const [msgResult, actResult, notasResult] = await Promise.all([
          supabase
            .from('Comunicados')
            .select('id, nivel, grado, salon, codigo_estudiantil, archivo_url, destinatarios, id_destinatarios')
            .overlaps('perfil', ['Estudiantes'])
            .gt('id', minComLastSeen),
          supabase
            .from('Calendario Actividades')
            .select('*', { count: 'exact', head: true })
            .eq('Grado', session.grado)
            .eq('Salon', session.salon)
            .gt('auto_id', lastSeen['actividades'] ?? 0),
          supabase
            .from('Notas')
            .select('fecha_modificacion')
            .eq('codigo_estudiantil', codigo)
            .eq('grado', session.grado)
            .eq('salon', session.salon)
            .not('nombre_actividad', 'in', '("Definitiva Periodo","Definitiva Anual")'),
        ]);

        if (msgResult.data) {
          // MISMA logica de visibilidad que ComunicadosEstudiante/DocumentosEstudiante.
          const norm = (s: string) =>
            s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const nombreNorm = norm(session.nombres || "");
          const apellidosParts = norm(session.apellidos || "").split(/\s+/).filter(p => p.length > 2);

          const misFiltrados = msgResult.data.filter((c: any) => {
            const matchIds =
              (c.id_destinatarios && c.id_destinatarios.length > 0 &&
                c.id_destinatarios.includes(String(codigo))) ||
              (c.codigo_estudiantil && c.codigo_estudiantil === codigo) ||
              (!!codigo && new RegExp(`\\b${String(codigo)}\\b`).test(c.destinatarios || ""));

            const grados = c.grados ?? (c.grado ? [c.grado] : null);
            const salones = c.salones ?? (c.salon ? [c.salon] : null);

            const matchAula =
              (c.nivel || grados || salones) &&
              (!c.nivel || c.nivel === session.nivel) &&
              (!grados || grados.includes(session.grado || "")) &&
              (!salones || salones.includes(session.salon || ""));

            if (matchIds || matchAula) return true;

            const noHayFiltros =
              (!c.id_destinatarios || c.id_destinatarios.length === 0) &&
              !c.codigo_estudiantil && !c.nivel && !grados && !salones;
            if (!noHayFiltros) return false;

            const destLower = (c.destinatarios || "").trim().toLowerCase();
            if (destLower === "estudiantes") return true;
            const destNorm = norm(c.destinatarios || "");
            const hasNombre = nombreNorm.length > 0 && destNorm.includes(nombreNorm);
            const hasApellido = apellidosParts.some(p => destNorm.includes(p));
            return hasNombre && hasApellido;
          });
          b.comunicados = misFiltrados.filter((c: any) => c.id > (lastSeen['comunicados'] ?? 0)).length;
          b.documentos = misFiltrados.filter((c: any) => c.archivo_url && c.id > (lastSeen['documentos'] ?? 0)).length;
        }

        b.actividades = actResult.count ?? 0;

        if (notasResult.data) {
          const notasEpochs = notasResult.data
            .map((n: any) => n.fecha_modificacion ? Math.floor(new Date(n.fecha_modificacion).getTime() / 1000) : 0)
            .filter((e: number) => e > 0);
          b.notas = countNewItems(notasEpochs, lastSeen['notas']);
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
      <HeaderNormy backLink="/dashboard-estudiante" />

      <main className="flex-1 container mx-auto p-8">
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-2xl mx-auto text-center">
          <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-4">
            Bienvenido(a)
          </h2>
          <p className="text-xl text-primary font-semibold">
            {nombres} {apellidos}
          </p>
          <p className="text-muted-foreground mt-2">
            {grado} - {salon}
          </p>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-8 max-w-4xl mx-auto mt-8">
          <h3 className="text-xl font-bold text-foreground mb-6 text-center">
            ¿Qué deseas consultar?
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 max-w-4xl mx-auto">
            <button
              onClick={() => navigate("/estudiante/notas")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-emerald-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-emerald-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-emerald-200"
            >
              <Badge count={badges.notas} />
              <img src={iconNotas} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground">Notas</span>
            </button>

            <button
              onClick={() => navigate("/estudiante/actividades")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-green-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-green-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-green-200"
            >
              <Badge count={badges.actividades} />
              <img src={iconActividades} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Actividades</span>
            </button>

            <button
              onClick={() => navigate("/estudiante/comunicados")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-lime-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-lime-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-lime-200"
            >
              <Badge count={badges.comunicados} />
              <img src={iconComunicados} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Comunicados</span>
            </button>

            <button
              onClick={() => navigate("/estudiante/documentos")}
              className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-cyan-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-cyan-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-cyan-200"
            >
              <Badge count={badges.documentos} />
              <img src={iconDocumentos} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Documentos</span>
            </button>

            <button
              onClick={() => navigate("/estudiante/estadisticas")}
              className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-teal-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-teal-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-teal-200"
            >
              <img src={iconEstadisticas} alt="" className="w-12 h-12 object-contain" />
              <span className="font-semibold text-foreground text-center">Estadísticas</span>
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

export default DashboardEstudiante;
