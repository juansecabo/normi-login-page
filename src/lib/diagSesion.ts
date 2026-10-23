// Diagnóstico temporal (2026-10-23): avisa al server cuándo y desde dónde se borra
// la sesión, para investigar cierres de sesión al abrir otra pestaña. No muestra nada
// en pantalla; si falla, no pasa nada.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function diagSesion(evento: string) {
  try {
    const datos = {
      evento,
      pantalla: window.location.pathname,
      cookie: document.cookie.includes('normi_session_active'),
      marca: localStorage.getItem('normi_session_active'),
      id: !!localStorage.getItem('id'),
      cargo: localStorage.getItem('cargo'),
      jwt: !!localStorage.getItem('normi_jwt'),
      visible: document.visibilityState,
      origen: (new Error().stack || '').split('\n').slice(2, 7).join(' | ').slice(0, 700),
    };
    navigator.sendBeacon(`${API_BASE_URL}/api/diag/sesion`, new Blob([JSON.stringify(datos)], { type: 'text/plain' }));
  } catch { /* noop */ }
}
