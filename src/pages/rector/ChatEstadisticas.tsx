import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUp, Download, Loader2, MoreHorizontal, PanelLeft, Pencil, Pin, PinOff, Plus, Table2, Trash2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import HeaderNormi from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { getSession } from "@/hooks/useSession";
import { apiRequest, apiDescargar } from "@/lib/apiClient";
import { precargarSonidoRespuesta, reproducirSonidoRespuesta } from "@/lib/sonidoRespuesta";
import DictadoMic from "@/components/DictadoMic";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import normiAvatar from "@/assets/normi-avatar.webp";
import normiPresenta from "@/assets/normi-presenta.webp";

// "Pregúntale a Normi" (entrada en el tablero, antes de "¿Qué deseas consultar?"): el directivo pregunta en lenguaje natural
// y Normi responde con datos del colegio (servidor: /api/estadisticas/chat, que
// consulta la base solo-lectura por las vistas del esquema chat). Por ahora para
// rectoría, coordinación (solo sus niveles) y administración. Las conversaciones se
// guardan en el servidor (barra lateral, como en los chats de los grandes modelos);
// el micrófono es el mismo de Enviar Comunicado (DictadoMic).

export const ROLES_CHAT_ESTADISTICAS = ["Rector", "Coordinador(a)", "Administrador"];

interface Grafica { tipo: "barras" | "lineas" | "torta"; x: string; y: string }
interface Tabla {
  titulo: string;
  columnas: string[];
  filas: Record<string, unknown>[];
  total: number;
  recortado: boolean;
  grafica?: Grafica | null;
}
interface Mensaje {
  role: "user" | "assistant";
  content: string;
  tablas?: Tabla[];
  error?: boolean;
}
interface ConversacionLite { id: string; titulo: string; actualizado_at: string; fijada?: boolean }

/** Fijadas primero; luego de la más reciente a la más antigua. */
const ordenar = (cs: ConversacionLite[]) =>
  [...cs].sort((a, b) => Number(!!b.fijada) - Number(!!a.fijada) || b.actualizado_at.localeCompare(a.actualizado_at));

/** Agrupa las conversaciones por fecha, como en los chats de los grandes modelos. */
function grupoFecha(iso: string): string {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(iso); dia.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy.getTime() - dia.getTime()) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 7) return "Últimos 7 días";
  if (dias < 30) return "Últimos 30 días";
  return "Anteriores";
}

const SUGERENCIAS = [
  "¿Qué estudiantes perdieron una sola asignatura en el primer periodo?",
  "¿Cuál es el promedio de cada grado en el periodo actual?",
  "¿Qué asignatura tiene más estudiantes perdiendo?",
  "¿Qué estudiantes tienen más faltas sin excusa este mes?",
  "Compara los salones de Séptimo en Matemáticas",
  "¿Quiénes son los profesores de Matemáticas de todo el colegio?",
];

const COLORES = ["#16a34a", "#0ea5e9", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#ec4899", "#64748b"];

/** Negritas (**x**), listas con "- " y párrafos. Suficiente para las respuestas de Normi. */
function TextoNormi({ texto }: { texto: string }) {
  const negritas = (linea: string): ReactNode[] =>
    linea.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
      parte.startsWith("**") && parte.endsWith("**") ? <strong key={i} className="font-semibold text-foreground">{parte.slice(2, -2)}</strong> : <span key={i}>{parte}</span>,
    );
  const bloques: ReactNode[] = [];
  let lista: string[] = [];
  const cerrarLista = () => {
    if (lista.length) {
      bloques.push(
        <ul key={`l${bloques.length}`} className="space-y-1 pl-1">
          {lista.map((li, i) => (
            <li key={i} className="flex gap-2"><span className="text-primary mt-[0.55em] h-1.5 w-1.5 rounded-full bg-primary shrink-0" /><span>{negritas(li)}</span></li>
          ))}
        </ul>,
      );
      lista = [];
    }
  };
  for (const linea of texto.split("\n")) {
    const l = linea.trim();
    if (/^[-*•]\s+/.test(l)) { lista.push(l.replace(/^[-*•]\s+/, "")); continue; }
    cerrarLista();
    if (l) bloques.push(<p key={`p${bloques.length}`}>{negritas(l)}</p>);
  }
  cerrarLista();
  return <div className="space-y-2 leading-relaxed">{bloques}</div>;
}

function valorCelda(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) {
    const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  }
  return String(v);
}

type Formato = "excel" | "pdf" | "word";
const EXT: Record<Formato, string> = { excel: "xlsx", pdf: "pdf", word: "docx" };

/** El servidor arma el archivo (mismo formato que los que Normi manda por WhatsApp). */
async function descargarArchivo(t: Tabla, formato: Formato) {
  const blob = await apiDescargar("/api/estadisticas/chat/archivo", { formato, titulo: t.titulo, columnas: t.columnas, filas: t.filas });
  const { saveAs } = await import("file-saver");
  saveAs(blob, `${t.titulo.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "Resultado"}.${EXT[formato]}`);
}

function GraficaTabla({ t }: { t: Tabla }) {
  const g = t.grafica!;
  const datos = t.filas.slice(0, 40).map((f) => ({ x: valorCelda(f[g.x]), y: Number(f[g.y]) || 0 }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {g.tipo === "torta" ? (
          <PieChart>
            <Pie data={datos} dataKey="y" nameKey="x" outerRadius="80%" label={(d) => `${d.x}: ${d.y}`}>
              {datos.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : g.tipo === "lineas" ? (
          <LineChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="x" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => [v, g.y]} />
            <Line type="monotone" dataKey="y" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        ) : (
          <BarChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="x" tick={{ fontSize: 11 }} interval={0} angle={datos.length > 6 ? -30 : 0} textAnchor={datos.length > 6 ? "end" : "middle"} height={datos.length > 6 ? 70 : 30} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => [v, g.y]} />
            <Bar dataKey="y" fill="#16a34a" radius={[6, 6, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function TablaResultado({ t }: { t: Tabla }) {
  const [bajando, setBajando] = useState<Formato | null>(null);
  const [fallo, setFallo] = useState(false);
  const bajar = async (f: Formato) => {
    setBajando(f); setFallo(false);
    try { await descargarArchivo(t, f); } catch { setFallo(true); } finally { setBajando(null); }
  };
  return (
    <div className="mt-3 rounded-xl border border-border bg-background overflow-hidden" data-guia="estadisticas.chat_tabla">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <Table2 className="w-4 h-4 text-primary shrink-0" />
          <span className="font-semibold text-sm text-foreground truncate">{t.titulo}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {t.recortado ? `${t.filas.length} de ${t.total}` : t.total} {t.total === 1 ? "fila" : "filas"}
          </span>
        </div>
        {t.filas.length > 0 && (
          <div className="flex items-center gap-3 shrink-0" data-guia="estadisticas.chat_excel">
            {fallo && <span className="text-xs text-destructive">No se pudo descargar</span>}
            {(["excel", "pdf", "word"] as Formato[]).map((f) => (
              <button
                key={f}
                type="button"
                disabled={!!bajando}
                onClick={() => bajar(f)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {bajando === f ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {f === "excel" ? "Excel" : f === "pdf" ? "PDF" : "Word"}
              </button>
            ))}
          </div>
        )}
      </div>
      {t.grafica && t.filas.length >= 2 && t.filas.length <= 20 && new Set(t.filas.map((f) => Number(f[t.grafica!.y]))).size > 1 && <div className="px-2 pt-4 pb-2 border-b border-border"><GraficaTabla t={t} /></div>}
      {t.filas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">Sin resultados.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr>
                {t.columnas.map((c) => (
                  <th key={c} className={`bg-primary text-primary-foreground font-semibold px-3 py-2 whitespace-nowrap ${typeof t.filas[0]?.[c] === "number" ? "text-right" : "text-left"}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.filas.map((f, i) => (
                <tr key={i} className={i % 2 ? "bg-muted/30" : ""}>
                  {t.columnas.map((c) => (
                    <td key={c} className={`px-3 py-2 border-b border-border/60 ${typeof f[c] === "number" ? "text-right tabular-nums" : ""}`}>{valorCelda(f[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ChatEstadisticas = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const actualId = searchParams.get("c");
  const [conversaciones, setConversaciones] = useState<ConversacionLite[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargandoConv, setCargandoConv] = useState(false);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [panelMovil, setPanelMovil] = useState(false);
  const [borrar, setBorrar] = useState<ConversacionLite | null>(null);
  const [renombrar, setRenombrar] = useState<ConversacionLite | null>(null);
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Evita recargar desde el servidor la conversación que se acaba de crear al responder.
  const recienCreada = useRef<string | null>(null);
  const nombre = (getSession().nombres || "").split(" ")[0];

  useEffect(() => {
    if (!ROLES_CHAT_ESTADISTICAS.includes(getSession().cargo || "")) navigate("/dashboard", { replace: true });
    precargarSonidoRespuesta();
  }, [navigate]);

  const cargarLista = useCallback(async () => {
    try {
      const r = await apiRequest<{ conversaciones: ConversacionLite[] }>("/api/estadisticas/chat/conversaciones");
      setConversaciones(r.conversaciones || []);
    } catch { /* sin red: la lista queda como estaba */ }
    finally { setCargandoLista(false); }
  }, []);
  useEffect(() => { cargarLista(); }, [cargarLista]);

  // Abrir la conversación elegida (o empezar en blanco).
  useEffect(() => {
    if (!actualId) { setMensajes([]); return; }
    if (recienCreada.current === actualId) { recienCreada.current = null; return; }
    let vivo = true;
    setCargandoConv(true);
    apiRequest<{ mensajes: Mensaje[] }>(`/api/estadisticas/chat/conversaciones/${actualId}`)
      .then((r) => { if (vivo) setMensajes(r.mensajes || []); })
      .catch(() => { if (vivo) { setMensajes([]); setSearchParams({}, { replace: true }); } })
      .finally(() => { if (vivo) setCargandoConv(false); });
    return () => { vivo = false; };
  }, [actualId, setSearchParams]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, pensando]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  const nueva = () => {
    setSearchParams({});
    setMensajes([]);
    setPanelMovil(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const abrir = (id: string) => {
    if (id !== actualId) setSearchParams({ c: id });
    setPanelMovil(false);
  };

  const fijar = async (c: ConversacionLite) => {
    const fijada = !c.fijada;
    setConversaciones((cs) => ordenar(cs.map((x) => (x.id === c.id ? { ...x, fijada } : x))));
    try {
      await apiRequest(`/api/estadisticas/chat/conversaciones/${c.id}`, { method: "PATCH", body: JSON.stringify({ fijada }) });
    } catch { cargarLista(); }
  };

  const guardarNombre = async () => {
    const c = renombrar;
    const titulo = nuevoTitulo.replace(/\s+/g, " ").trim();
    if (!c || !titulo) return;
    setRenombrar(null);
    setConversaciones((cs) => cs.map((x) => (x.id === c.id ? { ...x, titulo } : x)));
    try {
      await apiRequest(`/api/estadisticas/chat/conversaciones/${c.id}`, { method: "PATCH", body: JSON.stringify({ titulo }) });
    } catch { cargarLista(); }
  };

  const confirmarBorrar = async () => {
    const c = borrar;
    setBorrar(null);
    if (!c) return;
    setConversaciones((cs) => cs.filter((x) => x.id !== c.id));
    if (c.id === actualId) nueva();
    try { await apiRequest(`/api/estadisticas/chat/conversaciones/${c.id}`, { method: "DELETE" }); } catch { cargarLista(); }
  };

  const enviar = async (pregunta: string) => {
    const p = pregunta.trim();
    if (!p || pensando) return;
    setMensajes((ms) => [...ms, { role: "user", content: p }]);
    setTexto("");
    setPensando(true);
    try {
      // La memoria la arma el servidor con la conversación guardada (últimas 20 intervenciones).
      const r = await apiRequest<{ respuesta: string; tablas: Tabla[]; conversacion_id: string | null; titulo: string }>("/api/estadisticas/chat", {
        method: "POST",
        body: JSON.stringify({ mensaje: p, conversacion_id: actualId }),
      });
      setMensajes((ms) => [...ms, { role: "assistant", content: r.respuesta, tablas: r.tablas }]);
      reproducirSonidoRespuesta();
      if (r.conversacion_id) {
        const ahora = new Date().toISOString();
        setConversaciones((cs) => {
          const previa = cs.find((x) => x.id === r.conversacion_id);
          return ordenar([{ id: r.conversacion_id!, titulo: previa?.titulo || r.titulo, actualizado_at: ahora, fijada: previa?.fijada }, ...cs.filter((x) => x.id !== r.conversacion_id)]);
        });
        if (r.conversacion_id !== actualId) { recienCreada.current = r.conversacion_id; setSearchParams({ c: r.conversacion_id }, { replace: true }); }
      }
    } catch {
      setMensajes((ms) => [...ms, { role: "assistant", content: "No pude responder en este momento. Intenta de nuevo en unos segundos.", error: true }]);
    } finally {
      setPensando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // Lista de conversaciones agrupada por fecha (barra lateral en PC y panel en el celular).
  const listaConversaciones = (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <button
          type="button"
          data-guia="estadisticas.chat_nueva"
          onClick={nueva}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-background hover:border-primary hover:bg-primary/5 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4 text-primary" /> Nueva conversación
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3" data-guia="estadisticas.chat_conversaciones">
        {cargandoLista ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : conversaciones.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Aquí aparecerán tus conversaciones.</p>
        ) : (
          conversaciones.map((c, i) => {
            const grupo = (x: ConversacionLite) => (x.fijada ? "Fijadas" : grupoFecha(x.actualizado_at));
            const g = grupo(c);
            const nuevoGrupo = i === 0 || grupo(conversaciones[i - 1]) !== g;
            return (
              <div key={c.id}>
                {nuevoGrupo && <div className="px-3 pt-4 pb-1 text-xs font-semibold text-muted-foreground">{g}</div>}
                <div className={`group flex items-center rounded-lg ${c.id === actualId ? "bg-primary/10 text-foreground" : "hover:bg-muted/60 text-foreground/80"}`}>
                  <button type="button" onClick={() => abrir(c.id)} className="flex-1 min-w-0 text-left px-3 py-2 text-sm truncate" title={c.titulo}>
                    {c.titulo}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Opciones de la conversación"
                        data-guia="estadisticas.chat_menu_conversacion"
                        className="p-1.5 mr-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48 bg-background z-50">
                      <DropdownMenuItem onClick={() => fijar(c)} className="gap-2">
                        {c.fijada ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                        {c.fijada ? "Desfijar" : "Fijar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setNuevoTitulo(c.titulo); setRenombrar(c); }} className="gap-2">
                        <Pencil className="w-4 h-4" /> Cambiar nombre
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setBorrar(c)} className="gap-2 text-destructive focus:text-destructive">
                        <Trash2 className="w-4 h-4" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <HeaderNormi backLink="/dashboard" />
      <div className="flex-1 min-h-0 flex">
        {/* Barra lateral de conversaciones (PC) */}
        <aside className="hidden md:flex w-72 shrink-0 flex-col border-r border-border bg-card/60">
          {listaConversaciones}
        </aside>

        {/* Panel de conversaciones (celular) */}
        <Sheet open={panelMovil} onOpenChange={setPanelMovil}>
          <SheetContent side="left" className="w-80 p-0 pt-10">
            <SheetTitle className="sr-only">Conversaciones</SheetTitle>
            {listaConversaciones}
          </SheetContent>
        </Sheet>

        <section className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 px-4 md:px-8 py-3 border-b border-border bg-card/40">
            <button type="button" onClick={() => setPanelMovil(true)} aria-label="Conversaciones" data-guia="estadisticas.chat_panel_movil" className="md:hidden p-1.5 -ml-1 rounded hover:bg-muted text-muted-foreground">
              <PanelLeft className="w-5 h-5" />
            </button>
            <BreadcrumbDeslizable>
              <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground font-medium">Pregúntale a Normi</span>
            </BreadcrumbDeslizable>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-4xl px-4 md:px-6 py-6 space-y-6">
              {cargandoConv ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : mensajes.length === 0 ? (
                <div className="flex flex-col items-center text-center pt-4 md:pt-10">
                  <img src={normiPresenta} alt="Normi" className="w-40 h-40 object-contain mb-2" />
                  <h1 className="text-2xl font-bold text-foreground">Pregúntale a Normi</h1>
                  <p className="text-muted-foreground mt-2 max-w-md">
                    {nombre ? `${nombre}, pregúntame` : "Pregúntame"} lo que quieras saber del colegio.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-8 w-full max-w-5xl" data-guia="estadisticas.chat_sugerencias">
                    {SUGERENCIAS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => enviar(s)}
                        className="text-left text-sm px-4 py-3 rounded-xl border border-border bg-card hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                mensajes.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-primary/10 text-foreground px-4 py-2.5 whitespace-pre-wrap">{m.content}</div>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-3">
                      <img src={normiAvatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                      <div className={`min-w-0 flex-1 text-[15px] ${m.error ? "text-destructive" : "text-foreground/90"}`}>
                        <TextoNormi texto={m.content} />
                        {m.tablas?.map((t, j) => <TablaResultado key={j} t={t} />)}
                      </div>
                    </div>
                  ),
                )
              )}
              {pensando && (
                <div className="flex gap-3 items-center">
                  <img src={normiAvatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                    </span>
                    Consultando los datos del colegio
                  </div>
                </div>
              )}
              <div ref={finRef} />
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); enviar(texto); }} className="px-4 md:px-6 pb-4 pt-2">
            <div className="mx-auto w-full max-w-4xl flex items-end gap-2 rounded-2xl border border-border bg-background shadow-sm px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <textarea
                ref={inputRef}
                data-guia="estadisticas.chat_input"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }}
                rows={1}
                autoFocus
                placeholder="Escribe o dicta tu pregunta"
                className="flex-1 resize-none bg-transparent outline-none py-2 text-[15px] max-h-40"
              />
              <div className="shrink-0" data-guia="estadisticas.chat_microfono">
                <DictadoMic valor={texto} setValor={setTexto} />
              </div>
              <button
                type="submit"
                data-guia="estadisticas.chat_enviar"
                disabled={!texto.trim() || pensando}
                aria-label="Enviar"
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 shrink-0"
              >
                {pensando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </section>
      </div>

      <Dialog open={!!renombrar} onOpenChange={(o) => { if (!o) setRenombrar(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar nombre</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); guardarNombre(); }}>
            <Input value={nuevoTitulo} onChange={(e) => setNuevoTitulo(e.target.value)} maxLength={120} autoFocus />
            <DialogFooter className="mt-4 gap-2">
              <Button type="button" variant="outline" onClick={() => setRenombrar(null)}>Cancelar</Button>
              <Button type="submit" disabled={!nuevoTitulo.trim()}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!borrar} onOpenChange={(o) => { if (!o) setBorrar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta conversación?</AlertDialogTitle>
            <AlertDialogDescription>«{borrar?.titulo}» se eliminará y no se puede recuperar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarBorrar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatEstadisticas;
