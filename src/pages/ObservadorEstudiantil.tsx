import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSession, isAdmin, isProfesor, isPadreDeFamilia, isEstudiante,
  puedeAccederDashboard, type AcudidoData,
} from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";
import { cargoSegunGenero } from "@/lib/entrevistadores";
import { Search, Plus, Pencil, Trash2, NotebookPen, ChevronDown } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Piloto: por ahora solo el colegio de prueba (Cailico). Luego se abre a todos.
const COLEGIO_PRUEBA = "2f96f076-83df-4b84-8bbc-9c1df79a372b";

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo": 0, "Pre-Jardín": 1, "Prejardín": 1, "Jardín": 2, "Transición": 3,
  "Primero": 4, "Segundo": 5, "Tercero": 6, "Cuarto": 7, "Quinto": 8,
  "Sexto": 9, "Séptimo": 10, "Octavo": 11, "Noveno": 12, "Décimo": 13, "Undécimo": 14,
};

interface Estudiante { id: number; nombres: string; apellidos: string; grado: string; salon: string; }
interface Observacion {
  id: number;
  estudiante_id: number;
  autor_id: string;
  autor_nombre: string | null;
  comentario: string;
  created_at: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const fmtFechaHora = (s: string) =>
  new Date(s).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Papel de cuaderno rayado (renglones + margen rojo).
const paperStyle: React.CSSProperties = {
  backgroundColor: "#fffdf5",
  backgroundImage:
    "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #cfe0ec 31px, #cfe0ec 32px)",
  backgroundPositionY: "10px",
};

const ObservadorEstudiantil = () => {
  const navigate = useNavigate();
  const session = getSession();
  const esAcudiente = isPadreDeFamilia();
  const esInterno = isProfesor() || isAdmin() || puedeAccederDashboard();

  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [estSel, setEstSel] = useState<Estudiante | null>(null);
  const [observaciones, setObservaciones] = useState<Observacion[]>([]);
  const [cargandoObs, setCargandoObs] = useState(false);

  // Filtros (internos)
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [busqueda, setBusqueda] = useState("");

  // Modal de comentario
  const [modalOpen, setModalOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminarId, setEliminarId] = useState<number | null>(null);

  // Cargo conjugado por género (Profesora/Profesor, Coordinadora/Coordinador…),
  // nunca el neutro "(a)" cuando se conoce el género.
  const autorNombre = [cargoSegunGenero(session.cargo || undefined, session.genero), session.nombres, session.apellidos].filter(Boolean).join(" ").trim();

  // Guard de acceso
  useEffect(() => {
    if (!session.id) { navigate("/"); return; }
    if (session.colegio_id !== COLEGIO_PRUEBA) { navigate("/"); return; }
    if (isEstudiante() || (!esInterno && !esAcudiente)) { navigate("/"); return; }
  }, [navigate]);

  // Cargar la lista de estudiantes según el rol
  useEffect(() => {
    const cargar = async () => {
      if (esAcudiente) {
        const acudidos: AcudidoData[] = session.acudidos || [];
        setEstudiantes(acudidos.map(a => ({
          id: Number(a.id), nombres: a.nombre, apellidos: a.apellidos, grado: a.grado, salon: a.salon,
        })));
        // Marcar como leídas (limpia el badge del dashboard).
        supabase.from("Observador_Lecturas").upsert(
          { acudiente_id: session.id, ultima_lectura: new Date().toISOString() },
          { onConflict: "colegio_id,acudiente_id" },
        ).then(() => {});
        setLoading(false);
        return;
      }
      // Interno: todos los estudiantes del colegio (enriquecidos con nombres).
      const { data } = await supabase.from("Estudiantes").select("id, grado, salon");
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const todos = sortByApellidosNombres(await enrichWithNombres((data || []) as any));
      setEstudiantes(todos.map((e: any) => ({
        id: Number(e.id), nombres: e.nombres, apellidos: e.apellidos, grado: e.grado, salon: e.salon,
      })));
      setLoading(false);
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarObservaciones = async (estId: number) => {
    setCargandoObs(true);
    const { data } = await supabase
      .from("Observador_Estudiantil")
      .select("id, estudiante_id, autor_id, autor_nombre, comentario, created_at")
      .eq("estudiante_id", estId)
      .order("created_at", { ascending: true }); // cronológico: las nuevas quedan abajo
    setObservaciones((data || []) as Observacion[]);
    setCargandoObs(false);
  };

  const abrirEstudiante = (e: Estudiante) => {
    setEstSel(e);
    setObservaciones([]);
    cargarObservaciones(e.id);
  };

  // Filtros para internos
  const gradosUnicos = useMemo(() => [...new Set(estudiantes.map(e => e.grado).filter(Boolean))]
    .sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99) || a.localeCompare(b, "es")), [estudiantes]);
  const salonesUnicos = useMemo(() => [...new Set(
    estudiantes.filter(e => !filtroGrado || e.grado === filtroGrado).map(e => e.salon).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [estudiantes, filtroGrado]);

  const estudiantesFiltrados = useMemo(() => {
    const tokens = norm(busqueda.trim()).split(/\s+/).filter(Boolean);
    return estudiantes.filter(e => {
      if (filtroGrado && e.grado !== filtroGrado) return false;
      if (filtroSalon && e.salon !== filtroSalon) return false;
      if (tokens.length) {
        const full = norm(`${e.nombres} ${e.apellidos}`);
        if (!tokens.every(t => full.includes(t))) return false;
      }
      return true;
    });
  }, [estudiantes, filtroGrado, filtroSalon, busqueda]);

  const abrirNuevo = () => { setEditandoId(null); setTexto(""); setModalOpen(true); };
  const abrirEditar = (o: Observacion) => { setEditandoId(o.id); setTexto(o.comentario); setModalOpen(true); };

  const guardar = async () => {
    if (!estSel || !texto.trim()) return;
    setGuardando(true);
    if (editandoId != null) {
      const { error } = await supabase.from("Observador_Estudiantil")
        .update({ comentario: texto.trim() }).eq("id", editandoId);
      setGuardando(false);
      if (error) { toast({ title: "No se pudo guardar", description: error.message || String(error), variant: "destructive" }); return; }
      setModalOpen(false);
      await cargarObservaciones(estSel.id);
      return;
    }
    // Nuevo
    const { error } = await supabase.from("Observador_Estudiantil").insert({
      estudiante_id: estSel.id,
      estudiante_nombre: estSel.nombres,
      estudiante_apellidos: estSel.apellidos,
      estudiante_grado: estSel.grado,
      estudiante_salon: estSel.salon,
      autor_id: session.id,
      autor_nombre: autorNombre,
      comentario: texto.trim(),
    });
    if (error) {
      setGuardando(false);
      toast({ title: "No se pudo guardar", description: error.message || String(error), variant: "destructive" });
      return;
    }
    // Notificar a los acudientes por WhatsApp (no bloquea el guardado).
    apiRequest("/api/observador/notificar", {
      method: "POST",
      body: JSON.stringify({
        estudiante_id: estSel.id,
        estudiante_nombre: `${estSel.nombres} ${estSel.apellidos}`,
        comentario: texto.trim(),
        autor_nombre: autorNombre,
      }),
    }).catch(e => console.error("notificar observador:", e));
    setGuardando(false);
    setModalOpen(false);
    toast({ title: "Observación agregada", description: "Se notificó a los acudientes.", variant: "success" as any });
    await cargarObservaciones(estSel.id);
  };

  const eliminar = async () => {
    if (eliminarId == null || !estSel) return;
    const { error } = await supabase.from("Observador_Estudiantil").delete().eq("id", eliminarId);
    if (error) { toast({ title: "No se pudo eliminar", description: error.message || String(error), variant: "destructive" }); return; }
    setEliminarId(null);
    await cargarObservaciones(estSel.id);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            {estSel ? (
              <>
                <button onClick={() => setEstSel(null)} className="text-primary hover:underline">Observador Estudiantil</button>
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground font-medium">{estSel.apellidos} {estSel.nombres}</span>
              </>
            ) : (
              <span className="text-foreground font-medium">Observador Estudiantil</span>
            )}
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
            <NotebookPen className="w-6 h-6 text-orange-500" /> Observador Estudiantil
          </h2>

          {/* NIVEL 1: elegir estudiante */}
          {!estSel && (loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : esAcudiente ? (
            <div className="space-y-2">
              {estudiantes.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground">No tienes estudiantes asociados.</p>
              ) : estudiantes.map(e => (
                <button key={e.id} onClick={() => abrirEstudiante(e)}
                  className="w-full flex items-center justify-between border border-border rounded-lg p-4 text-left hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{e.apellidos} {e.nombres}</p>
                    <p className="text-xs text-muted-foreground">{e.grado} {e.salon}</p>
                  </div>
                  <ChevronDown className="w-5 h-5 -rotate-90 text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar estudiante por nombre..."
                    className="w-full pl-9 pr-3 py-2 border border-input rounded-md text-sm bg-background" />
                </div>
                <select value={filtroGrado} onChange={e => { setFiltroGrado(e.target.value); setFiltroSalon(""); }}
                  className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los grados</option>
                  {gradosUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={filtroSalon} onChange={e => setFiltroSalon(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los salones</option>
                  {salonesUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {estudiantesFiltrados.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground">No hay estudiantes con esos filtros.</p>
              ) : (
                <div className="space-y-2">
                  {estudiantesFiltrados.map(e => (
                    <button key={e.id} onClick={() => abrirEstudiante(e)}
                      className="w-full flex items-center justify-between border border-border rounded-lg p-4 text-left hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="font-semibold text-foreground text-sm">{e.apellidos} {e.nombres}</p>
                        <p className="text-xs text-muted-foreground">{e.grado} {e.salon}</p>
                      </div>
                      <ChevronDown className="w-5 h-5 -rotate-90 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* NIVEL 2: cuaderno del estudiante */}
          {estSel && (
            <div className="space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <button onClick={() => setEstSel(null)} className="text-sm text-primary hover:underline">← Volver</button>
                {esInterno && (
                  <Button onClick={abrirNuevo} className="gap-2"><Plus className="w-4 h-4" /> Agregar observación</Button>
                )}
              </div>

              {cargandoObs ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : observaciones.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <NotebookPen className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>Aún no hay observaciones para este estudiante.</p>
                </div>
              ) : (
                // Una sola "página de cuaderno": papel rayado continuo + margen rojo,
                // y todas las observaciones fluyen dentro, una debajo de otra.
                <div style={paperStyle} className="relative rounded-lg border border-amber-200 shadow-sm px-6 py-5 pl-14">
                  <div className="absolute left-10 top-0 bottom-0 w-px bg-red-300/70" />
                  <div className="space-y-7">
                    {observaciones.map(o => {
                      const esMio = o.autor_id === session.id;
                      return (
                        <div key={o.id} className="group">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs text-amber-800/90">
                              <span className="font-semibold">{o.autor_nombre || "—"}</span>
                              <span className="text-amber-700/80"> · {fmtFechaHora(o.created_at)}</span>
                            </p>
                            {esMio && esInterno && (
                              <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <button onClick={() => abrirEditar(o)} title="Editar" className="p-1 rounded hover:bg-amber-100 text-amber-800">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEliminarId(o.id)} title="Eliminar" className="p-1 rounded hover:bg-red-100 text-red-600">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap text-slate-800 text-2xl leading-8" style={{ fontFamily: "'Caveat', cursive" }}>
                            {o.comentario}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modal agregar/editar (texto normal mientras se escribe) */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editandoId != null ? "Editar observación" : "Nueva observación"}</DialogTitle>
          </DialogHeader>
          {estSel && (
            <p className="text-sm text-muted-foreground -mt-1">
              {estSel.apellidos} {estSel.nombres} · {estSel.grado} {estSel.salon}
            </p>
          )}
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            autoFocus
            placeholder="Escribe la observación del estudiante..."
            className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[160px] resize-y"
          />
          {editandoId == null && (
            <p className="text-xs text-muted-foreground">Al guardar, se enviará una notificación por WhatsApp a los acudientes.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando || !texto.trim()}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminar */}
      <Dialog open={eliminarId !== null} onOpenChange={(o) => !o && setEliminarId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar observación</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">¿Seguro que quieres eliminar esta observación? No se puede deshacer.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEliminarId(null)}>Cancelar</Button>
            <Button onClick={eliminar} className="bg-destructive hover:bg-destructive/90">Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ObservadorEstudiantil;
