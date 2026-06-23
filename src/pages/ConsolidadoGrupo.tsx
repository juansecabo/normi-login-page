import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import ConsolidadoNotas from "@/components/ConsolidadoNotas";
import ConsolidadoNotasPreescolar from "@/components/ConsolidadoNotasPreescolar";
import { Search, Users, ChevronLeft } from "lucide-react";

type Est = { id: string; grado: string; salon: string | null; nombres: string; apellidos: string };

const GRADOS_PREESCOLAR = new Set(["Párvulo", "Prejardín", "Jardín", "Transición"]);

/**
 * "Consolidado de mi grupo": el director de grupo ve, en solo lectura, las notas
 * de todos los estudiantes de su grupo (todas las asignaturas). Reusa el mismo
 * consolidado que ven estudiantes/acudientes. Los alumnos se cargan por
 * Internos.direccion_de_grupo (no por asignación de clase).
 */
const ConsolidadoGrupo = () => {
  const navigate = useNavigate();
  const [dirGrupo, setDirGrupo] = useState<string | null>(null);
  const [ests, setEsts] = useState<Est[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [sel, setSel] = useState<Est | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }

    const cargar = async () => {
      setLoading(true);
      const { data: interno } = await supabase
        .from("Internos")
        .select("direccion_de_grupo")
        .eq("id", parseInt(session.id!))
        .maybeSingle();
      const dg = ((interno as { direccion_de_grupo?: string } | null)?.direccion_de_grupo || "").trim() || null;
      setDirGrupo(dg);
      if (!dg) { setEsts([]); setLoading(false); return; }

      const parts = dg.split(/\s+/);
      const last = parts[parts.length - 1];
      let grado = dg;
      let salon: string | null = null;
      if (parts.length > 1 && /^\d+$/.test(last)) { grado = parts.slice(0, -1).join(" "); salon = last; }

      let q = supabase.from("Estudiantes").select("id, grado, salon").eq("grado", grado);
      if (salon) q = q.eq("salon", salon);
      const { data } = await q;
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const enriched = sortByApellidosNombres(await enrichWithNombres((data || []) as Array<{ id: string | number }>));
      setEsts(enriched.map((e: any) => ({
        id: String(e.id),
        grado: e.grado,
        salon: e.salon ?? null,
        nombres: e.nombres || "",
        apellidos: e.apellidos || "",
      })));
      setLoading(false);
    };
    cargar();
  }, [navigate]);

  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return ests;
    return ests.filter((e) => `${e.apellidos} ${e.nombres}`.toLowerCase().includes(f));
  }, [ests, filtro]);

  const esPreescolar = sel ? GRADOS_PREESCOLAR.has(sel.grado) : false;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/direccion-grupo")} className="text-primary hover:underline">Dirección de grupo</button>
            <span className="text-muted-foreground">&rarr;</span>
            {sel ? (
              <>
                <button onClick={() => setSel(null)} className="text-primary hover:underline">Consolidado de mi grupo</button>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="text-foreground font-medium">{sel.apellidos} {sel.nombres}</span>
              </>
            ) : (
              <span className="text-foreground font-medium">Consolidado de mi grupo</span>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto">
          {loading ? (
            <p className="text-center text-muted-foreground py-10">Cargando…</p>
          ) : !dirGrupo ? (
            <div className="text-center text-muted-foreground py-10 flex flex-col items-center gap-2">
              <Users className="w-8 h-8 opacity-40" />
              No eres director de grupo de ningún salón.
            </div>
          ) : sel ? (
            <div>
              <button onClick={() => setSel(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <ChevronLeft className="w-4 h-4" /> Volver al grupo
              </button>
              {esPreescolar ? (
                <ConsolidadoNotasPreescolar idEstudiante={sel.id} nombreEstudiante={sel.nombres} apellidosEstudiante={sel.apellidos} grado={sel.grado} salon={sel.salon || ""} />
              ) : (
                <ConsolidadoNotas idEstudiante={sel.id} nombreEstudiante={sel.nombres} apellidosEstudiante={sel.apellidos} grado={sel.grado} salon={sel.salon || ""} />
              )}
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-foreground mb-1 text-center">Consolidado de mi grupo</h2>
              <p className="text-sm text-muted-foreground mb-5 text-center">Toca un estudiante para ver sus notas de todas las asignaturas.</p>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                  <Users className="w-4 h-4" /> {dirGrupo}
                </span>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar estudiante…"
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm w-52" />
                </div>
              </div>
              {visibles.length === 0 ? (
                <p className="text-center text-muted-foreground py-10">No hay estudiantes en este grupo.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visibles.map((e) => (
                    <button key={e.id} onClick={() => setSel(e)}
                      className="bg-card rounded-lg shadow-sm border border-border px-4 py-3 text-left hover:shadow-md hover:border-primary transition">
                      <p className="font-semibold text-foreground">{e.apellidos} {e.nombres}</p>
                      <p className="text-xs text-muted-foreground">{e.grado} {e.salon || ""}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ConsolidadoGrupo;
