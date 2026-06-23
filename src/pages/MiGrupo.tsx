import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import { apiClient } from "@/lib/apiClient";
import HeaderNormi, { computeBackLinkFromSession } from "@/components/HeaderNormi";
import AvatarUploader from "@/components/AvatarUploader";
import { Search, Users } from "lucide-react";

type Est = {
  id: string;
  grado: string;
  salon: string | null;
  avatar_url: string | null;
  nombres: string;
  apellidos: string;
};

/**
 * "Mi grupo": el director de grupo (preescolar/primaria sobre todo) ve la
 * cuadrícula de los estudiantes de su grupo y puede subir/cambiar la foto de
 * cada uno (los niños no entran a la plataforma a ponerse foto de perfil).
 * Los estudiantes se cargan por `Internos.direccion_de_grupo`, no por
 * asignación de clase. El permiso de edición lo valida el server.
 */
const MiGrupo = () => {
  const navigate = useNavigate();
  const [dirGrupo, setDirGrupo] = useState<string | null>(null);
  const [ests, setEsts] = useState<Est[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }

    const cargar = async () => {
      setLoading(true);
      const { data: interno } = await supabase
        .from("Internos")
        .select("direccion_de_grupo")
        .eq("id", parseInt(session.id!))
        .maybeSingle();
      const dg = ((interno as { direccion_de_grupo?: string } | null)?.direccion_de_grupo || "").trim() || null;
      setDirGrupo(dg);
      if (!dg) { setEsts([]); setLoading(false); return; }

      // Parsear "Séptimo 3" → grado + salón; "Transición" → solo el grado.
      const parts = dg.split(/\s+/);
      const last = parts[parts.length - 1];
      let grado = dg;
      let salon: string | null = null;
      if (parts.length > 1 && /^\d+$/.test(last)) { grado = parts.slice(0, -1).join(" "); salon = last; }

      let q = supabase.from("Estudiantes").select("id, grado, salon, avatar_url").eq("grado", grado);
      if (salon) q = q.eq("salon", salon);
      const { data } = await q;
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const enriched = sortByApellidosNombres(await enrichWithNombres((data || []) as Array<{ id: string | number }>));
      setEsts(enriched.map((e: any) => ({
        id: String(e.id),
        grado: e.grado,
        salon: e.salon ?? null,
        avatar_url: e.avatar_url ?? null,
        nombres: e.nombres || "",
        apellidos: e.apellidos || "",
      })));
      setLoading(false);
    };
    cargar();
  }, [navigate]);

  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return ests;
    return ests.filter((e) => `${e.apellidos} ${e.nombres}`.toLowerCase().includes(f));
  }, [ests, filtro]);

  const setAvatar = (id: string, url: string | null) =>
    setEsts((prev) => prev.map((e) => (e.id === id ? { ...e, avatar_url: url } : e)));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate(computeBackLinkFromSession())} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/direccion-grupo")} className="text-primary hover:underline">Dirección de grupo</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Fotos de mi grupo</span>
          </div>
        </div>

        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-1 text-center">Fotos de mi grupo</h2>
          <p className="text-sm text-muted-foreground mb-5 text-center">
            Toca a cada estudiante para subir o cambiar su foto.
          </p>

          {loading ? (
            <p className="text-center text-muted-foreground py-10">Cargando…</p>
          ) : !dirGrupo ? (
            <div className="text-center text-muted-foreground py-10 flex flex-col items-center gap-2">
              <Users className="w-8 h-8 opacity-40" />
              No eres director de grupo de ningún salón.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                  <Users className="w-4 h-4" /> {dirGrupo}
                </span>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar estudiante…"
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm w-52" />
                </div>
              </div>

              {visibles.length === 0 ? (
                <p className="text-center text-muted-foreground py-10">No hay estudiantes en este grupo.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
                  {visibles.map((e) => (
                    <div key={e.id} className="flex flex-col items-center gap-2">
                      <AvatarUploader
                        width={96}
                        height={120}
                        target={{
                          avatarUrl: e.avatar_url,
                          nombres: e.nombres,
                          apellidos: e.apellidos,
                          onUpload: (file) => apiClient.auth.uploadAvatarEstudiante(e.id, file).then((r) => r.avatar_url),
                          onDelete: () => apiClient.auth.deleteAvatarEstudiante(e.id).then(() => undefined),
                          onChange: (url) => setAvatar(e.id, url),
                        }}
                      />
                      <span className="text-sm text-center text-foreground font-medium leading-tight">
                        {e.apellidos} {e.nombres}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default MiGrupo;
