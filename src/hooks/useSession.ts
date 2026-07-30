import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';

// Función para obtener el dominio base para cookies compartidas
const getCookieDomain = (): string | undefined => {
  const hostname = window.location.hostname;
  if (hostname.includes('lovable.app')) {
    return '.lovable.app';
  }
  return undefined;
};

const getCookieOptions = () => {
  const domain = getCookieDomain();
  return {
    ...(domain ? { domain } : {}),
    sameSite: 'lax' as const,
    secure: window.location.protocol === 'https:'
  };
};

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

export interface SessionData {
  id: string | null;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  nivel: string | null;
  grado: string | null;
  salon: string | null;
  acudidos: AcudidoData[] | null;
  multi_membership: boolean;
  /** True si el usuario aún no tiene contraseña (entró con id/id). */
  sin_contrasena: boolean;
  avatar_url: string | null;
  // Branding y aislamiento del colegio donde el usuario está autenticado.
  // Se usa en PDFs/Excels exportados y en cualquier UI institucional.
  colegio_id: string | null;
  colegio_nombre: string | null;
  colegio_logo_url: string | null;
  colegio_slug: string | null;
  /** Género de la persona (Usuarios.genero): "M", "F" o null si no tiene. */
  genero: string | null;
}

/** Saludo de bienvenida según el género: Bienvenido / Bienvenida / Bienvenido(a). */
export const bienvenida = (genero?: string | null): string =>
  genero === "M" ? "Bienvenido" : genero === "F" ? "Bienvenida" : "Bienvenido(a)";

// Evita repetir la consulta a /auth/me en cada montaje cuando la persona
// realmente no tiene género registrado (una vez por pestaña basta).
let generoBackfillHecho = false;

/**
 * Saludo de bienvenida reactivo. Si la sesión abierta aún no tiene el género
 * guardado (sesiones iniciadas antes de que el login lo incluyera), lo trae
 * una vez de /auth/me, lo guarda y actualiza el saludo sin re-login.
 */
export const useBienvenida = (): string => {
  const [genero, setGenero] = useState<string | null>(() => localStorage.getItem("genero"));

  useEffect(() => {
    if (genero || generoBackfillHecho) return;
    if (!Cookies.get(SESSION_COOKIE) || !localStorage.getItem("id")) return;
    generoBackfillHecho = true;
    import("@/lib/apiClient").then(({ apiClient }) =>
      apiClient.auth.me().then(({ user }) => {
        const g = (user as any)?.genero;
        if (g === "M" || g === "F") {
          localStorage.setItem("genero", g);
          setGenero(g);
        }
      }),
    ).catch(() => { /* sin red o sesión inválida: se queda el neutro */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return bienvenida(genero);
};

// Cookie de sesión (sin expires → muere cuando el navegador se cierra)
const SESSION_COOKIE = 'normi_session_active';

export const saveSession = (
  id: string,
  nombres: string,
  apellidos: string,
  cargo: string = 'Profesor(a)',
  nivel?: string | null,
  grado?: string | null,
  salon?: string | null,
  acudidos?: AcudidoData[] | null,
  multi_membership: boolean = false,
  avatar_url?: string | null,
  colegio_id?: string | null,
  colegio_nombre?: string | null,
  colegio_logo_url?: string | null,
  colegio_slug?: string | null,
  genero?: string | null,
) => {
  const cookieOptions = getCookieOptions();

  // Guardar datos en localStorage (persiste entre pestañas)
  localStorage.setItem("id", id);
  localStorage.setItem("nombres", nombres);
  localStorage.setItem("apellidos", apellidos);
  localStorage.setItem("cargo", cargo);

  if (nivel) localStorage.setItem("nivel", nivel);
  else localStorage.removeItem("nivel");

  if (grado) localStorage.setItem("grado", grado);
  else localStorage.removeItem("grado");

  if (salon) localStorage.setItem("salon", salon);
  else localStorage.removeItem("salon");

  if (acudidos && acudidos.length > 0) {
    localStorage.setItem("acudidos", JSON.stringify(acudidos));
  } else {
    localStorage.removeItem("acudidos");
  }
  // Limpiar clave legacy si existía.
  localStorage.removeItem("hijos");

  if (multi_membership) localStorage.setItem("multi_membership", "1");
  else localStorage.removeItem("multi_membership");

  if (avatar_url) localStorage.setItem("avatar_url", avatar_url);
  else localStorage.removeItem("avatar_url");

  if (colegio_id) localStorage.setItem("colegio_id", colegio_id);
  else localStorage.removeItem("colegio_id");
  if (colegio_nombre) localStorage.setItem("colegio_nombre", colegio_nombre);
  else localStorage.removeItem("colegio_nombre");
  if (colegio_logo_url) localStorage.setItem("colegio_logo_url", colegio_logo_url);
  else localStorage.removeItem("colegio_logo_url");
  if (colegio_slug) localStorage.setItem("colegio_slug", colegio_slug);
  else localStorage.removeItem("colegio_slug");
  if (genero === "M" || genero === "F") localStorage.setItem("genero", genero);
  else localStorage.removeItem("genero");

  // Cookie de sesión sin expires → se borra al cerrar el navegador
  Cookies.set(SESSION_COOKIE, '1', cookieOptions);

  // Salvaguarda: si NO es Administrador, eliminar cualquier backup de
  // SuperAdmin que pudiera haber quedado en sessionStorage (de una
  // impersonación anterior). El backup solo es válido cuando un Admin
  // está operando dentro de un colegio en nombre del SuperAdmin.
  if (cargo !== 'Administrador') {
    try {
      sessionStorage.removeItem('normi_jwt_sa_backup');
      sessionStorage.removeItem('normi_session_sa_backup');
    } catch {}
  }
};

export const getSession = (): SessionData => {
  // Si la cookie de sesión no existe, el navegador se reinició → limpiar todo
  if (!Cookies.get(SESSION_COOKIE)) {
    localStorage.removeItem("id");
    localStorage.removeItem("nombres");
    localStorage.removeItem("apellidos");
    localStorage.removeItem("cargo");
    localStorage.removeItem("nivel");
    localStorage.removeItem("grado");
    localStorage.removeItem("salon");
    localStorage.removeItem("acudidos");
    localStorage.removeItem("hijos"); // legacy
    localStorage.removeItem("multi_membership");
    localStorage.removeItem("avatar_url");
    localStorage.removeItem("colegio_id");
    localStorage.removeItem("colegio_nombre");
    localStorage.removeItem("colegio_logo_url");
    localStorage.removeItem("colegio_slug");
    localStorage.removeItem("genero");
    return { id: null, nombres: null, apellidos: null, cargo: null, nivel: null, grado: null, salon: null, acudidos: null, multi_membership: false, sin_contrasena: false, avatar_url: null, colegio_id: null, colegio_nombre: null, colegio_logo_url: null, colegio_slug: null, genero: null };
  }

  const id = localStorage.getItem("id") || null;
  const nombres = localStorage.getItem("nombres") || null;
  const apellidos = localStorage.getItem("apellidos") || null;
  const cargo = localStorage.getItem("cargo") || null;
  const nivel = localStorage.getItem("nivel") || null;
  const grado = localStorage.getItem("grado") || null;
  const salon = localStorage.getItem("salon") || null;
  const multi_membership = localStorage.getItem("multi_membership") === "1";
  const sin_contrasena = localStorage.getItem("sin_contrasena") === "1";
  const avatar_url = localStorage.getItem("avatar_url") || null;
  const colegio_id = localStorage.getItem("colegio_id") || null;
  const colegio_nombre = localStorage.getItem("colegio_nombre") || null;
  const colegio_logo_url = localStorage.getItem("colegio_logo_url") || null;
  const colegio_slug = localStorage.getItem("colegio_slug") || null;
  const genero = localStorage.getItem("genero") || null;

  let acudidos: AcudidoData[] | null = null;
  // Lee "acudidos" primero; si no existe, intenta "hijos" (clave legacy de
  // sesiones guardadas antes del rename).
  const acudidosStr = localStorage.getItem("acudidos") || localStorage.getItem("hijos");
  if (acudidosStr) {
    try { acudidos = JSON.parse(acudidosStr); } catch { acudidos = null; }
  }

  return { id, nombres, apellidos, cargo, nivel, grado, salon, acudidos, multi_membership, sin_contrasena, avatar_url, colegio_id, colegio_nombre, colegio_logo_url, colegio_slug, genero };
};

/** Actualiza solo el avatar en la sesion local (sin tocar el resto). */
export const updateSessionAvatar = (avatar_url: string | null) => {
  if (avatar_url) localStorage.setItem("avatar_url", avatar_url);
  else localStorage.removeItem("avatar_url");
};

// ───── SuperAdmin impersonation ─────
// Cuando el SuperAdmin entra a un colegio, su JWT + sesion original se
// respaldan en sessionStorage (persisten F5 pero se pierden al cerrar
// pestana, que es lo deseado).
const SA_JWT_BACKUP = 'normi_jwt_sa_backup';
const SA_SESSION_BACKUP = 'normi_session_sa_backup';
const JWT_KEY = 'normi_jwt';

/** Llamar antes de reemplazar el JWT con uno de Admin del colegio elegido. */
export const guardarSesionSuperAdmin = () => {
  try {
    const tok = localStorage.getItem(JWT_KEY);
    if (tok) sessionStorage.setItem(SA_JWT_BACKUP, tok);
    const snap: Record<string, string | null> = {
      id: localStorage.getItem('id'),
      nombres: localStorage.getItem('nombres'),
      apellidos: localStorage.getItem('apellidos'),
      cargo: localStorage.getItem('cargo'),
      avatar_url: localStorage.getItem('avatar_url'),
      multi_membership: localStorage.getItem('multi_membership'),
    };
    sessionStorage.setItem(SA_SESSION_BACKUP, JSON.stringify(snap));
  } catch {}
};

/** Decodifica el payload de un JWT sin verificar firma. Solo para chequear
 *  campos no sensibles (rol). El server siempre re-valida con la firma. */
const decodeJwtPayload = (tok: string): { rol?: string; sub?: string; colegio_id?: string } | null => {
  try {
    const parts = tok.split('.');
    if (parts.length !== 3) return null;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch { return null; }
};

/** Cédula del único SuperAdmin actual. Si en el futuro se agregan más,
 *  mover esto a la tabla Usuarios con un flag o a una env var. */
const SUPERADMIN_CEDULAS = ['1103114625'];

/** Indica si la sesion actual es una impersonacion ACTIVA de SuperAdmin →
 *  Admin de un colegio. Para que devuelva true se requieren TODAS:
 *    1. La sesion actual en localStorage es cargo === 'Administrador'.
 *    2. El id (cédula) de la sesion actual está en la lista de SuperAdmins.
 *    3. Existe un backup en sessionStorage cuyo JWT tiene rol SuperAdmin
 *       y cuyo sub coincide con el id actual (misma persona).
 *
 *  Si falta cualquiera de las tres, NO es impersonación válida y el botón
 *  no debe mostrarse. Limpia el backup automáticamente si detecta basura. */
export const haySesionSuperAdminRespaldada = (): boolean => {
  try {
    const cargoActual = localStorage.getItem('cargo');
    const idActual = localStorage.getItem('id');

    // Check de SOLO LECTURA: NO borra el backup. Antes lo borraba aquí, lo que
    // causaba un bug: durante la impersonación el backup se crea mientras el
    // cargo todavía es 'SuperAdmin' (seguimos en /dashboard-plataforma); un
    // re-render intermedio entraba a esta rama y borraba el backup recién
    // creado, así que al llegar al colegio ya no existía. La limpieza de
    // backups huérfanos la hacen clearSession (logout) y saveSession (al entrar
    // a un perfil que no sea Administrador).
    if (cargoActual !== 'Administrador' || !idActual || !SUPERADMIN_CEDULAS.includes(idActual)) {
      return false;
    }
    const tok = sessionStorage.getItem(SA_JWT_BACKUP);
    if (!tok) return false;
    const payload = decodeJwtPayload(tok);
    // El JWT respaldado debe ser SuperAdmin Y de la misma persona que opera ahora.
    return payload?.rol === 'SuperAdmin' && payload?.sub === idActual;
  } catch { return false; }
};

/** Restaura la sesion del SuperAdmin (revierte impersonacion). */
export const restaurarSesionSuperAdmin = (): boolean => {
  try {
    const tok = sessionStorage.getItem(SA_JWT_BACKUP);
    const snapStr = sessionStorage.getItem(SA_SESSION_BACKUP);
    if (!tok || !snapStr) return false;
    // Validar que el JWT respaldado realmente sea de un SuperAdmin antes
    // de restaurarlo. Si no, descartarlo silenciosamente (era basura de un
    // logout defectuoso anterior).
    const payload = decodeJwtPayload(tok);
    if (payload?.rol !== 'SuperAdmin') {
      sessionStorage.removeItem(SA_JWT_BACKUP);
      sessionStorage.removeItem(SA_SESSION_BACKUP);
      return false;
    }
    const snap = JSON.parse(snapStr) as Record<string, string | null>;
    localStorage.setItem(JWT_KEY, tok);
    for (const k of ['id', 'nombres', 'apellidos', 'cargo', 'avatar_url', 'multi_membership']) {
      const v = snap[k];
      if (v === null || v === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
    // Limpiar campos que no aplican a SuperAdmin
    localStorage.removeItem('nivel');
    localStorage.removeItem('grado');
    localStorage.removeItem('salon');
    localStorage.removeItem('acudidos');
    localStorage.removeItem('hijos');
    sessionStorage.removeItem(SA_JWT_BACKUP);
    sessionStorage.removeItem(SA_SESSION_BACKUP);
    return true;
  } catch { return false; }
};

export const clearSession = () => {
  const cookieOptions = getCookieOptions();

  localStorage.removeItem("id");
  localStorage.removeItem("nombres");
  localStorage.removeItem("apellidos");
  localStorage.removeItem("cargo");
  localStorage.removeItem("nivel");
  localStorage.removeItem("grado");
  localStorage.removeItem("salon");
  localStorage.removeItem("acudidos");
  localStorage.removeItem("hijos"); // legacy
  localStorage.removeItem("multi_membership");
  localStorage.removeItem("avatar_url");
  localStorage.removeItem("asignaturaSeleccionada");
  localStorage.removeItem("gradoSeleccionado");
  localStorage.removeItem("salonSeleccionado");
  localStorage.removeItem("modoVisualizacion");
  localStorage.removeItem("estudianteSeleccionado");
  localStorage.removeItem("acudidoSeleccionado");
  localStorage.removeItem("hijoSeleccionado"); // legacy

  // Limpiar también el JWT del SuperAdmin (si quedó de una impersonación):
  // si no se limpia, un usuario distinto que se loguee después en la misma
  // pestaña podría darle "Volver a Plataforma" y escalar a SuperAdmin.
  try {
    sessionStorage.removeItem('normi_jwt_sa_backup');
    sessionStorage.removeItem('normi_session_sa_backup');
  } catch {}

  Cookies.remove(SESSION_COOKIE, cookieOptions);
};

export const hasValidSession = (): boolean => {
  const { id } = getSession();
  return !!id;
};

export const isAdmin = (): boolean => {
  const { cargo } = getSession();
  return cargo === 'Administrador';
};

export const isRectorOrCoordinador = (): boolean => {
  const { cargo } = getSession();
  return cargo === 'Rector'
    || cargo === 'Coordinador(a)'
    || cargo === 'Administrador'
    || cargo === 'Administrativo(a)'
    || cargo === 'Secretaria General'
    || cargo === 'Orientador(a) Escolar';
};

export const isAdministrativo = (): boolean => {
  const { cargo } = getSession();
  return cargo === 'Administrativo(a)';
};

export const isOrientador = (): boolean => {
  const { cargo } = getSession();
  return cargo === 'Orientador(a) Escolar';
};

// Cualquier rol con acceso al dashboard de gestión
// (rector, coordinador, admin, administrativo, secretaria general, orientador)
export const puedeAccederDashboard = (): boolean => {
  const { cargo } = getSession();
  return cargo === 'Rector'
    || cargo === 'Coordinador(a)'
    || cargo === 'Administrador'
    || cargo === 'Administrativo(a)'
    || cargo === 'Secretaria General'
    || cargo === 'Orientador(a) Escolar'
    || cargo === 'Portero';
};

export const isPortero = (): boolean => {
  const { cargo } = getSession();
  return cargo === 'Portero';
};

export const isProfesor = (): boolean => {
  const { cargo } = getSession();
  return cargo === 'Profesor(a)';
};

export const isEstudiante = (): boolean => {
  const { cargo } = getSession();
  return cargo === 'Estudiante';
};

export const isPadreDeFamilia = (): boolean => {
  const { cargo } = getSession();
  return cargo === 'Acudiente';
};
