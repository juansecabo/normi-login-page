import { useEffect, useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { ArrowLeft, Loader2, CheckCircle2, UserCheck } from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ColegioPub { id: string; nombre: string; logo_url: string | null; }
interface Interno { nombres: string; apellidos: string; cargo: string; }
interface DudaPub {
  turno: number;
  nombre: string;
  cargo: string;
  estado: "pendiente" | "resuelto";
  created_at: string;
}

const MENSAJES_ERROR: Record<string, string> = {
  colegio_invalido: "Colegio inválido.",
  cedula_requerida: "Escribe tu cédula.",
  pregunta_requerida: "Escribe tu pregunta.",
  no_es_interno: "Esa cédula no aparece como personal de este colegio.",
};

const estadoEstilo: Record<DudaPub["estado"], { label: string; clase: string }> = {
  pendiente: { label: "Pendiente", clase: "bg-amber-100 text-amber-800 border-amber-300" },
  resuelto: { label: "Resuelto", clase: "bg-green-100 text-green-800 border-green-300" },
};

export default function Dudas() {
  const [colegios, setColegios] = useState<ColegioPub[]>([]);
  const [colegioId, setColegioId] = useState<string>("");

  const [cedula, setCedula] = useState("");
  const [interno, setInterno] = useState<Interno | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [pregunta, setPregunta] = useState("");

  const [dudas, setDudas] = useState<DudaPub[]>([]);
  const [enviando, setEnviando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colegioSel = colegios.find((c) => c.id === colegioId);

  useEffect(() => {
    apiRequest<{ colegios: ColegioPub[] }>("/api/dudas/colegios")
      .then((r) => setColegios(r.colegios || []))
      .catch(() => toast({ title: "Error", description: "No se pudieron cargar los colegios.", variant: "destructive" }));
  }, []);

  const cargarDudas = useCallback(async (cid: string) => {
    if (!cid) return;
    try {
      const r = await apiRequest<{ dudas: DudaPub[] }>(`/api/dudas?colegio_id=${encodeURIComponent(cid)}`);
      setDudas(r.dudas || []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { if (colegioId) cargarDudas(colegioId); }, [colegioId, cargarDudas]);

  // Buscar al interno por cédula (con o sin puntos) tras dejar de escribir.
  useEffect(() => {
    const ced = cedula.replace(/\D/g, "");
    setInterno(null);
    setNoEncontrado(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!colegioId || ced.length < 4) { setBuscando(false); return; }
    setBuscando(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await apiRequest<{ interno: Interno }>(
          `/api/dudas/interno?colegio_id=${encodeURIComponent(colegioId)}&cedula=${ced}`,
        );
        setInterno(r.interno);
        setNoEncontrado(false);
      } catch {
        setInterno(null);
        setNoEncontrado(true);
      } finally {
        setBuscando(false);
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [cedula, colegioId]);

  const limpiar = () => { setCedula(""); setInterno(null); setNoEncontrado(false); setPregunta(""); };

  const enviar = async () => {
    setEnviando(true);
    try {
      await apiRequest("/api/dudas", {
        method: "POST",
        body: JSON.stringify({ colegio_id: colegioId, cedula: cedula.replace(/\D/g, ""), pregunta }),
      });
      toast({ title: "¡Pregunta enviada!", description: "Quedó en la lista. La revisaremos y resolveremos." });
      limpiar();
      await cargarDudas(colegioId);
    } catch (e) {
      const code = e instanceof ApiError ? (e.body as { error?: string })?.error : undefined;
      toast({ title: "No se pudo enviar", description: (code && MENSAJES_ERROR[code]) || "Revisa los datos e intenta de nuevo.", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const puedeEnviar = !!interno && pregunta.trim().length >= 3 && !enviando;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <header className="bg-primary text-primary-foreground py-4 px-4 shadow">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {colegioSel?.logo_url && (
            <img src={colegioSel.logo_url} alt="" className="h-10 w-10 rounded-full bg-white object-contain" />
          )}
          <div>
            <h1 className="text-lg font-bold leading-tight">Buzón de dudas</h1>
            <p className="text-xs opacity-90">{colegioSel ? colegioSel.nombre : "Notas Normi"}</p>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* PASO 1: elegir colegio */}
        {!colegioId && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-center text-foreground">¿De qué colegio eres?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {colegios.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColegioId(c.id)}
                  className="flex items-center gap-3 p-4 bg-white rounded-xl border-2 border-transparent hover:border-primary shadow-soft transition-colors text-left"
                >
                  {c.logo_url
                    ? <img src={c.logo_url} alt="" className="h-12 w-12 rounded-full object-contain" />
                    : <div className="h-12 w-12 rounded-full bg-emerald-100" />}
                  <span className="font-semibold text-foreground">{c.nombre}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* PASO 2: cédula → identidad → pregunta */}
        {colegioId && (
          <section className="space-y-4">
            <button onClick={() => { setColegioId(""); limpiar(); }} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="w-4 h-4" /> Cambiar colegio
            </button>
            <Card className="p-5 space-y-4">
              <h2 className="text-lg font-bold text-foreground">Deja tu pregunta</h2>

              <div className="space-y-1.5">
                <Label>Tu número de cédula</Label>
                <Input
                  inputMode="numeric"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  placeholder="Ej: 1102345678"
                />
              </div>

              {/* Confirmación de identidad */}
              {buscando && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Buscando…
                </p>
              )}
              {interno && (
                <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                  <UserCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-900">{interno.nombres} {interno.apellidos}</p>
                    <p className="text-sm text-emerald-800">{interno.cargo}</p>
                    <p className="text-xs text-emerald-700 mt-0.5">Revisa que eres tú antes de enviar.</p>
                  </div>
                </div>
              )}
              {noEncontrado && !buscando && (
                <p className="text-sm text-destructive">No encontramos personal con esa cédula en este colegio. Verifica el número.</p>
              )}

              {/* Pregunta (solo cuando se confirmó la identidad) */}
              {interno && (
                <div className="space-y-1.5">
                  <Label>Tu pregunta o duda</Label>
                  <textarea
                    value={pregunta}
                    onChange={(e) => setPregunta(e.target.value)}
                    rows={5}
                    maxLength={2000}
                    placeholder="Escribe aquí lo que quieras preguntar…"
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              )}

              <Button onClick={enviar} disabled={!puedeEnviar} className="w-full">
                {enviando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…</> : "Enviar pregunta"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Una vez enviada, tu pregunta no se puede editar ni borrar y se atiende en orden de llegada.
              </p>
            </Card>
          </section>
        )}

        {/* LISTA PÚBLICA (visible apenas hay colegio) */}
        {colegioId && (
          <section className="space-y-2">
            <h3 className="font-semibold text-foreground">Preguntas recibidas</h3>
            <div className="bg-white rounded-xl shadow-soft overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-emerald-50 text-emerald-900">
                    <tr>
                      <th className="text-left px-3 py-2 w-12">#</th>
                      <th className="text-left px-3 py-2">Nombre</th>
                      <th className="text-left px-3 py-2">Cargo</th>
                      <th className="text-left px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dudas.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Aún no hay preguntas.</td></tr>
                    ) : dudas.map((d) => (
                      <tr key={d.turno} className="border-t">
                        <td className="px-3 py-2 text-muted-foreground">{d.turno}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{d.nombre}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.cargo}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${estadoEstilo[d.estado].clase}`}>
                            {d.estado === "resuelto" && <CheckCircle2 className="w-3 h-3" />}
                            {estadoEstilo[d.estado].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">El texto de cada pregunta solo lo ve el colegio; aquí se muestra únicamente quién preguntó y el estado.</p>
          </section>
        )}
      </main>
    </div>
  );
}
