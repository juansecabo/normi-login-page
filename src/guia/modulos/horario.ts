// Catálogo "Normi te guía" — Módulo HORARIO (ficha Horario, 2026-09-23).
//
// Una ficha para todos los roles en todos los colegios:
//  - Estudiante: su horario. Acudiente: el de cada acudido (botones arriba).
//  - Profesor: "Mis clases" y, abajo, el horario de cualquier salón (solo ver).
//  - Rector / admin: arman el horario de cualquier salón. Coordinador: los de
//    sus niveles (el servidor bloquea los demás). El guardado bloquea cruces de
//    profesores. "Horas de <nivel>" define las horas de reloj (opcional).
//  - Secretaría, administrativo, orientador: consultan por salón o por profesor.

import type { Capacidad } from "../tipos";

const LLEGAR = {
  narracion: "En el inicio, toca la ficha Horario.",
  accion: "click" as const,
  ancla: "dashboard.ficha_horario",
};
const PERSONAL = ["rector", "coordinador", "admin", "secretaria", "administrativo", "orientador"] as const;
const EDITORES = ["rector", "coordinador", "admin"] as const;

export const HORARIO: Capacidad[] = [
  {
    id: "horario.ver_propio",
    titulo: "Ver mi horario de clases",
    descripcion: "Ver qué materias hay cada día y en qué hora (y con qué profesor). Si el horario del salón no está cargado, la ficha lo dice.",
    categoria: "Horario",
    roles: ["estudiante", "profesor"],
    ruta: "/horario",
    endpoint: "GET /api/horario/mio",
    sinonimos: ["ver mi horario", "qué clases tengo", "horario de clases", "mis clases", "a qué hora tengo clase"],
    pasos: [
      LLEGAR,
      { narracion: "Aquí está tu horario: cada columna es un día y cada fila una hora de clase.", accion: "explicar", ancla: "horario.rejilla" },
    ],
  },
  {
    id: "horario.ver_acudido",
    titulo: "Ver el horario de mi estudiante",
    descripcion: "Ver el horario de clases de cada estudiante a cargo; si tiene varios, se escoge arriba.",
    categoria: "Horario",
    roles: ["acudiente"],
    ruta: "/horario",
    endpoint: "GET /api/horario/mio",
    sinonimos: ["horario de mi hijo", "horario de mi hija", "qué clases tiene mi hijo", "clases de mañana de mi hijo"],
    pasos: [
      LLEGAR,
      { narracion: "Si tienes varios estudiantes, toca el nombre del que quieres ver.", accion: "click", ancla: "horario.selector_estudiante", opcional: true },
      { narracion: "Ese es su horario: cada columna es un día y cada fila una hora de clase.", accion: "explicar", ancla: "horario.rejilla" },
    ],
  },
  {
    id: "horario.ver_salon",
    titulo: "Ver el horario de un salón",
    descripcion: "Consultar el horario de clases de cualquier salón del colegio.",
    categoria: "Horario",
    roles: [...PERSONAL, "profesor"],
    ruta: "/horario",
    endpoint: "GET /api/horario/salon",
    requisitos: [{ entidad: "salon", descripcion: "Grado y salón a consultar." }],
    sinonimos: ["horario de un salón", "horario de sexto", "qué clases tiene un curso"],
    pasos: [
      LLEGAR,
      { narracion: "Escoge el salón en la lista.", accion: "seleccionar", ancla: "horario.selector_salon", campo: "salon" },
      { narracion: "Ahí tienes el horario de ese salón, con el profesor de cada clase.", accion: "explicar", ancla: "horario.rejilla" },
    ],
  },
  {
    id: "horario.ver_profesor",
    titulo: "Ver el horario de un profesor",
    descripcion: "Consultar en qué salones y a qué hora tiene clase un profesor.",
    categoria: "Horario",
    roles: [...PERSONAL],
    ruta: "/horario",
    endpoint: "GET /api/horario/profesor",
    requisitos: [{ entidad: "profesor", descripcion: "Profesor a consultar." }],
    sinonimos: ["horario de un profesor", "dónde está el profesor", "clases de un docente"],
    pasos: [
      LLEGAR,
      { narracion: "Toca 'Por profesor'.", accion: "click", ancla: "horario.vista_profesor" },
      { narracion: "Escoge el profesor en la lista y verás sus clases de la semana.", accion: "explicar" },
    ],
  },
  {
    id: "horario.armar",
    titulo: "Armar o editar el horario de un salón",
    descripcion: "Poner la materia de cada día y hora de un salón. Si un profesor quedaría en dos salones a la misma hora, no deja guardar y dice dónde está el cruce. El coordinador solo edita los salones de sus niveles.",
    categoria: "Horario",
    roles: [...EDITORES],
    ruta: "/horario",
    endpoint: "PUT /api/horario/salon",
    requisitos: [{ entidad: "salon", descripcion: "Grado y salón a armar." }],
    sinonimos: ["armar el horario", "hacer el horario", "cambiar el horario", "editar horario", "cruces de profesores"],
    pasos: [
      LLEGAR,
      { narracion: "Escoge el salón en la lista.", accion: "seleccionar", ancla: "horario.selector_salon", campo: "salon" },
      { narracion: "Toca 'Armar horario' (o 'Editar horario' si ya tiene uno).", accion: "click", ancla: "horario.editar" },
      { narracion: "Toca cada casilla y escoge la materia; con los botones de arriba cambias cuántas horas tiene el día.", accion: "explicar", ancla: "horario.rejilla" },
      { narracion: "Cuando termines, toca 'Guardar horario'. Si hay un cruce de profesores te dirá cuál es para que lo cambies.", accion: "click", ancla: "horario.guardar" },
    ],
  },
  {
    id: "horario.horas_nivel",
    titulo: "Poner las horas de reloj de un nivel",
    descripcion: "Definir a qué hora empieza y termina cada hora de clase de un nivel (opcional). Aplica a todos sus salones.",
    categoria: "Horario",
    roles: [...EDITORES],
    ruta: "/horario",
    endpoint: "PUT /api/horario/franjas",
    requisitos: [{ entidad: "nivel", descripcion: "Nivel al que se le ponen las horas." }],
    sinonimos: ["horas de clase", "a qué hora empieza cada clase", "timbre", "horario de timbres"],
    pasos: [
      LLEGAR,
      { narracion: "Escoge un salón del nivel.", accion: "seleccionar", ancla: "horario.selector_salon", campo: "salon" },
      { narracion: "Toca 'Horas de' seguido del nivel.", accion: "click", ancla: "horario.franjas" },
      { narracion: "Escribe la hora de inicio y fin de cada hora de clase y toca 'Guardar horas'.", accion: "explicar" },
    ],
  },
];
