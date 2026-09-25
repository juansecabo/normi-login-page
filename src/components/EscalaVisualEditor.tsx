import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GraduationCap, Loader2, Plus, Trash2 } from "lucide-react";
import { aNumero } from "@/utils/numero";

/**
 * Escala de calificación en fichas (piloto Cailico, Juan 2026-09-25): en vez del
 * formulario de filas, se ve la escala como tarjetas (Rango, Aprueba con, barra de
 * colores y una ficha por rango). Al tocar una ficha se edita en una ventana; los
 * rangos vecinos se ajustan solos según los decimales (si un rango queda "hasta 4.5",
 * el siguiente empieza "desde 4.6"). Guarda en el mismo formato que EscalaColegioEditor:
 * cada rango con min y max (max exclusivo = min del siguiente; el tope lleva +0.0001).
 */

interface Banda { label: string; min: number; max: number; color: string }
interface Props {
  cfg: Record<string, any>;
  guardar: (configuracion: Record<string, unknown>) => Promise<void>;
  alGuardar?: () => void;
}

const COLOR_NUEVO = "#22c55e";
const EPS = 1e-6;

/** Oscurece un color hex (para que el nombre del rango se lea sobre el fondo claro). */
const oscurecer = (hex: string, f = 0.55): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#374151";
  const n = parseInt(m[1], 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, "0");
  return `#${c(16)}${c(8)}${c(0)}`;
};

const EscalaVisualEditor = ({ cfg, guardar, alGuardar }: Props) => {
  const [escMin, setEscMin] = useState<number>(Number(cfg.escala_min ?? 0));
  const [escMax, setEscMax] = useState<number>(Number(cfg.escala_max ?? 5));
  const [aprob, setAprob] = useState<number>(Number(cfg.nota_aprobatoria ?? 3));
  const [dec, setDec] = useState<number>(Number(cfg.decimales ?? 1));
  // Bandas de menor a mayor. El max del tope se guarda como escala_max (+0.0001 al persistir).
  const [bandas, setBandas] = useState<Banda[]>(() => {
    const max0 = Number(cfg.escala_max ?? 5);
    return (Array.isArray(cfg.rangos_desempeno) ? cfg.rangos_desempeno : [])
      .map((r: any) => ({ label: String(r.label ?? ""), min: Number(r.min), max: Math.min(Number(r.max), max0), color: r.color || COLOR_NUEVO }))
      .filter((b: Banda) => Number.isFinite(b.min) && Number.isFinite(b.max))
      .sort((a: Banda, b: Banda) => a.min - b.min)
      // Rangos contiguos: cada uno termina donde empieza el siguiente. Hay colegios con los
      // rangos guardados "con hueco" (Básico 7 a 7.9, Alto 8 a 9): se leen como Básico hasta
      // 7.9 y Alto desde 8, y al guardar quedan sin hueco (una nota 7.95 ya cae en Básico).
      .map((b: Banda, i: number, arr: Banda[]) => (i < arr.length - 1 ? { ...b, max: arr[i + 1].min } : b));
  });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const paso = Math.pow(10, -dec);
  const red = (n: number) => Number((Math.round(n / paso) * paso).toFixed(dec));
  /** Número visible según los decimales del colegio; los extremos de la escala sin decimales. */
  const fmt = (n: number) => {
    if (Math.abs(n - escMin) < EPS || Math.abs(n - escMax) < EPS) return String(Math.round(n * 100) / 100);
    return red(n).toFixed(dec);
  };
  /** "Hasta" que ve el usuario: el max exclusivo menos un paso (el tope, la nota máxima). */
  const hastaVisible = (i: number, lista = bandas) => (i === lista.length - 1 ? escMax : red(lista[i].max - paso));

  // ── Ventanas de edición ──
  const [editando, setEditando] = useState<number | "nueva" | null>(null);
  const [fNombre, setFNombre] = useState("");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [fColor, setFColor] = useState(COLOR_NUEVO);
  const [fError, setFError] = useState<string | null>(null);
  const [escalaAbierta, setEscalaAbierta] = useState(false);
  const [eMin, setEMin] = useState(""); const [eMax, setEMax] = useState(""); const [eAprob, setEAprob] = useState(""); const [eDec, setEDec] = useState("");

  const abrirBanda = (i: number) => {
    const b = bandas[i];
    setEditando(i); setFNombre(b.label); setFDesde(fmt(b.min)); setFHasta(fmt(hastaVisible(i))); setFColor(b.color); setFError(null);
  };
  const abrirNueva = () => {
    setEditando("nueva"); setFNombre(""); setFDesde(""); setFHasta(""); setFColor(COLOR_NUEVO); setFError(null);
  };

  const persistir = async (lista: Banda[], esc = { escMin, escMax, aprob, dec }) => {
    setGuardando(true); setAviso(null);
    try {
      const rangos = [...lista].sort((a, b) => b.min - a.min).map((b, idx) => ({
        label: b.label, color: b.color, min: b.min,
        // El rango tope incluye la nota máxima (la banda usa nota >= min y nota < max).
        max: idx === 0 ? esc.escMax + 0.0001 : b.max,
      }));
      await guardar({
        escala_min: esc.escMin, escala_max: esc.escMax, nota_aprobatoria: esc.aprob, decimales: esc.dec,
        escala: `${esc.escMin}-${esc.escMax}`, ...(rangos.length ? { rangos_desempeno: rangos } : {}),
      });
      setAviso("Guardado");
      alGuardar?.();
      return true;
    } catch (err: any) {
      setAviso(`No se pudo guardar: ${err?.message || "error"}`);
      return false;
    } finally {
      setGuardando(false);
    }
  };

  /** Aplica la edición de una ficha y reacomoda los vecinos. */
  const guardarBanda = async () => {
    const nombre = fNombre.trim();
    if (!nombre) { setFError("Escribe el nombre del rango."); return; }
    const d = red(aNumero(fDesde)), h = red(aNumero(fHasta));
    if (!Number.isFinite(d) || !Number.isFinite(h)) { setFError("Revisa las notas: deben ser números."); return; }
    if (d < escMin - EPS || h > escMax + EPS) { setFError(`Las notas deben estar entre ${fmt(escMin)} y ${fmt(escMax)}.`); return; }
    if (h < d - EPS) { setFError("La nota final no puede ser menor que la inicial."); return; }
    const hExcl = Math.abs(h - escMax) < EPS ? escMax : red(h + paso);

    let lista = bandas.map((b) => ({ ...b }));
    if (editando === "nueva") {
      // Un rango nuevo recorta a los que pisa; no puede quedar metido dentro de otro.
      const dentro = lista.find((b) => b.min < d - EPS && b.max > hExcl + EPS);
      if (dentro) { setFError(`Queda dentro de "${dentro.label}". Ajusta primero "${dentro.label}" para dejarle espacio.`); return; }
      lista = lista
        .filter((b) => !(b.min >= d - EPS && b.max <= hExcl + EPS))
        .map((b) => {
          if (b.min < d - EPS && b.max > d + EPS) return { ...b, max: d };
          if (b.min < hExcl - EPS && b.max > hExcl + EPS) return { ...b, min: hExcl };
          return b;
        });
      lista.push({ label: nombre, min: d, max: hExcl, color: fColor });
      lista.sort((a, b) => a.min - b.min);
    } else if (typeof editando === "number") {
      const i = editando;
      const ant = lista[i - 1], sig = lista[i + 1];
      // El primero siempre empieza en la nota mínima y el último termina en la máxima.
      const nd = i === 0 ? escMin : d;
      const nh = i === lista.length - 1 ? escMax : hExcl;
      if (ant && nd <= ant.min + EPS) { setFError(`"${ant.label}" empieza en ${fmt(ant.min)}: la nota inicial debe ser mayor.`); return; }
      if (sig && nh >= sig.max - EPS) { setFError(`"${sig.label}" quedaría sin notas: la nota final debe ser menor.`); return; }
      lista[i] = { label: nombre, min: nd, max: nh, color: fColor };
      if (ant) ant.max = nd;      // el anterior termina justo antes
      if (sig) sig.min = nh;      // el siguiente empieza un paso después del "hasta"
    }
    if (await persistir(lista)) { setBandas(lista); setEditando(null); }
  };

  /** Quitar un rango: sus notas pasan al rango de abajo (o al de arriba si es el primero). */
  const quitarBanda = async () => {
    if (typeof editando !== "number") return;
    const i = editando;
    let lista = bandas.map((b) => ({ ...b }));
    if (lista.length > 1) {
      if (i > 0) lista[i - 1].max = lista[i].max; else lista[1].min = lista[0].min;
    }
    lista = lista.filter((_, idx) => idx !== i);
    if (await persistir(lista)) { setBandas(lista); setEditando(null); }
  };

  const abrirEscala = () => { setEMin(fmt(escMin)); setEMax(fmt(escMax)); setEAprob(aprob.toFixed(dec)); setEDec(String(dec)); setFError(null); setEscalaAbierta(true); };
  const guardarEscala = async () => {
    const nMin = aNumero(eMin), nMax = aNumero(eMax), nAprob = aNumero(eAprob), nDec = Number(eDec);
    if (![nMin, nMax, nAprob].every(Number.isFinite) || !(nDec >= 0 && nDec <= 2)) { setFError("Revisa los valores."); return; }
    if (nMax <= nMin) { setFError("La nota máxima debe ser mayor que la mínima."); return; }
    if (nAprob < nMin || nAprob > nMax) { setFError("La nota aprobatoria debe estar dentro de la escala."); return; }
    const lista = bandas.map((b) => ({ ...b }));
    if (lista.length) { lista[0].min = nMin; lista[lista.length - 1].max = nMax; }
    if (lista.some((b) => b.max <= b.min + EPS)) { setFError("Con esa escala algún rango quedaría sin notas. Ajusta primero los rangos."); return; }
    const esc = { escMin: nMin, escMax: nMax, aprob: nAprob, dec: nDec };
    if (await persistir(lista, esc)) { setEscMin(nMin); setEscMax(nMax); setAprob(nAprob); setDec(nDec); setBandas(lista); setEscalaAbierta(false); }
  };

  const total = Math.max(escMax - escMin, EPS);
  const bandasVista = bandas;

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground flex items-center justify-center gap-2 mb-6">
        <GraduationCap className="w-6 h-6 text-primary" /> Escala de calificación
      </h2>

      {/* Rango y nota aprobatoria */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-xl">
        <button onClick={abrirEscala} data-guia="configurar_institucion.escala_rango" className="text-left rounded-2xl border border-border bg-card p-4 sm:p-5 hover:bg-muted transition-colors">
          <div className="text-sm text-muted-foreground">Rango</div>
          <div className="text-3xl sm:text-4xl font-bold text-primary mt-1">{fmt(escMin)} a {fmt(escMax)}</div>
        </button>
        <button onClick={abrirEscala} data-guia="configurar_institucion.escala_aprobatoria" className="text-left rounded-2xl border border-border bg-card p-4 sm:p-5 hover:bg-muted transition-colors">
          <div className="text-sm text-muted-foreground">Aprueba con</div>
          <div className="text-3xl sm:text-4xl font-bold text-foreground mt-1">{aprob.toFixed(dec)}</div>
        </button>
      </div>

      {/* Barra: cada rango ocupa lo que le toca de la escala */}
      {bandasVista.length > 0 && (
        <div className="mt-6 flex h-5 w-full overflow-hidden rounded-full border border-border">
          {bandasVista.map((b, i) => (
            <div key={i} style={{ width: `${((b.max - b.min) / total) * 100}%`, background: `${b.color}55` }} title={b.label} />
          ))}
        </div>
      )}

      {/* Una ficha por rango (de menor a mayor). Tocar para editar. */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-guia="configurar_institucion.escala_rangos">
        {bandasVista.map((b, i) => (
          <button
            key={i}
            onClick={() => abrirBanda(i)}
            data-guia="configurar_institucion.rango_ficha"
            className="text-left rounded-2xl border p-4 transition-shadow hover:shadow-md"
            style={{ background: `${b.color}14`, borderColor: `${b.color}66` }}
          >
            <div className="font-bold text-lg break-words" style={{ color: oscurecer(b.color) }}>{b.label}</div>
            <div className="font-semibold text-foreground mt-0.5">{fmt(b.min)} a {fmt(hastaVisible(i))}</div>
          </button>
        ))}
      </div>

      <Button data-guia="configurar_institucion.escala_agregar_rango" variant="outline" size="sm" onClick={abrirNueva} className="mt-4 gap-1">
        <Plus className="w-4 h-4" /> Agregar rango
      </Button>

      {(guardando || aviso) && (
        <p className="mt-3 text-sm text-muted-foreground flex items-center gap-2">
          {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : aviso}
        </p>
      )}

      {/* Ventana: editar o agregar un rango */}
      <Dialog open={editando !== null} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editando === "nueva" ? "Nuevo rango" : "Editar rango"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-sm">Nombre</Label><Input value={fNombre} onChange={(e) => setFNombre(e.target.value)} placeholder="Ej: Superior" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Desde</Label>
                <Input type="text" inputMode="decimal" value={fDesde} onChange={(e) => setFDesde(e.target.value)} disabled={editando === 0} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Hasta</Label>
                <Input type="text" inputMode="decimal" value={fHasta} onChange={(e) => setFHasta(e.target.value)} disabled={typeof editando === "number" && editando === bandas.length - 1} className="mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm">Color</Label>
              <input type="color" value={fColor} onChange={(e) => setFColor(e.target.value)} className="h-9 w-12 rounded border border-border cursor-pointer p-0.5" />
            </div>
            {fError && <p className="text-sm text-destructive">{fError}</p>}
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            {typeof editando === "number" ? (
              <Button variant="ghost" onClick={quitarBanda} disabled={guardando} className="text-destructive gap-1"><Trash2 className="w-4 h-4" /> Quitar</Button>
            ) : <span />}
            <Button onClick={guardarBanda} disabled={guardando}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ventana: escala (rango, aprobatoria, decimales) */}
      <Dialog open={escalaAbierta} onOpenChange={setEscalaAbierta}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Escala</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-sm">Nota mínima</Label><Input type="text" inputMode="decimal" value={eMin} onChange={(e) => setEMin(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-sm">Nota máxima</Label><Input type="text" inputMode="decimal" value={eMax} onChange={(e) => setEMax(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-sm">Aprueba con</Label><Input type="text" inputMode="decimal" value={eAprob} onChange={(e) => setEAprob(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-sm">Decimales</Label><Input type="number" min="0" max="2" step="1" value={eDec} onChange={(e) => setEDec(e.target.value)} className="mt-1" /></div>
          </div>
          {fError && <p className="text-sm text-destructive">{fError}</p>}
          <DialogFooter><Button onClick={guardarEscala} disabled={guardando}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EscalaVisualEditor;
