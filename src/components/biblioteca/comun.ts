import { useEffect, useState } from "react";
import { getSession } from "@/hooks/useSession";
import { apiRequest } from "@/lib/apiClient";

/**
 * Biblioteca (Juan 2026-10-04): constantes y tipos compartidos por la ficha.
 * Gestionan: Bibliotecario(a) y Administrador. Consultan préstamos, vencidos y paz y salvo:
 * además rector, coordinación, secretaría y administrativos. Todos ven el catálogo.
 */
export const ROLES_GESTIONAN = ["Bibliotecario(a)", "Administrador"];
export const ROLES_CONSULTAN = [...ROLES_GESTIONAN, "Rector", "Coordinador(a)", "Secretaria General", "Administrativo(a)"];
export const puedeGestionar = () => ROLES_GESTIONAN.includes(getSession().cargo || "");
export const puedeConsultar = () => ROLES_CONSULTAN.includes(getSession().cargo || "");

/**
 * Géneros: cada colegio tiene su lista y la bibliotecaria agrega o quita (Juan 2026-10-04).
 * El libro guarda el nombre del género tal cual ("Novela", "Ciencia"…).
 */
export const generoLabel = (g?: string | null) => g || "";

/** Color de la portada de respaldo: siempre el mismo para el mismo género. */
const PALETA = ["#3b82f6", "#22c55e", "#f97316", "#ec4899", "#8b5cf6", "#0d9488", "#ef4444", "#eab308", "#0ea5e9", "#64748b"];
export function colorGenero(g?: string | null): string {
  if (!g) return "#0f766e";
  let h = 0;
  for (const c of g.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

let generosCache: string[] | null = null;
/** Lista de géneros del colegio (con caché); `guardar` la actualiza (solo quien gestiona). */
export function useGeneros() {
  const [generos, setGeneros] = useState<string[]>(generosCache || []);
  useEffect(() => {
    apiRequest<{ generos: string[] }>("/api/biblioteca/generos").then((r) => { generosCache = r.generos; setGeneros(r.generos); }).catch(() => null);
  }, []);
  const guardar = async (lista: string[]) => {
    const r = await apiRequest<{ generos: string[] }>("/api/biblioteca/generos", { method: "PUT", body: JSON.stringify({ generos: lista }) });
    generosCache = r.generos; setGeneros(r.generos);
  };
  return { generos, guardar };
}

/** Nivel lector = cinta de color del tejuelo (MEN): amarilla, azul, roja. */
export const NIVELES: { value: string; label: string; color: string }[] = [
  { value: "infantil", label: "Infantil (prejardín a 5°)", color: "#facc15" },
  { value: "juvenil", label: "Juvenil (6° a 11°)", color: "#3b82f6" },
  { value: "adultos", label: "Adultos", color: "#ef4444" },
];
export const nivelLabel = (n?: string | null) => NIVELES.find((x) => x.value === n)?.label.split(" (")[0] || "";

export const PROCEDENCIAS = [
  { value: "compra", label: "Compra" },
  { value: "donacion", label: "Donación" },
  { value: "dotacion_men", label: "Dotación MEN" },
  { value: "otro", label: "Otro" },
];

export const ESTADOS: Record<string, { label: string; cls: string }> = {
  disponible: { label: "Disponible", cls: "bg-emerald-100 text-emerald-700" },
  prestado: { label: "Prestado", cls: "bg-amber-100 text-amber-700" },
  reparacion: { label: "En reparación", cls: "bg-slate-200 text-slate-700" },
  perdido: { label: "Perdido", cls: "bg-rose-100 text-rose-700" },
  baja: { label: "De baja", cls: "bg-slate-100 text-slate-500" },
};

export interface ObraResumen {
  id: number; titulo: string; subtitulo: string | null; autores: string | null; editorial: string | null; anio: number | null;
  isbn: string | null; genero: string | null; nivel_lector: string | null; materia: string | null; dewey: string | null;
  portada_url: string | null; activa: boolean; total: number; disponibles: number; sala: number; prestados: number; proxima: string | null;
}

export interface PrestamoLector {
  id: number; fecha_prestamo: string; fecha_vencimiento: string; fecha_devolucion: string | null; renovaciones: number;
  perdido: boolean; reposicion_fecha: string | null; Biblioteca_Obras: { id: number; titulo: string; autores: string | null; portada_url: string | null } | null;
}

/** "Apellido, Nombre; Apellido2, Nombre2" → "Nombre Apellido y Nombre2 Apellido2". */
export function autoresBonitos(a?: string | null): string {
  if (!a) return "";
  const lista = a.split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
    const [ap, no] = x.split(",").map((y) => y.trim());
    return no ? `${no} ${ap}` : ap;
  });
  return lista.length <= 1 ? (lista[0] || "") : `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}`;
}

export const fechaCorta = (ymd: string) => new Date(ymd.slice(0, 10) + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
export const fechaLarga = (ymd: string) => new Date(ymd.slice(0, 10) + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
export const hoyYmd = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
export const errorDe = (err: any, def = "No se pudo completar.") => err?.body?.detail || err?.message || def;
