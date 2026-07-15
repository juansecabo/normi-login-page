import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isProfesor, puedeAccederDashboard, isAdmin } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { CalendarOff, ChevronDown, Check, Paperclip, Eye, Download } from "lucide-react";
import { getCleanFilename, handleVerArchivo, handleDescargarArchivo } from "@/utils/archivoUtils";
import FirmaImage from "@/components/FirmaImage";
import { markLastSeen } from "@/utils/notificaciones";
import { fechaKey, fmtDiaHeader, todayKey } from "@/utils/fechaUtils";
import { ImprimirToggle, CardSelector } from "@/components/ImprimirSelector";
import { descargarExcusasDocx, SeccionExcusa } from "@/utils/printExcusasDocx";
import { useNivelesCoordina } from "@/hooks/useNivelesCoordina";
import { NIVEL_DE_GRADO } from "@/utils/grados";

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo": 0, "Prejardín": 1, "Jardín": 2, "Transición": 3,
  "Primero": 4, "Segundo": 5, "Tercero": 6, "Cuarto": 7, "Quinto": 8,
  "Sexto": 9, "Séptimo": 10, "Octavo": 11, "Noveno": 12,
  "Décimo": 13, "Undécimo": 14,
};

const MOTIVOS: Record<string, string> = {
  enfermedad: "Enfermedad", cita_medica: "Cita médica", calamidad_familiar: "Calamidad familiar",
  diligencia_personal: "Diligencia personal", actividad_institucional: "Actividad institucional", otro: "Otro",
};

interface Justificacion {
  id: number; fecha_inicio: string; fecha_fin: string; dias_ausente: number; ciudad_fecha: string;
  estudiante_nombre: string; estudiante_apellidos: string; estudiante_grado: string; estudiante_salon: string; estudiante_documento: string;
  motivo_tipo: string; motivo_otro: string | null; motivo_descripcion: string;
  acudiente_nombres: string; acudiente_apellidos: string; acudiente_id: string; acudiente_parentesco: string | null;
  acudiente_telefono: string; firma_url: string | null; archivos_url: string[] | null; created_at: string;
}

const fmtFecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

const JustificacionInasistenciaStaff = () => {
  const navigate = useNavigate();
  const [justificaciones, setJustificaciones] = useState<Justificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [imprimirMode, setImprimirMode] = useState(false);
  const [seleccion, setSeleccion] = useState<Record<number, number>>({});
  const [descargando, setDescargando] = useState(false);

  const backLink = isAdmin() ? "/dashboard-admin" : puedeAccederDashboard() ? "/dashboard-rector" : "/dashboard";

  useEffect(() => {
    const session = getSession();
    if (!session.id || (!isProfesor() && !puedeAccederDashboard() && !isAdmin())) { navigate("/"); return; }
    supabase.from("Justificaciones_Inasistencia").select("*").order("created_at", { ascending: false })
      .then(({ data }) => {
        const lista = data || [];
        setJustificaciones(lista);
        const maxId = lista.length > 0 ? Math.max(...lista.map((j: any) => j.id)) : 0;
        if (maxId > 0) markLastSeen('inasistencia', session.id!, maxId);
        setLoading(false);
      });
  }, [navigate]);

  // Coordinador(a): solo ve estudiantes de su(s) nivel(es); null = sin restricción.
  const { nivelesCoordina } = useNivelesCoordina();
  const visibles = nivelesCoordina
    ? justificaciones.filter(j => nivelesCoordina.includes(NIVEL_DE_GRADO[j.estudiante_grado] || ""))
    : justificaciones;

  const gradosUnicos = [...new Set(visibles.map(j => j.estudiante_grado))]
    .sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99));
  const salonesUnicos = [...new Set(
    visibles
      .filter(j => !filtroGrado || j.estudiante_grado === filtroGrado)
      .map(j => j.estudiante_salon)
  )].sort();

  const justFiltradas = visibles.filter(j => {
    if (filtroGrado && j.estudiante_grado !== filtroGrado) return false;
    if (filtroSalon && j.estudiante_salon !== filtroSalon) return false;
    return true;
  });

  const cantidadSeleccionada = Object.keys(seleccion).length;
  const toggleImprimirMode = () => {
    setImprimirMode(v => { if (v) setSeleccion({}); return !v; });
  };
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
      for (const j of justFiltradas) {
        const count = seleccion[j.id];
        if (!count) continue;
        const fechasTexto = j.dias_ausente === 1 ? fmtFecha(j.fecha_inicio) : `${fmtFecha(j.fecha_inicio)} — ${fmtFecha(j.fecha_fin)}`;
        const motivo = (MOTIVOS[j.motivo_tipo] || j.motivo_tipo) + (j.motivo_otro ? `: ${j.motivo_otro}` : "");
        secciones.push({
          titulo: "FORMATO DE JUSTIFICACIÓN POR INASISTENCIA",
          encabezado: j.ciudad_fecha,
          rows: [
            [
              { label: "Estudiante:", value: `${j.estudiante_nombre} ${j.estudiante_apellidos} — ${j.estudiante_grado} ${j.estudiante_salon}` },
              { label: "Fecha(s):", value: `${fechasTexto} — ${j.dias_ausente} día(s)` },
            ],
            [
              { label: "Motivo:", value: motivo },
              { label: "Descripción:", value: j.motivo_descripcion },
            ],
            [
              { label: "Acudiente:", value: `${[j.acudiente_nombres, j.acudiente_apellidos].filter(Boolean).join(" ")} — C.C. ${j.acudiente_id}${j.acudiente_parentesco ? ` — ${j.acudiente_parentesco}` : ""}` },
              { label: "Teléfono:", value: j.acudiente_telefono },
            ],
          ],
          firmaUrl: j.firma_url,
          count,
        });
      }
      await descargarExcusasDocx(secciones, `Justificaciones-Inasistencia-${todayKey()}.docx`);
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
            <span className="text-foreground font-medium">Justificación por Inasistencia</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
            <CalendarOff className="h-5 w-5 text-primary" /> Justificaciones por Inasistencia
          </h2>

          {loading ? <div className="text-center py-8 text-muted-foreground">Cargando...</div> : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={filtroGrado} onChange={(e) => { setFiltroGrado(e.target.value); setFiltroSalon(""); }} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los grados</option>
                  {gradosUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={filtroSalon} onChange={(e) => setFiltroSalon(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los salones</option>
                  {salonesUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {justFiltradas.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay justificaciones con estos filtros</p>
              ) : (
                <div className="space-y-6">
                  <ImprimirToggle imprimirMode={imprimirMode} onToggle={toggleImprimirMode} cantidadSeleccionada={cantidadSeleccionada} onDescargar={handleDescargar} descargando={descargando} />
                  <p className="text-sm text-muted-foreground">{justFiltradas.length} {justFiltradas.length === 1 ? "justificación" : "justificaciones"}</p>
                  {(() => {
                    const grupos: { key: string; items: typeof justFiltradas }[] = [];
                    const byKey = new Map<string, typeof justFiltradas>();
                    for (const j of justFiltradas) {
                      const k = fechaKey(j.created_at);
                      let arr = byKey.get(k);
                      if (!arr) { arr = []; byKey.set(k, arr); grupos.push({ key: k, items: arr }); }
                      arr.push(j);
                    }
                    return grupos.map(({ key, items }) => (
                      <div key={key} className="space-y-3">
                        <h3 className="text-lg font-bold text-blue-700 border-b-2 border-blue-200 pb-2">
                          {fmtDiaHeader(key)}
                        </h3>
                        {items.map(j => {
                          const isExp = expandedIds.has(j.id);
                          const fechaCreacion = new Date(j.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
                          return (
                      <div key={j.id} className="bg-primary/10 border border-primary/20 rounded-lg p-1.5">
                        {imprimirMode && (
                          <CardSelector
                            isSelected={j.id in seleccion}
                            count={seleccion[j.id] || 1}
                            onToggle={() => toggleSeleccion(j.id)}
                            onCountChange={(n) => setCount(j.id, n)}
                          />
                        )}
                        <div className="bg-card rounded-md overflow-hidden">
                        <button onClick={() => toggleExpanded(j.id)} className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer">
                          <div>
                            <span className="inline-block px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full mb-0.5">{j.estudiante_grado} {j.estudiante_salon}</span>
                            <p className="font-semibold text-foreground text-sm">{j.estudiante_apellidos} {j.estudiante_nombre}</p>
                            <p className="text-xs text-muted-foreground">{j.dias_ausente === 1 ? fmtFecha(j.fecha_inicio) : `${fmtFecha(j.fecha_inicio)} — ${fmtFecha(j.fecha_fin)}`} ({j.dias_ausente} día{j.dias_ausente > 1 ? "s" : ""})</p>
                            <p className="text-xs text-muted-foreground">Creada el {fechaCreacion}</p>
                          </div>
                          <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${isExp ? "rotate-180" : ""}`} />
                        </button>
                        {isExp && (
                          <div className="border-t border-border p-4 bg-card text-sm text-foreground leading-relaxed space-y-3">
                            <p className="font-bold text-center">FORMATO DE JUSTIFICACIÓN POR INASISTENCIA</p>
                            <p>{j.ciudad_fecha}</p>
                            <p><span className="font-medium">Estudiante:</span> <span className="text-primary font-medium">{j.estudiante_nombre} {j.estudiante_apellidos}</span> — <span className="text-primary font-medium">{j.estudiante_grado} {j.estudiante_salon}</span></p>
                            <p><span className="font-medium">Fecha(s):</span> <span className="text-primary font-medium">{j.dias_ausente === 1 ? fmtFecha(j.fecha_inicio) : `${fmtFecha(j.fecha_inicio)} — ${fmtFecha(j.fecha_fin)}`}</span> — <span className="text-primary font-medium">{j.dias_ausente} día(s)</span></p>
                            <p><span className="font-medium">Motivo:</span> <Check className="w-4 h-4 inline text-primary" /> {MOTIVOS[j.motivo_tipo] || j.motivo_tipo}{j.motivo_otro ? `: ${j.motivo_otro}` : ""}</p>
                            <p><span className="font-medium">Descripción:</span> <span className="text-primary font-medium">{j.motivo_descripcion}</span></p>
                            <p><span className="font-medium">Acudiente:</span> <span className="text-primary font-medium">{[j.acudiente_nombres, j.acudiente_apellidos].filter(Boolean).join(" ")}</span> — C.C. <span className="text-primary font-medium">{j.acudiente_id}</span>{j.acudiente_parentesco ? ` — ${j.acudiente_parentesco}` : ""}</p>
                            <p>Teléfono: <span className="text-primary font-medium">{j.acudiente_telefono}</span></p>
                            {j.firma_url && <div><p className="font-medium mb-1">Firma:</p><FirmaImage url={j.firma_url} /></div>}
                            {j.archivos_url && j.archivos_url.length > 0 && (
                              <div className="space-y-2">
                                <p className="font-medium">Archivos adjuntos:</p>
                                {j.archivos_url.map((url, i) => (
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
                          </div>
                        )}
                        </div>
                      </div>
                    );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default JustificacionInasistenciaStaff;
