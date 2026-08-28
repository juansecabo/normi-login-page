import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSession } from "@/hooks/useSession";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import { ClipboardCheck, ClipboardList, ChevronRight } from "lucide-react";

/**
 * Menú de Asistencia del profesor: al entrar elige entre TOMAR asistencia
 * (swipe del día) o ver el REGISTRO de asistencia (consulta/corrección por
 * día, mes o rango, reutilizando ConsultaAsistencia que ya soporta al profe).
 */
const AsistenciaMenu = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getSession().id) navigate("/");
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Asistencia</span>
          </div>
        </div>
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-1 text-center">Asistencia</h2>
          <p className="text-center text-muted-foreground mb-6">¿Qué deseas hacer?</p>

          <div className="grid gap-4">
            <button
              data-guia="asistencia.menu_tomar"
              onClick={() => navigate("/profesor/asistencia/tomar")}
              className="flex items-center gap-4 text-left p-5 rounded-xl border border-border bg-card hover:bg-emerald-50 transition-colors shadow-soft"
            >
              <div className="shrink-0 w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground">Tomar Asistencia</div>
                <div className="text-sm text-muted-foreground">Pasa lista del día deslizando las tarjetas (presente, ausente o con excusa).</div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              data-guia="asistencia.menu_registro"
              onClick={() => navigate("/asistencia")}
              className="flex items-center gap-4 text-left p-5 rounded-xl border border-border bg-card hover:bg-blue-50 transition-colors shadow-soft"
            >
              <div className="shrink-0 w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground">Registro de Asistencia</div>
                <div className="text-sm text-muted-foreground">Consulta y corrige la asistencia de tus clases, por día, mes o rango. Exporta a Excel.</div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AsistenciaMenu;
