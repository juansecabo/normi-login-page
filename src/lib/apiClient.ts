/**
 * Cliente HTTP para el API de normi-server.
 *
 * - Maneja JWT auth: el token se guarda en localStorage["normi_jwt"]
 * - apiClient.auth.login() llama a POST /auth/login del backend
 * - Otras llamadas envían el JWT automáticamente como Bearer
 *
 * En adelante, queries que hoy hacen `supabase.from(...)` directo deben
 * pasar por endpoints REST que viven en normi-server para ocultar la DB.
 */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://normi-api.srv966880.hstgr.cloud';

const JWT_KEY = 'normi_jwt';

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

async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    // 401 → la sesión expiró; limpiar token y dejar que el caller redirija
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, body);
  }
  return body as T;
}

// ───────────────────────────────────────────────────────────────────────────
// Tipos compartidos con el server
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

export interface AuthUser {
  id: string;
  rol: AuthRol;
  nombres: string;
  apellidos: string;
  nivel?: string;
  grado?: string;
  salon?: string;
  hijos?: HijoData[];
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

// ───────────────────────────────────────────────────────────────────────────
// API surface
// ───────────────────────────────────────────────────────────────────────────

export const apiClient = {
  auth: {
    async login(cedula: string, contrasena: string): Promise<LoginResponse> {
      const res = await request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ cedula, contrasena }),
      });
      setToken(res.token);
      return res;
    },
    async me(): Promise<{ user: AuthUser }> {
      return request('/auth/me');
    },
    logout() {
      setToken(null);
    },
    getToken,
    isAuthenticated(): boolean {
      return getToken() !== null;
    },
  },
};

export { request as apiRequest };
