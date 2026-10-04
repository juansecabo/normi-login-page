import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { getSession } from "@/hooks/useSession";
import Catalogo from "@/components/biblioteca/Catalogo";
import Mostrador from "@/components/biblioteca/Mostrador";
import PrestamosLista from "@/components/biblioteca/PrestamosLista";
import Etiquetas from "@/components/biblioteca/Etiquetas";
import PazYSalvo from "@/components/biblioteca/PazYSalvo";
import ConfigBiblioteca from "@/components/biblioteca/ConfigBiblioteca";
import MisPrestamos from "@/components/biblioteca/MisPrestamos";
import { puedeGestionar, puedeConsultar } from "@/components/biblioteca/comun";

/**
 * Ficha Biblioteca (Juan 2026-10-04), para todos los perfiles:
 *  - Todos: catálogo con disponibilidad y sus préstamos (el acudiente, los de cada hijo).
 *  - Bibliotecario(a) y Administrador: mostrador (prestar/devolver con escáner), préstamos y
 *    vencidos, etiquetas, paz y salvo y reglas de préstamo.
 *  - Rector, coordinación, secretaría y administrativos: además consultan préstamos y paz y
 *    salvo (el rector también ajusta las reglas).
 */
type Tab = { k: string; label: string };

const Biblioteca = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const session = getSession();
  const gestiona = puedeGestionar();
  const consulta = puedeConsultar();
  const acudiente = session.cargo === "Acudiente";

  useEffect(() => { if (!session.id) navigate("/"); }, [navigate, session.id]);

  const tabs: Tab[] = [
    ...(gestiona ? [{ k: "mostrador", label: "Prestar y devolver" }] : []),
    { k: "catalogo", label: "Catálogo" },
    ...(consulta ? [{ k: "prestamos", label: "Préstamos" }] : []),
    ...(gestiona ? [{ k: "etiquetas", label: "Etiquetas" }] : []),
    ...(consulta ? [{ k: "paz", label: "Paz y salvo" }, { k: "config", label: "Reglas" }] : []),
    { k: "mis", label: acudiente ? "Préstamos de mis hijos" : "Mis préstamos" },
  ];
  const tab = tabs.find((t) => t.k === params.get("tab"))?.k || tabs[0].k;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8 pb-24 lg:pb-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Biblioteca</span>
          </BreadcrumbDeslizable>
        </div>
        <div className="bg-card rounded-lg shadow-soft p-4 md:p-6 max-w-5xl mx-auto">
          <h2 className="text-xl font-bold text-foreground text-center mb-4">📚 Biblioteca</h2>
          <div className="flex flex-wrap justify-center gap-2 mb-6" data-guia="biblioteca.pestanas">
            {tabs.map((t) => (
              <button key={t.k} data-guia={`biblioteca.tab_${t.k}`} onClick={() => setParams({ tab: t.k }, { replace: true })}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${tab === t.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === "mostrador" && <Mostrador />}
          {tab === "catalogo" && <Catalogo gestiona={gestiona} />}
          {tab === "prestamos" && <PrestamosLista gestiona={gestiona} />}
          {tab === "etiquetas" && <Etiquetas />}
          {tab === "paz" && <PazYSalvo />}
          {tab === "config" && <ConfigBiblioteca editable={gestiona || session.cargo === "Rector"} />}
          {tab === "mis" && <MisPrestamos />}
        </div>
      </main>
    </div>
  );
};

export default Biblioteca;
