import { useEffect, useState, useMemo, useRef, useLayoutEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getSession, isAdmin, isProfesor, isPadreDeFamilia, isEstudiante,
  puedeAccederDashboard, type AcudidoData,
} from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/lib/apiClient";
import { toast } from "@/hooks/use-toast";
import { cargoSegunGenero } from "@/lib/entrevistadores";
import { Search, Plus, Pencil, Trash2, NotebookPen, ChevronDown, Users, Check, X, User } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const session = getSession();
  const esAcudiente = isPadreDeFamilia();
  const esInterno = isProfesor() || isAdmin() || puedeAccederDashboard();

  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [estSel, setEstSel] = useState<Estudiante | null>(null);
  const [observaciones, setObservaciones] = useState<Observacion[]>([]);
  const [cargandoObs, setCargandoObs] = useState(false);
  // Acudiente: nº de observaciones no leídas por cada estudiante (badge por estudiante).
  const [unreadPorEst, setUnreadPorEst] = useState<Record<number, number>>({});
  // Interno: estudiantes que YA tienen observaciones (para el símbolo y el filtro).
  const [conObs, setConObs] = useState<Set<number>>(new Set());
  const [filtroConObs, setFiltroConObs] = useState(false);

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
  const [viendo, setViendo] = useState<Observacion | null>(null);
  // Selección múltiple (anotar a varios estudiantes, incluso de distintos salones).
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Record<number, Estudiante>>({});
  const [multi, setMulti] = useState(false); // el modal está en modo "varios estudiantes"

  // Cargo conjugado por género (Profesora/Profesor, Coordinadora/Coordinador…),
  // nunca el neutro "(a)" cuando se conoce el género.
  const autorNombre = [cargoSegunGenero(session.cargo || undefined, session.genero), session.nombres, session.apellidos].filter(Boolean).join(" ").trim();
  // Artículo para el mensaje de WhatsApp ("La Profesora…", "El Profesor…"); vacío si no hay género.
  const autorPrefijo = session.genero === "M" ? "El " : session.genero === "F" ? "La " : "";

  // Guard de acceso
  useEffect(() => {
    if (!session.id) { navigate("/"); return; }
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
        // No-leídas POR ESTUDIANTE (badge por cada uno). No marcamos nada leído
        // aquí: eso pasa al ENTRAR a cada estudiante.
        const [{ data: obs }, { data: lecs }] = await Promise.all([
          supabase.from("Observador_Estudiantil").select("estudiante_id, created_at"),
          supabase.from("Observador_Lecturas").select("estudiante_id, ultima_lectura").eq("acudiente_id", session.id),
        ]);
        const lastByEst: Record<number, number> = {};
        (lecs || []).forEach((l: any) => { lastByEst[Number(l.estudiante_id)] = new Date(l.ultima_lectura).getTime(); });
        const unread: Record<number, number> = {};
        (obs || []).forEach((o: any) => {
          const est = Number(o.estudiante_id);
          if (new Date(o.created_at).getTime() > (lastByEst[est] || 0)) unread[est] = (unread[est] || 0) + 1;
        });
        setUnreadPorEst(unread);
        // Un solo estudiante → entrar directo (igual que Notas), sin lista.
        if (acudidos.length === 1 && !searchParams.get("est")) {
          setSearchParams({ est: String(Number(acudidos[0].id)) }, { replace: true });
        }
        setLoading(false);
        return;
      }
      // Interno: todos los estudiantes del colegio (enriquecidos con nombres) +
      // qué estudiantes ya tienen observaciones (para marcarlos y poder filtrar).
      const [{ data }, { data: obsIds }] = await Promise.all([
        supabase.from("Estudiantes").select("id, grado, salon"),
        supabase.from("Observador_Estudiantil").select("estudiante_id"),
      ]);
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const todos = sortByApellidosNombres(await enrichWithNombres((data || []) as any));
      setEstudiantes(todos.map((e: any) => ({
        id: Number(e.id), nombres: e.nombres, apellidos: e.apellidos, grado: e.grado, salon: e.salon,
      })));
      setConObs(new Set((obsIds || []).map((o: any) => Number(o.estudiante_id))));
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
      .order("created_at", { ascending: false }); // lo más reciente arriba
    setObservaciones((data || []) as Observacion[]);
    setCargandoObs(false);
  };

  const abrirEstudiante = (e: Estudiante) => {
    setEstSel(e);
    setObservaciones([]);
    cargarObservaciones(e.id);
    setSearchParams({ est: String(e.id) }); // persiste en la URL: al recargar sigue aquí
    // Acudiente: al entrar, marca leído SOLO ese estudiante → se le quita su badge.
    if (esAcudiente) {
      supabase.from("Observador_Lecturas").upsert(
        { acudiente_id: session.id, estudiante_id: e.id, ultima_lectura: new Date().toISOString() },
        { onConflict: "colegio_id,acudiente_id,estudiante_id" },
      ).then(() => {});
      setUnreadPorEst(prev => { const n = { ...prev }; delete n[e.id]; return n; });
    }
  };

  const volver = () => {
    setEstSel(null);
    setSearchParams({});
  };

  // Mantiene estSel EN SINCRONÍA con la URL (?est=<id>): al recargar reabre; al
  // dar "atrás" (se quita ?est) vuelve a la lista. Antes solo abría, nunca cerraba.
  useEffect(() => {
    const estId = searchParams.get("est");
    if (!estId) { if (estSel) setEstSel(null); return; }
    if (estSel && String(estSel.id) === estId) return;
    if (estudiantes.length === 0) return;
    const found = estudiantes.find(e => String(e.id) === estId);
    if (found) abrirEstudiante(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estudiantes, searchParams, estSel]);

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
      if (filtroConObs && !conObs.has(e.id)) return false;
      if (tokens.length) {
        const full = norm(`${e.nombres} ${e.apellidos}`);
        if (!tokens.every(t => full.includes(t))) return false;
      }
      return true;
    });
  }, [estudiantes, filtroGrado, filtroSalon, busqueda, filtroConObs, conObs]);

  // Virtualización de la lista de estudiantes (contra el scroll de la página).
  const listaRef = useRef<HTMLDivElement>(null);
  const [listaOffset, setListaOffset] = useState(0);
  useLayoutEffect(() => {
    const medir = () => { if (listaRef.current) setListaOffset(listaRef.current.getBoundingClientRect().top + window.scrollY); };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [estudiantesFiltrados.length, modoSeleccion]);
  const rowVirt = useWindowVirtualizer({ count: estudiantesFiltrados.length, estimateSize: () => 72, overscan: 10, scrollMargin: listaOffset });
  const vItems = rowVirt.getVirtualItems();
  const padTop = vItems.length ? vItems[0].start - listaOffset : 0;
  const padBottom = vItems.length ? rowVirt.getTotalSize() - (vItems[vItems.length - 1].end - listaOffset) : 0;

  const abrirNuevo = () => { setMulti(false); setEditandoId(null); setTexto(""); setModalOpen(true); };
  const abrirEditar = (o: Observacion) => { setMulti(false); setEditandoId(o.id); setTexto(o.comentario); setModalOpen(true); };

  // ─── Selección múltiple ───────────────────────────────────────────────────
  const seleccionadosArr = Object.values(seleccionados);
  const toggleSel = (e: Estudiante) => {
    setSeleccionados(prev => {
      const next = { ...prev };
      if (next[e.id]) delete next[e.id]; else next[e.id] = e;
      return next;
    });
  };
  const seleccionarFiltrados = () => {
    setSeleccionados(prev => {
      const next = { ...prev };
      estudiantesFiltrados.forEach(e => { next[e.id] = e; });
      return next;
    });
  };
  const quitarSel = (id: number) => setSeleccionados(prev => { const n = { ...prev }; delete n[id]; return n; });
  const salirSeleccion = () => { setModoSeleccion(false); setSeleccionados({}); };
  const abrirNuevoMultiple = () => { setMulti(true); setEditandoId(null); setTexto(""); setModalOpen(true); };

  const guardarMultiple = async () => {
    const lista = Object.values(seleccionados);
    if (lista.length === 0 || !texto.trim()) return;
    setGuardando(true);
    const filas = lista.map(e => ({
      estudiante_id: e.id,
      estudiante_nombre: e.nombres,
      estudiante_apellidos: e.apellidos,
      estudiante_grado: e.grado,
      estudiante_salon: e.salon,
      autor_id: session.id,
      autor_nombre: autorNombre,
      comentario: texto.trim(),
    }));
    const { error } = await supabase.from("Observador_Estudiantil").insert(filas);
    if (error) {
      setGuardando(false);
      toast({ title: "No se pudo guardar", description: error.message || String(error), variant: "destructive" });
      return;
    }
    // Notificar a los acudientes de cada estudiante (no bloquea).
    lista.forEach(e => {
      apiRequest("/api/observador/notificar", {
        method: "POST",
        body: JSON.stringify({
          estudiante_id: e.id,
          estudiante_nombre: `${e.nombres} ${e.apellidos}`,
          comentario: texto.trim(),
          autor_nombre: autorNombre,
          autor_prefijo: autorPrefijo,
        }),
      }).catch(err => console.error("notificar observador:", err));
    });
    setGuardando(false);
    setModalOpen(false);
    setMulti(false);
    toast({ title: `Observación agregada a ${lista.length} estudiante${lista.length === 1 ? "" : "s"}`, description: "Se notificó a los acudientes.", variant: "success" as any });
    salirSeleccion();
  };

  const guardar = async () => {
    if (multi) return guardarMultiple();
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
        autor_prefijo: autorPrefijo,
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
                <button onClick={volver} className="text-primary hover:underline">Observador Estudiantil</button>
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
            estudiantes.length === 0 ? (
              <p className="text-center py-10 text-muted-foreground">No tienes estudiantes asociados.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {estudiantes.map(e => {
                  const nuevos = unreadPorEst[e.id] || 0;
                  return (
                    <button key={e.id} onClick={() => abrirEstudiante(e)}
                      className="relative flex items-center gap-3 p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-muted/50 transition-all duration-200 text-left">
                      {nuevos > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm animate-badge-pop">
                          {nuevos > 99 ? "99+" : nuevos}
                        </span>
                      )}
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{e.nombres} {e.apellidos}</p>
                        <p className="text-sm text-muted-foreground">{e.grado} {e.salon}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <div className="space-y-4">
              {/* Barra: activar/salir de selección múltiple */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                {!modoSeleccion ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => setModoSeleccion(true)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-primary/40 text-primary text-sm font-medium hover:bg-primary/10">
                      <Users className="w-4 h-4" /> Seleccionar varios
                    </button>
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm font-medium text-foreground cursor-pointer hover:bg-muted/40 select-none">
                      <input type="checkbox" checked={filtroConObs} onChange={e => setFiltroConObs(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                      <NotebookPen className="w-4 h-4 text-orange-500" /> Con observaciones
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">Selecciona los estudiantes (de uno o varios salones)</span>
                    <button onClick={salirSeleccion} className="text-xs text-muted-foreground hover:text-foreground underline">Cancelar</button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <select value={filtroGrado} onChange={e => { setFiltroGrado(e.target.value); setFiltroSalon(""); }}
                  className="px-3 py-2 border border-input rounded-md text-sm bg-card cursor-pointer">
                  <option value="">Todos los grados</option>
                  {gradosUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={filtroSalon} onChange={e => setFiltroSalon(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md text-sm bg-card cursor-pointer">
                  <option value="">Todos los salones</option>
                  {salonesUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar estudiante por nombre..."
                  className="w-full pl-9 pr-9 py-2 border border-input rounded-md text-sm bg-card" />
                {busqueda && (
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBusqueda("")} title="Limpiar"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Layout: lista + (en modo selección) panel lateral de elegidos */}
              <div className={modoSeleccion ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : ""}>
                <div className={modoSeleccion ? "lg:col-span-2" : ""}>
                  {modoSeleccion && estudiantesFiltrados.length > 0 && (
                    <button onClick={seleccionarFiltrados} className="text-xs text-primary hover:underline mb-2 inline-block">
                      Seleccionar todos ({estudiantesFiltrados.length})
                    </button>
                  )}
                  {estudiantesFiltrados.length === 0 ? (
                    <p className="text-center py-10 text-muted-foreground">No hay estudiantes con esos filtros.</p>
                  ) : (
                    <div ref={listaRef}>
                      {padTop > 0 && <div style={{ height: padTop }} />}
                      {vItems.map(vi => {
                        const e = estudiantesFiltrados[vi.index];
                        if (modoSeleccion) {
                          const marcado = !!seleccionados[e.id];
                          return (
                            <label key={e.id} className={`w-full flex items-center gap-3 border rounded-lg p-3 mb-2 cursor-pointer transition-colors ${marcado ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${marcado ? "bg-primary border-primary" : "border-border"}`}>
                                {marcado && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                              </div>
                              <input type="checkbox" className="sr-only" checked={marcado} onChange={() => toggleSel(e)} />
                              <div>
                                <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                                  {e.apellidos} {e.nombres}
                                  {conObs.has(e.id) && <NotebookPen className="w-3.5 h-3.5 text-orange-500 shrink-0" title="Tiene observaciones" />}
                                </p>
                                <p className="text-xs text-muted-foreground">{e.grado} {e.salon}</p>
                              </div>
                            </label>
                          );
                        }
                        return (
                          <button key={e.id} onClick={() => abrirEstudiante(e)}
                            className="w-full flex items-center justify-between border border-border rounded-lg p-4 mb-2 text-left hover:bg-muted/30 transition-colors">
                            <div>
                              <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                                {e.apellidos} {e.nombres}
                                {conObs.has(e.id) && <NotebookPen className="w-3.5 h-3.5 text-orange-500 shrink-0" title="Tiene observaciones" />}
                              </p>
                              <p className="text-xs text-muted-foreground">{e.grado} {e.salon}</p>
                            </div>
                            <ChevronDown className="w-5 h-5 -rotate-90 text-muted-foreground" />
                          </button>
                        );
                      })}
                      {padBottom > 0 && <div style={{ height: padBottom }} />}
                    </div>
                  )}
                </div>

                {modoSeleccion && (
                  <aside className="hidden lg:block lg:col-span-1">
                    <div className="lg:sticky lg:top-4 border border-border rounded-lg p-3 bg-muted/10">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold">Seleccionados ({seleccionadosArr.length})</p>
                        {seleccionadosArr.length > 0 && (
                          <button onClick={() => setSeleccionados({})} className="text-xs text-muted-foreground hover:text-destructive">Quitar todos</button>
                        )}
                      </div>
                      {seleccionadosArr.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">Aún no has elegido a nadie. Marca estudiantes y aparecerán aquí.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                          {seleccionadosArr.map(e => (
                            <div key={e.id} className="flex items-center justify-between gap-2 text-sm bg-background border border-border rounded-md px-2 py-1.5">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{e.apellidos} {e.nombres}</p>
                                <p className="text-[11px] text-muted-foreground">{e.grado} {e.salon}</p>
                              </div>
                              <button onClick={() => quitarSel(e.id)} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-4 h-4" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button onClick={abrirNuevoMultiple} disabled={seleccionadosArr.length === 0} className="w-full mt-3 gap-2">
                        <Plus className="w-4 h-4" /> Agregar observación{seleccionadosArr.length > 0 ? ` (${seleccionadosArr.length})` : ""}
                      </Button>
                    </div>
                  </aside>
                )}
              </div>
              {modoSeleccion && <div className="h-20 lg:hidden" />}
            </div>
          ))}

          {/* NIVEL 2: cuaderno del estudiante */}
          {estSel && (
            <div className="space-y-5">
              {esInterno && (
                <div className="flex items-center justify-end">
                  <Button onClick={abrirNuevo} className="gap-2"><Plus className="w-4 h-4" /> Agregar observación</Button>
                </div>
              )}

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
                          <p onClick={() => setViendo(o)} title="Ver observación"
                            className="whitespace-pre-wrap text-slate-800 text-2xl md:text-3xl leading-8 cursor-pointer hover:text-slate-950"
                            style={{ fontFamily: "'Caveat', cursive" }}>
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

      {/* Barra fija de acción en MÓVIL (el panel lateral de "Seleccionados" solo se
          ve en pantallas grandes; en el teléfono usamos esta barra siempre visible). */}
      {modoSeleccion && !estSel && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border p-3 shadow-lg flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{seleccionadosArr.length} seleccionado{seleccionadosArr.length === 1 ? "" : "s"}</span>
          <Button onClick={abrirNuevoMultiple} disabled={seleccionadosArr.length === 0} className="gap-2">
            <Plus className="w-4 h-4" /> Agregar observación
          </Button>
        </div>
      )}

      {/* Pop-up de LECTURA (letra normal) — cualquiera que haga click en una observación */}
      <Dialog open={!!viendo} onOpenChange={(o) => { if (!o) setViendo(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Observación</DialogTitle>
          </DialogHeader>
          {viendo && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{viendo.autor_nombre || "—"}</span>
                {" · "}{fmtFechaHora(viendo.created_at)}
              </p>
              <div className="whitespace-pre-wrap break-words text-lg text-foreground leading-relaxed bg-muted/20 border border-border rounded-md p-4 max-h-[60vh] overflow-y-auto">
                {viendo.comentario}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setViendo(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal agregar/editar (texto normal mientras se escribe) */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{multi ? `Nueva observación para ${seleccionadosArr.length} estudiante${seleccionadosArr.length === 1 ? "" : "s"}` : (editandoId != null ? "Editar observación" : "Nueva observación")}</DialogTitle>
          </DialogHeader>
          {multi ? (
            <p className="text-sm text-muted-foreground -mt-1">
              El mismo mensaje se guardará para los {seleccionadosArr.length} estudiantes seleccionados.
            </p>
          ) : estSel && (
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
