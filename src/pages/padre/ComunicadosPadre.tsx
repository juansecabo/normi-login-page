import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isPadreDeFamilia } from "@/hooks/useSession";
import HeaderNormy from "@/components/HeaderNormy";
import ListaComunicados from "@/components/ListaComunicados";
import { markLastSeen } from "@/utils/notificaciones";

interface Comunicado {
  id: number;
  remitente: string;
  destinatarios: string;
  mensaje: string;
  fecha: string;
  archivo_url: string | null;
  perfil: string[] | null;
  nivel: string | null;
  grado: string | null;
  salon: string | null;
  grados: string[] | null;
  salones: string[] | null;
  codigo_estudiantil: string | null;
  id_destinatarios: string[] | null;
  grupo_comunicado_id: number | null;
}

const ComunicadosPadre = () => {
  const navigate = useNavigate();
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (!session.codigo || !isPadreDeFamilia()) {
      navigate("/");
      return;
    }

    const hijos = session.hijos || [];

    const cargar = async () => {
      try {
        const { data, error } = await supabase
          .from('Comunicados')
          .select('*')
          .overlaps('perfil', ['Padres de familia'])
          .order('fecha', { ascending: false });

        if (!error && data) {
          const norm = (s: string) =>
            s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

          const filtrados = data.filter((c: Comunicado) => {
            const matchIds =
              (c.id_destinatarios && c.id_destinatarios.length > 0 &&
                hijos.some(h => c.id_destinatarios!.includes(String(h.codigo)))) ||
              (c.codigo_estudiantil && hijos.some(h => h.codigo === c.codigo_estudiantil)) ||
              // Fallback: el AI a veces olvida poblar id_destinatarios aunque el
              // texto diga "estudiante con código X" — extraemos el código del texto.
              hijos.some(h => {
                if (!h.codigo) return false;
                const cod = String(h.codigo);
                return new RegExp(`\\b${cod}\\b`).test(c.destinatarios || "");
              });

            // Normalizar grado/salon a arrays (preferir nuevas columnas grados/salones)
            const grados = c.grados ?? (c.grado ? [c.grado] : null);
            const salones = c.salones ?? (c.salon ? [c.salon] : null);

            const matchAula =
              (c.nivel || grados || salones) &&
              hijos.some(h => {
                if (c.nivel && c.nivel !== h.nivel) return false;
                if (grados && !grados.includes(h.grado)) return false;
                if (salones && !salones.includes(h.salon)) return false;
                return true;
              });

            if (matchIds || matchAula) return true;

            const noHayFiltros =
              (!c.id_destinatarios || c.id_destinatarios.length === 0) &&
              !c.codigo_estudiantil && !c.nivel && !grados && !salones;
            if (!noHayFiltros) return false;

            const destLower = (c.destinatarios || "").trim().toLowerCase();
            if (destLower === "padres de familia") return true;
            const destNorm = norm(c.destinatarios || "");
            return hijos.some(h => {
              if (!h.nombre || !h.apellidos) return false;
              const nombreNorm = norm(h.nombre);
              const apellidosParts = norm(h.apellidos).split(/\s+/).filter(p => p.length > 2);
              const hasNombre = nombreNorm.length > 0 && destNorm.includes(nombreNorm);
              const hasApellido = apellidosParts.some(p => destNorm.includes(p));
              return hasNombre && hasApellido;
            });
          });
          // Dedup por grupo_comunicado_id
          const seen = new Set<number>();
          const dedup = filtrados.filter((c: Comunicado) => {
            const key = c.grupo_comunicado_id ?? c.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setComunicados(dedup);
          const maxId = Math.max(...dedup.map((c: Comunicado) => c.id), 0);
          markLastSeen('comunicados', session.codigo!, maxId);
        }
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard-padre" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard-padre")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Comunicados</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
            Comunicados
          </h2>
          <ListaComunicados comunicados={comunicados} loading={loading} showDocumentLink />
        </div>
      </main>
    </div>
  );
};

export default ComunicadosPadre;
