import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { supabase } from "@/integrations/supabase/client";
import { getSession, hasValidSession, isPadreDeFamilia, isEstudiante } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Pencil } from "lucide-react";

interface ConsultaRow {
  id: number;
  titulo: string;
  mensaje_consulta: string;
  opciones: string[];
  requiere_firma: boolean;
  grados_objetivo: string[] | null;
  salones_objetivo: string[] | null;
  estudiantes_objetivo: number[] | null;
  cargos_objetivo: string[] | null;
  internos_objetivo: string[] | null;
  perfiles_objetivo: string[] | null;
  activa: boolean;
}

// Una "fila" de respuesta. Para padres, hay una fila por hijo. Para internos
// o estudiantes que respondan directo, hay una sola fila.
interface Respondent {
  // Clave única usada por React y por el state de respuestas/firmas.
  // Para padres: el id del estudiante. Para interno/estudiante directo: 0.
  key: number;
  // Etiquetas visibles
  nombre: string;
  apellidos: string;
  contexto: string | null; // "— Séptimo 3" para padre/estudiante; cargo para interno
  // Datos para upsert en Consultas_Respuestas
  tipoRespondente: "padre" | "interno" | "estudiante";
  estudianteId: number | null;
  estudianteNombre: string | null;
  estudianteApellidos: string | null;
  estudianteGrado: string | null;
  estudianteSalon: string | null;
  // Estado previo
  opcionPrevia: string | null;
  firmaPreviaUrl: string | null;
  firmaPreviaNombre: string | null;
  respondido: boolean;
}

// Mapeo entre etiqueta legacy (cargos_objetivo) y el cargo real del usuario.
const CARGO_OBJETIVO_MAP: Record<string, string[]> = {
  Rector: ["Rector"],
  Coordinadores: ["Coordinador(a)"],
  Profesores: ["Profesor(a)"],
  Secretarias: ["Secretaria General"],
  Administrativos: ["Administrativo(a)", "Administrador"],
  Orientadores: ["Orientador(a) Escolar"],
};

// Mapeo del valor "perfil" nuevo (tipo Comunicados) -> cargo real del usuario.
const PERFIL_OBJETIVO_MAP: Record<string, string[]> = {
  "Rector": ["Rector"],
  "Coordinadores": ["Coordinador(a)"],
  "Profesores": ["Profesor(a)"],
  "Secretaria General": ["Secretaria General"],
  "Administrativos": ["Administrativo(a)", "Administrador"],
  "Orientador(a) Escolar": ["Orientador(a) Escolar"],
};

function cargoMatchesConsulta(cargo: string | null, cargosObjetivo: string[] | null): boolean {
  if (!cargo || !cargosObjetivo || cargosObjetivo.length === 0) return false;
  for (const label of cargosObjetivo) {
    const cargosReales = CARGO_OBJETIVO_MAP[label] || [];
    if (cargosReales.includes(cargo)) return true;
  }
  return false;
}

function cargoMatchesPerfiles(cargo: string | null, perfilesObjetivo: string[] | null): boolean {
  if (!cargo || !perfilesObjetivo || perfilesObjetivo.length === 0) return false;
  for (const perfil of perfilesObjetivo) {
    const cargosReales = PERFIL_OBJETIVO_MAP[perfil] || [];
    if (cargosReales.includes(cargo)) return true;
  }
  return false;
}

// ¿El estudiante encaja en la audiencia académica de la consulta?
function estudianteEnAudiencia(
  estudianteId: number | null,
  grado: string | null,
  salon: string | null,
  consulta: ConsultaRow
): boolean {
  // Si la consulta apunta a estudiantes específicos, exigir match.
  if (consulta.estudiantes_objetivo && consulta.estudiantes_objetivo.length > 0) {
    return estudianteId != null && consulta.estudiantes_objetivo.includes(Number(estudianteId));
  }
  // Si no, filtrar por grado/salón si los hay.
  if (consulta.grados_objetivo && consulta.grados_objetivo.length > 0) {
    if (!grado || !consulta.grados_objetivo.includes(String(grado))) return false;
  }
  if (consulta.salones_objetivo && consulta.salones_objetivo.length > 0) {
    if (!salon || !consulta.salones_objetivo.includes(String(salon))) return false;
  }
  return true;
}

export default function ConsultaPublica() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const sigCanvas = useRef<SignatureCanvas>(null);

  const [loading, setLoading] = useState(true);
  const [consulta, setConsulta] = useState<ConsultaRow | null>(null);
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [esInterno, setEsInterno] = useState(false);
  // padreId / respondenteId — siempre el session.id (text), tanto para padre como para interno.
  const [respondenteId, setRespondenteId] = useState<string>("");
  const [respuestas, setRespuestas] = useState<Record<number, string>>({});
  const [firmaNombre, setFirmaNombre] = useState("");
  const [firmaData, setFirmaData] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) {
        setError("Link inválido.");
        setLoading(false);
        return;
      }

      // 1. Verificar sesión
      if (!hasValidSession()) {
        const redirect = encodeURIComponent(`/consulta/${id}`);
        navigate(`/?redirect=${redirect}`);
        return;
      }

      const session = getSession();
      const esPadre = isPadreDeFamilia();
      const esEst = isEstudiante();
      const cargo = session.cargo || null;

      // 2. Cargar la consulta
      const { data: c, error: errC } = await supabase
        .from("Consultas" as any)
        .select("*")
        .eq("id", id)
        .single();

      if (errC || !c) {
        setError("Consulta no encontrada.");
        setLoading(false);
        return;
      }
      const consultaRow = c as unknown as ConsultaRow;
      setConsulta(consultaRow);

      const sId = String(session.id || "");
      setRespondenteId(sId);

      // Detectar esquema nuevo vs viejo
      const usaPerfilesObjetivo = Array.isArray(consultaRow.perfiles_objetivo) && consultaRow.perfiles_objetivo.length > 0;

      // -------- Bloqueo de estudiantes --------
      // Sólo pueden responder si la consulta usa el esquema nuevo y los incluye en perfiles_objetivo.
      if (esEst) {
        if (!usaPerfilesObjetivo || !consultaRow.perfiles_objetivo!.includes("Estudiantes")) {
          setError("Esta consulta no aplica a su perfil.");
          setLoading(false);
          return;
        }
        // Cargar datos del estudiante desde Estudiantes (su id_estudiantil = session.id como number)
        const estIdNum = Number(session.id);
        const { data: estData } = await supabase
          .from("Estudiantes")
          .select("id_estudiantil, nombres, apellidos, grado, salon")
          .eq("id_estudiantil", estIdNum)
          .maybeSingle();
        if (!estData) {
          setError("No se pudo cargar tu perfil de estudiante.");
          setLoading(false);
          return;
        }
        if (!estudianteEnAudiencia(
          (estData as any).id_estudiantil,
          (estData as any).grado,
          (estData as any).salon,
          consultaRow
        )) {
          setError("Esta consulta no aplica a tu grado/salón.");
          setLoading(false);
          return;
        }
        // Construir respondente estudiante
        const r: Respondent = {
          key: estIdNum,
          nombre: (estData as any).nombres || session.nombres || "",
          apellidos: (estData as any).apellidos || session.apellidos || "",
          contexto: (estData as any).grado
            ? `— ${(estData as any).grado} ${(estData as any).salon || ""}`.trim()
            : null,
          tipoRespondente: "estudiante",
          estudianteId: estIdNum,
          estudianteNombre: (estData as any).nombres || null,
          estudianteApellidos: (estData as any).apellidos || null,
          estudianteGrado: (estData as any).grado || null,
          estudianteSalon: (estData as any).salon || null,
          opcionPrevia: null,
          firmaPreviaUrl: null,
          firmaPreviaNombre: null,
          respondido: false,
        };
        // Cargar respuesta previa: padre_id = sId, estudiante_id = mismo (un solo registro)
        const { data: prev } = await supabase
          .from("Consultas_Respuestas" as any)
          .select("*")
          .eq("consulta_id", consultaRow.id)
          .eq("padre_id", sId)
          .eq("estudiante_id", estIdNum);
        let firmaPreviaNombre = "";
        if (prev && prev.length > 0) {
          const p = prev[0];
          r.opcionPrevia = p.opcion_seleccionada;
          r.firmaPreviaUrl = p.firma_url;
          r.firmaPreviaNombre = p.firma_nombre;
          r.respondido = !!p.opcion_seleccionada;
          if (p.firma_nombre) firmaPreviaNombre = p.firma_nombre;
        }
        const preR: Record<number, string> = {};
        if (r.opcionPrevia) preR[r.key] = r.opcionPrevia;
        setRespondents([r]);
        setRespuestas(preR);
        setFirmaNombre(firmaPreviaNombre);
        if (r.respondido) setEnviado(true);
        setLoading(false);
        return;
      }

      // -------- Bloqueo por perfil (esquema nuevo) --------
      // Si la consulta usa perfiles_objetivo, verificar que el rol del usuario esté incluido.
      if (usaPerfilesObjetivo) {
        if (esPadre && !consultaRow.perfiles_objetivo!.includes("Padres de familia")) {
          setError("Esta consulta no aplica a su perfil.");
          setLoading(false);
          return;
        }
        if (!esPadre && cargo && !cargoMatchesPerfiles(cargo, consultaRow.perfiles_objetivo)) {
          setError("Esta consulta no aplica a su rol.");
          setLoading(false);
          return;
        }
        // Si hay internos_objetivo específico, exigir match para internos (no para padres)
        if (!esPadre && Array.isArray(consultaRow.internos_objetivo) && consultaRow.internos_objetivo!.length > 0) {
          if (!consultaRow.internos_objetivo!.includes(sId)) {
            setError("Esta consulta no aplica a usted específicamente.");
            setLoading(false);
            return;
          }
        }
      }

      if (esPadre) {
        // ------ Flujo padre (Fase 10: Acudientes + JOIN con Estudiantes) ------
        const { data: acudiente, error: errA } = await supabase
          .from("Acudientes")
          .select("id, acudido1_id, acudido2_id, acudido3_id, acudido4_id")
          .eq("id", session.id)
          .maybeSingle();

        let hijoIds: (number | null)[] = [];
        if (acudiente) {
          hijoIds = [acudiente.acudido1_id, acudiente.acudido2_id, acudiente.acudido3_id, acudiente.acudido4_id];
        } else {
          // Fallback legacy (mientras dure la transición a Acudientes)
          const { data: perfilPadre } = await supabase
            .from("Perfiles_Generales")
            .select("padre_id, padre_estudiante1_id, padre_estudiante2_id, padre_estudiante3_id, padre_estudiante4_id")
            .eq("padre_id", session.id)
            .eq("perfil", "Padre de familia")
            .maybeSingle();
          if (!perfilPadre) {
            setError("No se pudo cargar su perfil de acudiente.");
            setLoading(false);
            return;
          }
          hijoIds = [(perfilPadre as any).padre_estudiante1_id, (perfilPadre as any).padre_estudiante2_id, (perfilPadre as any).padre_estudiante3_id, (perfilPadre as any).padre_estudiante4_id];
        }

        const padreId = session.id;
        setRespondenteId(padreId);

        // Resolver datos de cada hijo desde Estudiantes
        const idsValidos = hijoIds.filter((h): h is number => h != null);
        let hijosData: any[] = [];
        if (idsValidos.length > 0) {
          const { data } = await supabase
            .from("Estudiantes")
            .select("id_estudiantil, nombres, nombres, apellidos, apellidos, grado, salon")
            .in("id_estudiantil", idsValidos);
          hijosData = data || [];
        }

        const hijoMap = new Map<string, any>();
        for (const h of hijosData) hijoMap.set(String(h.id_estudiantil), h);

        // Filtrar hijos que coinciden con la consulta
        const todosHijos: Respondent[] = [];
        for (const idx of [1, 2, 3, 4]) {
          const hijoId = hijoIds[idx - 1];
          if (!hijoId) continue;
          const h = hijoMap.get(String(hijoId));
          const nombre = h ? (h.nombres || h.nombres || "") : "";
          const apellidos = h ? (h.apellidos || h.apellidos || "") : "";
          const grado = h ? h.grado : "";
          const salon = h ? h.salon : "";

          let aplica = true;
          if (consultaRow.estudiantes_objetivo && consultaRow.estudiantes_objetivo.length > 0) {
            aplica = consultaRow.estudiantes_objetivo.includes(Number(hijoId));
          } else {
            if (consultaRow.grados_objetivo && consultaRow.grados_objetivo.length > 0) {
              if (!grado || !consultaRow.grados_objetivo.includes(String(grado))) aplica = false;
            }
            if (aplica && consultaRow.salones_objetivo && consultaRow.salones_objetivo.length > 0) {
              if (!salon || !consultaRow.salones_objetivo.includes(String(salon))) aplica = false;
            }
          }

          if (aplica) {
            todosHijos.push({
              key: Number(hijoId),
              nombre: nombre || "",
              apellidos: apellidos || "",
              contexto: grado ? `— ${grado} ${salon || ""}`.trim() : null,
              tipoRespondente: "padre",
              estudianteId: Number(hijoId),
              estudianteNombre: nombre || null,
              estudianteApellidos: apellidos || null,
              estudianteGrado: grado ? String(grado) : null,
              estudianteSalon: salon ? String(salon) : null,
              opcionPrevia: null,
              firmaPreviaUrl: null,
              firmaPreviaNombre: null,
              respondido: false,
            });
          }
        }

        if (todosHijos.length === 0) {
          setError("Esta consulta no aplica a sus hijos registrados.");
          setLoading(false);
          return;
        }

        // Cargar respuestas previas del padre
        const { data: prev } = await supabase
          .from("Consultas_Respuestas" as any)
          .select("*")
          .eq("consulta_id", consultaRow.id)
          .eq("padre_id", padreId);

        const prevMap = new Map<number, any>();
        (prev || []).forEach((r: any) => {
          if (r.estudiante_id != null) prevMap.set(Number(r.estudiante_id), r);
        });

        const preR: Record<number, string> = {};
        let firmaPreviaNombre = "";
        todosHijos.forEach((h) => {
          const p = prevMap.get(h.key);
          if (p) {
            h.opcionPrevia = p.opcion_seleccionada;
            h.firmaPreviaUrl = p.firma_url;
            h.firmaPreviaNombre = p.firma_nombre;
            h.respondido = !!p.opcion_seleccionada;
            if (p.opcion_seleccionada) preR[h.key] = p.opcion_seleccionada;
            if (p.firma_nombre) firmaPreviaNombre = p.firma_nombre;
          }
        });

        setRespondents(todosHijos);
        setRespuestas(preR);
        setFirmaNombre(firmaPreviaNombre);
        if (todosHijos.every((h) => h.respondido)) setEnviado(true);
        setLoading(false);
        return;
      }

      // ------ Flujo interno ------
      // Verificar que el cargo del interno esté entre los cargos_objetivo de la consulta
      if (!cargoMatchesConsulta(cargo, consultaRow.cargos_objetivo)) {
        setError("Esta consulta no aplica a su rol.");
        setLoading(false);
        return;
      }

      setEsInterno(true);
      const internoRespondent: Respondent = {
        key: 0, // sentinel — solo uno
        nombre: session.nombres || "",
        apellidos: session.apellidos || "",
        contexto: cargo,
        tipoRespondente: "interno",
        estudianteId: null,
        estudianteNombre: null,
        estudianteApellidos: null,
        estudianteGrado: null,
        estudianteSalon: null,
        opcionPrevia: null,
        firmaPreviaUrl: null,
        firmaPreviaNombre: null,
        respondido: false,
      };

      // Cargar respuesta previa del interno (estudiante_id IS NULL)
      const { data: prev } = await supabase
        .from("Consultas_Respuestas" as any)
        .select("*")
        .eq("consulta_id", consultaRow.id)
        .eq("padre_id", sId)
        .is("estudiante_id", null);

      let firmaPreviaNombre = "";
      if (prev && prev.length > 0) {
        const p = prev[0];
        internoRespondent.opcionPrevia = p.opcion_seleccionada;
        internoRespondent.firmaPreviaUrl = p.firma_url;
        internoRespondent.firmaPreviaNombre = p.firma_nombre;
        internoRespondent.respondido = !!p.opcion_seleccionada;
        if (p.firma_nombre) firmaPreviaNombre = p.firma_nombre;
      }

      const preR: Record<number, string> = {};
      if (internoRespondent.opcionPrevia) preR[0] = internoRespondent.opcionPrevia;

      setRespondents([internoRespondent]);
      setRespuestas(preR);
      setFirmaNombre(firmaPreviaNombre);
      if (internoRespondent.respondido) setEnviado(true);
      setLoading(false);
    })();
  }, [id, navigate]);

  const limpiarFirma = () => {
    sigCanvas.current?.clear();
    setFirmaData(null);
  };

  const handleFirmaEnd = () => {
    if (sigCanvas.current) {
      const dataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL("image/png");
      setFirmaData(dataUrl);
    }
  };

  const uploadFirma = async (dataUrl: string): Promise<string | null> => {
    try {
      const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (!match) return null;
      const mime = match[1];
      const ext = mime.split("/")[1] || "png";
      const bin = atob(match[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const session = getSession();
      const filename = `firmas-consultas/consulta-${consulta?.id}-${esInterno ? "interno" : "padre"}-${session.id}-${Date.now()}.${ext}`;
      const { error: errUp } = await supabase.storage
        .from("normi-archivos")
        .upload(filename, blob, { contentType: mime, upsert: true });
      if (errUp) {
        console.error("Error subiendo firma:", errUp);
        return null;
      }
      const { data: pub } = supabase.storage.from("normi-archivos").getPublicUrl(filename);
      return pub?.publicUrl || null;
    } catch (err) {
      console.error("Error procesando firma:", err);
      return null;
    }
  };

  const handleEnviar = async () => {
    if (!consulta) return;

    const aUpsertar = respondents.filter((r) => respuestas[r.key]);
    const aBorrar = respondents.filter((r) => !respuestas[r.key] && r.respondido);

    if (aUpsertar.length === 0 && aBorrar.length === 0) {
      return toast({ title: "Seleccione al menos una respuesta", variant: "destructive" });
    }

    if (aUpsertar.length > 0 && consulta.requiere_firma && !firmaData) {
      const hayFirmaPrevia = aUpsertar.some((r) => r.firmaPreviaUrl);
      if (!hayFirmaPrevia) {
        return toast({ title: "Por favor firme antes de enviar", variant: "destructive" });
      }
    }

    const session = getSession();
    setEnviando(true);
    try {
      let firmaUrl: string | null = null;
      if (firmaData) firmaUrl = await uploadFirma(firmaData);

      // 1. Borrar respuestas que el respondiente quitó
      for (const r of aBorrar) {
        let q = supabase
          .from("Consultas_Respuestas" as any)
          .delete()
          .eq("consulta_id", consulta.id)
          .eq("padre_id", respondenteId);
        if (r.estudianteId == null) {
          q = q.is("estudiante_id", null);
        } else {
          q = q.eq("estudiante_id", r.estudianteId);
        }
        const { error: errDel } = await q;
        if (errDel) throw new Error(errDel.message);
      }

      // 2. Insertar/actualizar
      const now = new Date().toISOString();
      for (const r of aUpsertar) {
        const update: any = {
          consulta_id: consulta.id,
          padre_id: respondenteId,
          padre_nombre: `${session.nombres || ""} ${session.apellidos || ""}`.trim(),
          padre_telefono: null,
          tipo_respondente: r.tipoRespondente,
          estudiante_id: r.estudianteId,
          estudiante_nombre: r.estudianteNombre,
          estudiante_apellidos: r.estudianteApellidos,
          estudiante_grado: r.estudianteGrado,
          estudiante_salon: r.estudianteSalon,
          opcion_seleccionada: respuestas[r.key],
          firma_nombre:
            firmaNombre ||
            r.firmaPreviaNombre ||
            `${session.nombres || ""} ${session.apellidos || ""}`.trim() ||
            null,
        };
        if (firmaUrl) update.firma_url = firmaUrl;
        else if (r.firmaPreviaUrl) update.firma_url = r.firmaPreviaUrl;

        if (r.respondido) {
          update.fecha_edicion = now;
        } else {
          update.fecha_respuesta = now;
          update.fecha_invitacion = now;
        }

        const { error: errUp } = await supabase
          .from("Consultas_Respuestas" as any)
          .upsert(update, { onConflict: "consulta_id,padre_id,estudiante_id" });

        if (errUp) throw new Error(errUp.message);
      }

      toast({ title: "Respuesta enviada", description: "Gracias por su respuesta." });
      setEnviado(true);
      setModoEdicion(false);
      setFirmaData(null);

      // Refrescar previas
      const { data: newResp } = await supabase
        .from("Consultas_Respuestas" as any)
        .select("*")
        .eq("consulta_id", consulta.id)
        .eq("padre_id", respondenteId);

      const prevMap = new Map<number, any>();
      const prevInterno = (newResp || []).find((r: any) => r.estudiante_id == null);
      (newResp || []).forEach((r: any) => {
        if (r.estudiante_id != null) prevMap.set(Number(r.estudiante_id), r);
      });

      setRespondents((rs) =>
        rs.map((r) => {
          const p = r.estudianteId == null ? prevInterno : prevMap.get(r.estudianteId);
          if (!p) return r;
          return {
            ...r,
            opcionPrevia: p.opcion_seleccionada,
            firmaPreviaUrl: p.firma_url,
            firmaPreviaNombre: p.firma_nombre,
            respondido: !!p.opcion_seleccionada,
          };
        })
      );
    } catch (err) {
      toast({
        title: "Error enviando respuesta",
        description: err instanceof Error ? err.message : "Error",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    );

  if (error || !consulta)
    return (
      <div className="min-h-screen bg-background">
        <HeaderNormi backLink="/dashboard-padre" />
        <div className="max-w-md mx-auto p-6 text-center">
          <Card>
            <CardContent className="p-6">
              <div className="text-destructive font-medium mb-2">No pudimos cargar la consulta</div>
              <div className="text-sm text-muted-foreground">{error || "Error desconocido."}</div>
              <Button className="mt-4" onClick={() => navigate("/")}>
                Ir al inicio
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );

  const readonly = enviado && !modoEdicion;
  const sesion = getSession();
  const backLink = esInterno
    ? sesion.cargo === "Administrador"
      ? "/dashboard-admin"
      : "/dashboard-rector"
    : "/dashboard-padre";

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink={backLink} />
      <div className="max-w-2xl mx-auto space-y-4 px-4 py-6">
        <div className="flex items-center gap-3">
          <Button onClick={() => navigate(esInterno ? backLink : "/padre/consultas")} variant="outline" size="sm">
            ← Volver
          </Button>
        </div>
        <div className="text-center mb-2">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{consulta.titulo}</h1>
          {sesion.nombres && (
            <p className="text-sm text-muted-foreground mt-1">
              Estimado(a) <strong>{sesion.nombres} {sesion.apellidos}</strong>
            </p>
          )}
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {consulta.mensaje_consulta}
            </div>
          </CardContent>
        </Card>

        {readonly && (
          <Card className="border-green-500/50 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-green-900 dark:text-green-100">Ya ha respondido esta consulta</div>
                <div className="text-sm text-green-800 dark:text-green-200 mt-1">
                  Puede editar sus respuestas si lo desea.
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setModoEdicion(true)}>
                <Pencil className="h-3 w-3 mr-1" /> Editar
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="font-semibold text-foreground">
              {respondents.length > 1
                ? "Indique su respuesta para cada estudiante:"
                : esInterno
                ? "Indique su respuesta:"
                : "Indique su respuesta:"}
            </div>
            {respondents.map((r) => (
              <div key={r.key} className="border rounded-lg p-3">
                <div className="font-medium mb-2">
                  {r.nombre} {r.apellidos}
                  {r.contexto && (
                    <span className="text-muted-foreground text-sm font-normal"> {r.contexto}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {consulta.opciones.map((op) => (
                    <button
                      key={op}
                      type="button"
                      disabled={readonly || !consulta.activa}
                      onClick={() => {
                        const current = respuestas[r.key];
                        const next = { ...respuestas };
                        if (current === op) {
                          delete next[r.key];
                        } else {
                          next[r.key] = op;
                        }
                        setRespuestas(next);
                      }}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        respuestas[r.key] === op
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-accent"
                      } ${readonly || !consulta.activa ? "cursor-not-allowed opacity-80" : "cursor-pointer"}`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {consulta.requiere_firma && !readonly && consulta.activa && (
          <Card>
            <CardContent className="p-4 sm:p-6 space-y-3">
              <div>
                <Label className="font-medium">Firma digital</Label>
                <p className="text-xs text-muted-foreground mb-2">Firme con el dedo o el mouse en el recuadro.</p>
                <div className="border-2 border-dashed border-border rounded-lg bg-white">
                  <SignatureCanvas
                    ref={sigCanvas}
                    penColor="black"
                    canvasProps={{
                      className: "w-full touch-none",
                      style: { width: "100%", height: "180px" },
                    }}
                    onEnd={handleFirmaEnd}
                  />
                </div>
                <button
                  type="button"
                  onClick={limpiarFirma}
                  className="text-xs px-3 py-1 mt-2 rounded border border-border text-muted-foreground hover:bg-accent cursor-pointer"
                >
                  Borrar firma
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {!readonly && consulta.activa && (
          <Button size="lg" className="w-full" onClick={handleEnviar} disabled={enviando}>
            {enviando ? "Enviando..." : modoEdicion ? "Actualizar respuesta" : "Enviar respuesta"}
          </Button>
        )}

        {!consulta.activa && (
          <Card className="border-destructive/50">
            <CardContent className="p-4 text-center text-sm text-destructive">
              Esta consulta ya fue cerrada. No se pueden enviar más respuestas.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
