import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Download, Repeat, KeyRound, LogOut, MessageCircle, Menu, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
    return `(+57) ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return crudo.startsWith("+") ? crudo : `+${digitos}`;
}

const HeaderNormi = ({ backLink }: HeaderNormiProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showCambiarContrasena, setShowCambiarContrasena] = useState(false);
  const [switching, setSwitching] = useState(false);
  // El menú cae justo debajo de la barra: medimos la distancia real entre el
  // botón y el borde inferior de la barra para que quede pegado, sin importar
  // el tamaño del escudo.
  const barRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOffset, setMenuOffset] = useState(8);
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
        <div ref={barRef} className="bg-primary text-primary-foreground py-2 md:py-3 px-3 md:px-4">
          <div className="container mx-auto flex items-center justify-between">
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
            {/* Todas las acciones viven en un menú desplegable (mismo en PC y
                celular), en el mismo orden, con el texto completo. */}
            <DropdownMenu
              modal={false}
              onOpenChange={(open) => {
                if (open && barRef.current && triggerRef.current) {
                  const d = barRef.current.getBoundingClientRect().bottom - triggerRef.current.getBoundingClientRect().bottom;
                  setMenuOffset(Math.max(0, Math.round(d)));
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  ref={triggerRef}
                  title="Menú"
                  className="px-3 py-2 md:px-5 md:py-2.5 md:text-base bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground font-medium rounded-lg transition-all duration-200 text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap flex-shrink-0 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                >
                  <Menu className="w-4 h-4 md:w-5 md:h-5" />
                  <span>Menú</span>
                  <ChevronDown className="w-4 h-4 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={menuOffset} className="w-72 rounded-xl shadow-xl">
                {canInstall && (
                  <DropdownMenuItem onClick={installApp} className="gap-2 cursor-pointer whitespace-nowrap py-2.5">
                    <Download className="w-4 h-4" /> Descargar App
                  </DropdownMenuItem>
                )}
                {enImpersonacion && (
                  <DropdownMenuItem onClick={handleVolverPlataforma} className="gap-2 cursor-pointer whitespace-nowrap py-2.5">
                    <Repeat className="w-4 h-4" /> Cambiar institución
                  </DropdownMenuItem>
                )}
                {!enImpersonacion && getSession().multi_membership && (
                  <DropdownMenuItem onClick={handleSwitchProfile} disabled={switching} className="gap-2 cursor-pointer whitespace-nowrap py-2.5">
                    <Repeat className="w-4 h-4" /> Cambiar perfil
                  </DropdownMenuItem>
                )}
                {!esPlataforma && waDigitos && (
                  <DropdownMenuItem asChild className="gap-2 cursor-pointer whitespace-nowrap py-2.5">
                    <a href={`https://wa.me/${waDigitos}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="w-4 h-4 shrink-0" /> WhatsApp{waNumeroTexto ? `: ${waNumeroTexto}` : ""}
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowCambiarContrasena(true)} className="gap-2 cursor-pointer whitespace-nowrap py-2.5">
                  <KeyRound className="w-4 h-4" /> {((getSession() as any).sin_contrasena) ? "Crear contraseña" : "Cambiar contraseña"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="gap-2 cursor-pointer whitespace-nowrap py-2.5 text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4" /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
