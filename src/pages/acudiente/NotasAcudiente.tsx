import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, isPadreDeFamilia, AcudidoData } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import ConsolidadoNotas from "@/components/ConsolidadoNotas";
import { supabase } from "@/integrations/supabase/client";
import { markLastSeen, getAllLastSeen, countNewItems } from "@/utils/notificaciones";
import { anoEscolarActual } from "@/utils/anoEscolar";
import { User } from "lucide-react";

const PERIODO_LABEL = ["", "1er Periodo", "2do Periodo", "3er Periodo", "4to Periodo"];

const NotasAcudiente = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [acudidos, setAcudidos] = useState<AcudidoData[]>([]);
  const [badgesPorAcudido, setBadgesPorAcudido] = useState<Record<string, number>>({});

  // El hijo elegido y el periodo viven en la URL (?acudido=&periodo=) para
  // persistir al refrescar y verse en el breadcrumb.
  const acudidoId = searchParams.get("acudido");
  const acudido: AcudidoData | null =
    acudidos.find((a) => String(a.id) === String(acudidoId)) ||
    (acudidos.length === 1 ? acudidos[0] : null);
  const periodoParam = searchParams.get("periodo");
  const periodoNum = periodoParam && /^[1-4]$/.test(periodoParam) ? Number(periodoParam) : null;

  const volverAEscoger = () => {
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete("acudido"); p.delete("periodo"); return p; });
  };
  const limpiarPeriodo = () => {
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete("periodo"); return p; });
  };

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isPadreDeFamilia()) {
      navigate("/");
      return;
    }

    const acudidosData = session.acudidos || [];
    setAcudidos(acudidosData);

    if (acudidosData.length > 1) {
      // Calcular badges por acudido — todas las queries en paralelo.
      const fetchBadges = async () => {
        const results = await Promise.all(acudidosData.map(async (h) => {
          const [lastSeen, { data }] = await Promise.all([
            getAllLastSeen(h.id),
            supabase
              .from('Notas')
              .select('fecha_modificacion')
              .eq('ano_escolar', anoEscolarActual())
              .eq('id_estudiantil', h.id)
              .eq('grado', h.grado)
              .eq('salon', h.salon)
              .not('nombre_actividad', 'in', '("Definitiva Periodo","Definitiva Anual")'),
          ]);
          if (!data) return [h.id, 0] as const;
          const epochs = data.map((n: any) => n.fecha_modificacion ? Math.floor(new Date(n.fecha_modificacion).getTime() / 1000) : 0).filter((e: number) => e > 0);
          return [h.id, countNewItems(epochs, lastSeen['notas'])] as const;
        }));
        const b: Record<string, number> = {};
        results.forEach(([id, count]) => { b[id] = count; });
        setBadgesPorAcudido(b);
      };
      fetchBadges();
    }
  }, [navigate]);

  // Al tener un hijo activo, marcar sus notas como vistas (badge a 0).
  useEffect(() => {
    if (!acudido) return;
    const h = acudido;
    (async () => {
      const { data } = await supabase
        .from('Notas')
        .select('fecha_modificacion')
        .eq('ano_escolar', anoEscolarActual())
        .eq('id_estudiantil', h.id)
        .eq('grado', h.grado)
        .eq('salon', h.salon)
        .not('nombre_actividad', 'in', '("Definitiva Periodo","Definitiva Anual")');
      if (data) {
        const epochs = data.map((n: any) => n.fecha_modificacion ? Math.floor(new Date(n.fecha_modificacion).getTime() / 1000) : 0).filter((e: number) => e > 0);
        const maxEpoch = epochs.length > 0 ? Math.max(...epochs) : 0;
        await markLastSeen('notas', h.id, maxEpoch);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acudido?.id]);

  // Elegir un hijo → va a la URL (y se limpia el periodo para que lo escoja).
  const seleccionar = (h: AcudidoData) => {
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set("acudido", String(h.id)); p.delete("periodo"); return p; });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">&rarr;</span>
            {acudido && acudidos.length > 1 && (
              <>
                <button onClick={volverAEscoger} className="text-primary hover:underline">
                  Escoger Estudiante
                </button>
                <span className="text-muted-foreground">&rarr;</span>
              </>
            )}
            {periodoNum && acudido ? (
              <>
                <button onClick={limpiarPeriodo} className="text-primary hover:underline">
                  Notas{acudido ? ` de ${acudido.nombre}` : ''}
                </button>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="text-foreground font-medium">{PERIODO_LABEL[periodoNum]}</span>
              </>
            ) : (
              <span className="text-foreground font-medium">Notas{acudido ? ` de ${acudido.nombre}` : ''}</span>
            )}
          </div>
        </div>

        {!acudido && acudidos.length > 1 && (
          <div className="bg-card rounded-lg shadow-soft p-6 mb-6">
            <h3 className="text-lg font-bold text-foreground mb-4 text-center">
              Selecciona un estudiante
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {acudidos.map((h) => (
                <button
                  key={h.id}
                  data-guia="acu.item_acudido"
                  onClick={() => seleccionar(h)}
                  className="relative flex items-center gap-3 p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-muted/50 transition-all duration-200 text-left"
                >
                  {(badgesPorAcudido[h.id] || 0) > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm animate-badge-pop">
                      {badgesPorAcudido[h.id]}
                    </span>
                  )}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{h.nombre} {h.apellidos}</p>
                    <p className="text-sm text-muted-foreground">{h.grado} {h.salon}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {acudido && (
          <>
            <ConsolidadoNotas
              idEstudiante={acudido.id}
              nombreEstudiante={acudido.nombre}
              apellidosEstudiante={acudido.apellidos}
              grado={acudido.grado}
              salon={acudido.salon}
            />
          </>
        )}
      </main>
    </div>
  );
};

export default NotasAcudiente;
