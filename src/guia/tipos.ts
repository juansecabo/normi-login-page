// "Normi te guía" — tipos del catálogo de capacidades.
//
// El catálogo es la fuente de verdad de TODO lo que un interno puede hacer en la
// plataforma, por rol, con los pasos que Normi ejecuta con el cursor simulado.
// NO está hardcodeado por preguntas: cada capacidad describe qué logra, quién
// puede (según los guards reales del backend) y cómo se hace paso a paso. Normi
// mapea la petición del usuario a una capacidad y ejecuta sus pasos.

export type RolGuia =
  | "profesor"
  | "rector"
  | "coordinador"
  | "secretaria"
  | "administrativo"
  | "orientador"
  | "portero"
  | "admin"
  // Comunidad (desde 2026-08-26): la guía también acompaña a las familias.
  | "estudiante"
  | "acudiente";

// Features que solo existen en ciertos colegios (gate por colegio_id).
export type GateColegio = "todos" | "cailico" | "pestalozziano";

export const COLEGIO_IDS: Record<Exclude<GateColegio, "todos">, string> = {
  cailico: "2f96f076-83df-4b84-8bbc-9c1df79a372b",
  pestalozziano: "94c1414b-22d1-40dd-945a-5857b62e5f6c",
};

export type AccionPaso =
  | "navegar" // cambiar de ruta
  | "click" // click en un elemento anclado (data-guia)
  | "escribir" // teclear en un input/textarea (el valor lo resuelve Normi)
  | "seleccionar" // elegir en un select/combo/dropdown
  | "esperar" // esperar a que algo cargue/aparezca
  | "explicar"; // solo narración, sin tocar la UI

export interface Paso {
  /** Lo que Normi dice (narra) en este paso. */
  narracion: string;
  accion: AccionPaso;
  /** Id estable del elemento objetivo (data-guia="..."). Se cablea en la fase motor. */
  ancla?: string;
  /** Ruta destino cuando accion === "navegar". */
  ruta?: string;
  /** Qué dato va aquí (ej. "descripcion", "fecha_presentacion") para escribir/seleccionar. */
  campo?: string;
  /** El paso puede saltarse según el caso. */
  opcional?: boolean;
}

export interface Requisito {
  /** Entidad que Normi resuelve (leyendo la DB en modo lectura) para completar la guía. */
  entidad:
    | "asignatura"
    | "grado"
    | "salon"
    | "periodo"
    | "estudiante"
    | "acudiente"
    | "profesor"
    | "nivel"
    | "fecha";
  descripcion: string;
}

export interface Capacidad {
  /** Id único, con prefijo de módulo. Ej: "notas.agregar_actividad". */
  id: string;
  titulo: string;
  /** Qué logra, en una frase. */
  descripcion: string;
  categoria: string;
  /** Quién puede ejecutarla. Fuente de verdad = guards del backend, no el menú. */
  roles: RolGuia[];
  /** Solo aplica a ciertos colegios. Por defecto "todos". */
  gate?: GateColegio;
  /** Solo para profesores director de grupo (Internos.direccion_de_grupo). */
  requiereDirectorGrupo?: boolean;
  /** Ruta base del frontend donde ocurre la acción. */
  ruta: string;
  /** La acción real con su guard (para trazabilidad y para saber qué rechazará el server). */
  endpoint?: string;
  /** Entidades que Normi debe resolver antes o durante la guía. */
  requisitos?: Requisito[];
  /** Frases con que el usuario pediría esto. Ayuda de recall, NO preguntas hardcodeadas. */
  sinonimos: string[];
  pasos: Paso[];
}

/** Devuelve las capacidades disponibles para un rol y colegio dados. */
export function capacidadesDe(
  catalogo: Capacidad[],
  rol: RolGuia,
  colegioId: string,
  esDirectorGrupo: boolean,
): Capacidad[] {
  return catalogo.filter((c) => {
    if (!c.roles.includes(rol)) return false;
    // El flag de director de grupo solo restringe al PROFESOR (los directivos
    // de la lista de roles entran por su propio derecho).
    if (c.requiereDirectorGrupo && rol === "profesor" && !esDirectorGrupo) return false;
    if (c.gate && c.gate !== "todos") {
      if (colegioId !== COLEGIO_IDS[c.gate]) return false;
    }
    return true;
  });
}
