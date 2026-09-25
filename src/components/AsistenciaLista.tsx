import { useState } from "react";
import { ArrowLeft, CheckCheck, Loader2 } from "lucide-react";
import type { AsistenciaRosterItem, AsistenciaEstado } from "@/lib/apiClient";

/**
 * Tomar asistencia en LISTA (piloto Cailico, Juan 2026-09-25): todos los estudiantes
 * del salón a la vista, cada uno con sus botones Presente / Ausente / Tarde / Excusa.
 * Cada toque se guarda al instante (mismo endpoint que el mazo). "Todos presentes"
 * marca de una vez a los que faltan por marcar, para luego cambiar solo al que faltó.
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
  onCambiarClase: () => void;
  onTerminar: () => void;
}

const AsistenciaLista = ({ roster, asignatura, grado, salon, fechaTexto, onMarcar, onCambiarClase, onTerminar }: Props) => {
  const [marcandoTodos, setMarcandoTodos] = useState(false);
  const conteo = { presente: 0, ausente: 0, tarde: 0, excusa: 0 };
  for (const r of roster) if (r.estado) conteo[r.estado]++;
  const pendientes = roster.filter((r) => !r.estado);
  const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

  // Los que tienen excusa vigente quedan con excusa, no como presentes.
  const todosPresentes = async () => {
    setMarcandoTodos(true);
    try {
      const lista = [...pendientes];
      for (let i = 0; i < lista.length; i += 5) {
        await Promise.all(lista.slice(i, i + 5).map((r) => onMarcar(r, r.tiene_excusa ? "excusa" : "presente")));
      }
    } finally {
      setMarcandoTodos(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onCambiarClase} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border shadow-sm text-foreground text-sm font-medium hover:bg-muted transition cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Cambiar clase
        </button>
      </div>

      <div className="bg-card rounded-2xl shadow-soft p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Tomar asistencia</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-semibold text-primary">{grado} {salon}</span> · {asignatura} · <span className="capitalize">{fechaTexto}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">{pl(conteo.presente, "presente", "presentes")}</span>
            <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">{pl(conteo.ausente, "ausente", "ausentes")}</span>
            <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">{pl(conteo.tarde, "tarde", "tarde")}</span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">{pl(conteo.excusa, "con excusa", "con excusa")}</span>
          </div>
        </div>

        {pendientes.length > 0 && (
          <button
            data-guia="asistencia.todos_presentes"
            onClick={todosPresentes}
            disabled={marcandoTodos}
            className="mb-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition disabled:opacity-60"
          >
            {marcandoTodos ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            Todos presentes ({pendientes.length})
          </button>
        )}

        <div className="space-y-1.5" data-guia="asistencia.lista">
          {roster.map((r, i) => (
            <div key={r.estudiante_id} className={`rounded-xl border px-3 py-2 sm:flex sm:items-center sm:gap-3 ${r.estado ? FONDO_FILA[r.estado] : "bg-card border-border"}`}>
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
                    onClick={() => onMarcar(r, b.estado)}
                    className={`px-1 py-1.5 rounded-full border text-xs sm:text-sm font-semibold transition ${r.estado === b.estado ? b.activo : "bg-card border-border text-muted-foreground hover:bg-muted"}`}
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
