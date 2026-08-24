// Catálogo "Normi te guía" — Módulo COMPORTAMIENTO Y OBSERVADOR.
//
// Cubre dos páginas:
//   - /registros-comportamiento  (RegistrosComportamiento.tsx): registros
//     formales de comportamiento académico/disciplinario, con firma y descarga
//     en Word por plantilla del colegio.
//   - /observador-estudiantil    (ObservadorEstudiantil.tsx): el "cuaderno"
//     de observaciones manuscritas del estudiante, que notifica a acudientes.
//
// GUARDS (lo que MANDA es el backend; se anota cuando la UI difiere):
//
// Registros de Comportamiento:
//   - Acceso a la página (useEffect → navigate): isProfesor || isOrientador ||
//     isAdmin || isRectorOrCoordinador. En roles reales eso es
//     [profesor, rector, coordinador, secretaria, administrativo, orientador,
//     admin]. El PORTERO queda FUERA por la UI (a pesar de que el backend/tabla
//     lo cuenta como interno). Por eso NO ponemos portero en consultar/descargar.
//   - Crear: la UI hace `puedeCrear = isProfesor()`; solo el profesor ve la
//     pestaña "Crear nuevo", y el formulario depende de la Asignación del
//     profesor (sin asignaturas no se puede guardar). Aunque a nivel de tabla el
//     backend permitiría a cualquier interno, en la práctica crear es SOLO
//     profesor. Editar/eliminar: solo el AUTOR del registro (r.autor_id ===
//     sesión), y como solo el profesor crea, el autor siempre es profesor.
//
// Observador Estudiantil:
//   - Acceso por URL: internos (incluye portero) + acudientes; estudiante fuera.
//     PERO el dashboard del portero (FICHAS_PORTERO) NO tiene la tarjeta del
//     Observador, así que la guía no puede llevarlo (y además el endpoint de
//     notificar responde 403 para él). Por eso NO ponemos portero en roles.
//   - Notificar a acudientes (POST /api/observador/notificar) NO incluye portero.
//   - El rol "acudiente" (solo lectura + badge de no leídas) NO es un RolGuia de
//     internos, así que su flujo no se cataloga aquí.

import type { Capacidad } from "../tipos";

// Acceden a Registros de Comportamiento (todos los internos MENOS portero, por la UI).
const ACCEDEN_REGISTROS = [
  "profesor",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "admin",
] as const;

// Crean/editan/eliminan registros: solo el profesor (puedeCrear = isProfesor; autor).
const CREAN_REGISTROS = ["profesor"] as const;

// Observador: internos con tarjeta en su dashboard (portero NO la tiene).
const INTERNOS_OBSERVADOR = [
  "profesor",
  "rector",
  "coordinador",
  "secretaria",
  "administrativo",
  "orientador",
  "admin",
] as const;

// Pasos compartidos: llegar a la lista del historial y elegir un estudiante.
const abrirHistorialRegistros = () =>
  [
    {
      narracion: "Entramos a Registros de Comportamiento.",
      accion: "navegar" as const,
      ruta: "/registros-comportamiento",
    },
    {
      narracion:
        "Si eres profesor, abre la pestaña 'Historial' (los demás cargos ya entran ahí).",
      accion: "click" as const,
      ancla: "comportamiento_observador.reg_tab_historial",
      opcional: true,
    },
    {
      narracion: "Puedes acotar por grado.",
      accion: "seleccionar" as const,
      ancla: "comportamiento_observador.reg_filtro_grado",
      campo: "grado",
      opcional: true,
    },
    {
      narracion: "Y por salón.",
      accion: "seleccionar" as const,
      ancla: "comportamiento_observador.reg_filtro_salon",
      campo: "salon",
      opcional: true,
    },
    {
      narracion: "O escribe el nombre del estudiante para encontrarlo.",
      accion: "escribir" as const,
      ancla: "comportamiento_observador.reg_buscar_hist",
      campo: "estudiante",
      opcional: true,
    },
    {
      narracion: "Toca la tarjeta del estudiante para ver sus registros.",
      accion: "click" as const,
      ancla: "comportamiento_observador.reg_item_estudiante",
      campo: "estudiante",
    },
  ];

// Pasos compartidos: llegar al estudiante en el Observador.
const abrirEstudianteObservador = () =>
  [
    {
      narracion: "Entramos al Observador Estudiantil.",
      accion: "navegar" as const,
      ruta: "/observador-estudiantil",
    },
    {
      narracion: "Puedes filtrar por grado.",
      accion: "seleccionar" as const,
      ancla: "comportamiento_observador.obs_filtro_grado",
      campo: "grado",
      opcional: true,
    },
    {
      narracion: "Y por salón.",
      accion: "seleccionar" as const,
      ancla: "comportamiento_observador.obs_filtro_salon",
      campo: "salon",
      opcional: true,
    },
    {
      narracion: "O busca al estudiante por su nombre.",
      accion: "escribir" as const,
      ancla: "comportamiento_observador.obs_buscar",
      campo: "estudiante",
      opcional: true,
    },
    {
      narracion: "Abre la ficha del estudiante tocando su tarjeta.",
      accion: "click" as const,
      ancla: "comportamiento_observador.obs_item_estudiante",
      campo: "estudiante",
    },
  ];

export const COMPORTAMIENTO_OBSERVADOR: Capacidad[] = [
  // ─────────────────────────── REGISTROS DE COMPORTAMIENTO ───────────────────
  {
    id: "comportamiento_observador.registro_crear",
    titulo: "Crear un registro de comportamiento",
    descripcion:
      "Diligenciar un registro formal (académico y/o de disciplina) de un estudiante, con firma, que al guardarse avisa por WhatsApp al rector, los coordinadores y, si aplica, al director de grupo.",
    categoria: "Comportamiento y Observador",
    roles: [...CREAN_REGISTROS],
    ruta: "/registros-comportamiento",
    endpoint:
      "Supabase insert Registros_Comportamiento + POST /api/comunicados/enviar (as_system, notifica rector/coordinadores/director)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante del registro (de los que el profesor dicta o dirige)." },
      { entidad: "asignatura", descripcion: "Asignatura(s) que el profesor le dicta a ese estudiante." },
      { entidad: "fecha", descripcion: "Fecha del comportamiento." },
    ],
    sinonimos: [
      "crear un registro de comportamiento",
      "hacer un observador disciplinario formal (registro con firma)",
      "registrar un comportamiento de un estudiante",
      "llenar un registro académico y de disciplina",
      "reportar el comportamiento de un alumno",
    ],
    pasos: [
      {
        narracion: "Entramos a Registros de Comportamiento.",
        accion: "navegar",
        ruta: "/registros-comportamiento",
      },
      {
        narracion: "Abre la pestaña 'Crear nuevo' (como profesor, ya entras ahí).",
        accion: "click",
        ancla: "comportamiento_observador.reg_tab_crear",
        opcional: true,
      },
      {
        narracion:
          "Elige el tipo de registro: Académico y de Disciplina, Académico, o Disciplina.",
        accion: "seleccionar",
        ancla: "comportamiento_observador.reg_tipo",
        campo: "tipo",
      },
      {
        narracion: "Si quieres, acota la lista por grado.",
        accion: "seleccionar",
        ancla: "comportamiento_observador.reg_filtro_grado_form",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Y por salón.",
        accion: "seleccionar",
        ancla: "comportamiento_observador.reg_filtro_salon_form",
        campo: "salon",
        opcional: true,
      },
      {
        narracion: "Escribe el nombre del estudiante para filtrarlo.",
        accion: "escribir",
        ancla: "comportamiento_observador.reg_buscar_estudiante",
        campo: "estudiante",
      },
      {
        narracion: "Selecciónalo en la lista que aparece.",
        accion: "click",
        ancla: "comportamiento_observador.reg_resultado_estudiante",
        campo: "estudiante",
      },
      {
        narracion:
          "La edad se llena sola con la fecha de nacimiento; ajústala si hace falta.",
        accion: "escribir",
        ancla: "comportamiento_observador.reg_edad",
        campo: "edad",
        opcional: true,
      },
      {
        narracion: "Abre el calendario para poner la fecha.",
        accion: "click",
        ancla: "comportamiento_observador.reg_fecha",
      },
      {
        narracion: "Elige el día del comportamiento (por defecto viene hoy).",
        accion: "seleccionar",
        ancla: "comportamiento_observador.reg_fecha_calendario",
        campo: "fecha",
        opcional: true,
      },
      {
        narracion:
          "Marca la(s) asignatura(s) del registro (aparecen las que le dictas a ese estudiante). Ya vienen premarcadas.",
        accion: "click",
        ancla: "comportamiento_observador.reg_asignaturas",
        campo: "asignatura",
        opcional: true,
      },
      {
        narracion: "Describe con detalle el comportamiento significativo.",
        accion: "escribir",
        ancla: "comportamiento_observador.reg_comportamiento",
        campo: "comportamiento",
      },
      {
        narracion:
          "Firma en el recuadro blanco con el mouse o el dedo; la firma es obligatoria (esto no lo puedo hacer yo por ti).",
        accion: "explicar",
        ancla: "comportamiento_observador.reg_firma_canvas",
      },
      {
        narracion:
          "Toca 'Crear registro'. Al guardarse se notifica por WhatsApp al rector, los coordinadores y, si aplica, al director de grupo. Listo.",
        accion: "click",
        ancla: "comportamiento_observador.reg_guardar",
      },
    ],
  },
  {
    id: "comportamiento_observador.registro_consultar",
    titulo: "Consultar los registros de comportamiento de un estudiante",
    descripcion:
      "Ver el historial de registros de un estudiante y abrir cada uno para leer el detalle completo. Si eres profesor, ves los registros que tú creaste y los de los estudiantes de tu dirección de grupo.",
    categoria: "Comportamiento y Observador",
    roles: [...ACCEDEN_REGISTROS],
    ruta: "/registros-comportamiento",
    endpoint: "Supabase select Registros_Comportamiento",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante cuyos registros se quieren ver." },
    ],
    sinonimos: [
      "ver los registros de comportamiento",
      "consultar el historial de un estudiante",
      "revisar los registros disciplinarios de un alumno",
      "cuántos registros tiene un estudiante",
      "abrir un registro de comportamiento",
    ],
    pasos: [
      ...abrirHistorialRegistros(),
      {
        narracion: "Toca un registro para desplegarlo y leer su detalle completo.",
        accion: "click",
        ancla: "comportamiento_observador.reg_item_registro",
      },
    ],
  },
  {
    id: "comportamiento_observador.registro_ordenar",
    titulo: "Ordenar los registros de un estudiante",
    descripcion:
      "Cambiar el orden de los registros del estudiante: por fecha (recientes primero), por tipo o por profesor.",
    categoria: "Comportamiento y Observador",
    roles: [...ACCEDEN_REGISTROS],
    ruta: "/registros-comportamiento",
    sinonimos: [
      "ordenar los registros",
      "ordenar por tipo",
      "ordenar por profesor",
      "ordenar los observadores por fecha",
    ],
    pasos: [
      ...abrirHistorialRegistros(),
      {
        narracion:
          "Usa el selector de orden y elige por fecha, por tipo o por profesor.",
        accion: "seleccionar",
        ancla: "comportamiento_observador.reg_ordenar",
        campo: "criterio_orden",
      },
    ],
  },
  {
    id: "comportamiento_observador.registro_descargar_word",
    titulo: "Descargar un registro en Word",
    descripcion:
      "Generar y descargar el documento oficial en Word (.docx) de un registro, usando la plantilla del colegio.",
    categoria: "Comportamiento y Observador",
    roles: [...ACCEDEN_REGISTROS],
    ruta: "/registros-comportamiento",
    endpoint: "Cliente (docxtemplater) con plantilla /plantillas/{colegio_id}/registro_comportamiento_template.docx",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante del registro a descargar." },
    ],
    sinonimos: [
      "descargar el registro en word",
      "bajar el documento del registro",
      "exportar el observador a word",
      "generar el registro en docx",
    ],
    pasos: [
      ...abrirHistorialRegistros(),
      {
        narracion: "Despliega el registro que quieres descargar.",
        accion: "click",
        ancla: "comportamiento_observador.reg_item_registro",
      },
      {
        narracion:
          "Toca 'Descargar Word'. Si el colegio aún no tiene su plantilla configurada, saldrá un aviso para avisarle al administrador. Listo.",
        accion: "click",
        ancla: "comportamiento_observador.reg_descargar_word",
      },
    ],
  },
  {
    id: "comportamiento_observador.registro_editar",
    titulo: "Editar un registro de comportamiento",
    descripcion:
      "Modificar un registro que tú mismo creaste. La edición no vuelve a notificar por WhatsApp.",
    categoria: "Comportamiento y Observador",
    roles: [...CREAN_REGISTROS],
    ruta: "/registros-comportamiento",
    endpoint: "Supabase update Registros_Comportamiento (solo el autor)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante del registro a editar." },
    ],
    sinonimos: [
      "editar un registro de comportamiento",
      "corregir un registro",
      "cambiar el texto de un observador",
      "modificar un registro que hice",
    ],
    pasos: [
      ...abrirHistorialRegistros(),
      {
        narracion:
          "En un registro tuyo, toca el lápiz (solo aparece en los que tú creaste); el formulario se abre precargado.",
        accion: "click",
        ancla: "comportamiento_observador.reg_editar",
      },
      {
        narracion: "Ajusta lo que necesites (tipo, asignaturas, fecha o el texto del comportamiento).",
        accion: "escribir",
        ancla: "comportamiento_observador.reg_comportamiento",
        campo: "comportamiento",
        opcional: true,
      },
      {
        narracion: "Toca 'Guardar cambios'. Listo.",
        accion: "click",
        ancla: "comportamiento_observador.reg_guardar",
      },
    ],
  },
  // ─────────────────────────── OBSERVADOR ESTUDIANTIL ────────────────────────
  {
    id: "comportamiento_observador.observador_consultar",
    titulo: "Ver el observador de un estudiante",
    descripcion:
      "Abrir el cuaderno de observaciones de un estudiante y leer cada anotación (tocando una se abre en letra normal).",
    categoria: "Comportamiento y Observador",
    roles: [...INTERNOS_OBSERVADOR],
    ruta: "/observador-estudiantil",
    endpoint: "Supabase select Observador_Estudiantil",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante cuyo observador se quiere leer." },
    ],
    sinonimos: [
      "ver el observador de un estudiante",
      "leer las observaciones de un alumno",
      "abrir el cuaderno de observaciones",
      "qué observaciones tiene un estudiante",
      "estudiantes con observaciones",
    ],
    pasos: [
      {
        narracion: "Entramos al Observador Estudiantil.",
        accion: "navegar",
        ruta: "/observador-estudiantil",
      },
      {
        narracion:
          "Si solo quieres los que ya tienen anotaciones, marca 'Con observaciones'.",
        accion: "click",
        ancla: "comportamiento_observador.obs_filtro_con_obs",
        opcional: true,
      },
      {
        narracion: "Puedes filtrar por grado.",
        accion: "seleccionar",
        ancla: "comportamiento_observador.obs_filtro_grado",
        campo: "grado",
        opcional: true,
      },
      {
        narracion: "Y por salón.",
        accion: "seleccionar",
        ancla: "comportamiento_observador.obs_filtro_salon",
        campo: "salon",
        opcional: true,
      },
      {
        narracion: "O busca al estudiante por su nombre.",
        accion: "escribir",
        ancla: "comportamiento_observador.obs_buscar",
        campo: "estudiante",
        opcional: true,
      },
      {
        narracion:
          "Abre su ficha (los que tienen anotaciones llevan un cuadernito naranja).",
        accion: "click",
        ancla: "comportamiento_observador.obs_item_estudiante",
        campo: "estudiante",
      },
      {
        narracion:
          "Puedes tocar cualquier anotación del cuaderno para abrirla ampliada en letra normal. Listo.",
        accion: "explicar",
      },
    ],
  },
  {
    id: "comportamiento_observador.observador_agregar",
    titulo: "Agregar una observación a un estudiante",
    descripcion:
      "Escribir una nueva observación en el cuaderno de un estudiante; al guardarla se notifica por WhatsApp a sus acudientes.",
    categoria: "Comportamiento y Observador",
    roles: [...INTERNOS_OBSERVADOR],
    ruta: "/observador-estudiantil",
    endpoint:
      "Supabase insert Observador_Estudiantil + POST /api/observador/notificar (SIN portero: el portero guarda pero no dispara el WhatsApp)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante a quien se le anota." },
    ],
    sinonimos: [
      "agregar una observación",
      "anotar algo en el observador",
      "escribirle una observación a un estudiante",
      "ponerle una nota en el cuaderno",
      "hacer una anotación",
    ],
    pasos: [
      ...abrirEstudianteObservador(),
      {
        narracion: "Toca 'Agregar observación'.",
        accion: "click",
        ancla: "comportamiento_observador.obs_agregar",
      },
      {
        narracion: "Escribe la observación en el recuadro.",
        accion: "escribir",
        ancla: "comportamiento_observador.obs_modal_texto",
        campo: "observacion",
      },
      {
        narracion:
          "Toca 'Guardar'. Se avisa por WhatsApp a los acudientes del estudiante. Listo.",
        accion: "click",
        ancla: "comportamiento_observador.obs_modal_guardar",
      },
    ],
  },
  {
    id: "comportamiento_observador.observador_agregar_varios",
    titulo: "Agregar la misma observación a varios estudiantes",
    descripcion:
      "Escribir una observación una sola vez y guardarla para varios estudiantes a la vez (incluso de distintos salones); notifica a los acudientes de cada uno.",
    categoria: "Comportamiento y Observador",
    roles: [...INTERNOS_OBSERVADOR],
    ruta: "/observador-estudiantil",
    endpoint:
      "Supabase insert Observador_Estudiantil (varias filas) + POST /api/observador/notificar por estudiante (SIN portero)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Los estudiantes seleccionados." },
    ],
    sinonimos: [
      "agregar una observación a varios estudiantes",
      "anotar lo mismo a todo el salón",
      "observación masiva",
      "seleccionar varios estudiantes y anotarles",
      "ponerle la misma observación a un grupo",
    ],
    pasos: [
      {
        narracion: "Entramos al Observador Estudiantil.",
        accion: "navegar",
        ruta: "/observador-estudiantil",
      },
      {
        narracion: "Activa 'Seleccionar varios'.",
        accion: "click",
        ancla: "comportamiento_observador.obs_seleccionar_varios",
      },
      {
        narracion: "Filtra por grado o salón si quieres acotar la lista.",
        accion: "seleccionar",
        ancla: "comportamiento_observador.obs_filtro_grado",
        campo: "grado",
        opcional: true,
      },
      {
        narracion:
          "Marca los estudiantes uno por uno. También existe el enlace Seleccionar todos, que marca los que se ven filtrados.",
        accion: "click",
        ancla: "comportamiento_observador.obs_check_estudiante",
        campo: "estudiante",
      },
      {
        narracion:
          "Toca 'Agregar observación' (muestra cuántos llevas seleccionados).",
        accion: "click",
        ancla: "comportamiento_observador.obs_agregar_varios",
      },
      {
        narracion: "Escribe el mensaje que quedará para todos ellos.",
        accion: "escribir",
        ancla: "comportamiento_observador.obs_modal_texto",
        campo: "observacion",
      },
      {
        narracion:
          "Toca 'Guardar'. La misma observación se guarda para cada estudiante y se notifica a sus acudientes. Listo.",
        accion: "click",
        ancla: "comportamiento_observador.obs_modal_guardar",
      },
    ],
  },
  {
    id: "comportamiento_observador.observador_editar",
    titulo: "Editar una observación",
    descripcion: "Cambiar el texto de una observación que tú mismo escribiste.",
    categoria: "Comportamiento y Observador",
    roles: [...INTERNOS_OBSERVADOR],
    ruta: "/observador-estudiantil",
    endpoint: "Supabase update Observador_Estudiantil (solo el autor)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante en cuyo cuaderno está la observación." },
    ],
    sinonimos: [
      "editar una observación",
      "corregir una anotación",
      "cambiar lo que escribí en el observador",
    ],
    pasos: [
      ...abrirEstudianteObservador(),
      {
        narracion:
          "Pasa el mouse sobre una observación tuya y toca el lápiz que aparece a la derecha (en el celular se ve siempre; solo sale en las que tú escribiste).",
        accion: "click",
        ancla: "comportamiento_observador.obs_editar",
      },
      {
        narracion: "Ajusta el texto.",
        accion: "escribir",
        ancla: "comportamiento_observador.obs_modal_texto",
        campo: "observacion",
      },
      {
        narracion: "Toca 'Guardar'. La edición no vuelve a notificar. Listo.",
        accion: "click",
        ancla: "comportamiento_observador.obs_modal_guardar",
      },
    ],
  },
  {
    id: "comportamiento_observador.observador_eliminar",
    titulo: "Eliminar una observación",
    descripcion: "Borrar una observación que tú escribiste. No se puede deshacer.",
    categoria: "Comportamiento y Observador",
    roles: [...INTERNOS_OBSERVADOR],
    ruta: "/observador-estudiantil",
    endpoint: "Supabase delete Observador_Estudiantil (solo el autor)",
    requisitos: [
      { entidad: "estudiante", descripcion: "Estudiante en cuyo cuaderno está la observación." },
    ],
    sinonimos: [
      "eliminar una observación",
      "borrar una anotación",
      "quitar una observación que hice",
    ],
    pasos: [
      ...abrirEstudianteObservador(),
      {
        narracion:
          "Pasa el mouse sobre una observación tuya y toca la papelera que aparece a la derecha (en el celular se ve siempre; solo sale en las que tú escribiste).",
        accion: "click",
        ancla: "comportamiento_observador.obs_eliminar",
      },
      {
        narracion: "Confirma en el aviso tocando 'Eliminar'. Listo.",
        accion: "click",
        ancla: "comportamiento_observador.obs_confirmar_eliminar",
      },
    ],
  },
];
