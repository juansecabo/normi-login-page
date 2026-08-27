import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getPeriodoActual } from "@/utils/periodoActual";
import { anoEscolarActual } from "@/utils/anoEscolar";
import ComentarioModalReadOnly from "@/components/notas/ComentarioModalReadOnly";
import SistemaEvaluacion from "@/components/notas/SistemaEvaluacion";
import { MessageSquareText, ChevronDown } from "lucide-react";
import { promedioGeneral, promedioDeGrupo, type NotaCalc, type GrupoCalc } from "@/lib/gradeCalculator";
import { useColegioConfig } from "@/hooks/useColegioConfig";
import { isEstudiante, isPadreDeFamilia } from "@/hooks/useSession";

interface ConsolidadoNotasProps {
  idEstudiante: string;
  nombreEstudiante: string;
  apellidosEstudiante: string;
  grado: string;
  salon: string;
}

interface Actividad {
  id: string;
  periodo: number;
  nombre: string;
  porcentaje: number | null;
  asignatura: string;
  grupo_id?: string | null;
  orden?: number | null;
  fecha_creacion?: string;
}

interface GrupoLocal extends GrupoCalc {
  asignatura: string;
  periodo: number;
  nombre: string;
  orden: number | null;
  fecha_creacion?: string;
}

type NotasEstudiante = {
  [asignatura: string]: {
    [periodo: number]: {
      [actividadId: string]: number;
    };
  };
};

type ComentariosEstudiante = {
  [asignatura: string]: {
    [periodo: number]: {
      [actividadId: string]: string;
    };
  };
};

type ActividadesPorAsignatura = {
  [asignatura: string]: Actividad[];
};

type PeriodosActivos = {
  [asignatura: string]: number;
};

const periodos = [
  { numero: 1, nombre: "1°" },
  { numero: 2, nombre: "2°" },
  { numero: 3, nombre: "3°" },
  { numero: 4, nombre: "4°" },
];

// Posición en el nivel superior de la tabla del profesor = fecha_creacion (UTC).
// Mismo criterio que TablaNotas: grupos y actividades sueltas se intercalan por
// fecha, para que el orden aquí sea idéntico al que ve el profesor.
const parseFechaUTC = (f?: string): number => {
  if (!f) return 0;
  let s = String(f).trim().replace(' ', 'T');
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
  const t = Date.parse(s);
  return isNaN(t) ? 0 : t;
};

const ConsolidadoNotas = ({ idEstudiante, nombreEstudiante, apellidosEstudiante, grado, salon }: ConsolidadoNotasProps) => {
  // Colegios con `ocultar_definitivas` (ej. Pestalozziano): NO se muestra la
  // definitiva del periodo — su cálculo no coincide con la plataforma oficial.
  const { config } = useColegioConfig();
  // Solo se oculta a las FAMILIAS (estudiante/acudiente). El personal (rector,
  // coordinador, director de grupo) sí ve el consolidado de definitivas.
  const ocultarDef = !!(config as any).ocultar_definitivas && (isEstudiante() || isPadreDeFamilia());
  const [asignaturas, setAsignaturas] = useState<string[]>([]);
  const [actividadesPorAsignatura, setActividadesPorAsignatura] = useState<ActividadesPorAsignatura>({});
  const [notas, setNotas] = useState<NotasEstudiante>({});
  const [comentarios, setComentarios] = useState<ComentariosEstudiante>({});
  // Periodo elegido vive en la URL (?periodo=1..4) para que persista al
  // refrescar y se vea en el breadcrumb. Si no hay periodo válido en la URL,
  // se muestra la pantalla "Elige el periodo" antes de las notas.
  const [searchParams, setSearchParams] = useSearchParams();
  const periodoParam = searchParams.get("periodo");
  const periodoElegido = periodoParam && /^[1-4]$/.test(periodoParam) ? Number(periodoParam) : null;
  const setPeriodo = (n: number) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("periodo", String(n));
      return p;
    });
  };
  // Periodo activo COMPARTIDO entre todas las asignaturas: cambiarlo en una
  // cambia la vista de todas (pedido del usuario).
  // Periodo activo para el render (ya elegido). Si por algún motivo no hay,
  // cae en 1 (no debería: el gate de abajo exige elegirlo antes).
  const periodoGlobal = periodoElegido ?? 1;
  // Grupos jerárquicos por asignatura. Si una (asignatura, periodo) tiene
  // grupos, calcularFinalPeriodo usa promedioGeneral con ellos.
  const [grupos, setGrupos] = useState<GrupoLocal[]>([]);
  // Mapeo actividadId → grupo_id (heredado de Nombre de Actividades)
  const [actividadGrupo, setActividadGrupo] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  // Profesor(es) por asignatura y estado "periodo completo" por (asignatura|periodo).
  const [profesoresPorAsignatura, setProfesoresPorAsignatura] = useState<Record<string, string>>({});
  const [profLabelPorAsignatura, setProfLabelPorAsignatura] = useState<Record<string, string>>({});
  // Acordeón: asignaturas abiertas (varias a la vez). Click en el encabezado
  // abre/cierra; abrir una no cierra las demás.
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const toggleAsignatura = (asig: string) =>
    setAbiertas((prev) => { const n = new Set(prev); n.has(asig) ? n.delete(asig) : n.add(asig); return n; });
  const [periodosCompletos, setPeriodosCompletos] = useState<Record<string, boolean>>({});
  // Modal de comentario en modo solo lectura para estudiantes y acudientes.
  const [comentarioAbierto, setComentarioAbierto] = useState<{
    nombreActividad: string;
    comentario: string;
  } | null>(null);

  useEffect(() => {
    if (!idEstudiante || !grado || !salon) {
      setLoading(false);
      return;
    }

    const cargarDatos = async () => {
      setLoading(true);
      try {
        // Obtener asignaturas del grado/salón
        const { data: asignaciones, error: asignacionesError } = await supabase
          .from('Asignación Profesores')
          .select('id, "Asignatura(s)", "Grado(s)", "Salon(es)"');

        if (asignacionesError) {
          console.error('Error fetching asignaciones:', asignacionesError);
          setLoading(false);
          return;
        }

        const asignaturasDelGrado: string[] = [];
        const idsPorAsignatura: Record<string, Set<string>> = {};
        asignaciones?.forEach((asignacion: any) => {
          const grados = asignacion['Grado(s)'] || [];
          const salones = asignacion['Salon(es)'] || [];
          const asignaturasAsig = asignacion['Asignatura(s)'] || [];

          if (grados.includes(grado) && salones.includes(salon)) {
            asignaturasAsig.forEach((asignatura: string) => {
              if (!asignaturasDelGrado.includes(asignatura)) {
                asignaturasDelGrado.push(asignatura);
              }
              if (!idsPorAsignatura[asignatura]) idsPorAsignatura[asignatura] = new Set();
              if (asignacion.id) idsPorAsignatura[asignatura].add(String(asignacion.id));
            });
          }
        });

        asignaturasDelGrado.sort((a, b) => a.localeCompare(b, 'es'));
        setAsignaturas(asignaturasDelGrado);

        // Nombre y género del/los profesor(es) por asignatura (desde Usuarios)
        const todosIds = Array.from(new Set(Object.values(idsPorAsignatura).flatMap((s) => Array.from(s))));
        const nombreById: Record<string, string> = {};
        const generoById: Record<string, string> = {};
        if (todosIds.length > 0) {
          const { data: us } = await supabase.from('Usuarios').select('id, nombres, apellidos, genero').in('id', todosIds);
          (us || []).forEach((u: any) => {
            nombreById[String(u.id)] = `${u.nombres || ''} ${u.apellidos || ''}`.trim();
            generoById[String(u.id)] = (u.genero as string) || '';
          });
        }
        const profesMap: Record<string, string> = {};
        const labelMap: Record<string, string> = {};
        Object.entries(idsPorAsignatura).forEach(([asig, ids]) => {
          const idArr = Array.from(ids);
          const nombres = idArr.map((id) => nombreById[id]).filter(Boolean);
          if (nombres.length) {
            profesMap[asig] = nombres.join(', ');
            // Etiqueta según género del único profe: F→Profesora, M→Profesor, y si
            // NO hay género registrado, neutro "Profesor(a):" (no asumir masculino).
            const gprof = generoById[idArr[0]];
            labelMap[asig] = nombres.length > 1
              ? 'Profesores(as):'
              : (gprof === 'F' ? 'Profesora:' : gprof === 'M' ? 'Profesor:' : 'Profesor(a):');
          }
        });
        setProfesoresPorAsignatura(profesMap);
        setProfLabelPorAsignatura(labelMap);

        // Estado "periodo completo" por (asignatura, periodo) — desde la BD
        const { data: pcData } = await supabase
          .from('Periodos_Completos')
          .select('asignatura, periodo, completo')
          .eq('grado', grado)
          .eq('salon', salon)
          .eq('ano_escolar', anoEscolarActual());
        const pcMap: Record<string, boolean> = {};
        (pcData || []).forEach((pc: any) => { pcMap[`${pc.asignatura}|${pc.periodo}`] = !!pc.completo; });
        setPeriodosCompletos(pcMap);


        if (asignaturasDelGrado.length === 0) {
          setLoading(false);
          return;
        }

        // Obtener actividades
        const { data: actividadesData, error: actividadesError } = await supabase
          .from('Nombre de Actividades')
          .select('*')
          .eq('ano_escolar', anoEscolarActual())
          .eq('grado', grado)
          .eq('salon', salon)
          .in('asignatura', asignaturasDelGrado)
          .order('fecha_creacion', { ascending: true });

        if (!actividadesError && actividadesData) {
          const actividadesPorAsig: ActividadesPorAsignatura = {};
          const mapActGrupo = new Map<string, string | null>();
          actividadesData.forEach((act) => {
            const actId = `${act.periodo}-${act.nombre_actividad}`;
            mapActGrupo.set(`${act.asignatura}|${actId}`, act.grupo_id ?? null);
            if (!actividadesPorAsig[act.asignatura]) {
              actividadesPorAsig[act.asignatura] = [];
            }
            actividadesPorAsig[act.asignatura].push({
              id: actId,
              periodo: act.periodo,
              nombre: act.nombre_actividad,
              porcentaje: act.porcentaje,
              asignatura: act.asignatura,
              grupo_id: act.grupo_id ?? null,
              orden: act.orden ?? null,
              fecha_creacion: act.fecha_creacion ?? undefined,
            });
          });
          setActividadesPorAsignatura(actividadesPorAsig);
          setActividadGrupo(mapActGrupo);
        }

        // Cargar Grupos_Notas para todas las asignaturas del aula del estudiante
        const { data: gruposData } = await supabase
          .from('Grupos_Notas')
          .select('id, nombre, asignatura, periodo, porcentaje, parent_id, orden, fecha_creacion')
          .eq('ano_escolar', anoEscolarActual())
          .eq('grado', grado)
          .eq('salon', salon)
          .in('asignatura', asignaturasDelGrado)
          .order('orden');
        if (gruposData) {
          setGrupos(gruposData.map((g: any) => ({
            id: g.id,
            nombre: g.nombre,
            asignatura: g.asignatura,
            periodo: g.periodo,
            porcentaje: Number(g.porcentaje),
            parent_id: g.parent_id,
            orden: g.orden ?? null,
            fecha_creacion: g.fecha_creacion ?? undefined,
          })));
        }

        // Obtener notas del estudiante
        const { data: notasData, error: notasError } = await supabase
          .from('Notas')
          .select('*')
          .eq('ano_escolar', anoEscolarActual())
          .eq('id_estudiantil', idEstudiante)
          .eq('grado', grado)
          .eq('salon', salon)
          .in('asignatura', asignaturasDelGrado);

        if (!notasError && notasData) {
          const notasFormateadas: NotasEstudiante = {};
          const comentariosFormateados: ComentariosEstudiante = {};
          notasData.forEach((nota) => {
            const { asignatura, periodo, nombre_actividad, nota: valorNota, comentario } = nota;
            if (nombre_actividad === "Definitiva Anual" || nombre_actividad === "Definitiva Periodo") return;

            const actividadId = `${periodo}-${nombre_actividad}`;
            if (!notasFormateadas[asignatura]) notasFormateadas[asignatura] = {};
            if (!notasFormateadas[asignatura][periodo]) notasFormateadas[asignatura][periodo] = {};
            notasFormateadas[asignatura][periodo][actividadId] = valorNota;

            if (comentario && String(comentario).trim()) {
              if (!comentariosFormateados[asignatura]) comentariosFormateados[asignatura] = {};
              if (!comentariosFormateados[asignatura][periodo]) comentariosFormateados[asignatura][periodo] = {};
              comentariosFormateados[asignatura][periodo][actividadId] = String(comentario);
            }
          });
          setNotas(notasFormateadas);
          setComentarios(comentariosFormateados);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, [idEstudiante, grado, salon]);

  const getActividadesPorPeriodo = (asignatura: string, periodo: number) => {
    return (actividadesPorAsignatura[asignatura] || []).filter(a => a.periodo === periodo);
  };

  const getPorcentajeUsado = (asignatura: string, periodo: number) => {
    // Modo grupos: el % del periodo lo aportan los grupos top, no las actividades.
    const tops = grupos.filter(g => g.asignatura === asignatura && g.periodo === periodo && g.parent_id === null);
    if (tops.length > 0) return tops.reduce((sum, g) => sum + (g.porcentaje || 0), 0);
    return (actividadesPorAsignatura[asignatura] || [])
      .filter(a => a.periodo === periodo && a.porcentaje !== null)
      .reduce((sum, a) => sum + (a.porcentaje || 0), 0);
  };

  // % calificado "de lo que va": cuánto del 100% del periodo ya tiene nota para
  // ESTE estudiante. Regla de pesos (la misma que define la definitiva):
  //  - Actividad suelta: su propio %.
  //  - Grupo SIN subgrupos: su %, repartido en partes iguales entre sus actividades.
  //  - Grupo CON subgrupos: el peso lo aportan los subgrupos (su %); el % del grupo
  //    padre es solo un tope. Una hoja (grupo/subgrupo) SIN actividades aporta 0
  //    (queda pendiente) → el periodo no llega al 100%.
  const getPorcentajeCalificado = (asignatura: string, periodo: number) => {
    const acts = getActividadesPorPeriodo(asignatura, periodo);
    const gid = (a: Actividad) => a.grupo_id ?? actividadGrupo.get(`${asignatura}|${a.id}`) ?? null;
    const tieneNota = (a: Actividad) => notas[asignatura]?.[periodo]?.[a.id] !== undefined;
    const gruposPeriodo = grupos.filter(g => g.asignatura === asignatura && g.periodo === periodo);
    const top = gruposPeriodo.filter(g => g.parent_id === null);

    // Hojas que aportan peso: los subgrupos (si el grupo tiene) o el propio grupo
    // (si no los tiene). El peso de la hoja es su propio %.
    const hojas: { id: string; peso: number }[] = [];
    for (const g of top) {
      const subs = gruposPeriodo.filter(s => s.parent_id === g.id);
      if (subs.length > 0) subs.forEach(s => hojas.push({ id: s.id, peso: s.porcentaje || 0 }));
      else hojas.push({ id: g.id, peso: g.porcentaje || 0 });
    }

    let calificado = 0;
    // Hojas de grupos: peso × (actividades calificadas / actividades totales).
    for (const h of hojas) {
      const actsHoja = acts.filter(a => gid(a) === h.id);
      if (actsHoja.length === 0) continue; // sin actividades → pendiente, no suma
      const cal = actsHoja.filter(tieneNota).length;
      calificado += h.peso * (cal / actsHoja.length);
    }
    // Actividades sueltas (sin grupo): cada una con su propio %.
    for (const a of acts) {
      if (gid(a) !== null) continue;
      if (a.porcentaje !== null && a.porcentaje > 0 && tieneNota(a)) calificado += a.porcentaje;
    }
    return calificado;
  };

  const calcularFinalPeriodo = (asignatura: string, periodo: number): number | null => {
    const actividadesDelPeriodo = getActividadesPorPeriodo(asignatura, periodo);
    if (actividadesDelPeriodo.length === 0) return null;

    const notasCalc: NotaCalc[] = actividadesDelPeriodo
      .filter(a => {
        if (notas[asignatura]?.[periodo]?.[a.id] === undefined) return false;
        const gid = a.grupo_id ?? actividadGrupo.get(`${asignatura}|${a.id}`) ?? null;
        // Cuenta si está en un grupo (el % lo aporta el grupo) o tiene % propio > 0.
        return gid !== null || (a.porcentaje !== null && a.porcentaje > 0);
      })
      .map(a => ({
        porcentaje: a.porcentaje,
        nota: notas[asignatura][periodo][a.id] as number,
        grupo_id: a.grupo_id ?? actividadGrupo.get(`${asignatura}|${a.id}`) ?? null,
      }));

    if (notasCalc.length === 0) return null;

    const gruposPeriodo: GrupoCalc[] = grupos
      .filter(g => g.asignatura === asignatura && g.periodo === periodo)
      .map(g => ({ id: g.id, porcentaje: g.porcentaje, parent_id: g.parent_id }));

    const res = promedioGeneral(notasCalc, gruposPeriodo);
    return res.promedio;
  };

  // ¿ESTE estudiante tiene TODAS las notas del periodo? Cuentan las actividades
  // que aportan peso: las que están en un grupo (el peso lo da el grupo) o las
  // sueltas con % > 0. Si le falta alguna, el periodo NO está completo PARA ÉL.
  const estudianteTieneTodasNotas = (asignatura: string, periodo: number): boolean => {
    const cuentan = getActividadesPorPeriodo(asignatura, periodo).filter(a => {
      const gid = a.grupo_id ?? actividadGrupo.get(`${asignatura}|${a.id}`) ?? null;
      return gid !== null || (a.porcentaje !== null && a.porcentaje > 0);
    });
    if (cuentan.length === 0) return false;
    return cuentan.every(a => notas[asignatura]?.[periodo]?.[a.id] !== undefined);
  };

  // ¿El periodo está completo PARA ESTE ESTUDIANTE? Dos condiciones:
  //  1) El profesor cerró el periodo (checkbox "Periodo completo"; en plano,
  //     además, las actividades suman 100% calificado).
  //  2) Este estudiante tiene TODAS las notas. Si le falta una, queda "pendiente"
  //     aunque el profesor haya marcado el periodo como completo.
  const periodoCompletoParaAsig = (asignatura: string, periodo: number): boolean => {
    // (1) El profesor debe haber marcado la casilla "Periodo completo" — en
    //     AMBOS modos (plano y grupos). El modo plano ya no se cierra solo por
    //     %-suma: el profe marca la casilla al llegar al 100%.
    if (!periodosCompletos[`${asignatura}|${periodo}`]) return false;
    // (2) Y este estudiante debe tener TODAS sus notas.
    return estudianteTieneTodasNotas(asignatura, periodo);
  };

  // Render de la definitiva del periodo para estudiante/acudiente.
  // El profesor debe CERRAR el periodo ("Periodo completo") para que se muestre
  // la nota definitiva. Mientras no esté cerrado NO se revela el valor (ni
  // siquiera provisional): solo un indicador "pendiente".
  const renderDefinitivaPeriodo = (asignatura: string, periodo: number, claseValor: string) => {
    if (!periodoCompletoParaAsig(asignatura, periodo)) {
      return (
        <span className={claseValor} title="La nota definitiva se mostrará cuando el profesor cierre el periodo">
          <span className="inline-flex flex-col items-center leading-tight">
            <span>—</span>
            <span className="text-[10px] font-normal text-muted-foreground">pendiente</span>
          </span>
        </span>
      );
    }
    const nf = calcularFinalPeriodo(asignatura, periodo);
    if (nf === null) return <span className={claseValor}>—</span>;
    return <span className={claseValor}>{nf.toFixed(1)}</span>;
  };

  const calcularFinalDefinitiva = (asignatura: string): number | null => {
    let suma = 0;
    let periodosConNota = 0;
    for (let periodo = 1; periodo <= 4; periodo++) {
      const finalPeriodo = calcularFinalPeriodo(asignatura, periodo);
      if (finalPeriodo !== null) {
        suma += finalPeriodo;
        periodosConNota++;
      }
    }
    if (periodosConNota === 0) return null;
    return Math.round((suma / periodosConNota) * 10) / 10;
  };

  const handleChangePeriodo = (_asignatura: string, periodo: number) => {
    // Periodo compartido: cambiar en una asignatura cambia todas (y la URL).
    setPeriodo(periodo);
  };

  // Contenido de una actividad (nombre + % propio de las sueltas + comentario | nota).
  const contenidoActividad = (asignatura: string, periodoActivo: number, act: Actividad) => {
    const nota = notas[asignatura]?.[periodoActivo]?.[act.id];
    const comentario = comentarios[asignatura]?.[periodoActivo]?.[act.id];
    return (
      <>
        <span className="text-sm text-foreground flex items-center gap-1.5 min-w-0">
          <span className="truncate">{act.nombre}</span>
          {/* Solo las actividades sueltas llevan % propio (las de grupo lo tienen
              en null porque su peso lo da el grupo) → se muestra cuando existe. */}
          {act.porcentaje !== null && act.porcentaje !== undefined && act.porcentaje > 0 && (
            <span className="text-xs font-normal text-muted-foreground shrink-0">({act.porcentaje}%)</span>
          )}
          {comentario && (
            <button type="button" onClick={() => setComentarioAbierto({ nombreActividad: act.nombre, comentario })} className="text-primary hover:text-primary/80 shrink-0" title="Ver comentario del profesor" aria-label="Ver comentario del profesor">
              <MessageSquareText className="w-4 h-4" />
            </button>
          )}
        </span>
        <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">{nota !== undefined ? Number(nota).toFixed(2) : '—'}</span>
      </>
    );
  };

  // Cuerpo vertical de una asignatura. Las líneas de árbol se dibujan con celdas
  // de guía: por cada nivel ancestro una celda con (o sin) línea vertical de paso,
  // y la celda propia con el codo. El ÚLTIMO hijo de su nivel cierra en "L" (su
  // vertical solo baja hasta el codo). NO cambia ningún cálculo, solo la interfaz.
  const renderCuerpoAsignatura = (asignatura: string, periodoActivo: number) => {
    const actividadesDelPeriodo = getActividadesPorPeriodo(asignatura, periodoActivo);
    if (actividadesDelPeriodo.length === 0) {
      return <div className="p-4 text-center text-muted-foreground text-sm">No hay actividades registradas en este período</div>;
    }
    const gid = (a: Actividad) => a.grupo_id ?? actividadGrupo.get(`${asignatura}|${a.id}`) ?? null;
    const porOrden = (a: { orden?: number | null }, b: { orden?: number | null }) => (a.orden ?? 0) - (b.orden ?? 0);
    const gruposPeriodo = grupos.filter(g => g.asignatura === asignatura && g.periodo === periodoActivo);
    const top = gruposPeriodo.filter(g => g.parent_id === null);
    const sueltas = actividadesDelPeriodo.filter(a => gid(a) === null);
    const filas: JSX.Element[] = [];
    let rk = 0;

    // Una fila del árbol: celdas de guía de ancestros + celda propia (codo + vertical) + contenido.
    // `guias[i]` = la línea del ancestro de nivel i sigue (tiene hermanos abajo).
    // `ultimo` = es el último hijo de su padre → su vertical termina en el codo (L).
    const filaArbol = (guias: boolean[], ultimo: boolean, inner: JSX.Element, contentCls: string) => {
      filas.push(
        <div key={`r-${rk++}`} className="flex items-stretch border-t border-border/50">
          {guias.map((draw, i) => (
            <span key={i} className="relative w-6 shrink-0">
              {draw && <span className="absolute left-3 top-0 bottom-0 w-px bg-border" />}
            </span>
          ))}
          <span className="relative w-6 shrink-0">
            <span className={`absolute left-3 top-0 w-px bg-border ${ultimo ? 'h-1/2' : 'bottom-0'}`} />
            <span className="absolute left-3 top-1/2 h-px w-3 bg-border" />
          </span>
          <div className={`flex-1 flex items-center justify-between gap-3 pr-4 ${contentCls}`}>{inner}</div>
        </div>
      );
    };

    // Pinta un grupo top: encabezado (banda full-width) + sus hijos colgando del árbol.
    const pintarGrupo = (g: GrupoLocal) => {
      filas.push(
        <div key={`g-${g.id}`} className="flex items-baseline gap-2 px-4 py-2 bg-secondary/70 border-t border-border">
          <span className="font-bold text-foreground">{g.nombre}</span>
          {g.porcentaje !== null && <span className="text-xs font-normal text-muted-foreground">({g.porcentaje}%)</span>}
        </div>
      );
      const acts = actividadesDelPeriodo.filter(a => gid(a) === g.id).sort(porOrden);
      const subs = gruposPeriodo.filter(sg => sg.parent_id === g.id).sort(porOrden);
      const hijos: Array<{ t: 'act'; a: Actividad } | { t: 'sub'; s: GrupoLocal }> = [
        ...acts.map(a => ({ t: 'act' as const, a })),
        ...subs.map(s => ({ t: 'sub' as const, s })),
      ];
      hijos.forEach((ch, idx) => {
        const ultimoHijo = idx === hijos.length - 1;
        if (ch.t === 'act') {
          filaArbol([], ultimoHijo, contenidoActividad(asignatura, periodoActivo, ch.a), 'items-center py-2');
        } else {
          const sg = ch.s;
          filaArbol(
            [], ultimoHijo,
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-sm font-semibold text-foreground/80 truncate">{sg.nombre}</span>
              {sg.porcentaje !== null && <span className="text-xs font-normal text-muted-foreground shrink-0">({sg.porcentaje}%)</span>}
            </span>,
            'items-baseline py-1.5 bg-secondary/30',
          );
          const subActs = actividadesDelPeriodo.filter(a => gid(a) === sg.id).sort(porOrden);
          subActs.forEach((a, j) => {
            // Guía del grupo: sigue si el subgrupo NO es el último hijo del grupo.
            filaArbol([!ultimoHijo], j === subActs.length - 1, contenidoActividad(asignatura, periodoActivo, a), 'items-center py-2');
          });
        }
      });
    };

    // Fila de actividad suelta de nivel superior (sin conector: no cuelga de ningún grupo).
    const filaSuelta = (a: Actividad) => {
      filas.push(
        <div key={`s-${rk++}`} className="px-4 py-2 flex items-center justify-between gap-3 border-t border-border/50">
          {contenidoActividad(asignatura, periodoActivo, a)}
        </div>
      );
    };

    // Nivel superior = grupos + actividades sueltas INTERCALADOS por fecha_creacion,
    // idéntico a la tabla del profesor: cada suelta cae en su posición real, no al final.
    const items: Array<{ fecha: number; render: () => void }> = top.length === 0
      ? [...actividadesDelPeriodo]
          .sort((a, b) => parseFechaUTC(a.fecha_creacion) - parseFechaUTC(b.fecha_creacion))
          .map(a => ({ fecha: parseFechaUTC(a.fecha_creacion), render: () => filaSuelta(a) }))
      : [
          ...top.map(g => ({ fecha: parseFechaUTC(g.fecha_creacion), render: () => pintarGrupo(g) })),
          ...sueltas.map(a => ({ fecha: parseFechaUTC(a.fecha_creacion), render: () => filaSuelta(a) })),
        ];
    items.sort((x, y) => x.fecha - y.fecha).forEach(it => it.render());

    // Definitiva del periodo: la fila SIEMPRE aparece. Si el periodo no está
    // completo para este estudiante, se muestra solo la rayita (la nota se
    // revela cuando el profesor cierra el periodo), tal como aparecía antes.
    const completo = periodoCompletoParaAsig(asignatura, periodoActivo);
    const nf = completo ? calcularFinalPeriodo(asignatura, periodoActivo) : null;
    if (!ocultarDef) {
      filas.push(
        <div key="def" className="flex items-center justify-between gap-3 px-4 py-2.5 border-t-2 border-border bg-primary/5">
          <span className="font-bold text-foreground">Definitiva del periodo</span>
          <span
            className="font-bold tabular-nums text-foreground"
            title={completo ? undefined : 'La nota definitiva se mostrará cuando el profesor cierre el periodo'}
          >
            {completo && nf !== null ? nf.toFixed(1) : '—'}
          </span>
        </div>
      );
    }

    return <div>{filas}</div>;
  };

  // Cabecera del estudiante (se muestra tanto en el selector como en las notas).
  const cabeceraEstudiante = (
    <div className="bg-card rounded-lg shadow-soft p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground">
          {apellidosEstudiante} {nombreEstudiante}
        </h2>
        <p className="text-muted-foreground">
          ID: {idEstudiante} | {grado} {salon}
        </p>
        <div className="mt-3 flex justify-center">
          <SistemaEvaluacion />
        </div>
      </div>
    </div>
  );

  // GATE: hay que elegir el periodo antes de ver las notas (como el profesor).
  if (periodoElegido === null) {
    return (
      <div className="space-y-6">
        {cabeceraEstudiante}
        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8">
          <h3 className="text-xl font-bold text-foreground mb-5 text-center">Elige el periodo:</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {periodos.map((p) => (
              <button
                key={p.numero}
                onClick={() => setPeriodo(p.numero)}
                className="p-6 rounded-lg border-2 border-border bg-background text-center hover:border-primary hover:bg-primary/10 transition-colors flex flex-col items-center gap-2 font-medium text-foreground"
              >
                <span className="text-2xl font-bold text-primary">{p.numero}°</span>
                <span>{["", "Primer", "Segundo", "Tercer", "Cuarto"][p.numero]} periodo</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Cargando notas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Información del estudiante */}
      {cabeceraEstudiante}

      {/* Barra de periodos: arriba de TODAS las asignaturas (cambia el periodo). */}
      {asignaturas.length > 0 && (
        <div className="bg-card rounded-lg shadow-soft p-2 flex flex-wrap gap-2">
          {periodos.map((p) => {
            const isActive = periodoGlobal === p.numero;
            return (
              <button
                key={p.numero}
                onClick={() => setPeriodo(p.numero)}
                className={`flex-1 min-w-[110px] px-3 py-2 rounded-md text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                {["", "1er Periodo", "2do Periodo", "3er Periodo", "4to Periodo"][p.numero]}
              </button>
            );
          })}
        </div>
      )}

      {/* Asignaturas como acordeón (varias abiertas a la vez). */}
      {asignaturas.map((asignatura) => {
        const periodoActivo = periodoGlobal;
        const abierta = abiertas.has(asignatura);
        const completo = periodoCompletoParaAsig(asignatura, periodoActivo);
        const pctCalif = Math.round(getPorcentajeCalificado(asignatura, periodoActivo));
        return (
          <div key={asignatura} className="bg-card rounded-lg shadow-soft border border-border overflow-hidden">
            <button
              type="button"
              data-guia="notas.asignatura_acordeon"
              onClick={() => toggleAsignatura(asignatura)}
              className="w-full text-left bg-primary/10 hover:bg-primary/15 transition-colors p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-foreground">{asignatura}</h3>
                {profesoresPorAsignatura[asignatura] && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {profLabelPorAsignatura[asignatura] || 'Profesor(a):'} {profesoresPorAsignatura[asignatura]}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* % calificado: en VERDE cuando el periodo está completo. La píldora de
                    estado solo se muestra en sm+ (en celular bastan el % y su color). */}
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${completo ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}
                  title={completo ? 'Periodo completo' : 'Porcentaje calificado hasta ahora'}
                >{pctCalif}%</span>
                {completo ? (
                  <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold whitespace-nowrap">✓ Periodo completo</span>
                ) : (
                  <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium whitespace-nowrap">Periodo no completo</span>
                )}
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${abierta ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {abierta && (
              <div className="border-t border-border">
                {renderCuerpoAsignatura(asignatura, periodoActivo)}
              </div>
            )}
          </div>
        );
      })}

      {asignaturas.length === 0 && (
        <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
          No hay asignaturas asignadas para este grado y salón
        </div>
      )}

      <ComentarioModalReadOnly
        open={!!comentarioAbierto}
        onOpenChange={(open) => { if (!open) setComentarioAbierto(null); }}
        nombreEstudiante={`${nombreEstudiante} ${apellidosEstudiante}`.trim()}
        nombreActividad={comentarioAbierto?.nombreActividad || ""}
        comentario={comentarioAbierto?.comentario || null}
      />
    </div>
  );
};

export default ConsolidadoNotas;
