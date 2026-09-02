// Catálogo "Normi te guía" — Módulo CONFIGURAR INSTITUCIÓN.
//
// Hub del Rector/Admin (ruta /construye-institucion) desde el que se declara y
// mantiene toda la estructura del colegio. Es un menú de fichas; cada ficha se
// abre con ?vista=<id> (y Personas usa además ?rol=<cargo>). Componentes:
//  - Información del colegio + Escudo → /api/colegio/config y /api/colegio/logo.
//  - Escala de calificación + rangos de desempeño → /api/colegio/config.
//  - Jornadas, niveles, grados y salones → /api/institucion/* (estructura).
//  - Asignaturas + plan de estudios, Áreas + orden del boletín → /api/institucion/*.
//  - Calendario (periodos, días sin clases, eventos) → /api/institucion/calendario/*.
//  - Manual de Convivencia (PDF) → /api/institucion/manual.
//  - Personas (staff + est/acu) y Armar salón → /api/institucion/* y dbProxy.
//  - Número de WhatsApp y Bandeja de conversaciones (Chatwoot) → solo Administrador.
//
// GUARDS REALES (server/src/routes/institucion.ts + colegio.ts + services/jerarquia.ts):
//  - esCoordinadorOMas (rango ≥ Coordinador) INCLUYE Secretaría General (rango 4):
//    estructura, asignaturas, plan, áreas, boletín y calendario = admin, rector,
//    secretaria, coordinador.
//  - esRectorOMas = admin, rector: importar estructura y manual de convivencia.
//  - /api/colegio/config = admin, rector, coordinador; pero el campo `nombre`
//    (renombrar colegio) exige admin o rector. Como la ficha "Información" guarda
//    siempre el nombre, en la práctica esa ficha es admin/rector.
//  - /api/colegio/logo (escudo) = admin, rector (SuperAdmin aparte).
//  - Personas: crear = puedeGestionarStaff (admin, rector, secretaria, coordinador,
//    administrativo); editar/quitar = puedeCrearCargo (jerarquía por cargo objetivo);
//    corregir cédula = admin; carga académica del profesor (Asignación Profesores por
//    dbProxy) = admin, rector, coordinador; estudiantes/acudientes = Panel embebido.
//  - Chatwoot y WhatsApp = admin (o SuperAdmin).
//
// NOTA de acceso (divergencia UI vs backend): los GET son de cualquier interno,
// pero el gate de la PÁGINA (puedeEntrar en ConstruyeInstitucion) NO deja entrar a
// orientador ni portero, y a un profesor solo si es director de grupo (y solo ve
// Personas y Armar salón). Por eso ninguna capacidad incluye orientador ni portero,
// y las de Personas/Armar salón que tocan profesor exigen dirección de grupo.

import type { Capacidad, Paso } from "../tipos";

const RUTA = "/construye-institucion";

// esCoordinadorOMas: estructura / asignaturas / áreas / calendario.
const EDITAN_ESTRUCTURA = ["admin", "rector", "secretaria", "coordinador"] as const;
// esRectorOMas: importar estructura, manual, renombrar colegio, escudo.
const RECTOR_MAS = ["admin", "rector"] as const;
// /api/colegio/config sin renombrar (escala, rangos, datos que no sean el nombre).
const CONFIG_COLEGIO = ["admin", "rector", "coordinador"] as const;
// puedeGestionarStaff: quién agrega/edita/quita personal.
const GESTIONAN_STAFF = ["admin", "rector", "secretaria", "coordinador", "administrativo"] as const;
// CRUD de estudiantes/acudientes (profesor solo su grupo, por dbProxy).
const CRUD_EST_ACU = ["admin", "rector", "secretaria", "coordinador", "administrativo", "profesor"] as const;
// Carga académica del profesor (Asignación Profesores vía dbProxy).
const CARGA_PROF = ["admin", "rector", "coordinador"] as const;

/** Abre el hub y entra a una ficha por su tarjeta del menú. */
const abrirFicha = (ficha: string, narr: string): Paso[] => [
  { narracion: "Entramos a Configurar Institución.", accion: "navegar", ruta: RUTA },
  { narracion: narr, accion: "click", ancla: `configurar_institucion.ficha_${ficha}` },
];

/** Abre la ficha Personas y entra a la tarjeta de un rol. */
const abrirRolPersonas = (rolCard: string, narr: string): Paso[] => [
  ...abrirFicha("personas", "Abrimos la ficha Personas."),
  { narracion: narr, accion: "click", ancla: `configurar_institucion.persona_card_${rolCard}` },
];

export const CONFIGURAR_INSTITUCION: Capacidad[] = [
  // ─────────────────────────── HUB ───────────────────────────
  {
    id: "configurar_institucion.abrir",
    titulo: "Abrir Configurar Institución",
    descripcion: "Entrar al panel donde se define y mantiene toda la estructura del colegio.",
    categoria: "Configurar Institución",
    roles: [...GESTIONAN_STAFF, "profesor"],
    requiereDirectorGrupo: true, // el profesor entra solo si es director de grupo
    ruta: RUTA,
    endpoint: "GET /api/colegio/config + /api/institucion/* (lectura: cualquier interno)",
    sinonimos: [
      "configurar el colegio",
      "construir la institución",
      "abrir configurar institución",
      "ir a la configuración del colegio",
      "administrar la institución",
    ],
    pasos: [
      { narracion: "Desde el inicio, entramos a Configurar Institución.", accion: "navegar", ruta: RUTA },
      { narracion: "Este es el menú de fichas: datos, escudo, escala, jornadas y grados, asignaturas, calendario, manual, personas, armar salón y (si eres administrador) WhatsApp y bandeja de conversaciones.", accion: "explicar" },
    ],
  },

  // ───────────────────── INFORMACIÓN DEL COLEGIO ─────────────────────
  {
    id: "configurar_institucion.editar_datos_colegio",
    titulo: "Editar los datos del colegio (nombre, NIT, ciudad...)",
    descripcion: "Cambiar nombre, NIT, ciudad, DANE, dirección, teléfono, rector y resolución del colegio.",
    categoria: "Configurar Institución",
    roles: [...RECTOR_MAS],
    ruta: RUTA,
    endpoint: "PATCH /api/colegio/config (datos: admin, rector, coordinador; nombre: admin, rector)",
    sinonimos: [
      "cambiar el nombre del colegio",
      "renombrar la institución",
      "editar el NIT o la ciudad",
      "actualizar los datos del colegio",
      "cambiar la resolución o el DANE",
      "poner el nombre del rector",
    ],
    pasos: [
      ...abrirFicha("info", "Abrimos Información del colegio."),
      { narracion: "Escribe el nombre en el campo Nombre del colegio. Ojo: cambiarlo renombra el colegio en toda la plataforma (sigue siendo el mismo, no se pierde nada).", accion: "escribir", ancla: "configurar_institucion.info_nombre", campo: "nombre_colegio" },
      { narracion: "Completa los demás datos que quieras: NIT, ciudad, código DANE, dirección, teléfono y nombre del rector(a).", accion: "escribir", ancla: "configurar_institucion.info_nit", campo: "datos_legales", opcional: true },
      { narracion: "Si aplica, escribe la resolución o licencia de funcionamiento completa.", accion: "escribir", ancla: "configurar_institucion.info_resolucion", campo: "resolucion", opcional: true },
      { narracion: "Toca 'Guardar datos'. Aparecerán en boletines, exámenes y documentos oficiales.", accion: "click", ancla: "configurar_institucion.info_guardar" },
    ],
  },

  // ─────────────────────────── ESCUDO ───────────────────────────
  {
    id: "configurar_institucion.cambiar_escudo",
    titulo: "Subir o cambiar el escudo del colegio",
    descripcion: "Cargar el escudo (PNG sin fondo, también JPG o WEBP); se reescala y centra a 500x500.",
    categoria: "Configurar Institución",
    roles: [...RECTOR_MAS],
    ruta: RUTA,
    endpoint: "POST /api/colegio/logo (admin, rector)",
    sinonimos: [
      "subir el escudo",
      "cambiar el logo del colegio",
      "poner el escudo de la institución",
      "actualizar el escudo",
    ],
    pasos: [
      ...abrirFicha("escudo", "Abrimos la ficha Escudo."),
      { narracion: "Toca 'Subir escudo' (o 'Cambiar escudo' si ya hay uno).", accion: "click", ancla: "configurar_institucion.escudo_boton" },
      { narracion: "Se abre el explorador de archivos: elige el escudo. Lo ideal es un PNG sin fondo, cuadrado (500x500 px).", accion: "explicar" },
      { narracion: "El escudo se sube y se muestra al instante. Listo.", accion: "explicar" },
    ],
  },

  // ─────────────────────────── ESCALA ───────────────────────────
  {
    id: "configurar_institucion.editar_escala",
    titulo: "Ajustar la escala de calificación",
    descripcion: "Definir nota mínima, máxima, aprobatoria y cantidad de decimales del colegio.",
    categoria: "Configurar Institución",
    roles: [...CONFIG_COLEGIO],
    ruta: RUTA,
    endpoint: "PATCH /api/colegio/config (admin, rector, coordinador)",
    sinonimos: [
      "cambiar la escala de notas",
      "poner la nota mínima y máxima",
      "definir con cuánto se aprueba",
      "configurar los decimales de las notas",
    ],
    pasos: [
      ...abrirFicha("escala", "Abrimos Escala de calificación."),
      { narracion: "Escribe la nota mínima y la máxima de la escala.", accion: "escribir", ancla: "configurar_institucion.escala_min", campo: "escala_min_max" },
      { narracion: "Escribe la nota aprobatoria (debe estar dentro de la escala).", accion: "escribir", ancla: "configurar_institucion.escala_aprobatoria", campo: "nota_aprobatoria" },
      { narracion: "Elige cuántos decimales usar (0 a 2).", accion: "escribir", ancla: "configurar_institucion.escala_decimales", campo: "decimales", opcional: true },
      { narracion: "Toca 'Guardar'.", accion: "click", ancla: "configurar_institucion.escala_guardar" },
    ],
  },
  {
    id: "configurar_institucion.agregar_rango_desempeno",
    titulo: "Agregar un rango de desempeño",
    descripcion: "Nombrar un tramo de notas (ej. Sobresaliente de 4.0 a 4.5) con su color, usado en Estadísticas.",
    categoria: "Configurar Institución",
    roles: [...CONFIG_COLEGIO],
    ruta: RUTA,
    endpoint: "PATCH /api/colegio/config (rangos_desempeno)",
    sinonimos: [
      "agregar un rango de desempeño",
      "crear un nivel de desempeño",
      "poner nombres a los tramos de notas",
      "definir sobresaliente, alto, básico, bajo",
      "poner colores a las notas",
    ],
    pasos: [
      ...abrirFicha("escala", "Abrimos Escala de calificación."),
      { narracion: "Toca 'Agregar rango', en la sección Rangos de desempeño.", accion: "click", ancla: "configurar_institucion.escala_agregar_rango" },
      { narracion: "Escribe el nombre del rango (ej. Sobresaliente).", accion: "escribir", ancla: "configurar_institucion.rango_nombre", campo: "nombre_rango" },
      { narracion: "Pon el Desde y el Hasta del rango (dentro de la escala, sin cruzarse con otro; pueden tocarse en el borde).", accion: "escribir", ancla: "configurar_institucion.rango_desde", campo: "rango_min_max" },
      { narracion: "Elige el color del rango.", accion: "seleccionar", ancla: "configurar_institucion.rango_color", campo: "color", opcional: true },
      { narracion: "Toca 'Guardar' abajo para guardar la escala con sus rangos.", accion: "click", ancla: "configurar_institucion.escala_guardar" },
    ],
  },

  // ─────────────────── ESTRUCTURA: JORNADAS ───────────────────
  {
    id: "configurar_institucion.agregar_jornada",
    titulo: "Agregar una jornada",
    descripcion: "Crear una jornada del colegio (Matutina, Vespertina, Nocturna o una personalizada).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST /api/institucion/jornadas (esCoordinadorOMas)",
    sinonimos: [
      "agregar una jornada",
      "crear la jornada matutina",
      "poner una jornada nueva",
      "añadir jornada de la tarde",
    ],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la tarjeta 'Jornadas', toca la jornada estándar que quieras (Matutina, Vespertina o Nocturna) para agregarla de un toque.", accion: "click", ancla: "configurar_institucion.jornada_estandar", campo: "jornada" },
      { narracion: "Si necesitas otra con nombre propio, abre 'Otra jornada (nombre personalizado)', escríbela y toca 'Agregar'.", accion: "escribir", ancla: "configurar_institucion.jornada_nombre_custom", campo: "nombre_jornada", opcional: true },
      { narracion: "Después ajusta la hora de entrada y la de salida de la jornada nueva.", accion: "explicar" },
    ],
  },
  {
    id: "configurar_institucion.editar_horas_jornada",
    titulo: "Ajustar las horas de una jornada",
    descripcion: "Fijar la hora de entrada y de salida de una jornada (el aviso sale 5 minutos tras la salida).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/jornadas/:id (esCoordinadorOMas)",
    sinonimos: [
      "poner la hora de entrada de una jornada",
      "cambiar la hora de salida",
      "ajustar el horario de la jornada",
      "configurar a qué hora entran y salen",
    ],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la fila de la jornada, en los selectores de Entrada elige la hora, los minutos y AM/PM.", accion: "click", ancla: "configurar_institucion.jornada_hora_entrada", campo: "hora_entrada" },
      { narracion: "En los de Salida elige igual la hora, los minutos y AM/PM.", accion: "click", ancla: "configurar_institucion.jornada_hora_salida", campo: "hora_salida" },
      { narracion: "Listo: cada cambio se guarda solo.", accion: "explicar" },
    ],
  },
  {
    id: "configurar_institucion.eliminar_jornada",
    titulo: "Eliminar una jornada",
    descripcion: "Quitar una jornada del colegio.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "DELETE /api/institucion/jornadas/:id (esCoordinadorOMas)",
    sinonimos: ["eliminar una jornada", "borrar una jornada", "quitar la jornada nocturna"],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la fila de la jornada, toca el icono de la papelera para eliminarla.", accion: "click", ancla: "configurar_institucion.jornada_eliminar" },
    ],
  },

  // ─────────────────── ESTRUCTURA: NIVELES ───────────────────
  {
    id: "configurar_institucion.agregar_nivel",
    titulo: "Agregar un nivel",
    descripcion: "Crear un nivel que agrupa grados (Preescolar, Primaria, Secundaria, Media o personalizado).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST /api/institucion/niveles (esCoordinadorOMas)",
    sinonimos: [
      "agregar un nivel",
      "crear el nivel primaria",
      "poner los niveles del colegio",
      "añadir preescolar o secundaria",
    ],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la tarjeta 'Niveles', toca el nivel estándar que quieras (Preescolar, Primaria, Secundaria o Media) para agregarlo.", accion: "click", ancla: "configurar_institucion.nivel_estandar", campo: "nivel" },
      { narracion: "Para uno con nombre propio, abre 'Otro nivel (nombre personalizado)', escríbelo y toca 'Agregar'.", accion: "escribir", ancla: "configurar_institucion.nivel_nombre_custom", campo: "nombre_nivel", opcional: true },
    ],
  },
  {
    id: "configurar_institucion.renombrar_nivel",
    titulo: "Renombrar un nivel",
    descripcion: "Cambiar el nombre de un nivel (se propaga a grados, estudiantes, coordinadores y comunicados).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/niveles/:id (esCoordinadorOMas)",
    sinonimos: ["renombrar un nivel", "cambiar el nombre de un nivel", "corregir el nombre del nivel"],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En el chip del nivel, toca el lápiz para renombrarlo.", accion: "click", ancla: "configurar_institucion.nivel_renombrar" },
      { narracion: "Escribe el nombre nuevo (se aplicará en todo el colegio).", accion: "escribir", ancla: "configurar_institucion.nivel_renombrar_input", campo: "nombre_nivel" },
      { narracion: "Toca 'Guardar'.", accion: "click", ancla: "configurar_institucion.nivel_renombrar_guardar" },
    ],
  },
  {
    id: "configurar_institucion.reordenar_niveles",
    titulo: "Reordenar los niveles",
    descripcion: "Arrastrar los niveles por el asa para cambiar su orden.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/niveles/:id (orden)",
    sinonimos: ["reordenar los niveles", "cambiar el orden de los niveles", "acomodar los niveles"],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la tarjeta 'Niveles', toma el chip por el asa (el icono de agarre) y arrástralo a su nueva posición. El orden se guarda solo.", accion: "click", ancla: "configurar_institucion.nivel_asa" },
    ],
  },
  {
    id: "configurar_institucion.eliminar_nivel",
    titulo: "Eliminar un nivel",
    descripcion: "Quitar un nivel del colegio.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "DELETE /api/institucion/niveles/:id (esCoordinadorOMas)",
    sinonimos: ["eliminar un nivel", "borrar un nivel", "quitar el nivel media"],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En el chip del nivel, toca la papelera para eliminarlo.", accion: "click", ancla: "configurar_institucion.nivel_eliminar" },
    ],
  },

  // ─────────────────── ESTRUCTURA: GRADOS ───────────────────
  {
    id: "configurar_institucion.agregar_grado",
    titulo: "Agregar grados",
    descripcion: "Marcar los grados que ofrece el colegio (alta rápida por toque o un grado con nombre propio).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST /api/institucion/grados (esCoordinadorOMas)",
    sinonimos: [
      "agregar grados",
      "marcar los grados del colegio",
      "poner los cursos que se ofrecen",
      "crear un grado nuevo",
      "añadir un grado personalizado",
    ],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la tarjeta 'Grados', en 'Alta rápida' toca cada grado que ofrece el colegio (tocar de nuevo lo quita).", accion: "click", ancla: "configurar_institucion.grado_chip_rapido", campo: "grado" },
      { narracion: "Para uno con nombre propio, abre 'Otro grado (nombre personalizado)', escríbelo y toca 'Agregar'.", accion: "escribir", ancla: "configurar_institucion.grado_nombre_custom", campo: "nombre_grado", opcional: true },
    ],
  },
  {
    id: "configurar_institucion.asignar_nivel_grado",
    titulo: "Asignar el nivel de un grado",
    descripcion: "Elegir a qué nivel pertenece cada grado declarado.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/grados/:id (nivel)",
    requisitos: [{ entidad: "nivel", descripcion: "Nivel al que pertenece el grado." }],
    sinonimos: [
      "asignar el nivel de un grado",
      "poner un grado en primaria",
      "definir a qué nivel pertenece el grado",
    ],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la lista 'Grados del colegio', en la fila del grado abre el selector 'Nivel' y elige su nivel. Se guarda solo.", accion: "seleccionar", ancla: "configurar_institucion.grado_selector_nivel", campo: "nivel" },
    ],
  },
  {
    id: "configurar_institucion.renombrar_grado",
    titulo: "Renombrar un grado",
    descripcion: "Cambiar el nombre de un grado (se propaga a estudiantes, notas, actividades, asistencia y asignaciones).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/grados/:id (grado)",
    sinonimos: ["renombrar un grado", "cambiar el nombre de un grado", "corregir el nombre del curso"],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la fila del grado, toca el lápiz para renombrarlo.", accion: "click", ancla: "configurar_institucion.grado_renombrar" },
      { narracion: "Escribe el nombre nuevo (se aplicará en todo el colegio).", accion: "escribir", ancla: "configurar_institucion.grado_renombrar_input", campo: "nombre_grado" },
      { narracion: "Toca 'Guardar'.", accion: "click", ancla: "configurar_institucion.grado_renombrar_guardar" },
    ],
  },
  {
    id: "configurar_institucion.reordenar_grados",
    titulo: "Reordenar los grados",
    descripcion: "Arrastrar los grados por el asa para fijar su orden.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/grados/:id (orden)",
    sinonimos: ["reordenar los grados", "cambiar el orden de los grados", "acomodar los cursos"],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En Grados del colegio, toma la fila por el asa (icono de agarre) y arrástrala a su nueva posición. Se guarda solo.", accion: "click", ancla: "configurar_institucion.grado_asa" },
    ],
  },
  {
    id: "configurar_institucion.eliminar_grado",
    titulo: "Eliminar un grado",
    descripcion: "Quitar un grado del colegio (si tiene salones, hay que quitarlos primero).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "DELETE /api/institucion/grados/:id (esCoordinadorOMas)",
    sinonimos: ["eliminar un grado", "borrar un grado", "quitar un curso"],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la fila del grado, toca la papelera. Si el grado tiene salones, quítalos antes.", accion: "click", ancla: "configurar_institucion.grado_eliminar" },
    ],
  },

  // ─────────────────── ESTRUCTURA: SALONES ───────────────────
  {
    id: "configurar_institucion.asignar_salones_masivo",
    titulo: "Asignar salones a varios grados a la vez",
    descripcion: "Con la asignación rápida, crear N salones (con jornada) en varios grados de un golpe.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST /api/institucion/salones/bulk (esCoordinadorOMas)",
    sinonimos: [
      "crear salones en varios grados",
      "asignar salones de un golpe",
      "poner los mismos salones a todos los grados",
      "asignación rápida de salones",
    ],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la tarjeta 'Salones', en 'Asignación rápida' toca los grados a los que aplicar (o usa 'Seleccionar todos').", accion: "click", ancla: "configurar_institucion.salon_bulk_grados", campo: "grados" },
      { narracion: "Elige el número de salones por grado.", accion: "seleccionar", ancla: "configurar_institucion.salon_bulk_cantidad", campo: "cantidad_salones" },
      { narracion: "Elige la jornada de esos salones (o 'Sin jornada').", accion: "seleccionar", ancla: "configurar_institucion.salon_bulk_jornada", campo: "jornada", opcional: true },
      { narracion: "Toca 'Aplicar'.", accion: "click", ancla: "configurar_institucion.salon_bulk_aplicar" },
    ],
  },
  {
    id: "configurar_institucion.agregar_salon",
    titulo: "Agregar un salón a un grado",
    descripcion: "Añadir un salón más a un grado concreto (hasta 10 por grado).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST /api/institucion/salones (esCoordinadorOMas)",
    requisitos: [{ entidad: "grado", descripcion: "Grado al que se agrega el salón." }],
    sinonimos: ["agregar un salón", "añadir otro salón a un grado", "crear un salón nuevo"],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "Baja hasta el bloque del grado y toca 'Salón' para agregar el siguiente (se numera solo).", accion: "click", ancla: "configurar_institucion.salon_agregar", campo: "grado" },
    ],
  },
  {
    id: "configurar_institucion.asignar_jornada_salon",
    titulo: "Asignar la jornada de un salón",
    descripcion: "Elegir la jornada de un salón concreto.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/salones/:id (jornada_id)",
    sinonimos: ["poner la jornada de un salón", "asignar jornada a un salón", "cambiar la jornada de un curso"],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En el bloque del grado, en la fila del salón abre el selector de jornada y elígela. Se guarda solo.", accion: "seleccionar", ancla: "configurar_institucion.salon_selector_jornada", campo: "jornada" },
    ],
  },
  {
    id: "configurar_institucion.eliminar_salon",
    titulo: "Eliminar un salón",
    descripcion: "Quitar un salón; si tiene estudiantes matriculados, sale un aviso antes de borrarlo (no borra estudiantes ni notas).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "DELETE /api/institucion/salones/:id (esCoordinadorOMas)",
    sinonimos: ["eliminar un salón", "borrar un salón", "quitar un curso"],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En el bloque del grado, en la fila del salón toca la papelera.", accion: "click", ancla: "configurar_institucion.salon_eliminar" },
      { narracion: "Si el salón tiene estudiantes, aparece un aviso; confirma con 'Eliminar de todas formas'. Los estudiantes y sus notas se conservan.", accion: "click", ancla: "configurar_institucion.salon_eliminar_confirmar", opcional: true },
    ],
  },
  {
    id: "configurar_institucion.importar_estructura",
    titulo: "Importar la estructura actual (según los estudiantes)",
    descripcion: "Traer grados y salones desde los estudiantes ya cargados, con un clic.",
    categoria: "Configurar Institución",
    roles: [...RECTOR_MAS],
    ruta: RUTA,
    endpoint: "POST /api/institucion/importar-estructura (esRectorOMas)",
    sinonimos: [
      "importar la estructura",
      "traer los grados de los estudiantes",
      "generar grados y salones automáticamente",
      "importar según los estudiantes actuales",
    ],
    pasos: [
      ...abrirFicha("estructura", "Abrimos Jornadas, grados y salones."),
      { narracion: "En la tarjeta 'Grados', toca 'Importar estructura actual (según los estudiantes)'. Trae los grados y salones que ya tienen los estudiantes.", accion: "click", ancla: "configurar_institucion.importar_estructura" },
    ],
  },

  // ─────────────────── ASIGNATURAS + PLAN ───────────────────
  {
    id: "configurar_institucion.agregar_asignatura",
    titulo: "Agregar una asignatura al colegio",
    descripcion: "Marcar una asignatura de la lista o escribir una nueva para el catálogo del colegio.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST /api/institucion/asignaturas (esCoordinadorOMas)",
    sinonimos: [
      "agregar una asignatura",
      "poner las materias del colegio",
      "marcar una asignatura de la lista",
      "crear una materia nueva",
      "añadir una asignatura al catálogo",
    ],
    pasos: [
      ...abrirFicha("asignaturas", "Abrimos Asignaturas."),
      { narracion: "En la tarjeta Asignaturas del colegio, marca la casilla de cada asignatura que ofrece el colegio.", accion: "click", ancla: "configurar_institucion.asignatura_check", campo: "asignatura" },
      { narracion: "Si falta alguna, escríbela en el campo de abajo.", accion: "escribir", ancla: "configurar_institucion.asignatura_nueva", campo: "nombre_asignatura", opcional: true },
      { narracion: "Y toca 'Agregar'.", accion: "click", ancla: "configurar_institucion.asignatura_agregar", opcional: true },
    ],
  },
  {
    id: "configurar_institucion.quitar_asignatura",
    titulo: "Quitar una asignatura del colegio",
    descripcion: "Desmarcar una asignatura; si no tiene historial se elimina, si tiene notas se desactiva (historial intacto).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "DELETE /api/institucion/asignaturas/:id (o PATCH activa=false si está en uso)",
    sinonimos: [
      "quitar una asignatura",
      "desactivar una materia",
      "eliminar una asignatura del colegio",
      "sacar una materia del catálogo",
    ],
    pasos: [
      ...abrirFicha("asignaturas", "Abrimos Asignaturas."),
      { narracion: "En 'Asignaturas del colegio', desmarca la casilla de la asignatura. Si ya tiene notas u otros registros, no se borra: se desactiva y su historial queda intacto.", accion: "click", ancla: "configurar_institucion.asignatura_check", campo: "asignatura" },
    ],
  },
  {
    id: "configurar_institucion.renombrar_asignatura",
    titulo: "Renombrar una asignatura",
    descripcion: "Cambiar el nombre de una asignatura (se propaga a notas, actividades, asistencia y carga académica).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/asignaturas/:id (nombre)",
    sinonimos: ["renombrar una asignatura", "cambiar el nombre de una materia", "corregir el nombre de la asignatura"],
    pasos: [
      ...abrirFicha("asignaturas", "Abrimos Asignaturas."),
      { narracion: "Junto a la asignatura, toca el lápiz.", accion: "click", ancla: "configurar_institucion.asignatura_renombrar" },
      { narracion: "Escribe el nombre nuevo (se actualiza en todo el historial).", accion: "escribir", ancla: "configurar_institucion.asignatura_renombrar_input", campo: "nombre_asignatura" },
      { narracion: "Toca 'Renombrar'.", accion: "click", ancla: "configurar_institucion.asignatura_renombrar_guardar" },
    ],
  },
  {
    id: "configurar_institucion.plan_asignar_asignatura_grado",
    titulo: "Poner una asignatura en el plan de un grado",
    descripcion: "Marcar qué asignaturas se ven en un grado (aplica a todos sus salones).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST/DELETE /api/institucion/plan-estudios (esCoordinadorOMas)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado del plan de estudios." },
      { entidad: "asignatura", descripcion: "Asignatura a incluir en el grado." },
    ],
    sinonimos: [
      "poner una asignatura en un grado",
      "armar el plan de estudios de un grado",
      "definir qué materias se ven en un grado",
      "quitar una asignatura del grado",
    ],
    pasos: [
      ...abrirFicha("asignaturas", "Abrimos Asignaturas."),
      { narracion: "Baja a Plan de estudios por grado y elige el grado tocando su pastilla.", accion: "click", ancla: "configurar_institucion.plan_grado", campo: "grado" },
      { narracion: "Marca (o desmarca) la casilla de cada asignatura que se ve en ese grado. Puedes buscarla en el campo de búsqueda.", accion: "click", ancla: "configurar_institucion.plan_asignatura_check", campo: "asignatura" },
    ],
  },
  {
    id: "configurar_institucion.plan_intensidad_horaria",
    titulo: "Definir la intensidad horaria de una asignatura",
    descripcion: "Poner las horas semanales de una asignatura en un grado.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST /api/institucion/plan-estudios (intensidad_horaria)",
    sinonimos: [
      "poner las horas de una asignatura",
      "definir la intensidad horaria",
      "cuántas horas semanales tiene una materia",
      "horas por semana de una asignatura",
    ],
    pasos: [
      ...abrirFicha("asignaturas", "Abrimos Asignaturas."),
      { narracion: "En Plan de estudios por grado, elige el grado.", accion: "click", ancla: "configurar_institucion.plan_grado", campo: "grado" },
      { narracion: "En la fila de la asignatura marcada, escribe las horas semanales (1 a 40) en la casilla 'h/sem'. Se guarda al salir de la casilla.", accion: "escribir", ancla: "configurar_institucion.plan_horas", campo: "intensidad_horaria" },
    ],
  },

  // ─────────────────── ÁREAS + ORDEN DEL BOLETÍN ───────────────────
  {
    id: "configurar_institucion.crear_area",
    titulo: "Crear un área del boletín",
    descripcion: "Crear un área que agrupa asignaturas con pesos (ej. Ciencias Sociales) para el boletín.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST /api/institucion/areas (esCoordinadorOMas)",
    sinonimos: [
      "crear un área",
      "agrupar asignaturas en un área",
      "hacer un área para el boletín",
      "juntar materias en un área",
    ],
    pasos: [
      ...abrirFicha("asignaturas", "Abrimos Asignaturas (las Áreas están debajo del plan)."),
      { narracion: "Baja a la tarjeta 'Áreas (para el boletín)' y escribe el nombre del área (ej. Ciencias Sociales).", accion: "escribir", ancla: "configurar_institucion.area_nombre", campo: "nombre_area" },
      { narracion: "Toca 'Crear área'.", accion: "click", ancla: "configurar_institucion.area_crear" },
    ],
  },
  {
    id: "configurar_institucion.componer_area",
    titulo: "Definir las asignaturas y pesos de un área",
    descripcion: "Elegir qué asignaturas componen un área y con qué peso (deben sumar 100%).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PUT /api/institucion/areas/:id/asignaturas (esCoordinadorOMas)",
    requisitos: [{ entidad: "asignatura", descripcion: "Asignaturas que componen el área." }],
    sinonimos: [
      "poner las asignaturas de un área",
      "definir los pesos del área",
      "componer un área",
      "configurar qué materias van en un área y su porcentaje",
    ],
    pasos: [
      ...abrirFicha("asignaturas", "Abrimos Asignaturas."),
      { narracion: "En la tarjeta 'Áreas', en el área toca 'Asignaturas y pesos'.", accion: "click", ancla: "configurar_institucion.area_componer" },
      { narracion: "En cada fila elige una asignatura, su peso (%) y el grado (o 'Todos los grados'). Agrega filas con 'Agregar asignatura'.", accion: "seleccionar", ancla: "configurar_institucion.area_comp_asignatura", campo: "asignatura_peso_grado" },
      { narracion: "Cuida que la suma dé 100%. Toca 'Guardar'.", accion: "click", ancla: "configurar_institucion.area_comp_guardar" },
    ],
  },
  {
    id: "configurar_institucion.renombrar_area",
    titulo: "Renombrar un área",
    descripcion: "Cambiar el nombre de un área del boletín.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/areas/:id (nombre)",
    sinonimos: ["renombrar un área", "cambiar el nombre de un área"],
    pasos: [
      ...abrirFicha("asignaturas", "Abrimos Asignaturas."),
      { narracion: "En la tarjeta de áreas, toca el lápiz de 'Renombrar' del área.", accion: "click", ancla: "configurar_institucion.area_renombrar" },
      { narracion: "Escribe el nombre nuevo.", accion: "escribir", ancla: "configurar_institucion.area_renombrar_input", campo: "nombre_area" },
      { narracion: "Y toca 'Guardar'.", accion: "click", ancla: "configurar_institucion.area_renombrar_guardar" },
    ],
  },
  {
    id: "configurar_institucion.eliminar_area",
    titulo: "Eliminar un área",
    descripcion: "Quitar un área (sus asignaturas no se borran, vuelven a imprimirse sueltas).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "DELETE /api/institucion/areas/:id (esCoordinadorOMas)",
    sinonimos: ["eliminar un área", "borrar un área", "quitar un área del boletín"],
    pasos: [
      ...abrirFicha("asignaturas", "Abrimos Asignaturas."),
      { narracion: "En la tarjeta de áreas, toca la papelera de 'Eliminar' del área.", accion: "click", ancla: "configurar_institucion.area_eliminar" },
      { narracion: "Confirma con 'Eliminar'.", accion: "click", ancla: "configurar_institucion.area_eliminar_confirmar" },
    ],
  },
  {
    id: "configurar_institucion.ordenar_boletin",
    titulo: "Ordenar áreas y asignaturas en el boletín",
    descripcion: "Subir o bajar áreas y asignaturas sueltas para fijar el orden del boletín.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PUT /api/institucion/boletin-orden (esCoordinadorOMas)",
    sinonimos: [
      "ordenar el boletín",
      "cambiar el orden de las áreas del boletín",
      "acomodar las asignaturas en el boletín",
      "subir o bajar áreas en el informe",
    ],
    pasos: [
      ...abrirFicha("asignaturas", "Abrimos Asignaturas."),
      { narracion: "Baja a la sección Orden del boletín. Con las flechas de 'Subir' y Bajar mueve cada área o asignatura a su lugar. Se guarda al instante.", accion: "click", ancla: "configurar_institucion.boletin_flecha" },
    ],
  },

  // ─────────────────── CALENDARIO ───────────────────
  {
    id: "configurar_institucion.definir_periodo",
    titulo: "Definir un periodo académico en el calendario",
    descripcion: "Pintar en el calendario las fechas de un periodo (1 a 4) arrastrando del día inicial al final.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PUT /api/institucion/calendario/periodos (esCoordinadorOMas)",
    requisitos: [{ entidad: "fecha", descripcion: "Fecha de inicio y fin del periodo." }],
    sinonimos: [
      "definir un periodo",
      "poner las fechas del periodo 1",
      "marcar el periodo académico en el calendario",
      "configurar los periodos del año",
    ],
    pasos: [
      ...abrirFicha("calendario", "Abrimos el Calendario."),
      { narracion: "En la barra de herramientas, toca el periodo que vas a marcar (Periodo 1, 2, 3 o 4).", accion: "click", ancla: "configurar_institucion.cal_herramienta_periodo", campo: "periodo" },
      { narracion: "Haz clic en el día de inicio y, manteniendo presionado, arrastra hasta el día final; suelta para pintar el rango. Se guarda solo.", accion: "click", ancla: "configurar_institucion.cal_dia", campo: "rango_fechas" },
    ],
  },
  {
    id: "configurar_institucion.marcar_dia_sin_clases",
    titulo: "Marcar días sin clases",
    descripcion: "Pintar en el calendario un día o rango sin clases y ponerle motivo (los avisos no se envían esos días).",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST /api/institucion/calendario/dias (esCoordinadorOMas)",
    requisitos: [{ entidad: "fecha", descripcion: "Día o rango sin clases." }],
    sinonimos: [
      "marcar días sin clases",
      "poner un día festivo del colegio",
      "semana de receso",
      "jornada pedagógica sin estudiantes",
      "bloquear días en el calendario",
    ],
    pasos: [
      ...abrirFicha("calendario", "Abrimos el Calendario."),
      { narracion: "En la barra de herramientas, toca 'Día sin clases'.", accion: "click", ancla: "configurar_institucion.cal_herramienta_sinclases" },
      { narracion: "Haz clic en el día (o arrastra para un rango) en el calendario.", accion: "click", ancla: "configurar_institucion.cal_dia", campo: "rango_fechas" },
      { narracion: "Escribe el motivo (semana de receso, jornada pedagógica...).", accion: "escribir", ancla: "configurar_institucion.cal_dia_motivo", campo: "motivo" },
      { narracion: "Y toca 'Marcar sin clases'.", accion: "click", ancla: "configurar_institucion.cal_dia_confirmar" },
    ],
  },
  {
    id: "configurar_institucion.crear_evento",
    titulo: "Crear un evento en el calendario",
    descripcion: "Marcar un día CON clases donde además pasa algo (entrega de boletines, día deportivo, izada de bandera). Un evento no indica si hay o no clases: puede caer en un día normal o en uno marcado sin clases.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "POST /api/institucion/calendario/eventos (esCoordinadorOMas)",
    requisitos: [{ entidad: "fecha", descripcion: "Día o rango del evento." }],
    sinonimos: [
      "crear un evento",
      "programar la entrega de boletines",
      "poner un día deportivo",
      "marcar una izada de bandera",
      "agregar un evento al calendario",
    ],
    pasos: [
      ...abrirFicha("calendario", "Abrimos el Calendario."),
      { narracion: "En la barra de herramientas, toca 'Evento'.", accion: "click", ancla: "configurar_institucion.cal_herramienta_evento" },
      { narracion: "Haz clic en el día (o arrastra para un rango) en el calendario.", accion: "click", ancla: "configurar_institucion.cal_dia", campo: "rango_fechas" },
      { narracion: "Escribe el nombre del evento.", accion: "escribir", ancla: "configurar_institucion.cal_evento_nombre", campo: "nombre_evento" },
      { narracion: "Y toca 'Crear evento'.", accion: "click", ancla: "configurar_institucion.cal_evento_confirmar" },
    ],
  },
  {
    id: "configurar_institucion.editar_dia_calendario",
    titulo: "Ver o editar un día del calendario",
    descripcion: "Sin herramienta activa, tocar un día pintado para ver su detalle y editar su motivo o nombre.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/calendario/dias|eventos/:id (esCoordinadorOMas)",
    sinonimos: [
      "editar un día sin clases",
      "cambiar el motivo de un día",
      "editar el nombre de un evento",
      "ver qué hay en un día del calendario",
    ],
    pasos: [
      ...abrirFicha("calendario", "Abrimos el Calendario."),
      { narracion: "Sin herramienta seleccionada (si hay una activa, tócala de nuevo para soltarla), haz clic en el día pintado.", accion: "click", ancla: "configurar_institucion.cal_dia" },
      { narracion: "Si ese día tiene varios eventos, primero salen listados: toca 'Editar' en el que quieras (o la papelera para quitarlo). Si es un día sin clases que además tiene eventos, el detalle muestra el motivo y, debajo, la lista de esos eventos.", accion: "click", opcional: true },
      { narracion: "El detalle abre mostrando lo que hay. Toca 'Editar' para poder cambiarlo.", accion: "click", ancla: "configurar_institucion.cal_detalle_editar" },
      { narracion: "Ajusta el motivo (día sin clases) o el nombre (evento).", accion: "escribir", ancla: "configurar_institucion.cal_detalle_texto", campo: "motivo_o_nombre" },
      { narracion: "Y toca 'Guardar'.", accion: "click", ancla: "configurar_institucion.cal_detalle_guardar" },
    ],
  },
  {
    id: "configurar_institucion.quitar_marca_calendario",
    titulo: "Quitar un periodo, día sin clases o evento",
    descripcion: "Con la goma, hacer clic sobre un periodo, día sin clases o evento para quitarlo.",
    categoria: "Configurar Institución",
    roles: [...EDITAN_ESTRUCTURA],
    ruta: RUTA,
    endpoint: "DELETE /api/institucion/calendario/dias|eventos/:id o PUT periodos (esCoordinadorOMas)",
    sinonimos: [
      "quitar un día sin clases",
      "borrar un evento del calendario",
      "eliminar las fechas de un periodo",
      "usar la goma del calendario",
    ],
    pasos: [
      ...abrirFicha("calendario", "Abrimos el Calendario."),
      { narracion: "En la barra de herramientas, toca 'Quitar' (la goma).", accion: "click", ancla: "configurar_institucion.cal_herramienta_quitar" },
      { narracion: "Haz clic sobre el periodo, el día sin clases o el evento que quieres quitar.", accion: "click", ancla: "configurar_institucion.cal_dia" },
      { narracion: "Confirma en el aviso que aparece.", accion: "click", ancla: "configurar_institucion.cal_quitar_confirmar" },
    ],
  },

  // ─────────────────── MANUAL DE CONVIVENCIA ───────────────────
  {
    id: "configurar_institucion.subir_manual",
    titulo: "Subir el Manual de Convivencia",
    descripcion: "Cargar el Manual de Convivencia en PDF (máx 20 MB); aparece en el tablero de todos.",
    categoria: "Configurar Institución",
    roles: [...RECTOR_MAS],
    ruta: RUTA,
    endpoint: "POST /api/institucion/manual (esRectorOMas)",
    sinonimos: [
      "subir el manual de convivencia",
      "cargar el PDF del manual",
      "cambiar el manual de convivencia",
      "poner el reglamento del colegio",
    ],
    pasos: [
      ...abrirFicha("manual", "Abrimos Manual de Convivencia."),
      { narracion: "Toca 'Subir PDF' (o 'Cambiar PDF' si ya hay uno).", accion: "click", ancla: "configurar_institucion.manual_subir" },
      { narracion: "Se abre el explorador de archivos: elige el PDF del manual (máximo 20 MB).", accion: "explicar" },
    ],
  },
  {
    id: "configurar_institucion.quitar_manual",
    titulo: "Quitar el Manual de Convivencia",
    descripcion: "Eliminar el PDF del Manual de Convivencia cargado.",
    categoria: "Configurar Institución",
    roles: [...RECTOR_MAS],
    ruta: RUTA,
    endpoint: "DELETE /api/institucion/manual (esRectorOMas)",
    sinonimos: ["quitar el manual de convivencia", "borrar el PDF del manual", "eliminar el manual"],
    pasos: [
      ...abrirFicha("manual", "Abrimos Manual de Convivencia."),
      { narracion: "Toca 'Quitar' para eliminar el PDF actual.", accion: "click", ancla: "configurar_institucion.manual_quitar" },
    ],
  },

  // ─────────────────── PERSONAS ───────────────────
  {
    id: "configurar_institucion.agregar_persona_staff",
    titulo: "Agregar una persona al personal",
    descripcion: "Registrar un administrador, rector, secretaría, coordinador, administrativo, orientador, profesor o portero (autocompleta por cédula).",
    categoria: "Configurar Institución",
    roles: [...GESTIONAN_STAFF],
    ruta: RUTA,
    endpoint: "POST /api/institucion/interno (puedeGestionarStaff; el cargo objetivo respeta la jerarquía)",
    requisitos: [{ entidad: "profesor", descripcion: "Cédula y datos de la persona a registrar." }],
    sinonimos: [
      "agregar un profesor",
      "registrar un coordinador",
      "añadir personal del colegio",
      "crear un usuario del staff",
      "agregar una secretaria o un portero",
    ],
    pasos: [
      ...abrirRolPersonas("Profesor(a)", "Toca la tarjeta del rol que vas a agregar (por ejemplo Profesores)."),
      { narracion: "Toca 'Agregar'.", accion: "click", ancla: "configurar_institucion.persona_agregar" },
      { narracion: "Escribe la cédula. Si ya está registrada, los datos se autocompletan solos.", accion: "escribir", ancla: "configurar_institucion.persona_cedula", campo: "cedula" },
      { narracion: "Completa apellidos, nombres, teléfono, género (obligatorio) y fecha de nacimiento (opcional).", accion: "escribir", ancla: "configurar_institucion.persona_nombres", campo: "datos_persona" },
      { narracion: "Si es coordinador, marca los niveles que coordina; si es profesor, marca si es director de grupo (grado y salón) y su carga académica.", accion: "click", ancla: "configurar_institucion.persona_extras", campo: "extras_cargo", opcional: true },
      { narracion: "Toca el botón Agregar de abajo del pop-up. La persona entra por primera vez con su cédula como contraseña.", accion: "click", ancla: "configurar_institucion.persona_guardar" },
    ],
  },
  {
    id: "configurar_institucion.editar_persona_staff",
    titulo: "Editar una persona del personal",
    descripcion: "Corregir datos, niveles que coordina o la dirección de grupo de un integrante del staff.",
    categoria: "Configurar Institución",
    roles: [...GESTIONAN_STAFF],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/interno (puedeCrearCargo según el cargo objetivo)",
    sinonimos: [
      "editar un profesor",
      "cambiar los datos de un coordinador",
      "corregir un integrante del personal",
      "modificar la dirección de grupo de un profesor",
    ],
    pasos: [
      ...abrirRolPersonas("Profesor(a)", "Entra a la tarjeta del rol de la persona (por ejemplo Profesores)."),
      { narracion: "Busca a la persona por nombre, apellido o cédula y, en su fila, toca el lápiz.", accion: "click", ancla: "configurar_institucion.persona_editar" },
      { narracion: "Ajusta lo que necesites (datos personales, niveles que coordina, dirección de grupo, carga académica).", accion: "escribir", ancla: "configurar_institucion.persona_nombres", campo: "datos_persona" },
      { narracion: "Toca 'Guardar'.", accion: "click", ancla: "configurar_institucion.persona_guardar" },
    ],
  },
  {
    id: "configurar_institucion.quitar_cargo",
    titulo: "Quitar el cargo a una persona",
    descripcion: "Retirar un cargo del staff; si tiene otros los conserva, si era el único sale del personal del colegio.",
    categoria: "Configurar Institución",
    roles: [...GESTIONAN_STAFF],
    ruta: RUTA,
    endpoint: "DELETE /api/institucion/interno (puedeCrearCargo según el cargo objetivo)",
    sinonimos: [
      "quitar el cargo a alguien",
      "sacar a un profesor del personal",
      "retirar a un coordinador",
      "eliminar a alguien del staff",
    ],
    pasos: [
      ...abrirRolPersonas("Profesor(a)", "Entra a la tarjeta del rol de la persona."),
      { narracion: "En la fila de la persona, toca la papelera.", accion: "click", ancla: "configurar_institucion.persona_quitar" },
      { narracion: "Confirma con 'Quitar cargo'.", accion: "click", ancla: "configurar_institucion.persona_quitar_confirmar" },
    ],
  },
  {
    id: "configurar_institucion.corregir_cedula",
    titulo: "Corregir la cédula de una persona",
    descripcion: "Cambiar la cédula de una persona; se migra en todo el sistema (notas, asistencia, vínculos, comunicados).",
    categoria: "Configurar Institución",
    roles: ["admin"],
    ruta: RUTA,
    endpoint: "POST /auth/cambiar-cedula (RPC cambiar_cedula; solo Administrador)",
    sinonimos: [
      "corregir la cédula de alguien",
      "cambiar el número de identificación",
      "arreglar una cédula mal digitada",
      "migrar la cédula de una persona",
    ],
    pasos: [
      ...abrirRolPersonas("Profesor(a)", "Entra a la tarjeta del rol de la persona."),
      { narracion: "En su fila, toca el lápiz para editarla.", accion: "click", ancla: "configurar_institucion.persona_editar" },
      { narracion: "Junto al campo Cédula, toca el lápiz de 'Corregir cédula'.", accion: "click", ancla: "configurar_institucion.persona_cedula_editable" },
      { narracion: "Escribe la cédula correcta (se migra en todo el sistema).", accion: "escribir", ancla: "configurar_institucion.persona_cedula", campo: "cedula_nueva" },
      { narracion: "Toca 'Guardar'.", accion: "click", ancla: "configurar_institucion.persona_guardar" },
    ],
  },
  {
    id: "configurar_institucion.carga_academica_profesor",
    titulo: "Asignar la carga académica de un profesor",
    descripcion: "Dentro del profesor, añadir asignaciones (asignaturas + grados + salones) sin ir al Panel de Control.",
    categoria: "Configurar Institución",
    roles: [...CARGA_PROF],
    ruta: RUTA,
    endpoint: "dbProxy Asignación Profesores (insert/update/delete: admin, rector, coordinador)",
    requisitos: [
      { entidad: "asignatura", descripcion: "Asignatura(s) que dictará." },
      { entidad: "grado", descripcion: "Grado(s) de la asignación." },
      { entidad: "salon", descripcion: "Salón(es) de la asignación." },
    ],
    sinonimos: [
      "asignar la carga académica",
      "poner qué materias dicta un profesor",
      "agregar una asignación a un profesor",
      "definir grados y salones de un profesor",
    ],
    pasos: [
      ...abrirRolPersonas("Profesor(a)", "Entra a la tarjeta Profesores."),
      { narracion: "Agrega o edita al profesor (Agregar, o el lápiz de su fila).", accion: "click", ancla: "configurar_institucion.persona_editar" },
      { narracion: "Baja a 'Carga académica' y marca las asignaturas, los grados y los salones de la asignación.", accion: "click", ancla: "configurar_institucion.carga_seleccion", campo: "asignatura_grado_salon" },
      { narracion: "Toca 'Añadir asignación'. Repite para cada bloque de carga. Si es la única, puedes saltarte este paso: el botón Guardar/Agregar de abajo también la confirma.", accion: "click", ancla: "configurar_institucion.carga_anadir", opcional: true },
      { narracion: "Guarda al profesor con 'Guardar' (o 'Agregar' si es nuevo).", accion: "click", ancla: "configurar_institucion.persona_guardar" },
    ],
  },
  {
    id: "configurar_institucion.gestionar_estudiantes_acudientes",
    titulo: "Gestionar estudiantes y acudientes",
    descripcion: "Desde Personas, abrir Estudiantes o Acudientes; ahí se incrusta el Panel de Control (mismo CRUD y misma data).",
    categoria: "Configurar Institución",
    roles: [...CRUD_EST_ACU],
    requiereDirectorGrupo: true, // el profesor solo si es director de grupo
    ruta: RUTA,
    endpoint: "PanelControl embebido (dbProxy Estudiantes/Acudientes/Usuarios)",
    sinonimos: [
      "ver los estudiantes",
      "gestionar acudientes",
      "administrar estudiantes desde personas",
      "registrar estudiantes y acudientes",
    ],
    pasos: [
      ...abrirRolPersonas("estudiante", "Toca la tarjeta Estudiantes (o Acudientes)."),
      { narracion: "Aquí se abre el Panel de Control incrustado: es el mismo registro y edición de estudiantes y acudientes. Sigue los pasos del Panel de Control para agregarlos o editarlos.", accion: "explicar" },
    ],
  },

  // ─────────────────── ARMAR SALÓN ───────────────────
  {
    id: "configurar_institucion.armar_salon_abrir",
    titulo: "Abrir Armar salón",
    descripcion: "Ver el aula de forma visual: tablero, director(a) de grupo y un pupitre por estudiante.",
    categoria: "Configurar Institución",
    roles: [...CRUD_EST_ACU],
    requiereDirectorGrupo: true, // el profesor solo si es director de grupo
    ruta: RUTA,
    endpoint: "GET /api/institucion/estructura + dbProxy (Estudiantes/Internos/Usuarios)",
    requisitos: [
      { entidad: "grado", descripcion: "Grado del salón a armar." },
      { entidad: "salon", descripcion: "Salón a armar." },
    ],
    sinonimos: [
      "armar el salón",
      "ver el salón de forma visual",
      "abrir armar salón",
      "ver los pupitres del salón",
    ],
    pasos: [
      ...abrirFicha("armar-salon", "Abrimos Armar salón."),
      { narracion: "Elige el grado y el salón (si eres director de grupo, tu salón ya sale fijo).", accion: "seleccionar", ancla: "configurar_institucion.armar_selector_grado", campo: "grado_salon" },
      { narracion: "Se dibuja el aula: tablero, escritorio con el director(a) y un pupitre por estudiante.", accion: "explicar" },
    ],
  },
  {
    id: "configurar_institucion.armar_salon_asignar_director",
    titulo: "Asignar el director(a) de grupo del salón",
    descripcion: "Desde Armar salón, elegir el profesor que dirige el grupo (solo staff, no el propio profesor).",
    categoria: "Configurar Institución",
    roles: [...GESTIONAN_STAFF],
    ruta: RUTA,
    endpoint: "PATCH /api/institucion/interno (direccion_de_grupo; puedeCrearCargo Profesor)",
    requisitos: [{ entidad: "profesor", descripcion: "Profesor que será director de grupo." }],
    sinonimos: [
      "asignar director de grupo",
      "poner al director del salón",
      "elegir el director de grupo",
      "cambiar el director de grupo",
    ],
    pasos: [
      ...abrirFicha("armar-salon", "Abrimos Armar salón."),
      { narracion: "Elige el grado y el salón.", accion: "seleccionar", ancla: "configurar_institucion.armar_selector_grado", campo: "grado_salon" },
      { narracion: "Junto al escritorio, toca el '+' (o el lápiz si ya hay uno) para el director(a) de grupo.", accion: "click", ancla: "configurar_institucion.armar_director_boton" },
      { narracion: "Busca y elige al profesor en la lista.", accion: "seleccionar", ancla: "configurar_institucion.armar_director_selector", campo: "profesor" },
      { narracion: "Toca 'Asignar'. (Si ya hay director, primero se quita con 'Quitar dirección de grupo'.)", accion: "click", ancla: "configurar_institucion.armar_director_asignar" },
    ],
  },
  {
    id: "configurar_institucion.armar_salon_agregar_estudiante",
    titulo: "Agregar un estudiante al salón",
    descripcion: "Desde el pupitre '+', registrar un estudiante nuevo con todos sus datos en ese grado y salón.",
    categoria: "Configurar Institución",
    roles: [...CRUD_EST_ACU],
    requiereDirectorGrupo: true, // el profesor solo si es director de grupo
    ruta: RUTA,
    endpoint: "dbProxy Usuarios + Estudiantes (CRUD estudiantes; profesor solo su grupo)",
    requisitos: [{ entidad: "estudiante", descripcion: "Cédula y datos del estudiante." }],
    sinonimos: [
      "agregar un estudiante al salón",
      "matricular un estudiante",
      "registrar un alumno en el curso",
      "meter un estudiante al salón",
    ],
    pasos: [
      ...abrirFicha("armar-salon", "Abrimos Armar salón."),
      { narracion: "Elige el grado y el salón.", accion: "seleccionar", ancla: "configurar_institucion.armar_selector_grado", campo: "grado_salon" },
      { narracion: "Toca el pupitre '+' (Agregar estudiante).", accion: "click", ancla: "configurar_institucion.armar_agregar_estudiante" },
      { narracion: "Escribe la cédula (si ya existe, se autocompleta) y completa apellidos, nombres, teléfono, género (obligatorio) y fecha de nacimiento.", accion: "escribir", ancla: "configurar_institucion.armar_est_cedula", campo: "datos_estudiante" },
      { narracion: "Toca 'Agregar'.", accion: "click", ancla: "configurar_institucion.armar_est_guardar" },
    ],
  },
  {
    id: "configurar_institucion.armar_salon_editar_estudiante",
    titulo: "Editar un estudiante o moverlo de salón",
    descripcion: "Editar los datos de un estudiante y, si no eres su director de grupo, moverlo a otro grado o salón.",
    categoria: "Configurar Institución",
    roles: [...CRUD_EST_ACU],
    requiereDirectorGrupo: true, // el profesor solo si es director de grupo
    ruta: RUTA,
    endpoint: "dbProxy Usuarios + Estudiantes (update)",
    sinonimos: [
      "editar un estudiante",
      "mover un estudiante de salón",
      "cambiar a un alumno de curso",
      "corregir los datos de un estudiante",
    ],
    pasos: [
      ...abrirFicha("armar-salon", "Abrimos Armar salón."),
      { narracion: "Elige el grado y el salón, y en el pupitre del estudiante toca el lápiz.", accion: "click", ancla: "configurar_institucion.armar_est_editar" },
      { narracion: "Ajusta sus datos; para moverlo, cambia el grado y el salón (los directores de grupo no pueden mover, su salón es fijo).", accion: "seleccionar", ancla: "configurar_institucion.armar_est_mover", campo: "grado_salon", opcional: true },
      { narracion: "Toca 'Guardar'.", accion: "click", ancla: "configurar_institucion.armar_est_guardar" },
    ],
  },
  {
    id: "configurar_institucion.armar_salon_eliminar_estudiante",
    titulo: "Eliminar un estudiante del salón",
    descripcion: "Retirar la matrícula de un estudiante (su identidad global se conserva).",
    categoria: "Configurar Institución",
    roles: [...CRUD_EST_ACU],
    requiereDirectorGrupo: true, // el profesor solo si es director de grupo
    ruta: RUTA,
    endpoint: "dbProxy Estudiantes (delete)",
    sinonimos: [
      "eliminar un estudiante",
      "retirar la matrícula de un alumno",
      "sacar un estudiante del salón",
      "desmatricular un estudiante",
    ],
    pasos: [
      ...abrirFicha("armar-salon", "Abrimos Armar salón."),
      { narracion: "Elige el grado y el salón, y en el pupitre del estudiante toca la papelera.", accion: "click", ancla: "configurar_institucion.armar_est_eliminar" },
      { narracion: "Confirma con 'Eliminar'. Se retira su matrícula; su cédula lo reconoce si algún día vuelve.", accion: "click", ancla: "configurar_institucion.armar_est_eliminar_confirmar" },
    ],
  },
  {
    id: "configurar_institucion.armar_salon_gestionar_acudientes",
    titulo: "Agregar o editar acudientes de un estudiante",
    descripcion: "Dentro de la edición de un estudiante, vincular o editar sus acudientes (máximo 3).",
    categoria: "Configurar Institución",
    roles: [...CRUD_EST_ACU],
    requiereDirectorGrupo: true, // el profesor solo si es director de grupo
    ruta: RUTA,
    endpoint: "dbProxy Usuarios + Acudientes (insert/update)",
    requisitos: [{ entidad: "acudiente", descripcion: "Cédula y datos del acudiente." }],
    sinonimos: [
      "agregar un acudiente",
      "vincular al papá o mamá de un estudiante",
      "editar un acudiente",
      "poner el acudiente de un alumno",
    ],
    pasos: [
      ...abrirFicha("armar-salon", "Abrimos Armar salón."),
      { narracion: "Elige el grado y el salón, y en el pupitre del estudiante toca el lápiz para editarlo.", accion: "click", ancla: "configurar_institucion.armar_est_editar" },
      { narracion: "Baja a Acudientes y toca 'Agregar acudiente' (o el lápiz de uno existente).", accion: "click", ancla: "configurar_institucion.armar_acu_agregar" },
      { narracion: "Escribe la cédula (autocompleta si ya existe) y completa apellidos, nombres, teléfono y género.", accion: "escribir", ancla: "configurar_institucion.armar_acu_cedula", campo: "datos_acudiente" },
      { narracion: "Toca 'Agregar acudiente' (o 'Guardar' si lo estás editando).", accion: "click", ancla: "configurar_institucion.armar_acu_guardar" },
    ],
  },

  // ─────────────────── WHATSAPP + CHATWOOT (solo admin) ───────────────────
  {
    id: "configurar_institucion.configurar_whatsapp",
    titulo: "Configurar el número de WhatsApp del Agente",
    descripcion: "Fijar el número por el que Normi responde y envía en el colegio (id de WABA + token, se valida contra Meta).",
    categoria: "Configurar Institución",
    roles: ["admin"],
    ruta: RUTA,
    endpoint: "GET/POST /api/institucion/whatsapp (SuperAdmin, Administrador)",
    sinonimos: [
      "configurar el WhatsApp del agente",
      "poner el número de Normi",
      "conectar la WABA del colegio",
      "cambiar el número de WhatsApp",
    ],
    pasos: [
      ...abrirFicha("whatsapp", "Abrimos Número de WhatsApp (solo Administrador)."),
      { narracion: "Pega el id de la WABA y el token de Meta.", accion: "escribir", ancla: "configurar_institucion.wa_waba_id", campo: "waba_id_token" },
      { narracion: "Toca 'Buscar números'.", accion: "click", ancla: "configurar_institucion.wa_buscar" },
      { narracion: "Elige el número de este colegio en la lista.", accion: "click", ancla: "configurar_institucion.wa_numero", campo: "numero" },
      { narracion: "Toca 'Guardar número'. Se valida contra Meta y el Agente queda respondiendo por ese WhatsApp.", accion: "click", ancla: "configurar_institucion.wa_guardar" },
    ],
  },
  {
    id: "configurar_institucion.configurar_chatwoot",
    titulo: "Configurar la bandeja de conversaciones (Chatwoot)",
    descripcion: "Fijar el correo y la contraseña para entrar a chat.notasnormi.com y ver los chats del colegio.",
    categoria: "Configurar Institución",
    roles: ["admin"],
    ruta: RUTA,
    endpoint: "GET/POST /api/institucion/chatwoot (SuperAdmin, Administrador)",
    sinonimos: [
      "configurar la bandeja de conversaciones",
      "poner el correo y clave de Chatwoot",
      "acceso a los chats del colegio",
      "cambiar la contraseña de la bandeja",
    ],
    pasos: [
      ...abrirFicha("chatwoot", "Abrimos Bandeja de conversaciones (solo Administrador)."),
      { narracion: "Escribe el correo de ingreso.", accion: "escribir", ancla: "configurar_institucion.cw_email", campo: "correo" },
      { narracion: "Escribe la contraseña (la primera vez, mínimo 6 caracteres; déjala en blanco para no cambiarla).", accion: "escribir", ancla: "configurar_institucion.cw_password", campo: "contrasena" },
      { narracion: "Toca 'Configurar bandeja' (o 'Guardar cambios'). Cambiar el acceso no afecta las conversaciones.", accion: "click", ancla: "configurar_institucion.cw_guardar" },
    ],
  },
];
