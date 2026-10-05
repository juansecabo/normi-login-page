import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Search, ImagePlus, X, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { subirArchivo } from "@/lib/storage";
import { NIVELES, errorDe, useGeneros } from "./comun";
import GenerosEditor from "./GenerosEditor";
import Contador from "./Contador";

/**
 * Agregar o editar un libro (obra). Al crear, también se crean sus ejemplares (copias) con
 * número de inventario consecutivo. El ISBN autocompleta desde lo ya catalogado en Normi,
 * Google Books u Open Library; si no aparece, se llena a mano.
 */
type Datos = Record<string, string>;
const VACIO: Datos = {
  titulo: "", subtitulo: "", autores: "", editorial: "", lugar: "", anio: "", edicion: "", isbn: "", materia: "",
  genero: "", dewey: "", nivel_lector: "", idioma: "Español", paginas: "", resumen: "", portada_url: "", palabras_clave: "",
};

const ObraForm = ({ abierto, obra, onCerrar, onGuardado }: {
  abierto: boolean; obra?: Record<string, any> | null; onCerrar: () => void; onGuardado: (obraId: number) => void;
}) => {
  const editando = !!obra;
  const [d, setD] = useState<Datos>(VACIO);
  const [cantidad, setCantidad] = useState("1");
  const [mas, setMas] = useState(false);
  const [editarGeneros, setEditarGeneros] = useState(false);
  const { generos, guardar: guardarGeneros } = useGeneros();
  // Libro con el mismo título (sin importar mayúsculas ni tildes): no se crea otro, se le suman copias.
  const [repetida, setRepetida] = useState<{ id: number; titulo: string; copias: number } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string; obraId?: number } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!abierto) return;
    const base = { ...VACIO };
    if (obra) for (const k of Object.keys(VACIO)) base[k] = obra[k] == null ? "" : String(obra[k]);
    setD(base); setCantidad("1"); setMas(!!obra); setRepetida(null);
    setAviso(null); setError("");
  }, [abierto, obra]);

  const set = (k: string, v: string) => setD((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const t0 = d.titulo.trim();
    if (!abierto || t0.length < 2 || (editando && t0 === String(obra?.titulo || "").trim())) { setRepetida(null); return; }
    const t = setTimeout(() => {
      apiRequest<{ obra: { id: number; titulo: string; copias: number } | null }>(`/api/biblioteca/titulo-existe?titulo=${encodeURIComponent(t0)}${editando ? `&excluir=${obra!.id}` : ""}`)
        .then((r) => setRepetida(r.obra)).catch(() => null);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.titulo, abierto]);

  const sumarCopias = async () => {
    if (!repetida) return;
    setGuardando(true); setError("");
    try {
      await apiRequest(`/api/biblioteca/obras/${repetida.id}/ejemplares`, { method: "POST", body: JSON.stringify({ cantidad: Number(cantidad) || 1 }) });
      onGuardado(repetida.id);
    } catch (err) { setError(errorDe(err)); }
    setGuardando(false);
  };

  const buscarIsbn = async () => {
    const isbn = d.isbn.replace(/[^0-9Xx]/g, "");
    if (isbn.length !== 10 && isbn.length !== 13) { setAviso({ ok: false, texto: "El ISBN debe tener 10 o 13 dígitos." }); return; }
    setBuscando(true); setAviso(null);
    try {
      const r = await apiRequest<{ fuente: string | null; datos?: Datos; obra_existente?: { id: number; titulo: string } }>(`/api/biblioteca/isbn/${isbn}`);
      if (r.obra_existente) setAviso({ ok: false, texto: `Este libro ya está en el catálogo: «${r.obra_existente.titulo}». Ábrelo y agrega más ejemplares.`, obraId: r.obra_existente.id });
      else if (!r.fuente || !r.datos) setAviso({ ok: false, texto: "No se encontraron datos para ese ISBN. Llénalos a mano." });
      else {
        setD((p) => {
          const n = { ...p };
          for (const [k, v] of Object.entries(r.datos!)) if (v != null && v !== "" && (k in VACIO) && !p[k]) n[k] = String(v);
          n.isbn = isbn;
          return n;
        });
        setAviso({ ok: true, texto: "Datos encontrados. Revísalos antes de guardar." });
      }
    } catch (err) { setAviso({ ok: false, texto: errorDe(err) }); }
    setBuscando(false);
  };

  const subirPortada = async (file?: File) => {
    if (!file) return;
    setSubiendo(true);
    try { const r = await subirArchivo(file); set("portada_url", r.url); }
    catch (err) { setError(errorDe(err, "No se pudo subir la portada.")); }
    setSubiendo(false);
  };

  const guardar = async () => {
    if (!d.titulo.trim()) { setError("El título es obligatorio."); return; }
    setGuardando(true); setError("");
    try {
      const body: Record<string, unknown> = { ...d };
      if (!editando) Object.assign(body, { cantidad: Number(cantidad) || 0 });
      const r = editando
        ? await apiRequest<{ obra: { id: number } }>(`/api/biblioteca/obras/${obra!.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiRequest<{ obra: { id: number } }>("/api/biblioteca/obras", { method: "POST", body: JSON.stringify(body) });
      onGuardado(r.obra.id);
    } catch (err: any) {
      if (err?.body?.error === "duplicado" && err.body.obra) setRepetida(err.body.obra);
      else setError(errorDe(err));
    }
    setGuardando(false);
  };

  const inp = "w-full px-3 py-2 border border-input rounded-md text-sm bg-background";
  const lbl = "text-sm font-medium text-foreground";

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !guardando && onCerrar()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{editando ? "Editar libro" : "Agregar libro"}</DialogTitle></DialogHeader>
        <div className="space-y-4" data-guia="biblioteca.form_obra">
          {/* Lo esencial a la vista (Juan 2026-10-04): título, autor, género, edades y cuántas copias. */}
          <div className="flex gap-4 items-start">
            <div className="shrink-0 text-center">
              <label className="block w-20 h-28 rounded-md border border-dashed border-input bg-muted/40 overflow-hidden relative cursor-pointer hover:bg-muted" title="Foto de la portada (opcional)" data-guia="biblioteca.form_portada">
                {d.portada_url ? <img src={d.portada_url} alt="" className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">{subiendo ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}<span className="text-[10px] leading-tight px-1">Foto<br />(opcional)</span></span>}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => subirPortada(e.target.files?.[0])} />
              </label>
              {d.portada_url && <button type="button" onClick={() => set("portada_url", "")} className="mt-1 text-xs text-muted-foreground hover:text-destructive">Quitar foto</button>}
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div className="space-y-1"><label className={lbl}>Título *</label><input data-guia="biblioteca.form_titulo" value={d.titulo} onChange={(e) => set("titulo", e.target.value)} className={inp} autoFocus={!editando} /></div>
              <div className="space-y-1"><label className={lbl}>Autor</label><input value={d.autores} onChange={(e) => set("autores", e.target.value)} placeholder="Ej. Gabriel García Márquez" className={inp} /></div>
            </div>
          </div>
          {repetida && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-2" data-guia="biblioteca.form_repetido">
              <p className="text-amber-900"><strong>«{repetida.titulo}»</strong> ya está en el catálogo ({repetida.copias} {repetida.copias === 1 ? "copia" : "copias"}).{editando ? " Usa otro título." : " No se agrega dos veces: súmale las copias."}</p>
              {!editando && (
                <Button size="sm" onClick={sumarCopias} disabled={guardando}>
                  {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : `Agregar ${Number(cantidad) || 1} ${(Number(cantidad) || 1) === 1 ? "copia" : "copias"} a ese libro`}
                </Button>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className={lbl}>Género</label>
                <button type="button" onClick={() => setEditarGeneros((v) => !v)} className="text-xs text-primary hover:underline" data-guia="biblioteca.form_editar_generos">{editarGeneros ? "Listo" : "Agregar o quitar géneros"}</button>
              </div>
              <select data-guia="biblioteca.form_genero" value={d.genero} onChange={(e) => set("genero", e.target.value)} className={inp}>
                <option value="">Sin definir</option>
                {[...generos, ...(d.genero && !generos.includes(d.genero) ? [d.genero] : [])].map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className={lbl}>Para qué edades</label>
              <select value={d.nivel_lector} onChange={(e) => set("nivel_lector", e.target.value)} className={inp}>
                <option value="">Sin definir</option>
                {NIVELES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>
          </div>
          {editarGeneros && <GenerosEditor generos={generos} guardar={guardarGeneros} />}
          {!editando && (
            <div className="space-y-1">
              <label className={lbl}>¿Cuántas copias hay?</label>
              <div className="flex items-center gap-3">
                <Contador valor={cantidad} onCambio={setCantidad} guia="biblioteca.form_cantidad" />
                <span className="text-xs text-muted-foreground">Cada copia recibe su número para la etiqueta.</span>
              </div>
            </div>
          )}

          <button type="button" onClick={() => setMas((v) => !v)} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline" data-guia="biblioteca.form_mas">
            <ChevronDown className={`w-4 h-4 transition-transform ${mas ? "rotate-180" : ""}`} /> Más datos (opcional)
          </button>

          {mas && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <label className={lbl}>ISBN <span className="font-normal text-muted-foreground">(el número que está encima del código de barras; con la lupa se llenan los datos solos)</span></label>
                <div className="flex gap-2">
                  <input data-guia="biblioteca.form_isbn" value={d.isbn} onChange={(e) => set("isbn", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarIsbn(); } }}
                    placeholder="978..." className={inp} inputMode="numeric" />
                  <Button type="button" variant="outline" onClick={() => buscarIsbn()} disabled={buscando} title="Buscar datos">
                    {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                {aviso && <p className={`text-xs ${aviso.ok ? "text-emerald-700" : "text-amber-700"}`}>{aviso.texto}</p>}
              </div>

              <div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2"><label className={lbl}>Editorial</label><input value={d.editorial} onChange={(e) => set("editorial", e.target.value)} className={inp} /></div>
                  <div className="space-y-1"><label className={lbl}>Año</label><input value={d.anio} onChange={(e) => set("anio", e.target.value.replace(/\D/g, "").slice(0, 4))} className={inp} inputMode="numeric" /></div>
                  <div className="space-y-1"><label className={lbl}>Páginas</label><input value={d.paginas} onChange={(e) => set("paginas", e.target.value.replace(/\D/g, ""))} className={inp} inputMode="numeric" /></div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><label className={lbl}>Subtítulo</label><input value={d.subtitulo} onChange={(e) => set("subtitulo", e.target.value)} className={inp} /></div>
              </div>
              <div className="space-y-1"><label className={lbl}>Resumen</label><textarea value={d.resumen} onChange={(e) => set("resumen", e.target.value)} className={`${inp} min-h-[70px] resize-y`} /></div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button data-guia="biblioteca.form_guardar" onClick={guardar} disabled={guardando || subiendo || !!repetida}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ObraForm;
