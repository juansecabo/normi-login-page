// Catálogo "Normi te guía" — Módulo ACUDIENTE.
//
// Todo lo que un ACUDIENTE (padre de familia) puede hacer en la plataforma,
// verificado contra la UI real (análisis exhaustivo 2026-08-26, 4 revisores
// leyendo cada página completa). Particularidades del rol:
//   - El tablero NO tiene selector de hijo: cada página lo pide adentro (Notas,
//     Estadísticas, Observador, Asistencia); Actividades y Comunicados muestran
//     a todos los acudidos juntos.
//   - Permisos y Excusas (retiro, inasistencia, uniforme) es EXCLUSIVO del
//     acudiente; la excusa por inasistencia corrige la asistencia a "Con excusa".
//   - "Solicitud de Entrevista" NO crea solicitudes: es la bandeja para
//     responder a las citaciones que envía el colegio.
//   - El Observador Estudiantil es de solo lectura para el acudiente y está en
//     todos los colegios.

import type { Capacidad } from "../tipos";

export const ACUDIENTE: Capacidad[] = [
  // ───────────────────────────── NOTAS ─────────────────────────────
  {
    id: "acu.consultar_notas",
    titulo: "Ver las notas de tu hijo",
    descripcion:
      "Consultar las calificaciones de un acudido por periodo y por asignatura, actividad por actividad.",
    categoria: "Notas",
    roles: ["acudiente"],
    ruta: "/acudiente/notas",
    requisitos: [{ entidad: "estudiante", descripcion: "De cuál de tus acudidos quieres ver las notas" }],
    sinonimos: ["notas de mi hijo", "cómo va mi hija", "calificaciones de mi acudido", "ver notas"],
    pasos: [
      { narracion: "Toca la ficha 'Notas' en tu tablero.", accion: "navegar", ruta: "/acudiente/notas" },
      {
        narracion:
          "Si tienes más de un acudido, toca la tarjeta del estudiante que quieres consultar.",
        accion: "click",
        ancla: "acu.item_acudido",
        opcional: true,
      },
      { narracion: "Elige el periodo, por ejemplo 'Primer periodo'.", accion: "click" },
      {
        narracion: "Toca una asignatura para desplegar sus notas, actividad por actividad.",
        accion: "click",
        ancla: "notas.asignatura_acordeon",
      },
      {
        narracion:
          "Al final de cada asignatura está la 'Definitiva del periodo', que aparece cuando el profesor cierra el periodo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "acu.cambiar_acudido_notas",
    titulo: "Cambiar de hijo en Notas",
    descripcion: "Pasar a ver las notas de otro de tus acudidos.",
    categoria: "Notas",
    roles: ["acudiente"],
    ruta: "/acudiente/notas",
    sinonimos: ["ver a mi otro hijo", "cambiar de estudiante", "notas del otro niño"],
    pasos: [
      {
        narracion:
          "Dentro de Notas, toca 'Escoger Estudiante' en la parte de arriba y elige al otro acudido. Solo aparece si tienes más de uno.",
        accion: "click",
      },
    ],
  },
  {
    id: "acu.ver_comentario_profesor",
    titulo: "Leer el comentario del profesor en una nota",
    descripcion:
      "Abrir el comentario que el profesor dejó en una actividad calificada de tu acudido.",
    categoria: "Notas",
    roles: ["acudiente"],
    ruta: "/acudiente/notas",
    sinonimos: ["comentario de la nota", "qué escribió el profesor", "observación de la nota"],
    pasos: [
      { narracion: "Toca la ficha 'Notas' en tu tablero.", accion: "navegar", ruta: "/acudiente/notas" },
      { narracion: "Elige al estudiante y el periodo.", accion: "click", ancla: "acu.item_acudido", opcional: true },
      { narracion: "Abre la asignatura donde está la nota.", accion: "click", ancla: "notas.asignatura_acordeon" },
      {
        narracion:
          "Si una actividad tiene comentario, junto a la nota aparece el botón 'Ver comentario del profesor'. Tócalo para leerlo.",
        accion: "click",
      },
    ],
  },
  {
    id: "acu.como_se_califica",
    titulo: "Entender cómo califican en el colegio",
    descripcion:
      "Ver la escala de notas: de cuánto a cuánto van, con cuánto se aprueba y los niveles de desempeño.",
    categoria: "Notas",
    roles: ["acudiente"],
    ruta: "/acudiente/notas",
    sinonimos: ["con cuánto se pasa", "escala de calificación", "niveles de desempeño"],
    pasos: [
      { narracion: "Toca la ficha 'Notas' en tu tablero.", accion: "navegar", ruta: "/acudiente/notas" },
      {
        narracion: "Toca '¿Cómo se califica?' para ver la escala del colegio y con cuánto se aprueba.",
        accion: "click",
      },
    ],
  },

  // ─────────────────────────── ACTIVIDADES ───────────────────────────
  {
    id: "acu.ver_actividades",
    titulo: "Ver las tareas y actividades de tus hijos",
    descripcion:
      "Consultar en el calendario las tareas y evaluaciones de todos tus acudidos, agrupadas por estudiante. Los días con actividades salen en verde (próximas) o gris (ya pasaron).",
    categoria: "Actividades",
    roles: ["acudiente"],
    ruta: "/acudiente/actividades",
    sinonimos: ["qué tareas tiene mi hijo", "actividades de mis hijos", "qué hay para mañana"],
    pasos: [
      { narracion: "Toca la ficha 'Actividades' en tu tablero.", accion: "navegar", ruta: "/acudiente/actividades" },
      {
        narracion:
          "Los días en verde tienen actividades próximas y los grises actividades que ya pasaron. Toca un día: verás las actividades de todos tus acudidos, agrupadas por cada uno.",
        accion: "click",
        ancla: "act.dia_calendario",
      },
      {
        narracion: "Toca una actividad para leer su descripción completa.",
        accion: "click",
        ancla: "act.card_actividad",
      },
    ],
  },
  {
    id: "acu.adjunto_actividad",
    titulo: "Ver o descargar el archivo de una actividad",
    descripcion:
      "Abrir o bajar el material que el profesor adjuntó a una actividad de tu acudido.",
    categoria: "Actividades",
    roles: ["acudiente"],
    ruta: "/acudiente/actividades",
    sinonimos: ["descargar la guía", "abrir el taller", "archivo de la tarea"],
    pasos: [
      { narracion: "Toca la ficha 'Actividades' en tu tablero.", accion: "navegar", ruta: "/acudiente/actividades" },
      { narracion: "Toca el día de la actividad y ábrela.", accion: "click", ancla: "act.card_actividad" },
      {
        narracion:
          "Si tiene archivo, aparecen 'Ver' (lo abre en otra pestaña) y 'Descargar' (lo guarda en tu equipo).",
        accion: "click",
      },
    ],
  },

  // ─────────────────────────── ESTADÍSTICAS ───────────────────────────
  {
    id: "acu.ver_estadisticas",
    titulo: "Ver el análisis de rendimiento de tu hijo",
    descripcion:
      "Consultar el promedio, la comparación con el salón, fortalezas, áreas de mejora y evolución por periodo de un acudido.",
    categoria: "Estadísticas",
    roles: ["acudiente"],
    ruta: "/acudiente/estadisticas",
    requisitos: [{ entidad: "estudiante", descripcion: "De cuál de tus acudidos quieres ver el análisis" }],
    sinonimos: ["promedio de mi hijo", "cómo va en general", "rendimiento de mi hija", "en qué va mal"],
    pasos: [
      { narracion: "Toca la ficha 'Estadísticas' en tu tablero.", accion: "navegar", ruta: "/acudiente/estadisticas" },
      {
        narracion: "Si tienes más de un acudido, toca la tarjeta del estudiante.",
        accion: "click",
        ancla: "acu.item_acudido",
        opcional: true,
      },
      {
        narracion: "Con el selector de 'Período' cambias entre cada periodo o el 'Acumulado Anual'.",
        accion: "seleccionar",
        ancla: "estad.select_periodo",
        campo: "periodo",
      },
      {
        narracion:
          "Aquí ves su 'Promedio General', el 'vs Salón', sus 'Fortalezas', las 'Áreas de Mejora' y la 'Evolución por Período'.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "acu.descargar_pdf_estadisticas",
    titulo: "Descargar el reporte de rendimiento en PDF",
    descripcion: "Bajar en PDF el análisis de rendimiento del acudido en el periodo elegido.",
    categoria: "Estadísticas",
    roles: ["acudiente"],
    ruta: "/acudiente/estadisticas",
    sinonimos: ["pdf del rendimiento", "descargar reporte de mi hijo", "imprimir el análisis"],
    pasos: [
      { narracion: "Toca la ficha 'Estadísticas' en tu tablero.", accion: "navegar", ruta: "/acudiente/estadisticas" },
      { narracion: "Elige al estudiante si tienes varios.", accion: "click", ancla: "acu.item_acudido", opcional: true },
      { narracion: "Arriba a la derecha, toca 'Descargar PDF'.", accion: "click" },
    ],
  },

  // ─────────────────────────── OBSERVADOR ───────────────────────────
  {
    id: "acu.leer_observador",
    titulo: "Leer el observador de tu hijo",
    descripcion:
      "Ver las observaciones que los profesores han escrito en el observador estudiantil de un acudido. Al abrirlo quedan marcadas como leídas.",
    categoria: "Observador",
    roles: ["acudiente"],
    ruta: "/observador-estudiantil",
    requisitos: [{ entidad: "estudiante", descripcion: "De cuál de tus acudidos quieres leer el observador" }],
    sinonimos: ["observador de mi hijo", "anotaciones de convivencia", "qué anotaron de mi hija"],
    pasos: [
      { narracion: "Toca la ficha 'Observador Estudiantil' en tu tablero.", accion: "navegar", ruta: "/observador-estudiantil" },
      {
        narracion:
          "Si tienes varios acudidos, toca la tarjeta del estudiante. El numerito rojo indica observaciones nuevas.",
        accion: "click",
        ancla: "acu.item_acudido",
        opcional: true,
      },
      {
        narracion:
          "Verás el cuaderno con las observaciones, la más reciente arriba. Toca una para leerla ampliada en letra normal.",
        accion: "click",
        ancla: "obs.item_observacion",
      },
    ],
  },

  // ─────────────────────────── COMUNICADOS Y DOCUMENTOS ───────────────────────────
  {
    id: "acu.ver_comunicados",
    titulo: "Leer tus comunicados",
    descripcion:
      "Ver los comunicados que el colegio envió para ti o para tus acudidos, buscarlos y abrirlos completos.",
    categoria: "Comunicados",
    roles: ["acudiente"],
    ruta: "/acudiente/comunicados",
    sinonimos: ["mis comunicados", "mensajes del colegio", "circulares"],
    pasos: [
      { narracion: "Toca la ficha 'Comunicados' en tu tablero.", accion: "navegar", ruta: "/acudiente/comunicados" },
      {
        narracion: "Puedes buscar por remitente o por texto en el cuadro de búsqueda.",
        accion: "escribir",
        ancla: "comunicados.buscar",
        campo: "busqueda",
        opcional: true,
      },
      { narracion: "Toca un comunicado para leerlo completo.", accion: "click", ancla: "comunicados.item" },
    ],
  },
  {
    id: "acu.ver_documentos",
    titulo: "Ver y descargar documentos",
    descripcion:
      "Consultar los comunicados que traen archivo adjunto y abrir o descargar cada archivo.",
    categoria: "Comunicados",
    roles: ["acudiente"],
    ruta: "/acudiente/documentos",
    sinonimos: ["documentos del colegio", "descargar circular", "archivos que enviaron"],
    pasos: [
      { narracion: "Toca la ficha 'Documentos' en tu tablero.", accion: "navegar", ruta: "/acudiente/documentos" },
      {
        narracion: "Cada documento trae 'Ver' para abrirlo y 'Descargar' para guardarlo.",
        accion: "click",
      },
    ],
  },

  // ─────────────────────────── COMUNICADOS CON FIRMA ───────────────────────────
  {
    id: "acu.firmar_comunicado",
    titulo: "Firmar un comunicado",
    descripcion:
      "Leer un comunicado que requiere tu firma y firmarlo con el dedo. Si es por varios acudidos, firmas una tarjeta por cada uno. Una vez firmado no se puede cambiar.",
    categoria: "Comunicados",
    roles: ["acudiente"],
    ruta: "/comunicados-firma",
    endpoint: "POST /api/comunicados-firma/firmar (solo el propio destinatario)",
    sinonimos: ["firmar circular", "comunicado por firmar", "constancia de leído"],
    pasos: [
      { narracion: "Toca la ficha 'Comunicados con firma' en tu tablero.", accion: "navegar", ruta: "/comunicados-firma" },
      {
        narracion:
          "Toca el comunicado marcado 'Pendiente por firmar'. Si es por varios de tus acudidos, hay una tarjeta por cada uno.",
        accion: "click",
        ancla: "firma.item",
      },
      {
        narracion: "Lee el mensaje y firma con el dedo en el recuadro blanco. Con 'Borrar' puedes repetirla.",
        accion: "click",
        ancla: "firma.lienzo",
      },
      { narracion: "Toca 'Firmar' para confirmar. Quedará constancia y ya no se puede modificar.", accion: "click" },
    ],
  },

  // ─────────────────────────── CONSULTAS ───────────────────────────
  {
    id: "acu.responder_consulta",
    titulo: "Responder una consulta del colegio",
    descripcion:
      "Contestar una consulta o autorización que el colegio envió, eligiendo tu respuesta por cada acudido y firmando si la consulta lo pide.",
    categoria: "Consultas",
    roles: ["acudiente"],
    ruta: "/acudiente/consultas",
    endpoint: "Consultas_Respuestas vía dbProxy (JWT propio)",
    sinonimos: ["responder encuesta", "autorizar salida", "contestar consulta", "firmar autorización"],
    pasos: [
      { narracion: "Toca la ficha 'Consultas' en tu tablero.", accion: "navegar", ruta: "/acudiente/consultas" },
      {
        narracion: "En la consulta marcada 'Pendiente', toca 'Responder consulta'.",
        accion: "click",
      },
      {
        narracion:
          "Toca la opción con la que respondes. Si tienes varios acudidos en la consulta, respondes por cada uno.",
        accion: "click",
        ancla: "consulta.opciones",
      },
      {
        narracion:
          "Si la consulta pide firma, firma con el dedo en 'Firma digital'. Luego toca 'Enviar respuesta'.",
        accion: "click",
      },
    ],
  },
  {
    id: "acu.editar_respuesta_consulta",
    titulo: "Cambiar tu respuesta a una consulta",
    descripcion: "Editar la respuesta que ya enviaste, mientras la consulta siga abierta.",
    categoria: "Consultas",
    roles: ["acudiente"],
    ruta: "/acudiente/consultas",
    sinonimos: ["cambiar mi respuesta", "me equivoqué al responder", "editar autorización"],
    pasos: [
      { narracion: "Toca la ficha 'Consultas' en tu tablero.", accion: "navegar", ruta: "/acudiente/consultas" },
      { narracion: "En la consulta ya respondida, toca 'Ver / editar respuesta'.", accion: "click" },
      { narracion: "Toca 'Editar', elige la nueva opción y confirma con 'Actualizar respuesta'.", accion: "click" },
    ],
  },

  // ─────────────────────────── PERMISOS Y EXCUSAS ───────────────────────────
  {
    id: "acu.permiso_retiro",
    titulo: "Crear un permiso de salida (retiro)",
    descripcion:
      "Autorizar que tu acudido salga del colegio en jornada escolar: fecha, hora, con quién sale, motivo y tu firma. Notifica al rector y coordinadores.",
    categoria: "Permisos y excusas",
    roles: ["acudiente"],
    ruta: "/permisos-excusas/retiro",
    endpoint: "Autorizaciones_Retiro vía dbProxy + notificación a rector/coordinación",
    requisitos: [
      { entidad: "estudiante", descripcion: "Cuál de tus acudidos sale" },
      { entidad: "fecha", descripcion: "El día de la salida" },
    ],
    sinonimos: ["permiso de salida", "autorizar retiro", "que mi hijo salga temprano", "sacar a mi hijo del colegio"],
    pasos: [
      { narracion: "Toca la ficha 'Permisos y Excusas' en tu tablero.", accion: "navegar", ruta: "/permisos-excusas" },
      { narracion: "Elige 'Retiro de Estudiantes'.", accion: "navegar", ruta: "/permisos-excusas/retiro" },
      {
        narracion: "Marca la casilla de 'He leído y acepto las condiciones' para habilitar el formato.",
        accion: "click",
        ancla: "retiro.acepto",
      },
      {
        narracion:
          "Con 'Seleccionar fecha' eliges el día, luego la hora del retiro, y en la lista eliges a tu acudido.",
        accion: "click",
      },
      {
        narracion:
          "Marca cómo sale: en vehículo propio, con el señor o señora del transporte, o con un familiar (con nombre y parentesco). Escribe el motivo.",
        accion: "escribir",
        campo: "motivo",
      },
      {
        narracion: "Firma con el dedo en el recuadro de 'Firma del acudiente'.",
        accion: "click",
        ancla: "permisos.firma",
      },
      {
        narracion: "Toca 'Crear autorización' y confirma con 'Sí, crear autorización'. Una vez creada no se puede eliminar.",
        accion: "click",
      },
    ],
  },
  {
    id: "acu.excusa_inasistencia",
    titulo: "Justificar una inasistencia",
    descripcion:
      "Crear la excusa cuando tu acudido faltó o faltará: fechas, motivo, soportes y tu firma. Las ausencias de esas fechas quedan automáticamente 'Con excusa' en la asistencia.",
    categoria: "Permisos y excusas",
    roles: ["acudiente"],
    ruta: "/permisos-excusas/inasistencia",
    endpoint: "Justificaciones_Inasistencia + /api/asistencia/aplicar-excusa",
    requisitos: [
      { entidad: "estudiante", descripcion: "Cuál de tus acudidos faltó" },
      { entidad: "fecha", descripcion: "El día o rango de la inasistencia" },
    ],
    sinonimos: ["excusa por falta", "justificar falla", "mi hijo faltó", "excusa médica"],
    pasos: [
      { narracion: "Toca la ficha 'Permisos y Excusas' en tu tablero.", accion: "navegar", ruta: "/permisos-excusas" },
      { narracion: "Elige 'Justificación por Inasistencia'.", accion: "navegar", ruta: "/permisos-excusas/inasistencia" },
      {
        narracion: "Marca la casilla de 'He leído y acepto las condiciones' para ver el formato.",
        accion: "click",
        ancla: "inasistencia.acepto",
      },
      {
        narracion:
          "Elige a tu acudido, marca si faltó '1 día' o 'Más de 1 día' y selecciona la fecha o el rango.",
        accion: "click",
      },
      {
        narracion:
          "Marca el motivo (Enfermedad, Cita médica, Calamidad familiar...) y descríbelo. Si tienes soportes, adjúntalos con 'Tomar foto' o 'Subir archivo'.",
        accion: "escribir",
        campo: "descripcion",
      },
      { narracion: "Firma con el dedo en 'Firma del acudiente'.", accion: "click", ancla: "permisos.firma" },
      {
        narracion:
          "Toca 'Crear justificación' y confirma. Las fallas de esas fechas quedarán 'Con excusa' automáticamente.",
        accion: "click",
      },
    ],
  },
  {
    id: "acu.excusa_uniforme",
    titulo: "Justificar que no portará el uniforme",
    descripcion:
      "Avisar con un formato firmado que tu acudido no podrá llevar el uniforme correspondiente un día.",
    categoria: "Permisos y excusas",
    roles: ["acudiente"],
    ruta: "/permisos-excusas/uniforme",
    endpoint: "Justificaciones_Uniforme vía dbProxy",
    requisitos: [
      { entidad: "estudiante", descripcion: "Cuál de tus acudidos" },
      { entidad: "fecha", descripcion: "El día en que no portará el uniforme" },
    ],
    sinonimos: ["excusa por uniforme", "no tiene el uniforme", "sin sudadera"],
    pasos: [
      { narracion: "Toca la ficha 'Permisos y Excusas' en tu tablero.", accion: "navegar", ruta: "/permisos-excusas" },
      { narracion: "Elige 'Justificación por Uniforme'.", accion: "navegar", ruta: "/permisos-excusas/uniforme" },
      {
        narracion:
          "Elige a tu acudido, la fecha con 'Seleccionar fecha' y escribe la razón por la que no portará el uniforme.",
        accion: "escribir",
        campo: "justificacion",
      },
      { narracion: "Firma con el dedo en 'Firma del acudiente'.", accion: "click", ancla: "permisos.firma" },
      { narracion: "Toca 'Crear justificación' y confirma con 'Sí, crear justificación'.", accion: "click" },
    ],
  },
  {
    id: "acu.ver_permisos_creados",
    titulo: "Ver tus permisos y excusas creados",
    descripcion:
      "Consultar las autorizaciones de retiro y las justificaciones que ya enviaste, con su documento completo y adjuntos.",
    categoria: "Permisos y excusas",
    roles: ["acudiente"],
    ruta: "/permisos-excusas",
    sinonimos: ["mis excusas enviadas", "historial de permisos", "ver mis justificaciones"],
    pasos: [
      { narracion: "Toca la ficha 'Permisos y Excusas' en tu tablero.", accion: "navegar", ruta: "/permisos-excusas" },
      { narracion: "Entra al tipo que quieras revisar (retiro, inasistencia o uniforme).", accion: "click" },
      {
        narracion:
          "Arriba, cambia a la pestaña 'Autorizaciones creadas' o 'Justificaciones creadas' y toca una para desplegar el documento completo.",
        accion: "click",
      },
    ],
  },

  // ─────────────────────────── ENTREVISTAS ───────────────────────────
  {
    id: "acu.responder_entrevista",
    titulo: "Responder a una citación de entrevista",
    descripcion:
      "Ver las citaciones que el colegio te envió y confirmar con 'Asistiré' o 'No asistiré'. Los días con citaciones salen en azul.",
    categoria: "Entrevistas",
    roles: ["acudiente"],
    ruta: "/solicitud-entrevista",
    endpoint: "Solicitudes_Entrevista vía dbProxy",
    sinonimos: ["me citaron al colegio", "confirmar entrevista", "reunión con el profesor", "citación"],
    pasos: [
      { narracion: "Toca la ficha 'Solicitud de Entrevista' en tu tablero.", accion: "navegar", ruta: "/solicitud-entrevista" },
      {
        narracion: "Los días con citaciones están en azul. Toca el día para ver la solicitud.",
        accion: "click",
        ancla: "entrevista.dia_calendario",
      },
      { narracion: "Toca la solicitud para desplegar la citación completa.", accion: "click", ancla: "entrevista.item" },
      {
        narracion: "En 'Confirmar asistencia:' toca 'Asistiré' o 'No asistiré' según tu caso.",
        accion: "click",
      },
    ],
  },
  {
    id: "acu.reprogramar_entrevista",
    titulo: "Reprogramar una entrevista",
    descripcion:
      "Proponer otra fecha y hora para la entrevista cuando no puedas asistir a la citada. El colegio recibe el aviso por WhatsApp.",
    categoria: "Entrevistas",
    roles: ["acudiente"],
    ruta: "/solicitud-entrevista",
    endpoint: "POST /api/entrevistas/reprogramar (notifica al citador por WhatsApp)",
    sinonimos: ["cambiar la cita", "no puedo a esa hora", "proponer otra fecha"],
    pasos: [
      { narracion: "Toca la ficha 'Solicitud de Entrevista' en tu tablero.", accion: "navegar", ruta: "/solicitud-entrevista" },
      { narracion: "Toca el día azul de la citación y despliega la solicitud.", accion: "click", ancla: "entrevista.item" },
      {
        narracion: "Toca 'Reprogramar entrevista', elige la nueva fecha y hora, y confirma con 'Reprogramar'.",
        accion: "click",
      },
    ],
  },

  // ─────────────────────────── ASISTENCIA ───────────────────────────
  {
    id: "acu.ver_asistencia",
    titulo: "Consultar la asistencia de tu hijo",
    descripcion:
      "Ver el porcentaje de asistencia por asignatura y el calendario del mes: Presente, Ausente, Con excusa o Entró tarde. Para justificar una falta se usa 'Permisos y Excusas'.",
    categoria: "Asistencia",
    roles: ["acudiente"],
    ruta: "/asistencia",
    requisitos: [{ entidad: "estudiante", descripcion: "De cuál de tus acudidos quieres ver la asistencia" }],
    sinonimos: ["fallas de mi hijo", "cuántas veces ha faltado", "asistencia de mi hija"],
    pasos: [
      { narracion: "Toca la ficha 'Asistencia' en tu tablero.", accion: "navegar", ruta: "/asistencia" },
      {
        narracion: "Si tienes varios acudidos, toca el nombre del estudiante arriba.",
        accion: "click",
        ancla: "asistencia.chip_acudido",
        opcional: true,
      },
      {
        narracion: "Toca una asignatura para abrir su calendario del mes.",
        accion: "click",
        ancla: "asistencia.item_asignatura",
      },
      {
        narracion:
          "Verde es Presente, rosa Ausente, ámbar Con excusa y naranja Entró tarde. Si necesitas justificar una falta, eso se hace desde 'Permisos y Excusas'.",
        accion: "explicar",
      },
    ],
  },

  // ─────────────────────────── CALENDARIO Y MANUAL ───────────────────────────
  {
    id: "acu.calendario_escolar",
    titulo: "Ver el calendario escolar",
    descripcion:
      "Consultar los periodos académicos, los días sin clases, los eventos y los festivos del año escolar completo.",
    categoria: "Institución",
    roles: ["acudiente"],
    ruta: "/calendario-escolar",
    sinonimos: ["cuándo termina el periodo", "días sin clases", "festivos", "entrega de boletines"],
    pasos: [
      { narracion: "Toca la ficha 'Calendario' en tu tablero.", accion: "navegar", ruta: "/calendario-escolar" },
      {
        narracion:
          "Ves los 12 meses con sus colores: cada periodo, los días 'Sin clases', los eventos y los festivos. Toca un día pintado para ver su detalle.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "acu.manual_convivencia",
    titulo: "Leer el Manual de Convivencia",
    descripcion: "Abrir el Manual de Convivencia del colegio para consultarlo.",
    categoria: "Institución",
    roles: ["acudiente"],
    ruta: "/manual-convivencia",
    sinonimos: ["manual del colegio", "reglamento", "normas de convivencia"],
    pasos: [
      {
        narracion: "Al final de tu tablero, toca 'Manual de Convivencia'.",
        accion: "navegar",
        ruta: "/manual-convivencia",
      },
      { narracion: "Aquí puedes leerlo completo con calma.", accion: "explicar" },
    ],
  },

  // ─────────────────────────── PERFIL Y TABLERO ───────────────────────────
  {
    id: "acu.cambiar_datos",
    titulo: "Corregir tus datos personales",
    descripcion:
      "Actualizar tu nombre, apellidos, celular y fecha de nacimiento. El cambio aplica en todos tus perfiles y colegios.",
    categoria: "Perfil",
    roles: ["acudiente"],
    ruta: "/perfil",
    endpoint: "POST /api/perfil/datos (JWT propio)",
    sinonimos: ["cambiar mi número", "corregir mi nombre", "actualizar mis datos"],
    pasos: [
      { narracion: "Toca la ficha 'Perfil' en tu tablero.", accion: "navegar", ruta: "/perfil" },
      { narracion: "Abre 'Cambiar datos'.", accion: "click" },
      {
        narracion: "Ajusta tus nombres, celular o fecha de nacimiento y confirma con 'Guardar datos'.",
        accion: "escribir",
        campo: "telefono",
      },
    ],
  },
  {
    id: "acu.cambiar_contrasena",
    titulo: "Cambiar tu contraseña",
    descripcion: "Cambiar tu contraseña de entrada verificando la actual.",
    categoria: "Perfil",
    roles: ["acudiente"],
    ruta: "/perfil",
    endpoint: "POST /api/auth/change-password",
    sinonimos: ["cambiar clave", "nueva contraseña"],
    pasos: [
      { narracion: "Toca la ficha 'Perfil' en tu tablero.", accion: "navegar", ruta: "/perfil" },
      { narracion: "Abre 'Cambiar datos'.", accion: "click" },
      {
        narracion:
          "En 'Cambiar contraseña', escribe la actual, la nueva (mínimo 6 caracteres) y repítela. Confirma con el botón 'Cambiar contraseña'.",
        accion: "escribir",
        campo: "contrasena",
      },
    ],
  },
  {
    id: "acu.recuperacion_contrasena",
    titulo: "Configurar cómo recuperar tu contraseña",
    descripcion:
      "Dejar lista una pregunta secreta (Normi te la hace por WhatsApp) o un correo para recuperar tu contraseña cuando se te olvide.",
    categoria: "Perfil",
    roles: ["acudiente"],
    ruta: "/perfil",
    endpoint: "POST /api/perfil/recuperacion",
    sinonimos: ["pregunta secreta", "si olvido mi contraseña", "correo de recuperación"],
    pasos: [
      { narracion: "Toca la ficha 'Perfil' en tu tablero.", accion: "navegar", ruta: "/perfil" },
      { narracion: "Abre 'Recuperación de contraseña'.", accion: "click" },
      {
        narracion:
          "Elige 'Por WhatsApp' (pregunta secreta) o 'Por correo', llena los campos y toca 'Guardar'.",
        accion: "click",
      },
    ],
  },
  {
    id: "acu.notificaciones_whatsapp",
    titulo: "Elegir qué notificaciones te llegan al WhatsApp",
    descripcion:
      "Encender o apagar cada tipo de aviso que te llega al WhatsApp (comunicados, actividades, notas, inasistencias, observador, portería...). Todo sigue quedando en la plataforma; solo se silencia el mensaje.",
    categoria: "Perfil",
    roles: ["acudiente"],
    ruta: "/perfil",
    endpoint: "POST /api/perfil/notificaciones (JWT propio)",
    sinonimos: ["silenciar notificaciones", "no quiero que me lleguen mensajes", "apagar avisos de whatsapp", "elegir qué me llega al whatsapp"],
    pasos: [
      { narracion: "Toca la ficha 'Perfil' en tu tablero.", accion: "navegar", ruta: "/perfil" },
      { narracion: "Abre 'Notificaciones al WhatsApp'.", accion: "click", ancla: "varios.perfil_ficha_notificaciones" },
      {
        narracion: "Apaga o enciende el interruptor de cada tipo de aviso. El cambio se guarda solo.",
        accion: "click",
        ancla: "varios.perfil_lista_notificaciones",
      },
    ],
  },
  {
    id: "acu.cambiar_foto",
    titulo: "Poner o cambiar tu foto de perfil",
    descripcion:
      "Subir una foto o tomarla en el momento y acomodarla en el marco. Se hace desde el círculo del avatar en tu tablero.",
    categoria: "Perfil",
    roles: ["acudiente"],
    ruta: "/dashboard",
    sinonimos: ["subir mi foto", "cambiar foto de perfil"],
    pasos: [
      { narracion: "En tu tablero, toca el círculo con tu foto o tus iniciales.", accion: "click", ancla: "dash.avatar" },
      {
        narracion:
          "En 'Foto de perfil' elige 'Tomar foto' o 'Subir archivo', acomódala con el 'Zoom' y confirma con 'Guardar'.",
        accion: "click",
      },
    ],
  },
  {
    id: "acu.enviar_sugerencia",
    titulo: "Enviar una sugerencia al colegio",
    descripcion: "Escribir una sugerencia desde el Buzón de Sugerencias del tablero.",
    categoria: "Varios",
    roles: ["acudiente"],
    ruta: "/dashboard",
    sinonimos: ["buzón de sugerencias", "dar una idea", "proponer algo"],
    pasos: [
      { narracion: "Al final de tu tablero, toca 'Buzón de Sugerencias'.", accion: "click" },
      { narracion: "Escribe tu sugerencia y toca 'Enviar'.", accion: "escribir", campo: "sugerencia" },
    ],
  },
  {
    id: "acu.reordenar_fichas",
    titulo: "Reorganizar las fichas de tu tablero",
    descripcion:
      "Cambiar el orden de las tarjetas del tablero manteniendo presionada una y arrastrándola a su nueva posición.",
    categoria: "Varios",
    roles: ["acudiente"],
    ruta: "/dashboard",
    sinonimos: ["mover las tarjetas", "ordenar mi tablero"],
    pasos: [
      {
        narracion:
          "En tu tablero, mantén presionada una tarjeta medio segundo y, sin soltar, arrástrala a donde la quieres. El orden se guarda solo.",
        accion: "explicar",
      },
    ],
  },
];
