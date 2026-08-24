// "Normi te guía" — visual del modo guía.
// Normi (imagen) con su globo de texto (SOLO sus palabras) + un cuadro de
// escritura FLOTANTE separado (crece hasta 5 líneas y luego scroll). Único
// botón: Cancelar (X roja). El borde de luz señala dónde hacer click; la guía
// avanza sola cuando el usuario hace lo señalado.
import { useRef, useState } from "react";
import { X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuia } from "./GuiaProvider";
import normiImg from "@/assets/normi-guia.png";

const PAD = 6;

export function GuiaCursor() {
  const { rect, narracion, respuesta, pensando, enviar, cancelar, guiando } = useGuia();
  const [texto, setTexto] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ajustarAlto = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    // ~5 líneas de texto antes de mostrar barra de desplazamiento.
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const mandar = () => {
    if (!texto.trim() || pensando) return;
    enviar(texto);
    setTexto("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  return (
    <>
      <style>{`
        @keyframes guiaGloboIn {
          0%   { opacity: 0; transform: translateY(12px) scale(0.92); }
          60%  { opacity: 1; transform: translateY(-2px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes guiaNormiIn {
          0%   { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes guiaLuz {
          0%,100% { box-shadow: 0 0 0 4px rgba(79,70,229,0.85), 0 0 18px 6px rgba(79,70,229,0.45); }
          50%     { box-shadow: 0 0 0 8px rgba(79,70,229,0.45), 0 0 28px 12px rgba(79,70,229,0.28); }
        }
        @keyframes guiaPunto {
          0%, 100% { opacity: 0.15; transform: translateY(0); }
          40%      { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>

      {/* Borde de luz sobre el elemento que el usuario debe tocar. */}
      {rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 12,
            pointerEvents: "none",
            zIndex: 9999,
            transition: "top 0.35s ease, left 0.35s ease, width 0.35s ease, height 0.35s ease",
            animation: "guiaLuz 1.5s ease-in-out infinite",
          }}
        />
      )}

      {/* Columna flotante: cuadro de escritura (aparte) + globo de Normi + Normi. */}
      <div
        style={{ zIndex: 10001 }}
        data-guia-ui
        className="fixed bottom-3 right-3 flex flex-col items-end gap-2 w-[min(92vw,22rem)]"
      >
        {/* Cuadro de escritura FLOTANTE, separado del globo. */}
        <div
          style={{ animation: "guiaGloboIn 0.4s ease-out both" }}
          className="w-full bg-card border border-border rounded-2xl shadow-2xl p-2 flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={texto}
            rows={1}
            onChange={(e) => {
              setTexto(e.target.value);
              ajustarAlto(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                mandar();
              }
            }}
            placeholder="Escríbele a Normi..."
            className="flex-1 min-w-0 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm leading-snug outline-none focus:ring-2 focus:ring-primary/40 max-h-[120px] overflow-y-auto"
          />
          <Button
            size="icon"
            variant="outline"
            className="shrink-0"
            onClick={mandar}
            disabled={pensando || !texto.trim()}
            title="Enviar"
          >
            <Send className="w-4 h-4" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="shrink-0"
            onClick={cancelar}
            title="Cancelar el modo guía"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Globo de Normi: SOLO sus palabras. */}
        {(narracion || respuesta || pensando) && (
          <div
            key={(guiando ? narracion : "") + "|" + (respuesta || "")}
            style={{ animation: "guiaGloboIn 0.4s ease-out both" }}
            className="relative bg-card border border-border rounded-2xl shadow-2xl p-4 w-fit max-w-full"
          >
            {guiando && narracion && (
              <p className="text-sm text-foreground leading-snug">{narracion}</p>
            )}
            {(respuesta || pensando) && (
              <div
                className={
                  "text-sm text-foreground leading-snug " +
                  (guiando && narracion ? "mt-2 bg-muted rounded-xl px-3 py-2" : "")
                }
              >
                {pensando ? (
                  // Puntos suspensivos animados (aparecen y desaparecen en ola).
                  <span className="inline-flex items-center gap-1.5 py-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full bg-muted-foreground/80"
                        style={{
                          animation: "guiaPunto 1.2s ease-in-out infinite",
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </span>
                ) : (
                  respuesta
                )}
              </div>
            )}
            {/* Colita del globo apuntando a Normi */}
            <span className="absolute -bottom-1.5 right-10 w-3 h-3 bg-card border-b border-r border-border rotate-45" />
          </div>
        )}

        <img
          src={normiImg}
          alt="Normi"
          style={{ animation: "guiaNormiIn 0.5s ease-out both" }}
          className="h-28 md:h-32 object-contain drop-shadow-xl select-none pointer-events-none"
        />
      </div>
    </>
  );
}
