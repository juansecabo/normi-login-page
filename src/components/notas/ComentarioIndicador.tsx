import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ComentarioIndicadorProps {
  comentario: string;
  /** Posición del punto dentro de la celda (ej. "top-0 right-6"). */
  className?: string;
}

/** Punto ámbar que indica que la nota tiene comentario; al tocarlo abre un
 *  pop-up con el texto. Funciona igual en modo edición y en modo lectura. */
const ComentarioIndicador = ({ comentario, className = "" }: ComentarioIndicadorProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`absolute p-1.5 -m-1.5 ${className}`}
        title="Ver comentario"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="block w-2 h-2 bg-amber-500 rounded-full" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-500" />
              Comentario
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">{comentario}</p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ComentarioIndicador;
