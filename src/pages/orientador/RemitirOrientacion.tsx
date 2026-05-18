import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSession, isProfesor, isAdmin, puedeAccederDashboard,
} from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SignatureCanvas from "react-signature-canvas";
import { Search } from "lucide-react";
import iconEntrevista from "@/assets/icons/entrevista.webp";
import { notifyOrientadora } from "@/lib/notifyStaff";

interface Estudiante {
  id_estudiantil: number;
  nombres: string;
  apellidos: string;
  grado_estudiante: string;
  salon_estudiante: string;
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

  const [autor, setAutor] = useState<{ id: string; nombres: string; apellidos: string; cargo: string }>({
    id: "", nombres: "", apellidos: "", cargo: "",
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

  const backLink = isProfesor() ? "/dashboard" : "/dashboard-rector";

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
    });

    const cargar = async () => {
      const [estsR, asigR, internoR] = await Promise.all([
        supabase.from("Estudiantes")
          .select("id_estudiantil, nombres, apellidos, grado_estudiante, salon_estudiante")
          .order("apellidos"),
        isProfesor()
          ? supabase.from("Asignación Profesores").select('"Grado(s)", "Salon(es)"').eq("id", parseInt(session.id!))
          : Promise.resolve({ data: [] as any[] }),
        isProfesor()
          ? supabase.from("Internos").select("direccion_de_grupo").eq("id", parseInt(session.id!)).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const todos = (estsR.data || []) as Estudiante[];

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
          aulasExactas.has(`${e.grado_estudiante}|${e.salon_estudiante || ""}`) ||
          gradosCompletos.has(e.grado_estudiante)
        ));
      } else {
        setEstudiantes(todos);
      }
      setLoading(false);
    };
    cargar();
  }, [navigate]);

  const estudiantesBase = useMemo(() => {
    let lista = estudiantes;
    if (filtroGrado) lista = lista.filter(e => e.grado_estudiante === filtroGrado);
    if (filtroSalon) lista = lista.filter(e => e.salon_estudiante === filtroSalon);
    return [...lista].sort((a, b) =>
      a.apellidos.localeCompare(b.apellidos, "es") ||
      a.nombres.localeCompare(b.nombres, "es")
    );
  }, [estudiantes, filtroGrado, filtroSalon]);

  const gradosUnicos = useMemo(() => [...new Set(
    estudiantes.map(e => e.grado_estudiante).filter(g => g && g.trim())
  )].sort((a, b) => (GRADO_ORDEN[a] ?? 99) - (GRADO_ORDEN[b] ?? 99) || a.localeCompare(b, "es")), [estudiantes]);

  const salonesUnicos = useMemo(() => [...new Set(
    estudiantes.filter(e => !filtroGrado || e.grado_estudiante === filtroGrado)
      .map(e => e.salon_estudiante).filter(s => s && s.trim())
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

  const tieneFirma = !!firmaData;
  const motivoOk = motivo.trim().length >= 10;
  const camposCompletos = !!(estSeleccionado && motivoOk && tieneFirma);

  const resetForm = () => {
    setEstSeleccionado(null);
    setEstBusqueda("");
    setFiltroGrado("");
    setFiltroSalon("");
    setMotivo("");
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
      const fileName = `firmas-remisiones/${Date.now()}_${autor.id}_${estSeleccionado.id_estudiantil}.png`;
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
      estudiante_id: estSeleccionado.id_estudiantil,
      estudiante_nombre: estSeleccionado.nombres,
      estudiante_apellidos: estSeleccionado.apellidos,
      estudiante_grado: estSeleccionado.grado_estudiante,
      estudiante_salon: estSeleccionado.salon_estudiante,
      motivo: motivo.trim(),
      docente_id: autor.id,
      docente_nombre: docenteNombre,
      docente_cargo: autor.cargo || null,
      firma_url: firmaUrl,
    };

    const { error: insErr } = await supabase
      .from("Remisiones_Orientacion")
      .insert(payload as any);

    if (insErr) {
      console.error("Insert remisión:", insErr);
      toast({ title: "Error", description: "No se pudo guardar la remisión.", variant: "destructive" });
      setGuardando(false);
      return;
    }

    // 3) Notificar orientadora (horario silencioso + cola)
    try {
      const grupo = estSeleccionado.salon_estudiante
        ? `${estSeleccionado.grado_estudiante} ${estSeleccionado.salon_estudiante}`
        : estSeleccionado.grado_estudiante;
      const estLabel = `${estSeleccionado.nombres} ${estSeleccionado.apellidos}`;
      const motivoCorto = motivo.trim().length > 200
        ? motivo.trim().slice(0, 200) + "..."
        : motivo.trim();
      const remitente = [autor.cargo, autor.nombres, autor.apellidos].filter(Boolean).join(" ");
      const mensaje =
        `Nueva remisión a orientación escolar.\n` +
        `Estudiante: ${estLabel} (${grupo}).\n` +
        `Motivo: ${motivoCorto}\n` +
        `Remitido por: ${remitente}.\n\n` +
        `Pueden consultarla entrando a notasnormi.com → Remisiones a Orientación.`;
      await notifyOrientadora(mensaje, remitente || "Sistema Normi");
    } catch (e) {
      console.warn("notifyOrientadora:", e);
    }

    toast({ title: "Remisión enviada", description: "Se notificó a la orientadora." });
    resetForm();
    setGuardando(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink={backLink} />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Remitir a Orientación Escolar</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
            <img src={iconEntrevista} alt="" className="h-6 w-6 object-contain" />
            Remitir a Orientación Escolar
          </h2>

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
                      <span className="text-muted-foreground"> — {estSeleccionado.grado_estudiante}{estSeleccionado.salon_estudiante ? ` ${estSeleccionado.salon_estudiante}` : ""}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setEstSeleccionado(null)}
                      className="text-xs text-primary hover:underline"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={estBusqueda}
                      onChange={e => setEstBusqueda(e.target.value)}
                      onFocus={() => setEstFocused(true)}
                      onBlur={() => setTimeout(() => setEstFocused(false), 150)}
                      placeholder="Buscar estudiante por nombre..."
                      className="w-full border rounded pl-8 pr-3 py-2 text-sm bg-background"
                    />
                    {(estFocused || estBusqueda) && estudiantesBusqueda.length > 0 && (
                      <ul className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-auto bg-popover border rounded shadow-lg z-20">
                        {estudiantesBusqueda.map(e => (
                          <li
                            key={e.id_estudiantil}
                            onMouseDown={() => seleccionarEstudiante(e)}
                            className="px-3 py-2 text-sm hover:bg-accent cursor-pointer"
                          >
                            <span className="font-medium">{e.apellidos} {e.nombres}</span>
                            <span className="text-muted-foreground"> — {e.grado_estudiante}{e.salon_estudiante ? ` ${e.salon_estudiante}` : ""}</span>
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
                      {estSeleccionado.grado_estudiante || "—"}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Salón</label>
                    <div className="text-sm border rounded px-3 py-2 bg-muted/30">
                      {estSeleccionado.salon_estudiante || "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Motivo */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Motivo de remisión <span className="text-muted-foreground text-xs">(mínimo 10 caracteres)</span>
                </label>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={5}
                  placeholder="Describa con claridad la situación que motiva esta remisión..."
                  className="w-full border rounded px-3 py-2 text-sm bg-background resize-y"
                />
              </div>

              {/* Docente que remite */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Docente que remite</label>
                <div className="text-sm border rounded px-3 py-2 bg-muted/30">
                  {[autor.cargo, autor.nombres, autor.apellidos].filter(Boolean).join(" ") || "—"}
                </div>
              </div>

              {/* Firma */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Firma</label>
                <div className="border rounded bg-background">
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
