import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, isOrientador, isAdmin } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Plus, Search, Calendar as CalendarIcon, Check, ClipboardList, Trash2 } from "lucide-react";
import iconCitas from "@/assets/icons/citas.png";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { es } from "date-fns/locale";
import { fechaKey } from "@/utils/fechaUtils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo": 0, "Prejardín": 1, "Jardín": 2, "Transición": 3,
  "Primero": 4, "Segundo": 5, "Tercero": 6, "Cuarto": 7, "Quinto": 8,
  "Sexto": 9, "Séptimo": 10, "Octavo": 11, "Noveno": 12,
  "Décimo": 13, "Undécimo": 14,
};

const ASISTENTES = [
  { value: "estudiante", label: "Estudiante" },
  { value: "acudientes", label: "Acudientes" },
];

// Para mostrar valores legacy (citas viejas que tenían padre/madre/otro) seguimos
// resolviendo etiquetas conocidas, pero los nuevos solo guardan estudiante/acudientes.
const ASISTENTES_LABELS: Record<string, string> = {
  estudiante: "Estudiante",
  acudientes: "Acudientes",
  padre: "Padre",
  madre: "Madre",
  otro: "Otro acudiente",
};

const WEBHOOK_BASE = "https://n8n.notasnormi.com/webhook";

interface Estudiante {
  id_estudiantil: number;
  nombre_estudiante: string;
  apellidos_estudiante: string;
  grado_estudiante: string;
  salon_estudiante: string;
}

interface Cita {
  id: number;
  estudiante_id: number;
  estudiante_nombre: string;
  estudiante_apellidos: string;
  estudiante_grado: string;
  estudiante_salon: string;
  fecha: string;
  hora: string | null;
  asistentes: string[];
  motivo: string;
  conclusiones: string | null;
  realizada: boolean;
  autor_id: string;
  autor_nombre: string;
  created_at: string;
}

const fmtFecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

// Devuelve un Date con año/mes/día = HOY según la zona horaria de Bogotá,
// independientemente de la zona horaria del navegador.
const hoyBogota = (): Date => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtHora = (h: string | null) => {
  if (!h) return "";
  const [hh, mm] = h.split(":");
  const d = new Date();
  d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
  return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });
};

const Citas = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [autor, setAutor] = useState<{ id: string; nombre: string }>({ id: "", nombre: "" });
  const [mesActual, setMesActual] = useState<Date>(() => hoyBogota());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | undefined>(() => hoyBogota());
  const [eliminarId, setEliminarId] = useState<number | null>(null);
  const [eliminando, setEliminando] = useState(false);

  // Modal nueva cita
  const [showNueva, setShowNueva] = useState(false);
  const [estBusqueda, setEstBusqueda] = useState("");
  const [estSeleccionado, setEstSeleccionado] = useState<Estudiante | null>(null);
  const [fecha, setFecha] = useState<Date | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);
  const [horaH, setHoraH] = useState("");
  const [horaM, setHoraM] = useState("");
  const [horaAP, setHoraAP] = useState("");
  const [asistentes, setAsistentes] = useState<string[]>([]);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const backLink = isAdmin() ? "/dashboard-admin" : "/dashboard-rector";

  useEffect(() => {
    const session = getSession();
    if (!session.id || (!isOrientador() && !isAdmin())) { navigate("/"); return; }
    setAutor({ id: session.id, nombre: `${session.nombres || ""} ${session.apellidos || ""}`.trim() });
    Promise.all([
      supabase.from("Citas_Orientacion").select("*").order("fecha", { ascending: false }).order("hora", { ascending: false }),
      supabase.from("Estudiantes").select("id_estudiantil, nombre_estudiante, apellidos_estudiante, grado_estudiante, salon_estudiante").order("apellidos_estudiante"),
    ]).then(([cR, eR]) => {
      setCitas(cR.data || []);
      setEstudiantes(eR.data || []);
      setLoading(false);
    });
  }, [navigate]);

  // Si la URL trae ?estudianteId=X (ej: vienen de Remisiones a Orientación → Agendar cita),
  // abre el modal con ese estudiante pre-seleccionado.
  useEffect(() => {
    const estId = searchParams.get("estudianteId");
    if (!estId || estudiantes.length === 0) return;
    const est = estudiantes.find(e => String(e.id_estudiantil) === estId);
    if (est) {
      setEstSeleccionado(est);
      setShowNueva(true);
    }
    setSearchParams({}, { replace: true });
  }, [estudiantes, searchParams, setSearchParams]);

  const recargarCitas = async () => {
    const { data } = await supabase.from("Citas_Orientacion").select("*").order("fecha", { ascending: false }).order("hora", { ascending: false });
    setCitas(data || []);
  };

  const gradosUnicos = useMemo(() =>
    [...new Set(citas.map(c => c.estudiante_grado))].sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99))
  , [citas]);
  const salonesUnicos = useMemo(() => [...new Set(
    citas.filter(c => !filtroGrado || c.estudiante_grado === filtroGrado).map(c => c.estudiante_salon)
  )].sort(), [citas, filtroGrado]);

  const citasFiltradas = useMemo(() => {
    return citas.filter(c => {
      if (filtroGrado && c.estudiante_grado !== filtroGrado) return false;
      if (filtroSalon && c.estudiante_salon !== filtroSalon) return false;
      return true;
    });
  }, [citas, filtroGrado, filtroSalon]);

  const estudiantesBusqueda = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = norm(estBusqueda.trim());
    if (!q || q.length < 2) return [] as Estudiante[];
    const tokens = q.split(/\s+/).filter(Boolean);
    return estudiantes.filter(e => {
      const full = norm(`${e.nombre_estudiante} ${e.apellidos_estudiante}`);
      return tokens.every(t => full.includes(t));
    }).slice(0, 8);
  }, [estudiantes, estBusqueda]);

  const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const toggleAsistente = (v: string) => {
    setAsistentes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  };

  // Convierte el horario 12h (H,MM,AM/PM) → "HH:MM" 24h para guardar en la DB
  const hora12to24 = (h: string, m: string, ap: string): string | null => {
    if (!h || !m || !ap) return null;
    let hh = parseInt(h, 10);
    if (ap === "AM" && hh === 12) hh = 0;
    else if (ap === "PM" && hh < 12) hh += 12;
    return `${String(hh).padStart(2, "0")}:${m}`;
  };

  const handleAgendar = async () => {
    if (!estSeleccionado || !fecha || asistentes.length === 0 || !motivo.trim()) return;
    setGuardando(true);
    const horaSave = hora12to24(horaH, horaM, horaAP);
    const payload: any = {
      estudiante_id: estSeleccionado.id_estudiantil,
      estudiante_nombre: estSeleccionado.nombre_estudiante,
      estudiante_apellidos: estSeleccionado.apellidos_estudiante,
      estudiante_grado: estSeleccionado.grado_estudiante,
      estudiante_salon: estSeleccionado.salon_estudiante,
      fecha: fmtLocal(fecha),
      hora: horaSave,
      asistentes,
      motivo: motivo.trim(),
      autor_id: autor.id,
      autor_nombre: autor.nombre,
    };
    const { error } = await supabase.from("Citas_Orientacion").insert(payload);
    if (error) {
      console.error("Insert cita:", error);
      setGuardando(false);
      return;
    }

    // Notificar por WhatsApp a los seleccionados en "Informar a"
    try {
      const session = getSession();
      const remitente = [session.cargo, session.nombres, session.apellidos].filter(Boolean).join(" ");
      const fechaTexto = fecha.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const horaTexto = horaSave ? `${horaH}:${horaM} ${horaAP}` : "por definir";
      const incEst = asistentes.includes("estudiante");
      const incAcu = asistentes.includes("acudientes");
      const estLabel = `${estSeleccionado.nombre_estudiante} ${estSeleccionado.apellidos_estudiante} (${estSeleccionado.grado_estudiante} ${estSeleccionado.salon_estudiante})`;
      let intro = "";
      let destinatarios = "";
      if (incEst && incAcu) {
        intro = `Se ha agendado una cita de orientación escolar con ${estLabel} y sus acudientes.`;
        destinatarios = `Estudiante y padres del estudiante con id ${estSeleccionado.id_estudiantil}`;
      } else if (incEst) {
        intro = `Se ha agendado una cita de orientación escolar contigo.`;
        destinatarios = `Estudiante con id ${estSeleccionado.id_estudiantil}`;
      } else if (incAcu) {
        intro = `Se ha agendado una cita de orientación escolar con usted, acudiente de ${estLabel}.`;
        destinatarios = `Padres del estudiante con id ${estSeleccionado.id_estudiantil}`;
      }
      const motivoTrim = motivo.trim();
      const motivoConPunto = /[.!?]$/.test(motivoTrim) ? motivoTrim : `${motivoTrim}.`;
      const mensaje = `${intro}\n\nFecha: ${fechaTexto}.\nHora: ${horaTexto}.\nMotivo: ${motivoConPunto}`;
      if (destinatarios) {
        // Esta página solo la usan Orientador(a) Escolar y Administrador,
        // así que siempre vamos por el workflow regular "Enviar Comunicado".
        fetch(`${WEBHOOK_BASE}/enviar-comunicado`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            remitente,
            destinatarios,
            mensaje,
            id_remitente: session.id,
          }),
        }).catch(e => console.error("Webhook cita:", e));
      }
    } catch (e) {
      console.error("Notificación cita:", e);
    }

    setShowNueva(false);
    setEstSeleccionado(null); setEstBusqueda("");
    setFecha(undefined);
    setHoraH(""); setHoraM(""); setHoraAP("");
    setAsistentes([]); setMotivo("");
    await recargarCitas();
    setGuardando(false);
  };

  const asistentesLabel = (vals: string[]) => vals.map(v => ASISTENTES_LABELS[v] || v).join(", ");

  const handleEliminar = async () => {
    if (eliminarId == null) return;
    setEliminando(true);
    const { error } = await supabase.from("Citas_Orientacion").delete().eq("id", eliminarId);
    if (error) {
      console.error("Delete cita:", error);
    } else {
      setEliminarId(null);
      await recargarCitas();
    }
    setEliminando(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Citas y Atención</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <img src={iconCitas} alt="" className="h-6 w-6 object-contain" /> Citas y Atención
            </h2>
            <button onClick={() => setShowNueva(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer">
              <Plus className="w-4 h-4" /> Agendar cita
            </button>
          </div>

          {loading ? <div className="text-center py-8 text-muted-foreground">Cargando...</div> : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={filtroGrado} onChange={(e) => { setFiltroGrado(e.target.value); setFiltroSalon(""); }} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los grados</option>
                  {gradosUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={filtroSalon} onChange={(e) => setFiltroSalon(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los salones</option>
                  {salonesUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {(() => {
                // Mapa fecha → citas (de las filtradas)
                const citasPorFecha: Record<string, Cita[]> = {};
                for (const c of citasFiltradas) {
                  if (!citasPorFecha[c.fecha]) citasPorFecha[c.fecha] = [];
                  citasPorFecha[c.fecha].push(c);
                }
                const diasConCitas = Object.keys(citasPorFecha).map(k => {
                  const [y, m, d] = k.split("-").map(Number);
                  return new Date(y, m - 1, d);
                });
                const citasDelDia = diaSeleccionado ? (citasPorFecha[fechaKey(diaSeleccionado)] || []) : [];
                const haySeleccion = !!diaSeleccionado;

                return (
                  <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                    {/* Calendario */}
                    <div className="flex flex-col items-center lg:sticky lg:top-4 shrink-0">
                      <Calendar
                        mode="single"
                        selected={diaSeleccionado}
                        onSelect={setDiaSeleccionado}
                        month={mesActual}
                        onMonthChange={setMesActual}
                        locale={es}
                        modifiers={{ conCita: diasConCitas }}
                        modifiersClassNames={{ conCita: "bg-violet-400 text-white hover:bg-violet-500 !h-8 !w-8" }}
                        className="rounded-md border shadow-sm"
                      />
                      <p className="mt-3 text-xs text-muted-foreground text-center">
                        Días con citas resaltados en violeta
                      </p>
                    </div>

                    {/* Panel lateral con citas del día seleccionado */}
                    <div className="flex-1 min-w-0 lg:max-h-[600px] lg:overflow-y-auto">
                      {!haySeleccion ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                          <p>Selecciona un día en el calendario</p>
                        </div>
                      ) : citasDelDia.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <p className="font-medium text-foreground mb-1">{fmtFecha(fechaKey(diaSeleccionado!))}</p>
                          <p className="text-sm">No hay citas agendadas este día.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <h3 className="text-lg font-bold text-violet-700 border-b-2 border-violet-200 pb-2">
                            {fmtFecha(fechaKey(diaSeleccionado!))} · {citasDelDia.length} {citasDelDia.length === 1 ? "cita" : "citas"}
                          </h3>
                          {citasDelDia
                            .slice()
                            .sort((a, b) => (a.hora || "99:99").localeCompare(b.hora || "99:99"))
                            .map(c => {
                              const isExp = expandedId === c.id;
                              return (
                                <div key={c.id} className="border border-border rounded-lg overflow-hidden">
                                  <div className="flex items-stretch hover:bg-muted/30 transition-colors">
                                    <button onClick={() => setExpandedId(isExp ? null : c.id)} className="flex-1 flex items-center justify-between p-4 text-left cursor-pointer">
                                      <div>
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 rounded-full">{c.estudiante_grado} {c.estudiante_salon}</span>
                                        </div>
                                        <p className="font-semibold text-foreground text-sm">{c.estudiante_apellidos} {c.estudiante_nombre}</p>
                                        <p className="text-xs text-muted-foreground">{c.hora ? fmtHora(c.hora) : "Sin hora definida"} · {asistentesLabel(c.asistentes)}</p>
                                      </div>
                                      <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${isExp ? "rotate-180" : ""}`} />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); setEliminarId(c.id); }} title="Eliminar cita" className="px-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer border-l border-border flex items-center">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                  {isExp && (
                                    <div className="border-t border-border p-4 bg-muted/10 text-sm text-foreground space-y-3">
                                      <p><span className="font-medium">Motivo:</span> {c.motivo}</p>
                                      {c.conclusiones && <p><span className="font-medium">Conclusiones:</span> {c.conclusiones}</p>}
                                      <p className="text-xs text-muted-foreground">Agendada por {c.autor_nombre}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </main>

      {/* Modal nueva cita */}
      <Dialog open={showNueva} onOpenChange={setShowNueva}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar cita</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium block mb-1">Estudiante *</label>
              {estSeleccionado ? (
                <div className="flex items-center justify-between border border-border rounded-md p-2 bg-muted/20">
                  <div>
                    <p className="text-sm font-semibold">{estSeleccionado.apellidos_estudiante} {estSeleccionado.nombre_estudiante}</p>
                    <p className="text-xs text-muted-foreground">{estSeleccionado.grado_estudiante} {estSeleccionado.salon_estudiante}</p>
                  </div>
                  <button onClick={() => { setEstSeleccionado(null); setEstBusqueda(""); }} className="text-xs text-primary hover:underline">Cambiar</button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={estBusqueda} onChange={e => setEstBusqueda(e.target.value)} placeholder="Busca por nombre o apellido..." className="w-full pl-9 pr-3 py-2 border border-input rounded-md text-sm bg-background" />
                  {estudiantesBusqueda.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-20 border border-border rounded-md max-h-48 overflow-y-auto bg-card shadow-md">
                      {estudiantesBusqueda.map(e => (
                        <button key={e.id_estudiantil} onClick={() => { setEstSeleccionado(e); setEstBusqueda(""); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-muted/50">
                          {e.apellidos_estudiante} {e.nombre_estudiante} <span className="text-xs text-muted-foreground">— {e.grado_estudiante} {e.salon_estudiante}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">Fecha *</label>
                <Popover open={calOpen} onOpenChange={setCalOpen}>
                  <PopoverTrigger asChild>
                    <button className="w-full inline-flex items-center justify-between px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                      {fecha ? fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "Selecciona"}
                      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={fecha} onSelect={(d) => { setFecha(d); setCalOpen(false); }} locale={es} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Hora (opcional)</label>
                <div className="flex items-center gap-1">
                  <select value={horaH} onChange={e => setHoraH(e.target.value)} className="px-2 py-2 border border-input rounded-md text-sm bg-background cursor-pointer outline-none">
                    <option value="">--</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={String(h)}>{h}</option>)}
                  </select>
                  <span className="text-sm">:</span>
                  <select value={horaM} onChange={e => setHoraM(e.target.value)} className="px-2 py-2 border border-input rounded-md text-sm bg-background cursor-pointer outline-none">
                    <option value="">--</option>
                    {["00","05","10","15","20","25","30","35","40","45","50","55"].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={horaAP} onChange={e => setHoraAP(e.target.value)} className="px-2 py-2 border border-input rounded-md text-sm bg-background cursor-pointer outline-none">
                    <option value="">--</option>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Informar a: *</label>
              <div className="flex flex-wrap gap-3">
                {ASISTENTES.map(a => (
                  <label key={a.value} className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleAsistente(a.value)}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${asistentes.includes(a.value) ? "bg-primary border-primary" : "border-border"}`}>
                      {asistentes.includes(a.value) && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                    </div>
                    <span className="text-sm">{a.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Motivo *</label>
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo de la cita..." className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[100px] resize-y" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowNueva(false)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">Cancelar</button>
            <button onClick={handleAgendar} disabled={guardando || !estSeleccionado || !fecha || asistentes.length === 0 || !motivo.trim()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {guardando ? "Agendando..." : "Agendar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminar cita */}
      <Dialog open={eliminarId !== null} onOpenChange={(o) => !o && setEliminarId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar cita</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            ¿Seguro que quieres eliminar esta cita? Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <button onClick={() => setEliminarId(null)} disabled={eliminando} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted disabled:opacity-50">Cancelar</button>
            <button onClick={handleEliminar} disabled={eliminando} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50">
              {eliminando ? "Eliminando..." : "Eliminar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Citas;
