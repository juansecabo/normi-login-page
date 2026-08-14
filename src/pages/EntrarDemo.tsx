import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { saveSession, AcudidoData } from "@/hooks/useSession";

/**
 * Punto de aterrizaje del deck de presentación (/demo). Los botones "Entrar
 * como …" del deck redirigen a /entrar-demo?perfil=rector|profesor|estudiante|
 * acudiente; aquí se inicia sesión de verdad en el colegio demo (Cailico) y se
 * lleva al dashboard real, sin pedir usuario ni contraseña.
 */
type Perfil = "rector" | "profesor" | "estudiante" | "acudiente";
const VALIDOS: Perfil[] = ["rector", "profesor", "estudiante", "acudiente"];

const EntrarDemo = () => {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  useEffect(() => {
    const perfil = (sp.get("perfil") || "").toLowerCase() as Perfil;
    if (!VALIDOS.includes(perfil)) { window.location.href = "/demo"; return; }
    let cancelado = false;
    (async () => {
      try {
        const { user } = await apiClient.auth.demoLoginAs(perfil);
        if (cancelado) return;
        const multi = user.multi_membership === true;
        const avatar = user.avatar_url || null;
        const c = user.colegio || ({} as any);
        const genero = (user as any).genero || null;
        const acudidos = (user.acudidos || []) as AcudidoData[];
        saveSession(
          user.id, user.nombres, user.apellidos, user.rol,
          user.nivel || null, user.grado || null, user.salon || null,
          user.rol === "Acudiente" ? acudidos : null,
          multi, avatar, c.id || null, c.nombre || null, c.logo_url || null, c.slug || null, genero,
        );
        localStorage.setItem("sin_contrasena", "0");
        navigate("/dashboard", { replace: true });
      } catch {
        if (!cancelado) window.location.href = "/demo";
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#071710] text-white">
      <Loader2 className="w-8 h-8 animate-spin text-lime-300" />
      <p className="text-white/80">Entrando al colegio demo…</p>
    </div>
  );
};

export default EntrarDemo;
