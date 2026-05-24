import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { updateSessionAvatar, getSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/use-toast";

interface AvatarUploaderProps {
  /** Ancho en píxeles. Default 110. */
  width?: number;
  /** Alto en píxeles. Default 140 (óvalo vertical). */
  height?: number;
  /** Si false, oculta el mensaje "Sube una foto formal..." cuando aún no hay foto. */
  showHint?: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

const initials = (nombres?: string | null, apellidos?: string | null): string => {
  const n = (nombres || "").trim().charAt(0).toUpperCase();
  const a = (apellidos || "").trim().charAt(0).toUpperCase();
  return (n + a) || "?";
};

/**
 * Avatar circular con upload inline. Click sobre el círculo → file picker.
 * Al subir actualiza la membresía del JWT actual (server determina la tabla).
 */
const AvatarUploader = ({ width = 110, height = 140, showHint = true }: AvatarUploaderProps) => {
  const session = getSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(session.avatar_url);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const handlePick = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast({ title: "Archivo grande", description: "Máximo 5 MB.", variant: "destructive" });
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Formato no soportado", description: "Usa JPG, PNG o WEBP.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { avatar_url } = await apiClient.auth.uploadAvatar(file);
      setAvatarUrl(avatar_url);
      updateSessionAvatar(avatar_url);
      toast({ title: "Foto actualizada" });
    } catch (err: any) {
      toast({
        title: "No se pudo subir",
        description: err?.message || "Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const dimension = { width, height, borderRadius: '50%' };
  const fontSize = Math.round(Math.min(width, height) * 0.4);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handlePick}
        disabled={uploading}
        className="group relative overflow-hidden border-4 border-primary/20 shadow-soft bg-secondary flex items-center justify-center transition-all hover:border-primary/40 disabled:opacity-60"
        style={dimension}
        title={avatarUrl ? "Cambiar foto" : "Subir foto"}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
        ) : (
          <span className="text-primary font-bold" style={{ fontSize }}>
            {initials(session.nombres, session.apellidos)}
          </span>
        )}
        {/* Overlay hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white" style={{ borderRadius: '50%' }}>
          {uploading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              <Camera className="w-6 h-6" />
              <span className="text-[10px] font-medium mt-0.5">
                {avatarUrl ? "Cambiar foto" : "Subir foto"}
              </span>
            </>
          )}
        </div>
      </button>
      {showHint && !avatarUrl && (
        <p className="text-xs text-muted-foreground text-center max-w-[200px] leading-tight">
          Sube una foto formal donde se vea tu cara claramente
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
};

export default AvatarUploader;
