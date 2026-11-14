// Lleva a Paddle los extras que eligió el dueño (usuarios, sucursales, almacenamiento),
// como ítems adicionales de su suscripción. Paddle cobra la parte proporcional del mes.
import { createClient } from '@supabase/supabase-js';
import { paddle, paddleApi, priceFor, addonPriceFor, type Region } from '../paddle';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  let body: { org_id?: string };
  try { body = await request.json(); } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }); }
  if (!token || !body.org_id) return Response.json({ error: 'Datos inválidos' }, { status: 400 });

  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: b, error } = await asUser.rpc('my_billing', { p_org: body.org_id });
  if (error || !b) return Response.json({ error: 'Sin permiso' }, { status: 403 });
  const billing = b as { plan_code: string; region: Region; subscribed: boolean };
  // Sin suscripción con tarjeta: los extras se cobran en el próximo pago (QR/transferencia o al suscribirse)
  if (!billing.subscribed) return Response.json({ synced: false });
  if (!paddle.apiKey || !serviceKey) return Response.json({ error: 'BILLING_NOT_CONFIGURED' }, { status: 503 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: org } = await admin.from('organizations')
    .select('billing_subscription_id, addon_users, addon_branches, addon_storage_units').eq('id', body.org_id).single();
  const planPrice = priceFor(billing.plan_code, billing.region);
  if (!org?.billing_subscription_id || !planPrice) return Response.json({ error: 'BILLING_PROVIDER_ERROR' }, { status: 409 });

  const items: { price_id: string; quantity: number }[] = [{ price_id: planPrice, quantity: 1 }];
  for (const [code, qty] of [['user', org.addon_users], ['branch', org.addon_branches], ['storage', org.addon_storage_units]] as const) {
    const pid = addonPriceFor(code, billing.region);
    if (Number(qty) > 0) {
      if (!pid) return Response.json({ error: 'BILLING_NOT_CONFIGURED' }, { status: 503 });
      items.push({ price_id: pid, quantity: Number(qty) });
    }
  }
  const r = await paddleApi(`/subscriptions/${org.billing_subscription_id}`, 'PATCH', { items, proration_billing_mode: 'prorated_immediately' });
  return r.ok ? Response.json({ synced: true }) : Response.json({ error: 'BILLING_PROVIDER_ERROR' }, { status: 502 });
}
