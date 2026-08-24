// "Normi te guía" — helpers de sesión: qué capacidades tiene el interno logueado
// y su versión compacta para mandar al cerebro (server).

import { CATALOGO } from "./catalogo";
import { capacidadesDe, type Capacidad, type RolGuia } from "./tipos";
import { getSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";

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

// ¿El profesor logueado es director de grupo? Se consulta UNA vez por sesión
// (cache en memoria por usuario) al abrir la guía; para cargos no-profesor es
// false de entrada (el flag solo restringe al profesor).
let _dirCacheKey: string | null = null;
let _dirCacheVal = false;

export async function prefetchDirectorGrupo(): Promise<boolean> {
  const { id, cargo, colegio_id } = getSession();
  if (!id || cargo !== "Profesor(a)") return false;
  const key = `${id}:${colegio_id}`;
  if (_dirCacheKey === key) return _dirCacheVal;
  try {
    const { data } = await supabase
      .from("Internos")
      .select("direccion_de_grupo")
      .eq("id", parseInt(id))
      .maybeSingle();
    _dirCacheVal = !!String((data as { direccion_de_grupo?: string } | null)?.direccion_de_grupo || "").trim();
    _dirCacheKey = key;
  } catch {
    _dirCacheVal = false; // sin cachear: se reintenta en la próxima apertura
  }
  return _dirCacheVal;
}

function esDirectorGrupoCacheado(): boolean {
  const { id, colegio_id } = getSession();
  return _dirCacheKey === `${id}:${colegio_id}` && _dirCacheVal;
}

export function capacidadesDeSesion(): Capacidad[] {
  const rol = rolGuiaDeSesion();
  const { colegio_id } = getSession();
  if (!rol || !colegio_id) return [];
  return capacidadesDe(CATALOGO, rol, colegio_id, esDirectorGrupoCacheado());
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
