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
import { BookOpenCheck, Plus, Pencil, Trash2, Loader2, Sparkles, Check } from "lucide-react";
import { rankGrado } from "@/utils/grados";

/**
 * Logros del periodo — una sola columna. Cada logro tiene una casilla (chulo = agregado) y los
 * salones del grado marcables en la misma fila. Marcar/desmarcar se guarda al instante (sin
 * botón). El banco es compartido por asignatura+grado en el colegio; cada docente marca en qué
 * salones aplica cada logro. Cada logro guarda una redacción por nivel de desempeño del colegio.
 */

interface Nivel { key: string; label: string; min: number; max: number; }
interface Logro {
  id: string; id_profesor: number; asignatura: string; grado: string; orden: number;
  redacciones: Record<string, string>; salones: string[];
}

const PERIODOS = [1, 2, 3, 4];
const ORDINAL: Record<number, string> = { 1: "Primer", 2: "Segundo", 3: "Tercer", 4: "Cuarto" };

const LogrosProfesor = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [combos, setCombos] = useState<Array<{ asignatura: string; grado: string }>>([]);
  const [salonesPorGA, setSalonesPorGA] = useState<Record<string, string[]>>({});
  const [cargando, setCargando] = useState(true);

  const [asignatura, setAsignatura] = useState("");
  const [grado, setGrado] = useState("");
  const [periodo, setPeriodo] = useState<number>(1);

  const [banco, setBanco] = useState<Logro[]>([]);
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [cargandoBanco, setCargandoBanco] = useState(false);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

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
  const salonesDelGrado = useMemo(
    () => salonesPorGA[`${asignatura}|${grado}`] || [], [salonesPorGA, asignatura, grado]);

  const cargarBanco = async () => {
    if (!asignatura || !grado) return;
    setCargandoBanco(true);
    try {
      const r = await apiRequest<{ banco: Logro[]; niveles: Nivel[] }>(
        `/api/logros/banco?asignatura=${encodeURIComponent(asignatura)}&grado=${encodeURIComponent(grado)}&periodo=${periodo}`);
      setBanco(r.banco || []);
      setNiveles(r.niveles || []);
    } catch {
      toast({ title: "No se pudo cargar el banco de logros", variant: "destructive" });
    } finally { setCargandoBanco(false); }
  };
  useEffect(() => { cargarBanco(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [asignatura, grado, periodo]);

  const nivelAlto = niveles[0];
  const textoPrincipal = (l: Logro) => (nivelAlto && l.redacciones?.[nivelAlto.key]) || Object.values(l.redacciones || {})[0] || "";

  // ── Guardado inmediato (sin botón). Optimista + persiste. Solo toca los salones del docente. ──
  const aplicar = async (l: Logro, activos: string[]) => {
    const fuera = (l.salones || []).filter((s) => !salonesDelGrado.includes(s)); // salones de otros docentes
    const nuevos = [...activos, ...fuera];
    setBanco((prev) => prev.map((x) => (x.id === l.id ? { ...x, salones: nuevos } : x)));
    setGuardandoId(l.id);
    try {
      await apiRequest("/api/logros/asignar", {
        method: "POST",
        body: JSON.stringify({ logro_id: l.id, grado, periodo, activos, universo: salonesDelGrado }),
      });
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.body?.detail || e?.message, variant: "destructive" });
      await cargarBanco();
    } finally { setGuardandoId(null); }
  };
  const toggleSalon = (l: Logro, s: string) => {
    const propios = (l.salones || []).filter((x) => salonesDelGrado.includes(x));
    const activos = propios.includes(s) ? propios.filter((x) => x !== s) : [...propios, s];
    aplicar(l, activos);
  };
  const toggleLogro = (l: Logro) => {
    const propios = (l.salones || []).filter((x) => salonesDelGrado.includes(x));
    aplicar(l, propios.length > 0 ? [] : [...salonesDelGrado]); // tiene alguno → quitar todos; si no → todos
  };
  const agregada = (l: Logro) => (l.salones || []).length > 0;

  // ── Crear / editar logro (redacciones por nivel) ──
  const [editando, setEditando] = useState<Logro | null>(null);
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [red, setRed] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);

  const abrirNuevo = () => { setEditando(null); setRed({}); setDialogAbierto(true); };
  const abrirEditar = (l: Logro) => { setEditando(l); setRed({ ...(l.redacciones || {}) }); setDialogAbierto(true); };
  const setNivelTexto = (key: string, v: string) => setRed((p) => ({ ...p, [key]: v }));

  const generarVariantes = async () => {
    const principal = nivelAlto ? (red[nivelAlto.key] || "").trim() : "";
    if (!principal) {
      toast({ title: "Escribe primero la redacción principal", description: "Normi redacta los demás niveles a partir de ella.", variant: "destructive" });
      return;
    }
    setGenerando(true);
    try {
      const r = await apiRequest<{ redacciones: Record<string, string> }>("/api/logros/variantes", {
        method: "POST", body: JSON.stringify({ texto: principal }),
      });
      setRed((p) => ({ ...p, ...(r.redacciones || {}) }));
    } catch {
      toast({ title: "Normi no pudo generar las variantes", description: "Intenta de nuevo o escríbelas manualmente.", variant: "destructive" });
    } finally { setGenerando(false); }
  };

  const guardar = async () => {
    const redacciones = Object.fromEntries(Object.entries(red).map(([k, v]) => [k, String(v || "").trim()]).filter(([, v]) => v));
    if (Object.keys(redacciones).length === 0) return;
    setGuardando(true);
    try {
      if (editando) {
        await apiRequest(`/api/logros/${editando.id}`, { method: "PATCH", body: JSON.stringify({ redacciones }) });
      } else {
        await apiRequest("/api/logros", { method: "POST", body: JSON.stringify({ asignatura, grado, redacciones }) });
      }
      setDialogAbierto(false);
      await cargarBanco();
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
      await cargarBanco();
    } catch (e: any) {
      toast({ title: "No se pudo eliminar", description: e?.body?.detail || e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-4xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Logros del periodo</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BookOpenCheck className="h-5 w-5 text-primary" /> Logros del periodo
            </h2>
            {combos.length > 0 && <Button onClick={abrirNuevo} className="gap-1"><Plus className="w-4 h-4" /> Nuevo logro</Button>}
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Marca la casilla de un logro para agregarlo, y elige en qué <b>salones</b> aplica. Se guarda solo.
            El banco es compartido con los demás docentes de la asignatura; en el boletín cada estudiante recibe
            la redacción según su nivel de desempeño.
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

              {cargandoBanco ? (
                <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
              ) : banco.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Aún no hay logros de {asignatura} — {grado}. Crea el primero con “Nuevo logro”.
                </p>
              ) : (
                <div className="divide-y divide-border border border-border rounded-lg">
                  {banco.map((l) => {
                    const on = agregada(l);
                    return (
                      <div key={l.id} className={`p-3 flex items-start gap-3 ${on ? "bg-primary/5" : ""}`}>
                        {/* Casilla del logro */}
                        <button onClick={() => toggleLogro(l)} disabled={guardandoId === l.id} title={on ? "Quitar de todos los salones" : "Agregar a todos los salones"}
                          className={`mt-0.5 w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center ${on ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"}`}>
                          {guardandoId === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : on ? <Check className="w-4 h-4 text-white" /> : null}
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-snug">{textoPrincipal(l)}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="text-xs text-muted-foreground mr-1">Salones:</span>
                            {salonesDelGrado.map((s) => {
                              const sel = (l.salones || []).includes(s);
                              return (
                                <button key={s} onClick={() => toggleSalon(l, s)} disabled={guardandoId === l.id}
                                  className={`text-xs font-medium px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${sel ? "border-primary/40 bg-primary/10 text-primary" : "border-input text-muted-foreground hover:border-primary"}`}>
                                  {sel && <Check className="w-3 h-3" />} {grado} {s}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex gap-1 shrink-0">
                          <button title="Editar" onClick={() => abrirEditar(l)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                          <button title="Eliminar del banco" onClick={() => setBorrando(l)} className="p-1.5 rounded hover:bg-muted"><Trash2 className="w-4 h-4 text-destructive" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Dialog crear/editar (redacciones por nivel) ── */}
      <Dialog open={dialogAbierto} onOpenChange={(o) => !o && setDialogAbierto(false)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar logro" : "Nuevo logro"} — {asignatura} · {grado}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {niveles.length === 0 ? (
              <p className="text-sm text-destructive">Este colegio no tiene niveles de desempeño configurados.</p>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium block mb-1">Redacción principal — nivel <b>{nivelAlto?.label}</b> (el más alto)</label>
                  <Textarea value={nivelAlto ? (red[nivelAlto.key] || "") : ""} onChange={(e) => nivelAlto && setNivelTexto(nivelAlto.key, e.target.value)} rows={3}
                    placeholder="Ej: Comprende el clima como un conjunto de fenómenos atmosféricos…" />
                </div>
                <Button variant="outline" size="sm" onClick={generarVariantes} disabled={generando || !(nivelAlto && (red[nivelAlto.key] || "").trim())} className="gap-2">
                  {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
                  Generar los demás niveles con Normi
                </Button>
                {niveles.slice(1).map((n) => (
                  <div key={n.key}>
                    <label className="text-sm font-medium block mb-1 text-muted-foreground">Nivel {n.label}</label>
                    <Textarea value={red[n.key] || ""} onChange={(e) => setNivelTexto(n.key, e.target.value)} rows={2} placeholder="Opcional" />
                  </div>
                ))}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAbierto(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando} className="gap-2">{guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar en el banco</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog eliminar ── */}
      <Dialog open={!!borrando} onOpenChange={(o) => !o && setBorrando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar este logro del banco?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{borrando && textoPrincipal(borrando)}</p>
          <p className="text-xs text-destructive">Se quitará también de todos los salones donde esté asignado.</p>
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
