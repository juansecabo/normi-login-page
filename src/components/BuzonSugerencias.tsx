import { useState } from "react";
import { getSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const BuzonSugerencias = () => {
  const [open, setOpen] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const { toast } = useToast();

  const handleEnviar = async () => {
    if (!mensaje.trim()) return;

    setEnviando(true);
    const session = getSession();

    let rol = "";
    let contacto = "";

    switch (session.cargo) {
      case "Estudiante":
        rol = "Estudiante";
        contacto = `${session.grado || ""}-${session.salon || ""}`;
        break;
      case "Padre de familia":
        rol = "Padre de familia";
        if (session.hijos && session.hijos.length > 0) {
          contacto = session.hijos
            .map((h) => `${h.nombre} ${h.apellidos} (${h.grado} ${h.salon})`)
            .join(", ");
        }
        break;
      case "Profesor(a)":
        rol = "Profesor(a)";
        contacto = session.id || "";
        break;
      default:
        rol = session.cargo || "Desconocido";
        contacto = session.id || "";
    }

    const { error } = await supabase.from("Sugerencias").insert({
      id: session.id,
      nombres: session.nombres,
      apellidos: session.apellidos,
      rol,
      contacto,
      mensaje: mensaje.trim(),
    });

    setEnviando(false);

    if (error) {
      toast({
        title: "Error al enviar",
        description: "Intenta de nuevo mas tarde.",
      });
      return;
    }

    setEnviado(true);
    toast({
      title: "Sugerencia enviada",
      description: "Gracias por tu aporte.",
    });

    setTimeout(() => {
      setOpen(false);
      setMensaje("");
      setEnviado(false);
    }, 2000);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-2 transition-all duration-200 hover:scale-105"
      >
        <img
          src="/buzon-de-sugerencias.webp"
          alt="Buzón de Sugerencias"
          className="w-20 h-20 object-contain"
        />
        <span className="font-semibold text-foreground text-sm">
          Buzón de Sugerencias
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buzón de Sugerencias</DialogTitle>
          </DialogHeader>

          {enviado ? (
            <div className="text-center py-4">
              <p className="text-lg font-semibold text-primary">
                Gracias por tu sugerencia
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                Tu opinión nos ayuda a mejorar.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                ¿Se te ocurre algo para hacer de la plataforma y de Normi algo
                mejor? Envíanos tus sugerencias.
              </p>
              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Escribe tu sugerencia aquí..."
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                onClick={handleEnviar}
                disabled={enviando || !mensaje.trim()}
                className="w-full py-2 px-4 rounded-md bg-primary text-primary-foreground font-semibold transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enviando ? "Enviando..." : "Enviar"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BuzonSugerencias;
