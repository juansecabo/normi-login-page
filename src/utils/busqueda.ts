/** true si cada palabra de la búsqueda aparece en alguno de los campos,
 *  ignorando tildes y mayúsculas ("sofia" encuentra "Sofía"). Query vacío = todo pasa. */
export const coincideBusqueda = (query: string, ...campos: (string | null | undefined)[]): boolean => {
  const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(query.trim());
  if (!q) return true;
  const texto = norm(campos.filter(Boolean).join(" "));
  return q.split(/\s+/).every((w) => texto.includes(w));
};
