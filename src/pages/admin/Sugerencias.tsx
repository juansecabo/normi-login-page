import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isAdmin } from "@/hooks/useSession";
import HeaderNormy from "@/components/HeaderNormy";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search, Trash2, Loader2 } from "lucide-react";

interface Sugerencia {
  id: number;
  id: string;
  nombres: string;
  apellidos: string | null;
  rol: string;
  contacto: string;
  mensaje: string;
  created_at: string;
}

function normalize(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const Sugerencias = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Sugerencia | null>(null);
  const [selectedTelefono, setSelectedTelefono] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Sugerencia | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id) { navigate("/"); return; }
    if (!isAdmin()) { navigate("/dashboard"); return; }
    fetchSugerencias();
  }, [navigate]);

  const fetchSugerencias = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("Sugerencias")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "No se pudieron cargar las sugerencias." });
    } else {
      setSugerencias(data || []);
    }
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    const { error } = await supabase.from("Sugerencias").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar la sugerencia." });
    } else {
      setSugerencias((prev) => prev.filter((s) => s.id !== id));
      toast({ title: "Eliminada", description: "La sugerencia fue eliminada." });
    }
    setConfirmDelete(null);
  };

  const filtered = sugerencias.filter((s) =>
    normalize(`${s.nombres} ${s.apellidos || ""} ${s.rol} ${s.contacto} ${s.mensaje}`)
      .includes(normalize(search))
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CO", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard-admin" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6 max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => navigate("/dashboard-admin")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Buzón de Sugerencias</span>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6 max-w-5xl mx-auto">
          <h2 className="text-xl font-bold text-foreground mb-4 text-center">
            Buzón de Sugerencias
          </h2>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, rol, mensaje..."
              className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {search ? "No se encontraron resultados." : "No hay sugerencias aún."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Fecha</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Sugerencia</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={async () => {
                        setSelected(s);
                        setSelectedTelefono(null);
                        const { data: perfil } = await supabase
                          .from('Perfiles_Generales')
                          .select('numero_de_telefono')
                          .or(`estudiante_id.eq.${s.id},padre_id.eq.${s.id}`)
                          .maybeSingle();
                        if (perfil?.numero_de_telefono) {
                          setSelectedTelefono(perfil.numero_de_telefono);
                        } else {
                          const { data: interno } = await supabase
                            .from('Internos')
                            .select('numero_de_telefono')
                            .eq('id', s.id)
                            .maybeSingle();
                          if (interno?.numero_de_telefono) setSelectedTelefono(interno.numero_de_telefono);
                        }
                      }}
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDate(s.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {s.nombres} {s.apellidos || ""}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{s.rol}</TableCell>
                      <TableCell className="text-xs">{s.contacto}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {s.mensaje}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(s); }}
                          className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>

      {/* Dialog: ver sugerencia completa */}
      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setSelectedTelefono(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sugerencia</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span><strong>De:</strong> {selected.nombres} {selected.apellidos || ""}</span>
                <span><strong>Rol:</strong> {selected.rol}</span>
                <span><strong>Contacto:</strong> {selected.contacto}</span>
                {selectedTelefono && <span><strong>Teléfono:</strong> {selectedTelefono}</span>}
              </div>
              <p className="text-xs text-muted-foreground">{formatDate(selected.created_at)}</p>
              <p className="text-foreground whitespace-pre-wrap">{selected.mensaje}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar eliminación */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar sugerencia</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de que deseas eliminar esta sugerencia?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete.id)}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sugerencias;
