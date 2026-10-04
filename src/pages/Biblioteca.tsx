import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BookUp, BookDown, Library, AlarmClock, Tags, ShieldCheck, SlidersHorizontal, BookMarked,
  Search, X, Loader2, type LucideIcon,
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
import ObraDetalle from "@/components/biblioteca/ObraDetalle";
import { puedeGestionar, puedeConsultar, ESTADOS, fechaLarga, fechaCorta, autoresBonitos, type ObraResumen } from "@/components/biblioteca/comun";

/**
 * Ficha Biblioteca (Juan 2026-10-04): portada con cifras, código rápido y secciones.
 *  - Todos: Catálogo y Mis préstamos (el acudiente, los de cada hijo).
 *  - Bibliotecario(a) y Administrador: Prestar, Devolver, Préstamos, Etiquetas, Paz y salvo, Reglas.
 *  - Rector, coordinación, secretaría y administrativos: Préstamos y Paz y salvo; el rector, Reglas.
 * Todo funciona por el NÚMERO del libro (1, 2, 3…), sin cámara ni lectores. Sin flecha de
 * regreso: las migas bastan (Juan 2026-10-04).
 */
interface Seccion { k: string; titulo: string; desc: string; Icono: LucideIcon; color: string; badge?: number }
let resumenCache: Resumen | null = null;
interface Resumen { titulos: number; copias: number; prestados?: number; vencidos?: number; perdidos?: number; etiquetas_pendientes?: number }

const Biblioteca = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const session = getSession();
  const gestiona = puedeGestionar();
  const consulta = puedeConsultar();
  const acudiente = session.cargo === "Acudiente";
  // Cifras en memoria: al volver a la portada salen al instante (y se refrescan detrás).
  const [resumen, setResumen] = useState<Resumen | null>(resumenCache);

  useEffect(() => { if (!session.id) navigate("/"); }, [navigate, session.id]);
  const seccion = params.get("seccion");
  useEffect(() => { if (!seccion) apiRequest<Resumen>("/api/biblioteca/resumen").then((r) => { resumenCache = r; setResumen(r); }).catch(() => null); }, [seccion]);

  const ir = (k: string | null, extra: Record<string, string> = {}) => setParams(k ? { seccion: k, ...extra } : {}, { replace: false });

  // Orden lógico de la vida de un libro (Juan 2026-10-04): registrarlo, etiquetarlo, prestarlo,
  // recibirlo, seguir los préstamos y, al final del año, el paz y salvo.
  const secciones: Seccion[] = [
    { k: "catalogo", titulo: "Catálogo", desc: gestiona ? "Registrar y buscar libros" : "Buscar libros", Icono: Library, color: "bg-teal-600" },
    ...(gestiona ? [
      { k: "etiquetas", titulo: "Etiquetas", desc: resumen?.etiquetas_pendientes ? `${resumen.etiquetas_pendientes} ${resumen.etiquetas_pendientes === 1 ? "etiqueta" : "etiquetas"} sin imprimir` : "Todas impresas", Icono: Tags, color: "bg-violet-500" },
      { k: "prestar", titulo: "Prestar", desc: "Registrar la salida de un libro", Icono: BookUp, color: "bg-emerald-500" },
      { k: "devolver", titulo: "Devolver", desc: "Recibir un libro", Icono: BookDown, color: "bg-sky-500" },
    ] : []),
    ...(consulta ? [{ k: "prestamos", titulo: "Préstamos", desc: resumen?.vencidos ? `${resumen.vencidos} vencidos` : "Quién tiene cada libro", Icono: AlarmClock, color: "bg-orange-500", badge: (resumen?.vencidos || 0) + (resumen?.perdidos || 0) }] : []),
    ...(consulta ? [
      { k: "paz", titulo: "Paz y salvo", desc: "Quién debe libros por salón", Icono: ShieldCheck, color: "bg-green-600" },
      { k: "reglas", titulo: "Reglas", desc: "Libros y días de préstamo", Icono: SlidersHorizontal, color: "bg-slate-500" },
    ] : []),
    { k: "mis", titulo: acudiente ? "Préstamos de mis hijos" : "Mis préstamos", desc: acudiente ? "Libros que tienen tus hijos" : "Libros que tienes", Icono: BookMarked, color: "bg-rose-500" },
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
            {/* Encabezado como las demás fichas: nombre + cifras (espacio reservado mientras cargan). */}
            <div className="bg-card rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-bold text-foreground text-center">Biblioteca</h2>
              <div className="flex flex-wrap justify-center gap-3 mt-4 min-h-[44px]" data-guia="biblioteca.cifras">
                {resumen ? (<>
                  <Cifra n={resumen.titulos} t={resumen.titulos === 1 ? "título" : "títulos"} />
                  {resumen.prestados !== undefined && <Cifra n={resumen.prestados} t={resumen.prestados === 1 ? "prestado" : "prestados"} />}
                  {!!resumen.vencidos && <Cifra n={resumen.vencidos} t={resumen.vencidos === 1 ? "vencido" : "vencidos"} alerta />}
                </>) : (
                  [0, 1, 2].slice(0, consulta ? 2 : 1).map((i) => <div key={i} className="h-11 w-32 rounded-lg bg-muted animate-pulse" />)
                )}
              </div>
            </div>

            {/* Barra aparte: buscador por título, autor o número. */}
            <Buscador gestiona={gestiona} onIr={ir} />

            {/* Secciones */}
            <div className="bg-card rounded-lg shadow-soft p-4 md:p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-guia="biblioteca.secciones">
                {secciones.map((s) => (
                  <button key={s.k} data-guia={`biblioteca.tab_${s.k}`} onClick={() => ir(s.k)}
                    className="relative text-left rounded-xl bg-card border border-border p-5 hover:bg-muted/50 hover:border-primary/40 transition-colors">
                    {!!s.badge && <span className="absolute top-3 right-3 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{s.badge > 99 ? "99+" : s.badge}</span>}
                    <span className={`w-12 h-12 rounded-xl ${s.color} text-white flex items-center justify-center`}>
                      <s.Icono className="w-6 h-6" />
                    </span>
                    <p className="mt-4 font-semibold text-foreground">{s.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            <div className="bg-card rounded-lg shadow-soft p-4 md:p-6">
              <h2 className="text-xl font-bold text-foreground text-center mb-6">{actual.titulo}</h2>
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
  <div className={`rounded-lg px-4 py-2 ${alerta ? "bg-red-50 text-red-700" : "bg-muted text-foreground"}`}>
    <span className="text-xl font-bold">{n.toLocaleString("es-CO")}</span>
    <span className={`ml-1.5 text-sm ${alerta ? "text-red-700" : "text-muted-foreground"}`}>{t}</span>
  </div>
);

/**
 * Buscador de la portada (para todos): por título, autor, materia, ISBN o número del libro, sin
 * importar tildes ni mayúsculas, con resultados mientras se escribe. Si se escribe el número de
 * un libro, quien gestiona ve además su estado y puede prestarlo o recibirlo de una vez.
 */
const Buscador = ({ gestiona, onIr }: { gestiona: boolean; onIr: (k: string, extra?: Record<string, string>) => void }) => {
  const [v, setV] = useState("");
  const [cargando, setCargando] = useState(false);
  const [obras, setObras] = useState<ObraResumen[] | null>(null);
  const [total, setTotal] = useState(0);
  const [ej, setEj] = useState<{ ejemplar: any; prestamo: any } | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const req = useRef(0);

  useEffect(() => {
    const q = v.trim();
    if (!q) { setObras(null); setEj(null); return; }
    const id = ++req.current;
    const t = setTimeout(async () => {
      setCargando(true);
      const numero = /^\d{1,7}$/.test(q);
      const [cat, e] = await Promise.all([
        apiRequest<{ obras: ObraResumen[]; total: number }>(`/api/biblioteca/catalogo?q=${encodeURIComponent(q)}`).catch(() => ({ obras: [], total: 0 })),
        gestiona && numero ? apiRequest<{ ejemplar: any; prestamo: any }>(`/api/biblioteca/ejemplar/${q}`).catch(() => null) : Promise.resolve(null),
      ]);
      if (id !== req.current) return;
      // El libro del número ya sale arriba con sus acciones: no se repite en la lista.
      const obraDelNumero = e?.ejemplar?.obra_id;
      setObras(cat.obras.filter((o) => o.id !== obraDelNumero).slice(0, 6)); setTotal(cat.total - (obraDelNumero ? 1 : 0)); setEj(e); setCargando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [v, gestiona]);

  const e = ej?.ejemplar;
  return (
    <div className="bg-card rounded-lg shadow-soft p-4" data-guia="biblioteca.buscador">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input value={v} onChange={(ev) => setV(ev.target.value)} autoComplete="off"
          placeholder="Buscar por título, autor o número del libro"
          className="w-full pl-10 pr-10 py-3 border-2 border-input rounded-lg bg-background text-foreground focus:border-primary focus:outline-none" />
        {cargando ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          : v && <button onClick={() => setV("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Borrar"><X className="w-4 h-4" /></button>}
      </div>

      {e && (
        <div className="mt-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-3 flex gap-3 items-center">
          <PortadaLibro url={e.Biblioteca_Obras?.portada_url} titulo={e.Biblioteca_Obras?.titulo || ""} genero={e.Biblioteca_Obras?.genero || null} className="w-12 h-16 rounded-lg shrink-0" mini />
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{e.Biblioteca_Obras?.titulo}</p>
            <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Libro N.° {e.codigo}</span> · <span className={`px-1.5 py-0.5 rounded ${ESTADOS[e.estado]?.cls || ""}`}>{ESTADOS[e.estado]?.label}</span></p>
            {ej?.prestamo && <p className="text-xs text-muted-foreground mt-0.5">Lo tiene {ej.prestamo.usuario_nombre} · vence {fechaLarga(ej.prestamo.fecha_vencimiento)}</p>}
          </div>
          {e.estado === "disponible" && e.tipo_prestamo !== "sala" && <Button size="sm" className="rounded-lg" onClick={() => onIr("prestar", { codigo: e.codigo })}>Prestar</Button>}
          {e.estado === "prestado" && ej?.prestamo && !ej.prestamo.perdido && <Button size="sm" className="rounded-lg" onClick={() => onIr("devolver", { codigo: e.codigo })}>Recibir</Button>}
        </div>
      )}

      {obras && (
        obras.length === 0 && !e ? <p className="mt-3 text-sm text-muted-foreground text-center">No se encontraron libros.</p> : obras.length > 0 && (
          <div className="mt-3 divide-y divide-border rounded-lg border border-border overflow-hidden">
            {obras.map((o) => (
              <button key={o.id} onClick={() => setAbierta(o.id)} className="w-full text-left flex items-center gap-3 p-2.5 hover:bg-muted/50">
                <PortadaLibro url={o.portada_url} titulo={o.titulo} genero={o.genero} className="w-9 h-12 rounded shrink-0" mini />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{o.titulo}</p>
                  {o.autores && <p className="text-xs text-muted-foreground truncate">{autoresBonitos(o.autores)}</p>}
                </div>
                <span className={`text-xs font-medium shrink-0 ${o.disponibles > 0 ? "text-emerald-700" : o.sala ? "text-sky-700" : "text-amber-700"}`}>
                  {o.disponibles > 0 ? `${o.disponibles} ${o.disponibles === 1 ? "disponible" : "disponibles"}` : o.sala ? "Solo en sala" : o.proxima ? `Vuelve ${fechaCorta(o.proxima)}` : "No disponible"}
                </span>
              </button>
            ))}
            {total > obras.length && (
              <button onClick={() => onIr("catalogo", { q: v.trim() })} className="w-full p-2.5 text-sm text-primary font-medium hover:bg-muted/50">Ver los {total} resultados</button>
            )}
          </div>
        )
      )}
      <ObraDetalle obraId={abierta} onCerrar={() => setAbierta(null)} onEditar={() => { setAbierta(null); onIr("catalogo", { q: v.trim() }); }} onCambio={() => null} />
    </div>
  );
};

export default Biblioteca;
