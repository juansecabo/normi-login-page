import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";
import { errorDe } from "./comun";

/** Reglas de préstamo: cuántos libros y por cuántos días según quién los pide; renovaciones y suspensión. Sin multas en dinero. */
type Pol = { max: number; dias: number };
interface Config { politicas: { estudiante: Pol; docente: Pol; personal: Pol }; renovaciones_max: number; suspension_por_atraso: boolean }
const FILAS: { k: keyof Config["politicas"]; label: string }[] = [
  { k: "estudiante", label: "Estudiantes" }, { k: "docente", label: "Profesores" }, { k: "personal", label: "Directivos y demás personal" },
];

const ConfigBiblioteca = ({ editable }: { editable: boolean }) => {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => { apiRequest<{ config: Config }>("/api/biblioteca/config").then((r) => setCfg(r.config)).catch((err) => setMsg({ ok: false, texto: errorDe(err) })); }, []);
  if (!cfg) return msg ? <p className="text-sm text-destructive">{msg.texto}</p> : <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  const setPol = (k: keyof Config["politicas"], campo: keyof Pol, v: string) =>
    setCfg({ ...cfg, politicas: { ...cfg.politicas, [k]: { ...cfg.politicas[k], [campo]: Number(v.replace(/\D/g, "")) || 0 } } });
  const guardar = async () => {
    setGuardando(true); setMsg(null);
    try { const r = await apiRequest<{ config: Config }>("/api/biblioteca/config", { method: "PUT", body: JSON.stringify(cfg) }); setCfg(r.config); setMsg({ ok: true, texto: "Guardado." }); }
    catch (err) { setMsg({ ok: false, texto: errorDe(err) }); }
    setGuardando(false);
  };
  const inp = "w-20 px-2 py-1.5 border border-input rounded-md text-sm bg-background text-center disabled:opacity-60";

  return (
    <div className="space-y-5 max-w-xl mx-auto" data-guia="biblioteca.config">
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 bg-muted text-xs font-semibold text-muted-foreground"><span>Quién lo pide</span><span className="w-20 text-center">Libros a la vez</span><span className="w-20 text-center">Días</span></div>
        {FILAS.map((f) => (
          <div key={f.k} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 items-center border-t border-border text-sm">
            <span>{f.label}</span>
            <input value={cfg.politicas[f.k].max} onChange={(e) => setPol(f.k, "max", e.target.value)} className={inp} disabled={!editable} inputMode="numeric" />
            <input value={cfg.politicas[f.k].dias} onChange={(e) => setPol(f.k, "dias", e.target.value)} className={inp} disabled={!editable} inputMode="numeric" />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">La fecha de devolución nunca cae en fin de semana, festivo ni día sin clases.</p>
      <div className="flex items-center gap-3 text-sm">
        Renovaciones permitidas por préstamo
        <input value={cfg.renovaciones_max} onChange={(e) => setCfg({ ...cfg, renovaciones_max: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={inp} disabled={!editable} inputMode="numeric" />
      </div>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input type="checkbox" className="mt-1" checked={cfg.suspension_por_atraso} disabled={!editable} onChange={(e) => setCfg({ ...cfg, suspension_por_atraso: e.target.checked })} />
        <span>Si devuelve tarde, no puede pedir libros durante tantos días como días de retraso. <span className="text-muted-foreground">Con libros vencidos o perdidos sin reponer nunca se presta. No hay multas en dinero.</span></span>
      </label>
      {editable && <Button className="w-full" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}</Button>}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-destructive"}`}>{msg.texto}</p>}
    </div>
  );
};

export default ConfigBiblioteca;
