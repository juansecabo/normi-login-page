import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isEstudiante, isPadreDeFamilia } from "@/hooks/useSession";
import { apiClient, type ApiConsolidadoGrupo } from "@/lib/apiClient";
import { useColegioConfig } from "@/hooks/useColegioConfig";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import { Users, Download, Loader2 } from "lucide-react";

const PERIODOS = [1, 2, 3, 4] as const;
const ORDINAL: Record<number, string> = { 1: "Primer", 2: "Segundo", 3: "Tercer", 4: "Cuarto" };

/**
 * "Consolidado de mi grupo": el director de grupo elige un periodo y ve UNA sola
 * rejilla (tipo Excel) — filas = estudiantes (orden alfabético), columnas =
 * asignaturas (orden alfabético), celda = definitiva del periodo. Si el periodo
 * de una asignatura no está cerrado, debajo del nombre dice "(provisional)".
 * El cálculo lo hace el server (/api/consolidado-grupo) reusando el mismo motor
 * de notas; el grupo se resuelve por Internos.direccion_de_grupo.
 */
const ConsolidadoGrupo = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { config } = useColegioConfig();
  // `ocultar_definitivas` (ej. Pestalozziano) SOLO aplica a familias (estudiante/
  // acudiente). El director de grupo es personal interno y sí ve su consolidado.
  const ocultarDef = !!(config as any).ocultar_definitivas && (isEstudiante() || isPadreDeFamilia());
  const [dirGrupo, setDirGrupo] = useState<string | null>(null);
  const [grado, setGrado] = useState<string | null>(null);
  const [salon, setSalon] = useState<string | null>(null);
  const [loadingDg, setLoadingDg] = useState(true);

  // El periodo vive en la URL (?periodo=2) para que recargar (F5) mantenga la rejilla.
  const periodoRaw = parseInt(searchParams.get("periodo") || "", 10);
  const periodo: number | null = [1, 2, 3, 4].includes(periodoRaw) ? periodoRaw : null;
  const setPeriodo = (p: number | null) => {
    if (p == null) { searchParams.delete("periodo"); setSearchParams(searchParams, { replace: true }); }
    else { searchParams.set("periodo", String(p)); setSearchParams(searchParams, { replace: true }); }
  };
  const [data, setData] = useState<ApiConsolidadoGrupo | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    (async () => {
      setLoadingDg(true);
      const { data: interno } = await supabase
        .from("Internos").select("direccion_de_grupo")
        .eq("id", parseInt(session.id!)).maybeSingle();
      const dg = ((interno as { direccion_de_grupo?: string } | null)?.direccion_de_grupo || "").trim() || null;
      setDirGrupo(dg);
      if (dg) {
        const parts = dg.split(/\s+/);
        const last = parts[parts.length - 1];
        if (parts.length > 1 && /^\d+$/.test(last)) {
          setGrado(parts.slice(0, -1).join(" ")); setSalon(last);
        } else { setGrado(dg); setSalon(null); }
      }
      setLoadingDg(false);
    })();
  }, [navigate]);

  useEffect(() => {
    if (periodo == null || !grado || !salon) return;
    let cancel = false;
    setLoadingData(true); setError(null); setData(null);
    apiClient.estadisticas.consolidadoGrupo(grado, salon, periodo)
      .then((d) => { if (!cancel) setData(d); })
      .catch((e) => { if (!cancel) setError(e?.message || "No se pudo cargar el consolidado."); })
      .finally(() => { if (!cancel) setLoadingData(false); });
    return () => { cancel = true; };
  }, [periodo, grado, salon]);

  const fmt = (n: number | undefined) =>
    n == null ? "—" : n.toFixed(config.decimales);
  // El color se decide sobre el valor YA redondeado (el mismo que se muestra):
  // una definitiva real de 2.96 se pinta "3.0" — sería confuso verla en rojo.
  const aprobada = (n: number | undefined) =>
    n != null && Number(n.toFixed(config.decimales)) >= config.nota_aprobatoria;

  // Excel del consolidado — mismo formato (header verde, bordes) que TablaNotas.
  const [descargandoExcel, setDescargandoExcel] = useState(false);
  const descargarExcel = async () => {
    if (!data || periodo == null) return;
    setDescargandoExcel(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = await import("file-saver");

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Consolidado");

      const headers: string[] = ["Estudiante"];
      data.asignaturas.forEach((a) => headers.push(a.completo ? a.nombre : `${a.nombre} (provisional)`));

      const rows: (string | number | null)[][] = data.estudiantes.map((e) => {
        const fila: (string | number | null)[] = [e.nombre];
        data.asignaturas.forEach((a) => {
          const n = e.notas[a.nombre];
          fila.push(n == null ? null : Number(n.toFixed(config.decimales)));
        });
        return fila;
      });

      const headerRow = ws.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" }, bottom: { style: "thin" },
          left: { style: "thin" }, right: { style: "thin" },
        };
      });
      headerRow.height = 22;

      rows.forEach((row) => {
        const dataRow = ws.addRow(row);
        dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFD0D0D0" } },
            bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
            left: { style: "thin", color: { argb: "FFD0D0D0" } },
            right: { style: "thin", color: { argb: "FFD0D0D0" } },
          };
          if (colNumber >= 2) cell.alignment = { horizontal: "center" };
        });
      });

      ws.columns.forEach((col, idx) => {
        let maxLen = headers[idx]?.length || 10;
        rows.forEach((row) => {
          const val = row[idx];
          if (val !== null && val !== undefined) maxLen = Math.max(maxLen, val.toString().length);
        });
        col.width = Math.min(maxLen + 4, 40);
      });

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Consolidado ${dirGrupo} - ${ORDINAL[periodo]} periodo.xlsx`);
    } catch (e) {
      console.error("Error al generar Excel:", e);
    } finally {
      setDescargandoExcel(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/direccion-grupo")} className="text-primary hover:underline">Dirección de grupo</button>
            <span className="text-muted-foreground">&rarr;</span>
            {periodo == null ? (
              <span className="text-foreground font-medium">Consolidado de mi grupo</span>
            ) : (
              <>
                <button onClick={() => setPeriodo(null)} className="text-primary hover:underline">Consolidado de mi grupo</button>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="text-foreground font-medium">{ORDINAL[periodo]} periodo</span>
              </>
            )}
          </div>
        </div>

        {loadingDg ? (
          <p className="text-center text-muted-foreground py-10">Cargando…</p>
        ) : !dirGrupo ? (
          <div className="text-center text-muted-foreground py-10 flex flex-col items-center gap-2">
            <Users className="w-8 h-8 opacity-40" />
            No eres director de grupo de ningún salón.
          </div>
        ) : periodo == null ? (
          /* ── Selector de periodo ─────────────────────────────── */
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-foreground mb-1 text-center">Consolidado de mi grupo</h2>
            <p className="text-sm text-muted-foreground mb-1 text-center">
              <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                <Users className="w-4 h-4" /> {dirGrupo}
              </span>
            </p>
            <p className="text-sm text-muted-foreground mb-6 text-center">Elige un periodo para ver las definitivas de tus estudiantes.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {PERIODOS.map((p) => (
                <button key={p} onClick={() => setPeriodo(p)}
                  className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-border bg-card transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/5">
                  <span className="text-3xl font-bold text-primary">{p}º</span>
                  <span className="text-sm font-medium text-foreground">{ORDINAL[p]} periodo</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Rejilla del periodo ─────────────────────────────── */
          <div>
            <h2 className="text-xl font-bold text-foreground mb-4 text-center">
              {ORDINAL[periodo]} periodo · {dirGrupo}
            </h2>

            {!ocultarDef && data && data.estudiantes.length > 0 && data.asignaturas.length > 0 && (
              <div className="flex justify-end mb-3">
                <button
                  onClick={descargarExcel}
                  disabled={descargandoExcel}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-secondary/50 transition-colors disabled:opacity-50"
                >
                  {descargandoExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Descargar Excel
                </button>
              </div>
            )}

            {ocultarDef ? (
              <p className="text-center text-muted-foreground py-10 max-w-md mx-auto">
                El consolidado de definitivas no está habilitado en esta institución. Las notas finales se entregan por los canales oficiales del colegio (boletín).
              </p>
            ) : loadingData ? (
              <p className="text-center text-muted-foreground py-10">Cargando notas…</p>
            ) : error ? (
              <p className="text-center text-destructive py-10">{error}</p>
            ) : !data || data.estudiantes.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No hay estudiantes en este grupo.</p>
            ) : data.asignaturas.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No hay notas registradas en este periodo.</p>
            ) : (
              <div className="max-h-[72vh] overflow-auto rounded-lg border border-border shadow-soft">
                <table className="border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky top-0 md:left-0 z-30 bg-muted border-r border-b border-border px-3 py-2 text-left font-semibold text-foreground min-w-[200px]">
                        Estudiante
                      </th>
                      {data.asignaturas.map((a) => (
                        <th key={a.nombre} className="sticky top-0 z-20 bg-muted border-r border-b border-border px-2 py-2 text-center font-semibold text-foreground align-bottom min-w-[90px] max-w-[120px]">
                          <div className="leading-tight break-words">{a.nombre}</div>
                          {!a.completo && (
                            <div className="text-[10px] font-normal italic text-amber-600 mt-0.5">(provisional)</div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.estudiantes.map((e, i) => {
                      const rowBg = i % 2 ? "bg-card" : "bg-muted/40";
                      return (
                        <tr key={e.id} className={rowBg}>
                          <td className="md:sticky md:left-0 z-10 bg-card border-r border-b border-border px-3 py-2 font-medium text-foreground whitespace-nowrap">
                            {e.nombre}
                          </td>
                          {data.asignaturas.map((a) => {
                            const n = e.notas[a.nombre];
                            return (
                              <td key={a.nombre}
                                className={`border-r border-b border-border px-2 py-2 text-center tabular-nums font-semibold ${
                                  n == null ? "text-muted-foreground" : aprobada(n) ? "text-emerald-700" : "text-red-600"
                                }`}>
                                {fmt(n)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ConsolidadoGrupo;
