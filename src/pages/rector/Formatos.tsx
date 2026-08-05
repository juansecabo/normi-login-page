import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { getSession, puedeAccederDashboard, isAdmin, isProfesor } from "@/hooks/useSession";
import { FolderOpen, FileText, ClipboardList, CalendarClock, ChevronRight } from "lucide-react";

const PESTA_ID = "94c1414b-22d1-40dd-945a-5857b62e5f6c";

const Formatos = () => {
  const navigate = useNavigate();
  const s = getSession();

  useEffect(() => {
    if (!s.id || (!puedeAccederDashboard() && !isAdmin() && !isProfesor())) { navigate("/"); return; }
  }, [navigate]);

  const esPesta = s.colegio_id === PESTA_ID;

  const formatos = [
    { id: "permiso-docente", titulo: "Solicitud de permiso docente", desc: "El docente solicita permiso, firma y descarga el PDF.", icon: FileText, ruta: "/formatos/permiso-docente", listo: true },
    { id: "nivelacion", titulo: "Plan de Nivelación por período", desc: "Planilla por estudiante con la nota definitiva del período.", icon: ClipboardList, ruta: "/formatos/nivelacion", listo: false },
    { id: "apoyo", titulo: "Plan de Apoyo al Mejoramiento", desc: "Taller 40% + Sustentación 60% = definitiva (cálculo automático).", icon: CalendarClock, ruta: "/formatos/apoyo", listo: false },
  ];

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink="/dashboard" />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">Formatos</h1>
        <p className="text-muted-foreground mt-1">Formatos de la institución: se llenan aquí, se firman y se descargan.</p>

        {!esPesta ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <FolderOpen className="w-12 h-12 mx-auto text-primary/70" strokeWidth={1.5} />
            <p className="mt-4 font-semibold text-foreground">Sección en construcción</p>
            <p className="text-sm text-muted-foreground mt-1">Pronto podrás ver y descargar aquí los formatos del colegio.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {formatos.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => f.listo && navigate(f.ruta)}
                  disabled={!f.listo}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-colors ${f.listo ? "border-border bg-card hover:border-primary hover:bg-primary/5 cursor-pointer" : "border-dashed border-border bg-muted/30 cursor-not-allowed opacity-70"}`}
                >
                  <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{f.titulo}</p>
                    <p className="text-sm text-muted-foreground">{f.desc}</p>
                  </div>
                  {f.listo ? <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" /> : <span className="text-xs font-medium text-amber-600 shrink-0">Próximamente</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Formatos;
