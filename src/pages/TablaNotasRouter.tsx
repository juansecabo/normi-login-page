import { useEffect, useState } from "react";
import { esGradoPreescolar } from "@/utils/preescolar";
import TablaNotas from "./TablaNotas";
import TablaNotasPreescolar from "./TablaNotasPreescolar";

/**
 * Decide si renderizar la tabla estándar (primaria/secundaria/media)
 * o la tabla especial de preescolar (texto descriptivo por dimensiones).
 *
 * La decisión se basa en el grado guardado en localStorage. El check ocurre
 * antes de montar los hooks de cualquiera de los dos componentes, así no
 * se dispara el fetch de actividades/notas del componente equivocado.
 */
const TablaNotasRouter = () => {
  const [grado, setGrado] = useState<string | null>(() =>
    localStorage.getItem("gradoSeleccionado")
  );

  // Mantener sincronizado si el usuario cambia de grado en otra pestaña
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "gradoSeleccionado") {
        setGrado(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (esGradoPreescolar(grado)) {
    return <TablaNotasPreescolar />;
  }
  return <TablaNotas />;
};

export default TablaNotasRouter;
