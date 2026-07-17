import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import normiImg from "@/assets/normi-recuperacion.webp";

/**
 * Normi flotante que recuerda configurar un método de recuperación de
 * contraseña. Aparece en TODAS las páginas (fija: baja con el scroll) para
 * cualquier usuario logueado que no tenga NI pregunta secreta NI correo de
 * recuperación. Se puede cerrar con la equis, pero solo por esa sesión:
 * el cierre queda amarrado al JWT vigente (sessionStorage), así que al
 * volver a iniciar sesión Normi insiste de nuevo. Se oculta únicamente en
 * /perfil (la página donde se configura).
 */
const DISMISS_KEY = "normi_rec_dismiss";

// Cerrado solo si la marca guardada corresponde al JWT de ESTA sesión.
const estaCerrado = () => {
  try { return sessionStorage.getItem(DISMISS_KEY) === localStorage.getItem("normi_jwt"); }
  catch { return false; }
};

const NormiRecordatorioRecuperacion = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sinMetodo, setSinMetodo] = useState(false);
  const [cerrado, setCerrado] = useState(estaCerrado);

  const enPerfil = location.pathname.startsWith("/perfil");

  // Un login nuevo cambia el JWT y la marca deja de coincidir: reaparece.
  useEffect(() => { setCerrado(estaCerrado()); }, [location.pathname]);

  const cerrar = (e: React.MouseEvent) => {
    e.stopPropagation();
    try { sessionStorage.setItem(DISMISS_KEY, localStorage.getItem("normi_jwt") || ""); } catch { /* noop */ }
    setCerrado(true);
  };

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

  if (!sinMetodo || enPerfil || cerrado) return null;

  return (
    <button
      onClick={() => navigate("/perfil?seccion=recuperacion")}
      className="fixed right-3 bottom-3 z-50 flex flex-col items-end gap-1 cursor-pointer text-left"
      title="Configurar recuperación de contraseña"
    >
      <span className="relative bg-card border border-border rounded-xl shadow-lg p-3 pr-7 text-xs leading-snug max-w-[210px]">
        No has configurado ningún método de recuperación de contraseña.{" "}
        <span className="font-semibold text-primary underline">Haz click aquí para hacerlo ahora mismo.</span>
        {/* Equis: cierra por esta sesión; al volver a entrar, Normi insiste */}
        <span
          role="button"
          aria-label="Cerrar recordatorio"
          onClick={cerrar}
          className="absolute top-1.5 right-1.5 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </span>
        {/* Colita del globo apuntando a Normi */}
        <span className="absolute -bottom-1.5 right-8 w-3 h-3 bg-card border-b border-r border-border rotate-45" />
      </span>
      <img src={normiImg} alt="Normi" className="h-24 object-contain drop-shadow-md" />
    </button>
  );
};

export default NormiRecordatorioRecuperacion;
