import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Layers, Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, ListOrdered } from "lucide-react";

/**
 * Áreas académicas (para boletines) + orden del boletín.
 *  - Un área agrupa asignaturas con un peso (%): en el boletín se imprime la
 *    fila del área (nota ponderada) y debajo sus componentes, como el informe
 *    del Pestalozziano. `grado` vacío = aplica a todos los grados.
 *  - El orden del boletín es UNA sola lista que intercala áreas y asignaturas
 *    sueltas (las que no pertenecen a ningún área) — flechas ↑↓.
 * Permisos: igual que Asignaturas (Coordinador o más; el server valida).
 */

interface Area { id: string; nombre: string; orden: number | null }
interface Componente { id: string; area_id: string; asignatura: string; peso: number; grado: string | null }
interface Asignatura { id: number; nombre: string; activa: boolean; orden_boletin?: number | null }

interface Props { colegioId?: string }

const AreasColegioEditor = ({ colegioId }: Props) => {
  const { toast } = useToast();
  const qCid = colegioId ? `?colegio_id=${encodeURIComponent(colegioId)}` : "";
  const withCid = (body: Record<string, unknown>) => (colegioId ? { ...body, colegio_id: colegioId } : body);

  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<Area[]>([]);
  const [composicion, setComposicion] = useState<Componente[]>([]);
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [grados, setGrados] = useState<string[]>([]);

  const cargar = async () => {
    try {
      const [a, ap, est] = await Promise.all([
        apiRequest<{ areas: Area[]; composicion: Componente[] }>(`/api/institucion/areas${qCid}`),
        apiRequest<{ asignaturas: Asignatura[] }>(`/api/institucion/asignaturas-plan${qCid}`),
        apiRequest<{ grados: Array<{ nombre: string }> }>(`/api/institucion/estructura${qCid}`).catch(() => ({ grados: [] as Array<{ nombre: string }> })),
      ]);
      setAreas(a.areas || []);
      setComposicion(a.composicion || []);
      setAsignaturas((ap.asignaturas || []).filter((x) => x.activa));
      setGrados(((est as any).grados || []).map((g: any) => g.nombre));
    } catch {
      toast({ title: "No se pudieron cargar las áreas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [colegioId]);

  // ── Crear / renombrar / eliminar área ──
  const [nuevaArea, setNuevaArea] = useState("");
  const [creando, setCreando] = useState(false);
  const crearArea = async () => {
    const nombre = nuevaArea.trim();
    if (!nombre) return;
    setCreando(true);
    try {
      await apiRequest("/api/institucion/areas", { method: "POST", body: JSON.stringify(withCid({ nombre })) });
      setNuevaArea("");
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo crear", description: e?.body?.detail || e?.message, variant: "destructive" });
    } finally { setCreando(false); }
  };

  const [renombrando, setRenombrando] = useState<Area | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const renombrar = async () => {
    if (!renombrando || !nuevoNombre.trim()) return;
    try {
      await apiRequest(`/api/institucion/areas/${renombrando.id}`, { method: "PATCH", body: JSON.stringify(withCid({ nombre: nuevoNombre.trim() })) });
      setRenombrando(null);
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo renombrar", description: e?.body?.detail || e?.message, variant: "destructive" });
    }
  };

  const [borrando, setBorrando] = useState<Area | null>(null);
  const borrar = async () => {
    if (!borrando) return;
    try {
      await apiRequest(`/api/institucion/areas/${borrando.id}${qCid}`, { method: "DELETE" });
      setBorrando(null);
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo eliminar", description: e?.body?.detail || e?.message, variant: "destructive" });
    }
  };

  // ── Componer área (asignaturas + pesos) ──
  const [componiendo, setComponiendo] = useState<Area | null>(null);
  const [filas, setFilas] = useState<Array<{ asignatura: string; peso: string; grado: string }>>([]);
  const [guardandoComp, setGuardandoComp] = useState(false);
  const abrirComponer = (a: Area) => {
    const propias = composicion.filter((c) => c.area_id === a.id);
    setFilas(propias.length > 0
      ? propias.map((c) => ({ asignatura: c.asignatura, peso: String(c.peso), grado: c.grado || "" }))
      : [{ asignatura: "", peso: "", grado: "" }]);
    setComponiendo(a);
  };
  const guardarComposicion = async () => {
    if (!componiendo) return;
    const items = filas
      .map((f) => ({ asignatura: f.asignatura, peso: Number(f.peso), grado: f.grado || null }))
      .filter((f) => f.asignatura && Number.isFinite(f.peso) && f.peso > 0);
    setGuardandoComp(true);
    try {
      await apiRequest(`/api/institucion/areas/${componiendo.id}/asignaturas`, {
        method: "PUT", body: JSON.stringify(withCid({ items })),
      });
      setComponiendo(null);
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.body?.detail || e?.message, variant: "destructive" });
    } finally { setGuardandoComp(false); }
  };

  // ── Orden del boletín: áreas + asignaturas sueltas en una sola lista ──
  const asignadasAArea = useMemo(() => new Set(composicion.map((c) => c.asignatura)), [composicion]);
  type ItemOrden = { tipo: "area" | "asignatura"; id: string | number; nombre: string; orden: number | null };
  const listaOrden: ItemOrden[] = useMemo(() => {
    const items: ItemOrden[] = [
      ...areas.map((a) => ({ tipo: "area" as const, id: a.id, nombre: a.nombre, orden: a.orden })),
      ...asignaturas.filter((s) => !asignadasAArea.has(s.nombre))
        .map((s) => ({ tipo: "asignatura" as const, id: s.id, nombre: s.nombre, orden: s.orden_boletin ?? null })),
    ];
    return items.sort((x, y) => {
      if (x.orden != null && y.orden != null) return x.orden - y.orden;
      if (x.orden != null) return -1;
      if (y.orden != null) return 1;
      return x.nombre.localeCompare(y.nombre, "es");
    });
  }, [areas, asignaturas, asignadasAArea]);

  const [guardandoOrden, setGuardandoOrden] = useState(false);
  const mover = async (idx: number, delta: -1 | 1) => {
    const destino = idx + delta;
    if (destino < 0 || destino >= listaOrden.length) return;
    const nueva = [...listaOrden];
    [nueva[idx], nueva[destino]] = [nueva[destino], nueva[idx]];
    setGuardandoOrden(true);
    try {
      await apiRequest("/api/institucion/boletin-orden", {
        method: "PUT",
        body: JSON.stringify(withCid({ items: nueva.map((it, i) => ({ tipo: it.tipo, id: it.id, orden: i + 1 })) })),
      });
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo reordenar", description: e?.body?.detail || e?.message, variant: "destructive" });
    } finally { setGuardandoOrden(false); }
  };

  const sumaPesos = filas.reduce((acc, f) => acc + (Number(f.peso) || 0), 0);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* ── Áreas ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> Áreas (para el boletín)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Un área agrupa asignaturas con un peso. En el boletín se imprime el área con su nota ponderada y debajo sus asignaturas
            (ej. Ciencias Sociales = Ciencias Sociales 80% + Cátedra Afro 20%). Las asignaturas sin área se imprimen solas.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={nuevaArea} onChange={(e) => setNuevaArea(e.target.value)} placeholder="Nombre del área (ej. Ciencias Sociales)"
              onKeyDown={(e) => e.key === "Enter" && crearArea()} />
            <Button onClick={crearArea} disabled={creando || !nuevaArea.trim()} className="gap-1 shrink-0">
              {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear área
            </Button>
          </div>

          {areas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aún no hay áreas. Si el colegio no usa áreas compuestas, no es obligatorio crearlas.</p>
          ) : (
            <div className="space-y-2">
              {areas.map((a) => {
                const comps = composicion.filter((c) => c.area_id === a.id);
                return (
                  <div key={a.id} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{a.nombre}</p>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => abrirComponer(a)}>Asignaturas y pesos</Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setRenombrando(a); setNuevoNombre(a.nombre); }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setBorrando(a)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {comps.length > 0 ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        {comps.map((c) => `${c.asignatura} ${c.peso}%${c.grado ? ` (${c.grado})` : ""}`).join(" · ")}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 mt-1">Sin asignaturas — configúrale la composición.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Orden del boletín ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ListOrdered className="w-4 h-4 text-primary" /> Orden del boletín</CardTitle>
          <p className="text-sm text-muted-foreground">Así se listarán las áreas y asignaturas en el boletín. Usa las flechas para acomodar el orden del colegio.</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {listaOrden.map((it, idx) => (
              <div key={`${it.tipo}-${it.id}`} className="flex items-center justify-between gap-2 border border-border rounded-md px-3 py-1.5 bg-card">
                <span className="text-sm text-foreground">
                  <span className="text-muted-foreground mr-2 tabular-nums">{idx + 1}.</span>
                  {it.nombre}
                  {it.tipo === "area" && <span className="ml-2 text-[10px] uppercase font-medium text-primary bg-primary/10 rounded px-1.5 py-0.5">Área</span>}
                </span>
                <span className="flex gap-0.5">
                  <button disabled={guardandoOrden || idx === 0} onClick={() => mover(idx, -1)} className="p-1 rounded hover:bg-muted disabled:opacity-30">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button disabled={guardandoOrden || idx === listaOrden.length - 1} onClick={() => mover(idx, 1)} className="p-1 rounded hover:bg-muted disabled:opacity-30">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Dialog: componer área ── */}
      <Dialog open={!!componiendo} onOpenChange={(o) => !o && setComponiendo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{componiendo?.nombre} — asignaturas y pesos</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {filas.map((f, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={f.asignatura} onChange={(e) => setFilas(filas.map((x, j) => j === i ? { ...x, asignatura: e.target.value } : x))}
                  className="flex-1 h-9 rounded-md border border-input bg-card px-2 text-sm">
                  <option value="">Asignatura…</option>
                  {asignaturas.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                </select>
                <Input value={f.peso} onChange={(e) => setFilas(filas.map((x, j) => j === i ? { ...x, peso: e.target.value } : x))}
                  placeholder="%" className="w-16 text-center" inputMode="numeric" />
                <select value={f.grado} onChange={(e) => setFilas(filas.map((x, j) => j === i ? { ...x, grado: e.target.value } : x))}
                  className="w-32 h-9 rounded-md border border-input bg-card px-2 text-sm" title="Grado (vacío = todos)">
                  <option value="">Todos los grados</option>
                  {grados.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <button onClick={() => setFilas(filas.filter((_, j) => j !== i))} className="p-1.5 rounded hover:bg-muted text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setFilas([...filas, { asignatura: "", peso: "", grado: "" }])} className="gap-1">
              <Plus className="w-4 h-4" /> Agregar asignatura
            </Button>
            <p className={`text-sm font-medium ${Math.abs(sumaPesos - 100) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>
              Suma: {sumaPesos}% {Math.abs(sumaPesos - 100) < 0.01 ? "✓" : "(debe sumar 100%)"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComponiendo(null)}>Cancelar</Button>
            <Button onClick={guardarComposicion} disabled={guardandoComp} className="gap-2">
              {guardandoComp && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: renombrar ── */}
      <Dialog open={!!renombrando} onOpenChange={(o) => !o && setRenombrando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Renombrar área</DialogTitle></DialogHeader>
          <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && renombrar()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenombrando(null)}>Cancelar</Button>
            <Button onClick={renombrar}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: eliminar ── */}
      <Dialog open={!!borrando} onOpenChange={(o) => !o && setBorrando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar el área "{borrando?.nombre}"?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Las asignaturas NO se borran — solo dejan de agruparse: volverán a imprimirse sueltas en el boletín.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrando(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={borrar}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AreasColegioEditor;
