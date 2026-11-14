// Paddle Billing (Merchant of Record). Corre SOLO en el servidor.
// Variables en Vercel:
//   PADDLE_API_KEY              clave de la API (Developer tools → Authentication)
//   PADDLE_WEBHOOK_SECRET       "secret key" del destino de notificaciones
//   PADDLE_ENV                  "sandbox" para pruebas; vacío = producción
//   PADDLE_PRICES               {"starter":{"latam":"pri_…","global":"pri_…"},"pro":{…},"enterprise":{…}}
//   PADDLE_FOUNDER_DISCOUNTS    (opcional) {"50":"dsc_…"}: descuento recurrente de 12 meses por % de fundador
//   PADDLE_REFERRAL_DISCOUNTS   (opcional) {"15":"dsc_…","20":"dsc_…","30":"dsc_…"}: descuentos de UN solo cobro
//   NEXT_PUBLIC_PADDLE_CLIENT_TOKEN  token público para abrir el pago en /pagar
//   SUPABASE_SERVICE_ROLE_KEY   solo para los avisos y descuentos (nunca en el navegador)
export type Region = 'latam' | 'global';
type Prices = Record<string, Partial<Record<Region, string>>>;

function json<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export const paddle = {
  apiKey: process.env.PADDLE_API_KEY,
  webhookSecret: process.env.PADDLE_WEBHOOK_SECRET,
  base: process.env.PADDLE_ENV === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com',
  prices: json<Prices>(process.env.PADDLE_PRICES, {}),
  founderDiscounts: json<Record<string, string>>(process.env.PADDLE_FOUNDER_DISCOUNTS, {}),
  referralDiscounts: json<Record<string, string>>(process.env.PADDLE_REFERRAL_DISCOUNTS, {}),
};

export const priceFor = (plan: string, region: Region) => paddle.prices[plan]?.[region];

/** De un price_id de Paddle a su plan de Veltrix */
export function planForPrice(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  for (const [plan, regions] of Object.entries(paddle.prices)) {
    if (Object.values(regions).includes(priceId)) return plan;
  }
  return null;
}

/** Llamada a la API de Paddle; devuelve { ok, data } sin lanzar errores */
export async function paddleApi<T = unknown>(path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown) {
  const res = await fetch(`${paddle.base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${paddle.apiKey}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  return { ok: res.ok, data: (j?.data ?? null) as T | null, error: j?.error };
}

/** Verifica la firma "Paddle-Signature: ts=…;h1=…" (HMAC-SHA256 de "ts:cuerpo") */
export async function validPaddleSignature(raw: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(';').map((p) => p.split('=') as [string, string]));
  const ts = parts.ts; const h1 = (parts.h1 ?? '').toLowerCase();
  if (!ts || !h1) return false;
  // Evita reenvíos viejos (más de 5 minutos)
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}:${raw}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== h1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ h1.charCodeAt(i);
  return diff === 0;
}
