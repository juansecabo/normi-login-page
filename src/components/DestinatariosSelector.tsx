import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";

/**
 * Selector reusable de destinatarios para Consultas y similares.
 * Extraído de Consultas.tsx (Fase 11). NO modifica el código existente
 * de creación — se monta aparte en el modal de edición.
 *
 * Estado interno + callback onChange con todos los derivados ya armados
 * (perfiles_objetivo, segmentos, destinatarios_label, etc.) para que el
 * padre no replique la lógica.
 */

const GRADOS_ORDEN = [
  "Párvulo", "Prejardín", "Jardín", "Transición",
  "Primero", "Segundo", "Tercero", "Cuarto", "Quinto",
  "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo", "Undécimo",
];
const SALONES_DISPONIBLES = ["1", "2", "3", "4", "5", "6"];
const NIVELES_GRADOS: Record<string, string[]> = {
  Preescolar: ["Párvulo", "Prejardín", "Jardín", "Transición"],
  Primaria: ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto"],
  Secundaria: ["Sexto", "Séptimo", "Octavo", "Noveno"],
  Media: ["Décimo", "Undécimo"],
};

export type PerfilKey =
  | "Estudiantes" | "Padres" | "Profesores" | "Coordinadores"
  | "Rector" | "Administrativos" | "Secretaria" | "Orientador";

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

export interface DestinatariosValue {
  perfiles: Record<PerfilKey, boolean>;
  niveles: Record<string, boolean>;
  grados: Record<string, boolean>;
  salones: Record<string, boolean>;
  estudiantes: Record<number, boolean>;
  profesoresIds: string[];
  coordinadoresIds: string[];
  administrativosIds: string[];
  secretariasIds: string[];
  orientadoresIds: string[];
}

/** Snapshot que un padre puede guardar en BD + usar para enviar. */
export interface DestinatariosSnapshot {
  perfiles_objetivo: string[] | null;
  grados_objetivo: string[] | null;
  salones_objetivo: string[] | null;
  estudiantes_objetivo: number[] | null;
  cargos_objetivo: string[] | null;
  internos_objetivo: string[] | null;
  destinatarios_label: string;
  segmentos: any[];
  isEmpty: boolean;
}

export interface DestinatariosOutput extends DestinatariosSnapshot {
  value: DestinatariosValue;
}

interface DestinatariosSelectorProps {
  initial: DestinatariosValue;
  onChange: (output: DestinatariosOutput) => void;
}

export function emptyDestinatariosValue(): DestinatariosValue {
  return {
    perfiles: {
      Estudiantes: false, Padres: false, Profesores: false, Coordinadores: false,
      Rector: false, Administrativos: false, Secretaria: false, Orientador: false,
    },
    niveles: {},
    grados: {},
    salones: {},
    estudiantes: {},
    profesoresIds: [],
    coordinadoresIds: [],
    administrativosIds: [],
    secretariasIds: [],
    orientadoresIds: [],
  };
}

/** Convierte los arrays guardados en BD (Consulta row) al shape de estado. */
export function destinatariosFromConsulta(c: {
  perfiles_objetivo?: string[] | null;
  grados_objetivo?: string[] | null;
  salones_objetivo?: string[] | null;
  estudiantes_objetivo?: number[] | null;
  internos_objetivo?: string[] | null;
}, internosPorCargo: {
  profesores: string[];
  coordinadores: string[];
  administrativos: string[];
  secretarias: string[];
  orientadores: string[];
} = { profesores: [], coordinadores: [], administrativos: [], secretarias: [], orientadores: [] }): DestinatariosValue {
  const v = emptyDestinatariosValue();
  const perfiles = c.perfiles_objetivo || [];
  for (const p of perfiles) {
    if (p === "Estudiantes") v.perfiles.Estudiantes = true;
    else if (p === "Acudientes") v.perfiles.Padres = true;
    else if (p === "Profesores") v.perfiles.Profesores = true;
    else if (p === "Coordinadores") v.perfiles.Coordinadores = true;
    else if (p === "Rector") v.perfiles.Rector = true;
    else if (p === "Administrativos") v.perfiles.Administrativos = true;
    else if (p === "Secretaria General") v.perfiles.Secretaria = true;
    else if (p === "Orientador(a) Escolar") v.perfiles.Orientador = true;
  }
  for (const g of c.grados_objetivo || []) v.grados[g] = true;
  for (const s of c.salones_objetivo || []) v.salones[s] = true;
  for (const id of c.estudiantes_objetivo || []) v.estudiantes[id] = true;
  v.profesoresIds = internosPorCargo.profesores.filter((id) => (c.internos_objetivo || []).includes(id));
  v.coordinadoresIds = internosPorCargo.coordinadores.filter((id) => (c.internos_objetivo || []).includes(id));
  v.administrativosIds = internosPorCargo.administrativos.filter((id) => (c.internos_objetivo || []).includes(id));
  v.secretariasIds = internosPorCargo.secretarias.filter((id) => (c.internos_objetivo || []).includes(id));
  v.orientadoresIds = internosPorCargo.orientadores.filter((id) => (c.internos_objetivo || []).includes(id));
  // Inferir niveles marcados a partir de grados
  for (const [nivel, gr] of Object.entries(NIVELES_GRADOS)) {
    if (gr.every((g) => v.grados[g])) v.niveles[nivel] = true;
  }
  return v;
}

interface EstudianteRow {
  id: number;
  nombres: string | null;
  apellidos: string | null;
  grado: string | null;
  salon: string | null;
  nivel: string | null;
}

interface ProfRow { id: string; nombre: string; grados: string[]; salones: string[]; }
interface InternoSimple { id: string; nombre: string; }

export default function DestinatariosSelector({ initial, onChange }: DestinatariosSelectorProps) {
  const [perfilesMarcados, setPerfilesMarcados] = useState<Record<PerfilKey, boolean>>(initial.perfiles);
  const [nivelesMarcados, setNivelesMarcados] = useState<Record<string, boolean>>(initial.niveles);
  const [gradosMarcados, setGradosMarcados] = useState<Record<string, boolean>>(initial.grados);
  const [salonesMarcados, setSalonesMarcados] = useState<Record<string, boolean>>(initial.salones);
  const [estudiantesMarcados, setEstudiantesMarcados] = useState<Record<number, boolean>>(initial.estudiantes);
  const [profesoresSeleccionados, setProfesoresSeleccionados] = useState<string[]>(initial.profesoresIds);
  const [coordinadoresSeleccionados, setCoordinadoresSeleccionados] = useState<string[]>(initial.coordinadoresIds);
  const [administrativosSeleccionados, setAdministrativosSeleccionados] = useState<string[]>(initial.administrativosIds);
  const [secretariasSeleccionadas, setSecretariasSeleccionadas] = useState<string[]>(initial.secretariasIds);
  const [orientadoresSeleccionados, setOrientadoresSeleccionados] = useState<string[]>(initial.orientadoresIds);

  const [listaCoordinadores, setListaCoordinadores] = useState<InternoSimple[]>([]);
  const [listaAdministrativos, setListaAdministrativos] = useState<InternoSimple[]>([]);
  const [listaSecretarias, setListaSecretarias] = useState<InternoSimple[]>([]);
  const [listaOrientadores, setListaOrientadores] = useState<InternoSimple[]>([]);
  const [loadingInternos, setLoadingInternos] = useState(false);

  const [listaProfesoresFiltrada, setListaProfesoresFiltrada] = useState<ProfRow[]>([]);
  const [loadingListaProfesores, setLoadingListaProfesores] = useState(false);
  const [mostrarProfesores, setMostrarProfesores] = useState(false);

  const [estudiantesDelGrado, setEstudiantesDelGrado] = useState<EstudianteRow[]>([]);
  const [loadingEst, setLoadingEst] = useState(false);
  const [mostrarSalones, setMostrarSalones] = useState(false);
  const [mostrarEstudiantes, setMostrarEstudiantes] = useState(false);

  // Cargar estudiantes del grado cuando cambia grados
  useEffect(() => {
    const gradosSel = Object.keys(gradosMarcados).filter((g) => gradosMarcados[g]);
    if (gradosSel.length === 0) { setEstudiantesDelGrado([]); return; }
    setLoadingEst(true);
    (async () => {
      const { data } = await supabase.from("Estudiantes").select("id, grado, salon, nivel").in("grado", gradosSel as any);
      if (data) {
        const { enrichWithNombres } = await import("@/lib/nombresUsuarios");
        setEstudiantesDelGrado(await enrichWithNombres(data as any) as EstudianteRow[]);
      }
      setLoadingEst(false);
    })();
  }, [gradosMarcados]);

  // Cargar profesores cuando se marca el perfil
  useEffect(() => {
    if (!perfilesMarcados.Profesores) {
      setListaProfesoresFiltrada([]); setProfesoresSeleccionados([]); setMostrarProfesores(false);
      return;
    }
    const gradosSel = Object.keys(gradosMarcados).filter((g) => gradosMarcados[g]);
    const salonesSel = Object.keys(salonesMarcados).filter((s) => salonesMarcados[s]);
    (async () => {
      setLoadingListaProfesores(true);
      const { data: rawData } = await supabase.from("Asignación Profesores").select('id, "Grado(s)", "Salon(es)"');
      const { enrichWithNombres } = await import("@/lib/nombresUsuarios");
      const data = await enrichWithNombres((rawData || []) as any);
      const filtered = (data || []).filter((r: any) => {
        const grados = (r["Grado(s)"] as string[]) || [];
        const salones = (r["Salon(es)"] as string[]) || [];
        if (gradosSel.length > 0 && !gradosSel.some((g) => grados.includes(g))) return false;
        if (salonesSel.length > 0 && !salonesSel.some((s) => salones.includes(s))) return false;
        return true;
      });
      const byId = new Map<string, ProfRow>();
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
          const ex = byId.get(rid)!;
          for (const g of ((r["Grado(s)"] as string[]) || [])) if (!ex.grados.includes(g)) ex.grados.push(g);
          for (const s of ((r["Salon(es)"] as string[]) || [])) if (!ex.salones.includes(s)) ex.salones.push(s);
        }
      }
      const list = [...byId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
      setListaProfesoresFiltrada(list);
      setProfesoresSeleccionados((prev) => prev.filter((id) => byId.has(id)));
      setLoadingListaProfesores(false);
    })();
  }, [gradosMarcados, salonesMarcados, perfilesMarcados.Profesores]);

  // Cargar 4 listas de internos
  useEffect(() => {
    const necesita =
      perfilesMarcados.Coordinadores || perfilesMarcados.Administrativos ||
      perfilesMarcados.Secretaria || perfilesMarcados.Orientador;
    if (!necesita) return;
    if (listaCoordinadores.length || listaAdministrativos.length || listaSecretarias.length || listaOrientadores.length) return;
    (async () => {
      setLoadingInternos(true);
      const { data: rawInt } = await supabase
        .from("Internos")
        .select("id, cargo")
        .in("cargo", ["Coordinador(a)", "Administrativo(a)", "Secretaria General", "Orientador(a) Escolar"]);
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const rows = sortByApellidosNombres(await enrichWithNombres((rawInt || []) as any));
      const mk = (cargo: string): InternoSimple[] =>
        rows.filter((r: any) => r.cargo === cargo).map((r: any) => ({ id: String(r.id), nombre: `${r.apellidos} ${r.nombres}` }));
      setListaCoordinadores(mk("Coordinador(a)"));
      setListaAdministrativos(mk("Administrativo(a)"));
      setListaSecretarias(mk("Secretaria General"));
      setListaOrientadores(mk("Orientador(a) Escolar"));
      setLoadingInternos(false);
    })();
  }, [perfilesMarcados, listaCoordinadores.length, listaAdministrativos.length, listaSecretarias.length, listaOrientadores.length]);

  const estudiantesDisponibles = useMemo(() => {
    const salonesSel = Object.keys(salonesMarcados).filter((s) => salonesMarcados[s]);
    if (salonesSel.length === 0) return estudiantesDelGrado;
    return estudiantesDelGrado.filter((e) => e.salon && salonesSel.includes(String(e.salon)));
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

  // Derivar grados disponibles a partir de salones presentes en los estudiantes del grado
  const salonesPorGrado = useMemo(() => {
    const set = new Set<string>();
    for (const e of estudiantesDelGrado) if (e.salon) set.add(String(e.salon));
    return [...set].sort();
  }, [estudiantesDelGrado]);

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
          setNivelesMarcados({}); setGradosMarcados({}); setSalonesMarcados({}); setEstudiantesMarcados({});
          setMostrarSalones(false); setMostrarEstudiantes(false);
        }
      }
      return nuevo;
    });
  };

  const toggleInterno = (lista: string[], id: string, setter: (v: string[]) => void) => {
    setter(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  };

  const gradosSeleccionados = useMemo(() => Object.keys(gradosMarcados).filter((g) => gradosMarcados[g]), [gradosMarcados]);
  const salonesSeleccionados = useMemo(() => Object.keys(salonesMarcados).filter((s) => salonesMarcados[s]), [salonesMarcados]);
  const estudiantesSeleccionados = useMemo(
    () => Object.keys(estudiantesMarcados).filter((id) => estudiantesMarcados[Number(id)]).map(Number),
    [estudiantesMarcados]
  );

  const listaANombres = (ids: string[], lista: InternoSimple[]) =>
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
    if (perfilesMarcados.Estudiantes) {
      if (estudiantesSeleccionados.length > 0) {
        partes.push(estudiantesSeleccionados.length === 1
          ? `Estudiante con id ${estudiantesSeleccionados[0]}`
          : `Estudiantes con id: ${estudiantesSeleccionados.join(", ")}`);
      } else partes.push(aulaFrase("Estudiantes"));
    }
    if (perfilesMarcados.Padres) {
      if (estudiantesSeleccionados.length > 0) {
        partes.push(estudiantesSeleccionados.length === 1
          ? `Acudientes del estudiante con id ${estudiantesSeleccionados[0]}`
          : `Acudientes de los estudiantes con id: ${estudiantesSeleccionados.join(", ")}`);
      } else partes.push(aulaFrase("Acudientes"));
    }
    if (perfilesMarcados.Profesores) {
      if (profesoresSeleccionados.length > 0) {
        const nombres = listaANombres(profesoresSeleccionados, listaProfesoresFiltrada);
        partes.push(nombres.length === 1 ? `Profesor(a) ${nombres[0]}` : `Profesores ${nombres.join(", ")}`);
      } else if (gradosSeleccionados.length > 0 || salonesSeleccionados.length > 0) {
        partes.push(aulaFrase("Profesores"));
      } else partes.push("Profesores");
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

  // Construir segmentos para enviar al endpoint
  const buildSegmentos = (): any[] => {
    const segmentos: any[] = [];
    const perfilesEstPadres: string[] = [];
    if (perfilesMarcados.Estudiantes) perfilesEstPadres.push("Estudiantes");
    if (perfilesMarcados.Padres) perfilesEstPadres.push("Acudientes");
    if (perfilesEstPadres.length > 0) {
      const seg: any = { perfil: perfilesEstPadres };
      if (estudiantesSeleccionados.length > 0) {
        seg.id_destinatarios = estudiantesSeleccionados.map(String);
      } else {
        const nivs = Object.keys(nivelesMarcados).filter((n) => nivelesMarcados[n]);
        if (nivs.length === 1) seg.nivel = nivs[0];
        if (gradosSeleccionados.length > 0) seg.grados = gradosSeleccionados;
        if (salonesSeleccionados.length > 0) seg.salones = salonesSeleccionados;
      }
      segmentos.push(seg);
    }
    const internoIdsPorPerfil: { perfil: string; ids: string[] }[] = [
      { perfil: "Profesores", ids: profesoresSeleccionados.map(String) },
      { perfil: "Coordinadores", ids: coordinadoresSeleccionados.map(String) },
      { perfil: "Administrativos", ids: administrativosSeleccionados.map(String) },
      { perfil: "Secretaria General", ids: secretariasSeleccionadas.map(String) },
      { perfil: "Orientadores", ids: orientadoresSeleccionados.map(String) },
    ];
    const perfilToKey = (p: string): PerfilKey => {
      if (p === "Profesores") return "Profesores";
      if (p === "Coordinadores") return "Coordinadores";
      if (p === "Administrativos") return "Administrativos";
      if (p === "Secretaria General") return "Secretaria";
      if (p === "Orientadores") return "Orientador";
      return "Rector";
    };
    const perfilesInternosTodos: string[] = [];
    for (const { perfil, ids } of internoIdsPorPerfil) {
      if (!perfilesMarcados[perfilToKey(perfil)]) continue;
      if (ids.length > 0) segmentos.push({ perfil: [perfil], id_destinatarios: ids });
      else perfilesInternosTodos.push(perfil);
    }
    if (perfilesMarcados.Rector) perfilesInternosTodos.push("Rector");
    if (perfilesInternosTodos.length > 0) segmentos.push({ perfil: perfilesInternosTodos });
    return segmentos;
  };

  // Emitir cambios al padre
  useEffect(() => {
    const perfilesObjetivo: string[] = [];
    for (const def of PERFILES_UI) {
      if (perfilesMarcados[def.key]) perfilesObjetivo.push(def.perfil);
    }
    const internosObjetivo: string[] = [
      ...profesoresSeleccionados, ...coordinadoresSeleccionados,
      ...administrativosSeleccionados, ...secretariasSeleccionadas, ...orientadoresSeleccionados,
    ];
    const cargoLabelMap: Record<PerfilKey, string | null> = {
      Estudiantes: null, Padres: null, Profesores: "Profesores",
      Coordinadores: "Coordinadores", Rector: "Rector",
      Administrativos: "Administrativos", Secretaria: "Secretarias", Orientador: "Orientadores",
    };
    const cargosObjetivo: string[] = [];
    for (const def of PERFILES_UI) {
      const label = cargoLabelMap[def.key];
      if (perfilesMarcados[def.key] && label) cargosObjetivo.push(label);
    }

    const value: DestinatariosValue = {
      perfiles: perfilesMarcados,
      niveles: nivelesMarcados,
      grados: gradosMarcados,
      salones: salonesMarcados,
      estudiantes: estudiantesMarcados,
      profesoresIds: profesoresSeleccionados,
      coordinadoresIds: coordinadoresSeleccionados,
      administrativosIds: administrativosSeleccionados,
      secretariasIds: secretariasSeleccionadas,
      orientadoresIds: orientadoresSeleccionados,
    };

    const algunPerfil = Object.values(perfilesMarcados).some(Boolean);
    onChange({
      value,
      perfiles_objetivo: perfilesObjetivo.length > 0 ? perfilesObjetivo : null,
      grados_objetivo: gradosSeleccionados.length > 0 ? gradosSeleccionados : null,
      salones_objetivo: salonesSeleccionados.length > 0 ? salonesSeleccionados : null,
      estudiantes_objetivo: estudiantesSeleccionados.length > 0 ? estudiantesSeleccionados : null,
      cargos_objetivo: cargosObjetivo.length > 0 ? cargosObjetivo : null,
      internos_objetivo: internosObjetivo.length > 0 ? internosObjetivo : null,
      destinatarios_label: buildDestinatariosTexto(),
      segmentos: buildSegmentos(),
      isEmpty: !algunPerfil,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilesMarcados, nivelesMarcados, gradosMarcados, salonesMarcados, estudiantesMarcados,
      profesoresSeleccionados, coordinadoresSeleccionados, administrativosSeleccionados,
      secretariasSeleccionadas, orientadoresSeleccionados,
      listaProfesoresFiltrada, listaCoordinadores, listaAdministrativos, listaSecretarias, listaOrientadores]);

  // ── UI ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div>
        <Label className="font-medium">Perfiles</Label>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          Selecciona uno o más perfiles. Para cada uno aparecerán los filtros y selectores específicos abajo.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PERFILES_UI.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!perfilesMarcados[p.key]} onChange={() => togglePerfil(p.key)} />
              {p.label}
            </label>
          ))}
        </div>
      </div>

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
                  {(salonesPorGrado.length > 0 ? salonesPorGrado : SALONES_DISPONIBLES).map((s) => (
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
                  .sort((a, b) => `${a.apellidos || ""} ${a.nombres || ""}`.localeCompare(`${b.apellidos || ""} ${b.nombres || ""}`))
                  .map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                      <input
                        type="checkbox"
                        checked={!!estudiantesMarcados[e.id]}
                        onChange={(ev) => setEstudiantesMarcados({ ...estudiantesMarcados, [e.id]: ev.target.checked })}
                      />
                      <span className="flex-1">{e.apellidos} {e.nombres}</span>
                      <span className="text-xs text-muted-foreground">{e.grado} {e.salon}</span>
                    </label>
                  ))
              )}
            </div>
          )}
        </div>
      )}

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

      {[
        { on: perfilesMarcados.Coordinadores, label: "Coordinadores", lista: listaCoordinadores, sel: coordinadoresSeleccionados, setter: setCoordinadoresSeleccionados },
        { on: perfilesMarcados.Administrativos, label: "Administrativos", lista: listaAdministrativos, sel: administrativosSeleccionados, setter: setAdministrativosSeleccionados },
        { on: perfilesMarcados.Secretaria, label: "Secretaria General", lista: listaSecretarias, sel: secretariasSeleccionadas, setter: setSecretariasSeleccionadas },
        { on: perfilesMarcados.Orientador, label: "Orientador(a) Escolar", lista: listaOrientadores, sel: orientadoresSeleccionados, setter: setOrientadoresSeleccionados },
      ].filter((x) => x.on).map((grupo) => (
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
        <div className="font-medium mb-1">Resumen:</div>
        <div className="text-muted-foreground">
          {!Object.values(perfilesMarcados).some(Boolean) ? (
            <span className="text-destructive">Selecciona al menos un perfil destinatario.</span>
          ) : (
            <>Destinatarios: <strong>{buildDestinatariosTexto() || "(define filtros para los perfiles seleccionados)"}</strong></>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Calcula los destinatarios NUEVOS comparando snapshot original vs nuevo.
 * Devuelve segmentos + label SOLO con los nuevos, listos para POST a
 * /api/comunicados/enviar. Si no hay nuevos, retorna null.
 */
export function diffNuevosDestinatarios(
  original: DestinatariosSnapshot,
  nuevo: DestinatariosSnapshot,
): { segmentos: any[]; destinatarios_label: string } | null {
  const origPerfiles = new Set(original.perfiles_objetivo || []);
  const newPerfiles = new Set(nuevo.perfiles_objetivo || []);
  const origGrados = new Set(original.grados_objetivo || []);
  const newGrados = new Set(nuevo.grados_objetivo || []);
  const origSalones = new Set(original.salones_objetivo || []);
  const newSalones = new Set(nuevo.salones_objetivo || []);
  const origEstudiantes = new Set((original.estudiantes_objetivo || []).map(String));
  const newEstudiantes = new Set((nuevo.estudiantes_objetivo || []).map(String));
  const origInternos = new Set(original.internos_objetivo || []);
  const newInternos = new Set(nuevo.internos_objetivo || []);

  // Estrategia simple: si CUALQUIER cosa se amplió (perfiles nuevos, grados nuevos,
  // salones nuevos, estudiantes nuevos, internos nuevos), reenviamos con los
  // segmentos NUEVOS pero filtrando.
  //
  // Caso 1: agregaron un perfil que no estaba antes → enviamos a todo ese perfil
  //         con los filtros nuevos.
  // Caso 2: mismo perfil pero agregaron grados/salones/estudiantes/internos
  //         específicos → enviamos solo a los nuevos.
  //
  // Para simplicidad, tomamos la diferencia "ampliación" sin quitar.

  const segmentos: any[] = [];
  const partesLabel: string[] = [];

  // Perfiles que se AGREGARON
  const perfilesAgregados = [...newPerfiles].filter((p) => !origPerfiles.has(p));

  // Para cada perfil ya existente: chequear si se agregaron filtros (grados/salones/estudiantes/internos)
  const perfilesExistentes = [...newPerfiles].filter((p) => origPerfiles.has(p));

  const includeEstPadres = (perfilesArr: string[]) => {
    const filtros: any = { perfil: perfilesArr };
    // Estudiantes nuevos específicos
    const estNuevos = [...newEstudiantes].filter((e) => !origEstudiantes.has(e));
    if (estNuevos.length > 0) {
      filtros.id_destinatarios = estNuevos;
    } else {
      // Grados/salones nuevos
      const gNuevos = [...newGrados].filter((g) => !origGrados.has(g));
      const sNuevos = [...newSalones].filter((s) => !origSalones.has(s));
      if (gNuevos.length > 0) filtros.grados = gNuevos;
      else if (newGrados.size > 0) filtros.grados = [...newGrados];
      if (sNuevos.length > 0) filtros.salones = sNuevos;
      else if (newSalones.size > 0) filtros.salones = [...newSalones];
    }
    segmentos.push(filtros);
  };

  // Perfiles agregados completos (Estudiantes/Padres): envío a todo el filtro nuevo
  const estPadresAgregados = perfilesAgregados.filter((p) => p === "Estudiantes" || p === "Acudientes");
  if (estPadresAgregados.length > 0) {
    const seg: any = { perfil: estPadresAgregados };
    if (newEstudiantes.size > 0) seg.id_destinatarios = [...newEstudiantes];
    else {
      if (newGrados.size > 0) seg.grados = [...newGrados];
      if (newSalones.size > 0) seg.salones = [...newSalones];
    }
    segmentos.push(seg);
    partesLabel.push(estPadresAgregados.join(", "));
  }

  // Estudiantes/Padres existentes: si se agregaron filtros, mandar solo a los nuevos
  const estPadresExistentes = perfilesExistentes.filter((p) => p === "Estudiantes" || p === "Acudientes");
  if (estPadresExistentes.length > 0) {
    const estNuevos = [...newEstudiantes].filter((e) => !origEstudiantes.has(e));
    const gNuevos = [...newGrados].filter((g) => !origGrados.has(g));
    const sNuevos = [...newSalones].filter((s) => !origSalones.has(s));
    if (estNuevos.length > 0 || gNuevos.length > 0 || sNuevos.length > 0) {
      const seg: any = { perfil: estPadresExistentes };
      if (estNuevos.length > 0) seg.id_destinatarios = estNuevos;
      else {
        if (gNuevos.length > 0) seg.grados = gNuevos;
        if (sNuevos.length > 0) seg.salones = sNuevos;
      }
      segmentos.push(seg);
      partesLabel.push(`${estPadresExistentes.join(", ")} adicionales`);
    }
  }

  // Internos: separar por perfil
  const internosNuevos = [...newInternos].filter((i) => !origInternos.has(i));
  const internosPerfiles = ["Profesores", "Coordinadores", "Administrativos", "Secretaria General", "Orientador(a) Escolar", "Rector"];
  for (const perfil of internosPerfiles) {
    const perfilLookup = perfil === "Orientador(a) Escolar" ? "Orientadores" : perfil;
    const yaEstaba = origPerfiles.has(perfil);
    const ahoraEsta = newPerfiles.has(perfil);
    if (!ahoraEsta) continue;
    if (!yaEstaba) {
      // Perfil entero nuevo: ids si los hay, sino todo el perfil.
      const newIdsParaEstePerfil = (nuevo.internos_objetivo || []).filter((id) => {
        // No tenemos el cargo aquí — el server lo resuelve.
        return false;
      });
      // Simplemente agregar perfil — el server filtra.
      segmentos.push({ perfil: [perfilLookup === "Orientadores" ? "Orientadores" : perfil] });
      partesLabel.push(perfil);
    } else {
      // Perfil ya estaba: solo internos nuevos
      if (internosNuevos.length > 0) {
        segmentos.push({ perfil: [perfilLookup === "Orientadores" ? "Orientadores" : perfil], id_destinatarios: internosNuevos });
        partesLabel.push(`${perfil} adicionales`);
      }
    }
  }

  if (segmentos.length === 0) return null;
  return {
    segmentos,
    destinatarios_label: partesLabel.length > 0 ? partesLabel.join(". ") + "." : "Nuevos destinatarios.",
  };
}
