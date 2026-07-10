import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, puedeAccederDashboard, isAdmin } from "@/hooks/useSession";
import PhoneInput from "@/components/PhoneInput";
import HeaderNormi from "@/components/HeaderNormi";
import { useGradosColegio } from "@/utils/grados";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { useAsignaturas } from "@/hooks/useAsignaturas";
import CatalogoAsignaturas from "@/components/CatalogoAsignaturas";
import { apiClient, apiRequest } from "@/lib/apiClient";

// ─── Enums ───────────────────────────────────────────────────────────────────

const SALONES = ["1", "2", "3", "4", "5", "6"];

const CARGOS = [
  "Profesor(a)", "Rector", "Coordinador(a)", "Administrativo(a)",
  "Secretaria General", "Orientador(a) Escolar", "Portero",
  "Servicios Generales", "Administrador",
];

// El catálogo de asignaturas vive en la tabla "Asignaturas" (por colegio).
// Se obtiene en runtime con useAsignaturas() — el rector puede crearlas y
// desactivarlas desde la pestaña "Asignaturas" de este mismo panel.

const NUM_ESTUDIANTES = ["1 (uno)", "2 (dos)", "3 (tres)", "4 (cuatro)"];

const NIVELES_GRADOS: Record<string, string[]> = {
  Preescolar: ["Párvulo", "Prejardín", "Jardín", "Transición"],
  Primaria: ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto"],
  Secundaria: ["Sexto", "Séptimo", "Octavo", "Noveno"],
  Media: ["Décimo", "Undécimo"],
};

function getNivelFromGrado(grado: string): string | null {
  for (const [nivel, grados] of Object.entries(NIVELES_GRADOS)) {
    if (grados.includes(grado)) return nivel;
  }
  return null;
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Estudiante {
  id: number;
  nombres: string;
  apellidos: string;
  nivel: string;
  grado: string;
  salon: string;
  avatar_url?: string | null;
}

interface Interno {
  id: number;
  nombres: string;
  apellidos: string;
  cargo: string;
  contrasena: string;
  /** Solo coordinadores: niveles que coordina. NULL/vacío = todos. */
  niveles_coordina?: string[] | null;
  // numero_de_telefono ahora vive en Usuarios (Fase 10.E.15)
  numero_de_telefono?: string | null;
}

interface Asignacion {
  row_id: string;
  nombres: string;
  apellidos: string;
  numero_de_telefono: string;
  id: number | null;
  "Asignatura(s)": string[];
  "Grado(s)": string[];
  "Salon(es)": string[];
}

interface Perfil {
  numero_de_telefono: string;
  perfil: string;
  estudiante_id: number | null;
  estudiante_nombre: string | null;
  estudiante_apellidos: string | null;
  estudiante_nivel: string | null;
  estudiante_grado: string | null;
  estudiante_salon: string | null;
  acudiente_nombre: string | null;
  /** Nombres y apellidos por separado para la tabla. */
  acudiente_nombres_only?: string;
  padre_apellidos_only?: string;
  padre_id: string | null;
  numero_de_acudidos: string | null;
  avatar_url?: string | null;
  acudido1_id: number | null;
  acudido1_nombre: string | null;
  acudido1_apellidos: string | null;
  acudido1_nivel: string | null;
  acudido1_grado: string | null;
  acudido1_salon: string | null;
  acudido2_id: number | null;
  acudido2_nombre: string | null;
  acudido2_apellidos: string | null;
  acudido2_nivel: string | null;
  acudido2_grado: string | null;
  acudido2_salon: string | null;
  acudido3_id: number | null;
  acudido3_nombre: string | null;
  acudido3_apellidos: string | null;
  acudido3_nivel: string | null;
  acudido3_grado: string | null;
  acudido3_salon: string | null;
  acudido4_id: number | null;
  acudido4_nombre: string | null;
  acudido4_apellidos: string | null;
  acudido4_nivel: string | null;
  acudido4_grado: string | null;
  acudido4_salon: string | null;
  contrasena: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Search helper: splits query into tokens; every token must appear somewhere in the haystack.
// Allows matching "jesus abad" against "Abad Arrieta Jesús Andrés".
function matchesSearch(haystack: string, search: string): boolean {
  const h = normalize(haystack);
  const searchNorm = normalize(search);
  // Si la búsqueda es puramente numérica (con/sin puntos/espacios), matchear
  // contra el haystack también sin puntos/espacios para que "1.103.114.625"
  // encuentre la cédula "1103114625".
  const searchNoPunct = searchNorm.replace(/[.\s]/g, "");
  if (searchNoPunct && /^\d+$/.test(searchNoPunct)) {
    return h.replace(/[.\s]/g, "").includes(searchNoPunct);
  }
  const tokens = searchNorm.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => h.includes(t));
}

function toggleItem(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

// Supabase limits to 1000 rows per request. Paginate to fetch all.
async function fetchAllPages<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data } = await makeQuery(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * `embedded`: renderiza SOLO el contenido de una pestaña (sin header, breadcrumb
 * ni selector de tabs) para incrustarlo en otra página — lo usa "Personas" de
 * Configurar Institución para Estudiantes/Acudientes. Mismo código, misma data:
 * lo que se haga aquí o allá queda idéntico porque ES el mismo componente.
 */
const PanelControl = ({ embedded = false, tabFija, soloGrupo }: { embedded?: boolean; tabFija?: "estudiantes" | "perfiles"; soloGrupo?: { grado: string; salon: string } } = {}) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Catálogo de asignaturas del colegio (vive en tabla Asignaturas).
  const {
    todas: asignaturasTodas,
    activas: asignaturasActivas,
    refrescar: refrescarAsignaturas,
  } = useAsignaturas();
  const ASIGNATURAS_NOMBRES = asignaturasActivas.map((a) => a.nombre);
  // Grados que realmente tiene el colegio (deriva de Estudiantes). El
  // Pestalozziano incluye "Párvulo"; la Normal no.
  const { grados: gradosColegio } = useGradosColegio();

  // Auth (en modo embebido el acceso lo controla la página padre)
  useEffect(() => {
    if (embedded) return;
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    if (!puedeAccederDashboard()) { navigate("/dashboard"); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  // Estudiantes
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loadingEst, setLoadingEst] = useState(true);
  const [searchEst, setSearchEst] = useState("");
  const [filtroGradoEst, setFiltroGradoEst] = useState("todos");
  const [filtroSalonEst, setFiltroSalonEst] = useState("todos");
  const [filtroFotoEst, setFiltroFotoEst] = useState("todos");
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const esAdmin = isAdmin();
  // Director de grupo: puede vincular/desvincular acudientes de sus estudiantes,
  // pero NO modificar los datos personales de un acudiente ya registrado (2026-07-09).
  const esProfesor = getSession().cargo === "Profesor(a)";
  // Contraseñas visibles para TODOS los roles con acceso al Panel de Control
  // (decisión 2026-07-06). El dbProxy permite leer `contrasena` a esos mismos
  // roles; editar datos personales sigue siendo solo del admin.
  const veContrasenas = puedeAccederDashboard();
  const [showEstDialog, setShowEstDialog] = useState(false);
  const [editingEst, setEditingEst] = useState<Estudiante | null>(null);
  const [showDeleteEst, setShowDeleteEst] = useState<Estudiante | null>(null);
  const [savingEst, setSavingEst] = useState(false);
  const [estId, setEstId] = useState("");
  const [estNombre, setEstNombre] = useState("");
  const [estApellidos, setEstApellidos] = useState("");
  const [estGrado, setEstGrado] = useState("");
  const [estSalon, setEstSalon] = useState("");
  const [estTelefono, setEstTelefono] = useState("");
  // True cuando la cédula escrita ya existe en Usuarios (info autocompletada).
  const [estUsuarioExiste, setEstUsuarioExiste] = useState(false);
  // Director de grupo: el formulario queda fijado a su grado+salón.
  useEffect(() => {
    if (soloGrupo && showEstDialog) { setEstGrado(soloGrupo.grado); setEstSalon(soloGrupo.salon); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEstDialog]);
  // Contraseña del estudiante (solo lectura, visible únicamente para admin).
  const [estContrasena, setEstContrasena] = useState("");
  // Fase 10.E.17: el acudiente vive en Usuarios + Acudientes. El form pide
  // cédula para poder linkear/crear correctamente en el modelo vivo.
  const [estAcu1Cedula, setEstAcu1Cedula] = useState("");
  const [estAcu1Nombre, setEstAcu1Nombre] = useState("");
  const [estAcu1Tel, setEstAcu1Tel] = useState("");
  const [estAcu2Cedula, setEstAcu2Cedula] = useState("");
  const [estAcu2Nombre, setEstAcu2Nombre] = useState("");
  const [estAcu2Tel, setEstAcu2Tel] = useState("");
  const [estAcu3Cedula, setEstAcu3Cedula] = useState("");
  const [estAcu3Nombre, setEstAcu3Nombre] = useState("");
  const [estAcu3Tel, setEstAcu3Tel] = useState("");

  // Snapshot del estado inicial al abrir el modal. Se usa al guardar para
  // hacer dirty tracking: solo escribir a Estudiantes/Usuarios/Acudientes
  // si los campos correspondientes realmente cambiaron. Sin esto, abrir
  // y guardar el modal sin tocar nada igual reescribía toda la información
  // de los acudientes en cada edición.
  type AcuSnap = { ced: string; nom: string; tel: string };
  interface EstSnap {
    id: string;
    nombres: string;
    apellidos: string;
    grado: string;
    salon: string;
    acudientes: [AcuSnap, AcuSnap, AcuSnap];
  }
  const [estSnapshot, setEstSnapshot] = useState<EstSnap | null>(null);

  // Internos
  const [internos, setInternos] = useState<Interno[]>([]);
  const [loadingInt, setLoadingInt] = useState(true);
  const [searchInt, setSearchInt] = useState("");
  const [showIntDialog, setShowIntDialog] = useState(false);
  const [editingInt, setEditingInt] = useState<Interno | null>(null);
  const [showDeleteInt, setShowDeleteInt] = useState<Interno | null>(null);
  const [savingInt, setSavingInt] = useState(false);
  const [intId, setIntId] = useState("");
  const [intNombres, setIntNombres] = useState("");
  const [intApellidos, setIntApellidos] = useState("");
  const [intCargo, setIntCargo] = useState("");
  const [intContrasena, setIntContrasena] = useState("");
  const [intNiveles, setIntNiveles] = useState<string[]>([]);
  const [intTelefono, setIntTelefono] = useState("");

  // Asignaciones
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [loadingAsig, setLoadingAsig] = useState(true);
  const [searchAsig, setSearchAsig] = useState("");
  const [showAsigDialog, setShowAsigDialog] = useState(false);
  const [editingAsig, setEditingAsig] = useState<Asignacion | null>(null);
  const [showDeleteAsig, setShowDeleteAsig] = useState<Asignacion | null>(null);
  const [savingAsig, setSavingAsig] = useState(false);
  const [asigProfesorId, setAsigProfesorId] = useState("");
  const [asigNombres, setAsigNombres] = useState("");
  const [asigApellidos, setAsigApellidos] = useState("");
  const [asigId, setAsigId] = useState("");
  const [asigAsignaturas, setAsigAsignaturas] = useState<string[]>([]);
  const [asigGrados, setAsigGrados] = useState<string[]>([]);
  const [asigSalones, setAsigSalones] = useState<string[]>([]);

  // Perfiles
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [loadingPerf, setLoadingPerf] = useState(true);
  const [searchPerf, setSearchPerf] = useState("");
  const [filtroGradoPerf, setFiltroGradoPerf] = useState("todos");
  const [filtroSalonPerf, setFiltroSalonPerf] = useState("todos");
  const [filtroFotoPerf, setFiltroFotoPerf] = useState("todos");
  const [showPerfDialog, setShowPerfDialog] = useState(false);
  const [editingPerf, setEditingPerf] = useState<Perfil | null>(null);
  const [showDeletePerf, setShowDeletePerf] = useState<Perfil | null>(null);
  const [savingPerf, setSavingPerf] = useState(false);
  // Perfil form state
  const [perfTipo, setPerfTipo] = useState<string>("Estudiante");
  const [perfEstId, setPerfEstId] = useState("");
  const [perfEstNombre, setPerfEstNombre] = useState("");
  const [perfEstApellidos, setPerfEstApellidos] = useState("");
  const [perfEstGrado, setPerfEstGrado] = useState("");
  const [perfEstSalon, setPerfEstSalon] = useState("");
  const [perfPadreNombre, setPerfPadreNombre] = useState("");
  const [perfPadreApellidos, setPerfPadreApellidos] = useState("");
  const [perfPadreId, setPerfPadreId] = useState("");
  // True si la cédula del acudiente ya existe en Usuarios (datos bloqueados
  // para rector/coordinador; solo el admin puede modificarlos).
  const [perfUsuarioExiste, setPerfUsuarioExiste] = useState(false);
  // Slots de acudidos visibles en el dialog (los vacíos se abren con "+ Agregar acudido").
  const [slotsAcudidos, setSlotsAcudidos] = useState(1);
  const [perfNumEst, setPerfNumEst] = useState("1 (uno)");
  const [perfHijo1Id, setPerfHijo1Id] = useState("");
  const [perfHijo1Nombre, setPerfHijo1Nombre] = useState("");
  const [perfHijo1Apellidos, setPerfHijo1Apellidos] = useState("");
  const [perfHijo1Grado, setPerfHijo1Grado] = useState("");
  const [perfHijo1Salon, setPerfHijo1Salon] = useState("");
  const [perfHijo2Id, setPerfHijo2Id] = useState("");
  const [perfHijo2Nombre, setPerfHijo2Nombre] = useState("");
  const [perfHijo2Apellidos, setPerfHijo2Apellidos] = useState("");
  const [perfHijo2Grado, setPerfHijo2Grado] = useState("");
  const [perfHijo2Salon, setPerfHijo2Salon] = useState("");
  const [perfHijo3Id, setPerfHijo3Id] = useState("");
  const [perfHijo3Nombre, setPerfHijo3Nombre] = useState("");
  const [perfHijo3Apellidos, setPerfHijo3Apellidos] = useState("");
  const [perfHijo3Grado, setPerfHijo3Grado] = useState("");
  const [perfHijo3Salon, setPerfHijo3Salon] = useState("");
  const [perfHijo4Id, setPerfHijo4Id] = useState("");
  const [perfHijo4Nombre, setPerfHijo4Nombre] = useState("");
  const [perfHijo4Apellidos, setPerfHijo4Apellidos] = useState("");
  const [perfHijo4Grado, setPerfHijo4Grado] = useState("");
  const [perfHijo4Salon, setPerfHijo4Salon] = useState("");
  const [perfContrasena, setPerfContrasena] = useState("");
  const [perfTelefono, setPerfTelefono] = useState("");

  // Autocompleta nombre/apellidos/grado/salon a partir del id estudiantil.
  // Si el id no matchea ningún estudiante (o se borra), limpia los campos.
  const autofillEstudianteFields = (
    idStr: string,
    setNombre: (v: string) => void,
    setApellidos: (v: string) => void,
    setGrado: (v: string) => void,
    setSalon: (v: string) => void,
  ) => {
    const clear = () => { setNombre(""); setApellidos(""); setGrado(""); setSalon(""); };
    if (!idStr.trim()) { clear(); return; }
    const num = parseInt(idStr);
    if (!num || isNaN(num)) { clear(); return; }
    const est = estudiantes.find((e) => e.id === num);
    if (est) {
      setNombre(est.nombres || "");
      setApellidos(est.apellidos || "");
      setGrado(est.grado || "");
      setSalon(est.salon || "");
    } else {
      clear();
    }
  };

  // Cédula normalizada: solo dígitos (acepta puntos y espacios al escribir/pegar).
  const soloDigitos = (s: string) => (s || "").replace(/\D/g, "");

  // Busca la cédula en Usuarios (tabla global, cross-colegio) y autocompleta
  // nombres/apellidos/teléfono si ya existe. Devuelve true si existía.
  const autofillDesdeUsuarios = async (
    cedula: string,
    setNombres: (v: string) => void,
    setApellidos: (v: string) => void,
    setTelefono?: (v: string) => void,
  ): Promise<boolean> => {
    const id = soloDigitos(cedula);
    if (!id) return false;
    const { data } = await supabase
      .from("Usuarios")
      .select("nombres, apellidos, numero_de_telefono")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      setNombres((data as any).nombres || "");
      setApellidos((data as any).apellidos || "");
      if (setTelefono) setTelefono((data as any).numero_de_telefono || "");
      return true;
    }
    return false;
  };

  // Cuenta cuántos acudientes tiene ya un estudiante en ESTE colegio (máx 3).
  // El proxy ya filtra Acudientes por el colegio del JWT. Excluye opcionalmente
  // la cédula de un acudiente (para no contarse a sí mismo al editar).
  const contarAcudientesDeEstudiante = async (
    estudianteId: number,
    excluirCedulaAcudiente?: string,
  ): Promise<number> => {
    const { data } = await supabase
      .from("Acudientes")
      .select("id")
      .or(`acudido1_id.eq.${estudianteId},acudido2_id.eq.${estudianteId},acudido3_id.eq.${estudianteId},acudido4_id.eq.${estudianteId}`);
    const excl = excluirCedulaAcudiente ? soloDigitos(excluirCedulaAcudiente) : "";
    return (data || []).filter((a: any) => String(a.id) !== excl).length;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FETCH
  // ═══════════════════════════════════════════════════════════════════════════

  // Helper: batch fetch nombres + teléfono + contraseña desde Usuarios en chunks.
  // El proxy puede truncar .in() cuando la lista de ids es grande y se combina
  // con .range — chunks manuales son más confiables.
  // La columna `contrasena` está en denyColumns, pero el proxy hace bypass
  // para Rector/Coordinador/Administrador (los únicos que entran al PanelControl).
  const fetchUsuariosBatch = async (ids: string[]): Promise<Map<string, { nombres: string; apellidos: string; tel: string; contrasena: string }>> => {
    const map = new Map<string, { nombres: string; apellidos: string; tel: string; contrasena: string }>();
    const CHUNK = 500;
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += CHUNK) {
      const slice = unique.slice(i, i + CHUNK);
      const { data } = await supabase
        .from("Usuarios")
        .select("id, nombres, apellidos, numero_de_telefono, contrasena")
        .in("id", slice);
      for (const u of (data || []) as any[]) {
        map.set(String(u.id), {
          nombres: (u.nombres as string) || "",
          apellidos: (u.apellidos as string) || "",
          tel: (u.numero_de_telefono as string) || "",
          contrasena: (u.contrasena as string) || "",
        });
      }
    }
    return map;
  };

  const fetchEstudiantes = async () => {
    setLoadingEst(true);
    const raw = await fetchAllPages((from, to) => {
      // Fase 10.E.19: nombres/apellidos/teléfono viven en Usuarios.
      let q = supabase
        .from("Estudiantes")
        .select("id, nivel, grado, salon, avatar_url")
        .range(from, to);
      // Director de grupo: solo los estudiantes de SU grado+salón (el dbProxy
      // fuerza lo mismo en las escrituras).
      if (soloGrupo) q = q.eq("grado", soloGrupo.grado).eq("salon", soloGrupo.salon);
      return q;
    });
    const usrMap = await fetchUsuariosBatch(raw.map((e: any) => String(e.id)));
    const data: any[] = raw.map((e: any) => {
      const u = usrMap.get(String(e.id));
      return {
        ...e,
        nombres: u?.nombres || "",
        apellidos: u?.apellidos || "",
        numero_de_telefono: u?.tel || "",
        contrasena: u?.contrasena || "",
        avatar_url: (e as any).avatar_url || null,
      };
    });
    data.sort((a, b) => {
      const sa = `${a.apellidos || ""} ${a.nombres || ""}`.toLowerCase();
      const sb = `${b.apellidos || ""} ${b.nombres || ""}`.toLowerCase();
      return sa.localeCompare(sb, "es");
    });
    setEstudiantes(data as any);
    setLoadingEst(false);
  };

  const fetchInternos = async () => {
    setLoadingInt(true);
    // Fase 10.E.19: nombres/apellidos/teléfono viven en Usuarios — chunks manuales.
    const internosRaw = await fetchAllPages<any>((from, to) =>
      supabase.from("Internos").select("id, cargo, niveles_coordina").range(from, to)
    );
    const usrMap = await fetchUsuariosBatch(internosRaw.map((i: any) => String(i.id)));
    const data: Interno[] = internosRaw.map((i: any) => {
      const u = usrMap.get(String(i.id));
      return {
        ...i,
        nombres: u?.nombres || "",
        apellidos: u?.apellidos || "",
        numero_de_telefono: u?.tel || null,
        contrasena: u?.contrasena || null,
      };
    });
    setInternos(data.sort((a, b) => (a.apellidos || "").localeCompare(b.apellidos || "", "es")));
    setLoadingInt(false);
  };

  const fetchAsignaciones = async () => {
    setLoadingAsig(true);
    // Fase 10.E.19: nombres/apellidos/teléfono viven en Usuarios — join por id.
    const raw = await fetchAllPages<any>((from, to) =>
      supabase.from("Asignación Profesores").select('row_id, id, "Asignatura(s)", "Grado(s)", "Salon(es)"').range(from, to)
    );
    const ids = [...new Set(raw.map((r: any) => r.id).filter((v: any) => v != null))].map(String);
    const usrMap = new Map<string, { nombres: string; apellidos: string; tel: string }>();
    if (ids.length > 0) {
      const usuarios = await fetchAllPages<any>((from, to) =>
        supabase.from("Usuarios").select("id, nombres, apellidos, numero_de_telefono").in("id", ids).range(from, to)
      );
      for (const u of usuarios) {
        usrMap.set(String(u.id), {
          nombres: (u.nombres as string) || "",
          apellidos: (u.apellidos as string) || "",
          tel: (u.numero_de_telefono as string) || "",
        });
      }
    }
    const data: Asignacion[] = raw.map((r: any) => {
      const u = usrMap.get(String(r.id));
      return {
        ...r,
        nombres: u?.nombres || "",
        apellidos: u?.apellidos || "",
        numero_de_telefono: u?.tel || "",
      } as Asignacion;
    });
    setAsignaciones(data.sort((a, b) => (a.apellidos || "").localeCompare(b.apellidos || "", "es")));
    setLoadingAsig(false);
  };

  const fetchPerfiles = async () => {
    // Fase 10.E.19+: la pestaña "Acudientes" muestra los acudientes (padres
    // de familia) reales que viven en la tabla Acudientes, enriquecidos con
    // nombre/teléfono desde Usuarios y con datos de cada acudido vinculado desde
    // Estudiantes + Usuarios. Reemplaza el listado legacy de Perfiles_Generales.
    setLoadingPerf(true);
    try {
      const acudientesRaw = await fetchAllPages<any>((from, to) =>
        supabase
          .from("Acudientes")
          .select("id, acudido1_id, acudido2_id, acudido3_id, acudido4_id, avatar_url")
          .range(from, to)
      );

      // IDs únicos para batch: acudientes + sus acudidos.
      const acuIds = acudientesRaw.map((a) => String(a.id));
      const hijoIds = new Set<string>();
      for (const a of acudientesRaw) {
        for (let i = 1; i <= 4; i++) {
          const v = a[`acudido${i}_id`];
          if (v) hijoIds.add(String(v));
        }
      }
      const allUserIds = [...new Set([...acuIds, ...hijoIds])];

      // Batch a Usuarios en chunks (evita .in() gigantes que el proxy puede
      // truncar). Sin paginar dentro de cada chunk — supabase devuelve hasta
      // 1000 rows por request y los chunks son de 500, así que cabe.
      // Incluye contrasena (el proxy hace bypass del denyColumns para roles
      // privilegiados, que son los únicos con acceso a PanelControl).
      const CHUNK = 500;
      const usrMap = new Map<string, { nombres: string; apellidos: string; tel: string; contrasena: string }>();
      for (let i = 0; i < allUserIds.length; i += CHUNK) {
        const slice = allUserIds.slice(i, i + CHUNK);
        const { data } = await supabase
          .from("Usuarios")
          .select("id, nombres, apellidos, numero_de_telefono, contrasena")
          .in("id", slice);
        for (const u of (data || []) as any[]) {
          usrMap.set(String(u.id), {
            nombres: (u.nombres as string) || "",
            apellidos: (u.apellidos as string) || "",
            tel: (u.numero_de_telefono as string) || "",
            contrasena: (u.contrasena as string) || "",
          });
        }
      }

      // Batch a Estudiantes para grado/salón/nivel de cada acudido.
      const estMap = new Map<string, { nivel: string; grado: string; salon: string }>();
      const hijoIdsArr = [...hijoIds];
      for (let i = 0; i < hijoIdsArr.length; i += CHUNK) {
        const slice = hijoIdsArr.slice(i, i + CHUNK);
        const { data } = await supabase
          .from("Estudiantes")
          .select("id, nivel, grado, salon")
          .in("id", slice);
        for (const e of (data || []) as any[]) {
          estMap.set(String(e.id), {
            nivel: (e.nivel as string) || "",
            grado: (e.grado as string) || "",
            salon: (e.salon as string) || "",
          });
        }
      }

      // Construir Perfil[] usando la forma legacy del UI.
      const perfilesConstruidos: Perfil[] = acudientesRaw.map((a) => {
        const acuUser = usrMap.get(String(a.id));
        const perfil: any = {
          numero_de_telefono: acuUser?.tel || "",
          perfil: "Acudiente",
          estudiante_id: null,
          estudiante_nombre: null,
          estudiante_apellidos: null,
          estudiante_nivel: null,
          estudiante_grado: null,
          estudiante_salon: null,
          acudiente_nombre: `${acuUser?.nombres || ""} ${acuUser?.apellidos || ""}`.trim(),
          acudiente_nombres_only: acuUser?.nombres || "",
          padre_apellidos_only: acuUser?.apellidos || "",
          padre_id: String(a.id),
          numero_de_acudidos: null,
          contrasena: acuUser?.contrasena || null,
          avatar_url: (a as any).avatar_url || null,
        };
        // Mapear los 4 slots de acudidos con sufijo secuencial 1..N.
        let pos = 1;
        for (let i = 1; i <= 4; i++) {
          const hijoId = a[`acudido${i}_id`];
          if (!hijoId) continue;
          const hijoUser = usrMap.get(String(hijoId));
          const hijoEst = estMap.get(String(hijoId));
          perfil[`acudido${pos}_id`] = Number(hijoId);
          perfil[`acudido${pos}_nombre`] = hijoUser?.nombres || null;
          perfil[`acudido${pos}_apellidos`] = hijoUser?.apellidos || null;
          perfil[`acudido${pos}_nivel`] = hijoEst?.nivel || null;
          perfil[`acudido${pos}_grado`] = hijoEst?.grado || null;
          perfil[`acudido${pos}_salon`] = hijoEst?.salon || null;
          pos++;
        }
        // Llenar slots restantes con nulls.
        for (let i = pos; i <= 4; i++) {
          perfil[`acudido${i}_id`] = null;
          perfil[`acudido${i}_nombre`] = null;
          perfil[`acudido${i}_apellidos`] = null;
          perfil[`acudido${i}_nivel`] = null;
          perfil[`acudido${i}_grado`] = null;
          perfil[`acudido${i}_salon`] = null;
        }
        return perfil as Perfil;
      });

      // Sort por apellidos+nombres del acudiente (locale español).
      perfilesConstruidos.sort((a: any, b: any) => {
        const sa = `${a.padre_apellidos_only || ""} ${a.acudiente_nombres_only || ""}`.toLowerCase();
        const sb = `${b.padre_apellidos_only || ""} ${b.acudiente_nombres_only || ""}`.toLowerCase();
        return sa.localeCompare(sb, "es");
      });

      // Director de grupo: solo acudientes con al menos un acudido en su grupo.
      const visibles = soloGrupo
        ? perfilesConstruidos.filter((p: any) =>
            [1, 2, 3, 4].some((i) => p[`acudido${i}_grado`] === soloGrupo.grado && String(p[`acudido${i}_salon`]) === soloGrupo.salon))
        : perfilesConstruidos;

      setPerfiles(visibles);
    } catch (e) {
      console.error("[fetchPerfiles] Error cargando acudientes:", e);
      setPerfiles([]);
    } finally {
      setLoadingPerf(false);
    }
  };

  useEffect(() => {
    fetchEstudiantes();
    fetchInternos();
    fetchAsignaciones();
    fetchPerfiles();
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // ESTUDIANTES CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  const openEstDialog = async (est?: Estudiante) => {
    // Reset siempre antes de cargar (evita ver datos del estudiante anterior).
    setEstTelefono(""); setEstUsuarioExiste(false); setEstContrasena("");
    setEstAcu1Cedula(""); setEstAcu1Nombre(""); setEstAcu1Tel("");
    setEstAcu2Cedula(""); setEstAcu2Nombre(""); setEstAcu2Tel("");
    setEstAcu3Cedula(""); setEstAcu3Nombre(""); setEstAcu3Tel("");
    const emptyAcu: AcuSnap = { ced: "", nom: "", tel: "" };
    if (est) {
      setEditingEst(est);
      setEstId(String(est.id));
      setEstNombre(est.nombres || "");
      setEstApellidos(est.apellidos || "");
      setEstGrado(est.grado || "");
      setEstSalon(est.salon || "");
      setEstUsuarioExiste(true);
      setShowEstDialog(true);

      // El teléfono (y la contraseña, roles del panel) viven en Usuarios.
      try {
        const cols = veContrasenas ? "numero_de_telefono, contrasena" : "numero_de_telefono";
        const { data: u } = await supabase
          .from("Usuarios")
          .select(cols)
          .eq("id", String(est.id))
          .maybeSingle();
        setEstTelefono(((u as any)?.numero_de_telefono as string) || "");
        if (veContrasenas) setEstContrasena(((u as any)?.contrasena as string) || "");
      } catch (e) {
        console.error("[openEstDialog] No se pudo cargar el teléfono:", e);
      }

      // Fase 10.E.17: cargar acudientes desde el modelo vivo
      // (Acudientes cuyo acudidoN_id apunta a este estudiante) + Usuarios.
      const acuSlots: [AcuSnap, AcuSnap, AcuSnap] = [emptyAcu, emptyAcu, emptyAcu];
      try {
        const { data: acus } = await supabase
          .from("Acudientes")
          .select("id, acudido1_id, acudido2_id, acudido3_id, acudido4_id")
          .or(`acudido1_id.eq.${est.id},acudido2_id.eq.${est.id},acudido3_id.eq.${est.id},acudido4_id.eq.${est.id}`);
        const ids = (acus || []).map((a: any) => String(a.id));
        if (ids.length > 0) {
          const { data: usuarios } = await supabase
            .from("Usuarios")
            .select("id, nombres, apellidos, numero_de_telefono")
            .in("id", ids);
          const slots: Array<{ ced: string; nom: string; tel: string }> = [];
          for (const u of usuarios || []) {
            slots.push({
              ced: String(u.id),
              nom: `${u.nombres || ""} ${u.apellidos || ""}`.trim(),
              tel: String(u.numero_de_telefono || ""),
            });
            if (slots.length >= 3) break;
          }
          if (slots[0]) { setEstAcu1Cedula(slots[0].ced); setEstAcu1Nombre(slots[0].nom); setEstAcu1Tel(slots[0].tel); acuSlots[0] = slots[0]; }
          if (slots[1]) { setEstAcu2Cedula(slots[1].ced); setEstAcu2Nombre(slots[1].nom); setEstAcu2Tel(slots[1].tel); acuSlots[1] = slots[1]; }
          if (slots[2]) { setEstAcu3Cedula(slots[2].ced); setEstAcu3Nombre(slots[2].nom); setEstAcu3Tel(slots[2].tel); acuSlots[2] = slots[2]; }
        }
      } catch (e) {
        console.error("[openEstDialog] No se pudieron cargar acudientes:", e);
      }
      // Snapshot del estado tras la carga: estudiante + acudientes tal como
      // están en DB. Se compara contra esto al guardar para decidir qué tablas
      // tocar.
      setEstSnapshot({
        id: String(est.id),
        nombres: est.nombres || "",
        apellidos: est.apellidos || "",
        grado: est.grado || "",
        salon: est.salon || "",
        acudientes: acuSlots,
      });
    } else {
      setEditingEst(null);
      setEstId("");
      setEstNombre("");
      setEstApellidos("");
      setEstGrado("");
      setEstSalon("");
      setShowEstDialog(true);
      // Estudiante nuevo → snapshot vacío; cualquier dato del form se trata
      // como "agregar".
      setEstSnapshot({
        id: "",
        nombres: "",
        apellidos: "",
        grado: "",
        salon: "",
        acudientes: [emptyAcu, emptyAcu, emptyAcu],
      });
    }
  };

  const saveEstudiante = async () => {
    const idNorm = soloDigitos(estId);
    if (!idNorm || !estNombre.trim() || !estApellidos.trim() || !estGrado || !estSalon) {
      toast({ title: "Campos requeridos", description: "Completa id, nombres, apellidos, grado y salón", variant: "destructive" });
      return;
    }
    const nivel = getNivelFromGrado(estGrado);
    if (!nivel) {
      toast({ title: "Error", description: "Grado inválido", variant: "destructive" });
      return;
    }

    setSavingEst(true);
    const tel = estTelefono.trim() || null;

    // Cambió la identificación → migrarla en TODAS las tablas antes de seguir.
    // Admin usa la cascada genérica (cualquier persona); los demás roles del
    // panel usan la de ESTUDIANTES (valida que sea estudiante puro del colegio).
    const cambioIdEst = !!editingEst && idNorm !== String(editingEst.id);
    if (cambioIdEst) {
      try {
        if (esAdmin) {
          await apiClient.auth.cambiarCedula(String(editingEst!.id), idNorm);
        } else {
          await apiRequest("/api/institucion/corregir-id-estudiante", {
            method: "POST",
            body: JSON.stringify({ id_actual: String(editingEst!.id), id_nueva: idNorm }),
          });
        }
      } catch (e: any) {
        setSavingEst(false);
        toast({ title: "No se pudo cambiar la cédula", description: e?.body?.detail || e?.message || "Error", variant: "destructive" });
        return;
      }
    }

    // ── 1) Usuarios (fuente única de nombres/apellidos/teléfono, cross-colegio).
    //       Editar aquí propaga el cambio a todos los colegios de esa persona.
    const { data: existingUserEst } = await supabase
      .from("Usuarios").select("id").eq("id", idNorm).maybeSingle();
    const usuarioYaExistia = !!existingUserEst;

    // Datos personales de ESTUDIANTES: editables por todos los roles del panel
    // (decisión 2026-07-08). Los existentes van por UPDATE (el proxy valida que
    // el objetivo sea un estudiante del colegio). No se toca contraseña: al
    // crear queda vacía y la persona entra con su id.
    {
      const datosEst = {
        nombres: estNombre.trim(),
        apellidos: estApellidos.trim(),
        numero_de_telefono: tel,
      };
      const { error: errUsrEst } = usuarioYaExistia
        ? await supabase.from("Usuarios").update(datosEst).eq("id", idNorm)
        : await supabase.from("Usuarios").upsert({ id: idNorm, ...datosEst }, { onConflict: "id" });
      if (errUsrEst) {
        setSavingEst(false);
        const code = (errUsrEst as any).code;
        const msg = code === "23505"
          ? "Ese número de teléfono ya está registrado en otra persona."
          : (errUsrEst.message || `No se pudo guardar el usuario (${code || "sin código"})`);
        toast({ title: "Error", description: msg, variant: "destructive" });
        return;
      }
    }

    // ── 2) Estudiantes (membresía del colegio). Si falla y el Usuario era
    //       nuevo, lo borramos para no dejarlo huérfano.
    const payload = { id: Number(idNorm), nivel, grado: estGrado, salon: estSalon };
    let error: { message: string; code?: string } | null = null;
    if (editingEst) {
      ({ error } = await supabase.from("Estudiantes").update(payload).eq("id", cambioIdEst ? Number(idNorm) : editingEst.id));
    } else {
      ({ error } = await supabase.from("Estudiantes").insert(payload));
    }
    if (error) {
      if (!editingEst && !usuarioYaExistia) {
        await supabase.from("Usuarios").delete().eq("id", idNorm);
      }
      setSavingEst(false);
      if (error.code === "23505") {
        toast({ title: "Error", description: `Ya existe un estudiante con el id ${idNorm}`, variant: "destructive" });
      } else {
        toast({
          title: "Error",
          description: error.message || `No se pudo guardar el estudiante (${error.code || "sin código"})`,
          variant: "destructive",
        });
      }
      return;
    }

    setSavingEst(false);
    toast({ title: editingEst ? "Estudiante actualizado" : "Estudiante agregado" });
    setShowEstDialog(false);
    fetchEstudiantes();
  };

  const deleteEstudiante = async () => {
    if (!showDeleteEst) return;
    setSavingEst(true);
    const { error } = await supabase
      .from("Estudiantes")
      .delete()
      .eq("id", showDeleteEst.id);
    setSavingEst(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Estudiante eliminado" });
    setShowDeleteEst(null);
    fetchEstudiantes();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNOS CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  const openIntDialog = (int?: Interno) => {
    if (int) {
      setEditingInt(int);
      setIntId(String(int.id));
      setIntNombres(int.nombres || "");
      setIntApellidos(int.apellidos || "");
      setIntCargo(int.cargo || "");
      setIntContrasena(int.contrasena || "");
      setIntNiveles(int.niveles_coordina || []);
      setIntTelefono(int.numero_de_telefono || "");
    } else {
      setEditingInt(null);
      setIntId("");
      setIntNombres("");
      setIntApellidos("");
      setIntCargo("");
      setIntContrasena("");
      setIntNiveles([]);
      setIntTelefono("");
    }
    setShowIntDialog(true);
  };

  const saveInterno = async () => {
    if (!intId || !intNombres || !intApellidos || !intCargo) {
      toast({ title: "Campos requeridos", description: "Completa id, nombres, apellidos y cargo", variant: "destructive" });
      return;
    }

    setSavingInt(true);

    // Cambió la identificación del funcionario → migrarla en TODAS las tablas.
    const idViejoInt = String(editingInt?.id || "");
    const cambioIdInt = !!editingInt && idViejoInt !== "" && intId !== idViejoInt;
    if (cambioIdInt) {
      try {
        if (esAdmin) {
          await apiClient.auth.cambiarCedula(idViejoInt, intId);
        } else {
          await apiRequest("/api/institucion/corregir-id", {
            method: "POST",
            body: JSON.stringify({ id_actual: idViejoInt, id_nueva: intId }),
          });
        }
      } catch (e: any) {
        setSavingInt(false);
        toast({ title: "No se pudo cambiar la identificación", description: e?.body?.detail || e?.message || "Error", variant: "destructive" });
        return;
      }
    }

    // Orden importante: primero Usuarios (donde viven nombres/apellidos/contrasena),
    // después Internos (solo id + cargo). Si falla Usuarios y va primero, no
    // queda un Interno huérfano sin datos. Si Internos falla por id duplicado,
    // borramos el Usuario que acabamos de crear si era nuevo (no había antes).
    const usuariosPayload: Record<string, unknown> = {
      id: intId,
      nombres: intNombres.trim(),
      apellidos: intApellidos.trim(),
      numero_de_telefono: intTelefono.trim() || null,
    };
    if (intContrasena) {
      usuariosPayload.contrasena = intContrasena;
    } else if (!editingInt) {
      // Nuevo Interno sin contraseña → default = id.
      usuariosPayload.contrasena = intId;
    }
    // ¿El usuario ya existía? (para saber si revertir en caso de fallo de Internos)
    const { data: prevUsr } = await supabase
      .from("Usuarios").select("id").eq("id", intId).maybeSingle();
    const usuarioYaExistia = !!prevUsr;

    const { error: errUsr } = await supabase
      .from("Usuarios")
      .upsert(usuariosPayload, { onConflict: "id" });
    if (errUsr) {
      setSavingInt(false);
      const esTelDuplicado = (errUsr as any).code === "23505" && /telefono/i.test(errUsr.message || "");
      toast({
        title: "Error",
        description: esTelDuplicado
          ? "Ese número de teléfono ya está registrado a otra persona."
          : errUsr.message || `No se pudo guardar el usuario (${(errUsr as any).code || "sin código"})`,
        variant: "destructive",
      });
      return;
    }

    // Internos: solo id + cargo (Fase 10.E.19 dropeó nombres/apellidos).
    const payload: Record<string, unknown> = {
      id: Number(intId),
      cargo: intCargo,
      // Solo aplica a coordinadores; vacío = NULL = coordina todos los niveles.
      niveles_coordina: intCargo === "Coordinador(a)" && intNiveles.length > 0 ? intNiveles : null,
    };
    let error: any;
    if (editingInt) {
      ({ error } = await supabase
        .from("Internos")
        .update(payload)
        .eq("id", cambioIdInt ? Number(intId) : editingInt.id));
    } else {
      ({ error } = await supabase.from("Internos").insert(payload));
    }

    if (error) {
      // Si Internos falló y el Usuario era nuevo (creado por nosotros recién),
      // lo borramos para que no quede huérfano.
      if (!editingInt && !usuarioYaExistia) {
        await supabase.from("Usuarios").delete().eq("id", intId);
      }
      setSavingInt(false);
      if (error.code === "23505") {
        toast({ title: "Error", description: `Ya existe un funcionario con el id ${intId}`, variant: "destructive" });
      } else {
        toast({
          title: "Error",
          description: error.message || `No se pudo guardar el funcionario (${error.code || "sin código"})`,
          variant: "destructive",
        });
      }
      return;
    }
    setSavingInt(false);
    toast({ title: editingInt ? "Funcionario actualizado" : "Funcionario agregado" });
    setShowIntDialog(false);
    fetchInternos();
  };

  const deleteInterno = async () => {
    if (!showDeleteInt) return;
    setSavingInt(true);
    const internoId = showDeleteInt.id;
    const internoIdStr = String(internoId);

    const { error } = await supabase
      .from("Internos")
      .delete()
      .eq("id", internoId);
    if (error) {
      setSavingInt(false);
      if (error.code === "23503") {
        toast({
          title: "No se puede eliminar",
          description: "Este funcionario tiene actividades asignadas. Elimina las actividades primero.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      return;
    }

    // Cleanup cross-tenant: el endpoint verifica con service_role en TODOS los
    // colegios. Si la cédula sigue siendo Estudiante/Acudiente/Interno en
    // CUALQUIER colegio, no borra Usuarios. Esto evita destruir la identidad
    // global de personas con multi-membresía.
    try {
      await apiClient.auth.cleanupUsuarioOrphan(internoIdStr);
    } catch (err) {
      console.warn("[deleteInterno] cleanup Usuarios falló (no crítico):", err);
    }

    setSavingInt(false);
    toast({ title: "Funcionario eliminado" });
    setShowDeleteInt(null);
    fetchInternos();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ASIGNACIONES CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  const openAsigDialog = (asig?: Asignacion) => {
    if (asig) {
      setEditingAsig(asig);
      setAsigProfesorId(asig.id != null ? String(asig.id) : "");
      setAsigNombres(asig.nombres || "");
      setAsigApellidos(asig.apellidos || "");
      setAsigId(asig.numero_de_telefono || "");
      setAsigAsignaturas(asig["Asignatura(s)"] || []);
      setAsigGrados(asig["Grado(s)"] || []);
      setAsigSalones(asig["Salon(es)"] || []);
    } else {
      setEditingAsig(null);
      setAsigProfesorId("");
      setAsigNombres("");
      setAsigApellidos("");
      setAsigId("");
      setAsigAsignaturas([]);
      setAsigGrados([]);
      setAsigSalones([]);
    }
    setShowAsigDialog(true);
  };

  const handleSelectProfesor = (idStr: string) => {
    setAsigProfesorId(idStr);
    const prof = internos.find((i) => String(i.id) === idStr);
    if (prof) {
      setAsigNombres(prof.nombres || "");
      setAsigApellidos(prof.apellidos || "");
      setAsigId(prof.numero_de_telefono || "");
    }
  };

  const saveAsignacion = async () => {
    if (
      !asigProfesorId ||
      asigAsignaturas.length === 0 ||
      asigGrados.length === 0 ||
      asigSalones.length === 0
    ) {
      toast({
        title: "Campos requeridos",
        description: "Selecciona profesor, al menos una asignatura, un grado y un salón",
        variant: "destructive",
      });
      return;
    }

    setSavingAsig(true);
    // Asignación Profesores solo tiene: row_id, id, Asignatura(s), Grado(s),
    // Salon(es), colegio_id. Nombres/apellidos/telefono fueron dropeados en
    // Fase 10.E.19 — viven solo en Usuarios y se resuelven vía join por id.
    const payload = {
      id: Number(asigProfesorId),
      "Asignatura(s)": asigAsignaturas,
      "Grado(s)": asigGrados,
      "Salon(es)": asigSalones,
    };

    let error: any;
    if (editingAsig) {
      ({ error } = await supabase
        .from("Asignación Profesores")
        .update(payload)
        .eq("row_id", editingAsig.row_id));
    } else {
      ({ error } = await supabase.from("Asignación Profesores").insert(payload));
    }

    setSavingAsig(false);
    if (error) {
      toast({
        title: "Error",
        description: error.message || `No se pudo guardar la asignación (${error.code || "sin código"})`,
        variant: "destructive",
      });
      return;
    }
    toast({ title: editingAsig ? "Asignación actualizada" : "Asignación agregada" });
    setShowAsigDialog(false);
    fetchAsignaciones();
  };

  const deleteAsignacion = async () => {
    if (!showDeleteAsig) return;
    setSavingAsig(true);
    const { error } = await supabase
      .from("Asignación Profesores")
      .delete()
      .eq("row_id", showDeleteAsig.row_id);
    setSavingAsig(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Asignación eliminada" });
    setShowDeleteAsig(null);
    fetchAsignaciones();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFILES CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  const openPerfDialog = async (p?: Perfil) => {
    setPerfTipo("Acudiente");
    setPerfContrasena("");
    setPerfUsuarioExiste(!!p);
    if (p) {
      setEditingPerf(p);
      setPerfPadreId(p.padre_id || "");
      setPerfPadreNombre(p.acudiente_nombre || "");
      setPerfPadreApellidos("");
      setPerfTelefono(p.numero_de_telefono || "");
      setPerfHijo1Id(p.acudido1_id != null ? String(p.acudido1_id) : "");
      setPerfHijo1Nombre(p.acudido1_nombre || "");
      setPerfHijo1Apellidos(p.acudido1_apellidos || "");
      setPerfHijo1Grado(p.acudido1_grado || "");
      setPerfHijo1Salon(p.acudido1_salon || "");
      setPerfHijo2Id(p.acudido2_id != null ? String(p.acudido2_id) : "");
      setPerfHijo2Nombre(p.acudido2_nombre || "");
      setPerfHijo2Apellidos(p.acudido2_apellidos || "");
      setPerfHijo2Grado(p.acudido2_grado || "");
      setPerfHijo2Salon(p.acudido2_salon || "");
      setPerfHijo3Id(p.acudido3_id != null ? String(p.acudido3_id) : "");
      setPerfHijo3Nombre(p.acudido3_nombre || "");
      setPerfHijo3Apellidos(p.acudido3_apellidos || "");
      setPerfHijo3Grado(p.acudido3_grado || "");
      setPerfHijo3Salon(p.acudido3_salon || "");
      setPerfHijo4Id(p.acudido4_id != null ? String(p.acudido4_id) : "");
      setPerfHijo4Nombre(p.acudido4_nombre || "");
      setPerfHijo4Apellidos(p.acudido4_apellidos || "");
      setPerfHijo4Grado(p.acudido4_grado || "");
      setPerfHijo4Salon(p.acudido4_salon || "");
      setSlotsAcudidos(Math.max(1, [p.acudido1_id, p.acudido2_id, p.acudido3_id, p.acudido4_id].filter((x) => x != null).length));
      setShowPerfDialog(true);
      // Nombres/apellidos/teléfono (y contraseña, solo admin) viven en Usuarios.
      if (p.padre_id) {
        try {
          const cols = esAdmin
            ? "nombres, apellidos, numero_de_telefono, contrasena"
            : "nombres, apellidos, numero_de_telefono";
          const { data: u } = await supabase.from("Usuarios").select(cols).eq("id", p.padre_id).maybeSingle();
          if (u) {
            setPerfPadreNombre((u as any).nombres || "");
            setPerfPadreApellidos((u as any).apellidos || "");
            setPerfTelefono((u as any).numero_de_telefono || "");
            if (veContrasenas) setPerfContrasena((u as any).contrasena || "");
          }
        } catch (e) {
          console.error("[openPerfDialog] No se pudo cargar Usuarios:", e);
        }
      }
    } else {
      setEditingPerf(null);
      setPerfPadreId(""); setPerfPadreNombre(""); setPerfPadreApellidos(""); setPerfTelefono("");
      setPerfHijo1Id(""); setPerfHijo1Nombre(""); setPerfHijo1Apellidos(""); setPerfHijo1Grado(""); setPerfHijo1Salon("");
      setPerfHijo2Id(""); setPerfHijo2Nombre(""); setPerfHijo2Apellidos(""); setPerfHijo2Grado(""); setPerfHijo2Salon("");
      setPerfHijo3Id(""); setPerfHijo3Nombre(""); setPerfHijo3Apellidos(""); setPerfHijo3Grado(""); setPerfHijo3Salon("");
      setPerfHijo4Id(""); setPerfHijo4Nombre(""); setPerfHijo4Apellidos(""); setPerfHijo4Grado(""); setPerfHijo4Salon("");
      setSlotsAcudidos(1);
      setShowPerfDialog(true);
    }
  };

  const savePerfil = async () => {
    const cedAcu = soloDigitos(perfPadreId);
    if (!cedAcu) {
      toast({ title: "Falta la cédula del acudiente", variant: "destructive" });
      return;
    }
    if (!perfPadreNombre.trim() || !perfPadreApellidos.trim()) {
      toast({ title: "Campos requeridos", description: "Completa nombres y apellidos del acudiente", variant: "destructive" });
      return;
    }

    // Acudidos escritos (ids no vacíos), deduplicados, en orden.
    const acudidoIds = Array.from(new Set(
      [perfHijo1Id, perfHijo2Id, perfHijo3Id, perfHijo4Id].map(soloDigitos).filter(Boolean),
    ));
    if (acudidoIds.length === 0) {
      toast({ title: "Falta el acudido", description: "Un acudiente debe tener al menos un estudiante a cargo.", variant: "destructive" });
      return;
    }

    // Cada acudido debe ser estudiante de ESTE colegio (estudiantes[] = los del
    // colegio; para el director de grupo la lista ya viene solo con SU grupo).
    const noEst = acudidoIds.find((id) => !estudiantes.some((e) => e.id === Number(id)));
    if (noEst) {
      toast({
        title: "Estudiante no encontrado",
        description: soloGrupo
          ? `El id ${noEst} no es un estudiante de su grupo (${soloGrupo.grado} ${soloGrupo.salon}).`
          : `El id ${noEst} no es un estudiante de este colegio. Créalo primero en la pestaña Estudiantes.`,
        variant: "destructive",
      });
      return;
    }

    setSavingPerf(true);

    // Límite: un estudiante puede tener máximo 3 acudientes (excluyendo a este mismo).
    for (const id of acudidoIds) {
      const n = await contarAcudientesDeEstudiante(Number(id), cedAcu);
      if (n >= 3) {
        setSavingPerf(false);
        const est = estudiantes.find((e) => e.id === Number(id));
        const nom = est ? `${est.nombres || ""} ${est.apellidos || ""}`.trim() : id;
        toast({ title: "Límite de acudientes", description: `El estudiante ${nom} ya tiene tres acudientes.`, variant: "destructive" });
        return;
      }
    }

    // colegio_id del acudiente: el del primer acudido.
    const { data: refEst } = await supabase
      .from("Estudiantes").select("colegio_id").eq("id", Number(acudidoIds[0])).single();
    const colegio_id = (refEst as any)?.colegio_id;
    if (!colegio_id) {
      setSavingPerf(false);
      toast({ title: "Error", description: "No se pudo determinar el colegio del estudiante.", variant: "destructive" });
      return;
    }

    // Cambió la cédula del acudiente → migrarla en TODAS las tablas. Admin usa
    // la cascada genérica; los demás roles del panel el endpoint con validaciones.
    const idViejoAcu = soloDigitos(editingPerf?.padre_id || "");
    const cambioIdPerf = !!editingPerf && !esProfesor && idViejoAcu !== "" && cedAcu !== idViejoAcu;
    if (cambioIdPerf) {
      try {
        if (esAdmin) {
          await apiClient.auth.cambiarCedula(idViejoAcu, cedAcu);
        } else {
          await apiRequest("/api/institucion/corregir-id", {
            method: "POST",
            body: JSON.stringify({ id_actual: idViejoAcu, id_nueva: cedAcu }),
          });
        }
      } catch (e: any) {
        setSavingPerf(false);
        toast({ title: "No se pudo cambiar la cédula", description: e?.body?.detail || e?.message || "Error", variant: "destructive" });
        return;
      }
    }

    // 1) Usuarios (fuente única). Datos personales editables por todos los roles
    //    del panel (2026-07-09): existentes van por UPDATE (el proxy valida el
    //    alcance). Sin contraseña: al crear queda vacía y la persona entra con su id.
    const tel = perfTelefono.trim() || null;
    const { data: existingUserAcu } = await supabase
      .from("Usuarios").select("id").eq("id", cedAcu).maybeSingle();
    {
      const datosAcu = {
        nombres: perfPadreNombre.trim(),
        apellidos: perfPadreApellidos.trim(),
        numero_de_telefono: tel,
      };
      // El director de grupo NO toca los datos de un acudiente ya registrado.
      const { error: errUsr } = existingUserAcu
        ? (esProfesor ? { error: null } : await supabase.from("Usuarios").update(datosAcu).eq("id", cedAcu))
        : await supabase.from("Usuarios").upsert({ id: cedAcu, ...datosAcu }, { onConflict: "id" });
      if (errUsr) {
        setSavingPerf(false);
        const code = (errUsr as any).code;
        const msg = code === "23505"
          ? "Ese número de teléfono ya está registrado en otra persona."
          : (errUsr.message || "No se pudo guardar el usuario");
        toast({ title: "Error", description: msg, variant: "destructive" });
        return;
      }
    }

    // 2) Acudientes (membresía del colegio). El upsert sobrescribe los 4 slots.
    const { error: errAcu } = await supabase.from("Acudientes").upsert({
      id: cedAcu,
      colegio_id,
      acudido1_id: acudidoIds[0] ? Number(acudidoIds[0]) : null,
      acudido2_id: acudidoIds[1] ? Number(acudidoIds[1]) : null,
      acudido3_id: acudidoIds[2] ? Number(acudidoIds[2]) : null,
      acudido4_id: acudidoIds[3] ? Number(acudidoIds[3]) : null,
    }, { onConflict: "id,colegio_id" });
    setSavingPerf(false);
    if (errAcu) {
      toast({ title: "Error", description: errAcu.message || "No se pudo guardar el acudiente", variant: "destructive" });
      return;
    }

    toast({ title: editingPerf ? "Acudiente actualizado" : "Acudiente agregado" });
    setShowPerfDialog(false);
    fetchPerfiles();
  };

  const deletePerfil = async () => {
    if (!showDeletePerf) return;
    setSavingPerf(true);
    // Fase 10: eliminar también del modelo nuevo. El cleanup de Usuarios pasa
    // por el endpoint server que verifica TODOS los colegios — si la cédula
    // sigue siendo Estudiante/Acudiente/Interno en otro colegio, Usuarios
    // se conserva (preserva multi-membresía cross-tenant).
    try {
      if (showDeletePerf.perfil === "Estudiante" && showDeletePerf.estudiante_id) {
        await supabase.from("Estudiantes").delete().eq("id", showDeletePerf.estudiante_id);
        await apiClient.auth.cleanupUsuarioOrphan(String(showDeletePerf.estudiante_id));
      } else if ((showDeletePerf.perfil === "Acudiente") && showDeletePerf.padre_id) {
        await supabase.from("Acudientes").delete().eq("id", showDeletePerf.padre_id);
        await apiClient.auth.cleanupUsuarioOrphan(String(showDeletePerf.padre_id));
      }
    } catch (e) {
      console.error("[deletePerfil] Error borrando modelo nuevo:", e);
    }
    setSavingPerf(false);
    const error = null;
    if (error) {
      toast({ title: "Error", description: (error as any).message, variant: "destructive" });
      return;
    }
    toast({ title: "Perfil eliminado" });
    setShowDeletePerf(null);
    fetchPerfiles();
  };

  // Helper to get display name for a perfil
  const getPerfilDisplayName = (p: Perfil) => {
    if (p.perfil === "Estudiante") {
      return `${p.estudiante_apellidos || ""} ${p.estudiante_nombre || ""}`.trim() || "Sin nombre";
    }
    return p.acudiente_nombre || "Sin nombre";
  };

  const getPerfilDisplayCode = (p: Perfil) => {
    if (p.perfil === "Estudiante") return p.estudiante_id != null ? String(p.estudiante_id) : "—";
    return p.padre_id || "—";
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTERS
  // ═══════════════════════════════════════════════════════════════════════════

  // Salones que existen por grado (derivado de los estudiantes del colegio):
  // cada grado muestra solo SUS salones reales; "todos" muestra la unión.
  const salonesPorGrado = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const e of estudiantes) {
      if (!e.grado || e.salon == null) continue;
      (m[e.grado] ||= new Set()).add(String(e.salon));
    }
    const out: Record<string, string[]> = {};
    for (const g in m) out[g] = [...m[g]].sort((a, b) => Number(a) - Number(b));
    return out;
  }, [estudiantes]);
  const salonesTodos = useMemo(() => {
    const s = new Set<string>();
    for (const e of estudiantes) if (e.salon != null) s.add(String(e.salon));
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [estudiantes]);
  const salonesParaGrado = (grado: string) =>
    grado === "todos" ? salonesTodos : (salonesPorGrado[grado] || []);

  // Celda de foto de perfil (visible para todos los roles del panel).
  // Si hay foto, al hacer click se abre en grande (tamaño real) en un pop up.
  const renderFotoCell = (url: string | null | undefined, nombre: string) => {
    const iniciales =
      (nombre || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
    return (
      <TableCell>
        {url ? (
          <button
            type="button"
            onClick={() => setFotoAmpliada(url)}
            title="Ver foto"
            className="rounded-full ring-offset-2 transition hover:ring-2 hover:ring-primary/50"
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={url} alt={nombre} className="object-cover" />
              <AvatarFallback className="text-[10px]">{iniciales}</AvatarFallback>
            </Avatar>
          </button>
        ) : (
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-[10px]">{iniciales}</AvatarFallback>
          </Avatar>
        )}
      </TableCell>
    );
  };

  const filteredEst = estudiantes.filter((e) =>
    matchesSearch(
      `${e.apellidos} ${e.nombres} ${e.id} ${e.grado} ${e.salon} ${(e as any).numero_de_telefono || ""}`,
      searchEst
    )
    && (filtroGradoEst === "todos" || e.grado === filtroGradoEst)
    && (filtroSalonEst === "todos" || String(e.salon) === filtroSalonEst)
    && (filtroFotoEst === "todos" || (filtroFotoEst === "con" ? !!e.avatar_url : !e.avatar_url))
  );

  // Un acudiente pasa el filtro si tiene AL MENOS un acudido que cumpla el
  // grado y/o salón escogido (el mismo acudido cumple ambos si ambos están).
  const perfAcudidoMatch = (p: Perfil, grado: string, salon: string): boolean => {
    if (grado === "todos" && salon === "todos") return true;
    for (let i = 1; i <= 4; i++) {
      if ((p as any)[`acudido${i}_id`] == null) continue;
      const g = (p as any)[`acudido${i}_grado`];
      const s = (p as any)[`acudido${i}_salon`];
      const okG = grado === "todos" || g === grado;
      const okS = salon === "todos" || String(s) === salon;
      if (okG && okS) return true;
    }
    return false;
  };

  const filteredInt = internos.filter((i) =>
    matchesSearch(`${i.apellidos} ${i.nombres} ${i.id} ${i.cargo} ${(i as any).numero_de_telefono || ""}`, searchInt)
  );

  const filteredAsig = asignaciones.filter((a) =>
    matchesSearch(
      `${a.apellidos} ${a.nombres} ${(a["Asignatura(s)"] || []).join(" ")} ${(a["Grado(s)"] || []).join(" ")}`,
      searchAsig
    )
  );

  const filteredPerf = perfiles.filter((p) =>
    matchesSearch(
      `${getPerfilDisplayName(p)} ${getPerfilDisplayCode(p)} ${p.perfil} ${p.contrasena || ""} ${p.numero_de_telefono || ""} ` +
      [1, 2, 3, 4].map((i) => {
        const q = p as any;
        return `${q[`acudido${i}_id`] || ""} ${q[`acudido${i}_nombre`] || ""} ${q[`acudido${i}_apellidos`] || ""} ${q[`acudido${i}_grado`] || ""} ${q[`acudido${i}_salon`] || ""}`;
      }).join(" "),
      searchPerf
    )
    && perfAcudidoMatch(p, filtroGradoPerf, filtroSalonPerf)
    && (filtroFotoPerf === "todos" || (filtroFotoPerf === "con" ? !!p.avatar_url : !p.avatar_url))
  );

  // Helper: render acudido fields for Asignacion dialog
  // Slot de acudido: se escribe el ID; el nombre/grado/salón se autocompletan
  // SOLO si ese id es un estudiante de este colegio (read-only). Si no matchea,
  // se muestra el error y el guardado se bloquea (validado en savePerfil).
  const renderHijoFields = (
    num: number,
    id: string, setId: (v: string) => void,
    nombre: string, setNombre: (v: string) => void,
    apellidos: string, setApellidos: (v: string) => void,
    grado: string, setGrado: (v: string) => void,
    salon: string, setSalon: (v: string) => void,
  ) => {
    const idLimpio = soloDigitos(id);
    const noEsEstudiante = idLimpio !== "" && !nombre.trim() && !apellidos.trim();
    return (
      <div key={num} className="border rounded-md p-3 space-y-2">
        <p className="text-sm font-medium">Acudido {num}{num === 1 ? "" : " (opcional)"}</p>
        <div className="space-y-1">
          <Label className="text-xs">ID del estudiante</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={id}
            onChange={(e) => {
              const v = soloDigitos(e.target.value);
              setId(v);
              autofillEstudianteFields(v, setNombre, setApellidos, setGrado, setSalon);
            }}
            placeholder="Escribe el id del estudiante"
          />
        </div>
        {idLimpio && !noEsEstudiante && (
          <div className="rounded-md bg-muted/40 p-2 text-sm">
            <div className="font-medium">{`${nombre} ${apellidos}`.trim()}</div>
            <div className="text-xs text-muted-foreground">{[grado, salon].filter(Boolean).join(" ") || "—"}</div>
          </div>
        )}
        {noEsEstudiante && (
          <p className="text-xs text-destructive">
            Ese id no es un estudiante de este colegio. Créalo primero en la pestaña Estudiantes.
          </p>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className={embedded ? "" : "min-h-screen bg-background flex flex-col"}>
      {!embedded && <HeaderNormi backLink="/dashboard-rector" />}

      <main className={embedded ? "" : "flex-1 container mx-auto p-4 md:p-8"}>
        {!embedded && (
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard-rector")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Panel de Control</span>
          </div>
        </div>
        )}

        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8">
          {!embedded && (
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
            Panel de Control
          </h2>
          )}

          <Tabs defaultValue={tabFija || "estudiantes"}>
            {/* En móvil scroll horizontal — los 5 tabs no caben en pantallas
                chicas. En sm+ vuelve al flex con ancho parejo. El wrapper
                usa margen negativo (-mx-6 / -mx-8) para que el scroll
                llegue hasta el borde de la card. */}
            {!embedded && (
            <div className="overflow-x-auto -mx-6 px-6 md:-mx-8 md:px-8 sm:mx-0 sm:px-0 mb-6">
              <TabsList className="inline-flex sm:flex sm:w-full">
                <TabsTrigger value="estudiantes" className="sm:flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Estudiantes</TabsTrigger>
                <TabsTrigger value="perfiles" className="sm:flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Acudientes</TabsTrigger>
                <TabsTrigger value="internos" className="sm:flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Internos</TabsTrigger>
                <TabsTrigger value="asignaciones" className="sm:flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Asignaciones</TabsTrigger>
                <TabsTrigger value="catalogo-asignaturas" className="sm:flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Asignaturas</TabsTrigger>
              </TabsList>
            </div>
            )}

            {/* ════════════════ TAB: ESTUDIANTES ════════════════ */}
            <TabsContent value="estudiantes">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre, id, grado..."
                    value={searchEst}
                    onChange={(e) => setSearchEst(e.target.value)}
                    className="pl-9 pr-9"
                  />
                  {searchEst && (
                    <button
                      type="button"
                      onClick={() => setSearchEst("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Button onClick={() => openEstDialog()}>
                  <Plus className="w-4 h-4 mr-2" /> Agregar
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Select value={filtroGradoEst} onValueChange={(v) => { setFiltroGradoEst(v); setFiltroSalonEst("todos"); }}>
                  <SelectTrigger className="sm:w-52"><SelectValue placeholder="Grado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los grados</SelectItem>
                    {gradosColegio.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filtroSalonEst} onValueChange={setFiltroSalonEst}>
                  <SelectTrigger className="sm:w-52"><SelectValue placeholder="Salón" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los salones</SelectItem>
                    {salonesParaGrado(filtroGradoEst).map((s) => <SelectItem key={s} value={s}>Salón {s}</SelectItem>)}
                  </SelectContent>
                </Select>
                {(
                  <Select value={filtroFotoEst} onValueChange={setFiltroFotoEst}>
                    <SelectTrigger className="sm:w-52"><SelectValue placeholder="Foto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="con">Con foto</SelectItem>
                      <SelectItem value="sin">Sin foto</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {loadingEst ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Foto</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Apellidos</TableHead>
                        <TableHead>Nombres</TableHead>
                        <TableHead>Grado</TableHead>
                        <TableHead>Salón</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Contraseña</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEst.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground">
                            No se encontraron estudiantes
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredEst.map((e: any) => (
                          <TableRow key={e.id}>
                            {renderFotoCell(e.avatar_url, `${e.nombres || ""} ${e.apellidos || ""}`)}
                            <TableCell className="font-mono">{e.id}</TableCell>
                            <TableCell>{e.apellidos}</TableCell>
                            <TableCell>{e.nombres}</TableCell>
                            <TableCell>{e.grado}</TableCell>
                            <TableCell>{e.salon}</TableCell>
                            <TableCell className="font-mono text-xs">{e.numero_de_telefono || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{e.contrasena || "—"}</TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button variant="ghost" size="sm" onClick={() => openEstDialog(e)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setShowDeleteEst(e)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ════════════════ TAB: INTERNOS ════════════════ */}
            <TabsContent value="internos">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre, id, cargo..."
                    value={searchInt}
                    onChange={(e) => setSearchInt(e.target.value)}
                    className="pl-9 pr-9"
                  />
                  {searchInt && (
                    <button
                      type="button"
                      onClick={() => setSearchInt("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Button onClick={() => openIntDialog()}>
                  <Plus className="w-4 h-4 mr-2" /> Agregar
                </Button>
              </div>

              {loadingInt ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Apellidos</TableHead>
                        <TableHead>Nombres</TableHead>
                        <TableHead>Cargo</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Contraseña</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInt.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            No se encontraron funcionarios
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInt.map((i: any) => (
                          <TableRow key={i.id}>
                            <TableCell className="font-mono">{i.id}</TableCell>
                            <TableCell>{i.apellidos}</TableCell>
                            <TableCell>{i.nombres}</TableCell>
                            <TableCell>{i.cargo}</TableCell>
                            <TableCell className="font-mono text-xs">{i.numero_de_telefono || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{i.contrasena || "—"}</TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button variant="ghost" size="sm" onClick={() => openIntDialog(i)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setShowDeleteInt(i)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ════════════════ TAB: ASIGNACIONES ════════════════ */}
            <TabsContent value="asignaciones">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre, asignatura, grado..."
                    value={searchAsig}
                    onChange={(e) => setSearchAsig(e.target.value)}
                    className="pl-9 pr-9"
                  />
                  {searchAsig && (
                    <button
                      type="button"
                      onClick={() => setSearchAsig("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Button onClick={() => openAsigDialog()}>
                  <Plus className="w-4 h-4 mr-2" /> Agregar
                </Button>
              </div>

              {loadingAsig ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Profesor</TableHead>
                        <TableHead>Asignatura(s)</TableHead>
                        <TableHead>Grado(s)</TableHead>
                        <TableHead>Salón(es)</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAsig.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No se encontraron asignaciones
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAsig.map((a) => (
                          <TableRow key={a.row_id}>
                            <TableCell className="whitespace-nowrap">
                              {a.apellidos} {a.nombres}
                            </TableCell>
                            <TableCell className="text-sm">
                              {(a["Asignatura(s)"] || []).join(", ")}
                            </TableCell>
                            <TableCell className="text-sm">
                              {(a["Grado(s)"] || []).join(", ")}
                            </TableCell>
                            <TableCell>
                              {(a["Salon(es)"] || []).join(", ")}
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button variant="ghost" size="sm" onClick={() => openAsigDialog(a)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setShowDeleteAsig(a)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ════════════════ TAB: PERFILES ════════════════ */}
            <TabsContent value="perfiles">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre, id, tipo..."
                    value={searchPerf}
                    onChange={(e) => setSearchPerf(e.target.value)}
                    className="pl-9 pr-9"
                  />
                  {searchPerf && (
                    <button
                      type="button"
                      onClick={() => setSearchPerf("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Button onClick={() => openPerfDialog()}>
                  <Plus className="w-4 h-4 mr-2" /> Agregar
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Select value={filtroGradoPerf} onValueChange={(v) => { setFiltroGradoPerf(v); setFiltroSalonPerf("todos"); }}>
                  <SelectTrigger className="sm:w-52"><SelectValue placeholder="Grado del acudido" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los grados</SelectItem>
                    {gradosColegio.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filtroSalonPerf} onValueChange={setFiltroSalonPerf}>
                  <SelectTrigger className="sm:w-52"><SelectValue placeholder="Salón del acudido" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los salones</SelectItem>
                    {salonesParaGrado(filtroGradoPerf).map((s) => <SelectItem key={s} value={s}>Salón {s}</SelectItem>)}
                  </SelectContent>
                </Select>
                {(
                  <Select value={filtroFotoPerf} onValueChange={setFiltroFotoPerf}>
                    <SelectTrigger className="sm:w-52"><SelectValue placeholder="Foto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="con">Con foto</SelectItem>
                      <SelectItem value="sin">Sin foto</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {loadingPerf ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Foto</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Apellidos</TableHead>
                        <TableHead>Nombres</TableHead>
                        <TableHead>Grado/Salón</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Contraseña</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPerf.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground">
                            No se encontraron acudientes
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPerf.map((p: any) => (
                          <TableRow key={p.padre_id || p.numero_de_telefono}>
                            {renderFotoCell(p.avatar_url, `${p.acudiente_nombres_only || ""} ${p.padre_apellidos_only || ""}`)}
                            <TableCell className="font-mono">{p.padre_id || "—"}</TableCell>
                            <TableCell>{p.padre_apellidos_only || "—"}</TableCell>
                            <TableCell>{p.acudiente_nombres_only || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {[
                                p.acudido1_grado && `${p.acudido1_grado} ${p.acudido1_salon || ""}`.trim(),
                                p.acudido2_grado && `${p.acudido2_grado} ${p.acudido2_salon || ""}`.trim(),
                                p.acudido3_grado && `${p.acudido3_grado} ${p.acudido3_salon || ""}`.trim(),
                                p.acudido4_grado && `${p.acudido4_grado} ${p.acudido4_salon || ""}`.trim(),
                              ].filter(Boolean).map((g, i) => <div key={i}>{g}</div>) || <span>—</span>}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{p.numero_de_telefono || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{p.contrasena || "—"}</TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button variant="ghost" size="sm" onClick={() => openPerfDialog(p)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setShowDeletePerf(p)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ════════════════ TAB: CATÁLOGO DE ASIGNATURAS ════════════════ */}
            <TabsContent value="catalogo-asignaturas">
              <CatalogoAsignaturas
                asignaturas={asignaturasTodas}
                onChange={refrescarAsignaturas}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOGS
          ═══════════════════════════════════════════════════════════════════ */}

      {/* ──── Dialog: Foto de perfil ampliada (tamaño real) ──── */}
      <Dialog open={!!fotoAmpliada} onOpenChange={(o) => { if (!o) setFotoAmpliada(null); }}>
        <DialogContent className="max-w-2xl p-3">
          <DialogHeader>
            <DialogTitle className="sr-only">Foto de perfil</DialogTitle>
          </DialogHeader>
          {fotoAmpliada && (
            <img
              src={fotoAmpliada}
              alt="Foto de perfil"
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ──── Dialog: Agregar/Editar Estudiante ──── */}
      <Dialog open={showEstDialog} onOpenChange={setShowEstDialog}>
        {/* Sin autofocus: el primer campo es la identificación y quedaba
            seleccionada al abrir — cualquier tecla la reemplazaba por error. */}
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {editingEst ? "Editar Estudiante" : "Agregar Estudiante"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cédula / ID estudiantil</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={estId}
                onChange={async (e) => {
                  const v = soloDigitos(e.target.value);
                  setEstId(v);
                  if (!editingEst) {
                    const existe = await autofillDesdeUsuarios(v, setEstNombre, setEstApellidos, setEstTelefono);
                    setEstUsuarioExiste(existe);
                  }
                }}
                placeholder="Ej: 1234567890"
              />
              {editingEst && (
                <p className="text-xs text-amber-600">Cambiar la identificación la migra en todo el sistema (notas, asistencia, vínculos, comunicados…).</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Apellidos</Label>
              <Input
                value={estApellidos}
                onChange={(e) => setEstApellidos(e.target.value)}
                placeholder="Apellidos del estudiante"
              />
            </div>
            <div className="space-y-2">
              <Label>Nombres</Label>
              <Input
                value={estNombre}
                onChange={(e) => setEstNombre(e.target.value)}
                placeholder="Nombres del estudiante"
              />
            </div>
            <div className="space-y-2">
              <Label>Teléfono <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <PhoneInput
                value={estTelefono}
                onChange={setEstTelefono}
                placeholder="Ej: 3001234567"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Grado</Label>
                <Select value={estGrado} onValueChange={setEstGrado} disabled={!!soloGrupo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {gradosColegio.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Salón</Label>
                <Select value={estSalon} onValueChange={setEstSalon} disabled={!!soloGrupo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {SALONES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {veContrasenas && (
              <div className="space-y-2">
                <Label>Contraseña <span className="text-xs text-muted-foreground">(solo lectura)</span></Label>
                <Input value={estContrasena} readOnly className="bg-muted" />
              </div>
            )}

            {editingEst && (() => {
              const acus = [
                { ced: estAcu1Cedula, nom: estAcu1Nombre, tel: estAcu1Tel },
                { ced: estAcu2Cedula, nom: estAcu2Nombre, tel: estAcu2Tel },
                { ced: estAcu3Cedula, nom: estAcu3Nombre, tel: estAcu3Tel },
              ].filter((a) => a.ced || a.nom);
              return (
                <div className="pt-2 border-t">
                  <h3 className="text-sm font-semibold mb-1">Acudientes de este estudiante</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Solo lectura. Para crear o editar acudientes usa la pestaña Acudientes.
                  </p>
                  {acus.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Este estudiante no tiene acudientes registrados.</p>
                  ) : (
                    <div className="space-y-2">
                      {acus.map((a, i) => (
                        <div key={i} className="rounded-md border bg-muted/30 p-2 text-sm">
                          <div className="font-medium">{a.nom || "Sin nombre"}</div>
                          <div className="text-xs text-muted-foreground">CC {a.ced || "—"} · Tel {a.tel || "—"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEstDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEstudiante} disabled={savingEst}>
              {savingEst && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──── Dialog: Confirmar eliminar Estudiante ──── */}
      <Dialog open={!!showDeleteEst} onOpenChange={() => setShowDeleteEst(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Estudiante</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de eliminar a{" "}
            <strong>
              {showDeleteEst?.apellidos} {showDeleteEst?.nombres}
            </strong>{" "}
            (id {showDeleteEst?.id})?
          </p>
          <p className="text-sm text-destructive font-medium">
            Se eliminarán TODAS las notas de este estudiante.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteEst(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={deleteEstudiante} disabled={savingEst}>
              {savingEst && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──── Dialog: Agregar/Editar Interno ──── */}
      <Dialog open={showIntDialog} onOpenChange={setShowIntDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {editingInt ? "Editar Funcionario" : "Agregar Funcionario"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ID</Label>
              <Input
                type="number"
                value={intId}
                onChange={(e) => setIntId(e.target.value)}
                placeholder="Ej: 12345"
              />
              {editingInt && (
                <p className="text-xs text-amber-600">Cambiar la identificación la migra en todo el sistema (asignaciones, comunicados…).</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Apellidos</Label>
              <Input
                value={intApellidos}
                onChange={(e) => setIntApellidos(e.target.value)}
                placeholder="Apellidos"
              />
            </div>
            <div className="space-y-2">
              <Label>Nombres</Label>
              <Input
                value={intNombres}
                onChange={(e) => setIntNombres(e.target.value)}
                placeholder="Nombres"
              />
            </div>
            <div className="space-y-2">
              <Label>Teléfono <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <PhoneInput
                value={intTelefono}
                onChange={setIntTelefono}
                placeholder="Ej: 3001234567"
              />
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Select value={intCargo} onValueChange={setIntCargo}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cargo" />
                </SelectTrigger>
                <SelectContent>
                  {CARGOS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {intCargo === "Coordinador(a)" && (
              <div className="space-y-2">
                <Label>Niveles que coordina</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(NIVELES_GRADOS).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setIntNiveles(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])}
                      className={`px-3 py-1.5 rounded-full border text-sm transition-colors cursor-pointer ${
                        intNiveles.includes(n)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:bg-muted/50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Las notificaciones de aula (permisos, excusas, etc.) solo le llegan en estos niveles. Sin selección = todos los niveles.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Contraseña {editingInt && "(dejar vacío para no cambiar)"}</Label>
              <Input
                value={intContrasena}
                onChange={(e) => setIntContrasena(e.target.value.slice(0, 50))}
                placeholder={editingInt ? "Nueva contraseña (opcional)" : "Contraseña"}
                maxLength={50}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIntDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveInterno} disabled={savingInt}>
              {savingInt && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──── Dialog: Confirmar eliminar Interno ──── */}
      <Dialog open={!!showDeleteInt} onOpenChange={() => setShowDeleteInt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Funcionario</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de eliminar a{" "}
            <strong>
              {showDeleteInt?.apellidos} {showDeleteInt?.nombres}
            </strong>{" "}
            (id {showDeleteInt?.id})?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteInt(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={deleteInterno} disabled={savingInt}>
              {savingInt && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──── Dialog: Agregar/Editar Asignación ──── */}
      <Dialog open={showAsigDialog} onOpenChange={setShowAsigDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {editingAsig ? "Editar Asignación" : "Agregar Asignación"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Seleccionar Profesor */}
            <div className="space-y-2">
              <Label>Profesor</Label>
              <Select value={asigProfesorId} onValueChange={handleSelectProfesor}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar profesor" />
                </SelectTrigger>
                <SelectContent>
                  {internos.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.apellidos} {i.nombres}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {asigNombres && (
                <p className="text-xs text-muted-foreground">
                  {asigApellidos} {asigNombres} — ID: {asigProfesorId || "sin id"}
                </p>
              )}
            </div>

            {/* Asignaturas */}
            <div className="space-y-2">
              <Label>
                Asignatura(s){" "}
                <span className="text-muted-foreground font-normal">
                  ({asigAsignaturas.length} seleccionadas)
                </span>
              </Label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ASIGNATURAS_NOMBRES.length === 0 ? (
                  <p className="text-sm text-muted-foreground col-span-full">
                    No hay asignaturas activas. Agrégalas en la pestaña "Asignaturas".
                  </p>
                ) : (
                  ASIGNATURAS_NOMBRES.map((a) => (
                    <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={asigAsignaturas.includes(a)}
                        onCheckedChange={() =>
                          setAsigAsignaturas(toggleItem(asigAsignaturas, a))
                        }
                      />
                      {a}
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Grados */}
            <div className="space-y-2">
              <Label>
                Grado(s){" "}
                <span className="text-muted-foreground font-normal">
                  ({asigGrados.length} seleccionados)
                </span>
              </Label>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
                {gradosColegio.map((g) => (
                  <label key={g} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={asigGrados.includes(g)}
                      onCheckedChange={() =>
                        setAsigGrados(toggleItem(asigGrados, g))
                      }
                    />
                    {g}
                  </label>
                ))}
              </div>
            </div>

            {/* Salones */}
            <div className="space-y-2">
              <Label>
                Salón(es){" "}
                <span className="text-muted-foreground font-normal">
                  ({asigSalones.length} seleccionados)
                </span>
              </Label>
              <div className="border rounded-md p-3 flex flex-wrap gap-4">
                {SALONES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={asigSalones.includes(s)}
                      onCheckedChange={() =>
                        setAsigSalones(toggleItem(asigSalones, s))
                      }
                    />
                    Salón {s}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAsigDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveAsignacion} disabled={savingAsig}>
              {savingAsig && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──── Dialog: Confirmar eliminar Asignación ──── */}
      <Dialog open={!!showDeleteAsig} onOpenChange={() => setShowDeleteAsig(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Asignación</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de eliminar la asignación de{" "}
            <strong>
              {showDeleteAsig?.apellidos} {showDeleteAsig?.nombres}
            </strong>
            ?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteAsig(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={deleteAsignacion} disabled={savingAsig}>
              {savingAsig && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──── Dialog: Agregar/Editar Perfil ──── */}
      <Dialog open={showPerfDialog} onOpenChange={setShowPerfDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {editingPerf ? "Editar Perfil" : "Agregar Perfil"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cédula del acudiente</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={perfPadreId}
                onChange={async (e) => {
                  const v = soloDigitos(e.target.value);
                  setPerfPadreId(v);
                  if (!editingPerf) {
                    const existe = await autofillDesdeUsuarios(v, setPerfPadreNombre, setPerfPadreApellidos, setPerfTelefono);
                    setPerfUsuarioExiste(existe);
                  }
                }}
                placeholder="Ej: 1234567890"
                readOnly={!!editingPerf && esProfesor}
                className={editingPerf && esProfesor ? "bg-muted" : ""}
              />
              {editingPerf && !esProfesor && (
                <p className="text-xs text-amber-600">Cambiar la identificación la migra en todo el sistema (vínculos, comunicados…).</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Apellidos</Label>
                <Input value={perfPadreApellidos} onChange={(e) => setPerfPadreApellidos(e.target.value)} placeholder="Apellidos" readOnly={(esProfesor && (perfUsuarioExiste || !!editingPerf))} className={(esProfesor && (perfUsuarioExiste || !!editingPerf)) ? "bg-muted" : ""} />
              </div>
              <div className="space-y-2">
                <Label>Nombres</Label>
                <Input value={perfPadreNombre} onChange={(e) => setPerfPadreNombre(e.target.value)} placeholder="Nombres" readOnly={(esProfesor && (perfUsuarioExiste || !!editingPerf))} className={(esProfesor && (perfUsuarioExiste || !!editingPerf)) ? "bg-muted" : ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Teléfono <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <PhoneInput
                value={perfTelefono}
                onChange={setPerfTelefono}
                disabled={(esProfesor && (perfUsuarioExiste || !!editingPerf))}
                placeholder="Ej: 3001234567"
              />
              {(esProfesor && (perfUsuarioExiste || !!editingPerf)) && (
                <p className="text-xs text-muted-foreground">Como director(a) de grupo puedes vincular o desvincular estudiantes, pero no modificar los datos del acudiente.</p>
              )}
            </div>

            <div className="pt-2 border-t space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Acudidos</h3>
                <p className="text-xs text-muted-foreground">
                  Hasta 4 estudiantes de este colegio. Al menos uno es obligatorio.
                </p>
              </div>
              {renderHijoFields(1,
                perfHijo1Id, setPerfHijo1Id,
                perfHijo1Nombre, setPerfHijo1Nombre,
                perfHijo1Apellidos, setPerfHijo1Apellidos,
                perfHijo1Grado, setPerfHijo1Grado,
                perfHijo1Salon, setPerfHijo1Salon,
              )}
              {slotsAcudidos >= 2 && renderHijoFields(2,
                perfHijo2Id, setPerfHijo2Id,
                perfHijo2Nombre, setPerfHijo2Nombre,
                perfHijo2Apellidos, setPerfHijo2Apellidos,
                perfHijo2Grado, setPerfHijo2Grado,
                perfHijo2Salon, setPerfHijo2Salon,
              )}
              {slotsAcudidos >= 3 && renderHijoFields(3,
                perfHijo3Id, setPerfHijo3Id,
                perfHijo3Nombre, setPerfHijo3Nombre,
                perfHijo3Apellidos, setPerfHijo3Apellidos,
                perfHijo3Grado, setPerfHijo3Grado,
                perfHijo3Salon, setPerfHijo3Salon,
              )}
              {slotsAcudidos >= 4 && renderHijoFields(4,
                perfHijo4Id, setPerfHijo4Id,
                perfHijo4Nombre, setPerfHijo4Nombre,
                perfHijo4Apellidos, setPerfHijo4Apellidos,
                perfHijo4Grado, setPerfHijo4Grado,
                perfHijo4Salon, setPerfHijo4Salon,
              )}
              {slotsAcudidos < 4 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setSlotsAcudidos((n) => Math.min(4, n + 1))} className="gap-1">
                  <Plus className="h-4 w-4" /> Agregar acudido
                </Button>
              )}
            </div>

            {veContrasenas && (
              <div className="space-y-2">
                <Label>Contraseña <span className="text-xs text-muted-foreground">(solo lectura)</span></Label>
                <Input value={perfContrasena} readOnly className="bg-muted" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPerfDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={savePerfil} disabled={savingPerf}>
              {savingPerf && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──── Dialog: Confirmar eliminar Perfil ──── */}
      <Dialog open={!!showDeletePerf} onOpenChange={() => setShowDeletePerf(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Perfil</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de eliminar el perfil de{" "}
            <strong>{showDeletePerf && getPerfilDisplayName(showDeletePerf)}</strong>
            {" "}({showDeletePerf?.perfil}, id: {showDeletePerf && getPerfilDisplayCode(showDeletePerf)})?
          </p>
          <p className="text-sm text-destructive font-medium">
            Este usuario ya no podrá iniciar sesión en la aplicación.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeletePerf(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={deletePerfil} disabled={savingPerf}>
              {savingPerf && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PanelControl;
