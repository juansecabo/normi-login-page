import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Download, Repeat, KeyRound, LogOut, ArrowLeft } from "lucide-react";
import { clearSession, getSession, haySesionSuperAdminRespaldada, restaurarSesionSuperAdmin } from "@/hooks/useSession";
import { useColegioConfig } from "@/hooks/useColegioConfig";
import EscudoColegio from "@/components/EscudoColegio";
import CambiarContrasenaModal from "@/components/CambiarContrasenaModal";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import UpdateBanner from "@/components/UpdateBanner";
import { apiClient } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";

interface HeaderNormiProps {
  /**
   * Destino del clic en el logo. Si se omite, se calcula automáticamente
   * según el cargo del usuario logueado (admin → /dashboard-admin,
   * rector/coord/admvo → /dashboard-rector, etc.).
   */
  backLink?: string;
}

const computeBackLinkFromSession = (): string => {
  const { cargo } = getSession();
  if (cargo === "SuperAdmin") return "/dashboard-plataforma";
  if (cargo === "Administrador") return "/dashboard-admin";
  if (
    cargo === "Rector" ||
    cargo === "Coordinador(a)" ||
    cargo === "Administrativo(a)"
  ) {
    return "/dashboard-rector";
  }
  if (cargo === "Acudiente") return "/dashboard-acudiente";
  if (cargo === "Estudiante") return "/dashboard-estudiante";
  return "/dashboard";
};

const HeaderNormi = ({ backLink }: HeaderNormiProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showCambiarContrasena, setShowCambiarContrasena] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { canInstall, installApp } = useInstallPrompt();
  const { nombre: colegioNombre, logoUrl: colegioLogoUrl } = useColegioConfig();

  const finalBackLink = backLink || computeBackLinkFromSession();
  const enImpersonacion = haySesionSuperAdminRespaldada();

  const handleLogout = () => {
    clearSession();
    navigate("/");
  };

  const handleVolverPlataforma = () => {
    if (restaurarSesionSuperAdmin()) {
      navigate("/dashboard-plataforma", { replace: true });
    } else {
      // Si por alguna razón el backup se perdió (cerraste pestaña, etc),
      // cerramos sesión para no quedar atrapados.
      clearSession();
      navigate("/");
    }
  };

  const handleSwitchProfile = async () => {
    setSwitching(true);
    try {
      const res = await apiClient.auth.switchProfile();
      if ("onlyOne" in res) {
        toast({
          title: "Solo tienes un perfil",
          description: "Esta cédula no está registrada en otro colegio o con otro rol.",
        });
        setSwitching(false);
        return;
      }
      clearSession();
      // replace para que "atras" del celular desde el selector no vuelva al
      // dashboard anterior (cuya sesion ya borramos).
      navigate("/", { state: { memberships: res.memberships }, replace: true });
    } catch {
      toast({
        title: "Error",
        description: "No se pudo cambiar de perfil. Cierra sesión y vuelve a entrar.",
        variant: "destructive",
      });
      setSwitching(false);
    }
  };

  return (
    <>
      <header className="shadow-md">
        <div className="bg-primary text-primary-foreground py-2 md:py-3 px-3 md:px-4">
          <div className="container mx-auto flex items-center justify-between">
            <Link to={finalBackLink} className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity cursor-pointer">
              <div className="hidden md:block">
                <EscudoColegio logoUrl={colegioLogoUrl} nombre={colegioNombre} size={56} />
              </div>
              <div className="md:hidden">
                <EscudoColegio logoUrl={colegioLogoUrl} nombre={colegioNombre} size={40} />
              </div>
              <h1 className="text-base md:text-xl font-bold whitespace-nowrap">Notas Normi</h1>
            </Link>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {canInstall && (
                <button
                  onClick={installApp}
                  title="Descargar App"
                  className="p-2 sm:px-3 sm:py-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-medium rounded-lg transition-all duration-200 text-sm flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Descargar App</span>
                </button>
              )}
              {enImpersonacion && (
                <button
                  onClick={handleVolverPlataforma}
                  title="Volver a Plataforma"
                  className="p-2 sm:px-3 sm:py-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-medium rounded-lg transition-all duration-200 text-sm flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ArrowLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Volver a Plataforma</span>
                </button>
              )}
              {!enImpersonacion && getSession().multi_membership && (
                <button
                  onClick={handleSwitchProfile}
                  disabled={switching}
                  title="Cambiar perfil"
                  className="p-2 sm:px-3 sm:py-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-medium rounded-lg transition-all duration-200 text-sm flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  <Repeat className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Cambiar perfil</span>
                </button>
              )}
              <button
                onClick={() => setShowCambiarContrasena(true)}
                title="Cambiar contraseña"
                className="p-2 sm:px-3 sm:py-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-medium rounded-lg transition-all duration-200 text-sm flex items-center gap-1.5 whitespace-nowrap"
              >
                <KeyRound className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Cambiar contraseña</span>
              </button>
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="p-2 sm:px-3 sm:py-2 bg-background text-foreground hover:bg-background/90 font-medium rounded-lg transition-all duration-200 text-sm flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
        <UpdateBanner />
      </header>
      <CambiarContrasenaModal
        open={showCambiarContrasena}
        onOpenChange={setShowCambiarContrasena}
      />
    </>
  );
};

export default HeaderNormi;
