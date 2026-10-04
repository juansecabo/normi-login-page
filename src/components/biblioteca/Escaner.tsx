import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

/**
 * Lector de códigos con la cámara (celular o computador). Lee códigos de barras (Code 128 de
 * las etiquetas, EAN-13 del ISBN) y QR. Devuelve el primer código leído y se cierra.
 * El lector USB/Bluetooth no necesita esto: escribe en el campo como un teclado.
 */
const Escaner = ({ abierto, onCerrar, onCodigo, titulo = "Escanear código" }: {
  abierto: boolean; onCerrar: () => void; onCodigo: (codigo: string) => void; titulo?: string;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!abierto) return;
    let controles: { stop: () => void } | null = null;
    let cancelado = false;
    setError(""); setCargando(true);
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const lector = new BrowserMultiFormatReader();
        if (cancelado || !videoRef.current) return;
        controles = await lector.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          (res) => {
            if (res && !cancelado) {
              cancelado = true;
              controles?.stop();
              onCodigo(res.getText());
              onCerrar();
            }
          },
        );
        setCargando(false);
      } catch (e: any) {
        setCargando(false);
        setError(e?.name === "NotAllowedError" ? "No hay permiso para usar la cámara. Actívalo en el navegador." : "No se pudo abrir la cámara.");
      }
    })();
    return () => { cancelado = true; controles?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {!error && <div className="absolute inset-x-8 top-1/2 h-0.5 bg-red-500/80" />}
          {cargando && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 text-white animate-spin" /></div>}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground text-center">Apunta al código de barras del libro.</p>}
      </DialogContent>
    </Dialog>
  );
};

export default Escaner;
