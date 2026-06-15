export function getPeriodoActual(): number {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const periodos = [
    { numero: 1, inicio: new Date(y, 0, 19), fin: new Date(y, 2, 29) },
    { numero: 2, inicio: new Date(y, 3, 6), fin: new Date(y, 5, 14) },
    { numero: 3, inicio: new Date(y, 6, 6), fin: new Date(y, 8, 13) },
    { numero: 4, inicio: new Date(y, 8, 14), fin: new Date(y, 10, 29) },
  ];
  // 1) Si hoy cae DENTRO de un periodo, ese es el activo.
  for (const p of periodos) {
    if (hoy >= p.inicio && hoy <= p.fin) return p.numero;
  }
  // 2) Si estamos en un RECESO (entre periodos, ej. vacaciones tras el 2º),
  //    NO saltar al siguiente: quedarse en el ÚLTIMO periodo que YA empezó,
  //    hasta que el próximo arranque de verdad.
  let ultimoIniciado = 0;
  for (const p of periodos) {
    if (hoy >= p.inicio) ultimoIniciado = p.numero;
  }
  if (ultimoIniciado > 0) return ultimoIniciado;
  // 3) Antes de que arranque el año escolar → primer periodo.
  return 1;
}
