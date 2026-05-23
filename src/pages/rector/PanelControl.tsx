import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, puedeAccederDashboard } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { useAsignaturas } from "@/hooks/useAsignaturas";
import CatalogoAsignaturas from "@/components/CatalogoAsignaturas";

// ─── Enums ───────────────────────────────────────────────────────────────────

const GRADOS = [
  "Prejardín", "Jardín", "Transición",
  "Primero", "Segundo", "Tercero", "Cuarto", "Quinto",
  "Sexto", "Séptimo", "Octavo", "Noveno",
  "Décimo", "Undécimo",
];

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
  Preescolar: ["Prejardín", "Jardín", "Transición"],
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
}

interface Interno {
  id: number;
  nombres: string;
  apellidos: string;
  cargo: string;
  contrasena: string;
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
  const tokens = normalize(search).split(/\s+/).filter(Boolean);
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

const PanelControl = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Catálogo de asignaturas del colegio (vive en tabla Asignaturas).
  const {
    todas: asignaturasTodas,
    activas: asignaturasActivas,
    refrescar: refrescarAsignaturas,
  } = useAsignaturas();
  const ASIGNATURAS_NOMBRES = asignaturasActivas.map((a) => a.nombre);

  // Auth
  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    if (!puedeAccederDashboard()) { navigate("/dashboard"); return; }
  }, [navigate]);

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  // Estudiantes
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loadingEst, setLoadingEst] = useState(true);
  const [searchEst, setSearchEst] = useState("");
  const [showEstDialog, setShowEstDialog] = useState(false);
  const [editingEst, setEditingEst] = useState<Estudiante | null>(null);
  const [showDeleteEst, setShowDeleteEst] = useState<Estudiante | null>(null);
  const [savingEst, setSavingEst] = useState(false);
  const [estId, setEstId] = useState("");
  const [estNombre, setEstNombre] = useState("");
  const [estApellidos, setEstApellidos] = useState("");
  const [estGrado, setEstGrado] = useState("");
  const [estSalon, setEstSalon] = useState("");
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
  const [perfPadreId, setPerfPadreId] = useState("");
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
    const raw = await fetchAllPages((from, to) =>
      // Fase 10.E.19: nombres/apellidos/teléfono viven en Usuarios.
      supabase
        .from("Estudiantes")
        .select("id, nivel, grado, salon")
        .range(from, to)
    );
    const usrMap = await fetchUsuariosBatch(raw.map((e: any) => String(e.id)));
    const data: any[] = raw.map((e: any) => {
      const u = usrMap.get(String(e.id));
      return {
        ...e,
        nombres: u?.nombres || "",
        apellidos: u?.apellidos || "",
        numero_de_telefono: u?.tel || "",
        contrasena: u?.contrasena || "",
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
      supabase.from("Internos").select("id, cargo").range(from, to)
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
          .select("id, acudido1_id, acudido2_id, acudido3_id, acudido4_id")
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

      setPerfiles(perfilesConstruidos);
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
      setShowEstDialog(true);

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
    if (!estId || !estNombre || !estApellidos || !estGrado || !estSalon) {
      toast({ title: "Campos requeridos", description: "Completa todos los campos", variant: "destructive" });
      return;
    }
    const nivel = getNivelFromGrado(estGrado);
    if (!nivel) {
      toast({ title: "Error", description: "Grado inválido", variant: "destructive" });
      return;
    }

    // Fase 10.E.17: validar que cada acudiente con datos tenga cédula.
    // Sin cédula no se puede linkear correctamente en Usuarios + Acudientes.
    const acuInputs = [
      { ced: estAcu1Cedula, nom: estAcu1Nombre, tel: estAcu1Tel, label: "Acudiente 1" },
      { ced: estAcu2Cedula, nom: estAcu2Nombre, tel: estAcu2Tel, label: "Acudiente 2" },
      { ced: estAcu3Cedula, nom: estAcu3Nombre, tel: estAcu3Tel, label: "Acudiente 3" },
    ];
    for (const a of acuInputs) {
      const tieneAlgunDato = a.nom.trim() || a.tel.trim();
      if (tieneAlgunDato && !a.ced.trim()) {
        toast({
          title: "Falta la cédula del acudiente",
          description: `Para registrar a ${a.label} necesitas su cédula.`,
          variant: "destructive",
        });
        return;
      }
    }

    setSavingEst(true);
    const cleanPhone = (s: string) => {
      const first = s.split(",")[0]?.trim() || "";
      return first || null;
    };
    const splitName = (s: string): { nombres: string; apellidos: string } => {
      const t = s.trim().replace(/\s+/g, " ");
      if (!t) return { nombres: "", apellidos: "" };
      const parts = t.split(" ");
      if (parts.length <= 2) return { nombres: parts.join(" "), apellidos: "" };
      const apellidos = parts.slice(-2).join(" ");
      const nombres = parts.slice(0, -2).join(" ");
      return { nombres, apellidos };
    };

    // Dirty tracking: comparamos contra el snapshot tomado al abrir el modal
    // para decidir qué tablas tocar. Sin esto, cambiar grado/salón del
    // estudiante también reescribía Usuarios y Acudientes con los datos del
    // form (que aunque normalmente coinciden con DB, podían pisar cambios
    // hechos por el acudiente desde su sesión entre la apertura del modal y
    // el guardado).
    const snap = estSnapshot;
    const curEst = {
      id: estId,
      nombres: estNombre.trim(),
      apellidos: estApellidos.trim(),
      grado: estGrado,
      salon: estSalon,
    };
    const curAcus: [{ ced: string; nom: string; tel: string }, { ced: string; nom: string; tel: string }, { ced: string; nom: string; tel: string }] = [
      { ced: estAcu1Cedula.trim(), nom: estAcu1Nombre.trim(), tel: estAcu1Tel.trim() },
      { ced: estAcu2Cedula.trim(), nom: estAcu2Nombre.trim(), tel: estAcu2Tel.trim() },
      { ced: estAcu3Cedula.trim(), nom: estAcu3Nombre.trim(), tel: estAcu3Tel.trim() },
    ];
    const acuEmpty = (a: { ced: string; nom: string; tel: string }) => !a.ced && !a.nom && !a.tel;
    const acuEq = (a: { ced: string; nom: string; tel: string }, b: { ced: string; nom: string; tel: string }) =>
      a.ced === b.ced && a.nom === b.nom && a.tel === b.tel;
    const estCambio = !editingEst || !snap
      || snap.id !== curEst.id
      || snap.nombres !== curEst.nombres
      || snap.apellidos !== curEst.apellidos
      || snap.grado !== curEst.grado
      || snap.salon !== curEst.salon;

    // ── 1) Orden: primero Usuarios (donde viven nombres/apellidos del
    //       estudiante), después Estudiantes (solo id, nivel, grado, salon
    //       tras Fase 10.E.19). Si Estudiantes falla por id duplicado y el
    //       Usuario era nuevo, lo borramos para no dejarlo huérfano.
    if (estCambio) {
      const { data: existingUserEst } = await supabase
        .from("Usuarios").select("id").eq("id", estId).maybeSingle();
      const usuarioYaExistia = !!existingUserEst;

      const usuariosEstPayload: Record<string, unknown> = {
        id: estId,
        nombres: curEst.nombres,
        apellidos: curEst.apellidos,
      };
      if (!existingUserEst) usuariosEstPayload.contrasena = estId;
      const { error: errUsrEst } = await supabase
        .from("Usuarios")
        .upsert(usuariosEstPayload, { onConflict: "id" });
      if (errUsrEst) {
        setSavingEst(false);
        toast({
          title: "Error",
          description: errUsrEst.message || `No se pudo guardar el usuario (${(errUsrEst as any).code || "sin código"})`,
          variant: "destructive",
        });
        return;
      }

      const payload = {
        id: Number(estId),
        nivel: nivel,
        grado: estGrado,
        salon: estSalon,
      };
      let error: { message: string; code?: string } | null = null;
      if (editingEst) {
        ({ error } = await supabase.from("Estudiantes").update(payload).eq("id", editingEst.id));
      } else {
        ({ error } = await supabase.from("Estudiantes").insert(payload));
      }
      if (error) {
        if (!editingEst && !usuarioYaExistia) {
          await supabase.from("Usuarios").delete().eq("id", estId);
        }
        setSavingEst(false);
        if (error.code === "23505") {
          toast({ title: "Error", description: `Ya existe un estudiante con el id ${estId}`, variant: "destructive" });
        } else {
          toast({
            title: "Error",
            description: error.message || `No se pudo guardar el estudiante (${error.code || "sin código"})`,
            variant: "destructive",
          });
        }
        return;
      }
    }

    // ── 2) Para cada acudiente: decidir qué hacer según el diff vs snapshot
    //       (no escribir nada a Usuarios/Acudientes si no cambió ese slot)
    const snapAcus: [{ ced: string; nom: string; tel: string }, { ced: string; nom: string; tel: string }, { ced: string; nom: string; tel: string }] =
      snap?.acudientes ?? [
        { ced: "", nom: "", tel: "" },
        { ced: "", nom: "", tel: "" },
        { ced: "", nom: "", tel: "" },
      ];
    const algunAcuCambio = curAcus.some((c, i) => !acuEq(c, snapAcus[i]));

    if (algunAcuCambio) {
      try {
        // Fetch colegio_id una sola vez (solo si hay cambios reales en acudientes).
        const { data: estRow } = await supabase
          .from("Estudiantes")
          .select("colegio_id")
          .eq("id", Number(estId))
          .single();
        const colegioId = (estRow as any)?.colegio_id;
        const estNum = Number(estId);

        const desvincular = async (cedAcu: string) => {
          const { data: row } = await supabase
            .from("Acudientes")
            .select("id, acudido1_id, acudido2_id, acudido3_id, acudido4_id")
            .eq("id", cedAcu)
            .maybeSingle();
          if (!row) return;
          for (let i = 1; i <= 4; i++) {
            if ((row as any)[`acudido${i}_id`] === estNum) {
              await supabase.from("Acudientes").update({ [`acudido${i}_id`]: null }).eq("id", cedAcu);
              break;
            }
          }
        };

        const vincularYUpsert = async (a: { ced: string; nom: string; tel: string }) => {
          const { nombres, apellidos } = splitName(a.nom);
          const tel = cleanPhone(a.tel);
          const { data: existingUser } = await supabase
            .from("Usuarios").select("id").eq("id", a.ced).maybeSingle();
          const usuariosPayload: any = { id: a.ced, nombres, apellidos, numero_de_telefono: tel };
          if (!existingUser) usuariosPayload.contrasena = a.ced;
          await supabase.from("Usuarios").upsert(usuariosPayload, { onConflict: "id" });

          if (!colegioId) return;
          const { data: existingAcud } = await supabase
            .from("Acudientes")
            .select("id, acudido1_id, acudido2_id, acudido3_id, acudido4_id")
            .eq("id", a.ced)
            .maybeSingle();
          if (existingAcud) {
            const slots = [existingAcud.acudido1_id, existingAcud.acudido2_id, existingAcud.acudido3_id, existingAcud.acudido4_id];
            const yaTiene = slots.some((s: any) => s === estNum);
            if (!yaTiene) {
              const idxLibre = slots.findIndex((s: any) => s == null);
              if (idxLibre >= 0) {
                await supabase.from("Acudientes").update({ [`acudido${idxLibre + 1}_id`]: estNum }).eq("id", a.ced);
              } else {
                console.warn(`[saveEstudiante] El acudiente ${a.ced} ya tiene 4 acudidos, no se puede agregar a ${estNum}.`);
              }
            }
          } else {
            await supabase.from("Acudientes").upsert({
              id: a.ced, colegio_id: colegioId,
              acudido1_id: estNum, acudido2_id: null, acudido3_id: null, acudido4_id: null,
            }, { onConflict: "id,colegio_id" });
          }
        };

        const actualizarUsuario = async (a: { ced: string; nom: string; tel: string }) => {
          const { nombres, apellidos } = splitName(a.nom);
          const tel = cleanPhone(a.tel);
          await supabase.from("Usuarios").update({
            nombres, apellidos, numero_de_telefono: tel,
          }).eq("id", a.ced);
        };

        for (let i = 0; i < 3; i++) {
          const before = snapAcus[i];
          const after = curAcus[i];
          if (acuEq(before, after)) continue;  // nada cambió en este slot

          const beforeVacio = acuEmpty(before);
          const afterVacio = acuEmpty(after);

          if (beforeVacio && afterVacio) continue;

          if (beforeVacio && !afterVacio) {
            // Slot nuevo → crear/linkear el acudiente
            await vincularYUpsert(after);
          } else if (!beforeVacio && afterVacio) {
            // Slot quedó vacío → desvincular (no se borra el Usuarios)
            await desvincular(before.ced);
          } else if (before.ced === after.ced) {
            // Misma cédula, cambió nombre o teléfono → solo Usuarios
            await actualizarUsuario(after);
          } else {
            // Cédula cambió → desvincular el viejo y vincular el nuevo
            await desvincular(before.ced);
            await vincularYUpsert(after);
          }
        }
      } catch (e) {
        console.error("[saveEstudiante] Error escribiendo acudientes en modelo vivo:", e);
        // No bloqueamos el flujo: el estudiante ya quedó guardado.
      }
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
    } else {
      setEditingInt(null);
      setIntId("");
      setIntNombres("");
      setIntApellidos("");
      setIntCargo("");
      setIntContrasena("");
    }
    setShowIntDialog(true);
  };

  const saveInterno = async () => {
    if (!intId || !intNombres || !intApellidos || !intCargo) {
      toast({ title: "Campos requeridos", description: "Completa id, nombres, apellidos y cargo", variant: "destructive" });
      return;
    }

    setSavingInt(true);

    // Orden importante: primero Usuarios (donde viven nombres/apellidos/contrasena),
    // después Internos (solo id + cargo). Si falla Usuarios y va primero, no
    // queda un Interno huérfano sin datos. Si Internos falla por id duplicado,
    // borramos el Usuario que acabamos de crear si era nuevo (no había antes).
    const usuariosPayload: Record<string, unknown> = {
      id: intId,
      nombres: intNombres.trim(),
      apellidos: intApellidos.trim(),
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
      toast({
        title: "Error",
        description: errUsr.message || `No se pudo guardar el usuario (${(errUsr as any).code || "sin código"})`,
        variant: "destructive",
      });
      return;
    }

    // Internos: solo id + cargo (Fase 10.E.19 dropeó nombres/apellidos).
    const payload: Record<string, unknown> = {
      id: Number(intId),
      cargo: intCargo,
    };
    let error: any;
    if (editingInt) {
      ({ error } = await supabase
        .from("Internos")
        .update(payload)
        .eq("id", editingInt.id));
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

    // Cleanup: si el Usuario ya no es Estudiante, Acudiente ni Interno en
    // OTRO colegio, lo borramos para no dejar la cédula huérfana ocupada en
    // Usuarios. Multi-perfil por colegio: una persona puede mantenerse en
    // Usuarios si todavía tiene algún rol en algún colegio.
    try {
      const [estCheck, acuCheck, intCheck] = await Promise.all([
        supabase.from("Estudiantes").select("id").eq("id", internoId).limit(1),
        supabase.from("Acudientes").select("id").eq("id", internoIdStr).limit(1),
        supabase.from("Internos").select("id").eq("id", internoId).limit(1),
      ]);
      const tieneOtroRol = ((estCheck.data?.length || 0) > 0)
        || ((acuCheck.data?.length || 0) > 0)
        || ((intCheck.data?.length || 0) > 0);
      if (!tieneOtroRol) {
        await supabase.from("Usuarios").delete().eq("id", internoIdStr);
      }
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

  const openPerfDialog = (p?: Perfil) => {
    if (p) {
      setEditingPerf(p);
      setPerfTipo(p.perfil || "Estudiante");
      setPerfEstId(p.estudiante_id != null ? String(p.estudiante_id) : "");
      setPerfEstNombre(p.estudiante_nombre || "");
      setPerfEstApellidos(p.estudiante_apellidos || "");
      setPerfEstGrado(p.estudiante_grado || "");
      setPerfEstSalon(p.estudiante_salon || "");
      setPerfPadreNombre(p.acudiente_nombre || "");
      setPerfPadreId(p.padre_id || "");
      setPerfNumEst(p.numero_de_acudidos || "1 (uno)");
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
      setPerfContrasena(p.contrasena || "");
      setPerfTelefono(p.numero_de_telefono || "");
    } else {
      setEditingPerf(null);
      setPerfTipo("Estudiante");
      setPerfEstId(""); setPerfEstNombre(""); setPerfEstApellidos("");
      setPerfEstGrado(""); setPerfEstSalon("");
      setPerfPadreNombre(""); setPerfPadreId(""); setPerfNumEst("1 (uno)");
      setPerfHijo1Id(""); setPerfHijo1Nombre(""); setPerfHijo1Apellidos("");
      setPerfHijo1Grado(""); setPerfHijo1Salon("");
      setPerfHijo2Id(""); setPerfHijo2Nombre(""); setPerfHijo2Apellidos("");
      setPerfHijo2Grado(""); setPerfHijo2Salon("");
      setPerfHijo3Id(""); setPerfHijo3Nombre(""); setPerfHijo3Apellidos("");
      setPerfHijo3Grado(""); setPerfHijo3Salon("");
      setPerfHijo4Id(""); setPerfHijo4Nombre(""); setPerfHijo4Apellidos("");
      setPerfHijo4Grado(""); setPerfHijo4Salon("");
      setPerfContrasena("");
      setPerfTelefono("");
    }
    setShowPerfDialog(true);
  };

  const savePerfil = async () => {
    setSavingPerf(true);
    const tel = perfTelefono.trim();
    if (!tel) {
      toast({ title: "Campos requeridos", description: "Escribe el número de celular", variant: "destructive" });
      setSavingPerf(false);
      return;
    }
    const payload: Record<string, unknown> = {
      perfil: perfTipo,
      contrasena: perfContrasena || null,
      numero_de_telefono: tel,
    };

    if (perfTipo === "Estudiante") {
      if (!perfEstId || !perfEstNombre || !perfEstApellidos) {
        toast({ title: "Campos requeridos", description: "Completa id, nombres y apellidos del estudiante", variant: "destructive" });
        setSavingPerf(false);
        return;
      }
      const nivel = perfEstGrado ? getNivelFromGrado(perfEstGrado) : null;
      payload.estudiante_id = Number(perfEstId);
      payload.estudiante_nombre = perfEstNombre.trim();
      payload.estudiante_apellidos = perfEstApellidos.trim();
      payload.estudiante_nivel = nivel;
      payload.estudiante_grado = perfEstGrado || null;
      payload.estudiante_salon = perfEstSalon || null;
      // Clear padre fields
      payload.acudiente_nombre = null;
      payload.padre_id = null;
      payload.numero_de_acudidos = null;
      payload.acudido1_id = null;
      payload.acudido1_nombre = null;
      payload.acudido1_apellidos = null;
      payload.acudido1_nivel = null;
      payload.acudido1_grado = null;
      payload.acudido1_salon = null;
      payload.acudido2_id = null;
      payload.acudido2_nombre = null;
      payload.acudido2_apellidos = null;
      payload.acudido2_nivel = null;
      payload.acudido2_grado = null;
      payload.acudido2_salon = null;
      payload.acudido3_id = null;
      payload.acudido3_nombre = null;
      payload.acudido3_apellidos = null;
      payload.acudido3_nivel = null;
      payload.acudido3_grado = null;
      payload.acudido3_salon = null;
    } else {
      if (!perfPadreNombre) {
        toast({ title: "Campos requeridos", description: "Completa el nombre del acudiente", variant: "destructive" });
        setSavingPerf(false);
        return;
      }
      // Clear estudiante fields
      payload.estudiante_id = null;
      payload.estudiante_nombre = null;
      payload.estudiante_apellidos = null;
      payload.estudiante_nivel = null;
      payload.estudiante_grado = null;
      payload.estudiante_salon = null;
      payload.acudiente_nombre = perfPadreNombre.trim();
      payload.padre_id = perfPadreId || null;
      payload.numero_de_acudidos = perfNumEst;
      // Hijo 1
      const n1 = getNivelFromGrado(perfHijo1Grado);
      payload.acudido1_id = perfHijo1Id ? Number(perfHijo1Id) : null;
      payload.acudido1_nombre = perfHijo1Nombre || null;
      payload.acudido1_apellidos = perfHijo1Apellidos || null;
      payload.acudido1_nivel = n1;
      payload.acudido1_grado = perfHijo1Grado || null;
      payload.acudido1_salon = perfHijo1Salon || null;
      // Hijo 2
      const numEst = parseInt(perfNumEst);
      if (numEst >= 2) {
        const n2 = getNivelFromGrado(perfHijo2Grado);
        payload.acudido2_id = perfHijo2Id ? Number(perfHijo2Id) : null;
        payload.acudido2_nombre = perfHijo2Nombre || null;
        payload.acudido2_apellidos = perfHijo2Apellidos || null;
        payload.acudido2_nivel = n2;
        payload.acudido2_grado = perfHijo2Grado || null;
        payload.acudido2_salon = perfHijo2Salon || null;
      } else {
        payload.acudido2_id = null;
        payload.acudido2_nombre = null;
        payload.acudido2_apellidos = null;
        payload.acudido2_nivel = null;
        payload.acudido2_grado = null;
        payload.acudido2_salon = null;
      }
      // Hijo 3
      if (numEst >= 3) {
        const n3 = getNivelFromGrado(perfHijo3Grado);
        payload.acudido3_id = perfHijo3Id ? Number(perfHijo3Id) : null;
        payload.acudido3_nombre = perfHijo3Nombre || null;
        payload.acudido3_apellidos = perfHijo3Apellidos || null;
        payload.acudido3_nivel = n3;
        payload.acudido3_grado = perfHijo3Grado || null;
        payload.acudido3_salon = perfHijo3Salon || null;
      } else {
        payload.acudido3_id = null;
        payload.acudido3_nombre = null;
        payload.acudido3_apellidos = null;
        payload.acudido3_nivel = null;
        payload.acudido3_grado = null;
        payload.acudido3_salon = null;
      }
      // Hijo 4
      if (numEst >= 4) {
        const n4 = getNivelFromGrado(perfHijo4Grado);
        payload.acudido4_id = perfHijo4Id ? Number(perfHijo4Id) : null;
        payload.acudido4_nombre = perfHijo4Nombre || null;
        payload.acudido4_apellidos = perfHijo4Apellidos || null;
        payload.acudido4_nivel = n4;
        payload.acudido4_grado = perfHijo4Grado || null;
        payload.acudido4_salon = perfHijo4Salon || null;
      } else {
        payload.acudido4_id = null;
        payload.acudido4_nombre = null;
        payload.acudido4_apellidos = null;
        payload.acudido4_nivel = null;
        payload.acudido4_grado = null;
        payload.acudido4_salon = null;
      }
    }

    let error: { message: string } | null = null;

    // Escribir directamente al modelo nuevo (Usuarios + Estudiantes/Acudientes).
    if (!error) {
      try {
        if (perfTipo === "Estudiante" && perfEstId) {
          // Helper: separar nombres y apellidos para Usuarios global
          const usuariosPayload: any = {
            id: String(perfEstId),
            nombres: perfEstNombre.trim(),
            apellidos: perfEstApellidos.trim(),
            numero_de_telefono: tel,
          };
          if (perfContrasena) usuariosPayload.contrasena = perfContrasena;
          await supabase.from("Usuarios").upsert(usuariosPayload, { onConflict: "id" });
          // El teléfono ya quedó en Usuarios (Fase 10.E.15). Estudiantes ya no tiene esa columna.
        } else if ((perfTipo === "Acudiente") && perfPadreId) {
          // Separar nombres y apellidos heurísticamente (últimas 2 palabras = apellidos)
          const words = perfPadreNombre.trim().split(/\s+/);
          const nombres = words.length <= 2 ? words[0] : words.slice(0, -2).join(" ");
          const apellidos = words.length <= 1 ? "" : words.length === 2 ? words[1] : words.slice(-2).join(" ");
          const usuariosPayload: any = {
            id: perfPadreId,
            nombres,
            apellidos,
            numero_de_telefono: tel,
          };
          if (perfContrasena) usuariosPayload.contrasena = perfContrasena;
          await supabase.from("Usuarios").upsert(usuariosPayload, { onConflict: "id" });
          // Determinar colegio_id desde el primer acudido
          const refHijoId = perfHijo1Id ? Number(perfHijo1Id) : null;
          if (refHijoId) {
            const { data: refEst } = await supabase.from("Estudiantes")
              .select("colegio_id")
              .eq("id", refHijoId)
              .single();
            const colegio_id_acud = refEst?.colegio_id;
            if (colegio_id_acud) {
              const numH = parseInt(perfNumEst);
              const acudPayload: any = {
                id: perfPadreId,
                colegio_id: colegio_id_acud,
                acudido1_id: perfHijo1Id ? Number(perfHijo1Id) : null,
                acudido2_id: numH >= 2 && perfHijo2Id ? Number(perfHijo2Id) : null,
                acudido3_id: numH >= 3 && perfHijo3Id ? Number(perfHijo3Id) : null,
                acudido4_id: numH >= 4 && perfHijo4Id ? Number(perfHijo4Id) : null,
              };
              await supabase.from("Acudientes").upsert(acudPayload, { onConflict: "id,colegio_id" });
            }
          }
        }
      } catch (e) {
        console.error("[savePerfil dual-write] Error escribiendo modelo nuevo:", e);
        // No bloqueamos: el trigger DB también lo sincroniza
      }
    }

    setSavingPerf(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingPerf ? "Perfil actualizado" : "Perfil agregado" });
    setShowPerfDialog(false);
    fetchPerfiles();
  };

  const deletePerfil = async () => {
    if (!showDeletePerf) return;
    setSavingPerf(true);
    // Fase 10: eliminar también del modelo nuevo
    try {
      if (showDeletePerf.perfil === "Estudiante" && showDeletePerf.estudiante_id) {
        // Borrar la fila de Usuarios (la persona deja de poder loguearse) — el teléfono
        // vive en Usuarios desde la Fase 10.E.15.
        await supabase.from("Usuarios").delete().eq("id", String(showDeletePerf.estudiante_id));
      } else if ((showDeletePerf.perfil === "Acudiente") && showDeletePerf.padre_id) {
        // Para acudientes: borrar la fila en Acudientes y de Usuarios
        await supabase.from("Acudientes").delete().eq("id", showDeletePerf.padre_id);
        await supabase.from("Usuarios").delete().eq("id", showDeletePerf.padre_id);
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

  const filteredEst = estudiantes.filter((e) =>
    matchesSearch(
      `${e.apellidos} ${e.nombres} ${e.id} ${e.grado} ${e.salon}`,
      searchEst
    )
  );

  const filteredInt = internos.filter((i) =>
    matchesSearch(`${i.apellidos} ${i.nombres} ${i.id} ${i.cargo}`, searchInt)
  );

  const filteredAsig = asignaciones.filter((a) =>
    matchesSearch(
      `${a.apellidos} ${a.nombres} ${(a["Asignatura(s)"] || []).join(" ")} ${(a["Grado(s)"] || []).join(" ")}`,
      searchAsig
    )
  );

  const filteredPerf = perfiles.filter((p) =>
    matchesSearch(
      `${getPerfilDisplayName(p)} ${getPerfilDisplayCode(p)} ${p.perfil} ${p.contrasena || ""} ${p.numero_de_telefono || ""}`,
      searchPerf
    )
  );

  // Helper: render acudido fields for Asignacion dialog
  const renderHijoFields = (
    num: number,
    id: string, setId: (v: string) => void,
    nombre: string, setNombre: (v: string) => void,
    apellidos: string, setApellidos: (v: string) => void,
    grado: string, setGrado: (v: string) => void,
    salon: string, setSalon: (v: string) => void,
  ) => (
    <div key={num} className="border rounded-md p-3 space-y-3">
      <p className="text-sm font-medium">Acudido {num}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">ID</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={id}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              setId(v);
              autofillEstudianteFields(v, setNombre, setApellidos, setGrado, setSalon);
            }}
            placeholder="ID"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Nombre</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Apellidos</Label>
          <Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} placeholder="Apellidos" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Grado</Label>
          <Select value={grado} onValueChange={setGrado}>
            <SelectTrigger><SelectValue placeholder="Grado" /></SelectTrigger>
            <SelectContent>
              {GRADOS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Salón</Label>
          <Select value={salon} onValueChange={setSalon}>
            <SelectTrigger><SelectValue placeholder="Salón" /></SelectTrigger>
            <SelectContent>
              {SALONES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard-rector" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard-rector")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Panel de Control</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8">
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
            Panel de Control
          </h2>

          <Tabs defaultValue="estudiantes">
            {/* En móvil scroll horizontal — los 5 tabs no caben en pantallas
                chicas. En sm+ vuelve al flex con ancho parejo. El wrapper
                usa margen negativo (-mx-6 / -mx-8) para que el scroll
                llegue hasta el borde de la card. */}
            <div className="overflow-x-auto -mx-6 px-6 md:-mx-8 md:px-8 sm:mx-0 sm:px-0 mb-6">
              <TabsList className="inline-flex sm:flex sm:w-full">
                <TabsTrigger value="estudiantes" className="sm:flex-1">Estudiantes</TabsTrigger>
                <TabsTrigger value="perfiles" className="sm:flex-1">Acudientes</TabsTrigger>
                <TabsTrigger value="internos" className="sm:flex-1">Internos</TabsTrigger>
                <TabsTrigger value="asignaciones" className="sm:flex-1">Asignaciones</TabsTrigger>
                <TabsTrigger value="catalogo-asignaturas" className="sm:flex-1">Asignaturas</TabsTrigger>
              </TabsList>
            </div>

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

              {loadingEst ? (
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
                          <TableCell colSpan={8} className="text-center text-muted-foreground">
                            No se encontraron estudiantes
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredEst.map((e: any) => (
                          <TableRow key={e.id}>
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

              {loadingPerf ? (
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
                        <TableHead>Grado/Salón</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Contraseña</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPerf.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            No se encontraron acudientes
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPerf.map((p: any) => (
                          <TableRow key={p.padre_id || p.numero_de_telefono}>
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

      {/* ──── Dialog: Agregar/Editar Estudiante ──── */}
      <Dialog open={showEstDialog} onOpenChange={setShowEstDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEst ? "Editar Estudiante" : "Agregar Estudiante"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ID estudiantil</Label>
              <Input
                type="number"
                value={estId}
                onChange={(e) => setEstId(e.target.value)}
                placeholder="Ej: 12345"
                readOnly={!!editingEst}
                className={editingEst ? "bg-muted" : ""}
              />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Grado</Label>
                <Select value={estGrado} onValueChange={setEstGrado}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADOS.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Salón</Label>
                <Select value={estSalon} onValueChange={setEstSalon}>
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

            <div className="pt-2 border-t">
              <h3 className="text-sm font-semibold mb-2">Acudientes</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Cédula, nombre y teléfono por acudiente. La cédula es obligatoria
                para registrarlo en el sistema. Deja los campos vacíos si no aplica.
              </p>

              {[
                { label: "Acudiente 1", cedula: estAcu1Cedula, setCedula: setEstAcu1Cedula, nombre: estAcu1Nombre, setNombre: setEstAcu1Nombre, tel: estAcu1Tel, setTel: setEstAcu1Tel },
                { label: "Acudiente 2", cedula: estAcu2Cedula, setCedula: setEstAcu2Cedula, nombre: estAcu2Nombre, setNombre: setEstAcu2Nombre, tel: estAcu2Tel, setTel: setEstAcu2Tel },
                { label: "Acudiente 3", cedula: estAcu3Cedula, setCedula: setEstAcu3Cedula, nombre: estAcu3Nombre, setNombre: setEstAcu3Nombre, tel: estAcu3Tel, setTel: setEstAcu3Tel },
              ].map((a) => (
                <div key={a.label} className="grid grid-cols-3 gap-3 mb-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{a.label} · Cédula</Label>
                    <Input
                      value={a.cedula}
                      onChange={(e) => a.setCedula(e.target.value)}
                      placeholder="Cédula"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{a.label} · Nombre</Label>
                    <Input
                      value={a.nombre}
                      onChange={(e) => a.setNombre(e.target.value)}
                      placeholder="Nombre completo"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{a.label} · Teléfono</Label>
                    <Input
                      value={a.tel}
                      onChange={(e) => a.setTel(e.target.value)}
                      placeholder="Ej: 3001234567"
                    />
                  </div>
                </div>
              ))}
            </div>
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
                readOnly={!!editingInt}
                className={editingInt ? "bg-muted" : ""}
              />
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
            <div className="space-y-2">
              <Label>Contraseña {editingInt && "(dejar vacío para no cambiar)"}</Label>
              <Input
                value={intContrasena}
                onChange={(e) => setIntContrasena(e.target.value)}
                placeholder={editingInt ? "Nueva contraseña (opcional)" : "Contraseña"}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                {GRADOS.map((g) => (
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPerf ? "Editar Perfil" : "Agregar Perfil"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de perfil</Label>
              <Select value={perfTipo} onValueChange={setPerfTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Estudiante">Estudiante</SelectItem>
                  <SelectItem value="Acudiente">Acudiente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {perfTipo === "Estudiante" ? (
              <>
                <div className="space-y-2">
                  <Label>ID estudiantil</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={perfEstId}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      setPerfEstId(v);
                      autofillEstudianteFields(v, setPerfEstNombre, setPerfEstApellidos, setPerfEstGrado, setPerfEstSalon);
                    }}
                    placeholder="ID del estudiante"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input value={perfEstNombre} onChange={(e) => setPerfEstNombre(e.target.value)} placeholder="Nombre" />
                  </div>
                  <div className="space-y-2">
                    <Label>Apellidos</Label>
                    <Input value={perfEstApellidos} onChange={(e) => setPerfEstApellidos(e.target.value)} placeholder="Apellidos" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Grado</Label>
                    <Select value={perfEstGrado} onValueChange={setPerfEstGrado}>
                      <SelectTrigger><SelectValue placeholder="Grado" /></SelectTrigger>
                      <SelectContent>
                        {GRADOS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Salón</Label>
                    <Select value={perfEstSalon} onValueChange={setPerfEstSalon}>
                      <SelectTrigger><SelectValue placeholder="Salón" /></SelectTrigger>
                      <SelectContent>
                        {SALONES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nombre del acudiente</Label>
                    <Input value={perfPadreNombre} onChange={(e) => setPerfPadreNombre(e.target.value)} placeholder="Nombre del acudiente" />
                  </div>
                  <div className="space-y-2">
                    <Label>ID padre</Label>
                    <Input value={perfPadreId} onChange={(e) => setPerfPadreId(e.target.value)} placeholder="ID (opcional)" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Número de estudiantes</Label>
                  <Select value={perfNumEst} onValueChange={setPerfNumEst}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NUM_ESTUDIANTES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {renderHijoFields(1,
                  perfHijo1Id, setPerfHijo1Id,
                  perfHijo1Nombre, setPerfHijo1Nombre,
                  perfHijo1Apellidos, setPerfHijo1Apellidos,
                  perfHijo1Grado, setPerfHijo1Grado,
                  perfHijo1Salon, setPerfHijo1Salon,
                )}
                {parseInt(perfNumEst) >= 2 && renderHijoFields(2,
                  perfHijo2Id, setPerfHijo2Id,
                  perfHijo2Nombre, setPerfHijo2Nombre,
                  perfHijo2Apellidos, setPerfHijo2Apellidos,
                  perfHijo2Grado, setPerfHijo2Grado,
                  perfHijo2Salon, setPerfHijo2Salon,
                )}
                {parseInt(perfNumEst) >= 3 && renderHijoFields(3,
                  perfHijo3Id, setPerfHijo3Id,
                  perfHijo3Nombre, setPerfHijo3Nombre,
                  perfHijo3Apellidos, setPerfHijo3Apellidos,
                  perfHijo3Grado, setPerfHijo3Grado,
                  perfHijo3Salon, setPerfHijo3Salon,
                )}
                {parseInt(perfNumEst) >= 4 && renderHijoFields(4,
                  perfHijo4Id, setPerfHijo4Id,
                  perfHijo4Nombre, setPerfHijo4Nombre,
                  perfHijo4Apellidos, setPerfHijo4Apellidos,
                  perfHijo4Grado, setPerfHijo4Grado,
                  perfHijo4Salon, setPerfHijo4Salon,
                )}
              </>
            )}

            <div className="space-y-2">
              <Label>Celular</Label>
              <Input
                value={perfTelefono}
                onChange={(e) => setPerfTelefono(e.target.value)}
                placeholder="Número de celular"
              />
            </div>

            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input
                value={perfContrasena}
                onChange={(e) => setPerfContrasena(e.target.value)}
                placeholder="Contraseña"
              />
            </div>
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
