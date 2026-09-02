// Catálogo "Normi te guía" — Módulo CONSULTAS.
//
// Flujo: /consultas abre directo en la lista; el botón verde "Nueva consulta"
// (arriba a la derecha) cambia a la vista de crear. Cada consulta abre su
// detalle en /consultas/:id
// (ConsultaDetalle), donde se ven las respuestas, se responde (si eres
// destinatario interno), se edita, se cierra, se elimina y se exporta a Excel.
//
// Guard de acceso a ambas páginas (Consultas.tsx y ConsultaDetalle.tsx): el
// useEffect echa a "/" si el cargo es vacío, "Acudiente" o "Estudiante". Es
// decir, entra CUALQUIER interno. Coincide con el guard de backend de
// Consultas/Comunicados: ALL_INTERNOS.
//
// La creación NO escribe solo en la tabla Consultas: tras insertar la fila
// dispara POST /api/comunicados/enviar (con como_normi=true solo si el cargo es
// Administrador) para mandar el link por WhatsApp a los destinatarios.
//
// Notas de acotación por rol dentro de ALL_INTERNOS:
//  - Editar consulta: la UI solo muestra el botón al CREADOR (y solo si está
//    activa). El backend es un update directo por RLS (sin gate de rol extra).
//  - Cerrar consulta: la UI la muestra a cualquier interno que la vea (mientras
//    esté activa), no solo al creador.
//  - Eliminar consulta: la UI muestra el botón al CREADOR o a un Administrador.

import type { Capacidad } from "../tipos";

// Cualquier interno con dashboard (todos menos Acudiente/Estudiante).
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

// Pasos compartidos para abrir el detalle de una consulta concreta.
const abrirDetalleConsulta = () =>
  [
    {
      narracion: "Entramos a Consultas.",
      accion: "navegar" as const,
      ruta: "/consultas",
    },
    {
      narracion: "Abre la consulta que quieres, tocando su tarjeta en la lista.",
      accion: "click" as const,
      ancla: "consultas.card_consulta",
      campo: "consulta",
    },
    {
      narracion: "Esperamos a que cargue el detalle con las respuestas.",
      accion: "esperar" as const,
      ancla: "consultas.detalle_cargado",
    },
  ];

export const CONSULTAS: Capacidad[] = [
  {
    id: "consultas.listar",
    titulo: "Ver todas las consultas",
    descripcion:
      "Abrir la lista de consultas del colegio, con su estado (abierta o cerrada) y si tienes alguna pendiente por responder.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas",
    endpoint: "supabase select Consultas (RLS tenant_isolation)",
    sinonimos: [
      "ver las consultas",
      "lista de consultas",
      "qué consultas hay",
      "consultas pendientes",
      "abrir consultas",
      "mostrarme las autorizaciones",
    ],
    pasos: [
      {
        narracion: "Vamos a la sección de Consultas.",
        accion: "navegar",
        ruta: "/consultas",
      },
      {
        narracion:
          "Aquí ves todas las consultas del colegio. Las que te toca responder salen resaltadas con la etiqueta 'Pendiente tu respuesta'.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "consultas.crear",
    titulo: "Crear y enviar una consulta",
    descripcion:
      "Armar una consulta o autorización (título, mensaje y destinatarios) y enviarla por WhatsApp con su link. Puede ser de opciones (sí/no) o de 'Diligenciar datos': un formulario con campos definidos por ti (ej. cédula, dirección, escalafón) cuyas respuestas solo ven rector, coordinadores, administrativos y secretaría.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas",
    endpoint:
      "insert Consultas (RLS) + POST /api/comunicados/enviar (guard ALL_INTERNOS; como_normi solo Administrador)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado(s) destinatario si va a estudiantes/acudientes/profesores.", },
      { entidad: "salon", descripcion: "Salón(es) destinatario (opcional).", },
      { entidad: "estudiante", descripcion: "Estudiantes específicos (opcional).", },
    ],
    sinonimos: [
      "crear una consulta",
      "hacer una autorización",
      "enviar una consulta a los papás",
      "mandar una autorización de permiso",
      "nueva consulta",
      "pedir autorización de salida",
      "encuesta de sí o no a los acudientes",
      "recolectar datos de los docentes",
      "formato para que los profesores llenen sus datos",
      "formulario de datos del personal",
    ],
    pasos: [
      {
        narracion: "Entramos a Consultas.",
        accion: "navegar",
        ruta: "/consultas",
      },
      {
        narracion: "Toca el botón verde 'Nueva consulta', arriba a la derecha.",
        accion: "click",
        ancla: "consultas.tab_crear",
      },
      {
        narracion: "Ponle un título claro a la consulta.",
        accion: "escribir",
        ancla: "consultas.input_titulo",
        campo: "titulo",
      },
      {
        narracion:
          "Escribe el mensaje completo, el texto que verá la persona al abrir el link.",
        accion: "escribir",
        ancla: "consultas.textarea_mensaje",
        campo: "mensaje_consulta",
      },
      {
        narracion:
          "Escribe el mensaje corto de WhatsApp. El sistema le agrega el link automáticamente al final.",
        accion: "escribir",
        ancla: "consultas.textarea_whatsapp",
        campo: "mensaje_whatsapp",
      },
      {
        narracion:
          "Elige el tipo de respuesta: 'Elegir una opción' (la clásica de sí/no) o 'Diligenciar datos' (el destinatario llena un formulario con los campos que definas, ej. cédula, dirección, escalafón; esas respuestas solo las ven rector, coordinadores, administrativos y secretaría).",
        accion: "click",
        ancla: "consultas.tipo_consulta",
        opcional: true,
      },
      {
        narracion:
          "Revisa las opciones de respuesta. Vienen 'SÍ autorizo' y 'NO autorizo', pero puedes cambiarlas.",
        accion: "escribir",
        ancla: "consultas.opcion_input",
        campo: "opcion",
        opcional: true,
      },
      {
        narracion:
          "Si elegiste 'Diligenciar datos', aquí escribes el nombre de cada campo del formulario (ej. Cédula, Dirección, Escalafón) y agregas más con 'Añadir campo'.",
        accion: "escribir",
        ancla: "consultas.campo_dato_input",
        campo: "campo_dato",
        opcional: true,
      },
      {
        narracion:
          "Si necesitas otra opción, toca 'Añadir opción' (hasta 4 en total).",
        accion: "click",
        ancla: "consultas.boton_agregar_opcion",
        opcional: true,
      },
      {
        narracion:
          "Marca uno o más perfiles destinatarios (Estudiantes, Acudientes, Profesores, Coordinadores, Rector, Administrativos, Secretaria General, Orientador(a) Escolar).",
        accion: "click",
        ancla: "consultas.checkbox_perfil",
        campo: "perfiles",
      },
      {
        narracion:
          "Si el destinatario es académico, marca el nivel o los grados. Al marcar un nivel se marcan todos sus grados.",
        accion: "click",
        ancla: "consultas.check_grado",
        campo: "grados",
        opcional: true,
      },
      {
        narracion:
          "Abre 'Salones' si quieres acotar a salones puntuales (déjalo vacío para todos los de esos grados).",
        accion: "click",
        ancla: "consultas.toggle_salones",
        campo: "salones",
        opcional: true,
      },
      {
        narracion:
          "Abre 'Estudiantes específicos' si la consulta es solo para algunos (déjalo vacío para todos los filtrados).",
        accion: "click",
        ancla: "consultas.toggle_estudiantes",
        campo: "estudiantes",
        opcional: true,
      },
      {
        narracion:
          "Si marcaste Profesores, abre 'Profesores específicos' para elegir cuáles (vacío = todos los del filtro).",
        accion: "click",
        ancla: "consultas.toggle_profesores",
        campo: "profesores",
        opcional: true,
      },
      {
        narracion:
          "Para Coordinadores, Administrativos, Secretaria u Orientador puedes marcar personas puntuales (vacío = todos).",
        accion: "click",
        ancla: "consultas.check_interno_especifico",
        opcional: true,
      },
      {
        narracion:
          "Revisa el 'Resumen del envío' para confirmar a quién le llega.",
        accion: "explicar",
      },
      {
        narracion:
          "Deja activado 'Requiere firma digital' si es una autorización oficial, o desactívalo si no hace falta firma.",
        accion: "click",
        ancla: "consultas.switch_firma",
        campo: "requiere_firma",
        opcional: true,
      },
      {
        narracion: "Toca 'Crear y enviar'. Se guarda y se despacha por WhatsApp.",
        accion: "click",
        ancla: "consultas.boton_crear_enviar",
      },
    ],
  },
  {
    id: "consultas.limpiar_formulario",
    titulo: "Limpiar el formulario de nueva consulta",
    descripcion:
      "Borrar todo lo escrito en el formulario de creación para empezar de cero.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas",
    sinonimos: [
      "limpiar el formulario",
      "borrar lo que escribí",
      "empezar de nuevo la consulta",
      "resetear la consulta",
    ],
    pasos: [
      {
        narracion: "Entramos a Consultas.",
        accion: "navegar",
        ruta: "/consultas",
      },
      {
        narracion: "Toca el botón verde 'Nueva consulta', arriba a la derecha.",
        accion: "click",
        ancla: "consultas.tab_crear",
      },
      {
        narracion: "Toca 'Limpiar' para vaciar todos los campos.",
        accion: "click",
        ancla: "consultas.boton_limpiar",
      },
    ],
  },
  {
    id: "consultas.ver_detalle",
    titulo: "Abrir una consulta y ver las respuestas",
    descripcion:
      "Entrar al detalle de una consulta para revisar quién respondió, qué opción marcó y su firma.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    endpoint: "supabase select Consultas + Consultas_Respuestas (RLS)",
    sinonimos: [
      "ver las respuestas de una consulta",
      "quién respondió la consulta",
      "abrir el detalle de la consulta",
      "cuántos han respondido",
      "ver quién autorizó",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion:
          "Según a quién iba dirigida, aquí ves la tabla de estudiantes con la respuesta de cada acudiente, y/o las tablas de respuestas de internos y de estudiantes.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "consultas.buscar_filtrar",
    titulo: "Buscar y filtrar respuestas",
    descripcion:
      "Buscar un estudiante o filtrar la tabla por estado, opción marcada, grado o salón (solo en consultas dirigidas a estudiantes o acudientes).",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    sinonimos: [
      "buscar un estudiante en la consulta",
      "filtrar los que no han respondido",
      "ver quiénes marcaron NO",
      "filtrar por grado",
      "filtrar por salón",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion:
          "Escribe el nombre del estudiante en el buscador (el buscador y los filtros solo aparecen cuando la consulta va dirigida a estudiantes o acudientes).",
        accion: "escribir",
        ancla: "consultas.buscar_estudiante",
        campo: "busqueda",
        opcional: true,
      },
      {
        narracion:
          "Usa 'Estado' para ver solo los que tienen respuesta o los que faltan.",
        accion: "seleccionar",
        ancla: "consultas.filtro_estado",
        campo: "estado",
        opcional: true,
      },
      {
        narracion:
          "Con 'Opción' filtras por la respuesta marcada (este filtro se oculta si en Estado elegiste Sin respuesta).",
        accion: "seleccionar",
        ancla: "consultas.filtro_opcion",
        campo: "opcion",
        opcional: true,
      },
      {
        narracion: "Con 'Grado' y 'Salón' acotas por curso.",
        accion: "seleccionar",
        ancla: "consultas.filtro_grado",
        campo: "grado",
        opcional: true,
      },
    ],
  },
  {
    id: "consultas.responder",
    titulo: "Responder una consulta (como destinatario interno)",
    descripcion:
      "Si la consulta va dirigida a tu cargo, marcar tu opción y firmar desde el panel 'Tu respuesta' en el detalle.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    endpoint: "supabase upsert Consultas_Respuestas (RLS; tipo_respondente=interno)",
    sinonimos: [
      "responder la consulta",
      "contestar la autorización",
      "marcar mi respuesta",
      "firmar la consulta",
      "autorizar desde la plataforma",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion:
          "Si te toca responder y la consulta sigue abierta, aparece el panel 'Tu respuesta'. Elige la opción que corresponda.",
        accion: "click",
        ancla: "consultas.opcion_respuesta",
        campo: "opcion",
      },
      {
        narracion:
          "Si la consulta pide firma, dibuja tu firma con el dedo o el mouse dentro del recuadro blanco. Si te queda mal, toca 'Limpiar firma' y repite.",
        accion: "click",
        ancla: "consultas.firma_canvas",
        campo: "firma",
        opcional: true,
      },
      {
        narracion: "Toca 'Enviar respuesta'. Listo.",
        accion: "click",
        ancla: "consultas.boton_enviar_respuesta",
      },
    ],
  },
  {
    id: "consultas.diligenciar_datos",
    titulo: "Diligenciar una consulta de datos (formulario)",
    descripcion:
      "Cuando una consulta es de tipo 'Diligenciar datos' (por ejemplo la actualización de datos del personal), llenar el formulario con los campos que pidió quien la creó. Los datos ya conocidos (nombre, cédula, fecha de nacimiento, edad, teléfono) aparecen prellenados; solo se confirman o corrigen.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    endpoint: "supabase upsert Consultas_Respuestas (columna datos jsonb; tipo_respondente=interno)",
    sinonimos: [
      "diligenciar el formato de datos",
      "llenar el formulario de la consulta",
      "actualizar mis datos que pidió coordinación",
      "responder la consulta de datos",
      "diligenciar la consulta",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion:
          "Si la consulta es de datos y te toca diligenciarla, arriba aparece 'Debes diligenciar este formulario'. Toca 'Diligenciar formulario'.",
        accion: "click",
        ancla: "consultas.boton_diligenciar",
      },
      {
        narracion:
          "Llena cada campo. Los que la plataforma ya conoce vienen prellenados: revísalos y corrige si hace falta.",
        accion: "escribir",
        ancla: "consulta.campos_datos",
        campo: "datos",
      },
      {
        narracion: "Si pide firma, firma en el recuadro. Luego toca 'Enviar respuesta'. Puedes volver a editar tus datos después.",
        accion: "click",
      },
    ],
  },
  {
    id: "consultas.editar_respuesta",
    titulo: "Cambiar tu respuesta ya enviada",
    descripcion:
      "Editar la opción o la firma de una respuesta que ya diste a una consulta.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    endpoint: "supabase upsert Consultas_Respuestas (RLS)",
    sinonimos: [
      "cambiar mi respuesta",
      "corregir lo que respondí",
      "editar mi autorización",
      "me equivoqué en la consulta",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion:
          "Busca el panel con el chulo verde que dice 'Ya respondiste esta consulta' (solo existe mientras la consulta siga abierta) y toca el botón Editar pequeño que está dentro de ese panel, no el Editar de la barra de arriba.",
        accion: "click",
        ancla: "consultas.boton_editar_respuesta",
      },
      {
        narracion: "Cambia la opción que necesites.",
        accion: "click",
        ancla: "consultas.opcion_respuesta",
        campo: "opcion",
      },
      {
        narracion: "Vuelve a firmar si hace falta y toca 'Actualizar respuesta'.",
        accion: "click",
        ancla: "consultas.boton_enviar_respuesta",
      },
    ],
  },
  {
    id: "consultas.copiar_link",
    titulo: "Copiar el link de una consulta",
    descripcion:
      "Copiar el enlace público de la consulta para reenviarlo manualmente.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    sinonimos: [
      "copiar el link de la consulta",
      "compartir el enlace de la consulta",
      "sacar el link para reenviar",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion: "Toca 'Copiar link'. El enlace queda en el portapapeles.",
        accion: "click",
        ancla: "consultas.boton_copiar_link",
      },
    ],
  },
  {
    id: "consultas.exportar_excel",
    titulo: "Descargar las respuestas en Excel",
    descripcion:
      "Exportar la tabla de estudiantes y las respuestas de sus acudientes a un archivo de Excel.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    sinonimos: [
      "descargar las respuestas en excel",
      "exportar la consulta a excel",
      "sacar el reporte de la consulta",
      "bajar quién respondió",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion: "Toca el botón 'Excel'.",
        accion: "click",
        ancla: "consultas.boton_excel",
      },
      {
        narracion:
          "Se descarga el archivo con la lista y las respuestas filtradas que estés viendo. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "consultas.ver_firma",
    titulo: "Ver la firma de una respuesta",
    descripcion:
      "Abrir la firma digital que dejó un acudiente, interno o estudiante al responder.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    sinonimos: [
      "ver la firma",
      "mostrar la firma del acudiente",
      "revisar la firma de la autorización",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion:
          "En la fila de la persona, toca el ícono del ojo junto a su respuesta para ver la firma.",
        accion: "click",
        ancla: "consultas.boton_ver_firma",
      },
      {
        narracion: "Se abre la firma en grande. Ciérrala cuando termines.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "consultas.editar",
    titulo: "Editar una consulta",
    descripcion:
      "Cambiar el título, el mensaje o los destinatarios de una consulta. Solo se notifica a los destinatarios nuevos que agregues.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    endpoint:
      "supabase update Consultas (RLS) + POST /api/comunicados/enviar (solo a los nuevos destinatarios)",
    sinonimos: [
      "editar la consulta",
      "cambiar el mensaje de la consulta",
      "agregar más destinatarios a la consulta",
      "corregir el título de la consulta",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion:
          "Toca 'Editar'. El botón solo aparece si la consulta está abierta y tú la creaste.",
        accion: "click",
        ancla: "consultas.boton_editar",
      },
      {
        narracion: "Ajusta el título si hace falta.",
        accion: "escribir",
        ancla: "consultas.modal_editar_titulo",
        campo: "titulo",
        opcional: true,
      },
      {
        narracion: "Ajusta el mensaje completo.",
        accion: "escribir",
        ancla: "consultas.modal_editar_mensaje",
        campo: "mensaje_consulta",
        opcional: true,
      },
      {
        narracion:
          "Si quieres, agrega o cambia destinatarios. Solo los nuevos reciben notificación.",
        accion: "click",
        ancla: "consultas.modal_editar_destinatarios",
        campo: "destinatarios",
        opcional: true,
      },
      {
        narracion: "Toca 'Guardar cambios'.",
        accion: "click",
        ancla: "consultas.modal_editar_guardar",
      },
    ],
  },
  {
    id: "consultas.cerrar",
    titulo: "Cerrar una consulta",
    descripcion:
      "Cerrar la consulta para que nadie más pueda responder (las respuestas quedan guardadas).",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    endpoint: "supabase update Consultas set activa=false (RLS)",
    sinonimos: [
      "cerrar la consulta",
      "terminar la consulta",
      "que no puedan responder más",
      "finalizar la autorización",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion: "Toca 'Cerrar consulta'.",
        accion: "click",
        ancla: "consultas.boton_cerrar",
      },
      {
        narracion:
          "Confirma en el aviso. Desde ese momento nadie más puede responder.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "consultas.eliminar",
    titulo: "Eliminar una consulta",
    descripcion:
      "Borrar por completo la consulta y todas sus respuestas. No se puede deshacer.",
    categoria: "Consultas",
    roles: [...ALL_INTERNOS],
    ruta: "/consultas/:id",
    endpoint:
      "supabase delete Consultas_Respuestas + delete Consultas (RLS; UI solo creador o Administrador)",
    sinonimos: [
      "eliminar la consulta",
      "borrar la consulta",
      "quitar esta autorización",
      "eliminar la consulta y sus respuestas",
    ],
    pasos: [
      ...abrirDetalleConsulta(),
      {
        narracion:
          "Toca 'Eliminar'. El botón solo aparece si tú creaste la consulta o eres Administrador.",
        accion: "click",
        ancla: "consultas.boton_eliminar",
      },
      {
        narracion: "En el aviso, confirma con 'Sí, eliminar'.",
        accion: "click",
        ancla: "consultas.confirmar_eliminar",
      },
    ],
  },
];
