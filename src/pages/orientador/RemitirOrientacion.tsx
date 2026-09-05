import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getSession, isProfesor, isAdmin, puedeAccederDashboard,
} from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SignatureCanvas from "react-signature-canvas";
import { Search } from "lucide-react";
import iconEntrevista from "@/assets/icons/entrevista.webp";
import { notifyOrientadora, notifyRectorCoord, notifyCoordinadoresNivel } from "@/lib/notifyStaff";
import { apiClient } from "@/lib/apiClient";
import { cargoSegunGenero } from "@/lib/entrevistadores";

interface Estudiante {
  id: number;
  nombres: string;
  apellidos: string;
  grado: string;
  salon: string;
}

interface AsigRow {
  grados: string[];
  salones: string[];
}

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo": 0, "Pre-Jardín": 1, "Prejardín": 1, "Jardín": 2, "Transición": 3,
  "Primero": 4, "Segundo": 5, "Tercero": 6, "Cuarto": 7, "Quinto": 8,
  "Sexto": 9, "Séptimo": 10, "Octavo": 11, "Noveno": 12,
  "Décimo": 13, "Undécimo": 14,
};

const hoyBogota = (): Date => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  return new Date(y, m - 1, d);
};

const fmtFechaLarga = (d: Date) =>
  d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

const RemitirOrientacion = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sigRef = useRef<SignatureCanvas>(null);
  // "Remitir a otra persona" (?remision=ID): la MISMA remisión pasa a otra
  // instancia con un paso nuevo (escrito + firma). El estudiante viene fijo.
  const [searchParams] = useSearchParams();
  const remisionId = searchParams.get("remision") ? Number(searchParams.get("remision")) : null;
  const [remBase, setRemBase] = useState<{ id: number; estudiante_id: number; numero: number } | null>(null);

  const [autor, setAutor] = useState<{ id: string; nombres: string; apellidos: string; cargo: string; genero: string | null }>({
    id: "", nombres: "", apellidos: "", cargo: "", genero: null,
  });
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [estBusqueda, setEstBusqueda] = useState("");
  const [estFocused, setEstFocused] = useState(false);
  const [estSeleccionado, setEstSeleccionado] = useState<Estudiante | null>(null);
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [motivo, setMotivo] = useState("");
  const [firmaData, setFirmaData] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // FORMATO 005: destino (uno o varios), tipo de documento y campos ampliados.
  const [destinos, setDestinos] = useState<{ orientacion: boolean; director_grupo: boolean; coordinador: boolean }>({
    orientacion: false, director_grupo: false, coordinador: false,
  });
  const [tipoDoc, setTipoDoc] = useState<"RC" | "TI" | "CC">("TI");
  const [especificacion, setEspecificacion] = useState("");
  const [medidas, setMedidas] = useState("");

  const backLink = isProfesor() ? "/dashboard" : "/dashboard";

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    // Solo internos. Padres y estudiantes quedan bloqueados.
    if (!isProfesor() && !puedeAccederDashboard()) { navigate("/"); return; }

    setAutor({
      id: session.id,
      nombres: session.nombres || "",
      apellidos: session.apellidos || "",
      cargo: session.cargo || "",
      genero: session.genero,
    });

    const cargar = async () => {
      const [estsR, asigR, internoR] = await Promise.all([
        supabase.from("Estudiantes")
          .select("id, grado, salon"),
        isProfesor()
          ? supabase.from("Asignación Profesores").select('"Grado(s)", "Salon(es)"').eq("id", parseInt(session.id!))
          : Promise.resolve({ data: [] as any[] }),
        isProfesor()
          ? supabase.from("Internos").select("direccion_de_grupo").eq("id", parseInt(session.id!)).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // Fase 10.E.19: nombres/apellidos viven en Usuarios.
      const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
      const todos = sortByApellidosNombres(await enrichWithNombres((estsR.data || []) as any)) as Estudiante[];

      if (isProfesor() && !isAdmin()) {
        const rows: AsigRow[] = (asigR.data || []).map((a: any) => ({
          grados: (a["Grado(s)"] as string[] | null) || [],
          salones: (a["Salon(es)"] as string[] | null) || [],
        }));
        const aulasExactas = new Set<string>();
        for (const r of rows) for (const g of r.grados) for (const s of r.salones) aulasExactas.add(`${g}|${s}`);
        const dg = (internoR.data as any)?.direccion_de_grupo as string | null | undefined;
        const gradosCompletos = new Set<string>();
        if (dg && dg.trim()) {
          const parts = dg.trim().split(/\s+/);
          const ultimo = parts[parts.length - 1];
          if (parts.length > 1 && /^\d+$/.test(ultimo)) {
            const g = parts.slice(0, -1).join(" ");
            aulasExactas.add(`${g}|${ultimo}`);
          } else {
            gradosCompletos.add(dg.trim());
          }
        }
        setEstudiantes(todos.filter(e =>
          aulasExactas.has(`${e.grado}|${e.salon || ""}`) ||
          gradosCompletos.has(e.grado)
        ));
      } else {
        setEstudiantes(todos);
      }
      // Modo "remitir a otra persona": el estudiante es el de la remisión (se
      // busca en TODOS los del colegio) y se calcula su número (#n) del estudiante.
      if (remisionId) {
        const { data: rem } = await supabase.from("Remisiones_Orientacion").select("id, estudiante_id, created_at, fecha").eq("id", remisionId).maybeSingle();
        if (rem) {
          const { data: delEst } = await supabase.from("Remisiones_Orientacion").select("id, created_at, fecha").eq("estudiante_id", (rem as any).estudiante_id);
          const orden = ((delEst || []) as any[]).sort((a, b) => (a.created_at || a.fecha).localeCompare(b.created_at || b.fecha) || a.id - b.id);
          const numero = orden.findIndex(x => x.id === (rem as any).id) + 1;
          setRemBase({ id: (rem as any).id, estudiante_id: (rem as any).estudiante_id, numero });
          const pre = todos.find(e => String(e.id) === String((rem as any).estudiante_id));
          if (pre) setEstSeleccionado(pre);
        }
      }
      setLoading(false);
    };
    cargar();
  }, [navigate]);

  const estudiantesBase = useMemo(() => {
    let lista = estudiantes;
    if (filtroGrado) lista = lista.filter(e => e.grado === filtroGrado);
    if (filtroSalon) lista = lista.filter(e => e.salon === filtroSalon);
    return [...lista].sort((a, b) =>
      a.apellidos.localeCompare(b.apellidos, "es") ||
      a.nombres.localeCompare(b.nombres, "es")
    );
  }, [estudiantes, filtroGrado, filtroSalon]);

  const gradosUnicos = useMemo(() => [...new Set(
    estudiantes.map(e => e.grado).filter(g => g && g.trim())
  )].sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99) || a.localeCompare(b, "es")), [estudiantes]);

  const salonesUnicos = useMemo(() => [...new Set(
    estudiantes.filter(e => !filtroGrado || e.grado === filtroGrado)
      .map(e => e.salon).filter(s => s && s.trim())
  )].sort(), [estudiantes, filtroGrado]);

  const estudiantesBusqueda = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = norm(estBusqueda.trim());
    if (!q) return estudiantesBase;
    const tokens = q.split(/\s+/).filter(Boolean);
    return estudiantesBase.filter(e => {
      const full = norm(`${e.nombres} ${e.apellidos}`);
      return tokens.every(t => full.includes(t));
    });
  }, [estudiantesBase, estBusqueda]);

  const seleccionarEstudiante = (e: Estudiante) => {
    setEstSeleccionado(e);
    setEstBusqueda("");
    setEstFocused(false);
  };

  const limpiarFirma = () => {
    sigRef.current?.clear();
    setFirmaData(null);
  };

  const guardarFirma = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      setFirmaData(sigRef.current.toDataURL("image/png"));
    }
  };

  const destinosSel = useMemo(
    () => (Object.keys(destinos) as (keyof typeof destinos)[]).filter((k) => destinos[k]),
    [destinos],
  );
  const tieneFirma = !!firmaData;
  const camposCompletos = !!(
    estSeleccionado &&
    destinosSel.length > 0 &&
    motivo.trim() &&
    especificacion.trim() &&
    medidas.trim() &&
    tieneFirma
  );

  const resetForm = () => {
    setEstSeleccionado(null);
    setEstBusqueda("");
    setFiltroGrado("");
    setFiltroSalon("");
    setMotivo("");
    setEspecificacion("");
    setMedidas("");
    setDestinos({ orientacion: false, director_grupo: false, coordinador: false });
    setTipoDoc("TI");
    setFirmaData(null);
    sigRef.current?.clear();
  };

  const handleEnviar = async () => {
    if (!camposCompletos || !estSeleccionado || !firmaData) return;
    setGuardando(true);

    // 1) Subir firma
    let firmaUrl: string | null = null;
    try {
      const base64 = firmaData.split(",")[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const fileName = `firmas-remisiones/${Date.now()}_${autor.id}_${estSeleccionado.id}.png`;
      const { error: upErr } = await supabase.storage
        .from("normi-archivos")
        .upload(fileName, bytes, { contentType: "image/png" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("normi-archivos").getPublicUrl(fileName);
      firmaUrl = urlData?.publicUrl || null;
    } catch (e: any) {
      console.error("Subir firma:", e);
      toast({ title: "Error", description: "No se pudo subir la firma.", variant: "destructive" });
      setGuardando(false);
      return;
    }

    // 2) Insert
    const docenteNombre = [autor.nombres, autor.apellidos].filter(Boolean).join(" ");
    const payload = {
      estudiante_id: estSeleccionado.id,
      estudiante_nombre: estSeleccionado.nombres,
      estudiante_apellidos: estSeleccionado.apellidos,
      estudiante_grado: estSeleccionado.grado,
      estudiante_salon: estSeleccionado.salon,
      motivo: motivo.trim(),
      especificacion_conducta: especificacion.trim(),
      medidas_previas: medidas.trim(),
      destinos: destinosSel,
      tipo_documento: tipoDoc,
      docente_id: autor.id,
      docente_nombre: docenteNombre,
      docente_cargo: cargoSegunGenero(autor.cargo, autor.genero) || null,
      firma_url: firmaUrl,
    };

    // Modo "remitir a otra persona": paso dentro de la misma remisión (el server
    // cambia el destino, la deja pendiente y avisa al nuevo destinatario).
    if (remisionId && remBase) {
      const destinoSel = destinosSel[0];
      try {
        const res = await apiClient.orientacion.remisionRemitir({
          remision_id: remisionId, destino: destinoSel, motivo: motivo.trim(),
          especificacion_conducta: especificacion.trim(), medidas_previas: medidas.trim(), firma_url: firmaUrl,
        });
        const n = res.aviso?.directos ?? 0;
        toast({ title: "Remisión remitida", description: `La remisión #${remBase.numero} pasó a ${destinoSel === "orientacion" ? "Orientación Escolar" : destinoSel === "coordinador" ? "Coordinación" : "el director de grupo"}${n ? ` y se avisó por WhatsApp a ${n} persona${n === 1 ? "" : "s"}` : ""}.` });
        setGuardando(false);
        navigate(`/orientador/remisiones?est=${remBase.estudiante_id}&rem=${remisionId}`);
      } catch (e: any) {
        console.error("remitir a otra persona:", e);
        toast({ title: "Error", description: (e?.body as any)?.detail || "No se pudo remitir.", variant: "destructive" });
        setGuardando(false);
      }
      return;
    }

    const { error: insErr } = await supabase
      .from("Remisiones_Orientacion")
      .insert(payload as any);

    if (insErr) {
      console.error("Insert remisión:", insErr);
      toast({ title: "Error", description: "No se pudo guardar la remisión.", variant: "destructive" });
      setGuardando(false);
      return;
    }

    // 3) Notificar a los destinos elegidos. (Director de grupo / coordinador se
    //    resuelven y notifican en el server — Fase 2. Aquí, orientación por ahora.)
    try {
      const grupo = estSeleccionado.salon
        ? `${estSeleccionado.grado} ${estSeleccionado.salon}`
        : estSeleccionado.grado;
      const estLabel = `${estSeleccionado.nombres} ${estSeleccionado.apellidos}`;
      const motivoCorto = motivo.trim().length > 200
        ? motivo.trim().slice(0, 200) + "..."
        : motivo.trim();
      const remitente = [cargoSegunGenero(autor.cargo, autor.genero), autor.nombres, autor.apellidos].filter(Boolean).join(" ");
      const destLabels = [
        destinos.orientacion && "Orientación Escolar",
        destinos.director_grupo && "Director de Grupo",
        destinos.coordinador && "Coordinador",
      ].filter(Boolean).join(", ");
      const mensaje =
        `Nueva remisión (Formato 005).\n` +
        `Estudiante: ${estLabel} (${grupo}).\n` +
        `Dirigida a: ${destLabels}.\n` +
        `Motivo: ${motivoCorto}\n` +
        `Remitido por: ${remitente}.`;
      if (destinos.orientacion) {
        await notifyOrientadora(mensaje + `\n\nConsúltala en notasnormi.com → Remisiones.`, remitente || "Sistema Normi");
      }
      // Director de grupo y/o coordinador: notifyRectorCoord con el aula avisa al
      // coordinador correcto (por nivel) y a los docentes del aula (incluye al
      // director de grupo). Solo cuando alguno de esos dos fue elegido.
      if ((destinos.director_grupo || destinos.coordinador) && estSeleccionado.salon) {
        await notifyRectorCoord(mensaje, `Sistema Normi (Remisión)`, { grado: estSeleccionado.grado, salon: estSeleccionado.salon }, "remision");
      } else if (estSeleccionado.salon) {
        // Aunque la remisión vaya solo a Orientación, el coordinador del nivel
        // del estudiante debe enterarse (pedido de la coordinadora Nancy, 2026-09-04).
        await notifyCoordinadoresNivel(mensaje + `\n\nConsúltala en notasnormi.com → Remisiones.`, { grado: estSeleccionado.grado, salon: estSeleccionado.salon }, "Remisión");
      }
    } catch (e) {
      console.warn("notificar remisión:", e);
    }

    toast({ title: "Remisión enviada", description: "Quedó registrada y se notificó a los destinos." });
    resetForm();
    setGuardando(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable clave={`remitir-${remisionId ?? ""}`}>
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/orientador/remisiones")} className="text-primary hover:underline">Orientación Escolar</button>
            <span className="text-muted-foreground">&rarr;</span>
            {remisionId && remBase && estSeleccionado && (<>
              <button onClick={() => navigate(`/orientador/remisiones?est=${estSeleccionado.id}`)} className="text-primary hover:underline">{estSeleccionado.apellidos} {estSeleccionado.nombres}</button>
              <span className="text-muted-foreground">&rarr;</span>
              <button onClick={() => navigate(`/orientador/remisiones?est=${estSeleccionado.id}&rem=${remBase.id}`)} className="text-primary hover:underline">Remisión #{remBase.numero}</button>
              <span className="text-muted-foreground">&rarr;</span>
            </>)}
            <span className="text-foreground font-medium">{remisionId ? "Remitir a otra persona" : "Nueva remisión"}</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
            <img src={iconEntrevista} alt="" className="h-6 w-6 object-contain" />
            {remisionId ? `Remitir a otra persona${remBase ? ` · Remisión #${remBase.numero}` : ""}` : "Remitir a Orientación Escolar"}
          </h2>
          {remisionId && (
            <p className="text-sm text-muted-foreground -mt-4 mb-6">Es la misma remisión: pasa a la instancia que elijas con tu escrito y firma, y queda pendiente para esa persona. Todo el recorrido se conserva.</p>
          )}

          {loading ? (
            <div className="text-muted-foreground text-sm">Cargando...</div>
          ) : (
            <div className="space-y-6">
              {/* Fecha */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Fecha</label>
                <div className="text-sm text-muted-foreground">
                  {fmtFechaLarga(hoyBogota())}
                </div>
              </div>

              {/* Estudiante */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Estudiante</label>

                {/* Filtros opcionales */}
                {!estSeleccionado && (
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <select
                      value={filtroGrado}
                      onChange={e => { setFiltroGrado(e.target.value); setFiltroSalon(""); }}
                      className="text-sm border rounded px-2 py-1 bg-background"
                    >
                      <option value="">Todos los grados</option>
                      {gradosUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select
                      value={filtroSalon}
                      onChange={e => setFiltroSalon(e.target.value)}
                      className="text-sm border rounded px-2 py-1 bg-background"
                    >
                      <option value="">Todos los salones</option>
                      {salonesUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                {estSeleccionado ? (
                  <div className="flex items-center justify-between gap-2 border rounded px-3 py-2 bg-muted/30">
                    <span className="text-sm">
                      <strong>{estSeleccionado.apellidos} {estSeleccionado.nombres}</strong>
                      <span className="text-muted-foreground"> — {estSeleccionado.grado}{estSeleccionado.salon ? ` ${estSeleccionado.salon}` : ""}</span>
                    </span>
                    {!remisionId && (
                      <button
                        type="button"
                        onClick={() => setEstSeleccionado(null)}
                        className="text-xs text-primary hover:underline"
                      >
                        Cambiar
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      data-guia="orientacion.remitir_estudiante_buscador"
                      type="text"
                      value={estBusqueda}
                      onChange={e => setEstBusqueda(e.target.value)}
                      onFocus={() => setEstFocused(true)}
                      onBlur={() => setTimeout(() => setEstFocused(false), 150)}
                      placeholder="Buscar estudiante por nombre..."
                      className="w-full border rounded pl-8 pr-3 py-2 text-sm bg-background"
                    />
                    {(estFocused || estBusqueda) && estudiantesBusqueda.length > 0 && (
                      <ul data-guia="orientacion.remitir_estudiante_opcion" className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-auto bg-popover border rounded shadow-lg z-20">
                        {estudiantesBusqueda.map(e => (
                          <li
                            key={e.id}
                            onMouseDown={() => seleccionarEstudiante(e)}
                            className="px-3 py-2 text-sm hover:bg-accent cursor-pointer"
                          >
                            <span className="font-medium">{e.apellidos} {e.nombres}</span>
                            <span className="text-muted-foreground"> — {e.grado}{e.salon ? ` ${e.salon}` : ""}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(estFocused || estBusqueda) && estudiantesBusqueda.length === 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 px-3 py-2 text-sm text-muted-foreground bg-popover border rounded shadow-lg z-20">
                        Sin coincidencias
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Grado / Salón (auto) */}
              {estSeleccionado && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Grado</label>
                    <div className="text-sm border rounded px-3 py-2 bg-muted/30">
                      {estSeleccionado.grado || "—"}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Salón</label>
                    <div className="text-sm border rounded px-3 py-2 bg-muted/30">
                      {estSeleccionado.salon || "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Tipo de documento (datos de identificación) */}
              {estSeleccionado && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Documento de identidad</label>
                  <div data-guia="orientacion.remitir_tipo_documento" className="flex flex-wrap items-center gap-4 border rounded px-3 py-2 bg-muted/20">
                    {(["RC", "TI", "CC"] as const).map((t) => (
                      <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="radio" name="tipoDoc" checked={tipoDoc === t} onChange={() => setTipoDoc(t)} className="accent-primary" /> {t}
                      </label>
                    ))}
                    <span className="text-sm text-muted-foreground ml-auto">N.º: {estSeleccionado.id}</span>
                  </div>
                </div>
              )}

              {/* Remitir a (uno o varios) */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Remitir a</label>
                <div data-guia="orientacion.remitir_destino" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 text-sm border rounded px-3 py-2 cursor-pointer hover:bg-accent">
                    <input type="radio" name="destino" checked={destinos.orientacion} onChange={() => setDestinos({ orientacion: true, director_grupo: false, coordinador: false })} className="accent-primary" />
                    Orientación Escolar
                  </label>
                  <label className="flex items-center gap-2 text-sm border rounded px-3 py-2 cursor-pointer hover:bg-accent">
                    <input type="radio" name="destino" checked={destinos.director_grupo} onChange={() => setDestinos({ orientacion: false, director_grupo: true, coordinador: false })} className="accent-primary" />
                    Director(a) de grupo
                  </label>
                  <label className="flex items-center gap-2 text-sm border rounded px-3 py-2 cursor-pointer hover:bg-accent">
                    <input type="radio" name="destino" checked={destinos.coordinador} onChange={() => setDestinos({ orientacion: false, director_grupo: false, coordinador: true })} className="accent-primary" />
                    Coordinador(a)
                  </label>
                </div>
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Motivo de la remisión
                </label>
                <textarea
                  data-guia="orientacion.remitir_motivo"
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={4}
                  placeholder="¿Por qué se remite al estudiante?"
                  className="w-full border rounded px-3 py-2 text-sm bg-background resize-y"
                />
              </div>

              {/* Especificación de la conducta o dificultad */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Especificación de la conducta o dificultad
                </label>
                <textarea
                  data-guia="orientacion.remitir_especificacion"
                  value={especificacion}
                  onChange={e => setEspecificacion(e.target.value)}
                  rows={4}
                  placeholder="Describa con detalle la conducta o dificultad observada..."
                  className="w-full border rounded px-3 py-2 text-sm bg-background resize-y"
                />
              </div>

              {/* Medidas pedagógicas aplicadas previamente */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Medidas pedagógicas aplicadas previamente
                </label>
                <textarea
                  data-guia="orientacion.remitir_medidas"
                  value={medidas}
                  onChange={e => setMedidas(e.target.value)}
                  rows={4}
                  placeholder="¿Qué acciones se intentaron antes de remitir?"
                  className="w-full border rounded px-3 py-2 text-sm bg-background resize-y"
                />
              </div>

              {/* Docente que remite */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Docente que remite</label>
                <div className="text-sm border rounded px-3 py-2 bg-muted/30">
                  {[cargoSegunGenero(autor.cargo, autor.genero), autor.nombres, autor.apellidos].filter(Boolean).join(" ") || "—"}
                </div>
              </div>

              {/* Firma */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Firma</label>
                <div data-guia="orientacion.remitir_firma" className="border rounded bg-background">
                  <SignatureCanvas
                    ref={sigRef}
                    penColor="black"
                    canvasProps={{ className: "w-full h-40 rounded" }}
                    onEnd={guardarFirma}
                  />
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={limpiarFirma}
                    className="text-xs text-primary hover:underline"
                  >
                    Limpiar firma
                  </button>
                </div>
              </div>

              {/* Botón */}
              <div className="flex justify-end">
                <button
                  type="button"
                  data-guia="orientacion.remitir_enviar"
                  disabled={!camposCompletos || guardando}
                  onClick={handleEnviar}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {guardando ? "Enviando..." : "Enviar remisión"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default RemitirOrientacion;
