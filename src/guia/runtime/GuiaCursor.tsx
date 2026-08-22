// "Normi te guía" — motor visual del cursor.
// Overlay que BLOQUEA los clicks fuera del paso (pop-up centrado), spotlight
// sobre el elemento del paso, cursor animado, y a Normi (imagen) hablando con
// globos de texto que entran animados. Solo botones Continúa y Detener.
import { MousePointer2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuia } from "./GuiaProvider";
import normiImg from "@/assets/normi-guia.png";

const INDIGO = "#4f46e5";

export function GuiaCursor() {
  const {
    ejecutando,
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
          0%,100% { box-shadow: 0 0 0 9999px rgba(15,23,42,0.55), 0 0 0 3px ${INDIGO}; }
          50%     { box-shadow: 0 0 0 9999px rgba(15,23,42,0.55), 0 0 0 7px ${INDIGO}88; }
        }
      `}</style>

      {/* Capa que captura y BLOQUEA todos los clicks. */}
      <div
        onClick={mostrarAviso}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          cursor: "not-allowed",
          background: rect ? "transparent" : "rgba(15,23,42,0.55)",
        }}
      />

      {/* Spotlight sobre el elemento del paso (pulsa para llamar la atención). */}
      {rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 12,
            pointerEvents: "none",
            zIndex: 9999,
            transition: "top 0.4s ease, left 0.4s ease, width 0.4s ease, height 0.4s ease",
            animation: "guiaPulso 1.6s ease-in-out infinite",
          }}
        />
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
            <Button onClick={continuar} className="flex-1">
              Continúa
            </Button>
            <Button variant="destructive" onClick={detener} className="gap-1">
              <X className="w-4 h-4" /> Detener
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
              Sigue el paso resaltado, o toca Detener para salir del modo guía.
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
