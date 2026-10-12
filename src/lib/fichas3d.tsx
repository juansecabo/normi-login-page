import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
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
import normiExaminadoraImg from "@/assets/normi-examinadora.webp";

/**
 * Fichas del tablero con ilustración 3D (estilo Mundo Nexus) — piloto en el colegio de
 * prueba Cailico (2026-10-12). Imagen arriba (4:3, el fondo pastel viene en la imagen y es
 * el mismo color que la ficha tenía) y el título debajo; sin descripción ni animación.
 * Se toma el <button> que ya arma cada tablero y se re-dibuja: mismo onClick, data-guia y
 * burbuja de notificaciones. Si no hay ilustración para esa ficha, queda como estaba.
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
  [normiExaminadoraImg]: "normi-examinadora",
};
const NOMBRE_EMOJI: Record<string, string> = { "🎯": "logros", "🎮": "aprende-normi" };

/** Ilustraciones disponibles en public/fichas3d/<icono>-<color>.webp */
const DISPONIBLES = new Set([
  "actividades-cyan", "actividades-green", "asistencia-blue", "biblioteca-teal", "boletines-emerald",
  "calendario-indigo", "casos-amber", "citas-violet", "comunicados-lime", "comunicados-violet",
  "comunicados-recibidos-indigo", "comunicados-recibidos-teal", "configurar-institucion-teal",
  "consultas-pink", "consultas-violet", "conversaciones-blue", "direccion-grupo-lime", "documentos-amber",
  "documentos-cyan", "entrevista-indigo", "enviar-comunicado-teal", "enviar-comunicado-violet",
  "estadisticas-green", "estadisticas-orange", "estadisticas-teal", "formatos-orange", "horario-cyan",
  "notas-emerald", "observador-sky", "orientacion-escolar-sky", "panel-de-control-purple", "perfil-sky",
  "permisos-y-excusas-rose", "porteria-orange", "registro-agente-cyan", "registros-comportamiento-amber",
  "retiro-estudiantes-rose", "uso-agente-orange", "normi-examinadora-green", "logros-lime", "aprende-normi-rose",
]);
const VERSION = 3; // subir al reemplazar imágenes (rompe la caché)

type Partes = { icono?: string; titulo?: ReactNode; extras: ReactNode[] };

function separar(nodos: ReactNode, p: Partes) {
  Children.forEach(nodos, (n) => {
    if (!isValidElement(n)) return;
    const el = n as ReactElement<{ src?: string; className?: string; children?: ReactNode }>;
    if (el.type === "img") { p.icono ??= NOMBRE_ICONO[el.props.src ?? ""]; return; }
    if (el.type === "span") {
      const cls = el.props.className ?? "";
      if (cls.includes("text-5xl")) { p.icono ??= NOMBRE_EMOJI[String(el.props.children).trim()]; return; }
      if (cls.includes("font-semibold") && p.titulo === undefined) { p.titulo = el.props.children; return; }
    }
    if (el.type === "div" && el.props.children && !el.props.className?.includes("absolute")) { separar(el.props.children, p); return; }
    p.extras.push(el); // burbujas de notificaciones y similares
  });
}

export function fichaConImagen3d(render: ReactNode): ReactNode {
  if (!isValidElement(render) || render.type !== "button") return render;
  const btn = render as ReactElement<{ className?: string; children?: ReactNode }>;
  const color = /\bbg-([a-z]+)-100\b/.exec(btn.props.className ?? "")?.[1];
  const p: Partes = { extras: [] };
  separar(btn.props.children, p);
  const clave = p.icono && color ? `${p.icono}-${color}` : "";
  if (!DISPONIBLES.has(clave) || p.titulo === undefined) return render;
  return cloneElement(btn, {
    className: "relative w-full h-full flex flex-col rounded-[20px] lg:rounded-3xl bg-white border border-[#E3E5F2] shadow-[0_10px_30px_-18px_rgba(22,26,61,.35)]",
    children: (
      <>
        {p.extras}
        <div className="relative w-full aspect-[4/3] overflow-hidden rounded-t-[19px] lg:rounded-t-[23px] bg-[#F4F4FB]">
          <img src={`/fichas3d/${clave}.webp?v=${VERSION}`} alt="" draggable={false} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        </div>
        <div className="flex-1 flex items-center justify-center px-2 py-2 lg:px-3 lg:py-3">
          <span className="font-bold text-[#12163A] text-center text-sm lg:text-[15px] leading-tight">{p.titulo}</span>
        </div>
      </>
    ),
  });
}
