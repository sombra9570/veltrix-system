// Avisos de Lemon Squeezy: pagos, renovaciones, cambios de plan y cancelaciones.
// Verifica la firma (X-Signature) y aplica el cambio en la base con billing_apply.
import { createClient } from '@supabase/supabase-js';
import { lemon, planForVariant } from '../lemon';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function validSignature(raw: string, signature: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(raw)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== signature.length) return false;
  // Comparación en tiempo constante
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

type Attrs = Record<string, unknown> & { urls?: { customer_portal?: string } };

export async function POST(request: Request) {
  if (!lemon.webhookSecret || !serviceKey) return Response.json({ error: 'BILLING_NOT_CONFIGURED' }, { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get('x-signature') ?? '';
  if (!signature || !(await validSignature(raw, signature.toLowerCase(), lemon.webhookSecret))) {
    return Response.json({ error: 'Firma inválida' }, { status: 401 });
  }

  let payload: { meta?: { event_name?: string; custom_data?: { org_id?: string } }; data?: { id?: string; type?: string; attributes?: Attrs } };
  try { payload = JSON.parse(raw); } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }); }

  const event = payload.meta?.event_name ?? '';
  const orgId = payload.meta?.custom_data?.org_id ?? null;
  const type = payload.data?.type;
  const a = payload.data?.attributes ?? {};
  if (!event.startsWith('subscription_')) return Response.json({ ignored: true });

  let planCode: string | null = null;
  let data: Record<string, unknown>;
  if (type === 'subscriptions') {
    planCode = planForVariant(a.variant_id as string | number | undefined);
    data = {
      status: a.status, subscription_id: String(payload.data?.id ?? ''), customer_id: a.customer_id != null ? String(a.customer_id) : null,
      portal_url: a.urls?.customer_portal ?? null, renews_at: a.renews_at ?? null, ends_at: a.ends_at ?? null,
    };
  } else if (type === 'subscription-invoices') {
    data = {
      invoice_id: String(payload.data?.id ?? ''), subscription_id: a.subscription_id != null ? String(a.subscription_id) : null,
      amount_usd: Number(a.total_usd ?? a.total ?? 0) / 100, status: a.status,
    };
  } else {
    return Response.json({ ignored: true });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.rpc('billing_apply', {
    p_provider: 'lemonsqueezy', p_event: event, p_org: orgId, p_plan_code: planCode, p_data: data,
  });
  if (error) {
    // Una suscripción que no es de Veltrix no se reintenta; cualquier otro error, sí (Lemon Squeezy reintenta)
    if (error.message.includes('BILLING_ORG_NOT_FOUND')) return Response.json({ ignored: true });
    return Response.json({ error: 'No se pudo aplicar' }, { status: 500 });
  }
  return Response.json({ ok: true });
}
