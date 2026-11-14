// Avisos de Paddle: suscripciones (alta, cambio de plan, mora, cancelación) y pagos.
// Verifica la firma, aplica el cambio con billing_apply y, si alguien ganó un descuento
// por invitar, se lo pone en Paddle para su próximo cobro (una sola vez).
import { createClient } from '@supabase/supabase-js';
import { paddle, paddleApi, planForPrice, validPaddleSignature } from '../paddle';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Sub = {
  id: string; status: string; customer_id: string; next_billed_at: string | null;
  items?: { price?: { id?: string } }[];
  scheduled_change?: { action?: string; effective_at?: string } | null;
  custom_data?: { org_id?: string } | null;
};
type Txn = {
  id: string; status: string; subscription_id: string | null; custom_data?: { org_id?: string } | null;
  details?: { totals?: { grand_total?: string } }; currency_code?: string;
  billing_period?: { ends_at?: string } | null;
};

/** Descuentos por invitar pendientes → se aplican en Paddle al próximo cobro */
async function applyReferralDiscounts() {
  const admin = createClient(url, serviceKey!, { auth: { persistSession: false } });
  const { data: rows } = await admin.from('organizations')
    .select('id, referral_credit_pct, billing_subscription_id')
    .eq('billing_provider', 'paddle').gt('referral_credit_pct', 0).not('billing_subscription_id', 'is', null);
  for (const o of rows ?? []) {
    const discount = paddle.referralDiscounts[String(o.referral_credit_pct)];
    if (!discount) continue;
    const r = await paddleApi(`/subscriptions/${o.billing_subscription_id}`, 'PATCH', {
      discount: { id: discount, effective_from: 'next_billing_period' },
    });
    if (r.ok) await admin.from('organizations').update({ referral_credit_pct: 0 }).eq('id', o.id);
  }
}

export async function POST(request: Request) {
  if (!paddle.webhookSecret || !serviceKey) return Response.json({ error: 'BILLING_NOT_CONFIGURED' }, { status: 503 });
  const raw = await request.text();
  const sig = request.headers.get('paddle-signature') ?? '';
  if (!sig || !(await validPaddleSignature(raw, sig, paddle.webhookSecret))) {
    return Response.json({ error: 'Firma inválida' }, { status: 401 });
  }

  let payload: { event_type?: string; data?: Sub & Txn };
  try { payload = JSON.parse(raw); } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }); }
  const type = payload.event_type ?? '';
  const d = payload.data;
  if (!d) return Response.json({ ignored: true });

  let event: string; let orgId: string | null; let planCode: string | null = null; let data: Record<string, unknown>;

  if (type.startsWith('subscription.')) {
    const s = d as Sub;
    // Paddle "canceled" = ya terminó; cancelación programada = sigue activa hasta la fecha
    const cancelAt = s.scheduled_change?.action === 'cancel' ? s.scheduled_change.effective_at : null;
    const status = s.status === 'canceled' ? 'expired'
      : s.status === 'trialing' ? 'on_trial'
      : cancelAt ? 'cancelled' : s.status;   // active, past_due, paused
    event = 'subscription_updated';
    orgId = s.custom_data?.org_id ?? null;
    // Los extras van como ítems aparte: el plan es el ítem cuyo precio corresponde a un plan
    planCode = (s.items ?? []).map((it) => planForPrice(it.price?.id)).find((x) => x) ?? null;
    data = { status, subscription_id: s.id, customer_id: s.customer_id, renews_at: s.next_billed_at, ends_at: cancelAt };
  } else if (type === 'transaction.completed' || type === 'transaction.payment_failed') {
    const t = d as Txn;
    if (!t.subscription_id) return Response.json({ ignored: true });
    event = type === 'transaction.completed' ? 'subscription_payment_success' : 'subscription_payment_failed';
    orgId = t.custom_data?.org_id ?? null;
    // Paddle envía montos en la unidad mínima (centavos)
    data = { invoice_id: t.id, subscription_id: t.subscription_id, amount_usd: Number(t.details?.totals?.grand_total ?? 0) / 100,
             renews_at: t.billing_period?.ends_at ?? null };
  } else {
    return Response.json({ ignored: true });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.rpc('billing_apply', {
    p_provider: 'paddle', p_event: event, p_org: orgId, p_plan_code: planCode, p_data: data,
  });
  if (error) {
    if (error.message.includes('BILLING_ORG_NOT_FOUND')) return Response.json({ ignored: true });
    return Response.json({ error: 'No se pudo aplicar' }, { status: 500 });   // Paddle reintenta
  }
  if (event === 'subscription_payment_success') await applyReferralDiscounts();
  return Response.json({ ok: true });
}
