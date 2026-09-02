import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, hasValidSession, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, FileSpreadsheet, Eye, Copy, Pencil, Trash2, CheckCircle2, Plus } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import DestinatariosSelector, {
  type DestinatariosValue,
  type DestinatariosOutput,
  type DestinatariosSnapshot,
  emptyDestinatariosValue,
  destinatariosFromConsulta,
  diffNuevosDestinatarios,
} from "@/components/DestinatariosSelector";
import { apiRequest } from "@/lib/apiClient";

// Mapeo entre etiqueta legacy (cargos_objetivo) y cargos reales del usuario.
const CARGO_OBJETIVO_LEGACY: Record<string, string[]> = {
  Rector: ["Rector"],
  Coordinadores: ["Coordinador(a)"],
  Profesores: ["Profesor(a)"],
  Secretarias: ["Secretaria General"],
  Administrativos: ["Administrativo(a)", "Administrador"],
  Orientadores: ["Orientador(a) Escolar"],
};
const PERFIL_OBJETIVO_NUEVO: Record<string, string[]> = {
  "Rector": ["Rector"],
  "Coordinadores": ["Coordinador(a)"],
  "Profesores": ["Profesor(a)"],
  "Secretaria General": ["Secretaria General"],
  "Administrativos": ["Administrativo(a)", "Administrador"],
  "Orientador(a) Escolar": ["Orientador(a) Escolar"],
};

interface ConsultaRow {
  id: number;
  titulo: string;
  mensaje_consulta: string;
  mensaje_whatsapp: string;
  opciones: string[];
  requiere_firma: boolean;
  creado_por: number | null;
  creado_por_nombre: string | null;
  creado_por_cargo: string | null;
  fecha_creacion: string;
  activa: boolean;
  grados_objetivo: string[] | null;
  salones_objetivo: string[] | null;
  estudiantes_objetivo: number[] | null;
  cargos_objetivo: string[] | null;
  perfiles_objetivo: string[] | null;
  internos_objetivo: string[] | null;
  mensaje_whatsapp?: string | null;
  /** 'opciones' (clásica) | 'datos' (formulario con campos a diligenciar) */
  tipo?: string | null;
  campos_datos?: string[] | null;
}

interface EstudianteRow {
  id: number;
  nombres: string | null;
  apellidos: string | null;
  grado: string | null;
  salon: string | null;
}

interface PadreRow {
  padre_id: string;
  acudiente_nombre: string | null;
  numero_de_telefono: string | null;
  acudido1_id: number | null;
  acudido2_id: number | null;
  acudido3_id: number | null;
  acudido4_id: number | null;
  acudido1_nombre: string | null;
  acudido1_apellidos: string | null;
  acudido1_grado: string | null;
  acudido1_salon: string | null;
  acudido2_nombre: string | null;
  acudido2_apellidos: string | null;
  acudido2_grado: string | null;
  acudido2_salon: string | null;
  acudido3_nombre: string | null;
  acudido3_apellidos: string | null;
  acudido3_grado: string | null;
  acudido3_salon: string | null;
  acudido4_nombre: string | null;
  acudido4_apellidos: string | null;
  acudido4_grado: string | null;
  acudido4_salon: string | null;
}

interface RespuestaRow {
  id: number;
  consulta_id: number;
  padre_id: string;
  acudiente_nombre: string | null;
  estudiante_id: number | null;
  tipo_respondente: "padre" | "interno" | "estudiante" | null;
  estudiante_nombre: string | null;
  estudiante_apellidos: string | null;
  estudiante_grado: string | null;
  estudiante_salon: string | null;
  opcion_seleccionada: string | null;
  firma_url: string | null;
  firma_nombre: string | null;
  fecha_respuesta: string | null;
  padre_nombre?: string | null;
  /** Consulta tipo 'datos': { campo: valor } diligenciado */
  datos?: Record<string, string> | null;
}

interface RespuestaInternoTabla {
  padre_id: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  opcion: string | null;
  firma_url: string | null;
  firma_nombre: string | null;
  fecha_respuesta: string | null;
}

interface AcudienteEnTabla {
  padre_id: string | null;
  acudiente_nombre: string;
  padre_telefono: string | null;
  opcion: string | null;
  firma_url: string | null;
  firma_nombre: string | null;
  fecha_respuesta: string | null;
  registrado: boolean; // si tiene contraseña en Usuarios
}

interface EstudianteEnTabla {
  estudiante_id: number;
  nombre_completo: string;
  grado: string | null;
  salon: string | null;
  acudientes: AcudienteEnTabla[];
}

export default function ConsultaDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [consulta, setConsulta] = useState<ConsultaRow | null>(null);
  const [estudiantes, setEstudiantes] = useState<EstudianteRow[]>([]);
  const [padres, setPadres] = useState<PadreRow[]>([]);
  const [respuestas, setRespuestas] = useState<RespuestaRow[]>([]);
  const [respuestasInternos, setRespuestasInternos] = useState<RespuestaInternoTabla[]>([]);
  const [respuestasEstudiantes, setRespuestasEstudiantes] = useState<RespuestaRow[]>([]);
  // Consulta tipo 'datos': TODAS las filas con formulario diligenciado (padres,
  // internos y estudiantes), con el nombre ya resuelto. Antes la tabla solo
  // miraba las filas de padres y los docentes (internos) no aparecían.
  const [respuestasDatos, setRespuestasDatos] = useState<RespuestaRow[]>([]);

  // Panel de "Tu respuesta" inline para internos destinatarios
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [miOpcion, setMiOpcion] = useState<string | null>(null);
  const [miFirmaPreviaUrl, setMiFirmaPreviaUrl] = useState<string | null>(null);
  const [miFirmaPreviaNombre, setMiFirmaPreviaNombre] = useState<string>("");
  const [miFirmaNombre, setMiFirmaNombre] = useState<string>("");
  const [miFirmaData, setMiFirmaData] = useState<string | null>(null);
  const [miFechaRespuesta, setMiFechaRespuesta] = useState<string | null>(null);
  const [miEnviando, setMiEnviando] = useState(false);
  const [miEditando, setMiEditando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "con_respuesta" | "sin_respuesta">("todos");
  const [filtroOpcion, setFiltroOpcion] = useState<string>("todas");
  const [filtroGrado, setFiltroGrado] = useState<string>("todos");
  const [filtroSalon, setFiltroSalon] = useState<string>("todos");
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [firmaModal, setFirmaModal] = useState<string | null>(null);
  const [editarOpen, setEditarOpen] = useState(false);
  const [eliminarOpen, setEliminarOpen] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [editTitulo, setEditTitulo] = useState("");
  const [editMensaje, setEditMensaje] = useState("");
  // Campos del formulario (tipo 'datos') en edición: orig = nombre guardado (null si es nuevo).
  const [editCampos, setEditCampos] = useState<{ orig: string | null; val: string }[]>([]);
  const [guardandoEdit, setGuardandoEdit] = useState(false);

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
    cargar();
  }, [id, navigate]);

  const cargar = async () => {
    if (!id) return;
    setLoading(true);

    // 1. Cargar consulta
    const { data: c } = await supabase.from("Consultas" as any).select("*").eq("id", id).single();
    if (!c) {
      setLoading(false);
      return;
    }
    const consultaRow = c as unknown as ConsultaRow;
    setConsulta(consultaRow);

    // 2. Cargar estudiantes objetivo — solo si la consulta tiene algún filtro de padres.
    //    Si la consulta es solo para internos (cargos_objetivo poblado, sin grados/salones/estudiantes),
    //    no cargamos estudiantes porque no aplica la tabla de padres-acudientes.
    const tienePadresObjetivo = !!(
      (consultaRow.estudiantes_objetivo && consultaRow.estudiantes_objetivo.length > 0) ||
      (consultaRow.grados_objetivo && consultaRow.grados_objetivo.length > 0) ||
      (consultaRow.salones_objetivo && consultaRow.salones_objetivo.length > 0)
    );

    let ests: EstudianteRow[] | null = null;
    if (tienePadresObjetivo) {
      // Fase 10.E.19: nombres/apellidos viven en Usuarios.
      let estQuery = supabase
        .from("Estudiantes")
        .select("id, grado, salon");

      if (consultaRow.estudiantes_objetivo && consultaRow.estudiantes_objetivo.length > 0) {
        estQuery = estQuery.in("id", consultaRow.estudiantes_objetivo);
      } else {
        if (consultaRow.grados_objetivo && consultaRow.grados_objetivo.length > 0) {
          estQuery = estQuery.in("grado", consultaRow.grados_objetivo as any);
        }
        if (consultaRow.salones_objetivo && consultaRow.salones_objetivo.length > 0) {
          estQuery = estQuery.in("salon", consultaRow.salones_objetivo as any);
        }
      }
      const { data } = await estQuery;
      const { enrichWithNombres } = await import("@/lib/nombresUsuarios");
      ests = (await enrichWithNombres((data || []) as any)) as EstudianteRow[];
      setEstudiantes(ests);
    } else {
      setEstudiantes([]);
      setPadres([]);
    }

    // 3. Cargar acudientes que tienen alguno de estos estudiantes como acudido.
    if (ests && ests.length > 0) {
      const idsEst = ests.map((e: any) => e.id);
      const acudientesMap = new Map<string, any>();

      const cols = ["acudido1_id", "acudido2_id", "acudido3_id", "acudido4_id"] as const;
      await Promise.all(
        cols.map(async (col) => {
          const { data } = await supabase
            .from("Acudientes")
            .select("id, acudido1_id, acudido2_id, acudido3_id, acudido4_id")
            .in(col, idsEst);
          (data || []).forEach((a: any) => {
            if (a.id && !acudientesMap.has(a.id)) {
              acudientesMap.set(a.id, a);
            }
          });
        })
      );

      // Resolver datos de Usuarios para los acudientes encontrados
      const acudienteIds = Array.from(acudientesMap.keys());
      const usuariosMap = new Map<string, any>();
      if (acudienteIds.length > 0) {
        const { data } = await supabase
          .from("Usuarios")
          .select("id, nombres, apellidos, numero_de_telefono")
          .in("id", acudienteIds);
        (data || []).forEach((u: any) => usuariosMap.set(String(u.id), u));
      }

      // Resolver datos de Estudiantes para los acudidos
      const allHijoIds = new Set<number>();
      for (const a of acudientesMap.values()) {
        for (const hid of [a.acudido1_id, a.acudido2_id, a.acudido3_id, a.acudido4_id]) {
          if (hid != null) allHijoIds.add(hid);
        }
      }
      const estsMap = new Map<string, any>();
      if (allHijoIds.size > 0) {
        // Fase 10.E.19: nombres/apellidos viven en Usuarios.
        const { data } = await supabase
          .from("Estudiantes")
          .select("id, grado, salon")
          .in("id", Array.from(allHijoIds));
        const { enrichWithNombres } = await import("@/lib/nombresUsuarios");
        const enriched = await enrichWithNombres((data || []) as any);
        enriched.forEach((e: any) => estsMap.set(String(e.id), e));
      }

      // Construir array PadreRow compatible con el resto del componente
      const padresRows: PadreRow[] = [];
      for (const [aid, a] of acudientesMap.entries()) {
        const u = usuariosMap.get(aid);
        const legacyP = a._legacy;
        const row: any = {
          padre_id: aid,
          acudiente_nombre: u ? `${u.nombres || ""} ${u.apellidos || ""}`.trim() : (legacyP?.acudiente_nombre || ""),
          numero_de_telefono: u?.numero_de_telefono || legacyP?.numero_de_telefono || "",
        };
        for (const i of [1, 2, 3, 4]) {
          const hid = a[`acudido${i}_id`];
          const h = hid ? estsMap.get(String(hid)) : null;
          row[`acudido${i}_id`] = hid;
          row[`acudido${i}_nombre`] = h ? (h.nombres || h.nombres || "") : (legacyP?.[`acudido${i}_nombre`] || "");
          row[`acudido${i}_apellidos`] = h ? (h.apellidos || h.apellidos || "") : (legacyP?.[`acudido${i}_apellidos`] || "");
          row[`acudido${i}_grado`] = h ? h.grado : (legacyP?.[`acudido${i}_grado`] || "");
          row[`acudido${i}_salon`] = h ? h.salon : (legacyP?.[`acudido${i}_salon`] || "");
        }
        padresRows.push(row as PadreRow);
      }
      setPadres(padresRows);
    }

    // 4. Cargar respuestas
    const { data: resps } = await supabase
      .from("Consultas_Respuestas" as any)
      .select("*")
      .eq("consulta_id", id);
    const respsRows = (resps || []) as unknown as RespuestaRow[];

    // Separar padres / internos / estudiantes (que responden directo).
    const filasPadres = respsRows.filter((r) => r.tipo_respondente === "padre" || r.tipo_respondente == null);
    const filasInternos = respsRows.filter((r) => r.tipo_respondente === "interno");
    const filasEstudiantes = respsRows.filter((r) => r.tipo_respondente === "estudiante");
    setRespuestas(filasPadres);
    setRespuestasEstudiantes(filasEstudiantes);

    // Mi respuesta como interno (estudiante_id IS NULL, padre_id = mi id)
    const session = getSession();
    const sId = String(session.id || "");
    const miFila = respsRows.find(
      (r) => r.tipo_respondente === "interno" && String(r.padre_id) === sId && r.estudiante_id == null
    );
    if (miFila) {
      setMiOpcion(miFila.opcion_seleccionada || null);
      setMiFirmaPreviaUrl(miFila.firma_url || null);
      setMiFirmaPreviaNombre(miFila.firma_nombre || "");
      setMiFirmaNombre(miFila.firma_nombre || "");
      setMiFechaRespuesta(miFila.fecha_respuesta || null);
    }

    // Enriquecer internos con cargo desde la tabla Internos.
    // El teléfono ahora vive solo en Usuarios (Fase 10.E.15) — query aparte.
    const nombreInternoPorId = new Map<string, string>();
    if (filasInternos.length > 0) {
      const idsInternos = Array.from(new Set(filasInternos.map((r) => r.padre_id)));
      const idsNumericos = idsInternos.map((i) => Number(i)).filter((n) => Number.isFinite(n));
      // Fase 10.E.19: nombres/apellidos viven en Usuarios; Internos solo tiene cargo.
      const [internosRes, usuariosRes] = await Promise.all([
        idsNumericos.length > 0
          ? supabase
              .from("Internos" as any)
              .select("id, cargo")
              .in("id" as any, idsNumericos)
          : Promise.resolve({ data: [] as any[] }),
        idsInternos.length > 0
          ? supabase
              .from("Usuarios" as any)
              .select("id, nombres, apellidos, numero_de_telefono")
              .in("id" as any, idsInternos)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const internoMap = new Map<string, any>();
      (internosRes.data || []).forEach((i: any) => internoMap.set(String(i.id), i));
      const usuMap = new Map<string, any>();
      (usuariosRes.data || []).forEach((u: any) => usuMap.set(String(u.id), u));
      usuMap.forEach((u, k) => nombreInternoPorId.set(k, `${u.apellidos || ""} ${u.nombres || ""}`.trim()));
      const filasEnriquecidas: RespuestaInternoTabla[] = filasInternos.map((r) => {
        const info = internoMap.get(String(r.padre_id));
        const usu = usuMap.get(String(r.padre_id));
        const nombre = r.acudiente_nombre
          || (usu ? `${usu.apellidos || ""} ${usu.nombres || ""}`.trim() : `Interno ${r.padre_id}`);
        return {
          padre_id: r.padre_id,
          nombre,
          cargo: info?.cargo || null,
          telefono: usu?.numero_de_telefono ?? null,
          opcion: r.opcion_seleccionada,
          firma_url: r.firma_url,
          firma_nombre: r.firma_nombre,
          fecha_respuesta: r.fecha_respuesta,
        };
      });
      // Orden alfabético por nombre (empieza por el apellido).
      filasEnriquecidas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      setRespuestasInternos(filasEnriquecidas);
    } else {
      setRespuestasInternos([]);
    }

    // Tipo 'datos': una fila por formulario diligenciado, sin importar el perfil.
    // El nombre se arma "Apellidos Nombres" desde Usuarios (el guardado al
    // diligenciar viene "Nombres Apellidos" y el orden alfabético SIEMPRE
    // empieza por los apellidos). Fallback: el nombre guardado.
    const filasDatos = respsRows.filter((r) => r.datos);
    const idsDatos = Array.from(new Set(filasDatos.map((r) => String(r.padre_id))))
      .filter((k) => !nombreInternoPorId.has(k));
    if (idsDatos.length > 0) {
      const { data: usuDatos } = await supabase
        .from("Usuarios" as any)
        .select("id, nombres, apellidos")
        .in("id" as any, idsDatos);
      (usuDatos || []).forEach((u: any) =>
        nombreInternoPorId.set(String(u.id), `${u.apellidos || ""} ${u.nombres || ""}`.trim()));
    }
    setRespuestasDatos(
      filasDatos
        .map((r) => ({
          ...r,
          padre_nombre: nombreInternoPorId.get(String(r.padre_id)) || r.padre_nombre || r.acudiente_nombre || null,
        }))
        .sort((a, b) => (a.padre_nombre || "").localeCompare(b.padre_nombre || "", "es")),
    );

    setLoading(false);
  };

  // ¿El usuario actual (interno) es destinatario de la consulta?
  const puedoResponder = useMemo<boolean>(() => {
    if (!consulta) return false;
    const session = getSession();
    const cargo = session.cargo || "";
    const sId = String(session.id || "");
    // Esquema nuevo: perfiles_objetivo
    if (Array.isArray((consulta as any).perfiles_objetivo) && (consulta as any).perfiles_objetivo.length > 0) {
      const perfiles = (consulta as any).perfiles_objetivo as string[];
      const matchPerfil = perfiles.some((p) => (PERFIL_OBJETIVO_NUEVO[p] || []).includes(cargo));
      if (!matchPerfil) return false;
      // Si hay internos_objetivo específico, exigir match
      const internos = (consulta as any).internos_objetivo as string[] | null | undefined;
      if (Array.isArray(internos) && internos.length > 0) {
        return internos.includes(sId);
      }
      return true;
    }
    // Esquema viejo: cargos_objetivo
    if (Array.isArray(consulta.cargos_objetivo) && consulta.cargos_objetivo.length > 0) {
      return consulta.cargos_objetivo.some((label) => (CARGO_OBJETIVO_LEGACY[label] || []).includes(cargo));
    }
    return false;
  }, [consulta]);

  const limpiarMiFirma = () => {
    sigRef.current?.clear();
    setMiFirmaData(null);
  };
  const guardarMiFirma = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      setMiFirmaData(sigRef.current.toDataURL("image/png"));
    }
  };

  const enviarMiRespuesta = async () => {
    if (!consulta || !miOpcion) {
      toast({ title: "Selecciona una opción", variant: "destructive" });
      return;
    }
    if (consulta.requiere_firma && !miFirmaData && !miFirmaPreviaUrl) {
      toast({ title: "Firma requerida", description: "Por favor firma antes de enviar.", variant: "destructive" });
      return;
    }
    setMiEnviando(true);
    const session = getSession();
    const sId = String(session.id || "");

    // 1. Subir firma si la hay
    let firmaUrl: string | null = miFirmaPreviaUrl;
    if (miFirmaData) {
      try {
        const match = miFirmaData.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        if (match) {
          const mime = match[1];
          const ext = mime.split("/")[1] || "png";
          const bin = atob(match[2]);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: mime });
          const filename = `firmas-consultas/consulta-${consulta.id}-interno-${sId}-${Date.now()}.${ext}`;
          const { error: errUp } = await supabase.storage
            .from("normi-archivos")
            .upload(filename, blob, { contentType: mime, upsert: true });
          if (!errUp) {
            const { data: pub } = supabase.storage.from("normi-archivos").getPublicUrl(filename);
            firmaUrl = pub?.publicUrl || firmaUrl;
          }
        }
      } catch (err) {
        console.error("upload firma:", err);
      }
    }

    const now = new Date().toISOString();
    const update: any = {
      consulta_id: consulta.id,
      padre_id: sId,
      padre_nombre: `${session.nombres || ""} ${session.apellidos || ""}`.trim(),
      tipo_respondente: "interno",
      estudiante_id: null,
      opcion_seleccionada: miOpcion,
      firma_nombre: `${session.nombres || ""} ${session.apellidos || ""}`.trim() || null,
      firma_url: firmaUrl,
    };
    if (miFechaRespuesta) {
      update.fecha_edicion = now;
    } else {
      update.fecha_respuesta = now;
      update.fecha_invitacion = now;
    }

    const { error } = await supabase
      .from("Consultas_Respuestas" as any)
      .upsert(update, { onConflict: "consulta_id,padre_id,estudiante_id" });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setMiEnviando(false);
      return;
    }

    toast({ title: "Respuesta enviada", description: "Gracias por responder." });
    setMiFirmaPreviaUrl(firmaUrl);
    setMiFirmaPreviaNombre(miFirmaNombre);
    setMiFechaRespuesta(now);
    setMiFirmaData(null);
    setMiEditando(false);
    sigRef.current?.clear();
    setMiEnviando(false);
    // Refrescar tabla de respuestas de internos para que aparezca/actualice mi fila
    cargar();
  };

  // Devuelve la lista resumida de estudiantes de los que es acudiente este padre,
  // para mostrar debajo del nombre en la celda como contexto de búsqueda.
  const kidsDePadre = (padreId: string): string[] => {
    const p = padres.find((x) => String(x.padre_id) === String(padreId));
    if (!p) return [];
    const slots = [1, 2, 3, 4] as const;
    const out: string[] = [];
    for (const idx of slots) {
      const nombre = (p as any)[`acudido${idx}_nombre`];
      const apellidos = (p as any)[`acudido${idx}_apellidos`];
      const grado = (p as any)[`acudido${idx}_grado`];
      const salon = (p as any)[`acudido${idx}_salon`];
      const id = (p as any)[`acudido${idx}_id`];
      if (!id) continue;
      const nombreCompleto = `${nombre || ""} ${apellidos || ""}`.trim();
      const grupo = grado ? ` (${grado}${salon ? ` ${salon}` : ""})` : "";
      out.push(`${nombreCompleto}${grupo}`.trim());
    }
    return out;
  };

  const GRADOS_ORDEN_MAP: Record<string, number> = {
    Párvulo: 1, Prejardín: 2, Jardín: 3, Transición: 4,
    Primero: 5, Segundo: 6, Tercero: 7, Cuarto: 8, Quinto: 9,
    Sexto: 10, Séptimo: 11, Octavo: 12, Noveno: 13,
    Décimo: 14, Undécimo: 15,
  };

  const filaEstudiantes = useMemo<EstudianteEnTabla[]>(() => {
    const lista = estudiantes.map((est) => {
      // Encontrar padres registrados de este estudiante (hasta 3)
      const padresDelEst = padres.filter((p) => {
        return (
          p.acudido1_id === est.id ||
          p.acudido2_id === est.id ||
          p.acudido3_id === est.id ||
          p.acudido4_id === est.id
        );
      });

      // Construir hasta 3 slots de acudientes
      const acudientes: AcudienteEnTabla[] = padresDelEst.slice(0, 3).map((p) => {
        const resp = respuestas.find(
          (r) => String(r.padre_id) === String(p.padre_id) && Number(r.estudiante_id) === Number(est.id)
        );
        return {
          padre_id: p.padre_id,
          acudiente_nombre: p.acudiente_nombre || `Acudiente ${p.padre_id}`,
          padre_telefono: p.numero_de_telefono,
          opcion: resp?.opcion_seleccionada || null,
          firma_url: resp?.firma_url || null,
          firma_nombre: resp?.firma_nombre || null,
          fecha_respuesta: resp?.fecha_respuesta || null,
          registrado: true,
        };
      });

      return {
        estudiante_id: est.id,
        nombre_completo: `${est.apellidos || ""} ${est.nombres || ""}`.trim(),
        grado: est.grado,
        salon: est.salon,
        acudientes,
      };
    });

    // Orden: grado → salón → nombre (si hay grado/salon filtrados específicos,
    // esto equivale a alfabético dentro del grupo seleccionado).
    lista.sort((a, b) => {
      const gA = GRADOS_ORDEN_MAP[a.grado || ""] ?? 99;
      const gB = GRADOS_ORDEN_MAP[b.grado || ""] ?? 99;
      if (gA !== gB) return gA - gB;
      const sA = parseInt(a.salon || "0", 10);
      const sB = parseInt(b.salon || "0", 10);
      if (sA !== sB) return sA - sB;
      return a.nombre_completo.localeCompare(b.nombre_completo);
    });
    return lista;
  }, [estudiantes, padres, respuestas]);

  const gradosPresentes = useMemo(() => {
    const s = new Set<string>();
    estudiantes.forEach((e) => e.grado && s.add(String(e.grado)));
    return Array.from(s).sort((a, b) => (GRADOS_ORDEN_MAP[a] ?? 99) - (GRADOS_ORDEN_MAP[b] ?? 99));
  }, [estudiantes]);

  const salonesPresentes = useMemo(() => {
    const s = new Set<string>();
    estudiantes.forEach((e) => e.salon && s.add(String(e.salon)));
    return Array.from(s).sort();
  }, [estudiantes]);

  // Cuántas columnas de acudiente mostrar — el máximo entre todos los estudiantes.
  // Si ningún estudiante tiene Acudiente 2, no se muestra esa columna; igual con 3.
  const maxAcudientes = useMemo(() => {
    let max = 0;
    filaEstudiantes.forEach((est) => {
      if (est.acudientes.length > max) max = est.acudientes.length;
    });
    return Math.min(max, 3);
  }, [filaEstudiantes]);

  const estadoEstudiante = (
    est: EstudianteEnTabla
  ): "con_respuesta" | "sin_respuesta" => {
    if (est.acudientes.some((a) => a.opcion)) return "con_respuesta";
    return "sin_respuesta";
  };

  // Color por opción según su posición en consulta.opciones (hasta 4).
  // Opción 0 (normalmente "SÍ autorizo"): verde. Opción 1 ("NO autorizo"): rojo.
  // Opción 2: azul. Opción 3: ámbar.
  const PALETA_OPCIONES = [
    "bg-green-100 text-green-800 border-green-300",
    "bg-red-100 text-red-800 border-red-300",
    "bg-blue-100 text-blue-800 border-blue-300",
    "bg-amber-100 text-amber-800 border-amber-300",
  ];
  const colorOpcion = (op: string): string => {
    if (!consulta) return PALETA_OPCIONES[0];
    const idx = consulta.opciones.indexOf(op);
    if (idx < 0) return "bg-gray-100 text-gray-800 border-gray-300";
    return PALETA_OPCIONES[idx % PALETA_OPCIONES.length];
  };

  const displayedEstudiantes = useMemo(() => {
    const normNombre = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const palabrasBusqueda = normNombre(busqueda.trim())
      .split(/\s+/)
      .filter(Boolean);

    return filaEstudiantes.filter((est) => {
      if (palabrasBusqueda.length > 0) {
        const nombreNorm = normNombre(est.nombre_completo);
        const matches = palabrasBusqueda.every((p) => nombreNorm.includes(p));
        if (!matches) return false;
      }
      if (filtroEstado !== "todos") {
        const estado = estadoEstudiante(est);
        if (filtroEstado !== estado) return false;
      }
      if (filtroGrado !== "todos" && String(est.grado) !== filtroGrado) return false;
      if (filtroSalon !== "todos" && String(est.salon) !== filtroSalon) return false;
      if (filtroOpcion !== "todas") {
        const alg = est.acudientes.some((a) => a.opcion === filtroOpcion);
        if (!alg) return false;
      }
      return true;
    });
  }, [filaEstudiantes, busqueda, filtroEstado, filtroOpcion, filtroGrado, filtroSalon]);


  const copiarLinkConsulta = async () => {
    const link = `${window.location.origin}/consulta/${id}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    } catch {
      toast({ title: "No se pudo copiar", description: link });
    }
  };

  const exportarExcel = async () => {
    if (!consulta) return;
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Normi";
    workbook.created = new Date();

    // Consulta tipo 'datos': hoja con una columna por campo diligenciado.
    if (consulta.tipo === "datos") {
      const campos = consulta.campos_datos || [];
      const filas = respuestasDatos;
      const sheetD = workbook.addWorksheet(consulta.titulo.slice(0, 30).replace(/[:*?/\\[\]]/g, ""), {
        properties: { tabColor: { argb: "FF15803D" } },
        views: [{ state: "frozen", ySplit: 2 }],
      });
      const headers = ["Diligenciado por", ...campos, "Fecha"];
      const lastCol = String.fromCharCode("A".charCodeAt(0) + headers.length - 1);
      sheetD.mergeCells(`A1:${lastCol}1`);
      const t = sheetD.getCell("A1");
      t.value = consulta.titulo;
      t.font = { bold: true, size: 14, color: { argb: "FF1A2332" } };
      t.alignment = { horizontal: "center", vertical: "middle" };
      sheetD.getRow(1).height = 26;
      const headerRow = sheetD.getRow(2);
      headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15803D" } };
        cell.alignment = { horizontal: "left", vertical: "middle" };
      });
      for (const r of filas) {
        sheetD.addRow([
          r.padre_nombre || r.padre_id,
          ...campos.map((c) => r.datos?.[c] || ""),
          r.fecha_respuesta ? new Date(r.fecha_respuesta).toLocaleString("es-CO") : "",
        ]);
      }
      sheetD.columns.forEach((col) => { col.width = 24; });
      const buf = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${consulta.titulo.replace(/[^\wáéíóúñÁÉÍÓÚÑ ]/g, "").trim() || "consulta"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const sheet = workbook.addWorksheet(consulta.titulo.slice(0, 30).replace(/[:*?/\\[\]]/g, ""), {
      properties: { tabColor: { argb: "FF15803D" } },
      views: [{ state: "frozen", ySplit: 4 }],
    });

    sheet.mergeCells("A1:K1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = consulta.titulo;
    titleCell.font = { bold: true, size: 14, color: { argb: "FF1A2332" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 26;

    const totalCols = 3 + maxAcudientes * 2; // nombres + grado + salón + (acud + resp)*N
    const mergeToCol = String.fromCharCode("A".charCodeAt(0) + totalCols - 1);
    sheet.mergeCells(`A2:${mergeToCol}2`);
    const subtitleCell = sheet.getCell("A2");
    const remitenteExcel =
      consulta.creado_por_cargo === "Administrador"
        ? "Normi"
        : `${consulta.creado_por_nombre || ""}${
            consulta.creado_por_cargo ? ` (${consulta.creado_por_cargo})` : ""
          }`;
    subtitleCell.value = `Creado por ${remitenteExcel} — ${new Date(consulta.fecha_creacion).toLocaleDateString("es-CO")}`;
    subtitleCell.font = { italic: true, size: 11, color: { argb: "FF6B7280" } };
    subtitleCell.alignment = { horizontal: "center" };
    sheet.getRow(2).height = 18;

    // Actualizar el merge del título para que cubra todas las columnas
    sheet.unMergeCells("A1:K1");
    sheet.mergeCells(`A1:${mergeToCol}1`);

    const header: string[] = ["Apellidos y Nombres", "Grado", "Salón"];
    for (let i = 1; i <= maxAcudientes; i++) {
      header.push(`Acudiente ${i}`, `Respuesta ${i}`);
    }
    const headerRow = sheet.getRow(4);
    headerRow.values = header;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15803D" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
    });
    headerRow.height = 22;

    displayedEstudiantes.forEach((est, idx) => {
      const ac = est.acudientes;
      const rowData: (string | number)[] = [
        est.nombre_completo,
        est.grado || "",
        est.salon || "",
      ];
      for (let i = 0; i < maxAcudientes; i++) {
        rowData.push(ac[i]?.acudiente_nombre || "");
        rowData.push(ac[i]?.opcion || (ac[i] ? "Sin respuesta" : ""));
      }
      const row = sheet.addRow(rowData);
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
        });
      }
    });

    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: totalCols } };
    // widths: nombres, grado, salón, [acudiente, respuesta] x N
    const widths: number[] = [30, 12, 8];
    for (let i = 0; i < maxAcudientes; i++) {
      widths.push(24, 16);
    }
    widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = `Consulta - ${consulta.titulo}.xlsx`.replace(/[:*?/\\[\]]/g, "-");
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({ title: "Excel descargado", description: `${displayedEstudiantes.length} estudiantes exportados.` });
  };

  const cerrarConsulta = async () => {
    if (!consulta) return;
    if (!confirm("¿Cerrar esta consulta? Los acudientes no podrán responder más.")) return;
    const { error } = await supabase.from("Consultas" as any).update({ activa: false }).eq("id", consulta.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Consulta cerrada" });
    cargar();
  };

  const eliminarConsulta = async () => {
    if (!consulta) return;
    setEliminando(true);
    try {
      // Borrar registros relacionados (las respuestas se borran en cascada por FK,
      // pero por seguridad lo hacemos explícito).
      await supabase.from("Consultas_Respuestas" as any).delete().eq("consulta_id", consulta.id);
      const { error } = await supabase.from("Consultas" as any).delete().eq("id", consulta.id);
      if (error) throw new Error(error.message);
      toast({ title: "Consulta eliminada", description: "La consulta y sus respuestas se borraron." });
      navigate("/consultas");
    } catch (err) {
      toast({
        title: "Error eliminando consulta",
        description: err instanceof Error ? err.message : "Error",
        variant: "destructive",
      });
    } finally {
      setEliminando(false);
      setEliminarOpen(false);
    }
  };

  // Snapshot original de destinatarios para calcular diff al guardar.
  const [destinatariosInitial, setDestinatariosInitial] = useState<DestinatariosValue>(emptyDestinatariosValue());
  const [destinatariosOriginalSnap, setDestinatariosOriginalSnap] = useState<DestinatariosSnapshot | null>(null);
  // Output actual del selector (se actualiza por callback).
  const [destinatariosNuevo, setDestinatariosNuevo] = useState<DestinatariosOutput | null>(null);

  // Cache de listas de internos para hidratar el initial del selector.
  // No es crítico — si falla, el componente carga sus propias listas pero los
  // chips de "internos específicos" arrancan vacíos.
  const [internosPorCargoCache, setInternosPorCargoCache] = useState<{
    profesores: string[]; coordinadores: string[]; administrativos: string[]; secretarias: string[]; orientadores: string[];
  }>({ profesores: [], coordinadores: [], administrativos: [], secretarias: [], orientadores: [] });

  const esCreador = useMemo(() => {
    const sid = Number(getSession().id);
    return consulta?.creado_por != null && Number(consulta.creado_por) === sid;
  }, [consulta]);

  const abrirEditar = async () => {
    if (!consulta) return;
    setEditTitulo(consulta.titulo);
    setEditMensaje(consulta.mensaje_consulta);
    setEditCampos((consulta.campos_datos || []).map((c) => ({ orig: c, val: c })));

    // Construir snapshot ORIGINAL para el diff.
    const orig: DestinatariosSnapshot = {
      perfiles_objetivo: consulta.perfiles_objetivo || null,
      grados_objetivo: consulta.grados_objetivo || null,
      salones_objetivo: consulta.salones_objetivo || null,
      estudiantes_objetivo: consulta.estudiantes_objetivo || null,
      cargos_objetivo: consulta.cargos_objetivo || null,
      internos_objetivo: consulta.internos_objetivo || null,
      destinatarios_label: "",
      segmentos: [],
      isEmpty: false,
    };
    setDestinatariosOriginalSnap(orig);

    // Cargar internos para clasificar ids por cargo (mejor UX al editar).
    try {
      const { data: rawInt } = await supabase
        .from("Internos")
        .select("id, cargo")
        .in("cargo", ["Profesor(a)", "Coordinador(a)", "Administrativo(a)", "Secretaria General", "Orientador(a) Escolar"]);
      const grupos = {
        profesores: [] as string[], coordinadores: [] as string[],
        administrativos: [] as string[], secretarias: [] as string[], orientadores: [] as string[],
      };
      for (const r of (rawInt || []) as any[]) {
        const id = String(r.id);
        if (r.cargo === "Profesor(a)") grupos.profesores.push(id);
        else if (r.cargo === "Coordinador(a)") grupos.coordinadores.push(id);
        else if (r.cargo === "Administrativo(a)") grupos.administrativos.push(id);
        else if (r.cargo === "Secretaria General") grupos.secretarias.push(id);
        else if (r.cargo === "Orientador(a) Escolar") grupos.orientadores.push(id);
      }
      setInternosPorCargoCache(grupos);
      setDestinatariosInitial(destinatariosFromConsulta(consulta, grupos));
    } catch {
      setDestinatariosInitial(destinatariosFromConsulta(consulta));
    }
    setDestinatariosNuevo(null);
    setEditarOpen(true);
  };

  const guardarEdit = async () => {
    if (!consulta) return;
    if (!editTitulo.trim() || !editMensaje.trim()) {
      return toast({ title: "El título y el mensaje no pueden estar vacíos", variant: "destructive" });
    }
    if (destinatariosNuevo && destinatariosNuevo.isEmpty) {
      return toast({ title: "Selecciona al menos un perfil destinatario", variant: "destructive" });
    }
    // 0) Consulta tipo 'datos': campos del formulario (agregar / renombrar / eliminar).
    if (consulta.tipo === "datos") {
      const campos = editCampos.map((c) => c.val.trim()).filter(Boolean);
      if (campos.length === 0) {
        return toast({ title: "El formulario debe tener al menos un campo", variant: "destructive" });
      }
      if (new Set(campos).size !== campos.length) {
        return toast({ title: "Hay campos con el mismo nombre", variant: "destructive" });
      }
      const renombres: Record<string, string> = {};
      for (const c of editCampos) {
        const v = c.val.trim();
        if (c.orig && v && v !== c.orig) renombres[c.orig] = v;
      }
      const cambiaron = JSON.stringify(campos) !== JSON.stringify(consulta.campos_datos || []);
      if (cambiaron || Object.keys(renombres).length > 0) {
        setGuardandoEdit(true);
        try {
          await apiRequest(`/api/consultas/${consulta.id}/campos`, {
            method: "POST",
            body: JSON.stringify({ campos, renombres }),
          });
        } catch (err: any) {
          setGuardandoEdit(false);
          return toast({ title: "No se pudieron guardar los campos", description: err?.message || String(err), variant: "destructive" });
        }
      }
    }
    setGuardandoEdit(true);

    // 1) UPDATE incluyendo destinatarios si el selector emitió output.
    const updatePayload: any = {
      titulo: editTitulo.trim(),
      mensaje_consulta: editMensaje,
    };
    if (destinatariosNuevo) {
      updatePayload.perfiles_objetivo = destinatariosNuevo.perfiles_objetivo;
      updatePayload.grados_objetivo = destinatariosNuevo.grados_objetivo;
      updatePayload.salones_objetivo = destinatariosNuevo.salones_objetivo;
      updatePayload.estudiantes_objetivo = destinatariosNuevo.estudiantes_objetivo;
      updatePayload.cargos_objetivo = destinatariosNuevo.cargos_objetivo;
      updatePayload.internos_objetivo = destinatariosNuevo.internos_objetivo;
    }
    const { error } = await supabase
      .from("Consultas" as any)
      .update(updatePayload)
      .eq("id", consulta.id);
    if (error) {
      setGuardandoEdit(false);
      return toast({ title: "Error", description: error.message, variant: "destructive" });
    }

    // 2) Si hubo cambio de destinatarios, notificar SOLO a los nuevos.
    let notificoNuevos = false;
    if (destinatariosNuevo && destinatariosOriginalSnap) {
      const diff = diffNuevosDestinatarios(destinatariosOriginalSnap, destinatariosNuevo);
      if (diff) {
        try {
          const linkConsulta = `${window.location.origin}/consulta/${consulta.id}`;
          const mensajeBase = (consulta.mensaje_whatsapp || consulta.titulo || "Tienes una consulta pendiente").trim();
          const mensajeFinal = `${mensajeBase}\n\n👉 ${linkConsulta}`;
          await apiRequest("/api/comunicados/enviar", {
            method: "POST",
            body: JSON.stringify({
              como_normi: getSession().cargo === "Administrador",
              destinatarios_label: diff.destinatarios_label,
              mensaje: mensajeFinal,
              segmentos: diff.segmentos,
            }),
          });
          notificoNuevos = true;
        } catch (err: any) {
          console.error("[ConsultaDetalle] Error notificando nuevos destinatarios:", err);
          toast({
            title: "Consulta actualizada pero falló la notificación",
            description: "Los datos se guardaron. Reintenta o avisa manualmente a los nuevos destinatarios.",
            variant: "destructive",
          });
        }
      }
    }

    setGuardandoEdit(false);
    toast({
      title: "Consulta actualizada",
      description: notificoNuevos
        ? "Se envió notificación a los destinatarios nuevos."
        : "Los acudientes que entren al link verán los cambios.",
    });
    setEditarOpen(false);
    cargar();
  };

  const backLink = "/dashboard";

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <HeaderNormi backLink={backLink} />
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      </div>
    );
  }
  if (!consulta) {
    return (
      <div className="min-h-screen bg-background">
        <HeaderNormi backLink={backLink} />
        <div className="text-center py-12 text-muted-foreground">Consulta no encontrada.</div>
      </div>
    );
  }

  // Consulta tipo 'datos': las respuestas contienen datos personales, así que
  // solo las ven estos cargos (los demás internos solo diligencian su formulario).
  // El dbProxy aplica el mismo blindaje del lado del server.
  const esDatos = consulta.tipo === "datos";
  const CARGOS_VEN_RESPUESTAS = ["Administrador", "Rector", "Coordinador(a)", "Administrativo(a)", "Secretaria General"];
  const veRespuestas = !esDatos || CARGOS_VEN_RESPUESTAS.includes(getSession().cargo || "");

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi />
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4" data-guia="consultas.detalle_cargado">
        <div className="bg-card rounded-lg shadow-soft p-4">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/consultas")} className="text-primary hover:underline">Consultas</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium truncate max-w-[60vw]">{consulta.titulo}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <div className="flex gap-2">
            <Button onClick={copiarLinkConsulta} variant="outline" size="sm" className="bg-white" data-guia="consultas.boton_copiar_link">
              <Copy className="h-4 w-4 mr-1" />
              {linkCopiado ? "¡Copiado!" : "Copiar link"}
            </Button>
            {consulta.activa && esCreador && (
              <Button variant="outline" size="sm" onClick={abrirEditar} className="bg-white" data-guia="consultas.boton_editar">
                <Pencil className="h-4 w-4 mr-1" /> Editar
              </Button>
            )}
            {consulta.activa && (
              <Button variant="outline" size="sm" onClick={cerrarConsulta} className="bg-white" data-guia="consultas.boton_cerrar">
                Cerrar consulta
              </Button>
            )}
            {(() => {
              const s = getSession();
              const esCreador = s.id != null && consulta.creado_por != null && Number(s.id) === Number(consulta.creado_por);
              if (!esCreador && !isAdmin()) return null;
              return (
                <Button variant="outline" size="sm" onClick={() => setEliminarOpen(true)} className="bg-white text-destructive border-destructive/40 hover:bg-destructive/10" data-guia="consultas.boton_eliminar">
                  <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                </Button>
              );
            })()}
            {veRespuestas && (
              <Button onClick={exportarExcel} size="sm" data-guia="consultas.boton_excel">
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">{consulta.titulo}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {consulta.creado_por_cargo === "Administrador"
                    ? "Normi"
                    : `${consulta.creado_por_nombre || ""}${consulta.creado_por_cargo ? ` (${consulta.creado_por_cargo})` : ""}`}
                  {" "}—{" "}
                  {new Date(consulta.fecha_creacion).toLocaleString("es-CO")}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {!consulta.activa && <Badge variant="destructive">Cerrada</Badge>}
                  {consulta.requiere_firma && <Badge variant="outline">Requiere firma</Badge>}
                  {consulta.grados_objetivo && consulta.grados_objetivo.length > 0 && (
                    <Badge variant="secondary">{consulta.grados_objetivo.join(", ")}</Badge>
                  )}
                  {consulta.cargos_objetivo && consulta.cargos_objetivo.length > 0 && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-300">
                      {consulta.cargos_objetivo.join(", ")}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {consulta.mensaje_consulta && (
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="text-sm font-semibold text-foreground mb-2">Mensaje de la consulta</div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {consulta.mensaje_consulta}
              </div>
              {consulta.mensaje_whatsapp && (
                <details className="mt-3">
                  <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                    Ver mensaje corto de WhatsApp
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground bg-muted/50 rounded p-2">
                    {consulta.mensaje_whatsapp}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tipo 'datos': el interno destinatario diligencia en /consulta/:id */}
        {puedoResponder && consulta.activa && esDatos && (
          <Card className="border-primary/40">
            <CardContent className="p-4 sm:p-6 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                {miFechaRespuesta ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Ya diligenciaste este formulario</>
                ) : (
                  <>Debes diligenciar este formulario</>
                )}
              </div>
              <Button size="sm" onClick={() => navigate(`/consulta/${consulta.id}`)} data-guia="consultas.boton_diligenciar">
                {miFechaRespuesta ? "Ver o editar mis datos" : "Diligenciar formulario"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Panel "Tu respuesta" — sólo internos destinatarios */}
        {puedoResponder && consulta.activa && !esDatos && (
          <Card className="border-primary/40">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                  {miFechaRespuesta ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Ya respondiste esta consulta
                    </>
                  ) : (
                    <>Tu respuesta</>
                  )}
                </div>
                {miFechaRespuesta && !miEditando && (
                  <Button size="sm" variant="outline" onClick={() => setMiEditando(true)} data-guia="consultas.boton_editar_respuesta">
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                )}
              </div>

              {miFechaRespuesta && !miEditando ? (
                <div className="text-sm text-foreground">
                  Marcaste:{" "}
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold border bg-emerald-100 text-emerald-700 border-emerald-200">
                    {miOpcion}
                  </span>
                  <span className="text-muted-foreground text-xs ml-2">
                    {new Date(miFechaRespuesta).toLocaleString("es-CO", {
                      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2" data-guia="consultas.opcion_respuesta">
                    {consulta.opciones.map((op) => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => setMiOpcion(op)}
                        className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                          miOpcion === op
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground border-input hover:bg-accent"
                        }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>

                  {consulta.requiere_firma && (
                    <div>
                      <Label className="text-xs font-medium">Firma</Label>
                      <div className="border rounded-md bg-background" data-guia="consultas.firma_canvas">
                        <SignatureCanvas
                          ref={sigRef}
                          penColor="black"
                          canvasProps={{ className: "w-full h-32 rounded-md" }}
                          onEnd={guardarMiFirma}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        {miFirmaPreviaUrl && !miFirmaData && (
                          <a href={miFirmaPreviaUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                            Ver firma actual
                          </a>
                        )}
                        <button type="button" onClick={limpiarMiFirma} className="text-xs text-primary hover:underline ml-auto">
                          Limpiar firma
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    {miEditando && (
                      <Button variant="outline" size="sm" onClick={() => { setMiEditando(false); setMiFirmaData(null); sigRef.current?.clear(); }}>
                        Cancelar
                      </Button>
                    )}
                    <Button size="sm" onClick={enviarMiRespuesta} disabled={miEnviando || !miOpcion} data-guia="consultas.boton_enviar_respuesta">
                      {miEnviando ? "Enviando..." : miFechaRespuesta ? "Actualizar respuesta" : "Enviar respuesta"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tipo 'datos': tabla única con los datos diligenciados (solo cargos autorizados) */}
        {esDatos && veRespuestas && (
          <div className="mt-6">
            <h2 className="text-lg font-bold text-foreground mb-3">Datos diligenciados</h2>
            {respuestasDatos.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded-lg bg-white p-4">
                Nadie ha diligenciado el formulario todavía.
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg bg-white shadow-sm">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-primary text-primary-foreground">
                      <th className="text-left p-3 font-semibold border-r border-primary-foreground/20">Diligenciado por</th>
                      {respuestasDatos.some((r) => r.estudiante_id != null) && (
                        <th className="text-left p-3 font-semibold border-r border-primary-foreground/20">Estudiante</th>
                      )}
                      {(consulta.campos_datos || []).map((campo) => (
                        <th key={campo} className="text-left p-3 font-semibold border-r border-primary-foreground/20">{campo}</th>
                      ))}
                      {consulta.requiere_firma && (
                        <th className="text-center p-3 font-semibold border-r border-primary-foreground/20">Firma</th>
                      )}
                      <th className="text-center p-3 font-semibold last:border-r-0">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {respuestasDatos.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="p-3 border-r border-border font-medium whitespace-nowrap">{r.padre_nombre || r.padre_id}</td>
                        {respuestasDatos.some((x) => x.estudiante_id != null) && (
                          <td className="p-3 border-r border-border whitespace-nowrap">
                            {r.estudiante_id != null ? `${r.estudiante_nombre || ""} ${r.estudiante_apellidos || ""}`.trim() : "—"}
                          </td>
                        )}
                        {(consulta.campos_datos || []).map((campo) => (
                          <td key={campo} className="p-3 border-r border-border">{r.datos?.[campo] || "—"}</td>
                        ))}
                        {consulta.requiere_firma && (
                          <td className="p-3 border-r border-border text-center">
                            {r.firma_url ? (
                              <button type="button" onClick={() => setFirmaModal(r.firma_url)} className="text-primary hover:underline text-xs cursor-pointer">
                                Ver firma
                              </button>
                            ) : "—"}
                          </td>
                        )}
                        <td className="p-3 text-center whitespace-nowrap text-xs text-muted-foreground">
                          {r.fecha_respuesta ? new Date(r.fecha_respuesta).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {respuestasDatos.length} {respuestasDatos.length === 1 ? "persona ha diligenciado" : "personas han diligenciado"} el formulario.
              Esta información solo es visible para rectoría, coordinadores, administrativos y secretaría.
            </p>
          </div>
        )}

        {!esDatos && ((consulta.grados_objetivo && consulta.grados_objetivo.length > 0) ||
          (consulta.salones_objetivo && consulta.salones_objetivo.length > 0) ||
          (consulta.estudiantes_objetivo && consulta.estudiantes_objetivo.length > 0)) && (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-1">
            <label className="text-sm font-bold text-foreground block mb-1">Buscar estudiante</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-guia="consultas.buscar_estudiante"
                placeholder="Buscar estudiante..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-9 w-full bg-white shadow-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-foreground block mb-1">Estado</label>
            <select
              data-guia="consultas.filtro_estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm"
            >
              <option value="todos">Todos</option>
              <option value="con_respuesta">Con respuesta</option>
              <option value="sin_respuesta">Sin respuesta</option>
            </select>
          </div>
          {filtroEstado !== "sin_respuesta" && (
            <div>
              <label className="text-sm font-bold text-foreground block mb-1">Opción</label>
              <select
                data-guia="consultas.filtro_opcion"
                value={filtroOpcion}
                onChange={(e) => setFiltroOpcion(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm"
              >
                <option value="todas">Todas las opciones</option>
                {consulta.opciones.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-sm font-bold text-foreground block mb-1">Grado</label>
            <select
              data-guia="consultas.filtro_grado"
              value={filtroGrado}
              onChange={(e) => setFiltroGrado(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm"
            >
              <option value="todos">Todos los grados</option>
              {gradosPresentes.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-bold text-foreground block mb-1">Salón</label>
            <select
              value={filtroSalon}
              onChange={(e) => setFiltroSalon(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm"
            >
              <option value="todos">Todos los salones</option>
              {salonesPresentes.map((s) => (
                <option key={s} value={s}>
                  Salón {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto border rounded-lg bg-white shadow-sm" data-guia="consultas.boton_ver_firma">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                <th className="text-left p-3 font-semibold border-r border-primary-foreground/20 last:border-r-0">Estudiante</th>
                <th className="text-center p-3 font-semibold border-r border-primary-foreground/20 last:border-r-0">Grado</th>
                {Array.from({ length: maxAcudientes }).map((_, i) => (
                  <th key={i} className="text-center p-3 font-semibold border-r border-primary-foreground/20 last:border-r-0">
                    Acudiente {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedEstudiantes.length === 0 ? (
                <tr>
                  <td colSpan={2 + maxAcudientes} className="text-center py-6 text-muted-foreground">
                    No hay estudiantes que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                displayedEstudiantes.map((est) => {
                  const slots = Array.from({ length: maxAcudientes }, (_, i) => est.acudientes[i] || null);
                  return (
                    <tr key={est.estudiante_id} className="border-t hover:bg-accent/30">
                      <td className="p-2 font-medium border-r border-border">{est.nombre_completo}</td>
                      <td className="p-2 text-muted-foreground whitespace-nowrap border-r border-border text-center">
                        {est.grado} {est.salon}
                      </td>
                      {slots.map((ac, idx) => (
                        <td key={idx} className={`p-2 border-r border-border last:border-r-0 ${ac ? "" : "text-center"}`}>
                          {ac ? (
                            <div className="space-y-1">
                              <div className="text-sm font-semibold text-foreground truncate max-w-[180px]" title={ac.acudiente_nombre}>{ac.acudiente_nombre}</div>
                              {(() => {
                                const kids = ac.padre_id ? kidsDePadre(ac.padre_id) : [];
                                if (kids.length <= 1) return null; // si solo tiene 1 acudido (el del row), no agrega valor
                                const otros = kids.filter((k) => !k.startsWith(est.nombre_completo));
                                if (otros.length === 0) return null;
                                return (
                                  <div className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={otros.join(", ")}>
                                    Otros acudidos: {otros.join(", ")}
                                  </div>
                                );
                              })()}
                              {ac.opcion ? (
                                <div className="flex items-center gap-1">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${colorOpcion(ac.opcion)}`}>
                                    {ac.opcion}
                                  </span>
                                  {ac.firma_url && (
                                    <button
                                      type="button"
                                      onClick={() => setFirmaModal(ac.firma_url)}
                                      className="text-xs text-primary hover:underline"
                                      title="Ver firma"
                                    >
                                      <Eye className="h-3 w-3 inline" />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Sin respuesta</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="text-center text-xs text-muted-foreground pt-2 pb-4">
          Mostrando {displayedEstudiantes.length} de {filaEstudiantes.length} estudiantes
        </div>
        </>
        )}

        {!esDatos && ((consulta?.cargos_objetivo && consulta.cargos_objetivo.length > 0) || respuestasInternos.length > 0) ? (
          <div className="mt-6">
            <h2 className="text-lg font-bold text-foreground mb-3">Respuestas de internos</h2>
            <div className="overflow-x-auto border rounded-lg bg-white shadow-sm">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    <th className="text-left p-3 font-semibold border-r border-primary-foreground/20">Nombre</th>
                    <th className="text-center p-3 font-semibold border-r border-primary-foreground/20">Cargo</th>
                    <th className="text-center p-3 font-semibold border-r border-primary-foreground/20">Opción</th>
                    {consulta?.requiere_firma && (
                      <th className="text-center p-3 font-semibold border-r border-primary-foreground/20">Firma</th>
                    )}
                    <th className="text-center p-3 font-semibold last:border-r-0">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {respuestasInternos.length === 0 ? (
                    <tr>
                      <td colSpan={consulta?.requiere_firma ? 5 : 4} className="text-center py-6 text-muted-foreground">
                        Aún no hay respuestas de internos.
                      </td>
                    </tr>
                  ) : (
                    respuestasInternos.map((r) => (
                      <tr key={r.padre_id} className="border-t hover:bg-accent/30">
                        <td className="p-2 font-medium border-r border-border">{r.nombre}</td>
                        <td className="p-2 text-muted-foreground border-r border-border text-center">{r.cargo || "—"}</td>
                        <td className="p-2 border-r border-border text-center">
                          {r.opcion ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${colorOpcion(r.opcion)}`}>
                              {r.opcion}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Sin respuesta</span>
                          )}
                        </td>
                        {consulta?.requiere_firma && (
                          <td className="p-2 border-r border-border text-center">
                            {r.firma_url ? (
                              <button
                                type="button"
                                onClick={() => setFirmaModal(r.firma_url)}
                                className="text-xs text-primary hover:underline"
                              >
                                <Eye className="h-3 w-3 inline" /> Ver
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        <td className="p-2 text-muted-foreground text-center text-xs whitespace-nowrap">
                          {r.fecha_respuesta
                            ? new Date(r.fecha_respuesta).toLocaleString("es-CO", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="text-center text-xs text-muted-foreground pt-2 pb-8">
              {respuestasInternos.length} interno(s) {respuestasInternos.length === 1 ? "respondió" : "respondieron"}.
            </div>
          </div>
        ) : null}

        {/* Respuestas de estudiantes que respondieron directo (esquema nuevo) */}
        {!esDatos && respuestasEstudiantes.length > 0 ? (
          <div className="mt-6">
            <h2 className="text-lg font-bold text-foreground mb-3">Respuestas de estudiantes</h2>
            <div className="overflow-x-auto border rounded-lg bg-white shadow-sm">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    <th className="text-left p-3 font-semibold border-r border-primary-foreground/20">Nombre</th>
                    <th className="text-center p-3 font-semibold border-r border-primary-foreground/20">Grado / Salón</th>
                    <th className="text-center p-3 font-semibold border-r border-primary-foreground/20">Opción</th>
                    {consulta?.requiere_firma && (
                      <th className="text-center p-3 font-semibold border-r border-primary-foreground/20">Firma</th>
                    )}
                    <th className="text-center p-3 font-semibold last:border-r-0">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {respuestasEstudiantes.map((r) => (
                    <tr key={`est-${r.padre_id}-${r.estudiante_id}`} className="border-t hover:bg-accent/30">
                      <td className="p-2 font-medium border-r border-border">
                        {(r.estudiante_apellidos || "") + " " + (r.estudiante_nombre || "") || r.acudiente_nombre || `Estudiante ${r.padre_id}`}
                      </td>
                      <td className="p-2 text-muted-foreground border-r border-border text-center whitespace-nowrap">
                        {r.estudiante_grado || "—"} {r.estudiante_salon || ""}
                      </td>
                      <td className="p-2 border-r border-border text-center">
                        {r.opcion_seleccionada ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${colorOpcion(r.opcion_seleccionada)}`}>
                            {r.opcion_seleccionada}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Sin respuesta</span>
                        )}
                      </td>
                      {consulta?.requiere_firma && (
                        <td className="p-2 border-r border-border text-center">
                          {r.firma_url ? (
                            <button
                              type="button"
                              onClick={() => setFirmaModal(r.firma_url)}
                              className="text-xs text-primary hover:underline"
                            >
                              <Eye className="h-3 w-3 inline" /> Ver
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      <td className="p-2 text-muted-foreground text-center text-xs whitespace-nowrap">
                        {r.fecha_respuesta
                          ? new Date(r.fecha_respuesta).toLocaleString("es-CO", {
                              day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-center text-xs text-muted-foreground pt-2 pb-8">
              {respuestasEstudiantes.length} estudiante(s) {respuestasEstudiantes.length === 1 ? "respondió" : "respondieron"}.
            </div>
          </div>
        ) : null}
      </div>

      {firmaModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setFirmaModal(null)}
        >
          <div className="bg-white rounded-lg p-4 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Firma digital</div>
              <Button variant="ghost" size="sm" onClick={() => setFirmaModal(null)}>
                Cerrar
              </Button>
            </div>
            <img src={firmaModal} alt="Firma" className="w-full bg-gray-50 rounded border" />
          </div>
        </div>
      )}

      <Dialog open={eliminarOpen} onOpenChange={(o) => !eliminando && setEliminarOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar consulta</DialogTitle>
          </DialogHeader>
          <div className="py-3 text-sm text-foreground space-y-2">
            <p>
              Vas a eliminar <strong>"{consulta.titulo}"</strong> y todas sus respuestas.
            </p>
            <p className="text-muted-foreground">
              Esta acción no se puede deshacer. Las personas que ya respondieron tampoco verán la consulta más.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEliminarOpen(false)} disabled={eliminando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={eliminarConsulta} disabled={eliminando} data-guia="consultas.confirmar_eliminar">
              {eliminando ? "Eliminando..." : "Sí, eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editarOpen} onOpenChange={setEditarOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar consulta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="editTitulo">Título</Label>
              <Input
                id="editTitulo"
                data-guia="consultas.modal_editar_titulo"
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="editMensaje">Mensaje completo de la consulta</Label>
              <Textarea
                id="editMensaje"
                data-guia="consultas.modal_editar_mensaje"
                value={editMensaje}
                onChange={(e) => setEditMensaje(e.target.value)}
                rows={12}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lo verán tanto los nuevos destinatarios que entren al link, como los que ya respondieron y vuelvan a abrirlo.
              </p>
            </div>

            {consulta?.tipo === "datos" && (
              <div className="border-t pt-3 space-y-2" data-guia="consultas.modal_editar_campos">
                <Label className="font-medium">Campos a diligenciar</Label>
                <p className="text-xs text-muted-foreground">
                  Puedes agregar campos, renombrarlos (las respuestas ya dadas pasan al nombre nuevo) o eliminarlos
                  (se borran las respuestas que había en ese campo).
                </p>
                {editCampos.map((c, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      value={c.val}
                      onChange={(e) => setEditCampos(editCampos.map((x, j) => (j === i ? { ...x, val: e.target.value } : x)))}
                      placeholder={`Campo ${i + 1}`}
                    />
                    {editCampos.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setEditCampos(editCampos.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                {editCampos.length < 20 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditCampos([...editCampos, { orig: null, val: "" }])}>
                    <Plus className="h-3 w-3 mr-1" /> Añadir campo
                  </Button>
                )}
              </div>
            )}

            <div className="border-t pt-3" data-guia="consultas.modal_editar_destinatarios">
              <Label className="font-medium">Destinatarios</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Solo recibirán notificación los <strong>nuevos</strong> destinatarios que agregues. Los que ya estaban no reciben mensajes repetidos.
              </p>
              <DestinatariosSelector
                initial={destinatariosInitial}
                onChange={setDestinatariosNuevo}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditarOpen(false)} disabled={guardandoEdit}>
              Cancelar
            </Button>
            <Button onClick={guardarEdit} disabled={guardandoEdit} data-guia="consultas.modal_editar_guardar">
              {guardandoEdit ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
