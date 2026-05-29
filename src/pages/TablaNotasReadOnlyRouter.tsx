import { useEffect, useState } from "react";
import { esGradoPreescolar } from "@/utils/preescolar";
import TablaNotas from "./TablaNotas";
import TablaNotasPreescolarReadOnly from "./rector/TablaNotasPreescolarReadOnly";

/**
 * Vista de notas para perfiles internos NO profesores (rector, coordinador,
 * admin): muestran la tabla EXACTAMENTE como el profesor, pero en solo lectura.
 *
 * Preescolar usa su propia tabla descriptiva (TablaNotasPreescolarReadOnly);
 * el resto reutiliza la tabla del profesor (TablaNotas) con soloLectura.
 */
const TablaNotasReadOnlyRouter = () => {
  const [grado, setGrado] = useState<string | null>(() =>
    localStorage.getItem("gradoSeleccionado")
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "gradoSeleccionado") setGrado(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (esGradoPreescolar(grado)) {
    return <TablaNotasPreescolarReadOnly />;
  }
  return <TablaNotas soloLectura />;
};

export default TablaNotasReadOnlyRouter;
