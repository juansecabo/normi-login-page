// Catálogo "Normi te guía" — Módulo NOTAS (calificación).
//
// Flujo de entrada del PROFESOR: Dashboard → ficha de la asignatura →
// /seleccionar-grado → /seleccionar-salon → /tabla-notas (elegir periodo).
// Flujo de los DIRECTIVOS (solo lectura): Dashboard → tarjeta "Notas" →
// grado → salón → /modo-visualizacion ("Por Asignatura") → /lista-asignaturas
// → asignatura → /tabla-notas (elegir periodo).
// Escritura por dbProxy sobre Notas / Nombre de Actividades / Grupos_Notas,
// cuyo guard de INSERT/UPDATE/DELETE es SOLO Profesor(a), Administrador,
// Rector. Los directivos ven la tabla en modo solo-lectura.

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
// Directivos que llegan a /lista-asignaturas y /lista-estudiantes por la
// tarjeta "Notas" del dashboard (que NO se muestra al Administrativo(a), por
// eso queda fuera aunque la ruta lo dejaría entrar).
const DIRECTIVOS_CONSULTA = [
  "rector",
  "coordinador",
  "admin",
  "secretaria",
  "orientador",
] as const;

// Pasos compartidos del PROFESOR para llegar a la tabla de notas de su aula.
const abrirTablaDeNotas = () =>
  [
    {
      narracion: "Vamos a tu asignatura.",
      accion: "navegar" as const,
      ruta: "/dashboard",
    },
    {
      narracion: "Toca la ficha de la asignatura que quieres abrir.",
      accion: "click" as const,
      ancla: "dashboard.ficha_asignatura",
      campo: "asignatura",
    },
    {
      narracion: "Toca el grado.",
      accion: "click" as const,
      ancla: "notas.selector_grado",
      campo: "grado",
    },
    {
      narracion: "Y el salón.",
      accion: "click" as const,
      ancla: "notas.selector_salon",
      campo: "salon",
    },
    {
      narracion:
        "Toca el periodo en el que vas a trabajar (o Definitiva Anual, si es el caso).",
      accion: "click" as const,
      ancla: "notas.selector_periodo",
      campo: "periodo",
    },
    {
      narracion: "Esperamos a que cargue la tabla de estudiantes.",
      accion: "esperar" as const,
      ancla: "notas.tabla",
    },
  ];

// Pasos compartidos de CONSULTA (sirven al profesor y a los directivos, cuyos
// caminos difieren: el cerebro elige el objetivo correcto según el rol).
const abrirTablaConsulta = () =>
  [
    {
      narracion: "Entramos a Notas para consultar las calificaciones.",
      accion: "navegar" as const,
      ruta: "/dashboard",
    },
    {
      narracion:
        "Si eres profesor, toca la ficha de tu asignatura; si eres directivo, abre la tarjeta Notas.",
      accion: "click" as const,
      ancla: "dashboard.ficha_asignatura",
      campo: "asignatura",
    },
    {
      narracion: "Toca el grado.",
      accion: "click" as const,
      ancla: "notas.selector_grado",
      campo: "grado",
    },
    {
      narracion: "Y el salón.",
      accion: "click" as const,
      ancla: "notas.selector_salon",
      campo: "salon",
    },
    {
      narracion:
        "Si te pregunta cómo deseas ver las notas, toca 'Por Asignatura' y luego elige la asignatura en la lista (como profesor no verás esta pregunta).",
      accion: "click" as const,
      ancla: "notas.modo_por_asignatura",
    },
    {
      narracion: "Toca el periodo que quieres revisar (o Definitiva Anual).",
      accion: "click" as const,
      ancla: "notas.selector_periodo",
      campo: "periodo",
    },
    {
      narracion: "Esperamos a que cargue la tabla de estudiantes.",
      accion: "esperar" as const,
      ancla: "notas.tabla",
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
      "ver la planilla de notas",
      "la sábana de notas",
      "cómo veo las notas de mi curso",
    ],
    pasos: abrirTablaConsulta(),
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
      "digitar las notas",
      "subir las notas",
      "pasar las notas",
    ],
    pasos: [
      ...abrirTablaDeNotas(),
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
      ...abrirTablaDeNotas(),
      {
        narracion:
          "Toca la casilla desde la que quieres copiar (la de más arriba).",
        accion: "click",
        ancla: "notas.celda_nota",
      },
      {
        narracion: "Escribe ahí la nota que se va a copiar.",
        accion: "escribir",
        ancla: "notas.celda_nota_input",
        campo: "nota",
      },
      {
        narracion:
          "Pasa el cursor por esa casilla y toca los tres puntitos que aparecen a la derecha (en el celular siempre se ven).",
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
      "Crear una nueva actividad (columna) en el periodo, con su nombre y porcentaje.",
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
      ...abrirTablaDeNotas(),
      {
        narracion:
          "Toca el botón verde 'Agregar' al final de las columnas; se abre el formulario de la actividad.",
        accion: "click",
        ancla: "notas.boton_mas_columna",
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
        narracion: "Toca 'Crear Actividad'.",
        accion: "click",
        ancla: "notas.modal_actividad_guardar",
      },
    ],
  },
  {
    id: "notas.editar_actividad",
    titulo: "Editar una actividad existente",
    descripcion: "Cambiar el nombre o el porcentaje de una columna de notas.",
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
      ...abrirTablaDeNotas(),
      {
        narracion:
          "En el encabezado de la actividad que quieres cambiar, toca los tres puntitos para abrir su menú.",
        accion: "click",
        ancla: "notas.boton_menu_actividad",
      },
      {
        narracion: "Elige 'Editar actividad'.",
        accion: "click",
        ancla: "notas.menu_editar_actividad",
      },
      {
        narracion: "Ajusta lo que necesites (nombre o porcentaje).",
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
      ...abrirTablaDeNotas(),
      {
        narracion:
          "En el encabezado de la actividad que quieres borrar, toca los tres puntitos para abrir su menú.",
        accion: "click",
        ancla: "notas.boton_menu_actividad",
      },
      {
        narracion: "Elige 'Eliminar actividad'.",
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
      ...abrirTablaDeNotas(),
      {
        narracion:
          "Mantén presionado un segundo el botón verde 'Agregar' al final de las columnas; se abre el formulario del grupo (un toque rápido crea una actividad, mantenerlo crea el grupo).",
        accion: "click",
        ancla: "notas.boton_mas_columna",
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
    ruta: "/tabla-notas",
    endpoint: "PATCH /api/grupos-notas/:id (sin filtro de rol — DEUDA de seguridad)",
    sinonimos: ["editar un grupo", "cambiar el porcentaje de un grupo", "renombrar un grupo"],
    pasos: [
      ...abrirTablaDeNotas(),
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
    descripcion:
      "Borrar un grupo (sus actividades pasan a modo plano con su porcentaje efectivo; la nota final del estudiante no cambia).",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "DELETE /api/grupos-notas/:id (sin filtro de rol — DEUDA de seguridad)",
    sinonimos: ["eliminar un grupo", "borrar un grupo de notas", "quitar un grupo"],
    pasos: [
      ...abrirTablaDeNotas(),
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
    id: "notas.reordenar_columnas",
    titulo: "Reordenar actividades y grupos arrastrando",
    descripcion:
      "Cambiar el orden de las columnas (actividades) y de los grupos del planillero arrastrándolos.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Nombre de Actividades / Grupos_Notas update — orden)",
    sinonimos: [
      "reordenar las actividades",
      "cambiar el orden de las columnas",
      "mover una actividad de lugar",
      "organizar las columnas del planillero",
      "arrastrar una columna",
    ],
    pasos: [
      ...abrirTablaDeNotas(),
      {
        narracion:
          "Mantén presionado el nombre de la actividad (en su encabezado) y, sin soltar, arrástrala hasta la posición que quieras dentro de su sección.",
        accion: "explicar",
      },
      {
        narracion:
          "Para mover un grupo completo, mantén presionado el título del grupo y arrástralo igual. El orden se guarda solo. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "notas.marcar_periodo_completo",
    titulo: "Marcar el periodo como completo (cerrar el periodo)",
    descripcion:
      "Marcar la casilla Periodo completo cuando terminaste de calificar: sin ella no aparece la Final del Periodo ni sale el boletín. Desmarcarla reabre el periodo.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Periodos_Completos upsert)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura." },
      { entidad: "grado", descripcion: "Grado." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "periodo", descripcion: "Periodo que se cierra o reabre." },
    ],
    sinonimos: [
      "marcar el periodo como completo",
      "cerrar el periodo",
      "por qué no aparece la definitiva",
      "la final del periodo no sale",
      "reabrir el periodo",
      "terminar el periodo",
    ],
    pasos: [
      ...abrirTablaDeNotas(),
      {
        narracion:
          "Busca la casilla 'Periodo completo' (arriba de la tabla) y márcala cuando ya hayas terminado de calificar. Con eso se cierra el periodo: aparece la Final del Periodo y el salón queda listo para el boletín.",
        accion: "click",
        ancla: "notas.check_periodo_completo",
      },
      {
        narracion:
          "Si necesitas corregir algo después, desmárcala para reabrir el periodo y vuelve a marcarla al terminar. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "notas.comentario_estudiante",
    titulo: "Dejar un comentario a un estudiante",
    descripcion:
      "Escribir un comentario en la nota de un estudiante (visible para él y su acudiente). La casilla debe tener nota.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Notas update — comentario)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante a comentar (su casilla ya debe tener nota)." },
    ],
    sinonimos: [
      "dejar un comentario",
      "escribir una observación en la nota",
      "ponerle un mensaje a un estudiante en sus notas",
    ],
    pasos: [
      ...abrirTablaDeNotas(),
      {
        narracion:
          "Pasa el cursor por la casilla del estudiante (debe tener nota) y toca los tres puntitos que aparecen a la derecha (en el celular siempre se ven).",
        accion: "click",
        ancla: "notas.menu_celda",
      },
      {
        narracion: "Elige 'Agregar comentario' (o 'Editar comentario' si ya tiene uno).",
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
      ...abrirTablaDeNotas(),
      {
        narracion:
          "Pasa el cursor por la casilla de la columna Definitiva Periodo del estudiante y toca los tres puntitos que aparecen (en el celular siempre se ven).",
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
      ...abrirTablaConsulta(),
      {
        narracion: "Toca 'Descargar Excel'.",
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
      ...abrirTablaConsulta(),
      {
        narracion: "Toca 'Descargar PDF' (al lado del de Excel).",
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
      "Registrar la nota de recuperación de un estudiante que reprobó la definitiva del periodo. Requiere que el periodo esté marcado como completo.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (Habilitaciones insert/update — Profesor, Rector, Admin)",
    requisitos: [
      {
        entidad: "estudiante",
        descripcion:
          "Estudiante con la definitiva reprobada (y el periodo marcado como completo, si no la opción no aparece).",
      },
    ],
    sinonimos: [
      "poner una recuperación",
      "habilitar a un estudiante",
      "registrar la nota de habilitación",
      "meter la recuperación",
      "nivelar a un estudiante que perdió",
    ],
    pasos: [
      ...abrirTablaDeNotas(),
      {
        narracion:
          "Pasa el cursor por la casilla Definitiva Periodo del estudiante que reprobó y toca los tres puntitos que aparecen (en el celular siempre se ven).",
        accion: "click",
        ancla: "notas.boton_habilitar",
      },
      {
        narracion: "Elige 'Habilitación'.",
        accion: "click",
        ancla: "notas.menu_habilitacion",
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
      ...abrirTablaDeNotas(),
      {
        narracion:
          "Pasa el cursor por la casilla Definitiva Periodo del estudiante y toca los tres puntitos que aparecen.",
        accion: "click",
        ancla: "notas.boton_habilitar",
      },
      {
        narracion: "Elige 'Editar habilitación'.",
        accion: "click",
        ancla: "notas.menu_habilitacion",
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
      ...abrirTablaDeNotas(),
      {
        narracion: "Entra a la vista 'Definitiva Anual'.",
        accion: "click",
        ancla: "notas.tab_definitiva_anual",
      },
      {
        narracion:
          "Baja a la última fila de la tabla y toca el botón verde de notificar que está bajo la columna Definitiva Anual (es el último de esa fila; los anteriores notifican solo la definitiva de cada periodo).",
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
    id: "notas.preescolar_informe",
    titulo: "Escribir el informe descriptivo de un estudiante (preescolar)",
    descripcion:
      "En el planillero de preescolar, redactar el informe descriptivo de cada estudiante (en preescolar no hay notas numéricas).",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/db (informes descriptivos de preescolar)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado de preescolar." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "estudiante", descripcion: "Estudiante del informe." },
    ],
    sinonimos: [
      "escribir el informe de preescolar",
      "informe descriptivo de un estudiante",
      "describir a un estudiante de preescolar",
      "llenar el informe de mi salón de preescolar",
    ],
    pasos: [
      ...abrirTablaDeNotas(),
      {
        narracion:
          "En la ficha del estudiante, escribe su informe en el cuadro que dice Describe al estudiante (su relación con compañeros, avances académicos, dimensiones).",
        accion: "escribir",
        ancla: "notas.preescolar_informe_texto",
        campo: "comentario",
      },
      {
        narracion: "El informe se guarda y puedes seguir con el siguiente estudiante. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "notas.preescolar_enviar_informes",
    titulo: "Enviar los informes descriptivos a los acudientes (preescolar)",
    descripcion:
      "Mandar por WhatsApp el informe descriptivo a los acudientes, de un estudiante puntual o de todo el salón de preescolar.",
    categoria: "Notas",
    roles: [...ESCRIBEN_NOTAS],
    ruta: "/tabla-notas",
    endpoint: "POST /api/notificaciones (informes de preescolar)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado de preescolar." },
      { entidad: "salon", descripcion: "Salón." },
    ],
    sinonimos: [
      "enviar los informes de preescolar",
      "mandar el informe descriptivo a los padres",
      "notificar los informes de mi salón de preescolar",
    ],
    pasos: [
      ...abrirTablaDeNotas(),
      {
        narracion:
          "Para un estudiante puntual, usa el botón de enviar de su ficha; para mandar todos de una vez, usa el botón de enviar a todo el salón.",
        accion: "click",
        ancla: "notas.preescolar_enviar",
      },
      {
        narracion: "Confirma el envío. A cada acudiente le llega el informe de su estudiante. Listo.",
        accion: "explicar",
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
      { narracion: "Toca el grado.", accion: "click", ancla: "notas.selector_grado", campo: "grado" },
      { narracion: "Y el salón.", accion: "click", ancla: "notas.selector_salon", campo: "salon" },
      { narracion: "Toca 'Por Asignatura'.", accion: "click", ancla: "notas.modo_por_asignatura" },
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
      { narracion: "Abre 'Notas'.", accion: "click", ancla: "dashboard.ficha_notas" },
      { narracion: "Toca el grado.", accion: "click", ancla: "notas.selector_grado", campo: "grado" },
      { narracion: "Y el salón.", accion: "click", ancla: "notas.selector_salon", campo: "salon" },
      { narracion: "Toca 'Por Estudiante'.", accion: "click", ancla: "notas.modo_por_estudiante" },
      { narracion: "Verás la lista de estudiantes del salón.", accion: "explicar" },
    ],
  },
];
