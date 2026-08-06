import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Clock, Plus, Trash2, GraduationCap, DoorOpen, Loader2, Layers, Pencil, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { ORDEN_GRADOS, rankGrado } from "@/utils/grados";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Editor de estructura del colegio (Jornadas + Grados + Salones), compartido por:
 *  - "Configurar Institución" del Rector/Admin (sin `colegioId` → usa el del JWT).
 *  - El wizard "Crear Institución" del SuperAdmin (con `colegioId` → opera sobre
 *    ese borrador; el backend honra `colegio_id` solo para SuperAdmin).
 *
 * Consume /api/institucion/*. Toda escritura incluye `colegio_id` en el body (o
 * query en DELETE) cuando se pasa `colegioId`; si no, el backend usa el del JWT.
 */

interface Jornada { id: number; nombre: string; hora_entrada: string | null; hora_salida: string | null; hora_aviso: string | null; orden: number | null; activa: boolean; }
interface Grado { id: number; grado: string; nivel: string | null; orden: number | null; activo: boolean; }
interface Salon { id: number; grado: string; salon: string; jornada_id: number | null; activo: boolean; }
interface Nivel { id: number; nombre: string; orden: number | null; activo: boolean; }

/** Jornadas estándar que se ofrecen de un tap (sin que el usuario las escriba). */
const JORNADAS_ESTANDAR = ["Matutina", "Vespertina", "Nocturna"];
/** Niveles estándar que se ofrecen de un tap. */
const NIVELES_ESTANDAR = ["Preescolar", "Primaria", "Secundaria", "Media"];
const SIN_NIVEL = "__sin__";

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
  const [niveles, setNiveles] = useState<Nivel[]>([]);

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
      const r = await apiRequest<{ jornadas: Jornada[]; grados: Grado[]; salones: Salon[]; niveles: Nivel[] }>(`/api/institucion/estructura${qCid}`);
      setJornadas(r.jornadas || []);
      setGrados(r.grados || []);
      setSalones(r.salones || []);
      setNiveles(r.niveles || []);
    } catch (e) {
      err(e, "No se pudo cargar la estructura.");
    } finally {
      setLoading(false);
    }
  };

  // ── Jornadas ──
  const crearJornadaNombre = async (nombre: string) => {
    if (!nombre.trim()) { toast({ title: "Falta el nombre", description: "Ej: Matutina, Vespertina, Nocturna.", variant: "destructive" }); return; }
    setGuardando(true);
    try {
      await apiRequest("/api/institucion/jornadas", { method: "POST", body: JSON.stringify(withCid({ nombre: nombre.trim(), orden: jornadas.length })) });
      await cargar();
    } catch (e) { err(e, "No se pudo crear la jornada."); }
    setGuardando(false);
  };
  const crearJornada = async () => {
    await crearJornadaNombre(jorNombre);
    setJorNombre("");
  };
  const editarHoraEntrada = async (id: number, hora_entrada: string) => {
    try { await apiRequest(`/api/institucion/jornadas/${id}`, { method: "PATCH", body: JSON.stringify(withCid({ hora_entrada: hora_entrada || null })) }); await cargar(); }
    catch (e) { err(e, "No se pudo guardar la hora de entrada."); }
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
        await apiRequest("/api/institucion/grados", { method: "POST", body: JSON.stringify(withCid({ grado, nivel: nivelSugerido(grado), orden: rankGrado(grado) })) });
      }
      await cargar();
    } catch (e) { err(e, "No se pudo actualizar el grado. (Si tiene salones, quítalos primero.)"); }
  };
  const gradosOrdenados = useMemo(
    () => [...grados].sort((a, b) =>
      (a.orden ?? 999) - (b.orden ?? 999)                  // orden configurado por el colegio
      || rankGrado(a.grado) - rankGrado(b.grado)           // respaldo: posición canónica
      || a.grado.localeCompare(b.grado, "es")),
    [grados],
  );

  /** Nivel estándar sugerido para un grado estándar (para el alta rápida). */
  const nivelSugerido = (grado: string): string | null => {
    if (["Párvulo", "Prejardín", "Jardín", "Transición"].includes(grado)) return "Preescolar";
    if (["Primero", "Segundo", "Tercero", "Cuarto", "Quinto"].includes(grado)) return "Primaria";
    if (["Sexto", "Séptimo", "Octavo", "Noveno"].includes(grado)) return "Secundaria";
    if (["Décimo", "Undécimo"].includes(grado)) return "Media";
    return null;
  };

  // ── Niveles ──
  const nivelesOrdenados = useMemo(
    () => [...niveles].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.nombre.localeCompare(b.nombre, "es")),
    [niveles],
  );

  // Reordenar: intercambia con el vecino y reasigna `orden` secuencial (0..n),
  // guardando solo los que cambian. Sirve para grados y niveles.
  const [reordenando, setReordenando] = useState(false);
  const reordenar = async (endpoint: string, arr: { id: number; orden: number | null }[], id: number, delta: number) => {
    const i = arr.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    setReordenando(true);
    try {
      await Promise.all(
        next.flatMap((x, idx) => (x.orden === idx ? [] : [apiRequest(`${endpoint}/${x.id}`, { method: "PATCH", body: JSON.stringify(withCid({ orden: idx })) })])),
      );
      await cargar();
    } catch (e) { err(e, "No se pudo reordenar."); }
    setReordenando(false);
  };
  const moverNivel = (id: number, delta: number) => reordenar("/api/institucion/niveles", nivelesOrdenados, id, delta);
  const moverGrado = (id: number, delta: number) => reordenar("/api/institucion/grados", gradosOrdenados, id, delta);
  const [nivNombre, setNivNombre] = useState("");
  const crearNivelNombre = async (nombre: string) => {
    if (!nombre.trim()) return;
    try {
      await apiRequest("/api/institucion/niveles", { method: "POST", body: JSON.stringify(withCid({ nombre: nombre.trim(), orden: niveles.length })) });
      await cargar();
    } catch (e) { err(e, "No se pudo crear el nivel."); }
  };
  const [editNivel, setEditNivel] = useState<{ id: number; nombre: string } | null>(null);
  const [guardandoNivel, setGuardandoNivel] = useState(false);
  const guardarNombreNivel = async () => {
    if (!editNivel || !editNivel.nombre.trim()) return;
    setGuardandoNivel(true);
    try {
      await apiRequest(`/api/institucion/niveles/${editNivel.id}`, { method: "PATCH", body: JSON.stringify(withCid({ nombre: editNivel.nombre.trim() })) });
      setEditNivel(null);
      await cargar();
    } catch (e) { err(e, "No se pudo renombrar el nivel."); }
    setGuardandoNivel(false);
  };
  const borrarNivel = async (id: number) => {
    try { await apiRequest(`/api/institucion/niveles/${id}${qCid}`, { method: "DELETE" }); await cargar(); }
    catch (e) { err(e, "No se pudo eliminar el nivel."); }
  };

  // ── Grados (custom + nivel + renombrar) ──
  const [gradoNombre, setGradoNombre] = useState("");
  const crearGradoCustom = async (grado: string) => {
    if (!grado.trim()) return;
    try {
      await apiRequest("/api/institucion/grados", { method: "POST", body: JSON.stringify(withCid({ grado: grado.trim(), orden: 900 })) });
      setGradoNombre("");
      await cargar();
    } catch (e) { err(e, "No se pudo crear el grado."); }
  };
  const setNivelGrado = async (id: number, nivel: string | null) => {
    try { await apiRequest(`/api/institucion/grados/${id}`, { method: "PATCH", body: JSON.stringify(withCid({ nivel })) }); await cargar(); }
    catch (e) { err(e, "No se pudo cambiar el nivel del grado."); }
  };
  const [editGrado, setEditGrado] = useState<{ id: number; grado: string } | null>(null);
  const [guardandoGrado, setGuardandoGrado] = useState(false);
  const guardarNombreGrado = async () => {
    if (!editGrado || !editGrado.grado.trim()) return;
    setGuardandoGrado(true);
    try {
      await apiRequest(`/api/institucion/grados/${editGrado.id}`, { method: "PATCH", body: JSON.stringify(withCid({ grado: editGrado.grado.trim() })) });
      setEditGrado(null);
      await cargar();
    } catch (e) { err(e, "No se pudo renombrar el grado."); }
    setGuardandoGrado(false);
  };

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

  // ── Cinturón de seguridad al borrar: si el salón tiene estudiantes
  //    matriculados, pop-up de advertencia antes de eliminarlo. El conteo se
  //    carga solo en el colegio propio (el wizard SuperAdmin opera sobre
  //    borradores sin estudiantes y no puede leer Estudiantes por el proxy).
  const [conteoEst, setConteoEst] = useState<Record<string, number>>({});
  useEffect(() => {
    if (colegioId) return;
    (supabase.from("Estudiantes").select("grado, salon") as any).fetchAll()
      .then(({ data }: any) => {
        const m: Record<string, number> = {};
        for (const r of (data || [])) {
          if (!r.grado || r.salon == null) continue;
          const k = `${r.grado}|${String(r.salon)}`;
          m[k] = (m[k] || 0) + 1;
        }
        setConteoEst(m);
      })
      .catch(() => { /* sin conteo: el pop-up simplemente no se dispara */ });
  }, [colegioId]);
  const [confirmSalon, setConfirmSalon] = useState<{ id: number; grado: string; salon: string; n: number } | null>(null);
  const [borrandoSalon, setBorrandoSalon] = useState(false);
  const intentarBorrarSalon = (s: Salon) => {
    const n = conteoEst[`${s.grado}|${String(s.salon)}`] || 0;
    if (n > 0) setConfirmSalon({ id: s.id, grado: s.grado, salon: String(s.salon), n });
    else borrarSalon(s.id);
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
          <p className="text-sm text-muted-foreground">Define las jornadas con su hora de entrada y salida. El aviso de actividades se envía automáticamente <strong>5 minutos después de la salida</strong>.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {jornadas.map((j) => (
            <div key={j.id} className="flex items-center gap-3 border border-border rounded-md p-3 flex-wrap">
              <span className="font-medium flex-1 min-w-[90px]">{j.nombre}</span>
              <label className="text-xs text-muted-foreground">Entrada</label>
              <SelectorHora value={j.hora_entrada} onChange={(v) => editarHoraEntrada(j.id, v)} />
              <label className="text-xs text-muted-foreground">Salida</label>
              <SelectorHora value={j.hora_salida} onChange={(v) => editarHoraSalida(j.id, v)} />
              <button onClick={() => borrarJornada(j.id)} className="text-muted-foreground hover:text-destructive" title="Eliminar jornada"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}

          {/* Jornadas estándar de un tap (no hay que escribirlas). */}
          {JORNADAS_ESTANDAR.some((n) => !jornadas.some((j) => j.nombre.toLowerCase() === n.toLowerCase())) && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Agrega una jornada (luego le pones entrada y salida):</p>
              <div className="flex flex-wrap gap-2">
                {JORNADAS_ESTANDAR.filter((n) => !jornadas.some((j) => j.nombre.toLowerCase() === n.toLowerCase())).map((n) => (
                  <Button key={n} variant="outline" size="sm" disabled={guardando} onClick={() => crearJornadaNombre(n)}>
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
              <Button onClick={crearJornada} disabled={guardando}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* ── NIVELES ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Layers className="h-5 w-5 text-primary" /> Niveles</CardTitle>
          <p className="text-sm text-muted-foreground">Los niveles agrupan los grados (ej: Preescolar, Primaria…). Cada grado pertenece a un nivel; los coordinadores y los comunicados pueden dirigirse a un nivel completo.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {nivelesOrdenados.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {nivelesOrdenados.map((n, idx) => (
                <div key={n.id} className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full border border-primary/40 bg-primary/5 text-sm">
                  <button onClick={() => moverNivel(n.id, -1)} disabled={idx === 0 || reordenando} className="text-muted-foreground hover:text-primary p-0.5 disabled:opacity-30" title="Mover antes"><ChevronLeft className="w-3.5 h-3.5" /></button>
                  <button onClick={() => moverNivel(n.id, 1)} disabled={idx === nivelesOrdenados.length - 1 || reordenando} className="text-muted-foreground hover:text-primary p-0.5 disabled:opacity-30" title="Mover después"><ChevronRight className="w-3.5 h-3.5" /></button>
                  <span className="font-medium">{n.nombre}</span>
                  <button onClick={() => setEditNivel({ id: n.id, nombre: n.nombre })} className="text-muted-foreground hover:text-primary p-0.5" title="Renombrar nivel"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => borrarNivel(n.id)} className="text-muted-foreground hover:text-destructive p-0.5" title="Eliminar nivel"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          {/* Niveles estándar de un tap */}
          {NIVELES_ESTANDAR.some((n) => !niveles.some((x) => x.nombre.toLowerCase() === n.toLowerCase())) && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground mb-2">Agrega un nivel:</p>
              <div className="flex flex-wrap gap-2">
                {NIVELES_ESTANDAR.filter((n) => !niveles.some((x) => x.nombre.toLowerCase() === n.toLowerCase())).map((n) => (
                  <Button key={n} variant="outline" size="sm" onClick={() => crearNivelNombre(n)}><Plus className="w-4 h-4 mr-1" /> {n}</Button>
                ))}
              </div>
            </div>
          )}
          <details className="pt-1">
            <summary className="text-xs text-primary cursor-pointer">Otro nivel (nombre personalizado)</summary>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Input value={nivNombre} onChange={(e) => setNivNombre(e.target.value)} placeholder="Nombre del nivel" className="flex-1 min-w-[160px]" maxLength={40} />
              <Button onClick={async () => { await crearNivelNombre(nivNombre); setNivNombre(""); }}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* ── GRADOS ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><GraduationCap className="h-5 w-5 text-primary" /> Grados</CardTitle>
          <p className="text-sm text-muted-foreground">Marca los grados que ofrece el colegio y asígnale un nivel a cada uno.{permitirImportar ? " Si el colegio ya tiene estudiantes, puedes traer su estructura actual con un clic." : ""}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {permitirImportar && (
            <div>
              <Button variant="outline" size="sm" onClick={importarEstructura} disabled={importando}>
                {importando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Importar estructura actual (según los estudiantes)
              </Button>
            </div>
          )}

          {/* Alta rápida: grados estándar (toggle). */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Alta rápida (toca para agregar o quitar):</p>
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
          </div>

          {/* Grado personalizado. */}
          <details>
            <summary className="text-xs text-primary cursor-pointer">Otro grado (nombre personalizado)</summary>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Input value={gradoNombre} onChange={(e) => setGradoNombre(e.target.value)} placeholder="Nombre del grado" className="flex-1 min-w-[160px]" maxLength={40} />
              <Button onClick={() => crearGradoCustom(gradoNombre)}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
            </div>
          </details>

          {/* Lista de grados declarados: nivel + renombrar + borrar. */}
          {gradosOrdenados.length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Grados del colegio ({gradosOrdenados.length}):</p>
              {gradosOrdenados.map((g, idx) => (
                <div key={g.id} className="flex items-center gap-2 flex-wrap border border-border rounded-md px-3 py-2">
                  <div className="flex flex-col -my-1">
                    <button onClick={() => moverGrado(g.id, -1)} disabled={idx === 0 || reordenando} className="text-muted-foreground hover:text-primary disabled:opacity-30" title="Subir"><ChevronUp className="w-4 h-4" /></button>
                    <button onClick={() => moverGrado(g.id, 1)} disabled={idx === gradosOrdenados.length - 1 || reordenando} className="text-muted-foreground hover:text-primary disabled:opacity-30" title="Bajar"><ChevronDown className="w-4 h-4" /></button>
                  </div>
                  <span className="font-medium flex-1 min-w-[90px]">{g.grado}</span>
                  <label className="text-xs text-muted-foreground">Nivel</label>
                  <Select value={g.nivel ?? SIN_NIVEL} onValueChange={(v) => setNivelGrado(g.id, v === SIN_NIVEL ? null : v)}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Sin nivel" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_NIVEL}>Sin nivel</SelectItem>
                      {nivelesOrdenados.map((n) => <SelectItem key={n.id} value={n.nombre}>{n.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button onClick={() => setEditGrado({ id: g.id, grado: g.grado })} className="text-muted-foreground hover:text-primary p-1" title="Renombrar grado"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => toggleGrado(g.grado)} className="text-muted-foreground hover:text-destructive p-1" title="Eliminar grado"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {niveles.length === 0 && (
                <p className="text-xs text-amber-700">Tip: crea niveles arriba para poder asignarlos a los grados.</p>
              )}
            </div>
          )}
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
                        <button onClick={() => intentarBorrarSalon(s)} className="text-muted-foreground hover:text-destructive" title="Eliminar salón"><Trash2 className="w-4 h-4" /></button>
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

      {/* Renombrar NIVEL (se propaga a grados, estudiantes, comunicados…) */}
      <Dialog open={!!editNivel} onOpenChange={(o) => { if (!o) setEditNivel(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renombrar nivel</DialogTitle>
            <DialogDescription className="pt-1">El nuevo nombre se aplicará en todo el colegio (grados, estudiantes, coordinadores y comunicados de ese nivel).</DialogDescription>
          </DialogHeader>
          <Input value={editNivel?.nombre ?? ""} onChange={(e) => setEditNivel((p) => p ? { ...p, nombre: e.target.value } : p)} maxLength={40} autoFocus onKeyDown={(e) => { if (e.key === "Enter") guardarNombreNivel(); }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNivel(null)} disabled={guardandoNivel}>Cancelar</Button>
            <Button onClick={guardarNombreNivel} disabled={guardandoNivel || !editNivel?.nombre.trim()}>{guardandoNivel && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renombrar GRADO (se propaga a notas, actividades, asistencia, asignaciones…) */}
      <Dialog open={!!editGrado} onOpenChange={(o) => { if (!o) setEditGrado(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renombrar grado</DialogTitle>
            <DialogDescription className="pt-1">El nuevo nombre se aplicará en todo el colegio: estudiantes, notas, actividades, asistencia, salones y asignaciones de ese grado.</DialogDescription>
          </DialogHeader>
          <Input value={editGrado?.grado ?? ""} onChange={(e) => setEditGrado((p) => p ? { ...p, grado: e.target.value } : p)} maxLength={40} autoFocus onKeyDown={(e) => { if (e.key === "Enter") guardarNombreGrado(); }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGrado(null)} disabled={guardandoGrado}>Cancelar</Button>
            <Button onClick={guardarNombreGrado} disabled={guardandoGrado || !editGrado?.grado.trim()}>{guardandoGrado && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advertencia al borrar un salón CON estudiantes matriculados */}
      <Dialog open={!!confirmSalon} onOpenChange={(o) => { if (!o) setConfirmSalon(null); }}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>⚠️ Este salón tiene estudiantes</DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              <strong>{confirmSalon?.grado} {confirmSalon?.salon}</strong> tiene{" "}
              <strong>{confirmSalon?.n} estudiante{confirmSalon?.n === 1 ? "" : "s"} matriculado{confirmSalon?.n === 1 ? "" : "s"}</strong>.
              <br /><br />
              Eliminarlo NO borra a los estudiantes ni sus notas (siguen matriculados en ese grado y salón),
              pero el salón desaparecerá de la estructura del colegio y de sus selectores hasta que lo vuelvas a crear.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSalon(null)} disabled={borrandoSalon}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={borrandoSalon}
              onClick={async () => {
                if (!confirmSalon) return;
                setBorrandoSalon(true);
                await borrarSalon(confirmSalon.id);
                setBorrandoSalon(false);
                setConfirmSalon(null);
              }}
              className="gap-2"
            >
              {borrandoSalon ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Eliminar de todas formas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EstructuraColegioEditor;
