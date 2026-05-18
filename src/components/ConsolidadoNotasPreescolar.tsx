import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVIDADES_PREESCOLAR } from "@/utils/preescolar";
import { anoEscolarActual } from "@/utils/anoEscolar";

interface ConsolidadoNotasPreescolarProps {
  idEstudiante: string;
  nombreEstudiante: string;
  apellidosEstudiante: string;
  grado: string;
  salon: string;
  /** Si true, oculta el card superior con el nombre del estudiante (útil cuando se embebe en una página que ya lo muestra). */
  ocultarInfoEstudiante?: boolean;
}

// { [periodo]: { [nombre_actividad]: texto } }
type TextosEstudiante = {
  [periodo: number]: {
    [nombreActividad: string]: string;
  };
};

const periodos = [
  { numero: 1, nombre: "1er Periodo" },
  { numero: 2, nombre: "2do Periodo" },
  { numero: 3, nombre: "3er Periodo" },
  { numero: 4, nombre: "4to Periodo" },
];

const ConsolidadoNotasPreescolar = ({
  idEstudiante,
  nombreEstudiante,
  apellidosEstudiante,
  grado,
  salon,
  ocultarInfoEstudiante = false,
}: ConsolidadoNotasPreescolarProps) => {
  const [textos, setTextos] = useState<TextosEstudiante>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!idEstudiante || !grado || !salon) {
      setLoading(false);
      return;
    }

    const cargar = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("Notas")
          .select("periodo, nombre_actividad, comentario")
          .eq("ano_escolar", anoEscolarActual())
          .eq("id_estudiantil", idEstudiante)
          .eq("grado", grado)
          .eq("salon", salon)
          .in("nombre_actividad", ACTIVIDADES_PREESCOLAR.map((a) => a.nombre));

        if (error) {
          console.error("Error cargando textos preescolar:", error);
        } else if (data) {
          const formateados: TextosEstudiante = {};
          data.forEach((n) => {
            if (!n.comentario) return;
            if (!formateados[n.periodo]) formateados[n.periodo] = {};
            formateados[n.periodo][n.nombre_actividad] = n.comentario;
          });
          setTextos(formateados);
        }
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, [idEstudiante, grado, salon]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Cargando informe...</p>
      </div>
    );
  }

  const tienePeriodo = (p: number) => {
    const t = textos[p];
    if (!t) return false;
    return ACTIVIDADES_PREESCOLAR.some((a) => !!t[a.nombre]?.trim());
  };

  return (
    <div className="space-y-6">
      {/* Información del estudiante (solo si no está embebido) */}
      {!ocultarInfoEstudiante && (
        <div className="bg-card rounded-lg shadow-soft p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">
              {apellidosEstudiante} {nombreEstudiante}
            </h2>
            <p className="text-muted-foreground">
              Id: {idEstudiante} | {grado} - {salon}
            </p>
            <p className="mt-2 text-xs text-muted-foreground italic">
              Informe descriptivo de preescolar
            </p>
          </div>
        </div>
      )}

      {/* Un card por periodo */}
      {periodos.map((p) => {
        const textosPeriodo = textos[p.numero] || {};
        const hayAlgo = tienePeriodo(p.numero);

        return (
          <div
            key={p.numero}
            className="bg-card rounded-lg shadow-soft overflow-hidden"
          >
            <div className="bg-primary/10 p-4 border-b border-border">
              <h3 className="text-lg font-bold text-foreground">{p.nombre}</h3>
            </div>

            <div className="p-4 md:p-6 space-y-5">
              {!hayAlgo ? (
                <p className="text-sm text-muted-foreground italic text-center py-6">
                  Aún no hay informe registrado para este periodo.
                </p>
              ) : (
                ACTIVIDADES_PREESCOLAR.map((act) => {
                  const texto = textosPeriodo[act.nombre]?.trim();
                  if (!texto) return null;
                  return (
                    <div key={act.nombre}>
                      <h4 className="text-sm font-semibold text-primary mb-2">
                        {act.nombre}
                      </h4>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {texto}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ConsolidadoNotasPreescolar;
