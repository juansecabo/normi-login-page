import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiClient, ApiError } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { getSession } from "@/hooks/useSession";

interface CambiarContrasenaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Cambia la contraseña del usuario.
 *
 * Llama al endpoint dedicado /auth/change-password del server, que valida la
 * contraseña actual server-side con service_role (el flujo viejo leía
 * Usuarios.contrasena por el dbProxy y siempre venía undefined porque está en
 * denyColumns, lo cual permitía cambiar la contraseña ingresando solo la cédula).
 */
const CambiarContrasenaModal = ({ open, onOpenChange }: CambiarContrasenaModalProps) => {
  const [contrasenaActual, setContrasenaActual] = useState("");
  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [showActual, setShowActual] = useState(false);
  const [showNueva, setShowNueva] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { toast } = useToast();

  // Si el usuario aún no tiene contraseña (entró con id/id), se CREA en vez de
  // cambiar: no se pide la contraseña actual (se usa la cédula, que el backend
  // acepta por el fallback id=contraseña).
  const modoCrear = !!((getSession() as any).sin_contrasena);

  const closeModal = () => {
    setContrasenaActual("");
    setNuevaContrasena("");
    setConfirmarContrasena("");
    setShowActual(false);
    setShowNueva(false);
    setShowConfirmar(false);
    setError("");
    setSuccess("");
    onOpenChange(false);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const session = getSession();
    if (!session.id) return;

    if (!nuevaContrasena || !confirmarContrasena || (!modoCrear && !contrasenaActual)) {
      setError("Todos los campos son obligatorios");
      return;
    }
    if (nuevaContrasena.length < 6) {
      setError("La nueva contraseña debe tener mínimo 6 caracteres");
      return;
    }
    if (nuevaContrasena !== confirmarContrasena) {
      setError("Las contraseñas nuevas no coinciden");
      return;
    }

    setLoading(true);
    try {
      // En modo crear, la "contraseña actual" es la cédula (fallback del backend).
      const actual = modoCrear ? String(session.id) : contrasenaActual;
      await apiClient.auth.changePassword(actual, nuevaContrasena);
      if (modoCrear) localStorage.setItem("sin_contrasena", "0");
      setSuccess(modoCrear ? "Contraseña creada correctamente" : "Contraseña actualizada correctamente");
      setContrasenaActual("");
      setNuevaContrasena("");
      setConfirmarContrasena("");
      setTimeout(() => closeModal(), 2000);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        if (body?.error === 'invalid_current_password') {
          setError("La contraseña actual es incorrecta");
        } else if (body?.error === 'user_not_found') {
          setError("No se pudo verificar el usuario");
        } else if (body?.error === 'password_too_short') {
          setError("La nueva contraseña debe tener mínimo 6 caracteres");
        } else {
          setError("No se pudo guardar la contraseña. Contacta al administrador.");
        }
      } else {
        toast({ title: "Error", description: "Ocurrió un error inesperado", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={closeModal} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">{modoCrear ? "Crear contraseña" : "Cambiar contraseña"}</h2>

        <form onSubmit={handleGuardar} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm rounded-r-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border-l-4 border-green-500 text-green-700 text-sm rounded-r-lg">
              {success}
            </div>
          )}

          {!modoCrear && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña actual
              </label>
              <div className="relative">
                <input
                  type={showActual ? "text" : "password"}
                  value={contrasenaActual}
                  onChange={(e) => setContrasenaActual(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Ingresa tu contraseña actual"
                />
                <button
                  type="button"
                  onClick={() => setShowActual(!showActual)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showActual ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                type={showNueva ? "text" : "password"}
                value={nuevaContrasena}
                onChange={(e) => setNuevaContrasena(e.target.value.slice(0, 50))}
                maxLength={50}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Máximo 50 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowNueva(!showNueva)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNueva ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirmar nueva contraseña
            </label>
            <div className="relative">
              <input
                type={showConfirmar ? "text" : "password"}
                value={confirmarContrasena}
                onChange={(e) => setConfirmarContrasena(e.target.value.slice(0, 50))}
                maxLength={50}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Repite la nueva contraseña"
              />
              <button
                type="button"
                onClick={() => setShowConfirmar(!showConfirmar)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmar ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 px-4 py-2 font-medium rounded-lg transition-colors ${
                loading
                  ? "bg-primary/70 text-white cursor-not-allowed"
                  : "bg-primary hover:bg-primary/90 text-white"
              }`}
            >
              {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CambiarContrasenaModal;
