import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, hasValidSession, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import HeaderNormi from "@/components/HeaderNormi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Plus, Trash2, Users, Send, FileBarChart2, X } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";

interface ConsultaRow {
  id: number;
  titulo: string;
  opciones: string[];
  grados_objetivo: string[] | null;
  salones_objetivo: string[] | null;
  estudiantes_objetivo: number[] | null;
  cargos_objetivo: string[] | null;
  internos_objetivo: string[] | null;
  perfiles_objetivo: string[] | null;
  requiere_firma: boolean;
  creado_por: number;
  creado_por_nombre: string | null;
  creado_por_cargo: string | null;
  fecha_creacion: string;
  activa: boolean;
}

interface EstudianteRow {
  id: number;
  nombres: string | null;
  apellidos: string | null;
  grado: string | null;
  salon: string | null;
  nivel: string | null;
}

const GRADOS_ORDEN = [
  "Párvulo",
  "Prejardín",
  "Jardín",
  "Transición",
  "Primero",
  "Segundo",
  "Tercero",
  "Cuarto",
  "Quinto",
  "Sexto",
  "Séptimo",
  "Octavo",
  "Noveno",
  "Décimo",
  "Undécimo",
];


const NIVELES_GRADOS: Record<string, string[]> = {
  Preescolar: ["Párvulo", "Prejardín", "Jardín", "Transición"],
  Primaria: ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto"],
  Secundaria: ["Sexto", "Séptimo", "Octavo", "Noveno"],
  Media: ["Décimo", "Undécimo"],
};

type PerfilKey =
  | "Estudiantes"
  | "Padres"
  | "Profesores"
  | "Coordinadores"
  | "Rector"
  | "Administrativos"
  | "Secretaria"
  | "Orientador";

const PERFILES_UI: { key: PerfilKey; label: string; perfil: string }[] = [
  { key: "Estudiantes", label: "Estudiantes", perfil: "Estudiantes" },
  { key: "Padres", label: "Acudientes", perfil: "Acudientes" },
  { key: "Profesores", label: "Profesores", perfil: "Profesores" },
  { key: "Coordinadores", label: "Coordinadores", perfil: "Coordinadores" },
  { key: "Rector", label: "Rector", perfil: "Rector" },
  { key: "Administrativos", label: "Administrativos", perfil: "Administrativos" },
  { key: "Secretaria", label: "Secretaria General", perfil: "Secretaria General" },
  { key: "Orientador", label: "Orientador(a) Escolar", perfil: "Orientador(a) Escolar" },
];

// Mapea perfil canónico (el que viaja al server) → PerfilKey del UI.
function perfilToKey(perfil: string): PerfilKey {
  switch (perfil) {
    case "Profesores": return "Profesores";
    case "Coordinadores": return "Coordinadores";
    case "Rector": return "Rector";
    case "Administrativos": return "Administrativos";
    case "Secretaria General": return "Secretaria";
    case "Orientadores": return "Orientador";
    default: return "Estudiantes";
  }
}

// Webhooks viejos de n8n eliminados — todos los envíos van vía /api/comunicados/enviar.
const CONSULTAS_BASE = "https://notasnormi.com/consulta";

export default function Consultas() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<"listar" | "crear">("listar");
  const [consultas, setConsultas] = useState<ConsultaRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [titulo, setTitulo] = useState("");
  const [mensajeConsulta, setMensajeConsulta] = useState("");
  const [mensajeWhatsapp, setMensajeWhatsapp] = useState("");
  const [opciones, setOpciones] = useState<string[]>(["SÍ autorizo", "NO autorizo"]);
  const [requiereFirma, setRequiereFirma] = useState(true);

  // Selectores estilo Enviar Comunicado (8 perfiles)
  const [perfilesMarcados, setPerfilesMarcados] = useState<Record<PerfilKey, boolean>>({
    Estudiantes: false, Padres: false, Profesores: false, Coordinadores: false,
    Rector: false, Administrativos: false, Secretaria: false, Orientador: false,
  });
  const [nivelesMarcados, setNivelesMarcados] = useState<Record<string, boolean>>({});
  const [gradosMarcados, setGradosMarcados] = useState<Record<string, boolean>>({});
  const [salonesMarcados, setSalonesMarcados] = useState<Record<string, boolean>>({});
  const [estudiantesMarcados, setEstudiantesMarcados] = useState<Record<number, boolean>>({});

  // Listas de internos (cargadas on-demand)
  const [listaCoordinadores, setListaCoordinadores] = useState<{ id: string; nombre: string }[]>([]);
  const [listaAdministrativos, setListaAdministrativos] = useState<{ id: string; nombre: string }[]>([]);
  const [listaSecretarias, setListaSecretarias] = useState<{ id: string; nombre: string }[]>([]);
  const [listaOrientadores, setListaOrientadores] = useState<{ id: string; nombre: string }[]>([]);
  const [coordinadoresSeleccionados, setCoordinadoresSeleccionados] = useState<string[]>([]);
  const [administrativosSeleccionados, setAdministrativosSeleccionados] = useState<string[]>([]);
  const [secretariasSeleccionadas, setSecretariasSeleccionadas] = useState<string[]>([]);
  const [orientadoresSeleccionados, setOrientadoresSeleccionados] = useState<string[]>([]);
  const [loadingInternos, setLoadingInternos] = useState(false);

  // Profesores filtrados (por grado/salón)
  const [listaProfesoresFiltrada, setListaProfesoresFiltrada] = useState<{ id: string; nombre: string; grados: string[]; salones: string[] }[]>([]);
  const [profesoresSeleccionados, setProfesoresSeleccionados] = useState<string[]>([]);
  const [loadingListaProfesores, setLoadingListaProfesores] = useState(false);
  const [mostrarProfesores, setMostrarProfesores] = useState(false);

  // Lista base de estudiantes del/los grado(s) seleccionado(s) — sin filtrar por salón.
  // Se usa para derivar qué salones mostrar en el selector.
  const [estudiantesDelGrado, setEstudiantesDelGrado] = useState<EstudianteRow[]>([]);
  const [loadingEst, setLoadingEst] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mostrarSalones, setMostrarSalones] = useState(false);
  const [mostrarEstudiantes, setMostrarEstudiantes] = useState(false);

  useEffect(() => {
    if (!hasValidSession()) {
      navigate("/");
      return;
    }
    const session = getSession();
    if (!session.cargo || session.cargo === "Acudiente" || session.cargo === "Estudiante") {
      navigate("/");
      return;
    }
    cargarConsultas();
  }, [navigate]);

  // Mapa de consultaId → estado de respuesta del usuario actual (si es interno target)
  const [miRespuestaPorConsulta, setMiRespuestaPorConsulta] = useState<Record<number, "respondida" | "pendiente">>({});

  const cargarConsultas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("Consultas" as any)
      .select("*")
      .order("fecha_creacion", { ascending: false });
    if (error) {
      toast({ title: "Error cargando consultas", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const lista = (data || []) as unknown as ConsultaRow[];
    setConsultas(lista);

    // Detectar consultas que le toca responder al usuario actual.
    // Compat: las viejas usan cargos_objetivo con etiquetas (Coordinadores/Secretarias/...).
    // Nuevas usan perfiles_objetivo con valores tipo Comunicados (Coordinadores/Secretaria General/Orientador(a) Escolar/...).
    const session = getSession();
    const cargoUsuario = session.cargo || "";
    const cargoToLabelMap: Record<string, string> = {
      "Rector": "Rector",
      "Coordinador(a)": "Coordinadores",
      "Profesor(a)": "Profesores",
      "Secretaria General": "Secretarias",
      "Administrativo(a)": "Administrativos",
      "Administrador": "Administrativos",
    };
    const cargoToPerfilMap: Record<string, string> = {
      "Rector": "Rector",
      "Coordinador(a)": "Coordinadores",
      "Profesor(a)": "Profesores",
      "Secretaria General": "Secretaria General",
      "Administrativo(a)": "Administrativos",
      "Administrador": "Administrativos",
      "Orientador(a) Escolar": "Orientador(a) Escolar",
    };
    const miLabelLegacy = cargoToLabelMap[cargoUsuario];
    const miPerfilNuevo = cargoToPerfilMap[cargoUsuario];
    const internoIdStr = session.id ? String(session.id) : "";
    const consultasParaResponder = lista.filter((c) => {
      // Esquema viejo
      if (miLabelLegacy && Array.isArray(c.cargos_objetivo) && c.cargos_objetivo.includes(miLabelLegacy)) return true;
      // Esquema nuevo por perfil
      if (miPerfilNuevo && Array.isArray(c.perfiles_objetivo) && c.perfiles_objetivo.includes(miPerfilNuevo)) {
        // Si hay ids específicos de internos, exigir match. Si no, todos los del perfil aplican.
        if (Array.isArray(c.internos_objetivo) && c.internos_objetivo.length > 0) {
          return c.internos_objetivo.includes(internoIdStr);
        }
        return true;
      }
      return false;
    });

    if (consultasParaResponder.length > 0 && session.id) {
      const ids = consultasParaResponder.map((c) => c.id);
      const { data: misResp } = await supabase
        .from("Consultas_Respuestas" as any)
        .select("consulta_id, opcion_seleccionada")
        .eq("padre_id", String(session.id))
        .is("estudiante_id", null)
        .in("consulta_id", ids);
      const mapa: Record<number, "respondida" | "pendiente"> = {};
      consultasParaResponder.forEach((c) => {
        const r = (misResp || []).find((x: any) => Number(x.consulta_id) === c.id);
        mapa[c.id] = r && r.opcion_seleccionada ? "respondida" : "pendiente";
      });
      setMiRespuestaPorConsulta(mapa);
    } else {
      setMiRespuestaPorConsulta({});
    }
    setLoading(false);
  };

  useEffect(() => {
    const gradosSel = Object.keys(gradosMarcados).filter((g) => gradosMarcados[g]);
    if (gradosSel.length === 0) {
      setEstudiantesDelGrado([]);
      return;
    }
    setLoadingEst(true);
    (async () => {
      // Fase 10.E.19: nombres/apellidos viven en Usuarios.
      const { data, error } = await supabase
        .from("Estudiantes")
        .select("id, grado, salon, nivel")
        .in("grado", gradosSel as any);
      if (!error && data) {
        const { enrichWithNombres } = await import("@/lib/nombresUsuarios");
        setEstudiantesDelGrado(await enrichWithNombres(data as any) as EstudianteRow[]);
      }
      setLoadingEst(false);
    })();
  }, [gradosMarcados]);

  // Cargar profesores filtrados por grado/salón cuando perfil Profesores está marcado
  useEffect(() => {
    if (!perfilesMarcados.Profesores) {
      setListaProfesoresFiltrada([]);
      setProfesoresSeleccionados([]);
      setMostrarProfesores(false);
      return;
    }
    const gradosSel = Object.keys(gradosMarcados).filter((g) => gradosMarcados[g]);
    const salonesSel = Object.keys(salonesMarcados).filter((s) => salonesMarcados[s]);
    const fetchProfes = async () => {
      setLoadingListaProfesores(true);
      // Fase 10.E.19: nombres/apellidos viven en Usuarios.
      const { data: rawData } = await supabase
        .from("Asignación Profesores")
        .select('id, "Grado(s)", "Salon(es)"');
      const { enrichWithNombres } = await import("@/lib/nombresUsuarios");
      const data = await enrichWithNombres((rawData || []) as any);
      const filtered = (data || []).filter((r: any) => {
        const grados = (r["Grado(s)"] as string[]) || [];
        const salones = (r["Salon(es)"] as string[]) || [];
        if (gradosSel.length > 0 && !gradosSel.some((g) => grados.includes(g))) return false;
        if (salonesSel.length > 0 && !salonesSel.some((s) => salones.includes(s))) return false;
        return true;
      });
      const byId = new Map<string, { id: string; nombre: string; grados: string[]; salones: string[] }>();
      for (const r of filtered as any[]) {
        const rid = String(r.id);
        if (!byId.has(rid)) {
          byId.set(rid, {
            id: rid,
            nombre: `${r.apellidos || ""} ${r.nombres || ""}`.trim(),
            grados: [...((r["Grado(s)"] as string[]) || [])],
            salones: [...((r["Salon(es)"] as string[]) || [])],
          });
        } else {
          const existing = byId.get(rid)!;
          for (const g of ((r["Grado(s)"] as string[]) || [])) if (!existing.grados.includes(g)) existing.grados.push(g);
          for (const s of ((r["Salon(es)"] as string[]) || [])) if (!existing.salones.includes(s)) existing.salones.push(s);
        }
      }
      const list = [...byId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
      setListaProfesoresFiltrada(list);
      setProfesoresSeleccionados((prev) => prev.filter((id) => byId.has(id)));
      setLoadingListaProfesores(false);
    };
    fetchProfes();
  }, [gradosMarcados, salonesMarcados, perfilesMarcados.Profesores]);

  // Cargar 4 listas de internos (Coord/Admin/Secre/Orient) cuando alguno de esos perfiles se marca
  useEffect(() => {
    const necesita =
      perfilesMarcados.Coordinadores || perfilesMarcados.Administrativos || perfilesMarcados.Secretaria || perfilesMarcados.Orientador;
    if (!necesita) return;
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
      setListaCoordinadores(rows.filter((r: any) => r.cargo === "Coordinador(a)").map((r: any) => ({ id: String(r.id), nombre: `${r.apellidos} ${r.nombres}` })));
      setListaAdministrativos(rows.filter((r: any) => r.cargo === "Administrativo(a)").map((r: any) => ({ id: String(r.id), nombre: `${r.apellidos} ${r.nombres}` })));
      setListaSecretarias(rows.filter((r: any) => r.cargo === "Secretaria General").map((r: any) => ({ id: String(r.id), nombre: `${r.apellidos} ${r.nombres}` })));
      setListaOrientadores(rows.filter((r: any) => r.cargo === "Orientador(a) Escolar").map((r: any) => ({ id: String(r.id), nombre: `${r.apellidos} ${r.nombres}` })));
      setLoadingInternos(false);
    };
    fetchInternos();
  }, [perfilesMarcados, listaCoordinadores.length, listaAdministrativos.length, listaSecretarias.length, listaOrientadores.length]);

  // Lista filtrada por salón — la que se muestra en el paso "Estudiantes específicos".
  const estudiantesDisponibles = useMemo(() => {
    const salonesSel = Object.keys(salonesMarcados).filter((s) => salonesMarcados[s]);
    if (salonesSel.length === 0) return estudiantesDelGrado;
    return estudiantesDelGrado.filter((e) =>
      e.salon && salonesSel.includes(String(e.salon))
    );
  }, [estudiantesDelGrado, salonesMarcados]);

  useEffect(() => {
    const disponiblesIds = new Set(estudiantesDisponibles.map((e) => e.id));
    setEstudiantesMarcados((prev) => {
      const next: Record<number, boolean> = {};
      Object.keys(prev).forEach((k) => {
        const idNum = Number(k);
        if (disponiblesIds.has(idNum) && prev[idNum]) next[idNum] = true;
      });
      return next;
    });
  }, [estudiantesDisponibles]);

  const agregarOpcion = () => {
    if (opciones.length < 4) setOpciones([...opciones, ""]);
  };
  const quitarOpcion = (idx: number) => {
    if (opciones.length > 1) setOpciones(opciones.filter((_, i) => i !== idx));
  };
  const updateOpcion = (idx: number, val: string) => {
    setOpciones(opciones.map((o, i) => (i === idx ? val : o)));
  };

  const resetForm = () => {
    setTitulo("");
    setMensajeConsulta("");
    setMensajeWhatsapp("");
    setOpciones(["SÍ autorizo", "NO autorizo"]);
    setRequiereFirma(true);
    setPerfilesMarcados({
      Estudiantes: false, Padres: false, Profesores: false, Coordinadores: false,
      Rector: false, Administrativos: false, Secretaria: false, Orientador: false,
    });
    setNivelesMarcados({});
    setGradosMarcados({});
    setSalonesMarcados({});
    setEstudiantesMarcados({});
    setProfesoresSeleccionados([]);
    setCoordinadoresSeleccionados([]);
    setAdministrativosSeleccionados([]);
    setSecretariasSeleccionadas([]);
    setOrientadoresSeleccionados([]);
    setMostrarSalones(false);
    setMostrarEstudiantes(false);
    setMostrarProfesores(false);
  };

  const togglePerfil = (key: PerfilKey) => {
    setPerfilesMarcados((prev) => {
      const nuevo = { ...prev, [key]: !prev[key] };
      if (!nuevo[key]) {
        if (key === "Coordinadores") setCoordinadoresSeleccionados([]);
        if (key === "Administrativos") setAdministrativosSeleccionados([]);
        if (key === "Secretaria") setSecretariasSeleccionadas([]);
        if (key === "Orientador") setOrientadoresSeleccionados([]);
        if (key === "Profesores") { setProfesoresSeleccionados([]); setMostrarProfesores(false); }
        if (!nuevo.Estudiantes && !nuevo.Padres && !nuevo.Profesores) {
          setNivelesMarcados({});
          setGradosMarcados({});
          setSalonesMarcados({});
          setEstudiantesMarcados({});
          setMostrarSalones(false);
          setMostrarEstudiantes(false);
        }
      }
      return nuevo;
    });
  };

  const toggleInterno = (lista: string[], id: string, setter: (v: string[]) => void) => {
    setter(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  };

  const gradosSeleccionados = useMemo(
    () => Object.keys(gradosMarcados).filter((g) => gradosMarcados[g]),
    [gradosMarcados]
  );
  const salonesSeleccionados = useMemo(
    () => Object.keys(salonesMarcados).filter((s) => salonesMarcados[s]),
    [salonesMarcados]
  );
  const nivelesSeleccionados = useMemo(
    () => Object.keys(nivelesMarcados).filter((n) => nivelesMarcados[n]),
    [nivelesMarcados]
  );
  const estudiantesSeleccionados = useMemo(
    () => Object.keys(estudiantesMarcados).filter((id) => estudiantesMarcados[Number(id)]).map(Number),
    [estudiantesMarcados]
  );
  const hayPadresEnDestinatarios = perfilesMarcados.Padres || perfilesMarcados.Estudiantes;
  const hayInternosEnDestinatarios =
    perfilesMarcados.Rector || perfilesMarcados.Coordinadores || perfilesMarcados.Administrativos ||
    perfilesMarcados.Secretaria || perfilesMarcados.Orientador || perfilesMarcados.Profesores;

  const listaANombres = (ids: string[], lista: { id: string; nombre: string }[]) =>
    ids.map((id) => lista.find((x) => x.id === id)?.nombre).filter(Boolean) as string[];

  const aulaFrase = (prefijo: string): string => {
    const gs = gradosSeleccionados;
    const ss = salonesSeleccionados;
    if (gs.length === 0) return prefijo;
    if (ss.length === 0) return `${prefijo} de ${gs.join(", ")}`;
    if (gs.length === 1 && ss.length === 1) return `${prefijo} de ${gs[0]} ${ss[0]}`;
    if (gs.length === 1 && ss.length > 1) return `${prefijo} de ${gs[0]} salones ${ss.join(", ")}`;
    if (gs.length > 1 && ss.length === 1) return `${prefijo} de ${gs.map((g) => `${g} ${ss[0]}`).join(", ")}`;
    return `${prefijo} de los grados ${gs.join(", ")} salones ${ss.join(", ")}`;
  };

  const buildDestinatariosTexto = (): string => {
    const partes: string[] = [];

    // Estudiantes
    if (perfilesMarcados.Estudiantes) {
      if (estudiantesSeleccionados.length > 0) {
        partes.push(
          estudiantesSeleccionados.length === 1
            ? `Estudiante con id ${estudiantesSeleccionados[0]}`
            : `Estudiantes con id: ${estudiantesSeleccionados.join(", ")}`
        );
      } else {
        partes.push(aulaFrase("Estudiantes"));
      }
    }

    // Padres
    if (perfilesMarcados.Padres) {
      if (estudiantesSeleccionados.length > 0 && !perfilesMarcados.Estudiantes) {
        partes.push(
          estudiantesSeleccionados.length === 1
            ? `Acudientes del estudiante con id ${estudiantesSeleccionados[0]}`
            : `Acudientes de los estudiantes con id: ${estudiantesSeleccionados.join(", ")}`
        );
      } else if (estudiantesSeleccionados.length > 0 && perfilesMarcados.Estudiantes) {
        partes.push(
          estudiantesSeleccionados.length === 1
            ? `Acudientes del estudiante con id ${estudiantesSeleccionados[0]}`
            : `Acudientes de los estudiantes con id: ${estudiantesSeleccionados.join(", ")}`
        );
      } else {
        partes.push(aulaFrase("Acudientes"));
      }
    }

    // Profesores
    if (perfilesMarcados.Profesores) {
      if (profesoresSeleccionados.length > 0) {
        const nombres = listaANombres(profesoresSeleccionados, listaProfesoresFiltrada);
        partes.push(nombres.length === 1 ? `Profesor(a) ${nombres[0]}` : `Profesores ${nombres.join(", ")}`);
      } else if (gradosSeleccionados.length > 0 || salonesSeleccionados.length > 0) {
        partes.push(aulaFrase("Profesores"));
      } else {
        partes.push("Profesores");
      }
    }

    if (perfilesMarcados.Coordinadores) {
      if (coordinadoresSeleccionados.length === 0) partes.push("Coordinadores");
      else {
        const nombres = listaANombres(coordinadoresSeleccionados, listaCoordinadores);
        partes.push(nombres.length === 1 ? `Coordinador(a) ${nombres[0]}` : `Coordinadores ${nombres.join(", ")}`);
      }
    }
    if (perfilesMarcados.Rector) partes.push("Rector");
    if (perfilesMarcados.Administrativos) {
      if (administrativosSeleccionados.length === 0) partes.push("Administrativos");
      else {
        const nombres = listaANombres(administrativosSeleccionados, listaAdministrativos);
        partes.push(nombres.length === 1 ? `Administrativo(a) ${nombres[0]}` : `Administrativos ${nombres.join(", ")}`);
      }
    }
    if (perfilesMarcados.Secretaria) {
      if (secretariasSeleccionadas.length === 0) partes.push("Secretaria General");
      else {
        const nombres = listaANombres(secretariasSeleccionadas, listaSecretarias);
        partes.push(nombres.length === 1 ? `Secretaria ${nombres[0]}` : `Secretarias ${nombres.join(", ")}`);
      }
    }
    if (perfilesMarcados.Orientador) {
      if (orientadoresSeleccionados.length === 0) partes.push("Orientador(a) Escolar");
      else {
        const nombres = listaANombres(orientadoresSeleccionados, listaOrientadores);
        partes.push(nombres.length === 1 ? `Orientador(a) ${nombres[0]}` : `Orientadores ${nombres.join(", ")}`);
      }
    }

    if (partes.length === 0) return "";
    return partes.join(". ") + ".";
  };

  const handleEnviar = async () => {
    if (!titulo.trim()) return toast({ title: "Falta el título", variant: "destructive" });
    if (!mensajeConsulta.trim()) return toast({ title: "Falta el mensaje de la consulta", variant: "destructive" });
    if (!mensajeWhatsapp.trim()) return toast({ title: "Falta el mensaje de WhatsApp", variant: "destructive" });
    const opcionesLimpias = opciones.map((o) => o.trim()).filter(Boolean);
    if (opcionesLimpias.length < 1) return toast({ title: "Al menos 1 opción requerida", variant: "destructive" });
    if (opcionesLimpias.length > 4) return toast({ title: "Máximo 4 opciones", variant: "destructive" });
    const algunPerfilMarcado = Object.values(perfilesMarcados).some(Boolean);
    if (!algunPerfilMarcado) {
      return toast({ title: "Selecciona al menos un perfil de destinatario", variant: "destructive" });
    }

    // perfiles_objetivo = lista de valores tipo Comunicados ("Acudientes", "Estudiantes", "Profesores", "Rector", "Coordinadores", "Administrativos", "Secretaria General", "Orientador(a) Escolar")
    const perfilesObjetivo: string[] = [];
    for (const def of PERFILES_UI) {
      if (perfilesMarcados[def.key]) perfilesObjetivo.push(def.perfil);
    }

    // internos_objetivo = ids específicos de internos seleccionados (TEXT[])
    const internosObjetivo: string[] = [
      ...profesoresSeleccionados,
      ...coordinadoresSeleccionados,
      ...administrativosSeleccionados,
      ...secretariasSeleccionadas,
      ...orientadoresSeleccionados,
    ];

    // cargos_objetivo: derivado de perfiles para back-compat con responder viejo
    const cargoLabelMap: Record<PerfilKey, string | null> = {
      Estudiantes: null, Padres: null, Profesores: "Profesores",
      Coordinadores: "Coordinadores", Rector: "Rector",
      Administrativos: "Administrativos", Secretaria: "Secretarias",
      Orientador: "Orientadores",
    };
    const cargosObjetivo: string[] = [];
    for (const def of PERFILES_UI) {
      const label = cargoLabelMap[def.key];
      if (perfilesMarcados[def.key] && label) cargosObjetivo.push(label);
    }

    const session = getSession();
    setEnviando(true);
    try {
      // 1. Insertar la consulta en Supabase
      const { data: consultaInsertada, error: errIns } = await supabase
        .from("Consultas" as any)
        .insert({
          titulo: titulo.trim(),
          mensaje_consulta: mensajeConsulta,
          mensaje_whatsapp: mensajeWhatsapp,
          opciones: opcionesLimpias,
          grados_objetivo: gradosSeleccionados.length > 0 ? gradosSeleccionados : null,
          salones_objetivo: salonesSeleccionados.length > 0 ? salonesSeleccionados : null,
          estudiantes_objetivo: estudiantesSeleccionados.length > 0 ? estudiantesSeleccionados : null,
          cargos_objetivo: cargosObjetivo.length > 0 ? cargosObjetivo : null,
          internos_objetivo: internosObjetivo.length > 0 ? internosObjetivo : null,
          perfiles_objetivo: perfilesObjetivo.length > 0 ? perfilesObjetivo : null,
          requiere_firma: requiereFirma,
          creado_por: Number(session.id),
          creado_por_nombre: `${session.nombres || ""} ${session.apellidos || ""}`.trim(),
          creado_por_cargo: session.cargo || null,
        })
        .select()
        .single();

      if (errIns || !consultaInsertada) {
        throw new Error(errIns?.message || "Error creando la consulta");
      }

      const consultaCreada = consultaInsertada as unknown as ConsultaRow;

      // 2. Construir el mensaje de WhatsApp con el link
      const link = `${CONSULTAS_BASE}/${consultaCreada.id}`;
      const mensajeFinal = `${mensajeWhatsapp.trim()}\n\n👉 ${link}`;
      const destinatariosTexto = buildDestinatariosTexto();

      // 3. Armar segmentos para el endpoint server. Estudiantes/Padres con
      //    filtros aula van en un segmento; internos con ids en otro. El
      //    normalizador del server unifica/agrupa si corresponde.
      const segmentos: any[] = [];

      const perfilesEstPadres: string[] = [];
      if (perfilesMarcados.Estudiantes) perfilesEstPadres.push("Estudiantes");
      if (perfilesMarcados.Padres) perfilesEstPadres.push("Acudientes");
      if (perfilesEstPadres.length > 0) {
        const segEstPadres: any = { perfil: perfilesEstPadres };
        if (estudiantesSeleccionados.length > 0) {
          segEstPadres.id_destinatarios = estudiantesSeleccionados.map(String);
        } else {
          if (nivelesSeleccionados.length === 1) segEstPadres.nivel = nivelesSeleccionados[0];
          if (gradosSeleccionados.length > 0) segEstPadres.grados = gradosSeleccionados;
          if (salonesSeleccionados.length > 0) segEstPadres.salones = salonesSeleccionados;
        }
        segmentos.push(segEstPadres);
      }

      const internoIdsPorPerfil: { perfil: string; ids: string[] }[] = [
        { perfil: "Profesores", ids: profesoresSeleccionados.map(String) },
        { perfil: "Coordinadores", ids: coordinadoresSeleccionados.map(String) },
        { perfil: "Administrativos", ids: administrativosSeleccionados.map(String) },
        { perfil: "Secretaria General", ids: secretariasSeleccionadas.map(String) },
        { perfil: "Orientadores", ids: orientadoresSeleccionados.map(String) },
      ];
      const perfilesInternosTodos: string[] = [];
      for (const { perfil, ids } of internoIdsPorPerfil) {
        if (!perfilesMarcados[perfilToKey(perfil)]) continue;
        if (ids.length > 0) {
          segmentos.push({ perfil: [perfil], id_destinatarios: ids });
        } else {
          perfilesInternosTodos.push(perfil);
        }
      }
      if (perfilesMarcados.Rector) perfilesInternosTodos.push("Rector");
      if (perfilesInternosTodos.length > 0) {
        segmentos.push({ perfil: perfilesInternosTodos });
      }

      // 4. POST al endpoint server (multi-tenant via JWT). El server decide
      //    si va como admin anónimo (como_normi) o como envío normal del
      //    usuario logueado según el rol del JWT.
      await apiRequest('/api/comunicados/enviar', {
        method: 'POST',
        body: JSON.stringify({
          como_normi: session.cargo === 'Administrador',
          destinatarios_label: destinatariosTexto,
          mensaje: mensajeFinal,
          segmentos,
        }),
      });
      // El server guarda automáticamente en Comunicados con grupo_comunicado_id.

      toast({
        title: "Consulta creada y enviada",
        description: "El comunicado fue despachado a los acudientes.",
      });
      resetForm();
      setTab("listar");
      cargarConsultas();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  // Los salones mostrados en el selector salen de la lista base (sin filtrar por salón).
  // Así, marcar "Salón 1" no hace que desaparezcan "Salón 2" y "Salón 3".
  const salonesPorGrado = useMemo(() => {
    const s = new Set<string>();
    estudiantesDelGrado.forEach((e) => {
      if (e.salon) s.add(String(e.salon));
    });
    return Array.from(s).sort();
  }, [estudiantesDelGrado]);

  const backLink = "/dashboard";

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink={backLink} />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Button onClick={() => navigate(backLink)} variant="outline" size="sm">
            ← Volver
          </Button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileBarChart2 className="h-6 w-6 text-primary" />
            Consultas
          </h1>
        </div>

        <div className="flex gap-2 mb-4 border-b">
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              tab === "listar" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("listar")}
          >
            Todas las consultas
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              tab === "crear" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("crear")}
          >
            <Plus className="h-4 w-4 inline mr-1" />
            Nueva consulta
          </button>
        </div>

        {tab === "listar" && (
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Cargando...</div>
            ) : consultas.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                No hay consultas todavía. Crea la primera con "Nueva consulta".
              </div>
            ) : (
              consultas.map((c) => {
                const miEstado = miRespuestaPorConsulta[c.id];
                const meTocaResponder = miEstado === "pendiente" && c.activa;
                const yaRespondi = miEstado === "respondida";
                return (
                  <Card
                    key={c.id}
                    className={`cursor-pointer hover:border-primary transition-colors ${meTocaResponder ? "border-primary border-2" : ""}`}
                    onClick={() => navigate(`/consultas/${c.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate">{c.titulo}</h3>
                        {!c.activa && <Badge variant="secondary">Cerrada</Badge>}
                        {meTocaResponder && (
                          <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">Pendiente tu respuesta</Badge>
                        )}
                        {yaRespondi && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 border border-green-300">Ya respondiste</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Por{" "}
                        {c.creado_por_cargo === "Administrador"
                          ? "Normi"
                          : `${c.creado_por_nombre || `Interno ${c.creado_por}`}${c.creado_por_cargo ? ` (${c.creado_por_cargo})` : ""}`}
                        {" "}—{" "}
                        {new Date(c.fecha_creacion).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.opciones.slice(0, 4).map((op, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {op}
                          </Badge>
                        ))}
                      </div>
                      {(meTocaResponder || yaRespondi) && (
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant={meTocaResponder ? "default" : "outline"}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/consulta/${c.id}`);
                            }}
                          >
                            {meTocaResponder ? "Responder consulta" : "Ver / editar tu respuesta"}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {tab === "crear" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contenido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="titulo">Título de la consulta</Label>
                  <Input
                    id="titulo"
                    placeholder="Ej: Jornada de Vacunación contra el VPH"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="mensajeConsulta">Mensaje completo (se muestra al abrir el link)</Label>
                  <Textarea
                    id="mensajeConsulta"
                    placeholder="El texto completo que verá el acudiente al entrar..."
                    value={mensajeConsulta}
                    onChange={(e) => setMensajeConsulta(e.target.value)}
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Este texto aparece en la página que se abre al hacer clic en el link.
                  </p>
                </div>
                <div>
                  <Label htmlFor="mensajeWhatsapp">Mensaje corto de WhatsApp (con el link)</Label>
                  <Textarea
                    id="mensajeWhatsapp"
                    placeholder="Texto corto que se envía por WhatsApp. El link se agrega automáticamente al final."
                    value={mensajeWhatsapp}
                    onChange={(e) => setMensajeWhatsapp(e.target.value)}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    El sistema añade automáticamente el link (notasnormi.com/consulta/&lt;id&gt;) al final.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Opciones de respuesta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {opciones.map((op, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      value={op}
                      onChange={(e) => updateOpcion(i, e.target.value)}
                      placeholder={`Opción ${i + 1}`}
                    />
                    {opciones.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => quitarOpcion(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                {opciones.length < 4 && (
                  <Button type="button" variant="outline" size="sm" onClick={agregarOpcion}>
                    <Plus className="h-3 w-3 mr-1" /> Añadir opción
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Destinatarios
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="font-medium">Perfiles</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    Selecciona uno o más perfiles. Para cada uno aparecerán los filtros y selectores específicos abajo.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PERFILES_UI.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!perfilesMarcados[p.key]}
                          onChange={() => togglePerfil(p.key)}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Filtros académicos (nivel/grado/salón) — visibles si hay perfiles con audiencia académica */}
                {(perfilesMarcados.Estudiantes || perfilesMarcados.Padres || perfilesMarcados.Profesores) && (
                  <>
                    <div>
                      <Label className="font-medium">Nivel(es) (opcional)</Label>
                      <div className="flex flex-wrap gap-3 mt-2">
                        {Object.keys(NIVELES_GRADOS).map((n) => (
                          <label key={n} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!nivelesMarcados[n]}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNivelesMarcados({ ...nivelesMarcados, [n]: checked });
                                // Marcar/desmarcar todos los grados de ese nivel
                                const gradosDelNivel = NIVELES_GRADOS[n] || [];
                                setGradosMarcados((prev) => {
                                  const next = { ...prev };
                                  for (const g of gradosDelNivel) next[g] = checked;
                                  return next;
                                });
                              }}
                            />
                            {n}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="font-medium">Grados</Label>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                        {GRADOS_ORDEN.map((g) => (
                          <label key={g} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!gradosMarcados[g]}
                              onChange={(e) => setGradosMarcados({ ...gradosMarcados, [g]: e.target.checked })}
                            />
                            {g}
                          </label>
                        ))}
                      </div>
                    </div>

                    {gradosSeleccionados.length > 0 && (
                      <div>
                        <button
                          type="button"
                          className="flex items-center gap-2 text-sm font-medium text-foreground"
                          onClick={() => setMostrarSalones(!mostrarSalones)}
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${mostrarSalones ? "" : "-rotate-90"}`} />
                          Salones (opcional — deja vacío para todos los de estos grados)
                        </button>
                        {mostrarSalones && (
                          <div className="flex flex-wrap gap-3 mt-2 pl-6">
                            {salonesPorGrado.map((s) => (
                              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!salonesMarcados[s]}
                                  onChange={(e) => setSalonesMarcados({ ...salonesMarcados, [s]: e.target.checked })}
                                />
                                Salón {s}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Estudiantes específicos (para Estudiantes o Padres) */}
                {(perfilesMarcados.Estudiantes || perfilesMarcados.Padres) && gradosSeleccionados.length > 0 && estudiantesDisponibles.length > 0 && (
                  <div>
                    <button
                      type="button"
                      className="flex items-center gap-2 text-sm font-medium text-foreground"
                      onClick={() => setMostrarEstudiantes(!mostrarEstudiantes)}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${mostrarEstudiantes ? "" : "-rotate-90"}`} />
                      Estudiantes específicos (opcional — deja vacío para todos los filtrados arriba)
                    </button>
                    {mostrarEstudiantes && (
                      <div className="mt-2 pl-6 max-h-64 overflow-y-auto border rounded p-2 space-y-1">
                        {loadingEst ? (
                          <div className="text-sm text-muted-foreground">Cargando...</div>
                        ) : (
                          estudiantesDisponibles
                            .sort((a, b) =>
                              `${a.apellidos || ""} ${a.nombres || ""}`.localeCompare(
                                `${b.apellidos || ""} ${b.nombres || ""}`
                              )
                            )
                            .map((e) => (
                              <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                                <input
                                  type="checkbox"
                                  checked={!!estudiantesMarcados[e.id]}
                                  onChange={(ev) =>
                                    setEstudiantesMarcados({
                                      ...estudiantesMarcados,
                                      [e.id]: ev.target.checked,
                                    })
                                  }
                                />
                                <span className="flex-1">
                                  {e.apellidos} {e.nombres}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {e.grado} {e.salon}
                                </span>
                              </label>
                            ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Profesores específicos (filtrados por grado/salón) */}
                {perfilesMarcados.Profesores && (
                  <div>
                    <button
                      type="button"
                      className="flex items-center gap-2 text-sm font-medium text-foreground"
                      onClick={() => setMostrarProfesores(!mostrarProfesores)}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${mostrarProfesores ? "" : "-rotate-90"}`} />
                      Profesores específicos (opcional — deja vacío para todos los filtrados)
                    </button>
                    {mostrarProfesores && (
                      <div className="mt-2 pl-6 max-h-64 overflow-y-auto border rounded p-2 space-y-1">
                        {loadingListaProfesores ? (
                          <div className="text-sm text-muted-foreground">Cargando...</div>
                        ) : listaProfesoresFiltrada.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No hay profesores con esos filtros.</div>
                        ) : (
                          listaProfesoresFiltrada.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                              <input
                                type="checkbox"
                                checked={profesoresSeleccionados.includes(p.id)}
                                onChange={() => toggleInterno(profesoresSeleccionados, p.id, setProfesoresSeleccionados)}
                              />
                              <span className="flex-1">{p.nombre}</span>
                              {(p.grados.length > 0 || p.salones.length > 0) && (
                                <span className="text-xs text-muted-foreground">
                                  {[p.grados.join(", "), p.salones.length > 0 ? `Salón ${p.salones.join(", ")}` : ""].filter(Boolean).join(" — ")}
                                </span>
                              )}
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Selectores específicos por cargo */}
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
                            <input
                              type="checkbox"
                              checked={grupo.sel.includes(p.id)}
                              onChange={() => toggleInterno(grupo.sel, p.id, grupo.setter)}
                            />
                            <span>{p.nombre}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <div className="font-medium mb-1">Resumen del envío:</div>
                  <div className="text-muted-foreground">
                    {!Object.values(perfilesMarcados).some(Boolean) ? (
                      <span className="text-destructive">Selecciona al menos un perfil destinatario.</span>
                    ) : (
                      <>
                        Destinatarios: <strong>{buildDestinatariosTexto() || "(define filtros para los perfiles seleccionados)"}</strong>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <Label htmlFor="firma" className="font-medium">
                    {hayPadresEnDestinatarios && hayInternosEnDestinatarios
                      ? "Requiere firma digital del acudiente o del interno"
                      : hayInternosEnDestinatarios && !hayPadresEnDestinatarios
                      ? "Requiere firma digital del interno"
                      : "Requiere firma digital del acudiente"}
                  </Label>
                  <p className="text-xs text-muted-foreground">Para autorizaciones oficiales, activa esta opción.</p>
                </div>
                <Switch id="firma" checked={requiereFirma} onCheckedChange={setRequiereFirma} />
              </CardContent>
            </Card>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm} disabled={enviando}>
                <X className="h-4 w-4 mr-1" /> Limpiar
              </Button>
              <Button onClick={handleEnviar} disabled={enviando}>
                <Send className="h-4 w-4 mr-1" /> {enviando ? "Enviando..." : "Crear y enviar"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
