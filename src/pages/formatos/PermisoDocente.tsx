import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { getSession, puedeAccederDashboard, isAdmin, isProfesor } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SignatureCanvas from "react-signature-canvas";
import { Plus, X, Download, Save } from "lucide-react";

// Formato de solicitud de permiso docente (por ahora exclusivo del Pestalozziano).
const PESTA_ID = "94c1414b-22d1-40dd-945a-5857b62e5f6c";

interface Cargo { hora: string; grado: string; asignatura: string; docente: string; }

const PermisoDocente = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sig = useRef<SignatureCanvas>(null);
  const s = getSession();

  const [fechaSolicitud, setFechaSolicitud] = useState(() => new Date().toISOString().slice(0, 10));
  const [nombreDocente, setNombreDocente] = useState([s.nombres, s.apellidos].filter(Boolean).join(" "));
  const [fechaPermiso, setFechaPermiso] = useState("");
  const [totalHoras, setTotalHoras] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cargos, setCargos] = useState<Cargo[]>([{ hora: "", grado: "", asignatura: "", docente: "" }]);
  const [zonaApoyo, setZonaApoyo] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!s.id || (!puedeAccederDashboard() && !isAdmin() && !isProfesor())) { navigate("/"); return; }
    if (s.colegio_id !== PESTA_ID) { navigate("/formatos"); return; }
  }, []);

  const addCargo = () => setCargos((c) => [...c, { hora: "", grado: "", asignatura: "", docente: "" }]);
  const rmCargo = (i: number) => setCargos((c) => c.filter((_, j) => j !== i));
  const setCargo = (i: number, k: keyof Cargo, v: string) => setCargos((c) => c.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const onFirmaEnd = () => { if (sig.current && !sig.current.isEmpty()) setFirma(sig.current.toDataURL("image/png")); };
  const limpiarFirma = () => { sig.current?.clear(); setFirma(null); };

  const armarDatos = () => ({
    fechaSolicitud, nombreDocente, fechaPermiso, totalHoras, motivo,
    cargos: cargos.filter((c) => c.hora || c.grado || c.asignatura || c.docente),
    zonaApoyo, firma,
  });

  const guardar = async (): Promise<boolean> => {
    if (!nombreDocente.trim() || !fechaPermiso || !motivo.trim()) {
      toast({ title: "Faltan datos", description: "Nombre del docente, fecha del permiso y motivo son obligatorios.", variant: "destructive" });
      return false;
    }
    setSaving(true);
    const { error } = await supabase.from("Formatos_Diligenciados").insert({
      tipo: "permiso_docente",
      titulo: `Solicitud de permiso — ${nombreDocente}`,
      datos: armarDatos(),
      creado_por: s.id,
      creado_por_nombre: [s.cargo, s.nombres, s.apellidos].filter(Boolean).join(" "),
    });
    setSaving(false);
    if (error) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "Formato guardado", description: "Quedó registrado en la plataforma.", variant: "success" });
    return true;
  };

  const descargarPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const d = new jsPDF("p", "mm", "a4");
    const W = 210, M = 15;
    let y = 16;
    d.setFont("helvetica", "bold"); d.setFontSize(13); d.text("COLEGIO PESTALOZZIANO", W / 2, y, { align: "center" }); y += 5;
    d.setFont("helvetica", "normal"); d.setFontSize(9); d.text("Coordinación Académica y de Disciplina", W / 2, y, { align: "center" }); y += 8;
    d.setFont("helvetica", "bold"); d.setFontSize(12); d.text("SOLICITUD PERMISO DOCENTE", W / 2, y, { align: "center" }); y += 10;
    d.setFontSize(10);
    const fld = (label: string, val: string) => {
      d.setFont("helvetica", "bold"); d.text(label, M, y);
      const lw = d.getTextWidth(label);
      d.setFont("helvetica", "normal"); d.text(val || "____________________", M + lw + 1, y); y += 7;
    };
    fld("Fecha de solicitud: ", fechaSolicitud);
    fld("Nombre del docente: ", nombreDocente);
    fld("Fecha del permiso: ", fechaPermiso);
    fld("Total de horas ausente: ", totalHoras);
    d.setFont("helvetica", "bold"); d.text("Motivo del permiso:", M, y); y += 5;
    d.setFont("helvetica", "normal");
    const ml = d.splitTextToSize(motivo || "", W - 2 * M); d.text(ml, M, y); y += ml.length * 5 + 4;

    d.setFont("helvetica", "bold"); d.setFontSize(10); d.text("Docentes que quedan a cargo:", M, y); y += 6;
    d.setFontSize(9);
    armarDatos().cargos.forEach((c, i) => {
      d.setFont("helvetica", "normal");
      d.text(`${i + 1}. Hora: ${c.hora || "—"}   Grado: ${c.grado || "—"}   Asignatura: ${c.asignatura || "—"}`, M + 2, y); y += 5;
      d.text(`     Docente a cargo: ${c.docente || "—"}   Firma: __________________`, M + 2, y); y += 6;
    });
    y += 2;
    d.setFont("helvetica", "bold"); d.setFontSize(10);
    d.text("Zona de apoyo en descanso — docente a cargo: ", M, y);
    d.setFont("helvetica", "normal"); d.text(zonaApoyo || "____________________", M + 88, y); y += 12;

    // Firma del solicitante (digital) + espacios para coordinación y rector.
    if (firma) { try { d.addImage(firma, "PNG", M, y - 3, 55, 22); } catch { /* ignore */ } }
    d.setFont("helvetica", "normal"); d.setFontSize(10);
    d.line(M, y + 22, M + 70, y + 22); d.text("Firma del docente solicitante", M, y + 27);
    y += 40;
    d.line(M, y, M + 80, y); d.text("Firma de aprobación de Coordinación", M, y + 5); y += 16;
    d.line(M, y, M + 80, y); d.text("Firma de aprobación de Rector", M, y + 5);

    d.save(`Solicitud Permiso Docente - ${nombreDocente || "docente"}.pdf`);
  };

  const guardarYDescargar = async () => { const ok = await guardar(); if (ok) await descargarPDF(); };

  const inputCls = "px-3 py-2 border border-input rounded-md text-sm bg-background w-full";

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink="/formatos" />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">Solicitud de permiso docente</h1>
        <p className="text-muted-foreground mt-1 text-sm">Llénalo, firma con el dedo y guárdalo. También puedes descargar el PDF.</p>

        <div className="mt-6 space-y-4 bg-card rounded-lg shadow-soft p-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="text-sm font-medium">Fecha de solicitud</label><input type="date" value={fechaSolicitud} onChange={(e) => setFechaSolicitud(e.target.value)} className={inputCls} /></div>
            <div><label className="text-sm font-medium">Fecha del permiso *</label><input type="date" value={fechaPermiso} onChange={(e) => setFechaPermiso(e.target.value)} className={inputCls} /></div>
            <div><label className="text-sm font-medium">Nombre del docente *</label><input value={nombreDocente} onChange={(e) => setNombreDocente(e.target.value)} className={inputCls} /></div>
            <div><label className="text-sm font-medium">Total de horas ausente</label><input value={totalHoras} onChange={(e) => setTotalHoras(e.target.value)} className={inputCls} placeholder="Ej. 3 horas" /></div>
          </div>
          <div><label className="text-sm font-medium">Motivo del permiso *</label><textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className={inputCls + " resize-y"} /></div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Docentes que quedan a cargo</label>
              <button type="button" onClick={addCargo} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Plus className="w-4 h-4" /> Agregar</button>
            </div>
            <div className="space-y-2 mt-2">
              {cargos.map((c, i) => (
                <div key={i} className="grid grid-cols-2 md:grid-cols-4 gap-2 items-center border border-border rounded-md p-2">
                  <input value={c.hora} onChange={(e) => setCargo(i, "hora", e.target.value)} placeholder="Hora de clase" className={inputCls} />
                  <input value={c.grado} onChange={(e) => setCargo(i, "grado", e.target.value)} placeholder="Grado" className={inputCls} />
                  <input value={c.asignatura} onChange={(e) => setCargo(i, "asignatura", e.target.value)} placeholder="Asignatura" className={inputCls} />
                  <div className="flex gap-1">
                    <input value={c.docente} onChange={(e) => setCargo(i, "docente", e.target.value)} placeholder="Docente a cargo" className={inputCls} />
                    {cargos.length > 1 && <button type="button" onClick={() => rmCargo(i)} className="text-muted-foreground hover:text-red-600 px-1"><X className="w-4 h-4" /></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div><label className="text-sm font-medium">Zona de apoyo en descanso — docente a cargo</label><input value={zonaApoyo} onChange={(e) => setZonaApoyo(e.target.value)} className={inputCls} /></div>

          <div>
            <label className="text-sm font-medium">Firma del docente solicitante</label>
            <div className="border-2 border-dashed border-border rounded-lg bg-white mt-1">
              <SignatureCanvas ref={sig} penColor="black" canvasProps={{ className: "w-full", style: { width: "100%", height: "150px" } }} onEnd={onFirmaEnd} />
            </div>
            <div className="flex gap-2 items-center mt-1">
              <button type="button" onClick={limpiarFirma} className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:bg-accent">Limpiar firma</button>
              {firma && <span className="text-xs text-green-600 font-medium">✓ Firmado</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button onClick={guardar} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60"><Save className="w-4 h-4" /> {saving ? "Guardando…" : "Guardar"}</button>
            <button onClick={guardarYDescargar} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 border-border font-semibold hover:border-primary disabled:opacity-60"><Download className="w-4 h-4" /> Guardar y descargar PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PermisoDocente;
