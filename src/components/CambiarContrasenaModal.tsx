import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getSession } from "@/hooks/useSession";

interface CambiarContrasenaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Cambia la contraseña del usuario.
 *
 * Fase 10: la contraseña vive en Usuarios.contrasena (global, una por persona).
 * Ya no se actualiza por tabla operativa (Internos.contrasena, PG.contrasena).
 * Por compatibilidad mientras dura la transición, también actualizamos las
 * tablas operativas si el usuario tiene fila ahí.
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

    if (!contrasenaActual || !nuevaContrasena || !confirmarContrasena) {
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
      // 1. Validar contraseña actual contra Usuarios (fuente de verdad)
      const { data: usuario, error: fetchError } = await supabase
        .from("Usuarios")
        .select("id, contrasena")
        .eq("id", session.id)
        .maybeSingle();

      if (fetchError || !usuario) {
        setError("No se pudo verificar el usuario");
        setLoading(false);
        return;
      }

      // Permite "contraseña = id" como primera vez si la contrasena está en NULL
      const contrasenaEsperada = usuario.contrasena ?? String(usuario.id);
      if (contrasenaActual !== contrasenaEsperada) {
        setError("La contraseña actual es incorrecta");
        setLoading(false);
        return;
      }

      // 2. Actualizar en Usuarios (fuente de verdad)
      const { error: updateError } = await supabase
        .from("Usuarios")
        .update({ contrasena: nuevaContrasena })
        .eq("id", session.id);

      if (updateError) {
        setError("No se pudo guardar la contraseña. Contacta al administrador.");
        setLoading(false);
        return;
      }

      // 3. Compat: actualizar también en tablas operativas (mientras dure la transición)
      // Estos updates son silenciosos — si la fila no existe, no pasa nada.
      await Promise.allSettled([
        supabase.from("Internos").update({ contrasena: nuevaContrasena }).eq("id", parseInt(session.id)),
        supabase.from("Perfiles_Generales")
          .update({ contrasena: nuevaContrasena })
          .or(`estudiante_id.eq.${session.id},padre_id.eq.${session.id}`),
      ]);

      setSuccess("Contraseña actualizada correctamente");
      setContrasenaActual("");
      setNuevaContrasena("");
      setConfirmarContrasena("");

      setTimeout(() => {
        closeModal();
      }, 2000);
    } catch {
      toast({ title: "Error", description: "Ocurrió un error inesperado", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={closeModal} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Cambiar contraseña</h2>

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                type={showNueva ? "text" : "password"}
                value={nuevaContrasena}
                onChange={(e) => setNuevaContrasena(e.target.value)}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Ingresa la nueva contraseña"
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
                onChange={(e) => setConfirmarContrasena(e.target.value)}
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
