// Pago de la suscripción con Paddle.
//  - Sin suscripción: crea la transacción y devuelve el link de pago (/pagar?_ptxn=…).
//  - Con suscripción y otro plan: cambia el plan en Paddle (se cobra la diferencia prorrateada).
//  - Con suscripción y el mismo plan: abre el portal del cliente (tarjeta, facturas, cancelar).
import { createClient } from '@supabase/supabase-js';
import { paddle, paddleApi, priceFor, addonPriceFor, type Region } from '../paddle';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

type Billing = { plan_code: string; region: Region; founder_active: boolean; founder_discount_pct: number; subscribed: boolean };

export async function POST(request: Request) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Sesión no válida');
  let body: { org_id?: string; plan_code?: string };
  try { body = await request.json(); } catch { return fail(400, 'Datos inválidos'); }
  if (!body.org_id) return fail(400, 'Datos inválidos');

  // my_billing solo responde al dueño de la organización
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: b, error } = await asUser.rpc('my_billing', { p_org: body.org_id });
  if (error || !b) return fail(403, 'Sin permiso');
  const billing = b as Billing;

  if (!paddle.apiKey || !serviceKey) return fail(503, 'BILLING_NOT_CONFIGURED');
  const plan = body.plan_code ?? billing.plan_code;
  const priceId = priceFor(plan, billing.region);
  if (!priceId) return fail(503, 'BILLING_NOT_CONFIGURED');

  if (billing.subscribed) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: org } = await admin.from('organizations')
      .select('billing_subscription_id, billing_customer_id, addon_users, addon_branches, addon_storage_units').eq('id', body.org_id).single();
    if (!org?.billing_subscription_id) return fail(409, 'BILLING_PROVIDER_ERROR');

    if (plan !== billing.plan_code) {
      // El plan nuevo + los extras que ya tenía
      const items: { price_id: string; quantity: number }[] = [{ price_id: priceId, quantity: 1 }];
      for (const [code, qty] of [['user', org.addon_users], ['branch', org.addon_branches], ['storage', org.addon_storage_units]] as const) {
        const pid = addonPriceFor(code, billing.region);
        if (Number(qty) > 0 && pid) items.push({ price_id: pid, quantity: Number(qty) });
      }
      const r = await paddleApi(`/subscriptions/${org.billing_subscription_id}`, 'PATCH', {
        items,
        proration_billing_mode: 'prorated_immediately',
      });
      return r.ok ? Response.json({ changed: true }) : fail(502, 'BILLING_PROVIDER_ERROR');
    }
    const r = await paddleApi<{ urls?: { general?: { overview?: string } } }>(
      `/customers/${org.billing_customer_id}/portal-sessions`, 'POST', { subscription_ids: [org.billing_subscription_id] });
    const portal = r.data?.urls?.general?.overview;
    return portal ? Response.json({ url: portal, portal: true }) : fail(502, 'BILLING_PROVIDER_ERROR');
  }

  const discount = billing.founder_active ? paddle.founderDiscounts[String(billing.founder_discount_pct)] : undefined;
  // Extras elegidos durante la prueba también entran en la suscripción
  const adminNew = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: ad } = await adminNew.from('organizations')
    .select('addon_users, addon_branches, addon_storage_units').eq('id', body.org_id).single();
  const newItems: { price_id: string; quantity: number }[] = [{ price_id: priceId, quantity: 1 }];
  for (const [code, qty] of [['user', ad?.addon_users], ['branch', ad?.addon_branches], ['storage', ad?.addon_storage_units]] as const) {
    const pid = addonPriceFor(code, billing.region);
    if (Number(qty) > 0 && pid) newItems.push({ price_id: pid, quantity: Number(qty) });
  }
  const r = await paddleApi<{ checkout?: { url?: string } }>('/transactions', 'POST', {
    items: newItems,
    custom_data: { org_id: body.org_id },
    ...(discount ? { discount_id: discount } : {}),
  });
  const checkoutUrl = r.data?.checkout?.url;
  return checkoutUrl ? Response.json({ url: checkoutUrl, portal: false }) : fail(502, 'BILLING_PROVIDER_ERROR');
}
