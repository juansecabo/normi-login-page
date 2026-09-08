import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSession, isOrientador, isAdmin, isRectorOrCoordinador, isProfesor } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, Download, Check, Search, CalendarPlus, Phone, Plus, Send, MessagesSquare, FolderOpen } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import iconCasos from "@/assets/icons/casos.png";
import { markLastSeen } from "@/utils/notificaciones";
import { apiClient, apiRequest } from "@/lib/apiClient";
import { formatTelefono } from "@/utils/telefono";
import { cargoSegunGenero } from "@/lib/entrevistadores";

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
type PngImg = { buf: ArrayBuffer; w: number; h: number };
const imgToPng = (url: string): Promise<PngImg | null> => new Promise((resolve) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 200; canvas.height = img.naturalHeight || 200;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => blob ? blob.arrayBuffer().then(buf => resolve({ buf, w: canvas.width, h: canvas.height })).catch(() => resolve(null)) : resolve(null), "image/png");
    } catch { resolve(null); }
  };
  img.onerror = () => resolve(null);
  img.src = url;
});
/** Ancho/alto en px para que una imagen quepa en una caja conservando su proporción. */
const encajar = (w: number, h: number, maxW: number, maxH: number) => {
  const k = Math.min(maxW / w, maxH / h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
};

const edadDesde = (fechaNac?: string | null): string => {
  if (!fechaNac) return "";
  const d = new Date(fechaNac); if (isNaN(d.getTime())) return "";
  const hoy = new Date();
  let e = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--;
  return e >= 0 && e < 120 ? String(e) : "";
};

type PasoDoc = { destino: string; motivo: string; especificacion_conducta: string | null; medidas_previas: string | null; firma_url: string | null; docente_nombre: string | null; docente_cargo: string | null; created_at: string };
type SeguimientoDoc = { autor_nombre: string | null; texto: string; created_at: string };
const DESTINO_DOC: Record<string, string> = { orientacion: "Orientación Escolar", director_grupo: "Dirección de grupo", coordinador: "Coordinación" };

const destinosLegiblesDoc = (d: string[] | null) => (d || []).map(x => DESTINO_DOC[x] || x).join(", ") || "Orientación Escolar";

/** Área a la que pertenece un cargo, para titular las notas de seguimiento del Word. */
const areaDeCargo = (cargo: string): string => {
  const c = (cargo || "").toLowerCase();
  if (c.includes("coordinador")) return "Coordinación";
  if (c.includes("orientador")) return "Orientación Escolar";
  if (c.includes("profesor") || c.includes("docente")) return "Dirección de grupo";
  if (c.includes("rector")) return "Rectoría";
  return cargo || "Seguimiento";
};

/** "Cargo (Nombre Apellido)" → { cargo, nombre }. Si no trae paréntesis, todo es nombre. */
const separarCargoNombre = (s: string | null): { cargo: string; nombre: string } => {
  const m = (s || "").match(/^(.+?)\s*\((.+)\)\s*$/);
  return m ? { cargo: m[1].trim(), nombre: m[2].trim() } : { cargo: "", nombre: (s || "").trim() };
};

const descargarWord = async (r: Remision, pasos: PasoDoc[] = [], notas: SeguimientoDoc[] = []) => {
  try {
    const { default: PizZip } = await import("pizzip");
    const { default: Docxtemplater } = await import("docxtemplater");

    const templateBuf = await loadBinary("/remision_template.docx");

    // Datos del colegio (membrete) + escudo, identidad y contacto del estudiante.
    let colegioNombre = "", dane = "", nit = "", ciudad = "", logoUrl: string | null = null;
    try {
      const cc = await apiRequest<{ nombre: string; logo_url: string | null; config: any }>("/api/colegio/config");
      colegioNombre = cc.nombre || "";
      logoUrl = cc.logo_url || null;
      dane = cc.config?.dane || ""; nit = cc.config?.nit || ""; ciudad = cc.config?.ciudad || "";
    } catch (e) { console.warn("config colegio:", e); }

    // Todos los acudientes, cada uno con su teléfono; el teléfono del estudiante va aparte.
    let telEst = "", acuStr = "";
    try {
      const c = await apiClient.orientacion.contactoEstudiante(r.estudiante_id);
      telEst = formatTelefono(c.estudiante_telefono) || "";
      if (c.acudientes.length > 0) acuStr = c.acudientes.map(a => `${a.nombre}${a.telefono ? ` · ${formatTelefono(a.telefono)}` : ""}`).join("\n");
    } catch (e) { console.warn("Contacto:", e); }

    // Quien atendió: "Cargo (Nombre)" en las nuevas; en las viejas solo venía el nombre,
    // así que el cargo se busca en Internos (con género desde Usuarios).
    const atendio = separarCargoNombre(r.atendida_por_nombre || r.recibido_por_nombre);
    const atendioId = r.atendida_por_id || r.recibido_por_id;
    if (!atendio.cargo && atendioId) {
      try {
        const [{ data: intn }, { data: usr }] = await Promise.all([
          supabase.from("Internos").select("cargo").eq("id", atendioId).maybeSingle(),
          supabase.from("Usuarios").select("genero").eq("id", atendioId).maybeSingle(),
        ]);
        atendio.cargo = cargoSegunGenero((intn as any)?.cargo || "", (usr as any)?.genero || null);
      } catch { /* sin cargo */ }
    }

    let fechaNac = "";
    try {
      const { data } = await supabase.from("Usuarios").select("fecha_de_nacimiento").eq("id", String(r.estudiante_id)).maybeSingle();
      fechaNac = (data as any)?.fecha_de_nacimiento || "";
    } catch { /* ignore */ }

    // El Word muestra la remisión en su momento ACTUAL (Juan 2026-09-07), igual que la
    // plataforma: lo principal es el último paso (o la original si no hay pasos); la original
    // y los pasos anteriores quedan en el Recorrido como etapas ya cerradas.
    const pasosAsc = [...pasos].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const ultimo = pasosAsc.length ? pasosAsc[pasosAsc.length - 1] : null;
    const vig = ultimo
      ? { destinos: [ultimo.destino], motivo: ultimo.motivo, especificacion: ultimo.especificacion_conducta, medidas: ultimo.medidas_previas, firma_url: ultimo.firma_url,
          quien: [ultimo.docente_cargo, ultimo.docente_nombre].filter(Boolean).join(" "), fecha: ultimo.created_at.slice(0, 10) }
      : { destinos: r.destinos || [], motivo: r.motivo, especificacion: r.especificacion_conducta, medidas: r.medidas_previas, firma_url: r.firma_url,
          quien: [r.docente_cargo, r.docente_nombre].filter(Boolean).join(" "), fecha: r.fecha };
    const [firmaImg, escudoImg, firmaOrigImg, ...firmasPasosImg] = await Promise.all([
      vig.firma_url ? imgToPng(vig.firma_url) : Promise.resolve(null),
      logoUrl ? imgToPng(logoUrl) : Promise.resolve(null),
      r.firma_url ? imgToPng(r.firma_url) : Promise.resolve(null),
      ...pasosAsc.map(p => (p.firma_url ? imgToPng(p.firma_url) : Promise.resolve(null))),
    ]);

    const zip = new PizZip(templateBuf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true, linebreaks: true,
      delimiters: { start: "{", end: "}" }, nullGetter: () => "",
    });

    const grupo = r.estudiante_salon ? `${r.estudiante_grado} ${r.estudiante_salon}` : r.estudiante_grado;
    const destinos = vig.destinos;
    // Tipo de documento: el guardado; si la remisión es vieja y no lo trae, se infiere por edad.
    const edadNum = parseInt(edadDesde(fechaNac), 10);
    const td = (r.tipo_documento || (isNaN(edadNum) ? "" : edadNum < 7 ? "RC" : edadNum < 18 ? "TI" : "CC")).toUpperCase();
    const fechaAtendida = r.atendida_at || r.fecha_recibido;
    const recibidoFecha = fechaAtendida ? new Date(fechaAtendida).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" }) : "";
    const fmtLargo = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" });
    // Cada nota de seguimiento pertenece a la etapa en que se escribió: a la remisión original
    // (antes de cualquier paso) o al último paso anterior a la nota. Las de la original van en
    // un bloque aparte bajo la firma; las demás debajo de su paso en el Recorrido (sección 6).
    // Todo de lo más nuevo (arriba) a lo más antiguo (abajo).
    const masNuevaPrimero = (a: { t: string }, b: { t: string }) => b.t.localeCompare(a.t);
    const notaDoc = (n: SeguimientoDoc) => {
      const a = separarCargoNombre(n.autor_nombre); // "Cargo (Nombre)" → "Cargo Nombre"
      return { t: n.created_at, TITULO: areaDeCargo(a.cargo), META: `${[a.cargo, a.nombre].filter(Boolean).join(" ")}  ·  ${fmtLargo(n.created_at)}`, TEXTO: n.texto };
    };
    const etapaDe = (n: SeguimientoDoc) => { let k = -1; pasosAsc.forEach((p, i) => { if (p.created_at <= n.created_at) k = i; }); return k; };
    // Las notas van de la más antigua a la más nueva (Juan 2026-09-07); las remisiones al revés.
    const masAntiguaPrimero = (a: { t: string }, b: { t: string }) => a.t.localeCompare(b.t);
    // Notas de la etapa vigente: bloque "Seguimiento" bajo la firma principal.
    const etapaVigente = pasosAsc.length - 1; // -1 = la original, si no hay pasos
    const notas0 = notas.filter(n => etapaDe(n) === etapaVigente).map(notaDoc).sort(masAntiguaPrimero);
    // Recorrido: los pasos anteriores al vigente y, como etapa más antigua, la remisión original.
    const quienOrig = [r.docente_cargo, r.docente_nombre].filter(Boolean).join(" ");
    const etapaOriginal = { t: r.created_at || r.fecha, TITULO: `En ${destinosLegiblesDoc(r.destinos)}`, META: `Creada por ${quienOrig}  ·  ${fmtLargo(r.created_at || r.fecha)}`,
      MOTIVO: r.motivo || "", ESPECIFICACION: r.especificacion_conducta || "", MEDIDAS: r.medidas_previas || "", FIRMA_TAG: r.firma_url ? "__FIRMA_ORIG__" : "", QUIEN: quienOrig,
      HAY_NOTAS: false, NOTAS: [] as ReturnType<typeof notaDoc>[] };
    etapaOriginal.NOTAS = notas.filter(n => etapaDe(n) === -1).map(notaDoc).sort(masAntiguaPrimero); etapaOriginal.HAY_NOTAS = etapaOriginal.NOTAS.length > 0;
    const pasosDoc = [
      ...pasosAsc.slice(0, -1).map((p, i) => {
        const tag = `__FIRMA_PASO_${i}__`;
        const quien = [p.docente_cargo, p.docente_nombre].filter(Boolean).join(" ");
        const NOTAS = notas.filter(n => etapaDe(n) === i).map(notaDoc).sort(masAntiguaPrimero);
        return { t: p.created_at, TITULO: `En ${DESTINO_DOC[p.destino] || p.destino}`, META: `Remitida por ${quien}  ·  ${fmtLargo(p.created_at)}`,
          MOTIVO: p.motivo || "", ESPECIFICACION: p.especificacion_conducta || "", MEDIDAS: p.medidas_previas || "", FIRMA_TAG: p.firma_url ? tag : "", QUIEN: quien,
          HAY_NOTAS: NOTAS.length > 0, NOTAS };
      }),
      ...(ultimo ? [etapaOriginal] : []),
    ].sort(masNuevaPrimero);
    const parrafos = (s: string | null) => (s || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
    const CB = (on: boolean) => (on ? "☒" : "☐");
    const marcado = { DG: destinos.includes("director_grupo"), COORD: destinos.includes("coordinador"), ORIENT: destinos.includes("orientacion") };
    const sublinea = [dane ? `Código DANE ${dane}` : "", nit ? `NIT ${nit}` : "", ciudad].filter(Boolean).join("  ·  ");

    doc.render({
      COLEGIO_MAYUS: colegioNombre.toUpperCase(), SUBLINEA: sublinea,
      PIE_IZQ: [colegioNombre, ciudad].filter(Boolean).join("  ·  "),
      NOMBRE_ESTUDIANTE: `${r.estudiante_nombre} ${r.estudiante_apellidos}`,
      GRADO: grupo,
      DOCUMENTO: String(r.estudiante_id),
      CB_RC: CB(td === "RC"), CB_TI: CB(td === "TI"), CB_CC: CB(td === "CC"),
      FECHA_NAC: fechaNac ? fmtFecha(fechaNac) : "", EDAD: edadDesde(fechaNac),
      ACUDIENTE: acuStr, TELEFONO: telEst, FECHA: fmtFecha(vig.fecha),
      REMITIDO_POR: vig.quien, DIRIGIDA_A: destinosLegiblesDoc(vig.destinos),
      RECORRIDO_LINEA: [destinosLegiblesDoc(r.destinos), ...pasosAsc.map(p => DESTINO_DOC[p.destino] || p.destino)].join(' → '),
      CB_DG: CB(marcado.DG), CB_COORD: CB(marcado.COORD), CB_ORIENT: CB(marcado.ORIENT),
      HAY_NOTAS0: notas0.length > 0, NOTAS0: notas0, HAY_PASOS: pasosDoc.length > 0, PASOS: pasosDoc,
      MOTIVO_P: parrafos(vig.motivo),
      ESPECIFICACION_P: parrafos(vig.especificacion),
      MEDIDAS_P: parrafos(vig.medidas),
      DOCENTE: vig.quien,
      ESTADO: r.atendida_at ? "Atendida" : "Pendiente",
      RECIBIDO_POR: r.atendida_at ? atendio.nombre : "",
      RECIBIDO_CARGO: r.atendida_at ? atendio.cargo : "",
      RECIBIDO_FECHA: r.atendida_at ? recibidoFecha : "",
    });

    const renderedZip = doc.getZip();
    let docXml = renderedZip.file("word/document.xml")?.asText() || "";

    // Condicionales de estilo que docxtemplater no puede resolver: la plantilla trae
    // colores "testigo" que aquí se cambian por el color real (casilla marcada en verde
    // con fondo suave, estado verde si Atendida o ámbar si Pendiente).
    const testigos: Array<[string, string]> = [
      ['w:fill="FFFFF1"', `w:fill="${marcado.DG ? "F2F8F4" : "FFFFFF"}"`],
      ['w:fill="FFFFF2"', `w:fill="${marcado.COORD ? "F2F8F4" : "FFFFFF"}"`],
      ['w:fill="FFFFF3"', `w:fill="${marcado.ORIENT ? "F2F8F4" : "FFFFFF"}"`],
      ['w:val="0F6B31"', `w:val="${marcado.DG ? "0F6B3F" : "6D7A72"}"`],
      ['w:val="0F6B32"', `w:val="${marcado.COORD ? "0F6B3F" : "6D7A72"}"`],
      ['w:val="0F6B33"', `w:val="${marcado.ORIENT ? "0F6B3F" : "6D7A72"}"`],
      ['w:val="0F6B34"', `w:val="${r.atendida_at ? "0F6B3F" : "B45309"}"`],
    ];
    for (const [a, b] of testigos) docXml = docXml.split(a).join(b);

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
      // Solo el run del marcador: el <w:rPr> opcional no puede cruzar a otros runs
      // (un [\s\S]*? aquí se tragaba desde el membrete hasta la firma).
      const re = new RegExp(`<w:r(?:\\s[^>]*)?>(?:\\s*<w:rPr>(?:(?!</w:rPr>)[\\s\\S])*</w:rPr>)?\\s*<w:t[^>]*>${placeholder}</w:t>\\s*</w:r>`);
      if (!re.test(docXml)) console.warn("Word: no se encontró el marcador", placeholder);
      docXml = docXml.replace(re, `<w:r>${drawing}</w:r>`);
    };

    if (escudoImg) { const d = encajar(escudoImg.w, escudoImg.h, 90, 58); inyectar(escudoImg.buf, "__ESCUDO_PLACEHOLDER__", "escudo_remision.png", d.w, d.h, 101, "Escudo"); }
    else docXml = docXml.replace("__ESCUDO_PLACEHOLDER__", "");
    if (firmaImg) { const d = encajar(firmaImg.w, firmaImg.h, 200, 60); inyectar(firmaImg.buf, "__FIRMA_PLACEHOLDER__", "firma_remision.png", d.w, d.h, 100, "Firma"); }
    else docXml = docXml.replace("__FIRMA_PLACEHOLDER__", "");
    pasosAsc.slice(0, -1).forEach((p, i) => {
      const tag = `__FIRMA_PASO_${i}__`; const img = firmasPasosImg[i];
      if (p.firma_url && img) { const d = encajar(img.w, img.h, 160, 48); inyectar(img.buf, tag, `firma_paso_${i}.png`, d.w, d.h, 200 + i, `Firma paso ${i + 1}`); }
      else docXml = docXml.split(tag).join("");
    });
    if (ultimo && r.firma_url && firmaOrigImg) { const d = encajar(firmaOrigImg.w, firmaOrigImg.h, 160, 48); inyectar(firmaOrigImg.buf, "__FIRMA_ORIG__", "firma_original.png", d.w, d.h, 199, "Firma original"); }
    else docXml = docXml.split("__FIRMA_ORIG__").join("");

    renderedZip.file("word/document.xml", docXml);

    const out = renderedZip.generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(out);
    a.download = `Remision_${sanitizeFilename(r.estudiante_apellidos + "_" + r.estudiante_nombre)}_${r.fecha}.docx`;
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
  const [miDirGrupo, setMiDirGrupo] = useState<{ grado: string; salon: string | null } | null>(null);
  // Remisiones que este usuario ya ABRIÓ (tabla Remisiones_Vistas). Sirve para la
  // sección "Remitidas a ti sin revisar": dirigidas a mí y nunca abiertas.
  const [vistasPorMi, setVistasPorMi] = useState<Set<number>>(new Set());
  // Ids "dirigidas a mí y sin abrir" según el server (aplica la regla de bandeja
  // compartida en Orientación). Se recalcula al abrir una remisión.
  const [idsSinRevisar, setIdsSinRevisar] = useState<Set<number> | null>(null);
  // Pasos de cada remisión (a quién se remitió después, con qué escrito). Una
  // remisión es UN expediente: su destino actual es el del último paso.
  type Paso = { id: number; remision_id: number; orden: number; destino: string; motivo: string; especificacion_conducta: string | null; medidas_previas: string | null; firma_url: string | null; docente_id: string; docente_nombre: string | null; docente_cargo: string | null; created_at: string };
  const [pasosPorRem, setPasosPorRem] = useState<Record<number, Paso[]>>({});
  // Seguimiento y remisión encadenada (detalle)
  type Seguimiento = { id: number; remision_id: number; autor_id: string; autor_nombre: string | null; texto: string; created_at: string };
  const [seguimientos, setSeguimientos] = useState<Record<number, Seguimiento[]>>({});
  const [nuevoSeg, setNuevoSeg] = useState("");
  const [guardandoSeg, setGuardandoSeg] = useState(false);
  const [confirmPendiente, setConfirmPendiente] = useState(false);

  // Filtros
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"" | "pendiente" | "atendida">("");
  const [filtroDocente, setFiltroDocente] = useState("");
  // "" = todas · "ami" = remitidas a mí · "pormi" = remitidas por mí
  const [filtroQuien, setFiltroQuien] = useState<"" | "ami" | "pormi">("");
  const [busqueda, setBusqueda] = useState("");

  // Navegación en tres niveles (como Registros de Comportamiento):
  //   1) estudiantes con remisiones  2) remisiones de un estudiante  3) detalle.
  // El nivel va en la URL (?est=ID&rem=ID) para que Atrás del navegador baje un
  // nivel en vez de saltar al tablero.
  const [searchParams, setSearchParams] = useSearchParams();
  const estVistaId = searchParams.get("est") ? Number(searchParams.get("est")) : null;
  const remVistaId = searchParams.get("rem") ? Number(searchParams.get("rem")) : null;
  const setEstVistaId = (id: number | null) => setSearchParams(id == null ? {} : { est: String(id) });
  const setRemVistaId = (id: number | null) => {
    const p = new URLSearchParams(searchParams);
    if (id == null) p.delete("rem"); else p.set("rem", String(id));
    setSearchParams(p);
  };
  // Abrir directo una remisión (atajo): estudiante y remisión en un solo cambio de URL.
  const abrirDirecto = (estId: number, remId: number) => setSearchParams({ est: String(estId), rem: String(remId) });
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
      const veTodas = isOrientador() || isAdmin() || session.cargo === "Rector";
      const esCoordinador = !veTodas && session.cargo === "Coordinador(a)";
      const esProfesor = !veTodas && !esCoordinador && isProfesor();
      const miId = String(session.id);

      // Dirección de grupo y niveles que coordina (para acotar el alcance).
      let dirGrupo: { grado: string; salon: string | null } | null = null;
      let nivelesCoord: string[] | null = null;
      if (esProfesor || esCoordinador) {
        const { data: yo } = await supabase.from("Internos")
          .select("direccion_de_grupo, niveles_coordina")
          .eq("id", parseInt(miId)).maybeSingle();
        const dg = String((yo as any)?.direccion_de_grupo || "").trim();
        if (dg) {
          const partes = dg.split(" ");
          dirGrupo = partes.length > 1 ? { grado: partes.slice(0, -1).join(" "), salon: partes[partes.length - 1] } : { grado: dg, salon: null };
        }
        setMiDirGrupo(dirGrupo);
        nivelesCoord = ((yo as any)?.niveles_coordina as string[] | null) || null;
      }

      // Pasos de todas las remisiones del colegio (RLS acota al colegio).
      const { data: pasosData } = await supabase.from("Remisiones_Pasos").select("*").order("orden", { ascending: true });
      const agrup: Record<number, Paso[]> = {};
      for (const p of (pasosData || []) as Paso[]) (agrup[p.remision_id] ||= []).push(p);
      setPasosPorRem(agrup);
      // Remisiones en las que yo di algún paso (las remití después): cuentan como mías.
      const idsConMiPaso = ((pasosData || []) as Paso[]).filter(p => String(p.docente_id) === miId).map(p => p.remision_id);

      let q = supabase.from("Remisiones_Orientacion").select("*").order("created_at", { ascending: false });
      if (esProfesor) {
        const mias = [`docente_id.eq.${miId}`, ...(idsConMiPaso.length ? [`id.in.(${idsConMiPaso.join(",")})`] : [])];
        if (dirGrupo) {
          const cond = dirGrupo.salon
            ? `and(estudiante_grado.eq."${dirGrupo.grado}",estudiante_salon.eq."${dirGrupo.salon}")`
            : `estudiante_grado.eq."${dirGrupo.grado}"`;
          q = q.or(`${mias.join(",")},${cond}`);
        } else {
          q = q.or(mias.join(","));
        }
      }
      // OJO al orden: 2º = Remisiones_Vistas (mis aperturas), 3º = Notificaciones_Vistas (badge).
      apiClient.orientacion.remisionesSinRevisar().then(r => setIdsSinRevisar(new Set(r.ids))).catch(() => setIdsSinRevisar(new Set()));
      const [remR, misVistasR, vistaR] = await Promise.all([
        q,
        supabase.from("Remisiones_Vistas").select("remision_id").eq("usuario_id", miId),
        supabase.from("Notificaciones_Vistas")
          .select("ultimo_id_visto")
          .eq("usuario_id", session.id!)
          .eq("seccion", "remisiones")
          .maybeSingle(),
      ]);

      setVistasPorMi(prev => {
        const next = new Set(prev);
        for (const v of (misVistasR.data || []) as { remision_id: number }[]) next.add(v.remision_id);
        return next;
      });
      let lista = (remR.data || []) as Remision[];
      // Coordinador: las suyas + las de estudiantes de sus niveles (nivel real del
      // estudiante en Estudiantes; niveles_coordina vacío = todos los niveles).
      if (esCoordinador && nivelesCoord && nivelesCoord.length > 0) {
        const ids = [...new Set(lista.map(r => r.estudiante_id).filter(Boolean))];
        const nivelPorEst = new Map<string, string>();
        if (ids.length > 0) {
          const { data: ests } = await supabase.from("Estudiantes").select("id, nivel").in("id", ids);
          (ests || []).forEach((e: any) => nivelPorEst.set(String(e.id), String(e.nivel || "")));
        }
        lista = lista.filter(r => String(r.docente_id) === miId || nivelesCoord!.includes(nivelPorEst.get(String(r.estudiante_id)) || ""));
      }
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

  // ¿Esta remisión va DIRIGIDA a mí? (según destinos y mi cargo/dirección de grupo)
  const miIdSesion = String(getSession().id || "");
  const destinoActual = (r: Remision): string[] => {
    const ps = pasosPorRem[r.id];
    return ps && ps.length > 0 ? [ps[ps.length - 1].destino] : (r.destinos || []);
  };
  const remitidaPorMi = (r: Remision): boolean =>
    String(r.docente_id) === miIdSesion || (pasosPorRem[r.id] || []).some(p => String(p.docente_id) === miIdSesion);
  const dirigidaAMi = (r: Remision): boolean => {
    const destinos = destinoActual(r);
    const cargo = getSession().cargo || "";
    if (isOrientador()) return destinos.length === 0 || destinos.includes("orientacion");
    if (cargo === "Coordinador(a)") return destinos.includes("coordinador");
    if (destinos.includes("director_grupo") && miDirGrupo) {
      const conSalon = r.estudiante_salon ? `${r.estudiante_grado} ${r.estudiante_salon}` : "";
      const mio = miDirGrupo.salon ? `${miDirGrupo.grado} ${miDirGrupo.salon}` : miDirGrupo.grado;
      return mio === conSalon || mio === r.estudiante_grado;
    }
    return false;
  };
  // Recibida/Atendida las marca la persona a la que va dirigida (regla de Juan
  // 2026-09-04); el admin siempre. El server aplica la misma regla.
  const puedeMarcar = (r: Remision): boolean => isAdmin() || dirigidaAMi(r);

  const estadoDe = (r: Remision): "pendiente" | "atendida" => (r.atendida_at ? "atendida" : "pendiente");

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
      if (filtroQuien === "pormi" && !remitidaPorMi(r)) return false;
      if (filtroQuien === "ami" && !dirigidaAMi(r)) return false;
      if (q) {
        const full = norm(`${r.estudiante_nombre} ${r.estudiante_apellidos} ${r.docente_nombre} ${r.motivo || ""}`);
        const tokens = q.split(/\s+/).filter(Boolean);
        if (!tokens.every(t => full.includes(t))) return false;
      }
      return true;
    });
  }, [remisiones, busqueda, filtroGrado, filtroSalon, filtroEstado, filtroDocente, filtroQuien, miDirGrupo, pasosPorRem]);

  // Contacto del estudiante (teléfono + acudientes), cargado al expandir.
  const [contactos, setContactos] = useState<Record<number, { estudiante_telefono: string; acudientes: { nombre: string; telefono: string }[] } | "loading">>({});

  const cargarContacto = (rem: Remision) => {
    if (contactos[rem.id] !== undefined) return;
    setContactos(prev => ({ ...prev, [rem.id]: "loading" }));
    apiClient.orientacion.contactoEstudiante(rem.estudiante_id)
      .then(c => setContactos(prev => ({ ...prev, [rem.id]: c })))
      .catch(() => setContactos(prev => ({ ...prev, [rem.id]: { estudiante_telefono: "", acudientes: [] } })));
  };
  const abrirRemision = (rem: Remision) => {
    setRemVistaId(rem.id);
    cargarContacto(rem);
  };
  useEffect(() => {
    if (remVistaId == null) return;
    const rem = remisiones.find(r => r.id === remVistaId);
    if (rem && !vistasPorMi.has(rem.id)) {
      const uid = String(getSession().id || "");
      setVistasPorMi(prev => new Set(prev).add(rem.id));
      setIdsSinRevisar(prev => { if (!prev) return prev; const n = new Set(prev); n.delete(rem.id); return n; });
      supabase.from("Remisiones_Vistas")
        .upsert({ remision_id: rem.id, usuario_id: uid, visto_at: new Date().toISOString() }, { onConflict: "remision_id,usuario_id" })
        .then(({ error }) => { if (error) console.warn("Remisiones_Vistas:", error.message); });
    }
    if (rem) cargarContacto(rem);
    if (seguimientos[remVistaId] === undefined) {
      supabase.from("Remisiones_Seguimientos").select("*").eq("remision_id", remVistaId).order("created_at", { ascending: true })
        .then(({ data }) => setSeguimientos(prev => ({ ...prev, [remVistaId]: (data || []) as Seguimiento[] })));
    }
    setNuevoSeg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remVistaId, remisiones]);

  // Volver a Pendiente (por si quien la marcó se equivocó).
  const volverPendiente = async (r: Remision) => {
    if (marcando != null) return;
    setMarcando(r.id);
    try {
      await apiClient.orientacion.remisionPendiente(r.id);
      setRemisiones(prev => prev.map(x => x.id === r.id ? { ...x, atendida_at: null, atendida_por_id: null, atendida_por_nombre: null } : x));
      setConfirmPendiente(false);
      toast({ title: "Pendiente", description: "La remisión volvió a Pendiente." });
    } catch (e: any) {
      toast({ title: "Error", description: "No se pudo cambiar el estado.", variant: "destructive" });
    } finally {
      setMarcando(null);
    }
  };

  // Agregar nota de seguimiento.
  const agregarSeguimiento = async (r: Remision) => {
    const texto = nuevoSeg.trim();
    if (!texto || guardandoSeg) return;
    setGuardandoSeg(true);
    try {
      const res = await apiClient.orientacion.remisionSeguimiento(r.id, texto);
      setSeguimientos(prev => ({ ...prev, [r.id]: [...(prev[r.id] || []), res.seguimiento] }));
      setNuevoSeg("");
    } catch (e: any) {
      toast({ title: "Error", description: "No se pudo guardar el seguimiento.", variant: "destructive" });
    } finally {
      setGuardandoSeg(false);
    }
  };

  // Agrupación por estudiante (nivel 1), a partir de las remisiones ya filtradas.
  const estudiantesAgrupados = useMemo(() => {
    const m = new Map<number, { estudiante_id: number; nombres: string; apellidos: string; grado: string; salon: string; total: number; pendientes: number; atendidas: number; ultima: string }>();
    for (const r of remisionesFiltradas) {
      const g = m.get(r.estudiante_id) || { estudiante_id: r.estudiante_id, nombres: r.estudiante_nombre, apellidos: r.estudiante_apellidos, grado: r.estudiante_grado, salon: r.estudiante_salon, total: 0, pendientes: 0, atendidas: 0, ultima: r.fecha };
      g.total++;
      if (estadoDe(r) === "pendiente") g.pendientes++; else g.atendidas++;
      if (r.fecha > g.ultima) { g.ultima = r.fecha; g.grado = r.estudiante_grado; g.salon = r.estudiante_salon; }
      m.set(r.estudiante_id, g);
    }
    // Orden alfabético por apellidos, luego nombres.
    return [...m.values()].sort((a, b) => `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`, "es"));
  }, [remisionesFiltradas]);

  const estVista = useMemo(() => {
    if (estVistaId == null) return null;
    const r = remisiones.find(x => x.estudiante_id === estVistaId);
    return r ? { estudiante_id: r.estudiante_id, nombres: r.estudiante_nombre, apellidos: r.estudiante_apellidos, grado: r.estudiante_grado, salon: r.estudiante_salon } : null;
  }, [remisiones, estVistaId]);
  const remsDelEst = useMemo(
    () => (estVistaId == null ? [] : remisionesFiltradas.filter(r => r.estudiante_id === estVistaId)),
    [remisionesFiltradas, estVistaId],
  );
  const docentesDelEst = useMemo(() => {
    if (estVistaId == null) return [] as [string, string][];
    const m = new Map<string, string>();
    for (const r of remisiones) if (r.estudiante_id === estVistaId && r.docente_id && !m.has(String(r.docente_id))) m.set(String(r.docente_id), [r.docente_cargo, r.docente_nombre].filter(Boolean).join(" "));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [remisiones, estVistaId]);
  // Destinos guardados como claves internas → nombre legible.
  const DESTINO_LABEL: Record<string, string> = { orientacion: "Orientación Escolar", director_grupo: "Director de grupo", coordinador: "Coordinación" };
  const destinosLegibles = (d: string[] | null) => (d || []).map(x => DESTINO_LABEL[x] || x).join(", ");
  const numeroPorRemision = useMemo(() => {
    const m = new Map<number, number>();
    const porEst = new Map<number, Remision[]>();
    for (const r of remisiones) { const arr = porEst.get(r.estudiante_id) || []; arr.push(r); porEst.set(r.estudiante_id, arr); }
    porEst.forEach(arr => {
      arr.sort((a, b) => (a.created_at || a.fecha).localeCompare(b.created_at || b.fecha) || a.id - b.id);
      arr.forEach((r, i) => m.set(r.id, i + 1));
    });
    return m;
  }, [remisiones]);
  const ultimoPasoDe = (r: Remision): Paso | null => { const ps = pasosPorRem[r.id]; return ps && ps.length > 0 ? ps[ps.length - 1] : null; };
  const llegadaDe = (r: Remision): string => ultimoPasoDe(r)?.created_at || r.created_at || r.fecha;
  const fechaHoraLocal = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const remitenteActualDe = (r: Remision): string => {
    const p = ultimoPasoDe(r);
    return p ? [p.docente_cargo, p.docente_nombre].filter(Boolean).join(" ") : [r.docente_cargo, r.docente_nombre].filter(Boolean).join(" ");
  };
  const recorridoDe = (r: Remision): string[] => {
    const ps = pasosPorRem[r.id] || [];
    return [destinosLegibles(r.destinos) || "Orientación Escolar", ...ps.map(p => destinosLegibles([p.destino]))];
  };
  const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  const sinRevisar = useMemo(
    () => remisiones
      .filter(r => idsSinRevisar ? idsSinRevisar.has(r.id) : (dirigidaAMi(r) && !vistasPorMi.has(r.id)))
      .sort((a, b) => new Date(llegadaDe(b)).getTime() - new Date(llegadaDe(a)).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remisiones, vistasPorMi, miDirGrupo, idsSinRevisar, pasosPorRem],
  );
  const sinRevisarIds = useMemo(() => new Set(sinRevisar.map(r => r.id)), [sinRevisar]);
  const remVista = remVistaId != null ? remisiones.find(r => r.id === remVistaId) || null : null;
  // Lo que se muestra como principal es el escrito dirigido al destinatario ACTUAL
  // (último paso); si no hay pasos, el de la remisión original.
  const vigente = remVista ? (() => {
    const p = ultimoPasoDe(remVista);
    return p
      ? { motivo: p.motivo, especificacion: p.especificacion_conducta, medidas: p.medidas_previas, firma: p.firma_url, remitente: [p.docente_cargo, p.docente_nombre].filter(Boolean).join(" "), fecha: p.created_at, esPaso: true }
      : { motivo: remVista.motivo, especificacion: remVista.especificacion_conducta, medidas: remVista.medidas_previas, firma: remVista.firma_url, remitente: [remVista.docente_cargo, remVista.docente_nombre].filter(Boolean).join(" "), fecha: remVista.created_at || remVista.fecha, esPaso: false };
  })() : null;
  const remsPorEstudianteNuevas = useMemo(() => {
    const set = new Set<number>();
    for (const r of remisiones) if (r.id > lastSeen && !r.atendida_at) set.add(r.estudiante_id);
    return set;
  }, [remisiones, lastSeen]);
  const grupoDe = (r: { estudiante_grado: string; estudiante_salon: string }) =>
    r.estudiante_salon ? `${r.estudiante_grado} ${r.estudiante_salon}` : r.estudiante_grado;
  // Colores de estado: Todas azul (neutro), Pendientes ámbar, Atendidas verde.
  const COLOR_ACTIVO: Record<"" | "pendiente" | "atendida", string> = {
    "": "bg-sky-600 text-white border-sky-600",
    pendiente: "bg-amber-500 text-white border-amber-500",
    atendida: "bg-emerald-600 text-white border-emerald-600",
  };
  const chip = (activo: boolean, colorActivo = "bg-primary text-primary-foreground border-primary") =>
    `px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${activo ? colorActivo : "bg-background text-foreground border-input hover:bg-accent"}`;
  const botonesEstado = (
    <div className="flex flex-wrap gap-2" data-guia="orientacion.remisiones_filtro_estado">
      {([["", "Todas"], ["pendiente", "Pendientes"], ["atendida", "Atendidas"]] as const).map(([v, t]) => (
        <button key={v || "todas"} type="button" onClick={() => setFiltroEstado(v)} className={chip(filtroEstado === v, COLOR_ACTIVO[v])}>{t}</button>
      ))}
    </div>
  );
  const badgeEstado = (r: Remision) => {
    const e = estadoDe(r);
    const cls = e === "atendida" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";
    const txt = e === "atendida" ? "Atendida" : "Pendiente";
    return <span className={`px-2 py-0.5 text-[10px] rounded-full font-semibold ${cls}`}>{txt}</span>;
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

  // Orientación y admin: bandeja propia (etiqueta "Nueva", agendar cita).
  const gestiona = isOrientador() || isAdmin();

  // Avance de la etapa actual (Remisiones_Avances): especificación y medidas que quien la
  // lleva va escribiendo; al remitir a otra persona se autocompletan en el formulario.
  type Avance = { especificacion: string; medidas: string; autor_nombre: string | null; updated_at: string | null };
  const [avance, setAvance] = useState<Avance | null | undefined>(undefined);
  const [avanceEdit, setAvanceEdit] = useState<{ especificacion: string; medidas: string }>({ especificacion: "", medidas: "" });
  const [guardandoAvance, setGuardandoAvance] = useState(false);
  useEffect(() => {
    if (!remVistaId) { setAvance(undefined); return; }
    const etapa = (pasosPorRem[remVistaId] || []).length;
    setAvance(undefined);
    supabase.from("Remisiones_Avances").select("especificacion, medidas, autor_nombre, updated_at").eq("remision_id", remVistaId).eq("etapa", etapa).maybeSingle()
      .then(({ data }) => {
        const a = data ? { especificacion: (data as any).especificacion || "", medidas: (data as any).medidas || "", autor_nombre: (data as any).autor_nombre, updated_at: (data as any).updated_at } : null;
        setAvance(a); setAvanceEdit({ especificacion: a?.especificacion || "", medidas: a?.medidas || "" });
      });
  }, [remVistaId, pasosPorRem]);
  const guardarAvance = async (r: Remision) => {
    setGuardandoAvance(true);
    try {
      const res = await apiClient.orientacion.remisionAvance(r.id, avanceEdit.especificacion.trim(), avanceEdit.medidas.trim());
      setAvance({ especificacion: res.avance.especificacion || "", medidas: res.avance.medidas || "", autor_nombre: res.avance.autor_nombre, updated_at: res.avance.updated_at });
      toast({ title: "Avance guardado", description: "Cuando remitas a otra persona, estos campos ya vendrán llenos." });
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.message || "", variant: "destructive" });
    } finally { setGuardandoAvance(false); }
  };

  // Caso de seguimiento abierto desde esta remisión (Casos_Orientacion.remision_id).
  const [casoDeRem, setCasoDeRem] = useState<number | null | undefined>(undefined);
  const [abriendoCaso, setAbriendoCaso] = useState(false);
  useEffect(() => {
    if (!remVistaId || !gestiona) { setCasoDeRem(undefined); return; }
    setCasoDeRem(undefined);
    supabase.from("Casos_Orientacion").select("id").eq("remision_id", remVistaId).limit(1)
      .then(({ data }) => setCasoDeRem((data as any[])?.[0]?.id ?? null));
  }, [remVistaId, gestiona]);

  /** Abre un caso de seguimiento en Orientación a partir de la remisión (Juan 2026-09-07):
   *  toma el estudiante y el escrito vigente como motivo de atención, y queda enlazado por remision_id. */
  // Si el estudiante ya tiene un caso sin remisión enlazada, se ofrece enlazarlo en vez de crear otro.
  type CasoExistente = { id: number; estado: string; fecha_apertura: string; autor_nombre: string | null; motivo_atencion: string | null };
  const [casoExistente, setCasoExistente] = useState<{ rem: Remision; caso: CasoExistente } | null>(null);
  const abrirCasoDesdeRemision = async (r: Remision) => {
    if (abriendoCaso) return;
    setAbriendoCaso(true);
    const { data: previos } = await supabase.from("Casos_Orientacion")
      .select("id, estado, fecha_apertura, autor_nombre, motivo_atencion, remision_id")
      .eq("estudiante_id", r.estudiante_id).is("remision_id", null).order("created_at", { ascending: false }).limit(5);
    const lista = ((previos || []) as any[]) as (CasoExistente & { remision_id: number | null })[];
    const candidato = lista.find(c => c.estado === "abierto") || lista[0];
    setAbriendoCaso(false);
    if (candidato) { setCasoExistente({ rem: r, caso: candidato }); return; }
    await crearCasoDesdeRemision(r);
  };
  const enlazarCasoExistente = async () => {
    if (!casoExistente) return;
    const { rem, caso } = casoExistente;
    setAbriendoCaso(true);
    const { error } = await supabase.from("Casos_Orientacion").update({ remision_id: rem.id, updated_at: new Date().toISOString() } as any).eq("id", caso.id);
    setAbriendoCaso(false);
    if (error) { toast({ title: "No se pudo enlazar el caso", description: error.message, variant: "destructive" }); return; }
    setCasoExistente(null); setCasoDeRem(caso.id);
    navigate(`/orientador/casos/${caso.id}`);
  };
  const crearCasoDesdeRemision = async (r: Remision) => {
    setAbriendoCaso(true);
    const s = getSession();
    const p = ultimoPasoDe(r);
    const hoy = new Date();
    const payload = {
      estudiante_id: r.estudiante_id,
      estudiante_nombre: r.estudiante_nombre,
      estudiante_apellidos: r.estudiante_apellidos,
      estudiante_grado: r.estudiante_grado,
      estudiante_salon: r.estudiante_salon,
      motivo_atencion: p?.motivo || r.motivo,
      situacion_reportada: (p ? p.especificacion_conducta : r.especificacion_conducta) || null,
      estado: "abierto",
      fecha_apertura: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`,
      autor_id: s.id,
      autor_nombre: `${s.nombres || ""} ${s.apellidos || ""}`.trim(),
      remision_id: r.id,
    };
    const { data, error } = await supabase.from("Casos_Orientacion").insert(payload as any).select("id").maybeSingle();
    setAbriendoCaso(false);
    if (error || !(data as any)?.id) { toast({ title: "No se pudo abrir el caso", description: error?.message || "", variant: "destructive" }); return; }
    setCasoExistente(null);
    navigate(`/orientador/casos/${(data as any).id}`);
  };

  const backLink = isAdmin() ? "/dashboard" : "/dashboard";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable clave={`remisiones-${estVistaId ?? ""}-${remVistaId ?? ""}`}>
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            {estVista ? (
              <button onClick={() => setEstVistaId(null)} className="text-primary hover:underline">{gestiona ? "Remisiones a Orientación" : "Orientación Escolar"}</button>
            ) : (
              <span className="text-foreground font-medium">{gestiona ? "Remisiones a Orientación" : "Orientación Escolar"}</span>
            )}
            {estVista && (<>
              <span className="text-muted-foreground">&rarr;</span>
              {remVista ? (
                <button onClick={() => setRemVistaId(null)} className="text-primary hover:underline">{estVista.apellidos} {estVista.nombres}</button>
              ) : (
                <span className="text-foreground font-medium">{estVista.apellidos} {estVista.nombres}</span>
              )}
            </>)}
            {remVista && (<>
              <span className="text-muted-foreground">&rarr;</span>
              <span className="text-foreground font-medium">Remisión #{numeroPorRemision.get(remVista.id) ?? "?"}</span>
            </>)}
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          {estVistaId == null && (<>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
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
            <div className="relative col-span-2 order-last md:order-first">
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
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {botonesEstado}
            <span className="hidden sm:inline-block w-px h-5 bg-border mx-1" />
            <select
              data-guia="orientacion.remisiones_filtro_quien"
              value={filtroQuien}
              onChange={e => setFiltroQuien(e.target.value as any)}
              className="text-sm border rounded px-2 py-1.5 bg-background"
            >
              <option value="">Todas las remisiones</option>
              <option value="ami">Remitidas a mí</option>
              <option value="pormi">Remitidas por mí</option>
            </select>
          </div>

          </>)}

          {loading ? (
            <div className="text-muted-foreground text-sm">Cargando...</div>
          ) : remVista ? (
            /* ── Nivel 3: detalle de una remisión ── */
            <div className="space-y-4" data-guia="orientacion.remision_detalle">
              <div>
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2 flex-wrap">
                  {remVista.estudiante_apellidos} {remVista.estudiante_nombre}
                  <span className="text-sm text-muted-foreground font-normal">{grupoDe(remVista)}</span>
                  {puedeMarcar(remVista) && remVista.atendida_at ? (
                    <button type="button" data-guia="orientacion.remision_estado_toggle" title="Volver a Pendiente" onClick={() => setConfirmPendiente(true)} className="inline-flex items-center cursor-pointer hover:opacity-80">
                      {badgeEstado(remVista)}
                    </button>
                  ) : badgeEstado(remVista)}
                </h2>
                <div className="text-sm mt-3 space-y-1">
                  <p><span className="font-semibold text-foreground">Fecha:</span> <span className="text-muted-foreground">{fechaHoraLocal(vigente!.fecha)}</span></p>
                  <p><span className="font-semibold text-foreground">Remitido por:</span> <span className="font-bold text-red-600">{vigente!.remitente}</span></p>
                  <p><span className="font-semibold text-foreground">Dirigida a:</span> <span className="font-bold text-red-600">{destinosLegibles(destinoActual(remVista)) || "Orientación Escolar"}</span></p>
                  {remVista.atendida_at && (
                    <p><span className="font-semibold text-foreground">Atendida por:</span> <span className="text-muted-foreground">{remVista.atendida_por_nombre} · {fechaHoraLocal(remVista.atendida_at)}</span></p>
                  )}
                  {vigente!.esPaso && (<>
                    <p><span className="font-semibold text-foreground">Creada por:</span> <span className="text-muted-foreground">{[remVista.docente_cargo, remVista.docente_nombre].filter(Boolean).join(" ")} · {fechaHoraLocal(remVista.created_at || remVista.fecha)}</span></p>
                    <p><span className="font-semibold text-foreground">Recorrido:</span> <span className="text-muted-foreground">{recorridoDe(remVista).join(" → ")}</span></p>
                  </>)}
                </div>
              </div>
              <div className="pt-2">
                <div className="text-base font-semibold text-foreground mb-2">Motivo</div>
                <div className="text-base leading-relaxed whitespace-pre-wrap">{vigente!.motivo}</div>
              </div>
              {vigente!.especificacion && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Especificación de la conducta</div>
                  <div className="text-sm whitespace-pre-wrap">{vigente!.especificacion}</div>
                </div>
              )}
              {vigente!.medidas && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Medidas previas</div>
                  <div className="text-sm whitespace-pre-wrap">{vigente!.medidas}</div>
                </div>
              )}
              <div className="rounded-md border border-border bg-background p-3">
                <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Contacto</div>
                {contactos[remVista.id] === undefined || contactos[remVista.id] === "loading" ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : (
                  <div className="text-sm space-y-0.5">
                    <p><span className="font-medium">Estudiante:</span> {(contactos[remVista.id] as any).estudiante_telefono || "No registrado"}</p>
                    {((contactos[remVista.id] as any).acudientes || []).length > 0 ? (
                      <div>
                        <span className="font-medium">Acudientes:</span>
                        <ul className="list-disc ml-5">
                          {(contactos[remVista.id] as any).acudientes.map((a: any, i: number) => (
                            <li key={i}>{a.nombre}{a.telefono ? ` — ${a.telefono}` : ""}</li>
                          ))}
                        </ul>
                      </div>
                    ) : <p className="text-muted-foreground">Sin acudientes registrados.</p>}
                  </div>
                )}
              </div>
              {vigente!.firma && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Firma de quien remite</div>
                  <a href={vigente!.firma} target="_blank" rel="noreferrer">
                    <img src={vigente!.firma} alt="Firma" className="max-h-32 border rounded bg-white" />
                  </a>
                  <div className="text-sm font-semibold mt-1">{vigente!.remitente}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  data-guia="orientacion.remision_descargar_word"
                  onClick={() => descargarWord(remVista, pasosPorRem[remVista.id] || [], seguimientos[remVista.id] || [])}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-input bg-background hover:bg-accent"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar Word
                </button>
                {gestiona && (
                  casoDeRem ? (
                    <button
                      type="button"
                      data-guia="orientacion.remision_ver_caso"
                      onClick={() => navigate(`/orientador/casos/${casoDeRem}`)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> Ver caso de seguimiento
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-guia="orientacion.remision_abrir_caso"
                      disabled={abriendoCaso || casoDeRem === undefined}
                      onClick={() => abrirCasoDesdeRemision(remVista)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50"
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> {abriendoCaso ? "Abriendo..." : "Abrir caso de seguimiento"}
                    </button>
                  )
                )}
                {gestiona && (
                  <button
                    type="button"
                    data-guia="orientacion.remision_agendar_cita"
                    onClick={() => navigate(`/orientador/citas?estudianteId=${remVista.estudiante_id}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-input bg-background hover:bg-accent"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" /> Agendar cita
                  </button>
                )}
                {puedeMarcar(remVista) && !remVista.atendida_at && (
                  <button
                    type="button"
                    data-guia="orientacion.remision_marcar_atendida"
                    disabled={marcando === remVista.id}
                    onClick={() => marcarAtendida(remVista)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {marcando === remVista.id ? "Marcando..." : "Marcar como atendida"}
                  </button>
                )}
              </div>

              {/* ── Igual que el Word (Juan 2026-09-07): primero el Seguimiento de la etapa ACTUAL
                     (notas de quien la lleva hoy), después el Recorrido con las etapas anteriores,
                     de la más nueva a la más antigua, cada una con su escrito, su firma y sus notas. ── */}
              {(() => {
                const pasosAsc = [...(pasosPorRem[remVista.id] || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
                const notasTodas = seguimientos[remVista.id] || [];
                const etapaDe = (n: Seguimiento) => { let k = -1; pasosAsc.forEach((p, i) => { if (p.created_at <= n.created_at) k = i; }); return k; };
                const notasDe = (k: number) => notasTodas.filter(n => etapaDe(n) === k).sort((a, b) => a.created_at.localeCompare(b.created_at));
                const etapaActual = pasosAsc.length - 1;
                const fmt = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
                const Notas = ({ notas }: { notas: Seguimiento[] }) => (
                  <ol className="relative border-l-2 border-border ml-2 space-y-2">
                    {notas.map(n => (
                      <li key={`n${n.id}`} className="ml-4">
                        <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-emerald-500" />
                        <div className="rounded bg-muted/30 px-3 py-2 text-sm">
                          <div className="text-xs text-muted-foreground mb-0.5"><span className="font-semibold text-foreground">{n.autor_nombre || n.autor_id}</span> · {fmt(n.created_at)}</div>
                          <div className="whitespace-pre-wrap">{n.texto}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                );
                type Etapa = { key: string; destino: string; encabezado: string; fecha: string; motivo: string; especificacion: string | null; medidas: string | null; firma: string | null; quien: string; notas: Seguimiento[]; esOrigen: boolean };
                const etapas: Etapa[] = [
                  ...pasosAsc.slice(0, -1).map((p, i): Etapa => ({ key: `p${p.id}`, destino: destinosLegibles([p.destino]), encabezado: "Remitida por", fecha: p.created_at,
                    motivo: p.motivo, especificacion: p.especificacion_conducta, medidas: p.medidas_previas, firma: p.firma_url, quien: [p.docente_cargo, p.docente_nombre].filter(Boolean).join(" "), notas: notasDe(i), esOrigen: false })),
                  ...(pasosAsc.length > 0 ? [{ key: "origen", destino: destinosLegibles(remVista.destinos) || "Orientación Escolar", encabezado: "Creada por", fecha: remVista.created_at || remVista.fecha,
                    motivo: remVista.motivo, especificacion: remVista.especificacion_conducta, medidas: remVista.medidas_previas, firma: remVista.firma_url, quien: [remVista.docente_cargo, remVista.docente_nombre].filter(Boolean).join(" "), notas: notasDe(-1), esOrigen: true } as Etapa] : []),
                ].sort((a, b) => b.fecha.localeCompare(a.fecha));
                const notasActuales = notasDe(etapaActual);
                return (<>
                  {/* Avance de la etapa actual: lo llena quien la lleva; se autocompleta al remitir. */}
                  {(puedeMarcar(remVista) || (avance && (avance.especificacion || avance.medidas))) && (
                    <div className="rounded-md border border-border p-3 space-y-2" data-guia="orientacion.remision_avance">
                      <div className="text-sm font-semibold text-foreground">Avance de esta etapa</div>
                      {puedeMarcar(remVista) ? (<>
                        <p className="text-sm text-muted-foreground">Lo que escribas aquí se guarda y, si remites a otra persona, ya aparece llenado en el formulario: solo tendrás que escribir el motivo.</p>
                        <label className="block text-sm font-medium text-foreground">Especificación de la conducta o dificultad</label>
                        <textarea data-guia="orientacion.remision_avance_especificacion" value={avanceEdit.especificacion} onChange={e => setAvanceEdit(v => ({ ...v, especificacion: e.target.value }))} rows={3} maxLength={4000}
                          placeholder="Describa con detalle la conducta o dificultad observada..." className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" />
                        <label className="block text-sm font-medium text-foreground">Medidas pedagógicas aplicadas</label>
                        <textarea data-guia="orientacion.remision_avance_medidas" value={avanceEdit.medidas} onChange={e => setAvanceEdit(v => ({ ...v, medidas: e.target.value }))} rows={3} maxLength={4000}
                          placeholder="¿Qué acciones se han aplicado en esta etapa?" className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" />
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">{avance?.updated_at ? `Guardado ${fechaHoraLocal(avance.updated_at)}` : ""}</span>
                          <button type="button" data-guia="orientacion.remision_avance_guardar" disabled={guardandoAvance || avance === undefined || (avanceEdit.especificacion === (avance?.especificacion || "") && avanceEdit.medidas === (avance?.medidas || ""))}
                            onClick={() => guardarAvance(remVista)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                            {guardandoAvance ? "Guardando..." : "Guardar avance"}
                          </button>
                        </div>
                      </>) : (<>
                        {avance?.especificacion && <div className="text-sm"><span className="font-semibold text-red-600">Especificación de la conducta:</span> <span className="whitespace-pre-wrap">{avance.especificacion}</span></div>}
                        {avance?.medidas && <div className="text-sm"><span className="font-semibold text-red-600">Medidas pedagógicas aplicadas:</span> <span className="whitespace-pre-wrap">{avance.medidas}</span></div>}
                        {avance?.autor_nombre && <div className="text-xs text-muted-foreground">{avance.autor_nombre}{avance.updated_at ? ` · ${fechaHoraLocal(avance.updated_at)}` : ""}</div>}
                      </>)}
                    </div>
                  )}
                  <div className="rounded-md border border-border p-3 space-y-3" data-guia="orientacion.remision_seguimiento">
                    <div className="text-sm font-semibold text-foreground flex items-center gap-1"><MessagesSquare className="w-4 h-4" /> Seguimiento</div>
                    {notasActuales.length === 0
                      ? <p className="text-sm text-muted-foreground">Sin notas de seguimiento en esta etapa todavía.</p>
                      : <Notas notas={notasActuales} />}
                    {puedeMarcar(remVista) && (
                      <div className="space-y-2">
                        <textarea
                          data-guia="orientacion.remision_seguimiento_texto"
                          value={nuevoSeg}
                          onChange={e => setNuevoSeg(e.target.value)}
                          rows={3}
                          maxLength={4000}
                          placeholder="Escribe una nota de seguimiento (qué se hizo, con quién se habló, acuerdos...)"
                          className="w-full border rounded px-3 py-2 text-sm bg-background resize-none"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            data-guia="orientacion.remision_seguimiento_agregar"
                            disabled={guardandoSeg || !nuevoSeg.trim()}
                            onClick={() => agregarSeguimiento(remVista)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" /> {guardandoSeg ? "Guardando..." : "Agregar seguimiento"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                {/* ── Remitir a otra persona: la MISMA remisión pasa a otra instancia con
                       un paso nuevo (escrito + firma); queda pendiente para quien la recibe. ── */}
                {puedeMarcar(remVista) && (
                  <div className="rounded-md border border-border p-3 flex items-center justify-between gap-3 flex-wrap" data-guia="orientacion.remision_remitir">
                    <p className="text-sm text-muted-foreground">¿El caso debe seguir a otra instancia? Esta misma remisión pasa a esa persona con tu escrito y firma, le queda pendiente y todo el recorrido se conserva aquí.</p>
                    <button
                      type="button"
                      data-guia="orientacion.remision_remitir_boton"
                      onClick={() => navigate(`/remitir-orientacion?remision=${remVista.id}`)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Send className="w-3.5 h-3.5" /> Remitir a otra persona
                    </button>
                  </div>
                )}

                  <div className="rounded-md border border-border p-3 space-y-3" data-guia="orientacion.remision_recorrido">
                    <div className="text-sm font-semibold text-foreground">Recorrido</div>
                    {etapas.length === 0
                      ? <p className="text-sm text-muted-foreground">Esta remisión no ha sido remitida a otra persona.</p>
                      : (
                        <ol className="relative border-l-2 border-border ml-2 space-y-4">
                          {etapas.map(e => (
                            <li key={e.key} className="ml-4">
                              <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-violet-500" />
                              <div className="rounded-md border px-3 py-2 text-sm space-y-1 border-violet-200 bg-violet-50">
                                <div className="font-semibold text-foreground">En <span className="font-bold text-red-600">{e.destino}</span></div>
                                <div className="text-xs text-muted-foreground">{e.encabezado} <span className="font-semibold text-foreground">{e.quien}</span> · {fmt(e.fecha)}</div>
                                <div><span className="font-semibold text-red-600">Motivo:</span> <span className="whitespace-pre-wrap">{e.motivo}</span></div>
                                {e.especificacion && <div><span className="font-semibold text-red-600">Especificación de la conducta:</span> <span className="whitespace-pre-wrap">{e.especificacion}</span></div>}
                                {e.medidas && <div><span className="font-semibold text-red-600">Medidas previas:</span> <span className="whitespace-pre-wrap">{e.medidas}</span></div>}
                                {e.firma && (<div><a href={e.firma} target="_blank" rel="noreferrer"><img src={e.firma} alt="Firma" className="max-h-20 border rounded bg-white mt-1" /></a><div className="text-xs font-semibold mt-0.5">{e.quien}</div></div>)}
                                {e.notas.length > 0 && (
                                  <div className="pt-2">
                                    <div className="text-xs font-semibold text-foreground mb-1">Seguimiento</div>
                                    <Notas notas={e.notas} />
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                  </div>
                </>);
              })()}

              <Dialog open={!!casoExistente} onOpenChange={(o) => { if (!o) setCasoExistente(null); }}>
                <DialogContent className="max-w-md" data-guia="orientacion.remision_caso_existente">
                  <DialogHeader>
                    <DialogTitle>Este estudiante ya tiene un caso de seguimiento</DialogTitle>
                    <DialogDescription>
                      {casoExistente && (<>
                        Caso {casoExistente.caso.estado === "abierto" ? "abierto" : "cerrado"} el {fmtFecha(casoExistente.caso.fecha_apertura)}
                        {casoExistente.caso.autor_nombre ? ` por ${casoExistente.caso.autor_nombre}` : ""}.
                        {casoExistente.caso.motivo_atencion ? ` Motivo: "${casoExistente.caso.motivo_atencion.slice(0, 140)}${casoExistente.caso.motivo_atencion.length > 140 ? "…" : ""}"` : ""}
                        {" "}Puedes enlazar esta remisión a ese caso o abrir uno nuevo.
                      </>)}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="flex-col sm:flex-row gap-2">
                    <button type="button" onClick={() => setCasoExistente(null)} className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent">Cancelar</button>
                    <button type="button" disabled={abriendoCaso} onClick={() => casoExistente && crearCasoDesdeRemision(casoExistente.rem)} className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50">Abrir uno nuevo</button>
                    <button type="button" disabled={abriendoCaso} onClick={enlazarCasoExistente} className="px-3 py-1.5 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">Enlazar al caso existente</button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={confirmPendiente} onOpenChange={setConfirmPendiente}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>¿Volver a Pendiente?</DialogTitle>
                    <DialogDescription>La remisión dejará de estar Atendida y volverá a aparecer como Pendiente.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <button type="button" onClick={() => setConfirmPendiente(false)} className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent">Cancelar</button>
                    <button type="button" disabled={marcando != null} onClick={() => volverPendiente(remVista)} className="px-3 py-1.5 text-sm rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">Sí, volver a Pendiente</button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : estVista ? (
            /* ── Nivel 2: remisiones de un estudiante ── */
            <div className="space-y-3" data-guia="orientacion.remision_item">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 flex-wrap mb-2">
                {estVista.apellidos} {estVista.nombres}
                <span className="text-sm text-muted-foreground font-normal">{estVista.salon ? `${estVista.grado} ${estVista.salon}` : estVista.grado}</span>
              </h2>
              {/* Filtros dentro del estudiante */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                <div className="relative col-span-2 order-last lg:order-first">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar en el motivo..."
                    className="w-full border rounded pl-8 pr-3 py-2 text-sm bg-background"
                  />
                </div>
                <select
                  value={filtroQuien}
                  onChange={e => setFiltroQuien(e.target.value as any)}
                  className="text-sm border rounded px-2 py-2 bg-background col-span-2 lg:col-span-2"
                >
                  <option value="">Todas las remisiones</option>
                  <option value="ami">Remitidas a mí</option>
                  <option value="pormi">Remitidas por mí</option>
                </select>
              </div>
              <div className="mb-2">{botonesEstado}</div>
              <p className="text-sm text-muted-foreground">
                {remsDelEst.length === 0 ? "Ninguna remisión coincide con los filtros." : `${remsDelEst.length === 1 ? "1 remisión" : `${remsDelEst.length} remisiones`}. Toca una para abrirla.`}
              </p>
              {remsDelEst.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => abrirRemision(r)}
                  className={`relative w-full block px-4 py-3 pr-10 border rounded-md text-left overflow-hidden ${dirigidaAMi(r) ? "border-violet-300 bg-violet-50 hover:bg-violet-100/70" : "border-border bg-card hover:bg-muted/30"}`}
                  title={dirigidaAMi(r) ? "Dirigida a ti" : undefined}
                >
                  {/* Número de la remisión, como marca de agua detrás del texto */}
                  <span aria-hidden className="pointer-events-none select-none absolute right-10 top-1 text-6xl font-black text-muted-foreground/15 leading-none">
                    #{numeroPorRemision.get(r.id) ?? "?"}
                  </span>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <div className="relative">
                    <div className="text-sm">
                      <span className="font-semibold text-foreground">Remitido por:</span> <span className="font-bold text-red-600">{remitenteActualDe(r)}</span>
                      {ultimoPasoDe(r) && <span className="text-xs text-muted-foreground ml-1">(creada por {[r.docente_cargo, r.docente_nombre].filter(Boolean).join(" ")})</span>}
                    </div>
                    <div className="text-sm mt-0.5">
                      <span className="font-semibold text-foreground">Dirigida a:</span> <span className="font-bold text-red-600">{destinosLegibles(destinoActual(r)) || "Orientación Escolar"}</span>
                    </div>
                    {(pasosPorRem[r.id] || []).length > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5"><span className="font-semibold text-foreground">Recorrido:</span> {recorridoDe(r).join(" → ")}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span>{fechaHoraLocal(llegadaDe(r))}</span>
                      {badgeEstado(r)}
                      {sinRevisarIds.has(r.id) && (
                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-red-500 text-white font-semibold">Sin revisar</span>
                      )}
                    </div>
                    <div className="text-sm mt-1 line-clamp-2">{ultimoPasoDe(r)?.motivo || r.motivo}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : estudiantesAgrupados.length === 0 ? (
            <div className="text-muted-foreground text-sm">No hay remisiones.</div>
          ) : (
            /* ── Nivel 1: estudiantes con remisiones ── */
            <div className="space-y-3" data-guia="orientacion.remision_estudiante">
              {sinRevisar.length > 0 && (
                <div className="rounded-md border-2 border-red-300 bg-red-50/60 p-3 space-y-2 mb-4" data-guia="orientacion.remisiones_sin_revisar">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">{sinRevisar.length}</span>
                    <h3 className="font-semibold text-foreground">Remitidas a ti sin revisar</h3>
                  </div>
                  {sinRevisar.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => abrirDirecto(r.estudiante_id, r.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 border border-border rounded-md bg-card hover:bg-muted/30 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <span className="font-semibold text-foreground">{r.estudiante_apellidos} {r.estudiante_nombre}</span>
                          <span className="text-xs font-semibold text-muted-foreground ml-2">{grupoDe(r)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-semibold text-foreground">Remitido por:</span> <span className="font-bold text-red-600">{remitenteActualDe(r)}</span>
                          {" · "}{fechaHoraLocal(llegadaDe(r))}
                          {ultimoPasoDe(r) && <span className="ml-1">(remisión #{numeroPorRemision.get(r.id)}, creada por {[r.docente_cargo, r.docente_nombre].filter(Boolean).join(" ")})</span>}
                        </div>
                        <div className="text-sm mt-0.5 line-clamp-1">{ultimoPasoDe(r)?.motivo || r.motivo}</div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {estudiantesAgrupados.map(g => {
                const nSinRevisar = remisiones.filter(r => r.estudiante_id === g.estudiante_id && sinRevisarIds.has(r.id)).length;
                return (
                  <button
                    key={g.estudiante_id}
                    type="button"
                    onClick={() => setEstVistaId(g.estudiante_id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 border border-border rounded-md bg-card hover:bg-muted/30 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{g.apellidos} {g.nombres}</span>
                        <span className="text-xs font-semibold text-muted-foreground">{g.salon ? `${g.grado} ${g.salon}` : g.grado}</span>
                        {nSinRevisar > 0 && (
                          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold" title="Dirigidas a ti sin revisar">{nSinRevisar}</span>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <span>{g.total === 1 ? "1 remisión" : `${g.total} remisiones`} · última: {fmtFecha(g.ultima)}</span>
                        {g.pendientes > 0 && <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700 font-semibold">{g.pendientes} pendiente{g.pendientes > 1 ? "s" : ""}</span>}
                        {g.atendidas > 0 && <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-100 text-emerald-700 font-semibold">{g.atendidas} atendida{g.atendidas > 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                  </button>
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
