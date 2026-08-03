// Auto-recuperación de la app cuando queda en mal estado:
//  - Pantalla en blanco al volver de una pestaña que Chrome "durmió".
//  - Un fragmento (.js/.css) que ya no existe tras un despliegue nuevo.
// En ambos casos recargamos la página UNA vez. Un sello en sessionStorage evita
// bucles: si ya recargamos hace menos de 10s, no volvemos a hacerlo (así, si algo
// está genuinamente roto, se muestra la pantalla de reintento en vez de recargar
// sin fin).

const RELOAD_KEY = 'nn_auto_reload_ts';

/** Recarga la página una sola vez. Devuelve false si ya se recargó hace poco. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 10000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* sessionStorage no disponible → recargamos igual */
  }
  window.location.reload();
  return true;
}

/** Listeners globales para fallos de carga de módulos/chunks (fuera de React). */
export function installAutoRecover(): void {
  // Vite emite este evento cuando un import dinámico no se pudo cargar.
  window.addEventListener('vite:preloadError' as keyof WindowEventMap, (e: Event) => {
    e.preventDefault();
    reloadOnce();
  });

  // Un <script>/<link> que no cargó (p. ej. el bundle viejo ya no existe en el
  // servidor tras un despliegue). Se captura en fase de captura.
  window.addEventListener(
    'error',
    (e: Event) => {
      const t = e.target as HTMLElement | undefined;
      if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) reloadOnce();
    },
    true,
  );

  // Rechazos de promesa por fallo de import dinámico (no por fallos de API normales).
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const msg = String(e?.reason?.message || e?.reason || '');
    if (/dynamically imported module|Loading chunk|module script failed/i.test(msg)) {
      reloadOnce();
    }
  });
}
