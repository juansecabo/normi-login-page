import { ChevronUp, ChevronDown } from "lucide-react";

/** Contador con flechitas para subir y bajar con un clic (también se puede escribir). */
const Contador = ({ valor, onCambio, min = 1, max = 200, guia }: { valor: string; onCambio: (v: string) => void; min?: number; max?: number; guia?: string }) => {
  const n = Number(valor) || 0;
  const poner = (v: number) => onCambio(String(Math.min(max, Math.max(min, v))));
  return (
    <div className="inline-flex items-stretch border border-input rounded-md bg-background overflow-hidden">
      <input value={valor} data-guia={guia} inputMode="numeric"
        onChange={(e) => onCambio(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={() => poner(n || min)}
        onKeyDown={(e) => { if (e.key === "ArrowUp") { e.preventDefault(); poner(n + 1); } if (e.key === "ArrowDown") { e.preventDefault(); poner(n - 1); } }}
        className="w-14 px-2 py-2 text-center font-semibold text-sm bg-transparent focus:outline-none" />
      <div className="flex flex-col border-l border-input">
        <button type="button" onClick={() => poner(n + 1)} disabled={n >= max} title="Una más"
          className="flex-1 px-2 hover:bg-muted disabled:opacity-40 flex items-center justify-center"><ChevronUp className="w-4 h-4" /></button>
        <button type="button" onClick={() => poner(n - 1)} disabled={n <= min} title="Una menos"
          className="flex-1 px-2 hover:bg-muted border-t border-input disabled:opacity-40 flex items-center justify-center"><ChevronDown className="w-4 h-4" /></button>
      </div>
    </div>
  );
};

export default Contador;
