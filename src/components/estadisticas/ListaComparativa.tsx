import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useColegioConfig, textClassPorNota, bgClassPorNota } from "@/hooks/useColegioConfig";

interface ItemLista {
  nombre: string;
  valor: number;
  extra?: string;
}

interface ListaComparativaProps {
  titulo: string;
  items: ItemLista[];
  tipo?: "mejor" | "peor" | "neutral";
  mostrarPosicion?: boolean;
  icono?: React.ReactNode;
}

export const ListaComparativa = ({
  titulo,
  items,
  tipo = "neutral",
  mostrarPosicion = false,
  icono
}: ListaComparativaProps) => {
  const { config } = useColegioConfig();
  if (items.length === 0) {
    return (
      <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
        <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          {icono}
          {titulo}
        </h4>
        <p className="text-muted-foreground text-sm text-center py-4">
          Aún no hay datos disponibles para esta métrica
        </p>
      </div>
    );
  }

  const getTipoIcon = () => {
    if (tipo === "mejor") return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (tipo === "peor") return <TrendingDown className="w-4 h-4 text-red-500" />;
    return null;
  };

  return (
    <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
      <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        {icono || getTipoIcon()}
        {titulo}
      </h4>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`flex justify-between items-center p-2.5 rounded-lg ${bgClassPorNota(item.valor, config)}`}
          >
            <div className="flex items-center gap-2">
              {mostrarPosicion && (
                <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {idx + 1}
                </span>
              )}
              <div>
                <span className="text-sm font-medium text-foreground">{item.nombre}</span>
                {item.extra && (
                  <p className="text-xs text-muted-foreground">{item.extra}</p>
                )}
              </div>
            </div>
            <span className={`text-sm font-bold ${textClassPorNota(item.valor, config)}`}>
              {item.valor.toFixed(config.decimales)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
