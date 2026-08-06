import { useEffect, type RefObject } from "react";

/**
 * Cuando el elemento entra en pantalla (el usuario baja al cuadro de firma),
 * cierra el teclado quitando el foco del campo de texto activo.
 *
 * Por qué así: si se cierra el teclado DESPUÉS de firmar, el canvas se
 * redimensiona y react-signature-canvas BORRA el trazo. Y cerrarlo al TOCAR la
 * firma se siente brusco. Cerrarlo mientras se hace scroll hacia la firma (antes
 * de dibujar, con el canvas vacío) evita ambos problemas y también el "salto"
 * de vuelta a la descripción al terminar (ya no hay campo enfocado).
 */
export function useBlurCuandoVisible(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            const a = document.activeElement as HTMLElement | null;
            if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT")) a.blur();
          }
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
}
