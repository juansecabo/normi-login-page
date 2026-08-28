// Catálogo "Normi te guía" — Módulo ACTIVIDADES (Calendario Actividades).
//
// Tres superficies distintas escriben/leen la tabla "Calendario Actividades":
//
// 1) /profesor/programar-actividad (ProgramarActividad.tsx): hub con dos vistas
//    (Nueva actividad + Actividades Programadas). Guard de la página: bloquea
//    estudiante y acudiente; entra CUALQUIER interno. Los profesores programan
//    por asignatura (eligen Asignatura + Tipo); los demás internos programan una
//    actividad GENERAL (institucional), sin asignatura ni tipo (modoGeneral).
//    La tarjeta del dashboard se muestra a profesor/rector/admin, pero la página
//    admite a todos los internos, así que uso ALL_INTERNOS (fuente = guard real).
//
// 2) /actividades-calendario (ActividadesCalendario.tsx): "Actividades Asignadas"
//    del aula abierta en el planillero (asignatura/grado/salon vienen del flujo de
//    Notas por localStorage). Guard de la página: solo exige sesión, pero solo se
//    llega desde el planillero, así que uso los roles que ven Notas (VEN_NOTAS).
//
// 3) /admin/todas-actividades (TodasActividades.tsx): calendario GLOBAL de todo el
//    colegio. Guard estricto: isAdmin() -> solo rol admin.
//
// La escritura real es INSERT/UPDATE/DELETE directo sobre "Calendario Actividades"
// (RLS tenant, permitida a todos los internos) + POST /api/notificaciones/
// actividad-programada para avisar a estudiantes y acudientes.

import type { Capacidad } from "../tipos";

// Internos con camino de UI al hub /profesor/programar-actividad. El backend
// admite a todos, pero ni el portero (FICHAS_PORTERO) ni el Administrador
// (DashboardAdmin solo tiene Todas las Actividades) tienen tarjeta hacia el
// hub, y la guia solo senala: quedan fuera (el admin usa las admin_*).
const ALL_INTERNOS = [
  "profesor",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
] as const;

// Internos que NO son profesores: programan actividad "General" (institucional).
const INTERNOS_GENERALES = [
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
] as const;

// Roles que llegan al planillero de Notas (y por ahí a /actividades-calendario).
const VEN_NOTAS = [
  "profesor",
  "rector",
  "admin",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
] as const;

// Pasos compartidos para abrir la vista "Nueva actividad" del hub.
const abrirNuevaActividad = () =>
  [
    {
      narracion: "Entramos a Actividades.",
      accion: "navegar" as const,
      ruta: "/profesor/programar-actividad",
    },
    {
      narracion: "Elige la tarjeta 'Nueva actividad'.",
      accion: "click" as const,
      ancla: "actividades.menu_nueva",
    },
  ];

export const ACTIVIDADES: Capacidad[] = [
  {
    id: "actividades.programar",
    titulo: "Programar una actividad (profesor)",
    descripcion:
      "Crear una tarea, evaluación, taller o similar para una asignatura, grado y salón, y notificar a estudiantes y acudientes.",
    categoria: "Actividades",
    roles: ["profesor"],
    ruta: "/profesor/programar-actividad",
    endpoint:
      "insert Calendario Actividades (RLS internos) + POST /api/notificaciones/actividad-programada",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura asignada al profesor." },
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Uno o varios salones destino." },
      { entidad: "fecha", descripcion: "Fecha de presentación (hoy o futura)." },
    ],
    sinonimos: [
      "programar una actividad",
      "dejar una tarea",
      "poner una evaluación",
      "asignar un taller",
      "crear una actividad para mi curso",
      "programar un quiz",
      "programar un examen",
      "poner un examen",
    ],
    pasos: [
      ...abrirNuevaActividad(),
      {
        narracion: "Elige la asignatura de la actividad.",
        accion: "seleccionar",
        ancla: "actividades.select_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Selecciona el grado.",
        accion: "seleccionar",
        ancla: "actividades.select_grado",
        campo: "grado",
      },
      {
        narracion:
          "Marca el salón (o varios salones) donde va la actividad. Puedes elegir más de uno.",
        accion: "click",
        ancla: "actividades.check_salon",
        campo: "salon",
      },
      {
        narracion:
          "Elige el tipo de actividad (Tarea, Evaluación, Taller, Quiz u Otro). Es opcional.",
        accion: "seleccionar",
        ancla: "actividades.select_tipo",
        campo: "tipo",
        opcional: true,
      },
      {
        narracion: "Escribe la descripción de la actividad.",
        accion: "escribir",
        ancla: "actividades.input_descripcion",
        campo: "descripcion",
      },
      {
        narracion: "Si quieres, adjunta uno o varios archivos.",
        accion: "click",
        ancla: "actividades.input_archivo",
        campo: "archivo",
        opcional: true,
      },
      {
        narracion: "Abre el calendario y elige la fecha de presentación.",
        accion: "seleccionar",
        ancla: "actividades.select_fecha",
        campo: "fecha",
      },
      {
        narracion: "Toca 'Programar'.",
        accion: "click",
        ancla: "actividades.btn_programar",
      },
      {
        narracion:
          "Si esa misma actividad ya estaba programada (la misma descripción, fecha, salón y destinatarios) Normi te avisa; puedes cancelar o 'Programar de nuevo'. Al confirmar se notifica a estudiantes y acudientes. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "actividades.programar_general",
    titulo: "Programar una actividad general (directivos y personal)",
    descripcion:
      "Los internos que no son profesores crean una actividad institucional (General), sin asignatura ni tipo, eligiendo grado y salón de todo el colegio.",
    categoria: "Actividades",
    roles: [...INTERNOS_GENERALES],
    ruta: "/profesor/programar-actividad",
    endpoint:
      "insert Calendario Actividades (RLS internos) + POST /api/notificaciones/actividad-programada",
    requisitos: [
      { entidad: "grado", descripcion: "Grado destino (de la estructura del colegio)." },
      { entidad: "salon", descripcion: "Uno o varios salones destino." },
      { entidad: "fecha", descripcion: "Fecha de presentación (hoy o futura)." },
    ],
    sinonimos: [
      "programar una actividad general",
      "dejar una actividad institucional",
      "avisar de un evento a un salón",
      "programar una actividad sin asignatura",
      "poner una actividad como coordinador",
    ],
    pasos: [
      ...abrirNuevaActividad(),
      {
        narracion:
          "Como no eres profesor, la actividad es 'General'. No se elige asignatura ni tipo.",
        accion: "explicar",
      },
      {
        narracion: "Selecciona el grado.",
        accion: "seleccionar",
        ancla: "actividades.select_grado",
        campo: "grado",
      },
      {
        narracion: "Marca el salón (o varios) donde va la actividad.",
        accion: "click",
        ancla: "actividades.check_salon",
        campo: "salon",
      },
      {
        narracion: "Escribe la descripción.",
        accion: "escribir",
        ancla: "actividades.input_descripcion",
        campo: "descripcion",
      },
      {
        narracion: "Si quieres, adjunta archivos.",
        accion: "click",
        ancla: "actividades.input_archivo",
        campo: "archivo",
        opcional: true,
      },
      {
        narracion: "Elige la fecha de presentación.",
        accion: "seleccionar",
        ancla: "actividades.select_fecha",
        campo: "fecha",
      },
      {
        narracion: "Toca 'Programar'. Se notifica a estudiantes y acudientes del salón. Listo.",
        accion: "click",
        ancla: "actividades.btn_programar",
      },
    ],
  },
  {
    id: "actividades.dirigir_especificos",
    titulo: "Dirigir la actividad a estudiantes específicos",
    descripcion:
      "En vez de todo el salón, enviar la actividad solo a ciertos estudiantes (y sus acudientes) elegidos de una lista.",
    categoria: "Actividades",
    roles: [...ALL_INTERNOS],
    ruta: "/profesor/programar-actividad",
    endpoint: "insert Calendario Actividades (estudiantes_ids) + notificación filtrada",
    requisitos: [
      { entidad: "salon", descripcion: "Salón del que se eligen estudiantes." },
      { entidad: "estudiante", descripcion: "Estudiantes puntuales a los que va la actividad." },
    ],
    sinonimos: [
      "mandar la actividad solo a unos estudiantes",
      "dirigir la tarea a estudiantes específicos",
      "que solo le llegue a algunos",
      "actividad para estudiantes puntuales",
    ],
    pasos: [
      ...abrirNuevaActividad(),
      {
        narracion: "Si eres profesor, elige la asignatura.",
        accion: "seleccionar",
        ancla: "actividades.select_asignatura",
        campo: "asignatura",
        opcional: true,
      },
      {
        narracion: "Elige el grado.",
        accion: "seleccionar",
        ancla: "actividades.select_grado",
        campo: "grado",
      },
      {
        narracion: "Marca el salón (o los salones).",
        accion: "click",
        ancla: "actividades.check_salon",
        campo: "salon",
      },
      {
        narracion: "En la sección ¿Para quién?, toca 'Estudiantes específicos'.",
        accion: "click",
        ancla: "actividades.btn_destino_especifico",
      },
      {
        narracion: "Busca al estudiante por su nombre en el buscador.",
        accion: "escribir",
        ancla: "actividades.input_buscar_estudiante",
        campo: "estudiante",
      },
      {
        narracion: "Marca la casilla de cada estudiante que debe recibirla.",
        accion: "click",
        ancla: "actividades.check_estudiante",
        campo: "estudiante",
      },
      {
        narracion:
          "Completa la descripción y la fecha, y toca 'Programar'. Solo esos estudiantes y sus acudientes la verán. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "actividades.adjuntar_archivo",
    titulo: "Adjuntar archivos a una actividad",
    descripcion:
      "Añadir uno o varios archivos (PDF, Word, Excel, PowerPoint o imagen) a la actividad que estás programando.",
    categoria: "Actividades",
    roles: [...ALL_INTERNOS],
    ruta: "/profesor/programar-actividad",
    sinonimos: [
      "adjuntar un archivo",
      "subir un pdf a la tarea",
      "poner un documento en la actividad",
      "anexar un archivo",
    ],
    pasos: [
      ...abrirNuevaActividad(),
      {
        narracion:
          "Con la actividad ya empezada, toca 'Seleccionar archivo' en la sección de adjuntos.",
        accion: "click",
        ancla: "actividades.input_archivo",
        campo: "archivo",
      },
      {
        narracion:
          "Elige el archivo desde tu dispositivo. Puedes repetir para agregar más de uno; cada archivo tiene una X para quitarlo. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "actividades.limpiar_formulario",
    titulo: "Limpiar el formulario de una actividad",
    descripcion:
      "Borrar de una vez todos los campos (asignatura, grado, salones, tipo, descripción, fecha y adjuntos) para empezar de cero.",
    categoria: "Actividades",
    roles: [...ALL_INTERNOS],
    ruta: "/profesor/programar-actividad",
    sinonimos: [
      "limpiar el formulario",
      "borrar todo y empezar de nuevo",
      "reiniciar la actividad",
      "vaciar los campos",
    ],
    pasos: [
      ...abrirNuevaActividad(),
      {
        narracion: "Toca el botón 'Limpiar' (arriba a la derecha del formulario).",
        accion: "click",
        ancla: "actividades.btn_limpiar",
      },
    ],
  },
  {
    id: "actividades.ver_calendario_propio",
    titulo: "Ver mi calendario de actividades programadas",
    descripcion:
      "Abrir el calendario con las actividades que has dejado (pendientes e historial) y ver las de un día.",
    categoria: "Actividades",
    roles: [...ALL_INTERNOS],
    ruta: "/profesor/programar-actividad",
    endpoint: "select Calendario Actividades por id_profesor",
    sinonimos: [
      "ver mis actividades programadas",
      "qué tareas dejé",
      "revisar el calendario de actividades",
      "ver las actividades que puse",
      "mi historial de actividades",
    ],
    pasos: [
      {
        narracion: "Entramos a Actividades.",
        accion: "navegar",
        ruta: "/profesor/programar-actividad",
      },
      {
        narracion: "Elige la tarjeta 'Actividades Programadas'.",
        accion: "click",
        ancla: "actividades.menu_programadas",
      },
      {
        narracion: "En el calendario toca un día (verde = próximas, gris = ya pasaron).",
        accion: "click",
        ancla: "actividades.calendario_propio_dia",
        campo: "fecha",
      },
      {
        narracion: "Al lado (o debajo, en el celular) aparece la lista de actividades de ese día. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "actividades.filtrar_propias",
    titulo: "Filtrar mis actividades programadas",
    descripcion:
      "Acotar el calendario por asignatura, grado, salón o buscar por texto de la descripción.",
    categoria: "Actividades",
    roles: [...ALL_INTERNOS],
    ruta: "/profesor/programar-actividad",
    sinonimos: [
      "filtrar mis actividades",
      "buscar una actividad por descripción",
      "ver solo las de un grado",
      "filtrar por salón",
    ],
    pasos: [
      {
        narracion: "Entramos a Actividades.",
        accion: "navegar",
        ruta: "/profesor/programar-actividad",
      },
      {
        narracion: "Elige 'Actividades Programadas'.",
        accion: "click",
        ancla: "actividades.menu_programadas",
      },
      {
        narracion: "Usa los filtros de asignatura, grado o salón.",
        accion: "seleccionar",
        ancla: "actividades.filtro_asignatura",
        campo: "asignatura",
        opcional: true,
      },
      {
        narracion: "O escribe parte de la descripción en el buscador para encontrarla por texto.",
        accion: "escribir",
        ancla: "actividades.input_buscar_actividad",
        campo: "descripcion",
        opcional: true,
      },
    ],
  },
  {
    id: "actividades.editar",
    titulo: "Editar una actividad programada",
    descripcion:
      "Cambiar la descripción, la fecha o los archivos adjuntos de una actividad ya programada.",
    categoria: "Actividades",
    roles: [...ALL_INTERNOS],
    ruta: "/profesor/programar-actividad",
    endpoint: "update Calendario Actividades (por column_id)",
    requisitos: [{ entidad: "fecha", descripcion: "Día en que está programada la actividad." }],
    sinonimos: [
      "editar una actividad",
      "cambiar la fecha de una tarea",
      "corregir la descripción de una actividad",
      "modificar una actividad programada",
    ],
    pasos: [
      {
        narracion: "Entramos a Actividades.",
        accion: "navegar",
        ruta: "/profesor/programar-actividad",
      },
      {
        narracion: "Elige 'Actividades Programadas'.",
        accion: "click",
        ancla: "actividades.menu_programadas",
      },
      {
        narracion: "Toca en el calendario el día de la actividad.",
        accion: "click",
        ancla: "actividades.calendario_propio_dia",
        campo: "fecha",
      },
      {
        narracion: "En la tarjeta de la actividad toca el lápiz (a la derecha).",
        accion: "click",
        ancla: "actividades.btn_editar",
      },
      {
        narracion: "Ajusta la descripción, la fecha o los adjuntos.",
        accion: "escribir",
        ancla: "actividades.edit_descripcion",
        campo: "descripcion",
      },
      {
        narracion: "Guarda los cambios.",
        accion: "click",
        ancla: "actividades.edit_guardar",
      },
    ],
  },
  {
    id: "actividades.eliminar",
    titulo: "Eliminar una actividad programada",
    descripcion: "Borrar una actividad del calendario (no se puede deshacer).",
    categoria: "Actividades",
    roles: [...ALL_INTERNOS],
    ruta: "/profesor/programar-actividad",
    endpoint: "delete Calendario Actividades (por column_id)",
    sinonimos: [
      "eliminar una actividad",
      "borrar una tarea programada",
      "quitar una actividad del calendario",
    ],
    pasos: [
      {
        narracion: "Entramos a Actividades.",
        accion: "navegar",
        ruta: "/profesor/programar-actividad",
      },
      {
        narracion: "Elige 'Actividades Programadas'.",
        accion: "click",
        ancla: "actividades.menu_programadas",
      },
      {
        narracion: "Toca en el calendario el día de la actividad.",
        accion: "click",
        ancla: "actividades.calendario_propio_dia",
        campo: "fecha",
      },
      {
        narracion: "En la tarjeta de la actividad toca la caneca roja (a la derecha).",
        accion: "click",
        ancla: "actividades.btn_eliminar",
      },
      {
        narracion: "Confirma la eliminación en el aviso.",
        accion: "click",
        ancla: "actividades.confirmar_eliminar",
      },
    ],
  },
  {
    id: "actividades.ver_archivo",
    titulo: "Ver el archivo adjunto de una actividad",
    descripcion:
      "Abrir en el navegador el archivo que trae una actividad (los de Office se abren con visor de Google).",
    categoria: "Actividades",
    roles: [...ALL_INTERNOS],
    ruta: "/profesor/programar-actividad",
    sinonimos: [
      "ver el archivo de una actividad",
      "abrir el adjunto de la tarea",
      "ver el documento anexo",
    ],
    pasos: [
      {
        narracion: "Vamos a Actividades.",
        accion: "navegar",
        ruta: "/profesor/programar-actividad",
      },
      {
        narracion: "Toca la tarjeta 'Actividades Programadas'.",
        accion: "click",
        ancla: "actividades.menu_programadas",
      },
      {
        narracion: "En el calendario, toca el día de la actividad (verde = próximas, gris = ya pasaron).",
        accion: "click",
        ancla: "actividades.calendario_propio_dia",
        campo: "fecha",
      },
      {
        narracion: "En la tarjeta, junto al archivo, toca 'Ver'.",
        accion: "click",
        ancla: "actividades.btn_ver_archivo",
      },
    ],
  },
  {
    id: "actividades.descargar_archivo",
    titulo: "Descargar el archivo adjunto de una actividad",
    descripcion: "Bajar a tu dispositivo el archivo que trae una actividad.",
    categoria: "Actividades",
    roles: [...ALL_INTERNOS],
    ruta: "/profesor/programar-actividad",
    sinonimos: [
      "descargar el archivo de una actividad",
      "bajar el adjunto de la tarea",
      "guardar el documento de la actividad",
    ],
    pasos: [
      {
        narracion: "Vamos a Actividades.",
        accion: "navegar",
        ruta: "/profesor/programar-actividad",
      },
      {
        narracion: "Toca la tarjeta 'Actividades Programadas'.",
        accion: "click",
        ancla: "actividades.menu_programadas",
      },
      {
        narracion: "En el calendario, toca el día de la actividad (verde = próximas, gris = ya pasaron).",
        accion: "click",
        ancla: "actividades.calendario_propio_dia",
        campo: "fecha",
      },
      {
        narracion: "En la tarjeta, junto al archivo, toca 'Descargar'.",
        accion: "click",
        ancla: "actividades.btn_descargar_archivo",
      },
    ],
  },
  {
    id: "actividades.desde_notas_agregar",
    titulo: "Agregar una actividad desde el planillero",
    descripcion:
      "Crear una actividad para el aula que tienes abierta en Notas (pantalla 'Actividades Asignadas'), sin volver a elegir asignatura, grado ni salón.",
    categoria: "Actividades",
    roles: [...VEN_NOTAS],
    ruta: "/actividades-calendario",
    endpoint:
      "insert Calendario Actividades (RLS internos) + POST /api/notificaciones/actividad-programada",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura abierta en el planillero." },
      { entidad: "grado", descripcion: "Grado del aula abierta." },
      { entidad: "salon", descripcion: "Salón del aula abierta." },
      { entidad: "fecha", descripcion: "Fecha de presentación (hoy o futura)." },
    ],
    sinonimos: [
      "agregar una actividad desde las notas",
      "dejar una tarea desde el planillero",
      "actividades asignadas del salón",
      "poner una actividad en el curso que tengo abierto",
    ],
    pasos: [
      {
        narracion:
          "Desde el planillero del aula, abre 'Actividades Asignadas' (o navega directo).",
        accion: "navegar",
        ruta: "/actividades-calendario",
      },
      {
        narracion: "Toca 'Agregar Actividad'.",
        accion: "click",
        ancla: "actividades.aula_btn_agregar",
      },
      {
        narracion: "Escribe la descripción (hasta 500 caracteres).",
        accion: "escribir",
        ancla: "actividades.aula_descripcion",
        campo: "descripcion",
      },
      {
        narracion: "Si quieres, adjunta archivos.",
        accion: "click",
        ancla: "actividades.aula_archivo",
        campo: "archivo",
        opcional: true,
      },
      {
        narracion: "Elige la fecha de presentación.",
        accion: "seleccionar",
        ancla: "actividades.aula_fecha",
        campo: "fecha",
      },
      {
        narracion:
          "Toca 'Guardar Actividad'. Queda en el aula y se notifica a estudiantes y padres. Listo.",
        accion: "click",
        ancla: "actividades.aula_guardar",
      },
    ],
  },
  {
    id: "actividades.desde_notas_editar",
    titulo: "Editar una actividad desde el planillero",
    descripcion:
      "Cambiar la descripción, la fecha o los adjuntos de una actividad del aula abierta en 'Actividades Asignadas'.",
    categoria: "Actividades",
    roles: [...VEN_NOTAS],
    ruta: "/actividades-calendario",
    endpoint: "update Calendario Actividades (por column_id)",
    sinonimos: [
      "editar una actividad del planillero",
      "cambiar una actividad asignada",
      "corregir una tarea del salón",
    ],
    pasos: [
      {
        narracion: "Abre 'Actividades Asignadas' del aula.",
        accion: "navegar",
        ruta: "/actividades-calendario",
      },
      {
        narracion: "En la actividad toca 'Editar'.",
        accion: "click",
        ancla: "actividades.aula_btn_editar",
      },
      {
        narracion: "Ajusta la descripción, la fecha o los adjuntos.",
        accion: "escribir",
        ancla: "actividades.aula_descripcion",
        campo: "descripcion",
      },
      {
        narracion: "Toca 'Guardar Actividad'.",
        accion: "click",
        ancla: "actividades.aula_guardar",
      },
    ],
  },
  {
    id: "actividades.desde_notas_eliminar",
    titulo: "Eliminar una actividad desde el planillero",
    descripcion: "Borrar una actividad del aula abierta en 'Actividades Asignadas'.",
    categoria: "Actividades",
    roles: [...VEN_NOTAS],
    ruta: "/actividades-calendario",
    endpoint: "delete Calendario Actividades (por column_id)",
    sinonimos: [
      "eliminar una actividad del planillero",
      "borrar una tarea asignada",
      "quitar una actividad del salón",
    ],
    pasos: [
      {
        narracion: "Abre 'Actividades Asignadas' del aula.",
        accion: "navegar",
        ruta: "/actividades-calendario",
      },
      {
        narracion: "En la actividad toca 'Eliminar'.",
        accion: "click",
        ancla: "actividades.aula_btn_eliminar",
      },
      {
        narracion: "Confirma la eliminación en el aviso.",
        accion: "click",
        ancla: "actividades.aula_confirmar_eliminar",
      },
    ],
  },
  {
    id: "actividades.admin_ver_todas",
    titulo: "Ver todas las actividades del colegio",
    descripcion:
      "Abrir el calendario global con las actividades programadas por todos los profesores, elegir un día y ver el detalle de cada una.",
    categoria: "Actividades",
    roles: ["admin"],
    ruta: "/admin/todas-actividades",
    endpoint: "select Calendario Actividades (todo el colegio)",
    sinonimos: [
      "ver todas las actividades",
      "calendario general de actividades",
      "qué actividades hay en el colegio",
      "actividades de todos los profesores",
    ],
    pasos: [
      {
        narracion: "Entramos a Todas las Actividades.",
        accion: "navegar",
        ruta: "/admin/todas-actividades",
      },
      {
        narracion: "En el calendario toca un día marcado (verde = próximas, gris = ya pasaron).",
        accion: "click",
        ancla: "actividades.admin_calendario_dia",
        campo: "fecha",
      },
      {
        narracion:
          "Toca una tarjeta para ver el detalle completo (profesor, fecha, descripción y adjuntos). Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "actividades.admin_editar",
    titulo: "Editar cualquier actividad (admin)",
    descripcion:
      "Como administrador, cambiar la descripción y la fecha de cualquier actividad del colegio.",
    categoria: "Actividades",
    roles: ["admin"],
    ruta: "/admin/todas-actividades",
    endpoint: "update Calendario Actividades (por column_id)",
    sinonimos: [
      "editar cualquier actividad",
      "corregir una actividad de un profesor",
      "cambiar la fecha de una actividad como admin",
    ],
    pasos: [
      {
        narracion: "Entramos a Todas las Actividades.",
        accion: "navegar",
        ruta: "/admin/todas-actividades",
      },
      {
        narracion: "En el calendario toca el día de la actividad (verde = próximas, gris = ya pasaron).",
        accion: "click",
        ancla: "actividades.admin_calendario_dia",
        campo: "fecha",
      },
      {
        narracion: "Toca el lápiz (Editar) de la tarjeta.",
        accion: "click",
        ancla: "actividades.admin_btn_editar",
      },
      {
        narracion: "Ajusta la fecha y la descripción.",
        accion: "escribir",
        ancla: "actividades.admin_edit_descripcion",
        campo: "descripcion",
      },
      {
        narracion: "Toca 'Guardar cambios'.",
        accion: "click",
        ancla: "actividades.admin_edit_guardar",
      },
    ],
  },
  {
    id: "actividades.admin_eliminar",
    titulo: "Eliminar cualquier actividad (admin)",
    descripcion: "Como administrador, borrar cualquier actividad del colegio.",
    categoria: "Actividades",
    roles: ["admin"],
    ruta: "/admin/todas-actividades",
    endpoint: "delete Calendario Actividades (por column_id)",
    sinonimos: [
      "eliminar cualquier actividad",
      "borrar una actividad de un profesor",
      "quitar una actividad como admin",
    ],
    pasos: [
      {
        narracion: "Entramos a Todas las Actividades.",
        accion: "navegar",
        ruta: "/admin/todas-actividades",
      },
      {
        narracion: "En el calendario toca el día de la actividad (verde = próximas, gris = ya pasaron).",
        accion: "click",
        ancla: "actividades.admin_calendario_dia",
        campo: "fecha",
      },
      {
        narracion: "Toca el bote de basura (Eliminar) de la tarjeta.",
        accion: "click",
        ancla: "actividades.admin_btn_eliminar",
      },
      {
        narracion: "Confirma la eliminación en el aviso.",
        accion: "click",
        ancla: "actividades.admin_confirmar_eliminar",
      },
    ],
  },
  {
    id: "actividades.permitir_entregas",
    titulo: "Pedir que los estudiantes entreguen el trabajo por la plataforma",
    descripcion:
      "Al programar una actividad, habilitar que los estudiantes suban sus archivos, con fecha y hora límite de entrega. Útil para trabajo en casa, incapacidades o suspensiones.",
    categoria: "Actividades",
    roles: ["profesor"],
    ruta: "/programar-actividad",
    endpoint: "Calendario Actividades.permite_entregas + fecha_limite_entrega",
    sinonimos: ["que me entreguen la tarea", "recibir trabajos", "habilitar entregas", "trabajo en casa"],
    pasos: [
      { narracion: "Entramos a programar la actividad.", accion: "navegar", ruta: "/programar-actividad" },
      {
        narracion: "Llene la actividad como siempre y marque la casilla 'Entrega en plataforma'.",
        accion: "click",
        ancla: "actividades.permitir_entregas",
      },
      {
        narracion: "Defina la fecha y la hora límite de entrega. Antes del plazo los estudiantes pueden cambiar sus archivos; al vencer, lo entregado queda congelado.",
        accion: "explicar",
      },
      { narracion: "Confirme con 'Programar'.", accion: "click", ancla: "actividades.btn_programar" },
    ],
  },
  {
    id: "actividades.revisar_entregas",
    titulo: "Revisar las entregas de una actividad",
    descripcion:
      "Ver quién entregó el trabajo (con fecha, y si fue tarde, el atraso), abrir o descargar los archivos, y ver quién falta. Cada tarde recibe un resumen por WhatsApp con las entregas del día.",
    categoria: "Actividades",
    roles: ["profesor"],
    ruta: "/programar-actividad",
    endpoint: "GET /api/entregas/actividad/:id (solo el profesor de la actividad)",
    sinonimos: ["ver los trabajos", "quién me entregó", "revisar tareas enviadas", "entregas de los estudiantes"],
    pasos: [
      { narracion: "Entramos a sus actividades.", accion: "navegar", ruta: "/programar-actividad" },
      {
        narracion:
          "Abra la pestaña 'Actividades Programadas' y toque el día de la actividad. La casilla 'Con entrega en plataforma' de los filtros le muestra solo las actividades que reciben entregas.",
        accion: "click",
      },
      {
        narracion:
          "En la actividad, toque 'Entregas': se abre la página con quién entregó (fecha y atraso si fue tarde), sus archivos con 'Ver' y 'Descargar', y quién falta. Arriba puede buscar a un estudiante por su nombre.",
        accion: "click",
        ancla: "actividades.ver_entregas",
      },
      {
        narracion:
          "Cuando termine de calificar, en la tarjeta de la actividad toque 'Sin revisar' para marcarla como '✓ Revisado' y así saber cuáles ya revisó. Puede volver a tocarla para deshacer.",
        accion: "explicar",
      },
    ],
  },
];
