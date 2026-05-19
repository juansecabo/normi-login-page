import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useColegioConfig, textClassPorNota } from "@/hooks/useColegioConfig";

interface DatoPeriodo {
  periodo: string;
  promedio: number;
}

interface TablaEvolucionProps {
  titulo: string;
  datos: DatoPeriodo[];
  nombreEntidad?: string;
}

export const TablaEvolucion = ({ titulo, datos, nombreEntidad }: TablaEvolucionProps) => {
  const { config } = useColegioConfig();
  const datosConCambio = datos.map((d, idx) => {
    const anterior = idx > 0 ? datos[idx - 1].promedio : null;
    const cambio = anterior !== null && anterior > 0 ? d.promedio - anterior : null;
    return { ...d, cambio };
  });

  const getColorPorRendimiento = (valor: number): string => {
    if (valor === 0) return "text-muted-foreground";
    return textClassPorNota(valor, config);
  };

  const datosConValor = datos.filter(d => d.promedio > 0);

  if (datosConValor.length === 0) {
    return (
      <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
        <h4 className="font-semibold text-foreground mb-4">{titulo}</h4>
        <p className="text-muted-foreground text-sm text-center py-4">
          Aún no hay datos de evolución disponibles
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
      <h4 className="font-semibold text-foreground mb-4">{titulo}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2 font-medium text-muted-foreground">Período</th>
              <th className="text-center p-2 font-medium text-muted-foreground">Promedio</th>
              <th className="text-center p-2 font-medium text-muted-foreground">Cambio</th>
            </tr>
          </thead>
          <tbody>
            {datosConCambio.map((d, idx) => (
              <tr key={idx} className="border-b hover:bg-muted/50">
                <td className="p-2 font-medium">{d.periodo}</td>
                <td className={`text-center p-2 font-bold ${getColorPorRendimiento(d.promedio)}`}>
                  {d.promedio > 0 ? d.promedio.toFixed(config.decimales) : "—"}
                </td>
                <td className="text-center p-2">
                  {d.cambio !== null && d.promedio > 0 ? (
                    <span className={`flex items-center justify-center gap-1 ${
                      d.cambio > 0 ? 'text-green-600' : d.cambio < 0 ? 'text-red-600' : 'text-muted-foreground'
                    }`}>
                      {d.cambio > 0 ? <TrendingUp className="w-4 h-4" /> : 
                       d.cambio < 0 ? <TrendingDown className="w-4 h-4" /> : 
                       <Minus className="w-4 h-4" />}
                      {d.cambio !== 0 && (
                        <span className="font-medium">
                          {d.cambio > 0 ? "+" : ""}{d.cambio.toFixed(config.decimales)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
