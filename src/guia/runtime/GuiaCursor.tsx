// "Normi te guía" — motor visual del cursor.
// Spotlight INTERACTIVO: se oscurece todo MENOS el elemento del paso (que queda
// tocable y aclarado). Los clicks fuera del hueco se bloquean con un pop-up.
// Normi (imagen) habla con globos animados; solo botones Continúa y Detener.
import type { CSSProperties } from "react";
import { MousePointer2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuia } from "./GuiaProvider";
import normiImg from "@/assets/normi-guia.png";

const INDIGO = "#4f46e5";
const PAD = 6;
const OSCURO = "rgba(15,23,42,0.55)";

export function GuiaCursor() {
  const {
    ejecutando,
    actuando,
    rect,
    narracion,
    pasoIdx,
    totalPasos,
    continuar,
    detener,
    aviso,
    mostrarAviso,
    ocultarAviso,
  } = useGuia();

  if (!ejecutando) return null;

  const cursorX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const cursorY = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.45;

  // Paneles oscuros alrededor del elemento (dejan el hueco tocable).
  const panel = (style: CSSProperties, k: string) => (
    <div
      key={k}
      onClick={mostrarAviso}
      style={{ position: "fixed", background: OSCURO, zIndex: 9998, cursor: "not-allowed", ...style }}
    />
  );

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
        @keyframes guiaPulso {
          0%,100% { box-shadow: 0 0 0 3px ${INDIGO}; }
          50%     { box-shadow: 0 0 0 7px ${INDIGO}55; }
        }
      `}</style>

      {rect ? (
        <>
          {panel({ top: 0, left: 0, width: "100vw", height: Math.max(0, rect.top - PAD) }, "t")}
          {panel({ top: rect.bottom + PAD, left: 0, width: "100vw", bottom: 0 }, "b")}
          {panel({ top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }, "l")}
          {panel({ top: rect.top - PAD, left: rect.right + PAD, right: 0, height: rect.height + PAD * 2 }, "r")}
          {/* Aro que resalta el elemento (no captura clicks; el hueco sí es tocable). */}
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
              transition: "all 0.35s ease",
              animation: "guiaPulso 1.6s ease-in-out infinite",
            }}
          />
        </>
      ) : (
        // Sin objetivo: se oscurece todo (navegando o explicando).
        panel({ inset: 0 }, "full")
      )}

      {/* Cursor simulado. */}
      <div
        style={{
          position: "fixed",
          top: cursorY,
          left: cursorX,
          zIndex: 10000,
          pointerEvents: "none",
          transition: "top 0.5s ease, left 0.5s ease",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.4))",
        }}
      >
        <MousePointer2 fill={INDIGO} color="white" size={30} />
      </div>

      {/* Normi + globo de texto animado (abajo a la derecha). */}
      <div
        style={{ zIndex: 10001 }}
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
          <p className="text-sm text-foreground leading-snug mb-3">{narracion}</p>
          <div className="flex items-center gap-2">
            <Button onClick={continuar} disabled={actuando} className="flex-1">
              {actuando ? "Un momento..." : "Continúa"}
            </Button>
            <Button variant="destructive" onClick={detener} className="gap-1">
              <X className="w-4 h-4" /> Detener
            </Button>
          </div>
          <span className="absolute -bottom-1.5 right-10 w-3 h-3 bg-card border-b border-r border-border rotate-45" />
        </div>
        <img
          src={normiImg}
          alt="Normi"
          style={{ animation: "guiaNormiIn 0.5s ease-out both" }}
          className="h-28 md:h-32 object-contain drop-shadow-xl select-none pointer-events-none"
        />
      </div>

      {/* Pop-up centrado al tocar fuera del paso. */}
      {aviso && (
        <div
          style={{ zIndex: 10002 }}
          className="fixed inset-0 flex items-center justify-center bg-black/30"
          onClick={ocultarAviso}
        >
          <div
            className="bg-card rounded-2xl shadow-2xl border max-w-sm mx-4 p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-foreground mb-1">Estás en el modo guía</p>
            <p className="text-sm text-muted-foreground mb-4">
              Normi va haciendo cada paso. Toca Continúa para el siguiente, o Detener para salir.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={ocultarAviso}>Entendido</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  ocultarAviso();
                  detener();
                }}
              >
                Detener
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
