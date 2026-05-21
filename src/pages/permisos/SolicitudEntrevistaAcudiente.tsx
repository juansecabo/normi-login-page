import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isPadreDeFamilia, AcudidoData } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { es } from "date-fns/locale";
import { UserRound, X, ChevronDown, Check, XCircle } from "lucide-react";
import FirmaImage from "@/components/FirmaImage";

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo":0,"Prejardín":1,"Jardín":2,"Transición":3,"Primero":4,"Segundo":5,"Tercero":6,
  "Cuarto":7,"Quinto":8,"Sexto":9,"Séptimo":10,"Octavo":11,"Noveno":12,"Décimo":13,"Undécimo":14,
};

const fechaKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtFecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

const SolicitudEntrevistaAcudiente = () => {
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesActual, setMesActual] = useState(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | undefined>(new Date());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [acudidos, setAcudidos] = useState<AcudidoData[]>([]);

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isPadreDeFamilia()) { navigate("/"); return; }
    setAcudidos(session.acudidos || []);

    const hijosNombres = (session.acudidos || []).map(h => h.nombre);
    const hijosApellidos = (session.acudidos || []).map(h => h.apellidos);

    // Fetch solicitudes for all children of this parent
    supabase.from("Solicitudes_Entrevista").select("*").order("fecha_entrevista", { ascending: true })
      .then(({ data }) => {
        const filtradas = (data || []).filter(s =>
          (session.acudidos || []).some(h =>
            s.estudiante_nombre === h.nombre && s.estudiante_apellidos === h.apellidos
          )
        );
        setSolicitudes(filtradas);
        setLoading(false);
      });
  }, [navigate]);

  // Group by date
  const porFecha: Record<string, any[]> = {};
  solicitudes.forEach(s => {
    const key = s.fecha_entrevista;
    if (!porFecha[key]) porFecha[key] = [];
    porFecha[key].push(s);
  });

  const diasMarcados = Object.keys(porFecha).map(k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); });

  const solDelDia = diaSeleccionado ? (porFecha[fechaKey(diaSeleccionado)] || []) : [];

  const toggleConfirmacion = async (solicitudId: number, valor: boolean | null) => {
    const actual = solicitudes.find(s => s.id === solicitudId)?.confirmado;
    const nuevoValor = actual === valor ? null : valor;
    await supabase.from("Solicitudes_Entrevista").update({ confirmado: nuevoValor }).eq("id", solicitudId);
    setSolicitudes(prev => prev.map(s => s.id === solicitudId ? { ...s, confirmado: nuevoValor } : s));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard-acudiente")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/permisos-excusas")} className="text-primary hover:underline">Permisos y Excusas</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Solicitudes de Entrevista</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
            <UserRound className="h-5 w-5 text-primary" /> Solicitudes de Entrevista
          </h2>

          {loading ? <div className="text-center py-8 text-muted-foreground">Cargando...</div> : (
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              <div className="flex justify-center lg:sticky lg:top-4 shrink-0">
                <Calendar mode="single" selected={diaSeleccionado} onSelect={setDiaSeleccionado} month={mesActual} onMonthChange={setMesActual} locale={es}
                  modifiers={{ conSol: diasMarcados.filter(d => !diaSeleccionado || fechaKey(d) !== fechaKey(diaSeleccionado)) }}
                  modifiersClassNames={{ conSol: "bg-blue-400 text-white hover:bg-blue-500 !h-8 !w-8" }}
                  className="rounded-md border shadow-sm" />
              </div>

              <div className="flex-1 min-w-0 lg:max-h-[520px] lg:overflow-y-auto">
                {diaSeleccionado && solDelDia.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-foreground">
                        {diaSeleccionado.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      </h3>
                      <button onClick={() => { setDiaSeleccionado(undefined); setExpandedId(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                    </div>
                    <div className="space-y-3">
                      {solDelDia.map(s => {
                        const isExp = expandedId === s.id;
                        return (
                          <div key={s.id} className="border border-border rounded-lg overflow-hidden">
                            <button onClick={() => setExpandedId(isExp ? null : s.id)} className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer">
                              <div>
                                <p className="font-semibold text-foreground text-sm">{s.estudiante_nombre} {s.estudiante_apellidos}</p>
                                <p className="text-xs text-muted-foreground">Hora: {s.hora_entrevista} — Con: {s.solicitante_cargo} {s.solicitante_nombre}</p>
                              </div>
                              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${isExp ? "rotate-180" : ""}`} />
                            </button>
                            {isExp && (
                              <div className="border-t border-border p-4 bg-muted/10 text-sm text-foreground leading-relaxed space-y-3">
                                <p className="font-bold text-center">SOLICITUD DE ENTREVISTA CON ACUDIENTES</p>

                                <div className="bg-muted/50 rounded-lg p-3 border border-border">
                                  <p className="text-xs text-muted-foreground leading-relaxed text-justify">
                                    Los padres de familia como primeros responsables de la crianza, el cuidado y del proceso de formación integral de sus hijos menores, están llamados a guardar especial atención al nombrar el "acudiente debidamente autorizado" ante la Institución educativa. La falta de acompañamiento de los Padres de Familia o acudientes, la ausencia a reuniones, la inasistencia a las actividades de Escuela de Padres, a las jornadas de formación y demás actos programados por la Institución, generarán un Compromiso Especial Familiar evaluable para cada período. Es obligación de los padres de familia o acudiente, justificar su ausencia en una entrega de informes u otra convocatoria hecha por el Colegio y concertar un nuevo espacio de reunión.
                                  </p>
                                </div>

                                <p>FECHA: <span className="text-primary font-medium">{fmtFecha(s.fecha_solicitud)}</span> &nbsp;&nbsp; JORNADA MATINAL</p>
                                <p>Grado: <span className="text-primary font-medium">{s.estudiante_grado} {s.estudiante_salon}</span></p>
                                <p>ACUDIENTE DEL ESTUDIANTE: <span className="text-primary font-medium">{s.estudiante_nombre} {s.estudiante_apellidos}</span></p>
                                <p>Cordial Saludo,</p>
                                <p>Por este medio nos permitimos solicitar su presencia en el colegio el día <span className="text-primary font-medium">{fmtFecha(s.fecha_entrevista)}</span> Hora: <span className="text-primary font-medium">{s.hora_entrevista}</span> para una entrevista con el/la <span className="text-primary font-medium">{s.solicitante_cargo} {s.solicitante_nombre}</span></p>
                                <p>Agradecemos su atención y cumplimiento.</p>
                                <p>Atentamente,</p>
                                <p className="text-primary font-medium">{s.solicitante_cargo} {s.solicitante_nombre}</p>
                                {s.firma_url && <div><p className="font-medium mb-1">Firma del solicitante:</p><FirmaImage url={s.firma_url} /></div>}

                                {/* Confirmar asistencia */}
                                <div className="border-t border-border pt-3 mt-3">
                                  <p className="font-medium mb-2">Confirmar asistencia:</p>
                                  <div className="flex gap-3">
                                    <button
                                      onClick={() => toggleConfirmacion(s.id, true)}
                                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-medium text-sm transition-all cursor-pointer ${s.confirmado === true ? "border-green-500 bg-green-50 text-green-700" : "border-border text-muted-foreground hover:border-green-300"}`}
                                    >
                                      <Check className="w-4 h-4" /> Asistiré
                                    </button>
                                    <button
                                      onClick={() => toggleConfirmacion(s.id, false)}
                                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-medium text-sm transition-all cursor-pointer ${s.confirmado === false ? "border-red-500 bg-red-50 text-red-700" : "border-border text-muted-foreground hover:border-red-300"}`}
                                    >
                                      <XCircle className="w-4 h-4" /> No asistiré
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : diaSeleccionado ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                    <UserRound className="h-10 w-10 mb-2 opacity-50" />
                    <p className="font-medium">Sin solicitudes</p>
                    <p className="text-sm">No hay solicitudes de entrevista para este día</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                    <UserRound className="h-10 w-10 mb-2 opacity-50" />
                    <p className="font-medium">Selecciona un día</p>
                    <p className="text-sm">Los días con solicitudes están marcados en azul</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SolicitudEntrevistaAcudiente;
