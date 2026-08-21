// "Normi te guía" — motor visual del cursor.
// Overlay que BLOQUEA los clicks fuera del paso (mostrando un pop-up centrado),
// spotlight sobre el elemento del paso, cursor animado, y barra Continúa/Detener.
import { MousePointer2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuia } from "./GuiaProvider";

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
    abrir,
  } = useGuia();

  if (!ejecutando) return null;

  // Centro del elemento resaltado (o centro-inferior de la pantalla si no hay).
  const cursorX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const cursorY = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.5;

  return (
    <>
      {/* Capa que captura y BLOQUEA todos los clicks. Transparente cuando hay
          spotlight (el hueco ya oscurece); oscurecida cuando no hay ancla. */}
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

      {/* Spotlight: hueco iluminado sobre el elemento del paso (oscurece el resto
          con un box-shadow gigante). Solo visual: no captura clicks. */}
      {rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 12,
            border: `3px solid ${INDIGO}`,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.55)",
            pointerEvents: "none",
            zIndex: 9999,
            transition: "all 0.35s ease",
          }}
        />
      )}

      {/* Cursor simulado de Normi. */}
      <div
        style={{
          position: "fixed",
          top: cursorY,
          left: cursorX,
          zIndex: 10000,
          pointerEvents: "none",
          transform: "translate(-2px, -2px)",
          transition: "top 0.5s ease, left 0.5s ease",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.4))",
        }}
      >
        <MousePointer2 fill={INDIGO} color="white" size={30} />
      </div>

      {/* Barra de control (por encima del overlay). */}
      <div
        style={{ zIndex: 10001 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-xl rounded-2xl bg-card border shadow-2xl p-4"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <MousePointer2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-0.5">
              Paso {pasoIdx + 1} de {totalPasos}
            </p>
            <p className="text-sm text-foreground leading-snug">{narracion}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button onClick={continuar} className="flex-1">
            Continúa
          </Button>
          <Button variant="outline" onClick={abrir}>
            Escribir a Normi
          </Button>
          <Button variant="destructive" onClick={detener} className="gap-1">
            <X className="w-4 h-4" /> Detener
          </Button>
        </div>
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
