import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import normiImg from "@/assets/normi-placeholder.webp";

/**
 * Normi flotante que recuerda configurar un método de recuperación de
 * contraseña. Aparece en TODAS las páginas (fija: baja con el scroll) para
 * cualquier usuario logueado que no tenga NI pregunta secreta NI correo de
 * recuperación, y solo desaparece cuando configura alguno. No se puede
 * cerrar. Se oculta únicamente en /perfil (la página donde se configura).
 * En los dashboards va arriba a la derecha; en el resto, abajo a la derecha
 * (nunca tapa el centro).
 */
const NormiRecordatorioRecuperacion = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sinMetodo, setSinMetodo] = useState(false);

  const enPerfil = location.pathname.startsWith("/perfil");
  const esDashboard = location.pathname.startsWith("/dashboard");

  useEffect(() => {
    const s = getSession();
    if (!s.id) { setSinMetodo(false); return; }
    let vivo = true;
    // recuperacion_pregunta y correo son los dos métodos posibles; con
    // cualquiera de los dos configurado, Normi desaparece.
    supabase.from("Usuarios").select("recuperacion_pregunta, correo").eq("id", s.id).maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        const u = data as { recuperacion_pregunta?: string | null; correo?: string | null } | null;
        setSinMetodo(!!u && !String(u.recuperacion_pregunta || "").trim() && !String(u.correo || "").trim());
      })
      .catch(() => { /* sin red: no molestar */ });
    return () => { vivo = false; };
  }, [location.pathname]);

  if (!sinMetodo || enPerfil) return null;

  return (
    <button
      onClick={() => navigate("/perfil?seccion=recuperacion")}
      className={`fixed right-3 z-50 flex flex-col items-end gap-1 cursor-pointer text-left ${esDashboard ? "top-20" : "bottom-3"}`}
      title="Configurar recuperación de contraseña"
    >
      <span className="relative bg-card border border-border rounded-xl shadow-lg p-3 text-xs leading-snug max-w-[210px]">
        No has configurado ningún método de recuperación de contraseña.{" "}
        <span className="font-semibold text-primary underline">Haz click aquí para hacerlo ahora mismo.</span>
        {/* Colita del globo apuntando a Normi */}
        <span className="absolute -bottom-1.5 right-8 w-3 h-3 bg-card border-b border-r border-border rotate-45" />
      </span>
      <img src={normiImg} alt="Normi" className="h-24 object-contain drop-shadow-md" />
    </button>
  );
};

export default NormiRecordatorioRecuperacion;
