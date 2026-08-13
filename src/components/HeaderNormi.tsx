import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Download, Repeat, KeyRound, LogOut, MessageCircle } from "lucide-react";
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
   * rector/coord/admvo → /panel, etc.).
   */
  backLink?: string;
}

// Home ÚNICO para todos los roles: /dashboard despacha al dashboard correcto
// según el cargo (ver DashboardHome). Ya no hace falta resolver por rol; apuntar
// a la ruta vieja (/panel, /dashboard-admin, etc.) provocaba un rebote (redirect)
// que rompía la carga de la foto de perfil.
export const computeBackLinkFromSession = (): string => "/dashboard";

/**
 * Formatea un número de WhatsApp para mostrarlo con indicativo y separado.
 * Colombia (57 + 10 dígitos) → "+57 302 448 7075". Otros países: "+<dígitos>".
 */
function formatearNumeroWa(digitos: string, crudo: string): string {
  if (!digitos) return crudo;
  if (digitos.length === 12 && digitos.startsWith("57")) {
    const n = digitos.slice(2); // 10 dígitos nacionales
    return `+57 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return crudo.startsWith("+") ? crudo : `+${digitos}`;
}

const HeaderNormi = ({ backLink }: HeaderNormiProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showCambiarContrasena, setShowCambiarContrasena] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { canInstall, installApp } = useInstallPrompt();
  const { nombre: colegioNombre, logoUrl: colegioLogoUrl, config: colegioConfig } = useColegioConfig();

  const finalBackLink = backLink || computeBackLinkFromSession();
  const enImpersonacion = haySesionSuperAdminRespaldada();
  // Perfil de la plataforma (SuperAdmin sin estar dentro de un colegio):
  // mostramos el logo de Cailico en vez del escudo de un colegio.
  const esPlataforma = getSession().cargo === "SuperAdmin" && !enImpersonacion;

  // Número de WhatsApp de Normi de ESTE colegio (viene de la config, sin el token).
  // Guardamos solo dígitos; el enlace wa.me usa esos, y para mostrar formateamos
  // con indicativo (+57 302 448 7075).
  const waCrudo = ((colegioConfig as any)?.whatsapp_numero as string | undefined)?.trim() || "";
  const waDigitos = waCrudo.replace(/\D/g, "");
  const waNumeroTexto = formatearNumeroWa(waDigitos, waCrudo);

  const handleLogout = () => {
    clearSession();
    navigate("/");
  };

  const handleVolverPlataforma = () => {
    if (restaurarSesionSuperAdmin()) {
      // Recarga real: la sesión volvió a SuperAdmin, pero seguimos en /dashboard
      // (misma ruta), así que un navigate NO re-monta el despachador y el cuerpo
      // se quedaba en el dashboard del colegio. El hard reload garantiza que
      // /dashboard vuelva a decidir y monte el Panel de Plataforma.
      window.location.assign("/dashboard");
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
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              <Link to={finalBackLink} className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity cursor-pointer">
                {esPlataforma ? (
                  <img
                    src="/cailico-logo.webp"
                    alt="Cailico"
                    className="h-10 w-10 md:h-14 md:w-14 rounded-full object-contain bg-white shrink-0"
                  />
                ) : (
                  <>
                    <div className="hidden md:block">
                      <EscudoColegio logoUrl={colegioLogoUrl} nombre={colegioNombre} size={56} />
                    </div>
                    <div className="md:hidden">
                      <EscudoColegio logoUrl={colegioLogoUrl} nombre={colegioNombre} size={40} />
                    </div>
                  </>
                )}
                <h1 className="text-base md:text-xl font-bold whitespace-nowrap">Notas Normi</h1>
              </Link>
              {!esPlataforma && waDigitos && (
                <a
                  href={`https://wa.me/${waDigitos}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Escríbele a Normi por WhatsApp${waNumeroTexto ? `: ${waNumeroTexto}` : ""}`}
                  className="flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 rounded-lg bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground transition-colors text-xs md:text-sm whitespace-nowrap shrink-0"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  {/* Móvil: solo "WhatsApp" (botón compacto). Escritorio: con el número. */}
                  <span className="font-medium">WhatsApp</span>
                  <span className="hidden md:inline">: {waNumeroTexto}</span>
                </a>
              )}
            </div>
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
                  title="Cambiar institución"
                  className="p-2 sm:px-3 sm:py-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-medium rounded-lg transition-all duration-200 text-sm flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Repeat className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Cambiar institución</span>
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
                title={((getSession() as any).sin_contrasena) ? "Crear contraseña" : "Cambiar contraseña"}
                className="p-2 sm:px-3 sm:py-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-medium rounded-lg transition-all duration-200 text-sm flex items-center gap-1.5 whitespace-nowrap"
              >
                <KeyRound className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">{((getSession() as any).sin_contrasena) ? "Crear contraseña" : "Cambiar contraseña"}</span>
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
