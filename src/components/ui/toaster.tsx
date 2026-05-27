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
  tipo: 'info' | 'error';
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

      // Heurística "error de sistema vs error de validación":
      // - Si destructive y description está vacío o es un mensaje genérico
      //   (típico de un throw o fetch sin detalle), mostrar el Dialog rojo
      //   con WhatsApp del admin.
      // - Si destructive PERO description tiene contenido específico
      //   (validación: "queda 50% disponible", "ya existe la actividad",
      //   etc.), mostrarlo al usuario tal cual como error informativo.
      const esGenerico =
        !description ||
        /^api\s*\d+$/i.test(description.trim()) ||
        /^error\s*\d*$/i.test(description.trim()) ||
        /failed to fetch/i.test(description);

      if (isDestructive && esGenerico) {
        console.error("[Toaster] error sistema interceptado:", title, description);
        dismiss(t.id);
        setErrorOpen(true);
      } else {
        // Mensaje informativo o de validación. Si era destructive, se
        // muestra como dialog rojo (validación), si no, como dialog azul (info).
        dismiss(t.id);
        if (title || description) {
          setInfoMsg({
            title: title || "Aviso",
            description: description || "",
            tipo: isDestructive ? 'error' : 'info',
          });
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

      {/* Dialog informativo o de validacion */}
      <Dialog open={infoMsg !== null} onOpenChange={(o) => !o && setInfoMsg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {infoMsg?.tipo === 'error' ? (
                <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
              ) : (
                <Info className="w-6 h-6 text-primary shrink-0" />
              )}
              <DialogTitle className={infoMsg?.tipo === 'error' ? 'text-destructive' : undefined}>
                {infoMsg?.title}
              </DialogTitle>
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
