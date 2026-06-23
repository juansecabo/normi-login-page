import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import { apiClient, type ApiConsolidadoGrupo } from "@/lib/apiClient";
import { useColegioConfig } from "@/hooks/useColegioConfig";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import { Users } from "lucide-react";

const PERIODOS = [1, 2, 3, 4] as const;
const ORDINAL: Record<number, string> = { 1: "Primer", 2: "Segundo", 3: "Tercer", 4: "Cuarto" };

/**
 * "Consolidado de mi grupo": el director de grupo elige un periodo y ve UNA sola
 * rejilla (tipo Excel) — filas = estudiantes (orden alfabético), columnas =
 * asignaturas (orden alfabético), celda = definitiva del periodo. Si el periodo
 * de una asignatura no está cerrado, debajo del nombre dice "(provisional)".
 * El cálculo lo hace el server (/api/consolidado-grupo) reusando el mismo motor
 * de notas; el grupo se resuelve por Internos.direccion_de_grupo.
 */
const ConsolidadoGrupo = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { config } = useColegioConfig();
  const [dirGrupo, setDirGrupo] = useState<string | null>(null);
  const [grado, setGrado] = useState<string | null>(null);
  const [salon, setSalon] = useState<string | null>(null);
  const [loadingDg, setLoadingDg] = useState(true);

  // El periodo vive en la URL (?periodo=2) para que recargar (F5) mantenga la rejilla.
  const periodoRaw = parseInt(searchParams.get("periodo") || "", 10);
  const periodo: number | null = [1, 2, 3, 4].includes(periodoRaw) ? periodoRaw : null;
  const setPeriodo = (p: number | null) => {
    if (p == null) { searchParams.delete("periodo"); setSearchParams(searchParams, { replace: true }); }
    else { searchParams.set("periodo", String(p)); setSearchParams(searchParams, { replace: true }); }
  };
  const [data, setData] = useState<ApiConsolidadoGrupo | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    (async () => {
      setLoadingDg(true);
      const { data: interno } = await supabase
        .from("Internos").select("direccion_de_grupo")
        .eq("id", parseInt(session.id!)).maybeSingle();
      const dg = ((interno as { direccion_de_grupo?: string } | null)?.direccion_de_grupo || "").trim() || null;
      setDirGrupo(dg);
      if (dg) {
        const parts = dg.split(/\s+/);
        const last = parts[parts.length - 1];
        if (parts.length > 1 && /^\d+$/.test(last)) {
          setGrado(parts.slice(0, -1).join(" ")); setSalon(last);
        } else { setGrado(dg); setSalon(null); }
      }
      setLoadingDg(false);
    })();
  }, [navigate]);

  useEffect(() => {
    if (periodo == null || !grado || !salon) return;
    let cancel = false;
    setLoadingData(true); setError(null); setData(null);
    apiClient.estadisticas.consolidadoGrupo(grado, salon, periodo)
      .then((d) => { if (!cancel) setData(d); })
      .catch((e) => { if (!cancel) setError(e?.message || "No se pudo cargar el consolidado."); })
      .finally(() => { if (!cancel) setLoadingData(false); });
    return () => { cancel = true; };
  }, [periodo, grado, salon]);

  const fmt = (n: number | undefined) =>
    n == null ? "—" : n.toFixed(config.decimales);
  const aprobada = (n: number | undefined) =>
    n != null && n >= config.nota_aprobatoria;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/direccion-grupo")} className="text-primary hover:underline">Dirección de grupo</button>
            <span className="text-muted-foreground">&rarr;</span>
            {periodo == null ? (
              <span className="text-foreground font-medium">Consolidado de mi grupo</span>
            ) : (
              <>
                <button onClick={() => setPeriodo(null)} className="text-primary hover:underline">Consolidado de mi grupo</button>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="text-foreground font-medium">{ORDINAL[periodo]} periodo</span>
              </>
            )}
          </div>
        </div>

        {loadingDg ? (
          <p className="text-center text-muted-foreground py-10">Cargando…</p>
        ) : !dirGrupo ? (
          <div className="text-center text-muted-foreground py-10 flex flex-col items-center gap-2">
            <Users className="w-8 h-8 opacity-40" />
            No eres director de grupo de ningún salón.
          </div>
        ) : periodo == null ? (
          /* ── Selector de periodo ─────────────────────────────── */
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-foreground mb-1 text-center">Consolidado de mi grupo</h2>
            <p className="text-sm text-muted-foreground mb-1 text-center">
              <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                <Users className="w-4 h-4" /> {dirGrupo}
              </span>
            </p>
            <p className="text-sm text-muted-foreground mb-6 text-center">Elige un periodo para ver las definitivas de tus estudiantes.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {PERIODOS.map((p) => (
                <button key={p} onClick={() => setPeriodo(p)}
                  className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-border bg-card transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/5">
                  <span className="text-3xl font-bold text-primary">{p}º</span>
                  <span className="text-sm font-medium text-foreground">{ORDINAL[p]} periodo</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Rejilla del periodo ─────────────────────────────── */
          <div>
            <h2 className="text-xl font-bold text-foreground mb-4 text-center">
              {ORDINAL[periodo]} periodo · {dirGrupo}
            </h2>

            {loadingData ? (
              <p className="text-center text-muted-foreground py-10">Cargando notas…</p>
            ) : error ? (
              <p className="text-center text-destructive py-10">{error}</p>
            ) : !data || data.estudiantes.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No hay estudiantes en este grupo.</p>
            ) : data.asignaturas.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No hay notas registradas en este periodo.</p>
            ) : (
              <div className="max-h-[72vh] overflow-auto rounded-lg border border-border shadow-soft">
                <table className="border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-30 bg-muted border-r border-b border-border px-3 py-2 text-left font-semibold text-foreground min-w-[200px]">
                        Estudiante
                      </th>
                      {data.asignaturas.map((a) => (
                        <th key={a.nombre} className="sticky top-0 z-20 bg-muted border-r border-b border-border px-2 py-2 text-center font-semibold text-foreground align-bottom min-w-[90px] max-w-[120px]">
                          <div className="leading-tight break-words">{a.nombre}</div>
                          {!a.completo && (
                            <div className="text-[10px] font-normal italic text-amber-600 mt-0.5">(provisional)</div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.estudiantes.map((e, i) => {
                      const rowBg = i % 2 ? "bg-card" : "bg-muted/40";
                      return (
                        <tr key={e.id} className={rowBg}>
                          <td className="sticky left-0 z-10 bg-card border-r border-b border-border px-3 py-2 font-medium text-foreground whitespace-nowrap">
                            {e.nombre}
                          </td>
                          {data.asignaturas.map((a) => {
                            const n = e.notas[a.nombre];
                            return (
                              <td key={a.nombre}
                                className={`border-r border-b border-border px-2 py-2 text-center tabular-nums font-semibold ${
                                  n == null ? "text-muted-foreground" : aprobada(n) ? "text-emerald-700" : "text-red-600"
                                }`}>
                                {fmt(n)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ConsolidadoGrupo;
