// Catálogo "Normi te guía" — Módulo ASISTENCIA.
//
// Dos flujos de entrada:
//  1) TOMAR asistencia (pasar lista del día en una lista con botones) — solo Profesor
//     y Administrador (Asistencia.tsx se auto-bloquea con isProfesor()||isAdmin()).
//     Vive en /profesor/asistencia/tomar, alcanzado desde el menú
//     /profesor/asistencia. Escribe por POST /api/asistencia/marcar, cuyo guard
//     real es ROLES_TOMAN = ['Profesor(a)', 'Administrador'].
//  2) REGISTRO / consulta (matriz del curso + calendario por estudiante) en
//     /asistencia (ConsultaAsistencia.tsx). Lo VEN todos los internos (GET
//     /api/asistencia/clases e /historial devuelven 403 solo a Estudiante y
//     Acudiente). Corregir/quitar dentro de la matriz o el calendario sigue
//     siendo SOLO Profesor y Administrador (puedeEditar = isProfesor()||isAdmin()
//     en el front, y marcar/quitar en el backend).
//
// El profesor solo puede tomar/editar/ver clases que REALMENTE dicta (se valida
// contra "Asignación Profesores"); el Administrador, cualquiera del colegio.
// OJO: para TOMAR, la pagina llena los selects con las asignaciones PROPIAS del
// usuario, asi que un admin sin filas en Asignacion Profesores ve selects vacios.

import type { Capacidad } from "../tipos";

// Escriben asistencia (tomar, corregir, quitar). Guard real: ROLES_TOMAN.
const TOMAN_ASISTENCIA = ["profesor", "admin"] as const;
// Ven el registro (matriz/calendario). El backend admite a cualquier interno,
// pero el dashboard del portero (FICHAS_PORTERO) no tiene la tarjeta Asistencia,
// asi que la guia no puede llevarlo: queda fuera.
const VEN_ASISTENCIA = [
  "profesor",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "admin",
] as const;

export const ASISTENCIA: Capacidad[] = [
  {
    id: "asistencia.tomar",
    titulo: "Tomar asistencia (pasar lista del día)",
    descripcion:
      "Pasar lista de una clase marcando a cada estudiante como presente, ausente, con excusa o que entró tarde.",
    categoria: "Asistencia",
    roles: [...TOMAN_ASISTENCIA],
    ruta: "/profesor/asistencia/tomar",
    endpoint: "POST /api/asistencia/guardar (Profesor, Administrador)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura de la clase." },
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Salón concreto." },
      { entidad: "fecha", descripcion: "Día de la clase (por defecto hoy, no puede ser futuro)." },
    ],
    sinonimos: [
      "tomar asistencia",
      "pasar lista",
      "pasar asistencia de hoy",
      "marcar quién vino a clase",
      "poner los ausentes de mi clase",
      "registrar la asistencia del día",
      "llamar a lista",
      "ver quién faltó hoy",
      "marcar a todos como presentes",
      "poner a todos presentes menos uno",
    ],
    pasos: [
      {
        narracion: "Entramos al menú de Asistencia.",
        accion: "navegar",
        ruta: "/profesor/asistencia",
      },
      {
        narracion: "Elige 'Tomar Asistencia'.",
        accion: "click",
        ancla: "asistencia.menu_tomar",
      },
      {
        narracion: "Selecciona la asignatura.",
        accion: "seleccionar",
        ancla: "asistencia.selector_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Ahora el grado.",
        accion: "seleccionar",
        ancla: "asistencia.selector_grado",
        campo: "grado",
      },
      {
        narracion: "Y el salón.",
        accion: "seleccionar",
        ancla: "asistencia.selector_salon",
        campo: "salon",
      },
      {
        narracion: "Confirma la 'Fecha' (viene con la de hoy; puedes cambiarla a un día anterior).",
        accion: "escribir",
        ancla: "asistencia.input_fecha",
        campo: "fecha",
        opcional: true,
      },
      {
        narracion: "Toca 'Comenzar' para cargar la lista del salón.",
        accion: "click",
        ancla: "asistencia.boton_comenzar",
      },
      {
        narracion: "Esperamos a que aparezca la lista de estudiantes.",
        accion: "esperar",
        ancla: "asistencia.lista",
      },
      {
        narracion:
          "Si vinieron casi todos, toca 'Marcar todos como presentes' y luego cambia solo a los que faltaron.",
        accion: "click",
        ancla: "asistencia.todos_presentes",
        opcional: true,
      },
      {
        narracion:
          "En la fila de cada estudiante toca su estado: Presente, Ausente, Tarde o Excusa. En computador también puedes mantener presionado un botón y arrastrar sobre las filas para marcar a varios con el mismo estado.",
        accion: "click",
        ancla: "asistencia.boton_presente",
        campo: "estado",
      },
      {
        narracion:
          "Toca 'Guardar' (abajo) para guardar las marcas; ahí se avisa a los acudientes. Puedes guardar aunque falten estudiantes. Si un estudiante tiene una excusa vigente, o un retiro autorizado que cubre esa clase, aparece ya en Excusa y no se puede cambiar.",
        accion: "click",
        ancla: "asistencia.guardar",
      },
    ],
  },
  {
    id: "asistencia.corregir_en_lista",
    titulo: "Corregir la asistencia de un estudiante",
    descripcion:
      "Cambiar la marca de un estudiante puntual (por ejemplo, un ausente que sí vino) sin volver a pasar toda la lista.",
    categoria: "Asistencia",
    roles: [...TOMAN_ASISTENCIA],
    ruta: "/profesor/asistencia/tomar",
    endpoint: "POST /api/asistencia/guardar (Profesor, Administrador)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante a corregir." },
    ],
    sinonimos: [
      "corregir a un estudiante",
      "cambiar la marca de uno solo",
      "arreglar la asistencia de alguien que llegó tarde",
      "corregir un ausente que sí vino",
      "editar la asistencia sin volver a pasar lista",
    ],
    pasos: [
      {
        narracion:
          "Abre la clase en 'Tomar asistencia' (misma asignatura, grado, salón y fecha). La lista aparece con las marcas que ya pusiste.",
        accion: "explicar",
      },
      {
        narracion: "En la fila del estudiante, toca el estado correcto (Presente, Ausente, Tarde o Excusa).",
        accion: "click",
        ancla: "asistencia.boton_presente",
        campo: "estado",
      },
      {
        narracion: "Toca 'Guardar'. Si cambia una inasistencia o tardanza ya avisada, se notifica al acudiente. Listo.",
        accion: "click",
        ancla: "asistencia.guardar",
      },
    ],
  },
  {
    id: "asistencia.consultar",
    titulo: "Consultar el registro de asistencia de un curso",
    descripcion:
      "Ver la matriz de asistencia de una asignatura, grado y salón, por mes, día o rango de fechas.",
    categoria: "Asistencia",
    roles: [...VEN_ASISTENCIA],
    ruta: "/asistencia",
    endpoint: "GET /api/asistencia/historial (internos; el profesor solo sus clases)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura a consultar." },
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Salón concreto." },
    ],
    sinonimos: [
      "ver la asistencia de un curso",
      "consultar el registro de asistencia",
      "revisar las faltas de un salón",
      "ver quién ha faltado",
      "mirar la asistencia por mes",
      "abrir la matriz de asistencia",
    ],
    pasos: [
      {
        narracion: "Abrimos el Registro de Asistencia.",
        accion: "navegar",
        ruta: "/asistencia",
      },
      {
        narracion: "Si ves el menú de Asistencia, entra a 'Registro de Asistencia'.",
        accion: "click",
        ancla: "asistencia.menu_registro",
        opcional: true,
      },
      {
        narracion: "Selecciona la asignatura.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Ahora el grado.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_grado",
        campo: "grado",
      },
      {
        narracion: "Y el salón.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_salon",
        campo: "salon",
      },
      {
        narracion:
          "Elige cómo ver el periodo: por mes (con las flechas para cambiar de mes), por un día puntual, o por un rango de fechas.",
        accion: "click",
        ancla: "asistencia.modo_mes",
        campo: "modo_tiempo",
        opcional: true,
      },
      {
        narracion:
          "Aparece la matriz con los estudiantes en filas, los días en columnas y su porcentaje de asistencia. Listo.",
        accion: "esperar",
        ancla: "asistencia.matriz",
      },
    ],
  },
  {
    id: "asistencia.exportar_excel",
    titulo: "Descargar la asistencia en Excel",
    descripcion:
      "Exportar la matriz de asistencia del curso (clase y rango elegidos) a un archivo de Excel.",
    categoria: "Asistencia",
    roles: [...VEN_ASISTENCIA],
    ruta: "/asistencia",
    endpoint: "GET /api/asistencia/historial (internos) + generación local del .xlsx",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura a exportar." },
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Salón concreto." },
    ],
    sinonimos: [
      "descargar la asistencia en excel",
      "exportar el registro de asistencia",
      "sacar la asistencia a excel",
      "bajar la planilla de asistencia",
    ],
    pasos: [
      {
        narracion: "Abrimos el Registro de Asistencia.",
        accion: "navegar",
        ruta: "/asistencia",
      },
      {
        narracion: "Si ves el menú de Asistencia, entra a 'Registro de Asistencia'.",
        accion: "click",
        ancla: "asistencia.menu_registro",
        opcional: true,
      },
      {
        narracion: "Elige la asignatura, el grado y el salón, y el mes o rango que quieres exportar.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Cuando cargue la matriz, toca el botón 'Excel'.",
        accion: "click",
        ancla: "asistencia.boton_excel",
      },
      {
        narracion: "El archivo se descarga a tu dispositivo con la clase, el rango y los colores por estado. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "asistencia.corregir_matriz",
    titulo: "Cambiar una marca desde la matriz",
    descripcion:
      "Corregir el estado de un estudiante en un día concreto tocando su casilla en la matriz de asistencia.",
    categoria: "Asistencia",
    roles: [...TOMAN_ASISTENCIA],
    ruta: "/asistencia",
    endpoint: "POST /api/asistencia/marcar (Profesor, Administrador; el profesor solo sus clases)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura." },
      { entidad: "grado", descripcion: "Grado." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "estudiante", descripcion: "Estudiante a corregir." },
      { entidad: "fecha", descripcion: "Día de la marca a cambiar." },
    ],
    sinonimos: [
      "cambiar una marca de asistencia",
      "corregir la asistencia de un día",
      "editar una falta en la matriz",
      "poner presente a alguien que estaba ausente",
      "corregir un día en el registro",
    ],
    pasos: [
      {
        narracion: "Abrimos el Registro de Asistencia.",
        accion: "navegar",
        ruta: "/asistencia",
      },
      {
        narracion: "Si ves el menú de Asistencia, entra a 'Registro de Asistencia'.",
        accion: "click",
        ancla: "asistencia.menu_registro",
        opcional: true,
      },
      {
        narracion: "Selecciona la asignatura.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Ahora el grado.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_grado",
        campo: "grado",
      },
      {
        narracion: "Y el salón.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_salon",
        campo: "salon",
      },
      {
        narracion:
          "Opcional: usa el buscador de arriba para dejar solo al estudiante que quieres corregir.",
        accion: "escribir",
        ancla: "asistencia.buscar_estudiante",
        campo: "estudiante",
        opcional: true,
      },
      {
        narracion: "Toca la casilla del estudiante en el día que quieres cambiar.",
        accion: "click",
        ancla: "asistencia.celda_matriz",
      },
      {
        narracion: "En el globo que aparece, elige el nuevo estado (presente, ausente, con excusa o entró tarde).",
        accion: "click",
        ancla: "asistencia.popover_estado",
        campo: "estado",
      },
      {
        narracion: "El cambio se guarda y, si corrige una inasistencia ya avisada, se notifica al acudiente. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "asistencia.quitar_marca",
    titulo: "Quitar (borrar) una marca de asistencia",
    descripcion:
      "Eliminar por completo la marca de un estudiante en un día, dejando la casilla en 'sin marca'.",
    categoria: "Asistencia",
    roles: [...TOMAN_ASISTENCIA],
    ruta: "/asistencia",
    endpoint: "POST /api/asistencia/quitar (Profesor, Administrador; el profesor solo sus clases)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura." },
      { entidad: "grado", descripcion: "Grado." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "estudiante", descripcion: "Estudiante cuya marca se borra." },
      { entidad: "fecha", descripcion: "Día de la marca a quitar." },
    ],
    sinonimos: [
      "quitar una marca de asistencia",
      "borrar una falta",
      "eliminar el registro de un día",
      "dejar sin marca a un estudiante",
      "anular una inasistencia",
    ],
    pasos: [
      {
        narracion: "Abrimos el Registro de Asistencia.",
        accion: "navegar",
        ruta: "/asistencia",
      },
      {
        narracion: "Si ves el menú de Asistencia, entra a 'Registro de Asistencia'.",
        accion: "click",
        ancla: "asistencia.menu_registro",
        opcional: true,
      },
      {
        narracion: "Selecciona la asignatura.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Ahora el grado.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_grado",
        campo: "grado",
      },
      {
        narracion: "Y el salón.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_salon",
        campo: "salon",
      },
      {
        narracion: "Toca la casilla del estudiante en el día que quieres limpiar.",
        accion: "click",
        ancla: "asistencia.celda_matriz",
      },
      {
        narracion: "En el globo, toca 'Quitar' (solo aparece si esa casilla ya tenía una marca).",
        accion: "click",
        ancla: "asistencia.popover_quitar",
      },
      {
        narracion: "La marca se borra. Si era una inasistencia ya avisada, se notifica al acudiente que fue anulada. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "asistencia.ver_calendario_estudiante",
    titulo: "Ver el calendario de asistencia de un estudiante",
    descripcion:
      "Abrir el calendario mensual de un estudiante en una asignatura, con su porcentaje y desglose de asistencia.",
    categoria: "Asistencia",
    roles: [...VEN_ASISTENCIA],
    ruta: "/asistencia",
    endpoint: "GET /api/asistencia/historial (internos; el profesor solo sus clases)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura." },
      { entidad: "grado", descripcion: "Grado." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "estudiante", descripcion: "Estudiante a revisar." },
    ],
    sinonimos: [
      "ver el calendario de asistencia de un estudiante",
      "ver las faltas de un estudiante mes a mes",
      "revisar la asistencia de un alumno",
      "abrir el calendario de asistencia de alguien",
      "ver el porcentaje de asistencia de un estudiante",
    ],
    pasos: [
      {
        narracion: "Abrimos el Registro de Asistencia.",
        accion: "navegar",
        ruta: "/asistencia",
      },
      {
        narracion: "Si ves el menú de Asistencia, entra a 'Registro de Asistencia'.",
        accion: "click",
        ancla: "asistencia.menu_registro",
        opcional: true,
      },
      {
        narracion: "Selecciona la asignatura.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Ahora el grado.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_grado",
        campo: "grado",
      },
      {
        narracion: "Y el salón.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_salon",
        campo: "salon",
      },
      {
        narracion: "En la matriz, toca el nombre del estudiante.",
        accion: "click",
        ancla: "asistencia.nombre_estudiante",
        campo: "estudiante",
      },
      {
        narracion:
          "Se abre su calendario del mes con cada día coloreado por estado y el resumen de porcentaje. Usa las flechas de arriba para cambiar de mes y cierra con la X cuando termines. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "asistencia.corregir_calendario",
    titulo: "Corregir una marca desde el calendario del estudiante",
    descripcion:
      "Dentro del calendario mensual de un estudiante, cambiar o quitar la marca de un día puntual.",
    categoria: "Asistencia",
    roles: [...TOMAN_ASISTENCIA],
    ruta: "/asistencia",
    endpoint: "POST /api/asistencia/marcar y /quitar (Profesor, Administrador; el profesor solo sus clases)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura." },
      { entidad: "grado", descripcion: "Grado." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "estudiante", descripcion: "Estudiante a corregir." },
      { entidad: "fecha", descripcion: "Día concreto dentro del calendario." },
    ],
    sinonimos: [
      "corregir la asistencia desde el calendario",
      "cambiar un día en el calendario del estudiante",
      "editar una falta en el calendario",
      "quitar una marca desde el calendario",
    ],
    pasos: [
      {
        narracion: "Abrimos el Registro de Asistencia.",
        accion: "navegar",
        ruta: "/asistencia",
      },
      {
        narracion: "Si ves el menú de Asistencia, entra a 'Registro de Asistencia'.",
        accion: "click",
        ancla: "asistencia.menu_registro",
        opcional: true,
      },
      {
        narracion: "Selecciona la asignatura.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Ahora el grado.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_grado",
        campo: "grado",
      },
      {
        narracion: "Y el salón.",
        accion: "seleccionar",
        ancla: "asistencia.consulta_selector_salon",
        campo: "salon",
      },
      {
        narracion: "En la matriz, toca el nombre del estudiante para abrir su calendario.",
        accion: "click",
        ancla: "asistencia.nombre_estudiante",
        campo: "estudiante",
      },
      {
        narracion: "Toca el día que quieres corregir en la grilla del mes.",
        accion: "click",
        ancla: "asistencia.cal_dia",
        campo: "fecha",
      },
      {
        narracion: "En la barra que aparece abajo, elige el nuevo estado; o toca el botón Quitar para borrar la marca de ese día.",
        accion: "click",
        ancla: "asistencia.cal_estado_boton",
        campo: "estado",
      },
      {
        narracion: "El cambio se guarda y el resumen del mes se actualiza. Listo.",
        accion: "explicar",
      },
    ],
  },
];
