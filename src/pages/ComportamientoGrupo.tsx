import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "@/lib/apiClient";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { Check, Loader2, Search, X } from "lucide-react";
import { coincideBusqueda } from "@/utils/busqueda";

/**
 * "Comportamiento y disciplina" (Diana, Pestalozziano, 2026-09-30): el director de
 * grupo escribe, por estudiante y periodo, el texto que sale en el boletín bajo las
 * asignaturas. Cada línea es una viñeta. Se guarda solo mientras escribe (un momento
 * después de dejar de teclear) y al salir del cuadro; avisa si se sale con algo sin guardar.
 */
interface EstComp { id: string; nombre: string; salon: string; texto: string }
interface Respuesta { grupo: string; periodo: number; cortes: number; esquema: string; estudiantes: EstComp[]; textos: Record<number, Record<string, string>> }
type Estado = "guardando" | "guardado" | "error";

const ComportamientoGrupo = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  // El periodo va en la barra de direcciones (?periodo=N): al actualizar se queda en el mismo.
  const periodoUrl = parseInt(params.get("periodo") || "", 10);
  const periodo = datos ? (periodoUrl >= 1 && periodoUrl <= datos.cortes ? periodoUrl : datos.periodo) : null;
  const setPeriodo = (p: number) => setParams({ periodo: String(p) }, { replace: true });
  // Por periodo → por estudiante. Se cargan todos de una vez: cambiar de pestaña no espera.
  const [textosP, setTextosP] = useState<Record<number, Record<string, string>>>({});
  const [guardadosP, setGuardadosP] = useState<Record<number, Record<string, string>>>({});
  const [estadoP, setEstadoP] = useState<Record<number, Record<string, Estado>>>({});
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    setError("");
    try {
      const r = await apiRequest<Respuesta>("/api/boletines/comportamiento");
      setDatos(r);
      setTextosP(r.textos || {});
      setGuardadosP(r.textos || {});
    } catch (e: any) {
      setError(e?.body?.detail || e?.message || "No se pudo cargar tu grupo.");
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const textos = (periodo != null && textosP[periodo]) || {};
  const guardados = (periodo != null && guardadosP[periodo]) || {};
  const estado = (periodo != null && estadoP[periodo]) || {};
  const ponEstado = (p: number, id: string, e: Estado) => setEstadoP((s) => ({ ...s, [p]: { ...(s[p] || {}), [id]: e } }));

  // Último texto escrito y último guardado, en refs para que el guardado diferido y el
  // aviso al salir vean siempre lo más reciente.
  const escritoRef = useRef<Record<string, string>>({});
  const guardadoRef = useRef<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const enCurso = useRef<Set<string>>(new Set()); // un solo guardado a la vez por cuadro
  const clave = (p: number, id: string) => `${p}|${id}`;

  useEffect(() => {
    for (const [p, porEst] of Object.entries(guardadosP)) for (const [id, t] of Object.entries(porEst)) {
      guardadoRef.current[clave(Number(p), id)] = t;
      if (escritoRef.current[clave(Number(p), id)] === undefined) escritoRef.current[clave(Number(p), id)] = t;
    }
  }, [guardadosP]);

  const guardar = async (p: number, id: string) => {
    const k = clave(p, id);
    clearTimeout(timers.current[k]);
    const texto = escritoRef.current[k] ?? "";
    if (texto === (guardadoRef.current[k] ?? "")) return;
    if (enCurso.current.has(k)) return; // al terminar el que va, se revisa si quedó algo nuevo
    enCurso.current.add(k);
    ponEstado(p, id, "guardando");
    try {
      await apiRequest("/api/boletines/comportamiento", { method: "PUT", body: JSON.stringify({ periodo: p, id_estudiantil: id, texto }) });
      guardadoRef.current[k] = texto;
      setGuardadosP((g) => ({ ...g, [p]: { ...(g[p] || {}), [id]: texto } }));
      // Si siguió escribiendo mientras se guardaba, queda pendiente otra vuelta.
      enCurso.current.delete(k);
      ponEstado(p, id, (escritoRef.current[k] ?? "") === texto ? "guardado" : "guardando");
      if ((escritoRef.current[k] ?? "") !== texto) guardar(p, id);
    } catch {
      enCurso.current.delete(k);
      ponEstado(p, id, "error");
    }
  };

  const escribir = (p: number, id: string, v: string) => {
    const k = clave(p, id);
    escritoRef.current[k] = v;
    setTextosP((t) => ({ ...t, [p]: { ...(t[p] || {}), [id]: v } }));
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => guardar(p, id), 800);
  };

  // Aviso del navegador si intenta cerrar o actualizar con algo sin guardar.
  useEffect(() => {
    const antes = (e: BeforeUnloadEvent) => {
      const pendiente = Object.keys(escritoRef.current).some((k) => (escritoRef.current[k] ?? "") !== (guardadoRef.current[k] ?? ""));
      if (pendiente) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, []);

  const unidad = datos?.esquema === "semestres" ? "Semestre" : "Periodo";
  const lista = (datos?.estudiantes || []).filter((e) => coincideBusqueda(busqueda, e.nombre, e.id));
  const llenos = (datos?.estudiantes || []).filter((e) => (guardados[e.id] || "").trim()).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/direccion-grupo")} className="text-primary hover:underline">Dirección de grupo</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Comportamiento y disciplina</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="max-w-4xl mx-auto bg-card rounded-lg shadow-soft p-6" data-guia="comportamiento.pantalla">
          <h2 className="text-xl font-bold text-foreground mb-1 text-center">Comportamiento y disciplina</h2>
          {datos && <p className="text-sm text-muted-foreground text-center mb-5">{datos.grupo} · Sale en el boletín. Cada línea es una viñeta.</p>}

          {error && <p className="text-center text-destructive py-8">{error}</p>}
          {!datos && !error && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>}

          {datos && (
            <>
              <div className="flex flex-wrap items-center justify-center gap-2 mb-4" data-guia="comportamiento.periodo">
                {Array.from({ length: datos.cortes }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setPeriodo(p)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${periodo === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
                    {unidad} {p}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar estudiante…"
                    className="w-full pl-9 pr-8 py-2 border border-input rounded-md text-sm bg-background" />
                  {busqueda && (
                    <button type="button" onClick={() => setBusqueda("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Borrar búsqueda"><X className="w-4 h-4" /></button>
                  )}
                </div>
                <span className="text-sm text-muted-foreground text-center">{llenos} de {datos.estudiantes.length} con texto</span>
              </div>

              <div className="space-y-3">
                {lista.map((e) => (
                  <div key={e.id} className="border border-border rounded-lg p-3" data-guia="comportamiento.estudiante">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-sm text-foreground">{e.nombre}</span>
                      <span className="text-xs shrink-0">
                        {estado[e.id] === "guardando" && <span className="text-muted-foreground inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Guardando…</span>}
                        {estado[e.id] === "guardado" && <span className="text-green-700 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Guardado</span>}
                        {estado[e.id] === "error" && <span className="text-destructive">No se guardó</span>}
                      </span>
                    </div>
                    <textarea value={textos[e.id] || ""} onChange={(ev) => escribir(periodo!, e.id, ev.target.value)} onBlur={() => guardar(periodo!, e.id)}
                      placeholder="Ej: El estudiante evidencia un comportamiento positivo…"
                      className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[70px] resize-y" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ComportamientoGrupo;
