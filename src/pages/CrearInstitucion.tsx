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
          {/* Botón de retroceso ÚNICO arriba: en el menú vuelve al panel; dentro
              de una ficha vuelve al menú (y refresca conteos). */}
          <Button
            variant="outline"
            size="sm"
            onClick={vista === "menu" ? () => navigate("/dashboard-plataforma") : () => { setVista("menu"); cargar(); }}
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
          {vista === "escala" && <FichaEscala colegio={colegio!} cfg={cfg} onSaved={cargar} volver={() => setVista("menu")} />}
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
          {vista === "admins" && <FichaAdmins id={id} admins={admins} onChanged={cargar} volver={() => setVista("menu")} />}
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
    <button onClick={onClick} className="relative text-left bg-card border border-border rounded-lg p-5 shadow-sm hover:border-primary/60 hover:bg-secondary/40 transition-colors">
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
interface RangoDesempeno { label: string; min: string; max: string; color: string; }

const COLOR_POR_DEFECTO = "#22c55e";

/** Muestra un número limpio (quita el épsilon interno 5.0001 → "5", deja 4.5 → "4.5"). */
const fmtNum = (n: unknown): string => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return String(Math.round(x * 100) / 100);
};

const FichaEscala = ({ colegio, cfg, onSaved, volver }: { colegio: ColegioDetalle; cfg: Record<string, any>; onSaved: () => Promise<void>; volver: () => void }) => {
  const { toast } = useToast();
  const [min, setMin] = useState(String(cfg.escala_min ?? 0));
  const [max, setMax] = useState(String(cfg.escala_max ?? 5));
  const [aprob, setAprob] = useState(String(cfg.nota_aprobatoria ?? 3));
  const [dec, setDec] = useState(String(cfg.decimales ?? 1));
  const [rangos, setRangos] = useState<RangoDesempeno[]>(
    Array.isArray(cfg.rangos_desempeno) && cfg.rangos_desempeno.length > 0
      ? cfg.rangos_desempeno.map((r: any) => ({ label: r.label ?? "", min: fmtNum(r.min), max: fmtNum(r.max), color: r.color ?? COLOR_POR_DEFECTO }))
      : [],
  );
  const [guardando, setGuardando] = useState(false);

  const actualizar = (i: number, campo: keyof RangoDesempeno, val: string) =>
    setRangos((prev) => prev.map((r, idx) => (idx === i ? { ...r, [campo]: val } : r)));
  const agregar = () => setRangos((prev) => [...prev, { label: "", min: "", max: "", color: COLOR_POR_DEFECTO }]);
  const quitar = (i: number) => setRangos((prev) => prev.filter((_, idx) => idx !== i));

  const guardar = async () => {
    const nMin = aNumero(min), nMax = aNumero(max), nAprob = aNumero(aprob), nDec = Number(dec);
    if (![nMin, nMax, nAprob, nDec].every((n) => Number.isFinite(n))) { toast({ title: "Valores inválidos", variant: "destructive" }); return; }
    if (nMax <= nMin) { toast({ title: "El máximo debe ser mayor al mínimo", variant: "destructive" }); return; }
    if (nAprob < nMin || nAprob > nMax) { toast({ title: "La nota aprobatoria debe estar dentro de la escala", variant: "destructive" }); return; }

    // Rangos: ignorar filas vacías; validar las que tengan nombre.
    const rangosLimpios: { label: string; min: number; max: number; color: string }[] = [];
    for (const r of rangos) {
      const label = r.label.trim();
      if (!label && r.min === "" && r.max === "") continue; // fila vacía → se descarta
      const rMin = aNumero(r.min), rMax = aNumero(r.max);
      if (!label) { toast({ title: "Falta el nombre de un rango", variant: "destructive" }); return; }
      if (!Number.isFinite(rMin) || !Number.isFinite(rMax)) { toast({ title: `Rango "${label}": desde/hasta inválidos`, variant: "destructive" }); return; }
      if (rMax <= rMin) { toast({ title: `Rango "${label}": el hasta debe ser mayor al desde`, variant: "destructive" }); return; }
      // Los rangos NO pueden salirse de la escala (mínima…máxima).
      if (rMin < nMin - 1e-6 || rMax > nMax + 1e-6) {
        toast({ title: `Rango "${label}" fuera de la escala`, description: `Debe estar entre ${nMin} y ${nMax}.`, variant: "destructive" });
        return;
      }
      // El rango que llega al tope se ajusta a "máxima + épsilon" para que la nota
      // máxima exacta (ej: 5.0) quede incluida (la banda usa nota ≥ desde y nota < hasta).
      const maxFinal = Math.abs(rMax - nMax) < 0.005 ? nMax + 0.0001 : rMax;
      rangosLimpios.push({ label, min: rMin, max: maxFinal, color: r.color || COLOR_POR_DEFECTO });
    }

    setGuardando(true);
    try {
      const configuracion: Record<string, unknown> = {
        escala_min: nMin, escala_max: nMax, nota_aprobatoria: nAprob, decimales: nDec, escala: `${nMin}-${nMax}`,
      };
      // Solo escribir rangos si el SuperAdmin definió alguno (no pisar con []).
      if (rangosLimpios.length > 0) configuracion.rangos_desempeno = rangosLimpios;
      await apiClient.plataforma.patchColegio(colegio.id, { configuracion });
      await onSaved();
      toast({ title: "Escala guardada" });
      volver();
    } catch (err: any) {
      toast({ title: "No se pudo guardar", description: err?.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Escala de calificación</h2>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div><Label className="text-sm">Nota mínima</Label><Input type="text" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} className="mt-1" /></div>
        <div><Label className="text-sm">Nota máxima</Label><Input type="text" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} className="mt-1" /></div>
        <div><Label className="text-sm">Nota aprobatoria</Label><Input type="text" inputMode="decimal" value={aprob} onChange={(e) => setAprob(e.target.value)} className="mt-1" /></div>
        <div><Label className="text-sm">Decimales</Label><Input type="number" step="1" min="0" max="2" value={dec} onChange={(e) => setDec(e.target.value)} className="mt-1" /></div>
      </div>

      {/* ── RANGOS DE DESEMPEÑO ── */}
      <div className="mt-8">
        <h3 className="text-base font-semibold">Rangos de desempeño</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Nombre que el colegio le da a cada tramo de notas (ej: «Sobresaliente» de 4.0 a 4.5). Cada nota debe estar entre {min} y {max} (la escala de arriba). Los colores se usan en <strong>Estadísticas</strong> para pintar cada nota según su rango.
        </p>
        {rangos.length === 0 && (
          <p className="text-sm text-muted-foreground italic mb-3">Aún no hay rangos. Agrega el primero abajo (opcional).</p>
        )}
        <div className="space-y-2">
          {rangos.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                {i === 0 && <Label className="text-xs text-muted-foreground">Nombre</Label>}
                <Input value={r.label} onChange={(e) => actualizar(i, "label", e.target.value)} placeholder="Ej: Sobresaliente" className="mt-1" />
              </div>
              <div className="w-20">
                {i === 0 && <Label className="text-xs text-muted-foreground">Desde</Label>}
                <Input type="text" inputMode="decimal" value={r.min} onChange={(e) => actualizar(i, "min", e.target.value)} className="mt-1" />
              </div>
              <div className="w-20">
                {i === 0 && <Label className="text-xs text-muted-foreground">Hasta</Label>}
                <Input type="text" inputMode="decimal" value={r.max} onChange={(e) => actualizar(i, "max", e.target.value)} className="mt-1" />
              </div>
              <div>
                {i === 0 && <Label className="text-xs text-muted-foreground">Color</Label>}
                <input type="color" value={r.color} onChange={(e) => actualizar(i, "color", e.target.value)} className="mt-1 h-10 w-12 rounded border border-border cursor-pointer p-0.5" title="Color del rango" />
              </div>
              <button onClick={() => quitar(i)} className="h-10 text-muted-foreground hover:text-destructive" title="Quitar rango"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={agregar} className="mt-3 gap-1"><Plus className="w-4 h-4" /> Agregar rango</Button>
      </div>

      <Button onClick={guardar} disabled={guardando} className="mt-8 gap-2">
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Guardar
      </Button>
    </div>
  );
};

// ───────────────────────── FICHA: PERSONAS DEL COLEGIO ─────────────────────────
// Al entrar: SOLO tarjetas por rol (cubren la pantalla). Clic en una → página
// del cargo con su lista y un botón "Agregar" que abre un POP-UP con el
// formulario. Los 6 cargos de staff son la MISMA tabla Internos (solo cambia
// el cargo). Extras por cargo: Coordinador elige nivel(es) que coordina;
// Profesor puede marcarse director de grupo (grado + salón).
const ROLES_STAFF: { cargo: string; label: string; Icono: typeof Users }[] = [
  { cargo: "Administrador", label: "Administrador(a)", Icono: ShieldCheck },
  { cargo: "Rector", label: "Rector(a)", Icono: GraduationCap },
  { cargo: "Coordinador(a)", label: "Coordinadores", Icono: Users },
  { cargo: "Administrativo(a)", label: "Administrativos", Icono: Briefcase },
  { cargo: "Orientador(a) Escolar", label: "Orientación escolar", Icono: HeartHandshake },
  { cargo: "Profesor(a)", label: "Profesores", Icono: BookOpen },
];
const NIVELES_COORDINA = ["Preescolar", "Primaria", "Secundaria", "Media"];

const FichaAdmins = ({ id, admins, onChanged, volver }: { id: string; admins: ColegioAdmin[]; onChanged: () => Promise<void>; volver: () => void }) => {
  const { toast } = useToast();
  // Rol seleccionado: null = tarjetas; un cargo de staff, o 'estudiante' / 'acudiente'.
  const [rol, setRol] = useState<string | null>(null);
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [cedula, setCedula] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [genero, setGenero] = useState("");          // "M" | "F" — obligatorio
  const [fechaNac, setFechaNac] = useState("");       // YYYY-MM-DD — opcional
  // Extras por cargo
  const [niveles, setNiveles] = useState<string[]>([]);          // Coordinador(a)
  const [esDirector, setEsDirector] = useState(false);            // Profesor(a)
  const [dirGrado, setDirGrado] = useState("");
  const [dirSalon, setDirSalon] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  // Si la cédula ya existe en Usuarios, los datos vienen de ahí y NO se pueden
  // editar (Usuarios es la única fuente de verdad de nombres/teléfono).
  const [bloqueado, setBloqueado] = useState(false);
  // Espejo de `bloqueado` para leerlo dentro del efecto sin meterlo en deps.
  const bloqueadoRef = useRef(false);
  useEffect(() => { bloqueadoRef.current = bloqueado; }, [bloqueado]);

  const reset = () => {
    setCedula(""); setNombres(""); setApellidos(""); setTelefono(""); setGenero(""); setFechaNac("");
    setNiveles([]); setEsDirector(false); setDirGrado(""); setDirSalon(""); setBloqueado(false);
  };
  // Al dejar de coincidir con una persona encontrada, limpia los datos que se
  // habían autocompletado (pero NO lo que el usuario escribió a mano).
  const limpiarSiEstabaBloqueado = () => {
    if (bloqueadoRef.current) { setNombres(""); setApellidos(""); setTelefono(""); setGenero(""); setFechaNac(""); }
    setBloqueado(false);
  };

  // Personas ya agregadas (para las listas y los conteos de las tarjetas).
  const [personas, setPersonas] = useState<{ internos: any[]; estudiantes: any[]; acudientes: any[] }>({ internos: [], estudiantes: [], acudientes: [] });
  const cargarPersonas = async () => {
    try { setPersonas(await apiClient.plataforma.listaPersonas(id)); } catch { /* noop */ }
  };
  useEffect(() => { cargarPersonas(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // Estructura del colegio (grados/salones) para la dirección de grupo del profesor.
  const [gradosCol, setGradosCol] = useState<{ grado: string }[]>([]);
  const [salonesCol, setSalonesCol] = useState<{ grado: string; salon: string }[]>([]);
  useEffect(() => {
    apiRequest<{ grados: any[]; salones: any[] }>(`/api/institucion/estructura?colegio_id=${encodeURIComponent(id)}`)
      .then((r) => {
        setGradosCol((r.grados || []).sort((a: any, b: any) => rankGrado(a.grado) - rankGrado(b.grado)));
        setSalonesCol(r.salones || []);
      })
      .catch(() => { /* sin estructura aún: el selector sale vacío */ });
  }, [id]);
  const salonesDelGrado = salonesCol.filter((s) => s.grado === dirGrado).map((s) => s.salon).sort((a, b) => Number(a) - Number(b));

  const labelRol = ROLES_STAFF.find((r) => r.cargo === rol)?.label || "";
  const esStaff = rol !== null && ROLES_STAFF.some((r) => r.cargo === rol);

  // Autocompletar MIENTRAS se escribe la cédula (con un pequeño retardo). Si la
  // persona ya existe en Usuarios, se traen sus datos y se BLOQUEAN los campos.
  useEffect(() => {
    const c = cedula.trim();
    if (!/^\d{3,15}$/.test(c)) { limpiarSiEstabaBloqueado(); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const { usuario } = await apiClient.plataforma.buscarUsuario(c);
        if (!vivo) return;
        if (usuario) {
          setNombres(usuario.nombres || "");
          setApellidos(usuario.apellidos || "");
          setTelefono(usuario.numero_de_telefono || "");
          setGenero(usuario.genero || "");
          setFechaNac(usuario.fecha_de_nacimiento || "");
          setBloqueado(true);
        } else {
          limpiarSiEstabaBloqueado();
        }
      } catch { if (vivo) limpiarSiEstabaBloqueado(); } finally {
        if (vivo) setBuscando(false);
      }
    }, 450);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cedula]);

  const agregarStaff = async () => {
    if (!/^\d{3,15}$/.test(cedula.trim())) { toast({ title: "Cédula inválida", description: "Solo números.", variant: "destructive" }); return; }
    if (!nombres.trim() || !apellidos.trim()) { toast({ title: "Faltan nombres o apellidos", variant: "destructive" }); return; }
    if (!bloqueado && genero !== "M" && genero !== "F") { toast({ title: "Falta el género", description: "El género es obligatorio.", variant: "destructive" }); return; }
    if (rol === "Profesor(a)" && esDirector && (!dirGrado || !dirSalon)) {
      toast({ title: "Falta el grupo", description: "Elige el grado y el salón del que es director(a).", variant: "destructive" }); return;
    }
    setGuardando(true);
    try {
      await apiClient.plataforma.crearInterno(id, {
        cedula: cedula.trim(), nombres: nombres.trim(), apellidos: apellidos.trim(),
        telefono: telefono.trim() || undefined, cargo: rol!,
        genero: genero || undefined, fecha_de_nacimiento: fechaNac || undefined,
        niveles_coordina: rol === "Coordinador(a)" && niveles.length > 0 ? niveles : undefined,
        direccion_de_grupo: rol === "Profesor(a)" && esDirector && dirGrado && dirSalon ? `${dirGrado} ${dirSalon}` : undefined,
      });
      reset();
      setDialogAbierto(false);
      await onChanged();
      await cargarPersonas();
      toast({ title: `${labelRol} agregado`, description: "Entra por primera vez con su cédula como contraseña." });
    } catch (err: any) {
      toast({ title: "No se pudo agregar", description: err?.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const conteo = (r: string) =>
    r === "estudiante" ? personas.estudiantes.length
    : r === "acudiente" ? personas.acudientes.length
    : personas.internos.filter((i) => i.cargo === r).length;

  const listaActual: any[] =
    !rol ? [] : esStaff ? personas.internos.filter((i) => i.cargo === rol) : rol === "estudiante" ? personas.estudiantes : personas.acudientes;
  const labelActual = esStaff ? labelRol : rol === "estudiante" ? "Estudiantes" : rol === "acudiente" ? "Acudientes" : "";

  const CardRol = ({ Icono, label, sub, onClick }: { Icono: typeof Users; label: string; sub: string; onClick: () => void }) => (
    <button onClick={onClick} className="text-left bg-card border border-border rounded-lg p-5 shadow-sm hover:border-primary/60 hover:bg-secondary/40 transition-colors">
      <div className="mb-3"><Icono className="w-8 h-8 text-primary" /></div>
      <h3 className="font-semibold text-foreground">{label}</h3>
      <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>
    </button>
  );

  // ── Vista 1: SOLO las tarjetas de roles ──
  if (!rol) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-1">Personas del colegio</h2>
        <p className="text-sm text-muted-foreground mb-4">Elige un rol para ver sus personas y agregar nuevas.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {ROLES_STAFF.map((r) => (
            <CardRol key={r.cargo} Icono={r.Icono} label={r.label} sub={`${conteo(r.cargo)} persona(s)`} onClick={() => { setRol(r.cargo); reset(); }} />
          ))}
          <CardRol Icono={Backpack} label="Estudiantes" sub={`${conteo("estudiante")} persona(s)`} onClick={() => { setRol("estudiante"); reset(); }} />
          <CardRol Icono={UsersRound} label="Acudientes" sub={`${conteo("acudiente")} persona(s)`} onClick={() => { setRol("acudiente"); reset(); }} />
        </div>
      </div>
    );
  }

  // ── Vista 2: página del rol elegido (lista + botón Agregar → pop-up) ──
  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => { setRol(null); reset(); }} className="gap-1 mb-4 bg-card">
        <ArrowLeft className="w-4 h-4" /> Roles
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h2 className="text-xl font-semibold">{labelActual} <span className="text-muted-foreground font-normal">({listaActual.length})</span></h2>
        {esStaff && (
          <Button onClick={() => { reset(); setDialogAbierto(true); }} className="gap-1">
            <Plus className="w-4 h-4" /> Agregar
          </Button>
        )}
      </div>

      {listaActual.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center bg-card">
          Aún no hay {labelActual.toLowerCase()} en este colegio.
        </p>
      ) : (
        <div className="space-y-2">
          {listaActual.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border border-border rounded-lg p-2.5 bg-card">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                {(p.nombres || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.nombres} {p.apellidos}</p>
                <p className="text-xs text-muted-foreground">
                  Cédula: {p.id}
                  {p.grado ? ` · ${p.grado}${p.salon ? ` ${p.salon}` : ""}` : ""}
                  {Array.isArray(p.niveles_coordina) && p.niveles_coordina.length > 0 ? ` · Coordina: ${p.niveles_coordina.join(", ")}` : ""}
                  {p.direccion_de_grupo ? ` · Director(a) de grupo: ${p.direccion_de_grupo}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estudiantes / Acudientes: usan sus tablas con campos adicionales (grado,
          salón, acudidos). Por ahora se registran con datos completos entrando como
          administrador del colegio (donde ya existe ese formulario). */}
      {(rol === "estudiante" || rol === "acudiente") && (
        <div className="border border-border rounded-lg p-4 bg-card text-sm text-muted-foreground mt-4">
          Para agregar {rol === "estudiante" ? "estudiantes" : "acudientes"} se piden datos adicionales
          ({rol === "estudiante" ? "grado y salón" : "estudiantes a cargo"}). Por ahora se registran con
          todos sus datos entrando como administrador del colegio (botón “Entrar como administrador” en el panel),
          donde ya existe el formulario completo con autocompletado por cédula.
        </div>
      )}

      {/* Pop-up de agregar (solo staff) */}
      <Dialog open={dialogAbierto} onOpenChange={(o) => { if (!o) { setDialogAbierto(false); reset(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar — {labelRol}</DialogTitle>
            <DialogDescription>Al escribir una cédula ya registrada, los datos se autocompletan.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Cédula *</Label>
              <Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Solo números" className="mt-1" />
              {buscando && <p className="text-xs text-muted-foreground mt-1">Buscando…</p>}
            </div>
            <div><Label className="text-sm">Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} readOnly={bloqueado} placeholder="57300…" className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
            <div><Label className="text-sm">Nombres *</Label><Input value={nombres} onChange={(e) => setNombres(e.target.value)} readOnly={bloqueado} className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
            <div><Label className="text-sm">Apellidos *</Label><Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} readOnly={bloqueado} className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
            <div>
              <Label className="text-sm">Género *</Label>
              <select
                value={genero}
                onChange={(e) => setGenero(e.target.value)}
                disabled={bloqueado}
                className={`mt-1 flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-background"}`}
              >
                <option value="">Selecciona…</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </div>
            <div><Label className="text-sm">Fecha de nacimiento <span className="text-muted-foreground">(opcional)</span></Label><Input type="date" value={fechaNac} onChange={(e) => setFechaNac(e.target.value)} readOnly={bloqueado} className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
          </div>

          {/* Coordinador: nivel(es) que coordina (puede ser más de uno) */}
          {rol === "Coordinador(a)" && (
            <div>
              <Label className="text-sm">Coordina los niveles <span className="text-muted-foreground">(elige uno o varios)</span></Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {NIVELES_COORDINA.map((n) => (
                  <label key={n} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={niveles.includes(n)}
                      onChange={() => setNiveles((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n])}
                      className="w-4 h-4 accent-primary cursor-pointer"
                    />
                    {n}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Profesor: director de grupo (grado + salón de la estructura del colegio) */}
          {rol === "Profesor(a)" && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={esDirector} onChange={(e) => { setEsDirector(e.target.checked); if (!e.target.checked) { setDirGrado(""); setDirSalon(""); } }} className="w-4 h-4 accent-primary cursor-pointer" />
                Es director(a) de grupo
              </label>
              {esDirector && (
                gradosCol.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Primero define los grados y salones en la ficha <strong>Jornadas, grados y salones</strong>.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">Grado *</Label>
                      <select value={dirGrado} onChange={(e) => { setDirGrado(e.target.value); setDirSalon(""); }} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="">Selecciona…</option>
                        {gradosCol.map((g) => <option key={g.grado} value={g.grado}>{g.grado}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-sm">Salón *</Label>
                      <select value={dirSalon} onChange={(e) => setDirSalon(e.target.value)} disabled={!dirGrado} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50">
                        <option value="">Selecciona…</option>
                        {salonesDelGrado.map((sal) => <option key={sal} value={sal}>{sal}</option>)}
                      </select>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {bloqueado && <p className="text-xs text-muted-foreground">Esta cédula ya está registrada en Usuarios — sus datos se toman de ahí y no se editan aquí.</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogAbierto(false); reset(); }} disabled={guardando}>Cancelar</Button>
            <Button onClick={agregarStaff} disabled={guardando || buscando} className="gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

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
