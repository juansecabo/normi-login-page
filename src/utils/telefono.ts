/**
 * Formatea un teléfono para MOSTRARLO separando el indicativo de país del número,
 * para que no se lea todo pegado. Ej: "573233819608" → "(+57) 3233819608".
 * Solo para visualización (no para inputs ni para guardar).
 */
export function formatTelefono(tel?: string | number | null): string {
  if (tel === null || tel === undefined) return "";
  const d = String(tel).replace(/\D/g, "");
  if (!d) return "";
  // Colombia: 57 + 10 dígitos.
  if (d.startsWith("57") && d.length === 12) return `(+57) ${d.slice(2)}`;
  // Ya viene sin indicativo (10 dígitos) → tal cual.
  if (d.length === 10) return d;
  // Otros casos: si arranca con indicativo razonable, separa los 10 finales.
  if (d.length > 10) return `(+${d.slice(0, d.length - 10)}) ${d.slice(-10)}`;
  return d;
}
