import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/apiClient";
import PhoneInput from "@/components/PhoneInput";
import { capitalizarNombre } from "@/utils/texto";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";

/**
 * Auto-registro de acudientes — "Soy acudiente y quiero registrarme" (login).
 * Sucesor del registro viejo de Vercel (que llegaba por link de WhatsApp):
 * ahora es una página propia, multi-tenant (el colegio se deriva de los
 * acudidos) y sobre el modelo Usuarios + Acudientes.
 *
 * Pasos: 1) datos del acudiente → 2) estudiantes a cargo (validados uno a
 * uno contra el colegio) → 3) resumen y envío.
 */

interface Acudido { id: string; nombres: string; apellidos: string; grado: string; salon: string; colegio_id: string; colegio_nombre: string; }

const soloDigitos = (v: string) => v.replace(/\D/g, "");

const RegistroAcudiente = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [paso, setPaso] = useState(1);

  // Paso 1 — datos del acudiente
  const [cedula, setCedula] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [nombres, setNombres] = useState("");
  const [telefono, setTelefono] = useState("");
  const [genero, setGenero] = useState("");
  const [fechaNac, setFechaNac] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [verContrasena, setVerContrasena] = useState(false);

  // Paso 2 — acudidos
  const [acudidos, setAcudidos] = useState<Acudido[]>([]);
  const [cedAcudido, setCedAcudido] = useState("");
  const [validando, setValidando] = useState(false);

  // Paso 3 — envío / éxito
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState<{ colegio: string; contrasenaConservada: boolean } | null>(null);

  const err = (title: string, description?: string) => toast({ title, description, variant: "destructive" });

  const continuarPaso1 = () => {
    if (!/^\d{3,15}$/.test(soloDigitos(cedula))) { err("Cédula inválida", "El número de identidad debe tener entre 3 y 15 dígitos (el tuyo tiene " + soloDigitos(cedula).length + ")."); return; }
    if (!apellidos.trim() || !nombres.trim()) { err("Faltan tus apellidos o nombres"); return; }
    if (soloDigitos(telefono).length < 10) { err("Teléfono inválido", "Escribe tu número de celular (es donde recibirás los comunicados del colegio)."); return; }
    if (genero !== "M" && genero !== "F") { err("Falta el género"); return; }
    if (!fechaNac) { err("Falta tu fecha de nacimiento"); return; }
    if (contrasena.length < 4 || contrasena.length > 50) { err("Contraseña inválida", "Debe tener entre 4 y 50 caracteres."); return; }
    if (contrasena !== confirmar) { err("Las contraseñas no coinciden"); return; }
    setPaso(2);
  };

  const agregarAcudido = async () => {
    const ced = soloDigitos(cedAcudido);
    if (!/^\d{3,15}$/.test(ced)) { err("Documento inválido", "El documento del estudiante debe tener entre 3 y 15 dígitos."); return; }
    if (acudidos.some((a) => a.id === ced)) { err("Ya agregaste ese estudiante"); return; }
    if (ced === soloDigitos(cedula)) { err("Documento inválido", "Tu propia cédula no puede ser la de un estudiante a cargo."); return; }
    setValidando(true);
    try {
      const r = await apiRequest<{ existe: boolean; coincidencias?: Acudido[] }>("/api/registro/validar-estudiante", {
        method: "POST", body: JSON.stringify({ cedula: ced }),
      });
      if (!r.existe || !r.coincidencias?.length) {
        err("Estudiante no encontrado", `El documento ${ced} no está registrado como estudiante. Verifica el número o comunícate con la institución.`);
        return;
      }
      // Si los ya agregados fijan un colegio, la coincidencia debe ser de ese.
      const colegioActual = acudidos[0]?.colegio_id;
      const match = colegioActual
        ? r.coincidencias.find((c) => c.colegio_id === colegioActual)
        : r.coincidencias[0];
      if (!match) {
        err("Colegios distintos", "Ese estudiante pertenece a otro colegio. Todos los estudiantes deben ser del mismo colegio.");
        return;
      }
      setAcudidos((prev) => [...prev, match]);
      setCedAcudido("");
    } catch (e: any) {
      err("No se pudo validar", e?.body?.detail || e?.message);
    } finally {
      setValidando(false);
    }
  };

  const registrar = async () => {
    setEnviando(true);
    try {
      const r = await apiRequest<{ ok: boolean; colegio_nombre: string; contrasena_conservada: boolean }>("/api/registro/acudiente", {
        method: "POST",
        body: JSON.stringify({
          cedula: soloDigitos(cedula), nombres: nombres.trim(), apellidos: apellidos.trim(),
          telefono: soloDigitos(telefono), genero, fecha_de_nacimiento: fechaNac, contrasena,
          acudidos: acudidos.map((a) => a.id),
        }),
      });
      setExito({ colegio: r.colegio_nombre, contrasenaConservada: r.contrasena_conservada });
    } catch (e: any) {
      err("No se pudo completar el registro", e?.body?.detail || e?.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-soft">
        <CardHeader>
          <CardTitle className="text-xl text-center">Registro de acudientes</CardTitle>
          {!exito && <p className="text-sm text-muted-foreground text-center">Paso {paso} de 3</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          {exito ? (
            <div className="text-center space-y-4 py-4">
              <Check className="w-12 h-12 text-primary mx-auto" />
              <p className="font-semibold text-lg">¡Registro completado!</p>
              <p className="text-sm text-muted-foreground">
                Quedaste registrado(a) como acudiente en <strong>{exito.colegio}</strong>.{" "}
                {exito.contrasenaConservada
                  ? "Ya tenías una cuenta, así que tu contraseña sigue siendo la de siempre (si no la recuerdas, usa “¿Olvidó su contraseña?”)."
                  : "Ya puedes iniciar sesión con tu cédula y la contraseña que elegiste."}
              </p>
              <Button onClick={() => navigate("/")} className="w-full">Iniciar sesión</Button>
            </div>
          ) : paso === 1 ? (
            <>
              <div>
                <Label className="text-sm">Tu número de identidad *</Label>
                <Input value={cedula} onChange={(e) => setCedula(soloDigitos(e.target.value))} inputMode="numeric" placeholder="Solo números" autoComplete="off" className="mt-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label className="text-sm">Apellidos *</Label><Input value={apellidos} onChange={(e) => setApellidos(capitalizarNombre(e.target.value))} className="mt-1" /></div>
                <div><Label className="text-sm">Nombres *</Label><Input value={nombres} onChange={(e) => setNombres(capitalizarNombre(e.target.value))} className="mt-1" /></div>
              </div>
              <div>
                <Label className="text-sm">Celular (WhatsApp) *</Label>
                <div className="mt-1"><PhoneInput value={telefono} onChange={setTelefono} placeholder="3001234567" /></div>
                <p className="text-xs text-muted-foreground mt-1">A este número te llegarán los comunicados y notas del colegio.</p>
              </div>
              <div>
                <Label className="text-sm">Género *</Label>
                <select value={genero} onChange={(e) => setGenero(e.target.value)} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Selecciona…</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </div>
              <div>
                <Label className="text-sm">Fecha de nacimiento *</Label>
                <Input type="date" value={fechaNac} onChange={(e) => setFechaNac(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Contraseña *</Label>
                  <div className="relative mt-1">
                    <Input type={verContrasena ? "text" : "password"} value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoComplete="new-password" className="pr-10" />
                    <button type="button" onClick={() => setVerContrasena(!verContrasena)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {verContrasena ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Confirmar contraseña *</Label>
                  <div className="relative mt-1">
                    <Input type={verContrasena ? "text" : "password"} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" className="pr-10" />
                    <button type="button" onClick={() => setVerContrasena(!verContrasena)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {verContrasena ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => navigate("/")} className="gap-1"><ArrowLeft className="w-4 h-4" /> Volver</Button>
                <Button onClick={continuarPaso1}>Continuar</Button>
              </div>
            </>
          ) : paso === 2 ? (
            <>
              <p className="text-sm text-muted-foreground">Agrega los estudiantes que tienes a cargo (mínimo 1, máximo 4) con su número de identidad.</p>
              {acudidos.map((a) => (
                <div key={a.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                  <div className="text-sm">
                    <p className="font-medium">{a.apellidos} {a.nombres}</p>
                    <p className="text-muted-foreground text-xs">{a.grado} {a.salon} · {a.colegio_nombre} · doc. {a.id}</p>
                  </div>
                  <button onClick={() => setAcudidos((prev) => prev.filter((x) => x.id !== a.id))} className="p-1 text-muted-foreground hover:text-destructive" title="Quitar">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {acudidos.length < 4 && (
                <div className="flex gap-2">
                  <Input value={cedAcudido} onChange={(e) => setCedAcudido(soloDigitos(e.target.value))} inputMode="numeric" placeholder="Documento del estudiante" onKeyDown={(e) => { if (e.key === "Enter") agregarAcudido(); }} />
                  <Button onClick={agregarAcudido} disabled={validando} variant="outline" className="gap-1 shrink-0">
                    {validando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar
                  </Button>
                </div>
              )}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setPaso(1)} className="gap-1"><ArrowLeft className="w-4 h-4" /> Atrás</Button>
                <Button onClick={() => {
                  // Si dejó un documento escrito sin presionar «Agregar», no seguir:
                  // seguramente olvidó agregar a ese estudiante.
                  if (cedAcudido.trim()) { err("Te falta agregar ese estudiante", "Escribiste un documento pero no presionaste «Agregar». Agrégalo, o borra el campo si no era."); return; }
                  if (acudidos.length === 0) { err("Agrega al menos un estudiante"); return; }
                  setPaso(3);
                }}>Continuar</Button>
              </div>
            </>
          ) : (
            <>
              <div className="border border-border rounded-lg p-4 text-sm space-y-1">
                <p><span className="text-muted-foreground">Acudiente:</span> {apellidos} {nombres} (doc. {soloDigitos(cedula)})</p>
                <p><span className="text-muted-foreground">Celular:</span> +{soloDigitos(telefono)}</p>
                <p><span className="text-muted-foreground">Colegio:</span> {acudidos[0]?.colegio_nombre}</p>
                <p className="text-muted-foreground pt-1">Estudiantes a cargo:</p>
                {acudidos.map((a) => <p key={a.id}>• {a.apellidos} {a.nombres} — {a.grado} {a.salon}</p>)}
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setPaso(2)} disabled={enviando} className="gap-1"><ArrowLeft className="w-4 h-4" /> Atrás</Button>
                <Button onClick={registrar} disabled={enviando} className="gap-2">
                  {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Registrarme
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RegistroAcudiente;
