import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isPadreDeFamilia, HijoData } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SignatureCanvas from "react-signature-canvas";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ChevronDown, Check, FileText, Paperclip, X, Eye, Download, Camera, Upload } from "lucide-react";
import { getCleanFilename, handleVerArchivo, handleDescargarArchivo } from "@/utils/archivoUtils";
import { notifyRectorCoord } from "@/lib/notifyStaff";
import FirmaImage from "@/components/FirmaImage";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Tab = "crear" | "historial";

const TIPOS_SALIDA = [
  { value: "motocicleta_vehiculo", label: "En su motocicleta y/o vehículo particular conduciendo el estudiante" },
  { value: "transporte", label: "Con el Sr(a) del transporte" },
  { value: "familiar", label: "Con un familiar" },
];

const fmtHora = (h: string) => {
  if (!h) return "";
  const [hh, mm] = h.split(":");
  const d = new Date();
  d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
  return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });
};

const RetiroEstudiantes = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sigCanvas = useRef<SignatureCanvas>(null);

  const [tab, setTab] = useState<Tab>("crear");
  const [aceptoTerminos, setAceptoTerminos] = useState(false);

  // Form state
  const [fecha, setFecha] = useState<Date | undefined>(undefined);
  const [horaH, setHoraH] = useState("");
  const [horaM, setHoraM] = useState("");
  const [horaAP, setHoraAP] = useState("");
  const [hijoSeleccionado, setHijoSeleccionado] = useState<HijoData | null>(null);
  const [tipoSalida, setTipoSalida] = useState("");
  const [nombrePersona, setNombrePersona] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [motivo, setMotivo] = useState("");
  const [correo, setCorreo] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  const [archivos, setArchivos] = useState<File[]>([]);

  // Session data
  const [hijos, setHijos] = useState<HijoData[]>([]);
  const [nombreAcudiente, setNombreAcudiente] = useState("");
  const [idAcudiente, setIdAcudiente] = useState("");
  const [telefonoAcudiente, setTelefonoAcudiente] = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isPadreDeFamilia()) {
      navigate("/");
      return;
    }
    setNombreAcudiente([session.nombres, session.apellidos].filter(Boolean).join(" "));
    setIdAcudiente(session.id);
    setTelefonoAcudiente(session.telefono || "");
    setHijos(session.hijos || []);
  }, [navigate]);

  useEffect(() => {
    if (tab === "historial") fetchHistorial();
  }, [tab]);

  // Fetch telefono_acudiente when hijo is selected
  useEffect(() => {
    if (!hijoSeleccionado) return;
    const fetchTelefono = async () => {
      const { data } = await supabase
        .from("Estudiantes")
        .select("telefono_acudiente")
        .eq("id_estudiantil", hijoSeleccionado.id)
        .maybeSingle();
      if (data?.telefono_acudiente?.length > 0) {
        setTelefonoAcudiente(data.telefono_acudiente[0]);
      }
    };
    fetchTelefono();
  }, [hijoSeleccionado]);

  const fetchHistorial = async () => {
    setLoadingHistorial(true);
    // Search by acudiente_identificacion (C.C.) which is always available from session
    const session = getSession();
    const { data } = await supabase
      .from("Autorizaciones_Retiro")
      .select("*")
      .eq("acudiente_identificacion", session.id)
      .order("fecha_autorizacion", { ascending: false });
    setHistorial(data || []);
    setLoadingHistorial(false);
  };

  const handleFirmaEnd = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      setFirma(sigCanvas.current.toDataURL("image/png"));
    }
  };

  const limpiarFirma = () => {
    sigCanvas.current?.clear();
    setFirma(null);
  };

  const camposCompletos =
    aceptoTerminos &&
    fecha &&
    horaH && horaM && horaAP &&
    hijoSeleccionado &&
    tipoSalida &&
    motivo.trim() &&
    firma &&
    (tipoSalida !== "familiar" || (nombrePersona.trim() && parentesco.trim())) &&
    (tipoSalida !== "transporte" || nombrePersona.trim());

  const handleCrear = async () => {
    if (!camposCompletos || !hijoSeleccionado || !fecha || !firma) return;
    setSaving(true);

    // Upload signature to Storage
    let firmaUrl: string | null = null;
    try {
      const base64Data = firma.split(",")[1];
      const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `firmas/${Date.now()}_${idAcudiente}.png`;
      const { error: uploadErr } = await supabase.storage
        .from("normi-archivos")
        .upload(fileName, byteArray, { contentType: "image/png", upsert: false });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("normi-archivos").getPublicUrl(fileName);
      firmaUrl = urlData?.publicUrl || null;
    } catch (err: any) {
      toast({ title: "Error", description: "No se pudo subir la firma: " + err.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Upload attached files (if any) to Storage
    const archivosUrls: string[] = [];
    for (const f of archivos) {
      try {
        const cleanName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `adjuntos_retiro/${Date.now()}_${idAcudiente}_${cleanName}`;
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

    // Convertir 12h+AM/PM → 24h "HH:MM" para almacenar
    let h24 = parseInt(horaH, 10);
    if (horaAP === "PM" && h24 !== 12) h24 += 12;
    if (horaAP === "AM" && h24 === 12) h24 = 0;
    const horaPayload = `${String(h24).padStart(2, "0")}:${horaM}`;

    const payload = {
      fecha_autorizacion: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`,
      hora_retiro: horaPayload,
      acudiente_nombre: nombreAcudiente,
      acudiente_identificacion: idAcudiente,
      acudiente_telefono: telefonoAcudiente,
      acudiente_correo: correo || null,
      estudiante_nombre: hijoSeleccionado.nombre,
      estudiante_apellidos: hijoSeleccionado.apellidos,
      estudiante_grado: hijoSeleccionado.grado,
      estudiante_salon: hijoSeleccionado.salon,
      tipo_salida: tipoSalida,
      nombre_persona_autorizada: tipoSalida === "motocicleta_vehiculo" ? null : nombrePersona || null,
      parentesco: tipoSalida === "familiar" ? parentesco : null,
      motivo,
      firma_url: firmaUrl,
      numero_telefono_acudiente: telefonoAcudiente,
      archivos_url: archivosUrls.length > 0 ? archivosUrls : null,
    };

    const { error } = await supabase.from("Autorizaciones_Retiro").insert(payload);

    if (error) {
      toast({ title: "Error", description: "No se pudo crear la autorización: " + error.message, variant: "destructive" });
    } else {
      setShowSuccess(true);

      // Notificar a Rector y Coordinadores
      const tipoLabel = TIPOS_SALIDA.find(t => t.value === tipoSalida)?.label || tipoSalida;
      const fechaLabel = format(fecha, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
      const horaLabel = `${horaH}:${horaM} ${horaAP}`;
      const personaLinea = tipoSalida === "motocicleta_vehiculo"
        ? ""
        : `\nPersona autorizada: ${nombrePersona}${tipoSalida === "familiar" && parentesco ? ` (${parentesco})` : ""}.`;
      const mensaje =
        `Nueva autorización de retiro registrada en la plataforma.\n\n` +
        `Estudiante: ${hijoSeleccionado.nombre} ${hijoSeleccionado.apellidos} — ${hijoSeleccionado.grado} ${hijoSeleccionado.salon} (id ${hijoSeleccionado.id}).\n` +
        `Fecha de retiro: ${fechaLabel}.\n` +
        `Hora de retiro: ${horaLabel}.\n` +
        `Tipo de salida: ${tipoLabel}.${personaLinea}\n` +
        `Motivo: ${motivo}.\n` +
        `Acudiente: ${nombreAcudiente} (C.C. ${idAcudiente}${telefonoAcudiente ? `, tel. ${telefonoAcudiente}` : ""}).\n` +
        `Pueden revisarla en la plataforma en Permisos y Excusas.`;
      notifyRectorCoord(mensaje, "Sistema Normi (Retiro)", {
        grado: hijoSeleccionado.grado,
        salon: hijoSeleccionado.salon,
      }, "retiro");

      // Reset form
      setFecha(undefined);
      setHoraH(""); setHoraM(""); setHoraAP("");
      setHijoSeleccionado(null);
      setTipoSalida("");
      setNombrePersona("");
      setParentesco("");
      setMotivo("");
      setCorreo("");
      setFirma(null);
      setArchivos([]);
      sigCanvas.current?.clear();
      setAceptoTerminos(false);
    }
    setSaving(false);
    setShowConfirm(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard-padre")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/permisos-excusas")} className="text-primary hover:underline">Permisos y Excusas</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Retiro de Estudiantes</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("crear")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${tab === "crear" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
          >
            Crear autorización
          </button>
          <button
            onClick={() => setTab("historial")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${tab === "historial" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
          >
            Autorizaciones creadas
          </button>
        </div>

        {tab === "crear" && (
          <div className="bg-card rounded-lg shadow-soft p-6">
            {/* Intro message */}
            <p className="text-sm text-muted-foreground mb-4">
              Si su hijo(a) debe salir de la institución solo o con una persona diferente a sus padres, debe diligenciar el siguiente formato:
            </p>

            {/* Legal text */}
            <div className="bg-muted/50 rounded-lg p-4 mb-4 border border-border">
              <h3 className="font-bold text-foreground text-center mb-3">
                AUTORIZACIÓN PARA RETIRO DE ESTUDIANTES EN JORNADA ESCOLAR
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed text-justify">
                Durante la jornada escolar, los estudiantes no podrán salir de las instalaciones de la institución educativa sin la autorización previa, expresa y verificable de sus padres, madres o acudientes legales. Esta medida se fundamenta en el deber de protección, custodia y garantía de los derechos de los niños, niñas y adolescentes, responsabilidad que recae sobre la institución mientras el estudiante se encuentre bajo su cuidado. En consecuencia, toda salida anticipada o excepcional deberá estar debidamente sustentada, registrada y autorizada conforme a los procedimientos establecidos por la institución, de acuerdo con lo dispuesto en el Código de la Infancia y la Adolescencia (Ley 1098 de 2006) y la normativa vigente del sector educativo.
              </p>
            </div>

            {/* Accept checkbox */}
            <label className="flex items-start gap-3 mb-6 cursor-pointer select-none">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${aceptoTerminos ? "bg-primary border-primary" : "border-border"}`}
                onClick={() => setAceptoTerminos(!aceptoTerminos)}
              >
                {aceptoTerminos && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
              </div>
              <span className="text-sm text-foreground" onClick={() => setAceptoTerminos(!aceptoTerminos)}>
                He leído y acepto las condiciones establecidas para la autorización de retiro de estudiantes.
              </span>
            </label>

            {/* Form (disabled until accepted) */}
            {aceptoTerminos && <div className="space-y-5">
              {/* Fecha inline */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span className="font-medium text-red-600">La autorización es para el día:</span>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 px-3 py-1.5 border-b-2 border-primary/40 text-primary font-medium bg-transparent hover:bg-accent rounded cursor-pointer min-w-[200px]">
                      {fecha ? format(fecha, "dd/MM/yyyy (EEEE)", { locale: es }) : "Seleccionar fecha"}
                      <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={fecha} onSelect={(d) => { setFecha(d); setCalendarOpen(false); }} locale={es} />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Hora inline */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span className="font-medium text-red-600">Hora del retiro:</span>
                <select value={horaH} onChange={e => setHoraH(e.target.value)} className="inline px-1 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm cursor-pointer outline-none">
                  <option value="">--</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={String(h)}>{h}</option>)}
                </select>
                <span>:</span>
                <select value={horaM} onChange={e => setHoraM(e.target.value)} className="inline px-1 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm cursor-pointer outline-none">
                  <option value="">--</option>
                  {["00","05","10","15","20","25","30","35","40","45","50","55"].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={horaAP} onChange={e => setHoraAP(e.target.value)} className="inline px-1 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm cursor-pointer outline-none">
                  <option value="">--</option>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>

              {/* Yo ___ identificado(a) con C.C. No. ___ autorizo a mi hijo(a) ___ del grado ___ */}
              <div className="text-sm text-foreground leading-relaxed space-y-3">
                <p className="items-baseline" style={{ wordBreak: "normal", overflowWrap: "normal" }}>
                  Yo <span className="inline px-1 border-b-2 border-primary/40 text-primary font-medium">{nombreAcudiente || "___"}</span> identificado(a) con C.C. No. <span className="inline px-1 border-b-2 border-primary/40 text-primary font-medium">{idAcudiente || "___"}</span> autorizo a mi hijo(a)
                  <select
                    value={hijoSeleccionado?.id || ""}
                    onChange={(e) => {
                      const h = hijos.find(h => h.id === e.target.value);
                      setHijoSeleccionado(h || null);
                    }}
                    className="inline-block px-2 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm min-w-[200px] cursor-pointer outline-none appearance-none"
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2316a34a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 4px center" }}
                  >
                    <option value="">Seleccionar estudiante</option>
                    {hijos.map((h) => (
                      <option key={h.id} value={h.id}>{h.nombre} {h.apellidos}</option>
                    ))}
                  </select>
                  {hijoSeleccionado && (
                    <> del grado: <span className="inline px-1 border-b-2 border-primary/40 text-primary font-medium">{hijoSeleccionado.grado} {hijoSeleccionado.salon}</span>, para que salga de la institución: (Marque una de las siguientes opciones)</>
                  )}
                </p>
              </div>

              {/* Tipo de salida — checkboxes like the document */}
              {hijoSeleccionado && (
                <div className="space-y-3 ml-2">
                  {TIPOS_SALIDA.map((tipo) => (
                    <div key={tipo.value} className="space-y-2">
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${tipoSalida === tipo.value ? "bg-primary border-primary" : "border-border"}`}
                          onClick={() => { setTipoSalida(tipo.value); setNombrePersona(""); setParentesco(""); }}
                        >
                          {tipoSalida === tipo.value && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                        </div>
                        <span className="text-sm text-foreground" onClick={() => { setTipoSalida(tipo.value); setNombrePersona(""); setParentesco(""); }}>
                          {tipo.label}
                        </span>
                      </label>

                      {/* Inline fields for transporte */}
                      {tipoSalida === "transporte" && tipo.value === "transporte" && (
                        <div className="ml-8 flex flex-wrap items-baseline gap-1 text-sm">
                          <span>Nombre de la persona</span>
                          <input
                            type="text"
                            value={nombrePersona}
                            onChange={(e) => setNombrePersona(e.target.value)}
                            className="inline-block px-2 py-1 border-b-2 border-input bg-transparent text-sm min-w-[200px] focus:border-primary outline-none"
                            placeholder="___________________"
                          />
                        </div>
                      )}

                      {/* Inline fields for familiar */}
                      {tipoSalida === "familiar" && tipo.value === "familiar" && (
                        <div className="ml-8 space-y-2 text-sm">
                          <div className="flex flex-wrap items-baseline gap-1">
                            <span>Nombre de la persona</span>
                            <input
                              type="text"
                              value={nombrePersona}
                              onChange={(e) => setNombrePersona(e.target.value)}
                              className="inline-block px-2 py-1 border-b-2 border-input bg-transparent text-sm min-w-[200px] focus:border-primary outline-none"
                              placeholder="___________________"
                            />
                          </div>
                          <div className="flex flex-wrap items-baseline gap-1">
                            <span>Parentesco:</span>
                            <input
                              type="text"
                              value={parentesco}
                              onChange={(e) => setParentesco(e.target.value)}
                              className="inline-block px-2 py-1 border-b-2 border-input bg-transparent text-sm min-w-[200px] focus:border-primary outline-none"
                              placeholder="___________________"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Motivo */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Motivo de salida anticipada del estudiante:</label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[80px] resize-y"
                  placeholder="Describa el motivo..."
                />
              </div>

              {/* Archivos adjuntos */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Archivos adjuntos</label>
                <p className="text-xs text-muted-foreground">Puedes adjuntar fotos, documentos u otros soportes relacionados.</p>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(e) => {
                    setArchivos([...archivos, ...Array.from(e.target.files || [])]);
                    e.target.value = "";
                  }}
                  className="hidden"
                  id="archivos-retiro-input"
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
                  id="foto-retiro-input"
                />
                <div className="flex flex-wrap gap-2">
                  <label htmlFor="foto-retiro-input" className="inline-flex items-center gap-2 px-3 py-1.5 border border-dashed border-primary/40 rounded-md cursor-pointer hover:bg-accent text-sm text-primary font-medium">
                    <Camera className="w-4 h-4" /> Tomar foto
                  </label>
                  <label htmlFor="archivos-retiro-input" className="inline-flex items-center gap-2 px-3 py-1.5 border border-dashed border-primary/40 rounded-md cursor-pointer hover:bg-accent text-sm text-primary font-medium">
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
                  <SignatureCanvas
                    ref={sigCanvas}
                    penColor="black"
                    canvasProps={{
                      className: "w-full",
                      style: { width: "100%", height: "160px" },
                    }}
                    onEnd={handleFirmaEnd}
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={limpiarFirma}
                    className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:bg-accent cursor-pointer"
                  >
                    Limpiar firma
                  </button>
                  {firma && <span className="text-xs text-green-600 font-medium">✓ Firmado</span>}
                </div>
              </div>

              {/* Correo (opcional) */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Correo electrónico <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <input
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background"
                  placeholder="correo@ejemplo.com"
                />
              </div>

              {/* Teléfono (auto-filled) */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Teléfono</label>
                <div className="px-3 py-2 border border-input rounded-md text-sm bg-muted/30 text-primary font-medium">{telefonoAcudiente || "No disponible"}</div>
              </div>

              {/* Submit button */}
              <button
                onClick={() => setShowConfirm(true)}
                disabled={!camposCompletos || saving}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-bold text-base transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? "Creando..." : "Crear autorización"}
              </button>
            </div>}
          </div>
        )}

        {tab === "historial" && (
          <div className="bg-card rounded-lg shadow-soft p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">Autorizaciones creadas</h3>
            {loadingHistorial ? (
              <p className="text-muted-foreground text-center py-8">Cargando...</p>
            ) : historial.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No hay autorizaciones registradas</p>
            ) : (
              <div className="space-y-4">
                {historial.map((auth) => {
                  const isExpanded = expandedId === auth.id;
                  const fechaAut = new Date(auth.fecha_autorizacion + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
                  const fechaCreacion = new Date(auth.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

                  return (
                    <div key={auth.id} className="border border-border rounded-lg overflow-hidden">
                      {/* Header - always visible, clickable */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : auth.id)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <div>
                          <p className="font-semibold text-foreground">{auth.estudiante_nombre} {auth.estudiante_apellidos}</p>
                          <p className="text-xs text-muted-foreground">Para el {fechaAut}</p>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>

                      {/* Expanded content - full authorization document */}
                      {isExpanded && (
                        <div className="border-t border-border p-4 bg-muted/10">
                          <p className="text-xs text-muted-foreground mb-3">Creada el {fechaCreacion}</p>

                          <div className="text-sm text-foreground leading-relaxed space-y-3">
                            <p className="font-bold text-center">AUTORIZACIÓN PARA RETIRO DE ESTUDIANTES EN JORNADA ESCOLAR</p>

                            <p>
                              Fecha: <span className="text-primary font-medium">{fechaAut}</span>
                              {auth.hora_retiro && (
                                <> · Hora del retiro: <span className="text-primary font-medium">{fmtHora(auth.hora_retiro.slice(0, 5))}</span></>
                              )}
                            </p>

                            <p>
                              Yo <span className="text-primary font-medium">{auth.acudiente_nombre}</span> identificado(a) con C.C. No. <span className="text-primary font-medium">{auth.acudiente_identificacion}</span> autorizo a mi hijo(a) <span className="text-primary font-medium">{auth.estudiante_nombre} {auth.estudiante_apellidos}</span> del grado: <span className="text-primary font-medium">{auth.estudiante_grado} {auth.estudiante_salon}</span>, para que salga de la institución:
                            </p>

                            <p>
                              <Check className="w-4 h-4 inline text-primary" /> {TIPOS_SALIDA.find(t => t.value === auth.tipo_salida)?.label || auth.tipo_salida}
                              {auth.nombre_persona_autorizada && (
                                <span>. Nombre de la persona: <span className="text-primary font-medium">{auth.nombre_persona_autorizada}</span></span>
                              )}
                              {auth.parentesco && (
                                <span>. Parentesco: <span className="text-primary font-medium">{auth.parentesco}</span></span>
                              )}
                            </p>

                            <p>
                              Motivo de salida anticipada del estudiante: <span className="text-primary font-medium">{auth.motivo}</span>
                            </p>

                            <div>
                              <p className="font-medium mb-1">Firma del acudiente:</p>
                              {(auth.firma_url || auth.firma_base64) && <FirmaImage url={(auth.firma_url || auth.firma_base64)} />}
                            </div>

                            {auth.archivos_url && auth.archivos_url.length > 0 && (
                              <div className="space-y-2">
                                <p className="font-medium">Archivos adjuntos:</p>
                                {auth.archivos_url.map((url: string, i: number) => (
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

                            {auth.acudiente_correo && (
                              <p>Correo electrónico: <span className="text-primary font-medium">{auth.acudiente_correo}</span></p>
                            )}

                            <p>Teléfono: <span className="text-primary font-medium">{auth.acudiente_telefono}</span></p>
                          </div>
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

      {/* Confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar autorización</AlertDialogTitle>
            <AlertDialogDescription>
              Una vez creada la autorización, esta no se podrá eliminar. ¿Está seguro de que desea continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCrear} className="cursor-pointer">
              {saving ? "Creando..." : "Sí, crear autorización"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSuccess} onOpenChange={setShowSuccess}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>✓ Permiso enviado</AlertDialogTitle>
            <AlertDialogDescription>
              El permiso de salida fue creado y entregado con éxito. El personal del colegio recibirá la notificación.
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

export default RetiroEstudiantes;
