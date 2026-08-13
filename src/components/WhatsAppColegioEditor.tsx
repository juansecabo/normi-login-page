import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Phone, Loader2, Save, CheckCircle2, AlertCircle, Search, Eye, EyeOff } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

/**
 * Ficha "Número de WhatsApp del Agente" en Configurar Institución.
 * Flujo sin intentos fallidos: el Administrador pega el id de la WABA + el
 * token; la plataforma consulta a Meta los números de esa WABA, se elige uno,
 * valida contra Meta y guarda (además suscribe la app). Solo Administrador.
 *
 * NO registra el número en Meta (eso lo hace Juan allá, con su PIN 2FA).
 */
type Numero = { id: string; display_phone_number: string; verified_name?: string; code_verification_status?: string };

const WhatsAppColegioEditor = ({ colegioId }: { colegioId?: string }) => {
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState<{ configurado: boolean; numero: string | null; waba_id: string | null; phone_number_id: string | null; template_name: string | null; language_code: string | null } | null>(null);

  const [wabaId, setWabaId] = useState("");
  const [token, setToken] = useState("");
  const [verToken, setVerToken] = useState(false);
  const [numeros, setNumeros] = useState<Numero[] | null>(null);
  const [elegido, setElegido] = useState<string>("");

  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Anti-autocompletado del navegador: los campos arrancan de solo-lectura y se
  // desbloquean al primer clic, así Chrome no puede rellenarlos al cargar.
  const [editable, setEditable] = useState(false);
  const desbloquear = () => setEditable(true);

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await apiClient.institucion.getWhatsapp(colegioId);
      setEstado(r);
      if (r.waba_id) setWabaId(r.waba_id); // no es secreto: se precarga por comodidad
    } catch {
      setError("No se pudo cargar el estado del número.");
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [colegioId]);

  const buscar = async () => {
    setOk(null); setError(null); setNumeros(null); setElegido("");
    if (!wabaId.trim() || !token.trim()) { setError("Pega el id de la WABA y el token."); return; }
    setBuscando(true);
    try {
      const r = await apiClient.institucion.listarNumerosWaba(wabaId.trim(), token.trim());
      if (!r.numeros.length) { setError("Esa WABA no tiene números. Revisa el id o el token."); return; }
      setNumeros(r.numeros);
      if (r.numeros.length === 1) setElegido(r.numeros[0].id);
    } catch (e: any) {
      setError(String(e?.body?.detail || e?.message || "No se pudo consultar Meta."));
    } finally {
      setBuscando(false);
    }
  };

  const guardar = async () => {
    setOk(null); setError(null);
    if (!elegido) { setError("Elige un número de la lista."); return; }
    setGuardando(true);
    try {
      const r = await apiClient.institucion.setWhatsapp(
        { waba_id: wabaId.trim(), token: token.trim(), phone_number_id: elegido },
        colegioId,
      );
      setOk(`Número configurado: ${r.numero}. El Agente ya responde y envía por ese WhatsApp.`);
      setToken(""); setNumeros(null); setElegido("");
      await cargar();
    } catch (e: any) {
      setError(String(e?.body?.detail || e?.message || "No se pudo guardar."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Phone className="h-5 w-5 text-primary" /> Número de WhatsApp del Agente
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          El número por el que Normi responde y envía a este colegio. Primero registra el número en Meta;
          luego pega aquí el <strong>id de la WABA</strong> y el <strong>token</strong>, elige el número y guarda.
          Se valida contra Meta antes de guardar — si algo falta, te avisa en el momento.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {cargando ? (
          <div className="py-6 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : (
          <>
            {estado?.configurado ? (
              <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2 space-y-0.5">
                <div className="flex items-center gap-1 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Configurado actualmente</div>
                {estado.numero && <div>Número: <span className="font-semibold">{estado.numero}</span></div>}
                {estado.waba_id && <div>WABA: <span className="font-mono">{estado.waba_id}</span></div>}
                <div className="text-emerald-700/80">Token: guardado y oculto por seguridad · déjalo vacío si no lo vas a cambiar.</div>
              </div>
            ) : (
              <div className="text-xs"><span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle className="h-3.5 w-3.5" /> Sin número configurado</span></div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">Id de la WABA</label>
                <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="Ej: 1845618089735128" autoComplete="off" readOnly={!editable} onFocus={desbloquear} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Token de la WABA</label>
                <div className="relative">
                  <Input type={verToken ? "text" : "password"} value={token} onChange={(e) => setToken(e.target.value)}
                    placeholder="Token permanente de Meta" autoComplete="new-password" readOnly={!editable} onFocus={desbloquear} className="pr-10" />
                  <button type="button" onClick={() => setVerToken((v) => !v)} tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {verToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Button onClick={buscar} disabled={buscando} variant="outline" className="gap-2">
              {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar números
            </Button>

            {numeros && (
              <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                <p className="text-sm font-medium">Elige el número de este colegio</p>
                <div className="space-y-2">
                  {numeros.map((n) => (
                    <label key={n.id} className="flex items-center gap-3 cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted">
                      <input type="radio" name="wa-num" value={n.id} checked={elegido === n.id} onChange={() => setElegido(n.id)} />
                      <span className="text-sm">
                        <span className="font-semibold">{n.display_phone_number}</span>
                        {n.verified_name ? <span className="text-muted-foreground"> · {n.verified_name}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {ok && <div className="flex items-start gap-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> {ok}</div>}
            {error && <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}</div>}

            {numeros && (
              <Button onClick={guardar} disabled={guardando || !elegido} className="gap-2">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar número
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WhatsAppColegioEditor;
