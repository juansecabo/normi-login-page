import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { getSession, puedeAccederDashboard, isAdmin, isProfesor } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { rankGrado } from "@/utils/grados";
import SignatureCanvas from "react-signature-canvas";
import { Save, Download, Plus, X } from "lucide-react";

// Planilla de control — Plan de Nivelación por período (exclusivo del Pestalozziano; Cailico demo).
const PESTA_ID = "94c1414b-22d1-40dd-945a-5857b62e5f6c";
const CAILICO_ID = "2f96f076-83df-4b84-8bbc-9c1df79a372b"; // demo, para revisión

interface AsignacionRow {
  "Asignatura(s)": string[] | string[][];
  "Grado(s)": string[] | string[][];
  "Salon(es)": string[] | string[][];
}
interface Fila { id: string; nombre: string; nota: string; obs: string; firma: string | null; }

const NivelacionPlanilla = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sigDocente = useRef<SignatureCanvas>(null);
  const sigModal = useRef<SignatureCanvas>(null);
  const s = getSession();
  const docente = [s.nombres, s.apellidos].filter(Boolean).join(" ");

  const [asignaciones, setAsignaciones] = useState<AsignacionRow[]>([]);
  const [asignaturas, setAsignaturas] = useState<string[]>([]);
  const [asignatura, setAsignatura] = useState("");
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));

  const [pool, setPool] = useState<{ id: string; nombre: string }[]>([]);
  const [porAgregar, setPorAgregar] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargandoPool, setCargandoPool] = useState(false);

  const [firmaDocente, setFirmaDocente] = useState<string | null>(null);
  const [firmandoIdx, setFirmandoIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!s.id || (!puedeAccederDashboard() && !isAdmin() && !isProfesor())) { navigate("/"); return; }
    if (s.colegio_id !== PESTA_ID && s.colegio_id !== CAILICO_ID) { navigate("/formatos"); return; }
    (async () => {
      try {
        const { data } = await supabase
          .from("Asignación Profesores")
          .select('"Asignatura(s)", "Grado(s)", "Salon(es)"')
          .eq("id", parseInt(s.id!));
        const rows = (data || []) as AsignacionRow[];
        setAsignaciones(rows);
        const todas = rows.flatMap((a) => (a["Asignatura(s)"] || []) as string[]).flat() as string[];
        setAsignaturas([...new Set(todas)].sort((a, b) => a.localeCompare(b, "es")));
      } catch { /* ignore */ }
    })();
  }, []);

  // Grados y salones dependen de la asignatura elegida (solo lo que el docente dicta).
  const grados = useMemo(() => {
    if (!asignatura) return [];
    const f = asignaciones.filter((a) => ((a["Asignatura(s)"] || []).flat() as string[]).includes(asignatura));
    return [...new Set(f.flatMap((a) => (a["Grado(s)"] || []).flat() as string[]))].sort((a, b) => rankGrado(a) - rankGrado(b));
  }, [asignatura, asignaciones]);

  const salones = useMemo(() => {
    if (!asignatura || !grado) return [];
    const f = asignaciones.filter((a) => {
      const asigs = (a["Asignatura(s)"] || []).flat() as string[];
      const grads = (a["Grado(s)"] || []).flat() as string[];
      return asigs.includes(asignatura) && grads.includes(grado);
    });
    return [...new Set(f.flatMap((a) => (a["Salon(es)"] || []).flat() as string[]))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [asignatura, grado, asignaciones]);

  // Al elegir grado+salón, cargamos el POOL de estudiantes (no la planilla) para escogerlos.
  useEffect(() => {
    setFilas([]); setPorAgregar("");
    if (!grado || !salon) { setPool([]); return; }
    (async () => {
      setCargandoPool(true);
      const { data } = await supabase.from("Estudiantes").select("id, grado, salon").eq("grado", grado).eq("salon", salon);
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const ests = sortByApellidosNombres(await enrichWithNombres((data || []) as any)) as any[];
      setPool(ests.map((e) => ({ id: String(e.id), nombre: `${e.apellidos} ${e.nombres}`.trim() })));
      setCargandoPool(false);
    })();
  }, [grado, salon]);

  const disponibles = useMemo(() => {
    const usados = new Set(filas.map((f) => f.id));
    return pool.filter((p) => !usados.has(p.id));
  }, [pool, filas]);

  const agregar = () => {
    const p = pool.find((x) => x.id === porAgregar);
    if (!p) return;
    setFilas((f) => [...f, { id: p.id, nombre: p.nombre, nota: "", obs: "", firma: null }]);
    setPorAgregar("");
  };
  const quitar = (i: number) => setFilas((f) => f.filter((_, j) => j !== i));
  const setFila = (i: number, k: keyof Fila, v: string) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  // Firma del docente.
  const onFirmaDocente = () => { if (sigDocente.current && !sigDocente.current.isEmpty()) setFirmaDocente(sigDocente.current.toDataURL("image/png")); };
  const limpiarFirmaDocente = () => { sigDocente.current?.clear(); setFirmaDocente(null); };

  // Firma por estudiante (modal).
  const abrirFirma = (i: number) => setFirmandoIdx(i);
  const guardarFirmaEstudiante = () => {
    if (firmandoIdx === null) return;
    if (sigModal.current && !sigModal.current.isEmpty()) {
      const url = sigModal.current.toDataURL("image/png");
      setFilas((f) => f.map((x, j) => (j === firmandoIdx ? { ...x, firma: url } : x)));
    }
    setFirmandoIdx(null);
  };

  const armarDatos = () => ({ tipo: "nivelacion", docente, asignatura, periodo, fecha, grado, salon, filas, firmaDocente });

  const guardar = async (): Promise<boolean> => {
    if (!asignatura || !grado || !salon || !periodo.trim()) {
      toast({ title: "Faltan datos", description: "Asignatura, grado, salón y período son obligatorios.", variant: "destructive" }); return false;
    }
    if (filas.length === 0) { toast({ title: "Sin estudiantes", description: "Agrega al menos un estudiante a la planilla.", variant: "destructive" }); return false; }
    setSaving(true);
    try {
      await apiRequest("/api/formatos", {
        method: "POST",
        body: JSON.stringify({
          tipo: "nivelacion",
          titulo: `Nivelación — ${grado} ${salon} · ${asignatura}`,
          datos: armarDatos(),
          grado,
          notificar: true,
        }),
      });
      toast({ title: "Formato guardado", description: "Quedó registrado y se notificó al rector y a tu coordinador.", variant: "success" });
      return true;
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.body?.detail || e?.message || "Intenta de nuevo.", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const descargarPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const d = new jsPDF("p", "mm", "a4");
    const W = 210, M = 12; let y = 14;
    d.setFont("helvetica", "bold"); d.setFontSize(13); d.text("COLEGIO PESTALOZZIANO", W / 2, y, { align: "center" }); y += 5;
    d.setFont("helvetica", "normal"); d.setFontSize(9); d.text("Coordinación Académica y de Disciplina", W / 2, y, { align: "center" }); y += 6;
    d.setFont("helvetica", "bold"); d.setFontSize(11); d.text("PLANILLA DE CONTROL — PLAN DE NIVELACIÓN POR PERÍODO ACADÉMICO", W / 2, y, { align: "center" }); y += 8;
    d.setFontSize(9); d.setFont("helvetica", "normal");
    d.text(`Docente: ${docente}`, M, y); d.text(`Asignatura: ${asignatura}`, W / 2, y); y += 5;
    d.text(`Período: ${periodo}`, M, y); d.text(`Fecha: ${fecha}`, W / 2, y); d.text(`Grado: ${grado} ${salon}`, W - 55, y); y += 7;
    const cols: [string, number][] = [["N°", 10], ["Nombre del estudiante", 70], ["Nota def.", 20], ["Observaciones", 55], ["Firma", 29]];
    const rowH = 10;
    const drawHead = () => {
      d.setFont("helvetica", "bold"); d.setFontSize(8);
      let x = M; d.rect(M, y, W - 2 * M, 8);
      cols.forEach(([t, w]) => { d.text(t, x + 1.5, y + 5); x += w; if (x < W - M) d.line(x, y, x, y + 8); });
      y += 8; d.setFont("helvetica", "normal");
    };
    drawHead();
    filas.forEach((f, i) => {
      if (y > 272) { d.addPage(); y = 16; drawHead(); }
      let x = M; d.rect(M, y, W - 2 * M, rowH);
      const cells = [String(i + 1), f.nombre, f.nota, f.obs];
      cols.forEach(([, w], ci) => {
        if (ci < 4) { const txt = d.splitTextToSize(String(cells[ci] ?? ""), w - 3)[0] || ""; d.text(txt, x + 1.5, y + 6); }
        else if (f.firma) { try { d.addImage(f.firma, "PNG", x + 1, y + 1, w - 2, rowH - 2); } catch { /* ignore */ } }
        x += w; if (x < W - M) d.line(x, y, x, y + rowH);
      });
      y += rowH;
    });
    y += 12;
    if (y > 250) { d.addPage(); y = 30; }
    if (firmaDocente) { try { d.addImage(firmaDocente, "PNG", M, y - 3, 50, 20); } catch { /* ignore */ } }
    d.line(M, y + 20, M + 65, y + 20); d.setFontSize(9); d.text("Firma del docente", M, y + 25);
    d.save(`Plan de Nivelación - ${grado} ${salon} - ${asignatura}.pdf`);
  };

  const guardarYDescargar = async () => { const ok = await guardar(); if (ok) await descargarPDF(); };
  const inputCls = "px-3 py-2 border border-input rounded-md text-sm bg-background w-full";

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink="/formatos" />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <button onClick={() => navigate("/formatos")} className="text-primary hover:underline">Formatos</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Plan de Nivelación por período</span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground">Plan de Nivelación por período</h1>
        <p className="text-muted-foreground mt-1 text-sm">Elige asignatura, grado y salón; agrega los estudiantes que necesites, registra la nota, que firmen, y guarda.</p>

        <div className="mt-6 space-y-4 bg-card rounded-lg shadow-soft p-5">
          <div className="grid md:grid-cols-3 gap-3">
            <div><label className="text-sm font-medium">Asignatura *</label>
              <select value={asignatura} onChange={(e) => { setAsignatura(e.target.value); setGrado(""); setSalon(""); }} className={inputCls + " cursor-pointer"} data-guia="nivelacion.select_asignatura">
                <option value="">Seleccionar</option>{asignaturas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select></div>
            <div><label className="text-sm font-medium">Grado *</label>
              <select value={grado} onChange={(e) => { setGrado(e.target.value); setSalon(""); }} disabled={!asignatura} className={inputCls + " cursor-pointer disabled:opacity-60"} data-guia="nivelacion.select_grado">
                <option value="">Seleccionar</option>{grados.map((g) => <option key={g} value={g}>{g}</option>)}
              </select></div>
            <div><label className="text-sm font-medium">Salón *</label>
              <select value={salon} onChange={(e) => setSalon(e.target.value)} disabled={!grado} className={inputCls + " cursor-pointer disabled:opacity-60"} data-guia="nivelacion.select_salon">
                <option value="">Seleccionar</option>{salones.map((sa) => <option key={sa} value={sa}>{sa}</option>)}
              </select></div>
            <div><label className="text-sm font-medium">Período *</label><input value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={inputCls} placeholder="Ej. Primer período" data-guia="nivelacion.periodo" /></div>
            <div><label className="text-sm font-medium">Docente</label><input value={docente} readOnly disabled className={inputCls + " bg-muted/50 text-muted-foreground cursor-not-allowed"} /></div>
            <div><label className="text-sm font-medium">Fecha</label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} data-guia="nivelacion.fecha" /></div>
          </div>

          {/* Selector de estudiantes: se agregan uno a uno */}
          {grado && salon && (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium">Agregar estudiante</label>
                <select value={porAgregar} onChange={(e) => setPorAgregar(e.target.value)} disabled={cargandoPool} className={inputCls + " cursor-pointer disabled:opacity-60"} data-guia="nivelacion.agregar_estudiante">
                  <option value="">{cargandoPool ? "Cargando…" : disponibles.length ? "Elige un estudiante…" : "No quedan estudiantes por agregar"}</option>
                  {disponibles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <button type="button" onClick={agregar} disabled={!porAgregar} className="inline-flex items-center gap-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50" data-guia="nivelacion.boton_agregar_estudiante"><Plus className="w-4 h-4" /> Agregar</button>
            </div>
          )}

          {filas.length > 0 && (
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>
                  <th className="p-2 text-left w-8">#</th><th className="p-2 text-left">Estudiante</th>
                  <th className="p-2 text-left w-24">Nota def.</th><th className="p-2 text-left">Observaciones</th>
                  <th className="p-2 text-left w-32">Firma estudiante</th><th className="p-2 w-8"></th>
                </tr></thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2">{f.nombre}</td>
                      <td className="p-2"><input value={f.nota} onChange={(e) => setFila(i, "nota", e.target.value)} className="px-2 py-1 border border-input rounded w-20 bg-background" data-guia="nivelacion.fila_nota" /></td>
                      <td className="p-2"><input value={f.obs} onChange={(e) => setFila(i, "obs", e.target.value)} className="px-2 py-1 border border-input rounded w-full bg-background" /></td>
                      <td className="p-2">
                        {f.firma
                          ? <button type="button" onClick={() => abrirFirma(i)} className="flex items-center gap-1"><img src={f.firma} alt="firma" className="h-8 border border-border rounded bg-white" /><span className="text-xs text-green-600">✓</span></button>
                          : <button type="button" onClick={() => abrirFirma(i)} className="text-xs px-3 py-1 rounded border border-primary text-primary hover:bg-primary/5" data-guia="nivelacion.fila_firmar">Firmar</button>}
                      </td>
                      <td className="p-2 text-center"><button type="button" onClick={() => quitar(i)} className="text-muted-foreground hover:text-red-600"><X className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Firma del docente</label>
            <div className="border-2 border-dashed border-border rounded-lg bg-white mt-1" data-guia="nivelacion.firma_docente">
              <SignatureCanvas ref={sigDocente} penColor="black" canvasProps={{ className: "w-full", style: { width: "100%", height: "150px" } }} onEnd={onFirmaDocente} />
            </div>
            <div className="flex gap-2 items-center mt-1">
              <button type="button" onClick={limpiarFirmaDocente} className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:bg-accent">Limpiar firma</button>
              {firmaDocente && <span className="text-xs text-green-600 font-medium">✓ Firmado</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button onClick={guardar} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60" data-guia="nivelacion.boton_guardar"><Save className="w-4 h-4" /> {saving ? "Guardando…" : "Guardar"}</button>
            <button onClick={guardarYDescargar} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 border-border font-semibold hover:border-primary disabled:opacity-60"><Download className="w-4 h-4" /> Guardar y descargar PDF</button>
          </div>
        </div>
      </main>

      {/* Modal de firma del estudiante */}
      {firmandoIdx !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setFirmandoIdx(null)}>
          <div className="bg-card rounded-lg shadow-lg p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground">Firma de {filas[firmandoIdx]?.nombre}</h3>
            <p className="text-xs text-muted-foreground mb-2">El estudiante firma con el dedo.</p>
            <div className="border-2 border-dashed border-border rounded-lg bg-white">
              <SignatureCanvas ref={sigModal} penColor="black" canvasProps={{ className: "w-full", style: { width: "100%", height: "160px" } }} />
            </div>
            <div className="flex justify-between gap-2 mt-3">
              <button type="button" onClick={() => sigModal.current?.clear()} className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:bg-accent">Limpiar</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setFirmandoIdx(null)} className="px-4 py-1.5 rounded-md border border-border text-sm">Cancelar</button>
                <button type="button" onClick={guardarFirmaEstudiante} className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium">Guardar firma</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NivelacionPlanilla;
