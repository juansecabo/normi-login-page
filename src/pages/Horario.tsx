import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Plus, Minus, Clock, Save, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizarTexto } from "@/lib/nombresUsuarios";
import HeaderNormi from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/apiClient";
import { estiloAsignatura, useColoresAsignaturas } from "@/lib/coloresAsignaturas";

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
// Color guardado de cada asignatura (Asignaturas.color, ver lib/coloresAsignaturas). Lo
// actualiza HorarioContenido al cargar; las rejillas se vuelven a pintar con él.
let coloresActuales: Record<string, string> = {};
const colorDe = (a: string) => estiloAsignatura(a, coloresActuales).className;
const estiloDe = (a: string) => estiloAsignatura(a, coloresActuales).style;

/** Rejilla semanal de solo lectura (o editable si se pasa onCelda). */
function Rejilla({ clases, dias, horas, modo, onCelda, franjas, guia = "horario.rejilla" }: {
  clases: Clase[]; dias: number[]; horas: number; modo: "salon" | "profesor";
  onCelda?: (dia: number, hora: number) => void; franjas?: Franja[]; guia?: string;
}) {
  const en = (d: number, h: number) => clases.filter((c) => c.dia === d && c.hora === h);
  const sinHora = (d: number) => clases.filter((c) => c.dia === d && c.hora == null);
  const haySinHora = dias.some((d) => sinHora(d).length > 0);
  const franja = (h: number) => franjas?.find((f) => f.hora === h);
  return (
    <div className="overflow-x-auto -mx-2 px-2" data-guia={guia}>
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
                  {fr && <div className="text-[11px] font-bold text-muted-foreground leading-tight">{fr.hora_inicio}<br />{fr.hora_fin}</div>}
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
                        style={vacia ? undefined : estiloDe(cs[0].asignatura)}
                      >
                        {cs.map((c, k) => (
                          <div key={k}>
                            <div className="font-semibold text-foreground leading-tight">{c.asignatura}</div>
                            <div className="text-[11px] text-muted-foreground leading-tight">
                              {modo === "profesor" ? `${c.grado} ${c.salon}` : (c.profesores || []).map((p) => p.nombre).join(", ")}
                            </div>
                            {(c.inicio || c.fin) && !fr && <div className="text-[11px] text-muted-foreground">{c.inicio}{c.fin ? ` a ${c.fin}` : ""}</div>}
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
                      <div key={k} className={`rounded-lg border p-2 ${colorDe(c.asignatura)}`} style={estiloDe(c.asignatura)}>
                        <div className="font-semibold text-foreground leading-tight">{c.asignatura}</div>
                        <div className="text-[11px] font-bold text-muted-foreground">{modo === "profesor" ? `${c.grado} ${c.salon}` : (c.profesores || []).map((p) => p.nombre).join(", ")}</div>
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

/**
 * Horario de clases. En el dashboard (ficha "Horario") es solo para ver; se arma y se
 * cambia en Configurar Institución → Horario de clases (`embebido`), igual que el
 * calendario (Juan 2026-09-24).
 */
export function HorarioContenido({ embebido = false }: { embebido?: boolean }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  coloresActuales = useColoresAsignaturas();
  const [cargando, setCargando] = useState(true);
  const [mio, setMio] = useState<any>(null);

  // Vista del personal
  const [vista, setVista] = useState<"salon" | "profesor">("salon");
  const [salones, setSalones] = useState<SalonInfo[]>([]);
  const [salonSel, setSalonSel] = useState<string>("");
  const [nivelSel, setNivelSel] = useState("");
  const [gradoSel, setGradoSel] = useState("");
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
  const [avisoHorario, setAvisoHorario] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cruces, setCruces] = useState<any[] | null>(null);
  const [franjasEdit, setFranjasEdit] = useState<Franja[] | null>(null);
  // Lo escogido (vista, nivel, grado, salón, profesor, estudiante) vive también en la
  // dirección de la página: al actualizar o compartir el enlace se conserva.
  const [params, setParams] = useSearchParams();
  const [restaurado, setRestaurado] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiRequest<any>("/api/horario/mio");
        setMio(r);
        if (r.tipo === "staff" || r.tipo === "profesor") {
          const s = await apiRequest<any>("/api/horario/salones");
          // En Configurar Institución el coordinador solo ve los salones de los niveles que puede
          // configurar (niveles_edita con lista; null = todos, rector y administrador).
          const edita: string[] | null = Array.isArray(s.niveles_edita) && s.niveles_edita.length ? s.niveles_edita : null;
          const lista: SalonInfo[] = (s.salones || []).filter((x: SalonInfo) => !embebido || !edita || edita.includes(x.nivel || ""));
          setSalones(lista);
          if (r.tipo === "staff") apiRequest<any>("/api/horario/profesores").then((p) => setProfesores(p.profesores || [])).catch(() => null);
          // Restaurar la selección desde la dirección.
          const pv = params.get("por") || (embebido ? null : params.get("vista")), pn = params.get("nivel") || "", pg = params.get("grado") || "", ps = params.get("salon") || "", pp = params.get("profesor") || "";
          if (r.tipo === "staff" && pv === "profesor") { setVista("profesor"); if (pp) cargarProfesor(pp); }
          if (pn && lista.some((x) => (x.nivel || "Otros") === pn)) {
            setNivelSel(pn);
            if (pg && lista.some((x) => (x.nivel || "Otros") === pn && x.grado === pg)) {
              setGradoSel(pg);
              if (ps && lista.some((x) => x.grado === pg && x.salon === ps)) cargarSalon(`${pg}|${ps}`);
            }
          }
        }
        const pe = Number(params.get("estudiante"));
        if (pe > 0 && pe < (r.estudiantes?.length || 0)) setEstSel(pe);
      } catch (e: any) {
        toast({ title: "No se pudo cargar el horario", description: e?.body?.detail || e?.message, variant: "destructive" });
      }
      setCargando(false);
      setRestaurado(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurado) return;
    // Se conserva lo demás de la dirección (en Configurar Institución, la ficha abierta).
    const q = new URLSearchParams(params);
    for (const k of ["por", "nivel", "grado", "salon", "profesor", "estudiante"]) q.delete(k);
    if (!embebido) q.delete("vista");
    if (vista === "profesor") { q.set("por", "profesor"); if (profSel) q.set("profesor", profSel); }
    else {
      if (nivelSel) q.set("nivel", nivelSel);
      if (gradoSel) q.set("grado", gradoSel);
      if (salonSel) q.set("salon", salonSel.split("|")[1] || "");
    }
    if (estSel > 0) q.set("estudiante", String(estSel));
    if (q.toString() !== params.toString()) setParams(q, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurado, vista, nivelSel, gradoSel, salonSel, profSel, estSel]);

  // Solo se pinta la respuesta del ÚLTIMO salón pedido: si llega tarde la de uno
  // anterior (red lenta y cambio de salón), se descarta.
  const pedidoSalon = useRef("");
  const cargarSalon = async (clave: string) => {
    pedidoSalon.current = clave;
    setSalonSel(clave); setBorrador(null); setFranjasEdit(null);
    if (!clave) { setDatosSalon(null); setCargandoSalon(false); return; }
    const [grado, salon] = clave.split("|");
    setCargandoSalon(true); setDatosSalon(null);
    try {
      const r = await apiRequest<any>(`/api/horario/salon?grado=${encodeURIComponent(grado)}&salon=${encodeURIComponent(salon)}`);
      if (pedidoSalon.current !== clave) return;
      setDatosSalon(r);
    } catch (e: any) {
      if (pedidoSalon.current !== clave) return;
      toast({ title: "No se pudo cargar el salón", description: e?.body?.detail || e?.message, variant: "destructive" });
    }
    setCargandoSalon(false);
  };

  const pedidoProf = useRef("");
  const cargarProfesor = async (id: string) => {
    pedidoProf.current = id;
    setProfSel(id); setClasesProf(null);
    if (!id) return;
    try { const r = await apiRequest<any>(`/api/horario/profesor?id=${encodeURIComponent(id)}`); if (pedidoProf.current === id) setClasesProf(r.clases || []); }
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
      if (r.sinAsignacion?.length) setAvisoHorario(`El horario de ${datosSalon.grado} ${datosSalon.salon} quedó guardado, pero estas materias no tienen profesor asignado en ese salón (Configurar Institución): ${r.sinAsignacion.join(", ")}. A nadie le llegarán avisos de esas horas.`);
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
  const gradosDelNivel = useMemo(() => [...new Set((salonesPorNivel.find(([n]) => n === nivelSel)?.[1] || []).map((x) => x.grado))], [salonesPorNivel, nivelSel]);
  const salonesDelGrado = useMemo(() => salones.filter((x) => (x.nivel || "Otros") === nivelSel && x.grado === gradoSel), [salones, nivelSel, gradoSel]);

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
    <>
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
                  {/* Nivel → grado → salón, filtrándose según lo escogido (como en las demás fichas). */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                    <div>
                      <label className="text-sm font-medium block mb-1">Nivel</label>
                      <Select value={nivelSel} onValueChange={(v) => { setNivelSel(v); setGradoSel(""); cargarSalon(""); }}>
                        <SelectTrigger data-guia="horario.selector_nivel"><SelectValue placeholder="Escoge el nivel" /></SelectTrigger>
                        <SelectContent>{salonesPorNivel.map(([n]) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">Grado</label>
                      <Select value={gradoSel} onValueChange={(v) => { setGradoSel(v); cargarSalon(""); }} disabled={!nivelSel}>
                        <SelectTrigger data-guia="horario.selector_grado"><SelectValue placeholder="Escoge el grado" /></SelectTrigger>
                        <SelectContent>{gradosDelNivel.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">Salón</label>
                      <Select value={salonSel} onValueChange={(v) => cargarSalon(v)} disabled={!gradoSel}>
                        <SelectTrigger data-guia="horario.selector_salon"><SelectValue placeholder="Escoge el salón" /></SelectTrigger>
                        <SelectContent>{salonesDelGrado.map((x) => <SelectItem key={x.salon} value={`${x.grado}|${x.salon}`}>{x.salon}{x.clases ? "" : " (sin horario)"}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  {cargandoSalon && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
                  {datosSalon && !cargandoSalon && (
                    <div className="space-y-3">
                      {!embebido && datosSalon.puedeEditar && (
                        <p className="text-xs text-muted-foreground text-right">
                          Para cambiarlo, entra a <button type="button" className="text-primary hover:underline" onClick={() => navigate("/construye-institucion?vista=horario")}>Configurar Institución</button>.
                        </p>
                      )}
                      {embebido && datosSalon.puedeEditar && !borrador && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={empezarEdicion} data-guia="horario.editar">{datosSalon.clases.length ? "Editar horario" : "Armar horario"}</Button>
                          {datosSalon.nivel && <Button size="sm" variant="outline" onClick={() => setFranjasEdit(Array.from({ length: Math.max(horasDe(datosSalon.clases), 0, ...datosSalon.franjas.map((f: Franja) => f.hora)) }, (_, i) => datosSalon.franjas.find((f: Franja) => f.hora === i + 1) || { hora: i + 1, hora_inicio: "", hora_fin: "" }))} data-guia="horario.franjas"><Clock className="w-4 h-4 mr-1" /> Horas de {datosSalon.nivel}</Button>}
                        </div>
                      )}
                      {borrador ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                            <span>Toca una casilla para escoger la materia.</span>
                            <span className="flex items-center gap-1">Horas por día:
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setHorasEdit((h) => Math.max(1, h - 1))} disabled={horasEdit <= Math.max(1, ...(borrador || []).map((c) => c.hora || 0))} title={horasEdit <= Math.max(1, ...(borrador || []).map((c) => c.hora || 0)) ? "Primero deja vacía la última hora" : undefined}><Minus className="w-3 h-3" /></Button>
                              <b className="w-5 text-center">{horasEdit}</b>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setHorasEdit((h) => Math.min(15, h + 1))}><Plus className="w-3 h-3" /></Button>
                            </span>
                          </div>
                          <Rejilla guia="horario.rejilla_salon" clases={borrador} dias={diasDe(borrador)} horas={horasEdit} modo="salon" franjas={datosSalon.franjas} onCelda={(dia, hora) => { setBuscaMateria(""); setCelda({ dia, hora }); }} />
                          <div className="flex justify-end gap-2">
                            <Button onClick={guardar} disabled={guardando} data-guia="horario.guardar">{guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Guardar horario</Button>
                            <Button variant="outline" onClick={() => setBorrador(null)} disabled={guardando}>Cancelar</Button>
                          </div>
                        </div>
                      ) : datosSalon.clases.length ? (
                        <Rejilla guia="horario.rejilla_salon" clases={datosSalon.clases} dias={diasDe(datosSalon.clases)} horas={horasDe(datosSalon.clases, 1)} modo="salon" franjas={datosSalon.franjas} />
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
                  {clasesProf && (clasesProf.length ? <Rejilla guia="horario.rejilla_profesor" clases={clasesProf} dias={diasDe(clasesProf)} horas={horasDe(clasesProf, 1)} modo="profesor" />
                    : <SinHorario texto="Este profesor todavía no tiene clases en el horario cargado." />)}
                </section>
              )}
            </div>
          )}
        </div>

      <Dialog open={!!avisoHorario} onOpenChange={(o) => !o && setAvisoHorario(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Horario guardado</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{avisoHorario}</p>
          <DialogFooter><Button onClick={() => setAvisoHorario(null)}>Entendido</Button></DialogFooter>
        </DialogContent>
      </Dialog>

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
            {celda && asignaturasSalon.length > 0 && asignaturasSalon.every((a) => a.profesores.some((p) => (datosSalon?.ocupados?.[`${p.id}|${celda.dia}|${celda.hora}`] || []).length)) && (
              <p className="text-sm rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900">Todos los profesores de este salón tienen clase en otro salón a esta hora. Para llenarla, primero mueve alguna de esas clases o deja esta hora vacía.</p>
            )}
            {/* Cruces al escoger: si el profesor ya tiene clase en otro salón a esta hora, la materia sale en gris, con el motivo, y no se puede escoger. Las disponibles van primero. */}
            {materiasFiltradas
              .map((a) => ({ a, cruces: celda ? a.profesores.flatMap((p) => [...new Set<string>(datosSalon?.ocupados?.[`${p.id}|${celda.dia}|${celda.hora}`] || [])].map((sal: string) => `${p.nombre}: tiene clase en ${sal} a esta hora`)) : [] }))
              .sort((x, y) => Number(x.cruces.length > 0) - Number(y.cruces.length > 0))
              .map(({ a, cruces: cr }) => cr.length ? (
                <div key={a.asignatura} className="w-full text-left rounded-lg border border-dashed p-2 bg-muted/50 opacity-70 cursor-not-allowed" aria-disabled="true">
                  <div className="font-semibold text-muted-foreground">{a.asignatura}</div>
                  {cr.map((t) => <div key={t} className="text-xs text-destructive">{t}</div>)}
                </div>
              ) : (
                <button key={a.asignatura} onClick={() => asignarCelda(a.asignatura)} className={`w-full text-left rounded-lg border p-2 hover:ring-2 hover:ring-primary/40 ${colorDe(a.asignatura)}`} style={estiloDe(a.asignatura)}>
                  <div className="font-semibold text-foreground">{a.asignatura}</div>
                  <div className="text-xs font-bold text-muted-foreground">{a.profesores.map((p) => p.nombre).join(", ") || "Sin profesor asignado"}</div>
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
    </>
  );
}

export default function Horario() {
  const navigate = useNavigate();
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
        <HorarioContenido />
      </main>
    </div>
  );
}
