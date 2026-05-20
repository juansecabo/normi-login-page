import { getPeriodoActual } from "@/utils/periodoActual";
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isProfesor } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { useEstadisticas, ordenGrados } from "@/hooks/useEstadisticas";
import { AnalisisAsignatura } from "@/components/estadisticas/AnalisisAsignatura";
import { AnalisisEstudiante } from "@/components/estadisticas/AnalisisEstudiante";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface Asignacion {
  asignaturas: string[];
  grados: string[];
  salones: string[];
}

const EstadisticasProfesor = () => {
  const navigate = useNavigate();
  const { loading, salones: todosLosSalones, getPromediosEstudiantes } = useEstadisticas();

  const [loadingAsignaciones, setLoadingAsignaciones] = useState(true);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);

  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState("");
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState(String(getPeriodoActual()));
  const [gradoSeleccionado, setGradoSeleccionado] = useState("all");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState("");

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    if (!isProfesor()) { navigate("/dashboard"); return; }

    const fetchAsignaciones = async () => {
      try {
        const { data: rows } = await supabase
          .from("Asignación Profesores")
          .select('"Asignatura(s)", "Grado(s)", "Salon(es)"')
          .eq('id', parseInt(session.id!));

        if (rows) {
          setAsignaciones(rows.map((r: any) => ({
            asignaturas: Array.isArray(r["Asignatura(s)"]) ? r["Asignatura(s)"] : [],
            grados: Array.isArray(r["Grado(s)"]) ? r["Grado(s)"] : [],
            salones: Array.isArray(r["Salon(es)"]) ? r["Salon(es)"] : [],
          })));
        }
      } catch (err) {
        console.error("Error cargando asignaciones:", err);
      } finally {
        setLoadingAsignaciones(false);
      }
    };
    fetchAsignaciones();
  }, [navigate]);

  // Expandir asignaciones a tríos (asignatura, grado, salon)
  const trios = useMemo(() => {
    const result: { asignatura: string; grado: string; salon: string }[] = [];
    asignaciones.forEach(a => {
      if (a.grados.length === a.salones.length && a.grados.length === a.asignaturas.length) {
        for (let i = 0; i < a.asignaturas.length; i++) {
          result.push({ asignatura: a.asignaturas[i], grado: a.grados[i], salon: a.salones[i] });
        }
      } else {
        for (const mat of a.asignaturas)
          for (const grad of a.grados)
            for (const sal of a.salones)
              result.push({ asignatura: mat, grado: grad, salon: sal });
      }
    });
    return result.filter(t =>
      todosLosSalones.some(ts => ts.grado === t.grado && ts.salon === t.salon)
    );
  }, [asignaciones, todosLosSalones]);

  // Asignaturas del profesor
  const asignaturasProfesor = useMemo(() => {
    return [...new Set(trios.map(t => t.asignatura))].sort((a, b) => a.localeCompare(b, "es"));
  }, [trios]);

  // Default: primera asignatura
  useEffect(() => {
    if (asignaturasProfesor.length > 0 && !asignaturaSeleccionada) {
      setAsignaturaSeleccionada(asignaturasProfesor[0]);
    }
  }, [asignaturasProfesor, asignaturaSeleccionada]);

  // Grados donde el profesor da la asignatura seleccionada
  const gradosParaAsignatura = useMemo(() => {
    if (!asignaturaSeleccionada) return [];
    const gs = [...new Set(trios.filter(t => t.asignatura === asignaturaSeleccionada).map(t => t.grado))];
    return gs.sort((a, b) => ordenGrados.indexOf(a) - ordenGrados.indexOf(b));
  }, [trios, asignaturaSeleccionada]);

  // Salones para asignatura + grado (excluye "all")
  const salonesParaGrado = useMemo(() => {
    if (!asignaturaSeleccionada || !gradoSeleccionado || gradoSeleccionado === "all") return [];
    const ss = [...new Set(
      trios.filter(t => t.asignatura === asignaturaSeleccionada && t.grado === gradoSeleccionado).map(t => t.salon)
    )];
    return ss.sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
  }, [trios, asignaturaSeleccionada, gradoSeleccionado]);

  // Estudiantes del salón (query directa a Supabase para obtener TODOS)
  const [estudiantesDelSalon, setEstudiantesDelSalon] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    if (!gradoSeleccionado || gradoSeleccionado === "all" || !salonSeleccionado || salonSeleccionado === "all") {
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

  // Valores efectivos para pasar a los componentes ("all" → undefined)
  const gradoEfectivo = gradoSeleccionado === "all" ? "" : gradoSeleccionado;
  const salonEfectivo = salonSeleccionado === "all" ? "" : salonSeleccionado;

  const periodoNumerico = periodoSeleccionado === "anual"
    ? ("anual" as const)
    : parseInt(periodoSeleccionado);

  // Título dinámico
  const getTitulo = () => {
    const periodoTexto = periodoSeleccionado === "anual" ? "Acumulado Anual" : `Período ${periodoSeleccionado}`;
    if (estudianteSeleccionado && estudianteSeleccionado !== "all") {
      const est = estudiantesDelSalon.find(e => e.id === estudianteSeleccionado);
      return `${est?.nombre || "Estudiante"} - ${periodoTexto}`;
    }
    const partes = [asignaturaSeleccionada || "Asignatura"];
    if (gradoEfectivo) {
      partes.push(salonEfectivo ? `${gradoEfectivo} ${salonEfectivo}` : gradoEfectivo);
    } else {
      partes.push("Todos los grados");
    }
    partes.push(periodoTexto);
    return partes.join(" - ");
  };

  const isLoading = loading || loadingAsignaciones;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Estadísticas</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-6 text-center">Revisa cuál es la situación actual de tus estudiantes.</p>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Cargando datos...</span>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
              <h3 className="font-semibold text-foreground mb-4">Filtros de análisis</h3>
              <div className="flex flex-wrap gap-4">
                {/* 1. Asignatura */}
                <div className="w-full sm:w-auto sm:min-w-[180px]">
                  <label className="text-sm text-muted-foreground mb-1.5 block">Asignatura</label>
                  <Select value={asignaturaSeleccionada} onValueChange={(val) => {
                    setAsignaturaSeleccionada(val);
                    setGradoSeleccionado("all");
                    setSalonSeleccionado("");
                    setEstudianteSeleccionado("");
                  }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar asignatura" /></SelectTrigger>
                    <SelectContent>
                      {asignaturasProfesor.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. Período */}
                <div className="w-full sm:w-auto sm:min-w-[150px]">
                  <label className="text-sm text-muted-foreground mb-1.5 block">Período</label>
                  <Select value={periodoSeleccionado} onValueChange={setPeriodoSeleccionado}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Período 1</SelectItem>
                      <SelectItem value="2">Período 2</SelectItem>
                      <SelectItem value="3">Período 3</SelectItem>
                      <SelectItem value="4">Período 4</SelectItem>
                      <SelectItem value="anual">Acumulado Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 3. Grado (siempre visible) */}
                <div className="w-full sm:w-auto sm:min-w-[160px]">
                  <label className="text-sm text-muted-foreground mb-1.5 block">Grado</label>
                  <Select value={gradoSeleccionado} onValueChange={(val) => {
                    setGradoSeleccionado(val);
                    setSalonSeleccionado("");
                    setEstudianteSeleccionado("");
                  }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar grado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {gradosParaAsignatura.map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 4. Salón (aparece cuando se escoge un grado específico) */}
                {gradoSeleccionado && gradoSeleccionado !== "all" && (
                  <div className="w-full sm:w-auto sm:min-w-[140px]">
                    <label className="text-sm text-muted-foreground mb-1.5 block">Salón</label>
                    <Select value={salonSeleccionado || "all"} onValueChange={(val) => {
                      setSalonSeleccionado(val === "all" ? "" : val);
                      setEstudianteSeleccionado("");
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {salonesParaGrado.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 5. Estudiante (aparece cuando se escoge un salón específico) */}
                {gradoSeleccionado && gradoSeleccionado !== "all" && salonSeleccionado && (
                  <div className="w-full sm:w-auto sm:min-w-[200px]">
                    <label className="text-sm text-muted-foreground mb-1.5 block">Estudiante</label>
                    <Select value={estudianteSeleccionado || "all"} onValueChange={(val) => {
                      setEstudianteSeleccionado(val === "all" ? "" : val);
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {estudiantesDelSalon.map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Resultados */}
            {estudianteSeleccionado ? (
              <AnalisisEstudiante
                idEstudiante={estudianteSeleccionado}
                periodo={periodoNumerico}
                titulo={getTitulo()}
              />
            ) : asignaturaSeleccionada && gradoSeleccionado ? (
              <AnalisisAsignatura
                asignatura={asignaturaSeleccionada}
                periodo={periodoNumerico}
                grado={gradoEfectivo}
                salon={salonEfectivo}
                titulo={getTitulo()}
              />
            ) : (
              <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
                Selecciona una asignatura para ver el análisis
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default EstadisticasProfesor;
