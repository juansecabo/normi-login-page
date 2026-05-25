import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
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
}

interface Progress {
  total: number;
  enviados: number;
  fallos: number;
  completado: boolean;
}

const ComunicadoEnviadoDialog = ({ open, onOpenChange, jobId, total }: ComunicadoEnviadoDialogProps) => {
  const [progress, setProgress] = useState<Progress | null>(null);

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
          timer = setTimeout(tick, 2500);
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
    const procesados = enviados + fallos;

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
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
              {!completado && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                <strong className="text-foreground">{procesados}</strong> de <strong className="text-foreground">{totalShow}</strong> {totalShow === 1 ? "destinatario" : "destinatarios"}
                {fallos > 0 ? <span className="text-red-600"> ({fallos} fallaron)</span> : null}
              </span>
            </p>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: totalShow > 0 ? `${(procesados / totalShow) * 100}%` : "0%" }}
              />
            </div>
            {!completado && (
              <p className="text-xs text-muted-foreground text-center italic">
                Puedes cerrar esta ventana — el envío sigue en segundo plano.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Entendido</Button>
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
