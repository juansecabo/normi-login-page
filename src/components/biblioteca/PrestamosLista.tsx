import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/apiClient";
import { coincideBusqueda } from "@/utils/busqueda";
import { fechaCorta, errorDe } from "./comun";

/** Préstamos en curso, vencidos (y perdidos sin reponer) e historial. Quien gestiona renueva y marca pérdidas. */
interface Prestamo {
  id: number; usuario_id: string; usuario_tipo: string; usuario_nombre: string; usuario_grado: string | null; usuario_salon: string | null;
  fecha_prestamo: string; fecha_vencimiento: string; fecha_devolucion: string | null; renovaciones: number; perdido: boolean; reposicion_fecha: string | null;
  Biblioteca_Obras: { titulo: string } | null; Biblioteca_Ejemplares: { numero_inventario: number } | null;
}
type Accion = { tipo: "renovar" | "perdido" | "repuesto"; p: Prestamo };

const TEXTOS: Record<Accion["tipo"], { titulo: string; desc: (p: Prestamo) => string; boton: string }> = {
  renovar: { titulo: "¿Renovar el préstamo?", desc: (p) => `«${p.Biblioteca_Obras?.titulo}» de ${p.usuario_nombre} tendrá una fecha de devolución nueva.`, boton: "Renovar" },
  perdido: { titulo: "¿Marcar como perdido?", desc: (p) => `${p.usuario_nombre} queda con la reposición de «${p.Biblioteca_Obras?.titulo}» pendiente: no podrá pedir más libros ni tendrá paz y salvo hasta reponerlo.`, boton: "Marcar perdido" },
  repuesto: { titulo: "¿Ya repuso el libro?", desc: (p) => `Se cierra la deuda de ${p.usuario_nombre} y el libro n.° ${p.Biblioteca_Ejemplares?.numero_inventario} vuelve a estar disponible.`, boton: "Sí, lo repuso" },
};

const PrestamosLista = ({ gestiona }: { gestiona: boolean }) => {
  const [vista, setVista] = useState<"vencidos" | "abiertos" | "historial">("vencidos");
  const [lista, setLista] = useState<Prestamo[]>([]);
  const [hoy, setHoy] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busca, setBusca] = useState("");
  const [accion, setAccion] = useState<Accion | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    setCargando(true); setError("");
    try { const r = await apiRequest<{ prestamos: Prestamo[]; hoy: string }>(`/api/biblioteca/prestamos?vista=${vista}`); setLista(r.prestamos); setHoy(r.hoy); }
    catch (err) { setError(errorDe(err)); }
    setCargando(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vista]);

  const filtrados = useMemo(() => lista.filter((p) => coincideBusqueda(busca, p.usuario_nombre, p.Biblioteca_Obras?.titulo || "", p.usuario_id)), [lista, busca]);

  const ejecutar = async () => {
    if (!accion) return;
    setOcupado(true);
    try { await apiRequest(`/api/biblioteca/prestamos/${accion.p.id}/${accion.tipo}`, { method: "POST" }); await cargar(); }
    catch (err) { setError(errorDe(err)); }
    setOcupado(false); setAccion(null);
  };

  const estadoDe = (p: Prestamo) => {
    if (p.fecha_devolucion) return { txt: `Devuelto ${fechaCorta(p.fecha_devolucion)}`, cls: "text-muted-foreground" };
    if (p.perdido && p.reposicion_fecha) return { txt: "Perdido · repuesto", cls: "text-muted-foreground" };
    if (p.perdido) return { txt: "Perdido · sin reponer", cls: "text-rose-700 font-medium" };
    if (p.fecha_vencimiento < hoy) return { txt: `Vencido desde ${fechaCorta(p.fecha_vencimiento)}`, cls: "text-rose-700 font-medium" };
    return { txt: `Vence ${fechaCorta(p.fecha_vencimiento)}`, cls: "text-foreground" };
  };
  const tab = (k: typeof vista, label: string) => (
    <button onClick={() => setVista(k)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${vista === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>{label}</button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" data-guia="biblioteca.prestamos_vistas">{tab("vencidos", "Vencidos")}{tab("abiertos", "En préstamo")}{tab("historial", "Historial")}</div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por persona o libro…" className="w-full pl-9 pr-8 py-2 border border-input rounded-md text-sm bg-background" />
        {busca && <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-4 h-4" /></button>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {cargando ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        : !filtrados.length ? <p className="text-center text-muted-foreground py-8">{vista === "vencidos" ? "No hay libros vencidos." : vista === "abiertos" ? "No hay libros prestados." : "Todavía no hay préstamos."}</p>
        : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{filtrados.length} {filtrados.length === 1 ? "préstamo" : "préstamos"}</p>
            {filtrados.map((p) => {
              const e = estadoDe(p);
              const abierto = !p.fecha_devolucion && !p.reposicion_fecha;
              return (
                <div key={p.id} className="rounded-lg border border-border bg-card p-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">«{p.Biblioteca_Obras?.titulo}» <span className="text-muted-foreground font-normal">n.° {p.Biblioteca_Ejemplares?.numero_inventario}</span></p>
                    <p className="text-muted-foreground">{p.usuario_nombre}{p.usuario_grado ? ` · ${p.usuario_grado} ${p.usuario_salon}` : ""} · prestado {fechaCorta(p.fecha_prestamo)}{p.renovaciones ? ` · renovado ${p.renovaciones}×` : ""}</p>
                  </div>
                  <span className={e.cls}>{e.txt}</span>
                  {gestiona && abierto && (
                    <span className="flex gap-1">
                      {!p.perdido && <button onClick={() => setAccion({ tipo: "renovar", p })} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted">Renovar</button>}
                      {!p.perdido && <button onClick={() => setAccion({ tipo: "perdido", p })} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-rose-700">Perdido</button>}
                      {p.perdido && <button onClick={() => setAccion({ tipo: "repuesto", p })} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-emerald-700">Repuesto</button>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      <AlertDialog open={!!accion} onOpenChange={(o) => !o && !ocupado && setAccion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{accion && TEXTOS[accion.tipo].titulo}</AlertDialogTitle>
            <AlertDialogDescription>{accion && TEXTOS[accion.tipo].desc(accion.p)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={ocupado} onClick={(e) => { e.preventDefault(); ejecutar(); }}>
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : accion && TEXTOS[accion.tipo].boton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PrestamosLista;
