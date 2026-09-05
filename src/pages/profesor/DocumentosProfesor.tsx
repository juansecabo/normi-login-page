import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isProfesor } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import ListaComunicados from "@/components/ListaComunicados";
import { markLastSeen } from "@/utils/notificaciones";
import { NIVEL_DE_GRADO } from "@/utils/grados";

import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
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
  id: string | null;
  id_destinatarios: string[] | null;
  grupo_comunicado_id: number | null;
}

const DocumentosProfesor = () => {
  const navigate = useNavigate();
  const [documentos, setDocumentos] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isProfesor()) {
      navigate("/");
      return;
    }

    const cargar = async () => {
      try {
        // Misma logica que ComunicadosProfesor — un comunicado con archivo es un
        // documento; el filtro de visibilidad debe ser identico.
        const { data: asignaciones } = await supabase
          .from('Asignación Profesores')
          .select('"Grado(s)", "Salon(es)"')
          .eq('id', parseInt(session.id!));

        const rows = (asignaciones || []).map(row => ({
          grados: ((row["Grado(s)"] as string[] | null) || []),
          salones: ((row["Salon(es)"] as string[] | null) || []),
        }));

        const { data, error } = await supabase
          .from('Comunicados')
          .select('*')
          .not('archivo_url', 'is', null)
          .overlaps('perfil', ['Profesores'])
          .order('fecha', { ascending: false });

        if (!error && data) {
          const filtrados = data.filter((c: Comunicado) => {
            if (c.id_destinatarios && c.id_destinatarios.length > 0) {
              return c.id_destinatarios.includes(String(session.id));
            }
            if (c.id && c.id !== session.id) return false;
            const grados = c.grados ?? (c.grado ? [c.grado] : null);
            const salones = c.salones ?? (c.salon ? [c.salon] : null);
            if (grados || salones || c.nivel) {
              const algunaFilaMatch = rows.some(r => {
                if (grados && !grados.some(g => r.grados.includes(g))) return false;
                if (salones && !salones.some(s => r.salones.includes(s))) return false;
                if (c.nivel) {
                  if (!r.grados.some(g => NIVEL_DE_GRADO[g] === c.nivel)) return false;
                }
                return true;
              });
              if (!algunaFilaMatch) return false;
            }
            return true;
          });
          // Dedup por grupo_comunicado_id
          const seen = new Set<number>();
          const dedup = filtrados.filter((c: Comunicado) => {
            const key = c.grupo_comunicado_id ?? c.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setDocumentos(dedup);
          const maxId = dedup.length > 0 ? Math.max(...dedup.map((c: Comunicado) => c.id)) : 0;
          if (maxId > 0) markLastSeen('documentos', session.id!, maxId);
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
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Documentos Recibidos</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
            Documentos Recibidos
          </h2>
          <ListaComunicados comunicados={documentos} loading={loading} showDocumentLink />
        </div>
      </main>
    </div>
  );
};

export default DocumentosProfesor;
