import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEstructuraOrden } from "@/utils/estructuraOrden";
import { Label } from "@/components/ui/label";
import ResponsiveSelect from "@/components/ResponsiveSelect";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSession, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { Loader2, Send, Clock, Trash2, Search, Users, Eye, Paperclip, X, FileText, Download, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ComunicadoEnviadoDialog from "@/components/ComunicadoEnviadoDialog";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/lib/apiClient";
import { filtrarPorNombre } from "@/lib/nombresUsuarios";
import FormatoWhatsAppToolbar, { EditorComunicado, EditorComunicadoHandle } from "@/components/FormatoWhatsAppToolbar";
import DictadoMic from "@/components/DictadoMic";
import CharCircle from "@/components/CharCircle";
import { buildTemplateBodyPreview, MAX_WA_TEMPLATE_BODY, WA_TEMPLATE_OVERHEAD } from "@/lib/wapBody";

// Migrado de n8n → normi-server: ya no llamamos a webhook externo. El endpoint
// /api/comunicados/enviar del server hace toda la lógica (resolver
// destinatarios + WhatsApp + guardar) en proceso, con multi-tenant filtrado
// por el JWT del usuario.

type PerfilKey = 'Estudiantes' | 'Padres' | 'Profesores' | 'Coordinadores' | 'Rector' | 'Administrativos' | 'Secretaria' | 'Orientador' | 'Portero';

const PERFILES_UI: { key: PerfilKey; label: string }[] = [
  { key: 'Estudiantes', label: 'Estudiantes' },
  { key: 'Padres', label: 'Acudientes' },
  { key: 'Profesores', label: 'Profesores' },
  { key: 'Coordinadores', label: 'Coordinadores' },
  { key: 'Rector', label: 'Rector' },
  { key: 'Administrativos', label: 'Administrativos' },
  { key: 'Secretaria', label: 'Secretaria General' },
  { key: 'Orientador', label: 'Orientador(a) Escolar' },
  { key: 'Portero', label: 'Porteros' },
];

// El envío masivo personalizado ahora vive en el server:
// POST /api/comunicados/enviar-masivo (apiRequest, JWT obligatorio).
// El workflow n8n "Masivo Personalizado" queda apagado.



interface ComunicadoEnviado {
  id: number;
  remitente: string;
  destinatarios: string;
  mensaje: string;
  archivo_url: string | null;
  fecha: string;
  id_remitente: string | null;
}

const getCleanFilename = (url: string) =>
  decodeURIComponent((url.split('/').pop() || '').replace(/^\d+-[a-z0-9]+-/, ''));

const getFileExt = (url: string) =>
  (url.split('.').pop() || '').toLowerCase().split('?')[0];

const handleVerArchivoHist = (url: string, e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const ext = getFileExt(url);
  const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
  if (officeExts.includes(ext)) {
    window.open(`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`, '_blank');
  } else {
    window.open(url, '_blank');
  }
};

const handleDescargarArchivoHist = async (url: string, e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
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

const EnviarComunicado = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [remitente, setRemitente] = useState("");
  const [idRemitente, setIdRemitente] = useState("");
  const [cargo, setCargo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSentDialog, setShowSentDialog] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ jobId?: string; total?: number }>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Destinatarios state — perfiles (multi-select con checkboxes)
  const [perfilesMarcados, setPerfilesMarcados] = useState<Record<PerfilKey, boolean>>({
    Estudiantes: false, Padres: false, Profesores: false,
    Coordinadores: false, Rector: false, Administrativos: false, Secretaria: false, Orientador: false, Portero: false,
  });

  // Niveles y grados REALMENTE existentes en este colegio, derivados de la tabla
  // Estudiantes (RLS filtra por colegio). Reemplaza la lista hardcodeada que era
  // igual para todos: así "Párvulo" aparece en el Pestalozziano pero no en la
  // Normal, y cualquier colegio nuevo muestra solo los grados que de verdad tiene.
  const orden = useEstructuraOrden();
  const [estructuraRaw, setEstructuraRaw] = useState<{ nivel: string; grado: string }[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("Estudiantes").select("nivel, grado");
      setEstructuraRaw((((data as { nivel: string | null; grado: string | null }[] | null) || [])
        .filter((r) => r.nivel && r.grado)) as { nivel: string; grado: string }[]);
    })();
  }, []);
  const nivelesGrados = useMemo(() => {
    const porNivel: Record<string, Set<string>> = {};
    for (const r of estructuraRaw) (porNivel[r.nivel] ||= new Set()).add(r.grado);
    const mapa: Record<string, string[]> = {};
    for (const niv of Object.keys(porNivel).sort((a, b) => orden.nivelRank(a) - orden.nivelRank(b))) {
      mapa[niv] = [...porNivel[niv]].sort((a, b) => orden.gradoRank(a) - orden.gradoRank(b));
    }
    return mapa;
  }, [estructuraRaw, orden.nivelRank, orden.gradoRank]);

  // Filtros en cascada con checkboxes (Nivel → Grado → Salón)
  const [nivelesMarcados, setNivelesMarcados] = useState<Record<string, boolean>>({});
  const [gradosMarcados, setGradosMarcados] = useState<Record<string, boolean>>({});
  const [salonesMarcados, setSalonesMarcados] = useState<Record<string, boolean>>({});
  const [openPerfiles, setOpenPerfiles] = useState(false);
  const [openNivel, setOpenNivel] = useState(false);
  const [openGrado, setOpenGrado] = useState(false);
  const [openSalon, setOpenSalon] = useState(false);

  // Selección específica de internos (por cargo)
  const [listaCoordinadores, setListaCoordinadores] = useState<{ id: string; nombre: string }[]>([]);
  const [listaAdministrativos, setListaAdministrativos] = useState<{ id: string; nombre: string }[]>([]);
  const [listaSecretarias, setListaSecretarias] = useState<{ id: string; nombre: string }[]>([]);
  const [listaOrientadores, setListaOrientadores] = useState<{ id: string; nombre: string }[]>([]);
  const [coordinadoresSeleccionados, setCoordinadoresSeleccionados] = useState<string[]>([]);
  const [administrativosSeleccionados, setAdministrativosSeleccionados] = useState<string[]>([]);
  const [secretariasSeleccionadas, setSecretariasSeleccionadas] = useState<string[]>([]);
  const [orientadoresSeleccionados, setOrientadoresSeleccionados] = useState<string[]>([]);
  const [loadingInternos, setLoadingInternos] = useState(false);

  // Estudiantes específicos (filtrados por grados/salones marcados)
  const [listaEstudiantesFiltrada, setListaEstudiantesFiltrada] = useState<{ id: string; nombre: string; grado: string; salon: string }[]>([]);
  const [estudiantesSeleccionados, setEstudiantesSeleccionados] = useState<string[]>([]);
  const [loadingListaEstudiantes, setLoadingListaEstudiantes] = useState(false);
  const [mostrarEstudiantes, setMostrarEstudiantes] = useState(false);
  const [filtroEstudiantes, setFiltroEstudiantes] = useState("");
  // Salones REALES de los grados seleccionados (derivados de Estudiantes del
  // colegio) — cada colegio tiene distinta cantidad de salones por grado.
  const [salonesDisponibles, setSalonesDisponibles] = useState<string[]>([]);

  // Profesores específicos (filtrados por grados/salones marcados)
  const [listaProfesoresFiltrada, setListaProfesoresFiltrada] = useState<{ id: string; nombre: string; grados: string[]; salones: string[] }[]>([]);
  const [profesoresSeleccionados, setProfesoresSeleccionados] = useState<string[]>([]);
  const [loadingListaProfesores, setLoadingListaProfesores] = useState(false);
  const [mostrarProfesores, setMostrarProfesores] = useState(false);

  // Mensaje y archivos
  const [mensaje, setMensaje] = useState("");
  const mensajeRef = useRef<EditorComunicadoHandle>(null);
  const [archivosSeleccionados, setArchivosSeleccionados] = useState<File[]>([]);
  // Dialog para archivos que exceden el límite. Si está activo, contiene la
  // lista de archivos rechazados con su tamaño en MB.
  const [archivosRechazados, setArchivosRechazados] = useState<Array<{ nombre: string; mb: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Masivo personalizado
  const [datosMasivos, setDatosMasivos] = useState("");
  const [plantillaMasivo, setPlantillaMasivo] = useState("");
  const [filasParsed, setFilasParsed] = useState<Record<string, string>[]>([]);
  const [headersMasivo, setHeadersMasivo] = useState<string[]>([]);
  const [enviandoMasivo, setEnviandoMasivo] = useState(false);
  const [showConfirmMasivo, setShowConfirmMasivo] = useState(false);

  // Historial
  const [historial, setHistorial] = useState<ComunicadoEnviado[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [selectedHistorial, setSelectedHistorial] = useState<ComunicadoEnviado | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id) {
      navigate("/");
      return;
    }
    setRemitente(`${session.cargo} ${session.nombres} ${session.apellidos}`);
    setIdRemitente(session.id!);
    setCargo(session.cargo || "");
  }, [navigate]);

  // Resetea TODO el formulario de envío individual (destinatarios + mensaje + archivos).
  // No toca remitente/cargo (vienen de la sesión) ni el tab masivo/historial.
  const limpiarFormulario = () => {
    setPerfilesMarcados({
      Estudiantes: false, Padres: false, Profesores: false,
      Coordinadores: false, Rector: false, Administrativos: false, Secretaria: false, Orientador: false, Portero: false,
    });
    setNivelesMarcados({});
    setGradosMarcados({});
    setSalonesMarcados({});
    setCoordinadoresSeleccionados([]);
    setAdministrativosSeleccionados([]);
    setSecretariasSeleccionadas([]);
    setOrientadoresSeleccionados([]);
    setEstudiantesSeleccionados([]);
    setProfesoresSeleccionados([]);
    setMostrarEstudiantes(false);
    setMostrarProfesores(false);
    setMensaje("");
    setArchivosSeleccionados([]);
    setOpenPerfiles(false);
    setOpenNivel(false);
    setOpenGrado(false);
    setOpenSalon(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Cargar estudiantes según grados/salones marcados (solo si Est o Padres está marcado)
  useEffect(() => {
    const gradosSel = Object.keys(gradosMarcados).filter(g => gradosMarcados[g]);
    const salonesSel = Object.keys(salonesMarcados).filter(s => salonesMarcados[s]);
    const necesita = (perfilesMarcados.Estudiantes || perfilesMarcados.Padres) && gradosSel.length > 0;

    if (!necesita) {
      setListaEstudiantesFiltrada([]);
      setEstudiantesSeleccionados([]);
      setMostrarEstudiantes(false);
      return;
    }

    const fetchLista = async () => {
      setLoadingListaEstudiantes(true);
      // Fase 10.E.19: nombres/apellidos viven en Usuarios.
      let q = supabase
        .from("Estudiantes")
        .select("id, grado, salon")
        .in("grado", gradosSel);
      if (salonesSel.length > 0) q = q.in("salon", salonesSel);
      const { data: rawData } = await q
        .order("grado", { ascending: true })
        .order("salon", { ascending: true });
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const data = sortByApellidosNombres(await enrichWithNombres((rawData || []) as any));
      setListaEstudiantesFiltrada(
        data.map((e: any) => ({
          id: String(e.id),
          nombre: `${e.apellidos} ${e.nombres}`,
          grado: e.grado || "",
          salon: e.salon || "",
        }))
      );
      setEstudiantesSeleccionados(prev => prev.filter(id => data.some((e: any) => String(e.id) === id)));
      setLoadingListaEstudiantes(false);
    };
    fetchLista();
  }, [gradosMarcados, salonesMarcados, perfilesMarcados.Estudiantes, perfilesMarcados.Padres]);

  // Salones disponibles = los que de verdad existen en los grados marcados.
  useEffect(() => {
    const gradosSel = Object.keys(gradosMarcados).filter(g => gradosMarcados[g]);
    if (gradosSel.length === 0) { setSalonesDisponibles([]); return; }
    (async () => {
      const { data } = await supabase.from("Estudiantes").select("salon").in("grado", gradosSel as any);
      const set = new Set<string>();
      for (const r of (data || []) as { salon: string | null }[]) if (r.salon) set.add(String(r.salon));
      const lista = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      setSalonesDisponibles(lista);
      // Desmarcar salones que ya no existen para los grados elegidos.
      setSalonesMarcados(prev => {
        const next: Record<string, boolean> = {};
        for (const s of Object.keys(prev)) if (prev[s] && lista.includes(s)) next[s] = true;
        return next;
      });
    })();
  }, [gradosMarcados]);

  // Cargar profesores según grados/salones marcados (solo si Profesores está marcado)
  useEffect(() => {
    if (!perfilesMarcados.Profesores) {
      setListaProfesoresFiltrada([]);
      setProfesoresSeleccionados([]);
      setMostrarProfesores(false);
      return;
    }

    const gradosSel = Object.keys(gradosMarcados).filter(g => gradosMarcados[g]);
    const salonesSel = Object.keys(salonesMarcados).filter(s => salonesMarcados[s]);
    // Sin grados marcados pero con NIVELES: la lista debe respetar los niveles
    // (antes los ignoraba y mostraba TODOS los profesores del colegio, aunque
    // el envío sí filtraba por nivel — confundía y permitía marcar un profesor
    // por fuera de los niveles elegidos).
    const nivelesSel = Object.keys(nivelesMarcados).filter(n => nivelesMarcados[n]);
    const gradosFiltro = gradosSel.length > 0
      ? gradosSel
      : nivelesSel.flatMap(n => nivelesGrados[n] || []);

    const fetchProfes = async () => {
      setLoadingListaProfesores(true);
      // PostgREST malinterpreta "Grado(s)" (con paréntesis) en .overlaps, filtramos en JS
      // Fase 10.E.19: nombres/apellidos viven en Usuarios.
      const { data: rawData } = await supabase
        .from("Asignación Profesores")
        .select("id, \"Grado(s)\", \"Salon(es)\"");
      const { enrichWithNombres } = await import("@/lib/nombresUsuarios");
      const data = await enrichWithNombres((rawData || []) as any);
      const filtered = (data || []).filter((r: any) => {
        const grados = (r["Grado(s)"] as string[]) || [];
        const salones = (r["Salon(es)"] as string[]) || [];
        if (gradosFiltro.length > 0 && !gradosFiltro.some(g => grados.includes(g))) return false;
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
  }, [gradosMarcados, salonesMarcados, nivelesMarcados, nivelesGrados, perfilesMarcados.Profesores]);

  // Cargar las 4 listas de internos (Coordinadores, Administrativos, Secretaria General, Orientador(a) Escolar)
  useEffect(() => {
    const necesitaLista =
      perfilesMarcados.Coordinadores || perfilesMarcados.Administrativos || perfilesMarcados.Secretaria || perfilesMarcados.Orientador;
    if (!necesitaLista) return;
    if (listaCoordinadores.length || listaAdministrativos.length || listaSecretarias.length || listaOrientadores.length) return;

    const fetchInternos = async () => {
      setLoadingInternos(true);
      // Fase 10.E.19: nombres/apellidos viven en Usuarios.
      const { data: rawInt } = await supabase
        .from("Internos")
        .select("id, cargo")
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

  const fetchHistorial = async () => {
    setLoadingHistorial(true);
    // Rector ve TODOS los comunicados (igual que admin); los demás roles solo los suyos.
    let query = supabase
      .from("Comunicados")
      .select("*")
      .order("fecha", { ascending: false });
    if (cargo !== "Rector") {
      query = query.eq("id_remitente", idRemitente);
    }
    const { data } = await query;
    setHistorial((data as ComunicadoEnviado[]) || []);
    setLoadingHistorial(false);
  };

  const handleEliminar = async () => {
    if (!deleteId) return;
    await supabase.from("Comunicados").delete().eq("id", deleteId);
    setHistorial((prev) => prev.filter((c) => c.id !== deleteId));
    setDeleteId(null);
  };

  // "Todos": marcado solo cuando TODOS los perfiles están marcados (derivado),
  // así que si desmarcas uno, "Todos" se desmarca solo. Al togglearlo marca o
  // desmarca todos a la vez.
  const todosPerfilesMarcados = PERFILES_UI.every((p) => perfilesMarcados[p.key]);
  const toggleTodosPerfiles = () => {
    const marcar = !todosPerfilesMarcados;
    setPerfilesMarcados(() => {
      const next = {} as Record<PerfilKey, boolean>;
      PERFILES_UI.forEach((p) => { next[p.key] = marcar; });
      return next;
    });
    if (!marcar) {
      // Al desmarcar Todos, limpiar selecciones asociadas (igual que togglePerfil).
      setCoordinadoresSeleccionados([]);
      setAdministrativosSeleccionados([]);
      setSecretariasSeleccionadas([]);
      setOrientadoresSeleccionados([]);
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
          setNivelesMarcados({});
          setGradosMarcados({});
          setSalonesMarcados({});
          setEstudiantesSeleccionados([]);
          setOpenNivel(false);
          setOpenGrado(false);
          setOpenSalon(false);
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

  const joinConY = (arr: string[]): string => {
    if (arr.length === 0) return "";
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(", ") + " y " + arr[arr.length - 1];
  };

  const getAulasTexto = (): string[] => {
    const nivelesSel = Object.keys(nivelesMarcados).filter(n => nivelesMarcados[n]);
    const gradosSel = Object.keys(gradosMarcados).filter(g => gradosMarcados[g]);
    const salonesSel = Object.keys(salonesMarcados).filter(s => salonesMarcados[s]);
    if (gradosSel.length === 0) return nivelesSel.length > 0 ? nivelesSel : [];
    if (salonesSel.length === 0) return gradosSel.slice();
    const res: string[] = [];
    for (const g of gradosSel) for (const s of salonesSel) res.push(`${g} ${s}`);
    return res;
  };

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
      if (salonesSel.length === 0) {
        return `${prefijo} de ${gradosSel.join(", ")}`;
      }
      if (gradosSel.length === 1 && salonesSel.length === 1) {
        return `${prefijo} de ${gradosSel[0]} ${salonesSel[0]}`;
      }
      if (gradosSel.length === 1 && salonesSel.length > 1) {
        return `${prefijo} de ${gradosSel[0]} salones ${salonesSel.join(", ")}`;
      }
      if (gradosSel.length > 1 && salonesSel.length === 1) {
        return `${prefijo} de ${gradosSel.map((g) => `${g} ${salonesSel[0]}`).join(", ")}`;
      }
      return `${prefijo} de los grados ${gradosSel.join(", ")} salones ${salonesSel.join(", ")}`;
    };

    if ((sel.Estudiantes || sel.Padres) && estudiantesSeleccionados.length > 0) {
      const ids = estudiantesSeleccionados;
      const uno = ids.length === 1;
      if (sel.Estudiantes && sel.Padres) {
        partes.push(uno
          ? `Estudiante y acudientes del estudiante con id ${ids[0]}`
          : `Estudiantes y acudientes de los estudiantes con id: ${ids.join(", ")}`);
      } else if (sel.Estudiantes) {
        partes.push(uno ? `Estudiante con id ${ids[0]}` : `Estudiantes con id: ${ids.join(", ")}`);
      } else {
        partes.push(uno ? `Acudientes del estudiante con id ${ids[0]}` : `Acudientes de los estudiantes con id: ${ids.join(", ")}`);
      }
    } else {
      if (sel.Estudiantes) {
        const frase = aulaFrase("Estudiantes");
        partes.push(frase || "Estudiantes");
      }
      if (sel.Padres) {
        const frase = aulaFrase("Acudientes");
        partes.push(frase || "Acudientes");
      }
    }

    if (sel.Profesores) {
      if (profesoresSeleccionados.length > 0) {
        const nombres = listaANombres(profesoresSeleccionados, listaProfesoresFiltrada);
        partes.push(nombres.length === 1 ? `Profesor(a) ${nombres[0]}` : `Profesores ${nombres.join(", ")}`);
      } else {
        const frase = aulaFrase("Profesores");
        partes.push(frase || "Profesores");
      }
    }

    if (sel.Coordinadores) {
      if (coordinadoresSeleccionados.length === 0) partes.push("Coordinadores");
      else {
        const nombres = listaANombres(coordinadoresSeleccionados, listaCoordinadores);
        partes.push(nombres.length === 1 ? `Coordinador(a) ${nombres[0]}` : `Coordinadores ${nombres.join(", ")}`);
      }
    }
    if (sel.Rector) partes.push("Rector");
    if (sel.Portero) partes.push("Porteros");
    if (sel.Administrativos) {
      if (administrativosSeleccionados.length === 0) partes.push("Administrativos");
      else {
        const nombres = listaANombres(administrativosSeleccionados, listaAdministrativos);
        partes.push(nombres.length === 1 ? `Administrativo(a) ${nombres[0]}` : `Administrativos ${nombres.join(", ")}`);
      }
    }
    if (sel.Secretaria) {
      if (secretariasSeleccionadas.length === 0) partes.push("Secretaria General");
      else {
        const nombres = listaANombres(secretariasSeleccionadas, listaSecretarias);
        partes.push(nombres.length === 1 ? `Secretaria ${nombres[0]}` : `Secretarias ${nombres.join(", ")}`);
      }
    }
    if (sel.Orientador) {
      if (orientadoresSeleccionados.length === 0) partes.push("Orientador(a) Escolar");
      else {
        const nombres = listaANombres(orientadoresSeleccionados, listaOrientadores);
        partes.push(nombres.length === 1 ? `Orientador(a) ${nombres[0]}` : `Orientadores ${nombres.join(", ")}`);
      }
    }

    return partes.length === 0 ? "" : partes.join(". ") + ".";
  };

  const destinatariosTexto = buildDestinatarios();
  const algunPerfilMarcado = Object.values(perfilesMarcados).some(Boolean);

  const templateBodyLength = buildTemplateBodyPreview({
    remitente,
    destinatarios: destinatariosTexto,
    mensaje,
    archivos: archivosSeleccionados,
  }).length + WA_TEMPLATE_OVERHEAD;
  const bodyOverLimit = templateBodyLength > MAX_WA_TEMPLATE_BODY;

  // El "baseline" es lo que ya ocupa la plantilla + encabezados + remitente
  // antes de que el usuario marque destinatarios, escriba mensaje o adjunte archivos.
  // Es estático para una misma persona, pero varía entre personas (largo del nombre).
  const baselineLength = buildTemplateBodyPreview({
    remitente,
    destinatarios: "",
    mensaje: "",
    archivos: [],
  }).length + WA_TEMPLATE_OVERHEAD;
  const personalMax = MAX_WA_TEMPLATE_BODY - baselineLength;
  const usedChars = Math.max(0, templateBodyLength - baselineLength);

  const canSend = algunPerfilMarcado && (mensaje.trim() || archivosSeleccionados.length > 0);

  const handleEnviar = async () => {
    setShowConfirm(false);
    setEnviando(true);

    try {
      // Upload files if any
      let archivoUrl: string | null = null;
      if (archivosSeleccionados.length > 0) {
        const urls: string[] = [];
        for (const archivo of archivosSeleccionados) {
          const timestamp = Date.now();
          const nombreLimpio = archivo.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]/g, "_");
          const fileName = `${timestamp}_${nombreLimpio}`;

          const { error: uploadError } = await supabase.storage
            .from("normi-archivos")
            .upload(fileName, archivo);

          if (uploadError) {
            throw new Error(`Error subiendo archivo: ${uploadError.message}`);
          }

          const { data: urlData } = supabase.storage
            .from("normi-archivos")
            .getPublicUrl(fileName);

          urls.push(urlData.publicUrl);
        }
        archivoUrl = urls.join("\n");
      }

      // Construir UN segmento POR cada perfil marcado, con sus criterios
      // específicos (grado/salón/nivel/ids). NO mezclar ids ni criterios entre
      // perfiles distintos — eso causaba envíos incorrectos (un coordinador
      // específico hacía que "todos los profesores" no recibiera nada porque
      // el id del coordinador no era de profesor).
      const gradosSel = Object.keys(gradosMarcados).filter(g => gradosMarcados[g]);
      const salonesSel = Object.keys(salonesMarcados).filter(s => salonesMarcados[s]);
      const nivelesSel = Object.keys(nivelesMarcados).filter(n => nivelesMarcados[n]);
      // Pasamos nivel/grados/salones tal cual los marcó el usuario. NO
      // expandimos niveles a grados — si dice "Primaria", el segmento debe
      // tener nivel="Primaria" y grados=null (queda más prolijo en la tabla
      // Comunicados y el resolver del server sabe filtrar por nivel).
      const nivelUnico = nivelesSel.length === 1 ? nivelesSel[0] : null;
      // Si el usuario marcó varios niveles, los pasamos como array (vía
      // múltiples segmentos abajo). Pero hoy lo simplificamos a UN nivel
      // por segmento — si hay varios, expandimos a grados.
      let gradosFinal: string[] | null = gradosSel.length > 0 ? gradosSel : null;
      if (nivelesSel.length > 1) {
        const gradosDeNiveles: string[] = [];
        for (const niv of nivelesSel) {
          for (const g of (nivelesGrados[niv] || [])) {
            if (!gradosDeNiveles.includes(g)) gradosDeNiveles.push(g);
          }
        }
        if (gradosFinal) {
          for (const g of gradosDeNiveles) if (!gradosFinal.includes(g)) gradosFinal.push(g);
        } else {
          gradosFinal = gradosDeNiveles;
        }
      }
      const salonesFinal = salonesSel.length > 0 ? salonesSel : null;

      // Estrategia: agrupar perfiles que comparten filtros en UN solo segmento.
      // Solo separar en segmentos distintos cuando un perfil tiene ids
      // específicos seleccionados o requiere filtros diferentes.
      //
      // Casos típicos:
      //  - "Estudiantes y padres de Séptimo 3" → 1 fila con
      //    perfil=["Estudiantes","Acudientes"], grado="Séptimo", salon="3"
      //  - "Acudientes de Primaria" → 1 fila con perfil=["Acudientes"],
      //    nivel="Primaria"
      //  - "Todos los profesores + un coordinador" → 2 filas: una para
      //    profesores (sin ids) y otra para el coordinador con su id.
      const segmentos: Array<{
        perfil: string[];
        nivel?: string | null;
        grados?: string[] | null;
        salones?: string[] | null;
        id_destinatarios?: string[] | null;
      }> = [];

      // === Estudiantes y Padres (comparten filtros de aula) ===
      const perfilesEstPadres: string[] = [];
      if (perfilesMarcados.Estudiantes) perfilesEstPadres.push("Estudiantes");
      if (perfilesMarcados.Padres) perfilesEstPadres.push("Acudientes");
      if (perfilesEstPadres.length > 0) {
        if (estudiantesSeleccionados.length > 0) {
          // Ids específicos: un solo segmento con esos ids para ambos perfiles.
          segmentos.push({ perfil: perfilesEstPadres, id_destinatarios: estudiantesSeleccionados });
        } else {
          segmentos.push({ perfil: perfilesEstPadres, nivel: nivelUnico, grados: gradosFinal, salones: salonesFinal });
        }
      }

      // === Internos: agrupar al máximo para minimizar filas en Comunicados ===
      //
      // Profesores tiene un caso especial: si NO hay ids específicos y SÍ
      // hay filtros de aula (grado/salón/nivel), va en su propio segmento
      // porque esos filtros no aplican a los otros perfiles internos.
      // Si Profesores NO tiene filtros de aula propios, se trata como los demás.
      const profesoresConFiltroAula =
        perfilesMarcados.Profesores &&
        profesoresSeleccionados.length === 0 &&
        (nivelUnico || gradosFinal || salonesFinal);

      if (profesoresConFiltroAula) {
        segmentos.push({ perfil: ["Profesores"], nivel: nivelUnico, grados: gradosFinal, salones: salonesFinal });
      }

      // Combinar TODOS los internos con ids específicos en UN solo segmento.
      // El server filtra por (cargo, id) para cada perfil, así que los ids
      // "sobrantes" (que no pertenecen a ese cargo) se descartan solos.
      const internosConIds: { perfiles: string[]; ids: string[] } = { perfiles: [], ids: [] };
      const internosTodos: string[] = [];
      const addInterno = (perfilName: string, marcado: boolean, idsSeleccionados: string[]) => {
        if (!marcado) return;
        if (idsSeleccionados.length > 0) {
          if (!internosConIds.perfiles.includes(perfilName)) internosConIds.perfiles.push(perfilName);
          for (const id of idsSeleccionados) if (!internosConIds.ids.includes(id)) internosConIds.ids.push(id);
        } else {
          internosTodos.push(perfilName);
        }
      };

      if (!profesoresConFiltroAula) {
        addInterno("Profesores", perfilesMarcados.Profesores, profesoresSeleccionados);
      }
      addInterno("Coordinadores", perfilesMarcados.Coordinadores, coordinadoresSeleccionados);
      addInterno("Administrativos", perfilesMarcados.Administrativos, administrativosSeleccionados);
      addInterno("Secretaria General", perfilesMarcados.Secretaria, secretariasSeleccionadas);
      addInterno("Orientadores", perfilesMarcados.Orientador, orientadoresSeleccionados);
      if (perfilesMarcados.Rector) internosTodos.push("Rector");
      if (perfilesMarcados.Portero) internosTodos.push("Porteros");

      if (internosConIds.perfiles.length > 0) {
        segmentos.push({ perfil: internosConIds.perfiles, id_destinatarios: internosConIds.ids });
      }
      if (internosTodos.length > 0) {
        segmentos.push({ perfil: internosTodos });
      }

      // Llamada al endpoint server (multi-tenant via JWT) — reemplaza los 2
      // webhooks n8n (WEBHOOK_URL y WEBHOOK_RECTOR_URL).
      const response = await apiRequest<{ ok: true; enviados: number; fallos: number; total: number }>(
        '/api/comunicados/enviar',
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
      // El mensaje y los archivos se limpian SOLO cuando el envío se completa
      // (ver onCompleted del diálogo). Si se cancela, se conservan para corregir.
    } catch (error) {
      console.error("Error enviando comunicado:", error);
      const errorMsg = error instanceof Error ? error.message : "No se pudo enviar el comunicado. Intenta de nuevo.";
      const body = (error as { body?: { error?: string; detail?: string } })?.body;
      const bodyStr = body ? `${body.error || ""} ${body.detail || ""}` : "";
      const sinDestinatarios = /no[_ ]destinatarios|no se encontraron destinatarios/i.test(`${errorMsg} ${bodyStr}`);
      const sinTelefonos = body?.error === "sin_telefonos";
      // SIEMPRE variant destructive: el Toaster silencia los toasts de info y
      // solo muestra pop-up los destructivos. Con detail específico sale el
      // pop-up de validación (no el genérico "Error en el sistema").
      toast({
        title: sinTelefonos ? "Sin teléfonos registrados" : sinDestinatarios ? "Sin destinatarios" : "Error",
        description: sinTelefonos
          ? (body?.detail || "Ninguna de las personas destinatarias tiene número de teléfono registrado.")
          : sinDestinatarios
          ? "Ningún usuario coincide con los filtros seleccionados. Revisa los destinatarios."
          : (body?.detail || errorMsg),
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  // Parsear datos pegados del Excel (tab-separated)
  const parsearDatos = (texto: string) => {
    setDatosMasivos(texto);
    const lineas = texto.split("\n").filter((l) => l.trim());
    if (lineas.length < 2) {
      setHeadersMasivo([]);
      setFilasParsed([]);
      return;
    }
    const headers = lineas[0].split("\t").map((h) => h.trim());
    setHeadersMasivo(headers);
    const filas = lineas.slice(1).map((linea) => {
      const valores = linea.split("\t").map((v) => v.trim());
      const fila: Record<string, string> = {};
      headers.forEach((h, i) => {
        fila[h] = valores[i] || "";
      });
      return fila;
    });
    setFilasParsed(filas);
  };

  // Resolver plantilla para una fila
  const resolverPlantilla = (plantilla: string, fila: Record<string, string>) => {
    return plantilla.replace(/\{([^}]+)\}/g, (match, key) => fila[key.trim()] ?? match);
  };

  const handleEnviarMasivo = async () => {
    setShowConfirmMasivo(false);
    setEnviandoMasivo(true);

    try {
      if (!headersMasivo.length || !filasParsed.length) {
        throw new Error("No hay datos para enviar");
      }
      if (!plantillaMasivo.trim()) {
        throw new Error("Escribe una plantilla de mensaje");
      }

      // Primera columna = id del estudiante (cédula)
      const colId = headersMasivo[0];
      const destinatarios_personalizados = filasParsed.map((fila) => ({
        estudiante_id: fila[colId],
        mensaje: resolverPlantilla(plantillaMasivo, fila),
      }));

      // POST /api/comunicados/enviar-masivo (server, JWT). El server:
      //  - cruza Estudiantes ↔ Usuarios para obtener teléfonos
      //  - envía WhatsApp uno por uno con su mensaje personalizado
      //  - guarda UNA fila resumen en Comunicados con la plantilla original
      //  - registra cada mensaje en n8n_chat_histories (contexto del agente)
      const resp = await apiRequest<{
        enviados: number;
        fallos: number;
        total: number;
        no_encontrados: string[];
      }>("/api/comunicados/enviar-masivo", {
        method: "POST",
        body: JSON.stringify({
          plantilla_resumen: plantillaMasivo.trim(),
          destinatarios_personalizados,
        }),
      });

      const noEncontrados = resp.no_encontrados?.length ?? 0;
      toast({
        title: "Envío masivo completado",
        description: noEncontrados > 0
          ? `${resp.enviados} enviados, ${resp.fallos} fallos. ${noEncontrados} estudiante(s) sin teléfono.`
          : `${resp.enviados} mensajes enviados por WhatsApp.`,
      });

      setDatosMasivos("");
      setPlantillaMasivo("");
      setFilasParsed([]);
      setHeadersMasivo([]);
    } catch (error) {
      console.error("Error enviando masivo:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo enviar. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setEnviandoMasivo(false);
    }
  };

  const formatFecha = (fecha: string) => {
    const d = new Date(fecha);
    return d.toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const backLink = isAdmin() ? "/dashboard" : puedeAccederDashboard() ? "/dashboard" : "/dashboard";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6 max-w-2xl mx-auto">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Enviar Comunicado</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto mb-6 text-center">Envía un mensaje o documento a cualquier grupo o individuo dentro de la institución.</p>

        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-2xl mx-auto">
          <Tabs defaultValue="enviar" onValueChange={(v) => { if (v === "historial") fetchHistorial(); }}>
            <TabsList className="flex w-full">
              <TabsTrigger value="enviar" className="flex-1 text-xs md:text-sm px-2 md:px-3">Enviar</TabsTrigger>
              <TabsTrigger value="masivo" className="flex-1 text-xs md:text-sm px-2 md:px-3">Masivo</TabsTrigger>
              <TabsTrigger value="historial" className="flex-1 text-xs md:text-sm px-2 md:px-3">Historial</TabsTrigger>
            </TabsList>

            <TabsContent value="enviar">
              <div className="relative mt-4 mb-6">
                <h2 className="text-2xl font-bold text-foreground text-center">
                  Enviar Comunicado
                </h2>
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
                            <input
                              type="checkbox"
                              checked={todosPerfilesMarcados}
                              onChange={toggleTodosPerfiles}
                              className="w-4 h-4 accent-primary cursor-pointer"
                            />
                            <span>Todos</span>
                          </label>
                          {PERFILES_UI.map((p) => (
                            <label key={p.key} className="flex items-center gap-2 cursor-pointer select-none text-sm">
                              <input
                                type="checkbox"
                                checked={perfilesMarcados[p.key]}
                                onChange={() => togglePerfil(p.key)}
                                className="w-4 h-4 accent-primary cursor-pointer"
                              />
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
                                      <input
                                        type="checkbox"
                                        checked={!!gradosMarcados[g]}
                                        onChange={() => toggleEnRecord(gradosMarcados, g, setGradosMarcados)}
                                        className="w-4 h-4 accent-primary cursor-pointer"
                                      />
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
                                <input
                                  type="checkbox"
                                  checked={!!salonesMarcados[s]}
                                  onChange={() => toggleEnRecord(salonesMarcados, s, setSalonesMarcados)}
                                  className="w-4 h-4 accent-primary cursor-pointer"
                                />
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

                {(perfilesMarcados.Estudiantes || perfilesMarcados.Padres) &&
                  Object.values(gradosMarcados).some(Boolean) && (
                  <div className="border-l-2 border-primary/30 pl-4 space-y-1">
                    <Label className="text-xs">Estudiantes específicos</Label>
                    <button
                      type="button"
                      onClick={() => setMostrarEstudiantes(v => !v)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded cursor-pointer hover:bg-muted/40 bg-background"
                    >
                      <span>
                        Estudiantes {estudiantesSeleccionados.length > 0
                          ? `(${estudiantesSeleccionados.length} seleccionado${estudiantesSeleccionados.length !== 1 ? "s" : ""})`
                          : "(Todos)"}
                      </span>
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
                              if (filtrados.length === 0) {
                                return <span className="text-xs text-muted-foreground">Ningún estudiante coincide con "{filtroEstudiantes}"</span>;
                              }
                              return filtrados.map((e) => (
                                <label key={e.id} className="flex items-center gap-2 cursor-pointer text-sm">
                                  <input
                                    type="checkbox"
                                    checked={estudiantesSeleccionados.includes(e.id)}
                                    onChange={() => toggleInterno(estudiantesSeleccionados, e.id, setEstudiantesSeleccionados)}
                                    className="w-4 h-4 accent-primary cursor-pointer shrink-0"
                                  />
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

                {/* Profesores específicos (desplegable) */}
                {perfilesMarcados.Profesores && (
                  <div className="border-l-2 border-primary/30 pl-4 space-y-1">
                    <Label className="text-xs">Profesores específicos (vacío = todos los que coinciden con los filtros)</Label>
                    <button
                      type="button"
                      onClick={() => setMostrarProfesores(v => !v)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded cursor-pointer hover:bg-muted/40 bg-background"
                    >
                      <span>
                        Profesores {profesoresSeleccionados.length > 0
                          ? `(${profesoresSeleccionados.length} seleccionado${profesoresSeleccionados.length !== 1 ? "s" : ""})`
                          : "(Todos)"}
                      </span>
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
                              <input
                                type="checkbox"
                                checked={profesoresSeleccionados.includes(p.id)}
                                onChange={() => toggleInterno(profesoresSeleccionados, p.id, setProfesoresSeleccionados)}
                                className="w-4 h-4 accent-primary cursor-pointer shrink-0"
                              />
                              <span>
                                {p.nombre}
                                {(p.grados.length > 0 || p.salones.length > 0) && (
                                  <span className="text-xs text-muted-foreground">
                                    {" "}({[p.grados.join(", "), p.salones.length > 0 ? `Salón ${p.salones.join(", ")}` : ""].filter(Boolean).join(" — ")})
                                  </span>
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
                    <p className="text-xs text-muted-foreground">
                      {grupo.label} específicos (vacío = todos)
                    </p>
                    {loadingInternos && grupo.lista.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Cargando...</p>
                    ) : grupo.lista.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No hay personas con este cargo</p>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {grupo.lista.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={grupo.sel.includes(p.id)}
                              onChange={() => toggleInterno(grupo.sel, p.id, grupo.setter)}
                              className="w-4 h-4 accent-primary cursor-pointer"
                            />
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
                    <span className="font-medium text-foreground">
                      {destinatariosTexto}
                    </span>
                  </p>
                )}
              </div>

              {/* Mensaje */}
              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground">Mensaje</h3>
                  <div className="flex items-center gap-3">
                    <DictadoMic valor={mensaje} setValor={setMensaje} />
                    <FormatoWhatsAppToolbar editorRef={mensajeRef} />
                    <CharCircle value={usedChars} max={personalMax} />
                  </div>
                </div>
                <EditorComunicado
                  ref={mensajeRef}
                  valor={mensaje}
                  setValor={setMensaje}
                  placeholder="Escribe el comunicado..."
                />
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
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => setArchivosSeleccionados(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:text-destructive shrink-0 ml-auto"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                      fileInputRef.current.click();
                    }
                  }}
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
                    // Límite 20 MB por archivo. El server tiene 25 MB de
                    // bodyLimit en Fastify; bajamos a 20 para dejar margen
                    // para el overhead base64 (~33%) que se aplica al subir.
                    const MAX_BYTES = 20 * 1024 * 1024;
                    const aceptados: File[] = [];
                    const rechazados: Array<{ nombre: string; mb: string }> = [];
                    for (const f of Array.from(files)) {
                      if (f.size > MAX_BYTES) {
                        rechazados.push({ nombre: f.name, mb: (f.size / 1024 / 1024).toFixed(1) });
                      } else {
                        aceptados.push(f);
                      }
                    }
                    if (aceptados.length > 0) {
                      setArchivosSeleccionados(prev => [...prev, ...aceptados]);
                    }
                    if (rechazados.length > 0) {
                      setArchivosRechazados(rechazados);
                    }
                    // Reset input para permitir re-seleccionar el mismo archivo si quiere.
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
                {enviando ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Enviar comunicado
                  </>
                )}
              </button>
            </TabsContent>

            <TabsContent value="masivo">
              <h2 className="text-2xl font-bold text-foreground mb-6 text-center mt-4">
                Envío Masivo Personalizado
              </h2>

              {/* Paso 1: Pegar datos */}
              <div className="space-y-2 mb-6">
                <Label className="text-base font-semibold">1. Pegar datos de Excel</Label>
                <p className="text-xs text-muted-foreground">
                  Copia las columnas de Excel y pégalas aquí. La primera fila debe ser los encabezados y la primera columna debe ser el id del estudiante.
                </p>
                <Textarea
                  value={datosMasivos}
                  onChange={(e) => parsearDatos(e.target.value)}
                  placeholder={"codigo\tusuario\tcontraseña\n12345\test12345\tPass123!\n12346\test12346\tPass456!"}
                  rows={5}
                  className="font-mono text-xs"
                />
              </div>

              {/* Tabla de vista previa */}
              {filasParsed.length > 0 && (
                <div className="mb-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{filasParsed.length} filas detectadas</span>
                  </div>
                  <div className="border rounded-md overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          {headersMasivo.map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filasParsed.map((fila, i) => (
                          <tr key={i} className="border-t">
                            {headersMasivo.map((h) => (
                              <td key={h} className="px-3 py-1.5 whitespace-nowrap">{fila[h]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Paso 2: Plantilla */}
              <div className="space-y-2 mb-6">
                <Label className="text-base font-semibold">2. Plantilla del mensaje</Label>
                <p className="text-xs text-muted-foreground">
                  Usa los nombres de las columnas entre llaves como placeholders. Ej: {"{usuario}"}, {"{contraseña}"}
                </p>
                {headersMasivo.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {headersMasivo.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setPlantillaMasivo((prev) => prev + `{${h}}`)}
                        className="px-2 py-0.5 text-xs bg-muted rounded-md hover:bg-muted/80 font-mono"
                      >
                        {`{${h}}`}
                      </button>
                    ))}
                  </div>
                )}
                <Textarea
                  value={plantillaMasivo}
                  onChange={(e) => setPlantillaMasivo(e.target.value)}
                  placeholder="Hola, tu usuario es {usuario} y tu contraseña es {contraseña}. No la compartas con nadie."
                  rows={4}
                />
              </div>

              {/* Vista previa del primer mensaje */}
              {plantillaMasivo && filasParsed.length > 0 && (
                <div className="mb-6 space-y-2">
                  <Label className="text-base font-semibold">Vista previa (primer estudiante)</Label>
                  <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                    {resolverPlantilla(plantillaMasivo, filasParsed[0])}
                  </div>
                </div>
              )}

              {/* Botón enviar */}
              <button
                disabled={!filasParsed.length || !plantillaMasivo.trim() || enviandoMasivo}
                onClick={() => setShowConfirmMasivo(true)}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-lg bg-gradient-to-r from-green-500 to-green-600 text-white font-bold text-lg transition-all duration-200 hover:shadow-md hover:scale-[1.01] hover:from-green-600 hover:to-green-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {enviandoMasivo ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Users className="w-5 h-5" />
                    Enviar {filasParsed.length} mensajes personalizados
                  </>
                )}
              </button>
            </TabsContent>

            <TabsContent value="historial">
              <h2 className="text-2xl font-bold text-foreground mb-6 text-center mt-4">
                Comunicados Enviados
              </h2>

              {loadingHistorial ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cargando...
                </div>
              ) : historial.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No has enviado comunicados aún.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar por destinatario o mensaje..."
                      className="pl-9"
                    />
                  </div>
                  {(() => {
                    const totalHist = historial.length;
                    const numeroByIdHist = new Map<number, number>();
                    historial.forEach((c, i) => numeroByIdHist.set(c.id, totalHist - i));
                    return historial.filter((c) => {
                      if (!busqueda.trim()) return true;
                      const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                      const term = normalize(busqueda);
                      return normalize(c.destinatarios).includes(term) || normalize(c.mensaje).includes(term);
                    }).map((c) => (
                    <div key={c.id} className="bg-primary/10 border-2 border-primary/40 rounded-lg p-4 space-y-2 cursor-pointer hover:bg-primary/15 hover:border-primary/60 transition-colors" onClick={() => setSelectedHistorial(c)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatFecha(c.fecha)}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-primary">#{numeroByIdHist.get(c.id)}</span>
                          {String(c.id_remitente ?? "") === String(idRemitente) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {c.remitente && (
                        <p className="text-sm break-words">
                          <span className="font-medium text-foreground">De:</span>{" "}
                          {c.remitente}
                        </p>
                      )}
                      <p className="text-sm break-words">
                        <span className="font-medium text-foreground">Para:</span>{" "}
                        {c.destinatarios}
                      </p>
                      {c.mensaje && (
                        <p className="text-sm whitespace-pre-wrap break-words bg-stone-50 border border-stone-200 p-3 rounded-md leading-relaxed">
                          {c.mensaje}
                        </p>
                      )}
                      {c.archivo_url && c.archivo_url.split("\n").filter(u => u.trim()).map((url, i) => (
                        <div key={i} className="mt-2 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm text-foreground truncate">{getCleanFilename(url)}</span>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={(e) => handleVerArchivoHist(url, e)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5">
                              <Eye className="h-4 w-4" /> Ver
                            </button>
                            <button onClick={(e) => handleDescargarArchivoHist(url, e)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1.5">
                              <Download className="h-4 w-4" /> Descargar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ));
                  })()}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Diálogo de confirmación */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar envío</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Remitente:</span>{" "}
                  {remitente}
                </p>
                <p>
                  <span className="font-medium text-foreground">
                    Destinatarios:
                  </span>{" "}
                  {destinatariosTexto}
                </p>
                <p>
                  <span className="font-medium text-foreground">Mensaje:</span>
                </p>
                <p className="whitespace-pre-wrap bg-stone-50 border border-stone-200 p-3 rounded-md leading-relaxed">
                  {mensaje}
                </p>
                {archivosSeleccionados.length > 0 && (
                  <p>
                    <span className="font-medium text-foreground">Archivos adjuntos:</span>{" "}
                    {archivosSeleccionados.length} archivo{archivosSeleccionados.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">
              Cancelar
            </button>
            <button onClick={handleEnviar} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
              Enviar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación masivo */}
      <Dialog open={showConfirmMasivo} onOpenChange={setShowConfirmMasivo}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar envío masivo</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Se enviarán <span className="font-bold text-foreground">{filasParsed.length} mensajes personalizados</span> por WhatsApp.
                </p>
                <p>
                  <span className="font-medium text-foreground">Ejemplo (primer estudiante):</span>
                </p>
                {filasParsed.length > 0 && plantillaMasivo && (
                  <p className="whitespace-pre-wrap bg-stone-50 border border-stone-200 p-3 rounded-md leading-relaxed">
                    {resolverPlantilla(plantillaMasivo, filasParsed[0])}
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setShowConfirmMasivo(false)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">
              Cancelar
            </button>
            <button onClick={handleEnviarMasivo} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
              Enviar {filasParsed.length} mensajes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación de eliminación */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar comunicado</DialogTitle>
            <DialogDescription>
              Este comunicado se eliminará permanentemente y no se podrá recuperar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">
              Cancelar
            </button>
            <button onClick={handleEliminar} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90">
              Eliminar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para ver comunicado completo */}
      <Dialog open={!!selectedHistorial} onOpenChange={(open) => !open && setSelectedHistorial(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedHistorial && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base break-words">
                  Para: {selectedHistorial.destinatarios}
                </DialogTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatFecha(selectedHistorial.fecha)}
                </div>
              </DialogHeader>
              {selectedHistorial.mensaje && (
                <p className="text-sm whitespace-pre-wrap break-words bg-muted p-4 rounded-md">
                  {selectedHistorial.mensaje}
                </p>
              )}
              {selectedHistorial.archivo_url && selectedHistorial.archivo_url.split("\n").filter(u => u.trim()).map((url, i) => (
                <div key={i} className="mt-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground truncate">{getCleanFilename(url)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={(e) => handleVerArchivoHist(url, e)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5">
                      <Eye className="h-4 w-4" /> Ver
                    </button>
                    <button onClick={(e) => handleDescargarArchivoHist(url, e)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1.5">
                      <Download className="h-4 w-4" /> Descargar
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: archivo(s) demasiado grandes — reemplaza el toast rojo
          "Payload Too Large" que era críptico para el usuario final. */}
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
            <button
              type="button"
              onClick={() => setArchivosRechazados([])}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
            >
              Entendido
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ComunicadoEnviadoDialog
        open={showSentDialog}
        onOpenChange={setShowSentDialog}
        jobId={sentInfo.jobId}
        total={sentInfo.total}
        onCompleted={() => {
          setMensaje("");
          setArchivosSeleccionados([]);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
    </div>
  );
};

export default EnviarComunicado;
