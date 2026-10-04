import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/apiClient";
import { errorDe } from "./comun";

/**
 * Etiquetas (Juan 2026-10-04: "etiquetas de tal número a tal número", sin opciones raras).
 * Una sola clase de etiqueta: el número del libro en grande y su título. Se imprimen en hoja
 * carta (caben 30 por hoja: 3 columnas × 10 filas, papel adhesivo tipo Avery 5160) y quedan
 * marcadas como impresas solas.
 */
interface EjEtiqueta { id: number; numero_inventario: number; codigo: string; Biblioteca_Obras: { titulo: string } | null }
interface Rango { primero: number | null; ultimo: number | null; pendientes: number; pendientes_desde: number | null; pendientes_hasta: number | null }
const F = { cols: 3, filas: 10, w: 2.625, h: 1, x0: 0.1875, y0: 0.5, gx: 0.125 };
const POR_HOJA = F.cols * F.filas;

const Etiquetas = () => {
  const [rango, setRango] = useState<Rango | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargarRango = async (rellenar: boolean) => {
    const r = await apiRequest<Rango>("/api/biblioteca/etiquetas/rango").catch(() => null);
    if (!r) return;
    setRango(r);
    if (rellenar) {
      setDesde(String(r.pendientes_desde ?? r.primero ?? ""));
      setHasta(String(r.pendientes_hasta ?? r.ultimo ?? ""));
    }
  };
  useEffect(() => { cargarRango(true); }, []);

  const d = Number(desde), h = Number(hasta);
  const valido = d > 0 && h >= d;
  const cuantas = valido ? h - d + 1 : 0;

  const imprimir = async () => {
    if (!valido) return;
    setOcupado(true); setMsg(null);
    try {
      const { ejemplares } = await apiRequest<{ ejemplares: EjEtiqueta[] }>(`/api/biblioteca/etiquetas?desde=${d}&hasta=${h}`);
      if (!ejemplares.length) { setMsg({ ok: false, texto: `No hay libros del N.° ${d} al N.° ${h}.` }); setOcupado(false); return; }
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "in", format: "letter" });
      ejemplares.forEach((e, i) => {
        if (i > 0 && i % POR_HOJA === 0) doc.addPage();
        const pos = i % POR_HOJA;
        const x = F.x0 + (pos % F.cols) * (F.w + F.gx), y = F.y0 + Math.floor(pos / F.cols) * F.h;
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold"); doc.setFontSize(30);
        doc.text(`N.° ${e.codigo}`, x + F.w / 2, y + 0.48, { align: "center" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        const lineas = doc.splitTextToSize(e.Biblioteca_Obras?.titulo || "", F.w - 0.3).slice(0, 2);
        doc.text(lineas, x + F.w / 2, y + 0.7, { align: "center" });
      });
      doc.save(`Etiquetas biblioteca ${d} a ${h}.pdf`);
      await apiRequest("/api/biblioteca/etiquetas/impresas", { method: "POST", body: JSON.stringify({ ids: ejemplares.map((e) => e.id) }) }).catch(() => null);
      const hojas = Math.ceil(ejemplares.length / POR_HOJA);
      setMsg({ ok: true, texto: `Listo: ${ejemplares.length} ${ejemplares.length === 1 ? "etiqueta" : "etiquetas"} en ${hojas} ${hojas === 1 ? "hoja" : "hojas"}. Imprímelas en papel adhesivo tamaño carta y pega cada una en su libro.` });
      cargarRango(false);
    } catch (err) { setMsg({ ok: false, texto: errorDe(err, "No se pudieron generar las etiquetas.") }); }
    setOcupado(false);
  };

  const inp = "w-28 px-3 py-3 border-2 border-input rounded-lg text-2xl font-bold text-center bg-background focus:border-primary focus:outline-none";
  if (rango && rango.ultimo == null) return <p className="text-center text-muted-foreground py-8">Todavía no hay libros en el catálogo.</p>;

  return (
    <div className="space-y-6 max-w-xl mx-auto text-center" data-guia="biblioteca.etiquetas">
      <div className="flex flex-wrap items-center justify-center gap-3 text-lg text-foreground">
        <span>Imprimir etiquetas del N.°</span>
        <input value={desde} onChange={(e) => setDesde(e.target.value.replace(/\D/g, ""))} className={inp} inputMode="numeric" data-guia="biblioteca.etiquetas_desde" />
        <span>al N.°</span>
        <input value={hasta} onChange={(e) => setHasta(e.target.value.replace(/\D/g, ""))} className={inp} inputMode="numeric" data-guia="biblioteca.etiquetas_hasta" />
      </div>

      {rango && (
        <p className="text-sm text-muted-foreground">
          {rango.pendientes
            ? <>Faltan por imprimir {rango.pendientes === 1 ? "la etiqueta" : "las etiquetas"} del N.° {rango.pendientes_desde} al N.° {rango.pendientes_hasta}.</>
            : <>Todas las etiquetas ya están impresas. Los libros van del N.° {rango.primero} al N.° {rango.ultimo}.</>}
        </p>
      )}

      <Button data-guia="biblioteca.generar_etiquetas" size="lg" className="w-full rounded-lg text-base" onClick={imprimir} disabled={ocupado || !valido}>
        {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Printer className="w-5 h-5 mr-2" /> Imprimir {cuantas ? `${cuantas} ${cuantas === 1 ? "etiqueta" : "etiquetas"}` : "etiquetas"}</>}
      </Button>
      {!valido && desde && hasta && <p className="text-sm text-rose-700">El segundo número debe ser mayor o igual al primero.</p>}
      {msg && <p className={`text-sm rounded-lg p-3 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.texto}</p>}
    </div>
  );
};

export default Etiquetas;
