import { getPeriodoActual } from "@/utils/periodoActual";
import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, puedeAccederDashboard } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { useEstadisticasMeta } from "@/hooks/useEstadisticasApi";
import { supabase } from "@/integrations/supabase/client";
import { FiltrosEstadisticas } from "@/components/estadisticas/FiltrosEstadisticas";
import { useEsquemaGrado, unidadCorte, esquemasDelColegio, mapaEsquemaPorGrado, type EsquemaNivel, ESQUEMA_DEFAULT, corteActual } from "@/utils/esquema";
import { AnalisisInstitucional } from "@/components/estadisticas/AnalisisInstitucional";
import { AnalisisGrado } from "@/components/estadisticas/AnalisisGrado";
import { AnalisisSalon } from "@/components/estadisticas/AnalisisSalon";
import { AnalisisEstudiante } from "@/components/estadisticas/AnalisisEstudiante";
import { AnalisisAsignatura } from "@/components/estadisticas/AnalisisAsignatura";
import { Loader2 } from "lucide-react";

import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
const EstadisticasDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const meta = useEstadisticasMeta();
  const loading = meta.loading;

  // ── Grupos de niveles por esquema (Juan 2026-09-13) ──────────────────────
  // Si el colegio tiene niveles por periodos Y niveles por semestres, al entrar se
  // elige el grupo (ej. "Preescolar, Primaria, Secundaria y Media" o "Formación
  // Complementaria") y todo el tablero trabaja dentro de él. Con un solo esquema
  // no se pregunta nada.
  interface GrupoNiveles { key: string; esquema: string; nombre: string; detalle: string; esq: EsquemaNivel; niveles: string[] }
  const [grupos, setGrupos] = useState<GrupoNiveles[] | null>(null);
  const [esqPorGrado, setEsqPorGrado] = useState<Map<string, EsquemaNivel>>(new Map());
  useEffect(() => {
    Promise.all([esquemasDelColegio(), mapaEsquemaPorGrado()]).then(([esqs, mapa]) => {
      const porKey = new Map<string, GrupoNiveles>();
      for (const e of esqs) {
        const key = `${e.esquema}|${e.cortes.length}`;
        const g = porKey.get(key);
        if (g) g.niveles.push(e.nivel);
        else porKey.set(key, { key, esquema: e.esquema, nombre: "", detalle: `Por ${e.esquema} (${e.cortes.length} cortes)`, esq: e, niveles: [e.nivel] });
      }
      setGrupos([...porKey.values()]);
      setEsqPorGrado(mapa);
    }).catch(() => { setGrupos([]); });
  }, []);
  // Coordinador con niveles configurados: solo sus niveles (el servidor también filtra).
  const nivelesPermitidos = meta.nivelesPermitidos;
  const nombrarNiveles = (n: string[]) => (n.length > 1 ? `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}` : n[0] || "");
  const gruposVisibles = useMemo(() => {
    if (!grupos) return null;
    return grupos
      .map((g) => ({ ...g, niveles: nivelesPermitidos ? g.niveles.filter((n) => nivelesPermitidos.includes(n)) : g.niveles }))
      .filter((g) => g.niveles.length > 0)
      .map((g) => ({ ...g, nombre: nombrarNiveles(g.niveles) }));
  }, [grupos, nivelesPermitidos]);
  const hayGrupos = (gruposVisibles?.length || 0) > 1;
  const ambitoParam = searchParams.get("ambito") || "";
  const grupoSel = hayGrupos ? (gruposVisibles!.find((g) => g.esquema === ambitoParam) || null) : null;
  // Nombre del ámbito cuando no hay grupo elegido: "Institución" o los niveles del coordinador.
  const nombreAmbito = grupoSel ? grupoSel.nombre : (nivelesPermitidos ? nombrarNiveles(nivelesPermitidos) : "Institución");
  // Niveles del ámbito actual (grupo elegido ∩ niveles del coordinador), para ofrecer
  // "Todos" + cada nivel por separado en "Nivel de Análisis" (Juan 2026-09-13).
  const nivelesAmbito: string[] = grupoSel
    ? grupoSel.niveles
    : (nivelesPermitidos || (grupos || []).flatMap((g) => g.niveles));
  // Coordinador de un solo nivel: la primera opción se llama como su nivel y no hay lista de niveles.
  const etiquetaTodos = grupoSel
    ? (grupoSel.niveles.length === 1 ? grupoSel.niveles[0] : "Todos los niveles")
    : nivelesPermitidos
      ? (nivelesPermitidos.length === 1 ? nivelesPermitidos[0] : "Todos mis niveles")
      : "Institución";
  const opcionesNivelAnalisis = [
    { value: "institucion", label: etiquetaTodos },
    ...(nivelesAmbito.length > 1 ? nivelesAmbito.map((n) => ({ value: `nivel:${n}`, label: n })) : []),
    { value: "grado", label: "Por Grado" },
    { value: "salon", label: "Por Salón" },
    { value: "estudiante", label: "Por Estudiante" },
    { value: "asignatura", label: "Por Asignatura" },
  ];
  const elegirGrupo = (g: GrupoNiveles) => {
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set("ambito", g.esquema); p.delete("grado"); p.delete("salon"); p.delete("estudiante"); p.delete("asignatura"); return p; });
    setGradoSeleccionado(""); setSalonSeleccionado(""); setEstudianteSeleccionado(""); setAsignaturaSeleccionada("");
  };
  const volverAGrupos = () => {
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete("ambito"); return p; });
  };
  // Dentro de un grupo solo se ofrecen sus grados, salones y asignaturas.
  const enGrupo = (grado: string) => !grupoSel || (esqPorGrado.get(grado)?.esquema || "periodos") === grupoSel.esquema;
  const grados = meta.grados.filter(enGrupo);
  const salones = meta.salones.filter((s) => enGrupo(s.grado));
  const asignaciones = meta.asignaciones.filter((a) => enGrupo(a.grado));
  const asignaturas = grupoSel ? [...new Set(asignaciones.map((a) => a.asignatura))].sort() : meta.asignaturas;

  // Reemplazo local de getAsignaturasFiltradas — opera sobre el array de asignaciones del hook nuevo
  const normalize = (str: string | null | undefined): string =>
    String(str || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const getAsignaturasFiltradas = (grado?: string, salon?: string): string[] => {
    let filtradas = asignaciones;
    if (grado && grado !== "all") {
      const g = normalize(grado);
      filtradas = filtradas.filter((a) => normalize(a.grado) === g);
    }
    if (salon && salon !== "all") {
      const s = normalize(salon);
      filtradas = filtradas.filter((a) => normalize(a.salon) === s);
    }
    return [...new Set(filtradas.map((a) => a.asignatura))].sort();
  };
  
  // Leer filtros desde URL params (para restaurar estado al volver)
  const [nivelAnalisis, setNivelAnalisis] = useState(() => searchParams.get("nivel") || "institucion");
  // Opción 'nivel:X' del selector = análisis institucional acotado a ese nivel.
  const nivelColegioSel = nivelAnalisis.startsWith("nivel:") ? nivelAnalisis.slice(6) : undefined;
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState(() => searchParams.get("periodo") || String(getPeriodoActual()));
  const [gradoSeleccionado, setGradoSeleccionado] = useState(() => searchParams.get("grado") || "");
  const [salonSeleccionado, setSalonSeleccionado] = useState(() => searchParams.get("salon") || "");
  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState(() => searchParams.get("asignatura") || "");
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState(() => searchParams.get("estudiante") || "");

  useEffect(() => {
    const session = getSession();
    if (!session.id) {
      navigate("/");
      return;
    }
    if (!puedeAccederDashboard()) {
      navigate("/dashboard");
      return;
    }
  }, [navigate]);

  // Obtener asignaturas filtradas según grado y salón seleccionados
  const asignaturasFiltradas = useMemo(() => {
    // Si no hay grado seleccionado o es "all", mostrar todas las asignaturas
    if (!gradoSeleccionado || gradoSeleccionado === "all") {
      return asignaturas;
    }
    // Si hay grado pero no salón o es "all", filtrar solo por grado
    if (!salonSeleccionado || salonSeleccionado === "all") {
      return getAsignaturasFiltradas(gradoSeleccionado);
    }
    // Si hay grado y salón, filtrar por ambos
    return getAsignaturasFiltradas(gradoSeleccionado, salonSeleccionado);
  }, [gradoSeleccionado, salonSeleccionado, asignaturas, asignaciones]);

  // Obtener lista de estudiantes del salón seleccionado (query directa a Supabase)
  const [estudiantesDelSalon, setEstudiantesDelSalon] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    if (!gradoSeleccionado || !salonSeleccionado) {
      setEstudiantesDelSalon([]);
      return;
    }
    const fetchEstudiantes = async () => {
      // Fase 10.E.19: nombres/apellidos viven en Usuarios.
      const { data: raw } = await supabase
        .from('Estudiantes')
        .select('id')
        .eq('grado', gradoSeleccionado)
        .eq('salon', salonSeleccionado);
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const data = sortByApellidosNombres(await enrichWithNombres((raw || []) as any));
      setEstudiantesDelSalon(
        data.map((e: any) => ({
          id: String(e.id),
          nombre: `${e.apellidos} ${e.nombres}`
        }))
      );
    };
    fetchEstudiantes();
  }, [gradoSeleccionado, salonSeleccionado]);

  // Esquema del ámbito: el del grado elegido; en "Institución" el general por periodos
  // (los niveles por semestres quedan fuera y el servidor lo informa).
  const gradoAmbito = nivelAnalisis !== "institucion" && gradoSeleccionado && gradoSeleccionado !== "all" ? gradoSeleccionado : null;
  const esqGrado = useEsquemaGrado(gradoAmbito);
  // Sin grado: el esquema del grupo elegido (o el general por periodos).
  const esq = gradoAmbito ? esqGrado : (grupoSel ? { ...grupoSel.esq, ready: true } : { ...ESQUEMA_DEFAULT, ready: true });
  const unidad = unidadCorte(esq);
  const esquemaAmbito = grupoSel ? grupoSel.esquema : undefined;
  useEffect(() => {
    if (!esq.ready || periodoSeleccionado === "anual") return;
    if (parseInt(periodoSeleccionado) > esq.cortes.length) setPeriodoSeleccionado(String(corteActual(esq)));
  }, [esq.ready, esq.cortes.length, periodoSeleccionado]);

  const periodoNumerico = periodoSeleccionado === "anual"
    ? "anual" as const
    : parseInt(periodoSeleccionado);

  // Verificar si todos los filtros necesarios están seleccionados
  const filtrosCompletos = () => {
    if (nivelAnalisis === "institucion" || nivelAnalisis.startsWith("nivel:")) return true;
    if (nivelAnalisis === "grado") return gradoSeleccionado && gradoSeleccionado !== "";
    if (nivelAnalisis === "salon") return gradoSeleccionado && salonSeleccionado && salonSeleccionado !== "";
    if (nivelAnalisis === "estudiante") return gradoSeleccionado && salonSeleccionado && estudianteSeleccionado;
    if (nivelAnalisis === "asignatura") return asignaturaSeleccionada && asignaturaSeleccionada !== "";
    return false;
  };

  // Generar título dinámico basado en filtros
  const getTituloDinamico = () => {
    const periodoTexto = periodoSeleccionado === "anual" 
      ? "Acumulado Anual" 
      : `${unidad} ${periodoSeleccionado}`;
    
    if (nivelAnalisis === "institucion") {
      return `${nombreAmbito} - ${periodoTexto}`;
    }
    if (nivelColegioSel) {
      return `${nivelColegioSel} - ${periodoTexto}`;
    }
    
    if (nivelAnalisis === "grado") {
      const nombreGrado = gradoSeleccionado && gradoSeleccionado !== "all" 
        ? gradoSeleccionado 
        : "Todos los Grados";
      return `${nombreGrado} - ${periodoTexto}`;
    }
    
    if (nivelAnalisis === "salon") {
      const nombreGrado = gradoSeleccionado || "";
      const nombreSalon = salonSeleccionado && salonSeleccionado !== "all" 
        ? salonSeleccionado 
        : "";
      const salonCompleto = nombreSalon ? `${nombreGrado} ${nombreSalon}` : nombreGrado;
      return `${salonCompleto} - ${periodoTexto}`;
    }
    
    if (nivelAnalisis === "estudiante") {
      const estudiante = estudiantesDelSalon.find(e => e.id === estudianteSeleccionado);
      const nombreEstudiante = estudiante?.nombre || "Estudiante";
      return `${nombreEstudiante} - ${periodoTexto}`;
    }
    
    if (nivelAnalisis === "asignatura") {
      const nombreAsignatura = asignaturaSeleccionada || "Asignatura";
      const partes = [nombreAsignatura];
      
      if (gradoSeleccionado && gradoSeleccionado !== "all") {
        if (salonSeleccionado && salonSeleccionado !== "all") {
          partes.push(`${gradoSeleccionado} ${salonSeleccionado}`);
        } else {
          partes.push(gradoSeleccionado);
        }
      }
      
      partes.push(periodoTexto);
      return partes.join(" - ");
    }
    
    return periodoTexto;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            {grupoSel ? (
              <>
                <button onClick={volverAGrupos} className="text-primary hover:underline">Estadísticas</button>
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground font-medium">{grupoSel.nombre}</span>
              </>
            ) : (
              <span className="text-foreground font-medium">Estadísticas</span>
            )}
          </BreadcrumbDeslizable>
        </div>

        {loading || gruposVisibles === null ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Cargando datos...</span>
          </div>
        ) : hayGrupos && !grupoSel ? (
          /* El colegio evalúa con dos esquemas: primero se elige el grupo de niveles. */
          <div className="bg-card rounded-lg shadow-soft p-6 md:p-8">
            <h2 className="text-xl font-bold text-foreground mb-2 text-center">¿Qué quieres analizar?</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">Los niveles por periodos y los niveles por semestres se analizan por separado porque sus cortes no son comparables.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-guia="estadisticas.selector_grupo">
              {gruposVisibles!.map((g) => (
                <button key={g.key} onClick={() => elegirGrupo(g)}
                  className="p-6 rounded-lg border-2 border-border bg-background text-center transition-all duration-200 hover:shadow-md hover:border-primary hover:bg-primary/5 flex flex-col items-center gap-2">
                  <span className="text-lg font-semibold text-foreground">{g.nombre}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{g.detalle}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <FiltrosEstadisticas
              nivelAnalisis={nivelAnalisis}
              setNivelAnalisis={setNivelAnalisis}
              periodoSeleccionado={periodoSeleccionado}
              setPeriodoSeleccionado={setPeriodoSeleccionado}
              gradoSeleccionado={gradoSeleccionado}
              setGradoSeleccionado={setGradoSeleccionado}
              salonSeleccionado={salonSeleccionado}
              setSalonSeleccionado={setSalonSeleccionado}
              asignaturaSeleccionada={asignaturaSeleccionada}
              setAsignaturaSeleccionada={setAsignaturaSeleccionada}
              estudianteSeleccionado={estudianteSeleccionado}
              setEstudianteSeleccionado={setEstudianteSeleccionado}
              grados={grados}
              salones={salones}
              asignaturas={asignaturasFiltradas}
              estudiantes={estudiantesDelSalon}
              cortes={esq.cortes}
              unidad={unidad}
              nivelesDisponibles={opcionesNivelAnalisis}
            />

            {(nivelAnalisis === "institucion" || nivelColegioSel) && (
              <AnalisisInstitucional periodo={periodoNumerico} titulo={getTituloDinamico()} unidad={unidad} nCortes={esq.cortes.length} esquema={esquemaAmbito} nivel={nivelColegioSel} />
            )}
            {nivelAnalisis === "grado" && gradoSeleccionado && (
              <AnalisisGrado grado={gradoSeleccionado} periodo={periodoNumerico} titulo={getTituloDinamico()} unidad={unidad} nCortes={esq.cortes.length} />
            )}
            {nivelAnalisis === "salon" && gradoSeleccionado && salonSeleccionado && (
              <AnalisisSalon grado={gradoSeleccionado} salon={salonSeleccionado} periodo={periodoNumerico} titulo={getTituloDinamico()} unidad={unidad} nCortes={esq.cortes.length} />
            )}
            {nivelAnalisis === "estudiante" && estudianteSeleccionado && (
              <AnalisisEstudiante 
                idEstudiante={estudianteSeleccionado} 
                periodo={periodoNumerico}
                titulo={getTituloDinamico()}
                unidad={unidad}
                nCortes={esq.cortes.length}
              />
            )}
            {nivelAnalisis === "asignatura" && asignaturaSeleccionada && (
              <AnalisisAsignatura
                asignatura={asignaturaSeleccionada}
                periodo={periodoNumerico}
                grado={gradoSeleccionado}
                salon={salonSeleccionado}
                titulo={getTituloDinamico()}
                unidad={unidad}
                nCortes={esq.cortes.length}
                esquema={esquemaAmbito}
              />
            )}
            {nivelAnalisis === "grado" && !gradoSeleccionado && (
              <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
                Selecciona un grado para ver el análisis
              </div>
            )}
            {nivelAnalisis === "salon" && (!gradoSeleccionado || !salonSeleccionado) && (
              <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
                Selecciona un grado y salón para ver el análisis
              </div>
            )}
            {nivelAnalisis === "estudiante" && !estudianteSeleccionado && (
              <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
                Selecciona un estudiante para ver el análisis
              </div>
            )}
            {nivelAnalisis === "asignatura" && !asignaturaSeleccionada && (
              <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
                Selecciona una asignatura para ver su análisis
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default EstadisticasDashboard;
