import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Clock, Plus, Trash2, AlertCircle } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/apiClient";
import { isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import { useGradosColegio, NIVEL_DE_GRADO } from "@/utils/grados";

/**
 * UI del rector para configurar a qué hora se disparan los avisos
 * automáticos de actividades del día siguiente.
 *
 * Diseño: UNA fila por aula = UNA hora. Ambos perfiles (Estudiantes y
 * Acudientes) se controlan con checkboxes dentro de la misma fila.
 * Cambiar la hora aplica automáticamente a quien tenga el check marcado.
 *
 * Jerarquía: si hay regla genérica (solo nivel) y override (nivel+grado),
 * el grado del override queda EXCLUIDO de la regla genérica.
 */

type Audiencia = "Estudiantes" | "Acudientes";

interface HorarioAviso {
  id: number;
  colegio_id: string;
  audiencias: Audiencia[];
  nivel: string | null;
  grado: string | null;
  salon: string | null;
  hora_envio: string; // "HH:MM:SS"
  activo: boolean;
}

const NIVELES = ["Preescolar", "Primaria", "Secundaria", "Media"] as const;

export default function HorariosAvisos() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { grados } = useGradosColegio();
  const [horarios, setHorarios] = useState<HorarioAviso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Form de nueva regla
  const [nuevoNivel, setNuevoNivel] = useState<string>("");
  const [nuevoGrado, setNuevoGrado] = useState<string>("");
  const [nuevaHora, setNuevaHora] = useState<string>("12:00");
  const [nuevoEst, setNuevoEst] = useState<boolean>(true);
  const [nuevoAcu, setNuevoAcu] = useState<boolean>(true);

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
    const audiencias: Audiencia[] = [];
    if (nuevoEst) audiencias.push("Estudiantes");
    if (nuevoAcu) audiencias.push("Acudientes");
    if (audiencias.length === 0) {
      toast({ title: "Selecciona al menos uno", description: "Debe ir a Estudiantes y/o Acudientes", variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      await apiRequest("/api/horarios-avisos", {
        method: "POST",
        body: JSON.stringify({
          audiencias,
          nivel: nuevoNivel,
          grado: nuevoGrado || null,
          salon: null,
          hora_envio: nuevaHora,
          activo: true,
        }),
      });
      setNuevoGrado("");
      setNuevaHora("12:00");
      setNuevoEst(true);
      setNuevoAcu(true);
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

  async function actualizarHora(h: HorarioAviso, nueva: string) {
    if (!/^\d{2}:\d{2}$/.test(nueva)) {
      toast({ title: "Hora inválida (HH:MM)", variant: "destructive" });
      return;
    }
    try {
      await apiRequest(`/api/horarios-avisos/${h.id}`, {
        method: "PATCH",
        body: JSON.stringify({ hora_envio: nueva }),
      });
      await cargar();
    } catch (err) {
      toast({ title: "Error actualizando hora", description: String(err), variant: "destructive" });
    }
  }

  async function toggleAudiencia(h: HorarioAviso, audiencia: Audiencia, nuevoEstado: boolean) {
    const nuevas = nuevoEstado
      ? Array.from(new Set([...h.audiencias, audiencia]))
      : h.audiencias.filter((a) => a !== audiencia);
    if (nuevas.length === 0) {
      toast({
        title: "No se puede dejar sin destinatarios",
        description: "Debe quedar al menos Estudiantes o Acudientes marcado. Si no querés enviar, desactivá la regla.",
        variant: "destructive",
      });
      return;
    }
    try {
      await apiRequest(`/api/horarios-avisos/${h.id}`, {
        method: "PATCH",
        body: JSON.stringify({ audiencias: nuevas }),
      });
      await cargar();
    } catch (err) {
      toast({ title: "Error actualizando", description: String(err), variant: "destructive" });
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
    const partes: string[] = [];
    if (h.nivel) partes.push(h.nivel);
    if (h.grado) partes.push(h.grado);
    if (h.salon) partes.push(h.salon);
    return partes.join(" ") || "Todo el colegio";
  }

  function formatHora(s: string): string {
    return s.slice(0, 5);
  }

  // Ordenar: especificidad creciente (nivel → grado → salón), luego hora
  const ordenadas = useMemo(() => {
    return [...horarios].sort((a, b) => {
      const espA = (a.salon ? 3 : 0) + (a.grado ? 2 : 0) + (a.nivel ? 1 : 0);
      const espB = (b.salon ? 3 : 0) + (b.grado ? 2 : 0) + (b.nivel ? 1 : 0);
      if (espA !== espB) return espA - espB;
      return a.hora_envio.localeCompare(b.hora_envio);
    });
  }, [horarios]);

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink="/dashboard" />
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Button onClick={() => navigate("/dashboard")} variant="outline" size="sm">
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
                Cada regla define <strong>cuándo</strong> y a <strong>qué destinatarios</strong>
                se envía el reporte automático de actividades del día siguiente. Una fila = un aula =
                una hora. La hora se aplica a TODOS los destinatarios marcados (Estudiantes y/o
                Acudientes). Si configurás "Secundaria 12:00" y "Noveno 19:00", Noveno solo recibe
                a las 19:00 (override). Hora Bogotá, días hábiles.
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
                    {grados.filter((g) => NIVEL_DE_GRADO[g] === nuevoNivel).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Hora (HH:MM)</label>
                <Input value={nuevaHora} onChange={(e) => setNuevaHora(e.target.value)} placeholder="12:00" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground block">Enviar a</label>
                <div className="flex items-center gap-2">
                  <Checkbox checked={nuevoEst} onCheckedChange={(v) => setNuevoEst(!!v)} id="new-est" />
                  <label htmlFor="new-est" className="text-sm">Est</label>
                  <Checkbox checked={nuevoAcu} onCheckedChange={(v) => setNuevoAcu(!!v)} id="new-acu" />
                  <label htmlFor="new-acu" className="text-sm">Acud</label>
                </div>
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
        ) : ordenadas.length === 0 ? (
          <Card><CardContent className="pt-6 text-center text-muted-foreground">No hay reglas configuradas. Agregá una arriba.</CardContent></Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reglas configuradas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ordenadas.map((h) => {
                const tieneEst = h.audiencias.includes("Estudiantes");
                const tieneAcu = h.audiencias.includes("Acudientes");
                return (
                  <div key={h.id} className="flex items-center gap-3 p-3 border border-border rounded">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{descripcion(h)}</p>
                      {h.grado && (
                        <p className="text-xs text-primary">↳ Override sobre regla de nivel</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={tieneEst}
                        onCheckedChange={(v) => toggleAudiencia(h, "Estudiantes", !!v)}
                        id={`est-${h.id}`}
                      />
                      <label htmlFor={`est-${h.id}`}>Est</label>
                      <Checkbox
                        checked={tieneAcu}
                        onCheckedChange={(v) => toggleAudiencia(h, "Acudientes", !!v)}
                        id={`acu-${h.id}`}
                      />
                      <label htmlFor={`acu-${h.id}`}>Acud</label>
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
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
