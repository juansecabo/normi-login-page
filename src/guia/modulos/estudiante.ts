// Catálogo "Normi te guía" — Módulo ESTUDIANTE.
//
// Todo lo que un ESTUDIANTE puede hacer en la plataforma, verificado contra la
// UI real (análisis exhaustivo 2026-08-26, 4 revisores leyendo cada página
// completa). El estudiante es un rol de CONSULTA: no crea permisos ni excusas
// (eso es del acudiente y su dashboard no tiene esa ficha), pero sí responde
// consultas, firma comunicados y marca sus actividades.
//
// Páginas cubiertas: DashboardEstudiante, NotasEstudiante (+ConsolidadoNotas),
// CalendarioEstudiante (actividades), EstadisticasEstudiante, Comunicados,
// Documentos, MisConsultasEstudiante (+ConsultaPublica), ComunicadosFirma
// (vista receptor), ConsultaAsistencia (vista estudiante), CalendarioEscolar,
// ManualConvivencia, Perfil, AvatarUploader y Buzón de Sugerencias.

import type { Capacidad } from "../tipos";

export const ESTUDIANTE: Capacidad[] = [
  // ───────────────────────────── NOTAS ─────────────────────────────
  {
    id: "est.consultar_notas",
    titulo: "Ver tus notas",
    descripcion:
      "Consultar tus calificaciones por periodo y por asignatura, actividad por actividad.",
    categoria: "Notas",
    roles: ["estudiante"],
    ruta: "/estudiante/notas",
    sinonimos: ["ver mis notas", "cómo voy", "mis calificaciones", "qué saqué", "revisar notas"],
    pasos: [
      { narracion: "Toca la ficha 'Notas' en tu tablero.", accion: "navegar", ruta: "/estudiante/notas" },
      {
        narracion: "Elige el periodo que quieres ver, por ejemplo 'Primer periodo'.",
        accion: "click",
      },
      {
        narracion: "Toca una asignatura para desplegar sus notas, actividad por actividad.",
        accion: "click",
        ancla: "notas.asignatura_acordeon",
      },
      {
        narracion:
          "Aquí ves cada actividad con su porcentaje y tu nota. Al final aparece la 'Definitiva del periodo' cuando el profesor cierra el periodo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "est.cambiar_periodo_notas",
    titulo: "Cambiar de periodo en Notas",
    descripcion: "Pasar de un periodo a otro para ver las notas de cada uno.",
    categoria: "Notas",
    roles: ["estudiante"],
    ruta: "/estudiante/notas",
    sinonimos: ["ver otro periodo", "notas del periodo pasado", "cambiar periodo"],
    pasos: [
      { narracion: "Toca la ficha 'Notas' en tu tablero.", accion: "navegar", ruta: "/estudiante/notas" },
      {
        narracion: "Arriba está la barra de periodos: toca por ejemplo '2do Periodo' para cambiarte. El cambio aplica a todas tus asignaturas.",
        accion: "click",
        ancla: "notas.barra_periodos",
      },
    ],
  },
  {
    id: "est.ver_comentario_profesor",
    titulo: "Leer el comentario del profesor en una nota",
    descripcion:
      "Abrir el comentario que el profesor dejó en una actividad calificada (el globito junto a la nota).",
    categoria: "Notas",
    roles: ["estudiante"],
    ruta: "/estudiante/notas",
    sinonimos: ["comentario de la nota", "qué me escribió el profesor", "observación de la nota"],
    pasos: [
      { narracion: "Toca la ficha 'Notas' en tu tablero.", accion: "navegar", ruta: "/estudiante/notas" },
      { narracion: "Elige el periodo, por ejemplo 'Primer periodo'.", accion: "click" },
      { narracion: "Abre la asignatura donde está la nota.", accion: "click", ancla: "notas.asignatura_acordeon" },
      {
        narracion:
          "Si una actividad tiene comentario, junto a la nota aparece el botón 'Ver comentario del profesor'. Tócalo para leerlo.",
        accion: "click",
      },
    ],
  },
  {
    id: "est.como_se_califica",
    titulo: "Entender cómo te califican",
    descripcion:
      "Ver la escala de notas del colegio: de cuánto a cuánto van, con cuánto se aprueba y los niveles de desempeño.",
    categoria: "Notas",
    roles: ["estudiante"],
    ruta: "/estudiante/notas",
    sinonimos: ["con cuánto paso", "escala de notas", "cómo califican", "nota mínima para aprobar"],
    pasos: [
      { narracion: "Toca la ficha 'Notas' en tu tablero.", accion: "navegar", ruta: "/estudiante/notas" },
      {
        narracion: "Toca '¿Cómo se califica?' para ver la escala del colegio y con cuánto se aprueba.",
        accion: "click",
      },
    ],
  },

  // ─────────────────────────── ACTIVIDADES ───────────────────────────
  {
    id: "est.ver_actividades",
    titulo: "Ver tus tareas y actividades",
    descripcion:
      "Consultar en el calendario las tareas, evaluaciones y actividades que te asignaron. Los días con actividades salen en verde (próximas) o gris (ya pasaron).",
    categoria: "Actividades",
    roles: ["estudiante"],
    ruta: "/estudiante/actividades",
    sinonimos: ["qué tareas tengo", "actividades pendientes", "qué hay para mañana", "tareas de la semana"],
    pasos: [
      { narracion: "Toca la ficha 'Actividades' en tu tablero.", accion: "navegar", ruta: "/estudiante/actividades" },
      {
        narracion:
          "Los días en verde tienen actividades próximas y los grises actividades que ya pasaron. Toca un día para ver qué te asignaron; con las flechas de arriba cambias de mes. Arriba puedes filtrar por asignatura o dejar solo las que tienen entrega en plataforma.",
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
    id: "est.entregar_trabajo",
    titulo: "Entregar un trabajo a tu profesor",
    descripcion:
      "Subir por la plataforma el trabajo de una actividad que el profesor habilitó para entregas. Antes del plazo puedes cambiar o agregar archivos; al vencer, la entrega queda congelada.",
    categoria: "Actividades",
    roles: ["estudiante"],
    ruta: "/estudiante/actividades",
    endpoint: "POST /api/entregas (solo el propio estudiante, valida el plazo)",
    sinonimos: ["entregar tarea", "subir mi trabajo", "enviar el taller", "mandar la tarea al profesor"],
    pasos: [
      { narracion: "Toca la ficha 'Actividades' en tu tablero.", accion: "navegar", ruta: "/estudiante/actividades" },
      { narracion: "Toca el día de la actividad que vas a entregar.", accion: "click", ancla: "act.dia_calendario" },
      {
        narracion: "En la actividad, toca 'Entregar trabajo'. Si ya entregaste, el botón dice 'Entregado'.",
        accion: "click",
        ancla: "entrega.abrir",
      },
      {
        narracion: "Adjunta tus archivos con 'Seleccionar archivo', escribe un comentario si quieres y confirma con 'Entregar trabajo'.",
        accion: "click",
        ancla: "entrega.enviar",
      },
    ],
  },
  {
    id: "est.adjunto_actividad",
    titulo: "Ver o descargar el archivo de una actividad",
    descripcion:
      "Abrir o bajar el material que el profesor adjuntó a una actividad (guías, talleres, documentos).",
    categoria: "Actividades",
    roles: ["estudiante"],
    ruta: "/estudiante/actividades",
    sinonimos: ["descargar la guía", "abrir el taller", "archivo de la tarea"],
    pasos: [
      { narracion: "Toca la ficha 'Actividades' en tu tablero.", accion: "navegar", ruta: "/estudiante/actividades" },
      { narracion: "Toca el día de la actividad.", accion: "click", ancla: "act.dia_calendario" },
      {
        narracion:
          "Si la actividad tiene archivo, junto al clip aparecen 'Ver' (lo abre en otra pestaña) y 'Descargar' (lo guarda en tu equipo).",
        accion: "click",
      },
    ],
  },

  // ─────────────────────────── ESTADÍSTICAS ───────────────────────────
  {
    id: "est.ver_estadisticas",
    titulo: "Ver tu análisis de rendimiento",
    descripcion:
      "Consultar tu promedio general, cómo vas frente al salón, tus fortalezas, áreas de mejora y evolución por periodo.",
    categoria: "Estadísticas",
    roles: ["estudiante"],
    ruta: "/estudiante/estadisticas",
    sinonimos: ["mi promedio", "cómo voy en general", "mi rendimiento", "en qué materias voy mal"],
    pasos: [
      { narracion: "Toca la ficha 'Estadísticas' en tu tablero.", accion: "navegar", ruta: "/estudiante/estadisticas" },
      {
        narracion:
          "Con el selector de 'Período' cambias entre cada periodo o el 'Acumulado Anual'.",
        accion: "seleccionar",
        ancla: "estad.select_periodo",
        campo: "periodo",
      },
      {
        narracion:
          "Aquí ves tu 'Promedio General', la comparación 'vs Salón', tus 'Fortalezas', las 'Áreas de Mejora' y tu 'Evolución por Período'.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "est.descargar_pdf_estadisticas",
    titulo: "Descargar tu reporte de rendimiento en PDF",
    descripcion: "Bajar en PDF el análisis completo de tu rendimiento del periodo elegido.",
    categoria: "Estadísticas",
    roles: ["estudiante"],
    ruta: "/estudiante/estadisticas",
    sinonimos: ["descargar mi reporte", "pdf de mis notas", "imprimir mi rendimiento"],
    pasos: [
      { narracion: "Toca la ficha 'Estadísticas' en tu tablero.", accion: "navegar", ruta: "/estudiante/estadisticas" },
      {
        narracion: "Arriba a la derecha, toca 'Descargar PDF'. Mientras se genera dirá 'Generando...'.",
        accion: "click",
      },
    ],
  },

  // ─────────────────────────── COMUNICADOS Y DOCUMENTOS ───────────────────────────
  {
    id: "est.ver_comunicados",
    titulo: "Leer tus comunicados",
    descripcion:
      "Ver los comunicados que el colegio te ha enviado, buscarlos y abrirlos completos. Entrar a la página baja el numerito rojo de la ficha.",
    categoria: "Comunicados",
    roles: ["estudiante"],
    ruta: "/estudiante/comunicados",
    sinonimos: ["mis comunicados", "mensajes del colegio", "circulares"],
    pasos: [
      { narracion: "Toca la ficha 'Comunicados' en tu tablero.", accion: "navegar", ruta: "/estudiante/comunicados" },
      {
        narracion:
          "Puedes buscar por remitente o por texto en el cuadro de búsqueda de arriba.",
        accion: "escribir",
        ancla: "comunicados.buscar",
        campo: "busqueda",
        opcional: true,
      },
      {
        narracion: "Toca un comunicado para leerlo completo.",
        accion: "click",
        ancla: "comunicados.item",
      },
    ],
  },
  {
    id: "est.ver_documentos",
    titulo: "Ver y descargar documentos",
    descripcion:
      "Consultar los comunicados que traen archivo adjunto y abrir o descargar cada archivo.",
    categoria: "Comunicados",
    roles: ["estudiante"],
    ruta: "/estudiante/documentos",
    sinonimos: ["documentos del colegio", "descargar circular", "archivos que me enviaron"],
    pasos: [
      { narracion: "Toca la ficha 'Documentos' en tu tablero.", accion: "navegar", ruta: "/estudiante/documentos" },
      {
        narracion:
          "Cada documento trae 'Ver' para abrirlo en otra pestaña y 'Descargar' para guardarlo.",
        accion: "click",
      },
    ],
  },

  // ─────────────────────────── CONSULTAS ───────────────────────────
  {
    id: "est.responder_consulta",
    titulo: "Responder una consulta del colegio",
    descripcion:
      "Contestar una consulta o encuesta que el colegio te envió: eligiendo tu opción, o llenando el formulario si es una consulta de datos, y firmando si la consulta lo pide.",
    categoria: "Consultas",
    roles: ["estudiante"],
    ruta: "/estudiante/consultas",
    endpoint: "Consultas_Respuestas vía dbProxy (JWT propio)",
    sinonimos: ["responder encuesta", "contestar consulta", "votar en la consulta"],
    pasos: [
      { narracion: "Toca la ficha 'Consultas' en tu tablero.", accion: "navegar", ruta: "/estudiante/consultas" },
      {
        narracion: "En la consulta marcada como 'Pendiente', toca 'Responder consulta'.",
        accion: "click",
      },
      {
        narracion: "Toca la opción con la que quieres responder.",
        accion: "click",
        ancla: "consulta.opciones",
        opcional: true,
      },
      {
        narracion:
          "Si en vez de opciones la consulta trae un formulario ('Diligencie los siguientes datos'), llena cada campo; los que ya conocemos vienen prellenados.",
        accion: "escribir",
        ancla: "consulta.campos_datos",
        campo: "datos",
        opcional: true,
      },
      {
        narracion:
          "Si la consulta pide firma, firma con el dedo en el recuadro de 'Firma digital'. Luego toca 'Enviar respuesta'.",
        accion: "click",
      },
      {
        narracion:
          "Para volver a tus consultas usa el logo 'Notas Normi' de arriba (no el botón Volver, que es para acudientes).",
        accion: "explicar",
      },
    ],
  },
  {
    id: "est.editar_respuesta_consulta",
    titulo: "Cambiar tu respuesta a una consulta",
    descripcion:
      "Editar la respuesta que ya enviaste a una consulta, mientras siga abierta.",
    categoria: "Consultas",
    roles: ["estudiante"],
    ruta: "/estudiante/consultas",
    sinonimos: ["cambiar mi respuesta", "me equivoqué en la consulta", "editar encuesta"],
    pasos: [
      { narracion: "Toca la ficha 'Consultas' en tu tablero.", accion: "navegar", ruta: "/estudiante/consultas" },
      { narracion: "En la consulta ya 'Respondida', toca 'Ver / editar respuesta'.", accion: "click" },
      { narracion: "Toca 'Editar', elige la nueva opción y confirma con 'Actualizar respuesta'.", accion: "click" },
    ],
  },

  // ─────────────────────────── COMUNICADOS CON FIRMA ───────────────────────────
  {
    id: "est.firmar_comunicado",
    titulo: "Firmar un comunicado",
    descripcion:
      "Leer un comunicado que requiere tu firma y firmarlo con el dedo para dejar constancia de que lo leíste. Una vez firmado no se puede cambiar.",
    categoria: "Comunicados",
    roles: ["estudiante"],
    ruta: "/comunicados-firma",
    endpoint: "POST /api/comunicados-firma/firmar (solo el propio destinatario)",
    sinonimos: ["firmar circular", "comunicado por firmar", "poner mi firma"],
    pasos: [
      { narracion: "Toca la ficha 'Comunicados con firma' en tu tablero.", accion: "navegar", ruta: "/comunicados-firma" },
      {
        narracion: "Toca el comunicado marcado 'Pendiente por firmar'.",
        accion: "click",
        ancla: "firma.item",
      },
      {
        narracion: "Lee el mensaje y firma con el dedo en el recuadro blanco. Si te queda mal, tócale 'Borrar' y repítela.",
        accion: "click",
        ancla: "firma.lienzo",
      },
      { narracion: "Toca 'Firmar' para confirmar. Quedará constancia y ya no se puede modificar.", accion: "click" },
    ],
  },

  // ─────────────────────────── ASISTENCIA ───────────────────────────
  {
    id: "est.ver_asistencia",
    titulo: "Consultar tu asistencia",
    descripcion:
      "Ver tu porcentaje de asistencia por asignatura y el calendario del mes con cada día: Presente, Ausente, Con excusa o Entró tarde.",
    categoria: "Asistencia",
    roles: ["estudiante"],
    ruta: "/asistencia",
    sinonimos: ["mis fallas", "cuántas veces he faltado", "mi asistencia", "inasistencias"],
    pasos: [
      { narracion: "Toca la ficha 'Asistencia' en tu tablero.", accion: "navegar", ruta: "/asistencia" },
      {
        narracion: "Toca una asignatura para abrir su calendario del mes.",
        accion: "click",
        ancla: "asistencia.item_asignatura",
      },
      {
        narracion:
          "Cada día tiene un color: verde es Presente, rosa Ausente, ámbar Con excusa y naranja Entró tarde. Abajo está tu porcentaje de asistencia.",
        accion: "explicar",
      },
    ],
  },

  // ─────────────────────────── CALENDARIO Y MANUAL ───────────────────────────
  {
    id: "est.calendario_escolar",
    titulo: "Ver el calendario escolar",
    descripcion:
      "Consultar los periodos académicos, los días sin clases, los eventos y los festivos del año escolar completo.",
    categoria: "Institución",
    roles: ["estudiante"],
    ruta: "/calendario-escolar",
    sinonimos: ["cuándo termina el periodo", "días sin clases", "festivos", "eventos del colegio"],
    pasos: [
      { narracion: "Toca la ficha 'Calendario' en tu tablero.", accion: "navegar", ruta: "/calendario-escolar" },
      {
        narracion:
          "Ves los 12 meses del año escolar con sus colores: cada periodo, los días 'Sin clases', los eventos y los festivos. Toca un día pintado para ver su detalle.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "est.manual_convivencia",
    titulo: "Leer el Manual de Convivencia",
    descripcion: "Abrir el Manual de Convivencia del colegio para consultarlo.",
    categoria: "Institución",
    roles: ["estudiante"],
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
    id: "est.cambiar_celular",
    titulo: "Cambiar tu número de celular",
    descripcion:
      "Actualizar el número de celular con el que Normi te escribe. Como estudiante solo puedes cambiar tu celular (el nombre lo corrige el colegio).",
    categoria: "Perfil",
    roles: ["estudiante"],
    ruta: "/perfil",
    endpoint: "POST /api/perfil/datos (JWT propio)",
    sinonimos: ["cambiar mi número", "actualizar celular", "cambié de teléfono"],
    pasos: [
      { narracion: "Toca la ficha 'Perfil' en tu tablero.", accion: "navegar", ruta: "/perfil" },
      { narracion: "Abre 'Cambiar datos'.", accion: "click" },
      {
        narracion: "Escribe tu nuevo 'Número de celular' y confirma con 'Guardar datos'.",
        accion: "escribir",
        campo: "telefono",
      },
    ],
  },
  {
    id: "est.cambiar_contrasena",
    titulo: "Cambiar tu contraseña",
    descripcion: "Cambiar tu contraseña de entrada verificando la actual.",
    categoria: "Perfil",
    roles: ["estudiante"],
    ruta: "/perfil",
    endpoint: "POST /api/auth/change-password",
    sinonimos: ["cambiar clave", "nueva contraseña", "actualizar mi clave"],
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
    id: "est.notificaciones_whatsapp",
    titulo: "Elegir qué notificaciones te llegan al WhatsApp",
    descripcion:
      "Encender o apagar los avisos de WhatsApp que son opcionales para estudiantes: reportes de actividades y el aviso diario de actividades. Los demás (comunicados, inasistencias...) llegan siempre. Todo sigue quedando en la plataforma; solo se silencia el mensaje.",
    categoria: "Perfil",
    roles: ["estudiante"],
    ruta: "/perfil",
    endpoint: "POST /api/perfil/notificaciones (JWT propio)",
    sinonimos: ["silenciar notificaciones", "apagar avisos de whatsapp", "no quiero mensajes de tareas", "elegir qué me llega al whatsapp"],
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
    id: "est.recuperacion_contrasena",
    titulo: "Configurar cómo recuperar tu contraseña",
    descripcion:
      "Dejar lista una pregunta secreta (Normi te la hace por WhatsApp) o un correo para recuperar tu contraseña cuando se te olvide.",
    categoria: "Perfil",
    roles: ["estudiante"],
    ruta: "/perfil",
    endpoint: "POST /api/perfil/recuperacion",
    sinonimos: ["pregunta secreta", "si olvido mi contraseña", "correo de recuperación"],
    pasos: [
      { narracion: "Toca la ficha 'Perfil' en tu tablero.", accion: "navegar", ruta: "/perfil" },
      { narracion: "Abre 'Recuperación de contraseña'.", accion: "click" },
      {
        narracion:
          "Elige 'Por WhatsApp' (pregunta secreta que Normi te hará) o 'Por correo', llena los campos y toca 'Guardar'.",
        accion: "click",
      },
    ],
  },
  {
    id: "est.cambiar_foto",
    titulo: "Poner o cambiar tu foto de perfil",
    descripcion:
      "Subir una foto o tomarla en el momento, y acomodarla en el marco. Se hace desde el círculo del avatar en tu tablero (no desde Perfil).",
    categoria: "Perfil",
    roles: ["estudiante"],
    ruta: "/dashboard",
    sinonimos: ["subir mi foto", "cambiar foto de perfil", "poner mi foto"],
    pasos: [
      {
        narracion: "En tu tablero, toca el círculo con tu foto o tus iniciales.",
        accion: "click",
        ancla: "dash.avatar",
      },
      {
        narracion:
          "En 'Foto de perfil' elige 'Tomar foto' o 'Subir archivo', acomódala con el 'Zoom' y confirma con 'Guardar'.",
        accion: "click",
      },
    ],
  },
  {
    id: "est.enviar_sugerencia",
    titulo: "Enviar una sugerencia al colegio",
    descripcion: "Escribir una sugerencia anónima desde el Buzón de Sugerencias del tablero.",
    categoria: "Varios",
    roles: ["estudiante"],
    ruta: "/dashboard",
    sinonimos: ["buzón de sugerencias", "dar una idea", "quejarme", "proponer algo"],
    pasos: [
      { narracion: "Al final de tu tablero, toca 'Buzón de Sugerencias'.", accion: "click" },
      { narracion: "Escribe tu sugerencia y toca 'Enviar'.", accion: "escribir", campo: "sugerencia" },
    ],
  },
  {
    id: "est.reordenar_fichas",
    titulo: "Reorganizar las fichas de tu tablero",
    descripcion:
      "Cambiar el orden de las tarjetas del tablero manteniendo presionada una y arrastrándola a su nueva posición.",
    categoria: "Varios",
    roles: ["estudiante"],
    ruta: "/dashboard",
    sinonimos: ["mover las tarjetas", "ordenar mi tablero", "cambiar el orden de las fichas"],
    pasos: [
      {
        narracion:
          "En tu tablero, mantén presionada una tarjeta medio segundo y, sin soltar, arrástrala a donde la quieres. El orden se guarda solo.",
        accion: "explicar",
      },
    ],
  },
];
