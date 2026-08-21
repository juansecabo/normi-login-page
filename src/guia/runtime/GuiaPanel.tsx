// "Normi te guía" — panel lateral de chat.
import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, Play } from "lucide-react";
import { useGuia } from "./GuiaProvider";

export function GuiaPanel() {
  const {
    abierto,
    cerrar,
    mensajes,
    enviando,
    enviar,
    guiaPropuesta,
    iniciarGuia,
    ejecutando,
  } = useGuia();
  const [texto, setTexto] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, enviando]);

  const mandar = () => {
    if (!texto.trim()) return;
    enviar(texto);
    setTexto("");
  };

  return (
    <Sheet open={abierto} onOpenChange={(o) => (o ? null : cerrar())}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="px-4 py-3 border-b bg-primary/5">
          <SheetTitle className="flex items-center gap-2 text-primary">
            <Sparkles className="w-5 h-5" /> Normi te guía
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
          {guiaPropuesta && !ejecutando && (
            <div className="flex justify-start">
              <Button onClick={iniciarGuia} className="gap-2 shadow-sm">
                <Play className="w-4 h-4" /> Guíame: {guiaPropuesta.capacidad.titulo}
              </Button>
            </div>
          )}
          {ejecutando && (
            <div className="text-center text-xs text-muted-foreground py-2">
              Guía en curso. Usa el panel de abajo para avanzar o detener.
            </div>
          )}
          <div ref={finRef} />
        </div>

        <div className="border-t p-3 flex items-center gap-2">
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
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Button size="icon" onClick={mandar} disabled={enviando || !texto.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
