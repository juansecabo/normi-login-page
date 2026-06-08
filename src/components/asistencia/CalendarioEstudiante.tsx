import { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { AsistenciaEstado, AsistenciaRegistro } from "@/lib/apiClient";
import { ESTADO_UI, ESTADOS_LISTA, resumen, rangoMes, MESES } from "./estados";

interface Props {
  estudiante: { estudiante_id: string; nombres: string; apellidos: string; avatar_url: string | null };
  contextoLabel: string; // ej "Matemáticas · Sexto 2"
  puedeEditar: boolean;
  /** Carga las marcas del estudiante para ese rango (internos: endpoint; estudiante/acudiente: shim). */
  loadMonth: (estudianteId: string, desde: string, hasta: string) => Promise<AsistenciaRegistro[]>;
  /** Guarda una marca y devuelve el estado realmente guardado (auto-excusa puede cambiarlo). */
  onMarcar?: (fecha: string, estado: AsistenciaEstado) => Promise<AsistenciaEstado>;
  onClose: () => void;
}

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const CalendarioEstudiante = ({ estudiante, contextoLabel, puedeEditar, loadMonth, onMarcar, onClose }: Props) => {
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [registros, setRegistros] = useState<AsistenciaRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true); setDiaSel(null);
    const { desde, hasta } = rangoMes(mes);
    loadMonth(estudiante.estudiante_id, desde, hasta)
      .then((r) => { if (!cancel) setRegistros(r); })
      .catch(() => { if (!cancel) setRegistros([]); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [mes, estudiante.estudiante_id, loadMonth]);

  const estadoByFecha = useMemo(() => {
    const m = new Map<string, AsistenciaEstado>();
    for (const r of registros) m.set(r.fecha, r.estado);
    return m;
  }, [registros]);

  const r = resumen(registros);
  const y = mes.getFullYear(), m = mes.getMonth();
  const diasEnMes = new Date(y, m + 1, 0).getDate();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Lun=0
  const fmtFecha = (dia: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const iniciales = `${estudiante.nombres?.[0] || ""}${estudiante.apellidos?.[0] || ""}`.toUpperCase();

  const cambiarMes = (delta: number) => setMes(new Date(y, m + delta, 1));

  const marcarDia = async (estado: AsistenciaEstado) => {
    if (!diaSel || !onMarcar || guardando) return;
    setGuardando(true);
    try {
      const real = await onMarcar(diaSel, estado);
      setRegistros((prev) => {
        const otros = prev.filter((x) => x.fecha !== diaSel);
        return [...otros, { estudiante_id: estudiante.estudiante_id, fecha: diaSel, estado: real }];
      });
      setDiaSel(null);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-14 rounded-[40%] overflow-hidden bg-emerald-100 ring-2 ring-emerald-200 flex items-center justify-center flex-shrink-0">
              {estudiante.avatar_url
                ? <img src={estudiante.avatar_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-emerald-700 font-bold">{iniciales || "?"}</span>}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-foreground leading-tight truncate">{estudiante.apellidos} {estudiante.nombres}</p>
              <p className="text-xs text-muted-foreground truncate">{contextoLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* Navegador de mes */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => cambiarMes(-1)} className="p-1.5 rounded-full hover:bg-muted"><ChevronLeft className="w-5 h-5" /></button>
          <span className="font-semibold text-foreground">{MESES[m]} {y}</span>
          <button onClick={() => cambiarMes(1)} className="p-1.5 rounded-full hover:bg-muted"><ChevronRight className="w-5 h-5" /></button>
        </div>

        {/* Días de la semana */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DIAS.map((d) => <div key={d} className="text-center text-[11px] font-medium text-muted-foreground">{d}</div>)}
        </div>

        {/* Grilla */}
        <div className={`grid grid-cols-7 gap-1 ${loading ? "opacity-40" : ""}`}>
          {Array.from({ length: offset }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: diasEnMes }).map((_, i) => {
            const dia = i + 1;
            const fecha = fmtFecha(dia);
            const est = estadoByFecha.get(fecha);
            const sel = diaSel === fecha;
            return (
              <button
                key={fecha}
                disabled={!puedeEditar}
                onClick={() => puedeEditar && setDiaSel(sel ? null : fecha)}
                className={`aspect-square rounded-lg flex items-center justify-center text-sm font-semibold transition
                  ${est ? `${ESTADO_UI[est].cell} text-white` : "bg-muted/50 text-foreground"}
                  ${puedeEditar ? "cursor-pointer hover:ring-2 hover:ring-primary/40" : "cursor-default"}
                  ${sel ? "ring-2 ring-primary" : ""}`}
              >
                {dia}
              </button>
            );
          })}
        </div>

        {/* Barra de edición del día seleccionado */}
        {puedeEditar && diaSel && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Día {diaSel.slice(8)}:</span>
            {ESTADOS_LISTA.map((e) => (
              <button key={e} onClick={() => marcarDia(e)} disabled={guardando}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold text-white ${ESTADO_UI[e].cell} hover:opacity-90 disabled:opacity-50`}>
                {ESTADO_UI[e].label}
              </button>
            ))}
          </div>
        )}

        {/* Resumen del mes */}
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">{r.pct}% asistencia</span>
          <span className="text-xs text-muted-foreground">
            <span className="text-emerald-600">{r.p} P</span> · <span className="text-rose-600">{r.a} A</span> · <span className="text-amber-600">{r.e} E</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default CalendarioEstudiante;
