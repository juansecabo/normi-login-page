import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/apiClient";
import { getSession } from "@/hooks/useSession";
import { rankGrado } from "@/utils/grados";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import imgTablero from "@/assets/salon/tablero.webp";
import imgEscritorio from "@/assets/salon/escritorio.webp";
import imgProfesor from "@/assets/salon/profesor.webp";
import imgProfesora from "@/assets/salon/profesora.webp";
import imgAlumno from "@/assets/salon/alumno.webp";
import imgAlumna from "@/assets/salon/alumna.webp";

/**
 * "Armar salón" — vista cenital del aula para armar los salones de forma
 * visual: tablero, escritorio con el/la director(a) de grupo (imagen según su
 * género) y un pupitre por estudiante (niño/niña según género), más un "+"
 * para registrar estudiantes nuevos con todos sus datos.
 *
 * MISMA data que el Panel de Control y Personas (tablas Usuarios/Estudiantes/
 * Internos vía dbProxy): lo que se cambie allá se ve acá y viceversa.
 * El profesor director de grupo solo puede armar SU salón (además del candado
 * visual, el dbProxy fuerza su grado+salón en cualquier escritura).
 */

const NIVELES_GRADOS: Record<string, string[]> = {
  Preescolar: ["Párvulo", "Prejardín", "Jardín", "Transición"],
  Primaria: ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto"],
  Secundaria: ["Sexto", "Séptimo", "Octavo", "Noveno"],
  Media: ["Décimo", "Undécimo"],
};
const getNivelFromGrado = (grado: string): string | null => {
  for (const [nivel, grados] of Object.entries(NIVELES_GRADOS)) {
    if (grados.includes(grado)) return nivel;
  }
  return null;
};

const soloDigitos = (v: string) => v.replace(/\D/g, "");

interface Persona { id: string; nombres: string; apellidos: string; genero: string | null; }

const ArmarSalon = () => {
  const { toast } = useToast();
  const cargo = getSession().cargo || "";
  const esProfesor = cargo === "Profesor(a)";
  // Datos personales (Usuarios) solo los edita el Administrador (inmutabilidad).
  const esAdmin = cargo === "Administrador";

  // ── Salón elegido (el director de grupo queda fijado al suyo) ──
  const [salonesCol, setSalonesCol] = useState<{ grado: string; salon: string }[]>([]);
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [cargandoEstructura, setCargandoEstructura] = useState(true);
  const [sinGrupo, setSinGrupo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (esProfesor) {
          const { data } = await supabase.from("Internos").select("direccion_de_grupo").eq("id", parseInt(getSession().id!)).maybeSingle();
          const dir = String((data as { direccion_de_grupo?: string } | null)?.direccion_de_grupo || "").trim();
          const corte = dir.lastIndexOf(" ");
          if (dir && corte > 0) { setGrado(dir.slice(0, corte)); setSalon(dir.slice(corte + 1)); }
          else setSinGrupo(true);
        } else {
          const r = await apiRequest<{ salones: { grado: string; salon: string }[] }>("/api/institucion/estructura");
          setSalonesCol(r.salones || []);
        }
      } catch { /* sin estructura: los selectores salen vacíos */ }
      finally { setCargandoEstructura(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gradosDisponibles = Array.from(new Set(salonesCol.map((s) => String(s.grado))))
    .sort((a, b) => rankGrado(a) - rankGrado(b));
  const salonesDelGrado = salonesCol.filter((s) => String(s.grado) === grado)
    .map((s) => String(s.salon)).sort((a, b) => Number(a) - Number(b));

  // ── Datos del salón: director + estudiantes (con género desde Usuarios) ──
  const [cargando, setCargando] = useState(false);
  const [director, setDirector] = useState<Persona | null>(null);
  const [estudiantes, setEstudiantes] = useState<Persona[]>([]);

  const cargarSalon = async () => {
    if (!grado || !salon) return;
    setCargando(true);
    try {
      const [dirRes, estRes] = await Promise.all([
        supabase.from("Internos").select("id").eq("direccion_de_grupo", `${grado} ${salon}`).limit(1),
        supabase.from("Estudiantes").select("id").eq("grado", grado).eq("salon", salon),
      ]);
      const dirId = (dirRes.data || [])[0]?.id != null ? String((dirRes.data as any)[0].id) : null;
      const estIds = (estRes.data || []).map((e: any) => String(e.id));
      // Usuarios en LOTES (un .in() gigante revienta la URL de PostgREST).
      const todos = [...estIds, ...(dirId ? [dirId] : [])];
      const porId = new Map<string, Persona>();
      for (let i = 0; i < todos.length; i += 200) {
        const { data } = await supabase.from("Usuarios").select("id, nombres, apellidos, genero").in("id", todos.slice(i, i + 200));
        for (const u of (data || []) as any[]) {
          porId.set(String(u.id), { id: String(u.id), nombres: u.nombres || "", apellidos: u.apellidos || "", genero: u.genero || null });
        }
      }
      setDirector(dirId ? (porId.get(dirId) || { id: dirId, nombres: "", apellidos: "", genero: null }) : null);
      const lista = estIds.map((id) => porId.get(id) || { id, nombres: "", apellidos: "", genero: null });
      lista.sort((a, b) => `${a.apellidos} ${a.nombres}`.toLowerCase().localeCompare(`${b.apellidos} ${b.nombres}`.toLowerCase(), "es"));
      setEstudiantes(lista);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargarSalon(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [grado, salon]);

  // ── Agregar estudiante (mismo flujo del Panel de Control, salón fijado) ──
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [cedula, setCedula] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [genero, setGenero] = useState("");
  const [fechaNac, setFechaNac] = useState("");
  const [bloqueado, setBloqueado] = useState(false); // cédula ya en Usuarios → datos de allá
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Cédula en edición (null = el pop-up está agregando) + salón destino (mover).
  const [editando, setEditando] = useState<string | null>(null);
  const [edGrado, setEdGrado] = useState("");
  const [edSalon, setEdSalon] = useState("");
  const [confirmEliminar, setConfirmEliminar] = useState<Persona | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const bloqueadoRef = useRef(false);
  useEffect(() => { bloqueadoRef.current = bloqueado; }, [bloqueado]);

  const resetForm = () => {
    setCedula(""); setNombres(""); setApellidos(""); setTelefono(""); setGenero(""); setFechaNac(""); setBloqueado(false);
    setEditando(null); setEdGrado(""); setEdSalon("");
  };

  // Autocompletar mientras se escribe la cédula (como en Personas).
  useEffect(() => {
    if (editando) return; // en edición los datos ya vienen prellenados
    const c = cedula.trim();
    if (!/^\d{3,15}$/.test(c)) {
      if (bloqueadoRef.current) { setNombres(""); setApellidos(""); setTelefono(""); setGenero(""); setFechaNac(""); }
      setBloqueado(false);
      return;
    }
    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data } = await supabase.from("Usuarios").select("nombres, apellidos, numero_de_telefono, genero, fecha_de_nacimiento").eq("id", c).maybeSingle();
        if (!vivo) return;
        if (data) {
          const u = data as any;
          setNombres(u.nombres || ""); setApellidos(u.apellidos || ""); setTelefono(u.numero_de_telefono || "");
          setGenero(u.genero || ""); setFechaNac(u.fecha_de_nacimiento || "");
          setBloqueado(true);
        } else if (bloqueadoRef.current) {
          setNombres(""); setApellidos(""); setTelefono(""); setGenero(""); setFechaNac("");
          setBloqueado(false);
        }
      } finally { if (vivo) setBuscando(false); }
    }, 450);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cedula]);

  const agregarEstudiante = async () => {
    const idNorm = soloDigitos(cedula);
    if (!/^\d{3,15}$/.test(idNorm)) { toast({ title: "Cédula inválida", description: "Solo números.", variant: "destructive" }); return; }
    if (!nombres.trim() || !apellidos.trim()) { toast({ title: "Faltan nombres o apellidos", variant: "destructive" }); return; }
    if (!bloqueado && genero !== "M" && genero !== "F") { toast({ title: "Falta el género", description: "El género es obligatorio.", variant: "destructive" }); return; }
    const nivel = getNivelFromGrado(grado);
    if (!nivel) { toast({ title: "Grado inválido", variant: "destructive" }); return; }
    setGuardando(true);
    try {
      // 1) Usuarios (identidad global). Solo se escribe si la persona es NUEVA
      //    (inmutabilidad: los datos de alguien existente no se tocan desde aquí).
      const { data: yaUsuario } = await supabase.from("Usuarios").select("id").eq("id", idNorm).maybeSingle();
      if (!yaUsuario) {
        const nuevo: Record<string, unknown> = { id: idNorm, nombres: nombres.trim(), apellidos: apellidos.trim(), genero };
        if (telefono.trim()) nuevo.numero_de_telefono = telefono.trim();
        if (fechaNac) nuevo.fecha_de_nacimiento = fechaNac;
        const { error: eU } = await supabase.from("Usuarios").insert(nuevo);
        if (eU) {
          const msg = (eU as any).code === "23505" ? "Ese teléfono ya pertenece a otra persona." : eU.message;
          toast({ title: "No se pudo guardar", description: msg, variant: "destructive" });
          return;
        }
      }
      // 2) Estudiantes (membresía en ESTE salón). Si falla y el Usuario era
      //    nuevo, se deshace para no dejar un registro a medias.
      const { error: eE } = await supabase.from("Estudiantes").insert({ id: Number(idNorm), nivel, grado, salon });
      if (eE) {
        if (!yaUsuario) await supabase.from("Usuarios").delete().eq("id", idNorm);
        const msg = (eE as any).code === "23505"
          ? "Esa persona ya está registrada como estudiante del colegio (revisa su salón en el Panel de Control)."
          : eE.message;
        toast({ title: "No se pudo agregar", description: msg, variant: "destructive" });
        return;
      }
      resetForm();
      setDialogAbierto(false);
      await cargarSalon();
    } finally {
      setGuardando(false);
    }
  };

  // ── Editar estudiante (datos personales solo admin; mover de salón, gestores) ──
  const abrirEditar = async (p: Persona) => {
    resetForm();
    setEditando(p.id);
    setCedula(p.id);
    setNombres(p.nombres); setApellidos(p.apellidos); setGenero(p.genero || "");
    setEdGrado(grado); setEdSalon(salon);
    setBloqueado(!esAdmin);
    setDialogAbierto(true);
    const { data } = await supabase.from("Usuarios").select("numero_de_telefono, fecha_de_nacimiento").eq("id", p.id).maybeSingle();
    if (data) { setTelefono((data as any).numero_de_telefono || ""); setFechaNac((data as any).fecha_de_nacimiento || ""); }
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    setGuardando(true);
    try {
      if (esAdmin) {
        if (!nombres.trim() || !apellidos.trim()) { toast({ title: "Faltan nombres o apellidos", variant: "destructive" }); return; }
        if (genero !== "M" && genero !== "F") { toast({ title: "Falta el género", variant: "destructive" }); return; }
        const { error: eU } = await supabase.from("Usuarios").update({
          nombres: nombres.trim(), apellidos: apellidos.trim(), genero,
          numero_de_telefono: telefono.trim() || null,
          fecha_de_nacimiento: fechaNac || null,
        }).eq("id", editando);
        if (eU) {
          const msg = (eU as any).code === "23505" ? "Ese teléfono ya pertenece a otra persona." : eU.message;
          toast({ title: "No se pudo guardar", description: msg, variant: "destructive" });
          return;
        }
      }
      // Mover de salón (no aplica al director de grupo: su salón es fijo).
      if (!esProfesor && (edGrado !== grado || edSalon !== salon)) {
        const nivel = getNivelFromGrado(edGrado);
        if (!nivel) { toast({ title: "Grado inválido", variant: "destructive" }); return; }
        const { error: eE } = await supabase.from("Estudiantes").update({ nivel, grado: edGrado, salon: edSalon }).eq("id", Number(editando));
        if (eE) { toast({ title: "No se pudo mover", description: eE.message, variant: "destructive" }); return; }
      }
      resetForm();
      setDialogAbierto(false);
      await cargarSalon();
    } finally {
      setGuardando(false);
    }
  };

  // ── Eliminar estudiante (retira la matrícula; Usuarios se conserva) ──
  const eliminarEstudiante = async () => {
    if (!confirmEliminar) return;
    setEliminando(true);
    try {
      const { error } = await supabase.from("Estudiantes").delete().eq("id", Number(confirmEliminar.id));
      if (error) {
        toast({ title: "No se pudo eliminar", description: error.message, variant: "destructive" });
        return;
      }
      setConfirmEliminar(null);
      await cargarSalon();
    } finally {
      setEliminando(false);
    }
  };

  // ── Render ──
  if (cargandoEstructura) {
    return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (esProfesor && sinGrupo) {
    return <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">Solo los directores de grupo pueden armar su salón.</p>;
  }

  const imgDirector = director ? (director.genero === "F" ? imgProfesora : imgProfesor) : null;

  return (
    <div>
      {/* Selector de salón (el director de grupo lo tiene fijo) */}
      {esProfesor ? (
        <h3 className="text-lg font-semibold mb-4">Tu salón: {grado} {salon}</h3>
      ) : (
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <Label className="text-sm">Grado</Label>
            <select value={grado} onChange={(e) => { setGrado(e.target.value); setSalon(""); }} className="mt-1 flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Selecciona…</option>
              {gradosDisponibles.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-sm">Salón</Label>
            <select value={salon} onChange={(e) => setSalon(e.target.value)} disabled={!grado} className="mt-1 flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50">
              <option value="">Selecciona…</option>
              {salonesDelGrado.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {!grado || !salon ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">Elige el grado y el salón para armarlo.</p>
      ) : cargando ? (
        <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="max-w-6xl mx-auto">
          {/* Tablero */}
          <img src={imgTablero} alt="Tablero" className="w-full max-w-xl mx-auto block" />

          {/* Escritorio + director(a) de grupo (el profesor va reflejado en espejo) */}
          <div className="flex items-center justify-center gap-4 mt-6 mb-2">
            <img src={imgEscritorio} alt="Escritorio" className="h-32 object-contain" />
            {imgDirector && <img src={imgDirector} alt="Director(a) de grupo" className={`h-36 object-contain ${director?.genero !== "F" ? "-scale-x-100" : ""}`} />}
          </div>
          <p className="text-center text-sm font-medium mb-8">
            {director
              ? <>{director.genero === "F" ? "Directora" : "Director"} de grupo: {director.nombres} {director.apellidos}</>
              : <span className="text-muted-foreground">Este salón aún no tiene director(a) de grupo (se asigna en Personas → Profesores).</span>}
          </p>

          {/* Pupitres (PC: 6 por fila; celular: 2) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-6">
            {estudiantes.map((e) => (
              <div key={e.id} className="flex flex-col items-center">
                <img src={e.genero === "F" ? imgAlumna : imgAlumno} alt="" className="h-28 object-contain" />
                <p className="text-xs text-center mt-1 leading-tight">{e.apellidos}<br />{e.nombres}</p>
                <div className="flex items-center gap-1 mt-1">
                  <button onClick={() => abrirEditar(e)} className="p-1 text-muted-foreground hover:text-primary" title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setConfirmEliminar(e)} className="p-1 text-muted-foreground hover:text-destructive" title="Eliminar">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {/* Pupitre "+" para agregar estudiante */}
            <button
              onClick={() => { resetForm(); setDialogAbierto(true); }}
              className="flex flex-col items-center justify-center min-h-[8rem] border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              title="Agregar estudiante"
            >
              <Plus className="w-10 h-10" />
              <span className="text-xs mt-1">Agregar estudiante</span>
            </button>
          </div>
          {estudiantes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center mt-6">Aún no hay estudiantes en este salón — agrégalos con el +.</p>
          )}
        </div>
      )}

      {/* Pop-up: agregar estudiante con todos sus datos */}
      <Dialog open={dialogAbierto} onOpenChange={(o) => { if (!o) { setDialogAbierto(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar estudiante" : `Agregar estudiante — ${grado} ${salon}`}</DialogTitle>
            <DialogDescription>{editando ? "La cédula no se cambia desde aquí." : "Al escribir una cédula ya registrada, los datos se autocompletan."}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Cédula / ID *</Label>
              <Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Solo números" readOnly={!!editando} className={`mt-1 ${editando ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} />
              {buscando && <p className="text-xs text-muted-foreground mt-1">Buscando…</p>}
            </div>
            <div><Label className="text-sm">Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} readOnly={bloqueado} placeholder="57300…" className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
            <div><Label className="text-sm">Nombres *</Label><Input value={nombres} onChange={(e) => setNombres(e.target.value)} readOnly={bloqueado} className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
            <div><Label className="text-sm">Apellidos *</Label><Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} readOnly={bloqueado} className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
            <div>
              <Label className="text-sm">Género *</Label>
              <select value={genero} onChange={(e) => setGenero(e.target.value)} disabled={bloqueado} className={`mt-1 flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-background"}`}>
                <option value="">Selecciona…</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </div>
            <div><Label className="text-sm">Fecha de nacimiento <span className="text-muted-foreground">(opcional)</span></Label><Input type="date" value={fechaNac} onChange={(e) => setFechaNac(e.target.value)} readOnly={bloqueado} className={`mt-1 ${bloqueado ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`} /></div>
          </div>

          {/* En edición: mover de salón (el director de grupo no puede — su salón es fijo) */}
          {editando && !esProfesor && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Grado</Label>
                <select value={edGrado} onChange={(e) => { setEdGrado(e.target.value); setEdSalon(""); }} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {gradosDisponibles.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-sm">Salón</Label>
                <select value={edSalon} onChange={(e) => setEdSalon(e.target.value)} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Selecciona…</option>
                  {salonesCol.filter((s) => String(s.grado) === edGrado).map((s) => String(s.salon)).sort((a, b) => Number(a) - Number(b)).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
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
            <Button variant="outline" onClick={() => { setDialogAbierto(false); resetForm(); }} disabled={guardando}>Cancelar</Button>
            <Button onClick={editando ? guardarEdicion : agregarEstudiante} disabled={guardando || buscando || (!!editando && !esProfesor && !edSalon)} className="gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {editando ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminar */}
      <Dialog open={!!confirmEliminar} onOpenChange={(o) => { if (!o) setConfirmEliminar(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar estudiante</DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              ¿Eliminar a <strong>{confirmEliminar?.apellidos} {confirmEliminar?.nombres}</strong> (id {confirmEliminar?.id}) de {grado} {salon}?
              <br /><br />
              Se retira su matrícula de estudiante del colegio. Su identidad global se conserva: si algún día vuelve, su cédula lo reconoce de una.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEliminar(null)} disabled={eliminando}>Cancelar</Button>
            <Button variant="destructive" onClick={eliminarEstudiante} disabled={eliminando} className="gap-2">
              {eliminando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ArmarSalon;
