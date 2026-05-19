import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useColegioConfig, hexPorNota } from "@/hooks/useColegioConfig";

interface DataItem {
  nombre: string;
  valor: number;
  [key: string]: string | number;
}

interface GraficoBarrasProps {
  titulo: string;
  datos: DataItem[];
  dataKey?: string;
  horizontal?: boolean;
  mostrarColoresPorRendimiento?: boolean;
  altura?: number;
}

export const GraficoBarras = ({
  titulo,
  datos,
  dataKey = "valor",
  horizontal = false,
  mostrarColoresPorRendimiento = true,
  altura = 300
}: GraficoBarrasProps) => {
  const { config } = useColegioConfig();
  if (datos.length === 0) {
    return (
      <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
        <h4 className="font-semibold text-foreground mb-4">{titulo}</h4>
        <div className="flex items-center justify-center h-[200px] text-muted-foreground">
          No hay datos disponibles
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
      <h4 className="font-semibold text-foreground mb-4">{titulo}</h4>
      <ResponsiveContainer width="100%" height={altura}>
        {horizontal ? (
          <BarChart data={datos} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" domain={[config.escala_min, config.escala_max]} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={75} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [value.toFixed(config.decimales), "Promedio"]}
            />
            <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
              {datos.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={mostrarColoresPorRendimiento ? hexPorNota(entry.valor, config) : "#16a34a"}
                />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={datos} margin={{ top: 5, right: 30, left: 20, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="nombre"
              tick={{ fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis domain={[config.escala_min, config.escala_max]} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [value.toFixed(config.decimales), "Promedio"]}
            />
            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
              {datos.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={mostrarColoresPorRendimiento ? hexPorNota(entry.valor, config) : "#16a34a"}
                />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};
