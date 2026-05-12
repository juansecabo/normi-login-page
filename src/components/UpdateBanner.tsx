// Banner global "Nueva actualización disponible" que aparece en todas las páginas
// para todos los perfiles cuando el service worker detecta una versión nueva.
//
// Funciona así:
//   1. El SW de la app (Workbox via vite-plugin-pwa) está configurado en modo "prompt".
//   2. Cada vez que el navegador re-visita la página o cuando se hace el polling de
//      abajo (cada 60s), el SW pregunta al servidor si hay una versión más nueva.
//   3. Si sí, queda en estado "waiting" y este hook detecta needRefresh=true.
//   4. Mostramos el banner. Al hacer click, llamamos updateServiceWorker(true) →
//      activa el nuevo SW y recarga la página → el usuario obtiene los cambios.

import { useRegisterSW } from "virtual:pwa-register/react";

export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Forzar chequeo de nueva versión cada 60s mientras la app esté abierta.
      // Sin esto, sólo se chequea al cargar la página por primera vez.
      if (r) {
        setInterval(() => {
          r.update().catch(() => {});
        }, 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn("SW register error:", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <button
      type="button"
      onClick={() => updateServiceWorker(true)}
      className="fixed top-0 left-0 right-0 z-[1000] bg-amber-300 hover:bg-amber-200 text-amber-950 px-4 py-2.5 text-sm font-semibold cursor-pointer shadow-md flex items-center justify-center gap-2 border-b border-amber-500 animate-pulse"
      style={{ animationDuration: "2.5s" }}
    >
      <span>⚡ Nueva actualización disponible</span>
      <span className="hidden sm:inline">—</span>
      <span className="underline">click aquí para actualizar</span>
    </button>
  );
}
