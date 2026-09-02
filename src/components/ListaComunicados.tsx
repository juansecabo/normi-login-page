import { useState } from "react";
import { Clock, Search, FileUp, Download, Eye, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { remitenteVisible } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Comunicado {
  id: number;
  remitente: string;
  destinatarios: string;
  mensaje: string;
  fecha: string;
  archivo_url?: string | null;
}

interface ListaComunicadosProps {
  comunicados: Comunicado[];
  loading: boolean;
  showDocumentLink?: boolean;
}

const formatFecha = (fecha: string) => {
  const d = new Date(fecha);
  return d.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getCleanFilename = (url: string) =>
  decodeURIComponent((url.split('/').pop() || '').replace(/^\d+-[a-z0-9]+-/, ''));

const getFileExt = (url: string) =>
  (url.split('.').pop() || '').toLowerCase().split('?')[0];

const handleVerArchivo = (url: string, e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const ext = getFileExt(url);
  const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
  if (officeExts.includes(ext)) {
    window.open(`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`, '_blank');
  } else {
    window.open(url, '_blank');
  }
};

const handleDescargarArchivo = async (url: string, e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = getCleanFilename(url);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, "_blank");
  }
};

const renderArchivos = (archivoUrl: string, stopProp = false) => {
  const urls = archivoUrl.split('\n').filter(Boolean);
  return urls.map((url, i) => (
    <div key={i} className="mt-2 space-y-1">
      <div className="flex items-center gap-1.5">
        <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-foreground truncate">{getCleanFilename(url)}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={(e) => handleVerArchivo(url, e)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1.5">
          <Eye className="h-4 w-4" /> Ver
        </button>
        <button onClick={(e) => handleDescargarArchivo(url, e)} className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 flex items-center gap-1.5">
          <Download className="h-4 w-4" /> Descargar
        </button>
      </div>
    </div>
  ));
};

const ListaComunicados = ({ comunicados, loading, showDocumentLink = false }: ListaComunicadosProps) => {
  const [busqueda, setBusqueda] = useState("");
  const [selectedItem, setSelectedItem] = useState<Comunicado | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (comunicados.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        No hay {showDocumentLink ? 'documentos' : 'comunicados'} disponibles.
      </p>
    );
  }

  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filtrados = comunicados.filter((c) => {
    if (!busqueda.trim()) return true;
    const term = normalize(busqueda);
    return normalize(c.remitente || '').includes(term) || normalize(c.mensaje || '').includes(term);
  });

  // Numerar cada comunicado del usuario (oldest = #1, newest = N) basado en
  // la lista completa, no en la filtrada — así el número es estable.
  const total = comunicados.length;
  const numeroById = new Map<number, number>();
  comunicados.forEach((c, i) => numeroById.set(c.id, total - i));

  return (
    <div data-guia="comunicados.recibidos_item" className="space-y-4">
      <div data-guia="comunicados.recibidos_busqueda" className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          data-guia="comunicados.buscar"
          placeholder="Buscar por remitente o contenido..."
          className="pl-9"
        />
      </div>

      {filtrados.map((c) => (
        <div key={c.id} data-guia="comunicados.item" className="bg-primary/10 border-2 border-primary/40 rounded-lg p-4 space-y-2 cursor-pointer hover:bg-primary/15 hover:border-primary/60 transition-colors" onClick={() => setSelectedItem(c)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatFecha(c.fecha)}
            </div>
            <span className="text-xs font-semibold text-primary">#{numeroById.get(c.id)}</span>
          </div>
          <p className="text-sm break-words">
            <span className="font-medium text-foreground">De:</span>{" "}
            {remitenteVisible(c.remitente)}
          </p>
          {c.destinatarios && (
            <p className="text-sm break-words">
              <span className="font-medium text-foreground">Para:</span>{" "}
              <span className="text-muted-foreground">{c.destinatarios}</span>
            </p>
          )}
          {c.mensaje && (
            <p className="text-sm whitespace-pre-wrap break-words bg-stone-50 border border-stone-200 p-3 rounded-md leading-relaxed">
              {c.mensaje}
            </p>
          )}
          {showDocumentLink && c.archivo_url && renderArchivos(c.archivo_url)}
        </div>
      ))}

      {filtrados.length === 0 && busqueda.trim() && (
        <p className="text-center text-muted-foreground py-4 text-sm">
          No se encontraron resultados para "{busqueda}"
        </p>
      )}

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base break-words">
                  De: {remitenteVisible(selectedItem.remitente)}
                </DialogTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatFecha(selectedItem.fecha)}
                </div>
              </DialogHeader>
              {selectedItem.mensaje && (
                <p className="text-sm whitespace-pre-wrap break-words bg-stone-50 border border-stone-200 p-4 rounded-md leading-relaxed">
                  {selectedItem.mensaje}
                </p>
              )}
              {showDocumentLink && selectedItem.archivo_url && renderArchivos(selectedItem.archivo_url)}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ListaComunicados;
