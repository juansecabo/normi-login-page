import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSession, isOrientador, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Plus, Search, Trash2, Pencil, FileDown } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import FirmaImage from "@/components/FirmaImage";
import iconCasos from "@/assets/icons/casos.png";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const ESTADOS = [
  { value: "abierto", label: "Abierto", color: "bg-emerald-100 text-emerald-700" },
  { value: "cerrado", label: "Cerrado", color: "bg-rose-100 text-rose-700" },
];

interface Estudiante {
  id_estudiantil: number;
  nombre_estudiante: string;
  apellidos_estudiante: string;
  grado_estudiante: string;
  salon_estudiante: string;
  nombre_acudiente?: string | null;
  telefono_acudiente?: string[] | null;
  nombre_acudiente2?: string | null;
  telefono_acudiente2?: string[] | null;
  nombre_acudiente3?: string | null;
  telefono_acudiente3?: string[] | null;
}

interface Seguimiento {
  fecha: string;
  anotacion: string;
  observaciones: string;
  autor_nombre: string;
}

interface Caso {
  id: number;
  estudiante_id: number;
  estudiante_nombre: string;
  estudiante_apellidos: string;
  estudiante_grado: string;
  estudiante_salon: string;
  lugar_nacimiento: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
  celular: string | null;
  barrio: string | null;
  municipio: string | null;
  enfermedades_padecidas: string | null;
  estado_salud: string | null;
  relacion_companeros_docentes: string | null;
  materias_gustan: string | null;
  materias_dificultan: string | null;
  motivo_atencion: string;
  padre_nombre: string | null;
  padre_ocupacion: string | null;
  padre_empresa: string | null;
  padre_celular: string | null;
  madre_nombre: string | null;
  madre_ocupacion: string | null;
  madre_empresa: string | null;
  madre_celular: string | null;
  situacion_padres: string | null;
  situacion_reportada: string | null;
  intervencion: string | null;
  compromisos_estudiante: string | null;
  estado: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  seguimientos: Seguimiento[] | null;
  firma_orientadora_url: string | null;
  firma_estudiante_url: string | null;
  autor_id: string;
  autor_nombre: string;
  created_at: string;
}

const fmtFecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const escapeHtml = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sanitizeFilename = (s: string) =>
  s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_").trim();

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

const FirmaBlock = ({
  label, urlGuardada, onSave, onClear, saving,
}: {
  label: string;
  urlGuardada: string | null;
  onSave: (dataUrl: string) => Promise<void>;
  onClear: () => Promise<void>;
  saving: boolean;
}) => {
  const sigRef = useRef<any>(null);
  const [hasInk, setHasInk] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleEnd = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) setHasInk(true);
  };
  const limpiar = () => { sigRef.current?.clear(); setHasInk(false); };
  const guardar = () => {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    onSave(sigRef.current.toDataURL("image/png"));
  };
  const confirmarBorrar = async () => {
    await onClear();
    setConfirmOpen(false);
  };

  if (urlGuardada) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-start gap-2">
          <FirmaImage url={urlGuardada} className="max-h-24 border border-border rounded p-1 bg-white" />
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={saving}
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-50"
            title="Borrar firma"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <Dialog open={confirmOpen} onOpenChange={(o) => !o && !saving && setConfirmOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Borrar la firma?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Se eliminará la firma guardada de <strong>{label}</strong>. Esta acción no se puede deshacer.
            </p>
            <DialogFooter>
              <button onClick={() => setConfirmOpen(false)} disabled={saving} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted disabled:opacity-50">Cancelar</button>
              <button onClick={confirmarBorrar} disabled={saving} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50">
                {saving ? "Borrando..." : "Borrar"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="border-2 border-dashed border-border rounded bg-white">
        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          canvasProps={{ className: "w-full", style: { width: "100%", height: "120px" } }}
          onEnd={handleEnd}
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={limpiar}
          className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:bg-accent cursor-pointer"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={!hasInk || saving}
          className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar firma"}
        </button>
      </div>
    </div>
  );
};

const formFromCaso = (c: Caso): FormState => ({
  lugar_nacimiento: c.lugar_nacimiento || "",
  fecha_nacimiento: c.fecha_nacimiento ? new Date(c.fecha_nacimiento + "T12:00:00") : undefined,
  edad: c.edad != null ? String(c.edad) : "",
  celular: c.celular || "",
  barrio: c.barrio || "",
  municipio: c.municipio || "",
  enfermedades_padecidas: c.enfermedades_padecidas || "",
  estado_salud: c.estado_salud || "",
  relacion_companeros_docentes: c.relacion_companeros_docentes || "",
  materias_gustan: c.materias_gustan || "",
  materias_dificultan: c.materias_dificultan || "",
  motivo_atencion: c.motivo_atencion || "",
  padre_nombre: c.padre_nombre || "",
  padre_ocupacion: c.padre_ocupacion || "",
  padre_empresa: c.padre_empresa || "",
  padre_celular: c.padre_celular || "",
  madre_nombre: c.madre_nombre || "",
  madre_ocupacion: c.madre_ocupacion || "",
  madre_empresa: c.madre_empresa || "",
  madre_celular: c.madre_celular || "",
  situacion_padres: c.situacion_padres || "",
  situacion_reportada: c.situacion_reportada || "",
  intervencion: c.intervencion || "",
  compromisos_estudiante: c.compromisos_estudiante || "",
});

const CasoDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [caso, setCaso] = useState<Caso | null>(null);
  const [estudiante, setEstudiante] = useState<Estudiante | null>(null);
  const [loading, setLoading] = useState(true);
  const [autor, setAutor] = useState<{ id: string; nombre: string }>({ id: "", nombre: "" });

  // Modal edición
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [fechaApertura, setFechaApertura] = useState<Date | undefined>(new Date());
  const [openSec, setOpenSec] = useState<number | null>(1);
  const [guardando, setGuardando] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  // Modal seguimiento
  const [showSeg, setShowSeg] = useState(false);
  const [editingSegIndex, setEditingSegIndex] = useState<number | null>(null);
  const [segAnotacion, setSegAnotacion] = useState("");
  const [segObservaciones, setSegObservaciones] = useState("");
  const [segFecha, setSegFecha] = useState<Date | undefined>(new Date());
  const [guardandoSeg, setGuardandoSeg] = useState(false);

  // Eliminaciones
  const [showDeleteCaso, setShowDeleteCaso] = useState(false);
  const [eliminandoCaso, setEliminandoCaso] = useState(false);
  const [showDeleteSeg, setShowDeleteSeg] = useState<number | null>(null);
  const [eliminandoSeg, setEliminandoSeg] = useState(false);
  const [savingFirmaO, setSavingFirmaO] = useState(false);
  const [savingFirmaE, setSavingFirmaE] = useState(false);

  const backLink = isAdmin() ? "/dashboard-admin" : "/dashboard-rector";

  useEffect(() => {
    const session = getSession();
    if (!session.id || (!isOrientador() && !isAdmin() && !puedeAccederDashboard())) { navigate("/"); return; }
    setAutor({ id: session.id, nombre: `${session.nombres || ""} ${session.apellidos || ""}`.trim() });
    if (!id) { navigate("/orientador/casos"); return; }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate]);

  const cargar = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("Casos_Orientacion").select("*").eq("id", Number(id)).maybeSingle();
    if (error || !data) {
      toast({ title: "Caso no encontrado", variant: "destructive" });
      navigate("/orientador/casos");
      return;
    }
    setCaso(data as Caso);
    // Buscar el estudiante para tener acudientes al editar
    const { data: e } = await supabase.from("Estudiantes")
      .select("id_estudiantil, nombre_estudiante, apellidos_estudiante, grado_estudiante, salon_estudiante, nombre_acudiente, telefono_acudiente, nombre_acudiente2, telefono_acudiente2, nombre_acudiente3, telefono_acudiente3")
      .eq("id_estudiantil", data.estudiante_id).maybeSingle();
    setEstudiante((e as Estudiante) || null);
    setLoading(false);
  };

  const acudientesEstudiante = useMemo(() => {
    if (!estudiante) return [] as { nombre: string; telefono: string }[];
    const list: { nombre: string; telefono: string }[] = [];
    const push = (n?: string | null, t?: string[] | null) => {
      if (n && n.trim()) list.push({ nombre: n.trim(), telefono: (t && t[0]) ? String(t[0]) : "" });
    };
    push(estudiante.nombre_acudiente, estudiante.telefono_acudiente);
    push(estudiante.nombre_acudiente2, estudiante.telefono_acudiente2);
    push(estudiante.nombre_acudiente3, estudiante.telefono_acudiente3);
    return list;
  }, [estudiante]);

  // Snapshot para detectar cambios reales al cerrar
  const initialSnapshotRef = useRef<string>("");
  const snapshotKey = () => JSON.stringify({
    fa: fechaApertura ? fmtLocal(fechaApertura) : null,
    f: form ? { ...form, fecha_nacimiento: form.fecha_nacimiento ? fmtLocal(form.fecha_nacimiento) : null } : null,
  });
  useEffect(() => {
    if (showEdit) initialSnapshotRef.current = snapshotKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEdit]);
  const formHasChanges = () => snapshotKey() !== initialSnapshotRef.current;

  const abrirEditar = () => {
    if (!caso) return;
    setForm(formFromCaso(caso));
    setFechaApertura(new Date(caso.fecha_apertura + "T12:00:00"));
    setOpenSec(1);
    setShowEdit(true);
  };

  const intentarCerrarEdit = (open: boolean) => {
    if (open) { setShowEdit(true); return; }
    if (formHasChanges()) { setConfirmCloseOpen(true); return; }
    setShowEdit(false);
  };
  const confirmarCerrar = () => {
    setConfirmCloseOpen(false);
    setShowEdit(false);
  };

  const handleGuardarEdicion = async () => {
    if (!caso || !form) return;
    if (!form.motivo_atencion.trim() || !fechaApertura) {
      toast({ title: "Faltan datos", description: "Completa al menos el motivo de atención y la fecha de apertura.", variant: "destructive" });
      return;
    }
    setGuardando(true);
    const payload: any = {
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
      fecha_apertura: fmtLocal(fechaApertura),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("Casos_Orientacion").update(payload).eq("id", caso.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setShowEdit(false);
      await cargar();
    }
    setGuardando(false);
  };

  const cambiarEstado = async (nuevoEstado: string) => {
    if (!caso) return;
    const updates: any = { estado: nuevoEstado, updated_at: new Date().toISOString() };
    if (nuevoEstado === "cerrado") updates.fecha_cierre = fmtLocal(new Date());
    if (nuevoEstado !== "cerrado" && caso.fecha_cierre) updates.fecha_cierre = null;
    const { error } = await supabase.from("Casos_Orientacion").update(updates).eq("id", caso.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await cargar();
    }
  };

  const handleEliminarCaso = async () => {
    if (!caso) return;
    setEliminandoCaso(true);
    const { error } = await supabase.from("Casos_Orientacion").delete().eq("id", caso.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setEliminandoCaso(false);
    } else {
      navigate("/orientador/casos");
    }
  };

  const abrirAgregarSeg = () => {
    setEditingSegIndex(null);
    setSegFecha(new Date());
    setSegAnotacion("");
    setSegObservaciones("");
    setShowSeg(true);
  };

  const abrirEditarSeg = (idx: number, sg: Seguimiento) => {
    setEditingSegIndex(idx);
    setSegFecha(sg.fecha ? new Date(sg.fecha + "T12:00:00") : new Date());
    setSegAnotacion(sg.anotacion || "");
    setSegObservaciones(sg.observaciones || "");
    setShowSeg(true);
  };

  const handleGuardarSeg = async () => {
    if (!caso || !segAnotacion.trim() || !segFecha) return;
    setGuardandoSeg(true);
    const entry: Seguimiento = {
      fecha: fmtLocal(segFecha),
      anotacion: segAnotacion.trim(),
      observaciones: segObservaciones.trim(),
      autor_nombre: editingSegIndex !== null && caso.seguimientos?.[editingSegIndex]?.autor_nombre
        ? caso.seguimientos[editingSegIndex].autor_nombre
        : autor.nombre,
    };
    const base = caso.seguimientos || [];
    const seguimientos = editingSegIndex !== null
      ? base.map((s, i) => i === editingSegIndex ? entry : s)
      : [...base, entry];
    const { error } = await supabase.from("Casos_Orientacion").update({ seguimientos, updated_at: new Date().toISOString() }).eq("id", caso.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setShowSeg(false);
      setEditingSegIndex(null);
      await cargar();
    }
    setGuardandoSeg(false);
  };

  const handleEliminarSeg = async () => {
    if (!caso || showDeleteSeg === null) return;
    setEliminandoSeg(true);
    const seguimientos = (caso.seguimientos || []).filter((_, i) => i !== showDeleteSeg);
    const { error } = await supabase.from("Casos_Orientacion").update({ seguimientos, updated_at: new Date().toISOString() }).eq("id", caso.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setShowDeleteSeg(null);
      await cargar();
    }
    setEliminandoSeg(false);
  };

  const subirFirma = async (dataUrl: string, who: "orientadora" | "estudiante") => {
    if (!caso) return;
    const setSaving = who === "orientadora" ? setSavingFirmaO : setSavingFirmaE;
    setSaving(true);
    try {
      const base64 = dataUrl.split(",")[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const path = `firmas/${Date.now()}_caso${caso.id}_${who}.png`;
      const { error: upErr } = await supabase.storage.from("normi-archivos").upload(path, bytes, { contentType: "image/png" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("normi-archivos").getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error("No se pudo obtener la URL pública");
      const col = who === "orientadora" ? "firma_orientadora_url" : "firma_estudiante_url";
      const { error } = await supabase.from("Casos_Orientacion").update({ [col]: url, updated_at: new Date().toISOString() }).eq("id", caso.id);
      if (error) throw error;
      // Actualizar solo el campo afectado, sin recargar todo (no remonta el otro SignatureCanvas).
      setCaso(prev => prev ? { ...prev, [col]: url } as Caso : prev);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const borrarFirma = async (who: "orientadora" | "estudiante") => {
    if (!caso) return;
    const setSaving = who === "orientadora" ? setSavingFirmaO : setSavingFirmaE;
    setSaving(true);
    try {
      const col = who === "orientadora" ? "firma_orientadora_url" : "firma_estudiante_url";
      const { error } = await supabase.from("Casos_Orientacion").update({ [col]: null, updated_at: new Date().toISOString() }).eq("id", caso.id);
      if (error) throw error;
      setCaso(prev => prev ? { ...prev, [col]: null } as Caso : prev);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const estadoBadge = (e: string) => {
    const m = ESTADOS.find(x => x.value === e);
    return <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${m?.color || ""}`}>{m?.label || e}</span>;
  };

  const descargarWord = () => {
    if (!caso) return;
    const c = caso;
    const dash = "—";
    const filed = (label: string, value?: string | number | null) =>
      `<p style="margin:4pt 0;"><strong>${escapeHtml(label)}</strong> ${escapeHtml(String(value ?? "").trim() || dash)}</p>`;
    const block = (label: string, value?: string | null) =>
      `<p style="margin:6pt 0 2pt;"><strong>${escapeHtml(label)}</strong></p>
       <p style="margin:0 0 6pt; white-space:pre-wrap;">${escapeHtml(String(value ?? "").trim() || dash)}</p>`;

    const datosFamilia = (titulo: string, n?: string | null, oc?: string | null, em?: string | null, cel?: string | null) =>
      `<p style="margin:6pt 0 2pt;"><strong>${escapeHtml(titulo)}</strong></p>
       <p style="margin:0;">Nombre: ${escapeHtml(n || dash)}</p>
       <p style="margin:0;">Ocupación: ${escapeHtml(oc || dash)}</p>
       <p style="margin:0;">Empresa donde labora: ${escapeHtml(em || dash)}</p>
       <p style="margin:0 0 6pt;">N° Celular: ${escapeHtml(cel || dash)}</p>`;

    const seguimientosHtml = (c.seguimientos && c.seguimientos.length > 0)
      ? c.seguimientos.map((sg, idx) => `
          <div style="margin-top:14pt; page-break-inside:avoid;">
            <p style="margin:0 0 4pt; font-weight:bold; color:#1d4ed8;">FORMATO DE SEGUIMIENTO #${idx + 1}</p>
            <p style="margin:2pt 0;"><strong>Estudiante:</strong> ${escapeHtml(c.estudiante_apellidos + " " + c.estudiante_nombre)}</p>
            <p style="margin:2pt 0;"><strong>Grado:</strong> ${escapeHtml(c.estudiante_grado + " " + c.estudiante_salon)}</p>
            <p style="margin:2pt 0;"><strong>Fecha:</strong> ${escapeHtml(fmtFecha(sg.fecha))}</p>
            <p style="margin:6pt 0 2pt;"><strong>Anotación:</strong></p>
            <p style="margin:0 0 6pt; white-space:pre-wrap;">${escapeHtml(sg.anotacion || dash)}</p>
            <p style="margin:6pt 0 2pt;"><strong>Observaciones:</strong></p>
            <p style="margin:0 0 6pt; white-space:pre-wrap;">${escapeHtml(sg.observaciones || dash)}</p>
            <p style="margin:30pt 0 4pt; border-top:1pt solid #000; padding-top:2pt; width:240pt;">Firma del Orientador(a)</p>
          </div>`).join("")
      : "";

    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<title>Caso de orientación — ${escapeHtml(c.estudiante_apellidos + " " + c.estudiante_nombre)}</title>
<!--[if gte mso 9]><xml>
<w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument>
</xml><![endif]-->
<style>
@page { size: Letter; margin: 2cm; }
body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; }
h1 { text-align: center; font-size: 14pt; margin: 0 0 4pt; }
h2 { color: #1d4ed8; font-size: 12pt; margin: 14pt 0 4pt; border-bottom: 1pt solid #cbd5e1; padding-bottom: 2pt; }
h3 { font-size: 11pt; margin: 10pt 0 4pt; }
p { margin: 3pt 0; line-height: 1.4; }
.subtitulo { text-align:center; font-size:10pt; color:#444; margin: 0 0 12pt; }
.firma-row { width:100%; margin-top:60pt; }
.firma-row td { width:50%; vertical-align:top; padding: 0 12pt; text-align:center; }
.firma-line { border-top: 1pt solid #000; padding-top: 4pt; margin-top: 40pt; }
</style>
</head>
<body>

<h1>COLEGIO PESTALOZZIANO</h1>
<p class="subtitulo">ORIENTACIÓN ESCOLAR</p>

<p style="margin:6pt 0;"><strong>Fecha de consulta:</strong> ${escapeHtml(fmtFecha(c.fecha_apertura))}</p>
${filed("Estudiante:", c.estudiante_apellidos + " " + c.estudiante_nombre)}
${filed("Identificación:", c.estudiante_id)}
${filed("Grado:", c.estudiante_grado + " " + c.estudiante_salon)}
${filed("Estado:", c.estado === "abierto" ? "Abierto" : "Cerrado")}
${c.fecha_cierre ? filed("Fecha de cierre:", fmtFecha(c.fecha_cierre)) : ""}
${filed("Abierto por:", c.autor_nombre)}

<h2>1. DATOS BIOGRÁFICOS</h2>
${filed("Nombres:", c.estudiante_nombre)}
${filed("Apellidos:", c.estudiante_apellidos)}
${filed("Lugar de nacimiento:", c.lugar_nacimiento)}
${filed("Fecha de nacimiento:", c.fecha_nacimiento ? fmtFecha(c.fecha_nacimiento) : "")}
${filed("Edad:", c.edad)}
${filed("Cel.:", c.celular)}
${filed("Grado:", c.estudiante_grado + " " + c.estudiante_salon)}
${filed("Barrio:", c.barrio)}
${filed("Municipio:", c.municipio)}

<h3>ASPECTO FÍSICO Y EMOCIONAL</h3>
${filed("Enfermedades padecidas:", c.enfermedades_padecidas)}
${filed("Estado de salud actual:", c.estado_salud)}
${filed("Relación con compañeros y docentes:", c.relacion_companeros_docentes)}
${filed("Materias que más le gustan:", c.materias_gustan)}
${filed("Materias que se le dificultan:", c.materias_dificultan)}

<h2>2. MOTIVO DE ATENCIÓN</h2>
<p style="white-space:pre-wrap;">${escapeHtml(c.motivo_atencion || dash)}</p>

<h2>3. DATOS FAMILIARES</h2>
${datosFamilia("Datos del padre:", c.padre_nombre, c.padre_ocupacion, c.padre_empresa, c.padre_celular)}
${datosFamilia("Datos de la madre:", c.madre_nombre, c.madre_ocupacion, c.madre_empresa, c.madre_celular)}
${block("Situación actual de los padres:", c.situacion_padres)}

<h2>4. SITUACIÓN REPORTADA <span style="font-weight:normal; font-size:10pt;">(resumen de la situación)</span></h2>
<p style="white-space:pre-wrap;">${escapeHtml(c.situacion_reportada || dash)}</p>

<h2>5. INTERVENCIÓN <span style="font-weight:normal; font-size:10pt;">(estrategias usadas en la sesión, escucha activa, acuerdos o pruebas aplicadas)</span></h2>
<p style="white-space:pre-wrap;">${escapeHtml(c.intervencion || dash)}</p>

<h2>6. COMPROMISOS DEL ESTUDIANTE</h2>
<p style="white-space:pre-wrap;">${escapeHtml(c.compromisos_estudiante || dash)}</p>

<table border="0" cellpadding="0" cellspacing="0" style="width:100%; margin-top:40pt;">
  <tr>
    <td width="50%" valign="bottom" align="center" style="padding: 0 12pt;">
      ${c.firma_orientadora_url ? `<img src="${c.firma_orientadora_url}" width="280" height="100" alt="" />` : `<div style="height:100px;">&nbsp;</div>`}
      <div style="border-top: 1pt solid #000; padding-top: 4pt; margin-top: 2pt;">ORIENTADOR(A) ESCOLAR</div>
    </td>
    <td width="50%" valign="bottom" align="center" style="padding: 0 12pt;">
      ${c.firma_estudiante_url ? `<img src="${c.firma_estudiante_url}" width="280" height="100" alt="" />` : `<div style="height:100px;">&nbsp;</div>`}
      <div style="border-top: 1pt solid #000; padding-top: 4pt; margin-top: 2pt;">ESTUDIANTE</div>
    </td>
  </tr>
</table>

${seguimientosHtml ? `<div style="page-break-before: always;"></div>${seguimientosHtml}` : ""}

</body>
</html>`;

    // Word abre HTML con extensión .doc. El BOM \ufeff fuerza UTF-8.
    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Caso_${sanitizeFilename(c.estudiante_apellidos + "_" + c.estudiante_nombre)}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading || !caso) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <HeaderNormi backLink={backLink} />
        <main className="flex-1 container mx-auto p-8">
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        </main>
      </div>
    );
  }

  const c = caso;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/orientador/casos" />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/orientador/casos")} className="text-primary hover:underline">Casos de Seguimiento</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">{c.estudiante_apellidos} {c.estudiante_nombre}</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 space-y-6">
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">{c.estudiante_grado} {c.estudiante_salon}</span>
                {estadoBadge(c.estado)}
              </div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <img src={iconCasos} alt="" className="h-6 w-6 object-contain" /> {c.estudiante_apellidos} {c.estudiante_nombre}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Identificación: {c.estudiante_id}</p>
              <p className="text-xs text-muted-foreground">Abierto el {fmtFecha(c.fecha_apertura)}{c.fecha_cierre ? ` · Cerrado el ${fmtFecha(c.fecha_cierre)}` : ""}</p>
              <p className="text-xs text-muted-foreground">Abierto por {c.autor_nombre}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={descargarWord} className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium border border-blue-600 text-blue-600 hover:bg-blue-50 cursor-pointer" title="Descargar en Word">
                <FileDown className="w-4 h-4" /> Descargar Word
              </button>
              <button onClick={abrirEditar} className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium border border-primary text-primary hover:bg-primary/10 cursor-pointer">
                <Pencil className="w-4 h-4" /> Editar
              </button>
              <button onClick={() => setShowDeleteCaso(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium border border-destructive text-destructive hover:bg-destructive/10 cursor-pointer">
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            </div>
          </div>

          {/* 1. Datos biográficos */}
          <div>
            <p className="font-semibold text-blue-700 mb-2">1. Datos biográficos</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <p><span className="text-muted-foreground">Lugar de nacimiento:</span> {c.lugar_nacimiento || "—"}</p>
              <p><span className="text-muted-foreground">Fecha de nacimiento:</span> {c.fecha_nacimiento ? fmtFecha(c.fecha_nacimiento) : "—"}</p>
              <p><span className="text-muted-foreground">Edad:</span> {c.edad ?? "—"}</p>
              <p><span className="text-muted-foreground">Cel.:</span> {c.celular || "—"}</p>
              <p><span className="text-muted-foreground">Barrio:</span> {c.barrio || "—"}</p>
              <p><span className="text-muted-foreground">Municipio:</span> {c.municipio || "—"}</p>
            </div>
          </div>

          {/* Aspecto físico y emocional */}
          <div>
            <p className="font-semibold text-blue-700 mb-2">Aspecto físico y emocional</p>
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Enfermedades padecidas:</span> {c.enfermedades_padecidas || "—"}</p>
              <p><span className="text-muted-foreground">Estado de salud actual:</span> {c.estado_salud || "—"}</p>
              <p><span className="text-muted-foreground">Relación con compañeros y docentes:</span> {c.relacion_companeros_docentes || "—"}</p>
              <p><span className="text-muted-foreground">Materias que más le gustan:</span> {c.materias_gustan || "—"}</p>
              <p><span className="text-muted-foreground">Materias que se le dificultan:</span> {c.materias_dificultan || "—"}</p>
            </div>
          </div>

          {/* 2. Motivo de la atención */}
          <div>
            <p className="font-semibold text-blue-700 mb-2">2. Motivo de la atención</p>
            <p className="text-sm whitespace-pre-wrap">{c.motivo_atencion}</p>
          </div>

          {/* 3. Datos familiares */}
          <div>
            <p className="font-semibold text-blue-700 mb-2">3. Datos familiares</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1 border border-border rounded p-3">
                <p className="font-medium text-foreground">Padre</p>
                <p><span className="text-muted-foreground">Nombre:</span> {c.padre_nombre || "—"}</p>
                <p><span className="text-muted-foreground">Ocupación:</span> {c.padre_ocupacion || "—"}</p>
                <p><span className="text-muted-foreground">Empresa donde labora:</span> {c.padre_empresa || "—"}</p>
                <p><span className="text-muted-foreground">N° Celular:</span> {c.padre_celular || "—"}</p>
              </div>
              <div className="space-y-1 border border-border rounded p-3">
                <p className="font-medium text-foreground">Madre</p>
                <p><span className="text-muted-foreground">Nombre:</span> {c.madre_nombre || "—"}</p>
                <p><span className="text-muted-foreground">Ocupación:</span> {c.madre_ocupacion || "—"}</p>
                <p><span className="text-muted-foreground">Empresa donde labora:</span> {c.madre_empresa || "—"}</p>
                <p><span className="text-muted-foreground">N° Celular:</span> {c.madre_celular || "—"}</p>
              </div>
            </div>
            <p className="mt-2 text-sm"><span className="text-muted-foreground">Situación actual de los padres:</span> {c.situacion_padres || "—"}</p>
          </div>

          {/* 4. Situación reportada */}
          <div>
            <p className="font-semibold text-blue-700 mb-2">4. Situación reportada</p>
            <p className="text-sm whitespace-pre-wrap">{c.situacion_reportada || "—"}</p>
          </div>

          {/* 5. Intervención */}
          <div>
            <p className="font-semibold text-blue-700 mb-2">5. Intervención</p>
            <p className="text-sm whitespace-pre-wrap">{c.intervencion || "—"}</p>
          </div>

          {/* 6. Compromisos */}
          <div>
            <p className="font-semibold text-blue-700 mb-2">6. Compromisos del estudiante</p>
            <p className="text-sm whitespace-pre-wrap">{c.compromisos_estudiante || "—"}</p>
          </div>

          {/* Firmas */}
          <div className="border-t border-border pt-4">
            <p className="font-semibold text-blue-700 mb-3">Firmas</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FirmaBlock
                label="Orientador(a) Escolar"
                urlGuardada={c.firma_orientadora_url}
                onSave={(d) => subirFirma(d, "orientadora")}
                onClear={() => borrarFirma("orientadora")}
                saving={savingFirmaO}
              />
              <FirmaBlock
                label="Estudiante"
                urlGuardada={c.firma_estudiante_url}
                onSave={(d) => subirFirma(d, "estudiante")}
                onClear={() => borrarFirma("estudiante")}
                saving={savingFirmaE}
              />
            </div>
          </div>

          {/* Cambiar estado */}
          <div className="border-t border-border pt-4 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Cambiar estado:</span>
            {ESTADOS.filter(e => e.value !== c.estado).map(e => (
              <button key={e.value} onClick={() => cambiarEstado(e.value)} className={`px-3 py-1 rounded-full text-sm font-medium ${e.color} hover:opacity-80 cursor-pointer`}>{e.label}</button>
            ))}
          </div>

          {/* Seguimientos */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-blue-700">Seguimientos ({c.seguimientos?.length || 0})</p>
              <button onClick={abrirAgregarSeg} className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium border border-primary text-primary hover:bg-primary/10 cursor-pointer">
                <Plus className="w-4 h-4" /> Agregar seguimiento
              </button>
            </div>
            {c.seguimientos && c.seguimientos.length > 0 ? (
              <div className="space-y-3">
                {c.seguimientos.map((sg, idx) => (
                  <div key={idx} className="border border-border rounded p-3 bg-card">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-bold text-foreground">Seguimiento #{idx + 1}</span> · {fmtFecha(sg.fecha)} · {sg.autor_nombre}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => abrirEditarSeg(idx, sg)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary" title="Editar seguimiento">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setShowDeleteSeg(idx)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive" title="Eliminar seguimiento">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs mt-2 font-bold text-emerald-700">Anotación:</p>
                    <p className="text-sm whitespace-pre-wrap">{sg.anotacion}</p>
                    {sg.observaciones && (
                      <>
                        <p className="text-xs mt-2 font-bold text-emerald-700">Observaciones:</p>
                        <p className="text-sm whitespace-pre-wrap">{sg.observaciones}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground italic">Sin seguimientos registrados.</p>}
          </div>
        </div>
      </main>

      {/* Modal editar caso */}
      {form && (
        <Dialog open={showEdit} onOpenChange={intentarCerrarEdit}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registro acumulativo · Editar caso</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="border border-border rounded-md p-3 space-y-3 bg-muted/10">
                <div>
                  <p className="text-sm font-semibold">{c.estudiante_apellidos} {c.estudiante_nombre}</p>
                  <p className="text-xs text-muted-foreground">Identificación: {c.estudiante_id} · {c.estudiante_grado} {c.estudiante_salon}</p>
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
                  <Field label="Lugar de nacimiento" value={form.lugar_nacimiento} onChange={v => setForm(f => f ? { ...f, lugar_nacimiento: v } : f)} placeholder="Sincelejo, Sucre" />
                  <div>
                    <label className="text-xs font-medium block mb-1 text-muted-foreground">Fecha de nacimiento</label>
                    <BirthDateInput value={form.fecha_nacimiento} onChange={d => setForm(f => f ? { ...f, fecha_nacimiento: d } : f)} />
                  </div>
                  <Field label="Edad" type="number" value={form.edad} onChange={v => setForm(f => f ? { ...f, edad: v } : f)} />
                  <Field label="Cel." value={form.celular} onChange={v => setForm(f => f ? { ...f, celular: v } : f)} />
                  <Field label="Barrio" value={form.barrio} onChange={v => setForm(f => f ? { ...f, barrio: v } : f)} />
                  <Field label="Municipio" value={form.municipio} onChange={v => setForm(f => f ? { ...f, municipio: v } : f)} />
                </div>
                <Area label="Enfermedades padecidas" value={form.enfermedades_padecidas} onChange={v => setForm(f => f ? { ...f, enfermedades_padecidas: v } : f)} />
                <Area label="Estado de salud actual" value={form.estado_salud} onChange={v => setForm(f => f ? { ...f, estado_salud: v } : f)} />
                <Area label="Relación con compañeros y docentes" value={form.relacion_companeros_docentes} onChange={v => setForm(f => f ? { ...f, relacion_companeros_docentes: v } : f)} />
                <Area label="Materias que más le gustan" value={form.materias_gustan} onChange={v => setForm(f => f ? { ...f, materias_gustan: v } : f)} />
                <Area label="Materias que se le dificultan" value={form.materias_dificultan} onChange={v => setForm(f => f ? { ...f, materias_dificultan: v } : f)} />
              </Section>

              <Section n={2} title="Motivo de la atención *" openSec={openSec} setOpenSec={setOpenSec}>
                <Area label="" value={form.motivo_atencion} onChange={v => setForm(f => f ? { ...f, motivo_atencion: v } : f)} rows={3} placeholder="Describe brevemente el motivo por el cual se abre el caso" />
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
                          <button type="button" onClick={() => setForm(f => f ? { ...f, padre_nombre: a.nombre, padre_celular: a.telefono || f.padre_celular } : f)} className="ml-1 px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20">Padre</button>
                          <button type="button" onClick={() => setForm(f => f ? { ...f, madre_nombre: a.nombre, madre_celular: a.telefono || f.madre_celular } : f)} className="px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20">Madre</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2 border border-border rounded p-2">
                    <p className="text-xs font-semibold text-foreground">Datos del padre</p>
                    <Field label="Nombre del padre" value={form.padre_nombre} onChange={v => setForm(f => f ? { ...f, padre_nombre: v } : f)} />
                    <Field label="Ocupación" value={form.padre_ocupacion} onChange={v => setForm(f => f ? { ...f, padre_ocupacion: v } : f)} />
                    <Field label="Empresa donde labora" value={form.padre_empresa} onChange={v => setForm(f => f ? { ...f, padre_empresa: v } : f)} />
                    <Field label="N° Celular" value={form.padre_celular} onChange={v => setForm(f => f ? { ...f, padre_celular: v } : f)} />
                  </div>
                  <div className="space-y-2 border border-border rounded p-2">
                    <p className="text-xs font-semibold text-foreground">Datos de la madre</p>
                    <Field label="Nombre de la madre" value={form.madre_nombre} onChange={v => setForm(f => f ? { ...f, madre_nombre: v } : f)} />
                    <Field label="Ocupación" value={form.madre_ocupacion} onChange={v => setForm(f => f ? { ...f, madre_ocupacion: v } : f)} />
                    <Field label="Empresa donde labora" value={form.madre_empresa} onChange={v => setForm(f => f ? { ...f, madre_empresa: v } : f)} />
                    <Field label="N° Celular" value={form.madre_celular} onChange={v => setForm(f => f ? { ...f, madre_celular: v } : f)} />
                  </div>
                </div>
                <Area label="Situación actual de los padres" value={form.situacion_padres} onChange={v => setForm(f => f ? { ...f, situacion_padres: v } : f)} />
              </Section>

              <Section n={4} title="Situación reportada" openSec={openSec} setOpenSec={setOpenSec}>
                <Area label="Resumen de la situación" value={form.situacion_reportada} onChange={v => setForm(f => f ? { ...f, situacion_reportada: v } : f)} rows={4} />
              </Section>

              <Section n={5} title="Intervención" openSec={openSec} setOpenSec={setOpenSec}>
                <Area label="Estrategias usadas en la sesión, escucha activa, acuerdos o pruebas aplicadas" value={form.intervencion} onChange={v => setForm(f => f ? { ...f, intervencion: v } : f)} rows={4} />
              </Section>

              <Section n={6} title="Compromisos del estudiante" openSec={openSec} setOpenSec={setOpenSec}>
                <Area label="" value={form.compromisos_estudiante} onChange={v => setForm(f => f ? { ...f, compromisos_estudiante: v } : f)} rows={4} />
              </Section>
            </div>
            <DialogFooter>
              <button onClick={() => intentarCerrarEdit(false)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">Cancelar</button>
              <button onClick={handleGuardarEdicion} disabled={guardando || !form.motivo_atencion.trim()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {guardando ? "Guardando..." : "Guardar cambios"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal seguimiento */}
      <Dialog open={showSeg} onOpenChange={(o) => { if (!o) { setShowSeg(false); setEditingSegIndex(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSegIndex !== null ? "Editar seguimiento" : "Formato de seguimiento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium block mb-1">Fecha *</label>
              <input
                type="date"
                value={segFecha ? fmtLocal(segFecha) : ""}
                onChange={e => setSegFecha(e.target.value ? new Date(e.target.value + "T12:00:00") : undefined)}
                className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Anotación *</label>
              <textarea value={segAnotacion} onChange={e => setSegAnotacion(e.target.value)} placeholder="Tema o asunto tratado en la sesión..." className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[100px] resize-y" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Observaciones</label>
              <textarea value={segObservaciones} onChange={e => setSegObservaciones(e.target.value)} placeholder="Observaciones, conclusiones o compromisos..." className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[100px] resize-y" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => { setShowSeg(false); setEditingSegIndex(null); }} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">Cancelar</button>
            <button onClick={handleGuardarSeg} disabled={guardandoSeg || !segAnotacion.trim()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {guardandoSeg ? "Guardando..." : (editingSegIndex !== null ? "Guardar cambios" : "Registrar seguimiento")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación caso */}
      <Dialog open={showDeleteCaso} onOpenChange={(o) => !o && !eliminandoCaso && setShowDeleteCaso(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar este caso?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Se eliminará el registro acumulativo y todos los seguimientos asociados. Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <button onClick={() => setShowDeleteCaso(false)} disabled={eliminandoCaso} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted disabled:opacity-50">Cancelar</button>
            <button onClick={handleEliminarCaso} disabled={eliminandoCaso} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50">
              {eliminandoCaso ? "Eliminando..." : "Eliminar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación seguimiento */}
      <Dialog open={showDeleteSeg !== null} onOpenChange={(o) => !o && !eliminandoSeg && setShowDeleteSeg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar este seguimiento?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Se eliminará el registro del seguimiento. Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <button onClick={() => setShowDeleteSeg(null)} disabled={eliminandoSeg} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted disabled:opacity-50">Cancelar</button>
            <button onClick={handleEliminarSeg} disabled={eliminandoSeg} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50">
              {eliminandoSeg ? "Eliminando..." : "Eliminar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar cierre de edición */}
      <Dialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Salir de la edición?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tienes cambios sin guardar. Si sales ahora se perderán.
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

export default CasoDetalle;
