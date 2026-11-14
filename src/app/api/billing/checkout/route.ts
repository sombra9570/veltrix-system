// Crea el pago de la suscripción en Lemon Squeezy y devuelve el link de pago.
// Si la empresa ya tiene suscripción, devuelve su portal (cambiar plan, tarjeta o cancelar).
import { createClient } from '@supabase/supabase-js';
import { lemon, variantFor, type Region } from '../lemon';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

type Billing = {
  plan_code: string; region: Region; founder_active: boolean; founder_discount_pct: number;
  subscribed: boolean; portal_url: string | null; billing_email: string | null;
};

export async function POST(request: Request) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Sesión no válida');
  let body: { org_id?: string; plan_code?: string };
  try { body = await request.json(); } catch { return fail(400, 'Datos inválidos'); }
  if (!body.org_id) return fail(400, 'Datos inválidos');

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  // my_billing solo responde al dueño de la organización
  const { data: b, error } = await asUser.rpc('my_billing', { p_org: body.org_id });
  if (error || !b) return fail(403, 'Sin permiso');
  const billing = b as Billing;

  if (billing.subscribed && billing.portal_url) return Response.json({ url: billing.portal_url, portal: true });

  if (!lemon.apiKey || !lemon.storeId) return fail(503, 'BILLING_NOT_CONFIGURED');
  const plan = body.plan_code ?? billing.plan_code;
  const variant = variantFor(plan, billing.region);
  if (!variant) return fail(503, 'BILLING_NOT_CONFIGURED');
  const discount = billing.founder_active ? lemon.founderCodes[String(billing.founder_discount_pct)] : undefined;

  const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${lemon.apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            ...(billing.billing_email ? { email: billing.billing_email } : {}),
            ...(discount ? { discount_code: discount } : {}),
            custom: { org_id: body.org_id },
          },
          product_options: { redirect_url: `${lemon.siteUrl}/dashboard/owner/plan?pagado=1` },
        },
        relationships: {
          store: { data: { type: 'stores', id: String(lemon.storeId) } },
          variant: { data: { type: 'variants', id: String(variant) } },
        },
      },
    }),
  });
  const j = await res.json().catch(() => null);
  const checkoutUrl = j?.data?.attributes?.url as string | undefined;
  if (!res.ok || !checkoutUrl) return fail(502, 'BILLING_PROVIDER_ERROR');
  return Response.json({ url: checkoutUrl, portal: false });
}
