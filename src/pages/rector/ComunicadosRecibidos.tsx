import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import ListaComunicados from "@/components/ListaComunicados";
import { markLastSeen } from "@/utils/notificaciones";

import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
interface Comunicado {
  id: number;
  remitente: string;
  destinatarios: string;
  mensaje: string;
  fecha: string;
  archivo_url: string | null;
  perfil: string[] | null;
  id_destinatarios: string[] | null;
  grupo_comunicado_id: number | null;
}

const perfilesDelCargo = (cargo: string | undefined): string[] => {
  switch (cargo) {
    case 'Rector': return ['Rector'];
    case 'Coordinador(a)': return ['Coordinadores'];
    case 'Administrativo(a)': return ['Administrativos'];
    case 'Secretaria General': return ['Secretaria General'];
    // El orientador tiene perfil propio; en la DB aparece como 'Orientador(a) Escolar'
    // (envío individual) y 'Orientadores' (envío masivo a internos). Incluir ambos.
    case 'Orientador(a) Escolar': return ['Orientador(a) Escolar', 'Orientadores'];
    case 'Portero': return ['Portero', 'Porteros'];
    default: return [];
  }
};

const ComunicadosRecibidos = () => {
  const navigate = useNavigate();
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (!session.id) {
      navigate("/");
      return;
    }

    const perfiles = perfilesDelCargo(session.cargo);
    if (perfiles.length === 0) {
      navigate("/dashboard");
      return;
    }

    const cargar = async () => {
      try {
        const { data, error } = await supabase
          .from('Comunicados')
          .select('*')
          .overlaps('perfil', perfiles)
          .order('fecha', { ascending: false });

        if (!error && data) {
          const filtrados = data.filter((c: Comunicado) => {
            if (c.id_destinatarios && c.id_destinatarios.length > 0) {
              return c.id_destinatarios.includes(String(session.id));
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
          setComunicados(dedup);
          const maxId = dedup.length > 0 ? Math.max(...dedup.map((c: Comunicado) => c.id)) : 0;
          if (maxId > 0) markLastSeen('comunicados', session.id!, maxId);
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
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Comunicados Recibidos</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
            Comunicados Recibidos
          </h2>
          <ListaComunicados comunicados={comunicados} loading={loading} showDocumentLink />
        </div>
      </main>
    </div>
  );
};

export default ComunicadosRecibidos;
