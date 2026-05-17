import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NotaCompleta {
  id_estudiantil: string;
  asignatura: string;
  grado: string;
  salon: string;
  periodo: number;
  nombre_actividad: string;
  porcentaje: number | null;
  nota: number;
}

export interface EstudianteInfo {
  id_estudiantil: string;
  nombre_estudiante: string;
  apellidos_estudiante: string;
  grado_estudiante: string;
  salon_estudiante: string;
}

export interface PromedioEstudiante {
  id_estudiantil: string;
  nombre_completo: string;
  grado: string;
  salon: string;
  promedio: number;
  sumaPorcentajes: number; // Para determinar si hay suficientes datos
  cantidadActividades: number;
  promediosPorPeriodo: { [periodo: number]: number };
  promediosPorAsignatura: { [asignatura: string]: number };
}

export interface PromedioSalon {
  grado: string;
  salon: string;
  promedio: number;
  cantidadEstudiantes: number;
}

export interface PromedioGrado {
  grado: string;
  promedio: number;
  cantidadEstudiantes: number;
}

export interface PromedioAsignatura {
  asignatura: string;
  promedio: number;
  cantidadNotas: number;
}

export interface DistribucionDesempeno {
  bajo: number; // 0-2.9
  basico: number; // 3.0-3.9
  alto: number; // 4.0-4.5
  superior: number; // 4.6-5.0
}

// Ordenamiento de grados para visualización consistente
export const ordenGrados = [
  "Prejardín", "Jardín", "Transición",
  "Primero", "Segundo", "Tercero", "Cuarto", "Quinto",
  "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo", "Undécimo"
];

// Umbral mínimo de porcentaje para mostrar "Estudiantes en Riesgo"
// Solo se requiere que la suma de porcentajes sea >= 40% (sin mínimo de actividades)
// Para períodos individuales: 40% del período (100%)
// Para acumulado anual: 40% del año (400%) = 160%
const UMBRAL_PORCENTAJE_MINIMO = 40;
const UMBRAL_PORCENTAJE_ANUAL = 160; // 40% de 400% (4 períodos × 100%)

// Tipo para asignaciones expandidas
interface AsignacionExpandida {
  asignatura: string;
  grado: string;
  salon: string;
}

export const useEstadisticas = () => {
  const [loading, setLoading] = useState(true);
  const [notas, setNotas] = useState<NotaCompleta[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteInfo[]>([]);
  const [asignaturas, setAsignaturas] = useState<string[]>([]);
  const [grados, setGrados] = useState<string[]>([]);
  const [salones, setSalones] = useState<{ grado: string; salon: string }[]>([]);
  const [asignacionesExpandidas, setAsignacionesExpandidas] = useState<AsignacionExpandida[]>([]);

  // Función para normalizar texto (quitar tildes, espacios, minúsculas)
  const normalize = (str: string | null | undefined): string => {
    return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  // Función para obtener asignaturas filtradas por grado y salón (desde asignaciones)
  const getAsignaturasFiltradas = (grado?: string, salon?: string): string[] => {
    let asignacionesFiltradas = asignacionesExpandidas;
    
    if (grado && grado !== "all") {
      const gradoNorm = normalize(grado);
      asignacionesFiltradas = asignacionesFiltradas.filter(a => normalize(a.grado) === gradoNorm);
    }
    if (salon && salon !== "all") {
      const salonNorm = normalize(salon);
      asignacionesFiltradas = asignacionesFiltradas.filter(a => normalize(a.salon) === salonNorm);
    }

    const asignaturasUnicas = [...new Set(asignacionesFiltradas.map(a => a.asignatura))].sort();
    return asignaturasUnicas;
  };

  useEffect(() => {
    // Función para paginar consultas de Supabase (límite 1000 filas por request)
    async function fetchAllPages<T>(
      makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
    ): Promise<T[]> {
      const PAGE = 1000;
      let all: T[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await makeQuery(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // fetchAll(): el server pagina internamente y devuelve todo en una sola
        // respuesta HTTP. Antes hacíamos N round-trips desde el browser; con
        // 50k Notas eso eran ~15-20s. Ahora ~1s.
        // Solo columnas necesarias (no `*`) — reduce respuesta de ~12MB a ~3MB
        const { data: notasData, error: notasErr } = await (supabase as any)
          .from("Notas")
          .select("id_estudiantil,asignatura,grado,salon,periodo,nombre_actividad,porcentaje,nota")
          .not("nombre_actividad", "in", '("Definitiva Periodo","Definitiva Anual")')
          .fetchAll();
        if (notasErr) throw notasErr;
        setNotas(notasData || []);

        const { data: estudiantesData, error: estErr } = await (supabase as any)
          .from("Estudiantes")
          .select("id_estudiantil,nombre_estudiante,apellidos_estudiante,grado_estudiante,salon_estudiante")
          .order("apellidos_estudiante", { ascending: true })
          .fetchAll();
        if (estErr) throw estErr;
        setEstudiantes(estudiantesData || []);

        // Obtener asignaciones de profesores para extraer asignaturas por grado/salón
        const { data: asignacionesData, error: asignacionesError } = await supabase
          .from("Asignación Profesores")
          .select('"Asignatura(s)", "Grado(s)", "Salon(es)"');

        if (asignacionesError) {
          console.error("Error fetching asignaciones:", asignacionesError);
        }

        // Expandir asignaciones
        const expandidas: AsignacionExpandida[] = [];
        (asignacionesData || []).forEach((asig: any) => {
          const asignaturasArr = Array.isArray(asig["Asignatura(s)"]) ? asig["Asignatura(s)"] : [];
          const gradosArr = Array.isArray(asig["Grado(s)"]) ? asig["Grado(s)"] : [];
          const salonesArr = Array.isArray(asig["Salon(es)"]) ? asig["Salon(es)"] : [];

          if (asignaturasArr.length === 0 || gradosArr.length === 0 || salonesArr.length === 0) return;

          // Expandir: si misma longitud usar ZIP, si no, producto cartesiano
          if (asignaturasArr.length === gradosArr.length && gradosArr.length === salonesArr.length) {
            // ZIP
            for (let i = 0; i < asignaturasArr.length; i++) {
              expandidas.push({
                asignatura: asignaturasArr[i],
                grado: gradosArr[i],
                salon: salonesArr[i]
              });
            }
          } else {
            // Producto cartesiano
            for (const mat of asignaturasArr) {
              for (const grad of gradosArr) {
                for (const sal of salonesArr) {
                  expandidas.push({
                    asignatura: mat,
                    grado: grad,
                    salon: sal
                  });
                }
              }
            }
          }
        });
        setAsignacionesExpandidas(expandidas);

        // Extraer asignaturas únicas de asignaciones
        const asignaturasUnicas = [...new Set(expandidas.map(a => a.asignatura))].sort();
        setAsignaturas(asignaturasUnicas);

        // Extraer grados únicos y ordenarlos
        const gradosUnicos = [...new Set((estudiantesData || []).map(e => e.grado_estudiante))];
        const gradosOrdenados = gradosUnicos.sort((a, b) => 
          ordenGrados.indexOf(a) - ordenGrados.indexOf(b)
        );
        setGrados(gradosOrdenados);

        // Extraer combinaciones de grado-salón únicas
        const salonesUnicos: { grado: string; salon: string }[] = [];
        (estudiantesData || []).forEach(e => {
          if (!salonesUnicos.find(s => s.grado === e.grado_estudiante && s.salon === e.salon_estudiante)) {
            salonesUnicos.push({ grado: e.grado_estudiante, salon: e.salon_estudiante });
          }
        });
        setSalones(salonesUnicos);

      } catch (error) {
        console.error("Error fetching estadísticas data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  /**
   * Calcula el PROMEDIO RELATIVO PONDERADO
   * Solo considera actividades con porcentaje > 0
   * Fórmula: Σ(nota × porcentaje) / Σ(porcentajes)
   */
  const calcularPromedioRelativo = (
    notasFiltradas: NotaCompleta[]
  ): { promedio: number | null; sumaPorcentajes: number; cantidadActividades: number } => {
    const actividadesConPeso = notasFiltradas.filter(n => n.porcentaje && n.porcentaje > 0);
    
    if (actividadesConPeso.length === 0) {
      return { promedio: null, sumaPorcentajes: 0, cantidadActividades: 0 };
    }

    const sumaProductos = actividadesConPeso.reduce((sum, act) => 
      sum + (act.nota * (act.porcentaje || 0)), 0
    );

    const sumaPesos = actividadesConPeso.reduce((sum, act) => 
      sum + (act.porcentaje || 0), 0
    );

    const promedio = sumaPesos > 0 
      ? Math.round((sumaProductos / sumaPesos) * 100) / 100 
      : null;

    return { 
      promedio, 
      sumaPorcentajes: sumaPesos, 
      cantidadActividades: actividadesConPeso.length 
    };
  };

  // Calcular promedio de un estudiante por período usando promedio relativo
  const calcularPromedioPeriodo = (
    idEstudiantil: string,
    periodo: number,
    asignatura?: string,
    grado?: string,
    salon?: string
  ): { promedio: number | null; sumaPorcentajes: number; cantidadActividades: number } => {
    // Considerar "all" como sin filtro
    const gradoFiltro = grado && grado !== "all" ? grado : undefined;
    const salonFiltro = salon && salon !== "all" ? salon : undefined;
    
    let notasFiltradas = notas.filter(n => 
      n.id_estudiantil === idEstudiantil &&
      n.periodo === periodo
    );

    if (asignatura) notasFiltradas = notasFiltradas.filter(n => n.asignatura === asignatura);
    if (gradoFiltro) notasFiltradas = notasFiltradas.filter(n => n.grado === gradoFiltro);
    if (salonFiltro) notasFiltradas = notasFiltradas.filter(n => n.salon === salonFiltro);

    // Agrupar por asignatura y calcular promedio relativo de cada una
    const asignaturaGroups: { [key: string]: NotaCompleta[] } = {};
    notasFiltradas.forEach(n => {
      const key = n.asignatura;
      if (!asignaturaGroups[key]) asignaturaGroups[key] = [];
      asignaturaGroups[key].push(n);
    });

    const promediosAsignaturas: number[] = [];
    let sumaPorcentajesTotal = 0;
    let cantidadActividadesTotal = 0;

    Object.values(asignaturaGroups).forEach(notasAsignatura => {
      const resultado = calcularPromedioRelativo(notasAsignatura);
      if (resultado.promedio !== null) {
        promediosAsignaturas.push(resultado.promedio);
        sumaPorcentajesTotal += resultado.sumaPorcentajes;
        cantidadActividadesTotal += resultado.cantidadActividades;
      }
    });

    if (promediosAsignaturas.length === 0) {
      return { promedio: null, sumaPorcentajes: 0, cantidadActividades: 0 };
    }

    const promedio = Math.round((promediosAsignaturas.reduce((a, b) => a + b, 0) / promediosAsignaturas.length) * 100) / 100;
    return { promedio, sumaPorcentajes: sumaPorcentajesTotal, cantidadActividades: cantidadActividadesTotal };
  };

  // Calcular promedio general de un estudiante (acumulado anual)
  const calcularPromedioEstudiante = (idEstudiantil: string): { 
    promedio: number | null; 
    sumaPorcentajes: number; 
    cantidadActividades: number 
  } => {
    const promedios: number[] = [];
    let sumaPorcentajesTotal = 0;
    let cantidadActividadesTotal = 0;

    for (let periodo = 1; periodo <= 4; periodo++) {
      const resultado = calcularPromedioPeriodo(idEstudiantil, periodo);
      if (resultado.promedio !== null) {
        promedios.push(resultado.promedio);
        sumaPorcentajesTotal += resultado.sumaPorcentajes;
        cantidadActividadesTotal += resultado.cantidadActividades;
      }
    }

    if (promedios.length === 0) {
      return { promedio: null, sumaPorcentajes: 0, cantidadActividades: 0 };
    }

    return {
      promedio: Math.round((promedios.reduce((a, b) => a + b, 0) / promedios.length) * 100) / 100,
      sumaPorcentajes: sumaPorcentajesTotal,
      cantidadActividades: cantidadActividadesTotal
    };
  };

  // Obtener promedios de todos los estudiantes (solo incluye los que tienen notas)
  const getPromediosEstudiantes = (
    periodo?: number | "anual",
    grado?: string,
    salon?: string
  ): PromedioEstudiante[] => {
    // Considerar "all" como sin filtro
    const gradoFiltro = grado && grado !== "all" ? grado : undefined;
    const salonFiltro = salon && salon !== "all" ? salon : undefined;
    
    let estudiantesFiltrados = estudiantes;
    if (gradoFiltro) estudiantesFiltrados = estudiantesFiltrados.filter(e => e.grado_estudiante === gradoFiltro);
    if (salonFiltro) estudiantesFiltrados = estudiantesFiltrados.filter(e => e.salon_estudiante === salonFiltro);

    return estudiantesFiltrados.map(est => {
      const promediosPorPeriodo: { [periodo: number]: number } = {};
      for (let p = 1; p <= 4; p++) {
        const resultado = calcularPromedioPeriodo(est.id_estudiantil, p);
        if (resultado.promedio !== null) promediosPorPeriodo[p] = resultado.promedio;
      }

      // Promedios por asignatura con promedio relativo (filtrado por período)
      const promediosPorAsignatura: { [asignatura: string]: number } = {};
      const notasEstudiante = notas.filter(n =>
        n.id_estudiantil === est.id_estudiantil &&
        n.porcentaje !== null && n.porcentaje > 0 &&
        (periodo === "anual" || !periodo || n.periodo === periodo)
      );
      const asignaturasEstudiante = [...new Set(notasEstudiante.map(n => n.asignatura))];

      asignaturasEstudiante.forEach(mat => {
        const notasAsignatura = notasEstudiante.filter(n => n.asignatura === mat);
        const resultado = calcularPromedioRelativo(notasAsignatura);
        if (resultado.promedio !== null) {
          promediosPorAsignatura[mat] = resultado.promedio;
        }
      });

      let resultado: { promedio: number | null; sumaPorcentajes: number; cantidadActividades: number };
      if (periodo === "anual" || !periodo) {
        resultado = calcularPromedioEstudiante(est.id_estudiantil);
      } else {
        resultado = calcularPromedioPeriodo(est.id_estudiantil, periodo);
      }

      return {
        id_estudiantil: String(est.id_estudiantil),
        nombre_completo: `${est.apellidos_estudiante} ${est.nombre_estudiante}`,
        grado: est.grado_estudiante,
        salon: est.salon_estudiante,
        promedio: resultado.promedio || 0,
        sumaPorcentajes: resultado.sumaPorcentajes,
        cantidadActividades: resultado.cantidadActividades,
        promediosPorPeriodo,
        promediosPorAsignatura
      };
    }).filter(e => e.promedio > 0); // Solo incluir estudiantes con notas
  };

  // Promedios por salón (solo incluye salones con estudiantes que tienen notas)
  const getPromediosSalones = (
    periodo?: number | "anual",
    grado?: string
  ): PromedioSalon[] => {
    // Considerar "all" como sin filtro
    const gradoFiltro = grado && grado !== "all" ? grado : undefined;
    
    const salonesUnicos = gradoFiltro 
      ? salones.filter(s => s.grado === gradoFiltro)
      : salones;

    return salonesUnicos.map(s => {
      const promediosEst = getPromediosEstudiantes(periodo, s.grado, s.salon);
      const promedio = promediosEst.length > 0
        ? Math.round((promediosEst.reduce((a, e) => a + e.promedio, 0) / promediosEst.length) * 100) / 100
        : 0;

      return {
        grado: s.grado,
        salon: s.salon,
        promedio,
        cantidadEstudiantes: promediosEst.length
      };
    }).filter(s => s.promedio > 0); // Solo incluir salones con datos
  };

  // Promedios por grado (solo incluye grados con estudiantes que tienen notas)
  const getPromediosGrados = (periodo?: number | "anual"): PromedioGrado[] => {
    return grados.map(grado => {
      const promediosEst = getPromediosEstudiantes(periodo, grado);
      const promedio = promediosEst.length > 0
        ? Math.round((promediosEst.reduce((a, e) => a + e.promedio, 0) / promediosEst.length) * 100) / 100
        : 0;

      return {
        grado,
        promedio,
        cantidadEstudiantes: promediosEst.length
      };
    }).filter(g => g.promedio > 0); // Solo incluir grados con datos
  };

  // Promedios por asignatura usando promedio relativo
  const getPromediosAsignaturas = (
    periodo?: number | "anual",
    grado?: string,
    salon?: string
  ): PromedioAsignatura[] => {
    // Considerar "all" como sin filtro
    const gradoFiltro = grado && grado !== "all" ? grado : undefined;
    const salonFiltro = salon && salon !== "all" ? salon : undefined;

    const asignaturasFiltradas = [...new Set(
      notas
        .filter(n => (!gradoFiltro || n.grado === gradoFiltro) && (!salonFiltro || n.salon === salonFiltro))
        .map(n => n.asignatura)
    )];

    return asignaturasFiltradas.map(asignatura => {
      let notasFiltradas = notas.filter(n =>
        n.asignatura === asignatura &&
        n.porcentaje !== null && n.porcentaje > 0
      );
      if (gradoFiltro) notasFiltradas = notasFiltradas.filter(n => n.grado === gradoFiltro);
      if (salonFiltro) notasFiltradas = notasFiltradas.filter(n => n.salon === salonFiltro);
      if (periodo && periodo !== "anual") {
        notasFiltradas = notasFiltradas.filter(n => n.periodo === periodo);
      }

      if (notasFiltradas.length === 0) return { asignatura, promedio: 0, cantidadNotas: 0 };

      // Calcular promedio relativo
      const resultado = calcularPromedioRelativo(notasFiltradas);

      return {
        asignatura,
        promedio: resultado.promedio || 0,
        cantidadNotas: notasFiltradas.length
      };
    }).filter(m => m.promedio > 0).sort((a, b) => b.promedio - a.promedio);
  };

  // Distribución de desempeño
  const getDistribucionDesempeno = (
    periodo?: number | "anual",
    grado?: string,
    salon?: string,
    asignatura?: string
  ): DistribucionDesempeno => {
    // Si hay asignatura específica, calcular distribución basada en promedios de esa asignatura
    if (asignatura) {
      const estudiantes = getPromediosEstudiantes(periodo, grado, salon);
      const estudiantesConAsignatura = estudiantes
        .map(e => ({ ...e, promedioAsignatura: e.promediosPorAsignatura?.[asignatura] || 0 }))
        .filter(e => e.promedioAsignatura > 0);

      return {
        bajo: estudiantesConAsignatura.filter(e => e.promedioAsignatura < 3.0).length,
        basico: estudiantesConAsignatura.filter(e => e.promedioAsignatura >= 3.0 && e.promedioAsignatura < 4.0).length,
        alto: estudiantesConAsignatura.filter(e => e.promedioAsignatura >= 4.0 && e.promedioAsignatura <= 4.5).length,
        superior: estudiantesConAsignatura.filter(e => e.promedioAsignatura > 4.5).length
      };
    }
    
    // Distribución general basada en promedios globales
    const promedios = getPromediosEstudiantes(periodo, grado, salon);
    
    return {
      bajo: promedios.filter(e => e.promedio < 3.0).length,
      basico: promedios.filter(e => e.promedio >= 3.0 && e.promedio < 4.0).length,
      alto: promedios.filter(e => e.promedio >= 4.0 && e.promedio <= 4.5).length,
      superior: promedios.filter(e => e.promedio > 4.5).length
    };
  };

  // Promedio institucional
  const getPromedioInstitucional = (periodo?: number | "anual"): number => {
    const promedios = getPromediosEstudiantes(periodo);
    if (promedios.length === 0) return 0;
    return Math.round((promedios.reduce((a, e) => a + e.promedio, 0) / promedios.length) * 100) / 100;
  };

  // Top estudiantes
  const getTopEstudiantes = (
    cantidad: number = 10,
    periodo?: number | "anual",
    grado?: string,
    salon?: string
  ): PromedioEstudiante[] => {
    return getPromediosEstudiantes(periodo, grado, salon)
      .sort((a, b) => {
        // Primero por promedio descendente
        if (b.promedio !== a.promedio) return b.promedio - a.promedio;
        // En caso de empate, ordenar alfabéticamente por nombre completo
        return a.nombre_completo.localeCompare(b.nombre_completo);
      })
      .slice(0, cantidad);
  };

  // Calcular umbral dinámico de riesgo para un estudiante basado en sus asignaturas asignadas
  // El umbral es 40% del total posible: (cantidadAsignaturas × 100%) por período, o (cantidadAsignaturas × 400%) anual
  const calcularUmbralRiesgoEstudiante = (grado: string, salon: string, periodo?: number | "anual"): number => {
    const asignaturasAsignadas = getAsignaturasFiltradas(grado, salon);
    const cantidadAsignaturas = asignaturasAsignadas.length;

    if (cantidadAsignaturas === 0) return UMBRAL_PORCENTAJE_MINIMO; // Fallback

    // Total posible: asignaturas × 100% por período, o asignaturas × 400% anual
    const totalPosible = periodo === "anual"
      ? cantidadAsignaturas * 400  // 4 períodos × 100% cada uno
      : cantidadAsignaturas * 100; // 1 período × 100%
    
    // Umbral = 40% del total posible
    return totalPosible * 0.4;
  };

  // Estudiantes en riesgo (solo si hay suficientes datos)
  // Ahora soporta filtro por asignatura específica y umbral dinámico por estudiante
  const getEstudiantesEnRiesgo = (
    periodo?: number | "anual",
    grado?: string,
    salon?: string,
    asignatura?: string
  ): PromedioEstudiante[] => {
    // Si hay filtro de asignatura, calcular riesgo solo para esa asignatura
    // Para asignatura específica: umbral es 40% de 100% (período) o 40% de 400% (anual) = 40 o 160
    if (asignatura) {
      const umbralAsignatura = periodo === "anual" ? UMBRAL_PORCENTAJE_ANUAL : UMBRAL_PORCENTAJE_MINIMO;
      const estudiantesConAsignatura = getPromediosEstudiantes(periodo, grado, salon);
      return estudiantesConAsignatura
        .filter(e => {
          const promedioAsignatura = e.promediosPorAsignatura?.[asignatura];
          if (promedioAsignatura === undefined) return false;

          // Calcular suma de porcentajes específica para la asignatura
          const notasAsignatura = notas.filter(n =>
            n.id_estudiantil === e.id_estudiantil &&
            n.asignatura === asignatura &&
            n.porcentaje !== null && n.porcentaje > 0 &&
            (periodo === "anual" || n.periodo === periodo)
          );
          const sumaPorcentajesAsignatura = notasAsignatura.reduce((sum, n) => sum + (n.porcentaje || 0), 0);

          return promedioAsignatura < 3.0 && sumaPorcentajesAsignatura >= umbralAsignatura;
        })
        .map(e => ({
          ...e,
          promedio: e.promediosPorAsignatura?.[asignatura] || 0
        }));
    }
    
    // Para análisis general (institucional, grado, salón): umbral dinámico por estudiante
    return getPromediosEstudiantes(periodo, grado, salon)
      .filter(e => {
        const umbralEstudiante = calcularUmbralRiesgoEstudiante(e.grado, e.salon, periodo);
        return e.promedio < 3.0 && e.sumaPorcentajes >= umbralEstudiante;
      });
  };

  // Verificar si hay suficientes datos para mostrar "Estudiantes en Riesgo"
  const tieneDatosSuficientesParaRiesgo = (
    periodo?: number | "anual",
    grado?: string,
    salon?: string
  ): boolean => {
    const promedios = getPromediosEstudiantes(periodo, grado, salon);
    // Verificar si al menos un estudiante tiene porcentajes >= su umbral dinámico
    return promedios.some(e => {
      const umbralEstudiante = calcularUmbralRiesgoEstudiante(e.grado, e.salon, periodo);
      return e.sumaPorcentajes >= umbralEstudiante;
    });
  };

  // Evolución por período
  const getEvolucionPeriodos = (
    tipo: "institucion" | "grado" | "salon",
    grado?: string,
    salon?: string
  ): { periodo: string; promedio: number }[] => {
    const periodos = [
      { numero: 1, nombre: "Período 1" },
      { numero: 2, nombre: "Período 2" },
      { numero: 3, nombre: "Período 3" },
      { numero: 4, nombre: "Período 4" }
    ];

    return periodos.map(p => {
      let promedio: number;
      if (tipo === "institucion") {
        promedio = getPromedioInstitucional(p.numero);
      } else if (tipo === "grado" && grado) {
        const promedios = getPromediosEstudiantes(p.numero, grado);
        promedio = promedios.length > 0
          ? Math.round((promedios.reduce((a, e) => a + e.promedio, 0) / promedios.length) * 100) / 100
          : 0;
      } else if (tipo === "salon" && grado && salon) {
        const promedios = getPromediosEstudiantes(p.numero, grado, salon);
        promedio = promedios.length > 0
          ? Math.round((promedios.reduce((a, e) => a + e.promedio, 0) / promedios.length) * 100) / 100
          : 0;
      } else {
        promedio = 0;
      }

      return {
        periodo: p.nombre,
        promedio
      };
    });
  };

  // Verificar completitud de un período/nivel
  interface DetalleIncompleto {
    tipo: "nota_faltante" | "porcentaje_incompleto";
    descripcion: string;
    asignatura?: string;
    estudiante?: string;
    actividad?: string;
  }

  const verificarCompletitud = (
    periodo: number | "anual",
    grado?: string,
    salon?: string,
    idEstudiante?: string,
    asignatura?: string
  ): { completo: boolean; detalles: DetalleIncompleto[] } => {
    const detalles: DetalleIncompleto[] = [];
    
    // Para cada estudiante, verificar que tiene 100% de porcentajes en todas sus asignaturas
    let estudiantesFiltrados = estudiantes;
    if (grado) estudiantesFiltrados = estudiantesFiltrados.filter(e => e.grado_estudiante === grado);
    if (salon) estudiantesFiltrados = estudiantesFiltrados.filter(e => e.salon_estudiante === salon);
    if (idEstudiante) estudiantesFiltrados = estudiantesFiltrados.filter(e => e.id_estudiantil === idEstudiante);

    const periodos = periodo === "anual" ? [1, 2, 3, 4] : [periodo];

    for (const est of estudiantesFiltrados) {
      const nombreCompleto = `${est.apellidos_estudiante} ${est.nombre_estudiante}`;
      
      // Obtener las asignaturas del estudiante
      const notasEstudiante = notas.filter(n => n.id_estudiantil === est.id_estudiantil);
      const asignaturasEstudiante = asignatura
        ? [asignatura]
        : [...new Set(notasEstudiante.map(n => n.asignatura))];

      for (const mat of asignaturasEstudiante) {
        for (const per of periodos) {
          // Obtener notas de este estudiante en esta asignatura y período
          const notasPeriodo = notasEstudiante.filter(n =>
            n.asignatura === mat &&
            n.periodo === per &&
            n.porcentaje !== null && n.porcentaje > 0
          );

          // Sumar porcentajes
          const sumaPorcentajes = notasPeriodo.reduce((sum, n) => sum + (n.porcentaje || 0), 0);

          if (sumaPorcentajes > 0 && sumaPorcentajes < 100) {
            detalles.push({
              tipo: "porcentaje_incompleto",
              descripcion: `${mat} (P${per}) - ${nombreCompleto}: ${Math.round(sumaPorcentajes)}% de actividades registradas, faltan ${100 - Math.round(sumaPorcentajes)}%`,
              asignatura: mat,
              estudiante: nombreCompleto
            });
          }
        }
      }

      // Limitar detalles para rendimiento
      if (detalles.length > 50) break;
    }

    return {
      completo: detalles.length === 0,
      detalles: detalles.slice(0, 50)
    };
  };

  return {
    loading,
    notas,
    estudiantes,
    asignaturas,
    grados,
    salones,
    getAsignaturasFiltradas,
    getPromediosEstudiantes,
    getPromediosSalones,
    getPromediosGrados,
    getPromediosAsignaturas,
    getDistribucionDesempeno,
    getPromedioInstitucional,
    getTopEstudiantes,
    getEstudiantesEnRiesgo,
    tieneDatosSuficientesParaRiesgo,
    getEvolucionPeriodos,
    calcularPromedioEstudiante,
    calcularPromedioPeriodo,
    calcularPromedioRelativo,
    verificarCompletitud
  };
};
