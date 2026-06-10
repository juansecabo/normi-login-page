// Notificación automática a Rector, Coordinadores, profesores u Orientador(a)
// vía WhatsApp + plataforma. Se usa para eventos del sistema (excusas, retiros,
// remisiones, etc.) que el staff debe ver.
//
// MIGRADO: ya no llama al webhook viejo n8n "enviar-comunicado-rector-
// coordinadores". Ahora llama directamente a /api/comunicados/enviar del
// normi-server con `as_system: true`. El server decide internamente:
//   - dentro de horario laboral (L-V 06:00-19:00 Bogotá) → despacha al instante.
//   - fuera de horario → encola en Notificaciones_Pendientes. Un processor
//     interno del server lo despacha cuando vuelve el horario.
//
// SEGURIDAD: el endpoint exige JWT del usuario logueado. En modo as_system el
// server fuerza el remitente a "Sistema Normi (tag)" y restringe destinatarios
// a perfiles staff (un padre no puede usar este flag para mandar mensajes a
// otros padres).
//
// IMPORTANTE: keepalive: true en la request. Sin eso, si el padre cierra la
// app justo después de "Excusa registrada", la request en vuelo se aborta y
// la notificación se pierde silenciosa.

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL)
  || '';

function getJwt(): string | null {
  try { return localStorage.getItem('normi_jwt'); } catch { return null; }
}

interface Aula {
  grado: string;
  salon: string;
}

type Origen = "inasistencia" | "uniforme" | "retiro" | "remision" | "entrevista" | "consulta" | undefined;

// La función isHorarioPermitido se mantiene exportada para componentes que la
// usan en lógica de UI (mostrar/ocultar avisos). El server ya hace su propio
// chequeo de horario para decidir despachar vs encolar.
export function isHorarioPermitido(now: Date = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const d = dayMap[weekday] ?? 0;
  if (d < 1 || d > 5) return false;
  const totalMin = hour * 60 + minute;
  return totalMin >= 6 * 60 && totalMin <= 19 * 60;
}

interface NotifyOptions {
  mensaje: string;
  remitenteTag: string;           // ej "Excusas", "Retiro", "Uniforme" — va en "Sistema Normi (X)"
  perfiles: string[];             // ej ["Rector","Coordinadores"]
  aula?: Aula;
  destinatariosLabel: string;     // ej "Rector y Coordinadores" o "Rector, Coordinadores y profesores de 7 2"
  ids?: string[];                 // cédulas exactas — limita el envío a esas personas dentro de los perfiles
}

async function postComunicadoSistema(opts: NotifyOptions): Promise<void> {
  const jwt = getJwt();
  if (!jwt) {
    console.warn('notifyStaff: sin JWT, no se puede enviar');
    return;
  }

  const segmento: any = { perfil: opts.perfiles };
  if (opts.aula) {
    segmento.grados = [opts.aula.grado];
    segmento.salones = [opts.aula.salon];
  }
  if (opts.ids && opts.ids.length > 0) {
    segmento.id_destinatarios = opts.ids;
  }

  const body = {
    as_system: true,
    sistema_tag: opts.remitenteTag,
    destinatarios_label: opts.destinatariosLabel,
    mensaje: opts.mensaje,
    segmentos: [segmento],
  };

  const res = await fetch(`${API_BASE_URL}/api/comunicados/enviar`, {
    method: 'POST',
    mode: 'cors',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`comunicados/enviar ${res.status}: ${text}`);
  }
}

// Notifica a Rector, Coordinadores y opcionalmente profesores del aula.
export async function notifyRectorCoord(
  mensaje: string,
  remitente = "Sistema Normi",
  aula?: Aula,
  origen?: Origen
): Promise<void> {
  const destinatariosLabel = aula
    ? `Rector, Coordinadores y profesores de ${aula.grado} ${aula.salon}`
    : "Rector y Coordinadores";
  const perfiles = aula
    ? ["Rector", "Coordinadores", "Profesores"]
    : ["Rector", "Coordinadores"];

  // Derivar el "tag" para "Sistema Normi (X)" a partir del remitente legacy o
  // del origen explícito. Mantiene retrocompatibilidad con las llamadas viejas
  // que pasaban "Sistema Normi (Excusas)" en el parámetro remitente.
  const remitenteTag = origen
    ? origen.charAt(0).toUpperCase() + origen.slice(1)
    : extraerTagDeRemitente(remitente);

  try {
    await postComunicadoSistema({
      mensaje,
      remitenteTag,
      perfiles,
      aula,
      destinatariosLabel,
    });
  } catch (e) {
    console.warn('notifyRectorCoord falló:', e);
  }
}

// Notifica a la(s) Orientadora(s) Escolar(es).
export async function notifyOrientadora(
  mensaje: string,
  remitente = "Sistema Normi"
): Promise<void> {
  try {
    await postComunicadoSistema({
      mensaje,
      remitenteTag: extraerTagDeRemitente(remitente) || 'Remisión',
      perfiles: ['Orientadores'],
      destinatariosLabel: 'Orientador(a) Escolar',
    });
  } catch (e) {
    console.warn('notifyOrientadora falló:', e);
  }
}

// Todos los perfiles staff que acepta el modo as_system. Se usan en conjunto
// cuando el destinatario es UNA persona puntual (por cédula) cuyo cargo no se
// conoce de antemano: el resolver solo entrega al que coincide con la cédula.
const PERFILES_STAFF_TODOS = [
  "Rector", "Coordinadores", "Profesores", "Administrativos",
  "Secretaria General", "Orientadores", "Administradores",
];

// Notifica a UN miembro del staff específico por su cédula, sin importar su cargo.
export async function notifyInternoPorCedula(
  mensaje: string,
  remitenteTag: string,
  cedula: string | number,
  destinatariosLabel: string,
): Promise<void> {
  try {
    await postComunicadoSistema({
      mensaje,
      remitenteTag,
      perfiles: PERFILES_STAFF_TODOS,
      destinatariosLabel,
      ids: [String(cedula)],
    });
  } catch (e) {
    console.warn('notifyInternoPorCedula falló:', e);
  }
}

function extraerTagDeRemitente(remitente: string): string {
  // "Sistema Normi (Excusas)" → "Excusas". "Sistema Normi" → "".
  const m = remitente.match(/\(([^)]+)\)/);
  return m ? m[1] : '';
}
