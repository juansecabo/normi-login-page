import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, isEstudiante, isAdmin, isRectorOrCoordinador, isPadreDeFamilia } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import PhoneInput from "@/components/PhoneInput";
import { apiClient } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { UserRound, KeyRound, Eye, EyeOff, Loader2, MessageCircle, Mail, BellRing } from "lucide-react";
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

type Vista = "menu" | "datos" | "recuperacion" | "notificaciones";

const Perfil = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  // La sección vive en la URL (?seccion=recuperacion) para que un F5 no devuelva
  // al menú: al recargar se restaura la sección donde estaba.
  const [searchParams, setSearchParams] = useSearchParams();
  const SECCIONES: Vista[] = ["menu", "datos", "recuperacion", "notificaciones"];
  const sUrl = searchParams.get("seccion") as Vista | null;
  const vista: Vista = sUrl && SECCIONES.includes(sUrl) ? sUrl : "menu";
  // PUSH (no replace): el botón "atrás" del navegador vuelve sección → menú.
  const setVista = (v: Vista) => setSearchParams(v === "menu" ? {} : { seccion: v });
  const esEstudiante = isEstudiante();

  const backLink = isAdmin() ? "/dashboard"
    : isRectorOrCoordinador() ? "/dashboard"
    : isEstudiante() ? "/dashboard"
    : isPadreDeFamilia() ? "/dashboard"
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
  const [verificando, setVerificando] = useState(false);
  const [metodo, setMetodo] = useState<"whatsapp" | "correo" | null>(null);
  // En el celular las tarjetas WhatsApp/Correo llenan la pantalla y los campos
  // aparecen abajo sin que se vea el cambio; al elegir, bajamos hasta ellos.
  const camposRecRef = useRef<HTMLDivElement | null>(null);
  const elegirMetodo = (m: "whatsapp" | "correo") => {
    setMetodo(m);
    setTimeout(() => camposRecRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [correo, setCorreo] = useState("");
  const [correo2, setCorreo2] = useState("");
  const [guardandoRec, setGuardandoRec] = useState(false);

  // ── Notificaciones al WhatsApp ──
  // Interruptores por tipo. La plataforma registra todo igual; apagar solo
  // silencia el mensaje de WhatsApp. Guardado inmediato con revert si falla.
  const [notifTipos, setNotifTipos] = useState<Array<{ clave: string; etiqueta: string; descripcion: string; activo: boolean }>>([]);
  const [cargandoNotif, setCargandoNotif] = useState(false);
  const [notifCargadas, setNotifCargadas] = useState(false);

  const toggleNotificacion = async (clave: string) => {
    const previo = notifTipos;
    const nuevos = notifTipos.map((t) => (t.clave === clave ? { ...t, activo: !t.activo } : t));
    setNotifTipos(nuevos);
    try {
      await apiClient.perfil.guardarNotificaciones(nuevos.filter((t) => !t.activo).map((t) => t.clave));
    } catch (e: any) {
      setNotifTipos(previo);
      toast({ title: "Error", description: e?.body?.detail || "No se pudo guardar el cambio.", variant: "destructive" });
    }
  };

  useEffect(() => {
    const session = getSession();
    if (!session.id) {
      // Preservar el destino (ej. ?seccion=recuperacion) para volver aquí tras el login.
      const destino = `${window.location.pathname}${window.location.search}`;
      navigate(`/?redirect=${encodeURIComponent(destino)}`, { replace: true });
      return;
    }
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

  // Si entramos (o recargamos) en la sección de recuperación, cargar su config.
  // Solo si hay sesión: sin JWT el guard ya redirige al login y NO debemos
  // disparar la llamada (fallaría con 401 y mostraría un pop-up de error).
  useEffect(() => {
    if (vista === "recuperacion" && !verificada && getSession().id) cargarRecuperacion();
    if (vista === "notificaciones" && !notifCargadas && getSession().id) {
      setCargandoNotif(true);
      apiClient.perfil.notificaciones()
        .then((r) => { setNotifTipos(r.tipos); setNotifCargadas(true); })
        .catch(() => toast({ title: "Error", description: "No se pudieron cargar las notificaciones.", variant: "destructive" }))
        .finally(() => setCargandoNotif(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

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
      toast({ title: "Datos actualizados", description: "El cambio aplica a todos tus perfiles en todos los colegios.", variant: "success" as any });
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
      toast({ title: "Contraseña cambiada", description: "Úsala desde ahora para entrar en cualquiera de tus perfiles.", variant: "success" as any });
    } catch (e: any) {
      const msg = e?.status === 401 ? "La contraseña actual no es correcta." : "No se pudo cambiar la contraseña.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setGuardandoPwd(false);
  };

  // Carga la config de recuperación al entrar (ya NO se pide la contraseña).
  const cargarRecuperacion = async () => {
    setVerificando(true);
    try {
      const cfg = await apiClient.perfil.recuperacionVer();
      setPregunta(cfg.recuperacion_pregunta || "");
      setRespuesta(cfg.recuperacion_respuesta || "");
      setCorreo(cfg.correo || "");
      setCorreo2(cfg.correo || "");
      if (cfg.recuperacion_pregunta) setMetodo("whatsapp");
      else if (cfg.correo) setMetodo("correo");
      setVerificada(true);
    } catch {
      toast({ title: "No se pudo cargar", description: "Intenta de nuevo.", variant: "destructive" });
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
        variant: "success" as any,
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
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-5xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => setVista("menu")} className={vista === "menu" ? "text-foreground font-medium" : "text-primary hover:underline"}>Perfil</button>
            {vista === "datos" && (<><span className="text-muted-foreground">&rarr;</span><span className="text-foreground font-medium">Cambiar datos</span></>)}
            {vista === "recuperacion" && (<><span className="text-muted-foreground">&rarr;</span><span className="text-foreground font-medium">Recuperación de contraseña</span></>)}
            {vista === "notificaciones" && (<><span className="text-muted-foreground">&rarr;</span><span className="text-foreground font-medium">Notificaciones al WhatsApp</span></>)}
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          {vista === "menu" ? (
            <h2 className="text-xl font-bold text-foreground flex items-center gap-3 mb-6">
              <img src={iconPerfil} alt="" className="h-8 w-8 object-contain" /> Perfil
            </h2>
          ) : (
            <h2 className="text-xl font-bold text-foreground text-center mb-6">
              {vista === "datos" ? "Cambiar datos" : vista === "recuperacion" ? "Recuperación de contraseña" : "Notificaciones al WhatsApp"}
            </h2>
          )}

          {vista === "menu" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button onClick={() => setVista("datos")} data-guia="varios.perfil_ficha_datos" className="flex flex-col items-center gap-3 p-10 rounded-xl bg-sky-100 hover:bg-sky-200 transition-colors cursor-pointer">
                <UserRound className="w-12 h-12 text-sky-700" />
                <span className="text-lg font-semibold text-foreground">Cambiar datos</span>
                <span className="text-sm text-muted-foreground text-center">
                  {esEstudiante ? "Tu número de celular y tu contraseña" : "Tu nombre, celular, fecha de nacimiento y contraseña"}
                </span>
              </button>
              <button onClick={() => setVista("recuperacion")} data-guia="varios.perfil_ficha_recuperacion" className="flex flex-col items-center gap-3 p-10 rounded-xl bg-amber-100 hover:bg-amber-200 transition-colors cursor-pointer">
                <KeyRound className="w-12 h-12 text-amber-700" />
                <span className="text-lg font-semibold text-foreground">Recuperación de contraseña</span>
                <span className="text-sm text-muted-foreground text-center">Configura cómo recuperarla cuando se te olvide</span>
              </button>
              <button onClick={() => setVista("notificaciones")} data-guia="varios.perfil_ficha_notificaciones" className="flex flex-col items-center gap-3 p-10 rounded-xl bg-emerald-100 hover:bg-emerald-200 transition-colors cursor-pointer">
                <BellRing className="w-12 h-12 text-emerald-700" />
                <span className="text-lg font-semibold text-foreground">Notificaciones al WhatsApp</span>
                <span className="text-sm text-muted-foreground text-center">Elige qué avisos quieres recibir en tu WhatsApp</span>
              </button>
            </div>
          )}

          {vista === "notificaciones" && (
            <div className="space-y-4 max-w-xl mx-auto">
              <p className="text-sm text-muted-foreground">
                Apaga los avisos que no quieras recibir en tu WhatsApp. Todo sigue quedando registrado
                en la plataforma igual que siempre, lo único que se silencia es el mensaje.
              </p>
              {cargandoNotif ? (
                <p className="text-muted-foreground text-sm">Cargando...</p>
              ) : (
                <div className="space-y-2" data-guia="varios.perfil_lista_notificaciones">
                  {notifTipos.map((t) => (
                    <div key={t.clave} className="flex items-center justify-between gap-4 border border-border rounded-lg p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{t.etiqueta}</p>
                        <p className="text-xs text-muted-foreground">{t.descripcion}</p>
                      </div>
                      <button
                        role="switch"
                        aria-checked={t.activo}
                        aria-label={`${t.activo ? "Apagar" : "Encender"} ${t.etiqueta}`}
                        onClick={() => toggleNotificacion(t.clave)}
                        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer ${t.activo ? "bg-primary" : "bg-muted-foreground/30"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${t.activo ? "translate-x-5" : ""}`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {vista === "datos" && (
            <div className="space-y-6 max-w-md mx-auto">
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
                  <div data-guia="varios.perfil_input_telefono">
                    <label className="text-sm font-medium block mb-1">Número de celular</label>
                    <PhoneInput value={telefono} onChange={setTelefono} placeholder="Ej: 3001234567" />
                  </div>
                  {!esEstudiante && (
                    <div>
                      <label className="text-sm font-medium block mb-1">Fecha de nacimiento</label>
                      <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className={inputCls} />
                    </div>
                  )}
                  <button onClick={guardarDatos} disabled={guardandoDatos} data-guia="varios.perfil_guardar_datos" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {guardandoDatos && <Loader2 className="w-4 h-4 animate-spin" />} Guardar datos
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Estos datos se corrigen para todos tus perfiles, en todos los colegios donde estés registrado.
                  </p>

                  <div className="border-t border-border pt-5 space-y-3">
                    <h3 className="font-semibold text-foreground">Cambiar contraseña</h3>
                    <div className="relative">
                      <input type={showPwd ? "text" : "password"} autoComplete="new-password" data-guia="varios.perfil_pwd_actual" value={pwdActual} onChange={(e) => setPwdActual(e.target.value)} placeholder="Contraseña actual" className={inputCls} />
                      <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <input type={showPwd ? "text" : "password"} autoComplete="new-password" data-guia="varios.perfil_pwd_nueva" value={pwdNueva} onChange={(e) => setPwdNueva(e.target.value)} placeholder="Nueva contraseña (mínimo 6 caracteres)" className={inputCls} />
                    <input type={showPwd ? "text" : "password"} autoComplete="new-password" data-guia="varios.perfil_pwd_confirma" value={pwdConfirma} onChange={(e) => setPwdConfirma(e.target.value)} placeholder="Repite la nueva contraseña" className={inputCls} />
                    <button onClick={guardarContrasena} disabled={guardandoPwd} data-guia="varios.perfil_guardar_contrasena" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                      {guardandoPwd && <Loader2 className="w-4 h-4 animate-spin" />} Cambiar contraseña
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {vista === "recuperacion" && (
            <div className="space-y-5 max-w-md mx-auto">

              {!verificada ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
                </div>
              ) : (
                <div className="space-y-5">
                  <h3 className="font-semibold text-foreground">¿Cómo desea recuperar su contraseña cuando se olvide?</h3>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <button onClick={() => elegirMetodo("whatsapp")} data-guia="varios.perfil_rec_metodo_whatsapp" className={`flex flex-col items-center gap-2 sm:gap-3 p-4 sm:p-8 rounded-xl border-2 bg-green-100 hover:bg-green-200 transition-colors cursor-pointer ${metodo === "whatsapp" ? "border-green-600 shadow-md" : "border-transparent"}`}>
                      <MessageCircle className="w-8 h-8 sm:w-12 sm:h-12 text-green-600" />
                      <span className="text-base sm:text-lg font-semibold text-foreground">Por WhatsApp</span>
                      <span className="text-xs sm:text-sm text-muted-foreground text-center">Normi te hará una pregunta secreta</span>
                    </button>
                    <button onClick={() => elegirMetodo("correo")} data-guia="varios.perfil_rec_metodo_correo" className={`flex flex-col items-center gap-2 sm:gap-3 p-4 sm:p-8 rounded-xl border-2 bg-blue-100 hover:bg-blue-200 transition-colors cursor-pointer ${metodo === "correo" ? "border-blue-600 shadow-md" : "border-transparent"}`}>
                      <Mail className="w-8 h-8 sm:w-12 sm:h-12 text-blue-600" />
                      <span className="text-base sm:text-lg font-semibold text-foreground">Por correo</span>
                      <span className="text-xs sm:text-sm text-muted-foreground text-center">Te llega al correo desde la página de inicio</span>
                    </button>
                  </div>

                  {metodo === "whatsapp" && (
                    <div ref={camposRecRef} className="space-y-3 scroll-mt-4">
                      <div>
                        <label className="text-sm font-medium block mb-1">Pregunta secreta</label>
                        <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} data-guia="varios.perfil_rec_pregunta" placeholder="Una pregunta cuya respuesta solo tú conozcas" className={inputCls} maxLength={200} />
                      </div>
                      <div>
                        <label className="text-sm font-medium block mb-1">Respuesta</label>
                        <input value={respuesta} onChange={(e) => setRespuesta(e.target.value)} data-guia="varios.perfil_rec_respuesta" placeholder="La respuesta a tu pregunta" className={inputCls} maxLength={200} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cuando le digas a Normi por WhatsApp que olvidaste tu contraseña, te hará esta pregunta. Si la respuesta coincide, te dará tu contraseña en el chat.
                      </p>
                    </div>
                  )}

                  {metodo === "correo" && (
                    <div ref={camposRecRef} className="space-y-3 scroll-mt-4">
                      <div>
                        <label className="text-sm font-medium block mb-1">Correo de recuperación</label>
                        <input type="email" autoComplete="off" data-guia="varios.perfil_rec_correo" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tucorreo@ejemplo.com" className={inputCls} />
                      </div>
                      <div>
                        <label className="text-sm font-medium block mb-1">Repite el correo</label>
                        <input type="email" autoComplete="off" data-guia="varios.perfil_rec_correo2" value={correo2} onChange={(e) => setCorreo2(e.target.value)} placeholder="tucorreo@ejemplo.com" className={inputCls} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cuando olvides tu contraseña, en la página de inicio podrás pedir que te la enviemos a este correo.
                      </p>
                    </div>
                  )}

                  {metodo && (
                    <button onClick={guardarRecuperacion} disabled={guardandoRec} data-guia="varios.perfil_rec_guardar" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
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
