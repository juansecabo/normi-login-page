import { useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorDe } from "./comun";

/** Agregar y quitar géneros de la lista del colegio (la bibliotecaria). */
const GenerosEditor = ({ generos, guardar }: { generos: string[]; guardar: (lista: string[]) => Promise<void> }) => {
  const [nuevo, setNuevo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const aplicar = async (lista: string[]) => {
    setOcupado(true); setError("");
    try { await guardar(lista); } catch (err) { setError(errorDe(err)); }
    setOcupado(false);
  };
  const agregar = () => {
    const g = nuevo.trim();
    if (!g) return;
    aplicar([...generos, g]);
    setNuevo("");
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30" data-guia="biblioteca.generos_editor">
      <div className="flex flex-wrap gap-2">
        {generos.map((g) => (
          <span key={g} className="inline-flex items-center gap-1 text-sm bg-card border border-border rounded-full pl-3 pr-1 py-1">
            {g}
            <button type="button" onClick={() => aplicar(generos.filter((x) => x !== g))} disabled={ocupado} title="Quitar" className="p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
          </span>
        ))}
        {!generos.length && <span className="text-sm text-muted-foreground">No hay géneros.</span>}
      </div>
      <div className="flex gap-2">
        <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
          placeholder="Nuevo género" className="flex-1 px-3 py-2 border border-input rounded-md text-sm bg-background" maxLength={40} />
        <Button type="button" size="sm" onClick={agregar} disabled={ocupado || !nuevo.trim()} className="h-auto">
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Agregar</>}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

export default GenerosEditor;
