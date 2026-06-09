// Helpers para mostrar uno o varios entrevistadores en una Solicitud de Entrevista.

export type Entrevistador = { cargo?: string; nombres?: string; apellidos?: string };

export const fmtEntrevistador = (e: Entrevistador) =>
  [e.cargo, e.nombres, e.apellidos].filter(Boolean).join(" ");

/** Une los entrevistadores: "A", "A y B", "A, B y C". `prefijo` antepone (ej. "el/la "). */
export const joinEntrevistadores = (arr: Entrevistador[], prefijo = ""): string => {
  const items = arr.map((e) => `${prefijo}${fmtEntrevistador(e)}`);
  if (items.length <= 1) return items[0] || "";
  return items.slice(0, -1).join(", ") + " y " + items[items.length - 1];
};

/** Texto del/los entrevistador(es) de una solicitud: usa la columna `entrevistadores`
 *  (varias personas) o cae al campo viejo `solicitante_*` (una sola). */
export const entrevistadoresDeSolicitud = (s: any, prefijo = ""): string =>
  joinEntrevistadores(
    Array.isArray(s.entrevistadores) && s.entrevistadores.length
      ? s.entrevistadores
      : [{ cargo: s.solicitante_cargo, nombres: s.solicitante_nombre }],
    prefijo,
  );
