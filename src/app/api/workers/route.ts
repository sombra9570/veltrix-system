// Crea un trabajador (cajero, vendedor, cobrador, supervisor...) con su login real.
// Corre SOLO en el servidor: usa la clave secreta SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ROLES = ['supervisor', 'cashier', 'vendor', 'collector', 'waiter', 'kitchen',
               'technician', 'storekeeper', 'accountant', 'director', 'secretary'];

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  if (!url || !anonKey || !serviceKey) return fail(500, 'Faltan las claves de Supabase en .env.local');

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Sesión no válida');

  let body: { companyId?: string; branchId?: string; name?: string; email?: string; password?: string; role?: string; customRoleId?: string };
  try { body = await request.json(); } catch { return fail(400, 'Datos inválidos'); }
  const { companyId, branchId, name, email, password, customRoleId } = body;
  let role = body.role;
  if (!companyId || !name?.trim() || !email?.trim() || (!role && !customRoleId)) return fail(400, 'Faltan datos del trabajador');
  if (!customRoleId && !ROLES.includes(role as string)) return fail(400, 'Rol no permitido');
  if (!password || password.length < 8) return fail(400, 'La contraseña debe tener al menos 8 caracteres');

  // 1) Quien llama debe ser el DUEÑO de esa empresa (se verifica con su propia sesión y el RLS)
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: company } = await asUser.from('companies').select('id, org_id').eq('id', companyId).maybeSingle();
  if (!company) return fail(403, 'Empresa no encontrada');
  const { data: isOwner } = await asUser.rpc('is_org_owner', { p_org: company.org_id });
  if (!isOwner) return fail(403, 'Solo el administrador puede crear trabajadores');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Rol propio: debe ser de esta empresa; su rol base define la pantalla principal
  if (customRoleId) {
    const { data: cr } = await admin.from('custom_roles').select('id, base_role').eq('id', customRoleId).eq('org_id', company.org_id).is('deleted_at', null).maybeSingle();
    if (!cr) return fail(400, 'Rol propio no encontrado');
    role = cr.base_role as string;
  }

  // Sucursal elegida por el dueño (debe ser de esa empresa); si no eligió, la primera
  let q = admin.from('branches').select('id').eq('company_id', companyId).is('deleted_at', null);
  q = branchId ? q.eq('id', branchId) : q.order('created_at').limit(1);
  const { data: branch } = await q.maybeSingle();
  if (!branch) return fail(400, 'Sucursal no encontrada');

  // 2) Crea el login
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: name.trim() },
  });
  if (authErr || !created.user) return fail(400, authErr?.message ?? 'No se pudo crear el usuario');
  const uid = created.user.id;

  // 3) Perfil + rol en la sucursal (si algo falla, se deshace el login)
  const { error: pErr } = await admin.from('profiles')
    .insert({ id: uid, org_id: company.org_id, full_name: name.trim(), email: email.trim().toLowerCase() });
  const { error: mErr } = pErr ? { error: pErr } : await admin.from('memberships')
    .insert({ org_id: company.org_id, user_id: uid, company_id: companyId, branch_id: branch.id, role, ...(customRoleId ? { custom_role_id: customRoleId } : {}) });
  if (pErr || mErr) {
    await admin.auth.admin.deleteUser(uid);
    return fail(400, (pErr ?? mErr)!.message);
  }

  return Response.json({ id: uid });
}
