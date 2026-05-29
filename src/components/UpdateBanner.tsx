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
    try {
      // Activa el SW nuevo y recarga la página automáticamente cuando este
      // toma control (controllerchange).
      await updateServiceWorker(true);
    } catch (e) {
      console.warn("updateServiceWorker falló, forzando reload:", e);
    }
    // Salvavidas: solo si el SW nuevo no tomó control y la página no recargó
    // sola, forzamos la recarga a los 3s. Antes era 500ms, lo que disparaba
    // ANTES de que el SW nuevo activara: recargaba con el viejo aún en control,
    // needRefresh volvía a true y la barra reaparecía en bucle ("actualizando"
    // infinito). Con 3s la recarga normal del SW ocurre primero y este timeout
    // muere al navegar la página.
    setTimeout(() => {
      window.location.reload();
    }, 3000);
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
