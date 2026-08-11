import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBienvenida, getSession, isPadreDeFamilia, AcudidoData } from "@/hooks/useSession";
import { usePendientesFirma } from "@/hooks/usePendientesFirma";
import iconNotas from "@/assets/icons/notas.webp";
import iconCalendario from "@/assets/icons/calendario.webp";
import iconPerfil from "@/assets/icons/perfil.png";
import iconActividades from "@/assets/icons/actividades.webp";
import iconPermisos from "@/assets/icons/permisos-y-excusas.webp";
import iconEntrevista from "@/assets/icons/entrevista.webp";
import iconConsultas from "@/assets/icons/consultas.png";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconComunicados from "@/assets/icons/comunicados.webp";
import iconDocumentos from "@/assets/icons/documentos.webp";
import iconAsistencia from "@/assets/icons/asistencia.webp";
import iconObservador from "@/assets/icons/observador.webp";
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

const DashboardAcudiente = () => {
  const navigate = useNavigate();
  const saludo = useBienvenida();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [acudidos, setAcudidos] = useState<AcudidoData[]>([]);
  const [badges, setBadges] = useState({ notas: 0, actividades: 0, comunicados: 0, documentos: 0, observador: 0 });
  const pendFirma = usePendientesFirma();

  // Badge del Observador Estudiantil: nº de observaciones nuevas desde la última
  // vez que el acudiente entró (piloto: solo colegio de prueba).
  useEffect(() => {
    const s = getSession();
    if (!s.id) return;
    (async () => {
      const [{ data: obs }, { data: lecs }] = await Promise.all([
        supabase.from("Observador_Estudiantil").select("estudiante_id, created_at"),
        supabase.from("Observador_Lecturas").select("estudiante_id, ultima_lectura").eq("acudiente_id", s.id),
      ]);
      const lastByEst: Record<number, number> = {};
      (lecs || []).forEach((l: any) => { lastByEst[Number(l.estudiante_id)] = new Date(l.ultima_lectura).getTime(); });
      const count = (obs || []).filter((o: any) => new Date(o.created_at).getTime() > (lastByEst[Number(o.estudiante_id)] || 0)).length;
      setBadges(b => ({ ...b, observador: count }));
    })();
  }, []);

  useEffect(() => {
    const session = getSession();

    if (!session.id) {
      navigate("/");
      return;
    }

    if (!isPadreDeFamilia()) {
      navigate("/");
      return;
    }

    setNombres(session.nombres || "");
    setApellidos(session.apellidos || "");
    setAcudidos(session.acudidos || []);

    // Si solo tiene un acudido, auto-seleccionar en localStorage para las páginas internas
    if (session.acudidos && session.acudidos.length === 1) {
      localStorage.setItem("acudidoSeleccionado", JSON.stringify(session.acudidos[0]));
    }

    const fetchBadges = async () => {
      const id = session.id!;
      const acudidosData = session.acudidos || [];
      const b = { notas: 0, actividades: 0, comunicados: 0, documentos: 0 };

      try {
        // Paso 1: lastSeen del acudiente y de cada acudido, en paralelo.
        const [lastSeenPadre, ...lastSeenAcudidos] = await Promise.all([
          getAllLastSeen(id),
          ...acudidosData.map(h => getAllLastSeen(h.id)),
        ]);

        // Paso 2: queries de datos en paralelo (count puro o filas nuevas via .gt).
        const minComLastSeen = Math.min(lastSeenPadre['comunicados'] ?? 0, lastSeenPadre['documentos'] ?? 0);
        const [msgRes, ...acudidosResults] = await Promise.all([
          supabase
            .from('Comunicados')
            .select('id, nivel, grado, salon, grados, salones, id_estudiantil, archivo_url, destinatarios, id_destinatarios')
            .overlaps('perfil', ['Acudientes'])
            .gt('id', minComLastSeen),
          ...acudidosData.flatMap((acudido, i) => [
            supabase
              .from('Calendario Actividades')
              .select('auto_id, estudiantes_ids')
              .eq('Grado', acudido.grado)
              .eq('Salon', acudido.salon)
              .gt('auto_id', lastSeenAcudidos[i]['actividades'] ?? 0),
            // Notas: fetch+JS (ver explicacion en DashboardEstudiante.tsx).
            supabase
              .from('Notas')
              .select('fecha_modificacion')
              .eq('ano_escolar', anoEscolarActual())
              .eq('id_estudiantil', acudido.id)
              .eq('grado', acudido.grado)
              .eq('salon', acudido.salon)
              .not('nombre_actividad', 'in', '("Definitiva Periodo","Definitiva Anual")'),
          ]),
        ]);

        if (msgRes.data) {
          // MISMA logica de visibilidad que ComunicadosPadre/DocumentosPadre.
          const norm = (s: string) =>
            s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

          const filtrados = msgRes.data.filter((c: any) => {
            const matchIds =
              (c.id_destinatarios && c.id_destinatarios.length > 0 &&
                acudidosData.some(h => c.id_destinatarios.includes(String(h.id)))) ||
              (c.id_estudiantil && acudidosData.some(h => h.id === c.id_estudiantil)) ||
              acudidosData.some(h => {
                if (!h.id) return false;
                const cod = String(h.id);
                return new RegExp(`\\b${cod}\\b`).test(c.destinatarios || "");
              });

            const grados = c.grados ?? (c.grado ? [c.grado] : null);
            const salones = c.salones ?? (c.salon ? [c.salon] : null);

            const matchAula =
              (c.nivel || grados || salones) &&
              acudidosData.some(h => {
                if (c.nivel && c.nivel !== h.nivel) return false;
                if (grados && !grados.includes(h.grado)) return false;
                if (salones && !salones.includes(h.salon)) return false;
                return true;
              });

            if (matchIds || matchAula) return true;

            const noHayFiltros =
              (!c.id_destinatarios || c.id_destinatarios.length === 0) &&
              !c.id_estudiantil && !c.nivel && !grados && !salones;
            if (!noHayFiltros) return false;

            const destLower = (c.destinatarios || "").trim().toLowerCase();
            if (destLower === "acudientes") return true;
            const destNorm = norm(c.destinatarios || "");
            return acudidosData.some(h => {
              if (!h.nombre || !h.apellidos) return false;
              const nombreNorm = norm(h.nombre);
              const apellidosParts = norm(h.apellidos).split(/\s+/).filter(p => p.length > 2);
              const hasNombre = nombreNorm.length > 0 && destNorm.includes(nombreNorm);
              const hasApellido = apellidosParts.some(p => destNorm.includes(p));
              return hasNombre && hasApellido;
            });
          });
          // Dedup por grupo_comunicado_id antes de contar badges
          const seen = new Set<number>();
          const dedup = filtrados.filter((c: any) => {
            const key = c.grupo_comunicado_id ?? c.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          b.comunicados = dedup.filter((c: any) => c.id > (lastSeenPadre['comunicados'] ?? 0)).length;
          b.documentos = dedup.filter((c: any) => c.archivo_url && c.id > (lastSeenPadre['documentos'] ?? 0)).length;
        }

        // Cada acudido aportó 2 entradas: actResult, notasResult.
        for (let i = 0; i < acudidosData.length; i++) {
          const actResult = acudidosResults[i * 2] as any;
          const notasResult = acudidosResults[i * 2 + 1] as any;
          // #25: contar solo las actividades que le aplican a ESTE acudido.
          const mid = String(acudidosData[i].id);
          b.actividades += ((actResult.data as any[]) || []).filter((a) => {
            const e = a.estudiantes_ids as (number | string)[] | null;
            return !e || e.length === 0 || e.map(String).includes(mid);
          }).length;

          if (notasResult.data) {
            const notasEpochs = notasResult.data
              .map((n: any) => n.fecha_modificacion ? Math.floor(new Date(n.fecha_modificacion).getTime() / 1000) : 0)
              .filter((e: number) => e > 0);
            b.notas += countNewItems(notasEpochs, lastSeenAcudidos[i]['notas']);
          }
        }
      } catch (err) {
        console.error('Error fetching badges:', err);
      }

      // Merge (no reemplazo total): así no se pierde el badge del observador
      // que calcula el otro efecto.
      setBadges(prev => ({ ...prev, ...b }));
    };

    fetchBadges();
  }, [navigate]);

  const items: ReordItem[] = [
    { id: 'notas', render: (
      <button onClick={() => navigate("/acudiente/notas")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-emerald-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-emerald-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-emerald-200">
        <Badge count={badges.notas} />
        <img src={iconNotas} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground">Notas</span>
      </button>
    ) },
    { id: 'observador', render: (
      <button onClick={() => navigate("/observador-estudiantil")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-sky-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-sky-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-sky-200">
        <Badge count={badges.observador} />
        <img src={iconObservador} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Observador Estudiantil</span>
      </button>
    ) },
    { id: 'actividades', render: (
      <button onClick={() => navigate("/acudiente/actividades")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-green-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-green-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-green-200">
        <Badge count={badges.actividades} />
        <img src={iconActividades} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Actividades</span>
      </button>
    ) },
    { id: 'calendario-escolar', render: (
      <button onClick={() => navigate("/calendario-escolar")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-indigo-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-indigo-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-indigo-200">
        <img src={iconCalendario} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Calendario</span>
      </button>
    ) },
    { id: 'comunicados', render: (
      <button onClick={() => navigate("/acudiente/comunicados")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-lime-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-lime-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-lime-200">
        <Badge count={badges.comunicados} />
        <img src={iconComunicados} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Comunicados</span>
      </button>
    ) },
    { id: 'documentos', render: (
      <button onClick={() => navigate("/acudiente/documentos")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-cyan-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-cyan-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-cyan-200">
        <Badge count={badges.documentos} />
        <img src={iconDocumentos} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Documentos</span>
      </button>
    ) },
    { id: 'permisos-excusas', render: (
      <button onClick={() => navigate("/permisos-excusas")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-rose-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-rose-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-rose-200">
        <img src={iconPermisos} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Permisos y Excusas</span>
      </button>
    ) },
    { id: 'solicitud-entrevista', render: (
      <button onClick={() => navigate("/solicitud-entrevista")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-indigo-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-indigo-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-indigo-200">
        <img src={iconEntrevista} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Solicitud de Entrevista</span>
      </button>
    ) },
    { id: 'estadisticas', render: (
      <button onClick={() => navigate("/acudiente/estadisticas")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-teal-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-teal-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-teal-200">
        <img src={iconEstadisticas} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Estadísticas</span>
      </button>
    ) },
    { id: 'consultas', render: (
      <button onClick={() => navigate("/acudiente/consultas")} className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-pink-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-pink-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-pink-200">
        <img src={iconConsultas} alt="" className="w-16 h-16 object-contain" />
        <span className="font-semibold text-foreground text-center">Consultas</span>
      </button>
    ) },
    { id: 'comunicados-firma', render: (
      <button onClick={() => navigate("/comunicados-firma")} className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 rounded-lg bg-violet-100 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-violet-200 transition-all duration-200 hover:shadow-[0_6px_16px_rgba(0,0,0,0.2)] hover:scale-[1.03] hover:bg-violet-200">
        <Badge count={pendFirma} />
        <img src={iconComunicados} alt="" className="w-16 h-16 object-contain" />
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
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-8">
        <EncabezadoColegio />
        <div className="relative max-w-2xl mx-auto">
          <div className="bg-card rounded-lg shadow-soft p-5 text-center">
            <h2 className="text-lg font-bold text-foreground mb-1">
              {saludo}
            </h2>
            <p className="text-xl text-primary font-semibold">
              {`${nombres} ${apellidos}`.trim()}
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-1">
              Acudiente de
            </p>
            <div className="space-y-0.5">
              {acudidos.map(h => (
                <p key={h.id} className="text-sm text-foreground">
                  {h.nombre} {h.apellidos} <span className="text-muted-foreground">({h.grado} {h.salon})</span>
                </p>
              ))}
            </div>
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
            dashboardKey="acudiente"
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

export default DashboardAcudiente;
