import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { getSession, hasValidSession, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/lib/apiClient";
import HeaderNormi from "@/components/HeaderNormi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import DestinatariosSelector, {
  emptyDestinatariosValue,
  type DestinatariosOutput,
} from "@/components/DestinatariosSelector";
import {
  ClipboardSignature, Send, Paperclip, X, FileText, Clock, CheckCircle2,
  Trash2, RotateCcw, PenLine, Users,
} from "lucide-react";

// Roles que PUEDEN crear/enviar comunicados con firma (staff). El resto
// (estudiantes/acudientes) solo ven y firman los que les llegaron.
const CARGOS_EMISORES = new Set([
  "Administrador", "Rector", "Coordinador(a)", "Secretaria General",
  "Administrativo(a)", "Orientador(a) Escolar", "Profesor(a)",
]);

interface EnviadoRow {
  id: number;
  mensaje: string;
  archivo_url: string | null;
  destinatarios_label: string | null;
  remitente: string | null;
  creado_por_nombre: string | null;
  creado_por_cargo: string | null;
  fecha: string;
  total: number;
  firmadas: number;
}

interface RespuestaRow {
  id: number;
  destinatario_id: string;
  destinatario_nombre: string | null;
  destinatario_apellidos: string | null;
  tabla: string | null;
  estudiante_nombre: string | null;
  estudiante_apellidos: string | null;
  estudiante_grado: string | null;
  estudiante_salon: string | null;
  firma_url: string | null;
  firma_nombre: string | null;
  fecha_firma: string | null;
}

interface MioRow {
  respuesta_id: number;
  comunicado_id: number;
  estudiante_nombre: string | null;
  estudiante_apellidos: string | null;
  estudiante_grado: string | null;
  estudiante_salon: string | null;
  firma_url: string | null;
  firma_nombre: string | null;
  fecha_firma: string | null;
  comunicado: {
    mensaje: string;
    archivo_url: string | null;
    remitente: string | null;
    creado_por_nombre: string | null;
    creado_por_cargo: string | null;
    fecha: string;
  } | null;
}

const fmtFecha = (s: string) =>
  new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const nombreArchivo = (url: string) =>
  decodeURIComponent((url.split("/").pop() || "").replace(/^\d+[_-][a-z0-9]*[_-]?/i, ""));

const abrirArchivo = (url: string) => {
  const ext = (url.split(".").pop() || "").toLowerCase().split("?")[0];
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) {
    window.open(`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`, "_blank");
  } else {
    window.open(url, "_blank");
  }
};

/** dataURL de la firma → sube a Storage → devuelve publicUrl. */
async function subirFirma(dataUrl: string, comunicadoId: number, destinatarioId: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) throw new Error("Firma inválida");
  const mime = match[1];
  const ext = mime.split("/")[1];
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const filename = `firmas-comunicado/${comunicadoId}/${destinatarioId}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("normi-archivos").upload(filename, blob, { contentType: mime, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("normi-archivos").getPublicUrl(filename);
  return data.publicUrl;
}

export default function ComunicadosFirma() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const session = getSession();
  const esEmisor = CARGOS_EMISORES.has(session.cargo || "");

  const [tab, setTab] = useState<"enviar" | "enviados" | "porfirmar">(esEmisor ? "enviar" : "porfirmar");

  // ── Enviar ──────────────────────────────────────────────────────────
  const [mensaje, setMensaje] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dest, setDest] = useState<DestinatariosOutput | null>(null);
  const [enviando, setEnviando] = useState(false);
  // key para remontar el selector y limpiarlo tras enviar
  const [selectorKey, setSelectorKey] = useState(0);

  // ── Enviados ────────────────────────────────────────────────────────
  const [enviados, setEnviados] = useState<EnviadoRow[]>([]);
  const [loadingEnviados, setLoadingEnviados] = useState(false);
  const [detalle, setDetalle] = useState<EnviadoRow | null>(null);
  const [respuestas, setRespuestas] = useState<RespuestaRow[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ── Por firmar ──────────────────────────────────────────────────────
  const [mios, setMios] = useState<MioRow[]>([]);
  const [loadingMios, setLoadingMios] = useState(false);
  const [firmando, setFirmando] = useState<MioRow | null>(null);
  const [guardandoFirma, setGuardandoFirma] = useState(false);
  const sigRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    if (!hasValidSession()) { navigate("/"); return; }
  }, [navigate]);

  const cargarEnviados = async () => {
    setLoadingEnviados(true);
    try {
      const r = await apiRequest<{ comunicados: EnviadoRow[] }>("/api/comunicados-firma/enviados");
      setEnviados(r.comunicados || []);
    } catch { /* error mostrado por interceptor */ }
    setLoadingEnviados(false);
  };

  const cargarMios = async () => {
    setLoadingMios(true);
    try {
      const r = await apiRequest<{ items: MioRow[] }>("/api/comunicados-firma/mios");
      setMios(r.items || []);
    } catch { /* */ }
    setLoadingMios(false);
  };

  useEffect(() => {
    if (tab === "enviados") cargarEnviados();
    if (tab === "porfirmar") cargarMios();
  }, [tab]);

  const abrirDetalle = async (c: EnviadoRow) => {
    setDetalle(c);
    setLoadingDetalle(true);
    setRespuestas([]);
    try {
      const r = await apiRequest<{ respuestas: RespuestaRow[] }>(`/api/comunicados-firma/${c.id}/respuestas`);
      setRespuestas(r.respuestas || []);
    } catch { /* */ }
    setLoadingDetalle(false);
  };

  const handleArchivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX = 16 * 1024 * 1024;
    const validos = files.filter((f) => f.size <= MAX);
    if (validos.length < files.length) {
      toast({ title: "Archivo muy grande", description: "Cada archivo debe pesar máximo 16 MB.", variant: "destructive" });
    }
    setArchivos((prev) => [...prev, ...validos]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleEnviar = async () => {
    if (!dest || dest.isEmpty) {
      return toast({ title: "Sin destinatarios", description: "Selecciona al menos un perfil destinatario.", variant: "destructive" });
    }
    if (!mensaje.trim() && archivos.length === 0) {
      return toast({ title: "Falta el mensaje", description: "Escribe el comunicado o adjunta un archivo.", variant: "destructive" });
    }
    setEnviando(true);
    try {
      // Subir archivos (si hay)
      let archivoUrl: string | null = null;
      if (archivos.length > 0) {
        const urls: string[] = [];
        for (const a of archivos) {
          const limpio = a.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
          const fileName = `${Date.now()}_${limpio}`;
          const { error } = await supabase.storage.from("normi-archivos").upload(fileName, a);
          if (error) throw new Error(`Error subiendo archivo: ${error.message}`);
          urls.push(supabase.storage.from("normi-archivos").getPublicUrl(fileName).data.publicUrl);
        }
        archivoUrl = urls.join("\n");
      }

      const r = await apiRequest<{ total: number }>("/api/comunicados-firma/enviar", {
        method: "POST",
        body: JSON.stringify({
          destinatarios_label: dest.destinatarios_label,
          mensaje: mensaje.trim(),
          archivo_url: archivoUrl,
          segmentos: dest.segmentos,
        }),
      });
      toast({ title: "Comunicado con firma enviado", description: `Se envió a ${r.total} persona(s). Pendiente de firma.` });
      setMensaje("");
      setArchivos([]);
      // Limpiar destinatarios remontando el selector
      setSelectorKey((k) => k + 1);
      setTab("enviados");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo enviar.";
      const body = (err as { body?: { error?: string; detail?: string } })?.body;
      const sinDest = /no[_ ]destinatarios/i.test(`${msg} ${body?.error || ""}`);
      toast({
        title: sinDest ? "Sin destinatarios" : "Error",
        description: sinDest ? "Ningún usuario coincide con los filtros seleccionados." : (body?.detail || msg),
        variant: sinDest ? "default" : "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  const handleReenviar = async (c: EnviadoRow) => {
    try {
      const r = await apiRequest<{ total: number; motivo?: string }>(`/api/comunicados-firma/reenviar/${c.id}`, { method: "POST" });
      if (r.total === 0) {
        toast({ title: "Nada que reenviar", description: r.motivo === "todos_firmaron" ? "Todos ya firmaron." : "Los pendientes no tienen teléfono registrado." });
      } else {
        toast({ title: "Reenviado", description: `Se reenvió a ${r.total} persona(s) que faltaban por firmar.` });
      }
    } catch { /* */ }
  };

  const handleEliminar = async () => {
    if (deleteId == null) return;
    try {
      await apiRequest(`/api/comunicados-firma/${deleteId}`, { method: "DELETE" });
      setEnviados((prev) => prev.filter((c) => c.id !== deleteId));
      if (detalle?.id === deleteId) setDetalle(null);
    } catch { /* */ }
    setDeleteId(null);
  };

  const handleFirmar = async () => {
    if (!firmando) return;
    const sig = sigRef.current;
    if (!sig || sig.isEmpty()) {
      return toast({ title: "Falta tu firma", description: "Dibuja tu firma con el dedo antes de confirmar.", variant: "destructive" });
    }
    setGuardandoFirma(true);
    try {
      const dataUrl = sig.getTrimmedCanvas().toDataURL("image/png");
      const firmaUrl = await subirFirma(dataUrl, firmando.comunicado_id, session.id || "");
      await apiRequest("/api/comunicados-firma/firmar", {
        method: "POST",
        body: JSON.stringify({ respuesta_id: firmando.respuesta_id, firma_url: firmaUrl }),
      });
      toast({ title: "Firma registrada", description: "Quedó constancia de que leíste el comunicado." });
      setFirmando(null);
      cargarMios();
    } catch (err) {
      const body = (err as { body?: { error?: string; detail?: string } })?.body;
      toast({ title: "Error", description: body?.detail || (err instanceof Error ? err.message : "No se pudo firmar."), variant: "destructive" });
    } finally {
      setGuardandoFirma(false);
    }
  };

  const backLink = isAdmin() ? "/dashboard-admin" : puedeAccederDashboard() ? "/dashboard-rector" : "/dashboard";

  const firmadas = respuestas.filter((r) => r.fecha_firma);
  const noFirmadas = respuestas.filter((r) => !r.fecha_firma);

  const nombrePersona = (r: RespuestaRow) =>
    `${r.destinatario_apellidos || ""} ${r.destinatario_nombre || ""}`.trim() || r.destinatario_id;
  const refEstudiante = (r: RespuestaRow | MioRow) =>
    r.estudiante_nombre || r.estudiante_apellidos
      ? `${r.estudiante_apellidos || ""} ${r.estudiante_nombre || ""}`.trim() +
        (r.estudiante_grado ? ` (${r.estudiante_grado}${r.estudiante_salon ? " " + r.estudiante_salon : ""})` : "")
      : "";

  return (
    <div className="min-h-screen bg-background">
      <HeaderNormi backLink={backLink} />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Button onClick={() => navigate(backLink)} variant="outline" size="sm">← Volver</Button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardSignature className="h-6 w-6 text-primary" />
            Comunicados con firma
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b flex-wrap">
          {esEmisor && (
            <>
              <button
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${tab === "enviar" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setTab("enviar")}
              >
                <Send className="h-4 w-4 inline mr-1" /> Enviar
              </button>
              <button
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${tab === "enviados" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setTab("enviados")}
              >
                Enviados
              </button>
            </>
          )}
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${tab === "porfirmar" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab("porfirmar")}
          >
            <PenLine className="h-4 w-4 inline mr-1" /> Por firmar
          </button>
        </div>

        {/* ── ENVIAR ── */}
        {tab === "enviar" && esEmisor && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Comunicado</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="mensaje">Mensaje (se envía completo por WhatsApp y se muestra al firmar)</Label>
                  <Textarea
                    id="mensaje"
                    placeholder="Escribe el comunicado completo. La persona lo verá igual al abrir el link y deberá firmar para confirmar que lo leyó."
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    rows={8}
                  />
                </div>
                <div>
                  <input ref={fileRef} type="file" multiple onChange={handleArchivos} className="hidden" />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Paperclip className="h-4 w-4 mr-1" /> Adjuntar archivo
                  </Button>
                  {archivos.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {archivos.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm bg-muted/40 rounded px-2 py-1">
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{a.name}</span>
                          <button onClick={() => setArchivos((prev) => prev.filter((_, idx) => idx !== i))}>
                            <X className="h-4 w-4 text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Destinatarios</CardTitle>
              </CardHeader>
              <CardContent>
                <DestinatariosSelector key={selectorKey} initial={emptyDestinatariosValue()} onChange={setDest} />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleEnviar} disabled={enviando}>
                <Send className="h-4 w-4 mr-1" /> {enviando ? "Enviando..." : "Enviar y solicitar firma"}
              </Button>
            </div>
          </div>
        )}

        {/* ── ENVIADOS ── */}
        {tab === "enviados" && esEmisor && (
          <div className="space-y-3">
            {loadingEnviados ? (
              <div className="text-center py-8 text-muted-foreground">Cargando...</div>
            ) : enviados.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                Todavía no has enviado comunicados con firma.
              </div>
            ) : (
              enviados.map((c) => (
                <Card key={c.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => abrirDetalle(c)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> {fmtFecha(c.fecha)}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={c.firmadas >= c.total && c.total > 0 ? "secondary" : "default"} className={c.firmadas >= c.total && c.total > 0 ? "bg-green-100 text-green-800 border border-green-300" : "bg-amber-500"}>
                          {c.firmadas}/{c.total} firmadas
                        </Badge>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }} title="Eliminar">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    </div>
                    {c.destinatarios_label && (
                      <p className="text-xs text-muted-foreground mt-1"><strong>Para:</strong> {c.destinatarios_label}</p>
                    )}
                    <p className="text-sm text-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{c.mensaje}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* ── POR FIRMAR ── */}
        {tab === "porfirmar" && (
          <div className="space-y-3">
            {loadingMios ? (
              <div className="text-center py-8 text-muted-foreground">Cargando...</div>
            ) : mios.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                No tienes comunicados para firmar.
              </div>
            ) : (
              mios.map((m) => {
                const firmado = !!m.fecha_firma;
                const est = refEstudiante(m);
                return (
                  <Card
                    key={m.respuesta_id}
                    className={`cursor-pointer hover:border-primary transition-colors ${!firmado ? "border-primary border-2" : ""}`}
                    onClick={() => setFirmando(m)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {firmado ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 border border-green-300">
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Firmada
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500 hover:bg-amber-600">Pendiente por firmar</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{m.comunicado ? fmtFecha(m.comunicado.fecha) : ""}</span>
                      </div>
                      {est && <p className="text-xs text-muted-foreground mt-1">Acudiente de: <strong>{est}</strong></p>}
                      <p className="text-sm text-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{m.comunicado?.mensaje}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {m.comunicado?.creado_por_cargo === "Administrador" ? "Normi" : (m.comunicado?.remitente || "")}
                      </p>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── DETALLE Enviado (Firmada / No firmada) ── */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle>Seguimiento de firmas</DialogTitle>
              </DialogHeader>
              <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap mb-2">{detalle.mensaje}</div>
              {detalle.archivo_url && detalle.archivo_url.split("\n").filter(Boolean).map((url, i) => (
                <button key={i} onClick={() => abrirArchivo(url)} className="text-xs text-primary hover:underline flex items-center gap-1 mb-2">
                  <FileText className="h-3.5 w-3.5" /> {nombreArchivo(url)}
                </button>
              ))}
              <div className="flex gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => handleReenviar(detalle)}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Reenviar a los que faltan
                </Button>
              </div>
              {loadingDetalle ? (
                <div className="text-center py-6 text-muted-foreground">Cargando...</div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-green-700 flex items-center gap-1 mb-2">
                      <CheckCircle2 className="h-4 w-4" /> Firmada ({firmadas.length})
                    </h3>
                    {firmadas.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nadie ha firmado todavía.</p>
                    ) : (
                      <div className="space-y-1">
                        {firmadas.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-2 text-sm border rounded px-2 py-1.5">
                            <div className="min-w-0">
                              <span className="font-medium">{nombrePersona(r)}</span>
                              {refEstudiante(r) && <span className="text-xs text-muted-foreground"> — acudiente de {refEstudiante(r)}</span>}
                              <div className="text-xs text-muted-foreground">{r.fecha_firma ? fmtFecha(r.fecha_firma) : ""}</div>
                            </div>
                            {r.firma_url && (
                              <a href={r.firma_url} target="_blank" rel="noreferrer" className="shrink-0">
                                <img src={r.firma_url} alt="firma" className="h-10 border rounded bg-white" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-amber-700 flex items-center gap-1 mb-2">
                      <Clock className="h-4 w-4" /> No firmada ({noFirmadas.length})
                    </h3>
                    {noFirmadas.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Todos firmaron. 🎉</p>
                    ) : (
                      <div className="space-y-1">
                        {noFirmadas.map((r) => (
                          <div key={r.id} className="text-sm border rounded px-2 py-1.5">
                            <span className="font-medium">{nombrePersona(r)}</span>
                            {refEstudiante(r) && <span className="text-xs text-muted-foreground"> — acudiente de {refEstudiante(r)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirmar eliminación ── */}
      <Dialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar comunicado con firma</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Se borrará el comunicado y todo su registro de firmas. Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleEliminar}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Firmar / Ver comunicado (receptor) ── */}
      <Dialog open={!!firmando} onOpenChange={(o) => !o && setFirmando(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {firmando && (
            <>
              <DialogHeader>
                <DialogTitle>{firmando.fecha_firma ? "Comunicado firmado" : "Leer y firmar"}</DialogTitle>
              </DialogHeader>
              {refEstudiante(firmando) && (
                <p className="text-xs text-muted-foreground">Acudiente de: <strong>{refEstudiante(firmando)}</strong></p>
              )}
              <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">{firmando.comunicado?.mensaje}</div>
              {firmando.comunicado?.archivo_url && firmando.comunicado.archivo_url.split("\n").filter(Boolean).map((url, i) => (
                <button key={i} onClick={() => abrirArchivo(url)} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> {nombreArchivo(url)}
                </button>
              ))}

              {firmando.fecha_firma ? (
                <div className="border rounded-md p-3 bg-green-50">
                  <p className="text-sm text-green-800 flex items-center gap-1 mb-2">
                    <CheckCircle2 className="h-4 w-4" /> Firmaste el {fmtFecha(firmando.fecha_firma)}
                  </p>
                  {firmando.firma_url && <img src={firmando.firma_url} alt="Tu firma" className="h-20 border rounded bg-white" />}
                  <p className="text-xs text-muted-foreground mt-1">Una vez firmado, no se puede modificar.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm">Dibuja tu firma con el dedo:</Label>
                  <div className="border rounded-md bg-white">
                    <SignatureCanvas ref={sigRef} penColor="black" canvasProps={{ className: "w-full touch-none", style: { height: "180px" } }} />
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="ghost" size="sm" onClick={() => sigRef.current?.clear()}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Borrar
                    </Button>
                    <Button onClick={handleFirmar} disabled={guardandoFirma}>
                      <PenLine className="h-4 w-4 mr-1" /> {guardandoFirma ? "Guardando..." : "Firmar"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Puedes corregirla con "Borrar" antes de confirmar. Al firmar quedará bloqueada.</p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
