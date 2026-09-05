import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, X, Paperclip, Eye, Download, Pencil, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isAdmin } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { Calendar } from "@/components/ui/calendar";
import { es } from "date-fns/locale";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { fetchNombresPorIds } from "@/lib/nombresUsuarios";
import { cargoSegunGenero } from "@/lib/entrevistadores";

import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
interface Actividad {
  column_id: number;
  id_profesor: string;
  Nombres: string;
  Apellidos: string;
  Asignatura: string;
  Grado: string;
  Salon: string;
  Descripción: string;
  fecha_de_presentacion: string;
  archivo_url: string | null;
  estudiantes_ids: number[] | null;
}

const GRADO_ORDEN: Record<string, number> = {
  "Párvulo": 0, "Prejardín": 1, "Jardín": 2, "Transición": 3,
  "Primero": 4, "Segundo": 5, "Tercero": 6, "Cuarto": 7, "Quinto": 8,
  "Sexto": 9, "Séptimo": 10, "Octavo": 11, "Noveno": 12,
  "Décimo": 13, "Undécimo": 14,
};

const parsearFecha = (fechaStr: string): Date | null => {
  if (!fechaStr) return null;
  const iso = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const dmy = fechaStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  return null;
};

const fechaKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatearFecha = (date: Date): string => {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getCleanFilename = (url: string) =>
  decodeURIComponent((url.split('/').pop() || '').replace(/^\d+-[a-z0-9]+-/, ''));

const getFileExt = (url: string) =>
  (url.split('.').pop() || '').toLowerCase().split('?')[0];

const handleVerArchivo = (url: string) => {
  const ext = getFileExt(url);
  const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
  if (officeExts.includes(ext)) {
    window.open(`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`, '_blank');
  } else {
    window.open(url, '_blank');
  }
};

const handleDescargarArchivo = async (url: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = getCleanFilename(url);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, '_blank');
  }
};

const TodasActividades = () => {
  const navigate = useNavigate();
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesActual, setMesActual] = useState(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | undefined>(new Date());

  const [detalle, setDetalle] = useState<Actividad | null>(null);
  // Género del profesor por cédula (Usuarios.genero) para "Profesor:"/"Profesora:".
  const [generoProfes, setGeneroProfes] = useState<Record<string, string | null>>({});
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editing, setEditing] = useState<Actividad | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [fechaEdit, setFechaEdit] = useState<Date | undefined>();
  const [guardando, setGuardando] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isAdmin()) {
      navigate("/");
      return;
    }
    cargar();
  }, [navigate]);

  const cargar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('Calendario Actividades')
      .select('*')
      .order('fecha_de_presentacion', { ascending: true });
    if (!error && data) {
      setActividades(data as Actividad[]);
      const mapG = await fetchNombresPorIds((data as Actividad[]).map((a) => a.id_profesor || "").filter(Boolean));
      const g: Record<string, string | null> = {};
      mapG.forEach((u, id) => { g[id] = u.genero; });
      setGeneroProfes(g);
    }
    setLoading(false);
  };

  const actividadesPorFecha: Record<string, Actividad[]> = {};
  actividades.forEach(a => {
    const fecha = parsearFecha(a.fecha_de_presentacion);
    if (fecha) {
      const key = fechaKey(fecha);
      if (!actividadesPorFecha[key]) actividadesPorFecha[key] = [];
      actividadesPorFecha[key].push(a);
    }
  });

  const diasConActividades = Object.keys(actividadesPorFecha).map(k => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  });

  const actividadesDelDia = (diaSeleccionado
    ? (actividadesPorFecha[fechaKey(diaSeleccionado)] || []).slice()
    : []
  ).sort((a, b) => {
    const ga = GRADO_ORDEN[a.Grado] ?? 99;
    const gb = GRADO_ORDEN[b.Grado] ?? 99;
    if (ga !== gb) return ga - gb;
    const sa = String(a.Salon || '');
    const sb = String(b.Salon || '');
    if (sa !== sb) return sa.localeCompare(sb);
    return a.Asignatura.localeCompare(b.Asignatura);
  });

  const handleEditar = (a: Actividad) => {
    setEditing(a);
    setDescripcion(a.Descripción || "");
    setFechaEdit(parsearFecha(a.fecha_de_presentacion) || undefined);
    setEditModalOpen(true);
  };

  const handleGuardar = async () => {
    if (!editing || !descripcion.trim() || !fechaEdit) {
      toast({ title: "Error", description: "Completa descripción y fecha", variant: "destructive" });
      return;
    }
    setGuardando(true);
    const { error } = await supabase
      .from('Calendario Actividades')
      .update({
        Descripción: descripcion.trim(),
        fecha_de_presentacion: formatearFecha(fechaEdit),
      })
      .eq('column_id', editing.column_id);
    setGuardando(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Actividad actualizada" });
    setEditModalOpen(false);
    setEditing(null);
    cargar();
  };

  const handleEliminar = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from('Calendario Actividades')
      .delete()
      .eq('column_id', deleteId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Actividad eliminada" });
    setDeleteId(null);
    cargar();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">
              Inicio
            </button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Todas las Actividades</span>
          </BreadcrumbDeslizable>
        </div>

        <div className="bg-card rounded-lg shadow-soft p-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
            <ClipboardList className="h-5 w-5 text-primary" />
            Todas las Actividades
          </h2>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              <div data-guia="actividades.admin_calendario_dia" className="flex justify-center lg:sticky lg:top-4 shrink-0">
                <Calendar
                  mode="single"
                  selected={diaSeleccionado}
                  onSelect={setDiaSeleccionado}
                  month={mesActual}
                  onMonthChange={setMesActual}
                  locale={es}
                  modifiers={{ conActividad: diasConActividades }}
                  modifiersClassNames={{ conActividad: "bg-orange-400 text-white hover:bg-orange-500 !h-8 !w-8" }}
                  className="rounded-md border shadow-sm"
                />
              </div>

              <div className="flex-1 min-w-0 lg:max-h-[600px] lg:overflow-y-auto">
                {diaSeleccionado && actividadesDelDia.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-foreground">
                        {diaSeleccionado.toLocaleDateString("es-CO", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </h3>
                      <button
                        onClick={() => setDiaSeleccionado(undefined)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      {actividadesDelDia.length} actividad{actividadesDelDia.length !== 1 ? 'es' : ''}
                    </p>
                    <div className="space-y-3">
                      {actividadesDelDia.map(a => (
                        <div
                          key={a.column_id}
                          onClick={() => setDetalle(a)}
                          className="border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex flex-wrap gap-1">
                              <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                                {a.Grado} {a.Salon}
                              </span>
                              {a.estudiantes_ids && a.estudiantes_ids.length > 0 && (
                                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                                  Dirigida a {a.estudiantes_ids.length} estudiante{a.estudiantes_ids.length > 1 ? "s" : ""}
                                </span>
                              )}
                              <span className="inline-block px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-full">
                                {a.Asignatura}
                              </span>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button data-guia="actividades.admin_btn_editar" onClick={(e) => { e.stopPropagation(); handleEditar(a); }} className="p-1.5 rounded hover:bg-muted" title="Editar">
                                <Pencil className="w-4 h-4 text-muted-foreground" />
                              </button>
                              <button data-guia="actividades.admin_btn_eliminar" onClick={(e) => { e.stopPropagation(); setDeleteId(a.column_id); }} className="p-1.5 rounded hover:bg-destructive/10" title="Eliminar">
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </button>
                            </div>
                          </div>
                          <p className="font-medium text-foreground whitespace-pre-wrap line-clamp-3">{a.Descripción}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Prof. {a.Nombres} {a.Apellidos}
                          </p>
                          {a.archivo_url && a.archivo_url.split('\n').filter(Boolean).slice(0, 1).map((url, i) => (
                            <div key={i} className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Paperclip className="h-3 w-3 shrink-0" />
                              <span className="truncate">Archivo adjunto</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : diaSeleccionado ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                    <ClipboardList className="h-10 w-10 mb-2 opacity-50" />
                    <p>No hay actividades para este día</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                    <ClipboardList className="h-10 w-10 mb-2 opacity-50" />
                    <p>Selecciona un día para ver sus actividades</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!detalle} onOpenChange={(open) => !open && setDetalle(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle>Detalle de actividad</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                    {detalle.Grado} {detalle.Salon}
                  </span>
                  <span className="inline-block px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-full">
                    {detalle.Asignatura}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  📅 {detalle.fecha_de_presentacion && parsearFecha(detalle.fecha_de_presentacion)?.toLocaleDateString("es-CO", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {cargoSegunGenero("Profesor(a)", generoProfes[String(detalle.id_profesor || "")])}: <span className="text-foreground font-medium">{detalle.Nombres} {detalle.Apellidos}</span>
                </p>
                <div className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                  {detalle.Descripción}
                </div>
                {detalle.archivo_url && detalle.archivo_url.split('\n').filter(Boolean).map((url, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground truncate">{getCleanFilename(url)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleVerArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5">
                        <Eye className="h-4 w-4" /> Ver
                      </button>
                      <button onClick={() => handleDescargarArchivo(url)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1.5">
                        <Download className="h-4 w-4" /> Descargar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDetalle(null); handleEditar(detalle); }}>
                  <Pencil className="w-4 h-4 mr-1" /> Editar
                </Button>
                <Button variant="destructive" onClick={() => { setDeleteId(detalle.column_id); setDetalle(null); }}>
                  <Trash2 className="w-4 h-4 mr-1" /> Eliminar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar actividad</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {editing.Asignatura} · {editing.Grado} {editing.Salon} · Prof. {editing.Nombres} {editing.Apellidos}
              </div>
              <div className="space-y-2">
                <Label>Fecha de presentación</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {fechaEdit ? format(fechaEdit, "PPP", { locale: es }) : "Selecciona fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fechaEdit}
                      onSelect={setFechaEdit}
                      locale={es}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea data-guia="actividades.admin_edit_descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={5} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancelar</Button>
            <Button data-guia="actividades.admin_edit_guardar" onClick={handleGuardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta actividad?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction data-guia="actividades.admin_confirmar_eliminar" onClick={handleEliminar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TodasActividades;
