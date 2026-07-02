/**
 * Convierte texto a número aceptando coma O punto como separador decimal:
 * "4,5" y "4.5" valen 4.5. En toda Notas Normi la coma se toma como punto
 * (en Colombia se digita con coma pero el sistema guarda/muestra con punto).
 * Devuelve NaN si no es un número válido.
 */
export const aNumero = (v: string | number | null | undefined): number =>
  Number(String(v ?? "").trim().replace(",", "."));
