// Catálogo "Normi te guía" — Módulo BOLETINES, FORMATOS Y LOGROS.
//
// Reúne tres frentes que comparten el mismo espíritu (documentos que se llenan,
// se firman y/o se descargan, dejando registro consultable en la plataforma):
//
//  • Boletines (/boletines): réplica del INFORME DE DESEMPEÑO. Se consulta un
//    aula (grado, salón, periodo), se descargan los PDF (curso o estudiante) y
//    se revisan las inconsistencias del periodo de TODO el colegio, con opción
//    de recordar por WhatsApp al profesor con planillas incompletas.
//    Guard del backend (/api/boletines/*): Administrador, Rector, Coordinador(a),
//    Administrativo(a), Secretaria, Orientador(a) O profesor DIRECTOR de grupo.
//    Ojo: la PÁGINA deja entrar a más gente (cualquier interno con dashboard,
//    incluido Portero), pero el server rechaza a quien no esté en el guard. Por
//    eso "portero" NO va en roles y el director de grupo se anota en "notas"
//    (el filtro requiereDirectorGrupo restringiría a TODOS los roles, así que no
//    se usa aquí).
//
//  • Formatos (/formatos): hub con la Solicitud de permiso docente y su registro
//    (todos los colegios por backend/ruta, aunque el TILE del dashboard solo
//    aparece en Cailico y Pestalozziano) y, solo para el Pestalozziano (Cailico
//    como demo), las planillas de Nivelación y Apoyo con su registro.
//
//  • Logros del periodo (/profesor/logros): banco de logros por asignatura+grado,
//    compartido entre docentes; cada logro guarda una redacción por nivel de
//    desempeño y se marca en qué salones aplica. Alimenta la columna de logros
//    del boletín. La PÁGINA es profesor-only (redirige a "/" si no es profesor) y
//    depende de la carga académica del docente; por eso roles = ["profesor"]
//    aunque los endpoints /api/logros/* los acepte cualquier interno (no hay UI
//    para no-docentes).

import type { Capacidad } from "../tipos";

const CATEGORIA = "Boletines, Formatos y Logros";

// Guard real de /api/boletines/* (server). Profesor NO va aquí salvo que sea
// director de grupo (se anota en notas: el flag requiereDirectorGrupo forzaría a
// TODOS los roles a ser directores, así que no se aplica).
const BOLETINES_ROLES = [
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "admin",
] as const;

// Quienes tienen el tile "Formatos" en su dashboard (DashboardRector solo lo
// agrega a Rector y Coordinador(a); el del profesor esta gateado por colegio).
// El backend admite a mas cargos por URL directa, pero la guia solo senala.
const TODOS_INTERNOS = [
  "profesor",
  "rector",
  "coordinador",
  "admin",
] as const;

// Pasos compartidos para llegar al hub de Formatos y abrir una de sus fichas.
const abrirFormato = (ancla: string, nombre: string) =>
  [
    {
      narracion: "Entramos a Formatos desde el inicio.",
      accion: "navegar" as const,
      ruta: "/formatos",
    },
    {
      narracion: `Abre la ficha "${nombre}".`,
      accion: "click" as const,
      ancla,
    },
  ];

export const BOLETINES_FORMATOS_LOGROS: Capacidad[] = [
  // ─────────────────────────── BOLETINES ───────────────────────────
  {
    id: "boletines.consultar",
    titulo: "Consultar los boletines de un salón",
    descripcion:
      "Abrir el informe de desempeño de un grado, salón y periodo para revisar áreas, notas y logros antes de imprimir.",
    categoria: CATEGORIA,
    roles: [...BOLETINES_ROLES],
    ruta: "/boletines",
    endpoint: "GET /api/boletines/aula (Admin, Rector, Coordinador, Administrativo, Secretaria, Orientador o director de grupo)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Salón concreto." },
      { entidad: "periodo", descripcion: "Periodo (1 a 4) del informe." },
    ],
    sinonimos: [
      "ver los boletines",
      "consultar el informe de desempeño",
      "revisar los boletines de un salón",
      "abrir los boletines del curso",
      "ver el boletín de un grado",
    ],
    pasos: [
      {
        narracion: "Entramos a Boletines desde el inicio.",
        accion: "navegar",
        ruta: "/boletines",
      },
      {
        narracion: "Elige el grado.",
        accion: "seleccionar",
        ancla: "boletines.selector_grado",
        campo: "grado",
      },
      {
        narracion: "Elige el salón.",
        accion: "seleccionar",
        ancla: "boletines.selector_salon",
        campo: "salon",
      },
      {
        narracion: "Elige el periodo.",
        accion: "seleccionar",
        ancla: "boletines.selector_periodo",
        campo: "periodo",
      },
      {
        narracion:
          "Esperamos a que el sistema calcule y muestre la lista de estudiantes con sus notas.",
        accion: "esperar",
        ancla: "boletines.lista_estudiantes",
      },
    ],
  },
  {
    id: "boletines.descargar_curso",
    titulo: "Descargar el PDF con los boletines de todo el curso",
    descripcion:
      "Generar un solo PDF con el informe de desempeño de todos los estudiantes del salón en el periodo.",
    categoria: CATEGORIA,
    roles: [...BOLETINES_ROLES],
    ruta: "/boletines",
    endpoint: "Cliente (jsPDF) con los datos de GET /api/boletines/aula",
    requisitos: [
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Salón concreto." },
      { entidad: "periodo", descripcion: "Periodo del informe." },
    ],
    sinonimos: [
      "descargar los boletines del curso",
      "bajar el PDF de todos los boletines",
      "imprimir los boletines del salón",
      "sacar el PDF del curso completo",
    ],
    pasos: [
      {
        narracion: "Entramos a Boletines.",
        accion: "navegar",
        ruta: "/boletines",
      },
      {
        narracion: "Elige el grado.",
        accion: "seleccionar",
        ancla: "boletines.selector_grado",
        campo: "grado",
      },
      {
        narracion: "Elige el salón.",
        accion: "seleccionar",
        ancla: "boletines.selector_salon",
        campo: "salon",
      },
      {
        narracion: "Elige el periodo.",
        accion: "seleccionar",
        ancla: "boletines.selector_periodo",
        campo: "periodo",
      },
      {
        narracion: "Esperamos a que carguen los estudiantes.",
        accion: "esperar",
        ancla: "boletines.lista_estudiantes",
      },
      {
        narracion: "Toca 'Descargar PDF del curso' para generar el archivo con todos los boletines.",
        accion: "click",
        ancla: "boletines.boton_pdf_curso",
      },
      {
        narracion: "El PDF se arma y se descarga a tu dispositivo. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "boletines.descargar_estudiante",
    titulo: "Descargar el boletín individual de un estudiante",
    descripcion:
      "Generar el PDF del informe de desempeño de un solo estudiante del salón.",
    categoria: CATEGORIA,
    roles: [...BOLETINES_ROLES],
    ruta: "/boletines",
    endpoint: "Cliente (jsPDF) con los datos de GET /api/boletines/aula",
    requisitos: [
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Salón concreto." },
      { entidad: "periodo", descripcion: "Periodo del informe." },
      { entidad: "estudiante", descripcion: "Estudiante cuyo boletín se descarga." },
    ],
    sinonimos: [
      "descargar el boletín de un estudiante",
      "bajar el boletín individual",
      "imprimir el boletín de un alumno",
      "sacar el boletín de un solo estudiante",
    ],
    pasos: [
      {
        narracion: "Entramos a Boletines.",
        accion: "navegar",
        ruta: "/boletines",
      },
      {
        narracion: "Elige el grado.",
        accion: "seleccionar",
        ancla: "boletines.selector_grado",
        campo: "grado",
      },
      {
        narracion: "Elige el salón.",
        accion: "seleccionar",
        ancla: "boletines.selector_salon",
        campo: "salon",
      },
      {
        narracion: "Elige el periodo.",
        accion: "seleccionar",
        ancla: "boletines.selector_periodo",
        campo: "periodo",
      },
      {
        narracion: "Esperamos a que aparezca la lista de estudiantes.",
        accion: "esperar",
        ancla: "boletines.lista_estudiantes",
      },
      {
        narracion:
          "En la fila del estudiante, toca el ícono de descarga para bajar solo su boletín.",
        accion: "click",
        ancla: "boletines.boton_pdf_estudiante",
        campo: "estudiante",
      },
      {
        narracion: "El PDF individual se descarga. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "boletines.inconsistencias_ver",
    titulo: "Ver las inconsistencias del periodo",
    descripcion:
      "Revisar las planillas incompletas de todo el colegio en el periodo, agrupadas por profesor (estudiantes sin nota y actividades con huecos).",
    categoria: CATEGORIA,
    roles: [...BOLETINES_ROLES],
    ruta: "/boletines",
    endpoint: "GET /api/boletines/inconsistencias",
    requisitos: [
      { entidad: "periodo", descripcion: "Periodo a auditar." },
    ],
    sinonimos: [
      "ver las inconsistencias",
      "qué planillas están incompletas",
      "revisar quién tiene notas pendientes",
      "planillas incompletas del periodo",
      "quién no ha subido las notas",
    ],
    pasos: [
      {
        narracion: "Entramos a Boletines.",
        accion: "navegar",
        ruta: "/boletines",
      },
      {
        narracion: "Elige el periodo que quieres auditar.",
        accion: "seleccionar",
        ancla: "boletines.selector_periodo",
        campo: "periodo",
      },
      {
        narracion:
          "Baja a la sección 'Inconsistencias del periodo': ahí salen las planillas incompletas de todo el colegio, agrupadas por profesor.",
        accion: "esperar",
        ancla: "boletines.seccion_inconsistencias",
      },
    ],
  },
  {
    id: "boletines.inconsistencias_notificar",
    titulo: "Recordar por WhatsApp a un profesor con planillas incompletas",
    descripcion:
      "Enviar por WhatsApp a un profesor el detalle de sus planillas pendientes del periodo.",
    categoria: CATEGORIA,
    roles: [...BOLETINES_ROLES],
    ruta: "/boletines",
    endpoint: "POST /api/boletines/inconsistencias/notificar",
    requisitos: [
      { entidad: "periodo", descripcion: "Periodo de las planillas pendientes." },
      { entidad: "profesor", descripcion: "Profesor al que se le recuerda." },
    ],
    sinonimos: [
      "recordarle a un profesor que suba notas",
      "enviar recordatorio de planillas por WhatsApp",
      "avisar al profe que tiene notas pendientes",
      "mandar el recordatorio de inconsistencias",
    ],
    pasos: [
      {
        narracion: "Entramos a Boletines.",
        accion: "navegar",
        ruta: "/boletines",
      },
      {
        narracion: "Elige el periodo.",
        accion: "seleccionar",
        ancla: "boletines.selector_periodo",
        campo: "periodo",
      },
      {
        narracion:
          "Ubica al profesor en la sección de inconsistencias (abajo) y toca 'Recordar por WhatsApp'.",
        accion: "click",
        ancla: "boletines.boton_recordar_wa",
        campo: "profesor",
      },
      {
        narracion: "Confirma en la ventana tocando 'Enviar'. El profesor recibe el detalle por WhatsApp.",
        accion: "click",
        ancla: "boletines.confirmar_recordar_wa",
      },
    ],
  },

  // ─────────────────────── FORMATOS: PERMISO DOCENTE ───────────────────────
  {
    id: "formatos.permiso_docente_crear",
    titulo: "Solicitar un permiso docente",
    descripcion:
      "Llenar y firmar la solicitud de permiso docente; queda registrada y se notifica al rector y al coordinador del nivel por WhatsApp.",
    categoria: CATEGORIA,
    roles: ["profesor"],
    ruta: "/formatos/permiso-docente",
    endpoint: "POST /api/permisos/docente (todos los internos)",
    requisitos: [
      { entidad: "fecha", descripcion: "Fecha del permiso (obligatoria)." },
    ],
    sinonimos: [
      "solicitar un permiso",
      "pedir permiso para faltar",
      "llenar el formato de permiso docente",
      "solicitud de permiso",
      "necesito un permiso",
    ],
    pasos: [
      ...abrirFormato("formatos.ficha_permiso_docente", "Solicitud de permiso docente"),
      {
        narracion: "La fecha de solicitud viene con hoy; cámbiala si hace falta.",
        accion: "escribir",
        ancla: "permisodoc.fecha_solicitud",
        campo: "fecha_solicitud",
        opcional: true,
      },
      {
        narracion: "Confirma o corrige tu nombre como docente.",
        accion: "escribir",
        ancla: "permisodoc.nombre_docente",
        campo: "nombre_docente",
      },
      {
        narracion: "Pon la fecha del permiso.",
        accion: "escribir",
        ancla: "permisodoc.fecha_permiso",
        campo: "fecha_permiso",
      },
      {
        narracion: "Indica el total de horas que estarás ausente.",
        accion: "escribir",
        ancla: "permisodoc.total_horas",
        campo: "total_horas",
        opcional: true,
      },
      {
        narracion: "Escribe el motivo del permiso.",
        accion: "escribir",
        ancla: "permisodoc.motivo",
        campo: "motivo",
      },
      {
        narracion:
          "Si dejas clases a cargo de otros docentes, usa 'Agregar' para sumar cada renglón (hora, grado, asignatura y docente a cargo).",
        accion: "click",
        ancla: "permisodoc.agregar_cargo",
        opcional: true,
      },
      {
        narracion: "Anota el docente a cargo de la zona de apoyo en el descanso.",
        accion: "escribir",
        ancla: "permisodoc.zona_apoyo",
        campo: "zona_apoyo",
        opcional: true,
      },
      {
        narracion: "Firma con el dedo en el recuadro de firma del docente.",
        accion: "click",
        ancla: "permisodoc.firma",
        campo: "firma",
      },
      {
        narracion: "Toca 'Guardar'. Queda registrado y se avisa al rector y a tu coordinador.",
        accion: "click",
        ancla: "permisodoc.boton_guardar",
      },
      {
        narracion:
          "Si además quieres el PDF, usa 'Guardar y descargar PDF' en vez de 'Guardar'.",
        accion: "explicar",
        opcional: true,
      },
    ],
  },
  {
    id: "formatos.permiso_docente_registro",
    titulo: "Consultar el registro de permisos docentes",
    descripcion:
      "Ver las solicitudes de permiso docente registradas. El profesor ve solo las suyas; rectoría y secretaría ven todas, y coordinación las de sus niveles.",
    categoria: CATEGORIA,
    roles: [...TODOS_INTERNOS],
    ruta: "/formatos/permisos-docentes",
    endpoint: "GET /api/permisos/docente (visibilidad por rol)",
    sinonimos: [
      "ver los permisos docentes",
      "consultar las solicitudes de permiso",
      "registro de permisos",
      "quién ha pedido permiso",
      "mis permisos solicitados",
    ],
    pasos: [
      ...abrirFormato("formatos.ficha_permisos_registro", "Permisos docentes (registro)"),
      {
        narracion:
          "Aparece la lista de solicitudes. Si eres profesor ves solo las tuyas; rectoría y secretaría ven todas, y coordinación las de sus niveles.",
        accion: "esperar",
        ancla: "permisosconsulta.lista",
      },
    ],
  },
  {
    id: "formatos.permiso_docente_pdf",
    titulo: "Descargar el PDF de un permiso docente",
    descripcion:
      "Bajar en PDF una solicitud de permiso docente ya registrada, desde el registro.",
    categoria: CATEGORIA,
    roles: [...TODOS_INTERNOS],
    ruta: "/formatos/permisos-docentes",
    endpoint: "Cliente (jsPDF) con los datos de GET /api/permisos/docente",
    sinonimos: [
      "descargar el PDF de un permiso",
      "bajar la solicitud de permiso en PDF",
      "imprimir un permiso docente",
    ],
    pasos: [
      ...abrirFormato("formatos.ficha_permisos_registro", "Permisos docentes (registro)"),
      {
        narracion: "Ubica la solicitud en la lista.",
        accion: "esperar",
        ancla: "permisosconsulta.lista",
      },
      {
        narracion: "Toca el botón 'PDF' de esa solicitud para descargarla.",
        accion: "click",
        ancla: "permisosconsulta.boton_pdf",
      },
    ],
  },

  // ─────────────── FORMATOS: PLANILLAS (solo Pestalozziano) ───────────────
  {
    id: "formatos.nivelacion_crear",
    titulo: "Diligenciar una planilla de Plan de Nivelación",
    descripcion:
      "Registrar la planilla de nivelación por periodo: elegir asignatura, grado y salón, agregar estudiantes con su nota definitiva y firmas, y guardar.",
    categoria: CATEGORIA,
    roles: ["profesor"],
    gate: "pestalozziano",
    ruta: "/formatos/nivelacion",
    endpoint: "POST /api/formatos (tipo nivelacion; notifica al rector y coordinador)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura de la carga del docente." },
      { entidad: "grado", descripcion: "Grado que dicta." },
      { entidad: "salon", descripcion: "Salón concreto." },
      { entidad: "periodo", descripcion: "Periodo de la nivelación." },
      { entidad: "estudiante", descripcion: "Estudiantes que entran a la planilla." },
    ],
    sinonimos: [
      "hacer una planilla de nivelación",
      "diligenciar el plan de nivelación",
      "llenar la nivelación por periodo",
      "registrar nivelaciones",
    ],
    pasos: [
      ...abrirFormato("formatos.ficha_nivelacion", "Plan de Nivelación por período"),
      {
        narracion: "Elige la asignatura.",
        accion: "seleccionar",
        ancla: "nivelacion.select_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Elige el grado.",
        accion: "seleccionar",
        ancla: "nivelacion.select_grado",
        campo: "grado",
      },
      {
        narracion: "Elige el salón.",
        accion: "seleccionar",
        ancla: "nivelacion.select_salon",
        campo: "salon",
      },
      {
        narracion: "Escribe el periodo, por ejemplo Primer período.",
        accion: "escribir",
        ancla: "nivelacion.periodo",
        campo: "periodo",
      },
      {
        narracion: "Ajusta la fecha si hace falta.",
        accion: "escribir",
        ancla: "nivelacion.fecha",
        campo: "fecha",
        opcional: true,
      },
      {
        narracion: "En el desplegable de agregar estudiante, elige uno del listado del salón.",
        accion: "seleccionar",
        ancla: "nivelacion.agregar_estudiante",
        campo: "estudiante",
      },
      {
        narracion: "Toca 'Agregar'. Repite por cada estudiante que necesites.",
        accion: "click",
        ancla: "nivelacion.boton_agregar_estudiante",
      },
      {
        narracion: "En su fila, escribe la nota definitiva y las observaciones.",
        accion: "escribir",
        ancla: "nivelacion.fila_nota",
        campo: "nota",
      },
      {
        narracion:
          "Para la firma del estudiante, toca 'Firmar', que firme con el dedo y guarda la firma.",
        accion: "click",
        ancla: "nivelacion.fila_firmar",
        opcional: true,
      },
      {
        narracion: "Firma tú como docente en el recuadro de abajo.",
        accion: "click",
        ancla: "nivelacion.firma_docente",
        campo: "firma",
      },
      {
        narracion: "Toca 'Guardar'. Queda registrada y se avisa al rector y a tu coordinador.",
        accion: "click",
        ancla: "nivelacion.boton_guardar",
      },
      {
        narracion:
          "Si además quieres el PDF, usa 'Guardar y descargar PDF' en vez de 'Guardar'.",
        accion: "explicar",
        opcional: true,
      },
    ],
  },
  {
    id: "formatos.apoyo_crear",
    titulo: "Diligenciar una planilla de Plan de Apoyo al Mejoramiento",
    descripcion:
      "Registrar el plan de apoyo: elegir grado y salón (carga los estudiantes), poner Taller (40%) y Sustentación (60%); la definitiva se calcula sola. Firmar y guardar.",
    categoria: CATEGORIA,
    roles: [...TODOS_INTERNOS],
    gate: "pestalozziano",
    ruta: "/formatos/apoyo",
    endpoint: "POST /api/formatos (tipo apoyo; notifica al rector y coordinador)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado del salón." },
      { entidad: "salon", descripcion: "Salón concreto (carga sus estudiantes)." },
      { entidad: "periodo", descripcion: "Periodo del apoyo." },
      { entidad: "asignatura", descripcion: "Asignatura del plan de apoyo (texto libre)." },
    ],
    sinonimos: [
      "hacer una planilla de apoyo",
      "diligenciar el plan de apoyo al mejoramiento",
      "llenar el apoyo con taller y sustentación",
      "registrar el plan de apoyo",
      "planilla de recuperación",
      "recuperar la materia",
    ],
    pasos: [
      ...abrirFormato("formatos.ficha_apoyo", "Plan de Apoyo al Mejoramiento"),
      {
        narracion: "Elige el grado.",
        accion: "seleccionar",
        ancla: "apoyo.select_grado",
        campo: "grado",
      },
      {
        narracion: "Elige el salón. Se cargan solos los estudiantes en la tabla.",
        accion: "seleccionar",
        ancla: "apoyo.select_salon",
        campo: "salon",
      },
      {
        narracion: "Escribe el periodo, por ejemplo Primer período.",
        accion: "escribir",
        ancla: "apoyo.periodo",
        campo: "periodo",
      },
      {
        narracion: "Confirma o corrige el docente.",
        accion: "escribir",
        ancla: "apoyo.docente",
        campo: "docente",
      },
      {
        narracion: "Escribe la asignatura.",
        accion: "escribir",
        ancla: "apoyo.asignatura",
        campo: "asignatura",
      },
      {
        narracion:
          "Por cada estudiante, escribe la nota del Taller (40%) y la de Sustentación (60%). La Definitiva se calcula sola.",
        accion: "escribir",
        ancla: "apoyo.fila_taller",
        campo: "taller",
      },
      {
        narracion: "Agrega observaciones si las necesitas.",
        accion: "escribir",
        ancla: "apoyo.fila_obs",
        campo: "observaciones",
        opcional: true,
      },
      {
        narracion: "Firma como docente en el recuadro de firma.",
        accion: "click",
        ancla: "apoyo.firma_docente",
        campo: "firma",
      },
      {
        narracion: "Toca 'Guardar'. Queda registrada y se avisa al rector y a tu coordinador.",
        accion: "click",
        ancla: "apoyo.boton_guardar",
      },
      {
        narracion:
          "Si además quieres el PDF, usa 'Guardar y descargar PDF' en vez de 'Guardar'.",
        accion: "explicar",
        opcional: true,
      },
    ],
  },
  {
    id: "formatos.planillas_registro",
    titulo: "Consultar el registro de planillas diligenciadas",
    descripcion:
      "Ver las planillas de nivelación y apoyo diligenciadas (el profesor ve las suyas; el staff ve todas).",
    categoria: CATEGORIA,
    roles: [...TODOS_INTERNOS],
    gate: "pestalozziano",
    ruta: "/formatos/planillas",
    endpoint: "GET /api/formatos?tipo=nivelacion,apoyo (visibilidad por rol)",
    sinonimos: [
      "ver las planillas diligenciadas",
      "consultar las nivelaciones y apoyos",
      "registro de planillas",
      "mis planillas de nivelación y apoyo",
    ],
    pasos: [
      ...abrirFormato("formatos.ficha_planillas_registro", "Planillas diligenciadas (registro)"),
      {
        narracion:
          "Aparece la lista de planillas de nivelación y apoyo. Si eres profesor ves solo las tuyas; el staff ve todas.",
        accion: "esperar",
        ancla: "planillas.lista",
      },
    ],
  },
  {
    id: "formatos.planillas_pdf",
    titulo: "Descargar el PDF de una planilla diligenciada",
    descripcion:
      "Bajar en PDF una planilla de nivelación o apoyo ya registrada, desde el registro.",
    categoria: CATEGORIA,
    roles: [...TODOS_INTERNOS],
    gate: "pestalozziano",
    ruta: "/formatos/planillas",
    endpoint: "Cliente (jsPDF) con los datos de GET /api/formatos",
    sinonimos: [
      "descargar el PDF de una planilla",
      "bajar una nivelación en PDF",
      "imprimir una planilla de apoyo",
    ],
    pasos: [
      ...abrirFormato("formatos.ficha_planillas_registro", "Planillas diligenciadas (registro)"),
      {
        narracion: "Ubica la planilla en la lista.",
        accion: "esperar",
        ancla: "planillas.lista",
      },
      {
        narracion: "Toca el botón 'PDF' de esa planilla para descargarla.",
        accion: "click",
        ancla: "planillas.boton_pdf",
      },
    ],
  },

  // ─────────────────────────── LOGROS DEL PERIODO ───────────────────────────
  {
    id: "logros.consultar",
    titulo: "Ver el banco de logros del periodo",
    descripcion:
      "Abrir el banco de logros de una asignatura, grado y periodo para revisar los logros y en qué salones aplican.",
    categoria: CATEGORIA,
    roles: ["profesor"],
    ruta: "/profesor/logros",
    endpoint: "GET /api/logros/banco (endpoint acepta cualquier interno; la página es profesor-only)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura de la carga del docente." },
      { entidad: "grado", descripcion: "Grado de la carga." },
      { entidad: "periodo", descripcion: "Periodo (1 a 4)." },
    ],
    sinonimos: [
      "ver los logros del periodo",
      "abrir el banco de logros",
      "consultar los logros de una asignatura",
      "revisar mis logros",
    ],
    pasos: [
      {
        narracion: "Entramos a Logros del periodo.",
        accion: "navegar",
        ruta: "/profesor/logros",
      },
      {
        narracion: "Elige la asignatura.",
        accion: "seleccionar",
        ancla: "logros.select_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Elige el grado.",
        accion: "seleccionar",
        ancla: "logros.select_grado",
        campo: "grado",
      },
      {
        narracion: "Elige el periodo.",
        accion: "seleccionar",
        ancla: "logros.select_periodo",
        campo: "periodo",
      },
      {
        narracion: "Esperamos a que cargue el banco de logros.",
        accion: "esperar",
        ancla: "logros.banco",
      },
    ],
  },
  {
    id: "logros.crear",
    titulo: "Crear un logro nuevo",
    descripcion:
      "Agregar un logro al banco con su redacción principal (nivel más alto) y, si quieres, las redacciones de los demás niveles de desempeño.",
    categoria: CATEGORIA,
    roles: ["profesor"],
    ruta: "/profesor/logros",
    endpoint: "POST /api/logros (endpoint acepta cualquier interno; la página es profesor-only)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura del logro." },
      { entidad: "grado", descripcion: "Grado del logro." },
      { entidad: "periodo", descripcion: "Periodo del logro." },
    ],
    sinonimos: [
      "crear un logro",
      "agregar un logro nuevo",
      "redactar un logro",
      "meter un logro al banco",
    ],
    pasos: [
      {
        narracion: "Entramos a Logros del periodo.",
        accion: "navegar",
        ruta: "/profesor/logros",
      },
      {
        narracion: "Confirma la asignatura, el grado y el periodo arriba.",
        accion: "seleccionar",
        ancla: "logros.select_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Toca 'Nuevo logro'.",
        accion: "click",
        ancla: "logros.boton_nuevo",
      },
      {
        narracion:
          "Escribe la redacción principal, la del nivel más alto de desempeño.",
        accion: "escribir",
        ancla: "logros.dialog_texto_principal",
        campo: "logro_principal",
      },
      {
        narracion:
          "Si quieres, completa a mano las redacciones de los otros niveles (o usa la generación con Normi).",
        accion: "escribir",
        ancla: "logros.dialog_texto_nivel",
        campo: "logro_nivel",
        opcional: true,
      },
      {
        narracion: "Toca 'Guardar en el banco'.",
        accion: "click",
        ancla: "logros.dialog_guardar",
      },
    ],
  },
  {
    id: "logros.generar_variantes",
    titulo: "Generar los demás niveles de un logro con Normi",
    descripcion:
      "A partir de la redacción principal, dejar que Normi redacte automáticamente las variantes del logro para los demás niveles de desempeño.",
    categoria: CATEGORIA,
    roles: ["profesor"],
    ruta: "/profesor/logros",
    endpoint: "POST /api/logros/variantes (endpoint acepta cualquier interno; la página es profesor-only)",
    sinonimos: [
      "generar las variantes del logro",
      "que Normi redacte los otros niveles",
      "completar los niveles del logro automáticamente",
      "generar los demás niveles con Normi",
    ],
    pasos: [
      {
        narracion: "Entramos a Logros del periodo.",
        accion: "navegar",
        ruta: "/profesor/logros",
      },
      {
        narracion: "Abre 'Nuevo logro' o edita uno existente.",
        accion: "click",
        ancla: "logros.boton_nuevo",
      },
      {
        narracion: "Escribe primero la redacción principal (el nivel más alto).",
        accion: "escribir",
        ancla: "logros.dialog_texto_principal",
        campo: "logro_principal",
      },
      {
        narracion:
          "Toca 'Generar los demás niveles con Normi'. Se llenan solos los otros niveles a partir de esa redacción.",
        accion: "click",
        ancla: "logros.dialog_generar_variantes",
      },
      {
        narracion: "Revisa las variantes y guarda con 'Guardar en el banco'.",
        accion: "click",
        ancla: "logros.dialog_guardar",
      },
    ],
  },
  {
    id: "logros.editar",
    titulo: "Editar un logro del banco",
    descripcion:
      "Cambiar las redacciones (por nivel) de un logro ya creado en el banco.",
    categoria: CATEGORIA,
    roles: ["profesor"],
    ruta: "/profesor/logros",
    endpoint: "PATCH /api/logros/:id (solo el docente dueño del logro, o coordinador o más)",
    sinonimos: [
      "editar un logro",
      "cambiar la redacción de un logro",
      "corregir un logro del banco",
    ],
    pasos: [
      {
        narracion: "Entramos a Logros del periodo.",
        accion: "navegar",
        ruta: "/profesor/logros",
      },
      {
        narracion: "Ubica el logro en la lista y toca el ícono de lápiz (Editar).",
        accion: "click",
        ancla: "logros.boton_editar",
      },
      {
        narracion: "Ajusta las redacciones que necesites.",
        accion: "escribir",
        ancla: "logros.dialog_texto_principal",
        campo: "logro_principal",
      },
      {
        narracion: "Toca 'Guardar en el banco'.",
        accion: "click",
        ancla: "logros.dialog_guardar",
      },
    ],
  },
  {
    id: "logros.eliminar",
    titulo: "Eliminar un logro del banco",
    descripcion:
      "Borrar un logro del banco (se quita también de todos los salones donde estaba asignado).",
    categoria: CATEGORIA,
    roles: ["profesor"],
    ruta: "/profesor/logros",
    endpoint: "DELETE /api/logros/:id (solo el docente dueño del logro, o coordinador o más)",
    sinonimos: [
      "eliminar un logro",
      "borrar un logro del banco",
      "quitar un logro",
    ],
    pasos: [
      {
        narracion: "Entramos a Logros del periodo.",
        accion: "navegar",
        ruta: "/profesor/logros",
      },
      {
        narracion: "Ubica el logro y toca el ícono de papelera (Eliminar del banco).",
        accion: "click",
        ancla: "logros.boton_eliminar",
      },
      {
        narracion: "Confirma tocando 'Eliminar' en la ventana.",
        accion: "click",
        ancla: "logros.confirmar_eliminar",
      },
    ],
  },
  {
    id: "logros.asignar",
    titulo: "Marcar en qué salones aplica un logro",
    descripcion:
      "Agregar un logro a los salones donde aplica: la casilla grande lo activa en TODOS tus salones del grado; los botones de salón lo activan o quitan uno por uno. Se guarda al instante.",
    categoria: CATEGORIA,
    roles: ["profesor"],
    ruta: "/profesor/logros",
    endpoint: "POST /api/logros/asignar (endpoint acepta cualquier interno; la página es profesor-only)",
    requisitos: [
      { entidad: "salon", descripcion: "Salón (o salones) donde aplica el logro." },
    ],
    sinonimos: [
      "agregar un logro a un salón",
      "marcar los salones de un logro",
      "activar un logro en mis salones",
      "asignar un logro a un curso",
      "quitar un logro de un salón",
    ],
    pasos: [
      {
        narracion: "Entramos a Logros del periodo.",
        accion: "navegar",
        ruta: "/profesor/logros",
      },
      {
        narracion: "Confirma asignatura, grado y periodo, y espera el banco.",
        accion: "esperar",
        ancla: "logros.banco",
      },
      {
        narracion:
          "Para activarlo en todos tus salones, marca la casilla grande a la izquierda del logro (si ya estaba marcada, tocarla lo quita de todos).",
        accion: "click",
        ancla: "logros.checkbox_logro",
        opcional: true,
      },
      {
        narracion:
          "Para elegir salones puntuales, toca cada botón de salón bajo el logro (se marca o se desmarca). Se guarda solo.",
        accion: "click",
        ancla: "logros.boton_salon",
        campo: "salon",
        opcional: true,
      },
    ],
  },
];
