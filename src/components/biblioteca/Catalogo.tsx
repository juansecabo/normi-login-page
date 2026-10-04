import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";
import ObraDetalle from "./ObraDetalle";
import ObraForm from "./ObraForm";
import { GENEROS, NIVELES, autoresBonitos, fechaCorta, errorDe, type ObraResumen } from "./comun";

/** Catálogo con búsqueda y disponibilidad (todos los perfiles). Quien gestiona agrega y edita libros. */
const Catalogo = ({ gestiona }: { gestiona: boolean }) => {
  const [q, setQ] = useState("");
  const [genero, setGenero] = useState("");
  const [nivel, setNivel] = useState("");
  const [soloDisponibles, setSoloDisponibles] = useState(false);
  const [ocultos, setOcultos] = useState(false);
  const [obras, setObras] = useState<ObraResumen[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [form, setForm] = useState<{ obra: Record<string, any> | null } | null>(null);
  const reqId = useRef(0);

  const cargar = useCallback(async (offset = 0) => {
    const id = ++reqId.current;
    setCargando(true); setError("");
    const params = new URLSearchParams({ q, genero, nivel, offset: String(offset) });
    if (soloDisponibles) params.set("disponibles", "1");
    if (ocultos) params.set("inactivas", "1");
    try {
      const r = await apiRequest<{ obras: ObraResumen[]; total: number }>(`/api/biblioteca/catalogo?${params}`);
      if (id !== reqId.current) return;
      setObras((p) => (offset ? [...p, ...r.obras] : r.obras)); setTotal(r.total);
    } catch (err) { if (id === reqId.current) setError(errorDe(err)); }
    if (id === reqId.current) setCargando(false);
  }, [q, genero, nivel, soloDisponibles, ocultos]);

  useEffect(() => { const t = setTimeout(() => cargar(0), 300); return () => clearTimeout(t); }, [cargar]);

  const sel = "px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input data-guia="biblioteca.buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, autor, materia o ISBN…"
            className="w-full pl-9 pr-8 py-2 border border-input rounded-md text-sm bg-background" />
          {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Borrar"><X className="w-4 h-4" /></button>}
        </div>
        {gestiona && (
          <Button data-guia="biblioteca.agregar_libro" onClick={() => setForm({ obra: null })}><Plus className="w-4 h-4 mr-1" /> Agregar libro</Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={genero} onChange={(e) => setGenero(e.target.value)} className={sel}>
          <option value="">Todos los géneros</option>
          {GENEROS.map((g) => <option key={g.value} value={g.value}>{g.label.split(" (")[0]}</option>)}
        </select>
        <select value={nivel} onChange={(e) => setNivel(e.target.value)} className={sel}>
          <option value="">Todos los niveles</option>
          {NIVELES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={soloDisponibles} onChange={(e) => setSoloDisponibles(e.target.checked)} /> Solo disponibles
        </label>
        {gestiona && (
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={ocultos} onChange={(e) => setOcultos(e.target.checked)} /> Incluir ocultos
          </label>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!cargando && !obras.length && !error && (
        <p className="text-center text-muted-foreground py-10">{q || genero || nivel ? "No se encontraron libros." : gestiona ? "El catálogo está vacío. Empieza con «Agregar libro»." : "La biblioteca todavía no tiene libros en el catálogo."}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-guia="biblioteca.catalogo">
        {obras.map((o) => {
          const disp = o.disponibles > 0;
          return (
            <button key={o.id} onClick={() => setAbierta(o.id)} className={`text-left flex gap-3 p-3 rounded-lg border bg-card hover:shadow-md transition ${o.activa ? "border-border" : "border-dashed border-amber-300 opacity-70"}`}>
              <div className="w-14 h-20 shrink-0 rounded bg-muted overflow-hidden flex items-center justify-center">
                {o.portada_url ? <img src={o.portada_url} alt="" className="w-full h-full object-cover" loading="lazy" /> : <span className="text-2xl">📕</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-foreground line-clamp-2">{o.titulo}</p>
                {o.autores && <p className="text-xs text-muted-foreground truncate">{autoresBonitos(o.autores)}</p>}
                <p className={`mt-1 text-xs font-medium ${disp ? "text-emerald-700" : o.sala ? "text-sky-700" : "text-amber-700"}`}>
                  {disp ? `${o.disponibles} ${o.disponibles === 1 ? "disponible" : "disponibles"}`
                    : o.sala ? "Solo para consulta en sala"
                    : o.proxima ? `Prestado · vuelve ${fechaCorta(o.proxima)}`
                    : o.total ? "No disponible" : "Sin copias"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {cargando && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
      {!cargando && obras.length < total && (
        <div className="flex justify-center"><Button variant="outline" onClick={() => cargar(obras.length)}>Ver más ({total - obras.length})</Button></div>
      )}

      <ObraDetalle obraId={abierta} onCerrar={() => setAbierta(null)} onEditar={(obra) => setForm({ obra })} onCambio={() => cargar(0)} />
      <ObraForm abierto={!!form} obra={form?.obra} onCerrar={() => setForm(null)}
        onGuardado={(id) => { setForm(null); cargar(0); setAbierta(null); setTimeout(() => setAbierta(id), 50); }} />
    </div>
  );
};

export default Catalogo;
