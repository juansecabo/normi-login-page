import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";

interface ComunicadoEnviadoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Si se pasa job_id, el dialog hace polling al server cada 2.5s para
   *  mostrar progreso en vivo. Si no, muestra el mensaje fijo (caso Pati). */
  jobId?: string | null;
  /** Total inicial de destinatarios (solo cuando hay jobId). */
  total?: number;
  /** Se llama UNA sola vez cuando el envío se completa CON ÉXITO (no cuando se cancela).
   *  El formulario (mensaje/archivos) solo se limpia aquí; si se cancela, se conserva. */
  onCompleted?: () => void;
}

interface Progress {
  total: number;
  enviados: number;
  fallos: number;
  completado: boolean;
  cancelado?: boolean;
  fallos_detalle?: Array<{ nombre: string; telefono: string }>;
}

const ComunicadoEnviadoDialog = ({ open, onOpenChange, jobId, total, onCompleted }: ComunicadoEnviadoDialogProps) => {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [verFallos, setVerFallos] = useState(false);
  const completedFiredRef = useRef(false);

  // Reset state cuando se abre con un job nuevo o el modal se cierra,
  // para que el "Cancelando..." de un envio anterior no quede pegado.
  useEffect(() => {
    setCancelando(false);
    setVerFallos(false);
    completedFiredRef.current = false;
  }, [jobId, open]);

  // Limpiar el formulario SOLO cuando el envío se completa con éxito (una vez).
  // Si se cancela, no se dispara → el mensaje y destinatarios se conservan.
  useEffect(() => {
    if (progress?.completado && !progress?.cancelado && !completedFiredRef.current) {
      completedFiredRef.current = true;
      onCompleted?.();
    }
  }, [progress, onCompleted]);

  const handleCancelar = async () => {
    if (!jobId) return;
    setCancelando(true);
    try {
      await apiRequest(`/api/comunicados/cancelar/${jobId}`, { method: "POST" });
    } catch {
      // El polling igual va a mostrar el estado real cuando el server actualice cancelado.
    }
  };

  useEffect(() => {
    if (!open || !jobId) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const p = await apiRequest<Progress>(`/api/comunicados/progreso/${jobId}`);
        if (cancelled) return;
        setProgress(p);
        if (!p.completado) {
          timer = setTimeout(tick, 600);
        }
      } catch {
        // Si falla (job no existe aun, red, etc.) reintentamos en 3s.
        if (cancelled) return;
        timer = setTimeout(tick, 3000);
      }
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, jobId]);

  // Vista cuando hay job_id (Normi): el mensaje principal es siempre el
  // mismo; el progreso aparece debajo como info adicional en vivo.
  if (jobId) {
    const enviados = progress?.enviados ?? 0;
    const fallos = progress?.fallos ?? 0;
    const totalShow = progress?.total ?? total ?? 0;
    const completado = progress?.completado ?? false;
    const cancelado = progress?.cancelado ?? false;
    const procesados = enviados + fallos;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${cancelado ? "text-orange-600" : "text-green-700"}`}>
              {cancelado ? <XCircle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
              {cancelado ? "Envío cancelado" : "¡Comunicado enviado!"}
            </DialogTitle>
            <DialogDescription>
              {cancelado
                ? `Se detuvo el envío. Los ${enviados} mensajes que ya habían salido llegaron y no se pueden revertir; los pendientes no se enviaron.`
                : "El mensaje ha sido correctamente enviado y está llegando a sus destinatarios."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
              {!completado && !cancelado && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                <strong className="text-foreground">{procesados}</strong> de <strong className="text-foreground">{totalShow}</strong> {totalShow === 1 ? "destinatario" : "destinatarios"}
                {fallos > 0 ? (
                  <button
                    type="button"
                    onClick={() => setVerFallos((v) => !v)}
                    className="text-red-600 underline hover:text-red-700"
                  >
                    {" "}({fallos} {fallos === 1 ? "falló" : "fallaron"} — ver quién)
                  </button>
                ) : null}
              </span>
            </p>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${cancelado ? "bg-orange-500" : "bg-primary"}`}
                style={{ width: totalShow > 0 ? `${(procesados / totalShow) * 100}%` : "0%" }}
              />
            </div>
            {verFallos && fallos > 0 && (
              <div className="mt-1 max-h-44 overflow-auto rounded-md border border-red-200 bg-red-50 p-2 text-left">
                <p className="text-xs font-semibold text-red-700 mb-1">No se pudo enviar a:</p>
                {progress?.fallos_detalle && progress.fallos_detalle.length > 0 ? (
                  <ul className="space-y-0.5">
                    {progress.fallos_detalle.map((f, i) => (
                      <li key={i} className="text-xs text-red-800">
                        {f.nombre} — <span className="font-mono">{f.telefono}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-red-700 italic">El detalle aparece cuando el envío termina.</p>
                )}
                <p className="text-[11px] text-red-600 mt-1">
                  Suele ser un número de teléfono mal registrado. Corrígelo en Panel de Control.
                </p>
              </div>
            )}
            {!completado && !cancelado && (
              <p className="text-xs text-muted-foreground text-center italic">
                Puedes cerrar esta ventana — el envío sigue en segundo plano.
              </p>
            )}
            {!completado && !cancelado && (
              <p className="text-[11px] text-muted-foreground text-center">
                Al cancelar solo se detienen los mensajes pendientes; los ya enviados no se pueden revertir.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {!completado && !cancelado && (
              <Button variant="outline" onClick={handleCancelar} disabled={cancelando} className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800">
                {cancelando ? "Cancelando..." : "Cancelar envío"}
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)}>{completado || cancelado ? "Cerrar" : "Entendido"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Vista sin job_id (Pati): mensaje fijo, sin progreso.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="w-6 h-6" />
            ¡Comunicado enviado!
          </DialogTitle>
          <DialogDescription>
            El mensaje ha sido correctamente enviado y está llegando a sus destinatarios.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ComunicadoEnviadoDialog;
