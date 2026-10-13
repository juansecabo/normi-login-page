import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { getSession } from "@/hooks/useSession";
import iconActividades from "@/assets/icons/actividades.webp";
import iconAsistencia from "@/assets/icons/asistencia.webp";
import iconBiblioteca from "@/assets/icons/biblioteca.webp";
import iconBoletines from "@/assets/icons/boletines.webp";
import iconCalendario from "@/assets/icons/calendario.webp";
import iconCasos from "@/assets/icons/casos.png";
import iconCitas from "@/assets/icons/citas.png";
import iconComunicados from "@/assets/icons/comunicados.webp";
import iconComunicadosRecibidos from "@/assets/icons/comunicados-recibidos.webp";
import iconConfigurarInstitucion from "@/assets/icons/configurar-institucion.webp";
import iconConsultas from "@/assets/icons/consultas.png";
import iconConversaciones from "@/assets/icons/conversaciones.webp";
import iconDireccionGrupo from "@/assets/icons/direccion-grupo.webp";
import iconDocumentos from "@/assets/icons/documentos.webp";
import iconEntrevista from "@/assets/icons/entrevista.webp";
import iconEnviarComunicado from "@/assets/icons/enviar-comunicado.webp";
import iconEstadisticas from "@/assets/icons/estadisticas.webp";
import iconFormatos from "@/assets/icons/formatos.webp";
import iconHorario from "@/assets/icons/horario.webp";
import iconNotas from "@/assets/icons/notas.webp";
import iconObservador from "@/assets/icons/observador.webp";
import iconOrientacion from "@/assets/icons/orientacion-escolar.webp";
import iconPanelControl from "@/assets/icons/panel-de-control.webp";
import iconPerfil from "@/assets/icons/perfil.png";
import iconPermisos from "@/assets/icons/permisos-y-excusas.webp";
import iconPorteria from "@/assets/icons/porteria.png";
import iconRegistroAgente from "@/assets/icons/registro-agente.webp";
import iconRegistros from "@/assets/icons/registros-comportamiento.png";
import iconRetiro from "@/assets/icons/retiro-estudiantes.webp";
import iconUsoAgente from "@/assets/icons/uso-agente.webp";
import iconInasistencia from "@/assets/icons/inasistencia.webp";
import iconUniforme from "@/assets/icons/uniforme.webp";

/**
 * Íconos 3D en las fichas (piloto colegio de prueba Cailico, 2026-10-12). La ficha queda
 * EXACTAMENTE como siempre (fondo de color, texto adentro, mismo tamaño); solo el ícono plano
 * se cambia por su versión 3D sin fondo, del mismo tamaño. Normi Examinadora conserva la
 * imagen real de Normi. Si un ícono no tiene versión 3D, queda el de siempre.
 */
export const COLEGIOS_FICHAS_3D = new Set(["2f96f076-83df-4b84-8bbc-9c1df79a372b"]);

const NOMBRE_ICONO: Record<string, string> = {
  [iconActividades]: "actividades", [iconAsistencia]: "asistencia", [iconBiblioteca]: "biblioteca",
  [iconBoletines]: "boletines", [iconCalendario]: "calendario", [iconCasos]: "casos", [iconCitas]: "citas",
  [iconComunicados]: "comunicados", [iconComunicadosRecibidos]: "comunicados-recibidos",
  [iconConfigurarInstitucion]: "configurar-institucion", [iconConsultas]: "consultas",
  [iconConversaciones]: "conversaciones", [iconDireccionGrupo]: "direccion-grupo", [iconDocumentos]: "documentos",
  [iconEntrevista]: "entrevista", [iconEnviarComunicado]: "enviar-comunicado", [iconEstadisticas]: "estadisticas",
  [iconFormatos]: "formatos", [iconHorario]: "horario", [iconNotas]: "notas", [iconObservador]: "observador",
  [iconOrientacion]: "orientacion-escolar", [iconPanelControl]: "panel-de-control", [iconPerfil]: "perfil",
  [iconPermisos]: "permisos-y-excusas", [iconPorteria]: "porteria", [iconRegistroAgente]: "registro-agente",
  [iconRegistros]: "registros-comportamiento", [iconRetiro]: "retiro-estudiantes", [iconUsoAgente]: "uso-agente",
  [iconInasistencia]: "inasistencia", [iconUniforme]: "uniforme",
};
const NOMBRE_EMOJI: Record<string, string> = { "🎯": "logros", "🎮": "aprende-normi" };

/** Íconos 3D disponibles en public/fichas3d/iconos/<icono>.webp (con transparencia). */
const DISPONIBLES = new Set([
  "actividades", "asistencia", "biblioteca", "boletines", "calendario", "casos", "citas", "comunicados",
  "comunicados-recibidos", "configurar-institucion", "consultas", "conversaciones", "direccion-grupo",
  "documentos", "entrevista", "enviar-comunicado", "estadisticas", "formatos", "horario", "notas",
  "observador", "orientacion-escolar", "panel-de-control", "perfil", "permisos-y-excusas", "porteria",
  "registro-agente", "registros-comportamiento", "retiro-estudiantes", "uso-agente", "inasistencia",
  "uniforme", "logros", "aprende-normi", "bib-catalogo", "bib-comunidad", "bib-etiquetas", "bib-prestamos",
]);
const VERSION = 5; // subir al reemplazar imágenes (rompe la caché)

const url3d = (nombre?: string) => (nombre && DISPONIBLES.has(nombre) ? `/fichas3d/iconos/${nombre}.webp?v=${VERSION}` : undefined);
const activo = () => COLEGIOS_FICHAS_3D.has(getSession().colegio_id ?? "");

/** Ícono 3D por nombre (p. ej. "bib-catalogo") si el colegio está en el piloto; si no, undefined. */
export function icono3dNombre(nombre: string): string | undefined {
  return activo() ? url3d(nombre) : undefined;
}

/** Para pantallas con <img src={icono}>: devuelve el 3D si aplica, si no el mismo icono. */
export function icono3d(src: string): string {
  return (activo() && url3d(NOMBRE_ICONO[src])) || src;
}

function cambiarIconos(nodos: ReactNode): ReactNode {
  return Children.map(nodos, (n) => {
    if (!isValidElement(n)) return n;
    const el = n as ReactElement<{ src?: string; className?: string; children?: ReactNode }>;
    if (el.type === "img") {
      const u = url3d(NOMBRE_ICONO[el.props.src ?? ""]);
      return u ? cloneElement(el, { src: u }) : el;
    }
    if (el.type === "span" && (el.props.className ?? "").includes("text-5xl")) {
      const u = url3d(NOMBRE_EMOJI[String(el.props.children).trim()]);
      return u ? <img src={u} alt="" className="w-12 h-12 object-contain" /> : el;
    }
    if (el.type === "div" && el.props.children) return cloneElement(el, { children: cambiarIconos(el.props.children) });
    return el;
  });
}

/**
 * Ficha del tablero con el ícono 3D pequeño arriba y el título abajo, todo sobre el color de
 * la ficha; el título con espacio fijo de dos líneas para que se acomode. Mismo onClick, data-guia y burbuja.
 */
export function fichaConImagen3d(render: ReactNode): ReactNode {
  if (!isValidElement(render) || render.type !== "button") return render;
  const btn = render as ReactElement<{ className?: string; children?: ReactNode }>;
  const color = /\bbg-([a-z]+)-100\b/.exec(btn.props.className ?? "")?.[1];
  let icono: ReactNode = null, titulo: ReactNode = undefined;
  const extras: ReactNode[] = [];
  const recorrer = (nodos: ReactNode) => Children.forEach(cambiarIconos(nodos), (n) => {
    if (!isValidElement(n)) return;
    const el = n as ReactElement<{ src?: string; className?: string; children?: ReactNode }>;
    if (el.type === "img" && !icono) { icono = el; return; }
    if (el.type === "span" && (el.props.className ?? "").includes("font-semibold") && titulo === undefined) { titulo = el.props.children; return; }
    if (el.type === "div" && el.props.children && !(el.props.className ?? "").includes("absolute")) { recorrer(el.props.children); return; }
    extras.push(el);
  });
  recorrer(btn.props.children);
  const src = isValidElement(icono) ? String((icono as ReactElement<{ src?: string }>).props.src ?? "") : "";
  const hover = (btn.props.className ?? "").split(/\s+/).filter((c) => c.startsWith("hover:") || c.startsWith("transition") || c.startsWith("duration-")).join(" ");
  if (!color || titulo === undefined || !src) return render; // Normi Examinadora conserva su imagen real
  return cloneElement(btn, {
    // Se conserva el efecto de la ficha original al pasar el mouse (color más oscuro + sombra).
    className: `relative w-full h-full flex flex-col rounded-[20px] lg:rounded-3xl shadow-[0_10px_30px_-18px_rgba(22,26,61,.35)] ${FONDO[color] ?? ""} ${hover}`,
    children: (
      <>
        {extras}
        <div className="flex-1 flex items-center justify-center px-6 pt-6 pb-2">{icono}</div>
        <div className="px-2 pb-3 lg:px-3 lg:pb-4 flex items-start justify-center min-h-[3.25rem] lg:min-h-[3.5rem]">
          <span className="font-semibold text-foreground text-center text-sm lg:text-[15px] leading-tight [text-wrap:balance]">{titulo}</span>
        </div>
      </>
    ),
  });
}

/** Clases completas (Tailwind no detecta clases armadas con variables). */
const FONDO: Record<string, string> = {
  green: "bg-green-100", cyan: "bg-cyan-100", blue: "bg-blue-100", teal: "bg-teal-100", emerald: "bg-emerald-100",
  indigo: "bg-indigo-100", amber: "bg-amber-100", violet: "bg-violet-100", lime: "bg-lime-100", pink: "bg-pink-100",
  orange: "bg-orange-100", sky: "bg-sky-100", purple: "bg-purple-100", rose: "bg-rose-100", red: "bg-red-100", yellow: "bg-yellow-100",
};
