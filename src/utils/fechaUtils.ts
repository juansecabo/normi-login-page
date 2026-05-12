const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const fechaKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const todayKey = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

export const fmtDiaHeader = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const formatted = `${WEEKDAYS[date.getDay()]} ${d} de ${MONTHS[m - 1]} de ${y}`;
  if (key === todayKey()) return `Hoy, ${formatted}`;
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};
