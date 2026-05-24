import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Users, GraduationCap, UserCheck, Loader2 } from "lucide-react";
import HeaderNormi from "@/components/HeaderNormi";
import { getSession } from "@/hooks/useSession";
import { apiClient, type ColegioPlataforma } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Dashboard del SuperAdmin de plataforma. No esta atado a ningun colegio.
 * Fase 1: lista de colegios con conteos. Fases siguientes: CRUD, admins,
 * metricas, acceso directo.
 */
const DashboardPlataforma = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [colegios, setColegios] = useState<ColegioPlataforma[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Guard de sesion: si no es SuperAdmin redirigimos al login.
  useEffect(() => {
    const s = getSession();
    if (!s.id || s.cargo !== "SuperAdmin") {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    apiClient.plataforma.colegios()
      .then(({ colegios }) => setColegios(colegios))
      .catch((err) => {
        toast({
          title: "Error",
          description: err?.message || "No se pudieron cargar los colegios",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard-plataforma" />

      <main className="flex-1 container mx-auto p-6 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Building2 className="w-8 h-8 text-primary" />
              Panel de Plataforma
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestiona los colegios y administradores de Notas Normi.
            </p>
          </div>

          <section className="bg-card rounded-lg shadow-soft p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-foreground">Colegios</h2>
              <span className="text-sm text-muted-foreground">
                {colegios ? `${colegios.length} total` : ""}
              </span>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Cargando...
              </div>
            )}

            {!loading && colegios && colegios.length === 0 && (
              <p className="text-center text-muted-foreground py-12">
                Todavía no hay colegios. Crea el primero para comenzar.
              </p>
            )}

            {!loading && colegios && colegios.length > 0 && (
              <div className="space-y-3">
                {colegios.map((c) => (
                  <div
                    key={c.id}
                    className="border border-border rounded-lg p-4 flex items-center gap-4 hover:border-primary/40 transition-colors"
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: c.color_primario }}
                    >
                      {c.nombre.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate">{c.nombre}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          {c.plan}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            c.estado === "activo"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {c.estado}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">slug: {c.slug}</p>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> {c.counts.internos}
                        </span>
                        <span className="flex items-center gap-1">
                          <GraduationCap className="w-3.5 h-3.5" /> {c.counts.estudiantes}
                        </span>
                        <span className="flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" /> {c.counts.acudientes}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Funciones avanzadas (crear colegio, gestionar admins, métricas, entrar como Rector) llegan en próximas fases.
          </p>
        </div>
      </main>
    </div>
  );
};

export default DashboardPlataforma;
