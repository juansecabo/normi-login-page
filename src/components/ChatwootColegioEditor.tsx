import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageCircle, Loader2, Save, CheckCircle2, AlertCircle, Eye, EyeOff, ExternalLink } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

/**
 * Ficha "Bandeja de conversaciones (Chatwoot)" en Configurar Institución.
 * Fija/cambia el correo y la contraseña con los que se ingresa a
 * chat.notasnormi.com para ver los chats de ESTE colegio. Cambiar cualquiera
 * de los dos NO altera las conversaciones — solo la forma de entrar.
 *
 * Solo Administrador (el backend además restringe a SuperAdmin/Administrador).
 */
const ChatwootColegioEditor = ({ colegioId }: { colegioId?: string }) => {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [provisionado, setProvisionado] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPass, setVerPass] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await apiClient.institucion.getChatwoot(colegioId);
      setProvisionado(r.provisionado);
      setEmail(r.email || "");
    } catch {
      setError("No se pudo cargar el estado de la bandeja.");
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [colegioId]);

  const guardar = async () => {
    setOk(null); setError(null);
    const correo = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { setError("Escribe un correo válido."); return; }
    if (!provisionado && password.trim().length < 6) { setError("La primera vez debes definir una contraseña de al menos 6 caracteres."); return; }
    if (password.trim() && password.trim().length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    setGuardando(true);
    try {
      const r = await apiClient.institucion.setChatwoot(correo, password.trim() || undefined, colegioId);
      setPassword("");
      setOk(r.creado
        ? "Bandeja configurada. Ya puedes ingresar a chat.notasnormi.com con ese correo y contraseña."
        : "Datos actualizados. Las conversaciones siguen igual; solo cambió la forma de ingresar.");
      await cargar();
    } catch (e: any) {
      const detalle = e?.body?.detail || e?.message || "No se pudo guardar.";
      setError(String(detalle));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="h-5 w-5 text-primary" /> Bandeja de conversaciones
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Correo y contraseña con los que se ingresa a{" "}
          <a href="https://chat.notasnormi.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
            chat.notasnormi.com <ExternalLink className="h-3 w-3" />
          </a>{" "}
          para ver los chats de este colegio. Cambiar el correo o la contraseña <strong>no afecta las conversaciones</strong>, solo la forma de entrar.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {cargando ? (
          <div className="py-6 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : (
          <>
            <div className="text-xs">
              {provisionado
                ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Bandeja activa</span>
                : <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle className="h-3.5 w-3.5" /> Sin configurar — al guardar se crea el acceso</span>}
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Correo de ingreso</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@colegio.edu.co" autoComplete="off" />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">
                Contraseña {provisionado && <span className="text-muted-foreground font-normal">(déjala en blanco para no cambiarla)</span>}
              </label>
              <div className="relative">
                <Input type={verPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={provisionado ? "••••••••" : "Mínimo 6 caracteres"} autoComplete="new-password" className="pr-10" />
                <button type="button" onClick={() => setVerPass((v) => !v)} tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {verPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {ok && <div className="flex items-start gap-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> {ok}</div>}
            {error && <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}</div>}

            <Button onClick={guardar} disabled={guardando} className="gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {provisionado ? "Guardar cambios" : "Configurar bandeja"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ChatwootColegioEditor;
