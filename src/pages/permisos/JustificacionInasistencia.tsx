import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isPadreDeFamilia, HijoData } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SignatureCanvas from "react-signature-canvas";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Check, ChevronDown, Paperclip, X, Eye, Download, Camera, Upload } from "lucide-react";
import { getCleanFilename, handleVerArchivo, handleDescargarArchivo } from "@/utils/archivoUtils";
import { notifyRectorCoord } from "@/lib/notifyStaff";
import FirmaImage from "@/components/FirmaImage";
import { es } from "date-fns/locale";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Tab = "crear" | "historial";

const MOTIVOS = [
  { value: "enfermedad", label: "Enfermedad" },
  { value: "cita_medica", label: "Cita médica" },
  { value: "calamidad_familiar", label: "Calamidad familiar" },
  { value: "diligencia_personal", label: "Diligencia personal" },
  { value: "actividad_institucional", label: "Actividad institucional" },
  { value: "otro", label: "Otro" },
];

const JustificacionInasistencia = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sigCanvas = useRef<SignatureCanvas>(null);

  const [tab, setTab] = useState<Tab>("crear");
  const [aceptoTerminos, setAceptoTerminos] = useState(false);

  // Form
  const [tipoRango, setTipoRango] = useState<"1dia" | "rango" | "">("");
  const [fechaUnica, setFechaUnica] = useState<Date | undefined>(undefined);
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(undefined);
  const [fechaFin, setFechaFin] = useState<Date | undefined>(undefined);
  const [calOpen1, setCalOpen1] = useState(false);
  const [calOpen2, setCalOpen2] = useState(false);
  const [calOpenUnica, setCalOpenUnica] = useState(false);
  const [hijoSeleccionado, setHijoSeleccionado] = useState<HijoData | null>(null);
  const [motivoTipo, setMotivoTipo] = useState("");
  const [motivoOtro, setMotivoOtro] = useState("");
  const [motivoDescripcion, setMotivoDescripcion] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  const [archivos, setArchivos] = useState<File[]>([]);

  // Session
  const [hijos, setHijos] = useState<HijoData[]>([]);
  const [nombreAcudiente, setNombreAcudiente] = useState("");
  const [nombresAcudiente, setNombresAcudiente] = useState("");
  const [apellidosAcudiente, setApellidosAcudiente] = useState("");
  const [idAcudiente, setIdAcudiente] = useState("");
  const [telefonoAcudiente, setTelefonoAcudiente] = useState("");

  // UI
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isPadreDeFamilia()) { navigate("/"); return; }
    setNombreAcudiente([session.nombres, session.apellidos].filter(Boolean).join(" "));
    setNombresAcudiente(session.nombres || "");
    setApellidosAcudiente(session.apellidos || "");
    setIdAcudiente(session.id);
    setHijos(session.acudidos || []);
    // Tel del acudiente logueado vive en Usuarios (fuente única).
    supabase.from("Usuarios").select("numero_de_telefono").eq("id", session.id).maybeSingle()
      .then(({ data }) => { if (data?.numero_de_telefono) setTelefonoAcudiente(data.numero_de_telefono); });
  }, [navigate]);

  useEffect(() => {
    if (tab === "historial") fetchHistorial();
  }, [tab]);

  const fetchHistorial = async () => {
    setLoadingHistorial(true);
    const session = getSession();
    const { data } = await supabase.from("Justificaciones_Inasistencia").select("*")
      .eq("acudiente_id", session.id).order("fecha_inicio", { ascending: false });
    setHistorial(data || []);
    setLoadingHistorial(false);
  };

  const handleFirmaEnd = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) setFirma(sigCanvas.current.toDataURL("image/png"));
  };

  const limpiarFirma = () => { sigCanvas.current?.clear(); setFirma(null); };

  const fechaInicioFinal = tipoRango === "1dia" ? fechaUnica : fechaInicio;
  const fechaFinFinal = tipoRango === "1dia" ? fechaUnica : fechaFin;
  const diasAusente = fechaInicioFinal && fechaFinFinal
    ? Math.max(1, Math.round((fechaFinFinal.getTime() - fechaInicioFinal.getTime()) / 86400000) + 1)
    : 0;

  const camposCompletos = aceptoTerminos && tipoRango && fechaInicioFinal && fechaFinFinal && hijoSeleccionado
    && motivoTipo && motivoDescripcion.trim() && firma
    && (motivoTipo !== "otro" || motivoOtro.trim());

  const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const handleCrear = async () => {
    if (!camposCompletos || !hijoSeleccionado || !fechaInicioFinal || !fechaFinFinal || !firma) return;
    setSaving(true);

    let firmaUrl: string | null = null;
    try {
      const base64Data = firma.split(",")[1];
      const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `firmas/${Date.now()}_${idAcudiente}_inas.png`;
      const { error: uploadErr } = await supabase.storage.from("normi-archivos").upload(fileName, byteArray, { contentType: "image/png" });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("normi-archivos").getPublicUrl(fileName);
      firmaUrl = urlData?.publicUrl || null;
    } catch (err: any) {
      toast({ title: "Error", description: "No se pudo subir la firma: " + err.message, variant: "destructive" });
      setSaving(false); return;
    }

    // Upload attached files (if any) to Storage
    const archivosUrls: string[] = [];
    for (const f of archivos) {
      try {
        const cleanName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `adjuntos_justificacion/${Date.now()}_${idAcudiente}_${cleanName}`;
        const { error: upErr } = await supabase.storage.from("normi-archivos").upload(path, f, { contentType: f.type || "application/octet-stream" });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("normi-archivos").getPublicUrl(path);
        if (urlData?.publicUrl) archivosUrls.push(urlData.publicUrl);
      } catch (err: any) {
        toast({ title: "Error", description: `No se pudo subir ${f.name}: ${err.message}`, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    const hoy = new Date();
    const payload = {
      fecha_inicio: fmtLocal(fechaInicioFinal),
      fecha_fin: fmtLocal(fechaFinFinal),
      dias_ausente: diasAusente,
      ciudad_fecha: `Corozal, ${hoy.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}`,
      estudiante_nombre: hijoSeleccionado.nombre,
      estudiante_apellidos: hijoSeleccionado.apellidos,
      estudiante_grado: hijoSeleccionado.grado,
      estudiante_salon: hijoSeleccionado.salon,
      estudiante_documento: hijoSeleccionado.id,
      motivo_tipo: motivoTipo,
      motivo_otro: motivoTipo === "otro" ? motivoOtro : null,
      motivo_descripcion: motivoDescripcion,
      acudiente_nombres: nombresAcudiente,
      acudiente_apellidos: apellidosAcudiente,
      acudiente_id: idAcudiente,
      acudiente_parentesco: null,
      acudiente_telefono: telefonoAcudiente,
      firma_url: firmaUrl,
      archivos_url: archivosUrls.length > 0 ? archivosUrls : null,
    };

    const { error } = await supabase.from("Justificaciones_Inasistencia").insert(payload);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setShowSuccess(true);

      // Notificar a Rector y Coordinadores
      const motivoTexto = motivoTipo === "otro"
        ? `${motivoLabel(motivoTipo)}: ${motivoOtro}`
        : motivoLabel(motivoTipo);
      const fechasTexto = diasAusente === 1
        ? fmtFecha(payload.fecha_inicio)
        : `${fmtFecha(payload.fecha_inicio)} — ${fmtFecha(payload.fecha_fin)} (${diasAusente} días)`;
      const mensaje =
        `Nueva justificación por inasistencia registrada en la plataforma.\n\n` +
        `Estudiante: ${hijoSeleccionado.nombre} ${hijoSeleccionado.apellidos} — ${hijoSeleccionado.grado} ${hijoSeleccionado.salon} (id ${hijoSeleccionado.id}).\n` +
        `Fecha(s): ${fechasTexto}.\n` +
        `Motivo: ${motivoTexto}.\n` +
        `Descripción: ${motivoDescripcion}.\n` +
        `Acudiente: ${nombreAcudiente} (C.C. ${idAcudiente}${telefonoAcudiente ? `, tel. ${telefonoAcudiente}` : ""}).\n` +
        `Pueden revisarla en la plataforma en Permisos y Excusas.`;
      notifyRectorCoord(mensaje, "Sistema Normi (Excusas)", {
        grado: hijoSeleccionado.grado,
        salon: hijoSeleccionado.salon,
      }, "inasistencia");

      setTipoRango(""); setFechaUnica(undefined); setFechaInicio(undefined); setFechaFin(undefined);
      setHijoSeleccionado(null); setMotivoTipo(""); setMotivoOtro(""); setMotivoDescripcion("");
      setFirma(null); setArchivos([]); sigCanvas.current?.clear(); setAceptoTerminos(false);
    }
    setSaving(false); setShowConfirm(false);
  };

  const fmtFecha = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const motivoLabel = (v: string) => MOTIVOS.find(m => m.value === v)?.label || v;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard-acudiente")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/permisos-excusas")} className="text-primary hover:underline">Permisos y Excusas</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Justificación por Inasistencia</span>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("crear")} className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${tab === "crear" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
            Crear justificación
          </button>
          <button onClick={() => setTab("historial")} className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${tab === "historial" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
            Justificaciones creadas
          </button>
        </div>

        {tab === "crear" && (
          <div className="bg-card rounded-lg shadow-soft p-6">
            <p className="text-sm text-muted-foreground mb-4">
              Si su hijo(a) faltó o faltará a la institución, debe diligenciar el siguiente formato de justificación:
            </p>

            <div className="bg-muted/50 rounded-lg p-4 mb-4 border border-border">
              <h3 className="font-bold text-foreground text-center mb-3">FORMATO DE JUSTIFICACIÓN POR INASISTENCIA</h3>
              <p className="text-xs text-muted-foreground leading-relaxed text-justify">
                El acudiente justificará en forma personal o por escrito las ausencias del estudiante, máximo a las 24 horas posteriores a ellas. El estudiante está obligado a presentarse al coordinador el mismo día que se reincorpora a la institución. Si por motivo de salud o fuerza mayor, el estudiante ha fallado al colegio el día en que se hizo alguna prueba evaluativa o se ha recibido algún trabajo señalado con anterioridad, pero su ausencia ya está justificada o autorizada, el estudiante tiene derecho a presentar la prueba correspondiente en un plazo prudente que será acordado con el respectivo profesor. Cuando la ausencia sea por más de un día y por enfermedad, el estudiante está obligado a presentar certificación y/o incapacidad médica, máximo el tercer día hábil de su ausencia.
              </p>
            </div>

            <label className="flex items-start gap-3 mb-6 cursor-pointer select-none">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${aceptoTerminos ? "bg-primary border-primary" : "border-border"}`} onClick={() => setAceptoTerminos(!aceptoTerminos)}>
                {aceptoTerminos && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
              </div>
              <span className="text-sm text-foreground" onClick={() => setAceptoTerminos(!aceptoTerminos)}>
                He leído y acepto las condiciones establecidas para la justificación por inasistencia.
              </span>
            </label>

            {aceptoTerminos && <div className="space-y-5">
              {/* 1. Datos del estudiante */}
              <div className="text-sm text-foreground leading-relaxed">
                <p className="font-bold mb-3">1. Datos del estudiante</p>
                <p>
                  Nombre completo: <select value={hijoSeleccionado?.id || ""} onChange={(e) => setHijoSeleccionado(hijos.find(h => h.id === e.target.value) || null)}
                    className="inline px-2 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm min-w-[200px] cursor-pointer outline-none"
                  >
                    <option value="">Seleccionar estudiante</option>
                    {hijos.map(h => <option key={h.id} value={h.id}>{h.nombre} {h.apellidos}</option>)}
                  </select>
                  {hijoSeleccionado && <> Grado y Curso: <span className="text-primary font-medium">{hijoSeleccionado.grado} {hijoSeleccionado.salon}</span></>}
                </p>
                {hijoSeleccionado && <p className="mt-1">Documento de identidad: <span className="text-primary font-medium">{hijoSeleccionado.id}</span></p>}
              </div>

              {/* 2. Fechas de inasistencia */}
              <div className="text-sm text-foreground">
                <p className="font-bold mb-3">2. Fechas de inasistencia</p>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center gap-2 cursor-pointer" onClick={() => { setTipoRango("1dia"); setFechaInicio(undefined); setFechaFin(undefined); }}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${tipoRango === "1dia" ? "border-primary" : "border-border"}`}>
                      {tipoRango === "1dia" && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </div>
                    <span>1 día</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer" onClick={() => { setTipoRango("rango"); setFechaUnica(undefined); }}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${tipoRango === "rango" ? "border-primary" : "border-border"}`}>
                      {tipoRango === "rango" && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </div>
                    <span>Más de 1 día</span>
                  </label>
                </div>

                {tipoRango === "1dia" && (
                  <div className="flex items-center gap-2">
                    <span className="text-red-600 font-medium">Fecha de inasistencia:</span>
                    <Popover open={calOpenUnica} onOpenChange={setCalOpenUnica}>
                      <PopoverTrigger asChild>
                        <button className="inline-flex items-center gap-1 px-3 py-1.5 border-b-2 border-primary/40 text-primary font-medium bg-transparent hover:bg-accent rounded cursor-pointer min-w-[200px]">
                          {fechaUnica ? fechaUnica.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "Seleccionar fecha"}
                          <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={fechaUnica} onSelect={(d) => { setFechaUnica(d); setCalOpenUnica(false); }} locale={es} />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {tipoRango === "rango" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-red-600 font-medium">Desde:</span>
                      <Popover open={calOpen1} onOpenChange={setCalOpen1}>
                        <PopoverTrigger asChild>
                          <button className="inline-flex items-center gap-1 px-3 py-1.5 border-b-2 border-primary/40 text-primary font-medium bg-transparent hover:bg-accent rounded cursor-pointer min-w-[200px]">
                            {fechaInicio ? fechaInicio.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "Fecha inicio"}
                            <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={fechaInicio} onSelect={(d) => { setFechaInicio(d); setCalOpen1(false); }} locale={es} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-red-600 font-medium">Hasta:</span>
                      <Popover open={calOpen2} onOpenChange={setCalOpen2}>
                        <PopoverTrigger asChild>
                          <button className="inline-flex items-center gap-1 px-3 py-1.5 border-b-2 border-primary/40 text-primary font-medium bg-transparent hover:bg-accent rounded cursor-pointer min-w-[200px]">
                            {fechaFin ? fechaFin.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "Fecha fin"}
                            <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={fechaFin} onSelect={(d) => { setFechaFin(d); setCalOpen2(false); }} locale={es} disabled={(d) => fechaInicio ? d < fechaInicio : false} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {fechaInicio && fechaFin && <p className="text-xs text-muted-foreground">Número de días ausente: <span className="text-primary font-medium">{diasAusente}</span></p>}
                  </div>
                )}
              </div>

              {/* 3. Motivo */}
              <div className="text-sm text-foreground">
                <p className="font-bold mb-3">3. Motivo de la inasistencia</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  {MOTIVOS.map(m => (
                    <label key={m.value} className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setMotivoTipo(m.value)}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${motivoTipo === m.value ? "bg-primary border-primary" : "border-border"}`}>
                        {motivoTipo === m.value && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                      </div>
                      <span className="text-sm">{m.label}</span>
                    </label>
                  ))}
                </div>
                {motivoTipo === "otro" && (
                  <input type="text" value={motivoOtro} onChange={(e) => setMotivoOtro(e.target.value)} placeholder="Especifique..." className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background mb-3" />
                )}
                <p className="mb-1">Descripción del motivo:</p>
                <textarea value={motivoDescripcion} onChange={(e) => setMotivoDescripcion(e.target.value)} className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[80px] resize-y" placeholder="Describa el motivo de la inasistencia..." />
              </div>

              {/* 4. Compromiso */}
              <div className="bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground italic">
                El estudiante se compromete a ponerse al día con las actividades académicas desarrolladas durante el tiempo de ausencia.
              </div>

              {/* 5. Datos del acudiente */}
              <div className="text-sm text-foreground">
                <p className="font-bold mb-3">5. Datos del acudiente</p>
                <p>Nombre: <span className="text-primary font-medium">{nombreAcudiente}</span></p>
                <p>Documento de identidad: <span className="text-primary font-medium">{idAcudiente}</span></p>
                <p className="mt-1">Teléfono de contacto: <span className="text-primary font-medium">{telefonoAcudiente || "No disponible"}</span></p>
              </div>

              {/* Archivos adjuntos */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Archivos adjuntos</label>
                <p className="text-xs text-muted-foreground">Puedes adjuntar fotos, certificados médicos u otros soportes.</p>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(e) => {
                    setArchivos([...archivos, ...Array.from(e.target.files || [])]);
                    e.target.value = "";
                  }}
                  className="hidden"
                  id="archivos-justif-input"
                />
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    setArchivos([...archivos, ...Array.from(e.target.files || [])]);
                    e.target.value = "";
                  }}
                  className="hidden"
                  id="foto-justif-input"
                />
                <div className="flex flex-wrap gap-2">
                  <label htmlFor="foto-justif-input" className="inline-flex items-center gap-2 px-3 py-1.5 border border-dashed border-primary/40 rounded-md cursor-pointer hover:bg-accent text-sm text-primary font-medium">
                    <Camera className="w-4 h-4" /> Tomar foto
                  </label>
                  <label htmlFor="archivos-justif-input" className="inline-flex items-center gap-2 px-3 py-1.5 border border-dashed border-primary/40 rounded-md cursor-pointer hover:bg-accent text-sm text-primary font-medium">
                    <Upload className="w-4 h-4" /> Subir archivo
                  </label>
                </div>
                {archivos.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {archivos.map((f, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 bg-muted/30 border border-border rounded text-sm">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </div>
                        <button type="button" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))} className="ml-2 text-muted-foreground hover:text-destructive shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Firma */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Firma del acudiente</label>
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
                {saving ? "Creando..." : "Crear justificación"}
              </button>
            </div>}
          </div>
        )}

        {tab === "historial" && (
          <div className="bg-card rounded-lg shadow-soft p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">Justificaciones creadas</h3>
            {loadingHistorial ? (
              <p className="text-muted-foreground text-center py-8">Cargando...</p>
            ) : historial.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No hay justificaciones registradas</p>
            ) : (
              <div className="space-y-4">
                {historial.map(j => {
                  const isExp = expandedId === j.id;
                  return (
                    <div key={j.id} className="border border-border rounded-lg overflow-hidden">
                      <button onClick={() => setExpandedId(isExp ? null : j.id)} className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer">
                        <div>
                          <p className="font-semibold text-foreground">{j.estudiante_nombre} {j.estudiante_apellidos}</p>
                          <p className="text-xs text-muted-foreground">
                            {j.dias_ausente === 1 ? fmtFecha(j.fecha_inicio) : `${fmtFecha(j.fecha_inicio)} — ${fmtFecha(j.fecha_fin)} (${j.dias_ausente} días)`}
                          </p>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isExp ? "rotate-180" : ""}`} />
                      </button>
                      {isExp && (
                        <div className="border-t border-border p-4 bg-muted/10 text-sm text-foreground leading-relaxed space-y-3">
                          <p className="text-xs text-muted-foreground">Creada el {new Date(j.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                          <p className="font-bold text-center">FORMATO DE JUSTIFICACIÓN POR INASISTENCIA</p>
                          <p>{j.ciudad_fecha}</p>
                          <p><span className="font-medium">Estudiante:</span> <span className="text-primary font-medium">{j.estudiante_nombre} {j.estudiante_apellidos}</span> — <span className="text-primary font-medium">{j.estudiante_grado} {j.estudiante_salon}</span></p>
                          <p><span className="font-medium">Fecha(s):</span> <span className="text-primary font-medium">{j.dias_ausente === 1 ? fmtFecha(j.fecha_inicio) : `${fmtFecha(j.fecha_inicio)} al ${fmtFecha(j.fecha_fin)}`}</span> — <span className="text-primary font-medium">{j.dias_ausente} día(s)</span></p>
                          <p><span className="font-medium">Motivo:</span> <Check className="w-4 h-4 inline text-primary" /> {motivoLabel(j.motivo_tipo)}{j.motivo_otro ? `: ${j.motivo_otro}` : ""}</p>
                          <p><span className="font-medium">Descripción:</span> <span className="text-primary font-medium">{j.motivo_descripcion}</span></p>
                          <p className="italic text-muted-foreground">El estudiante se compromete a ponerse al día con las actividades académicas.</p>
                          <p><span className="font-medium">Acudiente:</span> <span className="text-primary font-medium">{[j.acudiente_nombres, j.acudiente_apellidos].filter(Boolean).join(" ")}</span> — C.C. <span className="text-primary font-medium">{j.acudiente_id}</span>{j.acudiente_parentesco ? ` — ${j.acudiente_parentesco}` : ""}</p>
                          <p>Teléfono: <span className="text-primary font-medium">{j.acudiente_telefono}</span></p>
                          {j.firma_url && <div><p className="font-medium mb-1">Firma:</p><FirmaImage url={j.firma_url} /></div>}
                          {j.archivos_url && j.archivos_url.length > 0 && (
                            <div className="space-y-2">
                              <p className="font-medium">Archivos adjuntos:</p>
                              {j.archivos_url.map((url: string, i: number) => (
                                <div key={i} className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm text-foreground truncate">{getCleanFilename(url)}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => handleVerArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5">
                                      <Eye className="h-4 w-4" /> Ver
                                    </button>
                                    <button onClick={() => handleDescargarArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1.5">
                                      <Download className="h-4 w-4" /> Descargar
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
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
            <AlertDialogTitle>Confirmar justificación</AlertDialogTitle>
            <AlertDialogDescription>Una vez creada la justificación, esta no se podrá eliminar. ¿Está seguro de que desea continuar?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCrear} className="cursor-pointer">{saving ? "Creando..." : "Sí, crear justificación"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSuccess} onOpenChange={setShowSuccess}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>✓ Excusa enviada</AlertDialogTitle>
            <AlertDialogDescription>
              La excusa por inasistencia fue creada y entregada con éxito. El personal del colegio recibirá la notificación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowSuccess(false)} className="cursor-pointer">Aceptar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default JustificacionInasistencia;
