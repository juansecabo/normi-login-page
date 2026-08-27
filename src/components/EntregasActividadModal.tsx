import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Clock, Download, Eye, FileText, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";

/**
 * Modal del PROFESOR para revisar las entregas de trabajos de una actividad
 * (pedido de la coordinadora 2026-08-27). Lista quién entregó (con fecha, y si
 * fue tarde, el tiempo de atraso) y quién falta. Solo lectura: la nota se pone
 * donde siempre, en la tabla de notas.
 */

interface Entrega {
  estudiante_id: string;
  nombre: string;
  archivos: string | null;
  comentario: string | null;
  fecha_entrega: string;
  tarde: boolean;
}

interface Faltante {
  estudiante_id: string;
  nombre: string;
}

interface Data {
  fecha_limite_entrega: string | null;
  total_esperados: number;
  entregas: Entrega[];
  faltantes: Faltante[];
}

const getCleanFilename = (url: string) =>
  decodeURIComponent((url.split("/").pop() || "").replace(/^\d+-[a-z0-9]+-/, ""));

const OFFICE = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];

const verArchivo = (url: string) => {
  const ext = (url.split(".").pop() || "").toLowerCase().split("?")[0];
  if (OFFICE.includes(ext)) {
    window.open(`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`, "_blank");
  } else {
    window.open(url, "_blank");
  }
};

const descargarArchivo = async (url: string) => {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = getCleanFilename(url);
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, "_blank");
  }
};

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/Bogota",
  });

/** "2 días y 3 h", "45 min": el atraso frente al límite, legible. */
const atrasoTexto = (entrega: string, limite: string): string => {
  const ms = new Date(entrega).getTime() - new Date(limite).getTime();
  if (ms <= 0) return "";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min tarde`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60 ? `${min % 60} min ` : ""}tarde`;
  const d = Math.floor(h / 24);
  return `${d} día${d > 1 ? "s" : ""}${h % 24 ? ` y ${h % 24} h` : ""} tarde`;
};

export function EntregasActividadModal({
  autoId,
  titulo,
  open,
  onOpenChange,
}: {
  autoId: number | null;
  titulo: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !autoId) return;
    setLoading(true);
    setData(null);
    apiRequest(`/api/entregas/actividad/${autoId}`)
      .then((d) => setData(d as Data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, autoId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Entregas — {titulo}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando entregas...
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No se pudieron cargar las entregas.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-semibold text-foreground">
                {data.entregas.length} de {data.total_esperados} entregaron
              </span>
              {data.fecha_limite_entrega && (
                <span className="text-muted-foreground">
                  Plazo: {fmtFecha(data.fecha_limite_entrega)}
                </span>
              )}
            </div>

            {data.entregas.length > 0 && (
              <div className="space-y-3">
                {data.entregas.map((e) => (
                  <div key={e.estudiante_id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className={`w-4 h-4 shrink-0 ${e.tarde ? "text-amber-600" : "text-emerald-600"}`} />
                        <span className="font-medium text-foreground truncate">{e.nombre}</span>
                      </div>
                      <div className="text-xs text-right">
                        <div className="text-muted-foreground">{fmtFecha(e.fecha_entrega)}</div>
                        {e.tarde && data.fecha_limite_entrega && (
                          <div className="text-amber-700 font-semibold">
                            {atrasoTexto(e.fecha_entrega, data.fecha_limite_entrega)}
                          </div>
                        )}
                      </div>
                    </div>
                    {e.comentario && (
                      <p className="text-sm text-muted-foreground bg-muted/50 rounded px-2 py-1">{e.comentario}</p>
                    )}
                    {(e.archivos || "").split("\n").filter(Boolean).map((url, i) => (
                      <div key={i} className="flex items-center gap-2 flex-wrap">
                        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="text-sm truncate flex-1 min-w-[120px]">{getCleanFilename(url)}</span>
                        <button onClick={() => verArchivo(url)} className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" /> Ver
                        </button>
                        <button onClick={() => descargarArchivo(url)} className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1">
                          <Download className="h-3.5 w-3.5" /> Descargar
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {data.faltantes.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">
                  Sin entregar ({data.faltantes.length})
                </p>
                <div className="space-y-1">
                  {data.faltantes.map((f) => (
                    <div key={f.estudiante_id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4 shrink-0" /> {f.nombre}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.entregas.length === 0 && data.faltantes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay estudiantes destinatarios en esta actividad.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
