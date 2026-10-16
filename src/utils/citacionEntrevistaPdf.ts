// Genera y descarga la citación de entrevista en PDF: documento institucional con
// escudo y nombre del colegio, el texto completo enviado al acudiente, su respuesta,
// las anotaciones y la firma del solicitante. Reutilizable desde staff y acudiente.
import { apiRequest } from "@/lib/apiClient";

type RGB = [number, number, number];
const INK: RGB = [17, 24, 39];
const INK2: RGB = [75, 85, 99];
const MUTE: RGB = [120, 128, 140];
const HAIR: RGB = [226, 230, 236];
const SOFT: RGB = [246, 247, 249];

const fmtFecha = (s: string | null | undefined, conDia = false) =>
  s
    ? new Date(s + "T12:00:00").toLocaleDateString("es-CO", {
        ...(conDia ? { weekday: "long" as const } : {}),
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

const ahoraBogota = () =>
  new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Carga una imagen (PNG, JPG o WebP) y la devuelve como PNG para jsPDF. */
async function cargarImagen(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    return { dataUrl: c.toDataURL("image/png"), w: bmp.width, h: bmp.height };
  } catch {
    return null;
  }
}

/** Incrusta Poppins (la letra de la plataforma). Si falla, se usa Helvetica. */
async function cargarPoppins(pdf: any): Promise<boolean> {
  try {
    const pesos: [string, string][] = [["Regular", "normal"], ["SemiBold", "semibold"], ["Bold", "bold"]];
    for (const [archivo, estilo] of pesos) {
      const buf = await (await fetch(`/fonts/Poppins-${archivo}.ttf`)).arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      pdf.addFileToVFS(`Poppins-${archivo}.ttf`, btoa(bin));
      pdf.addFont(`Poppins-${archivo}.ttf`, "Poppins", estilo);
    }
    return true;
  } catch {
    return false;
  }
}

/** Texto de la citación tal como se le envió al acudiente por WhatsApp. */
function textoCitacion(s: any, con: string): string {
  const est = `${s.estudiante_nombre || ""} ${s.estudiante_apellidos || ""}`.trim();
  const curso = `${s.estudiante_grado || ""} ${s.estudiante_salon || ""}`.trim();
  const fecha = fmtFecha(s.fecha_entrevista, true);
  const mensaje = String(s.mensaje || "").trim();
  if (s.reprogramada) {
    return `Se le informa que se ha REPROGRAMADO la entrevista para el acudiente del estudiante ${est} de ${curso}.\n\nNueva fecha: ${fecha}\nNueva hora: ${s.hora_entrevista || ""}\nCon: ${con}\n\nPor favor ingrese a mundonormi.com y en el inicio haga click en la ficha "Solicitud de Entrevista", busque el día indicado, haga click sobre la citación y confirme su asistencia.`;
  }
  return `Se le informa que se ha solicitado una entrevista para el acudiente del estudiante ${est} de ${curso}.\n\nFecha: ${fecha}\nHora: ${s.hora_entrevista || ""}\nCon: ${con}${mensaje ? `\n\nMensaje:\n${mensaje}` : ""}\n\nPor favor ingrese a mundonormi.com y en el inicio haga click en la ficha "Solicitud de Entrevista", busque el día indicado, haga click sobre la citación y confirme su asistencia.`;
}

export async function descargarCitacionEntrevista(s: any): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { entrevistadoresDeSolicitud } = await import("@/lib/entrevistadores");

  const pdf: any = new jsPDF({ unit: "mm", format: "letter" });
  const W = 215.9, H = 279.4, M = 20, CW = W - M * 2;
  const [colegio, poppins] = await Promise.all([
    apiRequest<{ nombre?: string; logo_url?: string | null }>("/api/colegio/config").catch(() => ({} as any)),
    cargarPoppins(pdf),
  ]);
  const F = poppins ? "Poppins" : "helvetica";
  pdf.setLineHeightFactor(1.4);
  const SEMI = poppins ? "semibold" : "bold";
  const nombreColegio = String(colegio?.nombre || "").trim();
  const [escudo, firma] = await Promise.all([
    colegio?.logo_url ? cargarImagen(colegio.logo_url) : Promise.resolve(null),
    s.firma_url ? cargarImagen(s.firma_url) : Promise.resolve(null),
  ]);

  const font = (estilo: string, size: number, color: RGB = INK) => {
    pdf.setFont(F, estilo);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
  };
  const lh = (size: number, f = 1.4) => (size * f * 25.4) / 72; // alto de línea en mm

  let y = M;
  const PIE = 18; // reserva para el pie de página
  const asegurar = (alto: number) => {
    if (y + alto > H - PIE) {
      pdf.addPage();
      y = M;
    }
  };

  // ── Encabezado institucional ─────────────────────────────────────────────
  let xTxt = M;
  if (escudo) {
    const alto = 22, ancho = Math.min(26, (escudo.w / escudo.h) * alto);
    pdf.addImage(escudo.dataUrl, "PNG", M, y, ancho, alto);
    xTxt = M + ancho + 5;
  }
  const anchoNombre = W - M - xTxt - 48;
  font("bold", 12.5);
  const lineasCol = pdf.splitTextToSize(nombreColegio || "Institución educativa", anchoNombre);
  pdf.text(lineasCol, xTxt, y + 6);
  font("normal", 8.5, MUTE);
  pdf.text("Solicitud de entrevista con acudientes", xTxt, y + 6 + lineasCol.length * lh(12.5) - 1.5);

  // Recuadro de referencia (número y fecha de solicitud)
  const bx = W - M - 44, bw = 44;
  pdf.setFillColor(...SOFT);
  pdf.roundedRect(bx, y, bw, 22, 2.5, 2.5, "F");
  font("normal", 7, MUTE);
  pdf.text("SOLICITUD N.º", bx + 5, y + 6.5, { charSpace: 0.3 });
  font("bold", 15);
  pdf.text(String(s.id ?? "").padStart(5, "0"), bx + 5, y + 13.5);
  font("normal", 7.5, INK2);
  pdf.text(fmtFecha(s.fecha_solicitud), bx + 5, y + 18.5);
  y += 26;
  pdf.setDrawColor(...INK);
  pdf.setLineWidth(0.6);
  pdf.line(M, y, W - M, y);
  y += 10;

  // ── Título ───────────────────────────────────────────────────────────────
  font(SEMI, 21);
  pdf.text("Citación a entrevista", M, y);
  y += 6.5;
  font("normal", 9.5, INK2);
  const nombreEst = `${s.estudiante_apellidos || ""} ${s.estudiante_nombre || ""}`.trim();
  pdf.text(`Acudiente de ${nombreEst} · ${`${s.estudiante_grado || ""} ${s.estudiante_salon || ""}`.trim()}`, M, y);
  y += 9;

  // ── Datos principales (rejilla de 2 columnas) ────────────────────────────
  const con = entrevistadoresDeSolicitud(s);
  const estado = s.confirmado === true ? "Asistirá" : s.confirmado === false ? "No asistirá" : "Pendiente de respuesta";
  const celdas: [string, string][] = [
    ["Estudiante", `${nombreEst}\n${`${s.estudiante_grado || ""} ${s.estudiante_salon || ""}`.trim()}`],
    ["Fecha y hora de la entrevista", `${fmtFecha(s.fecha_entrevista, true).replace(/^./, (c) => c.toUpperCase())}\n${s.hora_entrevista || ""}${s.reprogramada ? " · Reprogramada" : ""}`],
    ["Entrevista con", con],
    ["Solicitada por", s.creado_por_nombre || con],
  ];
  const colW = (CW - 6) / 2;
  for (let i = 0; i < celdas.length; i += 2) {
    const par = celdas.slice(i, i + 2).map(([k, v]) => {
      font("normal", 9.5);
      return { k, lineas: pdf.splitTextToSize(v, colW - 10) as string[] };
    });
    const alto = 12 + Math.max(...par.map((p) => p.lineas.length)) * lh(9.5);
    asegurar(alto + 4);
    par.forEach((p, j) => {
      const x = M + j * (colW + 6);
      pdf.setFillColor(...SOFT);
      pdf.roundedRect(x, y, colW, alto, 2.5, 2.5, "F");
      font("normal", 7, MUTE);
      pdf.text(p.k.toUpperCase(), x + 5, y + 6.5, { charSpace: 0.3 });
      font(SEMI, 9.5);
      pdf.text(p.lineas, x + 5, y + 12);
    });
    y += alto + 4;
  }

  // Estado de la respuesta del acudiente
  asegurar(14);
  const colorEstado: RGB = s.confirmado === true ? [21, 128, 61] : s.confirmado === false ? [185, 28, 28] : [180, 83, 9];
  font("normal", 7, MUTE);
  pdf.text("RESPUESTA DEL ACUDIENTE", M, y + 4, { charSpace: 0.3 });
  font(SEMI, 9);
  const anchoPill = pdf.getTextWidth(estado) + 10;
  pdf.setFillColor(...colorEstado);
  pdf.roundedRect(M + 46, y, anchoPill, 6.5, 3.25, 3.25, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.text(estado, M + 51, y + 4.5);
  y += 11;
  const obs = String(s.observaciones_padre || "").trim();
  if (obs) {
    font("normal", 9.5, INK2);
    const l = pdf.splitTextToSize(`Observaciones del acudiente: ${obs}`, CW);
    asegurar(l.length * lh(9.5) + 4);
    pdf.text(l, M, y);
    y += l.length * lh(9.5) + 4;
  }
  y += 3;

  // ── Secciones de texto ───────────────────────────────────────────────────
  // `reserva`: alto que debe quedar en la MISMA hoja que el final de la sección
  // (la firma va pegada a la citación, nunca sola en una hoja).
  const seccion = (titulo: string, texto: string, recuadro = false, reserva = 0) => {
    const limpio = texto.replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1").trim();
    if (!limpio) return;
    font("normal", 9.5, INK2);
    const pad = recuadro ? 5 : 0;
    const lineas: string[] = pdf.splitTextToSize(limpio, CW - pad * 2);
    const paso = lh(9.5);
    const limite = H - PIE;
    const altoTotal = 9 + lineas.length * paso + pad * 2 + 6 + reserva;
    // Si no caben ni el título y 4 líneas, la sección empieza en la hoja siguiente (si cabe entera allí).
    if (y + 9 + 4 * paso + pad * 2 > limite && M + altoTotal <= limite) { pdf.addPage(); y = M; }
    font(SEMI, 11);
    asegurar(16);
    pdf.text(titulo, M, y);
    y += 3;
    pdf.setDrawColor(...HAIR);
    pdf.setLineWidth(0.3);
    pdf.line(M, y, W - M, y);
    y += 6;
    let i = 0;
    while (i < lineas.length) {
      let caben = Math.max(1, Math.floor((limite - y - pad * 2) / paso));
      const resto = lineas.length - i;
      // Último tramo: si no deja espacio para la reserva, se pasan 3 líneas a la hoja siguiente.
      if (caben >= resto && reserva && y + resto * paso + pad * 2 + 6 + reserva > limite) caben = Math.max(1, resto - 3);
      const trozo = lineas.slice(i, i + caben);
      const alto = trozo.length * paso + pad * 2;
      if (recuadro) {
        pdf.setDrawColor(...HAIR);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(M, y - 1, CW, alto, 2.5, 2.5, "S");
      }
      font("normal", 9.5, INK2);
      pdf.text(trozo, M + pad, y + pad + paso * 0.6);
      y += alto + 6;
      i += trozo.length;
      if (i < lineas.length) {
        pdf.addPage();
        y = M;
      }
    }
  };

  // ── Firma del solicitante (justo después de la citación que firma) ───────
  const FIRMA_H = 36;
  const dibujarFirma = () => {
    asegurar(FIRMA_H);
    const fw = 62;
    if (firma) {
      const fh = Math.min(19, (firma.h / firma.w) * fw);
      pdf.addImage(firma.dataUrl, "PNG", M, y + 19 - fh, fw, fh);
    } else if (s.firma_url) {
      font("normal", 8.5, MUTE);
      pdf.text("(no se pudo cargar la imagen de la firma)", M, y + 15);
    }
    y += 21;
    pdf.setDrawColor(...INK);
    pdf.setLineWidth(0.4);
    pdf.line(M, y, M + fw + 10, y);
    y += 5;
    font(SEMI, 9.5);
    pdf.text(s.creado_por_nombre || con, M, y);
    y += 4.5;
    font("normal", 8, MUTE);
    pdf.text("Firma de quien solicita la entrevista", M, y);
    y += 10;
  };

  seccion("Citación enviada al acudiente por WhatsApp", textoCitacion(s, entrevistadoresDeSolicitud(s, "el/la ")), true, FIRMA_H);
  dibujarFirma();
  seccion("Anotaciones de la entrevista", String(s.anotaciones || ""));

  // ── Pie de página en todas las hojas ─────────────────────────────────────
  const total = pdf.getNumberOfPages();
  const generado = `Generado desde Mundo Normi el ${ahoraBogota()}`;
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(...HAIR);
    pdf.setLineWidth(0.3);
    pdf.line(M, H - 13, W - M, H - 13);
    font("normal", 7.5, MUTE);
    pdf.text(`${nombreColegio}${nombreColegio ? " · " : ""}${generado}`, M, H - 8.5);
    pdf.text(`Página ${p} de ${total}`, W - M, H - 8.5, { align: "right" });
  }

  pdf.save(`Citación a entrevista - ${nombreEst || "estudiante"}.pdf`);
}
