import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Minus, Clock, Save, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizarTexto } from "@/lib/nombresUsuarios";
import HeaderNormi from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/apiClient";

/**
 * Ficha Horario (2026-09-23), en todos los colegios. Flexible: un salón puede
 * no tener nada, tener solo qué materias ve cada día, tenerlas por hora, y
 * además horas de reloj (por nivel). Cada rol ve lo suyo; rector,
 * administrador y coordinadores (en sus niveles) lo arman, y el servidor
 * bloquea cruces de profesores.
 */

interface Profesor { id: string; nombre: string }
interface Clase {
  id?: number; grado: string; salon: string; dia: number; hora: number | null; asignatura: string;
  hora_inicio: string | null; hora_fin: string | null; inicio?: string | null; fin?: string | null; profesores?: Profesor[];
}
interface Franja { hora: number; hora_inicio: string; hora_fin: string }
interface SalonInfo { grado: string; salon: string; nivel: string | null; clases: number; conHora: number }

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const PALETA = ["bg-sky-100 border-sky-200", "bg-emerald-100 border-emerald-200", "bg-amber-100 border-amber-200", "bg-rose-100 border-rose-200", "bg-violet-100 border-violet-200", "bg-lime-100 border-lime-200", "bg-orange-100 border-orange-200", "bg-teal-100 border-teal-200", "bg-fuchsia-100 border-fuchsia-200", "bg-indigo-100 border-indigo-200"];
const colorDe = (a: string) => { let h = 0; for (const ch of a) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETA[h % PALETA.length]; };

/** Rejilla semanal de solo lectura (o editable si se pasa onCelda). */
function Rejilla({ clases, dias, horas, modo, onCelda, franjas }: {
  clases: Clase[]; dias: number[]; horas: number; modo: "salon" | "profesor";
  onCelda?: (dia: number, hora: number) => void; franjas?: Franja[];
}) {
  const en = (d: number, h: number) => clases.filter((c) => c.dia === d && c.hora === h);
  const sinHora = (d: number) => clases.filter((c) => c.dia === d && c.hora == null);
  const haySinHora = dias.some((d) => sinHora(d).length > 0);
  const franja = (h: number) => franjas?.find((f) => f.hora === h);
  return (
    <div className="overflow-x-auto -mx-2 px-2" data-guia="horario.rejilla">
      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1 text-sm">
        {/* table-fixed + colgroup: todos los días con el mismo ancho, sin importar lo largo de las materias. */}
        <colgroup><col className="w-20" />{dias.map((d) => <col key={d} />)}</colgroup>
        <thead>
          <tr>
            <th className="w-20 text-xs font-medium text-muted-foreground">Hora</th>
            {dias.map((d) => <th key={d} className="font-semibold text-foreground py-1">{DIAS[d]}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: horas }, (_, i) => i + 1).map((h) => {
            const fr = franja(h);
            return (
              <tr key={h}>
                <td className="text-center align-middle">
                  <div className="font-semibold text-foreground">{h}.ª</div>
                  {fr && <div className="text-[11px] text-muted-foreground leading-tight">{fr.hora_inicio}<br />{fr.hora_fin}</div>}
                </td>
                {dias.map((d) => {
                  const cs = en(d, h);
                  const vacia = cs.length === 0;
                  return (
                    <td key={d} className="align-top">
                      <button
                        type="button"
                        disabled={!onCelda}
                        onClick={() => onCelda?.(d, h)}
                        className={`w-full min-h-[64px] rounded-lg border p-2 text-left transition ${vacia ? "border-dashed border-border bg-muted/30" : colorDe(cs[0].asignatura)} ${onCelda ? "hover:ring-2 hover:ring-primary/40 cursor-pointer" : "cursor-default"}`}
                      >
                        {cs.map((c, k) => (
                          <div key={k}>
                            <div className="font-semibold text-foreground leading-tight">{c.asignatura}</div>
                            <div className="text-[11px] text-muted-foreground leading-tight">
                              {modo === "profesor" ? `${c.grado} ${c.salon}` : (c.profesores || []).map((p) => p.nombre).join(", ")}
                            </div>
                            {(c.inicio || c.fin) && !fr && <div className="text-[11px] text-muted-foreground">{c.inicio}{c.fin ? `–${c.fin}` : ""}</div>}
                          </div>
                        ))}
                        {vacia && onCelda && <span className="text-xs text-muted-foreground">+ Agregar</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {haySinHora && (
            <tr>
              <td className="text-center text-xs text-muted-foreground align-middle">Sin hora</td>
              {dias.map((d) => (
                <td key={d} className="align-top">
                  <div className="flex flex-col gap-1">
                    {sinHora(d).map((c, k) => (
                      <div key={k} className={`rounded-lg border p-2 ${colorDe(c.asignatura)}`}>
                        <div className="font-semibold text-foreground leading-tight">{c.asignatura}</div>
                        <div className="text-[11px] text-muted-foreground">{modo === "profesor" ? `${c.grado} ${c.salon}` : (c.profesores || []).map((p) => p.nombre).join(", ")}</div>
                      </div>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const diasDe = (clases: Clase[]) => {
  const s = new Set([1, 2, 3, 4, 5]);
  for (const c of clases) s.add(c.dia);
  return [...s].sort();
};
const horasDe = (clases: Clase[], min = 6) => Math.max(min, ...clases.map((c) => c.hora || 0));

function SinHorario({ texto }: { texto: string }) {
  return <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-muted-foreground">{texto}</div>;
}

export default function Horario() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [mio, setMio] = useState<any>(null);

  // Vista del personal
  const [vista, setVista] = useState<"salon" | "profesor">("salon");
  const [salones, setSalones] = useState<SalonInfo[]>([]);
  const [salonSel, setSalonSel] = useState<string>("");
  const [datosSalon, setDatosSalon] = useState<any>(null);
  const [cargandoSalon, setCargandoSalon] = useState(false);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [profSel, setProfSel] = useState("");
  const [clasesProf, setClasesProf] = useState<Clase[] | null>(null);
  const [estSel, setEstSel] = useState(0);

  // Edición
  const [borrador, setBorrador] = useState<Clase[] | null>(null);
  const [horasEdit, setHorasEdit] = useState(6);
  const [celda, setCelda] = useState<{ dia: number; hora: number } | null>(null);
  const [buscaMateria, setBuscaMateria] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cruces, setCruces] = useState<any[] | null>(null);
  const [franjasEdit, setFranjasEdit] = useState<Franja[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiRequest<any>("/api/horario/mio");
        setMio(r);
        if (r.tipo === "staff" || r.tipo === "profesor") {
          const s = await apiRequest<any>("/api/horario/salones");
          setSalones(s.salones || []);
          if (r.tipo === "staff") apiRequest<any>("/api/horario/profesores").then((p) => setProfesores(p.profesores || [])).catch(() => null);
        }
      } catch (e: any) {
        toast({ title: "No se pudo cargar el horario", description: e?.body?.detail || e?.message, variant: "destructive" });
      }
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarSalon = async (clave: string) => {
    setSalonSel(clave); setBorrador(null); setFranjasEdit(null);
    if (!clave) { setDatosSalon(null); return; }
    const [grado, salon] = clave.split("|");
    setCargandoSalon(true);
    try {
      const r = await apiRequest<any>(`/api/horario/salon?grado=${encodeURIComponent(grado)}&salon=${encodeURIComponent(salon)}`);
      setDatosSalon(r);
    } catch (e: any) {
      toast({ title: "No se pudo cargar el salón", description: e?.body?.detail || e?.message, variant: "destructive" });
    }
    setCargandoSalon(false);
  };

  const cargarProfesor = async (id: string) => {
    setProfSel(id); setClasesProf(null);
    if (!id) return;
    try { const r = await apiRequest<any>(`/api/horario/profesor?id=${encodeURIComponent(id)}`); setClasesProf(r.clases || []); }
    catch (e: any) { toast({ title: "No se pudo cargar", description: e?.body?.detail || e?.message, variant: "destructive" }); }
  };

  const empezarEdicion = () => {
    const cls: Clase[] = (datosSalon?.clases || []).map((c: Clase) => ({ ...c }));
    setBorrador(cls); setHorasEdit(horasDe(cls));
  };
  const asignarCelda = (asignatura: string | null) => {
    if (!celda || !borrador) return;
    const resto = borrador.filter((c) => !(c.dia === celda.dia && c.hora === celda.hora));
    const nueva = asignatura ? [{ grado: datosSalon.grado, salon: datosSalon.salon, dia: celda.dia, hora: celda.hora, asignatura, hora_inicio: null, hora_fin: null, profesores: (datosSalon.asignaturas || []).find((a: any) => a.asignatura === asignatura)?.profesores || [] }] : [];
    setBorrador([...resto, ...nueva]); setCelda(null);
  };
  const guardar = async () => {
    if (!borrador) return;
    setGuardando(true);
    try {
      const r = await apiRequest<any>("/api/horario/salon", { method: "PUT", body: JSON.stringify({ grado: datosSalon.grado, salon: datosSalon.salon, clases: borrador.filter((c) => c.hora == null || c.hora <= horasEdit).map(({ dia, hora, asignatura, hora_inicio, hora_fin }) => ({ dia, hora, asignatura, hora_inicio, hora_fin })) }) });
      toast({ title: "Horario guardado", description: `${r.guardadas} clase(s) de ${datosSalon.grado} ${datosSalon.salon}.${r.sinAsignacion?.length ? ` Sin profesor asignado: ${r.sinAsignacion.join(", ")}.` : ""}` });
      await cargarSalon(salonSel);
      setSalones((prev) => prev.map((s) => (`${s.grado}|${s.salon}` === salonSel ? { ...s, clases: r.guardadas } : s)));
    } catch (e: any) {
      if (e?.status === 409 && e?.body?.cruces) setCruces(e.body.cruces);
      else toast({ title: "No se pudo guardar", description: e?.body?.detail || e?.message, variant: "destructive" });
    }
    setGuardando(false);
  };
  const guardarFranjas = async () => {
    if (!franjasEdit || !datosSalon?.nivel) return;
    try {
      await apiRequest("/api/horario/franjas", { method: "PUT", body: JSON.stringify({ nivel: datosSalon.nivel, franjas: franjasEdit.filter((f) => f.hora_inicio && f.hora_fin) }) });
      toast({ title: "Horas guardadas", description: `Aplican a todos los salones de ${datosSalon.nivel}.` });
      setFranjasEdit(null); await cargarSalon(salonSel);
    } catch (e: any) { toast({ title: "No se pudieron guardar las horas", description: e?.body?.detail || e?.message, variant: "destructive" }); }
  };

  const salonesPorNivel = useMemo(() => {
    const m = new Map<string, SalonInfo[]>();
    for (const s of salones) { const k = s.nivel || "Otros"; m.set(k, [...(m.get(k) || []), s]); }
    return [...m];
  }, [salones]);

  const asignaturasSalon: { asignatura: string; profesores: Profesor[] }[] = datosSalon?.asignaturas || [];
  // Buscador del diálogo: cada palabra debe aparecer en la materia o en el profesor (sin tildes ni mayúsculas).
  const materiasFiltradas = (() => {
    const palabras = normalizarTexto(buscaMateria.trim()).split(/\s+/).filter(Boolean);
    if (!palabras.length) return asignaturasSalon;
    return asignaturasSalon.filter((a) => {
      const t = normalizarTexto(`${a.asignatura} ${a.profesores.map((p) => p.nombre).join(" ")}`);
      return palabras.every((w) => t.includes(w));
    });
  })();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8 space-y-6">
        <div className="bg-card rounded-lg shadow-soft p-4">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Horario</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-4 md:p-6 space-y-5">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Clock className="w-6 h-6 text-primary" /> Horario de clases</h1>

          {cargando ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !mio ? null : (mio.tipo === "estudiante" || mio.tipo === "acudiente") ? (
            <div className="space-y-4">
              {mio.tipo === "acudiente" && (mio.estudiantes || []).length > 1 && (
                <div className="flex flex-wrap gap-2" data-guia="horario.selector_estudiante">
                  {mio.estudiantes.map((e: any, i: number) => (
                    <button key={e.id} onClick={() => setEstSel(i)} className={`px-3 py-1.5 rounded-full border text-sm ${estSel === i ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}>
                      {e.nombre.split(" ")[0]} · {e.grado} {e.salon}
                    </button>
                  ))}
                </div>
              )}
              {(() => {
                const e = (mio.estudiantes || [])[mio.tipo === "acudiente" ? estSel : 0];
                if (!e) return <SinHorario texto="No encontramos estudiantes para mostrar su horario." />;
                return (
                  <>
                    <p className="text-sm text-muted-foreground">{mio.tipo === "acudiente" ? `${e.nombre} · ` : ""}{e.grado} {e.salon}</p>
                    {e.clases.length ? <Rejilla clases={e.clases} dias={diasDe(e.clases)} horas={horasDe(e.clases, 1)} modo="salon" />
                      : <SinHorario texto="El horario de este salón todavía no está cargado en la plataforma." />}
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-5">
              {mio.tipo === "profesor" && (
                <section className="space-y-2">
                  <h2 className="font-semibold text-foreground">Mis clases</h2>
                  {mio.clases?.length ? <Rejilla clases={mio.clases} dias={diasDe(mio.clases)} horas={horasDe(mio.clases, 1)} modo="profesor" />
                    : <SinHorario texto="Todavía no hay clases tuyas en el horario cargado." />}
                </section>
              )}

              {mio.tipo === "staff" && (
                <div className="flex gap-2" data-guia="horario.vista">
                  <Button variant={vista === "salon" ? "default" : "outline"} size="sm" onClick={() => setVista("salon")}>Por salón</Button>
                  <Button variant={vista === "profesor" ? "default" : "outline"} size="sm" onClick={() => setVista("profesor")} data-guia="horario.vista_profesor">Por profesor</Button>
                </div>
              )}

              {(vista === "salon" || mio.tipo === "profesor") && (
                <section className="space-y-4">
                  {mio.tipo === "profesor" && <h2 className="font-semibold text-foreground pt-2">Horario de un salón</h2>}
                  <div data-guia="horario.selector_salon">
                    <label className="text-sm font-medium block mb-1">Salón</label>
                    <select value={salonSel} onChange={(e) => cargarSalon(e.target.value)} className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">Escoge un salón…</option>
                      {salonesPorNivel.map(([nivel, ss]) => (
                        <optgroup key={nivel} label={nivel}>
                          {ss.map((s) => <option key={`${s.grado}|${s.salon}`} value={`${s.grado}|${s.salon}`}>{s.grado} {s.salon}{s.clases ? "" : " (sin horario)"}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {cargandoSalon && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
                  {datosSalon && !cargandoSalon && (
                    <div className="space-y-3">
                      {datosSalon.puedeEditar && !borrador && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={empezarEdicion} data-guia="horario.editar">{datosSalon.clases.length ? "Editar horario" : "Armar horario"}</Button>
                          {datosSalon.nivel && <Button size="sm" variant="outline" onClick={() => setFranjasEdit(Array.from({ length: Math.max(horasDe(datosSalon.clases), datosSalon.franjas.length) }, (_, i) => datosSalon.franjas.find((f: Franja) => f.hora === i + 1) || { hora: i + 1, hora_inicio: "", hora_fin: "" }))} data-guia="horario.franjas"><Clock className="w-4 h-4 mr-1" /> Horas de {datosSalon.nivel}</Button>}
                        </div>
                      )}
                      {borrador ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                            <span>Toca una casilla para escoger la materia.</span>
                            <span className="flex items-center gap-1">Horas por día:
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setHorasEdit((h) => Math.max(1, h - 1))}><Minus className="w-3 h-3" /></Button>
                              <b className="w-5 text-center">{horasEdit}</b>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setHorasEdit((h) => Math.min(15, h + 1))}><Plus className="w-3 h-3" /></Button>
                            </span>
                          </div>
                          <Rejilla clases={borrador} dias={diasDe(borrador)} horas={horasEdit} modo="salon" franjas={datosSalon.franjas} onCelda={(dia, hora) => { setBuscaMateria(""); setCelda({ dia, hora }); }} />
                          <div className="flex gap-2">
                            <Button onClick={guardar} disabled={guardando} data-guia="horario.guardar">{guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Guardar horario</Button>
                            <Button variant="outline" onClick={() => setBorrador(null)} disabled={guardando}>Cancelar</Button>
                          </div>
                        </div>
                      ) : datosSalon.clases.length ? (
                        <Rejilla clases={datosSalon.clases} dias={diasDe(datosSalon.clases)} horas={horasDe(datosSalon.clases, 1)} modo="salon" franjas={datosSalon.franjas} />
                      ) : (
                        <SinHorario texto={`${datosSalon.grado} ${datosSalon.salon} todavía no tiene horario cargado.`} />
                      )}
                    </div>
                  )}
                </section>
              )}

              {vista === "profesor" && mio.tipo === "staff" && (
                <section className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Profesor</label>
                    <select value={profSel} onChange={(e) => cargarProfesor(e.target.value)} className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">Escoge un profesor…</option>
                      {profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  {clasesProf && (clasesProf.length ? <Rejilla clases={clasesProf} dias={diasDe(clasesProf)} horas={horasDe(clasesProf, 1)} modo="profesor" />
                    : <SinHorario texto="Este profesor todavía no tiene clases en el horario cargado." />)}
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Escoger materia para una casilla */}
      <Dialog open={!!celda} onOpenChange={(o) => !o && setCelda(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{celda ? `${DIAS[celda.dia]}, ${celda.hora}.ª hora` : ""}</DialogTitle></DialogHeader>
          {asignaturasSalon.length > 0 && (
            <div className="relative" data-guia="horario.buscar_materia">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={buscaMateria} onChange={(e) => setBuscaMateria(e.target.value)} placeholder="Buscar materia o profesor" className="pl-9" />
            </div>
          )}
          <div className="max-h-[55vh] overflow-y-auto space-y-1" data-guia="horario.escoger_materia">
            {asignaturasSalon.length === 0 && <p className="text-sm text-muted-foreground">Este salón no tiene materias asignadas en Configurar Institución.</p>}
            {asignaturasSalon.length > 0 && materiasFiltradas.length === 0 && <p className="text-sm text-muted-foreground py-2">Ninguna materia coincide con la búsqueda.</p>}
            {materiasFiltradas.map((a) => (
              <button key={a.asignatura} onClick={() => asignarCelda(a.asignatura)} className={`w-full text-left rounded-lg border p-2 hover:ring-2 hover:ring-primary/40 ${colorDe(a.asignatura)}`}>
                <div className="font-semibold text-foreground">{a.asignatura}</div>
                <div className="text-xs text-muted-foreground">{a.profesores.map((p) => p.nombre).join(", ") || "Sin profesor asignado"}</div>
              </button>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => asignarCelda(null)}><X className="w-4 h-4 mr-1" /> Dejar vacía</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cruces que bloquearon el guardado */}
      <Dialog open={!!cruces} onOpenChange={(o) => !o && setCruces(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>No se guardó: hay cruces</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Estos profesores quedarían en dos salones a la misma hora. Cambia esas casillas y vuelve a guardar.</p>
          <ul className="space-y-2 text-sm">
            {(cruces || []).map((c, i) => (
              <li key={i} className="rounded-md border border-border p-2">
                <b>{c.profesor}</b> · {DIAS[c.dia]}, {c.hora}.ª hora<br />
                <span className="text-muted-foreground">Ya tiene clase en {c.salones.join(", ")}</span>
              </li>
            ))}
          </ul>
          <DialogFooter><Button onClick={() => setCruces(null)}>Entendido</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Horas de reloj por nivel */}
      <Dialog open={!!franjasEdit} onOpenChange={(o) => !o && setFranjasEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Horas de {datosSalon?.nivel}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Opcional. A qué hora empieza y termina cada hora de clase; aplica a todos los salones del nivel. Las que dejes vacías quedan sin hora.</p>
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {(franjasEdit || []).map((f, i) => (
              <div key={f.hora} className="flex items-center gap-2 text-sm">
                <span className="w-12 font-medium">{f.hora}.ª</span>
                <input type="time" value={f.hora_inicio} onChange={(e) => setFranjasEdit((prev) => prev!.map((x, k) => (k === i ? { ...x, hora_inicio: e.target.value } : x)))} className="h-9 rounded-md border border-input bg-background px-2" />
                <span>a</span>
                <input type="time" value={f.hora_fin} onChange={(e) => setFranjasEdit((prev) => prev!.map((x, k) => (k === i ? { ...x, hora_fin: e.target.value } : x)))} className="h-9 rounded-md border border-input bg-background px-2" />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFranjasEdit((prev) => [...(prev || []), { hora: (prev?.length || 0) + 1, hora_inicio: "", hora_fin: "" }])}><Plus className="w-4 h-4 mr-1" /> Otra hora</Button>
            <Button onClick={guardarFranjas}>Guardar horas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
