import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

/**
 * Números con los que entrarán las copias nuevas: llegan sugeridos (los siguientes al mayor del colegio)
 * y se pueden cambiar, siempre que ningún otro libro tenga ya ese número. Avisa con `null` mientras
 * algún número no sirva (ocupado, repetido o vacío) o se esté revisando.
 */
const NumerosCopias = ({ cantidad, onCambio }: { cantidad: number; onCambio: (numeros: number[] | null) => void }) => {
  const [vals, setVals] = useState<string[]>([]);
  const [ocupados, setOcupados] = useState<number[]>([]);
  const [revisado, setRevisado] = useState("");
  const valsRef = useRef(vals);
  valsRef.current = vals;

  // Al subir o bajar la cantidad: se conservan los que ya están y se completan con los sugeridos libres.
  useEffect(() => {
    const actuales = valsRef.current;
    if (cantidad <= actuales.length) { setVals(actuales.slice(0, Math.max(0, cantidad))); return; }
    let vivo = true;
    apiRequest<{ siguientes: number[] }>(`/api/biblioteca/numeros?cantidad=${cantidad + actuales.length}`)
      .then((r) => {
        if (!vivo) return;
        const usados = new Set(valsRef.current.map(Number));
        const libres = r.siguientes.filter((n) => !usados.has(n));
        setVals((v) => [...v, ...libres.slice(0, cantidad - v.length).map(String)]);
      }).catch(() => null);
    return () => { vivo = false; };
  }, [cantidad]);

  const clave = vals.join(",");
  useEffect(() => {
    const nums = vals.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!nums.length) { setOcupados([]); setRevisado(clave); return; }
    const t = setTimeout(() => {
      apiRequest<{ ocupados: number[] }>(`/api/biblioteca/numeros?revisar=${nums.join(",")}`)
        .then((r) => { setOcupados(r.ocupados); setRevisado(clave); }).catch(() => null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const repetidos = new Set(vals.filter((v, i) => v && vals.indexOf(v) !== i));
  const malo = (v: string) => !v || Number(v) <= 0 || repetidos.has(v) || ocupados.includes(Number(v));
  const listo = vals.length === Math.max(0, cantidad) && revisado === clave && !vals.some(malo);

  useEffect(() => { onCambio(listo ? vals.map(Number) : null); }, [listo, clave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cantidad <= 0) return null;
  const ocupadosVisibles = vals.filter((v) => v && ocupados.includes(Number(v)));
  return (
    <div className="space-y-1" data-guia="biblioteca.numeros_copias">
      <p className="text-sm text-muted-foreground">{cantidad === 1 ? "Entra con el número:" : "Entran con los números:"}</p>
      <div className="flex flex-wrap gap-2">
        {vals.map((v, i) => (
          <label key={i} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${malo(v) ? "border-rose-400 bg-rose-50 text-rose-800" : "border-input bg-background"}`}>
            <span className="text-muted-foreground">N.°</span>
            <input value={v} inputMode="numeric" aria-label={`Número de la copia ${i + 1}`}
              onChange={(e) => { const nv = e.target.value.replace(/\D/g, "").slice(0, 7); setVals((p) => p.map((x, j) => (j === i ? nv : x))); }}
              className="w-14 bg-transparent font-semibold focus:outline-none" />
          </label>
        ))}
      </div>
      {ocupadosVisibles.length > 0 && <p className="text-xs text-rose-700">Ya hay {ocupadosVisibles.length === 1 ? `un libro con el N.° ${ocupadosVisibles[0]}` : `libros con los números ${ocupadosVisibles.join(", ")}`}.</p>}
      {repetidos.size > 0 && <p className="text-xs text-rose-700">Hay números repetidos.</p>}
    </div>
  );
};

export default NumerosCopias;
