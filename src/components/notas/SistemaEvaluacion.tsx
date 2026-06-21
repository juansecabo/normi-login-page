import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useColegioConfig } from "@/hooks/useColegioConfig";

/**
 * Botón "¿Cómo se califica?" + modal que explica el sistema de evaluación del
 * colegio: de cuánto a cuánto van las notas, con cuánto se aprueba y qué
 * significa cada rango de desempeño. Todo sale de `useColegioConfig` (por
 * colegio), así cada institución muestra su propia escala (0–5, 0–10, etc.).
 */
const SistemaEvaluacion = ({ className }: { className?: string }) => {
  const { config } = useColegioConfig();
  const [open, setOpen] = useState(false);

  const fmt = (n: number) => n.toFixed(config.decimales);
  // Rangos de mayor a menor (el mejor desempeño arriba).
  const rangos = [...(config.rangos_desempeno || [])].sort((a, b) => b.min - a.min);

  return (
    <>
      <Button variant="outline" size="sm" className={className} onClick={() => setOpen(true)}>
        <HelpCircle className="w-4 h-4 mr-2" /> ¿Cómo se califica?
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sistema de evaluación</DialogTitle>
            <DialogDescription>
              Las notas van de <b>{fmt(config.escala_min)}</b> a <b>{fmt(config.escala_max)}</b>.
              {" "}Se aprueba con <b>{fmt(config.nota_aprobatoria)}</b>.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {rangos.map((r, i) => {
              // El tope del último rango suele exceder la escala (ej. 5.0001) para
              // incluir la nota máxima; al mostrarlo lo recortamos a la escala.
              const maxShow = Math.min(r.max, config.escala_max);
              return (
                <li key={i} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color || "#94a3b8" }} />
                  <span className="font-mono text-sm text-muted-foreground w-24 flex-shrink-0">{fmt(r.min)} – {fmt(maxShow)}</span>
                  <span className="font-medium text-foreground">{r.label}</span>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SistemaEvaluacion;
