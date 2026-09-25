import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCheck, Loader2 } from "lucide-react";
import type { AsistenciaRosterItem, AsistenciaEstado } from "@/lib/apiClient";

/**
 * Tomar asistencia en LISTA (piloto Cailico, Juan 2026-09-25): todos los estudiantes
 * del salón a la vista, cada uno con sus botones Presente / Ausente / Tarde / Excusa.
 * Cada toque se guarda al instante (mismo endpoint que el mazo). Arrastre: se toca un
 * botón y, sin soltar, se desliza sobre las demás filas; cada fila por la que pasa queda
 * con ese mismo estado (como al arrastrar el periodo en el calendario). Solo con mouse.
 * "Marcar todos como presentes" marca de una vez (una sola petición) a los que faltan.
 */

const BOTONES: { estado: AsistenciaEstado; label: string; activo: string }[] = [
  { estado: "presente", label: "Presente", activo: "bg-emerald-600 border-emerald-600 text-white" },
  { estado: "ausente", label: "Ausente", activo: "bg-rose-600 border-rose-600 text-white" },
  { estado: "tarde", label: "Tarde", activo: "bg-orange-500 border-orange-500 text-white" },
  { estado: "excusa", label: "Excusa", activo: "bg-amber-400 border-amber-400 text-amber-950" },
];

const FONDO_FILA: Record<AsistenciaEstado, string> = {
  presente: "bg-emerald-50 border-emerald-100",
  ausente: "bg-rose-50 border-rose-100",
  tarde: "bg-orange-50 border-orange-100",
  excusa: "bg-amber-50 border-amber-100",
};

interface Props {
  roster: AsistenciaRosterItem[];
  asignatura: string;
  grado: string;
  salon: string;
  fechaTexto: string;
  onMarcar: (est: AsistenciaRosterItem, estado: AsistenciaEstado) => Promise<void> | void;
  onMarcarTodos: () => Promise<void>;
  onCambiarClase: () => void;
  onTerminar: () => void;
}

const AsistenciaLista = ({ roster, asignatura, grado, salon, fechaTexto, onMarcar, onMarcarTodos, onCambiarClase, onTerminar }: Props) => {
  const [marcandoTodos, setMarcandoTodos] = useState(false);
  const conteo = { presente: 0, ausente: 0, tarde: 0, excusa: 0 };
  for (const r of roster) if (r.estado) conteo[r.estado]++;
  const pendientes = roster.filter((r) => !r.estado);
  const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

  // Arrastre: estado que se está "pintando" y última fila tocada. Refs para que los
  // listeners globales vean siempre el roster actual.
  const arrastre = useRef<{ estado: AsistenciaEstado; ultima: number } | null>(null);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const onMarcarRef = useRef(onMarcar);
  onMarcarRef.current = onMarcar;
  const punteroY = useRef<number | null>(null);

  const pintar = (idx: number) => {
    const a = arrastre.current;
    const r = rosterRef.current[idx];
    if (!a || !r || r.estado === a.estado) return;
    onMarcarRef.current(r, a.estado);
  };

  const empezar = (idx: number, estado: AsistenciaEstado, y: number) => {
    arrastre.current = { estado, ultima: idx };
    punteroY.current = y;
    pintar(idx);
  };

  useEffect(() => {
    const filaEn = (x: number, y: number): number | null => {
      const el = document.elementFromPoint(x, y)?.closest("[data-fila-asistencia]");
      return el ? Number(el.getAttribute("data-fila-asistencia")) : null;
    };
    const mover = (e: PointerEvent) => {
      const a = arrastre.current;
      if (!a) return;
      punteroY.current = e.clientY;
      const idx = filaEn(e.clientX, e.clientY);
      if (idx === null || idx === a.ultima) return;
      // Un movimiento rápido puede saltarse filas: se pintan todas las intermedias.
      const paso = idx > a.ultima ? 1 : -1;
      for (let i = a.ultima + paso; i !== idx + paso; i += paso) pintar(i);
      a.ultima = idx;
    };
    const soltar = () => { arrastre.current = null; punteroY.current = null; };
    // Cerca del borde de la pantalla la página baja/sube sola mientras se arrastra.
    let raf = 0;
    const autoScroll = () => {
      const y = punteroY.current;
      if (arrastre.current && y !== null) {
        const borde = 70;
        const v = y < borde ? -(borde - y) / 4 : y > window.innerHeight - borde ? (y - (window.innerHeight - borde)) / 4 : 0;
        if (v) window.scrollBy(0, v);
      }
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El servidor marca a todos los que faltan de una vez (excusa vigente ⇒ 'excusa').
  const todosPresentes = async () => {
    setMarcandoTodos(true);
    try { await onMarcarTodos(); } finally { setMarcandoTodos(false); }
  };

  return (
    <div className="max-w-3xl mx-auto mt-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onCambiarClase} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border shadow-sm text-foreground text-sm font-medium hover:bg-muted transition cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Cambiar clase
        </button>
      </div>

      <div className="bg-card rounded-2xl shadow-soft p-4 sm:p-6">
        <div className="flex flex-col items-center text-center gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Tomar asistencia</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-semibold text-primary">{grado} {salon}</span> · {asignatura} · {fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1)}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 text-xs font-semibold">
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">{pl(conteo.presente, "presente", "presentes")}</span>
            <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">{pl(conteo.ausente, "ausente", "ausentes")}</span>
            <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">{pl(conteo.tarde, "tarde", "tarde")}</span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">{pl(conteo.excusa, "con excusa", "con excusa")}</span>
          </div>
        </div>

        {pendientes.length > 0 && (
          <div className="flex justify-center">
          <button
            data-guia="asistencia.todos_presentes"
            onClick={todosPresentes}
            disabled={marcandoTodos}
            className="mb-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition disabled:opacity-60"
          >
            {marcandoTodos ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            Marcar todos como presentes ({pendientes.length})
          </button>
          </div>
        )}

        <div className="space-y-1.5" data-guia="asistencia.lista">
          {roster.map((r, i) => (
            <div key={r.estudiante_id} data-fila-asistencia={i} className={`rounded-xl border px-3 py-2 sm:flex sm:items-center sm:gap-3 ${r.estado ? FONDO_FILA[r.estado] : "bg-card border-border"}`}>
              <div className="flex items-center gap-2 min-w-0 sm:flex-1">
                <span className="w-6 text-right text-sm text-muted-foreground shrink-0">{i + 1}</span>
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{r.apellidos} {r.nombres}</div>
                  {r.tiene_excusa && (
                    <div className="text-xs text-amber-700">Tiene excusa{r.excusa_motivo ? `: ${r.excusa_motivo}` : ""}</div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 mt-2 sm:mt-0 sm:w-[380px] shrink-0">
                {BOTONES.map((b) => (
                  <button
                    key={b.estado}
                    onPointerDown={(e) => {
                      // Arrastre solo con mouse (en el celular deslizar debe bajar la página).
                      if (e.pointerType !== "mouse" || e.button !== 0) return;
                      e.preventDefault();
                      empezar(i, b.estado, e.clientY);
                    }}
                    onClick={(e) => { if ((e.nativeEvent as PointerEvent).pointerType !== "mouse") onMarcar(r, b.estado); }}
                    className={`select-none px-1 py-1.5 rounded-full border text-xs sm:text-sm font-semibold transition ${r.estado === b.estado ? b.activo : "bg-card border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 gap-3">
          <span className="text-sm text-muted-foreground">
            {pendientes.length ? `Faltan ${pl(pendientes.length, "estudiante", "estudiantes")} por marcar` : "Todos marcados. Se guarda al tocar."}
          </span>
          <button onClick={onTerminar} className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90">Listo</button>
        </div>
      </div>
    </div>
  );
};

export default AsistenciaLista;
