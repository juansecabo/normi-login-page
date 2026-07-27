import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { getSession, puedeAccederDashboard, isAdmin } from "@/hooks/useSession";
import { FolderOpen } from "lucide-react";

const Formatos = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const s = getSession();
    if (!s.id || (!puedeAccederDashboard() && !isAdmin())) { navigate("/"); return; }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink="/dashboard" />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">Formatos</h1>
        <p className="text-muted-foreground mt-1">Formatos y documentos de la institución.</p>
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <FolderOpen className="w-12 h-12 mx-auto text-primary/70" strokeWidth={1.5} />
          <p className="mt-4 font-semibold text-foreground">Sección en construcción</p>
          <p className="text-sm text-muted-foreground mt-1">Pronto podrás ver y descargar aquí los formatos del colegio.</p>
        </div>
      </div>
    </div>
  );
};

export default Formatos;
