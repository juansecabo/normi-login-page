import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isRectorOrCoordinador } from "@/hooks/useSession";
import { getPeriodoActual } from "@/utils/periodoActual";
import { anoEscolarActual } from "@/utils/anoEscolar";
import { ACTIVIDADES_PREESCOLAR } from "@/utils/preescolar";
import HeaderNormi from "@/components/HeaderNormi";
import { Loader2 } from "lucide-react";

import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
interface Estudiante {
  id: string;
  apellidos: string;
  nombres: string;
}

// { [id_estudiantil]: { [periodo]: { [nombre_actividad]: texto } } }
type TextosPreescolar = {
  [idEstudiantil: string]: {
    [periodo: number]: {
      [nombreActividad: string]: string;
    };
  };
};

const periodos = [
  { numero: 1, nombre: "1er Periodo" },
  { numero: 2, nombre: "2do Periodo" },
  { numero: 3, nombre: "3er Periodo" },
  { numero: 4, nombre: "4to Periodo" },
];

/**
 * Vista del rector/coordinador: todos los informes descriptivos de preescolar
 * de un salón, en un solo scroll. Tabs de periodo arriba; cada card = 1 estudiante
 * con los 2 textos (Descripción Integral + Estímulo).
 */
const TablaNotasPreescolarReadOnly = () => {
  const navigate = useNavigate();
  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState("");
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [textos, setTextos] = useState<TextosPreescolar>({});
  const [loading, setLoading] = useState(true);
  const [periodoActivo, setPeriodoActivo] = useState<number>(getPeriodoActual());

  useEffect(() => {
    const inicializar = async () => {
      if (!isRectorOrCoordinador()) {
        navigate("/dashboard");
        return;
      }

      const storedAsignatura = localStorage.getItem("asignaturaSeleccionada");
      const storedGrado = localStorage.getItem("gradoSeleccionado");
      const storedSalon = localStorage.getItem("salonSeleccionado");

      if (!storedGrado || !storedSalon) {
        navigate("/seleccionar-grado");
        return;
      }

      setAsignaturaSeleccionada(storedAsignatura || "");
      setGradoSeleccionado(storedGrado);
      setSalonSeleccionado(storedSalon);

      try {
        // Fase 10.E.19: nombres/apellidos viven en Usuarios.
        const { data: estudiantesRaw, error: errEst } = await supabase
          .from("Estudiantes")
          .select("id")
          .eq("grado", storedGrado)
          .eq("salon", storedSalon);
        const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
        const estudiantesData = errEst ? estudiantesRaw : sortByApellidosNombres(await enrichWithNombres((estudiantesRaw || []) as any));

        if (errEst) {
          console.error("Error fetching estudiantes:", errEst);
          setLoading(false);
          return;
        }
        setEstudiantes(estudiantesData || []);

        const notasQuery = supabase
          .from("Notas")
          .select("id_estudiantil, periodo, nombre_actividad, comentario")
          .eq("ano_escolar", anoEscolarActual())
          .eq("grado", storedGrado)
          .eq("salon", storedSalon)
          .in("nombre_actividad", ACTIVIDADES_PREESCOLAR.map((a) => a.nombre));

        if (storedAsignatura) notasQuery.eq("asignatura", storedAsignatura);

        const { data: notasData, error: errNotas } = await notasQuery;

        if (errNotas) {
          console.error("Error fetching textos preescolar:", errNotas);
        } else if (notasData) {
          const formateados: TextosPreescolar = {};
          notasData.forEach((n) => {
            if (!n.comentario) return;
            if (!formateados[n.id_estudiantil]) formateados[n.id_estudiantil] = {};
            if (!formateados[n.id_estudiantil][n.periodo]) formateados[n.id_estudiantil][n.periodo] = {};
            formateados[n.id_estudiantil][n.periodo][n.nombre_actividad] = n.comentario;
          });
          setTextos(formateados);
        }
      } finally {
        setLoading(false);
      }
    };

    inicializar();
  }, [navigate]);

  const tieneTextos = (idEst: string, periodo: number) => {
    const t = textos[idEst]?.[periodo];
    if (!t) return false;
    return ACTIVIDADES_PREESCOLAR.some((a) => !!t[a.nombre]?.trim());
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button
              onClick={() => navigate("/dashboard")}
              className="text-primary hover:underline"
            >
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/seleccionar-grado")}
              className="text-primary hover:underline"
            >
              Notas
            </button>
            <span className="text-muted-foreground">→</span>
            <button
              onClick={() => navigate("/seleccionar-salon")}
              className="text-primary hover:underline"
            >
              {gradoSeleccionado}
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">{salonSeleccionado}</span>
          </BreadcrumbDeslizable>
        </div>

        {/* Tabs de periodo */}
        <div className="bg-card rounded-lg shadow-soft overflow-hidden mb-6">
          <div className="flex border-b border-border">
            {periodos.map((p) => {
              const isActive = periodoActivo === p.numero;
              return (
                <button
                  key={p.numero}
                  onClick={() => setPeriodoActivo(p.numero)}
                  className={`flex-1 px-2 py-2 text-xs md:text-sm font-medium transition-colors relative
                    ${isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                >
                  {p.nombre}
                </button>
              );
            })}
          </div>
          <div className="p-3 bg-muted/20 text-sm text-muted-foreground">
            Informes descriptivos del {periodos.find((p) => p.numero === periodoActivo)?.nombre} — {gradoSeleccionado} {salonSeleccionado}
          </div>
        </div>

        {/* Lista de estudiantes con sus textos */}
        {estudiantes.length === 0 ? (
          <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
            No hay estudiantes registrados en este salón.
          </div>
        ) : (
          <div className="space-y-6">
            {estudiantes.map((est, idx) => {
              const hayTextos = tieneTextos(est.id, periodoActivo);
              const textosPeriodo = textos[est.id]?.[periodoActivo] || {};

              return (
                <div
                  key={est.id}
                  className="bg-card rounded-lg shadow-soft overflow-hidden"
                >
                  <div className="p-4 bg-primary/5 border-b border-border">
                    <div className="text-xs text-muted-foreground">
                      Estudiante #{idx + 1}
                    </div>
                    <h3 className="text-base md:text-lg font-semibold text-foreground">
                      {est.apellidos} {est.nombres}
                    </h3>
                  </div>

                  <div className="p-4 md:p-6 space-y-5">
                    {!hayTextos ? (
                      <p className="text-sm text-muted-foreground italic text-center py-4">
                        Sin informe registrado para este periodo.
                      </p>
                    ) : (
                      ACTIVIDADES_PREESCOLAR.map((act) => {
                        const texto = textosPeriodo[act.nombre]?.trim();
                        if (!texto) return null;
                        return (
                          <div key={act.nombre}>
                            <h4 className="text-sm font-semibold text-primary mb-2">
                              {act.nombre}
                            </h4>
                            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                              {texto}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default TablaNotasPreescolarReadOnly;
