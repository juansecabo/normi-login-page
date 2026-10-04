import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";
import { useEstructuraOrden } from "@/utils/estructuraOrden";
import { errorDe } from "./comun";

/** Paz y salvo de biblioteca por salón: quién no debe libros y quién sí (con cuáles). */
interface EstPaz { id: string; nombres: string; apellidos: string; grado: string; salon: string; paz_y_salvo: boolean; pendientes: string[] }

const PazYSalvo = () => {
  const { gradoRank } = useEstructuraOrden();
  const [salones, setSalones] = useState<{ grado: string; salon: string }[]>([]);
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [lista, setLista] = useState<EstPaz[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { apiRequest<{ salones: { grado: string; salon: string }[] }>("/api/biblioteca/salones").then((r) => setSalones(r.salones)).catch(() => setSalones([])); }, []);
  const grados = useMemo(() => [...new Set(salones.map((s) => s.grado))].sort((a, b) => gradoRank(a) - gradoRank(b) || a.localeCompare(b, "es")), [salones, gradoRank]);
  const salonesDe = useMemo(() => salones.filter((s) => s.grado === grado).map((s) => s.salon).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [salones, grado]);

  useEffect(() => {
    if (!grado) { setLista(null); return; }
    setCargando(true); setError("");
    apiRequest<{ estudiantes: EstPaz[] }>(`/api/biblioteca/paz-y-salvo?grado=${encodeURIComponent(grado)}${salon ? `&salon=${encodeURIComponent(salon)}` : ""}`)
      .then((r) => setLista(r.estudiantes)).catch((err) => setError(errorDe(err))).finally(() => setCargando(false));
  }, [grado, salon]);

  const deben = (lista || []).filter((e) => !e.paz_y_salvo);
  const excel = async () => {
    if (!lista) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Paz y salvo");
    ws.columns = [{ header: "Apellidos", width: 28 }, { header: "Nombres", width: 26 }, { header: "Grado", width: 14 }, { header: "Salón", width: 8 }, { header: "Paz y salvo", width: 12 }, { header: "Libros pendientes", width: 60 }];
    ws.getRow(1).font = { bold: true };
    for (const e of lista) ws.addRow([e.apellidos, e.nombres, e.grado, e.salon, e.paz_y_salvo ? "Sí" : "No", e.pendientes.join("; ")]);
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `Paz y salvo biblioteca ${grado}${salon ? ` ${salon}` : ""}.xlsx`;
    a.click();
  };

  const sel = "px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer";
  return (
    <div className="space-y-4" data-guia="biblioteca.paz_y_salvo">
      <div className="flex flex-wrap gap-2 items-center">
        <select value={grado} onChange={(e) => { setGrado(e.target.value); setSalon(""); }} className={sel}>
          <option value="">Elige el grado</option>
          {grados.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={salon} onChange={(e) => setSalon(e.target.value)} className={sel} disabled={!grado}>
          <option value="">Todos los salones</option>
          {salonesDe.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {lista && lista.length > 0 && <Button variant="outline" size="sm" onClick={excel}><Download className="w-4 h-4 mr-1" /> Excel</Button>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {cargando && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
      {!cargando && lista && (
        <>
          <p className="text-sm text-muted-foreground">{lista.length} estudiantes · {deben.length ? `${deben.length} deben libros` : "todos a paz y salvo"}</p>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {[...deben, ...lista.filter((e) => e.paz_y_salvo)].map((e) => (
              <div key={e.id} className="px-3 py-2 text-sm flex items-start gap-2">
                {e.paz_y_salvo ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-foreground">{e.apellidos} {e.nombres} <span className="text-muted-foreground">· {e.grado} {e.salon}</span></p>
                  {!e.paz_y_salvo && <p className="text-rose-700 text-xs">Debe: {e.pendientes.join(", ")}</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PazYSalvo;
