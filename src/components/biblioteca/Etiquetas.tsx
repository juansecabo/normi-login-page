import { useState } from "react";
import { Loader2, Printer, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";
import { GENEROS, NIVELES, errorDe } from "./comun";

/**
 * Etiquetas en PDF tamaño carta:
 *  - Número: 30 por hoja (formato Avery 5160, 2⅝" × 1"): el número del libro en grande
 *    (1, 2, 3…), la signatura y el título. Ese número es el que se escribe para prestar,
 *    devolver o buscar (sin lectores ni cámara, Juan 2026-10-04).
 *  - Tejuelo: 80 por hoja (Avery 5167, 1¾" × ½"): signatura para el lomo, con el color del
 *    género (literatura) y la cinta del nivel lector, como propone el MEN.
 * Se puede empezar en otra posición para aprovechar hojas ya usadas.
 */
interface EjEtiqueta {
  id: number; numero_inventario: number; codigo: string; signatura: string | null; etiqueta_impresa: boolean;
  Biblioteca_Obras: { titulo: string; autores: string | null; genero: string | null; nivel_lector: string | null } | null;
}
const FORMATOS = {
  codigo: { cols: 3, filas: 10, w: 2.625, h: 1, x0: 0.1875, y0: 0.5, gx: 0.125, gy: 0 },
  tejuelo: { cols: 4, filas: 20, w: 1.75, h: 0.5, x0: 0.3, y0: 0.5, gx: 0.3, gy: 0 },
};
const hexRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as [number, number, number];

const Etiquetas = () => {
  const [lote, setLote] = useState<"pendientes" | "rango">("pendientes");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipo, setTipo] = useState<"codigo" | "tejuelo">("codigo");
  const [inicio, setInicio] = useState("1");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [impresos, setImpresos] = useState<number[]>([]);

  const generar = async () => {
    setOcupado(true); setMsg(null); setImpresos([]);
    try {
      const params = new URLSearchParams();
      if (lote === "pendientes") params.set("pendientes", "1");
      else { if (desde) params.set("desde", desde); if (hasta) params.set("hasta", hasta); }
      const { ejemplares } = await apiRequest<{ ejemplares: EjEtiqueta[] }>(`/api/biblioteca/etiquetas?${params}`);
      if (!ejemplares.length) { setMsg({ ok: false, texto: lote === "pendientes" ? "No hay etiquetas pendientes por imprimir." : "No hay libros en ese rango." }); setOcupado(false); return; }

      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "in", format: "letter" });
      const f = FORMATOS[tipo];
      const porHoja = f.cols * f.filas;
      let pos = Math.min(porHoja, Math.max(1, Number(inicio) || 1)) - 1;

      for (const e of ejemplares) {
        if (pos >= porHoja) { doc.addPage(); pos = 0; }
        const col = pos % f.cols, fila = Math.floor(pos / f.cols);
        const x = f.x0 + col * (f.w + f.gx), y = f.y0 + fila * (f.h + f.gy);
        const o = e.Biblioteca_Obras;
        if (tipo === "codigo") {
          doc.setTextColor(0);
          doc.setFont("helvetica", "bold"); doc.setFontSize(26);
          doc.text(`N.° ${e.codigo}`, x + f.w / 2, y + 0.42, { align: "center" });
          doc.setFont("helvetica", "bold"); doc.setFontSize(8);
          doc.text(e.signatura || "", x + f.w / 2, y + 0.62, { align: "center" });
          doc.setFont("helvetica", "normal"); doc.setFontSize(7);
          const titulo = doc.splitTextToSize(o?.titulo || "", f.w - 0.24)[0] || "";
          doc.text(titulo, x + f.w / 2, y + 0.8, { align: "center" });
        } else {
          const g = GENEROS.find((x) => x.value === o?.genero);
          const n = NIVELES.find((x) => x.value === o?.nivel_lector);
          // Fondo del color del género (literatura) y cinta superior del nivel lector.
          const fondo = g && g.letra ? g.color : "#ffffff";
          doc.setFillColor(...hexRgb(fondo)); doc.rect(x, y, f.w, f.h, "F");
          if (n) { doc.setFillColor(...hexRgb(n.color)); doc.rect(x, y, f.w, 0.08, "F"); }
          doc.setDrawColor(180); doc.rect(x, y, f.w, f.h, "S");
          doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
          const partes = (e.signatura || "").split("/").map((s) => s.trim()).filter(Boolean);
          doc.text(partes.join("  "), x + f.w / 2, y + 0.33, { align: "center" });
          doc.setFont("helvetica", "normal"); doc.setFontSize(6);
          doc.text(`N.° ${e.codigo}`, x + f.w - 0.06, y + f.h - 0.05, { align: "right" });
        }
        pos++;
      }
      doc.save(`Etiquetas ${tipo === "codigo" ? "número" : "tejuelo"} biblioteca.pdf`);
      setImpresos(ejemplares.map((e) => e.id));
      setMsg({ ok: true, texto: `Se generaron ${ejemplares.length} ${ejemplares.length === 1 ? "etiqueta" : "etiquetas"}. Imprímelas en papel adhesivo tamaño carta, sin ajustar a la página.` });
    } catch (err) { setMsg({ ok: false, texto: errorDe(err, "No se pudieron generar las etiquetas.") }); }
    setOcupado(false);
  };

  const marcar = async () => {
    setOcupado(true);
    try { await apiRequest("/api/biblioteca/etiquetas/impresas", { method: "POST", body: JSON.stringify({ ids: impresos }) }); setMsg({ ok: true, texto: "Quedaron marcadas como impresas." }); setImpresos([]); }
    catch (err) { setMsg({ ok: false, texto: errorDe(err) }); }
    setOcupado(false);
  };

  const inp = "px-3 py-2 border border-input rounded-md text-sm bg-background";
  const opc = (activo: boolean) => `flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition ${activo ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`;
  return (
    <div className="space-y-5 max-w-xl mx-auto" data-guia="biblioteca.etiquetas">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Tipo de etiqueta</p>
        <div className="flex gap-2">
          <button onClick={() => setTipo("codigo")} className={opc(tipo === "codigo")}>Número del libro<br /><span className="text-xs font-normal">30 por hoja</span></button>
          <button onClick={() => setTipo("tejuelo")} className={opc(tipo === "tejuelo")}>Tejuelo (lomo)<br /><span className="text-xs font-normal">80 por hoja</span></button>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">¿Cuáles libros?</p>
        <div className="flex gap-2">
          <button onClick={() => setLote("pendientes")} className={opc(lote === "pendientes")}>Las que faltan por imprimir</button>
          <button onClick={() => setLote("rango")} className={opc(lote === "rango")}>Por números</button>
        </div>
        {lote === "rango" && (
          <div className="flex items-center gap-2 text-sm">
            Del n.° <input value={desde} onChange={(e) => setDesde(e.target.value.replace(/\D/g, ""))} className={`${inp} w-24`} inputMode="numeric" />
            al n.° <input value={hasta} onChange={(e) => setHasta(e.target.value.replace(/\D/g, ""))} className={`${inp} w-24`} inputMode="numeric" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm">
        Empezar en la etiqueta n.° <input value={inicio} onChange={(e) => setInicio(e.target.value.replace(/\D/g, ""))} className={`${inp} w-20`} inputMode="numeric" />
        <span className="text-muted-foreground">(si la hoja ya está usada)</span>
      </div>
      <Button data-guia="biblioteca.generar_etiquetas" className="w-full" onClick={generar} disabled={ocupado}>
        {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Printer className="w-4 h-4 mr-1" /> Generar PDF</>}
      </Button>
      {msg && <p className={`text-sm rounded-md p-2 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.texto}</p>}
      {impresos.length > 0 && (
        <Button variant="outline" className="w-full" onClick={marcar} disabled={ocupado}><CheckCheck className="w-4 h-4 mr-1" /> Ya las imprimí: marcarlas como impresas</Button>
      )}
    </div>
  );
};

export default Etiquetas;
