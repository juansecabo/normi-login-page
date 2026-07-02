import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBienvenida, getSession, isEstudiante } from "@/hooks/useSession";
import { usePendientesFirma } from "@/hooks/usePendientesFirma";
import iconNotas from "@/assets/icons/notas.webp";
import iconPerfil from "@/assets/icons/perfil.png";
import iconActividades from "@/assets/icons/actividades.webp";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconComunicados from "@/assets/icons/comunicados.webp";
import iconDocumentos from "@/assets/icons/documentos.webp";
import iconConsultas from "@/assets/icons/consultas.png";
import iconAsistencia from "@/assets/icons/asistencia.webp";
import HeaderNormi from "@/components/HeaderNormi";
import EncabezadoColegio from "@/components/EncabezadoColegio";
import AvatarUploader from "@/components/AvatarUploader";
import BuzonSugerencias from "@/components/BuzonSugerencias";
import ReordenableDashboard, { type ReordItem } from "@/components/ReordenableDashboard";
import { supabase } from "@/integrations/supabase/client";
import { getAllLastSeen, countNewItems } from "@/utils/notificaciones";
import { anoEscolarActual } from "@/utils/anoEscolar";

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
  const saludo = useBienvenida();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [badges, setBadges] = useState({ notas: 0, actividades: 0, comunicados: 0, documentos: 0 });
  const pendFirma = usePendientesFirma();

  useEffect(() => {
    const session = getSession();

    if (!session.id) {
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
      const id = session.id!;
      const b = { notas: 0, actividades: 0, comunicados: 0, documentos: 0 };

      try {
        const lastSeen = await getAllLastSeen(id);
        const minComLastSeen = Math.min(lastSeen['comunicados'] ?? 0, lastSeen['documentos'] ?? 0);

        // Notas: NO se puede usar count en servidor con .gt('fecha_modificacion', isoString)
        // porque Notas.fecha_modificacion no tiene timezone y JS guarda el epoch usando
        // hora local del navegador. SQL lo trataria como UTC y daria offset incorrecto.
        // Mantengo fetch+JS para que la comparacion use la misma logica de timezone.
        const [msgResult, actResult, notasResult] = await Promise.all([
          supabase
            .from('Comunicados')
            .select('id, nivel, grado, salon, grados, salones, id_estudiantil, archivo_url, destinatarios, id_destinatarios')
            .overlaps('perfil', ['Estudiantes'])
            .gt('id', minComLastSeen),
          supabase
            .from('Calendario Actividades')
            .select('auto_id, estudiantes_ids')
            .eq('Grado', session.grado)
            .eq('Salon', session.salon)
            .gt('auto_id', lastSeen['actividades'] ?? 0),
          supabase
            .from('Notas')
            .select('fecha_modificacion')
            .eq('ano_escolar', anoEscolarActual())
            .eq('id_estudiantil', id)
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
                c.id_destinatarios.includes(String(id))) ||
              (c.id_estudiantil && c.id_estudiantil === id) ||
              (!!id && new RegExp(`\\b${String(id)}\\b`).test(c.destinatarios || ""));

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
              !c.id_estudiantil && !c.nivel && !grados && !salones;
            if (!noHayFiltros) return false;

            const destLower = (c.destinatarios || "").trim().toLowerCase();
            if (destLower === "estudiantes") return true;
            const destNorm = norm(c.destinatarios || "");
            const hasNombre = nombreNorm.length > 0 && destNorm.includes(nombreNorm);
            const hasApellido = apellidosParts.some(p => destNorm.includes(p));
            return hasNombre && hasApellido;
          });
          // Dedup por grupo_comunicado_id antes de contar badges
          const seen = new Set<number>();
          const dedup = misFiltrados.filter((c: any) => {
            const key = c.grupo_comunicado_id ?? c.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          b.comunicados = dedup.filter((c: any) => c.id > (lastSeen['comunicados'] ?? 0)).length;
          b.documentos = dedup.filter((c: any) => c.archivo_url && c.id > (lastSeen['documentos'] ?? 0)).length;
        }

        // #25: contar solo las actividades que le aplican (todo el salón o dirigidas a él).
        b.actividades = ((actResult.data as any[]) || []).filter((a) => {
          const e = a.estudiantes_ids as (number | string)[] | null;
          return !e || e.length === 0 || e.map(String).includes(String(id));
        }).length;

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

  const items: ReordItem[] = [
    { id: 'notas', render: (
      <button onClick={() => navigate("/estudiante/notas")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-emerald-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-emerald-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-emerald-200">
        <Badge count={badges.notas} />
        <img src={iconNotas} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground">Notas</span>
      </button>
    ) },
    { id: 'actividades', render: (
      <button onClick={() => navigate("/estudiante/actividades")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-green-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-green-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-green-200">
        <Badge count={badges.actividades} />
        <img src={iconActividades} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Actividades</span>
      </button>
    ) },
    { id: 'comunicados', render: (
      <button onClick={() => navigate("/estudiante/comunicados")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-lime-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-lime-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-lime-200">
        <Badge count={badges.comunicados} />
        <img src={iconComunicados} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Comunicados</span>
      </button>
    ) },
    { id: 'documentos', render: (
      <button onClick={() => navigate("/estudiante/documentos")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-cyan-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-cyan-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-cyan-200">
        <Badge count={badges.documentos} />
        <img src={iconDocumentos} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Documentos</span>
      </button>
    ) },
    { id: 'estadisticas', render: (
      <button onClick={() => navigate("/estudiante/estadisticas")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-teal-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-teal-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-teal-200">
        <img src={iconEstadisticas} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Estadísticas</span>
      </button>
    ) },
    { id: 'consultas', render: (
      <button onClick={() => navigate("/estudiante/consultas")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-pink-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-pink-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-pink-200">
        <img src={iconConsultas} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Consultas</span>
      </button>
    ) },
    { id: 'comunicados-firma', render: (
      <button onClick={() => navigate("/comunicados-firma")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-violet-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-violet-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-violet-200">
        <Badge count={pendFirma} />
        <img src={iconConsultas} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Comunicados con firma</span>
      </button>
    ) },
    { id: 'asistencia', render: (
      <button onClick={() => navigate("/asistencia")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-blue-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-blue-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-blue-200">
        <img src={iconAsistencia} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Asistencia</span>
      </button>
    ) },
    { id: 'perfil', render: (
      <button onClick={() => navigate("/perfil")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-sky-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-sky-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-sky-200">
        <img src={iconPerfil} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Perfil</span>
      </button>
    ) },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard-estudiante" />

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
              {grado} {salon}
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
            dashboardKey="estudiante"
            gridClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6"
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

export default DashboardEstudiante;
