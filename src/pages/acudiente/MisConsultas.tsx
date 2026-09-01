import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isPadreDeFamilia, AcudidoData } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import HeaderNormi from "@/components/HeaderNormi";
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

interface ConsultaConAcudidos {
  consulta: ConsultaRow;
  acudidosObjetivo: {
    acudido: AcudidoData;
    opcion: string | null;
    fecha_respuesta: string | null;
  }[];
}

export default function MisConsultas() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [consultas, setConsultas] = useState<ConsultaConAcudidos[]>([]);

  useEffect(() => {
    if (!isPadreDeFamilia()) {
      navigate("/");
      return;
    }
    const session = getSession();
    if (!session.id || !session.acudidos || session.acudidos.length === 0) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const padreId = session.id!;

        // 1. Cargar todas las consultas (activas y cerradas)
        const { data: todasConsultas } = await supabase
          .from("Consultas" as any)
          .select("*")
          .order("fecha_creacion", { ascending: false });

        // 2. Filtrar a las que aplican a algún hijo del padre
        const consultasAplicables: ConsultaConAcudidos[] = [];
        for (const c of (todasConsultas || []) as unknown as ConsultaRow[]) {
          // 2a. Verificar que la consulta esté dirigida a acudientes.
          // perfiles_objetivo debe incluir "Acudientes".
          // Esquema legacy: si tiene cargos_objetivo o internos_objetivo (filtros de internos)
          // y NO tiene perfiles_objetivo, la consulta es solo para staff — los acudientes no la ven.
          const tienePerfiles = Array.isArray(c.perfiles_objetivo) && c.perfiles_objetivo.length > 0;
          const tieneCargos = Array.isArray(c.cargos_objetivo) && c.cargos_objetivo.length > 0;
          const tieneInternos = Array.isArray(c.internos_objetivo) && c.internos_objetivo.length > 0;
          if (tienePerfiles) {
            if (!c.perfiles_objetivo!.some((p) => p === "Acudientes")) continue;
          } else if (tieneCargos || tieneInternos) {
            continue;
          }

          const hijosQueAplican = session.acudidos!.filter((h) => {
            const hijoId = Number(h.id);
            if (c.estudiantes_objetivo && c.estudiantes_objetivo.length > 0) {
              return c.estudiantes_objetivo.includes(hijoId);
            }
            if (c.grados_objetivo && c.grados_objetivo.length > 0) {
              if (!c.grados_objetivo.includes(h.grado)) return false;
            }
            if (c.salones_objetivo && c.salones_objetivo.length > 0) {
              if (!c.salones_objetivo.includes(h.salon)) return false;
            }
            return true;
          });

          if (hijosQueAplican.length === 0) continue;

          // 3. Cargar respuestas de este padre para esta consulta
          const { data: respData } = await supabase
            .from("Consultas_Respuestas" as any)
            .select("*")
            .eq("consulta_id", c.id)
            .eq("padre_id", padreId);
          const resp = respData || [];

          const respMap = new Map<number, any>();
          resp.forEach((r: any) => respMap.set(Number(r.estudiante_id), r));

          consultasAplicables.push({
            consulta: c,
            acudidosObjetivo: hijosQueAplican.map((h) => {
              const r = respMap.get(Number(h.id));
              return {
                acudido: h,
                opcion: r?.opcion_seleccionada || ((r as any)?.datos ? "Diligenciada" : null),
                fecha_respuesta: r?.fecha_respuesta || null,
              };
            }),
          });
        }

        setConsultas(consultasAplicables);
      } catch (err) {
        console.error("Error cargando consultas:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const estadoConsulta = (c: ConsultaConAcudidos) => {
    const total = c.acudidosObjetivo.length;
    const respondidos = c.acudidosObjetivo.filter((h) => h.opcion).length;
    if (respondidos === 0) return { label: "Pendiente", variant: "secondary" as const };
    if (respondidos === total) return { label: "Respondida", variant: "default" as const };
    return { label: `${respondidos}/${total}`, variant: "outline" as const };
  };

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink="/dashboard" />
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Button onClick={() => navigate("/dashboard")} variant="outline" size="sm">
            ← Volver
          </Button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileBarChart2 className="h-6 w-6 text-primary" />
            Mis Consultas
          </h1>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Aquí puede ver las consultas que le han enviado desde el colegio y responder o editar sus respuestas.
        </p>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : consultas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            No tiene consultas pendientes ni respondidas.
          </div>
        ) : (
          <div className="space-y-3">
            {consultas.map(({ consulta: c, acudidosObjetivo }) => {
              const est = estadoConsulta({ consulta: c, acudidosObjetivo });
              const pendiente = acudidosObjetivo.some((h) => !h.opcion);
              return (
                <Card key={c.id} className={pendiente && c.activa ? "border-primary" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">{c.titulo}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Enviada por{" "}
                          {c.creado_por_cargo === "Administrador"
                            ? "Normi"
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

                    <div className="space-y-1 text-sm">
                      {acudidosObjetivo.map((h) => (
                        <div key={h.acudido.id} className="flex items-center gap-2">
                          {h.opcion ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="flex-1 truncate">
                            {h.acudido.nombre} {h.acudido.apellidos}
                            <span className="text-muted-foreground"> — {h.acudido.grado} {h.acudido.salon}</span>
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {h.opcion || "Sin respuesta"}
                          </Badge>
                        </div>
                      ))}
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
