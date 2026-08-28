import { Printer, Download, Check, Minus, Plus } from "lucide-react";

interface ToggleProps {
  imprimirMode: boolean;
  onToggle: () => void;
  cantidadSeleccionada: number;
  onDescargar: () => void;
  descargando: boolean;
  /** Ancla para "Normi te guía" en la casilla 'Imprimir'. */
  dataGuia?: string;
  /** Ancla para "Normi te guía" en el botón 'Descargar'. */
  dataGuiaDescargar?: string;
}

export const ImprimirToggle = ({ imprimirMode, onToggle, cantidadSeleccionada, onDescargar, descargando, dataGuia, dataGuiaDescargar }: ToggleProps) => (
  <div className="flex items-center justify-end gap-3 mb-3">
    <label data-guia={dataGuia} className="flex items-center gap-2 cursor-pointer select-none" onClick={onToggle}>
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${imprimirMode ? "bg-primary border-primary" : "border-border"}`}>
        {imprimirMode && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
      </div>
      <span className="text-sm font-medium text-foreground flex items-center gap-1">
        <Printer className="w-4 h-4" /> Imprimir
      </span>
    </label>
    {imprimirMode && cantidadSeleccionada > 0 && (
      <button
        data-guia={dataGuiaDescargar}
        onClick={onDescargar}
        disabled={descargando}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
      >
        <Download className="w-4 h-4" />
        {descargando ? "Generando..." : `Descargar (${cantidadSeleccionada})`}
      </button>
    )}
  </div>
);

interface CardSelectorProps {
  isSelected: boolean;
  count: number;
  onToggle: () => void;
  onCountChange: (n: number) => void;
}

export const CardSelector = ({ isSelected, count, onToggle, onCountChange }: CardSelectorProps) => (
  <div className="flex items-center gap-3 px-4 pt-3" onClick={(e) => e.stopPropagation()}>
    <label className="flex items-center gap-2 cursor-pointer select-none" onClick={onToggle}>
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
        {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
      </div>
      <span className="text-xs font-medium text-foreground">Imprimir</span>
    </label>
    {isSelected && (
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-xs text-muted-foreground">Cantidad:</span>
        <button
          type="button"
          onClick={() => onCountChange(Math.max(1, count - 1))}
          disabled={count <= 1}
          className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40 cursor-pointer"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="w-6 text-center text-sm font-medium tabular-nums">{count}</span>
        <button
          type="button"
          onClick={() => onCountChange(Math.min(10, count + 1))}
          disabled={count >= 10}
          className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40 cursor-pointer"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    )}
  </div>
);
