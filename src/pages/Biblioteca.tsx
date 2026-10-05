import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Library, Tags, BookMarked, Users, type LucideIcon,
} from "lucide-react";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { getSession } from "@/hooks/useSession";
import { apiRequest } from "@/lib/apiClient";
import Catalogo from "@/components/biblioteca/Catalogo";
import Comunidad from "@/components/biblioteca/Comunidad";
import Etiquetas from "@/components/biblioteca/Etiquetas";
import MisPrestamos from "@/components/biblioteca/MisPrestamos";
import { puedeGestionar, puedeConsultar } from "@/components/biblioteca/comun";

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
  // Tres secciones (Juan 2026-10-04): Catálogo (agregar y prestar), Comunidad (cada persona: qué
  // tiene, prestar, recibir, filtros por estado) y Etiquetas. Quien no gestiona ve sus préstamos.
  const atencion = (resumen?.vencidos || 0) + (resumen?.perdidos || 0);
  const secciones: Seccion[] = [
    { k: "catalogo", titulo: "Catálogo", desc: gestiona ? "Agregar, buscar y prestar libros" : "Buscar libros", Icono: Library, color: "bg-teal-600" },
    ...(consulta ? [{ k: "comunidad", titulo: "Comunidad", desc: atencion ? `${resumen?.vencidos || 0} atrasados${resumen?.perdidos ? ` · ${resumen.perdidos} perdidos` : ""}` : "Prestar y recibir por persona", Icono: Users, color: "bg-sky-500", badge: atencion }] : []),
    ...(gestiona ? [{ k: "etiquetas", titulo: "Etiquetas", desc: resumen?.etiquetas_pendientes ? `${resumen.etiquetas_pendientes} ${resumen.etiquetas_pendientes === 1 ? "etiqueta" : "etiquetas"} sin imprimir` : "Todas impresas", Icono: Tags, color: "bg-violet-500" }] : []),
    // La bibliotecaria no pide libros prestados: no tiene "Mis préstamos".
    ...(gestiona ? [] : [{ k: "mis", titulo: acudiente ? "Préstamos de mis hijos" : "Mis préstamos", desc: acudiente ? "Libros que tienen tus hijos" : "Libros que tienes", Icono: BookMarked, color: "bg-rose-500" }]),
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
          <div className="max-w-5xl mx-auto">
            {/* Como las demás fichas: el nombre y las secciones (Juan 2026-10-04: sin cifras ni buscador aquí). */}
            <div className="bg-card rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-bold text-foreground text-center mb-6">Biblioteca</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-guia="biblioteca.secciones">
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
              {actual.k === "catalogo" && <Catalogo gestiona={gestiona} qInicial={params.get("q") || ""} />}
              {actual.k === "comunidad" && <Comunidad />}
              {actual.k === "etiquetas" && <Etiquetas />}
              {actual.k === "mis" && <MisPrestamos />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Biblioteca;
