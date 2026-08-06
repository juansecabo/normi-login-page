import { useEffect, type RefObject } from "react";
import type SignatureCanvas from "react-signature-canvas";

/**
 * react-signature-canvas BORRA el trazo cuando la ventana cambia de tamaño
 * (p. ej. al cerrarse el teclado del móvil al tocar fuera del campo). Este hook
 * vuelve a pintar la firma desde el último dataURL guardado, para que NO se pierda.
 * No cambia nada más del comportamiento: solo restaura si el canvas quedó vacío.
 */
export function usePreservarFirma(ref: RefObject<SignatureCanvas>, firma: string | null) {
  useEffect(() => {
    if (!firma) return;
    const restaurar = () => {
      // Tras el resize, la librería limpia el canvas; restauramos en el siguiente frame.
      requestAnimationFrame(() => {
        const c = ref.current;
        if (c && firma && c.isEmpty()) {
          try { c.fromDataURL(firma); } catch { /* ignore */ }
        }
      });
    };
    window.addEventListener("resize", restaurar);
    window.visualViewport?.addEventListener("resize", restaurar);
    return () => {
      window.removeEventListener("resize", restaurar);
      window.visualViewport?.removeEventListener("resize", restaurar);
    };
  }, [ref, firma]);
}
