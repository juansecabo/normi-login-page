// Utilidades para el sistema de notas descriptivas de preescolar.

export const GRADOS_PREESCOLAR = ["Párvulo", "Prejardín", "Jardín", "Transición"] as const;

export type GradoPreescolar = typeof GRADOS_PREESCOLAR[number];

/**
 * Retorna true si el grado es de preescolar. Comparación tolerante con tildes/mayúsculas.
 */
export function esGradoPreescolar(grado: string | null | undefined): boolean {
  if (!grado) return false;
  return (GRADOS_PREESCOLAR as readonly string[]).includes(grado);
}

/**
 * Los dos "items" fijos que las profesoras de preescolar llenan por estudiante por periodo.
 * Se guardan como filas en la tabla `Notas` con nota=NULL, porcentaje=NULL y el texto en `comentario`.
 */
export const ACTIVIDADES_PREESCOLAR = [
  { nombre: "Descripción Integral", orden: 1 },
  { nombre: "Estímulo u Oportunidad de Mejoramiento", orden: 2 },
] as const;

export type NombreActividadPreescolar = typeof ACTIVIDADES_PREESCOLAR[number]["nombre"];
