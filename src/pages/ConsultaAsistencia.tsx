import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isEstudiante, isPadreDeFamilia, isProfesor, isAdmin, type AcudidoData } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { apiClient, type AsistenciaEstado, type AsistenciaRegistro } from "@/lib/apiClient";
import HeaderNormi from "@/components/HeaderNormi";
import EncabezadoColegio from "@/components/EncabezadoColegio";
import { rankGrado } from "@/utils/grados";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import MatrizCurso from "@/components/asistencia/MatrizCurso";
import CalendarioEstudiante from "@/components/asistencia/CalendarioEstudiante";
import { resumen, rangoMes, MESES, hoyBogota } from "@/components/asistencia/estados";

type Clase = { asignatura: string; grado: string; salon: string };

const Selector = ({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean;
}) => (
  <div>
    <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground disabled:opacity-50">
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const ConsultaAsistencia = () => {
  const navigate = useNavigate();
  const rolEstudiante = isEstudiante();
  const rolAcudiente = isPadreDeFamilia();
  const esInterno = !rolEstudiante && !rolAcudiente;
  const puedeEditar = isProfesor() || isAdmin(); // el backend valida que el profe solo edite sus clases

  useEffect(() => {
    if (!getSession().id) navigate("/");
  }, [navigate]);

  // ─────────────────────────── INTERNOS ───────────────────────────
  const [clases, setClases] = useState<Clase[]>([]);
  const [asignatura, setAsignatura] = useState("");
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [modoTiempo, setModoTiempo] = useState<"mes" | "dia" | "rango">("mes");
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [diaSel, setDiaSel] = useState(hoyBogota());
  const [desdeLibre, setDesdeLibre] = useState("");
  const [hastaLibre, setHastaLibre] = useState(hoyBogota());

  useEffect(() => {
    if (!esInterno) return;
    apiClient.asistencia.clases().then((r) => setClases(r.clases)).catch(() => setClases([]));
  }, [esInterno]);

  const asignaturas = useMemo(() => [...new Set(clases.map((c) => c.asignatura))].sort((a, b) => a.localeCompare(b, "es")), [clases]);
  const grados = useMemo(() => [...new Set(clases.filter((c) => c.asignatura === asignatura).map((c) => c.grado))].sort((a, b) => rankGrado(a) - rankGrado(b)), [clases, asignatura]);
  const salones = useMemo(() => [...new Set(clases.filter((c) => c.asignatura === asignatura && c.grado === grado).map((c) => c.salon))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })), [clases, asignatura, grado]);

  const { desde, hasta } =
    modoTiempo === "mes" ? rangoMes(mes)
    : modoTiempo === "dia" ? { desde: diaSel, hasta: diaSel }
    : { desde: desdeLibre, hasta: hastaLibre };
  const rangoLabel =
    modoTiempo === "mes" ? `${MESES[mes.getMonth()]} ${mes.getFullYear()}`
    : modoTiempo === "dia" ? diaSel
    : `${desdeLibre || "…"} a ${hastaLibre}`;
  const claseLista = !!(asignatura && grado && salon && (modoTiempo !== "rango" || desdeLibre) && (modoTiempo !== "dia" || diaSel));

  // ─────────────────────── ESTUDIANTE / ACUDIENTE ───────────────────────
  const acudidos = (getSession().acudidos || []) as AcudidoData[];
  const [acudidoSel, setAcudidoSel] = useState<AcudidoData | null>(acudidos.length === 1 ? acudidos[0] : null);
  const sujeto = rolAcudiente
    ? (acudidoSel ? { id: acudidoSel.id, nombres: acudidoSel.nombre, apellidos: acudidoSel.apellidos, grado: acudidoSel.grado, salon: acudidoSel.salon, avatar_url: null as string | null } : null)
    : { id: getSession().id || "", nombres: getSession().nombres || "", apellidos: getSession().apellidos || "", grado: getSession().grado || "", salon: getSession().salon || "", avatar_url: getSession().avatar_url || null };

  const [misRegistros, setMisRegistros] = useState<{ asignatura: string; estado: AsistenciaEstado }[]>([]);
  const [cargandoMios, setCargandoMios] = useState(false);

  useEffect(() => {
    if (esInterno || !sujeto?.id) return;
    setCargandoMios(true);
    supabase.from("Asistencia").select("asignatura, estado").eq("estudiante_id", sujeto.id)
      .then(({ data }) => setMisRegistros((data || []) as { asignatura: string; estado: AsistenciaEstado }[]))
      .then(() => setCargandoMios(false), () => setCargandoMios(false));
  }, [esInterno, sujeto?.id]);

  const resumenPorAsignatura = useMemo(() => {
    const m = new Map<string, { asignatura: string; estado: AsistenciaEstado }[]>();
    for (const r of misRegistros) { if (!m.has(r.asignatura)) m.set(r.asignatura, []); m.get(r.asignatura)!.push(r); }
    return [...m.entries()].map(([asig, regs]) => ({ asignatura: asig, ...resumen(regs) })).sort((a, b) => a.asignatura.localeCompare(b.asignatura, "es"));
  }, [misRegistros]);

  // ─────────────────────────── Modal calendario ───────────────────────────
  const [cal, setCal] = useState<null | {
    estudiante: { estudiante_id: string; nombres: string; apellidos: string; avatar_url: string | null };
    asignatura: string; grado: string; salon: string;
  }>(null);

  const loadMonthInterno = (asig: string, gr: string, sa: string) =>
    (id: string, d: string, h: string) => apiClient.asistencia.historial(asig, gr, sa, d, h, id).then((r) => r.registros);
  const loadMonthSujeto = (asig: string, estId: string) =>
    async (_id: string, d: string, h: string): Promise<AsistenciaRegistro[]> => {
      const { data } = await supabase.from("Asistencia").select("estudiante_id, fecha, estado")
        .eq("asignatura", asig).eq("estudiante_id", estId).gte("fecha", d).lte("fecha", h);
      return (data || []) as AsistenciaRegistro[];
    };
  const onMarcarCal = (asig: string, gr: string, sa: string) =>
    async (estudiante_id: string, fecha: string, estado: AsistenciaEstado) =>
      (await apiClient.asistencia.marcar({ asignatura: asig, grado: gr, salon: sa, fecha, estudiante_id, estado })).estado;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/" />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <EncabezadoColegio />
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-1 text-center">Asistencia</h2>

          {/* ═══════════ INTERNOS ═══════════ */}
          {esInterno && (
            <>
              <p className="text-sm text-muted-foreground mb-5 text-center">
                {puedeEditar ? "Consulta y corrige la asistencia por clase y día." : "Consulta la asistencia por clase y día."}
              </p>
              <div className="bg-card rounded-lg shadow-soft p-4 md:p-5 mb-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <Selector label="Asignatura" value={asignatura} options={asignaturas} onChange={(v) => { setAsignatura(v); setGrado(""); setSalon(""); }} />
                  <Selector label="Grado" value={grado} options={grados} disabled={!asignatura} onChange={(v) => { setGrado(v); setSalon(""); }} />
                  <Selector label="Salón" value={salon} options={salones} disabled={!grado} onChange={setSalon} />
                </div>
                {/* Modo de tiempo: Mes / Día / Rango */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm">
                    {([["mes", "Mes"], ["dia", "Día"], ["rango", "Rango"]] as const).map(([k, lbl]) => (
                      <button key={k} onClick={() => setModoTiempo(k)}
                        className={`px-3 py-1.5 font-medium ${modoTiempo === k ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {modoTiempo === "mes" && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="p-1.5 rounded-full hover:bg-muted"><ChevronLeft className="w-5 h-5" /></button>
                      <span className="font-semibold text-foreground min-w-[140px] text-center">{MESES[mes.getMonth()]} {mes.getFullYear()}</span>
                      <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="p-1.5 rounded-full hover:bg-muted"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                  )}
                  {modoTiempo === "dia" && (
                    <input type="date" value={diaSel} max={hoyBogota()} onChange={(e) => setDiaSel(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
                  )}
                  {modoTiempo === "rango" && (
                    <div className="flex items-center gap-2 text-sm">
                      <input type="date" value={desdeLibre} max={hastaLibre} onChange={(e) => setDesdeLibre(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border bg-background" />
                      <span className="text-muted-foreground">a</span>
                      <input type="date" value={hastaLibre} max={hoyBogota()} onChange={(e) => setHastaLibre(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border bg-background" />
                    </div>
                  )}
                </div>
              </div>

              {!claseLista ? (
                <p className="text-center text-muted-foreground py-8 flex flex-col items-center gap-2">
                  <CalendarDays className="w-8 h-8 opacity-40" />
                  Elige asignatura, grado y salón para ver la asistencia.
                </p>
              ) : (
                <MatrizCurso
                  asignatura={asignatura} grado={grado} salon={salon}
                  desde={desde} hasta={hasta} rangoLabel={rangoLabel}
                  puedeEditar={puedeEditar}
                  onAbrirCalendario={(e) => setCal({ estudiante: e, asignatura, grado, salon })}
                />
              )}
            </>
          )}

          {/* ═══════════ ESTUDIANTE / ACUDIENTE ═══════════ */}
          {!esInterno && (
            <>
              {/* Acudiente con varios acudidos: selector */}
              {rolAcudiente && acudidos.length > 1 && (
                <div className="flex flex-wrap gap-2 justify-center mb-4">
                  {acudidos.map((h) => (
                    <button key={h.id} onClick={() => setAcudidoSel(h)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border ${acudidoSel?.id === h.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground hover:bg-muted"}`}>
                      {h.nombre} {h.apellidos}
                    </button>
                  ))}
                </div>
              )}

              {!sujeto?.id ? (
                <p className="text-center text-muted-foreground py-8">Selecciona un estudiante.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-5 text-center">
                    Asistencia de {sujeto.nombres} {sujeto.apellidos} — toca una asignatura para ver el calendario.
                  </p>
                  {cargandoMios ? (
                    <p className="text-center text-muted-foreground py-8">Cargando…</p>
                  ) : resumenPorAsignatura.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Aún no hay registros de asistencia.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {resumenPorAsignatura.map((a) => (
                        <button key={a.asignatura}
                          onClick={() => setCal({ estudiante: { estudiante_id: sujeto.id, nombres: sujeto.nombres, apellidos: sujeto.apellidos, avatar_url: sujeto.avatar_url }, asignatura: a.asignatura, grado: sujeto.grado, salon: sujeto.salon })}
                          className="bg-card rounded-lg shadow-sm border border-border px-4 py-3 flex items-center justify-between hover:shadow-md transition text-left">
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">{a.asignatura}</p>
                            <p className="text-xs text-muted-foreground">
                              <span className="text-emerald-600">{a.p} P</span> · <span className="text-rose-600">{a.a} A</span> · <span className="text-amber-600">{a.e} E</span>
                            </p>
                          </div>
                          <span className={`text-lg font-bold ${a.pct >= 80 ? "text-emerald-600" : a.pct >= 60 ? "text-amber-600" : "text-rose-600"}`}>{a.pct}%</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* Modal calendario por estudiante */}
      {cal && (
        <CalendarioEstudiante
          estudiante={cal.estudiante}
          contextoLabel={`${cal.asignatura} · ${cal.grado} ${cal.salon}`.trim()}
          puedeEditar={esInterno && puedeEditar}
          loadMonth={esInterno ? loadMonthInterno(cal.asignatura, cal.grado, cal.salon) : loadMonthSujeto(cal.asignatura, cal.estudiante.estudiante_id)}
          onMarcar={esInterno && puedeEditar
            ? (fecha, estado) => onMarcarCal(cal.asignatura, cal.grado, cal.salon)(cal.estudiante.estudiante_id, fecha, estado)
            : undefined}
          onClose={() => setCal(null)}
        />
      )}
    </div>
  );
};

export default ConsultaAsistencia;
