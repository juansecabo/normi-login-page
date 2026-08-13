import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, GraduationCap, BarChart3, Megaphone, ClipboardCheck,
  FileText, HeartHandshake, CalendarDays, ShieldCheck, Sparkles,
  ArrowRight, Loader2, ChevronDown, Users, BookOpen, School, UserRound,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { saveSession, AcudidoData } from "@/hooks/useSession";
import { useToast } from "@/hooks/use-toast";

/**
 * Presentación pública en vivo de Notas Normi (notasnormi.com/demo).
 * Primero muestra qué hace la plataforma; luego deja ENTRAR EN VIVO a cada
 * perfil del colegio de prueba (Cailico) con un clic. Pensada para presentarla
 * a Secretarías de Educación y colegios.
 */

type Perfil = "rector" | "profesor" | "estudiante" | "acudiente";

const CAPACIDADES = [
  { icon: MessageCircle, titulo: "Normi por WhatsApp", desc: "Una asistente con IA que responde notas, tareas y dudas del colegio 24/7, por el WhatsApp que las familias ya usan." },
  { icon: BarChart3, titulo: "Notas en tiempo real", desc: "Calificaciones con grupos, subgrupos y ponderaciones; la nota definitiva se calcula sola." },
  { icon: FileText, titulo: "Boletines automáticos", desc: "Boletines por periodo con áreas, logros y desempeños, listos para descargar." },
  { icon: Megaphone, titulo: "Comunicados", desc: "Circulares a grados, salones o personas puntuales, con archivos y firma digital." },
  { icon: ClipboardCheck, titulo: "Asistencia", desc: "Registro por clase y aviso automático a los acudientes ante una inasistencia." },
  { icon: CalendarDays, titulo: "Permisos y excusas", desc: "Inasistencias, uniforme y retiros justificados en línea, con firma, sin ir al colegio." },
  { icon: Sparkles, titulo: "Normi Examinadora", desc: "Genera evaluaciones, talleres y quizzes con IA en un documento Word listo para aplicar." },
  { icon: HeartHandshake, titulo: "Orientación escolar", desc: "Remisiones, seguimiento de casos y observador estudiantil para el bienestar de cada niño." },
];

const PERFILES: { id: Perfil; nombre: string; persona: string; icon: typeof School; desc: string; color: string }[] = [
  { id: "rector", nombre: "Rectoría / Dirección", persona: "Simón Cardona", icon: School, desc: "Visión completa del colegio: estadísticas, alertas de riesgo, comunicados y gestión de la institución.", color: "from-emerald-600 to-emerald-700" },
  { id: "profesor", nombre: "Profesor", persona: "Lucía Mendoza", icon: BookOpen, desc: "Sube notas, programa actividades, pasa asistencia y crea evaluaciones con IA.", color: "from-teal-600 to-teal-700" },
  { id: "estudiante", nombre: "Estudiante", persona: "Salomé García", icon: GraduationCap, desc: "Consulta sus notas en vivo, tareas del día y comunicados del colegio.", color: "from-green-600 to-green-700" },
  { id: "acudiente", nombre: "Acudiente", persona: "Cristian Gil", icon: Users, desc: "Sigue el rendimiento de su hijo, justifica ausencias y recibe todo por WhatsApp.", color: "from-lime-600 to-emerald-700" },
];

const DemoPresentacion = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cargando, setCargando] = useState<Perfil | null>(null);

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

  const irAPerfiles = () => document.getElementById("pruebalo")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-slate-800">
      {/* ── Barra ── */}
      <header className="sticky top-0 z-20 bg-primary/95 backdrop-blur text-primary-foreground shadow-sm">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/cailico-logo.webp" alt="Cailico" className="h-9 w-9 rounded-full bg-white object-contain" />
            <div className="leading-tight">
              <p className="font-bold text-lg">Notas Normi</p>
              <p className="text-[11px] opacity-80 -mt-0.5">por Cailico</p>
            </div>
          </div>
          <button onClick={irAPerfiles} className="text-sm font-semibold bg-white/15 hover:bg-white/25 transition-colors rounded-lg px-4 py-2">
            Pruébalo en vivo
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-emerald-800 to-emerald-950" />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="relative max-w-6xl mx-auto px-5 pt-16 pb-20 md:pt-24 md:pb-28 text-primary-foreground">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3.5 py-1.5 text-xs font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" /> Demostración en vivo · Colegio de prueba
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-[1.05] tracking-tight max-w-3xl">
            El colegio y las familias,<br /><span className="text-lime-300">conectados de verdad.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-white/85 max-w-2xl leading-relaxed">
            Notas Normi reúne calificaciones, comunicación, asistencia y una asistente
            con inteligencia artificial por WhatsApp — todo en una sola plataforma para
            cada institución educativa.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button onClick={irAPerfiles} className="group inline-flex items-center gap-2 bg-white text-emerald-900 font-bold rounded-xl px-6 py-3.5 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
              Explorar la plataforma en vivo
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <a href="https://wa.me/573003774342" target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 text-white/90 hover:text-white font-medium border border-white/25 rounded-xl px-5 py-3.5 hover:bg-white/10 transition-colors">
              <MessageCircle className="w-5 h-5" /> Escríbele a Normi
            </a>
          </div>
        </div>
        <div className="relative">
          <svg viewBox="0 0 1440 60" className="w-full block" preserveAspectRatio="none">
            <path d="M0,40 C360,70 1080,10 1440,40 L1440,60 L0,60 Z" fill="#f6f8f6" />
          </svg>
        </div>
      </section>

      {/* ── Capacidades ── */}
      <section className="max-w-6xl mx-auto px-5 py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-emerald-700 font-bold text-sm uppercase tracking-wider">Todo lo que hace</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mt-2">Una plataforma, todo el colegio</h2>
          <p className="text-slate-500 mt-3">Desde la nota de un quiz hasta un comunicado a toda la comunidad — sin papeles, sin filas.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CAPACIDADES.map(({ icon: Icon, titulo, desc }) => (
            <div key={titulo} className="group bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition-colors">
                <Icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900">{titulo}</h3>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pruébalo en vivo ── */}
      <section id="pruebalo" className="bg-white border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-3">
            <ChevronDown className="w-6 h-6 text-emerald-600 mx-auto mb-2 animate-bounce" />
            <p className="text-emerald-700 font-bold text-sm uppercase tracking-wider">No son diapositivas</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mt-2">Entra y pruébalo tú mismo</h2>
            <p className="text-slate-500 mt-3">Elige un perfil y entra <b>en vivo</b> al colegio de prueba. Es la plataforma real, con datos de demostración.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6 mt-10">
            {PERFILES.map(({ id, nombre, persona, icon: Icon, desc, color }) => (
              <div key={id} className="relative rounded-2xl border border-slate-150 bg-slate-50/60 p-6 flex flex-col overflow-hidden">
                <div className={`absolute -right-8 -top-8 w-28 h-28 rounded-full bg-gradient-to-br ${color} opacity-10`} />
                <div className="flex items-center gap-4 relative">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} text-white flex items-center justify-center shadow-md shrink-0`}>
                    <Icon className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-lg text-slate-900">{nombre}</h3>
                    <p className="text-sm text-slate-500 flex items-center gap-1"><UserRound className="w-3.5 h-3.5" /> {persona}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mt-4 leading-relaxed flex-1">{desc}</p>
                <button onClick={() => entrar(id)} disabled={!!cargando}
                  className="mt-5 inline-flex items-center justify-center gap-2 bg-primary hover:bg-emerald-800 disabled:opacity-60 text-white font-bold rounded-xl px-5 py-3 transition-colors">
                  {cargando === id ? (<><Loader2 className="w-5 h-5 animate-spin" /> Entrando…</>) : (<>Entrar como {nombre.split(" ")[0].toLowerCase()} <ArrowRight className="w-4 h-4" /></>)}
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-8 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Cuentas de demostración · los datos son ficticios y aislados de los colegios reales.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-emerald-950 text-emerald-100/80">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/cailico-logo.webp" alt="Cailico" className="h-10 w-10 rounded-full bg-white object-contain" />
            <div>
              <p className="font-bold text-white">Notas Normi</p>
              <p className="text-xs">Un producto de Cailico</p>
            </div>
          </div>
          <a href="https://wa.me/573003774342" target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg px-4 py-2.5 transition-colors">
            <MessageCircle className="w-4 h-4" /> Habla con Normi por WhatsApp
          </a>
        </div>
      </footer>
    </div>
  );
};

export default DemoPresentacion;
