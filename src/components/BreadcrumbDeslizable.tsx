import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Contenido de breadcrumb que se desliza horizontal cuando no cabe (móvil).
 * - Al entrar (cambia `clave`) muestra el FINAL del camino: la página actual.
 * - Si hay niveles ocultos a la izquierda o derecha, aparece una flecha
 *   clicable sobre un degradado que difumina lo de abajo para que se lea bien.
 */
const BreadcrumbDeslizable = ({ clave, children }: { clave?: string; children: ReactNode }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [flechas, setFlechas] = useState({ izq: false, der: false });

  const recalcular = () => {
    const el = ref.current;
    if (!el) return;
    setFlechas({
      izq: el.scrollLeft > 2,
      der: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Mostrar el final del camino al entrar a la página.
    const alFinal = () => { el.scrollLeft = el.scrollWidth; recalcular(); };
    alFinal();
    const ro = new ResizeObserver(recalcular);
    ro.observe(el);
    // Si cambia el camino (otro nivel dentro de la misma página), volver a
    // mostrar el final aunque no se pase `clave`.
    const mo = new MutationObserver(alFinal);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { ro.disconnect(); mo.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const mover = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 140, behavior: "smooth" });

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={recalcular}
        className="flex items-center gap-2 text-sm whitespace-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden text-center"
      >
        {children}
      </div>
      {flechas.izq && (
        <button
          type="button"
          onClick={() => mover(-1)}
          aria-label="Ver niveles anteriores"
          className="absolute inset-y-0 left-0 w-12 flex items-center justify-start bg-gradient-to-r from-card via-card/80 to-transparent"
        >
          <ChevronLeft className="w-5 h-5 text-primary" />
        </button>
      )}
      {flechas.der && (
        <button
          type="button"
          onClick={() => mover(1)}
          aria-label="Ver niveles siguientes"
          className="absolute inset-y-0 right-0 w-12 flex items-center justify-end bg-gradient-to-l from-card via-card/80 to-transparent"
        >
          <ChevronRight className="w-5 h-5 text-primary" />
        </button>
      )}
    </div>
  );
};

export default BreadcrumbDeslizable;
