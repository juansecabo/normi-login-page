// Catálogo "Normi te guía" — Módulo COMUNICADOS.
//
// Cubre las cuatro caras del módulo:
//  1. Enviar Comunicado normal (/enviar-comunicado) — pestañas Enviar, Masivo,
//     Historial. Guard del server POST /api/comunicados/enviar y
//     /api/comunicados/enviar-masivo = [admin, rector, coordinador, secretaria,
//     administrativo, orientador, profesor, portero]. El admin, sin embargo, es
//     enrutado por su dashboard a la variante "como Normi" (ver abajo), así que
//     las capacidades del envío normal viven en los 7 roles no-admin.
//  2. Enviar Comunicado como Normi (/enviar-comunicado-admin) — SOLO [admin]:
//     misma interfaz pero el remitente queda anónimo (como_normi=true). Gate de
//     UI: useEffect con isAdmin() → navigate("/dashboard").
//  3. Comunicados con firma (/comunicados-firma) — emisores = [admin, rector,
//     coordinador, secretaria, administrativo, orientador, profesor] (SIN
//     portero, no está en CARGOS_EMISORES). Firmar = los internos que pueden
//     SER destinatarios de un comunicado con firma (el portero NO: no existe
//     perfil destinatario para su cargo, y su dashboard tampoco tiene la
//     tarjeta de Comunicados y Firma; el admin tampoco recibe).
//  4. Recibir comunicados/documentos — el profesor usa /profesor/comunicados y
//     /profesor/documentos (filtra por sus asignaciones de aula); el resto del
//     personal usa /comunicados-recibidos y /documentos-recibidos (filtra por el
//     perfil de su cargo). El admin no recibe (envía como Normi).
//
// Los envíos terminan como filas en la tabla Comunicados (una por destinatario,
// agrupadas por grupo_comunicado_id) y salen por WhatsApp con la WABA del
// colegio. El límite duro es 1024 caracteres del body de la plantilla de
// WhatsApp (contador CharCircle).

import type { Capacidad } from "../tipos";

// Emisores del envío normal (el admin va por la variante "como Normi").
const EMISORES_NORMAL = [
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "profesor",
  "portero",
] as const;

// Emisores de comunicados con firma (SIN portero — no está en CARGOS_EMISORES).
const EMISORES_FIRMA = [
  "admin",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "profesor",
] as const;

// Internos que pueden recibir un comunicado con firma y firmarlo (sin portero,
// que nunca es destinatario ni tiene la tarjeta; sin admin, que nunca recibe).
const TODOS_INTERNOS = [
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "profesor",
] as const;

// Personal (no profesor, no admin) que recibe por el perfil de su cargo.
const STAFF_RECIBE = [
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "portero",
] as const;

// Pasos compartidos para elegir destinatarios en el formulario de envío. Sirven
// tanto para el envío normal, el "como Normi" y el de firma (interfaz idéntica).
// La ruta se pasa por parámetro porque cambia entre las tres páginas.
const abrirFormularioEnvio = (ruta: string) =>
  [
    {
      narracion: "Entramos a la página para enviar el comunicado.",
      accion: "navegar" as const,
      ruta,
    },
    {
      narracion: "Abre el desplegable de Perfiles.",
      accion: "click" as const,
      ancla: "comunicados.selector_perfiles",
    },
    {
      narracion:
        "Marca los perfiles que van a recibir (Estudiantes, Acudientes, Profesores, Coordinadores, Rector, y demás), o usa la opción Todos.",
      accion: "seleccionar" as const,
      ancla: "comunicados.perfil_checkbox",
      campo: "perfiles",
    },
    {
      narracion:
        "Si marcaste Estudiantes, Acudientes o Profesores, aparece el filtro por aula. Elige el nivel.",
      accion: "seleccionar" as const,
      ancla: "comunicados.filtro_nivel",
      campo: "nivel",
      opcional: true,
    },
    {
      narracion: "Luego el grado (dentro de los niveles que marcaste).",
      accion: "seleccionar" as const,
      ancla: "comunicados.filtro_grado",
      campo: "grado",
      opcional: true,
    },
    {
      narracion: "Y el salón, si quieres afinar más.",
      accion: "seleccionar" as const,
      ancla: "comunicados.filtro_salon",
      campo: "salon",
      opcional: true,
    },
    {
      narracion:
        "Si quieres mandarlo solo a personas puntuales, abre 'Estudiantes específicos' o 'Profesores específicos' y márcalas (vacío = todos los que coinciden con los filtros).",
      accion: "seleccionar" as const,
      ancla: "comunicados.destinatarios_especificos",
      campo: "destinatarios",
      opcional: true,
    },
  ];

export const COMUNICADOS: Capacidad[] = [
  {
    id: "comunicados.enviar",
    titulo: "Enviar un comunicado",
    descripcion:
      "Mandar un mensaje (con archivos opcionales) por WhatsApp a los perfiles y aulas que elijas dentro del colegio.",
    categoria: "Comunicados",
    roles: [...EMISORES_NORMAL],
    ruta: "/enviar-comunicado",
    endpoint:
      "POST /api/comunicados/enviar (admin, rector, coordinador, secretaria, administrativo, orientador, profesor, portero)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado(s) destinatario, si filtras por aula." },
      { entidad: "salon", descripcion: "Salón(es), si afinas por salón." },
    ],
    sinonimos: [
      "enviar un comunicado",
      "mandar un mensaje a los padres",
      "avisarle a un salón por whatsapp",
      "enviar una circular",
      "comunicarle algo a los profesores",
      "mandar un aviso a todo el colegio",
    ],
    pasos: [
      ...abrirFormularioEnvio("/enviar-comunicado"),
      {
        narracion: "Escribe el mensaje del comunicado en el editor.",
        accion: "escribir",
        ancla: "comunicados.editor_mensaje",
        campo: "mensaje",
      },
      {
        narracion:
          "Si vas a mandar un archivo (PDF, imagen, Word), toca 'Adjuntar archivos' y elígelo. Máximo 20 MB por archivo.",
        accion: "click",
        ancla: "comunicados.boton_adjuntar",
        campo: "archivo",
        opcional: true,
      },
      {
        narracion:
          "Revisa el contador de caracteres (el círculo): el total no puede pasar de 1024 caracteres de WhatsApp.",
        accion: "explicar",
      },
      {
        narracion: "Toca 'Enviar comunicado'.",
        accion: "click",
        ancla: "comunicados.boton_enviar",
      },
      {
        narracion:
          "Se abre la confirmación con remitente, destinatarios y mensaje. Confirma con 'Enviar'.",
        accion: "click",
        ancla: "comunicados.confirmar_enviar",
      },
    ],
  },
  {
    id: "comunicados.limpiar_formulario",
    titulo: "Limpiar el formulario de envío",
    descripcion:
      "Borrar de un golpe todos los destinatarios, el mensaje y los archivos para empezar de cero.",
    categoria: "Comunicados",
    roles: [...EMISORES_NORMAL],
    ruta: "/enviar-comunicado",
    sinonimos: [
      "limpiar el comunicado",
      "borrar todo y empezar de nuevo",
      "reiniciar el formulario",
      "quitar los destinatarios que marqué",
    ],
    pasos: [
      {
        narracion: "Entramos a Enviar Comunicado.",
        accion: "navegar",
        ruta: "/enviar-comunicado",
      },
      {
        narracion: "Toca el botón 'Limpiar' arriba a la derecha del formulario.",
        accion: "click",
        ancla: "comunicados.boton_limpiar",
      },
      {
        narracion:
          "Se vacían perfiles, filtros, mensaje y archivos. El remitente se conserva (viene de tu sesión). Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "comunicados.enviar_masivo",
    titulo: "Enviar un comunicado masivo personalizado",
    descripcion:
      "Pegar una tabla de Excel y mandar un mensaje distinto a cada estudiante usando columnas como plantilla (por ejemplo usuario y contraseña).",
    categoria: "Comunicados",
    roles: [...EMISORES_NORMAL],
    ruta: "/enviar-comunicado",
    endpoint:
      "POST /api/comunicados/enviar-masivo (admin, rector, coordinador, secretaria, administrativo, orientador, profesor, portero)",
    requisitos: [
      {
        entidad: "estudiante",
        descripcion:
          "La primera columna de la tabla debe ser el id (cédula) del estudiante; el server cruza con Usuarios para el teléfono.",
      },
    ],
    sinonimos: [
      "envío masivo personalizado",
      "mandar mensajes distintos a cada estudiante",
      "enviar usuarios y contraseñas por whatsapp",
      "comunicado con datos de excel",
      "mensaje personalizado a varios",
    ],
    pasos: [
      {
        narracion: "Entramos a Enviar Comunicado.",
        accion: "navegar",
        ruta: "/enviar-comunicado",
      },
      {
        narracion: "Abre la pestaña 'Masivo'.",
        accion: "click",
        ancla: "comunicados.tab_masivo",
      },
      {
        narracion:
          "Copia las columnas desde Excel y pégalas en el cuadro. La primera fila son los encabezados y la primera columna el id del estudiante.",
        accion: "escribir",
        ancla: "comunicados.masivo_datos",
        campo: "datos_excel",
      },
      {
        narracion:
          "Escribe la plantilla del mensaje usando los nombres de columna entre llaves, por ejemplo {usuario}. Puedes tocar los botones de columna para insertarlos.",
        accion: "escribir",
        ancla: "comunicados.masivo_plantilla",
        campo: "plantilla",
      },
      {
        narracion:
          "Mira la vista previa con el primer estudiante para verificar que quedó bien.",
        accion: "explicar",
      },
      {
        narracion: "Verifica las filas detectadas y la vista previa, y toca el botón verde que dice Enviar con el número de mensajes.",
        accion: "click",
        ancla: "comunicados.masivo_enviar",
      },
      {
        narracion: "Confirma el envío masivo en el diálogo.",
        accion: "click",
        ancla: "comunicados.masivo_confirmar",
      },
    ],
  },
  {
    id: "comunicados.ver_historial",
    titulo: "Ver el historial de comunicados enviados",
    descripcion:
      "Revisar los comunicados que has enviado, buscarlos, abrirlos completos y ver o descargar sus archivos.",
    categoria: "Comunicados",
    roles: [...EMISORES_NORMAL],
    ruta: "/enviar-comunicado",
    endpoint: "supabase Comunicados select (RLS tenant; rector ve todos, el resto los suyos)",
    sinonimos: [
      "ver los comunicados que envié",
      "historial de comunicados",
      "revisar un comunicado que mandé",
      "buscar un comunicado enviado",
      "descargar el archivo de un comunicado",
    ],
    pasos: [
      {
        narracion: "Entramos a Enviar Comunicado.",
        accion: "navegar",
        ruta: "/enviar-comunicado",
      },
      {
        narracion: "Abre la pestaña 'Historial'.",
        accion: "click",
        ancla: "comunicados.tab_historial",
      },
      {
        narracion:
          "Si buscas uno en concreto, escribe en el buscador por destinatario o mensaje.",
        accion: "escribir",
        ancla: "comunicados.historial_busqueda",
        campo: "busqueda",
        opcional: true,
      },
      {
        narracion: "Toca la tarjeta del comunicado para verlo completo.",
        accion: "click",
        ancla: "comunicados.historial_item",
      },
      {
        narracion:
          "Si trae archivo, usa 'Ver' para abrirlo o 'Descargar' para bajarlo. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "comunicados.eliminar_enviado",
    titulo: "Eliminar un comunicado del historial",
    descripcion:
      "Borrar permanentemente un comunicado que enviaste (solo puedes borrar los tuyos).",
    categoria: "Comunicados",
    roles: [...EMISORES_NORMAL],
    ruta: "/enviar-comunicado",
    endpoint: "supabase Comunicados delete (RLS tenant)",
    sinonimos: [
      "eliminar un comunicado enviado",
      "borrar un comunicado del historial",
      "quitar un comunicado que mandé",
    ],
    pasos: [
      {
        narracion: "Entramos a Enviar Comunicado.",
        accion: "navegar",
        ruta: "/enviar-comunicado",
      },
      {
        narracion: "Abre la pestaña 'Historial'.",
        accion: "click",
        ancla: "comunicados.tab_historial",
      },
      {
        narracion: "Ubica el comunicado y toca el ícono de la papelera en su tarjeta.",
        accion: "click",
        ancla: "comunicados.historial_eliminar",
      },
      {
        narracion: "Confirma la eliminación en el diálogo.",
        accion: "click",
        ancla: "comunicados.confirmar_eliminar_enviado",
      },
    ],
  },
  {
    id: "comunicados.enviar_como_normi",
    titulo: "Enviar un comunicado como Normi (anónimo)",
    descripcion:
      "Enviar un comunicado que llega firmado por la agente Normi, sin mostrar tu nombre como remitente. Exclusivo del administrador.",
    categoria: "Comunicados",
    roles: ["admin"],
    ruta: "/enviar-comunicado-admin",
    endpoint: "POST /api/comunicados/enviar con como_normi=true (solo admin; gate UI isAdmin())",
    sinonimos: [
      "enviar un comunicado como normi",
      "mandar un mensaje anónimo",
      "comunicado sin mi nombre",
      "que llegue de parte de normi",
    ],
    pasos: [
      ...abrirFormularioEnvio("/enviar-comunicado-admin"),
      {
        narracion: "Escribe el mensaje. Recuerda que llegará como Normi, sin tu nombre.",
        accion: "escribir",
        ancla: "comunicados.editor_mensaje",
        campo: "mensaje",
      },
      {
        narracion: "Adjunta archivos si hace falta (máximo 20 MB por archivo).",
        accion: "click",
        ancla: "comunicados.boton_adjuntar",
        campo: "archivo",
        opcional: true,
      },
      {
        narracion: "Toca 'Enviar comunicado'.",
        accion: "click",
        ancla: "comunicados.boton_enviar",
      },
      {
        narracion: "Confirma en el diálogo con 'Enviar'.",
        accion: "click",
        ancla: "comunicados.confirmar_enviar",
      },
    ],
  },
  {
    id: "comunicados.enviar_masivo_como_normi",
    titulo: "Enviar un masivo personalizado como Normi",
    descripcion:
      "Envío masivo con mensaje distinto por estudiante que llega firmado por Normi (anónimo). Exclusivo del administrador.",
    categoria: "Comunicados",
    roles: ["admin"],
    ruta: "/enviar-comunicado-admin",
    endpoint: "POST /api/comunicados/enviar-masivo con como_normi=true (solo admin)",
    requisitos: [
      {
        entidad: "estudiante",
        descripcion: "La primera columna de la tabla es el id (cédula) del estudiante.",
      },
    ],
    sinonimos: [
      "masivo como normi",
      "mensajes personalizados anónimos",
      "enviar usuarios y contraseñas como normi",
    ],
    pasos: [
      {
        narracion: "Entramos a Enviar Comunicado (Administrador).",
        accion: "navegar",
        ruta: "/enviar-comunicado-admin",
      },
      {
        narracion: "Abre la pestaña 'Masivo'.",
        accion: "click",
        ancla: "comunicados.tab_masivo",
      },
      {
        narracion: "Pega la tabla de Excel (encabezados en la primera fila, id en la primera columna).",
        accion: "escribir",
        ancla: "comunicados.masivo_datos",
        campo: "datos_excel",
      },
      {
        narracion: "Escribe la plantilla con las columnas entre llaves, por ejemplo {usuario}.",
        accion: "escribir",
        ancla: "comunicados.masivo_plantilla",
        campo: "plantilla",
      },
      {
        narracion: "Revisa el resumen y toca el botón verde que dice Enviar con el número de mensajes para confirmar.",
        accion: "click",
        ancla: "comunicados.masivo_enviar",
      },
      {
        narracion: "Confirma el envío masivo en el diálogo.",
        accion: "click",
        ancla: "comunicados.masivo_confirmar",
      },
    ],
  },
  {
    id: "comunicados.enviar_firma",
    titulo: "Enviar un comunicado con firma",
    descripcion:
      "Enviar un comunicado que cada persona debe firmar (con el dedo) para dejar constancia de que lo leyó.",
    categoria: "Comunicados",
    roles: [...EMISORES_FIRMA],
    ruta: "/comunicados-firma",
    endpoint:
      "POST /api/comunicados-firma/enviar (admin, rector, coordinador, secretaria, administrativo, orientador, profesor; SIN portero)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado(s) destinatario, si filtras por aula." },
      { entidad: "salon", descripcion: "Salón(es), si afinas por salón." },
    ],
    sinonimos: [
      "comunicado con firma",
      "mandar algo para que firmen",
      "solicitar firma de recibido",
      "que confirmen que lo leyeron",
      "circular con acuse de recibido",
    ],
    pasos: [
      {
        narracion: "Entramos a Comunicados con firma.",
        accion: "navegar",
        ruta: "/comunicados-firma",
      },
      {
        narracion: "Quédate en la pestaña 'Enviar'.",
        accion: "click",
        ancla: "comunicados.firma_tab_enviar",
      },
      {
        narracion: "Abre el desplegable de Perfiles y marca quiénes deben firmar.",
        accion: "seleccionar",
        ancla: "comunicados.selector_perfiles",
        campo: "perfiles",
      },
      {
        narracion:
          "Si aplica, afina por nivel, grado, salón o personas específicas con los filtros que aparecen.",
        accion: "seleccionar",
        ancla: "comunicados.filtro_grado",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Escribe el mensaje en el editor.",
        accion: "escribir",
        ancla: "comunicados.editor_mensaje",
        campo: "mensaje",
      },
      {
        narracion: "Adjunta archivos si hace falta (máximo 20 MB por archivo).",
        accion: "click",
        ancla: "comunicados.boton_adjuntar",
        campo: "archivo",
        opcional: true,
      },
      {
        narracion: "Toca 'Enviar y solicitar firma'.",
        accion: "click",
        ancla: "comunicados.firma_boton_enviar",
      },
      {
        narracion: "Confirma en el diálogo (recuerda que cada persona deberá firmar).",
        accion: "click",
        ancla: "comunicados.confirmar_enviar",
      },
    ],
  },
  {
    id: "comunicados.firma_seguimiento",
    titulo: "Ver quién firmó un comunicado",
    descripcion:
      "Revisar el seguimiento de firmas de un comunicado enviado: quiénes firmaron (con su firma) y quiénes faltan.",
    categoria: "Comunicados",
    roles: [...EMISORES_FIRMA],
    ruta: "/comunicados-firma",
    endpoint: "GET /api/comunicados-firma/enviados y /api/comunicados-firma/:id/respuestas",
    sinonimos: [
      "ver quién firmó",
      "seguimiento de firmas",
      "quién falta por firmar",
      "revisar las firmas de un comunicado",
      "ver los firmados y pendientes",
    ],
    pasos: [
      {
        narracion: "Entramos a Comunicados con firma.",
        accion: "navegar",
        ruta: "/comunicados-firma",
      },
      {
        narracion: "Abre la pestaña 'Enviados'.",
        accion: "click",
        ancla: "comunicados.firma_tab_enviados",
      },
      {
        narracion:
          "Cada tarjeta muestra el conteo (por ejemplo 12/20 firmadas). Toca el comunicado que quieras revisar.",
        accion: "click",
        ancla: "comunicados.firma_item_enviado",
      },
      {
        narracion:
          "Se abre el seguimiento con dos listas: 'Firmada' (con la imagen de cada firma) y 'No firmada'. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "comunicados.firma_reenviar",
    titulo: "Reenviar a los que faltan por firmar",
    descripcion:
      "Volver a mandar el comunicado con firma solo a las personas que todavía no lo han firmado.",
    categoria: "Comunicados",
    roles: [...EMISORES_FIRMA],
    ruta: "/comunicados-firma",
    endpoint: "POST /api/comunicados-firma/reenviar/:id",
    sinonimos: [
      "reenviar a los que faltan",
      "recordar la firma a los pendientes",
      "volver a mandar a los que no han firmado",
    ],
    pasos: [
      {
        narracion: "Entramos a Comunicados con firma.",
        accion: "navegar",
        ruta: "/comunicados-firma",
      },
      {
        narracion: "Abre la pestaña 'Enviados'.",
        accion: "click",
        ancla: "comunicados.firma_tab_enviados",
      },
      {
        narracion: "Toca el comunicado que quieras reenviar.",
        accion: "click",
        ancla: "comunicados.firma_item_enviado",
      },
      {
        narracion: "En el seguimiento, toca 'Reenviar a los que faltan'.",
        accion: "click",
        ancla: "comunicados.firma_reenviar",
      },
      {
        narracion:
          "Se reenvía solo a quienes tienen teléfono y no han firmado. Si todos firmaron, no reenvía nada. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "comunicados.firma_eliminar",
    titulo: "Eliminar un comunicado con firma",
    descripcion:
      "Borrar un comunicado con firma y todo su registro de firmas (no se puede deshacer).",
    categoria: "Comunicados",
    roles: [...EMISORES_FIRMA],
    ruta: "/comunicados-firma",
    endpoint: "DELETE /api/comunicados-firma/:id",
    sinonimos: [
      "eliminar un comunicado con firma",
      "borrar el registro de firmas",
      "quitar un comunicado de firma",
    ],
    pasos: [
      {
        narracion: "Entramos a Comunicados con firma.",
        accion: "navegar",
        ruta: "/comunicados-firma",
      },
      {
        narracion: "Abre la pestaña 'Enviados'.",
        accion: "click",
        ancla: "comunicados.firma_tab_enviados",
      },
      {
        narracion: "Toca el ícono de la papelera en la tarjeta del comunicado.",
        accion: "click",
        ancla: "comunicados.firma_eliminar",
      },
      {
        narracion: "Confirma la eliminación en el diálogo.",
        accion: "click",
        ancla: "comunicados.firma_confirmar_eliminar",
      },
    ],
  },
  {
    id: "comunicados.firmar",
    titulo: "Firmar un comunicado (dejar constancia de leído)",
    descripcion:
      "Abrir un comunicado que te enviaron con firma, leerlo y firmarlo con el dedo para confirmar que lo leíste.",
    categoria: "Comunicados",
    roles: [...TODOS_INTERNOS],
    ruta: "/comunicados-firma",
    endpoint: "GET /api/comunicados-firma/mios y POST /api/comunicados-firma/firmar (cualquiera)",
    sinonimos: [
      "firmar un comunicado",
      "dejar constancia de que lo leí",
      "firmar con el dedo",
      "confirmar que recibí el comunicado",
      "tengo algo por firmar",
    ],
    pasos: [
      {
        narracion: "Entramos a Comunicados con firma.",
        accion: "navegar",
        ruta: "/comunicados-firma",
      },
      {
        narracion:
          "Abre la pestaña 'Por firmar' (si no eres emisor, la lista aparece directo al entrar).",
        accion: "click",
        ancla: "comunicados.firma_tab_porfirmar",
        opcional: true,
      },
      {
        narracion: "Toca el comunicado pendiente para abrirlo y leerlo.",
        accion: "click",
        ancla: "comunicados.firma_item_porfirmar",
      },
      {
        narracion: "Dibuja tu firma con el dedo en el recuadro blanco.",
        accion: "escribir",
        ancla: "comunicados.firma_canvas",
        campo: "firma",
      },
      {
        narracion:
          "Cuando la firma esté lista, toca 'Firmar' (si quieres corregirla antes, usa el botón Borrar y vuelve a dibujarla). Una vez firmada queda bloqueada. Listo.",
        accion: "click",
        ancla: "comunicados.firma_boton_firmar",
      },
    ],
  },
  {
    id: "comunicados.ver_recibidos_profesor",
    titulo: "Ver comunicados recibidos (profesor)",
    descripcion:
      "Revisar los comunicados dirigidos a los profesores que aplican a las aulas que el profesor tiene asignadas.",
    categoria: "Comunicados",
    roles: ["profesor"],
    ruta: "/profesor/comunicados",
    endpoint: "supabase Comunicados select (RLS tenant; overlaps perfil Profesores + filtro por asignaciones)",
    sinonimos: [
      "ver mis comunicados",
      "comunicados que me llegaron",
      "revisar los comunicados recibidos",
      "qué me han comunicado",
    ],
    pasos: [
      {
        narracion: "Entramos a tus comunicados recibidos.",
        accion: "navegar",
        ruta: "/profesor/comunicados",
      },
      {
        narracion: "Usa el buscador por remitente o contenido si buscas uno en concreto.",
        accion: "escribir",
        ancla: "comunicados.recibidos_busqueda",
        campo: "busqueda",
        opcional: true,
      },
      {
        narracion: "Toca la tarjeta del comunicado para verlo completo.",
        accion: "click",
        ancla: "comunicados.recibidos_item",
      },
      {
        narracion: "Si trae archivo, usa los botones Ver o Descargar. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "comunicados.ver_documentos_profesor",
    titulo: "Ver documentos recibidos (profesor)",
    descripcion:
      "Revisar solo los comunicados con archivo adjunto dirigidos al profesor, según sus aulas asignadas.",
    categoria: "Comunicados",
    roles: ["profesor"],
    ruta: "/profesor/documentos",
    endpoint: "supabase Comunicados select con archivo_url no nulo (RLS tenant; overlaps perfil Profesores)",
    sinonimos: [
      "ver documentos recibidos",
      "archivos que me mandaron",
      "documentos del colegio",
      "descargar un documento recibido",
    ],
    pasos: [
      {
        narracion: "Entramos a tus documentos recibidos.",
        accion: "navegar",
        ruta: "/profesor/documentos",
      },
      {
        narracion: "Busca por remitente o contenido si necesitas.",
        accion: "escribir",
        ancla: "comunicados.recibidos_busqueda",
        campo: "busqueda",
        opcional: true,
      },
      {
        narracion: "Toca la tarjeta y usa los botones Ver o Descargar para abrir el archivo. Listo.",
        accion: "click",
        ancla: "comunicados.recibidos_item",
      },
    ],
  },
  {
    id: "comunicados.ver_recibidos",
    titulo: "Ver comunicados recibidos (personal)",
    descripcion:
      "Revisar los comunicados dirigidos al perfil de tu cargo (rector, coordinador, administrativo, secretaria, orientador o portero).",
    categoria: "Comunicados",
    roles: [...STAFF_RECIBE],
    ruta: "/comunicados-recibidos",
    endpoint: "supabase Comunicados select (RLS tenant; overlaps perfil según el cargo)",
    sinonimos: [
      "ver mis comunicados",
      "comunicados que me llegaron",
      "revisar los comunicados recibidos",
      "qué me han comunicado",
    ],
    pasos: [
      {
        narracion: "Entramos a tus comunicados recibidos.",
        accion: "navegar",
        ruta: "/comunicados-recibidos",
      },
      {
        narracion: "Usa el buscador por remitente o contenido si buscas uno en concreto.",
        accion: "escribir",
        ancla: "comunicados.recibidos_busqueda",
        campo: "busqueda",
        opcional: true,
      },
      {
        narracion: "Toca la tarjeta del comunicado para verlo completo.",
        accion: "click",
        ancla: "comunicados.recibidos_item",
      },
      {
        narracion: "Si trae archivo, usa los botones Ver o Descargar. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "comunicados.ver_documentos",
    titulo: "Ver documentos recibidos (personal)",
    descripcion:
      "Revisar solo los comunicados con archivo adjunto dirigidos al perfil de tu cargo.",
    categoria: "Comunicados",
    roles: [...STAFF_RECIBE],
    ruta: "/documentos-recibidos",
    endpoint: "supabase Comunicados select con archivo_url no nulo (RLS tenant; overlaps perfil según el cargo)",
    sinonimos: [
      "ver documentos recibidos",
      "archivos que me mandaron",
      "documentos del colegio",
      "descargar un documento recibido",
    ],
    pasos: [
      {
        narracion: "Entramos a tus documentos recibidos.",
        accion: "navegar",
        ruta: "/documentos-recibidos",
      },
      {
        narracion: "Busca por remitente o contenido si necesitas.",
        accion: "escribir",
        ancla: "comunicados.recibidos_busqueda",
        campo: "busqueda",
        opcional: true,
      },
      {
        narracion: "Toca la tarjeta y usa los botones Ver o Descargar para abrir el archivo. Listo.",
        accion: "click",
        ancla: "comunicados.recibidos_item",
      },
    ],
  },
];
