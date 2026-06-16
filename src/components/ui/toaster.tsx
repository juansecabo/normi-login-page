import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose,
} from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Toaster con interceptor por tipo de mensaje:
 *
 *  - ERRORES (variant "destructive"): SIEMPRE como Dialog centrado y bloqueante
 *    (hay que verlos). Si el detalle es genérico → Dialog rojo "Error en el
 *    sistema" con el WhatsApp del admin; si es específico (validación) → Dialog
 *    rojo con el mensaje real.
 *  - ÉXITO / INFO (resto): toast pequeño en la esquina que se cierra solo (~2.5s),
 *    sin botón ni bloqueo. Antes eran Dialogs "Entendido" y molestaban en cada
 *    acción rutinaria (guardar datos, aplicar salones, etc.).
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<{ title: string; description: string } | null>(null);

  useEffect(() => {
    for (const t of toasts) {
      if (t.open === false) continue;
      const isDestructive = (t as any).variant === "destructive";
      if (!isDestructive) continue; // éxito/info → se renderiza como toast esquina (abajo), no se intercepta

      const title = typeof t.title === "string" ? t.title : "";
      const description = typeof t.description === "string" ? t.description : "";
      const esGenerico =
        !description ||
        /^api\s*\d+$/i.test(description.trim()) ||
        /^error\s*\d*$/i.test(description.trim()) ||
        /failed to fetch/i.test(description);

      dismiss(t.id);
      if (esGenerico) {
        console.error("[Toaster] error sistema interceptado:", title, description);
        setErrorOpen(true);
      } else {
        setErrorValidacion({ title: title || "Aviso", description });
      }
    }
  }, [toasts, dismiss]);

  const toastsInfo = toasts.filter((t) => (t as any).variant !== "destructive");

  return (
    <ToastProvider duration={2500}>
      {/* Éxito / info: toasts en la esquina, auto-cierre. */}
      {toastsInfo.map((t) => (
        <Toast key={t.id} open={t.open} onOpenChange={(o) => !o && dismiss(t.id)}>
          <div className="grid gap-0.5">
            {typeof t.title === "string" && t.title && <ToastTitle>{t.title}</ToastTitle>}
            {typeof t.description === "string" && t.description && <ToastDescription>{t.description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />

      {/* Dialog de error del sistema */}
      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
              <DialogTitle>Error en el sistema</DialogTitle>
            </div>
            <DialogDescription className="pt-3 text-base text-foreground">
              Por favor comuníquese al WhatsApp del administrador y hágaselo saber:
              <a
                href="https://wa.me/573016241863"
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-3 text-lg font-bold text-primary hover:underline"
              >
                301 624 1863
              </a>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorOpen(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de error de validación (mensaje específico) */}
      <Dialog open={errorValidacion !== null} onOpenChange={(o) => !o && setErrorValidacion(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
              <DialogTitle className="text-destructive">{errorValidacion?.title}</DialogTitle>
            </div>
            {errorValidacion?.description && (
              <DialogDescription className="pt-3 text-base text-foreground">
                {errorValidacion.description}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorValidacion(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToastProvider>
  );
}
