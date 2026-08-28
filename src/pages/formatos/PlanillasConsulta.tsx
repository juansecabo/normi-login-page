import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { getSession, puedeAccederDashboard, isAdmin, isProfesor } from "@/hooks/useSession";
import { apiRequest } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, Loader2 } from "lucide-react";

interface Formato {
  id: number;
  tipo: string;
  titulo: string | null;
  datos: any;
  creado_por: string | null;
  creado_por_nombre: string | null;
  created_at: string;
}

const TIPO_NOMBRE: Record<string, string> = {
  nivelacion: "Plan de Nivelación",
  apoyo: "Plan de Apoyo al Mejoramiento",
};

const PlanillasConsulta = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const s = getSession();
  const [formatos, setFormatos] = useState<Formato[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!s.id || (!puedeAccederDashboard() && !isAdmin() && !isProfesor())) { navigate("/"); return; }
    (async () => {
      try {
        const r = await apiRequest<{ formatos: Formato[] }>("/api/formatos?tipo=nivelacion,apoyo");
        setFormatos(r.formatos || []);
      } catch (e: any) {
        toast({ title: "No se pudieron cargar", description: e?.message || "Intenta de nuevo.", variant: "destructive" });
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const colegioNombre = (s.colegio_nombre || "Institución Educativa").toUpperCase();

  const pdfNivelacion = (d: any, D: any) => {
    const W = 210, M = 12; let y = 14;
    D.setFont("helvetica", "bold"); D.setFontSize(13); D.text(colegioNombre, W / 2, y, { align: "center" }); y += 5;
    D.setFont("helvetica", "normal"); D.setFontSize(9); D.text("Coordinación Académica y de Disciplina", W / 2, y, { align: "center" }); y += 6;
    D.setFont("helvetica", "bold"); D.setFontSize(11); D.text("PLANILLA DE CONTROL — PLAN DE NIVELACIÓN POR PERÍODO ACADÉMICO", W / 2, y, { align: "center" }); y += 8;
    D.setFontSize(9); D.setFont("helvetica", "normal");
    D.text(`Docente: ${d.docente || ""}`, M, y); D.text(`Asignatura: ${d.asignatura || ""}`, W / 2, y); y += 5;
    D.text(`Período: ${d.periodo || ""}`, M, y); D.text(`Fecha: ${d.fecha || ""}`, W / 2, y); D.text(`Grado: ${d.grado || ""} ${d.salon || ""}`, W - 55, y); y += 7;
    const cols: [string, number][] = [["N°", 10], ["Nombre del estudiante", 70], ["Nota def.", 20], ["Observaciones", 55], ["Firma", 29]];
    const rowH = 10;
    const drawHead = () => {
      D.setFont("helvetica", "bold"); D.setFontSize(8);
      let x = M; D.rect(M, y, W - 2 * M, 8);
      cols.forEach(([t, w]) => { D.text(t, x + 1.5, y + 5); x += w; if (x < W - M) D.line(x, y, x, y + 8); });
      y += 8; D.setFont("helvetica", "normal");
    };
    drawHead();
    (d.filas || []).forEach((f: any, i: number) => {
      if (y > 272) { D.addPage(); y = 16; drawHead(); }
      let x = M; D.rect(M, y, W - 2 * M, rowH);
      const cells = [String(i + 1), f.nombre, f.nota, f.obs];
      cols.forEach(([, w], ci) => {
        if (ci < 4) { const txt = D.splitTextToSize(String(cells[ci] ?? ""), w - 3)[0] || ""; D.text(txt, x + 1.5, y + 6); }
        else if (f.firma) { try { D.addImage(f.firma, "PNG", x + 1, y + 1, w - 2, rowH - 2); } catch { /* ignore */ } }
        x += w; if (x < W - M) D.line(x, y, x, y + rowH);
      });
      y += rowH;
    });
    y += 12;
    if (y > 250) { D.addPage(); y = 30; }
    if (d.firmaDocente) { try { D.addImage(d.firmaDocente, "PNG", M, y - 3, 50, 20); } catch { /* ignore */ } }
    D.line(M, y + 20, M + 65, y + 20); D.setFontSize(9); D.text("Firma del docente", M, y + 25);
  };

  const pdfApoyo = (d: any, D: any) => {
    const W = 210, M = 12; let y = 14;
    D.setFont("helvetica", "bold"); D.setFontSize(13); D.text(colegioNombre, W / 2, y, { align: "center" }); y += 5;
    D.setFont("helvetica", "normal"); D.setFontSize(9); D.text("Coordinación Académica y de Disciplina", W / 2, y, { align: "center" }); y += 6;
    D.setFont("helvetica", "bold"); D.setFontSize(11); D.text("PLANILLA DE CONTROL — PLAN DE APOYO AL MEJORAMIENTO ACADÉMICO", W / 2, y, { align: "center" }); y += 8;
    D.setFontSize(9); D.setFont("helvetica", "normal");
    D.text(`Docente: ${d.docente || ""}`, M, y); D.text(`Asignatura: ${d.asignatura || ""}`, W / 2, y); y += 5;
    D.text(`Período: ${d.periodo || ""}`, M, y); D.text(`Fecha: ${d.fecha || ""}`, W / 2, y); D.text(`Grado: ${d.grado || ""} ${d.salon || ""}`, W - 55, y); y += 7;
    const cols: [string, number][] = [["N°", 8], ["Nombre del estudiante", 58], ["Taller 40%", 20], ["Sust. 60%", 20], ["Definitiva", 20], ["Observ.", 30], ["Firma", 10]];
    const rowH = 8;
    const drawHead = () => {
      D.setFont("helvetica", "bold"); D.setFontSize(7.5);
      let x = M; D.rect(M, y, W - 2 * M, rowH);
      cols.forEach(([t, w]) => { D.text(t, x + 1, y + 5); x += w; if (x < W - M) D.line(x, y, x, y + rowH); });
      y += rowH; D.setFont("helvetica", "normal");
    };
    drawHead();
    (d.filas || []).forEach((f: any, i: number) => {
      if (y > 275) { D.addPage(); y = 16; drawHead(); }
      let x = M; D.rect(M, y, W - 2 * M, rowH);
      const cells = [String(i + 1), f.nombre, f.taller, f.sustent, f.definitiva ?? "", f.obs, ""];
      cols.forEach(([, w], ci) => { const txt = D.splitTextToSize(String(cells[ci] ?? ""), w - 2)[0] || ""; D.text(txt, x + 1, y + 5); x += w; if (x < W - M) D.line(x, y, x, y + rowH); });
      y += rowH;
    });
    y += 12;
    if (y > 250) { D.addPage(); y = 30; }
    if (d.firma) { try { D.addImage(d.firma, "PNG", M, y - 3, 50, 20); } catch { /* ignore */ } }
    D.line(M, y + 20, M + 65, y + 20); D.setFontSize(9); D.text("Firma del docente", M, y + 25);
  };

  const verPDF = async (fmt: Formato) => {
    const { default: jsPDF } = await import("jspdf");
    const D = new jsPDF("p", "mm", "a4");
    const d = fmt.datos || {};
    if (fmt.tipo === "apoyo") pdfApoyo(d, D); else pdfNivelacion(d, D);
    const nombre = TIPO_NOMBRE[fmt.tipo] || "Formato";
    D.save(`${nombre} - ${d.grado || ""} ${d.salon || ""} - ${d.asignatura || ""}.pdf`);
  };

  const fmtFecha = (f: string) => f ? new Date(f).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—";

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
            <span className="text-foreground font-medium">Planillas diligenciadas</span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground">Planillas diligenciadas</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isProfesor() ? "Tus planillas de nivelación y apoyo." : "Planillas de nivelación y apoyo diligenciadas por los docentes."}
        </p>

        {cargando ? (
          <div className="mt-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div>
        ) : formatos.length === 0 ? (
          <div className="mt-8 text-center text-muted-foreground bg-card rounded-lg shadow-soft p-8">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
            Aún no hay planillas diligenciadas.
          </div>
        ) : (
          <div className="mt-6 space-y-3" data-guia="planillas.lista">
            {formatos.map((f) => {
              const d = f.datos || {};
              const nEst = Array.isArray(d.filas) ? d.filas.length : 0;
              return (
                <div key={f.id} className="bg-card rounded-lg shadow-soft p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{TIPO_NOMBRE[f.tipo] || f.tipo}</span>
                      <span className="font-semibold text-foreground">{d.grado || ""} {d.salon || ""} · {d.asignatura || ""}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Docente: {d.docente || f.creado_por_nombre || "—"}
                      {d.periodo ? ` · ${d.periodo}` : ""} · {nEst} estudiante{nEst === 1 ? "" : "s"} · {fmtFecha(f.created_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => verPDF(f)}
                    className="flex-none inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border-2 border-border font-medium hover:border-primary"
                    data-guia="planillas.boton_pdf"
                  >
                    <Download className="w-4 h-4" /> PDF
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanillasConsulta;
