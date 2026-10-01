import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Zap, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { getSession } from "@/hooks/useSession";

/**
 * Banner de neón "Ponte al día para los boletines" (Juan 2026-10-01). Sale debajo de
 * la barra verde, en cualquier pantalla, a los profesores que tienen pendientes en un
 * periodo con la alerta activada desde la ficha Boletines. Lleva a la pantalla donde
 * se resuelve todo.
 */
export const RUTA_PONTE_AL_DIA = "/boletines/ponte-al-dia";
const CACHE_KEY = "pendientes_boletines_cache";
const ORD: Record<number, string> = { 1: "1er", 2: "2do", 3: "3er", 4: "4to", 5: "5to", 6: "6to" };

export interface ResumenPendientes { alertas: number[]; periodos: Array<{ periodo: number; total: number }>; total: number }

/** Para que la pantalla de resolver refresque el banner al volver. */
export const limpiarCachePendientes = () => { try { sessionStorage.removeItem(CACHE_KEY); } catch { /* sin almacenamiento */ } };

const BannerPendientesBoletines = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [resumen, setResumen] = useState<ResumenPendientes | null>(null);

  useEffect(() => {
    const s = getSession();
    const cargo = (s.cargo || "").toLowerCase();
    if (!s.id || cargo.startsWith("estudiante") || cargo.startsWith("acudiente")) return;
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (c && Date.now() - c.t < 60_000) { setResumen(c.data); return; }
    } catch { /* sin cache */ }
    let vivo = true;
    apiRequest<ResumenPendientes>("/api/boletines/mis-pendientes")
      .then((d) => {
        if (!vivo) return;
        setResumen(d);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: { alertas: d.alertas, periodos: d.periodos.map((p) => ({ periodo: p.periodo, total: p.total })), total: d.total } })); } catch { /* sin almacenamiento */ }
      })
      .catch(() => { /* sin banner si falla */ });
    return () => { vivo = false; };
  }, [pathname]);

  if (!resumen || resumen.total <= 0 || pathname === RUTA_PONTE_AL_DIA) return null;
  const periodos = resumen.periodos.map((p) => `${ORD[p.periodo] || p.periodo} periodo`).join(" y ");

  return (
    <>
      <style>{`
        @keyframes neonPulso { 0%,100% { box-shadow: 0 0 6px #22ff88, 0 0 18px #22ff88aa, inset 0 0 14px #15803d66; } 50% { box-shadow: 0 0 12px #22ff88, 0 0 34px #22ff88cc, inset 0 0 22px #15803daa; } }
        @keyframes neonTexto { 0%,100% { text-shadow: 0 0 4px #4ade80, 0 0 10px #4ade80, 0 0 18px #22c55e; } 50% { text-shadow: 0 0 6px #86efac, 0 0 16px #4ade80, 0 0 28px #22c55e; } }
        @keyframes neonBrillo { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
      `}</style>
      <button
        type="button"
        onClick={() => navigate(RUTA_PONTE_AL_DIA)}
        data-guia="boletines.banner_ponte_al_dia"
        className="relative w-full overflow-hidden text-left cursor-pointer"
        style={{ background: "linear-gradient(90deg,#03170c,#06301a 50%,#03170c)", borderTop: "2px solid #22ff88", borderBottom: "2px solid #22ff88", animation: "neonPulso 1.8s ease-in-out infinite" }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-y-0 w-1/4" style={{ background: "linear-gradient(90deg,transparent,#ffffff22,transparent)", animation: "neonBrillo 3.2s linear infinite" }} />
        <div className="container mx-auto px-3 md:px-4 py-2.5 flex items-center gap-3">
          <Zap className="w-6 h-6 shrink-0 text-lime-300" style={{ filter: "drop-shadow(0 0 6px #bef264)" }} />
          <div className="flex-1 min-w-0">
            <p className="font-extrabold uppercase tracking-wide text-[13px] md:text-sm text-green-100" style={{ animation: "neonTexto 1.8s ease-in-out infinite" }}>
              Urgente · Ponte al día con tus notas del {periodos} para los boletines
            </p>
            <p className="text-xs text-green-200/90">Te {resumen.total === 1 ? "falta 1 cosa" : `faltan ${resumen.total} cosas`} por resolver. Todo está en una sola pantalla.</p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs md:text-sm font-bold text-white"
            style={{ background: "#16a34a", boxShadow: "0 0 10px #22ff88, 0 0 22px #22ff88aa" }}>
            Resolver ahora <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      </button>
    </>
  );
};

export default BannerPendientesBoletines;
