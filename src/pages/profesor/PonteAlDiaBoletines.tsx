import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { apiRequest } from "@/lib/apiClient";
import { useColegioConfig } from "@/hooks/useColegioConfig";
import { limpiarCachePendientes } from "@/components/BannerPendientesBoletines";
import { Button } from "@/components/ui/button";
import { Ban, Check, CheckCircle2, ExternalLink, Loader2, MoveRight, PartyPopper, AlertTriangle } from "lucide-react";

/**
 * "Ponte al día para los boletines" (Juan 2026-10-01): una sola pantalla, por
 * profesor, con EXACTAMENTE lo que le falta en sus clases del periodo con alerta
 * activa. Cada pendiente trae su solución al lado. Todo se guarda en las mismas
 * tablas de la tabla de notas.
 */
interface Est { id: string; nombre: string }
interface Faltante { actividad: string; grupo: string | null; estudiantes: Est[] }
interface NoCuenta { actividad: string; motivo: string }
interface GrupoDestino { id: string; nombre: string; porcentaje: number }
interface Clase {
  asignatura: string; grado: string; salon: string;
  sin_notas: boolean; faltantes: Faltante[]; no_cuentan: NoCuenta[]; grupos_destino: GrupoDestino[];
  periodo_completo: boolean; pendientes: number;
}
interface Respuesta { alertas: number[]; periodos: Array<{ periodo: number; clases: Clase[]; total: number }>; total: number }

const ORD: Record<number, string> = { 1: "1er", 2: "2do", 3: "3er", 4: "4to", 5: "5to", 6: "6to" };
const claveC = (p: number, c: Clase) => `${p}|${c.asignatura}|${c.grado}|${c.salon}`;
const pendientesDe = (c: Clase) =>
  c.sin_notas ? 1 : c.faltantes.reduce((s, f) => s + f.estudiantes.length, 0) + c.no_cuentan.length + (c.periodo_completo ? 0 : 1);

const PonteAlDiaBoletines = () => {
  const navigate = useNavigate();
  const { config } = useColegioConfig();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [totalInicial, setTotalInicial] = useState(0);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<Record<string, boolean>>({});
  const [listos, setListos] = useState<Record<string, boolean>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [destino, setDestino] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    try {
      const r = await apiRequest<Respuesta>("/api/boletines/mis-pendientes?fresco=1");
      setDatos(r);
      setTotalInicial((t) => Math.max(t, r.total));
    } catch (e: any) {
      setError(e?.body?.detail || e?.message || "No se pudo cargar lo que te falta.");
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Quita del estado lo ya resuelto (sin volver a pedir todo al servidor).
  const actualizar = (fn: (r: Respuesta) => void) => {
    setDatos((prev) => {
      if (!prev) return prev;
      const r: Respuesta = JSON.parse(JSON.stringify(prev));
      fn(r);
      for (const p of r.periodos) {
        for (const c of p.clases) c.pendientes = pendientesDe(c);
        p.total = p.clases.reduce((s, c) => s + c.pendientes, 0);
      }
      r.total = r.periodos.reduce((s, p) => s + p.total, 0);
      return r;
    });
    limpiarCachePendientes();
  };
  const conClase = (r: Respuesta, periodo: number, c: Clase) =>
    r.periodos.find((p) => p.periodo === periodo)?.clases.find((x) => claveC(periodo, x) === claveC(periodo, c));

  const guardarNota = async (periodo: number, c: Clase, f: Faltante, ests: Est[], noAplica: boolean) => {
    const k0 = `${claveC(periodo, c)}|${f.actividad}`;
    const claves = ests.map((e) => `${k0}|${e.id}`);
    let nota: number | null = null;
    if (!noAplica) {
      const v = (valores[claves[0]] || "").replace(",", ".").trim();
      if (!v) return;
      nota = Number(v);
      const min = Number(config.escala_min ?? 0), max = Number(config.escala_max ?? 5);
      if (!Number.isFinite(nota) || nota < min || nota > max) {
        setErrores((s) => ({ ...s, [claves[0]]: `Entre ${min} y ${max}` }));
        return;
      }
    }
    setOcupado((s) => ({ ...s, ...Object.fromEntries(claves.map((k) => [k, true])) }));
    setErrores((s) => { const n = { ...s }; claves.forEach((k) => delete n[k]); return n; });
    try {
      await apiRequest("/api/boletines/mis-pendientes/nota", {
        method: "POST",
        body: JSON.stringify({ periodo, asignatura: c.asignatura, grado: c.grado, salon: c.salon, actividad: f.actividad, estudiantes: ests.map((e) => e.id), nota, no_aplica: noAplica }),
      });
      setListos((s) => ({ ...s, ...Object.fromEntries(claves.map((k) => [k, true])) }));
      // Se ve el ✓ un momento y luego desaparece la fila.
      setTimeout(() => actualizar((r) => {
        const cc = conClase(r, periodo, c);
        const ff = cc?.faltantes.find((x) => x.actividad === f.actividad);
        if (cc && ff) {
          const ids = new Set(ests.map((e) => e.id));
          ff.estudiantes = ff.estudiantes.filter((e) => !ids.has(e.id));
          cc.faltantes = cc.faltantes.filter((x) => x.estudiantes.length > 0);
        }
      }), 650);
    } catch (e: any) {
      setErrores((s) => ({ ...s, [claves[0]]: e?.body?.detail || "No se guardó" }));
    } finally {
      setOcupado((s) => { const n = { ...s }; claves.forEach((k) => delete n[k]); return n; });
    }
  };

  const mover = async (periodo: number, c: Clase, nc: NoCuenta) => {
    const k = `${claveC(periodo, c)}|mover|${nc.actividad}`;
    const grupo_id = destino[k] || c.grupos_destino[0]?.id;
    if (!grupo_id) return;
    setOcupado((s) => ({ ...s, [k]: true }));
    try {
      await apiRequest("/api/boletines/mis-pendientes/mover", {
        method: "POST",
        body: JSON.stringify({ periodo, asignatura: c.asignatura, grado: c.grado, salon: c.salon, actividad: nc.actividad, grupo_id }),
      });
      setListos((s) => ({ ...s, [k]: true }));
      setTimeout(() => actualizar((r) => {
        const cc = conClase(r, periodo, c);
        if (cc) cc.no_cuentan = cc.no_cuentan.filter((x) => x.actividad !== nc.actividad);
      }), 650);
    } catch (e: any) {
      setErrores((s) => ({ ...s, [k]: e?.body?.detail || "No se pudo mover" }));
    } finally {
      setOcupado((s) => { const n = { ...s }; delete n[k]; return n; });
    }
  };

  const cerrar = async (periodo: number, c: Clase) => {
    const k = `${claveC(periodo, c)}|cerrar`;
    setOcupado((s) => ({ ...s, [k]: true }));
    try {
      await apiRequest("/api/boletines/mis-pendientes/cerrar", {
        method: "POST",
        body: JSON.stringify({ periodo, asignatura: c.asignatura, grado: c.grado, salon: c.salon }),
      });
      actualizar((r) => { const cc = conClase(r, periodo, c); if (cc) cc.periodo_completo = true; });
    } catch (e: any) {
      setErrores((s) => ({ ...s, [k]: e?.body?.detail || "No se pudo marcar" }));
    } finally {
      setOcupado((s) => { const n = { ...s }; delete n[k]; return n; });
    }
  };

  const abrirPlanilla = (periodo: number, c: Clase) => {
    localStorage.setItem("asignaturaSeleccionada", c.asignatura);
    localStorage.setItem("gradoSeleccionado", c.grado);
    localStorage.setItem("salonSeleccionado", c.salon);
    navigate(`/tabla-notas?periodo=${periodo}`);
  };

  const total = datos?.total ?? 0;
  const progreso = totalInicial > 0 ? Math.round(((totalInicial - total) / totalInicial) * 100) : 100;
  const placeholder = `${config.escala_min ?? 0}-${config.escala_max ?? 5}`;
  const clasesVisibles = useMemo(() => (datos?.periodos || []).flatMap((p) => p.clases.map((c) => ({ periodo: p.periodo, c }))), [datos]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Ponte al día para los boletines</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="max-w-4xl mx-auto space-y-5">
          <div className="bg-card rounded-lg shadow-soft p-6" data-guia="ponte_al_dia.resumen">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center">Ponte al día para los boletines</h2>
            <p className="text-sm text-muted-foreground text-center mt-1">
              {datos?.alertas.length ? `${datos.alertas.map((p) => `${ORD[p] || p} periodo`).join(" y ")} · ` : ""}
              Resuelve aquí lo que falta. Todo se guarda en tu tabla de notas.
            </p>
            {datos && totalInicial > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{total === 0 ? "Todo resuelto" : `Te ${total === 1 ? "falta 1" : `faltan ${total}`}`}</span>
                  <span>{progreso}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progreso}%` }} />
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-center text-destructive">{error}</p>}
          {!datos && !error && <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>}

          {datos && total === 0 && (
            <div className="bg-card rounded-lg shadow-soft p-10 text-center">
              <PartyPopper className="w-12 h-12 mx-auto text-primary mb-3" />
              <p className="text-lg font-bold text-foreground">¡Todo al día!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {datos.alertas.length ? "No tienes pendientes para los boletines." : "No hay ninguna alerta de boletines activa."}
              </p>
              <Button className="mt-5" onClick={() => navigate(computeBackLinkFromSession())}>Volver al inicio</Button>
            </div>
          )}

          {clasesVisibles.map(({ periodo, c }) => {
            const kc = claveC(periodo, c);
            const soloFalta = c.pendientes === 1 && !c.periodo_completo && !c.sin_notas;
            return (
              <div key={kc} className="bg-card rounded-lg shadow-soft overflow-hidden" data-guia="ponte_al_dia.clase">
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-primary/5">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground">{c.asignatura}</p>
                    <p className="text-xs text-muted-foreground">{c.grado} {c.salon}{datos.alertas.length > 1 ? ` · ${ORD[periodo]} periodo` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.pendientes === 0
                      ? <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Al día</span>
                      : <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">{c.pendientes} {c.pendientes === 1 ? "pendiente" : "pendientes"}</span>}
                    <button onClick={() => abrirPlanilla(periodo, c)} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Abrir la tabla de notas de esta clase">
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {c.pendientes > 0 && <div className="p-5 space-y-5">
                  {c.sin_notas && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                      <p className="text-sm text-amber-900 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Esta clase no tiene ninguna nota en el periodo. En el boletín saldría en blanco.</p>
                      <Button size="sm" onClick={() => abrirPlanilla(periodo, c)} className="gap-1 shrink-0"><ExternalLink className="w-4 h-4" /> Abrir planilla</Button>
                    </div>
                  )}

                  {c.faltantes.length > 0 && (
                    <div className="space-y-4" data-guia="ponte_al_dia.faltantes">
                      <p className="text-sm font-semibold text-foreground">Notas que faltan</p>
                      {c.faltantes.map((f) => {
                        const kf = `${kc}|${f.actividad}`;
                        return (
                          <div key={kf} className="rounded-lg border border-border">
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                              <p className="text-sm font-medium text-foreground">{f.actividad}{f.grupo && <span className="ml-2 text-xs text-muted-foreground">({f.grupo})</span>}</p>
                              {f.estudiantes.length > 1 && (
                                <button onClick={() => guardarNota(periodo, c, f, f.estudiantes, true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-guia="ponte_al_dia.na_todos">
                                  <Ban className="w-3.5 h-3.5" /> No aplica a los {f.estudiantes.length}
                                </button>
                              )}
                            </div>
                            <div className="divide-y divide-border">
                              {f.estudiantes.map((e) => {
                                const k = `${kf}|${e.id}`;
                                return (
                                  <div key={k} className={`flex items-center gap-2 px-3 py-2 transition-colors ${listos[k] ? "bg-green-50" : ""}`}>
                                    <span className="flex-1 text-sm text-foreground truncate">{e.nombre}</span>
                                    {listos[k] ? (
                                      <span className="text-green-700 text-xs inline-flex items-center gap-1"><Check className="w-4 h-4" /> Listo</span>
                                    ) : (
                                      <>
                                        {errores[k] && <span className="text-xs text-destructive">{errores[k]}</span>}
                                        <input
                                          value={valores[k] || ""}
                                          onChange={(ev) => setValores((s) => ({ ...s, [k]: ev.target.value }))}
                                          onKeyDown={(ev) => { if (ev.key === "Enter") guardarNota(periodo, c, f, [e], false); }}
                                          onBlur={() => { if ((valores[k] || "").trim()) guardarNota(periodo, c, f, [e], false); }}
                                          inputMode="decimal" placeholder={placeholder} disabled={!!ocupado[k]}
                                          className="w-20 h-8 text-center border border-input rounded-md text-sm bg-background"
                                          data-guia="ponte_al_dia.casilla"
                                        />
                                        <button onClick={() => guardarNota(periodo, c, f, [e], true)} disabled={!!ocupado[k]}
                                          className="h-8 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted" title="No aplica: esta actividad no era para este estudiante">
                                          {ocupado[k] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "N/A"}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {c.no_cuentan.length > 0 && (
                    <div className="space-y-2" data-guia="ponte_al_dia.no_cuentan">
                      <p className="text-sm font-semibold text-foreground">Actividades que no cuentan en la definitiva</p>
                      {c.no_cuentan.map((nc) => {
                        const k = `${kc}|mover|${nc.actividad}`;
                        return (
                          <div key={k} className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border p-3 ${listos[k] ? "bg-green-50" : ""}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{nc.actividad}</p>
                              <p className="text-xs text-muted-foreground">No cuenta porque {nc.motivo}.</p>
                            </div>
                            {listos[k] ? (
                              <span className="text-green-700 text-xs inline-flex items-center gap-1"><Check className="w-4 h-4" /> Ya cuenta</span>
                            ) : c.grupos_destino.length === 0 ? (
                              <span className="text-xs text-muted-foreground">Crea un grupo con porcentaje en la planilla.</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <select value={destino[k] || c.grupos_destino[0].id} onChange={(ev) => setDestino((s) => ({ ...s, [k]: ev.target.value }))}
                                  className="h-8 px-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                                  {c.grupos_destino.map((g) => <option key={g.id} value={g.id}>{g.nombre} ({g.porcentaje}%)</option>)}
                                </select>
                                <Button size="sm" onClick={() => mover(periodo, c, nc)} disabled={!!ocupado[k]} className="gap-1 h-8">
                                  {ocupado[k] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoveRight className="w-4 h-4" />} Mover
                                </Button>
                              </div>
                            )}
                            {errores[k] && <span className="text-xs text-destructive">{errores[k]}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!c.sin_notas && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1" data-guia="ponte_al_dia.cerrar">
                      {c.periodo_completo ? (
                        <p className="text-sm text-green-700 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Periodo marcado como completo</p>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            {soloFalta ? "Ya tienes todo. Solo falta marcar el periodo como completo." : "Cuando termines, marca el periodo como completo."}
                          </p>
                          <Button size="sm" variant={soloFalta ? "default" : "outline"} onClick={() => cerrar(periodo, c)} disabled={!!ocupado[`${kc}|cerrar`]} className="gap-1 shrink-0">
                            {ocupado[`${kc}|cerrar`] ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Marcar periodo completo
                          </Button>
                        </>
                      )}
                      {errores[`${kc}|cerrar`] && <span className="text-xs text-destructive">{errores[`${kc}|cerrar`]}</span>}
                    </div>
                  )}
                </div>}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default PonteAlDiaBoletines;
