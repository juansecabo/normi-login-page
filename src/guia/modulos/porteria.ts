// Catálogo "Normi te guía" — Módulo PORTERÍA (llegada tarde).
//
// Vive en src/pages/PorteriaLlegadaTarde.tsx, que exporta TRES pantallas:
//  - PorteriaHub (/porteria): dos tarjetas, "Reportar llegada tarde" y "Registro".
//  - PorteriaLlegadaTarde (/porteria/llegada-tarde): selecciona estudiantes y
//    notifica a los acudientes por WhatsApp con la hora de entrada (la de ese
//    momento) vía POST /api/porteria/reportar-tarde.
//  - PorteriaRegistro (/porteria/registro): histórico con dos sub-pestañas,
//    "Por día" (calendario) y "Por estudiante" (cuántas veces llegó tarde cada
//    uno), más corregir/eliminar un reporte.
//
// Guard de acceso (gate de la UI y del backend): ROLES_OK = Administrador,
// Rector, Coordinador(a), Portero → en minúscula: admin, rector, coordinador,
// portero. Las tres pantallas redirigen a /dashboard si el cargo no está en esa
// lista. No hay gate por colegio (todos).

import type { Capacidad } from "../tipos";

// Roles que pueden entrar a Portería (guard real, compartido por las 3 pantallas).
const PORTERIA_ROLES = ["admin", "rector", "coordinador", "portero"] as const;

export const PORTERIA: Capacidad[] = [
  {
    id: "porteria.abrir",
    titulo: "Abrir Portería",
    descripcion:
      "Entrar al hub de Portería, desde donde se reporta la llegada tarde y se consulta el registro.",
    categoria: "Portería",
    roles: [...PORTERIA_ROLES],
    ruta: "/porteria",
    sinonimos: [
      "abrir portería",
      "ir a portería",
      "entrar a portería",
      "llegadas tarde",
      "módulo de portería",
    ],
    pasos: [
      {
        narracion: "Vamos al hub de Portería.",
        accion: "navegar",
        ruta: "/porteria",
      },
      {
        narracion:
          "Aquí tienes dos opciones, reportar una llegada tarde y consultar el registro. Elige la que necesites.",
        accion: "explicar",
        ancla: "porteria.hub",
      },
    ],
  },
  {
    id: "porteria.reportar_tarde",
    titulo: "Reportar llegada tarde y avisar a los acudientes",
    descripcion:
      "Marcar a los estudiantes que llegaron tarde y enviar el reporte, que notifica por WhatsApp a sus acudientes con la hora de entrada.",
    categoria: "Portería",
    roles: [...PORTERIA_ROLES],
    ruta: "/porteria/llegada-tarde",
    endpoint: "POST /api/porteria/reportar-tarde (admin, rector, coordinador, portero)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Uno o varios estudiantes que llegaron tarde." },
    ],
    sinonimos: [
      "reportar llegada tarde",
      "avisar que un estudiante llegó tarde",
      "notificar al acudiente por llegada tarde",
      "marcar tardanza",
      "registrar que llegaron tarde",
      "enviar reporte de llegada tarde",
    ],
    pasos: [
      {
        narracion: "Entramos al hub de Portería.",
        accion: "navegar",
        ruta: "/porteria",
      },
      {
        narracion: "Abrimos la tarjeta de reportar llegada tarde.",
        accion: "click",
        ancla: "porteria.card_reportar",
      },
      {
        narracion:
          "Si quieres acotar la lista, filtra por grado. Es opcional.",
        accion: "seleccionar",
        ancla: "porteria.filtro_grado",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Y por salón, si hace falta afinar más. También es opcional.",
        accion: "seleccionar",
        ancla: "porteria.filtro_salon",
        campo: "salon",
        opcional: true,
      },
      {
        narracion:
          "También puedes escribir el nombre del estudiante en el buscador para encontrarlo rápido.",
        accion: "escribir",
        ancla: "porteria.buscar_estudiante",
        campo: "estudiante",
        opcional: true,
      },
      {
        narracion:
          "Marca la casilla de cada estudiante que llegó tarde. Van apareciendo en el panel de seleccionados.",
        accion: "click",
        ancla: "porteria.item_estudiante",
        campo: "estudiante",
      },
      {
        narracion:
          "Cuando estén todos, envía el reporte. Se notificará por WhatsApp a los acudientes con la hora de entrada de este momento.",
        accion: "click",
        ancla: "porteria.enviar_reporte",
      },
      {
        narracion:
          "Esperamos la confirmación, que dice cuántos estudiantes se reportaron y a cuántos acudientes se avisó. Si alguno no tiene acudiente registrado, aquí te lo indica.",
        accion: "esperar",
        ancla: "porteria.toast_enviado",
      },
    ],
  },
  {
    id: "porteria.quitar_seleccionado",
    titulo: "Quitar un estudiante de la selección antes de enviar",
    descripcion:
      "Sacar a un estudiante del panel de seleccionados (o vaciar toda la selección) antes de enviar el reporte.",
    categoria: "Portería",
    roles: [...PORTERIA_ROLES],
    ruta: "/porteria/llegada-tarde",
    sinonimos: [
      "quitar un estudiante de la selección",
      "sacar a alguien del reporte",
      "me equivoqué al marcar",
      "vaciar la selección",
      "quitar todos",
    ],
    pasos: [
      {
        narracion:
          "En el panel de seleccionados, toca la equis del estudiante que quieres sacar.",
        accion: "click",
        ancla: "porteria.quitar_seleccionado",
        campo: "estudiante",
      },
      {
        narracion:
          "Si prefieres empezar de cero, usa Quitar todos para vaciar la selección completa.",
        accion: "click",
        ancla: "porteria.quitar_todos",
        opcional: true,
      },
    ],
  },
  {
    id: "porteria.registro_por_dia",
    titulo: "Consultar las llegadas tarde de un día",
    descripcion:
      "Ver en el calendario los reportes de llegada tarde de una fecha concreta, con la hora y cuántos acudientes se notificaron.",
    categoria: "Portería",
    roles: [...PORTERIA_ROLES],
    ruta: "/porteria/registro",
    endpoint: "GET /api/porteria/historial?fecha= y GET /api/porteria/dias (admin, rector, coordinador, portero)",
    requisitos: [
      { entidad: "fecha", descripcion: "Día que se quiere consultar." },
    ],
    sinonimos: [
      "ver llegadas tarde de un día",
      "quién llegó tarde hoy",
      "registro de llegadas tarde por fecha",
      "consultar el histórico de portería",
      "reportes de llegada tarde de ayer",
    ],
    pasos: [
      {
        narracion: "Entramos al hub de Portería.",
        accion: "navegar",
        ruta: "/porteria",
      },
      {
        narracion: "Abrimos la tarjeta de registro de llegada tarde.",
        accion: "click",
        ancla: "porteria.card_registro",
      },
      {
        narracion: "Nos quedamos en la pestaña Por día.",
        accion: "click",
        ancla: "porteria.tab_por_dia",
      },
      {
        narracion:
          "Elige la fecha en el calendario. Los días con reportes vienen marcados.",
        accion: "click",
        ancla: "porteria.calendario_dia",
        campo: "fecha",
      },
      {
        narracion:
          "A la derecha aparecen los estudiantes reportados ese día, con la hora de entrada y cuántos acudientes se notificaron.",
        accion: "esperar",
        ancla: "porteria.lista_dia",
      },
    ],
  },
  {
    id: "porteria.registro_por_estudiante",
    titulo: "Ver cuántas veces ha llegado tarde cada estudiante",
    descripcion:
      "Consultar el resumen por estudiante (total de llegadas tarde y última fecha) y desplegar el detalle de las fechas de uno.",
    categoria: "Portería",
    roles: [...PORTERIA_ROLES],
    ruta: "/porteria/registro",
    endpoint: "GET /api/porteria/resumen y GET /api/porteria/historial?estudiante_id= (admin, rector, coordinador, portero)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante del que se quiere el detalle (opcional)." },
    ],
    sinonimos: [
      "cuántas veces ha llegado tarde un estudiante",
      "quién llega tarde más seguido",
      "resumen de llegadas tarde por estudiante",
      "reincidentes de llegada tarde",
      "historial de tardanzas de un estudiante",
    ],
    pasos: [
      {
        narracion: "Entramos al hub de Portería.",
        accion: "navegar",
        ruta: "/porteria",
      },
      {
        narracion: "Abrimos la tarjeta de registro de llegada tarde.",
        accion: "click",
        ancla: "porteria.card_registro",
      },
      {
        narracion: "Cambiamos a la pestaña Por estudiante.",
        accion: "click",
        ancla: "porteria.tab_por_estudiante",
      },
      {
        narracion:
          "Cada fila muestra un estudiante con su total de llegadas tarde y la última fecha. Puedes buscar por nombre para encontrarlo.",
        accion: "escribir",
        ancla: "porteria.buscar_resumen",
        campo: "estudiante",
        opcional: true,
      },
      {
        narracion:
          "Toca la fila del estudiante para desplegar el detalle con todas las fechas y horas en que llegó tarde.",
        accion: "click",
        ancla: "porteria.fila_resumen",
        campo: "estudiante",
        opcional: true,
      },
      {
        narracion:
          "Si necesitas refrescar los números, usa el botón de actualizar.",
        accion: "click",
        ancla: "porteria.actualizar_resumen",
        opcional: true,
      },
    ],
  },
  {
    id: "porteria.corregir_reporte",
    titulo: "Corregir o eliminar un reporte de llegada tarde",
    descripcion:
      "Borrar del registro un reporte de llegada tarde equivocado (no deshace el WhatsApp que ya se envió, solo corrige el registro).",
    categoria: "Portería",
    roles: [...PORTERIA_ROLES],
    ruta: "/porteria/registro",
    endpoint: "DELETE /api/porteria/historial/:id (admin, rector, coordinador, portero)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante cuyo reporte se quiere corregir." },
      { entidad: "fecha", descripcion: "Fecha del reporte a eliminar." },
    ],
    sinonimos: [
      "corregir un reporte de llegada tarde",
      "eliminar una llegada tarde",
      "borrar un reporte equivocado",
      "quitar una tardanza del registro",
      "me equivoqué al reportar la llegada tarde",
    ],
    pasos: [
      {
        narracion: "Entramos al registro de llegada tarde.",
        accion: "navegar",
        ruta: "/porteria/registro",
      },
      {
        narracion:
          "Ubica el reporte que quieres corregir, ya sea en la pestaña Por día o abriendo el detalle del estudiante en Por estudiante.",
        accion: "explicar",
        ancla: "porteria.tabs_registro",
      },
      {
        narracion: "Toca el icono de la papelera junto a ese reporte.",
        accion: "click",
        ancla: "porteria.eliminar_reporte",
        campo: "estudiante",
      },
      {
        narracion:
          "Se abre una ventana de confirmación. Recuerda que si el WhatsApp al acudiente ya salió, no se puede deshacer, esto solo corrige el registro.",
        accion: "esperar",
        ancla: "porteria.dialog_corregir",
      },
      {
        narracion: "Confirma con Eliminar del registro.",
        accion: "click",
        ancla: "porteria.confirmar_eliminar",
      },
    ],
  },
];
