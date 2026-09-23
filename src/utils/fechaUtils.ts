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

/**
 * Días (YYYY-MM-DD) que cubre una excusa/permiso, del inicio al fin, sin sábados
 * ni domingos. Para ubicarla en el calendario por los días que cubre y no por el
 * día en que se creó (Juan 2026-09-23). Fechas sin hora: no pasan por Date(iso),
 * que las correría un día por la zona horaria.
 */
export const diasCubiertos = (inicio: string, fin?: string | null): string[] => {
  const ini = String(inicio || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) return [];
  const f = String(fin || ini).slice(0, 10);
  const [y, m, d] = ini.split("-").map(Number);
  const out: string[] = [];
  for (let t = new Date(y, m - 1, d), k = 0; k < 120; t.setDate(t.getDate() + 1), k++) {
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    if (key > f) break;
    if (t.getDay() !== 0 && t.getDay() !== 6) out.push(key);
  }
  return out.length ? out : [ini];
};
