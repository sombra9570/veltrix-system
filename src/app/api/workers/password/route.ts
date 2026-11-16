// El administrador cambia la contraseña de un trabajador de su empresa.
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

  let body: { orgId?: string; userId?: string; password?: string };
  try { body = await request.json(); } catch { return fail(400, 'Datos inválidos'); }
  const { orgId, userId, password } = body;
  if (!orgId || !userId) return fail(400, 'Faltan datos');
  if (!password || password.length < 8) return fail(400, 'La contraseña debe tener al menos 8 caracteres');
  if (password.length > 72) return fail(400, 'La contraseña es demasiado larga');

  // 1) Quien llama debe ser el administrador de esa organización (se verifica con su propia sesión)
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: me } = await asUser.auth.getUser(token);
  if (!me.user) return fail(401, 'Sesión no válida');
  const { data: isOwner } = await asUser.rpc('is_org_owner', { p_org: orgId });
  if (!isOwner) return fail(403, 'Solo el administrador puede cambiar contraseñas');
  if (userId === me.user.id) return fail(400, 'Tu propia contraseña se cambia desde tu cuenta');

  // 2) El destino debe ser un trabajador de ESA organización, nunca un administrador,
  //    y no puede tener cuentas en otras organizaciones (así nadie toca cuentas ajenas)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: ms } = await admin.from('memberships').select('org_id, role').eq('user_id', userId).is('deleted_at', null);
  const mine = (ms ?? []).filter((m) => m.org_id === orgId);
  if (mine.length === 0) return fail(404, 'Trabajador no encontrado');
  if ((ms ?? []).some((m) => m.org_id !== orgId)) return fail(403, 'Esta cuenta pertenece a más de una empresa; debe cambiarla su titular');
  if (mine.some((m) => m.role === 'owner')) return fail(403, 'No se puede cambiar la contraseña de un administrador');
  const { data: sa } = await admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (sa) return fail(403, 'Cuenta protegida');

  // 3) Cambio de contraseña + huella en la auditoría (sin guardar la contraseña)
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return fail(400, error.message);
  await admin.from('audit_log').insert({
    org_id: orgId, table_name: 'auth.users', row_id: userId, action: 'password_reset', actor_id: me.user.id, new_data: {},
  });

  return Response.json({ ok: true });
}
