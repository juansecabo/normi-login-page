import { useEffect, useRef } from "react";

/**
 * Enlaces directos de los avisos de WhatsApp (mundonormi.com/e/274 → …?abrir=274).
 * Cuando la lista ya está cargada y contiene el elemento del enlace, lo abre una
 * sola vez (`abrir`) y lleva la pantalla hasta él (elemento con data-abrir-id).
 */
export function useAbrirDesdeEnlace<T extends { id: string | number }>(
  items: T[] | null | undefined,
  abrir: (item: T) => void,
) {
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current || !items || items.length === 0) return;
    const v = new URLSearchParams(window.location.search).get("abrir");
    if (!v) { hecho.current = true; return; }
    const item = items.find((x) => String(x.id) === v);
    if (!item) return;
    hecho.current = true;
    abrir(item);
    setTimeout(() => {
      document.querySelector(`[data-abrir-id="${CSS.escape(v)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
}

/** Fecha "YYYY-MM-DD" → Date local a mediodía (sin corrimiento de zona). */
export const fechaLocal = (s: string) => new Date(`${String(s).slice(0, 10)}T12:00:00`);
