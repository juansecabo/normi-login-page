import { useState } from "react";
import { MoreVertical, MessageSquare, Trash2, Send } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ComentarioIndicador from "./ComentarioIndicador";

interface FinalPeriodoCeldaProps {
  notaFinal: number | null;
  comentario: string | null;
  tieneAlgunaNota: boolean; // Nueva prop: si el estudiante tiene al menos una nota en el período
  provisional?: boolean; // true → el periodo aún no está completo; la nota es provisional
  soloLectura?: boolean;
  onAbrirComentario: () => void;
  onEliminarComentario: () => void;
  onNotificarPadre?: () => void;
}

const FinalPeriodoCelda = ({
  notaFinal,
  comentario,
  tieneAlgunaNota,
  provisional = false,
  soloLectura = false,
  onAbrirComentario,
  onEliminarComentario,
  onNotificarPadre,
}: FinalPeriodoCeldaProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const esProvisional = provisional && notaFinal !== null;

  return (
    <td className="border-r border-b border-border p-1 text-center text-sm min-w-[100px] bg-primary/10 font-semibold relative group">
      <div className="relative flex flex-col items-center justify-center min-h-8">
        <span
          className={notaFinal === null ? "text-muted-foreground" : ""}
          title={esProvisional ? "Provisional — el periodo aún no está completo" : undefined}
        >
          {notaFinal !== null ? notaFinal.toFixed(1) : "—"}
        </span>
        {esProvisional && (
          <span className="text-[9px] font-normal leading-none text-muted-foreground">provisional</span>
        )}

        {/* Indicador de comentario */}
        {comentario && <ComentarioIndicador comentario={comentario} className="top-0 right-6" />}
        
        {/* Menú de opciones (visible on hover on desktop, always visible on mobile) */}
        {tieneAlgunaNota && !soloLectura && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
              <DropdownMenuTrigger asChild>
                <button className="p-1 hover:bg-muted rounded transition-colors">
                  <MoreVertical className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background z-50">
                <DropdownMenuItem onClick={onAbrirComentario}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  {comentario ? "Editar comentario" : "Agregar comentario"}
                </DropdownMenuItem>
                {comentario && (
                  <DropdownMenuItem 
                    onClick={onEliminarComentario}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Eliminar comentario
                  </DropdownMenuItem>
                )}
                {onNotificarPadre && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onNotificarPadre}>
                      <Send className="w-4 h-4 mr-2" />
                      Notificar a padre(s)
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </td>
  );
};

export default FinalPeriodoCelda;
