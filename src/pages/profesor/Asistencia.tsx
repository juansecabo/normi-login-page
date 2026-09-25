import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, isProfesor, isAdmin } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { apiClient, type AsistenciaRosterItem, type AsistenciaEstado } from "@/lib/apiClient";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import { useToast } from "@/hooks/use-toast";
import { useEstructuraOrden } from "@/utils/estructuraOrden";

import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import AsistenciaLista from "@/components/AsistenciaLista";
// Asistencia en lista: piloto en el colegio demo Cailico (Juan 2026-09-25).
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

const Asistencia = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  const orden = useEstructuraOrden();

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
    return [...new Set(todos)].sort((a, b) => orden.gradoRank(a) - orden.gradoRank(b));
  }, [asignatura, asignaciones, orden.gradoRank]);

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

  const iniciar = (clase?: { asignatura: string; grado: string; salon: string; fecha: string }) =>
    iniciarClase(clase ?? { asignatura, grado, salon, fecha });
  const iniciarClase = async ({ asignatura, grado, salon, fecha }: { asignatura: string; grado: string; salon: string; fecha: string }) => {
    if (!asignatura || !grado || !salon) {
      toast({ title: "Faltan datos", description: "Elige asignatura, grado y salón.", variant: "destructive" });
      return;
    }
    setCargandoRoster(true);
    try {
      const res = await apiClient.asistencia.roster(asignatura, grado, salon, fecha);
      if (!res.roster.length) {
        toast({ title: "Sin estudiantes", description: "Ese salón no tiene estudiantes registrados.", variant: "destructive" });
        setParams({}, { replace: true });
        return;
      }
      setRoster(res.roster);
      setStep("deck");
      // La clase queda en el enlace, así al actualizar vuelve a la misma lista.
      setParams({ asignatura, grado, salon, fecha }, { replace: true });
    } catch {
      toast({ title: "Error", description: "No se pudo cargar la lista.", variant: "destructive" });
      setParams({}, { replace: true }); // sin enlace, vuelve el formulario para elegir la clase
    } finally {
      setCargandoRoster(false);
    }
  };

  // Si el enlace trae la clase (p. ej. al actualizar), se abre directo.
  useEffect(() => {
    if (loading) return;
    const clase = { asignatura: params.get("asignatura") || "", grado: params.get("grado") || "", salon: params.get("salon") || "", fecha: params.get("fecha") || hoyBogota() };
    if (!clase.asignatura || !clase.grado || !clase.salon) return;
    setAsignatura(clase.asignatura); setGrado(clase.grado); setSalon(clase.salon); setFecha(clase.fecha);
    iniciar(clase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Marca a un estudiante (optimista); si falla, vuelve a su marca anterior.
  const marcarLista = (est: AsistenciaRosterItem, estado: AsistenciaEstado) => {
    setRoster((prev) => prev.map((x) => (x.estudiante_id === est.estudiante_id ? { ...x, estado } : x)));
    return apiClient.asistencia
      .marcar({ asignatura, grado, salon, fecha, estudiante_id: est.estudiante_id, estado })
      .then((r) => {
        setRoster((prev) => prev.map((x) => (x.estudiante_id === est.estudiante_id ? { ...x, estado: r.estado } : x)));
      })
      .catch(() => {
        toast({ title: "No se guardó", description: `Falló al guardar la marca de ${est.nombres}. Reintenta.`, variant: "destructive" });
        setRoster((prev) => prev.map((x) => (x.estudiante_id === est.estudiante_id ? { ...x, estado: est.estado } : x)));
      });
  };
  // "Marcar todos como presentes": una sola petición, el servidor guarda todos o ninguno.
  const marcarTodosLista = async () => {
    try {
      const { marcas } = await apiClient.asistencia.marcarTodos({ asignatura, grado, salon, fecha });
      const m = new Map(marcas.map((x) => [x.estudiante_id, x.estado]));
      setRoster((prev) => prev.map((x) => (m.has(x.estudiante_id) ? { ...x, estado: m.get(x.estudiante_id)! } : x)));
    } catch {
      toast({ title: "No se guardó", description: "No se pudo marcar a todos como presentes. Reintenta.", variant: "destructive" });
    }
  };
  // Si el enlace ya trae la clase (p. ej. al actualizar), no se muestra el formulario mientras carga.
  const abriendoDesdeEnlace = step === "select" && !!params.get("asignatura") && !!params.get("grado") && !!params.get("salon");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />
      <main className="flex-1 container mx-auto p-6 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/profesor/asistencia")} className="text-primary hover:underline">Asistencia</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Tomar asistencia</span>
          </BreadcrumbDeslizable>
        </div>

        {abriendoDesdeEnlace && (
          <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-xl mx-auto mt-4 text-center text-muted-foreground">Cargando la lista…</div>
        )}

        {step === "select" && !abriendoDesdeEnlace && (
          <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-xl mx-auto mt-4">
            <h2 className="text-xl font-bold text-foreground mb-1 text-center">Tomar asistencia</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center">Elige la clase y el día.</p>

            {loading ? (
              <p className="text-center text-muted-foreground">Cargando tus asignaciones…</p>
            ) : (
              <div className="space-y-4">
                <Selector label="Asignatura" dataGuia="asistencia.selector_asignatura" value={asignatura} onChange={(v) => { setAsignatura(v); setGrado(""); setSalon(""); }} options={asignaturas} placeholder="Selecciona asignatura" />
                <Selector label="Grado" dataGuia="asistencia.selector_grado" value={grado} onChange={(v) => { setGrado(v); setSalon(""); }} options={grados} placeholder="Selecciona grado" disabled={!asignatura} />
                <Selector label="Salón" dataGuia="asistencia.selector_salon" value={salon} onChange={setSalon} options={salones} placeholder="Selecciona salón" disabled={!grado} />
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Fecha</label>
                  <input data-guia="asistencia.input_fecha" type="date" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground" />
                </div>
                <button data-guia="asistencia.boton_comenzar" onClick={() => iniciar()} disabled={!asignatura || !grado || !salon || cargandoRoster}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50 hover:opacity-90 transition">
                  {cargandoRoster ? "Cargando…" : "Comenzar"}
                </button>
              </div>
            )}
          </div>
        )}

        {step === "deck" && (
          <AsistenciaLista
            roster={roster}
            asignatura={asignatura}
            grado={grado}
            salon={salon}
            fechaTexto={fechaLarga(fecha)}
            onMarcar={marcarLista}
            onMarcarTodos={marcarTodosLista}
            onCambiarClase={() => { setStep("select"); setParams({}, { replace: true }); }}
            onTerminar={() => navigate("/dashboard")}
          />
        )}

      </main>
    </div>
  );
};

const Selector = ({ label, value, onChange, options, placeholder, disabled, dataGuia }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean; dataGuia?: string;
}) => (
  <div>
    <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
    <select data-guia={dataGuia} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground disabled:opacity-50">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

/** Tarjeta de un estudiante. `intencion` tiñe el overlay según hacia dónde se arrastra. */
export default Asistencia;
