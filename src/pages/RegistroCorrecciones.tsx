import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/apiClient";
import { ArrowLeft, UserPlus, UserCog, Users, Loader2, CheckCircle2 } from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ColegioPub { id: string; nombre: string; logo_url: string | null; }
type Tipo = "no_registrado" | "perfil_incorrecto" | "hijos_faltantes";
interface SolicitudPub {
  turno: number;
  nombre: string;
  tipo: Tipo;
  tipo_label: string;
  estado: "pendiente" | "solucionado";
  created_at: string;
}

const CASOS: { tipo: Tipo; titulo: string; desc: string; icon: typeof UserPlus }[] = [
  { tipo: "no_registrado", titulo: "No estoy registrado", desc: "Soy acudiente y no aparezco en el sistema.", icon: UserPlus },
  { tipo: "perfil_incorrecto", titulo: "Tengo el perfil equivocado", desc: "Aparezco como estudiante siendo acudiente, o al revés.", icon: UserCog },
  { tipo: "hijos_faltantes", titulo: "Me faltan hijos por registrar", desc: "Soy acudiente pero no tengo a todos mis estudiantes.", icon: Users },
];

const MENSAJES_ERROR: Record<string, string> = {
  colegio_invalido: "Colegio inválido.",
  tipo_invalido: "Selecciona un caso válido.",
  cedula_requerida: "La cédula es obligatoria.",
  nombre_requerido: "Escribe tus apellidos y nombres.",
  celular_requerido: "Escribe un número de celular válido.",
  hijos_requeridos: "Escribe al menos la identificación de un estudiante.",
  perfil_invalido: "Selecciona los perfiles.",
  perfiles_iguales: "El perfil actual y el deseado no pueden ser el mismo.",
};

const estadoEstilo: Record<SolicitudPub["estado"], { label: string; clase: string }> = {
  pendiente: { label: "Pendiente", clase: "bg-amber-100 text-amber-800 border-amber-300" },
  solucionado: { label: "Solucionado", clase: "bg-green-100 text-green-800 border-green-300" },
};

const PERFILES = ["Estudiante", "Acudiente"] as const;

export default function RegistroCorrecciones() {
  const [colegios, setColegios] = useState<ColegioPub[]>([]);
  const [colegioId, setColegioId] = useState<string>("");
  const [tipo, setTipo] = useState<Tipo | "">("");

  // Campos del formulario
  const [cedula, setCedula] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [nombres, setNombres] = useState("");
  const [celular, setCelular] = useState("");
  const [perfilActual, setPerfilActual] = useState("");
  const [perfilSolicitado, setPerfilSolicitado] = useState("");
  const [hijos, setHijos] = useState<string[]>(["", "", "", ""]);

  const [solicitudes, setSolicitudes] = useState<SolicitudPub[]>([]);
  const [enviando, setEnviando] = useState(false);

  const colegioSel = colegios.find((c) => c.id === colegioId);

  useEffect(() => {
    apiRequest<{ colegios: ColegioPub[] }>("/api/registro/colegios")
      .then((r) => setColegios(r.colegios || []))
      .catch(() => toast({ title: "Error", description: "No se pudieron cargar los colegios.", variant: "destructive" }));
  }, []);

  const cargarSolicitudes = useCallback(async (cid: string) => {
    if (!cid) return;
    try {
      const r = await apiRequest<{ solicitudes: SolicitudPub[] }>(
        `/api/registro/solicitudes?colegio_id=${encodeURIComponent(cid)}`,
      );
      setSolicitudes(r.solicitudes || []);
    } catch {
      /* silencioso: la tabla simplemente no carga */
    }
  }, []);

  useEffect(() => { if (colegioId) cargarSolicitudes(colegioId); }, [colegioId, cargarSolicitudes]);

  const limpiarForm = () => {
    setCedula(""); setApellidos(""); setNombres(""); setCelular("");
    setPerfilActual(""); setPerfilSolicitado(""); setHijos(["", "", "", ""]);
  };

  const setHijo = (i: number, v: string) => {
    setHijos((prev) => prev.map((h, idx) => (idx === i ? v.replace(/\D/g, "") : h)));
  };

  const pideHijos = tipo === "no_registrado" || tipo === "hijos_faltantes" ||
    (tipo === "perfil_incorrecto" && perfilSolicitado === "Acudiente");

  const enviar = async () => {
    const hijosLimpios = hijos.map((h) => h.replace(/\D/g, "")).filter(Boolean);
    const payload: Record<string, unknown> = { colegio_id: colegioId, tipo, cedula };

    if (tipo === "no_registrado") {
      payload.apellidos = apellidos; payload.nombres = nombres; payload.celular = celular; payload.hijos = hijosLimpios;
    } else if (tipo === "perfil_incorrecto") {
      payload.perfil_actual = perfilActual; payload.perfil_solicitado = perfilSolicitado;
      if (perfilSolicitado === "Acudiente") payload.hijos = hijosLimpios;
    } else {
      payload.hijos = hijosLimpios;
    }

    setEnviando(true);
    try {
      await apiRequest("/api/registro/solicitudes", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "¡Solicitud enviada!", description: "Quedó registrada en la lista. La revisaremos en orden de llegada." });
      limpiarForm();
      setTipo("");
      await cargarSolicitudes(colegioId);
    } catch (e) {
      const code = e instanceof ApiError ? (e.body as { error?: string })?.error : undefined;
      toast({ title: "No se pudo enviar", description: (code && MENSAJES_ERROR[code]) || "Revisa los datos e intenta de nuevo.", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <header className="bg-primary text-primary-foreground py-4 px-4 shadow">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {colegioSel?.logo_url && (
            <img src={colegioSel.logo_url} alt="" className="h-10 w-10 rounded-full bg-white object-contain" />
          )}
          <div>
            <h1 className="text-lg font-bold leading-tight">Registro</h1>
            <p className="text-xs opacity-90">{colegioSel ? colegioSel.nombre : "Notas Normi"}</p>
          </div>
        </div>
      </header>

      {/* Imagen de Normi tipo hero: fija al fondo de la pantalla, solo en el
          paso de selección de colegio. Detrás del contenido y sin capturar clics. */}
      {!colegioId && (
        <img
          src="/normi-registro.webp"
          alt="Normi"
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[78vw] h-auto sm:w-auto sm:h-[62vh] max-w-none object-contain object-bottom z-0 pointer-events-none select-none"
        />
      )}

      <main className="relative z-10 max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* PASO 1: elegir colegio */}
        {!colegioId && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-center text-foreground">¿De qué colegio eres?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {colegios.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColegioId(c.id)}
                  className="flex items-center gap-3 p-4 bg-white rounded-xl border-2 border-transparent hover:border-primary shadow-soft transition-colors text-left"
                >
                  {c.logo_url
                    ? <img src={c.logo_url} alt="" className="h-12 w-12 rounded-full object-contain" />
                    : <div className="h-12 w-12 rounded-full bg-emerald-100" />}
                  <span className="font-semibold text-foreground">{c.nombre}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* PASO 2: elegir caso */}
        {colegioId && !tipo && (
          <section className="space-y-4">
            <button onClick={() => setColegioId("")} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="w-4 h-4" /> Cambiar colegio
            </button>
            <h2 className="text-xl font-bold text-center text-foreground">¿Cuál es tu caso?</h2>
            <div className="grid gap-3">
              {CASOS.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.tipo}
                    onClick={() => { limpiarForm(); setTipo(c.tipo); }}
                    className="flex items-start gap-3 p-4 bg-white rounded-xl border-2 border-transparent hover:border-primary shadow-soft transition-colors text-left"
                  >
                    <Icon className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">{c.titulo}</p>
                      <p className="text-sm text-muted-foreground">{c.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* PASO 3: formulario del caso */}
        {colegioId && tipo && (
          <section className="space-y-4">
            <button onClick={() => { setTipo(""); limpiarForm(); }} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="w-4 h-4" /> Cambiar caso
            </button>
            <Card className="p-5 space-y-4">
              <h2 className="text-lg font-bold text-foreground">{CASOS.find((c) => c.tipo === tipo)?.titulo}</h2>

              {/* Cédula (todos los casos) */}
              <div className="space-y-1.5">
                <Label>Tu número de cédula</Label>
                <Input inputMode="numeric" value={cedula} onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))} placeholder="Ej: 1102345678" />
              </div>

              {/* Caso 1: no registrado → apellidos, nombres */}
              {tipo === "no_registrado" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Tus apellidos</Label>
                    <Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} placeholder="Apellidos" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tus nombres</Label>
                    <Input value={nombres} onChange={(e) => setNombres(e.target.value)} placeholder="Nombres" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tu número de celular</Label>
                    <Input inputMode="numeric" value={celular} onChange={(e) => setCelular(e.target.value.replace(/\D/g, ""))} placeholder="Ej: 3001234567" />
                  </div>
                </>
              )}

              {/* Caso 2: perfil incorrecto → perfiles */}
              {tipo === "perfil_incorrecto" && (
                <>
                  <div className="space-y-1.5">
                    <Label>¿Con qué perfil apareces ahora?</Label>
                    <div className="flex gap-2">
                      {PERFILES.map((p) => (
                        <Button key={p} type="button" variant={perfilActual === p ? "default" : "outline"} className="flex-1"
                          onClick={() => { setPerfilActual(p); if (perfilSolicitado === p) setPerfilSolicitado(""); }}>
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>¿Cuál debería ser tu perfil?</Label>
                    <div className="flex gap-2">
                      {PERFILES.map((p) => (
                        <Button key={p} type="button" variant={perfilSolicitado === p ? "default" : "outline"} className="flex-1"
                          disabled={perfilActual === p}
                          onClick={() => setPerfilSolicitado(p)}>
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Cédulas de los hijos (cuando aplica) */}
              {pideHijos && (
                <div className="space-y-1.5">
                  <Label>
                    {tipo === "hijos_faltantes"
                      ? "Identificación de los estudiantes que te faltan (hasta 4)"
                      : "Identificación de tus estudiantes en el colegio (hasta 4)"}
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {hijos.map((h, i) => (
                      <Input key={i} inputMode="numeric" value={h} onChange={(e) => setHijo(i, e.target.value)}
                        placeholder={`Estudiante ${i + 1}${i === 0 ? "" : " (opcional)"}`} />
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={enviar} disabled={enviando} className="w-full">
                {enviando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…</> : "Enviar solicitud"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Una vez enviada, tu solicitud no se puede editar ni borrar y se atiende en orden de llegada.
              </p>
            </Card>
          </section>
        )}

        {/* TABLA PÚBLICA (visible apenas hay colegio) */}
        {colegioId && (
          <section className="space-y-2">
            <h3 className="font-semibold text-foreground">Solicitudes recibidas</h3>
            <div className="bg-white rounded-xl shadow-soft overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-emerald-50 text-emerald-900">
                    <tr>
                      <th className="text-left px-3 py-2 w-12">#</th>
                      <th className="text-left px-3 py-2">Nombre</th>
                      <th className="text-left px-3 py-2">Caso</th>
                      <th className="text-left px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solicitudes.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Aún no hay solicitudes.</td></tr>
                    ) : solicitudes.map((s) => (
                      <tr key={s.turno} className="border-t">
                        <td className="px-3 py-2 text-muted-foreground">{s.turno}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{s.nombre}</td>
                        <td className="px-3 py-2">{s.tipo_label}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${estadoEstilo[s.estado].clase}`}>
                            {s.estado === "solucionado" && <CheckCircle2 className="w-3 h-3" />}
                            {estadoEstilo[s.estado].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Los documentos de identidad no se muestran aquí por privacidad; solo el colegio los ve.</p>
          </section>
        )}
      </main>
    </div>
  );
}
