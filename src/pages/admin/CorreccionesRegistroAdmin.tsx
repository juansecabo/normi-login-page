import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { ArrowLeft, Loader2 } from "lucide-react";

type Estado = "pendiente" | "solucionado";
interface Solicitud {
  id: number;
  tipo: "no_registrado" | "perfil_incorrecto" | "hijos_faltantes";
  estado: Estado;
  cedula: string;
  celular: string | null;
  apellidos: string | null;
  nombres: string | null;
  perfil_actual: string | null;
  perfil_solicitado: string | null;
  hijos: string[];
  created_at: string;
  resuelto_at: string | null;
}

const TIPO_LABEL: Record<Solicitud["tipo"], string> = {
  no_registrado: "No registrado",
  perfil_incorrecto: "Perfil equivocado",
  hijos_faltantes: "Faltan hijos",
};

const ESTADOS: { v: Estado; label: string; on: string }[] = [
  { v: "pendiente", label: "Pendiente", on: "bg-amber-500 hover:bg-amber-500 text-white" },
  { v: "solucionado", label: "Solucionado", on: "bg-green-600 hover:bg-green-600 text-white" },
];

function fecha(iso: string): string {
  try { return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function CorreccionesRegistroAdmin() {
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await apiRequest<{ solicitudes: Solicitud[] }>("/api/registro/admin/solicitudes");
      setSolicitudes(r.solicitudes || []);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        toast({ title: "Sin acceso", description: "Inicia sesión como administrador o rector.", variant: "destructive" });
        navigate("/");
        return;
      }
      toast({ title: "Error", description: "No se pudieron cargar las solicitudes.", variant: "destructive" });
    } finally {
      setCargando(false);
    }
  }, [navigate]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarEstado = async (id: number, estado: Estado) => {
    setGuardandoId(id);
    try {
      await apiRequest(`/api/registro/admin/solicitudes/${id}/estado`, { method: "PATCH", body: JSON.stringify({ estado }) });
      setSolicitudes((prev) => prev.map((s) => (s.id === id ? { ...s, estado } : s)));
    } catch {
      toast({ title: "Error", description: "No se pudo cambiar el estado.", variant: "destructive" });
    } finally {
      setGuardandoId(null);
    }
  };

  const detalle = (s: Solicitud): string => {
    const hijos = s.hijos?.length ? `Estudiantes: ${s.hijos.join(", ")}` : "";
    if (s.tipo === "perfil_incorrecto") {
      return [`Aparece como ${s.perfil_actual} → quiere ${s.perfil_solicitado}`, hijos].filter(Boolean).join(" · ");
    }
    if (s.tipo === "no_registrado") {
      return [`Quiere registrarse como Acudiente`, hijos].filter(Boolean).join(" · ");
    }
    return hijos;
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-primary text-primary-foreground py-4 px-4 shadow">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-white/10 rounded"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-lg font-bold">Registro</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {cargando ? (
          <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : solicitudes.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No hay solicitudes todavía.</Card>
        ) : (
          <div className="space-y-3">
            {solicitudes.map((s, i) => (
              <Card key={s.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{i + 1} · {fecha(s.created_at)}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">{TIPO_LABEL[s.tipo]}</span>
                    </div>
                    <p className="font-semibold text-foreground">
                      {s.apellidos && s.nombres ? `${s.apellidos}, ${s.nombres}` : "—"}
                      <span className="ml-2 font-mono text-sm text-muted-foreground">CC {s.cedula}</span>
                      {s.celular && <span className="ml-2 font-mono text-sm text-muted-foreground">· 📱 {s.celular}</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{detalle(s)}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {ESTADOS.map((e) => (
                      <Button
                        key={e.v}
                        size="sm"
                        variant={s.estado === e.v ? "default" : "outline"}
                        className={s.estado === e.v ? e.on : ""}
                        disabled={guardandoId === s.id}
                        onClick={() => cambiarEstado(s.id, e.v)}
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
