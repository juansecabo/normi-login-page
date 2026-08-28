import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";

/**
 * Calendario lateral para filtrar una lista por día (mismo patrón del
 * calendario de Actividades de padres/estudiantes). Los días con registros se
 * marcan en naranja; tocar un día filtra la lista, "Ver todas" la restaura.
 * Lo usan las vistas de staff de Permisos y Excusas.
 */

/** Llave local YYYY-MM-DD de un Date (mismo formato de utils/fechaUtils.fechaKey). */
export const keyDeDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface Props {
  /** Llaves YYYY-MM-DD de los días que tienen registros (se pintan naranja). */
  diasMarcados: string[];
  dia: Date | undefined;
  onDia: (d: Date | undefined) => void;
  /** Ancla para "Normi te guía" (data-guia en el contenedor del calendario). */
  dataGuia?: string;
  /** Ancla para "Normi te guía" en el botón 'Ver todas'. */
  dataGuiaVerTodas?: string;
}

const CalendarioFiltroDia = ({ diasMarcados, dia, onDia, dataGuia, dataGuiaVerTodas }: Props) => {
  const [mes, setMes] = useState<Date>(dia || new Date());
  const fechas = diasMarcados.map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  });

  return (
    <div data-guia={dataGuia} className="flex flex-col items-center lg:sticky lg:top-4 shrink-0">
      <Calendar
        mode="single"
        selected={dia}
        onSelect={onDia}
        month={mes}
        onMonthChange={setMes}
        locale={es}
        modifiers={{ conItems: fechas }}
        modifiersClassNames={{ conItems: "bg-orange-400 text-white hover:bg-orange-500 !h-8 !w-8" }}
        className="rounded-md border shadow-sm"
      />
      {dia ? (
        <Button data-guia={dataGuiaVerTodas} variant="outline" size="sm" className="mt-3" onClick={() => onDia(undefined)}>
          Ver todas
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground mt-3 text-center max-w-[240px]">
          Toca un día para ver solo lo de esa fecha. Los días naranjas tienen registros.
        </p>
      )}
    </div>
  );
};

export default CalendarioFiltroDia;
