import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/lib/apiClient";
import { useEsquemaGrado, etiquetaCorteOrdinal } from "@/utils/esquema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Download, AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { cargoSegunGenero } from "@/lib/entrevistadores";
import { registerBoletinFonts } from "@/lib/boletinFonts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { criterioDeRango } from "@/lib/criteriosDesempeno";
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
  /** Le faltan notas del periodo: la definitiva aún no es la final. */
  provisional?: boolean;
  /** La definitiva es la de la habilitación. */
  habilitada?: boolean;
  /** Hay columnas pero esta materia tiene otra estructura: desglose en su propia línea. */
  desglose_propio?: boolean;
  logros: string[];
  /** Comentario del profesor en la definitiva del periodo. */
  comentario?: string | null;
}
interface EstBol { id: string; nombres: string; apellidos: string; num_lista: number; filas: FilaBol[]; comportamiento?: string[] }
interface ItemInc {
  asignatura: string; grado: string; salon: string;
  sin_nota: string[];
  actividades_incompletas: Array<{ actividad: string; faltan: string[] }>;
  sin_calificar?: boolean;
}
interface GrupoInc { profesor: { id: string; nombre: string; genero: string | null } | null; items: ItemInc[] }

interface DatosBoletin {
  colegio: { nombre: string; logo_url: string | null; encabezado: string[]; sede: string };
  /** Título del recuadro bajo las asignaturas (lo llena el director de grupo). */
  comportamiento_titulo?: string;
  grado: string; salon: string; periodo: number; ano_escolar: number; periodo_peso: number | null;
  escala: { min: number; max: number; decimales: number; aprobatoria: number; rangos: Array<{ label: string; min: number; max: number; criterio?: string | null }> };
  columnas: Array<{ nombre: string; pct: number }> | null;
  estudiantes: EstBol[];
  director: { nombre: string; genero: string | null } | null;
}

// Tamaños de papel del boletín (mm). Legal = el del informe SISNOTAS de referencia.
const PAPELES: Record<string, { label: string; w: number; h: number }> = {
  carta: { label: "Carta (21,6 × 27,9 cm)", w: 215.9, h: 279.4 },
  oficio: { label: "Oficio (21,6 × 33 cm)", w: 215.9, h: 330.2 },
  legal: { label: "Legal (21,6 × 35,6 cm)", w: 215.9, h: 355.6 },
  a4: { label: "A4 (21 × 29,7 cm)", w: 210, h: 297 },
};
const PAPEL_KEY = "boletin_papel";

const ORDINAL: Record<number, string> = { 1: "Primero", 2: "Segundo", 3: "Tercero", 4: "Cuarto" };
const GRADO_ORDEN = ["Párvulo", "Prejardín", "Jardín", "Transición", "Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo", "Undécimo"];

// Criterio de cada nivel (leyenda al pie): el que escribió el colegio o el estándar.

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

  const [searchParams, setSearchParams] = useSearchParams();
  const [aulas, setAulas] = useState<Array<{ grado: string; salon: string }>>([]);
  const [grado, setGrado] = useState(() => searchParams.get("g") || "");
  const [salon, setSalon] = useState(() => searchParams.get("s") || "");
  const [periodo, setPeriodo] = useState(() => {
    const p = parseInt(searchParams.get("p") || "", 10);
    return p >= 1 && p <= 6 ? p : 1;
  });
  const esq = useEsquemaGrado(grado);
  // "Primero" (periodos, como siempre) o "Primer semestre" (niveles por semestres).
  const nombreCorte = (n: number) => (esq.esquema === "semestres" ? etiquetaCorteOrdinal(esq, n) : ORDINAL[n]);
  const nombreCorteLargo = (n: number) => (esq.esquema === "semestres" ? etiquetaCorteOrdinal(esq, n) : `${ORDINAL[n]} periodo`);
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState<DatosBoletin | null>(null);
  const [generando, setGenerando] = useState(false);
  const [papelId, setPapelId] = useState<string>(() => {
    try { const v = localStorage.getItem(PAPEL_KEY) || ""; return PAPELES[v] ? v : "legal"; } catch { return "legal"; }
  });
  const elegirPapel = (v: string) => { setPapelId(v); try { localStorage.setItem(PAPEL_KEY, v); } catch { /* sin almacenamiento */ } };

  useEffect(() => {
    const s = getSession();
    if (!s.id || (!puedeAccederDashboard() && !isAdmin())) { navigate("/"); return; }
    supabase.from("Estudiantes").select("grado, salon").then(({ data }) => {
      const set = new Map<string, { grado: string; salon: string }>();
      for (const e of (data || []) as any[]) set.set(`${e.grado}|${e.salon}`, { grado: e.grado, salon: String(e.salon) });
      const lista = [...set.values()].sort((a, b) =>
        (GRADO_ORDEN.indexOf(a.grado) - GRADO_ORDEN.indexOf(b.grado)) || a.salon.localeCompare(b.salon));
      setAulas(lista);
      if (lista.length > 0) {
        // Si la URL trae un aula válida (?g=&s=), respétala; si no, primer aula.
        const match = lista.find((a) => a.grado === searchParams.get("g") && a.salon === searchParams.get("s"));
        if (match) { setGrado(match.grado); setSalon(match.salon); }
        else { setGrado(lista[0].grado); setSalon(lista[0].salon); }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Refleja la selección en la URL (?g=&s=&p=) para que al refrescar o compartir
  // el link se mantenga el aula y el periodo elegidos.
  useEffect(() => {
    if (grado && salon) setSearchParams({ g: grado, s: salon, p: String(periodo) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grado, salon, periodo]);

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

  // ── Inconsistencias del periodo (todo el colegio) ──
  const [inconsistencias, setInconsistencias] = useState<GrupoInc[] | null>(null);
  const [notificando, setNotificando] = useState<string | null>(null);
  const [confirmNotif, setConfirmNotif] = useState<GrupoInc | null>(null);
  useEffect(() => {
    let cancel = false;
    setInconsistencias(null);
    apiRequest<{ grupos: GrupoInc[] }>(`/api/boletines/inconsistencias?periodo=${periodo}`)
      .then((r) => { if (!cancel) setInconsistencias(r.grupos || []); })
      .catch(() => { if (!cancel) setInconsistencias([]); });
    return () => { cancel = true; };
  }, [periodo]);

  const notificar = async () => {
    if (!confirmNotif?.profesor) return;
    setNotificando(confirmNotif.profesor.id);
    try {
      await apiRequest("/api/boletines/inconsistencias/notificar", {
        method: "POST",
        body: JSON.stringify({ periodo, profesor_id: confirmNotif.profesor.id }),
      });
      toast({ title: "Recordatorio enviado", description: `${confirmNotif.profesor.nombre} recibirá el detalle por WhatsApp.` });
      setConfirmNotif(null);
    } catch (e: any) {
      toast({ title: "No se pudo enviar", description: e?.body?.detail || e?.message, variant: "destructive" });
    } finally { setNotificando(null); }
  };

  const incDelAula = useMemo(() =>
    (inconsistencias || []).flatMap((g) => g.items).filter((i) => i.grado === grado && String(i.salon) === salon),
    [inconsistencias, grado, salon]);

  // ── PDF ──
  const generarPdf = async (soloEstudiante?: EstBol) => {
    if (!datos) return;
    setGenerando(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      // Tamaño de papel elegido (por defecto Legal 216 × 356 mm, el del informe SISNOTAS).
      // TODO el armado sale de W y H: nada de medidas fijas de una sola hoja.
      const papel = PAPELES[papelId] || PAPELES.legal;
      const pdf = new jsPDF("p", "mm", [papel.w, papel.h]);
      registerBoletinFonts(pdf); // tipografía condensada idéntica al informe SISNOTAS
      const W = papel.w, H = papel.h, MX = 10;
      const LIMITE = H - 16;   // nada se dibuja por debajo de esta línea
      const PIE_Y = H - 6;     // "Generado con Notas Normi"
      const ANCHO = W - 2 * MX;
      const k = ANCHO / 196;   // los anchos del encabezado se diseñaron para 196 mm útiles
      const fmt = (n: number | null) => (n == null ? "" : n.toFixed(1));
      const hoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
      const escudo = datos.colegio.logo_url ? await escudoAPng(datos.colegio.logo_url) : null;
      const lista = soloEstudiante ? [soloEstudiante] : datos.estudiantes;

      // La numeración "Pág. N" es POR ESTUDIANTE: cada boletín arranca en 1 y solo
      // sube si ese mismo estudiante ocupa varias páginas. `hojaEmitida` decide si
      // hay que abrir una hoja nueva antes del siguiente estudiante.
      let paginaEst = 0;
      let hojaEmitida = false;
      const encabezado = (est: EstBol): number => {
        paginaEst += 1;
        // ESPACIO DEL ESCUDO (siempre reservado; varía por colegio)
        if (escudo) { try { pdf.addImage(escudo, "PNG", MX, 8, 18, 18); } catch { /* sin escudo */ } }
        pdf.setFont("HelveticaCond", "bold").setFontSize(10);
        pdf.text(datos.colegio.nombre.toUpperCase(), W / 2, 12, { align: "center" });
        pdf.setFont("HelveticaCond", "normal").setFontSize(5.6);
        let hy = 15.5;
        for (const linea of datos.colegio.encabezado.slice(0, 3)) {
          pdf.text(linea, W / 2, hy, { align: "center" }); hy += 2.6;
        }
        pdf.setFontSize(6.5);
        pdf.text(`Pág. ${paginaEst}`, W - MX, 9, { align: "right" });

        pdf.setFont("HelveticaCond", "bold").setFontSize(10);
        pdf.text("INFORME DE DESEMPEÑO", W / 2, 30, { align: "center" });

        // Bloque de identificación (2 filas)
        let y = 33;
        pdf.setLineWidth(0.25);
        const filaInfo = (celdas: Array<{ label: string; valor: string; w: number }>, yy: number) => {
          let x = MX;
          for (const c of celdas) {
            const w = c.w * k;
            pdf.rect(x, yy, w, 8);
            pdf.setFont("HelveticaCond", "bold").setFontSize(5.6);
            pdf.text(c.label, x + 1, yy + 2.6);
            pdf.setFont("ArialNarrow", "normal").setFontSize(7.5);
            pdf.text(pdf.splitTextToSize(c.valor, w - 2)[0] || "", x + 1, yy + 6.4);
            x += w;
          }
        };
        filaInfo([
          { label: "Nombre", valor: `${est.apellidos} ${est.nombres}`.toUpperCase(), w: 96 },
          { label: "No. Identificación", valor: est.id, w: 45 },
          { label: "Grado / Grupo", valor: `${datos.grado} ${datos.salon}`, w: 55 },
        ], y);
        y += 8;
        filaInfo([
          { label: "No. Lista", valor: String(est.num_lista), w: 26 },
          { label: "Periodo", valor: `${nombreCorte(datos.periodo)}${datos.periodo_peso ? ` (${datos.periodo_peso}%)` : ""}`, w: 45 },
          { label: "Año Lectivo", valor: String(datos.ano_escolar), w: 30 },
          { label: "Fecha", valor: hoy, w: 40 },
          { label: "Sede", valor: datos.colegio.sede, w: 55 },
        ], y);
        return y + 10;
      };

      // Anchos de la tabla principal
      const cols = datos.columnas || [];
      const wIH = 8, wFA = 8, wVal = 10, wDes = 22;
      const wGrupo = cols.length > 0 ? 22 : 0;
      const wNombre = ANCHO - wIH - wFA - wVal - wDes - cols.length * wGrupo;
      const TH = 9; // alto de la cabecera de la tabla

      const cabeceraTabla = (y: number): number => {
        // Fila de cabecera con fondo gris (RGB 240 = 0.941), igual al informe SISNOTAS.
        pdf.setFillColor(240, 240, 240);
        pdf.setFont("HelveticaCond", "bold").setFontSize(6.4);
        let x = MX;
        const celda = (w: number, texto: string, sub?: string) => {
          // pdf.text() deja el fill en NEGRO (color del glifo); re-fijamos el gris
          // antes de CADA rect o las celdas siguientes salen negras.
          pdf.setFillColor(240, 240, 240);
          pdf.rect(x, y, w, TH, "FD");
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
        celda(wDes, "Desempeño");
        pdf.setFillColor(255, 255, 255);
        return y + TH;
      };

      // Alto útil de una hoja nueva (encabezado del estudiante + cabecera de la tabla).
      const Y_INICIO = 51 + TH;
      const CAPACIDAD = LIMITE - Y_INICIO;
      const LINEA = 2.9; // interlineado de logros, comentarios y comportamiento

      // Medidas de los bloques de una asignatura (mismas fuentes con que se dibujan).
      const lineasDesglose = (f: FilaBol): string[] => {
        if (!((cols.length === 0 || f.desglose_propio) && f.grupos && f.grupos.length > 0)) return [];
        const linea = f.grupos.map((g) => {
          const pctTxt = g.pct != null && (g.pct as unknown) !== "" ? ` (${g.pct}%)` : "";
          return `${g.nombre}${pctTxt}: ${g.nota != null ? fmt(g.nota) : "—"}`;
        }).join("   ·   ");
        pdf.setFont("helvetica", "italic").setFontSize(5.8);
        return pdf.splitTextToSize(linea, ANCHO - 6);
      };
      const parrafosLogros = (f: FilaBol): string[][] => {
        pdf.setFont("HelveticaCond", "normal").setFontSize(6.2);
        // Cada renglón que el profesor escribió es un párrafo propio: justificar un texto
        // con saltos de línea estiraba los renglones cortos a todo el ancho.
        const parrafos = f.logros.flatMap((l) => {
          const partes = l.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
          return partes.map((t, i) => (i === 0 ? `» ${t}` : t));
        });
        return parrafos.map((p) => pdf.splitTextToSize(p, ANCHO - 4));
      };
      const comentarioPartes = (f: FilaBol) => {
        if (!f.comentario) return null;
        const etiqueta = "Comentario: ";
        pdf.setFont("HelveticaCond", "bold").setFontSize(6.2);
        const wEt = pdf.getTextWidth(etiqueta);
        pdf.setFont("HelveticaCond", "normal");
        const primera: string = pdf.splitTextToSize(f.comentario, ANCHO - 4 - wEt)[0] || "";
        const resto = f.comentario.slice(primera.length).trim();
        const restoLineas: string[] = resto ? pdf.splitTextToSize(resto, ANCHO - 4) : [];
        return { etiqueta, wEt, primera, restoLineas, alto: (1 + restoLineas.length) * LINEA + 2 };
      };
      const altoAsignatura = (f: FilaBol): number => {
        const d = lineasDesglose(f);
        const lg = parrafosLogros(f);
        const cm = comentarioPartes(f);
        return 5.4
          + (d.length ? d.length * 3 + 1 : 0)
          + (lg.length ? lg.reduce((s, w) => s + w.length, 0) * LINEA + 2 : 0)
          + (cm ? cm.alto : 0);
      };

      for (const est of lista) {
        paginaEst = 0;                          // cada estudiante reinicia en Pág. 1
        if (hojaEmitida) pdf.addPage([papel.w, papel.h], "p");
        hojaEmitida = true;
        let y = encabezado(est);
        y = cabeceraTabla(y);

        // REGLA DE CORTE (para cualquier tamaño de papel): un bloque que no cabe en lo
        // que queda de la hoja pasa entero a la siguiente, con el encabezado del
        // estudiante. conTabla=false para lo que va DESPUÉS de las asignaturas (marcas,
        // comportamiento, pie): en la hoja nueva no se repite la cabecera sin filas.
        const saltoSiHaceFalta = (alto: number, conTabla = true) => {
          if (y + alto > LIMITE) {
            pdf.addPage([papel.w, papel.h], "p");
            y = encabezado(est);
            if (conTabla) y = cabeceraTabla(y);
          }
        };
        // Recuadro de párrafos (logros, comportamiento). Si no cabe entero en lo que
        // queda, pasa entero a la hoja siguiente; si es más alto que una hoja completa,
        // se parte ENTRE párrafos (nunca a mitad de uno), cada trozo en su recuadro.
        const cajaParrafos = (wrapped: string[][], conTabla: boolean) => {
          const altoDe = (ps: string[][]) => ps.reduce((s, w) => s + w.length, 0) * LINEA + 2;
          const dibujar = (ps: string[][]) => {
            const alto = altoDe(ps);
            pdf.rect(MX, y, ANCHO, alto);
            pdf.setFont("HelveticaCond", "normal").setFontSize(6.2);
            let ty = y + 2.8;
            for (const w of ps) {
              // justify estira todas las líneas menos la última de cada párrafo.
              pdf.text(w.join(" "), MX + 2, ty, { maxWidth: ANCHO - 4, align: "justify" });
              ty += w.length * LINEA;
            }
            y += alto;
          };
          if (altoDe(wrapped) <= CAPACIDAD) { saltoSiHaceFalta(altoDe(wrapped), conTabla); dibujar(wrapped); return; }
          let trozo: string[][] = [];
          for (const w of wrapped) {
            if (trozo.length && y + altoDe([...trozo, w]) > LIMITE) { dibujar(trozo); trozo = []; saltoSiHaceFalta(LIMITE, conTabla); }
            trozo.push(w);
          }
          if (trozo.length) { saltoSiHaceFalta(altoDe(trozo), conTabla); dibujar(trozo); }
        };

        for (const f of est.filas) {
          // La asignatura completa (fila + desglose + logros + comentario) va JUNTA: si
          // no cabe en lo que queda pero sí en una hoja nueva, pasa entera. Así nunca
          // queda la fila de una materia al final de una hoja y sus logros en la otra.
          const altoTotal = altoAsignatura(f);
          if (altoTotal <= CAPACIDAD) saltoSiHaceFalta(altoTotal);
          else saltoSiHaceFalta(5.4 + 12); // muy larga: al menos la fila con algo debajo

          // ── Fila principal ──
          const nombreTxt = f.esComponente && f.peso != null ? `${f.nombre} (${f.peso}%)` : f.nombre;
          let x = MX;
          const rh = 5.4;
          pdf.setFont(f.esComponente ? "ArialNarrow" : "HelveticaCond", f.esComponente ? "normal" : "bold").setFontSize(6.6);
          pdf.rect(x, y, wNombre, rh);
          pdf.text(pdf.splitTextToSize(f.esComponente ? nombreTxt : nombreTxt.toUpperCase(), wNombre - 2)[0] || "", x + 1, y + 3.7);
          x += wNombre;
          const celdaC = (w: number, texto: string, bold = false) => {
            pdf.rect(x, y, w, rh);
            pdf.setFont(bold ? "HelveticaCond" : "ArialNarrow", bold ? "bold" : "normal").setFontSize(6.4);
            if (texto) pdf.text(texto, x + w / 2, y + 3.7, { align: "center" });
            x += w;
          };
          celdaC(wIH, f.ih != null ? String(f.ih) : "");
          celdaC(wFA, f.fa != null ? String(f.fa) : "");
          if (cols.length > 0) {
            for (const c of cols) {
              const g = f.desglose_propio ? undefined : (f.grupos || []).find((gg) => gg.nombre === c.nombre);
              celdaC(wGrupo, g && g.nota != null ? `${fmt(g.nota)} ${(g.desempeno || "").toUpperCase()}` : "");
            }
          }
          // H = definitiva de la habilitación.
          celdaC(wVal, f.val == null ? "" : `${fmt(f.val)}${f.habilitada ? " H" : ""}`, true);
          celdaC(wDes, (f.desempeno || "").toUpperCase(), true);
          y += rh;

          // Desglose propio cuando NO hay columnas uniformes: grupos + actividades
          // sueltas, cada uno con su % (si no tiene %, va sin paréntesis = equitativo).
          const wrapDesglose = lineasDesglose(f);
          if (wrapDesglose.length) {
            const alto = wrapDesglose.length * 3 + 1;
            saltoSiHaceFalta(alto);
            pdf.setFont("helvetica", "italic").setFontSize(5.8);
            pdf.rect(MX, y, ANCHO, alto);
            pdf.text(wrapDesglose, MX + 3, y + 2.7);
            y += alto;
          }

          // Logros (viñetas ») — TODOS en UN solo recuadro y con el texto
          // JUSTIFICADO a ambos márgenes (réplica exacta del informe SISNOTAS).
          if (f.logros.length > 0) cajaParrafos(parrafosLogros(f), true);

          // Comentario del profesor en la definitiva, dentro del espacio de la asignatura.
          const cm = comentarioPartes(f);
          if (cm) {
            saltoSiHaceFalta(cm.alto);
            pdf.rect(MX, y, ANCHO, cm.alto);
            pdf.setFont("HelveticaCond", "bold").setFontSize(6.2);
            pdf.text(cm.etiqueta, MX + 2, y + 2.8);
            pdf.setFont("HelveticaCond", "normal");
            pdf.text(cm.primera, MX + 2 + cm.wEt, y + 2.8);
            if (cm.restoLineas.length) pdf.text(cm.restoLineas, MX + 2, y + 2.8 + LINEA);
            y += cm.alto;
          }
        }

        // Convenciones de la columna de la nota, solo si este boletín las usa.
        const marcas = [
          est.filas.some((f) => f.habilitada) ? "H: nota después de la habilitación." : "",
        ].filter(Boolean);
        if (marcas.length > 0) {
          saltoSiHaceFalta(4, false);
          pdf.setFont("HelveticaCond", "normal").setFontSize(5.6);
          pdf.text(marcas.join("   "), MX, y + 3);
          y += 4;
        }

        // ── COMPORTAMIENTO Y DISCIPLINA / OBSERVACIONES: el texto que escribió el
        // director de grupo (viñetas », justificado como los logros); si no escribió
        // nada, queda el recuadro en blanco para escribir a mano. El título va siempre
        // pegado a su recuadro (o al menos a su primer párrafo).
        {
          const comp = est.comportamiento || [];
          pdf.setFont("HelveticaCond", "normal").setFontSize(6.2);
          const wrapped = comp.map((l) => pdf.splitTextToSize(`» ${l}`, ANCHO - 4));
          const altoTexto = comp.length > 0 ? wrapped.reduce((s, w) => s + w.length, 0) * LINEA + 2 : 18;
          const altoMinimo = comp.length > 0 ? wrapped[0].length * LINEA + 2 : 18;
          // Si todo cabe en una hoja, título y recuadro van juntos; si no, el título con su primer párrafo.
          saltoSiHaceFalta(altoTexto + 9 <= CAPACIDAD ? altoTexto + 9 : altoMinimo + 9, false);
          y += 4;
          pdf.setFillColor(240, 240, 240);
          pdf.rect(MX, y, ANCHO, 5, "FD");
          pdf.setFillColor(255, 255, 255);
          pdf.setFont("HelveticaCond", "bold").setFontSize(6.4);
          pdf.text((datos.comportamiento_titulo || "OBSERVACIONES").toUpperCase(), MX + 2, y + 3.4);
          y += 5;
          if (comp.length > 0) cajaParrafos(wrapped, false);
          else { pdf.rect(MX, y, ANCHO, 18); y += 18; }
        }

        // ── Pie: leyenda de escala + firma. Se mide con su alto REAL (cantidad de
        // niveles y criterios largos) y va siempre entero en la misma hoja.
        const ordRangos = [...datos.escala.rangos].sort((a, b) => b.min - a.min);
        const wEsc = 22, wNac = 30;
        pdf.setFont("HelveticaCond", "normal").setFontSize(5.6);
        const wCriTexto = Math.max(0, ...ordRangos.map((r) => pdf.getTextWidth(criterioDeRango(r))));
        // Hasta el ancho útil que deja la firma; un criterio largo se parte en varias líneas.
        const wCri = Math.max(30, Math.min(ANCHO - wEsc - wNac - 66, wCriTexto + 3));
        const filasEscala = ordRangos.map((r) => {
          const lineasCri: string[] = pdf.splitTextToSize(criterioDeRango(r), wCri - 2);
          return { r, lineasCri, h: Math.max(3.4, lineasCri.length * 2.4 + 1) };
        });
        const altoPie = 5 + 3.6 + filasEscala.reduce((s, f) => s + f.h, 0) + 3;
        saltoSiHaceFalta(altoPie, false);
        y += 5;
        pdf.setFont("HelveticaCond", "bold").setFontSize(5.6);
        pdf.rect(MX, y, wEsc, 3.6); pdf.rect(MX + wEsc, y, wNac, 3.6); pdf.rect(MX + wEsc + wNac, y, wCri, 3.6);
        pdf.text("Escala Numérica", MX + 1, y + 2.5);
        pdf.text("Escala Nacional", MX + wEsc + 1, y + 2.5);
        pdf.text("Criterios de Evaluación", MX + wEsc + wNac + 1, y + 2.5);
        let ly = y + 3.6;
        pdf.setFont("HelveticaCond", "normal");
        for (const { r, lineasCri, h } of filasEscala) {
          const maxTx = r.max > datos.escala.max ? datos.escala.max : r.max;
          pdf.rect(MX, ly, wEsc, h); pdf.rect(MX + wEsc, ly, wNac, h); pdf.rect(MX + wEsc + wNac, ly, wCri, h);
          pdf.text(`${r.min.toFixed(1)} a ${maxTx.toFixed(1)}`, MX + 1, ly + 2.4);
          pdf.text(`Desempeño ${r.label}`, MX + wEsc + 1, ly + 2.4);
          pdf.text(lineasCri, MX + wEsc + wNac + 1, ly + 2.4);
          ly += h;
        }
        if (datos.director) {
          const anchoFirma = 60;
          const fx = W - MX - anchoFirma;
          const cx = fx + anchoFirma / 2;
          pdf.setLineWidth(0.25);
          pdf.line(fx, ly - 4, fx + anchoFirma, ly - 4);
          // El nombre se auto-reduce si no cabe en el ancho de la firma (evita desborde).
          const nombreDir = datos.director.nombre.toUpperCase();
          let fsNombre = 6.4;
          pdf.setFont("HelveticaCond", "normal").setFontSize(fsNombre);
          while (pdf.getTextWidth(nombreDir) > anchoFirma - 2 && fsNombre > 4) {
            fsNombre -= 0.2; pdf.setFontSize(fsNombre);
          }
          pdf.text(nombreDir, cx, ly - 1.2, { align: "center" });
          pdf.setFontSize(6.4);
          pdf.text(cargoSegunGenero("Director(a) de Grupo", datos.director.genero), cx, ly + 1.6, { align: "center" });
        }
        // Pie de la última hoja de este estudiante.
        pdf.setFont("HelveticaCond", "normal").setFontSize(5.2);
        pdf.text("Generado con Notas Normi — notasnormi.com", MX, PIE_Y);
      }

      const nombreArchivo = soloEstudiante
        ? `Boletin ${soloEstudiante.apellidos} ${soloEstudiante.nombres} - ${nombreCorteLargo(datos.periodo)}.pdf`
        : `Boletines ${datos.grado} ${datos.salon} - ${nombreCorteLargo(datos.periodo)}.pdf`;
      pdf.save(nombreArchivo);
    } catch (e) {
      console.error(e);
      toast({ title: "No se pudo generar el PDF", variant: "destructive" });
    } finally { setGenerando(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={isAdmin() ? "/dashboard" : "/dashboard"} />
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-3xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate(isAdmin() ? "/dashboard" : "/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Boletines</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center justify-center gap-2 mb-5">
            <FileText className="h-5 w-5 text-primary" /> Boletines
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <select value={grado} onChange={(e) => { setGrado(e.target.value); const s = aulas.filter((a) => a.grado === e.target.value); setSalon(s[0]?.salon || ""); }}
              className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer" data-guia="boletines.selector_grado">
              {gradosUnicos.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={salon} onChange={(e) => setSalon(e.target.value)}
              className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer" data-guia="boletines.selector_salon">
              {salonesDeGrado.map((s) => <option key={s} value={s}>Salón {s}</option>)}
            </select>
            <select value={periodo} onChange={(e) => setPeriodo(parseInt(e.target.value, 10))}
              className="col-span-2 sm:col-span-1 px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer" data-guia="boletines.selector_periodo">
              {esq.cortes.map((p) => <option key={p} value={p}>{nombreCorteLargo(p)}</option>)}
            </select>
          </div>

          {cargando ? (
            <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin inline" /> Calculando…</div>
          ) : !datos ? null : datos.estudiantes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay estudiantes con notas en esta aula y periodo.</p>
          ) : (
            <div className="space-y-4">
              {incDelAula.length > 0 && (
                <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Esta aula tiene planillas incompletas en {incDelAula.length} asignatura{incDelAula.length > 1 ? "s" : ""}
                    {" "}({incDelAula.map((i) => i.asignatura).join(", ")}) — revisa las inconsistencias abajo antes de entregar boletines.
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">
                  {datos.estudiantes.length} estudiantes · {datos.columnas
                    ? `columnas: ${datos.columnas.map((c) => `${c.nombre} ${c.pct}%`).join(" / ")}`
                    : "sin grupos uniformes (cada asignatura imprime su propio desglose)"}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                <select value={papelId} onChange={(e) => elegirPapel(e.target.value)} title="Tamaño de papel"
                  className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer" data-guia="boletines.selector_papel">
                  {Object.entries(PAPELES).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
                </select>
                <Button onClick={() => generarPdf()} disabled={generando} className="gap-2" data-guia="boletines.boton_pdf_curso">
                  {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Descargar PDF del curso
                </Button>
                </div>
              </div>
              <div className="border border-border rounded-lg divide-y divide-border max-h-[50vh] overflow-auto" data-guia="boletines.lista_estudiantes">
                {datos.estudiantes.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-foreground">
                      <span className="text-muted-foreground tabular-nums mr-2">{e.num_lista}.</span>
                      {e.apellidos} {e.nombres}
                    </span>
                    <button onClick={() => generarPdf(e)} disabled={generando} className="p-1.5 rounded hover:bg-muted" title="Descargar boletín individual" data-guia="boletines.boton_pdf_estudiante">
                      <Download className="w-4 h-4 text-primary" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Inconsistencias del periodo (todo el colegio) ── */}
        <div className="bg-card rounded-lg shadow-soft p-6 mt-6" data-guia="boletines.seccion_inconsistencias">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Inconsistencias del periodo
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Planillas incompletas de TODO el colegio en el {nombreCorteLargo(periodo).toLowerCase()}, agrupadas por profesor.
            El botón le envía a cada uno el detalle por WhatsApp.
          </p>

          {inconsistencias === null ? (
            <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : inconsistencias.length === 0 ? (
            <p className="text-sm text-emerald-700 flex items-center gap-2 py-3">
              <CheckCircle2 className="w-4 h-4" /> Sin inconsistencias: todas las planillas con notas están completas.
            </p>
          ) : (
            <div className="space-y-3">
              {inconsistencias.map((g, gi) => (
                <div key={g.profesor?.id || `sp-${gi}`} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <p className="font-semibold text-foreground text-sm">
                      {g.profesor
                        ? `${cargoSegunGenero("Profesor(a)", g.profesor.genero)} ${g.profesor.nombre}`
                        : "Sin profesor asignado (revisar carga académica)"}
                    </p>
                    {g.profesor && (
                      <Button size="sm" variant="outline" className="gap-1.5"
                        disabled={notificando === g.profesor.id}
                        onClick={() => setConfirmNotif(g)} data-guia="boletines.boton_recordar_wa">
                        {notificando === g.profesor.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Recordar por WhatsApp
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {g.items.map((it, i) => (
                      <div key={i} className="text-sm text-foreground bg-muted/40 rounded-md px-2.5 py-1.5">
                        <span className="font-medium">{it.asignatura} — {it.grado} {it.salon}:</span>{" "}
                        {it.sin_calificar && <span className="text-red-600">sin ninguna nota en este periodo</span>}
                        {it.sin_nota.length > 0 && (
                          <span className="text-red-600">
                            {it.sin_nota.length} estudiante{it.sin_nota.length > 1 ? "s" : ""} sin ninguna nota
                            {" "}({it.sin_nota.slice(0, 3).join(", ")}{it.sin_nota.length > 3 ? "…" : ""})
                          </span>
                        )}
                        {it.sin_nota.length > 0 && it.actividades_incompletas.length > 0 && " · "}
                        {it.actividades_incompletas.length > 0 && (
                          <span className="text-amber-700">
                            {it.actividades_incompletas.length} actividad{it.actividades_incompletas.length > 1 ? "es" : ""} con huecos
                            {" "}({it.actividades_incompletas.slice(0, 3).map((a) => `"${a.actividad}" faltan ${a.faltan.length}`).join(", ")}{it.actividades_incompletas.length > 3 ? "…" : ""})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Confirmar recordatorio ── */}
      <Dialog open={!!confirmNotif} onOpenChange={(o) => !o && setConfirmNotif(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Enviar recordatorio por WhatsApp?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmNotif?.profesor && (
              <>{cargoSegunGenero("Profesor(a)", confirmNotif.profesor.genero)} <span className="font-medium text-foreground">{confirmNotif.profesor.nombre}</span> recibirá
              el detalle de sus {confirmNotif.items.length} planilla{confirmNotif.items.length > 1 ? "s" : ""} pendiente{confirmNotif.items.length > 1 ? "s" : ""} del {ORDINAL[periodo].toLowerCase()} periodo.</>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmNotif(null)}>Cancelar</Button>
            <Button onClick={notificar} disabled={!!notificando} className="gap-2" data-guia="boletines.confirmar_recordar_wa">
              {notificando && <Loader2 className="w-4 h-4 animate-spin" />} Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Boletines;
