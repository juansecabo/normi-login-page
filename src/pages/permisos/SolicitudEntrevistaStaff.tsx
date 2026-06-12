import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isProfesor, puedeAccederDashboard, isAdmin } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SignatureCanvas from "react-signature-canvas";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Check, ChevronDown, UserRound, Plus, X } from "lucide-react";
import FirmaImage from "@/components/FirmaImage";
import { apiRequest } from "@/lib/apiClient";
import { joinEntrevistadores, entrevistadoresDeSolicitud } from "@/lib/entrevistadores";
import { useGradosColegio } from "@/utils/grados";
import { es } from "date-fns/locale";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Estudiante { id: string; nombres: string; apellidos: string; grado: string; salon: string; }
interface Interno { id: number; nombres: string; apellidos: string; cargo: string; }


const cargoDisplay = (cargo: string, nombres: string) => {
  const nombre = nombres.split(" ")[0];
  const femeninos = ["Coordinador(a)","Secretaria General"];
  if (cargo === "Rector") return `Rector ${nombres}`;
  if (cargo === "Coordinador(a)") return `Coordinador(a) ${nombres}`;
  if (cargo === "Profesor(a)") return `Profesor(a) ${nombres}`;
  return `${cargo} ${nombres}`;
};


type Tab = "crear" | "historial";

const SolicitudEntrevistaStaff = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sigCanvas = useRef<SignatureCanvas>(null);

  const [tab, setTab] = useState<Tab>("crear");
  // Respuestas de acudientes aún no vistas (numerito sobre "Solicitudes creadas")
  const [respuestasNuevas, setRespuestasNuevas] = useState(0);
  const [aceptoTerminos, setAceptoTerminos] = useState(false);

  // Form
  const { grados: gradosColegio } = useGradosColegio();
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  // Salones reales del grado elegido (cada colegio tiene distinta cantidad).
  const [salonesDelGrado, setSalonesDelGrado] = useState<string[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState<Estudiante | null>(null);
  const [internos, setInternos] = useState<Interno[]>([]);
  const [fechaEntrevista, setFechaEntrevista] = useState<Date | undefined>(undefined);
  const [horaH, setHoraH] = useState("");
  const [horaM, setHoraM] = useState("");
  const [horaAP, setHoraAP] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  const [cargoEntrevista, setCargoEntrevista] = useState("");
  const [internoPick, setInternoPick] = useState<Interno | null>(null);
  const [entrevistadores, setEntrevistadores] = useState<Interno[]>([]);
  const [firma, setFirma] = useState<string | null>(null);

  // UI
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const backLink = isAdmin() ? "/dashboard-admin" : puedeAccederDashboard() ? "/dashboard-rector" : "/dashboard";
  const session = getSession();

  // Contador para el numerito del tab "Solicitudes creadas"
  useEffect(() => {
    if (!session.id) return;
    supabase.from("Solicitudes_Entrevista")
      .select("*", { count: "exact", head: true })
      .eq("creado_por", session.id)
      .eq("respuesta_vista", false)
      .then(({ count }) => setRespuestasNuevas(count ?? 0));
  }, []);

  useEffect(() => {
    if (!session.id || (!isProfesor() && !puedeAccederDashboard() && !isAdmin())) { navigate("/"); return; }
    // Fetch internos for the "entrevista con" dropdown
    (async () => {
      // Fase 10.E.19: nombres/apellidos viven en Usuarios.
      const { data } = await supabase.from("Internos").select("id, cargo");
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      setInternos(sortByApellidosNombres(await enrichWithNombres((data || []) as any)) as any);
    })();
  }, [navigate]);

  // Salones que existen de verdad para el grado elegido (de Estudiantes del colegio)
  useEffect(() => {
    if (!grado) { setSalonesDelGrado([]); return; }
    (async () => {
      const { data } = await supabase.from("Estudiantes").select("salon").eq("grado", grado);
      const set = new Set<string>();
      for (const r of (data || []) as { salon: string | null }[]) if (r.salon) set.add(String(r.salon));
      setSalonesDelGrado([...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    })();
  }, [grado]);

  // Fetch students when grado/salon changes
  useEffect(() => {
    if (!grado || !salon) { setEstudiantes([]); setEstudianteSeleccionado(null); return; }
    (async () => {
      const { data } = await supabase.from("Estudiantes").select("id, grado, salon")
        .eq("grado", grado).eq("salon", salon);
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      setEstudiantes(sortByApellidosNombres(await enrichWithNombres((data || []) as any)) as any);
      setEstudianteSeleccionado(null);
    })();
  }, [grado, salon]);

  useEffect(() => { if (tab === "historial") fetchHistorial(); }, [tab]);

  const fetchHistorial = async () => {
    setLoadingHistorial(true);
    const { data } = await supabase.from("Solicitudes_Entrevista").select("*")
      .eq("creado_por", session.id).order("created_at", { ascending: false });
    setHistorial(data || []);
    setLoadingHistorial(false);
    // Ver el historial apaga el numerito del dashboard (respuestas ya vistas).
    supabase.from("Solicitudes_Entrevista").update({ respuesta_vista: true })
      .eq("creado_por", session.id).eq("respuesta_vista", false)
      .then(() => {}, () => {});
  };

  const handleFirmaEnd = () => { if (sigCanvas.current && !sigCanvas.current.isEmpty()) setFirma(sigCanvas.current.toDataURL("image/png")); };
  const limpiarFirma = () => { sigCanvas.current?.clear(); setFirma(null); };

  const hoy = new Date();
  const fechaHoy = hoy.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  const horaEntrevista = `${horaH}:${horaM} ${horaAP}`;
  const cargosUnicos = [...new Set(internos.map(i => i.cargo))].sort();
  const internosFiltrados = internos.filter(i => !cargoEntrevista || i.cargo === cargoEntrevista);
  const camposCompletos = estudianteSeleccionado && fechaEntrevista && horaH && horaM && horaAP && entrevistadores.length > 0 && firma;

  const agregarEntrevistador = () => {
    if (!internoPick || entrevistadores.some(e => e.id === internoPick.id)) return;
    setEntrevistadores(prev => [...prev, internoPick]);
    setCargoEntrevista(""); setInternoPick(null);
  };
  const quitarEntrevistador = (id: number) => setEntrevistadores(prev => prev.filter(e => e.id !== id));

  const handleCrear = async () => {
    if (!camposCompletos || !estudianteSeleccionado || !fechaEntrevista || !firma || entrevistadores.length === 0) return;
    setSaving(true);

    let firmaUrl: string | null = null;
    try {
      const base64Data = firma.split(",")[1];
      const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `firmas/${Date.now()}_${session.id}_entrevista.png`;
      const { error: uploadErr } = await supabase.storage.from("normi-archivos").upload(fileName, byteArray, { contentType: "image/png" });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("normi-archivos").getPublicUrl(fileName);
      firmaUrl = urlData?.publicUrl || null;
    } catch (err: any) {
      toast({ title: "Error", description: "No se pudo subir la firma: " + err.message, variant: "destructive" });
      setSaving(false); return;
    }

    const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const sessionNombre = [session.nombres, session.apellidos].filter(Boolean).join(" ");

    const { error } = await supabase.from("Solicitudes_Entrevista").insert({
      fecha_solicitud: fmtLocal(hoy),
      fecha_entrevista: fmtLocal(fechaEntrevista),
      hora_entrevista: horaEntrevista,
      estudiante_nombre: estudianteSeleccionado.nombres,
      estudiante_apellidos: estudianteSeleccionado.apellidos,
      estudiante_grado: estudianteSeleccionado.grado,
      estudiante_salon: estudianteSeleccionado.salon,
      solicitante_nombre: [entrevistadores[0].nombres, entrevistadores[0].apellidos].filter(Boolean).join(" "),
      solicitante_cargo: entrevistadores[0].cargo,
      solicitante_id: entrevistadores[0].id,
      entrevistadores: entrevistadores.map(e => ({ id: e.id, cargo: e.cargo, nombres: e.nombres, apellidos: e.apellidos })),
      creado_por: Number(session.id),
      creado_por_nombre: [session.cargo, session.nombres, session.apellidos].filter(Boolean).join(" "),
      firma_url: firmaUrl,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Notificar al acudiente del estudiante vía server (multi-tenant via JWT).
      // El remitente lo arma el server según el rol del usuario logueado.
      const fechaEntrevistaTexto = fechaEntrevista.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const entrevistaConNombre = joinEntrevistadores(entrevistadores);
      const mensaje = `Se le informa que se ha solicitado una entrevista para el acudiente del estudiante ${estudianteSeleccionado.nombres} ${estudianteSeleccionado.apellidos} de ${estudianteSeleccionado.grado} ${estudianteSeleccionado.salon}.\n\nFecha: ${fechaEntrevistaTexto}\nHora: ${horaEntrevista}\nCon: ${entrevistaConNombre}\n\nPor favor ingrese a notasnormi.com y en el inicio haga click en la ficha "Solicitud de Entrevista", busque el día indicado, haga click sobre la citación y confirme su asistencia.`;
      apiRequest('/api/comunicados/enviar', {
        method: 'POST',
        body: JSON.stringify({
          destinatarios_label: `Acudiente del estudiante con id ${estudianteSeleccionado.id}`,
          mensaje,
          segmentos: [{ perfil: ["Acudientes"], id_destinatarios: [String(estudianteSeleccionado.id)] }],
        }),
      }).catch(e => console.error("Notificación entrevista error:", e));

      toast({ title: "Solicitud creada", description: "La solicitud de entrevista fue registrada y se notificó al acudiente." });
      setGrado(""); setSalon(""); setEstudianteSeleccionado(null); setFechaEntrevista(undefined);
      setHoraH(""); setHoraM(""); setHoraAP(""); setCargoEntrevista(""); setInternoPick(null); setEntrevistadores([]);
      setFirma(null); sigCanvas.current?.clear(); setAceptoTerminos(false);
    }
    setSaving(false); setShowConfirm(false);
  };

  const fmtFecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Solicitud de Entrevista</span>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("crear")} className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${tab === "crear" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>Crear solicitud</button>
          <button onClick={() => { setTab("historial"); setRespuestasNuevas(0); }} className={`relative px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${tab === "historial" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
            Solicitudes creadas
            {respuestasNuevas > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-sm z-10">
                {respuestasNuevas}
              </span>
            )}
          </button>
        </div>

        {tab === "crear" && (
          <div className="bg-card rounded-lg shadow-soft p-6">
            <div className="text-sm text-foreground leading-relaxed space-y-4">
              {/* Fecha, Grado, Jornada */}
              <p>FECHA: <span className="text-primary font-medium">{fechaHoy}</span> &nbsp;&nbsp; JORNADA MATINAL</p>

              <div className="flex flex-wrap gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Grado:</label>
                  <select value={grado} onChange={(e) => { setGrado(e.target.value); setSalon(""); }} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                    <option value="">Seleccionar</option>
                    {gradosColegio.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Salón:</label>
                  <select value={salon} onChange={(e) => setSalon(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                    <option value="">Seleccionar</option>
                    {salonesDelGrado.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Estudiante */}
              <p>
                ACUDIENTE DEL ESTUDIANTE: {" "}
                <select value={String(estudianteSeleccionado?.id || "")} onChange={(e) => setEstudianteSeleccionado(estudiantes.find(est => String(est.id) === e.target.value) || null)}
                  className="inline px-2 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm min-w-[200px] cursor-pointer outline-none">
                  <option value="">Seleccionar</option>
                  {estudiantes.map(e => <option key={e.id} value={String(e.id)}>{e.apellidos} {e.nombres}</option>)}
                </select>
              </p>

              <p>Cordial Saludo,</p>

              {/* Fecha, hora y entrevista con */}
              <p>
                Por este medio nos permitimos solicitar su presencia en el colegio el día {" "}
                <Popover open={calOpen} onOpenChange={setCalOpen}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 px-3 py-1.5 border-b-2 border-primary/40 text-primary font-medium bg-transparent hover:bg-accent rounded cursor-pointer min-w-[180px]">
                      {fechaEntrevista ? fechaEntrevista.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "Seleccionar fecha"}
                      <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={fechaEntrevista} onSelect={(d) => { setFechaEntrevista(d); setCalOpen(false); }} locale={es} disabled={(d) => d < new Date()} />
                  </PopoverContent>
                </Popover>
                {" "} Hora: {" "}
                <select value={horaH} onChange={e => setHoraH(e.target.value)} className="inline px-1 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm cursor-pointer outline-none">
                  <option value="">--</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={String(h)}>{h}</option>)}
                </select>
                {" : "}
                <select value={horaM} onChange={e => setHoraM(e.target.value)} className="inline px-1 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm cursor-pointer outline-none">
                  <option value="">--</option>
                  {["00","05","10","15","20","25","30","35","40","45","50","55"].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                {" "}
                <select value={horaAP} onChange={e => setHoraAP(e.target.value)} className="inline px-1 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm cursor-pointer outline-none">
                  <option value="">--</option>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
                {" "} para una entrevista con {" "}
                <span className="text-primary font-medium">
                  {entrevistadores.length > 0 ? joinEntrevistadores(entrevistadores, "el/la ") : "el/la…"}
                </span>
              </p>

              {/* Entrevistadores: chips elegidos + selector con botón + para agregar varios */}
              <div className="ml-4 space-y-2">
                {entrevistadores.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {entrevistadores.map(e => (
                      <span key={e.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                        {e.cargo} {e.nombres} {e.apellidos}
                        <button type="button" onClick={() => quitarEntrevistador(e.id)} className="text-primary/70 hover:text-primary cursor-pointer" title="Quitar">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 items-center">
                  <select value={cargoEntrevista} onChange={e => { setCargoEntrevista(e.target.value); setInternoPick(null); }}
                    className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                    <option value="">Cargo</option>
                    {cargosUnicos.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={internoPick ? String(internoPick.id) : ""} onChange={e => setInternoPick(internosFiltrados.find(i => String(i.id) === e.target.value) || null)}
                    className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer min-w-[200px]">
                    <option value="">Seleccionar</option>
                    {internosFiltrados.map(i => <option key={i.id} value={String(i.id)}>{i.apellidos} {i.nombres}</option>)}
                  </select>
                  <button type="button" onClick={agregarEntrevistador} disabled={!internoPick}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                    <Plus className="w-4 h-4" /> Agregar
                  </button>
                </div>
              </div>
              <p>Agradecemos su atención y cumplimiento.</p>
              <p>Atentamente,</p>

              {/* Nombre y cargo del solicitante (quien está logueado) */}
              <p className="text-primary font-medium">{session.cargo} {[session.nombres, session.apellidos].filter(Boolean).join(" ")}</p>

              {/* Firma */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Firma del solicitante</label>
                <div className="border-2 border-dashed border-border rounded-lg bg-white">
                  <SignatureCanvas ref={sigCanvas} penColor="black" canvasProps={{ className: "w-full", style: { width: "100%", height: "160px" } }} onEnd={handleFirmaEnd} />
                </div>
                <div className="flex gap-2 items-center">
                  <button type="button" onClick={limpiarFirma} className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:bg-accent cursor-pointer">Limpiar firma</button>
                  {firma && <span className="text-xs text-green-600 font-medium">✓ Firmado</span>}
                </div>
              </div>

              <button onClick={() => setShowConfirm(true)} disabled={!camposCompletos || saving}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-bold text-base transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                {saving ? "Creando..." : "Solicitar Entrevista"}
              </button>
            </div>
          </div>
        )}

        {tab === "historial" && (
          <div className="bg-card rounded-lg shadow-soft p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">Solicitudes creadas</h3>
            {loadingHistorial ? <p className="text-muted-foreground text-center py-8">Cargando...</p>
            : historial.length === 0 ? <p className="text-muted-foreground text-center py-8">No hay solicitudes registradas</p>
            : (
              <div className="space-y-3">
                {historial.map(s => {
                  const isExp = expandedId === s.id;
                  return (
                    <div key={s.id} className="border border-border rounded-lg overflow-hidden">
                      <button onClick={() => setExpandedId(isExp ? null : s.id)} className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer">
                        <div>
                          <p className="font-semibold text-foreground text-base">{s.estudiante_apellidos} {s.estudiante_nombre}</p>
                          <p className="text-sm text-muted-foreground">{s.estudiante_grado} {s.estudiante_salon} — Entrevista: {fmtFecha(s.fecha_entrevista)} a las {s.hora_entrevista}</p>
                          <p className="text-lg font-bold mt-1">{s.confirmado === true ? <span className="text-green-600">✓ Asistirá</span> : s.confirmado === false ? <span className="text-red-600">✗ No asistirá</span> : <span className="text-amber-600">Pendiente</span>}</p>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${isExp ? "rotate-180" : ""}`} />
                      </button>
                      {isExp && (
                        <div className="border-t border-border p-4 bg-muted/10 text-sm text-foreground leading-relaxed space-y-2">
                          <p className="font-bold text-center">SOLICITUD DE ENTREVISTA CON ACUDIENTES</p>
                          <p>Fecha de solicitud: <span className="text-primary font-medium">{fmtFecha(s.fecha_solicitud)}</span></p>
                          <p>Estudiante: <span className="text-primary font-medium">{s.estudiante_nombre} {s.estudiante_apellidos}</span> — {s.estudiante_grado} {s.estudiante_salon}</p>
                          <p>Entrevista el día: <span className="text-primary font-medium">{fmtFecha(s.fecha_entrevista)}</span> a las <span className="text-primary font-medium">{s.hora_entrevista}</span></p>
                          <p>Entrevista con: <span className="text-primary font-medium">{entrevistadoresDeSolicitud(s, "el/la ")}</span></p>
                          {s.creado_por_nombre && <p>Creado por: <span className="text-primary font-medium">{s.creado_por_nombre}</span></p>}
                          {s.firma_url && <div><p className="font-medium mb-1">Firma:</p><FirmaImage url={s.firma_url} /></div>}
                          {s.observaciones_padre && <p>Observaciones del acudiente: <span className="text-primary font-medium">{s.observaciones_padre}</span></p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar solicitud</AlertDialogTitle>
            <AlertDialogDescription>¿Está seguro de que desea enviar esta solicitud de entrevista?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCrear} className="cursor-pointer">{saving ? "Creando..." : "Sí, solicitar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SolicitudEntrevistaStaff;
