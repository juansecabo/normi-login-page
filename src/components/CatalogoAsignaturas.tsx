import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil } from "lucide-react";
import type { Asignatura } from "@/hooks/useAsignaturas";

interface Props {
  asignaturas: Asignatura[];
  onChange: () => void | Promise<void>;
}

const CatalogoAsignaturas = ({ asignaturas, onChange }: Props) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Asignatura | null>(null);
  const [nombre, setNombre] = useState("");

  const openCreate = () => {
    setEditing(null);
    setNombre("");
    setShowDialog(true);
  };

  const openEdit = (a: Asignatura) => {
    setEditing(a);
    setNombre(a.nombre);
    setShowDialog(true);
  };

  const guardar = async () => {
    const trimmed = nombre.trim();
    if (!trimmed) {
      toast({ title: "Falta el nombre", variant: "destructive" });
      return;
    }
    setBusy(true);
    if (editing) {
      const nombreAnterior = editing.nombre;
      if (trimmed !== nombreAnterior) {
        // Rename: actualizar la fila + propagar a Notas, Nombre de Actividades
        // y Asignación Profesores para que los registros históricos sigan
        // siendo coherentes con el catálogo.
        const { error: errAsig } = await supabase
          .from("Asignaturas")
          .update({ nombre: trimmed, fecha_modificacion: new Date().toISOString() })
          .eq("id", editing.id);
        if (errAsig) {
          toast({ title: "Error", description: errAsig.message, variant: "destructive" });
          setBusy(false);
          return;
        }
        // Propagar a Notas
        const { error: errNotas } = await supabase
          .from("Notas")
          .update({ asignatura: trimmed })
          .eq("asignatura", nombreAnterior);
        if (errNotas) {
          toast({ title: "Aviso", description: `Asignatura renombrada, pero falló propagar a Notas: ${errNotas.message}`, variant: "destructive" });
        }
        // Propagar a Nombre de Actividades
        const { error: errAct } = await supabase
          .from("Nombre de Actividades")
          .update({ asignatura: trimmed })
          .eq("asignatura", nombreAnterior);
        if (errAct) {
          toast({ title: "Aviso", description: `Falló propagar a actividades: ${errAct.message}`, variant: "destructive" });
        }
        // Propagar al array de Asignación Profesores (Postgres array_replace)
        // Lo hacemos via RPC genérica usando un update con filtro de overlaps.
        const { data: asignaciones } = await supabase
          .from("Asignación Profesores")
          .select('row_id:row_id, "Asignatura(s)"')
          .overlaps('"Asignatura(s)"', [nombreAnterior]);
        for (const r of asignaciones || []) {
          const nuevo = ((r as any)["Asignatura(s)"] as string[]).map((x) =>
            x === nombreAnterior ? trimmed : x,
          );
          await supabase
            .from("Asignación Profesores")
            .update({ "Asignatura(s)": nuevo })
            .eq("row_id", (r as any).row_id);
        }
      }
      toast({ title: "Asignatura actualizada" });
    } else {
      const { error } = await supabase
        .from("Asignaturas")
        .insert({ nombre: trimmed, activa: true });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setBusy(false);
        return;
      }
      toast({ title: "Asignatura creada" });
    }
    setShowDialog(false);
    setBusy(false);
    await onChange();
  };

  const toggleActiva = async (a: Asignatura) => {
    setBusy(true);
    const { error } = await supabase
      .from("Asignaturas")
      .update({ activa: !a.activa, fecha_modificacion: new Date().toISOString() })
      .eq("id", a.id);
    setBusy(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: a.activa ? "Desactivada" : "Activada" });
    await onChange();
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <p className="text-sm text-muted-foreground flex-1">
          Las asignaturas activas aparecen en los formularios de asignación de
          profesores y en la creación de actividades. Desactivar una asignatura
          no afecta las notas ya registradas con ese nombre.
        </p>
        <Button onClick={openCreate} disabled={busy}>
          <Plus className="w-4 h-4 mr-2" /> Agregar
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-32">Activa</TableHead>
              <TableHead className="text-right w-32">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {asignaturas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No hay asignaturas. Agrega la primera.
                </TableCell>
              </TableRow>
            ) : (
              asignaturas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className={a.activa ? "" : "text-muted-foreground line-through"}>
                    {a.nombre}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={a.activa}
                      onCheckedChange={() => toggleActiva(a)}
                      disabled={busy}
                      aria-label={a.activa ? "Desactivar" : "Activar"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)} disabled={busy}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar asignatura" : "Nueva asignatura"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="asig-nombre">Nombre</Label>
            <Input
              id="asig-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Música, Robótica, ..."
              autoFocus
            />
            {editing && nombre.trim() !== editing.nombre && (
              <p className="text-xs text-muted-foreground">
                Si cambias el nombre, las notas y actividades con el nombre
                anterior se renombrarán también para mantener todo coherente.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDialog(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={busy || !nombre.trim()}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CatalogoAsignaturas;
