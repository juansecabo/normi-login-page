import { useEffect, useRef, useState } from "react";
import {
  GraduationCap, Users, ShieldCheck, Briefcase, HeartHandshake, BookOpen,
  Backpack, UsersRound, Plus, Check, Loader2, Search, ClipboardList, Pencil, Trash2, X, DoorOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiClient } from "@/lib/apiClient";
import { getSession } from "@/hooks/useSession";
import { rankGrado, NIVEL_DE_GRADO } from "@/utils/grados";
import PanelControl from "@/pages/rector/PanelControl";
import PhoneInput from "@/components/PhoneInput";
import { capitalizarNombre } from "@/utils/texto";
import { cargoSegunGenero } from "@/lib/entrevistadores";

/**
 * "Personas del colegio": tarjetas por rol → página del cargo con su lista y
 * pop-up de agregar (autocompletado por cédula; extras: niveles del
 * coordinador y dirección de grupo del profesor). Compartido por:
 *  - El wizard "Crear Institución" del SuperAdmin (con `colegioId`).
 *  - "Configurar Institución" del Rector/Admin (sin `colegioId` → usa el JWT).
 *
 * Consume /api/institucion/{personas,usuario,interno} (multi-tenant; el
 * SuperAdmin pasa colegio_id, para el resto manda el JWT). La escritura del
 * backend es de Rector/Administrador (y SuperAdmin).
 */

const ROLES_STAFF: { cargo: string; label: string; Icono: typeof Users }[] = [
  { cargo: "Administrador", label: "Administrador(a)", Icono: ShieldCheck },
  { cargo: "Rector", label: "Rector(a)", Icono: GraduationCap },
  { cargo: "Secretaria General", label: "Secretaría", Icono: ClipboardList },
  { cargo: "Coordinador(a)", label: "Coordinadores", Icono: Users },
  { cargo: "Administrativo(a)", label: "Administrativos", Icono: Briefcase },
  { cargo: "Orientador(a) Escolar", label: "Orientación escolar", Icono: HeartHandshake },
  { cargo: "Profesor(a)", label: "Profesores", Icono: BookOpen },
  { cargo: "Portero", label: "Porteros", Icono: DoorOpen },
];
const NIVELES_COORDINA = ["Preescolar", "Primaria", "Secundaria", "Media"];

// Jerarquía (espejo de services/jerarquia.ts del server): cada cargo agrega
// desde su propio nivel hacia abajo; el techo (Administrador) solo lo agrega
// otro Administrador y el Profesor no agrega personal (solo est/acu de su grupo).
const CADENA = ROLES_STAFF.map((r) => r.cargo);
const desdeCargo = (c: string) => CADENA.slice(CADENA.indexOf(c));
const AGREGABLES: Record<string, string[]> = {
  Administrador: desdeCargo("Administrador"),
  Rector: desdeCargo("Rector"),
  "Secretaria General": desdeCargo("Secretaria General"),
  "Coordinador(a)": desdeCargo("Coordinador(a)"),
  "Administrativo(a)": desdeCargo("Administrativo(a)"),
};

interface Props {
  /** Si se pasa, opera sobre ese colegio (modo SuperAdmin). Si no, sobre el del JWT. */
  colegioId?: string;
  /** Rol seleccionado controlado desde afuera (el wizard lo lleva en la URL). */
  rol?: string | null;
  setRol?: (r: string | null) => void;
  /** Se llama tras agregar una persona (refrescar conteos externos). */
  onChanged?: () => Promise<void> | void;
}

const PersonasColegioEditor = ({ colegioId, rol: rolProp, setRol: setRolProp, onChanged }: Props) => {
  const { toast } = useToast();
  const qCid = colegioId ? `?colegio_id=${encodeURIComponent(colegioId)}` : "";
  const withCid = (body: Record<string, unknown>) => (colegioId ? { ...body, colegio_id: colegioId } : body);

  // Rol seleccionado: controlado (wizard, en la URL) o interno (Configurar Institución).
  const [rolInterno, setRolInterno] = useState<string | null>(null);
  const rol = rolProp !== undefined ? rolProp : rolInterno;
  const setRol = setRolProp || setRolInterno;

  // Jerarquía: las tarjetas visibles/agregables dependen del cargo del usuario
  // (el SuperAdmin del wizard ve todas). Estudiantes/Acudientes los gestionan
  // todos los que entran acá; el Profesor director solo los de SU grupo.
  const cargoSesion = getSession().cargo || "";
  const cargosAgregables = colegioId ? CADENA : (AGREGABLES[cargoSesion] || []);

  // Dirección de grupo del profesor: limita estudiantes/acudientes a su grupo.
  const [grupoDirector, setGrupoDirector] = useState<{ grado: string; salon: string } | null>(null);
  useEffect(() => {
    if (colegioId || cargoSesion !== "Profesor(a)") return;
    supabase.from("Internos").select("direccion_de_grupo").eq("id", parseInt(getSession().id!)).maybeSingle()
      .then(({ data }) => {
        const dir = String((data as { direccion_de_grupo?: string } | null)?.direccion_de_grupo || "").trim();
        const corte = dir.lastIndexOf(" ");
        if (dir && corte > 0) setGrupoDirector({ grado: dir.slice(0, corte), salon: dir.slice(corte + 1) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  // Cédula de la persona en edición (null = el pop-up está agregando).
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmQuitar, setConfirmQuitar] = useState<any | null>(null);
  const [quitando, setQuitando] = useState(false);
  // Datos personales (Usuarios) solo los edita el Administrador (o SuperAdmin).
  // Datos personales de Usuarios editables por todos los roles del panel
  // (decisión 2026-07-09); el server aplica la jerarquía (nadie edita a un
  // rango igual o superior). El profesor director no gestiona internos.
  const esAdminUsuarios = !!colegioId || cargoSesion !== "Profesor(a)";
  // Cambiar la cédula (migración global) SOLO lo permite el Administrador (igual
  // que el endpoint /auth/cambiar-cedula del server).
  const esAdmin = cargoSesion === "Administrador";
  // Busqueda flexible dentro del cargo (nombre, apellido o cedula; sin tildes).
  const [busqueda, setBusqueda] = useState("");
  const [cedula, setCedula] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [genero, setGenero] = useState("");          // "M" | "F" — obligatorio
  const [fechaNac, setFechaNac] = useState("");       // YYYY-MM-DD — opcional
  // Extras por cargo
  const [niveles, setNiveles] = useState<string[]>([]);          // Coordinador(a)
  const [esDirector, setEsDirector] = useState(false);            // Profesor(a)
  const [dirGrado, setDirGrado] = useState("");
  const [dirSalon, setDirSalon] = useState("");
  // Carga académica del profesor (tabla "Asignación Profesores"). Solo la
  // gestionan los roles con permiso de escritura en el dbProxy (ADMIN_ONLY) y
  // no aplica en el wizard del SuperAdmin (sin colegio en el JWT).
  const puedeCarga = !colegioId && ["Administrador", "Rector", "Coordinador(a)"].includes(cargoSesion);
  const [asignaturasCol, setAsignaturasCol] = useState<string[]>([]);
  const [cargas, setCargas] = useState<any[]>([]);                 // filas existentes (edición)
  const [cargasPend, setCargasPend] = useState<{ asignaturas: string[]; grados: string[]; salones: string[] }[]>([]); // al agregar
  const [nvAsigs, setNvAsigs] = useState<string[]>([]);
  const [nvGrados, setNvGrados] = useState<string[]>([]);
  const [nvSalones, setNvSalones] = useState<string[]>([]);
  const [guardandoCarga, setGuardandoCarga] = useState(false);
  // Asignación en edición: rowId (fila existente en BD) o idx (fila pendiente al crear).
  const [editCarga, setEditCarga] = useState<{ rowId?: number; idx?: number } | null>(null);
  // Foto ampliada en pop-up al hacer clic (como en el Panel de Control).
  const [fotoGrande, setFotoGrande] = useState<{ url: string; nombre: string } | null>(null);
  // Filtros de la lista de profesores por su carga académica (o dirección de grupo).
  const [filtroNivelP, setFiltroNivelP] = useState("todos");
  const [filtroGradoP, setFiltroGradoP] = useState("todos");
  const [filtroSalonP, setFiltroSalonP] = useState("todos");
  const [asigsProf, setAsigsProf] = useState<any[]>([]);   // todas las asignaciones del colegio
  const [guardando, setGuardando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  // Si la cédula ya existe en Usuarios, los datos vienen de ahí y NO se pueden
  // editar (Usuarios es la única fuente de verdad de nombres/teléfono).
  const [bloqueado, setBloqueado] = useState(false);
  // Espejo de `bloqueado` para leerlo dentro del efecto sin meterlo en deps.
  const bloqueadoRef = useRef(false);
  useEffect(() => { bloqueadoRef.current = bloqueado; }, [bloqueado]);

  // Limpia SOLO el formulario del pop-up — no toca la búsqueda ni los filtros
  // de la lista (editar a alguien no debe deshacer el filtrado en curso).
  const reset = () => {
    setCedula(""); setNombres(""); setApellidos(""); setTelefono(""); setGenero(""); setFechaNac("");
    setNiveles([]); setEsDirector(false); setDirGrado(""); setDirSalon(""); setBloqueado(false); setEditando(null);
    setCargas([]); setCargasPend([]); setNvAsigs([]); setNvGrados([]); setNvSalones([]);
  };
  // Limpia la búsqueda y los filtros de la lista (al cambiar de rol).
  const resetListado = () => {
    setBusqueda("");
    setFiltroNivelP("todos"); setFiltroGradoP("todos"); setFiltroSalonP("todos");
  };
  // Al dejar de coincidir con una persona encontrada, limpia los datos que se
  // habían autocompletado (pero NO lo que el usuario escribió a mano).
  const limpiarSiEstabaBloqueado = () => {
    if (bloqueadoRef.current) { setNombres(""); setApellidos(""); setTelefono(""); setGenero(""); setFechaNac(""); }
    setBloqueado(false);
  };

  // Personas ya agregadas (para las listas y los conteos de las tarjetas).
  const [personas, setPersonas] = useState<{ internos: any[]; estudiantes: any[]; acudientes: any[] }>({ internos: [], estudiantes: [], acudientes: [] });
  const [cargandoPersonas, setCargandoPersonas] = useState(true);
  const cargarPersonas = async () => {
    try { setPersonas(await apiRequest(`/api/institucion/personas${qCid}`)); } catch { /* noop */ }
    finally { setCargandoPersonas(false); }
  };
  useEffect(() => { cargarPersonas(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [colegioId]);

  // Estructura del colegio (grados/salones) para la dirección de grupo del profesor.
  const [gradosCol, setGradosCol] = useState<{ grado: string }[]>([]);
  const [salonesCol, setSalonesCol] = useState<{ grado: string; salon: string }[]>([]);
  useEffect(() => {
    apiRequest<{ grados: any[]; salones: any[] }>(`/api/institucion/estructura${qCid}`)
      .then((r) => {
        const salones = r.salones || [];
        // Colegios que importaron su estructura por salones (Normal,
        // Pestalozziano) tienen Grados_Colegio vacía pero cada salón trae su
        // grado — los grados se derivan de ahí.
        const grados = (r.grados && r.grados.length > 0)
          ? r.grados
          : Array.from(new Set(salones.map((s: any) => String(s.grado)))).map((g) => ({ grado: g }));
        setGradosCol(grados.sort((a: any, b: any) => rankGrado(a.grado) - rankGrado(b.grado)));
        setSalonesCol(salones);
      })
      .catch(() => { /* sin estructura aún: el selector sale vacío */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colegioId]);
  const salonesDelGrado = salonesCol.filter((s) => s.grado === dirGrado).map((s) => s.salon).sort((a, b) => Number(a) - Number(b));
  const salonesUnicos = Array.from(new Set(salonesCol.map((s) => String(s.salon)))).sort((a, b) => Number(a) - Number(b));

  // Asignaturas activas del colegio (para la carga académica del profesor).
  useEffect(() => {
    if (!puedeCarga) return;
    supabase.from("Asignaturas").select("nombre").eq("activa", true).order("nombre")
      .then(({ data }) => setAsignaturasCol((data || []).map((a: any) => String(a.nombre))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeCarga]);

  // Asignaciones del colegio: alimentan los filtros nivel/grado/salón de la
  // lista de profesores. Solo en el colegio propio (el wizard SuperAdmin no
  // tiene colegio en el JWT).
  useEffect(() => {
    if (colegioId || rol !== "Profesor(a)") return;
    supabase.from("Asignación Profesores").select('id, "Grado(s)", "Salon(es)"')
      .then(({ data }) => setAsigsProf(data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol]);

  // ¿El profesor coincide con los filtros? Por una fila de su carga que cumpla
  // TODAS las condiciones activas, o por su dirección de grupo.
  const profMatchFiltros = (p: any) => {
    if (filtroNivelP === "todos" && filtroGradoP === "todos" && filtroSalonP === "todos") return true;
    const dir = String(p.direccion_de_grupo || "").trim();
    const corte = dir.lastIndexOf(" ");
    const dirGradoP = dir && corte > 0 ? dir.slice(0, corte) : "";
    const dirSalonP = dir && corte > 0 ? dir.slice(corte + 1) : "";
    const dirOk =
      (filtroNivelP === "todos" || NIVEL_DE_GRADO[dirGradoP] === filtroNivelP) &&
      (filtroGradoP === "todos" || dirGradoP === filtroGradoP) &&
      (filtroSalonP === "todos" || dirSalonP === filtroSalonP);
    if (dir && dirOk) return true;
    return asigsProf.some((a) => {
      if (String(a.id) !== String(p.id)) return false;
      const grados: string[] = a["Grado(s)"] || [];
      const salones: string[] = (a["Salon(es)"] || []).map(String);
      if (filtroNivelP !== "todos" && !grados.some((g) => NIVEL_DE_GRADO[g] === filtroNivelP)) return false;
      if (filtroGradoP !== "todos" && !grados.includes(filtroGradoP)) return false;
      if (filtroSalonP !== "todos" && !salones.includes(filtroSalonP)) return false;
      return true;
    });
  };
  const nivelesColegio = ["Preescolar", "Primaria", "Secundaria", "Media"]
    .filter((n) => gradosCol.some((g) => NIVEL_DE_GRADO[g.grado] === n));

  // Salones ofrecidos por el filtro, en cascada: los del grado elegido; si solo
  // hay nivel, los de los grados de ese nivel; si nada, todos los del colegio.
  const salonesDeGrados = (gs: string[]) => {
    const s = new Set<string>();
    for (const r of salonesCol) if (gs.includes(String(r.grado))) s.add(String(r.salon));
    return [...s].sort((a, b) => Number(a) - Number(b));
  };
  const salonesFiltroP = filtroGradoP !== "todos"
    ? salonesDeGrados([filtroGradoP])
    : filtroNivelP !== "todos"
      ? salonesDeGrados(gradosCol.filter((g) => NIVEL_DE_GRADO[g.grado] === filtroNivelP).map((g) => g.grado))
      : salonesUnicos;

  const cargarCargas = async (id: string) => {
    const { data } = await supabase
      .from("Asignación Profesores")
      .select('row_id, "Asignatura(s)", "Grado(s)", "Salon(es)"')
      .eq("id", parseInt(id));
    setCargas(data || []);
  };

  // Añade una asignación: en edición escribe YA en la tabla; al agregar una
  // persona nueva queda pendiente y se inserta después de crear el interno.
  const anadirCarga = async () => {
    if (nvAsigs.length === 0 || nvGrados.length === 0 || nvSalones.length === 0) {
      toast({ title: "Carga incompleta", description: "Elige al menos una asignatura, un grado y un salón.", variant: "destructive" });
      return;
    }
    // ── Editar una asignación existente (fila en BD) ──
    if (editCarga?.rowId != null) {
      setGuardandoCarga(true);
      const { error } = await supabase.from("Asignación Profesores")
        .update({ "Asignatura(s)": nvAsigs, "Grado(s)": nvGrados, "Salon(es)": nvSalones })
        .eq("row_id", editCarga.rowId);
      setGuardandoCarga(false);
      if (error) { toast({ title: "No se pudo actualizar", description: error.message, variant: "destructive" }); return; }
      await cargarCargas(editando!);
    // ── Editar una asignación pendiente (persona nueva, aún sin crear) ──
    } else if (editCarga?.idx != null) {
      setCargasPend((prev) => prev.map((c, i) => i === editCarga.idx ? { asignaturas: nvAsigs, grados: nvGrados, salones: nvSalones } : c));
    // ── Añadir nueva en edición (fila directa en BD) ──
    } else if (editando) {
      setGuardandoCarga(true);
      const { error } = await supabase.from("Asignación Profesores").insert({
        id: parseInt(editando), "Asignatura(s)": nvAsigs, "Grado(s)": nvGrados, "Salon(es)": nvSalones,
      });
      setGuardandoCarga(false);
      if (error) { toast({ title: "No se pudo guardar la carga", description: error.message, variant: "destructive" }); return; }
      await cargarCargas(editando);
    // ── Añadir nueva pendiente (persona nueva) ──
    } else {
      setCargasPend((prev) => [...prev, { asignaturas: nvAsigs, grados: nvGrados, salones: nvSalones }]);
    }
    setNvAsigs([]); setNvGrados([]); setNvSalones([]); setEditCarga(null);
  };

  // Carga una asignación existente/pendiente en el formulario para editarla.
  const editarCarga = (c: any, i: number) => {
    setNvAsigs([...(c.asignaturas || [])]);
    setNvGrados([...(c.grados || [])]);
    setNvSalones([...(c.salones || [])]);
    setEditCarga(editando ? { rowId: c.row.row_id } : { idx: i });
  };

  const quitarCarga = async (row: any) => {
    if (editando) {
      setGuardandoCarga(true);
      const { error } = await supabase.from("Asignación Profesores").delete().eq("row_id", row.row_id);
      setGuardandoCarga(false);
      if (error) { toast({ title: "No se pudo quitar", description: error.message, variant: "destructive" }); return; }
      await cargarCargas(editando);
    } else {
      setCargasPend((prev) => prev.filter((c) => c !== row));
    }
  };

  const labelRol = ROLES_STAFF.find((r) => r.cargo === rol)?.label || "";
  const esStaff = rol !== null && ROLES_STAFF.some((r) => r.cargo === rol);

  // Autocompletar MIENTRAS se escribe la cédula (con un pequeño retardo). Si la
  // persona ya existe en Usuarios, se traen sus datos y se BLOQUEAN los campos.
  useEffect(() => {
    if (editando) return; // en edición los datos ya vienen prellenados
    const c = cedula.trim();
    if (!/^\d{3,15}$/.test(c)) { limpiarSiEstabaBloqueado(); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const { usuario } = await apiRequest<{ usuario: any }>(`/api/institucion/usuario/${c}${qCid}`);
        if (!vivo) return;
        if (usuario) {
          setNombres(usuario.nombres || "");
          setApellidos(usuario.apellidos || "");
          setTelefono(usuario.numero_de_telefono || "");
          setGenero(usuario.genero || "");
          setFechaNac(usuario.fecha_de_nacimiento || "");
          setBloqueado(true);
        } else {
          limpiarSiEstabaBloqueado();
        }
      } catch { if (vivo) limpiarSiEstabaBloqueado(); } finally {
        if (vivo) setBuscando(false);
      }
    }, 450);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cedula]);

  const agregarStaff = async () => {
    if (!/^\d{3,15}$/.test(cedula.trim())) { toast({ title: "Cédula inválida", description: "Solo números.", variant: "destructive" }); return; }
    if (!nombres.trim() || !apellidos.trim()) { toast({ title: "Faltan nombres o apellidos", variant: "destructive" }); return; }
    if (!bloqueado && genero !== "M" && genero !== "F") { toast({ title: "Falta el género", description: "El género es obligatorio.", variant: "destructive" }); return; }
    if (rol === "Profesor(a)" && esDirector && (!dirGrado || !dirSalon)) {
      toast({ title: "Falta el grupo", description: "Elige el grado y el salón del que es director(a).", variant: "destructive" }); return;
    }
    setGuardando(true);
    try {
      await apiRequest("/api/institucion/interno", {
        method: "POST",
        body: JSON.stringify(withCid({
          cedula: cedula.trim(), nombres: nombres.trim(), apellidos: apellidos.trim(),
          telefono: telefono.trim() || undefined, cargo: rol!,
          genero: genero || undefined, fecha_de_nacimiento: fechaNac || undefined,
          niveles_coordina: rol === "Coordinador(a)" && niveles.length > 0 ? niveles : undefined,
          direccion_de_grupo: rol === "Profesor(a)" && esDirector && dirGrado && dirSalon ? `${dirGrado} ${dirSalon}` : undefined,
        })),
      });
      // Carga académica pendiente del profesor nuevo: se inserta después de
      // crear el interno (antes no existe). Un fallo aquí NO deshace la persona.
      let cargasFallidas = 0;
      if (rol === "Profesor(a)" && cargasPend.length > 0) {
        for (const c of cargasPend) {
          const { error } = await supabase.from("Asignación Profesores").insert({
            id: parseInt(cedula.trim()), "Asignatura(s)": c.asignaturas, "Grado(s)": c.grados, "Salon(es)": c.salones,
          });
          if (error) cargasFallidas++;
        }
      }
      reset();
      setDialogAbierto(false);
      await onChanged?.();
      await cargarPersonas();
      toast({
        title: `${labelRol} agregado`,
        description: cargasFallidas > 0
          ? `Se creó la persona, pero ${cargasFallidas} asignación(es) de su carga no se guardaron. Revísalas editando al profesor.`
          : "Entra por primera vez con su cédula como contraseña.",
        ...(cargasFallidas > 0 ? { variant: "destructive" as const } : {}),
      });
    } catch (err: any) {
      const detail = (err?.body as any)?.detail || err?.message;
      toast({ title: "No se pudo agregar", description: detail, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  // Abre el pop-up en modo edición con los datos de la persona prellenados.
  const abrirEditar = async (p: any) => {
    reset();
    setEditando(String(p.id));
    setCedula(String(p.id));
    setNombres(p.nombres || "");
    setApellidos(p.apellidos || "");
    setNiveles(Array.isArray(p.niveles_coordina) ? p.niveles_coordina : []);
    const dir = String(p.direccion_de_grupo || "").trim();
    const corte = dir.lastIndexOf(" ");
    setEsDirector(!!dir);
    setDirGrado(dir && corte > 0 ? dir.slice(0, corte) : "");
    setDirSalon(dir && corte > 0 ? dir.slice(corte + 1) : "");
    setBloqueado(!esAdminUsuarios);
    setDialogAbierto(true);
    if (rol === "Profesor(a)" && puedeCarga) cargarCargas(String(p.id)).catch(() => {});
    try {
      const { usuario } = await apiRequest<{ usuario: any }>(`/api/institucion/usuario/${p.id}${qCid}`);
      if (usuario) { setTelefono(usuario.numero_de_telefono || ""); setGenero(usuario.genero || ""); setFechaNac(usuario.fecha_de_nacimiento || ""); }
    } catch { /* sin teléfono/fecha: se editan igual los extras */ }
  };

  const guardarEdicion = async () => {
    if (rol === "Profesor(a)" && esDirector && (!dirGrado || !dirSalon)) {
      toast({ title: "Falta el grupo", description: "Elige el grado y el salón del que es director(a).", variant: "destructive" }); return;
    }
    setGuardando(true);
    try {
      // Corrección de identificación: si cambió la cédula, migrarla en TODO el
      // sistema (notas, asistencia, vínculos, comunicados…) ANTES de guardar el
      // resto. Reusa la migración atómica del server (RPC cambiar_cedula).
      let cedulaActual = editando!;
      const cedNueva = cedula.trim();
      if (esAdmin && cedNueva && cedNueva !== cedulaActual) {
        if (!/^\d{3,15}$/.test(cedNueva)) {
          toast({ title: "Cédula inválida", description: "Solo números (3 a 15 dígitos).", variant: "destructive" });
          setGuardando(false); return;
        }
        await apiClient.auth.cambiarCedula(cedulaActual, cedNueva);
        cedulaActual = cedNueva;
      }
      await apiRequest("/api/institucion/interno", {
        method: "PATCH",
        body: JSON.stringify(withCid({
          cedula: cedulaActual, cargo: rol!,
          ...(esAdminUsuarios ? {
            nombres: nombres.trim(), apellidos: apellidos.trim(), telefono: telefono.trim(),
            genero: genero || undefined, fecha_de_nacimiento: fechaNac,
          } : {}),
          ...(rol === "Coordinador(a)" ? { niveles_coordina: niveles } : {}),
          ...(rol === "Profesor(a)" ? { direccion_de_grupo: esDirector && dirGrado && dirSalon ? `${dirGrado} ${dirSalon}` : "" } : {}),
        })),
      });
      reset();
      setDialogAbierto(false);
      await onChanged?.();
      await cargarPersonas();
    } catch (err: any) {
      const detail = (err?.body as any)?.detail || err?.message;
      toast({ title: "No se pudo guardar", description: detail, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  // Quita ESTE cargo a la persona (si tiene otros los conserva; si era el
  // único, sale del personal del colegio — el server hace la promoción).
  const quitarCargo = async () => {
    if (!confirmQuitar || !rol) return;
    setQuitando(true);
    try {
      const params = new URLSearchParams({ cedula: String(confirmQuitar.id), cargo: rol });
      if (colegioId) params.set("colegio_id", colegioId);
      await apiRequest(`/api/institucion/interno?${params.toString()}`, { method: "DELETE" });
      setConfirmQuitar(null);
      await onChanged?.();
      await cargarPersonas();
    } catch (err: any) {
      const detail = (err?.body as any)?.detail || err?.message;
      toast({ title: "No se pudo quitar", description: detail, variant: "destructive" });
    } finally {
      setQuitando(false);
    }
  };

  // Una persona cuenta en un cargo si es su cargo principal O está en sus
  // cargos_extra (multi-cargo: ej. Rector que también es Administrador).
  const tieneCargo = (i: any, r: string) => i.cargo === r || (Array.isArray(i.cargos_extra) && i.cargos_extra.includes(r));
  const conteo = (r: string) =>
    r === "estudiante"
      ? (grupoDirector
          ? personas.estudiantes.filter((e: any) => e.grado === grupoDirector.grado && String(e.salon) === grupoDirector.salon).length
          : personas.estudiantes.length)
    : r === "acudiente" ? personas.acudientes.length
    : personas.internos.filter((i) => tieneCargo(i, r)).length;

  // Orden alfabético por apellidos (y nombres de desempate) — antes salían en
  // el orden crudo de la BD (orden de creación), que se veía aleatorio.
  const listaDelRol: any[] =
    (!rol ? [] : esStaff ? personas.internos.filter((i) => tieneCargo(i, rol)) : rol === "estudiante" ? personas.estudiantes : personas.acudientes)
      .slice()
      .sort((a, b) => `${a.apellidos || ""} ${a.nombres || ""}`.localeCompare(`${b.apellidos || ""} ${b.nombres || ""}`, "es"));
  // Busqueda tolerante: ignora tildes y mayusculas; cruza nombre completo, cedula y celular.
  const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = normalizar(busqueda.trim());
  const qDigitos = q.replace(/\D/g, "");
  // El match por dígitos del teléfono SOLO cuando la búsqueda es numérica (cédula/
  // celular). Si escribes texto o una contraseña, no debe "colar" por sus dígitos.
  const qEsNumerico = /^[0-9+\-\s]+$/.test(busqueda.trim());
  const listaBuscada = !q ? listaDelRol : listaDelRol.filter((p) =>
    normalizar(`${p.nombres} ${p.apellidos}`).includes(q) || String(p.id).includes(q) ||
    ("contrasena" in p && normalizar(String((p as any).contrasena || "")).includes(q)) ||
    (qEsNumerico && !!qDigitos && String(p.numero_de_telefono || "").includes(qDigitos)));
  const listaActual = rol === "Profesor(a)" && !colegioId
    ? listaBuscada.filter(profMatchFiltros)
    : listaBuscada;
  const labelActual = esStaff ? labelRol : rol === "estudiante" ? "Estudiantes" : rol === "acudiente" ? "Acudientes" : "";
  // Estudiantes/Acudientes: se incrusta el Panel de Control (mismo CRUD, misma
  // data → lo que se haga aquí o allá es idéntico). Solo en el colegio propio:
  // el SuperAdmin del wizard no tiene colegio en el JWT (usa "Entrar como admin").
  const usarPanelEmbebido = (rol === "estudiante" || rol === "acudiente") && !colegioId;

  const CardRol = ({ Icono, label, sub, onClick }: { Icono: typeof Users; label: string; sub: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick} className="flex flex-col items-center text-center sm:items-start sm:text-left bg-card border border-border rounded-lg p-5 shadow-sm hover:border-primary/60 hover:bg-secondary/40 transition-colors">
      <div className="mb-3"><Icono className="w-8 h-8 text-primary" /></div>
      <h3 className="font-semibold text-foreground">{label}</h3>
      <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>
    </button>
  );

  const subConteo = (clave: string) =>
    cargandoPersonas ? <Loader2 className="w-4 h-4 animate-spin" /> : `${conteo(clave)} persona(s)`;

  // ── Vista 1: SOLO las tarjetas de roles ──
  if (!rol) {
    return (
      <div>
        <p className="text-sm text-muted-foreground mb-4">Elige un rol para ver sus personas y agregar nuevas.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {ROLES_STAFF.filter((r) => cargosAgregables.includes(r.cargo)).map((r) => (
            <CardRol key={r.cargo} Icono={r.Icono} label={r.label} sub={subConteo(r.cargo)} onClick={() => { setRol(r.cargo); reset(); resetListado(); }} />
          ))}
          <CardRol Icono={Backpack} label="Estudiantes" sub={subConteo("estudiante")} onClick={() => { setRol("estudiante"); reset(); resetListado(); }} />
          <CardRol Icono={UsersRound} label="Acudientes" sub={subConteo("acudiente")} onClick={() => { setRol("acudiente"); reset(); resetListado(); }} />
        </div>
      </div>
    );
  }

  // ── Vista 2: página del rol elegido (lista + botón Agregar → pop-up) ──
  return (
    <div>
      {/* Botón local de regreso a las tarjetas SOLO cuando el rol es interno
          (en el wizard el Volver jerárquico de arriba hace este papel). */}
      {rolProp === undefined && (
        <Button variant="outline" size="sm" onClick={() => { setRol(null); reset(); resetListado(); }} className="gap-1 mb-4 bg-card">
          ← Roles
        </Button>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h2 className="text-xl font-semibold">{labelActual} <span className="text-muted-foreground font-normal">({listaDelRol.length})</span></h2>
        {esStaff && rol !== null && cargosAgregables.includes(rol) && (
          <Button onClick={() => { reset(); setDialogAbierto(true); }} className="gap-1">
            <Plus className="w-4 h-4" /> Agregar
          </Button>
        )}
      </div>

      {usarPanelEmbebido ? (
        // El profesor director de grupo espera a conocer su grupo antes de
        // montar el panel (si no, cargaría todo el colegio un instante).
        cargoSesion === "Profesor(a)" && !grupoDirector ? (
          <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <PanelControl embedded tabFija={rol === "estudiante" ? "estudiantes" : "perfiles"} soloGrupo={grupoDirector || undefined} />
        )
      ) : (<>
      {/* Busqueda flexible (como la del Panel de Control) */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={`Buscar en ${labelActual.toLowerCase()} por nombre, apellido, cédula o celular…`}
          className="pl-9 pr-9"
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => setBusqueda("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            title="Borrar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filtros de profesores por carga académica / dirección de grupo.
          En cascada: con un nivel elegido, solo se ofrecen los grados de ese nivel. */}
      {rol === "Profesor(a)" && !colegioId && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <select value={filtroNivelP} onChange={(e) => { setFiltroNivelP(e.target.value); setFiltroGradoP("todos"); setFiltroSalonP("todos"); }} className="flex h-10 sm:w-52 rounded-md border border-input bg-card px-3 py-2 text-sm">
            <option value="todos">Todos los niveles</option>
            {nivelesColegio.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={filtroGradoP} onChange={(e) => { setFiltroGradoP(e.target.value); setFiltroSalonP("todos"); }} className="flex h-10 sm:w-52 rounded-md border border-input bg-card px-3 py-2 text-sm">
            <option value="todos">Todos los grados</option>
            {gradosCol
              .filter((g) => filtroNivelP === "todos" || NIVEL_DE_GRADO[g.grado] === filtroNivelP)
              .map((g) => <option key={g.grado} value={g.grado}>{g.grado}</option>)}
          </select>
          <select value={filtroSalonP} onChange={(e) => setFiltroSalonP(e.target.value)} className="flex h-10 sm:w-52 rounded-md border border-input bg-card px-3 py-2 text-sm">
            <option value="todos">Todos los salones</option>
            {salonesFiltroP.map((s) => <option key={s} value={s}>Salón {s}</option>)}
          </select>
        </div>
      )}

      {listaActual.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center bg-card">
          Aún no hay {labelActual.toLowerCase()} en este colegio.
        </p>
      ) : (
        // Tabla al estilo de la pestaña Internos del Panel de Control (pedido
        // de Juan 2026-07-15). Teléfono/contraseña solo llegan del server para
        // roles del panel. El detalle (género, carga académica) vive en Editar.
        <div className="overflow-x-auto border border-border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Apellidos</TableHead>
                <TableHead>Nombres</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Contraseña</TableHead>
                {esStaff && rol !== null && cargosAgregables.includes(rol) && (
                  <TableHead className="text-right">Acciones</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {listaActual.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="py-2">
                    {p.avatar_url ? (
                      <button type="button" onClick={() => setFotoGrande({ url: p.avatar_url, nombre: `${p.apellidos} ${p.nombres}` })} title="Ver foto" className="cursor-zoom-in">
                        <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" loading="lazy" />
                      </button>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {(p.apellidos || p.nombres || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{p.id}</TableCell>
                  <TableCell>{p.apellidos}</TableCell>
                  <TableCell>{p.nombres}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {[
                      p.direccion_de_grupo ? `${cargoSegunGenero("Director(a)", p.genero)} de grupo: ${p.direccion_de_grupo}` : "",
                      Array.isArray(p.niveles_coordina) && p.niveles_coordina.length > 0 ? `Coordina: ${p.niveles_coordina.join(", ")}` : "",
                    ].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.numero_de_telefono || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{"contrasena" in p ? (p.contrasena || "(su cédula)") : "—"}</TableCell>
                  {esStaff && rol !== null && cargosAgregables.includes(rol) && (
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      <button onClick={() => abrirEditar(p)} className="p-2 text-muted-foreground hover:text-primary" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setConfirmQuitar(p)} className="p-2 text-muted-foreground hover:text-destructive" title="Quitar cargo">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Estudiantes / Acudientes: usan sus tablas con campos adicionales (grado,
          salón, acudidos). Por ahora se registran con datos completos desde el
          Panel de Control del administrador (formulario completo con autocompletado). */}
      {(rol === "estudiante" || rol === "acudiente") && (
        <div className="border border-border rounded-lg p-4 bg-card text-sm text-muted-foreground mt-4">
          Para agregar {rol === "estudiante" ? "estudiantes" : "acudientes"} se piden datos adicionales
          ({rol === "estudiante" ? "grado y salón" : "estudiantes a cargo"}). Por ahora se registran con
          todos sus datos desde el <strong>Panel de Control</strong> del administrador,
          donde ya existe el formulario completo con autocompletado por cédula.
        </div>
      )}

      </>)}

      {/* Pop-up de agregar (solo staff) */}
      <Dialog open={dialogAbierto} onOpenChange={(o) => { if (!o) { setDialogAbierto(false); reset(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar" : "Agregar"} — {labelRol}</DialogTitle>
            <DialogDescription>{editando ? (esAdmin ? "Puedes corregir la cédula; se migra en todo el sistema." : "La cédula no se cambia desde aquí.") : "Al escribir una cédula ya registrada, los datos se autocompletan."}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-sm">Cédula *</Label>
              <Input value={cedula} onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))} placeholder="Solo números" readOnly={!!editando && !esAdmin} className={`mt-1 ${(!!editando && !esAdmin) ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} />
              {editando && esAdmin && (
                <p className="text-xs text-amber-600 mt-1">Cambiar la cédula la migra en todo el sistema (notas, asistencia, vínculos, comunicados…).</p>
              )}
              {buscando && <p className="text-xs text-muted-foreground mt-1">Buscando…</p>}
            </div>
            <div><Label className="text-sm">Apellidos *</Label><Input value={apellidos} onChange={(e) => setApellidos(capitalizarNombre(e.target.value))} readOnly={bloqueado} className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
            <div><Label className="text-sm">Nombres *</Label><Input value={nombres} onChange={(e) => setNombres(capitalizarNombre(e.target.value))} readOnly={bloqueado} className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
            <div className="sm:col-span-2"><Label className="text-sm">Teléfono</Label><div className="mt-1"><PhoneInput value={telefono} onChange={setTelefono} disabled={bloqueado} placeholder="3001234567" /></div></div>
            <div>
              <Label className="text-sm">Género *</Label>
              <select
                value={genero}
                onChange={(e) => setGenero(e.target.value)}
                disabled={bloqueado}
                className={`mt-1 flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-background"}`}
              >
                <option value="">Selecciona…</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </div>
            <div><Label className="text-sm">Fecha de nacimiento <span className="text-muted-foreground">(opcional)</span></Label><Input type="date" value={fechaNac} onChange={(e) => setFechaNac(e.target.value)} min="1920-01-01" max={new Date().toISOString().slice(0, 10)} readOnly={bloqueado} className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
          </div>

          {/* Coordinador: nivel(es) que coordina (puede ser más de uno) */}
          {rol === "Coordinador(a)" && (
            <div>
              <Label className="text-sm">Coordina los niveles <span className="text-muted-foreground">(elige uno o varios)</span></Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {NIVELES_COORDINA.map((n) => (
                  <label key={n} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={niveles.includes(n)}
                      onChange={() => setNiveles((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n])}
                      className="w-4 h-4 accent-primary cursor-pointer"
                    />
                    {n}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Profesor: director de grupo (grado + salón de la estructura del colegio) */}
          {rol === "Profesor(a)" && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={esDirector} onChange={(e) => { setEsDirector(e.target.checked); if (!e.target.checked) { setDirGrado(""); setDirSalon(""); } }} className="w-4 h-4 accent-primary cursor-pointer" />
                Es director(a) de grupo
              </label>
              {esDirector && (
                gradosCol.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Primero define los grados y salones en la ficha <strong>Jornadas, grados y salones</strong>.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">Grado *</Label>
                      <select value={dirGrado} onChange={(e) => { setDirGrado(e.target.value); setDirSalon(""); }} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="">Selecciona…</option>
                        {gradosCol.map((g) => <option key={g.grado} value={g.grado}>{g.grado}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-sm">Salón *</Label>
                      <select value={dirSalon} onChange={(e) => setDirSalon(e.target.value)} disabled={!dirGrado} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50">
                        <option value="">Selecciona…</option>
                        {salonesDelGrado.map((sal) => <option key={sal} value={sal}>{sal}</option>)}
                      </select>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Profesor: carga académica (asignaciones) ahí mismo, sin ir al Panel de Control */}
          {rol === "Profesor(a)" && puedeCarga && (
            <div className="space-y-2 border-t border-border pt-3">
              <Label className="text-sm font-semibold">Carga académica</Label>
              {(editando ? cargas : cargasPend).length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin asignaciones todavía. Puedes añadirlas aquí o después desde el Panel de Control.</p>
              ) : (
                <div className="space-y-1.5">
                  {(editando
                    ? cargas.map((c) => ({ row: c, asignaturas: c["Asignatura(s)"] || [], grados: c["Grado(s)"] || [], salones: c["Salon(es)"] || [] }))
                    : cargasPend.map((c) => ({ row: c, ...c }))
                  ).map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm border border-border rounded-md px-2.5 py-1.5 bg-secondary/30">
                      <span className="flex-1 min-w-0">
                        <strong>{(c.asignaturas as string[]).join(", ")}</strong>
                        {" — "}{(c.grados as string[]).join(", ")} · Salón(es) {(c.salones as string[]).join(", ")}
                      </span>
                      <button type="button" onClick={() => editarCarga(c, i)} disabled={guardandoCarga} className="p-1 text-muted-foreground hover:text-primary shrink-0" title="Editar asignación">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => quitarCarga(c.row)} disabled={guardandoCarga} className="p-1 text-muted-foreground hover:text-destructive shrink-0" title="Quitar asignación">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {asignaturasCol.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay asignaturas activas — agrégalas primero en la ficha <strong>Asignaturas</strong>.</p>
              ) : (<>
                <div>
                  <Label className="text-xs text-muted-foreground">Asignatura(s) ({nvAsigs.length})</Label>
                  <div className="border rounded-md p-2 mt-1 max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {asignaturasCol.map((a) => (
                      <label key={a} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" checked={nvAsigs.includes(a)} onChange={() => setNvAsigs((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a])} className="w-4 h-4 accent-primary cursor-pointer" />
                        {a}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Grado(s) ({nvGrados.length})</Label>
                  <div className="border rounded-md p-2 mt-1 max-h-32 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {gradosCol.map((g) => (
                      <label key={g.grado} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" checked={nvGrados.includes(g.grado)} onChange={() => setNvGrados((p) => p.includes(g.grado) ? p.filter((x) => x !== g.grado) : [...p, g.grado])} className="w-4 h-4 accent-primary cursor-pointer" />
                        {g.grado}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Salón(es) ({nvSalones.length})</Label>
                  <div className="border rounded-md p-2 mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
                    {salonesUnicos.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" checked={nvSalones.includes(s)} onChange={() => setNvSalones((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])} className="w-4 h-4 accent-primary cursor-pointer" />
                        Salón {s}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={anadirCarga} disabled={guardandoCarga} className="gap-1">
                    {guardandoCarga ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (editCarga ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />)}
                    {editCarga ? "Guardar cambios" : "Añadir asignación"}
                  </Button>
                  {editCarga && (
                    <button type="button" onClick={() => { setEditCarga(null); setNvAsigs([]); setNvGrados([]); setNvSalones([]); }} className="text-xs text-muted-foreground hover:text-foreground underline">
                      Cancelar
                    </button>
                  )}
                </div>
              </>)}
            </div>
          )}

          {bloqueado && (
            <p className="text-xs text-muted-foreground">
              {editando
                ? "Los datos personales (nombres, teléfono, género, fecha) solo los edita el administrador."
                : "Esta cédula ya está registrada en Usuarios — sus datos se toman de ahí y no se editan aquí."}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogAbierto(false); reset(); }} disabled={guardando}>Cancelar</Button>
            <Button onClick={editando ? guardarEdicion : agregarStaff} disabled={guardando || buscando} className="gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {editando ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Foto ampliada */}
      <Dialog open={!!fotoGrande} onOpenChange={(o) => { if (!o) setFotoGrande(null); }}>
        <DialogContent className="max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{fotoGrande?.nombre}</DialogTitle>
          </DialogHeader>
          {fotoGrande && (
            <img src={fotoGrande.url} alt={fotoGrande.nombre} className="w-full max-h-[70vh] object-contain rounded-md" />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmación de quitar cargo */}
      <Dialog open={!!confirmQuitar} onOpenChange={(o) => { if (!o) setConfirmQuitar(null); }}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Quitar cargo — {labelRol}</DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              ¿Quitarle el cargo de <strong>{labelRol}</strong> a{" "}
              <strong>{confirmQuitar?.nombres} {confirmQuitar?.apellidos}</strong> (cédula {confirmQuitar?.id})?
              <br /><br />
              Si tiene otros cargos en el colegio, los conserva. Si este era su único cargo, saldrá del personal de la institución.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmQuitar(null)} disabled={quitando}>Cancelar</Button>
            <Button variant="destructive" onClick={quitarCargo} disabled={quitando} className="gap-2">
              {quitando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Quitar cargo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PersonasColegioEditor;
