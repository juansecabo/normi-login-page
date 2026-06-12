import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isEstudiante, isAdmin, isRectorOrCoordinador, isPadreDeFamilia } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import PhoneInput from "@/components/PhoneInput";
import { apiClient } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { UserRound, KeyRound, Eye, EyeOff, Loader2, MessageCircle, Mail, ArrowLeft } from "lucide-react";
import iconPerfil from "@/assets/icons/perfil.png";

/**
 * Ficha "Perfil" (todos los roles).
 *  - Cambiar datos: nombre, teléfono, fecha de nacimiento y contraseña.
 *    Rol Estudiante: SOLO teléfono y contraseña.
 *  - Recuperación de contraseña: tras verificar la contraseña, configurar
 *    pregunta/respuesta secreta (Normi por WhatsApp) o correo de recuperación.
 * Todo escribe en la tabla global Usuarios: el cambio se refleja en TODOS los
 * perfiles/colegios de la persona.
 */

type Vista = "menu" | "datos" | "recuperacion";

const Perfil = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [vista, setVista] = useState<Vista>("menu");
  const esEstudiante = isEstudiante();

  const backLink = isAdmin() ? "/dashboard-admin"
    : isRectorOrCoordinador() ? "/dashboard-rector"
    : isEstudiante() ? "/dashboard-estudiante"
    : isPadreDeFamilia() ? "/dashboard-acudiente"
    : "/dashboard";

  // ── Cambiar datos ──
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [guardandoDatos, setGuardandoDatos] = useState(false);

  // Cambiar contraseña (dentro de Cambiar datos)
  const [pwdActual, setPwdActual] = useState("");
  const [pwdNueva, setPwdNueva] = useState("");
  const [pwdConfirma, setPwdConfirma] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [guardandoPwd, setGuardandoPwd] = useState(false);

  // ── Recuperación ──
  const [verificada, setVerificada] = useState(false);
  const [pwdVerif, setPwdVerif] = useState("");
  const [showPwdVerif, setShowPwdVerif] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [metodo, setMetodo] = useState<"whatsapp" | "correo" | null>(null);
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [correo, setCorreo] = useState("");
  const [correo2, setCorreo2] = useState("");
  const [guardandoRec, setGuardandoRec] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    apiClient.perfil.datos()
      .then((d) => {
        setNombres(d.nombres || "");
        setApellidos(d.apellidos || "");
        setTelefono(d.numero_de_telefono || "");
        setFechaNacimiento(d.fecha_de_nacimiento || "");
        setCargandoDatos(false);
      })
      .catch(() => setCargandoDatos(false));
  }, [navigate]);

  const guardarDatos = async () => {
    setGuardandoDatos(true);
    try {
      const body: Record<string, unknown> = { telefono };
      if (!esEstudiante) {
        body.nombres = nombres;
        body.apellidos = apellidos;
        body.fecha_de_nacimiento = fechaNacimiento || null;
      }
      await apiClient.perfil.actualizarDatos(body);
      // Actualizar nombres de la sesión local para que el header refleje el cambio
      if (!esEstudiante) {
        try {
          localStorage.setItem("nombres", nombres);
          localStorage.setItem("apellidos", apellidos);
        } catch { /* noop */ }
      }
      toast({ title: "Datos actualizados", description: "El cambio aplica a todos tus perfiles en todos los colegios." });
    } catch (e: any) {
      toast({ title: "Error", description: e?.body?.detail || "No se pudieron guardar los datos.", variant: "destructive" });
    }
    setGuardandoDatos(false);
  };

  const guardarContrasena = async () => {
    if (!pwdActual || !pwdNueva) {
      toast({ title: "Campos incompletos", description: "Escribe tu contraseña actual y la nueva.", variant: "destructive" });
      return;
    }
    if (pwdNueva.length < 6) {
      toast({ title: "Contraseña muy corta", description: "Debe tener al menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (pwdNueva !== pwdConfirma) {
      toast({ title: "No coinciden", description: "La nueva contraseña y su confirmación deben ser iguales.", variant: "destructive" });
      return;
    }
    setGuardandoPwd(true);
    try {
      await apiClient.auth.changePassword(pwdActual, pwdNueva);
      setPwdActual(""); setPwdNueva(""); setPwdConfirma("");
      toast({ title: "Contraseña cambiada", description: "Úsala desde ahora para entrar en cualquiera de tus perfiles." });
    } catch (e: any) {
      const msg = e?.status === 401 ? "La contraseña actual no es correcta." : "No se pudo cambiar la contraseña.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setGuardandoPwd(false);
  };

  const verificarContrasena = async () => {
    if (!pwdVerif) return;
    setVerificando(true);
    try {
      const cfg = await apiClient.perfil.recuperacionVer(pwdVerif);
      setPregunta(cfg.recuperacion_pregunta || "");
      setRespuesta(cfg.recuperacion_respuesta || "");
      setCorreo(cfg.recuperacion_correo || "");
      setCorreo2(cfg.recuperacion_correo || "");
      if (cfg.recuperacion_pregunta) setMetodo("whatsapp");
      else if (cfg.recuperacion_correo) setMetodo("correo");
      setVerificada(true);
    } catch {
      toast({ title: "Contraseña incorrecta", description: "Verifica tu contraseña e intenta de nuevo.", variant: "destructive" });
    }
    setVerificando(false);
  };

  const guardarRecuperacion = async () => {
    if (metodo === "whatsapp" && (!pregunta.trim() || !respuesta.trim())) {
      toast({ title: "Campos incompletos", description: "Escribe la pregunta y su respuesta.", variant: "destructive" });
      return;
    }
    if (metodo === "correo") {
      if (!correo.trim()) {
        toast({ title: "Falta el correo", description: "Escribe el correo donde quieres recibir tu contraseña.", variant: "destructive" });
        return;
      }
      if (correo.trim().toLowerCase() !== correo2.trim().toLowerCase()) {
        toast({ title: "Los correos no coinciden", description: "Escríbelo igual en los dos campos.", variant: "destructive" });
        return;
      }
    }
    setGuardandoRec(true);
    try {
      await apiClient.perfil.recuperacionGuardar({
        contrasena: pwdVerif,
        metodo: metodo!,
        pregunta: pregunta.trim(),
        respuesta: respuesta.trim(),
        correo: correo.trim(),
      });
      toast({
        title: "Recuperación configurada",
        description: metodo === "whatsapp"
          ? "Cuando olvides tu contraseña, Normi te hará esta pregunta por WhatsApp."
          : "Cuando olvides tu contraseña, podrás recibirla en ese correo desde la página de inicio.",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e?.body?.detail || "No se pudo guardar.", variant: "destructive" });
    }
    setGuardandoRec(false);
  };

  const inputCls = "w-full px-3 py-2 border border-input rounded-md text-sm bg-background";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-3xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => setVista("menu")} className={vista === "menu" ? "text-foreground font-medium" : "text-primary hover:underline"}>Perfil</button>
            {vista === "datos" && (<><span className="text-muted-foreground">&rarr;</span><span className="text-foreground font-medium">Cambiar datos</span></>)}
            {vista === "recuperacion" && (<><span className="text-muted-foreground">&rarr;</span><span className="text-foreground font-medium">Recuperación de contraseña</span></>)}
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-3 mb-6">
            <img src={iconPerfil} alt="" className="h-8 w-8 object-contain rounded-full border-2 border-black" /> Perfil
          </h2>

          {vista === "menu" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button onClick={() => setVista("datos")} className="flex flex-col items-center gap-3 p-8 rounded-lg bg-sky-100 hover:bg-sky-200 transition-colors cursor-pointer">
                <UserRound className="w-10 h-10 text-sky-700" />
                <span className="font-semibold text-foreground">Cambiar datos</span>
                <span className="text-xs text-muted-foreground text-center">
                  {esEstudiante ? "Tu número de celular y tu contraseña" : "Tu nombre, celular, fecha de nacimiento y contraseña"}
                </span>
              </button>
              <button onClick={() => { setVista("recuperacion"); setVerificada(false); setPwdVerif(""); }} className="flex flex-col items-center gap-3 p-8 rounded-lg bg-amber-100 hover:bg-amber-200 transition-colors cursor-pointer">
                <KeyRound className="w-10 h-10 text-amber-700" />
                <span className="font-semibold text-foreground">Recuperación de contraseña</span>
                <span className="text-xs text-muted-foreground text-center">Configura cómo recuperarla cuando se te olvide</span>
              </button>
            </div>
          )}

          {vista === "datos" && (
            <div className="space-y-6 max-w-md">
              <button onClick={() => setVista("menu")} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="w-4 h-4" /> Volver</button>
              {cargandoDatos ? <p className="text-muted-foreground text-sm">Cargando...</p> : (
                <>
                  {!esEstudiante && (
                    <>
                      <div>
                        <label className="text-sm font-medium block mb-1">Nombres</label>
                        <input value={nombres} onChange={(e) => setNombres(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="text-sm font-medium block mb-1">Apellidos</label>
                        <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} className={inputCls} />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-sm font-medium block mb-1">Número de celular</label>
                    <PhoneInput value={telefono} onChange={setTelefono} placeholder="Ej: 3001234567" />
                  </div>
                  {!esEstudiante && (
                    <div>
                      <label className="text-sm font-medium block mb-1">Fecha de nacimiento</label>
                      <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className={inputCls} />
                    </div>
                  )}
                  <button onClick={guardarDatos} disabled={guardandoDatos} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {guardandoDatos && <Loader2 className="w-4 h-4 animate-spin" />} Guardar datos
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Estos datos se corrigen para todos tus perfiles, en todos los colegios donde estés registrado.
                  </p>

                  <div className="border-t border-border pt-5 space-y-3">
                    <h3 className="font-semibold text-foreground">Cambiar contraseña</h3>
                    <div className="relative">
                      <input type={showPwd ? "text" : "password"} value={pwdActual} onChange={(e) => setPwdActual(e.target.value)} placeholder="Contraseña actual" className={inputCls} />
                      <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <input type={showPwd ? "text" : "password"} value={pwdNueva} onChange={(e) => setPwdNueva(e.target.value)} placeholder="Nueva contraseña (mínimo 6 caracteres)" className={inputCls} />
                    <input type={showPwd ? "text" : "password"} value={pwdConfirma} onChange={(e) => setPwdConfirma(e.target.value)} placeholder="Repite la nueva contraseña" className={inputCls} />
                    <button onClick={guardarContrasena} disabled={guardandoPwd} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                      {guardandoPwd && <Loader2 className="w-4 h-4 animate-spin" />} Cambiar contraseña
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {vista === "recuperacion" && (
            <div className="space-y-5 max-w-md">
              <button onClick={() => setVista("menu")} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="w-4 h-4" /> Volver</button>

              {!verificada ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Por tu seguridad, primero verifica tu contraseña.</p>
                  <div className="relative">
                    <input
                      type={showPwdVerif ? "text" : "password"}
                      value={pwdVerif}
                      onChange={(e) => setPwdVerif(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && verificarContrasena()}
                      placeholder="Tu contraseña"
                      className={inputCls}
                    />
                    <button type="button" onClick={() => setShowPwdVerif(!showPwdVerif)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                      {showPwdVerif ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button onClick={verificarContrasena} disabled={verificando || !pwdVerif} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {verificando && <Loader2 className="w-4 h-4 animate-spin" />} Verificar
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <h3 className="font-semibold text-foreground">¿Cómo desea recuperar su contraseña cuando se olvide?</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setMetodo("whatsapp")} className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors cursor-pointer ${metodo === "whatsapp" ? "border-green-500 bg-green-50" : "border-border hover:border-green-300"}`}>
                      <MessageCircle className="w-7 h-7 text-green-600" />
                      <span className="text-sm font-medium">Por WhatsApp</span>
                      <span className="text-[11px] text-muted-foreground text-center">Normi te hará una pregunta secreta</span>
                    </button>
                    <button onClick={() => setMetodo("correo")} className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors cursor-pointer ${metodo === "correo" ? "border-blue-500 bg-blue-50" : "border-border hover:border-blue-300"}`}>
                      <Mail className="w-7 h-7 text-blue-600" />
                      <span className="text-sm font-medium">Por correo</span>
                      <span className="text-[11px] text-muted-foreground text-center">Te llega al correo desde la página de inicio</span>
                    </button>
                  </div>

                  {metodo === "whatsapp" && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium block mb-1">Pregunta secreta</label>
                        <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="Una pregunta cuya respuesta solo tú conozcas" className={inputCls} maxLength={200} />
                      </div>
                      <div>
                        <label className="text-sm font-medium block mb-1">Respuesta</label>
                        <input value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="La respuesta a tu pregunta" className={inputCls} maxLength={200} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cuando le digas a Normi por WhatsApp que olvidaste tu contraseña, te hará esta pregunta. Si la respuesta coincide, te dará tu contraseña en el chat.
                      </p>
                    </div>
                  )}

                  {metodo === "correo" && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium block mb-1">Correo de recuperación</label>
                        <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tucorreo@ejemplo.com" className={inputCls} />
                      </div>
                      <div>
                        <label className="text-sm font-medium block mb-1">Repite el correo</label>
                        <input type="email" value={correo2} onChange={(e) => setCorreo2(e.target.value)} placeholder="tucorreo@ejemplo.com" className={inputCls} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cuando olvides tu contraseña, en la página de inicio podrás pedir que te la enviemos a este correo.
                      </p>
                    </div>
                  )}

                  {metodo && (
                    <button onClick={guardarRecuperacion} disabled={guardandoRec} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                      {guardandoRec && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Perfil;
