import { useEffect, useState, useMemo, useRef, useLayoutEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useNavigate } from "react-router-dom";
import { getSession, isProfesor, isOrientador, isAdmin, isRectorOrCoordinador } from "@/hooks/useSession";
import { cargoSegunGenero } from "@/lib/entrevistadores";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronDown, Plus, Search, Calendar as CalendarIcon, Download, Trash2,
  ClipboardList, FileText, Check, Pencil, X,
} from "lucide-react";
import iconRegistros from "@/assets/icons/registros-comportamiento.png";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { es } from "date-fns/locale";
import { apiRequest } from "@/lib/apiClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import SignatureCanvas from "react-signature-canvas";

import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
const TIPOS = [
  { value: "academico_disciplina", label: "Académico y de Disciplina", titulo: "REGISTRO DE COMPORTAMIENTO ACADÉMICO Y DE DISCIPLINA", titulo_var: "ACADÉMICO Y DE DISCIPLINA" },
  { value: "academico", label: "Académico", titulo: "REGISTRO DE COMPORTAMIENTO ACADÉMICO", titulo_var: "ACADÉMICO" },
  { value: "disciplina", label: "Disciplina", titulo: "REGISTRO DE COMPORTAMIENTO Y DISCIPLINA", titulo_var: "Y DISCIPLINA" },
];

const TIPO_LABEL: Record<string, string> = {
  academico_disciplina: "Académico y Disciplina",
  academico: "Académico",
  disciplina: "Disciplina",
};

const TIPO_TITULO: Record<string, string> = TIPOS.reduce((acc, t) => ({ ...acc, [t.value]: t.titulo }), {});
const TIPO_TITULO_VAR: Record<string, string> = TIPOS.reduce((acc, t) => ({ ...acc, [t.value]: t.titulo_var }), {});

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo": 0, "Pre-Jardín": 1, "Prejardín": 1, "Jardín": 2, "Transición": 3,
  "Primero": 4, "Segundo": 5, "Tercero": 6, "Cuarto": 7, "Quinto": 8,
  "Sexto": 9, "Séptimo": 10, "Octavo": 11, "Noveno": 12,
  "Décimo": 13, "Undécimo": 14,
};

// Webhook viejo n8n eliminado — notificación va vía /api/comunicados/enviar
// con as_system, despachado o encolado según horario laboral.

interface Estudiante {
  id: number;
  nombres: string;
  apellidos: string;
  grado: string;
  salon: string;
  fecha_de_nacimiento?: string | null;
}

// Asignación del profesor: cada fila puede tener varias asignaturas / grados / salones
interface AsigRow {
  asignaturas: string[];
  grados: string[];
  salones: string[];
}

const calcularEdad = (nac: Date): number => {
  const hoy = hoyBogota();
  let e = hoy.getFullYear() - nac.getFullYear();
  const dm = hoy.getMonth() - nac.getMonth();
  if (dm < 0 || (dm === 0 && hoy.getDate() < nac.getDate())) e--;
  return e;
};

interface Registro {
  id: number;
  tipo: string;
  estudiante_id: number;
  estudiante_nombre: string;
  estudiante_apellidos: string;
  estudiante_grado: string;
  estudiante_salon: string;
  estudiante_edad: number | null;
  asignatura: string;
  fecha: string;
  comportamiento: string;
  firma_url: string | null;
  autor_id: string;
  autor_nombre: string;
  director_grupo_id: number | null;
  director_grupo_nombre: string | null;
  created_at: string;
}

const fmtFecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
const fmtFechaCorta = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

// Quita cualquier prefijo de cargo conocido del nombre completo guardado
const CARGOS_PREFIX = [
  "Profesor(a)", "Profesora", "Profesor", "Rector", "Rectora", "Coordinador(a)", "Coordinadora", "Coordinador", "Administrador", "Administradora",
  "Administrativa", "Orientadora Escolar", "Orientador Escolar", "Portera",
  "Administrativo(a)", "Secretaria General", "Orientador(a) Escolar",
  "Portero", "Servicios Generales",
];
// "Profesora:" / "Profesor:" según el cargo guardado en autor_nombre; neutro solo si no se sabe.
const labelDocente = (n: string): string => {
  const t = (n || "").trim();
  if (/^(Profesora|Coordinadora|Rectora|Orientadora Escolar)\b/.test(t)) return t.split(" ")[0] === "Orientadora" ? "Orientadora" : t.split(" ")[0];
  if (/^(Profesor|Coordinador|Rector|Orientador Escolar)\b/.test(t)) return t.split(" ")[0] === "Orientador" ? "Orientador" : t.split(" ")[0];
  return "Profesor(a)";
};
const stripCargo = (n: string): string => {
  for (const c of CARGOS_PREFIX) if (n.startsWith(c + " ")) return n.slice(c.length + 1);
  return n;
};

const hoyBogota = (): Date => {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  return new Date(y, m - 1, d);
};

const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const sanitizeFilename = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_");

// Carga binaria con XMLHttpRequest para image module
const loadBinary = (url: string): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.responseType = "arraybuffer";
  xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.response) : reject(new Error(`HTTP ${xhr.status}`));
  xhr.onerror = () => reject(new Error("Network error"));
  xhr.send();
});

// Genera el XML drawing para insertar una imagen inline en docx con tamaño en EMU
// 1 px ≈ 9525 EMU. Firma de ~180×60 px = 1714500×571500 EMU.
const drawingXmlForImage = (rId: string, widthPx: number, heightPx: number): string => {
  const cx = widthPx * 9525;
  const cy = heightPx * 9525;
  return `<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="100" name="Firma"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="100" name="Firma"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
};

// Genera y descarga el .docx usando la plantilla oficial del colegio
const descargarWord = async (r: Registro) => {
  try {
    const { default: PizZip } = await import("pizzip");
    const { default: Docxtemplater } = await import("docxtemplater");

    // Plantilla POR COLEGIO (cada colegio tiene su escudo/encabezado), igual
    // que el Manual de Convivencia. Vive en /plantillas/{colegio_id}/...
    const { colegio_id } = getSession();
    const templateBuf = await loadBinary(`/plantillas/${colegio_id}/registro_comportamiento_template.docx`);
    // Un .docx es un zip → sus 2 primeros bytes son "PK". Si el SPA devolvió el
    // index.html (plantilla ausente para este colegio), avisamos claro en vez
    // de dejar que PizZip explote con "Can't find end of central directory".
    const sig = new Uint8Array(templateBuf.slice(0, 2));
    if (sig[0] !== 0x50 || sig[1] !== 0x4B) {
      throw new Error("Este colegio aún no tiene configurada la plantilla de registro de comportamiento. Avísale al administrador.");
    }
    let firmaBuf: ArrayBuffer | null = null;
    if (r.firma_url) {
      try { firmaBuf = await loadBinary(r.firma_url); } catch (e) { console.warn("No se pudo cargar firma:", e); }
    }

    // 1) Render texto con docxtemplater
    const zip = new PizZip(templateBuf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
    });
    doc.render({
      TITULO: TIPO_TITULO_VAR[r.tipo] || "",
      ESTUDIANTE: `${r.estudiante_nombre} ${r.estudiante_apellidos}`,
      FECHA: fmtFecha(r.fecha),
      EDAD: r.estudiante_edad != null ? String(r.estudiante_edad) : "",
      GRADO: `${r.estudiante_grado}${r.estudiante_salon ? " " + r.estudiante_salon : ""}`,
      ASIGNATURA: r.asignatura || "",
      COMPORTAMIENTO: r.comportamiento || "",
      DOCENTE: stripCargo(r.autor_nombre || ""),
    });
    const renderedZip = doc.getZip();

    // 2) Sustituir el marcador de la firma
    let docXml = renderedZip.file("word/document.xml")?.asText() || "";
    if (firmaBuf) {
      // Añadir firma.png al zip
      renderedZip.file("word/media/firma_registro.png", firmaBuf, { binary: true });

      // Asegurar Content_Types tiene PNG
      let ctXml = renderedZip.file("[Content_Types].xml")?.asText() || "";
      if (!/Extension="png"/.test(ctXml)) {
        ctXml = ctXml.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
        renderedZip.file("[Content_Types].xml", ctXml);
      }

      // Añadir relación a document.xml.rels
      const relsPath = "word/_rels/document.xml.rels";
      let relsXml = renderedZip.file(relsPath)?.asText() || "";
      const ids = Array.from(relsXml.matchAll(/Id="rId(\d+)"/g)).map(m => parseInt(m[1]));
      const newRid = `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
      relsXml = relsXml.replace(
        "</Relationships>",
        `<Relationship Id="${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/firma_registro.png"/></Relationships>`
      );
      renderedZip.file(relsPath, relsXml);

      // Reemplazar el run con el placeholder por el drawing XML
      const drawing = drawingXmlForImage(newRid, 180, 60);
      docXml = docXml.replace(/<w:r[^>]*>\s*<w:t[^>]*>__FIRMA_PLACEHOLDER__<\/w:t>\s*<\/w:r>/, `<w:r>${drawing}</w:r>`);
    } else {
      docXml = docXml.replace("__FIRMA_PLACEHOLDER__", "_________________________");
    }
    renderedZip.file("word/document.xml", docXml);

    const out = renderedZip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(out);
    a.download = `Registro_${sanitizeFilename(r.estudiante_apellidos + "_" + r.estudiante_nombre)}_${r.fecha}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (err: any) {
    console.error("Descargar Word:", err);
    const detalle = err?.properties?.errors?.[0]?.message || err?.message || String(err);
    alert(`No se pudo generar el documento: ${detalle}`);
  }
};

const RegistrosComportamiento = () => {
  const navigate = useNavigate();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"crear" | "historial">("historial");
  const [autor, setAutor] = useState<{ id: string; nombre: string; nombreSimple: string; cargo: string }>({ id: "", nombre: "", nombreSimple: "", cargo: "" });
  const [puedeCrear, setPuedeCrear] = useState(false);

  // Form
  const [tipo, setTipo] = useState("");
  const [estBusqueda, setEstBusqueda] = useState("");
  const [estFocused, setEstFocused] = useState(false);
  const [estSeleccionado, setEstSeleccionado] = useState<Estudiante | null>(null);
  const [edad, setEdad] = useState("");
  const [asigRows, setAsigRows] = useState<AsigRow[]>([]); // todas las filas del profesor
  const [asignaturasSel, setAsignaturasSel] = useState<string[]>([]); // multi-check del form
  // Filtros para acotar la lista de estudiantes en la búsqueda del form
  const [formFiltroGrado, setFormFiltroGrado] = useState("");
  const [formFiltroSalon, setFormFiltroSalon] = useState("");
  const [fecha, setFecha] = useState<Date | undefined>(() => hoyBogota());
  const [calOpen, setCalOpen] = useState(false);
  const [comportamiento, setComportamiento] = useState("");
  const [firmaData, setFirmaData] = useState<string | null>(null);
  const [firmaUrlExistente, setFirmaUrlExistente] = useState<string | null>(null);
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);

  // Deep link ?registro=ID (el link que llega en el aviso de WhatsApp): al
  // terminar de cargar, abre el historial con ese registro expandido.
  const [deepLinkId, setDeepLinkId] = useState<number | null>(() => {
    const v = new URLSearchParams(window.location.search).get("registro");
    return v && /^\d+$/.test(v) ? parseInt(v) : null;
  });

  // Expandir / eliminar
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [eliminarId, setEliminarId] = useState<number | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Historial: nivel 1 = lista de estudiantes (filtros + búsqueda), nivel 2 = registros del elegido
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [histBusqueda, setHistBusqueda] = useState("");
  const [estVistaId, setEstVistaId] = useState<number | null>(null);
  const [ordenarPor, setOrdenarPor] = useState<"fecha" | "tipo" | "profesor">("fecha");

  const backLink = isAdmin() ? "/dashboard" : isRectorOrCoordinador() ? "/dashboard" : "/dashboard";

  useEffect(() => {
    const session = getSession();
    if (!session.id) {
      // Sin sesión: al login, y de vuelta aquí (conserva ?registro= del deep link)
      navigate(`/?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (!isProfesor() && !isOrientador() && !isAdmin() && !isRectorOrCoordinador()) {
      navigate("/"); return;
    }
    setAutor({
      id: session.id,
      // Cargo con género ("Profesora Lucía..."), nunca "Profesor(a)".
      nombre: [cargoSegunGenero(session.cargo || undefined, session.genero) || session.cargo, session.nombres, session.apellidos].filter(Boolean).join(" "),
      nombreSimple: [session.nombres, session.apellidos].filter(Boolean).join(" "),
      cargo: session.cargo || "",
    });
    setPuedeCrear(isProfesor());
    setTab(isProfesor() ? "crear" : "historial");

    const cargar = async () => {
      const [regsR, estsR, asigR, internoR] = await Promise.all([
        supabase.from("Registros_Comportamiento").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("Estudiantes").select("id, grado, salon"),
        isProfesor()
          ? supabase.from("Asignación Profesores").select('"Asignatura(s)", "Grado(s)", "Salon(es)"').eq("id", parseInt(session.id!))
          : Promise.resolve({ data: [] as any[] }),
        isProfesor()
          ? supabase.from("Internos").select("direccion_de_grupo").eq("id", parseInt(session.id!)).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setRegistros(regsR.data || []);

      // Filas de asignación del profesor (preserva la combinación asig×grados×salones por fila)
      const rows: AsigRow[] = (asigR.data || []).map((a: any) => ({
        asignaturas: (a["Asignatura(s)"] as string[] | null) || [],
        grados: (a["Grado(s)"] as string[] | null) || [],
        salones: (a["Salon(es)"] as string[] | null) || [],
      }));
      setAsigRows(rows);

      // Filtrar estudiantes a SOLO los que el profesor enseña o donde es director de grupo.
      // Admin/rector/coord/orientador ven a todos.
      // Fase 10.E.19: nombres/apellidos viven en Usuarios.
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const todosEsts = sortByApellidosNombres(await enrichWithNombres((estsR.data || []) as any));
      const debeFiltrar = isProfesor() && !isAdmin();
      if (debeFiltrar) {
        // Aulas exactas (grado+salón) por cada fila de Asignación
        const aulasExactas = new Set<string>();
        for (const r of rows) for (const g of r.grados) for (const s of r.salones) aulasExactas.add(`${g}|${s}`);
        // Dirección de grupo (puede ser "Séptimo 3" o "Transición")
        const dg = (internoR.data as any)?.direccion_de_grupo as string | null | undefined;
        const gradosCompletos = new Set<string>();
        if (dg && dg.trim()) {
          const parts = dg.trim().split(/\s+/);
          const ultimo = parts[parts.length - 1];
          if (parts.length > 1 && /^\d+$/.test(ultimo)) {
            const g = parts.slice(0, -1).join(" ");
            aulasExactas.add(`${g}|${ultimo}`);
          } else {
            gradosCompletos.add(dg.trim());
          }
        }
        const filtrados = todosEsts.filter(e =>
          aulasExactas.has(`${e.grado}|${e.salon || ""}`) ||
          gradosCompletos.has(e.grado)
        );
        setEstudiantes(filtrados);
      } else {
        setEstudiantes(todosEsts);
      }
      setLoading(false);
    };
    cargar();
  }, [navigate]);

  const recargar = async () => {
    const { data } = await supabase.from("Registros_Comportamiento").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false });
    setRegistros(data || []);
  };

  // Lista base ordenada alfabéticamente y con filtros opcionales por grado/salón
  const estudiantesBase = useMemo(() => {
    let lista = estudiantes;
    if (formFiltroGrado) lista = lista.filter(e => e.grado === formFiltroGrado);
    if (formFiltroSalon) lista = lista.filter(e => e.salon === formFiltroSalon);
    return [...lista].sort((a, b) =>
      a.apellidos.localeCompare(b.apellidos, "es") ||
      a.nombres.localeCompare(b.nombres, "es")
    );
  }, [estudiantes, formFiltroGrado, formFiltroSalon]);

  const gradosFormUnicos = useMemo(() => [...new Set(
    estudiantes.map(e => e.grado).filter(g => g && g.trim())
  )].sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99) || a.localeCompare(b, "es")), [estudiantes]);
  const salonesFormUnicos = useMemo(() => [...new Set(
    estudiantes.filter(e => !formFiltroGrado || e.grado === formFiltroGrado)
      .map(e => e.salon).filter(s => s && s.trim())
  )].sort(), [estudiantes, formFiltroGrado]);

  const estudiantesBusqueda = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = norm(estBusqueda.trim());
    if (!q) return estudiantesBase;
    const tokens = q.split(/\s+/).filter(Boolean);
    return estudiantesBase.filter(e => {
      const full = norm(`${e.nombres} ${e.apellidos}`);
      return tokens.every(t => full.includes(t));
    });
  }, [estudiantesBase, estBusqueda]);

  // Visible para el usuario actual: profesor solo ve los que envió o los que recibe como director de grupo;
  // rector/coord/orientador/admin ven todos.
  const registrosVisibles = useMemo(() => {
    if (!autor.id) return [] as Registro[];
    if (isProfesor() && !isAdmin()) {
      return registros.filter(r =>
        r.autor_id === autor.id ||
        (r.director_grupo_id != null && String(r.director_grupo_id) === autor.id)
      );
    }
    return registros;
  }, [registros, autor.id]);

  // Deep link: con los registros ya cargados, salta al registro del link.
  // Si no existe (borrado) o el rol no lo puede ver, queda el historial normal.
  useEffect(() => {
    if (deepLinkId == null || loading) return;
    const r = registrosVisibles.find(x => x.id === deepLinkId);
    setDeepLinkId(null);
    if (!r) return;
    setTab("historial");
    setEstVistaId(r.estudiante_id);
    setExpandedIds(new Set([r.id]));
    setTimeout(() => {
      document.querySelector(`[data-registro-id="${r.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [deepLinkId, loading, registrosVisibles]);

  // Estudiantes con registros (deduplicados), en orden alfabético
  const estudiantesConRegistros = useMemo(() => {
    const map = new Map<number, { id: number; nombres: string; apellidos: string; grado: string; salon: string; total: number }>();
    for (const r of registrosVisibles) {
      const ex = map.get(r.estudiante_id);
      if (ex) ex.total++;
      else map.set(r.estudiante_id, { id: r.estudiante_id, nombres: r.estudiante_nombre, apellidos: r.estudiante_apellidos, grado: r.estudiante_grado, salon: r.estudiante_salon, total: 1 });
    }
    return [...map.values()].sort((a, b) =>
      a.apellidos.localeCompare(b.apellidos, "es") ||
      a.nombres.localeCompare(b.nombres, "es")
    );
  }, [registrosVisibles]);

  const gradosUnicos = useMemo(() => [...new Set(estudiantesConRegistros.map(e => e.grado))]
    .sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99) || a.localeCompare(b, "es")), [estudiantesConRegistros]);
  const salonesUnicos = useMemo(() => [...new Set(
    estudiantesConRegistros.filter(e => !filtroGrado || e.grado === filtroGrado).map(e => e.salon).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [estudiantesConRegistros, filtroGrado]);

  // Lista del nivel 1 con filtros y búsqueda flexible (orden libre, sin tildes)
  const estudiantesHistorial = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const tokens = norm(histBusqueda.trim()).split(/\s+/).filter(Boolean);
    return estudiantesConRegistros.filter(e => {
      if (filtroGrado && e.grado !== filtroGrado) return false;
      if (filtroSalon && e.salon !== filtroSalon) return false;
      if (tokens.length) {
        const full = norm(`${e.nombres} ${e.apellidos}`);
        if (!tokens.every(t => full.includes(t))) return false;
      }
      return true;
    });
  }, [estudiantesConRegistros, filtroGrado, filtroSalon, histBusqueda]);

  // Virtualización de la lista del historial (contra el scroll de la página).
  const histListRef = useRef<HTMLDivElement>(null);
  const [histOffset, setHistOffset] = useState(0);
  useLayoutEffect(() => {
    const medir = () => { if (histListRef.current) setHistOffset(histListRef.current.getBoundingClientRect().top + window.scrollY); };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [estudiantesHistorial.length]);
  const histVirt = useWindowVirtualizer({ count: estudiantesHistorial.length, estimateSize: () => 74, overscan: 10, scrollMargin: histOffset });
  const histItems = histVirt.getVirtualItems();
  const histPadTop = histItems.length ? histItems[0].start - histOffset : 0;
  const histPadBottom = histItems.length ? histVirt.getTotalSize() - (histItems[histItems.length - 1].end - histOffset) : 0;

  const estVista = useMemo(() => estudiantesConRegistros.find(e => e.id === estVistaId) || null, [estudiantesConRegistros, estVistaId]);

  // Nivel 2: registros del estudiante elegido, ordenables por fecha/tipo/profesor.
  // No se ordena por asignatura: un registro puede tener varias (el profesor
  // dicta más de una), así que el agrupador natural es el profesor que lo creó.
  const registrosDelEstudiante = useMemo(() => {
    if (estVistaId == null) return [] as Registro[];
    const lista = registrosVisibles.filter(r => r.estudiante_id === estVistaId);
    const porFecha = (a: Registro, b: Registro) =>
      b.fecha.localeCompare(a.fecha) || (b.created_at || "").localeCompare(a.created_at || "");
    if (ordenarPor === "tipo") lista.sort((a, b) => (TIPO_LABEL[a.tipo] || "").localeCompare(TIPO_LABEL[b.tipo] || "", "es") || porFecha(a, b));
    else if (ordenarPor === "profesor") lista.sort((a, b) => stripCargo(a.autor_nombre || "").localeCompare(stripCargo(b.autor_nombre || ""), "es") || porFecha(a, b));
    else lista.sort(porFecha);
    return lista;
  }, [registrosVisibles, estVistaId, ordenarPor]);

  // Asignaturas que el profesor le dicta al estudiante seleccionado (intersección por aula)
  const asignaturasParaEstudiante = useMemo(() => {
    if (!estSeleccionado || asigRows.length === 0) return [] as string[];
    const set = new Set<string>();
    for (const row of asigRows) {
      const matchGrado = row.grados.includes(estSeleccionado.grado);
      const matchSalon = !estSeleccionado.salon || row.salones.includes(estSeleccionado.salon);
      if (matchGrado && matchSalon) for (const a of row.asignaturas) set.add(a);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [estSeleccionado, asigRows]);

  // Auto-llenar edad y asignaturas al elegir estudiante
  const seleccionarEstudiante = (e: Estudiante) => {
    setEstSeleccionado(e);
    setEstBusqueda("");
    setEstFocused(false);
    // Edad
    if (e.fecha_de_nacimiento) {
      const [y, m, d] = e.fecha_de_nacimiento.split("-").map(Number);
      if (y && m && d) {
        const ed = calcularEdad(new Date(y, m - 1, d));
        if (ed >= 0) setEdad(String(ed));
      }
    } else {
      setEdad("");
    }
    // Asignaturas — pre-marca todas las válidas
    const validas: string[] = [];
    for (const row of asigRows) {
      const matchGrado = row.grados.includes(e.grado);
      const matchSalon = !e.salon || row.salones.includes(e.salon);
      if (matchGrado && matchSalon) for (const a of row.asignaturas) if (!validas.includes(a)) validas.push(a);
    }
    validas.sort((a, b) => a.localeCompare(b, "es"));
    setAsignaturasSel(validas);
  };

  const toggleAsignatura = (a: string) => {
    setAsignaturasSel(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  };

  const limpiarFirma = () => {
    sigRef.current?.clear();
    setFirmaData(null);
    setFirmaUrlExistente(null);
  };

  const guardarFirma = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      setFirmaData(sigRef.current.toDataURL("image/png"));
    }
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setTipo(""); setEstSeleccionado(null); setEstBusqueda(""); setEdad(""); setAsignaturasSel([]);
    setFormFiltroGrado(""); setFormFiltroSalon("");
    setFecha(hoyBogota()); setComportamiento(""); setFirmaData(null); setFirmaUrlExistente(null);
    sigRef.current?.clear();
  };

  const iniciarEdicion = (r: Registro) => {
    setEditandoId(r.id);
    setTipo(r.tipo);
    // Construir un Estudiante a partir de los datos del registro (snapshot)
    setEstSeleccionado({
      id: r.estudiante_id,
      nombres: r.estudiante_nombre,
      apellidos: r.estudiante_apellidos,
      grado: r.estudiante_grado,
      salon: r.estudiante_salon,
      fecha_de_nacimiento: null,
    });
    setEdad(r.estudiante_edad != null ? String(r.estudiante_edad) : "");
    setAsignaturasSel(r.asignatura ? r.asignatura.split(",").map(s => s.trim()).filter(Boolean) : []);
    const [y, m, d] = r.fecha.split("-").map(Number);
    setFecha(new Date(y, m - 1, d));
    setComportamiento(r.comportamiento || "");
    setFirmaData(null);
    setFirmaUrlExistente(r.firma_url || null);
    sigRef.current?.clear();
    setTab("crear");
    window.scrollTo(0, 0);
  };

  const asignaturaTexto = asignaturasSel.join(", ");
  const tieneFirma = !!(firmaData || firmaUrlExistente);
  const camposCompletos = !!(tipo && estSeleccionado && asignaturasSel.length > 0 && fecha && comportamiento.trim() && tieneFirma);

  const handleGuardar = async () => {
    if (!camposCompletos || !estSeleccionado || !fecha) return;
    setGuardando(true);

    // Subir firma nueva si la hay; si no, conservar la existente (modo edición)
    let firmaUrl: string | null = firmaUrlExistente;
    if (firmaData) {
      try {
        const base64 = firmaData.split(",")[1];
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const fileName = `firmas-registros/${Date.now()}_${autor.id}.png`;
        const { error: upErr } = await supabase.storage.from("normi-archivos").upload(fileName, bytes, { contentType: "image/png" });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("normi-archivos").getPublicUrl(fileName);
          firmaUrl = urlData?.publicUrl || null;
        }
      } catch (e) {
        console.error("firma upload:", e);
      }
    }

    // Buscar director de grupo del estudiante
    const grupoEst = estSeleccionado.salon
      ? `${estSeleccionado.grado} ${estSeleccionado.salon}`
      : estSeleccionado.grado;
    const grupoEstSinSalon = estSeleccionado.grado;
    const { data: directoresRaw } = await supabase
      .from("Internos")
      .select("id, cargo")
      .or(`direccion_de_grupo.eq.${grupoEst},direccion_de_grupo.eq.${grupoEstSinSalon}`)
      .limit(1);
    // Fase 10.E.19: nombres/apellidos viven en Usuarios.
    const { enrichWithNombres } = await import("@/lib/nombresUsuarios");
    const directores = await enrichWithNombres((directoresRaw || []) as any);
    const director = directores[0] || null;

    const payload: any = {
      tipo,
      estudiante_id: estSeleccionado.id,
      estudiante_nombre: estSeleccionado.nombres,
      estudiante_apellidos: estSeleccionado.apellidos,
      estudiante_grado: estSeleccionado.grado,
      estudiante_salon: estSeleccionado.salon,
      estudiante_edad: edad ? parseInt(edad) : null,
      asignatura: asignaturaTexto,
      fecha: fmtLocal(fecha),
      comportamiento: comportamiento.trim(),
      firma_url: firmaUrl,
      director_grupo_id: director?.id || null,
      director_grupo_nombre: director ? `${director.nombres} ${director.apellidos}` : null,
    };

    if (editandoId != null) {
      // UPDATE — no se notifica de nuevo por WhatsApp
      const { error } = await supabase.from("Registros_Comportamiento").update(payload).eq("id", editandoId);
      if (error) {
        console.error("Update registro:", error);
        setGuardando(false);
        return;
      }
    } else {
      // INSERT — se notifica por WhatsApp
      const insertPayload = { ...payload, autor_id: autor.id, autor_nombre: autor.nombre };
      const { data: insertado, error } = await supabase.from("Registros_Comportamiento").insert(insertPayload).select("id");
      if (error) {
        console.error("Insert registro:", error);
        setGuardando(false);
        return;
      }

      try {
        const estLabel = `${estSeleccionado.nombres} ${estSeleccionado.apellidos} (${grupoEst})`;
        const tipoLabel = TIPO_LABEL[tipo];
        const asigLabel = asignaturasSel.length === 1 ? `asignatura ${asignaturaTexto}` : `asignaturas ${asignaturaTexto}`;
        // Link directo al registro recién creado (la página lo abre expandido)
        const nuevoId = Array.isArray(insertado) ? (insertado[0] as any)?.id : (insertado as any)?.id;
        const linkDirecto = nuevoId != null
          ? `, o entrando a este link:\nhttps://notasnormi.com/registros-comportamiento?registro=${nuevoId}`
          : ".";
        const mensaje = `${autor.nombreSimple} envió un Registro de Comportamiento (${tipoLabel}) sobre ${estLabel}, ${asigLabel}.\n\nPueden consultarlo y descargarlo entrando a notasnormi.com → Registros de Comportamiento${linkDirecto}`;

        // Coordinadores SOLO los del nivel del estudiante (decisión de Juan
        // 2026-08-31): el segmento lleva el grado y el resolver del server lo
        // cruza con Internos.niveles_coordina (vacío = coordina todos).
        const partes = ["Rector", `Coordinadores del nivel de ${grupoEst}`];
        const segmentos: any[] = [
          { perfil: ["Rector"] },
          { perfil: ["Coordinadores"], grados: [estSeleccionado.grado] },
        ];
        if (director && director.cargo === "Profesor(a)" && String(director.id) !== autor.id) {
          partes.push(`Profesor(a) con id ${director.id}`);
          segmentos.push({ perfil: ["Profesores"], id_destinatarios: [String(director.id)] });
        }
        const destinatarios = partes.join(", ");

        apiRequest('/api/comunicados/enviar', {
          method: 'POST',
          body: JSON.stringify({
            as_system: true,
            sistema_tag: 'Registro',
            destinatarios_label: destinatarios,
            mensaje,
            segmentos,
          }),
        }).catch(e => console.error("Notificación registro comportamiento:", e));
      } catch (e) {
        console.error("Notificación registro:", e);
      }
    }

    // Reset
    setEditandoId(null);
    setTipo(""); setEstSeleccionado(null); setEstBusqueda(""); setEdad(""); setAsignaturasSel([]);
    setFormFiltroGrado(""); setFormFiltroSalon("");
    setFecha(hoyBogota()); setComportamiento(""); setFirmaData(null); setFirmaUrlExistente(null);
    sigRef.current?.clear();
    await recargar();
    setTab("historial");
    setGuardando(false);
  };

  const handleEliminar = async () => {
    if (eliminarId == null) return;
    setEliminando(true);
    const { error } = await supabase.from("Registros_Comportamiento").delete().eq("id", eliminarId);
    if (error) {
      console.error("Delete registro:", error);
      window.alert("No se pudo eliminar el registro. Inténtalo de nuevo; si persiste, avisa al administrador.");
    } else {
      setExpandedIds(prev => { const n = new Set(prev); n.delete(eliminarId); return n; });
      setEliminarId(null);
      await recargar();
    }
    setEliminando(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            {tab === "historial" && estVistaId != null ? (
              <>
                <button onClick={() => setEstVistaId(null)} className="text-primary hover:underline">Registros de Comportamiento</button>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="text-foreground font-medium">{estVista ? `${estVista.apellidos} ${estVista.nombres}` : "Estudiante"}</span>
              </>
            ) : (
              <span className="text-foreground font-medium">Registros de Comportamiento</span>
            )}
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
            <img src={iconRegistros} alt="" className="h-6 w-6 object-contain" /> Registros de Comportamiento
          </h2>

          {puedeCrear && editandoId == null && (
            <div className="flex gap-2 mb-6 border-b border-border">
              <button data-guia="comportamiento_observador.reg_tab_crear" onClick={() => setTab("crear")} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "crear" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                Crear nuevo
              </button>
              <button data-guia="comportamiento_observador.reg_tab_historial" onClick={() => setTab("historial")} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "historial" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                Historial
              </button>
            </div>
          )}

          {tab === "crear" && puedeCrear && (
            <div className="space-y-5 max-w-3xl">
              {editandoId != null && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-4 h-4" />
                    <span>Editando registro existente</span>
                  </div>
                  <button onClick={cancelarEdicion} className="text-xs underline hover:no-underline">Cancelar</button>
                </div>
              )}
              <div>
                <label className="text-sm font-medium block mb-1">Tipo de registro *</label>
                <select data-guia="comportamiento_observador.reg_tipo" value={tipo} onChange={e => setTipo(e.target.value)} className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Selecciona el tipo</option>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Estudiante *</label>
                {estSeleccionado ? (
                  <div className="flex items-center justify-between border border-border rounded-md p-2 bg-muted/20">
                    <div>
                      <p className="text-sm font-semibold">{estSeleccionado.apellidos} {estSeleccionado.nombres}</p>
                      <p className="text-xs text-muted-foreground">{estSeleccionado.grado} {estSeleccionado.salon}</p>
                    </div>
                    <button onClick={() => { setEstSeleccionado(null); setEstBusqueda(""); setEdad(""); setAsignaturasSel([]); }} className="text-xs text-primary hover:underline">Cambiar</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select data-guia="comportamiento_observador.reg_filtro_grado_form" value={formFiltroGrado} onChange={e => { setFormFiltroGrado(e.target.value); setFormFiltroSalon(""); }} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                        <option value="">Todos los grados</option>
                        {gradosFormUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <select data-guia="comportamiento_observador.reg_filtro_salon_form" value={formFiltroSalon} onChange={e => setFormFiltroSalon(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                        <option value="">Todos los salones</option>
                        {salonesFormUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        data-guia="comportamiento_observador.reg_buscar_estudiante"
                        value={estBusqueda}
                        onChange={e => setEstBusqueda(e.target.value)}
                        onFocus={() => setEstFocused(true)}
                        onBlur={() => setTimeout(() => setEstFocused(false), 150)}
                        placeholder="Haz click para ver la lista o escribe para filtrar..."
                        className="w-full pl-9 pr-3 py-2 border border-input rounded-md text-sm bg-background"
                      />
                      {estFocused && estudiantesBusqueda.length > 0 && (
                        <div data-guia="comportamiento_observador.reg_resultado_estudiante" className="absolute top-full left-0 right-0 mt-1 z-20 border border-border rounded-md max-h-64 overflow-y-auto bg-card shadow-md">
                          {estudiantesBusqueda.map(e => (
                            <button key={e.id} onMouseDown={(ev) => { ev.preventDefault(); seleccionarEstudiante(e); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-muted/50">
                              {e.apellidos} {e.nombres} <span className="text-xs text-muted-foreground">— {e.grado} {e.salon}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {estFocused && estudiantesBusqueda.length === 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-20 border border-border rounded-md bg-card shadow-md p-3 text-sm text-muted-foreground">
                          No hay estudiantes con esos filtros.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Edad</label>
                  <input data-guia="comportamiento_observador.reg_edad" type="number" value={edad} onChange={e => setEdad(e.target.value)} min={3} max={25} placeholder="Edad" className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Fecha *</label>
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <button data-guia="comportamiento_observador.reg_fecha" className="w-full inline-flex items-center justify-between px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                        {fecha ? fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "Selecciona"}
                        <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent data-guia="comportamiento_observador.reg_fecha_calendario" className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={fecha} onSelect={(d) => { setFecha(d); setCalOpen(false); }} locale={es} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Asignatura(s) *</label>
                {!estSeleccionado ? (
                  <p className="text-xs text-muted-foreground italic">Selecciona primero un estudiante para ver las asignaturas que le dictas.</p>
                ) : asignaturasParaEstudiante.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No tienes asignaturas registradas para este estudiante.</p>
                ) : (
                  <div data-guia="comportamiento_observador.reg_asignaturas" className="flex flex-wrap gap-3 border border-border rounded-md p-3 bg-muted/10">
                    {asignaturasParaEstudiante.map(a => (
                      <label key={a} className="inline-flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleAsignatura(a)}>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${asignaturasSel.includes(a) ? "bg-primary border-primary" : "border-border"}`}>
                          {asignaturasSel.includes(a) && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <span className="text-sm">{a}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Comportamiento Significativo *</label>
                <textarea data-guia="comportamiento_observador.reg_comportamiento" value={comportamiento} onChange={e => setComportamiento(e.target.value)} placeholder="Describe el comportamiento observado en detalle..." className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[180px] resize-y" />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Firma *</label>
                {firmaUrlExistente && !firmaData ? (
                  <div className="border border-border rounded-md bg-white">
                    <img src={firmaUrlExistente} alt="firma" className="w-full h-32 object-contain rounded-md" />
                    <div className="flex justify-end p-2 border-t border-border">
                      <button onClick={() => setFirmaUrlExistente(null)} className="text-xs text-muted-foreground hover:text-foreground">Cambiar firma</button>
                    </div>
                  </div>
                ) : (
                  <div data-guia="comportamiento_observador.reg_firma_canvas" className="border border-border rounded-md bg-white">
                    <SignatureCanvas
                      ref={sigRef}
                      penColor="black"
                      canvasProps={{ className: "w-full h-32 rounded-md" }}
                      onEnd={guardarFirma}
                    />
                    <div className="flex justify-end p-2 border-t border-border">
                      <button onClick={limpiarFirma} className="text-xs text-muted-foreground hover:text-foreground">Limpiar</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                {editandoId != null && (
                  <button onClick={cancelarEdicion} disabled={guardando} className="px-4 py-2.5 rounded-md border text-sm font-medium hover:bg-muted disabled:opacity-50">
                    Cancelar
                  </button>
                )}
                <button data-guia="comportamiento_observador.reg_guardar" onClick={handleGuardar} disabled={guardando || !camposCompletos} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  <Plus className="w-4 h-4" /> {guardando ? "Guardando..." : (editandoId != null ? "Guardar cambios" : "Crear registro")}
                </button>
              </div>
            </div>
          )}

          {tab === "historial" && (loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : estVistaId == null ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <select data-guia="comportamiento_observador.reg_filtro_grado" value={filtroGrado} onChange={e => { setFiltroGrado(e.target.value); setFiltroSalon(""); }} className="px-3 py-2 border border-input rounded-md text-sm bg-card cursor-pointer">
                  <option value="">Todos los grados</option>
                  {gradosUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select data-guia="comportamiento_observador.reg_filtro_salon" value={filtroSalon} onChange={e => setFiltroSalon(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm bg-card cursor-pointer">
                  <option value="">Todos los salones</option>
                  {salonesUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  data-guia="comportamiento_observador.reg_buscar_hist"
                  value={histBusqueda}
                  onChange={e => setHistBusqueda(e.target.value)}
                  placeholder="Buscar estudiante por nombre..."
                  className="w-full pl-9 pr-9 py-2 border border-input rounded-md text-sm bg-card"
                />
                {histBusqueda && (
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setHistBusqueda("")} title="Limpiar"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {estudiantesHistorial.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No hay estudiantes con registros para estos filtros.</p>
                </div>
              ) : (
                <div ref={histListRef} data-guia="comportamiento_observador.reg_item_estudiante">
                  {histPadTop > 0 && <div style={{ height: histPadTop }} />}
                  {histItems.map(vi => {
                    const e = estudiantesHistorial[vi.index];
                    return (
                    <button
                      key={e.id}
                      onClick={() => { setEstVistaId(e.id); setOrdenarPor("fecha"); setExpandedIds(new Set()); }}
                      className="w-full flex items-center justify-between border border-border rounded-lg p-4 mb-2 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-foreground text-sm">{e.apellidos} {e.nombres}</p>
                        <p className="text-xs text-muted-foreground">{e.grado} {e.salon}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full whitespace-nowrap">
                          {e.total} {e.total === 1 ? "registro" : "registros"}
                        </span>
                        <ChevronDown className="w-5 h-5 -rotate-90 text-muted-foreground shrink-0" />
                      </div>
                    </button>
                    );
                  })}
                  {histPadBottom > 0 && <div style={{ height: histPadBottom }} />}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-semibold text-foreground">{estVista?.apellidos} {estVista?.nombres}</p>
                    <p className="text-xs text-muted-foreground">{estVista?.grado} {estVista?.salon}</p>
                  </div>
                </div>
                <select data-guia="comportamiento_observador.reg_ordenar" value={ordenarPor} onChange={e => setOrdenarPor(e.target.value as "fecha" | "tipo" | "profesor")} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="fecha">Ordenar por fecha (recientes primero)</option>
                  <option value="tipo">Ordenar por tipo</option>
                  <option value="profesor">Ordenar por profesor</option>
                </select>
              </div>

              {registrosDelEstudiante.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>Este estudiante ya no tiene registros.</p>
                </div>
              ) : (
                <div data-guia="comportamiento_observador.reg_item_registro" className="space-y-3">
                  {registrosDelEstudiante.map(r => {
                    const isExp = expandedIds.has(r.id);
                    return (
                      <div key={r.id} data-registro-id={r.id} className="border border-border rounded-lg overflow-hidden">
                        <div className="flex items-stretch hover:bg-muted/30 transition-colors">
                          <button onClick={() => toggleExpanded(r.id)} className="flex-1 flex items-center justify-between p-4 text-left cursor-pointer">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 rounded-full">{r.estudiante_grado} {r.estudiante_salon}</span>
                                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">{TIPO_LABEL[r.tipo]}</span>
                                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">{r.asignatura}</span>
                              </div>
                              <p className="font-semibold text-foreground text-sm">{r.estudiante_apellidos} {r.estudiante_nombre}</p>
                              <p className="text-xs text-muted-foreground">{fmtFechaCorta(r.fecha)} · Enviado por {r.autor_nombre}</p>
                            </div>
                            <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${isExp ? "rotate-180" : ""}`} />
                          </button>
                          {r.autor_id === autor.id && (
                            <>
                              <button data-guia="comportamiento_observador.reg_editar" onClick={(e) => { e.stopPropagation(); iniciarEdicion(r); }} title="Editar registro" className="px-3 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer border-l border-border flex items-center">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button data-guia="comportamiento_observador.reg_eliminar" onClick={(e) => { e.stopPropagation(); setEliminarId(r.id); }} title="Eliminar registro" className="px-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer border-l border-border flex items-center">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                        {isExp && (
                          <div className="border-t border-border p-4 bg-muted/10 text-sm text-foreground leading-relaxed space-y-3">
                            <p className="font-bold text-center">{TIPO_TITULO[r.tipo]}</p>
                            <p><span className="font-medium">Estudiante:</span> <span className="text-primary font-medium">{r.estudiante_nombre} {r.estudiante_apellidos}</span></p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                              <p><span className="font-medium">Fecha:</span> <span className="text-primary font-medium">{fmtFecha(r.fecha)}</span></p>
                              <p><span className="font-medium">Edad:</span> <span className="text-primary font-medium">{r.estudiante_edad ?? "—"}</span></p>
                              <p className="sm:col-span-2"><span className="font-medium">Grado:</span> <span className="text-primary font-medium">{r.estudiante_grado} {r.estudiante_salon}</span></p>
                              <p><span className="font-medium">{labelDocente(r.autor_nombre)}:</span> <span className="text-primary font-medium">{stripCargo(r.autor_nombre)}</span></p>
                              <p><span className="font-medium">Asignatura(s):</span> <span className="text-primary font-medium">{r.asignatura}</span></p>
                              {r.director_grupo_nombre && (
                                <p className="sm:col-span-2"><span className="font-medium">Director de grupo:</span> <span className="text-primary font-medium">{r.director_grupo_nombre}</span></p>
                              )}
                            </div>
                            <div>
                              <p className="font-medium mb-1">Comportamiento Significativo:</p>
                              <div className="bg-background border border-border rounded-md p-3 whitespace-pre-wrap">{r.comportamiento}</div>
                            </div>
                            {r.firma_url && (
                              <div>
                                <p className="font-medium mb-1">Firma:</p>
                                <img src={r.firma_url} alt="firma" className="max-h-20 border border-border rounded-md bg-white p-1" />
                              </div>
                            )}
                            <div className="pt-2">
                              <button data-guia="comportamiento_observador.reg_descargar_word" onClick={() => descargarWord(r)} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                                <Download className="w-4 h-4" /> Descargar Word
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Confirmar eliminar */}
      <Dialog open={eliminarId !== null} onOpenChange={(o) => !o && setEliminarId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar registro</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">¿Seguro que quieres eliminar este registro? Esta acción no se puede deshacer.</p>
          <DialogFooter>
            <button onClick={() => setEliminarId(null)} disabled={eliminando} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted disabled:opacity-50">Cancelar</button>
            <button data-guia="comportamiento_observador.reg_confirmar_eliminar" onClick={handleEliminar} disabled={eliminando} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50">
              {eliminando ? "Eliminando..." : "Eliminar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default RegistrosComportamiento;
