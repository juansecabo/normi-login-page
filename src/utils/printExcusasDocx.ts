// docx, html2canvas y file-saver son pesados — se cargan a demanda.

export interface LineaExcusa {
  label: string;        // ej. "Estudiante:"
  value: string;        // ej. "Juan Pérez — Sexto 3"
}

export interface SeccionExcusa {
  titulo: string;       // ej. "FORMATO DE JUSTIFICACIÓN POR INASISTENCIA"
  encabezado?: string;  // opcional, ej. "Corozal, 30 de abril de 2026"
  // Filas del cuerpo. Cada fila puede tener 1 o 2 líneas (lado a lado en Word).
  rows: LineaExcusa[][];
  firmaUrl?: string | null;
  count?: number;       // veces a repetir esta excusa en el doc (default 1)
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildExcusaHTML(s: SeccionExcusa): string {
  // Cada fila se renderiza como un <p> con sus campos en flujo inline, separados
  // por un gap. El navegador envuelve naturalmente: si un campo es largo, el texto
  // continúa en la siguiente línea usando TODO el ancho, no solo una "columna".
  const filas = s.rows.map(row => {
    const items = row.map(l =>
      `<strong>${escapeHtml(l.label)}</strong> ${escapeHtml(l.value)}`
    ).join('<span style="display:inline-block; width:32px;"></span>');
    return `<p style="margin:8px 0; line-height:1.55;">${items}</p>`;
  }).join("");
  const firma = s.firmaUrl
    ? `<p style="margin:16px 0 6px;"><strong>Firma:</strong></p>
       <img src="${s.firmaUrl}" crossorigin="anonymous" style="max-width:220px; max-height:100px; display:block; border:1px solid #ddd;" />`
    : "";
  return `
    <div style="font-family: Arial, sans-serif; color:#000; font-size:17px; padding:8px;">
      <p style="text-align:center; font-weight:bold; font-size:20px; margin:0 0 14px;">${escapeHtml(s.titulo)}</p>
      ${s.encabezado ? `<p style="margin:8px 0;">${escapeHtml(s.encabezado)}</p>` : ""}
      ${filas}
      ${firma}
    </div>
  `;
}

async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  return await r.arrayBuffer();
}

export async function descargarExcusasDocx(secciones: SeccionExcusa[], filename: string) {
  const html2canvas = (await import("html2canvas")).default;
  const { Document, Packer, Paragraph, ImageRun } = await import("docx");
  const { saveAs } = await import("file-saver");

  // Contenedor offscreen — más ancho ahora porque vamos a aprovechar 2 columnas
  const off = document.createElement("div");
  off.style.cssText = "position:fixed; left:-99999px; top:0; width:780px; padding:0; background:white;";
  document.body.appendChild(off);

  const docChildren: any[] = [];
  try {
    for (const s of secciones) {
      off.innerHTML = buildExcusaHTML(s);
      const imgs = Array.from(off.querySelectorAll("img")) as HTMLImageElement[];
      await Promise.all(imgs.map(img =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); })
      ));

      const canvas = await html2canvas(off, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const dataUrl = canvas.toDataURL("image/png");
      const buf = await fetchAsArrayBuffer(dataUrl);

      const targetWidth = 580;
      const ratio = canvas.height / canvas.width;
      const width = targetWidth;
      const height = Math.round(targetWidth * ratio);

      const repeticiones = s.count && s.count > 0 ? s.count : 1;
      for (let i = 0; i < repeticiones; i++) {
        docChildren.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: buf,
                transformation: { width, height },
                type: "png",
              } as any),
            ],
            // Más espacio vertical entre excusas para poder recortar con margen
            spacing: { after: 400 },
          })
        );
      }
    }
  } finally {
    document.body.removeChild(off);
  }

  const doc = new Document({ sections: [{ children: docChildren }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename);
}
