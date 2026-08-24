// Catálogo "Normi te guía" — Módulo PERMISOS Y EXCUSAS (gestión del staff).
//
// Este módulo cubre SOLO las vistas de STAFF (revisión/consulta):
//   Hub: src/pages/PermisosExcusas.tsx  → ruta /permisos-excusas
//   Retiro:       src/pages/permisos/RetiroEstudiantesStaff.tsx        → /permisos-excusas/retiro-staff
//   Inasistencia: src/pages/permisos/JustificacionInasistenciaStaff.tsx → /permisos-excusas/inasistencia-staff
//   Uniforme:     src/pages/permisos/JustificacionUniformeStaff.tsx    → /permisos-excusas/uniforme-staff
//
// La creación de estos permisos/excusas la hacen el acudiente o el interno desde
// las versiones NO-staff (Retiro/Justificacion*.tsx sin sufijo Staff) y NO se
// cubre aquí. La solicitud de entrevista va en OTRO módulo.
//
// IMPORTANTE: estas vistas de staff son de SOLO CONSULTA. No existe acción de
// "aprobar" ni "rechazar": el staff revisa, filtra, ve el detalle, ve/descarga
// adjuntos y puede imprimir a Word. Todo lo demás es lectura.
//
// Guard de acceso (gate de la UI): isProfesor() || puedeAccederDashboard() ||
// isAdmin(). puedeAccederDashboard() cubre Rector, Coordinador(a),
// Administrador, Administrativo(a), Secretaria General, Orientador(a) Escolar y
// Portero. Sumando profesor y admin da ALL_INTERNOS. No hay endpoint propio: las
// tres tablas se leen por supabase directo con RLS tenant_isolation.
//
// Filtro de VISIBILIDAD (no de acceso): un coordinador solo ve estudiantes de
// su(s) nivel(es) (useNivelesCoordina) y un profesor solo los de las aulas donde
// dicta (useAulasProfesor). Rector/admin/secretaria/etc. ven todo el colegio.

import type { Capacidad } from "../tipos";

// Internos con la ficha "Permisos y Excusas" en su dashboard. El portero puede
// entrar por URL directa, pero su dashboard (FICHAS_PORTERO) no tiene la ficha,
// asi que la guia no puede llevarlo: queda fuera.
const ALL_INTERNOS = [
  "profesor",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "admin",
] as const;

// Pasos compartidos para abrir la lista de staff de un tipo concreto desde el hub.
// tipo: "retiro" | "inasistencia" | "uniforme"
const abrirLista = (
  tipo: "retiro" | "inasistencia" | "uniforme",
  nombre: string,
) =>
  [
    {
      narracion: "Vamos a Permisos y Excusas.",
      accion: "navegar" as const,
      ruta: "/permisos-excusas",
    },
    {
      narracion: `Elige la ficha de '${nombre}'.`,
      accion: "click" as const,
      ancla: `permisos_excusas.card_${tipo}`,
    },
    {
      narracion:
        "Esperamos a que cargue la lista. Verás las tarjetas agrupadas por día, con el calendario a un lado.",
      accion: "esperar" as const,
      ancla: `permisos_excusas.lista_${tipo}`,
    },
  ];

export const PERMISOS_EXCUSAS: Capacidad[] = [
  {
    id: "permisos_excusas.abrir_hub",
    titulo: "Abrir Permisos y Excusas",
    descripcion:
      "Entrar al módulo de Permisos y Excusas, desde donde se elige entre Retiro, Inasistencia y Uniforme.",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas",
    sinonimos: [
      "abrir permisos y excusas",
      "ir a permisos y excusas",
      "dónde veo los permisos",
      "entrar a excusas",
      "ver las solicitudes de permiso",
    ],
    pasos: [
      {
        narracion:
          "Abrimos el módulo de Permisos y Excusas. Desde aquí eliges entre Retiro de Estudiantes, Justificación por Inasistencia y Justificación por Uniforme. El número rojo en cada ficha son los registros nuevos que aún no has visto.",
        accion: "navegar",
        ruta: "/permisos-excusas",
      },
    ],
  },
  {
    id: "permisos_excusas.consultar_retiro",
    titulo: "Consultar autorizaciones de retiro",
    descripcion:
      "Abrir la lista de autorizaciones de retiro de estudiantes que enviaron los acudientes.",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas/retiro-staff",
    endpoint: "supabase select Autorizaciones_Retiro (RLS tenant_isolation)",
    sinonimos: [
      "ver las autorizaciones de retiro",
      "quién pidió retirar a su hijo",
      "permisos de salida de estudiantes",
      "consultar retiros del día",
      "autorizaciones de retiro",
    ],
    pasos: [
      ...abrirLista("retiro", "Retiro de Estudiantes"),
      {
        narracion:
          "Ya ves la lista. La vista arranca en el día de hoy: cada tarjeta muestra el estudiante, su grado y salón, la fecha del retiro y cuándo se creó. Toca una tarjeta para ver todo el detalle.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "permisos_excusas.consultar_inasistencia",
    titulo: "Consultar justificaciones por inasistencia",
    descripcion:
      "Abrir la lista de justificaciones por inasistencia que enviaron los acudientes.",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas/inasistencia-staff",
    endpoint:
      "supabase select Justificaciones_Inasistencia (RLS tenant_isolation)",
    sinonimos: [
      "ver las justificaciones de inasistencia",
      "excusas por falta",
      "quién justificó una ausencia",
      "consultar inasistencias justificadas",
      "excusas médicas de los estudiantes",
    ],
    pasos: [
      ...abrirLista("inasistencia", "Justificación por Inasistencia"),
      {
        narracion:
          "Ya ves la lista. Cada tarjeta muestra el estudiante, su grado y salón, las fechas de la ausencia (y cuántos días) y cuándo se creó. Toca una tarjeta para ver el motivo, la descripción y los adjuntos.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "permisos_excusas.consultar_uniforme",
    titulo: "Consultar justificaciones por uniforme",
    descripcion:
      "Abrir la lista de justificaciones por uniforme que enviaron los acudientes.",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas/uniforme-staff",
    endpoint: "supabase select Justificaciones_Uniforme (RLS tenant_isolation)",
    sinonimos: [
      "ver las justificaciones de uniforme",
      "excusas por el uniforme",
      "por qué un estudiante no trajo el uniforme",
      "consultar justificaciones de uniforme",
      "permisos de uniforme",
    ],
    pasos: [
      ...abrirLista("uniforme", "Justificación por Uniforme"),
      {
        narracion:
          "Ya ves la lista. Cada tarjeta muestra el estudiante, su grado y salón, la fecha y cuándo se creó. Toca una tarjeta para leer la justificación completa. (Estas justificaciones no llevan archivos adjuntos.)",
        accion: "explicar",
      },
    ],
  },
  {
    id: "permisos_excusas.ver_detalle",
    titulo: "Ver el detalle completo de un permiso o excusa",
    descripcion:
      "Expandir una tarjeta para leer todo el formato: datos del acudiente, motivo, firma y adjuntos.",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas/retiro-staff",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante cuyo registro se abre." },
    ],
    sinonimos: [
      "ver el detalle de una excusa",
      "abrir el permiso completo",
      "leer toda la justificación",
      "expandir la tarjeta",
      "ver la firma del acudiente",
    ],
    pasos: [
      {
        narracion: "Vamos a Permisos y Excusas.",
        accion: "navegar",
        ruta: "/permisos-excusas",
      },
      {
        narracion:
          "Toca la ficha de la lista que quieres revisar: 'Retiro de Estudiantes', Justificación por Inasistencia o por Uniforme.",
        accion: "click",
        ancla: "permisos_excusas.card_retiro",
      },
      {
        narracion:
          "Ubica la tarjeta del estudiante y tócala para desplegarla.",
        accion: "click",
        ancla: "permisos_excusas.tarjeta_expandir",
        campo: "estudiante",
      },
      {
        narracion:
          "Se abre el formato completo: el texto de la autorización o justificación, los datos del acudiente (cédula y teléfono), la firma digital y, si los hay, los archivos adjuntos. Vuelve a tocar el encabezado para cerrarla.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "permisos_excusas.buscar",
    titulo: "Buscar un estudiante en la lista",
    descripcion:
      "Filtrar la lista escribiendo el nombre o el número de identificación del estudiante.",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas/retiro-staff",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante que se busca." },
    ],
    sinonimos: [
      "buscar un estudiante en las excusas",
      "filtrar por nombre",
      "buscar por cédula o documento",
      "encontrar la excusa de un estudiante",
    ],
    pasos: [
      {
        narracion: "Vamos a Permisos y Excusas.",
        accion: "navegar",
        ruta: "/permisos-excusas",
      },
      {
        narracion:
          "Toca la ficha de la lista que quieres revisar: 'Retiro de Estudiantes', Justificación por Inasistencia o por Uniforme.",
        accion: "click",
        ancla: "permisos_excusas.card_retiro",
      },
      {
        narracion:
          "Escribe el nombre del estudiante en el buscador (en Inasistencia y Uniforme también sirve su identificación). Ignora tildes y mayúsculas. Con la X borras la búsqueda.",
        accion: "escribir",
        ancla: "permisos_excusas.buscar_input",
        campo: "estudiante",
      },
      {
        narracion: "La lista y el calendario se ajustan solos a lo que buscaste.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "permisos_excusas.filtrar_grado_salon",
    titulo: "Filtrar por grado y salón",
    descripcion:
      "Acotar la lista a un grado y, dentro de él, a un salón concreto.",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas/retiro-staff",
    requisitos: [
      { entidad: "grado", descripcion: "Grado por el que se filtra." },
      { entidad: "salon", descripcion: "Salón (opcional, dentro del grado)." },
    ],
    sinonimos: [
      "filtrar por grado",
      "ver solo un salón",
      "excusas de un curso específico",
      "filtrar por grado y salón",
    ],
    pasos: [
      {
        narracion: "Vamos a Permisos y Excusas.",
        accion: "navegar",
        ruta: "/permisos-excusas",
      },
      {
        narracion:
          "Toca la ficha de la lista que quieres revisar: 'Retiro de Estudiantes', Justificación por Inasistencia o por Uniforme.",
        accion: "click",
        ancla: "permisos_excusas.card_retiro",
      },
      {
        narracion: "Elige el grado en el primer desplegable.",
        accion: "seleccionar",
        ancla: "permisos_excusas.filtro_grado",
        campo: "filtro_grado",
      },
      {
        narracion:
          "Si quieres, elige también el salón en el segundo desplegable (las opciones dependen del grado elegido).",
        accion: "seleccionar",
        ancla: "permisos_excusas.filtro_salon",
        campo: "filtro_salon",
        opcional: true,
      },
      {
        narracion:
          "Para volver a ver todo, pon los desplegables en 'Todos los grados' y 'Todos los salones'.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "permisos_excusas.filtrar_dia",
    titulo: "Filtrar por día con el calendario",
    descripcion:
      "Usar el calendario lateral para ver solo lo que llegó un día (filtra por la fecha en que se creó el registro, no por la fecha del retiro o de la ausencia); los días con registros salen en naranja.",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas/retiro-staff",
    requisitos: [
      { entidad: "fecha", descripcion: "Día que se quiere ver." },
    ],
    sinonimos: [
      "ver las excusas de un día",
      "filtrar por fecha",
      "qué permisos llegaron hoy",
      "ver todas las fechas",
      "usar el calendario",
    ],
    pasos: [
      {
        narracion: "Vamos a Permisos y Excusas.",
        accion: "navegar",
        ruta: "/permisos-excusas",
      },
      {
        narracion:
          "Toca la ficha de la lista que quieres revisar: 'Retiro de Estudiantes', Justificación por Inasistencia o por Uniforme.",
        accion: "click",
        ancla: "permisos_excusas.card_retiro",
      },
      {
        narracion:
          "En el calendario de la izquierda toca el día que quieres. Los días en naranja tienen registros (según cuándo llegó cada uno, no la fecha del retiro o de la ausencia). La lista arranca en el día de hoy.",
        accion: "click",
        ancla: "permisos_excusas.calendario_dia",
        campo: "fecha",
      },
      {
        narracion:
          "Para quitar el filtro de fecha y ver todo, toca 'Ver todas' debajo del calendario.",
        accion: "click",
        ancla: "permisos_excusas.calendario_ver_todas",
        opcional: true,
      },
    ],
  },
  {
    id: "permisos_excusas.ver_archivo_adjunto",
    titulo: "Ver un archivo adjunto",
    descripcion:
      "Abrir en el navegador un archivo que el acudiente adjuntó (soporte médico, foto, etc.).",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas/retiro-staff",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante cuyo registro tiene el adjunto." },
    ],
    sinonimos: [
      "ver el soporte adjunto",
      "abrir el archivo de la excusa",
      "ver el certificado médico",
      "ver el adjunto",
    ],
    pasos: [
      {
        narracion: "Vamos a Permisos y Excusas.",
        accion: "navegar",
        ruta: "/permisos-excusas",
      },
      {
        narracion:
          "Toca la ficha de 'Retiro de Estudiantes' o la de Justificación por Inasistencia (las de Uniforme no llevan adjuntos).",
        accion: "click",
        ancla: "permisos_excusas.card_retiro",
      },
      {
        narracion: "Despliega la tarjeta del estudiante.",
        accion: "click",
        ancla: "permisos_excusas.tarjeta_expandir",
        campo: "estudiante",
      },
      {
        narracion:
          "En la sección de archivos adjuntos, toca 'Ver' junto al archivo. Se abre en una pestaña nueva.",
        accion: "click",
        ancla: "permisos_excusas.archivo_ver",
      },
    ],
  },
  {
    id: "permisos_excusas.descargar_archivo_adjunto",
    titulo: "Descargar un archivo adjunto",
    descripcion:
      "Bajar a tu dispositivo un archivo que el acudiente adjuntó al permiso o excusa.",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas/retiro-staff",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante cuyo registro tiene el adjunto." },
    ],
    sinonimos: [
      "descargar el soporte",
      "bajar el archivo de la excusa",
      "guardar el adjunto",
      "descargar el certificado médico",
    ],
    pasos: [
      {
        narracion: "Vamos a Permisos y Excusas.",
        accion: "navegar",
        ruta: "/permisos-excusas",
      },
      {
        narracion:
          "Toca la ficha de 'Retiro de Estudiantes' o la de Justificación por Inasistencia (las de Uniforme no llevan adjuntos).",
        accion: "click",
        ancla: "permisos_excusas.card_retiro",
      },
      {
        narracion: "Despliega la tarjeta del estudiante.",
        accion: "click",
        ancla: "permisos_excusas.tarjeta_expandir",
        campo: "estudiante",
      },
      {
        narracion:
          "En la sección de archivos adjuntos, toca 'Descargar' junto al archivo. Se guarda en tu dispositivo.",
        accion: "click",
        ancla: "permisos_excusas.archivo_descargar",
      },
    ],
  },
  {
    id: "permisos_excusas.descargar_word",
    titulo: "Imprimir o descargar permisos en Word",
    descripcion:
      "Seleccionar uno o varios registros y descargarlos en un documento Word listo para imprimir (con la cantidad de copias por registro).",
    categoria: "Permisos y Excusas",
    roles: [...ALL_INTERNOS],
    ruta: "/permisos-excusas/retiro-staff",
    sinonimos: [
      "imprimir las excusas",
      "descargar los permisos en word",
      "sacar el documento para imprimir",
      "generar el formato en word",
      "imprimir varias autorizaciones",
    ],
    pasos: [
      {
        narracion: "Vamos a Permisos y Excusas.",
        accion: "navegar",
        ruta: "/permisos-excusas",
      },
      {
        narracion:
          "Toca la ficha de la lista que quieres revisar: 'Retiro de Estudiantes', Justificación por Inasistencia o por Uniforme.",
        accion: "click",
        ancla: "permisos_excusas.card_retiro",
      },
      {
        narracion:
          "Activa la casilla 'Imprimir' arriba de la lista (si no ves registros, primero toca un día naranja en el calendario o 'Ver todas'). Aparecerá una casilla de selección en cada tarjeta.",
        accion: "click",
        ancla: "permisos_excusas.imprimir_toggle",
      },
      {
        narracion:
          "En cada tarjeta que quieras imprimir, marca la casilla que le aparece encima.",
        accion: "click",
        ancla: "permisos_excusas.tarjeta_selector",
      },
      {
        narracion:
          "Si necesitas más de una copia de una tarjeta, ajusta la cantidad con los botones + y - que le aparecen al lado (de 1 a 10).",
        accion: "explicar",
      },
      {
        narracion:
          "Toca el botón Descargar de arriba, junto a la casilla Imprimir (muestra cuántas seleccionaste). Se genera un documento Word con los formatos y se baja a tu dispositivo.",
        accion: "click",
        ancla: "permisos_excusas.descargar_word_boton",
      },
    ],
  },
];
