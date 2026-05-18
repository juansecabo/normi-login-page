/**
 * Año escolar actual (zona horaria America/Bogota).
 * Toda consulta a Notas / Nombre de Actividades debe filtrar por este valor
 * para que un estudiante que repita año no mezcle notas con las del año pasado.
 *
 * El INSERT usa el DEFAULT de la columna en Postgres (no hace falta inyectarlo
 * desde acá), así que solo filtramos en SELECT/UPDATE/DELETE.
 */
export function anoEscolarActual(): number {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric' });
  return Number(fmt.format(new Date()));
}
