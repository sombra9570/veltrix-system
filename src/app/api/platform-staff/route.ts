// Crea una cuenta del equipo de la plataforma (servicio al cliente) con su login real.
// Corre SOLO en el servidor: usa la clave secreta SUPABASE_SERVICE_ROLE_KEY. Solo el superadmin puede llamarla.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FUNCS = ['support', 'technical', 'billing', 'sales', 'accounting'];

function fail(status: number, error: string) { return Response.json({ error }, { status }); }

export async function POST(request: Request) {
  if (!url || !anonKey || !serviceKey) return fail(500, 'Faltan las claves de Supabase');
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Sesión no válida');

  let body: { name?: string; email?: string; password?: string; func?: string; canReply?: boolean; canAssign?: boolean; canSeeOrgs?: boolean; canEditKnowledge?: boolean; canVerifyKnowledge?: boolean };
  try { body = await request.json(); } catch { return fail(400, 'Datos inválidos'); }
  const { name, email, password } = body;
  const func = FUNCS.includes(body.func ?? '') ? (body.func as string) : 'support';
  if (!name?.trim() || !email?.trim()) return fail(400, 'Faltan datos');
  if (!password || password.length < 8) return fail(400, 'La contraseña debe tener al menos 8 caracteres');

  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: isAdmin } = await asUser.rpc('is_platform_admin');
  if (!isAdmin) return fail(403, 'Solo el superadmin puede crear al equipo');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(), password, email_confirm: true, user_metadata: { full_name: name.trim() },
  });
  if (authErr || !created.user) return fail(400, authErr?.message ?? 'No se pudo crear el usuario');
  const uid = created.user.id;

  const { error: pErr } = await admin.from('profiles').insert({ id: uid, org_id: null, full_name: name.trim(), email: email.trim().toLowerCase() });
  const { error: sErr } = pErr ? { error: pErr } : await admin.from('platform_staff').insert({
    user_id: uid, func, can_reply: body.canReply !== false, can_assign: !!body.canAssign, can_see_orgs: body.canSeeOrgs !== false,
    can_edit_knowledge: !!body.canEditKnowledge, can_verify_knowledge: !!body.canVerifyKnowledge,
  });
  if (pErr || sErr) { await admin.auth.admin.deleteUser(uid); return fail(400, (pErr ?? sErr)!.message); }
  return Response.json({ id: uid });
}
