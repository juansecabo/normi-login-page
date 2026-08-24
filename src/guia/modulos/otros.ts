// Catálogo "Normi te guía" — Módulo OTROS.
//
// Páginas de interno que no encajaban en otro módulo y que el barrido de
// completitud detectó sin cubrir:
//  - Horarios de Avisos (/horarios-avisos): configurar a qué hora se disparan
//    los avisos automáticos de actividades. OJO: no tiene tarjeta ni enlace en
//    ninguna parte de la UI; solo se llega tecleando la URL (Normi nunca navega,
//    así que el paso de llegada lo explica). Guard del FRONTEND: la página
//    expulsa a quien no tiene dashboard directivo (el profesor queda fuera
//    aunque el backend le permita GET). Edición = admin/rector/coordinador.
//  - Aprende con Normi (/aprende-normi): tutorial jugable. Tarjeta solo en el
//    dashboard del profesor y solo en Cailico.

import type { Capacidad } from "../tipos";

// Roles que la PÁGINA deja entrar (puedeAccederDashboard || isAdmin; el
// profesor es redirigido a "/" aunque el backend le permita leer).
const AVISOS_LECTURA = [
  "admin",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
] as const;
const AVISOS_EDICION = ["admin", "rector", "coordinador"] as const;

// Paso de llegada: la página no tiene tarjeta ni enlace en la UI.
const llegarAHorariosAvisos = () =>
  [
    {
      narracion:
        "Esta página no tiene tarjeta en el inicio: escribe /horarios-avisos al final de la dirección en la barra del navegador y dale Enter.",
      accion: "navegar" as const,
      ruta: "/horarios-avisos",
    },
  ];

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
      ...llegarAHorariosAvisos(),
      {
        narracion:
          "Aquí ves las reglas de avisos por nivel o grado, en 'Reglas configuradas'.",
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
      ...llegarAHorariosAvisos(),
      {
        narracion: "En el cuadro Agregar nueva regla, elige el 'Nivel'.",
        accion: "seleccionar",
        ancla: "avisos.select_nivel",
        campo: "nivel",
      },
      {
        narracion:
          "Si la regla es solo para un grado, elígelo en el select de Grado (es opcional).",
        accion: "seleccionar",
        ancla: "avisos.select_grado",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Escribe la hora del aviso en formato HH:MM (por ejemplo 14:30).",
        accion: "escribir",
        ancla: "avisos.input_hora",
        campo: "hora",
      },
      {
        narracion:
          "Si quieres, ajusta las casillas 'Est' (estudiantes) y 'Acud' (acudientes); vienen las dos marcadas.",
        accion: "click",
        ancla: "avisos.check_destinatarios",
        opcional: true,
      },
      {
        narracion: "Toca 'Agregar' para guardar la regla.",
        accion: "click",
        ancla: "avisos.boton_guardar",
      },
    ],
  },
  {
    id: "otros.horarios_avisos_editar",
    titulo: "Editar una regla de horario de avisos",
    descripcion:
      "Cambiar la hora o los destinatarios de una regla de avisos, o activarla/desactivarla con su interruptor. Todo se edita directo en la fila.",
    categoria: "Horarios de Avisos",
    roles: [...AVISOS_EDICION],
    ruta: "/horarios-avisos",
    endpoint: "PATCH /api/horarios-avisos/:id (admin, rector, coordinador)",
    sinonimos: [
      "editar una regla de aviso",
      "cambiar la hora de un aviso automático",
      "desactivar una regla de aviso",
      "pausar un aviso automático",
    ],
    pasos: [
      ...llegarAHorariosAvisos(),
      {
        narracion:
          "Busca la fila de la regla en 'Reglas configuradas': todo se edita ahí mismo, sin abrir nada.",
        accion: "explicar",
      },
      {
        narracion:
          "Corrige la hora (HH:MM), marca o desmarca las casillas de destinatarios, o usa el interruptor para activar o desactivar la regla.",
        accion: "escribir",
        ancla: "avisos.fila_hora",
        campo: "hora",
      },
      {
        narracion: "Listo: los cambios se guardan solos al salir del campo.",
        accion: "explicar",
      },
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
      ...llegarAHorariosAvisos(),
      {
        narracion:
          "Toca la caneca roja de la regla que quieres borrar y confirma en el aviso del navegador.",
        accion: "click",
        ancla: "avisos.regla_eliminar",
      },
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
        narracion: "Toca una misión y sigue los retos a tu ritmo. Listo.",
        accion: "explicar",
      },
    ],
  },
];
