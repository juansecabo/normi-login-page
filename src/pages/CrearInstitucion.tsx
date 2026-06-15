import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Building2, Image as ImageIcon, GraduationCap, Users, ArrowLeft,
  Loader2, Pencil, Check, Rocket, Clock, Plus, Trash2,
} from "lucide-react";
import HeaderNormi from "@/components/HeaderNormi";
import EscudoColegio from "@/components/EscudoColegio";
import EstructuraColegioEditor from "@/components/EstructuraColegioEditor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getSession } from "@/hooks/useSession";
import { apiClient, type ColegioDetalle, type ColegioAdmin } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Wizard de Crear/Configurar Institución para el SuperAdmin. Opera sobre un
 * colegio en estado 'borrador' identificado por la ruta (:id). Está dividido en
 * sub-fichas (datos, escudo, escala, administradores) para no abrumar en una
 * sola pantalla. Todo se va guardando en el borrador; "Publicar" lo activa.
 */
type Vista = "menu" | "datos" | "escudo" | "escala" | "estructura" | "admins";

const CrearInstitucion = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [colegio, setColegio] = useState<ColegioDetalle | null>(null);
  const [admins, setAdmins] = useState<ColegioAdmin[]>([]);
  const [estructura, setEstructura] = useState<{ jornadas: number; grados: number; salones: number }>({ jornadas: 0, grados: 0, salones: 0 });
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>("menu");
  const [publicando, setPublicando] = useState(false);

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
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard-plataforma")} className="gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Volver al panel
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
              <VolverBtn onClick={() => { setVista("menu"); cargar(); }} />
              <h2 className="text-xl font-semibold mb-1">Jornadas, grados y salones</h2>
              <p className="text-sm text-muted-foreground mb-4">Define la estructura del colegio. Es opcional para publicar, pero deja la institución lista para registrar estudiantes.</p>
              <EstructuraColegioEditor colegioId={id} />
            </div>
          )}
          {vista === "admins" && <FichaAdmins id={id} admins={admins} onChanged={cargar} volver={() => setVista("menu")} />}
        </div>
      </main>
    </div>
  );
};

// ───────────────────────── MENÚ DE FICHAS ─────────────────────────
const MenuFichas = ({
  admins, cfg, estructura, ir, puedePublicar, publicar, publicando, tieneNombre, tieneAdmin, yaActivo,
}: {
  colegio: ColegioDetalle; admins: ColegioAdmin[]; cfg: Record<string, any>;
  estructura: { jornadas: number; grados: number; salones: number };
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
        <Card icon={<ImageIcon className="w-8 h-8 text-primary" />} label="Escudo" sub="Imagen institucional (500×500)" onClick={() => ir("escudo")} />
        <Card icon={<GraduationCap className="w-8 h-8 text-primary" />} label="Escala de calificación" sub={`${cfg.escala_min ?? 0} a ${cfg.escala_max ?? 5} · aprueba con ${cfg.nota_aprobatoria ?? 3}`} onClick={() => ir("escala")} />
        <Card icon={<Clock className="w-8 h-8 text-primary" />} label="Jornadas, grados y salones" sub={estructura.grados ? `${estructura.grados} grado(s) · ${estructura.salones} salón(es)` : "Define la estructura (opcional)"} onClick={() => ir("estructura")} ok={estructura.grados > 0} />
        <Card icon={<Users className="w-8 h-8 text-primary" />} label="Administradores" sub={admins.length ? `${admins.length} asignado(s)` : "Opcional — puede agregarse después"} onClick={() => ir("admins")} ok={tieneAdmin} />
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

const VolverBtn = ({ onClick }: { onClick: () => void }) => (
  <Button variant="outline" size="sm" onClick={onClick} className="gap-1 mb-4">
    <ArrowLeft className="w-4 h-4" /> Volver
  </Button>
);

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
      <VolverBtn onClick={volver} />
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
      <VolverBtn onClick={volver} />
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
    const nMin = Number(min), nMax = Number(max), nAprob = Number(aprob), nDec = Number(dec);
    if (![nMin, nMax, nAprob, nDec].every((n) => Number.isFinite(n))) { toast({ title: "Valores inválidos", variant: "destructive" }); return; }
    if (nMax <= nMin) { toast({ title: "El máximo debe ser mayor al mínimo", variant: "destructive" }); return; }
    if (nAprob < nMin || nAprob > nMax) { toast({ title: "La nota aprobatoria debe estar dentro de la escala", variant: "destructive" }); return; }

    // Rangos: ignorar filas vacías; validar las que tengan nombre.
    const rangosLimpios: { label: string; min: number; max: number; color: string }[] = [];
    for (const r of rangos) {
      const label = r.label.trim();
      if (!label && r.min === "" && r.max === "") continue; // fila vacía → se descarta
      const rMin = Number(r.min), rMax = Number(r.max);
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
      <VolverBtn onClick={volver} />
      <h2 className="text-xl font-semibold mb-4">Escala de calificación</h2>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div><Label className="text-sm">Nota mínima</Label><Input type="number" step="0.1" value={min} onChange={(e) => setMin(e.target.value)} className="mt-1" /></div>
        <div><Label className="text-sm">Nota máxima</Label><Input type="number" step="0.1" value={max} onChange={(e) => setMax(e.target.value)} className="mt-1" /></div>
        <div><Label className="text-sm">Nota aprobatoria</Label><Input type="number" step="0.1" value={aprob} onChange={(e) => setAprob(e.target.value)} className="mt-1" /></div>
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
                <Input type="number" step="0.1" min={min} max={max} value={r.min} onChange={(e) => actualizar(i, "min", e.target.value)} className="mt-1" />
              </div>
              <div className="w-20">
                {i === 0 && <Label className="text-xs text-muted-foreground">Hasta</Label>}
                <Input type="number" step="0.1" min={min} max={max} value={r.max} onChange={(e) => actualizar(i, "max", e.target.value)} className="mt-1" />
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

// ───────────────────────── FICHA: ADMINISTRADORES ─────────────────────────
const FichaAdmins = ({ id, admins, onChanged, volver }: { id: string; admins: ColegioAdmin[]; onChanged: () => Promise<void>; volver: () => void }) => {
  const { toast } = useToast();
  const [cedula, setCedula] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [guardando, setGuardando] = useState(false);

  const agregar = async () => {
    if (!/^\d{3,15}$/.test(cedula.trim())) { toast({ title: "Cédula inválida", description: "Solo números.", variant: "destructive" }); return; }
    if (!nombres.trim() || !apellidos.trim()) { toast({ title: "Faltan nombres o apellidos", variant: "destructive" }); return; }
    setGuardando(true);
    try {
      await apiClient.plataforma.crearAdmin(id, { cedula: cedula.trim(), nombres: nombres.trim(), apellidos: apellidos.trim(), telefono: telefono.trim() || undefined });
      setCedula(""); setNombres(""); setApellidos(""); setTelefono("");
      await onChanged();
      toast({ title: "Administrador agregado", description: "Entra por primera vez con su cédula como contraseña." });
    } catch (err: any) {
      toast({ title: "No se pudo agregar", description: err?.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <VolverBtn onClick={volver} />
      <h2 className="text-xl font-semibold mb-1">Administradores</h2>
      <p className="text-sm text-muted-foreground mb-4">El administrador podrá entrar a la plataforma y configurar el resto del colegio.</p>

      {admins.length > 0 && (
        <div className="space-y-2 mb-6">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border border-border rounded-lg p-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                {(a.nombres || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{a.nombres} {a.apellidos}</p>
                <p className="text-xs text-muted-foreground">Cédula: {a.id}{a.numero_de_telefono ? ` · ${a.numero_de_telefono}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border border-border rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-sm">Agregar administrador</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-sm">Cédula *</Label><Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Solo números" className="mt-1" /></div>
          <div><Label className="text-sm">Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="57300…" className="mt-1" /></div>
          <div><Label className="text-sm">Nombres *</Label><Input value={nombres} onChange={(e) => setNombres(e.target.value)} className="mt-1" /></div>
          <div><Label className="text-sm">Apellidos *</Label><Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} className="mt-1" /></div>
        </div>
        <Button onClick={agregar} disabled={guardando} className="gap-2">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Agregar
        </Button>
      </div>
    </div>
  );
};

export default CrearInstitucion;
