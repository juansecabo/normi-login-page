import { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, MessageSquare, Trash2, Send } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotaCeldaProps {
  nota: number | undefined;
  comentario: string | null;
  estaEditando: boolean;
  valorEditando: string;
  inputRef: (el: HTMLInputElement | null) => void;
  onCambioNota: (valor: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onClick: () => void;
  onAbrirComentario: () => void;
  onEliminarComentario: () => void;
  onNotificarPadre?: () => void;
  placeholder?: string;
  soloLectura?: boolean;
  nombreEstudiante?: string;
}

const NotaCelda = ({
  nota,
  comentario,
  estaEditando,
  valorEditando,
  inputRef,
  onCambioNota,
  onBlur,
  onKeyDown,
  onClick,
  onAbrirComentario,
  onEliminarComentario,
  onNotificarPadre,
  placeholder = "0-5",
  soloLectura = false,
  nombreEstudiante,
}: NotaCeldaProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const [tip, setTip] = useState<{ top: number; left: number; side: "left" | "right" } | null>(null);

  // En móvil la columna del estudiante no queda fija; al editar una nota mostramos
  // un bocadillo lateral con el nombre del estudiante de esa fila. Sale al lado de
  // la celda (hacia el borde con más espacio), centrado en su altura, para no tapar
  // ni la celda ni las filas de arriba/abajo. En desktop la columna es sticky y no hace falta.
  useLayoutEffect(() => {
    if (!estaEditando || !nombreEstudiante) { setTip(null); return; }
    const calc = () => {
      const el = localInputRef.current;
      const esMovil = window.matchMedia("(max-width: 767px)").matches;
      if (!el || !esMovil) { setTip(null); return; }
      const r = el.getBoundingClientRect();
      const side: "left" | "right" = r.left > window.innerWidth / 2 ? "left" : "right";
      setTip({ top: r.top + r.height / 2, left: side === "right" ? r.right + 8 : r.left - 8, side });
    };
    calc();
    window.addEventListener("scroll", calc, true);
    window.addEventListener("resize", calc);
    return () => {
      window.removeEventListener("scroll", calc, true);
      window.removeEventListener("resize", calc);
    };
  }, [estaEditando, nombreEstudiante]);

  if (soloLectura) {
    return (
      <td className="border-r border-b border-border p-1 text-center text-sm min-w-[120px] relative">
        <div className="relative flex items-center justify-center h-8">
          <span>{nota !== undefined ? nota.toFixed(2) : <span className="text-muted-foreground">—</span>}</span>
          {comentario && (
            <div className="absolute top-0 right-2 w-2 h-2 bg-amber-500 rounded-full" title={comentario} />
          )}
        </div>
      </td>
    );
  }

  return (
    <td className="border-r border-b border-border p-1 text-center text-sm min-w-[120px] relative group">
      {estaEditando ? (
        <>
          <div className="h-8" aria-hidden="true" />
          <div className="absolute inset-0 p-1 flex items-center justify-center">
            <input
              ref={(el) => { inputRef(el); localInputRef.current = el; }}
              type="text"
              className="w-full h-8 text-center border border-primary rounded px-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={valorEditando}
              onChange={(e) => onCambioNota(e.target.value)}
              onBlur={onBlur}
              onKeyDown={onKeyDown}
              autoFocus
              placeholder={placeholder}
            />
          </div>
          {tip && nombreEstudiante && createPortal(
            <div
              className="fixed z-[60] pointer-events-none"
              style={{ top: tip.top, left: tip.left, transform: `translateY(-50%)${tip.side === "left" ? " translateX(-100%)" : ""}` }}
            >
              <div className="relative max-w-[60vw] rounded-lg bg-primary px-3 py-1.5 text-xs font-medium leading-tight text-primary-foreground shadow-lg">
                {nombreEstudiante}
                <span
                  className={`absolute top-1/2 -translate-y-1/2 h-0 w-0 border-y-[5px] border-y-transparent ${
                    tip.side === "right"
                      ? "right-full border-r-[6px] border-r-primary"
                      : "left-full border-l-[6px] border-l-primary"
                  }`}
                />
              </div>
            </div>,
            document.body
          )}
        </>
      ) : (
        <div className="relative flex items-center justify-center h-8">
          <button
            className="flex-1 h-full hover:bg-muted/50 rounded cursor-pointer transition-colors flex items-center justify-center"
            onMouseDown={(e) => {
              e.preventDefault();
              if (e.button === 0) {
                const active = document.activeElement;
                if (active instanceof HTMLInputElement) active.blur();
                onClick();
              }
            }}
          >
            {nota !== undefined ? nota.toFixed(2) : <span className="text-muted-foreground">—</span>}
          </button>
          
          {/* Indicador de comentario */}
          {comentario && (
            <div className="absolute top-0 right-6 w-2 h-2 bg-amber-500 rounded-full" title={comentario} />
          )}
          
          {/* Menú de opciones (visible en hover on desktop, always visible on mobile) - Solo si hay nota */}
          {nota !== undefined && (
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
      )}
    </td>
  );
};

export default NotaCelda;
