// Catálogo "Normi te guía" — Módulo ENTREVISTAS (Solicitud de Entrevista, lado staff).
//
// Página: /solicitud-entrevista-staff (SolicitudEntrevistaStaff.tsx). El interno
// cita a un acudiente a una entrevista, la reenvía, la edita, marca si asistirá
// y ve el calendario de las que creó o en las que es entrevistador.
// CRUD sobre Solicitudes_Entrevista via dbProxy (insert/update = ALL_ROLES) y
// reprogramación de fecha/hora. La tarjeta aparece para todo el staff con
// dashboard salvo portero.
//
// OJO: al llegar a la ruta se muestra un MENÚ de dos fichas (Crear solicitud /
// Solicitudes creadas); el calendario solo existe dentro de Solicitudes creadas.

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

// Pasos compartidos para llegar a la solicitud dentro del calendario:
// ficha "Solicitudes creadas" → día del calendario → ficha del estudiante.
const abrirSolicitudEnCalendario = (queSolicitud: string) =>
  [
    {
      narracion: "Entramos a Solicitud de Entrevista.",
      accion: "navegar" as const,
      ruta: "/solicitud-entrevista-staff",
    },
    {
      narracion: "Toca 'Solicitudes creadas'.",
      accion: "click" as const,
      ancla: "entrevistas.ficha_creadas",
    },
    {
      narracion: "Toca en el calendario el día de la entrevista.",
      accion: "click" as const,
      ancla: "entrevistas.calendario_dia",
    },
    {
      narracion: `Toca la ficha del estudiante para desplegar ${queSolicitud}.`,
      accion: "click" as const,
      ancla: "entrevistas.ficha_solicitud",
    },
  ];

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
        narracion: "Toca 'Solicitudes creadas'.",
        accion: "click",
        ancla: "entrevistas.ficha_creadas",
      },
      {
        narracion:
          "En el calendario, los días con entrevista salen marcados (naranja si la creaste, azul si eres entrevistador, diagonal si el día tiene de ambos; abajo está la leyenda de colores). Toca un día para ver sus entrevistas.",
        accion: "click",
        ancla: "entrevistas.calendario_dia",
      },
    ],
  },
  {
    id: "entrevistas.crear",
    titulo: "Crear una solicitud de entrevista",
    descripcion:
      "Citar al acudiente de un estudiante a una entrevista, con fecha, hora, entrevistadores, mensaje y firma.",
    categoria: "Entrevistas",
    roles: [...STAFF_ENTREVISTAS],
    ruta: "/solicitud-entrevista-staff",
    endpoint: "POST /api/db (Solicitudes_Entrevista insert)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante cuyo acudiente será citado." },
      { entidad: "grado", descripcion: "Grado del estudiante." },
      { entidad: "salon", descripcion: "Salón del estudiante." },
    ],
    sinonimos: [
      "crear una entrevista",
      "citar a un acudiente",
      "citar a los padres de un estudiante",
      "hacer una citación a un acudiente",
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
        narracion: "Elige el 'Grado:' del estudiante.",
        accion: "seleccionar",
        ancla: "entrevistas.select_grado",
        campo: "grado",
      },
      {
        narracion: "Ahora el 'Salón:'.",
        accion: "seleccionar",
        ancla: "entrevistas.select_salon",
        campo: "salon",
      },
      {
        narracion:
          "En el desplegable que dice Agregar estudiante, elige al estudiante. Puedes agregar varios: a cada acudiente le llega su propia citación.",
        accion: "seleccionar",
        ancla: "entrevistas.select_estudiante",
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
        narracion:
          "Elige el cargo y el nombre de cada entrevistador y presiona 'Agregar'. Agrégate a ti también si vas a estar en la entrevista.",
        accion: "seleccionar",
        ancla: "entrevistas.entrevistadores",
        campo: "entrevistadores",
      },
      {
        narracion: "Escribe el mensaje para el acudiente.",
        accion: "escribir",
        ancla: "entrevistas.mensaje",
        campo: "mensaje",
        opcional: true,
      },
      {
        narracion: "Dibuja tu firma en el recuadro 'Firma del solicitante'.",
        accion: "escribir",
        ancla: "entrevistas.firma",
        campo: "firma",
      },
      {
        narracion: "Toca 'Solicitar Entrevista'.",
        accion: "click",
        ancla: "entrevistas.boton_solicitar",
      },
      {
        narracion: "Y confirma en 'Sí, solicitar'.",
        accion: "click",
        ancla: "entrevistas.confirmar_crear",
      },
    ],
  },
  {
    id: "entrevistas.reenviar",
    titulo: "Reenviar la citación de una entrevista",
    descripcion:
      "Reprogramar y volver a enviar por WhatsApp la citación al acudiente (solo si aún no confirmó que asistirá; el estado vuelve a Pendiente).",
    categoria: "Entrevistas",
    roles: [...STAFF_ENTREVISTAS],
    ruta: "/solicitud-entrevista-staff",
    sinonimos: [
      "reenviar la citación",
      "volver a mandar la entrevista",
      "recordar la entrevista al acudiente",
      "reprogramar la cita de la entrevista",
    ],
    pasos: [
      ...abrirSolicitudEnCalendario("la solicitud"),
      {
        narracion: "Toca 'Reprogramar cita'.",
        accion: "click",
        ancla: "entrevistas.boton_reenviar",
      },
      {
        narracion: "Elige la nueva fecha de la entrevista.",
        accion: "seleccionar",
        ancla: "entrevistas.reenviar_fecha",
        campo: "fecha",
      },
      {
        narracion: "Y la nueva hora.",
        accion: "seleccionar",
        ancla: "entrevistas.reenviar_hora",
        campo: "hora",
      },
      {
        narracion: "Confirma en 'Reenviar citación'.",
        accion: "click",
        ancla: "entrevistas.reenviar_confirmar",
      },
    ],
  },
  {
    id: "entrevistas.editar",
    titulo: "Editar una entrevista",
    descripcion:
      "Cambiar la fecha, la hora, los entrevistadores o el mensaje de una entrevista que tú creaste (solo el creador puede editarla).",
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
      ...abrirSolicitudEnCalendario("la solicitud que vas a cambiar"),
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
      ...abrirSolicitudEnCalendario("la solicitud"),
      {
        narracion:
          "Bajo Confirmar asistencia, toca el botón verde Asistirá o el rojo No asistirá, según el caso. Si vuelves a tocar el mismo, regresa a Pendiente.",
        accion: "click",
        ancla: "entrevistas.marcar_estado",
      },
    ],
  },
];
