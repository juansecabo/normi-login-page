// "Normi te guía" — señalización visual de la guía.
// El USUARIO hace los clicks: Normi solo marca con un borde de luz dónde tocar
// (SIN sombrear el resto de la pantalla) y narra en globos animados. Solo hay
// botón Detener; la guía avanza sola cuando el usuario hace lo señalado. El
// usuario puede escribirle a Normi en cualquier momento desde el globo.
import { useState } from "react";
import { X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuia } from "./GuiaProvider";
import normiImg from "@/assets/normi-guia.png";

const PAD = 6;

export function GuiaCursor() {
  const {
    ejecutando,
    rect,
    narracion,
    pasoIdx,
    totalPasos,
    detener,
    preguntar,
    respuesta,
    preguntando,
  } = useGuia();
  const [texto, setTexto] = useState("");

  if (!ejecutando) return null;

  const mandar = () => {
    if (!texto.trim() || preguntando) return;
    preguntar(texto);
    setTexto("");
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
      `}</style>

      {/* Borde de luz sobre el elemento que el usuario debe tocar. Nada más se
          sombrea ni se bloquea: la pantalla queda libre. */}
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

      {/* Normi + globo (abajo a la derecha). */}
      <div
        style={{ zIndex: 10001 }}
        data-guia-ui
        className="fixed bottom-3 right-3 flex flex-col items-end gap-1 w-[min(92vw,22rem)]"
      >
        <div
          key={pasoIdx}
          style={{ animation: "guiaGloboIn 0.4s ease-out both" }}
          className="relative bg-card border border-border rounded-2xl shadow-2xl p-4 w-full"
        >
          <p className="text-[11px] font-medium text-muted-foreground mb-1">
            Paso {pasoIdx + 1} de {totalPasos}
          </p>
          <p className="text-sm text-foreground leading-snug">{narracion}</p>

          {(respuesta || preguntando) && (
            <div
              style={{ animation: "guiaGloboIn 0.35s ease-out both" }}
              className="mt-2 bg-muted rounded-xl px-3 py-2 text-sm text-foreground leading-snug"
            >
              {preguntando ? "Normi está pensando..." : respuesta}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  mandar();
                }
              }}
              placeholder="Escríbele a Normi..."
              className="flex-1 min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <Button size="icon" variant="outline" onClick={mandar} disabled={preguntando || !texto.trim()}>
              <Send className="w-4 h-4" />
            </Button>
            <Button variant="destructive" size="icon" onClick={detener} title="Detener la guía">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Colita del globo apuntando a Normi */}
          <span className="absolute -bottom-1.5 right-10 w-3 h-3 bg-card border-b border-r border-border rotate-45" />
        </div>
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
