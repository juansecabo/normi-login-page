import { PromedioEstudiante, PromedioSalon, PromedioGrado, PromedioAsignatura } from "@/hooks/useEstadisticas";
import { useColegioConfig, badgeClassPorNota } from "@/hooks/useColegioConfig";
import { Trophy, Medal, Award } from "lucide-react";

type RankingItem = PromedioEstudiante | PromedioSalon | PromedioGrado | PromedioAsignatura;

interface TablaRankingProps {
  titulo: string;
  datos: RankingItem[];
  tipo: "estudiante" | "salon" | "grado" | "asignatura";
  limite?: number;
  mostrarTodosSinLimite?: boolean;
  ocultarIconosDespuesDe?: number;
}

const getPosicionIcono = (posicion: number, ocultarIconosDespuesDe: number = 3) => {
  if (posicion === 1 && ocultarIconosDespuesDe >= 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
  if (posicion === 2 && ocultarIconosDespuesDe >= 2) return <Medal className="w-5 h-5 text-gray-400" />;
  if (posicion === 3 && ocultarIconosDespuesDe >= 3) return <Award className="w-5 h-5 text-amber-600" />;
  return <span className="w-5 h-5 flex items-center justify-center text-sm font-medium text-muted-foreground">{posicion}</span>;
};

export const TablaRanking = ({
  titulo,
  datos,
  tipo,
  limite = 10,
  mostrarTodosSinLimite = false,
  ocultarIconosDespuesDe = 3
}: TablaRankingProps) => {
  const { config } = useColegioConfig();
  const datosLimitados = mostrarTodosSinLimite ? datos : datos.slice(0, limite);

  if (datosLimitados.length === 0) {
    return (
      <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
        <h4 className="font-semibold text-foreground mb-4">{titulo}</h4>
        <div className="flex items-center justify-center h-[100px] text-muted-foreground">
          No hay datos disponibles
        </div>
      </div>
    );
  }

  const getNombre = (item: RankingItem): string => {
    if (tipo === "estudiante") return (item as PromedioEstudiante).nombre_completo;
    if (tipo === "salon") return `${(item as PromedioSalon).grado} ${(item as PromedioSalon).salon}`;
    if (tipo === "grado") return (item as PromedioGrado).grado;
    return (item as PromedioAsignatura).asignatura;
  };

  const getSubtitulo = (item: RankingItem): string | null => {
    if (tipo === "estudiante") {
      const est = item as PromedioEstudiante;
      return `${est.grado} ${est.salon}`;
    }
    if (tipo === "salon") {
      return `${(item as PromedioSalon).cantidadEstudiantes} estudiantes`;
    }
    if (tipo === "grado") {
      return `${(item as PromedioGrado).cantidadEstudiantes} estudiantes`;
    }
    return `${(item as PromedioAsignatura).cantidadNotas} calificaciones`;
  };

  return (
    <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
      <h4 className="font-semibold text-foreground mb-4">{titulo}</h4>
      <div className="space-y-2">
        {datosLimitados.map((item, index) => (
          <div
            key={index}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex-shrink-0 w-8 flex justify-center">
              {getPosicionIcono(index + 1, ocultarIconosDespuesDe)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground text-sm truncate">
                {getNombre(item)}
              </p>
              {getSubtitulo(item) && (
                <p className="text-xs text-muted-foreground">
                  {getSubtitulo(item)}
                </p>
              )}
            </div>
            <div className={`px-2 py-1 rounded-md text-sm font-semibold ${badgeClassPorNota(item.promedio, config)}`}>
              {item.promedio.toFixed(config.decimales)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
