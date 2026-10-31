import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, Download, Loader2, RotateCcw, Table2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import HeaderNormi from "@/components/HeaderNormi";
import BreadcrumbDeslizable from "@/components/BreadcrumbDeslizable";
import { getSession } from "@/hooks/useSession";
import { apiRequest } from "@/lib/apiClient";
import normiImg from "@/assets/normi-guia.png";

// "Pregúntale a Normi" (Estadísticas): el directivo pregunta en lenguaje natural
// y Normi responde con datos del colegio (servidor: /api/estadisticas/chat, que
// consulta la base solo-lectura por las vistas del esquema chat). Por ahora para
// rectoría, coordinación (solo sus niveles) y administración.

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

const SUGERENCIAS = [
  "¿Qué estudiantes perdieron una sola asignatura en el primer periodo?",
  "¿Cuál es el promedio de cada grado en el periodo actual?",
  "¿Qué asignatura tiene más estudiantes perdiendo?",
  "¿Qué estudiantes tienen más faltas sin excusa este mes?",
  "Compara los salones de Séptimo en Matemáticas",
  "¿Cuántos estudiantes hay por nivel?",
];

const COLORES = ["#16a34a", "#0ea5e9", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#ec4899", "#64748b"];

const claveAlmacen = () => `chat_estadisticas_${getSession().id || ""}`;

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

async function descargarExcel(t: Tabla) {
  const ExcelJS = (await import("exceljs")).default;
  const { saveAs } = await import("file-saver");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Resultado");
  ws.addRow([t.titulo]).font = { bold: true, size: 13 };
  ws.addRow([]);
  const enc = ws.addRow(t.columnas);
  enc.font = { bold: true, color: { argb: "FFFFFFFF" } };
  enc.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } }; });
  for (const f of t.filas) ws.addRow(t.columnas.map((c) => { const v = f[c]; return typeof v === "number" ? v : valorCelda(v); }));
  t.columnas.forEach((c, i) => {
    const largo = Math.max(c.length, ...t.filas.slice(0, 300).map((f) => valorCelda(f[c]).length));
    ws.getColumn(i + 1).width = Math.min(largo + 4, 50);
  });
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `${t.titulo.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "Resultado"}.xlsx`);
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
  const [bajando, setBajando] = useState(false);
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
          <button
            type="button"
            data-guia="estadisticas.chat_excel"
            disabled={bajando}
            onClick={async () => { setBajando(true); try { await descargarExcel(t); } finally { setBajando(false); } }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline shrink-0 disabled:opacity-50"
          >
            {bajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Excel
          </button>
        )}
      </div>
      {t.grafica && t.filas.length > 0 && <div className="px-2 pt-4 pb-2 border-b border-border"><GraficaTabla t={t} /></div>}
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
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(claveAlmacen()) || "[]"); } catch { return []; }
  });
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nombre = (getSession().nombres || "").split(" ")[0];

  useEffect(() => {
    if (!ROLES_CHAT_ESTADISTICAS.includes(getSession().cargo || "")) navigate("/estadisticas", { replace: true });
  }, [navigate]);

  useEffect(() => {
    try { sessionStorage.setItem(claveAlmacen(), JSON.stringify(mensajes.slice(-30))); } catch { /* noop */ }
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, pensando]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  const enviar = async (pregunta: string) => {
    const p = pregunta.trim();
    if (!p || pensando) return;
    const historial = mensajes.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMensajes((ms) => [...ms, { role: "user", content: p }]);
    setTexto("");
    setPensando(true);
    try {
      const r = await apiRequest<{ respuesta: string; tablas: Tabla[] }>("/api/estadisticas/chat", {
        method: "POST",
        body: JSON.stringify({ mensaje: p, historial }),
      });
      setMensajes((ms) => [...ms, { role: "assistant", content: r.respuesta, tablas: r.tablas }]);
    } catch {
      setMensajes((ms) => [...ms, { role: "assistant", content: "No pude responder en este momento. Intenta de nuevo en unos segundos.", error: true }]);
    } finally {
      setPensando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/estadisticas" />
      <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col max-w-4xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6 flex items-center justify-between gap-3">
          <BreadcrumbDeslizable>
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <button onClick={() => navigate("/estadisticas")} className="text-primary hover:underline">Estadísticas</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Pregúntale a Normi</span>
          </BreadcrumbDeslizable>
          {mensajes.length > 0 && (
            <button
              type="button"
              data-guia="estadisticas.chat_nueva"
              onClick={() => { setMensajes([]); inputRef.current?.focus(); }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground shrink-0"
            >
              <RotateCcw className="w-4 h-4" /> Nueva conversación
            </button>
          )}
        </div>

        <div className="flex-1 bg-card rounded-lg shadow-soft flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {mensajes.length === 0 ? (
              <div className="flex flex-col items-center text-center pt-4 md:pt-8">
                <img src={normiImg} alt="Normi" className="w-28 h-28 object-contain mb-4" />
                <h1 className="text-2xl font-bold text-foreground">Pregúntale a Normi</h1>
                <p className="text-muted-foreground mt-2 max-w-md">
                  {nombre ? `${nombre}, pregúntame` : "Pregúntame"} lo que quieras saber de notas, asistencia o convivencia del colegio.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-8 w-full max-w-2xl" data-guia="estadisticas.chat_sugerencias">
                  {SUGERENCIAS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => enviar(s)}
                      className="text-left text-sm px-4 py-3 rounded-xl border border-border bg-background hover:border-primary hover:bg-primary/5 transition-colors"
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
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 whitespace-pre-wrap">{m.content}</div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-3">
                    <img src={normiImg} alt="" className="w-9 h-9 rounded-full object-cover bg-primary/10 shrink-0" />
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
                <img src={normiImg} alt="" className="w-9 h-9 rounded-full object-cover bg-primary/10 shrink-0" />
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

          <form
            onSubmit={(e) => { e.preventDefault(); enviar(texto); }}
            className="border-t border-border p-3 md:p-4"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <textarea
                ref={inputRef}
                data-guia="estadisticas.chat_input"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }}
                rows={1}
                autoFocus
                placeholder="Escribe tu pregunta"
                className="flex-1 resize-none bg-transparent outline-none py-1.5 text-[15px] max-h-40"
              />
              <button
                type="submit"
                data-guia="estadisticas.chat_enviar"
                disabled={!texto.trim() || pensando}
                aria-label="Enviar"
                className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 shrink-0"
              >
                {pensando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default ChatEstadisticas;
