import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSession, isPadreDeFamilia, clearSession } from "@/hooks/useSession";
import { apiClient, apiRequest } from "@/lib/apiClient";

/**
 * Enlaces cortos de los avisos de WhatsApp (mundonormi.com/e/274, /x/3124…).
 * La letra dice qué es (entrevista, salida, excusa…) y el número es el id del
 * registro, único en toda la tabla: no se repite entre colegios.
 * Sin sesión: al login y, al entrar, de vuelta a este mismo enlace.
 * Con sesión: el server dice si el perfil abierto sirve para ese registro; si
 * es de otro perfil de la misma persona (otro colegio, o acudiente/personal),
 * cambia a ese perfil sin pedir contraseña y vuelve aquí. Luego lleva a la
 * pantalla que corresponde con el elemento abierto (?abrir=ID).
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
  const [ajeno, setAjeno] = useState(false);

  useEffect(() => {
    const aqui = window.location.pathname;
    if (!getSession().id) {
      navigate(`/?redirect=${encodeURIComponent(aqui)}`, { replace: true });
      return;
    }
    const limpio = id.replace(/\D/g, "");
    const ir = () => navigate(DESTINOS[tipo](limpio, isPadreDeFamilia()), { replace: true });
    if (!limpio) { ir(); return; }

    (async () => {
      try {
        const r = await apiRequest<{ estado: "ok" | "cambiar" | "ajeno"; colegio_id?: string; rol?: string }>(`/api/enlace/${tipo}/${limpio}`);
        if (r.estado === "ok") { ir(); return; }
        if (r.estado === "ajeno") { setAjeno(true); return; }
        // Otro perfil suyo: el login lo elige solo y vuelve a este enlace.
        const sp = await apiClient.auth.switchProfile();
        if ("onlyOne" in sp) { ir(); return; }
        clearSession();
        navigate(`/?redirect=${encodeURIComponent(aqui)}`, {
          replace: true,
          state: { memberships: sp.memberships, elegir: { colegio_id: r.colegio_id, rol: r.rol } },
        });
      } catch {
        ir();
      }
    })();
  }, [tipo, id, navigate]);

  if (!ajeno) return null;
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-card border border-border rounded-xl p-6 text-center space-y-4">
        <p className="font-semibold text-foreground">Este enlace no corresponde a tu perfil</p>
        <p className="text-sm text-muted-foreground">Es de otro colegio o de un registro que no te toca revisar.</p>
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium"
        >
          Ir al inicio
        </button>
      </div>
    </div>
  );
};

export default EnlaceCorto;
