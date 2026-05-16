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
  "Secretaria General", "Portero", "Servicios Generales", "Administrador",
];

const ASIGNATURAS = [
  "Artística", "Ayudas Educativas", "Castellano", "Cátedra de Paz",
  "Ciencia Política", "Ciencias Naturales",
  "Ciencias Naturales y Educación Ambiental", "Ciencias Políticas",
  "Ciencias Sociales", "Didáctica Educación Artistica",
  "Didáctica Matemáticas", "Dimensión Cognitiva",
  "Dimensión Comunicativa", "Dimensión Corporal",
  "Dimensión de Ética y Valores", "Dimensión Estética",
  "Dimensión General", "Educación Artística", "Educación Física",
  "Estadística", "Ética", "Filosofía", "Física", "Geometría",
  "Informática", "Inglés", "Investigación Formativa",
  "Lectura Crítica", "Matemáticas", "MEF", "Pedagogía",
  "Práctica Pedagógica", "Psicología General", "Química",
  "Religión", "Tecnología", "Técnicas de PTE-TIC",
  "Uso pedagógico de tic",
];

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
  id_estudiantil: number;
  nombre_estudiante: string;
  apellidos_estudiante: string;
  nivel_estudiante: string;
  grado_estudiante: string;
  salon_estudiante: string;
  nombre_acudiente: string | null;
  telefono_acudiente: string[] | null;
  nombre_acudiente2: string | null;
  telefono_acudiente2: string[] | null;
  nombre_acudiente3: string | null;
  telefono_acudiente3: string[] | null;
}

interface Interno {
  id: number;
  nombres: string;
  apellidos: string;
  cargo: string;
  contrasena: string;
  numero_de_telefono: string;
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
  padre_nombre: string | null;
  padre_id: string | null;
  padre_numero_de_estudiantes: string | null;
  padre_estudiante1_id: number | null;
  padre_estudiante1_nombre: string | null;
  padre_estudiante1_apellidos: string | null;
  padre_estudiante1_nivel: string | null;
  padre_estudiante1_grado: string | null;
  padre_estudiante1_salon: string | null;
  padre_estudiante2_id: number | null;
  padre_estudiante2_nombre: string | null;
  padre_estudiante2_apellidos: string | null;
  padre_estudiante2_nivel: string | null;
  padre_estudiante2_grado: string | null;
  padre_estudiante2_salon: string | null;
  padre_estudiante3_id: number | null;
  padre_estudiante3_nombre: string | null;
  padre_estudiante3_apellidos: string | null;
  padre_estudiante3_nivel: string | null;
  padre_estudiante3_grado: string | null;
  padre_estudiante3_salon: string | null;
  padre_estudiante4_id: number | null;
  padre_estudiante4_nombre: string | null;
  padre_estudiante4_apellidos: string | null;
  padre_estudiante4_nivel: string | null;
  padre_estudiante4_grado: string | null;
  padre_estudiante4_salon: string | null;
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
  const [estAcu1Nombre, setEstAcu1Nombre] = useState("");
  const [estAcu1Tel, setEstAcu1Tel] = useState("");
  const [estAcu2Nombre, setEstAcu2Nombre] = useState("");
  const [estAcu2Tel, setEstAcu2Tel] = useState("");
  const [estAcu3Nombre, setEstAcu3Nombre] = useState("");
  const [estAcu3Tel, setEstAcu3Tel] = useState("");

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
    const est = estudiantes.find((e) => e.id_estudiantil === num);
    if (est) {
      setNombre(est.nombre_estudiante || "");
      setApellidos(est.apellidos_estudiante || "");
      setGrado(est.grado_estudiante || "");
      setSalon(est.salon_estudiante || "");
    } else {
      clear();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FETCH
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchEstudiantes = async () => {
    setLoadingEst(true);
    const data = await fetchAllPages((from, to) =>
      supabase
        .from("Estudiantes")
        .select("id_estudiantil, nombre_estudiante, apellidos_estudiante, nivel_estudiante, grado_estudiante, salon_estudiante, nombre_acudiente, telefono_acudiente, nombre_acudiente2, telefono_acudiente2, nombre_acudiente3, telefono_acudiente3")
        .order("apellidos_estudiante")
        .order("nombre_estudiante")
        .range(from, to)
    );
    setEstudiantes(data);
    setLoadingEst(false);
  };

  const fetchInternos = async () => {
    setLoadingInt(true);
    const data = await fetchAllPages((from, to) =>
      supabase.from("Internos").select("id, nombres, apellidos, cargo, contrasena, numero_de_telefono").range(from, to)
    );
    setInternos(data.sort((a, b) => (a.apellidos || "").localeCompare(b.apellidos || "", "es")));
    setLoadingInt(false);
  };

  const fetchAsignaciones = async () => {
    setLoadingAsig(true);
    const data = await fetchAllPages<Asignacion>((from, to) =>
      supabase.from("Asignación Profesores").select('row_id, nombres, apellidos, numero_de_telefono, id, "Asignatura(s)", "Grado(s)", "Salon(es)"').range(from, to)
    );
    setAsignaciones(data.sort((a, b) => (a.apellidos || "").localeCompare(b.apellidos || "", "es")));
    setLoadingAsig(false);
  };

  const fetchPerfiles = async () => {
    setLoadingPerf(true);
    const data = await fetchAllPages((from, to) =>
      supabase.from("Perfiles_Generales").select("*").order("numero_de_telefono").range(from, to)
    );
    setPerfiles(data);
    setLoadingPerf(false);
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

  const openEstDialog = (est?: Estudiante) => {
    if (est) {
      setEditingEst(est);
      setEstId(String(est.id_estudiantil));
      setEstNombre(est.nombre_estudiante || "");
      setEstApellidos(est.apellidos_estudiante || "");
      setEstGrado(est.grado_estudiante || "");
      setEstSalon(est.salon_estudiante || "");
      setEstAcu1Nombre(est.nombre_acudiente || "");
      setEstAcu1Tel((est.telefono_acudiente || []).join(", "));
      setEstAcu2Nombre(est.nombre_acudiente2 || "");
      setEstAcu2Tel((est.telefono_acudiente2 || []).join(", "));
      setEstAcu3Nombre(est.nombre_acudiente3 || "");
      setEstAcu3Tel((est.telefono_acudiente3 || []).join(", "));
    } else {
      setEditingEst(null);
      setEstId("");
      setEstNombre("");
      setEstApellidos("");
      setEstGrado("");
      setEstSalon("");
      setEstAcu1Nombre("");
      setEstAcu1Tel("");
      setEstAcu2Nombre("");
      setEstAcu2Tel("");
      setEstAcu3Nombre("");
      setEstAcu3Tel("");
    }
    setShowEstDialog(true);
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
    setSavingEst(true);
    const parseTelefonos = (s: string): string[] | null => {
      const arr = s.split(",").map(t => t.trim()).filter(Boolean);
      return arr.length > 0 ? arr : null;
    };
    const nullIfEmpty = (s: string) => (s.trim() ? s.trim() : null);
    const payload = {
      id_estudiantil: Number(estId),
      nombre_estudiante: estNombre.trim(),
      apellidos_estudiante: estApellidos.trim(),
      nivel_estudiante: nivel,
      grado_estudiante: estGrado,
      salon_estudiante: estSalon,
      nombre_acudiente: nullIfEmpty(estAcu1Nombre),
      telefono_acudiente: parseTelefonos(estAcu1Tel),
      nombre_acudiente2: nullIfEmpty(estAcu2Nombre),
      telefono_acudiente2: parseTelefonos(estAcu2Tel),
      nombre_acudiente3: nullIfEmpty(estAcu3Nombre),
      telefono_acudiente3: parseTelefonos(estAcu3Tel),
    };

    let error;
    if (editingEst) {
      ({ error } = await supabase
        .from("Estudiantes")
        .update(payload)
        .eq("id_estudiantil", editingEst.id_estudiantil));
    } else {
      ({ error } = await supabase.from("Estudiantes").insert(payload));
    }

    setSavingEst(false);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Error", description: `Ya existe un estudiante con el id ${estId}`, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      return;
    }
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
      .eq("id_estudiantil", showDeleteEst.id_estudiantil);
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
    if (!editingInt && !intContrasena) {
      toast({ title: "Campos requeridos", description: "La contraseña es requerida para nuevos funcionarios", variant: "destructive" });
      return;
    }

    setSavingInt(true);
    const payload: Record<string, unknown> = {
      id: Number(intId),
      nombres: intNombres.trim(),
      apellidos: intApellidos.trim(),
      cargo: intCargo,
    };
    if (intContrasena) payload.contrasena = intContrasena;

    let error;
    if (editingInt) {
      ({ error } = await supabase
        .from("Internos")
        .update(payload)
        .eq("id", editingInt.id));
    } else {
      ({ error } = await supabase.from("Internos").insert(payload));
    }

    setSavingInt(false);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Error", description: `Ya existe un funcionario con el id ${intId}`, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      return;
    }
    toast({ title: editingInt ? "Funcionario actualizado" : "Funcionario agregado" });
    setShowIntDialog(false);
    fetchInternos();
  };

  const deleteInterno = async () => {
    if (!showDeleteInt) return;
    setSavingInt(true);
    const { error } = await supabase
      .from("Internos")
      .delete()
      .eq("id", showDeleteInt.id);
    setSavingInt(false);
    if (error) {
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
      !asigApellidos ||
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
    const payload = {
      nombres: asigNombres.trim(),
      apellidos: asigApellidos.trim(),
      numero_de_telefono: asigId || null,
      id: asigProfesorId ? Number(asigProfesorId) : null,
      "Asignatura(s)": asigAsignaturas,
      "Grado(s)": asigGrados,
      "Salon(es)": asigSalones,
    };

    let error;
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      setPerfPadreNombre(p.padre_nombre || "");
      setPerfPadreId(p.padre_id || "");
      setPerfNumEst(p.padre_numero_de_estudiantes || "1 (uno)");
      setPerfHijo1Id(p.padre_estudiante1_id != null ? String(p.padre_estudiante1_id) : "");
      setPerfHijo1Nombre(p.padre_estudiante1_nombre || "");
      setPerfHijo1Apellidos(p.padre_estudiante1_apellidos || "");
      setPerfHijo1Grado(p.padre_estudiante1_grado || "");
      setPerfHijo1Salon(p.padre_estudiante1_salon || "");
      setPerfHijo2Id(p.padre_estudiante2_id != null ? String(p.padre_estudiante2_id) : "");
      setPerfHijo2Nombre(p.padre_estudiante2_nombre || "");
      setPerfHijo2Apellidos(p.padre_estudiante2_apellidos || "");
      setPerfHijo2Grado(p.padre_estudiante2_grado || "");
      setPerfHijo2Salon(p.padre_estudiante2_salon || "");
      setPerfHijo3Id(p.padre_estudiante3_id != null ? String(p.padre_estudiante3_id) : "");
      setPerfHijo3Nombre(p.padre_estudiante3_nombre || "");
      setPerfHijo3Apellidos(p.padre_estudiante3_apellidos || "");
      setPerfHijo3Grado(p.padre_estudiante3_grado || "");
      setPerfHijo3Salon(p.padre_estudiante3_salon || "");
      setPerfHijo4Id(p.padre_estudiante4_id != null ? String(p.padre_estudiante4_id) : "");
      setPerfHijo4Nombre(p.padre_estudiante4_nombre || "");
      setPerfHijo4Apellidos(p.padre_estudiante4_apellidos || "");
      setPerfHijo4Grado(p.padre_estudiante4_grado || "");
      setPerfHijo4Salon(p.padre_estudiante4_salon || "");
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
      payload.padre_nombre = null;
      payload.padre_id = null;
      payload.padre_numero_de_estudiantes = null;
      payload.padre_estudiante1_id = null;
      payload.padre_estudiante1_nombre = null;
      payload.padre_estudiante1_apellidos = null;
      payload.padre_estudiante1_nivel = null;
      payload.padre_estudiante1_grado = null;
      payload.padre_estudiante1_salon = null;
      payload.padre_estudiante2_id = null;
      payload.padre_estudiante2_nombre = null;
      payload.padre_estudiante2_apellidos = null;
      payload.padre_estudiante2_nivel = null;
      payload.padre_estudiante2_grado = null;
      payload.padre_estudiante2_salon = null;
      payload.padre_estudiante3_id = null;
      payload.padre_estudiante3_nombre = null;
      payload.padre_estudiante3_apellidos = null;
      payload.padre_estudiante3_nivel = null;
      payload.padre_estudiante3_grado = null;
      payload.padre_estudiante3_salon = null;
    } else {
      if (!perfPadreNombre) {
        toast({ title: "Campos requeridos", description: "Completa el nombre del padre", variant: "destructive" });
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
      payload.padre_nombre = perfPadreNombre.trim();
      payload.padre_id = perfPadreId || null;
      payload.padre_numero_de_estudiantes = perfNumEst;
      // Hijo 1
      const n1 = getNivelFromGrado(perfHijo1Grado);
      payload.padre_estudiante1_id = perfHijo1Id ? Number(perfHijo1Id) : null;
      payload.padre_estudiante1_nombre = perfHijo1Nombre || null;
      payload.padre_estudiante1_apellidos = perfHijo1Apellidos || null;
      payload.padre_estudiante1_nivel = n1;
      payload.padre_estudiante1_grado = perfHijo1Grado || null;
      payload.padre_estudiante1_salon = perfHijo1Salon || null;
      // Hijo 2
      const numEst = parseInt(perfNumEst);
      if (numEst >= 2) {
        const n2 = getNivelFromGrado(perfHijo2Grado);
        payload.padre_estudiante2_id = perfHijo2Id ? Number(perfHijo2Id) : null;
        payload.padre_estudiante2_nombre = perfHijo2Nombre || null;
        payload.padre_estudiante2_apellidos = perfHijo2Apellidos || null;
        payload.padre_estudiante2_nivel = n2;
        payload.padre_estudiante2_grado = perfHijo2Grado || null;
        payload.padre_estudiante2_salon = perfHijo2Salon || null;
      } else {
        payload.padre_estudiante2_id = null;
        payload.padre_estudiante2_nombre = null;
        payload.padre_estudiante2_apellidos = null;
        payload.padre_estudiante2_nivel = null;
        payload.padre_estudiante2_grado = null;
        payload.padre_estudiante2_salon = null;
      }
      // Hijo 3
      if (numEst >= 3) {
        const n3 = getNivelFromGrado(perfHijo3Grado);
        payload.padre_estudiante3_id = perfHijo3Id ? Number(perfHijo3Id) : null;
        payload.padre_estudiante3_nombre = perfHijo3Nombre || null;
        payload.padre_estudiante3_apellidos = perfHijo3Apellidos || null;
        payload.padre_estudiante3_nivel = n3;
        payload.padre_estudiante3_grado = perfHijo3Grado || null;
        payload.padre_estudiante3_salon = perfHijo3Salon || null;
      } else {
        payload.padre_estudiante3_id = null;
        payload.padre_estudiante3_nombre = null;
        payload.padre_estudiante3_apellidos = null;
        payload.padre_estudiante3_nivel = null;
        payload.padre_estudiante3_grado = null;
        payload.padre_estudiante3_salon = null;
      }
      // Hijo 4
      if (numEst >= 4) {
        const n4 = getNivelFromGrado(perfHijo4Grado);
        payload.padre_estudiante4_id = perfHijo4Id ? Number(perfHijo4Id) : null;
        payload.padre_estudiante4_nombre = perfHijo4Nombre || null;
        payload.padre_estudiante4_apellidos = perfHijo4Apellidos || null;
        payload.padre_estudiante4_nivel = n4;
        payload.padre_estudiante4_grado = perfHijo4Grado || null;
        payload.padre_estudiante4_salon = perfHijo4Salon || null;
      } else {
        payload.padre_estudiante4_id = null;
        payload.padre_estudiante4_nombre = null;
        payload.padre_estudiante4_apellidos = null;
        payload.padre_estudiante4_nivel = null;
        payload.padre_estudiante4_grado = null;
        payload.padre_estudiante4_salon = null;
      }
    }

    let error;
    if (editingPerf) {
      ({ error } = await supabase
        .from("Perfiles_Generales")
        .update(payload)
        .eq("numero_de_telefono", editingPerf.numero_de_telefono));
    } else {
      ({ error } = await supabase.from("Perfiles_Generales").insert(payload));
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
    const { error } = await supabase
      .from("Perfiles_Generales")
      .delete()
      .eq("numero_de_telefono", showDeletePerf.numero_de_telefono);
    setSavingPerf(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
    return p.padre_nombre || "Sin nombre";
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
      `${e.apellidos_estudiante} ${e.nombre_estudiante} ${e.id_estudiantil} ${e.grado_estudiante} ${e.salon_estudiante}`,
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

  // Helper: render hijo fields for Asignacion dialog
  const renderHijoFields = (
    num: number,
    id: string, setId: (v: string) => void,
    nombre: string, setNombre: (v: string) => void,
    apellidos: string, setApellidos: (v: string) => void,
    grado: string, setGrado: (v: string) => void,
    salon: string, setSalon: (v: string) => void,
  ) => (
    <div key={num} className="border rounded-md p-3 space-y-3">
      <p className="text-sm font-medium">Hijo {num}</p>
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
            <TabsList className="flex w-full mb-6">
              <TabsTrigger value="estudiantes" className="flex-1">Estudiantes</TabsTrigger>
              <TabsTrigger value="perfiles" className="flex-1">Perfiles registrados</TabsTrigger>
              <TabsTrigger value="internos" className="flex-1">Internos</TabsTrigger>
              <TabsTrigger value="asignaciones" className="flex-1">Asignaciones</TabsTrigger>
            </TabsList>

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
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEst.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            No se encontraron estudiantes
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredEst.map((e) => (
                          <TableRow key={e.id_estudiantil}>
                            <TableCell className="font-mono">{e.id_estudiantil}</TableCell>
                            <TableCell>{e.apellidos_estudiante}</TableCell>
                            <TableCell>{e.nombre_estudiante}</TableCell>
                            <TableCell>{e.grado_estudiante}</TableCell>
                            <TableCell>{e.salon_estudiante}</TableCell>
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
                        <TableHead>Contraseña</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInt.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            No se encontraron funcionarios
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInt.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell className="font-mono">{i.id}</TableCell>
                            <TableCell>{i.apellidos}</TableCell>
                            <TableCell>{i.nombres}</TableCell>
                            <TableCell>{i.cargo}</TableCell>
                            <TableCell className="text-muted-foreground">{i.contrasena}</TableCell>
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
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Grado/Salón</TableHead>
                        <TableHead>Contraseña</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPerf.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            No se encontraron perfiles
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPerf.map((p) => (
                          <TableRow key={p.numero_de_telefono}>
                            <TableCell className="font-mono text-xs">{p.numero_de_telefono}</TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                p.perfil === "Estudiante"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}>
                                {p.perfil}
                              </span>
                            </TableCell>
                            <TableCell>{getPerfilDisplayName(p)}</TableCell>
                            <TableCell className="font-mono">{getPerfilDisplayCode(p)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.perfil === "Estudiante"
                                ? `${p.estudiante_grado || ""} ${p.estudiante_salon || ""}`.trim() || "—"
                                : [
                                    p.padre_estudiante1_grado && `${p.padre_estudiante1_grado} ${p.padre_estudiante1_salon || ""}`.trim(),
                                    p.padre_estudiante2_grado && `${p.padre_estudiante2_grado} ${p.padre_estudiante2_salon || ""}`.trim(),
                                    p.padre_estudiante3_grado && `${p.padre_estudiante3_grado} ${p.padre_estudiante3_salon || ""}`.trim(),
                                    p.padre_estudiante4_grado && `${p.padre_estudiante4_grado} ${p.padre_estudiante4_salon || ""}`.trim(),
                                  ].filter(Boolean).map((g, i) => <div key={i}>{g}</div>) || "—"}
                            </TableCell>
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
          </Tabs>
        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOGS
          ═══════════════════════════════════════════════════════════════════ */}

      {/* ──── Dialog: Agregar/Editar Estudiante ──── */}
      <Dialog open={showEstDialog} onOpenChange={setShowEstDialog}>
        <DialogContent className="max-w-md">
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
                Para varios teléfonos en un mismo acudiente, sepáralos con coma.
                Deja los campos vacíos si no aplica.
              </p>

              {[
                { label: "Acudiente 1", nombre: estAcu1Nombre, setNombre: setEstAcu1Nombre, tel: estAcu1Tel, setTel: setEstAcu1Tel },
                { label: "Acudiente 2", nombre: estAcu2Nombre, setNombre: setEstAcu2Nombre, tel: estAcu2Tel, setTel: setEstAcu2Tel },
                { label: "Acudiente 3", nombre: estAcu3Nombre, setNombre: setEstAcu3Nombre, tel: estAcu3Tel, setTel: setEstAcu3Tel },
              ].map((a) => (
                <div key={a.label} className="grid grid-cols-2 gap-3 mb-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{a.label} · Nombre</Label>
                    <Input
                      value={a.nombre}
                      onChange={(e) => a.setNombre(e.target.value)}
                      placeholder="Nombre completo"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{a.label} · Teléfono(s)</Label>
                    <Input
                      value={a.tel}
                      onChange={(e) => a.setTel(e.target.value)}
                      placeholder="Ej: 3001234567, 3109876543"
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
              {showDeleteEst?.apellidos_estudiante} {showDeleteEst?.nombre_estudiante}
            </strong>{" "}
            (id {showDeleteEst?.id_estudiantil})?
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
        <DialogContent className="max-w-md">
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
                {ASIGNATURAS.map((a) => (
                  <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={asigAsignaturas.includes(a)}
                      onCheckedChange={() =>
                        setAsigAsignaturas(toggleItem(asigAsignaturas, a))
                      }
                    />
                    {a}
                  </label>
                ))}
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
                  <SelectItem value="Padre de familia">Padre de familia</SelectItem>
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
                    <Label>Nombre del padre</Label>
                    <Input value={perfPadreNombre} onChange={(e) => setPerfPadreNombre(e.target.value)} placeholder="Nombre del padre" />
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
