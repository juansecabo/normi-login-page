// "Normi te guía" — Catálogo completo.
//
// Une todos los módulos de capacidades. Fuente única de verdad de TODO lo que un
// interno puede hacer en la plataforma, por rol, con los pasos que Normi ejecuta
// con el cursor simulado. Ver src/guia/tipos.ts para el esquema.

import type { Capacidad } from "./tipos";

import { NOTAS } from "./modulos/notas";
import { ACTIVIDADES } from "./modulos/actividades";
import { ASISTENCIA } from "./modulos/asistencia";
import { COMUNICADOS } from "./modulos/comunicados";
import { PERMISOS_EXCUSAS } from "./modulos/permisos_excusas";
import { ENTREVISTAS } from "./modulos/entrevistas";
import { CONSULTAS } from "./modulos/consultas";
import { COMPORTAMIENTO_OBSERVADOR } from "./modulos/comportamiento_observador";
import { PORTERIA } from "./modulos/porteria";
import { PANEL_CONTROL } from "./modulos/panel_control";
import { CONFIGURAR_INSTITUCION } from "./modulos/configurar_institucion";
import { BOLETINES_FORMATOS_LOGROS } from "./modulos/boletines_formatos_logros";
import { ESTADISTICAS } from "./modulos/estadisticas";
import { ORIENTACION } from "./modulos/orientacion";
import { VARIOS } from "./modulos/varios";
import { OTROS } from "./modulos/otros";

export const CATALOGO: Capacidad[] = [
  ...NOTAS,
  ...ACTIVIDADES,
  ...ASISTENCIA,
  ...COMUNICADOS,
  ...PERMISOS_EXCUSAS,
  ...ENTREVISTAS,
  ...CONSULTAS,
  ...COMPORTAMIENTO_OBSERVADOR,
  ...PORTERIA,
  ...PANEL_CONTROL,
  ...CONFIGURAR_INSTITUCION,
  ...BOLETINES_FORMATOS_LOGROS,
  ...ESTADISTICAS,
  ...ORIENTACION,
  ...VARIOS,
  ...OTROS,
];

export * from "./tipos";
