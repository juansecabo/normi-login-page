import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { apiRequest } from "@/lib/apiClient";
import { useColegioConfig } from "@/hooks/useColegioConfig";
import { limpiarCachePendientes } from "@/components/BannerPendientesBoletines";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, Ban, Check, CheckCircle2, ExternalLink, Loader2, MoveRight, PartyPopper, AlertTriangle, Undo2 } from "lucide-react";

/**
 * "Ponte al día para los boletines" (Juan 2026-10-01): una sola pantalla, por
 * profesor, con EXACTAMENTE lo que le falta en sus clases del periodo con alerta
 * activa. Cada pendiente trae su solución al lado. Todo se guarda en las mismas
 * tablas de la tabla de notas. Lo resuelto NO desaparece: queda a la vista para
 * corregirlo o deshacerlo; solo baja el contador y avanza la barra.
 */
interface Est { id: string; nombre: string }
interface Faltante { actividad: string; grupo: string | null; grupo_porcentaje?: number | null; estudiantes: Est[] }
interface NoCuenta { actividad: string; motivo: string }
interface GrupoDestino { id: string; nombre: string; porcentaje: number }
interface Clase {
  asignatura: string; grado: string; salon: string;
  sin_notas: boolean; faltantes: Faltante[]; no_cuentan: NoCuenta[]; grupos_destino: GrupoDestino[];
  periodo_completo: boolean; pendientes: number;
}
interface Respuesta { alertas: number[]; periodos: Array<{ periodo: number; clases: Clase[]; total: number }>; total: number }
type Hecha = { tipo: "nota"; valor: string } | { tipo: "na" };

const ORD: Record<number, string> = { 1: "1er", 2: "2do", 3: "3er", 4: "4to", 5: "5to", 6: "6to" };
const claveC = (p: number, c: Clase) => `${p}|${c.asignatura}|${c.grado}|${c.salon}`;

const PonteAlDiaBoletines = () => {
  const navigate = useNavigate();
  const { config } = useColegioConfig();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<Record<string, boolean>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [destino, setDestino] = useState<Record<string, string>>({});
  // Lo resuelto en esta pantalla (se queda visible para corregirlo).
  const [hechas, setHechas] = useState<Record<string, Hecha>>({});
  const [movidas, setMovidas] = useState<Record<string, string>>({});
  const [cerradas, setCerradas] = useState<Record<string, boolean>>({});

  const cargar = useCallback(async () => {
    try {
      setDatos(await apiRequest<Respuesta>("/api/boletines/mis-pendientes?fresco=1"));
    } catch (e: any) {
      setError(e?.body?.detail || e?.message || "No se pudo cargar lo que te falta.");
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const ocupar = (claves: string[], si: boolean) =>
    setOcupado((s) => { const n = { ...s }; claves.forEach((k) => { if (si) n[k] = true; else delete n[k]; }); return n; });
  const ponerError = (k: string, msg?: string) =>
    setErrores((s) => { const n = { ...s }; if (msg) n[k] = msg; else delete n[k]; return n; });

  const completoDe = (kc: string, c: Clase) => cerradas[kc] ?? c.periodo_completo;
  const pendientesDe = (periodo: number, c: Clase) => {
    const kc = claveC(periodo, c);
    if (c.sin_notas) return 1;
    let n = completoDe(kc, c) ? 0 : 1;
    for (const f of c.faltantes) for (const e of f.estudiantes) if (!hechas[`${kc}|${f.actividad}|${e.id}`]) n++;
    for (const nc of c.no_cuentan) if (!movidas[`${kc}|mover|${nc.actividad}`]) n++;
    return n;
  };

  // Deja la casilla vacía otra vez (como estaba antes de resolverla aquí).
  const deshacer = async (periodo: number, c: Clase, f: Faltante, ests: Est[]) => {
    const k0 = `${claveC(periodo, c)}|${f.actividad}`;
    const claves = ests.map((e) => `${k0}|${e.id}`);
    // Al instante en pantalla; si el servidor falla, se devuelve.
    const antes = Object.fromEntries(claves.filter((k) => hechas[k]).map((k) => [k, hechas[k]]));
    const valoresAntes = Object.fromEntries(claves.filter((k) => valores[k] != null).map((k) => [k, valores[k]]));
    setHechas((s) => { const n = { ...s }; claves.forEach((k) => delete n[k]); return n; });
    setValores((s) => { const n = { ...s }; claves.forEach((k) => delete n[k]); return n; });
    try {
      await apiRequest("/api/boletines/mis-pendientes/nota", {
        method: "POST",
        body: JSON.stringify({ periodo, asignatura: c.asignatura, grado: c.grado, salon: c.salon, actividad: f.actividad, estudiantes: ests.map((e) => e.id), quitar: true }),
      });
      limpiarCachePendientes();
    } catch (e: any) {
      setHechas((s) => ({ ...s, ...antes }));
      setValores((s) => ({ ...s, ...valoresAntes }));
      ponerError(claves[0], e?.body?.detail || "No se pudo deshacer");
    }
  };

  const guardarNota = async (periodo: number, c: Clase, f: Faltante, ests: Est[], noAplica: boolean, valorDirecto?: string) => {
    const k0 = `${claveC(periodo, c)}|${f.actividad}`;
    const claves = ests.map((e) => `${k0}|${e.id}`);
    let nota: number | null = null;
    let valor = "";
    if (!noAplica) {
      valor = (valorDirecto ?? valores[claves[0]] ?? "").replace(",", ".").trim();
      const previa = hechas[claves[0]];
      if (!valor) { if (previa) deshacer(periodo, c, f, ests); return; }
      if (valorDirecto == null && previa?.tipo === "nota" && previa.valor === valor) return;
      nota = Number(valor);
      const min = Number(config.escala_min ?? 0), max = Number(config.escala_max ?? 5);
      if (!Number.isFinite(nota) || nota < min || nota > max) { ponerError(claves[0], `Entre ${min} y ${max}`); return; }
    }
    claves.forEach((k) => ponerError(k));
    // Al instante en pantalla; si el servidor falla, se devuelve.
    const antes = Object.fromEntries(claves.map((k) => [k, hechas[k]]));
    setHechas((s) => ({ ...s, ...Object.fromEntries(claves.map((k) => [k, noAplica ? { tipo: "na" } : { tipo: "nota", valor }])) }));
    try {
      await apiRequest("/api/boletines/mis-pendientes/nota", {
        method: "POST",
        body: JSON.stringify({ periodo, asignatura: c.asignatura, grado: c.grado, salon: c.salon, actividad: f.actividad, estudiantes: ests.map((e) => e.id), nota, no_aplica: noAplica }),
      });
      limpiarCachePendientes();
    } catch (e: any) {
      setHechas((s) => { const n = { ...s }; for (const k of claves) { if (antes[k]) n[k] = antes[k]; else delete n[k]; } return n; });
      ponerError(claves[0], e?.body?.detail || "No se guardó");
    }
  };

  // "Completar hacia abajo" (como en la tabla de notas): copia la nota a las casillas
  // vacías de abajo en esa actividad y se detiene en la primera que ya esté resuelta.
  const abajoDe = (kf: string, f: Faltante, idx: number) => {
    const out: Est[] = [];
    for (let i = idx + 1; i < f.estudiantes.length; i++) {
      if (hechas[`${kf}|${f.estudiantes[i].id}`]) break;
      out.push(f.estudiantes[i]);
    }
    return out;
  };
  const completarAbajo = (periodo: number, c: Clase, f: Faltante, idx: number, valor: string) => {
    const kf = `${claveC(periodo, c)}|${f.actividad}`;
    const ests = abajoDe(kf, f, idx);
    if (!ests.length) return;
    setValores((s) => ({ ...s, ...Object.fromEntries(ests.map((e) => [`${kf}|${e.id}`, valor])) }));
    guardarNota(periodo, c, f, ests, false, valor);
  };

  const mover = async (periodo: number, c: Clase, nc: NoCuenta) => {
    const k = `${claveC(periodo, c)}|mover|${nc.actividad}`;
    const grupo_id = destino[k] || c.grupos_destino[0]?.id;
    if (!grupo_id) return;
    ocupar([k], true);
    try {
      await apiRequest("/api/boletines/mis-pendientes/mover", {
        method: "POST",
        body: JSON.stringify({ periodo, asignatura: c.asignatura, grado: c.grado, salon: c.salon, actividad: nc.actividad, grupo_id }),
      });
      const g = c.grupos_destino.find((x) => x.id === grupo_id);
      setMovidas((s) => ({ ...s, [k]: g ? `${g.nombre} (${g.porcentaje}%)` : "el grupo" }));
      ponerError(k);
      limpiarCachePendientes();
    } catch (e: any) {
      ponerError(k, e?.body?.detail || "No se pudo mover");
    } finally {
      ocupar([k], false);
    }
  };

  const cerrar = async (periodo: number, c: Clase, completo: boolean) => {
    const k = `${claveC(periodo, c)}|cerrar`;
    ocupar([k], true);
    try {
      await apiRequest("/api/boletines/mis-pendientes/cerrar", {
        method: "POST",
        body: JSON.stringify({ periodo, asignatura: c.asignatura, grado: c.grado, salon: c.salon, completo }),
      });
      setCerradas((s) => ({ ...s, [claveC(periodo, c)]: completo }));
      ponerError(k);
      limpiarCachePendientes();
    } catch (e: any) {
      ponerError(k, e?.body?.detail || "No se pudo cambiar");
    } finally {
      ocupar([k], false);
    }
  };

  const abrirPlanilla = (periodo: number, c: Clase) => {
    localStorage.setItem("asignaturaSeleccionada", c.asignatura);
    localStorage.setItem("gradoSeleccionado", c.grado);
    localStorage.setItem("salonSeleccionado", c.salon);
    navigate(`/tabla-notas?periodo=${periodo}`);
  };

  const clasesVisibles = useMemo(() => (datos?.periodos || []).flatMap((p) => p.clases.map((c) => ({ periodo: p.periodo, c }))), [datos]);
  const totalInicial = datos?.total ?? 0;
  const total = clasesVisibles.reduce((s, { periodo, c }) => s + pendientesDe(periodo, c), 0);
  const progreso = totalInicial > 0 ? Math.round(((totalInicial - total) / totalInicial) * 100) : 100;
  const placeholder = `${config.escala_min ?? 0}-${config.escala_max ?? 5}`;

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
          </div>

          {/* Barra de progreso fija: acompaña mientras se baja por la página. */}
          {datos && totalInicial > 0 && (
            <div className="sticky top-0 z-30 bg-card rounded-lg shadow-soft px-5 py-3 border border-border">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span className="font-medium text-foreground">{total === 0 ? "¡Todo resuelto!" : `Te ${total === 1 ? "falta 1" : `faltan ${total}`}`}</span>
                <span>{progreso}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progreso}%` }} />
              </div>
            </div>
          )}

          {error && <p className="text-center text-destructive">{error}</p>}
          {!datos && !error && <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>}

          {datos && totalInicial === 0 && (
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
            const pend = pendientesDe(periodo, c);
            const completo = completoDe(kc, c);
            const soloFalta = pend === 1 && !completo && !c.sin_notas;
            return (
              <div key={kc} className="bg-card rounded-lg shadow-soft overflow-hidden" data-guia="ponte_al_dia.clase">
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-primary/5">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground">{c.asignatura}</p>
                    <p className="text-xs text-muted-foreground">{c.grado} {c.salon}{datos!.alertas.length > 1 ? ` · ${ORD[periodo]} periodo` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pend === 0
                      ? <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Al día</span>
                      : <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">{pend} {pend === 1 ? "pendiente" : "pendientes"}</span>}
                    <button onClick={() => abrirPlanilla(periodo, c)} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Abrir la tabla de notas de esta clase">
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-5">
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
                        const sinResolver = f.estudiantes.filter((e) => !hechas[`${kf}|${e.id}`]);
                        return (
                          <div key={kf} className="rounded-lg border border-border">
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                              <p className="text-sm font-medium text-foreground">
                                {f.actividad}
                                {f.grupo && <span className="ml-2 text-xs text-muted-foreground">({f.grupo}{f.grupo_porcentaje != null ? ` · ${f.grupo_porcentaje}%` : ""})</span>}
                              </p>
                              {sinResolver.length > 1 && (
                                <button onClick={() => guardarNota(periodo, c, f, sinResolver, true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-guia="ponte_al_dia.na_todos">
                                  <Ban className="w-3.5 h-3.5" /> No aplica a los {sinResolver.length}
                                </button>
                              )}
                            </div>
                            <div className="divide-y divide-border">
                              {f.estudiantes.map((e, idx) => {
                                const k = `${kf}|${e.id}`;
                                const h = hechas[k];
                                const nAbajo = h?.tipo === "nota" ? abajoDe(kf, f, idx).length : 0;
                                return (
                                  <div key={k} className={`flex items-center gap-2 px-3 py-2 transition-colors ${h ? "bg-green-50" : ""}`}>
                                    <span className="flex-1 text-sm text-foreground truncate">{e.nombre}</span>
                                    {errores[k] && <span className="text-xs text-destructive">{errores[k]}</span>}
                                    {h && <Check className="w-4 h-4 text-green-700 shrink-0" />}
                                    {h?.tipo === "na" ? (
                                      <span className="w-20 h-8 inline-flex items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">No aplica</span>
                                    ) : (
                                      <input
                                        value={valores[k] || ""}
                                        onChange={(ev) => setValores((s) => ({ ...s, [k]: ev.target.value }))}
                                        onKeyDown={(ev) => { if (ev.key === "Enter") guardarNota(periodo, c, f, [e], false); }}
                                        onBlur={() => guardarNota(periodo, c, f, [e], false)}
                                        inputMode="decimal" placeholder={placeholder} disabled={!!ocupado[k]}
                                        className="w-20 h-8 text-center border border-input rounded-md text-sm bg-background"
                                        data-guia="ponte_al_dia.casilla"
                                      />
                                    )}
                                    {nAbajo > 0 && h?.tipo === "nota" && (
                                      <button onClick={() => completarAbajo(periodo, c, f, idx, h.valor)}
                                        className="h-8 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted inline-flex items-center gap-1"
                                        title={`Completar hacia abajo: poner ${h.valor} a ${nAbajo === 1 ? "la casilla vacía de abajo" : `las ${nAbajo} casillas vacías de abajo`}`}
                                        data-guia="ponte_al_dia.completar_abajo">
                                        <ArrowDownToLine className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {h ? (
                                      <button onClick={() => deshacer(periodo, c, f, [e])} disabled={!!ocupado[k]}
                                        className="h-8 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted inline-flex items-center gap-1" title="Deshacer: la casilla vuelve a quedar vacía">
                                        {ocupado[k] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                                      </button>
                                    ) : (
                                      <button onClick={() => guardarNota(periodo, c, f, [e], true)} disabled={!!ocupado[k]}
                                        className="h-8 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted" title="No aplica: esta actividad no era para este estudiante">
                                        {ocupado[k] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "N/A"}
                                      </button>
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
                        const movida = movidas[k];
                        return (
                          <div key={k} className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border p-3 ${movida ? "bg-green-50" : ""}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{nc.actividad}</p>
                              {movida
                                ? <p className="text-xs text-green-700 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Ya cuenta, en {movida}</p>
                                : <p className="text-xs text-muted-foreground">No cuenta porque {nc.motivo}.</p>}
                            </div>
                            {c.grupos_destino.length === 0 ? (
                              <span className="text-xs text-muted-foreground">Crea un grupo con porcentaje en la planilla.</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <select value={destino[k] || c.grupos_destino[0].id} onChange={(ev) => setDestino((s) => ({ ...s, [k]: ev.target.value }))}
                                  className="h-8 px-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                                  {c.grupos_destino.map((g) => <option key={g.id} value={g.id}>{g.nombre} ({g.porcentaje}%)</option>)}
                                </select>
                                <Button size="sm" variant={movida ? "outline" : "default"} onClick={() => mover(periodo, c, nc)} disabled={!!ocupado[k]} className="gap-1 h-8">
                                  {ocupado[k] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoveRight className="w-4 h-4" />} {movida ? "Cambiar" : "Mover"}
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
                      {completo ? (
                        <div className="flex items-center gap-3">
                          <p className="text-sm text-green-700 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Periodo marcado como completo</p>
                          {cerradas[kc] && (
                            <button onClick={() => cerrar(periodo, c, false)} disabled={!!ocupado[`${kc}|cerrar`]} className="text-xs text-muted-foreground hover:text-foreground underline">
                              Desmarcar
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            {soloFalta ? "Ya tienes todo. Solo falta marcar el periodo como completo." : "Cuando termines, marca el periodo como completo."}
                          </p>
                          <Button size="sm" variant={soloFalta ? "default" : "outline"} onClick={() => cerrar(periodo, c, true)} disabled={!!ocupado[`${kc}|cerrar`]} className="gap-1 shrink-0">
                            {ocupado[`${kc}|cerrar`] ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Marcar periodo completo
                          </Button>
                        </>
                      )}
                      {errores[`${kc}|cerrar`] && <span className="text-xs text-destructive">{errores[`${kc}|cerrar`]}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default PonteAlDiaBoletines;
