import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { aNumero } from "@/utils/numero";

/**
 * Editor de escala de calificación + rangos de desempeño, compartido por:
 *  - El wizard "Crear Institución" del SuperAdmin (guarda vía plataforma.patchColegio).
 *  - "Configurar Institución" del Rector/Admin (guarda vía colegio.patchConfig).
 *
 * El QUÉ guardar (validaciones, épsilon del rango tope) vive aquí; el CÓMO
 * guardar lo decide el padre con la prop `guardar`.
 */

interface RangoDesempeno { label: string; min: string; max: string; color: string; }

const COLOR_POR_DEFECTO = "#22c55e";

/** Muestra un número limpio (quita el épsilon interno 5.0001 → "5", deja 4.5 → "4.5"). */
const fmtNum = (n: unknown): string => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return String(Math.round(x * 100) / 100);
};

interface Props {
  /** Config actual del colegio (escala_min, escala_max, nota_aprobatoria, decimales, rangos_desempeno). */
  cfg: Record<string, any>;
  /** Persiste la configuración (merge). Lanza para mostrar el error. */
  guardar: (configuracion: Record<string, unknown>) => Promise<void>;
  /** Se llama tras guardar con éxito (recargar, volver, etc.). */
  alGuardar?: () => void;
}

const EscalaColegioEditor = ({ cfg, guardar, alGuardar }: Props) => {
  const { toast } = useToast();
  const [min, setMin] = useState(String(cfg.escala_min ?? 0));
  const [max, setMax] = useState(String(cfg.escala_max ?? 5));
  const [aprob, setAprob] = useState(String(cfg.nota_aprobatoria ?? 3));
  const [dec, setDec] = useState(String(cfg.decimales ?? 1));
  const [rangos, setRangos] = useState<RangoDesempeno[]>(
    Array.isArray(cfg.rangos_desempeno) && cfg.rangos_desempeno.length > 0
      ? [...cfg.rangos_desempeno].sort((a: any, b: any) => Number(b.min) - Number(a.min)).map((r: any) => ({ label: r.label ?? "", min: fmtNum(r.min), max: fmtNum(r.max), color: r.color ?? COLOR_POR_DEFECTO }))
      : [],
  );
  const [guardando, setGuardando] = useState(false);

  const actualizar = (i: number, campo: keyof RangoDesempeno, val: string) =>
    setRangos((prev) => prev.map((r, idx) => (idx === i ? { ...r, [campo]: val } : r)));
  const agregar = () => setRangos((prev) => [...prev, { label: "", min: "", max: "", color: COLOR_POR_DEFECTO }]);
  const quitar = (i: number) => setRangos((prev) => prev.filter((_, idx) => idx !== i));

  const onGuardar = async () => {
    const nMin = aNumero(min), nMax = aNumero(max), nAprob = aNumero(aprob), nDec = Number(dec);
    if (![nMin, nMax, nAprob, nDec].every((n) => Number.isFinite(n))) { toast({ title: "Valores inválidos", variant: "destructive" }); return; }
    if (nMax <= nMin) { toast({ title: "El máximo debe ser mayor al mínimo", variant: "destructive" }); return; }
    if (nAprob < nMin || nAprob > nMax) { toast({ title: "La nota aprobatoria debe estar dentro de la escala", variant: "destructive" }); return; }

    // Rangos: ignorar filas vacías; validar las que tengan nombre.
    const rangosLimpios: { label: string; min: number; max: number; maxCrudo: number; color: string }[] = [];
    for (const r of rangos) {
      const label = r.label.trim();
      if (!label && r.min === "" && r.max === "") continue; // fila vacía → se descarta
      const rMin = aNumero(r.min), rMax = aNumero(r.max);
      if (!label) { toast({ title: "Falta el nombre de un rango", variant: "destructive" }); return; }
      if (!Number.isFinite(rMin) || !Number.isFinite(rMax)) { toast({ title: `Rango "${label}": desde/hasta inválidos`, variant: "destructive" }); return; }
      if (rMax <= rMin) { toast({ title: `Rango "${label}": el hasta debe ser mayor al desde`, variant: "destructive" }); return; }
      // Los rangos NO pueden salirse de la escala (mínima…máxima).
      if (rMin < nMin - 1e-6 || rMax > nMax + 1e-6) {
        toast({ title: `Rango "${label}" fuera de la escala`, description: `Debe estar entre ${nMin} y ${nMax}.`, variant: "destructive" });
        return;
      }
      // NO se permiten rangos que se crucen con otros: cada nota debe caer en
      // exactamente un rango (tocarse en el borde SÍ vale: 2-3 y 3-4).
      for (const otro of rangosLimpios) {
        if (rMin < otro.maxCrudo && otro.min < rMax) {
          toast({
            title: `Los rangos "${label}" y "${otro.label}" se cruzan`,
            description: `"${otro.label}" va de ${fmtNum(otro.min)} a ${fmtNum(otro.maxCrudo)} y "${label}" de ${fmtNum(rMin)} a ${fmtNum(rMax)}. Ajusta los límites: pueden tocarse en el borde, pero no superponerse.`,
            variant: "destructive",
          });
          return;
        }
      }
      // El rango que llega al tope se ajusta a "máxima + épsilon" para que la nota
      // máxima exacta (ej: 5.0) quede incluida (la banda usa nota ≥ desde y nota < hasta).
      const maxFinal = Math.abs(rMax - nMax) < 0.005 ? nMax + 0.0001 : rMax;
      rangosLimpios.push({ label, min: rMin, max: maxFinal, maxCrudo: rMax, color: r.color || COLOR_POR_DEFECTO });
    }

    setGuardando(true);
    try {
      const configuracion: Record<string, unknown> = {
        escala_min: nMin, escala_max: nMax, nota_aprobatoria: nAprob, decimales: nDec, escala: `${nMin}-${nMax}`,
      };
      // Solo escribir rangos si se definió alguno (no pisar con []).
      if (rangosLimpios.length > 0) configuracion.rangos_desempeno = [...rangosLimpios].sort((a, b) => b.min - a.min).map(({ maxCrudo, ...r }) => r);
      await guardar(configuracion);
      toast({ title: "Escala guardada" });
      alGuardar?.();
    } catch (err: any) {
      toast({ title: "No se pudo guardar", description: err?.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div><Label className="text-sm">Nota mínima</Label><Input data-guia="configurar_institucion.escala_min" type="text" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} className="mt-1" /></div>
        <div><Label className="text-sm">Nota máxima</Label><Input type="text" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} className="mt-1" /></div>
        <div><Label className="text-sm">Nota aprobatoria</Label><Input data-guia="configurar_institucion.escala_aprobatoria" type="text" inputMode="decimal" value={aprob} onChange={(e) => setAprob(e.target.value)} className="mt-1" /></div>
        <div><Label className="text-sm">Decimales</Label><Input data-guia="configurar_institucion.escala_decimales" type="number" step="1" min="0" max="2" value={dec} onChange={(e) => setDec(e.target.value)} className="mt-1" /></div>
      </div>

      {/* ── RANGOS DE DESEMPEÑO ── */}
      <div className="mt-8">
        <h3 className="text-base font-semibold">Rangos de desempeño</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Nombre que el colegio le da a cada tramo de notas (ej: «Sobresaliente» de 4.0 a 4.5). Cada nota debe estar entre {min} y {max} (la escala de arriba). Los colores se usan en <strong>Estadísticas</strong> para pintar cada nota según su rango.
        </p>
        {rangos.length === 0 && (
          <p className="text-sm text-muted-foreground italic mb-3">Aún no hay rangos. Agrega el primero abajo (opcional).</p>
        )}
        <div className="space-y-2">
          {rangos.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                {i === 0 && <Label className="text-xs text-muted-foreground">Nombre</Label>}
                <Input data-guia="configurar_institucion.rango_nombre" value={r.label} onChange={(e) => actualizar(i, "label", e.target.value)} placeholder="Ej: Sobresaliente" className="mt-1" />
              </div>
              <div className="w-20">
                {i === 0 && <Label className="text-xs text-muted-foreground">Desde</Label>}
                <Input data-guia="configurar_institucion.rango_desde" type="text" inputMode="decimal" value={r.min} onChange={(e) => actualizar(i, "min", e.target.value)} className="mt-1" />
              </div>
              <div className="w-20">
                {i === 0 && <Label className="text-xs text-muted-foreground">Hasta</Label>}
                <Input type="text" inputMode="decimal" value={r.max} onChange={(e) => actualizar(i, "max", e.target.value)} className="mt-1" />
              </div>
              <div>
                {i === 0 && <Label className="text-xs text-muted-foreground">Color</Label>}
                <input data-guia="configurar_institucion.rango_color" type="color" value={r.color} onChange={(e) => actualizar(i, "color", e.target.value)} className="mt-1 h-10 w-12 rounded border border-border cursor-pointer p-0.5" title="Color del rango" />
              </div>
              <button onClick={() => quitar(i)} className="h-10 text-muted-foreground hover:text-destructive" title="Quitar rango"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <Button data-guia="configurar_institucion.escala_agregar_rango" variant="outline" size="sm" onClick={agregar} className="mt-3 gap-1"><Plus className="w-4 h-4" /> Agregar rango</Button>
      </div>

      <Button data-guia="configurar_institucion.escala_guardar" onClick={onGuardar} disabled={guardando} className="mt-8 gap-2">
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Guardar
      </Button>
    </div>
  );
};

export default EscalaColegioEditor;
