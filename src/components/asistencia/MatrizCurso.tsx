import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X, Search } from "lucide-react";
import { apiClient, type AsistenciaEstado, type AsistenciaHistorial, type AsistenciaHistorialEstudiante } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { ESTADO_UI, ESTADOS_LISTA, resumen } from "./estados";

interface Props {
  asignatura: string;
  grado: string;
  salon: string;
  desde: string;
  hasta: string;
  rangoLabel: string;
  puedeEditar: boolean;
  onAbrirCalendario: (est: AsistenciaHistorialEstudiante) => void;
}

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// "2026-06-07" -> "7 jun" (sin ambigüedad día/mes).
const fechaCorta = (f: string) => `${parseInt(f.slice(8), 10)} ${MES_CORTO[parseInt(f.slice(5, 7), 10) - 1]}`;

const MatrizCurso = ({ asignatura, grado, salon, desde, hasta, rangoLabel, puedeEditar, onAbrirCalendario }: Props) => {
  const { toast } = useToast();
  const [data, setData] = useState<AsistenciaHistorial>({ estudiantes: [], registros: [] });
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState<{ id: string; nombre: string; fecha: string; rect: DOMRect } | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Popover anclado a la celda (posición + animación de entrada/salida).
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; place: "top" | "bottom"; caret: number } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    let cancel = false;
    setLoading(true); setEditando(null);
    apiClient.asistencia.historial(asignatura, grado, salon, desde, hasta)
      .then((r) => { if (!cancel) setData(r); })
      .catch(() => { if (!cancel) setData({ estudiantes: [], registros: [] }); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [asignatura, grado, salon, desde, hasta]);

  // Fechas (columnas) = días en que se tomó asistencia, ordenadas.
  const fechas = useMemo(
    () => [...new Set(data.registros.map((r) => r.fecha))].sort(),
    [data.registros],
  );
  // Map estudiante -> fecha -> estado.
  const mapa = useMemo(() => {
    const m = new Map<string, Map<string, AsistenciaEstado>>();
    for (const r of data.registros) {
      if (!m.has(r.estudiante_id)) m.set(r.estudiante_id, new Map());
      m.get(r.estudiante_id)!.set(r.fecha, r.estado);
    }
    return m;
  }, [data.registros]);

  // Filtro "ver solo un estudiante" (por nombre/apellido).
  const estudiantesVisibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return data.estudiantes;
    return data.estudiantes.filter((e) => `${e.apellidos} ${e.nombres}`.toLowerCase().includes(f));
  }, [data.estudiantes, filtro]);

  // Un solo día → el % no aporta (siempre 0 o 100%): se oculta.
  const unDia = desde === hasta;

  // Abre el popover anclado a la celda tocada (resetea la animación de entrada).
  const abrir = (id: string, nombre: string, fecha: string, el: HTMLElement) => {
    setAbierto(false);
    setPos(null);
    setEditando({ id, nombre, fecha, rect: el.getBoundingClientRect() });
  };

  // Cierra con animación de salida.
  const cerrar = () => {
    setAbierto(false);
    window.setTimeout(() => { setEditando(null); setPos(null); }, 150);
  };

  // Posiciona el globo respecto a la celda (preferir abajo; si no cabe, arriba).
  useLayoutEffect(() => {
    if (!editando || !popRef.current) return;
    const cell = editando.rect;
    const w = popRef.current.offsetWidth;
    const h = popRef.current.offsetHeight;
    const GAP = 10, M = 8;
    const cx = cell.left + cell.width / 2;
    let left = cx - w / 2;
    left = Math.max(M, Math.min(left, window.innerWidth - w - M));
    const cabeAbajo = cell.bottom + GAP + h <= window.innerHeight - M;
    const place: "top" | "bottom" = cabeAbajo ? "bottom" : "top";
    const top = place === "bottom" ? cell.bottom + GAP : cell.top - GAP - h;
    const caret = Math.max(16, Math.min(cx - left, w - 16));
    setPos({ left, top, place, caret });
  }, [editando]);

  // Dispara la animación de entrada una vez posicionado.
  useEffect(() => {
    if (!pos) return;
    const r = requestAnimationFrame(() => setAbierto(true));
    return () => cancelAnimationFrame(r);
  }, [pos]);

  // Cerrar con tecla Escape.
  useEffect(() => {
    if (!editando) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editando]);

  const setEstado = async (estado: AsistenciaEstado) => {
    if (!editando || guardando) return;
    setGuardando(true);
    try {
      const res = await apiClient.asistencia.marcar({ asignatura, grado, salon, fecha: editando.fecha, estudiante_id: editando.id, estado });
      setData((prev) => {
        const otros = prev.registros.filter((x) => !(x.estudiante_id === editando.id && x.fecha === editando.fecha));
        return { ...prev, registros: [...otros, { estudiante_id: editando.id, fecha: editando.fecha, estado: res.estado }] };
      });
      if (res.auto_excusa) toast({ title: "Excusa vigente", description: "El estudiante ya tenía excusa ese día — se marcó como excusa." });
      cerrar();
    } catch {
      toast({ title: "No se guardó", description: "Reintenta.", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    if (!editando || guardando) return;
    setGuardando(true);
    try {
      await apiClient.asistencia.quitar({ asignatura, grado, salon, fecha: editando.fecha, estudiante_id: editando.id });
      setData((prev) => ({
        ...prev,
        registros: prev.registros.filter((x) => !(x.estudiante_id === editando.id && x.fecha === editando.fecha)),
      }));
      cerrar();
    } catch {
      toast({ title: "No se quitó", description: "Reintenta.", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const descargarExcel = async () => {
    setDescargando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = await import("file-saver");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Asistencia");

      const thin = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
      const bordes = { top: thin, left: thin, bottom: thin, right: thin };

      const headers = ["Apellidos", "Nombres", ...fechas.map(fechaCorta), ...(unDia ? [] : ["% Asistencia"])];
      const nCols = headers.length;

      // Título con la clase y el rango (para que se identifique e imprima bien).
      const t1 = ws.addRow([`Asistencia · ${asignatura}`]);
      ws.mergeCells(1, 1, 1, nCols);
      t1.getCell(1).font = { bold: true, size: 14, color: { argb: "FF166534" } };
      t1.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
      const t2 = ws.addRow([`${grado} ${salon}  ·  ${rangoLabel}`]);
      ws.mergeCells(2, 1, 2, nCols);
      t2.getCell(1).font = { size: 11, color: { argb: "FF6B7280" } };
      t2.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
      ws.addRow([]); // separador

      const hr = ws.addRow(headers);
      hr.eachCell((cell) => {
        // Verde OSCURO en el encabezado, distinto del verde claro de "Presente".
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = bordes;
      });

      data.estudiantes.forEach((e) => {
        const fila = mapa.get(e.estudiante_id) || new Map();
        const row = ws.addRow([
          e.apellidos, e.nombres,
          ...fechas.map((f) => { const s = fila.get(f); return s ? ESTADO_UI[s].label : ""; }),
          ...(unDia ? [] : [`${resumen([...fila.values()].map((estado) => ({ estado }))).pct}%`]),
        ]);
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.alignment = { horizontal: col <= 2 ? "left" : "center", vertical: "middle" };
          cell.border = bordes;
          if (col >= 3 && col <= 2 + fechas.length) {
            const s = fila.get(fechas[col - 3]);
            if (s === "presente") {
              // Presente: verde CLARO con texto oscuro → se diferencia del encabezado.
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBBF7D0" } };
              cell.font = { color: { argb: "FF166534" }, bold: true };
            } else if (s) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ESTADO_UI[s].excel } };
              cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
            }
          }
        });
      });

      ws.getColumn(1).width = 24; ws.getColumn(2).width = 18;
      for (let c = 3; c <= nCols; c++) ws.getColumn(c).width = 9;
      if (!unDia) ws.getColumn(nCols).width = 14; // "% Asistencia" no se corta
      ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }]; // fija nombres + encabezado

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Asistencia - ${asignatura} - ${grado} ${salon} - ${rangoLabel}.xlsx`);
    } catch {
      toast({ title: "Error", description: "No se pudo exportar.", variant: "destructive" });
    } finally {
      setDescargando(false);
    }
  };

  if (loading) return <p className="text-center text-muted-foreground py-8">Cargando…</p>;
  if (data.estudiantes.length === 0) return <p className="text-center text-muted-foreground py-8">No hay estudiantes en ese salón.</p>;
  if (fechas.length === 0) return <p className="text-center text-muted-foreground py-8">Aún no se ha tomado asistencia en {asignatura} ({grado} {salon}) en este periodo.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input data-guia="asistencia.buscar_estudiante" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar estudiante…"
            className="pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm w-52" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{estudiantesVisibles.length}/{data.estudiantes.length} · {fechas.length} días</span>
          <button data-guia="asistencia.boton_excel" onClick={descargarExcel} disabled={descargando}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            <Download className="w-4 h-4" /> {descargando ? "…" : "Excel"}
          </button>
        </div>
      </div>

      {/* Matriz con scroll horizontal + primera columna sticky */}
      <div data-guia="asistencia.matriz" className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th data-guia="asistencia.nombre_estudiante" className="sticky left-0 z-10 bg-muted/50 text-left px-3 py-2 font-semibold w-full min-w-[220px] border-r border-border">Estudiante</th>
              {fechas.map((f) => <th key={f} className="px-2 py-2 font-medium text-muted-foreground whitespace-nowrap">{fechaCorta(f)}</th>)}
              <th className="px-3 py-2 font-semibold whitespace-nowrap">%</th>
            </tr>
          </thead>
          <tbody data-guia="asistencia.celda_matriz">
            {estudiantesVisibles.map((e) => {
              const fila = mapa.get(e.estudiante_id) || new Map<string, AsistenciaEstado>();
              const r = resumen([...fila.values()].map((estado) => ({ estado })));
              return (
                <tr key={e.estudiante_id} className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 border-r border-border w-full min-w-[220px]">
                    <button onClick={() => onAbrirCalendario(e)} className="text-left hover:text-primary hover:underline whitespace-nowrap">
                      {e.apellidos} {e.nombres}
                    </button>
                  </td>
                  {fechas.map((f) => {
                    const s = fila.get(f);
                    return (
                      <td key={f} className="px-1 py-1 text-center">
                        <button
                          disabled={!puedeEditar}
                          onClick={(ev) => puedeEditar && abrir(e.estudiante_id, `${e.apellidos} ${e.nombres}`, f, ev.currentTarget)}
                          title={s ? ESTADO_UI[s].label : "Sin marca"}
                          className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold mx-auto
                            ${s ? `${ESTADO_UI[s].cell} text-white` : "bg-muted/40 text-muted-foreground"}
                            ${puedeEditar ? "hover:ring-2 hover:ring-primary/40 cursor-pointer" : "cursor-default"}`}>
                          {s ? ESTADO_UI[s].corto : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-center font-semibold whitespace-nowrap">{r.pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Popover anclado a la celda (globo flotante con animación). */}
      {editando && createPortal(
        <div className="fixed inset-0 z-[60]" onClick={cerrar}>
          <div
            ref={popRef}
            onClick={(e) => e.stopPropagation()}
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
            className={`fixed bg-card rounded-xl shadow-lg border border-border px-3 py-2.5
              transition-[opacity,transform] duration-150 ease-out
              ${abierto ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
          >
            {/* Caret del globo */}
            {pos && (
              <span
                style={{ left: pos.caret }}
                className={`absolute w-3 h-3 bg-card border-border rotate-45 -translate-x-1/2
                  ${pos.place === "bottom" ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-r border-b"}`}
              />
            )}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-foreground truncate max-w-[180px]">{editando.nombre}</span>
              <span className="text-xs text-muted-foreground">· {fechaCorta(editando.fecha)}</span>
              <button onClick={cerrar} className="ml-auto text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div data-guia="asistencia.popover_estado" className="flex items-center gap-2 flex-wrap">
              {ESTADOS_LISTA.map((e) => (
                <button key={e} onClick={() => setEstado(e)} disabled={guardando}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold text-white ${ESTADO_UI[e].cell} hover:opacity-90 disabled:opacity-50`}>
                  {ESTADO_UI[e].label}
                </button>
              ))}
              {mapa.get(editando.id)?.get(editando.fecha) && (
                <button data-guia="asistencia.popover_quitar" onClick={quitar} disabled={guardando}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default MatrizCurso;
