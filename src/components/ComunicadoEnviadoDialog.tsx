import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ComunicadoEnviadoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  enviados?: number;
  fallos?: number;
}

/**
 * Pop-up de confirmacion que reemplaza al toast inferior cuando se envia
 * un comunicado. Se usa desde EnviarComunicado y EnviarComunicadoAdmin.
 */
const ComunicadoEnviadoDialog = ({ open, onOpenChange, enviados, fallos }: ComunicadoEnviadoDialogProps) => (
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
      {enviados !== undefined && (
        <p className="text-sm text-muted-foreground">
          Se enviaron <strong>{enviados}</strong> {enviados === 1 ? "mensaje" : "mensajes"}
          {fallos !== undefined && fallos > 0 ? ` (${fallos} fallaron)` : ""}.
        </p>
      )}
      <DialogFooter>
        <Button onClick={() => onOpenChange(false)}>Entendido</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default ComunicadoEnviadoDialog;
