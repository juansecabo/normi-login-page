import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isProfesor, puedeAccederDashboard, isAdmin } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, ChevronDown, Check, Paperclip, Eye, Download, Search, X } from "lucide-react";
import { coincideBusqueda } from "@/utils/busqueda";
import { getCleanFilename, handleVerArchivo, handleDescargarArchivo } from "@/utils/archivoUtils";
import FirmaImage from "@/components/FirmaImage";
import { markLastSeen } from "@/utils/notificaciones";
import { fechaKey, fmtDiaHeader, todayKey } from "@/utils/fechaUtils";
import { ImprimirToggle, CardSelector } from "@/components/ImprimirSelector";
import { descargarExcusasDocx, SeccionExcusa } from "@/utils/printExcusasDocx";
import { useNivelesCoordina } from "@/hooks/useNivelesCoordina";
import { useAulasProfesor } from "@/hooks/useAulasProfesor";
import { NIVEL_DE_GRADO } from "@/utils/grados";
import CalendarioFiltroDia, { keyDeDate } from "@/components/CalendarioFiltroDia";

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo": 0, "Prejardín": 1, "Jardín": 2, "Transición": 3,
  "Primero": 4, "Segundo": 5, "Tercero": 6, "Cuarto": 7, "Quinto": 8,
  "Sexto": 9, "Séptimo": 10, "Octavo": 11, "Noveno": 12,
  "Décimo": 13, "Undécimo": 14,
};

const TIPOS_SALIDA: Record<string, string> = {
  "motocicleta_vehiculo": "En su motocicleta y/o vehículo particular conduciendo el estudiante",
  "transporte": "Con el Sr(a) del transporte",
  "familiar": "Con un familiar",
};

const fmtHora = (h: string) => {
  if (!h) return "";
  const [hh, mm] = h.split(":");
  const d = new Date();
  d.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
  return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });
};

interface Autorizacion {
  id: number;
  fecha_autorizacion: string;
  hora_retiro: string | null;
  acudiente_nombres: string;
  acudiente_apellidos: string;
  acudiente_id: string;
  acudiente_telefono: string;
  acudiente_correo: string | null;
  estudiante_nombre: string;
  estudiante_apellidos: string;
  estudiante_grado: string;
  estudiante_salon: string;
  tipo_salida: string;
  nombre_persona_autorizada: string | null;
  parentesco: string | null;
  motivo: string;
  firma_url: string | null;
  archivos_url: string[] | null;
  created_at: string;
}

const RetiroEstudiantesStaff = () => {
  const navigate = useNavigate();
  const [autorizaciones, setAutorizaciones] = useState<Autorizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const [busqueda, setBusqueda] = useState("");
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  // Arranca en HOY (igual que el calendario de Actividades de padres/estudiantes).
  const [diaCal, setDiaCal] = useState<Date | undefined>(new Date());
  const [imprimirMode, setImprimirMode] = useState(false);
  const [seleccion, setSeleccion] = useState<Record<number, number>>({});
  const [descargando, setDescargando] = useState(false);

  const backLink = isAdmin()
    ? "/dashboard-admin"
    : puedeAccederDashboard()
    ? "/dashboard-rector"
    : "/dashboard";

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    if (!isProfesor() && !puedeAccederDashboard() && !isAdmin()) { navigate("/"); return; }

    const cargar = async () => {
      const { data } = await supabase
        .from("Autorizaciones_Retiro")
        .select("*")
        .order("created_at", { ascending: false });
      const lista = data || [];
      setAutorizaciones(lista);
      const maxId = lista.length > 0 ? Math.max(...lista.map((a: any) => a.id)) : 0;
      if (maxId > 0) markLastSeen('retiro', session.id!, maxId);
      setLoading(false);
    };
    cargar();
  }, [navigate]);

  // Coordinador(a): solo estudiantes de su(s) nivel(es). Profesor(a) (director
  // o no): solo estudiantes de las aulas donde dicta alguna asignatura.
  const { nivelesCoordina } = useNivelesCoordina();
  const { aulasProfesor } = useAulasProfesor();
  const visibles = autorizaciones.filter(a => {
    if (nivelesCoordina && !nivelesCoordina.includes(NIVEL_DE_GRADO[a.estudiante_grado] || "")) return false;
    if (aulasProfesor && !aulasProfesor.has(`${a.estudiante_grado}|${String(a.estudiante_salon)}`)) return false;
    return true;
  });

  const gradosUnicos = [...new Set(visibles.map(a => a.estudiante_grado))]
    .sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99));
  const salonesUnicos = [...new Set(
    visibles
      .filter(a => !filtroGrado || a.estudiante_grado === filtroGrado)
      .map(a => a.estudiante_salon)
  )].sort();

  // La búsqueda entra ANTES de diasMarcados: el calendario solo marca días con resultados.
  const authFiltradas = visibles.filter(a => {
    if (filtroGrado && a.estudiante_grado !== filtroGrado) return false;
    if (filtroSalon && a.estudiante_salon !== filtroSalon) return false;
    if (!coincideBusqueda(busqueda, a.estudiante_nombre, a.estudiante_apellidos)) return false;
    return true;
  });
  // Calendario lateral: días con registros (naranja) y filtro por día elegido.
  const diasMarcados = [...new Set(authFiltradas.map(a => fechaKey(a.created_at)))];
  const listaFinal = diaCal ? authFiltradas.filter(a => fechaKey(a.created_at) === keyDeDate(diaCal)) : authFiltradas;

  const cantidadSeleccionada = Object.keys(seleccion).length;
  const toggleImprimirMode = () => setImprimirMode(v => { if (v) setSeleccion({}); return !v; });
  const toggleSeleccion = (id: number) => {
    setSeleccion(prev => {
      const next = { ...prev };
      if (id in next) delete next[id]; else next[id] = 1;
      return next;
    });
  };
  const setCount = (id: number, n: number) => setSeleccion(prev => ({ ...prev, [id]: Math.max(1, Math.min(10, n)) }));

  const handleDescargar = async () => {
    if (cantidadSeleccionada === 0) return;
    setDescargando(true);
    try {
      const secciones: SeccionExcusa[] = [];
      for (const auth of authFiltradas) {
        const count = seleccion[auth.id];
        if (!count) continue;
        const fechaAut = new Date(auth.fecha_autorizacion + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
        const tipoSalida = (TIPOS_SALIDA[auth.tipo_salida] || auth.tipo_salida)
          + (auth.nombre_persona_autorizada ? `. Nombre: ${auth.nombre_persona_autorizada}` : "")
          + (auth.parentesco ? `. Parentesco: ${auth.parentesco}` : "");
        secciones.push({
          titulo: "AUTORIZACIÓN PARA RETIRO DE ESTUDIANTES EN JORNADA ESCOLAR",
          rows: [
            [
              { label: "Estudiante:", value: `${auth.estudiante_nombre} ${auth.estudiante_apellidos} — ${auth.estudiante_grado} ${auth.estudiante_salon}` },
              { label: "Fecha de retiro:", value: fechaAut + (auth.hora_retiro ? ` · Hora: ${fmtHora(auth.hora_retiro.slice(0, 5))}` : "") },
            ],
            [
              { label: "Sale:", value: tipoSalida },
              { label: "Motivo:", value: auth.motivo },
            ],
            [
              { label: "Acudiente:", value: `${[auth.acudiente_nombres, auth.acudiente_apellidos].filter(Boolean).join(" ")} — C.C. ${auth.acudiente_id}` },
              { label: "Teléfono:", value: auth.acudiente_telefono },
            ],
          ],
          firmaUrl: auth.firma_url,
          count,
        });
      }
      await descargarExcusasDocx(secciones, `Autorizaciones-Retiro-${todayKey()}.docx`);
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/permisos-excusas")} className="text-primary hover:underline">Permisos y Excusas</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Retiro de Estudiantes</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
            <LogOut className="h-5 w-5 text-primary" />
            Autorizaciones de Retiro
          </h2>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="relative col-span-2 sm:col-span-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o identificación…"
                    className="w-full pl-9 pr-8 py-2 border border-input rounded-md text-sm bg-background" />
                  {busqueda && (
                    <button type="button" onClick={() => setBusqueda("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" title="Borrar búsqueda">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <select value={filtroGrado} onChange={(e) => { setFiltroGrado(e.target.value); setFiltroSalon(""); }}
                  className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los grados</option>
                  {gradosUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={filtroSalon} onChange={(e) => setFiltroSalon(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los salones</option>
                  {salonesUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                <CalendarioFiltroDia diasMarcados={diasMarcados} dia={diaCal} onDia={setDiaCal} />
                <div className="flex-1 min-w-0">
              {listaFinal.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">{diaCal ? "No hay autorizaciones para este día" : "No hay autorizaciones con estos filtros"}</p>
              ) : (
                <div className="space-y-6">
                  <ImprimirToggle imprimirMode={imprimirMode} onToggle={toggleImprimirMode} cantidadSeleccionada={cantidadSeleccionada} onDescargar={handleDescargar} descargando={descargando} />
                  <p className="text-sm text-muted-foreground">{listaFinal.length} {listaFinal.length === 1 ? "autorización" : "autorizaciones"}</p>
                  {(() => {
                    const grupos: { key: string; items: typeof listaFinal }[] = [];
                    const byKey = new Map<string, typeof listaFinal>();
                    for (const a of listaFinal) {
                      const k = fechaKey(a.created_at);
                      let arr = byKey.get(k);
                      if (!arr) { arr = []; byKey.set(k, arr); grupos.push({ key: k, items: arr }); }
                      arr.push(a);
                    }
                    return grupos.map(({ key, items }) => (
                      <div key={key} className="space-y-3">
                        <h3 className="text-lg font-bold text-blue-700 border-b-2 border-blue-200 pb-2">
                          {fmtDiaHeader(key)}
                        </h3>
                        {items.map(auth => {
                          const isExpanded = expandedIds.has(auth.id);
                          const fechaAut = new Date(auth.fecha_autorizacion + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
                          const fechaCreacion = new Date(auth.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
                          return (
                      <div key={auth.id} className="border border-border rounded-lg overflow-hidden">
                        {imprimirMode && (
                          <CardSelector
                            isSelected={auth.id in seleccion}
                            count={seleccion[auth.id] || 1}
                            onToggle={() => toggleSeleccion(auth.id)}
                            onCountChange={(n) => setCount(auth.id, n)}
                          />
                        )}
                        <button onClick={() => toggleExpanded(auth.id)} className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer">
                          <div>
                            <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full mb-0.5">{auth.estudiante_grado} {auth.estudiante_salon}</span>
                            <p className="font-semibold text-foreground text-sm">{auth.estudiante_apellidos} {auth.estudiante_nombre}</p>
                            <p className="text-xs text-muted-foreground">Para el {fechaAut}{auth.hora_retiro ? ` · ${fmtHora(auth.hora_retiro.slice(0, 5))}` : ""}</p>
                            <p className="text-xs text-muted-foreground">Creada el {fechaCreacion}</p>
                          </div>
                          <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                        {isExpanded && (
                          <div className="border-t border-border p-4 bg-muted/10 text-sm text-foreground leading-relaxed space-y-3">
                            <p className="font-bold text-center">AUTORIZACIÓN PARA RETIRO DE ESTUDIANTES EN JORNADA ESCOLAR</p>
                            <p><span className="font-medium text-red-600">La autorización es para el día:</span> <span className="text-primary font-medium">{fechaAut}</span>{auth.hora_retiro && <> · <span className="font-medium text-red-600">Hora del retiro:</span> <span className="text-primary font-medium">{fmtHora(auth.hora_retiro.slice(0, 5))}</span></>}</p>
                            <p>Yo <span className="text-primary font-medium">{[auth.acudiente_nombres, auth.acudiente_apellidos].filter(Boolean).join(" ")}</span> identificado(a) con C.C. No. <span className="text-primary font-medium">{auth.acudiente_id}</span> autorizo a mi acudido(a) <span className="text-primary font-medium">{auth.estudiante_nombre} {auth.estudiante_apellidos}</span> del grado: <span className="text-primary font-medium">{auth.estudiante_grado} {auth.estudiante_salon}</span>, para que salga de la institución:</p>
                            <p><Check className="w-4 h-4 inline text-primary" /> {TIPOS_SALIDA[auth.tipo_salida] || auth.tipo_salida}{auth.nombre_persona_autorizada && <span>. Nombre: <span className="text-primary font-medium">{auth.nombre_persona_autorizada}</span></span>}{auth.parentesco && <><br/>Parentesco: <span className="text-primary font-medium">{auth.parentesco}</span></>}</p>
                            <p>Motivo: <span className="text-primary font-medium">{auth.motivo}</span></p>
                            {auth.firma_url && <div><p className="font-medium mb-1">Firma:</p><FirmaImage url={auth.firma_url} /></div>}
                            {auth.archivos_url && auth.archivos_url.length > 0 && (
                              <div className="space-y-2">
                                <p className="font-medium">Archivos adjuntos:</p>
                                {auth.archivos_url.map((url, i) => (
                                  <div key={i} className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                                      <span className="text-sm text-foreground truncate">{getCleanFilename(url)}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <button onClick={() => handleVerArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5">
                                        <Eye className="h-4 w-4" /> Ver
                                      </button>
                                      <button onClick={() => handleDescargarArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1.5">
                                        <Download className="h-4 w-4" /> Descargar
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {auth.acudiente_correo && (
                              <p>Correo electrónico: <span className="text-primary font-medium">{auth.acudiente_correo}</span></p>
                            )}
                            <p>Teléfono: <span className="text-primary font-medium">{auth.acudiente_telefono}</span></p>
                          </div>
                        )}
                      </div>
                    );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default RetiroEstudiantesStaff;
