import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPeriodoActual } from "@/utils/periodoActual";
import { anoEscolarActual } from "@/utils/anoEscolar";
import ComentarioModalReadOnly from "@/components/notas/ComentarioModalReadOnly";
import { MessageSquareText } from "lucide-react";
import { promedioGeneral, esPeriodoCompleto, promedioDeGrupo, type NotaCalc, type GrupoCalc } from "@/lib/gradeCalculator";

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
}

interface GrupoLocal extends GrupoCalc {
  asignatura: string;
  periodo: number;
  nombre: string;
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

const ConsolidadoNotas = ({ idEstudiante, nombreEstudiante, apellidosEstudiante, grado, salon }: ConsolidadoNotasProps) => {
  const [asignaturas, setAsignaturas] = useState<string[]>([]);
  const [actividadesPorAsignatura, setActividadesPorAsignatura] = useState<ActividadesPorAsignatura>({});
  const [notas, setNotas] = useState<NotasEstudiante>({});
  const [comentarios, setComentarios] = useState<ComentariosEstudiante>({});
  // Periodo activo COMPARTIDO entre todas las asignaturas: cambiarlo en una
  // cambia la vista de todas (pedido del usuario).
  const [periodoGlobal, setPeriodoGlobal] = useState<number>(getPeriodoActual());
  // Grupos jerárquicos por asignatura. Si una (asignatura, periodo) tiene
  // grupos, calcularFinalPeriodo usa promedioGeneral con ellos.
  const [grupos, setGrupos] = useState<GrupoLocal[]>([]);
  // Mapeo actividadId → grupo_id (heredado de Nombre de Actividades)
  const [actividadGrupo, setActividadGrupo] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  // Profesor(es) por asignatura y estado "periodo completo" por (asignatura|periodo).
  const [profesoresPorAsignatura, setProfesoresPorAsignatura] = useState<Record<string, string>>({});
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

        // Nombre del/los profesor(es) por asignatura (desde Usuarios)
        const todosIds = Array.from(new Set(Object.values(idsPorAsignatura).flatMap((s) => Array.from(s))));
        const nombreById: Record<string, string> = {};
        if (todosIds.length > 0) {
          const { data: us } = await supabase.from('Usuarios').select('id, nombres, apellidos').in('id', todosIds);
          (us || []).forEach((u: any) => { nombreById[String(u.id)] = `${u.nombres || ''} ${u.apellidos || ''}`.trim(); });
        }
        const profesMap: Record<string, string> = {};
        Object.entries(idsPorAsignatura).forEach(([asig, ids]) => {
          const nombres = Array.from(ids).map((id) => nombreById[id]).filter(Boolean);
          if (nombres.length) profesMap[asig] = nombres.join(', ');
        });
        setProfesoresPorAsignatura(profesMap);

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
            });
          });
          setActividadesPorAsignatura(actividadesPorAsig);
          setActividadGrupo(mapActGrupo);
        }

        // Cargar Grupos_Notas para todas las asignaturas del aula del estudiante
        const { data: gruposData } = await supabase
          .from('Grupos_Notas')
          .select('id, nombre, asignatura, periodo, porcentaje, parent_id, orden')
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
    return (actividadesPorAsignatura[asignatura] || [])
      .filter(a => a.periodo === periodo && a.porcentaje !== null)
      .reduce((sum, a) => sum + (a.porcentaje || 0), 0);
  };

  const getPorcentajeCalificado = (asignatura: string, periodo: number) => {
    return (actividadesPorAsignatura[asignatura] || [])
      .filter(a => a.periodo === periodo && a.porcentaje !== null && a.porcentaje > 0)
      .filter(a => notas[asignatura]?.[periodo]?.[a.id] !== undefined)
      .reduce((sum, a) => sum + (a.porcentaje || 0), 0);
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

  // Promedio (visual) de un grupo/subgrupo para este estudiante.
  // ¿El periodo está objetivamente completo? (si no, la definitiva es provisional)
  const periodoCompletoParaAsig = (asignatura: string, periodo: number): boolean => {
    const acts = getActividadesPorPeriodo(asignatura, periodo);
    if (acts.length === 0) return false;
    const notasCalc: NotaCalc[] = acts.map(a => ({
      porcentaje: a.porcentaje,
      nota: notas[asignatura]?.[periodo]?.[a.id] !== undefined ? (notas[asignatura][periodo][a.id] as number) : null,
      grupo_id: a.grupo_id ?? actividadGrupo.get(`${asignatura}|${a.id}`) ?? null,
    }));
    const gruposPeriodo: GrupoCalc[] = grupos
      .filter(g => g.asignatura === asignatura && g.periodo === periodo)
      .map(g => ({ id: g.id, porcentaje: g.porcentaje, parent_id: g.parent_id }));
    return esPeriodoCompleto(notasCalc, gruposPeriodo);
  };

  // Render de la definitiva del periodo: muestra el valor en vivo y lo marca
  // "provisional" si el periodo aún no está completo.
  const renderDefinitivaPeriodo = (asignatura: string, periodo: number, claseValor: string) => {
    const nf = calcularFinalPeriodo(asignatura, periodo);
    if (nf === null) return <span className={claseValor}>—</span>;
    const prov = !periodoCompletoParaAsig(asignatura, periodo);
    if (!prov) return <span className={claseValor}>{nf.toFixed(1)}</span>;
    return (
      <span className={claseValor} title="Provisional — el periodo aún no está completo">
        {nf.toFixed(1)} <span className="text-[10px] font-normal text-muted-foreground">prov.</span>
      </span>
    );
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
    // Periodo compartido: cambiar en una asignatura cambia todas.
    setPeriodoGlobal(periodo);
  };

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
      <div className="bg-card rounded-lg shadow-soft p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">
            {apellidosEstudiante} {nombreEstudiante}
          </h2>
          <p className="text-muted-foreground">
            ID: {idEstudiante} | {grado} - {salon}
          </p>
        </div>
      </div>

      {/* Tabla por cada asignatura */}
      {asignaturas.map((asignatura) => {
        const periodoActivo = periodoGlobal;
        const actividadesDelPeriodo = getActividadesPorPeriodo(asignatura, periodoActivo);
        const finalDefinitiva = calcularFinalDefinitiva(asignatura);

        return (
          <div key={asignatura} className="bg-card rounded-lg shadow-soft overflow-hidden">
            {/* Header de la asignatura */}
            <div className="bg-primary/10 p-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-foreground">{asignatura}</h3>
                {profesoresPorAsignatura[asignatura] && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {profesoresPorAsignatura[asignatura].includes(',') ? 'Profesores(as): ' : 'Profesor(a): '}
                    {profesoresPorAsignatura[asignatura]}
                  </p>
                )}
              </div>
              {(periodosCompletos[`${asignatura}|${periodoActivo}`] || getPorcentajeUsado(asignatura, periodoActivo) === 100) ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold whitespace-nowrap">
                  ✓ Periodo completo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium whitespace-nowrap">
                  Periodo no completo
                </span>
              )}
            </div>

            {/* Tabs de períodos */}
            <div className="flex border-b border-border">
              {periodos.map((periodo) => {
                const isActive = periodoActivo === periodo.numero;
                const porcentaje = getPorcentajeUsado(asignatura, periodo.numero);
                return (
                  <button
                    key={periodo.numero}
                    onClick={() => handleChangePeriodo(asignatura, periodo.numero)}
                    className={`flex-1 px-2 py-2 text-xs font-medium transition-colors relative
                      ${isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                  >
                    {periodo.nombre} ({porcentaje}%)
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-foreground" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Contenido del período */}
            <div className="overflow-x-auto">
              {actividadesDelPeriodo.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No hay actividades registradas en este período
                </div>
              ) : (() => {
                // Detectar si el período usa jerarquía (algún grupo definido)
                const gruposPeriodo = grupos
                  .filter(g => g.asignatura === asignatura && g.periodo === periodoActivo)
                  .sort((a, b) => (a as any).parent_id ? 1 : -1);
                const top = gruposPeriodo.filter(g => g.parent_id === null);

                if (top.length === 0) {
                  // Modo plano clásico (sin cambios)
                  return (
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/50">
                          {actividadesDelPeriodo.map((actividad) => (
                            <th key={actividad.id} className="p-2 text-center text-xs font-medium border-r border-b border-border min-w-[100px]">
                              <div className="truncate" title={actividad.nombre}>{actividad.nombre}</div>
                              {actividad.porcentaje !== null && <div className="text-muted-foreground text-xs">({actividad.porcentaje}%)</div>}
                            </th>
                          ))}
                          <th className="p-2 text-center text-xs font-semibold border-b border-border min-w-[100px] bg-primary/10">
                            <div>Definitiva Periodo</div>
                            <div className="text-muted-foreground text-xs font-normal">({getPorcentajeCalificado(asignatura, periodoActivo)}%)</div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {actividadesDelPeriodo.map((actividad) => {
                            const nota = notas[asignatura]?.[periodoActivo]?.[actividad.id];
                            const comentario = comentarios[asignatura]?.[periodoActivo]?.[actividad.id];
                            return (
                              <td key={actividad.id} className="p-2 text-center text-sm border-r border-b border-border">
                                <div className="inline-flex items-center justify-center gap-1">
                                  <span>{nota !== undefined ? nota.toFixed(2) : '—'}</span>
                                  {comentario && (
                                    <button type="button" onClick={() => setComentarioAbierto({ nombreActividad: actividad.nombre, comentario })} className="text-primary hover:text-primary/80" title="Ver comentario del profesor" aria-label="Ver comentario del profesor">
                                      <MessageSquareText className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="p-2 text-center text-sm font-semibold border-b border-border bg-primary/5">
                            {renderDefinitivaPeriodo(asignatura, periodoActivo, "")}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  );
                }

                // Modo jerárquico: bloques por grupo
                return (
                  <div className="p-4 space-y-3">
                    {top.map((g) => {
                      const subgrupos = gruposPeriodo.filter((sg) => sg.parent_id === g.id);
                      const actsDirectas = actividadesDelPeriodo.filter(a => a.grupo_id === g.id || (a.grupo_id == null && subgrupos.length === 0));
                      const renderActFila = (act: Actividad) => {
                        const nota = notas[asignatura]?.[periodoActivo]?.[act.id];
                        const comentario = comentarios[asignatura]?.[periodoActivo]?.[act.id];
                        return (
                          <div key={act.id} className="flex items-center justify-between py-1 text-sm border-b border-border/30 last:border-b-0">
                            <span className="truncate flex-1">{act.nombre}{act.porcentaje !== null ? ` (${act.porcentaje}%)` : ''}</span>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{nota !== undefined ? nota.toFixed(2) : '—'}</span>
                              {comentario && (
                                <button type="button" onClick={() => setComentarioAbierto({ nombreActividad: act.nombre, comentario })} className="text-primary hover:text-primary/80" aria-label="Ver comentario">
                                  <MessageSquareText className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      };
                      return (
                        <div key={g.id} className="border border-border rounded bg-muted/20">
                          <div className="px-3 py-1.5 bg-primary/10 font-semibold text-sm flex items-center justify-between">
                            <span>{(g as any).nombre || ''} <span className="text-muted-foreground font-normal">({g.porcentaje}%)</span></span>
                          </div>
                          <div className="px-3 py-1">
                            {actsDirectas.map(renderActFila)}
                            {subgrupos.map((sg) => {
                              const actsSub = actividadesDelPeriodo.filter(a => a.grupo_id === sg.id);
                              if (actsSub.length === 0) return null;
                              return (
                                <div key={sg.id} className="ml-3 mt-1.5 border-l-2 border-primary/30 pl-3">
                                  <div className="text-xs font-medium text-muted-foreground py-1 flex items-center justify-between">
                                    <span>{(sg as any).nombre || ''} ({sg.porcentaje}% del grupo padre)</span>
                                  </div>
                                  {actsSub.map(renderActFila)}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {/* Notas sueltas sin grupo */}
                    {actividadesDelPeriodo.filter(a => !a.grupo_id).length > 0 && (
                      <div className="border border-dashed border-border rounded p-3">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Otras actividades</div>
                        {actividadesDelPeriodo.filter(a => !a.grupo_id).map((act) => {
                          const nota = notas[asignatura]?.[periodoActivo]?.[act.id];
                          return (
                            <div key={act.id} className="flex items-center justify-between py-1 text-sm">
                              <span>{act.nombre}{act.porcentaje !== null ? ` (${act.porcentaje}%)` : ''}</span>
                              <span className="font-medium">{nota !== undefined ? nota.toFixed(2) : '—'}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Definitiva */}
                    <div className="bg-primary/10 px-3 py-2 rounded flex items-center justify-between">
                      <span className="font-bold text-sm">Definitiva Periodo</span>
                      {renderDefinitivaPeriodo(asignatura, periodoActivo, "font-bold text-lg")}
                    </div>
                  </div>
                );
              })()}
            </div>
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
