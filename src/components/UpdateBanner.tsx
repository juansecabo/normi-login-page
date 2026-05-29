// Banner "Nueva actualización disponible". Se monta DENTRO de HeaderNormi /
// HeaderPati para que aparezca como una barra fija justo debajo del header
// verde, sin parpadear, hasta que el usuario haga click.
//
// Cada 60s en background el SW chequea si hay versión nueva en el servidor.
// Si la hay, needRefresh pasa a true y el banner se renderiza. El click
// activa el SW nuevo y recarga la página.

import { useRegisterSW } from "virtual:pwa-register/react";

export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Check inmediato — no esperar el primer intervalo.
        r.update().catch(() => {});
        setInterval(() => {
          r.update().catch(() => {});
        }, 30 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn("SW register error:", error);
    },
  });

  if (!needRefresh) return null;

  const handleClick = async () => {
    // En modo 'prompt' (vite-plugin-pwa), updateServiceWorker SOLO envía
    // SKIP_WAITING al SW nuevo; la recarga la dispara la propia librería UNA
    // vez, vía su listener interno 'controlling', cuando el SW nuevo toma
    // control. NO recargamos a mano: hacerlo recargaba ANTES de que el SW
    // activara, la nueva carga volvía a detectar el SW en "waiting", se
    // re-armaba el listener 'controlling' y al activar disparaba otro reload
    // automático → bucle infinito de recargas (favicon parpadeando).
    try {
      await updateServiceWorker(true);
    } catch (e) {
      console.warn("updateServiceWorker falló:", e);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full bg-amber-300 hover:bg-amber-200 text-amber-950 px-4 py-2 text-sm font-semibold cursor-pointer border-b border-amber-500 flex items-center justify-center gap-2"
    >
      <span>⚡ Nueva actualización disponible</span>
      <span className="hidden sm:inline">—</span>
      <span className="underline">click aquí para actualizar</span>
    </button>
  );
}
