import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Toaster con interceptor de errores:
 *  - Toasts normales (variant !== "destructive"): se muestran como toast.
 *  - Toasts destructive: se interceptan y abren un Dialog único con el
 *    mensaje fijo "Error en el sistema. Por favor comuníquese al WhatsApp
 *    del administrador: 3016241863". El mensaje técnico real va a
 *    console.error para debug.
 *  - Si el usuario tiene varios errores seguidos, solo se muestra UN dialog
 *    (los siguientes lo "re-abren" sin acumularse).
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();
  const [errorOpen, setErrorOpen] = useState(false);

  useEffect(() => {
    for (const t of toasts) {
      const isDestructive = (t as any).variant === "destructive";
      if (isDestructive && t.open !== false) {
        // Log técnico para debug — el usuario solo ve el mensaje genérico.
        console.error("[Toaster] error interceptado:", t.title, t.description);
        dismiss(t.id);
        setErrorOpen(true);
      }
    }
  }, [toasts, dismiss]);

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        // Los destructive ya se interceptaron arriba — no los pintamos como toast.
        if ((props as any).variant === "destructive") return null;
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />

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
    </ToastProvider>
  );
}
