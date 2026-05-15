import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Download, Share } from "lucide-react";
import escudoImg from "@/assets/escudo.webp";
import normyImg from "@/assets/normy-placeholder.webp";
import cailicoLogo from "@/assets/cailico-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { saveSession, getSession, HijoData } from "@/hooks/useSession";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

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
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canInstall, isIOS, installApp } = useInstallPrompt();

  // Si ya hay sesión activa, redirigir sin pedir contraseña
  useEffect(() => {
    const session = getSession();
    if (session.id) {
      if (session.cargo === 'Administrador') {
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
      } else if (session.cargo === 'Padre de familia') {
        navigate(getPostLoginRoute("/dashboard-padre"), { replace: true });
      } else {
        navigate(getPostLoginRoute("/dashboard"), { replace: true });
      }
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const idInput = identificacion.trim();
    const passInput = contrasena.trim();

    if (!idInput) {
      toast({ title: "Error", description: "Por favor ingresa tu # de identidad", variant: "destructive" });
      return;
    }
    if (!passInput) {
      toast({ title: "Error", description: "Por favor ingresa tu contraseña", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      // 1. Buscar en Internos por código de identidad
      const { data: usuario, error } = await supabase
        .from('Internos')
        .select('*')
        .eq('id', parseInt(idInput))
        .maybeSingle();

      if (error) {
        toast({ title: "Error", description: "Error al verificar", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Track si el id existe en alguna tabla, para distinguir "id inexistente"
      // vs "id existente pero contraseña equivocada" al final.
      let idExisteEnAlgunaTabla = false;

      if (usuario) {
        idExisteEnAlgunaTabla = true;
        // Verificar contraseña de interno
        const contrasenaCorrecta = usuario.contrasena
          ? usuario.contrasena === passInput
          : String(usuario.id) === passInput;

        if (contrasenaCorrecta) {
          const cargosPermitidos = ['Profesor(a)', 'Rector', 'Coordinador(a)', 'Administrador', 'Administrativo(a)', 'Secretaria General', 'Orientador(a) Escolar'];
          if (!cargosPermitidos.includes(usuario.cargo)) {
            toast({ title: "Acceso denegado", description: "No tienes permisos de acceso", variant: "destructive" });
            setLoading(false);
            return;
          }

          saveSession(String(usuario.id), usuario.nombres || "", usuario.apellidos || "", usuario.cargo || "");

          if (usuario.cargo === 'Administrador') {
            navigate(getPostLoginRoute("/dashboard-admin"));
          } else if (
            usuario.cargo === 'Rector' ||
            usuario.cargo === 'Coordinador(a)' ||
            usuario.cargo === 'Administrativo(a)' ||
            usuario.cargo === 'Secretaria General' ||
            usuario.cargo === 'Orientador(a) Escolar'
          ) {
            navigate(getPostLoginRoute("/dashboard-rector"));
          } else {
            navigate(getPostLoginRoute("/dashboard"));
          }
          return;
        }
        // Contraseña de interno NO coincide — no rechazamos aún; el mismo id
        // podría estar también en Perfiles_Generales (profesor que es padre, etc.).
      }

      // 2. Buscar en Perfiles_Generales como Estudiante
      const { data: perfilEstudiante, error: errEstudiante } = await supabase
        .from('Perfiles_Generales')
        .select('*')
        .eq('estudiante_id', idInput)
        .not('perfil', 'is', null)
        .maybeSingle();

      if (errEstudiante) {
        toast({ title: "Error", description: "Error al verificar", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (perfilEstudiante) {
        idExisteEnAlgunaTabla = true;
        if (perfilEstudiante.contrasena === passInput) {
          // Buscar datos del estudiante en tabla Estudiantes
          const { data: estData } = await supabase
            .from('Estudiantes')
            .select('*')
            .eq('id_estudiantil', idInput)
            .maybeSingle();

          const nivel = estData?.nivel_estudiante || perfilEstudiante.estudiante_nivel || '';
          const grado = estData?.grado_estudiante || perfilEstudiante.estudiante_grado || '';
          const salon = estData?.salon_estudiante || perfilEstudiante.estudiante_salon || '';
          const nombre = estData?.nombre_estudiante || perfilEstudiante.estudiante_nombre || '';
          const apellidos = estData?.apellidos_estudiante || perfilEstudiante.estudiante_apellidos || '';

          saveSession(idInput, nombre, apellidos, 'Estudiante', nivel, grado, salon);
          navigate("/dashboard-estudiante");
          return;
        }
        // Contraseña de estudiante no coincide — seguir a probar padre.
      }

      // 3. Buscar en Perfiles_Generales como Padre de familia
      const { data: perfilPadre, error: errPadre } = await supabase
        .from('Perfiles_Generales')
        .select('*')
        .eq('padre_id', idInput)
        .not('perfil', 'is', null)
        .maybeSingle();

      if (errPadre) {
        toast({ title: "Error", description: "Error al verificar", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (perfilPadre) {
        idExisteEnAlgunaTabla = true;
        if (perfilPadre.contrasena !== passInput) {
          // Contraseña de padre tampoco coincide — cae al mensaje final.
        } else {

        // Construir lista de hijos
        const hijos: HijoData[] = [];
        const numMap: Record<string, number> = { "1 (uno)": 1, "2 (dos)": 2, "3 (tres)": 3, "4 (cuatro)": 4 };
        const numHijos = numMap[perfilPadre.padre_numero_de_estudiantes] || 0;

        for (let i = 1; i <= numHijos; i++) {
          const idHijo = perfilPadre[`padre_estudiante${i}_id` as keyof typeof perfilPadre];
          if (!idHijo) continue;

          // Buscar datos actualizados del hijo en Estudiantes
          const { data: hijoData } = await supabase
            .from('Estudiantes')
            .select('*')
            .eq('id_estudiantil', String(idHijo))
            .maybeSingle();

          if (hijoData) {
            hijos.push({
              id: String(hijoData.id_estudiantil),
              nombre: hijoData.nombre_estudiante || '',
              apellidos: hijoData.apellidos_estudiante || '',
              nivel: hijoData.nivel_estudiante || '',
              grado: hijoData.grado_estudiante || '',
              salon: hijoData.salon_estudiante || '',
            });
          } else {
            // Fallback: usar datos del perfil
            hijos.push({
              id: String(idHijo),
              nombre: (perfilPadre as any)[`padre_estudiante${i}_nombre`] || '',
              apellidos: (perfilPadre as any)[`padre_estudiante${i}_apellidos`] || '',
              nivel: (perfilPadre as any)[`padre_estudiante${i}_nivel`] || '',
              grado: (perfilPadre as any)[`padre_estudiante${i}_grado`] || '',
              salon: (perfilPadre as any)[`padre_estudiante${i}_salon`] || '',
            });
          }
        }

        const nombrePadre = perfilPadre.padre_nombre || '';
        saveSession(idInput, nombrePadre, '', 'Padre de familia', null, null, null, hijos);
        navigate("/dashboard-padre");
        return;
        }
      }

      // 4. Mensaje final: si el id existe en alguna tabla pero ninguna contraseña
      // coincidió, el problema es la contraseña. Si el id no existe, problema del id.
      if (idExisteEnAlgunaTabla) {
        toast({ title: "Error", description: "Contraseña incorrecta", variant: "destructive" });
      } else {
        toast({ title: "Error", description: "Identificación no encontrada", variant: "destructive" });
      }
    } catch {
      toast({
        title: "Error",
        description: "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Columna Izquierda - Imagen de Normy */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12 bg-secondary/50">
        <div className="animate-scale-in">
          <img
            src={normyImg}
            alt="Normy - Mascota de Notas Normy"
            className="w-64 h-64 lg:w-80 lg:h-80 object-cover rounded-full shadow-soft border-4 border-primary/20"
          />
        </div>
      </div>

      {/* Columna Derecha - Formulario de Login */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Escudo */}
          <div className="flex justify-center">
            <img
              src={escudoImg}
              alt="Escudo Escuela Normal Superior de Corozal"
              className="w-28 h-auto object-contain"
            />
          </div>

          {/* Títulos */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
              Notas Normy
            </h1>
            <p className="text-muted-foreground text-sm lg:text-base">
              Escuela Normal Superior de Corozal
            </p>
          </div>

          {/* Formulario */}
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
          </form>

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

          {/* Desarrollado por */}
          <div className="text-center pt-4 space-y-2">
            <p className="text-xs text-muted-foreground">Desarrollado por:</p>
            <img
              src={cailicoLogo}
              alt="Cailico"
              className="h-8 mx-auto"
            />
            <a
              href="https://cailico.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              cailico.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
