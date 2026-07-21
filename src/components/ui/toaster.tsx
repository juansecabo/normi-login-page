import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Toaster con interceptor por tipo de mensaje:
 *
 *  - ERRORES y VALIDACIONES (variant "destructive"): SIEMPRE como Dialog centrado
 *    y bloqueante (hay que verlos). Si el detalle es genérico → Dialog rojo
 *    "Error en el sistema" con el WhatsApp del admin; si es específico
 *    (validación) → Dialog rojo con el mensaje real.
 *  - ÉXITO EXPLÍCITO (variant "success"): Dialog verde de confirmación. Se usa
 *    SOLO donde Juan lo pidió (guardar datos del colegio, perfil, contraseña,
 *    recuperación) — acciones donde el usuario quiere ver que sí quedó guardado.
 *  - ÉXITO / INFO rutinario (resto): se DESCARTAN en silencio. Juan NO quiere
 *    confirmaciones de acciones rutinarias ni como pop up ni como toast esquina.
 *    (La barra de progreso de comunicados es otro componente, no pasa por aquí.)
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<{ title: string; description: string } | null>(null);
  const [exito, setExito] = useState<{ title: string; description: string } | null>(null);

  useEffect(() => {
    for (const t of toasts) {
      if (t.open === false) continue;
      const variant = (t as any).variant;
      const isDestructive = variant === "destructive";
      if (variant === "success") {
        dismiss(t.id);
        setExito({
          title: (typeof t.title === "string" && t.title) || "¡Listo!",
          description: typeof t.description === "string" ? t.description : "",
        });
        continue;
      }
      if (!isDestructive) { dismiss(t.id); continue; } // éxito/info rutinario → silencio

      const title = typeof t.title === "string" ? t.title : "";
      const description = typeof t.description === "string" ? t.description : "";
      // Genérico = no hay NINGÚN texto útil (ni título específico ni
      // descripción). Un toast con solo título tipo "Las contraseñas no
      // coinciden" es una VALIDACIÓN y debe mostrarse tal cual, no como
      // "Error en el sistema".
      const tituloUtil = !!title.trim() && !/^error\s*\d*$/i.test(title.trim());
      const esGenerico =
        (!description && !tituloUtil) ||
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

  return (
    <ToastProvider>
      {/* No se renderizan toasts: los éxitos van en silencio, los errores por Dialog. */}
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
              Ocurrió un error inesperado. Por favor intenta de nuevo en un momento; si el problema persiste, infórmalo a la institución.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorOpen(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de ÉXITO (variant success): confirmación verde centrada */}
      <Dialog open={exito !== null} onOpenChange={(o) => !o && setExito(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <DialogTitle className="text-emerald-700">{exito?.title}</DialogTitle>
            </div>
            {exito?.description && (
              <DialogDescription className="pt-3 text-base text-foreground whitespace-pre-line">
                {exito.description}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setExito(null)}>Entendido</Button>
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
              <DialogDescription className="pt-3 text-base text-foreground whitespace-pre-line">
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
