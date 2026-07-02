import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, RotateCcw, Trash2, Upload, X } from "lucide-react";
import Cropper, { type Area } from "react-easy-crop";
import { apiClient } from "@/lib/apiClient";
import { updateSessionAvatar, getSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface AvatarUploaderProps {
  width?: number;
  height?: number;
  /**
   * Modo "llenar el contenedor": el óvalo toma el 100% del alto del padre
   * (manteniendo la proporción). Usado en los dashboards de PC para que las
   * puntas del óvalo queden alineadas con el recuadro blanco de bienvenida.
   */
  fill?: boolean;
  /**
   * Modo "editar la foto de otra persona" (ej. director de grupo → estudiante).
   * Si se pasa, el componente edita esa foto en vez de la del usuario logueado.
   */
  target?: {
    avatarUrl: string | null;
    nombres: string;
    apellidos: string;
    onUpload: (file: File) => Promise<string>; // devuelve la nueva URL
    onDelete: () => Promise<void>;
    onChange?: (url: string | null) => void;
  };
}

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

// Marco circular: el crop genera una imagen cuadrada que se muestra
// recortada a circulo via border-radius: 50%.
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

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

async function cropToBlob(imageSrc: string, area: Area): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const outH = OUTPUT_HEIGHT;
  const outW = Math.round(outH * OVAL_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH);
  const tryEncode = (mime: string): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, 0.8));
  const webp = await tryEncode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpg = await tryEncode("image/jpeg");
  if (jpg) return jpg;
  throw new Error("No se pudo codificar la imagen");
}

type Stage = "closed" | "instructions" | "camera" | "crop";

// El feature de tomar foto requiere getUserMedia + estar en HTTPS (o localhost).
const cameraSupported =
  typeof window !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  (window.isSecureContext || window.location.hostname === "localhost");

const AvatarUploader = ({ width = 110, height = 140, fill = false, target }: AvatarUploaderProps) => {
  const session = getSession();
  const targetMode = !!target;
  const dispNombres = targetMode ? target!.nombres : session.nombres;
  const dispApellidos = targetMode ? target!.apellidos : session.apellidos;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(targetMode ? target!.avatarUrl : session.avatar_url);

  useEffect(() => {
    if (targetMode) return; // en modo target la foto la controla el padre
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
      .catch(() => { /* avatar no es critico */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // En modo target, sincronizar si el padre cambia la URL externamente.
  useEffect(() => {
    if (targetMode) setAvatarUrl(target!.avatarUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.avatarUrl]);

  // Mientras la <img> de la foto carga, mostramos una ruedita en vez de las
  // iniciales (evita el "flash" de iniciales en quienes sí tienen foto).
  const [imgLoaded, setImgLoaded] = useState(false);
  useEffect(() => { setImgLoaded(false); }, [avatarUrl]);

  const [stage, setStage] = useState<Stage>("closed");
  const [pickedSrc, setPickedSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cameraSnapshot, setCameraSnapshot] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  const dimension = fill
    ? { aspectRatio: `${width} / ${height}`, borderRadius: "50%" }
    : { width, height, borderRadius: "50%" };
  const fontSize = Math.round(Math.min(width, height) * 0.4);

  // Apagar stream cuando ya no se necesita la camara.
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Encender camara al entrar al stage 'camera' (y siempre que se retome).
  useEffect(() => {
    if (stage !== "camera" || cameraSnapshot) return;
    let cancelled = false;
    setCameraError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => null);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        const msg = err?.name === "NotAllowedError"
          ? "Diste permiso denegado a la cámara. Habilítalo desde la barra de direcciones."
          : err?.name === "NotFoundError"
            ? "No se detectó cámara en este dispositivo."
            : err?.message || "No se pudo abrir la cámara.";
        setCameraError(msg);
      });
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cameraSnapshot]);

  const closeDialog = () => {
    stopCamera();
    setStage("closed");
    setPickedSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
    setCameraSnapshot(null);
    setCameraError(null);
  };

  const openInstructions = () => setStage("instructions");
  const goToCamera = () => {
    setCameraSnapshot(null);
    setStage("camera");
  };
  const handlePick = () => inputRef.current?.click();

  const handleDelete = async () => {
    setUploading(true);
    try {
      if (targetMode) await target!.onDelete();
      else await apiClient.auth.deleteAvatar();
      setAvatarUrl(null);
      if (targetMode) target!.onChange?.(null);
      else updateSessionAvatar(null);
      toast({ title: "Foto eliminada" });
      closeDialog();
    } catch (err: any) {
      toast({ title: "No se pudo quitar", description: err?.message || "Intenta de nuevo.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

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
      setStage("crop");
    };
    reader.readAsDataURL(file);
  };

  // Captura el frame actual del video y lo guarda como dataURL.
  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror horizontal: el preview se muestra invertido para que sea "espejo",
    // pero el frame real NO está espejado. Lo guardamos sin mirror.
    ctx.drawImage(video, 0, 0);
    setCameraSnapshot(canvas.toDataURL("image/jpeg", 0.9));
    stopCamera();
  };

  const handleRetake = () => {
    setCameraSnapshot(null);
    // El useEffect de camara reabre el stream porque cameraSnapshot vuelve a null.
  };

  const handleAcceptCapture = () => {
    if (!cameraSnapshot) return;
    setPickedSrc(cameraSnapshot);
    setCameraSnapshot(null);
    setStage("crop");
  };

  const onCropComplete = useCallback((_: Area, areaPx: Area) => {
    setCroppedArea(areaPx);
  }, []);

  const handleSave = async () => {
    if (!pickedSrc || !croppedArea) return;
    setUploading(true);
    try {
      const blob = await cropToBlob(pickedSrc, croppedArea);
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const file = new File([blob], `avatar.${ext}`, { type: blob.type });
      const avatar_url = targetMode
        ? await target!.onUpload(file)
        : (await apiClient.auth.uploadAvatar(file)).avatar_url;
      setAvatarUrl(avatar_url);
      if (targetMode) target!.onChange?.(avatar_url);
      else updateSessionAvatar(avatar_url);
      toast({ title: "Foto actualizada" });
      closeDialog();
    } catch (err: any) {
      toast({ title: "No se pudo subir", description: err?.message || "Intenta de nuevo.", variant: "destructive" });
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
        className={`group relative overflow-hidden border-4 border-primary/20 shadow-soft bg-secondary flex items-center justify-center transition-all hover:border-primary/40 disabled:opacity-60 flex-shrink-0 ${fill ? "h-full w-auto" : "aspect-square"}`}
        style={dimension}
        title={avatarUrl ? "Cambiar foto" : "Subir foto"}
      >
        {avatarUrl ? (
          <>
            <img
              src={avatarUrl}
              alt="Foto de perfil"
              onLoad={() => setImgLoaded(true)}
              className={`w-full h-full object-cover transition-opacity duration-200 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            />
            {!imgLoaded && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="animate-spin text-primary/70" style={{ width: fontSize, height: fontSize }} />
              </span>
            )}
          </>
        ) : (
          <span className="text-primary font-bold" style={{ fontSize }}>
            {initials(dispNombres, dispApellidos)}
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
              {!avatarUrl && (
                <DialogDescription>
                  {targetMode
                    ? "Sube una foto donde se vea claramente la cara del estudiante, o tómale una en el momento. Después podrás ajustarla dentro del marco."
                    : "Sube una foto formal donde se vea tu cara claramente, o tómate una en el momento. Después podrás ajustarla dentro del marco."}
                </DialogDescription>
              )}
            </DialogHeader>

            {avatarUrl ? (
              <div className="flex justify-center py-2 bg-secondary/40 rounded-lg">
                <img
                  src={avatarUrl}
                  alt="Foto actual"
                  className="max-h-[55vh] max-w-full object-contain"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Formatos: JPG, PNG o WEBP. Tamaño máximo: 5 MB.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:justify-end">
              <Button variant="outline" onClick={closeDialog} disabled={uploading}>
                <X className="w-4 h-4 mr-2" /> Cancelar
              </Button>
              {avatarUrl && (
                <Button variant="destructive" onClick={handleDelete} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Quitar foto
                </Button>
              )}
              {cameraSupported && (
                <Button variant="secondary" onClick={goToCamera} disabled={uploading}>
                  <Camera className="w-4 h-4 mr-2" /> Tomar foto
                </Button>
              )}
              <Button onClick={handlePick} disabled={uploading}>
                <Upload className="w-4 h-4 mr-2" />
                {avatarUrl ? "Subir otra" : "Subir archivo"}
              </Button>
            </div>
          </DialogContent>
        )}

        {stage === "camera" && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Tomar foto</DialogTitle>
              <DialogDescription>
                {cameraSnapshot
                  ? "¿Te gusta cómo quedó? Puedes repetirla o aceptarla para acomodarla en el marco."
                  : "Acomoda tu cara dentro del cuadro y dale al botón para capturar."}
              </DialogDescription>
            </DialogHeader>
            <div className="relative w-full bg-black rounded-md overflow-hidden flex items-center justify-center" style={{ height: 360 }}>
              {cameraError && (
                <div className="text-white text-sm p-4 text-center flex flex-col items-center gap-2">
                  <CameraOff className="w-8 h-8" />
                  <span>{cameraError}</span>
                </div>
              )}
              {!cameraError && !cameraSnapshot && (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              )}
              {!cameraError && cameraSnapshot && (
                <img src={cameraSnapshot} alt="Captura" className="w-full h-full object-contain" />
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
              <Button variant="outline" onClick={closeDialog} disabled={uploading} className="sm:mr-auto">
                Cancelar
              </Button>
              {!cameraSnapshot && (
                <Button onClick={handleCapture} disabled={!!cameraError || uploading}>
                  <Camera className="w-4 h-4 mr-2" />
                  Capturar
                </Button>
              )}
              {cameraSnapshot && (
                <>
                  <Button variant="secondary" onClick={handleRetake} disabled={uploading}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Repetir
                  </Button>
                  <Button onClick={handleAcceptCapture} disabled={uploading}>
                    Aceptar y acomodar
                  </Button>
                </>
              )}
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
