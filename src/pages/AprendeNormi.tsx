import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import normiImg from "@/assets/normi-placeholder.webp";
import { Check, Lock, Star, ArrowLeft, Download, Plus, MoreVertical, History } from "lucide-react";

/**
 * "Aprende con Normi" — tutorial jugable por cargo (Fase 1: PROFESOR, solo
 * colegio Cailico de demo). Ficha propia con un mapa de misiones; cada misión
 * enseña UNA ficha real usando una maqueta interactiva (datos de juguete,
 * cero riesgo) + retos de "toca dónde lo harías" + mini-quiz final.
 * Progreso en localStorage por usuario (Fase 2: tabla Misiones_Progreso).
 */

// ── Tipos del guion ──────────────────────────────────────────────
type Reto = { instruccion: string; target: string; pista: string; logro: string };
type PreguntaQuiz = { pregunta: string; opciones: string[]; correcta: number };
type Mision = {
  id: string; nombre: string; emoji: string; descripcion: string;
  intro: string; retos: Reto[]; quiz: PreguntaQuiz[];
};

// ── Guion del PROFESOR (Fase 1: Notas y Asistencia) ─────────────
const MISIONES_PROFESOR: Mision[] = [
  {
    id: "notas",
    nombre: "Notas",
    emoji: "📝",
    descripcion: "Crea actividades, califica y descarga tus planillas.",
    intro: "¡Esta es tu tabla de notas! Aquí calificas a tus estudiantes. Cada columna es una actividad y cada fila un estudiante. Te voy a poner unos retos para que la domines. 💪",
    retos: [
      {
        instruccion: "Reto 1: Quieres crear una actividad nueva (un quiz, un taller…). ¿Dónde tocarías?",
        target: "btn-mas",
        pista: "Busca el botón + al final de las columnas de actividades.",
        logro: "¡Eso! Con el + creas actividades y también grupos de notas. Si lo dejas presionado salen más opciones.",
      },
      {
        instruccion: "Reto 2: Ana sacó 4.5 en el Quiz. Toca su celda para ponerle la nota.",
        target: "celda-ana-quiz",
        pista: "La celda vacía en la fila de Ana, columna Quiz.",
        logro: "¡Perfecto! Tocas la celda, escribes la nota y das Enter. Así de fácil se califica.",
      },
      {
        instruccion: "Reto 3: Necesitas la planilla en Excel para la reunión. ¿Dónde la descargas?",
        target: "btn-excel",
        pista: "Arriba a la derecha están los botones de descarga.",
        logro: "¡Correcto! También puedes descargar en PDF, ahí al lado.",
      },
      {
        instruccion: "Reto 4: La nota de Carlos tiene un puntico naranja. ¿Qué harías para leer el comentario del profesor?",
        target: "punto-comentario",
        pista: "Toca el puntico naranja sobre la nota de Carlos.",
        logro: "¡Muy bien! El punto naranja indica que la nota tiene un comentario — al tocarlo se abre.",
      },
    ],
    quiz: [
      {
        pregunta: "¿Qué significa el puntico naranja sobre una nota?",
        opciones: ["Que la nota está perdida", "Que la nota tiene un comentario", "Que falta calificar"],
        correcta: 1,
      },
      {
        pregunta: "¿Con qué botón creas una actividad nueva?",
        opciones: ["El botón +", "El botón Descargar Excel", "El menú ⋯"],
        correcta: 0,
      },
    ],
  },
  {
    id: "asistencia",
    nombre: "Asistencia",
    emoji: "🙋",
    descripcion: "Pasa lista en segundos y consulta el historial.",
    intro: "¡Aquí pasas la asistencia de tu clase! Cada estudiante tiene sus botones: presente ✓ o ausente ✗. Cuando marcas un ausente, Normi le avisa al acudiente por WhatsApp automáticamente. 📲",
    retos: [
      {
        instruccion: "Reto 1: Juan llegó a clase. Márcalo presente.",
        target: "presente-juan",
        pista: "El botón verde ✓ en la tarjeta de Juan.",
        logro: "¡Listo! Juan quedó presente.",
      },
      {
        instruccion: "Reto 2: Carlos no vino hoy. Márcalo ausente.",
        target: "ausente-carlos",
        pista: "El botón rojo ✗ en la tarjeta de Carlos.",
        logro: "¡Eso es! Y ojo: al marcarlo ausente, el acudiente de Carlos recibe el aviso por WhatsApp al instante.",
      },
      {
        instruccion: "Reto 3: ¿Dónde consultas la asistencia de días anteriores?",
        target: "btn-historial",
        pista: "Busca el botón de Historial, arriba de la lista.",
        logro: "¡Correcto! En el historial ves y corriges la asistencia de cualquier fecha.",
      },
    ],
    quiz: [
      {
        pregunta: "¿Qué pasa cuando marcas a un estudiante como ausente?",
        opciones: ["Nada, solo queda guardado", "Se le avisa al acudiente por WhatsApp", "Se le baja la nota"],
        correcta: 1,
      },
      {
        pregunta: "Si te equivocaste pasando lista ayer, ¿qué haces?",
        opciones: ["Ya no se puede corregir", "Escribir un correo al rector", "Entrar al Historial y corregir la marca"],
        correcta: 2,
      },
    ],
  },
];

const PROXIMAMENTE = [
  { nombre: "Actividades", emoji: "📅" },
  { nombre: "Comunicados", emoji: "📣" },
  { nombre: "Permisos y Excusas", emoji: "📋" },
];

// ── Progreso (localStorage por usuario; Fase 2 → DB) ─────────────
type Progreso = Record<string, { estrellas: number }>;
const progKey = (uid: string) => `aprende_normi_prog_${uid}`;
const leerProgreso = (uid: string): Progreso => {
  try { return JSON.parse(localStorage.getItem(progKey(uid)) || "{}"); } catch { return {}; }
};
const guardarProgreso = (uid: string, p: Progreso) => {
  try { localStorage.setItem(progKey(uid), JSON.stringify(p)); } catch { /* noop */ }
};

// ── Elemento tocable de las maquetas ─────────────────────────────
// Cada zona tocable reporta su id; el jugador decide si era el objetivo.
const TargetCtx = { onTap: (_id: string) => {} };
const Target = ({ id, children, className = "" }: { id: string; children: React.ReactNode; className?: string }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); TargetCtx.onTap(id); }}
    className={className}
  >
    {children}
  </button>
);

// ── Maqueta: tabla de Notas (datos de juguete) ───────────────────
const MockNotas = ({ notaAna }: { notaAna: string | null }) => (
  <div className="bg-card border border-border rounded-lg p-3 md:p-4 shadow-sm select-none">
    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
      <span className="text-sm font-semibold text-foreground">Matemáticas — Sexto 1 · 1er Periodo</span>
      <div className="flex gap-2">
        <Target id="btn-excel" className="px-3 py-1.5 text-xs font-medium border border-border rounded-md bg-card hover:bg-secondary/50 flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> Descargar Excel
        </Target>
        <Target id="btn-pdf" className="px-3 py-1.5 text-xs font-medium border border-border rounded-md bg-card hover:bg-secondary/50 flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> PDF
        </Target>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm w-full min-w-[430px]">
        <thead>
          <tr>
            <th className="border border-border bg-primary text-primary-foreground px-3 py-2 text-left text-xs">Estudiante</th>
            <th className="border border-border bg-primary text-primary-foreground px-3 py-2 text-xs">Taller (30%)</th>
            <th className="border border-border bg-primary text-primary-foreground px-3 py-2 text-xs">Quiz (20%)</th>
            <th className="border border-border bg-primary/80 text-primary-foreground px-2 py-2 text-xs">
              <Target id="btn-mas" className="mx-auto w-7 h-7 rounded-full bg-card/20 hover:bg-card/40 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </Target>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-border px-3 py-2 font-medium">Ana Pérez</td>
            <td className="border border-border px-3 py-2 text-center">4.20</td>
            <td className="border border-border p-0 text-center">
              <Target id="celda-ana-quiz" className="w-full h-full px-3 py-2 hover:bg-muted/50">
                {notaAna ?? <span className="text-muted-foreground">—</span>}
              </Target>
            </td>
            <td className="border border-border" />
          </tr>
          <tr className="bg-muted/30">
            <td className="border border-border px-3 py-2 font-medium">Carlos Gómez</td>
            <td className="border border-border px-3 py-2 text-center relative">
              <span className="relative inline-block">
                3.80
                <Target id="punto-comentario" className="absolute -top-1.5 -right-3 p-1 -m-1">
                  <span className="block w-2 h-2 bg-amber-500 rounded-full" />
                </Target>
              </span>
            </td>
            <td className="border border-border px-3 py-2 text-center">4.00</td>
            <td className="border border-border" />
          </tr>
          <tr>
            <td className="border border-border px-3 py-2 font-medium">Luisa Díaz</td>
            <td className="border border-border px-3 py-2 text-center">4.90</td>
            <td className="border border-border px-3 py-2 text-center">4.60</td>
            <td className="border border-border" />
          </tr>
        </tbody>
      </table>
    </div>
    <div className="mt-2 text-right">
      <Target id="menu-puntos" className="p-1.5 rounded hover:bg-muted inline-flex">
        <MoreVertical className="w-4 h-4 text-muted-foreground" />
      </Target>
    </div>
  </div>
);

// ── Maqueta: Asistencia (datos de juguete) ───────────────────────
const MockAsistencia = ({ marcas }: { marcas: Record<string, "p" | "a"> }) => {
  const est = [
    { key: "juan", nombre: "Juan Rodríguez" },
    { key: "carlos", nombre: "Carlos Gómez" },
    { key: "maria", nombre: "María Torres" },
  ];
  return (
    <div className="bg-card border border-border rounded-lg p-3 md:p-4 shadow-sm select-none">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <span className="text-sm font-semibold text-foreground">Asistencia — Sexto 1 · hoy</span>
        <Target id="btn-historial" className="px-3 py-1.5 text-xs font-medium border border-border rounded-md bg-card hover:bg-secondary/50 flex items-center gap-1">
          <History className="w-3.5 h-3.5" /> Historial
        </Target>
      </div>
      <div className="space-y-2">
        {est.map((e) => (
          <div key={e.key} className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2.5 ${
            marcas[e.key] === "p" ? "border-emerald-300 bg-emerald-50" : marcas[e.key] === "a" ? "border-red-300 bg-red-50" : "border-border bg-background"
          }`}>
            <span className="text-sm font-medium text-foreground">{e.nombre}</span>
            <div className="flex gap-2">
              <Target id={`presente-${e.key}`} className={`w-9 h-9 rounded-full flex items-center justify-center border ${
                marcas[e.key] === "p" ? "bg-emerald-500 border-emerald-500 text-white" : "border-emerald-400 text-emerald-600 hover:bg-emerald-50"
              }`}>
                <Check className="w-4 h-4" />
              </Target>
              <Target id={`ausente-${e.key}`} className={`w-9 h-9 rounded-full flex items-center justify-center border text-sm font-bold ${
                marcas[e.key] === "a" ? "bg-red-500 border-red-500 text-white" : "border-red-400 text-red-600 hover:bg-red-50"
              }`}>
                ✗
              </Target>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Página ───────────────────────────────────────────────────────
const AprendeNormi = () => {
  const navigate = useNavigate();
  const session = getSession();
  const uid = session.id || "";

  const [progreso, setProgreso] = useState<Progreso>(() => leerProgreso(uid));
  const [misionActiva, setMisionActiva] = useState<Mision | null>(null);

  // Estado del jugador dentro de una misión
  const [fase, setFase] = useState<"intro" | "retos" | "quiz" | "medalla">("intro");
  const [retoIdx, setRetoIdx] = useState(0);
  const [errores, setErrores] = useState(0);
  const [feedback, setFeedback] = useState<{ tipo: "bien" | "mal" | "pista"; texto: string } | null>(null);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizElegida, setQuizElegida] = useState<number | null>(null);
  // Estados visuales de las maquetas
  const [notaAna, setNotaAna] = useState<string | null>(null);
  const [marcas, setMarcas] = useState<Record<string, "p" | "a">>({});

  if (!uid) { navigate("/"); return null; }

  const empezarMision = (m: Mision) => {
    setMisionActiva(m); setFase("intro"); setRetoIdx(0); setErrores(0);
    setFeedback(null); setQuizIdx(0); setQuizElegida(null);
    setNotaAna(null); setMarcas({});
  };

  const avanzarReto = () => {
    setFeedback(null);
    if (misionActiva && retoIdx + 1 < misionActiva.retos.length) setRetoIdx(retoIdx + 1);
    else setFase("quiz");
  };

  // El jugador escucha los taps de la maqueta
  TargetCtx.onTap = (id: string) => {
    if (!misionActiva || fase !== "retos" || feedback?.tipo === "bien") return;
    const reto = misionActiva.retos[retoIdx];
    if (id === reto.target) {
      // Efectos visuales del acierto en la maqueta
      if (id === "celda-ana-quiz") setNotaAna("4.50");
      if (id === "presente-juan") setMarcas((m) => ({ ...m, juan: "p" }));
      if (id === "ausente-carlos") setMarcas((m) => ({ ...m, carlos: "a" }));
      setFeedback({ tipo: "bien", texto: reto.logro });
    } else {
      setErrores((e) => e + 1);
      setFeedback({ tipo: "mal", texto: `Mmm, por ahí no es. 🙈 Pista: ${reto.pista}` });
    }
  };

  const responderQuiz = (i: number) => {
    if (!misionActiva || quizElegida !== null) return;
    setQuizElegida(i);
    const q = misionActiva.quiz[quizIdx];
    if (i !== q.correcta) setErrores((e) => e + 1);
    setTimeout(() => {
      setQuizElegida(null);
      if (quizIdx + 1 < misionActiva.quiz.length) setQuizIdx(quizIdx + 1);
      else {
        // Medalla: 3 estrellas sin errores, 2 con pocos, 1 el resto
        const estrellas = errores === 0 ? 3 : errores <= 2 ? 2 : 1;
        const nuevo = { ...progreso, [misionActiva.id]: { estrellas: Math.max(estrellas, progreso[misionActiva.id]?.estrellas || 0) } };
        setProgreso(nuevo); guardarProgreso(uid, nuevo);
        setFase("medalla");
      }
    }, 1200);
  };

  const estrellasDe = (id: string) => progreso[id]?.estrellas || 0;
  const totalMedallas = useMemo(() => MISIONES_PROFESOR.filter((m) => estrellasDe(m.id) > 0).length, [progreso]);

  const Estrellas = ({ n, size = "w-4 h-4" }: { n: number; size?: string }) => (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3].map((i) => (
        <Star key={i} className={`${size} ${i <= n ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );

  const BurbujaNormi = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-end gap-3">
      <img src={normiImg} alt="Normi" className="h-20 md:h-24 object-contain shrink-0 drop-shadow" />
      <div className="relative bg-card border border-border rounded-2xl shadow-md p-4 text-sm leading-relaxed flex-1">
        <span className="absolute -left-1.5 bottom-5 w-3 h-3 bg-card border-l border-b border-border rotate-45" />
        {children}
      </div>
    </div>
  );

  // ── Vista: jugando una misión ──
  if (misionActiva) {
    const m = misionActiva;
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <HeaderNormi />
        <main className="flex-1 container mx-auto p-4 md:p-8 max-w-3xl">
          <button onClick={() => setMisionActiva(null)} className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4">
            <ArrowLeft className="w-4 h-4" /> Volver al mapa
          </button>

          <h2 className="text-lg font-bold text-foreground mb-4">{m.emoji} Misión: {m.nombre}</h2>

          {fase === "intro" && (
            <div className="space-y-5">
              <BurbujaNormi>{m.intro}</BurbujaNormi>
              <div className="text-center">
                <button onClick={() => setFase("retos")} className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90">
                  ¡Empezar retos!
                </button>
              </div>
            </div>
          )}

          {fase === "retos" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Reto {retoIdx + 1} de {m.retos.length}</p>
              <BurbujaNormi>
                {feedback ? (
                  <span className={feedback.tipo === "bien" ? "text-emerald-700 font-medium" : "text-foreground"}>
                    {feedback.tipo === "bien" && "🎉 "}{feedback.texto}
                  </span>
                ) : (
                  m.retos[retoIdx].instruccion
                )}
              </BurbujaNormi>

              {m.id === "notas" ? <MockNotas notaAna={notaAna} /> : <MockAsistencia marcas={marcas} />}

              {feedback?.tipo === "bien" && (
                <div className="text-center animate-badge-pop">
                  <button onClick={avanzarReto} className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90">
                    {retoIdx + 1 < m.retos.length ? "Siguiente reto →" : "¡Al quiz final!"}
                  </button>
                </div>
              )}
            </div>
          )}

          {fase === "quiz" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Pregunta {quizIdx + 1} de {m.quiz.length}</p>
              <BurbujaNormi>Última prueba para tu medalla: {m.quiz[quizIdx].pregunta}</BurbujaNormi>
              <div className="space-y-2">
                {m.quiz[quizIdx].opciones.map((op, i) => {
                  const elegida = quizElegida === i;
                  const esCorrecta = i === m.quiz[quizIdx].correcta;
                  return (
                    <button
                      key={i}
                      onClick={() => responderQuiz(i)}
                      className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                        quizElegida === null
                          ? "border-border bg-card hover:border-primary hover:bg-primary/5"
                          : esCorrecta
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium"
                          : elegida
                          ? "border-red-400 bg-red-50 text-red-700"
                          : "border-border bg-card opacity-60"
                      }`}
                    >
                      {op}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {fase === "medalla" && (
            <div className="text-center space-y-5 py-6">
              <div className="text-7xl animate-badge-pop">🏅</div>
              <h3 className="text-2xl font-bold text-foreground">¡Misión {m.nombre} completada!</h3>
              <Estrellas n={estrellasDe(m.id)} size="w-8 h-8" />
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {estrellasDe(m.id) === 3
                  ? "¡Perfecto, sin un solo error! Eres crack. 🌟"
                  : "¡Muy bien! Puedes repetir la misión cuando quieras para lograr las 3 estrellas."}
              </p>
              <button onClick={() => setMisionActiva(null)} className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90">
                Volver al mapa
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── Vista: mapa de misiones ──
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi />
      <main className="flex-1 container mx-auto p-4 md:p-8 max-w-2xl">
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Aprende con Normi</span>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <img src={normiImg} alt="Normi" className="h-24 md:h-28 object-contain drop-shadow" />
          <div>
            <h2 className="text-2xl font-bold text-foreground">Aprende con Normi</h2>
            <p className="text-sm text-muted-foreground">
              Completa las misiones de tu cargo y vuélvete experto en la plataforma.
            </p>
            <p className="text-sm font-medium text-primary mt-1">🏅 {totalMedallas} de {MISIONES_PROFESOR.length} medallas</p>
          </div>
        </div>

        {/* Camino de misiones */}
        <div className="relative pl-7">
          <div className="absolute left-[13px] top-3 bottom-3 w-0.5 bg-border" />
          <div className="space-y-4">
            {MISIONES_PROFESOR.map((m, idx) => {
              const hecha = estrellasDe(m.id) > 0;
              const desbloqueada = idx === 0 || estrellasDe(MISIONES_PROFESOR[idx - 1].id) > 0;
              return (
                <div key={m.id} className="relative">
                  <span className={`absolute -left-7 top-5 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                    hecha ? "bg-primary border-primary text-primary-foreground" : desbloqueada ? "bg-card border-primary text-primary" : "bg-muted border-border text-muted-foreground"
                  }`} style={{ transform: "translateX(-50%)", left: 0 }}>
                    {hecha ? <Check className="w-4 h-4" /> : idx + 1}
                  </span>
                  <button
                    disabled={!desbloqueada}
                    onClick={() => empezarMision(m)}
                    className={`w-full flex items-center justify-between gap-3 border-2 rounded-xl p-4 text-left transition-all ${
                      desbloqueada ? "bg-card border-border hover:border-primary hover:shadow-md cursor-pointer" : "bg-muted/50 border-border opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{m.emoji}</span>
                      <div>
                        <p className="font-semibold text-foreground">Misión: {m.nombre}</p>
                        <p className="text-xs text-muted-foreground">{m.descripcion}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Estrellas n={estrellasDe(m.id)} />
                      {hecha && <p className="text-[10px] text-primary font-medium mt-0.5">Repetir</p>}
                    </div>
                  </button>
                </div>
              );
            })}

            {/* Próximas misiones (bloqueadas) */}
            {PROXIMAMENTE.map((p) => (
              <div key={p.nombre} className="relative">
                <span className="absolute top-5 w-7 h-7 rounded-full border-2 bg-muted border-border text-muted-foreground flex items-center justify-center" style={{ transform: "translateX(-50%)", left: 0 }}>
                  <Lock className="w-3.5 h-3.5" />
                </span>
                <div className="w-full flex items-center gap-3 border-2 border-dashed border-border rounded-xl p-4 bg-muted/30 opacity-70">
                  <span className="text-3xl grayscale">{p.emoji}</span>
                  <div>
                    <p className="font-semibold text-muted-foreground">Misión: {p.nombre}</p>
                    <p className="text-xs text-muted-foreground">Próximamente…</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AprendeNormi;
