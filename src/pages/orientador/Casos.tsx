import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, isOrientador, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Plus, Search } from "lucide-react";
import iconCasos from "@/assets/icons/casos.png";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo": 0, "Prejardín": 1, "Jardín": 2, "Transición": 3,
  "Primero": 4, "Segundo": 5, "Tercero": 6, "Cuarto": 7, "Quinto": 8,
  "Sexto": 9, "Séptimo": 10, "Octavo": 11, "Noveno": 12,
  "Décimo": 13, "Undécimo": 14,
};

const ESTADOS = [
  { value: "abierto", label: "Abierto", color: "bg-emerald-100 text-emerald-700" },
  { value: "cerrado", label: "Cerrado", color: "bg-rose-100 text-rose-700" },
];

interface Estudiante {
  id: number;
  nombres: string;
  apellidos: string;
  grado: string;
  salon: string;
  fecha_de_nacimiento?: string | null;
}

// Hoy en zona de Bogotá (independiente del navegador)
const hoyBogota = (): Date => {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  return new Date(y, m - 1, d);
};

// Calcula edad en años cumplidos a hoy (Bogotá)
const calcularEdad = (nac: Date): number => {
  const hoy = hoyBogota();
  let e = hoy.getFullYear() - nac.getFullYear();
  const dm = hoy.getMonth() - nac.getMonth();
  if (dm < 0 || (dm === 0 && hoy.getDate() < nac.getDate())) e--;
  return e;
};

interface Caso {
  id: number;
  estudiante_id: number;
  estudiante_nombre: string;
  estudiante_apellidos: string;
  estudiante_grado: string;
  estudiante_salon: string;
  motivo_atencion: string;
  estado: string;
  fecha_apertura: string;
  created_at: string;
  tipo_diagnostico: string | null;
}

const fmtFecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const Section = ({ n, title, openSec, setOpenSec, children }: { n: number; title: string; openSec: number | null; setOpenSec: (v: number | null) => void; children: React.ReactNode }) => (
  <div className="border border-border rounded-md overflow-hidden">
    <button type="button" onClick={() => setOpenSec(openSec === n ? null : n)} className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 text-sm font-semibold cursor-pointer">
      <span>{n}. {title}</span>
      <ChevronDown className={`w-4 h-4 transition-transform ${openSec === n ? "rotate-180" : ""}`} />
    </button>
    {openSec === n && <div className="p-3 space-y-3">{children}</div>}
  </div>
);

const Field = ({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
  <div>
    <label className="text-xs font-medium block mb-1 text-muted-foreground">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background" />
  </div>
);

const Area = ({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) => (
  <div>
    {label && <label className="text-xs font-medium block mb-1 text-muted-foreground">{label}</label>}
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background resize-y" />
  </div>
);

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const BirthDateInput = ({ value, onChange }: { value: Date | undefined; onChange: (d: Date | undefined) => void }) => {
  const [day, setDay] = useState<string>(value ? String(value.getDate()) : "");
  const [month, setMonth] = useState<string>(value ? String(value.getMonth()) : "");
  const [year, setYear] = useState<string>(value ? String(value.getFullYear()) : "");

  useEffect(() => {
    if (!value) { setDay(""); setMonth(""); setYear(""); }
    else {
      setDay(String(value.getDate()));
      setMonth(String(value.getMonth()));
      setYear(String(value.getFullYear()));
    }
  }, [value]);

  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 30; y--) years.push(y);

  const propagate = (d: string, m: string, y: string) => {
    if (d === "" || m === "" || y === "") { onChange(undefined); return; }
    onChange(new Date(Number(y), Number(m), Number(d), 12, 0, 0));
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      <select value={day} onChange={e => { setDay(e.target.value); propagate(e.target.value, month, year); }} className="px-2 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
        <option value="">Día</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={month} onChange={e => { setMonth(e.target.value); propagate(day, e.target.value, year); }} className="px-2 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
        <option value="">Mes</option>
        {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
      </select>
      <select value={year} onChange={e => { setYear(e.target.value); propagate(day, month, e.target.value); }} className="px-2 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
        <option value="">Año</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
};

interface FormState {
  lugar_nacimiento: string;
  fecha_nacimiento: Date | undefined;
  edad: string;
  celular: string;
  barrio: string;
  municipio: string;
  enfermedades_padecidas: string;
  estado_salud: string;
  relacion_companeros_docentes: string;
  materias_gustan: string;
  materias_dificultan: string;
  motivo_atencion: string;
  padre_nombre: string;
  padre_ocupacion: string;
  padre_empresa: string;
  padre_celular: string;
  madre_nombre: string;
  madre_ocupacion: string;
  madre_empresa: string;
  madre_celular: string;
  situacion_padres: string;
  situacion_reportada: string;
  intervencion: string;
  compromisos_estudiante: string;
}

const emptyForm = (): FormState => ({
  lugar_nacimiento: "", fecha_nacimiento: undefined, edad: "", celular: "", barrio: "", municipio: "",
  enfermedades_padecidas: "", estado_salud: "", relacion_companeros_docentes: "",
  materias_gustan: "", materias_dificultan: "",
  motivo_atencion: "",
  padre_nombre: "", padre_ocupacion: "", padre_empresa: "", padre_celular: "",
  madre_nombre: "", madre_ocupacion: "", madre_empresa: "", madre_celular: "",
  situacion_padres: "",
  situacion_reportada: "", intervencion: "", compromisos_estudiante: "",
});

const Casos = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [casos, setCasos] = useState<Caso[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [soloDiagnostico, setSoloDiagnostico] = useState(false);
  const [autor, setAutor] = useState<{ id: string; nombre: string }>({ id: "", nombre: "" });

  // Modal nuevo caso
  const [showNuevo, setShowNuevo] = useState(false);
  const [estBusqueda, setEstBusqueda] = useState("");
  const [estSeleccionado, setEstSeleccionado] = useState<Estudiante | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [fechaApertura, setFechaApertura] = useState<Date | undefined>(new Date());
  const [guardando, setGuardando] = useState(false);
  const [openSec, setOpenSec] = useState<number | null>(1);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const backLink = isAdmin() ? "/dashboard" : "/dashboard";

  useEffect(() => {
    const session = getSession();
    if (!session.id || (!isOrientador() && !isAdmin() && !puedeAccederDashboard())) { navigate("/"); return; }
    setAutor({ id: session.id, nombre: `${session.nombres || ""} ${session.apellidos || ""}`.trim() });
    (async () => {
      const [cR, eR] = await Promise.all([
        supabase.from("Casos_Orientacion").select("id, estudiante_id, estudiante_nombre, estudiante_apellidos, estudiante_grado, estudiante_salon, motivo_atencion, estado, fecha_apertura, created_at, tipo_diagnostico").order("created_at", { ascending: false }),
        supabase.from("Estudiantes").select("id, grado, salon"),
      ]);
      setCasos((cR.data || []) as Caso[]);
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      setEstudiantes(sortByApellidosNombres(await enrichWithNombres((eR.data || []) as any)));
      setLoading(false);
    })();
  }, [navigate]);

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const gradosUnicos = useMemo(() =>
    [...new Set(casos.map(c => c.estudiante_grado))].sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99))
  , [casos]);
  const salonesUnicos = useMemo(() => [...new Set(
    casos.filter(c => !filtroGrado || c.estudiante_grado === filtroGrado).map(c => c.estudiante_salon)
  )].sort(), [casos, filtroGrado]);

  const casosFiltrados = useMemo(() => {
    const q = norm(busqueda.trim());
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const onlyDigits = q.replace(/\D+/g, "");
    return casos.filter(c => {
      if (filtroEstado && c.estado !== filtroEstado) return false;
      if (filtroGrado && c.estudiante_grado !== filtroGrado) return false;
      if (filtroSalon && c.estudiante_salon !== filtroSalon) return false;
      if (soloDiagnostico && !c.tipo_diagnostico) return false;
      if (q) {
        const full = norm(`${c.estudiante_nombre} ${c.estudiante_apellidos}`);
        const matchNombre = tokens.every(t => full.includes(t));
        const matchId = onlyDigits.length > 0 && String(c.estudiante_id).includes(onlyDigits);
        if (!matchNombre && !matchId) return false;
      }
      return true;
    }).sort((a, b) => {
      const ap = norm(a.estudiante_apellidos || "").localeCompare(norm(b.estudiante_apellidos || ""));
      if (ap !== 0) return ap;
      const np = norm(a.estudiante_nombre || "").localeCompare(norm(b.estudiante_nombre || ""));
      if (np !== 0) return np;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [casos, filtroEstado, filtroGrado, filtroSalon, busqueda, soloDiagnostico]);

  const estudiantesBusqueda = useMemo(() => {
    const q = norm(estBusqueda.trim());
    if (!q || q.length < 2) return [] as Estudiante[];
    const tokens = q.split(/\s+/).filter(Boolean);
    return estudiantes.filter(e => {
      const full = norm(`${e.nombres} ${e.apellidos}`);
      return tokens.every(t => full.includes(t));
    }).slice(0, 8);
  }, [estudiantes, estBusqueda]);

  const seleccionarEstudiante = (e: Estudiante) => {
    setEstSeleccionado(e);
    setEstBusqueda("");
    // Auto-llenar fecha de nacimiento y edad si el estudiante la tiene en la DB
    if (e.fecha_de_nacimiento) {
      const [y, m, d] = e.fecha_de_nacimiento.split("-").map(Number);
      if (y && m && d) {
        const nac = new Date(y, m - 1, d);
        const edad = calcularEdad(nac);
        setForm(f => ({
          ...f,
          fecha_nacimiento: nac,
          edad: edad >= 0 ? String(edad) : f.edad,
        }));
      }
    }
  };

  // Fase 10.E.17: los acudientes ya no se cachean en Estudiantes.*
  // Se leen de Acudientes JOIN Usuarios por slot.
  const [acudientesEstudiante, setAcudientesEstudiante] = useState<{ nombre: string; telefono: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!estSeleccionado) { setAcudientesEstudiante([]); return; }
      const est = estSeleccionado;
      const { data: acus } = await supabase
        .from("Acudientes")
        .select("id, acudido1_id, acudido2_id, acudido3_id, acudido4_id")
        .or(`acudido1_id.eq.${est.id},acudido2_id.eq.${est.id},acudido3_id.eq.${est.id},acudido4_id.eq.${est.id}`);
      const ids = (acus || []).map((a: any) => a.id);
      if (ids.length === 0) { if (!cancelled) setAcudientesEstudiante([]); return; }
      const { data: usuarios } = await supabase
        .from("Usuarios")
        .select("id, nombres, apellidos, numero_de_telefono")
        .in("id", ids);
      const list = (usuarios || []).map((u: any) => ({
        nombre: `${u.nombres || ""} ${u.apellidos || ""}`.trim(),
        telefono: String(u.numero_de_telefono || ""),
      })).filter((x) => x.nombre);
      if (!cancelled) setAcudientesEstudiante(list);
    };
    run();
    return () => { cancelled = true; };
  }, [estSeleccionado]);

  // Snapshot para detectar cambios reales al cerrar el modal nuevo
  const initialSnapshotRef = useRef<string>("");
  const snapshotKey = () => JSON.stringify({
    estId: estSeleccionado?.id ?? null,
    fa: fechaApertura ? fmtLocal(fechaApertura) : null,
    f: { ...form, fecha_nacimiento: form.fecha_nacimiento ? fmtLocal(form.fecha_nacimiento) : null },
  });
  useEffect(() => {
    if (showNuevo) initialSnapshotRef.current = snapshotKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNuevo]);
  const formHasChanges = () => snapshotKey() !== initialSnapshotRef.current;

  const resetForm = () => {
    setEstSeleccionado(null);
    setEstBusqueda("");
    setForm(emptyForm());
    setFechaApertura(new Date());
    setOpenSec(1);
  };

  const intentarCerrarNuevo = (open: boolean) => {
    if (open) { setShowNuevo(true); return; }
    if (formHasChanges()) { setConfirmCloseOpen(true); return; }
    setShowNuevo(false);
  };
  const confirmarCerrar = () => {
    setConfirmCloseOpen(false);
    setShowNuevo(false);
    resetForm();
  };

  const handleGuardarNuevo = async () => {
    if (!estSeleccionado || !form.motivo_atencion.trim() || !fechaApertura) {
      toast({ title: "Faltan datos", description: "Selecciona estudiante y completa al menos el motivo de atención.", variant: "destructive" });
      return;
    }
    setGuardando(true);
    const payload: any = {
      estudiante_id: estSeleccionado.id,
      estudiante_nombre: estSeleccionado.nombres,
      estudiante_apellidos: estSeleccionado.apellidos,
      estudiante_grado: estSeleccionado.grado,
      estudiante_salon: estSeleccionado.salon,

      lugar_nacimiento: form.lugar_nacimiento.trim() || null,
      fecha_nacimiento: form.fecha_nacimiento ? fmtLocal(form.fecha_nacimiento) : null,
      edad: form.edad ? Number(form.edad) : null,
      celular: form.celular.trim() || null,
      barrio: form.barrio.trim() || null,
      municipio: form.municipio.trim() || null,

      enfermedades_padecidas: form.enfermedades_padecidas.trim() || null,
      estado_salud: form.estado_salud.trim() || null,
      relacion_companeros_docentes: form.relacion_companeros_docentes.trim() || null,
      materias_gustan: form.materias_gustan.trim() || null,
      materias_dificultan: form.materias_dificultan.trim() || null,

      motivo_atencion: form.motivo_atencion.trim(),

      padre_nombre: form.padre_nombre.trim() || null,
      padre_ocupacion: form.padre_ocupacion.trim() || null,
      padre_empresa: form.padre_empresa.trim() || null,
      padre_celular: form.padre_celular.trim() || null,
      madre_nombre: form.madre_nombre.trim() || null,
      madre_ocupacion: form.madre_ocupacion.trim() || null,
      madre_empresa: form.madre_empresa.trim() || null,
      madre_celular: form.madre_celular.trim() || null,
      situacion_padres: form.situacion_padres.trim() || null,

      situacion_reportada: form.situacion_reportada.trim() || null,
      intervencion: form.intervencion.trim() || null,
      compromisos_estudiante: form.compromisos_estudiante.trim() || null,

      estado: "abierto",
      fecha_apertura: fmtLocal(fechaApertura),
      autor_id: autor.id,
      autor_nombre: autor.nombre,
    };
    const { data, error } = await supabase.from("Casos_Orientacion").insert(payload).select("id").maybeSingle();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setShowNuevo(false);
      resetForm();
      // Ir directo al detalle del caso recién creado
      if (data?.id) navigate(`/orientador/casos/${data.id}`);
    }
    setGuardando(false);
  };

  const estadoBadge = (e: string) => {
    const m = ESTADOS.find(x => x.value === e);
    return <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${m?.color || ""}`}>{m?.label || e}</span>;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Casos de Seguimiento</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <img src={iconCasos} alt="" className="h-6 w-6 object-contain" /> Casos de Seguimiento
            </h2>
            <button onClick={() => setShowNuevo(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer">
              <Plus className="w-4 h-4" /> Nuevo caso
            </button>
          </div>

          {loading ? <div className="text-center py-8 text-muted-foreground">Cargando...</div> : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre del estudiante o número de identificación..."
                  className="w-full pl-9 pr-3 py-2 border border-input rounded-md text-sm bg-background"
                />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los estados</option>
                  {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
                <select value={filtroGrado} onChange={(e) => { setFiltroGrado(e.target.value); setFiltroSalon(""); }} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los grados</option>
                  {gradosUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={filtroSalon} onChange={(e) => setFiltroSalon(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm bg-background cursor-pointer">
                  <option value="">Todos los salones</option>
                  {salonesUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <label className="inline-flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={soloDiagnostico} onChange={(e) => setSoloDiagnostico(e.target.checked)} className="accent-primary" />
                  Solo con diagnóstico
                </label>
              </div>

              {casosFiltrados.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay casos con estos filtros</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{casosFiltrados.length} {casosFiltrados.length === 1 ? "caso" : "casos"}</p>
                  {casosFiltrados.map(c => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/orientador/casos/${c.id}`)}
                      className="w-full text-left border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="inline-block px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">{c.estudiante_grado} {c.estudiante_salon}</span>
                        {estadoBadge(c.estado)}
                        {c.tipo_diagnostico && <span className="inline-block px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">Con diagnóstico</span>}
                      </div>
                      <p className="font-semibold text-foreground">{c.estudiante_apellidos} {c.estudiante_nombre}</p>
                      <p className="text-xs text-muted-foreground">Identificación: {c.estudiante_id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium">Motivo:</span> {c.motivo_atencion}</p>
                      <p className="text-xs text-muted-foreground">Abierto el {fmtFecha(c.fecha_apertura)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modal nuevo caso — REGISTRO ACUMULATIVO */}
      <Dialog open={showNuevo} onOpenChange={intentarCerrarNuevo}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registro acumulativo · Nuevo caso</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="border border-border rounded-md p-3 space-y-3 bg-muted/10">
              <div>
                <label className="text-sm font-medium block mb-1">Estudiante *</label>
                {estSeleccionado ? (
                  <div className="flex items-center justify-between border border-border rounded-md p-2 bg-card">
                    <div>
                      <p className="text-sm font-semibold">{estSeleccionado.apellidos} {estSeleccionado.nombres}</p>
                      <p className="text-xs text-muted-foreground">Identificación: {estSeleccionado.id} · {estSeleccionado.grado} {estSeleccionado.salon}</p>
                    </div>
                    <button onClick={() => { setEstSeleccionado(null); setEstBusqueda(""); }} className="text-xs text-primary hover:underline">Cambiar</button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input value={estBusqueda} onChange={e => setEstBusqueda(e.target.value)} placeholder="Busca por nombre o apellido..." className="w-full pl-9 pr-3 py-2 border border-input rounded-md text-sm bg-background" />
                    </div>
                    {estudiantesBusqueda.length > 0 && (
                      <div className="border border-border rounded-md mt-1 max-h-48 overflow-y-auto bg-card">
                        {estudiantesBusqueda.map(e => (
                          <button key={e.id} onClick={() => seleccionarEstudiante(e)} className="block w-full text-left px-3 py-2 text-sm hover:bg-muted/50">
                            {e.apellidos} {e.nombres}
                            <span className="text-xs text-muted-foreground"> — {e.grado} {e.salon} · ID {e.id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Fecha de apertura *</label>
                <input
                  type="date"
                  value={fechaApertura ? fmtLocal(fechaApertura) : ""}
                  onChange={e => setFechaApertura(e.target.value ? new Date(e.target.value + "T12:00:00") : undefined)}
                  className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background"
                />
              </div>
            </div>

            <Section n={1} title="Datos biográficos · Aspecto físico y emocional" openSec={openSec} setOpenSec={setOpenSec}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lugar de nacimiento" value={form.lugar_nacimiento} onChange={v => setForm(f => ({ ...f, lugar_nacimiento: v }))} placeholder="Sincelejo, Sucre" />
                <div>
                  <label className="text-xs font-medium block mb-1 text-muted-foreground">Fecha de nacimiento</label>
                  <BirthDateInput value={form.fecha_nacimiento} onChange={d => setForm(f => ({ ...f, fecha_nacimiento: d }))} />
                </div>
                <Field label="Edad" type="number" value={form.edad} onChange={v => setForm(f => ({ ...f, edad: v }))} />
                <Field label="Cel." value={form.celular} onChange={v => setForm(f => ({ ...f, celular: v }))} />
                <Field label="Barrio" value={form.barrio} onChange={v => setForm(f => ({ ...f, barrio: v }))} />
                <Field label="Municipio" value={form.municipio} onChange={v => setForm(f => ({ ...f, municipio: v }))} />
              </div>
              <Area label="Enfermedades padecidas" value={form.enfermedades_padecidas} onChange={v => setForm(f => ({ ...f, enfermedades_padecidas: v }))} />
              <Area label="Estado de salud actual" value={form.estado_salud} onChange={v => setForm(f => ({ ...f, estado_salud: v }))} />
              <Area label="Relación con compañeros y docentes" value={form.relacion_companeros_docentes} onChange={v => setForm(f => ({ ...f, relacion_companeros_docentes: v }))} />
              <Area label="Materias que más le gustan" value={form.materias_gustan} onChange={v => setForm(f => ({ ...f, materias_gustan: v }))} />
              <Area label="Materias que se le dificultan" value={form.materias_dificultan} onChange={v => setForm(f => ({ ...f, materias_dificultan: v }))} />
            </Section>

            <Section n={2} title="Motivo de la atención *" openSec={openSec} setOpenSec={setOpenSec}>
              <Area label="" value={form.motivo_atencion} onChange={v => setForm(f => ({ ...f, motivo_atencion: v }))} rows={3} placeholder="Describe brevemente el motivo por el cual se abre el caso" />
            </Section>

            <Section n={3} title="Datos familiares" openSec={openSec} setOpenSec={setOpenSec}>
              {acudientesEstudiante.length > 0 && (
                <div className="border border-border rounded p-2 bg-muted/10">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Acudientes registrados — toca uno para usarlo como padre o madre:</p>
                  <div className="flex flex-wrap gap-2">
                    {acudientesEstudiante.map((a, i) => (
                      <div key={i} className="inline-flex items-center gap-1 border border-border rounded-full bg-card px-2 py-1 text-xs">
                        <span className="font-medium">{a.nombre}</span>
                        {a.telefono && <span className="text-muted-foreground">· {a.telefono}</span>}
                        <button type="button" onClick={() => setForm(f => ({ ...f, padre_nombre: a.nombre, padre_celular: a.telefono || f.padre_celular }))} className="ml-1 px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20">Padre</button>
                        <button type="button" onClick={() => setForm(f => ({ ...f, madre_nombre: a.nombre, madre_celular: a.telefono || f.madre_celular }))} className="px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20">Madre</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2 border border-border rounded p-2">
                  <p className="text-xs font-semibold text-foreground">Datos del padre</p>
                  <Field label="Nombre del padre" value={form.padre_nombre} onChange={v => setForm(f => ({ ...f, padre_nombre: v }))} />
                  <Field label="Ocupación" value={form.padre_ocupacion} onChange={v => setForm(f => ({ ...f, padre_ocupacion: v }))} />
                  <Field label="Empresa donde labora" value={form.padre_empresa} onChange={v => setForm(f => ({ ...f, padre_empresa: v }))} />
                  <Field label="N° Celular" value={form.padre_celular} onChange={v => setForm(f => ({ ...f, padre_celular: v }))} />
                </div>
                <div className="space-y-2 border border-border rounded p-2">
                  <p className="text-xs font-semibold text-foreground">Datos de la madre</p>
                  <Field label="Nombre de la madre" value={form.madre_nombre} onChange={v => setForm(f => ({ ...f, madre_nombre: v }))} />
                  <Field label="Ocupación" value={form.madre_ocupacion} onChange={v => setForm(f => ({ ...f, madre_ocupacion: v }))} />
                  <Field label="Empresa donde labora" value={form.madre_empresa} onChange={v => setForm(f => ({ ...f, madre_empresa: v }))} />
                  <Field label="N° Celular" value={form.madre_celular} onChange={v => setForm(f => ({ ...f, madre_celular: v }))} />
                </div>
              </div>
              <Area label="Situación actual de los padres" value={form.situacion_padres} onChange={v => setForm(f => ({ ...f, situacion_padres: v }))} />
            </Section>

            <Section n={4} title="Situación reportada" openSec={openSec} setOpenSec={setOpenSec}>
              <Area label="Resumen de la situación" value={form.situacion_reportada} onChange={v => setForm(f => ({ ...f, situacion_reportada: v }))} rows={4} />
            </Section>

            <Section n={5} title="Intervención" openSec={openSec} setOpenSec={setOpenSec}>
              <Area label="Estrategias usadas en la sesión, escucha activa, acuerdos o pruebas aplicadas" value={form.intervencion} onChange={v => setForm(f => ({ ...f, intervencion: v }))} rows={4} />
            </Section>

            <Section n={6} title="Compromisos del estudiante" openSec={openSec} setOpenSec={setOpenSec}>
              <Area label="" value={form.compromisos_estudiante} onChange={v => setForm(f => ({ ...f, compromisos_estudiante: v }))} rows={4} />
            </Section>
          </div>
          <DialogFooter>
            <button onClick={() => intentarCerrarNuevo(false)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">Cancelar</button>
            <button onClick={handleGuardarNuevo} disabled={guardando || !estSeleccionado || !form.motivo_atencion.trim()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {guardando ? "Guardando..." : "Guardar caso"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar cierre con datos sin guardar */}
      <Dialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Salir del registro del caso?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tienes datos sin guardar. Si sales ahora se perderá la información ingresada.
          </p>
          <DialogFooter>
            <button onClick={() => setConfirmCloseOpen(false)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">Seguir editando</button>
            <button onClick={confirmarCerrar} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90">Salir y descartar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Casos;
