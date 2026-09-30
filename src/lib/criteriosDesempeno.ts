/**
 * Criterio de evaluación de cada nivel de desempeño (pie del boletín, estilo SISNOTAS).
 * Cada colegio puede escribir el suyo en Configurar Institución → escala (campo
 * `criterio` del rango). Si no lo escribe, se usa el texto estándar según el nombre
 * del nivel; si el nombre no se reconoce, queda vacío.
 */
const CRITERIO_POR_LABEL: Array<{ match: RegExp; texto: string }> = [
  { match: /superior|excelente/i, texto: "Alcanza todos los logros, conocimientos y competencias propuestas sin actividades complementarias." },
  { match: /alto|sobresaliente/i, texto: "Alcanza todos los logros, conocimientos y competencias propuestas." },
  { match: /básico|basico|aceptable/i, texto: "Alcanza todos los logros mínimos propuestos." },
  { match: /bajo|insuficiente|deficiente/i, texto: "No alcanza todos los logros mínimos propuestos." },
];

/** Texto estándar según el nombre del nivel ("" si no se reconoce). */
export const criterioEstandar = (label: string): string =>
  CRITERIO_POR_LABEL.find((c) => c.match.test(label))?.texto || "";

/** El criterio que escribió el colegio o, si no hay, el estándar. */
export const criterioDeRango = (r: { label: string; criterio?: string | null }): string =>
  (r.criterio || "").trim() || criterioEstandar(r.label);
