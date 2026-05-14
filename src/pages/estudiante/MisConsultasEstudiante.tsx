import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isEstudiante } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import HeaderNormy from "@/components/HeaderNormy";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, FileBarChart2, ExternalLink } from "lucide-react";

interface ConsultaRow {
  id: number;
  titulo: string;
  mensaje_consulta: string;
  opciones: string[];
  requiere_firma: boolean;
  creado_por_nombre: string | null;
  creado_por_cargo: string | null;
  fecha_creacion: string;
  activa: boolean;
  grados_objetivo: string[] | null;
  salones_objetivo: string[] | null;
  estudiantes_objetivo: number[] | null;
  cargos_objetivo: string[] | null;
  internos_objetivo: string[] | null;
  perfiles_objetivo: string[] | null;
}

interface ConsultaConRespuesta {
  consulta: ConsultaRow;
  opcion: string | null;
  fecha_respuesta: string | null;
}

export default function MisConsultasEstudiante() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [consultas, setConsultas] = useState<ConsultaConRespuesta[]>([]);

  useEffect(() => {
    if (!isEstudiante()) {
      navigate("/");
      return;
    }
    const session = getSession();
    if (!session.id) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const estIdNum = Number(session.id);
        const estIdStr = String(session.id);
        const grado = session.grado || "";
        const salon = session.salon || "";

        // 1. Cargar todas las consultas (activas y cerradas)
        const { data: todasConsultas } = await supabase
          .from("Consultas" as any)
          .select("*")
          .order("fecha_creacion", { ascending: false });

        // 2. Filtrar a las que aplican al estudiante
        const consultasAplicables: ConsultaRow[] = [];
        for (const c of (todasConsultas || []) as unknown as ConsultaRow[]) {
          // 2a. Verificar que la consulta esté dirigida a estudiantes.
          // Esquema nuevo: perfiles_objetivo debe incluir "Estudiantes".
          // Esquema legacy: si tiene cargos_objetivo o internos_objetivo, es solo para staff.
          const tienePerfiles = Array.isArray(c.perfiles_objetivo) && c.perfiles_objetivo.length > 0;
          const tieneCargos = Array.isArray(c.cargos_objetivo) && c.cargos_objetivo.length > 0;
          const tieneInternos = Array.isArray(c.internos_objetivo) && c.internos_objetivo.length > 0;
          if (tienePerfiles) {
            if (!c.perfiles_objetivo!.includes("Estudiantes")) continue;
          } else if (tieneCargos || tieneInternos) {
            continue;
          }

          // 2b. Verificar audiencia académica (grado/salón/id específico).
          if (c.estudiantes_objetivo && c.estudiantes_objetivo.length > 0) {
            if (!c.estudiantes_objetivo.includes(estIdNum)) continue;
          } else {
            if (c.grados_objetivo && c.grados_objetivo.length > 0) {
              if (!c.grados_objetivo.includes(grado)) continue;
            }
            if (c.salones_objetivo && c.salones_objetivo.length > 0) {
              if (!c.salones_objetivo.includes(salon)) continue;
            }
          }

          consultasAplicables.push(c);
        }

        // 3. Cargar respuestas de este estudiante para todas estas consultas en bulk.
        // En el esquema, padre_id = id del respondente (estudiante) y estudiante_id también = su id.
        const ids = consultasAplicables.map((c) => c.id);
        let respMap = new Map<number, any>();
        if (ids.length > 0) {
          const { data: respData } = await supabase
            .from("Consultas_Respuestas" as any)
            .select("*")
            .in("consulta_id", ids)
            .eq("padre_id", estIdStr)
            .eq("estudiante_id", estIdNum);
          (respData || []).forEach((r: any) => respMap.set(Number(r.consulta_id), r));
        }

        const result: ConsultaConRespuesta[] = consultasAplicables.map((c) => {
          const r = respMap.get(c.id);
          return {
            consulta: c,
            opcion: r?.opcion_seleccionada || null,
            fecha_respuesta: r?.fecha_respuesta || null,
          };
        });

        setConsultas(result);
      } catch (err) {
        console.error("Error cargando consultas:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const estadoConsulta = (c: ConsultaConRespuesta) => {
    if (c.opcion) return { label: "Respondida", variant: "default" as const };
    return { label: "Pendiente", variant: "secondary" as const };
  };

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormy backLink="/dashboard-estudiante" />
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Button onClick={() => navigate("/dashboard-estudiante")} variant="outline" size="sm">
            ← Volver
          </Button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileBarChart2 className="h-6 w-6 text-primary" />
            Mis Consultas
          </h1>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Aquí puedes ver las consultas que te ha enviado el colegio y responder o editar tus respuestas.
        </p>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : consultas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            No tienes consultas pendientes ni respondidas.
          </div>
        ) : (
          <div className="space-y-3">
            {consultas.map(({ consulta: c, opcion }) => {
              const est = estadoConsulta({ consulta: c, opcion, fecha_respuesta: null });
              const pendiente = !opcion;
              return (
                <Card key={c.id} className={pendiente && c.activa ? "border-primary" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">{c.titulo}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Enviada por{" "}
                          {c.creado_por_cargo === "Administrador"
                            ? "Normy"
                            : `${c.creado_por_nombre || ""}${c.creado_por_cargo ? ` (${c.creado_por_cargo})` : ""}`}
                          {" "}—{" "}
                          {new Date(c.fecha_creacion).toLocaleDateString("es-CO", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="flex gap-1 items-center">
                        {!c.activa && <Badge variant="destructive">Cerrada</Badge>}
                        <Badge variant={est.variant}>{est.label}</Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      {opcion ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <Badge variant="outline" className="text-xs">
                        {opcion || "Sin respuesta"}
                      </Badge>
                    </div>

                    <div className="pt-2">
                      <a
                        href={`/consulta/${c.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        {c.activa ? (pendiente ? "Responder consulta" : "Ver / editar respuesta") : "Ver respuestas"}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
