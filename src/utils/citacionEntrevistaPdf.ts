// Genera y descarga la citación de entrevista en PDF (con firma y anotaciones).
// Reutilizable desde la vista del staff y del acudiente.

const fmtFecha = (s: string | null | undefined) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "";

async function cargarImagen(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

export async function descargarCitacionEntrevista(s: any): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { entrevistadoresDeSolicitud } = await import("@/lib/entrevistadores");

  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = 210;
  const margin = 20;
  const maxW = pageW - margin * 2;
  let y = 22;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("SOLICITUD DE ENTREVISTA CON ACUDIENTES", pageW / 2, y, { align: "center" });
  y += 12;

  pdf.setFontSize(11);
  const fila = (label: string, valor: string) => {
    pdf.setFont("helvetica", "bold");
    const lblW = pdf.getTextWidth(label + " ");
    pdf.text(label, margin, y);
    pdf.setFont("helvetica", "normal");
    const lineas = pdf.splitTextToSize(valor, maxW - lblW);
    pdf.text(lineas, margin + lblW, y);
    y += 7 * Math.max(1, lineas.length);
  };

  fila("Fecha de solicitud:", fmtFecha(s.fecha_solicitud));
  fila("Estudiante:", `${s.estudiante_nombre || ""} ${s.estudiante_apellidos || ""} — ${s.estudiante_grado || ""} ${s.estudiante_salon || ""}`.trim());
  fila("Entrevista el día:", `${fmtFecha(s.fecha_entrevista)} a las ${s.hora_entrevista || ""}`);
  fila("Entrevista con:", entrevistadoresDeSolicitud(s, "el/la "));
  // Mensaje adicional (viene en formato WhatsApp: se quitan los marcadores * y _)
  const mensajeLimpio = String(s.mensaje || "").replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1").trim();
  if (mensajeLimpio) fila("Mensaje:", mensajeLimpio);
  if (s.creado_por_nombre) fila("Creado por:", s.creado_por_nombre);

  const estado = s.confirmado === true ? "Asistirá" : s.confirmado === false ? "No asistirá" : "Pendiente";
  fila("Estado:", estado + (s.reprogramada ? " (Reprogramada)" : ""));

  // Firma
  if (s.firma_url) {
    y += 2;
    pdf.setFont("helvetica", "bold");
    pdf.text("Firma del solicitante:", margin, y);
    y += 4;
    const img = await cargarImagen(s.firma_url);
    if (img) {
      const wMM = 60;
      const hMM = Math.min(35, (img.h / img.w) * wMM);
      pdf.addImage(img.dataUrl, "PNG", margin, y, wMM, hMM);
      y += hMM + 6;
    } else {
      pdf.setFont("helvetica", "italic");
      pdf.text("(no se pudo cargar la firma)", margin, y);
      y += 8;
    }
  }

  // Anotaciones (si hay)
  const anot = (s.anotaciones || "").trim();
  if (anot) {
    y += 2;
    pdf.setFont("helvetica", "bold");
    pdf.text("Anotaciones de la entrevista:", margin, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    const lineas = pdf.splitTextToSize(anot, maxW);
    pdf.text(lineas, margin, y);
    y += 7 * lineas.length;
  }

  const nombre = `${s.estudiante_apellidos || ""} ${s.estudiante_nombre || ""}`.trim() || "estudiante";
  pdf.save(`Citacion - ${nombre}.pdf`);
}
