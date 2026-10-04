import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Plus, EyeOff, Eye } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import PortadaLibro from "./PortadaLibro";
import { ESTADOS, PROCEDENCIAS, autoresBonitos, generoLabel, nivelLabel, fechaLarga, errorDe } from "./comun";

/**
 * Ficha de un libro. Todos ven sus datos y qué copias están disponibles (o hasta cuándo
 * están prestadas). Quien gestiona ve además el número de inventario, a quién se le prestó,
 * y puede editar, agregar copias, mandar a reparación, dar de baja u ocultar el libro.
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
  const [agregar, setAgregar] = useState<{ cantidad: string; procedencia: string; tipo: string } | null>(null);
  const [baja, setBaja] = useState<{ ej: Ejemplar; motivo: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    if (!obraId) return;
    setCargando(true); setError("");
    try {
      const r = await apiRequest<{ obra: Record<string, any>; ejemplares: Ejemplar[]; puede_gestionar: boolean }>(`/api/biblioteca/obras/${obraId}`);
      setObra(r.obra); setEjemplares(r.ejemplares); setGestiona(r.puede_gestionar);
    } catch (err) { setError(errorDe(err)); }
    setCargando(false);
  };
  useEffect(() => { setObra(null); setEjemplares([]); setAgregar(null); setBaja(null); cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [obraId]);

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
              {obra.materia && <p><span className="text-muted-foreground">Materia:</span> {obra.materia}</p>}
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
                  {e.tipo_prestamo === "sala" && <span className="px-2 py-0.5 rounded-full text-xs bg-sky-100 text-sky-700">Solo en sala</span>}
                  {gestiona && e.codigo && <span className="text-xs font-semibold bg-muted px-2 py-0.5 rounded">N.° {e.codigo}</span>}
                  {e.vence && e.estado === "prestado" && <span className="text-muted-foreground">{e.mio ? "Lo tienes tú · " : ""}vuelve el {fechaLarga(e.vence)}</span>}
                  {gestiona && e.prestamo && <span className="text-foreground">· {e.prestamo.usuario_nombre}{e.prestamo.usuario_grado ? ` (${e.prestamo.usuario_grado} ${e.prestamo.usuario_salon})` : ""}</span>}
                  {gestiona && e.estado === "baja" && e.motivo_baja && <span className="text-muted-foreground">· {e.motivo_baja}</span>}
                  {gestiona && (
                    <span className="ml-auto flex gap-1">
                      {e.estado === "reparacion" && <button disabled={ocupado} onClick={() => cambiarEstado(e, "disponible")} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted">Volver a disponible</button>}
                      {(e.estado === "disponible" || e.estado === "reparacion") && <button disabled={ocupado} onClick={() => setBaja({ ej: e, motivo: "" })} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-rose-700">Dar de baja</button>}
                    </span>
                  )}
                </div>
              ))}
            </div>
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
              <div className="mt-2 rounded-md bg-muted/40 border border-border p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <input value={agregar.cantidad} onChange={(e) => setAgregar({ ...agregar, cantidad: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="Cantidad" className={inp} inputMode="numeric" />
                  <select value={agregar.procedencia} onChange={(e) => setAgregar({ ...agregar, procedencia: e.target.value })} className={inp}>
                    {PROCEDENCIAS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <select value={agregar.tipo} onChange={(e) => setAgregar({ ...agregar, tipo: e.target.value })} className={inp}>
                    <option value="normal">Se presta</option>
                    <option value="sala">Solo en sala</option>
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setAgregar(null)}>Cancelar</Button>
                  <Button size="sm" disabled={ocupado || !Number(agregar.cantidad)} onClick={() => accion(async () => {
                    await apiRequest(`/api/biblioteca/obras/${obra.id}/ejemplares`, { method: "POST", body: JSON.stringify({ cantidad: Number(agregar.cantidad), procedencia: agregar.procedencia, tipo_prestamo: agregar.tipo }) });
                    setAgregar(null);
                  })}>Agregar</Button>
                </div>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {gestiona && (
            <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-start">
              <Button variant="outline" size="sm" onClick={() => onEditar(obra)}><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
              <Button variant="outline" size="sm" onClick={() => setAgregar({ cantidad: "1", procedencia: "compra", tipo: "normal" })}><Plus className="w-4 h-4 mr-1" /> Agregar copias</Button>
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

export default ObraDetalle;
