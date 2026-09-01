import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { formatTelefono } from "@/utils/telefono";
import { getSession, isPadreDeFamilia, AcudidoData } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SignatureCanvas from "react-signature-canvas";
import { usePreservarFirma } from "@/hooks/usePreservarFirma";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { notifyRectorCoord } from "@/lib/notifyStaff";
import FirmaImage from "@/components/FirmaImage";
import { es } from "date-fns/locale";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Tab = "crear" | "historial";

const JustificacionUniforme = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sigCanvas = useRef<SignatureCanvas>(null);

  const [tab, setTab] = useState<Tab>("crear");

  // Form
  const [fecha, setFecha] = useState<Date | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);
  const [acudidoSeleccionado, setAcudidoSeleccionado] = useState<AcudidoData | null>(null);
  const [justificacion, setJustificacion] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  usePreservarFirma(sigCanvas, firma);

  // Session
  const [acudidos, setAcudidos] = useState<AcudidoData[]>([]);
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
    setAcudidos(session.acudidos || []);
    // Tel del acudiente logueado vive en Usuarios (fuente única).
    supabase.from("Usuarios").select("numero_de_telefono").eq("id", session.id).maybeSingle()
      .then(({ data }) => { if (data?.numero_de_telefono) setTelefonoAcudiente(data.numero_de_telefono); });
  }, [navigate]);

  useEffect(() => { if (tab === "historial") fetchHistorial(); }, [tab]);

  const fetchHistorial = async () => {
    setLoadingHistorial(true);
    const session = getSession();
    const { data } = await supabase.from("Justificaciones_Uniforme").select("*")
      .eq("acudiente_id", session.id).order("fecha", { ascending: false });
    setHistorial(data || []);
    setLoadingHistorial(false);
  };

  const handleFirmaEnd = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) setFirma(sigCanvas.current.toDataURL("image/png"));
  };

  const limpiarFirma = () => { sigCanvas.current?.clear(); setFirma(null); };

  const camposCompletos = !!fecha && !!acudidoSeleccionado && justificacion.trim().length > 0 && !!firma;

  const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmtFecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const handleCrear = async () => {
    if (!camposCompletos || !acudidoSeleccionado || !fecha || !firma) return;
    setSaving(true);

    let firmaUrl: string | null = null;
    try {
      const base64Data = firma.split(",")[1];
      const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `firmas/${Date.now()}_${idAcudiente}_unif.png`;
      const { error: uploadErr } = await supabase.storage.from("normi-archivos").upload(fileName, byteArray, { contentType: "image/png" });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("normi-archivos").getPublicUrl(fileName);
      firmaUrl = urlData?.publicUrl || null;
    } catch (err: any) {
      toast({ title: "Error", description: "No se pudo subir la firma: " + err.message, variant: "destructive" });
      setSaving(false); return;
    }

    const payload = {
      fecha: fmtLocal(fecha),
      estudiante_id: acudidoSeleccionado.id,
      estudiante_nombre: acudidoSeleccionado.nombre,
      estudiante_apellidos: acudidoSeleccionado.apellidos,
      estudiante_grado: acudidoSeleccionado.grado,
      estudiante_salon: acudidoSeleccionado.salon,
      justificacion: justificacion.trim(),
      acudiente_nombres: nombresAcudiente,
      acudiente_apellidos: apellidosAcudiente,
      acudiente_id: idAcudiente,
      acudiente_telefono: telefonoAcudiente,
      firma_url: firmaUrl,
    };

    const { error } = await supabase.from("Justificaciones_Uniforme").insert(payload);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setShowSuccess(true);

      const mensaje =
        `Nueva justificación por uniforme registrada.\n\n` +
        `Estudiante: ${acudidoSeleccionado.nombre} ${acudidoSeleccionado.apellidos} — ${acudidoSeleccionado.grado} ${acudidoSeleccionado.salon} (id ${acudidoSeleccionado.id}).\n` +
        `Fecha: ${fmtFecha(payload.fecha)}.\n` +
        `Justificación: ${justificacion.trim()}.\n` +
        `Acudiente: ${nombreAcudiente} (C.C. ${idAcudiente}${telefonoAcudiente ? `, tel. ${telefonoAcudiente}` : ""}).\n` +
        `Pueden revisarla en la plataforma en Permisos y Excusas.`;
      notifyRectorCoord(mensaje, "Sistema Normi (Uniforme)", {
        grado: acudidoSeleccionado.grado,
        salon: acudidoSeleccionado.salon,
      }, "uniforme");

      setFecha(undefined); setAcudidoSeleccionado(null); setJustificacion("");
      setFirma(null); sigCanvas.current?.clear();
    }
    setSaving(false); setShowConfirm(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/permisos-excusas")} className="text-primary hover:underline">Permisos y Excusas</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Justificación por Uniforme</span>
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
              Si su acudido(a) no podrá portar el uniforme correspondiente algún día, debe diligenciar el siguiente formato de justificación:
            </p>

            <div className="space-y-5">
              {/* Datos del estudiante */}
              <div className="text-sm text-foreground leading-relaxed">
                <p className="font-bold mb-3">1. Datos del estudiante</p>
                <p>
                  Nombre completo: <select value={acudidoSeleccionado?.id || ""} onChange={(e) => setAcudidoSeleccionado(acudidos.find(h => h.id === e.target.value) || null)}
                    className="inline px-2 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm min-w-[200px] cursor-pointer outline-none"
                  >
                    <option value="">Seleccionar estudiante</option>
                    {acudidos.map(h => <option key={h.id} value={h.id}>{h.nombre} {h.apellidos}</option>)}
                  </select>
                  {acudidoSeleccionado && <> Grado y Curso: <span className="text-primary font-medium">{acudidoSeleccionado.grado} {acudidoSeleccionado.salon}</span></>}
                </p>
              </div>

              {/* Fecha */}
              <div className="text-sm text-foreground">
                <p className="font-bold mb-3">2. Fecha en que no portará el uniforme</p>
                <Popover open={calOpen} onOpenChange={setCalOpen}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 px-3 py-1.5 border-b-2 border-primary/40 text-primary font-medium bg-transparent hover:bg-accent rounded cursor-pointer min-w-[200px]">
                      {fecha ? fecha.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "Seleccionar fecha"}
                      <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={fecha} onSelect={(d) => { setFecha(d); setCalOpen(false); }} locale={es} />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Justificación */}
              <div className="text-sm text-foreground">
                <p className="font-bold mb-3">3. Justificación por no portar el uniforme correspondiente</p>
                <textarea value={justificacion} onChange={(e) => setJustificacion(e.target.value)} className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[120px] resize-y" placeholder="Describa la razón por la cual el estudiante no portará el uniforme..." />
              </div>

              {/* Datos del acudiente */}
              <div className="text-sm text-foreground">
                <p className="font-bold mb-3">4. Datos del acudiente</p>
                <p>Nombre: <span className="text-primary font-medium">{nombreAcudiente}</span></p>
                <p>Documento de identidad: <span className="text-primary font-medium">{idAcudiente}</span></p>
                <p className="mt-1">Teléfono de contacto: <span className="text-primary font-medium">{formatTelefono(telefonoAcudiente) || "No disponible"}</span></p>
              </div>

              {/* Firma */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Firma del acudiente</label>
                <div data-guia="permisos.firma" className="border-2 border-dashed border-border rounded-lg bg-white">
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
            </div>
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
                          <p className="text-xs text-muted-foreground">{fmtFecha(j.fecha)}</p>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isExp ? "rotate-180" : ""}`} />
                      </button>
                      {isExp && (
                        <div className="border-t border-border p-4 bg-muted/10 text-sm text-foreground leading-relaxed space-y-3">
                          <p className="text-xs text-muted-foreground">Creada el {new Date(j.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                          <p className="font-bold text-center">FORMATO DE JUSTIFICACIÓN POR UNIFORME</p>
                          <p><span className="font-medium">Estudiante:</span> <span className="text-primary font-medium">{j.estudiante_nombre} {j.estudiante_apellidos}</span> — <span className="text-primary font-medium">{j.estudiante_grado} {j.estudiante_salon}</span></p>
                          <p><span className="font-medium">Fecha:</span> <span className="text-primary font-medium">{fmtFecha(j.fecha)}</span></p>
                          <p><span className="font-medium">Justificación:</span> <span className="text-primary font-medium">{j.justificacion}</span></p>
                          <p><span className="font-medium">Acudiente:</span> <span className="text-primary font-medium">{[j.acudiente_nombres, j.acudiente_apellidos].filter(Boolean).join(" ")}</span> — C.C. <span className="text-primary font-medium">{j.acudiente_id}</span></p>
                          {j.acudiente_telefono && <p>Teléfono: <span className="text-primary font-medium">{formatTelefono(j.acudiente_telefono)}</span></p>}
                          {j.firma_url && <div><p className="font-medium mb-1">Firma:</p><FirmaImage url={j.firma_url} /></div>}
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
              La excusa por uniforme fue creada y entregada con éxito. El personal del colegio recibirá la notificación.
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

export default JustificacionUniforme;
