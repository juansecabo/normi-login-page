import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MoreVertical, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { getSession } from "@/hooks/useSession";
import { getPeriodoActual } from "@/utils/periodoActual";
import { ACTIVIDADES_PREESCOLAR, esGradoPreescolar } from "@/utils/preescolar";
import HeaderNormi from "@/components/HeaderNormi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NotificacionModal from "@/components/notas/NotificacionModal";

const N8N_WEBHOOK_URL = "https://n8n.notasnormi.com/webhook/notificar-preescolar";

interface Estudiante {
  id: string;
  apellidos: string;
  nombres: string;
}

// Estructura: { [id_estudiantil]: { [periodo]: { [nombre_actividad]: texto } } }
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

const TablaNotasPreescolar = () => {
  const navigate = useNavigate();
  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState("");
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [textos, setTextos] = useState<TextosPreescolar>({});
  const [loading, setLoading] = useState(true);
  const [periodoActivo, setPeriodoActivo] = useState<number>(getPeriodoActual());
  const [guardandoMap, setGuardandoMap] = useState<Record<string, boolean>>({});

  // Modal de notificación
  const [notificacionOpen, setNotificacionOpen] = useState(false);
  const [notificacionPendiente, setNotificacionPendiente] = useState<{
    tipo: "preescolar_masivo" | "preescolar_individual";
    descripcion: string;
    nombreEstudiante?: string;
    estudiantesIds: string[];
    periodo: number;
  } | null>(null);

  // Ref para evitar re-inicialización del efecto
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const inicializar = async () => {
      const session = getSession();

      if (!session.id) {
        navigate("/");
        return;
      }

      const storedAsignatura = localStorage.getItem("asignaturaSeleccionada");
      const storedGrado = localStorage.getItem("gradoSeleccionado");
      const storedSalon = localStorage.getItem("salonSeleccionado");

      if (!storedAsignatura) {
        navigate("/dashboard");
        return;
      }
      if (!storedGrado) {
        navigate("/seleccionar-grado");
        return;
      }
      if (!storedSalon) {
        navigate("/seleccionar-salon");
        return;
      }

      // Si no es preescolar, redirigir a la tabla normal
      if (!esGradoPreescolar(storedGrado)) {
        navigate("/tabla-notas");
        return;
      }

      setAsignaturaSeleccionada(storedAsignatura);
      setGradoSeleccionado(storedGrado);
      setSalonSeleccionado(storedSalon);

      try {
        // 1) Cargar estudiantes
        const { data: estudiantesData, error: errEst } = await supabase
          .from("Estudiantes")
          .select("id, apellidos, nombres")
          .eq("grado", storedGrado)
          .eq("salon", storedSalon)
          .order("apellidos", { ascending: true })
          .order("nombres", { ascending: true });

        if (errEst) {
          console.error("Error fetching estudiantes:", errEst);
          setLoading(false);
          return;
        }
        setEstudiantes(estudiantesData || []);

        // 2) Seedear las 2 actividades fijas en "Nombre de Actividades" para los 4 periodos
        //    si no existen aún. Upsert idempotente.
        const actividadesSeed = [];
        for (const p of [1, 2, 3, 4]) {
          for (const act of ACTIVIDADES_PREESCOLAR) {
            actividadesSeed.push({
              id_profesor: session.id,
              asignatura: storedAsignatura,
              grado: storedGrado,
              salon: storedSalon,
              periodo: p,
              nombre_actividad: act.nombre,
              porcentaje: null,
              categoria: null,
            });
          }
        }

        // Verificar primero cuáles ya existen
        const { data: existentes } = await supabase
          .from("Nombre de Actividades")
          .select("periodo, nombre_actividad")
          .eq("id_profesor", session.id)
          .eq("asignatura", storedAsignatura)
          .eq("grado", storedGrado)
          .eq("salon", storedSalon)
          .in("nombre_actividad", ACTIVIDADES_PREESCOLAR.map((a) => a.nombre));

        const existentesSet = new Set(
          (existentes || []).map((e) => `${e.periodo}-${e.nombre_actividad}`)
        );

        const aInsertar = actividadesSeed.filter(
          (a) => !existentesSet.has(`${a.periodo}-${a.nombre_actividad}`)
        );

        if (aInsertar.length > 0) {
          const { error: errIns } = await supabase
            .from("Nombre de Actividades")
            .insert(aInsertar);
          if (errIns) {
            console.error("Error seedeando actividades preescolar:", errIns);
          }
        }

        // 3) Cargar textos existentes (comentario) de la tabla Notas
        const { data: notasData, error: errNotas } = await supabase
          .from("Notas")
          .select("id_estudiantil, periodo, nombre_actividad, comentario")
          .eq("asignatura", storedAsignatura)
          .eq("grado", storedGrado)
          .eq("salon", storedSalon)
          .in("nombre_actividad", ACTIVIDADES_PREESCOLAR.map((a) => a.nombre));

        if (errNotas) {
          console.error("Error fetching notas preescolar:", errNotas);
        } else if (notasData) {
          const textosFormateados: TextosPreescolar = {};
          notasData.forEach((n) => {
            if (!n.comentario) return;
            if (!textosFormateados[n.id_estudiantil]) {
              textosFormateados[n.id_estudiantil] = {};
            }
            if (!textosFormateados[n.id_estudiantil][n.periodo]) {
              textosFormateados[n.id_estudiantil][n.periodo] = {};
            }
            textosFormateados[n.id_estudiantil][n.periodo][n.nombre_actividad] =
              n.comentario;
          });
          setTextos(textosFormateados);
        }
      } catch (err) {
        console.error("Error inicializando TablaNotasPreescolar:", err);
      } finally {
        setLoading(false);
      }
    };

    inicializar();
  }, [navigate]);

  // Guardar un texto (upsert a la tabla Notas)
  const guardarTexto = async (
    idEstudiantil: string,
    periodo: number,
    nombreActividad: string,
    texto: string
  ) => {
    const key = `${idEstudiantil}-${periodo}-${nombreActividad}`;
    setGuardandoMap((prev) => ({ ...prev, [key]: true }));

    try {
      const textoLimpio = texto.trim();
      if (textoLimpio === "") {
        // Borrar el comentario (upsert con null)
        const { error } = await supabase
          .from("Notas")
          .delete()
          .eq("id_estudiantil", idEstudiantil)
          .eq("asignatura", asignaturaSeleccionada)
          .eq("grado", gradoSeleccionado)
          .eq("salon", salonSeleccionado)
          .eq("periodo", periodo)
          .eq("nombre_actividad", nombreActividad);

        if (error) {
          console.error("Error eliminando texto preescolar:", error);
          toast({
            title: "Error",
            description: "No se pudo eliminar el texto",
            variant: "destructive",
          });
          return;
        }

        setTextos((prev) => {
          const next = { ...prev };
          if (next[idEstudiantil]?.[periodo]?.[nombreActividad] !== undefined) {
            delete next[idEstudiantil][periodo][nombreActividad];
          }
          return next;
        });
      } else {
        const { error } = await supabase.from("Notas").upsert(
          {
            id_estudiantil: idEstudiantil,
            asignatura: asignaturaSeleccionada,
            grado: gradoSeleccionado,
            salon: salonSeleccionado,
            periodo,
            nombre_actividad: nombreActividad,
            porcentaje: null,
            categoria: null,
            nota: null,
            comentario: textoLimpio,
            notificado: false,
          },
          {
            onConflict:
              "id_estudiantil,asignatura,grado,salon,periodo,nombre_actividad",
          }
        );

        if (error) {
          console.error("Error guardando texto preescolar:", error);
          toast({
            title: "Error",
            description: "No se pudo guardar el texto",
            variant: "destructive",
          });
          return;
        }

        setTextos((prev) => ({
          ...prev,
          [idEstudiantil]: {
            ...prev[idEstudiantil],
            [periodo]: {
              ...prev[idEstudiantil]?.[periodo],
              [nombreActividad]: textoLimpio,
            },
          },
        }));
      }
    } finally {
      setGuardandoMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Determina si un estudiante tiene al menos uno de los dos textos en un periodo
  const estudianteTieneAlgunTexto = (idEstudiantil: string, periodo: number): boolean => {
    const t = textos[idEstudiantil]?.[periodo];
    if (!t) return false;
    return ACTIVIDADES_PREESCOLAR.some((act) => !!t[act.nombre]?.trim());
  };

  // Handler: notificar masivo del periodo
  const handleNotificarMasivo = (periodo: number) => {
    const elegibles = estudiantes.filter((e) =>
      estudianteTieneAlgunTexto(e.id_estudiantil, periodo)
    );

    if (elegibles.length === 0) {
      toast({
        title: "Sin textos",
        description:
          "Ningún estudiante tiene textos registrados en este periodo.",
        variant: "destructive",
      });
      return;
    }

    const nombrePeriodo = periodos.find((p) => p.numero === periodo)?.nombre;
    const sinTextos = estudiantes.length - elegibles.length;
    let descripcion = `Se enviará el informe descriptivo del ${nombrePeriodo} a los padres de ${elegibles.length} estudiante(s).`;
    if (sinTextos > 0) {
      descripcion += `\n\n⚠️ Hay ${sinTextos} estudiante(s) sin texto registrado; a ellos no se les notificará.`;
    }

    setNotificacionPendiente({
      tipo: "preescolar_masivo",
      descripcion,
      estudiantesIds: elegibles.map((e) => e.id_estudiantil),
      periodo,
    });
    setNotificacionOpen(true);
  };

  // Handler: notificar individual
  const handleNotificarIndividual = (estudiante: Estudiante, periodo: number) => {
    if (!estudianteTieneAlgunTexto(estudiante.id, periodo)) {
      toast({
        title: "Sin textos",
        description: "Este estudiante no tiene textos en este periodo.",
        variant: "destructive",
      });
      return;
    }

    const nombrePeriodo = periodos.find((p) => p.numero === periodo)?.nombre;
    const nombreCompleto = `${estudiante.nombres} ${estudiante.apellidos}`;

    setNotificacionPendiente({
      tipo: "preescolar_individual",
      descripcion: `Se enviará el informe descriptivo del ${nombrePeriodo} al/los padre(s) de ${nombreCompleto}.`,
      nombreEstudiante: nombreCompleto,
      estudiantesIds: [estudiante.id],
      periodo,
    });
    setNotificacionOpen(true);
  };

  const enviarNotificacion = async () => {
    if (!notificacionPendiente) return;

    const session = getSession();
    if (!session.id) {
      toast({
        title: "Error",
        description: "Id del profesor no encontrado",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      tipo_boton:
        notificacionPendiente.tipo === "preescolar_masivo"
          ? "preescolar_masivo"
          : "preescolar_individual",
      profesor: {
        id: session.id,
        nombres: session.nombres,
        apellidos: session.apellidos,
      },
      contexto: {
        asignatura: asignaturaSeleccionada,
        grado: gradoSeleccionado,
        salon: salonSeleccionado,
        periodo: notificacionPendiente.periodo,
      },
      estudiantes_ids: notificacionPendiente.estudiantesIds,
    };

    setNotificacionOpen(false);

    const toastId = sonnerToast.loading(
      `Enviando informes a padres de ${payload.estudiantes_ids.length} estudiante(s)...`
    );

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      sonnerToast.dismiss(toastId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      sonnerToast.success(
        `✅ Informes enviados a padres de ${payload.estudiantes_ids.length} estudiante(s)`,
        { duration: 5000 }
      );

      // Marcar como notificado en Supabase (opcional, para trazabilidad)
      try {
        for (const idEst of notificacionPendiente.estudiantesIds) {
          for (const act of ACTIVIDADES_PREESCOLAR) {
            const tieneTexto = !!textos[idEst]?.[notificacionPendiente.periodo]?.[act.nombre]?.trim();
            if (!tieneTexto) continue;
            await supabase
              .from("Notas")
              .update({ notificado: true })
              .eq("id_estudiantil", idEst)
              .eq("asignatura", asignaturaSeleccionada)
              .eq("grado", gradoSeleccionado)
              .eq("salon", salonSeleccionado)
              .eq("periodo", notificacionPendiente.periodo)
              .eq("nombre_actividad", act.nombre);
          }
        }
      } catch (err) {
        console.warn("No se pudo actualizar notificado=true:", err);
      }
    } catch (error) {
      sonnerToast.dismiss(toastId);
      sonnerToast.error(
        `❌ Error enviando informes: ${error instanceof Error ? error.message : "desconocido"}`,
        { duration: 7000 }
      );
    } finally {
      setNotificacionPendiente(null);
    }
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
          <div className="flex flex-wrap items-center gap-2 text-sm">
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
              {asignaturaSeleccionada}
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
          </div>
        </div>

        {/* Tabs de periodos */}
        <div className="bg-card rounded-lg shadow-soft overflow-hidden mb-4">
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

          {/* Barra de acciones */}
          <div className="flex items-center justify-between p-3 bg-muted/20 border-b border-border">
            <div className="text-sm text-muted-foreground">
              Informe descriptivo de {periodos.find((p) => p.numero === periodoActivo)?.nombre}
            </div>
            <Button
              size="sm"
              onClick={() => handleNotificarMasivo(periodoActivo)}
              className="gap-1"
            >
              <Send className="w-4 h-4" />
              Notificar a padres
            </Button>
          </div>
        </div>

        {/* Tabla de estudiantes */}
        {estudiantes.length === 0 ? (
          <div className="bg-card rounded-lg shadow-soft p-8 text-center text-muted-foreground">
            No hay estudiantes registrados en {gradoSeleccionado} - {salonSeleccionado}.
          </div>
        ) : (
          <div className="space-y-6">
            {estudiantes.map((est, idx) => (
              <div
                key={est.id}
                className="bg-card rounded-lg shadow-soft overflow-hidden"
              >
                {/* Header del estudiante */}
                <div className="flex items-center justify-between p-4 bg-primary/5 border-b border-border">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Estudiante #{idx + 1}
                    </div>
                    <h3 className="text-base md:text-lg font-semibold text-foreground">
                      {est.apellidos} {est.nombres}
                    </h3>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleNotificarIndividual(est, periodoActivo)}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Notificar a padre(s)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* 2 Textareas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                  {ACTIVIDADES_PREESCOLAR.map((act) => {
                    const valor =
                      textos[est.id]?.[periodoActivo]?.[act.nombre] || "";
                    const key = `${est.id}-${periodoActivo}-${act.nombre}`;
                    const guardando = !!guardandoMap[key];

                    return (
                      <div key={act.nombre} className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-foreground flex items-center gap-2">
                          {act.nombre}
                          {guardando && (
                            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                          )}
                        </label>
                        <textarea
                          className="min-h-[160px] md:min-h-[200px] p-3 rounded-md border border-border bg-background text-foreground text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                          placeholder={
                            act.nombre === "Descripción Integral"
                              ? "Describe al estudiante: su relación con compañeros, avances académicos, dimensiones..."
                              : "Estímulo o recomendación para continuar/mejorar..."
                          }
                          defaultValue={valor}
                          onBlur={(e) => {
                            const nuevoValor = e.target.value;
                            if (nuevoValor.trim() === valor.trim()) return;
                            guardarTexto(
                              est.id,
                              periodoActivo,
                              act.nombre,
                              nuevoValor
                            );
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal de notificación */}
      <NotificacionModal
        open={notificacionOpen}
        onOpenChange={(open) => {
          setNotificacionOpen(open);
          if (!open) setNotificacionPendiente(null);
        }}
        tipoNotificacion={
          // El modal soporta estos tipos; uso periodo_completo_definitivo / periodo_parcial
          // como alias cosméticos para el título. El payload real va al webhook preescolar.
          notificacionPendiente?.tipo === "preescolar_individual"
            ? "nota_individual"
            : "actividad_individual"
        }
        descripcion={notificacionPendiente?.descripcion || ""}
        nombreEstudiante={notificacionPendiente?.nombreEstudiante}
        onConfirmar={enviarNotificacion}
      />
    </div>
  );
};

export default TablaNotasPreescolar;
