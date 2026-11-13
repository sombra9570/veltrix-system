/** Monto con el formato y la moneda correctos para el idioma del usuario */
export function money(amount: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Hora corta (14:05) en el idioma del usuario */
export function shortTime(iso: string, lang: string) {
  try {
    return new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso.slice(11, 16);
  }
}

/** Convierte lo que escribe el usuario (con coma o punto) a número */
export function parseAmount(v: string): number {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
