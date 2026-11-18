// Firma por pocos minutos la imagen del QR de pago del negocio, solo para el cliente de una mesa
// cuyo pedido ya fue aceptado con cobro por QR. El bucket es privado.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request: Request) {
  if (!url || !serviceKey) return Response.json({ error: 'No disponible' }, { status: 503 });
  const q = new URL(request.url).searchParams;
  const token = q.get('token') ?? '';
  const req = q.get('request') ?? '';
  if (!/^[a-f0-9]{32,80}$/.test(token) || !/^[0-9a-f-]{36}$/.test(req)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: path, error } = await admin.rpc('public_table_pay_qr', { p_token: token, p_request: req });
  if (error || !path) return Response.json({ error: 'No disponible' }, { status: 404 });
  const { data, error: e2 } = await admin.storage.from('sale-files').createSignedUrl(path as string, 300);
  if (e2 || !data) return Response.json({ error: 'No disponible' }, { status: 404 });
  return Response.json({ url: data.signedUrl }, { headers: { 'Cache-Control': 'no-store' } });
}
