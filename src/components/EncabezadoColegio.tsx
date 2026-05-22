import { useColegioConfig } from "@/hooks/useColegioConfig";

/**
 * Banda con el nombre del colegio actual. Se renderiza arriba del card
 * "Bienvenido(a)" en todos los dashboards. El nombre viene de la fila de
 * `Colegios` del tenant (RLS filtra por colegio_id).
 */
const EncabezadoColegio = () => {
  const { nombre } = useColegioConfig();
  if (!nombre) return null;
  return (
    <p className="text-center text-lg font-semibold text-foreground mb-4 max-w-2xl mx-auto">
      {nombre}
    </p>
  );
};

export default EncabezadoColegio;
