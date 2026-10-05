import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { autoresBonitos, fechaLarga, fechaCorta, errorDe, type PrestamoLector } from "./comun";

/** Mis préstamos (o los de cada hijo, para el acudiente): fechas, renovación en línea y paz y salvo. */
interface Bloque { abiertos: PrestamoLector[]; historial: PrestamoLector[]; paz_y_salvo: boolean }
interface Resp extends Partial<Bloque> { hijos?: (Bloque & { id: string; nombre: string })[]; hoy: string; renovaciones_max: number }

const Lista = ({ b, hoy, max, propio, onRenovar, renovando }: { b: Bloque; hoy: string; max: number; propio: boolean; onRenovar: (id: number) => void; renovando: number | null }) => (
  <div className="space-y-2">
    {b.paz_y_salvo
      ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" /> A paz y salvo con la biblioteca.</p>
      : b.abiertos.map((p) => {
        const vencido = !p.perdido && p.fecha_vencimiento < hoy;
        return (
          <div key={p.id} className="flex gap-3 rounded-lg border border-border bg-card p-3">
            <div className="w-10 h-14 shrink-0 rounded bg-muted overflow-hidden flex items-center justify-center">
              {p.Biblioteca_Obras?.portada_url ? <img src={p.Biblioteca_Obras.portada_url} alt="" className="w-full h-full object-cover" /> : <span>📕</span>}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-foreground">{p.Biblioteca_Obras?.titulo}</p>
              {p.Biblioteca_Obras?.autores && <p className="text-xs text-muted-foreground">{autoresBonitos(p.Biblioteca_Obras.autores)}</p>}
              <p className={`mt-0.5 ${p.perdido || vencido ? "text-rose-700 font-medium" : "text-foreground"}`}>
                {p.perdido ? "Perdido: hay que reponerlo" : vencido ? `Venció el ${fechaLarga(p.fecha_vencimiento)}: hay que devolverlo` : `Devolver el ${fechaLarga(p.fecha_vencimiento)}`}
              </p>
            </div>
            {propio && !p.perdido && !vencido && (
              <button disabled={renovando === p.id} onClick={() => onRenovar(p.id)} className="self-center text-xs px-2 py-1 rounded border border-border hover:bg-muted shrink-0">
                {renovando === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Renovar"}
              </button>
            )}
          </div>
        );
      })}
    {b.historial.length > 0 && (
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Libros que ya devolvió ({b.historial.length})</summary>
        <ul className="mt-2 space-y-1">
          {b.historial.map((p) => <li key={p.id} className="text-muted-foreground">· {p.Biblioteca_Obras?.titulo} <span className="text-xs">({fechaCorta(p.fecha_prestamo)})</span></li>)}
        </ul>
      </details>
    )}
  </div>
);

const MisPrestamos = () => {
  const [r, setR] = useState<Resp | null>(null);
  const [error, setError] = useState("");
  const [renovando, setRenovando] = useState<number | null>(null);
  const cargar = () => apiRequest<Resp>("/api/biblioteca/mis-prestamos").then(setR).catch((err) => setError(errorDe(err)));
  useEffect(() => { cargar(); }, []);
  const renovar = async (id: number) => {
    setRenovando(id); setError("");
    try { await apiRequest(`/api/biblioteca/prestamos/${id}/renovar`, { method: "POST" }); await cargar(); }
    catch (err) { setError(errorDe(err)); }
    setRenovando(null);
  };
  if (!r) return error ? <p className="text-sm text-destructive">{error}</p> : <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-5 max-w-2xl mx-auto" data-guia="biblioteca.mis_prestamos">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {r.hijos ? (
        r.hijos.length === 0 ? <p className="text-muted-foreground text-center py-6">No tienes estudiantes vinculados.</p>
          : r.hijos.map((h) => (
            <div key={h.id} className="space-y-2">
              <h3 className="font-semibold text-foreground">{h.nombre}</h3>
              <Lista b={h} hoy={r.hoy} max={r.renovaciones_max} propio={false} onRenovar={renovar} renovando={renovando} />
            </div>
          ))
      ) : (
        <Lista b={r as Bloque} hoy={r.hoy} max={r.renovaciones_max} propio onRenovar={renovar} renovando={renovando} />
      )}
    </div>
  );
};

export default MisPrestamos;
