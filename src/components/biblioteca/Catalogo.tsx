import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";
import ObraDetalle from "./ObraDetalle";
import ObraForm from "./ObraForm";
import PortadaLibro from "./PortadaLibro";
import { NIVELES, autoresBonitos, generoLabel, fechaCorta, errorDe, useGeneros, type ObraResumen } from "./comun";

/** Catálogo con búsqueda y disponibilidad (todos los perfiles). Quien gestiona agrega y edita libros. */
const Catalogo = ({ gestiona, qInicial = "" }: { gestiona: boolean; qInicial?: string }) => {
  const [q, setQ] = useState(qInicial);
  const [genero, setGenero] = useState("");
  const [nivel, setNivel] = useState("");
  const [soloDisponibles, setSoloDisponibles] = useState(false);
  const { generos } = useGeneros();
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
    // Quien gestiona ve también los ocultos (marcados) para poder volver a mostrarlos.
    if (gestiona) params.set("inactivas", "1");
    try {
      const r = await apiRequest<{ obras: ObraResumen[]; total: number }>(`/api/biblioteca/catalogo?${params}`);
      if (id !== reqId.current) return;
      setObras((p) => (offset ? [...p, ...r.obras] : r.obras)); setTotal(r.total);
    } catch (err) { if (id === reqId.current) setError(errorDe(err)); }
    if (id === reqId.current) setCargando(false);
  }, [q, genero, nivel, soloDisponibles, gestiona]);

  useEffect(() => { const t = setTimeout(() => cargar(0), 300); return () => clearTimeout(t); }, [cargar]);

  const sel = "px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input data-guia="biblioteca.buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, autor o número del libro"
            className="w-full pl-9 pr-8 py-2.5 border-2 border-input rounded-xl text-sm bg-background focus:border-primary focus:outline-none" />
          {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Borrar"><X className="w-4 h-4" /></button>}
        </div>
        {gestiona && (
          <Button data-guia="biblioteca.agregar_libro" className="rounded-xl" onClick={() => setForm({ obra: null })}><Plus className="w-4 h-4 mr-1" /> Agregar libro</Button>
        )}
      </div>
      {/* Filtros solo para quien busca libros; la bibliotecaria solo usa el buscador (Juan 2026-10-04). */}
      {!gestiona && (
      <div className="flex flex-wrap items-center gap-2">
        <select value={genero} onChange={(e) => setGenero(e.target.value)} className={sel}>
          <option value="">Todos los géneros</option>
          {generos.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={nivel} onChange={(e) => setNivel(e.target.value)} className={sel}>
          <option value="">Todos los niveles</option>
          {NIVELES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={soloDisponibles} onChange={(e) => setSoloDisponibles(e.target.checked)} /> Solo disponibles
        </label>
      </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!cargando && !obras.length && !error && (
        <p className="text-center text-muted-foreground py-10">{q || genero || nivel ? "No se encontraron libros." : gestiona ? "El catálogo está vacío. Empieza con «Agregar libro»." : "La biblioteca todavía no tiene libros en el catálogo."}</p>
      )}

      {/* Lista (Juan 2026-10-04: en lista, no tarjetas grandes). */}
      {obras.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden" data-guia="biblioteca.catalogo">
          {obras.map((o) => {
            const estado = o.disponibles > 0 ? { t: `${o.disponibles} ${o.disponibles === 1 ? "disponible" : "disponibles"}`, c: "bg-emerald-100 text-emerald-700" }
              : o.sala ? { t: "Solo en sala", c: "bg-sky-100 text-sky-700" }
              : o.proxima ? { t: `Vuelve ${fechaCorta(o.proxima)}`, c: "bg-amber-100 text-amber-700" }
              : { t: o.total ? "No disponible" : "Sin copias", c: "bg-slate-100 text-slate-600" };
            return (
              <button key={o.id} onClick={() => setAbierta(o.id)} className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors ${o.activa ? "" : "opacity-60"}`}>
                <PortadaLibro url={o.portada_url} titulo={o.titulo} genero={o.genero} className="w-10 h-14 rounded shrink-0" mini />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-foreground truncate">{o.titulo}{!o.activa && <span className="text-amber-700 font-normal"> · oculto</span>}</p>
                  <p className="text-xs text-muted-foreground truncate">{[autoresBonitos(o.autores), generoLabel(o.genero)].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${estado.c}`}>{estado.t}</span>
              </button>
            );
          })}
        </div>
      )}
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
