import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Building2, Clock, GraduationCap, Loader2 } from "lucide-react";
import { ApiError, apiClient } from "@/lib/apiClient";
import { getSession } from "@/hooks/useSession";
import EscudoColegio from "@/components/EscudoColegio";
import EstructuraColegioEditor from "@/components/EstructuraColegioEditor";
import { Building, Image as ImageIcon, ArrowLeft } from "lucide-react";

/**
 * "Construye tu Institución" — el Rector (o Administrador) declara la estructura
 * del colegio: Jornadas (con su hora de aviso), Grados y Salones (cada salón con
 * su jornada). Consume /api/institucion/* (multi-tenant por el JWT).
 *
 * Esto NO afecta a los colegios que ya derivan grados/salones de sus estudiantes
 * (Normal, Pestalozziano): esas tablas arrancan vacías y solo se usan donde se
 * declaren. Por ahora su único consumidor será el dropdown de "agregar estudiante".
 */

const ConstruyeInstitucion = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const cargo = getSession().cargo || "";
  const puedeEditar = cargo === "Rector" || cargo === "Administrador";

  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<'menu' | 'info' | 'escudo' | 'estructura' | 'personas'>('menu');

  // Datos del colegio + escudo
  const [nombreColegio, setNombreColegio] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [datos, setDatos] = useState({ nit: "", ciudad: "", direccion: "", telefono: "", resolucion: "", dane: "", rector_nombre: "" });
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [subiendoEscudo, setSubiendoEscudo] = useState(false);

  const backLink = cargo === "Administrador" ? "/dashboard-admin" : "/dashboard-rector";

  useEffect(() => {
    const s = getSession();
    if (!s.id) { navigate("/"); return; }
    if (!puedeEditar) { navigate(backLink, { replace: true }); return; }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = async () => {
    try {
      const cfg = await apiClient.colegio.getConfig();
      setNombreColegio(cfg.nombre || "");
      setLogoUrl(cfg.logo_url || null);
      const c = (cfg.config || {}) as Record<string, string>;
      setDatos({
        nit: c.nit || "", ciudad: c.ciudad || "", direccion: c.direccion || "",
        telefono: c.telefono || "", resolucion: c.resolucion || "", dane: c.dane || "",
        rector_nombre: c.rector_nombre || "",
      });
    } catch {
      toast({ title: "Error", description: "No se pudo cargar la información del colegio.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const guardarDatos = async () => {
    if (!nombreColegio.trim()) { toast({ title: "Falta el nombre", description: "El colegio debe tener un nombre.", variant: "destructive" }); return; }
    setGuardandoDatos(true);
    try {
      await apiClient.colegio.patchConfig({
        nombre: nombreColegio.trim(),
        nit: datos.nit.trim() || null, ciudad: datos.ciudad.trim() || null,
        direccion: datos.direccion.trim() || null, telefono: datos.telefono.trim() || null,
        resolucion: datos.resolucion.trim() || null, dane: datos.dane.trim() || null,
        rector_nombre: datos.rector_nombre.trim() || null,
      });
      // Reflejar el nombre nuevo en la sesión local (header, boletines)
      try { localStorage.setItem("colegio_nombre", nombreColegio.trim()); } catch { /* noop */ }
      toast({ title: "Datos guardados", description: "Aparecerán en boletines, exámenes y documentos del colegio." });
    } catch (e) { err(e, "No se pudieron guardar los datos."); }
    setGuardandoDatos(false);
  };

  const subirEscudo = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast({ title: "Formato no soportado", description: "Usa PNG, JPG o WEBP (preferible PNG sin fondo).", variant: "destructive" }); return;
    }
    setSubiendoEscudo(true);
    try {
      const { logo_url } = await apiClient.colegio.subirEscudo(file);
      setLogoUrl(logo_url);
      toast({ title: "Escudo actualizado" });
    } catch (e) { err(e, "No se pudo subir el escudo."); }
    setSubiendoEscudo(false);
  };

  const err = (e: unknown, fallback: string) => {
    const detail = e instanceof ApiError ? ((e.body as any)?.detail || (e.body as any)?.error) : null;
    toast({ title: "Error", description: detail || fallback, variant: "destructive" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-4xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => setVista("menu")} className={vista === "menu" ? "text-foreground font-medium" : "text-primary hover:underline"}>Configurar Institución</button>
            {vista !== "menu" && (<><span className="text-muted-foreground">&rarr;</span><span className="text-foreground font-medium">{({ info: "Información del colegio", escudo: "Escudo", estructura: "Jornadas y salones", personas: "Personas y puestos" } as Record<string, string>)[vista]}</span></>)}
          </div>
        </div>

        <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
          <Building2 className="h-6 w-6 text-primary" /> Configurar Institución
        </h2>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : vista === "menu" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { id: "info", label: "Información del colegio", desc: "Nombre, NIT, ciudad y datos legales", Icon: Building },
              { id: "escudo", label: "Escudo", desc: "Sube o cambia el escudo del colegio", Icon: ImageIcon },
              { id: "estructura", label: "Jornadas y salones", desc: "Jornadas, grados y salones", Icon: Clock },
              { id: "personas", label: "Personas y puestos", desc: "Próximamente", Icon: GraduationCap },
            ].map((f) => (
              <button key={f.id} onClick={() => f.id !== "personas" && setVista(f.id as typeof vista)} disabled={f.id === "personas"}
                className={`flex items-start gap-4 p-6 rounded-lg border text-left transition-colors ${f.id === "personas" ? "opacity-50 cursor-not-allowed bg-muted/30" : "bg-card hover:bg-muted/40 cursor-pointer"}`}>
                <f.Icon className="h-8 w-8 text-primary shrink-0" />
                <div><p className="font-semibold text-foreground">{f.label}</p><p className="text-sm text-muted-foreground">{f.desc}</p></div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <button onClick={() => setVista("menu")} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="w-4 h-4" /> Volver</button>
            {vista === "info" && (<>
            {/* ── DATOS DEL COLEGIO ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Building className="h-5 w-5 text-primary" /> Datos del colegio</CardTitle>
                <p className="text-sm text-muted-foreground">Estos datos aparecen en boletines, exámenes (Normi Examinadora) y documentos oficiales.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Nombre del colegio</label>
                  <Input value={nombreColegio} onChange={(e) => setNombreColegio(e.target.value)} placeholder="Nombre de la institución" />
                  <p className="text-[11px] text-muted-foreground mt-1">Cambiarlo renombra el colegio en toda la plataforma (mismo colegio, no se pierde ni se mueve nada).</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-sm font-medium block mb-1">NIT</label><Input value={datos.nit} onChange={(e) => setDatos({ ...datos, nit: e.target.value })} placeholder="Ej: 800.123.456-7" /></div>
                  <div><label className="text-sm font-medium block mb-1">Ciudad</label><Input value={datos.ciudad} onChange={(e) => setDatos({ ...datos, ciudad: e.target.value })} placeholder="Ej: Corozal" /></div>
                  <div><label className="text-sm font-medium block mb-1">Código DANE</label><Input value={datos.dane} onChange={(e) => setDatos({ ...datos, dane: e.target.value })} /></div>
                  <div><label className="text-sm font-medium block mb-1">Resolución</label><Input value={datos.resolucion} onChange={(e) => setDatos({ ...datos, resolucion: e.target.value })} placeholder="Resolución de aprobación" /></div>
                  <div><label className="text-sm font-medium block mb-1">Dirección</label><Input value={datos.direccion} onChange={(e) => setDatos({ ...datos, direccion: e.target.value })} /></div>
                  <div><label className="text-sm font-medium block mb-1">Teléfono</label><Input value={datos.telefono} onChange={(e) => setDatos({ ...datos, telefono: e.target.value })} /></div>
                  <div className="sm:col-span-2"><label className="text-sm font-medium block mb-1">Nombre del rector(a)</label><Input value={datos.rector_nombre} onChange={(e) => setDatos({ ...datos, rector_nombre: e.target.value })} /></div>
                </div>
                <Button onClick={guardarDatos} disabled={guardandoDatos}>{guardandoDatos && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Guardar datos</Button>
              </CardContent>
            </Card>
            </>)}
            {vista === "escudo" && (<>
            {/* ── ESCUDO ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><ImageIcon className="h-5 w-5 text-primary" /> Escudo</CardTitle>
                <p className="text-sm text-muted-foreground">Súbelo en PNG sin fondo (también acepta JPG/WEBP). Tamaño recomendado <strong>500×500 px</strong> (cuadrado); el sistema lo reescala y centra automáticamente a 500×500.</p>
              </CardHeader>
              <CardContent className="flex items-center gap-5">
                <EscudoColegio logoUrl={logoUrl} nombre={nombreColegio} size={72} />
                <div>
                  <input id="escudo-input" type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) subirEscudo(f); }} />
                  <Button variant="outline" disabled={subiendoEscudo} onClick={() => document.getElementById("escudo-input")?.click()}>
                    {subiendoEscudo ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Subiendo...</> : <><ImageIcon className="w-4 h-4 mr-1" /> {logoUrl ? "Cambiar escudo" : "Subir escudo"}</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
            </>)}
            {vista === "estructura" && <EstructuraColegioEditor permitirImportar />}
            {vista === "personas" && (
              <Card><CardContent className="py-10 text-center text-muted-foreground">Gestión de personas y puestos — próximamente.</CardContent></Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ConstruyeInstitucion;
