import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { getSession, puedeAccederDashboard, isAdmin, isProfesor } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useGradosColegio } from "@/utils/grados";
import SignatureCanvas from "react-signature-canvas";
import { Save, Download } from "lucide-react";

// Planilla de control — Plan de Apoyo al Mejoramiento (definitiva = Taller 40% + Sustentación 60%).
const PESTA_ID = "94c1414b-22d1-40dd-945a-5857b62e5f6c";
const CAILICO_ID = "2f96f076-83df-4b84-8bbc-9c1df79a372b"; // demo, para revisión

interface Fila { id: string; nombre: string; taller: string; sustent: string; obs: string; }

const definitiva = (f: Fila): string => {
  const t = parseFloat(f.taller), su = parseFloat(f.sustent);
  if (isNaN(t) && isNaN(su)) return "";
  const val = (isNaN(t) ? 0 : t) * 0.4 + (isNaN(su) ? 0 : su) * 0.6;
  return (Math.round(val * 100) / 100).toString();
};

const ApoyoPlanilla = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sig = useRef<SignatureCanvas>(null);
  const s = getSession();
  const { grados: gradosColegio } = useGradosColegio();

  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [salones, setSalones] = useState<string[]>([]);
  const [docente, setDocente] = useState([s.nombres, s.apellidos].filter(Boolean).join(" "));
  const [asignatura, setAsignatura] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [firma, setFirma] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!s.id || (!puedeAccederDashboard() && !isAdmin() && !isProfesor())) { navigate("/"); return; }
    if (s.colegio_id !== PESTA_ID && s.colegio_id !== CAILICO_ID) { navigate("/formatos"); return; }
  }, []);

  useEffect(() => {
    if (!grado) { setSalones([]); return; }
    (async () => {
      const { data } = await supabase.from("Estudiantes").select("salon").eq("grado", grado);
      const set = new Set<string>();
      for (const r of (data || []) as { salon: string | null }[]) if (r.salon) set.add(String(r.salon));
      setSalones([...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    })();
  }, [grado]);

  useEffect(() => {
    if (!grado || !salon) { setFilas([]); return; }
    (async () => {
      setCargando(true);
      const { data } = await supabase.from("Estudiantes").select("id, grado, salon").eq("grado", grado).eq("salon", salon);
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const ests = sortByApellidosNombres(await enrichWithNombres((data || []) as any)) as any[];
      setFilas(ests.map((e) => ({ id: String(e.id), nombre: `${e.apellidos} ${e.nombres}`.trim(), taller: "", sustent: "", obs: "" })));
      setCargando(false);
    })();
  }, [grado, salon]);

  const setFila = (i: number, k: keyof Fila, v: string) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const onFirmaEnd = () => { if (sig.current && !sig.current.isEmpty()) setFirma(sig.current.toDataURL("image/png")); };
  const limpiarFirma = () => { sig.current?.clear(); setFirma(null); };

  const armarDatos = () => ({
    tipo: "apoyo", docente, asignatura, periodo, fecha, grado, salon,
    filas: filas.map((f) => ({ ...f, definitiva: definitiva(f) })), firma,
  });

  const guardar = async (): Promise<boolean> => {
    if (!grado || !salon || !docente.trim() || !asignatura.trim() || !periodo.trim()) {
      toast({ title: "Faltan datos", description: "Grado, salón, docente, asignatura y período son obligatorios.", variant: "destructive" }); return false;
    }
    if (filas.length === 0) { toast({ title: "Sin estudiantes", description: "Elige un grado y salón con estudiantes.", variant: "destructive" }); return false; }
    setSaving(true);
    const { error } = await supabase.from("Formatos_Diligenciados").insert({
      tipo: "apoyo", titulo: `Apoyo — ${grado} ${salon} · ${asignatura}`,
      datos: armarDatos(), creado_por: s.id, creado_por_nombre: [s.cargo, s.nombres, s.apellidos].filter(Boolean).join(" "),
    });
    setSaving(false);
    if (error) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "Formato guardado", description: "Quedó registrado en la plataforma.", variant: "success" }); return true;
  };

  const descargarPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const d = new jsPDF("p", "mm", "a4");
    const W = 210, M = 12; let y = 14;
    const encabezado = () => {
      d.setFont("helvetica", "bold"); d.setFontSize(13); d.text("COLEGIO PESTALOZZIANO", W / 2, y, { align: "center" }); y += 5;
      d.setFont("helvetica", "normal"); d.setFontSize(9); d.text("Coordinación Académica y de Disciplina", W / 2, y, { align: "center" }); y += 6;
      d.setFont("helvetica", "bold"); d.setFontSize(11); d.text("PLANILLA DE CONTROL — PLAN DE APOYO AL MEJORAMIENTO ACADÉMICO", W / 2, y, { align: "center" }); y += 8;
    };
    encabezado();
    d.setFontSize(9); d.setFont("helvetica", "normal");
    d.text(`Docente: ${docente}`, M, y); d.text(`Asignatura: ${asignatura}`, W / 2, y); y += 5;
    d.text(`Período: ${periodo}`, M, y); d.text(`Fecha: ${fecha}`, W / 2, y); d.text(`Grado: ${grado} ${salon}`, W - 55, y); y += 7;
    const cols: [string, number][] = [["N°", 8], ["Nombre del estudiante", 58], ["Taller 40%", 20], ["Sust. 60%", 20], ["Definitiva", 20], ["Observ.", 30], ["Firma", 10]];
    const rowH = 8;
    const drawHead = () => {
      d.setFont("helvetica", "bold"); d.setFontSize(7.5);
      let x = M; d.rect(M, y, W - 2 * M, rowH);
      cols.forEach(([t, w]) => { d.text(t, x + 1, y + 5); x += w; if (x < W - M) d.line(x, y, x, y + rowH); });
      y += rowH; d.setFont("helvetica", "normal");
    };
    drawHead();
    filas.forEach((f, i) => {
      if (y > 275) { d.addPage(); y = 16; drawHead(); }
      let x = M; d.rect(M, y, W - 2 * M, rowH);
      const cells = [String(i + 1), f.nombre, f.taller, f.sustent, definitiva(f), f.obs, ""];
      cols.forEach(([, w], ci) => { const txt = d.splitTextToSize(String(cells[ci]), w - 2)[0] || ""; d.text(txt, x + 1, y + 5); x += w; if (x < W - M) d.line(x, y, x, y + rowH); });
      y += rowH;
    });
    y += 12;
    if (y > 250) { d.addPage(); y = 30; }
    if (firma) { try { d.addImage(firma, "PNG", M, y - 3, 50, 20); } catch { /* ignore */ } }
    d.line(M, y + 20, M + 65, y + 20); d.setFontSize(9); d.text("Firma del docente", M, y + 25);
    d.save(`Plan de Apoyo - ${grado} ${salon} - ${asignatura}.pdf`);
  };

  const guardarYDescargar = async () => { const ok = await guardar(); if (ok) await descargarPDF(); };
  const inputCls = "px-3 py-2 border border-input rounded-md text-sm bg-background w-full";

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink="/formatos" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">Plan de Apoyo al Mejoramiento</h1>
        <p className="text-muted-foreground mt-1 text-sm">La definitiva se calcula sola: Taller 40% + Sustentación 60%.</p>

        <div className="mt-6 space-y-4 bg-card rounded-lg shadow-soft p-5">
          <div className="grid md:grid-cols-3 gap-3">
            <div><label className="text-sm font-medium">Grado *</label>
              <select value={grado} onChange={(e) => { setGrado(e.target.value); setSalon(""); }} className={inputCls + " cursor-pointer"}>
                <option value="">Seleccionar</option>{gradosColegio.map((g) => <option key={g} value={g}>{g}</option>)}
              </select></div>
            <div><label className="text-sm font-medium">Salón *</label>
              <select value={salon} onChange={(e) => setSalon(e.target.value)} className={inputCls + " cursor-pointer"}>
                <option value="">Seleccionar</option>{salones.map((sa) => <option key={sa} value={sa}>{sa}</option>)}
              </select></div>
            <div><label className="text-sm font-medium">Período *</label><input value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={inputCls} placeholder="Ej. Primer período" /></div>
            <div><label className="text-sm font-medium">Docente *</label><input value={docente} onChange={(e) => setDocente(e.target.value)} className={inputCls} /></div>
            <div><label className="text-sm font-medium">Asignatura *</label><input value={asignatura} onChange={(e) => setAsignatura(e.target.value)} className={inputCls} /></div>
            <div><label className="text-sm font-medium">Fecha</label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} /></div>
          </div>

          {cargando ? <p className="text-sm text-muted-foreground">Cargando estudiantes…</p>
          : filas.length > 0 && (
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>
                  <th className="p-2 text-left w-8">#</th><th className="p-2 text-left">Estudiante</th>
                  <th className="p-2 text-left w-24">Taller 40%</th><th className="p-2 text-left w-24">Sust. 60%</th>
                  <th className="p-2 text-left w-24">Definitiva</th><th className="p-2 text-left">Observaciones</th>
                </tr></thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2">{f.nombre}</td>
                      <td className="p-2"><input value={f.taller} onChange={(e) => setFila(i, "taller", e.target.value)} className="px-2 py-1 border border-input rounded w-16 bg-background" /></td>
                      <td className="p-2"><input value={f.sustent} onChange={(e) => setFila(i, "sustent", e.target.value)} className="px-2 py-1 border border-input rounded w-16 bg-background" /></td>
                      <td className="p-2 font-semibold text-primary">{definitiva(f) || "—"}</td>
                      <td className="p-2"><input value={f.obs} onChange={(e) => setFila(i, "obs", e.target.value)} className="px-2 py-1 border border-input rounded w-full bg-background" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Firma del docente</label>
            <div className="border-2 border-dashed border-border rounded-lg bg-white mt-1">
              <SignatureCanvas ref={sig} penColor="black" canvasProps={{ className: "w-full", style: { width: "100%", height: "150px" } }} onEnd={onFirmaEnd} />
            </div>
            <div className="flex gap-2 items-center mt-1">
              <button type="button" onClick={limpiarFirma} className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:bg-accent">Limpiar firma</button>
              {firma && <span className="text-xs text-green-600 font-medium">✓ Firmado</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button onClick={guardar} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60"><Save className="w-4 h-4" /> {saving ? "Guardando…" : "Guardar"}</button>
            <button onClick={guardarYDescargar} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 border-border font-semibold hover:border-primary disabled:opacity-60"><Download className="w-4 h-4" /> Guardar y descargar PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApoyoPlanilla;
