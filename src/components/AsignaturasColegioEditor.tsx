import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Trash2, Loader2, ListChecks, Clock, Pencil, Check, Wand2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { rankGrado } from "@/utils/grados";

/**
 * Editor de Asignaturas del colegio + Plan de estudios por grado, compartido por:
 *  - El wizard "Crear Institución" del SuperAdmin (con `colegioId`).
 *  - "Configurar Institución" del Rector/Admin (sin `colegioId` → usa el del JWT).
 *
 * Flujo: primero se escogen las asignaturas del colegio (catálogo propio de cada
 * institución — la "lista típica" es solo un atajo de digitación que las agrega,
 * nunca un valor por defecto). Con el catálogo y los grados ya definidos, se marca
 * qué asignaturas se ven en cada grado con su intensidad horaria semanal.
 *
 * El plan es informativo por ahora (base para boletines): NO restringe la carga
 * académica ni las vistas existentes.
 */

interface Asignatura { id: number; nombre: string; activa: boolean; orden: number | null; }
interface PlanFila { id: number; grado: string; asignatura_id: number; intensidad_horaria: number | null; }
interface Grado { id: number; grado: string; orden: number | null; activo: boolean; }
interface PreviewPlan {
  dry_run: boolean;
  resumen: Array<{ grado: string; nuevas: string[]; ya_en_plan: string[] }>;
  a_crear: number;
  creadas: number;
  sin_catalogo: string[];
  grados_invalidos: string[];
  salones_inexistentes: Array<{ grado: string; salones: string[] }>;
  inconsistencias: Array<{ grado: string; salones: string[]; detalle: Array<{ asignatura: string; falta_en: string[] }> }>;
}

/**
 * Lista maestra: unión de las asignaturas reales del Colegio Pestalozziano y la
 * Escuela Normal Superior de Corozal (sin repetidas). Se muestran TODAS y cada
 * colegio marca con un chulo cuáles ofrece; nada queda escogido por defecto.
 */
const LISTA_MAESTRA = [
  "Artística", "Biología", "Castellano", "Cátedra de Estudios Afrocolombianos",
  "Cátedra de Paz", "Cátedra Socioemocional", "Ciencias Naturales",
  "Ciencias Naturales y Educación Ambiental", "Ciencias Políticas",
  "Ciencias Sociales", "Dimensión Cognitiva", "Dimensión Comunicativa",
  "Dimensión Corporal", "Dimensión de Ética y Valores", "Dimensión Estética",
  "Dimensión General", "Educación Artística", "Educación Financiera y Emprendimiento",
  "Educación Física", "Estadística", "Ética", "Filosofía", "Física", "Geometría",
  "Informática", "Inglés", "Investigación Formativa", "Lectura Crítica",
  "Matemáticas", "Pedagogía", "Práctica Pedagógica", "Psicología General",
  "Química", "Religión", "Tecnología",
];

interface Props {
  /** Si se pasa, opera sobre ese colegio (modo SuperAdmin). Si no, sobre el del JWT. */
  colegioId?: string;
}

const AsignaturasColegioEditor = ({ colegioId }: Props) => {
  const { toast } = useToast();
  const qCid = colegioId ? `?colegio_id=${encodeURIComponent(colegioId)}` : "";
  const withCid = (body: Record<string, unknown>) => (colegioId ? { ...body, colegio_id: colegioId } : body);

  const [loading, setLoading] = useState(true);
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [plan, setPlan] = useState<PlanFila[]>([]);
  const [grados, setGrados] = useState<Grado[]>([]);

  const [nuevaAsig, setNuevaAsig] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [gradoSel, setGradoSel] = useState<string>("");
  // Buscador del plan de estudios: filtra la lista de asignaturas del grado.
  const [busquedaPlan, setBusquedaPlan] = useState("");
  // Borradores de horas mientras se escriben (se confirman en blur/Enter).
  const [horasDraft, setHorasDraft] = useState<Record<number, string>>({});

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
      const [ap, est] = await Promise.all([
        apiRequest<{ asignaturas: Asignatura[]; plan: PlanFila[] }>(`/api/institucion/asignaturas-plan${qCid}`),
        apiRequest<{ grados: Grado[] }>(`/api/institucion/estructura${qCid}`),
      ]);
      setAsignaturas(ap.asignaturas || []);
      setPlan(ap.plan || []);
      const gs = (est.grados || []).sort((a, b) => (a.orden ?? 900) - (b.orden ?? 900) || rankGrado(a.grado) - rankGrado(b.grado));
      setGrados(gs);
      setGradoSel((prev) => (prev && gs.some((g) => g.grado === prev) ? prev : gs[0]?.grado || ""));
    } catch (e) {
      err(e, "No se pudieron cargar las asignaturas.");
    } finally {
      setLoading(false);
    }
  };

  // ── Catálogo ──
  const agregarAsignatura = async (nombres: string[]) => {
    if (agregando) return;
    setAgregando(true);
    try {
      await apiRequest("/api/institucion/asignaturas", {
        method: "POST",
        body: JSON.stringify(withCid(nombres.length === 1 ? { nombre: nombres[0] } : { nombres })),
      });
      setNuevaAsig("");
      await cargar();
    } catch (e) { err(e, "No se pudo agregar la asignatura."); }
    finally { setAgregando(false); }
  };

  /**
   * Desmarcar = quitarla del colegio: si está virgen se ELIMINA; si ya tiene
   * historial (notas, asistencias, carga…) el server responde 409 y entonces
   * se DESACTIVA (deja de ofrecerse para lo nuevo, historial intacto).
   */
  const quitarAsignatura = async (a: Asignatura) => {
    try {
      await apiRequest(`/api/institucion/asignaturas/${a.id}${qCid}`, { method: "DELETE" });
      await cargar();
    } catch (e) {
      if (e instanceof ApiError && (e.body as any)?.error === "asignatura_en_uso") {
        try {
          await apiRequest(`/api/institucion/asignaturas/${a.id}`, {
            method: "PATCH",
            body: JSON.stringify(withCid({ activa: false })),
          });
          toast({
            title: `${a.nombre} desactivada`,
            description: "Tiene notas u otros registros, así que no se borra: deja de ofrecerse para carga académica nueva y todo su historial queda intacto. Márcala de nuevo para reactivarla.",
          });
          await cargar();
        } catch (e2) { err(e2, "No se pudo desactivar la asignatura."); }
        return;
      }
      err(e, "No se pudo quitar la asignatura.");
    }
  };

  /** Reactivar una asignatura que estaba desactivada. */
  const reactivarAsignatura = async (a: Asignatura) => {
    try {
      await apiRequest(`/api/institucion/asignaturas/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify(withCid({ activa: true })),
      });
      await cargar();
    } catch (e) { err(e, "No se pudo reactivar la asignatura."); }
  };

  // ── Renombrar (con propagación en el server a Notas, Actividades, carga
  //    académica, asistencia, etc. — el historial queda coherente) ──
  const [renombrando, setRenombrando] = useState<Asignatura | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const renombrarAsignatura = async () => {
    if (!renombrando || !nuevoNombre.trim()) return;
    setGuardandoNombre(true);
    try {
      await apiRequest(`/api/institucion/asignaturas/${renombrando.id}`, {
        method: "PATCH",
        body: JSON.stringify(withCid({ nombre: nuevoNombre.trim() })),
      });
      toast({ title: "Asignatura renombrada", description: `"${renombrando.nombre}" ahora se llama "${nuevoNombre.trim()}". Las notas, actividades y la carga de los profesores se actualizaron.` });
      setRenombrando(null);
      await cargar();
    } catch (e) { err(e, "No se pudo renombrar la asignatura."); }
    finally { setGuardandoNombre(false); }
  };

  // ── Plan de estudios ──
  const planDelGrado = useMemo(
    () => new Map(plan.filter((p) => p.grado === gradoSel).map((p) => [p.asignatura_id, p])),
    [plan, gradoSel],
  );

  const toggleEnGrado = async (a: Asignatura) => {
    const existente = planDelGrado.get(a.id);
    try {
      if (existente) {
        await apiRequest(`/api/institucion/plan-estudios?grado=${encodeURIComponent(gradoSel)}&asignatura_id=${a.id}${colegioId ? `&colegio_id=${encodeURIComponent(colegioId)}` : ""}`, { method: "DELETE" });
      } else {
        await apiRequest("/api/institucion/plan-estudios", {
          method: "POST",
          body: JSON.stringify(withCid({ grado: gradoSel, asignatura_id: a.id })),
        });
      }
      await cargar();
    } catch (e) { err(e, "No se pudo actualizar el plan."); }
  };

  // ── Generar el plan desde la carga académica (Asignación Profesores) ──
  const [preview, setPreview] = useState<PreviewPlan | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generando, setGenerando] = useState(false);

  const abrirPreview = async () => {
    setGenerando(true);
    try {
      const r = await apiRequest<PreviewPlan>("/api/institucion/plan-estudios/generar-desde-asignaciones", {
        method: "POST",
        body: JSON.stringify(withCid({ dry_run: true })),
      });
      setPreview(r);
      setPreviewOpen(true);
    } catch (e) { err(e, "No se pudo analizar la carga académica."); }
    finally { setGenerando(false); }
  };

  const confirmarGeneracion = async () => {
    setGenerando(true);
    try {
      const r = await apiRequest<PreviewPlan>("/api/institucion/plan-estudios/generar-desde-asignaciones", {
        method: "POST",
        body: JSON.stringify(withCid({ dry_run: false })),
      });
      toast({ title: "Plan actualizado", description: `Se agregaron ${r.creadas} asignatura(s) al plan de estudios.` });
      setPreviewOpen(false);
      setPreview(null);
      await cargar();
    } catch (e) { err(e, "No se pudo generar el plan."); }
    finally { setGenerando(false); }
  };

  const guardarHoras = async (a: Asignatura, valor: string) => {
    const fila = planDelGrado.get(a.id);
    if (!fila) return;
    const horas = valor.trim() === "" ? null : Number(valor);
    if (horas !== null && (!Number.isFinite(horas) || horas < 1 || horas > 40)) {
      toast({ title: "Horas inválidas", description: "Usa un número entre 1 y 40 (o deja vacío).", variant: "destructive" });
      return;
    }
    if ((fila.intensidad_horaria ?? null) === (horas === null ? null : Math.round(horas))) return;
    try {
      await apiRequest("/api/institucion/plan-estudios", {
        method: "POST",
        body: JSON.stringify(withCid({ grado: gradoSel, asignatura_id: a.id, intensidad_horaria: horas })),
      });
      await cargar();
    } catch (e) { err(e, "No se pudieron guardar las horas."); }
  };

  /** Solo las activas: son las que se ofrecen (checklist y plan por grado). */
  const activas = useMemo(() => asignaturas.filter((a) => a.activa), [asignaturas]);

  /** Índice de las asignaturas escogidas por nombre (case-insensitive). */
  const porNombre = useMemo(
    () => new Map(asignaturas.map((a) => [a.nombre.toLowerCase(), a])),
    [asignaturas],
  );

  /** Lista maestra + las propias del colegio que no estén en ella (ordenada). */
  const listaCombinada = useMemo(() => {
    const enMaestra = new Set(LISTA_MAESTRA.map((n) => n.toLowerCase()));
    const propias = asignaturas.map((a) => a.nombre).filter((n) => !enMaestra.has(n.toLowerCase()));
    return [...LISTA_MAESTRA, ...propias].sort((x, y) => x.localeCompare(y, "es"));
  }, [asignaturas]);

  const totalHorasGrado = useMemo(
    () => plan.filter((p) => p.grado === gradoSel).reduce((s, p) => s + (p.intensidad_horaria || 0), 0),
    [plan, gradoSel],
  );

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Catálogo de asignaturas del colegio ── */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" /> Asignaturas del colegio</CardTitle>
          <p className="text-sm text-muted-foreground">Cada colegio define sus propias asignaturas. Estas son las que luego se asignan a los grados y a la carga académica de los profesores.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* columns-2 (no grid): el orden alfabético fluye VERTICAL — primera
              mitad en la columna izquierda, segunda en la derecha. */}
          <div className="columns-1 sm:columns-2 gap-x-4 rounded-lg border p-3" data-guia="configurar_institucion.asignatura_check">
            {listaCombinada.map((nombre) => {
              const a = porNombre.get(nombre.toLowerCase());
              // Marcada = existe Y activa. Una desactivada aparece sin chulo
              // (ya no se ofrece) y al marcarla se REACTIVA (no se re-crea).
              const marcada = !!a && a.activa;
              return (
                <div key={nombre} className="flex items-center gap-1 py-1 break-inside-avoid">
                  <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => (!a ? agregarAsignatura([nombre]) : a.activa ? quitarAsignatura(a) : reactivarAsignatura(a))}
                      className="w-4 h-4 accent-primary shrink-0 cursor-pointer"
                    />
                    <span className={`text-sm truncate ${marcada ? "" : "text-muted-foreground"}`}>{nombre}</span>
                  </label>
                  {a && (
                    <button
                      type="button"
                      data-guia="configurar_institucion.asignatura_renombrar"
                      onClick={() => { setRenombrando(a); setNuevoNombre(a.nombre); }}
                      className="p-1 text-muted-foreground hover:text-primary shrink-0"
                      title="Renombrar (actualiza notas, actividades y carga académica)"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Input
              data-guia="configurar_institucion.asignatura_nueva"
              placeholder="¿Falta una? Escríbela aquí (ej. Science)"
              value={nuevaAsig}
              onChange={(e) => setNuevaAsig(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && nuevaAsig.trim()) agregarAsignatura([nuevaAsig.trim()]); }}
            />
            <Button data-guia="configurar_institucion.asignatura_agregar" onClick={() => nuevaAsig.trim() && agregarAsignatura([nuevaAsig.trim()])} disabled={!nuevaAsig.trim() || agregando} className="gap-1 shrink-0">
              {agregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar
            </Button>
          </div>

          <p className="text-sm text-muted-foreground text-right">
            <ListChecks className="w-4 h-4 inline mr-1" />{activas.length} asignatura(s) escogida(s)
          </p>
        </CardContent>
      </Card>

      {/* ── Plan de estudios por grado ── */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Plan de estudios por grado</CardTitle>
          <p className="text-sm text-muted-foreground">Marca qué asignaturas se ven en cada grado y su intensidad horaria semanal. Aplica al grado completo (todos sus salones). También puedes generarlo automáticamente a partir de lo que los profesores dictan.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {grados.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4 text-center">
              Primero define los grados del colegio en la ficha <strong>Jornadas, grados y salones</strong>.
            </p>
          ) : activas.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4 text-center">
              Primero agrega las asignaturas del colegio (arriba).
            </p>
          ) : (
            <>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={abrirPreview}
                  disabled={generando}
                  className="gap-1.5"
                  data-guia="configurar_institucion.plan_generar_asignaciones"
                >
                  {generando && !previewOpen ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  Generar desde las asignaciones
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5" data-guia="configurar_institucion.plan_grado">
                {grados.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGradoSel(g.grado)}
                    className={`rounded-full px-3 py-1 text-sm border transition-colors ${gradoSel === g.grado ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
                  >
                    {g.grado}
                  </button>
                ))}
              </div>

              <Input
                value={busquedaPlan}
                onChange={(e) => setBusquedaPlan(e.target.value)}
                placeholder="Buscar asignatura…"
              />

              <div className="divide-y rounded-lg border" data-guia="configurar_institucion.plan_asignatura_check">
                {activas
                  .filter((a) => {
                    const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
                    return !busquedaPlan.trim() || norm(a.nombre).includes(norm(busquedaPlan.trim()));
                  })
                  .map((a) => {
                  const fila = planDelGrado.get(a.id);
                  const marcada = !!fila;
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                      <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer select-none">
                        <input type="checkbox" checked={marcada} onChange={() => toggleEnGrado(a)} className="w-4 h-4 accent-primary shrink-0 cursor-pointer" />
                        <span className={`text-sm truncate ${marcada ? "" : "text-muted-foreground"}`}>{a.nombre}</span>
                      </label>
                      {marcada && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Input
                            data-guia="configurar_institucion.plan_horas"
                            type="number"
                            min={1}
                            max={40}
                            placeholder="—"
                            className="w-16 h-8 text-center"
                            value={horasDraft[a.id] ?? (fila?.intensidad_horaria != null ? String(fila.intensidad_horaria) : "")}
                            onChange={(e) => setHorasDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                            onBlur={(e) => { guardarHoras(a, e.target.value); setHorasDraft((d) => { const { [a.id]: _omit, ...resto } = d; return resto; }); }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          />
                          <span className="text-xs text-muted-foreground">h/sem</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-sm text-muted-foreground text-right">
                {gradoSel}: <strong>{planDelGrado.size}</strong> asignatura(s){totalHorasGrado > 0 && <> · <strong>{totalHorasGrado}</strong> h/semana</>}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Pop-up: renombrar asignatura (propaga a todo el historial) ── */}
      <Dialog open={!!renombrando} onOpenChange={(o) => { if (!o) setRenombrando(null); }}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Renombrar asignatura</DialogTitle>
            <DialogDescription>
              Todas las notas, actividades, asistencias y la carga académica de los profesores que usan
              "{renombrando?.nombre}" pasarán a usar el nombre nuevo, para que el historial quede coherente.
            </DialogDescription>
          </DialogHeader>
          <Input
            data-guia="configurar_institucion.asignatura_renombrar_input"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") renombrarAsignatura(); }}
            placeholder="Nombre nuevo"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenombrando(null)} disabled={guardandoNombre}>Cancelar</Button>
            <Button data-guia="configurar_institucion.asignatura_renombrar_guardar" onClick={renombrarAsignatura} disabled={guardandoNombre || !nuevoNombre.trim() || nuevoNombre.trim() === renombrando?.nombre} className="gap-2">
              {guardandoNombre ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Renombrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pop-up: generar plan desde las asignaciones (vista previa) ── */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) { setPreviewOpen(false); setPreview(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wand2 className="w-4 h-4 text-primary" /> Generar plan desde las asignaciones</DialogTitle>
            <DialogDescription>
              Esto toma las parejas grado y asignatura de la carga académica de los profesores y agrega al plan las que falten. No borra nada ni cambia las horas que ya definiste. Revisa antes de confirmar.
            </DialogDescription>
          </DialogHeader>

          {preview && (() => {
            const ordenGrado = (g: string) => { const i = grados.findIndex((x) => x.grado === g); return i < 0 ? 999 : i; };
            const resumenOrdenado = [...preview.resumen].sort((a, b) => ordenGrado(a.grado) - ordenGrado(b.grado));
            const inconsOrdenadas = [...preview.inconsistencias].sort((a, b) => ordenGrado(a.grado) - ordenGrado(b.grado));
            return (
              <div className="space-y-4 text-sm">
                {/* Inconsistencias entre salones del mismo grado (revisar primero) */}
                {inconsOrdenadas.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                    <p className="flex items-center gap-1.5 font-medium text-amber-800">
                      <AlertTriangle className="w-4 h-4" /> Revisa estas diferencias entre salones
                    </p>
                    <p className="text-amber-700 text-xs">
                      En estos grados una asignatura aparece en unos salones pero no en otros. Puede ser un error de digitación en la carga académica. Si generas ahora, se incluirá en todo el grado.
                    </p>
                    {inconsOrdenadas.map((inc) => (
                      <div key={inc.grado} className="text-amber-800">
                        <p className="font-medium">{inc.grado}</p>
                        <ul className="list-disc pl-5 text-xs space-y-0.5">
                          {inc.detalle.map((d) => (
                            <li key={d.asignatura}>{d.asignatura} (falta en: {d.falta_en.join(", ")})</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {/* Asignaturas de las asignaciones que no están en el catálogo */}
                {preview.sin_catalogo.length > 0 && (
                  <div className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
                    Estas asignaturas están en la carga académica pero no en el catálogo activo del colegio, así que se omiten. Agrégalas arriba si quieres incluirlas: <strong>{preview.sin_catalogo.join(", ")}</strong>
                  </div>
                )}

                {/* Salones referidos en la carga que no existen en el grado */}
                {preview.salones_inexistentes.length > 0 && (
                  <div className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
                    La carga académica referencia salones que no existen en la matrícula de estos grados (se ignoran): {preview.salones_inexistentes.map((x) => `${x.grado} (salón ${x.salones.join(", ")})`).join("; ")}. Conviene corregirlos en la carga de los profesores.
                  </div>
                )}

                {/* Grados de las asignaciones que no existen en el colegio */}
                {preview.grados_invalidos.length > 0 && (
                  <div className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
                    Estos grados aparecen en la carga académica pero no están configurados en el colegio, así que se omiten: <strong>{preview.grados_invalidos.join(", ")}</strong>
                  </div>
                )}

                {/* Qué se va a agregar, por grado */}
                {preview.a_crear === 0 ? (
                  <p className="text-muted-foreground border rounded-lg p-3 text-center">
                    El plan ya cubre todo lo que dictan los profesores. No hay nada nuevo que agregar.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-muted-foreground">Se agregarán <strong>{preview.a_crear}</strong> asignatura(s) al plan:</p>
                    <div className="divide-y rounded-lg border">
                      {resumenOrdenado.filter((r) => r.nuevas.length > 0).map((r) => (
                        <div key={r.grado} className="px-3 py-2">
                          <p className="font-medium">{r.grado} <span className="text-muted-foreground font-normal">(+{r.nuevas.length})</span></p>
                          <p className="text-xs text-muted-foreground">{r.nuevas.join(", ")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewOpen(false); setPreview(null); }} disabled={generando}>Cancelar</Button>
            <Button
              onClick={confirmarGeneracion}
              disabled={generando || !preview || preview.a_crear === 0}
              className="gap-2"
              data-guia="configurar_institucion.plan_generar_confirmar"
            >
              {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Generar plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AsignaturasColegioEditor;
