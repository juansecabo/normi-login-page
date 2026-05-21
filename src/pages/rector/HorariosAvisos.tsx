import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Clock, Plus, Trash2, AlertCircle } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/apiClient";
import { isAdmin, puedeAccederDashboard } from "@/hooks/useSession";

/**
 * UI del rector para configurar a qué hora se disparan los avisos
 * automáticos de actividades del día siguiente.
 *
 * La tabla Horarios_Avisos vive en Supabase. Un cron interno del server
 * (avisosActividadesProcessor.ts) chequea cada minuto y dispara las
 * reglas que matcheen la hora actual de Bogotá en días hábiles.
 *
 * Jerarquía: si hay regla genérica (solo nivel) y override (nivel+grado),
 * el grado del override queda EXCLUIDO de la regla genérica.
 */

interface HorarioAviso {
  id: number;
  colegio_id: string;
  audiencia: "Estudiantes" | "Acudientes";
  nivel: string | null;
  grado: string | null;
  salon: string | null;
  hora_envio: string; // "HH:MM:SS"
  activo: boolean;
}

const NIVELES = ["Preescolar", "Primaria", "Secundaria", "Media"] as const;
const GRADOS_POR_NIVEL: Record<string, string[]> = {
  Preescolar: ["Prejardín", "Jardín", "Transición"],
  Primaria: ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto"],
  Secundaria: ["Sexto", "Séptimo", "Octavo", "Noveno"],
  Media: ["Décimo", "Undécimo"],
};

export default function HorariosAvisos() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [horarios, setHorarios] = useState<HorarioAviso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Form de nueva regla
  const [nuevaAudiencia, setNuevaAudiencia] = useState<"Estudiantes" | "Acudientes">("Estudiantes");
  const [nuevoNivel, setNuevoNivel] = useState<string>("");
  const [nuevoGrado, setNuevoGrado] = useState<string>("");
  const [nuevaHora, setNuevaHora] = useState<string>("12:00");

  useEffect(() => {
    if (!puedeAccederDashboard() && !isAdmin()) {
      navigate("/");
      return;
    }
    cargar();
  }, [navigate]);

  async function cargar() {
    setCargando(true);
    try {
      const res = await apiRequest<{ horarios: HorarioAviso[] }>("/api/horarios-avisos", { method: "GET" });
      setHorarios(res.horarios || []);
    } catch (err) {
      toast({ title: "Error cargando horarios", description: String(err), variant: "destructive" });
    } finally {
      setCargando(false);
    }
  }

  async function crear() {
    if (!nuevoNivel) {
      toast({ title: "Falta el nivel", variant: "destructive" });
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(nuevaHora)) {
      toast({ title: "Hora inválida", description: "Usa formato HH:MM (ej. 14:30)", variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      await apiRequest("/api/horarios-avisos", {
        method: "POST",
        body: JSON.stringify({
          audiencia: nuevaAudiencia,
          nivel: nuevoNivel,
          grado: nuevoGrado || null,
          salon: null, // por ahora UI no soporta override por salón
          hora_envio: nuevaHora,
          activo: true,
        }),
      });
      setNuevoGrado("");
      await cargar();
      toast({ title: "Horario agregado" });
    } catch (err) {
      toast({ title: "Error agregando horario", description: String(err), variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(h: HorarioAviso) {
    try {
      await apiRequest(`/api/horarios-avisos/${h.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !h.activo }),
      });
      await cargar();
    } catch (err) {
      toast({ title: "Error actualizando", description: String(err), variant: "destructive" });
    }
  }

  async function actualizarHora(h: HorarioAviso, nuevaHora: string) {
    if (!/^\d{2}:\d{2}$/.test(nuevaHora)) {
      toast({ title: "Hora inválida (HH:MM)", variant: "destructive" });
      return;
    }
    try {
      await apiRequest(`/api/horarios-avisos/${h.id}`, {
        method: "PATCH",
        body: JSON.stringify({ hora_envio: nuevaHora }),
      });
      await cargar();
    } catch (err) {
      toast({ title: "Error actualizando hora", description: String(err), variant: "destructive" });
    }
  }

  async function eliminar(h: HorarioAviso) {
    if (!confirm(`¿Eliminar regla "${descripcion(h)}"?`)) return;
    try {
      await apiRequest(`/api/horarios-avisos/${h.id}`, { method: "DELETE" });
      await cargar();
      toast({ title: "Regla eliminada" });
    } catch (err) {
      toast({ title: "Error eliminando", description: String(err), variant: "destructive" });
    }
  }

  function descripcion(h: HorarioAviso): string {
    const partes: string[] = [h.audiencia];
    if (h.nivel) partes.push(h.nivel);
    if (h.grado) partes.push(h.grado);
    if (h.salon) partes.push(h.salon);
    return partes.join(" ");
  }

  function formatHora(s: string): string {
    return s.slice(0, 5); // "12:00:00" → "12:00"
  }

  // Agrupar por audiencia para mostrar
  const porAudiencia = useMemo(() => {
    const map = { Estudiantes: [] as HorarioAviso[], Acudientes: [] as HorarioAviso[] };
    for (const h of horarios) {
      map[h.audiencia].push(h);
    }
    // Ordenar: primero las de solo nivel, luego con grado, luego con salón
    for (const aud of ["Estudiantes", "Acudientes"] as const) {
      map[aud].sort((a, b) => {
        const especA = (a.salon ? 3 : 0) + (a.grado ? 2 : 0) + (a.nivel ? 1 : 0);
        const especB = (b.salon ? 3 : 0) + (b.grado ? 2 : 0) + (b.nivel ? 1 : 0);
        if (especA !== especB) return especA - especB;
        return a.hora_envio.localeCompare(b.hora_envio);
      });
    }
    return map;
  }, [horarios]);

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink="/dashboard-rector" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Button onClick={() => navigate("/dashboard-rector")} variant="outline" size="sm">
            ← Volver
          </Button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Horarios de avisos académicos
          </h1>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            <div className="flex gap-2 items-start">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                Cada regla configura <strong>cuándo</strong> se manda automáticamente el reporte
                de actividades del día siguiente a estudiantes o acudientes. La hora es en zona
                <strong> Bogotá</strong>, en <strong>días hábiles</strong> (lun-vie).
                Si configurás una regla por <strong>nivel</strong> (ej. Secundaria) y otra por
                <strong> grado específico</strong> del mismo nivel (ej. Noveno), el grado tiene
                prioridad sobre el nivel — Noveno NO se duplica.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agregar nueva regla */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Agregar nueva regla</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
              <div>
                <label className="text-xs text-muted-foreground">Audiencia</label>
                <Select value={nuevaAudiencia} onValueChange={(v) => setNuevaAudiencia(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Estudiantes">Estudiantes</SelectItem>
                    <SelectItem value="Acudientes">Acudientes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nivel</label>
                <Select value={nuevoNivel} onValueChange={(v) => { setNuevoNivel(v); setNuevoGrado(""); }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {NIVELES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Grado (opcional, override)</label>
                <Select value={nuevoGrado || "_none"} onValueChange={(v) => setNuevoGrado(v === "_none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Sin override" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Todo el nivel</SelectItem>
                    {(GRADOS_POR_NIVEL[nuevoNivel] || []).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Hora (HH:MM)</label>
                <Input value={nuevaHora} onChange={(e) => setNuevaHora(e.target.value)} placeholder="12:00" />
              </div>
              <div>
                <Button onClick={crear} disabled={guardando} className="w-full">
                  <Plus className="h-4 w-4 mr-1" /> Agregar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Listado */}
        {cargando ? (
          <p className="text-center text-muted-foreground">Cargando...</p>
        ) : horarios.length === 0 ? (
          <Card><CardContent className="pt-6 text-center text-muted-foreground">No hay reglas configuradas. Agregá una arriba.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(["Estudiantes", "Acudientes"] as const).map((aud) => (
              <Card key={aud}>
                <CardHeader>
                  <CardTitle className="text-base">{aud}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {porAudiencia[aud].length === 0 && (
                    <p className="text-sm text-muted-foreground">Sin reglas</p>
                  )}
                  {porAudiencia[aud].map((h) => (
                    <div key={h.id} className="flex items-center gap-2 p-2 border border-border rounded">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{descripcion(h)}</p>
                        {h.grado && (
                          <p className="text-xs text-primary">↳ Override sobre regla de nivel</p>
                        )}
                      </div>
                      <Input
                        type="text"
                        defaultValue={formatHora(h.hora_envio)}
                        className="w-20 text-center"
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== formatHora(h.hora_envio)) actualizarHora(h, v);
                        }}
                      />
                      <Switch checked={h.activo} onCheckedChange={() => toggleActivo(h)} />
                      <Button variant="ghost" size="icon" onClick={() => eliminar(h)} title="Eliminar">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
