import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSession, isPadreDeFamilia } from "@/hooks/useSession";

/**
 * Enlaces cortos de los avisos de WhatsApp (mundonormi.com/e/274, /x/3124…).
 * Sin sesión: al login y, al entrar, de vuelta a este mismo enlace.
 * Con sesión: lleva a la pantalla que corresponde según quién lo abre, con el
 * elemento abierto (?abrir=ID). No salta ningún permiso: cada pantalla sigue
 * mostrando solo lo que esa persona puede ver.
 */
const DESTINOS: Record<string, (id: string, acudiente: boolean) => string> = {
  // Entrevista: el acudiente confirma; el personal ve la solicitud en su día.
  e: (id, acu) => (acu ? `/solicitud-entrevista?abrir=${id}` : `/permisos-excusas/entrevista-staff?vista=creadas&abrir=${id}`),
  // Permiso de salida (retiro).
  s: (id, acu) => (acu ? `/permisos-excusas/retiro?abrir=${id}` : `/permisos-excusas/retiro-staff?abrir=${id}`),
  // Excusa por inasistencia y por uniforme (las revisa el personal).
  x: (id) => `/permisos-excusas/inasistencia-staff?abrir=${id}`,
  u: (id) => `/permisos-excusas/uniforme-staff?abrir=${id}`,
  // Permiso docente.
  p: (id) => `/formatos/permisos-docentes?abrir=${id}`,
  // Ponte al día con los boletines y resumen diario de entregas (sin número).
  b: () => `/boletines/ponte-al-dia`,
  t: () => `/profesor/programar-actividad?v=actividades&entregas=1`,
};

const EnlaceCorto = ({ tipo }: { tipo: keyof typeof DESTINOS }) => {
  const navigate = useNavigate();
  const { id = "" } = useParams();

  useEffect(() => {
    if (!getSession().id) {
      navigate(`/?redirect=${encodeURIComponent(window.location.pathname)}`, { replace: true });
      return;
    }
    const limpio = id.replace(/\D/g, "");
    navigate(DESTINOS[tipo](limpio, isPadreDeFamilia()), { replace: true });
  }, [tipo, id, navigate]);

  return null;
};

export default EnlaceCorto;
