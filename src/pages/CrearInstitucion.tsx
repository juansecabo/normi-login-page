import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Building2, Image as ImageIcon, GraduationCap, Users, ArrowLeft,
  Loader2, Pencil, Check, Rocket, Clock, Plus, Trash2, FileText, ExternalLink, BookOpen,
  ShieldCheck, Briefcase, HeartHandshake, Backpack, UsersRound,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rankGrado } from "@/utils/grados";
import HeaderNormi from "@/components/HeaderNormi";
import EscudoColegio from "@/components/EscudoColegio";
import EstructuraColegioEditor from "@/components/EstructuraColegioEditor";
import AsignaturasColegioEditor from "@/components/AsignaturasColegioEditor";
import PersonasColegioEditor from "@/components/PersonasColegioEditor";
import EscalaColegioEditor from "@/components/EscalaColegioEditor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getSession } from "@/hooks/useSession";
import { apiClient, apiRequest, type ColegioDetalle, type ColegioAdmin } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { aNumero } from "@/utils/numero";

/**
 * Wizard de Crear/Configurar Institución para el SuperAdmin. Opera sobre un
 * colegio en estado 'borrador' identificado por la ruta (:id). Está dividido en
 * sub-fichas (datos, escudo, escala, administradores) para no abrumar en una
 * sola pantalla. Todo se va guardando en el borrador; "Publicar" lo activa.
 */
type Vista = "menu" | "datos" | "escudo" | "escala" | "estructura" | "asignaturas" | "manual" | "admins";

const CrearInstitucion = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [colegio, setColegio] = useState<ColegioDetalle | null>(null);
  const [admins, setAdmins] = useState<ColegioAdmin[]>([]);
  const [estructura, setEstructura] = useState<{ jornadas: number; grados: number; salones: number; asignaturas?: number }>({ jornadas: 0, grados: 0, salones: 0 });
  const [loading, setLoading] = useState(true);
  const [publicando, setPublicando] = useState(false);

  // La ficha activa vive en la URL (?ficha=datos) para que un F5 no saque al
  // usuario al menú: al recargar se restaura la sub-ficha donde estaba.
  const [searchParams, setSearchParams] = useSearchParams();
  const FICHAS: Vista[] = ["menu", "datos", "escudo", "escala", "estructura", "asignaturas", "manual", "admins"];
  const fichaUrl = searchParams.get("ficha") as Vista | null;
  const vista: Vista = fichaUrl && FICHAS.includes(fichaUrl) ? fichaUrl : "menu";
  // PUSH (no replace) para que el botón "atrás" del navegador vaya ficha → menú
  // → panel, en vez de saltarse el menú.
  const setVista = (v: Vista) => {
    setSearchParams(v === "menu" ? {} : { ficha: v });
  };
  // Rol elegido dentro de "Personas del colegio" (vive en la URL para que el
  // botón Volver de arriba sea jerárquico: rol → tarjetas de roles → menú).
  const rolPersonas = searchParams.get("rol");
  const setRolPersonas = (r: string | null) => {
    const p = new URLSearchParams(searchParams);
    if (r) p.set("rol", r); else p.delete("rol");
    setSearchParams(p);
  };

  // Guard de sesión: solo SuperAdmin.
  useEffect(() => {
    const s = getSession();
    if (!s.id || s.cargo !== "SuperAdmin") {
      navigate("/", { replace: true });
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cargar = async () => {
    try {
      const { colegio, admins, estructura } = await apiClient.plataforma.getColegio(id);
      setColegio(colegio);
      setAdmins(admins);
      setEstructura(estructura);
    } catch (err: any) {
      toast({ title: "No se pudo cargar", description: err?.message || "Intenta de nuevo.", variant: "destructive" });
      navigate("/dashboard-plataforma", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const yaActivo = colegio?.estado === "activo";
  const cfg = (colegio?.configuracion || {}) as Record<string, any>;
  const tieneNombre = !!(colegio?.nombre && colegio.nombre.trim() && colegio.nombre !== "Institución sin nombre");
  const tieneAdmin = admins.length > 0;
  const puedePublicar = tieneNombre; // El admin es opcional (el SuperAdmin administra cualquier colegio).

  const publicar = async () => {
    if (!puedePublicar || publicando) return;
    setPublicando(true);
    try {
      await apiClient.plataforma.publicarColegio(id);
      toast({ title: "¡Institución creada!", description: `${colegio?.nombre} ya está activa.` });
      navigate("/dashboard-plataforma", { replace: true });
    } catch (err: any) {
      toast({ title: "No se pudo publicar", description: err?.message || "Revisa los datos.", variant: "destructive" });
      setPublicando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <HeaderNormi backLink="/dashboard-plataforma" />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard-plataforma" />
      <main className="flex-1 container mx-auto p-6 md:p-8">
        <div className="max-w-3xl mx-auto">
          {/* Botón de retroceso ÚNICO arriba, jerárquico: página de un rol →
              tarjetas de roles → menú de fichas → panel. */}
          <Button
            variant="outline"
            size="sm"
            onClick={
              vista === "menu" ? () => navigate("/dashboard-plataforma")
              : vista === "admins" && rolPersonas ? () => setRolPersonas(null)
              : () => { setVista("menu"); cargar(); }
            }
            className="gap-1 mb-4 bg-card"
          >
            <ArrowLeft className="w-4 h-4" /> {vista === "menu" ? "Volver al panel" : "Volver"}
          </Button>
          {/* Encabezado */}
          <div className="mb-6 flex items-center gap-4">
            <EscudoColegio logoUrl={colegio?.logo_url} nombre={colegio?.nombre} colorFondo={colegio?.color_primario} size={56} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">
                {tieneNombre ? colegio?.nombre : "Nueva institución"}
              </h1>
              <span className={`text-xs px-2 py-0.5 rounded-full ${yaActivo ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                {yaActivo ? "Activa" : "Borrador"}
              </span>
            </div>
          </div>

          {vista === "menu" && (
            <MenuFichas
              colegio={colegio!}
              admins={admins}
              cfg={cfg}
              estructura={estructura}
              ir={setVista}
              puedePublicar={puedePublicar}
              publicar={publicar}
              publicando={publicando}
              tieneNombre={tieneNombre}
              tieneAdmin={tieneAdmin}
              yaActivo={yaActivo}
            />
          )}
          {vista === "datos" && <FichaDatos colegio={colegio!} cfg={cfg} onSaved={cargar} volver={() => setVista("menu")} />}
          {vista === "escudo" && <FichaEscudo colegio={colegio!} onSaved={cargar} volver={() => setVista("menu")} />}
          {vista === "escala" && <FichaEscala colegio={colegio!} cfg={cfg} onSaved={cargar} />}
          {vista === "estructura" && (
            <div>
              <h2 className="text-xl font-semibold mb-1">Jornadas, grados y salones</h2>
              <p className="text-sm text-muted-foreground mb-4">Define la estructura del colegio. Es opcional para publicar, pero deja la institución lista para registrar estudiantes.</p>
              <EstructuraColegioEditor colegioId={id} />
            </div>
          )}
          {vista === "asignaturas" && (
            <div>
              <h2 className="text-xl font-semibold mb-1">Asignaturas y plan de estudios</h2>
              <p className="text-sm text-muted-foreground mb-4">Escoge las asignaturas propias del colegio y define cuáles se ven en cada grado con su intensidad horaria.</p>
              <AsignaturasColegioEditor colegioId={id} />
            </div>
          )}
          {vista === "manual" && <FichaManual id={id} manualUrl={cfg.manual_url || null} onChanged={cargar} />}
          {vista === "admins" && <FichaAdmins id={id} admins={admins} onChanged={cargar} volver={() => setVista("menu")} rol={rolPersonas} setRol={setRolPersonas} />}
        </div>
      </main>
    </div>
  );
};

// ───────────────────────── MENÚ DE FICHAS ─────────────────────────
const MenuFichas = ({
  colegio, admins, cfg, estructura, ir, puedePublicar, publicar, publicando, tieneNombre, tieneAdmin, yaActivo,
}: {
  colegio: ColegioDetalle; admins: ColegioAdmin[]; cfg: Record<string, any>;
  estructura: { jornadas: number; grados: number; salones: number; asignaturas?: number };
  ir: (v: Vista) => void; puedePublicar: boolean; publicar: () => void;
  publicando: boolean; tieneNombre: boolean; tieneAdmin: boolean; yaActivo: boolean;
}) => {
  const Card = ({ icon, label, sub, onClick, ok }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; ok?: boolean }) => (
    <button onClick={onClick} className="relative flex flex-col items-center text-center sm:items-start sm:text-left bg-card border border-border rounded-lg p-5 shadow-sm hover:border-primary/60 hover:bg-secondary/40 transition-colors">
      {ok && <Check className="absolute top-3 right-3 w-5 h-5 text-green-600" />}
      <div className="mb-3">{icon}</div>
      <h3 className="font-semibold text-foreground">{label}</h3>
      <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>
    </button>
  );
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card icon={<Building2 className="w-8 h-8 text-primary" />} label="Datos del colegio" sub="Nombre, ciudad y datos legales" onClick={() => ir("datos")} ok={tieneNombre} />
        <Card icon={<ImageIcon className="w-8 h-8 text-primary" />} label="Escudo" sub={colegio.logo_url ? "Escudo cargado" : "Imagen institucional (500×500)"} onClick={() => ir("escudo")} ok={!!colegio.logo_url} />
        <Card icon={<GraduationCap className="w-8 h-8 text-primary" />} label="Escala de calificación" sub={`${cfg.escala_min ?? 0} a ${cfg.escala_max ?? 5} · aprueba con ${cfg.nota_aprobatoria ?? 3}`} onClick={() => ir("escala")} />
        <Card icon={<Clock className="w-8 h-8 text-primary" />} label="Jornadas, grados y salones" sub={estructura.grados ? `${estructura.grados} grado(s) · ${estructura.salones} salón(es)` : "Define la estructura (opcional)"} onClick={() => ir("estructura")} ok={estructura.grados > 0} />
        <Card icon={<BookOpen className="w-8 h-8 text-primary" />} label="Asignaturas" sub={(estructura.asignaturas || 0) > 0 ? `${estructura.asignaturas} asignatura(s) · plan por grado` : "Escoge las asignaturas del colegio"} onClick={() => ir("asignaturas")} ok={(estructura.asignaturas || 0) > 0} />
        <Card icon={<FileText className="w-8 h-8 text-primary" />} label="Manual de Convivencia" sub={cfg.manual_url ? "PDF cargado" : "Sube el PDF (opcional)"} onClick={() => ir("manual")} ok={!!cfg.manual_url} />
        <Card icon={<Users className="w-8 h-8 text-primary" />} label="Personas del colegio" sub="Administradores, rectores, profesores, estudiantes…" onClick={() => ir("admins")} ok={tieneAdmin} />
      </div>

      {!yaActivo && (
        <div className="mt-8 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground mb-3">
            Para crear la institución solo necesitas el {" "}
            <span className={tieneNombre ? "text-green-600" : "text-yellow-600"}>nombre</span>.
            El administrador es opcional (tú como SuperAdmin puedes administrar cualquier colegio) y la estructura
            (jornadas, grados y salones) se configura después desde el panel del colegio.
          </p>
          <Button onClick={publicar} disabled={!puedePublicar || publicando} className="gap-2">
            {publicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            Crear institución
          </Button>
        </div>
      )}
    </>
  );
};


// ───────────────────────── FICHA: DATOS ─────────────────────────
/**
 * Campo de texto. DEBE estar a nivel de módulo (no anidado dentro de FichaDatos):
 * si se define dentro del render, React lo remonta en cada tecla y el input
 * pierde el foco tras cada letra.
 */
const Campo = ({ label, value, set, ph }: { label: string; value: string; set: (s: string) => void; ph?: string }) => (
  <div>
    <Label className="text-sm">{label}</Label>
    <Input value={value} onChange={(e) => set(e.target.value)} placeholder={ph} className="mt-1" />
  </div>
);

const FichaDatos = ({ colegio, cfg, onSaved, volver }: { colegio: ColegioDetalle; cfg: Record<string, any>; onSaved: () => Promise<void>; volver: () => void }) => {
  const { toast } = useToast();
  const dl = (cfg.datos_legales || {}) as Record<string, any>;
  const [nombre, setNombre] = useState(colegio.nombre === "Institución sin nombre" ? "" : colegio.nombre);
  const [ciudad, setCiudad] = useState(cfg.ciudad || "");
  const [nit, setNit] = useState(dl.nit || "");
  const [dane, setDane] = useState(dl.dane || "");
  const [resolucion, setResolucion] = useState(dl.resolucion || "");
  const [direccion, setDireccion] = useState(dl.direccion || "");
  const [telefono, setTelefono] = useState(dl.telefono || "");
  const [rectorNombre, setRectorNombre] = useState(dl.rector_nombre || "");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!nombre.trim()) { toast({ title: "Falta el nombre", variant: "destructive" }); return; }
    setGuardando(true);
    try {
      await apiClient.plataforma.patchColegio(colegio.id, {
        nombre: nombre.trim(),
        configuracion: {
          ciudad: ciudad.trim(),
          datos_legales: { nit, dane, resolucion, direccion, telefono, rector_nombre: rectorNombre },
        },
      });
      await onSaved();
      toast({ title: "Datos guardados" });
      volver();
    } catch (err: any) {
      toast({ title: "No se pudo guardar", description: err?.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Datos del colegio</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label className="text-sm">Nombre de la institución *</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Colegio San José" className="mt-1" />
        </div>
        <Campo label="Ciudad" value={ciudad} set={setCiudad} ph="Ej: Corozal" />
        <Campo label="NIT" value={nit} set={setNit} />
        <Campo label="Código DANE" value={dane} set={setDane} />
        <Campo label="Resolución" value={resolucion} set={setResolucion} />
        <Campo label="Dirección" value={direccion} set={setDireccion} />
        <Campo label="Teléfono" value={telefono} set={setTelefono} />
        <div className="sm:col-span-2">
          <Campo label="Nombre del rector(a)" value={rectorNombre} set={setRectorNombre} />
        </div>
      </div>
      <Button onClick={guardar} disabled={guardando} className="mt-6 gap-2">
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Guardar
      </Button>
    </div>
  );
};

// ───────────────────────── FICHA: ESCUDO ─────────────────────────
const FichaEscudo = ({ colegio, onSaved, volver }: { colegio: ColegioDetalle; onSaved: () => Promise<void>; volver: () => void }) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Formato no soportado", description: "Usa JPG, PNG o WEBP.", variant: "destructive" }); return;
    }
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Archivo grande", description: "Máximo 5 MB.", variant: "destructive" }); return; }
    setSubiendo(true);
    try {
      await apiClient.plataforma.uploadColegioLogo(colegio.id, file);
      await onSaved();
      toast({ title: "Escudo actualizado" });
    } catch (err: any) {
      toast({ title: "No se pudo subir", description: err?.message, variant: "destructive" });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Escudo institucional</h2>
      <div className="flex flex-col items-center gap-4 py-4">
        <EscudoColegio logoUrl={colegio.logo_url} nombre={colegio.nombre} colorFondo={colegio.color_primario} size={160} />
        <Button onClick={() => fileRef.current?.click()} disabled={subiendo} variant="outline" className="gap-2">
          {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
          {colegio.logo_url ? "Cambiar escudo" : "Subir escudo"}
        </Button>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          Se almacena en WebP de 500×500 px. Recomendado: imagen cuadrada con fondo transparente.
        </p>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} className="hidden" />
    </div>
  );
};

// ───────────────────────── FICHA: ESCALA ─────────────────────────
const FichaEscala = ({ colegio, cfg, onSaved }: { colegio: ColegioDetalle; cfg: Record<string, any>; onSaved: () => Promise<void> }) => (
  <div>
    <h2 className="text-xl font-semibold mb-4">Escala de calificación</h2>
    <EscalaColegioEditor
      cfg={cfg}
      guardar={async (configuracion) => {
        await apiClient.plataforma.patchColegio(colegio.id, { configuracion });
        await onSaved();
      }}
    />
  </div>
);

// ───────────────────────── FICHA: PERSONAS DEL COLEGIO ─────────────────────────
// La UI vive en PersonasColegioEditor (compartida con "Configurar Institución"
// del rector). Aquí solo se conecta con el colegio del wizard y el rol en la URL.
const FichaAdmins = ({ id, admins, onChanged, volver, rol, setRol }: { id: string; admins: ColegioAdmin[]; onChanged: () => Promise<void>; volver: () => void; rol: string | null; setRol: (r: string | null) => void }) => (
  <div>
    {!rol && <h2 className="text-xl font-semibold mb-1">Personas del colegio</h2>}
    <PersonasColegioEditor colegioId={id} rol={rol} setRol={setRol} onChanged={onChanged} />
  </div>
);

// ───────────────────────── FICHA: MANUAL DE CONVIVENCIA ─────────────────────────
const FichaManual = ({ id, manualUrl, onChanged }: { id: string; manualUrl: string | null; onChanged: () => Promise<void> }) => {
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
      await apiClient.institucion.subirManual(file, id);
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
      await apiClient.institucion.quitarManual(id);
      await onChanged();
    } catch (err: any) {
      toast({ title: "No se pudo quitar", description: err?.message, variant: "destructive" });
    } finally {
      setQuitando(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Manual de Convivencia</h2>
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

export default CrearInstitucion;
