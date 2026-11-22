// El administrador cambia el nombre y el correo (el usuario de ingreso) de un trabajador de su empresa.
// Sirve para que el cargo siga con todos sus datos aunque cambie la persona que lo ocupa.
// Corre SOLO en el servidor: usa la clave secreta SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  if (!url || !anonKey || !serviceKey) return fail(500, 'Faltan las claves de Supabase');

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Sesión no válida');

  let body: { orgId?: string; userId?: string; name?: string; email?: string };
  try { body = await request.json(); } catch { return fail(400, 'Datos inválidos'); }
  const { orgId, userId } = body;
  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  if (!orgId || !userId) return fail(400, 'Faltan datos');
  if (!name) return fail(400, 'Falta el nombre');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail(400, 'Correo inválido');
  if (name.length > 120) return fail(400, 'Nombre demasiado largo');

  // 1) Quien llama debe ser el administrador de esa organización
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: me } = await asUser.auth.getUser(token);
  if (!me.user) return fail(401, 'Sesión no válida');
  const { data: isOwner } = await asUser.rpc('is_org_owner', { p_org: orgId });
  if (!isOwner) return fail(403, 'Solo el administrador puede cambiar estos datos');
  if (userId === me.user.id) return fail(400, 'Tus propios datos se cambian desde tu cuenta');

  // 2) El destino debe ser trabajador de ESA organización, nunca administrador, sin cuentas en otras empresas
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: ms } = await admin.from('memberships').select('org_id, role').eq('user_id', userId).is('deleted_at', null);
  const mine = (ms ?? []).filter((m) => m.org_id === orgId);
  if (mine.length === 0) return fail(404, 'Trabajador no encontrado');
  if ((ms ?? []).some((m) => m.org_id !== orgId)) return fail(403, 'Esta cuenta pertenece a más de una empresa; debe cambiarla su titular');
  if (mine.some((m) => m.role === 'owner')) return fail(403, 'No se puede cambiar a un administrador');
  const { data: sa } = await admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (sa) return fail(403, 'Cuenta protegida');

  const { data: before } = await admin.from('profiles').select('full_name, email').eq('id', userId).maybeSingle();

  // 3) Cambia el ingreso (correo) y el nombre; el id de la cuenta no cambia, así que el historial se conserva
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email, email_confirm: true, user_metadata: { full_name: name },
  });
  if (error) return fail(400, /already|registered|exists/i.test(error.message) ? 'Ese correo ya está en uso' : error.message);
  const { error: pErr } = await admin.from('profiles').update({ full_name: name, email }).eq('id', userId);
  if (pErr) return fail(400, pErr.message);

  await admin.from('audit_log').insert({
    org_id: orgId, table_name: 'auth.users', row_id: userId, action: 'identity_change', actor_id: me.user.id,
    old_data: { full_name: before?.full_name ?? null, email: before?.email ?? null }, new_data: { full_name: name, email },
  });

  return Response.json({ ok: true });
}
