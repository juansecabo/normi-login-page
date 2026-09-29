import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Check, Search, X, Loader2, Shirt, ChevronDown } from "lucide-react";
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
import { apiRequest } from "@/lib/apiClient";
import { useNivelesCoordina } from "@/hooks/useNivelesCoordina";
import { useNivelDeGrado } from "@/utils/esquema";
import { useEstructuraOrden } from "@/utils/estructuraOrden";
import { ListaEstudiantes, type Estudiante } from "./RetiroRegistroInterno";

/**
 * Registrar falta de uniforme (Juan 2026-09-29): el rector, los coordinadores (solo
 * sus niveles) y el administrador anotan la falta de uno o varios estudiantes. No es
 * una excusa: es un registro para llevar el control. Se avisa a los acudientes.
 */
export const ROLES_FALTA_UNIFORME = ["Administrador", "Rector", "Coordinador(a)"];
export const TIPOS_FALTA_UNIFORME: { value: string; label: string }[] = [
  { value: "sin_uniforme", label: "Sin uniforme" },
  { value: "no_corresponde", label: "Uniforme que no corresponde al día" },
  { value: "zapatos", label: "Zapatos que no son del uniforme" },
  { value: "prendas", label: "Prendas o accesorios no permitidos" },
  { value: "presentacion", label: "Presentación personal" },
  { value: "otro", label: "Otro" },
];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const FaltaUniformeRegistro = () => {
  const navigate = useNavigate();
  const session = getSession();
  const { nivelesCoordina, cargadoNiveles } = useNivelesCoordina();
  const { nivelDe, ready: nivelesListos } = useNivelDeGrado();
  const { gradoRank } = useEstructuraOrden();

  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [seleccionados, setSeleccionados] = useState<Record<number, Estudiante>>({});
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroSalon, setFiltroSalon] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  const [fecha, setFecha] = useState<Date | undefined>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tipo, setTipo] = useState("");
  const [detalle, setDetalle] = useState("");

  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!session.id) { navigate("/"); return; }
    if (!ROLES_FALTA_UNIFORME.includes(session.cargo || "")) { navigate("/permisos-excusas/uniforme-staff"); return; }
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
  const completos = selArr.length > 0 && !!fecha && !!tipo && (tipo !== "otro" || detalle.trim().length > 0);

  const registrar = async () => {
    if (!completos || !fecha) return;
    setSaving(true);
    try {
      const fechaYmd = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
      await apiRequest("/api/uniforme/faltas", {
        method: "POST",
        body: JSON.stringify({ fecha: fechaYmd, tipo, detalle: detalle.trim(), estudiantes: selArr.map((e) => String(e.id)) }),
      });
      setResultado({ ok: true, texto: `Quedó registrada la falta de uniforme de ${selArr.length} estudiante${selArr.length === 1 ? "" : "s"} y se avisó a sus acudientes.` });
      setSeleccionados({}); setTipo(""); setDetalle("");
    } catch (err: any) {
      setResultado({ ok: false, texto: `No se pudo registrar la falta: ${err?.body?.detail || err?.message || err}` });
    }
    setSaving(false);
    setShowConfirm(false);
  };

  const selectorCls = "w-full min-w-0 pl-2 pr-1 sm:px-3 py-2 border border-input rounded-md text-[13px] sm:text-sm bg-card cursor-pointer";

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
            <button onClick={() => navigate("/permisos-excusas/uniforme-staff")} className="text-primary hover:underline">Justificación por Uniforme</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Registrar falta de uniforme</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 space-y-5 max-w-3xl mx-auto" data-guia="falta_uniforme.formulario">
          <h2 className="text-xl font-bold text-foreground flex items-center justify-center gap-2"><Shirt className="w-6 h-6 text-primary" /> Registrar falta de uniforme</h2>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{selArr.length > 1 ? "Estudiantes" : "Estudiante"}</label>
            <button type="button" data-guia="falta_uniforme.seleccionar" onClick={() => setSelectorAbierto(true)}
              className="w-full flex items-center justify-between px-3 py-2 border border-input rounded-md text-sm bg-background hover:bg-accent cursor-pointer">
              <span className={selArr.length ? "text-foreground" : "text-muted-foreground"}>
                {selArr.length === 0 ? "Seleccionar estudiantes" : selArr.length === 1 ? `${selArr[0].apellidos} ${selArr[0].nombres} (${selArr[0].grado} ${selArr[0].salon})` : `${selArr.length} estudiantes`}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
            {selArr.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selArr.map((e) => (
                  <span key={e.id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full pl-2.5 pr-1 py-1">
                    {e.apellidos} {e.nombres} · {e.grado} {e.salon}
                    <button type="button" onClick={() => quitarSel(e.id)} className="hover:text-destructive" title="Quitar"><X className="w-3.5 h-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Fecha</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center justify-between px-3 py-2 border border-input rounded-md text-sm bg-background hover:bg-accent cursor-pointer">
                  {fecha ? format(fecha, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es }) : "Seleccionar fecha"}
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={fecha} onSelect={(d) => { setFecha(d); setCalendarOpen(false); }} locale={es} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2" data-guia="falta_uniforme.tipo">
            <label className="text-sm font-medium text-foreground">Falta</label>
            {TIPOS_FALTA_UNIFORME.map((t) => (
              <label key={t.value} className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setTipo(t.value)}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${tipo === t.value ? "bg-primary border-primary" : "border-border"}`}>
                  {tipo === t.value && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                </div>
                <span className="text-sm text-foreground">{t.label}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{tipo === "otro" ? "¿Cuál es la falta?" : "Observación (opcional)"}</label>
            <textarea data-guia="falta_uniforme.detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)}
              placeholder={tipo === "otro" ? "Describe la falta..." : "Algún detalle que quieras anotar..."}
              className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background min-h-[80px] resize-y" />
          </div>

          <Button data-guia="falta_uniforme.registrar" onClick={() => setShowConfirm(true)} disabled={!completos || saving} className="w-full py-3 text-base font-bold">
            Registrar falta{selArr.length > 1 ? ` (${selArr.length} estudiantes)` : ""}
          </Button>
        </div>
      </main>

      <Dialog open={selectorAbierto} onOpenChange={setSelectorAbierto}>
        <DialogContent className="max-w-2xl rounded-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Seleccionar estudiantes</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select value={filtroGrado} onChange={(e) => { setFiltroGrado(e.target.value); setFiltroSalon(""); }} className={selectorCls}>
                <option value="">Todos los grados</option>
                {gradosUnicos.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={filtroSalon} onChange={(e) => setFiltroSalon(e.target.value)} className={selectorCls}>
                <option value="">Todos los salones</option>
                {salonesUnicos.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar estudiante por nombre..."
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
            <Button onClick={() => setSelectorAbierto(false)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={(o) => !saving && setShowConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Registrar la falta de uniforme?</AlertDialogTitle>
            <AlertDialogDescription>
              {selArr.length === 1 ? `Para ${selArr[0].nombres} ${selArr[0].apellidos}.` : `Para ${selArr.length} estudiantes.`} Se avisará a sus acudientes por WhatsApp.
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
            <AlertDialogTitle>{resultado?.ok ? "Falta registrada" : "No se pudo registrar"}</AlertDialogTitle>
            <AlertDialogDescription>{resultado?.texto}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {resultado?.ok && <AlertDialogCancel onClick={() => navigate("/permisos-excusas/uniforme-staff?vista=faltas")}>Ver faltas</AlertDialogCancel>}
            <AlertDialogAction onClick={() => setResultado(null)}>{resultado?.ok ? "Registrar otra" : "Entendido"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FaltaUniformeRegistro;
