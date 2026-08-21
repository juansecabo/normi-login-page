// Catálogo "Normi te guía" — Módulo OTROS.
//
// Páginas de interno que no encajaban en otro módulo y que el barrido de
// completitud detectó sin cubrir:
//  - Horarios de Avisos (/horarios-avisos): configurar a qué hora se disparan
//    los avisos automáticos de actividades. No tiene tarjeta en el dashboard;
//    se llega por URL directa (la guía navega por URL igual). Guards backend:
//    lectura = admin/rector/coordinador/secretaria/administrativo/profesor;
//    edición = admin/rector/coordinador.
//  - Aprende con Normi (/aprende-normi): tutorial jugable. Tarjeta solo en el
//    dashboard del profesor y solo en Cailico.

import type { Capacidad } from "../tipos";

const AVISOS_LECTURA = [
  "admin",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "profesor",
] as const;
const AVISOS_EDICION = ["admin", "rector", "coordinador"] as const;

export const OTROS: Capacidad[] = [
  {
    id: "otros.horarios_avisos_ver",
    titulo: "Ver los horarios de avisos automáticos",
    descripcion:
      "Ver las reglas que definen a qué hora se envían los avisos automáticos de actividades.",
    categoria: "Horarios de Avisos",
    roles: [...AVISOS_LECTURA],
    ruta: "/horarios-avisos",
    endpoint: "GET /api/horarios-avisos",
    sinonimos: [
      "ver los horarios de avisos",
      "a qué hora se mandan los avisos",
      "configuración de avisos automáticos",
    ],
    pasos: [
      {
        narracion: "Entramos a la configuración de horarios de avisos.",
        accion: "navegar",
        ruta: "/horarios-avisos",
      },
      {
        narracion: "Aquí ves las reglas de avisos por nivel o grado.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "otros.horarios_avisos_crear",
    titulo: "Crear una regla de horario de avisos",
    descripcion:
      "Agregar una regla que define para qué nivel o grado y a qué hora se dispara el aviso de actividades.",
    categoria: "Horarios de Avisos",
    roles: [...AVISOS_EDICION],
    ruta: "/horarios-avisos",
    endpoint: "POST /api/horarios-avisos (admin, rector, coordinador)",
    requisitos: [
      { entidad: "nivel", descripcion: "Nivel o grado al que aplica la regla." },
    ],
    sinonimos: [
      "crear una regla de aviso",
      "agregar un horario de avisos",
      "programar a qué hora se manda el aviso",
    ],
    pasos: [
      { narracion: "Entramos a Horarios de Avisos.", accion: "navegar", ruta: "/horarios-avisos" },
      { narracion: "Toca el botón para agregar una regla.", accion: "click", ancla: "avisos.boton_agregar" },
      { narracion: "Elige el nivel o grado.", accion: "seleccionar", ancla: "avisos.select_nivel", campo: "nivel" },
      { narracion: "Fija la hora del aviso.", accion: "seleccionar", ancla: "avisos.select_hora", campo: "hora" },
      { narracion: "Marca a quién avisar (estudiantes y/o acudientes).", accion: "click", ancla: "avisos.check_destinatarios", opcional: true },
      { narracion: "Guarda la regla.", accion: "click", ancla: "avisos.boton_guardar" },
    ],
  },
  {
    id: "otros.horarios_avisos_editar",
    titulo: "Editar una regla de horario de avisos",
    descripcion: "Cambiar la hora o los destinatarios de una regla de avisos existente.",
    categoria: "Horarios de Avisos",
    roles: [...AVISOS_EDICION],
    ruta: "/horarios-avisos",
    endpoint: "PATCH /api/horarios-avisos/:id (admin, rector, coordinador)",
    sinonimos: ["editar una regla de aviso", "cambiar la hora de un aviso automático"],
    pasos: [
      { narracion: "Entramos a Horarios de Avisos.", accion: "navegar", ruta: "/horarios-avisos" },
      { narracion: "Abre la regla que quieres cambiar.", accion: "click", ancla: "avisos.regla_editar" },
      { narracion: "Ajusta la hora o los destinatarios.", accion: "seleccionar", ancla: "avisos.select_hora", campo: "hora" },
      { narracion: "Guarda los cambios.", accion: "click", ancla: "avisos.boton_guardar" },
    ],
  },
  {
    id: "otros.horarios_avisos_eliminar",
    titulo: "Eliminar una regla de horario de avisos",
    descripcion: "Borrar una regla de avisos automáticos.",
    categoria: "Horarios de Avisos",
    roles: [...AVISOS_EDICION],
    ruta: "/horarios-avisos",
    endpoint: "DELETE /api/horarios-avisos/:id (admin, rector, coordinador)",
    sinonimos: ["eliminar una regla de aviso", "borrar un horario de avisos"],
    pasos: [
      { narracion: "Entramos a Horarios de Avisos.", accion: "navegar", ruta: "/horarios-avisos" },
      { narracion: "Abre el menú de la regla.", accion: "click", ancla: "avisos.regla_menu" },
      { narracion: "Toca 'Eliminar' y confirma.", accion: "click", ancla: "avisos.regla_eliminar" },
    ],
  },
  {
    id: "otros.aprende_normi",
    titulo: "Aprender a usar la plataforma con Normi",
    descripcion: "Abrir el tutorial jugable 'Aprende con Normi'.",
    categoria: "Aprende con Normi",
    roles: ["profesor"],
    gate: "cailico",
    ruta: "/aprende-normi",
    sinonimos: [
      "aprende con normi",
      "el tutorial",
      "enséñame a usar la plataforma",
      "cómo funciona la plataforma",
    ],
    pasos: [
      {
        narracion: "Abrimos 'Aprende con Normi', el tutorial.",
        accion: "navegar",
        ruta: "/aprende-normi",
      },
      {
        narracion: "Sigue las lecciones a tu ritmo. Listo.",
        accion: "explicar",
      },
    ],
  },
];
