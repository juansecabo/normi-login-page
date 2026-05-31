import { DistribucionDesempeno } from "@/hooks/useEstadisticas";

interface DistItem {
  rango: string;
  cantidad: number;
  porcentaje?: number;
  color?: string;
}

interface TablaDistribucionProps {
  titulo: string;
  // Formato nuevo (array de rangos del API, multi-escala) o formato viejo
  // (objeto de 4 buckets del hook useEstadisticas).
  distribucion: DistribucionDesempeno | DistItem[];
}

// Paleta de respaldo por si un rango no trae color desde la config.
const COLORES_FALLBACK = ["#16a34a", "#3B82F6", "#F59E0B", "#f97316", "#dc2626"];

// Convierte el formato viejo (objeto de 4 buckets) a un array de rangos para
// poder renderizar todo con el mismo código.
function desdeFormatoViejo(d: DistribucionDesempeno): DistItem[] {
  return [
    { rango: "Superior", cantidad: d.superior, color: "#16a34a" },
    { rango: "Alto", cantidad: d.alto, color: "#3B82F6" },
    { rango: "Básico", cantidad: d.basico, color: "#F59E0B" },
    { rango: "Bajo", cantidad: d.bajo, color: "#dc2626" },
  ];
}

export const TablaDistribucion = ({ titulo, distribucion }: TablaDistribucionProps) => {
  // Normaliza ambos formatos a un array de items. Defensivo: filtra items sin
  // rango (evita el crash `rango.includes` con configs migradas) y los que no
  // tienen cantidad numérica.
  const items: DistItem[] = (Array.isArray(distribucion)
    ? distribucion
    : desdeFormatoViejo(distribucion)
  ).filter((x) => x && typeof x.cantidad === "number");

  const total = items.reduce((s, x) => s + (x.cantidad || 0), 0);

  const calcularPorcentaje = (valor: number) => {
    if (total === 0) return 0;
    return Math.round((valor / total) * 100);
  };

  if (total === 0) {
    return (
      <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
        <h4 className="font-semibold text-foreground mb-4">{titulo}</h4>
        <p className="text-muted-foreground text-sm text-center py-4">
          Aún no hay estudiantes con notas registradas
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-soft p-4 border border-border">
      <h4 className="font-semibold text-foreground mb-4">{titulo}</h4>
      <div className="space-y-3">
        {items.map((item, idx) => {
          const color = item.color || COLORES_FALLBACK[idx % COLORES_FALLBACK.length];
          const pct = calcularPorcentaje(item.cantidad || 0);
          return (
            <div key={`${item.rango}-${idx}`} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-foreground">{item.rango || "Sin nombre"}</span>
                <span className="font-semibold" style={{ color }}>
                  {item.cantidad} ({pct}%)
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div className="h-2.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
        <div className="pt-2 mt-2 border-t border-border">
          <div className="flex justify-between text-sm font-medium">
            <span className="text-foreground">Total estudiantes</span>
            <span className="text-foreground">{total}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
