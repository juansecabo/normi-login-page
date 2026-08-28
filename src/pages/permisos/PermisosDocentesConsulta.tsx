import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { getSession, puedeAccederDashboard, isAdmin, isProfesor } from "@/hooks/useSession";
import { apiRequest } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, Loader2 } from "lucide-react";

interface Cargo { hora?: string; grado?: string; asignatura?: string; docente?: string; }
interface Permiso {
  id: number;
  solicitante_nombre: string;
  solicitante_cargo: string;
  fecha_solicitud: string | null;
  fecha_permiso: string | null;
  total_horas: string | null;
  motivo: string;
  docentes_a_cargo: Cargo[] | null;
  zona_apoyo: string | null;
  firma: string | null;
  creado_en: string;
}

const PermisosDocentesConsulta = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const s = getSession();
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!s.id || (!puedeAccederDashboard() && !isAdmin() && !isProfesor())) { navigate("/"); return; }
    (async () => {
      try {
        const r = await apiRequest<{ permisos: Permiso[] }>("/api/permisos/docente");
        setPermisos(r.permisos || []);
      } catch (e: any) {
        toast({ title: "No se pudieron cargar", description: e?.message || "Intenta de nuevo.", variant: "destructive" });
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const verPDF = async (p: Permiso) => {
    const { default: jsPDF } = await import("jspdf");
    const d = new jsPDF("p", "mm", "a4");
    const W = 210, M = 15;
    let y = 16;
    d.setFont("helvetica", "bold"); d.setFontSize(13); d.text((s.colegio_nombre || "Institución Educativa").toUpperCase(), W / 2, y, { align: "center" }); y += 8;
    d.setFont("helvetica", "bold"); d.setFontSize(12); d.text("SOLICITUD PERMISO DOCENTE", W / 2, y, { align: "center" }); y += 10;
    d.setFontSize(10);
    const fld = (label: string, val: string) => {
      d.setFont("helvetica", "bold"); d.text(label, M, y);
      const lw = d.getTextWidth(label);
      d.setFont("helvetica", "normal"); d.text(val || "____________________", M + lw + 1, y); y += 7;
    };
    fld("Fecha de solicitud: ", p.fecha_solicitud || "");
    fld("Nombre del docente: ", p.solicitante_nombre || "");
    fld("Fecha del permiso: ", p.fecha_permiso || "");
    fld("Total de horas ausente: ", p.total_horas || "");
    d.setFont("helvetica", "bold"); d.text("Motivo del permiso:", M, y); y += 5;
    d.setFont("helvetica", "normal");
    const ml = d.splitTextToSize(p.motivo || "", W - 2 * M); d.text(ml, M, y); y += ml.length * 5 + 4;
    d.setFont("helvetica", "bold"); d.setFontSize(10); d.text("Docentes que quedan a cargo:", M, y); y += 6;
    d.setFontSize(9);
    (p.docentes_a_cargo || []).forEach((c, i) => {
      d.setFont("helvetica", "normal");
      d.text(`${i + 1}. Hora: ${c.hora || "—"}   Grado: ${c.grado || "—"}   Asignatura: ${c.asignatura || "—"}`, M + 2, y); y += 5;
      d.text(`     Docente a cargo: ${c.docente || "—"}   Firma: __________________`, M + 2, y); y += 6;
    });
    y += 2;
    d.setFont("helvetica", "bold"); d.setFontSize(10);
    d.text("Zona de apoyo en descanso — docente a cargo: ", M, y);
    d.setFont("helvetica", "normal"); d.text(p.zona_apoyo || "____________________", M + 88, y); y += 12;
    if (p.firma) { try { d.addImage(p.firma, "PNG", M, y - 3, 55, 22); } catch { /* ignore */ } }
    d.setFont("helvetica", "normal"); d.setFontSize(10);
    d.line(M, y + 22, M + 70, y + 22); d.text("Firma del docente solicitante", M, y + 27);
    y += 40;
    d.line(M, y, M + 80, y); d.text("Firma de aprobación de Coordinación", M, y + 5); y += 16;
    d.line(M, y, M + 80, y); d.text("Firma de aprobación de Rector", M, y + 5);
    d.save(`Solicitud Permiso Docente - ${p.solicitante_nombre || "docente"}.pdf`);
  };

  const fmtFecha = (f: string | null) => f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink="/formatos" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <button onClick={() => navigate("/formatos")} className="text-primary hover:underline">Formatos</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Permisos docentes</span>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Permisos docentes</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isProfesor() ? "Tus solicitudes de permiso." : "Solicitudes de permiso de los docentes."}
        </p>

        {cargando ? (
          <div className="mt-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div>
        ) : permisos.length === 0 ? (
          <div className="mt-8 text-center text-muted-foreground bg-card rounded-lg shadow-soft p-8">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
            Aún no hay solicitudes de permiso registradas.
          </div>
        ) : (
          <div className="mt-6 space-y-3" data-guia="permisosconsulta.lista">
            {permisos.map((p) => (
              <div key={p.id} className="bg-card rounded-lg shadow-soft p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{p.solicitante_nombre}</div>
                  <div className="text-sm text-muted-foreground">
                    Permiso: <b>{fmtFecha(p.fecha_permiso)}</b>
                    {p.total_horas ? ` · ${p.total_horas}` : ""} · Solicitado {fmtFecha(p.fecha_solicitud)}
                  </div>
                  <div className="text-sm text-foreground mt-1 line-clamp-2">{p.motivo}</div>
                </div>
                <button
                  onClick={() => verPDF(p)}
                  className="flex-none inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border-2 border-border font-medium hover:border-primary"
                  data-guia="permisosconsulta.boton_pdf"
                >
                  <Download className="w-4 h-4" /> PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PermisosDocentesConsulta;
