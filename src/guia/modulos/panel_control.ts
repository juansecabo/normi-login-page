// Catálogo "Normi te guía" — Módulo PANEL DE CONTROL (gestión de personas).
//
// Ruta: /panel-control (componente src/pages/rector/PanelControl.tsx). Es el
// centro de administración de personas del colegio. Acceso a la ruta directa lo
// gobierna puedeAccederDashboard() en useSession.ts: Rector, Coordinador(a),
// Administrador, Administrativo(a), Secretaria General, Orientador(a) Escolar y
// Portero. OJO: un Profesor(a) NO entra por la ruta directa (el useEffect lo
// manda a /dashboard); el profesor director de grupo llega a ESTE mismo
// componente en modo embebido desde Configurar Institución → Personas
// (PersonasColegioEditor monta <PanelControl embedded soloGrupo=... />), y solo
// ve los estudiantes/acudientes de SU grado+salón.
//
// Fuente de verdad de escritura = dbProxy (POST /api/db) sobre las tablas
// Usuarios (nombres/apellidos/teléfono/contraseña, global cross-colegio),
// Estudiantes y Acudientes (membresías por colegio). El guard de CRUD de
// Estudiantes/Acudientes es [admin, rector, secretaria, coordinador,
// administrativo, profesor], EXCEPTO Acudientes.delete que es solo
// admin/rector/coordinador. Orientador(a) y Portero pueden ABRIR el panel pero
// el proxy rechaza sus escrituras sobre Estudiantes/Acudientes; el Profesor(a)
// escribe solo desde la vista embebida de Configurar Institución (director de
// grupo), así que en ESTE módulo (que guía por /panel-control) no se lista.
//
// El componente TAMBIÉN contiene, como código muerto, el CRUD de Funcionarios
// (Internos) y de Asignaciones (openIntDialog/openAsigDialog + sus diálogos),
// pero NO se renderiza ninguna pestaña, tabla ni disparador para ellos: la
// TabsList solo tiene "Estudiantes" y "Acudientes". Esa administración vive hoy
// en Configurar Institución. Por eso este módulo NO expone capacidades de
// funcionarios/asignaciones (ver "elementos_no_cubiertos" del reporte).

import type { Capacidad } from "../tipos";

// Quién puede ABRIR el panel y consultar (puedeAccederDashboard, sin profesor
// directo — el profesor consulta su grupo desde la vista embebida).
const VER_PANEL = [
  "admin",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
] as const;

// Quién puede CREAR/EDITAR/BORRAR estudiantes y acudientes POR ESTA RUTA.
// Sin profesor: /panel-control lo expulsa (puedeAccederDashboard) y su camino
// real es Configurar Institución → Personas (módulo configurar_institucion).
// Sin orientador ni portero (el proxy rechaza sus escrituras).
const CRUD_PERSONAS = [
  "admin",
  "rector",
  "secretaria",
  "coordinador",
  "administrativo",
] as const;

// Cambiar la identificación (cédula) de un acudiente NO lo puede hacer el
// profesor director de grupo (el campo queda de solo lectura para él); sí los
// demás roles del panel.
const CAMBIA_CEDULA_ACUDIENTE = [
  "admin",
  "rector",
  "secretaria",
  "coordinador",
  "administrativo",
] as const;

// Pasos compartidos para llegar a la pestaña Estudiantes.
const abrirTabEstudiantes = () =>
  [
    {
      narracion: "Entramos al Panel de Control.",
      accion: "navegar" as const,
      ruta: "/panel-control",
    },
    {
      narracion: "La pestaña Estudiantes se abre por defecto. Si estabas en otra, tócala.",
      accion: "click" as const,
      ancla: "panel_control.tab_estudiantes",
      opcional: true,
    },
  ];

// Pasos compartidos para llegar a la pestaña Acudientes.
const abrirTabAcudientes = () =>
  [
    {
      narracion: "Entramos al Panel de Control.",
      accion: "navegar" as const,
      ruta: "/panel-control",
    },
    {
      narracion: "Abre la pestaña Acudientes.",
      accion: "click" as const,
      ancla: "panel_control.tab_acudientes",
    },
  ];

export const PANEL_CONTROL: Capacidad[] = [
  // ═══════════════════════════ ESTUDIANTES ═══════════════════════════
  {
    id: "panel_control.buscar_estudiante",
    titulo: "Buscar o filtrar estudiantes",
    descripcion:
      "Consultar la lista de estudiantes del colegio y filtrar por grado, salón o foto, o buscar por nombre, id o teléfono.",
    categoria: "Panel de Control",
    roles: [...VER_PANEL],
    ruta: "/panel-control",
    endpoint: "POST /api/db (Estudiantes + Usuarios select)",
    sinonimos: [
      "buscar un estudiante",
      "ver la lista de estudiantes",
      "encontrar a un alumno",
      "filtrar estudiantes por grado o salón",
      "ver el teléfono o la contraseña de un estudiante",
      "consultar los estudiantes de un salón",
    ],
    pasos: [
      ...abrirTabEstudiantes(),
      {
        narracion: "Escribe el nombre, el id o el teléfono del estudiante en el buscador.",
        accion: "escribir",
        ancla: "panel_control.buscar_est",
        campo: "busqueda",
      },
      {
        narracion: "Si quieres, acota por grado con el filtro de grado.",
        accion: "seleccionar",
        ancla: "panel_control.filtro_grado_est",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Y por salón (los salones se ajustan al grado elegido).",
        accion: "seleccionar",
        ancla: "panel_control.filtro_salon_est",
        campo: "salon",
        opcional: true,
      },
      {
        narracion:
          "Si quieres, usa el filtro de foto (el selector que dice Todos, junto al de salón) para ver solo los que tienen foto o los que no.",
        accion: "seleccionar",
        ancla: "panel_control.filtro_foto_est",
        campo: "foto",
        opcional: true,
      },
      {
        narracion:
          "La tabla muestra id, apellidos, nombres, grado, salón, teléfono y contraseña de cada estudiante. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "panel_control.agregar_estudiante",
    titulo: "Agregar un estudiante",
    descripcion:
      "Registrar un estudiante nuevo en el colegio con su cédula/id, nombres, apellidos, grado y salón.",
    categoria: "Panel de Control",
    roles: [...CRUD_PERSONAS],
    ruta: "/panel-control",
    endpoint: "POST /api/db (Usuarios upsert + Estudiantes insert — admin, rector, secretaria, coordinador, administrativo, profesor)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado al que entra el estudiante." },
      { entidad: "salon", descripcion: "Salón dentro del grado." },
    ],
    sinonimos: [
      "agregar un estudiante",
      "matricular un alumno",
      "registrar un estudiante nuevo",
      "crear un estudiante",
      "meter un alumno al sistema",
    ],
    pasos: [
      ...abrirTabEstudiantes(),
      {
        narracion: "Toca el botón Agregar.",
        accion: "click",
        ancla: "panel_control.boton_agregar_est",
      },
      {
        narracion:
          "Escribe la cédula o id del estudiante. Si ya existe en el sistema, nombres, apellidos y teléfono se autocompletan.",
        accion: "escribir",
        ancla: "panel_control.est_cedula",
        campo: "cedula",
      },
      {
        narracion: "Escribe los apellidos.",
        accion: "escribir",
        ancla: "panel_control.est_apellidos",
        campo: "apellidos",
      },
      {
        narracion: "Escribe los nombres.",
        accion: "escribir",
        ancla: "panel_control.est_nombres",
        campo: "nombres",
      },
      {
        narracion: "Si tienes el teléfono, escríbelo (es opcional).",
        accion: "escribir",
        ancla: "panel_control.est_telefono",
        campo: "telefono",
        opcional: true,
      },
      {
        narracion: "Elige el grado.",
        accion: "seleccionar",
        ancla: "panel_control.est_grado",
        campo: "grado",
      },
      {
        narracion: "Elige el salón.",
        accion: "seleccionar",
        ancla: "panel_control.est_salon",
        campo: "salon",
      },
      {
        narracion:
          "Guarda. El estudiante queda con contraseña vacía y entra con su propio id.",
        accion: "click",
        ancla: "panel_control.est_guardar",
      },
    ],
  },
  {
    id: "panel_control.editar_estudiante",
    titulo: "Editar los datos de un estudiante",
    descripcion:
      "Cambiar nombres, apellidos, teléfono, grado o salón de un estudiante ya registrado.",
    categoria: "Panel de Control",
    roles: [...CRUD_PERSONAS],
    ruta: "/panel-control",
    endpoint: "POST /api/db (Usuarios update + Estudiantes update)",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante a editar." }],
    sinonimos: [
      "editar un estudiante",
      "cambiar el grado o salón de un alumno",
      "corregir el nombre de un estudiante",
      "actualizar el teléfono de un estudiante",
      "mover un estudiante de salón",
    ],
    pasos: [
      ...abrirTabEstudiantes(),
      {
        narracion: "Busca al estudiante por nombre o id.",
        accion: "escribir",
        ancla: "panel_control.buscar_est",
        campo: "busqueda",
      },
      {
        narracion: "En su fila, toca el lápiz para editar.",
        accion: "click",
        ancla: "panel_control.fila_editar_est",
      },
      {
        narracion: "Ajusta lo que necesites (apellidos, nombres, teléfono, grado o salón).",
        accion: "escribir",
        ancla: "panel_control.est_apellidos",
        campo: "apellidos",
        opcional: true,
      },
      {
        narracion: "Guarda los cambios.",
        accion: "click",
        ancla: "panel_control.est_guardar",
      },
    ],
  },
  {
    id: "panel_control.cambiar_cedula_estudiante",
    titulo: "Corregir la cédula o id de un estudiante",
    descripcion:
      "Cambiar la identificación de un estudiante; la migra en todo el sistema (notas, asistencia, vínculos, comunicados).",
    categoria: "Panel de Control",
    roles: [...CRUD_PERSONAS],
    ruta: "/panel-control",
    endpoint: "apiClient.auth.cambiarCedula (admin) / POST /api/institucion/corregir-id-estudiante (demás roles)",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante cuya identificación se corrige." }],
    sinonimos: [
      "corregir la cédula de un estudiante",
      "cambiar el id de un alumno",
      "arreglar el número de identificación de un estudiante",
    ],
    pasos: [
      ...abrirTabEstudiantes(),
      {
        narracion: "Busca al estudiante por nombre o id.",
        accion: "escribir",
        ancla: "panel_control.buscar_est",
        campo: "busqueda",
      },
      {
        narracion: "En su fila, toca el lápiz para abrir su edición.",
        accion: "click",
        ancla: "panel_control.fila_editar_est",
      },
      {
        narracion:
          "La cédula está bloqueada por seguridad. Toca el lápiz que está junto al campo de cédula para habilitarla.",
        accion: "click",
        ancla: "panel_control.est_cedula_editar",
      },
      {
        narracion: "Escribe la identificación correcta.",
        accion: "escribir",
        ancla: "panel_control.est_cedula",
        campo: "cedula",
      },
      {
        narracion:
          "Guarda. El sistema migra la identificación en todas las tablas (notas, asistencia, vínculos). Listo.",
        accion: "click",
        ancla: "panel_control.est_guardar",
      },
    ],
  },
  {
    id: "panel_control.eliminar_estudiante",
    titulo: "Eliminar un estudiante",
    descripcion:
      "Borrar la membresía de un estudiante del colegio. Advertencia: se eliminan TODAS sus notas.",
    categoria: "Panel de Control",
    roles: [...CRUD_PERSONAS],
    ruta: "/panel-control",
    endpoint: "POST /api/db (Estudiantes delete)",
    requisitos: [{ entidad: "estudiante", descripcion: "Estudiante a eliminar." }],
    sinonimos: [
      "eliminar un estudiante",
      "borrar un alumno",
      "quitar un estudiante del colegio",
      "dar de baja a un estudiante",
    ],
    pasos: [
      ...abrirTabEstudiantes(),
      {
        narracion: "Busca al estudiante por nombre o id.",
        accion: "escribir",
        ancla: "panel_control.buscar_est",
        campo: "busqueda",
      },
      {
        narracion: "En su fila, toca el bote de basura.",
        accion: "click",
        ancla: "panel_control.fila_eliminar_est",
      },
      {
        narracion:
          "Confirma la eliminación. Ten en cuenta que se borran TODAS las notas de ese estudiante.",
        accion: "click",
        ancla: "panel_control.est_confirmar_eliminar",
      },
    ],
  },
  {
    id: "panel_control.ver_foto_estudiante",
    titulo: "Ver la foto de un estudiante o acudiente en grande",
    descripcion:
      "Abrir en tamaño real la foto de perfil de una persona desde la tabla.",
    categoria: "Panel de Control",
    roles: [...VER_PANEL],
    ruta: "/panel-control",
    sinonimos: [
      "ver la foto de un estudiante",
      "ampliar la foto de perfil",
      "abrir la foto de un alumno en grande",
    ],
    pasos: [
      ...abrirTabEstudiantes(),
      {
        narracion: "Busca a la persona por nombre o id.",
        accion: "escribir",
        ancla: "panel_control.buscar_est",
        campo: "busqueda",
      },
      {
        narracion:
          "Toca su foto en la primera columna para verla en grande (solo si la persona tiene foto; para un acudiente, hazlo desde la pestaña Acudientes).",
        accion: "click",
        ancla: "panel_control.foto_est",
      },
      {
        narracion: "La foto se abre en tamaño real en un pop up. Ciérralo cuando termines.",
        accion: "explicar",
      },
    ],
  },

  // ═══════════════════════════ ACUDIENTES ═══════════════════════════
  {
    id: "panel_control.buscar_acudiente",
    titulo: "Buscar o filtrar acudientes",
    descripcion:
      "Consultar la lista de acudientes (padres de familia) y filtrar por grado o salón del acudido, o buscar por nombre, id o teléfono.",
    categoria: "Panel de Control",
    roles: [...VER_PANEL],
    ruta: "/panel-control",
    endpoint: "POST /api/db (Acudientes + Usuarios + Estudiantes select)",
    sinonimos: [
      "buscar un acudiente",
      "ver la lista de acudientes",
      "encontrar a un padre de familia",
      "ver el teléfono o la contraseña de un acudiente",
      "filtrar acudientes por el grado del hijo",
      "qué estudiantes tiene a cargo un acudiente",
    ],
    pasos: [
      ...abrirTabAcudientes(),
      {
        narracion: "Escribe el nombre, el id o el teléfono del acudiente en el buscador.",
        accion: "escribir",
        ancla: "panel_control.buscar_perf",
        campo: "busqueda",
      },
      {
        narracion: "Si quieres, filtra por el grado del acudido.",
        accion: "seleccionar",
        ancla: "panel_control.filtro_grado_perf",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Y por el salón del acudido.",
        accion: "seleccionar",
        ancla: "panel_control.filtro_salon_perf",
        campo: "salon",
        opcional: true,
      },
      {
        narracion:
          "La tabla muestra id, apellidos, nombres, el grado/salón de cada acudido, teléfono y contraseña. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "panel_control.agregar_acudiente",
    titulo: "Agregar un acudiente",
    descripcion:
      "Registrar un acudiente nuevo con su cédula, nombres, apellidos y vincularle uno o varios estudiantes a cargo (hasta 4).",
    categoria: "Panel de Control",
    roles: [...CRUD_PERSONAS],
    ruta: "/panel-control",
    endpoint: "POST /api/db (Usuarios upsert + Acudientes upsert — admin, rector, secretaria, coordinador, administrativo, profesor)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Al menos un estudiante (acudido) ya registrado en el colegio." },
    ],
    sinonimos: [
      "agregar un acudiente",
      "registrar un padre de familia",
      "crear un acudiente",
      "vincular un padre a un estudiante",
      "meter un acudiente nuevo",
    ],
    pasos: [
      ...abrirTabAcudientes(),
      {
        narracion: "Toca el botón Agregar.",
        accion: "click",
        ancla: "panel_control.boton_agregar_perf",
      },
      {
        narracion:
          "Escribe la cédula del acudiente. Si ya existe, nombres, apellidos y teléfono se autocompletan.",
        accion: "escribir",
        ancla: "panel_control.perf_cedula",
        campo: "cedula",
      },
      {
        narracion: "Escribe los apellidos.",
        accion: "escribir",
        ancla: "panel_control.perf_apellidos",
        campo: "apellidos",
      },
      {
        narracion: "Escribe los nombres.",
        accion: "escribir",
        ancla: "panel_control.perf_nombres",
        campo: "nombres",
      },
      {
        narracion: "Si tienes el teléfono, escríbelo (es opcional).",
        accion: "escribir",
        ancla: "panel_control.perf_telefono",
        campo: "telefono",
        opcional: true,
      },
      {
        narracion:
          "En Acudido 1, escribe el id del estudiante a cargo. Su nombre, grado y salón se autocompletan si es un estudiante de este colegio.",
        accion: "escribir",
        ancla: "panel_control.perf_acudido_id",
        campo: "id_estudiante",
      },
      {
        narracion:
          "Si tiene más estudiantes a cargo, toca 'Agregar acudido' y repite (hasta 4).",
        accion: "click",
        ancla: "panel_control.perf_agregar_acudido",
        opcional: true,
      },
      {
        narracion:
          "Guarda. El acudiente queda con contraseña vacía y entra con su propia cédula.",
        accion: "click",
        ancla: "panel_control.perf_guardar",
      },
    ],
  },
  {
    id: "panel_control.editar_acudiente",
    titulo: "Editar los datos de un acudiente",
    descripcion:
      "Cambiar nombres, apellidos o teléfono de un acudiente registrado. El profesor director de grupo no puede tocar estos datos personales, solo los vínculos.",
    categoria: "Panel de Control",
    roles: [...CAMBIA_CEDULA_ACUDIENTE],
    ruta: "/panel-control",
    endpoint: "POST /api/db (Usuarios update)",
    requisitos: [{ entidad: "acudiente", descripcion: "Acudiente a editar." }],
    sinonimos: [
      "editar un acudiente",
      "corregir el nombre de un padre de familia",
      "actualizar el teléfono de un acudiente",
      "cambiar los datos de un acudiente",
    ],
    pasos: [
      ...abrirTabAcudientes(),
      {
        narracion: "Busca al acudiente por nombre o id.",
        accion: "escribir",
        ancla: "panel_control.buscar_perf",
        campo: "busqueda",
      },
      {
        narracion: "En su fila, toca el lápiz para editar.",
        accion: "click",
        ancla: "panel_control.fila_editar_perf",
      },
      {
        narracion: "Ajusta apellidos, nombres o teléfono.",
        accion: "escribir",
        ancla: "panel_control.perf_apellidos",
        campo: "apellidos",
        opcional: true,
      },
      {
        narracion: "Guarda los cambios.",
        accion: "click",
        ancla: "panel_control.perf_guardar",
      },
    ],
  },
  {
    id: "panel_control.vincular_acudido",
    titulo: "Vincular un estudiante a un acudiente",
    descripcion:
      "Agregar (o cambiar) los estudiantes a cargo de un acudiente ya registrado, hasta 4. Un estudiante admite máximo 3 acudientes.",
    categoria: "Panel de Control",
    roles: [...CRUD_PERSONAS],
    ruta: "/panel-control",
    endpoint: "POST /api/db (Acudientes upsert)",
    requisitos: [
      { entidad: "acudiente", descripcion: "Acudiente al que se le vincula el estudiante." },
      { entidad: "estudiante", descripcion: "Estudiante (acudido) a vincular." },
    ],
    sinonimos: [
      "vincular un hijo a un acudiente",
      "agregar un acudido a un padre",
      "asociar un estudiante a su acudiente",
      "ponerle otro hijo a un acudiente",
      "quitar un acudido de un acudiente",
    ],
    pasos: [
      ...abrirTabAcudientes(),
      {
        narracion: "Busca al acudiente por nombre o id.",
        accion: "escribir",
        ancla: "panel_control.buscar_perf",
        campo: "busqueda",
      },
      {
        narracion: "En su fila, toca el lápiz para abrir su edición.",
        accion: "click",
        ancla: "panel_control.fila_editar_perf",
      },
      {
        narracion: "Toca 'Agregar acudido' para abrir un nuevo espacio de estudiante.",
        accion: "click",
        ancla: "panel_control.perf_agregar_acudido",
      },
      {
        narracion:
          "Escribe el id del estudiante. Se valida que sea un estudiante de este colegio (y de tu grupo, si eres director de grupo).",
        accion: "escribir",
        ancla: "panel_control.perf_acudido_id",
        campo: "id_estudiante",
      },
      {
        narracion: "Guarda. Listo, el estudiante queda a cargo de ese acudiente.",
        accion: "click",
        ancla: "panel_control.perf_guardar",
      },
    ],
  },
  {
    id: "panel_control.cambiar_cedula_acudiente",
    titulo: "Corregir la cédula de un acudiente",
    descripcion:
      "Cambiar la identificación de un acudiente; la migra en todo el sistema (vínculos, comunicados). El profesor director de grupo no puede hacerlo.",
    categoria: "Panel de Control",
    roles: [...CAMBIA_CEDULA_ACUDIENTE],
    ruta: "/panel-control",
    endpoint: "apiClient.auth.cambiarCedula (admin) / POST /api/institucion/corregir-id (demás roles)",
    requisitos: [{ entidad: "acudiente", descripcion: "Acudiente cuya identificación se corrige." }],
    sinonimos: [
      "corregir la cédula de un acudiente",
      "cambiar el id de un padre de familia",
      "arreglar la identificación de un acudiente",
    ],
    pasos: [
      ...abrirTabAcudientes(),
      {
        narracion: "Busca al acudiente por nombre o id.",
        accion: "escribir",
        ancla: "panel_control.buscar_perf",
        campo: "busqueda",
      },
      {
        narracion: "En su fila, toca el lápiz para abrir su edición.",
        accion: "click",
        ancla: "panel_control.fila_editar_perf",
      },
      {
        narracion:
          "La cédula está bloqueada. Toca el lápiz que está junto al campo de cédula para habilitarla.",
        accion: "click",
        ancla: "panel_control.perf_cedula_editar",
      },
      {
        narracion: "Escribe la identificación correcta.",
        accion: "escribir",
        ancla: "panel_control.perf_cedula",
        campo: "cedula",
      },
      {
        narracion: "Guarda. El sistema migra la identificación en todas las tablas. Listo.",
        accion: "click",
        ancla: "panel_control.perf_guardar",
      },
    ],
  },
  {
    id: "panel_control.eliminar_acudiente",
    titulo: "Eliminar un acudiente",
    descripcion:
      "Borrar la membresía de un acudiente del colegio. Después de eso no podrá iniciar sesión (si no es persona en otro colegio).",
    categoria: "Panel de Control",
    roles: ["admin", "rector", "coordinador"],
    ruta: "/panel-control",
    endpoint: "POST /api/db (Acudientes delete) + apiClient.auth.cleanupUsuarioOrphan",
    requisitos: [{ entidad: "acudiente", descripcion: "Acudiente a eliminar." }],
    sinonimos: [
      "eliminar un acudiente",
      "borrar un padre de familia",
      "quitar un acudiente del colegio",
      "dar de baja a un acudiente",
    ],
    pasos: [
      ...abrirTabAcudientes(),
      {
        narracion: "Busca al acudiente por nombre o id.",
        accion: "escribir",
        ancla: "panel_control.buscar_perf",
        campo: "busqueda",
      },
      {
        narracion: "En su fila, toca el bote de basura.",
        accion: "click",
        ancla: "panel_control.fila_eliminar_perf",
      },
      {
        narracion: "Confirma la eliminación.",
        accion: "click",
        ancla: "panel_control.perf_confirmar_eliminar",
      },
    ],
  },
];
