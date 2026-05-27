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
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    if (res.status === 401 && !opts?.useTempToken) setToken(null);
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

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
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
  },

  plataforma: {
    colegios(): Promise<{ colegios: ColegioPlataforma[] }> {
      return request<{ colegios: ColegioPlataforma[] }>('/api/plataforma/colegios');
    },
    async uploadColegioLogo(colegio_id: string, file: File): Promise<{ logo_url: string }> {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const result = r.result as string;
          resolve(result.split(',')[1] || '');
        };
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      return request<{ logo_url: string }>('/api/plataforma/colegio/logo', {
        method: 'POST',
        body: JSON.stringify({ colegio_id, contentBase64, contentType: file.type }),
      });
    },
    entrarComoAdmin(colegio_id: string): Promise<{ ok: true; token: string; colegio: { id: string; nombre: string; slug: string } }> {
      return request(`/api/plataforma/entrar-como-admin/${colegio_id}`, { method: 'POST' });
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
  },
};

export { request as apiRequest };
