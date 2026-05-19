import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import { anoEscolarActual } from "@/utils/anoEscolar";
import HeaderNormi from "@/components/HeaderNormi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

interface ProfesorStats {
  numero_de_telefono: string;
  id: string;
  nombre: string;
  notas: number;
  actividades: number;
  comunicados: number;
  total: number;
}

interface SalonStats {
  grado: string;
  salon: string;
  notas: number;
  actividades: number;
  comunicados: number;
  total: number;
}

const GRADE_ORDER = [
  "Prejardín", "Jardín", "Transición",
  "Primero", "Segundo", "Tercero", "Cuarto", "Quinto",
  "Sexto", "Séptimo", "Octavo", "Noveno",
  "Décimo", "Undécimo",
];

const UsoNormi = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profesores, setProfesores] = useState<ProfesorStats[]>([]);
  const [salones, setSalones] = useState<SalonStats[]>([]);

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    if (!isAdmin() && !puedeAccederDashboard()) { navigate("/dashboard"); return; }
    cargarDatos();
  }, [navigate]);

  const cargarDatos = async () => {
    try {
      // 1. All professors. Teléfono ahora vive en Usuarios (Fase 10.E.15) — join manual por id.
      const { data: internos } = await supabase
        .from("Internos")
        .select("id, nombres, apellidos")
        .eq("cargo", "Profesor(a)");

      if (!internos) { setLoading(false); return; }

      const profCodigos = new Set(internos.map(p => String(p.id)));
      const profIds = internos.map(p => String(p.id));
      const telByCodigo = new Map<string, string>();
      if (profIds.length > 0) {
        const { data: usuarios } = await supabase
          .from("Usuarios")
          .select("id, numero_de_telefono")
          .in("id", profIds);
        for (const u of usuarios || []) telByCodigo.set(String(u.id), String(u.numero_de_telefono || ""));
      }

      // 2. Notas → count from "Nombre de Actividades" by id_profesor
      const { data: notasData } = await supabase
        .from("Nombre de Actividades")
        .select("id_profesor, grado, salon")
        .eq("ano_escolar", anoEscolarActual());

      // 3. Actividades → persistent counter from Uso_Profesores
      const { data: usoData } = await supabase
        .from("Uso_Profesores")
        .select("profesor_id, actividades_programadas");

      // 4. Comunicados by id_remitente
      const { data: comData } = await supabase
        .from("Comunicados")
        .select("id_remitente, grado, salon");

      // 5. Current Calendario Actividades for salon breakdown
      const { data: calData } = await supabase
        .from("Calendario Actividades")
        .select("Grado, Salon");

      // --- Count notas by professor and by salon ---
      const notasByProf: Record<string, number> = {};
      const notasBySalon: Record<string, number> = {};

      (notasData || []).forEach(r => {
        const cod = String(r.id_profesor);
        notasByProf[cod] = (notasByProf[cod] || 0) + 1;
        if (r.grado && r.salon) {
          const key = `${r.grado}|${r.salon}`;
          notasBySalon[key] = (notasBySalon[key] || 0) + 1;
        }
      });

      // --- Actividades by professor (persistent) ---
      const actByProf: Record<string, number> = {};
      (usoData || []).forEach(r => {
        actByProf[String(r.profesor_id)] = r.actividades_programadas || 0;
      });

      // --- Actividades by salon (current data) ---
      const actBySalon: Record<string, number> = {};
      (calData || []).forEach(r => {
        if (r.Grado && r.Salon) {
          const key = `${r.Grado}|${r.Salon}`;
          actBySalon[key] = (actBySalon[key] || 0) + 1;
        }
      });

      // --- Comunicados by professor and by salon ---
      const comByProf: Record<string, number> = {};
      const comBySalon: Record<string, number> = {};

      (comData || []).forEach(r => {
        const cod = String(r.id_remitente);
        if (profCodigos.has(cod)) {
          comByProf[cod] = (comByProf[cod] || 0) + 1;
          if (r.grado && r.salon) {
            const key = `${r.grado}|${r.salon}`;
            comBySalon[key] = (comBySalon[key] || 0) + 1;
          }
        }
      });

      // --- Build professor stats ---
      const profStats: ProfesorStats[] = internos.map(p => {
        const cod = String(p.id);
        const tel = telByCodigo.get(cod) || "";
        const notas = notasByProf[cod] || 0;
        const actividades = actByProf[tel] || 0;
        const comunicados = comByProf[cod] || 0;
        return {
          numero_de_telefono: tel, id: cod,
          nombre: `${p.apellidos} ${p.nombres}`.trim(),
          notas, actividades, comunicados,
          total: notas + actividades + comunicados,
        };
      }).sort((a, b) => b.total - a.total);

      setProfesores(profStats);

      // --- Build salon stats ---
      const allKeys = new Set([
        ...Object.keys(notasBySalon),
        ...Object.keys(actBySalon),
        ...Object.keys(comBySalon),
      ]);

      const salonStats: SalonStats[] = Array.from(allKeys).map(key => {
        const [grado, salon] = key.split("|");
        const notas = notasBySalon[key] || 0;
        const actividades = actBySalon[key] || 0;
        const comunicados = comBySalon[key] || 0;
        return { grado, salon, notas, actividades, comunicados, total: notas + actividades + comunicados };
      }).sort((a, b) => {
        if (a.total !== b.total) return b.total - a.total;
        const ga = GRADE_ORDER.indexOf(a.grado);
        const gb = GRADE_ORDER.indexOf(b.grado);
        if (ga !== gb) return ga - gb;
        return a.salon.localeCompare(b.salon);
      });

      setSalones(salonStats);
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  };

  const backLink = isAdmin() ? "/dashboard-admin" : "/dashboard-rector";
  const maxProf = Math.max(...profesores.map(p => p.total), 1);
  const maxSalon = Math.max(...salones.map(s => s.total), 1);

  const BarraApilada = ({ notas, actividades, comunicados, total, max }: { notas: number; actividades: number; comunicados: number; total: number; max: number }) => (
    <div
      className="flex h-6 rounded-md overflow-hidden bg-muted"
      style={{ width: `${Math.max((total / max) * 100, 3)}%` }}
    >
      {notas > 0 && (
        <div
          className="bg-blue-500 flex items-center justify-center text-white text-[10px] font-medium min-w-[14px]"
          style={{ width: `${(notas / total) * 100}%` }}
          title={`Notas: ${notas}`}
        >
          {total >= 3 ? notas : ""}
        </div>
      )}
      {actividades > 0 && (
        <div
          className="bg-green-500 flex items-center justify-center text-white text-[10px] font-medium min-w-[14px]"
          style={{ width: `${(actividades / total) * 100}%` }}
          title={`Actividades: ${actividades}`}
        >
          {total >= 3 ? actividades : ""}
        </div>
      )}
      {comunicados > 0 && (
        <div
          className="bg-purple-500 flex items-center justify-center text-white text-[10px] font-medium min-w-[14px]"
          style={{ width: `${(comunicados / total) * 100}%` }}
          title={`Comunicados: ${comunicados}`}
        >
          {total >= 3 ? comunicados : ""}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6 max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Uso de Normi</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-2 text-center">
            Uso de Normi
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Interacciones de profesores con la plataforma
          </p>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mb-6 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-500" />
              <span>Notas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-green-500" />
              <span>Actividades</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-purple-500" />
              <span>Comunicados</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando...
            </div>
          ) : (
            <Tabs defaultValue="profesores">
              <TabsList className="flex w-full mb-6">
                <TabsTrigger value="profesores" className="flex-1">Profesores</TabsTrigger>
                <TabsTrigger value="salones" className="flex-1">Salones</TabsTrigger>
              </TabsList>

              <TabsContent value="profesores">
                {profesores.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay datos</p>
                ) : (
                  <div className="space-y-3">
                    {profesores.map((p, i) => (
                      <div key={p.numero_de_telefono} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">
                            <span className="text-muted-foreground mr-2">{i + 1}.</span>
                            {p.nombre}
                          </span>
                          <span className="text-sm font-bold text-foreground ml-2 shrink-0">{p.total}</span>
                        </div>
                        <BarraApilada {...p} max={maxProf} />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="salones">
                {salones.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay datos</p>
                ) : (
                  <div className="space-y-3">
                    {salones.map((s, i) => (
                      <div key={`${s.grado}-${s.salon}`} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">
                            <span className="text-muted-foreground mr-2">{i + 1}.</span>
                            {s.grado} {s.salon}
                          </span>
                          <span className="text-sm font-bold text-foreground ml-2 shrink-0">{s.total}</span>
                        </div>
                        <BarraApilada {...s} max={maxSalon} />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </div>
  );
};

export default UsoNormi;
