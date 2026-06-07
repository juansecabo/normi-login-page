import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isProfesor, isAdmin } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { apiClient, type AsistenciaRosterItem, type AsistenciaEstado } from "@/lib/apiClient";
import HeaderNormi from "@/components/HeaderNormi";
import EncabezadoColegio from "@/components/EncabezadoColegio";
import { useToast } from "@/hooks/use-toast";
import { rankGrado } from "@/utils/grados";
import { Check, X, FileText, ArrowLeft } from "lucide-react";

interface AsignacionRow {
  "Asignatura(s)": string[] | string[][];
  "Grado(s)": string[] | string[][];
  "Salon(es)": string[] | string[][];
}

const hoyBogota = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const fechaLarga = (iso: string): string => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
};

// Colores por estado: verde=asistió, rojo=ausente, amarillo=excusa.
const ESTADO_UI: Record<AsistenciaEstado, { label: string; color: string; ring: string; text: string }> = {
  presente: { label: "Presente", color: "bg-emerald-500", ring: "ring-emerald-400", text: "text-emerald-600" },
  ausente: { label: "Ausente", color: "bg-rose-500", ring: "ring-rose-400", text: "text-rose-600" },
  excusa: { label: "Con excusa", color: "bg-amber-400", ring: "ring-amber-400", text: "text-amber-600" },
};

const THRESH = 90; // px para confirmar un swipe

const Asistencia = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [asignaciones, setAsignaciones] = useState<AsignacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [asignaturas, setAsignaturas] = useState<string[]>([]);

  const [asignatura, setAsignatura] = useState("");
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [fecha, setFecha] = useState(hoyBogota());

  const [step, setStep] = useState<"select" | "deck">("select");
  const [cargandoRoster, setCargandoRoster] = useState(false);
  const [roster, setRoster] = useState<AsistenciaRosterItem[]>([]);
  const [idx, setIdx] = useState(0);

  // Drag de la tarjeta superior + tarjeta "saliendo" (se va de verdad, no rebota).
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState<{ item: AsistenciaRosterItem; dir: AsistenciaEstado; fromX: number; fromY: number } | null>(null);
  const [leavingGo, setLeavingGo] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    if (!isProfesor() && !isAdmin()) { navigate("/dashboard"); return; }
    (async () => {
      try {
        const { data } = await supabase
          .from("Asignación Profesores")
          .select('"Asignatura(s)", "Grado(s)", "Salon(es)"')
          .eq("id", parseInt(session.id!));
        const rows = (data || []) as AsignacionRow[];
        setAsignaciones(rows);
        const todas = rows.flatMap((a) => (a["Asignatura(s)"] || []) as string[]).flat() as string[];
        setAsignaturas([...new Set(todas)].sort((a, b) => a.localeCompare(b, "es")));
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [navigate]);

  const grados = useMemo(() => {
    if (!asignatura) return [];
    const f = asignaciones.filter((a) => ((a["Asignatura(s)"] || []).flat() as string[]).includes(asignatura));
    const todos = f.flatMap((a) => (a["Grado(s)"] || []).flat() as string[]);
    return [...new Set(todos)].sort((a, b) => rankGrado(a) - rankGrado(b));
  }, [asignatura, asignaciones]);

  const salones = useMemo(() => {
    if (!asignatura || !grado) return [];
    const f = asignaciones.filter((a) => {
      const asigs = (a["Asignatura(s)"] || []).flat() as string[];
      const grads = (a["Grado(s)"] || []).flat() as string[];
      return asigs.includes(asignatura) && grads.includes(grado);
    });
    const todos = f.flatMap((a) => (a["Salon(es)"] || []).flat() as string[]);
    return [...new Set(todos)].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [asignatura, grado, asignaciones]);

  const iniciar = async () => {
    if (!asignatura || !grado || !salon) {
      toast({ title: "Faltan datos", description: "Elige asignatura, grado y salón.", variant: "destructive" });
      return;
    }
    setCargandoRoster(true);
    try {
      const res = await apiClient.asistencia.roster(asignatura, grado, salon, fecha);
      if (!res.roster.length) {
        toast({ title: "Sin estudiantes", description: "Ese salón no tiene estudiantes registrados.", variant: "destructive" });
        return;
      }
      setRoster(res.roster);
      // Continuar desde el primer estudiante aún SIN categorizar (no desde el inicio).
      const primerPendiente = res.roster.findIndex((r) => !r.estado);
      setIdx(primerPendiente === -1 ? res.roster.length : primerPendiente);
      setStep("deck");
    } catch {
      toast({ title: "Error", description: "No se pudo cargar la lista.", variant: "destructive" });
    } finally {
      setCargandoRoster(false);
    }
  };

  const actual = roster[idx];
  const conteo = useMemo(() => {
    const c = { presente: 0, ausente: 0, excusa: 0 };
    for (const r of roster) if (r.estado) c[r.estado]++;
    return c;
  }, [roster]);

  // Intención de swipe en vivo (para overlay de color).
  const intencion: AsistenciaEstado | null = useMemo(() => {
    if (!drag) return null;
    if (drag.y > THRESH && drag.y > Math.abs(drag.x)) return "excusa";
    if (drag.x > THRESH) return "presente";
    if (drag.x < -THRESH) return "ausente";
    return null;
  }, [drag]);

  const commit = (estado: AsistenciaEstado) => {
    if (!actual || leaving) return;
    const est = actual;
    // Guardar en el server (optimista). La respuesta puede convertirlo en excusa.
    apiClient.asistencia
      .marcar({ asignatura, grado, salon, fecha, estudiante_id: est.estudiante_id, estado })
      .then((r) => {
        setRoster((prev) => prev.map((x) => (x.estudiante_id === est.estudiante_id ? { ...x, estado: r.estado } : x)));
        if (r.auto_excusa) {
          toast({ title: "Excusa registrada", description: `${est.nombres} ya tenía una excusa vigente — se marcó como excusa.` });
        }
      })
      .catch(() => {
        toast({ title: "No se guardó", description: `Falló al guardar la marca de ${est.nombres}. Reintenta.`, variant: "destructive" });
        setRoster((prev) => prev.map((x) => (x.estudiante_id === est.estudiante_id ? { ...x, estado: null } : x)));
      });
    // La tarjeta sale como capa independiente y el mazo avanza al instante (la de
    // abajo queda mostrándose). NO rebota.
    setRoster((prev) => prev.map((x) => (x.estudiante_id === est.estudiante_id ? { ...x, estado } : x)));
    setLeaving({ item: est, dir: estado, fromX: drag?.x ?? 0, fromY: drag?.y ?? 0 });
    setIdx((i) => i + 1);
    setDrag(null);
    startRef.current = null;
  };

  // Anima la tarjeta saliente fuera de pantalla y luego la quita del DOM.
  useEffect(() => {
    if (!leaving) { setLeavingGo(false); return; }
    const raf = requestAnimationFrame(() => setLeavingGo(true));
    const t = window.setTimeout(() => setLeaving(null), 260);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [leaving]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (leaving) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y });
  };
  const onPointerUp = () => {
    if (!startRef.current) return;
    const d = drag;
    startRef.current = null;
    const est = d
      ? d.y > THRESH && d.y > Math.abs(d.x) ? "excusa"
        : d.x > THRESH ? "presente"
        : d.x < -THRESH ? "ausente"
        : null
      : null;
    if (est) commit(est as AsistenciaEstado);
    else setDrag(null);
  };

  // Estilo de la tarjeta superior: solo arrastre o regreso al centro si NO se
  // pasó el umbral. (Cuando sí se pasa, la salida la maneja la capa `leaving`.)
  const cardStyle = (): React.CSSProperties => {
    if (drag) {
      return { transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.04}deg)`, transition: startRef.current ? "none" : "transform .2s ease-out" };
    }
    return { transform: "translate(0,0)", transition: "transform .2s ease-out" };
  };

  // Estilo de la capa que sale: arranca donde quedó el dedo y vuela fuera.
  const leavingStyle = (): React.CSSProperties => {
    if (!leaving) return {};
    if (!leavingGo) {
      return { transform: `translate(${leaving.fromX}px, ${leaving.fromY}px) rotate(${leaving.fromX * 0.04}deg)`, transition: "none" };
    }
    const x = leaving.dir === "presente" ? 700 : leaving.dir === "ausente" ? -700 : 0;
    const y = leaving.dir === "excusa" ? 800 : 0;
    const rot = leaving.dir === "presente" ? 25 : leaving.dir === "ausente" ? -25 : 0;
    return { transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`, opacity: 0, transition: "transform .26s ease-out, opacity .26s ease-out" };
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />
      <main className="flex-1 container mx-auto p-6 md:p-8">
        <EncabezadoColegio />

        {step === "select" && (
          <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-xl mx-auto mt-4">
            <h2 className="text-2xl font-bold text-foreground mb-1 text-center">Tomar asistencia</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center">Elige la clase y el día. Luego deslizas a la derecha (presente), izquierda (ausente) o abajo (con excusa).</p>

            {loading ? (
              <p className="text-center text-muted-foreground">Cargando tus asignaciones…</p>
            ) : (
              <div className="space-y-4">
                <Selector label="Asignatura" value={asignatura} onChange={(v) => { setAsignatura(v); setGrado(""); setSalon(""); }} options={asignaturas} placeholder="Selecciona asignatura" />
                <Selector label="Grado" value={grado} onChange={(v) => { setGrado(v); setSalon(""); }} options={grados} placeholder="Selecciona grado" disabled={!asignatura} />
                <Selector label="Salón" value={salon} onChange={setSalon} options={salones} placeholder="Selecciona salón" disabled={!grado} />
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Fecha</label>
                  <input type="date" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground" />
                </div>
                <button onClick={iniciar} disabled={!asignatura || !grado || !salon || cargandoRoster}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50 hover:opacity-90 transition">
                  {cargandoRoster ? "Cargando…" : "Comenzar"}
                </button>
              </div>
            )}
          </div>
        )}

        {step === "deck" && (
          <div className="max-w-md mx-auto mt-4">
            {/* Encabezado de la clase */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setStep("select")} className="text-primary text-sm flex items-center gap-1 hover:underline">
                <ArrowLeft className="w-4 h-4" /> Cambiar clase
              </button>
              <span className="text-xs text-muted-foreground capitalize">{fechaLarga(fecha)}</span>
            </div>
            <div className="text-center mb-3">
              <p className="font-semibold text-foreground">{asignatura} · {grado} {salon}</p>
              <p className="text-xs text-muted-foreground">
                {Math.min(idx, roster.length)} de {roster.length} ·
                <span className="text-emerald-600"> {conteo.presente} presente</span> ·
                <span className="text-rose-600"> {conteo.ausente} ausente</span> ·
                <span className="text-amber-600"> {conteo.excusa} excusa</span>
              </p>
            </div>

            {idx >= roster.length ? (
              // Resumen final
              <div className="bg-card rounded-2xl shadow-soft p-8 text-center">
                <p className="text-lg font-bold text-foreground mb-2">¡Asistencia completa!</p>
                <p className="text-sm text-muted-foreground mb-4">Marcaste {roster.length} estudiantes de {grado} {salon}.</p>
                <div className="flex justify-center gap-4 text-sm mb-6">
                  <span className="text-emerald-600 font-semibold">{conteo.presente} presente</span>
                  <span className="text-rose-600 font-semibold">{conteo.ausente} ausente</span>
                  <span className="text-amber-600 font-semibold">{conteo.excusa} con excusa</span>
                </div>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => setIdx(0)} className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-muted">Revisar de nuevo</button>
                  <button onClick={() => navigate("/dashboard")} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">Terminar</button>
                </div>
              </div>
            ) : (
              <>
                {/* Mazo: tarjeta siguiente detrás + tarjeta actual arriba */}
                <div className="relative h-[460px] select-none" style={{ touchAction: "none" }}>
                  {roster[idx + 1] && <CardView item={roster[idx + 1]} behind />}
                  {actual && (
                    <div
                      key={actual.estudiante_id}
                      className="absolute inset-0 z-20"
                      style={cardStyle()}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                    >
                      <CardView item={actual} intencion={intencion} />
                    </div>
                  )}
                  {leaving && (
                    <div className="absolute inset-0 z-30 pointer-events-none" style={leavingStyle()}>
                      <CardView item={leaving.item} intencion={leaving.dir} />
                    </div>
                  )}
                </div>

                {/* Botones equivalentes */}
                <div className="flex items-center justify-center gap-6 mt-6">
                  <button onClick={() => commit("ausente")} title="Ausente"
                    className="w-16 h-16 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg hover:scale-105 transition">
                    <X className="w-8 h-8" />
                  </button>
                  <button onClick={() => commit("excusa")} title="Con excusa"
                    className="w-14 h-14 rounded-full bg-amber-400 text-white flex items-center justify-center shadow-lg hover:scale-105 transition">
                    <FileText className="w-6 h-6" />
                  </button>
                  <button onClick={() => commit("presente")} title="Presente"
                    className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg hover:scale-105 transition">
                    <Check className="w-8 h-8" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

const Selector = ({ label, value, onChange, options, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean;
}) => (
  <div>
    <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground disabled:opacity-50">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

/** Tarjeta de un estudiante. `intencion` tiñe el overlay según hacia dónde se arrastra. */
const CardView = ({ item, intencion, behind }: { item: AsistenciaRosterItem; intencion?: AsistenciaEstado | null; behind?: boolean }) => {
  const iniciales = `${item.nombres?.[0] || ""}${item.apellidos?.[0] || ""}`.toUpperCase();
  const ringColor = intencion ? ESTADO_UI[intencion].ring : "ring-emerald-300";
  return (
    <div className={`absolute inset-0 rounded-3xl overflow-hidden flex flex-col items-center justify-center p-6 shadow-xl border border-emerald-200 bg-emerald-100 ${behind ? "scale-95 opacity-50" : ""}`}>
      {/* Banner de excusa vigente */}
      {item.tiene_excusa && (
        <div className="absolute top-0 inset-x-0 bg-amber-400 text-amber-950 text-center text-sm font-bold py-2 shadow z-10">
          Con Excusa{item.excusa_motivo ? ` · ${item.excusa_motivo}` : ""}
        </div>
      )}

      {/* Foto (la que el estudiante sube en su dashboard) */}
      {/* Óvalo de carnet (ratio 110/140), igual que el avatar del dashboard. */}
      <div className={`mt-3 w-40 h-[203px] rounded-[50%] overflow-hidden ring-4 ${ringColor} bg-white flex items-center justify-center shadow-lg`}>
        {item.avatar_url
          ? <img src={item.avatar_url} alt="" className="w-full h-full object-cover" draggable={false} />
          : <span className="text-5xl font-bold text-emerald-600">{iniciales || "?"}</span>}
      </div>

      <p className="mt-6 px-3 text-2xl font-bold text-emerald-950 text-center leading-tight">{item.apellidos} {item.nombres}</p>
      <p className="text-sm text-emerald-700/70 mt-1">CC {item.estudiante_id}</p>

      {/* Estado ya marcado */}
      {item.estado && !intencion && (
        <span className={`mt-4 px-4 py-1.5 rounded-full text-white text-sm font-semibold shadow ${ESTADO_UI[item.estado].color}`}>
          {ESTADO_UI[item.estado].label}
        </span>
      )}

      {/* Overlay de intención al arrastrar */}
      {intencion && (
        <div className={`absolute inset-0 flex items-center justify-center ${ESTADO_UI[intencion].color} bg-opacity-30`}>
          <span className="px-6 py-3 rounded-xl border-4 border-white text-white text-3xl font-extrabold rotate-[-8deg] uppercase tracking-wider drop-shadow-lg">
            {ESTADO_UI[intencion].label}
          </span>
        </div>
      )}
    </div>
  );
};

export default Asistencia;
