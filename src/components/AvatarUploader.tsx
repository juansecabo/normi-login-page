import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import Cropper, { type Area } from "react-easy-crop";
import { apiClient } from "@/lib/apiClient";
import { updateSessionAvatar, getSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface AvatarUploaderProps {
  /** Ancho en píxeles. Default 110. */
  width?: number;
  /** Alto en píxeles. Default 140 (óvalo vertical). */
  height?: number;
}

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

// Aspecto del óvalo (ancho/alto). El cropper genera una imagen rectangular
// con ESTE mismo ratio para que el preview oval coincida 1:1 con el resultado.
const OVAL_ASPECT = 110 / 140;
// Tamaño en píxeles del output final que se sube (alto). Mantiene el aspect.
const OUTPUT_HEIGHT = 560;

const initials = (nombres?: string | null, apellidos?: string | null): string => {
  const n = (nombres || "").trim().charAt(0).toUpperCase();
  const a = (apellidos || "").trim().charAt(0).toUpperCase();
  return (n + a) || "?";
};

/** Carga un dataURL/blobURL en un <img> y resuelve con el HTMLImageElement. */
const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/**
 * Recorta el área indicada del archivo original y devuelve un Blob.
 * Prefiere WebP (más liviano para la misma calidad visual) y cae a JPG
 * si el browser no lo soporta — algunos navegadores corporativos viejos
 * ignoran "image/webp" y devuelven PNG sin avisar.
 */
async function cropToBlob(imageSrc: string, area: Area): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const outH = OUTPUT_HEIGHT;
  const outW = Math.round(outH * OVAL_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, outW, outH,
  );
  const tryEncode = (mime: string): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, 0.8));
  const webp = await tryEncode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpg = await tryEncode("image/jpeg");
  if (jpg) return jpg;
  throw new Error("No se pudo codificar la imagen");
}

const AvatarUploader = ({ width = 110, height = 140 }: AvatarUploaderProps) => {
  const session = getSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(session.avatar_url);

  // Sync con BD al montar: si la foto se subio en otro dispositivo despues del
  // login en este, la sesion local no se enteraria. /auth/me devuelve el
  // avatar_url vivo desde BD.
  useEffect(() => {
    let cancelled = false;
    apiClient.auth.me()
      .then(({ user }) => {
        if (cancelled) return;
        const fresh = (user as any).avatar_url || null;
        if (fresh !== avatarUrl) {
          setAvatarUrl(fresh);
          updateSessionAvatar(fresh);
        }
      })
      .catch(() => { /* silencio: el avatar no es critico */ });
    return () => { cancelled = true; };
    // Solo al montar — no queremos refetch en cada cambio interno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Diálogo: 'instructions' antes de elegir; 'crop' una vez elegida la foto.
  const [stage, setStage] = useState<"closed" | "instructions" | "crop">("closed");
  const [pickedSrc, setPickedSrc] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState<string>("image/jpeg");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const dimension = { width, height, borderRadius: "50%" };
  const fontSize = Math.round(Math.min(width, height) * 0.4);

  const openInstructions = () => setStage("instructions");
  const closeDialog = () => {
    setStage("closed");
    setPickedSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
  };

  const handlePick = () => inputRef.current?.click();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    const reader = new FileReader();
    reader.onload = () => {
      setPickedSrc(reader.result as string);
      setPickedMime(file.type);
      setStage("crop");
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_: Area, areaPx: Area) => {
    setCroppedArea(areaPx);
  }, []);

  const handleSave = async () => {
    if (!pickedSrc || !croppedArea) return;
    setUploading(true);
    try {
      const blob = await cropToBlob(pickedSrc, croppedArea);
      // Convertimos el blob a File para reusar apiClient.auth.uploadAvatar.
      // El nombre/extension respeta el mime real (webp si el browser lo soporta).
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const file = new File([blob], `avatar.${ext}`, { type: blob.type });
      const { avatar_url } = await apiClient.auth.uploadAvatar(file);
      setAvatarUrl(avatar_url);
      updateSessionAvatar(avatar_url);
      toast({ title: "Foto actualizada" });
      closeDialog();
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

  return (
    <>
      <button
        type="button"
        onClick={openInstructions}
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
        <div
          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white"
          style={{ borderRadius: "50%" }}
        >
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

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFile}
        className="hidden"
      />

      <Dialog open={stage !== "closed"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        {stage === "instructions" && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Foto de perfil</DialogTitle>
              <DialogDescription>
                Sube una foto formal donde se vea tu cara claramente. Después podrás ajustarla dentro del óvalo (mover y agrandar/encoger).
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Formatos: JPG, PNG o WEBP. Tamaño máximo: 5 MB.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button onClick={handlePick}>Seleccionar foto</Button>
            </DialogFooter>
          </DialogContent>
        )}

        {stage === "crop" && pickedSrc && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Acomoda tu foto</DialogTitle>
              <DialogDescription>
                Arrastra para mover y usa el control para agrandar o encoger.
              </DialogDescription>
            </DialogHeader>
            <div className="relative w-full bg-black/80 rounded-md overflow-hidden" style={{ height: 360 }}>
              <Cropper
                image={pickedSrc}
                crop={crop}
                zoom={zoom}
                aspect={OVAL_ASPECT}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                style={{
                  cropAreaStyle: {
                    borderRadius: "50%",
                    border: "3px solid white",
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                  },
                }}
              />
            </div>
            <div className="px-1 pt-2">
              <label className="text-xs text-muted-foreground">Zoom</label>
              <Slider
                value={[zoom]}
                min={1}
                max={4}
                step={0.05}
                onValueChange={(v) => setZoom(v[0])}
                className="mt-1"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog} disabled={uploading}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={uploading || !croppedArea}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
};

export default AvatarUploader;
