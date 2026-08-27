import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, FileText, Loader2, Paperclip, X } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { subirArchivo } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";

/**
 * Modal del ESTUDIANTE para entregar su trabajo en una actividad que lo permite.
 *
 * Reglas de plazo (definidas por Juan; el server las hace cumplir):
 *  - Antes del límite: puede reemplazar o agregar archivos cuantas veces quiera.
 *  - Al vencer, lo entregado queda congelado.
 *  - Si no entregó a tiempo: UNA sola oportunidad tardía y queda congelado.
 */

export interface EntregaMia {
  actividad_id: number;
  archivos: string | null;
  comentario: string | null;
  fecha_entrega: string;
  tarde: boolean;
}

const getCleanFilename = (url: string) =>
  decodeURIComponent((url.split("/").pop() || "").replace(/^\d+-[a-z0-9]+-/, ""));

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/Bogota",
  });

export function EntregarTrabajoModal({
  actividad,
  entrega,
  open,
  onOpenChange,
  onEntregada,
}: {
  actividad: { auto_id: number; Asignatura: string; fecha_limite_entrega?: string | null } | null;
  entrega: EntregaMia | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEntregada: () => void;
}) {
  const { toast } = useToast();
  const [urlsConservadas, setUrlsConservadas] = useState<string[]>([]);
  const [archivosNuevos, setArchivosNuevos] = useState<File[]>([]);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);

  const limite = actividad?.fecha_limite_entrega ? new Date(actividad.fecha_limite_entrega) : null;
  const vencido = !!limite && new Date() > limite;
  // Congelada: ya venció el plazo y hay entrega (a tiempo o tardía).
  const congelada = !!entrega && (vencido || entrega.tarde);

  useEffect(() => {
    if (!open) return;
    setUrlsConservadas((entrega?.archivos || "").split("\n").filter(Boolean));
    setComentario(entrega?.comentario || "");
    setArchivosNuevos([]);
  }, [open, entrega]);

  const enviar = async () => {
    if (urlsConservadas.length + archivosNuevos.length === 0) {
      toast({ title: "Falta el trabajo", description: "Adjunta al menos un archivo.", variant: "destructive" });
      return;
    }
    setEnviando(true);
    try {
      const nuevas: string[] = [];
      for (const f of archivosNuevos) {
        const r = await subirArchivo(f);
        nuevas.push(r.url);
      }
      const res = await apiRequest("/api/entregas", {
        method: "POST",
        body: JSON.stringify({
          actividad_id: actividad!.auto_id,
          archivos: [...urlsConservadas, ...nuevas],
          comentario: comentario.trim() || undefined,
        }),
      }) as { ok?: boolean; tarde?: boolean };
      toast({
        variant: "success" as never,
        title: res.tarde ? "Entrega registrada (fuera de plazo)" : "Trabajo entregado",
        description: res.tarde
          ? "Quedó registrada con la fecha y hora de hoy. Ya no se puede modificar."
          : "Tu profesor podrá revisarlo.",
      });
      onEntregada();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast({
        title: "No se pudo entregar",
        description: msg.includes("congelada") || msg.includes("plazo")
          ? "El plazo de entrega terminó: lo que enviaste ya no se puede cambiar."
          : msg || "Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {congelada ? "Tu entrega" : "Entregar trabajo"}{actividad ? ` — ${actividad.Asignatura}` : ""}
          </DialogTitle>
        </DialogHeader>

        {limite && (
          <p className={`text-sm ${vencido ? "text-amber-700" : "text-muted-foreground"}`}>
            Plazo de entrega: {fmtFecha(limite.toISOString())}{vencido ? " (ya venció)" : ""}
          </p>
        )}

        {entrega && (
          <div className={`rounded-md px-3 py-2 text-sm flex items-center gap-2 ${entrega.tarde ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Entregado el {fmtFecha(entrega.fecha_entrega)}{entrega.tarde ? " — fuera de plazo" : ""}
          </div>
        )}

        {congelada ? (
          <div className="space-y-2">
            {urlsConservadas.map((url, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate flex-1">
                  {getCleanFilename(url)}
                </a>
              </div>
            ))}
            {entrega?.comentario && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded px-2 py-1">{entrega.comentario}</p>
            )}
            <p className="text-xs text-muted-foreground">
              El plazo terminó: esta entrega ya no se puede modificar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {vencido && !entrega && (
              <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">
                El plazo ya venció: tienes una sola oportunidad de entrega. Quedará marcada como
                fuera de plazo y después no podrás cambiarla, así que revisa bien antes de enviar.
              </div>
            )}

            {urlsConservadas.map((url, i) => (
              <div key={`u-${i}`} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm min-w-0">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="truncate flex-1 min-w-0">{getCleanFilename(url)}</span>
                <button type="button" onClick={() => setUrlsConservadas((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" title="Quitar archivo">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {archivosNuevos.map((f, i) => (
              <div key={`n-${i}`} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm min-w-0">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="truncate flex-1 min-w-0">{f.name}</span>
                <button type="button" onClick={() => setArchivosNuevos((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" title="Quitar archivo">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <label className="flex items-center gap-2 p-3 border-2 border-dashed border-muted-foreground/30 rounded-md cursor-pointer hover:border-primary/50 transition-colors" data-guia="entrega.adjuntar">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {urlsConservadas.length + archivosNuevos.length > 0 ? "Agregar otro archivo" : "Seleccionar archivo"}
              </span>
              <input
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) setArchivosNuevos((prev) => [...prev, ...Array.from(files)]);
                  e.target.value = "";
                }}
              />
            </label>

            <Textarea
              placeholder="Comentario para tu profesor (opcional)"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className="min-h-[70px]"
            />

            <Button onClick={enviar} disabled={enviando} className="w-full" data-guia="entrega.enviar">
              {enviando ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entregando...</>
              ) : entrega ? "Actualizar entrega" : "Entregar trabajo"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
