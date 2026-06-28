// Banner "Nueva actualización disponible". Se monta DENTRO de HeaderNormi para
// aparecer como una barra fija justo debajo del header verde.
//
// SIN service worker (el SW causaba bucles de recarga; está apagado vía
// selfDestroying en vite.config). En su lugar, polling simple: cada build
// genera /version.json con un buildId único, y el bundle lleva ese id en
// __BUILD_ID__. Cada 60s comparamos: si el server tiene un build más nuevo,
// mostramos el banner. El click recarga la página (F5), sin loops.

import { useEffect, useState } from "react";

// DESACTIVADA temporalmente (a pedido de Juan, 2026-06-26): va a hacer varios
// cambios seguidos y no quiere que la barra salga en cada deploy. Para
// reactivarla, pon BANNER_ACTIVO = true.
const BANNER_ACTIVO = false;

export default function UpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    if (!BANNER_ACTIVO) return; // desactivada: ni siquiera hace polling
    let cancelado = false;

    const revisar = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (!cancelado && data?.buildId && data.buildId !== __BUILD_ID__) {
          setNeedRefresh(true);
        }
      } catch {
        /* sin red o version.json ausente (dev): reintenta luego */
      }
    };

    revisar(); // chequeo inmediato al cargar
    const id = setInterval(revisar, 60 * 1000);
    return () => { cancelado = true; clearInterval(id); };
  }, []);

  if (!needRefresh) return null;

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="w-full bg-amber-300 hover:bg-amber-200 text-amber-950 px-4 py-2 text-sm font-semibold cursor-pointer border-b border-amber-500 flex items-center justify-center gap-2"
    >
      <span>⚡ Nueva actualización disponible</span>
      <span className="hidden sm:inline">—</span>
      <span className="underline">click aquí para actualizar</span>
    </button>
  );
}
