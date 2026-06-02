import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { ArrowLeft, Loader2 } from "lucide-react";

type Estado = "pendiente" | "resuelto";
interface Duda {
  id: number;
  cedula: string;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  pregunta: string;
  estado: Estado;
  created_at: string;
  resuelto_at: string | null;
}

const ESTADOS: { v: Estado; label: string; on: string }[] = [
  { v: "pendiente", label: "Pendiente", on: "bg-amber-500 hover:bg-amber-500 text-white" },
  { v: "resuelto", label: "Resuelto", on: "bg-green-600 hover:bg-green-600 text-white" },
];

function fecha(iso: string): string {
  try { return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function DudasAdmin() {
  const navigate = useNavigate();
  const [dudas, setDudas] = useState<Duda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await apiRequest<{ dudas: Duda[] }>("/api/dudas/admin/dudas");
      setDudas(r.dudas || []);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        toast({ title: "Sin acceso", description: "Inicia sesión como administrador o rector.", variant: "destructive" });
        navigate("/");
        return;
      }
      toast({ title: "Error", description: "No se pudieron cargar las dudas.", variant: "destructive" });
    } finally {
      setCargando(false);
    }
  }, [navigate]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarEstado = async (id: number, estado: Estado) => {
    setGuardandoId(id);
    try {
      await apiRequest(`/api/dudas/admin/dudas/${id}/estado`, { method: "PATCH", body: JSON.stringify({ estado }) });
      setDudas((prev) => prev.map((d) => (d.id === id ? { ...d, estado } : d)));
    } catch {
      toast({ title: "Error", description: "No se pudo cambiar el estado.", variant: "destructive" });
    } finally {
      setGuardandoId(null);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-primary text-primary-foreground py-4 px-4 shadow">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-white/10 rounded"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-lg font-bold">Dudas del personal</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {cargando ? (
          <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : dudas.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No hay dudas todavía.</Card>
        ) : (
          <div className="space-y-3">
            {dudas.map((d, i) => (
              <Card key={d.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{i + 1} · {fecha(d.created_at)}</span>
                      {d.cargo && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">{d.cargo}</span>}
                    </div>
                    <p className="font-semibold text-foreground">
                      {d.apellidos && d.nombres ? `${d.apellidos}, ${d.nombres}` : "—"}
                      <span className="ml-2 font-mono text-sm text-muted-foreground">CC {d.cedula}</span>
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{d.pregunta}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {ESTADOS.map((e) => (
                      <Button
                        key={e.v}
                        size="sm"
                        variant={d.estado === e.v ? "default" : "outline"}
                        className={d.estado === e.v ? e.on : ""}
                        disabled={guardandoId === d.id}
                        onClick={() => cambiarEstado(d.id, e.v)}
                      >
                        {e.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
