import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isOrientador, isAdmin, isRectorOrCoordinador, isProfesor } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Download, Check, Search, CalendarPlus, Phone, Plus } from "lucide-react";
import iconCasos from "@/assets/icons/casos.png";
import { markLastSeen } from "@/utils/notificaciones";
import { apiClient, apiRequest } from "@/lib/apiClient";

interface Remision {
  id: number;
  estudiante_id: number;
  estudiante_nombre: string;
  estudiante_apellidos: string;
  estudiante_grado: string;
  estudiante_salon: string;
  fecha: string;
  motivo: string;
  docente_id: string;
  docente_nombre: string;
  docente_cargo: string | null;
  firma_url: string | null;
  recibido_por_id: string | null;
  recibido_por_nombre: string | null;
  fecha_recibido: string | null;
  /** Marca de Orientación: el caso ya fue atendido (control pedido por coordinación). */
  atendida_at: string | null;
  atendida_por_id: string | null;
  atendida_por_nombre: string | null;
  created_at: string;
  destinos: string[] | null;
  tipo_documento: string | null;
  especificacion_conducta: string | null;
  medidas_previas: string | null;
}

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo": 0, "Pre-Jardín": 1, "Prejardín": 1, "Jardín": 2, "Transición": 3,
  "Primero": 4, "Segundo": 5, "Tercero": 6, "Cuarto": 7, "Quinto": 8,
  "Sexto": 9, "Séptimo": 10, "Octavo": 11, "Noveno": 12,
  "Décimo": 13, "Undécimo": 14,
};

const fmtFecha = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

const sanitizeFilename = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_");

const loadBinary = (url: string): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.responseType = "arraybuffer";
  xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.response) : reject(new Error(`HTTP ${xhr.status}`));
  xhr.onerror = () => reject(new Error("Network error"));
  xhr.send();
});

// Inline drawing XML para insertar una imagen (firma / escudo).
const drawingXmlForImage = (rId: string, widthPx: number, heightPx: number, id = 100, name = "Imagen"): string => {
  const cx = widthPx * 9525;
  const cy = heightPx * 9525;
  return `<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
};

// Convierte cualquier imagen (incl. WebP) a PNG (ArrayBuffer) usando canvas.
const imgToPng = (url: string): Promise<ArrayBuffer | null> => new Promise((resolve) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 200; canvas.height = img.naturalHeight || 200;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => blob ? blob.arrayBuffer().then(resolve).catch(() => resolve(null)) : resolve(null), "image/png");
    } catch { resolve(null); }
  };
  img.onerror = () => resolve(null);
  img.src = url;
});

const edadDesde = (fechaNac?: string | null): string => {
  if (!fechaNac) return "";
  const d = new Date(fechaNac); if (isNaN(d.getTime())) return "";
  const hoy = new Date();
  let e = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--;
  return e >= 0 && e < 120 ? String(e) : "";
};

const descargarWord = async (r: Remision) => {
  try {
    const { default: PizZip } = await import("pizzip");
    const { default: Docxtemplater } = await import("docxtemplater");

    const templateBuf = await loadBinary("/remision_005_template.docx");

    // Datos del colegio (membrete) + escudo, identidad y contacto del estudiante.
    let colegioNombre = "", dane = "", nit = "", ciudad = "", logoUrl: string | null = null;
    try {
      const cc = await apiRequest<{ nombre: string; logo_url: string | null; config: any }>("/api/colegio/config");
      colegioNombre = cc.nombre || "";
      logoUrl = cc.logo_url || null;
      dane = cc.config?.dane || ""; nit = cc.config?.nit || ""; ciudad = cc.config?.ciudad || "";
    } catch (e) { console.warn("config colegio:", e); }

    let telEst = "", acuStr = "";
    try {
      const c = await apiClient.orientacion.contactoEstudiante(r.estudiante_id);
      telEst = c.estudiante_telefono || "";
      if (c.acudientes.length > 0) acuStr = c.acudientes.map(a => `${a.nombre}${a.telefono ? ` (${a.telefono})` : ""}`).join("\n");
    } catch (e) { console.warn("Contacto:", e); }

    let fechaNac = "";
    try {
      const { data } = await supabase.from("Usuarios").select("fecha_de_nacimiento").eq("id", String(r.estudiante_id)).maybeSingle();
      fechaNac = (data as any)?.fecha_de_nacimiento || "";
    } catch { /* ignore */ }

    const [firmaBuf, escudoBuf] = await Promise.all([
      r.firma_url ? loadBinary(r.firma_url).catch(() => null) : Promise.resolve(null),
      logoUrl ? imgToPng(logoUrl) : Promise.resolve(null),
    ]);

    const zip = new PizZip(templateBuf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true, linebreaks: true,
      delimiters: { start: "{", end: "}" }, nullGetter: () => "",
    });

    const grupo = r.estudiante_salon ? `${r.estudiante_grado} ${r.estudiante_salon}` : r.estudiante_grado;
    const destinos = r.destinos || [];
    const td = (r.tipo_documento || "").toUpperCase();
    const X = "X";
    const recibidoFecha = r.fecha_recibido ? new Date(r.fecha_recibido).toLocaleString("es-CO") : "";

    doc.render({
      COLEGIO: colegioNombre, DANE: dane, NIT: nit, CIUDAD: ciudad,
      NOMBRE_ESTUDIANTE: `${r.estudiante_nombre} ${r.estudiante_apellidos}`,
      GRADO: grupo,
      DOCUMENTO: String(r.estudiante_id),
      X_RC: td === "RC" ? X : "", X_TI: td === "TI" ? X : "", X_CC: td === "CC" ? X : "",
      FECHA_NAC: fechaNac ? fmtFecha(fechaNac) : "", EDAD: edadDesde(fechaNac),
      ACUDIENTE: acuStr, TELEFONO: telEst, FECHA: fmtFecha(r.fecha),
      X_DG: destinos.includes("director_grupo") ? X : "",
      X_ORIENT: destinos.includes("orientacion") ? X : "",
      X_DOC: "",
      X_OTRO: destinos.includes("coordinador") ? X : "",
      OTRO_CUAL: destinos.includes("coordinador") ? "Coordinador" : "",
      MOTIVO: r.motivo || "",
      ESPECIFICACION: r.especificacion_conducta || "",
      MEDIDAS: r.medidas_previas || "",
      DOCENTE: [r.docente_cargo, r.docente_nombre].filter(Boolean).join(" "),
      ROL: r.docente_cargo || "",
      RECIBIDO_POR: r.recibido_por_nombre || "",
      ESTADO: r.atendida_at ? "Atendida" : r.recibido_por_id ? "Recibida" : "Pendiente",
      ATENDIDA_POR: r.atendida_por_nombre || "",
      FECHA_ATENDIDA: r.atendida_at ? fmtFecha(r.atendida_at.slice(0, 10)) : "",
      RECIBIDO_CARGO: "",
      RECIBIDO_FECHA: recibidoFecha,
    });

    const renderedZip = doc.getZip();
    let docXml = renderedZip.file("word/document.xml")?.asText() || "";

    const inyectar = (buf: ArrayBuffer, placeholder: string, filename: string, wPx: number, hPx: number, id: number, name: string) => {
      renderedZip.file(`word/media/${filename}`, buf, { binary: true });
      let ctXml = renderedZip.file("[Content_Types].xml")?.asText() || "";
      if (!/Extension="png"/.test(ctXml)) {
        ctXml = ctXml.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
        renderedZip.file("[Content_Types].xml", ctXml);
      }
      const relsPath = "word/_rels/document.xml.rels";
      let relsXml = renderedZip.file(relsPath)?.asText() || "";
      const ids = Array.from(relsXml.matchAll(/Id="rId(\d+)"/g)).map(m => parseInt(m[1]));
      const newRid = `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
      relsXml = relsXml.replace("</Relationships>", `<Relationship Id="${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/></Relationships>`);
      renderedZip.file(relsPath, relsXml);
      const drawing = drawingXmlForImage(newRid, wPx, hPx, id, name);
      docXml = docXml.replace(new RegExp(`<w:r[^>]*>\\s*<w:t[^>]*>${placeholder}</w:t>\\s*</w:r>`), `<w:r>${drawing}</w:r>`);
    };

    if (escudoBuf) inyectar(escudoBuf, "__ESCUDO_PLACEHOLDER__", "escudo_remision.png", 70, 70, 101, "Escudo");
    else docXml = docXml.replace("__ESCUDO_PLACEHOLDER__", "");
    if (firmaBuf) inyectar(firmaBuf, "__FIRMA_PLACEHOLDER__", "firma_remision.png", 180, 60, 100, "Firma");
    else docXml = docXml.replace("__FIRMA_PLACEHOLDER__", "_________________________");

    renderedZip.file("word/document.xml", docXml);

    const out = renderedZip.generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(out);
    a.download = `Remision_005_${sanitizeFilename(r.estudiante_apellidos + "_" + r.estudiante_nombre)}_${r.fecha}.docx`;
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

const RemisionesOrientacion = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [remisiones, setRemisiones] = useState<Remision[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [autorId, setAutorId] = useState("");
  const [autorNombre, setAutorNombre] = useState("");

  // Filtros
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"" | "pendiente" | "recibida" | "atendida">("");
  const [filtroDocente, setFiltroDocente] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [marcando, setMarcando] = useState<number | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    // Orientador y admin gestionan; rector y coordinadores consultan todas;
    // los profesores solo ven las que ellos remitieron.
    const puedeEntrar = isOrientador() || isAdmin() || isRectorOrCoordinador() || isProfesor();
    if (!puedeEntrar) { navigate("/dashboard"); return; }

    setAutorId(session.id);
    setAutorNombre([session.nombres, session.apellidos].filter(Boolean).join(" "));

    const cargar = async () => {
      const soloMias = isProfesor() && !isOrientador() && !isAdmin() && !isRectorOrCoordinador();
      let q = supabase.from("Remisiones_Orientacion").select("*").order("created_at", { ascending: false });
      if (soloMias) q = q.eq("docente_id", String(session.id));
      const [remR, vistaR] = await Promise.all([
        q,
        supabase.from("Notificaciones_Vistas")
          .select("ultimo_id_visto")
          .eq("usuario_id", session.id!)
          .eq("seccion", "remisiones")
          .maybeSingle(),
      ]);

      const lista = (remR.data || []) as Remision[];
      setRemisiones(lista);
      setLastSeen((vistaR.data as any)?.ultimo_id_visto ?? 0);

      if (lista.length > 0 && (isOrientador() || isAdmin())) {
        const maxId = Math.max(...lista.map(r => r.id));
        markLastSeen("remisiones", session.id!, maxId).catch(() => {});
      }
      setLoading(false);
    };
    cargar();
  }, [navigate]);

  const gradosUnicos = useMemo(() => [...new Set(
    remisiones.map(r => r.estudiante_grado).filter(g => g && g.trim())
  )].sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99) || a.localeCompare(b, "es")), [remisiones]);

  const salonesUnicos = useMemo(() => [...new Set(
    remisiones.filter(r => !filtroGrado || r.estudiante_grado === filtroGrado)
      .map(r => r.estudiante_salon).filter(s => s && s.trim())
  )].sort(), [remisiones, filtroGrado]);

  const estadoDe = (r: Remision): "pendiente" | "recibida" | "atendida" =>
    r.atendida_at ? "atendida" : r.recibido_por_id ? "recibida" : "pendiente";

  // Docentes que han remitido (para el filtro "Remitido por"), ordenados por nombre.
  const docentesUnicos = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of remisiones) if (r.docente_id && !m.has(String(r.docente_id))) m.set(String(r.docente_id), [r.docente_cargo, r.docente_nombre].filter(Boolean).join(" "));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [remisiones]);

  const remisionesFiltradas = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = norm(busqueda.trim());
    return remisiones.filter(r => {
      if (filtroGrado && r.estudiante_grado !== filtroGrado) return false;
      if (filtroSalon && r.estudiante_salon !== filtroSalon) return false;
      if (filtroEstado && estadoDe(r) !== filtroEstado) return false;
      if (filtroDocente && String(r.docente_id) !== filtroDocente) return false;
      if (q) {
        const full = norm(`${r.estudiante_nombre} ${r.estudiante_apellidos} ${r.docente_nombre}`);
        const tokens = q.split(/\s+/).filter(Boolean);
        if (!tokens.every(t => full.includes(t))) return false;
      }
      return true;
    });
  }, [remisiones, busqueda, filtroGrado, filtroSalon, filtroEstado, filtroDocente]);

  // Contacto del estudiante (teléfono + acudientes), cargado al expandir.
  const [contactos, setContactos] = useState<Record<number, { estudiante_telefono: string; acudientes: { nombre: string; telefono: string }[] } | "loading">>({});

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    // Cargar contacto del estudiante la primera vez que se expande.
    const rem = remisiones.find(r => r.id === id);
    if (rem && contactos[id] === undefined) {
      setContactos(prev => ({ ...prev, [id]: "loading" }));
      apiClient.orientacion.contactoEstudiante(rem.estudiante_id)
        .then(c => setContactos(prev => ({ ...prev, [id]: c })))
        .catch(() => setContactos(prev => ({ ...prev, [id]: { estudiante_telefono: "", acudientes: [] } })));
    }
  };

  const marcarRecibida = async (r: Remision) => {
    if (marcando != null) return;
    setMarcando(r.id);
    try {
      // El server marca recibida (recibido_por = usuario) y avisa por WhatsApp al docente.
      const res = await apiClient.orientacion.remisionRecibida(r.id);
      setRemisiones(prev => prev.map(x =>
        x.id === r.id
          ? { ...x, recibido_por_id: autorId, recibido_por_nombre: res.recibido_por_nombre || autorNombre, fecha_recibido: new Date().toISOString() }
          : x
      ));
      toast({ title: "Recibida", description: "Marcada como recibida. Se avisó al docente por WhatsApp." });
    } catch (e: any) {
      console.error("Marcar recibida:", e);
      toast({ title: "Error", description: "No se pudo marcar como recibida.", variant: "destructive" });
    } finally {
      setMarcando(null);
    }
  };

  const marcarAtendida = async (r: Remision) => {
    if (marcando != null) return;
    setMarcando(r.id);
    try {
      const res = await apiClient.orientacion.remisionAtendida(r.id);
      setRemisiones(prev => prev.map(x =>
        x.id === r.id
          ? {
              ...x,
              atendida_at: res.atendida_at, atendida_por_id: autorId, atendida_por_nombre: res.atendida_por_nombre || autorNombre,
              recibido_por_id: x.recibido_por_id || autorId, recibido_por_nombre: x.recibido_por_nombre || autorNombre,
              fecha_recibido: x.fecha_recibido || res.atendida_at,
            }
          : x
      ));
      toast({ title: "Atendida", description: "Marcada como atendida. Se avisó al docente por WhatsApp." });
    } catch (e: any) {
      console.error("Marcar atendida:", e);
      toast({ title: "Error", description: "No se pudo marcar como atendida.", variant: "destructive" });
    } finally {
      setMarcando(null);
    }
  };

  // Quién gestiona (recibir, atender, agendar): Orientación y admin. Los demás solo consultan.
  const gestiona = isOrientador() || isAdmin();

  const backLink = isAdmin() ? "/dashboard" : "/dashboard";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">{gestiona ? "Remisiones a Orientación" : "Orientación Escolar"}</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <img src={iconCasos} alt="" className="h-6 w-6 object-contain" />
              {gestiona ? "Remisiones a Orientación" : "Orientación Escolar"}
            </h2>
            {/* Quien no es Orientación remite desde aquí (misma ficha: ver y crear, como en Consultas). */}
            {!isOrientador() && (
              <button
                type="button"
                data-guia="orientacion.boton_nueva_remision"
                onClick={() => navigate("/remitir-orientacion")}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Plus className="w-4 h-4" /> Nueva remisión
              </button>
            )}
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
            <select
              data-guia="orientacion.remisiones_filtro_estado"
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value as any)}
              className="text-sm border rounded px-2 py-2 bg-background"
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="recibida">Recibidas</option>
              <option value="atendida">Atendidas</option>
            </select>
            {docentesUnicos.length > 1 && (
              <select
                data-guia="orientacion.remisiones_filtro_docente"
                value={filtroDocente}
                onChange={e => setFiltroDocente(e.target.value)}
                className="text-sm border rounded px-2 py-2 bg-background"
              >
                <option value="">Remitido por: todos</option>
                {docentesUnicos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
              </select>
            )}
            <select
              value={filtroGrado}
              onChange={e => { setFiltroGrado(e.target.value); setFiltroSalon(""); }}
              className="text-sm border rounded px-2 py-2 bg-background"
            >
              <option value="">Todos los grados</option>
              {gradosUnicos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select
              value={filtroSalon}
              onChange={e => setFiltroSalon(e.target.value)}
              className="text-sm border rounded px-2 py-2 bg-background"
            >
              <option value="">Todos los salones</option>
              {salonesUnicos.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="relative col-span-2 md:col-span-3 lg:col-span-2">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                data-guia="orientacion.remisiones_buscador"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre..."
                className="w-full border rounded pl-8 pr-3 py-2 text-sm bg-background"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-muted-foreground text-sm">Cargando...</div>
          ) : remisionesFiltradas.length === 0 ? (
            <div className="text-muted-foreground text-sm">No hay remisiones.</div>
          ) : (
            <div className="space-y-3" data-guia="orientacion.remision_item">
              {remisionesFiltradas.map(r => {
                const isOpen = expandedIds.has(r.id);
                const isNueva = gestiona && r.id > lastSeen && !r.recibido_por_id;
                const grupo = r.estudiante_salon
                  ? `${r.estudiante_grado} ${r.estudiante_salon}`
                  : r.estudiante_grado;
                return (
                  <div key={r.id} className="border border-border rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(r.id)}
                      className="w-full flex items-start justify-between gap-3 px-4 py-3 bg-card hover:bg-muted/30 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">
                            {r.estudiante_nombre} {r.estudiante_apellidos}
                          </span>
                          <span className="text-xs text-muted-foreground">{grupo}</span>
                          {isNueva && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-red-500 text-white font-semibold">
                              Nueva
                            </span>
                          )}
                          {r.atendida_at ? (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                              Atendida
                            </span>
                          ) : r.recibido_por_id ? (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                              Recibida
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700 font-semibold">
                              Pendiente
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {fmtFecha(r.fecha)} · Remitido por: {[r.docente_cargo, r.docente_nombre].filter(Boolean).join(" ")}
                        </div>
                        <div className="text-sm mt-1 line-clamp-2">{r.motivo}</div>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isOpen && (
                      <div className="px-4 py-4 border-t border-border space-y-3 bg-muted/10">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Motivo</div>
                          <div className="text-sm whitespace-pre-wrap">{r.motivo}</div>
                        </div>
                        {/* Contacto del estudiante y acudientes */}
                        <div className="rounded-md border border-border bg-background p-3">
                          <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Contacto</div>
                          {contactos[r.id] === undefined || contactos[r.id] === "loading" ? (
                            <p className="text-sm text-muted-foreground">Cargando…</p>
                          ) : (
                            <div className="text-sm space-y-0.5">
                              <p><span className="font-medium">Estudiante:</span> {(contactos[r.id] as any).estudiante_telefono || "No registrado"}</p>
                              {((contactos[r.id] as any).acudientes || []).length > 0 ? (
                                <div>
                                  <span className="font-medium">Acudientes:</span>
                                  <ul className="list-disc ml-5">
                                    {(contactos[r.id] as any).acudientes.map((a: any, i: number) => (
                                      <li key={i}>{a.nombre}{a.telefono ? ` — ${a.telefono}` : ""}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : <p className="text-muted-foreground">Sin acudientes registrados.</p>}
                            </div>
                          )}
                        </div>
                        {r.firma_url && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">Firma del docente</div>
                            <a href={r.firma_url} target="_blank" rel="noreferrer">
                              <img
                                src={r.firma_url}
                                alt="Firma"
                                className="max-h-32 border rounded bg-white"
                              />
                            </a>
                          </div>
                        )}
                        {r.recibido_por_id && (
                          <div className="text-xs text-muted-foreground">
                            Recibida por <strong>{r.recibido_por_nombre}</strong>
                            {r.fecha_recibido && ` el ${new Date(r.fecha_recibido).toLocaleString("es-CO")}`}
                          </div>
                        )}
                        {r.atendida_at && (
                          <div className="text-xs text-muted-foreground">
                            Atendida por <strong>{r.atendida_por_nombre}</strong> el {new Date(r.atendida_at).toLocaleString("es-CO")}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            data-guia="orientacion.remision_descargar_word"
                            onClick={() => descargarWord(r)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-input bg-background hover:bg-accent"
                          >
                            <Download className="w-3.5 h-3.5" /> Descargar Word
                          </button>
                          {gestiona && (
                          <button
                            type="button"
                            data-guia="orientacion.remision_agendar_cita"
                            onClick={() => navigate(`/orientador/citas?estudianteId=${r.estudiante_id}`)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-input bg-background hover:bg-accent"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" /> Agendar cita
                          </button>
                          )}
                          {gestiona && !r.atendida_at && (
                            <button
                              type="button"
                              data-guia="orientacion.remision_marcar_atendida"
                              disabled={marcando === r.id}
                              onClick={() => marcarAtendida(r)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {marcando === r.id ? "Marcando..." : "Marcar como atendida"}
                            </button>
                          )}
                          {gestiona && !r.recibido_por_id && (
                            <button
                              type="button"
                              data-guia="orientacion.remision_marcar_recibida"
                              disabled={marcando === r.id}
                              onClick={() => marcarRecibida(r)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {marcando === r.id ? "Marcando..." : "Marcar como recibida"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default RemisionesOrientacion;
