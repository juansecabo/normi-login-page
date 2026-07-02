import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Download, Share, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import normiImg from "@/assets/normi-placeholder.webp";
import cailicoLogo from "@/assets/cailico-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { saveSession, getSession, clearSession, AcudidoData } from "@/hooks/useSession";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { apiClient, ApiError, isMultiMembership, type AuthUser, type MembershipChoice } from "@/lib/apiClient";
import EscudoColegio from "@/components/EscudoColegio";

// Si viene con ?redirect=/alguna-ruta válida, usamos esa; si no, el default.
const getPostLoginRoute = (defaultRoute: string): string => {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  if (redirect && redirect.startsWith("/")) return redirect;
  return defaultRoute;
};

const Index = () => {
  const [identificacion, setIdentificacion] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [showContrasena, setShowContrasena] = useState(false);
  const [loading, setLoading] = useState(false);
  // Estado para el selector multi-membresía. Si llegamos desde el botón
  // "Cambiar perfil" del header, vienen precargadas en location.state.
  const location = useLocation();
  const initialMemberships = (location.state as { memberships?: MembershipChoice[] } | null)?.memberships ?? null;
  const [memberships, setMemberships] = useState<MembershipChoice[] | null>(initialMemberships);
  const [userError, setUserError] = useState<{ title: string; description: string } | null>(null);
  // ¿Olvidó su contraseña?
  const [olvidoOpen, setOlvidoOpen] = useState(false);
  const [olvidoId, setOlvidoId] = useState("");
  const [olvidoLoading, setOlvidoLoading] = useState(false);
  const [olvidoMsg, setOlvidoMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const enviarOlvido = async () => {
    setOlvidoLoading(true);
    setOlvidoMsg(null);
    try {
      await apiClient.auth.olvidoContrasena(olvidoId);
      setOlvidoMsg({ ok: true, texto: "Listo: te enviamos tu contraseña al correo de recuperación asociado. Revisa también el spam." });
    } catch (e: any) {
      const detail = e?.body?.detail;
      setOlvidoMsg({ ok: false, texto: detail || "No se pudo enviar el correo. Intenta de nuevo en un momento." });
    }
    setOlvidoLoading(false);
  };
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canInstall, isIOS, installApp } = useInstallPrompt();

  // Si llegamos acá porque la sesión expiró (apiClient redirige con ?expired=1),
  // limpiamos cualquier resto de sesión y avisamos de forma clara. El ?redirect=
  // se conserva para volver a donde estaba tras volver a iniciar sesión.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("expired") === "1") {
      clearSession();
      toast({
        title: "Tu sesión expiró",
        description: "Por seguridad cerramos tu sesión. Vuelve a iniciar sesión para continuar.",
        variant: "destructive",
      });
      params.delete("expired");
      const qs = params.toString();
      window.history.replaceState({}, "", "/" + (qs ? "?" + qs : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una vez tenemos el AuthUser final (con colegio), guarda sesión local y navega.
  // Usamos replace:true en TODAS las navegaciones para que el boton "atras" del
  // celular NO devuelva al selector de membresias — su tempToken ya fue
  // consumido y volveria a fallar con "Error en el sistema". Con replace, atras
  // sale de la PWA igual que para un usuario de un solo perfil.
  const enterAsUser = (user: AuthUser) => {
    // Flag para mostrar "Crear contraseña" si el usuario aún no tiene una.
    localStorage.setItem("sin_contrasena", (user as any).sin_contrasena ? "1" : "0");
    const multi = user.multi_membership === true;
    const avatar = user.avatar_url || null;
    const colegio_id = user.colegio?.id || null;
    const colegio_nombre = user.colegio?.nombre || null;
    const colegio_logo_url = user.colegio?.logo_url || null;
    const colegio_slug = user.colegio?.slug || null;
    const genero = (user as any).genero || null;
    if (user.rol === 'SuperAdmin') {
      saveSession(user.id, user.nombres, user.apellidos, 'SuperAdmin', null, null, null, null, multi, avatar, colegio_id, colegio_nombre, colegio_logo_url, colegio_slug, genero);
      navigate(getPostLoginRoute("/dashboard-plataforma"), { replace: true });
      return;
    }
    if (user.rol === 'Estudiante') {
      saveSession(
        user.id, user.nombres, user.apellidos, 'Estudiante',
        user.nivel || null, user.grado || null, user.salon || null,
        null, multi, avatar,
        colegio_id, colegio_nombre, colegio_logo_url, colegio_slug, genero,
      );
      navigate(getPostLoginRoute("/dashboard-estudiante"), { replace: true });
      return;
    }
    if (user.rol === 'Acudiente') {
      saveSession(
        user.id, user.nombres, user.apellidos, 'Acudiente',
        null, null, null,
        (user.acudidos || []) as AcudidoData[], multi, avatar,
        colegio_id, colegio_nombre, colegio_logo_url, colegio_slug, genero,
      );
      navigate(getPostLoginRoute("/dashboard-acudiente"), { replace: true });
      return;
    }
    saveSession(user.id, user.nombres, user.apellidos, user.rol, null, null, null, null, multi, avatar, colegio_id, colegio_nombre, colegio_logo_url, colegio_slug, genero);
    if (user.rol === 'Administrador') {
      navigate(getPostLoginRoute("/dashboard-admin"), { replace: true });
    } else if (
      user.rol === 'Rector' || user.rol === 'Coordinador(a)' ||
      user.rol === 'Administrativo(a)' || user.rol === 'Secretaria General' ||
      user.rol === 'Orientador(a) Escolar'
    ) {
      navigate(getPostLoginRoute("/dashboard-rector"), { replace: true });
    } else {
      navigate(getPostLoginRoute("/dashboard"), { replace: true });
    }
  };

  const handleSelectMembership = async (m: MembershipChoice) => {
    setLoading(true);
    try {
      const { user } = await apiClient.auth.selectColegio(m.colegio_id, m.rol);
      enterAsUser(user);
    } catch (err) {
      toast({
        title: "Error",
        description: "No se pudo completar la selección. Vuelve a iniciar sesión.",
        variant: "destructive",
      });
      setMemberships(null);
    } finally {
      setLoading(false);
    }
  };

  // Si ya hay sesión activa, redirigir sin pedir contraseña.
  // EXCEPCIÓN: si veninos del botón "Cambiar perfil" con memberships en
  // location.state, mostramos el selector aunque la sesión vieja siga viva
  // un instante (clearSession se llama antes del navigate, así que no debería).
  useEffect(() => {
    if (initialMemberships) return;
    const session = getSession();
    if (session.id) {
      if (session.cargo === 'SuperAdmin') {
        navigate(getPostLoginRoute("/dashboard-plataforma"), { replace: true });
      } else if (session.cargo === 'Administrador') {
        navigate(getPostLoginRoute("/dashboard-admin"), { replace: true });
      } else if (
        session.cargo === 'Rector' ||
        session.cargo === 'Coordinador(a)' ||
        session.cargo === 'Administrativo(a)' ||
        session.cargo === 'Secretaria General' ||
        session.cargo === 'Orientador(a) Escolar'
      ) {
        navigate(getPostLoginRoute("/dashboard-rector"), { replace: true });
      } else if (session.cargo === 'Estudiante') {
        navigate(getPostLoginRoute("/dashboard-estudiante"), { replace: true });
      } else if (session.cargo === 'Acudiente') {
        navigate(getPostLoginRoute("/dashboard-acudiente"), { replace: true });
      } else {
        navigate(getPostLoginRoute("/dashboard"), { replace: true });
      }
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ignorar puntos y espacios en la cédula (acepta "1.103.114.625" o "1 103 114 625").
    const idInput = identificacion.replace(/[.\s]/g, "");
    const passInput = contrasena.trim();

    if (!idInput) {
      setUserError({ title: "Falta tu # de identidad", description: "Ingrésalo en el campo correspondiente." });
      return;
    }
    if (!passInput) {
      setUserError({ title: "Falta tu contraseña", description: "Ingrésala en el campo correspondiente." });
      return;
    }

    setLoading(true);

    try {
      const res = await apiClient.auth.login(idInput, passInput);

      // Si el server pidió que el usuario escoja entre varias membresías,
      // mostramos el selector en lugar de entrar directo.
      if (isMultiMembership(res)) {
        setMemberships(res.memberships);
        setLoading(false);
        return;
      }

      // 1 sola membresía → entrar directo.
      enterAsUser(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUserError({
          title: "Datos incorrectos",
          description: "El número de identidad o la contraseña no coinciden. Revísalos e intenta de nuevo.",
        });
      } else if (err instanceof ApiError && err.status === 403) {
        setUserError({
          title: "Acceso denegado",
          description: "Tu cédula no está registrada en ningún colegio activo.",
        });
      } else {
        toast({
          title: "Error",
          description: "Ocurrió un error inesperado al iniciar sesión",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Columna Izquierda - Imagen de Normi */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12 bg-secondary/50">
        <div className="animate-scale-in">
          <img
            src={normiImg}
            alt="Normi - Mascota de Notas Normi"
            className="w-64 h-64 lg:w-80 lg:h-80 object-cover rounded-full shadow-soft border-4 border-primary/20"
          />
        </div>
      </div>

      {/* Columna Derecha - Formulario de Login */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Cailico presenta: */}
          <div className="flex flex-col items-center gap-1">
            <img src={cailicoLogo} alt="Cailico" className="h-10" />
            <p className="text-sm text-muted-foreground">presenta:</p>
          </div>

          {/* Títulos */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
              Notas Normi
            </h1>
            <p className="text-muted-foreground text-sm lg:text-base">
              {memberships
                ? "¿En cuál perfil quieres entrar?"
                : "Ingresa con tu cédula y contraseña"}
            </p>
          </div>

          {/* Selector de membresía cuando la cédula está en varios colegios/roles */}
          {memberships && (
            <div className="space-y-3">
              {[...memberships]
                .sort((a, b) => (b.rol === "SuperAdmin" ? 1 : 0) - (a.rol === "SuperAdmin" ? 1 : 0))
                .map((m) => (
                <button
                  key={`${m.colegio_id}-${m.rol}`}
                  onClick={() => handleSelectMembership(m)}
                  disabled={loading}
                  className="w-full flex items-center gap-4 p-4 rounded-lg border-2 border-input bg-background hover:border-primary hover:bg-primary/5 transition-all text-left disabled:opacity-50"
                >
                  {m.rol === "SuperAdmin" ? (
                    <img
                      src="/cailico-logo.webp"
                      alt="Cailico"
                      className="h-14 w-14 rounded-full object-contain bg-white shrink-0"
                    />
                  ) : (
                    <EscudoColegio
                      logoUrl={m.colegio_logo_url}
                      nombre={m.colegio_nombre}
                      colorFondo={m.colegio_color}
                      size={56}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">{m.rol} de</p>
                    <p className="font-semibold text-foreground truncate">{m.colegio_nombre}</p>
                  </div>
                </button>
              ))}
              <button
                onClick={() => { setMemberships(null); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground py-2"
              >
                ← Cambiar de cuenta
              </button>
            </div>
          )}

          {/* Formulario (solo cuando no estamos en el selector) */}
          {!memberships && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="identificacion"
                className="block text-sm font-medium text-foreground"
              >
                Digita tu # de identidad
              </label>
              <Input
                id="identificacion"
                type="text"
                inputMode="numeric"
                placeholder="Número de identidad"
                value={identificacion}
                onChange={(e) => setIdentificacion(e.target.value)}
                className="w-full h-12 text-base border-input bg-background focus:ring-2 focus:ring-primary/20 transition-all"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="contrasena"
                className="block text-sm font-medium text-foreground"
              >
                Digita tu contraseña
              </label>
              <div className="relative">
                <Input
                  id="contrasena"
                  type={showContrasena ? "text" : "password"}
                  placeholder="Contraseña"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  className="w-full h-12 text-base border-input bg-background focus:ring-2 focus:ring-primary/20 transition-all pr-12"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowContrasena(!showContrasena)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showContrasena ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold shadow-button hover:shadow-lg transition-all duration-300 hover:scale-[1.02]"
              disabled={loading}
            >
              {loading ? "Verificando..." : "Ingresar"}
            </Button>

            {/* ¿Olvidó su contraseña? — envía la contraseña al correo de recuperación */}
            <div className="text-center pt-1">
              {!olvidoOpen ? (
                <button type="button" onClick={() => { setOlvidoOpen(true); setOlvidoMsg(null); }} className="text-sm text-primary hover:underline">
                  ¿Olvidó su contraseña?
                </button>
              ) : (
                <div className="text-left space-y-2 border border-border rounded-lg p-3 bg-muted/20">
                  <p className="text-sm text-muted-foreground">Escribe tu número de identidad y te enviaremos tu contraseña al correo de recuperación asociado.</p>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="Tu número de identidad"
                    autoComplete="off"
                    value={olvidoId}
                    onChange={(e) => setOlvidoId(e.target.value)}
                  />
                  {olvidoMsg && (
                    <p className={`text-sm ${olvidoMsg.ok ? "text-green-700" : "text-destructive"}`}>{olvidoMsg.texto}</p>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" disabled={olvidoLoading || !olvidoId.trim()} onClick={enviarOlvido} className="flex-1">
                      {olvidoLoading ? "Enviando..." : "Enviar al correo"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setOlvidoOpen(false); setOlvidoMsg(null); }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </form>
          )}

          {/* Botón instalar app */}
          {canInstall && (
            <button
              onClick={installApp}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Aplicación
            </button>
          )}
          {isIOS && (
            <div className="text-center text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
              <p className="flex items-center justify-center gap-1 font-medium mb-1">
                <Share className="w-3.5 h-3.5" /> Instalar en iPhone/iPad
              </p>
              <p>Toca <strong>Compartir</strong> y luego <strong>"Agregar a pantalla de inicio"</strong></p>
            </div>
          )}

          {/* Más información */}
          <div className="text-center pt-4">
            <p className="text-xs text-muted-foreground">
              Más información en:{" "}
              <a
                href="https://cailico.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                cailico.com
              </a>
            </p>
          </div>
        </div>
      </div>

      <Dialog open={!!userError} onOpenChange={(o) => { if (!o) setUserError(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-primary shrink-0" />
              <DialogTitle>{userError?.title}</DialogTitle>
            </div>
            <DialogDescription className="pt-3 text-base text-foreground">
              {userError?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setUserError(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
