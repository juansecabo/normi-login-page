import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isEstudiante, isPadreDeFamilia } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import HeaderNormi from "@/components/HeaderNormi";
import EncabezadoColegio from "@/components/EncabezadoColegio";
import { rankGrado } from "@/utils/grados";

type Estado = "presente" | "ausente" | "excusa";

const ESTADO: Record<Estado, { label: string; cls: string; dot: string }> = {
  presente: { label: "Presente", cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  ausente: { label: "Ausente", cls: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  excusa: { label: "Con excusa", cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
};

const hoyBogota = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const fechaLarga = (iso: string): string => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
};

interface Registro {
  estudiante_id: string;
  asignatura: string;
  estado: Estado;
  fecha: string;
  nombre?: string;
}

const Chip = ({ estado }: { estado: Estado }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO[estado].cls}`}>
    <span className={`w-2 h-2 rounded-full ${ESTADO[estado].dot}`} /> {ESTADO[estado].label}
  </span>
);

const ConsultaAsistencia = () => {
  const navigate = useNavigate();
  const rolEstudiante = isEstudiante();
  const rolAcudiente = isPadreDeFamilia();
  const esInterno = !rolEstudiante && !rolAcudiente;

  const [loading, setLoading] = useState(false);
  const [registros, setRegistros] = useState<Registro[]>([]);

  // ── Filtros para internos ────────────────────────────────────────────────
  const [aulas, setAulas] = useState<{ grado: string; salon: string }[]>([]);
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [fecha, setFecha] = useState(hoyBogota());
  const [consultado, setConsultado] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
  }, [navigate]);

  // Internos: cargar aulas (grado/salón) del colegio.
  useEffect(() => {
    if (!esInterno) return;
    (async () => {
      try {
        const { data } = await supabase.from("Estudiantes").select("grado, salon");
        const pares = new Map<string, { grado: string; salon: string }>();
        for (const r of (data || []) as { grado: string; salon: string }[]) {
          if (r.grado && r.salon) pares.set(`${r.grado}|${r.salon}`, { grado: r.grado, salon: r.salon });
        }
        setAulas([...pares.values()]);
      } catch { /* ignore */ }
    })();
  }, [esInterno]);

  // Estudiante / Acudiente: cargar su historial al entrar (el blindaje del
  // proxy limita a lo propio / a los acudidos).
  useEffect(() => {
    if (esInterno) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("Asistencia")
          .select("estudiante_id, asignatura, estado, fecha")
          .order("fecha", { ascending: false });
        const regs = (data || []) as Registro[];
        // Para acudiente con varios acudidos, anexar el nombre desde la sesión.
        const acudidos = getSession().acudidos || [];
        const nombreById = new Map(acudidos.map((h) => [String(h.id), `${h.nombre} ${h.apellidos}`.trim()]));
        setRegistros(regs.map((r) => ({ ...r, nombre: nombreById.get(String(r.estudiante_id)) })));
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [esInterno]);

  const grados = useMemo(
    () => [...new Set(aulas.map((a) => a.grado))].sort((a, b) => rankGrado(a) - rankGrado(b)),
    [aulas],
  );
  const salones = useMemo(
    () => [...new Set(aulas.filter((a) => a.grado === grado).map((a) => a.salon))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    [aulas, grado],
  );

  const verClase = async () => {
    if (!grado || !salon) return;
    setLoading(true);
    setConsultado(true);
    try {
      const { data } = await supabase
        .from("Asistencia")
        .select("estudiante_id, asignatura, estado, fecha")
        .eq("grado", grado).eq("salon", salon).eq("fecha", fecha);
      const regs = (data || []) as Registro[];
      const ids = [...new Set(regs.map((r) => String(r.estudiante_id)))];
      let nombreById = new Map<string, string>();
      if (ids.length) {
        const { data: usrs } = await supabase.from("Usuarios").select("id, nombres, apellidos").in("id", ids);
        nombreById = new Map((usrs || []).map((u: any) => [String(u.id), `${u.apellidos || ""} ${u.nombres || ""}`.trim()]));
      }
      const conNombre = regs
        .map((r) => ({ ...r, nombre: nombreById.get(String(r.estudiante_id)) || `CC ${r.estudiante_id}` }))
        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es") || a.asignatura.localeCompare(b.asignatura, "es"));
      setRegistros(conNombre);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // Agrupar el historial (estudiante/acudiente) por fecha.
  const porFecha = useMemo(() => {
    const m = new Map<string, Registro[]>();
    for (const r of registros) {
      if (!m.has(r.fecha)) m.set(r.fecha, []);
      m.get(r.fecha)!.push(r);
    }
    return [...m.entries()];
  }, [registros]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/" />
      <main className="flex-1 container mx-auto p-6 md:p-8">
        <EncabezadoColegio />
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-1 text-center">Asistencia</h2>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            {esInterno ? "Consulta la asistencia por grado, salón y día." : "Historial de asistencia."}
          </p>

          {/* ── Vista internos: filtros + lista de la clase ── */}
          {esInterno && (
            <>
              <div className="bg-card rounded-lg shadow-soft p-5 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select value={grado} onChange={(e) => { setGrado(e.target.value); setSalon(""); }}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-foreground">
                  <option value="">Grado</option>
                  {grados.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={salon} onChange={(e) => setSalon(e.target.value)} disabled={!grado}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-foreground disabled:opacity-50">
                  <option value="">Salón</option>
                  {salones.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="date" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-foreground" />
                <button onClick={verClase} disabled={!grado || !salon || loading}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50 hover:opacity-90">
                  {loading ? "…" : "Ver"}
                </button>
              </div>

              {consultado && !loading && registros.length === 0 && (
                <p className="text-center text-muted-foreground">No hay registros de asistencia para ese día.</p>
              )}
              {registros.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-1 capitalize">{fechaLarga(fecha)} · {grado} {salon}</p>
                  {registros.map((r, i) => (
                    <div key={i} className="bg-card rounded-lg shadow-sm border border-border px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{r.nombre}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.asignatura}</p>
                      </div>
                      <Chip estado={r.estado} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Vista estudiante / acudiente: historial por fecha ── */}
          {!esInterno && (
            loading ? (
              <p className="text-center text-muted-foreground">Cargando…</p>
            ) : registros.length === 0 ? (
              <p className="text-center text-muted-foreground">Aún no tienes registros de asistencia.</p>
            ) : (
              <div className="space-y-5">
                {porFecha.map(([f, regs]) => (
                  <div key={f}>
                    <p className="text-sm font-semibold text-foreground mb-2 capitalize">{fechaLarga(f)}</p>
                    <div className="space-y-2">
                      {regs.map((r, i) => (
                        <div key={i} className="bg-card rounded-lg shadow-sm border border-border px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">{r.asignatura}</p>
                            {rolAcudiente && r.nombre && <p className="text-xs text-muted-foreground truncate">{r.nombre}</p>}
                          </div>
                          <Chip estado={r.estado} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
};

export default ConsultaAsistencia;
