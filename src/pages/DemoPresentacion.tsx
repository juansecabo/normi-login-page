import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, GraduationCap, BarChart3, Megaphone, ClipboardCheck,
  FileText, HeartHandshake, CalendarDays, ShieldCheck, Sparkles,
  ArrowRight, Loader2, Users, BookOpen, School, UserRound,
  ChevronLeft, ChevronRight, LayoutGrid, X, Check, Lock, Globe,
  Clock, Building2, Layers, Zap, FileSpreadsheet, DatabaseBackup,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { saveSession, AcudidoData } from "@/hooks/useSession";
import { useToast } from "@/hooks/use-toast";

/**
 * Presentación pública en vivo de Notas Normi (notasnormi.com/demo).
 * Es un DECK de diapositivas: navegación con flechas del teclado, botones ‹ ›,
 * panel para saltar entre láminas y barra de progreso. La última diapositiva
 * deja ENTRAR EN VIVO a cada perfil del colegio de prueba (Cailico) con un clic.
 * Pensada para presentarla a Secretarías de Educación y colegios.
 */

type Perfil = "rector" | "profesor" | "estudiante" | "acudiente";

const CAPACIDADES = [
  { icon: MessageCircle, titulo: "Normi por WhatsApp", desc: "Asistente con IA que responde notas, tareas y dudas 24/7." },
  { icon: BarChart3, titulo: "Notas en tiempo real", desc: "Grupos, subgrupos y ponderaciones; la definitiva se calcula sola." },
  { icon: FileText, titulo: "Boletines automáticos", desc: "Por periodo, con áreas, logros y desempeños, listos para descargar." },
  { icon: Megaphone, titulo: "Comunicados", desc: "Circulares a grados, salones o personas, con archivos y firma." },
  { icon: ClipboardCheck, titulo: "Asistencia", desc: "Registro por clase y aviso automático a los acudientes." },
  { icon: CalendarDays, titulo: "Permisos y excusas", desc: "Inasistencias y retiros justificados en línea, sin ir al colegio." },
  { icon: Sparkles, titulo: "Normi Examinadora", desc: "Genera evaluaciones y talleres con IA en un Word listo para aplicar." },
  { icon: HeartHandshake, titulo: "Orientación escolar", desc: "Remisiones, seguimiento de casos y observador estudiantil." },
];

const PERFILES: { id: Perfil; nombre: string; persona: string; icon: typeof School; desc: string; color: string; bullets: string[] }[] = [
  { id: "rector", nombre: "Rectoría / Dirección", persona: "Simón Cardona", icon: School, color: "from-emerald-500 to-emerald-700",
    desc: "Visión completa del colegio: estadísticas, alertas de riesgo, comunicados y gestión de la institución.",
    bullets: ["Panorama de todo el colegio", "Alertas de riesgo académico", "Comunicados a la comunidad", "Gestión de personas y estructura"] },
  { id: "profesor", nombre: "Profesor", persona: "Lucía Mendoza", icon: BookOpen, color: "from-teal-500 to-teal-700",
    desc: "Sube notas, programa actividades, pasa asistencia y crea evaluaciones con IA.",
    bullets: ["Notas con grupos y ponderaciones", "Asistencia en segundos", "Evaluaciones con IA", "Boletines automáticos"] },
  { id: "estudiante", nombre: "Estudiante", persona: "Salomé García", icon: GraduationCap, color: "from-green-500 to-green-700",
    desc: "Consulta sus notas en vivo, tareas del día y comunicados del colegio.",
    bullets: ["Sus notas en tiempo real", "Tareas y actividades del día", "Comunicados del colegio", "Todo desde el celular"] },
  { id: "acudiente", nombre: "Acudiente", persona: "Cristian Gil", icon: Users, color: "from-lime-500 to-emerald-700",
    desc: "Sigue el rendimiento de su hijo, justifica ausencias y recibe todo por WhatsApp.",
    bullets: ["Rendimiento de su hijo", "Justifica ausencias en línea", "Avisos por WhatsApp", "Le escribe a Normi cuando quiera"] },
];

const RETOS = [
  { icon: FileSpreadsheet, t: "Notas en papel y hojas de cálculo dispersas" },
  { icon: MessageCircle, t: "Comunicación en grupos de WhatsApp caóticos" },
  { icon: Clock, t: "Excusas y permisos que exigen ir al colegio" },
  { icon: Globe, t: "Plataformas caras, en inglés o pensadas para otro país" },
];

const PILARES = [
  { icon: Layers, t: "Todo integrado", d: "Notas, comunicación, asistencia, boletines y orientación en un solo lugar." },
  { icon: MessageCircle, t: "En el WhatsApp que ya usan", d: "Las familias no instalan nada nuevo: le escriben a Normi." },
  { icon: Building2, t: "Multi-institución", d: "Cada colegio con su escala, jornadas, escudo y número propio." },
  { icon: Zap, t: "En tiempo real", d: "La nota que sube el profesor, la familia la ve al instante." },
];

const NORMI_BULLETS = [
  "Responde notas, tareas y comunicados al instante",
  "Entiende audios e imágenes, no solo texto",
  "Disponible 24 horas, todos los días",
  "Sabe quién pregunta —acudiente, profe o rector— y responde según su rol",
];

const SEGURIDAD = [
  { icon: ShieldCheck, t: "Aislamiento por institución", d: "Cada colegio ve únicamente sus propios datos." },
  { icon: Lock, t: "Acceso por rol", d: "Cada persona ve solo lo que le corresponde." },
  { icon: Globe, t: "Conexión cifrada en la nube", d: "Información protegida de extremo a extremo." },
  { icon: DatabaseBackup, t: "Respaldos automáticos", d: "Copia de seguridad periódica de cada colegio." },
];

const facil = "cubic-bezier(.22,.61,.36,1)";
const estilos = `
@keyframes deckInRight { from { opacity:0; transform: translate3d(52px,0,0) } to { opacity:1; transform:none } }
@keyframes deckInLeft  { from { opacity:0; transform: translate3d(-52px,0,0) } to { opacity:1; transform:none } }
@keyframes deckUp      { from { opacity:0; transform: translate3d(0,20px,0) } to { opacity:1; transform:none } }
@keyframes deckPanel   { from { opacity:0; transform: translate3d(0,10px,0) } to { opacity:1; transform:none } }
@keyframes deckBlob    { 0%{transform:translate(0,0) scale(1)} 50%{transform:translate(34px,-26px) scale(1.12)} 100%{transform:translate(0,0) scale(1)} }
@keyframes deckPulse   { 0%,100%{opacity:.5} 50%{opacity:1} }
`;

// escalonado de aparición para elementos internos
const up = (i: number, base = 0.12): CSSProperties => ({
  animation: `deckUp .55s ${facil} both`,
  animationDelay: `${base + i * 0.07}s`,
});

const DemoPresentacion = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cargando, setCargando] = useState<Perfil | null>(null);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [panel, setPanel] = useState(false);

  const entrar = async (perfil: Perfil) => {
    if (cargando) return;
    setCargando(perfil);
    try {
      const { user } = await apiClient.auth.demoLoginAs(perfil);
      const multi = user.multi_membership === true;
      const avatar = user.avatar_url || null;
      const c = user.colegio || ({} as any);
      const genero = (user as any).genero || null;
      const acudidos = (user.acudidos || []) as AcudidoData[];
      saveSession(
        user.id, user.nombres, user.apellidos, user.rol,
        user.nivel || null, user.grado || null, user.salon || null,
        user.rol === "Acudiente" ? acudidos : null,
        multi, avatar, c.id || null, c.nombre || null, c.logo_url || null, c.slug || null, genero,
      );
      localStorage.setItem("sin_contrasena", "0");
      navigate("/dashboard", { replace: true });
    } catch {
      toast({ title: "Un momento", description: "No se pudo abrir el demo. Intenta de nuevo.", variant: "destructive" });
      setCargando(null);
    }
  };

  // ── Diapositivas ──
  const slides: { kicker: string; titulo: string; render: () => ReactNode }[] = [
    {
      kicker: "Plataforma escolar · por Cailico",
      titulo: "El colegio y las familias, conectados de verdad.",
      render: () => (
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3.5 py-1.5 text-xs font-medium mb-7" style={up(0)}>
            <span className="w-2 h-2 rounded-full bg-lime-400" style={{ animation: "deckPulse 1.8s ease-in-out infinite" }} />
            Demostración en vivo · Colegio de prueba
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black leading-[1.03] tracking-tight" style={up(1)}>
            El colegio y las familias,<br /><span className="text-lime-300">conectados de verdad.</span>
          </h1>
          <p className="mt-7 text-lg md:text-2xl text-white/80 leading-relaxed max-w-2xl" style={up(2)}>
            Notas Normi reúne calificaciones, comunicación, asistencia e inteligencia
            artificial por WhatsApp — en una sola plataforma, en español, hecha para
            instituciones educativas.
          </p>
          <p className="mt-9 text-sm text-white/50 flex items-center gap-2" style={up(3)}>
            <span className="hidden md:inline-flex items-center gap-1.5 border border-white/15 rounded-lg px-2.5 py-1"><ChevronLeft className="w-3.5 h-3.5" /><ChevronRight className="w-3.5 h-3.5" /></span>
            Usa las flechas del teclado o los botones para avanzar
          </p>
        </div>
      ),
    },
    {
      kicker: "El reto",
      titulo: "El día a día de un colegio, hoy",
      render: () => (
        <div className="w-full max-w-4xl">
          <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
            {RETOS.map(({ icon: Icon, t }, i) => (
              <div key={t} className="flex items-start gap-4 bg-white/[0.04] border border-white/10 rounded-2xl p-5" style={up(i, 0.15)}>
                <div className="w-11 h-11 rounded-xl bg-rose-400/15 text-rose-300 flex items-center justify-center shrink-0">
                  <Icon className="w-5.5 h-5.5" />
                </div>
                <p className="text-base md:text-lg text-white/85 leading-snug pt-1.5">{t}</p>
              </div>
            ))}
          </div>
          <p className="mt-7 text-lg md:text-xl text-white/60" style={up(4, 0.15)}>
            El resultado: familias desinformadas y equipos directivos saturados.
          </p>
        </div>
      ),
    },
    {
      kicker: "La solución",
      titulo: "Una sola plataforma para todo el colegio",
      render: () => (
        <div className="w-full max-w-5xl">
          <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
            {PILARES.map(({ icon: Icon, t, d }, i) => (
              <div key={t} className="bg-white/[0.05] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.08] transition-colors" style={up(i, 0.1)}>
                <div className="w-12 h-12 rounded-xl bg-lime-300/15 text-lime-300 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-xl">{t}</h3>
                <p className="text-white/65 mt-1.5 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      kicker: "El diferenciador",
      titulo: "Conoce a Normi",
      render: () => (
        <div className="w-full max-w-5xl grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xl md:text-2xl text-white/85 leading-relaxed" style={up(0)}>
              Una asistente con inteligencia artificial que vive en <span className="text-lime-300 font-semibold">WhatsApp</span>.
            </p>
            <ul className="mt-6 space-y-3.5">
              {NORMI_BULLETS.map((b, i) => (
                <li key={b} className="flex items-start gap-3" style={up(i + 1)}>
                  <span className="w-6 h-6 rounded-full bg-lime-300/20 text-lime-300 flex items-center justify-center shrink-0 mt-0.5"><Check className="w-4 h-4" /></span>
                  <span className="text-white/80 text-base md:text-lg leading-snug">{b}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Mock de conversación */}
          <div className="bg-[#0b141a] rounded-3xl border border-white/10 shadow-2xl overflow-hidden" style={up(2, 0.2)}>
            <div className="bg-emerald-700 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center"><MessageCircle className="w-5 h-5 text-emerald-700" /></div>
              <div className="leading-tight"><p className="font-semibold text-sm text-white">Normi</p><p className="text-[11px] text-white/70">en línea</p></div>
            </div>
            <div className="p-4 space-y-3" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,.04) 1px, transparent 0)", backgroundSize: "18px 18px" }}>
              <div className="ml-auto max-w-[80%] bg-emerald-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm">¿Cómo va Salomé en matemáticas?</div>
              <div className="max-w-[85%] bg-[#202c33] text-white/90 rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm leading-relaxed">
                ¡Hola, Cristian! 😊 Salomé va muy bien: <b className="text-lime-300">4.5</b> en Matemáticas este periodo. Su última nota fue un quiz de fracciones con 5.0. ¿Quieres ver el detalle?
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      kicker: "Capacidades",
      titulo: "Todo lo que hace",
      render: () => (
        <div className="w-full max-w-5xl">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4">
            {CAPACIDADES.map(({ icon: Icon, titulo, desc }, i) => (
              <div key={titulo} className="bg-white/[0.05] border border-white/10 rounded-2xl p-5 hover:bg-white/[0.09] hover:-translate-y-1 transition-all" style={up(i, 0.06)}>
                <div className="w-11 h-11 rounded-xl bg-lime-300/15 text-lime-300 flex items-center justify-center mb-3.5"><Icon className="w-5.5 h-5.5" /></div>
                <h3 className="font-bold text-[15px]">{titulo}</h3>
                <p className="text-[13px] text-white/60 mt-1 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      kicker: "Para cada quién",
      titulo: "Cada quién ve lo suyo",
      render: () => (
        <div className="w-full max-w-6xl">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4">
            {PERFILES.map(({ id, nombre, icon: Icon, color, bullets }, i) => (
              <div key={id} className="bg-white/[0.05] border border-white/10 rounded-2xl p-5" style={up(i, 0.08)}>
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg mb-3.5`}><Icon className="w-6 h-6 text-white" /></div>
                <h3 className="font-extrabold text-lg">{nombre}</h3>
                <ul className="mt-3 space-y-2">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-[13px] text-white/70 leading-snug">
                      <span className="w-1.5 h-1.5 rounded-full bg-lime-300 shrink-0 mt-1.5" />{b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      kicker: "Confianza",
      titulo: "Ya funciona en colegios reales",
      render: () => (
        <div className="w-full max-w-4xl">
          <div className="grid sm:grid-cols-2 gap-5">
            {["Escuela Normal Superior de Corozal", "Colegio Pestalozziano"].map((n, i) => (
              <div key={n} className="bg-white/[0.05] border border-white/10 rounded-2xl p-7 flex items-center gap-4" style={up(i, 0.12)}>
                <div className="w-14 h-14 rounded-2xl bg-lime-300/15 text-lime-300 flex items-center justify-center shrink-0"><School className="w-7 h-7" /></div>
                <p className="font-bold text-lg md:text-xl leading-tight">{n}</p>
              </div>
            ))}
          </div>
          <p className="mt-7 text-lg md:text-xl text-white/65 leading-relaxed" style={up(2, 0.12)}>
            Instituciones reales usando Notas Normi en su día a día. Cada una con su propia
            configuración —escala de notas, jornadas, escudo y número de WhatsApp— completamente
            aislada de las demás.
          </p>
        </div>
      ),
    },
    {
      kicker: "Seguridad",
      titulo: "Los datos de cada colegio, protegidos",
      render: () => (
        <div className="w-full max-w-5xl">
          <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
            {SEGURIDAD.map(({ icon: Icon, t, d }, i) => (
              <div key={t} className="flex items-start gap-4 bg-white/[0.05] border border-white/10 rounded-2xl p-6" style={up(i, 0.1)}>
                <div className="w-12 h-12 rounded-xl bg-lime-300/15 text-lime-300 flex items-center justify-center shrink-0"><Icon className="w-6 h-6" /></div>
                <div><h3 className="font-bold text-lg">{t}</h3><p className="text-white/65 mt-1 leading-relaxed">{d}</p></div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      kicker: "No son diapositivas",
      titulo: "Entra y pruébalo tú mismo",
      render: () => (
        <div className="w-full max-w-5xl">
          <p className="text-white/70 text-base md:text-lg mb-6 max-w-2xl" style={up(0)}>
            Elige un perfil y entra <b className="text-lime-300">en vivo</b> al colegio de prueba.
            Es la plataforma real, con datos de demostración.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4">
            {PERFILES.map(({ id, nombre, persona, icon: Icon, color }, i) => (
              <div key={id} className="bg-white/[0.06] border border-white/12 rounded-2xl p-5 flex flex-col" style={up(i, 0.08)}>
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg mb-3.5`}><Icon className="w-6 h-6 text-white" /></div>
                <h3 className="font-extrabold text-[15px] leading-tight">{nombre}</h3>
                <p className="text-xs text-white/55 flex items-center gap-1 mt-1"><UserRound className="w-3 h-3" /> {persona}</p>
                <button onClick={() => entrar(id)} disabled={!!cargando}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-emerald-950 font-bold text-sm rounded-xl px-3 py-2.5 transition-colors">
                  {cargando === id ? (<><Loader2 className="w-4 h-4 animate-spin" /> Entrando…</>) : (<>Entrar <ArrowRight className="w-4 h-4" /></>)}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-white/45 flex items-center gap-1.5" style={up(5, 0.08)}>
            <ShieldCheck className="w-4 h-4" /> Cuentas de demostración · datos ficticios y aislados de los colegios reales.
          </p>
        </div>
      ),
    },
    {
      kicker: "Hablemos",
      titulo: "Llevemos Notas Normi a tu institución",
      render: () => (
        <div className="max-w-3xl">
          <p className="text-xl md:text-2xl text-white/80 leading-relaxed" style={up(0)}>
            Una plataforma completa, en español, pensada para la realidad de los colegios
            colombianos — con inteligencia artificial en el WhatsApp que las familias ya usan.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4" style={up(1)}>
            <a href="https://wa.me/573003774342" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-lime-400 hover:bg-lime-300 text-emerald-950 font-bold rounded-xl px-6 py-3.5 shadow-lg hover:-translate-y-0.5 transition-all">
              <MessageCircle className="w-5 h-5" /> Habla con Normi por WhatsApp
            </a>
            <button onClick={() => goTo(slides.length - 2)}
              className="inline-flex items-center gap-2 text-white/90 hover:text-white font-medium border border-white/25 rounded-xl px-5 py-3.5 hover:bg-white/10 transition-colors">
              Volver a probarla en vivo
            </button>
          </div>
          <div className="mt-12 flex items-center gap-3" style={up(2)}>
            <img src="/cailico-logo.webp" alt="Cailico" className="h-11 w-11 rounded-full bg-white object-contain" />
            <div><p className="font-bold text-lg">Notas Normi</p><p className="text-sm text-white/60">Un producto de Cailico</p></div>
          </div>
        </div>
      ),
    },
  ];

  const total = slides.length;
  const goTo = (n: number) => {
    const destino = Math.max(0, Math.min(total - 1, n));
    if (destino === idx) { setPanel(false); return; }
    setDir(destino > idx ? 1 : -1);
    setIdx(destino);
    setPanel(false);
  };
  const next = () => goTo(idx + 1);
  const prev = () => goTo(idx - 1);

  // ── Teclado ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const interactivo = tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA";
      switch (e.key) {
        case "ArrowRight": case "PageDown": e.preventDefault(); next(); break;
        case "ArrowLeft": case "PageUp": e.preventDefault(); prev(); break;
        case " ": if (!interactivo) { e.preventDefault(); next(); } break;
        case "Home": e.preventDefault(); goTo(0); break;
        case "End": e.preventDefault(); goTo(total - 1); break;
        case "g": case "G": setPanel((p) => !p); break;
        case "Escape": setPanel(false); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const actual = slides[idx];

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 text-white flex flex-col select-none">
      <style>{estilos}</style>

      {/* Atmósfera de fondo */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "26px 26px" }} />
      <div className="pointer-events-none absolute -top-32 -right-24 w-[36rem] h-[36rem] rounded-full bg-lime-400/10 blur-3xl" style={{ animation: "deckBlob 16s ease-in-out infinite" }} />
      <div className="pointer-events-none absolute -bottom-40 -left-32 w-[34rem] h-[34rem] rounded-full bg-emerald-400/10 blur-3xl" style={{ animation: "deckBlob 20s ease-in-out infinite reverse" }} />

      {/* Barra de progreso superior */}
      <div className="relative z-20 h-1 bg-white/10">
        <div className="h-full bg-lime-400 transition-all duration-500" style={{ width: `${((idx + 1) / total) * 100}%` }} />
      </div>

      {/* Encabezado fijo */}
      <header className="relative z-20 flex items-center justify-between px-5 md:px-9 py-4">
        <button onClick={() => goTo(0)} className="flex items-center gap-2.5 group">
          <img src="/cailico-logo.webp" alt="Cailico" className="h-9 w-9 rounded-full bg-white object-contain" />
          <div className="leading-tight text-left">
            <p className="font-bold group-hover:text-lime-300 transition-colors">Notas Normi</p>
            <p className="text-[10px] uppercase tracking-widest text-lime-300/80 -mt-0.5">por Cailico</p>
          </div>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs md:text-sm text-white/55 tabular-nums font-medium">{idx + 1} / {total}</span>
          <button onClick={() => setPanel(true)} title="Ver todas las diapositivas (G)"
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <LayoutGrid className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Contenido de la diapositiva (animado) */}
      <main className="relative z-10 flex-1 min-h-0 flex items-center px-6 md:px-14 overflow-y-auto">
        <div key={idx} className="w-full mx-auto py-6"
          style={{ animation: `${dir >= 0 ? "deckInRight" : "deckInLeft"} .45s ${facil} both` }}>
          <p className="text-lime-300 font-bold text-xs md:text-sm uppercase tracking-[0.22em]" style={up(0, 0.04)}>{actual.kicker}</p>
          {idx !== 0 && (
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mt-3 mb-8 max-w-4xl" style={up(1, 0.04)}>{actual.titulo}</h2>
          )}
          {actual.render()}
        </div>
      </main>

      {/* Controles inferiores fijos */}
      <footer className="relative z-20 flex items-center justify-center gap-3 md:gap-5 pb-5 md:pb-7 pt-2 px-4">
        <button onClick={prev} disabled={idx === 0} aria-label="Anterior"
          className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5 md:gap-2">
          {slides.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} aria-label={`Ir a la diapositiva ${i + 1}`}
              className={`rounded-full transition-all ${i === idx ? "w-7 h-2.5 bg-lime-400" : "w-2.5 h-2.5 bg-white/25 hover:bg-white/45"}`} />
          ))}
        </div>
        <button onClick={next} disabled={idx === total - 1} aria-label="Siguiente"
          className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </footer>

      {/* Panel de navegación */}
      {panel && (
        <div className="fixed inset-0 z-40 bg-emerald-950/85 backdrop-blur-md flex flex-col p-6 md:p-12" style={{ animation: "deckPanel .25s ease both" }}>
          <div className="flex items-center justify-between mb-8 max-w-5xl mx-auto w-full">
            <p className="text-lg font-bold text-white/90">Diapositivas</p>
            <button onClick={() => setPanel(false)} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl mx-auto w-full overflow-y-auto">
            {slides.map((s, i) => (
              <button key={i} onClick={() => goTo(i)}
                className={`text-left rounded-2xl p-4 border transition-all ${i === idx ? "bg-lime-400/15 border-lime-400/50" : "bg-white/[0.04] border-white/10 hover:bg-white/[0.09]"}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-bold tabular-nums w-6 h-6 rounded-lg flex items-center justify-center ${i === idx ? "bg-lime-400 text-emerald-950" : "bg-white/10 text-white/70"}`}>{i + 1}</span>
                  <span className="text-[11px] uppercase tracking-wider text-lime-300/80 font-semibold truncate">{s.kicker}</span>
                </div>
                <p className="font-semibold text-sm text-white/90 leading-snug">{i === 0 ? "Portada" : s.titulo}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DemoPresentacion;
