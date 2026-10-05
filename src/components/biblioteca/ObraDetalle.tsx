import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Plus, EyeOff, Eye, Search, UserRound, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import PortadaLibro from "./PortadaLibro";
import Contador from "./Contador";
import { ESTADOS, autoresBonitos, generoLabel, nivelLabel, fechaLarga, errorDe, hoyYmd } from "./comun";

/**
 * Ficha de un libro. Todos ven sus datos y qué copias están disponibles (o hasta cuándo
 * están prestadas). Quien gestiona ve además el número de inventario, a quién se le prestó,
 * y puede editar, agregar copias (varias de una vez), dar de baja u ocultar el libro.
 */
interface Ejemplar {
  id: number; numero_inventario: number; signatura: string | null; estado: string; tipo_prestamo: string; vence: string | null; mio?: boolean;
  codigo?: string; procedencia?: string | null; motivo_baja?: string | null;
  prestamo?: { usuario_nombre: string; usuario_grado: string | null; usuario_salon: string | null; fecha_vencimiento: string; perdido: boolean } | null;
}

const ObraDetalle = ({ obraId, onCerrar, onEditar, onCambio }: {
  obraId: number | null; onCerrar: () => void; onEditar: (obra: Record<string, any>) => void; onCambio: () => void;
}) => {
  const [obra, setObra] = useState<Record<string, any> | null>(null);
  const [ejemplares, setEjemplares] = useState<Ejemplar[]>([]);
  const [gestiona, setGestiona] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [agregar, setAgregar] = useState<{ cantidad: string } | null>(null);
  const [baja, setBaja] = useState<{ ej: Ejemplar; motivo: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [prestando, setPrestando] = useState<Ejemplar | null>(null);

  const cargar = async () => {
    if (!obraId) return;
    setCargando(true); setError("");
    try {
      const r = await apiRequest<{ obra: Record<string, any>; ejemplares: Ejemplar[]; puede_gestionar: boolean }>(`/api/biblioteca/obras/${obraId}`);
      setObra(r.obra); setEjemplares(r.ejemplares); setGestiona(r.puede_gestionar);
    } catch (err) { setError(errorDe(err)); }
    setCargando(false);
  };
  useEffect(() => { setObra(null); setEjemplares([]); setAgregar(null); setBaja(null); setPrestando(null); cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [obraId]);

  const accion = async (fn: () => Promise<unknown>) => {
    setOcupado(true); setError("");
    try { await fn(); await cargar(); onCambio(); } catch (err) { setError(errorDe(err)); }
    setOcupado(false);
  };
  const cambiarEstado = (ej: Ejemplar, estado: string, motivo_baja?: string) =>
    accion(() => apiRequest(`/api/biblioteca/ejemplares/${ej.id}`, { method: "PATCH", body: JSON.stringify({ estado, motivo_baja }) }));

  const visibles = ejemplares.filter((e) => gestiona || (e.estado !== "baja" && e.estado !== "perdido"));
  const disponibles = visibles.filter((e) => e.estado === "disponible" && e.tipo_prestamo !== "sala").length;
  const inp = "w-full px-2 py-1.5 border border-input rounded-md text-sm bg-background";

  return (
    <Dialog open={!!obraId} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        {cargando && !obra ? <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : obra && (<>
          <DialogHeader><DialogTitle className="pr-6">{obra.titulo}</DialogTitle></DialogHeader>
          <div className="flex gap-4">
            <PortadaLibro url={obra.portada_url} titulo={obra.titulo} genero={obra.genero} className="w-28 h-40 shrink-0 rounded-xl" />
            <div className="text-sm space-y-1 min-w-0">
              {obra.subtitulo && <p className="text-muted-foreground">{obra.subtitulo}</p>}
              {obra.autores && <p><span className="text-muted-foreground">Autor:</span> {autoresBonitos(obra.autores)}</p>}
              {(obra.editorial || obra.anio) && <p><span className="text-muted-foreground">Editorial:</span> {[obra.editorial, obra.anio].filter(Boolean).join(", ")}</p>}
              {obra.genero && <p><span className="text-muted-foreground">Género:</span> {generoLabel(obra.genero)}{obra.nivel_lector ? ` · ${nivelLabel(obra.nivel_lector)}` : ""}</p>}
              {obra.isbn && <p><span className="text-muted-foreground">ISBN:</span> {obra.isbn}</p>}
              {!obra.activa && <p className="text-amber-700 font-medium">Oculto del catálogo</p>}
            </div>
          </div>
          {obra.resumen && <p className="text-sm text-foreground leading-relaxed">{obra.resumen}</p>}

          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-foreground mb-2">
              {disponibles > 0 ? `${disponibles} ${disponibles === 1 ? "copia disponible" : "copias disponibles"}` : "Sin copias disponibles por ahora"}
              <span className="text-muted-foreground font-normal"> · {visibles.length} en total</span>
            </p>
            <div className="divide-y divide-border">
              {visibles.map((e) => (
                <div key={e.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADOS[e.estado]?.cls || ""}`}>{ESTADOS[e.estado]?.label || e.estado}</span>
                  {gestiona && e.codigo && <span className="text-xs font-semibold bg-muted px-2 py-0.5 rounded">N.° {e.codigo}</span>}
                  {e.vence && e.estado === "prestado" && <span className="text-muted-foreground">{e.mio ? "Lo tienes tú · " : ""}vuelve el {fechaLarga(e.vence)}</span>}
                  {gestiona && e.prestamo && <span className="text-foreground">· {e.prestamo.usuario_nombre}{e.prestamo.usuario_grado ? ` (${e.prestamo.usuario_grado} ${e.prestamo.usuario_salon})` : ""}</span>}
                  {gestiona && e.estado === "baja" && e.motivo_baja && <span className="text-muted-foreground">· {e.motivo_baja}</span>}
                  {gestiona && (
                    <span className="ml-auto flex gap-1">
                      {e.estado === "reparacion" && <button disabled={ocupado} onClick={() => cambiarEstado(e, "disponible")} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted">Volver a disponible</button>}
                      {e.estado === "disponible" && <button disabled={ocupado} onClick={() => { setBaja(null); setPrestando(e); }} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90" data-guia="biblioteca.detalle_prestar">Prestar</button>}
                      {(e.estado === "disponible" || e.estado === "reparacion") && <button disabled={ocupado} onClick={() => { setPrestando(null); setBaja({ ej: e, motivo: "" }); }} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-rose-700">Dar de baja</button>}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {prestando && <PrestarAqui ejemplar={prestando} onCancelar={() => setPrestando(null)} onListo={() => { setPrestando(null); cargar(); onCambio(); }} />}
            {baja && (
              <div className="mt-2 rounded-md bg-rose-50 border border-rose-200 p-3 space-y-2">
                <p className="text-sm text-foreground">Dar de baja la copia n.° {baja.ej.codigo}. No se borra: queda en el registro.</p>
                <select value={baja.motivo} onChange={(e) => setBaja({ ...baja, motivo: e.target.value })} className={inp}>
                  <option value="">Motivo…</option>
                  {["Deteriorado (mutilado, hojas sueltas)", "Hongos o humedad", "Desactualizado", "Duplicado sin uso", "Pirata o fotocopia", "Otro"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setBaja(null)}>Cancelar</Button>
                  <Button size="sm" variant="destructive" disabled={!baja.motivo || ocupado} onClick={() => { cambiarEstado(baja.ej, "baja", baja.motivo); setBaja(null); }}>Dar de baja</Button>
                </div>
              </div>
            )}
            {gestiona && agregar && (
              <div className="mt-2 rounded-md bg-muted/40 border border-border p-3 flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-foreground">¿Cuántas copias más?</label>
                <Contador valor={agregar.cantidad} onCambio={(v) => setAgregar({ cantidad: v })} />
                <span className="flex gap-2 ml-auto">
                  <Button size="sm" variant="outline" onClick={() => setAgregar(null)}>Cancelar</Button>
                  <Button size="sm" disabled={ocupado || !Number(agregar.cantidad)} onClick={() => accion(async () => {
                    await apiRequest(`/api/biblioteca/obras/${obra.id}/ejemplares`, { method: "POST", body: JSON.stringify({ cantidad: Number(agregar.cantidad) }) });
                    setAgregar(null);
                  })}>Agregar</Button>
                </span>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {gestiona && (
            <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-start">
              <Button variant="outline" size="sm" onClick={() => onEditar(obra)}><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
              <Button variant="outline" size="sm" onClick={() => setAgregar({ cantidad: "1" })}><Plus className="w-4 h-4 mr-1" /> Agregar copias</Button>
              <Button variant="outline" size="sm" disabled={ocupado} onClick={() => accion(() => apiRequest(`/api/biblioteca/obras/${obra.id}`, { method: "PATCH", body: JSON.stringify({ activa: !obra.activa }) }))}>
                {obra.activa ? <><EyeOff className="w-4 h-4 mr-1" /> Ocultar del catálogo</> : <><Eye className="w-4 h-4 mr-1" /> Mostrar en el catálogo</>}
              </Button>
            </DialogFooter>
          )}
        </>)}
        {error && !obra && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
};

/** Prestar esta copia desde la ficha del libro: buscar a la persona y listo (Juan 2026-10-04). */
const PrestarAqui = ({ ejemplar, onCancelar, onListo }: { ejemplar: Ejemplar; onCancelar: () => void; onListo: () => void }) => {
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<{ id: string; nombre: string; cargo: string | null; grado: string | null; salon: string | null }[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState<{ nombre: string; fecha: string } | null>(null);
  // Fecha de devolución: la escoge la bibliotecaria (viene sugerida a 15 días).
  const [fecha, setFecha] = useState("");
  useEffect(() => { apiRequest<{ fecha: string }>("/api/biblioteca/vencimiento").then((r) => setFecha(r.fecha)).catch(() => null); }, []);
  useEffect(() => {
    if (busca.trim().length < 2) { setLista([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try { const r = await apiRequest<{ lectores: typeof lista }>(`/api/biblioteca/lectores?q=${encodeURIComponent(busca.trim())}`); setLista(r.lectores); }
      catch { setLista([]); }
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);
  const prestar = async (l: { id: string; nombre: string }) => {
    setOcupado(true); setError("");
    try {
      const r = await apiRequest<{ fecha_vencimiento: string }>("/api/biblioteca/prestamos", { method: "POST", body: JSON.stringify({ usuario_id: l.id, codigos: [ejemplar.codigo || String(ejemplar.numero_inventario)], fecha_vencimiento: fecha || undefined }) });
      setHecho({ nombre: l.nombre, fecha: r.fecha_vencimiento });
    } catch (err) { setError(errorDe(err)); }
    setOcupado(false);
  };
  if (hecho) return (
    <div className="mt-2 rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm flex items-start gap-2">
      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
      <div className="flex-1"><p className="text-emerald-900">Prestado a <strong>{hecho.nombre}</strong>. Debe devolverlo el <strong>{fechaLarga(hecho.fecha)}</strong>.</p></div>
      <Button size="sm" onClick={onListo}>Listo</Button>
    </div>
  );
  return (
    <div className="mt-2 rounded-md bg-muted/40 border border-border p-3 space-y-2" data-guia="biblioteca.detalle_prestar_panel">
      <p className="text-sm font-medium text-foreground">¿A quién le prestas la copia N.° {ejemplar.codigo || ejemplar.numero_inventario}?</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">Devolver el
        <input type="date" value={fecha} min={hoyYmd()} onChange={(e) => setFecha(e.target.value)} className="px-2 py-1.5 border border-input rounded-md bg-background font-medium" data-guia="biblioteca.detalle_fecha" />
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nombre, apellido o documento"
          className="w-full pl-9 pr-3 py-2 border border-input rounded-md text-sm bg-background" />
      </div>
      {buscando && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {lista.length > 0 && (
        <div className="rounded-md border border-border divide-y divide-border bg-card max-h-56 overflow-y-auto">
          {lista.map((l) => (
            <button key={l.id} disabled={ocupado} onClick={() => prestar(l)} className="w-full text-left px-3 py-2 hover:bg-primary/5 flex items-center gap-2 text-sm">
              <UserRound className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="min-w-0 truncate"><span className="font-medium text-foreground">{l.nombre}</span> <span className="text-muted-foreground">· {l.cargo || `${l.grado} ${l.salon}`}</span></span>
            </button>
          ))}
        </div>
      )}
      {!buscando && busca.trim().length >= 2 && !lista.length && <p className="text-xs text-muted-foreground">No se encontró a nadie.</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={onCancelar} disabled={ocupado}>Cancelar</Button></div>
    </div>
  );
};

export default ObraDetalle;
