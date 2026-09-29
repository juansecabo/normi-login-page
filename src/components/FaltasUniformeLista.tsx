import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { coincideBusqueda } from "@/utils/busqueda";

/**
 * Faltas de uniforme agrupadas por estudiante, con cuántas lleva cada uno (Juan
 * 2026-09-29). La usan el personal (Justificación por Uniforme → Faltas) y el
 * acudiente (solo ve las de sus acudidos; el servidor filtra).
 */
export interface FaltaUniforme {
  id: number;
  estudiante_id: number;
  estudiante_nombre: string;
  estudiante_apellidos: string;
  estudiante_grado: string;
  estudiante_salon: string;
  fecha: string;
  tipo: string;
  detalle: string | null;
  registrado_por_nombre: string | null;
  registrado_por_cargo: string | null;
}

const fmtFecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

interface Props {
  /** Filtro extra del lado del cliente (p. ej. niveles del coordinador). */
  filtro?: (f: FaltaUniforme) => boolean;
  /** Muestra buscador y filtros de grado/salón (personal). */
  conFiltros?: boolean;
  gradoRank?: (g: string) => number;
}

const FaltasUniformeLista = ({ filtro, conFiltros, gradoRank }: Props) => {
  const [faltas, setFaltas] = useState<FaltaUniforme[]>([]);
  const [tipos, setTipos] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");

  useEffect(() => {
    apiRequest<{ faltas: FaltaUniforme[]; tipos: Record<string, string> }>("/api/uniforme/faltas")
      .then((r) => { setFaltas(r.faltas || []); setTipos(r.tipos || {}); })
      .catch((e: any) => setError(e?.body?.detail || e?.message || "No se pudieron cargar las faltas."))
      .finally(() => setCargando(false));
  }, []);

  const visibles = useMemo(() => faltas.filter((f) => !filtro || filtro(f)), [faltas, filtro]);
  const grados = useMemo(() => [...new Set(visibles.map((f) => f.estudiante_grado))]
    .sort((a, b) => (gradoRank ? gradoRank(a) - gradoRank(b) : 0) || a.localeCompare(b, "es")), [visibles, gradoRank]);
  const salones = useMemo(() => [...new Set(visibles.filter((f) => !filtroGrado || f.estudiante_grado === filtroGrado).map((f) => f.estudiante_salon))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [visibles, filtroGrado]);

  // Una tarjeta por estudiante, los que más faltas tienen primero.
  const porEstudiante = useMemo(() => {
    const m = new Map<number, FaltaUniforme[]>();
    for (const f of visibles) {
      if (filtroGrado && f.estudiante_grado !== filtroGrado) continue;
      if (filtroSalon && f.estudiante_salon !== filtroSalon) continue;
      if (!coincideBusqueda(busqueda, f.estudiante_nombre, f.estudiante_apellidos, String(f.estudiante_id))) continue;
      m.set(f.estudiante_id, [...(m.get(f.estudiante_id) || []), f]);
    }
    return [...m.values()].sort((a, b) => b.length - a.length
      || `${a[0].estudiante_apellidos} ${a[0].estudiante_nombre}`.localeCompare(`${b[0].estudiante_apellidos} ${b[0].estudiante_nombre}`, "es"));
  }, [visibles, filtroGrado, filtroSalon, busqueda]);

  const toggle = (id: number) => setAbiertos((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (cargando) return <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  if (error) return <p className="text-center py-8 text-destructive">{error}</p>;

  return (
    <div className="space-y-4" data-guia="falta_uniforme.lista">
      {conFiltros && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o identificación…"
              className="w-full pl-9 pr-8 py-2 border border-input rounded-md text-sm bg-background" />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Borrar búsqueda"><X className="w-4 h-4" /></button>
            )}
          </div>
          <select value={filtroGrado} onChange={(e) => { setFiltroGrado(e.target.value); setFiltroSalon(""); }} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
            <option value="">Todos los grados</option>
            {grados.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filtroSalon} onChange={(e) => setFiltroSalon(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
            <option value="">Todos los salones</option>
            {salones.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {porEstudiante.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No hay faltas de uniforme registradas.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{porEstudiante.length} {porEstudiante.length === 1 ? "estudiante" : "estudiantes"} con faltas</p>
          {porEstudiante.map((lista) => {
            const e = lista[0];
            const abierto = abiertos.has(e.estudiante_id);
            return (
              <div key={e.estudiante_id} className="bg-primary/10 border border-primary/20 rounded-lg p-1.5">
                <div className="bg-card rounded-md overflow-hidden">
                  <button onClick={() => toggle(e.estudiante_id)} className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full mb-0.5">{e.estudiante_grado} {e.estudiante_salon}</span>
                      <p className="font-semibold text-foreground text-sm">{e.estudiante_apellidos} {e.estudiante_nombre}</p>
                      <p className="text-xs text-muted-foreground">Última: {fmtFecha(lista[0].fecha)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">{lista.length} {lista.length === 1 ? "falta" : "faltas"}</span>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {abierto && (
                    <div className="border-t border-border divide-y divide-border">
                      {lista.map((f) => (
                        <div key={f.id} className="p-4 text-sm space-y-1">
                          <p className="font-medium text-foreground first-letter:uppercase">{fmtFecha(f.fecha)}</p>
                          <p><span className="text-muted-foreground">Falta:</span> <span className="text-primary font-medium">{f.tipo === "otro" ? f.detalle : tipos[f.tipo] || f.tipo}</span></p>
                          {f.tipo !== "otro" && f.detalle && <p><span className="text-muted-foreground">Observación:</span> {f.detalle}</p>}
                          {f.registrado_por_nombre && <p className="text-xs text-muted-foreground">Registrada por {f.registrado_por_cargo} {f.registrado_por_nombre}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FaltasUniformeLista;
