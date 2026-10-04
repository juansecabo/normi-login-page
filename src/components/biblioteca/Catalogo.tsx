import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";
import ObraDetalle from "./ObraDetalle";
import ObraForm from "./ObraForm";
import PortadaLibro from "./PortadaLibro";
import { GENEROS, NIVELES, autoresBonitos, fechaCorta, errorDe, type ObraResumen } from "./comun";

/** Catálogo con búsqueda y disponibilidad (todos los perfiles). Quien gestiona agrega y edita libros. */
const Catalogo = ({ gestiona, qInicial = "" }: { gestiona: boolean; qInicial?: string }) => {
  const [q, setQ] = useState(qInicial);
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
          <input data-guia="biblioteca.buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, autor, materia o código del libro…"
            className="w-full pl-9 pr-8 py-2.5 border-2 border-input rounded-xl text-sm bg-background focus:border-primary focus:outline-none" />
          {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Borrar"><X className="w-4 h-4" /></button>}
        </div>
        {gestiona && (
          <Button data-guia="biblioteca.agregar_libro" className="rounded-xl" onClick={() => setForm({ obra: null })}><Plus className="w-4 h-4 mr-1" /> Agregar libro</Button>
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" data-guia="biblioteca.catalogo">
        {obras.map((o) => {
          const disp = o.disponibles > 0;
          const estado = disp ? { t: `${o.disponibles} ${o.disponibles === 1 ? "disponible" : "disponibles"}`, c: "bg-emerald-500" }
            : o.sala ? { t: "Solo en sala", c: "bg-sky-500" }
            : o.proxima ? { t: `Vuelve ${fechaCorta(o.proxima)}`, c: "bg-amber-500" }
            : { t: o.total ? "No disponible" : "Sin copias", c: "bg-slate-400" };
          return (
            <button key={o.id} onClick={() => setAbierta(o.id)} className={`group text-left flex flex-col rounded-2xl overflow-hidden bg-card border shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all ${o.activa ? "border-border" : "border-dashed border-amber-400 opacity-70"}`}>
              <div className="relative aspect-[3/4] bg-muted overflow-hidden">
                <PortadaLibro url={o.portada_url} titulo={o.titulo} genero={o.genero} className="w-full h-full group-hover:scale-105 transition-transform duration-300" />
                <span className={`absolute top-2 left-2 text-[11px] font-semibold text-white px-2 py-0.5 rounded-full shadow ${estado.c}`}>{estado.t}</span>
              </div>
              <div className="p-3 space-y-0.5">
                <p className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">{o.titulo}</p>
                {o.autores && <p className="text-xs text-muted-foreground truncate">{autoresBonitos(o.autores)}</p>}
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
