// Configuración de Lemon Squeezy (Merchant of Record). Corre SOLO en el servidor.
// Variables en Vercel:
//   LEMONSQUEEZY_API_KEY          clave de la API (Settings → API)
//   LEMONSQUEEZY_STORE_ID         número de la tienda
//   LEMONSQUEEZY_WEBHOOK_SECRET   el "signing secret" del webhook
//   LEMONSQUEEZY_VARIANTS         {"starter":{"latam":"111","global":"222"},"pro":{...},"enterprise":{...}}
//   LEMONSQUEEZY_FOUNDER_CODES    (opcional) {"50":"FUNDADOR50"}: código de descuento por % de fundador
//   SUPABASE_SERVICE_ROLE_KEY     solo para aplicar los avisos del webhook (nunca en el navegador)
export type Region = 'latam' | 'global';
type Variants = Record<string, Partial<Record<Region, string>>>;

function json<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export const lemon = {
  apiKey: process.env.LEMONSQUEEZY_API_KEY,
  storeId: process.env.LEMONSQUEEZY_STORE_ID,
  webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
  variants: json<Variants>(process.env.LEMONSQUEEZY_VARIANTS, {}),
  founderCodes: json<Record<string, string>>(process.env.LEMONSQUEEZY_FOUNDER_CODES, {}),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://veltrixsystem.app',
};

export function variantFor(plan: string, region: Region): string | undefined {
  return lemon.variants[plan]?.[region];
}

/** De un variant_id a su plan (para los avisos del webhook) */
export function planForVariant(variantId: string | number | null | undefined): string | null {
  if (variantId === null || variantId === undefined) return null;
  const v = String(variantId);
  for (const [plan, regions] of Object.entries(lemon.variants)) {
    if (Object.values(regions).some((x) => String(x) === v)) return plan;
  }
  return null;
}
