import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Label } from "@/components/ui/label";
import ResponsiveSelect from "@/components/ResponsiveSelect";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSession, isAdmin, puedeAccederDashboard } from "@/hooks/useSession";

const PERFILES_INTERNOS = ['Profesores', 'Coordinadores', 'Todo el personal interno', 'Toda la comunidad'];
import HeaderNormy from "@/components/HeaderNormy";
import { Loader2, FileUp, X, Clock, Trash2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const WEBHOOK_URL =
  "https://n8n.notasnormy.com/webhook/af44e992-4372-48ce-b661-73019d6cab9d";

const NIVELES_GRADOS: Record<string, string[]> = {
  Preescolar: ["Prejardín", "Jardín", "Transición"],
  Primaria: ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto"],
  Secundaria: ["Sexto", "Séptimo", "Octavo", "Noveno"],
  Media: ["Décimo", "Undécimo"],
};

const SALONES = ["1", "2", "3", "4", "5", "6"];

interface DocumentoEnviado {
  id: number;
  remitente: string;
  destinatarios: string;
  mensaje: string;
  archivo_url: string | null;
  fecha: string;
}

const EnviarDocumento = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [remitente, setRemitente] = useState("");
  const [idRemitente, setIdRemitente] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Destinatarios state
  const [perfil, setPerfil] = useState("");
  const [nivel, setNivel] = useState("");
  const [grado, setGrado] = useState("");
  const [salon, setSalon] = useState("");
  const [estudiante, setEstudiante] = useState("");
  const [estudiantes, setEstudiantes] = useState<{ id: string; nombre: string }[]>([]);
  const [loadingEstudiantes, setLoadingEstudiantes] = useState(false);

  // Internos (para selección individual)
  const [internos, setInternos] = useState<{ id: string; nombre: string }[]>([]);
  const [internoSeleccionado, setInternoSeleccionado] = useState("");
  const [loadingInternos, setLoadingInternos] = useState(false);
  const [cargo, setCargo] = useState("");

  // Archivo y mensaje
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState("");

  // Historial
  const [historial, setHistorial] = useState<DocumentoEnviado[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [selectedHistorial, setSelectedHistorial] = useState<DocumentoEnviado | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session.id) {
      navigate("/");
      return;
    }
    setRemitente(`${session.cargo} ${session.nombres} ${session.apellidos}`);
    setIdRemitente(session.id!);
    setCargo(session.cargo || "");
  }, [navigate]);

  // Fetch estudiantes cuando cambia grado + salón
  useEffect(() => {
    if (!grado || !salon || salon === "Todos") {
      setEstudiantes([]);
      setEstudiante("");
      return;
    }
    const fetchEstudiantes = async () => {
      setLoadingEstudiantes(true);
      const { data } = await supabase
        .from("Estudiantes")
        .select("id_estudiantil, apellidos_estudiante, nombre_estudiante")
        .eq("grado_estudiante", grado)
        .eq("salon_estudiante", salon)
        .order("apellidos_estudiante", { ascending: true })
        .order("nombre_estudiante", { ascending: true });
      setEstudiantes(
        data?.map((e) => ({
          id: e.id_estudiantil,
          nombre: `${e.apellidos_estudiante} ${e.nombre_estudiante}`,
        })) || []
      );
      setLoadingEstudiantes(false);
    };
    fetchEstudiantes();
  }, [grado, salon]);

  // Fetch internos cuando se selecciona un perfil interno
  useEffect(() => {
    if (!PERFILES_INTERNOS.includes(perfil)) {
      setInternos([]);
      setInternoSeleccionado("");
      return;
    }
    const fetchInternos = async () => {
      setLoadingInternos(true);
      let query = supabase
        .from("Internos")
        .select("id, nombres, apellidos, cargo")
        .order("apellidos", { ascending: true })
        .order("nombres", { ascending: true });

      if (perfil === "Profesores") {
        query = query.eq("cargo", "Profesor(a)");
      } else if (perfil === "Coordinadores") {
        query = query.eq("cargo", "Coordinador(a)");
      }

      const { data } = await query;
      setInternos(
        data?.map((i) => ({
          id: String(i.id),
          nombre: `${i.apellidos} ${i.nombres}`,
        })) || []
      );
      setLoadingInternos(false);
    };
    fetchInternos();
  }, [perfil]);

  const fetchHistorial = async () => {
    setLoadingHistorial(true);
    const { data } = await supabase
      .from("Comunicados")
      .select("*")
      .eq("id_remitente", idRemitente)
      .eq("tipo", "documento")
      .order("fecha", { ascending: false });
    setHistorial((data as DocumentoEnviado[]) || []);
    setLoadingHistorial(false);
  };

  const handleEliminar = async () => {
    if (!deleteId) return;
    await supabase.from("Comunicados").delete().eq("id", deleteId);
    setHistorial((prev) => prev.filter((c) => c.id !== deleteId));
    setDeleteId(null);
  };

  // Reset dependientes al cambiar perfil
  const handlePerfilChange = (value: string) => {
    setPerfil(value);
    setNivel("");
    setGrado("");
    setSalon("");
    setEstudiante("");
    setInternoSeleccionado("");
  };

  const handleNivelChange = (value: string) => {
    setNivel(value);
    setGrado("");
    setSalon("");
    setEstudiante("");
  };

  const handleGradoChange = (value: string) => {
    setGrado(value);
    setSalon("");
    setEstudiante("");
  };

  const handleSalonChange = (value: string) => {
    setSalon(value);
    setEstudiante("");
  };

  // Construir texto de destinatarios
  const buildDestinatarios = (): string => {
    // Interno individual
    if (PERFILES_INTERNOS.includes(perfil) && internoSeleccionado && internoSeleccionado !== "Todos") {
      const interno = internos.find(i => i.id === internoSeleccionado);
      return interno ? `${interno.nombre}` : perfil;
    }

    if (estudiante && estudiante !== "Todos") {
      if (perfil === "Estudiantes") {
        return `Estudiante con id ${estudiante}`;
      } else if (perfil === "Padres de familia") {
        return `Padres de estudiante con id ${estudiante}`;
      } else {
        return `Estudiante y padres de estudiante con id ${estudiante}`;
      }
    }

    let texto = perfil;

    if (!nivel || nivel === "Todos") {
      return texto;
    }

    if (!grado) {
      texto += ` de ${nivel}`;
      return texto;
    }

    texto += ` de ${grado}`;

    if (salon && salon !== "Todos") {
      texto += ` ${salon}`;
    }

    return texto;
  };

  const destinatariosTexto = buildDestinatarios();

  const canSend = perfil && archivo;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setArchivo(file);
    }
  };

  const handleRemoveFile = () => {
    setArchivo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleEnviar = async () => {
    setShowConfirm(false);
    setEnviando(true);

    try {
      if (!archivo) throw new Error("No se seleccionó archivo");

      // 1. Subir archivo a Supabase Storage
      const timestamp = Date.now();
      // Sanitizar nombre: quitar acentos y caracteres especiales
      const nombreLimpio = archivo.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileName = `${timestamp}_${nombreLimpio}`;

      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(fileName, archivo);

      if (uploadError) {
        throw new Error(`Error subiendo archivo: ${uploadError.message}`);
      }

      // 2. Obtener URL pública
      const { data: urlData } = supabase.storage
        .from("documentos")
        .getPublicUrl(fileName);

      const archivoUrl = urlData.publicUrl;

      // 3. Enviar al webhook
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remitente,
          destinatarios: destinatariosTexto,
          mensaje: mensaje.trim(),
          archivo_url: archivoUrl,
          id_remitente: idRemitente,
          perfil: perfil || null,
          nivel: (nivel && nivel !== "Todos") ? nivel : null,
          grado: grado || null,
          salon: (salon && salon !== "Todos") ? salon : null,
          id_estudiantil: (internoSeleccionado && internoSeleccionado !== "Todos") ? internoSeleccionado : (estudiante && estudiante !== "Todos") ? estudiante : null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status}`);
      }

      toast({
        title: "Documento enviado",
        description: "El documento se está enviando por WhatsApp.",
      });

      // Limpiar solo archivo y mensaje, mantener destinatarios
      setArchivo(null);
      setMensaje("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error enviando documento:", error);
      const errorMsg = error instanceof Error ? error.message : "Error desconocido";
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  const formatFecha = (fecha: string) => {
    const d = new Date(fecha);
    return d.toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const backLink = isAdmin() ? "/dashboard-admin" : puedeAccederDashboard() ? "/dashboard-rector" : "/dashboard";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink={backLink} />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6 max-w-2xl mx-auto">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate(backLink)} className="text-primary hover:underline">Inicio</button>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">Enviar Documento</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto mb-6 text-center">Envía un documento a cualquier grupo o individuo dentro de la institución.</p>

        <div className="bg-card rounded-lg shadow-soft p-6 md:p-8 max-w-2xl mx-auto">
          <Tabs defaultValue="enviar" onValueChange={(v) => { if (v === "historial") fetchHistorial(); }}>
            <TabsList className="flex w-full">
              <TabsTrigger value="enviar" className="flex-1 text-xs md:text-sm px-2 md:px-3">Enviar Documento</TabsTrigger>
              <TabsTrigger value="historial" className="flex-1 text-xs md:text-sm px-2 md:px-3">Documentos Enviados</TabsTrigger>
            </TabsList>

            <TabsContent value="enviar">
              <h2 className="text-2xl font-bold text-foreground mb-6 text-center mt-4">
                Enviar Documento
              </h2>

              {/* Destinatarios */}
              <div className="space-y-4 mb-6">
                <h3 className="text-lg font-semibold text-foreground">
                  Destinatarios
                </h3>

                {/* Perfil */}
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <ResponsiveSelect
                    value={perfil}
                    onValueChange={handlePerfilChange}
                    placeholder="Selecciona el perfil"
                    options={[
                      { value: "Estudiantes", label: "Estudiantes" },
                      { value: "Padres de familia", label: "Padres de familia" },
                      { value: "Estudiantes y Padres de familia", label: "Estudiantes y Padres de familia" },
                      ...(['Rector', 'Coordinador(a)'].includes(cargo) ? [
                        { value: "Profesores", label: "Profesores" },
                        { value: "Coordinadores", label: "Coordinadores" },
                        { value: "Todo el personal interno", label: "Todo el personal interno" },
                        { value: "Toda la comunidad", label: "Toda la comunidad" },
                      ] : []),
                    ]}
                  />
                </div>

                {/* Selección individual de interno */}
                {PERFILES_INTERNOS.includes(perfil) && perfil !== 'Toda la comunidad' && (
                  <div className="space-y-2">
                    <Label>Persona</Label>
                    <ResponsiveSelect
                      value={internoSeleccionado}
                      onValueChange={setInternoSeleccionado}
                      placeholder={loadingInternos ? "Cargando..." : "Todos"}
                      options={[
                        { value: "Todos", label: "Todos" },
                        ...internos.map((i) => ({ value: i.id, label: i.nombre })),
                      ]}
                    />
                  </div>
                )}

                {/* Nivel */}
                {perfil && !PERFILES_INTERNOS.includes(perfil) && (
                  <div className="space-y-2">
                    <Label>Nivel</Label>
                    <ResponsiveSelect
                      value={nivel}
                      onValueChange={handleNivelChange}
                      placeholder="Selecciona el nivel"
                      options={[
                        { value: "Todos", label: "Todos los niveles" },
                        ...Object.keys(NIVELES_GRADOS).map((n) => ({ value: n, label: n })),
                      ]}
                    />
                  </div>
                )}

                {/* Grado - solo si se eligió un nivel específico */}
                {nivel && nivel !== "Todos" && (
                  <div className="space-y-2">
                    <Label>Grado</Label>
                    <ResponsiveSelect
                      value={grado}
                      onValueChange={handleGradoChange}
                      placeholder="Selecciona el grado"
                      options={(NIVELES_GRADOS[nivel] || []).map((g) => ({ value: g, label: g }))}
                    />
                  </div>
                )}

                {/* Salón - solo si se eligió grado */}
                {grado && (
                  <div className="space-y-2">
                    <Label>Salón</Label>
                    <ResponsiveSelect
                      value={salon}
                      onValueChange={handleSalonChange}
                      placeholder="Selecciona el salón"
                      options={[
                        { value: "Todos", label: "Todos" },
                        ...SALONES.map((s) => ({ value: s, label: s })),
                      ]}
                    />
                  </div>
                )}

                {/* Estudiante - solo si se eligió salón específico */}
                {salon && salon !== "Todos" && (
                  <div className="space-y-2">
                    <Label>Estudiante</Label>
                    <ResponsiveSelect
                      value={estudiante}
                      onValueChange={setEstudiante}
                      placeholder={loadingEstudiantes ? "Cargando..." : "Todos los estudiantes"}
                      options={[
                        { value: "Todos", label: "Todos los estudiantes" },
                        ...estudiantes.map((e) => ({ value: e.id, label: e.nombre })),
                      ]}
                    />
                  </div>
                )}

                {/* Preview de destinatarios */}
                {perfil && (
                  <p className="text-sm text-muted-foreground">
                    Destinatarios:{" "}
                    <span className="font-medium text-foreground">
                      {destinatariosTexto}
                    </span>
                  </p>
                )}
              </div>

              {/* Archivo */}
              <div className="space-y-2 mb-6">
                <h3 className="text-lg font-semibold text-foreground">Archivo</h3>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer cursor-pointer"
                />
                {archivo && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    <FileUp className="w-4 h-4 shrink-0" />
                    <span className="truncate flex-1">{archivo.name}</span>
                    <span className="text-xs shrink-0">
                      ({(archivo.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      onClick={handleRemoveFile}
                      className="text-destructive hover:text-destructive/80 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Mensaje (opcional) */}
              <div className="space-y-2 mb-6">
                <h3 className="text-lg font-semibold text-foreground">
                  Mensaje <span className="text-sm font-normal text-muted-foreground">(opcional)</span>
                </h3>
                <Textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Escribe un mensaje para acompañar el documento..."
                  rows={4}
                />
              </div>

              {/* Botón enviar */}
              <button
                disabled={!canSend || enviando}
                onClick={() => setShowConfirm(true)}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-lg transition-all duration-200 hover:shadow-md hover:scale-[1.01] hover:from-orange-600 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {enviando ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <FileUp className="w-5 h-5" />
                    Enviar documento
                  </>
                )}
              </button>
            </TabsContent>

            <TabsContent value="historial">
              <h2 className="text-2xl font-bold text-foreground mb-6 text-center mt-4">
                Documentos Enviados
              </h2>

              {loadingHistorial ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cargando...
                </div>
              ) : historial.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No has enviado documentos aún.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar por destinatario o mensaje..."
                      className="pl-9"
                    />
                  </div>
                  {(() => {
                    const totalHist = historial.length;
                    const numeroByIdHist = new Map<number, number>();
                    historial.forEach((c, i) => numeroByIdHist.set(c.id, totalHist - i));
                    return historial.filter((c) => {
                      if (!busqueda.trim()) return true;
                      const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                      const term = normalize(busqueda);
                      return normalize(c.destinatarios).includes(term) || normalize(c.mensaje).includes(term);
                    }).map((c) => (
                    <div key={c.id} className="bg-primary/10 border-2 border-primary/40 rounded-lg p-4 space-y-2 cursor-pointer hover:bg-primary/15 hover:border-primary/60 transition-colors" onClick={() => setSelectedHistorial(c)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatFecha(c.fecha)}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-primary">#{numeroByIdHist.get(c.id)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm">
                        <span className="font-medium text-foreground">Para:</span>{" "}
                        {c.destinatarios}
                      </p>
                      {c.archivo_url && (
                        <a
                          href={c.archivo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileUp className="w-4 h-4 shrink-0" />
                          Ver documento
                        </a>
                      )}
                      {c.mensaje && (
                        <p className="text-sm whitespace-pre-wrap bg-stone-50 border border-stone-200 p-3 rounded-md leading-relaxed">
                          {c.mensaje}
                        </p>
                      )}
                    </div>
                  ));
                  })()}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Diálogo de confirmación */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envío</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Remitente:</span>{" "}
                  {remitente}
                </p>
                <p>
                  <span className="font-medium text-foreground">
                    Destinatarios:
                  </span>{" "}
                  {destinatariosTexto}
                </p>
                <p>
                  <span className="font-medium text-foreground">Archivo:</span>{" "}
                  {archivo?.name}
                </p>
                {mensaje.trim() && (
                  <>
                    <p>
                      <span className="font-medium text-foreground">Mensaje:</span>
                    </p>
                    <p className="whitespace-pre-wrap bg-stone-50 border border-stone-200 p-3 rounded-md leading-relaxed">
                      {mensaje}
                    </p>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">
              Cancelar
            </button>
            <button onClick={handleEnviar} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
              Enviar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación de eliminación */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar documento</DialogTitle>
            <DialogDescription>
              Este documento se eliminará permanentemente y no se podrá recuperar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted">
              Cancelar
            </button>
            <button onClick={handleEliminar} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90">
              Eliminar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para ver documento completo */}
      <Dialog open={!!selectedHistorial} onOpenChange={(open) => !open && setSelectedHistorial(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedHistorial && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  Para: {selectedHistorial.destinatarios}
                </DialogTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatFecha(selectedHistorial.fecha)}
                </div>
              </DialogHeader>
              {selectedHistorial.archivo_url && (
                <a
                  href={selectedHistorial.archivo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <FileUp className="w-4 h-4 shrink-0" />
                  Ver documento
                </a>
              )}
              {selectedHistorial.mensaje && (
                <p className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-md">
                  {selectedHistorial.mensaje}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EnviarDocumento;
