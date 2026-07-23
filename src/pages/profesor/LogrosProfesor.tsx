import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isProfesor } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { BookOpenCheck, Plus, Pencil, Trash2, Loader2, Sparkles } from "lucide-react";
import { rankGrado } from "@/utils/grados";

/**
 * Logros del periodo (para el boletín). El profesor escribe 2-4 viñetas por
 * asignatura + grado + periodo — las MISMAS para todo el salón. Cada logro
 * tiene su redacción principal (desempeño Superior/Alto) y variantes para
 * Básico y Bajo: el boletín elige la variante según la nota del estudiante.
 * "Generar variantes con Normi" redacta Básico/Bajo con IA a partir de la
 * principal (el profesor las revisa y ajusta).
 */

interface Logro {
  id: string; id_profesor: number; asignatura: string; grado: string;
  periodo: number; orden: number; texto: string;
  texto_basico: string | null; texto_bajo: string | null;
  dimension: string | null; salon: string | null;
}

const PERIODOS = [1, 2, 3, 4];
const ORDINAL: Record<number, string> = { 1: "Primer", 2: "Segundo", 3: "Tercer", 4: "Cuarto" };
const DIMENSIONES: Array<{ v: string; label: string; corto: string }> = [
  { v: "saber", label: "Saber (Cognitivo)", corto: "Saber" },
  { v: "hacer", label: "Hacer (Procedimental)", corto: "Hacer" },
  { v: "ser", label: "Ser (Actitudinal)", corto: "Ser" },
];

const LogrosProfesor = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Carga académica del profesor: combos (asignatura, grado) que dicta.
  const [combos, setCombos] = useState<Array<{ asignatura: string; grado: string }>>([]);
  // Salones que dicta por (asignatura|grado), para el alcance "solo este salón".
  const [salonesPorGA, setSalonesPorGA] = useState<Record<string, string[]>>({});
  const [cargando, setCargando] = useState(true);

  const [asignatura, setAsignatura] = useState("");
  const [grado, setGrado] = useState("");
  const [periodo, setPeriodo] = useState<number>(1);

  const [logros, setLogros] = useState<Logro[]>([]);
  const [cargandoLogros, setCargandoLogros] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isProfesor()) { navigate("/"); return; }
    supabase.from("Asignación Profesores").select('"Asignatura(s)", "Grado(s)", "Salon(es)"').eq("id", parseInt(session.id!))
      .then(({ data }) => {
        const set = new Map<string, { asignatura: string; grado: string }>();
        const sal: Record<string, Set<string>> = {};
        for (const row of (data || []) as any[]) {
          const salones = (row["Salon(es)"] || []) as string[];
          for (const a of (row["Asignatura(s)"] || []) as string[]) {
            for (const g of (row["Grado(s)"] || []) as string[]) {
              set.set(`${a}|${g}`, { asignatura: a, grado: g });
              const key = `${a}|${g}`;
              if (!sal[key]) sal[key] = new Set<string>();
              for (const s of salones) sal[key].add(String(s));
            }
          }
        }
        const lista = [...set.values()].sort((x, y) =>
          x.asignatura.localeCompare(y.asignatura, "es") || rankGrado(x.grado) - rankGrado(y.grado));
        setCombos(lista);
        setSalonesPorGA(Object.fromEntries(Object.entries(sal).map(([k, v]) => [k, [...v].sort()])));
        if (lista.length > 0) { setAsignatura(lista[0].asignatura); setGrado(lista[0].grado); }
        setCargando(false);
      });
  }, [navigate]);

  const asignaturasUnicas = useMemo(() => [...new Set(combos.map((c) => c.asignatura))], [combos]);
  const gradosDeAsig = useMemo(() =>
    combos.filter((c) => c.asignatura === asignatura).map((c) => c.grado), [combos, asignatura]);

  const cargarLogros = async () => {
    if (!asignatura || !grado) return;
    setCargandoLogros(true);
    try {
      const r = await apiRequest<{ logros: Logro[] }>(
        `/api/logros?asignatura=${encodeURIComponent(asignatura)}&grado=${encodeURIComponent(grado)}&periodo=${periodo}`);
      setLogros(r.logros || []);
    } catch {
      toast({ title: "No se pudieron cargar los logros", variant: "destructive" });
    } finally { setCargandoLogros(false); }
  };
  useEffect(() => { cargarLogros(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [asignatura, grado, periodo]);

  // ── Crear / editar (mismo dialog) ──
  const [editando, setEditando] = useState<Logro | null>(null);
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [textoBasico, setTextoBasico] = useState("");
  const [textoBajo, setTextoBajo] = useState("");
  const [dimension, setDimension] = useState("");   // "" = sin clasificar
  const [salonSel, setSalonSel] = useState("");     // "" = todo el grado
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);

  // Salones que el docente dicta en el grado/asignatura actual (para el alcance).
  const salonesDelGrado = useMemo(
    () => salonesPorGA[`${asignatura}|${grado}`] || [], [salonesPorGA, asignatura, grado]);

  const abrirNuevo = () => { setEditando(null); setTexto(""); setTextoBasico(""); setTextoBajo(""); setDimension(""); setSalonSel(""); setDialogAbierto(true); };
  const abrirEditar = (l: Logro) => {
    setEditando(l); setTexto(l.texto); setTextoBasico(l.texto_basico || ""); setTextoBajo(l.texto_bajo || "");
    setDimension(l.dimension || ""); setSalonSel(l.salon || "");
    setDialogAbierto(true);
  };

  const generarVariantes = async () => {
    if (!texto.trim()) {
      toast({ title: "Escribe primero el logro", description: "Normi redacta las variantes a partir de la redacción principal.", variant: "destructive" });
      return;
    }
    setGenerando(true);
    try {
      const r = await apiRequest<{ basico: string; bajo: string }>("/api/logros/variantes", {
        method: "POST", body: JSON.stringify({ texto: texto.trim() }),
      });
      setTextoBasico(r.basico);
      setTextoBajo(r.bajo);
    } catch {
      toast({ title: "Normi no pudo generar las variantes", description: "Intenta de nuevo o escríbelas manualmente.", variant: "destructive" });
    } finally { setGenerando(false); }
  };

  const guardar = async () => {
    if (!texto.trim()) return;
    setGuardando(true);
    try {
      if (editando) {
        await apiRequest(`/api/logros/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify({ texto: texto.trim(), texto_basico: textoBasico.trim() || null, texto_bajo: textoBajo.trim() || null, dimension: dimension || null, salon: salonSel || null }),
        });
      } else {
        await apiRequest("/api/logros", {
          method: "POST",
          body: JSON.stringify({
            asignatura, grado, periodo,
            texto: texto.trim(), texto_basico: textoBasico.trim() || undefined, texto_bajo: textoBajo.trim() || undefined,
            dimension: dimension || undefined, salon: salonSel || undefined,
          }),
        });
      }
      setDialogAbierto(false);
      await cargarLogros();
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.body?.detail || e?.message, variant: "destructive" });
    } finally { setGuardando(false); }
  };

  const [borrando, setBorrando] = useState<Logro | null>(null);
  const borrar = async () => {
    if (!borrando) return;
    try {
      await apiRequest(`/api/logros/${borrando.id}`, { method: "DELETE" });
      setBorrando(null);
      await cargarLogros();
    } catch (e: any) {
      toast({ title: "No se pudo eliminar", description: e?.body?.detail || e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-3xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Logros del periodo</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-2">
            <BookOpenCheck className="h-5 w-5 text-primary" /> Logros del periodo
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            Escribe los logros que trabajaste en el periodo. Por defecto aplican a <b>todo el grado</b> (los comparten los demás
            docentes de la misma asignatura), pero puedes limitar uno a <b>un salón</b> y clasificarlo por dimensión (Saber/Hacer/Ser).
            En el boletín, cada estudiante recibe la redacción según su desempeño: la principal si ganó, o la variante Básico/Bajo.
          </p>

          {cargando ? (
            <div className="text-center py-8 text-muted-foreground">Cargando…</div>
          ) : combos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No tienes carga académica asignada.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <select value={asignatura} onChange={(e) => { setAsignatura(e.target.value); const gs = combos.filter((c) => c.asignatura === e.target.value); setGrado(gs[0]?.grado || ""); }}
                  className="col-span-2 sm:col-span-1 px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  {asignaturasUnicas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={grado} onChange={(e) => setGrado(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  {gradosDeAsig.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={periodo} onChange={(e) => setPeriodo(parseInt(e.target.value, 10))}
                  className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  {PERIODOS.map((p) => <option key={p} value={p}>{ORDINAL[p]} periodo</option>)}
                </select>
              </div>

              <div className="flex justify-end">
                <Button onClick={abrirNuevo} className="gap-1"><Plus className="w-4 h-4" /> Agregar logro</Button>
              </div>

              {cargandoLogros ? (
                <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
              ) : logros.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">
                  Aún no hay logros de {asignatura} — {grado} en el {ORDINAL[periodo].toLowerCase()} periodo.
                </p>
              ) : (
                <div className="space-y-2">
                  {logros.map((l) => (
                    <div key={l.id} className="border border-border rounded-lg p-3 bg-card">
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {l.dimension && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {DIMENSIONES.find((d) => d.v === l.dimension)?.corto || l.dimension}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {l.salon ? `Solo ${l.grado} ${l.salon}` : `Todo el grado`}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-foreground leading-relaxed">» {l.texto}</p>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => abrirEditar(l)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                          <button onClick={() => setBorrando(l)} className="p-1.5 rounded hover:bg-muted"><Trash2 className="w-4 h-4 text-destructive" /></button>
                        </div>
                      </div>
                      {(l.texto_basico || l.texto_bajo) ? (
                        <div className="mt-1.5 space-y-0.5">
                          {l.texto_basico && <p className="text-xs text-muted-foreground"><span className="font-medium text-amber-600">Básico:</span> {l.texto_basico}</p>}
                          {l.texto_bajo && <p className="text-xs text-muted-foreground"><span className="font-medium text-red-500">Bajo:</span> {l.texto_bajo}</p>}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 mt-1">Sin variantes Básico/Bajo — todos recibirán la misma redacción.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Dialog crear/editar ── */}
      <Dialog open={dialogAbierto} onOpenChange={(o) => !o && setDialogAbierto(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar logro" : "Nuevo logro"} — {asignatura} · {grado} · {ORDINAL[periodo]} periodo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1">Logro (redacción principal — desempeño Superior/Alto)</label>
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3}
                placeholder="Ej: Comprende el clima como un conjunto de fenómenos atmosféricos…" />
            </div>
            <Button variant="outline" size="sm" onClick={generarVariantes} disabled={generando || !texto.trim()} className="gap-2">
              {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
              Generar variantes con Normi
            </Button>
            <div>
              <label className="text-sm font-medium block mb-1 text-amber-600">Variante Básico (lo alcanza con dificultad)</label>
              <Textarea value={textoBasico} onChange={(e) => setTextoBasico(e.target.value)} rows={2} placeholder="Opcional" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1 text-red-500">Variante Bajo (no lo alcanza)</label>
              <Textarea value={textoBajo} onChange={(e) => setTextoBajo(e.target.value)} rows={2} placeholder="Opcional" />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-sm font-medium block mb-1">Dimensión</label>
                <select value={dimension} onChange={(e) => setDimension(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Sin clasificar</option>
                  {DIMENSIONES.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Aplica a</label>
                <select value={salonSel} onChange={(e) => setSalonSel(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todo el grado ({grado})</option>
                  {salonesDelGrado.map((s) => <option key={s} value={s}>Solo {grado} {s}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAbierto(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando || !texto.trim()} className="gap-2">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog eliminar ── */}
      <Dialog open={!!borrando} onOpenChange={(o) => !o && setBorrando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar este logro?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">» {borrando?.texto}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrando(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={borrar}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogrosProfesor;
