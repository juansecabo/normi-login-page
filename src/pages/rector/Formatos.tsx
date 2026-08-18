import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { getSession, puedeAccederDashboard, isAdmin, isProfesor } from "@/hooks/useSession";
import { FileText, ClipboardList, CalendarClock, ChevronRight } from "lucide-react";

const PESTA_ID = "94c1414b-22d1-40dd-945a-5857b62e5f6c";
const CAILICO_ID = "2f96f076-83df-4b84-8bbc-9c1df79a372b"; // demo, para revisión

const Formatos = () => {
  const navigate = useNavigate();
  const s = getSession();

  useEffect(() => {
    if (!s.id || (!puedeAccederDashboard() && !isAdmin() && !isProfesor())) { navigate("/"); return; }
  }, [navigate]);

  const esPesta = s.colegio_id === PESTA_ID || s.colegio_id === CAILICO_ID;

  type Formato = { id: string; titulo: string; desc: string; icon: any; ruta: string; listo: boolean };
  const renderCard = (f: Formato) => {
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
  };

  const formatosGenerales: Formato[] = [
    { id: "permiso-docente", titulo: "Solicitud de permiso docente", desc: "Solicita tu permiso, firma con el dedo; se notifica a rectoría y coordinación.", icon: FileText, ruta: "/formatos/permiso-docente", listo: true },
    { id: "permisos-docentes-registro", titulo: "Permisos docentes (registro)", desc: isProfesor() ? "Consulta tus solicitudes de permiso." : "Consulta las solicitudes de permiso de los docentes.", icon: ClipboardList, ruta: "/formatos/permisos-docentes", listo: true },
  ];
  // Formatos específicos del Pestalozziano por ahora.
  const formatosPesta: Formato[] = [
    { id: "nivelacion", titulo: "Plan de Nivelación por período", desc: "Planilla por estudiante con la nota definitiva del período.", icon: ClipboardList, ruta: "/formatos/nivelacion", listo: true },
    { id: "apoyo", titulo: "Plan de Apoyo al Mejoramiento", desc: "Taller 40% + Sustentación 60% = definitiva (cálculo automático).", icon: CalendarClock, ruta: "/formatos/apoyo", listo: true },
  ];

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink="/dashboard" />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">Formatos</h1>
        <p className="text-muted-foreground mt-1">Formatos de la institución: se llenan aquí, se firman y se descargan.</p>

        <div className="mt-6 space-y-3">
          {formatosGenerales.map(renderCard)}
          {esPesta && formatosPesta.map(renderCard)}
        </div>
      </div>
    </div>
  );
};

export default Formatos;
