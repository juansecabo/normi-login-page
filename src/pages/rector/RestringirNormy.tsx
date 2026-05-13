import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, isRectorOrCoordinador } from "@/hooks/useSession";
import HeaderNormy from "@/components/HeaderNormy";

interface Estudiante {
  id_estudiantil: string;
  nombre_estudiante: string;
  apellidos_estudiante: string;
  grado_estudiante: string;
  salon_estudiante: string;
  restringido: boolean;
}

const GRADOS = [
  'Párvulo', 'Prejardín', 'Jardín', 'Transición',
  'Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto',
  'Sexto', 'Séptimo', 'Octavo', 'Noveno', 'Décimo', 'Undécimo',
];

const RestringirNormy = () => {
  const navigate = useNavigate();
  const [gradoSeleccionado, setGradoSeleccionado] = useState("");
  const [salonSeleccionado, setSalonSeleccionado] = useState("");
  const [salones, setSalones] = useState<string[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSalones, setLoadingSalones] = useState(false);
  const [conteosPorGrado, setConteosPorGrado] = useState<Record<string, number>>({});
  const [conteosPorSalon, setConteosPorSalon] = useState<Record<string, number>>({});

  useEffect(() => {
    const session = getSession();
    if (!session.id || !isRectorOrCoordinador()) {
      navigate('/');
      return;
    }

    // Cargar conteos de restringidos por grado
    const cargarConteos = async () => {
      const { data } = await supabase
        .from('Estudiantes')
        .select('grado_estudiante, salon_estudiante')
        .eq('restringido', true);

      if (data) {
        const porGrado: Record<string, number> = {};
        data.forEach(d => {
          porGrado[d.grado_estudiante] = (porGrado[d.grado_estudiante] || 0) + 1;
        });
        setConteosPorGrado(porGrado);
      }
    };
    cargarConteos();
  }, [navigate]);

  // Fetch salones when grado changes
  const fetchSalones = useCallback(async (grado: string) => {
    setLoadingSalones(true);
    setSalones([]);
    setSalonSeleccionado("");
    setEstudiantes([]);
    setConteosPorSalon({});

    try {
      const { data, error } = await supabase
        .from('Estudiantes')
        .select('salon_estudiante, restringido')
        .eq('grado_estudiante', grado);

      if (error) {
        console.error('Error fetching salones:', error);
        return;
      }

      const uniqueSalones = [...new Set((data || []).map(d => d.salon_estudiante))]
        .filter(Boolean)
        .sort();

      // Contar restringidos por salon
      const porSalon: Record<string, number> = {};
      (data || []).forEach(d => {
        if (d.restringido) {
          porSalon[d.salon_estudiante] = (porSalon[d.salon_estudiante] || 0) + 1;
        }
      });
      setConteosPorSalon(porSalon);

      setSalones(uniqueSalones);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoadingSalones(false);
    }
  }, []);

  // Fetch students when salon changes
  const fetchEstudiantes = useCallback(async (grado: string, salon: string) => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('Estudiantes')
        .select('id_estudiantil, nombre_estudiante, apellidos_estudiante, grado_estudiante, salon_estudiante, restringido')
        .eq('grado_estudiante', grado)
        .eq('salon_estudiante', salon)
        .order('apellidos_estudiante', { ascending: true })
        .order('nombre_estudiante', { ascending: true });

      if (error) {
        console.error('Error fetching estudiantes:', error);
        return;
      }

      setEstudiantes(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGradoChange = (grado: string) => {
    setGradoSeleccionado(grado);
    if (grado) {
      fetchSalones(grado);
    } else {
      setSalones([]);
      setSalonSeleccionado("");
      setEstudiantes([]);
    }
  };

  const handleSalonChange = (salon: string) => {
    setSalonSeleccionado(salon);
    if (salon && gradoSeleccionado) {
      fetchEstudiantes(gradoSeleccionado, salon);
    } else {
      setEstudiantes([]);
    }
  };

  const toggleRestriccion = async (idEstudiantil: string, currentValue: boolean) => {
    const delta = currentValue ? -1 : 1;

    // Optimistic update
    setEstudiantes(prev => prev.map(e =>
      e.id_estudiantil === idEstudiantil ? { ...e, restringido: !currentValue } : e
    ));
    setConteosPorGrado(prev => ({
      ...prev,
      [gradoSeleccionado]: (prev[gradoSeleccionado] || 0) + delta,
    }));
    setConteosPorSalon(prev => ({
      ...prev,
      [salonSeleccionado]: (prev[salonSeleccionado] || 0) + delta,
    }));

    const { error } = await supabase
      .from('Estudiantes')
      .update({ restringido: !currentValue })
      .eq('id_estudiantil', idEstudiantil);

    if (error) {
      console.error('Error updating restriccion:', error);
      // Revert on error
      setEstudiantes(prev => prev.map(e =>
        e.id_estudiantil === idEstudiantil ? { ...e, restringido: currentValue } : e
      ));
      setConteosPorGrado(prev => ({
        ...prev,
        [gradoSeleccionado]: (prev[gradoSeleccionado] || 0) - delta,
      }));
      setConteosPorSalon(prev => ({
        ...prev,
        [salonSeleccionado]: (prev[salonSeleccionado] || 0) - delta,
      }));
    }
  };

  const totalEstudiantes = estudiantes.length;
  const totalRestringidos = estudiantes.filter(e => e.restringido).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HeaderNormy backLink="/dashboard-rector" />

      <main className="flex-1 container mx-auto p-4 md:p-8">
        {/* Breadcrumb */}
        <div className="bg-card rounded-lg shadow-soft p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={() => navigate("/dashboard-rector")}
              className="text-primary hover:underline"
            >
              Inicio
            </button>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-foreground font-medium">Restringir Normy</span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg shadow-soft p-6 mb-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Selecciona grado y salón</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Grado
              </label>
              <select
                value={gradoSeleccionado}
                onChange={(e) => handleGradoChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="">-- Seleccionar grado --</option>
                {GRADOS.map((grado) => {
                  const count = conteosPorGrado[grado] || 0;
                  return (
                    <option key={grado} value={grado}>
                      {grado}{count > 0 ? ` (${count} restringido${count > 1 ? 's' : ''})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Salón
              </label>
              <select
                value={salonSeleccionado}
                onChange={(e) => handleSalonChange(e.target.value)}
                disabled={!gradoSeleccionado || loadingSalones}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">
                  {loadingSalones ? "Cargando salones..." : "-- Seleccionar salón --"}
                </option>
                {salones.map((salon) => {
                  const count = conteosPorSalon[salon] || 0;
                  return (
                    <option key={salon} value={salon}>
                      {salon}{count > 0 ? ` (${count} restringido${count > 1 ? 's' : ''})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {/* Student List */}
        {gradoSeleccionado && salonSeleccionado && (
          <div className="bg-card rounded-lg shadow-soft overflow-hidden">
            {/* Count header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                {gradoSeleccionado} - Salon {salonSeleccionado}
              </h3>
              {!loading && totalEstudiantes > 0 && (
                <span className="text-sm text-muted-foreground">
                  <span className={totalRestringidos > 0 ? "font-bold text-red-600" : "font-medium"}>
                    {totalRestringidos}
                  </span>
                  {" "}de {totalEstudiantes} estudiantes restringidos
                </span>
              )}
            </div>

            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                Cargando estudiantes...
              </div>
            ) : estudiantes.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No hay estudiantes en este salon
              </div>
            ) : (
              <div className="divide-y divide-border">
                {estudiantes.map((estudiante) => (
                  <label
                    key={estudiante.id_estudiantil}
                    className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                      estudiante.restringido ? "bg-red-50 dark:bg-red-950/20" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={estudiante.restringido}
                      onChange={() => toggleRestriccion(estudiante.id_estudiantil, estudiante.restringido)}
                      className="w-5 h-5 rounded border-border text-primary focus:ring-primary/50 accent-primary cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className={`font-medium ${estudiante.restringido ? "text-red-700 dark:text-red-400" : "text-foreground"}`}>
                        {estudiante.apellidos_estudiante} {estudiante.nombre_estudiante}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {estudiante.id_estudiantil}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Prompt to select */}
        {(!gradoSeleccionado || !salonSeleccionado) && (
          <div className="bg-card rounded-lg shadow-soft p-8 text-center">
            <p className="text-muted-foreground">
              Selecciona un grado y salón para ver los estudiantes.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default RestringirNormy;
