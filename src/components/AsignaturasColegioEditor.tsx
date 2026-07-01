import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Trash2, Loader2, ListChecks, Clock } from "lucide-react";
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
      const gs = (est.grados || []).sort((a, b) => rankGrado(a.grado) - rankGrado(b.grado));
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

  const eliminarAsignatura = async (a: Asignatura) => {
    try {
      await apiRequest(`/api/institucion/asignaturas/${a.id}${qCid}`, { method: "DELETE" });
      await cargar();
    } catch (e) { err(e, "No se pudo eliminar la asignatura."); }
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
          <div className="columns-1 sm:columns-2 gap-x-4 rounded-lg border p-3">
            {listaCombinada.map((nombre) => {
              const a = porNombre.get(nombre.toLowerCase());
              const marcada = !!a;
              return (
                <label key={nombre} className="flex items-center gap-2.5 py-1 cursor-pointer select-none break-inside-avoid">
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() => (a ? eliminarAsignatura(a) : agregarAsignatura([nombre]))}
                    className="w-4 h-4 accent-primary shrink-0 cursor-pointer"
                  />
                  <span className={`text-sm ${marcada ? "" : "text-muted-foreground"}`}>{nombre}</span>
                </label>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="¿Falta una? Escríbela aquí (ej. Science)"
              value={nuevaAsig}
              onChange={(e) => setNuevaAsig(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && nuevaAsig.trim()) agregarAsignatura([nuevaAsig.trim()]); }}
            />
            <Button onClick={() => nuevaAsig.trim() && agregarAsignatura([nuevaAsig.trim()])} disabled={!nuevaAsig.trim() || agregando} className="gap-1 shrink-0">
              {agregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar
            </Button>
          </div>

          <p className="text-sm text-muted-foreground text-right">
            <ListChecks className="w-4 h-4 inline mr-1" />{asignaturas.length} asignatura(s) escogida(s)
          </p>
        </CardContent>
      </Card>

      {/* ── Plan de estudios por grado ── */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Plan de estudios por grado</CardTitle>
          <p className="text-sm text-muted-foreground">Marca qué asignaturas se ven en cada grado y su intensidad horaria semanal. Aplica al grado completo (todos sus salones).</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {grados.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4 text-center">
              Primero define los grados del colegio en la ficha <strong>Jornadas, grados y salones</strong>.
            </p>
          ) : asignaturas.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4 text-center">
              Primero agrega las asignaturas del colegio (arriba).
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
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

              <div className="divide-y rounded-lg border">
                {asignaturas.map((a) => {
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
    </div>
  );
};

export default AsignaturasColegioEditor;
