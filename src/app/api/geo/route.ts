// País y ciudad aproximada del visitante según su conexión (Vercel lo agrega en cada petición). Sin cookies.
// GET: lo usa la pantalla pública para elegir país y moneda.
// POST: al crear la cuenta, guarda país y ciudad en la organización (solo lo ve soporte y administración de la plataforma).
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function place(req: Request) {
  const country = req.headers.get('x-vercel-ip-country') ?? null;
  let city: string | null = req.headers.get('x-vercel-ip-city');
  if (city) { try { city = decodeURIComponent(city); } catch { /* se deja como llegó */ } }
  return { country, city };
}

export function GET(req: Request) {
  const { country } = place(req);
  return Response.json({ country }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!url || !anonKey || !serviceKey || !token) return Response.json({ ok: false }, { status: 401 });
  const { country, city } = place(req);
  if (!country) return Response.json({ ok: false });

  // La organización es la del usuario que llama (se verifica con su propia sesión)
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: org } = await asUser.from('organizations').select('id, signup_country').limit(1).maybeSingle();
  if (!org || org.signup_country) return Response.json({ ok: false });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  await admin.from('organizations').update({ signup_country: country, signup_city: city?.slice(0, 80) ?? null }).eq('id', org.id).is('signup_country', null);
  return Response.json({ ok: true });
}
