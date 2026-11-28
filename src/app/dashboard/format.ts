/** Monto con el formato y la moneda correctos para el idioma del usuario */
export function money(amount: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Cobranza en calle: cifras exactas, sin decimales */
export function moneyWhole(amount: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
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

/** Enlace de WhatsApp para un teléfono. Sin código de país: los celulares de 8 dígitos (6x/7x) se toman como Bolivia (+591). */
export function whatsappLink(phone: string): string {
  const raw = phone.trim();
  let d = raw.replace(/\D/g, '');
  if (!raw.startsWith('+')) {
    if (d.startsWith('00')) d = d.slice(2);
    else if (/^[67]\d{7}$/.test(d)) d = `591${d}`;
  }
  return `https://wa.me/${d}`;
}
