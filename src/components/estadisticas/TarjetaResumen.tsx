import { LucideIcon } from "lucide-react";

interface TarjetaResumenProps {
  titulo: string;
  valor: string | number;
  subtitulo?: string;
  icono: LucideIcon;
  color?: "primary" | "success" | "warning" | "danger" | "blue";
  onClick?: () => void;
  dataGuia?: string;
}

const colorClasses = {
  primary: "bg-primary/10 text-primary",
  success: "bg-green-100 text-green-600",
  blue: "bg-blue-100 text-blue-600",
  warning: "bg-amber-100 text-amber-600",
  danger: "bg-red-100 text-red-600"
};

export const TarjetaResumen = ({
  titulo,
  valor,
  subtitulo,
  icono: Icon,
  color = "primary",
  onClick,
  dataGuia
}: TarjetaResumenProps) => {
  return (
    <div
      className={`bg-card rounded-lg shadow-soft p-4 border border-border ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      data-guia={dataGuia}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{titulo}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{valor}</p>
          {subtitulo && (
            <p className="text-xs text-muted-foreground mt-1">{subtitulo}</p>
          )}
        </div>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
