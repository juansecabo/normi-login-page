import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2, ScanLine, BookUp, BookDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";
import Escaner from "./Escaner";
import { fechaLarga, hoyYmd, errorDe } from "./comun";

/**
 * Mostrador de la biblioteca: prestar y devolver. El lector de códigos USB/Bluetooth escribe
 * el código en el campo y da Enter solo; también se puede escanear con la cámara o escribir
 * el número de inventario a mano.
 */
interface LectorBusqueda { id: string; nombre: string; cargo: string | null; grado: string | null; salon: string | null }
interface Situacion {
  abiertos: { id: number; fecha_vencimiento: string; perdido: boolean; Biblioteca_Obras: { titulo: string } | null; Biblioteca_Ejemplares: { numero_inventario: number } | null }[];
  vencidos: number; reposiciones: number; suspendido_hasta: string | null; puede_prestar: boolean; motivo_bloqueo: string | null;
  politica: { max: number; dias: number };
}
interface Lector { id: string; nombre: string; tipo: string; cargo?: string | null; grado?: string | null; salon?: string | null }
interface EnCarrito { codigo: string; numero: number; titulo: string }

const Mostrador = () => {
  const [modo, setModo] = useState<"prestar" | "devolver">("prestar");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
        <button data-guia="biblioteca.modo_prestar" onClick={() => setModo("prestar")} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold transition ${modo === "prestar" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}><BookUp className="w-4 h-4" /> Prestar</button>
        <button data-guia="biblioteca.modo_devolver" onClick={() => setModo("devolver")} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold transition ${modo === "devolver" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}><BookDown className="w-4 h-4" /> Devolver</button>
      </div>
      {modo === "prestar" ? <Prestar /> : <Devolver />}
    </div>
  );
};

/** Campo para el código del libro: Enter (lo manda el lector USB) o la cámara. */
const CampoCodigo = ({ onCodigo, ocupado, autoFocus, guia }: { onCodigo: (c: string) => void; ocupado: boolean; autoFocus?: boolean; guia: string }) => {
  const [v, setV] = useState("");
  const [cam, setCam] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const enviar = (c: string) => { const t = c.trim(); if (t) onCodigo(t); setV(""); setTimeout(() => ref.current?.focus(), 30); };
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input ref={ref} data-guia={guia} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(v); } }}
          placeholder="Escanea el código del libro o escribe su número" className="w-full pl-9 pr-3 py-2.5 border border-input rounded-md text-sm bg-background" disabled={ocupado} />
      </div>
      <Button type="button" variant="outline" onClick={() => setCam(true)} title="Escanear con la cámara"><ScanLine className="w-4 h-4 mr-1" /> Cámara</Button>
      <Escaner abierto={cam} onCerrar={() => setCam(false)} onCodigo={enviar} />
    </div>
  );
};

const Prestar = () => {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<LectorBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [lector, setLector] = useState<Lector | null>(null);
  const [sit, setSit] = useState<Situacion | null>(null);
  const [carrito, setCarrito] = useState<EnCarrito[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (lector || busca.trim().length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      try { const r = await apiRequest<{ lectores: LectorBusqueda[] }>(`/api/biblioteca/lectores?q=${encodeURIComponent(busca.trim())}`); setResultados(r.lectores); }
      catch { setResultados([]); }
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [busca, lector]);

  const elegir = async (id: string) => {
    setOcupado(true); setMsg(null); setCarrito([]);
    try {
      const r = await apiRequest<{ lector: Lector; situacion: Situacion }>(`/api/biblioteca/lectores/${id}`);
      setLector(r.lector); setSit(r.situacion); setResultados([]);
    } catch (err) { setMsg({ ok: false, texto: errorDe(err) }); }
    setOcupado(false);
  };
  const limpiar = () => { setLector(null); setSit(null); setCarrito([]); setBusca(""); setMsg(null); };

  const agregarLibro = async (codigo: string) => {
    setMsg(null);
    try {
      const r = await apiRequest<{ ejemplar: any; prestamo: any }>(`/api/biblioteca/ejemplar/${encodeURIComponent(codigo)}`);
      const e = r.ejemplar;
      const titulo = e.Biblioteca_Obras?.titulo || "Libro";
      if (carrito.some((c) => c.numero === e.numero_inventario)) return;
      if (e.tipo_prestamo === "sala") { setMsg({ ok: false, texto: `«${titulo}» (n.° ${e.numero_inventario}) es solo para consulta en sala.` }); return; }
      if (e.estado !== "disponible") {
        const quien = r.prestamo ? ` Lo tiene ${r.prestamo.usuario_nombre}.` : "";
        setMsg({ ok: false, texto: `«${titulo}» (n.° ${e.numero_inventario}) no está disponible.${quien}` }); return;
      }
      setCarrito((p) => [...p, { codigo, numero: e.numero_inventario, titulo }]);
    } catch (err) { setMsg({ ok: false, texto: errorDe(err) }); }
  };

  const prestar = async () => {
    if (!lector || !carrito.length) return;
    setOcupado(true); setMsg(null);
    try {
      const r = await apiRequest<{ fecha_vencimiento: string }>("/api/biblioteca/prestamos", { method: "POST", body: JSON.stringify({ usuario_id: lector.id, codigos: carrito.map((c) => c.codigo) }) });
      setMsg({ ok: true, texto: `Listo. ${carrito.length === 1 ? "Debe devolverlo" : "Debe devolverlos"} el ${fechaLarga(r.fecha_vencimiento)}.` });
      setCarrito([]);
      const s = await apiRequest<{ situacion: Situacion }>(`/api/biblioteca/lectores/${lector.id}`); setSit(s.situacion);
    } catch (err) { setMsg({ ok: false, texto: errorDe(err) }); }
    setOcupado(false);
  };

  const hoy = hoyYmd();
  const enCurso = sit ? sit.abiertos.filter((p) => !p.perdido).length : 0;
  const cupo = sit ? sit.politica.max - enCurso : 0;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {!lector ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">¿Quién pide el libro?</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input data-guia="biblioteca.buscar_lector" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nombre o documento del estudiante o del profesor"
              className="w-full pl-9 pr-3 py-2.5 border border-input rounded-md text-sm bg-background" />
          </div>
          {buscando && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {resultados.length > 0 && (
            <div className="border border-border rounded-lg divide-y divide-border bg-card">
              {resultados.map((l) => (
                <button key={l.id} onClick={() => elegir(l.id)} className="w-full text-left px-3 py-2 hover:bg-muted text-sm">
                  <span className="font-medium text-foreground">{l.nombre}</span>
                  <span className="text-muted-foreground"> · {l.cargo || `${l.grado} ${l.salon}`}</span>
                </button>
              ))}
            </div>
          )}
          {!buscando && busca.trim().length >= 2 && !resultados.length && <p className="text-sm text-muted-foreground">No se encontró a nadie con ese nombre o documento.</p>}
        </div>
      ) : (
        <div className="rounded-lg border border-border p-4 space-y-3 bg-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{lector.nombre}</p>
              <p className="text-sm text-muted-foreground">{lector.cargo || `${lector.grado} ${lector.salon}`} · puede llevar {sit?.politica.max} {sit?.politica.max === 1 ? "libro" : "libros"} por {sit?.politica.dias} días</p>
            </div>
            <button onClick={limpiar} className="text-sm text-primary hover:underline shrink-0">Cambiar</button>
          </div>
          {sit && sit.abiertos.length > 0 && (
            <div className="text-sm space-y-1">
              <p className="font-medium text-foreground">Tiene prestados:</p>
              {sit.abiertos.map((p) => (
                <p key={p.id} className={p.perdido || p.fecha_vencimiento < hoy ? "text-rose-700" : "text-muted-foreground"}>
                  · {p.Biblioteca_Obras?.titulo} (n.° {p.Biblioteca_Ejemplares?.numero_inventario}) — {p.perdido ? "perdido, sin reponer" : `${p.fecha_vencimiento < hoy ? "venció" : "vence"} el ${fechaLarga(p.fecha_vencimiento)}`}
                </p>
              ))}
            </div>
          )}
          {sit && !sit.puede_prestar ? (
            <p className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 rounded-md p-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {sit.motivo_bloqueo}</p>
          ) : (
            <>
              <CampoCodigo onCodigo={agregarLibro} ocupado={ocupado} autoFocus guia="biblioteca.codigo_prestar" />
              {carrito.length > 0 && (
                <div className="space-y-1">
                  {carrito.map((c) => (
                    <div key={c.numero} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                      <span>«{c.titulo}» <span className="text-muted-foreground">n.° {c.numero}</span></span>
                      <button onClick={() => setCarrito((p) => p.filter((x) => x.numero !== c.numero))} title="Quitar"><X className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button>
                    </div>
                  ))}
                </div>
              )}
              {carrito.length > cupo && <p className="text-sm text-rose-700">Solo puede llevar {Math.max(0, cupo)} más.</p>}
              <Button data-guia="biblioteca.boton_prestar" className="w-full" disabled={!carrito.length || ocupado || carrito.length > cupo} onClick={prestar}>
                {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : `Prestar${carrito.length ? ` (${carrito.length})` : ""}`}
              </Button>
            </>
          )}
        </div>
      )}
      {msg && (
        <p className={`flex items-start gap-2 text-sm rounded-md p-2 ${msg.ok ? "text-emerald-800 bg-emerald-50" : "text-rose-700 bg-rose-50"}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />} {msg.texto}
        </p>
      )}
    </div>
  );
};

const Devolver = () => {
  const [ocupado, setOcupado] = useState(false);
  const [hechas, setHechas] = useState<{ ok: boolean; texto: string; extra?: string }[]>([]);
  const devolver = async (codigo: string) => {
    setOcupado(true);
    try {
      const r = await apiRequest<{ titulo: string; lector: string; dias_atraso: number; suspendido_dias: number }>("/api/biblioteca/devoluciones", { method: "POST", body: JSON.stringify({ codigo }) });
      const extra = r.dias_atraso > 0
        ? `Llegó con ${r.dias_atraso} ${r.dias_atraso === 1 ? "día" : "días"} de retraso${r.suspendido_dias ? `: no podrá pedir libros durante ${r.suspendido_dias} ${r.suspendido_dias === 1 ? "día" : "días"}` : ""}.`
        : undefined;
      setHechas((p) => [{ ok: true, texto: `«${r.titulo}» devuelto por ${r.lector}.`, extra }, ...p].slice(0, 20));
    } catch (err) { setHechas((p) => [{ ok: false, texto: errorDe(err) }, ...p].slice(0, 20)); }
    setOcupado(false);
  };
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      <CampoCodigo onCodigo={devolver} ocupado={ocupado} autoFocus guia="biblioteca.codigo_devolver" />
      {ocupado && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {hechas.map((h, i) => (
        <div key={i} className={`text-sm rounded-md p-2 ${h.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
          <p className="flex items-start gap-2">{h.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />} {h.texto}</p>
          {h.extra && <p className="ml-6 text-amber-800">{h.extra}</p>}
        </div>
      ))}
    </div>
  );
};

export default Mostrador;
