/**
 * Calculador de notas final retrocompatible (frontend).
 *
 * Copia del módulo del backend (src/services/gradeCalculator.ts).
 * Ambos DEBEN mantenerse sincronizados — si cambia la fórmula, cambiarla
 * en los dos lugares y volver a correr el test de retrocompatibilidad.
 *
 * Soporta los tres modos:
 *  - plano (legacy): Σ(nota × %) / Σ(%)
 *  - jerárquico: recursivo por Grupos_Notas
 *  - mixto: notas planas + grupos top combinados en el período
 *
 * RETROCOMPATIBILIDAD GARANTIZADA: si grupos=[] y todas las notas tienen
 * grupo_id=null, promedioGeneral devuelve idéntico a promedioPlano.
 */

export interface NotaCalc {
  porcentaje: number | null;
  nota: number | null;
  grupo_id?: string | null;
}

export interface GrupoCalc {
  id: string;
  porcentaje: number;
  parent_id: string | null;
}

// Frontend usa 1 decimal (no 2 como el backend). Ver TablaNotas: redondeo
// a 1 decimal (Math.round(x*10)/10).
const r1 = (n: number): number => Math.round(n * 10) / 10;

export function promedioPlano(notas: NotaCalc[]): {
  promedio: number | null;
  sumaPorcentajes: number;
  cantidadActividades: number;
} {
  const conPeso = notas.filter((n) => n.porcentaje !== null && n.porcentaje > 0 && n.nota !== null);
  if (conPeso.length === 0) return { promedio: null, sumaPorcentajes: 0, cantidadActividades: 0 };
  const sumaProd = conPeso.reduce((s, n) => s + (n.nota as number) * (n.porcentaje || 0), 0);
  const sumaPesos = conPeso.reduce((s, n) => s + (n.porcentaje || 0), 0);
  return {
    promedio: sumaPesos > 0 ? r1(sumaProd / sumaPesos) : null,
    sumaPorcentajes: sumaPesos,
    cantidadActividades: conPeso.length,
  };
}

function notaDelGrupo(
  g: GrupoCalc,
  notas: NotaCalc[],
  grupos: GrupoCalc[],
): { nota: number | null; pesoTotal: number } {
  const subgrupos = grupos.filter((s) => s.parent_id === g.id);
  const notasDelGrupo = notas.filter((n) => n.grupo_id === g.id && n.porcentaje !== null && n.porcentaje > 0 && n.nota !== null);

  let sumaProd = 0;
  let sumaPesos = 0;

  for (const n of notasDelGrupo) {
    sumaProd += (n.nota as number) * (n.porcentaje as number);
    sumaPesos += n.porcentaje as number;
  }

  for (const sg of subgrupos) {
    const sub = notaDelGrupo(sg, notas, grupos);
    if (sub.nota !== null) {
      sumaProd += sub.nota * sg.porcentaje;
      sumaPesos += sg.porcentaje;
    }
  }

  if (sumaPesos === 0) return { nota: null, pesoTotal: 0 };
  return { nota: r1(sumaProd / sumaPesos), pesoTotal: sumaPesos };
}

export function promedioJerarquico(notas: NotaCalc[], grupos: GrupoCalc[]): {
  promedio: number | null;
  sumaPorcentajes: number;
} {
  const top = grupos.filter((g) => g.parent_id === null);
  let sumaProd = 0;
  let sumaPesos = 0;
  for (const g of top) {
    const res = notaDelGrupo(g, notas, grupos);
    if (res.nota !== null) {
      sumaProd += res.nota * g.porcentaje;
      sumaPesos += g.porcentaje;
    }
  }
  if (sumaPesos === 0) return { promedio: null, sumaPorcentajes: 0 };
  return { promedio: r1(sumaProd / sumaPesos), sumaPorcentajes: sumaPesos };
}

export function promedioGeneral(notas: NotaCalc[], grupos: GrupoCalc[] = []): {
  promedio: number | null;
  sumaPorcentajes: number;
  cantidadActividades: number;
  modo: 'plano' | 'jerarquico' | 'mixto';
} {
  const hayNotasEnGrupo = notas.some((n) => n.grupo_id !== null && n.grupo_id !== undefined);
  const hayGrupos = grupos.length > 0;

  if (!hayGrupos && !hayNotasEnGrupo) {
    const r = promedioPlano(notas);
    return { ...r, modo: 'plano' };
  }

  const notasSinGrupo = notas.filter((n) => !n.grupo_id);
  const notasEnGrupos = notas.filter((n) => n.grupo_id);
  const cantidadActividades = notas.filter((n) => n.nota !== null && n.porcentaje !== null && n.porcentaje > 0).length;

  if (notasSinGrupo.filter((n) => n.nota !== null && n.porcentaje !== null && n.porcentaje > 0).length === 0) {
    const r = promedioJerarquico(notasEnGrupos, grupos);
    return { ...r, cantidadActividades, modo: 'jerarquico' };
  }

  const top = grupos.filter((g) => g.parent_id === null);
  let sumaProd = 0;
  let sumaPesos = 0;

  for (const n of notasSinGrupo) {
    if (n.nota !== null && n.porcentaje !== null && n.porcentaje > 0) {
      sumaProd += (n.nota as number) * (n.porcentaje as number);
      sumaPesos += n.porcentaje as number;
    }
  }
  for (const g of top) {
    const res = notaDelGrupo(g, notasEnGrupos, grupos);
    if (res.nota !== null) {
      sumaProd += res.nota * g.porcentaje;
      sumaPesos += g.porcentaje;
    }
  }

  if (sumaPesos === 0) {
    return { promedio: null, sumaPorcentajes: 0, cantidadActividades, modo: 'mixto' };
  }
  return {
    promedio: r1(sumaProd / sumaPesos),
    sumaPorcentajes: sumaPesos,
    cantidadActividades,
    modo: 'mixto',
  };
}
