import { DistribucionDesempeno } from "@/hooks/useEstadisticas";

interface DistItem {
  rango: string;
  cantidad: number;
  porcentaje?: number;
}

interface TablaDistribucionProps {
  titulo: string;
  // Formato viejo (hook useEstadisticas) o nuevo (endpoint API)
  distribucion: DistribucionDesempeno | DistItem[];
}

// Convierte el formato nuevo (array de 5 rangos del API) al viejo (4 buckets).
function normalize(d: DistribucionDesempeno | DistItem[]): DistribucionDesempeno {
  if (!Array.isArray(d)) return d;
  const get = (label: string) => d.find((x) => x.rango.includes(label))?.cantidad || 0;
  return {
    superior: get("Excelente"),
    alto: get("Sobresaliente"),
    basico: get("Aceptable"),
    // Bajo = Insuficiente + Deficiente
    bajo: get("Insuficiente") + get("Deficiente"),
  };
}

export const TablaDistribucion = ({ titulo, distribucion }: TablaDistribucionProps) => {
  const dist = normalize(distribucion);
  const total = dist.bajo + dist.basico + dist.alto + dist.superior;

  const calcularPorcentaje = (valor: number) => {
    if (total === 0) return 0;
    return Math.round((valor / total) * 100);
  };

  const niveles = [
    { nombre: "Superior (4.5 - 5.0)", valor: dist.superior, color: "bg-green-500", textColor: "text-green-700" },
    { nombre: "Alto (4.0 - 4.4)", valor: dist.alto, color: "bg-blue-500", textColor: "text-blue-700" },
    { nombre: "Básico (3.0 - 3.9)", valor: dist.basico, color: "bg-amber-500", textColor: "text-amber-700" },
    { nombre: "Bajo (0 - 2.9)", valor: dist.bajo, color: "bg-red-500", textColor: "text-red-700" },
  ];

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
        {niveles.map((nivel, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-foreground">{nivel.nombre}</span>
              <span className={`font-semibold ${nivel.textColor}`}>
                {nivel.valor} ({calcularPorcentaje(nivel.valor)}%)
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full ${nivel.color}`}
                style={{ width: `${calcularPorcentaje(nivel.valor)}%` }}
              />
            </div>
          </div>
        ))}
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
