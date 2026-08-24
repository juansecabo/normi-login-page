// Catálogo "Normi te guía" — Módulo NOTAS (calificación).
//
// Flujo de entrada: Dashboard → elegir asignatura → /seleccionar-grado →
// /seleccionar-salon → /tabla-notas. Escritura de notas por dbProxy sobre las
// tablas Notas / Nombre de Actividades / Grupos_Notas, cuyo guard de INSERT/
// UPDATE/DELETE es SOLO Profesor(a), Administrador, Rector. Por eso las acciones
// de escribir viven en esos tres roles; los demás directivos ven la tabla en
// modo solo-lectura (capacidad "notas.consultar").

import type { Capacidad } from "../tipos";

// La tabla /tabla-notas es EDITABLE solo para el profesor (TablaNotasPorRol:
// isProfesor → editable; directivos → solo lectura). Aunque el dbProxy dejaría
// escribir a rector/admin, NO tienen UI editable, así que la guía (que conduce
// la interfaz real) solo puede enseñar a CALIFICAR al profesor.
const ESCRIBEN_NOTAS = ["profesor"] as const;
// Ven la tabla (solo lectura los directivos). Administrativo NO tiene tarjeta de
// Notas y portero tampoco; el resto de directivos sí.
const VEN_NOTAS = [
  "profesor",
  "rector",
  "coordinador",
  "secretaria",
  "orientador",
  "admin",
] as const;
// Directivos que llegan a /lista-asignaturas y /lista-estudiantes
// (isRectorOrCoordinador: todos los directivos, sin profesor).
const DIRECTIVOS_CONSULTA = [
  "rector",
  "coordinador",
  "admin",
  "administrativo",
  "secretaria",
  "orientador",
] as const;

// Pasos compartidos para llegar a la tabla de notas de un aula concreta.
const abrirTablaDeNotas = (soloLectura: boolean) =>
  [
    {
      narracion: soloLectura
        ? "Entramos a Notas para consultar las calificaciones."
        : "Vamos a tu asignatura para calificar.",
      accion: "navegar" as const,
      ruta: "/dashboard",
    },
    {
      narracion: "Elige la asignatura que quieres abrir.",
      accion: "click" as const,
      ancla: "dashboard.ficha_asignatura",
      campo: "asignatura",
    },
    {
      narracion: "Ahora seleccionamos el grado.",
      accion: "seleccionar" as const,
      ancla: "notas.selector_grado",
      campo: "grado",
    },
    {
      narracion: "Y el salón.",
      accion: "seleccionar" as const,
      ancla: "notas.selector_salon",
      campo: "salon",
    },
    {
      narracion: "Esperamos a que cargue la tabla de estudiantes.",
      accion: "esperar" as const,
      ancla: "notas.tabla",
    },
    {
      narracion: "Elige el periodo en el que vas a trabajar.",
      accion: "seleccionar" as const,
      ancla: "notas.selector_periodo",
      campo: "periodo",
      opcional: true,
    },
  ];

export const NOTAS: Capacidad[] = [
  {
    id: "notas.consultar",
    titulo: "Consultar las notas de un salón",
    descripcion:
      "Abrir la tabla de calificaciones de una asignatura, grado y salón para revisarlas.",
    categoria: "Notas",
    roles: [...VEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Notas select)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura a consultar." },
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Salón concreto." },
    ],
    sinonimos: [
      "ver las notas",
      "revisar calificaciones",
      "consultar las notas de un salón",
      "abrir el planillero",
      "cómo veo las notas de mi curso",
    ],
    pasos: abrirTablaDeNotas(true),
  },
  {
    id: "notas.calificar",
    titulo: "Poner o cambiar la nota de un estudiante",
    descripcion:
      "Escribir la calificación de un estudiante en una columna (actividad) del periodo.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Notas insert/update — Profesor, Rector, Admin)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura." },
      { entidad: "grado", descripcion: "Grado." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "estudiante", descripcion: "Estudiante a calificar." },
    ],
    sinonimos: [
      "poner una nota",
      "calificar",
      "cambiar la nota de un estudiante",
      "corregir una calificación",
      "meter las notas",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion:
          "Ubica la fila del estudiante y la columna de la actividad, y toca la casilla para escribir la nota.",
        accion: "click",
        ancla: "notas.celda_nota",
      },
      {
        narracion: "Escribe la calificación.",
        accion: "escribir",
        ancla: "notas.celda_nota_input",
        campo: "nota",
      },
      {
        narracion: "La nota se guarda sola al salir de la casilla. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "notas.completar_hacia_abajo",
    titulo: "Completar hacia abajo (misma nota a varios)",
    descripcion:
      "Copiar el valor de una casilla a todas las casillas VACÍAS de abajo de esa misma columna (estilo Excel). Se detiene en la primera que ya tenga nota y nunca sobreescribe.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Notas upsert — Profesor, Rector, Admin)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura." },
      { entidad: "grado", descripcion: "Grado." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "estudiante", descripcion: "Estudiante desde el cual se copia hacia abajo." },
    ],
    sinonimos: [
      "poner la misma nota a varios",
      "completar hacia abajo",
      "copiar esta nota a los de abajo",
      "rellenar la columna con el mismo valor",
      "ponerle la misma calificación a todos",
      "llenar las casillas vacías de abajo",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion:
          "Primero pon la nota en la casilla desde la que quieres copiar (la de más arriba).",
        accion: "escribir",
        ancla: "notas.celda_nota_input",
        campo: "nota",
      },
      {
        narracion: "Abre el menú de esa casilla.",
        accion: "click",
        ancla: "notas.menu_celda",
      },
      {
        narracion: "Elige 'Completar hacia abajo'.",
        accion: "click",
        ancla: "notas.menu_completar_abajo",
      },
      {
        narracion:
          "Esa nota se copia a todas las casillas vacías de abajo, hasta encontrar una que ya tenga nota. Las que ya tenían valor no se tocan. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "notas.agregar_actividad",
    titulo: "Agregar una actividad o columna de notas",
    descripcion:
      "Crear una nueva actividad (columna) en el periodo, con su nombre, porcentaje y fecha.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Nombre de Actividades insert — Profesor, Rector, Admin)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura." },
      { entidad: "grado", descripcion: "Grado." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "periodo", descripcion: "Periodo donde va la columna." },
    ],
    sinonimos: [
      "agregar una actividad",
      "crear una columna de notas",
      "poner una nueva evaluación",
      "añadir una nota nueva",
      "meter una actividad al periodo",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion: "Abre el menú de la sección con el botón + (o los tres puntos).",
        accion: "click",
        ancla: "notas.boton_mas_columna",
      },
      {
        narracion: "Elige 'Agregar actividad'.",
        accion: "click",
        ancla: "notas.menu_agregar_actividad",
      },
      {
        narracion: "Escribe el nombre de la actividad.",
        accion: "escribir",
        ancla: "notas.modal_actividad_nombre",
        campo: "nombre_actividad",
      },
      {
        narracion: "Pon el porcentaje que vale (si no va en un grupo).",
        accion: "escribir",
        ancla: "notas.modal_actividad_porcentaje",
        campo: "porcentaje",
        opcional: true,
      },
      {
        narracion: "Elige la fecha de la actividad.",
        accion: "seleccionar",
        ancla: "notas.modal_actividad_fecha",
        campo: "fecha",
        opcional: true,
      },
      {
        narracion: "Guarda la actividad.",
        accion: "click",
        ancla: "notas.modal_actividad_guardar",
      },
    ],
  },
  {
    id: "notas.editar_actividad",
    titulo: "Editar una actividad existente",
    descripcion: "Cambiar el nombre, porcentaje o fecha de una columna de notas.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Nombre de Actividades update — Profesor, Rector, Admin)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura." },
      { entidad: "grado", descripcion: "Grado." },
      { entidad: "salon", descripcion: "Salón." },
    ],
    sinonimos: [
      "editar una actividad",
      "cambiar el nombre de una columna",
      "corregir el porcentaje de una actividad",
      "modificar una evaluación",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion: "Abre el menú de la actividad que quieres cambiar.",
        accion: "click",
        ancla: "notas.boton_menu_actividad",
      },
      {
        narracion: "Elige 'Editar'.",
        accion: "click",
        ancla: "notas.menu_editar_actividad",
      },
      {
        narracion: "Ajusta lo que necesites (nombre, porcentaje o fecha).",
        accion: "escribir",
        ancla: "notas.modal_actividad_nombre",
        campo: "nombre_actividad",
      },
      {
        narracion: "Guarda los cambios.",
        accion: "click",
        ancla: "notas.modal_actividad_guardar",
      },
    ],
  },
  {
    id: "notas.eliminar_actividad",
    titulo: "Eliminar una actividad",
    descripcion: "Borrar una columna de notas del periodo.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Nombre de Actividades delete — Profesor, Rector, Admin)",
    sinonimos: [
      "eliminar una actividad",
      "borrar una columna de notas",
      "quitar una evaluación",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion: "Abre el menú de la actividad que quieres borrar.",
        accion: "click",
        ancla: "notas.boton_menu_actividad",
      },
      {
        narracion: "Elige 'Eliminar'.",
        accion: "click",
        ancla: "notas.menu_eliminar_actividad",
      },
      {
        narracion: "Confirma que sí quieres borrarla.",
        accion: "click",
        ancla: "notas.confirmar_eliminar_actividad",
      },
    ],
  },
  {
    id: "notas.agregar_grupo",
    titulo: "Agregar un grupo de notas",
    descripcion:
      "Crear un grupo (o subgrupo) que agrupa varias actividades y reparte su porcentaje.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    gate: "pestalozziano",
    ruta: "/tabla-notas",
    endpoint: "POST /api/grupos-notas (sin filtro de rol — DEUDA de seguridad)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura." },
      { entidad: "grado", descripcion: "Grado." },
      { entidad: "salon", descripcion: "Salón." },
    ],
    sinonimos: [
      "crear un grupo de notas",
      "agrupar actividades",
      "hacer un grupo con porcentaje",
      "agregar un subgrupo",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion:
          "Mantén presionado el encabezado (o usa el botón +) para abrir el menú de grupo.",
        accion: "click",
        ancla: "notas.boton_mas_columna",
      },
      {
        narracion: "Elige 'Agregar grupo'.",
        accion: "click",
        ancla: "notas.menu_agregar_grupo",
      },
      {
        narracion: "Ponle nombre al grupo.",
        accion: "escribir",
        ancla: "notas.modal_grupo_nombre",
        campo: "nombre_grupo",
      },
      {
        narracion: "Define el porcentaje que vale el grupo.",
        accion: "escribir",
        ancla: "notas.modal_grupo_porcentaje",
        campo: "porcentaje",
      },
      {
        narracion: "Guarda el grupo.",
        accion: "click",
        ancla: "notas.modal_grupo_guardar",
      },
    ],
  },
  {
    id: "notas.editar_grupo",
    titulo: "Editar un grupo de notas",
    descripcion: "Cambiar el nombre o el porcentaje de un grupo existente.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    gate: "pestalozziano",
    ruta: "/tabla-notas",
    endpoint: "PATCH /api/grupos-notas/:id (sin filtro de rol — DEUDA de seguridad)",
    sinonimos: ["editar un grupo", "cambiar el porcentaje de un grupo", "renombrar un grupo"],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion: "Abre el menú del grupo (los tres puntos del encabezado del grupo).",
        accion: "click",
        ancla: "notas.boton_menu_grupo",
      },
      {
        narracion: "Elige 'Editar grupo'.",
        accion: "click",
        ancla: "notas.menu_editar_grupo",
      },
      {
        narracion: "Ajusta el nombre o el porcentaje.",
        accion: "escribir",
        ancla: "notas.modal_grupo_nombre",
        campo: "nombre_grupo",
      },
      {
        narracion: "Guarda los cambios.",
        accion: "click",
        ancla: "notas.modal_grupo_guardar",
      },
    ],
  },
  {
    id: "notas.eliminar_grupo",
    titulo: "Eliminar un grupo de notas",
    descripcion: "Borrar un grupo (las notas se recalculan al quitarlo).",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    gate: "pestalozziano",
    ruta: "/tabla-notas",
    endpoint: "DELETE /api/grupos-notas/:id (sin filtro de rol — DEUDA de seguridad)",
    sinonimos: ["eliminar un grupo", "borrar un grupo de notas", "quitar un grupo"],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion: "Abre el menú del grupo.",
        accion: "click",
        ancla: "notas.boton_menu_grupo",
      },
      {
        narracion: "Elige 'Eliminar grupo'.",
        accion: "click",
        ancla: "notas.menu_eliminar_grupo",
      },
      {
        narracion: "Confirma la eliminación.",
        accion: "click",
        ancla: "notas.confirmar_eliminar_grupo",
      },
    ],
  },
  {
    id: "notas.comentario_estudiante",
    titulo: "Dejar un comentario a un estudiante",
    descripcion:
      "Escribir un comentario en la nota de un estudiante (visible para él y su acudiente).",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Notas update — comentario)",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante a comentar." }],
    sinonimos: [
      "dejar un comentario",
      "escribir una observación en la nota",
      "ponerle un mensaje a un estudiante en sus notas",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion: "Abre el menú de la casilla del estudiante.",
        accion: "click",
        ancla: "notas.menu_celda",
      },
      {
        narracion: "Elige 'Agregar comentario'.",
        accion: "click",
        ancla: "notas.menu_agregar_comentario",
      },
      {
        narracion: "Escribe el comentario.",
        accion: "escribir",
        ancla: "notas.modal_comentario_texto",
        campo: "comentario",
      },
      {
        narracion: "Guárdalo.",
        accion: "click",
        ancla: "notas.modal_comentario_guardar",
      },
    ],
  },
  {
    id: "notas.notificar_definitiva",
    titulo: "Notificar la nota definitiva a un acudiente",
    descripcion:
      "Enviar por WhatsApp la definitiva del periodo de un estudiante a su acudiente.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/notificaciones/notas-actualizadas",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante cuya definitiva se avisa." }],
    sinonimos: [
      "notificar la definitiva",
      "avisar la nota final a los papás",
      "mandar la definitiva del periodo",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion: "Abre el menú de la casilla del estudiante.",
        accion: "click",
        ancla: "notas.menu_celda",
      },
      {
        narracion: "Elige 'Notificar a padre(s)'.",
        accion: "click",
        ancla: "notas.menu_notificar_padres",
      },
      {
        narracion: "Confirma el envío al acudiente.",
        accion: "click",
        ancla: "notas.confirmar_notificar_padres",
      },
    ],
  },
  {
    id: "notas.exportar_excel",
    titulo: "Descargar las notas en Excel",
    descripcion: "Exportar la tabla de notas del salón a un archivo de Excel.",
    categoria: "Notas",
    roles: [...VEN_NOTAS],
    ruta: "/tabla-notas",
    sinonimos: [
      "descargar las notas en excel",
      "exportar el planillero",
      "sacar las notas a excel",
    ],
    pasos: [
      ...abrirTablaDeNotas(true),
      {
        narracion: "Toca el botón de exportar a Excel.",
        accion: "click",
        ancla: "notas.boton_exportar_excel",
      },
      {
        narracion: "El archivo se descarga a tu dispositivo. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "notas.exportar_pdf",
    titulo: "Descargar las notas en PDF",
    descripcion: "Exportar la tabla de notas del salón a un archivo PDF.",
    categoria: "Notas",
    roles: [...VEN_NOTAS],
    ruta: "/tabla-notas",
    sinonimos: [
      "descargar las notas en pdf",
      "exportar el planillero en pdf",
      "sacar las notas a pdf",
      "imprimir las notas",
    ],
    pasos: [
      ...abrirTablaDeNotas(true),
      {
        narracion: "Toca el botón de exportar a PDF (al lado del de Excel).",
        accion: "click",
        ancla: "notas.boton_exportar_pdf",
      },
      {
        narracion: "El PDF se descarga a tu dispositivo. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "notas.habilitacion_poner",
    titulo: "Poner una recuperación (habilitación) a un estudiante",
    descripcion:
      "Registrar la nota de recuperación de un estudiante que reprobó la definitiva del periodo.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Habilitaciones insert/update — Profesor, Rector, Admin)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante que reprobó y va a recuperar." },
    ],
    sinonimos: [
      "poner una recuperación",
      "habilitar a un estudiante",
      "registrar la nota de habilitación",
      "meter la recuperación",
      "nivelar a un estudiante que perdió",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion: "En la definitiva del estudiante que reprobó, abre la opción de recuperación.",
        accion: "click",
        ancla: "notas.boton_habilitar",
      },
      {
        narracion: "Escribe la nota de recuperación.",
        accion: "escribir",
        ancla: "notas.modal_habilitacion_nota",
        campo: "nota",
      },
      {
        narracion: "Guarda la recuperación.",
        accion: "click",
        ancla: "notas.modal_habilitacion_guardar",
      },
    ],
  },
  {
    id: "notas.habilitacion_quitar",
    titulo: "Quitar una recuperación (habilitación)",
    descripcion: "Eliminar la recuperación registrada de un estudiante.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Habilitaciones delete — Profesor, Rector, Admin)",
    sinonimos: [
      "quitar la recuperación",
      "borrar la habilitación",
      "eliminar la nota de recuperación",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion: "Abre la recuperación del estudiante.",
        accion: "click",
        ancla: "notas.boton_habilitar",
      },
      {
        narracion: "Toca 'Quitar habilitación'.",
        accion: "click",
        ancla: "notas.modal_habilitacion_quitar",
      },
    ],
  },
  {
    id: "notas.notificar_definitiva_masiva",
    titulo: "Notificar la definitiva a TODO el salón",
    descripcion:
      "Enviar por WhatsApp la definitiva anual a los acudientes de todos los estudiantes del salón de una vez.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/notificaciones/notas-actualizadas (masivo)",
    sinonimos: [
      "notificar la definitiva a todos",
      "avisar las notas finales a todos los papás",
      "mandar la definitiva a todo el salón",
    ],
    pasos: [
      ...abrirTablaDeNotas(false),
      {
        narracion: "Entra a la vista 'Definitiva Anual'.",
        accion: "click",
        ancla: "notas.tab_definitiva_anual",
      },
      {
        narracion: "Toca el botón 'Notificar' (el masivo, arriba).",
        accion: "click",
        ancla: "notas.boton_notificar_masivo",
      },
      {
        narracion: "Confirma el envío a todos los acudientes.",
        accion: "click",
        ancla: "notas.confirmar_notificar_masivo",
      },
    ],
  },
  {
    id: "notas.lista_asignaturas",
    titulo: "Ver las asignaturas de un salón",
    descripcion:
      "Directivos: ver la lista de asignaturas de un grado y salón (paso previo a consultar sus notas).",
    categoria: "Notas",
    roles: [...DIRECTIVOS_CONSULTA],
    ruta: "/lista-asignaturas",
    sinonimos: [
      "ver las asignaturas de un salón",
      "qué materias tiene un curso",
      "lista de asignaturas del salón",
    ],
    pasos: [
      { narracion: "Entramos a Notas desde el inicio.", accion: "navegar", ruta: "/dashboard" },
      { narracion: "Abre 'Notas'.", accion: "click", ancla: "dashboard.ficha_notas" },
      { narracion: "Elige el grado.", accion: "seleccionar", ancla: "notas.selector_grado", campo: "grado" },
      { narracion: "Elige el salón.", accion: "seleccionar", ancla: "notas.selector_salon", campo: "salon" },
      {
        narracion: "Verás la lista de asignaturas del salón; toca una para ver sus notas.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "notas.lista_estudiantes",
    titulo: "Ver la lista de estudiantes de un salón",
    descripcion: "Directivos: ver los estudiantes de un grado y salón.",
    categoria: "Notas",
    roles: [...DIRECTIVOS_CONSULTA],
    ruta: "/lista-estudiantes",
    sinonimos: [
      "ver los estudiantes de un salón",
      "lista de estudiantes del curso",
      "quiénes están en un salón",
    ],
    pasos: [
      { narracion: "Entramos desde el inicio.", accion: "navegar", ruta: "/dashboard" },
      { narracion: "Abre la consulta del salón (Notas o Lista de estudiantes).", accion: "click", ancla: "dashboard.ficha_notas" },
      { narracion: "Elige el grado.", accion: "seleccionar", ancla: "notas.selector_grado", campo: "grado" },
      { narracion: "Elige el salón.", accion: "seleccionar", ancla: "notas.selector_salon", campo: "salon" },
      { narracion: "Verás la lista de estudiantes del salón.", accion: "explicar" },
    ],
  },
];
