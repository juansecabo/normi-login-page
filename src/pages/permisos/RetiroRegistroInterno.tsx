import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import SignatureCanvas from "react-signature-canvas";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Check, Search, X, Paperclip, Camera, Upload, Loader2, DoorOpen, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import HeaderNormi from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/hooks/useSession";
import { usePreservarFirma } from "@/hooks/usePreservarFirma";
import { useNivelesCoordina } from "@/hooks/useNivelesCoordina";
import { useNivelDeGrado } from "@/utils/esquema";
import { useEstructuraOrden } from "@/utils/estructuraOrden";
import { cargoSegunGenero, cargoConArticulo } from "@/lib/entrevistadores";
import { notifyRectorCoord } from "@/lib/notifyStaff";

/**
 * Permiso de salida registrado por el PERSONAL (Juan 2026-09-23): rector,
 * coordinadores (solo estudiantes de sus niveles) y administrador llenan el mismo
 * formato que los padres (fecha, hora, cómo sale, motivo, adjuntos y firma) y
 * pueden escoger VARIOS estudiantes a la vez, como en Observador / Portería.
 * Se guarda una fila por estudiante en Autorizaciones_Retiro (acudiente_* vacío,
 * autorizado_por_* con quien firma), así funciona igual que un retiro del
 * acudiente: calendario, excusa en la asistencia desde esa hora y aviso a los
 * profesores según el horario.
 */

const ROLES_OK = ["Administrador", "Rector", "Coordinador(a)"];
const TIPOS_SALIDA = [
  { value: "motocicleta_vehiculo", label: "Por su cuenta, a pie, en su motocicleta y/o vehículo particular conduciendo el estudiante" },
  { value: "transporte", label: "Con el Sr(a) del transporte" },
  { value: "familiar", label: "Con un familiar" },
];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
interface Estudiante { id: number; nombres: string; apellidos: string; grado: string; salon: string }

/** Lista virtualizada con su propio desplazamiento. Vive dentro de la ventana
 *  emergente: se crea al abrirla, así el virtualizador mide un recuadro real. */
const ListaEstudiantes = ({ cargando, filtrados, seleccionados, onToggle }: {
  cargando: boolean; filtrados: Estudiante[]; seleccionados: Record<number, Estudiante>; onToggle: (e: Estudiante) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: filtrados.length, getScrollElement: () => ref.current, estimateSize: () => 68, overscan: 10 });
  const items = virt.getVirtualItems();
  return (
    <div ref={ref} data-guia="retiro_interno.item_estudiante" className="h-[50vh] overflow-y-auto pr-1 rounded-md">
      {cargando ? (
        <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : filtrados.length === 0 ? (
        <p className="text-center py-10 text-muted-foreground">No hay estudiantes con esos filtros.</p>
      ) : (
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {items.map((vi) => {
            const e = filtrados[vi.index];
            const marcado = !!seleccionados[e.id];
            return (
              <label key={e.id} ref={virt.measureElement} data-index={vi.index} style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${vi.start}px)`, paddingBottom: 8 }}
                className="block cursor-pointer">
                <div className={`flex items-center gap-3 border rounded-lg p-3 transition-colors ${marcado ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${marcado ? "bg-primary border-primary" : "border-border"}`}>
                  {marcado && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                </div>
                <input type="checkbox" className="sr-only" checked={marcado} onChange={() => onToggle(e)} />
                <div>
                  <p className="font-semibold text-foreground text-sm">{e.apellidos} {e.nombres}</p>
                  <p className="text-xs text-muted-foreground">{e.grado} {e.salon}</p>
                </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

const RetiroRegistroInterno = () => {
  const navigate = useNavigate();
  const session = getSession();
  const { nivelesCoordina, cargadoNiveles } = useNivelesCoordina();
  const { nivelDe, ready: nivelesListos } = useNivelDeGrado();
  const { gradoRank } = useEstructuraOrden();
  const sigCanvas = useRef<SignatureCanvas>(null);

  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [seleccionados, setSeleccionados] = useState<Record<number, Estudiante>>({});
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [fecha, setFecha] = useState<Date | undefined>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [horaH, setHoraH] = useState("");
  const [horaM, setHoraM] = useState("");
  const [horaAP, setHoraAP] = useState("");
  const [tipoSalida, setTipoSalida] = useState("");
  const [nombrePersona, setNombrePersona] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [motivo, setMotivo] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [firma, setFirma] = useState<string | null>(null);
  usePreservarFirma(sigCanvas, firma);

  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  // "Rector" y "Administrador" no traen "(a)": sin esto una rectora quedaba "el rector".
  const cargoFirma = cargoSegunGenero(session.cargo === "Rector" ? "Rector(a)" : session.cargo === "Administrador" ? "Administrador(a)" : (session.cargo || undefined), session.genero);
  const nombreFirma = [session.nombres, session.apellidos].filter(Boolean).join(" ");

  useEffect(() => {
    if (!session.id) { navigate("/"); return; }
    if (!ROLES_OK.includes(session.cargo || "")) { navigate("/permisos-excusas/retiro-staff"); return; }
    (async () => {
      try {
        const { data, error } = await supabase.from("Estudiantes").select("id, grado, salon").fetchAll();
        if (error) throw error;
        const { enrichWithNombres, sortByApellidosNombres } = await import("@/lib/nombresUsuarios");
        const todos = sortByApellidosNombres(await enrichWithNombres((data || []) as any));
        setEstudiantes(todos.map((e: any) => ({ id: Number(e.id), nombres: e.nombres, apellidos: e.apellidos, grado: e.grado, salon: String(e.salon ?? "") })));
      } catch (err: any) {
        setResultado({ ok: false, texto: `No se pudo cargar la lista de estudiantes: ${err?.message || err}. Recarga la página.` });
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coordinador(a): solo los estudiantes de sus niveles.
  const permitidos = useMemo(() => estudiantes.filter((e) => !nivelesCoordina || nivelesCoordina.includes(nivelDe(e.grado))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [estudiantes, nivelesCoordina, nivelesListos]);
  const gradosUnicos = useMemo(() => [...new Set(permitidos.map((e) => e.grado).filter(Boolean))]
    .sort((a, b) => gradoRank(a) - gradoRank(b) || a.localeCompare(b, "es")), [permitidos, gradoRank]);
  const salonesUnicos = useMemo(() => [...new Set(permitidos.filter((e) => !filtroGrado || e.grado === filtroGrado).map((e) => e.salon).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [permitidos, filtroGrado]);
  const filtrados = useMemo(() => {
    const tokens = norm(busqueda.trim()).split(/\s+/).filter(Boolean);
    return permitidos.filter((e) => {
      if (filtroGrado && e.grado !== filtroGrado) return false;
      if (filtroSalon && e.salon !== filtroSalon) return false;
      if (tokens.length && !tokens.every((t) => norm(`${e.nombres} ${e.apellidos}`).includes(t))) return false;
      return true;
    });
  }, [permitidos, filtroGrado, filtroSalon, busqueda]);

  const selArr = Object.values(seleccionados);
  const toggleSel = (e: Estudiante) => setSeleccionados((p) => { const n = { ...p }; if (n[e.id]) delete n[e.id]; else n[e.id] = e; return n; });
  const quitarSel = (id: number) => setSeleccionados((p) => { const n = { ...p }; delete n[id]; return n; });

  const completos = selArr.length > 0 && fecha && horaH && horaM && horaAP && tipoSalida && motivo.trim() && firma
    && (tipoSalida !== "familiar" || (nombrePersona.trim() && parentesco.trim()))
    && (tipoSalida !== "transporte" || nombrePersona.trim());

  const subir = async (path: string, body: Blob | Uint8Array, contentType: string): Promise<string> => {
    const { error } = await supabase.storage.from("normi-archivos").upload(path, body, { contentType, upsert: false });
    if (error) throw error;
    return supabase.storage.from("normi-archivos").getPublicUrl(path).data?.publicUrl || "";
  };

  const registrar = async () => {
    if (!completos || !fecha || !firma) return;
    setSaving(true);
    try {
      const bytes = Uint8Array.from(atob(firma.split(",")[1]), (c) => c.charCodeAt(0));
      const firmaUrl = await subir(`firmas/${Date.now()}_${session.id}.png`, bytes, "image/png");
      const adjuntos: string[] = [];
      for (const f of archivos) {
        const limpio = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        adjuntos.push(await subir(`adjuntos_retiro/${Date.now()}_${session.id}_${limpio}`, f, f.type || "application/octet-stream"));
      }
      let h24 = parseInt(horaH, 10);
      if (horaAP === "PM" && h24 !== 12) h24 += 12;
      if (horaAP === "AM" && h24 === 12) h24 = 0;
      const hora = `${String(h24).padStart(2, "0")}:${horaM}`;
      const fechaYmd = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
      const filas = selArr.map((e) => ({
        fecha_autorizacion: fechaYmd,
        hora_retiro: hora,
        estudiante_id: e.id,
        estudiante_nombre: e.nombres,
        estudiante_apellidos: e.apellidos,
        estudiante_grado: e.grado,
        estudiante_salon: e.salon,
        tipo_salida: tipoSalida,
        nombre_persona_autorizada: tipoSalida === "motocicleta_vehiculo" ? null : nombrePersona || null,
        parentesco: tipoSalida === "familiar" ? parentesco : null,
        motivo,
        firma_url: firmaUrl,
        archivos_url: adjuntos.length ? adjuntos : null,
        autorizado_por_id: session.id,
        autorizado_por_nombre: nombreFirma,
        autorizado_por_cargo: cargoFirma,
      }));
      const { error } = await supabase.from("Autorizaciones_Retiro").insert(filas);
      if (error) throw error;

      // Un aviso por salón (rector, coordinación y profesores según el horario del salón).
      const tipoLabel = TIPOS_SALIDA.find((t) => t.value === tipoSalida)?.label || tipoSalida;
      const persona = tipoSalida === "motocicleta_vehiculo" ? "" : `\nPersona autorizada: ${nombrePersona}${tipoSalida === "familiar" && parentesco ? ` (${parentesco})` : ""}.`;
      const porSalon = new Map<string, Estudiante[]>();
      for (const e of selArr) { const k = `${e.grado}|${e.salon}`; porSalon.set(k, [...(porSalon.get(k) || []), e]); }
      for (const [k, ests] of porSalon) {
        const [grado, salon] = k.split("|");
        const lista = ests.map((e) => `${e.nombres} ${e.apellidos} (id ${e.id})`).join(", ");
        const mensaje =
          `Nuevo permiso de salida registrado por ${cargoConArticulo(cargoFirma)} ${nombreFirma}.\n\n` +
          `${ests.length === 1 ? "Estudiante" : "Estudiantes"} de ${grado} ${salon}: ${lista}.\n` +
          `Fecha de retiro: ${format(fecha, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}.\n` +
          `Hora de retiro: ${horaH}:${horaM} ${horaAP}.\n` +
          `Tipo de salida: ${tipoLabel}.${persona}\n` +
          `Motivo: ${motivo}.\n` +
          `Pueden revisarlo en la plataforma en Permisos y Excusas.`;
        notifyRectorCoord(mensaje, "Sistema Normi (Retiro)", { grado, salon, horario: { fecha_inicio: fechaYmd, desde: hora } }, "retiro", { incluirPorteros: true, programarEn: `${fechaYmd}T${hora}:00-05:00` });
      }

      setResultado({ ok: true, texto: `Quedó registrado el permiso de salida de ${selArr.length} estudiante${selArr.length === 1 ? "" : "s"}.` });
      setSeleccionados({}); setHoraH(""); setHoraM(""); setHoraAP(""); setTipoSalida(""); setNombrePersona(""); setParentesco("");
      setMotivo(""); setArchivos([]); setFirma(null); sigCanvas.current?.clear();
    } catch (err: any) {
      setResultado({ ok: false, texto: `No se pudo registrar el permiso: ${err?.message || err}` });
    }
    setSaving(false);
    setShowConfirm(false);
  };

  const selectorCls = "w-full min-w-0 pl-2 pr-1 sm:px-3 py-2 border border-input rounded-md text-[13px] sm:text-sm bg-card cursor-pointer";
  const lineaCls = "inline px-1 py-1 border-b-2 border-primary/40 text-primary font-medium bg-transparent text-sm cursor-pointer outline-none";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8 pb-24 lg:pb-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/permisos-excusas")} className="text-primary hover:underline">Permisos y Excusas</button>
            <span className="text-muted-foreground">&rarr;</span>
            <button onClick={() => navigate("/permisos-excusas/retiro-staff")} className="text-primary hover:underline">Retiro de Estudiantes</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Registrar permiso de salida</span>
          </BreadcrumbDeslizable>
        </div>

        {/* 2. El mismo formato que llenan los padres, firmado por quien autoriza. */}
        <div className="bg-card rounded-lg shadow-soft p-6 space-y-5" data-guia="retiro_interno.formulario">
          <h2 className="text-xl font-bold text-foreground flex items-center justify-center gap-2"><DoorOpen className="w-6 h-6 text-primary" /> Registrar permiso de salida</h2>
          <h3 className="font-bold text-foreground text-center">AUTORIZACIÓN PARA RETIRO DE ESTUDIANTES EN JORNADA ESCOLAR</h3>

          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span className="font-medium text-red-600">La autorización es para el día:</span>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1 px-3 py-1.5 border-b-2 border-primary/40 text-primary font-medium bg-transparent hover:bg-accent rounded cursor-pointer min-w-[200px]">
                  {fecha ? format(fecha, "dd/MM/yyyy (EEEE)", { locale: es }) : "Seleccionar fecha"}
                  <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={fecha} onSelect={(d) => { setFecha(d); setCalendarOpen(false); }} locale={es} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span className="font-medium text-red-600">Hora del retiro:</span>
            <select value={horaH} onChange={(e) => setHoraH(e.target.value)} className={lineaCls}>
              <option value="">--</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={String(h)}>{h}</option>)}
            </select>
            <span>:</span>
            <select value={horaM} onChange={(e) => setHoraM(e.target.value)} className={lineaCls}>
              <option value="">--</option>
              {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={horaAP} onChange={(e) => setHoraAP(e.target.value)} className={lineaCls}>
              <option value="">--</option>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>

          <p className="text-sm text-foreground leading-relaxed">
            Yo <span className="px-1 border-b-2 border-primary/40 text-primary font-medium">{nombreFirma}</span>, {cargoSegunGenero("identificado(a)", session.genero)} con C.C. No. <span className="px-1 border-b-2 border-primary/40 text-primary font-medium">{session.id}</span>, en calidad de <span className="px-1 border-b-2 border-primary/40 text-primary font-medium">{cargoFirma}</span>, autorizo a{" "}
            <button type="button" data-guia="retiro_interno.seleccionar" onClick={() => setSelectorAbierto(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 border-b-2 border-primary/40 text-primary font-medium hover:bg-accent rounded cursor-pointer">
              {selArr.length === 0 ? "Seleccionar estudiantes" : selArr.length === 1 ? `${selArr[0].nombres} ${selArr[0].apellidos} (${selArr[0].grado} ${selArr[0].salon})` : `${selArr.length} estudiantes`}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {" "}para que {selArr.length > 1 ? "salgan" : "salga"} de la institución: (Marque una de las siguientes opciones)
          </p>

          {selArr.length > 1 && (
            <div className="flex flex-wrap gap-1.5 -mt-2">
              {selArr.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full pl-2.5 pr-1 py-1">
                  {e.apellidos} {e.nombres} · {e.grado} {e.salon}
                  <button type="button" onClick={() => quitarSel(e.id)} className="hover:text-destructive" title="Quitar"><X className="w-3.5 h-3.5" /></button>
                </span>
              ))}
            </div>
          )}

          <div className="space-y-3 ml-2">
            {TIPOS_SALIDA.map((tipo) => (
              <div key={tipo.value} className="space-y-2">
                <label className="flex items-start gap-3 cursor-pointer select-none" onClick={() => { setTipoSalida(tipo.value); setNombrePersona(""); setParentesco(""); }}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${tipoSalida === tipo.value ? "bg-primary border-primary" : "border-border"}`}>
                    {tipoSalida === tipo.value && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                  </div>
                  <span className="text-sm text-foreground">{tipo.label}</span>
                </label>
                {tipoSalida === tipo.value && tipo.value !== "motocicleta_vehiculo" && (
                  <div className="ml-8 space-y-2 text-sm">
                    <div className="flex flex-wrap items-baseline gap-1">
                      <span>Nombre de la persona</span>
                      <input type="text" value={nombrePersona} onChange={(e) => setNombrePersona(e.target.value)} placeholder="___________________"
                        className="inline-block px-2 py-1 border-b-2 border-input bg-transparent text-sm min-w-[200px] focus:border-primary outline-none" />
                    </div>
                    {tipo.value === "familiar" && (
                      <div className="flex flex-wrap items-baseline gap-1">
                        <span>Parentesco:</span>
                        <input type="text" value={parentesco} onChange={(e) => setParentesco(e.target.value)} placeholder="___________________"
                          className="inline-block px-2 py-1 border-b-2 border-input bg-transparent text-sm min-w-[200px] focus:border-primary outline-none" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Motivo de salida anticipada:</label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Describa el motivo..."
              className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[80px] resize-y" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Archivos adjuntos</label>
            <p className="text-xs text-muted-foreground">Puedes adjuntar fotos, documentos u otros soportes relacionados.</p>
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" id="archivos-retiro-interno" className="hidden"
              onChange={(e) => { setArchivos([...archivos, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
            <input type="file" accept="image/*" capture="environment" id="foto-retiro-interno" className="hidden"
              onChange={(e) => { setArchivos([...archivos, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
            <div className="flex flex-wrap gap-2">
              <label htmlFor="foto-retiro-interno" className="inline-flex items-center gap-2 px-3 py-1.5 border border-dashed border-primary/40 rounded-md cursor-pointer hover:bg-accent text-sm text-primary font-medium"><Camera className="w-4 h-4" /> Tomar foto</label>
              <label htmlFor="archivos-retiro-interno" className="inline-flex items-center gap-2 px-3 py-1.5 border border-dashed border-primary/40 rounded-md cursor-pointer hover:bg-accent text-sm text-primary font-medium"><Upload className="w-4 h-4" /> Subir archivo</label>
            </div>
            {archivos.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {archivos.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-muted/30 border border-border rounded text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1"><Paperclip className="w-4 h-4 text-muted-foreground shrink-0" /><span className="truncate">{f.name}</span></div>
                    <button type="button" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))} className="ml-2 text-muted-foreground hover:text-destructive shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Firma de quien autoriza</label>
            <div data-guia="retiro_interno.firma" className="border-2 border-dashed border-border rounded-lg bg-white">
              <SignatureCanvas ref={sigCanvas} penColor="black" canvasProps={{ className: "w-full", style: { width: "100%", height: "160px" } }}
                onEnd={() => { if (sigCanvas.current && !sigCanvas.current.isEmpty()) setFirma(sigCanvas.current.toDataURL("image/png")); }} />
            </div>
            <div className="flex gap-2 items-center">
              <button type="button" onClick={() => { sigCanvas.current?.clear(); setFirma(null); }} className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:bg-accent cursor-pointer">Limpiar firma</button>
              {firma && <span className="text-xs text-green-600 font-medium">✓ Firmado</span>}
            </div>
          </div>

          <Button data-guia="retiro_interno.registrar" onClick={() => setShowConfirm(true)} disabled={!completos || saving} className="w-full py-3 text-base font-bold">
            Registrar permiso de salida{selArr.length > 1 ? ` (${selArr.length} estudiantes)` : ""}
          </Button>
          {!completos && <p className="text-xs text-muted-foreground text-center">Para registrar: selecciona al menos un estudiante, la fecha, la hora, cómo sale, el motivo y firma.</p>}
        </div>
      </main>

      {/* Selector de estudiantes en ventana emergente (buscar, filtrar y marcar varios). */}
      <Dialog open={selectorAbierto} onOpenChange={setSelectorAbierto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Seleccionar estudiantes</DialogTitle></DialogHeader>
          <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
              <select data-guia="retiro_interno.filtro_grado" value={filtroGrado} onChange={(e) => { setFiltroGrado(e.target.value); setFiltroSalon(""); }} className={selectorCls}>
                <option value="">Todos los grados</option>
                {gradosUnicos.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select data-guia="retiro_interno.filtro_salon" value={filtroSalon} onChange={(e) => setFiltroSalon(e.target.value)} className={selectorCls}>
                <option value="">Todos los salones</option>
                {salonesUnicos.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input data-guia="retiro_interno.buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar estudiante por nombre..."
                className="w-full pl-9 pr-9 py-2 border border-input rounded-md text-sm bg-card" />
              {busqueda && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBusqueda("")} title="Limpiar" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <ListaEstudiantes cargando={loading || !cargadoNiveles} filtrados={filtrados} seleccionados={seleccionados} onToggle={toggleSel} />
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-2">
            <span className="text-sm text-muted-foreground">{selArr.length} seleccionado{selArr.length === 1 ? "" : "s"}{selArr.length > 0 && <> · <button type="button" onClick={() => setSeleccionados({})} className="underline hover:text-destructive">Quitar todos</button></>}</span>
            <Button data-guia="retiro_interno.listo" onClick={() => setSelectorAbierto(false)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={(o) => !saving && setShowConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Registrar el permiso de salida?</AlertDialogTitle>
            <AlertDialogDescription>
              {selArr.length === 1 ? `Para ${selArr[0].nombres} ${selArr[0].apellidos}.` : `Para ${selArr.length} estudiantes.`} Quedará registrado y se notificará a acudientes, profesores y portería.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); registrar(); }} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Registrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!resultado} onOpenChange={(o) => !o && setResultado(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{resultado?.ok ? "Permiso registrado" : "No se pudo registrar"}</AlertDialogTitle>
            <AlertDialogDescription>{resultado?.texto}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {resultado?.ok && <AlertDialogCancel onClick={() => navigate("/permisos-excusas/retiro-staff")}>Ver retiros</AlertDialogCancel>}
            <AlertDialogAction onClick={() => setResultado(null)}>{resultado?.ok ? "Registrar otro" : "Entendido"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RetiroRegistroInterno;
