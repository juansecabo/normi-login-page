import { useEffect, useMemo, useState, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { rankGrado } from "@/utils/grados";

/**
 * "Revisar carga académica" — página propia de Configurar Institución.
 *  - Genera el plan de estudios a partir de la carga de los profesores.
 *  - Muestra las diferencias entre salones de un mismo grado (misma materia con
 *    nombres distintos, o materias asignadas en unos salones y no en otros).
 *  - Corrige cada caso EN LÍNEA (sin pop-up): reemplazar una asignatura por otra
 *    en un salón (mueve notas, actividades, etc.) o quitarla si está vacía.
 * Backend: /api/institucion/plan-estudios/generar-desde-asignaciones y
 * /api/institucion/carga/{reemplazar,quitar}-asignatura-salon.
 */

interface PreviewPlan {
  resumen: Array<{ grado: string; nuevas: string[]; ya_en_plan: string[] }>;
  a_crear: number;
  sin_catalogo: string[];
  grados_invalidos: string[];
  salones_inexistentes: Array<{ grado: string; salones: string[] }>;
  inconsistencias: Array<{ grado: string; salones: string[]; detalle: Array<{ asignatura: string; falta_en: string[]; notas?: number; profesores?: string[] }> }>;
}
interface Asignatura { id: number; nombre: string; activa: boolean; }
interface Grado { id: number; grado: string; orden: number | null; }

interface Props { colegioId?: string; }

const RevisarCargaEditor = ({ colegioId }: Props) => {
  const { toast } = useToast();
  const withCid = (body: Record<string, unknown>) => (colegioId ? { ...body, colegio_id: colegioId } : body);
  const qCid = colegioId ? `?colegio_id=${encodeURIComponent(colegioId)}` : "";

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewPlan | null>(null);
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [grados, setGrados] = useState<Grado[]>([]);
  const [generando, setGenerando] = useState(false);

  // Corrección en línea: una fila abierta a la vez.
  const [abierta, setAbierta] = useState<string | null>(null);
  const [corGrado, setCorGrado] = useState("");
  const [corAsig, setCorAsig] = useState("");
  const [corPresentes, setCorPresentes] = useState<string[]>([]);
  const [corSalon, setCorSalon] = useState("");
  const [corAccion, setCorAccion] = useState<"reemplazar" | "quitar">("reemplazar");
  const [corDestino, setCorDestino] = useState("");
  const [busqDest, setBusqDest] = useState(""); // buscador de la asignatura destino
  const [mostrarLista, setMostrarLista] = useState(false); // lista de destino abierta
  const [corDry, setCorDry] = useState<any>(null);
  const [corLoading, setCorLoading] = useState(false);

  const err = (e: unknown, fallback: string) => {
    const detail = e instanceof ApiError ? ((e.body as any)?.detail || (e.body as any)?.error) : null;
    toast({ title: "Error", description: detail || fallback, variant: "destructive" });
  };

  const cargarPreview = async () => {
    const r = await apiRequest<PreviewPlan>("/api/institucion/plan-estudios/generar-desde-asignaciones", {
      method: "POST",
      body: JSON.stringify(withCid({ dry_run: true })),
    });
    setPreview(r);
  };

  const cargarTodo = async () => {
    try {
      const [ap] = await Promise.all([
        apiRequest<{ asignaturas: Asignatura[] }>(`/api/institucion/asignaturas-plan${qCid}`),
        cargarPreview(),
      ]);
      setAsignaturas((ap.asignaturas || []).filter((a) => a.activa));
      const est = await apiRequest<{ grados: Grado[] }>(`/api/institucion/estructura${qCid}`);
      setGrados(est.grados || []);
    } catch (e) {
      err(e, "No se pudo cargar la carga académica.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarTodo(); /* eslint-disable-next-line */ }, [colegioId]);

  const gradoRank = useMemo(() => {
    const m = new Map<string, number>();
    grados.forEach((g, i) => m.set(g.grado, g.orden ?? 1000 + i));
    return (g: string) => m.get(g) ?? 900 + rankGrado(g);
    // eslint-disable-next-line
  }, [grados]);

  const generar = async () => {
    setGenerando(true);
    try {
      const r = await apiRequest<{ creadas: number }>("/api/institucion/plan-estudios/generar-desde-asignaciones", {
        method: "POST",
        body: JSON.stringify(withCid({ dry_run: false })),
      });
      toast({ title: "Plan actualizado", description: `Se agregaron ${r.creadas} asignatura(s) al plan.` });
      await cargarPreview();
    } catch (e) { err(e, "No se pudo generar el plan."); }
    finally { setGenerando(false); }
  };

  const abrirCorregir = (grado: string, asignatura: string, presentes: string[]) => {
    const key = `${grado}||${asignatura}`;
    if (abierta === key) { setAbierta(null); return; }
    setAbierta(key);
    setCorGrado(grado); setCorAsig(asignatura); setCorPresentes(presentes);
    setCorSalon(presentes[0] || ""); setCorAccion("reemplazar"); setCorDestino(""); setBusqDest(""); setMostrarLista(false); setCorDry(null);
  };

  const runDry = async () => {
    if (!corSalon) return;
    if (corAccion === "reemplazar" && !corDestino) return;
    setCorLoading(true); setCorDry(null);
    try {
      const url = corAccion === "reemplazar"
        ? "/api/institucion/carga/reemplazar-asignatura-salon"
        : "/api/institucion/carga/quitar-asignatura-salon";
      const body = corAccion === "reemplazar"
        ? withCid({ grado: corGrado, salon: corSalon, asignatura_origen: corAsig, asignatura_destino: corDestino, dry_run: true })
        : withCid({ grado: corGrado, salon: corSalon, asignatura: corAsig, dry_run: true });
      setCorDry(await apiRequest<any>(url, { method: "POST", body: JSON.stringify(body) }));
    } catch (e) { err(e, "No se pudo analizar."); }
    finally { setCorLoading(false); }
  };

  const aplicar = async () => {
    setCorLoading(true);
    try {
      if (corAccion === "reemplazar") {
        await apiRequest("/api/institucion/carga/reemplazar-asignatura-salon", {
          method: "POST",
          body: JSON.stringify(withCid({ grado: corGrado, salon: corSalon, asignatura_origen: corAsig, asignatura_destino: corDestino, dry_run: false })),
        });
        toast({ title: "Cambio aplicado", description: `"${corAsig}" pasó a "${corDestino}" en ${corGrado} salón ${corSalon}.` });
      } else {
        await apiRequest("/api/institucion/carga/quitar-asignatura-salon", {
          method: "POST",
          body: JSON.stringify(withCid({ grado: corGrado, salon: corSalon, asignatura: corAsig, dry_run: false })),
        });
        toast({ title: "Asignatura quitada", description: `"${corAsig}" se quitó de ${corGrado} salón ${corSalon}.` });
      }
      setAbierta(null); setCorDry(null);
      await cargarPreview();
    } catch (e) { err(e, "No se pudo aplicar el cambio."); }
    finally { setCorLoading(false); }
  };

  const inconsOrdenadas = useMemo(
    () => (preview ? [...preview.inconsistencias].sort((a, b) => gradoRank(a.grado) - gradoRank(b.grado)) : []),
    [preview, gradoRank],
  );
  const resumenNuevas = useMemo(
    () => (preview ? [...preview.resumen].filter((r) => r.nuevas.length > 0).sort((a, b) => gradoRank(a.grado) - gradoRank(b.grado)) : []),
    [preview, gradoRank],
  );

  // Opciones para "Reemplazar por": alfabéticas y filtradas por el buscador
  // (ignora tildes y mayúsculas). Excluye la asignatura que se está corrigiendo.
  const destinoFiltradas = useMemo(() => {
    const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const base = asignaturas.filter((a) => a.nombre !== corAsig).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const q = norm(busqDest.trim());
    return q ? base.filter((a) => norm(a.nombre).includes(q)) : base;
  }, [asignaturas, corAsig, busqDest]);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>;
  }
  if (!preview) return null;

  const puedeAplicar = corDry && !(corAccion === "reemplazar" && corDry.hay_choques) && !(corAccion === "quitar" && corDry.tiene_datos);

  // Editor de corrección (se muestra justo debajo de la ficha abierta).
  const renderEditor = () => (
    <div className="rounded-md border border-primary p-3 space-y-3 bg-muted/40">
      <p className="text-sm font-medium">Corregir "{corAsig}" en {corGrado}</p>
      {corPresentes.length > 1 && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Salón</label>
          <select className="w-full max-w-xs h-9 rounded-md border bg-background px-2 text-sm"
            value={corSalon} onChange={(e) => { setCorSalon(e.target.value); setCorDry(null); }}>
            {corPresentes.map((s) => <option key={s} value={s}>Salón {s}</option>)}
          </select>
        </div>
      )}

      <div className="flex gap-2 max-w-md">
        <button type="button" onClick={() => { setCorAccion("reemplazar"); setCorDry(null); }}
          className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${corAccion === "reemplazar" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
          Reemplazar por otra
        </button>
        <button type="button" onClick={() => { setCorAccion("quitar"); setCorDry(null); }}
          className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${corAccion === "quitar" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
          Quitar del salón
        </button>
      </div>

      {corAccion === "reemplazar" && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Reemplazar por</label>
          <div className="relative max-w-md">
            <input
              value={busqDest}
              onChange={(e) => { setBusqDest(e.target.value); setCorDestino(""); setMostrarLista(true); setCorDry(null); }}
              onFocus={() => { if (!corDestino) setMostrarLista(true); }}
              placeholder="Escribe para buscar la asignatura…"
              className="w-full h-9 rounded-md border bg-background px-2 pr-8 text-sm"
            />
            {corDestino && (
              <button
                type="button"
                title="Quitar la asignatura elegida"
                onClick={() => { setCorDestino(""); setBusqDest(""); setMostrarLista(true); setCorDry(null); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
          {mostrarLista && (
            <div className="mt-1 max-w-md max-h-48 overflow-auto rounded-md border divide-y">
              {destinoFiltradas.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">Sin coincidencias.</p>
              ) : destinoFiltradas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setCorDestino(a.nombre); setBusqDest(a.nombre); setMostrarLista(false); setCorDry(null); }}
                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted"
                >
                  {a.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={runDry}
          disabled={corLoading || !corSalon || (corAccion === "reemplazar" && !corDestino)}>
          {corLoading && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Ver qué hay detrás
        </Button>
        {corDry && (
          <Button size="sm" onClick={aplicar} disabled={corLoading || !puedeAplicar}>
            {corLoading && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Aplicar
          </Button>
        )}
      </div>

      {corDry && (
        <div className="text-xs space-y-1">
          {corDry.total_registros === 0 ? (
            <p className="text-muted-foreground">Está vacía en ese salón (sin notas ni actividades).</p>
          ) : (
            <p className="text-muted-foreground">
              Tiene {corDry.total_registros} registro(s): {Object.entries(corDry.conteos as Record<string, number>).map(([t, n]) => `${t} (${n})`).join(", ")}.
            </p>
          )}
          {corAccion === "reemplazar" && corDry.hay_choques && (
            <p className="text-destructive">No se puede: la asignatura destino ya tiene registros que chocarían en ese salón.</p>
          )}
          {corAccion === "quitar" && corDry.tiene_datos && (
            <p className="text-destructive">No se puede quitar: tiene registros. Usa "Reemplazar por otra" para moverlos.</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Generar plan desde la carga */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Generar plan de estudios desde la carga</CardTitle>
          <p className="text-sm text-muted-foreground">
            Toma las parejas de grado y asignatura de lo que dictan los profesores y agrega al plan las que falten. No borra nada ni cambia las horas que ya definiste.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {preview.a_crear === 0 ? (
            <p className="text-sm text-muted-foreground">El plan ya cubre todo lo que dictan los profesores. No hay nada nuevo que agregar.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm">Se agregarían <strong>{preview.a_crear}</strong> asignatura(s) al plan.</p>
                <Button onClick={generar} disabled={generando} data-guia="configurar_institucion.plan_generar_asignaciones">
                  {generando && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Generar plan
                </Button>
              </div>
              <div className="rounded-md border divide-y">
                {resumenNuevas.map((r) => (
                  <div key={r.grado} className="px-3 py-2">
                    <span className="text-sm font-medium">{r.grado}</span>
                    <span className="text-xs text-muted-foreground"> · {r.nuevas.join(", ")}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {preview.sin_catalogo.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Están en la carga pero no en el catálogo del colegio (se omiten): {preview.sin_catalogo.join(", ")}.
            </p>
          )}
          {preview.salones_inexistentes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              La carga referencia salones que no existen (se omiten): {preview.salones_inexistentes.map((x) => `${x.grado} (salón ${x.salones.join(", ")})`).join("; ")}.
            </p>
          )}
          {preview.grados_invalidos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Grados en la carga que no existen en el colegio (se omiten): {preview.grados_invalidos.join(", ")}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Diferencias entre salones */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Diferencias entre salones</CardTitle>
          <p className="text-sm text-muted-foreground">
            Una asignatura aparece en unos salones de un grado pero no en otros. Suele ser la misma materia escrita con dos nombres. Reemplázala por la correcta (mueve sus notas) o quítala si está vacía. Fíjate en las notas para saber cuál nombre conservar.
          </p>
        </CardHeader>
        <CardContent>
          {inconsOrdenadas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay diferencias entre salones. Todo está parejo.</p>
          ) : (
            <div className="space-y-5">
              {inconsOrdenadas.map((inc) => (
                <div key={inc.grado}>
                  <p className="text-sm font-semibold text-foreground mb-2">{inc.grado}</p>
                  <div className="space-y-2">
                    {inc.detalle.map((d) => {
                      const presentes = inc.salones.filter((s) => !d.falta_en.includes(s));
                      const key = `${inc.grado}||${d.asignatura}`;
                      const abierto = abierta === key;
                      return (
                        <Fragment key={d.asignatura}>
                          <div className={`rounded-md border px-3 py-2 flex items-center justify-between gap-2 ${abierto ? "border-primary ring-1 ring-primary/30" : ""}`}>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{d.asignatura}</p>
                              <p className="text-xs mt-0.5 leading-tight">
                                {presentes.length > 0 && (<>
                                  <span className="text-muted-foreground">Salón </span>
                                  <span className="font-bold text-emerald-600">{presentes.join(", ")}</span>
                                </>)}
                                {d.falta_en.length > 0 && (<>
                                  <span className="text-muted-foreground"> · Falta </span>
                                  <span className="font-bold text-amber-600">{d.falta_en.join(", ")}</span>
                                </>)}
                                {d.notas != null && (<>
                                  <span className="text-muted-foreground"> · </span>
                                  <span className={`font-bold ${d.notas === 0 ? "text-muted-foreground" : "text-sky-600"}`}>
                                    {d.notas === 0 ? "sin notas" : `${d.notas} nota${d.notas === 1 ? "" : "s"}`}
                                  </span>
                                </>)}
                              </p>
                              {d.profesores && d.profesores.length > 0 && (
                                <p className="text-xs mt-0.5 leading-tight truncate">
                                  <span className="text-muted-foreground">Profe: </span>
                                  <span className="font-medium text-foreground">{d.profesores.join(", ")}</span>
                                </p>
                              )}
                            </div>
                            {presentes.length > 0 && (
                              <Button variant={abierto ? "secondary" : "outline"} size="sm" className="shrink-0"
                                onClick={() => abrirCorregir(inc.grado, d.asignatura, presentes)}>
                                {abierto ? "Cerrar" : "Corregir"}
                              </Button>
                            )}
                          </div>
                          {abierto && renderEditor()}
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RevisarCargaEditor;
