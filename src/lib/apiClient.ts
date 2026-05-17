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
  | 'Administrador' | 'Rector' | 'Coordinador(a)' | 'Administrativo(a)'
  | 'Secretaria General' | 'Orientador(a) Escolar' | 'Profesor(a)'
  | 'Estudiante' | 'Padre de familia';

export interface HijoData {
  id: string;
  nombre: string;
  apellidos: string;
  nivel: string;
  grado: string;
  salon: string;
}

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
  hijos?: HijoData[];
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

    logout() {
      setToken(null);
      setTempToken(null);
    },

    getToken,
    isAuthenticated(): boolean {
      return getToken() !== null;
    },
  },
};

export { request as apiRequest };
