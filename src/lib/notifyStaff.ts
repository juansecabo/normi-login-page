// Notificación automática a Rector, Coordinadores, profesores u Orientador(a)
// vía WhatsApp + plataforma. Se usa para eventos del sistema (excusas, retiros,
// remisiones, etc.) que el staff debe ver.
//
// HORARIO SILENCIOSO: si el padre crea la solicitud fuera de horario laboral
// (lunes-viernes 06:00-19:00 hora Bogotá), en vez de mandar el WhatsApp al
// instante encolamos en Supabase. Un workflow CRON en n8n procesa la cola
// cuando vuelve el horario y manda cada notificación una por una.
//
// IMPORTANTE: tanto la llamada al webhook como el INSERT a la cola usan
// `keepalive: true`. Sin eso, si el padre cierra la app o navega justo
// después de "Excusa registrada", la request en vuelo se aborta y la
// notificación se pierde silenciosa.

const WEBHOOK_URL = "https://n8n.notasnormy.com/webhook/enviar-comunicado-rector-coordinadores";
const SUPABASE_URL = "https://npdtggwzodtssnicmkux.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZHRnZ3d6b2R0c3NuaWNta3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2NzIzMjEsImV4cCI6MjA3MTI0ODMyMX0.fkXjbs2_injmieaipIVHSWmMFep0e0tXX2y8AFRGWnY";

interface Aula {
  grado: string;
  salon: string;
}

type Origen = "inasistencia" | "uniforme" | "retiro" | "remision" | undefined;

// Lunes (1) a viernes (5), 06:00 a 19:00 inclusive, zona America/Bogota.
// "Permitido hasta 7:00 PM" = 19:00 entra, 19:01 ya queda fuera.
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

async function fetchWebhook(
  remitente: string,
  destinatarios: string,
  mensaje: string,
  perfil: string[]
) {
  return fetch(WEBHOOK_URL, {
    method: "POST",
    mode: "cors",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      remitente,
      destinatarios,
      mensaje,
      id_remitente: "sistema",
      perfil,
      nivel: null,
      grado: null,
      salon: null,
      id_estudiantil: null,
      id_destinatarios: null,
    }),
  });
}

// INSERT directo a Notificaciones_Pendientes vía REST con keepalive=true.
// Sin keepalive, si el padre cierra la página después de "Excusa registrada",
// la request en vuelo se aborta y la fila nunca llega a la cola.
async function insertPendiente(payload: {
  remitente: string;
  destinatarios: string;
  mensaje: string;
  perfil: string[];
  aula_grado: string | null;
  aula_salon: string | null;
  origen: string | null;
}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Notificaciones_Pendientes`, {
    method: "POST",
    mode: "cors",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Pendientes insert ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

// Notifica a Rector, Coordinadores y opcionalmente profesores del aula.
export async function notifyRectorCoord(
  mensaje: string,
  remitente = "Sistema Normy",
  aula?: Aula,
  origen?: Origen
) {
  const destinatarios = aula
    ? `Rector, Coordinadores y profesores de ${aula.grado} ${aula.salon}`
    : "Rector y Coordinadores";
  const perfil = aula
    ? ["Rector", "Coordinadores", "Profesores"]
    : ["Rector", "Coordinadores"];

  if (isHorarioPermitido()) {
    try {
      await fetchWebhook(remitente, destinatarios, mensaje, perfil);
    } catch (e) {
      console.warn("notifyRectorCoord falló:", e);
    }
    return;
  }

  try {
    await insertPendiente({
      remitente,
      destinatarios,
      mensaje,
      perfil,
      aula_grado: aula?.grado ?? null,
      aula_salon: aula?.salon ?? null,
      origen: origen ?? null,
    });
  } catch (e) {
    console.warn("Encolado falló, intento envío directo:", e);
    try {
      await fetchWebhook(remitente, destinatarios, mensaje, perfil);
    } catch (e2) {
      console.warn("Envío directo también falló:", e2);
    }
  }
}

// Notifica a la(s) Orientadora(s) Escolar(es). Mismo gating de horario y cola.
export async function notifyOrientadora(
  mensaje: string,
  remitente = "Sistema Normy"
) {
  const destinatarios = "Orientador(a) Escolar";
  const perfil = ["Orientador(a) Escolar"];

  if (isHorarioPermitido()) {
    try {
      await fetchWebhook(remitente, destinatarios, mensaje, perfil);
    } catch (e) {
      console.warn("notifyOrientadora falló:", e);
    }
    return;
  }

  try {
    await insertPendiente({
      remitente,
      destinatarios,
      mensaje,
      perfil,
      aula_grado: null,
      aula_salon: null,
      origen: "remision",
    });
  } catch (e) {
    console.warn("Encolado de remisión falló, intento envío directo:", e);
    try {
      await fetchWebhook(remitente, destinatarios, mensaje, perfil);
    } catch (e2) {
      console.warn("Envío directo también falló:", e2);
    }
  }
}
