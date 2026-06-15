import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Clock, Plus, Trash2, GraduationCap, DoorOpen, Loader2 } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { getSession } from "@/hooks/useSession";
import { ORDEN_GRADOS, rankGrado } from "@/utils/grados";

/**
 * "Construye tu Institución" — el Rector (o Administrador) declara la estructura
 * del colegio: Jornadas (con su hora de aviso), Grados y Salones (cada salón con
 * su jornada). Consume /api/institucion/* (multi-tenant por el JWT).
 *
 * Esto NO afecta a los colegios que ya derivan grados/salones de sus estudiantes
 * (Normal, Pestalozziano): esas tablas arrancan vacías y solo se usan donde se
 * declaren. Por ahora su único consumidor será el dropdown de "agregar estudiante".
 */

interface Jornada { id: number; nombre: string; hora_aviso: string | null; orden: number | null; activa: boolean; }
interface Grado { id: number; grado: string; orden: number | null; activo: boolean; }
interface Salon { id: number; grado: string; salon: string; jornada_id: number | null; activo: boolean; }

const ConstruyeInstitucion = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const cargo = getSession().cargo || "";
  const puedeEditar = cargo === "Rector" || cargo === "Administrador";

  const [loading, setLoading] = useState(true);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [grados, setGrados] = useState<Grado[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);

  // Form jornada nueva
  const [jorNombre, setJorNombre] = useState("");
  const [jorHora, setJorHora] = useState("");
  const [guardando, setGuardando] = useState(false);

  const backLink = cargo === "Administrador" ? "/dashboard-admin" : "/dashboard-rector";

  useEffect(() => {
    const s = getSession();
    if (!s.id) { navigate("/"); return; }
    if (!puedeEditar) { navigate(backLink, { replace: true }); return; }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = async () => {
    try {
      const r = await apiRequest<{ jornadas: Jornada[]; grados: Grado[]; salones: Salon[] }>("/api/institucion/estructura");
      setJornadas(r.jornadas || []);
      setGrados(r.grados || []);
      setSalones(r.salones || []);
    } catch {
      toast({ title: "Error", description: "No se pudo cargar la estructura.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const err = (e: unknown, fallback: string) => {
    const detail = e instanceof ApiError ? ((e.body as any)?.detail || (e.body as any)?.error) : null;
    toast({ title: "Error", description: detail || fallback, variant: "destructive" });
  };

  // ── Jornadas ──
  const crearJornada = async () => {
    const nombre = jorNombre.trim();
    if (!nombre) { toast({ title: "Falta el nombre", description: "Ej: Matutina, Vespertina, Nocturna.", variant: "destructive" }); return; }
    setGuardando(true);
    try {
      await apiRequest("/api/institucion/jornadas", { method: "POST", body: JSON.stringify({ nombre, hora_aviso: jorHora || null, orden: jornadas.length }) });
      setJorNombre(""); setJorHora("");
      await cargar();
    } catch (e) { err(e, "No se pudo crear la jornada."); }
    setGuardando(false);
  };
  const editarHoraJornada = async (id: number, hora_aviso: string) => {
    try { await apiRequest(`/api/institucion/jornadas/${id}`, { method: "PATCH", body: JSON.stringify({ hora_aviso: hora_aviso || null }) }); await cargar(); }
    catch (e) { err(e, "No se pudo guardar la hora."); }
  };
  const borrarJornada = async (id: number) => {
    try { await apiRequest(`/api/institucion/jornadas/${id}`, { method: "DELETE" }); await cargar(); }
    catch (e) { err(e, "No se pudo eliminar la jornada."); }
  };

  // ── Grados ──
  const gradosDeclarados = useMemo(() => new Set(grados.map((g) => g.grado)), [grados]);
  const toggleGrado = async (grado: string) => {
    const existente = grados.find((g) => g.grado === grado);
    try {
      if (existente) {
        await apiRequest(`/api/institucion/grados/${existente.id}`, { method: "DELETE" });
      } else {
        await apiRequest("/api/institucion/grados", { method: "POST", body: JSON.stringify({ grado, orden: rankGrado(grado) }) });
      }
      await cargar();
    } catch (e) { err(e, "No se pudo actualizar el grado. (Si tiene salones, quítalos primero.)"); }
  };

  const gradosOrdenados = useMemo(
    () => [...grados].sort((a, b) => rankGrado(a.grado) - rankGrado(b.grado)),
    [grados],
  );

  // ── Salones ──
  const salonesDeGrado = (grado: string) =>
    salones.filter((s) => s.grado === grado).sort((a, b) => Number(a.salon) - Number(b.salon));

  const agregarSalon = async (grado: string) => {
    const actuales = salonesDeGrado(grado).map((s) => Number(s.salon));
    const siguiente = actuales.length === 0 ? 1 : Math.max(...actuales) + 1;
    if (siguiente > 10) { toast({ title: "Máximo 10 salones", description: "Un grado admite hasta 10 salones.", variant: "destructive" }); return; }
    try { await apiRequest("/api/institucion/salones", { method: "POST", body: JSON.stringify({ grado, salon: String(siguiente) }) }); await cargar(); }
    catch (e) { err(e, "No se pudo agregar el salón."); }
  };
  const asignarJornada = async (id: number, jornada_id: number | null) => {
    try { await apiRequest(`/api/institucion/salones/${id}`, { method: "PATCH", body: JSON.stringify({ jornada_id }) }); await cargar(); }
    catch (e) { err(e, "No se pudo asignar la jornada."); }
  };
  const borrarSalon = async (id: number) => {
    try { await apiRequest(`/api/institucion/salones/${id}`, { method: "DELETE" }); await cargar(); }
    catch (e) { err(e, "No se pudo eliminar el salón."); }
  };

  const nombreJornada = (id: number | null) => jornadas.find((j) => j.id === id)?.nombre || null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-4xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Construye tu Institución</span>
          </div>
        </div>

        <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
          <Building2 className="h-6 w-6 text-primary" /> Construye tu Institución
        </h2>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-6">
            {/* ── JORNADAS ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Clock className="h-5 w-5 text-primary" /> Jornadas</CardTitle>
                <p className="text-sm text-muted-foreground">Define las jornadas del colegio y la hora a la que se envían los avisos de actividades a los salones de cada jornada.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {jornadas.length === 0 && <p className="text-sm text-muted-foreground italic">Aún no hay jornadas. Agrega la primera abajo.</p>}
                {jornadas.map((j) => (
                  <div key={j.id} className="flex items-center gap-3 border border-border rounded-md p-3">
                    <span className="font-medium flex-1">{j.nombre}</span>
                    <label className="text-xs text-muted-foreground">Aviso a las</label>
                    <Input type="time" defaultValue={j.hora_aviso ? j.hora_aviso.slice(0, 5) : ""} onBlur={(e) => editarHoraJornada(j.id, e.target.value)} className="w-32" />
                    <button onClick={() => borrarJornada(j.id)} className="text-muted-foreground hover:text-destructive" title="Eliminar jornada"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Input value={jorNombre} onChange={(e) => setJorNombre(e.target.value)} placeholder="Nombre (ej: Matutina)" className="flex-1" />
                  <Input type="time" value={jorHora} onChange={(e) => setJorHora(e.target.value)} className="w-32" title="Hora de aviso" />
                  <Button onClick={crearJornada} disabled={guardando}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
                </div>
              </CardContent>
            </Card>

            {/* ── GRADOS ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><GraduationCap className="h-5 w-5 text-primary" /> Grados</CardTitle>
                <p className="text-sm text-muted-foreground">Marca los grados que ofrece el colegio.</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {ORDEN_GRADOS.map((g) => {
                    const on = gradosDeclarados.has(g);
                    return (
                      <button key={g} onClick={() => toggleGrado(g)}
                        className={`px-3 py-1.5 rounded-full border text-sm transition-colors cursor-pointer ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted/50"}`}>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* ── SALONES ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><DoorOpen className="h-5 w-5 text-primary" /> Salones</CardTitle>
                <p className="text-sm text-muted-foreground">Para cada grado, agrega sus salones (hasta 10) y asígnale a cada uno su jornada.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {gradosOrdenados.length === 0 && <p className="text-sm text-muted-foreground italic">Primero marca los grados arriba.</p>}
                {gradosOrdenados.map((g) => {
                  const sals = salonesDeGrado(g.grado);
                  return (
                    <div key={g.id} className="border border-border rounded-md p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">{g.grado} <span className="text-xs text-muted-foreground font-normal">({sals.length} {sals.length === 1 ? "salón" : "salones"})</span></span>
                        <Button size="sm" variant="outline" onClick={() => agregarSalon(g.grado)} disabled={sals.length >= 10}><Plus className="w-4 h-4 mr-1" /> Salón</Button>
                      </div>
                      {sals.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Sin salones. Agrega el primero.</p>
                      ) : (
                        <div className="space-y-2">
                          {sals.map((s) => (
                            <div key={s.id} className="flex items-center gap-3 text-sm">
                              <span className="w-20">Salón {s.salon}</span>
                              <Select value={s.jornada_id ? String(s.jornada_id) : "none"} onValueChange={(v) => asignarJornada(s.id, v === "none" ? null : Number(v))}>
                                <SelectTrigger className="w-48"><SelectValue placeholder="Sin jornada" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Sin jornada</SelectItem>
                                  {jornadas.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.nombre}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <button onClick={() => borrarSalon(s.id)} className="text-muted-foreground hover:text-destructive" title="Eliminar salón"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {jornadas.length === 0 && gradosOrdenados.length > 0 && (
                  <p className="text-xs text-amber-700">Tip: crea jornadas arriba para poder asignarlas a los salones.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default ConstruyeInstitucion;
