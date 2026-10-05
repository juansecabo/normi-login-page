import { useEffect, useMemo, useState } from "react";
import { Search, X, Loader2, CheckCircle2, AlertTriangle, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";
import { coincideBusqueda } from "@/utils/busqueda";
import PortadaLibro from "./PortadaLibro";
import { autoresBonitos, fechaLarga, fechaCorta, hoyYmd, errorDe, type ObraResumen } from "./comun";

/**
 * Comunidad (Juan 2026-10-04): estudiantes y personal (sin acudientes) en orden alfabético por
 * apellidos, con su estado en la biblioteca y filtros. Al tocar a alguien se ve lo que tiene y ahí
 * mismo se le presta o se le recibe un libro. Reemplaza Prestar, Devolver, Préstamos y Paz y salvo.
 */
interface PersonaCom { id: string; nombres: string; apellidos: string; cargo: string | null; grado: string | null; salon: string | null; libros: number; atrasados: number; perdidos: number }
type Filtro = "todos" | "con" | "atrasados" | "perdidos" | "sin";
const FILTROS: { k: Filtro; label: string; pasa: (p: PersonaCom) => boolean }[] = [
  { k: "todos", label: "Todos", pasa: () => true },
  { k: "con", label: "Con libros", pasa: (p) => p.libros > 0 },
  { k: "atrasados", label: "Atrasados", pasa: (p) => p.atrasados > 0 },
  { k: "perdidos", label: "Perdidos", pasa: (p) => p.perdidos > 0 },
  { k: "sin", label: "Paz y salvo", pasa: (p) => p.libros === 0 && p.perdidos === 0 },
];
const PASO = 100;

const Comunidad = () => {
  const [personas, setPersonas] = useState<PersonaCom[] | null>(null);
  const [gestiona, setGestiona] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [mostrar, setMostrar] = useState(PASO);
  const [abierta, setAbierta] = useState<PersonaCom | null>(null);
  const [error, setError] = useState("");

  const cargar = () => apiRequest<{ personas: PersonaCom[]; puede_gestionar: boolean }>("/api/biblioteca/comunidad")
    .then((r) => { setPersonas(r.personas); setGestiona(r.puede_gestionar); }).catch((err) => setError(errorDe(err)));
  useEffect(() => { cargar(); }, []);
  useEffect(() => { setMostrar(PASO); }, [busca, filtro]);

  const filtradas = useMemo(() => {
    if (!personas) return [];
    const f = FILTROS.find((x) => x.k === filtro)!;
    return personas.filter((p) => f.pasa(p) && coincideBusqueda(busca, p.apellidos, p.nombres, p.id, p.cargo, p.grado, p.salon));
  }, [personas, busca, filtro]);
  const cuenta = (k: Filtro) => (personas || []).filter(FILTROS.find((x) => x.k === k)!.pasa).length;

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!personas) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4" data-guia="biblioteca.comunidad">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre, apellido, documento, grado o cargo"
          className="w-full pl-9 pr-9 py-2.5 border-2 border-input rounded-lg text-sm bg-background focus:border-primary focus:outline-none" data-guia="biblioteca.comunidad_buscar" />
        {busca && <button onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Borrar"><X className="w-4 h-4" /></button>}
      </div>
      {/* Celular: lista desplegable; computador: botones en una fila. */}
      <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className="sm:hidden w-full px-3 py-2.5 border-2 border-input rounded-lg text-sm bg-background font-medium">
        {FILTROS.map((f) => <option key={f.k} value={f.k}>Mostrar: {f.label} ({cuenta(f.k)})</option>)}
      </select>
      <div className="hidden sm:flex flex-wrap gap-2" data-guia="biblioteca.comunidad_filtros">
        {FILTROS.map((f) => (
          <button key={f.k} onClick={() => setFiltro(f.k)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filtro === f.k ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-muted"}`}>
            {f.label} <span className={filtro === f.k ? "opacity-80" : "text-muted-foreground"}>({cuenta(f.k)})</span>
          </button>
        ))}
      </div>

      {filtradas.length === 0 ? <p className="text-center text-muted-foreground py-8">No hay nadie con ese filtro.</p> : (
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
          {filtradas.slice(0, mostrar).map((p) => (
            <button key={p.id} onClick={() => setAbierta(p)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{p.apellidos} {p.nombres}</p>
                <p className="text-xs text-muted-foreground">{p.cargo || `${p.grado} ${p.salon}`}</p>
              </div>
              <Estado p={p} />
            </button>
          ))}
        </div>
      )}
      {filtradas.length > mostrar && (
        <div className="flex justify-center"><Button variant="outline" onClick={() => setMostrar((m) => m + PASO)}>Ver más ({filtradas.length - mostrar})</Button></div>
      )}

      <PersonaBiblioteca persona={abierta} gestiona={gestiona} onCerrar={() => setAbierta(null)} onCambio={cargar} />
    </div>
  );
};

const Estado = ({ p }: { p: PersonaCom }) => (
  <span className="flex flex-wrap justify-end gap-1 shrink-0">
    {p.perdidos > 0 && <span className="text-xs font-medium px-2 py-1 rounded-full bg-rose-100 text-rose-700">{p.perdidos} {p.perdidos === 1 ? "perdido" : "perdidos"}</span>}
    {p.atrasados > 0 && <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-700">{p.atrasados} {p.atrasados === 1 ? "atrasado" : "atrasados"}</span>}
    {p.libros - p.atrasados > 0 && <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800">{p.libros - p.atrasados} {p.libros - p.atrasados === 1 ? "libro" : "libros"}</span>}
    {p.libros === 0 && p.perdidos === 0 && <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">Sin libros</span>}
  </span>
);

interface Abierto { id: number; fecha_vencimiento: string; perdido: boolean; Biblioteca_Obras: { titulo: string; autores: string | null; portada_url: string | null } | null; Biblioteca_Ejemplares: { codigo: string } | null }

/** Lo que tiene la persona: devolver, renovar, marcar perdido o repuesto, y prestarle otro libro. */
const PersonaBiblioteca = ({ persona, gestiona, onCerrar, onCambio }: { persona: PersonaCom | null; gestiona: boolean; onCerrar: () => void; onCambio: () => void }) => {
  const [abiertos, setAbiertos] = useState<Abierto[] | null>(null);
  const [ocupado, setOcupado] = useState<number | string | null>(null);
  const [confirmarPerdido, setConfirmarPerdido] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const hoy = hoyYmd();

  const cargar = async () => {
    if (!persona) return;
    try { const r = await apiRequest<{ situacion: { abiertos: Abierto[] } }>(`/api/biblioteca/lectores/${persona.id}`); setAbiertos(r.situacion.abiertos); }
    catch (err) { setMsg({ ok: false, texto: errorDe(err) }); }
  };
  useEffect(() => { setAbiertos(null); setMsg(null); setConfirmarPerdido(null); cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [persona?.id]);

  const hacer = async (clave: number | string, fn: () => Promise<unknown>, ok: string) => {
    setOcupado(clave); setMsg(null);
    try { await fn(); setMsg({ ok: true, texto: ok }); await cargar(); onCambio(); }
    catch (err) { setMsg({ ok: false, texto: errorDe(err) }); }
    setOcupado(null); setConfirmarPerdido(null);
  };

  return (
    <Dialog open={!!persona} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        {persona && (<>
          <DialogHeader>
            <DialogTitle>{persona.apellidos} {persona.nombres}</DialogTitle>
            <p className="text-sm text-muted-foreground">{persona.cargo || `${persona.grado} ${persona.salon}`}</p>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Libros que tiene</p>
            {abiertos === null ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              : abiertos.length === 0 ? <p className="text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> No tiene libros prestados.</p>
              : abiertos.map((a) => {
                const atrasado = !a.perdido && a.fecha_vencimiento < hoy;
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5">
                    <PortadaLibro url={a.Biblioteca_Obras?.portada_url || null} titulo={a.Biblioteca_Obras?.titulo || ""} genero={null} className="w-9 h-12 rounded shrink-0" mini />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium text-foreground truncate">{a.Biblioteca_Obras?.titulo} <span className="text-muted-foreground font-normal">· N.° {a.Biblioteca_Ejemplares?.codigo}</span></p>
                      <p className={a.perdido || atrasado ? "text-red-700 font-medium" : "text-muted-foreground"}>
                        {a.perdido ? "Perdido: falta reponerlo" : atrasado ? `Atrasado: debía devolverlo el ${fechaLarga(a.fecha_vencimiento)}` : `Devolver el ${fechaLarga(a.fecha_vencimiento)}`}
                      </p>
                    </div>
                    {gestiona && (
                      <span className="flex gap-1.5 flex-wrap">
                        {!a.perdido && <Button size="sm" disabled={!!ocupado} onClick={() => hacer(a.id, () => apiRequest("/api/biblioteca/devoluciones", { method: "POST", body: JSON.stringify({ codigo: a.Biblioteca_Ejemplares?.codigo }) }), `Recibido «${a.Biblioteca_Obras?.titulo}».`)} data-guia="biblioteca.persona_devolver">
                          {ocupado === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Devolvió"}</Button>}
                        {!a.perdido && <Button size="sm" variant="outline" disabled={!!ocupado} onClick={() => hacer(`r${a.id}`, () => apiRequest(`/api/biblioteca/prestamos/${a.id}/renovar`, { method: "POST" }), "Renovado por 15 días más.")}>Renovar</Button>}
                        {!a.perdido && (confirmarPerdido === a.id
                          ? <Button size="sm" variant="destructive" disabled={!!ocupado} onClick={() => hacer(`p${a.id}`, () => apiRequest(`/api/biblioteca/prestamos/${a.id}/perdido`, { method: "POST" }), "Marcado como perdido.")}>¿Seguro? Sí, se perdió</Button>
                          : <Button size="sm" variant="outline" className="text-rose-700" disabled={!!ocupado} onClick={() => setConfirmarPerdido(a.id)}>Se perdió</Button>)}
                        {a.perdido && <Button size="sm" disabled={!!ocupado} onClick={() => hacer(`x${a.id}`, () => apiRequest(`/api/biblioteca/prestamos/${a.id}/repuesto`, { method: "POST" }), "Libro repuesto.")}>Ya lo repuso</Button>}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
          {msg && <p className={`text-sm rounded-lg p-2.5 flex items-start gap-2 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />} {msg.texto}</p>}

          {gestiona && <PrestarleLibro persona={persona} onPrestado={(t) => { setMsg({ ok: true, texto: t }); cargar(); onCambio(); }} />}
        </>)}
      </DialogContent>
    </Dialog>
  );
};

/** Prestarle un libro: buscar por título, autor o número, escoger la fecha y listo. */
const PrestarleLibro = ({ persona, onPrestado }: { persona: PersonaCom; onPrestado: (texto: string) => void }) => {
  const [q, setQ] = useState("");
  const [obras, setObras] = useState<ObraResumen[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [fecha, setFecha] = useState("");
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { apiRequest<{ fecha: string }>("/api/biblioteca/vencimiento").then((r) => setFecha(r.fecha)).catch(() => null); }, []);
  useEffect(() => {
    if (q.trim().length < 1) { setObras([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try { const r = await apiRequest<{ obras: ObraResumen[] }>(`/api/biblioteca/catalogo?q=${encodeURIComponent(q.trim())}`); setObras(r.obras.slice(0, 8)); }
      catch { setObras([]); }
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const prestar = async (o: ObraResumen) => {
    setOcupado(o.id); setError("");
    try {
      // Si se escribió el número de una copia de este libro, se presta esa; si no, la primera disponible.
      const numero = /^\d{1,7}$/.test(q.trim()) ? q.trim() : null;
      const det = await apiRequest<{ ejemplares: { codigo?: string; numero_inventario: number; estado: string }[] }>(`/api/biblioteca/obras/${o.id}`);
      const libres = det.ejemplares.filter((e) => e.estado === "disponible");
      const ej = libres.find((e) => String(e.codigo ?? e.numero_inventario) === numero) || libres[0];
      if (!ej) { setError(`«${o.titulo}» no tiene copias disponibles.`); setOcupado(null); return; }
      const codigo = String(ej.codigo ?? ej.numero_inventario);
      const r = await apiRequest<{ fecha_vencimiento: string }>("/api/biblioteca/prestamos", { method: "POST", body: JSON.stringify({ usuario_id: persona.id, codigos: [codigo], fecha_vencimiento: fecha || undefined }) });
      onPrestado(`Prestado «${o.titulo}» (N.° ${codigo}). Debe devolverlo el ${fechaLarga(r.fecha_vencimiento)}.`);
      setQ(""); setObras([]);
    } catch (err) { setError(errorDe(err)); }
    setOcupado(null);
  };

  return (
    <div className="rounded-lg border-2 border-primary/30 p-3 space-y-3" data-guia="biblioteca.persona_prestar">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2"><BookOpen className="w-4 h-4" /> Prestarle un libro</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, autor o número del libro" className="w-full pl-9 pr-3 py-2 border border-input rounded-md text-sm bg-background" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">Devolver el
        <input type="date" value={fecha} min={hoyYmd()} onChange={(e) => setFecha(e.target.value)} className="px-2 py-1.5 border border-input rounded-md bg-background font-medium" />
      </div>
      {buscando && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {obras.length > 0 && (
        <div className="rounded-md border border-border divide-y divide-border">
          {obras.map((o) => (
            <div key={o.id} className="flex items-center gap-3 px-3 py-2">
              <PortadaLibro url={o.portada_url} titulo={o.titulo} genero={o.genero} className="w-8 h-11 rounded shrink-0" mini />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-foreground truncate">{o.titulo}</p>
                <p className="text-xs text-muted-foreground truncate">{autoresBonitos(o.autores)}{o.autores ? " · " : ""}{o.disponibles > 0 ? `${o.disponibles} ${o.disponibles === 1 ? "disponible" : "disponibles"}` : o.proxima ? `vuelve ${fechaCorta(o.proxima)}` : "sin copias disponibles"}</p>
              </div>
              <Button size="sm" disabled={o.disponibles === 0 || ocupado !== null} onClick={() => prestar(o)}>
                {ocupado === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Prestar"}
              </Button>
            </div>
          ))}
        </div>
      )}
      {!buscando && q.trim() && !obras.length && <p className="text-xs text-muted-foreground">No se encontró ese libro.</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
};

export default Comunidad;
