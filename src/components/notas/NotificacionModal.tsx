import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export type TipoNotificacion =
  | "actividad_individual"
  | "periodo_completo_definitivo"
  | "periodo_parcial"
  | "definitiva_completa"
  | "definitiva_parcial"
  | "nota_individual"
  | "pendientes";

interface NotificacionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipoNotificacion: TipoNotificacion;
  descripcion: string;
  nombreEstudiante?: string; // Solo para notificación individual
  onConfirmar: () => Promise<void>;
}

const NotificacionModal = ({
  open,
  onOpenChange,
  tipoNotificacion,
  descripcion,
  nombreEstudiante,
  onConfirmar,
}: NotificacionModalProps) => {
  const [enviando, setEnviando] = useState(false);

  const handleConfirmar = async () => {
    setEnviando(true);
    try {
      await onConfirmar();
    } finally {
      setEnviando(false);
      onOpenChange(false);
    }
  };

  const getTituloTipo = () => {
    switch (tipoNotificacion) {
      case "actividad_individual":
        return "Notificar actividad";
      case "periodo_completo_definitivo":
        return "Notificar REPORTE FINAL del período";
      case "periodo_parcial":
        return "Notificar REPORTE PARCIAL del período";
      case "definitiva_completa":
        return "Notificar REPORTE FINAL ANUAL";
      case "definitiva_parcial":
        return "Notificar REPORTE PARCIAL ANUAL";
      case "nota_individual":
        return "Notificar a padre(s)";
      case "pendientes":
        return "Notificar actividades pendientes";
      default:
        return "Confirmar notificación";
    }
  };

  const getMensaje = () => {
    // Solo para nota_individual simple (actividad específica a un padre)
    if (tipoNotificacion === "nota_individual" && nombreEstudiante && !descripcion.includes("\n")) {
      return (
        <>
          Se enviará notificación al/los padre(s) de <span className="font-medium text-foreground">{nombreEstudiante}</span> sobre:
        </>
      );
    }
    // Para otros tipos, el mensaje detallado ya viene completo en descripcion
    return null;
  };

  // Separar descripción en líneas si contiene saltos
  const renderDescripcion = () => {
    const lineas = descripcion.split('\n');
    if (lineas.length === 1) {
      return <span className="font-medium text-foreground">{descripcion}</span>;
    }
    return (
      <div className="mt-2">
        {lineas.map((linea, idx) => (
          <div key={idx} className={idx === lineas.length - 1 ? "font-medium text-foreground mt-1" : ""}>
            {linea}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿{getTituloTipo()}?</DialogTitle>
          <DialogDescription asChild>
            <div>
              {getMensaje()}
              {getMensaje() && <br />}
              {renderDescripcion()}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            data-guia={nombreEstudiante ? "notas.confirmar_notificar_padres" : "notas.confirmar_notificar_masivo"}
            onClick={handleConfirmar}
            disabled={enviando}
            className="bg-primary hover:bg-primary/90"
          >
            {enviando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar notificación"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NotificacionModal;
