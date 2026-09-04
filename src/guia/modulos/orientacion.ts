// Catálogo "Normi te guía" — Módulo ORIENTACIÓN (orientación escolar).
//
// Cubre las cinco páginas de src/pages/orientador:
//   - Casos.tsx            → /orientador/casos        (lista + crear caso)
//   - CasoDetalle.tsx      → /orientador/casos/:id    (detalle: editar, diagnóstico,
//                                                       firmas, estado, seguimientos, Word)
//   - Citas.tsx            → /orientador/citas        (agendar/consultar/eliminar citas)
//   - RemitirOrientacion   → /remitir-orientacion     (crear remisión, Formato 005)
//   - RemisionesOrientacion→ /orientador/remisiones   (bandeja: recibir, Word, agendar)
//
// Guards (fuente de verdad = backend / gates de las páginas):
//   - Casos y Citas (crear/gestionar): [orientador, admin].
//       OJO: el gate de la UI de Casos/CasoDetalle es más amplio (deja entrar a
//       cualquier interno con dashboard vía puedeAccederDashboard); las escrituras
//       van por el cliente Supabase con RLS. Nos ceñimos al guard [orientador, admin]
//       y lo dejamos anotado. El gate de Citas SÍ es estricto [orientador, admin].
//   - Remitir a orientación (crear remisión): ALL_INTERNOS (gate isProfesor ||
//       puedeAccederDashboard). Estudiantes y acudientes quedan bloqueados.
//   - Remisiones recibidas (bandeja + marcar recibida): [orientador, admin].

import type { Capacidad } from "../tipos";

// Orientación: crear/gestionar casos, diagnósticos, seguimientos y citas.
const ORIENTADOR_ADMIN = ["orientador", "admin"] as const;
// Todos los internos con dashboard (pueden remitir a orientación).
const ALL_INTERNOS = [
  "profesor",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "portero",
  "admin",
] as const;

// Pasos compartidos para llegar al detalle de un caso concreto.
const abrirDetalleCaso = () =>
  [
    {
      narracion: "Entramos a los Casos de Seguimiento de orientación.",
      accion: "navegar" as const,
      ruta: "/orientador/casos",
    },
    {
      narracion:
        "Busca el estudiante por su nombre o número de identificación (también puedes filtrar por grado, salón o estado).",
      accion: "escribir" as const,
      ancla: "orientacion.casos_buscador",
      campo: "estudiante",
    },
    {
      narracion: "Toca la tarjeta del caso para abrir su detalle.",
      accion: "click" as const,
      ancla: "orientacion.caso_item",
    },
    {
      narracion: "Esperamos a que cargue el registro completo del caso.",
      accion: "esperar" as const,
      ancla: "orientacion.caso_detalle",
    },
  ];

export const ORIENTACION: Capacidad[] = [
  // ── Casos: lista y creación ────────────────────────────────────────────
  {
    id: "orientacion.consultar_casos",
    titulo: "Consultar los casos de seguimiento",
    descripcion:
      "Abrir la lista de casos de orientación y filtrarla por estado, grado, salón, diagnóstico o buscar por estudiante.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos",
    endpoint: "Supabase select Casos_Orientacion (RLS por colegio)",
    sinonimos: [
      "ver los casos de orientación",
      "consultar casos de seguimiento",
      "buscar un caso de un estudiante",
      "abrir la lista de casos",
      "filtrar casos por grado o salón",
      "casos con diagnóstico",
    ],
    pasos: [
      {
        narracion: "Entramos a los Casos de Seguimiento.",
        accion: "navegar",
        ruta: "/orientador/casos",
      },
      {
        narracion:
          "Escribe el nombre del estudiante o su número de identificación en el buscador.",
        accion: "escribir",
        ancla: "orientacion.casos_buscador",
        campo: "estudiante",
        opcional: true,
      },
      {
        narracion: "Si quieres, filtra por estado (abierto o cerrado).",
        accion: "seleccionar",
        ancla: "orientacion.casos_filtro_estado",
        campo: "estado",
        opcional: true,
      },
      {
        narracion: "También puedes filtrar por grado.",
        accion: "seleccionar",
        ancla: "orientacion.casos_filtro_grado",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Y por salón.",
        accion: "seleccionar",
        ancla: "orientacion.casos_filtro_salon",
        campo: "salon",
        opcional: true,
      },
      {
        narracion:
          "Marca 'Solo con diagnóstico' si quieres ver únicamente los casos que tienen un diagnóstico registrado.",
        accion: "click",
        ancla: "orientacion.casos_filtro_diagnostico",
        opcional: true,
      },
      {
        narracion: "Toca una tarjeta para abrir el detalle de ese caso.",
        accion: "click",
        ancla: "orientacion.caso_item",
        opcional: true,
      },
    ],
  },
  {
    id: "orientacion.crear_caso",
    titulo: "Crear un caso de seguimiento",
    descripcion:
      "Abrir un registro acumulativo de orientación para un estudiante (datos biográficos, motivo, datos familiares, situación, intervención y compromisos).",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos",
    endpoint: "Supabase insert Casos_Orientacion (RLS por colegio)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante al que se le abre el caso." },
    ],
    sinonimos: [
      "crear un caso",
      "abrir un caso de seguimiento",
      "registrar un caso de orientación",
      "nuevo caso de un estudiante",
      "abrir registro acumulativo",
    ],
    pasos: [
      {
        narracion: "Entramos a los Casos de Seguimiento.",
        accion: "navegar",
        ruta: "/orientador/casos",
      },
      {
        narracion: "Toca 'Nuevo caso' para abrir el registro acumulativo.",
        accion: "click",
        ancla: "orientacion.casos_nuevo",
      },
      {
        narracion: "Busca y selecciona al estudiante del caso.",
        accion: "escribir",
        ancla: "orientacion.caso_estudiante_buscador",
        campo: "estudiante",
      },
      {
        narracion: "Elige al estudiante en la lista de resultados.",
        accion: "click",
        ancla: "orientacion.caso_estudiante_opcion",
      },
      {
        narracion: "Confirma o ajusta la fecha de apertura (viene con la de hoy).",
        accion: "escribir",
        ancla: "orientacion.caso_fecha_apertura",
        campo: "fecha",
        opcional: true,
      },
      {
        narracion: "Toca la sección 'Motivo de la atención' para abrirla.",
        accion: "click",
        ancla: "orientacion.caso_motivo_seccion",
      },
      {
        narracion:
          "Describe en el cuadro por qué se abre el caso (es el único campo obligatorio).",
        accion: "escribir",
        ancla: "orientacion.caso_motivo",
        campo: "motivo_atencion",
      },
      {
        narracion:
          "Las demás secciones (datos biográficos, datos familiares, situación reportada, intervención y compromisos) son opcionales; llénalas si tienes la información.",
        accion: "explicar",
        opcional: true,
      },
      {
        narracion: "Toca 'Guardar caso'; te llevará directo a su detalle.",
        accion: "click",
        ancla: "orientacion.caso_guardar",
      },
    ],
  },

  // ── Caso: detalle ──────────────────────────────────────────────────────
  {
    id: "orientacion.editar_caso",
    titulo: "Editar un caso de seguimiento",
    descripcion:
      "Modificar los datos del registro acumulativo de un caso (biográficos, familiares, motivo, situación, intervención o compromisos).",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos/:id",
    endpoint: "Supabase update Casos_Orientacion (RLS por colegio)",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante del caso a editar." }],
    sinonimos: [
      "editar un caso",
      "corregir datos de un caso",
      "actualizar el registro acumulativo",
      "cambiar el motivo de atención de un caso",
    ],
    pasos: [
      ...abrirDetalleCaso(),
      {
        narracion: "Toca 'Editar' para abrir el registro del caso.",
        accion: "click",
        ancla: "orientacion.caso_editar",
      },
      {
        narracion: "Ajusta los campos que necesites en las distintas secciones.",
        accion: "escribir",
        ancla: "orientacion.caso_motivo",
        campo: "motivo_atencion",
      },
      {
        narracion: "Toca 'Guardar cambios'.",
        accion: "click",
        ancla: "orientacion.caso_guardar",
      },
    ],
  },
  {
    id: "orientacion.cambiar_estado_caso",
    titulo: "Abrir o cerrar un caso",
    descripcion: "Cambiar el estado de un caso entre abierto y cerrado.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos/:id",
    endpoint: "Supabase update Casos_Orientacion (estado/fecha_cierre)",
    sinonimos: [
      "cerrar un caso",
      "reabrir un caso",
      "marcar un caso como cerrado",
      "cambiar el estado de un caso",
    ],
    pasos: [
      ...abrirDetalleCaso(),
      {
        narracion:
          "Baja hasta 'Cambiar estado' y toca el botón del estado que quieres dejar (Cerrado, o Abierto si estaba cerrado).",
        accion: "click",
        ancla: "orientacion.caso_cambiar_estado",
      },
      {
        narracion:
          "Al cerrar se guarda la fecha de cierre; al reabrir esa fecha se borra. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "orientacion.diagnostico_caso",
    titulo: "Registrar o editar el diagnóstico de un caso",
    descripcion:
      "Agregar o cambiar el diagnóstico del estudiante (tipo, descripción, fecha y archivo adjunto).",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos/:id",
    endpoint: "Supabase update Casos_Orientacion (tipo_diagnostico, diagnostico_*)",
    sinonimos: [
      "agregar un diagnóstico",
      "registrar diagnóstico de un estudiante",
      "editar el diagnóstico de un caso",
      "subir el soporte del diagnóstico",
      "poner que el estudiante tiene TDAH o dislexia",
    ],
    pasos: [
      ...abrirDetalleCaso(),
      {
        narracion:
          "Baja hasta el título Diagnóstico y toca el botón que está a su derecha (dice Agregar, o Editar si ya hay uno).",
        accion: "click",
        ancla: "orientacion.caso_diagnostico_abrir",
      },
      {
        narracion: "Escribe el tipo de diagnóstico (por ejemplo, TDAH o dislexia).",
        accion: "escribir",
        ancla: "orientacion.diagnostico_tipo",
        campo: "tipo_diagnostico",
      },
      {
        narracion: "Agrega una descripción con los detalles.",
        accion: "escribir",
        ancla: "orientacion.diagnostico_descripcion",
        campo: "descripcion",
        opcional: true,
      },
      {
        narracion: "Ajusta la fecha del diagnóstico si hace falta.",
        accion: "escribir",
        ancla: "orientacion.diagnostico_fecha",
        campo: "fecha",
        opcional: true,
      },
      {
        narracion: "Si tienes el soporte (imagen o PDF), adjúntalo.",
        accion: "click",
        ancla: "orientacion.diagnostico_adjunto",
        opcional: true,
      },
      {
        narracion: "Guarda el diagnóstico.",
        accion: "click",
        ancla: "orientacion.diagnostico_guardar",
      },
    ],
  },
  {
    id: "orientacion.firmar_caso",
    titulo: "Firmar un caso (orientador o estudiante)",
    descripcion:
      "Capturar la firma del orientador y/o del estudiante en el caso; el orientador puede reutilizar su firma guardada.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos/:id",
    endpoint: "Supabase Storage upload + update Casos_Orientacion (firma_*_url)",
    sinonimos: [
      "firmar el caso",
      "poner la firma del orientador",
      "firma del estudiante en el caso",
      "usar la firma guardada",
      "borrar una firma del caso",
    ],
    pasos: [
      ...abrirDetalleCaso(),
      {
        narracion:
          "Baja a la sección de Firmas y dibuja la firma en el recuadro del orientador o en el del estudiante, con el mouse o el dedo.",
        accion: "explicar",
      },
      {
        narracion:
          "Si eres orientador y tienes firma guardada en tu institución, puedes tocar 'Usar firma guardada' en vez de dibujar.",
        accion: "click",
        ancla: "orientacion.caso_firma_usar_guardada",
        opcional: true,
      },
      {
        narracion: "Toca el botón 'Guardar firma' que está debajo del recuadro donde dibujaste.",
        accion: "click",
        ancla: "orientacion.caso_firma_guardar",
      },
      {
        narracion:
          "Para reemplazarla más adelante, usa el ícono de la papelera junto a la firma guardada y confirma.",
        accion: "explicar",
        opcional: true,
      },
    ],
  },
  {
    id: "orientacion.agregar_seguimiento",
    titulo: "Agregar un seguimiento a un caso",
    descripcion:
      "Registrar una sesión de seguimiento con fecha, anotación, observaciones y archivos adjuntos.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos/:id",
    endpoint: "Supabase update Casos_Orientacion (seguimientos jsonb)",
    sinonimos: [
      "agregar un seguimiento",
      "registrar una sesión de seguimiento",
      "anotar un seguimiento en el caso",
      "formato de seguimiento",
    ],
    pasos: [
      ...abrirDetalleCaso(),
      {
        narracion: "Toca 'Agregar seguimiento', en la sección de seguimientos.",
        accion: "click",
        ancla: "orientacion.seguimiento_agregar",
      },
      {
        narracion: "La fecha viene con el día de hoy; ajústala si la sesión fue otro día.",
        accion: "escribir",
        ancla: "orientacion.seguimiento_fecha",
        campo: "fecha",
        opcional: true,
      },
      {
        narracion: "Escribe la anotación (el tema tratado en la sesión). Es obligatoria.",
        accion: "escribir",
        ancla: "orientacion.seguimiento_anotacion",
        campo: "anotacion",
      },
      {
        narracion: "Agrega observaciones, conclusiones o compromisos si los hay.",
        accion: "escribir",
        ancla: "orientacion.seguimiento_observaciones",
        campo: "observaciones",
        opcional: true,
      },
      {
        narracion: "Adjunta imágenes o PDF de soporte si los tienes.",
        accion: "click",
        ancla: "orientacion.seguimiento_adjunto",
        opcional: true,
      },
      {
        narracion: "Toca 'Registrar seguimiento' para guardarlo.",
        accion: "click",
        ancla: "orientacion.seguimiento_guardar",
      },
    ],
  },
  {
    id: "orientacion.editar_seguimiento",
    titulo: "Editar un seguimiento",
    descripcion: "Cambiar la fecha, anotación, observaciones o adjuntos de un seguimiento existente.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos/:id",
    endpoint: "Supabase update Casos_Orientacion (seguimientos jsonb)",
    sinonimos: [
      "editar un seguimiento",
      "corregir una anotación de seguimiento",
      "cambiar un seguimiento del caso",
    ],
    pasos: [
      ...abrirDetalleCaso(),
      {
        narracion:
          "En la lista de seguimientos, toca el ícono del lápiz del seguimiento que quieres cambiar.",
        accion: "click",
        ancla: "orientacion.seguimiento_editar",
      },
      {
        narracion: "Ajusta la anotación, las observaciones, la fecha o los adjuntos.",
        accion: "escribir",
        ancla: "orientacion.seguimiento_anotacion",
        campo: "anotacion",
      },
      {
        narracion: "Toca 'Guardar cambios'.",
        accion: "click",
        ancla: "orientacion.seguimiento_guardar",
      },
    ],
  },
  {
    id: "orientacion.eliminar_seguimiento",
    titulo: "Eliminar un seguimiento",
    descripcion: "Borrar un seguimiento de un caso.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos/:id",
    endpoint: "Supabase update Casos_Orientacion (seguimientos jsonb)",
    sinonimos: [
      "eliminar un seguimiento",
      "borrar un seguimiento del caso",
      "quitar una anotación de seguimiento",
    ],
    pasos: [
      ...abrirDetalleCaso(),
      {
        narracion:
          "En el seguimiento que quieres borrar, toca el ícono de la papelera.",
        accion: "click",
        ancla: "orientacion.seguimiento_eliminar",
      },
      {
        narracion: "Confirma la eliminación. Esta acción no se puede deshacer.",
        accion: "click",
        ancla: "orientacion.seguimiento_eliminar_confirmar",
      },
    ],
  },
  {
    id: "orientacion.notificar_seguimiento",
    titulo: "Notificar un seguimiento por WhatsApp",
    descripcion:
      "Enviar el texto de un seguimiento por WhatsApp al acudiente, coordinador del nivel, rector y director de grupo del estudiante.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos/:id",
    endpoint: "POST /api/orientacion/notificar-seguimiento",
    sinonimos: [
      "notificar un seguimiento",
      "avisar el seguimiento por whatsapp",
      "mandar el seguimiento al acudiente y coordinador",
    ],
    pasos: [
      ...abrirDetalleCaso(),
      {
        narracion:
          "En el seguimiento que quieres notificar, toca el ícono de enviar (el avioncito).",
        accion: "click",
        ancla: "orientacion.seguimiento_notificar",
      },
      {
        narracion:
          "Confirma. Se enviará por WhatsApp al acudiente, al coordinador del nivel, al rector y al director de grupo del estudiante.",
        accion: "click",
        ancla: "orientacion.seguimiento_notificar_confirmar",
      },
    ],
  },
  {
    id: "orientacion.descargar_caso_word",
    titulo: "Descargar un caso en Word",
    descripcion:
      "Exportar el registro acumulativo del caso (con seguimientos y firmas) a un documento de Word.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos/:id",
    sinonimos: [
      "descargar el caso en word",
      "exportar el caso a word",
      "sacar el registro del caso en documento",
      "bajar el caso de orientación",
    ],
    pasos: [
      ...abrirDetalleCaso(),
      {
        narracion: "Toca 'Descargar Word' en la parte superior del caso.",
        accion: "click",
        ancla: "orientacion.caso_descargar_word",
      },
      {
        narracion: "El documento se descarga a tu dispositivo. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "orientacion.eliminar_caso",
    titulo: "Eliminar un caso de seguimiento",
    descripcion:
      "Borrar por completo un caso y todos sus seguimientos asociados. No se puede deshacer.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/casos/:id",
    endpoint: "Supabase delete Casos_Orientacion (RLS por colegio)",
    sinonimos: [
      "eliminar un caso",
      "borrar un caso de orientación",
      "quitar un caso de seguimiento",
    ],
    pasos: [
      ...abrirDetalleCaso(),
      {
        narracion: "Toca 'Eliminar' en la parte superior del caso.",
        accion: "click",
        ancla: "orientacion.caso_eliminar",
      },
      {
        narracion:
          "Confirma la eliminación. Se borrará el registro y todos sus seguimientos.",
        accion: "click",
        ancla: "orientacion.caso_eliminar_confirmar",
      },
    ],
  },

  // ── Citas ──────────────────────────────────────────────────────────────
  {
    id: "orientacion.consultar_citas",
    titulo: "Consultar las citas de orientación",
    descripcion:
      "Ver el calendario de citas, seleccionar un día y revisar las citas agendadas (filtrando por grado o salón).",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/citas",
    endpoint: "Supabase select Citas_Orientacion (RLS por colegio)",
    sinonimos: [
      "ver las citas",
      "consultar el calendario de citas",
      "qué citas hay este día",
      "revisar citas de orientación",
      "citas agendadas",
    ],
    pasos: [
      {
        narracion: "Entramos a Citas y Atención.",
        accion: "navegar",
        ruta: "/orientador/citas",
      },
      {
        narracion:
          "Si quieres, filtra por grado y salón. Los días con citas se resaltan en violeta en el calendario.",
        accion: "seleccionar",
        ancla: "orientacion.citas_filtro_grado",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Toca un día en el calendario para ver sus citas.",
        accion: "click",
        ancla: "orientacion.citas_calendario",
        campo: "fecha",
      },
      {
        narracion:
          "Toca una cita del panel lateral para desplegar su motivo y conclusiones.",
        accion: "click",
        ancla: "orientacion.cita_item",
        opcional: true,
      },
    ],
  },
  {
    id: "orientacion.agendar_cita",
    titulo: "Agendar una cita de orientación",
    descripcion:
      "Programar una cita con un estudiante y/o sus acudientes; se notifica por WhatsApp a quienes elijas informar.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/citas",
    endpoint: "Supabase insert Citas_Orientacion + POST /api/comunicados/enviar",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante citado." },
      { entidad: "fecha", descripcion: "Día de la cita." },
    ],
    sinonimos: [
      "agendar una cita",
      "programar una cita de orientación",
      "citar a un estudiante",
      "citar a los acudientes",
      "crear una cita",
    ],
    pasos: [
      {
        narracion: "Entramos a Citas y Atención.",
        accion: "navegar",
        ruta: "/orientador/citas",
      },
      {
        narracion: "Toca 'Agendar cita'.",
        accion: "click",
        ancla: "orientacion.citas_agendar",
      },
      {
        narracion: "Busca y selecciona al estudiante.",
        accion: "escribir",
        ancla: "orientacion.cita_estudiante_buscador",
        campo: "estudiante",
      },
      {
        narracion: "Elige al estudiante en la lista.",
        accion: "click",
        ancla: "orientacion.cita_estudiante_opcion",
      },
      {
        narracion: "Elige la fecha de la cita en el calendario.",
        accion: "seleccionar",
        ancla: "orientacion.cita_fecha",
        campo: "fecha",
      },
      {
        narracion: "Si quieres, define la hora (hora, minutos y AM o PM).",
        accion: "seleccionar",
        ancla: "orientacion.cita_hora",
        campo: "hora",
        opcional: true,
      },
      {
        narracion:
          "En 'Informar a', marca a quién se le avisa: al estudiante, a los acudientes, o a ambos. Es obligatorio elegir al menos uno.",
        accion: "click",
        ancla: "orientacion.cita_informar_a",
        campo: "asistentes",
      },
      {
        narracion: "Escribe el motivo de la cita.",
        accion: "escribir",
        ancla: "orientacion.cita_motivo",
        campo: "motivo",
      },
      {
        narracion:
          "Toca 'Agendar'. Se guarda la cita y se envía el aviso por WhatsApp a los que marcaste.",
        accion: "click",
        ancla: "orientacion.cita_guardar",
      },
    ],
  },
  {
    id: "orientacion.eliminar_cita",
    titulo: "Eliminar una cita",
    descripcion: "Borrar una cita agendada del calendario.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/citas",
    endpoint: "Supabase delete Citas_Orientacion (RLS por colegio)",
    sinonimos: [
      "eliminar una cita",
      "borrar una cita",
      "cancelar una cita agendada",
      "quitar una cita del calendario",
    ],
    pasos: [
      {
        narracion: "Entramos a Citas y Atención.",
        accion: "navegar",
        ruta: "/orientador/citas",
      },
      {
        narracion: "Selecciona en el calendario el día de la cita.",
        accion: "click",
        ancla: "orientacion.citas_calendario",
        campo: "fecha",
      },
      {
        narracion:
          "En la cita que quieres borrar, toca el ícono de la papelera al costado.",
        accion: "click",
        ancla: "orientacion.cita_eliminar",
      },
      {
        narracion: "Confirma la eliminación. Esta acción no se puede deshacer.",
        accion: "click",
        ancla: "orientacion.cita_eliminar_confirmar",
      },
    ],
  },

  // ── Remitir a orientación (Formato 005) ────────────────────────────────
  {
    id: "orientacion.remitir",
    titulo: "Remitir un estudiante a orientación",
    descripcion:
      "Crear una remisión (Formato 005) hacia orientación, director de grupo o coordinador, con motivo, conducta, medidas previas y firma.",
    categoria: "Orientación",
    roles: [...ALL_INTERNOS],
    ruta: "/remitir-orientacion",
    endpoint: "Supabase insert Remisiones_Orientacion + notifyOrientadora / notifyRectorCoord",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante que se remite." },
    ],
    sinonimos: [
      "remitir a orientación",
      "remitir a la psicóloga",
      "mandar a psicoorientación",
      "hacer una remisión",
      "remitir un estudiante",
      "formato 005",
      "enviar un caso a orientación escolar",
      "remitir al director de grupo o coordinador",
    ],
    pasos: [
      {
        narracion: "Abrimos Orientación Escolar y tocamos el botón verde 'Nueva remisión' (arriba a la derecha) para llegar al formulario.",
        accion: "navegar",
        ruta: "/remitir-orientacion",
      },
      {
        narracion:
          "Busca al estudiante por su nombre (puedes filtrar antes por grado y salón). Si eres profesor, solo aparecen tus estudiantes.",
        accion: "escribir",
        ancla: "orientacion.remitir_estudiante_buscador",
        campo: "estudiante",
      },
      {
        narracion: "Selecciona al estudiante en la lista.",
        accion: "click",
        ancla: "orientacion.remitir_estudiante_opcion",
      },
      {
        narracion:
          "Elige el tipo de documento de identidad del estudiante (RC, TI o CC).",
        accion: "click",
        ancla: "orientacion.remitir_tipo_documento",
        campo: "tipo_documento",
        opcional: true,
      },
      {
        narracion:
          "En 'Remitir a', elige el destino: Orientación Escolar, Director de grupo o Coordinador.",
        accion: "click",
        ancla: "orientacion.remitir_destino",
        campo: "destino",
      },
      {
        narracion: "Escribe el motivo de la remisión.",
        accion: "escribir",
        ancla: "orientacion.remitir_motivo",
        campo: "motivo",
      },
      {
        narracion: "Describe la conducta o dificultad observada.",
        accion: "escribir",
        ancla: "orientacion.remitir_especificacion",
        campo: "especificacion_conducta",
      },
      {
        narracion: "Escribe las medidas pedagógicas que ya aplicaste antes de remitir.",
        accion: "escribir",
        ancla: "orientacion.remitir_medidas",
        campo: "medidas_previas",
      },
      {
        narracion: "Firma en el recuadro. Si te equivocas, puedes tocar el botón Limpiar firma y repetirla.",
        accion: "click",
        ancla: "orientacion.remitir_firma",
      },
      {
        narracion:
          "Toca 'Enviar remisión'. Queda registrada y se notifica por WhatsApp a los destinos elegidos.",
        accion: "click",
        ancla: "orientacion.remitir_enviar",
      },
    ],
  },

  // ── Remisiones recibidas (bandeja) ─────────────────────────────────────
  {
    id: "orientacion.consultar_remisiones",
    titulo: "Consultar las remisiones a orientación",
    descripcion:
      "Ver la lista de remisiones a orientación con su estado (Pendiente o Atendida), buscar por estudiante o docente, filtrar por grado y salón. La lista va por estudiante: al tocarlo se ven sus remisiones y al tocar una se abre el detalle (motivo, contacto, firma). Orientación y rector ven todas las del colegio; un coordinador ve las que remitió y todas las de los estudiantes de sus niveles; un director de grupo, las que remitió y las de su salón; un profesor, solo las que él remitió. Para rector, coordinadores y profesores la ficha se llama 'Orientación Escolar' y arriba tiene el botón verde 'Nueva remisión'. Cada remisión está Pendiente o Atendida. Se filtra con botones por estado (Todas, Pendientes, Atendidas) y con el menú 'Todas las remisiones / Remitidas a mí / Remitidas por mí'; dentro de un estudiante también por quién remitió.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN, "rector", "coordinador", "profesor"],
    ruta: "/orientador/remisiones",
    endpoint: "Supabase select Remisiones_Orientacion + GET /api/orientacion/contacto-estudiante",
    sinonimos: [
      "ver las remisiones",
      "remisiones recibidas",
      "consultar la bandeja de remisiones",
      "qué remisiones me llegaron",
      "revisar remisiones a orientación",
      "a qué estudiantes he remitido",
      "qué remisiones han hecho los profesores",
      "cuáles remisiones ya fueron atendidas",
      "mis remisiones",
    ],
    pasos: [
      {
        narracion: "Entramos a Remisiones a Orientación.",
        accion: "navegar",
        ruta: "/orientador/remisiones",
      },
      {
        narracion:
          "Busca por nombre del estudiante o del docente, o filtra por grado y salón. Las remisiones nuevas llevan una etiqueta roja.",
        accion: "escribir",
        ancla: "orientacion.remisiones_buscador",
        campo: "estudiante",
        opcional: true,
      },
      {
        narracion:
          "La lista muestra un estudiante por fila, con cuántas remisiones tiene y cuántas están pendientes o atendidas. Toca el estudiante.",
        accion: "click",
        ancla: "orientacion.remision_estudiante",
      },
      {
        narracion:
          "Aparecen sus remisiones (una por fecha). Toca la que quieras para abrirla: motivo, contacto del estudiante y sus acudientes, y firma del docente.",
        accion: "click",
        ancla: "orientacion.remision_item",
      },
    ],
  },
  {
    id: "orientacion.remision_marcar_atendida",
    titulo: "Marcar una remisión como atendida",
    descripcion:
      "Registrar que el caso remitido ya fue atendido. Lo marca la persona a la que va dirigida la remisión: Orientación si va a Orientación, el coordinador del nivel si va a Coordinación, o el director de grupo del salón si va a Dirección de grupo. Queda con fecha y nombre, se ve como 'Atendida' y se avisa por WhatsApp a quien remitió.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN, "coordinador", "profesor"],
    ruta: "/orientador/remisiones",
    endpoint: "POST /api/orientacion/remision-atendida",
    sinonimos: [
      "marcar remisión como atendida",
      "ya atendí la remisión",
      "cerrar una remisión",
      "dar por atendido un caso remitido",
    ],
    pasos: [
      {
        narracion: "Entramos a Remisiones a Orientación.",
        accion: "navegar",
        ruta: "/orientador/remisiones",
      },
      {
        narracion: "Toca el estudiante en la lista.",
        accion: "click",
        ancla: "orientacion.remision_estudiante",
      },
      {
        narracion: "Toca la remisión que quieres para abrirla.",
        accion: "click",
        ancla: "orientacion.remision_item",
      },
      {
        narracion:
          "Toca 'Marcar como atendida'. Queda registrado con tu nombre y la fecha, y el docente recibe el aviso por WhatsApp.",
        accion: "click",
        ancla: "orientacion.remision_marcar_atendida",
      },
    ],
  },
  {
    id: "orientacion.remision_descargar_word",
    titulo: "Descargar una remisión en Word",
    descripcion:
      "Exportar la remisión (Formato 005) a un documento de Word con membrete, escudo y firma.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/remisiones",
    endpoint: "Plantilla /remision_005_template.docx + GET /api/colegio/config + contacto-estudiante",
    sinonimos: [
      "descargar la remisión en word",
      "exportar la remisión",
      "bajar el formato 005",
      "sacar la remisión en documento",
    ],
    pasos: [
      {
        narracion: "Entramos a Remisiones a Orientación.",
        accion: "navegar",
        ruta: "/orientador/remisiones",
      },
      {
        narracion: "Toca el estudiante en la lista.",
        accion: "click",
        ancla: "orientacion.remision_estudiante",
      },
      {
        narracion: "Toca la remisión que quieres para abrirla.",
        accion: "click",
        ancla: "orientacion.remision_item",
      },
      {
        narracion: "Toca 'Descargar Word'. El documento se descarga a tu dispositivo.",
        accion: "click",
        ancla: "orientacion.remision_descargar_word",
      },
    ],
  },
  {
    id: "orientacion.remision_agendar_cita",
    titulo: "Agendar una cita desde una remisión",
    descripcion:
      "Abrir Citas con el estudiante de la remisión ya pre-seleccionado para agendarle una cita.",
    categoria: "Orientación",
    roles: [...ORIENTADOR_ADMIN],
    ruta: "/orientador/remisiones",
    endpoint: "Navega a /orientador/citas?estudianteId=… (insert Citas_Orientacion)",
    sinonimos: [
      "agendar cita desde una remisión",
      "citar al estudiante de la remisión",
      "programar cita a partir de una remisión",
    ],
    pasos: [
      {
        narracion: "Entramos a Remisiones a Orientación.",
        accion: "navegar",
        ruta: "/orientador/remisiones",
      },
      {
        narracion: "Toca el estudiante en la lista.",
        accion: "click",
        ancla: "orientacion.remision_estudiante",
      },
      {
        narracion: "Toca la remisión que quieres para abrirla.",
        accion: "click",
        ancla: "orientacion.remision_item",
      },
      {
        narracion:
          "Toca 'Agendar cita'. Te lleva a Citas con ese estudiante ya seleccionado; completa fecha, hora, a quién informar y el motivo, y agenda.",
        accion: "click",
        ancla: "orientacion.remision_agendar_cita",
      },
    ],
  },
];
