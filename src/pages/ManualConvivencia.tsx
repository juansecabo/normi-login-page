import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ChevronUp } from "lucide-react";
import { getSession } from "@/hooks/useSession";
import { apiClient } from "@/lib/apiClient";
import HeaderNormi from "@/components/HeaderNormi";

import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const ManualConvivencia = () => {
  const navigate = useNavigate();
  const [html, setHtml] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [totalResultados, setTotalResultados] = useState(0);
  const [resultadoActual, setResultadoActual] = useState(0);
  const contenidoRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine back link based on role
  const session = getSession();
  const backLink = session.cargo === "Estudiante"
    ? "/dashboard"
    : (session.cargo === "Acudiente")
    ? "/dashboard"
    : session.cargo === "Profesor(a)"
    ? "/dashboard"
    : "/";

  useEffect(() => {
    if (!session.id) {
      navigate("/");
      return;
    }

    // Cada colegio tiene su manual en /manuales/{colegio_id}.pdf. Si todavía no
    // se subió (p. ej. la Normal), se cae al HTML antiguo. Así el manual es
    // multi-tenant sin hardcodear colegios.
    const cargarHtml = () => {
      fetch("/manual-convivencia.html")
        .then((res) => res.text())
        .then((data) => { setHtml(data); setLoading(false); })
        .catch(() => setLoading(false));
    };

    const cargar = async () => {
      // 1) PDF subido por UI → guardado en Colegios.configuracion.manual_url (Storage).
      try {
        const { config } = await apiClient.colegio.getConfig();
        const url = (config as any)?.manual_url;
        if (url) { setPdfUrl(url); setLoading(false); return; }
      } catch { /* sin config → seguir */ }

      // 2) PDF estático por colegio_id (Normal/Pestalozziano cargados a mano en public/manuales).
      if (session.colegio_id) {
        const url = `/manuales/${session.colegio_id}/Manual%20de%20Convivencia.pdf`;
        try {
          const head = await fetch(url, { method: "HEAD" });
          const tipo = head.headers.get("content-type") || "";
          if (head.ok && tipo.includes("pdf")) {
            setPdfUrl(url);
            setLoading(false);
            return;
          }
        } catch { /* sin PDF → fallback */ }
      }

      // 3) Respaldo HTML antiguo.
      cargarHtml();
    };
    cargar();
  }, [navigate, session.id, session.colegio_id]);

  const resaltarResultados = useCallback(() => {
    const container = contenidoRef.current;
    if (!container) return;

    // Remove previous highlights
    container.querySelectorAll("mark.search-highlight").forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
        parent.normalize();
      }
    });

    const termino = busqueda.trim();
    if (!termino) {
      setTotalResultados(0);
      setResultadoActual(0);
      return;
    }

    const terminoNorm = normalize(termino);
    let count = 0;

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || "";
        const textNorm = normalize(text);
        const idx = textNorm.indexOf(terminoNorm);
        if (idx === -1) return;

        const before = text.slice(0, idx);
        const match = text.slice(idx, idx + termino.length);
        const after = text.slice(idx + termino.length);

        const mark = document.createElement("mark");
        mark.className = "search-highlight bg-yellow-300 rounded px-0.5";
        mark.dataset.index = String(count);
        mark.textContent = match;
        count++;

        const frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));
        frag.appendChild(mark);
        if (after) {
          const afterNode = document.createTextNode(after);
          frag.appendChild(afterNode);
          // Process remaining text for more matches
          node.parentNode?.replaceChild(frag, node);
          walk(afterNode);
          return;
        }
        node.parentNode?.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE && node.nodeName !== "MARK") {
        // Copy children to array since we'll modify the DOM
        const children = Array.from(node.childNodes);
        children.forEach(walk);
      }
    };

    walk(container);
    setTotalResultados(count);
    setResultadoActual(count > 0 ? 1 : 0);

    // Scroll to first result
    if (count > 0) {
      const first = container.querySelector('mark[data-index="0"]');
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [busqueda]);

  useEffect(() => {
    if (!loading && html) {
      const timeout = setTimeout(resaltarResultados, 300);
      return () => clearTimeout(timeout);
    }
  }, [busqueda, loading, html, resaltarResultados]);

  const irAResultado = (index: number) => {
    const container = contenidoRef.current;
    if (!container || totalResultados === 0) return;

    // Remove active styling from all
    container.querySelectorAll("mark.search-highlight").forEach((m) => {
      (m as HTMLElement).classList.remove("bg-orange-400");
      (m as HTMLElement).classList.add("bg-yellow-300");
    });

    const target = container.querySelector(`mark[data-index="${index}"]`);
    if (target) {
      (target as HTMLElement).classList.remove("bg-yellow-300");
      (target as HTMLElement).classList.add("bg-orange-400");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setResultadoActual(index + 1);
    }
  };

  const siguienteResultado = () => {
    if (totalResultados === 0) return;
    const next = resultadoActual >= totalResultados ? 0 : resultadoActual;
    irAResultado(next);
  };

  const anteriorResultado = () => {
    if (totalResultados === 0) return;
    const prev = resultadoActual <= 1 ? totalResultados - 1 : resultadoActual - 2;
    irAResultado(prev);
  };

  const limpiarBusqueda = () => {
    setBusqueda("");
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Manual de Convivencia</span>
          </BreadcrumbDeslizable>
        </div>

        {pdfUrl ? (
          <div className="bg-card rounded-lg shadow-soft overflow-hidden h-[80vh]">
            <iframe src={pdfUrl} title="Manual de Convivencia" className="w-full h-full border-0" />
          </div>
        ) : (
        <>
        {/* Search bar */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                data-guia="varios.manual_buscar"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar en el manual..."
                className="w-full pl-9 pr-9 py-2 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {busqueda && (
                <button
                  onClick={limpiarBusqueda}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {totalResultados > 0 && (
              <div data-guia="varios.manual_resultado_siguiente" className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                <span>{resultadoActual}/{totalResultados}</span>
                <button
                  onClick={anteriorResultado}
                  className="p-1 rounded hover:bg-muted"
                  title="Anterior"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={siguienteResultado}
                  className="p-1 rounded hover:bg-muted"
                  title="Siguiente"
                >
                  <ChevronUp className="h-4 w-4 rotate-180" />
                </button>
              </div>
            )}
            {busqueda && totalResultados === 0 && !loading && (
              <span className="text-sm text-muted-foreground shrink-0">Sin resultados</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando manual...</div>
          ) : (
            <div
              ref={contenidoRef}
              className="manual-content prose prose-sm md:prose-base max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-ol:list-decimal prose-ul:list-disc"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
        </>
        )}
      </main>
    </div>
  );
};

export default ManualConvivencia;
