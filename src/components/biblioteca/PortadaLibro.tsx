import { GENEROS } from "./comun";

/** Portada de respaldo: el color del género con el título encima. */
/** `mini`: miniatura sin texto (en tamaños pequeños el título no cabe). */
const PortadaLibro = ({ url, titulo, genero, className = "", mini = false }: { url: string | null; titulo: string; genero: string | null; className?: string; mini?: boolean }) => {
  const g = GENEROS.find((x) => x.value === genero);
  const color = g && g.letra ? g.color : "#0f766e";
  return url
    ? <img src={url} alt="" className={`object-cover ${className}`} loading="lazy" />
    : (
      <div className={`flex items-end p-3 ${className}`} style={{ background: `linear-gradient(160deg, ${color}, ${color}cc 55%, #1f2937)` }}>
        {!mini && <span className="text-white font-bold text-sm leading-tight line-clamp-4 drop-shadow">{titulo}</span>}
      </div>
    );
};

export default PortadaLibro;
