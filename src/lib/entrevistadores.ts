// Helpers para mostrar uno o varios entrevistadores en una Solicitud de Entrevista.

export type Entrevistador = { cargo?: string; nombres?: string; apellidos?: string; genero?: string | null };

/** "Profesor(a)" → "Profesor" (M) / "Profesora" (F). Sin género queda neutro. */
export const cargoSegunGenero = (cargo?: string, genero?: string | null): string => {
  // Cargos sin "(a)" pero con femenino propio (ej. Portero → Portera).
  if (cargo === "Portero") return genero === "F" ? "Portera" : "Portero";
  if (!cargo || !cargo.includes("(a)")) return cargo || "";
  if (genero === "M") return cargo.replace("(a)", "");
  if (genero === "F") {
    return cargo.replace(/([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\(a\)/, (_m, base: string) =>
      base.endsWith("o") ? base.slice(0, -1) + "a" : base + "a");
  }
  return cargo;
};

export const fmtEntrevistador = (e: Entrevistador) =>
  [cargoSegunGenero(e.cargo, e.genero), e.nombres, e.apellidos].filter(Boolean).join(" ");

/** Une los entrevistadores: "A", "A y B", "A, B y C". `prefijo` antepone (ej. "el/la ",
 *  que con género conocido se vuelve "el " o "la " por persona). */
export const joinEntrevistadores = (arr: Entrevistador[], prefijo = ""): string => {
  const items = arr.map((e) => {
    const pref = prefijo === "el/la "
      ? (e.genero === "F" ? "la " : e.genero === "M" ? "el " : "el/la ")
      : prefijo;
    return `${pref}${fmtEntrevistador(e)}`;
  });
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
