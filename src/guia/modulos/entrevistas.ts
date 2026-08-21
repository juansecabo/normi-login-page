// Catálogo "Normi te guía" — Módulo ENTREVISTAS (Solicitud de Entrevista, lado staff).
//
// Página: /solicitud-entrevista-staff (SolicitudEntrevistaStaff.tsx). El interno
// cita a un acudiente a una entrevista, la reenvía, la edita, marca si asistirá
// y ve el calendario de las que creó o en las que es entrevistador.
// CRUD sobre Solicitudes_Entrevista via dbProxy (insert/update = ALL_ROLES) y
// reprogramación de fecha/hora. La tarjeta aparece para todo el staff con
// dashboard salvo portero.

import type { Capacidad } from "../tipos";

// Staff que ve la tarjeta "Solicitud de Entrevista" (sin portero).
const STAFF_ENTREVISTAS = [
  "profesor",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "admin",
] as const;

export const ENTREVISTAS: Capacidad[] = [
  {
    id: "entrevistas.ver_calendario",
    titulo: "Ver el calendario de entrevistas",
    descripcion:
      "Ver en calendario las entrevistas que creaste y en las que eres entrevistador, por día.",
    categoria: "Entrevistas",
    roles: [...STAFF_ENTREVISTAS],
    ruta: "/solicitud-entrevista-staff",
    endpoint: "POST /api/db (Solicitudes_Entrevista select)",
    sinonimos: [
      "ver mis entrevistas",
      "el calendario de entrevistas",
      "qué entrevistas tengo",
      "ver las solicitudes de entrevista creadas",
    ],
    pasos: [
      {
        narracion: "Entramos a Solicitud de Entrevista.",
        accion: "navegar",
        ruta: "/solicitud-entrevista-staff",
      },
      {
        narracion:
          "En el calendario, los días con entrevista salen marcados (naranja si la creaste, violeta si eres entrevistador, diagonal si el día tiene de ambos). Toca un día para ver sus entrevistas.",
        accion: "click",
        ancla: "entrevistas.calendario_dia",
      },
    ],
  },
  {
    id: "entrevistas.crear",
    titulo: "Crear una solicitud de entrevista",
    descripcion:
      "Citar al acudiente de un estudiante a una entrevista, con fecha, hora, entrevistadores y mensaje.",
    categoria: "Entrevistas",
    roles: [...STAFF_ENTREVISTAS],
    ruta: "/solicitud-entrevista-staff",
    endpoint: "POST /api/db (Solicitudes_Entrevista insert)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante cuyo acudiente será citado." },
    ],
    sinonimos: [
      "crear una entrevista",
      "citar a un acudiente",
      "agendar una entrevista con un papá",
      "solicitar una entrevista",
      "programar una reunión con un acudiente",
    ],
    pasos: [
      {
        narracion: "Entramos a Solicitud de Entrevista.",
        accion: "navegar",
        ruta: "/solicitud-entrevista-staff",
      },
      {
        narracion: "Toca 'Crear solicitud'.",
        accion: "click",
        ancla: "entrevistas.boton_crear",
      },
      {
        narracion: "Busca y elige al estudiante.",
        accion: "escribir",
        ancla: "entrevistas.buscar_estudiante",
        campo: "estudiante",
      },
      {
        narracion: "Elige la fecha de la entrevista.",
        accion: "seleccionar",
        ancla: "entrevistas.fecha",
        campo: "fecha",
      },
      {
        narracion: "Pon la hora.",
        accion: "seleccionar",
        ancla: "entrevistas.hora",
        campo: "hora",
      },
      {
        narracion: "Agrega a los entrevistadores (además de ti, si va alguien más).",
        accion: "seleccionar",
        ancla: "entrevistas.entrevistadores",
        campo: "entrevistadores",
        opcional: true,
      },
      {
        narracion: "Escribe el mensaje para el acudiente.",
        accion: "escribir",
        ancla: "entrevistas.mensaje",
        campo: "mensaje",
        opcional: true,
      },
      {
        narracion: "Envía y confirma en 'Confirmar solicitud'.",
        accion: "click",
        ancla: "entrevistas.confirmar_crear",
      },
    ],
  },
  {
    id: "entrevistas.reenviar",
    titulo: "Reenviar la citación de una entrevista",
    descripcion: "Volver a enviar por WhatsApp la citación de una entrevista al acudiente.",
    categoria: "Entrevistas",
    roles: [...STAFF_ENTREVISTAS],
    ruta: "/solicitud-entrevista-staff",
    sinonimos: [
      "reenviar la citación",
      "volver a mandar la entrevista",
      "recordar la entrevista al acudiente",
    ],
    pasos: [
      {
        narracion: "Entramos a Solicitud de Entrevista.",
        accion: "navegar",
        ruta: "/solicitud-entrevista-staff",
      },
      {
        narracion: "Abre el día de la entrevista y despliega la solicitud.",
        accion: "click",
        ancla: "entrevistas.calendario_dia",
      },
      {
        narracion: "Toca 'Reenviar citación'.",
        accion: "click",
        ancla: "entrevistas.boton_reenviar",
      },
    ],
  },
  {
    id: "entrevistas.editar",
    titulo: "Editar una entrevista",
    descripcion:
      "Cambiar la fecha, la hora, los entrevistadores o el mensaje de una entrevista ya creada.",
    categoria: "Entrevistas",
    roles: [...STAFF_ENTREVISTAS],
    ruta: "/solicitud-entrevista-staff",
    endpoint: "POST /api/db (Solicitudes_Entrevista update) / reprogramación de fecha-hora",
    sinonimos: [
      "editar una entrevista",
      "cambiar la fecha de una entrevista",
      "reprogramar una entrevista",
      "cambiar los entrevistadores",
      "corregir el mensaje de la entrevista",
    ],
    pasos: [
      {
        narracion: "Entramos a Solicitud de Entrevista.",
        accion: "navegar",
        ruta: "/solicitud-entrevista-staff",
      },
      {
        narracion: "Abre el día y despliega la solicitud que vas a cambiar.",
        accion: "click",
        ancla: "entrevistas.calendario_dia",
      },
      {
        narracion: "Toca 'Editar solicitud'.",
        accion: "click",
        ancla: "entrevistas.boton_editar",
      },
      {
        narracion: "Ajusta lo que necesites (fecha, hora, entrevistadores o mensaje).",
        accion: "seleccionar",
        ancla: "entrevistas.editar_fecha",
        campo: "fecha",
      },
      {
        narracion: "Guarda los cambios.",
        accion: "click",
        ancla: "entrevistas.editar_guardar",
      },
    ],
  },
  {
    id: "entrevistas.marcar_asistencia",
    titulo: "Marcar si el acudiente asistirá",
    descripcion:
      "Fijar el estado de una entrevista (Asistirá / No asistirá) por si el acudiente avisó por otro medio.",
    categoria: "Entrevistas",
    roles: [...STAFF_ENTREVISTAS],
    ruta: "/solicitud-entrevista-staff",
    endpoint: "POST /api/db (Solicitudes_Entrevista update — confirmado)",
    sinonimos: [
      "marcar que el acudiente asistirá",
      "poner que no va a venir",
      "confirmar la asistencia de la entrevista",
    ],
    pasos: [
      {
        narracion: "Entramos a Solicitud de Entrevista.",
        accion: "navegar",
        ruta: "/solicitud-entrevista-staff",
      },
      {
        narracion: "Abre el día y despliega la solicitud.",
        accion: "click",
        ancla: "entrevistas.calendario_dia",
      },
      {
        narracion:
          "Marca 'Asistirá' o 'No asistirá'. Si vuelves a tocar el mismo, regresa a 'Pendiente'.",
        accion: "click",
        ancla: "entrevistas.marcar_estado",
      },
    ],
  },
];
