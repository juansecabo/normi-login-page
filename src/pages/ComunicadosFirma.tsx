import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getSession, hasValidSession, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { Loader2, Send, Clock, Search, Users, Eye, Paperclip, X, FileText, Download, RotateCcw, CheckCircle2, PenLine, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ComunicadoEnviadoDialog from "@/components/ComunicadoEnviadoDialog";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/lib/apiClient";
import { filtrarPorNombre } from "@/lib/nombresUsuarios";
import FormatoWhatsAppToolbar, { EditorComunicado, EditorComunicadoHandle } from "@/components/FormatoWhatsAppToolbar";
import CharCircle from "@/components/CharCircle";
import { buildTemplateBodyPreview, MAX_WA_TEMPLATE_BODY, WA_TEMPLATE_OVERHEAD } from "@/lib/wapBody";

// Comunicados con firma. La pestaña "Enviar" replica EXACTAMENTE la interfaz de
// Enviar Comunicado (mismo selector de perfiles, filtros en cascada, editor y
// adjuntos). La diferencia es que el envío va a /api/comunicados-firma/enviar y
// se solicita firma de recibido. Las pestañas "Enviados" y "Por firmar" son
// propias de esta feature.

type PerfilKey = 'Estudiantes' | 'Padres' | 'Profesores' | 'Coordinadores' | 'Rector' | 'Administrativos' | 'Secretaria' | 'Orientador';

const PERFILES_UI: { key: PerfilKey; label: string }[] = [
  { key: 'Estudiantes', label: 'Estudiantes' },
  { key: 'Padres', label: 'Acudientes' },
  { key: 'Profesores', label: 'Profesores' },
  { key: 'Coordinadores', label: 'Coordinadores' },
  { key: 'Rector', label: 'Rector' },
  { key: 'Administrativos', label: 'Administrativos' },
  { key: 'Secretaria', label: 'Secretaria General' },
  { key: 'Orientador', label: 'Orientador(a) Escolar' },
];

const ORDEN_NIVELES = ["Preescolar", "Primaria", "Secundaria", "Media"];
const NIVELES_GRADOS_REF: Record<string, string[]> = {
  Preescolar: ["Párvulo", "Prejardín", "Jardín", "Transición"],
  Primaria: ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto"],
  Secundaria: ["Sexto", "Séptimo", "Octavo", "Noveno"],
  Media: ["Décimo", "Undécimo"],
};

// Roles que PUEDEN crear/enviar. Estudiantes y acudientes solo ven y firman.
const CARGOS_EMISORES = new Set([
  "Administrador", "Rector", "Coordinador(a)", "Secretaria General",
  "Administrativo(a)", "Orientador(a) Escolar", "Profesor(a)",
]);

interface EnviadoRow {
  id: number;
  mensaje: string;
  archivo_url: string | null;
  destinatarios_label: string | null;
  remitente: string | null;
  fecha: string;
  total: number;
  firmadas: number;
}

interface RespuestaRow {
  id: number;
  destinatario_id: string;
  destinatario_nombre: string | null;
  destinatario_apellidos: string | null;
  tabla: string | null;
  estudiante_nombre: string | null;
  estudiante_apellidos: string | null;
  estudiante_grado: string | null;
  estudiante_salon: string | null;
  firma_url: string | null;
  fecha_firma: string | null;
}

interface MioRow {
  respuesta_id: number;
  comunicado_id: number;
  estudiante_nombre: string | null;
  estudiante_apellidos: string | null;
  estudiante_grado: string | null;
  estudiante_salon: string | null;
  firma_url: string | null;
  fecha_firma: string | null;
  comunicado: {
    mensaje: string;
    archivo_url: string | null;
    remitente: string | null;
    creado_por_cargo: string | null;
    fecha: string;
  } | null;
}

const getCleanFilename = (url: string) =>
  decodeURIComponent((url.split('/').pop() || '').replace(/^\d+[_-][a-z0-9]*-?/i, ''));

const handleVerArchivo = (url: string) => {
  const ext = (url.split('.').pop() || '').toLowerCase().split('?')[0];
  const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
  if (officeExts.includes(ext)) {
    window.open(`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`, '_blank');
  } else {
    window.open(url, '_blank');
  }
};

const handleDescargarArchivo = async (url: string) => {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = getCleanFilename(url);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, "_blank");
  }
};

const fmtFecha = (s: string) =>
  new Date(s).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** dataURL de la firma → sube a Storage → devuelve publicUrl. */
async function subirFirma(dataUrl: string, comunicadoId: number, destinatarioId: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) throw new Error("Firma inválida");
  const mime = match[1];
  const ext = mime.split("/")[1];
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const filename = `firmas-comunicado/${comunicadoId}/${destinatarioId}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("normi-archivos").upload(filename, blob, { contentType: mime, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("normi-archivos").getPublicUrl(filename);
  return data.publicUrl;
}

const ComunicadosFirma = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [remitente, setRemitente] = useState("");
  const [cargo, setCargo] = useState("");
  const esEmisor = CARGOS_EMISORES.has(cargo || getSession().cargo || "");

  const [enviando, setEnviando] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSentDialog, setShowSentDialog] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ jobId?: string; total?: number }>({});

  // ── Destinatarios (idéntico a Enviar Comunicado) ──────────────────────
  const [perfilesMarcados, setPerfilesMarcados] = useState<Record<PerfilKey, boolean>>({
    Estudiantes: false, Padres: false, Profesores: false,
    Coordinadores: false, Rector: false, Administrativos: false, Secretaria: false, Orientador: false,
  });

  const [nivelesGrados, setNivelesGrados] = useState<Record<string, string[]>>({});
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("Estudiantes").select("nivel, grado");
      const rankNivel = (n: string) => { const i = ORDEN_NIVELES.indexOf(n); return i < 0 ? 999 : i; };
      const rankGrado = (niv: string, g: string) => { const i = (NIVELES_GRADOS_REF[niv] || []).indexOf(g); return i < 0 ? 999 : i; };
      const porNivel: Record<string, Set<string>> = {};
      for (const r of (data as { nivel: string | null; grado: string | null }[] | null) || []) {
        if (!r.nivel || !r.grado) continue;
        (porNivel[r.nivel] ||= new Set()).add(r.grado);
      }
      const mapa: Record<string, string[]> = {};
      for (const niv of Object.keys(porNivel).sort((a, b) => rankNivel(a) - rankNivel(b))) {
        mapa[niv] = [...porNivel[niv]].sort((a, b) => rankGrado(niv, a) - rankGrado(niv, b));
      }
      setNivelesGrados(mapa);
    })();
  }, []);

  const [nivelesMarcados, setNivelesMarcados] = useState<Record<string, boolean>>({});
  const [gradosMarcados, setGradosMarcados] = useState<Record<string, boolean>>({});
  const [salonesMarcados, setSalonesMarcados] = useState<Record<string, boolean>>({});
  const [openPerfiles, setOpenPerfiles] = useState(false);
  const [openNivel, setOpenNivel] = useState(false);
  const [openGrado, setOpenGrado] = useState(false);
  const [openSalon, setOpenSalon] = useState(false);

  const [listaCoordinadores, setListaCoordinadores] = useState<{ id: string; nombre: string }[]>([]);
  const [listaAdministrativos, setListaAdministrativos] = useState<{ id: string; nombre: string }[]>([]);
  const [listaSecretarias, setListaSecretarias] = useState<{ id: string; nombre: string }[]>([]);
  const [listaOrientadores, setListaOrientadores] = useState<{ id: string; nombre: string }[]>([]);
  const [coordinadoresSeleccionados, setCoordinadoresSeleccionados] = useState<string[]>([]);
  const [administrativosSeleccionados, setAdministrativosSeleccionados] = useState<string[]>([]);
  const [secretariasSeleccionadas, setSecretariasSeleccionadas] = useState<string[]>([]);
  const [orientadoresSeleccionados, setOrientadoresSeleccionados] = useState<string[]>([]);
  const [loadingInternos, setLoadingInternos] = useState(false);

  const [listaEstudiantesFiltrada, setListaEstudiantesFiltrada] = useState<{ id: string; nombre: string; grado: string; salon: string }[]>([]);
  const [estudiantesSeleccionados, setEstudiantesSeleccionados] = useState<string[]>([]);
  const [loadingListaEstudiantes, setLoadingListaEstudiantes] = useState(false);
  const [mostrarEstudiantes, setMostrarEstudiantes] = useState(false);
  const [filtroEstudiantes, setFiltroEstudiantes] = useState("");
  const [salonesDisponibles, setSalonesDisponibles] = useState<string[]>([]);

  const [listaProfesoresFiltrada, setListaProfesoresFiltrada] = useState<{ id: string; nombre: string; grados: string[]; salones: string[] }[]>([]);
  const [profesoresSeleccionados, setProfesoresSeleccionados] = useState<string[]>([]);
  const [loadingListaProfesores, setLoadingListaProfesores] = useState(false);
  const [mostrarProfesores, setMostrarProfesores] = useState(false);

  // Mensaje y archivos
  const [mensaje, setMensaje] = useState("");
  const mensajeRef = useRef<EditorComunicadoHandle>(null);
  const [archivosSeleccionados, setArchivosSeleccionados] = useState<File[]>([]);
  const [archivosRechazados, setArchivosRechazados] = useState<Array<{ nombre: string; mb: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Enviados ───────────────────────────────────────────────────────────
  const [enviados, setEnviados] = useState<EnviadoRow[]>([]);
  const [loadingEnviados, setLoadingEnviados] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState<EnviadoRow | null>(null);
  const [respuestas, setRespuestas] = useState<RespuestaRow[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ── Por firmar ───────────────────────────────────────────────────────
  const [mios, setMios] = useState<MioRow[]>([]);
  const [loadingMios, setLoadingMios] = useState(false);
  const [firmando, setFirmando] = useState<MioRow | null>(null);
  const [guardandoFirma, setGuardandoFirma] = useState(false);
  const sigRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    setRemitente(`${session.cargo} ${session.nombres} ${session.apellidos}`.trim());
    setCargo(session.cargo || "");
  }, [navigate]);

  const limpiarFormulario = () => {
    setPerfilesMarcados({
      Estudiantes: false, Padres: false, Profesores: false,
      Coordinadores: false, Rector: false, Administrativos: false, Secretaria: false, Orientador: false,
    });
    setNivelesMarcados({}); setGradosMarcados({}); setSalonesMarcados({});
    setCoordinadoresSeleccionados([]); setAdministrativosSeleccionados([]);
    setSecretariasSeleccionadas([]); setOrientadoresSeleccionados([]);
    setEstudiantesSeleccionados([]); setProfesoresSeleccionados([]);
    setMostrarEstudiantes(false); setMostrarProfesores(false);
    setMensaje(""); setArchivosSeleccionados([]);
    setOpenPerfiles(false); setOpenNivel(false); setOpenGrado(false); setOpenSalon(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Cargar estudiantes según grados/salones marcados
  useEffect(() => {
    const gradosSel = Object.keys(gradosMarcados).filter(g => gradosMarcados[g]);
    const salonesSel = Object.keys(salonesMarcados).filter(s => salonesMarcados[s]);
    const necesita = (perfilesMarcados.Estudiantes || perfilesMarcados.Padres) && gradosSel.length > 0;
    if (!necesita) {
      setListaEstudiantesFiltrada([]); setEstudiantesSeleccionados([]); setMostrarEstudiantes(false);
      return;
    }
    const fetchLista = async () => {
      setLoadingListaEstudiantes(true);
      let q = supabase.from("Estudiantes").select("id, grado, salon").in("grado", gradosSel);
      if (salonesSel.length > 0) q = q.in("salon", salonesSel);
      const { data: rawData } = await q.order("grado", { ascending: true }).order("salon", { ascending: true });
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const data = sortByApellidosNombres(await enrichWithNombres((rawData || []) as any));
      setListaEstudiantesFiltrada(
        data.map((e: any) => ({ id: String(e.id), nombre: `${e.apellidos} ${e.nombres}`, grado: e.grado || "", salon: e.salon || "" }))
      );
      setEstudiantesSeleccionados(prev => prev.filter(id => data.some((e: any) => String(e.id) === id)));
      setLoadingListaEstudiantes(false);
    };
    fetchLista();
  }, [gradosMarcados, salonesMarcados, perfilesMarcados.Estudiantes, perfilesMarcados.Padres]);

  useEffect(() => {
    const gradosSel = Object.keys(gradosMarcados).filter(g => gradosMarcados[g]);
    if (gradosSel.length === 0) { setSalonesDisponibles([]); return; }
    (async () => {
      const { data } = await supabase.from("Estudiantes").select("salon").in("grado", gradosSel as any);
      const set = new Set<string>();
      for (const r of (data || []) as { salon: string | null }[]) if (r.salon) set.add(String(r.salon));
      const lista = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      setSalonesDisponibles(lista);
      setSalonesMarcados(prev => {
        const next: Record<string, boolean> = {};
        for (const s of Object.keys(prev)) if (prev[s] && lista.includes(s)) next[s] = true;
        return next;
      });
    })();
  }, [gradosMarcados]);

  useEffect(() => {
    if (!perfilesMarcados.Profesores) {
      setListaProfesoresFiltrada([]); setProfesoresSeleccionados([]); setMostrarProfesores(false);
      return;
    }
    const gradosSel = Object.keys(gradosMarcados).filter(g => gradosMarcados[g]);
    const salonesSel = Object.keys(salonesMarcados).filter(s => salonesMarcados[s]);
    const fetchProfes = async () => {
      setLoadingListaProfesores(true);
      const { data: rawData } = await supabase.from("Asignación Profesores").select("id, \"Grado(s)\", \"Salon(es)\"");
      const { enrichWithNombres } = await import("@/lib/nombresUsuarios");
      const data = await enrichWithNombres((rawData || []) as any);
      const filtered = (data || []).filter((r: any) => {
        const grados = (r["Grado(s)"] as string[]) || [];
        const salones = (r["Salon(es)"] as string[]) || [];
        if (gradosSel.length > 0 && !gradosSel.some(g => grados.includes(g))) return false;
        if (salonesSel.length > 0 && !salonesSel.some(s => salones.includes(s))) return false;
        return true;
      });
      const byId = new Map<string, { id: string; nombre: string; grados: string[]; salones: string[] }>();
      for (const r of filtered) {
        const rid = String(r.id);
        if (!byId.has(rid)) {
          byId.set(rid, {
            id: rid,
            nombre: `${r.apellidos || ""} ${r.nombres || ""}`.trim(),
            grados: [...(r["Grado(s)"] as string[] || [])],
            salones: [...(r["Salon(es)"] as string[] || [])],
          });
        } else {
          const existing = byId.get(rid)!;
          for (const g of (r["Grado(s)"] as string[] || [])) if (!existing.grados.includes(g)) existing.grados.push(g);
          for (const s of (r["Salon(es)"] as string[] || [])) if (!existing.salones.includes(s)) existing.salones.push(s);
        }
      }
      const list = [...byId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
      setListaProfesoresFiltrada(list);
      setProfesoresSeleccionados(prev => prev.filter(id => byId.has(id)));
      setLoadingListaProfesores(false);
    };
    fetchProfes();
  }, [gradosMarcados, salonesMarcados, perfilesMarcados.Profesores]);

  useEffect(() => {
    const necesitaLista =
      perfilesMarcados.Coordinadores || perfilesMarcados.Administrativos || perfilesMarcados.Secretaria || perfilesMarcados.Orientador;
    if (!necesitaLista) return;
    if (listaCoordinadores.length || listaAdministrativos.length || listaSecretarias.length || listaOrientadores.length) return;
    const fetchInternos = async () => {
      setLoadingInternos(true);
      const { data: rawInt } = await supabase
        .from("Internos").select("id, cargo")
        .in("cargo", ["Coordinador(a)", "Administrativo(a)", "Secretaria General", "Orientador(a) Escolar"]);
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const rows = sortByApellidosNombres(await enrichWithNombres((rawInt || []) as any));
      setListaCoordinadores(rows.filter(r => r.cargo === "Coordinador(a)").map(r => ({ id: String(r.id), nombre: `${r.apellidos} ${r.nombres}` })));
      setListaAdministrativos(rows.filter(r => r.cargo === "Administrativo(a)").map(r => ({ id: String(r.id), nombre: `${r.apellidos} ${r.nombres}` })));
      setListaSecretarias(rows.filter(r => r.cargo === "Secretaria General").map(r => ({ id: String(r.id), nombre: `${r.apellidos} ${r.nombres}` })));
      setListaOrientadores(rows.filter(r => r.cargo === "Orientador(a) Escolar").map(r => ({ id: String(r.id), nombre: `${r.apellidos} ${r.nombres}` })));
      setLoadingInternos(false);
    };
    fetchInternos();
  }, [perfilesMarcados, listaCoordinadores.length, listaAdministrativos.length, listaSecretarias.length, listaOrientadores.length]);

  const cargarEnviados = async () => {
    setLoadingEnviados(true);
    try {
      const r = await apiRequest<{ comunicados: EnviadoRow[] }>("/api/comunicados-firma/enviados");
      setEnviados(r.comunicados || []);
    } catch { /* */ }
    setLoadingEnviados(false);
  };
  const cargarMios = async () => {
    setLoadingMios(true);
    try {
      const r = await apiRequest<{ items: MioRow[] }>("/api/comunicados-firma/mios");
      setMios(r.items || []);
    } catch { /* */ }
    setLoadingMios(false);
  };

  const abrirDetalle = async (c: EnviadoRow) => {
    setDetalle(c); setLoadingDetalle(true); setRespuestas([]);
    try {
      const r = await apiRequest<{ respuestas: RespuestaRow[] }>(`/api/comunicados-firma/${c.id}/respuestas`);
      setRespuestas(r.respuestas || []);
    } catch { /* */ }
    setLoadingDetalle(false);
  };

  const handleReenviar = async (c: EnviadoRow) => {
    try {
      const r = await apiRequest<{ total: number; motivo?: string }>(`/api/comunicados-firma/reenviar/${c.id}`, { method: "POST" });
      if (r.total === 0) {
        toast({ title: "Nada que reenviar", description: r.motivo === "todos_firmaron" ? "Todos ya firmaron." : "Los pendientes no tienen teléfono registrado." });
      } else {
        toast({ title: "Reenviado", description: `Se reenvió a ${r.total} persona(s) que faltaban por firmar.` });
      }
    } catch { /* */ }
  };

  const handleEliminar = async () => {
    if (deleteId == null) return;
    try {
      await apiRequest(`/api/comunicados-firma/${deleteId}`, { method: "DELETE" });
      setEnviados(prev => prev.filter(c => c.id !== deleteId));
      if (detalle?.id === deleteId) setDetalle(null);
    } catch { /* */ }
    setDeleteId(null);
  };

  const handleFirmar = async () => {
    if (!firmando) return;
    const sig = sigRef.current;
    if (!sig || sig.isEmpty()) {
      return toast({ title: "Falta tu firma", description: "Dibuja tu firma con el dedo antes de confirmar.", variant: "destructive" });
    }
    setGuardandoFirma(true);
    try {
      const dataUrl = sig.getTrimmedCanvas().toDataURL("image/png");
      const firmaUrl = await subirFirma(dataUrl, firmando.comunicado_id, getSession().id || "");
      await apiRequest("/api/comunicados-firma/firmar", {
        method: "POST",
        body: JSON.stringify({ respuesta_id: firmando.respuesta_id, firma_url: firmaUrl }),
      });
      toast({ title: "Firma registrada", description: "Quedó constancia de que leíste el comunicado." });
      setFirmando(null);
      cargarMios();
    } catch (err) {
      const body = (err as { body?: { error?: string; detail?: string } })?.body;
      toast({ title: "Error", description: body?.detail || (err instanceof Error ? err.message : "No se pudo firmar."), variant: "destructive" });
    } finally {
      setGuardandoFirma(false);
    }
  };

  // ── Derivados de destinatarios (idéntico a Enviar Comunicado) ─────────
  const todosPerfilesMarcados = PERFILES_UI.every((p) => perfilesMarcados[p.key]);
  const toggleTodosPerfiles = () => {
    const marcar = !todosPerfilesMarcados;
    setPerfilesMarcados(() => {
      const next = {} as Record<PerfilKey, boolean>;
      PERFILES_UI.forEach((p) => { next[p.key] = marcar; });
      return next;
    });
    if (!marcar) {
      setCoordinadoresSeleccionados([]); setAdministrativosSeleccionados([]);
      setSecretariasSeleccionadas([]); setOrientadoresSeleccionados([]);
      setProfesoresSeleccionados([]); setMostrarProfesores(false);
      setNivelesMarcados({}); setGradosMarcados({}); setSalonesMarcados({});
      setEstudiantesSeleccionados([]);
      setOpenNivel(false); setOpenGrado(false); setOpenSalon(false);
      setMostrarEstudiantes(false);
    }
  };

  const togglePerfil = (key: PerfilKey) => {
    setPerfilesMarcados(prev => {
      const nuevo = { ...prev, [key]: !prev[key] };
      if (!nuevo[key]) {
        if (key === 'Coordinadores') setCoordinadoresSeleccionados([]);
        if (key === 'Administrativos') setAdministrativosSeleccionados([]);
        if (key === 'Secretaria') setSecretariasSeleccionadas([]);
        if (key === 'Orientador') setOrientadoresSeleccionados([]);
        if (key === 'Profesores') { setProfesoresSeleccionados([]); setMostrarProfesores(false); }
        if (!nuevo.Estudiantes && !nuevo.Padres && !nuevo.Profesores) {
          setNivelesMarcados({}); setGradosMarcados({}); setSalonesMarcados({});
          setEstudiantesSeleccionados([]);
          setOpenNivel(false); setOpenGrado(false); setOpenSalon(false);
          setMostrarEstudiantes(false);
        }
      }
      return nuevo;
    });
  };

  const toggleInterno = (lista: string[], id: string, setter: (v: string[]) => void) => {
    setter(lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id]);
  };
  const toggleEnRecord = (record: Record<string, boolean>, key: string, setter: (v: Record<string, boolean>) => void) => {
    setter({ ...record, [key]: !record[key] });
  };
  const listaANombres = (ids: string[], lista: { id: string; nombre: string }[]) =>
    ids.map(id => lista.find(x => x.id === id)?.nombre).filter(Boolean) as string[];

  const buildDestinatarios = (): string => {
    const sel = perfilesMarcados;
    const partes: string[] = [];
    const nivelesSel = Object.keys(nivelesMarcados).filter((n) => nivelesMarcados[n]);
    const gradosSel = Object.keys(gradosMarcados).filter((g) => gradosMarcados[g]);
    const salonesSel = Object.keys(salonesMarcados).filter((s) => salonesMarcados[s]);

    const aulaFrase = (prefijo: string): string => {
      if (gradosSel.length === 0) {
        if (nivelesSel.length === 0) return "";
        return `${prefijo} de ${nivelesSel.join(", ")}`;
      }
      if (salonesSel.length === 0) return `${prefijo} de ${gradosSel.join(", ")}`;
      if (gradosSel.length === 1 && salonesSel.length === 1) return `${prefijo} de ${gradosSel[0]} ${salonesSel[0]}`;
      if (gradosSel.length === 1 && salonesSel.length > 1) return `${prefijo} de ${gradosSel[0]} salones ${salonesSel.join(", ")}`;
      if (gradosSel.length > 1 && salonesSel.length === 1) return `${prefijo} de ${gradosSel.map((g) => `${g} ${salonesSel[0]}`).join(", ")}`;
      return `${prefijo} de los grados ${gradosSel.join(", ")} salones ${salonesSel.join(", ")}`;
    };

    if ((sel.Estudiantes || sel.Padres) && estudiantesSeleccionados.length > 0) {
      const ids = estudiantesSeleccionados;
      const uno = ids.length === 1;
      if (sel.Estudiantes && sel.Padres) {
        partes.push(uno ? `Estudiante y acudientes del estudiante con id ${ids[0]}` : `Estudiantes y acudientes de los estudiantes con id: ${ids.join(", ")}`);
      } else if (sel.Estudiantes) {
        partes.push(uno ? `Estudiante con id ${ids[0]}` : `Estudiantes con id: ${ids.join(", ")}`);
      } else {
        partes.push(uno ? `Acudientes del estudiante con id ${ids[0]}` : `Acudientes de los estudiantes con id: ${ids.join(", ")}`);
      }
    } else {
      if (sel.Estudiantes) { const frase = aulaFrase("Estudiantes"); partes.push(frase || "Estudiantes"); }
      if (sel.Padres) { const frase = aulaFrase("Acudientes"); partes.push(frase || "Acudientes"); }
    }

    if (sel.Profesores) {
      if (profesoresSeleccionados.length > 0) {
        const nombres = listaANombres(profesoresSeleccionados, listaProfesoresFiltrada);
        partes.push(nombres.length === 1 ? `Profesor(a) ${nombres[0]}` : `Profesores ${nombres.join(", ")}`);
      } else { const frase = aulaFrase("Profesores"); partes.push(frase || "Profesores"); }
    }
    if (sel.Coordinadores) {
      if (coordinadoresSeleccionados.length === 0) partes.push("Coordinadores");
      else { const nombres = listaANombres(coordinadoresSeleccionados, listaCoordinadores); partes.push(nombres.length === 1 ? `Coordinador(a) ${nombres[0]}` : `Coordinadores ${nombres.join(", ")}`); }
    }
    if (sel.Rector) partes.push("Rector");
    if (sel.Administrativos) {
      if (administrativosSeleccionados.length === 0) partes.push("Administrativos");
      else { const nombres = listaANombres(administrativosSeleccionados, listaAdministrativos); partes.push(nombres.length === 1 ? `Administrativo(a) ${nombres[0]}` : `Administrativos ${nombres.join(", ")}`); }
    }
    if (sel.Secretaria) {
      if (secretariasSeleccionadas.length === 0) partes.push("Secretaria General");
      else { const nombres = listaANombres(secretariasSeleccionadas, listaSecretarias); partes.push(nombres.length === 1 ? `Secretaria ${nombres[0]}` : `Secretarias ${nombres.join(", ")}`); }
    }
    if (sel.Orientador) {
      if (orientadoresSeleccionados.length === 0) partes.push("Orientador(a) Escolar");
      else { const nombres = listaANombres(orientadoresSeleccionados, listaOrientadores); partes.push(nombres.length === 1 ? `Orientador(a) ${nombres[0]}` : `Orientadores ${nombres.join(", ")}`); }
    }
    return partes.length === 0 ? "" : partes.join(". ") + ".";
  };

  const destinatariosTexto = buildDestinatarios();
  const algunPerfilMarcado = Object.values(perfilesMarcados).some(Boolean);

  const templateBodyLength = buildTemplateBodyPreview({
    remitente, destinatarios: destinatariosTexto, mensaje, archivos: archivosSeleccionados,
  }).length + WA_TEMPLATE_OVERHEAD;
  const bodyOverLimit = templateBodyLength > MAX_WA_TEMPLATE_BODY;
  const baselineLength = buildTemplateBodyPreview({ remitente, destinatarios: "", mensaje: "", archivos: [] }).length + WA_TEMPLATE_OVERHEAD;
  const personalMax = MAX_WA_TEMPLATE_BODY - baselineLength;
  const usedChars = Math.max(0, templateBodyLength - baselineLength);
  const canSend = algunPerfilMarcado && (mensaje.trim() || archivosSeleccionados.length > 0);

  const handleEnviar = async () => {
    setShowConfirm(false);
    setEnviando(true);
    try {
      // Subir archivos
      let archivoUrl: string | null = null;
      if (archivosSeleccionados.length > 0) {
        const urls: string[] = [];
        for (const archivo of archivosSeleccionados) {
          const timestamp = Date.now();
          const nombreLimpio = archivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
          const fileName = `${timestamp}_${nombreLimpio}`;
          const { error: uploadError } = await supabase.storage.from("normi-archivos").upload(fileName, archivo);
          if (uploadError) throw new Error(`Error subiendo archivo: ${uploadError.message}`);
          urls.push(supabase.storage.from("normi-archivos").getPublicUrl(fileName).data.publicUrl);
        }
        archivoUrl = urls.join("\n");
      }

      // Construir segmentos (idéntico a Enviar Comunicado)
      const gradosSel = Object.keys(gradosMarcados).filter(g => gradosMarcados[g]);
      const salonesSel = Object.keys(salonesMarcados).filter(s => salonesMarcados[s]);
      const nivelesSel = Object.keys(nivelesMarcados).filter(n => nivelesMarcados[n]);
      const nivelUnico = nivelesSel.length === 1 ? nivelesSel[0] : null;
      let gradosFinal: string[] | null = gradosSel.length > 0 ? gradosSel : null;
      if (nivelesSel.length > 1) {
        const gradosDeNiveles: string[] = [];
        for (const niv of nivelesSel) for (const g of (nivelesGrados[niv] || [])) if (!gradosDeNiveles.includes(g)) gradosDeNiveles.push(g);
        if (gradosFinal) { for (const g of gradosDeNiveles) if (!gradosFinal.includes(g)) gradosFinal.push(g); }
        else gradosFinal = gradosDeNiveles;
      }
      const salonesFinal = salonesSel.length > 0 ? salonesSel : null;

      const segmentos: Array<{ perfil: string[]; nivel?: string | null; grados?: string[] | null; salones?: string[] | null; id_destinatarios?: string[] | null; }> = [];

      const perfilesEstPadres: string[] = [];
      if (perfilesMarcados.Estudiantes) perfilesEstPadres.push("Estudiantes");
      if (perfilesMarcados.Padres) perfilesEstPadres.push("Acudientes");
      if (perfilesEstPadres.length > 0) {
        if (estudiantesSeleccionados.length > 0) segmentos.push({ perfil: perfilesEstPadres, id_destinatarios: estudiantesSeleccionados });
        else segmentos.push({ perfil: perfilesEstPadres, nivel: nivelUnico, grados: gradosFinal, salones: salonesFinal });
      }

      const profesoresConFiltroAula = perfilesMarcados.Profesores && profesoresSeleccionados.length === 0 && (nivelUnico || gradosFinal || salonesFinal);
      if (profesoresConFiltroAula) segmentos.push({ perfil: ["Profesores"], nivel: nivelUnico, grados: gradosFinal, salones: salonesFinal });

      const internosConIds: { perfiles: string[]; ids: string[] } = { perfiles: [], ids: [] };
      const internosTodos: string[] = [];
      const addInterno = (perfilName: string, marcado: boolean, idsSeleccionados: string[]) => {
        if (!marcado) return;
        if (idsSeleccionados.length > 0) {
          if (!internosConIds.perfiles.includes(perfilName)) internosConIds.perfiles.push(perfilName);
          for (const id of idsSeleccionados) if (!internosConIds.ids.includes(id)) internosConIds.ids.push(id);
        } else internosTodos.push(perfilName);
      };
      if (!profesoresConFiltroAula) addInterno("Profesores", perfilesMarcados.Profesores, profesoresSeleccionados);
      addInterno("Coordinadores", perfilesMarcados.Coordinadores, coordinadoresSeleccionados);
      addInterno("Administrativos", perfilesMarcados.Administrativos, administrativosSeleccionados);
      addInterno("Secretaria General", perfilesMarcados.Secretaria, secretariasSeleccionadas);
      addInterno("Orientadores", perfilesMarcados.Orientador, orientadoresSeleccionados);
      if (perfilesMarcados.Rector) internosTodos.push("Rector");
      if (internosConIds.perfiles.length > 0) segmentos.push({ perfil: internosConIds.perfiles, id_destinatarios: internosConIds.ids });
      if (internosTodos.length > 0) segmentos.push({ perfil: internosTodos });

      const response = await apiRequest<{ ok: true; job_id?: string; total?: number }>(
        '/api/comunicados-firma/enviar',
        {
          method: "POST",
          body: JSON.stringify({
            destinatarios_label: destinatariosTexto,
            mensaje: mensaje.trim(),
            archivo_url: archivoUrl || null,
            segmentos,
          }),
        },
      );

      setSentInfo({ jobId: response.job_id, total: response.total });
      setShowSentDialog(true);
      setMensaje("");
      setArchivosSeleccionados([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "No se pudo enviar el comunicado. Intenta de nuevo.";
      const body = (error as { body?: { error?: string; detail?: string } })?.body;
      const bodyStr = body ? `${body.error || ""} ${body.detail || ""}` : "";
      const sinDestinatarios = /no[_ ]destinatarios|no se encontraron destinatarios/i.test(`${errorMsg} ${bodyStr}`);
      toast({
        title: sinDestinatarios ? "Sin destinatarios" : "Error",
        description: sinDestinatarios ? "Ningún usuario coincide con los filtros seleccionados. Revisa los destinatarios." : (body?.detail || errorMsg),
        variant: sinDestinatarios ? "default" : "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  const backLink = isAdmin() ? "/dashboard-admin" : puedeAccederDashboard() ? "/panel" : "/dashboard";

  const firmadas = respuestas.filter((r) => r.fecha_firma);
  const noFirmadas = respuestas.filter((r) => !r.fecha_firma);
  const nombrePersona = (r: RespuestaRow) => `${r.destinatario_apellidos || ""} ${r.destinatario_nombre || ""}`.trim() || r.destinatario_id;
  const refEstudiante = (r: { estudiante_nombre: string | null; estudiante_apellidos: string | null; estudiante_grado: string | null; estudiante_salon: string | null }) =>
    (r.estudiante_nombre || r.estudiante_apellidos)
      ? `${r.estudiante_apellidos || ""} ${r.estudiante_nombre || ""}`.trim() + (r.estudiante_grado ? ` (${r.estudiante_grado}${r.estudiante_salon ? " " + r.estudiante_salon : ""})` : "")
      : "";

  // ── Render del FORM de envío (idéntico a Enviar Comunicado) ───────────
  const renderEnviar = () => (
    <>
      <div className="relative mt-4 mb-6">
        <h2 className="text-2xl font-bold text-foreground text-center">Comunicado con firma</h2>
        <button
          type="button"
          onClick={limpiarFormulario}
          className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 text-sm border border-input bg-background rounded-md hover:bg-muted transition-colors"
          title="Limpiar todos los destinatarios y el mensaje"
        >
          <RotateCcw className="w-4 h-4" />
          Limpiar
        </button>
      </div>

      {/* Destinatarios */}
      <div className="space-y-4 mb-6">
        {(() => {
          const count = PERFILES_UI.filter(p => perfilesMarcados[p.key]).length;
          return (
            <div className="space-y-1">
              <Label>Perfiles</Label>
              <button
                type="button"
                onClick={() => setOpenPerfiles(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded cursor-pointer hover:bg-muted/40 bg-background"
              >
                <span>Perfiles {count > 0 ? `(${count} seleccionado${count !== 1 ? 's' : ''})` : '(Ninguno)'}</span>
                <span className="text-xs">{openPerfiles ? '▲' : '▼'}</span>
              </button>
              {openPerfiles && (
                <div className="border rounded p-2 bg-muted/20 flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-semibold border-b pb-2 mb-1">
                    <input type="checkbox" checked={todosPerfilesMarcados} onChange={toggleTodosPerfiles} className="w-4 h-4 accent-primary cursor-pointer" />
                    <span>Todos</span>
                  </label>
                  {PERFILES_UI.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input type="checkbox" checked={perfilesMarcados[p.key]} onChange={() => togglePerfil(p.key)} className="w-4 h-4 accent-primary cursor-pointer" />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {(() => {
          if (!(perfilesMarcados.Estudiantes || perfilesMarcados.Padres || perfilesMarcados.Profesores)) return null;
          const nivelesSel = Object.keys(nivelesMarcados).filter(n => nivelesMarcados[n]);
          const gradosDisponibles = nivelesSel.flatMap(n => nivelesGrados[n] || []);
          const gradosSelCount = Object.keys(gradosMarcados).filter(g => gradosMarcados[g] && gradosDisponibles.includes(g)).length;
          const salonesSelCount = Object.keys(salonesMarcados).filter(s => salonesMarcados[s]).length;

          const dropdownBtn = (label: string, count: number, open: boolean, onToggle: () => void, disabled: boolean) => (
            <button
              type="button"
              disabled={disabled}
              onClick={onToggle}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded ${disabled ? 'opacity-50 cursor-not-allowed bg-muted/30' : 'cursor-pointer hover:bg-muted/40 bg-background'}`}
            >
              <span>{label} {disabled ? '(bloqueado)' : count > 0 ? `(${count} seleccionado${count !== 1 ? 's' : ''})` : '(Todos)'}</span>
              <span className="text-xs">{open && !disabled ? '▲' : '▼'}</span>
            </button>
          );

          return (
            <div className="border-l-2 border-primary/30 pl-4 space-y-5">
              <div className="space-y-1">
                <Label className="text-xs">Nivel</Label>
                {dropdownBtn("Nivel", nivelesSel.length, openNivel, () => setOpenNivel(v => !v), false)}
                {openNivel && (
                  <div className="border rounded p-2 bg-muted/20 flex flex-col gap-2">
                    {Object.keys(nivelesGrados).map(n => (
                      <label key={n} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={!!nivelesMarcados[n]}
                          onChange={() => {
                            const nuevo = !nivelesMarcados[n];
                            setNivelesMarcados({ ...nivelesMarcados, [n]: nuevo });
                            if (!nuevo) {
                              const gradosDeEseNivel = nivelesGrados[n] || [];
                              const nuevosGrados = { ...gradosMarcados };
                              gradosDeEseNivel.forEach(g => { delete nuevosGrados[g]; });
                              setGradosMarcados(nuevosGrados);
                            }
                          }}
                          className="w-4 h-4 accent-primary cursor-pointer"
                        />
                        <span>{n}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {nivelesSel.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Grado</Label>
                  {dropdownBtn("Grado", gradosSelCount, openGrado, () => setOpenGrado(v => !v), false)}
                  {openGrado && (
                    <div className="border rounded p-2 bg-muted/20 space-y-2">
                      {nivelesSel.map(niv => (
                        <div key={niv} className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">{niv}</p>
                          <div className="flex flex-col gap-2 pl-2">
                            {(nivelesGrados[niv] || []).map(g => (
                              <label key={g} className="flex items-center gap-2 cursor-pointer text-sm">
                                <input type="checkbox" checked={!!gradosMarcados[g]} onChange={() => toggleEnRecord(gradosMarcados, g, setGradosMarcados)} className="w-4 h-4 accent-primary cursor-pointer" />
                                <span>{g}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {gradosSelCount > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Salón</Label>
                  {dropdownBtn("Salón", salonesSelCount, openSalon, () => setOpenSalon(v => !v), false)}
                  {openSalon && (
                    <div className="border rounded p-2 bg-muted/20 flex flex-col gap-2">
                      {salonesDisponibles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Cargando salones...</span>
                      ) : salonesDisponibles.map(s => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" checked={!!salonesMarcados[s]} onChange={() => toggleEnRecord(salonesMarcados, s, setSalonesMarcados)} className="w-4 h-4 accent-primary cursor-pointer" />
                          <span>{s}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {(perfilesMarcados.Estudiantes || perfilesMarcados.Padres) && Object.values(gradosMarcados).some(Boolean) && (
          <div className="border-l-2 border-primary/30 pl-4 space-y-1">
            <Label className="text-xs">Estudiantes específicos</Label>
            <button
              type="button"
              onClick={() => setMostrarEstudiantes(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded cursor-pointer hover:bg-muted/40 bg-background"
            >
              <span>Estudiantes {estudiantesSeleccionados.length > 0 ? `(${estudiantesSeleccionados.length} seleccionado${estudiantesSeleccionados.length !== 1 ? "s" : ""})` : "(Todos)"}</span>
              <span className="text-xs">{mostrarEstudiantes ? "▲" : "▼"}</span>
            </button>
            {mostrarEstudiantes && (
              loadingListaEstudiantes ? (
                <div className="border rounded p-2 bg-muted/20 text-xs text-muted-foreground">Cargando estudiantes...</div>
              ) : listaEstudiantesFiltrada.length === 0 ? (
                <div className="border rounded p-2 bg-muted/20 text-xs text-muted-foreground">No hay estudiantes en esos grados/salones</div>
              ) : (
                <div className="border rounded p-2 bg-muted/20 flex flex-col gap-2">
                  <input
                    type="text"
                    value={filtroEstudiantes}
                    onChange={(ev) => setFiltroEstudiantes(ev.target.value)}
                    placeholder="Buscar por nombres o apellidos..."
                    className="w-full px-2 py-1.5 text-sm border rounded bg-background"
                  />
                  <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                    {(() => {
                      const filtrados = filtrarPorNombre(listaEstudiantesFiltrada, filtroEstudiantes);
                      if (filtrados.length === 0) return <span className="text-xs text-muted-foreground">Ningún estudiante coincide con "{filtroEstudiantes}"</span>;
                      return filtrados.map((e) => (
                        <label key={e.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" checked={estudiantesSeleccionados.includes(e.id)} onChange={() => toggleInterno(estudiantesSeleccionados, e.id, setEstudiantesSeleccionados)} className="w-4 h-4 accent-primary cursor-pointer shrink-0" />
                          <span>{e.nombre} <span className="text-xs text-muted-foreground">({e.grado} {e.salon})</span></span>
                        </label>
                      ));
                    })()}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {perfilesMarcados.Profesores && (
          <div className="border-l-2 border-primary/30 pl-4 space-y-1">
            <Label className="text-xs">Profesores específicos (vacío = todos los que coinciden con los filtros)</Label>
            <button
              type="button"
              onClick={() => setMostrarProfesores(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded cursor-pointer hover:bg-muted/40 bg-background"
            >
              <span>Profesores {profesoresSeleccionados.length > 0 ? `(${profesoresSeleccionados.length} seleccionado${profesoresSeleccionados.length !== 1 ? "s" : ""})` : "(Todos)"}</span>
              <span className="text-xs">{mostrarProfesores ? "▲" : "▼"}</span>
            </button>
            {mostrarProfesores && (
              loadingListaProfesores ? (
                <div className="border rounded p-2 bg-muted/20 text-xs text-muted-foreground">Cargando profesores...</div>
              ) : listaProfesoresFiltrada.length === 0 ? (
                <div className="border rounded p-2 bg-muted/20 text-xs text-muted-foreground">No hay profesores con esos filtros</div>
              ) : (
                <div className="border rounded p-2 bg-muted/20 flex flex-col gap-2 max-h-52 overflow-y-auto">
                  {listaProfesoresFiltrada.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={profesoresSeleccionados.includes(p.id)} onChange={() => toggleInterno(profesoresSeleccionados, p.id, setProfesoresSeleccionados)} className="w-4 h-4 accent-primary cursor-pointer shrink-0" />
                      <span>
                        {p.nombre}
                        {(p.grados.length > 0 || p.salones.length > 0) && (
                          <span className="text-xs text-muted-foreground"> ({[p.grados.join(", "), p.salones.length > 0 ? `Salón ${p.salones.join(", ")}` : ""].filter(Boolean).join(" — ")})</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {[
          { on: perfilesMarcados.Coordinadores, label: "Coordinadores", lista: listaCoordinadores, sel: coordinadoresSeleccionados, setter: setCoordinadoresSeleccionados },
          { on: perfilesMarcados.Administrativos, label: "Administrativos", lista: listaAdministrativos, sel: administrativosSeleccionados, setter: setAdministrativosSeleccionados },
          { on: perfilesMarcados.Secretaria, label: "Secretaria General", lista: listaSecretarias, sel: secretariasSeleccionadas, setter: setSecretariasSeleccionadas },
          { on: perfilesMarcados.Orientador, label: "Orientador(a) Escolar", lista: listaOrientadores, sel: orientadoresSeleccionados, setter: setOrientadoresSeleccionados },
        ].filter(x => x.on).map((grupo) => (
          <div key={grupo.label} className="border-l-2 border-primary/30 pl-4 space-y-2">
            <p className="text-xs text-muted-foreground">{grupo.label} específicos (vacío = todos)</p>
            {loadingInternos && grupo.lista.length === 0 ? (
              <p className="text-xs text-muted-foreground">Cargando...</p>
            ) : grupo.lista.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay personas con este cargo</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {grupo.lista.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={grupo.sel.includes(p.id)} onChange={() => toggleInterno(grupo.sel, p.id, grupo.setter)} className="w-4 h-4 accent-primary cursor-pointer" />
                    <span>{p.nombre}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}

        {algunPerfilMarcado && (
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-red-600">Destinatarios:</span>{" "}
            <span className="font-medium text-foreground">{destinatariosTexto}</span>
          </p>
        )}
      </div>

      {/* Mensaje */}
      <div className="space-y-2 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Mensaje</h3>
          <div className="flex items-center gap-3">
            <FormatoWhatsAppToolbar editorRef={mensajeRef} />
            <CharCircle value={usedChars} max={personalMax} />
          </div>
        </div>
        <EditorComunicado ref={mensajeRef} valor={mensaje} setValor={setMensaje} placeholder="Escribe el comunicado..." />
      </div>

      {/* Archivos adjuntos */}
      <div className="space-y-2 mb-6">
        <h3 className="text-lg font-semibold text-foreground">
          Archivos adjuntos <span className="text-sm font-normal text-muted-foreground">(opcional)</span>
        </h3>
        {archivosSeleccionados.length > 0 && (
          <div className="space-y-2">
            {archivosSeleccionados.map((file, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm overflow-hidden">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                <button type="button" onClick={() => setArchivosSeleccionados(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive shrink-0 ml-auto">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => { if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }}
          className="flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
        >
          <Paperclip className="w-4 h-4" />
          Adjuntar archivos
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            const MAX_BYTES = 20 * 1024 * 1024;
            const aceptados: File[] = [];
            const rechazados: Array<{ nombre: string; mb: string }> = [];
            for (const f of Array.from(files)) {
              if (f.size > MAX_BYTES) rechazados.push({ nombre: f.name, mb: (f.size / 1024 / 1024).toFixed(1) });
              else aceptados.push(f);
            }
            if (aceptados.length > 0) setArchivosSeleccionados(prev => [...prev, ...aceptados]);
            if (rechazados.length > 0) setArchivosRechazados(rechazados);
            e.target.value = "";
          }}
        />
      </div>

      {/* Botón enviar */}
      <button
        disabled={!canSend || enviando}
        onClick={() => {
          if (bodyOverLimit) {
            toast({
              title: "Comunicado demasiado largo",
              description: `El contenido total (${templateBodyLength} caracteres) supera el límite de ${MAX_WA_TEMPLATE_BODY} caracteres de WhatsApp. Reduce el mensaje o los destinatarios.`,
              variant: "destructive",
            });
            return;
          }
          setShowConfirm(true);
        }}
        className={`w-full flex items-center justify-center gap-2 p-4 rounded-lg text-white font-bold text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
          bodyOverLimit
            ? "bg-gradient-to-r from-red-500 to-red-600 cursor-not-allowed hover:shadow-none"
            : "bg-gradient-to-r from-green-500 to-green-600 hover:shadow-md hover:scale-[1.01] hover:from-green-600 hover:to-green-500"
        }`}
      >
        {enviando ? (<><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</>) : (<><Send className="w-5 h-5" /> Enviar y solicitar firma</>)}
      </button>
    </>
  );

  // ── Render Enviados ────────────────────────────────────────────────────
  const renderEnviados = () => (
    <>
      <h2 className="text-2xl font-bold text-foreground mb-6 text-center mt-4">Comunicados enviados</h2>
      {loadingEnviados ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Cargando...</div>
      ) : enviados.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Todavía no has enviado comunicados con firma.</p>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por destinatario o mensaje..." className="pl-9" />
          </div>
          {enviados.filter((c) => {
            if (!busqueda.trim()) return true;
            const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
            const term = norm(busqueda);
            return norm(c.destinatarios_label || "").includes(term) || norm(c.mensaje || "").includes(term);
          }).map((c) => (
            <div key={c.id} className="bg-primary/10 border-2 border-primary/40 rounded-lg p-4 space-y-2 cursor-pointer hover:bg-primary/15" onClick={() => abrirDetalle(c)}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" /> {fmtFecha(c.fecha)}</div>
                <div className="flex items-center gap-2">
                  <Badge className={c.firmadas >= c.total && c.total > 0 ? "bg-green-100 text-green-800 border border-green-300" : "bg-amber-500"}>
                    {c.firmadas}/{c.total} firmadas
                  </Badge>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }} title="Eliminar"><Trash2 className="h-4 w-4 text-destructive" /></button>
                </div>
              </div>
              {c.destinatarios_label && <p className="text-sm"><span className="font-bold text-red-600">Para:</span> {c.destinatarios_label}</p>}
              <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">{c.mensaje}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ── Render Por firmar ──────────────────────────────────────────────────
  const renderPorFirmar = () => (
    <>
      <h2 className="text-2xl font-bold text-foreground mb-6 text-center mt-4">Por firmar</h2>
      {loadingMios ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Cargando...</div>
      ) : mios.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No tienes comunicados para firmar.</p>
      ) : (
        <div className="space-y-3">
          {mios.map((m) => {
            const firmado = !!m.fecha_firma;
            const est = refEstudiante(m);
            return (
              <div
                key={m.respuesta_id}
                className={`rounded-lg p-4 space-y-1 cursor-pointer transition-colors ${firmado ? "bg-muted/40 border" : "bg-primary/10 border-2 border-primary/40 hover:bg-primary/15"}`}
                onClick={() => setFirmando(m)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {firmado ? (
                    <Badge className="bg-green-100 text-green-800 border border-green-300"><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Firmada</Badge>
                  ) : (
                    <Badge className="bg-amber-500">Pendiente por firmar</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{m.comunicado ? fmtFecha(m.comunicado.fecha) : ""}</span>
                </div>
                {est && <p className="text-xs text-muted-foreground">Acudiente de: <strong>{est}</strong></p>}
                <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">{m.comunicado?.mensaje}</p>
                <p className="text-xs text-muted-foreground">{m.comunicado?.creado_por_cargo === "Administrador" ? "Normi" : (m.comunicado?.remitente || "")}</p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Índice de navegación */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6 max-w-2xl mx-auto">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Comunicados con firma</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto mb-6 text-center">
          Envía un comunicado que la persona debe firmar para confirmar que lo leyó.
        </p>

        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-2xl mx-auto">
          {esEmisor ? (
            <Tabs defaultValue="enviar" onValueChange={(v) => { if (v === "enviados") cargarEnviados(); if (v === "porfirmar") cargarMios(); }}>
              <TabsList className="flex w-full">
                <TabsTrigger value="enviar" className="flex-1 text-xs md:text-sm px-2 md:px-3">Enviar</TabsTrigger>
                <TabsTrigger value="enviados" className="flex-1 text-xs md:text-sm px-2 md:px-3">Enviados</TabsTrigger>
                <TabsTrigger value="porfirmar" className="flex-1 text-xs md:text-sm px-2 md:px-3">Por firmar</TabsTrigger>
              </TabsList>
              <TabsContent value="enviar">{renderEnviar()}</TabsContent>
              <TabsContent value="enviados">{renderEnviados()}</TabsContent>
              <TabsContent value="porfirmar">{renderPorFirmar()}</TabsContent>
            </Tabs>
          ) : (
            <PorFirmarLoader cargar={cargarMios}>{renderPorFirmar()}</PorFirmarLoader>
          )}
        </div>
      </main>

      {/* Confirmar envío */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar envío</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Remitente:</span> {remitente}</p>
                <p><span className="font-medium text-foreground">Destinatarios:</span> {destinatariosTexto}</p>
                <p><span className="font-medium text-foreground">Mensaje:</span></p>
                <p className="whitespace-pre-wrap bg-stone-50 border border-stone-200 p-3 rounded-md leading-relaxed">{mensaje}</p>
                {archivosSeleccionados.length > 0 && (
                  <p><span className="font-medium text-foreground">Archivos adjuntos:</span> {archivosSeleccionados.length} archivo{archivosSeleccionados.length > 1 ? "s" : ""}</p>
                )}
                <p className="text-amber-700">Cada persona deberá firmar para confirmar que lo leyó.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">Cancelar</button>
            <button onClick={handleEnviar} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">Enviar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalle Enviado (Firmada / No firmada) */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader><DialogTitle>Seguimiento de firmas</DialogTitle></DialogHeader>
              <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap mb-2">{detalle.mensaje}</div>
              {detalle.archivo_url && detalle.archivo_url.split("\n").filter(Boolean).map((url, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <button onClick={() => handleVerArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5"><Eye className="h-4 w-4" /> Ver</button>
                  <button onClick={() => handleDescargarArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1.5"><Download className="h-4 w-4" /> Descargar</button>
                </div>
              ))}
              <div className="flex gap-2 mb-3">
                <button onClick={() => handleReenviar(detalle)} className="px-3 py-1.5 text-sm font-medium border rounded-md hover:bg-muted flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /> Reenviar a los que faltan</button>
              </div>
              {loadingDetalle ? (
                <div className="text-center py-6 text-muted-foreground">Cargando...</div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-green-700 flex items-center gap-1 mb-2"><CheckCircle2 className="h-4 w-4" /> Firmada ({firmadas.length})</h3>
                    {firmadas.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nadie ha firmado todavía.</p>
                    ) : (
                      <div className="space-y-1">
                        {firmadas.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-2 text-sm border rounded px-2 py-1.5">
                            <div className="min-w-0">
                              <span className="font-medium">{nombrePersona(r)}</span>
                              {refEstudiante(r) && <span className="text-xs text-muted-foreground"> — acudiente de {refEstudiante(r)}</span>}
                              <div className="text-xs text-muted-foreground">{r.fecha_firma ? fmtFecha(r.fecha_firma) : ""}</div>
                            </div>
                            {r.firma_url && (
                              <a href={r.firma_url} target="_blank" rel="noreferrer" className="shrink-0"><img src={r.firma_url} alt="firma" className="h-10 border rounded bg-white" /></a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-amber-700 flex items-center gap-1 mb-2"><Clock className="h-4 w-4" /> No firmada ({noFirmadas.length})</h3>
                    {noFirmadas.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Todos firmaron. 🎉</p>
                    ) : (
                      <div className="space-y-1">
                        {noFirmadas.map((r) => (
                          <div key={r.id} className="text-sm border rounded px-2 py-1.5">
                            <span className="font-medium">{nombrePersona(r)}</span>
                            {refEstudiante(r) && <span className="text-xs text-muted-foreground"> — acudiente de {refEstudiante(r)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      <Dialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar comunicado con firma</DialogTitle>
            <DialogDescription>Se borrará el comunicado y todo su registro de firmas. Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">Cancelar</button>
            <button onClick={handleEliminar} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90">Eliminar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Firmar / Ver comunicado (receptor) */}
      <Dialog open={!!firmando} onOpenChange={(o) => !o && setFirmando(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {firmando && (
            <>
              <DialogHeader><DialogTitle>{firmando.fecha_firma ? "Comunicado firmado" : "Leer y firmar"}</DialogTitle></DialogHeader>
              {refEstudiante(firmando) && <p className="text-xs text-muted-foreground">Acudiente de: <strong>{refEstudiante(firmando)}</strong></p>}
              <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">{firmando.comunicado?.mensaje}</div>
              {firmando.comunicado?.archivo_url && firmando.comunicado.archivo_url.split("\n").filter(Boolean).map((url, i) => (
                <button key={i} onClick={() => handleVerArchivo(url)} className="text-xs text-primary hover:underline flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {getCleanFilename(url)}</button>
              ))}
              {firmando.fecha_firma ? (
                <div className="border rounded-md p-3 bg-green-50">
                  <p className="text-sm text-green-800 flex items-center gap-1 mb-2"><CheckCircle2 className="h-4 w-4" /> Firmaste el {fmtFecha(firmando.fecha_firma)}</p>
                  {firmando.firma_url && <img src={firmando.firma_url} alt="Tu firma" className="h-20 border rounded bg-white" />}
                  <p className="text-xs text-muted-foreground mt-1">Una vez firmado, no se puede modificar.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm">Dibuja tu firma con el dedo:</Label>
                  <div className="border rounded-md bg-white">
                    <SignatureCanvas ref={sigRef} penColor="black" canvasProps={{ className: "w-full touch-none", style: { height: "180px" } }} />
                  </div>
                  <div className="flex justify-between">
                    <button type="button" onClick={() => sigRef.current?.clear()} className="px-3 py-1.5 text-sm font-medium border rounded-md hover:bg-muted flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /> Borrar</button>
                    <button onClick={handleFirmar} disabled={guardandoFirma} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50"><PenLine className="h-4 w-4" /> {guardandoFirma ? "Guardando..." : "Firmar"}</button>
                  </div>
                  <p className="text-xs text-muted-foreground">Puedes corregirla con "Borrar" antes de confirmar. Al firmar quedará bloqueada.</p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Archivos demasiado grandes */}
      <Dialog open={archivosRechazados.length > 0} onOpenChange={(open) => { if (!open) setArchivosRechazados([]); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>El archivo es muy grande</DialogTitle>
            <DialogDescription>
              {archivosRechazados.length === 1
                ? "No se pudo adjuntar el siguiente archivo porque supera el tamaño máximo permitido (20 MB):"
                : `No se pudieron adjuntar ${archivosRechazados.length} archivos porque superan el tamaño máximo permitido (20 MB):`}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {archivosRechazados.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 bg-muted rounded-md">
                <span className="truncate flex-1" title={a.nombre}>{a.nombre}</span>
                <span className="text-destructive font-medium whitespace-nowrap">{a.mb} MB</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <button type="button" onClick={() => setArchivosRechazados([])} className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium">Entendido</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ComunicadoEnviadoDialog open={showSentDialog} onOpenChange={setShowSentDialog} jobId={sentInfo.jobId} total={sentInfo.total} />
    </div>
  );
};

/** Carga "mios" al montar para el receptor (estudiante/acudiente, sin pestañas). */
function PorFirmarLoader({ cargar, children }: { cargar: () => void; children: React.ReactNode }) {
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return <>{children}</>;
}

export default ComunicadosFirma;
