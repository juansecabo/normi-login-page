import { useMemo } from "react";
import { useColegioConfig, colorBucket4, ColegioConfig } from "@/hooks/useColegioConfig";

interface DatoCalor {
  estudiante: string;
  [asignatura: string]: string | number;
}

interface TablaCalorProps {
  titulo: string;
  datos: DatoCalor[];
  asignaturas: string[];
  altura?: number;
}

const getColorPorNota = (nota: number, cfg: ColegioConfig): string => {
  if (nota === 0) return "bg-gray-100 text-gray-400";
  const b = colorBucket4(nota, cfg);
  if (b === "success") return "bg-green-100 text-green-700";
  if (b === "blue") return "bg-blue-100 text-blue-700";
  if (b === "warning") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
};

export const TablaCalor = ({
  titulo,
  datos,
  asignaturas,
  altura = 400
}: TablaCalorProps) => {
  const { config } = useColegioConfig();
  const asignaturasCortas = useMemo(() => {
    return asignaturas.map(m => {
      if (m.length > 12) {
        return m.substring(0, 10) + "...";
      }
      return m;
    });
  }, [asignaturas]);

  if (datos.length === 0 || asignaturas.length === 0) {
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

      {/* Leyenda — bandas del config del colegio */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        {config.rangos_desempeno.map((r) => {
          const bg = colorBucket4((r.min + r.max) / 2, config);
          const bgClass = bg === "success" ? "bg-green-100"
            : bg === "blue" ? "bg-blue-100"
            : bg === "warning" ? "bg-amber-100"
            : "bg-red-100";
          return (
            <span key={r.label} className="flex items-center gap-1">
              <span className={`w-4 h-4 ${bgClass} rounded`}></span>
              <span className="text-muted-foreground">{r.label} ({r.min.toFixed(config.decimales)}-{r.max.toFixed(config.decimales)})</span>
            </span>
          );
        })}
      </div>

      <div className="overflow-auto" style={{ maxHeight: altura }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr>
              <th className="text-left p-1 font-medium text-muted-foreground border-b min-w-[120px]">
                Estudiante
              </th>
              {asignaturasCortas.map((mat, idx) => (
                <th
                  key={idx}
                  className="text-center p-1 font-medium text-muted-foreground border-b min-w-[50px]"
                  title={asignaturas[idx]}
                >
                  {mat}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.map((fila, idx) => (
              <tr key={idx} className="hover:bg-muted/50">
                <td className="p-1 font-medium text-foreground border-b truncate max-w-[150px]" title={fila.estudiante}>
                  {fila.estudiante}
                </td>
                {asignaturas.map((mat, matIdx) => {
                  const nota = typeof fila[mat] === "number" ? fila[mat] as number : 0;
                  return (
                    <td
                      key={matIdx}
                      className={`text-center p-1 border-b font-medium ${getColorPorNota(nota, config)}`}
                    >
                      {nota > 0 ? nota.toFixed(config.decimales) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
