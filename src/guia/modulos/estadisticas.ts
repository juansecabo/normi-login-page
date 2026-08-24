// Catálogo "Normi te guía" — Módulo ESTADÍSTICAS (análisis académico).
//
// Dos puntos de entrada distintos según el rol:
//  - Directivos (rector, coordinador, admin, administrativo, secretaria,
//    orientador) usan el tablero /estadisticas (EstadisticasDashboard), con el
//    filtro "Nivel de Análisis": Institución, Por Grado, Por Salón, Por
//    Estudiante y Por Asignatura. Guard de UI: puedeAccederDashboard() (deja
//    entrar también a Portero, pero el backend de estadísticas NO lo autoriza,
//    así que portero queda fuera de estas capacidades).
//  - Profesor usa su propia página /profesor/estadisticas (EstadisticasProfesor),
//    limitada a sus asignaciones: análisis Por Asignatura y Por Estudiante.
//
// Endpoints reales (apiClient.estadisticas.*): /api/estadisticas/meta,
// /institucional, /grado, /salon, /estudiante, /asignatura, /riesgo y
// /api/consolidado-grupo. Todo es lectura (multi-tenant por colegio_id).
//
// Las páginas ModoVisualizacion / ListaAsignaturas / ListaEstudiantes /
// EstudianteConsolidado son la ruta de los DIRECTIVOS para ver el consolidado de
// notas de un salón (breadcrumb "Notas"); su guard es isRectorOrCoordinador()
// (rector, coordinador, admin, administrativo, secretaria, orientador).
//
// ConsolidadoGrupo (/consolidado-grupo) es solo para el profesor director de
// grupo (Internos.direccion_de_grupo) — requiereDirectorGrupo: true.

import type { Capacidad, RolGuia } from "../tipos";

// Directivos con acceso al tablero de estadísticas (guard del backend, SIN portero).
const DIRECTIVOS: RolGuia[] = [
  "admin",
  "rector",
  "coordinador",
  "administrativo",
  "secretaria",
  "orientador",
];

// Pasos compartidos para abrir el tablero de estadísticas de los directivos.
const abrirTablero = () =>
  [
    {
      narracion: "Entramos a Estadísticas desde el tablero.",
      accion: "navegar" as const,
      ruta: "/estadisticas",
    },
    {
      narracion: "Esperamos a que carguen los datos del colegio.",
      accion: "esperar" as const,
      ancla: "estadisticas.filtros",
    },
    {
      narracion: "Elige el periodo que quieres analizar (o Acumulado Anual).",
      accion: "seleccionar" as const,
      ancla: "estadisticas.filtro_periodo",
      campo: "periodo",
      opcional: true,
    },
  ];

export const ESTADISTICAS: Capacidad[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Tablero de directivos: los 5 niveles de análisis
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "estadisticas.ver_institucional",
    titulo: "Ver las estadísticas de todo el colegio",
    descripcion:
      "Abrir el análisis institucional: promedio general, distribución por niveles, evolución por periodo y rankings de grados, salones y estudiantes.",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/estadisticas",
    endpoint: "GET /api/estadisticas/institucional (directivos)",
    requisitos: [{ entidad: "periodo", descripcion: "Periodo a analizar (o anual)." }],
    sinonimos: [
      "estadísticas del colegio",
      "cómo va la institución",
      "promedio general del colegio",
      "ver el rendimiento institucional",
      "estadísticas generales",
    ],
    pasos: [
      ...abrirTablero(),
      {
        narracion: "En 'Nivel de Análisis' elige 'Institución'.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_nivel",
        campo: "nivel_analisis",
      },
      {
        narracion:
          "Ya ves el promedio institucional, la distribución por desempeño, la evolución y los rankings.",
        accion: "esperar",
        ancla: "estadisticas.resultado",
      },
    ],
  },
  {
    id: "estadisticas.ver_por_grado",
    titulo: "Ver las estadísticas de un grado",
    descripcion:
      "Analizar el rendimiento de un grado completo: promedio, distribución y comparación de salones.",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/estadisticas",
    endpoint: "GET /api/estadisticas/grado (directivos)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado a analizar." },
      { entidad: "periodo", descripcion: "Periodo (o anual)." },
    ],
    sinonimos: [
      "estadísticas de un grado",
      "cómo va tercero",
      "rendimiento de un grado",
      "análisis por grado",
    ],
    pasos: [
      ...abrirTablero(),
      {
        narracion: "En 'Nivel de Análisis' elige 'Por Grado'.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_nivel",
        campo: "nivel_analisis",
      },
      {
        narracion: "Selecciona el grado que quieres ver.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_grado",
        campo: "grado",
      },
      {
        narracion: "Esperamos a que cargue el análisis del grado.",
        accion: "esperar",
        ancla: "estadisticas.resultado",
      },
    ],
  },
  {
    id: "estadisticas.ver_por_salon",
    titulo: "Ver las estadísticas de un salón",
    descripcion:
      "Analizar un salón concreto: promedio, distribución de desempeño y ranking de sus estudiantes.",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/estadisticas",
    endpoint: "GET /api/estadisticas/salon (directivos)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Salón a analizar." },
      { entidad: "periodo", descripcion: "Periodo (o anual)." },
    ],
    sinonimos: [
      "estadísticas de un salón",
      "cómo va un curso",
      "rendimiento de un salón",
      "análisis por salón",
    ],
    pasos: [
      ...abrirTablero(),
      {
        narracion: "En 'Nivel de Análisis' elige 'Por Salón'.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_nivel",
        campo: "nivel_analisis",
      },
      {
        narracion: "Selecciona el grado.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_grado",
        campo: "grado",
      },
      {
        narracion: "Ahora elige el salón.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_salon",
        campo: "salon",
      },
      {
        narracion: "Esperamos a que cargue el análisis del salón.",
        accion: "esperar",
        ancla: "estadisticas.resultado",
      },
    ],
  },
  {
    id: "estadisticas.ver_por_estudiante",
    titulo: "Ver las estadísticas de un estudiante",
    descripcion:
      "Analizar el rendimiento de un estudiante: promedio, evolución por periodo y desempeño por asignatura.",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/estadisticas",
    endpoint: "GET /api/estadisticas/estudiante (directivos)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado del estudiante." },
      { entidad: "salon", descripcion: "Salón del estudiante." },
      { entidad: "estudiante", descripcion: "Estudiante a analizar." },
      { entidad: "periodo", descripcion: "Periodo (o anual)." },
    ],
    sinonimos: [
      "estadísticas de un estudiante",
      "cómo va un alumno",
      "rendimiento de un estudiante",
      "análisis de un estudiante",
    ],
    pasos: [
      ...abrirTablero(),
      {
        narracion: "En 'Nivel de Análisis' elige 'Por Estudiante'.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_nivel",
        campo: "nivel_analisis",
      },
      {
        narracion: "Selecciona el grado.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_grado",
        campo: "grado",
      },
      {
        narracion: "Elige el salón.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_salon",
        campo: "salon",
      },
      {
        narracion: "Ahora elige al estudiante.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_estudiante",
        campo: "estudiante",
      },
      {
        narracion: "Esperamos a que cargue su análisis.",
        accion: "esperar",
        ancla: "estadisticas.resultado",
      },
    ],
  },
  {
    id: "estadisticas.ver_por_asignatura",
    titulo: "Ver las estadísticas de una asignatura",
    descripcion:
      "Analizar una asignatura (opcionalmente acotada a un grado y salón): promedio, distribución y estudiantes que la reprueban.",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/estadisticas",
    endpoint: "GET /api/estadisticas/asignatura (directivos)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura a analizar." },
      { entidad: "grado", descripcion: "Grado (opcional)." },
      { entidad: "salon", descripcion: "Salón (opcional)." },
      { entidad: "periodo", descripcion: "Periodo (o anual)." },
    ],
    sinonimos: [
      "estadísticas de una asignatura",
      "cómo va matemáticas",
      "rendimiento de una materia",
      "análisis por asignatura",
    ],
    pasos: [
      ...abrirTablero(),
      {
        narracion: "En 'Nivel de Análisis' elige 'Por Asignatura'.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_nivel",
        campo: "nivel_analisis",
      },
      {
        narracion:
          "Si quieres, acota por grado y salón (son opcionales); si no eliges nada ves la asignatura en todo el colegio",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_grado",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Elige la asignatura.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Esperamos a que cargue el análisis de la asignatura.",
        accion: "esperar",
        ancla: "estadisticas.resultado",
      },
    ],
  },
  {
    id: "estadisticas.cambiar_periodo",
    titulo: "Cambiar el periodo del análisis",
    descripcion:
      "Cambiar el periodo (1 a 4) o el Acumulado Anual con el que se calculan las estadísticas que estás viendo.",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/estadisticas",
    requisitos: [{ entidad: "periodo", descripcion: "Periodo o acumulado anual." }],
    sinonimos: [
      "cambiar el periodo",
      "ver el periodo 2",
      "estadísticas del acumulado anual",
      "poner otro periodo",
    ],
    pasos: [
      {
        narracion: "Entramos a Estadísticas desde el tablero.",
        accion: "navegar",
        ruta: "/estadisticas",
      },
      {
        narracion: "Abrimos el filtro 'Período' arriba del tablero.",
        accion: "click",
        ancla: "estadisticas.filtro_periodo",
      },
      {
        narracion: "Elige el periodo (1, 2, 3, 4) o 'Acumulado Anual'.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_periodo",
        campo: "periodo",
      },
      {
        narracion: "Las cifras se recalculan solas para ese periodo. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "estadisticas.ver_estudiantes_riesgo",
    titulo: "Ver los estudiantes en riesgo académico",
    descripcion:
      "Abrir la lista de estudiantes con promedio por debajo de la nota aprobatoria del colegio, según los filtros actuales.",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/estadisticas",
    endpoint: "GET /api/estadisticas/riesgo (isRectorOrCoordinador)",
    requisitos: [{ entidad: "periodo", descripcion: "Periodo (o anual)." }],
    sinonimos: [
      "estudiantes en riesgo",
      "quiénes están perdiendo",
      "estudiantes reprobando",
      "riesgo académico",
      "quiénes van mal",
      "mortalidad académica",
      "cuántos van perdiendo",
    ],
    pasos: [
      ...abrirTablero(),
      {
        narracion:
          "Elige el nivel de análisis que te interese (institución, grado, salón o asignatura); el conteo de riesgo aparece en las tarjetas de arriba.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_nivel",
        campo: "nivel_analisis",
        opcional: true,
      },
      {
        narracion:
          "Toca la tarjeta roja de En Riesgo (en Institución y Salón dice En Riesgo Académico).",
        accion: "click",
        ancla: "estadisticas.tarjeta_riesgo",
      },
      {
        narracion:
          "Se abre la tabla con los estudiantes en riesgo, ordenados del promedio más bajo al más alto.",
        accion: "esperar",
        ancla: "estadisticas.tabla_riesgo",
      },
    ],
  },
  {
    id: "estadisticas.descargar_pdf",
    titulo: "Descargar el análisis en PDF",
    descripcion:
      "Exportar a PDF el análisis que estás viendo (institución, grado, salón, estudiante o asignatura).",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/estadisticas",
    sinonimos: [
      "descargar las estadísticas en pdf",
      "exportar el análisis",
      "bajar el reporte en pdf",
      "guardar las estadísticas",
    ],
    pasos: [
      ...abrirTablero(),
      {
        narracion: "Elige el nivel de análisis que quieres exportar.",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_nivel",
        campo: "nivel_analisis",
        opcional: true,
      },
      {
        narracion: "Toca el botón 'Descargar PDF' arriba a la derecha del análisis.",
        accion: "click",
        ancla: "estadisticas.boton_descargar_pdf",
      },
      {
        narracion: "El PDF se genera y se descarga a tu dispositivo. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "estadisticas.ver_completitud",
    titulo: "Revisar si el periodo tiene todas las notas",
    descripcion:
      "Abrir el indicador de completitud (Completo / Incompleto) para ver qué profesores tienen notas pendientes en el periodo.",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/estadisticas",
    sinonimos: [
      "quién tiene notas pendientes",
      "revisar completitud de notas",
      "qué profesores faltan por subir notas",
      "está completo el periodo",
      "verificar registro de notas",
    ],
    pasos: [
      ...abrirTablero(),
      {
        narracion: "Elige el nivel de análisis: Institución, Por Grado, Por Salón o Por Asignatura (en Por Estudiante no aparece este indicador).",
        accion: "seleccionar",
        ancla: "estadisticas.filtro_nivel",
        campo: "nivel_analisis",
        opcional: true,
      },
      {
        narracion:
          "Toca la etiqueta 'Completo' o 'Incompleto' que está junto al botón de descarga.",
        accion: "click",
        ancla: "estadisticas.indicador_completitud",
      },
      {
        narracion:
          "Se abre una ventana con el resumen: si está incompleto, lista los profesores con notas pendientes.",
        accion: "explicar",
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Página del profesor: /profesor/estadisticas
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "estadisticas.profesor_por_asignatura",
    titulo: "Ver las estadísticas de tu asignatura",
    descripcion:
      "Como profesor, analizar el rendimiento de una de tus asignaturas, con opción de acotar a un grado y salón.",
    categoria: "Estadísticas",
    roles: ["profesor"],
    ruta: "/profesor/estadisticas",
    endpoint: "GET /api/estadisticas/asignatura (directivos y profesores; la UI del profesor lo limita a sus asignaciones)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Una de tus asignaturas." },
      { entidad: "grado", descripcion: "Grado (opcional, 'Todos' por defecto)." },
      { entidad: "salon", descripcion: "Salón (opcional)." },
      { entidad: "periodo", descripcion: "Periodo (o anual)." },
    ],
    sinonimos: [
      "estadísticas de mi asignatura",
      "cómo va mi materia",
      "rendimiento de mi curso",
      "análisis de mis notas",
      "estadísticas de mis estudiantes",
    ],
    pasos: [
      {
        narracion: "Abrimos tus estadísticas de profesor.",
        accion: "navegar",
        ruta: "/profesor/estadisticas",
      },
      {
        narracion: "Elige la asignatura que quieres analizar.",
        accion: "seleccionar",
        ancla: "estadisticas.prof_filtro_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Elige el periodo (o Acumulado Anual).",
        accion: "seleccionar",
        ancla: "estadisticas.prof_filtro_periodo",
        campo: "periodo",
        opcional: true,
      },
      {
        narracion:
          "Si quieres, acota a un grado y un salón concretos; déjalos en 'Todos' para ver toda la asignatura.",
        accion: "seleccionar",
        ancla: "estadisticas.prof_filtro_grado",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Esperamos a que cargue el análisis.",
        accion: "esperar",
        ancla: "estadisticas.resultado",
      },
      {
        narracion:
          "Si necesitas guardarlo, toca 'Descargar PDF' arriba a la derecha del análisis.",
        accion: "click",
        ancla: "estadisticas.boton_descargar_pdf",
        opcional: true,
      },
    ],
  },
  {
    id: "estadisticas.profesor_por_estudiante",
    titulo: "Ver las estadísticas de uno de tus estudiantes",
    descripcion:
      "Como profesor, analizar a un estudiante concreto de un salón donde dictas: evolución y desempeño.",
    categoria: "Estadísticas",
    roles: ["profesor"],
    ruta: "/profesor/estadisticas",
    endpoint: "GET /api/estadisticas/estudiante (profesor)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Una de tus asignaturas." },
      { entidad: "grado", descripcion: "Grado del estudiante." },
      { entidad: "salon", descripcion: "Salón del estudiante." },
      { entidad: "estudiante", descripcion: "Estudiante a analizar." },
      { entidad: "periodo", descripcion: "Periodo (o anual)." },
    ],
    sinonimos: [
      "estadísticas de un estudiante mío",
      "cómo va un alumno de mi curso",
      "análisis de un estudiante",
      "ver el rendimiento de un estudiante",
    ],
    pasos: [
      {
        narracion: "Abrimos tus estadísticas de profesor.",
        accion: "navegar",
        ruta: "/profesor/estadisticas",
      },
      {
        narracion: "Elige la asignatura.",
        accion: "seleccionar",
        ancla: "estadisticas.prof_filtro_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Elige el grado (un grado específico, no 'Todos').",
        accion: "seleccionar",
        ancla: "estadisticas.prof_filtro_grado",
        campo: "grado",
      },
      {
        narracion: "Elige el salón.",
        accion: "seleccionar",
        ancla: "estadisticas.prof_filtro_salon",
        campo: "salon",
      },
      {
        narracion: "Ahora elige al estudiante.",
        accion: "seleccionar",
        ancla: "estadisticas.prof_filtro_estudiante",
        campo: "estudiante",
      },
      {
        narracion: "Esperamos a que cargue el análisis del estudiante.",
        accion: "esperar",
        ancla: "estadisticas.resultado",
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Consolidado de notas de un salón (directivos): ModoVisualizacion → ...
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "estadisticas.consolidado_por_asignatura",
    titulo: "Ver el consolidado de notas de un salón por asignatura",
    descripcion:
      "Como directivo, abrir la planilla de notas (solo lectura) de una asignatura de un salón, eligiendo grado, salón y asignatura.",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/modo-visualizacion",
    endpoint: "POST /api/db (Notas select — solo lectura para directivos)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "asignatura", descripcion: "Asignatura a consultar." },
    ],
    sinonimos: [
      "ver las notas de un salón por asignatura",
      "consolidado por asignatura",
      "revisar la planilla de un curso",
      "ver notas de una materia de un salón",
    ],
    pasos: [
      {
        narracion: "Entramos a Notas para elegir el salón.",
        accion: "navegar",
        ruta: "/seleccionar-grado",
      },
      {
        narracion: "Elige el grado.",
        accion: "click",
        ancla: "estadisticas.select_grado_item",
        campo: "grado",
      },
      {
        narracion: "Elige el salón.",
        accion: "click",
        ancla: "estadisticas.select_salon_item",
        campo: "salon",
      },
      {
        narracion: "Elige 'Por Asignatura' cuando la pantalla pregunte cómo deseas ver las notas.",
        accion: "click",
        ancla: "estadisticas.modo_por_asignatura",
      },
      {
        narracion: "Selecciona la asignatura que quieres consultar.",
        accion: "click",
        ancla: "estadisticas.item_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Se abre la tabla de notas de esa asignatura en modo solo lectura.",
        accion: "esperar",
        ancla: "estadisticas.resultado",
      },
    ],
  },
  {
    id: "estadisticas.consolidado_por_estudiante",
    titulo: "Ver el consolidado de notas de un estudiante",
    descripcion:
      "Como directivo, abrir el consolidado de todas las asignaturas de un estudiante de un salón (solo lectura), eligiendo grado, salón y estudiante.",
    categoria: "Estadísticas",
    roles: [...DIRECTIVOS],
    ruta: "/estudiante-consolidado",
    endpoint: "POST /api/db (Notas select — solo lectura para directivos)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado del estudiante." },
      { entidad: "salon", descripcion: "Salón." },
      { entidad: "estudiante", descripcion: "Estudiante a consultar." },
      { entidad: "periodo", descripcion: "Periodo a ver (1 a 4)." },
    ],
    sinonimos: [
      "ver todas las notas de un estudiante",
      "consolidado de un estudiante",
      "sábana de notas",
      "boletín de notas de un alumno",
      "situación académica de un estudiante",
    ],
    pasos: [
      {
        narracion: "Entramos a Notas para elegir el salón.",
        accion: "navegar",
        ruta: "/seleccionar-grado",
      },
      {
        narracion: "Elige el grado.",
        accion: "click",
        ancla: "estadisticas.select_grado_item",
        campo: "grado",
      },
      {
        narracion: "Elige el salón.",
        accion: "click",
        ancla: "estadisticas.select_salon_item",
        campo: "salon",
      },
      {
        narracion: "Elige 'Por Estudiante' cuando la pantalla pregunte cómo deseas ver las notas.",
        accion: "click",
        ancla: "estadisticas.modo_por_estudiante",
      },
      {
        narracion: "Selecciona al estudiante de la lista.",
        accion: "click",
        ancla: "estadisticas.item_estudiante",
        campo: "estudiante",
      },
      {
        narracion: "Elige el periodo tocando una de las tarjetas (1º a 4º).",
        accion: "click",
        ancla: "estadisticas.consolidado_periodo",
        campo: "periodo",
      },
      {
        narracion: "Ya ves su consolidado con todas las asignaturas de ese periodo. Listo.",
        accion: "explicar",
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Consolidado de grupo (solo profesor director de grupo)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "estadisticas.consolidado_grupo_ver",
    titulo: "Ver el consolidado de tu grupo (definitivas)",
    descripcion:
      "Como director de grupo, ver en una sola rejilla las definitivas de todos tus estudiantes por asignatura, para el periodo que elijas.",
    categoria: "Estadísticas",
    roles: ["profesor"],
    requiereDirectorGrupo: true,
    ruta: "/consolidado-grupo",
    endpoint: "GET /api/consolidado-grupo (director de grupo)",
    requisitos: [{ entidad: "periodo", descripcion: "Periodo a ver (1 a 4)." }],
    sinonimos: [
      "consolidado de mi grupo",
      "definitivas de mi salón",
      "notas finales de mi grupo",
      "ver las notas de mi dirección de grupo",
      "rejilla de mi curso",
    ],
    pasos: [
      {
        narracion: "Abrimos el consolidado de tu grupo.",
        accion: "navegar",
        ruta: "/consolidado-grupo",
      },
      {
        narracion: "Elige el periodo tocando una de las tarjetas (1º a 4º).",
        accion: "click",
        ancla: "estadisticas.grupo_periodo",
        campo: "periodo",
      },
      {
        narracion:
          "Se arma la rejilla: filas los estudiantes, columnas las asignaturas, y cada celda la definitiva. Si una asignatura no cerró el periodo, sale '(provisional)'.",
        accion: "esperar",
        ancla: "estadisticas.resultado",
      },
    ],
  },
  {
    id: "estadisticas.consolidado_grupo_excel",
    titulo: "Descargar el consolidado de tu grupo en Excel",
    descripcion:
      "Como director de grupo, exportar a Excel la rejilla de definitivas de tu grupo del periodo seleccionado.",
    categoria: "Estadísticas",
    roles: ["profesor"],
    requiereDirectorGrupo: true,
    ruta: "/consolidado-grupo",
    endpoint: "GET /api/consolidado-grupo (director de grupo)",
    requisitos: [{ entidad: "periodo", descripcion: "Periodo a exportar (1 a 4)." }],
    sinonimos: [
      "descargar el consolidado de mi grupo",
      "exportar las definitivas de mi salón a excel",
      "bajar las notas de mi grupo en excel",
      "sacar el consolidado de grupo",
    ],
    pasos: [
      {
        narracion: "Abrimos el consolidado de tu grupo.",
        accion: "navegar",
        ruta: "/consolidado-grupo",
      },
      {
        narracion: "Elige el periodo tocando una de las tarjetas (1º a 4º).",
        accion: "click",
        ancla: "estadisticas.grupo_periodo",
        campo: "periodo",
      },
      {
        narracion: "Toca 'Descargar Excel' arriba a la derecha de la rejilla.",
        accion: "click",
        ancla: "estadisticas.grupo_excel",
      },
      {
        narracion: "El archivo de Excel se descarga a tu dispositivo. Listo.",
        accion: "explicar",
      },
    ],
  },
];
