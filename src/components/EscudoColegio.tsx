import { useState, useEffect } from "react";
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
 * `color_primario` guarda nombres en español ("verde", "azul"…) que NO son
 * colores CSS válidos. Si se pasan crudos a `backgroundColor`, el navegador los
 * ignora y el fondo queda transparente → la inicial blanca se vuelve invisible.
 * Aquí los resolvemos a hex; aceptamos también hex directo; default = verde marca.
 */
const COLORES_ES: Record<string, string> = {
  verde: "#16a34a", azul: "#2563eb", rojo: "#dc2626", morado: "#7c3aed",
  violeta: "#7c3aed", naranja: "#ea580c", amarillo: "#ca8a04", rosa: "#db2777",
  turquesa: "#0d9488", gris: "#475569", negro: "#1f2937", cafe: "#92400e",
  café: "#92400e", celeste: "#0284c7", vinotinto: "#9f1239",
};
const resolverColor = (c?: string | null): string => {
  const v = (c || "").trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return v;
  return COLORES_ES[v.toLowerCase()] || "#16a34a";
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
  const [imgFallo, setImgFallo] = useState(false);
  // Si cambia la URL, reintentar (limpia el fallo anterior).
  useEffect(() => { setImgFallo(false); }, [logoUrl]);

  // CON escudo Y que cargue bien: mostramos la imagen tal cual la subio el
  // colegio, sin recortar a circulo. object-contain preserva el aspect original.
  // Si la imagen NO carga (red lenta, URL caida...), caemos al placeholder de
  // abajo en vez de dejar el feo icono de imagen rota del navegador.
  if (logoUrl && !imgFallo) {
    return (
      <div
        className={`flex items-center justify-center flex-shrink-0 ${className}`}
        style={dimension}
      >
        <img
          src={logoUrl}
          alt={nombre ? `Escudo de ${nombre}` : "Escudo"}
          className="w-full h-full object-contain"
          onError={() => setImgFallo(true)}
        />
      </div>
    );
  }

  // SIN escudo: placeholder circular con la inicial sobre el color del colegio.
  const borderClass = conBorde
    ? "border-4 border-white shadow-md ring-1 ring-black/5"
    : "";
  const baseClass = `rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${borderClass} ${className}`;
  const ini = initial(nombre);
  return (
    <div
      className={baseClass}
      style={{
        ...dimension,
        backgroundColor: resolverColor(colorFondo),
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
