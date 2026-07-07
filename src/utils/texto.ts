/**
 * Capitaliza nombres propios mientras se escriben: la primera letra de cada
 * palabra pasa a mayúscula ("maría josé" → "María José"). No toca las letras
 * que ya vengan en mayúscula ni el resto de la palabra (respeta "McGregor").
 */
export const capitalizarNombre = (v: string): string =>
  v.replace(/(^|[\s.'-])(\p{Ll})/gu, (_m, sep: string, letra: string) => sep + letra.toUpperCase());
