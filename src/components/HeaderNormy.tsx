import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import escudoImg from "@/assets/escudo.webp";
import { clearSession, getSession } from "@/hooks/useSession";
import CambiarContrasenaModal from "@/components/CambiarContrasenaModal";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import UpdateBanner from "@/components/UpdateBanner";

interface HeaderNormyProps {
  /**
   * Destino del clic en el logo. Si se omite, se calcula automáticamente
   * según el cargo del usuario logueado (admin → /dashboard-admin,
   * rector/coord/admvo → /dashboard-rector, etc.).
   */
  backLink?: string;
}

const computeBackLinkFromSession = (): string => {
  const { cargo } = getSession();
  if (cargo === "Administrador") return "/dashboard-admin";
  if (
    cargo === "Rector" ||
    cargo === "Coordinador(a)" ||
    cargo === "Administrativo(a)"
  ) {
    return "/dashboard-rector";
  }
  if (cargo === "Padre de familia") return "/dashboard-padre";
  if (cargo === "Estudiante") return "/dashboard-estudiante";
  return "/dashboard";
};

const HeaderNormy = ({ backLink }: HeaderNormyProps) => {
  const navigate = useNavigate();
  const [showCambiarContrasena, setShowCambiarContrasena] = useState(false);
  const { canInstall, installApp } = useInstallPrompt();

  const finalBackLink = backLink || computeBackLinkFromSession();

  const handleLogout = () => {
    clearSession();
    navigate("/");
  };

  return (
    <>
      <header className="bg-primary text-primary-foreground py-2 md:py-3 px-3 md:px-4 shadow-md sticky top-0 z-40">
        <div className="container mx-auto flex items-center justify-between">
          <Link to={finalBackLink} className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity cursor-pointer">
            <img
              src={escudoImg}
              alt="Escudo"
              className="w-10 h-10 md:w-16 md:h-16 object-contain -my-1 md:-my-2"
            />
            <h1 className="text-base md:text-xl font-bold">Notas Normy</h1>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            {canInstall && (
              <button
                onClick={installApp}
                className="px-2 sm:px-3 py-1.5 sm:py-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-medium rounded-lg transition-all duration-200 text-[10px] sm:text-sm flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Descargar App</span>
                <span className="sm:hidden">App</span>
              </button>
            )}
            <button
              onClick={() => setShowCambiarContrasena(true)}
              className="px-2 sm:px-3 py-1.5 sm:py-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-medium rounded-lg transition-all duration-200 text-[10px] sm:text-sm whitespace-nowrap"
            >
              <span className="hidden sm:inline">Cambiar contraseña</span>
              <span className="sm:hidden">Contraseña</span>
            </button>
            <Button
              variant="secondary"
              onClick={handleLogout}
              className="font-medium text-[10px] sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
            >
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>
      <div className="sticky top-[60px] md:top-[80px] z-30">
        <UpdateBanner />
      </div>
      <CambiarContrasenaModal
        open={showCambiarContrasena}
        onOpenChange={setShowCambiarContrasena}
      />
    </>
  );
};

export default HeaderNormy;
