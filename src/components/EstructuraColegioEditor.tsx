import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Clock, Plus, Trash2, GraduationCap, DoorOpen, Loader2 } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { ORDEN_GRADOS, rankGrado } from "@/utils/grados";

/**
 * Editor de estructura del colegio (Jornadas + Grados + Salones), compartido por:
 *  - "Configurar Institución" del Rector/Admin (sin `colegioId` → usa el del JWT).
 *  - El wizard "Crear Institución" del SuperAdmin (con `colegioId` → opera sobre
 *    ese borrador; el backend honra `colegio_id` solo para SuperAdmin).
 *
 * Consume /api/institucion/*. Toda escritura incluye `colegio_id` en el body (o
 * query en DELETE) cuando se pasa `colegioId`; si no, el backend usa el del JWT.
 */

interface Jornada { id: number; nombre: string; hora_aviso: string | null; hora_salida: string | null; orden: number | null; activa: boolean; }
interface Grado { id: number; grado: string; orden: number | null; activo: boolean; }
interface Salon { id: number; grado: string; salon: string; jornada_id: number | null; activo: boolean; }

/** Jornadas estándar que se ofrecen de un tap (sin que el usuario las escriba). */
const JORNADAS_ESTANDAR = ["Matutina", "Vespertina", "Nocturna"];

// ── Conversión 24h ⇄ 12h (AM/PM) para el selector de hora ──
const a24 = (h12: number, min: number, ampm: "AM" | "PM"): string => {
  let h = h12 % 12;
  if (ampm === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};
const de24 = (str?: string | null): { h12: number; min: number; ampm: "AM" | "PM" } | null => {
  if (!str) return null;
  const [hh, mm] = str.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const ampm: "AM" | "PM" = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return { h12, min: mm, ampm };
};

/**
 * Selector de hora amable: hora (1-12) + minutos (cada 5) + AM/PM.
 * `value`/`onChange` trabajan en formato 24h "HH:MM" (lo que guarda la BD).
 */
function SelectorHora({ value, onChange }: { value?: string | null; onChange: (v: string) => void }) {
  const parsed = de24(value);
  const h12 = parsed?.h12 ?? null;
  const min = parsed?.min ?? null;
  const ampm = parsed?.ampm ?? "AM";

  const emitir = (nh: number | null, nm: number | null, na: "AM" | "PM") => {
    if (nh === null || nm === null) return;
    onChange(a24(nh, nm, na));
  };

  return (
    <div className="flex items-center gap-1">
      <Select value={h12 != null ? String(h12) : ""} onValueChange={(v) => emitir(Number(v), min ?? 0, ampm)}>
        <SelectTrigger className="w-[68px]"><SelectValue placeholder="Hora" /></SelectTrigger>
        <SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select value={min != null ? String(min) : ""} onValueChange={(v) => emitir(h12, Number(v), ampm)}>
        <SelectTrigger className="w-[72px]"><SelectValue placeholder="Min" /></SelectTrigger>
        <SelectContent>{Array.from({ length: 12 }, (_, i) => i * 5).map((m) => <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={ampm} onValueChange={(v) => emitir(h12, min, v as "AM" | "PM")}>
        <SelectTrigger className="w-[68px]"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
      </Select>
    </div>
  );
}

interface Props {
  /** Si se pasa, opera sobre ese colegio (modo SuperAdmin). Si no, sobre el del JWT. */
  colegioId?: string;
  /** Mostrar el botón "Importar estructura actual" (solo útil con estudiantes ya cargados). */
  permitirImportar?: boolean;
}

const EstructuraColegioEditor = ({ colegioId, permitirImportar = false }: Props) => {
  const { toast } = useToast();
  const qCid = colegioId ? `?colegio_id=${encodeURIComponent(colegioId)}` : "";
  const withCid = (body: Record<string, unknown>) => (colegioId ? { ...body, colegio_id: colegioId } : body);

  const [loading, setLoading] = useState(true);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [grados, setGrados] = useState<Grado[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);

  const [jorNombre, setJorNombre] = useState("");
  const [jorHora, setJorHora] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [bulkGrados, setBulkGrados] = useState<string[]>([]);
  const [bulkCantidad, setBulkCantidad] = useState(1);
  const [bulkJornada, setBulkJornada] = useState<string>("none");
  const [aplicandoBulk, setAplicandoBulk] = useState(false);
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colegioId]);

  const err = (e: unknown, fallback: string) => {
    const detail = e instanceof ApiError ? ((e.body as any)?.detail || (e.body as any)?.error) : null;
    toast({ title: "Error", description: detail || fallback, variant: "destructive" });
  };

  const cargar = async () => {
    try {
      const r = await apiRequest<{ jornadas: Jornada[]; grados: Grado[]; salones: Salon[] }>(`/api/institucion/estructura${qCid}`);
      setJornadas(r.jornadas || []);
      setGrados(r.grados || []);
      setSalones(r.salones || []);
    } catch (e) {
      err(e, "No se pudo cargar la estructura.");
    } finally {
      setLoading(false);
    }
  };

  // ── Jornadas ──
  const crearJornadaNombre = async (nombre: string, hora_aviso: string | null) => {
    if (!nombre.trim()) { toast({ title: "Falta el nombre", description: "Ej: Matutina, Vespertina, Nocturna.", variant: "destructive" }); return; }
    setGuardando(true);
    try {
      await apiRequest("/api/institucion/jornadas", { method: "POST", body: JSON.stringify(withCid({ nombre: nombre.trim(), hora_aviso: hora_aviso || null, orden: jornadas.length })) });
      await cargar();
    } catch (e) { err(e, "No se pudo crear la jornada."); }
    setGuardando(false);
  };
  const crearJornada = async () => {
    await crearJornadaNombre(jorNombre, jorHora || null);
    setJorNombre(""); setJorHora("");
  };
  const editarHoraJornada = async (id: number, hora_aviso: string) => {
    try { await apiRequest(`/api/institucion/jornadas/${id}`, { method: "PATCH", body: JSON.stringify(withCid({ hora_aviso: hora_aviso || null })) }); await cargar(); }
    catch (e) { err(e, "No se pudo guardar la hora."); }
  };
  const editarHoraSalida = async (id: number, hora_salida: string) => {
    try { await apiRequest(`/api/institucion/jornadas/${id}`, { method: "PATCH", body: JSON.stringify(withCid({ hora_salida: hora_salida || null })) }); await cargar(); }
    catch (e) { err(e, "No se pudo guardar la hora de salida."); }
  };
  const borrarJornada = async (id: number) => {
    try { await apiRequest(`/api/institucion/jornadas/${id}${qCid}`, { method: "DELETE" }); await cargar(); }
    catch (e) { err(e, "No se pudo eliminar la jornada."); }
  };

  // ── Grados ──
  const gradosDeclarados = useMemo(() => new Set(grados.map((g) => g.grado)), [grados]);
  const toggleGrado = async (grado: string) => {
    const existente = grados.find((g) => g.grado === grado);
    try {
      if (existente) {
        await apiRequest(`/api/institucion/grados/${existente.id}${qCid}`, { method: "DELETE" });
      } else {
        await apiRequest("/api/institucion/grados", { method: "POST", body: JSON.stringify(withCid({ grado, orden: rankGrado(grado) })) });
      }
      await cargar();
    } catch (e) { err(e, "No se pudo actualizar el grado. (Si tiene salones, quítalos primero.)"); }
  };
  const gradosOrdenados = useMemo(
    () => [...grados].sort((a, b) => rankGrado(a.grado) - rankGrado(b.grado)),
    [grados],
  );

  // ── Salones ──
  const salonesDeGrado = (grado: string) =>
    salones.filter((s) => s.grado === grado).sort((a, b) => Number(a.salon) - Number(b.salon));
  const agregarSalon = async (grado: string) => {
    const actuales = salonesDeGrado(grado).map((s) => Number(s.salon));
    const siguiente = actuales.length === 0 ? 1 : Math.max(...actuales) + 1;
    if (siguiente > 10) { toast({ title: "Máximo 10 salones", description: "Un grado admite hasta 10 salones.", variant: "destructive" }); return; }
    try { await apiRequest("/api/institucion/salones", { method: "POST", body: JSON.stringify(withCid({ grado, salon: String(siguiente) })) }); await cargar(); }
    catch (e) { err(e, "No se pudo agregar el salón."); }
  };
  const asignarJornada = async (id: number, jornada_id: number | null) => {
    try { await apiRequest(`/api/institucion/salones/${id}`, { method: "PATCH", body: JSON.stringify(withCid({ jornada_id })) }); await cargar(); }
    catch (e) { err(e, "No se pudo asignar la jornada."); }
  };
  const borrarSalon = async (id: number) => {
    try { await apiRequest(`/api/institucion/salones/${id}${qCid}`, { method: "DELETE" }); await cargar(); }
    catch (e) { err(e, "No se pudo eliminar el salón."); }
  };

  const toggleBulkGrado = (g: string) => setBulkGrados((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  const aplicarBulk = async () => {
    if (bulkGrados.length === 0) { toast({ title: "Elige grados", description: "Selecciona al menos un grado.", variant: "destructive" }); return; }
    setAplicandoBulk(true);
    try {
      await apiRequest("/api/institucion/salones/bulk", { method: "POST", body: JSON.stringify(withCid({ grados: bulkGrados, cantidad: bulkCantidad, jornada_id: bulkJornada === "none" ? null : Number(bulkJornada) })) });
      setBulkGrados([]);
      await cargar();
      toast({ title: "Salones aplicados", description: `${bulkCantidad} salón(es) en ${bulkGrados.length} grado(s).` });
    } catch (e) { err(e, "No se pudo aplicar."); }
    setAplicandoBulk(false);
  };
  const importarEstructura = async () => {
    setImportando(true);
    try {
      const r = await apiRequest<{ grados: number; salones: number }>("/api/institucion/importar-estructura", { method: "POST", body: JSON.stringify(withCid({})) });
      await cargar();
      toast({ title: "Estructura importada", description: `${r.grados} grado(s) y ${r.salones} salón(es) traídos de los estudiantes actuales.` });
    } catch (e) { err(e, "No se pudo importar la estructura."); }
    setImportando(false);
  };

  if (loading) return <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-6">
      {/* ── JORNADAS ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Clock className="h-5 w-5 text-primary" /> Jornadas</CardTitle>
          <p className="text-sm text-muted-foreground">Define las jornadas del colegio, la hora del aviso de actividades y la hora de salida de cada jornada (la salida se usa para saber cuándo una actividad del día ya pasó).</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {jornadas.map((j) => (
            <div key={j.id} className="flex items-center gap-3 border border-border rounded-md p-3 flex-wrap">
              <span className="font-medium flex-1 min-w-[90px]">{j.nombre}</span>
              <label className="text-xs text-muted-foreground">Aviso a las</label>
              <SelectorHora value={j.hora_aviso} onChange={(v) => editarHoraJornada(j.id, v)} />
              <label className="text-xs text-muted-foreground">Salida a las</label>
              <SelectorHora value={j.hora_salida} onChange={(v) => editarHoraSalida(j.id, v)} />
              <button onClick={() => borrarJornada(j.id)} className="text-muted-foreground hover:text-destructive" title="Eliminar jornada"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}

          {/* Jornadas estándar de un tap (no hay que escribirlas). */}
          {JORNADAS_ESTANDAR.some((n) => !jornadas.some((j) => j.nombre.toLowerCase() === n.toLowerCase())) && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Agrega una jornada (luego le pones la hora de aviso):</p>
              <div className="flex flex-wrap gap-2">
                {JORNADAS_ESTANDAR.filter((n) => !jornadas.some((j) => j.nombre.toLowerCase() === n.toLowerCase())).map((n) => (
                  <Button key={n} variant="outline" size="sm" disabled={guardando} onClick={() => crearJornadaNombre(n, null)}>
                    <Plus className="w-4 h-4 mr-1" /> {n}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Otra jornada con nombre personalizado. */}
          <details className="pt-1">
            <summary className="text-xs text-primary cursor-pointer">Otra jornada (nombre personalizado)</summary>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Input value={jorNombre} onChange={(e) => setJorNombre(e.target.value)} placeholder="Nombre de la jornada" className="flex-1 min-w-[160px]" />
              <SelectorHora value={jorHora} onChange={setJorHora} />
              <Button onClick={crearJornada} disabled={guardando}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* ── GRADOS ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><GraduationCap className="h-5 w-5 text-primary" /> Grados</CardTitle>
          <p className="text-sm text-muted-foreground">Marca los grados que ofrece el colegio.{permitirImportar ? " Si el colegio ya tiene estudiantes, puedes traer su estructura actual con un clic." : ""}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {permitirImportar && (
            <div>
              <Button variant="outline" size="sm" onClick={importarEstructura} disabled={importando}>
                {importando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Importar estructura actual (según los estudiantes)
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {ORDEN_GRADOS.map((g) => {
              const on = gradosDeclarados.has(g);
              return (
                <button key={g} onClick={() => toggleGrado(g)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors cursor-pointer ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted/50"}`}>
                  {g}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── SALONES ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><DoorOpen className="h-5 w-5 text-primary" /> Salones</CardTitle>
          <p className="text-sm text-muted-foreground">Asigna salones a varios grados de un golpe, o ajusta cada grado abajo.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {gradosOrdenados.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Primero marca los grados arriba.</p>
          ) : (
            <div className="border border-primary/30 bg-primary/5 rounded-md p-3 space-y-3">
              <p className="text-sm font-medium">Asignación rápida</p>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">1. Elige los grados</label>
                <div className="flex flex-wrap gap-1.5">
                  {gradosOrdenados.map((g) => {
                    const on = bulkGrados.includes(g.grado);
                    return (
                      <button key={g.id} type="button" onClick={() => toggleBulkGrado(g.grado)}
                        className={`px-2.5 py-1 rounded-full border text-xs transition-colors cursor-pointer ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted/50"}`}>
                        {g.grado}
                      </button>
                    );
                  })}
                </div>
                {gradosOrdenados.length > 1 && (
                  <button type="button" onClick={() => setBulkGrados(bulkGrados.length === gradosOrdenados.length ? [] : gradosOrdenados.map((g) => g.grado))}
                    className="text-xs text-primary hover:underline mt-1">
                    {bulkGrados.length === gradosOrdenados.length ? "Quitar todos" : "Seleccionar todos"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">2. Nº de salones</label>
                  <Select value={String(bulkCantidad)} onValueChange={(v) => setBulkCantidad(Number(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">3. Jornada</label>
                  <Select value={bulkJornada} onValueChange={setBulkJornada}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Sin jornada" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin jornada</SelectItem>
                      {jornadas.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={aplicarBulk} disabled={aplicandoBulk || bulkGrados.length === 0}>
                  {aplicandoBulk && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Aplicar a {bulkGrados.length || 0} grado(s)
                </Button>
              </div>
            </div>
          )}
          {gradosOrdenados.map((g) => {
            const sals = salonesDeGrado(g.grado);
            return (
              <div key={g.id} className="border border-border rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">{g.grado} <span className="text-xs text-muted-foreground font-normal">({sals.length} {sals.length === 1 ? "salón" : "salones"})</span></span>
                  <Button size="sm" variant="outline" onClick={() => agregarSalon(g.grado)} disabled={sals.length >= 10}><Plus className="w-4 h-4 mr-1" /> Salón</Button>
                </div>
                {sals.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sin salones. Agrega el primero.</p>
                ) : (
                  <div className="space-y-2">
                    {sals.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 text-sm">
                        <span className="w-20">Salón {s.salon}</span>
                        <Select value={s.jornada_id ? String(s.jornada_id) : "none"} onValueChange={(v) => asignarJornada(s.id, v === "none" ? null : Number(v))}>
                          <SelectTrigger className="w-48"><SelectValue placeholder="Sin jornada" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin jornada</SelectItem>
                            {jornadas.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <button onClick={() => borrarSalon(s.id)} className="text-muted-foreground hover:text-destructive" title="Eliminar salón"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {jornadas.length === 0 && gradosOrdenados.length > 0 && (
            <p className="text-xs text-amber-700">Tip: crea jornadas arriba para poder asignarlas a los salones.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EstructuraColegioEditor;
