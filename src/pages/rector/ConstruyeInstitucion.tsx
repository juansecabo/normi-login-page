import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import HeaderNormi from "@/components/HeaderNormi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Building2, Clock, GraduationCap, Loader2 } from "lucide-react";
import { ApiError, apiClient } from "@/lib/apiClient";
import { getSession } from "@/hooks/useSession";
import EscudoColegio from "@/components/EscudoColegio";
import { supabase } from "@/integrations/supabase/client";
import EstructuraColegioEditor from "@/components/EstructuraColegioEditor";
import { Building, Image as ImageIcon, ArrowLeft, BookOpen, FileText, ExternalLink, Pencil, Trash2, Users } from "lucide-react";
import { useRef } from "react";
import EscalaColegioEditor from "@/components/EscalaColegioEditor";
import AsignaturasColegioEditor from "@/components/AsignaturasColegioEditor";
import PersonasColegioEditor from "@/components/PersonasColegioEditor";
import ArmarSalon from "@/components/ArmarSalon";

/**
 * "Construye tu Institución" — el Rector (o Administrador) declara la estructura
 * del colegio: Jornadas (con su hora de aviso), Grados y Salones (cada salón con
 * su jornada). Consume /api/institucion/* (multi-tenant por el JWT).
 *
 * Esto NO afecta a los colegios que ya derivan grados/salones de sus estudiantes
 * (Normal, Pestalozziano): esas tablas arrancan vacías y solo se usan donde se
 * declaren. Por ahora su único consumidor será el dropdown de "agregar estudiante".
 */

/** Manual de Convivencia del colegio propio (misma UX de la ficha del wizard). */
const ManualColegio = ({ manualUrl, onChanged }: { manualUrl: string | null; onChanged: () => Promise<void> | void }) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [quitando, setQuitando] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") { toast({ title: "Debe ser PDF", description: "El Manual de Convivencia solo acepta archivos PDF.", variant: "destructive" }); return; }
    if (file.size > 20 * 1024 * 1024) { toast({ title: "Archivo grande", description: "Máximo 20 MB.", variant: "destructive" }); return; }
    setSubiendo(true);
    try {
      await apiClient.institucion.subirManual(file);
      await onChanged();
    } catch (err: any) {
      toast({ title: "No se pudo subir", description: err?.message, variant: "destructive" });
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async () => {
    setQuitando(true);
    try {
      await apiClient.institucion.quitarManual();
      await onChanged();
    } catch (err: any) {
      toast({ title: "No se pudo quitar", description: err?.message, variant: "destructive" });
    } finally {
      setQuitando(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Sube el manual en <strong>PDF</strong>. Aparecerá en el botón «Manual de Convivencia» del tablero de estudiantes, acudientes y personal.
      </p>
      {manualUrl ? (
        <div className="flex flex-col gap-3">
          <a href={manualUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary hover:underline w-fit">
            <FileText className="w-5 h-5" /> Ver PDF actual <ExternalLink className="w-4 h-4" />
          </a>
          <div className="flex gap-2">
            <Button onClick={() => fileRef.current?.click()} disabled={subiendo} variant="outline" className="gap-2">
              {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />} Cambiar PDF
            </Button>
            <Button onClick={quitar} disabled={quitando} variant="outline" className="gap-2 text-destructive hover:text-destructive">
              {quitando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Quitar
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => fileRef.current?.click()} disabled={subiendo} className="gap-2">
          {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Subir PDF
        </Button>
      )}
      <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFile} className="hidden" />
    </div>
  );
};

const ConstruyeInstitucion = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const cargo = getSession().cargo || "";
  const puedeEditar = cargo === "Rector" || cargo === "Administrador";
  // También pueden ENTRAR secretaria, coordinadores, administrativos y
  // profesores directores de grupo (a los profesores sin dirección se les
  // saca abajo con la verificación async). La escritura de estructura en el
  // backend sigue limitada a Rector/Administrador; en Personas manda la
  // jerarquía (services/jerarquia.ts del server).
  const puedeEntrar = puedeEditar || cargo === "Secretaria General" || cargo === "Coordinador(a)" || cargo === "Administrativo(a)" || cargo === "Profesor(a)";

  const [loading, setLoading] = useState(true);
  // La vista y el rol elegido (dentro de Personas) viven en la URL para que un
  // F5 no devuelva al menú. PUSH (no replace) → el botón atrás baja un nivel.
  const [searchParams, setSearchParams] = useSearchParams();
  type VistaCI = 'menu' | 'info' | 'escudo' | 'escala' | 'estructura' | 'asignaturas' | 'manual' | 'personas' | 'armar-salon';
  const VISTAS: VistaCI[] = ['menu', 'info', 'escudo', 'escala', 'estructura', 'asignaturas', 'manual', 'personas', 'armar-salon'];
  const vistaUrl = searchParams.get('vista') as VistaCI | null;
  // El profesor (director de grupo) solo tiene Personas y Armar salón — también por URL.
  const vistaValida = (v: VistaCI) => VISTAS.includes(v) && (cargo !== "Profesor(a)" || v === 'personas' || v === 'armar-salon');
  const vista: VistaCI = vistaUrl && vistaValida(vistaUrl) ? vistaUrl : 'menu';
  const setVista = (v: VistaCI) => setSearchParams(v === 'menu' ? {} : { vista: v });
  const rolPersonas = searchParams.get('rol');
  const setRolPersonas = (r: string | null) => {
    const pms = new URLSearchParams(searchParams);
    if (r) pms.set('rol', r); else pms.delete('rol');
    setSearchParams(pms);
  };

  // Datos del colegio + escudo
  const [nombreColegio, setNombreColegio] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [datos, setDatos] = useState({ nit: "", ciudad: "", direccion: "", telefono: "", resolucion: "", dane: "", rector_nombre: "" });
  // Config completa del colegio (escala, rangos, manual_url…) para las fichas nuevas.
  const [cfgColegio, setCfgColegio] = useState<Record<string, any>>({});
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [subiendoEscudo, setSubiendoEscudo] = useState(false);

  const backLink = cargo === "Administrador" ? "/dashboard-admin" : cargo === "Profesor(a)" ? "/dashboard" : "/dashboard-rector";

  useEffect(() => {
    const s = getSession();
    if (!s.id) { navigate("/"); return; }
    if (!puedeEntrar) { navigate(backLink, { replace: true }); return; }
    // De los profesores, solo entran los DIRECTORES DE GRUPO.
    if (cargo === "Profesor(a)") {
      supabase.from("Internos").select("direccion_de_grupo").eq("id", parseInt(s.id)).maybeSingle()
        .then(({ data }) => {
          const dir = String((data as { direccion_de_grupo?: string } | null)?.direccion_de_grupo || "").trim();
          if (!dir) navigate(backLink, { replace: true });
        });
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = async () => {
    try {
      const cfg = await apiClient.colegio.getConfig();
      setNombreColegio(cfg.nombre || "");
      setLogoUrl(cfg.logo_url || null);
      const c = (cfg.config || {}) as Record<string, string>;
      setCfgColegio((cfg.config || {}) as Record<string, any>);
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
      <main className={`flex-1 container mx-auto p-4 md:p-8 ${vista === "personas" || vista === "armar-salon" ? "" : "max-w-4xl"}`}>
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => setVista("menu")} className={vista === "menu" ? "text-foreground font-medium" : "text-primary hover:underline"}>Configurar Institución</button>
            {vista !== "menu" && (<>
              <span className="text-muted-foreground">&rarr;</span>
              {vista === "personas" && rolPersonas ? (
                <button onClick={() => setRolPersonas(null)} className="text-primary hover:underline">Personas</button>
              ) : (
                <span className="text-foreground font-medium">{({ info: "Información del colegio", escudo: "Escudo", escala: "Escala de calificación", estructura: "Jornadas, grados y salones", asignaturas: "Asignaturas", manual: "Manual de Convivencia", personas: "Personas", "armar-salon": "Armar salón" } as Record<string, string>)[vista]}</span>
              )}
              {vista === "personas" && rolPersonas && (<>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="text-foreground font-medium">{({ "Administrador": "Administrador(a)", "Rector": "Rector(a)", "Coordinador(a)": "Coordinadores", "Administrativo(a)": "Administrativos", "Orientador(a) Escolar": "Orientación escolar", "Profesor(a)": "Profesores", estudiante: "Estudiantes", acudiente: "Acudientes" } as Record<string, string>)[rolPersonas] || rolPersonas}</span>
              </>)}
            </>)}
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
              { id: "escala", label: "Escala de calificación", desc: `${cfgColegio.escala_min ?? 0} a ${cfgColegio.escala_max ?? 5} · aprueba con ${cfgColegio.nota_aprobatoria ?? 3}`, Icon: GraduationCap },
              { id: "estructura", label: "Jornadas, grados y salones", desc: "Jornadas, grados y salones", Icon: Clock },
              { id: "asignaturas", label: "Asignaturas", desc: "Asignaturas del colegio y plan de estudios por grado", Icon: BookOpen },
              { id: "manual", label: "Manual de Convivencia", desc: cfgColegio.manual_url ? "PDF cargado" : "Sube el PDF (opcional)", Icon: FileText },
              { id: "personas", label: "Personas", desc: "Administradores, rectores, profesores, estudiantes…", Icon: GraduationCap },
              { id: "armar-salon", label: "Armar salón", desc: "Arma cada salón de forma visual: director(a) y estudiantes", Icon: Users },
              // El profesor director de grupo solo gestiona Personas y su salón.
            ].filter((f) => cargo !== "Profesor(a)" || f.id === "personas" || f.id === "armar-salon").map((f) => (
              <button key={f.id} onClick={() => setVista(f.id as typeof vista)}
                className="flex items-start gap-4 p-6 rounded-lg border text-left transition-colors bg-card hover:bg-muted cursor-pointer">
                <f.Icon className="h-8 w-8 text-primary shrink-0" />
                <div><p className="font-semibold text-foreground">{f.label}</p><p className="text-sm text-muted-foreground">{f.desc}</p></div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
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
            {vista === "escala" && (
              <div className="bg-card rounded-lg shadow-soft p-6 md:p-8">
                <EscalaColegioEditor
                  cfg={cfgColegio}
                  guardar={async (configuracion) => { await apiClient.colegio.patchConfig(configuracion); }}
                  alGuardar={() => { cargar(); }}
                />
              </div>
            )}
            {vista === "asignaturas" && <AsignaturasColegioEditor />}
            {vista === "manual" && (
              <div className="bg-card rounded-lg shadow-soft p-6 md:p-8">
                <ManualColegio manualUrl={cfgColegio.manual_url || null} onChanged={cargar} />
              </div>
            )}
            {vista === "armar-salon" && (
              <div className="bg-card rounded-lg shadow-soft p-6 md:p-8">
                <ArmarSalon />
              </div>
            )}
            {vista === "personas" && <PersonasColegioEditor rol={rolPersonas} setRol={setRolPersonas} />}
          </div>
        )}
      </main>
    </div>
  );
};

export default ConstruyeInstitucion;
