// "Normi te guía" — chat acoplado abajo a la derecha (estilo Messenger):
// se abre desde el menú, se puede minimizar a una barra y cerrar. En celular
// ocupa solo una porción de la pantalla, no todo.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, Play, ChevronDown, X } from "lucide-react";
import { useGuia } from "./GuiaProvider";

export function GuiaPanel() {
  const { abierto, cerrar, mensajes, enviando, enviar, guiaPropuesta, iniciarGuia, ejecutando } =
    useGuia();
  const [texto, setTexto] = useState("");
  const [minimizado, setMinimizado] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  // Al abrir desde el menú, siempre expandido.
  useEffect(() => {
    if (abierto) setMinimizado(false);
  }, [abierto]);

  useEffect(() => {
    if (!minimizado) finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, enviando, minimizado]);

  // Mientras corre la guía, el chat se oculta (manda la burbuja de Normi del cursor).
  if (!abierto || ejecutando) return null;

  const mandar = () => {
    if (!texto.trim()) return;
    enviar(texto);
    setTexto("");
  };

  const Header = ({ onToggle }: { onToggle: () => void }) => (
    <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
      <button onClick={onToggle} className="flex items-center gap-2 font-semibold min-w-0">
        <Sparkles className="w-5 h-5 shrink-0" />
        <span className="truncate">Normi te guía</span>
      </button>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setMinimizado((m) => !m)}
          title={minimizado ? "Abrir" : "Minimizar"}
          className="p-1 rounded hover:bg-primary-foreground/20"
        >
          <ChevronDown className={"w-5 h-5 transition-transform " + (minimizado ? "rotate-180" : "")} />
        </button>
        <button onClick={cerrar} title="Cerrar" className="p-1 rounded hover:bg-primary-foreground/20">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="fixed z-[60] right-0 bottom-0 sm:right-4 sm:bottom-4 w-full sm:w-[24rem] max-w-[100vw]"
      style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.18))" }}
    >
      <div className="mx-2 sm:mx-0 rounded-t-2xl sm:rounded-2xl overflow-hidden border border-border bg-card">
        <Header onToggle={() => setMinimizado((m) => !m)} />

        {!minimizado && (
          <>
            <div className="h-[60vh] sm:h-[26rem] overflow-y-auto px-4 py-4 space-y-3 bg-background">
              {mensajes.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed " +
                      (m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm")
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {enviando && (
                <div className="flex justify-start">
                  <div className="bg-muted text-muted-foreground rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm">
                    Normi está pensando...
                  </div>
                </div>
              )}
              {guiaPropuesta && (
                <div className="flex justify-start">
                  <Button onClick={iniciarGuia} className="gap-2 shadow-sm h-auto py-2 text-left whitespace-normal">
                    <Play className="w-4 h-4 shrink-0" /> Guíame: {guiaPropuesta.capacidad.titulo}
                  </Button>
                </div>
              )}
              <div ref={finRef} />
            </div>

            <div className="border-t p-3 flex items-center gap-2 bg-card">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    mandar();
                  }
                }}
                placeholder="Escríbele a Normi..."
                className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button size="icon" className="rounded-full shrink-0" onClick={mandar} disabled={enviando || !texto.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
