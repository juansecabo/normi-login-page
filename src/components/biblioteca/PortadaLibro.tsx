import { colorGenero } from "./comun";

/** Portada de respaldo: el color del género con el título encima. */
/** `mini`: miniatura sin texto (en tamaños pequeños el título no cabe). */
const PortadaLibro = ({ url, titulo, genero, className = "", mini = false }: { url: string | null; titulo: string; genero: string | null; className?: string; mini?: boolean }) => {
  const color = colorGenero(genero);
  return url
    ? <img src={url} alt="" className={`object-cover ${className}`} loading="lazy" />
    : (
      <div className={`flex items-end p-3 ${className}`} style={{ background: color }}>
        {!mini && <span className="text-white font-bold text-sm leading-tight line-clamp-4">{titulo}</span>}
      </div>
    );
};

export default PortadaLibro;
