import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, BookUp, BookDown, Library, AlarmClock, Tags, ShieldCheck, SlidersHorizontal, BookMarked,
  Hash, Loader2, AlertTriangle, type LucideIcon,
} from "lucide-react";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { Button } from "@/components/ui/button";
import { getSession } from "@/hooks/useSession";
import { apiRequest } from "@/lib/apiClient";
import Catalogo from "@/components/biblioteca/Catalogo";
import { Prestar, Devolver } from "@/components/biblioteca/Mostrador";
import PrestamosLista from "@/components/biblioteca/PrestamosLista";
import Etiquetas from "@/components/biblioteca/Etiquetas";
import PazYSalvo from "@/components/biblioteca/PazYSalvo";
import ConfigBiblioteca from "@/components/biblioteca/ConfigBiblioteca";
import MisPrestamos from "@/components/biblioteca/MisPrestamos";
import PortadaLibro from "@/components/biblioteca/PortadaLibro";
import { puedeGestionar, puedeConsultar, ESTADOS, fechaLarga, errorDe } from "@/components/biblioteca/comun";

/**
 * Ficha Biblioteca (Juan 2026-10-04): portada con cifras, código rápido y secciones.
 *  - Todos: Catálogo y Mis préstamos (el acudiente, los de cada hijo).
 *  - Bibliotecario(a) y Administrador: Prestar, Devolver, Préstamos, Etiquetas, Paz y salvo, Reglas.
 *  - Rector, coordinación, secretaría y administrativos: Préstamos y Paz y salvo; el rector, Reglas.
 * Todo funciona por CÓDIGO del libro (BIB-0001), sin cámara ni lectores.
 */
interface Seccion { k: string; titulo: string; desc: string; Icono: LucideIcon; color: string; badge?: number }
interface Resumen { titulos: number; copias: number; prestados?: number; vencidos?: number; perdidos?: number; etiquetas_pendientes?: number }

const Biblioteca = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const session = getSession();
  const gestiona = puedeGestionar();
  const consulta = puedeConsultar();
  const acudiente = session.cargo === "Acudiente";
  const [resumen, setResumen] = useState<Resumen | null>(null);

  useEffect(() => { if (!session.id) navigate("/"); }, [navigate, session.id]);
  const seccion = params.get("seccion");
  useEffect(() => { if (!seccion) apiRequest<Resumen>("/api/biblioteca/resumen").then(setResumen).catch(() => null); }, [seccion]);

  const ir = (k: string | null, extra: Record<string, string> = {}) => setParams(k ? { seccion: k, ...extra } : {}, { replace: false });

  const secciones: Seccion[] = [
    ...(gestiona ? [
      { k: "prestar", titulo: "Prestar", desc: "Registrar la salida de un libro", Icono: BookUp, color: "from-emerald-500 to-emerald-600" },
      { k: "devolver", titulo: "Devolver", desc: "Recibir un libro", Icono: BookDown, color: "from-sky-500 to-sky-600" },
    ] : []),
    { k: "catalogo", titulo: "Catálogo", desc: gestiona ? "Buscar y agregar libros" : "Buscar libros", Icono: Library, color: "from-teal-500 to-teal-700" },
    ...(consulta ? [{ k: "prestamos", titulo: "Préstamos", desc: resumen?.vencidos ? `${resumen.vencidos} vencidos` : "En préstamo e historial", Icono: AlarmClock, color: "from-amber-500 to-orange-500", badge: (resumen?.vencidos || 0) + (resumen?.perdidos || 0) }] : []),
    ...(gestiona ? [{ k: "etiquetas", titulo: "Etiquetas", desc: resumen?.etiquetas_pendientes ? `${resumen.etiquetas_pendientes} por imprimir` : "Imprimir códigos y lomos", Icono: Tags, color: "from-violet-500 to-purple-600", badge: resumen?.etiquetas_pendientes || 0 }] : []),
    ...(consulta ? [
      { k: "paz", titulo: "Paz y salvo", desc: "Quién debe libros por salón", Icono: ShieldCheck, color: "from-green-600 to-emerald-700" },
      { k: "reglas", titulo: "Reglas", desc: "Libros y días de préstamo", Icono: SlidersHorizontal, color: "from-slate-500 to-slate-700" },
    ] : []),
    { k: "mis", titulo: acudiente ? "Préstamos de mis hijos" : "Mis préstamos", desc: acudiente ? "Libros que tienen tus hijos" : "Libros que tienes", Icono: BookMarked, color: "from-rose-500 to-pink-600" },
  ];
  const actual = secciones.find((s) => s.k === seccion) || null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8 pb-24 lg:pb-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            {actual ? (
              <>
                <button onClick={() => ir(null)} className="text-primary hover:underline">Biblioteca</button>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="text-foreground font-medium">{actual.titulo}</span>
              </>
            ) : <span className="text-foreground font-medium">Biblioteca</span>}
          </BreadcrumbDeslizable>
        </div>

        {!actual ? (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Portada */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-emerald-600 to-green-700 text-white p-6 md:p-8 shadow-lg">
              <Library className="absolute -right-8 -bottom-10 w-64 h-64 text-white/10 pointer-events-none" strokeWidth={1.2} />
              <div className="relative">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Biblioteca</h1>
                <p className="text-white/85 mt-1">{gestiona ? "Catálogo, préstamos y etiquetas del colegio." : "Busca un libro y mira si está disponible."}</p>
                {resumen && (
                  <div className="flex flex-wrap gap-3 mt-5">
                    <Cifra n={resumen.titulos} t={resumen.titulos === 1 ? "título" : "títulos"} />
                    <Cifra n={resumen.copias} t={resumen.copias === 1 ? "copia" : "copias"} />
                    {resumen.prestados !== undefined && <Cifra n={resumen.prestados} t="prestados" />}
                    {!!resumen.vencidos && <Cifra n={resumen.vencidos} t="vencidos" alerta />}
                  </div>
                )}
                {gestiona && <CodigoRapido onIr={ir} />}
              </div>
            </div>

            {/* Secciones */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-guia="biblioteca.secciones">
              {secciones.map((s) => (
                <button key={s.k} data-guia={`biblioteca.tab_${s.k}`} onClick={() => ir(s.k)}
                  className="group relative text-left rounded-2xl bg-card border border-border p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
                  {!!s.badge && <span className="absolute top-3 right-3 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{s.badge > 99 ? "99+" : s.badge}</span>}
                  <span className={`w-12 h-12 rounded-xl bg-gradient-to-br ${s.color} text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
                    <s.Icono className="w-6 h-6" />
                  </span>
                  <p className="mt-4 font-semibold text-foreground">{s.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => ir(null)} className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted" title="Volver"><ArrowLeft className="w-5 h-5" /></button>
              <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${actual.color} text-white flex items-center justify-center shadow`}><actual.Icono className="w-5 h-5" /></span>
              <h2 className="text-2xl font-bold text-foreground">{actual.titulo}</h2>
            </div>
            <div className="bg-card rounded-2xl shadow-soft border border-border p-4 md:p-6">
              {actual.k === "prestar" && <Prestar codigoInicial={params.get("codigo")} />}
              {actual.k === "devolver" && <Devolver codigoInicial={params.get("codigo")} />}
              {actual.k === "catalogo" && <Catalogo gestiona={gestiona} qInicial={params.get("q") || ""} />}
              {actual.k === "prestamos" && <PrestamosLista gestiona={gestiona} />}
              {actual.k === "etiquetas" && <Etiquetas />}
              {actual.k === "paz" && <PazYSalvo />}
              {actual.k === "reglas" && <ConfigBiblioteca editable={gestiona || session.cargo === "Rector"} />}
              {actual.k === "mis" && <MisPrestamos />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const Cifra = ({ n, t, alerta }: { n: number; t: string; alerta?: boolean }) => (
  <div className={`rounded-xl px-4 py-2 backdrop-blur ${alerta ? "bg-red-500/90" : "bg-white/15"}`}>
    <span className="text-2xl font-bold">{n.toLocaleString("es-CO")}</span>
    <span className="ml-1.5 text-sm text-white/90">{t}</span>
  </div>
);

/** Código rápido: se escribe el código de la etiqueta y se ve el libro con lo que se puede hacer. */
const CodigoRapido = ({ onIr }: { onIr: (k: string, extra?: Record<string, string>) => void }) => {
  const [v, setV] = useState("");
  const [cargando, setCargando] = useState(false);
  const [res, setRes] = useState<{ ejemplar: any; prestamo: any } | null>(null);
  const [error, setError] = useState("");
  const buscar = async () => {
    if (!v.trim()) return;
    setCargando(true); setError(""); setRes(null);
    try { setRes(await apiRequest(`/api/biblioteca/ejemplar/${encodeURIComponent(v.trim())}`)); }
    catch (err) { setError(errorDe(err)); }
    setCargando(false);
  };
  const e = res?.ejemplar;
  return (
    <div className="mt-6 max-w-xl" data-guia="biblioteca.codigo_rapido">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-teal-700" />
          <input value={v} onChange={(ev) => setV(ev.target.value.toUpperCase())} onKeyDown={(ev) => { if (ev.key === "Enter") buscar(); }}
            placeholder="Código del libro (BIB-0001)" autoComplete="off"
            className="w-full pl-10 pr-3 py-3 rounded-xl bg-white text-foreground font-mono tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground focus:outline-none focus:ring-4 focus:ring-white/40" />
        </div>
        <Button onClick={buscar} disabled={cargando || !v.trim()} className="h-auto px-5 rounded-xl bg-white text-teal-700 hover:bg-white/90 font-semibold">
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
        </Button>
      </div>
      {error && <p className="mt-2 flex items-center gap-2 text-sm bg-white/15 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4" /> {error}</p>}
      {e && (
        <div className="mt-3 rounded-2xl bg-white text-foreground p-3 flex gap-3 items-center shadow-lg">
          <PortadaLibro url={e.Biblioteca_Obras?.portada_url} titulo={e.Biblioteca_Obras?.titulo || ""} genero={null} className="w-12 h-16 rounded-lg shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{e.Biblioteca_Obras?.titulo}</p>
            <p className="text-xs text-muted-foreground"><span className="font-mono">{e.codigo}</span> · <span className={`px-1.5 py-0.5 rounded ${ESTADOS[e.estado]?.cls || ""}`}>{ESTADOS[e.estado]?.label}</span></p>
            {res?.prestamo && <p className="text-xs text-muted-foreground mt-0.5">Lo tiene {res.prestamo.usuario_nombre} · vence {fechaLarga(res.prestamo.fecha_vencimiento)}</p>}
          </div>
          {e.estado === "disponible" && e.tipo_prestamo !== "sala" && <Button size="sm" className="rounded-lg" onClick={() => onIr("prestar", { codigo: e.codigo })}>Prestar</Button>}
          {e.estado === "prestado" && res?.prestamo && !res.prestamo.perdido && <Button size="sm" className="rounded-lg" onClick={() => onIr("devolver", { codigo: e.codigo })}>Recibir</Button>}
        </div>
      )}
    </div>
  );
};

export default Biblioteca;
