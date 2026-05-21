import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/apiClient";
import normiImg from "@/assets/normi-examinadora.webp";
import { getSession } from "@/hooks/useSession";
import HeaderNormi from "@/components/HeaderNormi";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Asignacion {
  "Asignatura(s)": string[];
  "Grado(s)": string[];
  "Salon(es)": string[];
}

const NormiExaminadora = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [enviando, setEnviando] = useState(false);
  
  // Form state
  const [tipoActividad, setTipoActividad] = useState<string>("");
  const [asignaturaSeleccionada, setAsignaturaSeleccionada] = useState<string>("");
  const [gradoSeleccionado, setGradoSeleccionado] = useState<string>("");
  const [salonSeleccionado, setSalonSeleccionado] = useState<string>("");
  const [tema, setTema] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [preguntasMultiple, setPreguntasMultiple] = useState<string>("5");
  const [preguntasAbiertas, setPreguntasAbiertas] = useState<string>("0");
  
  // Data from DB
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [asignaturas, setAsignaturas] = useState<string[]>([]);
  const [grados, setGrados] = useState<string[]>([]);
  const [salones, setSalones] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [idProfesor, setIdProfesor] = useState<string>("");

  useEffect(() => {
    const session = getSession();
    
    if (!session.id) {
      navigate("/");
      return;
    }

    setNombres(session.nombres || "");
    setApellidos(session.apellidos || "");

    const fetchAsignaciones = async () => {
      try {
        // Get numero_de_telefono for webhook payload (Fase 10.E.15: vive en Usuarios)
        const { data: profesor, error: profesorError } = await supabase
          .from('Usuarios')
          .select('numero_de_telefono')
          .eq('id', String(session.id))
          .single();

        if (profesorError || !profesor) {
          setLoading(false);
          return;
        }

        // Guardar el numero_de_telefono del profesor
        setIdProfesor(profesor.numero_de_telefono);

        // Get assignments directly by id
        const { data: asignacionesData, error: asignacionError } = await supabase
          .from('Asignación Profesores')
          .select('"Asignatura(s)", "Grado(s)", "Salon(es)"')
          .eq('id', parseInt(session.id!));

        if (asignacionError || !asignacionesData) {
          setLoading(false);
          return;
        }

        setAsignaciones(asignacionesData as Asignacion[]);
        
        // Extract unique asignaturas
        const todasAsignaturas = asignacionesData
          ?.flatMap(a => a['Asignatura(s)'] || [])
          .flat() || [];
        const asignaturasUnicas = [...new Set(todasAsignaturas)].sort((a, b) => a.localeCompare(b, 'es'));
        setAsignaturas(asignaturasUnicas);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAsignaciones();
  }, [navigate]);

  // Update grados when asignatura changes
  useEffect(() => {
    if (!asignaturaSeleccionada) {
      setGrados([]);
      setGradoSeleccionado("");
      return;
    }

    const gradosParaAsignatura = asignaciones
      .filter(a => a['Asignatura(s)']?.includes(asignaturaSeleccionada))
      .flatMap(a => a['Grado(s)'] || [])
      .flat();
    
    const gradosUnicos = [...new Set(gradosParaAsignatura)].sort((a, b) => a.localeCompare(b, 'es'));
    setGrados(gradosUnicos);
    setGradoSeleccionado("");
    setSalonSeleccionado("");
  }, [asignaturaSeleccionada, asignaciones]);

  // Update salones when grado changes
  useEffect(() => {
    if (!gradoSeleccionado || !asignaturaSeleccionada) {
      setSalones([]);
      setSalonSeleccionado("");
      return;
    }

    const salonesParaGrado = asignaciones
      .filter(a => 
        a['Asignatura(s)']?.includes(asignaturaSeleccionada) && 
        a['Grado(s)']?.includes(gradoSeleccionado)
      )
      .flatMap(a => a['Salon(es)'] || [])
      .flat();
    
    const salonesUnicos = [...new Set(salonesParaGrado)].sort((a, b) => a.localeCompare(b, 'es'));
    setSalones(salonesUnicos);
    setSalonSeleccionado("");
  }, [gradoSeleccionado, asignaturaSeleccionada, asignaciones]);

  // Get display label for tipoActividad (capitalized)
  const getTipoActividadLabel = (tipo: string): string => {
    switch (tipo) {
      case 'evaluacion': return 'Evaluación';
      case 'taller': return 'Taller';
      case 'quiz': return 'Quiz';
      default: return tipo;
    }
  };

  const handleCrear = async () => {
    setEnviando(true);

    try {
      // Build payload with idProfesor first
      const payload: Record<string, unknown> = {
        idProfesor,
        timestamp: new Date().toISOString(),
        nombre: nombres,
        apellidos: apellidos,
        tipoActividad,
        asignaturaSeleccionada,
        gradoSeleccionado,
      };

      // Optional: salonSeleccionado (after gradoSeleccionado)
      if (salonSeleccionado) {
        payload.salonSeleccionado = salonSeleccionado;
      }

      // Required: tema
      payload.tema = tema;

      // Optional: instrucciones
      if (instrucciones && instrucciones.trim()) {
        payload.instrucciones = instrucciones.trim();
      }

      // Always include these last two
      payload.preguntasMultiple = parseInt(preguntasMultiple) || 0;
      payload.preguntasAbiertas = parseInt(preguntasAbiertas) || 0;

      // POST /api/examinadora/generar (server, JWT). El server:
      //   1) llama OpenAI con el system prompt de Normi Examinadora
      //   2) parsea las preguntas en estructura JSON
      //   3) llama al word-service Flask que devuelve el DOCX
      //   4) lo retorna como binary directo aquí
      const jwt = apiClient.auth.getToken();
      if (!jwt) {
        throw new Error("Sesión expirada, vuelve a iniciar sesión.");
      }
      const response = await fetch("/api/examinadora/generar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`Error del servidor (${response.status}): ${errBody.slice(0, 200)}`);
      }

      // El server SIEMPRE devuelve DOCX binary cuando responde 200.
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Filename: TipoActividad_Asignatura_Grado_Salon.docx
      const tipoLabel = getTipoActividadLabel(tipoActividad).toUpperCase();
      const asignaturaLabel = asignaturaSeleccionada.toUpperCase().replace(/ /g, "_");
      const gradoLabel = gradoSeleccionado;
      const salonLabel = salonSeleccionado || "";
      const fileName = salonLabel
        ? `${tipoLabel}_${asignaturaLabel}_${gradoLabel}_${salonLabel}.docx`
        : `${tipoLabel}_${asignaturaLabel}_${gradoLabel}.docx`;

      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Use correct grammatical gender: Evaluación (f) vs Taller/Quiz (m)
      const esFemenino = tipoActividad === 'evaluacion';
      toast({
        title: "¡Éxito!",
        description: `${getTipoActividadLabel(tipoActividad)} ${esFemenino ? 'generada' : 'generado'} exitosamente`,
      });
    } catch (error) {
      console.error("Error enviando al webhook:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo generar la actividad. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormi backLink="/dashboard" />

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-8">
        {/* Back button - at top */}
        <div className="max-w-3xl mx-auto mb-4">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
          >
            ← Volver al Dashboard
          </Button>
        </div>

        {/* Title Section with Normi */}
        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-3xl mx-auto text-center mb-8 relative overflow-hidden">
          {/* Normi in background - hidden on mobile */}
          <img
            src={normiImg}
            alt="Normi Examinadora"
            className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 h-full w-auto object-contain pointer-events-none"
          />
          <div className="relative z-10">
            <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground">
              Normi Examinadora
            </h2>
            <p className="text-sm md:text-base text-muted-foreground">
              Crea tus actividades académicas
            </p>
            <p className="text-base md:text-lg text-primary font-semibold mt-4">
              {nombres} {apellidos}
            </p>
          </div>
              {/* Normi image below text on mobile */}
              <img
                src={normiImg}
                alt="Normi Examinadora"
                className="md:hidden mx-auto mt-4 -mb-6 h-32 w-auto object-contain"
              />
            </div>

        {/* Form Section */}
        <div className="bg-card rounded-lg shadow-soft p-8 max-w-3xl mx-auto">
          {loading ? (
            <div className="text-center text-muted-foreground">
              Cargando...
            </div>
          ) : (
            <div className="space-y-6">
              {/* 1. Tipo de actividad */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">1. Quiero crear:</Label>
                <Select value={tipoActividad} onValueChange={setTipoActividad}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder="Selecciona el tipo de actividad" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="evaluacion">Evaluación</SelectItem>
                    <SelectItem value="taller">Taller</SelectItem>
                    <SelectItem value="quiz">Quiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 2. Asignatura */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">2. Asignatura:</Label>
                <Select value={asignaturaSeleccionada} onValueChange={setAsignaturaSeleccionada}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder="Selecciona la asignatura" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {asignaturas.map((asignatura) => (
                      <SelectItem key={asignatura} value={asignatura}>
                        {asignatura}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 3. Grado */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">3. Grado:</Label>
                <Select 
                  value={gradoSeleccionado} 
                  onValueChange={setGradoSeleccionado}
                  disabled={!asignaturaSeleccionada}
                >
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder={asignaturaSeleccionada ? "Selecciona el grado" : "Primero selecciona una asignatura"} />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {grados.map((grado) => (
                      <SelectItem key={grado} value={grado}>
                        {grado}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 4. Salón (opcional) */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">4. Salón (opcional):</Label>
                <Select 
                  value={salonSeleccionado} 
                  onValueChange={setSalonSeleccionado}
                  disabled={!gradoSeleccionado}
                >
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder={gradoSeleccionado ? "Selecciona el salón" : "Primero selecciona un grado"} />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {salones.map((salon) => (
                      <SelectItem key={salon} value={salon}>
                        {salon}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 5. Tema */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">5. Tema:</Label>
                <Input
                  type="text"
                  placeholder="Escribe el tema de la actividad"
                  value={tema}
                  onChange={(e) => setTema(e.target.value)}
                  className="bg-background"
                />
              </div>

              {/* 6. Instrucciones (Opcional) */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">6. Instrucciones (Opcional):</Label>
                <Textarea
                  placeholder="Escribe instrucciones adicionales para la actividad"
                  value={instrucciones}
                  onChange={(e) => setInstrucciones(e.target.value)}
                  className="bg-background min-h-[100px]"
                />
              </div>

              {/* 7. Número de preguntas */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">7. Número de preguntas:</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Selección múltiple:</Label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={parseInt(preguntasMultiple || "0") <= 0}
                        onClick={() => setPreguntasMultiple(String(Math.max(0, parseInt(preguntasMultiple || "0") - 1)))}
                        className="sm:hidden flex items-center justify-center w-10 h-10 rounded-md bg-muted hover:bg-muted/80 text-foreground font-bold text-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-muted"
                      >
                        −
                      </button>
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        value={preguntasMultiple}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          if (val > 30) {
                            toast({
                              title: "Límite alcanzado",
                              description: "El máximo de preguntas de selección múltiple es 30",
                              variant: "destructive",
                            });
                            setPreguntasMultiple("30");
                          } else if (val < 0) {
                            setPreguntasMultiple("0");
                          } else {
                            setPreguntasMultiple(e.target.value);
                          }
                        }}
                        onFocus={(e) => {
                          if (e.target.value === "0") {
                            setPreguntasMultiple("");
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value === "") {
                            setPreguntasMultiple("0");
                          }
                        }}
                        className="bg-background flex-1 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none sm:[appearance:auto] sm:[&::-webkit-outer-spin-button]:appearance-auto sm:[&::-webkit-inner-spin-button]:appearance-auto"
                      />
                      <button
                        type="button"
                        disabled={parseInt(preguntasMultiple || "0") >= 30}
                        onClick={() => setPreguntasMultiple(String(Math.min(30, parseInt(preguntasMultiple || "0") + 1)))}
                        className="sm:hidden flex items-center justify-center w-10 h-10 rounded-md bg-muted hover:bg-muted/80 text-foreground font-bold text-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-muted"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Preguntas abiertas:</Label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={parseInt(preguntasAbiertas || "0") <= 0}
                        onClick={() => setPreguntasAbiertas(String(Math.max(0, parseInt(preguntasAbiertas || "0") - 1)))}
                        className="sm:hidden flex items-center justify-center w-10 h-10 rounded-md bg-muted hover:bg-muted/80 text-foreground font-bold text-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-muted"
                      >
                        −
                      </button>
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        value={preguntasAbiertas}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          if (val > 30) {
                            toast({
                              title: "Límite alcanzado",
                              description: "El máximo de preguntas abiertas es 30",
                              variant: "destructive",
                            });
                            setPreguntasAbiertas("30");
                          } else if (val < 0) {
                            setPreguntasAbiertas("0");
                          } else {
                            setPreguntasAbiertas(e.target.value);
                          }
                        }}
                        onFocus={(e) => {
                          if (e.target.value === "0") {
                            setPreguntasAbiertas("");
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value === "") {
                            setPreguntasAbiertas("0");
                          }
                        }}
                        className="bg-background flex-1 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none sm:[appearance:auto] sm:[&::-webkit-outer-spin-button]:appearance-auto sm:[&::-webkit-inner-spin-button]:appearance-auto"
                      />
                      <button
                        type="button"
                        disabled={parseInt(preguntasAbiertas || "0") >= 30}
                        onClick={() => setPreguntasAbiertas(String(Math.min(30, parseInt(preguntasAbiertas || "0") + 1)))}
                        className="sm:hidden flex items-center justify-center w-10 h-10 rounded-md bg-muted hover:bg-muted/80 text-foreground font-bold text-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-muted"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botón Crear */}
              <Button
                onClick={handleCrear}
                className="w-full bg-gradient-to-r from-primary to-green-600 hover:from-green-600 hover:to-primary text-white font-semibold py-6 text-lg"
                disabled={!tipoActividad || !asignaturaSeleccionada || !gradoSeleccionado || !tema || enviando}
              >
                {enviando ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generando {getTipoActividadLabel(tipoActividad)}...
                  </>
                ) : (
                  "Crear"
                )}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default NormiExaminadora;
