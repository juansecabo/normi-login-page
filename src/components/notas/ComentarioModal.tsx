import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";

interface ComentarioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nombreEstudiante: string;
  nombreActividad: string;
  comentarioActual: string | null;
  onGuardar: (comentario: string | null) => void;
}

const ComentarioModal = ({
  open,
  onOpenChange,
  nombreEstudiante,
  nombreActividad,
  comentarioActual,
  onGuardar,
}: ComentarioModalProps) => {
  const [comentario, setComentario] = useState(comentarioActual || "");

  useEffect(() => {
    if (open) {
      setComentario(comentarioActual || "");
    }
  }, [open, comentarioActual]);

  const handleGuardar = () => {
    const comentarioTrimmed = comentario.trim();
    onGuardar(comentarioTrimmed || null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            Comentario para {nombreEstudiante} - {nombreActividad}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Textarea
            data-guia="notas.modal_comentario_texto"
            placeholder="Escribe un comentario..."
            value={comentario}
            onChange={(e) => setComentario(e.target.value.slice(0, 500))}
            className="min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground text-right">
            {comentario.length} / 500 caracteres
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button data-guia="notas.modal_comentario_guardar" onClick={handleGuardar} className="bg-primary hover:bg-primary/90">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ComentarioModal;
