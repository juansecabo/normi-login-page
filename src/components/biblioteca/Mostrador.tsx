import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2, AlertTriangle, CheckCircle2, BookOpen, UserRound, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";
import { fechaLarga, hoyYmd, errorDe } from "./comun";

/**
 * Prestar y devolver por el NÚMERO del libro (Juan 2026-10-04): cada libro tiene su número
 * (1, 2, 3…) escrito en la etiqueta; se teclea aquí. Sin cámara ni lectores.
 */
interface LectorBusqueda { id: string; nombre: string; cargo: string | null; grado: string | null; salon: string | null }
interface Situacion {
  abiertos: { id: number; fecha_vencimiento: string; perdido: boolean; Biblioteca_Obras: { titulo: string } | null; Biblioteca_Ejemplares: { codigo: string } | null }[];
  puede_prestar: boolean; motivo_bloqueo: string | null; politica: { max: number; dias: number };
}
interface Lector { id: string; nombre: string; tipo: string; cargo?: string | null; grado?: string | null; salon?: string | null }
interface EnCarrito { codigo: string; titulo: string; autores: string | null; portada: string | null }

/** Campo del número del libro: se escribe y Enter (o el botón). */
export const CampoCodigo = ({ onCodigo, ocupado, autoFocus, guia, grande, boton = "Agregar" }: { onCodigo: (c: string) => void; ocupado?: boolean; autoFocus?: boolean; guia?: string; grande?: boolean; boton?: string }) => {
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const enviar = () => { const t = v.trim(); if (!t) return; onCodigo(t); setV(""); setTimeout(() => ref.current?.focus(), 30); };
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Hash className={`absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground ${grande ? "w-5 h-5" : "w-4 h-4"}`} />
        <input ref={ref} data-guia={guia} value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }}
          placeholder="Número del libro" disabled={ocupado} autoComplete="off" inputMode="numeric"
          className={`w-full border-2 border-input rounded-xl bg-background font-semibold tracking-wide focus:border-primary focus:outline-none transition ${grande ? "pl-11 pr-4 py-3.5 text-xl" : "pl-9 pr-3 py-2.5 text-base"}`} />
      </div>
      <Button type="button" onClick={enviar} disabled={ocupado || !v.trim()} className={grande ? "h-auto px-6 rounded-xl text-base" : "rounded-xl"}>
        {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : boton}
      </Button>
    </div>
  );
};

const Paso = ({ n, titulo, activo, children }: { n: number; titulo: string; activo: boolean; children: React.ReactNode }) => (
  <div className={`rounded-2xl border-2 p-5 transition ${activo ? "border-primary/30 bg-card" : "border-border bg-muted/30 opacity-60"}`}>
    <div className="flex items-center gap-3 mb-4">
      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${activo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{n}</span>
      <h3 className="font-semibold text-foreground text-lg">{titulo}</h3>
    </div>
    {children}
  </div>
);

export const Prestar = ({ codigoInicial }: { codigoInicial?: string | null }) => {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<LectorBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [lector, setLector] = useState<Lector | null>(null);
  const [sit, setSit] = useState<Situacion | null>(null);
  const [carrito, setCarrito] = useState<EnCarrito[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState<{ nombre: string; libros: string[]; fecha: string } | null>(null);
  const [vence, setVence] = useState<string | null>(null);

  useEffect(() => { if (codigoInicial) agregarLibro(codigoInicial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [codigoInicial]);

  useEffect(() => {
    if (lector || busca.trim().length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try { const r = await apiRequest<{ lectores: LectorBusqueda[] }>(`/api/biblioteca/lectores?q=${encodeURIComponent(busca.trim())}`); setResultados(r.lectores); }
      catch { setResultados([]); }
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [busca, lector]);

  const elegir = async (id: string) => {
    setOcupado(true); setError(""); setHecho(null);
    try {
      const r = await apiRequest<{ lector: Lector; situacion: Situacion }>(`/api/biblioteca/lectores/${id}`);
      setLector(r.lector); setSit(r.situacion); setResultados([]);
      apiRequest<{ fecha: string }>(`/api/biblioteca/vencimiento?tipo=${r.lector.tipo}`).then((v) => setVence(v.fecha)).catch(() => setVence(null));
    } catch (err) { setError(errorDe(err)); }
    setOcupado(false);
  };

  async function agregarLibro(codigo: string) {
    setError(""); setHecho(null);
    try {
      const r = await apiRequest<{ ejemplar: any; prestamo: any }>(`/api/biblioteca/ejemplar/${encodeURIComponent(codigo)}`);
      const e = r.ejemplar;
      const titulo = e.Biblioteca_Obras?.titulo || "Libro";
      if (carrito.some((c) => c.codigo === e.codigo)) return;
      if (e.tipo_prestamo === "sala") { setError(`«${titulo}» (n.° ${e.codigo}) es solo para consulta en sala.`); return; }
      if (e.estado !== "disponible") { setError(`«${titulo}» (n.° ${e.codigo}) no está disponible${r.prestamo ? `: lo tiene ${r.prestamo.usuario_nombre}` : ""}.`); return; }
      setCarrito((p) => [...p, { codigo: e.codigo, titulo, autores: e.Biblioteca_Obras?.autores || null, portada: e.Biblioteca_Obras?.portada_url || null }]);
    } catch (err) { setError(errorDe(err)); }
  }

  const prestar = async () => {
    if (!lector || !carrito.length) return;
    setOcupado(true); setError("");
    try {
      const r = await apiRequest<{ fecha_vencimiento: string }>("/api/biblioteca/prestamos", { method: "POST", body: JSON.stringify({ usuario_id: lector.id, codigos: carrito.map((c) => c.codigo), fecha_vencimiento: vence }) });
      setHecho({ nombre: lector.nombre, libros: carrito.map((c) => c.titulo), fecha: r.fecha_vencimiento });
      setCarrito([]); setLector(null); setSit(null); setBusca("");
    } catch (err) { setError(errorDe(err)); }
    setOcupado(false);
  };

  const hoy = hoyYmd();
  const enCurso = sit ? sit.abiertos.filter((p) => !p.perdido).length : 0;
  void enCurso;

  return (
    <div className="space-y-5">
      {hecho && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 flex gap-4 items-start">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-900 text-lg">Préstamo registrado</p>
            <p className="text-emerald-800">{hecho.nombre} se lleva {hecho.libros.map((t) => `«${t}»`).join(", ")}.</p>
            <p className="text-emerald-800">Debe devolver{hecho.libros.length > 1 ? "los" : "lo"} el <strong>{fechaLarga(hecho.fecha)}</strong>.</p>
          </div>
        </div>
      )}
      <div className="grid lg:grid-cols-2 gap-5">
        <Paso n={1} titulo="¿Quién lo pide?" activo>
          {!lector ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input data-guia="biblioteca.buscar_lector" autoFocus={!codigoInicial} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nombre o documento"
                  className="w-full pl-9 pr-3 py-2.5 border-2 border-input rounded-xl text-sm bg-background focus:border-primary focus:outline-none" />
              </div>
              {buscando && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {resultados.length > 0 && (
                <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                  {resultados.map((l) => (
                    <button key={l.id} onClick={() => elegir(l.id)} className="w-full text-left px-3 py-2.5 hover:bg-primary/5 flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><UserRound className="w-4 h-4" /></span>
                      <span className="min-w-0">
                        <span className="block font-medium text-foreground text-sm truncate">{l.nombre}</span>
                        <span className="block text-xs text-muted-foreground">{l.cargo || `${l.grado} ${l.salon}`}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!buscando && busca.trim().length >= 2 && !resultados.length && <p className="text-sm text-muted-foreground">No se encontró a nadie.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-primary/5 p-3">
                <span className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 font-semibold">{lector.nombre.charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{lector.nombre}</p>
                  <p className="text-xs text-muted-foreground">{lector.cargo || `${lector.grado} ${lector.salon}`}</p>
                </div>
                <button onClick={() => { setLector(null); setSit(null); setBusca(""); }} className="text-xs text-primary hover:underline shrink-0">Cambiar</button>
              </div>
              {sit && sit.abiertos.length > 0 && (
                <div className="text-sm space-y-1">
                  <p className="text-muted-foreground">Ya tiene:</p>
                  {sit.abiertos.map((p) => (
                    <p key={p.id} className={p.perdido || p.fecha_vencimiento < hoy ? "text-rose-700" : "text-foreground"}>
                      <span className="text-xs font-semibold">N.° {p.Biblioteca_Ejemplares?.codigo}</span> {p.Biblioteca_Obras?.titulo} — {p.perdido ? "perdido" : `${p.fecha_vencimiento < hoy ? "venció" : "vence"} ${fechaLarga(p.fecha_vencimiento)}`}
                    </p>
                  ))}
                </div>
              )}
              {sit?.motivo_bloqueo && (
                <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 rounded-xl p-3"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {sit.motivo_bloqueo}</p>
              )}
            </div>
          )}
        </Paso>

        <Paso n={2} titulo="¿Qué libros?" activo>
          <div className="space-y-3">
            <CampoCodigo onCodigo={agregarLibro} ocupado={ocupado} autoFocus={!!lector} guia="biblioteca.codigo_prestar" />
            {carrito.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Escribe el número que está en la etiqueta del libro.</p>
            ) : (
              <div className="space-y-2">
                {carrito.map((c) => (
                  <div key={c.codigo} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                    <div className="w-9 h-12 rounded bg-muted overflow-hidden flex items-center justify-center shrink-0">
                      {c.portada ? <img src={c.portada} alt="" className="w-full h-full object-cover" /> : <BookOpen className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{c.titulo}</p>
                      <p className="text-xs text-muted-foreground">N.° {c.codigo}</p>
                    </div>
                    <button onClick={() => setCarrito((p) => p.filter((x) => x.codigo !== c.codigo))} title="Quitar" className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Paso>
      </div>

      {error && <p className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 rounded-xl p-3"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}</p>}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          {lector ? (
            <span className="flex flex-wrap items-center gap-2">Devolver el
              <input type="date" value={vence || ""} min={hoy} onChange={(e) => setVence(e.target.value)} data-guia="biblioteca.fecha_devolucion"
                className="px-3 py-2 border border-input rounded-lg text-sm bg-background font-medium text-foreground" />
            </span>
          ) : "Elige a la persona y agrega los libros."}
        </p>
        <Button data-guia="biblioteca.boton_prestar" size="lg" className="w-full sm:w-auto rounded-xl px-8"
          disabled={!lector || !carrito.length || ocupado || !vence} onClick={prestar}>
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : `Prestar${carrito.length ? ` ${carrito.length} ${carrito.length === 1 ? "libro" : "libros"}` : ""}`}
        </Button>
      </div>
    </div>
  );
};

export const Devolver = ({ codigoInicial }: { codigoInicial?: string | null }) => {
  const [ocupado, setOcupado] = useState(false);
  const [hechas, setHechas] = useState<{ ok: boolean; titulo: string; texto: string; extra?: string }[]>([]);
  const devolver = async (codigo: string) => {
    setOcupado(true);
    try {
      const r = await apiRequest<{ titulo: string; lector: string; dias_atraso: number; suspendido_dias: number }>("/api/biblioteca/devoluciones", { method: "POST", body: JSON.stringify({ codigo }) });
      const extra = r.dias_atraso > 0
        ? `Llegó con ${r.dias_atraso} ${r.dias_atraso === 1 ? "día" : "días"} de retraso${r.suspendido_dias ? `: no podrá pedir libros durante ${r.suspendido_dias} ${r.suspendido_dias === 1 ? "día" : "días"}` : ""}.`
        : undefined;
      setHechas((p) => [{ ok: true, titulo: r.titulo, texto: `Devuelto por ${r.lector}`, extra }, ...p].slice(0, 20));
    } catch (err) { setHechas((p) => [{ ok: false, titulo: codigo, texto: errorDe(err) }, ...p].slice(0, 20)); }
    setOcupado(false);
  };
  useEffect(() => { if (codigoInicial) devolver(codigoInicial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [codigoInicial]);
  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="rounded-2xl border-2 border-primary/30 bg-card p-6 space-y-3">
        <p className="font-semibold text-foreground text-lg text-center">Número del libro que devuelven</p>
        <CampoCodigo onCodigo={devolver} ocupado={ocupado} autoFocus guia="biblioteca.codigo_devolver" grande boton="Devolver" />
      </div>
      {hechas.map((h, i) => (
        <div key={i} className={`rounded-xl p-4 flex gap-3 items-start border ${h.ok ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
          {h.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
          <div className="text-sm">
            {h.ok && <p className="font-semibold text-emerald-900">«{h.titulo}»</p>}
            <p className={h.ok ? "text-emerald-800" : "text-rose-700"}>{h.texto}</p>
            {h.extra && <p className="text-amber-800 mt-1">{h.extra}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};
