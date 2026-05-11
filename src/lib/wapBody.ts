const SUPABASE_URL = "https://npdtggwzodtssnicmkux.supabase.co";
const BUCKET = "documentos";

export const MAX_WA_TEMPLATE_BODY = 1024;

// La plantilla fija de WhatsApp envuelve a {{1}} con:
//   *Notificación académica:*\n\n{{1}}\n\nEstoy a tu servicio.
// El texto fijo (todo menos {{1}}) ocupa 49 chars del límite total de 1024.
export const WA_TEMPLATE_OVERHEAD = 49;

const sanitizeForTemplate = (text: string) =>
  text.replace(/\t/g, " ").replace(/\n+/g, " ").replace(/ {5,}/g, "    ");

const cleanName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");

export const buildTemplateBodyPreview = (args: {
  remitente: string;
  destinatarios: string;
  mensaje: string;
  archivos: File[];
}) => {
  const { remitente, destinatarios, mensaje, archivos } = args;
  let body =
    `*COMUNICADO*\n\n` +
    `*Remitente:* ${remitente}\n\n` +
    `*Destinatarios:* ${destinatarios}\n\n` +
    `*Mensaje:* ${mensaje}`;
  if (archivos.length > 0) {
    const base = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
    const ts = Date.now().toString();
    const urls = archivos.map((f) => `${base}${ts}_${cleanName(f.name)}`);
    const etiqueta = urls.length === 1 ? "Archivo adjunto" : "Archivos adjuntos";
    body += `\n\n${etiqueta}:\n${urls.join("\n")}`;
  }
  return sanitizeForTemplate(body);
};

// Cuerpo de la plantilla cuando se programa una actividad (REPORTE DE ACTIVIDAD).
// El n8n workflow "Notificar Actividades" arma el body con este mismo formato
// y lo envuelve en la misma plantilla `notificacion_academica` que los comunicados,
// por eso comparte MAX_WA_TEMPLATE_BODY + WA_TEMPLATE_OVERHEAD.
export const buildActividadBodyPreview = (args: {
  profesorCargo: string;
  profesorNombre: string;
  grado: string;
  salon: string;
  asignatura: string;
  descripcion: string;
  fecha: string;
  archivos: File[];
}) => {
  const { profesorCargo, profesorNombre, grado, salon, asignatura, descripcion, fecha, archivos } = args;
  let body =
    `*REPORTE DE ACTIVIDAD*\n\n` +
    `*${profesorCargo}:* ${profesorNombre}\n` +
    `*Grado:* ${grado} ${salon}\n` +
    `*Asignatura:* ${asignatura}\n` +
    `*Descripción:* ${descripcion}\n` +
    `*Fecha de presentación:* ${fecha}`;
  if (archivos.length > 0) {
    const base = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
    const ts = Date.now().toString();
    const urls = archivos.map((f) => `${base}${ts}_${cleanName(f.name)}`);
    const etiqueta = urls.length === 1 ? "Archivo adjunto" : "Archivos adjuntos";
    body += `\n\n${etiqueta}:\n${urls.join("\n")}`;
  }
  return sanitizeForTemplate(body);
};
