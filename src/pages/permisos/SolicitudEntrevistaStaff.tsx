import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isProfesor, puedeAccederDashboard, isAdmin } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SignatureCanvas from "react-signature-canvas";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Check, ChevronDown, UserRound } from "lucide-react";
import FirmaImage from "@/components/FirmaImage";
import { es } from "date-fns/locale";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Estudiante { id: string; nombres: string; apellidos: string; grado: string; salon: string; }
interface Interno { id: number; nombres: string; apellidos: string; cargo: string; }

const GRADOS = ["Párvulo","Prejardín","Jardín","Transición","Primero","Segundo","Tercero","Cuarto","Quinto","Sexto","Séptimo","Octavo","Noveno","Décimo","Undécimo"];
const SALONES = ["1","2","3"];

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
  const [aceptoTerminos, setAceptoTerminos] = useState(false);

  // Form
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState<Estudiante | null>(null);
  const [internos, setInternos] = useState<Interno[]>([]);
  const [fechaEntrevista, setFechaEntrevista] = useState<Date | undefined>(undefined);
  const [horaH, setHoraH] = useState("");
  const [horaM, setHoraM] = useState("");
  const [horaAP, setHoraAP] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  const [cargoEntrevista, setCargoEntrevista] = useState("");
  const [internoEntrevista, setInternoEntrevista] = useState<Interno | null>(null);
  const [firma, setFirma] = useState<string | null>(null);

  // UI
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const backLink = isAdmin() ? "/dashboard-admin" : puedeAccederDashboard() ? "/dashboard-rector" : "/dashboard";
  const session = getSession();

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
  };

  const handleFirmaEnd = () => { if (sigCanvas.current && !sigCanvas.current.isEmpty()) setFirma(sigCanvas.current.toDataURL("image/png")); };
  const limpiarFirma = () => { sigCanvas.current?.clear(); setFirma(null); };

  const hoy = new Date();
  const fechaHoy = hoy.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  const horaEntrevista = `${horaH}:${horaM} ${horaAP}`;
  const cargosUnicos = [...new Set(internos.map(i => i.cargo))].sort();
  const internosFiltrados = internos.filter(i => !cargoEntrevista || i.cargo === cargoEntrevista);
  const camposCompletos = estudianteSeleccionado && fechaEntrevista && horaH && horaM && horaAP && internoEntrevista && firma;

  const handleCrear = async () => {
    if (!camposCompletos || !estudianteSeleccionado || !fechaEntrevista || !firma || !internoEntrevista) return;
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
      solicitante_nombre: [internoEntrevista.nombres, internoEntrevista.apellidos].filter(Boolean).join(" "),
      solicitante_cargo: internoEntrevista.cargo,
      solicitante_id: internoEntrevista.id,
      creado_por: Number(session.id),
      creado_por_nombre: [session.cargo, session.nombres, session.apellidos].filter(Boolean).join(" "),
      firma_url: firmaUrl,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Send notification to parent via n8n webhook
      const fechaEntrevistaTexto = fechaEntrevista.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const entrevistaConNombre = [internoEntrevista.cargo, internoEntrevista.nombres, internoEntrevista.apellidos].filter(Boolean).join(" ");
      const mensaje = `Se le informa que se ha solicitado una entrevista para el acudiente del estudiante ${estudianteSeleccionado.nombres} ${estudianteSeleccionado.apellidos} de ${estudianteSeleccionado.grado} ${estudianteSeleccionado.salon}.\n\nFecha: ${fechaEntrevistaTexto}\nHora: ${horaEntrevista}\nCon: ${entrevistaConNombre}\n\nPor favor ingrese a notasnormi.com → Permisos y Excusas → Solicitud de Entrevista, busque el día indicado, haga click sobre la citación y confirme su asistencia.`;
      const remitente = [session.cargo, session.nombres, session.apellidos].filter(Boolean).join(" ");
      const cargo = session.cargo || "";
      const webhookUrl = ["Rector", "Coordinador(a)"].includes(cargo)
        ? "https://n8n.notasnormi.com/webhook/enviar-comunicado-rector-coordinadores"
        : "https://n8n.notasnormi.com/webhook/enviar-comunicado";
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remitente,
          destinatarios: `Padre del estudiante con id ${estudianteSeleccionado.id}`,
          mensaje,
          id_remitente: session.id,
          perfil: "Acudiente",
          id: String(estudianteSeleccionado.id),
        }),
      }).then(r => console.log("Webhook sent:", r.status)).catch(e => console.error("Webhook error:", e));

      toast({ title: "Solicitud creada", description: "La solicitud de entrevista fue registrada y se notificó al acudiente." });
      setGrado(""); setSalon(""); setEstudianteSeleccionado(null); setFechaEntrevista(undefined);
      setHoraH(""); setHoraM(""); setHoraAP(""); setCargoEntrevista(""); setInternoEntrevista(null);
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
            <button onClick={() => navigate("/permisos-excusas")} className="text-primary hover:underline">Permisos y Excusas</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Solicitud de Entrevista</span>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("crear")} className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${tab === "crear" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>Crear solicitud</button>
          <button onClick={() => setTab("historial")} className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${tab === "historial" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>Solicitudes creadas</button>
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
                    {GRADOS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Salón:</label>
                  <select value={salon} onChange={(e) => setSalon(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                    <option value="">Seleccionar</option>
                    {SALONES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Estudiante */}
              <p>
                PADRE/MADRE O ACUDIENTE DEL ESTUDIANTE: {" "}
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
                {" "} para una entrevista con el/la {" "}
              </p>

              {/* Selector de cargo e interno para la entrevista */}
              <div className="flex flex-wrap gap-3 ml-4">
                <select value={cargoEntrevista} onChange={e => { setCargoEntrevista(e.target.value); setInternoEntrevista(null); }}
                  className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Cargo</option>
                  {cargosUnicos.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={internoEntrevista ? String(internoEntrevista.id) : ""} onChange={e => setInternoEntrevista(internosFiltrados.find(i => String(i.id) === e.target.value) || null)}
                  className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer min-w-[200px]">
                  <option value="">Seleccionar</option>
                  {internosFiltrados.map(i => <option key={i.id} value={String(i.id)}>{i.apellidos} {i.nombres}</option>)}
                </select>
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
                          <p className="font-bold text-center">SOLICITUD DE ENTREVISTA CON PADRES DE FAMILIA</p>
                          <p>Fecha de solicitud: <span className="text-primary font-medium">{fmtFecha(s.fecha_solicitud)}</span></p>
                          <p>Estudiante: <span className="text-primary font-medium">{s.estudiante_nombre} {s.estudiante_apellidos}</span> — {s.estudiante_grado} {s.estudiante_salon}</p>
                          <p>Entrevista el día: <span className="text-primary font-medium">{fmtFecha(s.fecha_entrevista)}</span> a las <span className="text-primary font-medium">{s.hora_entrevista}</span></p>
                          <p>Entrevista con: <span className="text-primary font-medium">{s.solicitante_cargo} {s.solicitante_nombre}</span></p>
                          {s.creado_por_nombre && <p>Creado por: <span className="text-primary font-medium">{s.creado_por_nombre}</span></p>}
                          {s.firma_url && <div><p className="font-medium mb-1">Firma:</p><FirmaImage url={s.firma_url} /></div>}
                          {s.observaciones_padre && <p>Observaciones del padre: <span className="text-primary font-medium">{s.observaciones_padre}</span></p>}
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
