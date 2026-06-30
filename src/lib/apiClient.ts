/**
 * Cliente HTTP para el API de normi-server.
 *
 * - JWT en localStorage["normi_jwt"]
 * - apiClient.auth.login() → devuelve { token, user } o { tempToken, memberships }
 *   (lo segundo si la cédula tiene varias membresías y hay que mostrar selector)
 * - apiClient.auth.selectColegio(colegio_id, rol) → completa la selección
 *   y devuelve { token, user } final.
 */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || '';

const JWT_KEY = 'normi_jwt';
const TEMP_JWT_KEY = 'normi_jwt_temp';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message || `API ${status}`);
    this.status = status;
    this.body = body;
  }
}

function getToken(): string | null {
  try { return localStorage.getItem(JWT_KEY); } catch { return null; }
}
function setToken(token: string | null) {
  try {
    if (token === null) localStorage.removeItem(JWT_KEY);
    else localStorage.setItem(JWT_KEY, token);
  } catch {}
}
function getTempToken(): string | null {
  try { return sessionStorage.getItem(TEMP_JWT_KEY); } catch { return null; }
}
function setTempToken(token: string | null) {
  try {
    if (token === null) sessionStorage.removeItem(TEMP_JWT_KEY);
    else sessionStorage.setItem(TEMP_JWT_KEY, token);
  } catch {}
}

async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
  opts?: { useTempToken?: boolean },
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = opts?.useTempToken ? getTempToken() : getToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...init, headers });
  // Sesión deslizante: si el server mandó un token renovado, lo guardamos. Así
  // la sesión se mantiene viva mientras la persona use la plataforma.
  const renewed = res.headers.get('X-Renewed-Token');
  if (renewed && !opts?.useTempToken) setToken(renewed);
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    if (res.status === 401 && !opts?.useTempToken) {
      setToken(null);
      // Sesión vencida en un endpoint autenticado → mandar al inicio con aviso.
      // Excluimos el flujo de /auth/* (login, select-colegio) para no confundir
      // credenciales incorrectas con sesión vencida, y no redirigimos si ya
      // estamos en el login ("/"). El ?redirect= deja volver a donde estaba.
      if (typeof window !== 'undefined' && !path.includes('/auth/') && window.location.pathname !== '/') {
        const actual = window.location.pathname + window.location.search;
        window.location.replace(`/?expired=1&redirect=${encodeURIComponent(actual)}`);
      }
    }
    throw new ApiError(res.status, body);
  }
  return body as T;
}

// ───────────────────────────────────────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────────────────────────────────────

export type AuthRol =
  | 'SuperAdmin'
  | 'Administrador' | 'Rector' | 'Coordinador(a)' | 'Administrativo(a)'
  | 'Secretaria General' | 'Orientador(a) Escolar' | 'Profesor(a)'
  | 'Estudiante' | 'Acudiente';

export interface ColegioPlataforma {
  id: string;
  slug: string;
  nombre: string;
  logo_url: string | null;
  color_primario: string;
  plan: string;
  estado: string;
  fecha_alta: string;
  counts: { internos: number; estudiantes: number; acudientes: number };
}

/** Fila completa de un colegio (para el wizard de Crear/Configurar Institución). */
export interface ColegioDetalle {
  id: string;
  slug: string;
  nombre: string;
  logo_url: string | null;
  color_primario: string;
  plan: string;
  estado: string;
  publico: boolean;
  configuracion: Record<string, any>;
}

export interface ColegioAdmin {
  id: string;
  nombres: string;
  apellidos: string;
  numero_de_telefono: string | null;
}

export interface AcudidoData {
  id: string;
  nombre: string;
  apellidos: string;
  nivel: string;
  grado: string;
  salon: string;
}
/** @deprecated Alias legacy. Usar AcudidoData. */
export type HijoData = AcudidoData;

export interface ColegioInfo {
  id: string;
  slug: string;
  nombre: string;
  logo_url: string | null;
  color: string;
}

export interface AuthUser {
  id: string;
  rol: AuthRol;
  nombres: string;
  apellidos: string;
  nivel?: string;
  grado?: string;
  salon?: string;
  acudidos?: AcudidoData[];
  /** True si la cedula tiene >=2 membresias. Frontend lo usa para decidir
   *  si mostrar el boton "Cambiar perfil" en el header. */
  multi_membership?: boolean;
  /** Foto de perfil de ESTA membresia (puede ser distinta en otro colegio/rol) */
  avatar_url?: string | null;
  colegio: ColegioInfo;
}

export interface FinalLoginResponse {
  token: string;
  user: AuthUser;
}

export interface MembershipChoice {
  colegio_id: string;
  colegio_slug: string;
  colegio_nombre: string;
  colegio_logo_url: string | null;
  colegio_color: string;
  rol: AuthRol;
}

export interface MultiMembershipResponse {
  tempToken: string;
  memberships: MembershipChoice[];
}

export type LoginResponse = FinalLoginResponse | MultiMembershipResponse;

export function isMultiMembership(r: LoginResponse): r is MultiMembershipResponse {
  return (r as MultiMembershipResponse).tempToken !== undefined;
}

// ───────────────────────────────────────────────────────────────────────────
// API
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// Tipos de Estadísticas
// ───────────────────────────────────────────────────────────────────────────

export interface ApiPromedioEstudiante {
  id: string;
  nombre_completo: string;
  grado: string;
  salon: string;
  promedio: number;
  cantidadActividades: number;
  sumaPorcentajes: number;
  promediosPorPeriodo: Record<number, number>;
  promediosPorAsignatura: Record<string, number>;
}

export interface ApiDistribucionItem {
  rango: string;
  cantidad: number;
  porcentaje: number;
}

export interface ApiPromedioSalon {
  grado: string;
  salon: string;
  promedio: number;
  cantidadEstudiantes: number;
}

export interface ApiPromedioGrado {
  grado: string;
  promedio: number;
  cantidadEstudiantes: number;
}

export interface ApiPromedioAsignatura {
  asignatura: string;
  promedio: number;
  cantidadEstudiantes: number;
}

export interface ApiEvolucionItem {
  periodo: string;
  promedio: number;
  cantidadEstudiantes?: number;
}

export interface ApiInstitucional {
  periodo: number | 'anual';
  promedio_institucional: number;
  total_estudiantes: number;
  estudiantes_evaluados: number;
  distribucion: ApiDistribucionItem[];
  top_estudiantes: ApiPromedioEstudiante[];
  bottom_estudiantes: ApiPromedioEstudiante[];
  promedios_salones: ApiPromedioSalon[];
  promedios_grados: ApiPromedioGrado[];
  estudiantes_en_riesgo: ApiPromedioEstudiante[];
  tiene_datos_riesgo: boolean;
  evolucion: ApiEvolucionItem[];
}

export interface ApiGrado {
  grado: string;
  periodo: number | 'anual';
  promedio_grado: number;
  promedio_institucional: number;
  total_estudiantes: number;
  estudiantes_evaluados: number;
  distribucion: ApiDistribucionItem[];
  promedios_salones: ApiPromedioSalon[];
  promedios_asignaturas: ApiPromedioAsignatura[];
  top_estudiantes: ApiPromedioEstudiante[];
  bottom_estudiantes: ApiPromedioEstudiante[];
  estudiantes_en_riesgo: ApiPromedioEstudiante[];
  tiene_datos_riesgo: boolean;
  evolucion: ApiEvolucionItem[];
}

export interface ApiSalon {
  grado: string;
  salon: string;
  periodo: number | 'anual';
  promedio_salon: number;
  promedio_grado: number;
  promedio_institucional: number;
  total_estudiantes: number;
  estudiantes_evaluados: number;
  posicion_grado: number;
  total_salones_grado: number;
  distribucion: ApiDistribucionItem[];
  estudiantes: ApiPromedioEstudiante[];
  promedios_asignaturas: ApiPromedioAsignatura[];
  salones_grado: ApiPromedioSalon[];
  top_estudiantes: ApiPromedioEstudiante[];
  estudiantes_en_riesgo: ApiPromedioEstudiante[];
  tiene_datos_riesgo: boolean;
  evolucion: ApiEvolucionItem[];
}

export interface ApiEstudianteStats extends ApiPromedioEstudiante {
  periodo: number | 'anual';
  promedio_institucional: number;
  promedio_grado: number;
  promedio_salon: number;
  posicion_salon: number;
  total_salon: number;
  posicion_grado: number;
  total_grado: number;
  posicion_institucional: number;
  total_institucional: number;
}

export interface ApiAsignatura {
  asignatura: string;
  periodo: number | 'anual';
  grado?: string;
  salon?: string;
  promedio_asignatura: number;
  estudiantes_evaluados: number;
  estudiantes_aprobados: number;
  tasa_aprobacion: number;
  distribucion: ApiDistribucionItem[];
  rendimiento_por_grado: { grado: string; promedio: number; cantidadEstudiantes: number }[];
  rendimiento_por_salon: { grado: string; salon: string; promedio: number; cantidadEstudiantes: number }[];
  top_estudiantes: ApiPromedioEstudiante[];
  bottom_estudiantes: ApiPromedioEstudiante[];
  estudiantes: ApiPromedioEstudiante[];
  estudiantes_en_riesgo: ApiPromedioEstudiante[];
  tiene_datos_riesgo: boolean;
  evolucion: ApiEvolucionItem[];
}

export interface ApiRiesgo {
  periodo: number | 'anual';
  umbral: number;
  grado?: string;
  salon?: string;
  asignatura?: string;
  total: number;
  estudiantes: ApiPromedioEstudiante[];
}

export interface ApiMeta {
  grados: string[];
  salones: { grado: string; salon: string }[];
  asignaturas: string[];
  asignaciones_expandidas: { asignatura: string; grado: string; salon: string }[];
}

export interface ApiConsolidadoGrupo {
  grado: string;
  salon: string;
  periodo: number;
  asignaturas: { nombre: string; completo: boolean }[];
  estudiantes: { id: string; nombre: string; notas: Record<string, number> }[];
}

export type AsistenciaEstado = 'presente' | 'ausente' | 'excusa';

export interface AsistenciaRosterItem {
  estudiante_id: string;
  nombres: string;
  apellidos: string;
  avatar_url: string | null;
  estado: AsistenciaEstado | null;
  tiene_excusa: boolean;
  excusa_motivo: string | null;
}

export interface AsistenciaHistorialEstudiante {
  estudiante_id: string;
  nombres: string;
  apellidos: string;
  avatar_url: string | null;
}
export interface AsistenciaRegistro {
  estudiante_id: string;
  fecha: string; // YYYY-MM-DD
  estado: AsistenciaEstado;
}
export interface AsistenciaHistorial {
  estudiantes: AsistenciaHistorialEstudiante[];
  registros: AsistenciaRegistro[];
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

/** Lee un Blob como base64 (sin el prefijo data:). */
function blobABase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(((r.result as string).split(',')[1]) || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Lee un archivo (PDF, etc.) y devuelve su contenido en base64 (sin el prefijo data:). */
function archivoABase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const coma = res.indexOf(",");
      resolve(coma >= 0 ? res.slice(coma + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Convierte cualquier imagen a WebP en el navegador y devuelve su base64.
 * Regla de marca de Cailico: TODOS los logos/escudos se almacenan en WebP.
 * Si ya viene en webp no se recodifica (evita pérdida). Preserva transparencia.
 */
async function imagenAWebpBase64(file: File): Promise<string> {
  // Escudo SIEMPRE a un lienzo cuadrado fijo de 500×500 px (WebP). La imagen se
  // reescala MANTENIENDO su proporción (contain) y se centra sobre fondo
  // transparente, así todos los escudos quedan del mismo tamaño y livianos sin
  // distorsionarse. Se reconvierte incluso si ya viene en webp.
  const LADO = 500;
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(LADO / bitmap.width, LADO / bitmap.height);
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto de canvas');
  ctx.clearRect(0, 0, LADO, LADO);
  ctx.drawImage(bitmap, Math.round((LADO - w) / 2), Math.round((LADO - h) / 2), w, h);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('La conversión a WebP falló'))),
      'image/webp',
      0.9,
    ),
  );
  return blobABase64(blob);
}

export const apiClient = {
  auth: {
    async login(cedula: string, contrasena: string): Promise<LoginResponse> {
      const res = await request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ cedula, contrasena }),
      });
      if (isMultiMembership(res)) {
        setTempToken(res.tempToken);
        setToken(null);
      } else {
        setToken(res.token);
        setTempToken(null);
      }
      return res;
    },

    async selectColegio(colegio_id: string, rol?: string): Promise<FinalLoginResponse> {
      const res = await request<FinalLoginResponse>(
        '/auth/select-colegio',
        { method: 'POST', body: JSON.stringify({ colegio_id, rol }) },
        { useTempToken: true },
      );
      setToken(res.token);
      setTempToken(null);
      return res;
    },

    async me(): Promise<{ user: AuthUser }> {
      return request('/auth/me');
    },

    async changePassword(contrasena_actual: string, contrasena_nueva: string): Promise<{ ok: true }> {
      return request<{ ok: true }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ contrasena_actual, contrasena_nueva }),
      });
    },

    /** SOLO Administrador. Migra la cédula de una persona en todas las tablas. */
    async cambiarCedula(cedula_vieja: string, cedula_nueva: string): Promise<{ ok: true }> {
      return request<{ ok: true }>('/auth/cambiar-cedula', {
        method: 'POST',
        body: JSON.stringify({ cedula_vieja, cedula_nueva }),
      });
    },

    /**
     * Borra Usuarios.id=cedula SOLO si la cédula ya no tiene rol en NINGÚN
     * colegio (Internos/Estudiantes/Acudientes). Sin esta verificación
     * cross-tenant, el cleanup desde PanelControl destruiría la identidad
     * de una persona con multi-membresía. Solo Admin/Rector/Coord.
     */
    /**
     * Cambiar de perfil sin cerrar sesion. Si la cedula tiene >=2 membresias,
     * devuelve memberships para mostrar el selector; borra el JWT final y
     * guarda un tempToken. Si solo tiene 1, devuelve {onlyOne: true} y la
     * sesion sigue intacta.
     */
    async switchProfile(): Promise<MultiMembershipResponse | { onlyOne: true }> {
      const res = await request<MultiMembershipResponse | { onlyOne: true }>(
        '/auth/switch-profile',
        { method: 'POST' },
      );
      if ('tempToken' in res) {
        setTempToken(res.tempToken);
        setToken(null);
      }
      return res;
    },

    /**
     * Sube foto de perfil para la membresia actual del JWT.
     * El server determina la tabla (Internos/Estudiantes/Acudientes) por el rol.
     */
    async deleteAvatar(): Promise<{ ok: true }> {
      return request<{ ok: true }>('/api/avatar', { method: 'DELETE' });
    },

    async uploadAvatar(file: File): Promise<{ avatar_url: string }> {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const result = r.result as string;
          // result viene como "data:image/jpeg;base64,XXXX..."
          resolve(result.split(',')[1] || '');
        };
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      return request<{ avatar_url: string }>('/api/avatar/upload', {
        method: 'POST',
        body: JSON.stringify({ contentBase64, contentType: file.type }),
      });
    },

    /**
     * Sube/cambia la foto de OTRO estudiante (director de grupo o directivo).
     * El server valida el permiso contra Internos.direccion_de_grupo.
     */
    async uploadAvatarEstudiante(estudianteId: string, file: File): Promise<{ avatar_url: string }> {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(((r.result as string).split(',')[1]) || '');
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      return request<{ avatar_url: string }>('/api/avatar/estudiante/upload', {
        method: 'POST',
        body: JSON.stringify({ estudiante_id: estudianteId, contentBase64, contentType: file.type }),
      });
    },

    async deleteAvatarEstudiante(estudianteId: string): Promise<{ ok: true }> {
      return request<{ ok: true }>(`/api/avatar/estudiante?estudiante_id=${encodeURIComponent(estudianteId)}`, { method: 'DELETE' });
    },

    async cleanupUsuarioOrphan(cedula: string): Promise<{ deleted: boolean; remaining: number }> {
      return request<{ deleted: boolean; remaining: number }>('/auth/cleanup-usuario', {
        method: 'POST',
        body: JSON.stringify({ cedula }),
      });
    },

    logout() {
      setToken(null);
      setTempToken(null);
    },

    getToken,
    isAuthenticated(): boolean {
      return getToken() !== null;
    },

    /** PÚBLICO (página de inicio): envía la contraseña al correo de recuperación asociado al id. */
    async olvidoContrasena(id: string): Promise<{ ok: true }> {
      return request<{ ok: true }>('/auth/olvido-contrasena', {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
    },
  },

  /** Ficha Perfil: lee/escribe la tabla global Usuarios (aplica a todos los perfiles). */
  perfil: {
    datos(): Promise<{ nombres: string | null; apellidos: string | null; numero_de_telefono: string | null; fecha_de_nacimiento: string | null; correo: string | null; recuperacion_pregunta: string | null }> {
      return request('/api/perfil/datos');
    },
    actualizarDatos(body: Record<string, unknown>): Promise<{ ok: true }> {
      return request('/api/perfil/datos', { method: 'POST', body: JSON.stringify(body) });
    },
    recuperacionVer(): Promise<{ recuperacion_pregunta: string | null; recuperacion_respuesta: string | null; correo: string | null }> {
      return request('/api/perfil/recuperacion/ver', { method: 'POST' });
    },
    recuperacionGuardar(body: { metodo: 'whatsapp' | 'correo'; pregunta?: string; respuesta?: string; correo?: string }): Promise<{ ok: true }> {
      return request('/api/perfil/recuperacion', { method: 'POST', body: JSON.stringify(body) });
    },
  },

  plataforma: {
    colegios(): Promise<{ colegios: ColegioPlataforma[] }> {
      return request<{ colegios: ColegioPlataforma[] }>('/api/plataforma/colegios');
    },
    async uploadColegioLogo(colegio_id: string, file: File): Promise<{ logo_url: string }> {
      // Regla de marca: los escudos se almacenan siempre en WebP, sin importar
      // el formato que suba el SuperAdmin (jpg/png/webp).
      const contentBase64 = await imagenAWebpBase64(file);
      return request<{ logo_url: string }>('/api/plataforma/colegio/logo', {
        method: 'POST',
        body: JSON.stringify({ colegio_id, contentBase64, contentType: 'image/webp' }),
      });
    },
    entrarComoAdmin(colegio_id: string): Promise<{ ok: true; token: string; colegio: { id: string; nombre: string; slug: string } }> {
      return request(`/api/plataforma/entrar-como-admin/${colegio_id}`, { method: 'POST' });
    },

    // ─── Crear Institución (wizard SuperAdmin) ───
    /** Crea un borrador (estado oculto). Devuelve el colegio creado. */
    crearColegio(nombre?: string): Promise<{ colegio: ColegioDetalle }> {
      return request('/api/plataforma/colegios', { method: 'POST', body: JSON.stringify({ nombre }) });
    },
    /** Detalle de un colegio para retomar/editar: fila + admins + estructura. */
    getColegio(id: string): Promise<{ colegio: ColegioDetalle; admins: ColegioAdmin[]; estructura: { jornadas: number; grados: number; salones: number } }> {
      return request(`/api/plataforma/colegios/${id}`);
    },
    /** Guarda el borrador (merge de configuracion). */
    patchColegio(id: string, patch: { nombre?: string; slug?: string; color_primario?: string; plan?: string; configuracion?: Record<string, unknown> }): Promise<{ colegio: ColegioDetalle }> {
      return request(`/api/plataforma/colegios/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    },
    /** Asegura un Administrador del colegio (persona global + membresía). */
    crearAdmin(id: string, body: { cedula: string; nombres: string; apellidos: string; telefono?: string }): Promise<{ ok: true }> {
      return request(`/api/plataforma/colegios/${id}/admin`, { method: 'POST', body: JSON.stringify(body) });
    },
    /** Busca una persona global por cédula (para autocompletar el formulario). */
    buscarUsuario(cedula: string): Promise<{ usuario: { id: string; nombres: string | null; apellidos: string | null; numero_de_telefono: string | null } | null }> {
      return request(`/api/plataforma/usuario/${encodeURIComponent(cedula)}`);
    },
    /** Asegura un interno del colegio con el cargo dado (Rector, Coordinador, etc.). */
    crearInterno(id: string, body: { cedula: string; nombres: string; apellidos: string; telefono?: string; cargo: string }): Promise<{ ok: true }> {
      return request(`/api/plataforma/colegios/${id}/interno`, { method: 'POST', body: JSON.stringify(body) });
    },
    /** Publica el borrador → estado activo. */
    publicarColegio(id: string): Promise<{ ok: true; ya_activo?: boolean }> {
      return request(`/api/plataforma/colegios/${id}/publicar`, { method: 'POST' });
    },
    /** Descarta un borrador. */
    descartarColegio(id: string): Promise<{ ok: true }> {
      return request(`/api/plataforma/colegios/${id}`, { method: 'DELETE' });
    },
  },

  // Configuración del colegio del JWT (Rector/Admin). Para "Construye tu Institución".
  colegio: {
    getConfig(): Promise<{ nombre: string; logo_url: string | null; config: Record<string, unknown> }> {
      return request('/api/colegio/config');
    },
    patchConfig(patch: Record<string, unknown>): Promise<{ colegio_id: string; config: Record<string, unknown> }> {
      return request('/api/colegio/config', { method: 'PATCH', body: JSON.stringify(patch) });
    },
    /** Sube el escudo del colegio propio (PNG/JPG/WEBP → WebP 512px). */
    async subirEscudo(file: File): Promise<{ logo_url: string }> {
      const contentBase64 = await imagenAWebpBase64(file);
      return request('/api/colegio/logo', { method: 'POST', body: JSON.stringify({ contentBase64, contentType: 'image/webp' }) });
    },
  },

  institucion: {
    salonesBulk(grados: string[], cantidad: number, jornada_id: number | null): Promise<{ ok: true }> {
      return request('/api/institucion/salones/bulk', { method: 'POST', body: JSON.stringify({ grados, cantidad, jornada_id }) });
    },
    importarEstructura(): Promise<{ ok: true; grados: number; salones: number }> {
      return request('/api/institucion/importar-estructura', { method: 'POST' });
    },
    /** Sube el Manual de Convivencia (PDF). Si se pasa colegioId, opera sobre ese colegio (SuperAdmin). */
    async subirManual(file: File, colegioId?: string): Promise<{ manual_url: string }> {
      const contentBase64 = await archivoABase64(file);
      const q = colegioId ? `?colegio_id=${encodeURIComponent(colegioId)}` : '';
      return request(`/api/institucion/manual${q}`, { method: 'POST', body: JSON.stringify({ contentBase64, contentType: 'application/pdf' }) });
    },
    quitarManual(colegioId?: string): Promise<{ ok: true }> {
      const q = colegioId ? `?colegio_id=${encodeURIComponent(colegioId)}` : '';
      return request(`/api/institucion/manual${q}`, { method: 'DELETE' });
    },
  },

  gruposNotas: {
    list(qs: string): Promise<{ grupos: any[] }> {
      return request(`/api/grupos-notas?${qs}`);
    },
    crear(body: any): Promise<{ ok: true; grupos: any[]; creados: number }> {
      return request('/api/grupos-notas', { method: 'POST', body: JSON.stringify(body) });
    },
    editar(id: string, body: any): Promise<{ ok: true; grupo: any }> {
      return request(`/api/grupos-notas/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    },
    eliminar(id: string): Promise<{ ok: true; eliminados: number }> {
      return request(`/api/grupos-notas/${id}`, { method: 'DELETE' });
    },
  },

  asistencia: {
    roster(asignatura: string, grado: string, salon: string, fecha?: string): Promise<{ fecha: string; roster: AsistenciaRosterItem[] }> {
      return request(`/api/asistencia/roster${qs({ asignatura, grado, salon, fecha })}`);
    },
    marcar(body: { asignatura: string; grado: string; salon: string; fecha: string; estudiante_id: string; estado: AsistenciaEstado }): Promise<{ ok: true; estado: AsistenciaEstado; auto_excusa: boolean }> {
      return request('/api/asistencia/marcar', { method: 'POST', body: JSON.stringify(body) });
    },
    historial(asignatura: string, grado: string, salon: string, desde: string, hasta: string, estudiante_id?: string): Promise<AsistenciaHistorial> {
      return request(`/api/asistencia/historial${qs({ asignatura, grado, salon, desde, hasta, estudiante_id })}`);
    },
    quitar(body: { asignatura: string; grado: string; salon: string; fecha: string; estudiante_id: string }): Promise<{ ok: true }> {
      return request('/api/asistencia/quitar', { method: 'POST', body: JSON.stringify(body) });
    },
    clases(): Promise<{ clases: { asignatura: string; grado: string; salon: string }[] }> {
      return request('/api/asistencia/clases');
    },
  },

  estadisticas: {
    meta(): Promise<ApiMeta> {
      return request<ApiMeta>('/api/estadisticas/meta');
    },
    institucional(periodo: number | 'anual'): Promise<ApiInstitucional> {
      return request<ApiInstitucional>(`/api/estadisticas/institucional${qs({ periodo })}`);
    },
    grado(grado: string, periodo: number | 'anual'): Promise<ApiGrado> {
      return request<ApiGrado>(`/api/estadisticas/grado${qs({ grado, periodo })}`);
    },
    salon(grado: string, salon: string, periodo: number | 'anual'): Promise<ApiSalon> {
      return request<ApiSalon>(`/api/estadisticas/salon${qs({ grado, salon, periodo })}`);
    },
    estudiante(id: string, periodo: number | 'anual'): Promise<ApiEstudianteStats> {
      return request<ApiEstudianteStats>(`/api/estadisticas/estudiante${qs({ id, periodo })}`);
    },
    asignatura(asignatura: string, periodo: number | 'anual', grado?: string, salon?: string): Promise<ApiAsignatura> {
      return request<ApiAsignatura>(`/api/estadisticas/asignatura${qs({ asignatura, periodo, grado, salon })}`);
    },
    riesgo(periodo: number | 'anual', umbral?: number, grado?: string, salon?: string, asignatura?: string): Promise<ApiRiesgo> {
      return request<ApiRiesgo>(`/api/estadisticas/riesgo${qs({ periodo, umbral, grado, salon, asignatura })}`);
    },
    consolidadoGrupo(grado: string, salon: string, periodo: number): Promise<ApiConsolidadoGrupo> {
      return request<ApiConsolidadoGrupo>(`/api/consolidado-grupo${qs({ grado, salon, periodo })}`);
    },
  },
  entrevistas: {
    reprogramar(body: { solicitud_id: number; fecha: string; hora: string; fecha_texto?: string }): Promise<{ ok: true }> {
      return request('/api/entrevistas/reprogramar', { method: 'POST', body: JSON.stringify(body) });
    },
  },
  orientacion: {
    notificarSeguimiento(body: { estudiante_id: number | string; grado: string; salon: string; texto: string }): Promise<{ ok: true; enviados: number }> {
      return request('/api/orientacion/notificar-seguimiento', { method: 'POST', body: JSON.stringify(body) });
    },
    contactoEstudiante(estudiante_id: number | string): Promise<{ estudiante_telefono: string; acudientes: { nombre: string; telefono: string }[] }> {
      return request(`/api/orientacion/contacto-estudiante${qs({ estudiante_id })}`);
    },
    remisionRecibida(remision_id: number): Promise<{ ok: true; recibido_por_nombre: string }> {
      return request('/api/orientacion/remision-recibida', { method: 'POST', body: JSON.stringify({ remision_id }) });
    },
  },
};

export { request as apiRequest };
