import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Users, GraduationCap, UserCheck, Loader2, Pencil, LogIn, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Normaliza texto para búsqueda flexible: minúsculas y sin tildes. */
const normalizarBusqueda = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
import HeaderNormi from "@/components/HeaderNormi";
import EscudoColegio from "@/components/EscudoColegio";
import { getSession, guardarSesionSuperAdmin, restaurarSesionSuperAdmin, saveSession } from "@/hooks/useSession";
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
  const [query, setQuery] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activo" | "borrador">("todos");
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [entrandoId, setEntrandoId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingColegioId = useRef<string | null>(null);

  // Crear una institución nueva: nace como borrador y abre el wizard.
  const crearInstitucion = async () => {
    if (creando) return;
    setCreando(true);
    try {
      const { colegio } = await apiClient.plataforma.crearColegio();
      navigate(`/crear-institucion/${colegio.id}`);
    } catch (err: any) {
      toast({ title: "No se pudo crear", description: err?.message || "Intenta de nuevo.", variant: "destructive" });
      setCreando(false);
    }
  };

  // Abrir una fila: si es borrador, continúa el wizard; si está activa, entra como admin.
  const abrirColegio = (c: ColegioPlataforma) => {
    if (c.estado === "borrador") {
      navigate(`/crear-institucion/${c.id}`);
    } else {
      entrarComoAdmin(c);
    }
  };

  const entrarComoAdmin = async (c: ColegioPlataforma) => {
    if (entrandoId || uploadingId) return;
    setEntrandoId(c.id);
    try {
      // Respaldar sesion del SuperAdmin antes de sobreescribir el JWT.
      guardarSesionSuperAdmin();
      const resp = await apiClient.plataforma.entrarComoAdmin(c.id);
      // Reemplazar JWT actual con el de Admin del colegio.
      localStorage.setItem("normi_jwt", resp.token);
      // Reemplazar datos de sesion como Admin de ese colegio.
      const sa = getSession();
      saveSession(
        sa.id || "",
        sa.nombres || "SuperAdmin",
        sa.apellidos || "",
        "Administrador",
        null, null, null, null, false,
        sa.avatar_url || null,
        c.id, c.nombre, c.logo_url, c.slug,
      );
      navigate("/dashboard-admin");
    } catch (err: any) {
      toast({
        title: "No se pudo entrar al colegio",
        description: err?.message || "Intenta de nuevo.",
        variant: "destructive",
      });
      setEntrandoId(null);
    }
  };

  const reload = () => {
    return apiClient.plataforma.colegios()
      .then(({ colegios }) => setColegios(colegios))
      .catch((err) => {
        toast({
          title: "Error",
          description: err?.message || "No se pudieron cargar los colegios",
          variant: "destructive",
        });
      });
  };

  const triggerUpload = (colegioId: string) => {
    pendingColegioId.current = colegioId;
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const colegioId = pendingColegioId.current;
    pendingColegioId.current = null;
    if (!file || !colegioId) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Formato no soportado", description: "Usa JPG, PNG o WEBP.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Archivo grande", description: "Máximo 5 MB.", variant: "destructive" });
      return;
    }
    setUploadingId(colegioId);
    try {
      await apiClient.plataforma.uploadColegioLogo(colegioId, file);
      await reload();
      toast({ title: "Escudo actualizado" });
    } catch (err: any) {
      toast({
        title: "No se pudo subir",
        description: err?.message || "Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setUploadingId(null);
    }
  };

  // Guard de sesión + carga inicial. Si llegamos aquí (p.ej. con el botón
  // atrás del navegador) mientras estábamos impersonando un colegio como
  // Administrador, restauramos la sesión del SuperAdmin para no fallar con
  // 403 al cargar los colegios. Así "atrás" devuelve al selector de colegios.
  useEffect(() => {
    let s = getSession();
    if (s.cargo !== "SuperAdmin" && restaurarSesionSuperAdmin()) {
      s = getSession();
    }
    if (!s.id || s.cargo !== "SuperAdmin") {
      navigate("/", { replace: true });
      return;
    }
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Búsqueda flexible: TODAS las palabras del query deben aparecer (en cualquier
  // orden) en el nombre o slug del colegio, ignorando mayúsculas y tildes.
  const tokensBusqueda = normalizarBusqueda(query).split(/\s+/).filter(Boolean);
  const colegiosFiltrados = (colegios || []).filter((c) => {
    // Filtro por estado: "activo" agrupa todo lo que NO es borrador (activo/suspendido/etc.).
    if (filtroEstado === "borrador" && c.estado !== "borrador") return false;
    if (filtroEstado === "activo" && c.estado === "borrador") return false;
    if (tokensBusqueda.length === 0) return true;
    const heno = normalizarBusqueda(`${c.nombre} ${c.slug || ""}`);
    return tokensBusqueda.every((t) => heno.includes(t));
  });
  const conteoEstado = {
    todos: (colegios || []).length,
    activo: (colegios || []).filter((c) => c.estado !== "borrador").length,
    borrador: (colegios || []).filter((c) => c.estado === "borrador").length,
  };

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
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-foreground">Colegios</h2>
                <span className="text-sm text-muted-foreground">
                  {colegios ? `${colegios.length} total` : ""}
                </span>
              </div>
              <Button onClick={crearInstitucion} disabled={creando} size="sm" className="gap-2">
                {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Crear Institución
              </Button>
            </div>

            {!loading && colegios && colegios.length > 0 && (
              <div className="mb-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar colegio…"
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {([
                    { id: "todos", label: "Todos" },
                    { id: "activo", label: "Activos" },
                    { id: "borrador", label: "Borradores" },
                  ] as const).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFiltroEstado(f.id)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        filtroEstado === f.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:bg-muted/50"
                      }`}
                    >
                      {f.label} ({conteoEstado[f.id]})
                    </button>
                  ))}
                </div>
              </div>
            )}

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

            {!loading && colegios && colegios.length > 0 && colegiosFiltrados.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No se encontraron colegios para “{query}”.
              </p>
            )}

            {!loading && colegiosFiltrados.length > 0 && (
              <div className="space-y-3">
                {colegiosFiltrados.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => abrirColegio(c)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirColegio(c); } }}
                    className={`border border-border rounded-lg p-4 flex items-center gap-4 hover:border-primary/60 hover:bg-secondary/40 transition-colors cursor-pointer ${entrandoId === c.id ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); triggerUpload(c.id); }}
                      disabled={uploadingId !== null}
                      className="relative group disabled:opacity-50"
                      title="Cambiar escudo"
                    >
                      <EscudoColegio
                        logoUrl={c.logo_url}
                        nombre={c.nombre}
                        colorFondo={c.color_primario}
                        size={56}
                      />
                      <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        {uploadingId === c.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Pencil className="w-4 h-4" />
                        )}
                      </div>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate">{c.nombre}</h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            c.estado === "activo"
                              ? "bg-green-100 text-green-700"
                              : c.estado === "borrador"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {c.estado === "borrador" ? "Borrador" : c.estado}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">slug: {c.slug}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <GraduationCap className="w-3.5 h-3.5" /> {c.counts.estudiantes} Estudiantes
                        </span>
                        <span className="flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" /> {c.counts.acudientes} Acudientes
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> {c.counts.internos} Internos
                        </span>
                        <span className="font-semibold text-foreground">
                          Total: {c.counts.estudiantes + c.counts.acudientes + c.counts.internos}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center text-primary shrink-0" title={c.estado === "borrador" ? "Continuar configuración" : "Entrar al colegio"}>
                      {entrandoId === c.id ? <Loader2 className="w-5 h-5 animate-spin" /> : c.estado === "borrador" ? <Pencil className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Click sobre el escudo para subir/cambiar. Recomendado: imagen cuadrada de 512×512 px.<br />
            Los borradores no son visibles para los usuarios hasta que los publiques.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            className="hidden"
          />
        </div>
      </main>
    </div>
  );
};

export default DashboardPlataforma;
