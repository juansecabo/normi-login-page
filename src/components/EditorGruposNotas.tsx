import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import type { GrupoNotas } from "@/hooks/useGruposNotas";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  aula: {
    asignatura: string;
    grado: string;
    salon: string;
    periodo: number;
    ano_escolar: number;
  };
  grupos: GrupoNotas[];
  /** Otros salones del profesor en la misma asignatura, para el "replicar". */
  otrosSalones?: string[];
  onChange: () => void;
}

interface NodoArbol extends GrupoNotas {
  hijos: NodoArbol[];
}

/**
 * Editor de Grupos_Notas para el aula actual. Permite armar el árbol,
 * editar porcentajes, eliminar y replicar a otros periodos/salones cuando
 * se crea un grupo top.
 */
const EditorGruposNotas = ({ open, onOpenChange, aula, grupos, otrosSalones = [], onChange }: Props) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Formulario para nuevo grupo
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoPorcentaje, setNuevoPorcentaje] = useState("");
  const [nuevoParent, setNuevoParent] = useState<string>(""); // "" = grupo top
  const [replicarPeriodos, setReplicarPeriodos] = useState<number[]>([]);
  const [replicarSalones, setReplicarSalones] = useState<string[]>([]);

  // Confirmación de borrado
  const [confirmBorrar, setConfirmBorrar] = useState<GrupoNotas | null>(null);

  // Construir árbol jerárquico desde la lista plana de grupos
  const arbol = useMemo(() => {
    const map = new Map<string, NodoArbol>();
    grupos.forEach((g) => map.set(g.id, { ...g, hijos: [] }));
    const top: NodoArbol[] = [];
    map.forEach((n) => {
      if (n.parent_id && map.has(n.parent_id)) {
        map.get(n.parent_id)!.hijos.push(n);
      } else {
        top.push(n);
      }
    });
    const ord = (lista: NodoArbol[]) => lista.sort((a, b) => a.orden - b.orden);
    ord(top);
    map.forEach((n) => ord(n.hijos));
    return top;
  }, [grupos]);

  // Suma de porcentajes de los grupos top (debería ser 100% para periodo completo)
  const sumaTop = useMemo(() => arbol.reduce((s, g) => s + Number(g.porcentaje), 0), [arbol]);

  const handleCrear = async () => {
    const pct = Number(nuevoPorcentaje);
    if (!nuevoNombre.trim() || !Number.isFinite(pct) || pct <= 0 || pct > 100) {
      toast({ title: "Datos inválidos", description: "Nombre obligatorio y porcentaje entre 0.01 y 100." });
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        nombre: nuevoNombre.trim(),
        porcentaje: pct,
        parent_id: nuevoParent || null,
        asignatura: aula.asignatura,
        grado: aula.grado,
        salon: aula.salon,
        periodo: aula.periodo,
        ano_escolar: aula.ano_escolar,
      };
      // Replicación solo si es grupo top y el profesor marcó algo
      if (!nuevoParent) {
        if (replicarPeriodos.length > 0) body.replicar_periodos = replicarPeriodos;
        if (replicarSalones.length > 0) body.replicar_salones = replicarSalones;
      }
      await apiClient.gruposNotas.crear(body);
      // Sin popup: reset form + refresh silencioso. El grupo aparece en la
      // lista de arriba (con la suma actualizada) — feedback visual suficiente.
      setNuevoNombre("");
      setNuevoPorcentaje("");
      setNuevoParent("");
      setReplicarPeriodos([]);
      setReplicarSalones([]);
      onChange();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "No se pudo crear el grupo." });
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async (g: GrupoNotas) => {
    setSaving(true);
    try {
      await apiClient.gruposNotas.eliminar(g.id);
      onChange();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "No se pudo eliminar." });
    } finally {
      setSaving(false);
      setConfirmBorrar(null);
    }
  };

  const renderNodo = (n: NodoArbol, nivel = 0): JSX.Element[] => {
    const rows: JSX.Element[] = [];
    rows.push(
      <div
        key={n.id}
        className="flex items-center gap-2 py-2 border-b border-border last:border-b-0"
        style={{ paddingLeft: `${nivel * 24}px` }}
      >
        {nivel > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{n.nombre}</div>
          <div className="text-xs text-muted-foreground">
            {n.porcentaje}% {n.parent_id ? "del grupo padre" : "del periodo"}
          </div>
        </div>
        <button
          onClick={() => setConfirmBorrar(n)}
          className="p-1.5 rounded text-red-600 hover:bg-red-50"
          title="Eliminar grupo"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
    for (const h of n.hijos) rows.push(...renderNodo(h, nivel + 1));
    return rows;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar jerarquía de evaluación</DialogTitle>
          <DialogDescription>
            {aula.asignatura} — {aula.grado} {aula.salon} — Periodo {aula.periodo}
          </DialogDescription>
        </DialogHeader>

        {/* Aviso suma de top */}
        {arbol.length > 0 && (
          <div className={`text-sm px-3 py-2 rounded ${Math.abs(sumaTop - 100) < 0.01 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
            Suma de grupos de primer nivel: <strong>{sumaTop.toFixed(2)}%</strong>
            {Math.abs(sumaTop - 100) >= 0.01 && (
              <span> {sumaTop < 100 ? `(falta ${(100 - sumaTop).toFixed(2)}%)` : `(sobra ${(sumaTop - 100).toFixed(2)}%)`}</span>
            )}
          </div>
        )}

        {/* Árbol */}
        <div className="border border-border rounded">
          {arbol.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Aún no has creado jerarquía. Este aula calificará en modo plano (cada actividad con su propio porcentaje del periodo).
            </div>
          ) : (
            <div className="p-2">
              {arbol.flatMap((n) => renderNodo(n))}
            </div>
          )}
        </div>

        {/* Crear nuevo grupo */}
        <div className="border border-dashed border-border rounded p-3 space-y-2">
          <div className="font-medium text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Agregar grupo
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_180px] gap-2">
            <Input
              placeholder="Nombre (ej. Cognitivo, Evaluaciones)"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
            <Input
              type="number"
              placeholder="%"
              min="0.01"
              max="100"
              step="0.01"
              value={nuevoPorcentaje}
              onChange={(e) => setNuevoPorcentaje(e.target.value)}
            />
            <select
              value={nuevoParent}
              onChange={(e) => setNuevoParent(e.target.value)}
              className="h-10 px-3 rounded border border-input bg-background text-sm"
            >
              <option value="">Grupo de primer nivel</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>↳ dentro de "{g.nombre}"</option>
              ))}
            </select>
          </div>

          {!nuevoParent && (
            <div className="space-y-1.5 pt-1">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={replicarPeriodos.length === 3}
                  onChange={(e) => setReplicarPeriodos(e.target.checked ? [1, 2, 3, 4].filter((p) => p !== aula.periodo) : [])}
                />
                Aplicar también a los demás periodos de este salón
              </label>
              {otrosSalones.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={replicarSalones.length > 0 && replicarSalones.length === otrosSalones.length}
                    onChange={(e) => setReplicarSalones(e.target.checked ? otrosSalones : [])}
                  />
                  Aplicar también a los otros salones donde dicto ({otrosSalones.join(", ")})
                </label>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleCrear} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear grupo"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>

        {/* Confirmación de borrado */}
        <Dialog open={!!confirmBorrar} onOpenChange={(o) => !o && setConfirmBorrar(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5" />
                Eliminar grupo "{confirmBorrar?.nombre}"
              </DialogTitle>
              <DialogDescription>
                Las notas que estén dentro de este grupo y sus subgrupos van a convertirse a modo plano con su porcentaje efectivo del periodo calculado automáticamente. <strong>La nota final del estudiante no cambia.</strong>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmBorrar(null)}>Cancelar</Button>
              <Button onClick={() => confirmBorrar && handleEliminar(confirmBorrar)} className="bg-red-600 hover:bg-red-700 text-white" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Eliminar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default EditorGruposNotas;
