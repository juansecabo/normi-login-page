import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info } from "lucide-react";

/**
 * Toaster con interceptor de TODOS los toasts (preferencia explícita del
 * usuario: ningún mensaje en notasnormi.com puede aparecer como toast esquina).
 *
 *  - variant "destructive": Dialog rojo "Error en el sistema" con el WhatsApp
 *    del admin. El mensaje técnico real va a console.error para debug.
 *  - resto (default, etc.): Dialog neutro con el title/description que se pasó
 *    al toast(). El usuario ve el contenido real (ej. "Sin destinatarios").
 */

interface InfoMsg {
  title: string;
  description: string;
}

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const [errorOpen, setErrorOpen] = useState(false);
  const [infoMsg, setInfoMsg] = useState<InfoMsg | null>(null);

  useEffect(() => {
    for (const t of toasts) {
      if (t.open === false) continue;
      const isDestructive = (t as any).variant === "destructive";
      const title = typeof t.title === "string" ? t.title : "";
      const description = typeof t.description === "string" ? t.description : "";
      if (isDestructive) {
        // Log técnico para debug — el usuario solo ve el mensaje genérico.
        console.error("[Toaster] error interceptado:", title, description);
        dismiss(t.id);
        setErrorOpen(true);
      } else {
        // Mensaje informativo (Sin destinatarios, Guardado OK, etc.) —
        // mostrar como Dialog centrado con el contenido del toast.
        dismiss(t.id);
        if (title || description) {
          setInfoMsg({ title: title || "Aviso", description: description || "" });
        }
      }
    }
  }, [toasts, dismiss]);

  return (
    <ToastProvider>
      {/* No renderizamos los toasts — todos van por Dialog. El Viewport queda
          para no romper el árbol de Radix. */}
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

      {/* Dialog informativo (cualquier toast no-destructive) */}
      <Dialog open={infoMsg !== null} onOpenChange={(o) => !o && setInfoMsg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Info className="w-6 h-6 text-primary shrink-0" />
              <DialogTitle>{infoMsg?.title}</DialogTitle>
            </div>
            {infoMsg?.description && (
              <DialogDescription className="pt-3 text-base text-foreground">
                {infoMsg.description}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setInfoMsg(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToastProvider>
  );
}
