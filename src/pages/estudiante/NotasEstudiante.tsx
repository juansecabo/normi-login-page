import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, isEstudiante } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import ConsolidadoNotas from "@/components/ConsolidadoNotas";
import { supabase } from "@/integrations/supabase/client";
import { markLastSeen } from "@/utils/notificaciones";
import { anoEscolarActual } from "@/utils/anoEscolar";

const PERIODO_LABEL = ["", "1er Periodo", "2do Periodo", "3er Periodo", "4to Periodo"];

const NotasEstudiante = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const periodoParam = searchParams.get("periodo");
  const periodoNum = periodoParam && /^[1-4]$/.test(periodoParam) ? Number(periodoParam) : null;
  const limpiarPeriodo = () => {
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete("periodo"); return p; });
  };

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isEstudiante()) {
      navigate("/");
      return;
    }

    const marcarVisto = async () => {
      const { data } = await supabase
        .from('Notas')
        .select('fecha_modificacion')
        .eq('ano_escolar', anoEscolarActual())
        .eq('id_estudiantil', session.id)
        .eq('grado', session.grado)
        .eq('salon', session.salon)
        .not('nombre_actividad', 'in', '("Definitiva Periodo","Definitiva Anual")');
      if (data) {
        const epochs = data.map((n: any) => n.fecha_modificacion ? Math.floor(new Date(n.fecha_modificacion).getTime() / 1000) : 0).filter((e: number) => e > 0);
        const maxEpoch = epochs.length > 0 ? Math.max(...epochs) : 0;
        await markLastSeen('notas', session.id!, maxEpoch);
      }
    };
    marcarVisto();
  }, [navigate]);

  const session = getSession();
  if (!session.id || !isEstudiante()) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">&rarr;</span>
            {periodoNum ? (
              <>
                <button onClick={limpiarPeriodo} className="text-primary hover:underline">Notas</button>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="text-foreground font-medium">{PERIODO_LABEL[periodoNum]}</span>
              </>
            ) : (
              <span className="text-foreground font-medium">Notas</span>
            )}
          </div>
        </div>

        <ConsolidadoNotas
          idEstudiante={session.id}
          nombreEstudiante={session.nombres || ''}
          apellidosEstudiante={session.apellidos || ''}
          grado={session.grado || ''}
          salon={session.salon || ''}
        />
      </main>
    </div>
  );
};

export default NotasEstudiante;
