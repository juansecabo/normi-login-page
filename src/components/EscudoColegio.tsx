import { Building2 } from "lucide-react";

interface EscudoColegioProps {
  /** URL del logo subido. Si null/undefined muestra placeholder. */
  logoUrl?: string | null;
  /** Nombre del colegio — usado para iniciales y alt text. */
  nombre?: string | null;
  /** Color de fondo del placeholder (color primario del colegio). */
  colorFondo?: string | null;
  /** Tamaño en px (cuadrado). Default 64. */
  size?: number;
  /** Si true, anillo blanco + sombra (estilo header). Default true. */
  conBorde?: boolean;
  className?: string;
}

const initial = (nombre?: string | null): string => {
  if (!nombre) return "";
  return nombre.trim().charAt(0).toUpperCase();
};

/**
 * Escudo institucional reusable. Reemplaza el `escudo.webp` hardcoded que
 * mostraba el de la Normal en TODOS los colegios.
 *
 * - Si el colegio tiene logo_url: muestra la imagen con borde blanco circular.
 * - Si no, muestra la inicial del nombre en un circulo coloreado.
 *
 * El borde es el mismo en ambos casos para que todos los colegios se vean
 * homogeneos visualmente.
 */
const EscudoColegio = ({
  logoUrl,
  nombre,
  colorFondo,
  size = 64,
  conBorde = true,
  className = "",
}: EscudoColegioProps) => {
  const dimension = { width: size, height: size };
  const borderClass = conBorde
    ? "border-4 border-white shadow-md ring-1 ring-black/5"
    : "";
  const baseClass = `rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${borderClass} ${className}`;

  if (logoUrl) {
    return (
      <div className={baseClass} style={dimension}>
        <img
          src={logoUrl}
          alt={nombre ? `Escudo de ${nombre}` : "Escudo"}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Placeholder: inicial o icono
  const ini = initial(nombre);
  return (
    <div
      className={baseClass}
      style={{
        ...dimension,
        backgroundColor: colorFondo || "#6E59A5",
      }}
    >
      {ini ? (
        <span
          className="text-white font-bold"
          style={{ fontSize: size * 0.45 }}
        >
          {ini}
        </span>
      ) : (
        <Building2 className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </div>
  );
};

export default EscudoColegio;
