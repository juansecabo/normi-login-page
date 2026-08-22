// "Normi te guía" — helpers de sesión: qué capacidades tiene el interno logueado
// y su versión compacta para mandar al cerebro (server).

import { CATALOGO } from "./catalogo";
import { capacidadesDe, type Capacidad, type RolGuia } from "./tipos";
import { getSession } from "@/hooks/useSession";

const CAILICO_ID = "2f96f076-83df-4b84-8bbc-9c1df79a372b";

// Cargo de la sesión (AuthRol) -> rol del catálogo.
const CARGO_A_ROL: Record<string, RolGuia> = {
  "Profesor(a)": "profesor",
  Rector: "rector",
  "Coordinador(a)": "coordinador",
  "Secretaria General": "secretaria",
  "Administrativo(a)": "administrativo",
  "Orientador(a) Escolar": "orientador",
  Portero: "portero",
  Celador: "portero",
  Administrador: "admin",
  SuperAdmin: "admin",
};

export function rolGuiaDeSesion(): RolGuia | null {
  const { cargo } = getSession();
  return (cargo && CARGO_A_ROL[cargo]) || null;
}

/** ¿Este usuario ve "Normi te guía"? Cualquier interno, en TODOS los colegios. */
export function guiaDisponible(): boolean {
  const { colegio_id } = getSession();
  return !!rolGuiaDeSesion() && !!colegio_id;
}

export function capacidadesDeSesion(): Capacidad[] {
  const rol = rolGuiaDeSesion();
  const { colegio_id } = getSession();
  if (!rol || !colegio_id) return [];
  // esDirectorGrupo: aún no está en la sesión; por ahora false (las guías que lo
  // exigen no se ofrecen en v1). TODO: traer direccion_de_grupo del interno.
  return capacidadesDe(CATALOGO, rol, colegio_id, false);
}

/** Versión compacta que se envía al cerebro para que elija. Sin sinónimos: el
 * modelo entiende por título + descripción y así el prompt es mucho más liviano
 * (más rápido y barato). */
export function capacidadesLite() {
  return capacidadesDeSesion().map((c) => ({
    id: c.id,
    titulo: c.titulo,
    descripcion: c.descripcion,
    requisitos: c.requisitos,
  }));
}

export function capacidadPorId(id: string): Capacidad | undefined {
  return CATALOGO.find((c) => c.id === id);
}
