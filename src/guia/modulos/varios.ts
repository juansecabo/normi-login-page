// Catálogo "Normi te guía" — Módulo VARIOS.
//
// Agrupa las fichas y herramientas que no caen en un módulo grande propio:
//   - Perfil (datos personales, contraseña y recuperación) — Perfil.tsx.
//   - Menú global del encabezado — HeaderNormi.tsx (Descargar App, Cambiar
//     institución, Cambiar perfil, WhatsApp, Cambiar/Crear contraseña, Cerrar
//     sesión).
//   - Dirección de grupo: hub + Fotos de mi grupo — DireccionGrupo.tsx / MiGrupo.tsx.
//   - Normi Examinadora (genera evaluaciones/talleres/quiz en DOCX) — NormiExaminadora.tsx.
//   - Registro en Normi (quién está registrado) — RegistroNormi.tsx.
//   - Uso de Normi (interacciones por profesor/salón) — rector/UsoNormi.tsx.
//   - Calendario escolar (solo lectura) — CalendarioEscolar.tsx.
//   - Manual de Convivencia — ManualConvivencia.tsx.
//   - Bandejas de administración: Buzón de Sugerencias (admin/Sugerencias.tsx),
//     Correcciones de registro (admin/CorreccionesRegistroAdmin.tsx) y Dudas del
//     personal (admin/DudasAdmin.tsx).
//
// Nota de roles: Perfil, el menú global, el calendario y el manual los usa
// cualquier interno; por eso listamos los ocho roles con dashboard. Las bandejas
// de admin siguen su guard real del server (ver cada capacidad).

import type { Capacidad, RolGuia } from "../tipos";

// Los ocho roles internos que tienen tablero. Perfil, menú global, calendario y
// manual son para todos ellos.
const TODOS_INTERNOS: RolGuia[] = [
  "profesor",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "portero",
  "admin",
];

// Roles con dashboard de gestión (puedeAccederDashboard(): NO incluye profesor).
// Fuente: useSession.puedeAccederDashboard.
const STAFF_DASHBOARD: RolGuia[] = [
  "rector",
  "coordinador",
  "admin",
  "administrativo",
  "secretaria",
  "orientador",
  "portero",
];

// Guard real de las bandejas de admin de correcciones y dudas
// (requireRole(ROLES_ADMIN) = SuperAdmin, Administrador, Rector, Coordinador(a)).
const ADMIN_RECTOR_COORD: RolGuia[] = ["admin", "rector", "coordinador"];

export const VARIOS: Capacidad[] = [
  // ─────────────────────────────  PERFIL  ─────────────────────────────
  {
    id: "varios.perfil_cambiar_datos",
    titulo: "Cambiar tus datos personales",
    descripcion:
      "Actualizar tu nombre, apellidos, número de celular y fecha de nacimiento. El cambio aplica a todos tus perfiles en todos los colegios.",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/perfil",
    endpoint: "PATCH /api/perfil/datos (JWT propio — escribe en Usuarios)",
    sinonimos: [
      "cambiar mis datos",
      "actualizar mi teléfono",
      "corregir mi nombre",
      "cambiar mi celular",
      "poner mi fecha de nacimiento",
      "editar mi perfil",
    ],
    pasos: [
      { narracion: "Entramos a tu perfil.", accion: "navegar", ruta: "/perfil" },
      {
        narracion: "Abre la tarjeta 'Cambiar datos'.",
        accion: "click",
        ancla: "varios.perfil_ficha_datos",
      },
      {
        narracion: "Ajusta tu nombre, apellidos, celular o fecha de nacimiento según necesites.",
        accion: "escribir",
        ancla: "varios.perfil_input_telefono",
        campo: "telefono",
      },
      {
        narracion: "Guarda los cambios. El ajuste se refleja en todos tus perfiles y colegios.",
        accion: "click",
        ancla: "varios.perfil_guardar_datos",
      },
    ],
  },
  {
    id: "varios.perfil_cambiar_contrasena",
    titulo: "Cambiar tu contraseña (desde Perfil)",
    descripcion:
      "Cambiar la contraseña desde la sección 'Cambiar datos' del perfil, verificando la actual.",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/perfil",
    endpoint: "POST /auth/change-password (verifica la actual con service_role)",
    sinonimos: [
      "cambiar mi contraseña",
      "cambiar clave desde el perfil",
      "actualizar mi contraseña",
      "poner una contraseña nueva",
    ],
    pasos: [
      { narracion: "Entramos a tu perfil.", accion: "navegar", ruta: "/perfil" },
      {
        narracion: "Abre 'Cambiar datos'.",
        accion: "click",
        ancla: "varios.perfil_ficha_datos",
      },
      {
        narracion: "Baja hasta 'Cambiar contraseña' y escribe tu contraseña actual.",
        accion: "escribir",
        ancla: "varios.perfil_pwd_actual",
        campo: "contrasena_actual",
      },
      {
        narracion: "Escribe la nueva contraseña (mínimo 6 caracteres).",
        accion: "escribir",
        ancla: "varios.perfil_pwd_nueva",
        campo: "contrasena_nueva",
      },
      {
        narracion: "Repítela para confirmar.",
        accion: "escribir",
        ancla: "varios.perfil_pwd_confirma",
        campo: "contrasena_nueva",
      },
      {
        narracion: "Toca 'Cambiar contraseña'. Úsala desde ahora en cualquiera de tus perfiles.",
        accion: "click",
        ancla: "varios.perfil_guardar_contrasena",
      },
    ],
  },
  {
    id: "varios.perfil_recuperacion_whatsapp",
    titulo: "Configurar recuperación por WhatsApp (pregunta secreta)",
    descripcion:
      "Definir una pregunta y respuesta secretas para que Normi te devuelva la contraseña por WhatsApp cuando la olvides.",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/perfil",
    endpoint: "POST /api/perfil/recuperacion (JWT propio)",
    sinonimos: [
      "configurar recuperación de contraseña",
      "poner pregunta secreta",
      "recuperar la clave por whatsapp",
      "qué hago si olvido la contraseña",
    ],
    pasos: [
      { narracion: "Entramos a tu perfil.", accion: "navegar", ruta: "/perfil" },
      {
        narracion: "Abre la tarjeta 'Recuperación de contraseña'.",
        accion: "click",
        ancla: "varios.perfil_ficha_recuperacion",
      },
      {
        narracion: "Elige el método 'Por WhatsApp'.",
        accion: "click",
        ancla: "varios.perfil_rec_metodo_whatsapp",
      },
      {
        narracion: "Escribe una pregunta cuya respuesta solo tú conozcas.",
        accion: "escribir",
        ancla: "varios.perfil_rec_pregunta",
        campo: "pregunta_secreta",
      },
      {
        narracion: "Escribe la respuesta.",
        accion: "escribir",
        ancla: "varios.perfil_rec_respuesta",
        campo: "respuesta_secreta",
      },
      {
        narracion: "Guarda. Cuando le digas a Normi que olvidaste tu clave, te hará esta pregunta.",
        accion: "click",
        ancla: "varios.perfil_rec_guardar",
      },
    ],
  },
  {
    id: "varios.perfil_recuperacion_correo",
    titulo: "Configurar recuperación por correo",
    descripcion:
      "Registrar un correo donde recibir la contraseña desde la página de inicio cuando la olvides.",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/perfil",
    endpoint: "POST /api/perfil/recuperacion (JWT propio)",
    sinonimos: [
      "recuperar contraseña por correo",
      "poner un correo de recuperación",
      "que me llegue la clave al correo",
    ],
    pasos: [
      { narracion: "Entramos a tu perfil.", accion: "navegar", ruta: "/perfil" },
      {
        narracion: "Abre 'Recuperación de contraseña'.",
        accion: "click",
        ancla: "varios.perfil_ficha_recuperacion",
      },
      {
        narracion: "Elige el método 'Por correo'.",
        accion: "click",
        ancla: "varios.perfil_rec_metodo_correo",
      },
      {
        narracion: "Escribe el correo donde quieres recibir tu contraseña.",
        accion: "escribir",
        ancla: "varios.perfil_rec_correo",
        campo: "correo",
      },
      {
        narracion: "Repite el correo para confirmarlo.",
        accion: "escribir",
        ancla: "varios.perfil_rec_correo2",
        campo: "correo",
      },
      {
        narracion: "Guarda. Desde la página de inicio podrás pedir que te lo enviemos ahí.",
        accion: "click",
        ancla: "varios.perfil_rec_guardar",
      },
    ],
  },

  // ──────────────────  MENÚ GLOBAL DEL ENCABEZADO  ──────────────────
  {
    id: "varios.menu_descargar_app",
    titulo: "Descargar la app (instalar en el dispositivo)",
    descripcion:
      "Instalar Notas Normi como aplicación en el teléfono o computador desde el menú del encabezado. Solo aparece si el navegador permite instalarla.",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/dashboard",
    sinonimos: [
      "descargar la app",
      "instalar la aplicación",
      "poner Notas Normi en el celular",
      "cómo instalo la app",
    ],
    pasos: [
      {
        narracion: "Abre el menú del encabezado (botón 'Menú' arriba a la derecha).",
        accion: "click",
        ancla: "varios.header_menu",
      },
      {
        narracion:
          "Toca 'Descargar App'. Si no aparece, tu navegador ya la tiene instalada o no permite instalarla ahí.",
        accion: "click",
        ancla: "varios.header_descargar_app",
      },
    ],
  },
  {
    id: "varios.menu_cambiar_perfil",
    titulo: "Cambiar de perfil (otro colegio u otro rol)",
    descripcion:
      "Saltar a otro de tus perfiles cuando la misma cédula está registrada en otro colegio o con otro rol. Solo aparece si tienes varios perfiles.",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/dashboard",
    endpoint: "POST /auth/switch-profile (JWT propio)",
    sinonimos: [
      "cambiar de perfil",
      "cambiar de colegio",
      "entrar con mi otro rol",
      "pasar a mi otro perfil",
    ],
    pasos: [
      {
        narracion: "Abre el menú del encabezado.",
        accion: "click",
        ancla: "varios.header_menu",
      },
      {
        narracion:
          "Toca 'Cambiar perfil'. Si no aparece, esta cédula solo tiene un perfil.",
        accion: "click",
        ancla: "varios.header_cambiar_perfil",
      },
      {
        narracion: "En el selector, elige el perfil al que quieres entrar.",
        accion: "click",
        ancla: "varios.selector_perfil",
        campo: "perfil",
      },
    ],
  },
  {
    id: "varios.menu_cambiar_institucion",
    titulo: "Volver a la plataforma (SuperAdmin)",
    descripcion:
      "Regresar al panel de plataforma después de haber entrado a un colegio como SuperAdmin. Solo aparece durante esa suplantación.",
    categoria: "Varios",
    roles: ["admin"],
    ruta: "/dashboard",
    sinonimos: [
      "cambiar de institución",
      "volver a la plataforma",
      "salir del colegio y volver al panel general",
    ],
    pasos: [
      {
        narracion: "Abre el menú del encabezado.",
        accion: "click",
        ancla: "varios.header_menu",
      },
      {
        narracion: "Toca 'Cambiar institución' para volver al panel de plataforma.",
        accion: "click",
        ancla: "varios.header_cambiar_institucion",
      },
    ],
  },
  {
    id: "varios.menu_whatsapp",
    titulo: "Abrir el WhatsApp de Normi del colegio",
    descripcion:
      "Abrir el chat de WhatsApp del número de Normi de tu colegio desde el menú. Solo aparece si el colegio tiene número configurado.",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/dashboard",
    sinonimos: [
      "abrir el whatsapp de normi",
      "escribirle a normi por whatsapp",
      "cuál es el número de normi",
    ],
    pasos: [
      {
        narracion: "Abre el menú del encabezado.",
        accion: "click",
        ancla: "varios.header_menu",
      },
      {
        narracion:
          "Toca 'WhatsApp'. Se abre el chat con el número de Normi de tu colegio.",
        accion: "click",
        ancla: "varios.header_whatsapp",
      },
    ],
  },
  {
    id: "varios.menu_cambiar_contrasena",
    titulo: "Cambiar o crear contraseña (desde el menú)",
    descripcion:
      "Abrir el pop-up de contraseña desde el menú del encabezado. Si aún no tienes contraseña, dice 'Crear contraseña' y no pide la actual.",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/dashboard",
    endpoint: "POST /auth/change-password (verifica la actual con service_role)",
    sinonimos: [
      "crear mi contraseña",
      "cambiar contraseña desde el menú",
      "todavía no tengo contraseña",
      "cambiar clave rápido",
    ],
    pasos: [
      {
        narracion: "Abre el menú del encabezado.",
        accion: "click",
        ancla: "varios.header_menu",
      },
      {
        narracion: "Toca 'Cambiar contraseña' (o 'Crear contraseña' si aún no tienes una).",
        accion: "click",
        ancla: "varios.header_cambiar_contrasena",
      },
      {
        narracion: "Si el pop-up lo pide, escribe tu contraseña actual.",
        accion: "escribir",
        ancla: "varios.modal_pwd_actual",
        campo: "contrasena_actual",
        opcional: true,
      },
      {
        narracion: "Escribe la nueva contraseña (mínimo 6 caracteres).",
        accion: "escribir",
        ancla: "varios.modal_pwd_nueva",
        campo: "contrasena_nueva",
      },
      {
        narracion: "Repítela para confirmar.",
        accion: "escribir",
        ancla: "varios.modal_pwd_confirma",
        campo: "contrasena_nueva",
      },
      {
        narracion: "Toca 'Guardar'.",
        accion: "click",
        ancla: "varios.modal_pwd_guardar",
      },
    ],
  },
  {
    id: "varios.menu_cerrar_sesion",
    titulo: "Cerrar sesión",
    descripcion: "Salir de la cuenta desde el menú del encabezado.",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/dashboard",
    sinonimos: ["cerrar sesión", "salir de mi cuenta", "salir de la plataforma", "log out"],
    pasos: [
      {
        narracion: "Abre el menú del encabezado.",
        accion: "click",
        ancla: "varios.header_menu",
      },
      {
        narracion: "Toca 'Cerrar sesión'. Vuelves a la página de inicio.",
        accion: "click",
        ancla: "varios.header_cerrar_sesion",
      },
    ],
  },

  // ─────────────────  DIRECCIÓN DE GRUPO / MI GRUPO  ─────────────────
  {
    id: "varios.mi_grupo_subir_foto",
    titulo: "Subir o cambiar la foto de un estudiante de mi grupo",
    descripcion:
      "Como director de grupo, poner o reemplazar la foto de perfil de un estudiante de tu salón (útil en preescolar y primaria, donde los niños no entran a ponerse foto).",
    categoria: "Varios",
    roles: ["profesor"],
    requiereDirectorGrupo: true,
    ruta: "/mi-grupo",
    endpoint: "POST /api/auth/avatar-estudiante/:id (valida permiso en el server)",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante de tu grupo." }],
    sinonimos: [
      "subir la foto de un estudiante",
      "poner foto a un niño de mi salón",
      "cambiar la foto de un alumno",
      "fotos de mi grupo",
    ],
    pasos: [
      { narracion: "Vamos a Dirección de grupo.", accion: "navegar", ruta: "/direccion-grupo" },
      {
        narracion: "Abre 'Fotos de mi grupo'.",
        accion: "click",
        ancla: "varios.direccion_ficha_fotos",
      },
      {
        narracion: "Si es un salón grande, usa el buscador para ubicar al estudiante.",
        accion: "escribir",
        ancla: "varios.mi_grupo_buscar",
        campo: "estudiante",
        opcional: true,
      },
      {
        narracion: "Toca la foto del estudiante para subir o cambiar su imagen.",
        accion: "click",
        ancla: "varios.mi_grupo_avatar",
        campo: "estudiante",
      },
      {
        narracion: "Elige la imagen desde tu dispositivo. Se guarda sola. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "varios.mi_grupo_eliminar_foto",
    titulo: "Quitar la foto de un estudiante de mi grupo",
    descripcion: "Como director de grupo, eliminar la foto de perfil de un estudiante de tu salón.",
    categoria: "Varios",
    roles: ["profesor"],
    requiereDirectorGrupo: true,
    ruta: "/mi-grupo",
    endpoint: "DELETE /api/auth/avatar-estudiante/:id (valida permiso en el server)",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante de tu grupo." }],
    sinonimos: [
      "quitar la foto de un estudiante",
      "eliminar la foto de un niño",
      "borrar la imagen de un alumno",
    ],
    pasos: [
      { narracion: "Vamos a Dirección de grupo.", accion: "navegar", ruta: "/direccion-grupo" },
      {
        narracion: "Abre 'Fotos de mi grupo'.",
        accion: "click",
        ancla: "varios.direccion_ficha_fotos",
      },
      {
        narracion: "Toca la foto del estudiante al que se la quieres quitar.",
        accion: "click",
        ancla: "varios.mi_grupo_avatar",
        campo: "estudiante",
      },
      {
        narracion: "Usa la opción de eliminar foto y confirma. Queda con las iniciales.",
        accion: "click",
        ancla: "varios.mi_grupo_avatar_eliminar",
      },
    ],
  },
  {
    id: "varios.direccion_grupo_consolidado",
    titulo: "Abrir el consolidado de mi grupo",
    descripcion:
      "Como director de grupo, abrir el consolidado con las notas de todos tus estudiantes en todas las asignaturas desde el hub de Dirección de grupo.",
    categoria: "Varios",
    roles: ["profesor"],
    requiereDirectorGrupo: true,
    ruta: "/consolidado-grupo",
    sinonimos: [
      "consolidado de mi grupo",
      "ver las notas de todo mi salón",
      "notas de mis estudiantes en todas las materias",
    ],
    pasos: [
      { narracion: "Vamos a Dirección de grupo.", accion: "navegar", ruta: "/direccion-grupo" },
      {
        narracion: "Abre 'Consolidado de mi grupo'.",
        accion: "click",
        ancla: "varios.direccion_ficha_consolidado",
      },
      {
        narracion:
          "Ahí ves las notas de todos tus estudiantes en todas las asignaturas.",
        accion: "explicar",
      },
    ],
  },

  // ──────────────────────  NORMI EXAMINADORA  ──────────────────────
  {
    id: "varios.examinadora_generar",
    titulo: "Crear una evaluación, taller o quiz con Normi Examinadora",
    descripcion:
      "Generar un documento Word (evaluación, taller o quiz) con preguntas de selección múltiple y/o abiertas sobre un tema, para una de tus asignaturas.",
    categoria: "Varios",
    roles: ["profesor", "admin"],
    ruta: "/normi-examinadora",
    endpoint: "POST /api/examinadora/generar (Profesor, Administrador)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura que tienes asignada." },
      { entidad: "grado", descripcion: "Grado de la actividad." },
    ],
    sinonimos: [
      "crear una evaluación",
      "hacer un taller",
      "generar un quiz",
      "normi examinadora",
      "crear un examen con normi",
      "armar preguntas de un tema",
    ],
    pasos: [
      { narracion: "Entramos a Normi Examinadora.", accion: "navegar", ruta: "/normi-examinadora" },
      {
        narracion: "Elige qué quieres crear: evaluación, taller o quiz.",
        accion: "seleccionar",
        ancla: "varios.examinadora_tipo",
        campo: "tipo_actividad",
      },
      {
        narracion: "Selecciona la asignatura.",
        accion: "seleccionar",
        ancla: "varios.examinadora_asignatura",
        campo: "asignatura",
      },
      {
        narracion: "Selecciona el grado.",
        accion: "seleccionar",
        ancla: "varios.examinadora_grado",
        campo: "grado",
      },
      {
        narracion: "Si quieres, elige el salón (es opcional).",
        accion: "seleccionar",
        ancla: "varios.examinadora_salon",
        campo: "salon",
        opcional: true,
      },
      {
        narracion: "Escribe el tema de la actividad.",
        accion: "escribir",
        ancla: "varios.examinadora_tema",
        campo: "tema",
      },
      {
        narracion: "Agrega instrucciones adicionales si las necesitas (opcional).",
        accion: "escribir",
        ancla: "varios.examinadora_instrucciones",
        campo: "instrucciones",
        opcional: true,
      },
      {
        narracion: "Define cuántas preguntas de selección múltiple quieres (hasta 30).",
        accion: "escribir",
        ancla: "varios.examinadora_preguntas_multiple",
        campo: "preguntas_multiple",
        opcional: true,
      },
      {
        narracion: "Define cuántas preguntas abiertas quieres (hasta 30).",
        accion: "escribir",
        ancla: "varios.examinadora_preguntas_abiertas",
        campo: "preguntas_abiertas",
        opcional: true,
      },
      {
        narracion: "Toca 'Crear'. Normi arma el documento y se descarga en Word. Listo.",
        accion: "click",
        ancla: "varios.examinadora_crear",
      },
    ],
  },

  // ──────────────────────  REGISTRO EN NORMI  ──────────────────────
  {
    id: "varios.registro_normi_consultar",
    titulo: "Consultar quién está registrado en Normi",
    descripcion:
      "Ver qué estudiantes y acudientes ya se registraron con Normi, con filtros por grado, salón y estado, y buscador por nombre o cédula.",
    categoria: "Varios",
    roles: ["profesor", "rector", "coordinador", "admin"],
    ruta: "/registro-normi",
    sinonimos: [
      "quién está registrado en normi",
      "ver estudiantes registrados",
      "qué acudientes se registraron",
      "estado de registro",
      "quiénes faltan por registrarse",
    ],
    pasos: [
      { narracion: "Entramos a Registro en Normi.", accion: "navegar", ruta: "/registro-normi" },
      {
        narracion: "Elige la pestaña 'Estudiantes' o 'Acudientes' según lo que quieras revisar.",
        accion: "click",
        ancla: "varios.registro_tab",
        campo: "pestana",
      },
      {
        narracion: "Filtra por grado si te interesa un grado concreto.",
        accion: "seleccionar",
        ancla: "varios.registro_filtro_grado",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Filtra por salón si quieres uno específico.",
        accion: "seleccionar",
        ancla: "varios.registro_filtro_salon",
        campo: "salon",
        opcional: true,
      },
      {
        narracion:
          "Usa el filtro de estado para ver solo registrados o solo los que faltan.",
        accion: "seleccionar",
        ancla: "varios.registro_filtro_estado",
        campo: "estado",
        opcional: true,
      },
      {
        narracion: "O busca a alguien por nombre o cédula.",
        accion: "escribir",
        ancla: "varios.registro_buscar",
        campo: "estudiante",
        opcional: true,
      },
    ],
  },
  {
    id: "varios.registro_normi_ver_acudiente",
    titulo: "Ver la info del acudiente registrado de un estudiante",
    descripcion:
      "Abrir el pop-up con el nombre y teléfono del acudiente que está registrado en Normi para un estudiante.",
    categoria: "Varios",
    roles: ["profesor", "rector", "coordinador", "admin"],
    ruta: "/registro-normi",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante cuyo acudiente quieres ver." }],
    sinonimos: [
      "ver el acudiente de un estudiante",
      "qué teléfono tiene registrado el papá",
      "info del acudiente en normi",
    ],
    pasos: [
      { narracion: "Entramos a Registro en Normi.", accion: "navegar", ruta: "/registro-normi" },
      {
        narracion: "Ve a la pestaña 'Acudientes'.",
        accion: "click",
        ancla: "varios.registro_tab",
        campo: "pestana",
      },
      {
        narracion: "Ubica al estudiante (búscalo por nombre si hace falta).",
        accion: "escribir",
        ancla: "varios.registro_buscar",
        campo: "estudiante",
        opcional: true,
      },
      {
        narracion: "Toca 'Ver info' junto al estado del acudiente.",
        accion: "click",
        ancla: "varios.registro_ver_info",
      },
      {
        narracion: "Se abre el pop-up con el nombre y teléfono del acudiente. Cierra al terminar.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "varios.registro_normi_exportar_excel",
    titulo: "Descargar el registro en Normi en Excel",
    descripcion:
      "Exportar a Excel la lista (estudiantes o acudientes) tal como está filtrada, con el estado de registro.",
    categoria: "Varios",
    roles: ["profesor", "rector", "coordinador", "admin"],
    ruta: "/registro-normi",
    sinonimos: [
      "descargar el registro en excel",
      "exportar quiénes están registrados",
      "sacar a excel el estado de registro",
    ],
    pasos: [
      { narracion: "Entramos a Registro en Normi.", accion: "navegar", ruta: "/registro-normi" },
      {
        narracion: "Elige la pestaña y los filtros que quieres exportar.",
        accion: "click",
        ancla: "varios.registro_tab",
        campo: "pestana",
      },
      {
        narracion: "Toca 'Descargar Excel'. El archivo se descarga con los filtros aplicados.",
        accion: "click",
        ancla: "varios.registro_exportar",
      },
    ],
  },

  // ────────────────────────  USO DE NORMI  ────────────────────────
  {
    id: "varios.uso_normi_ver",
    titulo: "Ver el uso de Normi por profesores y salones",
    descripcion:
      "Revisar cuántas interacciones (notas, actividades y comunicados) ha tenido cada profesor y cada salón con la plataforma.",
    categoria: "Varios",
    roles: [...STAFF_DASHBOARD],
    ruta: "/uso-normi",
    sinonimos: [
      "uso de normi",
      "qué profesores usan más la plataforma",
      "cuántas notas y comunicados por profesor",
      "actividad de los profesores en normi",
      "uso por salón",
    ],
    pasos: [
      { narracion: "Entramos a Uso de Normi.", accion: "navegar", ruta: "/uso-normi" },
      {
        narracion:
          "Cambia entre 'Profesores' y 'Salones' para ver el ranking de interacciones de cada uno.",
        accion: "click",
        ancla: "varios.uso_tab",
        campo: "pestana",
      },
      {
        narracion:
          "Cada barra separa notas (azul), actividades (verde) y comunicados (morado). Listo.",
        accion: "explicar",
      },
    ],
  },

  // ──────────────────────  CALENDARIO ESCOLAR  ──────────────────────
  {
    id: "varios.calendario_escolar_ver",
    titulo: "Ver el calendario escolar",
    descripcion:
      "Consultar los periodos, días sin clases, eventos y festivos del colegio (solo lectura; la edición vive en Configurar Institución).",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/calendario-escolar",
    sinonimos: [
      "ver el calendario escolar",
      "cuándo son los periodos",
      "días sin clases",
      "festivos del colegio",
      "eventos del calendario",
    ],
    pasos: [
      { narracion: "Abrimos el calendario escolar.", accion: "navegar", ruta: "/calendario-escolar" },
      {
        narracion:
          "Ahí ves los periodos, los días sin clases, los eventos y los festivos. Es solo de consulta.",
        accion: "explicar",
      },
    ],
  },

  // ────────────────────  MANUAL DE CONVIVENCIA  ────────────────────
  {
    id: "varios.manual_convivencia_ver",
    titulo: "Abrir el Manual de Convivencia",
    descripcion:
      "Ver el Manual de Convivencia del colegio (PDF si está cargado, o el manual en texto).",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/manual-convivencia",
    endpoint: "GET /api/colegio/config (manual_url por colegio)",
    sinonimos: [
      "abrir el manual de convivencia",
      "ver el manual del colegio",
      "reglamento de convivencia",
    ],
    pasos: [
      { narracion: "Abrimos el Manual de Convivencia.", accion: "navegar", ruta: "/manual-convivencia" },
      {
        narracion: "Ahí puedes leer el manual completo de tu colegio.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "varios.manual_convivencia_buscar",
    titulo: "Buscar dentro del Manual de Convivencia",
    descripcion:
      "Buscar una palabra o frase en el manual y saltar entre los resultados resaltados (disponible en la versión en texto del manual).",
    categoria: "Varios",
    roles: [...TODOS_INTERNOS],
    ruta: "/manual-convivencia",
    sinonimos: [
      "buscar en el manual",
      "encontrar algo en el manual de convivencia",
      "qué dice el manual sobre",
    ],
    pasos: [
      { narracion: "Abrimos el Manual de Convivencia.", accion: "navegar", ruta: "/manual-convivencia" },
      {
        narracion: "Escribe la palabra o frase en el buscador del manual.",
        accion: "escribir",
        ancla: "varios.manual_buscar",
        campo: "texto_busqueda",
      },
      {
        narracion:
          "Usa las flechas de arriba y abajo para saltar entre los resultados resaltados. Listo.",
        accion: "click",
        ancla: "varios.manual_resultado_siguiente",
      },
    ],
  },

  // ──────────────  BANDEJAS DE ADMINISTRACIÓN  ──────────────
  {
    id: "varios.sugerencias_ver",
    titulo: "Ver el Buzón de Sugerencias",
    descripcion:
      "Leer las sugerencias que enviaron los usuarios, con buscador y detalle completo de cada una.",
    categoria: "Varios",
    roles: ["admin"],
    ruta: "/admin/sugerencias",
    endpoint: "Supabase Sugerencias select (gate UI: solo Administrador)",
    sinonimos: [
      "ver las sugerencias",
      "buzón de sugerencias",
      "qué sugerencias han mandado",
      "leer sugerencias de los usuarios",
    ],
    pasos: [
      { narracion: "Entramos al Buzón de Sugerencias.", accion: "navegar", ruta: "/admin/sugerencias" },
      {
        narracion: "Busca por nombre, rol o mensaje si quieres filtrar.",
        accion: "escribir",
        ancla: "varios.sugerencias_buscar",
        campo: "texto_busqueda",
        opcional: true,
      },
      {
        narracion: "Toca una fila para leer la sugerencia completa y el contacto de quien la envió.",
        accion: "click",
        ancla: "varios.sugerencias_fila",
      },
    ],
  },
  {
    id: "varios.sugerencias_eliminar",
    titulo: "Eliminar una sugerencia",
    descripcion: "Borrar una sugerencia del buzón.",
    categoria: "Varios",
    roles: ["admin"],
    ruta: "/admin/sugerencias",
    endpoint: "Supabase Sugerencias delete (gate UI: solo Administrador)",
    sinonimos: ["eliminar una sugerencia", "borrar sugerencia", "quitar una sugerencia del buzón"],
    pasos: [
      { narracion: "Entramos al Buzón de Sugerencias.", accion: "navegar", ruta: "/admin/sugerencias" },
      {
        narracion: "En la fila de la sugerencia, toca el ícono de papelera.",
        accion: "click",
        ancla: "varios.sugerencias_eliminar",
      },
      {
        narracion: "Confirma la eliminación en el pop-up.",
        accion: "click",
        ancla: "varios.sugerencias_confirmar_eliminar",
      },
    ],
  },
  {
    id: "varios.correcciones_registro_ver",
    titulo: "Ver las solicitudes de corrección de registro",
    descripcion:
      "Revisar las solicitudes de acudientes/estudiantes que reportan que no están registrados, tienen el perfil equivocado o les faltan hijos.",
    categoria: "Varios",
    roles: [...ADMIN_RECTOR_COORD],
    ruta: "/admin/correcciones-registro",
    endpoint: "GET /api/registro/admin/solicitudes (SuperAdmin, Administrador, Rector, Coordinador)",
    sinonimos: [
      "solicitudes de registro",
      "correcciones de registro",
      "quién pidió corregir su registro",
      "reportes de perfil equivocado",
      "faltan hijos en un acudiente",
    ],
    pasos: [
      {
        narracion: "Entramos a las correcciones de registro.",
        accion: "navegar",
        ruta: "/admin/correcciones-registro",
      },
      {
        narracion:
          "Cada tarjeta muestra la persona, el tipo de solicitud y el detalle (perfil actual, el que pide, o los estudiantes involucrados).",
        accion: "explicar",
      },
    ],
  },
  {
    id: "varios.correcciones_registro_estado",
    titulo: "Marcar una solicitud de registro como solucionada",
    descripcion:
      "Cambiar el estado de una solicitud de corrección de registro entre pendiente y solucionado.",
    categoria: "Varios",
    roles: [...ADMIN_RECTOR_COORD],
    ruta: "/admin/correcciones-registro",
    endpoint:
      "PATCH /api/registro/admin/solicitudes/:id/estado (SuperAdmin, Administrador, Rector, Coordinador)",
    sinonimos: [
      "marcar solicitud como solucionada",
      "cerrar una solicitud de registro",
      "poner pendiente una corrección de registro",
    ],
    pasos: [
      {
        narracion: "Entramos a las correcciones de registro.",
        accion: "navegar",
        ruta: "/admin/correcciones-registro",
      },
      {
        narracion:
          "En la tarjeta de la solicitud, toca 'Solucionado' (o 'Pendiente') para fijar su estado.",
        accion: "click",
        ancla: "varios.correcciones_boton_estado",
        campo: "estado",
      },
    ],
  },
  {
    id: "varios.dudas_personal_ver",
    titulo: "Ver las dudas del personal",
    descripcion:
      "Revisar las preguntas que el personal interno ha enviado a través de Normi, con su cargo y el texto de la duda.",
    categoria: "Varios",
    roles: [...ADMIN_RECTOR_COORD],
    ruta: "/admin/dudas",
    endpoint: "GET /api/dudas/admin/dudas (SuperAdmin, Administrador, Rector, Coordinador)",
    sinonimos: [
      "dudas del personal",
      "qué preguntas ha hecho el personal",
      "ver las dudas de los profesores",
      "preguntas del staff",
    ],
    pasos: [
      { narracion: "Entramos a las dudas del personal.", accion: "navegar", ruta: "/admin/dudas" },
      {
        narracion: "Cada tarjeta muestra quién preguntó, su cargo y el texto de la duda.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "varios.dudas_personal_estado",
    titulo: "Marcar una duda del personal como resuelta",
    descripcion: "Cambiar el estado de una duda del personal entre pendiente y resuelto.",
    categoria: "Varios",
    roles: [...ADMIN_RECTOR_COORD],
    ruta: "/admin/dudas",
    endpoint: "PATCH /api/dudas/admin/dudas/:id/estado (SuperAdmin, Administrador, Rector, Coordinador)",
    sinonimos: [
      "marcar duda como resuelta",
      "cerrar una duda del personal",
      "poner pendiente una duda",
    ],
    pasos: [
      { narracion: "Entramos a las dudas del personal.", accion: "navegar", ruta: "/admin/dudas" },
      {
        narracion: "En la tarjeta de la duda, toca 'Resuelto' (o 'Pendiente') para fijar su estado.",
        accion: "click",
        ancla: "varios.dudas_boton_estado",
        campo: "estado",
      },
    ],
  },
];
