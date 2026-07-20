import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Download } from "lucide-react";
import { cargoSegunGenero } from "@/lib/entrevistadores";

/**
 * Boletines (Fase 2) — réplica del "INFORME DE DESEMPEÑO" del Pestalozziano
 * (SISNOTAS): encabezado con ESPACIO PARA EL ESCUDO del colegio (variable por
 * colegio, se dibuja desde Colegios.logo_url convertido a PNG), columnas de
 * grupos SI el colegio las usa uniformes (detección del server), áreas
 * compuestas, logros con variante por desempeño y leyenda de la escala.
 * El server (/api/boletines/aula) entrega todo calculado; aquí solo se pinta.
 */

interface FilaBol {
  tipo: "area" | "asignatura";
  esComponente?: boolean;
  peso?: number;
  nombre: string;
  ih: number | null;
  fa: number | null;
  grupos: Array<{ nombre: string; pct: number; nota: number | null; desempeno: string | null }> | null;
  val: number | null;
  desempeno: string | null;
  logros: string[];
}
interface EstBol { id: string; nombres: string; apellidos: string; num_lista: number; filas: FilaBol[] }
interface DatosBoletin {
  colegio: { nombre: string; logo_url: string | null; encabezado: string[]; sede: string };
  grado: string; salon: string; periodo: number; ano_escolar: number;
  escala: { min: number; max: number; decimales: number; aprobatoria: number; rangos: Array<{ label: string; min: number; max: number }> };
  columnas: Array<{ nombre: string; pct: number }> | null;
  estudiantes: EstBol[];
  director: { nombre: string; genero: string | null } | null;
}

const ORDINAL: Record<number, string> = { 1: "Primer", 2: "Segundo", 3: "Tercer", 4: "Cuarto" };
const GRADO_ORDEN = ["Párvulo", "Prejardín", "Jardín", "Transición", "Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo", "Undécimo"];

// Criterios estándar por etiqueta de desempeño (leyenda al pie, como SISNOTAS).
const CRITERIO_POR_LABEL: Array<{ match: RegExp; texto: string }> = [
  { match: /superior|excelente/i, texto: "Alcanza todos los logros, conocimientos y competencias propuestas sin actividades complementarias." },
  { match: /alto|sobresaliente/i, texto: "Alcanza todos los logros, conocimientos y competencias propuestas." },
  { match: /básico|basico|aceptable/i, texto: "Alcanza todos los logros mínimos propuestos." },
  { match: /bajo|insuficiente|deficiente/i, texto: "No alcanza todos los logros mínimos propuestos." },
];
const criterioDe = (label: string) => CRITERIO_POR_LABEL.find((c) => c.match.test(label))?.texto || "";

/** Convierte el escudo (webp/lo que sea) a PNG dataURL para jsPDF. */
async function escudoAPng(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch { return null; }
}

const Boletines = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [aulas, setAulas] = useState<Array<{ grado: string; salon: string }>>([]);
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [periodo, setPeriodo] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState<DatosBoletin | null>(null);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s.id || (!puedeAccederDashboard() && !isAdmin())) { navigate("/"); return; }
    supabase.from("Estudiantes").select("grado, salon").then(({ data }) => {
      const set = new Map<string, { grado: string; salon: string }>();
      for (const e of (data || []) as any[]) set.set(`${e.grado}|${e.salon}`, { grado: e.grado, salon: String(e.salon) });
      const lista = [...set.values()].sort((a, b) =>
        (GRADO_ORDEN.indexOf(a.grado) - GRADO_ORDEN.indexOf(b.grado)) || a.salon.localeCompare(b.salon));
      setAulas(lista);
      if (lista.length > 0) { setGrado(lista[0].grado); setSalon(lista[0].salon); }
    });
  }, [navigate]);

  const gradosUnicos = useMemo(() => [...new Set(aulas.map((a) => a.grado))], [aulas]);
  const salonesDeGrado = useMemo(() => aulas.filter((a) => a.grado === grado).map((a) => a.salon), [aulas, grado]);

  const cargar = async () => {
    if (!grado || !salon) return;
    setCargando(true); setDatos(null);
    try {
      const d = await apiRequest<DatosBoletin>(`/api/boletines/aula?grado=${encodeURIComponent(grado)}&salon=${encodeURIComponent(salon)}&periodo=${periodo}`);
      setDatos(d);
    } catch (e: any) {
      toast({ title: "No se pudo cargar", description: e?.body?.detail || e?.message, variant: "destructive" });
    } finally { setCargando(false); }
  };
  useEffect(() => { if (grado && salon) cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [grado, salon, periodo]);

  // ── PDF ──
  const generarPdf = async (soloEstudiante?: EstBol) => {
    if (!datos) return;
    setGenerando(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF("p", "mm", "a4");
      const W = 210, MX = 10;
      const fmt = (n: number | null) => (n == null ? "" : n.toFixed(1));
      const hoy = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
      const escudo = datos.colegio.logo_url ? await escudoAPng(datos.colegio.logo_url) : null;
      const lista = soloEstudiante ? [soloEstudiante] : datos.estudiantes;

      let pagina = 0;
      const encabezado = (est: EstBol): number => {
        pagina += 1;
        // ESPACIO DEL ESCUDO (siempre reservado; varía por colegio)
        if (escudo) { try { pdf.addImage(escudo, "PNG", MX, 8, 18, 18); } catch { /* sin escudo */ } }
        pdf.setFont("helvetica", "bold").setFontSize(10);
        pdf.text(datos.colegio.nombre.toUpperCase(), W / 2, 12, { align: "center" });
        pdf.setFont("helvetica", "normal").setFontSize(5.6);
        let hy = 15.5;
        for (const linea of datos.colegio.encabezado.slice(0, 3)) {
          pdf.text(linea, W / 2, hy, { align: "center" }); hy += 2.6;
        }
        pdf.setFontSize(6.5);
        pdf.text(`Pág. ${pagina}`, W - MX, 9, { align: "right" });

        pdf.setFont("helvetica", "bold").setFontSize(10);
        pdf.text("INFORME DE DESEMPEÑO", W / 2, 30, { align: "center" });

        // Bloque de identificación (2 filas)
        let y = 33;
        pdf.setLineWidth(0.25);
        const filaInfo = (celdas: Array<{ label: string; valor: string; w: number }>, yy: number) => {
          let x = MX;
          for (const c of celdas) {
            pdf.rect(x, yy, c.w, 8);
            pdf.setFont("helvetica", "bold").setFontSize(5.6);
            pdf.text(c.label, x + 1, yy + 2.6);
            pdf.setFont("helvetica", "bold").setFontSize(7.5);
            pdf.text(c.valor, x + 1, yy + 6.4);
            x += c.w;
          }
        };
        filaInfo([
          { label: "Nombre", valor: `${est.apellidos} ${est.nombres}`.toUpperCase(), w: 95 },
          { label: "No. Identificación", valor: est.id, w: 45 },
          { label: "Grado / Grupo", valor: `${datos.grado} ${datos.salon}`, w: 50 },
        ], y);
        y += 8;
        filaInfo([
          { label: "No. Lista", valor: String(est.num_lista), w: 25 },
          { label: "Periodo", valor: `${ORDINAL[datos.periodo]}`, w: 45 },
          { label: "Año Lectivo", valor: String(datos.ano_escolar), w: 30 },
          { label: "Fecha", valor: hoy, w: 40 },
          { label: "Sede", valor: datos.colegio.sede, w: 50 },
        ], y);
        return y + 10;
      };

      // Anchos de la tabla principal
      const cols = datos.columnas || [];
      const wIH = 8, wFA = 8, wVal = 10, wNiv = 8, wDes = 22;
      const wGrupo = cols.length > 0 ? 22 : 0;
      const wNombre = W - 2 * MX - wIH - wFA - wVal - wNiv - wDes - cols.length * wGrupo;

      const cabeceraTabla = (y: number): number => {
        pdf.setFillColor(255, 255, 255);
        pdf.setFont("helvetica", "bold").setFontSize(6.4);
        let x = MX;
        const th = 9;
        const celda = (w: number, texto: string, sub?: string) => {
          pdf.rect(x, y, w, th);
          if (sub) {
            pdf.text(texto, x + w / 2, y + 3.6, { align: "center" });
            pdf.text(sub, x + w / 2, y + 6.8, { align: "center" });
          } else {
            pdf.text(texto, x + w / 2, y + 5.6, { align: "center" });
          }
          x += w;
        };
        celda(wNombre, "ÁREA / ASIGNATURA");
        celda(wIH, "I.H");
        celda(wFA, "F.A");
        for (const c of cols) celda(wGrupo, c.nombre, `(${c.pct}%)`);
        celda(wVal, "Val");
        celda(wNiv, "Niv");
        celda(wDes, "Desempeño");
        return y + th;
      };

      for (const est of lista) {
        if (pagina > 0) pdf.addPage();
        let y = encabezado(est);
        y = cabeceraTabla(y);

        const saltoSiHaceFalta = (alto: number) => {
          if (y + alto > 282) {
            pdf.addPage();
            y = encabezado(est);
            y = cabeceraTabla(y);
          }
        };

        for (const f of est.filas) {
          // ── Fila principal ──
          const esArea = f.tipo === "area";
          const nombreTxt = f.esComponente && f.peso != null ? `${f.nombre} (${f.peso}%)` : f.nombre;
          saltoSiHaceFalta(6);
          let x = MX;
          const rh = 5.4;
          pdf.setFont("helvetica", f.esComponente ? "normal" : "bold").setFontSize(6.6);
          pdf.rect(x, y, wNombre, rh);
          pdf.text((f.esComponente ? nombreTxt : nombreTxt.toUpperCase()).slice(0, 60), x + 1, y + 3.7);
          x += wNombre;
          const celdaC = (w: number, texto: string, bold = false) => {
            pdf.rect(x, y, w, rh);
            pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(6.4);
            if (texto) pdf.text(texto, x + w / 2, y + 3.7, { align: "center" });
            x += w;
          };
          celdaC(wIH, f.ih != null ? String(f.ih) : "");
          celdaC(wFA, f.fa != null ? String(f.fa) : "");
          if (cols.length > 0) {
            for (const c of cols) {
              const g = (f.grupos || []).find((gg) => gg.nombre === c.nombre);
              celdaC(wGrupo, g && g.nota != null ? `${fmt(g.nota)} ${(g.desempeno || "").toUpperCase()}` : "");
            }
          }
          celdaC(wVal, fmt(f.val), true);
          celdaC(wNiv, "");
          celdaC(wDes, (f.desempeno || "").toUpperCase(), true);
          y += rh;

          // Desglose propio cuando NO hay columnas uniformes
          if (cols.length === 0 && f.grupos && f.grupos.length > 0) {
            const linea = f.grupos.map((g) => `${g.nombre} (${g.pct}%): ${g.nota != null ? fmt(g.nota) : "—"}`).join("   ·   ");
            saltoSiHaceFalta(4);
            pdf.rect(MX, y, W - 2 * MX, 4);
            pdf.setFont("helvetica", "italic").setFontSize(5.8);
            pdf.text(linea.slice(0, 130), MX + 3, y + 2.7);
            y += 4;
          }

          // Logros (viñetas »)
          if (!esArea && f.logros.length > 0) {
            pdf.setFont("helvetica", "normal").setFontSize(6.2);
            for (const l of f.logros) {
              const lineas = pdf.splitTextToSize(`» ${l}`, W - 2 * MX - 4);
              const alto = lineas.length * 2.9 + 1.6;
              saltoSiHaceFalta(alto);
              pdf.rect(MX, y, W - 2 * MX, alto);
              pdf.text(lineas, MX + 2, y + 2.8);
              y += alto;
            }
          }
        }

        // ── Pie: leyenda de escala + firma ──
        saltoSiHaceFalta(34);
        y += 5;
        pdf.setFont("helvetica", "bold").setFontSize(5.6);
        const ordRangos = [...datos.escala.rangos].sort((a, b) => b.min - a.min);
        const wEsc = 22, wNac = 30, wCri = 78;
        pdf.rect(MX, y, wEsc, 3.6); pdf.rect(MX + wEsc, y, wNac, 3.6); pdf.rect(MX + wEsc + wNac, y, wCri, 3.6);
        pdf.text("Escala Numérica", MX + 1, y + 2.5);
        pdf.text("Escala Nacional", MX + wEsc + 1, y + 2.5);
        pdf.text("Criterios de Evaluación", MX + wEsc + wNac + 1, y + 2.5);
        let ly = y + 3.6;
        pdf.setFont("helvetica", "normal");
        for (const r of ordRangos) {
          const maxTx = r.max > datos.escala.max ? datos.escala.max : r.max;
          pdf.rect(MX, ly, wEsc, 3.4); pdf.rect(MX + wEsc, ly, wNac, 3.4); pdf.rect(MX + wEsc + wNac, ly, wCri, 3.4);
          pdf.text(`${r.min.toFixed(1)} a ${maxTx.toFixed(1)}`, MX + 1, ly + 2.4);
          pdf.text(`Desempeño ${r.label}`, MX + wEsc + 1, ly + 2.4);
          pdf.text(criterioDe(r.label).slice(0, 105), MX + wEsc + wNac + 1, ly + 2.4);
          ly += 3.4;
        }
        if (datos.director) {
          const fx = W - MX - 55;
          pdf.setLineWidth(0.25);
          pdf.line(fx, ly - 4, fx + 55, ly - 4);
          pdf.setFont("helvetica", "normal").setFontSize(6.4);
          pdf.text(datos.director.nombre.toUpperCase(), fx + 27.5, ly - 1.2, { align: "center" });
          pdf.text(cargoSegunGenero("Director(a) de Grupo", datos.director.genero), fx + 27.5, ly + 1.6, { align: "center" });
        }
        pdf.setFont("helvetica", "normal").setFontSize(5.2);
        pdf.text("Generado con Notas Normi — notasnormi.com", MX, 292);
      }

      const nombreArchivo = soloEstudiante
        ? `Boletin ${soloEstudiante.apellidos} ${soloEstudiante.nombres} - ${ORDINAL[datos.periodo]} periodo.pdf`
        : `Boletines ${datos.grado} ${datos.salon} - ${ORDINAL[datos.periodo]} periodo.pdf`;
      pdf.save(nombreArchivo);
    } catch (e) {
      console.error(e);
      toast({ title: "No se pudo generar el PDF", variant: "destructive" });
    } finally { setGenerando(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={isAdmin() ? "/dashboard-admin" : "/dashboard-rector"} />
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-3xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(isAdmin() ? "/dashboard-admin" : "/dashboard-rector")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Boletines</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-5">
            <FileText className="h-5 w-5 text-primary" /> Boletines
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <select value={grado} onChange={(e) => { setGrado(e.target.value); const s = aulas.filter((a) => a.grado === e.target.value); setSalon(s[0]?.salon || ""); }}
              className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
              {gradosUnicos.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={salon} onChange={(e) => setSalon(e.target.value)}
              className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
              {salonesDeGrado.map((s) => <option key={s} value={s}>Salón {s}</option>)}
            </select>
            <select value={periodo} onChange={(e) => setPeriodo(parseInt(e.target.value, 10))}
              className="col-span-2 sm:col-span-1 px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
              {[1, 2, 3, 4].map((p) => <option key={p} value={p}>{ORDINAL[p]} periodo</option>)}
            </select>
          </div>

          {cargando ? (
            <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin inline" /> Calculando…</div>
          ) : !datos ? null : datos.estudiantes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay estudiantes con notas en esta aula y periodo.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">
                  {datos.estudiantes.length} estudiantes · {datos.columnas
                    ? `columnas: ${datos.columnas.map((c) => `${c.nombre} ${c.pct}%`).join(" / ")}`
                    : "sin grupos uniformes (cada asignatura imprime su propio desglose)"}
                </p>
                <Button onClick={() => generarPdf()} disabled={generando} className="gap-2">
                  {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Descargar PDF del curso
                </Button>
              </div>
              <div className="border border-border rounded-lg divide-y divide-border max-h-[50vh] overflow-auto">
                {datos.estudiantes.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-foreground">
                      <span className="text-muted-foreground tabular-nums mr-2">{e.num_lista}.</span>
                      {e.apellidos} {e.nombres}
                    </span>
                    <button onClick={() => generarPdf(e)} disabled={generando} className="p-1.5 rounded hover:bg-muted" title="Descargar boletín individual">
                      <Download className="w-4 h-4 text-primary" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Boletines;
